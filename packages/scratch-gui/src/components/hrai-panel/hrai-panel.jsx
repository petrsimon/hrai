import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import Input from '../forms/input.jsx';
import Label from '../forms/label.jsx';

import hraiLogo from '../../../static/hrai/hrai-dragon-mark-256.png';
import styles from './hrai-panel.css';

const MAX_HINT_RUNG = 5;
const PANEL_DEFAULT_WIDTH = 256;
const PANEL_MIN_WIDTH = 224;
const PANEL_MAX_WIDTH = 512;
const PANEL_KEYBOARD_STEP = 16;
const BLOCK_SLOT_PLACEHOLDER = '\u25BE';

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
    }
});

const BLOCK_REF_PATTERN = /\bb\d+\b/;
const BLOCK_OPCODE_PATTERN = /\b[a-z]+_[a-z0-9_]+\b/;
const TUTOR_TOKEN_PATTERN = /(\bb\d+\b|\b[a-z]+_[a-z0-9_]+\b)/;

const formatBlockLabel = label => label.replace(/%\d+/g, BLOCK_SLOT_PLACEHOLDER);

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

const HraiPanel = ({
    messages: chatMessages,
    onSend,
    onHint,
    isThinking,
    lesson,
    lessonProgress,
    onNextStage,
    rung,
    onAliasClick
}) => {
    const intl = useIntl();
    const [draft, setDraft] = useState('');
    const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
    const resizeState = useRef(null);
    const messagesEndRef = useRef(null);

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

    const submitDraft = useCallback(() => {
        const trimmed = draft.trim();
        if (!trimmed) {
            return;
        }

        onSend(trimmed);
        setDraft('');
    }, [draft, onSend]);

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
            <div className={styles.hintArea}>
                <Button
                    type="button"
                    className={styles.hintButton}
                    disabled={hintDisabled}
                    title={hintExplanation}
                    onClick={handleHintClick}
                >
                    <FormattedMessage {...messages.hintButton} />
                </Button>
                {hintMaxReached ? (
                    <p className={styles.hintExplanation}>
                        {hintExplanation}
                    </p>
                ) : null}
            </div>
            <form
                className={styles.inputArea}
                onSubmit={handleSubmit}
            >
                <Label
                    above
                    text={intl.formatMessage(messages.inputLabel)}
                >
                    <Input
                        className={styles.messageInput}
                        value={draft}
                        onChange={handleInputChange}
                        onKeyDown={handleInputKeyDown}
                    />
                </Label>
                <Button
                    type="submit"
                    className={styles.sendButton}
                    disabled={!canSend}
                >
                    <FormattedMessage {...messages.sendButton} />
                </Button>
            </form>
        </Box>
    );
};

HraiPanel.propTypes = {
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
    onHint: PropTypes.func.isRequired,
    onNextStage: PropTypes.func.isRequired,
    onSend: PropTypes.func.isRequired,
    rung: PropTypes.number
};

HraiPanel.defaultProps = {
    isThinking: false,
    onAliasClick: null,
    lesson: null,
    lessonProgress: null,
    rung: 0
};

export default HraiPanel;
