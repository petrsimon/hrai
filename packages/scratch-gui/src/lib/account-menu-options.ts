import PropTypes from 'prop-types';

export interface AccountMenuOptions {
    canHaveSession: boolean;

    canRegister?: boolean;
    canLogin?: boolean;
    canLogout?: boolean;

    avatarUrl?: string;
    myStuffUrl?: string;
    onClickMyStuff?: () => void;
    profileUrl?: string;
    myClassesUrl?: string;
    myClassUrl?: string;
    accountSettingsUrl?: string;
}

export const AccountMenuOptionsPropTypes = PropTypes.shape({
    canHaveSession: PropTypes.bool.isRequired,

    canRegister: PropTypes.bool,
    canLogin: PropTypes.bool,
    canLogout: PropTypes.bool,

    avatarUrl: PropTypes.string,
    myStuffUrl: PropTypes.string,
    onClickMyStuff: PropTypes.func,
    profileUrl: PropTypes.string,
    myClassesUrl: PropTypes.string,
    myClassUrl: PropTypes.string,
    accountSettingsUrl: PropTypes.string
});
