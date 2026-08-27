import {describe, expect, it} from "vitest";
import {enforceTutorPolicy} from "../src/tutor-policy.ts";

describe("tutor reply policy", () => {
    it("turns a generic rung-1 instruction into a project-inspection question", () => {
        const reply = enforceTutorPolicy(
            "Rover utíká, protože se pohyb opakuje. Přidej mu zastavení.",
            {rung: 1, hasGoalContext: false},
        );

        expect(reply).toContain("?");
        expect(reply).not.toContain("Přidej mu zastavení");
        expect(reply.split(/[.!?]+/).filter((part) => part.trim()).length).toBeLessThanOrEqual(2);
    });

    it("keeps a concise contextual milestone instruction direct", () => {
        const text = "Teď zkus pohyb jednou šipkou. Potom hru spusť.";
        expect(enforceTutorPolicy(text, {rung: 1, hasGoalContext: true})).toBe(text);
    });

    it("limits accidental verbosity to two sentences", () => {
        expect(enforceTutorPolicy(
            "První věta. Druhá věta! Třetí věta?",
            {rung: 3, hasGoalContext: false},
        )).toBe("První věta. Druhá věta!");
    });
});
