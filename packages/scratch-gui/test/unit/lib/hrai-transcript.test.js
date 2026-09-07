import {addTranscriptEvents, MAX_RUNS, MAX_TURNS} from '../../../src/lib/hrai-transcript.js';

const turnEvent = (overrides = {}) => ({
    turnId: 't1',
    kind: 'user',
    text: 'Přidej draka',
    ...overrides
});

const runEvent = (overrides = {}) => ({
    runId: 'r1',
    kind: 'run_start',
    purpose: 'plan',
    model: 'openai-codex/gpt-5.4',
    ...overrides
});

describe('hrai transcript', () => {
    test('folds a turn with tool calls and two turn_ends', () => {
        const entries = addTranscriptEvents([], [
            turnEvent(),
            turnEvent({kind: 'thinking_delta', delta: 'Plánuji'}),
            turnEvent({kind: 'thinking_delta', delta: ' pohyb.'}),
            turnEvent({kind: 'assistant_delta', delta: 'Volám nástroj.'}),
            turnEvent({
                kind: 'tool_start',
                callId: 'c1',
                name: 'tell_child',
                args: {text: 'Zkus zelenou vlajku.', blocks: []}
            }),
            turnEvent({kind: 'turn_end', stopReason: 'toolUse', model: 'openai-codex/gpt-5.4'}),
            turnEvent({kind: 'tool_end', callId: 'c1', result: 'shown', isError: false}),
            turnEvent({kind: 'assistant_delta', delta: ' Hotovo.'}),
            turnEvent({
                kind: 'turn_end',
                stopReason: 'stop',
                model: 'openai-codex/gpt-5.4'
            })
        ]);

        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            kind: 'turn',
            turnId: 't1',
            user: 'Přidej draka',
            assistant: 'Volám nástroj. Hotovo.',
            thinking: 'Plánuji pohyb.',
            stopReason: 'stop',
            model: 'openai-codex/gpt-5.4',
            running: false
        });
        expect(entries[0].tools).toEqual([{
            callId: 'c1',
            name: 'tell_child',
            args: {text: 'Zkus zelenou vlajku.', blocks: []},
            result: 'shown',
            isError: false
        }]);
        expect(entries[0].errorMessage).toBeUndefined();
    });

    test('stays running after a turn_end that only yields a tool', () => {
        const entries = addTranscriptEvents([], [
            turnEvent(),
            turnEvent({kind: 'tool_start', callId: 'c1', name: 'palette', args: {}}),
            turnEvent({kind: 'turn_end', stopReason: 'toolUse', model: 'ollama/qwen3:14b'})
        ]);

        expect(entries[0].running).toBe(true);
        expect(entries[0].stopReason).toBe('toolUse');
    });

    test('keeps the last turn_end fields when a turn has several rounds', () => {
        const entries = addTranscriptEvents([], [
            turnEvent(),
            turnEvent({kind: 'turn_end', stopReason: 'toolUse', model: 'first/model'}),
            turnEvent({
                kind: 'turn_end',
                stopReason: 'error',
                model: 'second/model',
                errorMessage: 'provider refused'
            })
        ]);

        expect(entries[0]).toMatchObject({
            stopReason: 'error',
            model: 'second/model',
            errorMessage: 'provider refused',
            running: false
        });
    });

    test('folds a one-shot run including deltas that also carry a turnId', () => {
        const entries = addTranscriptEvents([], [
            runEvent(),
            runEvent({kind: 'thinking_delta', turnId: 'r1:1', delta: 'osnova'}),
            runEvent({kind: 'assistant_delta', turnId: 'r1:1', delta: 'Dračí '}),
            runEvent({kind: 'assistant_delta', turnId: 'r1:1', delta: 'bludiště'}),
            runEvent({kind: 'turn_end', turnId: 'r1:1', stopReason: 'stop'}),
            runEvent({kind: 'run_end', text: 'done in 12.3s, 1520 chars'})
        ]);

        expect(entries).toHaveLength(1);
        expect(entries[0]).toEqual({
            kind: 'run',
            runId: 'r1',
            purpose: 'plan',
            model: 'openai-codex/gpt-5.4',
            reply: 'Dračí bludiště',
            thinking: 'osnova',
            outcome: {text: 'done in 12.3s, 1520 chars'},
            running: false
        });
    });

    test('records a run error on the outcome', () => {
        const entries = addTranscriptEvents([], [
            runEvent(),
            runEvent({kind: 'run_end', text: 'failed in 1.5s', error: 'exited without a reply'})
        ]);

        expect(entries[0].outcome).toEqual({
            text: 'failed in 1.5s',
            error: 'exited without a reply'
        });
        expect(entries[0].running).toBe(false);
    });

    test('keeps a note as its own entry', () => {
        const entries = addTranscriptEvents([], [
            turnEvent(),
            {kind: 'note', text: 'session compacted'},
            runEvent()
        ]);

        expect(entries.map(entry => entry.kind)).toEqual(['turn', 'note', 'run']);
        expect(entries[1]).toEqual({kind: 'note', text: 'session compacted'});
    });

    test('keeps concurrent turns apart and applies events arriving one at a time', () => {
        let entries = addTranscriptEvents([], [
            turnEvent(),
            turnEvent({turnId: 't2', text: 'Druhá otázka'})
        ]);
        entries = addTranscriptEvents(entries, [
            turnEvent({turnId: 't2', kind: 'assistant_delta', delta: 'druhá'})
        ]);
        entries = addTranscriptEvents(entries, [
            turnEvent({kind: 'assistant_delta', delta: 'první'})
        ]);

        expect(entries.map(entry => entry.turnId)).toEqual(['t1', 't2']);
        expect(entries[0].assistant).toBe('první');
        expect(entries[1].assistant).toBe('druhá');
    });

    test('drops the oldest turns and runs once the caps are hit', () => {
        const turnStarts = Array.from({length: MAX_TURNS + 5}, (unused, index) => (
            turnEvent({turnId: `t-${index}`, text: `q${index}`})
        ));
        const runStarts = Array.from({length: MAX_RUNS + 3}, (unused, index) => (
            runEvent({runId: `r-${index}`, purpose: 'title'})
        ));

        const entries = addTranscriptEvents([], [...turnStarts, {kind: 'note', text: 'keep me'}, ...runStarts]);
        const turns = entries.filter(entry => entry.kind === 'turn');
        const runs = entries.filter(entry => entry.kind === 'run');

        expect(turns).toHaveLength(MAX_TURNS);
        expect(turns[0].turnId).toBe('t-5');
        expect(turns[MAX_TURNS - 1].turnId).toBe(`t-${MAX_TURNS + 4}`);
        expect(runs).toHaveLength(MAX_RUNS);
        expect(runs[0].runId).toBe('r-3');
        expect(runs[MAX_RUNS - 1].runId).toBe(`r-${MAX_RUNS + 2}`);
        expect(entries.some(entry => entry.kind === 'note' && entry.text === 'keep me')).toBe(true);
    });

    test('session:history replaces whatever the tab already holds', () => {
        const previous = addTranscriptEvents([], [
            turnEvent({text: 'starý tah'}),
            {kind: 'note', text: 'stará poznámka'}
        ]);
        const entries = addTranscriptEvents([], [
            turnEvent({turnId: 'fresh', text: 'nový tah'}),
            runEvent({runId: 'fresh-run'})
        ]);

        expect(previous).toHaveLength(2);
        expect(entries.map(entry => entry.kind)).toEqual(['turn', 'run']);
        expect(entries[0].user).toBe('nový tah');
        expect(entries[0].turnId).toBe('fresh');
    });

    test('ignores an event that belongs to no turn or run', () => {
        expect(addTranscriptEvents([], [null, {kind: 'assistant_delta', delta: 'orphan'}])).toEqual([]);
    });
});
