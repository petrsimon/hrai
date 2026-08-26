const cs = {
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
