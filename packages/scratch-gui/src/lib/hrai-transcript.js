/**
 * Folds the server's transcript events into the entries the Záznam tab renders.
 *
 * Session events group by turnId. One-shot runs group by runId — their deltas and
 * turn_end also carry a turnId, and still belong to the run. Notes stand alone.
 * Entries stay in first-seen order, newest last.
 */

const MAX_TURNS = 50;
const MAX_RUNS = 20;

const emptyTurn = turnId => ({
    kind: 'turn',
    turnId,
    assistant: '',
    thinking: '',
    tools: [],
    running: true
});

const emptyRun = runId => ({
    kind: 'run',
    runId,
    purpose: '',
    model: '',
    reply: '',
    thinking: '',
    running: true
});

const applyTurnEvent = (turn, event) => {
    switch (event.kind) {
    case 'user':
        return {...turn, user: event.text};
    case 'assistant_delta':
        return {...turn, assistant: `${turn.assistant}${event.delta}`};
    case 'thinking_delta':
        return {...turn, thinking: `${turn.thinking}${event.delta}`};
    case 'tool_start':
        return {
            ...turn,
            tools: [...turn.tools, {
                callId: event.callId,
                name: event.name,
                args: event.args
            }]
        };
    case 'tool_end':
        return {
            ...turn,
            tools: turn.tools.map(tool => (
                tool.callId === event.callId ?
                    {...tool, result: event.result, isError: event.isError} :
                    tool
            ))
        };
    case 'turn_end':
        return {
            ...turn,
            stopReason: event.stopReason,
            model: event.model,
            errorMessage: event.errorMessage,
            running: event.stopReason === 'toolUse'
        };
    default:
        return turn;
    }
};

const applyRunEvent = (run, event) => {
    switch (event.kind) {
    case 'run_start':
        return {...run, purpose: event.purpose, model: event.model};
    case 'assistant_delta':
        return {...run, reply: `${run.reply}${event.delta}`};
    case 'thinking_delta':
        return {...run, thinking: `${run.thinking}${event.delta}`};
    case 'run_end':
        return {
            ...run,
            outcome: event.error ?
                {text: event.text, error: event.error} :
                {text: event.text},
            running: false
        };
    default:
        return run;
    }
};

const capEntries = entries => {
    let turns = 0;
    let runs = 0;
    const kept = [];
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry.kind === 'turn') {
            if (turns >= MAX_TURNS) continue;
            turns += 1;
        } else if (entry.kind === 'run') {
            if (runs >= MAX_RUNS) continue;
            runs += 1;
        }
        kept.push(entry);
    }
    return kept.reverse();
};

const findIndex = (entries, kind, idKey, id) => entries.findIndex(
    entry => entry.kind === kind && entry[idKey] === id
);

/**
 * Adds events to the entries already gathered.
 * @param {Array} entries Entries so far, newest last.
 * @param {Array} events Events from the server, oldest first.
 * @returns {Array} Entries with the events applied, capped at the most recent few.
 */
const addTranscriptEvents = (entries, events) => {
    const next = events.reduce((gathered, event) => {
        if (!event || typeof event !== 'object') return gathered;

        if (event.kind === 'note') {
            return [...gathered, {kind: 'note', text: event.text}];
        }

        if (typeof event.runId === 'string') {
            const index = findIndex(gathered, 'run', 'runId', event.runId);
            if (index < 0) {
                return [...gathered, applyRunEvent(emptyRun(event.runId), event)];
            }
            const updated = [...gathered];
            updated[index] = applyRunEvent(updated[index], event);
            return updated;
        }

        if (typeof event.turnId === 'string') {
            const index = findIndex(gathered, 'turn', 'turnId', event.turnId);
            if (index < 0) {
                return [...gathered, applyTurnEvent(emptyTurn(event.turnId), event)];
            }
            const updated = [...gathered];
            updated[index] = applyTurnEvent(updated[index], event);
            return updated;
        }

        return gathered;
    }, entries);

    return capEntries(next);
};

export {
    addTranscriptEvents,
    MAX_RUNS,
    MAX_TURNS
};
