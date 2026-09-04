import type {GameAssessment, GameAssessmentCriterion} from "./game-plan.ts";
import type {Block, RenderTarget} from "./render.ts";

function scriptOpcodes(rootId: string, blocks: Record<string, Block>): Set<string> {
    const opcodes = new Set<string>();
    const visited = new Set<string>();
    const pending = [rootId];

    while (pending.length > 0) {
        const id = pending.pop();
        if (!id || visited.has(id)) continue;
        visited.add(id);
        const block = blocks[id];
        if (!block) continue;
        opcodes.add(block.opcode);
        if (block.next) pending.push(block.next);
        for (const input of Object.values(block.inputs)) {
            const child = input.block ?? input.shadow;
            if (child) pending.push(child);
        }
    }

    return opcodes;
}

function scriptsIn(targets: RenderTarget[]): Set<string>[] {
    return targets.flatMap((target) => Object.values(target.blocks)
        .filter((block) => Boolean(block.topLevel) && !block.shadow)
        .map((root) => scriptOpcodes(root.id, target.blocks)));
}

function evaluateCriterion(
    criterion: GameAssessmentCriterion,
    targets: RenderTarget[],
    scripts: Set<string>[],
): boolean {
    switch (criterion.kind) {
    case "projectContains": {
        const projectOpcodes = new Set(targets.flatMap((target) => Object.values(target.blocks)
            .filter((block) => !block.shadow)
            .map((block) => block.opcode)));
        return criterion.opcodes.every((opcode) => projectOpcodes.has(opcode));
    }
    case "scriptContains":
        return scripts.filter((script) => criterion.opcodes.every((opcode) => script.has(opcode))).length >=
            criterion.minimum;
    case "spriteCountAtLeast":
        // The GUI filters runtime clones before sending the workspace payload.
        return targets.filter((target) => !target.isStage).length >= criterion.minimum;
    case "variableCountAtLeast": {
        const variableIds = new Set(targets.flatMap((target) => Object.keys(target.variables ?? {})));
        return variableIds.size >= criterion.minimum;
    }
    }
}

/**
 * Evaluates a validated milestone contract against structural workspace evidence.
 * @param assessment Server-validated evidence contract.
 * @param targets Current normalized Scratch targets.
 * @returns Whether every required criterion is present.
 */
export function evaluateGameAssessment(assessment: GameAssessment, targets: RenderTarget[]): boolean {
    if (assessment.allOf.length === 0) return false;
    const scripts = scriptsIn(targets);
    return assessment.allOf.every((criterion) => evaluateCriterion(criterion, targets, scripts));
}
