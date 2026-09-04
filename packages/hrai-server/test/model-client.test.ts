import {afterEach, describe, expect, it, vi} from "vitest";

const {agentLoginHintMock, isAgentAvailableMock, runAgentMock} = vi.hoisted(() => ({
    agentLoginHintMock: vi.fn(),
    isAgentAvailableMock: vi.fn(),
    runAgentMock: vi.fn(),
}));

vi.mock("../src/agent-cli.ts", () => ({
    agentLoginHint: agentLoginHintMock,
    isAgentAvailable: isAgentAvailableMock,
    runAgent: runAgentMock,
}));

const ENV_KEYS = [
    "HRAI_MODEL_BACKEND",
    "HRAI_MODEL_HOST",
    "HRAI_EVAL_HOST",
    "HRAI_EVAL_MODEL",
    "HRAI_AGENT_MODEL",
    "HRAI_OLLAMA_MODEL",
    "HRAI_LLAMA_MODEL",
    "HRAI_CURSOR_MODEL",
    "HRAI_PI_MODEL",
    "HRAI_CODEX_MODEL",
    "HRAI_OLLAMA_HOST",
    "HRAI_LLAMA_HOST",
] as const;

async function loadModelClient() {
    vi.resetModules();
    return import("../src/model-client.ts");
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    for (const key of ENV_KEYS) delete process.env[key];
});

describe("llama.cpp model client", () => {
    it("checks availability and reads streamed OpenAI responses", async () => {
        process.env.HRAI_MODEL_BACKEND = "llama.cpp";
        process.env.HRAI_MODEL_HOST = "http://llama.test";
        process.env.HRAI_EVAL_MODEL = "Qwen3.5-27B";
        vi.resetModules();

        const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            if (url.endsWith("/v1/models")) {
                return new Response(JSON.stringify({data: [{id: "Qwen3.5-27B-Q4_K_M.gguf"}]}));
            }

            const request = JSON.parse(init?.body as string) as {
                stream: boolean;
                temperature: number;
                max_tokens: number;
                chat_template_kwargs: object;
                response_format?: {type: string};
            };
            expect(request.chat_template_kwargs).toEqual({enable_thinking: false});
            expect(request.temperature).toBe(0);
            if (!request.stream) {
                return new Response(JSON.stringify({choices: [{message: {content: "Hotovo"}}]}));
            }

            const encoder = new TextEncoder();
            const body = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Ahoj"}}]}\n'));
                    controller.enqueue(encoder.encode('\ndata: {"choices":[{"delta":{"content":" světe"}}]}\n\ndata: [DONE]\n\n'));
                    controller.close();
                },
            });
            return new Response(body, {headers: {"Content-Type": "text/event-stream"}});
        });
        vi.stubGlobal("fetch", fetchMock);

        const {chat, chatJson, chatStream, isModelAvailable} = await import("../src/model-client.ts");
        expect(await isModelAvailable("Qwen3.5-27B")).toBe(true);

        const deltas: string[] = [];
        expect((await chatStream("system", "user", (delta) => deltas.push(delta))).text).toBe("Ahoj světe");
        expect(deltas).toEqual(["Ahoj", " světe"]);
        expect((await chat("system", "user")).text).toBe("Hotovo");
        expect((await chatJson("system", "user")).text).toBe("Hotovo");
        const jsonRequest = fetchMock.mock.calls.find(([, init]) => {
            if (!init?.body) return false;
            const body = JSON.parse(init.body as string) as {response_format?: {type: string}};
            return body.response_format?.type === "json_object";
        });
        expect(jsonRequest).toBeDefined();
        const jsonBody = JSON.parse(jsonRequest?.[1]?.body as string) as {max_tokens: number};
        expect(jsonBody.max_tokens).toBe(1536);
    });

    it.each([
        ["llama.cpp", {choices: [{message: {content: "{"}, finish_reason: "length"}]}],
        ["ollama", {message: {content: "{"}, done_reason: "length"}],
    ] as const)("reports %s length-limited JSON replies as truncated", async (backend, body) => {
        if (backend === "llama.cpp") {
            process.env.HRAI_MODEL_BACKEND = backend;
            process.env.HRAI_MODEL_HOST = "http://llama.test";
        }
        const requests: {max_tokens?: number}[] = [];
        const fetchMock = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
            requests.push(JSON.parse(init?.body as string) as {max_tokens?: number});
            return new Response(JSON.stringify(body));
        });
        vi.stubGlobal("fetch", fetchMock);

        const {chatJson} = await loadModelClient();

        await expect(chatJson("system", "user")).rejects.toThrow(/truncated/);
        if (backend === "llama.cpp") {
            expect(requests[0]?.max_tokens).toBe(1536);
        } else {
            expect(requests[0]?.max_tokens).toBeUndefined();
        }
    });

    it("delegates agent chat calls without fetching", async () => {
        process.env.HRAI_MODEL_BACKEND = "cursor";
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        runAgentMock.mockResolvedValue({text: "agent reply", seconds: 0});

        const {chat, chatJson} = await loadModelClient();
        await chat("system", "user", "model");
        await chatJson("system", "user", "model");

        expect(runAgentMock).toHaveBeenNthCalledWith(1, "cursor", {
            system: "system",
            user: "user",
            model: "model",
        });
        expect(runAgentMock).toHaveBeenNthCalledWith(2, "cursor", {
            system: "system",
            user: "user",
            model: "model",
            json: true,
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("delegates agent availability without using the model name", async () => {
        process.env.HRAI_MODEL_BACKEND = "pi";
        isAgentAvailableMock.mockResolvedValue(true);

        const {isModelAvailable} = await loadModelClient();

        await expect(isModelAvailable("model-that-is-ignored")).resolves.toBe(true);
        expect(isAgentAvailableMock).toHaveBeenCalledWith("pi");
    });

    it("prints the agent login hint when an agent is unavailable", async () => {
        process.env.HRAI_MODEL_BACKEND = "codex";
        agentLoginHintMock.mockReturnValue("codex login");
        const writeMock = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

        const {warnSkipped} = await loadModelClient();
        warnSkipped("codex");

        expect(writeMock.mock.calls.flat().join("")).toContain("codex login");
    });

    it("throws for an unsupported backend", async () => {
        process.env.HRAI_MODEL_BACKEND = "not-a-backend";
        const {chat} = await loadModelClient();

        await expect(chat("system", "user")).rejects.toThrow(
            "Unsupported HRAI_MODEL_BACKEND: not-a-backend",
        );
    });

    it("keeps HRAI_AGENT_MODEL away from a server backend", async () => {
        process.env.HRAI_AGENT_MODEL = "gpt-5.2";
        const {EVAL_MODEL, defaultModelFor} = await loadModelClient();

        // The environment is still ollama; an agent CLI's model name must not become its default.
        expect(EVAL_MODEL).toBe("qwen3:14b");
        expect(defaultModelFor("ollama")).toBe("qwen3:14b");
        expect(defaultModelFor("cursor")).toBe("");
    });

    it("does not hand the eval model to a backend chosen at runtime", async () => {
        process.env.HRAI_MODEL_BACKEND = "ollama";
        process.env.HRAI_EVAL_MODEL = "qwen3:14b";
        const {defaultModelFor} = await loadModelClient();

        expect(defaultModelFor("ollama")).toBe("qwen3:14b");
        // cursor-agent would reject --model qwen3:14b.
        expect(defaultModelFor("cursor")).toBe("");
    });

    it("uses the backend-specific model environment variable", async () => {
        process.env.HRAI_CURSOR_MODEL = "gpt-5.2";
        const {defaultModelFor} = await loadModelClient();

        expect(defaultModelFor("cursor")).toBe("gpt-5.2");
        expect(defaultModelFor("ollama")).toBe("qwen3:14b");
    });

    it("omits the model for an agent backend when none is configured", async () => {
        process.env.HRAI_MODEL_BACKEND = "cursor";
        const {chat, EVAL_MODEL} = await loadModelClient();

        expect(EVAL_MODEL).toBe("");
        await chat("system", "user");

        // A server-side model name means nothing to cursor-agent; the flag must be left off.
        expect(runAgentMock).toHaveBeenCalledWith(
            "cursor",
            {system: "system", user: "user", model: undefined},
        );
    });

    it("passes an explicitly configured agent model through", async () => {
        process.env.HRAI_MODEL_BACKEND = "cursor";
        process.env.HRAI_AGENT_MODEL = "gpt-5.2";
        const {chat} = await loadModelClient();
        await chat("system", "user");

        expect(runAgentMock).toHaveBeenCalledWith(
            "cursor",
            {system: "system", user: "user", model: "gpt-5.2"},
        );
    });

    it("uses the per-call backend instead of the environment backend", async () => {
        process.env.HRAI_MODEL_BACKEND = "ollama";
        process.env.HRAI_LLAMA_HOST = "http://llama.test";
        const fetchMock = vi.fn(() => new Response(JSON.stringify({choices: [{message: {content: "Hotovo"}}]})));
        vi.stubGlobal("fetch", fetchMock);

        const {chat} = await loadModelClient();
        await chat("system", "user", "model", "llama.cpp");

        expect(fetchMock.mock.calls[0]?.[0]).toBe("http://llama.test/v1/chat/completions");
    });

    it("honors the model host for the default backend and specific hosts for overrides", async () => {
        process.env.HRAI_MODEL_BACKEND = "ollama";
        process.env.HRAI_MODEL_HOST = "http://model.test";
        process.env.HRAI_OLLAMA_HOST = "http://ollama.test";
        process.env.HRAI_LLAMA_HOST = "http://llama.test";
        // The two backends read the reply from different fields, so the body must match the URL.
        const fetchMock = vi.fn((input: string) => new Response(JSON.stringify(
            input.endsWith("/api/chat")
                ? {message: {content: "Hotovo"}}
                : {choices: [{message: {content: "Hotovo"}}]},
        )));
        vi.stubGlobal("fetch", fetchMock);

        const {chat} = await loadModelClient();
        await chat("system", "user", "model");
        await chat("system", "user", "model", "llama.cpp");

        expect(fetchMock.mock.calls[0]?.[0]).toBe("http://model.test/api/chat");
        expect(fetchMock.mock.calls[1]?.[0]).toBe("http://llama.test/v1/chat/completions");
    });

    it("does not leak HRAI_EVAL_HOST to a per-call backend override", async () => {
        process.env.HRAI_MODEL_BACKEND = "llama.cpp";
        process.env.HRAI_EVAL_HOST = "http://llama.test";
        const fetchMock = vi.fn(() => new Response(JSON.stringify({message: {content: "Hotovo"}})));
        vi.stubGlobal("fetch", fetchMock);

        const {chat} = await loadModelClient();
        await chat("system", "user", "model", "ollama");

        expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:11434/api/chat");
    });

    it("honors the Ollama-specific host when Ollama is not the default", async () => {
        process.env.HRAI_MODEL_BACKEND = "llama.cpp";
        process.env.HRAI_MODEL_HOST = "http://model.test";
        process.env.HRAI_OLLAMA_HOST = "http://ollama.test";
        const fetchMock = vi.fn(() => new Response(JSON.stringify({message: {content: "Hotovo"}})));
        vi.stubGlobal("fetch", fetchMock);

        const {chat} = await loadModelClient();
        await chat("system", "user", "model", "ollama");

        expect(fetchMock.mock.calls[0]?.[0]).toBe("http://ollama.test/api/chat");
    });

    it("uses the full context window for streamed and complete Ollama requests", async () => {
        process.env.HRAI_MODEL_BACKEND = "ollama";
        const fetchMock = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
            const request = JSON.parse(init?.body as string) as {options: {num_ctx: number}; stream: boolean};
            if (!request.stream) return new Response(JSON.stringify({message: {content: "Hotovo"}}));

            const encoder = new TextEncoder();
            const body = new ReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode('{"message":{"content":"Hotovo"}}\n'));
                    controller.close();
                },
            });
            return new Response(body);
        });
        vi.stubGlobal("fetch", fetchMock);

        const {chat, chatStream} = await loadModelClient();
        await chatStream("system", "user", () => undefined);
        await chat("system", "user");

        expect(fetchMock.mock.calls.map(([, init]) => (
            JSON.parse(init?.body as string) as {options: {num_ctx: number}}
        ).options.num_ctx)).toEqual([8192, 8192]);
    });
});
