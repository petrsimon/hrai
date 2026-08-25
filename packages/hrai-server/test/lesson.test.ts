import {describe, expect, it} from 'vitest';
import type {Block, RenderTarget} from '../src/render.ts';
import {Session} from '../src/session.ts';

const targets: RenderTarget[] = [
    {id: 'stage', name: 'Stage', isStage: true, blocks: {}},
    {id: 'blue-1', name: 'Modry mec', isStage: false, blocks: {}},
    {id: 'blue-2', name: 'Blue 2', isStage: false, blocks: {}},
    {id: 'red-1', name: 'Red 1', isStage: false, blocks: {}},
    {id: 'red-2', name: 'Red 2', isStage: false, blocks: {}}
];

const selectedBlock = (id: string, opcode: string): Block => ({
    id,
    opcode,
    next: null,
    parent: null,
    inputs: {},
    fields: {},
    topLevel: true,
});

const selectionTargets = (
    opcodes: string[],
    withVariable = false,
    targetIndex = 1,
): RenderTarget[] => targets.map(
    (target, index) => index === targetIndex ? ({
    ...target,
    variables: withVariable ? {selected: {name: 'vybraný voják', value: 1}} : {},
    blocks: Object.fromEntries(opcodes.map((opcode, blockIndex) => [
        `block-${blockIndex}`,
        selectedBlock(`block-${blockIndex}`, opcode),
    ])),
}) : target,
);

describe('hrai lesson progression', () => {
    it('evaluates and advances the soldier battle stages', () => {
        const session = new Session();

        expect(session.startLesson('11-soldier-battle')?.id).toBe('00-board');
        session.setWorkspace(targets, 'blue-1');
        expect(session.evaluateLessonStage()).toBe(true);
        expect(session.lessonProgress?.complete).toBe(true);
        expect(session.nextLessonStage()?.id).toBe('01-selection-click');
        expect(session.lessonProgress?.complete).toBe(false);

        session.setWorkspace(selectionTargets(['event_whenthisspriteclicked'], false, 2), 'blue-2');
        expect(session.evaluateLessonStage()).toBe(false);

        session.setWorkspace(selectionTargets(['event_whenthisspriteclicked']), 'blue-1');
        expect(session.evaluateLessonStage()).toBe(true);

        expect(session.nextLessonStage()?.id).toBe('02-selection-memory');
        session.setWorkspace(selectionTargets([
            'event_whenthisspriteclicked',
            'data_setvariableto',
        ], true), 'blue-1');
        expect(session.evaluateLessonStage()).toBe(true);

        expect(session.nextLessonStage()?.id).toBe('03-selection-mark');
        session.setWorkspace(selectionTargets([
            'event_whenthisspriteclicked',
            'data_setvariableto',
            'looks_seteffectto',
        ], true), 'blue-1');
        expect(session.evaluateLessonStage()).toBe(true);
    });

    it('rejects unknown lessons', () => {
        const session = new Session();

        expect(session.startLesson('unknown')).toBeNull();
        expect(session.lessonProgress).toBeNull();
    });
});
