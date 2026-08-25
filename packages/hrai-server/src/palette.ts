/**
 * The blocks a child can actually pick from the palette, with their real Czech labels
 * and real categories.
 *
 * Without this the tutor has no source of truth for any block the child does not
 * already have, and it invents them. Observed in live use: it sent a child to the
 * "Pohyb" category for `event_whenkeypressed`, which lives in "Události", under a
 * label that does not exist. Both halves of that sentence were fabricated.
 */
import palette from "./data/palette.json" with { type: "json" };

export interface PaletteEntry {
    opcode: string;
    /** Czech category name as it appears in the editor. */
    category: string;
    /** Czech label template, `%1` marking an input slot. */
    cs: string;
    en: string;
}

export const PALETTE = palette as PaletteEntry[];

/**
 * Renders the palette as prompt text, grouped by category.
 *
 * Grouping matters: the failure was a category claim, and a flat list makes the
 * category look like a per-block attribute the model can guess rather than a heading
 * it must read.
 * @param opcodes Restrict to these opcodes, e.g. a lesson's in-scope list. Omit for all.
 * @returns Lines of `opcode = label` grouped under Czech category headings.
 */
export function paletteForPrompt(opcodes?: readonly string[]): string {
    const allowed = opcodes ? new Set(opcodes) : null;
    const byCategory = new Map<string, PaletteEntry[]>();
    for (const entry of PALETTE) {
        if (allowed && !allowed.has(entry.opcode)) continue;
        const list = byCategory.get(entry.category) ?? [];
        list.push(entry);
        byCategory.set(entry.category, list);
    }

    const lines: string[] = [];
    for (const [category, entries] of byCategory) {
        lines.push(`${category}:`);
        for (const entry of entries) {
            lines.push(`  ${entry.opcode} = ${entry.cs}`);
        }
    }
    return lines.join("\n");
}
