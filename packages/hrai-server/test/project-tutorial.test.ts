import {describe, expect, it} from "vitest";
import {parseProjectTutorial, planProjectTutorial} from "../src/project-tutorial.ts";
import {Session} from "../src/session.ts";

const step = (title: string, assessment?: unknown) => ({
    title,
    goal: "The child sees one game behavior.",
    instruction: "Run the game and observe what happens.",
    success: "The child can explain what starts the behavior.",
    ...(assessment ? {assessment} : {}),
});

const response = (steps: unknown[]) => JSON.stringify({
    title: "Explore the maze",
    overview: "Find out how the maze game works.",
    steps,
});

const rebuildAssessment = {allOf: [{kind: "scriptContains", opcodes: ["event_whenflagclicked"], minimum: 1}]};

describe("generated project tutorials", () => {
    it("accepts walkthrough steps without code-completion contracts", () => {
        const plan = parseProjectTutorial("explore", response([
            step("Start the game"), step("Move the player"), step("Reach the goal"),
        ]));

        expect(plan).toMatchObject({
            mode: "explore",
            title: "Explore the maze",
        });
        const firstStep = plan.steps[0];
        if (!firstStep) throw new Error("fixture must contain a tutorial step");
        expect(firstStep).toMatchObject({id: "tutorial-step-1", title: "Start the game"});
        expect(firstStep).not.toHaveProperty("assessment");
    });

    it("requires validated structural evidence for rebuild steps", () => {
        const plan = parseProjectTutorial("rebuild", response([
            step("Start the game", rebuildAssessment),
            step("Move the player", rebuildAssessment),
            step("Reach the goal", rebuildAssessment),
        ]));

        expect(plan.mode).toBe("rebuild");
        const firstStep = plan.steps[0];
        if (!firstStep) throw new Error("fixture must contain a rebuild step");
        expect(firstStep.assessment).toEqual(rebuildAssessment);
    });

    it("rejects unsupported block opcodes in rebuild evidence", () => {
        const unsupported = {allOf: [{kind: "projectContains", opcodes: ["shell_run" ]}]};
        expect(() => parseProjectTutorial("rebuild", response([
            step("Start", unsupported), step("Move", rebuildAssessment), step("Win", rebuildAssessment),
        ]))).toThrow(/unsupported opcode/);
    });

    it("plans against the imported project as data and selects mode-specific instructions", async () => {
        const calls: string[] = [];
        const complete = (system: string, user: string) => {
            calls.push(`${system}\n${user}`);
            return Promise.resolve({
                text: response([
                    step("Start the game"), step("Move the player"), step("Reach the goal"),
                ]),
                seconds: 0,
            });
        };

        const plan = await planProjectTutorial("explore", "Sprite: Cat\nScript: when flag clicked", complete);

        expect(plan.mode).toBe("explore");
        expect(calls[0]).toContain("vysvětli existující hru krok za krokem");
        expect(calls[0]).toContain("<projekt>");
        expect(calls[0]).toContain("Script: when flag clicked");
    });

    it("requires learner acceptance and keeps walkthrough completion manual", () => {
        const plan = parseProjectTutorial("explore", response([
            step("Start"), step("Move"), step("Reach the goal"),
        ]));
        const session = new Session();
        session.proposeProjectTutorial(plan);

        expect(session.projectTutorialProgress).toBeNull();
        expect(session.acceptProjectTutorial()).toEqual(plan);
        expect(session.tutorContext?.evidence).toEqual(["Prozkoumej původní projekt; jeho kód neměň."]);
        expect(session.nextProjectTutorialStep()?.title).toBe("Move");
        expect(session.nextProjectTutorialStep()?.title).toBe("Reach the goal");
        expect(session.nextProjectTutorialStep()).toBeNull();
        expect(session.projectTutorialProgress?.complete).toBe(true);
    });

    it("advances rebuild steps only after structural workspace evidence", () => {
        const plan = parseProjectTutorial("rebuild", response([
            step("Start", rebuildAssessment), step("Move", rebuildAssessment), step("Win", rebuildAssessment),
        ]));
        const session = new Session();
        session.setWorkspace([], "");
        session.proposeProjectTutorial(plan);
        expect(session.acceptProjectTutorial()).toEqual(plan);
        expect(session.projectTutorialProgress?.needsNewProject).toBe(true);
        expect(session.tutorContext).toBeUndefined();
        expect(session.nextProjectTutorialStep()).toBeNull();
        expect(session.restoreProjectTutorial(plan, 0)).toEqual(plan);
        expect(session.projectTutorialProgress?.needsNewProject).toBe(true);
        expect(session.tutorContext).toBeUndefined();
        expect(session.evaluateProjectTutorialStep()).toBe(false);

        expect(session.restoreProjectTutorial(plan, 0, false)).toEqual(plan);
        expect(session.projectTutorialProgress?.needsNewProject).toBe(false);
        expect(session.evaluateProjectTutorialStep()).toBe(false);
        expect(session.nextProjectTutorialStep()).toBeNull();

        session.setWorkspace([{
            id: "cat",
            name: "Cat",
            isStage: false,
            blocks: {
                event: {
                    id: "event",
                    opcode: "event_whenflagclicked",
                    next: null,
                    parent: null,
                    inputs: {},
                    fields: {},
                    topLevel: true,
                },
            },
        }], "cat");
        expect(session.evaluateProjectTutorialStep()).toBe(true);
        expect(session.nextProjectTutorialStep()?.title).toBe("Move");
        expect(session.projectTutorialProgress?.stepComplete).toBe(true);
    });
});
