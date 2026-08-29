import {
    clearGameProgress,
    loadGameProgress,
    saveGameProgress
} from '../../../src/lib/hrai-game-progress';

const PLAN = {
    title: 'Dračí hra',
    originalGoal: 'Drak hledá poklad.',
    coreLoop: 'Pohybuj drakem k pokladu.',
    milestones: [{id: 'milestone-1'}]
};

describe('custom game progress persistence', () => {
    beforeEach(() => window.localStorage.clear());

    test('stores accepted plan and milestone index without completion state', () => {
        saveGameProgress(42, {
            plan: PLAN,
            milestoneIndex: 0,
            complete: true
        }, 'Moje hra');

        expect(loadGameProgress(42, 'Moje hra')).toEqual({
            plan: PLAN,
            milestoneIndex: 0
        });
    });

    test('persists playtest feedback with guided progress', () => {
        saveGameProgress(42, {
            plan: PLAN,
            milestoneIndex: 0,
            feedback: 'Chci, aby drak skákal výš.'
        }, 'Moje hra');

        expect(loadGameProgress(42, 'Moje hra')).toEqual({
            plan: PLAN,
            milestoneIndex: 0,
            feedback: 'Chci, aby drak skákal výš.'
        });
    });

    test('isolates projects and supports local title keys', () => {
        saveGameProgress(null, {plan: PLAN, milestoneIndex: 0}, 'První hra');

        expect(loadGameProgress(null, 'První hra')).toEqual({plan: PLAN, milestoneIndex: 0});
        expect(loadGameProgress(null, 'Druhá hra')).toBeNull();
        expect(loadGameProgress(7, 'První hra')).toBeNull();
    });

    test('ignores malformed storage and clears replaced custom games', () => {
        window.localStorage.setItem('hrai.game-progress.v1', '{bad json');
        expect(loadGameProgress(42, 'Moje hra')).toBeNull();

        saveGameProgress(42, {plan: PLAN, milestoneIndex: 0}, 'Moje hra');
        clearGameProgress(42, 'Moje hra');
        expect(loadGameProgress(42, 'Moje hra')).toBeNull();
    });
});
