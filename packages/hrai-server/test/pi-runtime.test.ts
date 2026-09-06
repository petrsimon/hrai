import {afterEach, describe, expect, it} from "vitest";
import {
    authPathFor,
    formatModelRef,
    localProviders,
    OPERATOR,
    parseModelRef,
} from "../src/pi-runtime.ts";

const ENV_KEYS = [
    "HRAI_DATA_DIR", "HRAI_PI_AUTH_PATH", "HRAI_OLLAMA_HOST", "HRAI_OLLAMA_MODELS", "HRAI_LLAMA_HOST", "HRAI_LLAMA_MODELS",
] as const;

afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
});

describe("model references", () => {
    it("splits provider, model and thinking level", () => {
        expect(parseModelRef("openai-codex/gpt-5.6-luna:high")).toEqual({
            provider: "openai-codex", modelId: "gpt-5.6-luna", thinkingLevel: "high",
        });
        expect(parseModelRef("ollama/qwen3:14b")).toEqual({provider: "ollama", modelId: "qwen3:14b"});
        expect(parseModelRef("ollama/qwen3:14b:off")).toEqual({provider: "ollama", modelId: "qwen3:14b", thinkingLevel: "off"});
    });

    it("rejects a reference without a provider", () => {
        expect(parseModelRef("gpt-5.6-luna")).toBeNull();
        expect(parseModelRef("/gpt")).toBeNull();
        expect(parseModelRef("openai/")).toBeNull();
    });

    it("round-trips through formatModelRef", () => {
        for (const ref of ["openai-codex/gpt-5.6-luna:high", "ollama/qwen3:14b"]) {
            const parsed = parseModelRef(ref);
            expect(parsed && formatModelRef(parsed)).toBe(ref);
        }
    });
});

describe("credential paths", () => {
    it("keeps each profile's credentials apart and the operator's configurable", () => {
        process.env.HRAI_DATA_DIR = "/data";
        expect(authPathFor("u1")).toBe("/data/pi/users/u1/auth.json");
        expect(authPathFor(OPERATOR)).toBe("/data/pi/auth.json");
        process.env.HRAI_PI_AUTH_PATH = "/secrets/auth.json";
        expect(authPathFor(OPERATOR)).toBe("/secrets/auth.json");
        expect(authPathFor("u1")).toBe("/data/pi/users/u1/auth.json");
    });
});

describe("local providers", () => {
    it("registers nothing without a host", () => {
        expect(localProviders()).toEqual({});
    });

    it("describes ollama and llama.cpp from the environment", () => {
        process.env.HRAI_OLLAMA_HOST = "http://localhost:11434/";
        process.env.HRAI_OLLAMA_MODELS = "qwen3:14b, gemma4:latest";
        process.env.HRAI_LLAMA_HOST = "http://llama:8080";
        process.env.HRAI_LLAMA_MODELS = "Qwen3.5-27B";
        expect(localProviders()).toEqual({
            ollama: {baseUrl: "http://localhost:11434/v1", apiKey: "ollama", models: ["qwen3:14b", "gemma4:latest"]},
            llama: {baseUrl: "http://llama:8080/v1", apiKey: "none", models: ["Qwen3.5-27B"]},
        });
    });
});
