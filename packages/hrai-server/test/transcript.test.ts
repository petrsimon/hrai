import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {publish, recentRuns, resetTranscript, subscribe} from "../src/transcript.ts";

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hrai-transcript-"));
    process.env.HRAI_DATA_DIR = dir;
    resetTranscript();
});

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.HRAI_DATA_DIR;
    delete process.env.HRAI_AGENT_TRACE;
    rmSync(dir, {recursive: true, force: true});
});

describe("transcript", () => {
    it("delivers an owner's events to that owner only, in order", () => {
        const seen: string[] = [];
        const stop = subscribe("u1", (event) => seen.push(`${event.seq}:${event.kind}`));
        publish("u1", {kind: "user", turnId: "t1", text: "Ahoj"});
        publish("u2", {kind: "user", turnId: "t1", text: "Někdo jiný"});
        publish("u1", {kind: "assistant_delta", turnId: "t1", delta: "Čau"});
        stop();
        publish("u1", {kind: "turn_end", turnId: "t1", stopReason: "stop"});

        expect(seen).toEqual(["0:user", "2:assistant_delta"]);
    });

    it("keeps recent runs per owner but not session turns", () => {
        publish("u1", {kind: "run_start", runId: "r1", purpose: "plan", model: "ollama/stub"});
        publish("u1", {kind: "user", turnId: "t1", text: "Ahoj"});
        publish("u1", {kind: "run_end", runId: "r1", text: "done"});
        publish("u2", {kind: "run_start", runId: "r2", purpose: "title", model: "ollama/stub"});

        expect(recentRuns("u1").map((event) => event.kind)).toEqual(["run_start", "run_end"]);
        expect(recentRuns("u2")).toHaveLength(1);
    });

    it("appends every event to the day's log file", () => {
        publish("u1", {kind: "user", turnId: "t1", text: "Ahoj"});
        publish("u1", {kind: "note", text: "something"});

        const files = readdirSync(join(dir, "agent-log"));
        expect(files).toHaveLength(1);
        const lines = readFileSync(join(dir, "agent-log", files[0] ?? ""), "utf8").trim().split("\n");
        expect(lines.map((line) => (JSON.parse(line) as {kind: string}).kind)).toEqual(["user", "note"]);
    });

    it("mirrors readable lines to stderr when tracing, a line at a time", () => {
        process.env.HRAI_AGENT_TRACE = "1";
        const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
        publish("u1", {kind: "run_start", runId: "r1", purpose: "plan", model: "ollama/stub"});
        publish("u1", {kind: "assistant_delta", turnId: "r1:1", runId: "r1", delta: "Prv"});
        publish("u1", {kind: "assistant_delta", turnId: "r1:1", runId: "r1", delta: "ní řádek\ndruhý"});
        publish("u1", {kind: "tool_start", turnId: "t1", callId: "c1", name: "tell_child", args: {text: "x"}});

        const output = write.mock.calls.map(([line]) => String(line)).join("");
        expect(output).toContain("= plan · ollama/stub");
        expect(output).toContain("> První řádek");
        expect(output).not.toContain("druhý");
        expect(output).toContain('+ tell_child {"text":"x"}');
    });

    it("carries on unlogged when the log directory cannot be written", () => {
        // A regular file where the data directory should be makes every mkdir fail.
        writeFileSync(join(dir, "blocker"), "");
        process.env.HRAI_DATA_DIR = join(dir, "blocker", "data");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        expect(() => publish("u1", {kind: "note", text: "one"})).not.toThrow();
        expect(() => publish("u1", {kind: "note", text: "two"})).not.toThrow();
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
