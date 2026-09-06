/* eslint-disable react/jsx-no-bind, react/jsx-max-props-per-line, no-undefined, no-negated-condition, @stylistic/max-len, @stylistic/arrow-parens */
import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, FormattedMessage, IntlProvider, useIntl} from 'react-intl';
import editorMessages from 'scratch-l10n/locales/editor-msgs';
import {detectLocale} from './detect-locale';
import {forLocale as localMessagesForLocale} from './local-messages';

const messages = defineMessages({
    accountDialog: {id: 'gui.hrai.accountDialog', defaultMessage: 'HRAI account', description: 'HRAI account dialog label'},
    answerLength: {id: 'gui.hrai.answerLength', defaultMessage: 'Answer length', description: 'assistant preference label'},
    balanced: {id: 'gui.hrai.balanced', defaultMessage: 'Balanced', description: 'assistant verbosity option'},
    cancel: {id: 'gui.hrai.cancel', defaultMessage: 'Cancel', description: 'account form cancel button'},
    close: {id: 'gui.hrai.close', defaultMessage: 'Close', description: 'settings close button'},
    concise: {id: 'gui.hrai.concise', defaultMessage: 'Concise', description: 'assistant verbosity option'},
    createProfile: {id: 'gui.hrai.createProfile', defaultMessage: 'Create HRAI profile', description: 'account form heading'},
    createProfileButton: {id: 'gui.hrai.createProfileButton', defaultMessage: 'Create profile', description: 'account form submit button'},
    createProfileLink: {id: 'gui.hrai.createProfileLink', defaultMessage: 'Create a profile', description: 'account form mode switch'},
    detailed: {id: 'gui.hrai.detailed', defaultMessage: 'Detailed', description: 'assistant verbosity option'},
    displayName: {id: 'gui.hrai.displayName', defaultMessage: 'Display name', description: 'profile display name field'},
    encouragement: {id: 'gui.hrai.encouragement', defaultMessage: 'Encourage real progress', description: 'assistant preference checkbox'},
    patient: {id: 'gui.hrai.patient', defaultMessage: 'Patient teacher', description: 'assistant persona option'},
    persona: {id: 'gui.hrai.persona', defaultMessage: 'Persona', description: 'assistant preference label'},
    projects: {id: 'gui.hrai.projects', defaultMessage: 'My projects', description: 'saved project list heading'},
    noProjects: {id: 'gui.hrai.noProjects', defaultMessage: 'No saved projects yet.', description: 'empty saved project list'},
    provider: {id: 'gui.hrai.provider', defaultMessage: 'Provider', description: 'assistant model provider label'},
    serverDefault: {id: 'gui.hrai.serverDefault', defaultMessage: 'Server default', description: 'server default model provider option'},
    saveSettings: {id: 'gui.hrai.saveSettings', defaultMessage: 'Save settings', description: 'assistant settings submit button'},
    saved: {id: 'gui.hrai.saved', defaultMessage: 'Saved.', description: 'assistant settings success message'},
    signIn: {id: 'gui.hrai.signIn', defaultMessage: 'Sign in to HRAI', description: 'account form heading'},
    signInButton: {id: 'gui.hrai.signInButton', defaultMessage: 'Sign in', description: 'account form submit button'},
    switchToLogin: {id: 'gui.hrai.switchToLogin', defaultMessage: 'I already have a profile', description: 'account form mode switch'},
    assistantName: {id: 'gui.hrai.assistantName', defaultMessage: 'Assistant name', description: 'assistant preference label'},
    model: {id: 'gui.hrai.model', defaultMessage: 'Model', description: 'assistant model label'},
    backendDefault: {id: 'gui.hrai.backendDefault', defaultMessage: 'Backend default', description: 'backend default model option'},
    thinkingLevel: {id: 'gui.hrai.thinkingLevel', defaultMessage: 'Thinking', description: 'assistant thinking-level preference label'},
    thinkingDefault: {id: 'gui.hrai.thinkingDefault', defaultMessage: 'Default', description: 'use the server default thinking level'},
    thinkingOff: {id: 'gui.hrai.thinkingOff', defaultMessage: 'Off', description: 'disable model thinking'},
    thinkingMinimal: {id: 'gui.hrai.thinkingMinimal', defaultMessage: 'minimal', description: 'minimal thinking level'},
    thinkingLow: {id: 'gui.hrai.thinkingLow', defaultMessage: 'low', description: 'low thinking level'},
    thinkingMedium: {id: 'gui.hrai.thinkingMedium', defaultMessage: 'medium', description: 'medium thinking level'},
    thinkingHigh: {id: 'gui.hrai.thinkingHigh', defaultMessage: 'high', description: 'high thinking level'},
    thinkingXhigh: {id: 'gui.hrai.thinkingXhigh', defaultMessage: 'xhigh', description: 'extra-high thinking level'},
    thinkingMax: {id: 'gui.hrai.thinkingMax', defaultMessage: 'max', description: 'maximum thinking level'},
    providerSignedIn: {id: 'gui.hrai.providerSignedIn', defaultMessage: ' · signed in', description: 'suffix on a provider that has credentials'},
    providerSubscription: {id: 'gui.hrai.providerSubscription', defaultMessage: ' · subscription', description: 'suffix on a provider using a subscription'},
    loginFirst: {id: 'gui.hrai.loginFirst', defaultMessage: 'Sign in first.', description: 'hint when a provider has no credentials yet'},
    socratic: {id: 'gui.hrai.socratic', defaultMessage: 'Socratic guide', description: 'assistant persona option'},
    coach: {id: 'gui.hrai.coach', defaultMessage: 'Encouraging coach', description: 'assistant persona option'},
    working: {id: 'gui.hrai.working', defaultMessage: 'Working…', description: 'account form busy state'},
    loading: {id: 'gui.hrai.loading', defaultMessage: 'Loading…', description: 'saved project list loading state'},
    authFailed: {id: 'gui.hrai.authFailed', defaultMessage: 'Sign-in failed. Check your details.', description: 'account authentication error'},
    forgotLink: {id: 'gui.hrai.forgotLink', defaultMessage: 'I forgot my password', description: 'link to the password reset form'},
    forgotHeading: {id: 'gui.hrai.forgotHeading', defaultMessage: 'New HRAI password', description: 'password reset form heading'},
    forgotIdentifier: {id: 'gui.hrai.forgotIdentifier', defaultMessage: 'Username or email', description: 'password reset identifier field'},
    forgotSubmit: {id: 'gui.hrai.forgotSubmit', defaultMessage: 'Send me a link', description: 'password reset submit button'},
    forgotSent: {id: 'gui.hrai.forgotSent', defaultMessage: 'If that profile has an email saved, a link is on its way. It works for one hour.', description: 'password reset confirmation, deliberately says nothing about whether the profile exists'},
    backToSignIn: {id: 'gui.hrai.backToSignIn', defaultMessage: 'Back to signing in', description: 'return from the password reset form'},
    newPasswordHeading: {id: 'gui.hrai.newPasswordHeading', defaultMessage: 'Choose a new password', description: 'set-new-password panel heading'},
    newPassword: {id: 'gui.hrai.newPassword', defaultMessage: 'New password', description: 'new password field'},
    setPassword: {id: 'gui.hrai.setPassword', defaultMessage: 'Save the new password', description: 'set-new-password submit button'},
    resetDone: {id: 'gui.hrai.resetDone', defaultMessage: 'Done. Sign in with your new password.', description: 'password reset success'},
    resetFailed: {id: 'gui.hrai.resetFailed', defaultMessage: 'That link no longer works. Ask for a new one.', description: 'expired or spent reset link'},
    recoveryEmail: {id: 'gui.hrai.recoveryEmail', defaultMessage: 'Email for password recovery', description: 'recovery address field'},
    recoveryEmailHint: {id: 'gui.hrai.recoveryEmailHint', defaultMessage: 'Optional. A grown-up\u2019s address works well. Without it a forgotten password can only be reset on the server.', description: 'explains what the recovery address is for'},
    emailInvalid: {id: 'gui.hrai.emailInvalid', defaultMessage: 'That does not look like an email address.', description: 'invalid recovery address error'},
    registerFailed: {id: 'gui.hrai.registerFailed', defaultMessage: 'Could not create the profile. Try again.', description: 'account registration error'},
    usernameRule: {id: 'gui.hrai.usernameRule', defaultMessage: 'Username: 3-32 characters, letters, digits, - or _ only.', description: 'username format rule, shown as a hint and as an error'},
    passwordRule: {id: 'gui.hrai.passwordRule', defaultMessage: 'Password: at least 8 characters.', description: 'password length rule, shown as a hint and as an error'},
    usernameTaken: {id: 'gui.hrai.usernameTaken', defaultMessage: 'That username is already in use.', description: 'duplicate username error'},
    username: {id: 'gui.hrai.username', defaultMessage: 'Username', description: 'account username field'},
    password: {id: 'gui.hrai.password', defaultMessage: 'Password', description: 'account password field'},
    requestFailed: {id: 'gui.hrai.requestFailed', defaultMessage: 'Something went wrong. Try again.', description: 'generic account request error'},
    assistantSettings: {id: 'gui.hrai.assistantSettings', defaultMessage: 'Assistant settings', description: 'assistant settings dialog heading'}
});

// webpack's DefinePlugin substitutes this expression at build time. A `typeof process`
// guard would defeat it: the identifier itself does not exist in the browser bundle.
// These panels render outside the editor's own IntlProvider, so they resolve the locale the
// same way editor-state does and carry their own provider with the real message catalogue.
let panelIntl = null;

const panelIntlProps = () => {
    if (!panelIntl) {
        const locale = detectLocale(Object.keys(editorMessages));
        panelIntl = {
            locale,
            messages: {...editorMessages[locale], ...localMessagesForLocale(locale)}
        };
    }
    return panelIntl;
};

const apiBase = () => process.env.HRAI_SERVER_URL ||
    (typeof window === 'object' ? window.location.origin : 'http://localhost:8791');

const request = async (path, options = {}) => {
    const response = await fetch(`${apiBase().replace(/\/$/, '')}${path}`, {
        credentials: 'include',
        ...options,
        headers: {
            ...(options.body ? {'Content-Type': 'application/json'} : {}),
            ...options.headers
        }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error || `request_failed_${response.status}`);
    return body;
};

const panelStyle = {
    position: 'fixed',
    zIndex: 1000,
    top: '4rem',
    right: '1rem',
    width: '20rem',
    padding: '1rem',
    background: '#fff',
    border: '1px solid #cbdde4',
    borderRadius: '0.5rem',
    boxShadow: '0 0.5rem 2rem rgba(0, 0, 0, .2)'
};

// Mirrors the server's own rules in store.ts, so a name the server would reject never
// costs the child a round trip that comes back as an unexplained failure.
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

const ruleViolation = (username, password) => {
    if (!USERNAME_PATTERN.test(username)) return messages.usernameRule;
    if (password.length < MIN_PASSWORD_LENGTH) return messages.passwordRule;
    return null;
};

const serverErrorMessage = (code, registering) => {
    switch (code) {
    case 'username_taken': return messages.usernameTaken;
    case 'invalid_username': return messages.usernameRule;
    case 'invalid_password': return messages.passwordRule;
    case 'invalid_credentials': return messages.authFailed;
    case 'invalid_email': return messages.emailInvalid;
    case 'invalid_reset_token': return messages.resetFailed;
    default: return registering ? messages.registerFailed : messages.authFailed;
    }
};

const hintStyle = {opacity: 0.75};

const HraiAuthForm = ({defaultRegistering = false, onClose, onSuccess}) => {
    const intl = useIntl();
    const [mode, setMode] = React.useState(defaultRegistering ? 'register' : 'login');
    const [username, setUsername] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [displayName, setDisplayName] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [identifier, setIdentifier] = React.useState('');
    const [error, setError] = React.useState(null);
    const [notice, setNotice] = React.useState(null);
    const [busy, setBusy] = React.useState(false);

    const registering = mode === 'register';

    const submit = async (event) => {
        event.preventDefault();
        setNotice(null);
        if (mode === 'forgot') {
            setBusy(true);
            try {
                await request('/api/auth/forgot', {
                    method: 'POST',
                    body: JSON.stringify({identifier})
                });
                setError(null);
                setNotice(messages.forgotSent);
            } catch {
                // The endpoint answers the same for every identifier, so the only failure
                // that reaches here is the request itself.
                setError(messages.requestFailed);
            } finally {
                setBusy(false);
            }
            return;
        }
        const violation = ruleViolation(username, password);
        if (violation) {
            setError(violation);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const path = registering ? '/api/auth/register' : '/api/auth/login';
            const user = await request(path, {
                method: 'POST',
                body: JSON.stringify({
                    username,
                    password,
                    displayName: displayName || undefined,
                    email: registering && email ? email : undefined
                })
            });
            onSuccess(user);
            onClose?.();
        } catch (requestError) {
            setError(serverErrorMessage(requestError.message, registering));
        } finally {
            setBusy(false);
        }
    };

    const heading = mode === 'forgot' ? messages.forgotHeading :
        registering ? messages.createProfile : messages.signIn;
    const submitLabel = mode === 'forgot' ? messages.forgotSubmit :
        registering ? messages.createProfileButton : messages.signInButton;

    // noValidate: the browser's own bubbles for `required` and `minLength` block submission
    // silently enough to read as a dead button. The rules below are always on screen instead.
    return (
        <form noValidate onSubmit={submit} style={{display: 'grid', gap: '0.5rem', padding: '0.75rem'}}>
            <strong>
                <FormattedMessage {...heading} />
            </strong>
            {mode === 'forgot' ? (
                <input
                    aria-label={intl.formatMessage(messages.forgotIdentifier)}
                    placeholder={intl.formatMessage(messages.forgotIdentifier)}
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    autoComplete="username"
                    required
                />
            ) : (
                <>
                    {registering ? (
                        <input
                            aria-label={intl.formatMessage(messages.displayName)}
                            placeholder={intl.formatMessage(messages.displayName)}
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                            maxLength={80}
                        />
                    ) : null}
                    <input
                        aria-describedby="hrai-username-rule"
                        aria-label={intl.formatMessage(messages.username)}
                        placeholder={intl.formatMessage(messages.username)}
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        autoComplete="username"
                        maxLength={32}
                        required
                    />
                    <small id="hrai-username-rule" style={hintStyle}>
                        <FormattedMessage {...messages.usernameRule} />
                    </small>
                    <input
                        aria-describedby="hrai-password-rule"
                        aria-label={intl.formatMessage(messages.password)}
                        placeholder={intl.formatMessage(messages.password)}
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete={registering ? 'new-password' : 'current-password'}
                        required
                    />
                    <small id="hrai-password-rule" style={hintStyle}>
                        <FormattedMessage {...messages.passwordRule} />
                    </small>
                    {registering ? (
                        <>
                            <input
                                aria-describedby="hrai-email-hint"
                                aria-label={intl.formatMessage(messages.recoveryEmail)}
                                placeholder={intl.formatMessage(messages.recoveryEmail)}
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                autoComplete="email"
                                maxLength={254}
                            />
                            <small id="hrai-email-hint" style={hintStyle}>
                                <FormattedMessage {...messages.recoveryEmailHint} />
                            </small>
                        </>
                    ) : null}
                </>
            )}
            {error ? <small role="alert"><FormattedMessage {...error} /></small> : null}
            {notice ? <small role="status"><FormattedMessage {...notice} /></small> : null}
            <button type="submit" disabled={busy}>
                {busy ? <FormattedMessage {...messages.working} /> : <FormattedMessage {...submitLabel} />}
            </button>
            {mode === 'forgot' ? (
                <button type="button" onClick={() => setMode('login')}>
                    <FormattedMessage {...messages.backToSignIn} />
                </button>
            ) : (
                <>
                    <button type="button" onClick={() => setMode(registering ? 'login' : 'register')}>
                        <FormattedMessage {...(registering ? messages.switchToLogin : messages.createProfileLink)} />
                    </button>
                    {registering ? null : (
                        <button type="button" onClick={() => setMode('forgot')}>
                            <FormattedMessage {...messages.forgotLink} />
                        </button>
                    )}
                </>
            )}
            {onClose ? (
                <button type="button" onClick={onClose}>
                    <FormattedMessage {...messages.cancel} />
                </button>
            ) : null}
        </form>
    );
};

HraiAuthForm.propTypes = {
    defaultRegistering: PropTypes.bool,
    onClose: PropTypes.func,
    onSuccess: PropTypes.func.isRequired
};

const splitModelRef = (model) => {
    if (!model || model === 'default') return {providerId: 'default', modelId: ''};
    const slash = model.indexOf('/');
    if (slash < 0) return {providerId: 'default', modelId: ''};
    return {providerId: model.slice(0, slash), modelId: model.slice(slash + 1)};
};

const THINKING_OPTIONS = [
    ['default', messages.thinkingDefault],
    ['off', messages.thinkingOff],
    ['minimal', messages.thinkingMinimal],
    ['low', messages.thinkingLow],
    ['medium', messages.thinkingMedium],
    ['high', messages.thinkingHigh],
    ['xhigh', messages.thinkingXhigh],
    ['max', messages.thinkingMax]
];

const AssistantSettings = ({user, onClose, onUpdated}) => {
    const intl = useIntl();
    const [preferences, setPreferences] = React.useState({
        ...user.assistantPreferences,
        model: user.assistantPreferences.model || 'default',
        thinkingLevel: user.assistantPreferences.thinkingLevel || 'default'
    });
    const [email, setEmail] = React.useState(user.email ?? '');
    const [modelCatalog, setModelCatalog] = React.useState(null);
    const [modelsFailed, setModelsFailed] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [saved, setSaved] = React.useState(false);

    React.useEffect(() => {
        request('/api/models')
            .then((catalog) => setModelCatalog(catalog))
            .catch(() => setModelsFailed(true));
    }, []);

    const update = (field, value) => setPreferences((current) => ({...current, [field]: value}));
    const {providerId, modelId} = splitModelRef(preferences.model);
    const selectedProvider = modelCatalog?.providers.find((provider) => provider.id === providerId);
    const selectedModel = selectedProvider?.models.find((model) => model.id === modelId);
    const modelLocked = Boolean(
        selectedProvider &&
        !selectedProvider.configured &&
        (selectedProvider.login.oauth || selectedProvider.login.apiKey)
    );
    const showThinking = providerId === 'default' || Boolean(selectedModel?.reasoning);

    const updateProvider = (nextProviderId) => {
        if (nextProviderId === 'default') {
            update('model', 'default');
            return;
        }
        const provider = modelCatalog?.providers.find((entry) => entry.id === nextProviderId);
        const nextModelId = provider?.models.some((model) => model.id === modelId) ?
            modelId :
            (provider?.models[0]?.id ?? '');
        update('model', nextModelId ? `${nextProviderId}/${nextModelId}` : nextProviderId);
    };

    const providerLabel = (provider) => {
        let label = provider.name;
        if (provider.configured) label += intl.formatMessage(messages.providerSignedIn);
        if (provider.subscription) label += intl.formatMessage(messages.providerSubscription);
        return label;
    };

    const save = async (event) => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        try {
            const updated = await request('/api/profile/assistant', {
                method: 'PUT',
                body: JSON.stringify(preferences)
            });
            const withEmail = email === (user.email ?? '') ? updated : await request('/api/profile/email', {
                method: 'PUT',
                body: JSON.stringify({email})
            });
            onUpdated(withEmail);
            setSaved(true);
        } catch (requestError) {
            setError(requestError.message === 'invalid_email' ? messages.emailInvalid : messages.requestFailed);
        }
    };

    const modelControlsDisabled = !modelCatalog || modelsFailed;

    return (
        <div style={panelStyle} role="dialog" aria-label={intl.formatMessage(messages.assistantSettings)}>
            <form onSubmit={save} style={{display: 'grid', gap: '0.6rem'}}>
                <strong><FormattedMessage {...messages.assistantSettings} /></strong>
                <label>
                    <FormattedMessage {...messages.assistantName} />
                    <input value={preferences.assistantName} maxLength={40} onChange={(event) => update('assistantName', event.target.value)} />
                </label>
                <label>
                    <FormattedMessage {...messages.persona} />
                    <select value={preferences.persona} onChange={(event) => update('persona', event.target.value)}>
                        <option value="patient"><FormattedMessage {...messages.patient} /></option>
                        <option value="socratic"><FormattedMessage {...messages.socratic} /></option>
                        <option value="coach"><FormattedMessage {...messages.coach} /></option>
                    </select>
                </label>
                <label>
                    <FormattedMessage {...messages.answerLength} />
                    <select value={preferences.verbosity} onChange={(event) => update('verbosity', event.target.value)}>
                        <option value="concise"><FormattedMessage {...messages.concise} /></option>
                        <option value="balanced"><FormattedMessage {...messages.balanced} /></option>
                        <option value="detailed"><FormattedMessage {...messages.detailed} /></option>
                    </select>
                </label>
                <label>
                    <FormattedMessage {...messages.provider} />
                    <select value={providerId} disabled={modelControlsDisabled} onChange={(event) => updateProvider(event.target.value)}>
                        {modelCatalog && !modelsFailed ? (
                            <>
                                <option value="default"><FormattedMessage {...messages.serverDefault} /></option>
                                {modelCatalog.providers.map((provider) => (
                                    <option key={provider.id} value={provider.id}>{providerLabel(provider)}</option>
                                ))}
                            </>
                        ) : (
                            <option value={providerId}><FormattedMessage {...messages.loading} /></option>
                        )}
                    </select>
                </label>
                {modelControlsDisabled || providerId === 'default' ? (
                    modelControlsDisabled ? (
                        <label>
                            <FormattedMessage {...messages.model} />
                            <select value={modelId} disabled>
                                <option value={modelId}><FormattedMessage {...messages.loading} /></option>
                            </select>
                        </label>
                    ) : null
                ) : (
                    <label>
                        <FormattedMessage {...messages.model} />
                        <select
                            value={modelId}
                            disabled={modelLocked}
                            onChange={(event) => update('model', `${providerId}/${event.target.value}`)}
                        >
                            {selectedProvider?.models.map((model) => (
                                <option key={model.id} value={model.id}>{model.name}</option>
                            ))}
                        </select>
                    </label>
                )}
                {modelLocked ? (
                    <small style={hintStyle}><FormattedMessage {...messages.loginFirst} /></small>
                ) : null}
                {showThinking ? (
                    <label>
                        <FormattedMessage {...messages.thinkingLevel} />
                        <select value={preferences.thinkingLevel} onChange={(event) => update('thinkingLevel', event.target.value)}>
                            {THINKING_OPTIONS.map(([value, message]) => (
                                <option key={value} value={value}><FormattedMessage {...message} /></option>
                            ))}
                        </select>
                    </label>
                ) : null}
                <label>
                    <FormattedMessage {...messages.recoveryEmail} />
                    <input
                        aria-describedby="hrai-settings-email-hint"
                        type="email"
                        value={email}
                        maxLength={254}
                        onChange={(event) => setEmail(event.target.value)}
                    />
                </label>
                <small id="hrai-settings-email-hint" style={hintStyle}>
                    <FormattedMessage {...messages.recoveryEmailHint} />
                </small>
                <label>
                    <input
                        type="checkbox"
                        checked={preferences.encouragement}
                        onChange={(event) => update('encouragement', event.target.checked)}
                    /> <FormattedMessage {...messages.encouragement} />
                </label>
                {error ? <small role="alert"><FormattedMessage {...error} /></small> : null}
                {saved ? <small><FormattedMessage {...messages.saved} /></small> : null}
                <button type="submit"><FormattedMessage {...messages.saveSettings} /></button>
                <button type="button" onClick={onClose}><FormattedMessage {...messages.close} /></button>
            </form>
        </div>
    );
};

AssistantSettings.propTypes = {
    user: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    onUpdated: PropTypes.func.isRequired
};

/**
 * The panel the emailed link opens: spend the token on a new password.
 * @param {object} props The token from the link and a close handler.
 * @returns {React.ReactElement} The set-a-new-password dialog.
 */
const PasswordResetPanel = ({token, onClose}) => {
    const intl = useIntl();
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState(null);
    const [done, setDone] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    const submit = async (event) => {
        event.preventDefault();
        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(messages.passwordRule);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await request('/api/auth/reset', {
                method: 'POST',
                body: JSON.stringify({token, password})
            });
            setDone(true);
        } catch (requestError) {
            setError(serverErrorMessage(requestError.message, false));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={panelStyle} role="dialog" aria-label={intl.formatMessage(messages.newPasswordHeading)}>
            <form noValidate onSubmit={submit} style={{display: 'grid', gap: '0.5rem'}}>
                <strong><FormattedMessage {...messages.newPasswordHeading} /></strong>
                {done ? (
                    <small role="status"><FormattedMessage {...messages.resetDone} /></small>
                ) : (
                    <>
                        <input
                            aria-describedby="hrai-reset-rule"
                            aria-label={intl.formatMessage(messages.newPassword)}
                            placeholder={intl.formatMessage(messages.newPassword)}
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                            required
                        />
                        <small id="hrai-reset-rule" style={hintStyle}>
                            <FormattedMessage {...messages.passwordRule} />
                        </small>
                        {error ? <small role="alert"><FormattedMessage {...error} /></small> : null}
                        <button type="submit" disabled={busy}>
                            {busy ? <FormattedMessage {...messages.working} /> : <FormattedMessage {...messages.setPassword} />}
                        </button>
                    </>
                )}
                <button type="button" onClick={onClose}>
                    <FormattedMessage {...messages.close} />
                </button>
            </form>
        </div>
    );
};

PasswordResetPanel.propTypes = {
    onClose: PropTypes.func.isRequired,
    token: PropTypes.string.isRequired
};

const AccountDialog = ({children}) => {
    const intl = useIntl();
    return (
        <div style={panelStyle} role="dialog" aria-label={intl.formatMessage(messages.accountDialog)}>
            {children}
        </div>
    );
};

AccountDialog.propTypes = {
    children: PropTypes.node
};

const ProjectsPanel = ({onClose, onOpen}) => {
    const intl = useIntl();
    const [projects, setProjects] = React.useState(null);
    const [error, setError] = React.useState(null);
    React.useEffect(() => {
        request('/api/projects')
            .then((body) => setProjects(body.projects))
            .catch(() => setError(messages.requestFailed));
    }, []);
    return (
        <div style={panelStyle} role="dialog" aria-label={intl.formatMessage(messages.projects)}>
            <strong><FormattedMessage {...messages.projects} /></strong>
            {error ? <p role="alert"><FormattedMessage {...error} /></p> : null}
            {!projects ? <p><FormattedMessage {...messages.loading} /></p> : projects.length === 0 ? (
                <p><FormattedMessage {...messages.noProjects} /></p>
            ) : (
                <ul>
                    {projects.map((project) => (
                        <li key={project.id}>
                            <button type="button" onClick={() => onOpen(project.id)}>{project.title}</button>
                        </li>
                    ))}
                </ul>
            )}
            <button type="button" onClick={onClose}><FormattedMessage {...messages.close} /></button>
        </div>
    );
};

ProjectsPanel.propTypes = {
    onClose: PropTypes.func.isRequired,
    onOpen: PropTypes.func.isRequired
};

/**
 * Supplies HRAI identity to the upstream-shaped GUI without changing Scratch reducers.
 * @param {React.Component} WrappedComponent Component to receive HRAI session props.
 * @returns {React.Component} Session-aware component.
 */
const hraiSessionHOC = (WrappedComponent) => {
    class HraiSession extends React.Component {
        state = {
            user: null,
            authLoaded: false,
            authOpen: false,
            authRegistering: false,
            projectsOpen: false,
            resetToken: null,
            settingsOpen: false
        };

        componentDidMount () {
            request('/api/auth/me')
                .then((user) => this.setState({user, authLoaded: true}))
                .catch(() => this.setState({authLoaded: true}));
            this.syncPanels();
        }

        syncPanels () {
            const params = new URLSearchParams(window.location.search);
            this.setState({
                projectsOpen: params.get('hrai-projects') === '1',
                resetToken: params.get('hrai-reset'),
                settingsOpen: params.get('hrai-settings') === '1'
            });
        }

        closeReset () {
            const url = new URL(window.location.href);
            // The token is spent, and a link left in the address bar is a link left in history.
            url.searchParams.delete('hrai-reset');
            window.history.replaceState({}, '', url);
            this.setState({resetToken: null});
        }

        closePanel (name) {
            const url = new URL(window.location.href);
            url.searchParams.delete(name === 'projectsOpen' ? 'hrai-projects' : 'hrai-settings');
            window.history.replaceState({}, '', url);
            this.setState({[name]: false});
        }

        openPanel (name) {
            const url = new URL(window.location.href);
            url.searchParams.set(name === 'projectsOpen' ? 'hrai-projects' : 'hrai-settings', '1');
            window.history.replaceState({}, '', url);
            this.setState({[name]: true});
        }

        handleLogout = async () => {
            await request('/api/auth/logout', {method: 'POST'});
            this.setState({user: null});
        };

        handleAuthenticated = (user) => this.setState({user, authOpen: false});

        render () {
            const {user, authLoaded, authOpen, authRegistering, projectsOpen, resetToken, settingsOpen} = this.state;
            const canSave = authLoaded && Boolean(user) && this.props.canSave !== false;
            const accountMenuOptions = {
                canHaveSession: true,
                canRegister: true,
                canLogin: true,
                canLogout: Boolean(user),
                myStuffUrl: user ? '?hrai-projects=1' : undefined,
                onClickMyStuff: user ? () => this.openPanel('projectsOpen') : undefined,
                profileUrl: user ? '?hrai-settings=1' : undefined,
                accountSettingsUrl: user ? '?hrai-settings=1' : undefined
            };
            return (
                <>
                    <WrappedComponent
                        {...this.props}
                        canSave={canSave}
                        username={user?.username}
                        assistantPreferences={user?.assistantPreferences}
                        accountMenuOptions={accountMenuOptions}
                        onClickLogin={() => this.setState({authOpen: true, authRegistering: false})}
                        onOpenRegistration={() => this.setState({authOpen: true, authRegistering: true})}
                        renderLogin={({onClose}) => <HraiAuthForm onClose={onClose} onSuccess={this.handleAuthenticated} />}
                        onLogOut={this.handleLogout}
                    />
                    <IntlProvider {...panelIntlProps()}>
                        {authOpen ? (
                            <AccountDialog>
                                <HraiAuthForm
                                    defaultRegistering={authRegistering}
                                    onClose={() => this.setState({authOpen: false})}
                                    onSuccess={this.handleAuthenticated}
                                />
                            </AccountDialog>
                        ) : null}
                        {resetToken ? (
                            <PasswordResetPanel
                                token={resetToken}
                                onClose={() => this.closeReset()}
                            />
                        ) : null}
                        {settingsOpen && user ? (
                            <AssistantSettings
                                user={user}
                                onClose={() => this.closePanel('settingsOpen')}
                                onUpdated={(updated) => this.setState({user: updated})}
                            />
                        ) : null}
                        {projectsOpen && user ? (
                            <ProjectsPanel
                                onClose={() => this.closePanel('projectsOpen')}
                                onOpen={(id) => {
                                    window.location.hash = id;
                                    this.closePanel('projectsOpen');
                                }}
                            />
                        ) : null}
                    </IntlProvider>
                </>
            );
        }
    }

    HraiSession.propTypes = {
        canSave: PropTypes.bool
    };
    return HraiSession;
};

export default hraiSessionHOC;
