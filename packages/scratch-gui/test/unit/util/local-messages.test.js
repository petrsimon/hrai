import {cs, en, forLocale} from '../../../src/lib/local-messages';

describe('local messages', () => {
    test('every English string carried here also has a Czech one', () => {
        const untranslated = Object.keys(en).filter(id => !(id in cs));
        expect(untranslated).toEqual([]);
    });

    test('the HRAI account dialog is translated', () => {
        const dialogIds = [
            'gui.hrai.accountDialog',
            'gui.hrai.signIn',
            'gui.hrai.signInButton',
            'gui.hrai.createProfile',
            'gui.hrai.createProfileButton',
            'gui.hrai.displayName',
            'gui.hrai.username',
            'gui.hrai.password',
            'gui.hrai.usernameRule',
            'gui.hrai.passwordRule'
        ];
        dialogIds.forEach(id => {
            expect(typeof cs[id]).toBe('string');
            expect(cs[id]).not.toBe(en[id]);
        });
    });

    test('unsupported locales fall back to English', () => {
        expect(forLocale('cs')).toBe(cs);
        expect(forLocale('de')).toBe(en);
    });
});
