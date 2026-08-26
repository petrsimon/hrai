import type { Server } from "node:http";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer } from "../src/server.ts";
import type { SpeechToText } from "../src/speech-to-text.ts";

const PORT = 8701;
let server: Server | undefined;
let socket: Socket | undefined;
let capabilities: Promise<{available: boolean; languages: string[]}>;

const fakeSpeechToText: SpeechToText = {
    isAvailable: () => Promise.resolve(true),
    transcribe: input => Promise.resolve({
        text: input.languageHint === "en" ? "move ten steps" : "posuň se o deset kroků",
        language: input.languageHint ?? "cs",
    }),
};

beforeAll(async () => {
    server = startServer(PORT, {speechToText: fakeSpeechToText});
    const connected = io(`http://localhost:${PORT}/hrai`, {transports: ["websocket"]});
    capabilities = new Promise(resolve => connected.once("voice:capabilities", resolve));
    socket = connected;
    await new Promise<void>((resolve, reject) => {
        connected.once("connect", () => resolve());
        connected.once("connect_error", reject);
    });
});

afterAll(() => {
    socket?.close();
    server?.close();
});

describe("voice socket protocol", () => {
    it("reports capabilities and returns a final transcript", async () => {
        if (!socket) throw new Error("socket was never connected");
        const client = socket;
        await expect(capabilities).resolves.toEqual({available: true, languages: ["cs", "en"]});

        const statuses: string[] = [];
        client.on("voice:status", (payload: {status: string}) => statuses.push(payload.status));
        const transcript = new Promise<{text: string; language: string}>((resolve, reject) => {
            client.once("voice:transcript", resolve);
            client.once("voice:failed", () => reject(new Error("voice transcription failed")));
        });
        const accepted = await new Promise<{accepted: boolean; code?: string}>(resolve => {
            client.emit("voice:submit", {
                requestId: "voice-1",
                mimeType: "audio/webm;codecs=opus",
                durationMs: 500,
                languageHint: "en",
                audio: new Uint8Array([1, 2, 3]),
            }, resolve);
        });

        expect(accepted).toEqual({accepted: true});
        await expect(transcript).resolves.toEqual({
            requestId: "voice-1",
            text: "move ten steps",
            language: "en",
        });
        expect(statuses).toEqual(["accepted", "transcribing"]);
    });

    it("rejects oversized audio before invoking STT", async () => {
        if (!socket) throw new Error("socket was never connected");
        const client = socket;
        const result = await new Promise<{accepted: boolean; code?: string}>(resolve => {
            client.emit("voice:submit", {
                requestId: "too-large",
                mimeType: "audio/webm",
                durationMs: 500,
                audio: new Uint8Array(2 * 1024 * 1024 + 1),
            }, resolve);
        });
        expect(result).toEqual({accepted: false, code: "size_limit"});
    });
});
