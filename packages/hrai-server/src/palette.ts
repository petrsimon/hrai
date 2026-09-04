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
    /** Stable category identifier, for styling that must not depend on translated text. */
    categoryKey: string;
    /** Czech label template, `%1` marking an input slot. */
    cs: string;
    en: string;
}

export const PALETTE = palette as PaletteEntry[];

/** Scratch's stable category colours, named in Czech for the tutor prompt. */
export const CATEGORY_COLORS: Record<string, string> = {
    control: "oranžová",
    events: "žlutá",
    looks: "fialová",
    motion: "modrá",
    operators: "zelená",
    sensing: "světle modrá",
    sound: "růžová",
    variables: "oranžová",
};

/**
 * Strips input-slot markers from a label template: `po stisku klávesy %1` -> `po stisku klávesy`.
 * @param template A label as stored in the catalogue, slots included.
 * @returns The label as prose.
 */
export function labelText(template: string): string {
    return template.replace(/%\d/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Finds palette blocks that a reply names by their Czech label rather than by opcode.
 *
 * The tutor is told to write opcodes, because the panel turns those into a real picture
 * of the block. It mostly does, but not reliably at every rung, and a child then sees
 * plain words where a coloured block should be. Recognising the label is a deterministic
 * safety net: matching against the palette is exactly as safe as matching an opcode,
 * since both only ever resolve to a block that exists.
 *
 * Only labels of two or more words are matched. Single words like `délka` are ordinary
 * Czech and would turn innocent prose into block chips.
 * @param text The tutor's reply.
 * @returns Opcodes whose label appears in the text, longest label first.
 */
export function opcodesNamedByLabel(text: string): string[] {
    const haystack = text.toLocaleLowerCase("cs");
    const matches: { opcode: string; length: number }[] = [];
    for (const entry of PALETTE) {
        const label = labelText(entry.cs);
        if (label.split(" ").length < 2 || label.length < 8) continue;
        if (haystack.includes(label.toLocaleLowerCase("cs"))) {
            matches.push({ opcode: entry.opcode, length: label.length });
        }
    }
    // Longest first so `opakuj dokud nenastane` wins over any shorter label inside it.
    return matches.sort((a, b) => b.length - a.length).map((m) => m.opcode);
}

/**
 * Groups palette entries by their Czech category.
 * @param opcodes Restrict to these opcodes. Omit for all.
 * @returns Palette entries grouped in catalogue order.
 */
function entriesByCategory(opcodes?: readonly string[]): Map<string, PaletteEntry[]> {
    const allowed = opcodes ? new Set(opcodes) : null;
    const byCategory = new Map<string, PaletteEntry[]>();
    for (const entry of PALETTE) {
        if (allowed && !allowed.has(entry.opcode)) continue;
        const list = byCategory.get(entry.category) ?? [];
        list.push(entry);
        byCategory.set(entry.category, list);
    }
    return byCategory;
}

function catalogueLines(byCategory: Map<string, PaletteEntry[]>): string[] {
    const lines: string[] = [];
    for (const [category, entries] of byCategory) {
        lines.push(`${category}:`);
        for (const entry of entries) {
            lines.push(`  ${entry.opcode} = ${entry.cs}`);
        }
    }
    return lines;
}

/**
 * Renders the palette catalogue without category colours.
 * @param opcodes Restrict to these opcodes. Omit for all.
 * @returns Lines of `opcode = label` grouped under Czech category headings.
 */
export function paletteCatalogue(opcodes?: readonly string[]): string {
    return catalogueLines(entriesByCategory(opcodes)).join("\n");
}

/**
 * Renders the palette as prompt text, grouped by category and prefixed with colours.
 * @param opcodes Restrict to these opcodes, e.g. a lesson's in-scope list. Omit for all.
 * @returns Category colours followed by grouped `opcode = label` catalogue lines.
 */
export function paletteForPrompt(opcodes?: readonly string[]): string {
    const byCategory = entriesByCategory(opcodes);
    const lines: string[] = ["BARVY KATEGORIÍ:"];
    for (const [category, entries] of byCategory) {
        const categoryKey = entries[0]?.categoryKey;
        lines.push(`  ${category} = ${categoryKey ? CATEGORY_COLORS[categoryKey] ?? "neuvedená" : "neuvedená"}`);
    }
    lines.push("");
    lines.push(...catalogueLines(byCategory));
    return lines.join("\n");
}
