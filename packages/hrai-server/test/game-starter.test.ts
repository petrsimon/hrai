import {describe, expect, it} from "vitest";
import {createGameStarter, gameStarterToRenderTargets} from "../src/game-starter.ts";
import type {GamePlan} from "../src/game-plan.ts";

const PLAN: GamePlan = {
    title: "Dračí hra",
    originalGoal: "Drak hledá poklad.",
    coreLoop: "Pohybuj drakem k pokladu.",
    milestones: [],
};

describe("custom game starter", () => {
    it("creates a playable collection game from the accepted plan", () => {
        const starter = createGameStarter(PLAN);
        const player = starter.targets.find(target => !target.isStage);
        const goal = starter.targets.find(target => target.name === "Cíl");
        if (!player) throw new Error("starter fixture must contain a player");
        if (!goal) throw new Error("starter fixture must contain a goal");

        const opcodes = Object.values(player.blocks).map(block => block.opcode);
        expect(opcodes).toEqual(expect.arrayContaining([
            "event_whenflagclicked",
            "control_forever",
            "control_if",
            "sensing_keypressed",
            "motion_changexby",
            "motion_changeyby",
            "looks_say",
        ]));
        expect(player.blocks["player-loop"]?.inputs.SUBSTACK).toEqual([2, "right-if"]);
        expect(player.blocks["right-if"]?.parent).toBe("player-loop");
        expect(player.blocks["right-move"]?.topLevel).toBe(false);
        expect(player.blocks["right-move"]?.parent).toBe("right-if");
        expect(player.blocks["right-key-menu"]?.fields.KEY_OPTION).toEqual(["right arrow", null]);
        expect(player.blocks["player-say"]?.inputs.MESSAGE).toEqual([1, [10, PLAN.coreLoop]]);

        expect(Object.values(goal.blocks).map(block => block.opcode)).toEqual(expect.arrayContaining([
            "event_whenflagclicked",
            "control_forever",
            "control_if",
            "sensing_touchingobject",
            "data_changevariableby",
            "motion_gotoxy",
            "operator_random",
        ]));
        expect(goal.blocks["goal-loop"]?.inputs.SUBSTACK).toEqual([2, "goal-if"]);
        expect(goal.blocks["goal-if"]?.inputs).toEqual({
            CONDITION: [2, "goal-touch"],
            SUBSTACK: [2, "goal-score"],
        });
        expect(goal.blocks["goal-score"]?.next).toBe("goal-say");
        expect(goal.blocks["goal-say"]?.next).toBe("goal-random");

        const stage = starter.targets.find(target => target.isStage);
        expect(stage?.variables).toEqual({
            "hrai-score": ["Skóre", 0],
        });
        expect(stage?.blocks["stage-score"]?.opcode).toBe("data_setvariableto");
        expect(starter.monitors).toEqual([
            expect.objectContaining({opcode: "data_variable", visible: true}),
        ]);
    });

    it("converts starter blocks to render targets for structural assessment", () => {
        const starter = createGameStarter(PLAN);
        const targets = gameStarterToRenderTargets(starter);
        const player = targets.find(target => target.name === "Hráč");
        const stage = targets.find(target => target.isStage);
        if (!player) throw new Error("render fixture must contain a player");
        if (!stage) throw new Error("render fixture must contain a stage");

        expect(player.blocks["player-loop"]?.inputs.SUBSTACK).toEqual({
            name: "SUBSTACK",
            block: "right-if",
            shadow: null,
        });
        expect(player.blocks["right-key"]?.inputs.KEY_OPTION).toEqual({
            name: "KEY_OPTION",
            block: null,
            shadow: "right-key-menu",
        });
        expect(player.blocks["right-move"]?.inputs.DX).toEqual({
            name: "DX",
            block: null,
            shadow: null,
        });
        expect(player.blocks["player-event"]?.topLevel).toBe(true);
        expect(player.blocks["right-key-menu"]?.shadow).toBe(true);
        expect(stage.variables).toEqual({"hrai-score": ["Skóre", 0]});
    });
});
