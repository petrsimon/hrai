/**
 * Human-readable label templates for block opcodes, sourced from scratch-l10n.
 *
 * Using the editor's own message catalogue rather than hardcoded strings means the
 * render always matches the palette the child is looking at, and a Czech render is a
 * locale argument rather than a second table to maintain.
 */
import blocksMessages from "scratch-l10n/locales/blocks-msgs.js";

/**
 * Most opcodes map to their uppercased selves (`motion_movesteps` -> `MOTION_MOVESTEPS`).
 * These do not, and were found by checking every opcode the course uses against the
 * catalogue — see the course spec's opcode tables.
 */
const IRREGULAR_KEYS: Record<string, string> = {
    control_if_else: "CONTROL_IF",
    control_wait_until: "CONTROL_WAITUNTIL",
    control_repeat_until: "CONTROL_REPEATUNTIL",
    control_start_as_clone: "CONTROL_STARTASCLONE",
    control_create_clone_of: "CONTROL_CREATECLONEOF",
    control_delete_this_clone: "CONTROL_DELETETHISCLONE",
    operator_and: "OPERATORS_AND",
    operator_or: "OPERATORS_OR",
    operator_not: "OPERATORS_NOT",
    operator_equals: "OPERATORS_EQUALS",
    operator_lt: "OPERATORS_LT",
    operator_gt: "OPERATORS_GT",
    operator_random: "OPERATORS_RANDOM",
    operator_join: "OPERATORS_JOIN",
    operator_length: "OPERATORS_LENGTH",
    operator_contains: "OPERATORS_CONTAINS",
    operator_add: "OPERATORS_ADD",
    operator_subtract: "OPERATORS_SUBTRACT",
    operator_multiply: "OPERATORS_MULTIPLY",
    operator_divide: "OPERATORS_DIVIDE",
    operator_mod: "OPERATORS_MOD",
    operator_round: "OPERATORS_ROUND",
};

/**
 * Some label templates have slots filled by an icon in the editor rather than by a
 * block input — the green flag, the two turn arrows. Rendering them from inputs alone
 * misaligns every later slot (`turn 15 () degrees`), so the icon text is supplied here
 * and consumed before the block's own inputs.
 */
const ICON_SLOTS: Record<string, string[]> = {
    event_whenflagclicked: ["green flag"],
    motion_turnright: ["right"],
    motion_turnleft: ["left"],
};

/**
 * Text standing in for a block's icon slots, in template order.
 * @param opcode The block opcode.
 * @returns Icon substitutions, empty when the block has none.
 */
export function iconSlots(opcode: string): string[] {
    return ICON_SLOTS[opcode] ?? [];
}

const catalogue = blocksMessages;

/**
 * The label template for an opcode, with `%1`/`%2` marking input slots.
 * Returns undefined when the catalogue has no entry — variable and list reporters
 * legitimately have none, because their label is the variable's own name.
 * @param opcode The block opcode, e.g. `motion_movesteps`.
 * @param locale Catalogue locale, defaulting to English.
 * @returns The label template, or undefined when the opcode has no fixed label.
 */
export function labelTemplate(opcode: string, locale = "en"): string | undefined {
    const key = IRREGULAR_KEYS[opcode] ?? opcode.toUpperCase();
    return catalogue[locale]?.[key] ?? catalogue.en?.[key];
}

/**
 * Last-resort label for an opcode with no catalogue entry: `motion_movesteps` reads
 * as `motion movesteps`. Never silently blank — an unlabelled block in the render
 * would be invisible to the model, which is worse than an ugly one.
 * @param opcode The block opcode.
 * @returns A readable fallback label.
 */
export function humanizeOpcode(opcode: string): string {
    return opcode.replace(/_/g, " ");
}
