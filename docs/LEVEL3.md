# Level 3 — "Gangsteři ve Světovaru" (contract)

> **v2 (2026-11-13, user feedback)** — sections marked **[v2]** override everything below them:
> 1. **[v2] Player closer**: camera at `(0, 1.65, -1)` (was z = 3). Mouse-look FPS style: the **cursor/crosshair
>    is always at the screen center**, the mouse turns the view left/right **and up/down** (pointer lock).
>    Yaw limit ±1.75 rad, pitch −0.55 … +0.5 rad. Every shot goes through the screen center (ndc 0,0).
> 2. **[v2] Stealing looks real**: gangsters climb **into** the hall, walk to a barrel, pick it up, carry it back
>    to the window and climb out with it. No barrel appears out of thin air.
> 3. **[v2] Hall restyled after the archive photos** in `docs/reference/indoor/` (Světovar ca. 1930: whitewashed
>    plaster walls, tall **rectangular** windows with many small panes, steel crane girders, tiled floor,
>    walls of barrels stacked lying down, barrel conveyor rails, steam engines with flywheels, gauge board).
>
> ### [v2] Layout changes
> - Windows: keep ids, positions, sill y 0.9, width 1.6; top y 3.6 — but rectangular multi-pane (no arch needed).
> - **Arena (keep clear)**: floor region `x ∈ [-10.4, 10.4]`, `z ∈ [-8.4, -1.8]` must have **no obstacles** except
>   the 10 stealable barrels — gangsters walk straight lines there. Columns, machines and decorative barrel walls
>   go elsewhere (back half `z > -1`, along the side walls behind L1/R1, corners). Nothing may block the player's
>   view of any window opening.
> - **Stealable barrels**: 10 barrels lying on their side on low wooden chocks (like the photos), two groups of 5,
>   centered around `(±6.5, 0, -3.2)`, each group within `|x| ∈ [5.5, 7.5]`, `z ∈ [-4.4, -2.0]`, max 2 high.
>
> ### [v2] buildHall(ctx) — changed / added API
> ```
> player: Vector3(0, 1.65, -1),
> barrelSlots: [{ pos: Vector3 /* barrel center, world */, yaw /* rotation.y of its axis */ }] × 10,
> setBarrelVisible(i, visible),   // per-slot visibility (gangsters call it on pickup / when a dropped barrel returns)
> setBarrels(n),                  // reset: first n slots visible, rest hidden (main calls it on a new run)
> ```
> `setGlass`, `resetGlass`, `windows`, `update` unchanged.
>
> ### [v2] Gangster stages (replaces the old list)
> `rise` → `smash` (skipped if broken) → `climb` (onto the sill, drops down **inside** at `sill + normal·0.9`, y 0)
> → `walk` (to the nearest free, visible barrel slot that no other gangster has reserved; ~2.3 m/s; stops beside it)
> → `pickup` (~0.7 s: bends down, calls `hall.setBarrelVisible(i, false)`, the barrel appears in his arms/on his
> shoulder at the same spot — emit `gangster:grab {id, windowId, barrel: i}`) → `carry` (back to the window, ~1.6 m/s)
> → `escape` (climbs out over the sill with the barrel and drops out of sight) → emit `gangster:escape {id, windowId, barrel: i}`.
> If no free barrel exists after `climb`, he shouts and climbs back out (no event besides `gangster:down` if hit).
> **Hit**: outside (`rise/smash/climb`) → falls back out of the window as before. Inside without a barrel (`walk/pickup`)
> → falls down on the floor, gets up dazed after ~1 s and flees out of the window (`flee`, not hittable, no steal).
> Carrying (`carry/escape`) → drops the barrel (it falls and rolls a little on the floor), then the slot becomes
> visible again after ~1 s (`hall.setBarrelVisible(i, true)`) — emit `gangster:down` with `withBarrel: true, barrel: i`.
> Tough gangster: 2 hits (first one staggers). All stage durations/speeds scale with difficulty as before.
> Gangsters must be **readable** in the dark (lighter coat tints, subtle rim/emissive) — they were too dark in v1.
> Main no longer hides/shows barrels on grab/down; it only counts. On `gangster:escape` with `?god=1` main calls
> `hall.setBarrelVisible(barrel, true)`.
>
> ### [v2] Input (createUI3)
> `input = { pan: -1..1 /* keys A/D ←/→, + = right */, panY: -1..1 /* keys W/S ↑/↓, + = up */,
>            look: 0 /* accumulated radians, + = right */, lookY: 0 /* accumulated radians, + = up */ }` — main zeroes look/lookY each frame.
> - **Desktop**: clicking the canvas while playing requests **pointer lock**; mouse movement (movementX/Y,
>   ~0.0022 rad/px) feeds look/lookY; a click while locked = `g3:shoot {ndcX: 0, ndcY: 0}`. Fixed crosshair at the
>   center. Losing pointer lock while playing (Esc) = pause; Resume re-requests the lock (it is a user gesture).
>   Menu/pause/win/fail screens release the lock. The first click that only acquires the lock does not shoot.
> - **Touch**: drag anywhere (not on buttons) = look (yaw + pitch, ~1.6 rad per screen width), a short tap = shoot at
>   the center, plus a big FIRE button bottom-right and the reload button. Crosshair fixed at the center.
> - Space = shoot, R = reload, P = pause, Enter = start/retry (as before).


Read `docs/ARCHITECTURE.md` first: units, Y-up, materials, draw-call rules, procedural assets and the
art direction all still apply. This file only adds what is specific to level 3.

## Pitch
Night, ~1929. Ground floor of the Světovar brewhouse (today TechTower). Gangsters (fedoras, pinstripe
suits, crowbars) try to break in through the tall arched windows and steal beer barrels. The player is
the night guard standing in the middle of the hall with a double-barrelled shotgun **loaded with salt**
(period-correct, non-lethal: a hit gangster yelps, loses his hat and tumbles back out of the window).
Hold out until the police arrive (`CONFIG3.game.duration`). If more than `maxStolen` barrels are carried
away, the level is lost. Occasionally an innocent night watchman with a lantern walks past outside a window —
don't shoot him.

Mood: dark, sombre interior lit by a few bare bulbs (warm), cold blue moonlight through the windows,
gangsters read as silhouettes against the moonlit yard. Same postcard grading as level 1 (`src/fx/grading.js`).

## Entry / switching levels
`index.html` loads `src/boot.js`. `?level=3` → `src/levels/gangsters/main.js`, anything else → `src/main.js`
(level 1). Switching level = navigate to `?level=N` (full page reload, no scene disposal needed).

## Layout (meters; X east, Z south, Y up; floor y = 0)
- Hall interior: `x ∈ [-11, 11]`, `z ∈ [-9, 7]`, ceiling `y = 6.5`. Walls 0.6 m thick (outer faces at
  x = ±11.6, z = -9.6 / 7.6). Outside the walls the ground continues (yard) and there is a night backdrop.
- Player (camera) at `(0, 1.65, 3)`. Camera `rotation.order = 'YXZ'`; yaw 0 looks toward **−Z** (front wall).
  Yaw is clamped to `±CONFIG3.camera.yawLimit` (≈ 0.95 rad), so the side walls are reachable by panning.
- Windows: opening width 1.6, sill `y = 0.9`, top of the arch `y = 3.6`. Ids and sill centers (inner face):
  - front wall `z = -9`: `F0..F4` at `x = -7.2, -3.6, 0, 3.6, 7.2`, inward normal `(0, 0, 1)`
  - left wall `x = -11`: `L0, L1` at `z = -5, -1`, inward normal `(1, 0, 0)`
  - right wall `x = 11`: `R0, R1` at `z = -5, -1`, inward normal `(-1, 0, 0)`
- Barrels (10, standing upright, radius ≈ 0.33, height ≈ 0.85): two groups of 5 beside the player,
  around `x = ±3.5 .. ±5`, `z = 1.5 .. 4.5`. They must not block the view of any window from the player.

## Modules and owners
| File | Owner | Export |
|---|---|---|
| `src/boot.js`, `index.html`, `src/levels/gangsters/main.js`, `src/levels/gangsters/config.js` | lead | — |
| `src/levels/gangsters/hall.js` | landmarks | `buildHall(ctx)` |
| `src/levels/gangsters/gangsters.js`, `src/levels/gangsters/shotgun.js` | vehicles (characters) | `createGangsters(ctx, hall)`, `createShotgun(ctx)` |
| `src/levels/gangsters/ui.js`, `src/levels/gangsters/ui.css`, `src/levels/gangsters/audio.js`, plus new `g3*` keys in `src/ui/i18n.js` and a level switcher in `src/ui/ui.js` | ui | `createUI3(ctx)`, `createAudio3(ctx)` |

### ctx (level 3)
`{ THREE, scene, camera, renderer, events, config: CONFIG3, quality: 'high'|'low', isMobile }`
The camera is added to the scene by main.js (so children of the camera, e.g. the shotgun, render).
Static objects are frozen (`matrixAutoUpdate = false`) after the build unless `userData.dynamic = true`.

### buildHall(ctx) → hall
```
{ windows: [{ id: 'F0', sill: Vector3 /* center of the sill, inner face */, normal: Vector3 /* into hall */,
              width: 1.6, sillY: 0.9, topY: 3.6 }],          // exactly the 9 windows above, in the order F0..F4, L0, L1, R0, R1
  player: Vector3(0, 1.65, 3),
  setGlass(id, intact: boolean),   // broken = glass pane hidden, shards left on the sill/floor
  resetGlass(),
  setBarrels(n),                   // show the first n of the 10 barrels (0..10)
  update?(dt, t) }                 // e.g. bulb flicker
```
Includes its own lights: low hemisphere/ambient, a cool moonlight DirectionalLight from outside the front
wall (casts shadows through the windows if affordable), max 3 warm PointLights for the bulbs + emissive bulbs.
Budget: ≤ 40 draw calls, ≤ 80 k triangles.

### createGangsters(ctx, hall) → gangsters
```
{ update(dt, t, game /* {state, difficulty 0..1} */),   // spawns only while game.state === 'playing'
  hitTest(raycaster) → { id, kind: 'gangster'|'innocent' } | null,   // only targets that are visible/active
  hit(id),          // main calls it after a successful hitTest; plays the fall animation, emits gangster:down
  reset(),          // remove everyone (new run)
  active }          // number of active actors (getter)
```
Gangster stages: `rise` (pops up outside the window, chest above the sill) → `smash` (crowbar, calls
`hall.setGlass(id, false)` and emits `glass:break`; skipped if the window is already broken) → `climb`
(onto the sill, into the frame) → emits `gangster:grab` and holds a barrel → `escape` (backs out with the barrel)
→ emits `gangster:escape` and disappears. Hit in any stage → `gangster:down` with `withBarrel` true if hit
during `escape`. Stage durations come from `CONFIG3.gangsters`, scaled by `lerp(1, speedUpMin, difficulty)`.
Never two actors at one window. The innocent watchman walks along the outside of one window and leaves.
Budget: ≤ 20 draw calls for all actors (reuse geometry/material, ≤ 6 actors alive).

### createShotgun(ctx) → shotgun
`{ group /* parent it to the camera; lower-right of the view */, fire(), reload(duration), update(dt) }`
Double-barrelled 1920s shotgun with wooden stock, seen from first person. `fire()` = recoil kick,
`reload(d)` = break-open animation lasting d seconds. ≤ 3 draw calls.

### createUI3(ctx) → ui
```
{ input: { pan: -1..1,   // keyboard turning (A/D, ←/→), +1 = turn right
           look: 0 },    // accumulated drag turn in radians since last frame, + = turn right; main zeroes it
  update(dt), setHUD(hud) }
```
Touch: a tap shoots at the finger position; a drag (> 10 px) turns the view instead of shooting.
Mouse: click shoots at the cursor (show a crosshair at the cursor), drag with the button held may also turn.
Keys: R = reload, P/Esc = pause, Enter = start/retry, Space = shoot at screen center.
A reload button on touch. Screens reuse the look of `src/ui/ui.css` (paper screens, enamel HUD):
menu (title, mission, controls, start), countdown, HUD, pause (resume, restart, volume, mute, fullscreen),
win (stamp with stars, score), fail. Plus a small level switcher ("1 · 3") in the menu of both levels.
Strings go into `src/ui/i18n.js` with keys prefixed `g3` (Czech only for now).

`hud = { state, time, duration, remaining, barrels /* on shelf */, stolen, maxStolen, total, shells, maxShells,
         reloading /* 0..1 progress, -1 if not */, score, fps }`

### createAudio3(ctx) → `{ unlock(), update(dt, game) }`
Procedural WebAudio like `src/audio/audio.js`; respects `settings` from `src/ui/shared.js` and the
`audio:volume` / `audio:mute` events. Shotgun blast, dry click, break-open + shell insert, glass smash,
crowbar knock, gangster yelp on hit, angry shout on grab, barrel scrape, police whistles + bell at the win,
night ambience (crickets, bulb hum, distant dog, wind through broken windows — more with every broken pane).

## Events (level 3)
- UI → game: `ui:start`, `ui:restart`, `ui:pause`, `ui:resume`, `g3:shoot {ndcX, ndcY}`, `g3:reload`,
  `audio:volume {value}`, `audio:mute {muted}`
- game (main) → all: `state {state, prev}`, `countdown {n}`, `shot {hit: 'gangster'|'innocent'|null, shells}`,
  `dry {}`, `reload:start {duration}`, `reload:done {shells}`, `barrel:stolen {stolen, remaining}`,
  `barrel:recovered {}`, `score {score, delta, x, y, z}`, `finish {time, stolen, stars, score}`,
  `fail {reason: 'barrels', stolen, score}`
- gangsters → all: `gangster:appear {id, windowId, kind}`, `glass:break {windowId, x, y, z}`,
  `gangster:grab {id, windowId}`, `gangster:down {id, kind, stage, withBarrel}`, `gangster:escape {id, windowId}`

## Verification
`npm run build` must pass. The dev server runs at `http://localhost:5173/?level=3` (`&autostart=1` skips
the menu, `&god=1` makes barrels un-stealable, `&nograde=1` disables grading). `window.__game3` exposes ctx and state.
