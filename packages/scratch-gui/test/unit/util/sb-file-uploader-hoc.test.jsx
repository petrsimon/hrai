import 'web-audio-test-api';

import React from 'react';
import {fireEvent, screen, waitFor} from '@testing-library/react';
import configureStore from 'redux-mock-store';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';
import {LoadingState} from '../../../src/reducers/project-state';
import VM from '@scratch/scratch-vm';

import SBFileUploaderHOC from '../../../src/lib/sb-file-uploader-hoc.jsx';
import {IntlProvider} from 'react-intl';

describe('SBFileUploaderHOC', () => {
    const mockStore = configureStore();
    let store;
    let vm;

    // Wrap this in a function so it gets test specific states and can be reused.
    const getContainer = function () {
        const Component = () => <div />;
        return SBFileUploaderHOC(Component);
    };

    const unwrappedInstance = () => {
        const WrappedComponent = getContainer();
        // default starting state: looking at a project you created, not logged in
        const wrapper = renderWithIntl(
            <WrappedComponent
                projectChanged
                canSave={false}
                cancelFileUpload={jest.fn()}
                closeFileMenu={jest.fn()}
                requestProjectUpload={jest.fn()}
                userOwnsProject={false}
                vm={vm}
                onLoadingFinished={jest.fn()}
                onLoadingStarted={jest.fn()}
                onUpdateProjectTitle={jest.fn()}
                store={store}
            />
        );
        return wrapper;
    };

    beforeEach(() => {
        vm = new VM();
        store = mockStore({
            scratchGui: {
                projectState: {
                    loadingState: LoadingState.SHOWING_WITHOUT_ID
                },
                vm: {}
            },
            locales: {
                locale: 'en'
            }
        });
    });

    test('if isLoadingUpload becomes true, without fileToUpload set, will call cancelFileUpload', () => {
        const mockedCancelFileUpload = jest.fn();
        const WrappedComponent = getContainer();
        const {rerender} = renderWithIntl(
            <WrappedComponent
                projectChanged
                canSave={false}
                cancelFileUpload={mockedCancelFileUpload}
                closeFileMenu={jest.fn()}
                isLoadingUpload={false}
                requestProjectUpload={jest.fn()}
                store={store}
                userOwnsProject={false}
                vm={vm}
                onLoadingFinished={jest.fn()}
                onLoadingStarted={jest.fn()}
                onUpdateProjectTitle={jest.fn()}
            />
        );
        rerender(
            <IntlProvider
                locale="en"
                messages={{ }}
            >
                <WrappedComponent
                    projectChanged
                    canSave={false}
                    cancelFileUpload={mockedCancelFileUpload}
                    closeFileMenu={jest.fn()}
                    isLoadingUpload
                    requestProjectUpload={jest.fn()}
                    store={store}
                    userOwnsProject={false}
                    vm={vm}
                    onLoadingFinished={jest.fn()}
                    onLoadingStarted={jest.fn()}
                    onUpdateProjectTitle={jest.fn()}
                />
            </IntlProvider>
        );
        expect(mockedCancelFileUpload).toHaveBeenCalled();
    });

    test('loads a shared Scratch URL through the HRAI server before replacing the project', async () => {
        const requestUpload = jest.fn();
        const originalFetch = global.fetch;
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8))
        });
        const Component = ({onStartSelectingScratchProject}) => (
            <button
                type="button"
                onClick={onStartSelectingScratchProject}
            >
                Load Scratch URL
            </button>
        );
        const WrappedComponent = SBFileUploaderHOC(Component);
        const wrapper = renderWithIntl(
            <WrappedComponent
                canSave={false}
                cancelFileUpload={jest.fn()}
                closeFileMenu={jest.fn()}
                isLoadingUpload={false}
                loadingState={LoadingState.SHOWING_WITHOUT_ID}
                projectChanged={false}
                requestProjectUpload={requestUpload}
                store={store}
                userOwnsProject={false}
                vm={{loadProject: jest.fn().mockResolvedValue()}}
                onLoadingFinished={jest.fn()}
                onLoadingStarted={jest.fn()}
                onSetProjectTitle={jest.fn()}
            />
        );

        try {
            fireEvent.click(screen.getByRole('button', {name: 'Load Scratch URL'}));
            fireEvent.change(screen.getByLabelText('Scratch project URL or ID'), {
                target: {value: 'https://scratch.mit.edu/projects/65347738/'}
            });
            fireEvent.click(screen.getByRole('button', {name: 'Load project'}));

            await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/api/scratch/projects/65347738')
            ));
            expect(requestUpload).toHaveBeenCalledWith(LoadingState.SHOWING_WITHOUT_ID);
        } finally {
            wrapper.unmount();
            global.fetch = originalFetch;
        }
    });
});
