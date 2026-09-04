import {describe, expect, it} from "vitest";
import {describeAssessment, evaluateGameAssessment} from "../src/game-assessor.ts";
import type {GameAssessment} from "../src/game-plan.ts";
import type {Block, RenderTarget} from "../src/render.ts";

const block = (
    id: string,
    opcode: string,
    options: Partial<Block> = {},
): Block => ({
    id,
    opcode,
    next: null,
    parent: null,
    inputs: {},
    fields: {},
    ...options,
});

const target = (blocks: Block[], options: Partial<RenderTarget> = {}): RenderTarget => ({
    id: options.id ?? "sprite-1",
    name: options.name ?? "Drak",
    isStage: options.isStage ?? false,
    blocks: Object.fromEntries(blocks.map((item) => [item.id, item])),
    variables: options.variables,
});

const assessment = (allOf: GameAssessment["allOf"]): GameAssessment => ({allOf});

describe("game milestone assessor", () => {
    it("describes only aggregate progress at the first two rungs", () => {
        const contract = assessment([{
            kind: "scriptContains",
            opcodes: ["event_whenkeypressed", "motion_changexby"],
            minimum: 1,
        }, {
            kind: "projectContains",
            opcodes: ["looks_say"],
        }]);

        expect(describeAssessment(contract, [], 1)).toEqual([
            "Podmínky milníku: splněno 0 ze 2.",
        ]);
        expect(describeAssessment(contract, [], 2)).toEqual([
            "Podmínky milníku: splněno 0 ze 2.",
        ]);
    });

    it("describes missing opcode categories at rung three without naming blocks", () => {
        const contract = assessment([{
            kind: "scriptContains",
            opcodes: ["event_whenkeypressed", "motion_changexby"],
            minimum: 1,
        }]);

        const evidence = describeAssessment(contract, [], 3);
        expect(evidence).toHaveLength(1);
        expect(evidence[0]).toContain("Události");
        expect(evidence[0]).toContain("Pohyb");
        expect(evidence[0]).not.toContain("event_whenkeypressed");
        expect(evidence[0]).not.toContain("motion_changexby");
    });

    it("describes each criterion with opcodes at rungs four and five", () => {
        const contract = assessment([{
            kind: "scriptContains",
            opcodes: ["event_whenkeypressed", "motion_changexby"],
            minimum: 1,
        }]);
        const complete = target([
            block("event", "event_whenkeypressed", {topLevel: true, next: "move"}),
            block("move", "motion_changexby", {parent: "event"}),
        ]);

        expect(describeAssessment(contract, [complete], 4)).toEqual([
            "splněno: event_whenkeypressed, motion_changexby v jednom propojeném skriptu.",
        ]);
        expect(describeAssessment(contract, [], 5)).toEqual([
            "chybí: event_whenkeypressed, motion_changexby v jednom propojeném skriptu.",
        ]);
    });

    it("requires opcodes to belong to the same connected script", () => {
        const disconnected = target([
            block("event", "event_whenkeypressed", {topLevel: true}),
            block("move", "motion_changexby", {topLevel: true}),
        ]);
        const connected = target([
            block("event", "event_whenkeypressed", {topLevel: true, next: "move"}),
            block("move", "motion_changexby", {parent: "event"}),
        ]);
        const contract = assessment([{
            kind: "scriptContains",
            opcodes: ["event_whenkeypressed", "motion_changexby"],
            minimum: 1,
        }]);

        expect(evaluateGameAssessment(contract, [disconnected])).toBe(false);
        expect(evaluateGameAssessment(contract, [connected])).toBe(true);
    });

    it("counts matching scripts and traverses nested inputs", () => {
        const first = target([
            block("event-1", "event_whenkeypressed", {topLevel: true, next: "if-1"}),
            block("if-1", "control_if", {
                parent: "event-1",
                inputs: {CONDITION: {name: "CONDITION", block: "touch-1", shadow: null}},
            }),
            block("touch-1", "sensing_touchingobject", {parent: "if-1"}),
            block("event-2", "event_whenkeypressed", {topLevel: true, next: "if-2"}),
            block("if-2", "control_if", {
                parent: "event-2",
                inputs: {CONDITION: {name: "CONDITION", block: "touch-2", shadow: null}},
            }),
            block("touch-2", "sensing_touchingobject", {parent: "if-2"}),
        ]);

        expect(evaluateGameAssessment(assessment([{
            kind: "scriptContains",
            opcodes: ["event_whenkeypressed", "control_if", "sensing_touchingobject"],
            minimum: 2,
        }]), [first])).toBe(true);
    });

    it("evaluates project, sprite, and distinct-variable evidence conjunctively", () => {
        const stage = target([
            block("flag", "event_whenflagclicked", {topLevel: true}),
        ], {
            id: "stage",
            name: "Stage",
            isStage: true,
            variables: {score: ["score", 0]},
        });
        const sprite = target([
            block("say", "looks_say", {topLevel: true}),
        ], {
            variables: {local: ["lives", 3], score: ["score", 0]},
        });
        const contract = assessment([
            {kind: "projectContains", opcodes: ["event_whenflagclicked", "looks_say"]},
            {kind: "spriteCountAtLeast", minimum: 1},
            {kind: "variableCountAtLeast", minimum: 2},
        ]);

        expect(evaluateGameAssessment(contract, [stage, sprite])).toBe(true);
        expect(evaluateGameAssessment(contract, [stage])).toBe(false);
    });

    it("terminates safely when malformed workspace graphs contain cycles", () => {
        const cyclic = target([
            block("a", "event_whenflagclicked", {topLevel: true, next: "b"}),
            block("b", "looks_say", {next: "a", parent: "a"}),
        ]);

        expect(evaluateGameAssessment(assessment([{
            kind: "scriptContains",
            opcodes: ["event_whenflagclicked", "looks_say"],
            minimum: 1,
        }]), [cyclic])).toBe(true);
    });
});
