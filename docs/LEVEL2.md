# Level 2 — "Válení sudů ve sklepě" (Rolling barrels in the cellar)

Read `docs/ARCHITECTURE.md` first (conventions, art direction, perf rules). Everything there still applies
(units, axes, yaw convention, Lambert materials, merge/instancing, `import * as THREE from 'three'`, CanvasTexture rules).

## The level in one paragraph
The barrels from level 1 have arrived at Světovar. Down in the brewery's lager cellar (1920s), four barrels lie
scattered in the side vaults. The player is a cellarman (sklepník: flat cap, rolled-up sleeves, long leather apron,
same low-poly style as the level 1 pedestrians in `src/vehicle/trafficModels.js` → `buildPedGeometry(1)` workman)
who has to **roll each barrel in front of him** to the chalk-marked spot by the lift (výtah do stáčírny) in the hall.
The cellar is gloomy: brick barrel vaults, wet stone floor, rows of huge dark lager casks on wooden beams, puddles,
cobwebs — lit only by a few bare old bulbs on twisted cords (warm 2400 K, some flicker), everything else falls
off into near-black. A couple of rats scurry around randomly; touching one = a bite. Third person, chase camera.

Rules (tunable, `src/level2/config2.js`): 4 barrels, time limit 4:00, 3 bites = fail. Stars: 3 = ≤ 2:30 and 0 bites,
2 = ≤ 3:20 and ≤ 1 bite, else 1.

## The map — `src/level2/layout.js` (lead, READ-ONLY for you)
Rooms, blocks, dock, lift, target zone, barrel/rat spawns, bulbs, and the collision helpers:
`isWalkable(x,z)`, `fits(x,z,r)`, `WALLS` (merged grid boundary segments with inward normals), `collideCircle(p, r)`
(mutates p, returns deepest contact `{nx,nz,depth}` or null), `rayDist(x,z,dx,dz,maxD)` (camera), `roomAt`, `ceilAt`, `GRID`.
Solid = everything that is not a walkable cell. **Visual geometry must match the grid boundaries** (walls at room
rect edges, cask fronts exactly at the bay aisle edges, block boxes = BLOCKS rects).
Rough picture (north up = −Z):
```
            [ dock + lift (north wall z=-9.5) ]
            [   hall  x -6..6  z -8..0   ]  TARGET x -2.5..2.5 z -8..-5.5, 2 pillars
                    |  gallery x -2.5..2.5, z 0..34 (dead end, rubble)
      bayW1 z11-14 -|- bayE1 z5-8      bays are 3 m aisles, x to ±11, lined with lager casks
      bayW2 z23-26 -|- bayE2 z17-20 (no bulb: dark)
```

## Files & owners (one owner per file — do not edit files you don't own)
| File | Owner | Export |
|---|---|---|
| `src/main.js`, `src/core/progress.js`, `src/ui/title.js`, `src/level2/layout.js`, `docs/*` | lead | — |
| `src/level2/cellar.js` (+ any `src/level2/cellar*.js`) | world | `buildCellar(ctx2)` |
| `src/level2/level2.js`, `config2.js`, `player.js`, `barrels.js`, `rats.js`, `camera2.js`, `models2.js`, `bot2.js` | gameplay | `createLevel2(host)` |
| `src/level2/ui2.js`, `ui2.css`, `audio2.js`, `src/ui/i18n.js`, `src/ui/ui.js`, `src/audio/audio.js` | ui | `createUI2(ctx2)`, `createAudio2(ctx2)` |

Stubs exist for `cellar.js`, `ui2.js`, `audio2.js` so everything runs from the start — owners replace them.

## Integration (lead, already in main.js)
- main.js keeps ONE renderer + the colour grading (`src/fx/grading.js`). Level 2 is its own `THREE.Scene` + camera.
- Opening level 2: `const L2 = createLevel2(host)` once (lazy import), then `L2.enter()`; each frame main calls
  `L2.frame(dt, t)` and renders `L2.scene` with `L2.camera` through the grading, applying `L2.grade` uniforms.
  Level 1 state becomes `'level2'` while level 2 is active, which hides every level 1 / main-menu screen.
- `host = { THREE, renderer, isMobile, quality: 'high'|'low', params: URLSearchParams, onExit() }`.
  `onExit()` = go back to the main menu (call it when the player picks "Menu"; main then calls `L2.exit()`).
- URL: `?level=2` opens level 2's briefing directly; `?level=2&autostart=1` starts the countdown at once.
  `?level=2&cam=orbit` free OrbitControls in the cellar (gameplay implements it inside level2.js). `?nograde=1` works.
- Level 2 must not touch level 1 modules/state. Use its own event bus: `import { createEvents } from '../core/events.js'`.

### createLevel2(host) → object (gameplay)
```
{ scene, camera,
  enter(),            // show briefing (state 'brief'), or countdown if ?autostart
  exit(),             // state 'off', stop audio, release input
  frame(dt, t),       // update everything (does NOT render)
  resize(w, h),       // camera aspect
  grade: { sepia, vignette, grain, contrast, exposure },   // read by main every frame
  events }            // the level 2 bus (debug)
```
Also `window.__l2 = { ctx2, state, player, barrels, rats, ... }` for debugging, and a debug bot `?l2bot=1`
(`bot2.js`) that plays the level by itself (follows waypoints, pushes all 4 barrels in) — used to verify the level
is completable and to measure times.

### ctx2 (built by level2.js, passed to buildCellar / createUI2 / createAudio2)
```
ctx2 = { THREE, scene, camera, renderer, events /* level 2 bus */, config /* CONFIG2 */, quality, isMobile, layout /* the layout.js module */ }
```

### buildCellar(ctx2) → { update(dt, t, focus) } (world)
Adds the whole static cellar + all lights to `ctx2.scene`. `focus = { x, z }` = player position.
Freeze static matrices yourself (`matrixAutoUpdate = false` after `updateMatrix()`).
- **Lights are yours.** At most **4 real PointLights** at once (+ one HemisphereLight / ambient, very dim). Static
  surfaces should get the light of ALL bulbs: recommended = bake bulb falloff (+ cheap AO in corners/vault springs)
  into vertex colours of finely enough tessellated static geometry, or into a lightmap. The real lights are
  re-assigned to the bulbs nearest to `focus` every frame (fade in/out, no popping) so the moving things (player,
  barrels, rats — Lambert materials) are lit consistently. Flickering bulbs flicker (bulb glow + light). Optional on
  `quality === 'high'`: one shadow-casting SpotLight under the nearest bulb pointing down (512 map).
- Bulb visuals: tiny glowing glass bulb (MeshBasic, emissive look), cord to the vault, a soft additive halo sprite.
- `scene.background` + `scene.fog` (near-black warm brown). The player must still read silhouettes: never pure black.
- The target zone: chalk rectangle + chalk lettering on the floor ("STÁČÍRNA" / arrow), lit by the strongest bulb.
- Budget: ≤ 40 draw calls, ≤ 90 k triangles for the whole static cellar incl. bulbs. Cask rows instanced.

### Gameplay (level2.js & co)
- Controls: `ui2.input = { x, y }` analog stick, |v| ≤ 1, screen space (y = up on screen = forward). Movement is
  camera-relative. Keyboard WASD/arrows is handled by ui2 and written into the same input.
- **Pushing**: barrels lie on their side and only roll freely along their rolling direction (perpendicular to the
  axis); sideways they slide with heavy friction. The player can only push (never pull/carry). Pushing from behind
  (within ~40° of the rolling direction) rolls the barrel ahead of him and slowly steers it toward his heading
  (turning rate limited — wide arcs, the skill of the level). Pushing from the side turns/slides it slowly.
  Released, a barrel keeps rolling on its momentum and decelerates; it bounces softly off walls and other barrels
  (emit `barrel:bump`). Visual roll angle = distance / 0.33. Player walks ~3.2 m/s, ~2 m/s while pushing.
  Reuse `createBarrelMesh` from `src/vehicle/truckModel.js` (axis along local Y → lay it down).
- Delivery: barrel center inside `TARGET` → `barrel:delivered`; animate it onto the dock, stood upright, into the
  next `DOCK_SLOTS` slot; it is no longer interactive. All delivered → `finish`.
- Rats (2–3, `models2.js` low-poly rat with a wiggling tail, InstancedMesh or a few meshes): wander randomly on
  walkable floor (pause, sniff, sudden dashes, prefer dark edges along walls), flee from a rolling barrel. Touching
  the player → `rat:bite` (player flinches ~0.8 s, lets go of the barrel, short invulnerability, the rat runs off).
  3 bites → fail. Squeaks occasionally (`rat:squeak`).
- Camera: chase camera behind/above the player (~4 m back, ~2.6 m up), never through walls (`rayDist`) or above the
  vault (`ceilAt`), lazily follows the movement direction; slight lag. Must keep the barrel in front visible.
- Fake blob shadows under player, barrels and rats (one shared texture, always on).
- On `finish`: `progress.complete(2, { stars, time })` from `src/core/progress.js`.

### Level 2 events (level 2 bus)
```
'state'            { state: 'off'|'brief'|'countdown'|'playing'|'paused'|'won'|'lost', prev }
'countdown'        { n: 3|2|1|0 }
'barrel:bump'      { strength 0..1, x, z }        // barrel hit a wall / barrel
'barrel:delivered' { index, delivered, total }
'push'             { on: bool }                   // player started/stopped pushing a barrel
'rat:bite'         { bites, maxBites }
'rat:squeak'       { distance, pan -1..1 }
'finish'           { time, bites, stars }
'fail'             { reason: 'time'|'rats', time, bites, delivered }
UI -> game: 'ui:start' 'ui:restart' 'ui:pause' 'ui:resume' 'ui:title'   (+ 'audio:volume' 'audio:mute' as in level 1)
```

### createUI2(ctx2) → { input, update(dt), setHUD(hud) } (ui)
Visual language = level 1 UI (`src/ui/ui.css`: enamel plates, paper screens, oak gradients, the stamp; fonts in
`public/fonts`). Level 2 screens: briefing (story + mission + start + menu), countdown, HUD, pause (resume/restart/menu,
volume, sound, fullscreen), win (stamp, stats, history card about lager cellars, "again" / "menu"), fail.
HUD: time left, barrels delivered (4 small barrel icons), bites (3 small rat/tooth icons), a small guide arrow
(`hud.guide`), pause button. Touch: floating analog stick on the left half (appears where the thumb lands).
Hidden completely in state `'off'`. Same portrait-rotate overlay behaviour as level 1.
```
hud = { state, time, timeLimit, delivered, total, bites, maxBites, pushing, guide /* radians rel. to camera forward, + = right, null = none */, fps }
```
### createAudio2(ctx2) → { unlock(), update(dt, s) } (ui) — procedural WebAudio, own AudioContext
`s = { state, playerSpeed, pushing, barrelRoll /* max rolling speed of any barrel m/s */, ratDist /* nearest rat m */ }`.
Cellar ambience (dripping water, distant hum), footsteps on wet stone, barrel rolling rumble, bumps, rat squeaks and
patter, bite sting, delivery thunk, win/fail jingle, bulb buzz near flickering bulbs (optional). Respect `settings`.
Level 1 audio (`src/audio/audio.js`) must go silent while main state is `'level2'`.

## Verification (everyone)
`npm run dev` (port 5173, `.claude/launch.json` "game") → `http://localhost:5173/?level=2&autostart=1`.
Landscape phone viewport for checks: 844×390. `npm run build` must pass. Measure `renderer.info.render.calls/triangles`.
