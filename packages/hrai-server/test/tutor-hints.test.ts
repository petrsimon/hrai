/**
 * Rung-1 hint evals: structural assertions only, never exact text.
 *
 * IMPORTANT: passing this file is not evidence the model understood anything.
 * qwen3:8b passes all of it while answering "co se stane, když stiskneš X?"
 * regardless of the bug — a model that ignored the project entirely would score
 * identically. Comprehension is asserted in diagnosis.test.ts, and the two
 * files must be read together.
 */
import { describe, expect, it, beforeAll } from "vitest";
import fixtures from "./fixtures/tutor-fixtures.json" with { type: "json" };
import { EVAL_MODEL, chat, warnSkipped, isModelAvailable } from "../src/model-client.ts";
import { renderProject, type RenderTarget } from "../src/render.ts";
import { systemPrompt, userPrompt } from "../src/prompt.ts";

function renderFixture(fixture: (typeof fixtures.cases)[number]) {
    return renderProject(fixture.targets as RenderTarget[], fixture.focusedTargetId, "cs");
}

let available = false;
beforeAll(async () => {
    available = await isModelAvailable(EVAL_MODEL);
    if (!available) warnSkipped(EVAL_MODEL);
});

describe(`rung-1 hints (${EVAL_MODEL})`, () => {
    for (const c of fixtures.cases) {
        it(c.id, async ({ skip }) => {
            if (!available) skip();

            const { text: render, aliases } = renderFixture(c);
            const { text } = await chat(systemPrompt(1), userPrompt(render, c.question));

            const realAliases = new Set(aliases.keys());
            const citedAliases = new Set(text.match(/\bb\d+\b/g) ?? []);
            const invented = [...citedAliases].filter((a) => !realAliases.has(a));

            // Structural safety: the panel turns aliases into "find this block"
            // widgets, so an alias that does not exist is a dead button.
            expect(invented, `invented aliases: ${invented.join(", ")}`).toEqual([]);

            // Rung 1 asks; it does not tell.
            expect(text).toContain("?");

            // No complete script handed over. The tutor is not a copilot.
            expect(text.split("\n").length).toBeLessThan(6);

            // Age-appropriate length for an 8-year-old.
            const sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length;
            expect(sentences).toBeLessThanOrEqual(3);

            // Answers a Czech child in Czech.
            expect(text.toLowerCase()).toMatch(/[ěščřžýáíéůú]/);
        });
    }
});
