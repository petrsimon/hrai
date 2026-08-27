import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
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

    test('starts transcription as soon as recording stops', async () => {
        const onVoiceSubmit = jest.fn();
        const stream = {getTracks: () => [{stop: jest.fn()}]};
        const originalMediaDevices = navigator.mediaDevices;
        const originalMediaRecorder = global.MediaRecorder;
        class FakeMediaRecorder {
            static isTypeSupported = () => false;

            constructor () {
                this.mimeType = 'audio/webm';
                this.state = 'inactive';
            }

            start () {
                this.state = 'recording';
            }

            stop () {
                this.state = 'inactive';
                this.ondataavailable({
                    data: new Blob(['audio'], {type: this.mimeType})
                });
                this.onstop();
            }
        }

        const originalBlobArrayBuffer = Blob.prototype.arrayBuffer;
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: {getUserMedia: jest.fn().mockResolvedValue(stream)}
        });
        Object.defineProperty(Blob.prototype, 'arrayBuffer', {
            configurable: true,
            value: () => Promise.resolve(new ArrayBuffer(1))
        });
        Object.defineProperty(global, 'MediaRecorder', {
            configurable: true,
            value: FakeMediaRecorder
        });

        try {
            const {rerender} = render(
                <IntlProvider
                    locale="cs"
                    messages={{}}
                >
                    <HraiPanel
                        messages={[]}
                        onHint={jest.fn()}
                        onNextStage={jest.fn()}
                        onSend={jest.fn()}
                        onVoiceSubmit={onVoiceSubmit}
                        voiceCapabilities={{available: true, languages: ['cs', 'en']}}
                        voiceTranscript={null}
                        lesson={null}
                        lessonProgress={null}
                    />
                </IntlProvider>
            );

            fireEvent.click(screen.getByRole('button', {name: 'Nahrát hlas'}));
            await waitFor(() => expect(screen.getByRole('button', {
                name: 'Zastavit nahrávání'
            })).toBeTruthy());

            fireEvent.click(screen.getByRole('button', {name: 'Zastavit nahrávání'}));
            expect(screen.getByRole('button', {name: 'Přepisuji nahrávku…'})).toBeTruthy();
            expect(screen.queryByText('Přepisuji nahrávku…')).toBeNull();
            await waitFor(() => expect(onVoiceSubmit).toHaveBeenCalledWith(
                expect.objectContaining({mimeType: 'audio/webm'})
            ));
            const [{requestId}] = onVoiceSubmit.mock.calls[0];
            rerender(
                <IntlProvider
                    locale="cs"
                    messages={{}}
                >
                    <HraiPanel
                        messages={[]}
                        onHint={jest.fn()}
                        onNextStage={jest.fn()}
                        onSend={jest.fn()}
                        onVoiceSubmit={onVoiceSubmit}
                        voiceCapabilities={{available: true, languages: ['cs', 'en']}}
                        voiceTranscript={{requestId, text: 'Přidej zelenou vlajku'}}
                        lesson={null}
                        lessonProgress={null}
                    />
                </IntlProvider>
            );
            await waitFor(() => expect(screen.getByRole('textbox').value).toBe(
                'Přidej zelenou vlajku'
            ));
        } finally {
            Object.defineProperty(navigator, 'mediaDevices', {
                configurable: true,
                value: originalMediaDevices
            });
            Object.defineProperty(Blob.prototype, 'arrayBuffer', {
                configurable: true,
                value: originalBlobArrayBuffer
            });
            Object.defineProperty(global, 'MediaRecorder', {
                configurable: true,
                value: originalMediaRecorder
            });
        }
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
