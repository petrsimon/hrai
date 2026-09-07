/**
 * An OpenAI-compatible chat server for tests: what ollama and llama.cpp look like to pi.
 *
 * It answers every completion with a scripted reply, streamed as SSE chunks, and records what
 * it was asked, so a test can assert on the prompt pi actually sent without a model anywhere.
 */
import {createServer, type Server} from "node:http";

export interface StubRequest {
    model: string;
    messages: {role: string; content: unknown}[];
    tools?: unknown[];
    stream?: boolean;
}

export interface StubProvider {
    baseUrl: string;
    requests: StubRequest[];
    /** The next replies, consumed in order; the last one repeats. */
    replies: StubReply[];
    close(): Promise<void>;
}

export type StubReply =
    | {text: string}
    | {toolCall: {name: string; arguments: Record<string, unknown>}}
    | {status: number; body: string};

function chunk(payload: object): string {
    return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function startStubProvider(replies: StubReply[] = [{text: "Ahoj"}]): Promise<StubProvider> {
    const requests: StubRequest[] = [];
    const queue = [...replies];
    const server: Server = createServer((request, response) => {
        let body = "";
        request.on("data", (data: Buffer) => { body += data.toString(); });
        request.on("end", () => {
            const parsed = JSON.parse(body) as StubRequest;
            requests.push(parsed);
            const reply = queue.length > 1 ? queue.shift() : queue[0];
            if (!reply) throw new Error("stub provider has no reply left");
            if ("status" in reply) {
                response.writeHead(reply.status, {"Content-Type": "application/json"});
                response.end(reply.body);
                return;
            }
            response.writeHead(200, {"Content-Type": "text/event-stream"});
            const base = {id: `stub-${requests.length}`, object: "chat.completion.chunk", created: 0, model: parsed.model};
            if ("text" in reply) {
                for (const piece of reply.text.split(/(?<= )/)) {
                    response.write(chunk({...base, choices: [{index: 0, delta: {content: piece}, finish_reason: null}]}));
                }
                response.write(chunk({...base, choices: [{index: 0, delta: {}, finish_reason: "stop"}],
                    usage: {prompt_tokens: 10, completion_tokens: 5, total_tokens: 15}}));
            } else {
                response.write(chunk({...base, choices: [{index: 0, delta: {tool_calls: [{
                    index: 0, id: `call-${requests.length}`, type: "function",
                    function: {name: reply.toolCall.name, arguments: JSON.stringify(reply.toolCall.arguments)},
                }]}, finish_reason: null}]}));
                response.write(chunk({...base, choices: [{index: 0, delta: {}, finish_reason: "tool_calls"}],
                    usage: {prompt_tokens: 10, completion_tokens: 5, total_tokens: 15}}));
            }
            response.write("data: [DONE]\n\n");
            response.end();
        });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("stub provider did not bind");
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        requests,
        replies: queue,
        close: () => new Promise((resolve) => server.close(() => resolve())),
    };
}
