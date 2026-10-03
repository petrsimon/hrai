import React from 'react';
import {act} from '@testing-library/react';
import {Provider} from 'react-redux';
import configureStore from 'redux-mock-store';
import {io} from 'socket.io-client';

import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import HraiPanel from '../../../src/containers/hrai-panel.jsx';
import {loadGameProgress} from '../../../src/lib/hrai-game-progress';
import {loadGameStarter} from '../../../src/lib/hrai-game-starter';
import {
    clearProjectTutorialProgress,
    saveProjectTutorialProgress
} from '../../../src/lib/hrai-project-tutorial-progress';
import {LoadingState} from '../../../src/reducers/project-state';

const mockPanelRender = jest.fn();
let mockSocket;
let socketHandlers;

jest.mock('socket.io-client', () => ({
    io: jest.fn(() => mockSocket)
}));

jest.mock('../../../src/lib/hrai-game-starter', () => ({
    loadGameStarter: jest.fn(() => Promise.resolve())
}));

jest.mock('../../../src/components/hrai-panel/hrai-panel.jsx', () => props => {
    mockPanelRender(props);
    return null;
});

const GAME_PLAN = {
    title: 'Dračí bludiště',
    originalGoal: 'Drak najde poklad v bludišti.',
    coreLoop: 'Veď draka chodbami k pokladu.',
    milestones: [{id: 'milestone-1', title: 'Pohyb draka'}]
};

const PLAYTEST = {
    plan: GAME_PLAN,
    starter: {targets: []}
};

const makeVm = () => ({
    editingTarget: null,
    runtime: {
        targets: [
            {
                id: 'stage',
                isStage: true,
                getName: () => 'Stage',
                blocks: {_blocks: {}},
                variables: {}
            },
            {
                id: 'sprite',
                isStage: false,
                getName: () => 'Sprite',
                blocks: {_blocks: {}},
                variables: {}
            }
        ]
    },
    addListener: jest.fn((event, handler) => {
        socketHandlers[event] = handler;
    }),
    removeListener: jest.fn()
});

const panelTree = (store, props = {}) => (
    <Provider store={store}>
        <HraiPanel {...props} />
    </Provider>
);

const renderContainer = ({
    lessonId = null,
    projectId = '0',
    projectTitle = 'Untitled',
    canCreateNew = false,
    canSave = false,
    projectState = {}
} = {}) => {
    socketHandlers = {};
    mockSocket = {
        connected: true,
        on: jest.fn((event, handler) => {
            socketHandlers[event] = handler;
        }),
        off: jest.fn(),
        emit: jest.fn(),
        disconnect: jest.fn()
    };
    let state = {
        scratchGui: {
            hraiLesson: {lessonId},
            projectState: {loadingState: LoadingState.SHOWING_WITHOUT_ID, projectId, ...projectState},
            projectTitle,
            vm: makeVm()
        }
    };
    const store = configureStore()(() => state);
    const dispatch = store.dispatch;
    store.dispatch = action => {
        if (action?.type === 'projectTitle/SET_PROJECT_TITLE') {
            state = {
                scratchGui: {
                    ...state.scratchGui,
                    projectTitle: action.title
                }
            };
        }
        return dispatch(action);
    };
    const view = renderWithIntl(panelTree(store, {canCreateNew, canSave}));
    const updateScratchGui = patch => {
        state = {
            scratchGui: {
                ...state.scratchGui,
                ...patch,
                ...(patch.projectState ? {
                    projectState: {
                        ...state.scratchGui.projectState,
                        ...patch.projectState
                    }
                } : {})
            }
        };
        // redux-mock-store keeps the last getState() result until a dispatch
        // notifies subscribers, so connected props would otherwise stay stale.
        store.dispatch({type: 'test/updateScratchGui'});
    };
    return {store, view, vm: state.scratchGui.vm, updateScratchGui};
};

const latestPanelProps = () => mockPanelRender.mock.calls.at(-1)[0];

describe('HraiPanel container custom game start', () => {
    beforeEach(() => {
        mockPanelRender.mockClear();
        io.mockClear();
        loadGameStarter.mockClear();
        window.localStorage.clear();
        window.confirm = jest.fn(() => true);
    });

    test('starts planning after the new project emits PROJECT_CHANGED', () => {
        const {store, vm} = renderContainer();
        const props = latestPanelProps();

        act(() => {
            props.onSend('Drak hledá poklad.');
            props.onStartNewProject('Drak hledá poklad.');
        });

        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(store.getActions()).toContainEqual({
            type: 'scratch-gui/project-state/START_CREATING_NEW'
        });
        expect(mockSocket.emit).not.toHaveBeenCalledWith('gamePlan', expect.anything());

        act(() => {
            vm.addListener.mock.calls.find(([event]) => event === 'PROJECT_CHANGED')[1]();
        });

        expect(mockSocket.emit).toHaveBeenCalledWith('gamePlan', {
            text: 'Drak hledá poklad.'
        });
        expect(mockPanelRender.mock.calls.at(-1)[0].isStartingNewProject).toBe(false);
    });

    test('does not start a new project when confirmation is declined', () => {
        window.confirm.mockReturnValue(false);
        const {store, vm} = renderContainer();

        act(() => {
            latestPanelProps().onStartNewProject('Drak hledá poklad.');
        });
        act(() => {
            vm.addListener.mock.calls.find(([event]) => event === 'PROJECT_CHANGED')[1]();
        });

        expect(store.getActions()).toEqual([]);
        expect(mockSocket.emit).not.toHaveBeenCalledWith('gamePlan', expect.anything());
    });

    test('keeps the plan and socket after rename on accept, then persists playtest under the new title', async () => {
        renderContainer({projectId: null});

        act(() => {
            socketHandlers.gamePlanProposed(GAME_PLAN);
        });
        expect(latestPanelProps().gamePlan).toEqual(GAME_PLAN);

        act(() => {
            latestPanelProps().onGamePlanAccept();
        });

        expect(mockSocket.emit).toHaveBeenCalledWith('gamePlanAccept');
        expect(latestPanelProps().gamePlan).toEqual(GAME_PLAN);
        expect(latestPanelProps().isPlanning).toBe(true);
        expect(mockSocket.disconnect).not.toHaveBeenCalled();
        expect(io).toHaveBeenCalledTimes(1);

        await act(async () => {
            socketHandlers.gamePlaytest(PLAYTEST);
            await Promise.resolve();
        });

        expect(loadGameStarter).toHaveBeenCalledWith(expect.anything(), PLAYTEST.starter);
        expect(loadGameProgress(null, GAME_PLAN.title)).toEqual({
            plan: GAME_PLAN,
            milestoneIndex: 0,
            phase: 'playtest'
        });
        expect(loadGameProgress(null, 'Untitled')).toBeNull();
        expect(latestPanelProps().gamePlan).toBeNull();
        expect(latestPanelProps().gamePlaytest).toEqual(PLAYTEST);
    });

    test('resets the plan when the project id changes', () => {
        const {updateScratchGui} = renderContainer();

        act(() => {
            socketHandlers.gamePlanProposed(GAME_PLAN);
        });
        expect(latestPanelProps().gamePlan).toEqual(GAME_PLAN);

        act(() => {
            updateScratchGui({projectState: {projectId: '42'}});
        });

        expect(latestPanelProps().gamePlan).toBeNull();
    });

    test('resets the plan when the lesson changes', () => {
        const {updateScratchGui} = renderContainer();

        act(() => {
            socketHandlers.gamePlanProposed(GAME_PLAN);
        });
        expect(latestPanelProps().gamePlan).toEqual(GAME_PLAN);

        act(() => {
            updateScratchGui({hraiLesson: {lessonId: '01-space-rover'}});
        });

        expect(latestPanelProps().gamePlan).toBeNull();
    });
});

describe('HraiPanel container project tutorial rebuild', () => {
    const progress = {
        plan: {
            mode: 'rebuild',
            title: 'Rebuild the maze',
            overview: 'Create a similar game in a new project.',
            steps: [{
                id: 'tutorial-step-1',
                title: 'Start',
                goal: 'Start the game.',
                instruction: 'Add the green flag event.',
                success: 'The game starts from the green flag.'
            }]
        },
        stepIndex: 0,
        step: {
            id: 'tutorial-step-1',
            title: 'Start',
            goal: 'Start the game.',
            instruction: 'Add the green flag event.',
            success: 'The game starts from the green flag.'
        },
        stepComplete: false,
        complete: false,
        needsNewProject: true
    };

    beforeEach(() => {
        mockPanelRender.mockClear();
        window.confirm = jest.fn(() => true);
    });

    test('saves a loaded source before opening the new rebuild project', () => {
        const {store} = renderContainer({
            canSave: true,
            projectState: {loadingState: LoadingState.SHOWING_WITH_ID, projectId: '42'}
        });
        act(() => socketHandlers.projectTutorialProgress(progress));
        act(() => latestPanelProps().onStartProjectTutorialRebuild());

        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(store.getActions()).toContainEqual({
            type: 'scratch-gui/project-state/START_UPDATING_BEFORE_CREATING_NEW'
        });
        expect(store.getActions()).not.toContainEqual({
            type: 'scratch-gui/project-state/START_FETCHING_NEW'
        });
    });

    test('creates a saved source copy before replacing an unsaved imported project', () => {
        const {store} = renderContainer({
            canSave: true,
            projectState: {loadingState: LoadingState.SHOWING_WITHOUT_ID, projectId: '0'}
        });
        act(() => socketHandlers.projectTutorialProgress(progress));
        act(() => latestPanelProps().onStartProjectTutorialRebuild());

        expect(store.getActions()).toContainEqual({
            type: 'scratch-gui/project-state/START_CREATING_NEW'
        });
        expect(store.getActions()).not.toContainEqual({
            type: 'scratch-gui/project-state/START_FETCHING_NEW'
        });
    });

    test('refuses rebuild when the original cannot be saved', () => {
        const {store} = renderContainer({
            canSave: false,
            projectState: {loadingState: LoadingState.SHOWING_WITH_ID, projectId: '42'}
        });
        act(() => socketHandlers.projectTutorialProgress(progress));
        act(() => latestPanelProps().onStartProjectTutorialRebuild());

        expect(store.getActions()).toEqual([]);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(latestPanelProps().projectTutorialError).toMatch(/přihlas/i);
    });
});

describe('HraiPanel container agent session', () => {
    const savedRebuildProgress = {
        plan: {
            mode: 'rebuild',
            title: 'Rebuild the maze',
            overview: 'Create a similar game in a new project.',
            steps: []
        },
        stepIndex: 0
    };

    beforeEach(() => {
        mockPanelRender.mockClear();
        clearProjectTutorialProgress('0', 'Untitled');
        clearProjectTutorialProgress('42', 'Untitled');
    });

    test('restores a rebuild on its source with the new-project gate active', () => {
        saveProjectTutorialProgress('42', savedRebuildProgress, 'Untitled');
        renderContainer({
            canSave: true,
            projectState: {loadingState: LoadingState.SHOWING_WITH_ID, projectId: '42'}
        });

        act(() => socketHandlers.connect());

        expect(mockSocket.emit).toHaveBeenCalledWith('projectTutorialRestore', {
            plan: savedRebuildProgress.plan,
            stepIndex: 0,
            needsNewProject: true
        });
    });

    test('restores a rebuild in its separate project with the gate cleared', () => {
        saveProjectTutorialProgress('42', savedRebuildProgress, 'Untitled', true);
        renderContainer({
            canSave: true,
            projectState: {loadingState: LoadingState.SHOWING_WITH_ID, projectId: '42'}
        });

        act(() => socketHandlers.connect());

        expect(mockSocket.emit).toHaveBeenCalledWith('projectTutorialRestore', {
            plan: savedRebuildProgress.plan,
            stepIndex: 0,
            needsNewProject: false
        });
    });

    test('opens the session and folds history and live events', () => {
        renderContainer();

        act(() => {
            socketHandlers.connect();
        });
        expect(mockSocket.emit).toHaveBeenCalledWith('session:open', {projectId: '0'});

        act(() => {
            socketHandlers['session:history']({
                projectId: '0',
                events: [
                    {kind: 'user', turnId: 't1', text: 'Ahoj'},
                    {kind: 'assistant_delta', turnId: 't1', delta: 'Čau'}
                ]
            });
        });
        expect(latestPanelProps().transcript).toMatchObject([{
            kind: 'turn',
            turnId: 't1',
            user: 'Ahoj',
            assistant: 'Čau',
            running: true
        }]);
        expect(latestPanelProps().isAgentRunning).toBe(true);

        act(() => {
            socketHandlers['session:event']({
                kind: 'turn_end',
                turnId: 't1',
                stopReason: 'stop',
                model: 'openai-codex/gpt-5.4'
            });
        });
        expect(latestPanelProps().isAgentRunning).toBe(false);
        expect(latestPanelProps().transcript[0].stopReason).toBe('stop');

        act(() => {
            latestPanelProps().onAbort();
        });
        expect(mockSocket.emit).toHaveBeenCalledWith('session:abort');
    });
});
