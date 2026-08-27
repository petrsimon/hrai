/**
 * End-to-end: a socket client, the real server, the real model.
 *
 * The unit tests prove each piece; this proves the wiring — that a workspace push, a
 * question, and a streamed Czech answer survive the trip in both directions.
 */
import type { Server } from "node:http";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EVAL_MODEL, isModelAvailable, warnSkipped } from "../src/model-client.ts";
import { startServer } from "../src/server.ts";

const PORT = 8699;
let server: Server | undefined;
let socket: Socket | undefined;
let available = false;

/**
 * The connected client, or a clear failure if setup did not get that far.
 * @returns The socket.
 */
function client(): Socket {
    if (!socket) throw new Error("socket was never connected; check beforeAll");
    return socket;
}

/** A minimal but real project: flag, forever, move. */
const WORKSPACE = {
    focusedTargetId: "R",
    targets: [
        {
            id: "R",
            name: "Rover",
            isStage: false,
            blocks: {
                h: { id: "h", opcode: "event_whenflagclicked", next: "f", parent: null, inputs: {}, fields: {}, topLevel: true },
                f: {
                    id: "f", opcode: "control_forever", next: null, parent: "h",
                    inputs: { SUBSTACK: { name: "SUBSTACK", block: "m", shadow: null } }, fields: {},
                },
                m: { id: "m", opcode: "motion_movesteps", next: null, parent: "f", inputs: {}, fields: {} },
            },
        },
    ],
};

beforeAll(async () => {
    available = await isModelAvailable(EVAL_MODEL);
    if (!available) warnSkipped(EVAL_MODEL);
    server = startServer(PORT);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const connected = io(`http://localhost:${PORT}/hrai`, { transports: ["websocket"] });
    socket = connected;
    await new Promise<void>((resolve, reject) => {
        connected.on("connect", () => resolve());
        connected.on("connect_error", reject);
    });
}, 60_000);

afterAll(() => {
    socket?.close();
    server?.close();
});

describe("hrai server", () => {
    it("accepts a socket connection", () => {
        expect(client().connected).toBe(true);
    });

    it("answers a question about the pushed workspace", async ({ skip }) => {
        if (!available) skip();

        client().emit("workspace", WORKSPACE);

        const deltas: string[] = [];
        const thinking: boolean[] = [];
        client().on("thinking", (p: { thinking: boolean }) => thinking.push(p.thinking));

        const answer = await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("no reply within 90s")), 90_000);
            client().on("token", (p: { delta: string }) => deltas.push(p.delta));
            client().on("done", () => {
                clearTimeout(timer);
                resolve(deltas.join(""));
            });
            client().on("error", (p: { message: string }) => {
                clearTimeout(timer);
                reject(new Error(p.message));
            });
            client().emit("ask", { text: "proc rover porad utika pryc?" });
        });

        // Buffered until the pedagogical policy has validated the complete reply.
        expect(deltas.length).toBe(1);
        // Answered a Czech child in Czech.
        expect(answer.toLowerCase()).toMatch(/[ěščřžýáíéůú]/);
        // Rung 1 asks rather than tells.
        expect(answer).toContain("?");
        // Any block it cited must exist in this render.
        for (const alias of answer.match(/\bb\d+\b/g) ?? []) {
            expect(["b1", "b2", "b3"], `cited unknown ${alias}: ${answer}`).toContain(alias);
        }
        // The thinking indicator was raised and lowered.
        expect(thinking).toContain(true);
        expect(thinking).toContain(false);
    }, 120_000);

    it("ignores a malformed workspace instead of crashing", () => {
        client().emit("workspace", { nonsense: true });
        client().emit("workspace", null);
        expect(client().connected).toBe(true);
    });

    it("answers deterministically when the active lesson stage is already complete", async () => {
        const board = {
            focusedTargetId: "blue-1",
            targets: [
                { id: "stage", name: "Stage", isStage: true, blocks: {} },
                { id: "blue-1", name: "Blue 1", isStage: false, blocks: {} },
                { id: "blue-2", name: "Blue 2", isStage: false, blocks: {} },
                { id: "red-1", name: "Red 1", isStage: false, blocks: {} },
                { id: "red-2", name: "Red 2", isStage: false, blocks: {} },
            ],
        };

        client().emit("lessonStart", { lessonId: "11-soldier-battle", stageIndex: 0 });
        const completed = new Promise<void>((resolve) => client().once("stageComplete", () => resolve()));
        client().emit("workspace", board);
        await completed;

        const deltas: string[] = [];
        const answer = await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("no deterministic reply within 2s")), 2_000);
            client().on("token", (payload: { delta: string }) => deltas.push(payload.delta));
            client().once("done", () => {
                clearTimeout(timer);
                resolve(deltas.join(""));
            });
            client().emit("ask", { text: "hotovo, co teď?" });
        });

        expect(answer).toContain("Tento krok je hotový");
        expect(answer).toContain("Další krok");
    });

    it("does not let the model acknowledge an incomplete guided stage", async () => {
        client().emit("lessonStart", { lessonId: "11-soldier-battle", stageIndex: 2 });

        const deltas: string[] = [];
        const answer = await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("no grounded reply within 2s")), 2_000);
            client().on("token", (payload: { delta: string }) => deltas.push(payload.delta));
            client().once("done", () => {
                clearTimeout(timer);
                resolve(deltas.join(""));
            });
            client().emit("ask", { text: "ano, hotovo" });
        });

        expect(answer).toContain("Editor zatím nevidí splněnou podmínku");
        expect(answer).toContain("Další krok se objeví automaticky");
    });
});
