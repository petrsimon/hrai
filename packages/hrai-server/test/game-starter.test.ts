import {describe, expect, it} from "vitest";
import {createGameStarter} from "../src/game-starter.ts";
import type {GamePlan} from "../src/game-plan.ts";

const PLAN: GamePlan = {
    title: "Dračí hra",
    originalGoal: "Drak hledá poklad.",
    coreLoop: "Pohybuj drakem k pokladu.",
    milestones: [],
};

describe("custom game starter", () => {
    it("creates a playable movement prototype from the accepted plan", () => {
        const starter = createGameStarter(PLAN);
        const player = starter.targets.find(target => !target.isStage);
        if (!player) throw new Error("starter fixture must contain a player");

        const opcodes = Object.values(player.blocks).map(block => block.opcode);
        expect(opcodes).toEqual(expect.arrayContaining([
            "event_whenflagclicked",
            "event_whenkeypressed",
            "motion_changexby",
            "motion_changeyby",
            "looks_say",
        ]));
        expect(player.blocks["right-event"]?.topLevel).toBe(true);
        expect(player.blocks["right-move"]?.topLevel).toBe(false);
        expect(player.blocks["right-move"]?.parent).toBe("right-event");
        expect(player.blocks["player-say"]?.inputs.MESSAGE).toEqual([1, [10, PLAN.coreLoop]]);
    });
});
