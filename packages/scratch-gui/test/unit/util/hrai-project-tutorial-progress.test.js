import {
    clearProjectTutorialProgress,
    loadProjectTutorialProgress,
    saveProjectTutorialProgress
} from '../../../src/lib/hrai-project-tutorial-progress';

const PLAN = {
    mode: 'rebuild',
    title: 'Build a maze',
    overview: 'Create a similar game in a new project.',
    steps: [{id: 'tutorial-step-1'}]
};

describe('project tutorial progress persistence', () => {
    beforeEach(() => window.localStorage.clear());

    test('stores only the plan and active step, not server-derived completion state', () => {
        saveProjectTutorialProgress(42, {
            plan: PLAN,
            stepIndex: 0,
            stepComplete: true,
            complete: true
        }, 'Maze');

        expect(loadProjectTutorialProgress(42, 'Maze')).toEqual({plan: PLAN, stepIndex: 0, newProjectStarted: false});
    });

    test('remembers when a rebuild has moved to its separate project', () => {
        saveProjectTutorialProgress(7, {plan: PLAN, stepIndex: 0}, 'New project', true);

        expect(loadProjectTutorialProgress(7, 'New project').newProjectStarted).toBe(true);
    });

    test('isolates projects and supports unsaved project titles', () => {
        saveProjectTutorialProgress(null, {plan: PLAN, stepIndex: 0}, 'First project');

        expect(loadProjectTutorialProgress(null, 'First project')).toEqual({
            plan: PLAN,
            stepIndex: 0,
            newProjectStarted: false
        });
        expect(loadProjectTutorialProgress(null, 'Other project')).toBeNull();
        expect(loadProjectTutorialProgress(7, 'First project')).toBeNull();
    });

    test('ignores malformed storage and clears a project tutorial', () => {
        window.localStorage.setItem('hrai.project-tutorial-progress.v1', '{bad json');
        expect(loadProjectTutorialProgress(42, 'Maze')).toBeNull();

        saveProjectTutorialProgress(42, {plan: PLAN, stepIndex: 0}, 'Maze');
        clearProjectTutorialProgress(42, 'Maze');
        expect(loadProjectTutorialProgress(42, 'Maze')).toBeNull();
    });
});
