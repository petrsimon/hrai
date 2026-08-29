import {EventEmitter, once} from "node:events";
import {Readable} from "node:stream";
import {afterEach, describe, expect, it, vi} from "vitest";

const {execFileMock, spawnMock} = vi.hoisted(() => ({
    execFileMock: vi.fn(),
    spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
    execFile: execFileMock,
    spawn: spawnMock,
}));

const ENV_KEYS = ["HRAI_AGENT_CWD", "HRAI_AGENT_TIMEOUT_MS"] as const;

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

        await expect(replyPromise).rejects.toThrow("pi exited 2 without a reply: useful stderr tail");
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
