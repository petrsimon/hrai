import {execFile, spawn} from "node:child_process";
import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
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

interface AgentSpec {
    command: string;
    args(options: AgentOptions): string[];
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
        error: () => null,
        loginHint: "pi auth",
    },
    cursor: {
        command: "cursor-agent",
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
 * @param onDelta Called with each incremental text chunk in order.
 * @returns The complete text and elapsed seconds.
 */
export async function runAgent(
    backend: AgentBackendId,
    options: {system: string; user: string; model?: string; json?: boolean},
    onDelta?: (delta: string) => void,
): Promise<Reply> {
    const started = performance.now();
    const spec = agentSpecs[backend];
    const cwd = getSandboxDir();
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
            settleReject(new Error(`${spec.command} timed out after ${timeoutMs} ms`));
            child.kill("SIGTERM");
            // A CLI that ignores SIGTERM would otherwise outlive the rejected call.
            setTimeout(() => child.kill("SIGKILL"), sigkillGraceMs).unref();
        }, timeoutMs);

        const processEvent = (event: unknown): void => {
            if (settled) return;

            const error = spec.error(event);
            if (error !== null) {
                settleReject(new Error(error));
                child.kill("SIGTERM");
                return;
            }

            const delta = spec.delta(event);
            if (delta !== null) {
                accumulated += delta;
                onDelta?.(delta);
            }

            const complete = spec.final(event);
            if (complete !== null) finalText = complete;
        };

        const processLine = (line: string): void => {
            const objectStart = line.indexOf("{");
            if (objectStart < 0) return;

            let event: unknown;
            try {
                event = JSON.parse(line.slice(objectStart)) as unknown;
            } catch {
                return;
            }

            try {
                processEvent(event);
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
            stderrTail = Buffer.concat([stderrTail, dataToBytes(data)]).subarray(-maxStderrBytes);
        });
        child.once("error", (error) => {
            settleReject(new Error(`${spec.command} could not be started: ${error.message}`));
        });
        child.once("close", (code) => {
            if (settled) return;

            processStdoutText(stdoutDecoder.decode());
            if (stdoutBuffer) processLine(stdoutBuffer);
            // Parsing the flushed tail can surface an error event that settles the promise.
            if (isSettled()) return;

            if (finalText === undefined && accumulated === "") {
                // Exiting 0 having emitted no reply means the CLI failed in a way it did not report
                // as an event — an auth banner, say. Resolving here would hand the child an empty
                // answer and look like the model had nothing to say.
                settleReject(new Error(
                    `${spec.command} exited ${code} without a reply: ${stderrTail.toString()}`,
                ));
                return;
            }
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
        await execFileAsync(agentSpecs[backend].command, ["--version"], {timeout: execTimeoutMs});
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
