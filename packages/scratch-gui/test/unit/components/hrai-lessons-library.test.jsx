import React from 'react';
import {fireEvent, screen} from '@testing-library/react';
import configureStore from 'redux-mock-store';
import {Provider} from 'react-redux';

import HraiLessonsLibrary from '../../../src/components/hrai-lessons/hrai-lessons-library.jsx';
import lessons from '../../../src/lib/hrai-lessons';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';

describe('HraiLessonsLibrary', () => {
    test('opens a lesson detail from the lesson list', () => {
        const store = configureStore()({locales: {isRtl: false}});
        const onStartLesson = jest.fn();
        renderWithIntl(
            <Provider store={store}>
                <HraiLessonsLibrary
                    lessons={lessons}
                    onRequestClose={jest.fn()}
                    onStartLesson={onStartLesson}
                />
            </Provider>
        );

        fireEvent.click(screen.getByRole('button', {name: /Bitva vojáků/}));

        expect(screen.getByText('Připrav vojáky s mečem a lukem na bojišti.')).toBeTruthy();
        expect(screen.getByText(/hrai objeví v panelu/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', {name: 'Začít s průvodcem'}));
        expect(onStartLesson).toHaveBeenCalledWith('11-soldier-battle');
    });
});
