# Cesta historií TechToweru — podklady pro web

> Podklad pro podstránku na osobním webu Tomáše Krůty. Fakta jsou ověřená z repozitáře (git historie,
> kód, dokumentace) a z týmového design dokumentu „EpicTower“ (AFFiNE). Co ověřené není, je na konci
> v sekci **K doplnění** — prosím nevymýšlet, ale nechat autora doplnit.

## Jednou větou
Prohlížečová 3D hra o historii budov dnešního plzeňského TechToweru: pět krátkých akčních kapitol
z let 1926–1929, kdy v areálu stál pivovar Světovar. Hra vznikla za jeden den, **13. 11. 2026, na EPIC Tower
hackathonu**, ve čtyřčlenném týmu.

## Tým (4 lidé)
Fotky jsou ve složce `docs/team/` (PNG s průhlednými zaoblenými rohy, 383 × 534 px, vyříznuté z týmového
slidu z prezentace; pozadí fotky je tmavá opona z fotokoutku, není odstraněné). Role jsou přesně ze slidu
„Náš tým“ z prezentace.

| Foto | Jméno | Role (ze slidu) | LinkedIn | Osobní web |
|---|---|---|---|---|
| `docs/team/tomas-kruta.png` | **Tomáš Krůta** | Herní vývojář, nápady | *(doplnit)* | *(doplnit)* |
| `docs/team/andrii-fedorov.png` | **Andrii Fedorov** | Herní vývojář, videa | *(doplnit)* | *(doplnit)* |
| `docs/team/oleksii-logosha.png` | **Oleksii Logosha** | Herní vývojář, prezentace | *(doplnit)* | *(doplnit)* |
| `docs/team/adam-hojer.png` | **Adam Hojer** | Kapitán týmu | *(doplnit)* | *(doplnit)* |

Kdo co dělal v kódu (podle git historie; Oleksii v repozitáři žádný commit nemá, jeho příspěvek byla
prezentace a s ní spojená práce, kterou git nezachytí):

| Člen | Co je v repozitáři jeho |
|---|---|
| Andrii Fedorov | Level 1 (jízda Plzní), vizuální styl UI (smaltované cedule, papírové obrazovky, razítko pivovaru), hlavní menu s filmem Světovaru, ukládání postupu příběhem, překlady cs/en/de, Level 2 (sklep), zapojení levelů 4 a 5 do menu |
| Tomáš Krůta | Level 3 (gangsteři), 3D mapa areálu v menu podle dobových plánů, převedení Levelu 4 na skutečnou trasu budovami, efekt tříštění skla, logo a favicona, text „O hře“, opravy produkčního buildu, slučování větví |
| Adam Hojer | Level 4 (běh po lávkách ve varně) a Level 5 (stáčírna) v původní podobě, nasazení přes Docker (nginx, port 6767), hostování týmového AFFiNE workspace s design dokumentem |
| Oleksii Logosha | Prezentace projektu a související práce (video, prezentace) — mimo git |

Časová osa podle commitů (13. 11. 2026): první commit 15:23 (Level 1) → menu a překlady 16:31 → Level 3 17:47 →
Level 2 18:09 → Levely 4 a 5 a Docker 18:57–19:03 → 3D mapa a skutečná trasa Levelu 4 20:31 → poslední oprava 21:33.
Celkem 24 commitů, zhruba 6 hodin aktivní práce v repozitáři.

## Zadání a cíl
Hackathon se konal v TechToweru v Plzni — v budovách bývalého pivovaru **Světovar** (Český plzeňský pivovar,
Bory, postaven 1910–1913, pivo vařil do roku 1933). Náš tým si zvolil udělat **hru, která návštěvníka provede
historií těchto budov**: co se v nich dělo, když tu byl pivovar.

Týmový design dokument („EpicTower“) stanovil:
- **Technologie:** Three.js + Vite v prohlížeči (dokument plánoval TypeScript; kvůli času jsme zůstali u čistého
  JavaScriptu s ES moduly).
- **Menu:** příběhový mód (Nová hra / Pokračovat), výběr levelů, které se odemykají postupně, „O hře“,
  nastavení hlasitosti, zvuku a celé obrazovky, přepínání jazyka vlajkami (čeština, angličtina, němčina).
- **Prolog:** průvodkyní je **Aneta Chodorová, organizátorka hackathonů** — uvádí hráče do historie TechToweru.
- **Pět levelů** jako „pracovní den v pivovaru“: dovoz sudů, sklep, obrana varny, vaření, stáčení.
- **Atmosféra:** rok cca 1926, historické budovy v co nejvyšší kvalitě, lehce ponurá nálada, pěkná příroda.

Výsledek: všech **5 levelů je hratelných**, propojených přes hlavní menu s příběhem, postupem a mapou areálu,
ve třech jazycích, nasaditelné jako statický web.

## Jak hra funguje
Hráč začne v hlavním menu nad „filmem“ — kamera pomalu krouží nad modelem Světovaru ve zlatém odpoledním světle,
kolem komína krouží rorýsi. Nová hra spustí prolog s Anetou Chodorovou a pak první level. Dokončením levelu se
odemkne další; pro každý level se ukládá nejlepší čas a hvězdy (1–3). Postup se ukládá v prohlížeči.

### 3D mapa areálu (v menu „Levely“)
Kamera přeletí nad areál a ukáže, **kde přesně se který level odehrává**. Budovy s levely jsou „prosvícené“
barevným rentgenovým řezem, uvnitř jsou vidět jednotlivá patra ve skutečných výškách podle dobových řezů
z roku 1912, každý level má očíslovaný štítek. U Levelu 1 je na zemi nakreslená poslední část jízdy, u Levelu 4
celá trasa ve 3D (přes patra, most a schody). Mapou se dá otáčet a přibližovat, kliknutím se level spustí.

### Level 1 — Jízda autem („Jízda do Světovaru“)
Rok 1926. Hráč řídí pivovarský nákladní vůz s **10 sudy** z **náměstí Republiky** (katedrála sv. Bartoloměje,
radnice) přes historickou Plzeň — městské ulice s tramvajemi a trolejemi, koňské povozy, chodci, předměstí
s vilami, pole, železniční přejezd se závorami a vlakem — až do dvora Světovaru. Trasa má asi 1,2 km.
Limit **1:50**, smí se ztratit nejvýš **2 sudy**. Sudy se uvolňují v ostrých zatáčkách, při prudkém brzdění,
nárazech a na dlažebních kostkách a kolejích. Pohled zezadu za vozem, ovládání šipkami nebo dotykem.

### Level 2 — Válení sudů ve sklepě
Ležácký sklep pod pivovarem: cihlové klenby, mokrá dlažba, obří ležácké kádě, pár holých žárovek. Hráč je
sklepník a musí **dokutálet 4 sudy** z bočních klenbových chodeb k výtahu do stáčírny. Sudy se dají jen tlačit
před sebou, takže zatáčky se berou širokým obloukem. Po sklepě pobíhají **krysy** — 3 kousnutí a konec.
Limit 4 minuty, pohled ze třetí osoby.

### Level 3 — Gangsteři ve Světovaru
Noc kolem roku 1929, přízemí varny (dnešní TechTower). Gangsteři v kloboucích páčidly rozbíjejí okna, lezou
dovnitř, dojdou ke stohu sudů, sud zvednou a snaží se ho vynést ven. Hráč je noční hlídač s dvouhlavňovou
**brokovnicí nabitou solí** (dobově věrné a nesmrtelné: zasažený gangster ztratí klobouk a vypadne z okna).
- Pohled z první osoby, myší se míří (zaměřovač je vždy uprostřed), na mobilu tažením prstu a tlačítkem „Pal“.
- Zasažený gangster se sudem ho upustí a sud se vrátí. Silný boss potřebuje dva zásahy.
- Kolem oken občas projde **hlídač s lucernou** — nestřílet (bodová penalizace).
- Vydržet **60 s** do příjezdu policie, gangsteři smí odnést nejvýš **5 z 10 sudů**.
- Okna při prvním úderu páčidlem prasknou a při druhém se roztříští — desítky střepů se rozletí do haly.
- Interiér podle archivních fotografií z doby kolem roku 1930: bílé omítnuté zdi s meandrovým vlysem,
  vysoká okna s drobnými tabulkami, keramický sokl, dlaždicová podlaha, jeřábový nosník, parní stroj, sudy.

### Level 4 — Varna
Pivovarník musí **doběhnout k hlavnímu parnímu ventilu, než kotel překypí**. Běh z první osoby po lávkách,
hráč jen uhýbá do stran (3 pruhy) a skáče přes díry v roštu, trubky a padající pytle, vyhýbá se páře a horkým
kapkám. Trasa vede **skutečnými budovami ve skutečných rozměrech** podle plánů z roku 1912:
2. patro varny (galerie nad halou se dvěma měděnými pánvemi) → hodinová věž → **krytý most nad vlečkou**
(z oken je vidět kolej a vagony) → věž sklepů → schody nahoru → **chladicí štok** pod střechou sklepů s chladicími
pánvemi → hlavní ventil. Trasa měří 208 m, limit 42 s.

### Level 5 — Šílená stáčírna
Stáčírna piva při pohledu shora. Linka se porouchala a sudy jezdí po pásu dokola. Hráč přepíná **4 výhybky**
(klávesy 1–4 nebo kliknutím), aby každý sud prošel ve správném pořadí **myčkou → plničkou → naražečem
(zátka) → expedicí**. Špinavý sud pod plničkou praskne, nehotový sud na expedici je vrácen — 3 chyby a konec.
Pás postupně zrychluje, cílem je naplnit kvótu **10 sudů** pro zásobování Plzně.

## Historie a věrnost
- Areál je postavený podle **archivních plánů**: situační plán pivovaru z 13. 11. 1912 (rozmístění budov),
  řezy budovami 1:250 z roku 1912 (výšky pater, varna s pánvemi, věž sklepů, sklepy s chladicím štokem)
  a pohled z ulice z roku 1911 (výšky: varna ≈ 16 m, hodinová věž ≈ 34 m, věž sklepů ≈ 28,5 m, komín ≈ 48 m).
- Interiéry podle **archivních fotografií Světovaru z doby kolem roku 1930** (sklep se sudy, strojovna,
  zařízení před likvidací).
- Plány z roku 1912 neobsahují půdorysy jednotlivých pater, takže vnitřní příčky (např. galerie ve varně)
  jsou kvalifikovaný odhad.
- Kontext do hry: Světovar vařil pivo v letech 1913–1933, tedy ve stejné době, kdy v Americe platila prohibice
  a pivní obchod tam ovládali gangsteři — odtud námět Levelu 3.

## Technické řešení
- **Three.js 0.187 + Vite 8**, čistý JavaScript (ES moduly), běží v prohlížeči bez instalace, **mobile-first**
  (na šířku), funguje i na počítači s klávesnicí a myší.
- **Žádné externí 3D modely ani textury**: veškerá geometrie (budovy, katedrála, vozy, tramvaje, postavy, stroje)
  je generovaná kódem, textury se kreslí do canvasu. **Všechny zvuky jsou syntetizované v prohlížeči**
  (Web Audio: motor, dlažba, výstřel, tříštění skla, krysy, pára, …), hra nemá jediný zvukový soubor.
- Vizuální styl „**ručně kolorovaná pohlednice**“: vlastní post-processing shader (tónování do sépie, zvednuté
  černé, vinětace, zrno papíru). UI z dobových materiálů pivovaru — smaltované cedule v HUD, papírové dodací
  listy jako obrazovky, červené razítko pivovaru.
- **Výkon pro mobily:** rozpočty draw callů a trojúhelníků pro každou část, slučování statické geometrie podle
  materiálu, instancing opakovaných objektů, adaptivní rozlišení podle FPS.
- **Překlady** cs / en / de, ukládání postupu a nastavení v prohlížeči.
- **Nasazení:** Docker (build v Node, servírování přes nginx), docker-compose na portu 6767.
- Rozsah: zhruba 29 000 řádků JavaScriptu a CSS v 78 zdrojových souborech.

## Jak jsme pracovali
- Plánování v týmovém **AFFiNE** workspace (design dokument „EpicTower“ se stackem, menu a popisem levelů).
- Vývoj s **AI asistentem Claude Code** ve stylu „workflows“: každý level měl krátký písemný kontrakt
  (rozhraní mezi moduly v `docs/LEVEL*.md`) a práci si rozdělilo několik paralelně pracujících AI agentů podle
  oblastí — prostředí/budovy, postavy a vozidla, UI a zvuk — s jedním „vedoucím“, který vše propojoval,
  testoval v prohlížeči a slučoval. Každý soubor měl jednoho vlastníka, aby se práce nepřekrývala.
- Testování: skriptované simulace (u Levelu 4 a 5 bot ověřuje, že level jde dohrát bez chyby a že hloupé
  strategie nevyhrají), automatizované průchody v Chromu, kontrola produkčního buildu.
- Hodně iterací přímo podle zpětné vazby z hraní: hráč v Levelu 3 posunut blíž k oknům a mušku má vždy
  uprostřed, krádež sudů zpomalena tak, aby gangster pro sud viditelně došel, level zjednodušen (60 s, 5 sudů),
  Level 4 přepracován na skutečnou trasu budovami, opravena kamera projíždějící ventilem, opravené chybějící
  styly v produkčním buildu těsně před prezentací.

## Obrázky pro web (v repozitáři)
- Level 1 a menu: `docs/screens/04-intro-cathedral.jpg`, `05-intro-menu.jpg`, `11-tram.jpg`,
  `12-field-svetovar.jpg`, `13-crossing.jpg`, `14-finish.jpg`, `20-ui-menu.jpg`, `21-ui-hud.jpg`, `22-ui-win.jpg`
- Menu „papír“ a prolog: `docs/screens/82-paper-menu.jpg`, `83-paper-prologue.jpg`
- Level 2: `docs/screens/30-l2-cellar.jpg`, `l2-ui-hud.jpg`, `l2-ui-brief.jpg`
- Srovnání modelu s dobovými fotkami: `docs/screens/svetovar-vs-photos.jpg`
- Dobové plány: `docs/reference/12.webp` (pohled 1911), `17.jpg`, `18.jpg` (řezy 1912), `19.jpg` (situace 1912)
- Logo: `public/logo.svg`, favicona `public/favicon.svg`
- Pro Level 3, 4, 5 a 3D mapu zatím uložené screenshoty nejsou — je potřeba je pořídit (viz níže).

## K doplnění (neověřeno, prosím nedomýšlet)
- **Odkazy týmu** (LinkedIn, osobní weby) — v tabulce týmu jsou prázdná pole.
- **Čistá fotka bez pozadí** — fotky mají jen průhledné rohy, tmavá opona na nich zůstává. Pokud je na webu
  potřeba skutečný výřez postavy, je potřeba původní fotky z fotokoutku (screenshot z prezentace má nízké
  rozlišení, ~383 × 534 px).
- **Oleksii Logosha** — role ze slidu je „Herní vývojář, prezentace“, ale v repozitáři nemá commity;
  doplnit konkrétně, co dělal.
- **Oficiální zadání hackathonu** — výše je zadání tak, jak ho zachytil náš design dokument; přesné znění
  od pořadatelů nemáme.
- **Výsledek / umístění** na hackathonu.
- **Odkaz na živou hru** a zda je repozitář `github.com/qqxzew/nvidia` veřejný.
- **Screenshoty** Levelu 3, 4, 5 a 3D mapy (dají se pořídit lokálně: `npm run dev`, pak `?level=3` / `4` / `5`,
  mapa v menu Levely).
- Historické údaje na obrazovkách výher jsou v kódu označené k ověření faktů — na webu je raději necitovat
  doslova bez kontroly.
