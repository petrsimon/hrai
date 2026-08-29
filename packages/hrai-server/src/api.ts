import type { IncomingMessage, ServerResponse } from "node:http";
import { listBackends } from "./model-catalog.ts";
import { defaultBackend, EVAL_MODEL } from "./model-client.ts";
import { parseCookies, HraiStore, SESSION_COOKIE, type AuthenticatedUser } from "./store.ts";

const MAX_JSON_BYTES = 32 * 1024 * 1024;
const MAX_ASSET_BYTES = 16 * 1024 * 1024;
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function allowedOrigin(origin: string | undefined): string | null {
    if (!origin) return null;
    const configured = (process.env.HRAI_ALLOWED_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
    if (configured.includes(origin)) return origin;
    try {
        const url = new URL(origin);
        return ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ? origin : null;
    } catch {
        return null;
    }
}

function applyCors(request: IncomingMessage, response: ServerResponse): void {
    const origin = allowedOrigin(request.headers.origin);
    if (!origin) return;
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.setHeader("Vary", "Origin");
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
    const body = JSON.stringify(value);
    response.writeHead(status, JSON_HEADERS);
    response.end(body);
}

function sendText(response: ServerResponse, status: number, body: string, contentType: string): void {
    response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
    response.end(body);
}

function sendBinary(response: ServerResponse, status: number, body: Uint8Array, contentType: string): void {
    response.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
    response.end(body);
}

function sendError(response: ServerResponse, status: number, code: string): void {
    sendJson(response, status, { error: code });
}

async function readBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array);
        size += buffer.byteLength;
        if (size > maxBytes) throw new Error("body_too_large");
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
    const body = await readBody(request, MAX_JSON_BYTES);
    if (!body.length) throw new Error("invalid_json");
    const parsed: unknown = JSON.parse(body.toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("invalid_json");
    return parsed as Record<string, unknown>;
}

function cookieHeader(token: string, request: IncomingMessage): string {
    const secure = process.env.HRAI_COOKIE_SECURE === "true" || request.headers["x-forwarded-proto"] === "https";
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? "; Secure" : ""}`;
}

function clearCookie(request: IncomingMessage): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
        process.env.HRAI_COOKIE_SECURE === "true" || request.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""
    }`;
}

async function authenticatedUser(request: IncomingMessage, store: HraiStore): Promise<AuthenticatedUser | null> {
    return store.userForSession(parseCookies(request.headers.cookie)[SESSION_COOKIE]);
}

function userResponse(user: AuthenticatedUser | null): unknown {
    if (!user) return null;
    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        assistantPreferences: user.assistantPreferences,
    };
}

function projectIdFromPath(pathname: string): string | null {
    const match = /^\/api\/projects\/([^/]+)$/.exec(pathname);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function assetFromPath(pathname: string): { id: string; format: string } | null {
    const match = /^\/api\/assets\/([a-fA-F0-9]{8,128})\.([a-z0-9]+)$/.exec(pathname);
    return match?.[1] && match[2] ? { id: match[1], format: match[2] } : null;
}

/**
 * Handles HRAI-owned identity, project data, assets, and assistant preferences.
 * @param request Incoming HTTP request.
 * @param response HTTP response.
 * @param store Durable HRAI data store.
 */
export async function handleApiRequest(
    request: IncomingMessage,
    response: ServerResponse,
    store: HraiStore,
): Promise<void> {
    applyCors(request, response);
    if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
    }
    const url = new URL(request.url ?? "/", "http://hrai.local");
    if (!url.pathname.startsWith("/api/")) {
        sendError(response, 404, "not_found");
        return;
    }

    try {
        await store.load();
        const user = await authenticatedUser(request, store);

        if (request.method === "POST" && url.pathname === "/api/auth/register") {
            const body = await readJson(request);
            const created = await store.createUser(
                body.username as string,
                body.password as string,
                body.displayName as string | undefined,
            );
            response.setHeader("Set-Cookie", cookieHeader(created.sessionToken, request));
            sendJson(response, 201, userResponse(created));
            return;
        }

        if (request.method === "POST" && url.pathname === "/api/auth/login") {
            const body = await readJson(request);
            const authenticated = await store.authenticate(body.username as string, body.password as string);
            if (!authenticated) {
                sendError(response, 401, "invalid_credentials");
                return;
            }
            response.setHeader("Set-Cookie", cookieHeader(authenticated.sessionToken, request));
            sendJson(response, 200, userResponse(authenticated));
            return;
        }

        if (request.method === "POST" && url.pathname === "/api/auth/logout") {
            await store.logout(parseCookies(request.headers.cookie)[SESSION_COOKIE]);
            response.setHeader("Set-Cookie", clearCookie(request));
            sendJson(response, 200, { ok: true });
            return;
        }

        if (request.method === "GET" && url.pathname === "/api/auth/me") {
            sendJson(response, 200, userResponse(user));
            return;
        }

        if (!user) {
            sendError(response, 401, "authentication_required");
            return;
        }

        if (request.method === "GET" && url.pathname === "/api/models") {
            sendJson(response, 200, {
                default: { backend: defaultBackend(), model: EVAL_MODEL },
                backends: await listBackends(),
            });
            return;
        }

        if (request.method === "GET" && url.pathname === "/api/profile") {
            sendJson(response, 200, userResponse(user));
            return;
        }

        if (request.method === "PUT" && url.pathname === "/api/profile/assistant") {
            const updated = await store.updateAssistantPreferences(user.id, await readJson(request));
            if (!updated) {
                sendError(response, 400, "invalid_assistant_preferences");
                return;
            }
            sendJson(response, 200, updated);
            return;
        }

        if (request.method === "GET" && url.pathname === "/api/projects") {
            sendJson(response, 200, { projects: store.listProjects(user.id) });
            return;
        }

        if (request.method === "POST" && url.pathname === "/api/projects") {
            const body = await readJson(request);
            if (typeof body.state !== "string") {
                sendError(response, 400, "invalid_project");
                return;
            }
            const project = await store.saveProject(user.id, null, body.state, body.title as string | undefined);
            sendJson(response, 201, { id: project.id, title: project.title });
            return;
        }

        const projectId = projectIdFromPath(url.pathname);
        if (projectId && request.method === "GET") {
            const project = store.getProject(user.id, projectId);
            if (!project) {
                sendError(response, 404, "project_not_found");
                return;
            }
            sendText(response, 200, project.state, "application/json; charset=utf-8");
            return;
        }

        if (projectId && request.method === "PUT") {
            const body = await readJson(request);
            if (typeof body.state !== "string") {
                sendError(response, 400, "invalid_project");
                return;
            }
            const project = await store.saveProject(user.id, projectId, body.state, body.title as string | undefined);
            sendJson(response, 200, { id: project.id, title: project.title });
            return;
        }

        if (projectId && request.method === "DELETE") {
            if (!(await store.deleteProject(user.id, projectId))) {
                sendError(response, 404, "project_not_found");
                return;
            }
            response.writeHead(204);
            response.end();
            return;
        }

        const asset = assetFromPath(url.pathname);
        if (asset && request.method === "GET") {
            const data = store.getAsset(user.id, asset.id, asset.format);
            if (!data) {
                sendError(response, 404, "asset_not_found");
                return;
            }
            sendBinary(response, 200, data, "application/octet-stream");
            return;
        }

        if (asset && (request.method === "POST" || request.method === "PUT")) {
            const body = await readBody(request, MAX_ASSET_BYTES);
            await store.saveAsset(user.id, asset.id, asset.format, body);
            sendJson(response, 200, { status: "ok", id: asset.id });
            return;
        }

        sendError(response, 404, "not_found");
    } catch (error: unknown) {
        const code = error instanceof Error ? error.message : "request_failed";
        const status = ["invalid_username", "invalid_password", "invalid_json", "invalid_project", "body_too_large"].includes(code) ? 400 :
            code === "username_taken" ? 409 : code === "project_not_found" ? 404 : 500;
        if (status === 500) console.error("hrai: api request failed", error);
        sendError(response, status, code);
    }
}
