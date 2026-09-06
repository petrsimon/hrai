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

    test.each([
        ['append', 'Build a ', 8, 8, 'maze', 'Build a maze', 12],
        ['insert', 'Build a game', 8, 8, 'maze ', 'Build a maze game', 13],
        ['replace selection', 'Build a racing game', 8, 14, 'maze', 'Build a maze game', 12],
        ['prepend', 'game', 0, 0, 'Maze ', 'Maze game', 5],
        ['replace identical selection', 'Maze game', 0, 4, 'Maze', 'Maze game', 4]
    ])('inserts voice text into the draft: %s', (name, draft, start, end, text, expected, cursor) => {
        const panel = voiceTranscript => (
            <IntlProvider
                locale="cs"
                messages={{}}
            >
                <HraiPanel
                    messages={[]}
                    onHint={jest.fn()}
                    onNextStage={jest.fn()}
                    onSend={jest.fn()}
                    voiceTranscript={voiceTranscript}
                />
            </IntlProvider>
        );
        const {rerender} = render(panel(null));
        const input = screen.getByLabelText('Zpráva pro HRAI');
        fireEvent.change(input, {target: {value: draft}});
        input.focus();
        input.setSelectionRange(start, end);
        input.blur();
        rerender(panel({requestId: 'voice-insert', text}));

        expect(input.value).toBe(expected);
        expect(input.selectionStart).toBe(cursor);
        expect(input.selectionEnd).toBe(cursor);
        expect(document.activeElement).toBe(input);

        rerender(panel({requestId: 'voice-insert', text}));
        expect(input.value).toBe(expected);
    });

    test('appends a transcript dictated while the plan is open', () => {
        const panel = voiceTranscript => (
            <IntlProvider
                locale="cs"
                messages={{}}
            >
                <HraiPanel
                    gamePlan={GAME_PLAN}
                    messages={[]}
                    onHint={jest.fn()}
                    onNextStage={jest.fn()}
                    onSend={jest.fn()}
                    voiceTranscript={voiceTranscript}
                />
            </IntlProvider>
        );
        const {rerender} = render(panel(null));
        expect(screen.queryByLabelText('Zpráva pro HRAI')).toBeNull();
        rerender(panel({requestId: 'voice-on-plan', text: 'Přidej draka'}));

        fireEvent.click(screen.getByRole('tab', {name: 'Hrai'}));
        const input = screen.getByLabelText('Zpráva pro HRAI');
        expect(input.value).toBe('Přidej draka');
        expect(input.selectionStart).toBe('Přidej draka'.length);
        expect(input.selectionEnd).toBe('Přidej draka'.length);
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

    test('shows the animated idea forge beneath the conversation while thinking', () => {
        renderWithIntl(
            <HraiPanel
                isThinking
                messages={[{id: 'idea', role: 'learner', text: 'Hra s drakem.'}]}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );

        const status = screen.getByRole('status');
        expect(status.textContent).toContain('The little dragon is forging ideas and code…');
        expect(status.querySelector('img')).toBeTruthy();
    });

    test('does not send the composer while thinking', () => {
        const onSend = jest.fn();
        renderWithIntl(
            <HraiPanel
                isThinking
                messages={[]}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={onSend}
            />
        );

        const input = screen.getByLabelText('Zpráva pro HRAI');
        fireEvent.change(input, {target: {value: 'Pomoz mi'}});
        fireEvent.keyDown(input, {key: 'Enter', shiftKey: false});
        fireEvent.click(screen.getByRole('button', {name: 'Odeslat'}));

        expect(onSend).not.toHaveBeenCalled();
        expect(screen.getByRole('button', {name: 'Odeslat'}).getAttribute('aria-disabled')).toBe('true');
    });
});

describe('HraiPanel custom game planning', () => {
    beforeAll(() => {
        window.HTMLElement.prototype.scrollIntoView = jest.fn();
    });

    test.each([null, GAME_PLAN])('starts a new idea mid-conversation with plan %p', gamePlan => {
        const onGameIdea = jest.fn();
        const onSend = jest.fn();
        const onGamePlanRequest = jest.fn();
        const onStartNewProject = jest.fn();
        renderWithIntl(
            <HraiPanel
                gamePlan={gamePlan}
                hasProjectContent
                messages={[{id: 'old', role: 'learner', text: 'Moje původní hra.'}]}
                onGameIdea={onGameIdea}
                onGamePlanRequest={onGamePlanRequest}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={onSend}
                onStartNewProject={onStartNewProject}
            />
        );
        fireEvent.click(screen.getByRole('tab', {name: 'Hrai'}));
        const input = screen.getByLabelText('Zpráva pro HRAI');
        fireEvent.change(input, {target: {value: 'Nová závodní hra.'}});
        const button = screen.getByRole('button', {name: 'Nový nápad'});
        fireEvent.click(button);
        expect(button.getAttribute('aria-pressed')).toBe('true');
        expect(input.value).toBe('Nová závodní hra.');
        expect(document.activeElement).toBe(input);
        expect(onGamePlanRequest).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', {name: 'Odeslat'}));
        expect(onGameIdea).toHaveBeenCalledWith('Nová závodní hra.');
        expect(onSend).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', {name: 'Začít nový projekt'}));
        expect(onStartNewProject).toHaveBeenCalledWith('Nová závodní hra.');
        fireEvent.click(screen.getByRole('button', {name: 'Pokračovat v tomto projektu'}));
        expect(onGamePlanRequest).toHaveBeenCalledWith('Nová závodní hra.');
    });

    test('keeps a new idea out of an authored lesson', () => {
        const {unmount} = renderWithIntl(
            <HraiPanel
                lesson={{title: 'Bitva vojáků', stages: ['Bojiště', 'Kliknutí']}}
                lessonProgress={{complete: false, stageIndex: 0, stage: {title: 'Bojiště'}}}
                messages={[]}
                onGameIdea={jest.fn()}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );
        const button = screen.getByRole('button', {name: 'Nový nápad'});
        expect(button.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(button);
        expect(button.getAttribute('aria-pressed')).toBe('false');
        unmount();

        renderWithIntl(
            <HraiPanel
                lesson={null}
                lessonProgress={null}
                messages={[]}
                onGameIdea={jest.fn()}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );
        expect(screen.getByRole('button', {name: 'Nový nápad'}).getAttribute('aria-disabled')).toBe('false');
    });

    test('cancels idea entry without losing the ordinary chat draft', () => {
        const onSend = jest.fn();
        const onGameIdea = jest.fn();
        renderWithIntl(
            <HraiPanel
                messages={[{id: 'old', role: 'learner', text: 'Moje hra.'}]}
                onGameIdea={onGameIdea}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={onSend}
            />
        );
        const button = screen.getByRole('button', {name: 'Nový nápad'});
        fireEvent.click(button);
        fireEvent.change(screen.getByLabelText('Zpráva pro HRAI'), {target: {value: 'Jak dál?'}});
        fireEvent.click(button);
        expect(button.getAttribute('aria-pressed')).toBe('false');
        fireEvent.click(screen.getByRole('button', {name: 'Odeslat'}));
        expect(onSend).toHaveBeenCalledWith('Jak dál?');
        expect(onGameIdea).not.toHaveBeenCalled();
    });

    test('allows a new idea during playtesting without ending the playtest', () => {
        const onGameIdea = jest.fn();
        renderWithIntl(
            <HraiPanel
                gamePlaytest={{plan: GAME_PLAN}}
                messages={[]}
                onGameIdea={onGameIdea}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );
        fireEvent.click(screen.getByRole('tab', {name: 'Hrai'}));
        const input = screen.getByLabelText('Zpráva pro HRAI');
        expect(input.disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', {name: 'Nový nápad'}));
        expect(input.disabled).toBe(false);
        fireEvent.change(input, {target: {value: 'Vesmírná hra.'}});
        fireEvent.click(screen.getByRole('button', {name: 'Odeslat'}));
        expect(onGameIdea).toHaveBeenCalledWith('Vesmírná hra.');
        fireEvent.click(screen.getByRole('tab', {name: 'Plan'}));
        expect(screen.getByText('Teď si hru vyzkoušej')).toBeTruthy();
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
        fireEvent.click(screen.getByRole('tab', {name: 'Hrai'}));
        expect(screen.getByLabelText('Zpráva pro HRAI').disabled).toBe(true);
        fireEvent.click(screen.getByRole('tab', {name: 'Plan'}));
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

    test('keeps the game plan in a separate tab from the Hrai conversation', () => {
        renderWithIntl(
            <HraiPanel
                gamePlan={GAME_PLAN}
                messages={[{id: 'reply', role: 'tutor', text: 'Plán je připravený.'}]}
                onHint={jest.fn()}
                onNextStage={jest.fn()}
                onSend={jest.fn()}
            />
        );

        const hraiTab = screen.getByRole('tab', {name: 'Hrai'});
        const planTab = screen.getByRole('tab', {name: 'Plan'});
        expect(planTab.getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('Dračí bludiště')).toBeTruthy();
        expect(screen.queryByLabelText('Zpráva pro HRAI')).toBeNull();

        fireEvent.click(hraiTab);

        expect(hraiTab.getAttribute('aria-selected')).toBe('true');
        expect(screen.getByText('Plán je připravený.')).toBeTruthy();
        expect(screen.getByLabelText('Zpráva pro HRAI')).toBeTruthy();
        expect(screen.queryByText('Dračí bludiště')).toBeNull();
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
