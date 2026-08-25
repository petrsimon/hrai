import React, {useCallback} from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import VM from '@scratch/scratch-vm';

import HraiLessonsLibraryComponent from '../components/hrai-lessons/hrai-lessons-library.jsx';
import lessons from '../lib/hrai-lessons';
import log from '../lib/log.js';
import {closeHraiLessons} from '../reducers/modals';
import {clearHraiLesson, startHraiLesson} from '../reducers/hrai-lesson';
import {loadSoldierBattleStarter} from '../lib/hrai-lessons/soldier-battle-starter';

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    visible: state.scratchGui.modals.hraiLessons
});

const mapDispatchToProps = dispatch => ({
    onRequestClose: () => dispatch(closeHraiLessons()),
    onResetLesson: () => dispatch(clearHraiLesson()),
    onActivateLesson: lessonId => dispatch(startHraiLesson(lessonId))
});

const HraiLessonsLibrary = ({visible, vm, ...props}) => {
    const {onActivateLesson, onRequestClose, onResetLesson, ...componentProps} = props;
    const handleStartLesson = useCallback(async lessonId => {
        onResetLesson();
        try {
            if (lessonId === '11-soldier-battle') {
                await loadSoldierBattleStarter(vm);
            }
            onActivateLesson(lessonId);
            onRequestClose();
        } catch (error) {
            log.error('hrai: failed to load lesson starter', {lessonId, error});
        }
    }, [onActivateLesson, onRequestClose, onResetLesson, vm]);

    if (!visible) return null;
    return (
        <HraiLessonsLibraryComponent
            lessons={lessons}
            onRequestClose={onRequestClose}
            onStartLesson={handleStartLesson}
            {...componentProps}
        />
    );
};

HraiLessonsLibrary.propTypes = {
    onActivateLesson: PropTypes.func.isRequired,
    onRequestClose: PropTypes.func.isRequired,
    onResetLesson: PropTypes.func.isRequired,
    visible: PropTypes.bool.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default connect(mapStateToProps, mapDispatchToProps)(HraiLessonsLibrary);
