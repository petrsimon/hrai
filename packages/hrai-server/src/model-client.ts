/**
 * Single completions for the planners, the titler and the evals.
 *
 * Every call goes through pi. The model is a `provider/model[:thinking]` reference resolved
 * against a runtime — the operator's for evals and scripts, a profile's for anything a child
 * triggers — so which provider answers is a matter of configuration, never of code here.
 */
import type {ModelRuntime} from "@earendil-works/pi-coding-agent";
import {completeOnce, type Reply} from "./pi-one-shot.ts";
import {defaultModelRef, isModelReachable, OPERATOR, resolveModel, runtimeFor} from "./pi-runtime.ts";

export type {Reply} from "./pi-one-shot.ts";

/** The model the evals measure. Resolved lazily so an unreachable provider fails a call, not an import. */
export const EVAL_MODEL = process.env.HRAI_EVAL_MODEL ?? defaultModelRef();

export interface ChatOptions {
    /** Whose credentials to call with; the operator's when absent. */
    runtime?: ModelRuntime;
    /** Whose transcript reports the run; the operator's when absent. */
    owner?: string;
}

async function run(
    system: string,
    user: string,
    model: string,
    purpose: string,
    json: boolean,
    options: ChatOptions,
    onDelta?: (delta: string) => void,
): Promise<Reply> {
    const runtime = options.runtime ?? await runtimeFor(OPERATOR);
    return completeOnce({
        runtime,
        resolved: resolveModel(runtime, model),
        system,
        user,
        json,
        purpose,
        owner: options.owner ?? OPERATOR,
        ...(onDelta ? {onDelta} : {}),
    });
}

/**
 * Checks whether a model can be called: the runtime knows it and its provider has credentials.
 * @param model A `provider/model` reference.
 * @param runtime Whose runtime to check; the operator's when absent.
 * @returns Whether a call would be attempted.
 */
export async function isModelAvailable(model = EVAL_MODEL, runtime?: ModelRuntime): Promise<boolean> {
    return isModelReachable(runtime ?? await runtimeFor(OPERATOR), model);
}

/**
 * Streams a reply, invoking `onDelta` for each chunk as it arrives.
 * @param system System prompt.
 * @param user User turn.
 * @param onDelta Called with each token chunk in order.
 * @param model A `provider/model[:thinking]` reference.
 * @param purpose What the call is for, which heads the run in the transcript.
 * @param options Whose runtime and transcript to use.
 * @returns The complete text and elapsed seconds.
 */
export function chatStream(
    system: string,
    user: string,
    onDelta: (delta: string) => void,
    model = EVAL_MODEL,
    purpose = "chat",
    options: ChatOptions = {},
): Promise<Reply> {
    return run(system, user, model, purpose, false, options, onDelta);
}

export function chat(
    system: string,
    user: string,
    model = EVAL_MODEL,
    purpose = "chat",
    options: ChatOptions = {},
): Promise<Reply> {
    return run(system, user, model, purpose, false, options);
}

/**
 * Requests a bare JSON object.
 * @param system System prompt.
 * @param user User turn.
 * @param model A `provider/model[:thinking]` reference.
 * @param purpose What the call is for, which heads the run in the transcript.
 * @param options Whose runtime and transcript to use.
 * @returns JSON text and elapsed seconds.
 */
export function chatJson(
    system: string,
    user: string,
    model = EVAL_MODEL,
    purpose = "chat",
    options: ChatOptions = {},
): Promise<Reply> {
    return run(system, user, model, purpose, true, options);
}

/**
 * Explains, once, why a suite is skipping. The plan requires an absent fixture
 * or model to skip loudly — a silent pass here would mean nobody notices the
 * evals stopped running at all.
 * @param model The model that could not be reached.
 */
export function warnSkipped(model: string): void {
    process.stderr.write(
        `\n  SKIPPED: model "${model}" is not available through pi.\n` +
            `  Give its provider credentials (HRAI_PI_AUTH_PATH, default $HRAI_DATA_DIR/pi/auth.json),\n` +
            `  start the local server named by HRAI_OLLAMA_HOST / HRAI_LLAMA_HOST and list the model in\n` +
            `  HRAI_OLLAMA_MODELS / HRAI_LLAMA_MODELS, or point HRAI_EVAL_MODEL elsewhere.\n` +
            `  These evals never pass silently — a green run that tested nothing is worse than a red one.\n\n`,
    );
}
