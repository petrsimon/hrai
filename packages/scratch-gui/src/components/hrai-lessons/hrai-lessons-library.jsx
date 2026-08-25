import PropTypes from 'prop-types';
import React, {useCallback, useState} from 'react';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import Button from '../button/button.jsx';
import Modal from '../../containers/modal.jsx';
import hraiMark from '../../../static/hrai/hrai-dragon-mark-256.png';
import styles from './hrai-lessons-library.css';

const messages = defineMessages({
    title: {
        id: 'gui.hraiLessons.title',
        defaultMessage: 'lekce hrai',
        description: 'title for the hrai lesson library'
    },
    intro: {
        id: 'gui.hraiLessons.intro',
        defaultMessage: 'Vyber si hru a postupně ji vytvoř.',
        description: 'introduction for the hrai lesson library'
    },
    back: {
        id: 'gui.hraiLessons.back',
        defaultMessage: 'Zpět na lekce',
        description: 'button to return to the hrai lesson list'
    },
    stages: {
        id: 'gui.hraiLessons.stages',
        defaultMessage: 'Postup lekce',
        description: 'heading for the hrai lesson stages'
    },
    duration: {
        id: 'gui.hraiLessons.duration',
        defaultMessage: 'Délka: {duration}',
        description: 'duration shown for an hrai lesson'
    },
    concepts: {
        id: 'gui.hraiLessons.concepts',
        defaultMessage: 'Nové věci: {concepts}',
        description: 'concepts shown for an hrai lesson'
    },
    close: {
        id: 'gui.hraiLessons.close',
        defaultMessage: 'Zavřít',
        description: 'button to close the hrai lesson library'
    },
    start: {
        id: 'gui.hraiLessons.start',
        defaultMessage: 'Začít s průvodcem',
        description: 'button to start an hrai lesson with the tutor'
    },
    bundleNote: {
        id: 'gui.hraiLessons.bundleNote',
        defaultMessage: 'Po spuštění se ti hrai objeví v panelu a bude sledovat kroky, které právě tvoříš.',
        description: 'note about the current hrai lesson bundle stage'
    }
});

const HraiLessonsLibrary = ({lessons, onRequestClose, onStartLesson}) => {
    const intl = useIntl();
    const [selectedLessonId, setSelectedLessonId] = useState(null);
    const selectedLesson = lessons.find(lesson => lesson.id === selectedLessonId);
    const handleBack = useCallback(() => setSelectedLessonId(null), []);
    const handleLessonSelect = useCallback(event => {
        setSelectedLessonId(event.currentTarget.dataset.lessonId);
    }, []);
    const handleStartLesson = useCallback(() => {
        if (selectedLesson) {
            onStartLesson(selectedLesson.id);
        }
    }, [onStartLesson, selectedLesson]);

    return (
        <Modal
            fullScreen
            contentLabel={intl.formatMessage(messages.title)}
            id="hraiLessonsLibrary"
            onRequestClose={onRequestClose}
        >
            <main className={styles.content}>
                {selectedLesson ? (
                    <section className={styles.detail}>
                        <button
                            type="button"
                            className={styles.backButton}
                            onClick={handleBack}
                        >
                            ← <FormattedMessage {...messages.back} />
                        </button>
                        <div className={styles.detailHeading}>
                            <img
                                src={hraiMark}
                                alt=""
                            />
                            <div>
                                <h1>{selectedLesson.title}</h1>
                                <p>{selectedLesson.englishTitle}</p>
                            </div>
                        </div>
                        <p className={styles.goal}>{selectedLesson.goal}</p>
                        <p className={styles.meta}>
                            <FormattedMessage
                                {...messages.duration}
                                values={{duration: selectedLesson.duration}}
                            />
                        </p>
                        <p className={styles.meta}>
                            <FormattedMessage
                                {...messages.concepts}
                                values={{concepts: selectedLesson.concepts}}
                            />
                        </p>
                        <h2><FormattedMessage {...messages.stages} /></h2>
                        <ol className={styles.stageList}>
                            {selectedLesson.stages.map(stage => <li key={stage}>{stage}</li>)}
                        </ol>
                        <Button
                            className={styles.startButton}
                            onClick={handleStartLesson}
                        >
                            <FormattedMessage {...messages.start} />
                        </Button>
                        <p className={styles.note}>
                            <FormattedMessage {...messages.bundleNote} />
                        </p>
                    </section>
                ) : (
                    <section>
                        <div className={styles.intro}>
                            <img
                                src={hraiMark}
                                alt=""
                            />
                            <div>
                                <h1><FormattedMessage {...messages.title} /></h1>
                                <p><FormattedMessage {...messages.intro} /></p>
                            </div>
                        </div>
                        <div className={styles.lessonGrid}>
                            {lessons.map(lesson => (
                                <button
                                    type="button"
                                    className={styles.lessonCard}
                                    key={lesson.id}
                                    data-lesson-id={lesson.id}
                                    onClick={handleLessonSelect}
                                >
                                    <img
                                        src={hraiMark}
                                        alt=""
                                    />
                                    <span className={styles.lessonTitle}>{lesson.title}</span>
                                    <span className={styles.lessonEnglish}>{lesson.englishTitle}</span>
                                    <span className={styles.lessonGoal}>{lesson.goal}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}
                <Button
                    className={styles.closeButton}
                    onClick={onRequestClose}
                >
                    <FormattedMessage {...messages.close} />
                </Button>
            </main>
        </Modal>
    );
};

HraiLessonsLibrary.propTypes = {
    lessons: PropTypes.arrayOf(PropTypes.shape({
        concepts: PropTypes.string.isRequired,
        duration: PropTypes.string.isRequired,
        englishTitle: PropTypes.string.isRequired,
        goal: PropTypes.string.isRequired,
        id: PropTypes.string.isRequired,
        stages: PropTypes.arrayOf(PropTypes.string).isRequired,
        title: PropTypes.string.isRequired
    })).isRequired,
    onRequestClose: PropTypes.func.isRequired,
    onStartLesson: PropTypes.func.isRequired
};

export default HraiLessonsLibrary;
