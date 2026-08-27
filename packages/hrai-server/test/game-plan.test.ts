import {describe, expect, it} from "vitest";
import {parseGamePlan} from "../src/game-plan.ts";

const VALID_PLAN = {
    title: "Dračí bludiště",
    originalGoal: "Proveď draka bludištěm a najdi poklad.",
    coreLoop: "Hráč pohybuje drakem, vyhýbá se stěnám a hledá poklad.",
    milestones: [
        {
            title: "Rozhýbej draka",
            outcome: "Drak se pohybuje šipkami.",
            why: "Bez pohybu nemůže drak hledat poklad.",
            concept: "události a pohyb",
            doneWhen: "Každá šipka posune draka správným směrem.",
        },
        {
            title: "Postav bludiště",
            outcome: "Drak nemůže projít stěnou.",
            why: "Stěny tvoří výzvu bludiště.",
            concept: "podmínky a dotyk",
            doneWhen: "Při dotyku stěny se drak vrátí před ni.",
        },
        {
            title: "Najdi poklad",
            outcome: "Dotyk pokladu ukončí hru.",
            why: "Nalezení pokladu je cíl hry.",
            concept: "zprávy a stav hry",
            doneWhen: "Po dotyku pokladu hra oznámí výhru.",
        },
    ],
};

describe("game plan parser", () => {
    it("accepts a fenced plan and assigns stable milestone ids", () => {
        const parsed = parseGamePlan(`Tady je plán:\n\`\`\`json\n${JSON.stringify(VALID_PLAN)}\n\`\`\``);

        expect(parsed).toEqual({
            ...VALID_PLAN,
            milestones: VALID_PLAN.milestones.map((milestone, index) => ({
                ...milestone,
                id: `milestone-${index + 1}`,
            })),
        });
    });

    it("rejects plans without a small sequence of learning milestones", () => {
        expect(() => parseGamePlan(JSON.stringify({...VALID_PLAN, milestones: []}))).toThrow(/milestones/);
        expect(() => parseGamePlan(JSON.stringify({
            ...VALID_PLAN,
            milestones: Array.from({length: 9}, () => VALID_PLAN.milestones[0]),
        }))).toThrow(/milestones/);
    });

    it("rejects missing or oversized goal fields", () => {
        expect(() => parseGamePlan(JSON.stringify({...VALID_PLAN, originalGoal: ""}))).toThrow(/originalGoal/);
        expect(() => parseGamePlan(JSON.stringify({...VALID_PLAN, coreLoop: "x".repeat(501)}))).toThrow(/coreLoop/);
    });
});
