import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import Input from '../forms/input.jsx';
import Label from '../forms/label.jsx';

import styles from './hrai-panel.css';

const MAX_HINT_RUNG = 5;
const BLOCK_SLOT_PLACEHOLDER = '\u25BE';

const messages = defineMessages({
    panelLabel: {
        id: 'gui.aria.hraiPanel',
        defaultMessage: 'hrai panel',
        description: 'accessibility label for the hrai tutor chat panel'
    },
    title: {
        id: 'gui.hrai.title',
        defaultMessage: 'hrai',
        description: 'heading for the hrai tutor chat panel'
    },
    messageListLabel: {
        id: 'gui.hrai.messageListLabel',
        defaultMessage: 'Conversation with hrai',
        description: 'accessibility label for the hrai message list'
    },
    inputLabel: {
        id: 'gui.hrai.inputLabel',
        defaultMessage: 'Message to hrai',
        description: 'label for the hrai chat input field'
    },
    sendButton: {
        id: 'gui.hrai.sendButton',
        defaultMessage: 'Send',
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
        defaultMessage: 'hrai is thinking…',
        description: 'quiet indicator shown while hrai is preparing a reply'
    },
    blockReference: {
        id: 'gui.hrai.blockReference',
        defaultMessage: 'Go to block {alias}',
        description: 'accessibility label for a clickable block reference in a tutor message'
    },
    blockOpcode: {
        id: 'gui.hrai.blockOpcode',
        defaultMessage: 'Block {label}, category {category}',
        description: 'accessibility label for a block opcode chip in a tutor message'
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
        label: PropTypes.string.isRequired
    }).isRequired,
    formatBlockOpcode: PropTypes.func.isRequired
};

const renderTutorText = (text, blocks, onAliasClick, formatBlockReference, formatBlockOpcode) => {
    const segments = text.split(TUTOR_TOKEN_PATTERN);

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
    rung,
    onAliasClick
}) => {
    const intl = useIntl();
    const [draft, setDraft] = useState('');
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

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [chatMessages, isThinking]);

    const canSend = draft.trim().length > 0;
    const hintMaxReached = rung >= MAX_HINT_RUNG;
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
        >
            <h2 className={styles.title}>
                <FormattedMessage {...messages.title} />
            </h2>
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
    onSend: PropTypes.func.isRequired,
    rung: PropTypes.number
};

HraiPanel.defaultProps = {
    isThinking: false,
    onAliasClick: null,
    rung: 0
};

export default HraiPanel;
