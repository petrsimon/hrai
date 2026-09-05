import classNames from 'classnames';

import {connect} from 'react-redux';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';

import InlineMessages from '../../containers/inline-messages.jsx';

import {
    createProject,
    getIsShowingWithoutId,
    manualUpdateProject
} from '../../reducers/project-state';

import {
    filterInlineAlerts
} from '../../reducers/alerts';

import styles from './save-status.css';

// Wrapper for inline messages in the nav bar, which are all related to saving.
// Show any inline messages if present, else show the unsaved marker and the "Save Now"
// button if the project has changed.
// We decided to not use an inline message for "Save Now" because it is a reflection
// of the project state, rather than an event.
const SaveStatus = ({
    alertsList,
    isShowingWithoutId,
    projectChanged,
    onClickSave,
    onCreateProject,
    className
}) => (
    filterInlineAlerts(alertsList).length > 0 ? (
        <InlineMessages className={styles.alert} />
    ) : projectChanged && (
        <button
            className={classNames(styles.saveNow, className)}
            onClick={isShowingWithoutId ? onCreateProject : onClickSave}
        >
            <span
                aria-hidden
                className={styles.unsavedDot}
            />
            <FormattedMessage
                defaultMessage="Unsaved - save now"
                description="Title bar link for saving now, shown while the project has unsaved changes"
                id="gui.menuBar.saveNowLink"
            />
        </button>
    ));

SaveStatus.propTypes = {
    className: PropTypes.string,
    alertsList: PropTypes.arrayOf(PropTypes.object),
    isShowingWithoutId: PropTypes.bool,
    onClickSave: PropTypes.func,
    onCreateProject: PropTypes.func,
    projectChanged: PropTypes.bool
};

const mapStateToProps = state => ({
    alertsList: state.scratchGui.alerts.alertsList,
    isShowingWithoutId: getIsShowingWithoutId(state.scratchGui.projectState.loadingState),
    projectChanged: state.scratchGui.projectChanged
});

const mapDispatchToProps = dispatch => ({
    onClickSave: () => dispatch(manualUpdateProject()),
    onCreateProject: () => dispatch(createProject())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(SaveStatus);
