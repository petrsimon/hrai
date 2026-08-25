/**
 * Renderer unit tests. Pure function, no model, no network — these gate merges.
 */
import { describe, expect, it } from "vitest";
import { renderProject, type Block, type RenderTarget } from "../src/render.ts";

/** Builds a block with the defaults the VM would supply. */
function block(id: string, opcode: string, extra: Partial<Block> = {}): Block {
    return { id, opcode, next: null, parent: null, inputs: {}, fields: {}, ...extra };
}

/** A numeric shadow, as the VM stores a literal the child typed. */
function numberShadow(id: string, value: number): Block {
    return block(id, "math_number", { shadow: true, fields: { NUM: { name: "NUM", value } } });
}

function target(name: string, blocks: Block[], id = name): RenderTarget {
    return { id, name, isStage: false, blocks: Object.fromEntries(blocks.map((b) => [b.id, b])) };
}

describe("renderProject", () => {
    it("renders a flat script with aliases in encounter order", () => {
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "mv" }),
            block("mv", "motion_movesteps", {
                inputs: { STEPS: { name: "STEPS", block: "n", shadow: "n" } },
            }),
            numberShadow("n", 10),
        ]);

        const { text, aliases } = renderProject([t], "Rover");

        expect(text).toContain("when");
        expect(text).toContain("move 10 steps");
        expect(aliases.get("b1")).toBe("hat");
        expect(aliases.get("b2")).toBe("mv");
    });

    it("closes every C-block with an end marker naming its opening alias", () => {
        // The 8B failure this guards: reporting a block absent because it could not
        // tell the block sat inside the loop.
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "fv" }),
            block("fv", "control_forever", {
                inputs: { SUBSTACK: { name: "SUBSTACK", block: "mv", shadow: null } },
            }),
            block("mv", "motion_movesteps", {
                inputs: { STEPS: { name: "STEPS", block: "n", shadow: "n" } },
            }),
            numberShadow("n", 10),
        ]);

        const { text } = renderProject([t], "Rover");
        const lines = text.split("\n");

        const forever = lines.findIndex((l) => l.includes("forever"));
        const move = lines.findIndex((l) => l.includes("move 10 steps"));
        const end = lines.findIndex((l) => l.includes("end b2"));

        expect(forever).toBeLessThan(move);
        expect(move).toBeLessThan(end);
        // The nested block is indented past its container.
        expect(lines[move].indexOf("move")).toBeGreaterThan(lines[forever].indexOf("forever"));
    });

    it("renders a boolean input inside angle brackets", () => {
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "iff" }),
            block("iff", "control_if", {
                inputs: {
                    CONDITION: { name: "CONDITION", block: "touch", shadow: null },
                    SUBSTACK: { name: "SUBSTACK", block: null, shadow: null },
                },
            }),
            block("touch", "sensing_touchingobject", {
                inputs: { TOUCHINGOBJECTMENU: { name: "TOUCHINGOBJECTMENU", block: "menu", shadow: "menu" } },
            }),
            block("menu", "sensing_touchingobjectmenu", {
                shadow: true,
                fields: { TOUCHINGOBJECTMENU: { name: "TOUCHINGOBJECTMENU", value: "Edge" } },
            }),
        ]);

        const { text } = renderProject([t], "Rover");
        expect(text).toMatch(/<.*Edge.*>/);
    });

    it("summarises unfocused targets in one line each", () => {
        const focused = target("Rover", [block("h", "event_whenflagclicked", { topLevel: true })]);
        const other = target("Pearl", [
            block("h2", "event_whenflagclicked", { topLevel: true, next: "m2" }),
            block("m2", "motion_movesteps"),
        ]);

        const { text } = renderProject([focused, other], "Rover");

        expect(text).toContain("postava: Rover");
        expect(text).toMatch(/postava: Pearl\s+\(1 skriptu, 2 bloku\)/);
        // The unfocused target contributes no aliased block lines.
        expect(text).not.toContain("move");
    });

    it("says so explicitly when the focused sprite has no blocks", () => {
        // An empty project is a real state a child reaches, and an empty render
        // would leave the model guessing whether it was given anything at all.
        const { text } = renderProject([target("Rover", [])], "Rover");
        expect(text).toContain("zatim zadne bloky");
    });

    it("never emits an empty label for an unknown opcode", () => {
        const t = target("Rover", [block("x", "some_extension_block", { topLevel: true })]);
        const { text } = renderProject([t], "Rover");
        expect(text).toContain("some extension block");
    });

    it("fills icon slots so later slots do not shift", () => {
        // Regression: `turn %1 %2 degrees` has an icon in %1. Filling it from inputs
        // alone produced "turn 15 () degrees" — every slot after an icon was wrong.
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "tr" }),
            block("tr", "motion_turnright", {
                inputs: { DEGREES: { name: "DEGREES", block: "n", shadow: "n" } },
            }),
            numberShadow("n", 15),
        ]);

        const { text } = renderProject([t], "Rover");
        expect(text).toContain("when green flag clicked");
        expect(text).toContain("turn right 15 degrees");
        expect(text).not.toContain("()");
    });

    it("renders Czech labels when asked", () => {
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "fv" }),
            block("fv", "control_forever", { inputs: { SUBSTACK: { name: "SUBSTACK", block: null, shadow: null } } }),
        ]);
        const { text } = renderProject([t], "Rover", "cs");
        expect(text).toContain("opakuj stále");
    });
});
