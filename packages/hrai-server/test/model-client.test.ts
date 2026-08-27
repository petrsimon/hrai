import {afterEach, describe, expect, it, vi} from "vitest";

const ENV_KEYS = ["HRAI_MODEL_BACKEND", "HRAI_MODEL_HOST", "HRAI_EVAL_MODEL"] as const;

afterEach(() => {
    vi.unstubAllGlobals();
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
                chat_template_kwargs: object;
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

        const {chat, chatStream, isModelAvailable} = await import("../src/model-client.ts");
        expect(await isModelAvailable("Qwen3.5-27B")).toBe(true);

        const deltas: string[] = [];
        expect((await chatStream("system", "user", (delta) => deltas.push(delta))).text).toBe("Ahoj světe");
        expect(deltas).toEqual(["Ahoj", " světe"]);
        expect((await chat("system", "user")).text).toBe("Hotovo");
    });
});
