import {describe, expect, it} from "vitest";
import {parseGameRestore} from "../src/game-restore.ts";

const PLAN = {
    title: "Dračí bludiště",
    originalGoal: "Drak hledá poklad.",
    coreLoop: "Pohybuj drakem k pokladu.",
    milestones: Array.from({length: 3}, (_, index) => ({
        id: `untrusted-${index}`,
        title: `Krok ${index + 1}`,
        outcome: "Viditelný výsledek.",
        why: "Posune hru k cíli.",
        concept: "události",
        doneWhen: "Projekt obsahuje potřebný skript.",
        assessment: {
            allOf: [{
                kind: "projectContains",
                opcodes: ["event_whenflagclicked"],
            }],
        },
    })),
};

describe("game progress restore parser", () => {
    it("revalidates the plan, normalizes IDs, and ignores persisted completion", () => {
        const restored = parseGameRestore({
            plan: PLAN,
            milestoneIndex: 1,
            complete: true,
        });

        expect(restored).toMatchObject({
            milestoneIndex: 1,
            plan: {
                originalGoal: PLAN.originalGoal,
                milestones: [
                    {id: "milestone-1"},
                    {id: "milestone-2"},
                    {id: "milestone-3"},
                ],
            },
        });
        expect(restored).not.toHaveProperty("complete");
    });

    it("rejects malformed plans and invalid milestone indices", () => {
        expect(parseGameRestore(null)).toBeNull();
        expect(parseGameRestore({plan: {}, milestoneIndex: 0})).toBeNull();
        expect(parseGameRestore({plan: PLAN, milestoneIndex: -1})).toBeNull();
        expect(parseGameRestore({plan: PLAN, milestoneIndex: 3})).toBeNull();
        expect(parseGameRestore({plan: PLAN, milestoneIndex: 1.5})).toBeNull();
    });
});
