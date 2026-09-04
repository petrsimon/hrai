/**
 * Client for the local model server.
 *
 * Ollama remains the default because it is convenient for evaluation and local
 * development. llama.cpp exposes an OpenAI-compatible API, so the same tutor can
 * run against its Vulkan server without making the browser aware of the backend.
 */

import {agentLoginHint, isAgentAvailable, runAgent, type AgentBackendId} from "./agent-cli.ts";

export type BackendId = "ollama" | "llama.cpp" | AgentBackendId;

function isAgentBackend(value: string | undefined): value is AgentBackendId {
    return value === "cursor" || value === "pi" || value === "codex";
}

function resolveBackend(value: string | undefined): BackendId {
    if (value === undefined || value === "ollama") return "ollama";
    if (value === "llama.cpp") return "llama.cpp";
    if (isAgentBackend(value)) return value;
    throw new Error(`Unsupported HRAI_MODEL_BACKEND: ${String(value)}`);
}

export function defaultBackend(): BackendId {
    return resolveBackend(process.env.HRAI_MODEL_BACKEND);
}

/**
 * Measured floor for the original evaluation suite. Resolved without `defaultBackend()` so that an
 * unsupported backend surfaces when a call is made, not when this module is imported.
 */
export const EVAL_MODEL =
    process.env.HRAI_EVAL_MODEL ??
    (isAgentBackend(process.env.HRAI_MODEL_BACKEND)
        // HRAI_AGENT_MODEL names a model for an agent CLI, so it must not reach a server backend.
        ? process.env.HRAI_AGENT_MODEL ?? ""
        : "qwen3:14b");

function perBackendEnv(backend: BackendId): string | undefined {
    const envKey: Record<BackendId, string> = {
        ollama: "HRAI_OLLAMA_MODEL",
        "llama.cpp": "HRAI_LLAMA_MODEL",
        cursor: "HRAI_CURSOR_MODEL",
        pi: "HRAI_PI_MODEL",
        codex: "HRAI_CODEX_MODEL",
    };
    return process.env[envKey[backend]];
}

/**
 * Default model for a backend.
 *
 * A backend-specific model environment variable takes priority. The remaining model environment
 * variables configure the backend the environment selected, so only that one takes them. A backend
 * chosen at runtime falls back to its own default instead of inheriting a name meant for another:
 * `qwen3:14b` would be rejected by `cursor-agent`, and an agent model name means nothing to ollama.
 * The empty string means "let the CLI pick", and leaves `--model` off.
 * @param backend Backend whose default model is needed.
 * @returns The model name, or the empty string for the CLI's own default.
 */
export function defaultModelFor(backend: BackendId): string {
    return perBackendEnv(backend) ??
        (backend === defaultBackend() ? EVAL_MODEL : isAgentBackend(backend) ? "" : "qwen3:14b");
}

/**
 * An empty model name means the agent CLI chooses, so the flag must be omitted entirely.
 * @param model Configured model name.
 * @returns The name to pass the CLI, or undefined to leave `--model` off.
 */
function agentModel(model: string): string | undefined {
    return model === "" ? undefined : model;
}

export interface Reply {
    text: string;
    seconds: number;
}

interface OllamaTagsResponse {
    models?: { name: string }[];
}

interface OpenAIModelsResponse {
    data?: { id: string }[];
}

interface OpenAIChatResponse {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
}

interface OllamaChatResponse {
    message?: { content?: string };
    done_reason?: string;
}

interface OpenAIStreamChunk {
    choices?: { delta?: { content?: string } }[];
}

/**
 * Resolves the HTTP host for one of the two server backends.
 *
 * `HRAI_MODEL_HOST` and `HRAI_EVAL_HOST` configure whichever backend the environment selected, so
 * they apply only to that one. A per-call override reaches a different backend and must use that
 * backend's own variable — otherwise switching provider at runtime would send the request to the
 * host belonging to the other one.
 * @param backend Backend whose host is needed.
 * @returns The base URL to call.
 */
export function hostFor(backend: BackendId): string {
    const backendHost =
        backend === "ollama" ? process.env.HRAI_OLLAMA_HOST : process.env.HRAI_LLAMA_HOST;
    const fallback = backend === "ollama" ? "http://localhost:11434" : "http://localhost:8080";
    if (backend !== defaultBackend()) return backendHost ?? fallback;

    return process.env.HRAI_MODEL_HOST ?? process.env.HRAI_EVAL_HOST ?? backendHost ?? fallback;
}

function modelMatches(available: string, requested: string): boolean {
    return available === requested || available.includes(requested) || requested.includes(available);
}

/**
 * Checks whether a backend can serve the requested model.
 * @param model Model name; ignored for agent CLIs, which cannot list models per account.
 * @param backend Model backend to check; defaults to the configured one.
 * @returns Whether the backend is reachable and has the model.
 */
export async function isModelAvailable(model: string, backend: BackendId = defaultBackend()): Promise<boolean> {
    if (isAgentBackend(backend)) {
        // Agent CLIs cannot cheaply check availability for an individual model account.
        return isAgentAvailable(backend);
    }

    const host = hostFor(backend);
    try {
        if (backend === "llama.cpp") {
            const res = await fetch(`${host}/v1/models`, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) return false;
            const body = (await res.json()) as OpenAIModelsResponse;
            return (body.data ?? []).some((entry) => modelMatches(entry.id, model));
        }

        const res = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return false;
        const body = (await res.json()) as OllamaTagsResponse;
        return (body.models ?? []).some((entry) => modelMatches(entry.name, model));
    } catch {
        return false;
    }
}

function ollamaRequestBody(system: string, user: string, stream: boolean, model: string, json: boolean) {
    return {
        model,
        stream,
        think: false,
        ...(json ? { format: "json" } : {}),
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        options: { temperature: 0, num_ctx: 8192 },
    };
}

function llamaRequestBody(system: string, user: string, stream: boolean, model: string, json: boolean) {
    return {
        model,
        stream,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        temperature: 0,
        max_tokens: json ? 1536 : 512,
        // Qwen3.5 otherwise emits a long reasoning trace before the tutor reply.
        chat_template_kwargs: { enable_thinking: false },
    };
}

function requestUrl(backend: BackendId, host: string): string {
    return backend === "llama.cpp" ? `${host}/v1/chat/completions` : `${host}/api/chat`;
}

function requestBody(
    system: string,
    user: string,
    stream: boolean,
    model: string,
    backend: BackendId,
    json = false,
) {
    return backend === "llama.cpp"
        ? llamaRequestBody(system, user, stream, model, json)
        : ollamaRequestBody(system, user, stream, model, json);
}

async function* responseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    let buffered = "";
    for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
        buffered += decoder.decode(chunk, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) yield line;
    }
    buffered += decoder.decode();
    if (buffered) yield buffered;
}

function streamDelta(line: string): string | null {
    const data = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (!data || data === "[DONE]") return null;
    const parsed = JSON.parse(data) as OpenAIStreamChunk;
    return parsed.choices?.[0]?.delta?.content ?? null;
}

/**
 * Streams a reply, invoking `onDelta` for each chunk as it arrives.
 * @param system System prompt.
 * @param user User turn.
 * @param onDelta Called with each token chunk in order.
 * @param model Model name.
 * @param backend Model backend to use; defaults to the configured one.
 * @returns The complete text and elapsed seconds.
 */
export async function chatStream(
    system: string,
    user: string,
    onDelta: (delta: string) => void,
    model = EVAL_MODEL,
    backend: BackendId = defaultBackend(),
): Promise<Reply> {
    if (isAgentBackend(backend)) {
        return runAgent(backend, {system, user, model: agentModel(model)}, onDelta);
    }

    const started = performance.now();
    const host = hostFor(backend);
    const res = await fetch(requestUrl(backend, host), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(system, user, true, model, backend)),
    });
    if (!res.ok) throw new Error(`${host} returned ${res.status} ${res.statusText}`);
    if (!res.body) throw new Error(`${host} returned no body`);

    let full = "";
    if (backend === "llama.cpp") {
        for await (const line of responseLines(res.body)) {
            if (!line.trim()) continue;
            const delta = streamDelta(line);
            if (delta) {
                full += delta;
                onDelta(delta);
            }
        }
    } else {
        for await (const line of responseLines(res.body)) {
            if (!line.trim()) continue;
            const parsed = JSON.parse(line) as { message?: { content?: string } };
            const delta = parsed.message?.content;
            if (delta) {
                full += delta;
                onDelta(delta);
            }
        }
    }
    return { text: full.trim(), seconds: (performance.now() - started) / 1000 };
}

async function complete(
    system: string,
    user: string,
    model: string,
    backend: BackendId,
    json: boolean,
): Promise<Reply> {
    const started = performance.now();
    const host = hostFor(backend);
    const res = await fetch(requestUrl(backend, host), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(system, user, false, model, backend, json)),
    });
    if (!res.ok) throw new Error(`${host} returned ${res.status} ${res.statusText}`);
    const body = (await res.json()) as OpenAIChatResponse | OllamaChatResponse;
    const finishReason = backend === "llama.cpp"
        ? (body as OpenAIChatResponse).choices?.[0]?.finish_reason
        : (body as OllamaChatResponse).done_reason;
    if (finishReason === "length") {
        throw new Error(`${host} response was truncated at the model token limit`);
    }
    const text = backend === "llama.cpp"
        ? (body as OpenAIChatResponse).choices?.[0]?.message?.content
        : (body as OllamaChatResponse).message?.content;
    if (typeof text !== "string") throw new Error(`${host} returned no message content`);
    return { text: text.trim(), seconds: (performance.now() - started) / 1000 };
}

export async function chat(
    system: string,
    user: string,
    model = EVAL_MODEL,
    backend: BackendId = defaultBackend(),
): Promise<Reply> {
    if (isAgentBackend(backend)) return runAgent(backend, {system, user, model: agentModel(model)});
    return complete(system, user, model, backend, false);
}

/**
 * Requests a non-streamed JSON object using the backend's structured-output mode.
 * @param system System prompt.
 * @param user User turn.
 * @param model Model name.
 * @param backend Model backend to use; defaults to the configured one.
 * @returns JSON text and elapsed seconds.
 */
export async function chatJson(
    system: string,
    user: string,
    model = EVAL_MODEL,
    backend: BackendId = defaultBackend(),
): Promise<Reply> {
    if (isAgentBackend(backend)) return runAgent(backend, {system, user, model: agentModel(model), json: true});
    return complete(system, user, model, backend, true);
}

/**
 * Explains, once, why a suite is skipping. The plan requires an absent fixture
 * or model to skip loudly — a silent pass here would mean nobody notices the
 * evals stopped running at all.
 * @param model The model that could not be reached.
 * @param backend Model backend to use; defaults to the configured one.
 */
export function warnSkipped(model: string, backend: BackendId = defaultBackend()): void {
    const host = isAgentBackend(backend) ? backend : hostFor(backend);
    let startCommand: string;
    if (isAgentBackend(backend)) {
        startCommand = agentLoginHint(backend);
    } else if (backend === "llama.cpp") {
        startCommand = `llama serve -hf <model-repository> (requested ${model})`;
    } else {
        startCommand = `ollama serve`;
    }
    const subject = isAgentBackend(backend) && model === ""
        ? `the ${backend} CLI`
        : `model "${model}"`;
    process.stderr.write(
        `\n  SKIPPED: ${subject} is not available at ${host}.\n` +
            `  Start it with \`${startCommand}\`,\n` +
            `  or point HRAI_MODEL_BACKEND / HRAI_MODEL_HOST / HRAI_EVAL_MODEL elsewhere.\n` +
            `  These evals never pass silently — a green run that tested nothing is worse than a red one.\n\n`,
    );
}
