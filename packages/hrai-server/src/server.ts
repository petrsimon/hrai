/**
 * The hrai socket server.
 *
 * One socket.io connection is one child at one editor. The panel pushes workspace
 * changes; the server answers questions against the state it already holds.
 */
import { createServer } from "node:http";
import { Server } from "socket.io";
import { EVAL_MODEL, chatStream } from "./model-client.ts";
import { PALETTE, labelText, opcodesNamedByLabel } from "./palette.ts";
import { systemPrompt, userPrompt } from "./prompt.ts";
import { Session } from "./session.ts";
import type { RenderTarget } from "./render.ts";

const PORT = Number(process.env.HRAI_PORT ?? 8791);

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
 * @returns The listening http server, so callers can shut it down.
 */
export function startServer(port = PORT) {
    const http = createServer();
    const io = new Server(http, {
        // The editor is served from a different origin during development.
        cors: { origin: true },
    });

    io.of("/hrai").on("connection", (socket) => {
        const session = new Session();

        socket.on("workspace", (payload: unknown) => {
            const workspace = parseWorkspace(payload);
            if (!workspace) return;
            session.setWorkspace(workspace.targets, workspace.focusedTargetId);
        });

        /**
         * Answers, at the session's current rung.
         * @param question What to answer.
         */
        const answer = (question: string): void => {
            const id = `m${Date.now()}`;
            session.remember("learner", question);
            socket.emit("thinking", { thinking: true });

            void chatStream(
                systemPrompt(session.rung),
                userPrompt(session.render(), question, session.history.slice(0, -1)),
                (delta) => socket.emit("token", { id, delta }),
            )
                .then((reply) => {
                    session.remember("tutor", reply.text);
                    socket.emit("blocks", { id, blocks: blocksNamedIn(reply.text) });
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
            // A new question is a new problem, so the ladder starts again at the bottom.
            session.resetRung();
            answer(question);
        });

        socket.on("hint", () => {
            session.escalate();
            answer("Nerozumím tomu, poraď mi víc.");
        });
    });

    http.listen(port, () => {
        console.log(`hrai server listening on :${port} (model ${EVAL_MODEL})`);
    });
    return http;
}
