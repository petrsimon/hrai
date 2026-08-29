/* eslint-disable react/jsx-no-bind, react/jsx-max-props-per-line, no-undefined, no-negated-condition, @stylistic/max-len, @stylistic/arrow-parens */
import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, FormattedMessage, IntlProvider} from 'react-intl';

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
    socratic: {id: 'gui.hrai.socratic', defaultMessage: 'Socratic guide', description: 'assistant persona option'},
    coach: {id: 'gui.hrai.coach', defaultMessage: 'Encouraging coach', description: 'assistant persona option'},
    working: {id: 'gui.hrai.working', defaultMessage: 'Working…', description: 'account form busy state'},
    loading: {id: 'gui.hrai.loading', defaultMessage: 'Loading…', description: 'saved project list loading state'},
    authFailed: {id: 'gui.hrai.authFailed', defaultMessage: 'Sign-in failed. Check your details.', description: 'account authentication error'},
    usernameTaken: {id: 'gui.hrai.usernameTaken', defaultMessage: 'That username is already in use.', description: 'duplicate username error'},
    username: {id: 'gui.hrai.username', defaultMessage: 'Username', description: 'account username field'},
    password: {id: 'gui.hrai.password', defaultMessage: 'Password', description: 'account password field'},
    requestFailed: {id: 'gui.hrai.requestFailed', defaultMessage: 'Something went wrong. Try again.', description: 'generic account request error'},
    assistantSettings: {id: 'gui.hrai.assistantSettings', defaultMessage: 'Assistant settings', description: 'assistant settings dialog heading'}
});

const apiBase = () => {
    if (typeof process !== 'undefined' && process.env.HRAI_SERVER_URL) return process.env.HRAI_SERVER_URL;
    return typeof window === 'object' ? window.location.origin : 'http://localhost:8791';
};

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

const HraiAuthForm = ({onClose, onSuccess}) => {
    const [registering, setRegistering] = React.useState(false);
    const [username, setUsername] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [displayName, setDisplayName] = React.useState('');
    const [error, setError] = React.useState(null);
    const [busy, setBusy] = React.useState(false);

    const submit = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const path = registering ? '/api/auth/register' : '/api/auth/login';
            const user = await request(path, {
                method: 'POST',
                body: JSON.stringify({username, password, displayName: displayName || undefined})
            });
            onSuccess(user);
            onClose?.();
        } catch (requestError) {
            setError(requestError.message === 'username_taken' ?
                messages.usernameTaken.defaultMessage : messages.authFailed.defaultMessage);
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} style={{display: 'grid', gap: '0.5rem', padding: '0.75rem'}}>
            <strong>
                <FormattedMessage {...(registering ? messages.createProfile : messages.signIn)} />
            </strong>
            {registering ? (
                <input
                    aria-label={messages.displayName.defaultMessage}
                    placeholder={messages.displayName.defaultMessage}
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    maxLength={80}
                />
            ) : null}
            <input
                aria-label={messages.username.defaultMessage}
                placeholder={messages.username.defaultMessage}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
            />
            <input
                aria-label={messages.password.defaultMessage}
                placeholder={messages.password.defaultMessage}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={registering ? 'new-password' : 'current-password'}
                minLength={8}
                required
            />
            {error ? <small role="alert">{error}</small> : null}
            <button type="submit" disabled={busy}>
                {busy ? <FormattedMessage {...messages.working} /> : (
                    <FormattedMessage {...(registering ? messages.createProfileButton : messages.signInButton)} />
                )}
            </button>
            <button type="button" onClick={() => setRegistering((value) => !value)}>
                <FormattedMessage {...(registering ? messages.switchToLogin : messages.createProfileLink)} />
            </button>
            {onClose ? (
                <button type="button" onClick={onClose}>
                    <FormattedMessage {...messages.cancel} />
                </button>
            ) : null}
        </form>
    );
};

HraiAuthForm.propTypes = {
    onClose: PropTypes.func,
    onSuccess: PropTypes.func.isRequired
};

const AssistantSettings = ({user, onClose, onUpdated}) => {
    const [preferences, setPreferences] = React.useState(user.assistantPreferences);
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
    const updateBackend = (value) => setPreferences((current) => ({...current, modelBackend: value}));
    const updateModel = (value) => setPreferences((current) => {
        const modelByBackend = {...current.modelByBackend};
        if (value === '') delete modelByBackend[current.modelBackend];
        else modelByBackend[current.modelBackend] = value;
        return {...current, modelByBackend};
    });
    const save = async (event) => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        try {
            const updated = await request('/api/profile/assistant', {
                method: 'PUT',
                body: JSON.stringify(preferences)
            });
            onUpdated(updated);
            setSaved(true);
        } catch (requestError) {
            setError(messages.requestFailed.defaultMessage);
        }
    };

    const modelControlsDisabled = !modelCatalog || modelsFailed;
    const selectedBackend = modelCatalog?.backends.find((backend) => backend.id === preferences.modelBackend);
    const selectedModel = preferences.modelByBackend[preferences.modelBackend] ?? '';

    return (
        <div style={panelStyle} role="dialog" aria-label={messages.assistantSettings.defaultMessage}>
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
                    <select value={preferences.modelBackend} disabled={modelControlsDisabled} onChange={(event) => updateBackend(event.target.value)}>
                        {modelCatalog && !modelsFailed ? (
                            <>
                                <option value="default"><FormattedMessage {...messages.serverDefault} /></option>
                                {modelCatalog.backends.map((backend) => (
                                    <option key={backend.id} value={backend.id} disabled={!backend.available}>{backend.label}</option>
                                ))}
                            </>
                        ) : (
                            <option value={preferences.modelBackend}><FormattedMessage {...messages.loading} /></option>
                        )}
                    </select>
                </label>
                {modelControlsDisabled ? (
                    <label>
                        <FormattedMessage {...messages.model} />
                        <select value={selectedModel} disabled>
                            <option value={selectedModel}><FormattedMessage {...messages.loading} /></option>
                        </select>
                    </label>
                ) : preferences.modelBackend === 'default' ? null : selectedBackend?.freeform ? (
                    <label>
                        <FormattedMessage {...messages.model} />
                        <input value={selectedModel} maxLength={100} onChange={(event) => updateModel(event.target.value)} />
                    </label>
                ) : (
                    <label>
                        <FormattedMessage {...messages.model} />
                        <select value={selectedModel} onChange={(event) => updateModel(event.target.value)}>
                            <option value=""><FormattedMessage {...messages.backendDefault} /></option>
                            {selectedBackend?.models.map((model) => <option key={model} value={model}>{model}</option>)}
                        </select>
                    </label>
                )}
                <label>
                    <input
                        type="checkbox"
                        checked={preferences.encouragement}
                        onChange={(event) => update('encouragement', event.target.checked)}
                    /> <FormattedMessage {...messages.encouragement} />
                </label>
                {error ? <small role="alert">{error}</small> : null}
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

const ProjectsPanel = ({onClose, onOpen}) => {
    const [projects, setProjects] = React.useState(null);
    const [error, setError] = React.useState(null);
    React.useEffect(() => {
        request('/api/projects')
            .then((body) => setProjects(body.projects))
            .catch(() => setError(messages.requestFailed.defaultMessage));
    }, []);
    return (
        <div style={panelStyle} role="dialog" aria-label={messages.projects.defaultMessage}>
            <strong><FormattedMessage {...messages.projects} /></strong>
            {error ? <p role="alert">{error}</p> : null}
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
        state = {user: null, authLoaded: false, authOpen: false, projectsOpen: false, settingsOpen: false};

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
                settingsOpen: params.get('hrai-settings') === '1'
            });
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
            const {user, authLoaded, authOpen, projectsOpen, settingsOpen} = this.state;
            const canSave = authLoaded && Boolean(user) && this.props.canSave !== false;
            const accountMenuOptions = {
                canHaveSession: true,
                canRegister: true,
                canLogin: true,
                canLogout: Boolean(user),
                myStuffUrl: user ? '?hrai-projects=1' : undefined,
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
                        onClickLogin={() => this.setState({authOpen: true})}
                        onOpenRegistration={() => this.setState({authOpen: true})}
                        renderLogin={({onClose}) => <HraiAuthForm onClose={onClose} onSuccess={this.handleAuthenticated} />}
                        onLogOut={this.handleLogout}
                    />
                    <IntlProvider locale="en" messages={{}}>
                        {authOpen ? (
                            <div style={panelStyle} role="dialog" aria-label={messages.accountDialog.defaultMessage}>
                                <HraiAuthForm onClose={() => this.setState({authOpen: false})} onSuccess={this.handleAuthenticated} />
                            </div>
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
