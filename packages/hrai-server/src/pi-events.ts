/**
 * Turns a pi session's event stream into transcript events.
 *
 * The same mapping serves the child's persistent session and an ephemeral one-shot run, so the
 * Záznam tab renders both the same way and a run needs no format of its own.
 */
import type {AssistantMessage, TextContent, ToolResultMessage} from "@earendil-works/pi-ai";
import type {AgentMessage} from "@earendil-works/pi-agent-core";
import type {AgentSession, AgentSessionEvent} from "@earendil-works/pi-coding-agent";
import {publish, type TranscriptPayload} from "./transcript.ts";

export function textOf(content: readonly unknown[] | string): string {
    if (typeof content === "string") return content;
    return content
        .filter((part): part is TextContent => typeof part === "object" && part !== null &&
            (part as {type?: string}).type === "text")
        .map((part) => part.text)
        .join("");
}

export function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
    return message.role === "assistant";
}

/**
 * Text of a tool result, which is what the tab shows and what the log keeps.
 * @param result The tool result as pi reports it.
 * @returns Its text parts joined.
 */
export function toolResultText(result: unknown): string {
    const content = (result as {content?: unknown} | null)?.content;
    return Array.isArray(content) ? textOf(content) : "";
}

/**
 * Forwards a session's events to the transcript for as long as the subscription lives.
 * @param session The pi session to follow.
 * @param owner Whose transcript the events belong to.
 * @param runId Set for an ephemeral run; absent for the child's own session.
 * @param nextTurnId Names each assistant turn; the caller decides the scheme.
 * @returns A function that stops forwarding.
 */
export function forwardSessionEvents(
    session: AgentSession,
    owner: string,
    runId: string | undefined,
    nextTurnId: () => string,
): () => void {
    let turnId = "";
    const tag = (payload: TranscriptPayload): TranscriptPayload =>
        runId === undefined ? payload : {...payload, runId};

    return session.subscribe((event: AgentSessionEvent) => {
        switch (event.type) {
            case "turn_start":
                turnId = nextTurnId();
                return;
            case "message_update": {
                const update = event.assistantMessageEvent;
                if (update.type === "text_delta") {
                    publish(owner, tag({kind: "assistant_delta", turnId, delta: update.delta}));
                } else if (update.type === "thinking_delta") {
                    publish(owner, tag({kind: "thinking_delta", turnId, delta: update.delta}));
                }
                return;
            }
            case "tool_execution_start":
                publish(owner, tag({
                    kind: "tool_start", turnId, callId: event.toolCallId, name: event.toolName, args: event.args,
                }));
                return;
            case "tool_execution_end":
                publish(owner, tag({
                    kind: "tool_end",
                    turnId,
                    callId: event.toolCallId,
                    result: toolResultText(event.result),
                    isError: event.isError,
                }));
                return;
            case "message_end": {
                const message = event.message;
                if (!isAssistantMessage(message)) return;
                publish(owner, tag({
                    kind: "turn_end",
                    turnId,
                    stopReason: message.stopReason,
                    model: `${message.provider}/${message.model}`,
                    ...(message.errorMessage === undefined ? {} : {errorMessage: message.errorMessage}),
                }));
                return;
            }
            default:
                return;
        }
    });
}

/**
 * Replays a session's stored messages as transcript events, for a tab that just connected.
 * @param messages The session's messages, oldest first.
 * @returns Events in the shape the live stream uses, without bookkeeping fields.
 */
export function historyEvents(messages: readonly AgentMessage[]): TranscriptPayload[] {
    const events: TranscriptPayload[] = [];
    let turn = 0;
    let turnId = "";
    const pendingCalls = new Map<string, string>();
    for (const message of messages) {
        if (message.role === "user") {
            turn += 1;
            turnId = `h${turn}`;
            events.push({kind: "user", turnId, text: textOf(message.content)});
        } else if (isAssistantMessage(message)) {
            for (const part of message.content) {
                if (part.type === "text" && part.text) {
                    events.push({kind: "assistant_delta", turnId, delta: part.text});
                } else if (part.type === "thinking" && part.thinking) {
                    events.push({kind: "thinking_delta", turnId, delta: part.thinking});
                } else if (part.type === "toolCall") {
                    pendingCalls.set(part.id, part.name);
                    events.push({kind: "tool_start", turnId, callId: part.id, name: part.name, args: part.arguments});
                }
            }
            events.push({
                kind: "turn_end",
                turnId,
                stopReason: message.stopReason,
                model: `${message.provider}/${message.model}`,
                ...(message.errorMessage === undefined ? {} : {errorMessage: message.errorMessage}),
            });
        } else if (message.role === "toolResult") {
            const result = message as ToolResultMessage;
            events.push({
                kind: "tool_end", turnId, callId: result.toolCallId, result: textOf(result.content), isError: result.isError,
            });
        }
    }
    return events;
}
