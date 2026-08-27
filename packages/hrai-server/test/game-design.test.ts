/**
 * Capability eval for child-led game planning.
 *
 * This suite answers a deployment question rather than testing deterministic code:
 * can the configured local model preserve a child's idea, reduce it to a feasible
 * first game, and turn it into learning milestones without handing over scripts?
 */
import {beforeAll, describe, expect, it} from "vitest";
import {gameIdeaPrompt, gamePlanningSystemPrompt, parseGamePlan} from "../src/game-plan.ts";
import {EVAL_MODEL, chat, isModelAvailable, warnSkipped} from "../src/model-client.ts";
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

        const {text} = await chat(gamePlanningSystemPrompt(), gameIdeaPrompt(IDEA));
        const plan = parseGamePlan(text);
        const rendered = JSON.stringify(plan).toLowerCase();

        // Preserve the child's north star rather than replacing it with a stock game.
        expect(rendered).toMatch(/drak/);
        expect(rendered).toMatch(/poklad/);
        expect(rendered).toMatch(/bludiště|bludiste/);

        // Build a small playable core before optional complexity such as the enemy.
        expect(plan.milestones.length).toBeGreaterThanOrEqual(3);
        expect(plan.milestones.length).toBeLessThanOrEqual(6);
        const batMilestone = plan.milestones.findIndex((milestone) => /netop|hon/i.test(JSON.stringify(milestone)));
        if (batMilestone >= 0) expect(batMilestone).toBeGreaterThan(1);

        // Every step teaches and has observable evidence; no vague "finish the game" stage.
        for (const milestone of plan.milestones) {
            expect(milestone.why.length).toBeGreaterThan(8);
            expect(milestone.concept.length).toBeGreaterThan(2);
            expect(milestone.doneWhen.length).toBeGreaterThan(8);
        }

        // Planning may name concepts, but must not hand over a ready-made Scratch script.
        const namedOpcodes = [...new Set(text.match(/\b[a-z]+_[a-z0-9_]+\b/g) ?? [])]
            .filter((opcode) => PALETTE_OPCODES.has(opcode));
        expect(namedOpcodes.length, `planner exposed block sequence: ${text}`).toBeLessThanOrEqual(1);
    }, 180_000);
});
