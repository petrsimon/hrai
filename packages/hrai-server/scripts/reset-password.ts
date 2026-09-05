/**
 * Resets a profile's password from the machine that holds the data.
 *
 * There is no email on this server and no account recovery, so an adult with shell access
 * is the recovery path. The store is a file the running server keeps in memory, so a reset
 * only takes effect once that server reloads it — the script says so rather than letting
 * the next save quietly overwrite the change.
 *
 * Usage:
 *   npm run reset-password --workspace=packages/hrai-server -- <username> [password]
 *   npm run reset-password --workspace=packages/hrai-server -- --list
 */
import { randomBytes } from "node:crypto";
import { HraiStore } from "../src/store.ts";

const MIN_PASSWORD_LENGTH = 8;
/** Ambiguous characters are left out: this gets read aloud and typed by a child. */
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * Invents a password that is easy to dictate and still not guessable.
 * @returns A twelve-character password.
 */
function generatePassword(): string {
    return [...randomBytes(12)].map(byte => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join("");
}

/**
 * Entry point.
 * @returns Process exit code.
 */
async function main(): Promise<number> {
    const [username, password] = process.argv.slice(2);
    const store = new HraiStore();
    await store.load();

    if (!username || username === "--help") {
        console.log("usage: reset-password <username> [password]");
        console.log("       reset-password --list");
        return username ? 0 : 1;
    }

    const usernames = store.listUsernames();
    if (username === "--list") {
        console.log(usernames.length ? usernames.join("\n") : "(no profiles on this server)");
        return 0;
    }

    const newPassword = password ?? generatePassword();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
        console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        return 1;
    }

    if (!(await store.resetPassword(username, newPassword))) {
        console.error(`No profile named "${username}".`);
        console.error(usernames.length ?
            `Profiles on this server: ${usernames.join(", ")}` :
            "This server has no profiles yet; create one in the editor.");
        return 1;
    }

    console.log(`Password for "${username}" is now: ${newPassword}`);
    console.log("Every device signed in as that profile has been signed out.");
    console.log("Restart the hrai server so it reloads the store, or its next save will undo this.");
    return 0;
}

process.exitCode = await main();
