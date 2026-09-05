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
