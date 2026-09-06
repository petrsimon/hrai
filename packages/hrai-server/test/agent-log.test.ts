import {mkdtempSync, readFileSync, readdirSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";

import {onAgentLog, recentAgentLog, resetAgentLog, startAgentRun} from "../src/agent-log.ts";

const ENV_KEYS = ["HRAI_DATA_DIR", "HRAI_AGENT_TRACE"] as const;

function useDataDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "hrai-log-"));
    process.env.HRAI_DATA_DIR = dir;
    return dir;
}

function readLog(dir: string): Record<string, unknown>[] {
    const logDir = join(dir, "agent-log");
    const files = readdirSync(logDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/);
    return readFileSync(join(logDir, files[0] as string), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
}

afterEach(() => {
    resetAgentLog();
    for (const key of ENV_KEYS) delete process.env[key];
    vi.restoreAllMocks();
});

describe("agent log", () => {
    it("writes every event of a run to the day's file without being asked", () => {
        const dir = useDataDir();
        const run = startAgentRun("pi", "model=gpt-5.4 prompt=42 chars");
        run.event("phase", "message_start");
        run.event("delta", "Blue");
        run.event("stderr", "pi: warming up");
        run.event("end", "exit 0 after 2.9s, 4 chars");

        const entries = readLog(dir);
        expect(entries.map((entry) => entry.kind)).toEqual(["start", "phase", "delta", "stderr", "end"]);
        expect(entries.map((entry) => entry.seq)).toEqual([0, 1, 2, 3, 4]);
        expect(entries[0]).toMatchObject({command: "pi", text: "model=gpt-5.4 prompt=42 chars"});
        expect(new Set(entries.map((entry) => entry.runId)).size).toBe(1);
        expect(entries[4]).toMatchObject({text: "exit 0 after 2.9s, 4 chars"});
    });

    it("gives each run its own id", () => {
        useDataDir();
        const first = startAgentRun("pi", "one");
        const second = startAgentRun("codex", "two");
        expect(first.runId).not.toBe(second.runId);
        expect(first.runId).toMatch(/^[0-9a-f]{8}$/);
    });

    it("delivers events to listeners and buffers them for a late tab", () => {
        useDataDir();
        const seen: string[] = [];
        const stop = onAgentLog((event) => seen.push(`${event.kind}:${event.text}`));

        const run = startAgentRun("pi", "start line");
        run.event("delta", "Blue");
        stop();
        run.event("end", "exit 0");

        expect(seen).toEqual(["start:start line", "delta:Blue"]);
        expect(recentAgentLog().map((event) => event.kind)).toEqual(["start", "delta", "end"]);
    });

    it("mirrors to stderr only when HRAI_AGENT_TRACE asks", () => {
        useDataDir();
        const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);

        startAgentRun("pi", "quiet run");
        expect(write).not.toHaveBeenCalled();

        process.env.HRAI_AGENT_TRACE = "1";
        startAgentRun("pi", "watched run");
        expect(write).toHaveBeenCalledWith(expect.stringMatching(/\[hrai agent pi [0-9a-f]{8}] = watched run\n/));
    });

    it("keeps the run going when the log file cannot be written", () => {
        // A plain file as the data directory: mkdir fails with ENOTDIR on the first write.
        const blocked = join(mkdtempSync(join(tmpdir(), "hrai-log-")), "not-a-directory");
        writeFileSync(blocked, "");
        process.env.HRAI_DATA_DIR = blocked;
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        const run = startAgentRun("pi", "start line");
        run.event("delta", "Blue");

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain("agent log to");
        expect(recentAgentLog()).toHaveLength(2);
    });
});
