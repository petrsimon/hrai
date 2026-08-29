import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "../src/api.ts";
import { defaultBackend, EVAL_MODEL } from "../src/model-client.ts";
import { HraiStore } from "../src/store.ts";

vi.mock("../src/model-catalog.ts", () => ({
    listBackends: vi.fn(() => Promise.resolve([{
        id: "cursor",
        label: "Cursor",
        available: true,
        freeform: false,
        models: ["gpt-5.2"],
    }])),
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
                modelBackend: "default",
                modelName: "",
            },
        });
        const defaultProfile = await api("/api/profile");
        expect(await defaultProfile.json()).toMatchObject({
            assistantPreferences: { modelBackend: "default", modelName: "" },
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
                modelBackend: "cursor",
                modelName: "gpt-5.2",
            }),
        });
        expect(withModel.status).toBe(200);
        const profile = await api("/api/profile");
        expect(await profile.json()).toMatchObject({
            assistantPreferences: { modelBackend: "cursor", modelName: "gpt-5.2" },
        });
    });

    it("lists the configured default and available model backends", async () => {
        const response = await api("/api/models");
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            default: { backend: defaultBackend(), model: EVAL_MODEL },
            backends: [{
                id: "cursor",
                label: "Cursor",
                available: true,
                freeform: false,
                models: ["gpt-5.2"],
            }],
        });
    });

    it("rejects unknown model backends", async () => {
        const response = await api("/api/profile/assistant", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                assistantName: "Sova",
                persona: "socratic",
                verbosity: "balanced",
                language: "cs",
                encouragement: false,
                modelBackend: "rm -rf",
                modelName: "gpt-5.2",
            }),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid_assistant_preferences" });
    });

    it("rejects model names that start with a dash", async () => {
        const response = await api("/api/profile/assistant", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                assistantName: "Sova",
                persona: "socratic",
                verbosity: "balanced",
                language: "cs",
                encouragement: false,
                modelBackend: "cursor",
                modelName: "--dangerously-bypass-approvals-and-sandbox",
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
