/**
 * Capability eval for child-led game planning.
 *
 * This suite answers a deployment question rather than testing deterministic code:
 * can the configured local model preserve a child's idea, reduce it to a feasible
 * first game, and turn it into learning milestones without handing over scripts?
 */
import {beforeAll, describe, expect, it} from "vitest";
import {planGame} from "../src/game-planner.ts";
import {EVAL_MODEL, isModelAvailable, warnSkipped} from "../src/model-client.ts";
import {PALETTE} from "../src/palette.ts";

const IDEA = [
    "Chci hru, kde malý drak hledá poklad v bludišti.",
    "Ovládá se šipkami, nesmí projít zdí a vyhraje, když se dotkne pokladu.",
    "Až bude základ fungovat, chci přidat netopýra, který draka honí.",
].join(" ");

const PALETTE_OPCODES = new Set(PALETTE.map((entry) => entry.opcode));
let available = false;

beforeAll(async () => {
    available = await isModelAvailable(EVAL_MODEL);
    if (!available) warnSkipped(EVAL_MODEL);
});

describe(`game design (${EVAL_MODEL})`, () => {
    it("turns a child's idea into a scoped, teachable plan", async ({skip}) => {
        if (!available) skip();

        const plan = await planGame(IDEA);
        const rendered = JSON.stringify(plan).toLowerCase();

        // Preserve the child's north star rather than replacing it with a stock game.
        expect(rendered).toMatch(/drak/);
        expect(rendered).toMatch(/poklad/);
        expect(rendered).toMatch(/bludiště|bludiste/);

        // Build a small playable core before optional complexity such as the enemy.
        expect(plan.milestones.length).toBeGreaterThanOrEqual(3);
        expect(plan.milestones.length).toBeLessThanOrEqual(4);
        const batMilestone = plan.milestones.findIndex((milestone) => /netop|hon/i.test(JSON.stringify(milestone)));
        if (batMilestone >= 0) expect(batMilestone).toBeGreaterThan(1);

        // Every step teaches and has validated structural evidence; no vague "finish the game" stage.
        for (const milestone of plan.milestones) {
            expect(milestone.why.length).toBeGreaterThan(8);
            expect(milestone.concept.length).toBeGreaterThan(2);
            expect(milestone.doneWhen.length).toBeGreaterThan(8);
            expect(milestone.assessment.allOf.length).toBeGreaterThan(0);
        }

        // Hidden evidence may use opcodes, but child-visible planning prose must not expose scripts.
        const childVisibleText = plan.milestones.map(({title, outcome, why, concept, doneWhen}) => (
            [title, outcome, why, concept, doneWhen].join(" ")
        )).join(" ");
        const namedOpcodes = [...new Set(childVisibleText.match(/\b[a-z]+_[a-z0-9_]+\b/g) ?? [])]
            .filter((opcode) => PALETTE_OPCODES.has(opcode));
        expect(namedOpcodes, `planner exposed opcodes to child: ${childVisibleText}`).toEqual([]);
    }, 300_000);
});
