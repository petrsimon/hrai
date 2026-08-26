/* eslint-env jest */
import localesReducer, {selectLocale, setLocales} from '../../../src/reducers/locales';

test('includes local hrai messages in Czech locale', () => {
    let defaultState;
    const initialState = localesReducer(defaultState, {type: 'anything'});
    const localizedState = localesReducer(initialState, setLocales({cs: {}, en: {}}));
    const czechState = localesReducer(localizedState, selectLocale('cs'));

    expect(czechState.messages['gui.hrai.inputLabel']).toBe('Zpráva pro hrai');
    expect(czechState.messages['gui.hrai.nextStage']).toBe('Další krok');
});

test('uses English hrai messages in other locales', () => {
    let defaultState;
    const initialState = localesReducer(defaultState, {type: 'anything'});

    expect(initialState.messages['gui.hrai.inputLabel']).toBe('Message for hrai');
});

test('keeps hrai messages when host locales are replaced', () => {
    let defaultState;
    const initialState = localesReducer(defaultState, {type: 'anything'});
    const updatedState = localesReducer(initialState, setLocales({
        cs: {'gui.example': 'Příklad'},
        en: {'gui.example': 'Example'}
    }));

    expect(updatedState.messagesByLocale.cs['gui.hrai.inputLabel']).toBe('Zpráva pro hrai');
    expect(updatedState.messagesByLocale.en['gui.hrai.inputLabel']).toBe('Message for hrai');
});
