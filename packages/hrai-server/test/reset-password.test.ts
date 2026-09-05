import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HraiStore } from "../src/store.ts";

let directory: string;
let store: HraiStore;

beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "hrai-reset-"));
    store = new HraiStore(directory);
    await store.load();
    await store.createUser("dracek", "puvodniheslo", "Dráček");
});

afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

describe("password reset", () => {
    it("replaces the password", async () => {
        expect(await store.resetPassword("dracek", "noveheslo123")).toBe(true);
        expect(await store.authenticate("dracek", "puvodniheslo")).toBeNull();
        expect(await store.authenticate("dracek", "noveheslo123")).not.toBeNull();
    });

    it("signs the profile out everywhere", async () => {
        const signedIn = await store.authenticate("dracek", "puvodniheslo");
        expect(signedIn).not.toBeNull();

        await store.resetPassword("dracek", "noveheslo123");

        expect(await store.userForSession(signedIn?.sessionToken)).toBeNull();
    });

    it("leaves other profiles signed in", async () => {
        await store.createUser("kamarad", "jineheslo1");
        const other = await store.authenticate("kamarad", "jineheslo1");

        await store.resetPassword("dracek", "noveheslo123");

        expect(await store.userForSession(other?.sessionToken)).not.toBeNull();
    });

    it("is case-insensitive about the username, like signing in", async () => {
        expect(await store.resetPassword("Dracek", "noveheslo123")).toBe(true);
    });

    it("reports an unknown profile rather than inventing one", async () => {
        expect(await store.resetPassword("nikdo", "noveheslo123")).toBe(false);
        expect(store.listUsernames()).toEqual(["dracek"]);
    });

    it("refuses a password the sign-in rules would reject", async () => {
        await expect(store.resetPassword("dracek", "krátké")).rejects.toThrow("invalid_password");
        expect(await store.authenticate("dracek", "puvodniheslo")).not.toBeNull();
    });

    it("survives a reload, so the new password outlives a restart", async () => {
        await store.resetPassword("dracek", "noveheslo123");

        const reloaded = new HraiStore(directory);
        await reloaded.load();

        expect(await reloaded.authenticate("dracek", "noveheslo123")).not.toBeNull();
    });
});
