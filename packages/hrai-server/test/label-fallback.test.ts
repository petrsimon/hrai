/**
 * Deterministic recognition of blocks the tutor names in Czech rather than by opcode.
 *
 * At rung 4 the model reliably names the right block but not reliably in the right form:
 * observed live, it wrote "najdi blok **po stisku klávesy**" instead of the opcode, so no
 * chip rendered and the child saw plain words where a coloured block belonged. Prompting
 * harder helps and does not settle it; this does, without trusting the model at all.
 */
import { describe, expect, it } from "vitest";
import { labelText, opcodesNamedByLabel } from "../src/palette.ts";

describe("labelText", () => {
    it("strips input slots", () => {
        expect(labelText("po stisku klávesy %1")).toBe("po stisku klávesy");
        expect(labelText("klouzej %1 sekund na x: %2 y: %3")).toBe("klouzej sekund na x: y:");
    });
});

describe("opcodesNamedByLabel", () => {
    it("finds the block behind the exact failure seen live", () => {
        const found = opcodesNamedByLabel("V kategorii Události najdi blok po stisku klávesy.");
        expect(found).toContain("event_whenkeypressed");
    });

    it("matches regardless of case", () => {
        expect(opcodesNamedByLabel("Použij blok Opakuj Stále.")).toContain("control_forever");
    });

    it("ignores single ordinary Czech words that happen to be labels", () => {
        // `délka` is the label of data_lengthoflist and also just a word.
        expect(opcodesNamedByLabel("Jaká je délka toho pohybu?")).not.toContain("data_lengthoflist");
    });

    it("returns the longest label first so nested labels do not win", () => {
        const found = opcodesNamedByLabel("použij opakuj dokud nenastane a taky opakuj stále");
        expect(found[0]).toBe("control_repeat_until");
    });

    it("finds nothing in prose that names no block", () => {
        expect(opcodesNamedByLabel("Co se má stát, když stiskneš šipku?")).toEqual([]);
    });
});
