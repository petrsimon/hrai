import {gameIdeaPrompt, gamePlanningSystemPrompt, parseGamePlan, type GamePlan} from "./game-plan.ts";
import {chatJson, type Reply} from "./model-client.ts";

type Complete = (system: string, user: string) => Promise<Reply>;

/**
 * Produces a validated proposal from an idea already clarified with the child.
 * The caller must still ask the child to accept it before tutoring against it.
 * @param idea Child-approved game idea.
 * @param complete Model completion dependency.
 * @returns Validated, server-normalized plan.
 */
export async function planGame(idea: string, complete: Complete = chatJson): Promise<GamePlan> {
    const system = gamePlanningSystemPrompt();
    const basePrompt = gameIdeaPrompt(idea);
    let validationError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const correction = attempt === 0 ? "" : [
            "",
            "Předchozí odpověď nebyla platný plán.",
            "Vrať celý opravený JSON objekt v přesném požadovaném tvaru.",
        ].join("\n");
        const reply = await complete(system, `${basePrompt}${correction}`);
        try {
            return {
                ...parseGamePlan(reply.text),
                // The model may summarize or embellish this field. The north star is
                // child-authored data, so preserve the accepted idea byte-for-byte.
                originalGoal: idea,
            };
        } catch (error) {
            validationError = error;
        }
    }

    throw new Error("Game planner returned invalid structured output twice", {cause: validationError});
}
