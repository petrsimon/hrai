import { describe, expect, it } from "vitest";
import { systemPrompt } from "../src/prompt.ts";
import type { AssistantPreferences } from "../src/store.ts";

const preferences: AssistantPreferences = {
    assistantName: "Sova",
    persona: "socratic",
    verbosity: "balanced",
    language: "cs",
    encouragement: false,
};

describe("assistant preferences", () => {
    it("adds bounded profile preferences without replacing tutor rules", () => {
        const prompt = systemPrompt(1, undefined, preferences);
        expect(prompt).toContain("Jsi Sova");
        expect(prompt).toContain("Veď dítě hlavně krátkými otázkami");
        expect(prompt).toContain("Odpovídej česky");
        expect(prompt).toContain("Nikdy nenapíšeš hotové řešení");
    });
});
