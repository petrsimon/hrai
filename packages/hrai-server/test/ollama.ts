/**
 * Minimal client for a local OpenAI-compatible model server.
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
