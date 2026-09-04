export interface TutorPolicyContext {
    rung: number;
    hasGoalContext: boolean;
}

const segmenter = new Intl.Segmenter("cs", { granularity: "sentence" });

/**
 * Splits a reply into sentences the way a Czech reader would.
 *
 * A locale-aware segmenter is used instead of a punctuation regex because the tutor
 * legitimately writes `0.5 sekundy` and `např.`, and a regex split on `.` turned those
 * into sentence boundaries and then discarded the real second sentence.
 * @param text Raw tutor reply.
 * @returns Trimmed, non-empty sentences in order.
 */
function sentences(text: string): string[] {
    const merged: string[] = [];
    for (const { segment } of segmenter.segment(text.trim())) {
        const part = segment.trim();
        if (!part) continue;
        // The segmenter ends a sentence at `?` even inside quotes; a Czech sentence never
        // starts with a lowercase letter, so such a piece belongs to the previous one.
        const previous = merged[merged.length - 1];
        if (previous !== undefined && /^\p{Ll}/u.test(part)) {
            merged[merged.length - 1] = `${previous} ${part}`;
        } else {
            merged.push(part);
        }
    }
    return merged;
}

/**
 * Whether a sentence asks something, judged by how it ends rather than by any `?`
 * inside it — a quoted Scratch predicate such as `klávesa mezerník stisknuta?` is not
 * the tutor asking.
 * @param sentence One sentence.
 * @returns True for an interrogative sentence.
 */
function isQuestion(sentence: string): boolean {
    return /\?["'“”‘’»]*$/u.test(sentence);
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
    if (context.rung === 1 && !context.hasGoalContext && !concise.some(isQuestion)) {
        const explanation = concise[0]?.replace(/[.!?]+$/, ".");
        const question = "Kterou část svého programu můžeš změnit a potom hru znovu vyzkoušet?";
        return explanation ? `${explanation} ${question}` : question;
    }
    return concise.join(" ");
}

/**
 * Removes block aliases the model invented.
 *
 * The panel renders `b7` as a reference to a real block; an alias that does not exist
 * in the current render would be a dead reference pointing an eight-year-old at
 * nothing. Removing it is safer than leaving it, and the caller logs which one.
 * @param text Tutor reply after policy enforcement.
 * @param exists Whether an alias resolves to a block in the current render.
 * @returns The reply with unknown aliases removed, and the aliases that were removed.
 */
export function stripUnknownAliases(
    text: string,
    exists: (alias: string) => boolean,
): { text: string; removed: string[] } {
    const removed: string[] = [];
    const cleaned = text
        .replace(/\bb\d+\b/g, (alias) => {
            if (exists(alias)) return alias;
            removed.push(alias);
            return "";
        })
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.!?;:])/g, "$1")
        .trim();
    return { text: cleaned, removed };
}
