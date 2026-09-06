import {addAgentLogEvents, MAX_RUNS} from '../../../src/lib/hrai-agent-log.js';

const event = (overrides = {}) => ({
    runId: 'run-1',
    command: 'pi',
    seq: 0,
    at: '2026-09-06T15:00:00.000Z',
    kind: 'start',
    text: 'start model=gpt-5.4 prompt=42 chars',
    ...overrides
});

describe('hrai agent log', () => {
    test('gathers one run from its events', () => {
        const runs = addAgentLogEvents([], [
            event(),
            event({seq: 1, kind: 'phase', text: 'message_start'}),
            event({seq: 2, kind: 'delta', text: 'Blue '}),
            event({seq: 3, kind: 'delta', text: 'sky'}),
            event({seq: 4, kind: 'stderr', text: 'pi: warming up'}),
            event({seq: 5, kind: 'end', text: 'exit 0 after 2.9s, 8 chars'})
        ]);

        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({
            command: 'pi',
            reply: 'Blue sky',
            runId: 'run-1',
            summary: 'start model=gpt-5.4 prompt=42 chars'
        });
        expect(runs[0].phases).toEqual([{name: 'message_start', count: 1, at: '2026-09-06T15:00:00.000Z'}]);
        expect(runs[0].problems).toEqual([{text: 'pi: warming up', at: '2026-09-06T15:00:00.000Z'}]);
        expect(runs[0].outcome.text).toBe('exit 0 after 2.9s, 8 chars');
    });

    test('counts a repeated phase instead of listing it again', () => {
        const runs = addAgentLogEvents([], [
            event(),
            ...Array.from({length: 40}, (unused, index) =>
                event({seq: index + 1, kind: 'phase', text: 'message_update'})),
            event({seq: 41, kind: 'phase', text: 'message_end'})
        ]);

        expect(runs[0].phases).toEqual([
            {name: 'message_update', count: 40, at: '2026-09-06T15:00:00.000Z'},
            {name: 'message_end', count: 1, at: '2026-09-06T15:00:00.000Z'}
        ]);
    });

    test('keeps concurrent runs apart and applies events arriving one at a time', () => {
        let runs = addAgentLogEvents([], [event(), event({runId: 'run-2', command: 'codex'})]);
        runs = addAgentLogEvents(runs, [event({runId: 'run-2', seq: 1, kind: 'delta', text: 'from codex'})]);
        runs = addAgentLogEvents(runs, [event({seq: 1, kind: 'delta', text: 'from pi'})]);

        expect(runs.map(run => run.runId)).toEqual(['run-1', 'run-2']);
        expect(runs[0].reply).toBe('from pi');
        expect(runs[1].reply).toBe('from codex');
    });

    test('is still running until an end event arrives', () => {
        const runs = addAgentLogEvents([], [event(), event({seq: 1, kind: 'delta', text: 'Blue'})]);
        expect(runs[0].outcome).toBeNull();
    });

    test('keeps only the most recent runs', () => {
        const runs = addAgentLogEvents([], Array.from({length: MAX_RUNS + 5}, (unused, index) =>
            event({runId: `run-${index}`})));

        expect(runs).toHaveLength(MAX_RUNS);
        expect(runs[0].runId).toBe('run-5');
        expect(runs[MAX_RUNS - 1].runId).toBe(`run-${MAX_RUNS + 4}`);
    });

    test('ignores an event with no run', () => {
        expect(addAgentLogEvents([], [null, {kind: 'delta', text: 'orphan'}])).toEqual([]);
    });
});
