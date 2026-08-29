import PropTypes from 'prop-types';
import React from 'react';
import ReactModal from 'react-modal';
import Box from '../box/box.jsx';
import {defineMessages, FormattedMessage, useIntl} from 'react-intl';

import styles from './webgl-modal.css';

const messages = defineMessages({
    label: {
        id: 'gui.webglModal.label',
        defaultMessage: 'Your Browser Does Not Support WebGL',
        description: 'WebGL missing title'
    }
});

const WebGlModal = props => {
    const intl = useIntl();
    return (
        <ReactModal
            isOpen
            className={styles.modalContent}
            contentLabel={intl.formatMessage({...messages.label})}
            overlayClassName={styles.modalOverlay}
            onRequestClose={props.onBack}
        >
            <div dir={props.isRtl ? 'rtl' : 'ltr'}>
                <Box className={styles.illustration} />

                <Box className={styles.body}>
                    <h2>
                        <FormattedMessage {...messages.label} />
                    </h2>
                    <p>
                        { /* eslint-disable @stylistic/max-len */ }
                        <FormattedMessage
                            defaultMessage="Unfortunately it looks like your browser or computer <a>{webGlLink}</a>. This technology is needed for HRAI Studio to run."
                            description="WebGL missing message"
                            id="gui.webglModal.description"
                            values={{
                                webGlLink: (
                                    <FormattedMessage
                                        defaultMessage="does not support WebGL"
                                        description="link part of your browser does not support WebGL message"
                                        id="gui.webglModal.webgllink"
                                    />
                                ),
                                a: webGlLink => (
                                    <a
                                        className={styles.faqLink}
                                        href="https://get.webgl.org/"
                                    >
                                        {webGlLink}
                                    </a>
                                )
                            }}
                        />
                        { /* eslint-enable max-len */ }
                    </p>

                    <Box className={styles.buttonRow}>
                        <button
                            className={styles.backButton}
                            onClick={props.onBack}
                        >
                            <FormattedMessage
                                defaultMessage="Back"
                                description="Label for button go back when browser is unsupported"
                                id="gui.webglModal.back"
                            />
                        </button>

                    </Box>
                    <div className={styles.faqLinkText}>
                        <FormattedMessage
                            defaultMessage="For more information about WebGL, visit the <a>{webglGuideLink}</a>."
                            description="Link to WebGL requirements"
                            id="gui.webglModal.webglGuide"
                            values={{
                                webglGuideLink: (
                                    <FormattedMessage
                                        defaultMessage="WebGL guide"
                                        description="Link text for WebGL requirements"
                                        id="gui.webglModal.webglGuidelinktext"
                                    />
                                ),
                                a: webglGuideLink => (
                                    <a
                                        className={styles.faqLink}
                                        href="https://get.webgl.org/"
                                    >
                                        {webglGuideLink}
                                    </a>
                                )
                            }}
                        />
                    </div>
                </Box>
            </div>
        </ReactModal>
    );
};

WebGlModal.propTypes = {
    isRtl: PropTypes.bool,
    onBack: PropTypes.func.isRequired
};

export default WebGlModal;
