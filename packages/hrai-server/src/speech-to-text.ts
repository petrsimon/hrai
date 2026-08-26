import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_STT_HOST = process.env.HRAI_STT_HOST ?? "http://whisper:8080";
const DEFAULT_STT_TIMEOUT_MS = Number(process.env.HRAI_STT_TIMEOUT_MS ?? 30_000);

export const STT_LANGUAGES = ["cs", "en"] as const;
export const MAX_VOICE_BYTES = 2 * 1024 * 1024;
export const MAX_VOICE_DURATION_MS = 10_000;

export interface SpeechToTextInput {
    audio: Uint8Array;
    mimeType: string;
    languageHint?: string;
};

export interface SpeechToTextResult {
    text: string;
    language?: string;
};

export interface SpeechToText {
    isAvailable(): Promise<boolean>;
    transcribe(input: SpeechToTextInput): Promise<SpeechToTextResult>;
}

/**
 * Converts browser audio to WAV and sends it to the local whisper.cpp server.
 * Audio exists only in the per-request temporary directory for this operation.
 */
export class WhisperSpeechToText implements SpeechToText {
    private readonly host: string;
    private readonly timeoutMs: number;

    constructor(host = DEFAULT_STT_HOST, timeoutMs = DEFAULT_STT_TIMEOUT_MS) {
        this.host = host.replace(/\/$/, "");
        this.timeoutMs = timeoutMs;
    }

    async isAvailable(): Promise<boolean> {
        try {
            const response = await fetch(this.host, {
                signal: AbortSignal.timeout(2_000),
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async transcribe(input: SpeechToTextInput): Promise<SpeechToTextResult> {
        const directory = await mkdtemp(join(tmpdir(), "hrai-voice-"));
        const inputPath = join(directory, "input.audio");
        const wavPath = join(directory, "input.wav");

        try {
            await writeFile(inputPath, input.audio);
            await execFileAsync("ffmpeg", [
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                inputPath,
                "-ac",
                "1",
                "-ar",
                "16000",
                "-f",
                "wav",
                wavPath,
            ], { timeout: this.timeoutMs });

            const wav = await readFile(wavPath);
            const form = new FormData();
            form.append("file", new Blob([wav], { type: "audio/wav" }), "input.wav");
            form.append("response_format", "json");
            form.append("translate", "false");
            if (input.languageHint && STT_LANGUAGES.includes(input.languageHint as typeof STT_LANGUAGES[number])) {
                form.append("language", input.languageHint);
            }

            const response = await fetch(`${this.host}/inference`, {
                method: "POST",
                body: form,
                signal: AbortSignal.timeout(this.timeoutMs),
            });
            if (!response.ok) {
                throw new Error(`whisper.cpp returned HTTP ${response.status}`);
            }

            const result = await response.json() as { text?: unknown; language?: unknown };
            if (typeof result.text !== "string") {
                throw new Error("whisper.cpp response did not contain text");
            }

            return {
                text: result.text.trim(),
                language: typeof result.language === "string" ? result.language : undefined,
            };
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }
}
