export interface TutorPolicyContext {
    rung: number;
    hasGoalContext: boolean;
}

function sentences(text: string): string[] {
    return (text.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
        .map((sentence) => sentence.trim())
        .filter(Boolean);
}

/**
 * Enforces child-ownership constraints before model prose reaches the browser.
 * Prompts remain the first line of control; this guard handles occasional local-model
 * drift deterministically instead of asking an eight-year-old to absorb it.
 * @param text Raw tutor reply.
 * @param context Current hint-policy state.
 * @returns At most two sentences, with a Socratic rung-1 question when unguided.
 */
export function enforceTutorPolicy(text: string, context: TutorPolicyContext): string {
    const concise = sentences(text).slice(0, 2);
    if (context.rung === 1 && !context.hasGoalContext && !concise.some((sentence) => sentence.includes("?"))) {
        const explanation = concise[0]?.replace(/[.!?]+$/, ".");
        const question = "Kterou část svého programu můžeš změnit a potom hru znovu vyzkoušet?";
        return explanation ? `${explanation} ${question}` : question;
    }
    return concise.join(" ");
}
