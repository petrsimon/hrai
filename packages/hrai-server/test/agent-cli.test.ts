import {EventEmitter, once} from "node:events";
import {mkdtempSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Readable} from "node:stream";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const {execFileMock, spawnMock} = vi.hoisted(() => ({
    execFileMock: vi.fn(),
    spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
    execFile: execFileMock,
    spawn: spawnMock,
}));

const ENV_KEYS = ["HRAI_AGENT_CWD", "HRAI_AGENT_TIMEOUT_MS", "HRAI_AGENT_TRACE", "HRAI_DATA_DIR"] as const;

// Every run writes to the agent log, whose default sits in the package directory. Without a data
// directory of its own the suite would leave a real log behind on each run.
beforeEach(() => {
    process.env.HRAI_DATA_DIR = mkdtempSync(join(tmpdir(), "hrai-cli-log-"));
});

interface FakeChild extends EventEmitter {
    stdout: Readable;
    stderr: Readable;
    kill: ReturnType<typeof vi.fn>;
}

function createChild(): FakeChild {
    const child = new EventEmitter() as FakeChild;
    child.stdout = new Readable({read: () => undefined});
    child.stderr = new Readable({read: () => undefined});
    child.kill = vi.fn();
    return child;
}

async function loadAgentCli() {
    vi.resetModules();
    return import("../src/agent-cli.ts");
}

// The runner reads stdout through stream `data` events, which are delivered on a
// later tick. Emitting `close` before both streams have ended would race past
// every event the test just pushed.
async function completeChild(child: FakeChild, lines: string[], code = 0): Promise<void> {
    for (const line of lines) child.stdout.push(`${line}\n`);
    child.stdout.push(null);
    child.stderr.push(null);
    await Promise.all([once(child.stdout, "end"), once(child.stderr, "end")]);
    child.emit("close", code);
}

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
});

describe("agent CLI runner", () => {
    it("parses pi deltas and takes the final assistant message", async () => {
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const deltas: string[] = [];
        const replyPromise = runAgent("pi", {system: "system", user: "user"}, (delta) => deltas.push(delta));

        const call = spawnMock.mock.calls[0];
        expect(call).toBeDefined();
        const args = call?.[1] as string[];
        expect(args).toContain("--no-tools");
        expect(args).toContain("--no-session");
        expect(args).toContain("--no-context-files");
        expect(args).toContain("--system-prompt");
        expect(args[args.indexOf("--system-prompt") + 1]).toBe("system");
        expect(args[args.indexOf("--") + 1]).toBe("user");

        await completeChild(child, [
            JSON.stringify({
                type: "message_update",
                usage: {},
                assistantMessageEvent: {type: "text_delta", contentIndex: 0, delta: "Blue"},
            }),
            JSON.stringify({
                type: "message_update",
                usage: {},
                assistantMessageEvent: {type: "text_delta", contentIndex: 0, delta: " sky"},
            }),
            JSON.stringify({
                type: "message_end",
                message: {
                    role: "user",
                    content: [{type: "text", text: "user"}],
                },
            }),
            JSON.stringify({
                type: "message_end",
                message: {
                    role: "assistant",
                    content: [{type: "text", text: "Blue"}, {type: "text", text: " sky", textSignature: "..."}],
                },
            }),
        ]);

        expect(deltas).toEqual(["Blue", " sky"]);
        expect((await replyPromise).text).toBe("Blue sky");
    });

    it("does not count cursor's cumulative assistant event as a delta", async () => {
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const deltas: string[] = [];
        const replyPromise = runAgent("cursor", {system: "system", user: "user"}, (delta) => deltas.push(delta));

        await completeChild(child, [
            JSON.stringify({
                type: "assistant",
                message: {role: "assistant", content: [{type: "text", text: "Blue"}]},
                session_id: "...",
                timestamp_ms: 1788019028303,
            }),
            JSON.stringify({
                type: "assistant",
                message: {role: "assistant", content: [{type: "text", text: " sky"}]},
                session_id: "...",
                timestamp_ms: 1788019028304,
            }),
            JSON.stringify({
                type: "assistant",
                message: {role: "assistant", content: [{type: "text", text: "Blue sky"}]},
                session_id: "...",
            }),
            JSON.stringify({
                type: "result",
                subtype: "success",
                duration_ms: 3377,
                is_error: false,
                result: "Blue sky",
                session_id: "...",
            }),
        ]);

        const call = spawnMock.mock.calls[0];
        expect(call).toBeDefined();
        const args = call?.[1] as string[];
        expect(args).toContain("--mode");
        expect(args).toContain("ask");
        expect(args).toContain("--trust");
        expect(args).toContain("--output-format");
        expect(args).toContain("stream-json");
        expect(deltas).toEqual(["Blue", " sky"]);
        expect((await replyPromise).text).toBe("Blue sky");
    });

    it("rejects when cursor reports an error", async () => {
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const replyPromise = runAgent("cursor", {system: "system", user: "user"});

        await completeChild(child, [
            JSON.stringify({
                type: "result",
                subtype: "success",
                duration_ms: 3377,
                is_error: true,
                result: "agent failed",
                session_id: "...",
            }),
        ]);

        await expect(replyPromise).rejects.toThrow("agent failed");
    });

    it("runs codex in read-only mode with stdin ignored", async () => {
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const deltas: string[] = [];
        const replyPromise = runAgent("codex", {system: "system", user: "user"}, (delta) => deltas.push(delta));

        await completeChild(child, [
            JSON.stringify({type: "thread.started", thread_id: "..."}),
            JSON.stringify({type: "turn.started"}),
            JSON.stringify({
                type: "item.completed",
                item: {id: "item_0", type: "agent_message", text: "Blue"},
            }),
            JSON.stringify({type: "turn.completed", usage: {}}),
        ]);

        const call = spawnMock.mock.calls[0];
        expect(call).toBeDefined();
        const args = call?.[1] as string[];
        const spawnOptions = call?.[2] as {stdio: string[]};
        expect(spawnOptions.stdio[0]).toBe("ignore");
        expect(args).toContain("-s");
        expect(args).toContain("read-only");
        expect(args).toContain("--ephemeral");
        expect(args).toContain("--skip-git-repo-check");
        expect(deltas).toEqual([]);
        expect((await replyPromise).text).toBe("Blue");
    });

    it("parses a line with terminal junk before the JSON object", async () => {
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const replyPromise = runAgent("pi", {system: "system", user: "user"});

        await completeChild(child, [
            ']777;notify;π;Blue{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Blue"}}',
            JSON.stringify({
                type: "message_end",
                message: {role: "assistant", content: [{type: "text", text: "Blue"}]},
            }),
        ]);

        expect((await replyPromise).text).toBe("Blue");
    });

    it("parses a JSON object split across stdout chunks", async () => {
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const deltas: string[] = [];
        const replyPromise = runAgent("pi", {system: "system", user: "user"}, (delta) => deltas.push(delta));

        child.stdout.push('{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Sp');
        child.stdout.push('lit"}}\n');
        child.stdout.push(
            '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Split"}]}}\n',
        );
        await completeChild(child, []);

        expect(deltas).toEqual(["Split"]);
        expect((await replyPromise).text).toBe("Split");
    });

    it("rejects a non-zero exit and includes the stderr tail", async () => {
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const replyPromise = runAgent("pi", {system: "system", user: "user"});

        child.stderr.push("useful stderr tail");
        await completeChild(child, [], 2);

        await expect(replyPromise).rejects.toThrow("pi exited 2: useful stderr tail");
    });

    it("rejects a non-zero exit even after receiving partial output", async () => {
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const replyPromise = runAgent("pi", {system: "system", user: "user"});

        child.stderr.push("fatal stderr");
        await completeChild(child, [
            JSON.stringify({
                type: "message_update",
                assistantMessageEvent: {type: "text_delta", delta: "partial"},
            }),
        ], 7);

        await expect(replyPromise).rejects.toThrow("pi exited 7");
        await expect(replyPromise).rejects.toThrow("fatal stderr");
    });

    it("rejects a clean exit that produced no reply", async () => {
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const replyPromise = runAgent("codex", {system: "system", user: "user"});

        child.stderr.push("not logged in");
        await completeChild(child, [JSON.stringify({type: "turn.completed", usage: {}})], 0);

        await expect(replyPromise).rejects.toThrow("codex exited 0 without a reply: not logged in");
    });

    it("ignores a blank timeout override instead of firing immediately", async () => {
        process.env.HRAI_AGENT_TIMEOUT_MS = "";
        vi.useFakeTimers();
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const replyPromise = runAgent("pi", {system: "system", user: "user"});

        await vi.advanceTimersByTimeAsync(1000);

        expect(child.kill).not.toHaveBeenCalled();
        vi.useRealTimers();
        await completeChild(child, [
            JSON.stringify({
                type: "message_end",
                message: {role: "assistant", content: [{type: "text", text: "Blue"}]},
            }),
        ]);
        expect((await replyPromise).text).toBe("Blue");
    });

    it("kills the agent when the timeout expires", async () => {
        process.env.HRAI_AGENT_TIMEOUT_MS = "50";
        vi.useFakeTimers();
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const replyPromise = runAgent("pi", {system: "system", user: "user"});

        // Attach the handler before the timer fires, or the rejection is briefly unhandled.
        const rejected = replyPromise.then(
            () => {
                throw new Error("expected the run to reject");
            },
            (error: unknown) => error as Error,
        );
        await vi.advanceTimersByTimeAsync(50);

        expect(child.kill).toHaveBeenCalledWith("SIGTERM");
        expect((await rejected).message).toBe("pi timed out after 50 ms");
    });

    it("reports an unavailable CLI when execFile returns ENOENT", async () => {
        execFileMock.mockImplementation((...args: unknown[]) => {
            const callback = args[args.length - 1] as (error: Error) => void;
            callback(Object.assign(new Error("not found"), {code: "ENOENT"}));
        });
        const {isAgentAvailable} = await loadAgentCli();

        expect(await isAgentAvailable("pi")).toBe(false);
        expect(execFileMock).toHaveBeenCalledWith("pi", ["--version"], {timeout: 5000}, expect.any(Function));
    });

    it("checks the login state of CLIs that can report it", async () => {
        execFileMock.mockImplementation((...args: unknown[]) => {
            const callback = args[args.length - 1] as (error: Error | null) => void;
            callback(null);
        });
        const {isAgentAvailable} = await loadAgentCli();

        expect(await isAgentAvailable("codex")).toBe(true);
        expect(await isAgentAvailable("cursor")).toBe(true);

        // A logged-out CLI answers --version happily, so availability must ask about the account.
        expect(execFileMock).toHaveBeenCalledWith("codex", ["login", "status"], {timeout: 5000}, expect.any(Function));
        expect(execFileMock).toHaveBeenCalledWith("cursor-agent", ["status"], {timeout: 5000}, expect.any(Function));
    });

    it("logs the event inside pi's envelope, its reasoning, and whole lines of reply", async () => {
        const tracePath = join(mkdtempSync(join(tmpdir(), "hrai-trace-")), "agent.log");
        process.env.HRAI_AGENT_TRACE = tracePath;
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const update = (assistantMessageEvent: unknown) =>
            JSON.stringify({type: "message_update", usage: {}, assistantMessageEvent});
        const replyPromise = runAgent("pi", {system: "system", user: "user"});

        await completeChild(child, [
            update({type: "thinking_start", contentIndex: 0}),
            update({type: "thinking_delta", contentIndex: 0, delta: "**Planning the core loop**"}),
            update({type: "text_delta", contentIndex: 0, delta: "Drak "}),
            update({type: "text_delta", contentIndex: 0, delta: "najde poklad.\nDruhy radek."}),
            JSON.stringify({
                type: "message_end",
                message: {role: "assistant", content: [{type: "text", text: "Drak najde poklad.\nDruhy radek."}]},
            }),
        ]);
        await replyPromise;

        const lines = readFileSync(tracePath, "utf8").trim().split("\n").map((line) => line.slice(line.indexOf("] ") + 2));
        // The envelope name never appears: every phase is the event pi reported inside it.
        expect(lines).not.toContain(". message_update");
        expect(lines).toContain(". thinking_start");
        // An event that carried text is logged as that text, not named beside it.
        expect(lines).not.toContain(". text_delta");
        expect(lines).not.toContain(". thinking_delta");
        expect(lines).toContain("~ **Planning the core loop**");
        // Reply fragments are gathered into the lines a person reads, not logged one by one.
        expect(lines).toContain("> Drak najde poklad.");
        expect(lines).toContain("> Druhy radek.");
        expect(lines).not.toContain("> Drak ");
    });

    it("traces a run to a file, sizing the prompt rather than quoting it", async () => {
        const tracePath = join(mkdtempSync(join(tmpdir(), "hrai-trace-")), "agent.log");
        process.env.HRAI_AGENT_TRACE = tracePath;
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const replyPromise = runAgent("pi", {system: "system", user: "a secret game about a dragon"});

        child.stderr.push("pi: warming up\n");
        await completeChild(child, [
            "not json at all",
            JSON.stringify({
                type: "message_end",
                message: {role: "assistant", content: [{type: "text", text: "Blue"}]},
            }),
        ]);
        await replyPromise;

        const trace = readFileSync(tracePath, "utf8");
        expect(trace).toMatch(/\[hrai agent pi [0-9a-f]{8}] = start model=default/);
        expect(trace).toContain(`prompt=${"system".length + "a secret game about a dragon".length} chars`);
        expect(trace).not.toContain("a secret game about a dragon");
        expect(trace).toContain("! pi: warming up");
        expect(trace).toContain("! not json at all");
        expect(trace).toContain(". message_end");
        expect(trace).toMatch(/= exit 0 after [\d.]+s, 4 chars/);
    });

    it("writes no trace unless HRAI_AGENT_TRACE asks for one", async () => {
        const stderrWrite = vi.spyOn(process.stderr, "write").mockReturnValue(true);
        try {
            const child = createChild();
            spawnMock.mockReturnValue(child);
            const {runAgent} = await loadAgentCli();
            const replyPromise = runAgent("pi", {system: "system", user: "user"});

            await completeChild(child, [
                JSON.stringify({
                    type: "message_end",
                    message: {role: "assistant", content: [{type: "text", text: "Blue"}]},
                }),
            ]);
            await expect(replyPromise).resolves.toMatchObject({text: "Blue"});
            expect(stderrWrite).not.toHaveBeenCalled();
        } finally {
            stderrWrite.mockRestore();
        }
    });

    it("adds a bare JSON object instruction in JSON mode", async () => {
        const child = createChild();
        spawnMock.mockReturnValue(child);
        const {runAgent} = await loadAgentCli();
        const replyPromise = runAgent("codex", {system: "system", user: "user", json: true});

        const call = spawnMock.mock.calls[0];
        expect(call).toBeDefined();
        const args = call?.[1] as string[];
        expect(args.at(-1)).toContain("Reply with only the JSON object and no prose or code fences.");

        await completeChild(child, [
            JSON.stringify({
                type: "item.completed",
                item: {id: "item_0", type: "agent_message", text: "{\"answer\":\"Blue\"}"},
            }),
        ]);
        await expect(replyPromise).resolves.toMatchObject({text: "{\"answer\":\"Blue\"}"});
    });
});
