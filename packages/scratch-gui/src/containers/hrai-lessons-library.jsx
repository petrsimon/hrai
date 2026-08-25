import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import HraiLessonsLibraryComponent from '../components/hrai-lessons/hrai-lessons-library.jsx';
import lessons from '../lib/hrai-lessons';
import {closeHraiLessons} from '../reducers/modals';
import {startHraiLesson} from '../reducers/hrai-lesson';

const mapStateToProps = state => ({
    visible: state.scratchGui.modals.hraiLessons
});

const mapDispatchToProps = dispatch => ({
    onRequestClose: () => dispatch(closeHraiLessons()),
    onStartLesson: lessonId => {
        dispatch(startHraiLesson(lessonId));
        dispatch(closeHraiLessons());
    }
});

const HraiLessonsLibrary = ({visible, ...props}) => {
    if (!visible) return null;
    return (
        <HraiLessonsLibraryComponent
            lessons={lessons}
            {...props}
        />
    );
};

HraiLessonsLibrary.propTypes = {
    visible: PropTypes.bool.isRequired
};

export default connect(mapStateToProps, mapDispatchToProps)(HraiLessonsLibrary);
