import {describe, expect, it} from 'vitest';
import {Session} from '../src/session.ts';

const targets = [
    {id: 'stage', name: 'Stage', isStage: true, blocks: {}},
    {id: 'blue-1', name: 'Blue 1', isStage: false, blocks: {}},
    {id: 'blue-2', name: 'Blue 2', isStage: false, blocks: {}},
    {id: 'red-1', name: 'Red 1', isStage: false, blocks: {}},
    {id: 'red-2', name: 'Red 2', isStage: false, blocks: {}}
];

describe('hrai lesson progression', () => {
    it('evaluates and advances the soldier battle stages', () => {
        const session = new Session();

        expect(session.startLesson('11-soldier-battle')?.id).toBe('00-board');
        session.setWorkspace(targets, 'blue-1');
        expect(session.evaluateLessonStage()).toBe(true);
        expect(session.lessonProgress?.complete).toBe(true);
        expect(session.nextLessonStage()?.id).toBe('01-select');
        expect(session.lessonProgress?.complete).toBe(false);
    });

    it('rejects unknown lessons', () => {
        const session = new Session();

        expect(session.startLesson('unknown')).toBeNull();
        expect(session.lessonProgress).toBeNull();
    });
});
