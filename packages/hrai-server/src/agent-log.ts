import {randomUUID} from "node:crypto";
import {appendFileSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";

/**
 * One line of an agent CLI run.
 *
 * `phase` carries the CLI's own event name, `delta` a chunk of the reply as it streams, and `end`
 * closes the run. The server formats nothing for the editor beyond this: the log tab renders these
 * fields directly, so a new backend needs no editor change.
 */
export interface AgentLogEvent {
    runId: string;
    command: string;
    seq: number;
    at: string;
    kind: "start" | "phase" | "thinking" | "delta" | "stderr" | "end";
    text: string;
    /** The CLI's raw line, kept for the log file and the tab's expandable row. */
    detail?: string;
}

export interface AgentRunHandle {
    runId: string;
    event(kind: AgentLogEvent["kind"], text: string, detail?: string): void;
}

const maxRecentEvents = 400;
const listeners = new Set<(event: AgentLogEvent) => void>();
const recent: AgentLogEvent[] = [];
const marks = {start: "=", phase: ".", thinking: "~", delta: ">", stderr: "!", end: "="} as const;

let fileWritable = true;

function logDirectory(): string {
    return join(process.env.HRAI_DATA_DIR ?? ".hrai-data", "agent-log");
}

function logPath(at: string): string {
    return join(logDirectory(), `${at.slice(0, 10)}.jsonl`);
}

function appendToFile(event: AgentLogEvent): void {
    if (!fileWritable) return;
    const path = logPath(event.at);
    try {
        mkdirSync(dirname(path), {recursive: true});
        appendFileSync(path, `${JSON.stringify(event)}\n`);
    } catch (error) {
        // Losing the log must not lose the run; say so once and carry on unlogged.
        fileWritable = false;
        console.warn(`hrai: agent log to ${path} stopped: ${String(error)}`);
    }
}

function mirrorToTrace(event: AgentLogEvent): void {
    const configured = process.env.HRAI_AGENT_TRACE;
    if (!configured || configured === "0" || configured === "off") return;

    const line = `[hrai agent ${event.command} ${event.runId}] ${marks[event.kind]} ${event.text}\n`;
    if (configured === "1" || configured === "stderr") {
        process.stderr.write(line);
        return;
    }
    try {
        mkdirSync(dirname(configured), {recursive: true});
        appendFileSync(configured, line);
    } catch (error) {
        console.warn(`hrai: agent trace to ${configured} stopped: ${String(error)}`);
        process.env.HRAI_AGENT_TRACE = "off";
    }
}

/**
 * Subscribes to agent log events.
 * @param listener Called with each event as it happens.
 * @returns A function that removes the listener.
 */
export function onAgentLog(listener: (event: AgentLogEvent) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Returns the buffered recent events, so a log tab opened mid-run is not empty.
 * @returns Events oldest first.
 */
export function recentAgentLog(): AgentLogEvent[] {
    return [...recent];
}

/**
 * Opens a run and returns the handle its events are reported through.
 * @param command CLI being run.
 * @param summary What the run was asked for, shown as the opening line.
 * @returns A handle that publishes each event.
 */
export function startAgentRun(command: string, summary: string): AgentRunHandle {
    const runId = randomUUID().slice(0, 8);
    let seq = 0;

    const event = (kind: AgentLogEvent["kind"], text: string, detail?: string): void => {
        const entry: AgentLogEvent = {
            runId, command, seq: seq++, at: new Date().toISOString(), kind, text,
            ...(detail === undefined ? {} : {detail}),
        };
        recent.push(entry);
        if (recent.length > maxRecentEvents) recent.shift();
        appendToFile(entry);
        mirrorToTrace(entry);
        for (const listener of listeners) listener(entry);
    };

    event("start", summary);
    return {runId, event};
}

/** Drops buffered events and listeners. Tests only; the server keeps one hub for its lifetime. */
export function resetAgentLog(): void {
    listeners.clear();
    recent.length = 0;
    fileWritable = true;
}
