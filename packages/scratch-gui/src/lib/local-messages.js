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
    'gui.hraiLessons.title': 'Lekce HRAI',
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
        'Po spuštění se ti HRAI objeví v panelu a bude sledovat kroky, které právě tvoříš.',
    'gui.aria.hraiPanel': 'panel HRAI',
    'gui.hrai.title': 'HRAI',
    'gui.hrai.messageListLabel': 'Konverzace s HRAI',
    'gui.hrai.inputLabel': 'Zpráva pro HRAI',
    'gui.hrai.sendButton': 'Odeslat',
    'gui.hrai.hintButton': 'Poradit',
    'gui.hrai.hintMaxReached': 'To je ta nejpřímější rada, jakou ti můžu dát.',
    'gui.hrai.thinking': 'HRAI přemýšlí…',
    'gui.hrai.blockReference': 'Přejít na blok {alias}',
    'gui.hrai.blockOpcode': 'Blok {label}, kategorie {category}',
    'gui.aria.resizeHraiPanel': 'Změnit velikost panelu HRAI',
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
    'gui.hrai.gamePlanning': 'Připravuji malou hratelnou verzi…',
    'gui.hrai.gameStartPrompt': 'Co chceš vytvořit? Napiš svůj nápad a společně z něj uděláme malou hru.',
    'gui.hrai.gamePlanQuestion': 'Mám z tohoto nápadu připravit plán hry?',
    'gui.hrai.existingProjectQuestion':
        'V tomto projektu už něco máš. Pro nový nápad bude jednodušší ' +
        'začít nový projekt. Co chceš udělat?',
    'gui.hrai.continueProject': 'Pokračovat v tomto projektu',
    'gui.hrai.startNewProject': 'Začít nový projekt',
    'gui.hrai.prepareGamePlan': 'Připravit plán hry',
    'gui.hrai.newProjectConfirmation':
        'Tím nahradíš právě otevřený projekt novým. Současný projekt se nejdřív uloží, pokud je potřeba. Pokračovat?',
    'gui.hrai.originalGoal': 'Tvůj nápad',
    'gui.hrai.coreLoop': 'Jak se hra hraje',
    'gui.hrai.gameMilestones': 'Cesta ke hře',
    'gui.hrai.acceptGamePlan': 'Tento plán se mi líbí',
    'gui.hrai.editGameIdea': 'Upravit nápad',
    'gui.hrai.currentGame': 'Tvoje hra: {title}',
    'gui.hrai.currentGameMilestone': '{current} z {total}',
    'gui.hrai.milestoneWhy': 'Proč teď',
    'gui.hrai.milestoneConcept': 'Co si procvičíš',
    'gui.hrai.gameMilestoneComplete': 'Výborně! Tento milník je hotový.',
    'gui.hrai.nextGameMilestone': 'Další milník',
    'gui.hrai.gamePlanComplete': 'Dokončil jsi plán své hry!',
    'gui.hrai.gamePlaytest': 'Teď si hru vyzkoušej',
    'gui.hrai.gamePlaytestHint': 'Spusť hru zelenou vlajkou, chvíli si s ní hraj a všimni si, co chceš změnit.',
    'gui.hrai.startGameGuidance': 'Začít upravovat s HRAI',
    'gui.hrai.gameFeedbackLabel': 'Co chceš po vyzkoušení změnit?',
    'gui.hrai.gameFeedbackPlaceholder': 'Například: Chci, aby drak skákal výš.',
    'gui.menuBar.hraiLessonsLibrary': 'Lekce HRAI',
    'gui.stageHeader.hraiAssistantOn': 'Vypnout asistenta HRAI',
    'gui.stageHeader.hraiAssistantOff': 'Zapnout asistenta HRAI',
    'gui.hrai.helperUnavailable': 'Pomocník teď není k dispozici.'
};

const en = {
    'gui.hraiLessons.title': 'HRAI lessons',
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
        'After starting, HRAI will appear in the panel and follow the steps you build.',
    'gui.aria.hraiPanel': 'HRAI panel',
    'gui.hrai.title': 'HRAI',
    'gui.hrai.messageListLabel': 'Conversation with HRAI',
    'gui.hrai.inputLabel': 'Message for HRAI',
    'gui.hrai.sendButton': 'Send',
    'gui.hrai.hintButton': 'Get a hint',
    'gui.hrai.hintMaxReached': 'That is the most direct hint I can give you.',
    'gui.hrai.thinking': 'HRAI is thinking…',
    'gui.hrai.blockReference': 'Go to block {alias}',
    'gui.hrai.blockOpcode': 'Block {label}, category {category}',
    'gui.aria.resizeHraiPanel': 'Resize HRAI panel',
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
    'gui.hrai.gamePlanning': 'Preparing a small playable version…',
    'gui.hrai.gameStartPrompt': 'What do you want to create? Share your idea and we will turn it into a small game.',
    'gui.hrai.gamePlanQuestion': 'Should I prepare a game plan from this idea?',
    'gui.hrai.existingProjectQuestion':
        'You already have work in this project. Starting a new project will be easier ' +
        'for a new idea. What do you want to do?',
    'gui.hrai.continueProject': 'Continue in this project',
    'gui.hrai.startNewProject': 'Start a new project',
    'gui.hrai.prepareGamePlan': 'Prepare game plan',
    'gui.hrai.newProjectConfirmation':
        'This will replace the open project with a new one. The current project will be saved first ' +
        'if needed. Continue?',
    'gui.hrai.originalGoal': 'Your idea',
    'gui.hrai.coreLoop': 'How the game plays',
    'gui.hrai.gameMilestones': 'Path to your game',
    'gui.hrai.acceptGamePlan': 'I like this plan',
    'gui.hrai.editGameIdea': 'Edit my idea',
    'gui.hrai.currentGame': 'Your game: {title}',
    'gui.hrai.currentGameMilestone': '{current} of {total}',
    'gui.hrai.milestoneWhy': 'Why now',
    'gui.hrai.milestoneConcept': 'What you will practise',
    'gui.hrai.gameMilestoneComplete': 'Great! This milestone is complete.',
    'gui.hrai.nextGameMilestone': 'Next milestone',
    'gui.hrai.gamePlanComplete': 'You completed your game plan!',
    'gui.hrai.gamePlaytest': 'Now test your game',
    'gui.hrai.gamePlaytestHint':
        'Start the game with the green flag, play for a while, and notice what you want to change.',
    'gui.hrai.startGameGuidance': 'Start editing with HRAI',
    'gui.hrai.gameFeedbackLabel': 'What do you want to change after testing?',
    'gui.hrai.gameFeedbackPlaceholder': 'For example: I want the dragon to jump higher.',
    'gui.menuBar.hraiLessonsLibrary': 'HRAI lessons',
    'gui.stageHeader.hraiAssistantOn': 'Turn off HRAI assistant',
    'gui.stageHeader.hraiAssistantOff': 'Turn on HRAI assistant',
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
