import {describe, expect, it} from "vitest";
import {
    parseProjectTitle,
    projectTitlePrompt,
    suggestProjectTitle,
} from "../src/project-title.ts";

const reply = (text: string) => Promise.resolve({text, seconds: 0});

describe("project title parsing", () => {
    it("keeps a bare title unchanged", () => {
        expect(parseProjectTitle("Dračí bludiště")).toBe("Dračí bludiště");
    });

    it("strips quotes, list markers and a trailing period", () => {
        expect(parseProjectTitle('- "Závod autíček."')).toBe("Závod autíček");
        expect(parseProjectTitle("„Skákající kočka“")).toBe("Skákající kočka");
    });

    it("takes the first line when the model keeps talking", () => {
        expect(parseProjectTitle("Honička s duchy\n\nDoufám, že se ti název líbí!"))
            .toBe("Honička s duchy");
    });

    it("drops a reasoning block", () => {
        expect(parseProjectTitle("<think>the project is about a maze</think>\nBludiště"))
            .toBe("Bludiště");
    });

    it("caps the length the store accepts", () => {
        expect(parseProjectTitle("a".repeat(200))).toHaveLength(60);
    });

    it("refuses an empty answer rather than naming a project nothing", () => {
        expect(() => parseProjectTitle("   \n  ")).toThrow(/no project title/);
    });
});

describe("project title prompt", () => {
    it("fences the project data away from the instruction", () => {
        const prompt = projectTitlePrompt("když kliknete na zelenou vlajku");
        expect(prompt).toContain("<projekt>");
        expect(prompt).toContain("</projekt>");
        expect(prompt.indexOf("<projekt>")).toBeLessThan(prompt.indexOf("když kliknete"));
    });
});

describe("suggestProjectTitle", () => {
    it("sends the workspace and returns the cleaned title", async () => {
        let seenUser = "";
        const title = await suggestProjectTitle("kočka se pohybuje", (_system, user) => {
            seenUser = user;
            return reply('"Kočičí procházka"');
        });
        expect(seenUser).toContain("kočka se pohybuje");
        expect(title).toBe("Kočičí procházka");
    });
});
