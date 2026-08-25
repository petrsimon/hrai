import debounce from 'lodash.debounce';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {connect} from 'react-redux';
import {io} from 'socket.io-client';
import VM from '@scratch/scratch-vm';

import HraiPanelComponent from '../components/hrai-panel/hrai-panel.jsx';

const HRAI_SERVER_URL = process.env.HRAI_SERVER_URL || 'http://localhost:8791';
const HELPER_UNAVAILABLE_ID = 'helper-unavailable';

const messages = defineMessages({
    helperUnavailable: {
        id: 'gui.hrai.helperUnavailable',
        defaultMessage: 'The helper is not available right now.',
        description: 'calm message shown when the hrai tutor server cannot be reached'
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
            blocks: target.blocks._blocks
        }))
    };
};

const HraiPanel = ({vm}) => {
    const intl = useIntl();
    const [chatMessages, setChatMessages] = useState([]);
    const [isThinking, setIsThinking] = useState(false);
    const [isServerAvailable, setIsServerAvailable] = useState(false);
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
            socket.off('error');
            socket.disconnect();
            socketRef.current = null;
        };
    }, [debouncedPushWorkspace, helperUnavailableText, pushWorkspace]);

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
        setChatMessages(prev => [...prev, {
            id: learnerId,
            role: 'learner',
            text
        }]);
        if (socketRef.current?.connected) {
            socketRef.current.emit('ask', {text});
        }
    }, []);

    return (
        <HraiPanelComponent
            messages={chatMessages}
            onSend={handleSend}
            isThinking={isThinking && isServerAvailable}
        />
    );
};

HraiPanel.propTypes = {
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm
});

export default connect(mapStateToProps)(HraiPanel);
