import type {Server as HttpServer} from "node:http";
import {io, type Socket} from "socket.io-client";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import type {GamePlan} from "../src/game-plan.ts";
import {startServer} from "../src/server.ts";

const PORT = 8701;
const PLAN: GamePlan = {
    title: "Dračí bludiště",
    originalGoal: "Najdi s drakem poklad.",
    coreLoop: "Pohybuj drakem bludištěm k pokladu.",
    milestones: [
        {
            id: "milestone-1",
            title: "Pohyb",
            outcome: "Drak se pohybuje šipkami.",
            why: "Drak musí hledat cestu.",
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
            id: "milestone-2",
            title: "Stěny",
            outcome: "Stěny zastaví draka.",
            why: "Stěny tvoří bludiště.",
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
            id: "milestone-3",
            title: "Poklad",
            outcome: "Drak najde poklad.",
            why: "Poklad je cíl hry.",
            concept: "dotyk",
            doneWhen: "Dotyk pokladu oznámí výhru.",
            assessment: {
                allOf: [{
                    kind: "projectContains",
                    opcodes: ["sensing_touchingobject", "looks_say"],
                }],
            },
        },
    ],
};

const COMPLETING_WORKSPACE = {
    focusedTargetId: "dragon",
    targets: [{
        id: "dragon",
        name: "Drak",
        isStage: false,
        blocks: {
            event: {
                id: "event",
                opcode: "event_whenkeypressed",
                next: "move",
                parent: null,
                inputs: {},
                fields: {},
                topLevel: true,
            },
            move: {
                id: "move",
                opcode: "motion_changexby",
                next: null,
                parent: "event",
                inputs: {},
                fields: {},
            },
        },
    }],
};

const gamePlanner = vi.fn().mockResolvedValue(PLAN);
let server: HttpServer | undefined;
let socket: Socket | undefined;

beforeAll(async () => {
    server = startServer(PORT, {
        gamePlanner,
        speechToText: {
            isAvailable: () => Promise.resolve(false),
            transcribe: () => Promise.resolve({text: ""}),
        },
    });
    const connected = io(`http://localhost:${PORT}/hrai`, {transports: ["websocket"]});
    socket = connected;
    await new Promise<void>((resolve, reject) => {
        connected.on("connect", resolve);
        connected.on("connect_error", reject);
    });
});

afterAll(() => {
    socket?.close();
    server?.close();
});

describe("goal-driven game protocol", () => {
    it("requires child acceptance before activating a proposed plan", async () => {
        if (!socket) throw new Error("socket was never connected");

        const proposed = new Promise<GamePlan>((resolve) => socket?.once("gamePlanProposed", resolve));
        socket.emit("gamePlan", {text: "Drak hledá poklad v bludišti."});
        expect(await proposed).toEqual(PLAN);
        expect(gamePlanner).toHaveBeenCalledWith("Drak hledá poklad v bludišti.");

        const activated = new Promise<Record<string, unknown>>((resolve) => socket?.once("gameProgress", resolve));
        socket.emit("gamePlanAccept");
        expect(await activated).toMatchObject({
            milestoneIndex: 0,
            milestone: PLAN.milestones[0],
            complete: false,
        });
    });

    it("emits deterministic completion and advances only after the child continues", async () => {
        if (!socket) throw new Error("socket was never connected");

        const completed = new Promise<Record<string, unknown>>((resolve) => {
            socket?.once("gameMilestoneComplete", resolve);
        });
        socket.emit("workspace", COMPLETING_WORKSPACE);
        expect(await completed).toMatchObject({milestoneIndex: 0, complete: true});

        const advanced = new Promise<Record<string, unknown>>((resolve) => socket?.once("gameProgress", resolve));
        socket.emit("gameMilestoneNext");
        expect(await advanced).toMatchObject({
            milestoneIndex: 1,
            milestone: PLAN.milestones[1],
            complete: false,
        });
    });

    it("restores accepted progress without trusting persisted completion", async () => {
        const connected = io(`http://localhost:${PORT}/hrai`, {transports: ["websocket"]});
        await new Promise<void>((resolve, reject) => {
            connected.on("connect", resolve);
            connected.on("connect_error", reject);
        });

        try {
            const restored = new Promise<Record<string, unknown>>((resolve) => {
                connected.once("gameProgress", resolve);
            });
            connected.emit("gameRestore", {
                plan: PLAN,
                milestoneIndex: 1,
                complete: true,
            });
            expect(await restored).toMatchObject({
                plan: PLAN,
                milestoneIndex: 1,
                milestone: PLAN.milestones[1],
                complete: false,
            });
        } finally {
            connected.close();
        }
    });

    it("evaluates cached workspace evidence as soon as a plan is accepted", async () => {
        const connected = io(`http://localhost:${PORT}/hrai`, {transports: ["websocket"]});
        await new Promise<void>((resolve, reject) => {
            connected.on("connect", resolve);
            connected.on("connect_error", reject);
        });

        try {
            connected.emit("workspace", COMPLETING_WORKSPACE);
            const proposed = new Promise<GamePlan>((resolve) => connected.once("gamePlanProposed", resolve));
            connected.emit("gamePlan", {text: "Drak hledá poklad v bludišti."});
            await proposed;

            const completed = new Promise<Record<string, unknown>>((resolve) => {
                connected.once("gameMilestoneComplete", resolve);
            });
            connected.emit("gamePlanAccept");
            expect(await completed).toMatchObject({milestoneIndex: 0, complete: true});
        } finally {
            connected.close();
        }
    });
});
