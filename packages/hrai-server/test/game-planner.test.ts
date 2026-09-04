import {describe, expect, it, vi} from "vitest";
import {planGame} from "../src/game-planner.ts";

const RESPONSE_OBJECT = {
    title: "Dračí bludiště",
    coreLoop: "Pohybuj drakem a hledej cestu k pokladu.",
    milestones: [
        {
            title: "Pohyb",
            outcome: "Drak se pohybuje šipkami.",
            why: "Drak musí prozkoumat bludiště.",
            concept: "události",
            doneWhen: "Šipky pohybují drakem.",
            assessment: {
                allOf: [{
                    kind: "scriptContains",
                    opcodes: ["event_whenkeypressed", "motion_changexby"],
                    minimum: 1,
                }],
            },
        },
        {
            title: "Stěny",
            outcome: "Stěny zastaví draka.",
            why: "Bludiště potřebuje překážky.",
            concept: "podmínky",
            doneWhen: "Drak neprojde stěnou.",
            assessment: {
                allOf: [{
                    kind: "projectContains",
                    opcodes: ["control_if", "sensing_touchingcolor"],
                }],
            },
        },
        {
            title: "Poklad",
            outcome: "Drak může najít poklad.",
            why: "Poklad je cíl hry.",
            concept: "dotyk",
            doneWhen: "Dotyk pokladu oznámí výhru.",
            assessment: {
                allOf: [{
                    kind: "scriptContains",
                    opcodes: ["sensing_touchingobject", "control_repeat_until"],
                    minimum: 1,
                }],
            },
        },
    ],
};
const RESPONSE = JSON.stringify(RESPONSE_OBJECT);

describe("game planner", () => {
    it("uses the planning prompt and validates the reply", async () => {
        const complete = vi.fn().mockResolvedValue({text: RESPONSE, seconds: 1});

        const plan = await planGame("Drak hledá poklad.", complete);

        expect(plan.title).toBe("Dračí bludiště");
        expect(plan.originalGoal).toBe("Drak hledá poklad.");
        expect(plan.milestones[0]?.id).toBe("milestone-1");
        expect(complete).toHaveBeenCalledOnce();
        expect(complete.mock.calls[0]?.[0]).toContain("skrytý assessment");
        expect(complete.mock.calls[0]?.[0]).toContain("event_whenflagclicked =");
        expect(complete.mock.calls[0]?.[0]).toContain("PROTOTYP UŽ OBSAHUJE");
        expect(complete.mock.calls[0]?.[1]).toContain("Drak hledá poklad.");
    });

    it("retries once when the model returns malformed structured output", async () => {
        const complete = vi.fn()
            .mockResolvedValueOnce({text: '{"title":', seconds: 1})
            .mockResolvedValueOnce({text: RESPONSE, seconds: 1});

        const plan = await planGame("Drak hledá poklad.", complete);

        expect(plan.title).toBe("Dračí bludiště");
        expect(complete).toHaveBeenCalledTimes(2);
        expect(complete.mock.calls[1]?.[1]).toContain("Předchozí odpověď nebyla platný plán");
        expect(complete.mock.calls[1]?.[1]).toContain("<predchozi-vystup>");
        expect(complete.mock.calls[1]?.[1]).toContain('{"title":');
    });

    it("retries when a milestone is already satisfied by the starter", async () => {
        const [firstMilestone, ...remainingMilestones] = RESPONSE_OBJECT.milestones;
        if (!firstMilestone) throw new Error("planner fixture must contain a first milestone");
        const alreadySatisfied = JSON.stringify({
            ...RESPONSE_OBJECT,
            milestones: [{
                ...firstMilestone,
                assessment: {
                    allOf: [{
                        kind: "scriptContains",
                        opcodes: ["event_whenflagclicked"],
                        minimum: 1,
                    }],
                },
            }, ...remainingMilestones],
        });
        const complete = vi.fn()
            .mockResolvedValueOnce({text: alreadySatisfied, seconds: 1})
            .mockResolvedValueOnce({text: RESPONSE, seconds: 1});

        await planGame("Drak hledá poklad.", complete);

        expect(complete).toHaveBeenCalledTimes(2);
        expect(complete.mock.calls[1]?.[1]).toContain("Milník 1");
        expect(complete.mock.calls[1]?.[1]).toContain("již splněn");
        expect(complete.mock.calls[1]?.[1]).toContain(alreadySatisfied.slice(0, 2000));
        expect(complete.mock.calls[1]?.[1]).toContain("Vrať celý opravený JSON objekt");
    });
});
