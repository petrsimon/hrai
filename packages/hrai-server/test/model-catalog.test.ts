import {promisify} from "node:util";
import {afterEach, describe, expect, it, vi} from "vitest";
import type {BackendInfo} from "../src/model-catalog.ts";

const {agentLoginHintMock, execFileMock, isAgentAvailableMock, runAgentMock} = vi.hoisted(() => ({
    execFileMock: vi.fn(),
    isAgentAvailableMock: vi.fn(),
    agentLoginHintMock: vi.fn(),
    runAgentMock: vi.fn(),
}));

// Node's real execFile carries a custom promisify that resolves to {stdout, stderr}. Without it,
// promisify would hand the module a bare string and every model listing would parse as empty.
type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;
Object.defineProperty(execFileMock, promisify.custom, {
    value: (command: string, args: string[], options: object) =>
        new Promise((resolve, reject) => {
            execFileMock(command, args, options, ((error, stdout, stderr) => {
                if (error) reject(error);
                else resolve({stdout, stderr});
            }) satisfies ExecFileCallback);
        }),
});

vi.mock("node:child_process", () => ({
    execFile: execFileMock,
    spawn: vi.fn(),
}));

vi.mock("../src/agent-cli.ts", () => ({
    agentLoginHint: agentLoginHintMock,
    isAgentAvailable: isAgentAvailableMock,
    runAgent: runAgentMock,
}));

let clearBackendCache: (() => void) | undefined;

async function loadCatalog() {
    vi.resetModules();
    const catalog = await import("../src/model-catalog.ts");
    clearBackendCache = catalog.clearBackendCache;
    return catalog;
}

function setCommandOutputs(outputs: Record<string, string | Error>): void {
    execFileMock.mockImplementation((...args: unknown[]) => {
        const command = args[0] as string;
        const callback = args[args.length - 1] as (
            error: Error | null,
            stdout: string,
            stderr: string,
        ) => void;
        const output = outputs[command];
        if (output instanceof Error) {
            callback(output, "", "");
        } else {
            callback(null, output ?? "", "");
        }
    });
}

function stubUnavailableFetch(): void {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("not available"))));
}

function backendWithId(backends: BackendInfo[], id: string): BackendInfo | undefined {
    return backends.find((backend) => backend.id === id);
}

afterEach(() => {
    clearBackendCache?.();
    clearBackendCache = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});

describe("model catalog", () => {
    it("parses the cursor-agent model listing", async () => {
        stubUnavailableFetch();
        setCommandOutputs({
            "cursor-agent": `Available models

auto - Auto (default)
gpt-5.3-codex-low - Codex 5.3 Low
gpt-5.2 - GPT-5.2
cursor-grok-4.6-high-fast - Cursor Grok 4.6 Fast
`,
            pi: new Error("not installed"),
        });
        isAgentAvailableMock.mockResolvedValue(false);

        const {listBackends} = await loadCatalog();
        const backends = await listBackends();

        expect(backendWithId(backends, "cursor")?.models).toEqual([
            "auto",
            "gpt-5.3-codex-low",
            "gpt-5.2",
            "cursor-grok-4.6-high-fast",
        ]);
        expect(backendWithId(backends, "cursor")?.available).toBe(true);
    });

    it("parses the pi model listing", async () => {
        stubUnavailableFetch();
        setCommandOutputs({
            "cursor-agent": new Error("not installed"),
            pi: `provider      model                                               context  max-out  thinking  images
ai-studio     gemini-2.5-flash-lite                               128K     16.4K    yes       yes
local         qwen3:14b                                           128K     16.4K    no        no
openai-codex  gpt-5.6-luna                                        272K     128K     yes       yes
`,
        });
        isAgentAvailableMock.mockResolvedValue(false);

        const {listBackends} = await loadCatalog();
        const backends = await listBackends();

        expect(backendWithId(backends, "pi")?.models).toEqual([
            "ai-studio/gemini-2.5-flash-lite",
            "local/qwen3:14b",
            "openai-codex/gpt-5.6-luna",
        ]);
        expect(backendWithId(backends, "pi")?.available).toBe(true);
    });

    it("parses Ollama and llama.cpp model responses", async () => {
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            if (url.endsWith("/api/tags")) {
                return Promise.resolve(new Response(JSON.stringify({
                    models: [{name: "qwen3:14b"}, {name: "llama3.2:3b"}],
                })));
            }
            return Promise.resolve(new Response(JSON.stringify({
                data: [{id: "Qwen3.5-27B-Q4_K_M.gguf"}],
            })));
        });
        vi.stubGlobal("fetch", fetchMock);
        setCommandOutputs({
            "cursor-agent": new Error("not installed"),
            pi: new Error("not installed"),
        });
        isAgentAvailableMock.mockResolvedValue(false);

        const {listBackends} = await loadCatalog();
        const backends = await listBackends();

        expect(backendWithId(backends, "ollama")?.models).toEqual(["qwen3:14b", "llama3.2:3b"]);
        expect(backendWithId(backends, "ollama")?.available).toBe(true);
        expect(backendWithId(backends, "llama.cpp")?.models).toEqual(["Qwen3.5-27B-Q4_K_M.gguf"]);
        expect(backendWithId(backends, "llama.cpp")?.available).toBe(true);
    });

    it("keeps the other backends available when Ollama is unreachable", async () => {
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
            if (url.endsWith("/api/tags")) return Promise.reject(new Error("connection refused"));
            return Promise.resolve(new Response(JSON.stringify({data: [{id: "local-model"}]})));
        });
        vi.stubGlobal("fetch", fetchMock);
        setCommandOutputs({
            "cursor-agent": "auto - Auto",
            pi: "provider model context\nlocal qwen3:14b 128K",
        });
        isAgentAvailableMock.mockResolvedValue(true);

        const {listBackends} = await loadCatalog();
        const backends = await listBackends();

        expect(backendWithId(backends, "ollama")).toMatchObject({available: false, models: []});
        expect(backendWithId(backends, "llama.cpp")?.available).toBe(true);
        expect(backendWithId(backends, "cursor")?.available).toBe(true);
        expect(backendWithId(backends, "pi")?.available).toBe(true);
        expect(backendWithId(backends, "codex")?.available).toBe(true);
    });

    it("marks a non-zero model-list command as unavailable", async () => {
        stubUnavailableFetch();
        setCommandOutputs({
            "cursor-agent": new Error("cursor-agent exited 1"),
            pi: "provider model context\nlocal qwen3:14b 128K",
        });
        isAgentAvailableMock.mockResolvedValue(false);

        const {listBackends} = await loadCatalog();
        const backends = await listBackends();

        expect(backendWithId(backends, "cursor")).toMatchObject({available: false, models: []});
        expect(backendWithId(backends, "pi")?.available).toBe(true);
    });

    it("uses agent availability for codex and keeps it freeform", async () => {
        stubUnavailableFetch();
        setCommandOutputs({
            "cursor-agent": new Error("not installed"),
            pi: new Error("not installed"),
        });
        isAgentAvailableMock.mockResolvedValue(true);

        const {listBackends} = await loadCatalog();
        const codex = backendWithId(await listBackends(), "codex");

        expect(codex).toMatchObject({available: true, models: [], freeform: true});
        expect(isAgentAvailableMock).toHaveBeenCalledWith("codex");
    });

    it("caches results until cleared", async () => {
        const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({models: []}))));
        vi.stubGlobal("fetch", fetchMock);
        setCommandOutputs({
            "cursor-agent": "",
            pi: "",
        });
        isAgentAvailableMock.mockResolvedValue(false);

        const {listBackends, clearBackendCache: clearCache} = await loadCatalog();
        await listBackends();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(execFileMock).toHaveBeenCalledTimes(2);

        await listBackends();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(execFileMock).toHaveBeenCalledTimes(2);

        clearCache();
        await listBackends();
        expect(fetchMock).toHaveBeenCalledTimes(4);
        expect(execFileMock).toHaveBeenCalledTimes(4);
    });
});
