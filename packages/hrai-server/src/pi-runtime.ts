/**
 * The pi model runtime: providers, models and credentials.
 *
 * pi is the only way the tutor reaches a model. A hosted subscription (openai-codex, Claude,
 * OpenRouter) and a local server (ollama, llama.cpp) are both pi providers, so the rest of the
 * server never asks which kind it is talking to. Credentials are per profile: each signed-in
 * child has an `auth.json` of their own under the data directory, written only by the login
 * flow, and a socket without a profile gets no runtime at all.
 */
import {mkdirSync} from "node:fs";
import {join} from "node:path";
import type {Api, Model} from "@earendil-works/pi-ai";
import {ModelRuntime} from "@earendil-works/pi-coding-agent";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

/** The runtime shared by evals and scripts; a child's socket never uses it. */
export const OPERATOR = "operator";

export function dataDirectory(): string {
    return process.env.HRAI_DATA_DIR ?? ".hrai-data";
}

export function piDirectory(): string {
    return join(dataDirectory(), "pi");
}

/**
 * Where a profile's credentials live.
 * @param userId Profile id, or `OPERATOR` for the shared eval runtime.
 * @returns Path of that profile's `auth.json`.
 */
export function authPathFor(userId: string): string {
    return userId === OPERATOR
        ? process.env.HRAI_PI_AUTH_PATH ?? join(piDirectory(), "auth.json")
        : join(piDirectory(), "users", userId, "auth.json");
}

/**
 * Local model servers, registered as pi providers on every runtime.
 *
 * A server is announced through its host variable. Its models are listed explicitly because a
 * provider with no models cannot be picked; probing the server on start would make the tutor's
 * catalogue depend on whether the server was up at that moment.
 * @returns Provider id to its configuration, in the shape `models.json` uses.
 */
export function localProviders(): Record<string, {baseUrl: string; apiKey: string; models: string[]}> {
    const providers: Record<string, {baseUrl: string; apiKey: string; models: string[]}> = {};
    const entries: [string, string | undefined, string | undefined, string][] = [
        ["ollama", process.env.HRAI_OLLAMA_HOST, process.env.HRAI_OLLAMA_MODELS, "ollama"],
        ["llama", process.env.HRAI_LLAMA_HOST, process.env.HRAI_LLAMA_MODELS, "none"],
    ];
    for (const [id, host, models, apiKey] of entries) {
        if (!host) continue;
        providers[id] = {
            baseUrl: `${host.replace(/\/+$/, "")}/v1`,
            apiKey,
            models: (models ?? "").split(",").map((name) => name.trim()).filter(Boolean),
        };
    }
    return providers;
}

const runtimes = new Map<string, Promise<ModelRuntime>>();

async function createRuntime(userId: string): Promise<ModelRuntime> {
    const authPath = authPathFor(userId);
    mkdirSync(join(authPath, ".."), {recursive: true});
    const runtime = await ModelRuntime.create({
        authPath,
        modelsPath: process.env.HRAI_PI_MODELS_PATH ?? join(piDirectory(), "models.json"),
        modelsStorePath: join(piDirectory(), "models-store.json"),
    });
    for (const [id, provider] of Object.entries(localProviders())) {
        runtime.registerProvider(id, {
            name: id,
            api: "openai-completions",
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            models: provider.models.map((modelId) => ({
                id: modelId,
                name: modelId,
                reasoning: false,
                input: ["text"],
                cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0},
                contextWindow: 32_768,
                maxTokens: 8_192,
            })),
        });
    }
    return runtime;
}

/**
 * The runtime for a profile, created on first use and kept for the process lifetime.
 * @param userId Profile id, or `OPERATOR`.
 * @returns The profile's runtime.
 */
export function runtimeFor(userId: string): Promise<ModelRuntime> {
    let runtime = runtimes.get(userId);
    if (!runtime) {
        runtime = createRuntime(userId);
        runtimes.set(userId, runtime);
    }
    return runtime;
}

/** Drops every cached runtime. Tests only. */
export function resetRuntimes(): void {
    runtimes.clear();
}

export interface ModelRef {
    provider: string;
    modelId: string;
    thinkingLevel?: ThinkingLevel;
}

/**
 * Splits a `provider/model[:thinking]` reference.
 * @param ref The reference as the CLI and the environment write it.
 * @returns Its parts, or null when the reference has no provider.
 */
export function parseModelRef(ref: string): ModelRef | null {
    const slash = ref.indexOf("/");
    if (slash <= 0) return null;
    const provider = ref.slice(0, slash);
    let modelId = ref.slice(slash + 1);
    let thinkingLevel: ThinkingLevel | undefined;
    const colon = modelId.lastIndexOf(":");
    const suffix = colon >= 0 ? modelId.slice(colon + 1) : "";
    if (THINKING_LEVELS.includes(suffix as ThinkingLevel)) {
        thinkingLevel = suffix as ThinkingLevel;
        modelId = modelId.slice(0, colon);
    }
    if (!modelId) return null;
    return {provider, modelId, ...(thinkingLevel ? {thinkingLevel} : {})};
}

export function formatModelRef(ref: ModelRef): string {
    return `${ref.provider}/${ref.modelId}${ref.thinkingLevel ? `:${ref.thinkingLevel}` : ""}`;
}

/**
 * The model the server uses when a profile has not chosen one.
 * @returns A `provider/model[:thinking]` reference.
 */
export function defaultModelRef(): string {
    return process.env.HRAI_PI_MODEL ?? "ollama/qwen3:14b";
}

export interface ResolvedModel {
    model: Model<Api>;
    thinkingLevel: ThinkingLevel;
}

/**
 * Resolves a reference against a runtime's catalogue.
 * @param runtime The profile's runtime.
 * @param ref A `provider/model[:thinking]` reference.
 * @returns The model and the thinking level to run it at.
 * @throws {Error} When the runtime knows no such model.
 */
export function resolveModel(runtime: ModelRuntime, ref: string): ResolvedModel {
    const parsed = parseModelRef(ref);
    if (!parsed) throw new Error(`Model reference "${ref}" needs the form provider/model`);
    // An exact lookup, not the CLI's fuzzy match: a profile that names a model that is gone must
    // hear so, not be quietly answered by whichever model is spelled most alike.
    const model = runtime.getModel(parsed.provider, parsed.modelId);
    if (!model) throw new Error(`Unknown model "${ref}"`);
    const thinkingLevel = parsed.thinkingLevel ?? (model.reasoning ? "low" : "off");
    return {model, thinkingLevel};
}

/**
 * Whether a runtime can call a model right now: it exists and its provider has credentials.
 * @param runtime The profile's runtime.
 * @param ref A `provider/model` reference.
 * @returns True when a call would be attempted.
 */
export async function isModelReachable(runtime: ModelRuntime, ref: string): Promise<boolean> {
    const parsed = parseModelRef(ref);
    if (!parsed) return false;
    try {
        const available = await runtime.getAvailable(parsed.provider);
        return available.some((model) => model.id === parsed.modelId);
    } catch {
        return false;
    }
}
