// Level 4 "Varna" (first-person catwalk run) — all user-facing strings (owner: ui). Same shape as ../ui/i18n.js:
// placeholders {n}, one language for the prototype. fmtTime is shared with level 1 (import it from ../ui/i18n.js).
// Section names come from course.js (single source of truth).

const STRINGS = {
  cs: {
    title: 'Plzeň 1926',
    subtitle: 'Varna',
    goal: 'Kotel se přehřívá!',
    mission: 'Doběhněte po lávkách k hlavnímu parnímu ventilu, než to překypí.',
    hz_dodge: 'Pára a kapky',
    hz_dodgeDo: 'uhněte',
    hz_jump: 'Díry a trubky',
    hz_jumpDo: 'skočte',
    hz_sack: 'Padající pytle',
    hz_sackDo: 'uhněte nebo přeskočte',
    hintTouch: 'Tlačítka ◀ ▶ – uhnout  ·  červené tlačítko – skok  ·  nebo švihněte prstem doleva, doprava, nahoru',
    hintKeys: '← → nebo A D – uhnout  ·  mezerník nebo ↑ – skok  ·  P – pauza',
    start: 'Běžet!',

    // countdown
    go: 'Běž!',

    // HUD
    pressure: 'Tlak',
    atm: 'atm',
    left: 'zbývá',
    hitsLabel: 'Zakopnutí',
    progressLabel: 'Cesta k ventilu',
    pause: 'Pauza',
    btnLeft: 'Vlevo',
    btnRight: 'Vpravo',
    btnJump: 'Skok',

    // toasts
    toastFall: 'Propadli jste!',
    penalty: '−{n} s',
    toastLast: 'Posledních 10 sekund!',
    toastLastSub: 'kotel už skoro kypí',

    // pause
    paused: 'Pauza',
    resume: 'Pokračovat',
    restart: 'Začít znovu',
    volume: 'Hlasitost',
    soundOn: 'Zvuk: zapnut',
    soundOff: 'Zvuk: vypnut',
    fullscreenOn: 'Celá obrazovka',
    fullscreenOff: 'Okno',

    // results
    noteKind: 'Výkaz směny',
    noteWhere: 'Varna Světovar',
    winTitle: 'Ventil je otevřený',
    winLine1: 'Ani jednou jste nezakopli, sládek smeká',
    winLine2: 'Dobrá práce, kotel je v bezpečí',
    winLine3: 'Na poslední chvíli, ale várka je zachráněná',
    stampTop: 'PIVOVAR SVĚTOVAR',
    stampBottom: 'PLZEŇ',
    stampFail: 'PŘEKYPĚLO',
    rTime: 'Čas',
    rLeft: 'Zbývalo',
    rHits: 'Zakopnutí',
    rFalls: 'Pády',
    rProgress: 'Uběhnuto',
    again: 'Běžet znovu',
    historyTitle: 'Z historie',
    // TODO: fact-check
    history:
      'Ve varně Světovaru stály měděné pánve na mladinu a rmutovací kádě. Plzeňský ležák se vařil dekokcí: část rmutu se odčerpala do pánve, povařila a vrátila zpět – tradičně třikrát. Pára pro ohřev proudila potrubím z kotelny a hlídal ji manometr.',
    failTitle: 'Překypělo to!',
    failLine: 'Kotel překypěl dřív, než jste doběhli k ventilu',
    tipFalls: 'Díru přeskočte, nebo uhněte do vedlejšího pruhu. Každý pád vás vrátí zpátky a stojí čas.',
    tipHits: 'Páru a kapky přečkejte ve vedlejším pruhu, trubky a pytle přeskočte. Každé zakopnutí vás zbrzdí.',
    tipTime: 'Neuhýbejte zbytečně a skákejte až těsně před překážkou, ať jste zase rychle na lávce.',
    tryAgain: 'Zkusit znovu',

    // portrait overlay
    rotate: 'Otočte telefon na šířku',
    rotateSub: 'Hra se hraje na šířku',
  },
};

let lang = 'cs';
export function setLang(l) { if (STRINGS[l]) lang = l; }

export function t(key, vars) {
  let s = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.cs[key] ?? key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

/** Czech decimal: 2.5 -> "2,5", 3 -> "3" */
export function fmtNum(v, digits = 1) {
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return String(r).replace('.', ',');
}
