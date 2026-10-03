import type {Server as HttpServer} from "node:http";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {io, type Socket} from "socket.io-client";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import type {ProjectTutorial} from "../src/project-tutorial.ts";
import {startServer} from "../src/server.ts";
import {HraiStore, SESSION_COOKIE} from "../src/store.ts";
import {startStubProvider, type StubProvider} from "./helpers/stub-provider.ts";

const PORT = 8703;
const EXPLORE_PLAN: ProjectTutorial = {
    mode: "explore",
    title: "Explore the maze",
    overview: "Learn how the maze game works.",
    steps: [
        {id: "tutorial-step-1", title: "Start", goal: "See what begins the game.", instruction: "Click the green flag.", success: "You can explain what starts the game."},
        {id: "tutorial-step-2", title: "Move", goal: "See how the player moves.", instruction: "Try the arrow keys.", success: "You can explain how the player moves."},
        {id: "tutorial-step-3", title: "Reach the goal", goal: "Find how the game ends.", instruction: "Play until you reach the goal.", success: "You can explain what ends the game."},
    ],
};
const REBUILD_PLAN: ProjectTutorial = {
    mode: "rebuild",
    title: "Rebuild the maze",
    overview: "Build a similar maze game in a new project.",
    steps: EXPLORE_PLAN.steps.map((step) => ({
        ...step,
        assessment: {allOf: [{kind: "scriptContains", opcodes: ["event_whenflagclicked"], minimum: 1}]},
    })),
};
const projectTutorialPlanner = vi.fn().mockResolvedValue(EXPLORE_PLAN);
let server: HttpServer | undefined;
let socket: Socket | undefined;
let dataDir: string;
let cookie: string;
let stub: StubProvider;

function connect(): Socket {
    return io(`http://localhost:${PORT}/hrai`, {transports: ["websocket"], extraHeaders: {Cookie: cookie}});
}

beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "hrai-project-tutorial-"));
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
        projectTutorialPlanner,
        store,
        speechToText: {
            isAvailable: () => Promise.resolve(false),
            transcribe: () => Promise.resolve({text: ""}),
        },
    });
    socket = connect();
    await new Promise<void>((resolve, reject) => {
        socket?.on("connect", resolve);
        socket?.on("connect_error", reject);
    });
});

afterAll(async () => {
    socket?.close();
    server?.close();
    await stub.close();
    for (const key of ["HRAI_DATA_DIR", "HRAI_OLLAMA_HOST", "HRAI_OLLAMA_MODELS", "HRAI_PI_MODEL"]) delete process.env[key];
    rmSync(dataDir, {recursive: true, force: true});
});

describe("project tutorial protocol", () => {
    it("proposes generated walkthrough before activating it", async () => {
        if (!socket) throw new Error("socket was never connected");
        socket.emit("workspace", {
            focusedTargetId: "cat",
            targets: [{id: "cat", name: "Cat", isStage: false, blocks: {}}],
        });
        const proposed = new Promise<ProjectTutorial>((resolve) => socket?.once("projectTutorialProposed", resolve));
        socket.emit("projectTutorialPlan", {mode: "explore"});

        expect(await proposed).toEqual(EXPLORE_PLAN);
        expect(projectTutorialPlanner).toHaveBeenCalledWith("explore", expect.stringContaining("postava: Cat"), expect.any(Function));

        const activated = new Promise<Record<string, unknown>>((resolve) => socket?.once("projectTutorialProgress", resolve));
        socket.emit("projectTutorialAccept");
        expect(await activated).toMatchObject({plan: EXPLORE_PLAN, stepIndex: 0, step: EXPLORE_PLAN.steps[0]});
    });

    it("revalidates restored rebuild evidence and advances only when workspace satisfies it", async () => {
        if (!socket) throw new Error("socket was never connected");
        socket.emit("workspace", {focusedTargetId: "cat", targets: []});
        const restored = new Promise<Record<string, unknown>>((resolve) => socket?.once("projectTutorialProgress", resolve));
        socket.emit("projectTutorialRestore", {plan: REBUILD_PLAN, stepIndex: 0});
        expect(await restored).toMatchObject({stepIndex: 0, stepComplete: false, needsNewProject: true});

        const blocked = new Promise<{delta: string}>((resolve) => socket?.once("token", resolve));
        socket.emit("ask", {text: "hotovo"});
        expect((await blocked).delta).toContain("Otevřít nový projekt");

        const activated = new Promise<Record<string, unknown>>((resolve) => socket?.once("projectTutorialProgress", resolve));
        socket.emit("projectTutorialRestore", {plan: REBUILD_PLAN, stepIndex: 0, needsNewProject: false});
        expect(await activated).toMatchObject({stepIndex: 0, stepComplete: false, needsNewProject: false});

        const completed = new Promise<Record<string, unknown>>((resolve) => socket?.once("projectTutorialProgress", resolve));
        socket.emit("workspace", {
            focusedTargetId: "cat",
            targets: [{
                id: "cat",
                name: "Cat",
                isStage: false,
                blocks: {
                    flag: {
                        id: "flag",
                        opcode: "event_whenflagclicked",
                        next: null,
                        parent: null,
                        inputs: {},
                        fields: {},
                        topLevel: true,
                    },
                },
            }],
        });
        expect(await completed).toMatchObject({stepIndex: 0, stepComplete: true});

        const advanced = new Promise<Record<string, unknown>>((resolve) => socket?.once("projectTutorialProgress", resolve));
        socket.emit("projectTutorialNext");
        expect(await advanced).toMatchObject({stepIndex: 1, stepComplete: true});
    });
});
