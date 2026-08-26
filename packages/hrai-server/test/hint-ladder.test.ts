/**
 * The hint ladder must escalate in kind, not just in tone.
 *
 * An earlier version instructed only "be more specific" above rung 1, and rungs 3, 4 and
 * 5 returned word-for-word identical answers: the button worked, and gave the child
 * nothing for pressing it. These assertions are about what each rung is allowed to
 * reveal, never about phrasing.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { EVAL_MODEL, chat, isModelAvailable, warnSkipped } from "../src/model-client.ts";
import { PALETTE } from "../src/palette.ts";
import { systemPrompt, userPrompt } from "../src/prompt.ts";

const RENDER = `postava: Rover
b1  when green flag clicked
b2    go to x: 0 y: 0`;
const QUESTION = "jak udelam aby se rover hybal sipkama?";
const OPCODES = new Set(PALETTE.map((e) => e.opcode));

let available = false;
beforeAll(async () => {
    available = await isModelAvailable(EVAL_MODEL);
    if (!available) warnSkipped(EVAL_MODEL);
});

/**
 * Palette opcodes named in a reply.
 * @param text The tutor's reply.
 * @returns The opcodes it cited.
 */
function opcodesIn(text: string): string[] {
    return [...new Set(text.match(/\b[a-z]+_[a-z0-9_]+\b/g) ?? [])].filter((o) => OPCODES.has(o));
}

describe(`hint ladder (${EVAL_MODEL})`, () => {
    it("names no block at the bottom of the ladder", async ({ skip }) => {
        if (!available) skip();
        for (const rung of [1, 2]) {
            const { text } = await chat(systemPrompt(rung), userPrompt(RENDER, QUESTION));
            expect(opcodesIn(text), `rung ${rung} gave a block away: ${text}`).toEqual([]);
        }
    }, 180_000);

    it("names a real block at the top of the ladder", async ({ skip }) => {
        if (!available) skip();
        const { text } = await chat(systemPrompt(5), userPrompt(RENDER, QUESTION));
        expect(opcodesIn(text).length, `rung 5 named no block: ${text}`).toBeGreaterThan(0);
    }, 180_000);

    it("never hands over a complete script", async ({ skip }) => {
        if (!available) skip();
        // The tutor may name blocks at rung 5, but a pasted script is a copilot's answer.
        const { text } = await chat(systemPrompt(5), userPrompt(RENDER, QUESTION));
        expect(text.split("\n").filter((l) => l.trim()).length).toBeLessThan(6);
    }, 180_000);
});
