import {beforeAll, describe, expect, it} from 'vitest';
import {LESSONS} from '../src/lesson.ts';
import {EVAL_MODEL, chat, isModelAvailable, warnSkipped} from '../src/model-client.ts';
import {systemPrompt, userPrompt} from '../src/prompt.ts';

const PROJECT = `postava: Modry mec
(zatim zadne bloky)

postava: Modry luk (0 skriptu, 0 bloku)
postava: Cerveny mec (0 skriptu, 0 bloku)
postava: Cerveny luk (0 skriptu, 0 bloku)`;

let available = false;
beforeAll(async () => {
    available = await isModelAvailable(EVAL_MODEL);
    if (!available) warnSkipped(EVAL_MODEL);
});

describe(`guided lesson response (${EVAL_MODEL})`, () => {
    it('turns an ambiguous selection step into one concrete action', async ({skip}) => {
        if (!available) skip();
        const stage = LESSONS['11-soldier-battle'].stages[1];
        const {text} = await chat(
            systemPrompt(1, stage),
            userPrompt(PROJECT, 'Nevím, co znamená vybrat vojáka. Co mám teď udělat?')
        );
        const normalized = text.toLowerCase();

        expect(normalized).toContain('modr');
        expect(normalized).toMatch(/klik|událost|přetáhni|přidej blok/);
        expect(text.trim().endsWith('?')).toBe(false);
        expect(normalized).not.toMatch(/stříl|zaúto|pohybuj|rychleji/);
    }, 120_000);
});
