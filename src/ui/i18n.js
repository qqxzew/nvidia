// All user-facing strings live here. Add another language by adding a key to STRINGS (same keys as 'cs')
// and calling setLang('en'). Placeholders look like {n}. Plural forms: array [one, few, many] for Czech.

const STRINGS = {
  cs: {
    title: 'Plzeň 1926',
    subtitle: 'Jízda do Světovaru',
    // {n} barrels, {time} mm:ss, {max} barrels
    mission:
      'Dovezte {n} z náměstí Republiky do pivovaru Světovar do {time}. Smíte ztratit nejvýš {max}. Pozor v zatáčkách a na hrbolatých dlažebních kostkách!',
    hintTouch: 'Levým palcem zatáčíte, pravým dáváte plyn a brzdíte.',
    hintKeys: 'Šipky nebo W A S D – řízení  ·  mezerník – brzda  ·  H – klakson  ·  P – pauza',
    start: 'Vyjet!',
    ticket: 'Plzeň · Světovar',

    // countdown
    go: 'Jeď!',

    // HUD
    timeLabel: 'Zbývá',
    routeFrom: 'Náměstí',
    routeTo: 'Světovar',
    lostCount: 'ztraceno {lost} / {max}',
    barrelsLabel: 'Sudy',
    kmh: 'km/h',
    warning: 'Pozor, sudy se kývají!',
    toastLost: 'Sud spadl! ({lost}/{max})',
    toastLastChance: 'Poslední šance!',
    pause: 'Pauza',

    // touch controls
    left: 'Vlevo',
    right: 'Vpravo',
    gas: 'PLYN',
    brake: 'BRZDA',
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
    winTitle: 'Sudy jsou ve Světovaru!',
    winLine1: 'Mistrovská jízda!',
    winLine2: 'Dobrá práce, pivo dorazilo.',
    winLine3: 'Dovezeno, ale vyšlo to těsně.',
    time: 'Čas',
    delivered: 'Dovezeno sudů',
    again: 'Jet znovu',
    // TODO: fact-check
    history:
      'Pivovar Světovar (Český plzeňský pivovar) v Plzni na Borech vařil pivo v letech 1913–1933. Jeho budovy dnes slouží jako TechTower – centrum moderních technologií.',
    historyTitle: 'Z historie',
    failTime: 'Čas vypršel…',
    failBarrels: 'Ztratili jste příliš mnoho sudů.',
    tryAgain: 'Zkusit znovu',
    tipTime: 'Na rovinkách nebrzděte zbytečně a držte se středu cesty.',
    tipBarrels: 'Před zatáčkou zpomalte a vyhýbejte se kolejím a hrbolům.',
    lostLabel: 'Ztraceno sudů',

    // portrait overlay
    rotate: 'Otočte telefon na šířku',
    rotateSub: 'Hra se hraje vleže.',
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
