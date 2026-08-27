import {describe, expect, it} from "vitest";
import type {GamePlan} from "../src/game-plan.ts";
import {systemPrompt} from "../src/prompt.ts";
import {Session} from "../src/session.ts";

const PLAN: GamePlan = {
    title: "Dračí bludiště",
    originalGoal: "Proveď draka bludištěm a najdi poklad.",
    coreLoop: "Pohybuj drakem, vyhýbej se stěnám a hledej poklad.",
    milestones: [
        {
            id: "milestone-1",
            title: "Rozhýbej draka",
            outcome: "Drak se pohybuje šipkami.",
            why: "Bez pohybu nemůže drak hledat poklad.",
            concept: "události a pohyb",
            doneWhen: "Každá šipka posune draka správným směrem.",
        },
        {
            id: "milestone-2",
            title: "Najdi poklad",
            outcome: "Dotyk pokladu ukončí hru.",
            why: "Nalezení pokladu je cíl hry.",
            concept: "dotyk a stav hry",
            doneWhen: "Po dotyku pokladu hra oznámí výhru.",
        },
        {
            id: "milestone-3",
            title: "Přidej výzvu",
            outcome: "Drak nemůže projít stěnou.",
            why: "Stěny dělají hledání pokladu zajímavé.",
            concept: "podmínky",
            doneWhen: "Drak se při dotyku stěny zastaví.",
        },
    ],
};

const firstMilestone = () => {
    const milestone = PLAN.milestones[0];
    if (!milestone) throw new Error("fixture must contain a milestone");
    return milestone;
};
const FIRST_MILESTONE = firstMilestone();

describe("goal-driven game session", () => {
    it("keeps a proposed plan inactive until the child accepts it", () => {
        const session = new Session();
        session.remember("learner", "Možná bych chtěl jinou hru.");

        session.proposeGamePlan(PLAN);
        expect(session.gameProgress).toBeNull();
        expect(session.proposedGamePlan).toEqual(PLAN);

        expect(session.acceptGamePlan()).toEqual(PLAN);
        expect(session.history).toEqual([]);
        expect(session.gameProgress?.milestone).toEqual(FIRST_MILESTONE);
        expect(session.tutorContext).toMatchObject({
            originalGoal: PLAN.originalGoal,
            coreLoop: PLAN.coreLoop,
            title: FIRST_MILESTONE.title,
            why: FIRST_MILESTONE.why,
        });
        expect(systemPrompt(1, session.tutorContext)).toContain(`PŮVODNÍ CÍL HRY: ${PLAN.originalGoal}`);
        expect(systemPrompt(1, session.tutorContext)).toContain(`PROČ TENTO KROK PATŘÍ DO HRY: ${FIRST_MILESTONE.why}`);
    });

    it("does not advance until deterministic evidence marks the milestone complete", () => {
        const session = new Session();
        session.proposeGamePlan(PLAN);
        session.acceptGamePlan();

        expect(session.nextGameMilestone()).toBeNull();
        session.markGameMilestoneComplete();
        expect(session.nextGameMilestone()).toEqual(PLAN.milestones[1]);
        expect(session.gameProgress?.complete).toBe(false);
        expect(session.rung).toBe(1);
    });

    it("activating an authored lesson replaces the custom game plan", () => {
        const session = new Session();
        session.proposeGamePlan(PLAN);
        session.acceptGamePlan();

        session.startLesson("11-soldier-battle");
        expect(session.gameProgress).toBeNull();
        expect(session.lessonProgress?.lessonId).toBe("11-soldier-battle");
    });
});
