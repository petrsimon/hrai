import soldierPredicates from "../content/lessons/11-soldier-battle/predicates.js";
import type {RenderTarget} from "./render.ts";

export interface LessonStage {
    id: string;
    title: string;
    goal: string;
    instruction: string;
    success: string;
    predicate: string;
    opcodes: string[];
}

export interface LessonDefinition {
    id: string;
    stages: LessonStage[];
}

export interface LessonWorkspace {
    targets: RenderTarget[];
}

export const LESSONS: Record<string, LessonDefinition> = {
    "11-soldier-battle": {
        id: "11-soldier-battle",
        stages: [
            {
                id: "00-board",
                title: "Prohlédni si bojiště",
                goal: "Zjisti, které postavy patří do modrého a červeného týmu.",
                instruction: "Klikni postupně na čtyři vojáky v seznamu postav a všimni si jejich názvů a pozic.",
                success: "Na bojišti jsou připraveni dva modří a dva červení vojáci.",
                predicate: "board",
                opcodes: [],
            },
            {
                id: "01-selection-click",
                title: "Rozpoznej kliknutí na vojáka",
                goal: "Hra musí poznat, že hráč klikl na vlastního vojáka.",
                instruction: "Klikni na Modry mec v seznamu postav, tím otevřeš jeho program. Potom z kategorie Události přetáhni blok po kliknutí na tuto postavu; blok se nepřidá sám.",
                success: "Modrý voják má událost, která se spustí po kliknutí.",
                predicate: "selectionClick",
                opcodes: ["event_whenthisspriteclicked"],
            },
            {
                id: "02-selection-memory",
                title: "Zapamatuj aktivního vojáka",
                goal: "Po kliknutí si hra zapamatuje, který voják je aktivní.",
                instruction: "Vytvoř pro všechny postavy proměnnou vybraný voják. Pod událost nastav tuto proměnnou na 1.",
                success: "Kliknutí na vojáka nastaví společnou proměnnou vybraný voják.",
                predicate: "selectionMemory",
                opcodes: ["event_whenthisspriteclicked", "data_setvariableto"],
            },
            {
                id: "03-selection-mark",
                title: "Ukaž aktivního vojáka",
                goal: "Hráč musí na scéně poznat, který voják je aktivní.",
                instruction: "Pod nastavení proměnné vybraný voják přidej změnu vzhledu, například nastav efekt barvy na 25.",
                success: "Kliknutí vojáka zapamatuje a zároveň viditelně změní jeho vzhled.",
                predicate: "selectionMark",
                opcodes: [
                    "event_whenthisspriteclicked",
                    "data_setvariableto",
                    "looks_seteffectto",
                    "looks_changeeffectby",
                    "looks_switchcostumeto",
                ],
            },
            {
                id: "04-sword",
                title: "Zaútoč mečem",
                goal: "Vybraný voják s mečem zaútočí jen na blízkého nepřítele.",
                instruction: "Začni kliknutím na červeného vojáka a podmínkou, která ověří, zda je cíl v dosahu.",
                success: "Projekt obsahuje kliknutí na cíl a podmínku pro dosah útoku.",
                predicate: "swordAttack",
                opcodes: ["event_whenthisspriteclicked", "control_if", "operator_lt", "operator_equals"],
            },
            {
                id: "05-health",
                title: "Přidej životy a porážku",
                goal: "Každý zásah ubere životy a poražený nepřítel zmizí.",
                instruction: "Vytvoř proměnnou životy, nastav ji na 3 a při útoku ji sniž. Při nule nepřítele skryj a uprav proměnné mrtví nepřátelé a živí nepřátelé.",
                success: "Vojáci mají životy a poražený nepřítel se skryje.",
                predicate: "healthAndDeath",
                opcodes: ["looks_hide"],
            },
            {
                id: "06-bow",
                title: "Přidej lukostřelce",
                goal: "Lukostřelec má delší dosah, ale způsobí menší poškození.",
                instruction: "Rozliš proměnnou typ vojáka a pro luk nastav dosah 4 a poškození 1.",
                success: "Útok používá typ vojáka a vzdálenost k cíli.",
                predicate: "bowAttack",
                opcodes: ["sensing_distanceto"],
            },
            {
                id: "07-reinforcements",
                title: "Spusť čas a posily",
                goal: "Bitva trvá 60 sekund a přidá nejvýše pět posil.",
                instruction: "Vytvoř proměnnou počet posil. Každých 5 sekund vytvoř klon nepřítele a zastav po páté posile nebo po konci času.",
                success: "Projekt vytváří časované klony a počítá posily.",
                predicate: "reinforcements",
                opcodes: ["control_create_clone_of", "control_wait"],
            },
            {
                id: "08-result",
                title: "Oznam výsledek",
                goal: "Po konci bitvy hra oznámí výhru nebo prohru.",
                instruction: "Vyšli zprávu konec hry a porovnej mrtví nepřátelé a živí nepřátelé.",
                success: "Hra po zprávě oznámí výsledek podle počtu nepřátel.",
                predicate: "result",
                opcodes: ["event_broadcast", "event_whenbroadcastreceived", "operator_gt", "looks_say"],
            },
        ],
    },
};

export function lessonStage(lessonId: string, stageIndex: number): LessonStage | null {
    const lesson = LESSONS[lessonId];
    return lesson?.stages[stageIndex] ?? null;
}

type LessonPredicate = (workspace: LessonWorkspace) => boolean;

const predicates = soldierPredicates as unknown as Record<string, LessonPredicate>;

function blockOpcodes(targets: RenderTarget[]): Set<string> {
    return new Set(targets.flatMap((target) => Object.values(target.blocks)
        .filter((block) => !block.shadow)
        .map((block) => block.opcode)));
}

function targetByName(targets: RenderTarget[], name: string): RenderTarget | undefined {
    return targets.find((target) => target.name === name);
}

function targetHasMissingOpcodes(target: RenderTarget | undefined, opcodes: string[]): string[] {
    if (!target) return opcodes;
    const present = new Set(Object.values(target.blocks)
        .filter((block) => !block.shadow)
        .map((block) => block.opcode));
    return opcodes.filter((opcode) => !present.has(opcode));
}

function hasSharedVariable(targets: RenderTarget[]): boolean {
    return targets.some((target) => target.isStage && Object.keys(target.variables ?? {}).length > 0);
}

function missingVariables(targets: RenderTarget[], names: string[]): string[] {
    const present = new Set(targets.flatMap((target) => Object.values(target.variables ?? {})
        .map((variable) => {
            if (Array.isArray(variable)) return (variable as unknown[])[0];
            if (typeof variable === "object" && variable !== null && "name" in variable) {
                return variable.name;
            }
            return undefined;
        })
        .filter((name): name is string => typeof name === "string")));
    return names.filter((name) => !present.has(name));
}

function missingAnyOpcode(opcodes: string[], present: Set<string>): string[] {
    return opcodes.some((opcode) => present.has(opcode)) ? [] : [`jeden z ${opcodes.join(", ")}`];
}

/**
 * Describes lesson evidence at a rung where exact blocks may be named.
 * @param stage Active authored stage.
 * @param targets Current normalized Scratch targets.
 * @param rung Hint-ladder rung.
 * @returns Czech evidence lines for the prompt context.
 */
export function describeLessonEvidence(
    stage: LessonStage,
    targets: RenderTarget[],
    rung: number,
): string[] {
    if (rung < 4) return ["Podmínka kroku zatím není splněna."];

    const present = blockOpcodes(targets);
    const missing: string[] = [];
    const selected = targetByName(targets, "Modry mec");
    const selectedPresent = new Set(Object.values(selected?.blocks ?? {})
        .filter((block) => !block.shadow)
        .map((block) => block.opcode));
    switch (stage.predicate) {
    case "board": {
        const count = targets.filter((target) => !target.isStage).length;
        if (count < 4) missing.push(`ještě ${4 - count} postavy`);
        break;
    }
    case "selectionClick":
        missing.push(...targetHasMissingOpcodes(selected, ["event_whenthisspriteclicked"]));
        break;
    case "selectionMemory":
        missing.push(...targetHasMissingOpcodes(selected, ["event_whenthisspriteclicked", "data_setvariableto"]));
        if (!hasSharedVariable(targets)) missing.push("společná proměnná na scéně");
        break;
    case "selectionMark":
        missing.push(...targetHasMissingOpcodes(selected, ["event_whenthisspriteclicked", "data_setvariableto"]));
        if (!hasSharedVariable(targets)) missing.push("společná proměnná na scéně");
        missing.push(...missingAnyOpcode([
            "looks_seteffectto",
            "looks_changeeffectby",
            "looks_switchcostumeto",
        ], selectedPresent));
        break;
    case "swordAttack":
        missing.push(...["event_whenthisspriteclicked", "control_if"].filter((opcode) => !present.has(opcode)));
        missing.push(...missingAnyOpcode(["operator_lt", "operator_equals"], present));
        break;
    case "healthAndDeath":
        missing.push(...missingVariables(targets, ["životy", "mrtví nepřátelé", "živí nepřátelé"]));
        if (!present.has("looks_hide")) missing.push("looks_hide");
        break;
    case "bowAttack":
        if (!present.has("sensing_distanceto")) missing.push("sensing_distanceto");
        missing.push(...missingVariables(targets, ["typ"]));
        break;
    case "reinforcements":
        missing.push(...["control_create_clone_of", "control_wait"].filter((opcode) => !present.has(opcode)));
        missing.push(...missingVariables(targets, ["počet posil"]));
        break;
    case "result":
        missing.push(...["event_broadcast", "event_whenbroadcastreceived", "operator_gt", "looks_say"]
            .filter((opcode) => !present.has(opcode)));
        break;
    }

    return missing.length > 0 ? missing.map((item) => `chybí: ${item}`) : ["Podmínka kroku je splněna."];
}

export function evaluateLessonStage(
    lessonId: string,
    stageIndex: number,
    workspace: LessonWorkspace,
): boolean {
    const stage = lessonStage(lessonId, stageIndex);
    if (!stage || lessonId !== "11-soldier-battle") return false;
    const predicate = predicates[stage.predicate];
    return typeof predicate === "function" && predicate(workspace);
}
