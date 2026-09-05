import { chat, type Reply } from "./model-client.ts";

/** Matches the store's own cap, so a suggestion never arrives longer than it can be saved. */
const MAX_TITLE_LENGTH = 60;

type Complete = (system: string, user: string) => Promise<Reply>;

/**
 * System prompt for naming a child's project.
 * @returns Czech instructions constraining the model to a bare title.
 */
export function projectTitleSystemPrompt(): string {
    return [
        "Jsi pomocník, který pojmenovává dětské projekty ve Scratchi.",
        "Dostaneš popis projektu v pseudo-Scratchi.",
        "Vrať jen název projektu česky, nejvýše 4 slova.",
        "Název pojmenuj podle toho, co projekt dělá nebo o čem je.",
        "Nepiš uvozovky, tečku, vysvětlení ani nic dalšího — jen samotný název.",
    ].join("\n");
}

/**
 * User turn carrying the rendered workspace.
 * @param workspace Pseudo-Scratch rendering of the child's project.
 * @returns The prompt text, with the project data fenced away from the instructions.
 */
export function projectTitlePrompt(workspace: string): string {
    return [
        "Projekt dítěte (DATA):",
        "<projekt>",
        workspace,
        "</projekt>",
        "Vymysli název tohoto projektu.",
    ].join("\n");
}

/**
 * Reduces a model reply to a usable title.
 *
 * Small models like to answer in a sentence, wrap the answer in quotes, or think out
 * loud across several lines, so take the first non-empty line and strip the decoration.
 * @param reply Raw model text.
 * @returns The cleaned title.
 * @throws {Error} When nothing title-shaped remains.
 */
export function parseProjectTitle(reply: string): string {
    const line = reply
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .split("\n")
        .map((candidate) => candidate.trim())
        .find((candidate) => candidate.length > 0) ?? "";
    const title = line
        .replace(/^[-*\d.\s]+/, "")
        .replace(/^["'„“»]+|["'“”«.]+$/g, "")
        .trim()
        .slice(0, MAX_TITLE_LENGTH)
        .trim();
    if (!title) throw new Error("Model returned no project title");
    return title;
}

/**
 * Names a project from the workspace the session already holds.
 * @param workspace Pseudo-Scratch rendering of the child's project.
 * @param complete Model completion dependency.
 * @returns A short Czech title.
 */
export async function suggestProjectTitle(workspace: string, complete: Complete = chat): Promise<string> {
    const reply = await complete(projectTitleSystemPrompt(), projectTitlePrompt(workspace));
    return parseProjectTitle(reply.text);
}
