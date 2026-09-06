/**
 * The one-shot path end to end: a `provider/model` reference, pi, an OpenAI-compatible server.
 *
 * The stub stands in for ollama, so what is proven is the wiring — prompt shape, streaming,
 * the JSON instruction, error reporting — not a model.
 */
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from "vitest";
import {startStubProvider, type StubProvider} from "./helpers/stub-provider.ts";

let stub: StubProvider;
let dataDir: string;

beforeAll(async () => {
    stub = await startStubProvider();
    dataDir = mkdtempSync(join(tmpdir(), "hrai-model-client-"));
    process.env.HRAI_DATA_DIR = dataDir;
    process.env.HRAI_OLLAMA_HOST = stub.baseUrl;
    process.env.HRAI_OLLAMA_MODELS = "stub";
    process.env.HRAI_EVAL_MODEL = "ollama/stub";
    delete process.env.HRAI_AGENT_TRACE;
});

afterAll(async () => {
    await stub.close();
    rmSync(dataDir, {recursive: true, force: true});
    for (const key of ["HRAI_DATA_DIR", "HRAI_OLLAMA_HOST", "HRAI_OLLAMA_MODELS", "HRAI_EVAL_MODEL"]) delete process.env[key];
});

afterEach(() => {
    stub.requests.length = 0;
    stub.replies.length = 0;
    stub.replies.push({text: "Ahoj"});
});

async function load() {
    vi.resetModules();
    const [client, transcript] = await Promise.all([import("../src/model-client.ts"), import("../src/transcript.ts")]);
    transcript.resetTranscript();
    return {...client, ...transcript};
}

describe("model client over pi", () => {
    it("reports the eval model as available when its local provider lists it", async () => {
        const {EVAL_MODEL, isModelAvailable} = await load();
        expect(EVAL_MODEL).toBe("ollama/stub");
        await expect(isModelAvailable()).resolves.toBe(true);
        await expect(isModelAvailable("ollama/other")).resolves.toBe(false);
        await expect(isModelAvailable("nowhere/stub")).resolves.toBe(false);
    });

    it("sends the system prompt and the user turn and streams the reply", async () => {
        stub.replies.splice(0, 1, {text: "Ahoj světe"});
        const {chatStream} = await load();
        const deltas: string[] = [];

        const reply = await chatStream("SYSTEM", "USER", (delta) => deltas.push(delta));

        expect(reply.text).toBe("Ahoj světe");
        expect(deltas.join("")).toBe("Ahoj světe");
        expect(deltas.length).toBeGreaterThan(1);
        const request = stub.requests[0];
        expect(request?.model).toBe("stub");
        expect(request?.messages.map((message) => message.role)).toEqual(["system", "user"]);
        expect(request?.messages[0]?.content).toBe("SYSTEM");
        expect(JSON.stringify(request?.messages[1]?.content)).toContain("USER");
        expect(request?.tools ?? []).toHaveLength(0);
    });

    it("asks for bare JSON in chatJson", async () => {
        stub.replies.splice(0, 1, {text: '{"title": "Drak"}'});
        const {chatJson} = await load();

        const reply = await chatJson("SYSTEM", "USER", "ollama/stub", "plan");

        expect(reply.text).toBe('{"title": "Drak"}');
        expect(JSON.stringify(stub.requests[0]?.messages[1]?.content)).toContain("pouze JSON");
    });

    it("reports a run to the operator's transcript", async () => {
        const {chat, subscribe, OPERATOR} = {...await load(), ...await import("../src/pi-runtime.ts")};
        const kinds: string[] = [];
        const stop = subscribe(OPERATOR, (event) => kinds.push(event.runId ? `${event.kind}` : `?${event.kind}`));

        await chat("SYSTEM", "USER", "ollama/stub", "title");
        stop();

        expect(kinds[0]).toBe("run_start");
        expect(kinds).toContain("assistant_delta");
        expect(kinds).toContain("turn_end");
        expect(kinds.at(-1)).toBe("run_end");
    });

    it("rejects a provider error instead of returning silence", async () => {
        stub.replies.splice(0, 1, {status: 429, body: JSON.stringify({error: {message: "quota exhausted"}})});
        const {chat} = await load();

        await expect(chat("SYSTEM", "USER")).rejects.toThrow(/quota exhausted|429/);
    });

    it("rejects an empty reply", async () => {
        stub.replies.splice(0, 1, {text: ""});
        const {chat} = await load();

        await expect(chat("SYSTEM", "USER")).rejects.toThrow(/answered nothing/);
    });

    it("throws for a model the runtime does not know", async () => {
        const {chat} = await load();

        await expect(chat("SYSTEM", "USER", "ollama/missing")).rejects.toThrow(/missing/);
        await expect(chat("SYSTEM", "USER", "no-provider")).rejects.toThrow(/provider\/model/);
    });
});
