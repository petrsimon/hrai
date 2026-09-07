import {appendFileSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";

/**
 * What the agent did, as the editor's Záznam tab and the log file see it.
 *
 * Every event belongs to an owner — a child's tutor session, keyed `<userId>:<projectId>` — so a
 * socket subscribes to its own owner and sees nothing of another child's. A one-shot run (a game
 * plan, a project title, an eval) is reported under the owner that asked for it, tagged with its
 * `runId` so the tab can group it.
 */
export type TranscriptEvent = {
    owner: string;
    seq: number;
    at: string;
    /** Set for the events of one ephemeral run; absent for the child's own session. */
    runId?: string;
} & (
    | {kind: "run_start"; purpose: string; model: string}
    | {kind: "run_end"; text: string; error?: string}
    | {kind: "user"; turnId: string; text: string}
    | {kind: "assistant_delta"; turnId: string; delta: string}
    | {kind: "thinking_delta"; turnId: string; delta: string}
    | {kind: "tool_start"; turnId: string; callId: string; name: string; args: unknown}
    | {kind: "tool_end"; turnId: string; callId: string; result: string; isError: boolean}
    | {kind: "turn_end"; turnId: string; stopReason: string; model?: string; errorMessage?: string}
    | {kind: "note"; text: string}
);

export type TranscriptPayload = TranscriptEvent extends infer E
    ? E extends TranscriptEvent ? Omit<E, "owner" | "seq" | "at"> : never
    : never;

const maxRecentEvents = 2_000;
const listeners = new Map<string, Set<(event: TranscriptEvent) => void>>();
const recent: TranscriptEvent[] = [];
let seq = 0;
let fileWritable = true;

function logPath(at: string): string {
    return join(process.env.HRAI_DATA_DIR ?? ".hrai-data", "agent-log", `${at.slice(0, 10)}.jsonl`);
}

function appendToFile(event: TranscriptEvent): void {
    if (!fileWritable) return;
    const path = logPath(event.at);
    try {
        mkdirSync(dirname(path), {recursive: true});
        appendFileSync(path, `${JSON.stringify(event)}\n`);
    } catch (error) {
        // Losing the log must not lose the turn; say so once and carry on unlogged.
        fileWritable = false;
        console.warn(`hrai: agent log to ${path} stopped: ${String(error)}`);
    }
}

/** Reply and reasoning arrive in fragments; the terminal gets them a line at a time. */
const pendingLines = new Map<string, string>();

function traceLine(event: TranscriptEvent): string | null {
    const tag = `[hrai ${event.runId ? `run ${event.runId}` : event.owner}]`;
    switch (event.kind) {
        case "run_start": return `${tag} = ${event.purpose} · ${event.model}`;
        case "run_end": return `${tag} = ${event.error ? `failed: ${event.error}` : event.text}`;
        case "user": return `${tag} < ${event.text.split("\n")[0]}`;
        case "tool_start": return `${tag} + ${event.name} ${JSON.stringify(event.args)}`;
        case "tool_end": return `${tag} ${event.isError ? "!" : "-"} ${event.result.split("\n")[0]}`;
        case "turn_end": return `${tag} = ${event.stopReason}${event.errorMessage ? `: ${event.errorMessage}` : ""}`;
        case "note": return `${tag} ! ${event.text}`;
        case "assistant_delta":
        case "thinking_delta": {
            const key = `${event.owner}:${event.runId ?? ""}:${event.kind}`;
            const mark = event.kind === "assistant_delta" ? ">" : "~";
            const text = (pendingLines.get(key) ?? "") + event.delta;
            const lines = text.split("\n");
            pendingLines.set(key, lines.pop() ?? "");
            const complete = lines.map((line) => line.trim()).filter(Boolean);
            return complete.length ? complete.map((line) => `${tag} ${mark} ${line}`).join("\n") : null;
        }
    }
}

function mirrorToTrace(event: TranscriptEvent): void {
    const configured = process.env.HRAI_AGENT_TRACE;
    if (!configured || configured === "0" || configured === "off") return;
    const line = traceLine(event);
    if (line === null) return;
    if (configured === "1" || configured === "stderr") {
        process.stderr.write(`${line}\n`);
        return;
    }
    try {
        mkdirSync(dirname(configured), {recursive: true});
        appendFileSync(configured, `${line}\n`);
    } catch (error) {
        console.warn(`hrai: agent trace to ${configured} stopped: ${String(error)}`);
        process.env.HRAI_AGENT_TRACE = "off";
    }
}

/**
 * Publishes one event to the file, the trace and the owner's listeners.
 * @param owner Whose transcript this belongs to.
 * @param payload The event without its bookkeeping fields.
 * @returns The published event.
 */
export function publish(owner: string, payload: TranscriptPayload): TranscriptEvent {
    const event: TranscriptEvent = {owner, seq: seq++, at: new Date().toISOString(), ...payload};
    recent.push(event);
    if (recent.length > maxRecentEvents) recent.shift();
    appendToFile(event);
    mirrorToTrace(event);
    for (const listener of listeners.get(owner) ?? []) listener(event);
    return event;
}

/**
 * Subscribes to one owner's events.
 * @param owner Whose transcript to follow.
 * @param listener Called with each event as it happens.
 * @returns A function that removes the listener.
 */
export function subscribe(owner: string, listener: (event: TranscriptEvent) => void): () => void {
    let set = listeners.get(owner);
    if (!set) {
        set = new Set();
        listeners.set(owner, set);
    }
    set.add(listener);
    return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(owner);
    };
}

/**
 * Buffered run events for an owner, so a tab opened mid-run is not empty. Session turns are not
 * included: those are rebuilt from the session file, which is the record.
 * @param owner Whose runs to return.
 * @returns Events oldest first.
 */
export function recentRuns(owner: string): TranscriptEvent[] {
    return recent.filter((event) => event.owner === owner && event.runId !== undefined);
}

/** Drops buffered events and listeners. Tests only. */
export function resetTranscript(): void {
    listeners.clear();
    recent.length = 0;
    pendingLines.clear();
    fileWritable = true;
}
