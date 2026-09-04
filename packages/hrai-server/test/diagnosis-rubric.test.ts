/**
 * The false-absence rule, tested without a model.
 *
 * The rule decides whether a diagnosis is wrong, so a mistake in it silently rewrites what the
 * eval measures. These cases run in milliseconds and pin both directions: a true absence must
 * pass, and the qwen3:8b hallucination must still fail.
 */
import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/tutor-fixtures.json" with { type: "json" };
import { ABSENCE_CLAIMS, scriptsFor } from "./false-absence.ts";
import { renderProject, type RenderTarget } from "../src/render.ts";

function isFalseAbsence(render: string, aliases: string[], cause: string): boolean {
    const scripts = scriptsFor(render, aliases);
    return ABSENCE_CLAIMS.some(({claimed, present}) => claimed.test(cause) && present.test(scripts));
}

function render(id: string): string {
    const found = fixtures.cases.find((c) => c.id === id);
    if (!found) throw new Error(`no fixture ${id}`);
    return renderProject(found.targets as RenderTarget[], found.focusedTargetId, "cs").text;
}

describe("false-absence rule", () => {
    it("accepts a missing move block that really is missing from the named script", () => {
        // The up-arrow script (b3/b4) has no move block; the right and left scripts do.
        expect(isFalseAbsence(
            render("L1-missing-move"),
            ["b4"],
            "The up-arrow script only points upward and is missing a move block.",
        )).toBe(false);
    });

    it("rejects a missing move block that the named script contains", () => {
        expect(isFalseAbsence(
            render("L1-forever-noyield"),
            ["b2", "b3"],
            "The forever loop is missing a move block.",
        )).toBe(true);
    });

    it("rejects a missing end marker that the named script contains", () => {
        expect(isFalseAbsence(
            render("L1-forever-noyield"),
            ["b2"],
            'The script is missing its "end" marker.',
        )).toBe(true);
    });

    it("accepts a missing move block in the branch of the vague fixture that has none", () => {
        // b3/b4 sit in the forever loop, which never moves; b5/b6 are the other script.
        expect(isFalseAbsence(
            render("vague-nothing-works"),
            ["b4"],
            "The forever loop has no move block, so the sprite does not move.",
        )).toBe(false);
    });

    it("rejects a missing move block when the model names the script that has one", () => {
        expect(isFalseAbsence(
            render("vague-nothing-works"),
            ["b6"],
            "That script has no move block.",
        )).toBe(true);
    });

    it("falls back to the whole project when the answer names no block", () => {
        // Nothing to narrow to, so any absence claim is measured against everything.
        expect(isFalseAbsence(
            render("injection-in-project"),
            [],
            "The project is missing a move block.",
        )).toBe(true);
    });

    it("does not confuse b1 with b10", () => {
        expect(scriptsFor(render("L1-missing-move"), ["b1"])).not.toContain("left arrow");
    });
});
