/**
 * Guards the palette data against drifting from the editor it describes.
 *
 * `src/data/palette.json` is generated, and generated data that nobody re-derives is a
 * lie waiting to happen — the tutor sends a child to a category that has since moved.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PALETTE, paletteForPrompt } from "../src/palette.ts";

const here = dirname(fileURLToPath(import.meta.url));
const toolbox = resolve(here, "../../scratch-gui/src/lib/make-toolbox-xml.js");

const CATEGORY_CS: Record<string, string> = {
    motion: "Pohyb",
    looks: "Vzhled",
    sound: "Zvuk",
    events: "Události",
    control: "Ovládání",
    sensing: "Vnímání",
    operators: "Operátory",
};

/**
 * Re-derives opcode categories straight from the editor's toolbox source.
 * @returns Opcode to Czech category, for every block the toolbox XML declares.
 */
function categoriesFromToolbox(): Map<string, string> {
    const source = readFileSync(toolbox, "utf8");
    const starts = [...source.matchAll(/^const (\w+) = function \(/gm)].map((m) => ({
        name: m[1] ?? "",
        at: m.index,
    }));
    const found = new Map<string, string>();
    starts.forEach((section, index) => {
        const czech = CATEGORY_CS[section.name];
        if (!czech) return;
        const body = source.slice(section.at, starts[index + 1]?.at ?? source.length);
        for (const match of body.matchAll(/<block type="([a-z_0-9]+)"/g)) {
            const opcode = match[1] ?? "";
            if (opcode.endsWith("_menu")) continue;
            if (!found.has(opcode)) found.set(opcode, czech);
        }
    });
    return found;
}

describe("palette data", () => {
    it("agrees with the editor's toolbox about every category", () => {
        const truth = categoriesFromToolbox();
        for (const entry of PALETTE) {
            const expected = truth.get(entry.opcode);
            // Variables and lists are a dynamic category, absent from the toolbox XML.
            if (!expected) {
                expect(entry.category, `${entry.opcode} is not in the toolbox`).toBe("Proměnné");
                continue;
            }
            expect(entry.category, `${entry.opcode} moved category`).toBe(expected);
        }
    });

    it("places the block that caused the live failure in Události", () => {
        // Live regression: the tutor sent a child to "Pohyb" for this block.
        const entry = PALETTE.find((e) => e.opcode === "event_whenkeypressed");
        expect(entry?.category).toBe("Události");
        expect(entry?.cs).toBe("po stisku klávesy %1");
    });

    it("groups the prompt text under category headings", () => {
        const text = paletteForPrompt(["event_whenkeypressed", "motion_movesteps"]);
        expect(text).toContain("Události:");
        expect(text).toContain("Pohyb:");
        expect(text).toContain("event_whenkeypressed = po stisku klávesy %1");
    });
});
