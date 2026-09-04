import {describe, expect, it} from "vitest";
import {isCompletionClaim} from "../src/server.ts";

describe("isCompletionClaim", () => {
    it.each([
        "hotovo",
        "Mám hotovo!",
        "Už je to hotové.",
        "Udělal jsem to",
        "Ano, mám to hotové",
        "už to mám",
        "Je to hotové!",
        "Jo, hotovo.",
    ])("recognises %j", (text) => {
        expect(isCompletionClaim(text)).toBe(true);
    });

    it.each([
        "ano",
        "Ano, chci aby skákal",
        "mám otázku",
        "Co jsem udělal špatně?",
        "Jak poznám, že je hotovo?",
        "Udělal jsem to špatně",
        "mám to rozbité",
    ])("does not classify %j as a completion claim", (text) => {
        expect(isCompletionClaim(text)).toBe(false);
    });
});
