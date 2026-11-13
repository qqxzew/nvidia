# Plzeň 1926 — Level 4 "Varna" (first-person catwalk run)

> **v2 — real route through the real buildings (2026-11-13, user request).** Overrides the course layout below.
> The course now follows the actual Světovar buildings from the 1912 drawings, in real dimensions:
> **Varna 2nd floor** (gallery around the open kettle hall, the two brew kettles below) → **clock tower** →
> **covered bridge** over the yard tracks → **cellar-tower staircase + tower** → **stairs up** into the
> **cooling floor ("chladicí štok")** under the cellars' roof → serpentine between the coolers → main valve (finish).
> Single source of truth: `src/core/sites.js` (`LEVEL4_ROUTE`, `BUILDINGS`, `L4_ORIGIN`, `toL4`), in level-1 world
> coordinates. Level 4 works in local coordinates `local = world − L4_ORIGIN` (Y unchanged, metres above ground).
> - Length ≈ 208 m (was 322). Walking surface is **no longer constant**: `course.deckAt(s)` (8.2 m from the start
>   through the bridge and the cellar tower, stairs at s ≈ 99.5 → 108.5 up to 13.6 m, then 13.6 m to the finish).
>   `course.stairs = [{ s0, s1, y0, y1 }]`. `RUN.deckY` is only a fallback.
> - Sections (start s): varna 0 · tower ≈ 50 · bridge ≈ 58 · cellarTower ≈ 78 · cool ≈ 103.
> - Real widths: Varna interior x −159.4…−141.6, z 895.6…914.4 (gallery legs leave ≈ 0.25 m to the walls);
>   bridge interior ±1.5 m; the kettles (r ≈ 2.1 m) stand at world (−147.1, 901) and (−147.1, 908.5).
> - Extra layout rules: no hazard on the stairs or within 5 m of their ends; corners ±5 m stay clear (as before).
> - The drawings have no floor plans: the 2nd-floor gallery around an open kettle hall is an informed guess.

Standalone level, **not linked from the main game flow yet**. Open with `?level=4`. Everything lives in
`src/level4/`. Read `docs/ARCHITECTURE.md` first (units, Y up, X east, Z south, shared materials, merged
geometry, `CanvasTexture` ≤ 1024 px, mobile budget). Level 1 and level 5 files are read-only.

> History: level 4 used to be a top-down brewing time-management game. The user found it not fun and asked
> for this instead (2026-11-13). The old modules were removed; `src/level4/textures.js` stays because
> **level 5 imports `getTextures`, `WALL_TEX`, `rng` from it** — keep those exports working.

## The user's brief (Czech)
> Tohle není herně zábavné. Místo toho bude race ve 3D, z first person pohledu. Bude to o tom, že hráč poběží přes
> dlouhé lávky v továrně nad různými káděmi a bude z nich různě unikat pára, ze stropu něco kapat, nebo třeba něco
> padat a různé takovéhle problémy. Hráč se tomu musí vyhýbat skákáním a uhýbáním do strany po lávce, na lávce
> občas budou díry. Ovládání jenom: skoky, šipky doleva a doprava. Řiď se původními pokyny a použij jako referenci
> pro prostředí fabriky nové obrázky.

Original level rules still apply: theme "Vaření piva — srdce pivovaru", the Světovar brewhouse c. 1913–1930,
**interior on one of the upper floors**, **artificial lamp light inside + little light from outside through dirty,
dull windows**, same graphic style and UI as level 1 ("hand-coloured postcard" grade, enamel HUD, paper screens,
red stamp). Reference photos: `docs/reference/indoor/i1.jpg … i7.jpg` (Světovar interiors and equipment before
liquidation, c. 1930: vaulted brick halls, tiled floors, cast-iron columns, riveted vessels, pipes with valves,
steel stairs and railings, tall factory windows), plus `docs/reference/17.jpg 18.jpg` (sections incl. the brewhouse).

## The game
The brewer must **run across the brewhouse catwalks to the main steam valve before the kettle boils over**
(`RUN.timeLimit`, shown as a pressure gauge). First person, automatic forward run, the player only:
- **← / →** (A / D, touch buttons or swipe): change lane (3 lanes on the catwalk)
- **jump** (Space / ↑ / W, touch button or swipe up)

Hazards along the course (`src/level4/course.js`): **holes** in the grating (jump or dodge; falling = respawn a few
meters back + time penalty), **steam** jets from the vats below (periodic; dodge or time it), **drips** from ceiling
pipes (periodic), **falling** hop sacks / crates from hoists (fall as you approach, then lie as a jumpable block),
low **pipes** across the catwalk (jump). A hit = stumble (speed dip, red flash) — no instant death; the clock is the
enemy. Five themed stretches: mash tuns → lauter tun → copper kettles → hop store → cooling floor → valve platform.
Result: time left + hits → 1–3 stars.

## Files and owners
| File | Owner | Export |
|---|---|---|
| `src/boot.js`, `src/level4/main.js`, `src/level4/config.js`, `src/core/paths.js`, `docs/LEVEL4.md` | lead | — |
| `src/level4/course.js` (hazard list + timing helpers), `src/level4/runner.js`, `scripts/level4-sim.mjs` | gameplay | `COURSE`, `buildCourse`, helpers, `createRunner(ctx)` |
| `src/level4/factory.js`, `src/level4/textures.js` (keep level-5 exports!) | art | `buildFactory(ctx)` |
| `src/level4/ui.js`, `src/level4/ui4.css`, `src/level4/i18n.js`, `src/level4/audio.js` | ui | `createUI4(ctx)`, `createAudio4(ctx)` |
Old `brewhouse.js` / `brewer.js` may be mined for code by art, then deleted by art.

## Config and course
`config.js`: `RUN` (deck height/width, lanes, eye height, speeds, jump, penalties), `CAMERA`.
`course.js`: `COURSE` (path corners, `start`, `finish`, `sections`, `hazards`) and `buildCourse()` →
`{ path, length, start, finish, sections, hazards (with id), laneOffset(lane) }`; `path.at(s) → {x, z, tx, tz}`.
Lateral: right of tangent (tx, tz) is (−tz, tx); world pos = path point + right × lateral. Lane −1 = left.
Timing helpers (use them everywhere — sim, visuals, audio stay in sync): `steamLevel(h, t)`, `steamActive(h, t)`,
`dripState(h, t)`, `fallProgress(triggerTime, t)`, constants `DRIP_FALL`, `FALL_TIME`, `BLOCK_HEIGHT`, `STEAM_LEN`.
`t` = race clock (seconds since GO; frozen while paused/countdown).

## Shared context `ctx` (built by `src/level4/main.js`)
```
ctx = { THREE, scene, camera, renderer, events, run: RUN, course: buildCourse(COURSE, RUN.laneWidth),
        quality: 'high'|'low', isMobile, dynamic: [] }
```

## createRunner(ctx) → gameplay (pure JS, no three.js, deterministic)
```
{ state: { time (race clock), remaining, s, progress 0..1, lane (target −1|0|1), lateral (current m), x, z, yaw,
           height (feet above deck, jump arc), airborne, speed, stumble 0..1, falling 0..1 (hole fall anim, then respawn),
           hits, falls, section {id, name}, fallTriggers: {hazardId: raceTime}, over, result, stars },
  reset(), update(dt, input, playing) }
input = { left: int, right: int, jump: int }   // presses since last frame; main.js resets them to 0 every frame
```
Events: `run:lane {lane}`, `run:jump`, `run:land`, `run:hit {kind: 'steam'|'drip'|'fall'|'block'|'pipe', id}`,
`run:hole {id}` (started falling), `run:respawn`, `run:trigger {id}` (a sack starts falling), `run:section {id, name}`,
`finish {time, remaining, hits, falls, stars}`, `fail {reason: 'time', progress}`.

## buildFactory(ctx) → art
`{ update(dt, t, vis) }`, `vis = { state, raceTime, runner: runner.state }`. Builds the brewhouse interior around the
course: grating catwalk at `RUN.deckY` with **real gaps at hole hazards**, railings, lamp posts, stairs/landings at
the corners; the vats/vessels on the floor below per section; ceiling girders, pipes, hoists, dirty tall windows with
weak cold daylight, warm enamel lamps; every hazard visual synced via the helpers (steam jets, drops, falling sacks
using `runner.fallTriggers`, low pipes); the finish platform with the big valve wheel + gauge. **Chunk the static
geometry by section/distance** so frustum culling works on a 330 m course (no single merged mesh for everything);
fog/haze is allowed and helps.

## createUI4(ctx) / createAudio4(ctx) → ui
`createUI4(ctx)` → `{ input, update(dt), setHUD(hud) }` (input as above), emits `ui:start ui:restart ui:pause ui:resume
audio:volume audio:mute`. Same look as level 1/5. Menu, countdown, HUD (pressure gauge / remaining time, course
progress with section ticks, hits), hit flash, touch controls (left / right / jump + swipes), pause, result + fail
papers, portrait overlay.
```
hud = { state, time, remaining, timeLimit, progress, speed, hits, falls, section, lane, airborne, stumble,
        nearSteam 0..1, nearDrip 0..1, result, fps }
```
`createAudio4(ctx)` → `{ unlock(), update(dt, hud) }`: footsteps on steel grating ∝ speed, jump / land clank,
steam hiss ∝ nearSteam, drips, hall ambience (boiling kettles, machinery), hit / fall sounds, rising pressure in the
last 15 s, finish valve + bell.

## Budget, debug
≤ 90 draw calls visible, ≤ 200 k triangles visible, ≤ 4 shadowed/real-time lights near the runner.
`?level=4&autostart=1&nograde=1&cam=orbit&q=low&god=1`. `window.__game` exposes ctx, `G`, `runner`, `factory`, `ui`.
`npm run build` must pass.
