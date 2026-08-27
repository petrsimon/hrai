/**
 * Client for the local model server.
 *
 * Ollama remains the default because it is convenient for evaluation and local
 * development. llama.cpp exposes an OpenAI-compatible API, so the same tutor can
 * run against its Vulkan server without making the browser aware of the backend.
 */

const BACKEND = process.env.HRAI_MODEL_BACKEND ?? "ollama";
const HOST =
    process.env.HRAI_MODEL_HOST ??
    process.env.HRAI_EVAL_HOST ??
    (BACKEND === "llama.cpp" ? "http://localhost:8080" : "http://localhost:11434");

/** Measured floor for the original evaluation suite. */
export const EVAL_MODEL = process.env.HRAI_EVAL_MODEL ?? "qwen3:14b";

export interface Reply {
    text: string;
    seconds: number;
}

interface OllamaTagsResponse {
    models?: { name: string }[];
}

interface OpenAIModelsResponse {
    data?: { id: string }[];
}

interface OpenAIChatResponse {
    choices?: { message?: { content?: string } }[];
}

interface OpenAIStreamChunk {
    choices?: { delta?: { content?: string } }[];
}

function isLlamaCpp(): boolean {
    if (BACKEND === "ollama") return false;
    if (BACKEND === "llama.cpp") return true;
    throw new Error(`Unsupported HRAI_MODEL_BACKEND: ${String(BACKEND)}`);
}

function modelMatches(available: string, requested: string): boolean {
    return available === requested || available.includes(requested) || requested.includes(available);
}

export async function isModelAvailable(model: string): Promise<boolean> {
    try {
        if (isLlamaCpp()) {
            const res = await fetch(`${HOST}/v1/models`, { signal: AbortSignal.timeout(2000) });
            if (!res.ok) return false;
            const body = (await res.json()) as OpenAIModelsResponse;
            return (body.data ?? []).some((entry) => modelMatches(entry.id, model));
        }

        const res = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return false;
        const body = (await res.json()) as OllamaTagsResponse;
        return (body.models ?? []).some((entry) => modelMatches(entry.name, model));
    } catch {
        return false;
    }
}

function ollamaRequestBody(system: string, user: string, stream: boolean, model: string) {
    return {
        model,
        stream,
        think: false,
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        options: { temperature: 0, num_ctx: stream ? 8192 : 4096 },
    };
}

function llamaRequestBody(system: string, user: string, stream: boolean, model: string) {
    return {
        model,
        stream,
        messages: [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        temperature: 0,
        max_tokens: 512,
        // Qwen3.5 otherwise emits a long reasoning trace before the tutor reply.
        chat_template_kwargs: { enable_thinking: false },
    };
}

function requestUrl(): string {
    return isLlamaCpp() ? `${HOST}/v1/chat/completions` : `${HOST}/api/chat`;
}

function requestBody(system: string, user: string, stream: boolean, model: string) {
    return isLlamaCpp()
        ? llamaRequestBody(system, user, stream, model)
        : ollamaRequestBody(system, user, stream, model);
}

async function* responseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const decoder = new TextDecoder();
    let buffered = "";
    for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
        buffered += decoder.decode(chunk, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) yield line;
    }
    buffered += decoder.decode();
    if (buffered) yield buffered;
}

function streamDelta(line: string): string | null {
    const data = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (!data || data === "[DONE]") return null;
    const parsed = JSON.parse(data) as OpenAIStreamChunk;
    return parsed.choices?.[0]?.delta?.content ?? null;
}

/**
 * Streams a reply, invoking `onDelta` for each chunk as it arrives.
 * @param system System prompt.
 * @param user User turn.
 * @param onDelta Called with each token chunk in order.
 * @param model Model name.
 * @returns The complete text and elapsed seconds.
 */
export async function chatStream(
    system: string,
    user: string,
    onDelta: (delta: string) => void,
    model = EVAL_MODEL,
): Promise<Reply> {
    const started = performance.now();
    const res = await fetch(requestUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(system, user, true, model)),
    });
    if (!res.ok) throw new Error(`${HOST} returned ${res.status} ${res.statusText}`);
    if (!res.body) throw new Error(`${HOST} returned no body`);

    let full = "";
    if (isLlamaCpp()) {
        for await (const line of responseLines(res.body)) {
            if (!line.trim()) continue;
            const delta = streamDelta(line);
            if (delta) {
                full += delta;
                onDelta(delta);
            }
        }
    } else {
        for await (const line of responseLines(res.body)) {
            if (!line.trim()) continue;
            const parsed = JSON.parse(line) as { message?: { content?: string } };
            const delta = parsed.message?.content;
            if (delta) {
                full += delta;
                onDelta(delta);
            }
        }
    }
    return { text: full.trim(), seconds: (performance.now() - started) / 1000 };
}

export async function chat(system: string, user: string, model = EVAL_MODEL): Promise<Reply> {
    const started = performance.now();
    const res = await fetch(requestUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody(system, user, false, model)),
    });
    if (!res.ok) throw new Error(`${HOST} returned ${res.status} ${res.statusText}`);
    const body = (await res.json()) as OpenAIChatResponse | { message?: { content?: string } };
    const text = isLlamaCpp()
        ? (body as OpenAIChatResponse).choices?.[0]?.message?.content
        : (body as { message?: { content?: string } }).message?.content;
    if (typeof text !== "string") throw new Error(`${HOST} returned no message content`);
    return { text: text.trim(), seconds: (performance.now() - started) / 1000 };
}

/**
 * Explains, once, why a suite is skipping. The plan requires an absent fixture
 * or model to skip loudly — a silent pass here would mean nobody notices the
 * evals stopped running at all.
 * @param model The model that could not be reached.
 */
export function warnSkipped(model: string): void {
    const startCommand = isLlamaCpp()
        ? `llama serve -hf <model-repository> (requested ${model})`
        : `ollama serve`;
    process.stderr.write(
        `\n  SKIPPED: model "${model}" is not available at ${HOST}.\n` +
            `  Start it with \`${startCommand}\`,\n` +
            `  or point HRAI_MODEL_BACKEND / HRAI_MODEL_HOST / HRAI_EVAL_MODEL elsewhere.\n` +
            `  These evals never pass silently — a green run that tested nothing is worse than a red one.\n\n`,
    );
}
