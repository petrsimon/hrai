import React from 'react';
import {screen} from '@testing-library/react';

import HraiPanel from '../../../src/components/hrai-panel/hrai-panel.jsx';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';

describe('HraiPanel lesson guidance', () => {
    beforeAll(() => {
        window.HTMLElement.prototype.scrollIntoView = jest.fn();
    });

    test('shows one concrete action and its completion condition', () => {
        renderWithIntl(
            <HraiPanel
                messages={[]}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
                lesson={{title: 'Bitva vojáků', stages: ['Bojiště', 'Kliknutí']}}
                lessonProgress={{
                    complete: false,
                    stageIndex: 1,
                    stage: {
                        title: 'Rozpoznej kliknutí na vojáka',
                        goal: 'Hra musí poznat kliknutí.',
                        instruction: 'Vyber Modry mec a přidej událost po kliknutí.',
                        success: 'Modrý voják má událost po kliknutí.'
                    }
                }}
            />
        );

        expect(screen.getByText('Rozpoznej kliknutí na vojáka')).toBeTruthy();
        expect(screen.getByText('Teď udělej')).toBeTruthy();
        expect(screen.getByText('Vyber Modry mec a přidej událost po kliknutí.')).toBeTruthy();
        expect(screen.getByText('Hotovo, když')).toBeTruthy();
        expect(screen.getByText('Modrý voják má událost po kliknutí.')).toBeTruthy();
    });
});
