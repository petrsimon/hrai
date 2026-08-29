/**
 * Claims of the form "the move block is missing" about a script that plainly
 * contains one. This was qwen3:8b's defining failure — it could not tell what
 * sat inside a `forever` — and it is the single most important regression to
 * catch, because the tutor would then teach a child to add a block they have.
 *
 * Each claim is paired with what would have to be present for the claim to be false, and both
 * are tested against the script holding the block the model named rather than the whole project.
 */
export const ABSENCE_CLAIMS = [
    {claimed: /missing.{0,40}(move|10 steps)|no move/i, present: /move \d+ steps/},
    {claimed: /missing.{0,40}(end\b|"end")/i, present: /\bend b\d+/},
];

/**
 * The scripts that define the given aliases, joined, or the whole render when none of them do.
 *
 * Absence is a property of one script, not of the project. In the Space Rover fixture the
 * right- and left-arrow scripts both contain `move 10 steps` while the up-arrow script is
 * missing one — so "a move block is missing" is the correct diagnosis there and a project-wide
 * search for the text would contradict the fixture's own ground truth. Falling back to the whole
 * render matters for the fixture whose answer is `none`, where there is no script to narrow to
 * and any absence claim is a hallucination.
 * @param render The pseudo-Scratch project text.
 * @param aliases Block aliases the model named.
 * @returns The relevant part of the render to test an absence claim against.
 */
export function scriptsFor(render: string, aliases: string[]): string {
    const chunks = render.split(/\n\s*\n/);
    const named = chunks.filter((chunk) =>
        aliases.some((alias) => new RegExp(`^${alias}\\s`, "m").test(chunk)));
    return named.length > 0 ? named.join("\n") : render;
}

