// Level 2 "Válení sudů ve sklepě" — the lager cellar (owner: world).
//
// buildCellar(ctx2) -> { update(dt, t, focus) }
//
// Lighting: every static surface carries the light of ALL bulbs baked into vertex attributes
// (Lambert falloff I*cos/(pi d^2) with ray-marched visibility, a fake bounce and ray-marched AO;
// flickering bulbs live in separate channels so their baked light flickers too). The world uses cheap
// MeshBasic materials; the wet floor adds a specular term from the active lights. Four real PointLights
// follow the 4 bulbs that matter most around `focus` (cross-faded, never popping) + one dim hemisphere
// light, so moving Lambert objects (player, barrels, rats) match the baked world. On quality 'high' a
// SpotLight under the nearest bulb throws real shadows of the moving objects onto a ShadowMaterial patch.
import * as THREE from 'three';
import { BULBS, GRID, isWalkable } from './layout.js';
import { MB, visible, BULB_RANGE, bulbI, FLICK_SLOT, CASK, lin } from './cellarGeo.js';
import { buildShell } from './cellarShell.js';
import { caskGeometry, caskInstances, buildStructure, buildBlocks, buildServices, buildPuddles, buildDecals, bulbGlassGeometry, haloGeometry } from './cellarProps.js';
import { getCellarTextures } from './cellarTextures.js';
import { createUniforms, bakedMaterial, caskMaterial, glassMaterial, haloMaterial } from './cellarMaterials.js';

const FOG = 0x0a0705;
const WARM = 0xffb571;          // ~2400 K incandescent
const AMB = [0.1, 0.11, 0.14]; // cold, very dim fill (linear)
const MAX_LIGHTS = 4;

export function buildCellar(ctx2) {
  const { scene } = ctx2;
  const high = ctx2.quality === 'high';
  const t0 = performance.now();
  const tex = getCellarTextures();

  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.Fog(FOG, 6, 34);

  const U = createUniforms(BULBS.length);
  const warm = lin(WARM);
  U.uWarm.value.set(...warm);
  U.uAmb.value.set(...AMB);
  BULBS.forEach((b, i) => { U.uBP.value[i].set(b.x, b.y, b.z); U.uBI.value[i] = bulbI(b); });

  // ---------------------------------------------------------------- static geometry
  const T = {}; let tp = performance.now(); const lap = (k) => { const n = performance.now(); T[k] = Math.round(n - tp); tp = n; };
  lap('tex');
  const brick = new MB(), floor = new MB(), wood = new MB(), misc = new MB(), decal = new MB();
  buildShell(brick, floor);
  buildStructure({ brick, floor, wood, misc });
  buildBlocks({ brick, wood, misc });
  buildServices({ misc });
  buildPuddles(floor);
  buildDecals(decal);
  lap('geo');

  const group = new THREE.Group();
  group.name = 'cellar';
  const add = (mb, mat, name, opts) => { const m = new THREE.Mesh(mb.build(opts), mat); m.name = name; group.add(m); return m; };
  add(brick, bakedMaterial('brick', tex.brick, U), 'cellar-brick');
  add(floor, bakedMaterial('floor', tex.flags, U, { specLights: high ? 4 : 2 }), 'cellar-floor');
  add(wood, bakedMaterial('tex', tex.wood, U), 'cellar-wood');
  add(misc, bakedMaterial('plain', null, U), 'cellar-misc');
  const decals = add(decal, bakedMaterial('decal', tex.decals, U), 'cellar-decals', { aoScale: 0.5 });
  decals.renderOrder = 1;
  lap('bake');

  // ---------------------------------------------------------------- lager casks (one InstancedMesh)
  const inst = caskInstances();
  const caskGeo = caskGeometry();
  const nI = inst.length;
  const visA = new Float32Array(nI * 4), visB = new Float32Array(nI * 4), visC = new Float32Array(nI * 2), head = new Float32Array(nI);
  const casks = new THREE.InstancedMesh(caskGeo, caskMaterial(tex.cask, U, BULBS.length), nI);
  casks.name = 'cellar-casks';
  inst.forEach((c, k) => {
    casks.setMatrixAt(k, c.matrix);
    // visibility of each bulb from three points on the cask (front head, top, aisle-side shoulder)
    const fz = c.z + c.dir * 0.12;
    const samples = [[c.x, CASK.cy, fz], [c.x, CASK.cy + CASK.rMid + 0.05, c.z - c.dir * 0.6], [c.x, CASK.cy + 0.5, fz]];
    const v = BULBS.map((b) => samples.reduce((s, p) => s + visible(p[0], p[1], p[2], b.x, b.y, b.z), 0) / samples.length);
    for (let i = 0; i < 9; i++) {
      const val = v[i] ?? 0;
      if (i < 4) visA[k * 4 + i] = val; else if (i < 8) visB[k * 4 + i - 4] = val; else visC[k * 2] = val;
    }
    visC[k * 2 + 1] = c.tint;
    head[k] = c.head;
  });
  caskGeo.setAttribute('aVisA', new THREE.InstancedBufferAttribute(visA, 4));
  caskGeo.setAttribute('aVisB', new THREE.InstancedBufferAttribute(visB, 4));
  caskGeo.setAttribute('aVisC', new THREE.InstancedBufferAttribute(visC, 2));
  caskGeo.setAttribute('aHead', new THREE.InstancedBufferAttribute(head, 1));
  casks.instanceMatrix.needsUpdate = true;
  casks.computeBoundingSphere();
  group.add(casks);
  lap('casks');

  // ---------------------------------------------------------------- bulbs: glass + halos
  const glass = new THREE.Mesh(bulbGlassGeometry(), glassMaterial(U, new THREE.Vector3(9, 5.2, 2.2)));
  glass.name = 'cellar-bulbs';
  group.add(glass);
  const haloSizes = BULBS.map((b) => 0.3 + 0.25 * b.power);
  const halos = new THREE.Mesh(haloGeometry(), haloMaterial(U, new THREE.Vector3(...warm).multiplyScalar(1.4), haloSizes));
  halos.name = 'cellar-halos';
  halos.renderOrder = 2;
  halos.frustumCulled = false;
  group.add(halos);

  scene.add(group);
  group.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
  group.updateMatrixWorld(true);

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
  // Lambert hemisphere response = albedo * colour / pi -> colours chosen so the average equals the baked ambient
  hemi.color.setRGB(AMB[0] * Math.PI * 1.25, AMB[1] * Math.PI * 1.25, AMB[2] * Math.PI * 1.25);
  hemi.groundColor.setRGB(AMB[0] * Math.PI * 0.75, AMB[1] * Math.PI * 0.75, AMB[2] * Math.PI * 0.75);
  scene.add(hemi);
  const slots = [];
  for (let k = 0; k < MAX_LIGHTS; k++) {
    const l = new THREE.PointLight(new THREE.Color().setRGB(...warm), 0, BULB_RANGE, 2);
    l.position.set(0, -50, 0);
    scene.add(l);
    slots.push({ light: l, bulb: -1, fade: 0 });
  }
  let spot = null, shadowPatch = null, shadowBulb = -1, shadowOpacity = 0;
  if (high) {
    spot = new THREE.SpotLight(0xffffff, 0.001, 9, 1.05, 0.6, 2);
    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.camera.near = 0.4; spot.shadow.camera.far = 8;
    spot.shadow.bias = -0.0015; spot.shadow.radius = 3;
    spot.position.set(0, -50, 0);
    scene.add(spot, spot.target);
    shadowPatch = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0, color: 0x050302, depthWrite: false }));
    shadowPatch.receiveShadow = true;
    shadowPatch.position.y = 0.012;
    shadowPatch.renderOrder = 1;
    scene.add(shadowPatch);
  }

  // per walkable cell: visibility of each bulb from chest height (for real-light selection / dimming)
  const NB = BULBS.length;
  const cellVis = new Float32Array(GRID.nx * GRID.nz * NB);
  for (let j = 0; j < GRID.nz; j++) for (let i = 0; i < GRID.nx; i++) {
    const x = GRID.x0 + (i + 0.5) * GRID.cell, z = GRID.z0 + (j + 0.5) * GRID.cell;
    if (!isWalkable(x, z)) continue;
    for (let b = 0; b < NB; b++) {
      const B = BULBS[b];
      const d2 = (B.x - x) ** 2 + (B.z - z) ** 2;
      if (d2 > BULB_RANGE * BULB_RANGE) continue;
      cellVis[(j * GRID.nx + i) * NB + b] = visible(x, 1.1, z, B.x, B.y, B.z);
    }
  }
  lap('cellVis');
  const bv = new Float32Array(NB).fill(0);   // smoothed visibility from the focus
  let bvInit = false;

  // ---------------------------------------------------------------- flicker
  const fl = BULBS.map((b, i) => ({ F: b.flicker, f: 1, target: 1, burst: 0, next: 1 + ((i * 2.37) % 3), tog: 0, ph: i * 1.91 }));
  const rnd = (() => { let s = 12345; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
  function updateFlicker(dt, t) {
    fl.forEach((q, i) => {
      if (q.F <= 0) { q.f = 1; return; }
      let target = 1 - q.F * 0.06 * (0.5 + 0.5 * Math.sin(t * (7 + i) + q.ph)) * (0.5 + 0.5 * Math.sin(t * 2.3 + q.ph * 2));
      if (q.burst > 0) {
        q.burst -= dt; q.tog -= dt;
        if (q.tog <= 0) { q.tog = 0.03 + rnd() * 0.09; q.low = rnd() < 0.55 ? 1 - q.F * (0.55 + 0.45 * rnd()) : 1; }
        target = Math.min(target, q.low ?? 1);
      } else {
        q.next -= dt;
        if (q.next <= 0) { q.burst = 0.12 + rnd() * (0.25 + 1.1 * q.F); q.next = 1.2 + rnd() * (2.5 + 7 / q.F); q.tog = 0; }
      }
      q.f += (target - q.f) * Math.min(1, dt * 28);
    });
  }

  // ---------------------------------------------------------------- per-frame
  const fpos = new THREE.Vector3();
  const order = BULBS.map((_, i) => i);
  const score = new Float32Array(NB);
  function update(dt, t, focus) {
    dt = Math.min(dt || 0, 0.1);
    updateFlicker(dt, t || 0);
    const fv = [1, 1, 1, 1, 1];
    for (let i = 0; i < NB; i++) {
      const f = fl[i].f;
      U.uBulbF.value[i] = f;
      U.uBI.value[i] = bulbI(BULBS[i]) * f;
      if (FLICK_SLOT[i] >= 0) fv[FLICK_SLOT[i]] = f;
    }
    U.uFl.value.set(fv[0], fv[1], fv[2], fv[3]); U.uFl5.value = fv[4];

    // focus visibility (smoothed)
    const fx = focus && Number.isFinite(focus.x) ? focus.x : 0, fz = focus && Number.isFinite(focus.z) ? focus.z : -3;
    fpos.set(fx, 1.2, fz);
    const ci = Math.floor((fx - GRID.x0) / GRID.cell), cj = Math.floor((fz - GRID.z0) / GRID.cell);
    if (ci >= 0 && cj >= 0 && ci < GRID.nx && cj < GRID.nz && isWalkable(fx, fz)) {
      const base = (cj * GRID.nx + ci) * NB;
      const k = bvInit ? Math.min(1, dt * 4) : 1;
      for (let b = 0; b < NB; b++) bv[b] += (cellVis[base + b] - bv[b]) * k;
      bvInit = true;
    }
    // choose the bulbs that matter most here
    for (let b = 0; b < NB; b++) {
      const B = BULBS[b];
      const d2 = fpos.distanceToSquared(U.uBP.value[b]);
      const assigned = slots.some((s) => s.bulb === b && s.fade > 0);
      score[b] = bulbI(B) * (0.15 + bv[b]) / (d2 + 4) * (assigned ? 1.3 : 1);
    }
    order.sort((a, b) => score[b] - score[a]);
    const want = order.slice(0, MAX_LIGHTS);
    for (const s of slots) {
      const keep = s.bulb >= 0 && want.includes(s.bulb);
      s.fade = Math.max(0, Math.min(1, s.fade + (keep ? 1 : -1) * dt * 2.5));
    }
    for (const s of slots) {
      if (s.bulb >= 0 && s.fade > 0) continue;
      const free = want.find((b) => !slots.some((o) => o.bulb === b));
      s.bulb = free ?? -1; s.fade = 0;
      if (free !== undefined) s.light.position.copy(U.uBP.value[free]).y -= 0.02;
    }
    let best = null;
    slots.forEach((s, k) => {
      const b = s.bulb;
      const I = b >= 0 ? U.uBI.value[b] * s.fade * (0.2 + 0.8 * bv[b]) : 0;
      s.light.intensity = I;
      U.uLP.value[k].copy(s.light.position);
      U.uLI.value[k] = I;
      if (b >= 0 && (!best || I > best.I)) best = { b, I };
    });
    // optional real shadow under the strongest nearby bulb
    if (spot) {
      const wantB = best ? best.b : -1;
      if (wantB !== shadowBulb) {
        shadowOpacity = Math.max(0, shadowOpacity - dt * 3);
        if (shadowOpacity === 0) {
          shadowBulb = wantB;
          if (wantB >= 0) {
            const B = BULBS[wantB];
            spot.position.set(B.x, B.y - 0.06, B.z); spot.target.position.set(B.x, 0, B.z); spot.target.updateMatrixWorld();
            shadowPatch.position.x = B.x; shadowPatch.position.z = B.z;
          }
        }
      } else if (shadowBulb >= 0) shadowOpacity = Math.min(1, shadowOpacity + dt * 3);
      shadowPatch.material.opacity = 0.5 * shadowOpacity * (shadowBulb >= 0 ? fl[shadowBulb].f : 0);
      shadowPatch.visible = shadowPatch.material.opacity > 0.01;
    }
  }
  update(0, 0, null);

  const ms = performance.now() - t0;
  if (ctx2.params?.get?.('debug')) console.info(`[cellar] built in ${ms.toFixed(0)} ms`);
  return { update, group, lights: slots.map((s) => s.light), buildMs: ms, timings: T };
}
