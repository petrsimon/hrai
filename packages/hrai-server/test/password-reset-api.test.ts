import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "../src/api.ts";
import { HraiStore } from "../src/store.ts";

const sent: { to: string; link: string }[] = [];

vi.mock("../src/mailer.ts", () => ({
    mailConfigured: () => true,
    sendPasswordReset: (to: string, _displayName: string, link: string) => {
        sent.push({ to, link });
        return Promise.resolve();
    },
}));

let directory: string;
let server: Server;
let baseUrl: string;

async function api(path: string, body?: unknown, method = "POST"): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

/**
 * Pulls the token out of the most recent reset mail.
 * @returns The token from the emailed link.
 */
function lastToken(): string {
    const link = sent.at(-1)?.link ?? "";
    return new URL(link).searchParams.get("hrai-reset") ?? "";
}

beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "hrai-reset-api-"));
    const store = new HraiStore(directory);
    server = createServer((request, response) => void handleApiRequest(request, response, store));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;

    await api("/api/auth/register", {
        username: "dracek",
        password: "puvodniheslo",
        displayName: "Dráček",
        email: "rodic@example.com",
    });
});

afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
});

describe("password reset over the API", () => {
    it("mails a link when asked by username", async () => {
        const response = await api("/api/auth/forgot", { identifier: "dracek" });

        expect(response.status).toBe(200);
        expect(sent.at(-1)?.to).toBe("rodic@example.com");
        expect(lastToken()).not.toBe("");
    });

    it("accepts the recovery address as the identifier too", async () => {
        await api("/api/auth/forgot", { identifier: "RODIC@example.com " });

        expect(sent.at(-1)?.to).toBe("rodic@example.com");
    });

    it("answers the same for an unknown profile, and mails nobody", async () => {
        const before = sent.length;
        const response = await api("/api/auth/forgot", { identifier: "nikdo" });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(sent).toHaveLength(before);
    });

    it("sets the new password and signs the old sessions out", async () => {
        const signedIn = await api("/api/auth/login", { username: "dracek", password: "puvodniheslo" });
        const oldCookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0] ?? "";

        await api("/api/auth/forgot", { identifier: "dracek" });
        const reset = await api("/api/auth/reset", { token: lastToken(), password: "noveheslo123" });
        expect(reset.status).toBe(200);

        const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: oldCookie } });
        expect(await me.json()).toBeNull();

        const again = await api("/api/auth/login", { username: "dracek", password: "noveheslo123" });
        expect(again.status).toBe(200);
    });

    it("refuses to spend the same token twice", async () => {
        await api("/api/auth/forgot", { identifier: "dracek" });
        const token = lastToken();
        expect((await api("/api/auth/reset", { token, password: "jesteJineHeslo1" })).status).toBe(200);

        const replay = await api("/api/auth/reset", { token, password: "utocnikovoHeslo1" });
        expect(replay.status).toBe(400);
        expect(await replay.json()).toEqual({ error: "invalid_reset_token" });
    });

    it("retires the previous link when a new one is requested", async () => {
        await api("/api/auth/forgot", { identifier: "dracek" });
        const firstToken = lastToken();
        await api("/api/auth/forgot", { identifier: "dracek" });

        const stale = await api("/api/auth/reset", { token: firstToken, password: "dalsiHeslo123" });
        expect(stale.status).toBe(400);
    });

    it("rejects a made-up token", async () => {
        const response = await api("/api/auth/reset", { token: "not-a-real-token", password: "dalsiHeslo123" });
        expect(response.status).toBe(400);
    });

    it("rejects a new password the rules would not accept", async () => {
        await api("/api/auth/forgot", { identifier: "dracek" });
        const response = await api("/api/auth/reset", { token: lastToken(), password: "krátké" });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid_password" });
    });

    it("lets a signed-in profile add a recovery address", async () => {
        const signedIn = await api("/api/auth/login", { username: "dracek", password: "jesteJineHeslo1" });
        const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0] ?? "";

        const updated = await fetch(`${baseUrl}/api/profile/email`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({ email: "Novy@Example.com" }),
        });
        expect(updated.status).toBe(200);
        expect(await updated.json()).toMatchObject({ email: "novy@example.com" });

        const rejected = await fetch(`${baseUrl}/api/profile/email`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({ email: "not an address" }),
        });
        expect(rejected.status).toBe(400);
    });
});
