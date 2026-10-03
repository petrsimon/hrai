/**
 * Per-connection tutoring state.
 *
 * The server holds the current workspace rather than asking for it each turn: the panel
 * pushes changes as they happen, so a question can be answered from state that is
 * already here. That is also what will make solve-detection and the teacher view cheap
 * later.
 */
import { renderProject, type RenderTarget } from "./render.ts";
import {
    describeLessonEvidence,
    evaluateLessonStage,
    lessonStage,
    type LessonStage,
} from "./lesson.ts";
import {describeAssessment, evaluateGameAssessment} from "./game-assessor.ts";
import type { GameMilestone, GamePlan } from "./game-plan.ts";
import { createGameStarter, type GameStarter } from "./game-starter.ts";
import type {ProjectTutorial, ProjectTutorialStep} from "./project-tutorial.ts";
import type { AssistantPreferences } from "./store.ts";
import type { Turn, TutorPromptContext } from "./prompt.ts";

export type GamePhase = "playtest" | "guided";

/** The gentlest rung, and the most specific one the tutor will ever go to. */
export const FIRST_RUNG = 1;
export const LAST_RUNG = 5;

export interface ProjectTutorialProgress {
    plan: ProjectTutorial;
    stepIndex: number;
    step: ProjectTutorialStep;
    stepComplete: boolean;
    complete: boolean;
    needsNewProject: boolean;
}

export class Session {
    readonly assistantPreferences?: AssistantPreferences;
    private targets: RenderTarget[] = [];
    private focusedTargetId = "";
    private aliases = new Map<string, string>();
    private currentRung: number = FIRST_RUNG;
    private activeLessonId: string | null = null;
    private activeStageIndex = 0;
    private stageComplete = false;
    private pendingGamePlan: GamePlan | null = null;
    private pendingGameStarter: GameStarter | null = null;
    private activeGamePlan: GamePlan | null = null;
    private activeGameStarter: GameStarter | null = null;
    private gamePhase: GamePhase | null = null;
    private gameFeedback = "";
    private activeGameMilestoneIndex = 0;
    private gameMilestoneComplete = false;
    private pendingProjectTutorial: ProjectTutorial | null = null;
    private activeProjectTutorial: ProjectTutorial | null = null;
    private projectTutorialStepIndex = 0;
    private projectTutorialStepComplete = false;
    private projectTutorialComplete = false;
    private projectTutorialNeedsNewProject = false;
    readonly history: Turn[] = [];

    constructor(assistantPreferences?: AssistantPreferences) {
        this.assistantPreferences = assistantPreferences;
    }

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

    get proposedProjectTutorial(): ProjectTutorial | null {
        return this.pendingProjectTutorial;
    }

    proposeProjectTutorial(plan: ProjectTutorial): void {
        this.pendingProjectTutorial = plan;
    }

    cancelProposedProjectTutorial(): void {
        this.pendingProjectTutorial = null;
    }

    private activateProjectTutorial(
        plan: ProjectTutorial,
        stepIndex: number,
        needsNewProject = false,
    ): ProjectTutorial {
        this.pendingProjectTutorial = null;
        this.activeProjectTutorial = plan;
        this.projectTutorialStepIndex = stepIndex;
        this.projectTutorialStepComplete = false;
        this.projectTutorialComplete = false;
        this.projectTutorialNeedsNewProject = needsNewProject;
        this.activeLessonId = null;
        this.stageComplete = false;
        this.activeGamePlan = null;
        this.activeGameStarter = null;
        this.pendingGamePlan = null;
        this.pendingGameStarter = null;
        this.gamePhase = null;
        this.gameFeedback = "";
        this.gameMilestoneComplete = false;
        this.history.length = 0;
        this.resetRung();
        return plan;
    }

    acceptProjectTutorial(): ProjectTutorial | null {
        if (!this.pendingProjectTutorial) return null;
        const plan = this.pendingProjectTutorial;
        return this.activateProjectTutorial(plan, 0, plan.mode === "rebuild");
    }

    restoreProjectTutorial(
        plan: ProjectTutorial,
        stepIndex: number,
        needsNewProject = plan.mode === "rebuild",
    ): ProjectTutorial | null {
        if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= plan.steps.length) return null;
        const restored = this.activateProjectTutorial(plan, stepIndex, needsNewProject);
        if (plan.mode === "rebuild" && !needsNewProject) this.evaluateProjectTutorialStep();
        return restored;
    }

    get projectTutorialProgress(): ProjectTutorialProgress | null {
        if (!this.activeProjectTutorial) return null;
        const step = this.activeProjectTutorial.steps[this.projectTutorialStepIndex];
        if (!step) return null;
        return {
            plan: this.activeProjectTutorial,
            stepIndex: this.projectTutorialStepIndex,
            step,
            stepComplete: this.projectTutorialStepComplete,
            complete: this.projectTutorialComplete,
            needsNewProject: this.projectTutorialNeedsNewProject,
        };
    }

    evaluateProjectTutorialStep(): boolean {
        const progress = this.projectTutorialProgress;
        if (progress?.plan.mode !== "rebuild" || progress.needsNewProject || !progress.step.assessment) return false;
        this.projectTutorialStepComplete = evaluateGameAssessment(progress.step.assessment, this.targets);
        this.projectTutorialComplete = this.projectTutorialStepComplete &&
            progress.stepIndex === progress.plan.steps.length - 1;
        return this.projectTutorialStepComplete;
    }

    nextProjectTutorialStep(): ProjectTutorialStep | null {
        const progress = this.projectTutorialProgress;
        if (!progress || progress.complete || progress.needsNewProject) return null;
        if (progress.plan.mode === "rebuild" && !progress.stepComplete) return null;
        const nextIndex = this.projectTutorialStepIndex + 1;
        if (nextIndex >= progress.plan.steps.length) {
            this.projectTutorialComplete = true;
            return null;
        }
        this.projectTutorialStepIndex = nextIndex;
        this.projectTutorialStepComplete = false;
        if (progress.plan.mode === "rebuild") this.evaluateProjectTutorialStep();
        this.history.length = 0;
        this.resetRung();
        return progress.plan.steps[nextIndex] ?? null;
    }

    /**
     * Plan waiting for the child to approve it.
     * @returns Pending proposal, or null.
     */
    get proposedGamePlan(): GamePlan | null {
        return this.pendingGamePlan;
    }

    /**
     * Stores a model-generated proposal without changing what the tutor is teaching.
     * The child owns the project direction, so only acceptance activates the plan.
     * @param plan Validated plan proposal.
     * @param starter Playable prototype to install after acceptance.
     */
    proposeGamePlan(plan: GamePlan, starter: GameStarter = createGameStarter(plan)): void {
        this.pendingGamePlan = plan;
        this.pendingGameStarter = starter;
    }

    private activateGamePlan(
        plan: GamePlan,
        milestoneIndex: number,
        phase: GamePhase,
        starter: GameStarter,
        feedback = "",
    ): GamePlan {
        this.pendingProjectTutorial = null;
        this.activeProjectTutorial = null;
        this.projectTutorialStepIndex = 0;
        this.projectTutorialStepComplete = false;
        this.projectTutorialComplete = false;
        this.activeGamePlan = plan;
        this.activeGameStarter = starter;
        this.pendingGamePlan = null;
        this.pendingGameStarter = null;
        this.gamePhase = phase;
        this.gameFeedback = feedback;
        this.activeGameMilestoneIndex = milestoneIndex;
        this.gameMilestoneComplete = false;
        this.activeLessonId = null;
        this.stageComplete = false;
        this.history.length = 0;
        this.resetRung();
        return plan;
    }

    /**
     * Activates the proposed plan after explicit child approval.
     * @returns Accepted plan, or null when no proposal exists.
     */
    acceptGamePlan(): GamePlan | null {
        if (!this.pendingGamePlan || !this.pendingGameStarter) return null;
        // Earlier brainstorming must not compete with the child-approved north star.
        // The first phase deliberately has no tutor context: the child gets to play
        // the generated prototype before deciding what to change.
        return this.activateGamePlan(this.pendingGamePlan, 0, "playtest", this.pendingGameStarter);
    }

    /**
     * Starts child-led implementation after the child has tested the prototype.
     * @param feedback Child's observations from playtesting.
     * @returns Active plan, or null when no playtest is waiting.
     */
    startGameGuidance(feedback = ""): GamePlan | null {
        if (!this.activeGamePlan || this.gamePhase !== "playtest" || !this.activeGameStarter) return null;
        this.gamePhase = "guided";
        this.gameFeedback = feedback.slice(0, 1000);
        this.activeGameMilestoneIndex = 0;
        this.gameMilestoneComplete = false;
        this.resetRung();
        return this.activeGamePlan;
    }

    /**
     * Restores a plan previously accepted in this browser and project.
     * @param plan Revalidated canonical plan.
     * @param milestoneIndex Previously active milestone.
     * @param phase Whether the child is still playtesting or is being guided.
     * @param feedback Child's observations from playtesting.
     * @param starter Prototype installed before playtesting.
     * @returns Restored plan, or null when the index is outside it.
     */
    restoreGamePlan(
        plan: GamePlan,
        milestoneIndex: number,
        phase: GamePhase = "guided",
        feedback = "",
        starter: GameStarter = createGameStarter(plan),
    ): GamePlan | null {
        if (!Number.isInteger(milestoneIndex) || milestoneIndex < 0 || milestoneIndex >= plan.milestones.length) {
            return null;
        }
        return this.activateGamePlan(plan, milestoneIndex, phase, starter, feedback);
    }

    get gamePlaytest(): {plan: GamePlan; starter: GameStarter} | null {
        if (this.gamePhase !== "playtest" || !this.activeGamePlan || !this.activeGameStarter) return null;
        return {plan: this.activeGamePlan, starter: this.activeGameStarter};
    }

    get gameProgress(): {
        plan: GamePlan;
        milestoneIndex: number;
        milestone: GameMilestone;
        complete: boolean;
        feedback: string;
    } | null {
        if (this.gamePhase !== "guided" || !this.activeGamePlan) return null;
        const milestone = this.activeGamePlan.milestones[this.activeGameMilestoneIndex];
        if (!milestone) return null;
        return {
            plan: this.activeGamePlan,
            milestoneIndex: this.activeGameMilestoneIndex,
            milestone,
            complete: this.gameMilestoneComplete,
            feedback: this.gameFeedback,
        };
    }

    /**
     * Checks the current milestone against the latest normalized workspace.
     * @returns Whether the current milestone is complete.
     */
    evaluateGameMilestone(): boolean {
        if (this.gamePhase !== "guided" || !this.activeGamePlan) {
            return this.gameMilestoneComplete;
        }
        const milestone = this.activeGamePlan.milestones[this.activeGameMilestoneIndex];
        if (!milestone) return false;
        this.gameMilestoneComplete = evaluateGameAssessment(milestone.assessment, this.targets);
        return this.gameMilestoneComplete;
    }

    nextGameMilestone(): GameMilestone | null {
        if (!this.activeGamePlan || !this.gameMilestoneComplete) return null;
        const next = this.activeGamePlan.milestones[this.activeGameMilestoneIndex + 1];
        if (!next) return null;
        this.activeGameMilestoneIndex += 1;
        this.gameMilestoneComplete = false;
        this.history.length = 0;
        this.resetRung();
        return next;
    }

    /**
     * Active goal context injected into every tutor turn.
     * @returns Authored lesson or custom game milestone context.
     */
    get tutorContext(): TutorPromptContext | undefined {
        return this.tutorContextFor(this.currentRung);
    }

    /**
     * Builds the active step context at a specific rung.
     * @param rung Hint-ladder rung controlling evidence detail.
     * @returns Authored lesson or custom game milestone context.
     */
    tutorContextFor(rung: number): TutorPromptContext | undefined {
        const lesson = this.lessonProgress;
        if (lesson) {
            return {
                ...lesson.stage,
                evidence: lesson.complete
                    ? ["Podmínka kroku je splněna."]
                    : describeLessonEvidence(lesson.stage, this.targets, rung),
            };
        }

        const tutorial = this.projectTutorialProgress;
        if (tutorial && !tutorial.needsNewProject) {
            const assessment = tutorial.step.assessment;
            const opcodes = assessment ? [...new Set(assessment.allOf.flatMap((criterion) => (
                "opcodes" in criterion ? criterion.opcodes : []
            )))] : [];
            return {
                title: tutorial.step.title,
                goal: tutorial.step.goal,
                instruction: tutorial.step.instruction,
                success: tutorial.step.success,
                opcodes,
                evidence: tutorial.plan.mode === "rebuild" && assessment
                    ? describeAssessment(assessment, this.targets, rung)
                    : ["Prozkoumej původní projekt; jeho kód neměň."],
            };
        }

        const game = this.gameProgress;
        if (!game) return undefined;
        const opcodes = [...new Set(game.milestone.assessment.allOf.flatMap((criterion) => (
            "opcodes" in criterion ? criterion.opcodes : []
        )))];
        return {
            originalGoal: game.plan.originalGoal,
            coreLoop: game.plan.coreLoop,
            title: game.milestone.title,
            goal: game.milestone.outcome,
            why: game.milestone.why,
            concept: game.milestone.concept,
            playtestFeedback: game.feedback,
            instruction: `Doplň projekt tak, aby: ${game.milestone.doneWhen}`,
            success: game.milestone.doneWhen,
            opcodes,
            evidence: describeAssessment(game.milestone.assessment, this.targets, rung),
        };
    }

    startLesson(lessonId: string, stageIndex = 0): LessonStage | null {
        const stage = lessonStage(lessonId, stageIndex);
        if (!stage) return null;
        this.activeLessonId = lessonId;
        this.activeStageIndex = stageIndex;
        this.stageComplete = false;
        this.pendingProjectTutorial = null;
        this.activeProjectTutorial = null;
        this.projectTutorialStepIndex = 0;
        this.projectTutorialStepComplete = false;
        this.projectTutorialComplete = false;
        this.activeGamePlan = null;
        this.activeGameStarter = null;
        this.pendingGamePlan = null;
        this.pendingGameStarter = null;
        this.gamePhase = null;
        this.gameFeedback = "";
        this.gameMilestoneComplete = false;
        this.resetRung();
        return stage;
    }

    nextLessonStage(): LessonStage | null {
        if (!this.activeLessonId || !this.stageComplete) return null;
        const nextIndex = this.activeStageIndex + 1;
        const stage = lessonStage(this.activeLessonId, nextIndex);
        if (!stage) return null;
        this.activeStageIndex = nextIndex;
        this.stageComplete = false;
        this.history.length = 0;
        this.resetRung();
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
        if (!this.activeLessonId) return this.stageComplete;
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
     * Whether the panel has pushed a workspace yet.
     * @returns True once at least one target is known.
     */
    get hasWorkspace(): boolean {
        return this.targets.length > 0;
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
        const { text, aliases } = renderProject(this.targets, this.focusedTargetId, "cs");
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
