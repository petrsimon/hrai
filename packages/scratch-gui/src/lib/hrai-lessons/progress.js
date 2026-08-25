const STORAGE_KEY = 'hrai.lesson-progress';

const readProgress = () => {
    if (typeof window === 'undefined') return {};
    try {
        const progress = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
        return progress && typeof progress === 'object' ? progress : {};
    } catch {
        return {};
    }
};

const writeProgress = progress => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
        // Storage can be unavailable in private browsing; the lesson still works live.
    }
};

export const projectProgressKey = (projectId, projectTitle = '') => (
    projectId === null || typeof projectId === 'undefined' ?
        `local:${projectTitle || 'untitled'}` :
        String(projectId)
);

export const loadLessonProgress = (projectId, lessonId, projectTitle) => {
    const progress = readProgress();
    return progress[projectProgressKey(projectId, projectTitle)]?.[lessonId] || null;
};

export const saveLessonProgress = (projectId, lessonId, stageIndex, projectTitle) => {
    const progress = readProgress();
    const key = projectProgressKey(projectId, projectTitle);
    writeProgress({
        ...progress,
        [key]: {
            ...progress[key],
            [lessonId]: {stageIndex}
        }
    });
};
