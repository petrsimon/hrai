import type {GamePlan} from "./game-plan.ts";

/** A small Scratch program installed before the child begins tutoring. */
export interface GameStarter {
    targets: GameStarterTarget[];
    monitors: GameStarterMonitor[];
}

export interface GameStarterTarget {
    isStage: boolean;
    name: string;
    blocks: Record<string, GameStarterBlock>;
    variables?: Record<string, [string, unknown]>;
    x?: number;
    y?: number;
}

export interface GameStarterMonitor {
    id: string;
    mode: "default";
    opcode: "data_variable";
    params: {VARIABLE: string};
    spriteName: null;
    value: number;
    width: number;
    height: number;
    x: number;
    y: number;
    visible: boolean;
    sliderMin: number;
    sliderMax: number;
    isDiscrete: boolean;
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

const SCORE_ID = "hrai-score";
const SCORE_NAME = "Skóre";
const numberInput = (value: number): unknown[] => [1, [4, String(value)]];
const textInput = (value: string): unknown[] => [1, [10, value]];
const blockInput = (id: string): unknown[] => [2, id];
const shadowInput = (id: string): unknown[] => [1, id];

const block = (
    id: string,
    opcode: string,
    next: string | null,
    inputs: Record<string, unknown> = {},
    fields: Record<string, unknown> = {},
    x?: number,
    y?: number,
    parent: string | null = null,
    shadow = false,
): GameStarterBlock => ({
    id,
    opcode,
    next,
    parent,
    inputs,
    fields,
    topLevel: parent === null && !shadow,
    shadow,
    ...(x === undefined ? {} : {x}),
    ...(y === undefined ? {} : {y}),
});

const movementCheck = (
    prefix: string,
    key: string,
    opcode: string,
    inputName: string,
    amount: number,
    next: string | null,
    parent: string,
): Record<string, GameStarterBlock> => {
    const ifId = `${prefix}-if`;
    const keyId = `${prefix}-key`;
    const menuId = `${prefix}-key-menu`;
    const moveId = `${prefix}-move`;
    return {
        [ifId]: block(ifId, "control_if", next, {
            CONDITION: blockInput(keyId),
            SUBSTACK: blockInput(moveId),
        }, {}, undefined, undefined, parent),
        [keyId]: block(keyId, "sensing_keypressed", null, {
            KEY_OPTION: shadowInput(menuId),
        }, {}, undefined, undefined, ifId),
        [menuId]: block(menuId, "sensing_keyoptions", null, {}, {
            KEY_OPTION: [key, null],
        }, undefined, undefined, keyId, true),
        [moveId]: block(moveId, opcode, null, {
            [inputName]: numberInput(amount),
        }, {}, undefined, undefined, ifId),
    };
};

/**
 * Creates a deterministic playable collection game from the child's accepted plan.
 * The model supplies the story and learning plan, while this trusted template supplies
 * the executable movement, goal, score, and reset mechanics.
 * @param plan Accepted child game plan.
 * @returns Scratch block graphs to merge into the current editor project.
 */
export function createGameStarter(plan: GamePlan): GameStarter {
    const playerEvent = "player-event";
    const playerSay = "player-say";
    const playerLoop = "player-loop";
    const playerBlocks: Record<string, GameStarterBlock> = {
        [playerEvent]: block(playerEvent, "event_whenflagclicked", playerSay, {}, {}, 40, 40),
        [playerSay]: block(
            playerSay,
            "looks_say",
            playerLoop,
            {MESSAGE: textInput(plan.coreLoop)},
            {},
            undefined,
            undefined,
            playerEvent,
        ),
        [playerLoop]: block(
            playerLoop,
            "control_forever",
            null,
            {SUBSTACK: blockInput("right-if")},
            {},
            undefined,
            undefined,
            playerSay,
        ),
        ...movementCheck("right", "right arrow", "motion_changexby", "DX", 10, "left-if", playerLoop),
        ...movementCheck("left", "left arrow", "motion_changexby", "DX", -10, "up-if", "right-if"),
        ...movementCheck("up", "up arrow", "motion_changeyby", "DY", 10, "down-if", "left-if"),
        ...movementCheck("down", "down arrow", "motion_changeyby", "DY", -10, null, "up-if"),
    };

    const goalEvent = "goal-event";
    const goalPosition = "goal-position";
    const goalLoop = "goal-loop";
    const goalIf = "goal-if";
    const goalTouch = "goal-touch";
    const goalTouchMenu = "goal-touch-menu";
    const goalScore = "goal-score";
    const goalSay = "goal-say";
    const goalRandom = "goal-random";
    const goalRandomX = "goal-random-x";
    const goalRandomY = "goal-random-y";
    const goalBlocks: Record<string, GameStarterBlock> = {
        [goalEvent]: block(goalEvent, "event_whenflagclicked", goalPosition, {}, {}, 40, 40),
        [goalPosition]: block(
            goalPosition,
            "motion_gotoxy",
            goalLoop,
            {X: numberInput(120), Y: numberInput(0)},
            {},
            undefined,
            undefined,
            goalEvent,
        ),
        [goalLoop]: block(
            goalLoop,
            "control_forever",
            null,
            {SUBSTACK: blockInput(goalIf)},
            {},
            undefined,
            undefined,
            goalPosition,
        ),
        [goalIf]: block(goalIf, "control_if", null, {
            CONDITION: blockInput(goalTouch),
            SUBSTACK: blockInput(goalScore),
        }, {}, undefined, undefined, goalLoop),
        [goalTouch]: block(goalTouch, "sensing_touchingobject", null, {
            TOUCHINGOBJECTMENU: shadowInput(goalTouchMenu),
        }, {}, undefined, undefined, goalIf),
        [goalTouchMenu]: block(goalTouchMenu, "sensing_touchingobjectmenu", null, {}, {
            TOUCHINGOBJECTMENU: ["Hráč", null],
        }, undefined, undefined, goalTouch, true),
        [goalScore]: block(goalScore, "data_changevariableby", goalSay, {
            VALUE: numberInput(1),
        }, {
            VARIABLE: [SCORE_NAME, SCORE_ID],
        }, undefined, undefined, goalIf),
        [goalSay]: block(goalSay, "looks_sayforsecs", goalRandom, {
            MESSAGE: textInput("Bod!"),
            SECS: numberInput(0.2),
        }, {}, undefined, undefined, goalScore),
        [goalRandom]: block(goalRandom, "motion_gotoxy", null, {
            X: blockInput(goalRandomX),
            Y: blockInput(goalRandomY),
        }, {}, undefined, undefined, goalSay),
        [goalRandomX]: block(goalRandomX, "operator_random", null, {
            FROM: numberInput(-200),
            TO: numberInput(200),
        }, {}, undefined, undefined, goalRandom),
        [goalRandomY]: block(goalRandomY, "operator_random", null, {
            FROM: numberInput(-140),
            TO: numberInput(140),
        }, {}, undefined, undefined, goalRandom),
    };

    const stageEvent = "stage-event";
    const stageScore = "stage-score";
    const stageSay = "stage-say";
    return {
        targets: [
            {
                isStage: true,
                name: "Stage",
                variables: {[SCORE_ID]: [SCORE_NAME, 0]},
                blocks: {
                    [stageEvent]: block(stageEvent, "event_whenflagclicked", stageScore, {}, {}, 40, 40),
                    [stageScore]: block(stageScore, "data_setvariableto", stageSay, {
                        VALUE: numberInput(0),
                    }, {
                        VARIABLE: [SCORE_NAME, SCORE_ID],
                    }, undefined, undefined, stageEvent),
                    [stageSay]: block(
                        stageSay,
                        "looks_say",
                        null,
                        {MESSAGE: textInput(plan.title)},
                        {},
                        undefined,
                        undefined,
                        stageScore,
                    ),
                },
            },
            {
                isStage: false,
                name: "Hráč",
                x: -120,
                y: 0,
                blocks: playerBlocks,
            },
            {
                isStage: false,
                name: "Cíl",
                x: 120,
                y: 0,
                blocks: goalBlocks,
            },
        ],
        monitors: [{
            id: "hrai-score-monitor",
            mode: "default",
            opcode: "data_variable",
            params: {VARIABLE: SCORE_NAME},
            spriteName: null,
            value: 0,
            width: 0,
            height: 0,
            x: 5,
            y: 5,
            visible: true,
            sliderMin: 0,
            sliderMax: 100,
            isDiscrete: true,
        }],
    };
}
