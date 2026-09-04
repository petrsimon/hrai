import debounce from 'lodash.debounce';
import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {connect} from 'react-redux';
import {io} from 'socket.io-client';
import VM from '@scratch/scratch-vm';

import HraiPanelComponent from '../components/hrai-panel/hrai-panel.jsx';
import log from '../lib/log.js';
import {clearGameProgress, loadGameProgress, saveGamePlaytest, saveGameProgress} from '../lib/hrai-game-progress';
import {loadGameStarter} from '../lib/hrai-game-starter';
import lessons from '../lib/hrai-lessons';
import {loadLessonProgress, saveLessonProgress} from '../lib/hrai-lessons/progress';
import {nextHraiStage} from '../reducers/hrai-lesson';
import {createProject} from '../reducers/project-state';

const HRAI_SERVER_URL = process.env.HRAI_SERVER_URL ||
    (typeof window === 'object' ? window.location.origin : 'http://localhost:8791');
const HELPER_UNAVAILABLE_ID = 'helper-unavailable';

const messages = defineMessages({
    helperUnavailable: {
        id: 'gui.hrai.helperUnavailable',
        defaultMessage: 'Pomocník teď není k dispozici.',
        description: 'calm message shown when the hrai tutor server cannot be reached'
    },
    newProjectConfirmation: {
        id: 'gui.hrai.newProjectConfirmation',
        defaultMessage: 'Tím nahradíš právě otevřený projekt novým. Současný projekt se nejdřív ' +
            'uloží, pokud je potřeba. Pokračovat?',
        description: 'confirmation before replacing the current project with a new custom game project'
    }
});

// Duplicated from hrai-server rather than imported: that package is private
// TypeScript and would force scratch-gui into a build-order dependency.
const buildWorkspacePayload = vm => {
    const targets = vm.runtime.targets.filter(target => target.isOriginal !== false);
    const focusedTarget = vm.editingTarget ||
        targets.find(target => target.isStage);
    return {
        focusedTargetId: focusedTarget ? focusedTarget.id : '',
        targets: targets.map(target => ({
            id: target.id,
            name: target.getName(),
            isStage: target.isStage,
            blocks: target.blocks._blocks,
            variables: target.variables,
            lists: target.lists
        }))
    };
};

const hasMeaningfulWorkspace = vm => vm.runtime.targets.some(target => {
    const blockCount = Object.keys(target.blocks?._blocks || {}).length;
    const variableCount = Object.keys(target.variables || {}).length;
    return blockCount > 0 || variableCount > 0;
}) || vm.runtime.targets.filter(target => !target.isStage).length > 1;

const HraiPanel = ({
    activeLessonId,
    assistantPreferences,
    onCreateProject,
    onNextStage,
    projectId,
    projectTitle,
    vm
}) => {
    const intl = useIntl();
    const [chatMessages, setChatMessages] = useState([]);
    const [isThinking, setIsThinking] = useState(false);
    const [isServerAvailable, setIsServerAvailable] = useState(false);
    const [rung, setRung] = useState(0);
    const [lessonProgress, setLessonProgress] = useState(null);
    const [gamePlan, setGamePlan] = useState(null);
    const [gamePlaytest, setGamePlaytest] = useState(null);
    const [gameProgress, setGameProgress] = useState(null);
    const [isPlanning, setIsPlanning] = useState(false);
    const [isStartingNewProject, setIsStartingNewProject] = useState(false);
    const pendingNewGameIdeaRef = useRef(null);
    const [voiceCapabilities, setVoiceCapabilities] = useState({available: false, languages: []});
    const [voiceTranscript, setVoiceTranscript] = useState(null);
    const [voiceErrorCode, setVoiceErrorCode] = useState(null);
    const activeLesson = lessons.find(lesson => lesson.id === activeLessonId);
    const socketRef = useRef(null);
    const messageIdCounter = useRef(0);
    const vmRef = useRef(vm);

    vmRef.current = vm;

    const emitPendingGamePlan = useCallback(() => {
        const socket = socketRef.current;
        const idea = pendingNewGameIdeaRef.current;
        if (!socket?.connected || !idea) return;
        pendingNewGameIdeaRef.current = null;
        setIsStartingNewProject(false);
        setIsPlanning(true);
        socket.emit('gamePlan', {text: idea});
    }, []);

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
            timeout: 5000
        });
        socketRef.current = socket;

        const markUnavailable = () => {
            setIsServerAvailable(false);
            setIsThinking(false);
            setIsPlanning(false);
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
            setVoiceCapabilities({available: false, languages: []});
            setChatMessages(prev => prev.filter(message => message.id !== HELPER_UNAVAILABLE_ID));
            pushWorkspace();
            if (activeLessonId) {
                const saved = loadLessonProgress(projectId, activeLessonId, projectTitle);
                socket.emit('lessonStart', {
                    lessonId: activeLessonId,
                    stageIndex: saved?.stageIndex || 0
                });
            } else {
                const saved = loadGameProgress(projectId, projectTitle);
                if (saved) socket.emit('gameRestore', saved);
            }
            emitPendingGamePlan();
        });

        socket.on('connect_error', markUnavailable);
        socket.on('disconnect', () => {
            setIsServerAvailable(false);
            setVoiceCapabilities({available: false, languages: []});
            setIsPlanning(false);
        });

        socket.on('voice:capabilities', capabilities => {
            setVoiceCapabilities({
                available: Boolean(capabilities?.available),
                languages: Array.isArray(capabilities?.languages) ? capabilities.languages : []
            });
        });

        socket.on('voice:transcript', transcript => {
            setVoiceTranscript(transcript);
            setVoiceErrorCode(null);
        });

        socket.on('voice:failed', failure => {
            setVoiceErrorCode({
                requestId: failure?.requestId,
                code: failure?.code || 'stt_failed'
            });
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

        socket.on('gamePlanProposed', plan => {
            setGamePlan(plan);
            setGamePlaytest(null);
            setGameProgress(null);
            setIsPlanning(false);
            setIsStartingNewProject(false);
        });

        socket.on('gamePlaytest', playtest => {
            void loadGameStarter(vmRef.current, playtest.starter)
                .then(() => {
                    saveGamePlaytest(projectId, playtest, projectTitle);
                    setGamePlan(null);
                    setGamePlaytest(playtest);
                    setGameProgress(null);
                    setIsPlanning(false);
                    setIsStartingNewProject(false);
                })
                .catch(error => {
                    // A malformed starter must not leave the child believing it is playable.
                    // The server owns the plan; the editor owns loading its block graph.
                    log.error('hrai: failed to load game starter', {error});
                    setIsPlanning(false);
                    setIsStartingNewProject(false);
                });
        });

        socket.on('gameProgress', progress => {
            saveGameProgress(projectId, progress, projectTitle);
            setGamePlan(null);
            setGamePlaytest(null);
            setGameProgress(progress);
            setIsPlanning(false);
            setIsStartingNewProject(false);
        });

        socket.on('gameMilestoneComplete', progress => {
            setGameProgress(progress);
        });

        socket.on('lessonProgress', progress => {
            saveLessonProgress(projectId, progress.lessonId, progress.stageIndex, projectTitle);
            setLessonProgress(progress);
        });

        socket.on('stageComplete', progress => {
            saveLessonProgress(projectId, progress.lessonId, progress.stageIndex, projectTitle);
            setLessonProgress(previous => {
                if (!previous) return previous;
                return {...previous, ...progress, complete: true};
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
            setIsPlanning(false);
            setIsStartingNewProject(false);
        });

        return () => {
            debouncedPushWorkspace.cancel();
            socket.off('connect');
            socket.off('connect_error');
            socket.off('disconnect');
            socket.off('voice:capabilities');
            socket.off('voice:transcript');
            socket.off('voice:failed');
            socket.off('thinking');
            socket.off('token');
            socket.off('blocks');
            socket.off('done');
            socket.off('gamePlanProposed');
            socket.off('gamePlaytest');
            socket.off('gameProgress');
            socket.off('gameMilestoneComplete');
            socket.off('lessonProgress');
            socket.off('stageComplete');
            socket.off('error');
            socket.disconnect();
            socketRef.current = null;
        };
    }, [
        activeLessonId,
        assistantPreferences,
        debouncedPushWorkspace,
        helperUnavailableText,
        emitPendingGamePlan,
        projectId,
        projectTitle,
        pushWorkspace
    ]);

    useEffect(() => {
        setChatMessages([]);
        setRung(0);
        setIsThinking(false);
        setGamePlan(null);
        setGamePlaytest(null);
        setGameProgress(null);
        setIsPlanning(false);
        const saved = activeLessonId ? loadLessonProgress(projectId, activeLessonId, projectTitle) : null;
        setLessonProgress(saved ? {stageIndex: saved.stageIndex, complete: false} : null);
        if (activeLessonId) {
            clearGameProgress(projectId, projectTitle);
        }
        if (activeLessonId && socketRef.current?.connected) {
            socketRef.current.emit('lessonStart', {
                lessonId: activeLessonId,
                stageIndex: saved?.stageIndex || 0
            });
        }
    }, [activeLessonId, projectId, projectTitle]);

    useEffect(() => {
        const onWorkspaceChange = () => {
            debouncedPushWorkspace();
        };

        const onProjectChanged = () => {
            pushWorkspace();
            emitPendingGamePlan();
        };

        vm.addListener('workspaceUpdate', onWorkspaceChange);
        vm.addListener('targetsUpdate', onWorkspaceChange);
        vm.addListener('PROJECT_CHANGED', onProjectChanged);

        return () => {
            vm.removeListener('workspaceUpdate', onWorkspaceChange);
            vm.removeListener('targetsUpdate', onWorkspaceChange);
            vm.removeListener('PROJECT_CHANGED', onProjectChanged);
            debouncedPushWorkspace.cancel();
        };
    }, [emitPendingGamePlan, vm, debouncedPushWorkspace, pushWorkspace]);

    const appendLearnerMessage = useCallback(text => {
        const learnerId = `learner-${messageIdCounter.current += 1}`;
        setChatMessages(prev => [...prev, {
            id: learnerId,
            role: 'learner',
            text
        }]);
    }, []);

    const handleGameIdea = useCallback(text => {
        // The idea is shown in the conversation, but does not reach the tutor before
        // the prototype has been installed and playtested.
        appendLearnerMessage(text);
    }, [appendLearnerMessage]);

    const handleSend = useCallback(text => {
        appendLearnerMessage(text);
        setRung(0);
        if (socketRef.current?.connected) {
            pushWorkspace();
            socketRef.current.emit('ask', {text});
        }
    }, [appendLearnerMessage, pushWorkspace]);

    const handleVoiceSubmit = useCallback(payload => {
        const socket = socketRef.current;
        if (!socket?.connected) {
            return;
        }
        setVoiceTranscript(null);
        setVoiceErrorCode(null);
        socket.emit('voice:submit', {
            ...payload,
            languageHint: intl.locale?.toLowerCase().startsWith('cs') ? 'cs' : 'en'
        }, result => {
            if (!result?.accepted) {
                setVoiceErrorCode({
                    requestId: payload.requestId,
                    code: result?.code || 'invalid_payload'
                });
            }
        });
    }, [intl.locale]);

    const handleGamePlanRequest = useCallback(text => {
        if (socketRef.current?.connected) {
            pendingNewGameIdeaRef.current = null;
            setGamePlan(null);
            setIsPlanning(true);
            socketRef.current.emit('gamePlan', {text});
        }
    }, []);

    const handleStartNewProject = useCallback(text => {
        // eslint-disable-next-line no-alert -- replacing the current project needs explicit confirmation
        if (!window.confirm(intl.formatMessage(messages.newProjectConfirmation))) return;
        clearGameProgress(projectId, projectTitle);
        pendingNewGameIdeaRef.current = text;
        setIsStartingNewProject(true);
        onCreateProject();
    }, [intl, onCreateProject, projectId, projectTitle]);

    const handleGamePlanAccept = useCallback(() => {
        if (socketRef.current?.connected && gamePlan && !isPlanning) {
            setIsPlanning(true);
            socketRef.current.emit('gamePlanAccept');
        }
    }, [gamePlan, isPlanning]);

    const handleGamePlanEdit = useCallback(() => {
        setGamePlan(null);
        setIsPlanning(false);
    }, []);

    const handleGamePlaytestComplete = useCallback(feedback => {
        if (socketRef.current?.connected && gamePlaytest && !isPlanning && feedback) {
            appendLearnerMessage(feedback);
            setIsPlanning(true);
            pushWorkspace();
            socketRef.current.emit('gameGuide', {feedback});
        }
    }, [appendLearnerMessage, gamePlaytest, isPlanning, pushWorkspace]);

    const handleHint = useCallback(() => {
        if (socketRef.current?.connected) {
            pushWorkspace();
            socketRef.current.emit('hint');
        }
    }, [pushWorkspace]);

    const handleNextGameMilestone = useCallback(() => {
        if (socketRef.current?.connected && gameProgress?.complete) {
            socketRef.current.emit('gameMilestoneNext');
        }
    }, [gameProgress]);

    const handleNextStage = useCallback(() => {
        if (socketRef.current?.connected) {
            socketRef.current.emit('lessonNext');
            onNextStage();
        }
    }, [onNextStage]);

    return (
        <HraiPanelComponent
            gamePlan={gamePlan}
            gamePlaytest={gamePlaytest}
            gameProgress={gameProgress}
            hasProjectContent={hasMeaningfulWorkspace(vm)}
            isPlanning={isPlanning}
            isStartingNewProject={isStartingNewProject}
            messages={chatMessages}
            onGamePlanAccept={handleGamePlanAccept}
            onGamePlanEdit={handleGamePlanEdit}
            onGamePlanRequest={handleGamePlanRequest}
            onGamePlaytestComplete={handleGamePlaytestComplete}
            onGameIdea={handleGameIdea}
            onStartNewProject={handleStartNewProject}
            onSend={handleSend}
            onHint={handleHint}
            isThinking={isThinking && isServerAvailable && !isPlanning}
            lesson={activeLesson}
            lessonProgress={lessonProgress}
            onNextGameMilestone={handleNextGameMilestone}
            onNextStage={handleNextStage}
            rung={rung}
            voiceCapabilities={voiceCapabilities}
            voiceTranscript={voiceTranscript}
            voiceErrorCode={voiceErrorCode}
            onVoiceSubmit={handleVoiceSubmit}
        />
    );
};

HraiPanel.propTypes = {
    activeLessonId: PropTypes.string,
    assistantPreferences: PropTypes.object,
    onCreateProject: PropTypes.func.isRequired,
    onNextStage: PropTypes.func.isRequired,
    projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    projectTitle: PropTypes.string,
    vm: PropTypes.instanceOf(VM).isRequired
};

HraiPanel.defaultProps = {
    activeLessonId: null
};

const mapStateToProps = state => ({
    activeLessonId: state.scratchGui.hraiLesson.lessonId,
    projectId: state.scratchGui.projectState.projectId,
    projectTitle: state.scratchGui.projectTitle,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onCreateProject: () => dispatch(createProject()),
    onNextStage: () => dispatch(nextHraiStage())
});

export default connect(mapStateToProps, mapDispatchToProps)(HraiPanel);
