/**
 * Regression for a failure found in live use with a child.
 *
 * Asked how to move a sprite with the arrow keys, the tutor answered:
 *
 *   "V kategorii „Pohyb" najdeš blok „Když se stiskne klávesa"."
 *
 * Both halves were invented. `event_whenkeypressed` lives in "Události", and no block
 * carries that label. The prompt described the child's project but never the palette,
 * so the model had nothing to be right from.
 *
 * The fix was to put the palette in the prompt and tell the tutor to name unfamiliar
 * blocks by opcode. Measured against the pre-fix prompt, the most reliable symptom was
 * not the category claim but invented block aliases: asked the same question, it
 * offered "blok b3" for a project containing only b1 and b2, and made up Czech labels
 * to go with it. Both are asserted here.
 *
 * These assertions are structural: they check the tutor cannot misplace a block or cite
 * one that does not exist, never that it phrases anything a particular way.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { EVAL_MODEL, chat, isModelAvailable, warnSkipped } from "../src/model-client.ts";
import { PALETTE } from "../src/palette.ts";
import { systemPrompt, userPrompt } from "../src/prompt.ts";

const RENDER = `postava: Rover
b1  when green flag clicked
b2    go to x: 0 y: 0`;

const CATEGORIES = [...new Set(PALETTE.map((e) => e.category))];
const BY_OPCODE = new Map(PALETTE.map((e) => [e.opcode, e]));

let available = false;
beforeAll(async () => {
    available = await isModelAvailable(EVAL_MODEL);
    if (!available) warnSkipped(EVAL_MODEL);
});

describe(`block suggestions (${EVAL_MODEL})`, () => {
    // Rungs that are allowed to name a block; rung 1 deliberately does not.
    for (const rung of [3, 4]) {
        it(`cites only real blocks and correct categories at rung ${rung}`, async ({ skip }) => {
            if (!available) skip();

            const { text } = await chat(
                systemPrompt(rung),
                userPrompt(RENDER, "jak udelam aby se rover hybal sipkama? porad nevim"),
            );

            // Aliases must exist in the render. The pre-fix prompt invented them freely
            // at these rungs, which is a dead "find this block" button in the panel.
            const realAliases = new Set(RENDER.match(/\bb\d+\b/g) ?? []);
            const citedAliases = [...new Set(text.match(/\bb\d+\b/g) ?? [])];
            const invented = citedAliases.filter((a) => !realAliases.has(a));
            expect(invented, `invented aliases ${invented.join(", ")} in: ${text}`).toEqual([]);

            const cited = [...new Set(text.match(/\b[a-z]+_[a-z0-9_]+\b/g) ?? [])];

            // Nothing invented.
            for (const opcode of cited) {
                expect(BY_OPCODE.has(opcode), `invented opcode ${opcode} in: ${text}`).toBe(true);
            }

            // If it names a category, the blocks it names must actually live there.
            const namedCategories = CATEGORIES.filter((c) => text.includes(c));
            if (namedCategories.length > 0 && cited.length > 0) {
                const actual = cited.map((o) => BY_OPCODE.get(o)?.category);
                const agrees = namedCategories.some((c) => actual.includes(c));
                expect(agrees, `category mismatch: said ${namedCategories.join("/")}, ` +
                    `but ${cited.join("/")} are in ${actual.join("/")} — ${text}`).toBe(true);
            }
        }, 120_000);
    }
});
