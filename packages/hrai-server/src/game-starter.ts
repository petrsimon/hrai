import type {GamePlan} from "./game-plan.ts";

/** A small Scratch program installed before the child begins tutoring. */
export interface GameStarter {
    targets: GameStarterTarget[];
}

export interface GameStarterTarget {
    isStage: boolean;
    name: string;
    blocks: Record<string, GameStarterBlock>;
}

export interface GameStarterBlock {
    id: string;
    opcode: string;
    next: string | null;
    parent: string | null;
    inputs: Record<string, unknown>;
    fields: Record<string, unknown>;
    topLevel: boolean;
    shadow: boolean;
    x?: number;
    y?: number;
}

const numberInput = (value: number): unknown[] => [1, [4, String(value)]];
const textInput = (value: string): unknown[] => [1, [10, value]];

const block = (
    id: string,
    opcode: string,
    next: string | null,
    inputs: Record<string, unknown> = {},
    fields: Record<string, unknown> = {},
    x?: number,
    y?: number,
    parent: string | null = null,
): GameStarterBlock => ({
    id,
    opcode,
    next,
    parent,
    inputs,
    fields,
    topLevel: parent === null,
    shadow: false,
    ...(x === undefined ? {} : {x}),
    ...(y === undefined ? {} : {y}),
});

const keyScript = (prefix: string, key: string, opcode: string, inputName: string, y: number) => {
    const eventId = `${prefix}-event`;
    const moveId = `${prefix}-move`;
    return {
        [eventId]: block(eventId, "event_whenkeypressed", moveId, {}, {KEY_OPTION: [key, null]}, 40, y),
        [moveId]: block(moveId, opcode, null, {[inputName]: numberInput(10)}, {}, 40, y + 80, eventId),
    };
};

/**
 * Creates a deterministic first playable prototype from the child's accepted plan.
 * The prototype deliberately stays small: the child can play it immediately, then
 * replace or extend it while the tutor follows the plan's milestones.
 * @param plan Accepted child game plan.
 * @returns Scratch block graphs to merge into the current editor project.
 */
export function createGameStarter(plan: GamePlan): GameStarter {
    const stageSay = "stage-say";
    const stageEvent = "stage-event";
    const playerEvent = "player-event";
    const playerSay = "player-say";
    const playerBlocks: Record<string, GameStarterBlock> = {
        [playerEvent]: block(playerEvent, "event_whenflagclicked", playerSay, {}, {}, 40, 40),
        [playerSay]: block(playerSay, "looks_say", null, {MESSAGE: textInput(plan.coreLoop)}, {}, 40, 120, playerEvent),
        ...keyScript("right", "right", "motion_changexby", "DX", 220),
        ...keyScript("left", "left", "motion_changexby", "DX", 400),
        ...keyScript("up", "up", "motion_changeyby", "DY", 580),
        ...keyScript("down", "down", "motion_changeyby", "DY", 760),
    };

    return {
        targets: [
            {
                isStage: true,
                name: "Stage",
                blocks: {
                    [stageEvent]: block(stageEvent, "event_whenflagclicked", stageSay, {}, {}, 40, 40),
                    [stageSay]: block(stageSay, "looks_say", null, {MESSAGE: textInput(plan.title)}, {}, 40, 120, stageEvent),
                },
            },
            {
                isStage: false,
                name: "Hráč",
                blocks: playerBlocks,
            },
        ],
    };
}
