/**
 * Adapts live scratch-vm targets to the renderer's input shape.
 *
 * The renderer is deliberately a pure function over plain data so it can be tested
 * without booting a VM. This is the only place that knows about VM internals, which
 * keeps the coupling to one small file when the VM changes underneath us.
 */
import type { Block, RenderTarget } from "./render.ts";

/** The parts of a scratch-vm RenderedTarget this adapter reads. */
interface VmTarget {
    id: string;
    isStage: boolean;
    getName(): string;
    blocks?: { _blocks?: Record<string, Block> };
}

/**
 * Converts live VM targets into renderer input.
 *
 * `blocks._blocks` is reached into directly: `Blocks` exposes per-block getters but no
 * accessor for the whole map, and copying it through 150 `getBlock` calls per render
 * would cost more than it protects.
 * @param targets Targets from `vm.runtime.targets`.
 * @returns Renderer-shaped targets, in the same order.
 */
export function fromVmTargets(targets: readonly VmTarget[]): RenderTarget[] {
    return targets.map((target) => ({
        id: target.id,
        name: target.getName(),
        isStage: target.isStage,
        blocks: target.blocks?._blocks ?? {},
    }));
}
