import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {IntlProvider} from 'react-intl';

import HraiPanel from '../../../src/components/hrai-panel/hrai-panel.jsx';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';

describe('HraiPanel lesson guidance', () => {
    beforeAll(() => {
        window.HTMLElement.prototype.scrollIntoView = jest.fn();
    });

    test('lets the student edit a voice transcript before sending it', () => {
        const onSend = jest.fn();
        render(
            <IntlProvider
                locale="cs"
                messages={{}}
            >
                <HraiPanel
                    messages={[]}
                    onHint={jest.fn()}
                    onNextStage={jest.fn()}
                    onSend={onSend}
                    onVoiceSubmit={jest.fn()}
                    voiceCapabilities={{available: true, languages: ['cs', 'en']}}
                    voiceTranscript={{requestId: 'voice-1', text: 'Přidej zelenou vlajku'}}
                    lesson={null}
                    lessonProgress={null}
                />
            </IntlProvider>
        );

        const input = screen.getByLabelText('Zpráva pro hrai');
        fireEvent.change(input, {target: {value: 'Přidej zelenou vlajku prosím'}});
        fireEvent.click(screen.getByRole('button', {name: 'Odeslat'}));

        expect(onSend).toHaveBeenCalledWith('Přidej zelenou vlajku prosím');
        expect(input.value).toBe('');
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
