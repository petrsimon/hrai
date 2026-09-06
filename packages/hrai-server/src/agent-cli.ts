import {execFile, spawn} from "node:child_process";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {startAgentRun} from "./agent-log.ts";
import type {Reply} from "./model-client.ts";

const execFileAsync = promisify(execFile);
const execTimeoutMs = 5_000;
const defaultAgentTimeoutMs = 120_000;
const maxStderrBytes = 4096;
const sigkillGraceMs = 2_000;
const jsonInstruction = "Reply with only the JSON object and no prose or code fences.";

export type AgentBackendId = "cursor" | "pi" | "codex";

interface AgentOptions {
    system: string;
    user: string;
    model?: string;
    json: boolean;
    cwd: string;
}

/**
 * Sizes a prompt for the log header, rounded so the line stays short.
 * @param system The instructions the tutor sends ahead of the turn.
 * @param user The turn itself, carrying the rendered project.
 * @returns A size in bytes or kilobytes.
 */
function promptSize(system: string, user: string): string {
    const bytes = system.length + user.length;
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
}

interface AgentSpec {
    command: string;
    /**
     * Argv that exits 0 only when the CLI is usable. Where the CLI can report its login state
     * cheaply, this checks that too: a logged-out CLI that answers `--version` would otherwise look
     * available and the child would meet a spawn failure instead of a fallback.
     */
    probeArgs: string[];
    args(options: AgentOptions): string[];
    /**
     * The name of what the CLI just reported. CLIs wrap their real event in an envelope — pi sends
     * every one of them as `message_update` — so the log names the event inside it.
     */
    phaseName(event: unknown): string | null;
    /** The model's reasoning, which is worth reading but is not part of the reply. */
    thinking(event: unknown): string | null;
    delta(event: unknown): string | null;
    final(event: unknown): string | null;
    error(event: unknown): string | null;
    loginHint: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

function textContent(value: unknown): string {
    if (!Array.isArray(value)) return "";

    let text = "";
    for (const entryValue of value) {
        const entry = asRecord(entryValue);
        if (entry?.type === "text" && typeof entry.text === "string") {
            text += entry.text;
        }
    }
    return text;
}

function promptWithJsonInstruction(user: string, json: boolean): string {
    return json ? `${user}\n\n${jsonInstruction}` : user;
}

function combinedPrompt(system: string, user: string): string {
    return `${system}\n\n---\n\n${user}`;
}

const agentSpecs: Record<AgentBackendId, AgentSpec> = {
    pi: {
        command: "pi",
        // `pi auth check` needs a provider or model, so there is no account-wide check to make here.
        probeArgs: ["--version"],
        args: ({system, user, model, json}) => [
            "-p",
            "--mode",
            "json",
            "--no-tools",
            "--no-session",
            "--no-context-files",
            "--no-extensions",
            "--no-skills",
            "--system-prompt",
            system,
            ...(model === undefined ? [] : ["--model", model]),
            "--",
            promptWithJsonInstruction(user, json),
        ],
        phaseName: (event) => {
            const record = asRecord(event);
            const messageEvent = asRecord(record?.assistantMessageEvent);
            const name = messageEvent?.type ?? record?.type;
            return typeof name === "string" ? name : null;
        },
        thinking: (event) => {
            const messageEvent = asRecord(asRecord(event)?.assistantMessageEvent);
            return messageEvent?.type === "thinking_delta" && typeof messageEvent.delta === "string"
                ? messageEvent.delta
                : null;
        },
        delta: (event) => {
            const record = asRecord(event);
            const messageEvent = asRecord(record?.assistantMessageEvent);
            return record?.type === "message_update" &&
                messageEvent?.type === "text_delta" &&
                typeof messageEvent.delta === "string"
                ? messageEvent.delta
                : null;
        },
        final: (event) => {
            const record = asRecord(event);
            const message = asRecord(record?.message);
            return record?.type === "message_end" && message?.role === "assistant"
                ? textContent(message.content)
                : null;
        },
        error: (event) => {
            // pi reports a provider refusal inside the message and still exits 0, so a rejected
            // model or an exhausted quota arrives as an empty answer unless this is read.
            const message = asRecord(asRecord(event)?.message);
            return message?.stopReason === "error" && typeof message.errorMessage === "string"
                ? message.errorMessage
                : null;
        },
        loginHint: "pi auth",
    },
    cursor: {
        command: "cursor-agent",
        probeArgs: ["status"],
        args: ({system, user, model, json}) => [
            "-p",
            "--mode",
            "ask",
            "--trust",
            "--output-format",
            "stream-json",
            "--stream-partial-output",
            ...(model === undefined ? [] : ["--model", model]),
            combinedPrompt(system, promptWithJsonInstruction(user, json)),
        ],
        phaseName: (event) => {
            const type = asRecord(event)?.type;
            return typeof type === "string" ? type : null;
        },
        thinking: (event) => {
            const record = asRecord(event);
            const message = asRecord(record?.message);
            return record?.type === "thinking" && message ? textContent(message.content) || null : null;
        },
        delta: (event) => {
            const record = asRecord(event);
            const message = asRecord(record?.message);
            return record?.type === "assistant" &&
                typeof record.timestamp_ms === "number" &&
                message?.role === "assistant"
                ? textContent(message.content)
                : null;
        },
        final: (event) => {
            const record = asRecord(event);
            return record?.type === "result" && typeof record.result === "string" ? record.result : null;
        },
        error: (event) => {
            const record = asRecord(event);
            return record?.type === "result" && record.is_error === true && typeof record.result === "string"
                ? record.result
                : null;
        },
        loginHint: "cursor-agent login",
    },
    codex: {
        command: "codex",
        probeArgs: ["login", "status"],
        args: ({system, user, model, json, cwd}) => [
            "exec",
            "--json",
            "-s",
            "read-only",
            "--ephemeral",
            "--skip-git-repo-check",
            "--ignore-rules",
            "-C",
            cwd,
            ...(model === undefined ? [] : ["-m", model]),
            combinedPrompt(system, promptWithJsonInstruction(user, json)),
        ],
        phaseName: (event) => {
            const record = asRecord(event);
            const item = asRecord(record?.item);
            const type = record?.type;
            if (typeof type !== "string") return null;
            return typeof item?.type === "string" ? `${type} ${item.type}` : type;
        },
        thinking: (event) => {
            const item = asRecord(asRecord(event)?.item);
            return item?.type === "reasoning" && typeof item.text === "string" ? item.text : null;
        },
        delta: () => null,
        final: (event) => {
            const record = asRecord(event);
            const item = asRecord(record?.item);
            return record?.type === "item.completed" &&
                item?.type === "agent_message" &&
                typeof item.text === "string"
                ? item.text
                : null;
        },
        error: () => null,
        loginHint: "codex login",
    },
};

let defaultSandboxDir: string | undefined;

function getSandboxDir(): string {
    const configuredDir = process.env.HRAI_AGENT_CWD;
    if (configuredDir) return configuredDir;
    defaultSandboxDir ??= mkdtempSync(join(tmpdir(), "hrai-agent-"));
    return defaultSandboxDir;
}

function getTimeoutMs(): number {
    // A blank or non-numeric value would otherwise become 0 or NaN and fire the timer immediately.
    const configured = Number(process.env.HRAI_AGENT_TIMEOUT_MS);
    return Number.isFinite(configured) && configured > 0 ? configured : defaultAgentTimeoutMs;
}

const maxFieldLength = 160;

function fieldValue(value: unknown): string {
    if (Array.isArray(value)) {
        const named = value.map((entry) => {
            const record = asRecord(entry);
            const name = record?.title ?? record?.name ?? record?.id;
            return typeof name === "string" ? name : null;
        });
        return named.every((name) => name !== null)
            ? `${value.length} (${named.join(", ")})`
            : `${value.length} items`;
    }
    const record = asRecord(value);
    if (record) return `{${Object.keys(record).join(", ")}}`;
    return String(value);
}

/**
 * Renders a reply as the lines a person reads.
 *
 * A JSON answer — a game plan, a project title — is one long line of braces that tells a reader
 * nothing, so each field is given its own line and long values are cut.
 * @param text The reply as the CLI produced it.
 * @returns Lines to log in place of the raw reply.
 */
function replyLines(text: string): string[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text) as unknown;
    } catch {
        return text.split("\n").map((line) => line.trim()).filter(Boolean);
    }

    const record = asRecord(parsed);
    if (!record) return [fieldValue(parsed)];

    return Object.entries(record).map(([key, value]) => {
        const rendered = fieldValue(value);
        return `${key}: ${rendered.length > maxFieldLength ? `${rendered.slice(0, maxFieldLength)}…` : rendered}`;
    });
}

function dataToBytes(data: Buffer | string): Buffer {
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

/**
 * Runs a chat completion through a locally installed agent CLI.
 * @param backend Agent CLI to run.
 * @param options System prompt, user turn, optional model, and JSON mode.
 * @param options.system System prompt.
 * @param options.user User turn.
 * @param options.model Model name passed to the CLI; omitted uses the CLI's own default.
 * @param options.json Whether to ask for a bare JSON object.
 * @param options.purpose What the call is for, which heads the run in the log.
 * @param onDelta Called with each incremental text chunk in order.
 * @returns The complete text and elapsed seconds.
 */
export async function runAgent(
    backend: AgentBackendId,
    options: {system: string; user: string; model?: string; json?: boolean; purpose?: string},
    onDelta?: (delta: string) => void,
): Promise<Reply> {
    const started = performance.now();
    const spec = agentSpecs[backend];
    const cwd = getSandboxDir();
    // The header sizes the prompt rather than quoting it. The logged events still carry the child's
    // text where a CLI echoes the turn back, which the README states plainly.
    const run = startAgentRun(spec.command, `${options.purpose ?? "chat"} · ${spec.command} · ` +
        `${options.model ?? "default model"} · prompt ${promptSize(options.system, options.user)}`);
    const child = spawn(spec.command, spec.args({...options, json: options.json ?? false, cwd}), {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {...process.env, NO_COLOR: "1"},
    });

    return new Promise<Reply>((resolve, reject) => {
        let settled = false;
        let finalText: string | undefined;
        let accumulated = "";
        let stderrTail = Buffer.alloc(0);
        let stdoutBuffer = "";
        const stdoutDecoder = new TextDecoder();

        const isSettled = (): boolean => settled;

        // A CLI reports its reply and its reasoning in fragments. Logging each fragment gives a
        // page of unreadable slivers, so text is gathered and logged a line at a time: on a
        // newline, when the stream turns to something else, and once more when the run ends.
        const pending: Record<"thinking" | "delta", string> = {thinking: "", delta: ""};

        const logText = (kind: "thinking" | "delta", text: string): void => {
            pending[kind] += text;
            const lines = pending[kind].split("\n");
            pending[kind] = lines.pop() ?? "";
            for (const line of lines) {
                const trimmed = kind === "thinking" ? line.replaceAll("**", "").trim() : line.trim();
                if (trimmed) run.event(kind, trimmed);
            }
        };

        const flushText = (kind: "thinking" | "delta"): void => {
            const rest = kind === "thinking" ? pending[kind].replaceAll("**", "").trim() : pending[kind].trim();
            pending[kind] = "";
            if (rest) run.event(kind, rest);
        };

        const settleResolve = (): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve({
                text: (finalText ?? accumulated).trim(),
                seconds: (performance.now() - started) / 1000,
            });
        };

        const settleReject = (error: Error): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            reject(error);
        };

        const timeoutMs = getTimeoutMs();
        const timeout = setTimeout(() => {
            run.event("end", `failed: timed out after ${timeoutMs} ms`);
            settleReject(new Error(`${spec.command} timed out after ${timeoutMs} ms`));
            child.kill("SIGTERM");
            // A CLI that ignores SIGTERM would otherwise outlive the rejected call.
            setTimeout(() => child.kill("SIGKILL"), sigkillGraceMs).unref();
        }, timeoutMs);

        const processEvent = (event: unknown, raw: string): void => {
            if (settled) return;

            const error = spec.error(event);
            if (error !== null) {
                // Closing the run here as well: the child is killed below, so its close handler
                // returns early and would otherwise leave the run reading as still going.
                run.event("end", `failed: ${error}`);
                settleReject(new Error(error));
                child.kill("SIGTERM");
                return;
            }

            const thinking = spec.thinking(event);
            if (thinking === null) flushText("thinking");

            const delta = spec.delta(event);
            // An event that carries text is logged as that text. Naming it as well would put a
            // line of scaffolding beside every line worth reading.
            const phase = thinking === null && delta === null ? spec.phaseName(event) : null;
            if (typeof phase === "string") run.event("phase", phase, raw);
            if (thinking !== null) logText("thinking", thinking);
            if (delta === null && !options.json) flushText("delta");
            if (delta !== null) {
                // A JSON answer is unreadable in fragments, so it is rendered whole at the end.
                if (!options.json) logText("delta", delta);
                accumulated += delta;
                onDelta?.(delta);
            }

            const complete = spec.final(event);
            if (complete !== null) finalText = complete;
        };

        const processLine = (line: string): void => {
            const objectStart = line.indexOf("{");
            if (objectStart < 0) {
                // A line the runner cannot read, an auth banner say, is the one worth logging.
                if (line.trim()) run.event("stderr", line);
                return;
            }

            let event: unknown;
            try {
                event = JSON.parse(line.slice(objectStart)) as unknown;
            } catch {
                if (line.trim()) run.event("stderr", line);
                return;
            }

            try {
                processEvent(event, line);
            } catch (error) {
                settleReject(error instanceof Error ? error : new Error(String(error)));
            }
        };

        const processStdoutText = (text: string): void => {
            stdoutBuffer += text;
            const lines = stdoutBuffer.split("\n");
            stdoutBuffer = lines.pop() ?? "";
            for (const line of lines) processLine(line);
        };

        child.stdout.on("data", (data: Buffer | string) => {
            processStdoutText(
                typeof data === "string"
                    ? stdoutDecoder.decode(Buffer.from(data), {stream: true})
                    : stdoutDecoder.decode(data, {stream: true}),
            );
        });
        child.stderr.on("data", (data: Buffer | string) => {
            const bytes = dataToBytes(data);
            stderrTail = Buffer.concat([stderrTail, bytes]).subarray(-maxStderrBytes);
            for (const line of bytes.toString().split("\n")) {
                if (line.trim()) run.event("stderr", line);
            }
        });
        child.once("error", (error) => {
            run.event("end", `failed to start: ${error.message}`);
            settleReject(new Error(`${spec.command} could not be started: ${error.message}`));
        });
        child.once("close", (code) => {
            // A run settled by the timeout or a spawn failure has closed its own log line already.
            if (settled) return;

            processStdoutText(stdoutDecoder.decode());
            if (stdoutBuffer) processLine(stdoutBuffer);
            // Parsing the flushed tail can surface an error event that settles the promise.
            if (isSettled()) return;

            flushText("thinking");
            flushText("delta");
            const reply = (finalText ?? accumulated).trim();
            const seconds = ((performance.now() - started) / 1000).toFixed(1);

            if (code !== 0) {
                run.event("end", `failed in ${seconds}s: exit ${code}`);
                settleReject(new Error(`${spec.command} exited ${code}: ${stderrTail.toString()}`));
                return;
            }

            if (reply === "") {
                // Exiting 0 having said nothing means the CLI failed in a way it did not report as
                // an event — an auth banner, an exhausted quota. That includes answering with an
                // empty assistant message, which pi does: resolving would hand the child silence
                // and look like the model had nothing to say.
                run.event("end", `failed in ${seconds}s: exited 0 without a reply`);
                settleReject(new Error(
                    `${spec.command} exited ${code} without a reply: ${stderrTail.toString()}`,
                ));
                return;
            }

            if (options.json) {
                for (const line of replyLines(reply)) run.event("delta", line);
            }
            run.event("end", `done in ${seconds}s, ${reply.length} chars`);
            settleResolve();
        });
    });
}

/**
 * Checks whether an agent CLI can be executed.
 * @param backend Agent CLI to check.
 * @returns Whether the CLI exits successfully from its version command.
 */
export async function isAgentAvailable(backend: AgentBackendId): Promise<boolean> {
    try {
        const spec = agentSpecs[backend];
        await execFileAsync(spec.command, spec.probeArgs, {timeout: execTimeoutMs});
        return true;
    } catch {
        return false;
    }
}

/**
 * Returns the login command for an agent CLI.
 * @param backend Agent CLI whose login hint is needed.
 * @returns A command the caller can show when the CLI is not authenticated.
 */
export function agentLoginHint(backend: AgentBackendId): string {
    return agentSpecs[backend].loginHint;
}
