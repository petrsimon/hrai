/**
 * The persistent tutor session end to end against the stub provider: the tools are offered,
 * `tell_child` is honoured, the file survives a reopen, and the transcript sees every step.
 */
import {mkdtempSync, readdirSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from "vitest";
import {Session} from "../src/session.ts";
import {startStubProvider, type StubProvider} from "./helpers/stub-provider.ts";

let stub: StubProvider;
let dataDir: string;

beforeAll(async () => {
    stub = await startStubProvider();
    dataDir = mkdtempSync(join(tmpdir(), "hrai-tutor-session-"));
    process.env.HRAI_DATA_DIR = dataDir;
    process.env.HRAI_OLLAMA_HOST = stub.baseUrl;
    process.env.HRAI_OLLAMA_MODELS = "stub";
    delete process.env.HRAI_AGENT_TRACE;
});

afterAll(async () => {
    await stub.close();
    rmSync(dataDir, {recursive: true, force: true});
    for (const key of ["HRAI_DATA_DIR", "HRAI_OLLAMA_HOST", "HRAI_OLLAMA_MODELS"]) delete process.env[key];
});

afterEach(async () => {
    const {disposeTutorSessions} = await import("../src/tutor-session.ts");
    await disposeTutorSessions();
    stub.requests.length = 0;
});

async function load() {
    vi.resetModules();
    const [runtime, tutor, transcript] = await Promise.all([
        import("../src/pi-runtime.ts"),
        import("../src/tutor-session.ts"),
        import("../src/transcript.ts"),
    ]);
    transcript.resetTranscript();
    const modelRuntime = await runtime.runtimeFor("kid");
    const resolved = runtime.resolveModel(modelRuntime, "ollama/stub");
    return {...tutor, ...transcript, modelRuntime, resolved};
}

function hraiSession(): Session {
    const session = new Session();
    session.setWorkspace([{
        id: "cat", name: "Kočka", isStage: false,
        blocks: {h: {id: "h", opcode: "event_whenflagclicked", next: null, parent: null, inputs: {}, fields: {}, topLevel: true}},
    }], "cat");
    return session;
}

describe("tutor session", () => {
    it("offers the tools, delivers through tell_child and remembers the turn on disk", async () => {
        stub.replies.splice(0, stub.replies.length,
            {toolCall: {name: "tell_child", arguments: {text: "Zkus zelenou vlajku. Co se stane?", blocks: []}}},
            {text: "Hotovo."});
        const {tutorSessionFor, modelRuntime, resolved, subscribe} = await load();
        const kinds: string[] = [];
        const stop = subscribe("kid", (event) => kinds.push(event.kind));

        const tutor = await tutorSessionFor({userId: "kid", projectId: "7", runtime: modelRuntime, resolved});
        const result = await tutor.ask({
            session: hraiSession(), rung: 1, question: "Proč se nehýbe?",
            systemPrompt: "SYSTEM", userPrompt: "USER TURN",
        });
        stop();

        expect(result.message).toEqual({text: "Zkus zelenou vlajku. Co se stane?", blocks: []});
        expect(result.error).toBeUndefined();
        const first = stub.requests[0];
        expect(first?.messages[0]?.content).toBe("SYSTEM");
        expect((first?.tools ?? []).map((tool) => (tool as {function: {name: string}}).function.name).sort())
            .toEqual(["palette", "read_project", "step_status", "tell_child"]);
        expect(kinds).toEqual(expect.arrayContaining(["user", "tool_start", "tool_end", "turn_end"]));
        expect(kinds[0]).toBe("user");

        const files = readdirSync(join(dataDir, "pi", "sessions", "kid", "7"));
        expect(files).toHaveLength(1);
        expect(tutor.history().map((event) => event.kind)).toEqual([
            "user", "tool_start", "turn_end", "tool_end", "assistant_delta", "turn_end",
        ]);
    });

    it("reopens the same file for the same profile and project", async () => {
        stub.replies.splice(0, stub.replies.length, {text: "Bez nástroje."});
        const {tutorSessionFor, disposeTutorSessions, modelRuntime, resolved} = await load();
        const first = await tutorSessionFor({userId: "kid", projectId: "7", runtime: modelRuntime, resolved});
        const before = first.history().length;
        await disposeTutorSessions();

        const second = await tutorSessionFor({userId: "kid", projectId: "7", runtime: modelRuntime, resolved});
        expect(second.history()).toHaveLength(before);
        expect(readdirSync(join(dataDir, "pi", "sessions", "kid", "7"))).toHaveLength(1);

        const other = await tutorSessionFor({userId: "kid", projectId: "8", runtime: modelRuntime, resolved});
        expect(other.history()).toHaveLength(0);
        expect(other).not.toBe(second);
        expect(await tutorSessionFor({userId: "kid", projectId: "8", runtime: modelRuntime, resolved})).toBe(other);
    });

    it("reports a turn that ended without tell_child", async () => {
        stub.replies.splice(0, stub.replies.length, {text: "Přidej blok když je klávesa stisknuta."});
        const {tutorSessionFor, modelRuntime, resolved} = await load();
        const tutor = await tutorSessionFor({userId: "kid", projectId: "9", runtime: modelRuntime, resolved});

        const result = await tutor.ask({
            session: hraiSession(), rung: 1, question: "Jak?", systemPrompt: "SYSTEM", userPrompt: "USER",
        });

        expect(result.message).toBeNull();
        expect(result.prose).toBe("Přidej blok když je klávesa stisknuta.");
    });

    it("refuses a second turn while one is running", async () => {
        stub.replies.splice(0, stub.replies.length, {text: "Pomalu."});
        const {tutorSessionFor, modelRuntime, resolved} = await load();
        const tutor = await tutorSessionFor({userId: "kid", projectId: "10", runtime: modelRuntime, resolved});
        const request = {session: hraiSession(), rung: 1, question: "?", systemPrompt: "S", userPrompt: "U"};

        const running = tutor.ask(request);
        expect(tutor.isBusy).toBe(true);
        await expect(tutor.ask(request)).rejects.toThrow(/already running/);
        await running;
        expect(tutor.isBusy).toBe(false);
    });

    it("surfaces a provider error as the turn's error", async () => {
        stub.replies.splice(0, stub.replies.length, {status: 401, body: JSON.stringify({error: {message: "not logged in"}})});
        const {tutorSessionFor, modelRuntime, resolved} = await load();
        const tutor = await tutorSessionFor({userId: "kid", projectId: "11", runtime: modelRuntime, resolved});

        const result = await tutor.ask({
            session: hraiSession(), rung: 1, question: "?", systemPrompt: "S", userPrompt: "U",
        });

        expect(result.message).toBeNull();
        expect(result.error).toMatch(/not logged in|401/);
    });
});
