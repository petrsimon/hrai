/**
 * One question, one answer, through an ephemeral pi session.
 *
 * A game plan, a project title and every eval are a single completion with no memory and no
 * tools. They still go through pi so the same provider, credentials and model catalogue serve
 * them, and they are reported to the transcript as a run so the Záznam tab can show a plan being
 * written.
 */
import {randomUUID} from "node:crypto";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {ThinkingLevel as SessionThinkingLevel} from "@earendil-works/pi-agent-core";
import type {ModelRuntime} from "@earendil-works/pi-coding-agent";
import {
    createAgentSession,
    DefaultResourceLoader,
    SessionManager,
    SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {forwardSessionEvents, isAssistantMessage, textOf} from "./pi-events.ts";
import {piDirectory, type ResolvedModel} from "./pi-runtime.ts";
import {publish} from "./transcript.ts";

const jsonInstruction = "Odpověz pouze JSON objektem, bez prózy a bez ohraničení kódu.";

let sandboxDirectory: string | undefined;

/**
 * An empty directory pi treats as the project. Nothing in it, so no AGENTS.md, no project
 * extensions and no skills can reach a prompt.
 * @returns The directory path.
 */
export function sandboxDir(): string {
    sandboxDirectory ??= mkdtempSync(join(tmpdir(), "hrai-pi-"));
    return sandboxDirectory;
}

/**
 * A resource loader that supplies exactly one thing: the system prompt, verbatim.
 *
 * pi builds its own prompt around whatever the loader overrides — it appends the working
 * directory, for one — so the tutor's prompt is set through the hook pi offers for replacing the
 * prompt of a turn. Reading it through a function lets a persistent session change it between
 * turns, which is how the hint ladder climbs.
 * @param systemPrompt The tutor's instructions for the next turn.
 * @returns A loaded resource loader.
 */
export async function bareResourceLoader(systemPrompt: () => string): Promise<DefaultResourceLoader> {
    const loader = new DefaultResourceLoader({
        cwd: sandboxDir(),
        agentDir: piDirectory(),
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        extensionFactories: [{
            name: "hrai-system-prompt",
            factory: (pi) => {
                pi.on("before_agent_start", () => ({systemPrompt: systemPrompt()}));
            },
        }],
    });
    await loader.reload();
    return loader;
}

export function sessionThinkingLevel(level: ResolvedModel["thinkingLevel"]): SessionThinkingLevel {
    return level;
}

export interface OneShotOptions {
    runtime: ModelRuntime;
    resolved: ResolvedModel;
    system: string;
    user: string;
    json?: boolean;
    /** What the call is for — `plan`, `title`, `eval` — which heads the run in the transcript. */
    purpose: string;
    /** Whose transcript the run is reported under. */
    owner: string;
    onDelta?: (delta: string) => void;
}

export interface Reply {
    text: string;
    seconds: number;
}

/**
 * Runs one completion and returns its text.
 * @param options The model, the prompt and where to report the run.
 * @returns The reply and the seconds it took.
 * @throws {Error} When the provider refused, the model answered nothing, or pi failed.
 */
export async function completeOnce(options: OneShotOptions): Promise<Reply> {
    const started = performance.now();
    const runId = randomUUID().slice(0, 8);
    const modelRef = `${options.resolved.model.provider}/${options.resolved.model.id}`;
    publish(options.owner, {kind: "run_start", runId, purpose: options.purpose, model: modelRef});

    const {session} = await createAgentSession({
        cwd: sandboxDir(),
        agentDir: piDirectory(),
        modelRuntime: options.runtime,
        model: options.resolved.model,
        thinkingLevel: sessionThinkingLevel(options.resolved.thinkingLevel),
        noTools: "all",
        resourceLoader: await bareResourceLoader(() => options.system),
        sessionManager: SessionManager.inMemory(sandboxDir()),
        settingsManager: SettingsManager.inMemory({compaction: {enabled: false}}),
    });

    const stopForwarding = forwardSessionEvents(session, options.owner, runId, () => `${runId}:1`);
    const stopDeltas = options.onDelta
        ? session.subscribe((event) => {
            if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
                options.onDelta?.(event.assistantMessageEvent.delta);
            }
        })
        : () => undefined;

    try {
        await session.prompt(options.json ? `${options.user}\n\n${jsonInstruction}` : options.user);
        const last = [...session.messages].reverse().find(isAssistantMessage);
        if (!last) throw new Error("pi produced no assistant message");
        if (last.stopReason === "error") throw new Error(last.errorMessage ?? "provider error");
        if (last.stopReason === "aborted") throw new Error("run aborted");
        const text = textOf(last.content).trim();
        // An empty answer is a failure the provider did not report as one — a quota, a refusal —
        // and resolving it would hand the child silence dressed up as a reply.
        if (!text) throw new Error(`${modelRef} answered nothing`);
        const seconds = (performance.now() - started) / 1000;
        publish(options.owner, {kind: "run_end", runId, text: `done in ${seconds.toFixed(1)}s, ${text.length} chars`});
        return {text, seconds};
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        publish(options.owner, {kind: "run_end", runId, text: "", error: message});
        throw error;
    } finally {
        stopDeltas();
        stopForwarding();
        session.dispose();
    }
}
