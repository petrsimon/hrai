import {MAX_GAME_IDEA_LENGTH, parseGamePlan, type GamePlan} from "./game-plan.ts";
import type {GamePhase} from "./session.ts";

export interface RestoredGame {
    plan: GamePlan;
    milestoneIndex: number;
    phase: GamePhase;
    feedback: string;
}

/**
 * Revalidates browser-persisted custom-game progress at the socket boundary.
 * Completion is intentionally absent: current workspace evidence must prove it again.
 * @param payload Untrusted browser storage payload.
 * @returns Canonical plan and active milestone, or null when unusable.
 */
export function parseGameRestore(payload: unknown): RestoredGame | null {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
    const {plan: storedPlan, milestoneIndex, phase: storedPhase, feedback: storedFeedback} = payload as Record<string, unknown>;
    if (!Number.isInteger(milestoneIndex) || (milestoneIndex as number) < 0) return null;
    const phase = storedPhase === "playtest" || storedPhase === "guided" ? storedPhase : "guided";
    const feedback = typeof storedFeedback === "string" ? storedFeedback.slice(0, 1000) : "";

    try {
        if (typeof storedPlan !== "object" || storedPlan === null || Array.isArray(storedPlan)) return null;
        const storedPlanObject = storedPlan as Record<string, unknown>;
        const originalGoal = storedPlanObject.originalGoal;
        if (typeof originalGoal !== "string") return null;
        const trimmedGoal = originalGoal.trim();
        if (trimmedGoal.length === 0 || trimmedGoal.length > MAX_GAME_IDEA_LENGTH) return null;
        const plan = {
            ...parseGamePlan(JSON.stringify(storedPlan)),
            originalGoal: trimmedGoal,
        };
        if ((milestoneIndex as number) >= plan.milestones.length) return null;
        return {plan, milestoneIndex: milestoneIndex as number, phase, feedback};
    } catch {
        return null;
    }
}
