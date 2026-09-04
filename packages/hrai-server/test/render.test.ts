/**
 * Renderer unit tests. Pure function, no model, no network — these gate merges.
 */
import { describe, expect, it } from "vitest";
import { renderProject, type Block, type BlockInput, type RenderTarget } from "../src/render.ts";
import { Session } from "../src/session.ts";

/**
 * Builds a block with the defaults the VM would supply.
 * @param id Unique identifier the alias map will point back to.
 * @param opcode Scratch opcode, e.g. `motion_movesteps`.
 * @param extra Overrides such as `next`, `inputs` or `topLevel`.
 * @returns A block ready to drop into a target's block map.
 */
function block(id: string, opcode: string, extra: Partial<Block> = {}): Block {
    return { id, opcode, next: null, parent: null, inputs: {}, fields: {}, ...extra };
}

/**
 * A numeric shadow, as the VM stores a literal the child typed.
 * @param id Block ID.
 * @param value The literal value.
 * @returns The shadow block.
 */
function numberShadow(id: string, value: number): Block {
    return block(id, "math_number", { shadow: true, fields: { NUM: { name: "NUM", value } } });
}

/**
 * Builds a render target from a list of blocks.
 * @param name Sprite name.
 * @param blocks Blocks belonging to the sprite.
 * @param id Target ID, defaulting to the name.
 * @returns The render target.
 */
function target(name: string, blocks: Block[], id = name): RenderTarget {
    return { id, name, isStage: false, blocks: Object.fromEntries(blocks.map((b) => [b.id, b])) };
}

describe("renderProject", () => {
    it("renders a flat script with aliases in encounter order", () => {
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "mv" }),
            block("mv", "motion_movesteps", {
                inputs: { STEPS: { name: "STEPS", block: "n", shadow: "n" } },
            }),
            numberShadow("n", 10),
        ]);

        const { text, aliases } = renderProject([t], "Rover");

        expect(text).toContain("when");
        expect(text).toContain("move 10 steps");
        expect(text).toContain("samostatný skript: b1 -> b2 -> konec");
        expect(aliases.get("b1")).toBe("hat");
        expect(aliases.get("b2")).toBe("mv");
    });

    it("closes every C-block with an end marker naming its opening alias", () => {
        // The 8B failure this guards: reporting a block absent because it could not
        // tell the block sat inside the loop.
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "fv" }),
            block("fv", "control_forever", {
                inputs: { SUBSTACK: { name: "SUBSTACK", block: "mv", shadow: null } },
            }),
            block("mv", "motion_movesteps", {
                inputs: { STEPS: { name: "STEPS", block: "n", shadow: "n" } },
            }),
            numberShadow("n", 10),
        ]);

        const { text } = renderProject([t], "Rover");
        const lines = text.split("\n");

        const forever = lines.findIndex((l) => l.includes("forever"));
        const move = lines.findIndex((l) => l.includes("move 10 steps"));
        const end = lines.findIndex((l) => l.includes("end b2"));

        expect(forever).toBeLessThan(move);
        expect(move).toBeLessThan(end);
        // The nested block is indented past its container.
        const moveLine = lines[move] ?? "";
        const foreverLine = lines[forever] ?? "";
        expect(moveLine.indexOf("move")).toBeGreaterThan(foreverLine.indexOf("forever"));
        expect(text).toContain("samostatný skript: b1 -> b2 -> konec");
        expect(text).toContain("b2 / SUBSTACK: b3 -> konec");
    });

    it("describes disconnected scripts and empty branches explicitly", () => {
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "loop" }),
            block("loop", "control_forever", {
                parent: "hat",
                inputs: { SUBSTACK: { name: "SUBSTACK", block: null, shadow: null } },
            }),
            block("key", "event_whenkeypressed", { topLevel: true }),
        ]);

        const { text } = renderProject([t], "Rover");

        expect(text).toContain("samostatný skript: b1 -> b2 -> konec");
        expect(text).toContain("samostatný skript: b3 -> konec");
        expect(text).toContain("b2 / SUBSTACK: prázdná větev");
        expect(text).not.toContain("rodičovské bloky:");
    });

    it("renders a boolean input inside angle brackets", () => {
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "iff" }),
            block("iff", "control_if", {
                inputs: {
                    CONDITION: { name: "CONDITION", block: "touch", shadow: null },
                    SUBSTACK: { name: "SUBSTACK", block: null, shadow: null },
                },
            }),
            block("touch", "sensing_touchingobject", {
                inputs: { TOUCHINGOBJECTMENU: { name: "TOUCHINGOBJECTMENU", block: "menu", shadow: "menu" } },
            }),
            block("menu", "sensing_touchingobjectmenu", {
                shadow: true,
                fields: { TOUCHINGOBJECTMENU: { name: "TOUCHINGOBJECTMENU", value: "Edge" } },
            }),
        ]);

        const { text } = renderProject([t], "Rover");
        expect(text).toMatch(/<.*Edge.*>/);
    });

    it("uses angle brackets only for boolean reporter opcodes", () => {
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "if" }),
            block("if", "control_if", {
                inputs: {
                    CONDITION: { name: "CONDITION", block: "key", shadow: null },
                    SUBSTACK: { name: "SUBSTACK", block: null, shadow: null },
                },
            }),
            block("key", "sensing_keypressed", {
                inputs: { KEY_OPTION: { name: "KEY_OPTION", block: "key-menu", shadow: "key-menu" } },
            }),
            block("key-menu", "sensing_keyoptions", {
                shadow: true,
                fields: { KEY_OPTION: { name: "KEY_OPTION", value: "space" } },
            }),
        ]);
        const arithmetic = target("Pearl", [
            block("add", "operator_add", {
                topLevel: true,
                inputs: {
                    NUM1: { name: "NUM1", block: "one", shadow: "one" },
                    NUM2: { name: "NUM2", block: "two", shadow: "two" },
                },
            }),
            numberShadow("one", 1),
            numberShadow("two", 2),
        ]);

        const { text } = renderProject([t, arithmetic], "Rover");
        expect(text).toMatch(/<.*space.*>/);
        expect(text).not.toContain("<1 + 2>");
    });

    it("summarises unfocused targets by script root", () => {
        const focused = target("Rover", [block("h", "event_whenflagclicked", { topLevel: true })]);
        const stage = { ...target("Stage", []), isStage: true };
        const other = target("Pearl", [
            block("h2", "event_whenflagclicked", { topLevel: true, next: "m2" }),
            block("m2", "motion_movesteps"),
        ]);

        const { text } = renderProject([focused, stage, other], "Rover", "cs");

        expect(text).toContain("postava: Rover");
        expect(text).toContain("scéna: Stage");
        expect(text).toContain("postava: Pearl — skripty: po kliknutí na zelenou vlajku (2 bloky)");
        // The unfocused target contributes no aliased block lines.
        expect(text).not.toContain("move");
    });

    it("renders global stage variables and lists when a sprite is focused", () => {
        const stage = {
            ...target("Stage", []),
            isStage: true,
            variables: { score: ["Skóre", 4] },
            lists: { messages: { name: "Zprávy", value: ["start", "konec"] } },
        };
        const sprite = {
            ...target("Rover", []),
            variables: { lives: ["Životy", 3] },
            lists: { inventory: { name: "Batoh", value: ["meč"] } },
        };

        const { text } = renderProject([stage, sprite], "Rover", "cs");

        expect(text).toContain("proměnné: Životy=3");
        expect(text).toContain("seznamy: Batoh (1 položek)");
        expect(text).toContain("globální proměnné: Skóre=4");
        expect(text).toContain("globální seznamy: Zprávy (2 položek)");
    });

    it("caps unfocused script summaries at twelve scripts", () => {
        const focused = target("Rover", []);
        const roots = Array.from({length: 13}, (_, index) => (
            block(`hat-${index}`, "event_whenflagclicked", {topLevel: true})
        ));
        const other = target("Enemy", roots);

        const { text } = renderProject([focused, other], "Rover", "cs");
        const summary = text.split("\n").find(line => line.startsWith("postava: Enemy"));

        expect(summary).toContain("skripty:");
        expect(summary).toContain("… a dalších 1 skriptů");
        expect((summary?.match(/\(1 blok\)/g) ?? [])).toHaveLength(12);
    });

    it("lists broadcast message names used by senders and receivers", () => {
        const menu = block("menu", "event_broadcast_menu", {
            shadow: true,
            fields: { BROADCAST_OPTION: { name: "BROADCAST_OPTION", value: "konec hry" } },
        });
        const sender = target("Rover", [
            block("send", "event_broadcast", {
                topLevel: true,
                inputs: { BROADCAST_INPUT: { name: "BROADCAST_INPUT", block: "menu", shadow: "menu" } },
            }),
            menu,
        ]);
        const receiver = target("Enemy", [
            block("receive", "event_whenbroadcastreceived", {
                topLevel: true,
                fields: { BROADCAST_OPTION: { name: "BROADCAST_OPTION", value: "start" } },
            }),
        ]);

        const { text } = renderProject([sender, receiver], "Rover", "cs");

        expect(text).toContain("zprávy: konec hry, start");
    });

    it("names a focused stage as a scene and unfocused stages with Czech diacritics", () => {
        const stage = { ...target("Stage", []), isStage: true };
        const sprite = target("Rover", [block("h", "event_whenflagclicked", { topLevel: true })]);

        const { text } = renderProject([stage, sprite], "stage");
        expect(text).toContain("scéna: Stage");
        expect(text).toContain("postava: Rover");
    });

    it("renders focused sprite variables from VM and SB3 shapes", () => {
        const t = {
            ...target("Rover", []),
            variables: {
                vmVariable: { name: "selected soldier", value: 1 },
                sb3Variable: ["health", 3],
            },
        };
        const { text } = renderProject([t], "Rover");
        expect(text).toContain("proměnné: selected soldier=1, health=3");
    });

    it("caps variable values and renders list summaries", () => {
        const t = {
            ...target("Rover", []),
            variables: {
                long: { name: "long", value: "a".repeat(41) },
                array: { name: "array", value: ["one", "two", "three", "four", "five", "six"] },
                object: { name: "object", value: { secret: true } },
            },
            lists: {
                inventory: { name: "inventory", value: ["sword", "bow", "shield"] },
            },
        };
        const { text } = renderProject([t], "Rover");
        expect(text).toContain(`long=${"a".repeat(40)}…`);
        expect(text).toContain("array=(6 položek) [one, two, three, four, five]");
        expect(text).toContain("object={…}");
        expect(text).toContain("seznamy: inventory (3 položek)");
    });

    it("says so explicitly when the focused sprite has no blocks", () => {
        // An empty project is a real state a child reaches, and an empty render
        // would leave the model guessing whether it was given anything at all.
        const { text } = renderProject([target("Rover", [])], "Rover");
        expect(text).toContain("zatím žádné bloky");
    });

    it("never emits an empty label for an unknown opcode", () => {
        const t = target("Rover", [block("x", "some_extension_block", { topLevel: true })]);
        const { text } = renderProject([t], "Rover");
        expect(text).toContain("some extension block");
    });

    it("fills icon slots so later slots do not shift", () => {
        // Regression: `turn %1 %2 degrees` has an icon in %1. Filling it from inputs
        // alone produced "turn 15 () degrees" — every slot after an icon was wrong.
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "tr" }),
            block("tr", "motion_turnright", {
                inputs: { DEGREES: { name: "DEGREES", block: "n", shadow: "n" } },
            }),
            numberShadow("n", 15),
        ]);

        const { text } = renderProject([t], "Rover");
        expect(text).toContain("when green flag clicked");
        expect(text).toContain("turn right 15 degrees");
        expect(text).not.toContain("()");
    });

    it("renders Czech labels when asked", () => {
        const t = target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true, next: "fv" }),
            block("fv", "control_forever", { inputs: { SUBSTACK: { name: "SUBSTACK", block: null, shadow: null } } }),
        ]);
        const { text } = renderProject([t], "Rover", "cs");
        expect(text).toContain("opakuj stále");
    });

    it("renders mixed field and input arguments in Scratch definition order", () => {
        const input = (name: string, id: string): BlockInput => ({
            name,
            block: id,
            shadow: id,
        });
        const number = (id: string, value: number): Block => numberShadow(id, value);
        const literal = (id: string, value: string): Block => block(id, "text", {
            shadow: true,
            fields: { TEXT: { name: "TEXT", value } },
        });
        const renderLabel = (main: Block, shadows: Block[] = []): string => renderProject([
            target("Rover", [block("hat", "event_whenflagclicked", { topLevel: true, next: main.id }), main, ...shadows]),
        ], "Rover", "cs").text;

        expect(renderLabel(block("set", "data_setvariableto", {
            inputs: { VALUE: input("VALUE", "value") },
            fields: { VARIABLE: { name: "VARIABLE", value: "health" } },
        }), [number("value", 3)])).toContain("nastav [health] na 3");
        expect(renderLabel(block("change", "data_changevariableby", {
            inputs: { VALUE: input("VALUE", "value") },
            fields: { VARIABLE: { name: "VARIABLE", value: "health" } },
        }), [number("value", 2)])).toContain("změň [health] o 2");
        expect(renderLabel(block("effect-change", "looks_changeeffectby", {
            inputs: { CHANGE: input("CHANGE", "change") },
            fields: { EFFECT: { name: "EFFECT", value: "color" } },
        }), [number("change", 5)])).toContain("změň efekt [color] o 5");
        expect(renderLabel(block("effect-set", "looks_seteffectto", {
            inputs: { VALUE: input("VALUE", "value") },
            fields: { EFFECT: { name: "EFFECT", value: "color" } },
        }), [number("value", 25)])).toContain("nastav efekt [color] na 25");
        expect(renderLabel(block("add", "data_addtolist", {
            inputs: { ITEM: input("ITEM", "item") },
            fields: { LIST: { name: "LIST", value: "inventory" } },
        }), [literal("item", "sword")])).toContain("přidej sword k [inventory]");
        expect(renderLabel(block("insert", "data_insertatlist", {
            inputs: {
                ITEM: input("ITEM", "item"),
                INDEX: input("INDEX", "index"),
            },
            fields: { LIST: { name: "LIST", value: "inventory" } },
        }), [literal("item", "sword"), number("index", 2)])).toContain("vlož sword na 2 v [inventory]");
        expect(renderLabel(block("replace", "data_replaceitemoflist", {
            inputs: {
                ITEM: input("ITEM", "item"),
                INDEX: input("INDEX", "index"),
            },
            fields: { LIST: { name: "LIST", value: "inventory" } },
        }), [literal("item", "sword"), number("index", 2)])).toContain("nahraď 2 v [inventory] hodnotou sword");
        expect(renderLabel(block("of", "sensing_of", {
            inputs: { OBJECT: input("OBJECT", "object") },
            fields: { PROPERTY: { name: "PROPERTY", value: "x position" } },
        }), [literal("object", "Rover")])).toContain("[x position] z Rover");
        expect(renderLabel(block("key", "event_whenkeypressed", {
            fields: { KEY_OPTION: { name: "KEY_OPTION", value: "space" } },
        }))).toContain("po stisku klávesy [space]");
        expect(renderLabel(block("stop", "control_stop"))).toContain("zastav");
        expect(renderLabel(block("glide", "motion_glidesecstoxy", {
            inputs: {
                SECS: input("SECS", "secs"),
                X: input("X", "x"),
                Y: input("Y", "y"),
            },
        }), [number("secs", 1), number("x", 10), number("y", 20)]))
            .toContain("klouzej 1 sekund na x: 10 y: 20");
        expect(renderLabel(block("join", "operator_join", {
            inputs: {
                STRING1: input("STRING1", "one"),
                STRING2: input("STRING2", "two"),
            },
        }), [literal("one", "A"), literal("two", "B")])).toContain("spoj A B");
    });

    it("uses Czech labels for Session renders", () => {
        const session = new Session();
        session.setWorkspace([target("Rover", [
            block("hat", "event_whenflagclicked", { topLevel: true }),
        ])], "Rover");
        expect(session.render()).toContain("po kliknutí");
    });
});
