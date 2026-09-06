import {describe, expect, it} from "vitest";
import type {ToolDefinition} from "@earendil-works/pi-coding-agent";
import {Session} from "../src/session.ts";
import {createTutorTools, type ToolTurn} from "../src/tutor-tools.ts";

/** A sprite with one script, so the render has aliases b1 and b2. */
const WORKSPACE = [{
    id: "cat",
    name: "Kočka",
    isStage: false,
    blocks: {
        h: {id: "h", opcode: "event_whenflagclicked", next: "m", parent: null, inputs: {}, fields: {}, topLevel: true},
        m: {id: "m", opcode: "motion_movesteps", next: null, parent: "h", inputs: {}, fields: {}},
    },
}];

function setup(rung: number): {turn: ToolTurn; tool: (name: string) => ToolDefinition} {
    const session = new Session();
    session.setWorkspace(WORKSPACE, "cat");
    session.render();
    const turn: ToolTurn = {session, rung, delivered: null};
    const tools = createTutorTools(() => turn);
    return {
        turn,
        tool: (name) => {
            const found = tools.find((candidate) => candidate.name === name);
            if (!found) throw new Error(`no tool ${name}`);
            return found;
        },
    };
}

async function run(tool: ToolDefinition, params: object): Promise<string> {
    const result = await tool.execute("call", params, undefined, undefined, {} as never);
    return result.content.map((part) => ("text" in part ? part.text : "")).join("");
}

describe("tell_child", () => {
    it("delivers a policed message and records it for the turn", async () => {
        const {turn, tool} = setup(4);
        await expect(run(tool("tell_child"), {
            text: "Podívej se na b1. Přidej pod něj motion_movesteps z kategorie Pohyb. A ještě něco třetího.",
            blocks: ["motion_movesteps", "motion_movesteps"],
        })).resolves.toBe("Doručeno.");
        expect(turn.delivered).toEqual({
            text: "Podívej se na b1. Přidej pod něj motion_movesteps z kategorie Pohyb.",
            blocks: ["motion_movesteps"],
        });
    });

    it("adds the Socratic question at rung 1 without a goal", async () => {
        const {turn, tool} = setup(1);
        await run(tool("tell_child"), {text: "Kočka se hýbe jen jednou."});
        expect(turn.delivered?.text).toMatch(/^Kočka se hýbe jen jednou\. .+\?$/);
    });

    it.each([
        ["an empty text", 1, {text: "  "}, /prázdný/],
        ["a second delivery", 1, {text: "Znovu."}, /jen jednou/],
        ["an opcode the palette lacks", 4, {text: "Použij blok.", blocks: ["motion_fly"]}, /motion_fly/],
        ["a block named below rung 3", 2, {text: "Použij blok.", blocks: ["motion_movesteps"]}, /úrovni nápovědy 2/],
        ["an alias the project lacks", 3, {text: "Podívej se na b9."}, /b9/],
    ])("refuses %s so the model tries again", async (_name, rung, params, reason) => {
        const {turn, tool} = setup(rung);
        if (_name === "a second delivery") turn.delivered = {text: "První.", blocks: []};
        await expect(run(tool("tell_child"), params)).rejects.toThrow(reason);
        if (_name !== "a second delivery") expect(turn.delivered).toBeNull();
    });
});

describe("read_project and step_status", () => {
    it("render the project and report a free-play session", async () => {
        const {tool} = setup(1);
        await expect(run(tool("read_project"), {})).resolves.toContain("b1");
        await expect(run(tool("step_status"), {})).resolves.toMatch(/Žádný krok/);
    });

    it("describes the active lesson step at the current rung", async () => {
        const {turn, tool} = setup(1);
        expect(turn.session.startLesson("11-soldier-battle")).not.toBeNull();
        const gentle = await run(tool("step_status"), {});
        expect(gentle).toContain("KROK:");
        expect(gentle).not.toContain("TEĎ MÁ UDĚLAT");
        turn.rung = 4;
        expect(await run(tool("step_status"), {})).toContain("TEĎ MÁ UDĚLAT");
    });
});

describe("palette", () => {
    it("is gated by rung", async () => {
        const {turn, tool} = setup(2);
        await expect(run(tool("palette"), {})).rejects.toThrow(/úrovni nápovědy 2/);
        turn.rung = 3;
        const categories = await run(tool("palette"), {});
        expect(categories).toContain("BARVY KATEGORIÍ");
        expect(categories).not.toContain("motion_movesteps");
        turn.rung = 4;
        expect(await run(tool("palette"), {query: "movesteps"})).toContain("motion_movesteps");
        expect(await run(tool("palette"), {category: "Pohyb"})).toContain("motion_movesteps");
        expect(await run(tool("palette"), {category: "Pohyb"})).not.toContain("event_whenflagclicked");
        expect(await run(tool("palette"), {query: "nothing-like-this"})).toMatch(/Nic neodpovídá/);
    });
});
