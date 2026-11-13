// All user-facing strings. Languages: cs (source), en, de — same keys in each.
// The chosen language is persisted; switching reloads the page (see title.js).
// Placeholders look like {n}. The rubber stamp texts stay Czech in every language (it is a period stamp).

const STRINGS = {
  cs: {
    langName: 'Čeština',
    shot0: 'Pivovar Světovar, Plzeň-Bory', shot1: 'Pohled od polní cesty', shot2: 'Komín kotelny', shot3: 'Hlavní brána',
    // main menu
    gameKicker: 'Plzeň · 1910–1933',
    gameTitle: 'Cesta historií TechToweru',
    titleSmall: 'Cesta historií',
    titleBig: 'TechToweru',
    storyMode: 'Příběhový mód',
    newGame: 'Nová hra',
    continueGame: 'Pokračovat',
    continueMeta: 'Úroveň {n}',
    noSave: 'Zatím bez uložené hry',
    levels: 'Levely',
    about: 'O hře',
    back: 'Zpět',
    menu: 'Menu',
    language: 'Jazyk',
    levelsLocked: 'Levely se odemknou, jakmile začnete příběhový mód.',
    level: 'Úroveň {n}',
    level1Name: 'Jízda autem',
    level1Desc: 'Sudy z náměstí do Světovaru',
    level2Name: 'Válení sudů ve sklepě',
    level2Desc: 'Připravujeme',
    locked: 'Zamčeno',
    best: 'Nejlepší {time}',
    aboutText:
      'Krátké akční kapitoly vás provedou historií budov, ve kterých dnes sídlí TechTower. V letech 1910–1933 tu stál pivovar Světovar a vy v něm zažijete obyčejný pracovní den.',
    aboutMeta: 'Prototyp · kapitola 1 · zvuky generované v prohlížeči',
    prologue: 'Prolog',
    prologue1: 'Vážení, vítejte na cestě historií TechToweru. Lepšího průvodce byste nenašli. Jsem totiž Aneta Chodorová, organizátorka hackathonů.',
    prologue2: 'TechTower je dneska dominantou Plzně v moderních technologiích a sjíždějí se sem odborníci z celého národa.',
    prologueBy: 'Aneta Chodorová, průvodkyně',
    prologueGo: 'Do roku 1926',

    // level 1 briefing
    title: 'Plzeň 1926',
    subtitle: 'Jízda do Světovaru',
    mission:
      'Dovezte {n} z náměstí Republiky do pivovaru Světovar do {time}. Smíte ztratit nejvýš {max}. Pozor v zatáčkách a na hrbolatých dlažebních kostkách.',
    hintTouch: 'Levým palcem zatáčíte, pravým dáváte plyn a brzdíte.',
    hintKeys: 'Šipky nebo W A S D – řízení  ·  mezerník – brzda  ·  H – klakson  ·  P – pauza',
    start: 'Vyjet',
    ticket: 'Plzeň · Světovar',
    go: 'Jeď',

    // HUD
    timeLabel: 'Zbývá',
    routeFrom: 'Náměstí',
    routeTo: 'Světovar',
    lostCount: 'Ztraceno {lost} z {max}',
    barrelsLabel: 'Sudy',
    kmh: 'km/h',
    warning: 'Pozor, sudy se kývají',
    toastLost: 'Sud spadl',
    toastLostCount: 'ztraceno {lost} z {max}',
    toastLastChance: 'Poslední šance',
    pause: 'Pauza',

    // touch controls
    left: 'Vlevo',
    right: 'Vpravo',
    gas: 'Plyn',
    brake: 'Brzda',
    horn: 'Klakson',

    // pause / settings
    paused: 'Pauza',
    resume: 'Pokračovat',
    restart: 'Začít znovu',
    volume: 'Hlasitost',
    soundOn: 'Zvuk: zapnut',
    soundOff: 'Zvuk: vypnut',
    fullscreenOn: 'Celá obrazovka',
    fullscreenOff: 'Okno',

    // results
    winTitle: 'Sudy jsou ve Světovaru',
    noteKind: 'Dodací list',
    noteRoute: 'Náměstí Republiky → Světovar',
    winLine1: 'Mistrovská jízda',
    winLine2: 'Dobrá práce, pivo dorazilo',
    winLine3: 'Dovezeno, ale vyšlo to těsně',
    time: 'Čas',
    delivered: 'Dovezeno sudů',
    again: 'Jet znovu',
    // TODO: fact-check
    history:
      'Pivovar Světovar (Český plzeňský pivovar) v Plzni na Borech vařil pivo v letech 1913–1933. Jeho budovy dnes slouží jako TechTower – centrum moderních technologií.',
    historyTitle: 'Z historie',
    failTime: 'Čas vypršel',
    failBarrels: 'Ztratili jste příliš mnoho sudů',
    tryAgain: 'Zkusit znovu',
    tipTime: 'Na rovinkách nebrzděte zbytečně a držte se středu cesty.',
    tipBarrels: 'Před zatáčkou zpomalte a vyhýbejte se kolejím a hrbolům.',
    lostLabel: 'Ztraceno sudů',

    // portrait overlay
    rotate: 'Otočte telefon na šířku',
    rotateSub: 'Hra se hraje na šířku',
  },

  en: {
    langName: 'English',
    shot0: 'Světovar brewery, Pilsen-Bory', shot1: 'Seen from the field road', shot2: 'The boiler-house chimney', shot3: 'The main gate',
    gameKicker: 'Pilsen · 1910–1933',
    gameTitle: 'A Journey Through TechTower’s History',
    titleSmall: 'A journey through the history of',
    titleBig: 'TechTower',
    storyMode: 'Story mode',
    newGame: 'New game',
    continueGame: 'Continue',
    continueMeta: 'Level {n}',
    noSave: 'No saved game yet',
    levels: 'Levels',
    about: 'About',
    back: 'Back',
    menu: 'Menu',
    language: 'Language',
    levelsLocked: 'Levels unlock once you start the story mode.',
    level: 'Level {n}',
    level1Name: 'The delivery run',
    level1Desc: 'Barrels from the square to Světovar',
    level2Name: 'Rolling barrels in the cellar',
    level2Desc: 'Coming soon',
    locked: 'Locked',
    best: 'Best {time}',
    aboutText:
      'Short action chapters take you through the history of the buildings that house TechTower today. From 1910 to 1933 this was the Světovar brewery, and you spend an ordinary working day there.',
    aboutMeta: 'Prototype · chapter 1 · sounds generated in the browser',
    prologue: 'Prologue',
    prologue1: 'Welcome, everyone, to a journey through TechTower’s history. You couldn’t ask for a better guide: I’m Aneta Chodorová, hackathon organiser.',
    prologue2: 'Today TechTower is Pilsen’s landmark for modern technology, and experts come here from all over the country.',
    prologueBy: 'Aneta Chodorová, your guide',
    prologueGo: 'To 1926',

    title: 'Pilsen 1926',
    subtitle: 'The run to Světovar',
    mission:
      'Deliver {n} from Republic Square to the Světovar brewery within {time}. You may lose at most {max}. Careful in the corners and on the bumpy cobblestones.',
    hintTouch: 'Steer with your left thumb, accelerate and brake with your right.',
    hintKeys: 'Arrows or W A S D – drive  ·  Space – brake  ·  H – horn  ·  P – pause',
    start: 'Drive off',
    ticket: 'Pilsen · Světovar',
    go: 'Go',

    timeLabel: 'Time left',
    routeFrom: 'Square',
    routeTo: 'Světovar',
    lostCount: 'Lost {lost} of {max}',
    barrelsLabel: 'Barrels',
    kmh: 'km/h',
    warning: 'Careful, the barrels are rocking',
    toastLost: 'Barrel lost',
    toastLostCount: 'lost {lost} of {max}',
    toastLastChance: 'Last chance',
    pause: 'Pause',

    left: 'Left',
    right: 'Right',
    gas: 'Gas',
    brake: 'Brake',
    horn: 'Horn',

    paused: 'Paused',
    resume: 'Resume',
    restart: 'Start over',
    volume: 'Volume',
    soundOn: 'Sound: on',
    soundOff: 'Sound: off',
    fullscreenOn: 'Full screen',
    fullscreenOff: 'Window',

    winTitle: 'The barrels reached Světovar',
    noteKind: 'Delivery note',
    noteRoute: 'Republic Square → Světovar',
    winLine1: 'A masterful drive',
    winLine2: 'Good work, the beer arrived',
    winLine3: 'Delivered, but only just',
    time: 'Time',
    delivered: 'Barrels delivered',
    again: 'Drive again',
    // TODO: fact-check
    history:
      'The Světovar brewery (Czech Pilsen Brewery) in the Bory district of Pilsen brewed beer from 1913 to 1933. Its buildings now house TechTower, a centre for modern technology.',
    historyTitle: 'From history',
    failTime: 'Time is up',
    failBarrels: 'Too many barrels lost',
    tryAgain: 'Try again',
    tipTime: 'Don’t brake on the straights and keep to the middle of the road.',
    tipBarrels: 'Slow down before corners and avoid the tram rails and bumps.',
    lostLabel: 'Barrels lost',

    rotate: 'Turn your phone sideways',
    rotateSub: 'The game is played in landscape',
  },

  de: {
    langName: 'Deutsch',
    shot0: 'Brauerei Světovar, Pilsen-Bory', shot1: 'Blick vom Feldweg', shot2: 'Der Schornstein des Kesselhauses', shot3: 'Das Haupttor',
    gameKicker: 'Pilsen · 1910–1933',
    gameTitle: 'Eine Reise durch die Geschichte des TechTower',
    titleSmall: 'Eine Reise durch die Geschichte des',
    titleBig: 'TechTower',
    storyMode: 'Story-Modus',
    newGame: 'Neues Spiel',
    continueGame: 'Fortsetzen',
    continueMeta: 'Level {n}',
    noSave: 'Noch kein Spielstand',
    levels: 'Level',
    about: 'Über das Spiel',
    back: 'Zurück',
    menu: 'Menü',
    language: 'Sprache',
    levelsLocked: 'Die Level werden freigeschaltet, sobald du den Story-Modus startest.',
    level: 'Level {n}',
    level1Name: 'Die Lieferfahrt',
    level1Desc: 'Fässer vom Marktplatz zum Světovar',
    level2Name: 'Fässerrollen im Keller',
    level2Desc: 'In Vorbereitung',
    locked: 'Gesperrt',
    best: 'Bestzeit {time}',
    aboutText:
      'Kurze Action-Kapitel führen dich durch die Geschichte der Gebäude, in denen heute der TechTower sitzt. Von 1910 bis 1933 stand hier die Brauerei Světovar, und du erlebst dort einen gewöhnlichen Arbeitstag.',
    aboutMeta: 'Prototyp · Kapitel 1 · Klänge im Browser erzeugt',
    prologue: 'Prolog',
    prologue1: 'Herzlich willkommen auf der Reise durch die Geschichte des TechTower. Eine bessere Führerin findet ihr nicht: Ich bin Aneta Chodorová, Organisatorin von Hackathons.',
    prologue2: 'Heute ist der TechTower das Wahrzeichen Pilsens für moderne Technologien, und Fachleute aus dem ganzen Land kommen hierher.',
    prologueBy: 'Aneta Chodorová, eure Führerin',
    prologueGo: 'Ins Jahr 1926',

    title: 'Pilsen 1926',
    subtitle: 'Die Fahrt zum Světovar',
    mission:
      'Bringe {n} vom Platz der Republik zur Brauerei Světovar, Zeit: {time}. Du darfst höchstens {max} verlieren. Vorsicht in den Kurven und auf dem holprigen Kopfsteinpflaster.',
    hintTouch: 'Mit dem linken Daumen lenken, mit dem rechten Gas geben und bremsen.',
    hintKeys: 'Pfeile oder W A S D – fahren  ·  Leertaste – Bremse  ·  H – Hupe  ·  P – Pause',
    start: 'Losfahren',
    ticket: 'Pilsen · Světovar',
    go: 'Los',

    timeLabel: 'Restzeit',
    routeFrom: 'Platz',
    routeTo: 'Světovar',
    lostCount: 'Verloren {lost} von {max}',
    barrelsLabel: 'Fässer',
    kmh: 'km/h',
    warning: 'Vorsicht, die Fässer wackeln',
    toastLost: 'Fass verloren',
    toastLostCount: 'verloren {lost} von {max}',
    toastLastChance: 'Letzte Chance',
    pause: 'Pause',

    left: 'Links',
    right: 'Rechts',
    gas: 'Gas',
    brake: 'Bremse',
    horn: 'Hupe',

    paused: 'Pause',
    resume: 'Weiter',
    restart: 'Neu starten',
    volume: 'Lautstärke',
    soundOn: 'Ton: an',
    soundOff: 'Ton: aus',
    fullscreenOn: 'Vollbild',
    fullscreenOff: 'Fenster',

    winTitle: 'Die Fässer sind im Světovar',
    noteKind: 'Lieferschein',
    noteRoute: 'Platz der Republik → Světovar',
    winLine1: 'Meisterhafte Fahrt',
    winLine2: 'Gute Arbeit, das Bier ist da',
    winLine3: 'Geliefert, aber knapp',
    time: 'Zeit',
    delivered: 'Gelieferte Fässer',
    again: 'Nochmal fahren',
    // TODO: fact-check
    history:
      'Die Brauerei Světovar (Böhmische Pilsner Brauerei) im Pilsner Stadtteil Bory braute von 1913 bis 1933 Bier. In ihren Gebäuden sitzt heute der TechTower, ein Zentrum für moderne Technologien.',
    historyTitle: 'Aus der Geschichte',
    failTime: 'Die Zeit ist um',
    failBarrels: 'Zu viele Fässer verloren',
    tryAgain: 'Nochmal versuchen',
    tipTime: 'Auf den Geraden nicht unnötig bremsen und in der Straßenmitte bleiben.',
    tipBarrels: 'Vor Kurven abbremsen und Schienen und Bodenwellen meiden.',
    lostLabel: 'Verlorene Fässer',

    rotate: 'Drehe dein Handy quer',
    rotateSub: 'Das Spiel wird im Querformat gespielt',
  },
};

// The period stamp is Czech in every language.
const STAMP = { stampTop: 'PIVOVAR SVĚTOVAR', stampBottom: 'PLZEŇ', stampFail: 'NEDODÁNO' };

export const LANGS = ['cs', 'en', 'de'];
const LANG_KEY = 'plzen1926.lang.v1';

function initialLang() {
  try { const l = localStorage.getItem(LANG_KEY); if (l && STRINGS[l]) return l; } catch { /* ignore */ }
  const nav = (navigator.language || 'cs').slice(0, 2).toLowerCase();
  return STRINGS[nav] ? nav : 'cs';
}
let lang = initialLang();
document.documentElement.lang = lang;

export function getLang() { return lang; }
/** Persist the language; the caller reloads the page so every static string is rebuilt. */
export function setLang(l) {
  if (!STRINGS[l]) return;
  lang = l;
  try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
}
export function langName(l) { return STRINGS[l]?.langName || l; }

export function t(key, vars) {
  let s = STAMP[key] ?? (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.cs[key] ?? key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

/** "{n} barrels" in the current language (Czech: 1 sud, 2–4 sudy, 5+ sudů). */
export function barrels(n) {
  if (lang === 'en') return n === 1 ? '1 barrel' : `${n} barrels`;
  if (lang === 'de') return n === 1 ? '1 Fass' : `${n} Fässer`;
  if (n === 1) return '1 sud';
  if (n >= 2 && n <= 4) return `${n} sudy`;
  return `${n} sudů`;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}
