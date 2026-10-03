/**
 * The hrai socket server.
 *
 * One socket.io connection is one child at one editor. The panel pushes workspace
 * changes; the server answers questions against the state it already holds.
 */
import { createServer } from "node:http";
import { Server, type DefaultEventsMap } from "socket.io";
import { handleApiRequest } from "./api.ts";
import {
    parseCookies, HraiStore, SESSION_COOKIE,
    type AssistantPreferences, type AuthenticatedUser,
} from "./store.ts";
import { EVAL_MODEL, chat, chatJson, type ChatOptions } from "./model-client.ts";
import { defaultModelRef, formatModelRef, parseModelRef, resolveModel, runtimeFor, type ResolvedModel } from "./pi-runtime.ts";
import { publish, recentRuns, subscribe as subscribeTranscript } from "./transcript.ts";
import { startLogin, type LoginFlow } from "./provider-login.ts";
import { TOOL_RULES } from "./tutor-tools.ts";
import { tutorSessionFor, type TutorSession } from "./tutor-session.ts";
import { planGame } from "./game-planner.ts";
import {
    parseProjectTutorial,
    planProjectTutorial,
    type ProjectTutorial,
    type ProjectTutorialMode,
} from "./project-tutorial.ts";
import { MAX_GAME_IDEA_LENGTH } from "./game-plan.ts";
import { parseGameRestore } from "./game-restore.ts";
import { suggestProjectTitle } from "./project-title.ts";
import { PALETTE, labelText, opcodesNamedByLabel } from "./palette.ts";
import { systemPrompt, userPrompt } from "./prompt.ts";
import { Session } from "./session.ts";
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

function parseProjectTutorialMode(payload: unknown): ProjectTutorialMode | null {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
    const {mode} = payload as Record<string, unknown>;
    return mode === "explore" || mode === "rebuild" ? mode : null;
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
    projectTutorialPlanner?: typeof planProjectTutorial;
    store?: HraiStore;
}

/** What the handshake middleware hands the connection handler. */
interface HraiSocketData {
    user: AuthenticatedUser | null;
}

/**
 * A whole message that only asserts completion. Anything with more content — a bare
 * "ano" answering the tutor's own question, "mám otázku", a real question — goes to
 * the model.
 */
const COMPLETION_CLAIM =
    /^(?:(?:ano|jo|jasně),?\s+)?(?:už\s+)?(?:hotovo|(?:to\s+)?(?:mám|je)\s+(?:to\s+)?hotov[oéý]|to\s+mám|udělal[a]?\s+jsem\s+to)$/iu;

export function isCompletionClaim(text: string): boolean {
    return COMPLETION_CLAIM.test(text.trim().replace(/\s+/gu, " ").replace(/[.!?]+$/u, ""));
}

const COMPLETION_FOLLOW_UP = /^(?:co|a)\s+(?:dál|teď)/iu;
/** What a socket without a profile hears from anything that would need a model. */
const SIGN_IN_PROMPT = "Přihlas se, ať ti můžu pomáhat.";
const COMPLETED_STEP_CONTEXT =
    "KROK JE HOTOVÝ (editor to ověřil). Odpověz na otázku dítěte, nezadávej nový úkol.";

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
    const io = new Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, HraiSocketData>(http, {
        // The editor is served from a different origin during development.
        cors: { origin: true },
        maxHttpBufferSize: SOCKET_BUFFER_BYTES,
    });
    const hrai = io.of("/hrai");

    // The profile is resolved here rather than in the connection handler. An await in that
    // handler registers the event listeners a tick late, and socket.io drops packets that
    // arrive before a listener exists — the editor's first "session:open" or "workspace"
    // would vanish. Middleware finishes before the client is told it is connected.
    hrai.use((socket, next) => {
        store.load()
            .then(() => store.userForSession(parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE]))
            .then((user) => {
                socket.data.user = user;
                next();
            })
            .catch((error: unknown) => next(error as Error));
    });
    const speechToText = options.speechToText ?? new WhisperSpeechToText();
    const gamePlanner = options.gamePlanner ?? planGame;
    const projectTutorialPlanner = options.projectTutorialPlanner ?? planProjectTutorial;

/**
 * Resolves whose credentials and which model a profile's tutor calls use.
 *
 * A socket without a profile has no credentials, so it gets no model at all: the tutor answers
 * with a sign-in prompt instead of borrowing anyone's account.
 * @param user The signed-in profile, if any.
 * @returns The model reference and the options every completion call takes.
 * @throws {Error} When there is no profile.
 */
async function resolveModelChoice(
    user: { id: string; assistantPreferences: AssistantPreferences } | null,
): Promise<{ model: string; resolved: ResolvedModel; options: ChatOptions }> {
    if (!user) throw new Error("profile required");
    const preferences = user.assistantPreferences;
    const chosen = preferences.model === "default" ? parseModelRef(defaultModelRef()) : parseModelRef(preferences.model);
    if (!chosen) throw new Error(`model reference "${preferences.model}" is unusable`);
    const model = formatModelRef({
        ...chosen,
        ...(preferences.thinkingLevel === "default" ? {} : { thinkingLevel: preferences.thinkingLevel }),
    });
    const runtime = await runtimeFor(user.id);
    return { model, resolved: resolveModel(runtime, model), options: { runtime, owner: user.id } };
}

/**
 * Narrows a login request.
 * @param payload Whatever the socket delivered.
 * @returns The provider and flow, or null when the payload is unusable.
 */
function parseLoginRequest(payload: unknown): { providerId: string; type: "oauth" | "api_key" } | null {
    if (typeof payload !== "object" || payload === null) return null;
    const { providerId, type } = payload as Record<string, unknown>;
    if (typeof providerId !== "string" || !/^[a-z0-9-]{1,64}$/.test(providerId)) return null;
    if (type !== "oauth" && type !== "api_key") return null;
    return { providerId, type };
}

/** What the child hears when the agent ended a turn without delivering anything. */
const NOTHING_DELIVERED = "Teď jsem se zamotal. Zkus mi to říct ještě jednou, prosím.";

/**
 * The project id under which a session file is kept.
 * @param payload Whatever the socket delivered.
 * @returns A safe directory name, or null when the payload is unusable.
 */
function parseProjectId(payload: unknown): string | null {
    if (typeof payload !== "object" || payload === null) return null;
    const { projectId } = payload as Record<string, unknown>;
    if (projectId === null || projectId === undefined || projectId === "") return "unsaved";
    const id = typeof projectId === "number" ? String(projectId) : projectId;
    return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

    hrai.on("connection", (socket) => {
        const user = socket.data.user;
        const session = new Session(user?.assistantPreferences);
        let pendingVoiceRequestId: string | null = null;
        let modelCallPending = false;
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

        // Live transcript events for this child; the history arrives once the project is known.
        const stopTranscript = user ? subscribeTranscript(user.id, (event) => socket.emit("session:event", event)) : () => undefined;

        let projectId = "unsaved";
        let tutor: TutorSession | null = null;
        let tutorOpening: Promise<TutorSession> | null = null;

        /**
         * The agent for this profile and project, opened on first use and reopened when the
         * project changes. Sends the transcript so far once it is open.
         * @returns The shared instance for this socket's project.
         */
        const openTutor = async (): Promise<TutorSession> => {
            if (!user) throw new Error("profile required");
            if (tutor?.key === `${user.id}:${projectId}`) return tutor;
            if (tutorOpening) return tutorOpening;
            tutorOpening = (async () => {
                const { resolved, options } = await resolveModelChoice(user);
                const opened = await tutorSessionFor({
                    userId: user.id, projectId, runtime: options.runtime ?? await runtimeFor(user.id), resolved,
                });
                tutor?.detach();
                tutor = opened;
                socket.emit("session:history", {
                    projectId,
                    events: [...opened.history(), ...recentRuns(user.id)],
                });
                return opened;
            })().finally(() => { tutorOpening = null; });
            return tutorOpening;
        };

        socket.on("session:open", (payload: unknown) => {
            const id = parseProjectId(payload);
            if (!id || !user) return;
            projectId = id;
            openTutor().catch((error: unknown) => {
                console.error("hrai: could not open the tutor session", error);
                socket.emit("session:history", { projectId, events: recentRuns(user.id) });
            });
        });

        socket.on("session:abort", () => {
            void tutor?.abort();
        });

        // One login flow at a time per socket. The credential goes to the profile's own
        // auth.json; only announcements and questions travel over the socket.
        let login: LoginFlow | null = null;

        socket.on("provider:login", (payload: unknown) => {
            const request = parseLoginRequest(payload);
            if (!request) return;
            const { providerId, type } = request;
            if (!user) {
                socket.emit("provider:login:done", { providerId, ok: false, error: "profile required" });
                return;
            }
            if (login) {
                socket.emit("provider:login:done", { providerId, ok: false, error: "another login is running" });
                return;
            }
            void runtimeFor(user.id).then((runtime) => {
                if (!runtime.getProvider(providerId)) {
                    socket.emit("provider:login:done", { providerId, ok: false, error: `unknown provider ${providerId}` });
                    return;
                }
                const flow = startLogin(runtime, providerId, type, {
                    notify: (event) => socket.emit("provider:login:event", { providerId, event }),
                    prompt: (promptId, prompt) => socket.emit("provider:login:prompt", { providerId, promptId, prompt }),
                    withdraw: (promptId) => socket.emit("provider:login:withdraw", { providerId, promptId }),
                });
                login = flow;
                flow.done
                    .then(() => socket.emit("provider:login:done", { providerId, ok: true }))
                    .catch((error: unknown) => {
                        const message = error instanceof Error ? error.message : String(error);
                        console.warn(`hrai: login to ${providerId} for ${user.id} failed: ${message}`);
                        socket.emit("provider:login:done", { providerId, ok: false, error: message });
                    })
                    .finally(() => {
                        if (login === flow) login = null;
                    });
            });
        });

        socket.on("provider:login:answer", (payload: unknown) => {
            if (typeof payload !== "object" || payload === null || !login) return;
            const { promptId, value, cancelled } = payload as Record<string, unknown>;
            if (typeof promptId !== "string") return;
            if (cancelled === true) login.cancel(promptId);
            else if (typeof value === "string") login.answer(promptId, value);
        });

        socket.on("provider:login:cancel", () => {
            login?.cancel();
        });

        socket.on("provider:logout", (payload: unknown) => {
            if (typeof payload !== "object" || payload === null || !user) return;
            const { providerId } = payload as Record<string, unknown>;
            if (typeof providerId !== "string" || !/^[a-z0-9-]{1,64}$/.test(providerId)) return;
            void runtimeFor(user.id)
                .then((runtime) => runtime.logout(providerId))
                .then(() => socket.emit("provider:logout:done", { providerId, ok: true }))
                .catch((error: unknown) => {
                    const message = error instanceof Error ? error.message : String(error);
                    socket.emit("provider:logout:done", { providerId, ok: false, error: message });
                });
        });

        socket.on("disconnect", () => {
            clearInterval(voiceReadinessTimer);
            stopTranscript();
            tutor?.detach();
            tutor = null;
            login?.cancel();
        });

        const emitLessonProgress = (): void => {
            const progress = session.lessonProgress;
            if (progress) socket.emit("lessonProgress", progress);
        };

        const emitGamePlaytest = (): void => {
            const playtest = session.gamePlaytest;
            if (playtest) socket.emit("gamePlaytest", playtest);
        };

        const emitGameProgress = (): void => {
            const progress = session.gameProgress;
            if (progress) socket.emit("gameProgress", progress);
        };

        const evaluateGameProgress = (): void => {
            const progress = session.gameProgress;
            const wasComplete = progress?.complete ?? false;
            if (progress && session.evaluateGameMilestone() && !wasComplete) {
                socket.emit("gameMilestoneComplete", session.gameProgress);
            }
        };

        const emitProjectTutorialProgress = (): void => {
            const progress = session.projectTutorialProgress;
            if (progress) socket.emit("projectTutorialProgress", progress);
        };

        const evaluateProjectTutorialProgress = (): void => {
            const progress = session.projectTutorialProgress;
            if (progress?.plan.mode !== "rebuild") return;
            const wasComplete = progress.stepComplete;
            const isComplete = session.evaluateProjectTutorialStep();
            if (isComplete !== wasComplete) emitProjectTutorialProgress();
        };

        socket.on("projectTutorialPlan", (payload: unknown) => {
            const mode = parseProjectTutorialMode(payload);
            if (!mode || !session.hasWorkspace) return;
            if (!user) {
                socket.emit("error", {message: SIGN_IN_PROMPT});
                return;
            }
            if (modelCallPending) {
                console.warn("hrai: ignored project-tutorial request while a model call is pending");
                return;
            }
            const project = session.render();
            modelCallPending = true;
            socket.emit("thinking", {thinking: true});
            void resolveModelChoice(user)
                .then(({model, options}) => projectTutorialPlanner(
                    mode,
                    project,
                    (system, prompt) => chatJson(system, prompt, model, "plan", options),
                ))
                .then((plan) => {
                    session.proposeProjectTutorial(plan);
                    socket.emit("projectTutorialProposed", plan);
                })
                .catch((error: unknown) => {
                    console.error("hrai: project tutorial planning failed", error);
                    socket.emit("error", {
                        message: "Návod z tohoto projektu se mi nepodařilo připravit. Zkus to prosím znovu.",
                    });
                })
                .finally(() => {
                    modelCallPending = false;
                    socket.emit("thinking", {thinking: false});
                });
        });

        socket.on("projectTutorialAccept", () => {
            if (!session.acceptProjectTutorial()) return;
            emitProjectTutorialProgress();
        });

        socket.on("projectTutorialCancel", () => {
            session.cancelProposedProjectTutorial();
        });

        socket.on("projectTutorialRestore", (payload: unknown) => {
            if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return;
            const {plan: rawPlan, stepIndex, needsNewProject: rawNeedsNewProject} = payload as Record<string, unknown>;
            if (typeof stepIndex !== "number" || !Number.isInteger(stepIndex) ||
                typeof rawPlan !== "object" || rawPlan === null || Array.isArray(rawPlan)) return;
            const planRecord = rawPlan as Partial<ProjectTutorial>;
            if (planRecord.mode !== "explore" && planRecord.mode !== "rebuild") return;
            let plan: ProjectTutorial;
            try {
                plan = parseProjectTutorial(planRecord.mode, JSON.stringify(rawPlan));
            } catch (error) {
                console.warn("hrai: rejected invalid restored project tutorial", error);
                return;
            }
            const needsNewProject = plan.mode === "rebuild" && rawNeedsNewProject !== false;
            if (session.restoreProjectTutorial(plan, stepIndex, needsNewProject)) emitProjectTutorialProgress();
        });

        socket.on("projectTutorialNext", () => {
            if (!session.projectTutorialProgress) return;
            session.nextProjectTutorialStep();
            emitProjectTutorialProgress();
        });

        socket.on("gamePlan", (payload: unknown) => {
            const idea = parseGameIdea(payload);
            if (!idea) return;
            if (!user) {
                socket.emit("error", { message: SIGN_IN_PROMPT });
                return;
            }
            if (modelCallPending) {
                console.warn("hrai: ignored game-plan request while a model call is pending");
                return;
            }
            modelCallPending = true;
            socket.emit("thinking", { thinking: true });
            void resolveModelChoice(user)
                .then(({ model, options }) => gamePlanner(
                    idea,
                    (system, prompt) => chatJson(system, prompt, model, "plan", options),
                ))
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
                .finally(() => {
                    modelCallPending = false;
                    socket.emit("thinking", {thinking: false});
                });
        });

        socket.on("projectTitle", () => {
            const workspace = session.render();
            // Naming an empty stage would only produce a guess about nothing.
            if (!session.hasWorkspace || !user) return;
            if (modelCallPending) {
                console.warn("hrai: ignored project-title request while a model call is pending");
                return;
            }
            modelCallPending = true;
            void resolveModelChoice(user)
                .then(({ model, options }) => suggestProjectTitle(
                    workspace,
                    (system, prompt) => chat(system, prompt, model, "title", options),
                ))
                .then((title) => socket.emit("projectTitleSuggested", { title }))
                .catch((error: unknown) => {
                    // The child keeps the default title; nothing about the project is lost.
                    console.warn("hrai: project titling failed", error);
                })
                .finally(() => {
                    modelCallPending = false;
                });
        });

        socket.on("gameRestore", (payload: unknown) => {
            const restored = parseGameRestore(payload);
            if (!restored || !session.restoreGamePlan(restored.plan, restored.milestoneIndex, restored.phase, restored.feedback)) return;
            if (restored.phase === "playtest") {
                emitGamePlaytest();
            } else {
                emitGameProgress();
                evaluateGameProgress();
            }
        });

        socket.on("gamePlanAccept", () => {
            if (session.acceptGamePlan()) emitGamePlaytest();
        });

        socket.on("gameGuide", (payload: unknown) => {
            const storedFeedback = typeof payload === "object" && payload !== null && !Array.isArray(payload) ?
                (payload as Record<string, unknown>).feedback : undefined;
            const feedback = typeof storedFeedback === "string" ? storedFeedback.trim().slice(0, 1000) : "";
            if (session.startGameGuidance(feedback)) {
                if (feedback) session.remember("learner", feedback);
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
            const wasComplete = progress?.complete ?? false;
            if (progress && session.evaluateLessonStage() && !wasComplete) {
                socket.emit("stageComplete", session.lessonProgress);
            }
            evaluateGameProgress();
            evaluateProjectTutorialProgress();
        });

        /**
         * Answers, at the session's current rung.
         * @param question What to answer.
         * @param rememberLearner Whether to add the learner turn to history.
         */
        const answer = (question: string, rememberLearner = true): void => {
            if (modelCallPending) {
                console.warn("hrai: ignored tutor request while a model call is pending");
                return;
            }

            const id = `m${Date.now()}`;
            if (rememberLearner) session.remember("learner", question);
            const render = session.render();
            const rung = session.rung;
            const context = session.tutorContextFor(rung);
            const progress = session.lessonProgress;
            const gameProgress = session.gameProgress;
            const tutorialProgress = session.projectTutorialProgress;
            const stepComplete = Boolean(progress?.complete ?? gameProgress?.complete ?? tutorialProgress?.stepComplete);
            const completionRequest = isCompletionClaim(question) || COMPLETION_FOLLOW_UP.test(question.trim());

            const emitCanned = (text: string): void => {
                socket.emit("token", {id, delta: text});
                socket.emit("blocks", {id, blocks: {}});
                socket.emit("done", {id, rung});
            };

            if (tutorialProgress?.needsNewProject) {
                emitCanned("Nejdřív klikni na Otevřít nový projekt. Původní hra zůstane uložená beze změny.");
                return;
            }

            if (progress?.complete && completionRequest) {
                emitCanned(`Tento krok je hotový: ${progress.stage.success} Klikni na Další krok a budeme pokračovat.`);
                return;
            }

            if (gameProgress?.complete && completionRequest) {
                const hasNextMilestone = gameProgress.milestoneIndex < gameProgress.plan.milestones.length - 1;
                const text = `Tento milník je hotový: ${gameProgress.milestone.doneWhen} ` +
                    (hasNextMilestone ?
                        "Až budeš připravený, klikni na Další milník." :
                        "Dokončil jsi plán své hry.");
                emitCanned(text);
                return;
            }

            if (tutorialProgress?.complete && completionRequest) {
                emitCanned("Skvěle, dokončil jsi celý návod!");
                return;
            }

            if (tutorialProgress?.plan.mode === "rebuild" && tutorialProgress.stepComplete && completionRequest) {
                emitCanned(`Tento krok je hotový: ${tutorialProgress.step.success} Klikni na Další krok a budeme pokračovat.`);
                return;
            }

            if (progress && !progress.complete && isCompletionClaim(question)) {
                emitCanned(`Editor zatím nevidí splněnou podmínku: ${progress.stage.success} ` +
                    "Nemusíš mi psát „hotovo“ — Další krok se objeví automaticky, jakmile ji projekt splní.");
                return;
            }

            if (gameProgress && !gameProgress.complete && isCompletionClaim(question)) {
                emitCanned(`Editor zatím nevidí důkazy pro milník: ${gameProgress.milestone.doneWhen} ` +
                    "Nemusíš mi psát „hotovo“ — dokončení se objeví automaticky, jakmile je projekt splní.");
                return;
            }

            if (tutorialProgress?.plan.mode === "rebuild" && !tutorialProgress.stepComplete && isCompletionClaim(question)) {
                emitCanned(`Editor zatím nevidí splněnou podmínku: ${tutorialProgress.step.success} ` +
                    "Nemusíš mi psát „hotovo“ — další krok se objeví, až ji projekt splní.");
                return;
            }

            if (session.gamePlaytest) {
                emitCanned("Nejdřív si hru vyzkoušej. Až budeš vědět, co chceš změnit, klikni na Začít upravovat.");
                return;
            }

            if (!user) {
                emitCanned(SIGN_IN_PROMPT);
                return;
            }

            modelCallPending = true;
            socket.emit("thinking", {thinking: true});

            // The child's message is whatever `tell_child` delivered, policed inside the tool,
            // so nothing streams to the Hrai tab before the pedagogical check has run.
            void (async () => {
                const { resolved } = await resolveModelChoice(user);
                const agent = await openTutor();
                if (agent.isBusy) throw new Error("hrai: tutor turn already running for this project");
                await agent.useModel(resolved);
                const result = await agent.ask({
                    session,
                    rung,
                    question,
                    systemPrompt: [
                        systemPrompt(rung, context, session.assistantPreferences),
                        ...(stepComplete ? [COMPLETED_STEP_CONTEXT] : []),
                        TOOL_RULES,
                    ].join("\n"),
                    userPrompt: userPrompt(render, question),
                });
                if (result.error) throw new Error(result.error);
                if (!result.message) {
                    console.warn(`hrai: the tutor ended a turn without tell_child (rung ${rung}); prose: ${result.prose.slice(0, 200)}`);
                    publish(user.id, { kind: "note", text: "Tah skončil bez tell_child; dítě dostalo náhradní větu." });
                }
                return result.message ?? { text: NOTHING_DELIVERED, blocks: [] };
            })()
                .then((message) => {
                    session.remember("tutor", message.text);
                    socket.emit("token", {id, delta: message.text});
                    socket.emit("blocks", {id, blocks: blocksNamedIn([message.text, ...message.blocks].join(" "))});
                    socket.emit("done", {id, rung});
                })
                .catch((error: unknown) => {
                    // The child sees a calm sentence; the operator sees the cause.
                    console.error("hrai: model call failed", error);
                    const last = session.history.at(-1);
                    if (rememberLearner && last?.role === "learner" && last.text === question) {
                        session.history.pop();
                    }
                    socket.emit("error", {
                        message: "Teď se mi nedaří přemýšlet. Zkus to prosím za chvilku znovu.",
                    });
                })
                .finally(() => {
                    modelCallPending = false;
                    socket.emit("thinking", {thinking: false});
                });
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
            if (modelCallPending) {
                console.warn("hrai: ignored hint request while a model call is pending");
                return;
            }
            session.escalate();
            answer("Nerozumím tomu, poraď mi víc.", false);
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
