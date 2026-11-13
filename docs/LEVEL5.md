# Plzeň 1926 — Level 5 "Šílená stáčírna" (the racking hall)

Standalone level, **not linked from the main game flow yet**. Open with `?level=5`. Everything lives in
`src/level5/`. Read `docs/ARCHITECTURE.md` (conventions, budgets) and look at `docs/LEVEL4.md` + `src/level4/*`
— level 5 follows the same structure, owners and style. Level 1 and level 4 files are read-only; you may import
from them (`../fx/grading.js`, `../ui/ui.css`, `../ui/icons.js`, `../ui/i18n.js` `fmtTime`, `../ui/shared.js`
`settings/saveSettings`, `../level4/textures.js` helpers, and copy-adapt code from `../level4/*`).

## The user's brief (Czech, keep its spirit)
> Pivo je uzrálé v ležáckém sklepě a musí se stočit do sudů. Linka se ale porouchala a sudy jezdí všemi směry.
> Hráč se dívá na 3D model běžících pásů shora. Musí rychle přepínat výhybky na pásech, aby prázdný sud dojel pod
> myčku, pak pod plnicí trysku, následně pod naražeč (zavíčkování) a nakonec na expedici. Pokud hráč pošle
> nevymytý sud pod plničku, sud praskne. Pás neustále zrychluje, dokud hráč nenaplní požadovanou kvótu pro
> zásobování Plzně.
> **Ať se to dobře ovládá, ať je pěkný UI a reflektuje level 1, ať to není moc složitý, ať je jasná ta hratelnost.**

## The game (simple and readable — that is the whole point)
- One **loop belt** ("kolotoč") runs clockwise. Four **switches** (výhybky) can divert it into a branch:
  **1 Myčka** (wash) · **2 Plnička** (fill) · **3 Naražeč** (drive the bung) · **4 Expedice** (dispatch, leaves the hall).
  The three station branches rejoin the loop; dispatch is an exit.
- A switch is ON (divert every barrel that reaches it) or OFF (straight on). Toggle: key **1–4**, click/tap the
  switch (or anywhere on its branch) in the 3D view, or tap its big HUD button.
- Empty **dirty** barrels arrive from the lager-cellar lift and merge into the loop. Each barrel needs, in order:
  wash → fill → cap → ship. Every barrel carries a **floating tag with the colour + icon of the station it needs
  next** (`NEXT_STATION`), so the player always knows what to do.
- One rule for the player: **send a barrel only where its tag points.** Consequences:
  - wash: dirty → clean; clean passes; **full/capped → beer rinsed out, back to clean (no strike, progress lost)**
  - fill: clean → full; **dirty → BURST (strike)**; full/capped pass
  - cap: full → capped; capped passes; **empty (dirty/clean) → hammered empty, pushed off (strike)**
  - ship: capped → dispatched (+1 quota); **anything else → REJECTED (strike)**
  - Leaving barrels circling backs up the cellar lift; more than `liftMax` waiting → fail `'jam'`.
  (Without the wash/cap consequences, leaving wash+fill+cap ON and only toggling dispatch won with 3 stars.)
- The belt keeps speeding up and barrels arrive more often until the quota (`LINE.quota`) is dispatched.
  `LINE.maxStrikes` strikes → fail. Stars by strikes (and time).
- The loop order is wash → cap → fill → ship, so each barrel needs ~1.5 laps: the player keeps re-timing the
  switches for the barrels passing by. That is the skill. No collisions to handle: barrels on the loop never stop;
  barrels on a branch wait at the rejoin point for a gap (zipper merge), the lift waits for a gap too.

## Files and owners
| File | Owner | Export |
|---|---|---|
| `src/boot.js`, `src/level5/main.js`, `src/level5/config.js`, `src/core/paths.js`, `docs/LEVEL5.md` | lead | — |
| `src/level5/hall.js`, `src/level5/textures.js` | art | `buildHall(ctx)` |
| `src/level5/line.js`, `scripts/level5-sim.mjs` | gameplay | `createLine(ctx)` |
| `src/level5/ui.js`, `src/level5/ui5.css`, `src/level5/i18n.js`, `src/level5/audio.js` | ui | `createUI5(ctx)`, `createAudio5(ctx)` |

## Config (`src/level5/config.js`, source of truth — read at runtime)
`LAYOUT` (room, belt width/height, barrel size, ring + switches + entry polylines, station prop positions),
`STATIONS` (Czech name, verb, colour per station), `NEXT_STATION`, `CAMERA`, `LINE` (tuning), and
`buildBelts()` → `{ ring, branches: {id: {path, sw, join, exit, station, stationS, key, order}}, entry: {path, join} }`.
Paths come from `makePath` (`src/core/paths.js`): `path.length`, `path.at(s) → {x, z, tx, tz}`, `path.project(x, z) → {s, d}`,
`path.samples`. Ring arc length: wash switch 0.4 → cap 4.8 → fill 9.7 → ship 16.3 → entry joins 25.9 (length 28.7).

## Shared context `ctx` (built by `src/level5/main.js`)
```
ctx = { THREE, scene, camera, renderer, events, layout: LAYOUT, lineCfg: LINE, stations: STATIONS,
        belts: buildBelts(), quality, isMobile, dynamic: [] }
```

## createLine(ctx) → gameplay (pure JS, no three.js, deterministic with a seeded RNG)
```
{ state: { time, speed, shipped, quota, strikes, maxStrikes, over, result, stars,
           switches: { wash: bool, fill: bool, cap: bool, ship: bool },     // true = divert
           barrels: [{ id, belt: 'entry'|'ring'|'wash'|'fill'|'cap'|'ship', s, x, z, tx, tz,
                       state: 'dirty'|'clean'|'full'|'capped', next: 'wash'|'fill'|'cap'|'ship',
                       waiting: bool, age }],
           liftQueue },                 // barrels waiting in the lift (not on a belt yet)
  reset(seed?), toggle(id), set(id, on), update(dt, playing) }
```
Events (exact names): `line:switch {id, on}`, `line:spawn {id}`, `line:station {station, id, effect: 'wash'|'fill'|'cap'|'pass'}`
(fires as a barrel passes under a station), `line:burst {id, x, z}`, `line:reject {id, x, z}`,
`line:reject {.., where: 'cap'|'ship'}`, `line:spill {id, x, z}`, `line:lift {queue, max}`, `line:ship {id, shipped, quota}`, `line:strike {strikes, max, reason: 'burst'|'reject'|'capEmpty'}`, `line:speed {speed, level}`
(each speed step, for UI/audio), `finish {time, strikes, stars, shipped}`, `fail {reason: 'strikes'|'jam', time, shipped, strikes}`.

## buildHall(ctx) → art
`{ update(dt, t, vis) }`, `vis = { state (game state), line: line.state }`.
Builds the racking hall (Stáčírna, ground floor of Světovar, 1913–1926) and renders the line from `ctx.belts`:
belts (scrolling slats ∝ `line.speed`), switch gates (a visible flap/arm + a coloured lamp/arrow showing ON/OFF,
big and readable from the top), the 4 stations as distinct machines (washer with water spray, filler with a
brass nozzle and foam, bung driver with a hammer, dispatch dock with a cart/truck tail at the left wall), the
cellar lift at the left, barrels from `line.barrels` (pooled InstancedMesh, look per state: dirty = grimy/dull,
clean = wet oak, full = + bung hole closed by foam?, capped = shiny with a red sealed bung), a floating tag above
each barrel in the colour + icon of `barrel.next`, one-shot FX via events (spray, foam, hammer, burst = staves
+ splash, reject = red flash, ship = barrel rolls away).

## createUI5(ctx) → ui (match level 1 + level 4 UI exactly: enamel HUD, paper screens, red stamp)
`{ update(dt), setHUD(hud) }`; emits `ui:start ui:restart ui:pause ui:resume ui:switch {id} audio:volume audio:mute`.
Switch toggling: keys 1–4, click/tap in 3D (raycast the belt plane `y = layout.beltHeight` with `ctx.camera`, pick the
switch whose branch is within ~1.2 m via `ctx.belts.branches[id].path.project` or the switch point), HUD buttons.
```
hud = { state, time, speed, speedStart, speedMax, shipped, quota, strikes, maxStrikes, switches, barrels, liftQueue, liftMax, level, result, fps }
```

## createAudio5(ctx) → ui
`{ unlock(), update(dt, hud) }` procedural WebAudio like `src/level4/audio.js`: belt rattle ∝ speed, switch clack,
washer hiss, filler gurgle, bung-driver mallet knock, dispatch rumble, burst crack + splash, reject buzzer/bell,
hall ambience.

## Budget, debug
≤ 80 draw calls, ≤ 120 k triangles, ≤ 4 lights (shadows from one). `?level=5&autostart=1&nograde=1&cam=orbit&q=low&god=1`.
`window.__game` exposes ctx, `G`, `line`, `hall`, `ui`. `npm run build` must pass.

## Changes after the user's review (2026-11-13)
- Quota 10 (was 24): "jen pár sudů, třeba deset, teď je to hrozně složitý".
- Removed from the HUD: the four bottom switch cards, the belt-speed dial, the centre coach line and standing banners.
  Switching = keys 1–4 or click/tap on the switch's signal disk in 3D (`ctx.switchDiscs`, set by hall.js).
  Mistake toasts (burst / reject / spill) stay as the only in-play messages.
