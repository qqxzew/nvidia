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
    level2Desc: 'Sudy k výtahu, pozor na krysy',
    level3Name: 'Gangsteři ve Světovaru',
    level3Desc: 'Noční obrana varny před zloději sudů',
    level4Name: 'Varna',
    level4Desc: 'Běh po lávkách nad varnami',
    level5Name: 'Šílená stáčírna',
    level5Desc: 'Stáčení piva na rozjeté lince',
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

    // level 2 (cellar)
    toLevel2: 'Pokračovat: 2. úroveň',
    l2Kicker: 'Světovar · ležácké sklepy',
    l2Title: 'Válení sudů ve sklepě',
    l2Sub: 'Úroveň 2',
    l2Story:
      'Sudy dorazily do Světovaru. Ve sklepě pod pivovarem leží rozházené po bočních chodbách a vy jste sklepník. Každý sud odkutálíte k výtahu do stáčírny.',
    l2Mission:
      'Dokutálejte {n} ke křídou označenému místu u výtahu do {time}. Sudy jen tlačíte před sebou, zatáčejte s nimi v širokých obloucích. Pozor na krysy: {max} kousnutí a končíte.',
    l2HintTouch: 'Levým palcem táhněte kamkoli na obrazovce a sklepník půjde stejným směrem. Sud se kutálí, když ho tlačíte zezadu.',
    l2HintKeys: 'Šipky nebo W A S D – chůze a tlačení  ·  Enter – start  ·  P – pauza',
    l2Start: 'Do sklepa',
    l2Go: 'Valte',
    l2TimeLabel: 'Zbývá',
    l2BarrelsLabel: 'Sudy u výtahu',
    l2BitesLabel: 'Kousnutí',
    l2Guide: 'Směr k cíli',
    l2ToastDelivered: 'Sud doručen',
    l2ToastDeliveredSub: '{n} z {total}',
    l2ToastBite: 'Kousla tě krysa!',
    l2ToastBiteSub: 'kousnutí {n} z {max}',
    l2ToastLast: 'Další kousnutí a končíš',
    l2WinTitle: 'Sudy jsou u výtahu',
    l2NoteRoute: 'Ležácké sklepy → stáčírna',
    l2WinLine1: 'Mistr sklepník',
    l2WinLine2: 'Dobrá práce, sudy jedou do stáčírny',
    l2WinLine3: 'Hotovo, i když to bylo drsné',
    l2Delivered: 'Odkutáleno sudů',
    l2Bites: 'Kousnutí',
    l2Again: 'Válet znovu',
    l2HistoryTitle: 'Z historie',
    l2History:
      'Ležák zrál týdny v chladných sklepích hluboko pod pivovarem. Chlad dodával led nasekaný v zimě a uložený na léto. Pivní sudy po sklepě odkutáleli ručně sklepníci.',
    l2FailTime: 'Čas vypršel',
    l2FailRats: 'Krysy tě zahnaly',
    l2TipTime: 'Sud tlačte rovně zezadu a do zatáček najíždějte v širokém oblouku.',
    l2TipRats: 'Krysy se bojí kutálejícího se sudu. Držte ho mezi sebou a jimi.',

    // portrait overlay
    rotate: 'Otočte telefon na šířku',
    rotateSub: 'Hra se hraje na šířku',

    // level switcher (menu of every level)

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
    level2Desc: 'Barrels to the lift, beware the rats',
    level3Name: 'Gangsters at Světovar',
    level3Desc: 'Guard the brewhouse from barrel thieves by night',
    level4Name: 'The brewhouse',
    level4Desc: 'Run the catwalks above the kettles',
    level5Name: 'The mad bottling hall',
    level5Desc: 'Keep up with the runaway bottling line',
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

    // level 2 (cellar)
    toLevel2: 'Continue: Level 2',
    l2Kicker: 'Světovar · lager cellars',
    l2Title: 'Rolling barrels in the cellar',
    l2Sub: 'Level 2',
    l2Story:
      'The barrels have reached Světovar. Down in the cellar beneath the brewery they lie scattered in the side vaults, and you are the cellarman. Roll each one to the lift to the filling hall.',
    l2Mission:
      'Roll {n} to the chalk-marked spot by the lift within {time}. You can only push barrels ahead of you, so take them round corners in wide arcs. Beware the rats: {max} bites and you are out.',
    l2HintTouch: 'Drag your left thumb anywhere on the screen and the cellarman walks that way. A barrel rolls when you push it from behind.',
    l2HintKeys: 'Arrows or W A S D – walk and push  ·  Enter – start  ·  P – pause',
    l2Start: 'Down we go',
    l2Go: 'Roll',
    l2TimeLabel: 'Time left',
    l2BarrelsLabel: 'Barrels at the lift',
    l2BitesLabel: 'Bites',
    l2Guide: 'Direction to the goal',
    l2ToastDelivered: 'Barrel delivered',
    l2ToastDeliveredSub: '{n} of {total}',
    l2ToastBite: 'A rat bit you!',
    l2ToastBiteSub: 'bite {n} of {max}',
    l2ToastLast: 'One more bite and you are out',
    l2WinTitle: 'The barrels are at the lift',
    l2NoteRoute: 'Lager cellars → filling hall',
    l2WinLine1: 'A master cellarman',
    l2WinLine2: 'Good work, the barrels are off to bottling',
    l2WinLine3: 'Done, though it was rough',
    l2Delivered: 'Barrels rolled in',
    l2Bites: 'Bites',
    l2Again: 'Roll again',
    l2HistoryTitle: 'From history',
    l2History:
      'Lager matured for weeks in cold cellars deep beneath the brewery. The cold came from ice cut in winter and stored for the summer. Cellarmen rolled the barrels through the cellars by hand.',
    l2FailTime: 'Time is up',
    l2FailRats: 'The rats drove you off',
    l2TipTime: 'Push a barrel straight from behind and take corners in a wide arc.',
    l2TipRats: 'Rats shy away from a rolling barrel. Keep it between you and them.',

    rotate: 'Turn your phone sideways',
    rotateSub: 'The game is played in landscape',


    // ---------------- level 3 "Gangsters at Světovar" ----------------
    // (g3stamp* stay Czech in every language, like the level-1 stamp: they fall back to cs)
    g3title: 'Gangsters at Světovar',
    g3subtitle: 'Pilsen 1929 · the night watch',
    // {time} m:ss, {max} barrels ("3 barrels")
    g3mission:
      'You are the night watchman of the Světovar brewery. Gangsters are forcing their way in through the windows to make off with the beer barrels. Your shotgun is loaded with rock salt. Hold out for {time} until the police arrive, and don’t let them carry off more than {max}. Never shoot the watchman with the lantern!',
    g3hintTouch: 'Drag your finger to aim, tap or press Fire to shoot, press Reload to reload.',
    g3hintKeys: 'Aim with the mouse, click to shoot, R to reload',
    g3hintKeys2: 'Esc – pause',
    g3clickToAim: 'Click into the game – then aim with the mouse',
    g3fire: 'Fire',
    g3start: 'Report for duty',
    g3go: 'On guard',

    g3timeLabel: 'Police in',
    g3stolenCount: 'Stolen {stolen} of {max}',
    g3barrelsLabel: 'Barrels in the hall',
    g3scoreLabel: 'Score',
    g3shellsLabel: 'Shells',
    g3reload: 'Reload',
    g3reloadKey: 'Reload – R',
    g3reloading: 'Reloading…',
    g3toastStolen: 'Barrel stolen',
    g3toastStolenCount: 'stolen {stolen} of {max}',
    g3toastLastChance: 'Not one more may go',
    g3toastInnocent: 'That was the watchman!',
    g3toastInnocentSub: 'Don’t shoot the man with the lantern',
    g3toastRecovered: 'Barrel saved',

    g3noteKind: 'Night watch report',
    g3noteWhere: 'Světovar, 1929',
    g3winTitle: 'The police have arrived',
    g3winLine1: 'Not a single barrel missing',
    g3winLine2: 'A good watch, the hall held',
    g3winLine3: 'Held, but it was a close call',
    g3score: 'Score',
    g3stolen: 'Barrels stolen',
    g3again: 'Another night',
    // TODO: fact-check
    g3history:
      'Světovar brewed beer from 1913 to 1933 – the very years when Prohibition (1920–1933) held sway in America and gangsters ran the beer trade there. The sprawling works in Bory had its own railway siding, and at night watchmen made their rounds.',
    g3historyTitle: 'From history',
    g3failBarrels: 'The gangsters got away with too many barrels',
    g3failOther: 'The night watch ended badly',
    g3tipBarrels: 'Shoot the ones already holding a barrel first – and reload while it’s quiet.',
    g3tipOther: 'Keep an eye on every window and reload in good time.',
    g3tryAgain: 'Try again',
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
    level2Desc: 'Fässer zum Aufzug, Vorsicht vor Ratten',
    level3Name: 'Gangster im Světovar',
    level3Desc: 'Nachts das Sudhaus gegen Fassdiebe verteidigen',
    level4Name: 'Die Sudhalle',
    level4Desc: 'Über die Laufstege der Sudkessel rennen',
    level5Name: 'Die verrückte Abfüllhalle',
    level5Desc: 'Mit der rasenden Abfülllinie Schritt halten',
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

    // level 2 (cellar)
    toLevel2: 'Weiter: Level 2',
    l2Kicker: 'Světovar · Lagerkeller',
    l2Title: 'Fässerrollen im Keller',
    l2Sub: 'Level 2',
    l2Story:
      'Die Fässer sind im Světovar angekommen. Im Keller unter der Brauerei liegen sie verstreut in den Seitengewölben, und du bist der Kellermeister. Rolle jedes Fass zum Aufzug in die Abfüllhalle.',
    l2Mission:
      'Rolle {n} bis zur Kreidemarkierung am Aufzug, Zeit: {time}. Fässer kannst du nur vor dir herschieben, nimm Kurven also in weiten Bögen. Vorsicht vor den Ratten: Nach {max} Bissen ist Schluss.',
    l2HintTouch: 'Ziehe mit dem linken Daumen irgendwo auf dem Bildschirm, der Kellermeister geht in diese Richtung. Ein Fass rollt, wenn du es von hinten schiebst.',
    l2HintKeys: 'Pfeile oder W A S D – gehen und schieben  ·  Enter – Start  ·  P – Pause',
    l2Start: 'Ab in den Keller',
    l2Go: 'Rollen',
    l2TimeLabel: 'Restzeit',
    l2BarrelsLabel: 'Fässer am Aufzug',
    l2BitesLabel: 'Bisse',
    l2Guide: 'Richtung zum Ziel',
    l2ToastDelivered: 'Fass geliefert',
    l2ToastDeliveredSub: '{n} von {total}',
    l2ToastBite: 'Eine Ratte hat dich gebissen!',
    l2ToastBiteSub: 'Biss {n} von {max}',
    l2ToastLast: 'Noch ein Biss und es ist vorbei',
    l2WinTitle: 'Die Fässer sind am Aufzug',
    l2NoteRoute: 'Lagerkeller → Abfüllhalle',
    l2WinLine1: 'Ein Meister des Kellers',
    l2WinLine2: 'Gute Arbeit, die Fässer fahren zur Abfüllung',
    l2WinLine3: 'Geschafft, auch wenn es hart war',
    l2Delivered: 'Fässer eingerollt',
    l2Bites: 'Bisse',
    l2Again: 'Nochmal rollen',
    l2HistoryTitle: 'Aus der Geschichte',
    l2History:
      'Das Lagerbier reifte wochenlang in kühlen Kellern tief unter der Brauerei. Die Kälte kam von Eis, das im Winter geschnitten und für den Sommer gelagert wurde. Die Fässer rollten Kellerarbeiter von Hand durch die Gewölbe.',
    l2FailTime: 'Die Zeit ist um',
    l2FailRats: 'Die Ratten haben dich vertrieben',
    l2TipTime: 'Schiebe ein Fass gerade von hinten und nimm Kurven in einem weiten Bogen.',
    l2TipRats: 'Ratten scheuen ein rollendes Fass. Halte es zwischen dir und ihnen.',

    rotate: 'Drehe dein Handy quer',
    rotateSub: 'Das Spiel wird im Querformat gespielt',


    // ---------------- Level 3 "Gangster im Světovar" ----------------
    // (g3stamp* bleiben in jeder Sprache tschechisch, wie der Stempel in Level 1: Fallback auf cs)
    g3title: 'Gangster im Světovar',
    g3subtitle: 'Pilsen 1929 · Nachtwache',
    // {time} m:ss, {max} Fässer ("3 Fässer")
    g3mission:
      'Du bist der Nachtwächter der Brauerei Světovar. Gangster dringen durch die Fenster ein und wollen die Bierfässer fortschleppen. Deine Flinte ist mit Salz geladen. Halte {time} durch, bis die Polizei eintrifft, und lass sie nicht mehr als {max} davontragen. Den Wächter mit der Laterne niemals anschießen!',
    g3hintTouch: 'Mit dem Finger ziehen zum Zielen, tippen oder „Feuer“ drücken zum Schießen, „Laden“ lädt nach.',
    g3hintKeys: 'Mit der Maus zielen, Klick zum Schießen, R lädt nach',
    g3hintKeys2: 'Esc – Pause',
    g3clickToAim: 'Ins Spiel klicken – dann zielt die Maus',
    g3fire: 'Feuer',
    g3start: 'Wache antreten',
    g3go: 'Aufgepasst',

    g3timeLabel: 'Polizei in',
    g3stolenCount: 'Gestohlen {stolen} von {max}',
    g3barrelsLabel: 'Fässer in der Halle',
    g3scoreLabel: 'Punkte',
    g3shellsLabel: 'Patronen',
    g3reload: 'Laden',
    g3reloadKey: 'Laden – R',
    g3reloading: 'Lade nach…',
    g3toastStolen: 'Fass gestohlen',
    g3toastStolenCount: 'gestohlen {stolen} von {max}',
    g3toastLastChance: 'Kein einziges darf mehr fehlen',
    g3toastInnocent: 'Das war der Wächter!',
    g3toastInnocentSub: 'Nicht auf den Mann mit der Laterne schießen',
    g3toastRecovered: 'Fass gerettet',

    g3noteKind: 'Bericht der Nachtwache',
    g3noteWhere: 'Světovar, 1929',
    g3winTitle: 'Die Polizei ist da',
    g3winLine1: 'Kein einziges Fass fehlt',
    g3winLine2: 'Gute Wache, die Halle ist gehalten',
    g3winLine3: 'Gehalten, aber es war knapp',
    g3score: 'Punkte',
    g3stolen: 'Gestohlene Fässer',
    g3again: 'Noch eine Nacht',
    // TODO: fact-check
    g3history:
      'Der Světovar braute von 1913 bis 1933 Bier – genau in den Jahren, als in Amerika die Prohibition galt (1920–1933) und Gangster dort den Bierhandel beherrschten. Das weitläufige Gelände in Bory hatte ein eigenes Anschlussgleis, und nachts drehten Wächter ihre Runden.',
    g3historyTitle: 'Aus der Geschichte',
    g3failBarrels: 'Die Gangster haben zu viele Fässer erbeutet',
    g3failOther: 'Die Nachtwache ging schief',
    g3tipBarrels: 'Zuerst auf die schießen, die schon ein Fass tragen – und nachladen, solange es ruhig ist.',
    g3tipOther: 'Behalte alle Fenster im Blick und lade rechtzeitig nach.',
    g3tryAgain: 'Nochmal versuchen',
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
