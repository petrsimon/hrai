/**
 * Client for the local model server.
 *
 * The eval suite talks to ollama directly rather than through LiteLLM: LiteLLM
 * is a routing concern, and putting it in front of the evals would mean a
 * routing misconfiguration could masquerade as a model regression.
 */

const HOST = process.env.HRAI_EVAL_HOST ?? "http://localhost:11434";

/** Measured floor. 8B fails these fixtures outright — see the plan's "Model floor". */
export const EVAL_MODEL = process.env.HRAI_EVAL_MODEL ?? "qwen3:14b";

export interface Reply {
    text: string;
    seconds: number;
}

export async function isModelAvailable(model: string): Promise<boolean> {
    try {
        const res = await fetch(`${HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
        if (!res.ok) return false;
        const body = (await res.json()) as { models?: { name: string }[] };
        return (body.models ?? []).some((m) => m.name === model);
    } catch {
        return false;
    }
}

/**
 * Streams a reply, invoking `onDelta` for each chunk as it arrives.
 *
 * A 14B on consumer hardware takes several seconds to finish a sentence; streaming is
 * what keeps a child watching rather than staring at a spinner.
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
    const res = await fetch(`${HOST}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            stream: true,
            think: false,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            options: { temperature: 0.3, num_ctx: 8192 },
        }),
    });
    if (!res.ok) throw new Error(`${HOST} returned ${res.status} ${res.statusText}`);
    if (!res.body) throw new Error(`${HOST} returned no body`);

    const decoder = new TextDecoder();
    let full = "";
    let buffered = "";
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        buffered += decoder.decode(chunk, { stream: true });
        // ollama streams newline-delimited JSON; a chunk can split a line in half.
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
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
    const res = await fetch(`${HOST}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            stream: false,
            think: false,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            // Deterministic: an eval that changes verdict between runs cannot gate a merge.
            options: { temperature: 0, num_ctx: 4096 },
        }),
    });
    if (!res.ok) throw new Error(`${HOST} returned ${res.status} ${res.statusText}`);
    const body = (await res.json()) as { message: { content: string } };
    return { text: body.message.content.trim(), seconds: (performance.now() - started) / 1000 };
}

/**
 * Explains, once, why a suite is skipping. The plan requires an absent fixture
 * or model to skip loudly — a silent pass here would mean nobody notices the
 * evals stopped running at all.
 * @param model The model that could not be reached.
 */
export function warnSkipped(model: string): void {
    // Written straight to stderr: vitest intercepts console.*, and a skip reason
    // that gets swallowed is exactly the silent green run this guards against.
    process.stderr.write(
        `\n  SKIPPED: model "${model}" is not available at ${HOST}.\n` +
            `  Start it with \`ollama serve\` and \`ollama pull ${model}\`,\n` +
            `  or point HRAI_EVAL_HOST / HRAI_EVAL_MODEL elsewhere.\n` +
            `  These evals never pass silently — a green run that tested nothing is worse than a red one.\n\n`,
    );
}
