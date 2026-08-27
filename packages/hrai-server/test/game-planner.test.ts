import {describe, expect, it, vi} from "vitest";
import {planGame} from "../src/game-planner.ts";

const RESPONSE = JSON.stringify({
    title: "Dračí bludiště",
    originalGoal: "Najdi s drakem poklad v bludišti.",
    coreLoop: "Pohybuj drakem a hledej cestu k pokladu.",
    milestones: [
        {
            title: "Pohyb",
            outcome: "Drak se pohybuje šipkami.",
            why: "Drak musí prozkoumat bludiště.",
            concept: "události",
            doneWhen: "Šipky pohybují drakem.",
        },
        {
            title: "Stěny",
            outcome: "Stěny zastaví draka.",
            why: "Bludiště potřebuje překážky.",
            concept: "podmínky",
            doneWhen: "Drak neprojde stěnou.",
        },
        {
            title: "Poklad",
            outcome: "Drak může najít poklad.",
            why: "Poklad je cíl hry.",
            concept: "dotyk",
            doneWhen: "Dotyk pokladu oznámí výhru.",
        },
    ],
});

describe("game planner", () => {
    it("uses the planning prompt and validates the reply", async () => {
        const complete = vi.fn().mockResolvedValue({text: RESPONSE, seconds: 1});

        const plan = await planGame("Drak hledá poklad.", complete);

        expect(plan.title).toBe("Dračí bludiště");
        expect(plan.milestones[0]?.id).toBe("milestone-1");
        expect(complete).toHaveBeenCalledOnce();
        expect(complete.mock.calls[0]?.[0]).toContain("Nevypisuj bloky");
        expect(complete.mock.calls[0]?.[1]).toContain("Drak hledá poklad.");
    });
});
