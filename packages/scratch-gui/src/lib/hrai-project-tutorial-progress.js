import {projectProgressKey} from './hrai-lessons/progress';

const STORAGE_KEY = 'hrai.project-tutorial-progress.v1';

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
        // Storage can be unavailable; the tutorial still works for this connection.
    }
};

export const loadProjectTutorialProgress = (projectId, projectTitle) => {
    const saved = readProgress()[projectProgressKey(projectId, projectTitle)];
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) ||
        !saved.plan || typeof saved.plan !== 'object' || Array.isArray(saved.plan) ||
        !Number.isInteger(saved.stepIndex) || saved.stepIndex < 0) {
        return null;
    }
    return {
        plan: saved.plan,
        stepIndex: saved.stepIndex,
        newProjectStarted: saved.newProjectStarted === true
    };
};

export const saveProjectTutorialProgress = (projectId, progress, projectTitle, newProjectStarted = false) => {
    if (!progress?.plan || typeof progress.plan !== 'object' ||
        !Number.isInteger(progress.stepIndex) || progress.stepIndex < 0) {
        return;
    }
    const saved = readProgress();
    writeProgress({
        ...saved,
        [projectProgressKey(projectId, projectTitle)]: {
            plan: progress.plan,
            stepIndex: progress.stepIndex,
            newProjectStarted
        }
    });
};

export const clearProjectTutorialProgress = (projectId, projectTitle) => {
    const saved = readProgress();
    delete saved[projectProgressKey(projectId, projectTitle)];
    writeProgress(saved);
};
