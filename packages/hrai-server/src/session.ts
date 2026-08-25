/**
 * Per-connection tutoring state.
 *
 * The server holds the current workspace rather than asking for it each turn: the panel
 * pushes changes as they happen, so a question can be answered from state that is
 * already here. That is also what will make solve-detection and the teacher view cheap
 * later.
 */
import { renderProject, type RenderTarget } from "./render.ts";
import type { Turn } from "./prompt.ts";

export class Session {
    private targets: RenderTarget[] = [];
    private focusedTargetId = "";
    private aliases = new Map<string, string>();
    readonly history: Turn[] = [];

    /**
     * Replaces the known workspace.
     * @param targets All targets in the child's project.
     * @param focusedTargetId The sprite the child has selected.
     */
    setWorkspace(targets: RenderTarget[], focusedTargetId: string): void {
        this.targets = targets;
        this.focusedTargetId = focusedTargetId;
    }

    /**
     * Renders the current workspace and refreshes the alias map.
     *
     * Aliases are regenerated per render, so a stale alias from an earlier turn is not
     * silently resolved to whatever now occupies that slot.
     * @returns Pseudo-Scratch text, or a placeholder before the first workspace push.
     */
    render(): string {
        if (this.targets.length === 0) return "(projekt zatim nedorazil)";
        const { text, aliases } = renderProject(this.targets, this.focusedTargetId);
        this.aliases = aliases;
        return text;
    }

    /**
     * Resolves an alias the model used to a real block ID.
     * @param alias An alias such as `b7`.
     * @returns The block ID, or undefined when the alias is stale or invented.
     */
    resolveAlias(alias: string): string | undefined {
        return this.aliases.get(alias);
    }

    /**
     * Records a turn so later prompts carry the conversation.
     * @param role Who spoke.
     * @param text What was said.
     */
    remember(role: Turn["role"], text: string): void {
        this.history.push({ role, text });
    }
}
