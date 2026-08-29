import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {IntlProvider} from 'react-intl';

import HraiPanel from '../../../src/components/hrai-panel/hrai-panel.jsx';
import {renderWithIntl} from '../../helpers/intl-helpers.jsx';

const GAME_PLAN = {
    title: 'Dračí bludiště',
    originalGoal: 'Drak najde poklad v bludišti.',
    coreLoop: 'Veď draka chodbami k pokladu.',
    milestones: [
        {
            id: 'milestone-1',
            title: 'Pohyb draka',
            outcome: 'Drak se pohybuje šipkami.',
            why: 'Bez pohybu nemůže hledat poklad.',
            concept: 'události',
            doneWhen: 'Každá šipka posune draka správným směrem.'
        },
        {
            id: 'milestone-2',
            title: 'Poklad',
            outcome: 'Drak může najít poklad.',
            why: 'Poklad je cíl hry.',
            concept: 'dotyk',
            doneWhen: 'Dotyk pokladu oznámí výhru.'
        }
    ]
};

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

        const input = screen.getByLabelText('Zpráva pro HRAI');
        expect(screen.getByRole('button', {name: 'Poradit'})).toBeTruthy();
        expect(screen.queryByText('Poradit')).toBeNull();
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
            await waitFor(() => expect(screen.getByLabelText('Zpráva pro HRAI').value).toBe(
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
        expect(screen.queryByText('Navrhni vlastní hru')).toBeNull();
    });
});

describe('HraiPanel custom game planning', () => {
    beforeAll(() => {
        window.HTMLElement.prototype.scrollIntoView = jest.fn();
    });

    test('submits the child game idea', () => {
        const onGamePlanRequest = jest.fn();
        const onSend = jest.fn();
        renderWithIntl(
            <HraiPanel
                messages={[]}
                onGamePlanRequest={onGamePlanRequest}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={onSend}
            />
        );

        fireEvent.change(screen.getByLabelText('Zpráva pro HRAI'), {
            target: {value: '  Drak hledá poklad v bludišti.  '}
        });
        fireEvent.click(screen.getByRole('button', {name: 'Odeslat'}));
        fireEvent.click(screen.getByRole('button', {name: 'Připravit plán hry'}));

        expect(onSend).toHaveBeenCalledWith('Drak hledá poklad v bludišti.');
        expect(onGamePlanRequest).toHaveBeenCalledWith('Drak hledá poklad v bludišti.');
    });

    test('locks the idea while the plan is being prepared', () => {
        const onGamePlanRequest = jest.fn();
        const {rerender} = renderWithIntl(
            <HraiPanel
                messages={[]}
                onGamePlanRequest={onGamePlanRequest}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );

        fireEvent.change(screen.getByLabelText('Zpráva pro HRAI'), {
            target: {value: 'Drak hledá poklad.'}
        });
        fireEvent.click(screen.getByRole('button', {name: 'Odeslat'}));
        fireEvent.click(screen.getByRole('button', {name: 'Připravit plán hry'}));

        rerender(
            <IntlProvider
                locale="cs"
                messages={{}}
            >
                <HraiPanel
                    isPlanning
                    messages={[{id: 'idea', role: 'learner', text: 'Drak hledá poklad.'}]}
                    onGamePlanRequest={onGamePlanRequest}
                    onHint={jest.fn()}
                    onNextStage={jest.fn()}
                    onSend={jest.fn()}
                />
            </IntlProvider>
        );

        expect(screen.getByRole('button', {name: 'Připravit plán hry'}).getAttribute('aria-disabled')).toBe('true');
        expect(screen.getByText('Připravuji malou hratelnou verzi…')).toBeTruthy();
    });

    test('offers a new project when the current project has work', () => {
        const onGamePlanRequest = jest.fn();
        const onStartNewProject = jest.fn();
        renderWithIntl(
            <HraiPanel
                hasProjectContent
                messages={[]}
                onGamePlanRequest={onGamePlanRequest}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
                onStartNewProject={onStartNewProject}
            />
        );

        fireEvent.change(screen.getByLabelText('Zpráva pro HRAI'), {
            target: {value: 'Drak hledá poklad.'}
        });
        fireEvent.click(screen.getByRole('button', {name: 'Odeslat'}));

        expect(screen.getByText(/V tomto projektu už něco máš/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', {name: 'Začít nový projekt'}));
        expect(onStartNewProject).toHaveBeenCalledWith('Drak hledá poklad.');

        fireEvent.click(screen.getByRole('button', {name: 'Pokračovat v tomto projektu'}));
        expect(onGamePlanRequest).toHaveBeenCalledWith('Drak hledá poklad.');
    });

    test('does not restore a pending game idea after an authored lesson', () => {
        const {rerender} = renderWithIntl(
            <HraiPanel
                messages={[]}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );

        fireEvent.change(screen.getByLabelText('Zpráva pro HRAI'), {
            target: {value: 'Drak hledá poklad.'}
        });
        fireEvent.click(screen.getByRole('button', {name: 'Odeslat'}));
        expect(screen.getByRole('button', {name: 'Připravit plán hry'})).toBeTruthy();

        rerender(
            <IntlProvider
                locale="cs"
                messages={{}}
            >
                <HraiPanel
                    lesson={{title: 'Lekce', stages: ['První krok']}}
                    lessonProgress={{complete: false, stageIndex: 0}}
                    messages={[]}
                    onHint={jest.fn()}
                    onNextStage={jest.fn()}
                    onSend={jest.fn()}
                />
            </IntlProvider>
        );
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
                />
            </IntlProvider>
        );

        expect(screen.queryByRole('button', {name: 'Připravit plán hry'})).toBeNull();
    });

    test('shows the generated game for playtesting before guidance', () => {
        const onGamePlaytestComplete = jest.fn();
        renderWithIntl(
            <HraiPanel
                gamePlaytest={{plan: GAME_PLAN, starter: {targets: []}}}
                messages={[]}
                onGamePlaytestComplete={onGamePlaytestComplete}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );

        expect(screen.getByText('Teď si hru vyzkoušej')).toBeTruthy();
        expect(screen.getByText(/Spusť hru zelenou vlajkou/)).toBeTruthy();
        expect(screen.getByLabelText('Zpráva pro HRAI').disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Co chceš po vyzkoušení změnit?'), {
            target: {value: 'Chci, aby drak skákal výš.'}
        });
        fireEvent.click(screen.getByRole('button', {name: 'Začít upravovat s HRAI'}));
        expect(onGamePlaytestComplete).toHaveBeenCalledTimes(1);
    });

    test('shows a proposal and requires explicit acceptance', () => {
        const onGamePlanAccept = jest.fn();
        const onGamePlanEdit = jest.fn();
        renderWithIntl(
            <HraiPanel
                gamePlan={GAME_PLAN}
                messages={[]}
                onGamePlanAccept={onGamePlanAccept}
                onGamePlanEdit={onGamePlanEdit}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );

        expect(screen.getByText('Dračí bludiště')).toBeTruthy();
        expect(screen.getByText('Drak najde poklad v bludišti.')).toBeTruthy();
        expect(screen.getByText('Pohyb draka')).toBeTruthy();
        expect(screen.getByText('Poklad')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', {name: 'Tento plán se mi líbí'}));
        fireEvent.click(screen.getByRole('button', {name: 'Upravit nápad'}));
        expect(onGamePlanAccept).toHaveBeenCalledTimes(1);
        expect(onGamePlanEdit).toHaveBeenCalledTimes(1);
    });

    test('keeps the north star and current milestone visible after acceptance', () => {
        renderWithIntl(
            <HraiPanel
                gameProgress={{
                    plan: GAME_PLAN,
                    milestoneIndex: 0,
                    milestone: GAME_PLAN.milestones[0],
                    complete: false
                }}
                messages={[]}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );

        expect(screen.getByText('Drak najde poklad v bludišti.')).toBeTruthy();
        expect(screen.getByText('Bez pohybu nemůže hledat poklad.')).toBeTruthy();
        expect(screen.getByText('Každá šipka posune draka správným směrem.')).toBeTruthy();
        expect(screen.getByText('1 z 2')).toBeTruthy();
        expect(screen.queryByRole('button', {name: /hotovo/i})).toBeNull();
    });

    test('offers the next milestone only after deterministic completion', () => {
        const onNextGameMilestone = jest.fn();
        renderWithIntl(
            <HraiPanel
                gameProgress={{
                    plan: GAME_PLAN,
                    milestoneIndex: 0,
                    milestone: GAME_PLAN.milestones[0],
                    complete: true
                }}
                messages={[]}
                onHint={jest.fn()}
                onNextGameMilestone={onNextGameMilestone}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );

        expect(screen.getByText('Výborně! Tento milník je hotový.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', {name: 'Další milník'}));
        expect(onNextGameMilestone).toHaveBeenCalledTimes(1);
    });

    test('celebrates the final milestone without offering a nonexistent next step', () => {
        renderWithIntl(
            <HraiPanel
                gameProgress={{
                    plan: GAME_PLAN,
                    milestoneIndex: 1,
                    milestone: GAME_PLAN.milestones[1],
                    complete: true
                }}
                messages={[]}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );

        expect(screen.getByText('Dokončil jsi plán své hry!')).toBeTruthy();
        expect(screen.queryByRole('button', {name: 'Další milník'})).toBeNull();
    });
});
