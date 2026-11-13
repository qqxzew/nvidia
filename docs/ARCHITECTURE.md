# Plzeň 1926 — Level 1 "Jízda do Světovaru"

Mobile-first browser game (Three.js + Vite, vanilla ES modules). Landscape. Czech UI only (prototype).
A tourist drives a 1920s brewery truck loaded with 10 beer barrels from **náměstí Republiky** to the
**Světovar brewery** (Český plzeňský pivovar, Bory — today's TechTower) in under 1:50 (CONFIG.game.timeLimit), losing at most 2 barrels.

Art direction: **stylized low-poly with good light and a "hand-coloured postcard" grade** (warm, slightly
desaturated, lifted blacks, vignette — done in `src/fx/grading.js`, you don't need to do it). Late-summer
afternoon, low warm sun ahead-right of the driver, light haze. Slightly sombre city, pleasant nature.
Era: 1910–1933 Czechoslovakia (Austro-Hungarian Art Nouveau / historicist facades, cobblestones,
gas/electric street lamps, trams with overhead wires, horse carts, men in hats).

Reference photos & original 1911–1912 plans: `docs/reference/` (open them with the Read tool — it shows images).
- `3.webp 4.webp 7.webp 8.webp 9.webp 10.webp 11.webp 13.webp 14.webp 15.webp 16.webp` — Světovar photos/postcards
- `12.webp` — 1911 street elevation drawing of the complex (scale 1:250) ← best source for silhouettes
- `17.jpg 18.jpg` — building sections (malt tower, cellars, brewhouse "Varna", silo, machine room, boiler house)
- `19.jpg` — 1912 site plan (Kolna, Bednárna, Sladovna, Varna, Silo, Strojovna, Kotelna, Sklepy, Stáčení piva, Kantina, Administrativní budova, Garage, Benzinka, railway siding "vlečka")
- `5.webp 6.webp 9.webp` — the truck (solid rubber tyres, wooden spoke wheels, open cab with roof, flat bed with side boards, barrels)
- `1.webp 2.webp` — mood references only (chase cam, warm dusty light). Do NOT copy anything from those games.

**Levels:** `src/main.js` is a tiny router. No `?level` → level 1 (`src/level1.js`, everything below).
`?level=4` → level 4 "Varna" (`src/level4/`, standalone, not in the main flow yet) — see `docs/LEVEL4.md`.
`?level=5` → level 5 "Šílená stáčírna" (`src/level5/`, standalone, not in the main flow yet) — see `docs/LEVEL5.md`.

## Conventions (must follow)
- Units meters. **Y up. X = east, Z = south.** Ground is y = 0 everywhere (flat world).
- A model with `rotation.y = yaw = 0` faces **+Z**. Heading vector = `(sin yaw, cos yaw)`.
  The driver's **right** is `(-cos yaw, sin yaw)` → when facing +Z, right is −X.
- `import * as THREE from 'three'`. Addons: `three/addons/...` (e.g. `three/addons/utils/BufferGeometryUtils.js`).
- No external asset files are required; prefer procedural geometry + `CanvasTexture` (≤ 1024 px, shared, `colorSpace = THREE.SRGBColorSpace`, mipmaps on).
  CC0 downloads are allowed if they clearly add quality, put them in `public/assets/...` and keep each < 1 MB.
- Materials: `MeshLambertMaterial` by default (cheap on phones). `MeshStandardMaterial` only for a few hero pieces.
  Share materials; never create one material per object.
- **Draw calls are the #1 mobile cost.** Merge static geometry by material (`BufferGeometryUtils.mergeGeometries`)
  and use `InstancedMesh` for repeated things (windows, lamps, trees, fence panels, barrels on the ground).
- Shadows: `castShadow` on buildings/props near the road and vehicles; `receiveShadow` on ground/road/facades.
- Everything added to the scene during build is frozen (`matrixAutoUpdate = false`) by main.js afterwards.
  If something must animate (smoke, wheels, flags), set `obj.userData.dynamic = true` on it **before** returning,
  and either return `{ update(dt, t, truckState) }` or push `{ update(dt, t, truckState) }` into `ctx.dynamic`.

## Shared context `ctx` (passed to every builder)
```
ctx = { THREE, scene, camera, renderer, route, events, config, quality: 'high'|'low', isMobile,
        sun, sunDir, hemi,
        colliders: [],         // static circles {x, z, r, kind}            ← builders PUSH here
        dynamicColliders: [],  // moving circles {x, z, r, vx, vz, kind, onHit?} ← traffic REWRITES each frame
        hazards: [],           // bumps {s, lateral, radius, strength 0..1}  ← city pushes potholes / rails
        dynamic: [] }          // {update(dt, t, truckState)}
```
`truckState` = `{ x, z, yaw, speed (m/s), s (arc length along route), lateral, zone, progress 0..1, latAcc, longAcc, wheelSpin, wheelAngle }`.

## Route (`src/world/route.js`, owned by the lead)
`route.length` (~1162 m; zones start at square 0, town 110, suburb 578, field 871, brewery 1080 — read them at runtime), `route.zones` = `[{id, s0, s1}]` with ids `square → town → suburb → field → brewery`.
- `route.frameAt(s)` → `{x, z, tx, tz (unit forward), rx, rz (unit right), yaw}`
- `route.pointAt(s, lateral, y)` → `Vector3` (lateral + = right of driving direction)
- `route.halfWidthAt(s)` → drivable half-width (curb to curb / 2). The truck **cannot leave** `|lateral| <= halfWidth`;
  the corridor walls are the curbs. So everything beyond the curb is pure decoration: sidewalks start at
  `halfWidth`, house fronts at about `halfWidth + 3` (town) / `+ 6..14` (suburb front gardens).
- `route.zoneAt(s)`, `route.project(x, z)` → `{s, lateral}`
- `route.anchors` — `start`, `square {minX,maxX,minZ,maxZ, cathedral{x,z,yaw}}`, `squareExit`, `rail {z, fromX, toX}`,
  `railCrossing {s,x,z}`, `fence {x, fromZ, toZ}`, `gate {s,x,z,yaw}`, `brewery {minX,maxX,minZ,maxZ}`, `finish {x,z,yaw,radius}`.

## Module ownership (one owner per file — do not edit files you don't own)
| File | Owner | Export |
|---|---|---|
| `src/main.js` (router), `src/level1.js`, `src/config.js`, `src/core/*`, `src/world/route.js`, `src/vehicle/controller.js`, `src/gameplay/cargo.js`, `src/fx/*` | lead | — |
| `src/vehicle/truckModel.js` | vehicles | `createTruck(ctx)`, `createBarrelMesh(ctx)` |
| `src/gameplay/traffic.js` (+ `src/vehicle/trafficModels.js`) | vehicles | `createTraffic(ctx)` |
| `src/world/square.js` | landmarks | `buildSquare(ctx)` |
| `src/world/svetovar.js` | landmarks | `buildSvetovar(ctx)` |
| `src/world/city.js`, `src/world/environment.js`, `src/world/props.js`, `src/world/textures.js` | city | `buildCity(ctx)`, `buildEnvironment(ctx)` |
| `src/ui/*`, `src/audio/*` | ui | `createUI(ctx)`, `createAudio(ctx)` |

### createTruck(ctx) → object
```
{ group,        // Object3D at ground level, origin centered between the axles, facing +Z. Controller sets position/rotation.y.
  body,         // child of group: everything sprung (cab, bed, driver). Controller sets body.rotation.x/z and position.y.
  cargoRoot,    // child of body: barrels get parented here.
  cargoSlots,   // exactly 10: [{ position: Vector3, rotation: Euler, layer: 0|1 }] local to cargoRoot.
                //   Barrels lie on their side, axis across the truck (local X). Layer 0 = 6 on the bed, layer 1 = 4 on top.
  setWheels(spinAngle, steerAngle), // spin in radians (rolling forward = positive), steer > 0 = wheels turned to the driver's RIGHT
  dims: { length, width, height, wheelBase } }
```
`createBarrelMesh(ctx)` → `Object3D`, origin at barrel center, **axis along local Y** (cargo applies `slot.rotation`,
so make slot rotations lay it on its side), radius 0.33 m, length ≈ 0.8 m, castShadow.

### Builders
`buildSquare(ctx)`, `buildSvetovar(ctx)`, `buildCity(ctx)`, `buildEnvironment(ctx)` → `{ update?(dt, t, truckState) }`.
`createTraffic(ctx)` → `{ update(dt, truckState, t), reset() }` and writes moving colliders into `ctx.dynamicColliders`.

### createUI(ctx) → `{ input: {steer -1..1, throttle 0..1, brake 0..1}, update(dt), setHUD(hud) }`
UI → game events: `ui:start`, `ui:restart`, `ui:pause`, `ui:resume`, `ui:menu`, `horn`.
Game → UI events: see `src/core/events.js` (`state`, `countdown`, `barrel:lost`, `barrel:wobble`, `impact`, `finish`, `fail`, `zone`).
`hud = { state, time, timeLimit, remaining, lost, total, maxLost, speedKmh, warning, looseness, progress, zone, fps }`.

### createAudio(ctx) → `{ unlock(), update(dt, truckState, game) }` — procedural WebAudio, no files needed.

## Performance budget (mid-range phone, 2022, 30+ fps)
| Part | Draw calls | Triangles |
|---|---|---|
| square + cathedral | ≤ 30 | ≤ 60 k |
| Světovar complex | ≤ 35 | ≤ 70 k |
| city corridor + environment | ≤ 60 | ≤ 160 k |
| truck + 10 barrels | ≤ 20 | ≤ 25 k |
| traffic | ≤ 25 | ≤ 30 k |

## Debug / verification
- `npm run dev` then open `http://localhost:<port>/?autostart=1&s=600` (start at arc length 600 m).
- `?cam=orbit` free orbit camera, `?view=truck|square|svetovar|city` orbit around one module, `?nograde=1`, `?god=1`, `?q=low|high`.
- `window.__game` exposes ctx, `G` (state), `controller`, `cargo`. `renderer.info.render.calls/triangles` for budgets.
- Keyboard (desktop): arrows/WASD, Enter = start.
- Always finish with `npm run build` passing.
