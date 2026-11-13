// All user-facing strings live here. Add another language by adding a key to STRINGS (same keys as 'cs')
// and calling setLang('en'). Placeholders look like {n}. Plural forms: array [one, few, many] for Czech.

const STRINGS = {
  cs: {
    title: 'Plzeň 1926',
    subtitle: 'Jízda do Světovaru',
    // {n} barrels, {time} mm:ss, {max} barrels
    mission:
      'Dovezte {n} z náměstí Republiky do pivovaru Světovar do {time}. Smíte ztratit nejvýš {max}. Pozor v zatáčkách a na hrbolatých dlažebních kostkách.',
    hintTouch: 'Levým palcem zatáčíte, pravým dáváte plyn a brzdíte.',
    hintKeys: 'Šipky nebo W A S D – řízení  ·  mezerník – brzda  ·  H – klakson  ·  P – pauza',
    start: 'Vyjet',
    ticket: 'Plzeň · Světovar',

    // countdown
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
    winTitle: 'Sudy jsou ve Světovaru',
    noteKind: 'Dodací list',
    noteRoute: 'Náměstí Republiky → Světovar',
    stampTop: 'PIVOVAR SVĚTOVAR',
    stampBottom: 'PLZEŇ',
    stampFail: 'NEDODÁNO',
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

    // level switcher (menu of every level)
    levelN: 'Level {n}',
    levelPick: 'Výběr levelu',

    // ---------------- level 3 "Gangsteři ve Světovaru" ----------------
    g3title: 'Gangsteři ve Světovaru',
    g3subtitle: 'Plzeň 1929 · noční služba',
    // {time} mm:ss, {max} barrels (accusative, e.g. "3 sudy")
    g3mission:
      'Jste noční hlídač pivovaru Světovar. Oknem se dovnitř derou gangsteři a chtějí odnést sudy. Brokovnici máte nabitou solí. Vydržte {time}, než dorazí policie, a nedovolte jim odnést víc než {max}. Hlídače s lucernou nestřílejte!',
    g3hintTouch: 'Tažením prstu míříte, ťuknutím nebo tlačítkem Pal střílíte, tlačítko Nabít nabíjí.',
    g3hintKeys: 'Myší míříte, kliknutím střílíte, R nabíjí',
    g3hintKeys2: 'Esc – pauza',
    g3clickToAim: 'Klikněte do hry – myší pak míříte',
    g3fire: 'Pal',
    g3start: 'Nastoupit službu',
    g3go: 'Hlídej',

    // HUD
    g3timeLabel: 'Policie za',
    g3stolenCount: 'Ukradeno {stolen} z {max}',
    g3barrelsLabel: 'Sudy ve sklepě',
    g3scoreLabel: 'Body',
    g3shellsLabel: 'Náboje',
    g3reload: 'Nabít',
    g3reloadKey: 'Nabít – R',
    g3reloading: 'Nabíjím…',
    g3toastStolen: 'Sud ukraden',
    g3toastStolenCount: 'ukradeno {stolen} z {max}',
    g3toastLastChance: 'Další už nesmí zmizet',
    g3toastInnocent: 'To byl hlídač!',
    g3toastInnocentSub: 'Hlídače s lucernou nestřílejte',
    g3toastRecovered: 'Sud zachráněn',

    // results
    g3noteKind: 'Hlášení noční služby',
    g3noteWhere: 'Světovar, 1929',
    g3stampTop: 'PIVOVAR SVĚTOVAR',
    g3stampBottom: 'NOČNÍ SLUŽBA',
    g3stampFail: 'VYKRADENO',
    g3winTitle: 'Policie dorazila',
    g3winLine1: 'Ani jeden sud nezmizel',
    g3winLine2: 'Dobrá služba, sklep ubráněn',
    g3winLine3: 'Ubráněno, ale bylo to těsné',
    g3score: 'Body',
    g3stolen: 'Ukradeno sudů',
    g3again: 'Další noc',
    // TODO: fact-check
    g3history:
      'Světovar vařil pivo v letech 1913–1933, tedy i v době, kdy v Americe platila prohibice (1920–1933) a obchod s pivem tam ovládli gangsteři. Rozlehlý areál na Borech měl vlastní železniční vlečku a v noci jej obcházeli hlídači.',
    g3historyTitle: 'Z historie',
    g3failBarrels: 'Gangsteři odnesli příliš mnoho sudů',
    g3failOther: 'Služba skončila nezdarem',
    g3tipBarrels: 'Střílejte nejdřív na ty, kdo už drží sud – a nabíjejte, dokud je klid.',
    g3tipOther: 'Hlídejte všechna okna a nabíjejte včas.',
    g3tryAgain: 'Zkusit znovu',
  },
};

let lang = 'cs';

export function setLang(l) { if (STRINGS[l]) lang = l; }
export function getLang() { return lang; }

export function t(key, vars) {
  let s = (STRINGS[lang] && STRINGS[lang][key]) ?? STRINGS.cs[key] ?? key;
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

// "{n} sudů" with correct Czech plural (1 sud, 2-4 sudy, 5+ sudů). Accusative for "dovezte 10 sudů", "ztratit 2 sudy".
export function barrels(n) {
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
