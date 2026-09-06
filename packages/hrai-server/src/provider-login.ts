/**
 * Logging a profile in to a provider from the editor.
 *
 * pi's login flow talks to a person through an `AuthInteraction`: it announces a URL or a device
 * code and asks questions. Here the person is at a browser, so each announcement and question is
 * relayed over the socket and the answer comes back the same way. The credential lands in the
 * profile's own `auth.json`; nothing about it passes through the socket.
 */
import type {AuthEvent, AuthPrompt, AuthType} from "@earendil-works/pi-ai";
import type {ModelRuntime} from "@earendil-works/pi-coding-agent";

export type LoginPrompt = Omit<AuthPrompt, "signal">;

export interface LoginRelay {
    /** An announcement: a URL to open, a device code, progress. */
    notify(event: AuthEvent): void;
    /** A question, answered later through `LoginFlow.answer` with the same id. */
    prompt(promptId: string, prompt: LoginPrompt): void;
    /** The question with that id is no longer waiting: the flow resolved it on its own. */
    withdraw(promptId: string): void;
}

export interface LoginFlow {
    /** Resolves when the credential is stored; rejects when the flow failed or was cancelled. */
    done: Promise<void>;
    /** Answers the prompt with that id; ignored when no such prompt is waiting. */
    answer(promptId: string, value: string): void;
    /** Cancels the prompt with that id, or the whole flow when no id is given. */
    cancel(promptId?: string): void;
}

/**
 * Starts a login flow and relays it.
 * @param runtime The profile's runtime, which stores the credential.
 * @param providerId Which provider to log in to.
 * @param type Subscription (`oauth`) or key (`api_key`).
 * @param relay Where announcements and questions go.
 * @returns Handles to answer or cancel.
 */
export function startLogin(runtime: ModelRuntime, providerId: string, type: AuthType, relay: LoginRelay): LoginFlow {
    const controller = new AbortController();
    const waiting = new Map<string, {resolve(value: string): void; reject(error: Error): void}>();
    let promptCount = 0;

    const done = runtime.login(providerId, type, {
        signal: controller.signal,
        notify: (event) => relay.notify(event),
        prompt: (prompt) => {
            promptCount += 1;
            const promptId = `p${promptCount}`;
            const {signal, ...visible} = prompt;
            return new Promise<string>((resolve, reject) => {
                waiting.set(promptId, {resolve, reject});
                // The flow may resolve a prompt itself — a browser callback beating a pasted code.
                signal?.addEventListener("abort", () => {
                    if (!waiting.has(promptId)) return;
                    relay.withdraw(promptId);
                    reject(new Error("prompt withdrawn"));
                });
                relay.prompt(promptId, visible);
            }).finally(() => waiting.delete(promptId));
        },
    }).then(() => undefined);

    return {
        done,
        answer: (promptId, value) => waiting.get(promptId)?.resolve(value),
        cancel: (promptId) => {
            if (promptId !== undefined) {
                waiting.get(promptId)?.reject(new Error("cancelled"));
                return;
            }
            for (const pending of waiting.values()) pending.reject(new Error("cancelled"));
            controller.abort();
        },
    };
}
