import { createHash, randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import type { BackendId } from "./model-client.ts";

const scrypt = promisify(nodeScrypt);

export const SESSION_COOKIE = "hrai_session";
const PASSWORD_HASH_BYTES = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

export type AssistantPersona = "patient" | "socratic" | "coach";
export type AssistantVerbosity = "concise" | "balanced" | "detailed";

export interface AssistantPreferences {
    assistantName: string;
    persona: AssistantPersona;
    verbosity: AssistantVerbosity;
    language: "cs";
    encouragement: boolean;
    modelBackend: BackendId | "default";
    modelName: string;
}

export const DEFAULT_ASSISTANT_PREFERENCES: AssistantPreferences = {
    assistantName: "hrai",
    persona: "patient",
    verbosity: "concise",
    language: "cs",
    encouragement: true,
    modelBackend: "default",
    modelName: "",
};

interface UserRecord {
    id: string;
    username: string;
    displayName: string;
    passwordHash: string;
    assistantPreferences: AssistantPreferences;
    createdAt: string;
}

interface SessionRecord {
    userId: string;
    expiresAt: number;
}

export interface ProjectRecord {
    id: string;
    ownerId: string;
    title: string;
    state: string;
    createdAt: string;
    updatedAt: string;
}

interface AssetRecord {
    ownerId: string;
    format: string;
    data: string;
}

interface StoreData {
    nextProjectId: number;
    users: UserRecord[];
    sessions: Record<string, SessionRecord>;
    projects: ProjectRecord[];
    assets: Record<string, AssetRecord>;
}

export interface PublicUser {
    id: string;
    username: string;
    displayName: string;
    assistantPreferences: AssistantPreferences;
}

export interface AuthenticatedUser extends PublicUser {
    sessionToken: string;
}

function emptyData(): StoreData {
    return { nextProjectId: 1, users: [], sessions: {}, projects: [], assets: {} };
}

function now(): string {
    return new Date().toISOString();
}

function sessionKey(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

function publicUser(user: UserRecord): PublicUser {
    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        assistantPreferences: { ...user.assistantPreferences },
    };
}

function projectSummary(project: ProjectRecord) {
    return {
        id: project.id,
        title: project.title,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
    };
}

export function validateUsername(username: unknown): string | null {
    if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) return null;
    return username.toLowerCase();
}

export function validatePassword(password: unknown): string | null {
    if (typeof password !== "string" || password.length < 8 || password.length > 128) return null;
    return password;
}

export function sanitizeAssistantPreferences(input: unknown): AssistantPreferences | null {
    if (typeof input !== "object" || input === null) return null;
    const value = input as Record<string, unknown>;
    const assistantName = typeof value.assistantName === "string" ? value.assistantName.trim() : "";
    const persona = value.persona;
    const verbosity = value.verbosity;
    const language = value.language;
    const encouragement = value.encouragement;
    const modelBackend = value.modelBackend === undefined ? DEFAULT_ASSISTANT_PREFERENCES.modelBackend : value.modelBackend;
    const modelName = value.modelName === undefined ? DEFAULT_ASSISTANT_PREFERENCES.modelName : value.modelName;
    const knownBackends: BackendId[] = ["ollama", "llama.cpp", "cursor", "pi", "codex"];
    // These model fields cross security boundaries into backend and CLI selection.
    const validModelName = modelName === "" ||
        (typeof modelName === "string" &&
            modelName.length <= 100 &&
            !modelName.startsWith("-") &&
            /^[A-Za-z0-9._:/+-]+$/.test(modelName));
    if (
        assistantName.length < 1 ||
        assistantName.length > 40 ||
        [...assistantName].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
        !["patient", "socratic", "coach"].includes(persona as string) ||
        !["concise", "balanced", "detailed"].includes(verbosity as string) ||
        language !== "cs" ||
        typeof encouragement !== "boolean" ||
        (modelBackend !== "default" && !knownBackends.includes(modelBackend as BackendId)) ||
        !validModelName
    ) return null;
    return {
        assistantName,
        persona: persona as AssistantPersona,
        verbosity: verbosity as AssistantVerbosity,
        language: "cs",
        encouragement,
        modelBackend: modelBackend as BackendId | "default",
        modelName,
    };
}

export function parseCookies(header: string | undefined): Record<string, string> {
    if (!header) return {};
    return Object.fromEntries(header.split(";").flatMap(part => {
        const separator = part.indexOf("=");
        if (separator < 0) return [];
        return [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]];
    }));
}

export class HraiStore {
    private data: StoreData = emptyData();
    private loaded = false;
    private writeQueue: Promise<void> = Promise.resolve();
    private readonly filePath: string;

    constructor(dataDirectory = process.env.HRAI_DATA_DIR ?? ".hrai-data") {
        this.filePath = join(dataDirectory, "store.json");
    }

    async load(): Promise<void> {
        if (this.loaded) return;
        try {
            const raw = await readFile(this.filePath, "utf8");
            this.data = JSON.parse(raw) as StoreData;
        } catch (error: unknown) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
            this.data = emptyData();
        }
        this.loaded = true;
    }

    private async persist(): Promise<void> {
        const snapshot = JSON.stringify(this.data, null, 2);
        const directory = dirname(this.filePath);
        this.writeQueue = this.writeQueue.then(async () => {
            await mkdir(directory, { recursive: true });
            const temporaryPath = `${this.filePath}.tmp`;
            await writeFile(temporaryPath, snapshot, "utf8");
            await rename(temporaryPath, this.filePath);
        });
        return this.writeQueue;
    }

    private requireLoaded(): void {
        if (!this.loaded) throw new Error("HraiStore.load() must complete before use");
    }

    async createUser(username: string, password: string, displayName?: string): Promise<AuthenticatedUser> {
        this.requireLoaded();
        const normalizedUsername = validateUsername(username);
        if (!normalizedUsername) throw new Error("invalid_username");
        if (!validatePassword(password)) throw new Error("invalid_password");
        const passwordHash = await this.hashPassword(password);
        if (this.data.users.some(user => user.username === normalizedUsername)) throw new Error("username_taken");
        const user: UserRecord = {
            id: `u${randomBytes(12).toString("hex")}`,
            username: normalizedUsername,
            displayName: typeof displayName === "string" && displayName.trim() ? displayName.trim().slice(0, 80) : normalizedUsername,
            passwordHash,
            assistantPreferences: { ...DEFAULT_ASSISTANT_PREFERENCES },
            createdAt: now(),
        };
        this.data.users.push(user);
        const sessionToken = this.createSession(user.id);
        await this.persist();
        return { ...publicUser(user), sessionToken };
    }

    async authenticate(username: string, password: string): Promise<AuthenticatedUser | null> {
        this.requireLoaded();
        const normalizedUsername = validateUsername(username);
        if (!normalizedUsername || !validatePassword(password)) return null;
        const user = this.data.users.find(candidate => candidate.username === normalizedUsername);
        if (!user || !(await this.verifyPassword(password, user.passwordHash))) return null;
        const sessionToken = this.createSession(user.id);
        await this.persist();
        return { ...publicUser(user), sessionToken };
    }

    private createSession(userId: string): string {
        const token = randomBytes(32).toString("base64url");
        this.data.sessions[sessionKey(token)] = { userId, expiresAt: Date.now() + SESSION_TTL_MS };
        return token;
    }

    async userForSession(token: string | undefined): Promise<AuthenticatedUser | null> {
        this.requireLoaded();
        if (!token) return null;
        const session = this.data.sessions[sessionKey(token)];
        if (!session) return null;
        if (session.expiresAt <= Date.now()) {
            delete this.data.sessions[sessionKey(token)];
            await this.persist();
            return null;
        }
        const user = this.data.users.find(candidate => candidate.id === session.userId);
        return user ? { ...publicUser(user), sessionToken: token } : null;
    }

    async logout(token: string | undefined): Promise<void> {
        this.requireLoaded();
        if (token && this.data.sessions[sessionKey(token)]) {
            delete this.data.sessions[sessionKey(token)];
            await this.persist();
        }
    }

    async updateAssistantPreferences(userId: string, input: unknown): Promise<PublicUser | null> {
        this.requireLoaded();
        const preferences = sanitizeAssistantPreferences(input);
        if (!preferences) return null;
        const user = this.data.users.find(candidate => candidate.id === userId);
        if (!user) return null;
        user.assistantPreferences = preferences;
        await this.persist();
        return publicUser(user);
    }

    listProjects(userId: string): ReturnType<typeof projectSummary>[] {
        this.requireLoaded();
        return this.data.projects
            .filter(project => project.ownerId === userId)
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .map(projectSummary);
    }

    getProject(userId: string, id: string): ProjectRecord | null {
        this.requireLoaded();
        const project = this.data.projects.find(candidate => candidate.id === id && candidate.ownerId === userId);
        return project ? { ...project } : null;
    }

    async saveProject(userId: string, id: string | null, state: string, title?: string): Promise<ProjectRecord> {
        this.requireLoaded();
        const parsedState: unknown = JSON.parse(state);
        if (typeof parsedState !== "object" || parsedState === null || Array.isArray(parsedState)) {
            throw new Error("invalid_project");
        }
        const cleanTitle = typeof title === "string" && title.trim() ? title.trim().slice(0, 120) : "Untitled";
        const timestamp = now();
        if (id) {
            const project = this.data.projects.find(candidate => candidate.id === id && candidate.ownerId === userId);
            if (!project) throw new Error("project_not_found");
            project.state = state;
            project.title = cleanTitle === "Untitled" ? project.title : cleanTitle;
            project.updatedAt = timestamp;
            await this.persist();
            return { ...project };
        }
        const project: ProjectRecord = {
            id: String(this.data.nextProjectId++),
            ownerId: userId,
            title: cleanTitle,
            state,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        this.data.projects.push(project);
        await this.persist();
        return { ...project };
    }

    async deleteProject(userId: string, id: string): Promise<boolean> {
        this.requireLoaded();
        const index = this.data.projects.findIndex(project => project.id === id && project.ownerId === userId);
        if (index < 0) return false;
        this.data.projects.splice(index, 1);
        await this.persist();
        return true;
    }

    async saveAsset(userId: string, assetId: string, format: string, data: Uint8Array): Promise<void> {
        this.requireLoaded();
        this.data.assets[`${userId}:${assetId}.${format}`] = {
            ownerId: userId,
            format,
            data: Buffer.from(data).toString("base64"),
        };
        await this.persist();
    }

    getAsset(userId: string, assetId: string, format: string): Uint8Array | null {
        this.requireLoaded();
        const asset = this.data.assets[`${userId}:${assetId}.${format}`];
        return asset ? Uint8Array.from(Buffer.from(asset.data, "base64")) : null;
    }

    private async hashPassword(password: string): Promise<string> {
        const salt = randomBytes(16);
        const derived = (await scrypt(password, salt, PASSWORD_HASH_BYTES)) as Buffer;
        return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
    }

    private async verifyPassword(password: string, encoded: string): Promise<boolean> {
        const [, saltText, hashText] = encoded.split("$");
        if (!saltText || !hashText) return false;
        const expected = Buffer.from(hashText, "base64url");
        const actual = (await scrypt(password, Buffer.from(saltText, "base64url"), expected.length)) as Buffer;
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    }
}
