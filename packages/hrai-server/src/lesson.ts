import soldierPredicates from "../content/lessons/11-soldier-battle/predicates.js";

export interface LessonStage {
    id: string;
    goal: string;
    predicate: string;
}

export interface LessonDefinition {
    id: string;
    stages: LessonStage[];
}

export interface LessonWorkspace {
    targets: unknown[];
}

export const LESSONS: Record<string, LessonDefinition> = {
    "11-soldier-battle": {
        id: "11-soldier-battle",
        stages: [
            { id: "00-board", goal: "Create the battlefield and add your soldiers.", predicate: "board" },
            { id: "01-select", goal: "Select a friendly soldier when you click it.", predicate: "selection" },
            { id: "02-sword", goal: "Make a selected sword soldier attack a nearby enemy.", predicate: "swordAttack" },
            { id: "03-health", goal: "Add health and remove defeated enemies.", predicate: "healthAndDeath" },
            { id: "04-bow", goal: "Add the bow soldier's longer range.", predicate: "bowAttack" },
            { id: "05-reinforcements", goal: "Add timed reinforcements with a limit of five.", predicate: "reinforcements" },
            { id: "06-result", goal: "Show the result when dead enemies outnumber living enemies.", predicate: "result" },
        ],
    },
};

export function lessonStage(lessonId: string, stageIndex: number): LessonStage | null {
    const lesson = LESSONS[lessonId];
    return lesson?.stages[stageIndex] ?? null;
}

type LessonPredicate = (workspace: LessonWorkspace) => boolean;

const predicates = soldierPredicates as unknown as Record<string, LessonPredicate>;

export function evaluateLessonStage(
    lessonId: string,
    stageIndex: number,
    workspace: LessonWorkspace,
): boolean {
    const stage = lessonStage(lessonId, stageIndex);
    if (!stage || lessonId !== "11-soldier-battle") return false;
    const predicate = predicates[stage.predicate];
    return typeof predicate === "function" && predicate(workspace);
}
