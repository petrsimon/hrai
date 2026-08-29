import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {isAgentAvailable} from "./agent-cli.ts";
import {hostFor, type BackendId} from "./model-client.ts";

const execFileAsync = promisify(execFile);
const HTTP_TIMEOUT_MS = 5_000;
const CLI_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60_000;

export interface BackendInfo {
    id: BackendId;
    label: string;
    available: boolean;
    models: string[];
    freeform: boolean;
}

interface OllamaTagsResponse {
    models?: {name?: string}[];
}

interface OpenAIModelsResponse {
    data?: {id?: string}[];
}

const backendLabels: Record<BackendId, string> = {
    ollama: "Ollama",
    "llama.cpp": "llama.cpp",
    cursor: "Cursor",
    pi: "pi",
    codex: "Codex",
};

const cache = new Map<BackendId, {at: number; value: BackendInfo}>();

function ollamaModels(body: OllamaTagsResponse): string[] {
    return (body.models ?? []).flatMap((entry) => entry.name === undefined ? [] : [entry.name]);
}

function llamaModels(body: OpenAIModelsResponse): string[] {
    return (body.data ?? []).flatMap((entry) => entry.id === undefined ? [] : [entry.id]);
}

async function probeHttpBackend(backend: "ollama" | "llama.cpp"): Promise<BackendInfo> {
    try {
        const host = hostFor(backend);
        const path = backend === "ollama" ? "/api/tags" : "/v1/models";
        const response = await fetch(`${host}${path}`, {
            method: "GET",
            signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        });
        if (!response.ok) {
            return {id: backend, label: backendLabels[backend], available: false, models: [], freeform: false};
        }

        const body = (await response.json()) as OllamaTagsResponse | OpenAIModelsResponse;
        const models = backend === "ollama"
            ? ollamaModels(body as OllamaTagsResponse)
            : llamaModels(body as OpenAIModelsResponse);
        return {id: backend, label: backendLabels[backend], available: true, models, freeform: false};
    } catch {
        return {id: backend, label: backendLabels[backend], available: false, models: [], freeform: false};
    }
}

function cursorModels(stdout: string): string[] {
    return stdout.split(/\r?\n/).flatMap((line) => {
        const trimmed = line.trim();
        const match = /^(.+?) - .+$/.exec(trimmed);
        if (match === null) return [];
        const id = match[1]?.trim();
        return id ? [id] : [];
    });
}

function piModels(stdout: string): string[] {
    return stdout.split(/\r?\n/).flatMap((line) => {
        const columns = line.trim().split(/\s+/);
        if (columns.length < 2 || columns[0] === "provider") return [];
        const provider = columns[0];
        const model = columns[1];
        return provider !== undefined && model !== undefined ? [`${provider}/${model}`] : [];
    });
}

async function probeListCommand(
    backend: "cursor" | "pi",
    command: string,
    parse: (stdout: string) => string[],
): Promise<BackendInfo> {
    try {
        const {stdout} = await execFileAsync(command, ["--list-models"], {timeout: CLI_TIMEOUT_MS});
        return {id: backend, label: backendLabels[backend], available: true, models: parse(stdout), freeform: false};
    } catch {
        return {id: backend, label: backendLabels[backend], available: false, models: [], freeform: false};
    }
}

async function probeCodex(): Promise<BackendInfo> {
    let available = false;
    try {
        available = await isAgentAvailable("codex");
    } catch {
        available = false;
    }
    return {id: "codex", label: backendLabels.codex, available, models: [], freeform: true};
}

async function probeBackend(backend: BackendId): Promise<BackendInfo> {
    switch (backend) {
        case "ollama":
        case "llama.cpp":
            return probeHttpBackend(backend);
        case "cursor":
            return probeListCommand("cursor", "cursor-agent", cursorModels);
        case "pi":
            return probeListCommand("pi", "pi", piModels);
        case "codex":
            return probeCodex();
    }
}

async function cachedBackend(backend: BackendId): Promise<BackendInfo> {
    const now = Date.now();
    const cached = cache.get(backend);
    if (cached !== undefined && now - cached.at < CACHE_TTL_MS) return cached.value;

    const value = await probeBackend(backend);
    cache.set(backend, {at: Date.now(), value});
    return value;
}

export async function listBackends(): Promise<BackendInfo[]> {
    const backends: BackendId[] = ["ollama", "llama.cpp", "cursor", "pi", "codex"];
    return Promise.all(backends.map((backend) => cachedBackend(backend).catch(() => ({
        id: backend,
        label: backendLabels[backend],
        available: false,
        models: [],
        freeform: backend === "codex",
    }))));
}

/**
 * Clears the backend catalog cache. Used only by tests.
 */
export function clearBackendCache(): void {
    cache.clear();
}
