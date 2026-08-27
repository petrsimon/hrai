/**
 * Translations for message IDs the published scratch-l10n bundle does not carry, so that the
 * editor does not fall back to English at runtime.
 *
 * Two groups end up here: hrai strings, which are not in Transifex at all, and upstream GUI
 * strings that reach Transifex only from the next `i18n:push`. English is omitted for the latter
 * because each of those messages already carries its own `defaultMessage`.
 */
const cs = {
    'gui.aria.aboutMenu': 'Nabídka O aplikaci',
    'gui.aria.accountMenu': 'Nabídka účtu',
    'gui.aria.authorInfo': 'Projekt „{projectTitle}“ od {username}',
    'gui.aria.clearButton': 'Vymazat',
    'gui.aria.editMenu': 'Nabídka Upravit',
    'gui.aria.fileMenu': 'Nabídka Soubor',
    'gui.aria.languageMenu': 'Nabídka jazyků',
    'gui.aria.modeMenu': 'Nabídka režimu',
    'gui.aria.settingsMenu': 'Nabídka nastavení',
    'gui.aria.startProjectButton': 'Spustit projekt',
    'gui.aria.stopProjectButton': 'Zastavit projekt',
    'gui.connection.auto-scanning.updatePeripheralPrompt':
        'Pokud své zařízení nevidíš, možná ho je potřeba aktualizovat, aby fungovalo se Scratchem.',
    'gui.connection.scanning.updatePeripheralPrompt':
        'Pokud své zařízení nevidíš, možná ho je potřeba aktualizovat, aby fungovalo se Scratchem.',
    'gui.connection.updatePeripheral.doNotDisconnect':
        'Dokud aktualizace neskončí, neopouštěj Scratch, nenačítej ho znovu a neodpojuj {extensionName}.',
    'gui.connection.updatePeripheral.updateMicroBitFirmware':
        'Firmware svého micro:bitu aktualizuj na tomto odkazu: <a>{microBitFirmwareLink}</a>',
    'gui.menuBar.colorMode': 'Barevný režim',
    'gui.menuBar.theme': 'Vzhled',
    'gui.sharedMessages.backdrop': 'pozadí{index}',
    'gui.sharedMessages.costume': 'kostým{index}',
    'gui.sharedMessages.loadFromComputerTitle': 'Načíst z počítače',
    'gui.sharedMessages.pop': 'pop',
    'gui.sharedMessages.replaceProjectWarning': 'Nahradit obsah současného projektu?',
    'gui.sharedMessages.sprite': 'Postava{index}',
    'gui.hraiLessons.title': 'lekce hrai',
    'gui.hraiLessons.intro': 'Vyber si hru a postupně ji vytvoř.',
    'gui.hraiLessons.back': 'Zpět na lekce',
    'gui.hraiLessons.stages': 'Postup lekce',
    'gui.hraiLessons.duration': 'Délka: {duration}',
    'gui.hraiLessons.concepts': 'Nové věci: {concepts}',
    'gui.hraiLessons.close': 'Zavřít',
    'gui.hraiLessons.start': 'Začít s průvodcem',
    'gui.hraiLessons.startPrompt':
        'Tímto nahradíš právě otevřený projekt připraveným začátkem lekce. Pokračovat?',
    'gui.hraiLessons.bundleNote':
        'Po spuštění se ti hrai objeví v panelu a bude sledovat kroky, které právě tvoříš.',
    'gui.aria.hraiPanel': 'panel hrai',
    'gui.hrai.title': 'hrai',
    'gui.hrai.messageListLabel': 'Konverzace s hrai',
    'gui.hrai.inputLabel': 'Zpráva pro hrai',
    'gui.hrai.sendButton': 'Odeslat',
    'gui.hrai.hintButton': 'Poradit',
    'gui.hrai.hintMaxReached': 'To je ta nejpřímější rada, jakou ti můžu dát.',
    'gui.hrai.thinking': 'hrai přemýšlí…',
    'gui.hrai.blockReference': 'Přejít na blok {alias}',
    'gui.hrai.blockOpcode': 'Blok {label}, kategorie {category}',
    'gui.aria.resizeHraiPanel': 'Změnit velikost panelu hrai',
    'gui.hrai.currentLesson': 'Lekce: {title}',
    'gui.hrai.currentStage': 'Krok {current} z {total}',
    'gui.hrai.nextStage': 'Další krok',
    'gui.hrai.lessonComplete': 'Výborně! Tento krok je hotový.',
    'gui.hrai.stageAction': 'Teď udělej',
    'gui.hrai.stageSuccess': 'Hotovo, když',
    'gui.hrai.voiceStart': 'Nahrát hlas',
    'gui.hrai.voiceStop': 'Zastavit nahrávání',
    'gui.hrai.voiceTranscribing': 'Přepisuji nahrávku…',
    'gui.hrai.voiceUnavailable': 'Hlasové zadávání teď není k dispozici.',
    'gui.hrai.voicePermissionDenied': 'Povol mikrofon v nastavení prohlížeče, nebo napiš zprávu.',
    'gui.hrai.voiceUnsupported': 'Tento prohlížeč neumí nahrávat hlas.',
    'gui.hrai.voiceFailed': 'Nahrávku se nepodařilo přepsat. Zkus to znovu, nebo napiš zprávu.',
    'gui.menuBar.hraiLessonsLibrary': 'lekce hrai',
    'gui.stageHeader.hraiAssistantOn': 'Vypnout asistenta hrai',
    'gui.stageHeader.hraiAssistantOff': 'Zapnout asistenta hrai',
    'gui.hrai.helperUnavailable': 'Pomocník teď není k dispozici.'
};

const en = {
    'gui.hraiLessons.title': 'hrai lessons',
    'gui.hraiLessons.intro': 'Choose a game and build it step by step.',
    'gui.hraiLessons.back': 'Back to lessons',
    'gui.hraiLessons.stages': 'Lesson steps',
    'gui.hraiLessons.duration': 'Duration: {duration}',
    'gui.hraiLessons.concepts': 'New concepts: {concepts}',
    'gui.hraiLessons.close': 'Close',
    'gui.hraiLessons.start': 'Start with guidance',
    'gui.hraiLessons.startPrompt':
        'This will replace the open project with the prepared lesson starter. Continue?',
    'gui.hraiLessons.bundleNote':
        'After starting, hrai will appear in the panel and follow the steps you build.',
    'gui.aria.hraiPanel': 'hrai panel',
    'gui.hrai.title': 'hrai',
    'gui.hrai.messageListLabel': 'Conversation with hrai',
    'gui.hrai.inputLabel': 'Message for hrai',
    'gui.hrai.sendButton': 'Send',
    'gui.hrai.hintButton': 'Get a hint',
    'gui.hrai.hintMaxReached': 'That is the most direct hint I can give you.',
    'gui.hrai.thinking': 'hrai is thinking…',
    'gui.hrai.blockReference': 'Go to block {alias}',
    'gui.hrai.blockOpcode': 'Block {label}, category {category}',
    'gui.aria.resizeHraiPanel': 'Resize hrai panel',
    'gui.hrai.currentLesson': 'Lesson: {title}',
    'gui.hrai.currentStage': 'Step {current} of {total}',
    'gui.hrai.nextStage': 'Next step',
    'gui.hrai.lessonComplete': 'Great! This step is complete.',
    'gui.hrai.stageAction': 'Do this now',
    'gui.hrai.stageSuccess': 'Complete when',
    'gui.hrai.voiceStart': 'Record voice',
    'gui.hrai.voiceStop': 'Stop recording',
    'gui.hrai.voiceTranscribing': 'Transcribing recording…',
    'gui.hrai.voiceUnavailable': 'Voice input is not available right now.',
    'gui.hrai.voicePermissionDenied': 'Allow microphone access in browser settings, or type a message.',
    'gui.hrai.voiceUnsupported': 'This browser cannot record voice.',
    'gui.hrai.voiceFailed': 'The recording could not be transcribed. Try again, or type a message.',
    'gui.menuBar.hraiLessonsLibrary': 'hrai lessons',
    'gui.stageHeader.hraiAssistantOn': 'Turn off hrai assistant',
    'gui.stageHeader.hraiAssistantOff': 'Turn on hrai assistant',
    'gui.hrai.helperUnavailable': 'The helper is not available right now.'
};

const forLocale = locale => {
    if (locale === 'cs') return cs;
    return en;
};

export {
    cs,
    en,
    forLocale
};
