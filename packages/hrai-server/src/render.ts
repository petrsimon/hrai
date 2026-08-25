/**
 * Renders a child's project as pseudo-Scratch text.
 *
 * This is the load-bearing piece of hrai: its output is the model's view of the
 * project, the input to predicates and evals, and half of the authoring round-trip.
 *
 * Two properties matter more than prettiness:
 *
 *  - **Nesting is marked twice**: indentation, plus a closing `end <alias>` line naming
 *    the block it closes. Measured caveat, so nobody repeats the experiment: this does
 *    NOT rescue a small model. qwen3:8b fails the diagnosis evals identically with and
 *    without the markers, and merely gains a new thing to hallucinate as missing. They
 *    are kept because they make the format unambiguously parseable for the authoring
 *    round-trip and readable for a human, not because they buy model comprehension.
 *  - **Every block gets a short alias** (`b1`, `b2`, ...) valid only for this render.
 *    The model says "b7"; the panel highlights that block. Raw sb3 IDs are never
 *    shown to the model: they tokenize badly and small models mangle them.
 */
import { humanizeOpcode, iconSlots, labelTemplate } from "./opcode-labels.ts";

export interface BlockInput {
    name: string;
    block: string | null;
    shadow: string | null;
}

export interface BlockField {
    name: string;
    value: unknown;
}

export interface Block {
    id: string;
    opcode: string;
    next: string | null;
    parent: string | null;
    inputs: Record<string, BlockInput>;
    fields: Record<string, BlockField>;
    topLevel?: boolean;
    shadow?: boolean;
}

export interface RenderTarget {
    id: string;
    name: string;
    isStage: boolean;
    blocks: Record<string, Block>;
}

export interface Render {
    /** The pseudo-Scratch text handed to the model. */
    text: string;
    /** alias -> real block ID, valid only for this render. */
    aliases: Map<string, string>;
}

const BRANCH_PREFIX = "SUBSTACK";
const INDENT = "  ";

class RenderState {
    readonly lines: string[] = [];
    readonly aliases = new Map<string, string>();
    private nextAlias = 1;

    aliasFor(blockId: string): string {
        const alias = `b${this.nextAlias++}`;
        this.aliases.set(alias, blockId);
        return alias;
    }
}

/**
 * Renders one block's inline value: a nested reporter, a shadow's literal, or a field.
 * Inline values deliberately get no alias — the model refers to the statement that
 * contains them, and aliasing every literal would triple the alias count for no gain.
 */
function renderInputValue(blocks: Record<string, Block>, input: BlockInput, locale: string): string {
    const id = input.block ?? input.shadow;
    if (!id) return "()";
    const block = blocks[id];
    if (!block) return "()";

    // A shadow with a single field is a literal the child typed or picked.
    const fieldValues = Object.values(block.fields);
    if (block.shadow && fieldValues.length === 1) {
        return String(fieldValues[0].value ?? "");
    }

    const inner = renderBlockLabel(blocks, block, locale);
    // Booleans read as <...> in Scratch; everything else as (...).
    return block.opcode.startsWith("operator_") || block.opcode.startsWith("sensing_touching")
        ? `<${inner}>`
        : `(${inner})`;
}

/**
 * Fills a block's label template with its inputs and fields.
 * Falls back to the humanized opcode when the catalogue has no template, so a block
 * is never rendered as an empty line.
 */
function renderBlockLabel(blocks: Record<string, Block>, block: Block, locale: string): string {
    const template = labelTemplate(block.opcode, locale);
    if (!template) {
        // Variable and list reporters carry their name in a field rather than a label.
        const field = Object.values(block.fields)[0];
        return field ? String(field.value ?? "") : humanizeOpcode(block.opcode);
    }

    // %1, %2... are filled by icon text first, then inputs, then fields, in order.
    const slots: string[] = [
        ...iconSlots(block.opcode),
        ...Object.values(block.inputs)
            .filter((i) => !i.name.startsWith(BRANCH_PREFIX))
            .map((i) => renderInputValue(blocks, i, locale)),
        ...Object.values(block.fields).map((f) => `[${String(f.value ?? "")}]`),
    ];

    let slot = 0;
    return template.replace(/%\d/g, () => slots[slot++] ?? "()").trim();
}

/** Renders a stack of blocks starting at `startId`, following `next` to the end. */
function renderStack(
    state: RenderState,
    blocks: Record<string, Block>,
    startId: string | null,
    depth: number,
    locale: string,
): void {
    let currentId = startId;
    while (currentId) {
        const block = blocks[currentId];
        if (!block) return;

        const alias = state.aliasFor(block.id);
        const indent = INDENT.repeat(depth);
        state.lines.push(`${alias.padEnd(4)}${indent}${renderBlockLabel(blocks, block, locale)}`);

        const branches = Object.values(block.inputs).filter((i) => i.name.startsWith(BRANCH_PREFIX));
        for (const branch of branches) {
            renderStack(state, blocks, branch.block, depth + 1, locale);
        }
        if (branches.length > 0) {
            // The closing marker carries the opening block's alias, so "which end is
            // this?" is answerable without counting indentation.
            state.lines.push(`${" ".repeat(4)}${indent}end ${alias}`);
        }

        currentId = block.next;
    }
}

/** True for a block that starts a script and is not itself an inline value. */
function isScriptRoot(block: Block): boolean {
    return Boolean(block.topLevel) && !block.shadow;
}

/**
 * Renders a project as pseudo-Scratch text.
 *
 * The focused target is rendered in full; every other target gets a single summary
 * line. A child works on one sprite at a time, and rendering all of them in full is
 * the fastest way to exhaust a small model's context on blocks nobody asked about.
 * @param targets All targets in the project, stage included.
 * @param focusedTargetId The target the child currently has selected.
 * @param locale Label locale; `cs` renders Czech block labels.
 * @returns The rendered text and its alias map.
 */
export function renderProject(targets: RenderTarget[], focusedTargetId: string, locale = "en"): Render {
    const state = new RenderState();

    for (const target of targets) {
        if (target.id !== focusedTargetId) continue;
        state.lines.push(`postava: ${target.name}`);
        const roots = Object.values(target.blocks).filter(isScriptRoot);
        if (roots.length === 0) {
            state.lines.push("(zatim zadne bloky)");
        }
        roots.forEach((root, index) => {
            if (index > 0) state.lines.push("");
            renderStack(state, target.blocks, root.id, 0, locale);
        });
    }

    const others = targets.filter((t) => t.id !== focusedTargetId);
    if (others.length > 0) {
        state.lines.push("");
        for (const other of others) {
            const scripts = Object.values(other.blocks).filter(isScriptRoot).length;
            const count = Object.values(other.blocks).filter((b) => !b.shadow).length;
            const kind = other.isStage ? "scena" : "postava";
            state.lines.push(`${kind}: ${other.name}  (${scripts} skriptu, ${count} bloku)`);
        }
    }

    return { text: state.lines.join("\n"), aliases: state.aliases };
}
