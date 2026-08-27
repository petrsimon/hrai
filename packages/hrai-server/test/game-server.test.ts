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
        },
        {
            id: "milestone-2",
            title: "Stěny",
            outcome: "Stěny zastaví draka.",
            why: "Stěny tvoří bludiště.",
            concept: "podmínky",
            doneWhen: "Drak neprojde stěnou.",
        },
        {
            id: "milestone-3",
            title: "Poklad",
            outcome: "Drak najde poklad.",
            why: "Poklad je cíl hry.",
            concept: "dotyk",
            doneWhen: "Dotyk pokladu oznámí výhru.",
        },
    ],
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
});
