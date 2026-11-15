// Level 5 "Šílená stáčírna" — all user-facing strings (owner: ui). Same shape as ../ui/i18n.js: placeholders {n},
// one language for the prototype. fmtTime + barrels() are shared with level 1 (import them from ../ui/i18n.js).
// Station names / verbs / colours come from config.js STATIONS (single source of truth).

const STRINGS = {
  cs: {
    title: 'Plzeň 1926',
    subtitle: 'Šílená stáčírna',
    // {n} = "12 sudů"
    goal: 'Stočte {n} pro Plzeň',
    intro: 'Sudy jezdí po pásu dokola. Výhybkami je posílejte do strojů v tomhle pořadí:',
    rule: 'Pošlete sud jen tam, kam ukazuje jeho barevný štítek.',
    con_wash: 'Plný do myčky: pivo se vylije',
    con_fill: 'Neumytý pod plničkou praskne',
    con_cap: 'Prázdný pod naražečem: chyba',
    con_ship: 'Na expedici jen zatlučené',
    hintTouch: 'Ťukněte na výhybku na pásu (barevný terč s číslem). Zapnutá výhybka sud odbočí, vypnutá ho pustí rovně.',
    hintKeys: 'Klávesy 1 až 4 nebo klik na výhybku: přepnout  ·  zapnutá odbočí, vypnutá pustí rovně  ·  P: pauza',
    start: 'Spustit linku',

    // countdown
    go: 'Jede!',

    // HUD
    timeLabel: 'Čas',
    shipped: 'Stočeno {n} z {q}',
    shippedLabel: 'Stočené sudy',
    strikesLabel: 'Chyby',
    speedLabel: 'Rychlost pásu',
    ms: 'm/s',
    pause: 'Pauza',
    swOn: 'odbočit',
    swOff: 'rovně',
    swAria: 'Výhybka {n}: {name}',
    coach: 'Štítek nad sudem ukazuje, kam má jet. Včas mu přepněte výhybku.',

    // toasts / banners
    toastBurst: 'Sud praskl!',
    toastBurstSub: 'nebyl umytý',
    toastReject: 'Sud vrácen',
    toastRejectSub: 'není hotový',
    toastCapEmpty: 'Prázdný sud zatlučen!',
    toastCapEmptySub: 'nejdřív ho naplňte',
    toastSpill: 'Pivo vypláchnuto!',
    toastSpillSub: 'sud musí znovu do plničky',
    liftWarn: 'Výtah se plní {q}/{m}: posílejte sudy dál!',
    need_wash: 'ještě není umytý',
    need_fill: 'ještě není naplněný',
    need_cap: 'ještě není zatlučený',
    lastStrike: 'Ještě jedna chyba a linka stojí',
    speedUp: 'Pás zrychluje',
    almost: 'Poslední sud!',

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
    noteKind: 'Stáčecí list',
    noteWhere: 'Stáčírna Světovar',
    winTitle: 'Sudy jsou stočené',
    winLine1: 'Bez jediné chyby, mistr stáčeč smeká',
    winLine2: 'Dobrá práce, Plzeň má pivo',
    winLine3: 'Stočeno, ale pár sudů padlo',
    stampTop: 'PIVOVAR SVĚTOVAR',
    stampBottom: 'PLZEŇ',
    stampFail: 'ZASTAVENO',
    rShipped: 'Stočeno',
    rBurst: 'Prasklé sudy',
    rReject: 'Vrácené sudy',
    rSpill: 'Vylité pivo',
    time: 'Čas',
    again: 'Stáčet znovu',
    historyTitle: 'Z historie',
    // TODO: fact-check
    history:
      'Ve 20. letech se ležák stáčel do dubových sudů, uvnitř vysmolených pivovarskou smolou, aby pivo nechytlo pachuť dřeva. Sud se nejdřív vymyl horkou vodou, pak naplnil a otvor se zatloukl dřevěnou zátkou. Plné sudy odvážely do hospod koňské povozy a nákladní auta.',
    failTitle: 'Linka zastavena',
    failLine: 'Tři chyby, mistr zastavil pás',
    failJam: 'Linka se ucpala',
    failJamLine: 'Výtah z ležáckého sklepa přetekl',
    tipJam: 'Nenechávejte sudy kroužit dokola. Každý sud hned pošlete do stroje podle štítku a hotové sudy na expedici.',
    tipCap: 'Na naražeč posílejte jen plné sudy s červeným štítkem. Prázdný sud se musí nejdřív naplnit.',
    tipBurst: 'Modrý štítek = sud je špinavý a musí nejdřív do myčky. Výhybku 2 zapínejte jen pro sudy s jantarovým štítkem.',
    tipReject: 'Na expedici posílejte jen sudy se zeleným štítkem. Výhybku 4 po odbočení hned zase vypněte.',
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
