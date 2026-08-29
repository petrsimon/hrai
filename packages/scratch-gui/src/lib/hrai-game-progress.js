import {projectProgressKey} from './hrai-lessons/progress';

const STORAGE_KEY = 'hrai.game-progress.v1';

const readProgress = () => {
    if (typeof window === 'undefined') return {};
    try {
        const progress = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
        return progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : {};
    } catch {
        return {};
    }
};

const writeProgress = progress => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
        // Storage can be unavailable; the custom game still works for this connection.
    }
};

export const loadGameProgress = (projectId, projectTitle) => {
    const saved = readProgress()[projectProgressKey(projectId, projectTitle)];
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) ||
        !saved.plan || typeof saved.plan !== 'object' || Array.isArray(saved.plan) ||
        !Number.isInteger(saved.milestoneIndex) || saved.milestoneIndex < 0) {
        return null;
    }
    return {
        plan: saved.plan,
        milestoneIndex: saved.milestoneIndex,
        ...(saved.phase === 'playtest' ? {phase: 'playtest'} : {}),
        ...(typeof saved.feedback === 'string' ? {feedback: saved.feedback} : {})
    };
};

const save = (projectId, plan, milestoneIndex, projectTitle, phase, feedback) => {
    const progress = readProgress();
    writeProgress({
        ...progress,
        [projectProgressKey(projectId, projectTitle)]: {
            plan,
            milestoneIndex,
            ...(phase ? {phase} : {}),
            ...(feedback ? {feedback} : {})
        }
    });
};

export const saveGamePlaytest = (projectId, gamePlaytest, projectTitle) => {
    if (!gamePlaytest?.plan || typeof gamePlaytest.plan !== 'object') return;
    save(projectId, gamePlaytest.plan, 0, projectTitle, 'playtest');
};

export const saveGameProgress = (projectId, gameProgress, projectTitle) => {
    if (!gameProgress?.plan || typeof gameProgress.plan !== 'object' ||
        !Number.isInteger(gameProgress.milestoneIndex) || gameProgress.milestoneIndex < 0) {
        return;
    }
    save(projectId, gameProgress.plan, gameProgress.milestoneIndex, projectTitle, null, gameProgress.feedback);
};

export const clearGameProgress = (projectId, projectTitle) => {
    const progress = readProgress();
    delete progress[projectProgressKey(projectId, projectTitle)];
    writeProgress(progress);
};
