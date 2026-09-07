/**
 * The handshake must finish before the client is told it is connected: socket.io drops a
 * packet that arrives before its listener exists, so an editor's first event would vanish.
 */
import type { Server } from "node:http";
import { io, type Socket } from "socket.io-client";
import { afterEach, expect, it } from "vitest";
import { startServer } from "../src/server.ts";

const PORT = 8702;
let server: Server | undefined;
let socket: Socket | undefined;

afterEach(() => {
    socket?.close();
    server?.close();
});

it("handles an event emitted the moment the socket connects", async () => {
    server = startServer(PORT);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const connected = io(`http://localhost:${PORT}/hrai`, { transports: ["websocket"] });
    socket = connected;

    const progress = new Promise<{ lessonId: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no lessonProgress within 5s")), 5_000);
        connected.once("lessonProgress", (payload: { lessonId: string }) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });
    connected.on("connect", () => connected.emit("lessonStart", { lessonId: "11-soldier-battle", stageIndex: 0 }));

    expect((await progress).lessonId).toBe("11-soldier-battle");
}, 15_000);
