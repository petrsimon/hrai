import React from 'react';
import {act} from '@testing-library/react';
import {Provider} from 'react-redux';
import configureStore from 'redux-mock-store';

import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import HraiPanel from '../../../src/containers/hrai-panel.jsx';

const mockPanelRender = jest.fn();
let mockSocket;
let socketHandlers;

jest.mock('socket.io-client', () => ({
    io: jest.fn(() => mockSocket)
}));

jest.mock('../../../src/components/hrai-panel/hrai-panel.jsx', () => props => {
    mockPanelRender(props);
    return null;
});

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

const renderContainer = () => {
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
    const store = configureStore()({
        scratchGui: {
            hraiLesson: {lessonId: null},
            projectState: {projectId: '0'},
            projectTitle: 'Untitled',
            vm: makeVm()
        }
    });
    const view = renderWithIntl(
        <Provider store={store}>
            <HraiPanel />
        </Provider>
    );
    return {store, view, vm: store.getState().scratchGui.vm};
};

const latestPanelProps = () => mockPanelRender.mock.calls.at(-1)[0];

describe('HraiPanel container custom game start', () => {
    beforeEach(() => {
        mockPanelRender.mockClear();
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
});

describe('HraiPanel container agent session', () => {
    beforeEach(() => {
        mockPanelRender.mockClear();
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
