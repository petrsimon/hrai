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
    variables?: Record<string, unknown>;
}

export interface Render {
    /** The pseudo-Scratch text handed to the model. */
    text: string;
    /** alias -> real block ID, valid only for this render. */
    aliases: Map<string, string>;
}

const BRANCH_PREFIX = "SUBSTACK";

/**
 * Stringifies a block field value for display.
 *
 * Field values are `unknown`: the VM stores whatever the field holds, and a plain
 * `String()` would render an object as `[object Object]` in front of the model.
 * @param value The raw field value.
 * @returns A display string, empty for null or undefined.
 */
function fieldText(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- primitives only past this point
    return String(value);
}
const INDENT = "  ";

class RenderState {
    readonly lines: string[] = [];
    readonly aliases = new Map<string, string>();
    readonly scriptRoots: string[] = [];
    readonly branches: { parentId: string; name: string; childId: string | null }[] = [];
    private nextAlias = 1;

    /**
     * Assigns the next alias to a block.
     * @param blockId The real block ID.
     * @returns The alias, valid only for this render.
     */
    aliasFor(blockId: string): string {
        const alias = `b${this.nextAlias++}`;
        this.aliases.set(alias, blockId);
        return alias;
    }

    /**
     * Finds the model-facing alias for a real VM block ID.
     * @param blockId Real VM block ID.
     * @returns The alias, or undefined when the block is not rendered.
     */
    aliasOf(blockId: string): string | undefined {
        for (const [alias, id] of this.aliases) {
            if (id === blockId) return alias;
        }
        return undefined;
    }
}

/**
 * Renders one block's inline value: a nested reporter, a shadow's literal, or a field.
 * Inline values deliberately get no alias — the model refers to the statement that
 * contains them, and aliasing every literal would triple the alias count for no gain.
 * @param blocks All blocks in the target, for resolving the referenced block.
 * @param input The input slot being rendered.
 * @param locale Catalogue locale to draw the template from.
 * @returns Inline text, wrapped in `<>` for booleans and `()` otherwise.
 */
function renderInputValue(blocks: Record<string, Block>, input: BlockInput, locale: string): string {
    const id = input.block ?? input.shadow;
    if (!id) return "()";
    const block = blocks[id];
    if (!block) return "()";

    // A shadow with a single field is a literal the child typed or picked.
    const fieldValues = Object.values(block.fields);
    if (block.shadow && fieldValues.length === 1) {
        return fieldText(fieldValues[0]?.value);
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
 * @param blocks All blocks in the target.
 * @param block The block whose label is being built.
 * @param locale Catalogue locale to draw the template from.
 * @returns The filled label text.
 */
function renderBlockLabel(blocks: Record<string, Block>, block: Block, locale: string): string {
    const template = labelTemplate(block.opcode, locale);
    if (!template) {
        // Variable and list reporters carry their name in a field rather than a label.
        const field = Object.values(block.fields)[0];
        return field ? fieldText(field.value) : humanizeOpcode(block.opcode);
    }

    // %1, %2... are filled by icon text first, then inputs, then fields, in order.
    const slots: string[] = [
        ...iconSlots(block.opcode),
        ...Object.values(block.inputs)
            .filter((i) => !i.name.startsWith(BRANCH_PREFIX))
            .map((i) => renderInputValue(blocks, i, locale)),
        ...Object.values(block.fields).map((f) => `[${fieldText(f.value)}]`),
    ];

    let slot = 0;
    return template.replace(/%\d/g, () => slots[slot++] ?? "()").trim();
}

/**
 * Renders a stack of blocks starting at `startId`, following `next` to the end.
 * @param state Accumulating lines and alias map.
 * @param blocks All blocks in the target.
 * @param startId First block of the stack, or null to render nothing.
 * @param depth Nesting depth; one indent level each.
 * @param locale Catalogue locale to draw the template from.
 */
function renderStack(
    state: RenderState,
    blocks: Record<string, Block>,
    startId: string | null,
    depth: number,
    locale: string,
): void {
    if (depth === 0 && startId) state.scriptRoots.push(startId);
    let currentId = startId;
    while (currentId) {
        const block = blocks[currentId];
        if (!block) return;

        const alias = state.aliasFor(block.id);
        const indent = INDENT.repeat(depth);
        state.lines.push(`${alias.padEnd(4)}${indent}${renderBlockLabel(blocks, block, locale)}`);

        const branches = Object.values(block.inputs).filter((i) => i.name.startsWith(BRANCH_PREFIX));
        for (const branch of branches) {
            state.branches.push({ parentId: block.id, name: branch.name, childId: branch.block });
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

/**
 * Renders one `next` chain as an explicit connection fact.
 * @param state Current aliases.
 * @param blocks Blocks belonging to the focused target.
 * @param startId First block in the chain.
 * @returns Aliases joined in execution order and terminated by `konec`.
 */
function renderConnectionChain(state: RenderState, blocks: Record<string, Block>, startId: string): string {
    const aliases: string[] = [];
    const visited = new Set<string>();
    let currentId: string | null = startId;
    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const alias = state.aliasOf(currentId);
        if (!alias) break;
        aliases.push(alias);
        currentId = blocks[currentId]?.next ?? null;
    }
    return `${aliases.join(" -> ")} -> konec`;
}

/**
 * Appends a compact structural view alongside the indented pseudo-Scratch view.
 * The model needs explicit edges because indentation alone is easy to misread.
 * @param state Render state containing aliases and structural edges.
 * @param blocks Blocks belonging to the focused target.
 */
function renderConnectionFacts(state: RenderState, blocks: Record<string, Block>): void {
    if (state.scriptRoots.length === 0) return;

    state.lines.push("");
    state.lines.push("struktura spojení (-> navazuje, / SUBSTACK je větev, samostatný skript je oddělený):");
    for (const rootId of state.scriptRoots) {
        state.lines.push(`  samostatný skript: ${renderConnectionChain(state, blocks, rootId)}`);
    }
    for (const branch of state.branches) {
        const parent = state.aliasOf(branch.parentId);
        if (!parent) continue;
        const chain = branch.childId
            ? renderConnectionChain(state, blocks, branch.childId)
            : "prázdná větev";
        state.lines.push(`  ${parent} / ${branch.name}: ${chain}`);
    }

    const parentFacts = [...state.aliases]
        .map(([alias, blockId]) => {
            const parentId = blocks[blockId]?.parent;
            const parent = parentId ? state.aliasOf(parentId) : undefined;
            return parent ? `${alias} <- ${parent}` : null;
        })
        .filter((fact): fact is string => fact !== null);
    if (parentFacts.length > 0) state.lines.push(`  rodičovské bloky: ${parentFacts.join(", ")}`);
}

/**
 * True for a block that starts a script and is not itself an inline value.
 * @param block The block to test.
 * @returns Whether the block roots a script.
 */
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
        const variables = Object.values(target.variables ?? {})
            .map((variable) => {
                if (Array.isArray(variable)) {
                    return `${String(variable[0])}=${fieldText(variable[1])}`;
                }
                if (typeof variable === "object" && variable !== null && "name" in variable) {
                    const namedVariable = variable as { name: unknown; value?: unknown };
                    return `${String(namedVariable.name)}=${fieldText(namedVariable.value)}`;
                }
                return null;
            })
            .filter((variable): variable is string => variable !== null);
        if (variables.length > 0) {
            state.lines.push(`proměnné: ${variables.join(", ")}`);
        }
        const roots = Object.values(target.blocks).filter(isScriptRoot);
        if (roots.length === 0) {
            state.lines.push("(zatim zadne bloky)");
        }
        roots.forEach((root, index) => {
            if (index > 0) state.lines.push("");
            renderStack(state, target.blocks, root.id, 0, locale);
        });
        renderConnectionFacts(state, target.blocks);
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
