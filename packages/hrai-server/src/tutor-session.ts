/**
 * A child's tutor agent: one pi session per profile and project, kept on disk.
 *
 * The session remembers the conversation across reconnects, milestones and lessons — the child
 * keeps talking to the same tutor. Two editor tabs on the same project share one instance, and
 * one prompt runs at a time. The hrai `Session` (workspace, rung, plan) still belongs to the
 * socket; it is handed to the tools for the duration of a turn.
 */
import {mkdirSync, readdirSync} from "node:fs";
import {join} from "node:path";
import type {AgentSession, ModelRuntime} from "@earendil-works/pi-coding-agent";
import {createAgentSession, SessionManager, SettingsManager} from "@earendil-works/pi-coding-agent";
import {forwardSessionEvents, historyEvents} from "./pi-events.ts";
import {bareResourceLoader, sandboxDir, sessionThinkingLevel} from "./pi-one-shot.ts";
import {piDirectory, type ResolvedModel} from "./pi-runtime.ts";
import type {Session} from "./session.ts";
import {publish, type TranscriptPayload} from "./transcript.ts";
import {createTutorTools, TUTOR_TOOL_NAMES, type ChildMessage, type ToolTurn} from "./tutor-tools.ts";

/** How long an instance outlives its last socket, so a reload does not reopen the file. */
const IDLE_DISPOSE_MS = 5 * 60_000;

export interface TurnRequest {
    session: Session;
    rung: number;
    systemPrompt: string;
    userPrompt: string;
    /** What the child actually typed, shown in Záznam ahead of the assembled prompt. */
    question: string;
}

export interface TurnResult {
    /** The message `tell_child` delivered, or null when the agent ended the turn without it. */
    message: ChildMessage | null;
    /** The agent's final prose, for the log when it forgot the tool. */
    prose: string;
    error?: string;
}

/**
 * The directory a profile's sessions for one project live in.
 * @param userId Profile id.
 * @param projectId The editor's project id; `unsaved` before the project has one.
 * @returns A directory under the data directory.
 */
export function sessionDirFor(userId: string, projectId: string): string {
    return join(piDirectory(), "sessions", userId, projectId);
}

function newestSessionFile(directory: string): string | undefined {
    const files = readdirSync(directory).filter((name) => name.endsWith(".jsonl")).sort();
    const newest = files.at(-1);
    return newest === undefined ? undefined : join(directory, newest);
}

export class TutorSession {
    private turn: ToolTurn | null = null;
    private systemPrompt = "";
    private turnCount = 0;
    private busy = false;
    private sockets = 0;
    private idleTimer: NodeJS.Timeout | undefined;
    private readonly stopForwarding: () => void;

    private constructor(
        readonly key: string,
        readonly owner: string,
        private readonly pi: AgentSession,
        private readonly onDispose: () => void,
    ) {
        this.stopForwarding = forwardSessionEvents(pi, owner, undefined, () => `t${this.turnCount}`);
    }

    /**
     * Opens the session for a profile and project, resuming the newest file when one exists.
     * @param options Whose session, on which runtime and model.
     * @param options.userId Profile id, which owns the transcript.
     * @param options.projectId The editor's project id.
     * @param options.runtime The profile's runtime.
     * @param options.resolved The model to run.
     * @param options.onDispose Called once the instance has been disposed.
     * @returns The session, ready for a turn.
     */
    static async open(options: {
        userId: string;
        projectId: string;
        runtime: ModelRuntime;
        resolved: ResolvedModel;
        onDispose: () => void;
    }): Promise<TutorSession> {
        const directory = sessionDirFor(options.userId, options.projectId);
        mkdirSync(directory, {recursive: true});
        const existing = newestSessionFile(directory);
        const sessionManager = existing === undefined
            ? SessionManager.create(sandboxDir(), directory)
            : SessionManager.open(existing, directory);

        // The tools and the loader are built before the instance exists; they read it lazily.
        const late: {instance?: TutorSession} = {};
        const tools = createTutorTools(() => {
            if (!late.instance?.turn) throw new Error("hrai: a tutor tool ran outside a turn");
            return late.instance.turn;
        });
        const {session} = await createAgentSession({
            cwd: sandboxDir(),
            agentDir: piDirectory(),
            modelRuntime: options.runtime,
            model: options.resolved.model,
            thinkingLevel: sessionThinkingLevel(options.resolved.thinkingLevel),
            noTools: "builtin",
            tools: TUTOR_TOOL_NAMES,
            customTools: tools,
            resourceLoader: await bareResourceLoader(() => late.instance?.systemPrompt ?? ""),
            sessionManager,
            settingsManager: SettingsManager.inMemory({compaction: {enabled: true}}),
        });
        late.instance = new TutorSession(`${options.userId}:${options.projectId}`, options.userId, session, options.onDispose);
        return late.instance;
    }

    get isBusy(): boolean {
        return this.busy;
    }

    /**
     * Transcript events for everything the session file holds, for a tab that just connected.
     * @returns Events oldest first, without bookkeeping fields.
     */
    history(): TranscriptPayload[] {
        return historyEvents(this.pi.messages);
    }

    /**
     * Points the session at a model, when the profile changed its preference.
     * @param resolved The model to run from now on.
     */
    async useModel(resolved: ResolvedModel): Promise<void> {
        const current = this.pi.model;
        if (current?.provider !== resolved.model.provider || current.id !== resolved.model.id) {
            await this.pi.setModel(resolved.model);
        }
        if (this.pi.thinkingLevel !== resolved.thinkingLevel) {
            this.pi.setThinkingLevel(sessionThinkingLevel(resolved.thinkingLevel));
        }
    }

    /**
     * Runs one turn: the question goes to the agent, the tools see the child's project, and the
     * message `tell_child` delivered comes back.
     * @param request The prompt and the state the tools read.
     * @returns The delivered message, or null with the agent's prose when it forgot the tool.
     * @throws {Error} When a turn is already running.
     */
    async ask(request: TurnRequest): Promise<TurnResult> {
        if (this.busy) throw new Error("hrai: a tutor turn is already running");
        this.busy = true;
        this.turnCount += 1;
        const turnId = `t${this.turnCount}`;
        this.turn = {session: request.session, rung: request.rung, delivered: null};
        this.systemPrompt = request.systemPrompt;
        publish(this.owner, {kind: "user", turnId, text: request.question});
        try {
            await this.pi.prompt(request.userPrompt);
            const last = [...this.pi.messages].reverse().find((message) => message.role === "assistant");
            const prose = last && "content" in last && Array.isArray(last.content)
                ? last.content.filter((part) => part.type === "text").map((part) => part.text).join("").trim()
                : "";
            const errorMessage = last && "errorMessage" in last ? last.errorMessage : undefined;
            const stopReason = last && "stopReason" in last ? last.stopReason : undefined;
            const result: TurnResult = {message: this.turn.delivered, prose};
            if (stopReason === "error") result.error = errorMessage ?? "provider error";
            else if (stopReason === "aborted") result.error = "turn aborted";
            return result;
        } finally {
            this.turn = null;
            this.busy = false;
        }
    }

    /**
     * Stops the running turn, if any; the turn's promise then resolves with `aborted`.
     * @returns Once pi has stopped.
     */
    abort(): Promise<void> {
        return this.pi.abort();
    }

    /** A socket started using this instance. */
    attach(): void {
        this.sockets += 1;
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
    }

    /** A socket stopped using this instance; it is disposed once nobody returns. */
    detach(): void {
        this.sockets = Math.max(0, this.sockets - 1);
        if (this.sockets > 0) return;
        this.idleTimer = setTimeout(() => this.dispose(), IDLE_DISPOSE_MS);
        this.idleTimer.unref();
    }

    dispose(): void {
        if (this.idleTimer) clearTimeout(this.idleTimer);
        this.stopForwarding();
        this.pi.dispose();
        this.onDispose();
    }
}

const instances = new Map<string, Promise<TutorSession>>();

/**
 * The shared instance for a profile and project, opened on first use.
 * @param options Whose session, on which runtime and model.
 * @param options.userId Profile id.
 * @param options.projectId The editor's project id.
 * @param options.runtime The profile's runtime.
 * @param options.resolved The model to run.
 * @returns The instance, with the caller attached to it.
 */
export async function tutorSessionFor(options: {
    userId: string;
    projectId: string;
    runtime: ModelRuntime;
    resolved: ResolvedModel;
}): Promise<TutorSession> {
    const key = `${options.userId}:${options.projectId}`;
    let pending = instances.get(key);
    if (!pending) {
        pending = TutorSession.open({...options, onDispose: () => instances.delete(key)});
        instances.set(key, pending);
        pending.catch(() => instances.delete(key));
    }
    const instance = await pending;
    instance.attach();
    return instance;
}

/** Disposes every open instance. Tests and shutdown. */
export async function disposeTutorSessions(): Promise<void> {
    const open = [...instances.values()];
    instances.clear();
    for (const pending of open) {
        try {
            (await pending).dispose();
        } catch {
            // An instance that failed to open has nothing to dispose.
        }
    }
}
