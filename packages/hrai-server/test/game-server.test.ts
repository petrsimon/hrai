import type {Server as HttpServer} from "node:http";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {io, type Socket} from "socket.io-client";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import type {GamePlan} from "../src/game-plan.ts";
import {startServer} from "../src/server.ts";
import {HraiStore, SESSION_COOKIE} from "../src/store.ts";
import {startStubProvider, type StubProvider} from "./helpers/stub-provider.ts";

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
let dataDir: string;
/** A signed-in child: planning needs a profile, since the model is called with its credentials. */
let cookie: string;
/** The planner is mocked, but choosing a model for it still needs one the runtime knows. */
let stub: StubProvider;

function connect(): Socket {
    return io(`http://localhost:${PORT}/hrai`, {transports: ["websocket"], extraHeaders: {Cookie: cookie}});
}

beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "hrai-game-server-"));
    process.env.HRAI_DATA_DIR = dataDir;
    stub = await startStubProvider();
    process.env.HRAI_OLLAMA_HOST = stub.baseUrl;
    process.env.HRAI_OLLAMA_MODELS = "stub";
    process.env.HRAI_PI_MODEL = "ollama/stub";
    const store = new HraiStore(dataDir);
    await store.load();
    const child = await store.createUser("kid", "correct horse", "Kid");
    cookie = `${SESSION_COOKIE}=${child.sessionToken}`;
    server = startServer(PORT, {
        gamePlanner,
        store,
        speechToText: {
            isAvailable: () => Promise.resolve(false),
            transcribe: () => Promise.resolve({text: ""}),
        },
    });
    const connected = connect();
    socket = connected;
    await new Promise<void>((resolve, reject) => {
        connected.on("connect", resolve);
        connected.on("connect_error", reject);
    });
});

afterAll(async () => {
    socket?.close();
    server?.close();
    await stub.close();
    for (const key of ["HRAI_DATA_DIR", "HRAI_OLLAMA_HOST", "HRAI_OLLAMA_MODELS", "HRAI_PI_MODEL"]) delete process.env[key];
    rmSync(dataDir, {recursive: true, force: true});
});

describe("goal-driven game protocol", () => {
    it("asks a socket without a profile to sign in instead of planning", async () => {
        const anonymous = io(`http://localhost:${PORT}/hrai`, {transports: ["websocket"]});
        await new Promise<void>((resolve, reject) => {
            anonymous.on("connect", resolve);
            anonymous.on("connect_error", reject);
        });
        const failure = new Promise<{message: string}>((resolve) => anonymous.once("error", resolve));
        const calls = gamePlanner.mock.calls.length;

        anonymous.emit("gamePlan", {text: "Drak hledá poklad v bludišti."});

        expect((await failure).message).toMatch(/Přihlas se/);
        expect(gamePlanner.mock.calls).toHaveLength(calls);
        anonymous.close();
    });

    it("requires child acceptance before activating a proposed plan", async () => {
        if (!socket) throw new Error("socket was never connected");

        const proposed = new Promise<GamePlan>((resolve) => socket?.once("gamePlanProposed", resolve));
        socket.emit("gamePlan", {text: "Drak hledá poklad v bludišti."});
        expect(await proposed).toEqual(PLAN);
        expect(gamePlanner).toHaveBeenCalledWith("Drak hledá poklad v bludišti.", expect.any(Function));

        const playtest = new Promise<Record<string, unknown>>((resolve) => socket?.once("gamePlaytest", resolve));
        socket.emit("gamePlanAccept");
        expect(await playtest).toMatchObject({plan: PLAN});

        const activated = new Promise<Record<string, unknown>>((resolve) => socket?.once("gameProgress", resolve));
        socket.emit("gameGuide");
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

    it("emits completion again when a completed milestone is broken and repaired", async () => {
        const connected = connect();
        await new Promise<void>((resolve, reject) => {
            connected.on("connect", resolve);
            connected.on("connect_error", reject);
        });

        try {
            const restored = new Promise<void>((resolve) => connected.once("gameProgress", () => resolve()));
            connected.emit("gameRestore", {plan: PLAN, milestoneIndex: 0, phase: "guided"});
            await restored;

            let completions = 0;
            connected.on("gameMilestoneComplete", () => {
                completions += 1;
            });
            connected.emit("workspace", COMPLETING_WORKSPACE);
            await new Promise<void>((resolve) => connected.once("gameMilestoneComplete", () => resolve()));
            connected.emit("workspace", {focusedTargetId: "dragon", targets: []});
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(completions).toBe(1);

            connected.emit("workspace", COMPLETING_WORKSPACE);
            await new Promise<void>((resolve) => connected.once("gameMilestoneComplete", () => resolve()));
            expect(completions).toBe(2);
        } finally {
            connected.close();
        }
    });

    it("restores an unfinished playtest without activating tutor guidance", async () => {
        const connected = connect();
        await new Promise<void>((resolve, reject) => {
            connected.on("connect", resolve);
            connected.on("connect_error", reject);
        });

        try {
            const playtest = new Promise<Record<string, unknown>>((resolve) => {
                connected.once("gamePlaytest", resolve);
            });
            connected.emit("gameRestore", {plan: PLAN, milestoneIndex: 0, phase: "playtest"});
            expect(await playtest).toMatchObject({plan: PLAN});

            const progress = new Promise<Record<string, unknown>>((resolve) => {
                connected.once("gameProgress", resolve);
            });
            connected.emit("gameGuide", {feedback: "Chci, aby drak skákal výš."});
            expect(await progress).toMatchObject({milestoneIndex: 0, complete: false, feedback: "Chci, aby drak skákal výš."});
        } finally {
            connected.close();
        }
    });

    it("restores accepted progress without trusting persisted completion", async () => {
        const connected = connect();
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
        const connected = connect();
        await new Promise<void>((resolve, reject) => {
            connected.on("connect", resolve);
            connected.on("connect_error", reject);
        });

        try {
            connected.emit("workspace", COMPLETING_WORKSPACE);
            const proposed = new Promise<GamePlan>((resolve) => connected.once("gamePlanProposed", resolve));
            connected.emit("gamePlan", {text: "Drak hledá poklad v bludišti."});
            await proposed;

            const playtest = new Promise<Record<string, unknown>>((resolve) => {
                connected.once("gamePlaytest", resolve);
            });
            connected.emit("gamePlanAccept");
            await playtest;

            const completed = new Promise<Record<string, unknown>>((resolve) => {
                connected.once("gameMilestoneComplete", resolve);
            });
            connected.emit("gameGuide");
            expect(await completed).toMatchObject({milestoneIndex: 0, complete: true});
        } finally {
            connected.close();
        }
    });
});
