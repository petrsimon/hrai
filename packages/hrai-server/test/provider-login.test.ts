import {describe, expect, it, vi} from "vitest";
import type {AuthInteraction} from "@earendil-works/pi-ai";
import type {ModelRuntime} from "@earendil-works/pi-coding-agent";
import {startLogin, type LoginRelay} from "../src/provider-login.ts";

/**
 * A runtime whose login flow is the test's own script.
 * @param flow What pi's login would do with the interaction.
 * @returns Something `startLogin` accepts as a runtime, and the login mock to assert on.
 */
function fakeRuntime(flow: (interaction: AuthInteraction) => Promise<void>): {runtime: ModelRuntime; login: ReturnType<typeof vi.fn>} {
    const login = vi.fn((_provider: string, _type: string, interaction: AuthInteraction) =>
        flow(interaction).then(() => ({type: "oauth", refresh: "r", access: "a", expires: 0})));
    return {runtime: {login} as unknown as ModelRuntime, login};
}

function relay() {
    const events: unknown[] = [];
    const prompts: {promptId: string; prompt: unknown}[] = [];
    const withdrawn: string[] = [];
    const seen: LoginRelay = {
        notify: (event) => { events.push(event); },
        prompt: (promptId, prompt) => { prompts.push({promptId, prompt}); },
        withdraw: (promptId) => { withdrawn.push(promptId); },
    };
    return {events, prompts, withdrawn, seen};
}

describe("provider login relay", () => {
    it("relays announcements and questions and feeds the answers back", async () => {
        const answers: string[] = [];
        const {runtime, login} = fakeRuntime(async (interaction) => {
            interaction.notify({type: "auth_url", url: "https://login.example/x"});
            answers.push(await interaction.prompt({
                type: "select", message: "Method?", options: [{id: "browser", label: "Browser"}, {id: "device_code", label: "Device"}],
            }));
            interaction.notify({type: "device_code", userCode: "ABCD-1234", verificationUri: "https://login.example/device"});
            answers.push(await interaction.prompt({type: "manual_code", message: "Paste the code"}));
        });
        const {events, prompts, seen} = relay();

        const flow = startLogin(runtime, "openai-codex", "oauth", seen);
        await vi.waitFor(() => expect(prompts).toHaveLength(1));
        expect(events).toEqual([{type: "auth_url", url: "https://login.example/x"}]);
        expect(prompts[0]).toMatchObject({promptId: "p1", prompt: {type: "select", message: "Method?"}});
        expect(prompts[0]?.prompt).not.toHaveProperty("signal");

        flow.answer("p1", "device_code");
        await vi.waitFor(() => expect(prompts).toHaveLength(2));
        expect(events[1]).toMatchObject({type: "device_code", userCode: "ABCD-1234"});
        flow.answer("p2", "code-xyz");

        await expect(flow.done).resolves.toBeUndefined();
        expect(answers).toEqual(["device_code", "code-xyz"]);
        expect(login).toHaveBeenCalledWith("openai-codex", "oauth", expect.any(Object));
    });

    it("cancelling a prompt rejects it and cancelling the flow aborts pi's signal", async () => {
        let aborted = false;
        const {runtime} = fakeRuntime(async (interaction) => {
            interaction.signal?.addEventListener("abort", () => { aborted = true; });
            try {
                await interaction.prompt({type: "text", message: "Key?"});
            } catch (error) {
                throw new Error(`prompt failed: ${(error as Error).message}`);
            }
        });
        const {prompts, seen} = relay();

        const flow = startLogin(runtime, "openrouter", "api_key", seen);
        await vi.waitFor(() => expect(prompts).toHaveLength(1));
        flow.cancel("p1");
        await expect(flow.done).rejects.toThrow(/cancelled/);
        expect(aborted).toBe(false);

        const second = startLogin(fakeRuntime(async (interaction) => {
            interaction.signal?.addEventListener("abort", () => { aborted = true; });
            await interaction.prompt({type: "text", message: "Key?"});
        }).runtime, "openrouter", "api_key", relay().seen);
        second.cancel();
        await expect(second.done).rejects.toThrow(/cancelled/);
        expect(aborted).toBe(true);
    });

    it("withdraws a prompt the flow resolved on its own", async () => {
        const {runtime} = fakeRuntime(async (interaction) => {
            const controller = new AbortController();
            const pending = interaction.prompt({type: "manual_code", message: "Paste", signal: controller.signal});
            // The browser callback won the race; the pasted-code prompt is moot.
            controller.abort();
            await expect(pending).rejects.toThrow(/withdrawn/);
        });
        const {prompts, withdrawn, seen} = relay();

        const flow = startLogin(runtime, "openai-codex", "oauth", seen);
        await expect(flow.done).resolves.toBeUndefined();
        expect(prompts.map((entry) => entry.promptId)).toEqual(["p1"]);
        expect(withdrawn).toEqual(["p1"]);
        expect(() => flow.answer("p1", "late")).not.toThrow();
    });
});
