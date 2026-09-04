import {readdirSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(packageDirectory, "../..");
const blocksDirectory = resolve(repositoryDirectory, "node_modules/scratch-blocks");
const legacyDirectory = resolve(blocksDirectory, "blocks_vertical");
const bundledFile = resolve(blocksDirectory, "dist/main.mjs");
const paletteFile = resolve(packageDirectory, "src/data/palette.json");
const outputFile = resolve(packageDirectory, "src/data/slot-order.json");

function blockDefinitions(source) {
    const definitions = new Map();
    const starts = [...source.matchAll(/(?:N\.([a-z][a-z0-9_]*)|Blockly\.Blocks\[['"]([^'"]+)['"]\])\s*=/g)];
    for (const [definitionIndex, match] of starts.entries()) {
        const opcode = match[1] ?? match[2];
        if (!opcode) continue;
        const start = match.index ?? 0;
        const end = starts[definitionIndex + 1]?.index ?? source.length;
        const definition = source.slice(start, end);
        const marker = /args0\s*:\s*\[/.exec(definition);
        if (!marker) {
            definitions.set(opcode, [...definition.matchAll(/name\s*:\s*["']([^"']+)["']/g)].map((item) => item[1]));
            continue;
        }

        const arrayStart = marker.index + marker[0].length - 1;
        let depth = 0;
        let quote = "";
        let escaped = false;
        let arrayEnd = arrayStart;
        for (let index = arrayStart; index < definition.length; index += 1) {
            const character = definition[index];
            if (quote) {
                if (escaped) escaped = false;
                else if (character === "\\") escaped = true;
                else if (character === quote) quote = "";
                continue;
            }
            if (character === "'" || character === '"') {
                quote = character;
            } else if (character === "[") {
                depth += 1;
            } else if (character === "]") {
                depth -= 1;
                if (depth === 0) {
                    arrayEnd = index;
                    break;
                }
            }
        }

        const args = definition.slice(arrayStart, arrayEnd);
        definitions.set(opcode, [...args.matchAll(/name\s*:\s*["']([^"']+)["']/g)].map((item) => item[1]));
    }
    return definitions;
}

function readDefinitions() {
    try {
        const files = readdirSync(legacyDirectory)
            .filter((file) => file.endsWith(".js"))
            .map((file) => readFileSync(resolve(legacyDirectory, file), "utf8"));
        if (files.length > 0) return blockDefinitions(files.join("\n"));
    } catch {
        // The installed Scratch Blocks release may ship only its bundled definitions.
    }
    return blockDefinitions(readFileSync(bundledFile, "utf8"));
}

const palette = JSON.parse(readFileSync(paletteFile, "utf8"));
const definitions = readDefinitions();
const opcodes = new Set(palette.map((entry) => entry.opcode));

// These are the literal and menu blocks that can appear inside palette inputs.
for (const opcode of definitions.keys()) {
    if (
        opcode === "data_listcontents" ||
        opcode === "data_variable" ||
        opcode === "event_broadcast_menu" ||
        opcode === "event_touchingobjectmenu" ||
        opcode === "sensing_keyoptions" ||
        opcode === "text" ||
        opcode === "colour_picker" ||
        opcode.startsWith("math_") ||
        opcode.endsWith("menu")
    ) {
        opcodes.add(opcode);
    }
}

// These catalogue entries are custom blocks in the current Scratch Blocks bundle.
definitions.set("control_stop", ["STOP_OPTION"]);
definitions.set("sensing_of", ["PROPERTY", "OBJECT"]);

const slotOrder = Object.fromEntries(
    [...opcodes]
        .filter((opcode) => definitions.has(opcode))
        .sort()
        .map((opcode) => [opcode, definitions.get(opcode)]),
);
writeFileSync(outputFile, `${JSON.stringify(slotOrder, null, 2)}\n`);
