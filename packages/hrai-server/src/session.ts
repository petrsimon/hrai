/**
 * Per-connection tutoring state.
 *
 * The server holds the current workspace rather than asking for it each turn: the panel
 * pushes changes as they happen, so a question can be answered from state that is
 * already here. That is also what will make solve-detection and the teacher view cheap
 * later.
 */
import { renderProject, type RenderTarget } from "./render.ts";
import { evaluateLessonStage, lessonStage, type LessonStage } from "./lesson.ts";
import type { Turn } from "./prompt.ts";

/** The gentlest rung, and the most specific one the tutor will ever go to. */
export const FIRST_RUNG = 1;
export const LAST_RUNG = 5;

export class Session {
    private targets: RenderTarget[] = [];
    private focusedTargetId = "";
    private aliases = new Map<string, string>();
    private currentRung: number = FIRST_RUNG;
    private activeLessonId: string | null = null;
    private activeStageIndex = 0;
    private stageComplete = false;
    readonly history: Turn[] = [];

    /**
     * How specific the next answer may be.
     * @returns The current hint-ladder rung.
     */
    get rung(): number {
        return this.currentRung;
    }

    /**
     * Moves one rung up the hint ladder, stopping at the top.
     *
     * Escalation is learner-driven by design: the tutor never decides on its own that a
     * child needs more help, because that is how a tutor turns into a copilot.
     * @returns The new rung.
     */
    escalate(): number {
        this.currentRung = Math.min(this.currentRung + 1, LAST_RUNG);
        return this.currentRung;
    }

    /**
     * Returns to the gentlest rung.
     *
     * A new question is a new problem: carrying a rung-5 mindset into it would hand over
     * an answer the child never asked for.
     */
    resetRung(): void {
        this.currentRung = FIRST_RUNG;
    }

    startLesson(lessonId: string, stageIndex = 0): LessonStage | null {
        const stage = lessonStage(lessonId, stageIndex);
        if (!stage) return null;
        this.activeLessonId = lessonId;
        this.activeStageIndex = stageIndex;
        this.stageComplete = false;
        return stage;
    }

    nextLessonStage(): LessonStage | null {
        if (!this.activeLessonId || !this.stageComplete) return null;
        const nextIndex = this.activeStageIndex + 1;
        const stage = lessonStage(this.activeLessonId, nextIndex);
        if (!stage) return null;
        this.activeStageIndex = nextIndex;
        this.stageComplete = false;
        return stage;
    }

    get lessonProgress(): { lessonId: string; stageIndex: number; stage: LessonStage; complete: boolean } | null {
        if (!this.activeLessonId) return null;
        const stage = lessonStage(this.activeLessonId, this.activeStageIndex);
        if (!stage) return null;
        return {
            lessonId: this.activeLessonId,
            stageIndex: this.activeStageIndex,
            stage,
            complete: this.stageComplete,
        };
    }

    evaluateLessonStage(): boolean {
        if (!this.activeLessonId || this.stageComplete) return this.stageComplete;
        this.stageComplete = evaluateLessonStage(this.activeLessonId, this.activeStageIndex, {
            targets: this.targets,
        });
        return this.stageComplete;
    }

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
