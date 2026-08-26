import soldierPredicates from "../content/lessons/11-soldier-battle/predicates.js";

export interface LessonStage {
    id: string;
    title: string;
    goal: string;
    instruction: string;
    success: string;
    predicate: string;
}

export interface LessonDefinition {
    id: string;
    stages: LessonStage[];
}

export interface LessonWorkspace {
    targets: unknown[];
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
            },
            {
                id: "01-selection-click",
                title: "Rozpoznej kliknutí na vojáka",
                goal: "Hra musí poznat, že hráč klikl na vlastního vojáka.",
                instruction: "Klikni na Modry mec v seznamu postav, tím otevřeš jeho program. Potom z kategorie Události přetáhni blok po kliknutí na tuto postavu; blok se nepřidá sám.",
                success: "Modrý voják má událost, která se spustí po kliknutí.",
                predicate: "selectionClick",
            },
            {
                id: "02-selection-memory",
                title: "Zapamatuj aktivního vojáka",
                goal: "Po kliknutí si hra zapamatuje, který voják je aktivní.",
                instruction: "Vytvoř pro všechny postavy proměnnou vybraný voják. Pod událost nastav tuto proměnnou na 1.",
                success: "Kliknutí na vojáka nastaví společnou proměnnou vybraný voják.",
                predicate: "selectionMemory",
            },
            {
                id: "03-selection-mark",
                title: "Ukaž aktivního vojáka",
                goal: "Hráč musí na scéně poznat, který voják je aktivní.",
                instruction: "Pod nastavení proměnné přidej změnu vzhledu, například nastav efekt barvy na 25.",
                success: "Kliknutí vojáka zapamatuje a zároveň viditelně změní jeho vzhled.",
                predicate: "selectionMark",
            },
            {
                id: "04-sword",
                title: "Zaútoč mečem",
                goal: "Vybraný voják s mečem zaútočí jen na blízkého nepřítele.",
                instruction: "Začni kliknutím na červeného vojáka a podmínkou, která ověří, zda je cíl v dosahu.",
                success: "Projekt obsahuje kliknutí na cíl a podmínku pro dosah útoku.",
                predicate: "swordAttack",
            },
            {
                id: "05-health",
                title: "Přidej životy a porážku",
                goal: "Každý zásah ubere životy a poražený nepřítel zmizí.",
                instruction: "Vytvoř životy, nastav je na 3 a při útoku je sniž. Při nule nepřítele skryj.",
                success: "Vojáci mají životy a poražený nepřítel se skryje.",
                predicate: "healthAndDeath",
            },
            {
                id: "06-bow",
                title: "Přidej lukostřelce",
                goal: "Lukostřelec má delší dosah, ale způsobí menší poškození.",
                instruction: "Rozliš typ vojáka a pro luk nastav dosah 4 a poškození 1.",
                success: "Útok používá typ vojáka a vzdálenost k cíli.",
                predicate: "bowAttack",
            },
            {
                id: "07-reinforcements",
                title: "Spusť čas a posily",
                goal: "Bitva trvá 60 sekund a přidá nejvýše pět posil.",
                instruction: "Každých 5 sekund vytvoř klon nepřítele a zastav po páté posile nebo po konci času.",
                success: "Projekt vytváří časované klony a počítá posily.",
                predicate: "reinforcements",
            },
            {
                id: "08-result",
                title: "Oznam výsledek",
                goal: "Po konci bitvy hra oznámí výhru nebo prohru.",
                instruction: "Vyšli zprávu konec hry a porovnej mrtvé a živé nepřátele.",
                success: "Hra po zprávě oznámí výsledek podle počtu nepřátel.",
                predicate: "result",
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
