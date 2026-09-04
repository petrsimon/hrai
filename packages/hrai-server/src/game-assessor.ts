import type {GameAssessment, GameAssessmentCriterion} from "./game-plan.ts";
import {PALETTE} from "./palette.ts";
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

interface CriterionDescription {
    satisfied: boolean;
    missingOpcodes: string[];
    categories: string[];
    detail: string;
    categoryDetail: string;
}

const categoryForOpcode = new Map(PALETTE.map((entry) => [entry.opcode, entry.category]));

function projectOpcodes(targets: RenderTarget[]): Set<string> {
    return new Set(targets.flatMap((target) => Object.values(target.blocks)
        .filter((block) => !block.shadow)
        .map((block) => block.opcode)));
}

function bestMatchingScript(opcodes: string[], scripts: Set<string>[]): Set<string> {
    return scripts.reduce((best, script) => {
        const matches = opcodes.filter((opcode) => script.has(opcode)).length;
        const bestMatches = opcodes.filter((opcode) => best.has(opcode)).length;
        return matches > bestMatches ? script : best;
    }, new Set<string>());
}

function missingCategories(opcodes: string[]): string[] {
    return [...new Set(opcodes.map((opcode) => categoryForOpcode.get(opcode) ?? "jiná"))];
}

function describeCriterion(
    criterion: GameAssessmentCriterion,
    targets: RenderTarget[],
    scripts: Set<string>[],
): CriterionDescription {
    switch (criterion.kind) {
    case "projectContains": {
        const present = projectOpcodes(targets);
        const missingOpcodes = criterion.opcodes.filter((opcode) => !present.has(opcode));
        return {
            satisfied: missingOpcodes.length === 0,
            missingOpcodes,
            categories: missingCategories(missingOpcodes.length > 0 ? missingOpcodes : criterion.opcodes),
            detail: `projekt obsahuje ${criterion.opcodes.join(", ")}`,
            categoryDetail: "v projektu",
        };
    }
    case "scriptContains": {
        const matching = scripts.filter((script) => criterion.opcodes.every((opcode) => script.has(opcode))).length;
        const satisfied = matching >= criterion.minimum;
        const best = bestMatchingScript(criterion.opcodes, scripts);
        const missingOpcodes = criterion.opcodes.filter((opcode) => !best.has(opcode));
        const listedOpcodes = missingOpcodes.length > 0 ? missingOpcodes : criterion.opcodes;
        const remaining = Math.max(criterion.minimum - matching, 0);
        const suffix = criterion.minimum > 1 && remaining > 0 ? ` (ještě ${remaining})` : "";
        return {
            satisfied,
            missingOpcodes: listedOpcodes,
            categories: missingCategories(listedOpcodes),
            detail: `${listedOpcodes.join(", ")} v jednom propojeném skriptu${suffix}`,
            categoryDetail: `v jednom propojeném skriptu${suffix}`,
        };
    }
    case "spriteCountAtLeast": {
        const count = targets.filter((target) => !target.isStage).length;
        const missing = Math.max(criterion.minimum - count, 0);
        return {
            satisfied: missing === 0,
            missingOpcodes: [],
            categories: [],
            detail: `alespoň ${criterion.minimum} postav (nyní ${count})`,
            categoryDetail: `alespoň ${criterion.minimum} postav (chybí ${missing})`,
        };
    }
    case "variableCountAtLeast": {
        const count = new Set(targets.flatMap((target) => Object.keys(target.variables ?? {}))).size;
        const missing = Math.max(criterion.minimum - count, 0);
        return {
            satisfied: missing === 0,
            missingOpcodes: [],
            categories: [],
            detail: `alespoň ${criterion.minimum} proměnných (nyní ${count})`,
            categoryDetail: `alespoň ${criterion.minimum} proměnných (chybí ${missing})`,
        };
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

/**
 * Describes the evidence a tutor may reveal at the current hint rung.
 * @param assessment Server-validated evidence contract.
 * @param targets Current normalized Scratch targets.
 * @param rung Hint-ladder rung controlling detail.
 * @returns Czech evidence lines, from aggregate progress to exact opcodes.
 */
export function describeAssessment(
    assessment: GameAssessment,
    targets: RenderTarget[],
    rung: number,
): string[] {
    const descriptions = assessment.allOf.map((criterion) => describeCriterion(
        criterion,
        targets,
        scriptsIn(targets),
    ));
    const complete = descriptions.filter((description) => description.satisfied).length;

    if (rung <= 2) {
        return [`Podmínky milníku: splněno ${complete} ze ${descriptions.length}.`];
    }
    if (rung === 3) {
        return descriptions
            .filter((description) => !description.satisfied)
            .map((description) => description.categories.length > 0
                ? `chybí: kategorie ${description.categories.join(", ")} ${description.categoryDetail}.`
                : `chybí: ${description.categoryDetail}.`);
    }
    return descriptions.map((description) => description.satisfied
        ? `splněno: ${description.detail}.`
        : `chybí: ${description.detail}.`);
}
