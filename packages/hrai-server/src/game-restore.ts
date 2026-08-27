import {parseGamePlan, type GamePlan} from "./game-plan.ts";

export interface RestoredGame {
    plan: GamePlan;
    milestoneIndex: number;
}

/**
 * Revalidates browser-persisted custom-game progress at the socket boundary.
 * Completion is intentionally absent: current workspace evidence must prove it again.
 * @param payload Untrusted browser storage payload.
 * @returns Canonical plan and active milestone, or null when unusable.
 */
export function parseGameRestore(payload: unknown): RestoredGame | null {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
    const {plan: storedPlan, milestoneIndex} = payload as Record<string, unknown>;
    if (!Number.isInteger(milestoneIndex) || (milestoneIndex as number) < 0) return null;

    try {
        const plan = parseGamePlan(JSON.stringify(storedPlan));
        if ((milestoneIndex as number) >= plan.milestones.length) return null;
        return {plan, milestoneIndex: milestoneIndex as number};
    } catch {
        return null;
    }
}
