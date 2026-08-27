import {gameIdeaPrompt, gamePlanningSystemPrompt, parseGamePlan, type GamePlan} from "./game-plan.ts";
import {chat, type Reply} from "./model-client.ts";

type Complete = (system: string, user: string) => Promise<Reply>;

/**
 * Produces a validated proposal from an idea already clarified with the child.
 * The caller must still ask the child to accept it before tutoring against it.
 * @param idea Child-approved game idea.
 * @param complete Model completion dependency.
 * @returns Validated, server-normalized plan.
 */
export async function planGame(idea: string, complete: Complete = chat): Promise<GamePlan> {
    const reply = await complete(gamePlanningSystemPrompt(), gameIdeaPrompt(idea));
    return parseGamePlan(reply.text);
}
