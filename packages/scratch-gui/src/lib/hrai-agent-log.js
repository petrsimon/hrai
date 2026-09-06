/**
 * Folds the server's agent log events into the runs the log tab renders.
 *
 * The server sends one event per line of a CLI's output, which is far more than a reader wants:
 * a single answer arrives as hundreds of deltas and repeats one phase name over and over. A run
 * gathers them into the shape a person reads — what was asked, what the model is saying, what the
 * CLI complained about, and how it ended.
 */

const MAX_RUNS = 20;

/** Consecutive identical phases are one step with a count, so a busy stream stays legible. */
const appendPhase = (phases, name, at) => {
    const last = phases[phases.length - 1];
    if (last && last.name === name) {
        return [...phases.slice(0, -1), {...last, count: last.count + 1}];
    }
    return [...phases, {name, count: 1, at}];
};

const emptyRun = event => ({
    runId: event.runId,
    command: event.command,
    startedAt: event.at,
    summary: '',
    phases: [],
    thoughts: [],
    reply: '',
    problems: [],
    outcome: null
});

const applyEvent = (run, event) => {
    switch (event.kind) {
    case 'start':
        return {...run, summary: event.text, startedAt: event.at};
    case 'phase':
        return {...run, phases: appendPhase(run.phases, event.text, event.at)};
    case 'thinking':
        return {...run, thoughts: [...run.thoughts, {text: event.text, at: event.at}]};
    case 'delta':
        // The server sends whole lines, so a reply reads as the model wrote it.
        return {...run, reply: run.reply ? `${run.reply}\n${event.text}` : event.text};
    case 'stderr':
        return {...run, problems: [...run.problems, {text: event.text, at: event.at}]};
    case 'end':
        return {...run, outcome: {text: event.text, at: event.at}};
    default:
        return run;
    }
};

/**
 * Adds events to the runs already gathered.
 * @param {Array} runs Runs so far, newest last.
 * @param {Array} events Events from the server, oldest first.
 * @returns {Array} Runs with the events applied, capped at the most recent few.
 */
const addAgentLogEvents = (runs, events) => {
    const next = events.reduce((gathered, event) => {
        if (!event || typeof event.runId !== 'string') return gathered;

        const index = gathered.findIndex(run => run.runId === event.runId);
        if (index < 0) return [...gathered, applyEvent(emptyRun(event), event)];

        const updated = [...gathered];
        updated[index] = applyEvent(updated[index], event);
        return updated;
    }, runs);

    return next.length > MAX_RUNS ? next.slice(next.length - MAX_RUNS) : next;
};

export {addAgentLogEvents, MAX_RUNS};
