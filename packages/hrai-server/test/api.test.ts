import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "../src/api.ts";
import { HraiStore } from "../src/store.ts";

const catalog = {
    default: "ollama/qwen3:14b",
    providers: [{
        id: "openai-codex",
        name: "OpenAI Codex",
        configured: true,
        subscription: true,
        login: { oauth: true, apiKey: false },
        models: [{ id: "gpt-5.6-luna", name: "GPT-5.6 Luna", reasoning: true }],
    }],
};

vi.mock("../src/model-catalog.ts", () => ({
    listProviders: vi.fn(() => Promise.resolve(catalog)),
}));

vi.mock("../src/pi-runtime.ts", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../src/pi-runtime.ts")>()),
    runtimeFor: vi.fn(() => Promise.resolve({})),
}));

let directory: string;
let server: Server;
let baseUrl: string;
let cookie: string;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
            ...(cookie ? { Cookie: cookie } : {}),
            ...(init.headers ?? {}),
        },
    });
}

beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "hrai-api-"));
    const store = new HraiStore(directory);
    server = createServer((request, response) => void handleApiRequest(request, response, store));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
});

describe("HRAI self-hosted API", () => {
    it("requires authentication to list models", async () => {
        cookie = "";
        const response = await api("/api/models");
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: "authentication_required" });
    });

    it("registers and authenticates a profile with assistant preferences", async () => {
        const response = await api("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "Ada", password: "correct horse", displayName: "Ada" }),
        });
        expect(response.status).toBe(201);
        cookie = response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
        expect(cookie).toMatch(/^hrai_session=/);
        expect(await response.json()).toMatchObject({ username: "ada", displayName: "Ada" });

        const me = await api("/api/auth/me");
        expect(await me.json()).toMatchObject({ username: "ada" });

        const preferences = await api("/api/profile/assistant", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                assistantName: "Sova",
                persona: "socratic",
                verbosity: "balanced",
                language: "cs",
                encouragement: false,
            }),
        });
        expect(preferences.status).toBe(200);
        expect(await preferences.json()).toMatchObject({
            assistantPreferences: {
                assistantName: "Sova",
                persona: "socratic",
                model: "default",
                thinkingLevel: "default",
            },
        });
        const defaultProfile = await api("/api/profile");
        expect(await defaultProfile.json()).toMatchObject({
            assistantPreferences: { model: "default", thinkingLevel: "default" },
        });

        const withModel = await api("/api/profile/assistant", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                assistantName: "Sova",
                persona: "socratic",
                verbosity: "balanced",
                language: "cs",
                encouragement: false,
                model: "openai-codex/gpt-5.6-luna",
                thinkingLevel: "high",
            }),
        });
        expect(withModel.status).toBe(200);
        const profile = await api("/api/profile");
        expect(await profile.json()).toMatchObject({
            assistantPreferences: { model: "openai-codex/gpt-5.6-luna", thinkingLevel: "high" },
        });
    });

    it("lists the profile's providers and models", async () => {
        const response = await api("/api/models");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(catalog);
    });

    it.each([
        ["a model without a provider", { model: "gpt-5.2" }],
        ["a model that starts with a dash", { model: "openai/--dangerously-bypass-approvals-and-sandbox" }],
        ["a model with shell characters", { model: "openai/rm -rf" }],
        ["an unknown thinking level", { model: "default", thinkingLevel: "ultra" }],
    ])("rejects %s", async (_name, fields) => {
        const response = await api("/api/profile/assistant", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                assistantName: "Sova",
                persona: "socratic",
                verbosity: "balanced",
                language: "cs",
                encouragement: false,
                ...fields,
            }),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid_assistant_preferences" });
    });

    it("persists owned projects and rejects unauthenticated access", async () => {
        const state = JSON.stringify({ targets: [], meta: { semver: "3.0.0" } });
        const created = await api("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "First project", state }),
        });
        expect(created.status).toBe(201);
        const project = await created.json() as { id: string };
        expect(project.id).toBe("1");

        const loaded = await api(`/api/projects/${project.id}`);
        expect(loaded.status).toBe(200);
        expect(await loaded.json()).toEqual(JSON.parse(state));

        const list = await api("/api/projects");
        expect(await list.json()).toMatchObject({ projects: [{ id: "1", title: "First project" }] });

        cookie = "";
        const unauthorized = await api(`/api/projects/${project.id}`);
        expect(unauthorized.status).toBe(401);

        const registered = await api("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "Bea", password: "correct horse" }),
        });
        cookie = registered.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
        const otherUser = await api(`/api/projects/${project.id}`);
        expect(otherUser.status).toBe(404);
    });

    it("round-trips private assets as binary data", async () => {
        const login = await api("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "ada", password: "correct horse" }),
        });
        cookie = login.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
        const bytes = new Uint8Array([0, 1, 2, 255]);
        const saved = await api("/api/assets/0123456789abcdef.png", {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.byteLength) },
            body: bytes,
        });
        expect(saved.status).toBe(200);
        const loaded = await api("/api/assets/0123456789abcdef.png");
        expect(new Uint8Array(await loaded.arrayBuffer())).toEqual(bytes);
    });
});

describe("legacy profiles on disk", () => {
    it("fills in preferences that did not exist when the profile was written", async () => {
        const legacyDirectory = await mkdtemp(join(tmpdir(), "hrai-legacy-"));
        const token = "legacy-session-token";
        await writeFile(join(legacyDirectory, "store.json"), JSON.stringify({
            nextProjectId: 1,
            sessions: {
                [createHash("sha256").update(token).digest("hex")]: {
                    userId: "u1",
                    expiresAt: Date.now() + 60_000,
                },
            },
            projects: [],
            assets: {},
            users: [{
                id: "u1",
                username: "kid",
                displayName: "Kid",
                passwordHash: "x",
                createdAt: new Date().toISOString(),
                // Written before the model preferences existed.
                assistantPreferences: {
                    assistantName: "hrai",
                    persona: "patient",
                    verbosity: "concise",
                    language: "cs",
                    encouragement: true,
                },
            }],
        }));

        const legacyStore = new HraiStore(legacyDirectory);
        await legacyStore.load();
        const user = await legacyStore.userForSession(token);

        // resolveModelChoice reads both of these without guarding for a field older profiles lack.
        expect(user?.assistantPreferences.model).toBe("default");
        expect(user?.assistantPreferences.thinkingLevel).toBe("default");
        expect(user?.assistantPreferences.persona).toBe("patient");

        await rm(legacyDirectory, {recursive: true, force: true});
    });

    it("carries a model chosen for pi and drops the other backends", async () => {
        const legacyDirectory = await mkdtemp(join(tmpdir(), "hrai-legacy-"));
        const token = "legacy-session-token";
        const profile = (id: string, modelBackend: string, modelByBackend: Record<string, string>) => ({
            id,
            username: id,
            displayName: id,
            passwordHash: "x",
            createdAt: new Date().toISOString(),
            assistantPreferences: {
                assistantName: "hrai",
                persona: "patient",
                verbosity: "concise",
                language: "cs",
                encouragement: true,
                modelBackend,
                modelByBackend,
            },
        });
        await writeFile(join(legacyDirectory, "store.json"), JSON.stringify({
            nextProjectId: 1,
            sessions: {
                [createHash("sha256").update(token).digest("hex")]: { userId: "pi-kid", expiresAt: Date.now() + 60_000 },
                [createHash("sha256").update(`${token}2`).digest("hex")]: { userId: "cursor-kid", expiresAt: Date.now() + 60_000 },
            },
            projects: [],
            assets: {},
            users: [
                profile("pi-kid", "pi", { pi: "openai-codex/gpt-5.4", cursor: "gpt-5.2" }),
                profile("cursor-kid", "cursor", { pi: "openai-codex/gpt-5.4", cursor: "gpt-5.2" }),
            ],
        }));

        const legacyStore = new HraiStore(legacyDirectory);
        await legacyStore.load();
        const piKid = await legacyStore.userForSession(token);
        const cursorKid = await legacyStore.userForSession(`${token}2`);

        expect(piKid?.assistantPreferences).toMatchObject({ model: "openai-codex/gpt-5.4", thinkingLevel: "default" });
        expect(cursorKid?.assistantPreferences).toMatchObject({ model: "default" });
        expect(piKid?.assistantPreferences).not.toHaveProperty("modelBackend");

        await rm(legacyDirectory, {recursive: true, force: true});
    });
});
