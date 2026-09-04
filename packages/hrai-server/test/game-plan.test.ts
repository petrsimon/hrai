import {describe, expect, it} from "vitest";
import {parseGamePlan} from "../src/game-plan.ts";

const VALID_PLAN = {
    title: "Dračí bludiště",
    coreLoop: "Hráč pohybuje drakem, vyhýbá se stěnám a hledá poklad.",
    milestones: [
        {
            title: "Rozhýbej draka",
            outcome: "Drak se pohybuje šipkami.",
            why: "Bez pohybu nemůže drak hledat poklad.",
            concept: "události a pohyb",
            doneWhen: "Každá šipka posune draka správným směrem.",
            assessment: {
                allOf: [{
                    kind: "scriptContains",
                    opcodes: ["event_whenkeypressed", "motion_changexby"],
                    minimum: 2,
                }],
            },
        },
        {
            title: "Postav bludiště",
            outcome: "Drak nemůže projít stěnou.",
            why: "Stěny tvoří výzvu bludiště.",
            concept: "podmínky a dotyk",
            doneWhen: "Při dotyku stěny se drak vrátí před ni.",
            assessment: {
                allOf: [{
                    kind: "scriptContains",
                    opcodes: ["control_if", "sensing_touchingcolor"],
                    minimum: 1,
                }],
            },
        },
        {
            title: "Najdi poklad",
            outcome: "Dotyk pokladu ukončí hru.",
            why: "Nalezení pokladu je cíl hry.",
            concept: "zprávy a stav hry",
            doneWhen: "Po dotyku pokladu hra oznámí výhru.",
            assessment: {
                allOf: [{
                    kind: "projectContains",
                    opcodes: ["sensing_touchingobject", "looks_say"],
                }],
            },
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

    it("rejects oversized fields at their individual limits", () => {
        expect(() => parseGamePlan(JSON.stringify({...VALID_PLAN, title: "x".repeat(61)}))).toThrow(/title/);
        expect(() => parseGamePlan(JSON.stringify({
            ...VALID_PLAN,
            milestones: [{...VALID_PLAN.milestones[0], outcome: "x".repeat(161)}, ...VALID_PLAN.milestones.slice(1)],
        }))).toThrow(/outcome/);
        expect(() => parseGamePlan(JSON.stringify({
            ...VALID_PLAN,
            milestones: [{...VALID_PLAN.milestones[0], why: "x".repeat(161)}, ...VALID_PLAN.milestones.slice(1)],
        }))).toThrow(/why/);
        expect(() => parseGamePlan(JSON.stringify({
            ...VALID_PLAN,
            milestones: [{...VALID_PLAN.milestones[0], concept: "x".repeat(161)}, ...VALID_PLAN.milestones.slice(1)],
        }))).toThrow(/concept/);
        expect(() => parseGamePlan(JSON.stringify({
            ...VALID_PLAN,
            milestones: [{...VALID_PLAN.milestones[0], doneWhen: "x".repeat(161)}, ...VALID_PLAN.milestones.slice(1)],
        }))).toThrow(/doneWhen/);
        expect(() => parseGamePlan(JSON.stringify({...VALID_PLAN, coreLoop: "x".repeat(201)}))).toThrow(/coreLoop/);
    });

    it("rejects missing, unsupported, or oversized assessment contracts", () => {
        const [firstMilestone, ...remainingMilestones] = VALID_PLAN.milestones;
        if (!firstMilestone) throw new Error("fixture must contain a milestone");
        const {assessment: _assessment, ...withoutAssessment} = firstMilestone;
        expect(() => parseGamePlan(JSON.stringify({
            ...VALID_PLAN,
            milestones: [withoutAssessment, ...remainingMilestones],
        }))).toThrow(/assessment/);

        expect(() => parseGamePlan(JSON.stringify({
            ...VALID_PLAN,
            milestones: [{
                ...firstMilestone,
                assessment: {
                    allOf: [{kind: "projectContains", opcodes: ["dragon_fly"]}],
                },
            }, ...remainingMilestones],
        }))).toThrow(/opcode/);

        expect(() => parseGamePlan(JSON.stringify({
            ...VALID_PLAN,
            milestones: [{
                ...firstMilestone,
                assessment: {
                    allOf: Array.from({length: 5}, () => ({
                        kind: "spriteCountAtLeast",
                        minimum: 1,
                    })),
                },
            }, ...remainingMilestones],
        }))).toThrow(/allOf/);
    });
});
