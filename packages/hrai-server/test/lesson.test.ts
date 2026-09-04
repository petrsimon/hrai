import {describe, expect, it} from 'vitest';
import {LESSONS} from '../src/lesson.ts';
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
): RenderTarget[] => targets.map((target, index) => ({
    ...target,
    variables: withVariable && target.isStage ? {selected: {name: 'vybraný voják', value: 1}} : {},
    blocks: index === targetIndex ? Object.fromEntries(opcodes.map((opcode, blockIndex) => [
        `block-${blockIndex}`,
        selectedBlock(`block-${blockIndex}`, opcode),
    ])) : target.blocks,
}));

describe('hrai lesson progression', () => {
    it('declares the palette blocks required by each lesson predicate', () => {
        expect(LESSONS['11-soldier-battle'].stages.map(stage => stage.opcodes)).toEqual([
            [],
            ['event_whenthisspriteclicked'],
            ['event_whenthisspriteclicked', 'data_setvariableto'],
            [
                'event_whenthisspriteclicked',
                'data_setvariableto',
                'looks_seteffectto',
                'looks_changeeffectby',
                'looks_switchcostumeto',
            ],
            ['event_whenthisspriteclicked', 'control_if', 'operator_lt', 'operator_equals'],
            ['looks_hide'],
            ['sensing_distanceto'],
            ['control_create_clone_of', 'control_wait'],
            ['event_broadcast', 'event_whenbroadcastreceived', 'operator_gt', 'looks_say'],
        ]);
    });

    it('shows generic evidence below rung four and missing requirements at higher rungs', () => {
        const session = new Session();
        session.startLesson('11-soldier-battle', 2);
        session.setWorkspace(targets, 'blue-1');

        expect(session.tutorContextFor(3)?.evidence).toEqual([
            'Podmínka kroku zatím není splněna.',
        ]);
        expect(session.tutorContextFor(4)?.evidence).toContain('chybí: data_setvariableto');
        expect(session.tutorContextFor(4)?.evidence).toContain('chybí: společná proměnná na scéně');
    });

    it('evaluates and advances the soldier battle stages', () => {
        const session = new Session();

        expect(session.startLesson('11-soldier-battle')?.id).toBe('00-board');
        session.setWorkspace(targets, 'blue-1');
        expect(session.evaluateLessonStage()).toBe(true);
        expect(session.lessonProgress?.complete).toBe(true);
        session.remember('learner', 'Starý chat');
        expect(session.nextLessonStage()?.id).toBe('01-selection-click');
        expect(session.lessonProgress?.complete).toBe(false);
        expect(session.history).toEqual([]);

        session.setWorkspace(selectionTargets(['event_whenthisspriteclicked'], false, 2), 'blue-2');
        expect(session.evaluateLessonStage()).toBe(false);

        session.setWorkspace(selectionTargets(['event_whenthisspriteclicked']), 'blue-1');
        expect(session.evaluateLessonStage()).toBe(true);

        expect(session.nextLessonStage()?.id).toBe('02-selection-memory');
        session.setWorkspace(selectionTargets([
            'event_whenthisspriteclicked',
            'data_setvariableto',
        ]), 'blue-1');
        expect(session.evaluateLessonStage()).toBe(false);

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

    it('re-evaluates a completed stage when the child breaks it', () => {
        const session = new Session();
        session.startLesson('11-soldier-battle', 0);
        session.setWorkspace(targets, 'blue-1');
        expect(session.evaluateLessonStage()).toBe(true);

        session.setWorkspace(targets.slice(0, 2), 'blue-1');
        expect(session.evaluateLessonStage()).toBe(false);
        expect(session.lessonProgress?.complete).toBe(false);
    });

    it('uses the Czech variable names from the soldier battle guide', () => {
        const workspace = (names: string[], opcodes: string[]): RenderTarget[] => [{
            id: 'soldier',
            name: 'Soldier',
            isStage: false,
            variables: Object.fromEntries(names.map((name, index) => [`variable-${index}`, {name, value: 0}])),
            blocks: Object.fromEntries(opcodes.map((opcode, index) => [
                `block-${index}`,
                selectedBlock(`block-${index}`, opcode),
            ])),
        }];

        const health = new Session();
        health.startLesson('11-soldier-battle', 5);
        health.setWorkspace(workspace(
            ['životy', 'mrtví nepřátelé', 'živí nepřátelé'],
            ['looks_hide'],
        ), 'soldier');
        expect(health.evaluateLessonStage()).toBe(true);

        const bow = new Session();
        bow.startLesson('11-soldier-battle', 6);
        bow.setWorkspace(workspace(['typ'], ['sensing_distanceto']), 'soldier');
        expect(bow.evaluateLessonStage()).toBe(true);

        const reinforcements = new Session();
        reinforcements.startLesson('11-soldier-battle', 7);
        reinforcements.setWorkspace(workspace(
            ['počet posil'],
            ['control_create_clone_of', 'control_wait'],
        ), 'soldier');
        expect(reinforcements.evaluateLessonStage()).toBe(true);
    });

    it('rejects unknown lessons', () => {
        const session = new Session();

        expect(session.startLesson('unknown')).toBeNull();
        expect(session.lessonProgress).toBeNull();
    });
});
