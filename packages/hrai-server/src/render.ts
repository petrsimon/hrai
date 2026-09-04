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
import slotOrder from "./data/slot-order.json" with { type: "json" };

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
    lists?: Record<string, unknown>;
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

function variableValueText(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.length > 40 ? `${value.slice(0, 40)}…` : value;
    if (Array.isArray(value)) {
        return `(${value.length} položek) [${value.slice(0, 5).map(variableValueText).join(", ")}]`;
    }
    if (typeof value === "object") return "{…}";
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- primitives only past this point
    return String(value);
}

function namedValue(value: unknown): {name: string; value: unknown} | null {
    if (Array.isArray(value) && value.length >= 2) {
        return {name: String(value[0]), value: value[1]};
    }
    if (typeof value === "object" && value !== null && "name" in value) {
        const named = value as {name: unknown; value?: unknown};
        return {name: String(named.name), value: named.value};
    }
    return null;
}

function namedEntries(values: Record<string, unknown> | undefined): {name: string; value: unknown}[] {
    return Object.values(values ?? {})
        .map(namedValue)
        .filter((value): value is {name: string; value: unknown} => value !== null);
}

function variablesText(values: Record<string, unknown> | undefined): string[] {
    return namedEntries(values).map((variable) => `${variable.name}=${variableValueText(variable.value)}`);
}

function listsText(values: Record<string, unknown> | undefined): string[] {
    return namedEntries(values).map((list) => (
        `${list.name} (${Array.isArray(list.value) ? list.value.length : 0} položek)`
    ));
}

function fieldNamed(block: Block): string | null {
    const field = Object.values(block.fields).find((item) => item.name.toUpperCase().includes("BROADCAST"));
    if (!field) return null;
    const value = fieldText(field.value).trim();
    return value.length > 0 ? value : null;
}

function broadcastName(blocks: Record<string, Block>, block: Block): string | null {
    if (block.opcode === "event_whenbroadcastreceived") return fieldNamed(block);
    if (block.opcode !== "event_broadcast" && block.opcode !== "event_broadcastandwait") return null;
    const input = Object.values(block.inputs).find((item) => item.name.toUpperCase().includes("BROADCAST"));
    const menuId = input?.block ?? input?.shadow;
    const menu = menuId ? blocks[menuId] : undefined;
    return (menu && fieldNamed(menu)) ?? fieldNamed(block);
}

function scriptBlockCount(blocks: Record<string, Block>, startId: string): number {
    const visited = new Set<string>();
    const pending = [startId];
    let count = 0;
    while (pending.length > 0) {
        const id = pending.pop();
        if (!id || visited.has(id)) continue;
        visited.add(id);
        const block = blocks[id];
        if (!block) continue;
        if (!block.shadow) count += 1;
        if (block.next) pending.push(block.next);
        for (const input of Object.values(block.inputs)) {
            const child = input.block ?? input.shadow;
            if (child) pending.push(child);
        }
    }
    return count;
}

function blocksText(count: number): string {
    const suffix = count === 1 ? "blok" : count >= 2 && count <= 4 ? "bloky" : "bloků";
    return `${count} ${suffix}`;
}
/** Czech text for the icon slots that opcode-labels.ts supplies in English. */
const ICON_SLOTS_CS: Record<string, string> = {
    "green flag": "zelenou vlajku",
    right: "doprava",
    left: "doleva",
};
const INDENT = "  ";
const BOOLEAN_OPCODES = new Set([
    "operator_and",
    "operator_or",
    "operator_not",
    "operator_equals",
    "operator_lt",
    "operator_gt",
    "operator_contains",
    "sensing_touchingobject",
    "sensing_touchingcolor",
    "sensing_coloristouchingcolor",
    "sensing_keypressed",
    "sensing_mousedown",
    "data_listcontainsitem",
]);

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
    return BOOLEAN_OPCODES.has(block.opcode)
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

    const orderedArguments = (slotOrder as Record<string, string[]>)[block.opcode];
    const argumentsInDefinitionOrder = orderedArguments
        ? orderedArguments.flatMap((name) => {
            const input = block.inputs[name];
            if (input && !input.name.startsWith(BRANCH_PREFIX)) {
                return [renderInputValue(blocks, input, locale)];
            }
            const field = block.fields[name];
            return field ? [`[${fieldText(field.value)}]`] : [];
        })
        : [
            ...Object.values(block.inputs)
                .filter((i) => !i.name.startsWith(BRANCH_PREFIX))
                .map((i) => renderInputValue(blocks, i, locale)),
            ...Object.values(block.fields).map((f) => `[${fieldText(f.value)}]`),
        ];
    const iconArguments = iconSlots(block.opcode).map((slot) => (
        locale === "cs" ? ICON_SLOTS_CS[slot] ?? slot : slot
    ));
    const slots: string[] = [...iconArguments, ...argumentsInDefinitionOrder];

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
 * The focused target is rendered in full; every other target contributes compact script
 * root summaries. A child works on one sprite at a time, and rendering all of them in
 * full is the fastest way to exhaust a small model's context on blocks nobody asked about.
 * @param targets All targets in the project, stage included.
 * @param focusedTargetId The target the child currently has selected.
 * @param locale Label locale; `cs` renders Czech block labels.
 * @returns The rendered text and its alias map.
 */
export function renderProject(targets: RenderTarget[], focusedTargetId: string, locale = "en"): Render {
    const state = new RenderState();

    for (const target of targets) {
        if (target.id !== focusedTargetId) continue;
        state.lines.push(`${target.isStage ? "scéna" : "postava"}: ${target.name}`);
        const variables = variablesText(target.variables);
        if (variables.length > 0) {
            state.lines.push(`proměnné: ${variables.join(", ")}`);
        }
        const lists = listsText(target.lists);
        if (lists.length > 0) {
            state.lines.push(`seznamy: ${lists.join(", ")}`);
        }
        if (!target.isStage) {
            const stage = targets.find((item) => item.isStage);
            const globalVariables = variablesText(stage?.variables);
            const globalLists = listsText(stage?.lists);
            if (globalVariables.length > 0) {
                state.lines.push(`globální proměnné: ${globalVariables.join(", ")}`);
            }
            if (globalLists.length > 0) {
                state.lines.push(`globální seznamy: ${globalLists.join(", ")}`);
            }
        }
        const roots = Object.values(target.blocks).filter(isScriptRoot);
        if (roots.length === 0) {
            state.lines.push("(zatím žádné bloky)");
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
        let summarizedScripts = 0;
        const maxSummarizedScripts = 12;
        for (const other of others) {
            const roots = Object.values(other.blocks).filter(isScriptRoot);
            const kind = other.isStage ? "scéna" : "postava";
            if (roots.length === 0) {
                state.lines.push(`${kind}: ${other.name} — skripty: žádné`);
                continue;
            }
            const available = Math.max(maxSummarizedScripts - summarizedScripts, 0);
            const visible = roots.slice(0, available);
            summarizedScripts += visible.length;
            const entries = visible.map((root) => (
                `${renderBlockLabel(other.blocks, root, locale)} (${blocksText(scriptBlockCount(other.blocks, root.id))})`
            ));
            const remaining = roots.length - visible.length;
            const suffix = remaining > 0 ? `; … a dalších ${remaining} skriptů` : "";
            state.lines.push(`${kind}: ${other.name} — skripty: ${entries.join("; ")}${suffix}`);
        }
    }

    const messages = [...new Set(targets.flatMap((target) => Object.values(target.blocks)
        .map((block) => broadcastName(target.blocks, block))
        .filter((name): name is string => name !== null)))];
    if (messages.length > 0) {
        state.lines.push(`zprávy: ${messages.join(", ")}`);
    }

    return { text: state.lines.join("\n"), aliases: state.aliases };
}
