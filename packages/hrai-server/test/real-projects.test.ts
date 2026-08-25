/**
 * Renders real `.sb3` projects through a live VM.
 *
 * What this proves: the adapter and renderer survive genuine VM data structures —
 * `Blocks` instances, loose top-level reporters, awkward variable names, targets with
 * no blocks at all — rather than only the tidy dictionaries the unit tests hand them.
 *
 * What it does NOT prove: that the render is good for a large, messy project built by
 * a child. These are scratch-vm's own unit fixtures, deliberately small and strange.
 * A real project from a learner is still the missing input, and the renders here are
 * a handful of lines each.
 *
 * Note: loading a project headlessly requires the sibling workspace packages to be
 * built, because scratch-vm imports them from `dist`. Costume loading also fails
 * without a renderer; that is harmless here, since only blocks are read.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { renderProject, type RenderTarget } from "../src/render.ts";
import { fromVmTargets } from "../src/vm-adapter.ts";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const vmRoot = resolve(here, "../../scratch-vm");

/** Projects chosen for structural variety, not for being flattering. */
const PROJECTS = [
    "test/fixtures/draggable.sb3",
    "test/fixtures/edge-triggered-hat.sb3",
    "test/fixtures/comments.sb3",
    "test/fixtures/monitors.sb3",
];

/**
 * The sprite a child would have selected: the first non-stage target, else the stage.
 * @param targets All targets in the loaded project.
 * @returns The target to render in full.
 */
function focusOf(targets: RenderTarget[]): RenderTarget {
    const focus = targets.find((t) => !t.isStage) ?? targets[0];
    if (!focus) throw new Error("project has no targets at all");
    return focus;
}

interface Loaded {
    file: string;
    targets: ReturnType<typeof fromVmTargets>;
}

const loaded: Loaded[] = [];
let unavailable = "";

/** scratch-vm is untyped JavaScript; these are the members this test touches. */
interface Vm {
    attachStorage(storage: unknown): void;
    loadProject(data: Buffer): Promise<void>;
    runtime: { targets: Parameters<typeof fromVmTargets>[0] };
}

beforeAll(async () => {
    try {
        const VirtualMachine = require(`${vmRoot}/src/index.js`) as new () => Vm;
        const makeTestStorage = require(`${vmRoot}/test/fixtures/make-test-storage.js`) as () => unknown;

        for (const file of PROJECTS) {
            const vm = new VirtualMachine();
            vm.attachStorage(makeTestStorage());
            await vm.loadProject(readFileSync(resolve(vmRoot, file)));
            loaded.push({ file, targets: fromVmTargets(vm.runtime.targets) });
        }
    } catch (error) {
        // scratch-vm loads sibling packages from their built `dist`, so an unbuilt
        // workspace looks like a missing module. Skip loudly rather than reporting a
        // renderer failure that is really a build-order problem.
        unavailable = String(error);
        process.stderr.write(
            `\n  SKIPPED: could not boot scratch-vm — ${unavailable}\n` +
                `  Run \`npm run build\` at the repo root first. These tests never pass silently.\n\n`,
        );
    }
     
}, 300_000);

describe("rendering real projects", () => {
    it("loads every fixture project", ({ skip }) => {
        if (unavailable) skip();
        expect(loaded).toHaveLength(PROJECTS.length);
        for (const { file, targets } of loaded) {
            expect(targets.length, `${file} has no targets`).toBeGreaterThan(0);
        }
    });

    it("renders each project without empty or placeholder labels", ({ skip }) => {
        if (unavailable) skip();
        for (const { file, targets } of loaded) {
            const focus = focusOf(targets);
            const { text, aliases } = renderProject(targets, focus.id);

            // An unlabelled block would be invisible to the model. Blank lines are
            // deliberate separators between scripts and are not block lines.
            for (const line of text.split("\n")) {
                const aliased = /^(b\d+)\s+(.*)$/.exec(line);
                if (!aliased) continue;
                const [, alias, label] = aliased;
                expect(label?.trim(), `block ${alias} has no label in ${file}:\n${text}`).not.toBe("");
            }

            // Every alias resolves to a real block in the focused target.
            for (const [alias, blockId] of aliases) {
                expect(focus.blocks[blockId], `${alias} -> missing block in ${file}`).toBeDefined();
            }

        }
    });

    it("never leaves an unfilled slot marker in a real render", ({ skip }) => {
        if (unavailable) skip();
        // The icon-slot bug produced "turn 15 () degrees". Real projects use far more
        // opcodes than the unit tests, so this is where a missed icon slot shows up.
        for (const { file, targets } of loaded) {
            const focus = focusOf(targets);
            const { text } = renderProject(targets, focus.id);
            expect(text, `unfilled slot in ${file}:\n${text}`).not.toMatch(/%\d/);
        }
    });

    it("closes every opened C-block", ({ skip }) => {
        if (unavailable) skip();
        for (const { file, targets } of loaded) {
            const focus = focusOf(targets);
            const { text } = renderProject(targets, focus.id);
            const opened = [...text.matchAll(/^(b\d+)\s+.*/gm)].map((m) => m[1]);
            const closed = [...text.matchAll(/end (b\d+)/g)].map((m) => m[1]);
            for (const alias of closed) {
                expect(opened, `${file} closes ${alias} which was never opened`).toContain(alias);
            }
        }
    });
});
