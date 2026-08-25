const START_LESSON = 'scratch-gui/hrai-lesson/START_LESSON';
const NEXT_STAGE = 'scratch-gui/hrai-lesson/NEXT_STAGE';
const CLEAR_LESSON = 'scratch-gui/hrai-lesson/CLEAR_LESSON';

const initialState = {
    lessonId: null,
    stageIndex: 0
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case START_LESSON:
        return {
            lessonId: action.lessonId,
            stageIndex: 0
        };
    case NEXT_STAGE:
        return Object.assign({}, state, {
            stageIndex: state.stageIndex + 1
        });
    case CLEAR_LESSON:
        return initialState;
    default:
        return state;
    }
};

const startHraiLesson = lessonId => ({
    type: START_LESSON,
    lessonId
});

const nextHraiStage = () => ({type: NEXT_STAGE});
const clearHraiLesson = () => ({type: CLEAR_LESSON});

export {
    reducer as default,
    initialState as hraiLessonInitialState,
    startHraiLesson,
    nextHraiStage,
    clearHraiLesson
};
