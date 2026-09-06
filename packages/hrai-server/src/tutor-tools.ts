/**
 * The tools the tutor agent has, and the one it must use.
 *
 * `tell_child` is the only way a word reaches the Hrai tab. The pedagogical policy is enforced on
 * its arguments, so a reply that breaks a rule is refused with the rule spelled out and the model
 * tries again — the child never sees the attempt. The other three let the agent look at the
 * project, the active step and the palette without those being pasted into every turn.
 */
import {Type} from "typebox";
import {defineTool, type ToolDefinition} from "@earendil-works/pi-coding-agent";
import {PALETTE, categoryColoursForPrompt, labelText, paletteCatalogue} from "./palette.ts";
import type {Session} from "./session.ts";
import {enforceTutorPolicy, stripUnknownAliases} from "./tutor-policy.ts";

export interface ChildMessage {
    text: string;
    /** Opcodes the tutor named, each guaranteed to exist in the palette. */
    blocks: string[];
}

/** What the tools see of the turn they run in. Set by the session before each prompt. */
export interface ToolTurn {
    session: Session;
    rung: number;
    delivered: ChildMessage | null;
}

const BY_OPCODE = new Map(PALETTE.map((entry) => [entry.opcode, entry]));
const MAX_TEXT_LENGTH = 600;

/**
 * A tool that throws is an error result to pi: the model reads the reason and tries again.
 * @param text The rule the reply broke, addressed to the model.
 */
function refused(text: string): never {
    throw new Error(text);
}

function said(text: string): Promise<{content: {type: "text"; text: string}[]; details: Record<string, never>}> {
    return Promise.resolve({content: [{type: "text" as const, text}], details: {}});
}

/**
 * Builds the four tools around a turn accessor.
 * @param turn Returns the current turn; throws when none is running.
 * @returns Tool definitions for `createAgentSession`.
 */
export function createTutorTools(turn: () => ToolTurn): ToolDefinition[] {
    const tellChild = defineTool({
        name: "tell_child",
        label: "Řekni dítěti",
        description: "Doručí dítěti tvou odpověď. Zavolej ji právě jednou na konci každého tahu. " +
            "Text má nejvýše dvě krátké české věty. Do blocks dej kódy bloků, které v textu jmenuješ " +
            "(například motion_movesteps); na úrovni nápovědy 1–3 nech blocks prázdné.",
        parameters: Type.Object({
            text: Type.String({description: "Zpráva pro dítě, nejvýše dvě věty, česky"}),
            blocks: Type.Optional(Type.Array(Type.String({description: "Kód bloku z palety"}))),
        }),
        execute: (_toolCallId, params) => {
            const current = turn();
            if (current.delivered) {
                refused("Zpráva už byla doručena. V jednom tahu volej tell_child jen jednou.");
            }
            const raw = params.text.trim();
            if (!raw) refused("Text je prázdný. Napiš dítěti jednu nebo dvě věty.");
            if (raw.length > MAX_TEXT_LENGTH) {
                refused(`Text je moc dlouhý (${raw.length} znaků). Nejvýše dvě krátké věty.`);
            }
            const blocks = [...new Set(params.blocks ?? [])];
            const unknown = blocks.filter((opcode) => !BY_OPCODE.has(opcode));
            if (unknown.length > 0) {
                refused(`Tyto kódy bloků v paletě nejsou: ${unknown.join(", ")}. Použij kódy ze seznamu, ` +
                    "nebo blocks vynech.");
            }
            if (current.rung <= 2 && blocks.length > 0) {
                refused(`Na úrovni nápovědy ${current.rung} nesmíš jmenovat konkrétní blok. ` +
                    "Pošli zprávu bez blocks a bez názvu bloku.");
            }
            const context = current.session.tutorContext;
            const policed = enforceTutorPolicy(raw, {rung: current.rung, hasGoalContext: context !== undefined});
            const {text, removed} = stripUnknownAliases(policed, (alias) => current.session.resolveAlias(alias) !== undefined);
            if (removed.length > 0) {
                refused(`Značky ${removed.join(", ")} v projektu nejsou. Piš jen značky, které projekt má, ` +
                    "nebo blok popiš slovy.");
            }
            current.delivered = {text, blocks};
            return said("Doručeno.");
        },
    });

    const readProject = defineTool({
        name: "read_project",
        label: "Přečti projekt",
        description: "Vrátí aktuální projekt dítěte jako pseudo-Scratch text. Projekt se mohl od zprávy dítěte změnit.",
        parameters: Type.Object({}),
        execute: () => said(turn().session.render()),
    });

    const stepStatus = defineTool({
        name: "step_status",
        label: "Stav kroku",
        description: "Vrátí aktivní krok lekce nebo milník hry: cíl, kdy je hotový a jaké důkazy v projektu zatím jsou.",
        parameters: Type.Object({}),
        execute: () => {
            const current = turn();
            const context = current.session.tutorContextFor(current.rung);
            if (!context) return said("Žádný krok není aktivní. Dítě si volně hraje.");
            const lines = [
                `KROK: ${context.title}`,
                `CÍL: ${context.goal}`,
                `HOTOVO, KDYŽ: ${context.success}`,
                ...(current.rung >= 3 ? [`TEĎ MÁ UDĚLAT: ${context.instruction}`] : []),
                ...(context.evidence?.length ? ["DŮKAZY V PROJEKTU:", ...context.evidence.map((line) => `- ${line}`)] : []),
            ];
            return said(lines.join("\n"));
        },
    });

    const palette = defineTool({
        name: "palette",
        label: "Paleta bloků",
        description: "Vrátí bloky z palety editoru: kód, český název a kategorii. Lze zúžit na kategorii nebo slovo z názvu. " +
            "Na úrovni nápovědy 3 vrátí jen kategorie a jejich barvy; na úrovních 1–2 nic, protože tam bloky nejmenuješ.",
        parameters: Type.Object({
            category: Type.Optional(Type.String({description: "Česká kategorie, například Pohyb"})),
            query: Type.Optional(Type.String({description: "Slovo z názvu bloku nebo části kódu"})),
        }),
        execute: (_toolCallId, params) => {
            const current = turn();
            if (current.rung <= 2) {
                refused(`Na úrovni nápovědy ${current.rung} nejmenuješ bloky ani kategorie; paleta není k dispozici.`);
            }
            if (current.rung === 3) return said(categoryColoursForPrompt());
            const category = params.category?.trim().toLowerCase();
            const query = params.query?.trim().toLowerCase();
            const matching = PALETTE.filter((entry) =>
                (!category || entry.category.toLowerCase() === category) &&
                (!query || entry.opcode.includes(query) || labelText(entry.cs).toLowerCase().includes(query)));
            if (matching.length === 0) return said("Nic neodpovídá. Zkus jinou kategorii nebo slovo.");
            return said(paletteCatalogue(matching.map((entry) => entry.opcode)));
        },
    });

    return [tellChild, readProject, stepStatus, palette];
}

export const TUTOR_TOOL_NAMES = ["tell_child", "read_project", "step_status", "palette"];

/** Appended to the tutor's system prompt: how a reply reaches the child at all. */
export const TOOL_RULES = [
    "",
    "NÁSTROJE:",
    "Dítě vidí jen to, co doručíš nástrojem tell_child. Prostý text dítě nevidí. Na konci každého tahu zavolej tell_child právě jednou.",
    "Když nástroj odpověď odmítne, oprav ji podle důvodu a zavolej tell_child znovu.",
    "Do blocks v tell_child dej kódy bloků, které v textu jmenuješ; na úrovni 1–3 nech blocks prázdné.",
    "read_project vrátí aktuální projekt, step_status aktivní krok, palette bloky z palety (jen na úrovni 3 a výš).",
].join("\n");
