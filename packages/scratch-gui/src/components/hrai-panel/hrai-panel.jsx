import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';

import hraiLogo from '../../../static/hrai/hrai-dragon-mark-256.png';
import styles from './hrai-panel.css';

const MAX_HINT_RUNG = 5;
const PANEL_DEFAULT_WIDTH = 256;
const PANEL_MIN_WIDTH = 224;
const PANEL_MAX_WIDTH = 512;
const PANEL_KEYBOARD_STEP = 16;
const BLOCK_SLOT_PLACEHOLDER = '\u25BE';
const MAX_VOICE_DURATION_MS = 10_000;
const MAX_GAME_IDEA_LENGTH = 500;
const VOICE_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus'];

const messages = defineMessages({
    panelLabel: {
        id: 'gui.aria.hraiPanel',
        defaultMessage: 'panel hrai',
        description: 'accessibility label for the hrai tutor chat panel'
    },
    title: {
        id: 'gui.hrai.title',
        defaultMessage: 'hrai',
        description: 'heading for the hrai tutor chat panel'
    },
    messageListLabel: {
        id: 'gui.hrai.messageListLabel',
        defaultMessage: 'Konverzace s hrai',
        description: 'accessibility label for the hrai message list'
    },
    inputLabel: {
        id: 'gui.hrai.inputLabel',
        defaultMessage: 'Zpráva pro hrai',
        description: 'label for the hrai chat input field'
    },
    sendButton: {
        id: 'gui.hrai.sendButton',
        defaultMessage: 'Odeslat',
        description: 'button to send a message to hrai'
    },
    hintButton: {
        id: 'gui.hrai.hintButton',
        defaultMessage: 'Poradit',
        description: 'button to ask hrai for a more direct hint'
    },
    hintMaxReached: {
        id: 'gui.hrai.hintMaxReached',
        defaultMessage: 'To je ta nejpřímější rada, jakou ti můžu dát.',
        description: 'explanation shown when the hint button is disabled at the most direct hint level'
    },
    thinking: {
        id: 'gui.hrai.thinking',
        defaultMessage: 'hrai přemýšlí…',
        description: 'quiet indicator shown while hrai is preparing a reply'
    },
    blockReference: {
        id: 'gui.hrai.blockReference',
        defaultMessage: 'Přejít na blok {alias}',
        description: 'accessibility label for a clickable block reference in a tutor message'
    },
    blockOpcode: {
        id: 'gui.hrai.blockOpcode',
        defaultMessage: 'Blok {label}, kategorie {category}',
        description: 'accessibility label for a block opcode chip in a tutor message'
    },
    resizePanel: {
        id: 'gui.aria.resizeHraiPanel',
        defaultMessage: 'Změnit velikost panelu hrai',
        description: 'accessibility label for the hrai panel resize handle'
    },
    currentLesson: {
        id: 'gui.hrai.currentLesson',
        defaultMessage: 'Lekce: {title}',
        description: 'active lesson title in the hrai panel'
    },
    currentStage: {
        id: 'gui.hrai.currentStage',
        defaultMessage: 'Krok {current} z {total}',
        description: 'active lesson stage count in the hrai panel'
    },
    nextStage: {
        id: 'gui.hrai.nextStage',
        defaultMessage: 'Další krok',
        description: 'button to advance to the next hrai lesson stage'
    },
    lessonComplete: {
        id: 'gui.hrai.lessonComplete',
        defaultMessage: 'Výborně! Tento krok je hotový.',
        description: 'completion message for an hrai lesson stage'
    },
    stageAction: {
        id: 'gui.hrai.stageAction',
        defaultMessage: 'Teď udělej',
        description: 'heading for the current concrete lesson action'
    },
    stageSuccess: {
        id: 'gui.hrai.stageSuccess',
        defaultMessage: 'Hotovo, když',
        description: 'heading for the deterministic lesson completion condition'
    },
    voiceStart: {
        id: 'gui.hrai.voiceStart',
        defaultMessage: 'Nahrát hlas',
        description: 'button to start an hrai voice recording'
    },
    voiceStop: {
        id: 'gui.hrai.voiceStop',
        defaultMessage: 'Zastavit nahrávání',
        description: 'button to stop an hrai voice recording'
    },
    voiceTranscribing: {
        id: 'gui.hrai.voiceTranscribing',
        defaultMessage: 'Přepisuji nahrávku…',
        description: 'status shown while hrai transcribes a voice recording'
    },
    voiceUnavailable: {
        id: 'gui.hrai.voiceUnavailable',
        defaultMessage: 'Hlasové zadávání teď není k dispozici.',
        description: 'status shown when local hrai speech recognition is unavailable'
    },
    voicePermissionDenied: {
        id: 'gui.hrai.voicePermissionDenied',
        defaultMessage: 'Povol mikrofon v nastavení prohlížeče, nebo napiš zprávu.',
        description: 'status shown when microphone permission is denied'
    },
    voiceUnsupported: {
        id: 'gui.hrai.voiceUnsupported',
        defaultMessage: 'Tento prohlížeč neumí nahrávat hlas.',
        description: 'status shown when browser recording is unsupported'
    },
    voiceFailed: {
        id: 'gui.hrai.voiceFailed',
        defaultMessage: 'Nahrávku se nepodařilo přepsat. Zkus to znovu, nebo napiš zprávu.',
        description: 'status shown when voice transcription fails'
    },
    gameDesignerTitle: {
        id: 'gui.hrai.gameDesignerTitle',
        defaultMessage: 'Navrhni vlastní hru',
        description: 'heading for the custom game idea form'
    },
    gameIdeaLabel: {
        id: 'gui.hrai.gameIdeaLabel',
        defaultMessage: 'Jakou hru chceš vytvořit?',
        description: 'label for the child game idea field'
    },
    gameIdeaHelp: {
        id: 'gui.hrai.gameIdeaHelp',
        defaultMessage: 'Popiš hrdinu, jeho cíl a co má hráč dělat.',
        description: 'short prompt helping a child describe a game idea'
    },
    gamePlanButton: {
        id: 'gui.hrai.gamePlanButton',
        defaultMessage: 'Navrhnout hru',
        description: 'button that requests a game plan'
    },
    gamePlanning: {
        id: 'gui.hrai.gamePlanning',
        defaultMessage: 'Připravuji malou hratelnou verzi…',
        description: 'status shown while the game plan is generated'
    },
    originalGoal: {
        id: 'gui.hrai.originalGoal',
        defaultMessage: 'Tvůj nápad',
        description: 'heading for the child original game goal'
    },
    coreLoop: {
        id: 'gui.hrai.coreLoop',
        defaultMessage: 'Jak se hra hraje',
        description: 'heading for the proposed playable game loop'
    },
    gameMilestones: {
        id: 'gui.hrai.gameMilestones',
        defaultMessage: 'Cesta ke hře',
        description: 'heading for custom game milestones'
    },
    acceptGamePlan: {
        id: 'gui.hrai.acceptGamePlan',
        defaultMessage: 'Tento plán se mi líbí',
        description: 'button for a child to accept the proposed game plan'
    },
    editGameIdea: {
        id: 'gui.hrai.editGameIdea',
        defaultMessage: 'Upravit nápad',
        description: 'button for returning to the game idea form'
    },
    currentGame: {
        id: 'gui.hrai.currentGame',
        defaultMessage: 'Tvoje hra: {title}',
        description: 'heading for the accepted custom game'
    },
    currentGameMilestone: {
        id: 'gui.hrai.currentGameMilestone',
        defaultMessage: '{current} z {total}',
        description: 'current custom game milestone count'
    },
    milestoneWhy: {
        id: 'gui.hrai.milestoneWhy',
        defaultMessage: 'Proč teď',
        description: 'heading for why a milestone advances the game'
    },
    milestoneConcept: {
        id: 'gui.hrai.milestoneConcept',
        defaultMessage: 'Co si procvičíš',
        description: 'heading for the programming concept in a milestone'
    },
    gameMilestoneComplete: {
        id: 'gui.hrai.gameMilestoneComplete',
        defaultMessage: 'Výborně! Tento milník je hotový.',
        description: 'completion message for a custom game milestone'
    },
    nextGameMilestone: {
        id: 'gui.hrai.nextGameMilestone',
        defaultMessage: 'Další milník',
        description: 'button to advance to the next custom game milestone'
    },
    gamePlanComplete: {
        id: 'gui.hrai.gamePlanComplete',
        defaultMessage: 'Dokončil jsi plán své hry!',
        description: 'completion message for the final custom game milestone'
    }
});

const BLOCK_REF_PATTERN = /\bb\d+\b/;
const BLOCK_OPCODE_PATTERN = /\b[a-z]+_[a-z0-9_]+\b/;
const TUTOR_TOKEN_PATTERN = /(\bb\d+\b|\b[a-z]+_[a-z0-9_]+\b)/;

const formatBlockLabel = label => label.replace(/%\d+/g, BLOCK_SLOT_PLACEHOLDER);
const MICROPHONE_PATH = [
    'M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z',
    'M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21H8v2h8v-2h-3v-3.08A7 7 0 0 0 19 11h-2Z'
].join('');

const MicrophoneIcon = () => (
    <svg
        aria-hidden="true"
        className={styles.voiceIcon}
        viewBox="0 0 24 24"
    >
        <path
            d={MICROPHONE_PATH}
        />
    </svg>
);

const StopIcon = () => (
    <svg
        aria-hidden="true"
        className={styles.voiceIcon}
        viewBox="0 0 24 24"
    >
        <rect
            x="6"
            y="6"
            width="12"
            height="12"
            rx="1"
        />
    </svg>
);

const ProgressIcon = () => (
    <svg
        aria-hidden="true"
        className={`${styles.voiceIcon} ${styles.voiceProgressIcon}`}
        viewBox="0 0 24 24"
    >
        <circle
            className={styles.voiceProgressTrack}
            cx="12"
            cy="12"
            r="8"
        />
        <path d="M12 4a8 8 0 0 1 8 8" />
    </svg>
);

const BlockRef = ({alias, onAliasClick, formatBlockReference}) => {
    const handleClick = useCallback(() => {
        onAliasClick(alias);
    }, [alias, onAliasClick]);

    // Until the panel is wired to the workspace there is nothing to highlight, so the
    // reference reads as plain emphasis rather than a button that does nothing.
    if (!onAliasClick) {
        return <span className={styles.blockRef}>{alias}</span>;
    }

    return (
        <button
            type="button"
            className={styles.blockRef}
            aria-label={formatBlockReference(alias)}
            onClick={handleClick}
        >
            {alias}
        </button>
    );
};

BlockRef.propTypes = {
    alias: PropTypes.string.isRequired,
    formatBlockReference: PropTypes.func.isRequired,
    onAliasClick: PropTypes.func
};

BlockRef.defaultProps = {
    onAliasClick: null
};

const BlockOpcodeChip = ({block, formatBlockOpcode}) => (
    <span
        className={styles.blockChip}
        data-category={block.categoryKey}
        aria-label={formatBlockOpcode(formatBlockLabel(block.label), block.category)}
    >
        <span className={styles.blockChipLabel}>
            {formatBlockLabel(block.label)}
        </span>
        <span className={styles.blockChipCategory}>
            {block.category}
        </span>
    </span>
);

BlockOpcodeChip.propTypes = {
    block: PropTypes.shape({
        category: PropTypes.string.isRequired,
        categoryKey: PropTypes.string,
        label: PropTypes.string.isRequired
    }).isRequired,
    formatBlockOpcode: PropTypes.func.isRequired
};

/*
 * The tutor is asked to name blocks by opcode, and mostly does, but not reliably at
 * every hint level. When it writes the Czech label instead, the server still recognises
 * the block and sends it, so the label is split out here and shown as the same chip. A
 * child should see the coloured block either way.
 */
const splitPattern = blocks => {
    const labels = Object.values(blocks ?? {})
        .map(block => block.plainLabel)
        .filter(Boolean)
        // Longest first, so a label containing a shorter one still matches whole.
        .sort((a, b) => b.length - a.length)
        .map(label => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (labels.length === 0) {
        return TUTOR_TOKEN_PATTERN;
    }
    return new RegExp(`(\\bb\\d+\\b|\\b[a-z]+_[a-z0-9_]+\\b|${labels.join('|')})`, 'i');
};

const renderTutorText = (text, blocks, onAliasClick, formatBlockReference, formatBlockOpcode) => {
    const segments = text.split(splitPattern(blocks));
    const byLabel = new Map(Object.values(blocks ?? {})
        .filter(block => block.plainLabel)
        .map(block => [block.plainLabel.toLowerCase(), block]));

    return segments.map((segment, index) => {
        if (BLOCK_REF_PATTERN.test(segment)) {
            return (
                <BlockRef
                    key={`${segment}-${index}`}
                    alias={segment}
                    onAliasClick={onAliasClick}
                    formatBlockReference={formatBlockReference}
                />
            );
        }

        if (BLOCK_OPCODE_PATTERN.test(segment) && blocks?.[segment]) {
            return (
                <BlockOpcodeChip
                    key={`${segment}-${index}`}
                    block={blocks[segment]}
                    formatBlockOpcode={formatBlockOpcode}
                />
            );
        }

        const namedByLabel = segment && byLabel.get(segment.toLowerCase());
        if (namedByLabel) {
            return (
                <BlockOpcodeChip
                    key={`${segment}-${index}`}
                    block={namedByLabel}
                    formatBlockOpcode={formatBlockOpcode}
                />
            );
        }

        if (!segment) {
            return null;
        }

        return (
            <React.Fragment key={`text-${index}`}>
                {segment}
            </React.Fragment>
        );
    });
};

const HraiMessage = ({message, onAliasClick, formatBlockReference, formatBlockOpcode}) => {
    const isTutor = message.role === 'tutor';

    return (
        <div
            className={isTutor ? styles.messageTutor : styles.messageLearner}
            data-role={message.role}
        >
            <div className={styles.messageBubble}>
                {isTutor ?
                    renderTutorText(
                        message.text,
                        message.blocks,
                        onAliasClick,
                        formatBlockReference,
                        formatBlockOpcode
                    ) :
                    message.text}
            </div>
        </div>
    );
};

HraiMessage.propTypes = {
    formatBlockOpcode: PropTypes.func.isRequired,
    formatBlockReference: PropTypes.func.isRequired,
    message: PropTypes.shape({
        blocks: PropTypes.objectOf(PropTypes.shape({
            category: PropTypes.string.isRequired,
            categoryKey: PropTypes.string,
            label: PropTypes.string.isRequired
        })),
        id: PropTypes.string.isRequired,
        role: PropTypes.oneOf(['tutor', 'learner']).isRequired,
        text: PropTypes.string.isRequired
    }).isRequired,
    onAliasClick: PropTypes.func
};

HraiMessage.defaultProps = {
    onAliasClick: null
};

const milestoneShape = PropTypes.shape({
    concept: PropTypes.string.isRequired,
    doneWhen: PropTypes.string.isRequired,
    id: PropTypes.string.isRequired,
    outcome: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    why: PropTypes.string.isRequired
});

const gamePlanShape = PropTypes.shape({
    coreLoop: PropTypes.string.isRequired,
    milestones: PropTypes.arrayOf(milestoneShape).isRequired,
    originalGoal: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired
});

const GameIdeaCard = ({idea, isPlanning, onIdeaChange, onSubmit}) => {
    const canSubmit = idea.trim().length > 0 && !isPlanning;
    return (
        <section className={styles.gameCard}>
            <h3 className={styles.gameCardTitle}>
                <FormattedMessage {...messages.gameDesignerTitle} />
            </h3>
            <form onSubmit={onSubmit}>
                <label>
                    <strong><FormattedMessage {...messages.gameIdeaLabel} /></strong>
                    <textarea
                        className={styles.gameIdeaInput}
                        disabled={isPlanning}
                        maxLength={MAX_GAME_IDEA_LENGTH}
                        rows="3"
                        value={idea}
                        onChange={onIdeaChange}
                    />
                </label>
                <p className={styles.gameHelp}>
                    <FormattedMessage {...messages.gameIdeaHelp} />
                </p>
                <Button
                    type="submit"
                    className={styles.gamePrimaryButton}
                    aria-disabled={!canSubmit}
                    disabled={!canSubmit}
                >
                    <FormattedMessage {...messages.gamePlanButton} />
                </Button>
                {isPlanning ? (
                    <p
                        className={styles.gamePlanning}
                        aria-live="polite"
                    >
                        <FormattedMessage {...messages.gamePlanning} />
                    </p>
                ) : null}
            </form>
        </section>
    );
};

GameIdeaCard.propTypes = {
    idea: PropTypes.string.isRequired,
    isPlanning: PropTypes.bool.isRequired,
    onIdeaChange: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired
};

const GamePlanCard = ({isAccepting, onAccept, onEdit, plan}) => (
    <section className={styles.gameCard}>
        <h3 className={styles.gameCardTitle}>{plan.title}</h3>
        <strong><FormattedMessage {...messages.originalGoal} /></strong>
        <p>{plan.originalGoal}</p>
        <strong><FormattedMessage {...messages.coreLoop} /></strong>
        <p>{plan.coreLoop}</p>
        <strong><FormattedMessage {...messages.gameMilestones} /></strong>
        <ol className={styles.milestoneList}>
            {plan.milestones.map(milestone => (
                <li key={milestone.id}>
                    <strong>{milestone.title}</strong>
                    <span>{milestone.outcome}</span>
                </li>
            ))}
        </ol>
        <div className={styles.gameActions}>
            <Button
                type="button"
                className={styles.gamePrimaryButton}
                aria-disabled={isAccepting}
                disabled={isAccepting}
                onClick={onAccept}
            >
                <FormattedMessage {...messages.acceptGamePlan} />
            </Button>
            <Button
                type="button"
                className={styles.gameSecondaryButton}
                aria-disabled={isAccepting}
                disabled={isAccepting}
                onClick={onEdit}
            >
                <FormattedMessage {...messages.editGameIdea} />
            </Button>
        </div>
    </section>
);

GamePlanCard.propTypes = {
    isAccepting: PropTypes.bool.isRequired,
    onAccept: PropTypes.func.isRequired,
    onEdit: PropTypes.func.isRequired,
    plan: gamePlanShape.isRequired
};

const GameProgressCard = ({onNext, progress}) => {
    const {complete, milestone, milestoneIndex, plan} = progress;
    const hasNextMilestone = milestoneIndex < plan.milestones.length - 1;
    return (
        <section className={styles.gameCard}>
            <h3 className={styles.gameCardTitle}>
                <FormattedMessage
                    {...messages.currentGame}
                    values={{title: plan.title}}
                />
            </h3>
            <strong><FormattedMessage {...messages.originalGoal} /></strong>
            <p>{plan.originalGoal}</p>
            <span className={styles.milestoneCounter}>
                <FormattedMessage
                    {...messages.currentGameMilestone}
                    values={{current: milestoneIndex + 1, total: plan.milestones.length}}
                />
            </span>
            <h4 className={styles.currentMilestoneTitle}>{milestone.title}</h4>
            <p>{milestone.outcome}</p>
            <div className={styles.milestoneDetail}>
                <strong><FormattedMessage {...messages.milestoneWhy} /></strong>
                <p>{milestone.why}</p>
            </div>
            <div className={styles.milestoneDetail}>
                <strong><FormattedMessage {...messages.milestoneConcept} /></strong>
                <p>{milestone.concept}</p>
            </div>
            <div className={styles.milestoneDone}>
                <strong><FormattedMessage {...messages.stageSuccess} /></strong>
                <p>{milestone.doneWhen}</p>
            </div>
            {complete ? (
                <>
                    <strong>
                        <FormattedMessage
                            {...(hasNextMilestone ? messages.gameMilestoneComplete : messages.gamePlanComplete)}
                        />
                    </strong>
                    {hasNextMilestone ? (
                        <Button
                            type="button"
                            className={styles.nextStageButton}
                            onClick={onNext}
                        >
                            <FormattedMessage {...messages.nextGameMilestone} />
                        </Button>
                    ) : null}
                </>
            ) : null}
            <ol className={styles.milestoneTrail}>
                {plan.milestones.map((item, index) => (
                    <li
                        key={item.id}
                        className={index === milestoneIndex ? styles.milestoneCurrent : null}
                        aria-current={index === milestoneIndex ? 'step' : null}
                    >
                        {item.title}
                    </li>
                ))}
            </ol>
        </section>
    );
};

GameProgressCard.propTypes = {
    onNext: PropTypes.func.isRequired,
    progress: PropTypes.shape({
        complete: PropTypes.bool.isRequired,
        milestone: milestoneShape.isRequired,
        milestoneIndex: PropTypes.number.isRequired,
        plan: gamePlanShape.isRequired
    }).isRequired
};

const HraiPanel = ({
    gamePlan,
    gameProgress,
    isPlanning,
    messages: chatMessages,
    onGamePlanAccept,
    onGamePlanEdit,
    onGamePlanRequest,
    onSend,
    onHint,
    isThinking,
    lesson,
    lessonProgress,
    onNextGameMilestone,
    onNextStage,
    rung,
    onAliasClick,
    onVoiceSubmit,
    voiceCapabilities,
    voiceErrorCode,
    voiceTranscript
}) => {
    const intl = useIntl();
    const [draft, setDraft] = useState('');
    const [gameIdea, setGameIdea] = useState('');
    const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
    const [voicePhase, setVoicePhase] = useState('idle');
    const [voiceRequestId, setVoiceRequestId] = useState(null);
    const [voiceLocalError, setVoiceLocalError] = useState(null);
    const resizeState = useRef(null);
    const messagesEndRef = useRef(null);
    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const appliedVoiceTranscriptRequestIdRef = useRef(null);
    const recordingStartedAtRef = useRef(0);
    const recordingDurationRef = useRef(0);
    const recordingTimerRef = useRef(null);

    const formatBlockReference = useCallback(alias => intl.formatMessage(
        messages.blockReference,
        {alias}
    ), [intl]);

    const formatBlockOpcode = useCallback((label, category) => intl.formatMessage(
        messages.blockOpcode,
        {category, label}
    ), [intl]);

    const handleAliasClick = useCallback(alias => {
        if (onAliasClick) {
            onAliasClick(alias);
        }
    }, [onAliasClick]);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, []);

    const resetVoice = useCallback((clearDraft = false) => {
        if (recordingTimerRef.current) {
            clearTimeout(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        stopStream();
        recorderRef.current = null;
        chunksRef.current = [];
        setVoiceRequestId(null);
        setVoicePhase('idle');
        setVoiceLocalError(null);
        if (clearDraft) {
            setDraft('');
        }
    }, [stopStream]);

    useEffect(() => () => {
        if (recordingTimerRef.current) {
            clearTimeout(recordingTimerRef.current);
        }
        stopStream();
    }, [stopStream]);

    useEffect(() => {
        if (!voiceTranscript ||
            appliedVoiceTranscriptRequestIdRef.current === voiceTranscript.requestId ||
            (voiceRequestId && voiceTranscript.requestId !== voiceRequestId)) {
            return;
        }
        appliedVoiceTranscriptRequestIdRef.current = voiceTranscript.requestId;
        if (!voiceRequestId) {
            setVoiceRequestId(voiceTranscript.requestId);
        }
        setDraft(voiceTranscript.text);
        setVoicePhase('transcript');
        setVoiceLocalError(null);
    }, [voiceRequestId, voiceTranscript]);

    useEffect(() => {
        if (voiceErrorCode && (!voiceErrorCode.requestId || voiceErrorCode.requestId === voiceRequestId)) {
            setVoicePhase('error');
        }
    }, [voiceErrorCode, voiceRequestId]);

    const transcribeRecording = useCallback(async (blob, durationMs) => {
        if (!blob || voicePhase === 'transcribing') {
            return;
        }
        const requestId = `voice-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}`;
        setVoiceRequestId(requestId);
        setVoicePhase('transcribing');
        setVoiceLocalError(null);
        try {
            onVoiceSubmit({
                requestId,
                mimeType: blob.type,
                durationMs,
                audio: await blob.arrayBuffer()
            });
        } catch {
            setVoiceLocalError('recording_failed');
            setVoicePhase('error');
        }
    }, [onVoiceSubmit, voicePhase]);

    const startRecording = useCallback(async () => {
        setVoiceLocalError(null);
        if (!voiceCapabilities.available) {
            setVoiceLocalError('unavailable');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            setVoiceLocalError('unsupported');
            return;
        }

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({audio: true});
        } catch (error) {
            if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
                setVoiceLocalError('permission_denied');
            } else {
                setVoiceLocalError('recording_failed');
            }
            return;
        }

        const mimeType = VOICE_MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type));
        const recorder = mimeType ? new MediaRecorder(stream, {mimeType}) : new MediaRecorder(stream);
        streamRef.current = stream;
        recorderRef.current = recorder;
        chunksRef.current = [];
        recordingStartedAtRef.current = performance.now();
        recorder.ondataavailable = event => {
            if (event.data.size > 0) {
                chunksRef.current.push(event.data);
            }
        };
        recorder.onstop = () => {
            if (recordingTimerRef.current) {
                clearTimeout(recordingTimerRef.current);
                recordingTimerRef.current = null;
            }
            recordingDurationRef.current = Math.max(1, Math.min(
                MAX_VOICE_DURATION_MS,
                Math.round(performance.now() - recordingStartedAtRef.current)
            ));
            const blob = new Blob(chunksRef.current, {type: recorder.mimeType});
            stopStream();
            recorderRef.current = null;
            if (blob.size === 0) {
                setVoiceLocalError('recording_failed');
                setVoicePhase('error');
                return;
            }
            void transcribeRecording(blob, recordingDurationRef.current);
        };
        recorder.start();
        setVoicePhase('recording');
        recordingTimerRef.current = setTimeout(() => {
            if (recorder.state === 'recording') {
                recorder.stop();
            }
        }, MAX_VOICE_DURATION_MS);
    }, [transcribeRecording, voiceCapabilities.available, stopStream]);

    const stopRecording = useCallback(() => {
        if (recordingTimerRef.current) {
            clearTimeout(recordingTimerRef.current);
            recordingTimerRef.current = null;
        }
        if (recorderRef.current?.state === 'recording') {
            recorderRef.current.stop();
        }
    }, []);

    const handleVoiceButton = useCallback(() => {
        if (voicePhase === 'recording') {
            stopRecording();
        } else {
            void startRecording();
        }
    }, [startRecording, stopRecording, voicePhase]);

    const submitDraft = useCallback(() => {
        const trimmed = draft.trim();
        if (!trimmed) {
            return;
        }

        onSend(trimmed);
        setDraft('');
        resetVoice();
    }, [draft, onSend, resetVoice]);

    const handleInputChange = useCallback(event => {
        setDraft(event.target.value);
    }, []);

    const handleInputKeyDown = useCallback(event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submitDraft();
        }
    }, [submitDraft]);

    const handleSubmit = useCallback(event => {
        event.preventDefault();
        submitDraft();
    }, [submitDraft]);

    const handleGameIdeaChange = useCallback(event => {
        setGameIdea(event.target.value);
    }, []);

    const handleGameIdeaSubmit = useCallback(event => {
        event.preventDefault();
        const idea = gameIdea.trim();
        if (idea && !isPlanning) {
            onGamePlanRequest(idea);
        }
    }, [gameIdea, isPlanning, onGamePlanRequest]);

    const handleGamePlanEdit = useCallback(() => {
        setGameIdea(gamePlan?.originalGoal || '');
        onGamePlanEdit();
    }, [gamePlan, onGamePlanEdit]);

    const handleHintClick = useCallback(() => {
        onHint();
    }, [onHint]);

    const handleResizeStart = useCallback(event => {
        if (event.button !== 0) {
            return;
        }
        event.preventDefault();
        resizeState.current = {
            startX: event.clientX,
            startWidth: panelWidth
        };
    }, [panelWidth]);

    const handleResizeMove = useCallback(event => {
        if (!resizeState.current) {
            return;
        }
        const nextWidth = resizeState.current.startWidth -
            (event.clientX - resizeState.current.startX);
        setPanelWidth(Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, nextWidth)));
    }, []);

    const handleResizeEnd = useCallback(() => {
        resizeState.current = null;
    }, []);

    const handleResizeKeyDown = useCallback(event => {
        let delta = 0;
        if (event.key === 'ArrowLeft') {
            delta = PANEL_KEYBOARD_STEP;
        } else if (event.key === 'ArrowRight') {
            delta = -PANEL_KEYBOARD_STEP;
        } else if (event.key === 'Home') {
            event.preventDefault();
            setPanelWidth(PANEL_MIN_WIDTH);
            return;
        } else if (event.key === 'End') {
            event.preventDefault();
            setPanelWidth(PANEL_MAX_WIDTH);
            return;
        }
        if (delta !== 0) {
            event.preventDefault();
            setPanelWidth(width => Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, width + delta)));
        }
    }, []);

    useEffect(() => {
        document.addEventListener('pointermove', handleResizeMove);
        document.addEventListener('pointerup', handleResizeEnd);
        return () => {
            document.removeEventListener('pointermove', handleResizeMove);
            document.removeEventListener('pointerup', handleResizeEnd);
        };
    }, [handleResizeEnd, handleResizeMove]);

    useEffect(() => {
        window.dispatchEvent(new Event('resize'));
    }, [panelWidth]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [chatMessages, isThinking]);

    const canSend = draft.trim().length > 0;
    const hintMaxReached = rung >= MAX_HINT_RUNG;
    const lessonStageIndex = lessonProgress?.stageIndex ?? 0;
    const lessonStage = lesson?.stages[lessonStageIndex];
    const lessonStageDetails = lessonProgress?.stage;
    const lessonStageComplete = Boolean(lessonProgress?.complete);
    const hasNextStage = Boolean(lesson && lessonStageIndex < lesson.stages.length - 1);
    const hintDisabled = isThinking || hintMaxReached;
    const hintExplanation = hintMaxReached ?
        intl.formatMessage(messages.hintMaxReached) :
        null;
    const voiceErrorMessage = {
        unavailable: messages.voiceUnavailable,
        stt_unavailable: messages.voiceUnavailable,
        permission_denied: messages.voicePermissionDenied,
        unsupported: messages.voiceUnsupported,
        recording_failed: messages.voiceFailed,
        invalid_payload: messages.voiceFailed,
        size_limit: messages.voiceFailed,
        duration_limit: messages.voiceFailed,
        unsupported_format: messages.voiceFailed,
        stt_failed: messages.voiceFailed,
        empty_transcript: messages.voiceFailed
    }[voiceLocalError || voiceErrorCode?.code];
    const voiceButtonDisabled = !voiceCapabilities.available || isThinking ||
        voicePhase === 'transcribing';

    return (
        <Box
            className={styles.hraiPanel}
            element="aside"
            role="complementary"
            aria-label={intl.formatMessage(messages.panelLabel)}
            style={{width: `${panelWidth}px`}}
        >
            <div
                className={styles.resizeHandle}
                role="separator"
                tabIndex="0"
                aria-label={intl.formatMessage(messages.resizePanel)}
                aria-orientation="vertical"
                aria-valuemin={PANEL_MIN_WIDTH}
                aria-valuemax={PANEL_MAX_WIDTH}
                aria-valuenow={panelWidth}
                onPointerDown={handleResizeStart}
                onKeyDown={handleResizeKeyDown}
            />
            <h2 className={styles.title}>
                <img
                    className={styles.logo}
                    src={hraiLogo}
                    alt=""
                    draggable={false}
                />
                <FormattedMessage {...messages.title} />
            </h2>
            {lesson && lessonStage ? (
                <section className={styles.lessonCard}>
                    <strong>
                        <FormattedMessage
                            {...messages.currentLesson}
                            values={{title: lesson.title}}
                        />
                    </strong>
                    <span>
                        <FormattedMessage
                            {...messages.currentStage}
                            values={{
                                current: lessonStageIndex + 1,
                                total: lesson.stages.length
                            }}
                        />
                    </span>
                    {lessonStageDetails?.title ? (
                        <h3 className={styles.lessonStageTitle}>{lessonStageDetails.title}</h3>
                    ) : null}
                    <p>{lessonStageDetails?.goal || lessonStage}</p>
                    {lessonStageDetails?.instruction ? (
                        <div className={styles.lessonInstruction}>
                            <strong><FormattedMessage {...messages.stageAction} /></strong>
                            <p>{lessonStageDetails.instruction}</p>
                        </div>
                    ) : null}
                    {lessonStageDetails?.success ? (
                        <div className={styles.lessonSuccess}>
                            <strong><FormattedMessage {...messages.stageSuccess} /></strong>
                            <p>{lessonStageDetails.success}</p>
                        </div>
                    ) : null}
                    {lessonStageComplete ? (
                        <>
                            <strong><FormattedMessage {...messages.lessonComplete} /></strong>
                            {hasNextStage ? (
                                <Button
                                    type="button"
                                    className={styles.nextStageButton}
                                    onClick={onNextStage}
                                >
                                    <FormattedMessage {...messages.nextStage} />
                                </Button>
                            ) : null}
                        </>
                    ) : null}
                </section>
            ) : null}
            {lesson ? null : (
                gameProgress ? (
                    <GameProgressCard
                        progress={gameProgress}
                        onNext={onNextGameMilestone}
                    />
                ) : gamePlan ? (
                    <GamePlanCard
                        isAccepting={isPlanning}
                        plan={gamePlan}
                        onAccept={onGamePlanAccept}
                        onEdit={handleGamePlanEdit}
                    />
                ) : (
                    <GameIdeaCard
                        idea={gameIdea}
                        isPlanning={isPlanning}
                        onIdeaChange={handleGameIdeaChange}
                        onSubmit={handleGameIdeaSubmit}
                    />
                )
            )}
            <div
                className={styles.messageList}
                aria-label={intl.formatMessage(messages.messageListLabel)}
                aria-live="polite"
                role="log"
            >
                {chatMessages.map(message => (
                    <HraiMessage
                        key={message.id}
                        message={message}
                        onAliasClick={handleAliasClick}
                        formatBlockReference={formatBlockReference}
                        formatBlockOpcode={formatBlockOpcode}
                    />
                ))}
                {isThinking ? (
                    <p
                        className={styles.thinking}
                        aria-live="polite"
                    >
                        <FormattedMessage {...messages.thinking} />
                    </p>
                ) : null}
                <div ref={messagesEndRef} />
            </div>
            <form
                className={styles.inputArea}
                onSubmit={handleSubmit}
            >
                <textarea
                    className={styles.messageInput}
                    aria-label={intl.formatMessage(messages.inputLabel)}
                    rows="3"
                    value={draft}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                />
                <div className={styles.composerControls}>
                    <Button
                        type="button"
                        className={styles.voiceButton}
                        aria-label={intl.formatMessage(
                            voicePhase === 'recording' ? messages.voiceStop :
                                voicePhase === 'transcribing' ? messages.voiceTranscribing :
                                    messages.voiceStart
                        )}
                        title={intl.formatMessage(
                            voicePhase === 'transcribing' ? messages.voiceTranscribing :
                                voicePhase === 'recording' ? messages.voiceStop : messages.voiceStart
                        )}
                        disabled={voiceButtonDisabled}
                        onClick={handleVoiceButton}
                    >
                        {voicePhase === 'recording' ? <StopIcon /> :
                            voicePhase === 'transcribing' ? <ProgressIcon /> : <MicrophoneIcon />}
                    </Button>
                    <Button
                        type="submit"
                        className={styles.sendButton}
                        aria-label={intl.formatMessage(messages.sendButton)}
                        title={intl.formatMessage(messages.sendButton)}
                        disabled={!canSend}
                    >
                        <span aria-hidden="true">↑</span>
                    </Button>
                </div>
                {voiceErrorMessage ? (
                    <p
                        className={styles.voiceError}
                        role="alert"
                    >
                        <FormattedMessage {...voiceErrorMessage} />
                    </p>
                ) : null}
                {!voiceCapabilities.available && !voiceErrorMessage ? (
                    <p className={styles.voiceStatus}>
                        <FormattedMessage {...messages.voiceUnavailable} />
                    </p>
                ) : null}
            </form>
            <div className={styles.hintArea}>
                <Button
                    type="button"
                    className={styles.hintButton}
                    disabled={hintDisabled}
                    aria-label={intl.formatMessage(messages.hintButton)}
                    title={hintExplanation || intl.formatMessage(messages.hintButton)}
                    onClick={handleHintClick}
                >
                    <span aria-hidden="true">🙏</span>
                </Button>
                {hintMaxReached ? (
                    <p className={styles.hintExplanation}>
                        {hintExplanation}
                    </p>
                ) : null}
            </div>
        </Box>
    );
};

HraiPanel.propTypes = {
    gamePlan: gamePlanShape,
    gameProgress: PropTypes.shape({
        complete: PropTypes.bool.isRequired,
        milestone: milestoneShape.isRequired,
        milestoneIndex: PropTypes.number.isRequired,
        plan: gamePlanShape.isRequired
    }),
    isPlanning: PropTypes.bool,
    isThinking: PropTypes.bool,
    lesson: PropTypes.shape({
        stages: PropTypes.arrayOf(PropTypes.string).isRequired,
        title: PropTypes.string.isRequired
    }),
    lessonProgress: PropTypes.shape({
        complete: PropTypes.bool.isRequired,
        stage: PropTypes.shape({
            goal: PropTypes.string.isRequired,
            instruction: PropTypes.string.isRequired,
            success: PropTypes.string.isRequired,
            title: PropTypes.string.isRequired
        }),
        stageIndex: PropTypes.number.isRequired
    }),
    messages: PropTypes.arrayOf(PropTypes.shape({
        blocks: PropTypes.objectOf(PropTypes.shape({
            category: PropTypes.string.isRequired,
            label: PropTypes.string.isRequired
        })),
        id: PropTypes.string.isRequired,
        role: PropTypes.oneOf(['tutor', 'learner']).isRequired,
        text: PropTypes.string.isRequired
    })).isRequired,
    onAliasClick: PropTypes.func,
    onGamePlanAccept: PropTypes.func,
    onGamePlanEdit: PropTypes.func,
    onGamePlanRequest: PropTypes.func,
    onHint: PropTypes.func.isRequired,
    onNextGameMilestone: PropTypes.func,
    onNextStage: PropTypes.func.isRequired,
    onSend: PropTypes.func.isRequired,
    onVoiceSubmit: PropTypes.func,
    rung: PropTypes.number,
    voiceCapabilities: PropTypes.shape({
        available: PropTypes.bool,
        languages: PropTypes.arrayOf(PropTypes.string)
    }),
    voiceErrorCode: PropTypes.shape({
        code: PropTypes.string.isRequired,
        requestId: PropTypes.string
    }),
    voiceTranscript: PropTypes.shape({
        language: PropTypes.string,
        requestId: PropTypes.string,
        text: PropTypes.string
    })
};

HraiPanel.defaultProps = {
    gamePlan: null,
    gameProgress: null,
    isPlanning: false,
    isThinking: false,
    onAliasClick: null,
    lesson: null,
    lessonProgress: null,
    onGamePlanAccept: () => {},
    onGamePlanEdit: () => {},
    onGamePlanRequest: () => {},
    onNextGameMilestone: () => {},
    onVoiceSubmit: () => {},
    rung: 0,
    voiceCapabilities: {available: false, languages: []},
    voiceErrorCode: null,
    voiceTranscript: null
};

export default HraiPanel;
