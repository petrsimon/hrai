import {emitHrai, setHraiSocket, subscribeHraiSocket} from '../../../src/lib/hrai-socket.js';

describe('hrai socket bridge', () => {
    afterEach(() => {
        setHraiSocket(null);
    });

    test('tells listeners about the socket and emits on it', () => {
        const seen = [];
        const stop = subscribeHraiSocket(socket => seen.push(socket));
        const fake = {emit: jest.fn()};

        setHraiSocket(fake);
        emitHrai('provider:login', {providerId: 'openai-codex', type: 'oauth'});

        expect(seen).toEqual([null, fake]);
        expect(fake.emit).toHaveBeenCalledWith('provider:login', {providerId: 'openai-codex', type: 'oauth'});
        emitHrai('provider:login:cancel');
        expect(fake.emit).toHaveBeenCalledWith('provider:login:cancel');
        stop();
        fake.emit.mockClear();
        emitHrai('provider:logout', {providerId: 'openai-codex'});
        expect(fake.emit).toHaveBeenCalledWith('provider:logout', {providerId: 'openai-codex'});
    });
});
