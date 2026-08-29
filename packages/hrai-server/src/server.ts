/**
 * The hrai socket server.
 *
 * One socket.io connection is one child at one editor. The panel pushes workspace
 * changes; the server answers questions against the state it already holds.
 */
import { createServer } from "node:http";
import { Server } from "socket.io";
import { handleApiRequest } from "./api.ts";
import { parseCookies, HraiStore, SESSION_COOKIE } from "./store.ts";
import { EVAL_MODEL, chat } from "./model-client.ts";
import { planGame } from "./game-planner.ts";
import { MAX_GAME_IDEA_LENGTH } from "./game-plan.ts";
import { parseGameRestore } from "./game-restore.ts";
import { PALETTE, labelText, opcodesNamedByLabel } from "./palette.ts";
import { systemPrompt, userPrompt } from "./prompt.ts";
import { Session } from "./session.ts";
import { enforceTutorPolicy } from "./tutor-policy.ts";
import type { RenderTarget } from "./render.ts";
import {
    MAX_VOICE_BYTES,
    MAX_VOICE_DURATION_MS,
    STT_LANGUAGES,
    WhisperSpeechToText,
    type SpeechToText,
} from "./speech-to-text.ts";

const PORT = Number(process.env.HRAI_PORT ?? 8791);
const SOCKET_BUFFER_BYTES = MAX_VOICE_BYTES + 64 * 1024;

/**
 * Narrows an incoming workspace push.
 *
 * Payloads arrive from a browser, so this is a trust boundary and the guards are real
 * rather than defensive noise: a malformed push must be dropped, not crash the child's
 * session.
 * @param payload Whatever the socket delivered.
 * @returns The workspace, or null when the payload is unusable.
 */
function parseWorkspace(payload: unknown): { targets: RenderTarget[]; focusedTargetId: string } | null {
    if (typeof payload !== "object" || payload === null) return null;
    const { targets, focusedTargetId } = payload as Record<string, unknown>;
    if (!Array.isArray(targets)) return null;
    if (typeof focusedTargetId !== "string") return null;
    return { targets: targets as RenderTarget[], focusedTargetId };
}

/**
 * Narrows an incoming question.
 * @param payload Whatever the socket delivered.
 * @returns The trimmed question, or null when there is nothing to answer.
 */
function parseQuestion(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) return null;
    const { text } = payload as Record<string, unknown>;
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function parseGameIdea(payload: unknown): string | null {
    const idea = parseQuestion(payload);
    return idea && idea.length <= MAX_GAME_IDEA_LENGTH ? idea : null;
}

interface VoiceSubmission {
    requestId: string;
    mimeType: string;
    durationMs: number;
    audio: Uint8Array;
    languageHint?: string;
};

function parseVoiceSubmission(payload: unknown): VoiceSubmission | { code: string } {
    if (typeof payload !== "object" || payload === null) return { code: "invalid_payload" };
    const { requestId, mimeType, durationMs, audio, languageHint } = payload as Record<string, unknown>;
    if (typeof requestId !== "string" || requestId.length === 0 || requestId.length > 128) {
        return { code: "invalid_payload" };
    }
    if (typeof mimeType !== "string" || !["audio/webm", "audio/ogg"].some((type) => mimeType.startsWith(type))) {
        return { code: "unsupported_format" };
    }
    if (typeof durationMs !== "number" || !Number.isInteger(durationMs) || durationMs < 1 || durationMs > MAX_VOICE_DURATION_MS) {
        return { code: "duration_limit" };
    }
    if (!(audio instanceof Uint8Array) || audio.byteLength === 0 || audio.byteLength > MAX_VOICE_BYTES) {
        return { code: "size_limit" };
    }
    if (languageHint !== undefined && (typeof languageHint !== "string" || !STT_LANGUAGES.includes(languageHint as typeof STT_LANGUAGES[number]))) {
        return { code: "invalid_language" };
    }
    return {
        requestId,
        mimeType,
        durationMs,
        audio,
        ...(typeof languageHint === "string" ? { languageHint } : {}),
    };
}

interface ServerOptions {
    speechToText?: SpeechToText;
    gamePlanner?: typeof planGame;
    store?: HraiStore;
}

const COMPLETION_CLAIM = /(?:^|\s)(?:ano|hotovo|m[aá]m|ud[eě]lal(?:a)?)(?:\s|[,.!?]|$)/iu;

const BY_OPCODE = new Map(PALETTE.map((entry) => [entry.opcode, entry]));

/**
 * Every palette block named in a reply, with the label and category to display.
 *
 * The tutor writes opcodes so it cannot invent a name; the panel needs the real Czech
 * label to show a child, and duplicating the opcode-to-label mapping in the browser
 * would be a second source of truth that drifts.
 * @param text The tutor's reply.
 * @returns Opcode to display label and category, for opcodes that exist.
 */
interface NamedBlock {
    /** Label template, `%1` still marking input slots, for display. */
    label: string;
    /** Label as prose, used by the panel to find the label in the reply text. */
    plainLabel: string;
    category: string;
    categoryKey: string;
}

function blocksNamedIn(text: string): Record<string, NamedBlock> {
    const named: Record<string, NamedBlock> = {};
    const cited = new Set([...(text.match(/\b[a-z]+_[a-z0-9_]+\b/g) ?? []), ...opcodesNamedByLabel(text)]);
    for (const token of cited) {
        const entry = BY_OPCODE.get(token);
        // Structural guarantee: a chip renders only for a block that actually exists.
        if (entry) {
            named[token] = {
                label: entry.cs,
                plainLabel: labelText(entry.cs),
                category: entry.category,
                categoryKey: entry.categoryKey,
            };
        }
    }
    return named;
}

/**
 * Starts the socket server and begins accepting editor connections.
 * @param port TCP port to listen on.
 * @param options Optional service dependencies.
 * @param options.speechToText Speech-to-text implementation for voice requests.
 * @param options.gamePlanner Structured game-planning implementation.
 * @returns The listening http server, so callers can shut it down.
 */
export function startServer(port = PORT, options: ServerOptions = {}) {
    const store = options.store ?? new HraiStore();
    const http = createServer((request, response) => {
        if (request.url?.startsWith("/api/")) void handleApiRequest(request, response, store);
    });
    const io = new Server(http, {
        // The editor is served from a different origin during development.
        cors: { origin: true },
        maxHttpBufferSize: SOCKET_BUFFER_BYTES,
    });
    const speechToText = options.speechToText ?? new WhisperSpeechToText();
    const gamePlanner = options.gamePlanner ?? planGame;

    io.of("/hrai").on("connection", async (socket) => {
        await store.load();
        const user = await store.userForSession(parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE]);
        const session = new Session(user?.assistantPreferences);
        let pendingVoiceRequestId: string | null = null;
        let voiceAvailable = false;
        let announcedVoiceAvailability: boolean | undefined;

        const announceVoiceCapabilities = async (): Promise<void> => {
            const available = await speechToText.isAvailable();
            voiceAvailable = available;
            if (announcedVoiceAvailability === available) return;
            announcedVoiceAvailability = available;
            socket.emit("voice:capabilities", { available, languages: STT_LANGUAGES });
        };
        void announceVoiceCapabilities();
        const voiceReadinessTimer = setInterval(() => void announceVoiceCapabilities(), 5_000);
        socket.on("disconnect", () => clearInterval(voiceReadinessTimer));

        const emitLessonProgress = (): void => {
            const progress = session.lessonProgress;
            if (progress) socket.emit("lessonProgress", progress);
        };

        const emitGameProgress = (): void => {
            const progress = session.gameProgress;
            if (progress) socket.emit("gameProgress", progress);
        };

        const evaluateGameProgress = (): void => {
            const progress = session.gameProgress;
            if (progress && !progress.complete && session.evaluateGameMilestone()) {
                socket.emit("gameMilestoneComplete", session.gameProgress);
            }
        };

        socket.on("gamePlan", (payload: unknown) => {
            const idea = parseGameIdea(payload);
            if (!idea) return;
            socket.emit("thinking", { thinking: true });
            void gamePlanner(idea)
                .then((plan) => {
                    session.proposeGamePlan(plan);
                    // Proposal does not steer tutoring until the child accepts it.
                    socket.emit("gamePlanProposed", plan);
                })
                .catch((error: unknown) => {
                    console.error("hrai: game planning failed", error);
                    socket.emit("error", {
                        message: "Plán hry se mi nepodařilo připravit. Zkus nápad popsat ještě jednou.",
                    });
                })
                .finally(() => socket.emit("thinking", { thinking: false }));
        });

        socket.on("gameRestore", (payload: unknown) => {
            const restored = parseGameRestore(payload);
            if (restored && session.restoreGamePlan(restored.plan, restored.milestoneIndex)) {
                emitGameProgress();
                evaluateGameProgress();
            }
        });

        socket.on("gamePlanAccept", () => {
            if (session.acceptGamePlan()) {
                emitGameProgress();
                evaluateGameProgress();
            }
        });

        socket.on("gameMilestoneNext", () => {
            if (session.nextGameMilestone()) {
                emitGameProgress();
                evaluateGameProgress();
            }
        });

        socket.on("lessonStart", (payload: unknown) => {
            if (typeof payload !== "object" || payload === null) return;
            const { lessonId, stageIndex } = payload as Record<string, unknown>;
            if (typeof lessonId !== "string") return;
            const requestedStage = typeof stageIndex === "number" && Number.isInteger(stageIndex) ? stageIndex : 0;
            if (session.startLesson(lessonId, requestedStage)) emitLessonProgress();
        });

        socket.on("lessonNext", () => {
            if (session.nextLessonStage()) emitLessonProgress();
        });

        socket.on("workspace", (payload: unknown) => {
            const workspace = parseWorkspace(payload);
            if (!workspace) return;
            session.setWorkspace(workspace.targets, workspace.focusedTargetId);
            const progress = session.lessonProgress;
            if (progress && !progress.complete && session.evaluateLessonStage()) {
                socket.emit("stageComplete", session.lessonProgress);
            }
            evaluateGameProgress();
        });

        /**
         * Answers, at the session's current rung.
         * @param question What to answer.
         */
        const answer = (question: string): void => {
            const id = `m${Date.now()}`;
            session.remember("learner", question);
            const progress = session.lessonProgress;
            const gameProgress = session.gameProgress;
            const context = session.tutorContext;

            if (progress?.complete) {
                const text = `Tento krok je hotový: ${progress.stage.success} Klikni na Další krok a budeme pokračovat.`;
                session.remember("tutor", text);
                socket.emit("token", { id, delta: text });
                socket.emit("blocks", { id, blocks: {} });
                socket.emit("done", { id, rung: session.rung });
                return;
            }

            if (gameProgress?.complete) {
                const hasNextMilestone = gameProgress.milestoneIndex < gameProgress.plan.milestones.length - 1;
                const text = `Tento milník je hotový: ${gameProgress.milestone.doneWhen} ` +
                    (hasNextMilestone ?
                        "Až budeš připravený, klikni na Další milník." :
                        "Dokončil jsi plán své hry.");
                session.remember("tutor", text);
                socket.emit("token", { id, delta: text });
                socket.emit("blocks", { id, blocks: {} });
                socket.emit("done", { id, rung: session.rung });
                return;
            }

            if (progress && COMPLETION_CLAIM.test(question)) {
                const text = `Editor zatím nevidí splněnou podmínku: ${progress.stage.success} ` +
                    "Nemusíš mi psát „hotovo“ — Další krok se objeví automaticky, jakmile ji projekt splní.";
                session.remember("tutor", text);
                socket.emit("token", { id, delta: text });
                socket.emit("blocks", { id, blocks: {} });
                socket.emit("done", { id, rung: session.rung });
                return;
            }

            if (gameProgress && COMPLETION_CLAIM.test(question)) {
                const text = `Editor zatím nevidí důkazy pro milník: ${gameProgress.milestone.doneWhen} ` +
                    "Nemusíš mi psát „hotovo“ — dokončení se objeví automaticky, jakmile je projekt splní.";
                session.remember("tutor", text);
                socket.emit("token", { id, delta: text });
                socket.emit("blocks", { id, blocks: {} });
                socket.emit("done", { id, rung: session.rung });
                return;
            }

            socket.emit("thinking", { thinking: true });

            // Buffer the model response so pedagogical constraints can be enforced
            // before any prose reaches the child. Streaming raw tokens would make a
            // post-generation safety check cosmetic rather than real.
            void chat(
                systemPrompt(session.rung, context, session.assistantPreferences),
                userPrompt(session.render(), question, session.history.slice(0, -1)),
            )
                .then((reply) => {
                    const text = enforceTutorPolicy(reply.text, {
                        rung: session.rung,
                        hasGoalContext: Boolean(context),
                    });
                    session.remember("tutor", text);
                    socket.emit("token", { id, delta: text });
                    socket.emit("blocks", { id, blocks: blocksNamedIn(text) });
                    socket.emit("done", { id, rung: session.rung });
                })
                .catch((error: unknown) => {
                    // The child sees a calm sentence; the operator sees the cause.
                    console.error("hrai: model call failed", error);
                    socket.emit("error", {
                        message: "Teď se mi nedaří přemýšlet. Zkus to prosím za chvilku znovu.",
                    });
                })
                .finally(() => socket.emit("thinking", { thinking: false }));
        };

        socket.on("ask", (payload: unknown) => {
            const question = parseQuestion(payload);
            if (!question) return;
            // During a guided stage or game milestone, follow-up messages concern the
            // same task. Preserve the learner's requested hint depth until it changes.
            if (!session.tutorContext) session.resetRung();
            answer(question);
        });

        socket.on("hint", () => {
            session.escalate();
            answer("Nerozumím tomu, poraď mi víc.");
        });

        socket.on("voice:submit", (payload: unknown, acknowledge?: (result: { accepted: boolean; code?: string }) => void) => {
            const parsed = parseVoiceSubmission(payload);
            if ("code" in parsed) {
                acknowledge?.({ accepted: false, code: parsed.code });
                return;
            }
            if (!voiceAvailable) {
                acknowledge?.({ accepted: false, code: "stt_unavailable" });
                return;
            }
            if (pendingVoiceRequestId) {
                acknowledge?.({ accepted: false, code: "duplicate_request" });
                return;
            }

            pendingVoiceRequestId = parsed.requestId;
            acknowledge?.({ accepted: true });
            socket.emit("voice:status", { requestId: parsed.requestId, status: "accepted" });
            socket.emit("voice:status", { requestId: parsed.requestId, status: "transcribing" });

            void speechToText.transcribe(parsed)
                .then((result) => {
                    if (!result.text) {
                        socket.emit("voice:failed", { requestId: parsed.requestId, code: "empty_transcript" });
                        return;
                    }
                    socket.emit("voice:transcript", {
                        requestId: parsed.requestId,
                        text: result.text,
                        language: result.language,
                    });
                })
                .catch((error: unknown) => {
                    console.error("hrai: voice transcription failed", error);
                    socket.emit("voice:failed", { requestId: parsed.requestId, code: "stt_failed" });
                })
                .finally(() => {
                    if (pendingVoiceRequestId === parsed.requestId) pendingVoiceRequestId = null;
                });
        });
    });

    http.listen(port, () => {
        console.log(`hrai server listening on :${port} (model ${EVAL_MODEL})`);
    });
    return http;
}
