import {describe, expect, it} from "vitest";
import {enforceTutorPolicy, stripUnknownAliases} from "../src/tutor-policy.ts";

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

    it("does not split on decimals or abbreviations", () => {
        expect(enforceTutorPolicy(
            "Nastav čekání na 0.5 sekundy. Pak hru spusť.",
            {rung: 4, hasGoalContext: true},
        )).toBe("Nastav čekání na 0.5 sekundy. Pak hru spusť.");
        expect(enforceTutorPolicy(
            "Např. blok b3 čeká. Zkus to.",
            {rung: 4, hasGoalContext: true},
        )).toBe("Např. blok b3 čeká. Zkus to.");
    });

    it("keeps an opcode intact", () => {
        const text = "Přidej blok event_whenkeypressed. Najdeš ho v Událostech.";
        expect(enforceTutorPolicy(text, {rung: 4, hasGoalContext: true})).toBe(text);
    });

    it("does not treat a quoted predicate as the tutor's question", () => {
        const reply = enforceTutorPolicy(
            "Blok „klávesa mezerník stisknuta?“ je podmínka. Přidej ji do smyčky.",
            {rung: 1, hasGoalContext: false},
        );
        expect(reply.endsWith("?")).toBe(true);
        expect(reply).toContain("Kterou část svého programu");
    });
});

describe("stripUnknownAliases", () => {
    const known = new Set(["b1", "b2"]);
    const exists = (alias: string) => known.has(alias);

    it("keeps aliases from the current render", () => {
        expect(stripUnknownAliases("Podívej se na b2.", exists)).toEqual({text: "Podívej se na b2.", removed: []});
    });

    it("removes invented aliases and reports them", () => {
        expect(stripUnknownAliases("Připoj b7 pod b1, ne b9.", exists)).toEqual({
            text: "Připoj pod b1, ne.",
            removed: ["b7", "b9"],
        });
    });
});
