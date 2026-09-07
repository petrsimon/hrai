/**
 * The panel owns the one /hrai socket; assistant settings need the same connection
 * for provider login. Listeners are told whenever that socket is created or dropped.
 */

let socket = null;
const listeners = new Set();

const setHraiSocket = next => {
    socket = next;
    listeners.forEach(listener => listener(socket));
};

const subscribeHraiSocket = listener => {
    listeners.add(listener);
    listener(socket);
    return () => listeners.delete(listener);
};

const emitHrai = (event, ...rest) => {
    if (!socket) return;
    if (rest.length === 0) socket.emit(event);
    else socket.emit(event, rest[0]);
};

export {
    emitHrai,
    setHraiSocket,
    subscribeHraiSocket
};
