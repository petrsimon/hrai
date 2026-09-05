import React from 'react';
import {Provider} from 'react-redux';
import configureStore from 'redux-mock-store';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import SaveStatus from '../../../src/components/menu-bar/save-status.jsx';
import {fireEvent, screen} from '@testing-library/react';
import {AlertTypes} from '../../../src/lib/alerts/index.jsx';


global.MutationObserver = class {
    disconnect () { }
    observe () { }
};

// Stub the action creators for later testing
jest.mock('../../../src/reducers/project-state', () => ({
    createProject: jest.fn(() => ({type: 'stubbedCreate'})),
    getIsShowingWithoutId: jest.fn(loadingState => loadingState === 'SHOWING_WITHOUT_ID'),
    manualUpdateProject: jest.fn(() => ({type: 'stubbed'}))
}));

const SAVE_NOW_LABEL = 'Unsaved - save now';

describe('SaveStatus container', () => {
    const mockStore = configureStore();

    const storeWith = ({projectChanged, alertsList = [], loadingState = 'SHOWING_WITH_ID'}) => mockStore({
        scratchGui: {
            projectChanged,
            alerts: {alertsList},
            projectState: {loadingState}
        }
    });

    test('if there are inline messages, they are shown instead of save now', () => {
        const store = storeWith({
            projectChanged: true,
            alertsList: [{alertId: 'saveSuccess', alertType: AlertTypes.INLINE}]
        });
        const {container} = renderWithIntl(
            <Provider store={store}>
                <SaveStatus />
            </Provider>
        );

        const inlineMessage = container.querySelector('[aria-label="inline message"]');
        expect(inlineMessage).toBeTruthy();
        const saveNow = screen.queryByText(SAVE_NOW_LABEL);
        expect(saveNow).toBeNull();
    });

    test('save now is shown if there are project changes and no inline messages', () => {
        const store = storeWith({projectChanged: true});
        const {container} = renderWithIntl(
            <Provider store={store}>
                <SaveStatus />
            </Provider>
        );

        const saveNow = screen.getByText(SAVE_NOW_LABEL);
        const inlineMessage = container.querySelector('[aria-label="inline message"]');
        expect(inlineMessage).toBeFalsy();

        // Clicking save now should dispatch the manualUpdateProject action (stubbed above)
        fireEvent.click(saveNow);
        expect(store.getActions()[0].type).toEqual('stubbed');
    });

    test('save now creates the project when it has never been saved', () => {
        const store = storeWith({projectChanged: true, loadingState: 'SHOWING_WITHOUT_ID'});
        renderWithIntl(
            <Provider store={store}>
                <SaveStatus />
            </Provider>
        );

        fireEvent.click(screen.getByText(SAVE_NOW_LABEL));
        expect(store.getActions()[0].type).toEqual('stubbedCreate');
    });

    test('neither is shown if there are no project changes or inline messages', () => {
        const store = storeWith({projectChanged: false});

        const {container} = renderWithIntl(
            <Provider store={store}>
                <SaveStatus />
            </Provider>
        );

        const inlineMessage = container.querySelector('[aria-label="inline message"]');
        expect(inlineMessage).toBeFalsy();
        const saveNow = screen.queryByText(SAVE_NOW_LABEL);
        expect(saveNow).toBeNull();
    });
});
