import {describe, expect, it} from "vitest";
import type {GamePlan} from "../src/game-plan.ts";
import {systemPrompt} from "../src/prompt.ts";
import type {RenderTarget} from "../src/render.ts";
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
            assessment: {
                allOf: [{
                    kind: "scriptContains",
                    opcodes: ["event_whenkeypressed", "motion_changexby"],
                    minimum: 1,
                }],
            },
        },
        {
            id: "milestone-2",
            title: "Najdi poklad",
            outcome: "Dotyk pokladu ukončí hru.",
            why: "Nalezení pokladu je cíl hry.",
            concept: "dotyk a stav hry",
            doneWhen: "Po dotyku pokladu hra oznámí výhru.",
            assessment: {
                allOf: [{
                    kind: "projectContains",
                    opcodes: ["sensing_touchingobject", "looks_say"],
                }],
            },
        },
        {
            id: "milestone-3",
            title: "Přidej výzvu",
            outcome: "Drak nemůže projít stěnou.",
            why: "Stěny dělají hledání pokladu zajímavé.",
            concept: "podmínky",
            doneWhen: "Drak se při dotyku stěny zastaví.",
            assessment: {
                allOf: [{
                    kind: "scriptContains",
                    opcodes: ["control_if", "sensing_touchingcolor"],
                    minimum: 1,
                }],
            },
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
        expect(session.gameProgress).toBeNull();
        expect(session.gamePlaytest?.plan).toEqual(PLAN);
        expect(session.history).toEqual([]);
        expect(session.startGameGuidance("Ovládání je moc pomalé.")).toEqual(PLAN);
        expect(session.gameProgress?.milestone).toEqual(FIRST_MILESTONE);
        expect(session.tutorContext?.playtestFeedback).toBe("Ovládání je moc pomalé.");
        expect(session.tutorContext).toMatchObject({
            originalGoal: PLAN.originalGoal,
            coreLoop: PLAN.coreLoop,
            title: FIRST_MILESTONE.title,
            why: FIRST_MILESTONE.why,
        });
        expect(systemPrompt(1, session.tutorContext)).toContain(`PŮVODNÍ CÍL HRY: ${PLAN.originalGoal}`);
        expect(systemPrompt(1, session.tutorContext)).toContain(`PROČ TENTO KROK PATŘÍ DO HRY: ${FIRST_MILESTONE.why}`);
        expect(systemPrompt(1, session.tutorContext)).toContain("ZPĚTNÁ VAZBA Z VYZKOUŠENÍ: Ovládání je moc pomalé.");
    });

    it("does not advance until workspace evidence completes the milestone", () => {
        const session = new Session();
        session.proposeGamePlan(PLAN);
        session.acceptGamePlan();
        expect(session.startGameGuidance()).toEqual(PLAN);

        expect(session.nextGameMilestone()).toBeNull();
        expect(session.evaluateGameMilestone()).toBe(false);

        const workspace: RenderTarget = {
            id: "dragon",
            name: "Drak",
            isStage: false,
            blocks: {
                event: {
                    id: "event",
                    opcode: "event_whenkeypressed",
                    next: "move",
                    parent: null,
                    inputs: {},
                    fields: {},
                    topLevel: true,
                },
                move: {
                    id: "move",
                    opcode: "motion_changexby",
                    next: null,
                    parent: "event",
                    inputs: {},
                    fields: {},
                },
            },
        };
        session.setWorkspace([workspace], workspace.id);
        expect(session.evaluateGameMilestone()).toBe(true);
        expect(session.nextGameMilestone()).toEqual(PLAN.milestones[1]);
        expect(session.gameProgress?.complete).toBe(false);
        expect(session.rung).toBe(1);
    });

    it("restores an accepted milestone without trusting prior completion", () => {
        const session = new Session();
        session.remember("learner", "Starý chat");
        session.escalate();

        expect(session.restoreGamePlan(PLAN, 1)).toEqual(PLAN);
        expect(session.gameProgress).toMatchObject({
            milestoneIndex: 1,
            milestone: PLAN.milestones[1],
            complete: false,
        });
        expect(session.history).toEqual([]);
        expect(session.rung).toBe(1);
        expect(session.restoreGamePlan(PLAN, PLAN.milestones.length)).toBeNull();
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
