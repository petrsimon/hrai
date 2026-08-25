import debounce from 'lodash.debounce';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {connect} from 'react-redux';
import {io} from 'socket.io-client';
import VM from '@scratch/scratch-vm';

import HraiPanelComponent from '../components/hrai-panel/hrai-panel.jsx';
import lessons from '../lib/hrai-lessons';
import {nextHraiStage} from '../reducers/hrai-lesson';

const HRAI_SERVER_URL = process.env.HRAI_SERVER_URL || 'http://localhost:8791';
const HELPER_UNAVAILABLE_ID = 'helper-unavailable';

const messages = defineMessages({
    helperUnavailable: {
        id: 'gui.hrai.helperUnavailable',
        defaultMessage: 'Pomocník teď není k dispozici.',
        description: 'calm message shown when the hrai tutor server cannot be reached'
    },
    stageComplete: {
        id: 'gui.hrai.stageComplete',
        defaultMessage: 'Skvělá práce! Tento krok je hotový. ' +
            'Až budeš připravený, pokračuj dalším krokem.',
        description: 'message shown when an hrai lesson stage is complete'
    }
});

// Duplicated from hrai-server rather than imported: that package is private
// TypeScript and would force scratch-gui into a build-order dependency.
const buildWorkspacePayload = vm => {
    const focusedTarget = vm.editingTarget ||
        vm.runtime.targets.find(target => target.isStage);
    return {
        focusedTargetId: focusedTarget ? focusedTarget.id : '',
        targets: vm.runtime.targets.map(target => ({
            id: target.id,
            name: target.getName(),
            isStage: target.isStage,
            blocks: target.blocks._blocks,
            variables: target.variables
        }))
    };
};

const HraiPanel = ({activeLessonId, onNextStage, vm}) => {
    const intl = useIntl();
    const [chatMessages, setChatMessages] = useState([]);
    const [isThinking, setIsThinking] = useState(false);
    const [isServerAvailable, setIsServerAvailable] = useState(false);
    const [rung, setRung] = useState(0);
    const [lessonProgress, setLessonProgress] = useState(null);
    const activeLesson = lessons.find(lesson => lesson.id === activeLessonId);
    const socketRef = useRef(null);
    const messageIdCounter = useRef(0);
    const vmRef = useRef(vm);

    vmRef.current = vm;

    const pushWorkspace = useCallback(() => {
        const socket = socketRef.current;
        if (socket?.connected) {
            socket.emit('workspace', buildWorkspacePayload(vmRef.current));
        }
    }, []);

    const debouncedPushWorkspace = useMemo(
        () => debounce(() => pushWorkspace(), 1000),
        [pushWorkspace]
    );

    const helperUnavailableText = intl.formatMessage(messages.helperUnavailable);
    const stageCompleteText = intl.formatMessage(messages.stageComplete);

    useEffect(() => {
        const socket = io(`${HRAI_SERVER_URL}/hrai`, {
            reconnection: false,
            timeout: 5000
        });
        socketRef.current = socket;

        const markUnavailable = () => {
            setIsServerAvailable(false);
            setIsThinking(false);
            setChatMessages(prev => {
                if (prev.some(message => message.id === HELPER_UNAVAILABLE_ID)) {
                    return prev;
                }
                return [{
                    id: HELPER_UNAVAILABLE_ID,
                    role: 'tutor',
                    text: helperUnavailableText
                }, ...prev];
            });
        };

        socket.on('connect', () => {
            setIsServerAvailable(true);
            setChatMessages(prev => prev.filter(message => message.id !== HELPER_UNAVAILABLE_ID));
            pushWorkspace();
            if (activeLessonId) {
                socket.emit('lessonStart', {lessonId: activeLessonId});
            }
        });

        socket.on('connect_error', markUnavailable);
        socket.on('disconnect', () => {
            setIsServerAvailable(false);
        });

        socket.on('thinking', ({thinking}) => {
            setIsThinking(Boolean(thinking));
        });

        socket.on('token', ({id, delta}) => {
            setChatMessages(prev => {
                const existing = prev.find(message => message.id === id);
                if (existing) {
                    return prev.map(message => (
                        message.id === id ?
                            {...message, text: message.text + delta} :
                            message
                    ));
                }
                return [...prev, {id, role: 'tutor', text: delta}];
            });
        });

        socket.on('blocks', ({id, blocks}) => {
            setChatMessages(prev => prev.map(message => (
                message.id === id ?
                    {...message, blocks} :
                    message
            )));
        });

        socket.on('done', ({rung: responseRung}) => {
            setRung(responseRung);
        });

        socket.on('lessonProgress', progress => {
            setLessonProgress(progress);
        });

        socket.on('stageComplete', progress => {
            setLessonProgress(previous => {
                if (!previous) return previous;
                return {...previous, ...progress, complete: true};
            });
            setChatMessages(previous => [...previous, {
                id: `lesson-complete-${progress.stageIndex}`,
                role: 'tutor',
                text: stageCompleteText
            }]);
        });

        socket.on('error', ({message}) => {
            const errorId = `error-${messageIdCounter.current += 1}`;
            setChatMessages(prev => [...prev, {
                id: errorId,
                role: 'tutor',
                text: message
            }]);
            setIsThinking(false);
        });

        return () => {
            debouncedPushWorkspace.cancel();
            socket.off('connect');
            socket.off('connect_error');
            socket.off('disconnect');
            socket.off('thinking');
            socket.off('token');
            socket.off('blocks');
            socket.off('done');
            socket.off('lessonProgress');
            socket.off('stageComplete');
            socket.off('error');
            socket.disconnect();
            socketRef.current = null;
        };
    }, [activeLessonId, debouncedPushWorkspace, helperUnavailableText, pushWorkspace, stageCompleteText]);

    useEffect(() => {
        setLessonProgress(null);
        if (activeLessonId && socketRef.current?.connected) {
            socketRef.current.emit('lessonStart', {lessonId: activeLessonId});
        }
    }, [activeLessonId]);

    useEffect(() => {
        const onWorkspaceChange = () => {
            debouncedPushWorkspace();
        };

        vm.addListener('workspaceUpdate', onWorkspaceChange);
        vm.addListener('targetsUpdate', onWorkspaceChange);

        return () => {
            vm.removeListener('workspaceUpdate', onWorkspaceChange);
            vm.removeListener('targetsUpdate', onWorkspaceChange);
            debouncedPushWorkspace.cancel();
        };
    }, [vm, debouncedPushWorkspace]);

    const handleSend = useCallback(text => {
        const learnerId = `learner-${messageIdCounter.current += 1}`;
        setRung(0);
        setChatMessages(prev => [...prev, {
            id: learnerId,
            role: 'learner',
            text
        }]);
        if (socketRef.current?.connected) {
            socketRef.current.emit('ask', {text});
        }
    }, []);

    const handleHint = useCallback(() => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('hint');
        }
    }, []);

    const handleNextStage = useCallback(() => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('lessonNext');
            onNextStage();
        }
    }, [onNextStage]);

    return (
        <HraiPanelComponent
            messages={chatMessages}
            onSend={handleSend}
            onHint={handleHint}
            isThinking={isThinking && isServerAvailable}
            lesson={activeLesson}
            lessonProgress={lessonProgress}
            onNextStage={handleNextStage}
            rung={rung}
        />
    );
};

HraiPanel.propTypes = {
    activeLessonId: PropTypes.string,
    onNextStage: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

HraiPanel.defaultProps = {
    activeLessonId: null
};

const mapStateToProps = state => ({
    activeLessonId: state.scratchGui.hraiLesson.lessonId,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onNextStage: () => dispatch(nextHraiStage())
});

export default connect(mapStateToProps, mapDispatchToProps)(HraiPanel);
