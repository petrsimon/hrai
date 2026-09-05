import React from 'react';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import hraiSessionHOC from '../../../src/lib/hrai-session-hoc.jsx';

const USERNAME_RULE = 'Username: 3-32 characters, letters, digits, - or _ only.';
const PASSWORD_RULE = 'Password: at least 8 characters.';

describe('HRAI session HOC', () => {
    let Component;
    let WrappedComponent;

    const respondWith = (ok, body) => global.fetch.mockImplementation(() => Promise.resolve({
        ok,
        json: () => Promise.resolve(body)
    }));

    const fillAndSubmit = async ({username, password, submitLabel}) => {
        fireEvent.change(screen.getByLabelText('Username'), {target: {value: username}});
        fireEvent.change(screen.getByLabelText('Password'), {target: {value: password}});
        fireEvent.click(screen.getByRole('button', {name: submitLabel}));
        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    };

    beforeEach(() => {
        global.fetch = jest.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve(null)
        }));
        Component = function StubEditor ({onClickLogin, onOpenRegistration}) {
            return (
                <>
                    <button onClick={onClickLogin}>{'sign in'}</button>
                    <button onClick={onOpenRegistration}>{'create profile'}</button>
                </>
            );
        };
        WrappedComponent = hraiSessionHOC(Component);
    });

    const openDialog = async entryPoint => {
        render(<WrappedComponent />);
        fireEvent.click(screen.getByText(entryPoint));
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
        global.fetch.mockClear();
    };

    test('the sign-in entry point opens the account dialog in sign-in mode', async () => {
        await openDialog('sign in');

        expect(screen.getByText('Sign in to HRAI')).toBeInTheDocument();
        expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
    });

    test('the registration entry point opens the account dialog in registration mode', async () => {
        await openDialog('create profile');

        expect(screen.getByText('Create HRAI profile')).toBeInTheDocument();
        expect(screen.getByLabelText('Display name')).toBeInTheDocument();
    });

    test('the dialog still switches between modes once open', async () => {
        await openDialog('create profile');
        fireEvent.click(screen.getByText('I already have a profile'));

        expect(screen.getByText('Sign in to HRAI')).toBeInTheDocument();
        expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
    });

    test('a reset link in the address bar opens the new-password panel', async () => {
        window.history.replaceState({}, '', '/?hrai-reset=a-token');
        render(<WrappedComponent />);

        await waitFor(() => expect(screen.getByText('Choose a new password')).toBeInTheDocument());
        global.fetch.mockClear();

        fireEvent.change(screen.getByLabelText('New password'), {target: {value: 'noveheslo123'}});
        fireEvent.click(screen.getByRole('button', {name: 'Save the new password'}));

        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toContain('/api/auth/reset');
        expect(JSON.parse(options.body)).toEqual({token: 'a-token', password: 'noveheslo123'});
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Done.'));
        window.history.replaceState({}, '', '/');
    });

    test('a spent reset link says so instead of failing silently', async () => {
        window.history.replaceState({}, '', '/?hrai-reset=stale');
        render(<WrappedComponent />);
        await waitFor(() => expect(screen.getByText('Choose a new password')).toBeInTheDocument());
        respondWith(false, {error: 'invalid_reset_token'});

        fireEvent.change(screen.getByLabelText('New password'), {target: {value: 'noveheslo123'}});
        fireEvent.click(screen.getByRole('button', {name: 'Save the new password'}));

        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        expect(screen.getByRole('alert')).toHaveTextContent('That link no longer works');
        window.history.replaceState({}, '', '/');
    });

    test('a too-short new password is refused without a request', async () => {
        window.history.replaceState({}, '', '/?hrai-reset=a-token');
        render(<WrappedComponent />);
        await waitFor(() => expect(screen.getByText('Choose a new password')).toBeInTheDocument());
        global.fetch.mockClear();

        fireEvent.change(screen.getByLabelText('New password'), {target: {value: 'krátké'}});
        fireEvent.click(screen.getByRole('button', {name: 'Save the new password'}));

        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        expect(screen.getByRole('alert')).toHaveTextContent(PASSWORD_RULE);
        expect(global.fetch).not.toHaveBeenCalled();
        window.history.replaceState({}, '', '/');
    });

    test('the field rules are visible before anything is typed', async () => {
        await openDialog('create profile');

        expect(screen.getByText(USERNAME_RULE)).toBeInTheDocument();
        expect(screen.getByText(PASSWORD_RULE)).toBeInTheDocument();
    });

    test('a username the server would reject is refused without a request', async () => {
        await openDialog('create profile');
        await fillAndSubmit({username: 'Petr Šimon', password: 'heslo12345', submitLabel: 'Create profile'});

        expect(screen.getByRole('alert')).toHaveTextContent(USERNAME_RULE);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('a too-short username is refused without a request', async () => {
        await openDialog('create profile');
        await fillAndSubmit({username: 'ab', password: 'heslo12345', submitLabel: 'Create profile'});

        expect(screen.getByRole('alert')).toHaveTextContent(USERNAME_RULE);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('a too-short password is refused without a request', async () => {
        await openDialog('create profile');
        await fillAndSubmit({username: 'petrtest', password: 'heslo', submitLabel: 'Create profile'});

        expect(screen.getByRole('alert')).toHaveTextContent(PASSWORD_RULE);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('a duplicate username reports the name, not a sign-in failure', async () => {
        await openDialog('create profile');
        respondWith(false, {error: 'username_taken'});
        await fillAndSubmit({username: 'petrtest', password: 'heslo12345', submitLabel: 'Create profile'});

        expect(screen.getByRole('alert')).toHaveTextContent('That username is already in use.');
    });

    test('a failed registration does not blame sign-in', async () => {
        await openDialog('create profile');
        respondWith(false, {error: 'request_failed_500'});
        await fillAndSubmit({username: 'petrtest', password: 'heslo12345', submitLabel: 'Create profile'});

        expect(screen.getByRole('alert')).toHaveTextContent('Could not create the profile. Try again.');
    });

    test('wrong sign-in credentials report a sign-in failure', async () => {
        await openDialog('sign in');
        respondWith(false, {error: 'invalid_credentials'});
        await fillAndSubmit({username: 'petrtest', password: 'wrongpassword', submitLabel: 'Sign in'});

        expect(screen.getByRole('alert')).toHaveTextContent('Sign-in failed. Check your details.');
    });

    test('the sign-in form offers a way out of a forgotten password', async () => {
        await openDialog('sign in');
        fireEvent.click(screen.getByText('I forgot my password'));

        expect(screen.getByText('New HRAI password')).toBeInTheDocument();
        expect(screen.getByLabelText('Username or email')).toBeInTheDocument();
    });

    test('asking for a link says nothing about whether the profile exists', async () => {
        await openDialog('sign in');
        fireEvent.click(screen.getByText('I forgot my password'));
        fireEvent.change(screen.getByLabelText('Username or email'), {target: {value: 'nikdo'}});
        fireEvent.click(screen.getByRole('button', {name: 'Send me a link'}));

        await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
        expect(screen.getByRole('status')).toHaveTextContent('If that profile has an email saved');
        const [url] = global.fetch.mock.calls[0];
        expect(url).toContain('/api/auth/forgot');
    });

    test('registration offers a recovery address without demanding one', async () => {
        await openDialog('create profile');

        const emailField = screen.getByLabelText('Email for password recovery');
        expect(emailField).toBeInTheDocument();
        expect(emailField.required).toBe(false);

        fireEvent.change(screen.getByLabelText('Username'), {target: {value: 'petrtest'}});
        fireEvent.change(screen.getByLabelText('Password'), {target: {value: 'heslo12345'}});
        fireEvent.change(emailField, {target: {value: 'rodic@example.com'}});
        fireEvent.click(screen.getByRole('button', {name: 'Create profile'}));

        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({email: 'rodic@example.com'});
    });

    test('valid details reach the registration endpoint', async () => {
        await openDialog('create profile');
        fireEvent.change(screen.getByLabelText('Display name'), {target: {value: 'Petr'}});
        fireEvent.change(screen.getByLabelText('Username'), {target: {value: 'petr-test_1'}});
        fireEvent.change(screen.getByLabelText('Password'), {target: {value: 'heslo12345'}});
        fireEvent.click(screen.getByRole('button', {name: 'Create profile'}));

        await waitFor(() => expect(global.fetch).toHaveBeenCalled());
        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toContain('/api/auth/register');
        expect(JSON.parse(options.body)).toEqual({
            username: 'petr-test_1',
            password: 'heslo12345',
            displayName: 'Petr'
        });
    });
});
