// Level 4 "Varna" — the REAL Světovar buildings around the first-person run (owner: art). v2 (2026-11-13).
// Everything stands in level-4 local coordinates (local = level-1 world − L4_ORIGIN, Y unchanged), taken from
// src/core/sites.js (BUILDINGS, LEVEL4_ROUTE, L4_ORIGIN, toL4) — the 1911/1912 drawings in docs/reference/:
//   1) Varna, 2nd floor: grating gallery around and across the open double-height kettle hall; the two copper brew
//      kettles stand below on the přízemí floor (1.2 m), their onion hoods + vapour stacks rise past the gallery
//      through the ceiling (11.2 m slab); 0.6 m outer walls with paired tall windows per storey (1911 elevation),
//      slabs of the other floors (1.2 / 4.8 ledge / 8.0 / 11.2), pipes, valves, grist hopper, enamel lamps.
//   2) Clock tower (SW corner): cramped shaft; you pass the tower-clock movement (pendulum, weights, leading-off rod).
//   3) Covered bridge: enclosed, plank barrel vault, windows on both sides — through them the yard tracks with wagons,
//      the bottling-hall roofs, the 48 m chimney and the sky (cheap baked-haze boxes, unfogged).
//   4) Cellar-tower stair building + tower: brick shaft, dog-leg stair, hoist with winch; steel stairs (course.stairs,
//      treads match course.deckAt) through the 1.2 m wall up into
//   5) the cooling floor ("chladicí štok") under the cellars' gable roof with the louvred ridge lantern: big shallow
//      riveted iron cooling pans (Kühlschiff) on legs with haze, a Baudelot cooler, and the main-valve finish platform.
// Inputs read at runtime (never hard-coded s): course.path / length / sections / hazards / finish, course.deckAt(s)
// (walking surface; falls back to run.deckY), course.stairs [{s0, s1, y0, y1}]. Holes are real gaps in the grating.
//
// Static geometry is merged per material per CH m of course (frustum + path-distance culling); hazards animate through
// the course.js helpers. Lights: 3 warm SpotLights hop between the route lamps ahead + 1 cold DirectionalLight.
//
// Debug URL params (work without runner.js):
//   &artcam=s,lat[,h,lookAhead]   first-person camera at course arc length s, lateral lat (m), eye height h above the deck
//   &artcam=x,y,z,tx,ty,tz        free camera (local position + target)
//   &artt=12.3                    freeze the hazard clock at this race time
//   &artfall=1                    all falling sacks/crates triggered at race time 0
//   &artcut=1                     no fog, no ceilings/roofs (look in from above with &cam=orbit)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTextures, rng, WALLT, DECALS4, GRATE } from './textures.js';
import * as C4 from './course.js';
import { BUILDINGS, LEVEL4_ROUTE, L4_ORIGIN, toL4 } from '../core/sites.js';

// course.js helpers through the namespace (a missing export must not break the module)
const BLOCK_HEIGHT = C4.BLOCK_HEIGHT ?? 0.55;
const steamLevel = C4.steamLevel || (() => 0);
const dripState = C4.dripState || (() => ({ y01: null, forming: 0, active: false }));
const fallProgress = C4.fallProgress || ((tt, t) => (tt == null ? null : Math.min(1, Math.max(0, (t - tt) / 0.8))));

// palette (sRGB)
const IRON = 0x2b2c2f, IRON2 = 0x3c3e42, STEEL = 0x9a968a, STEEL_D = 0x3f3c38, RED_LEAD = 0x9a3b22, RED_WHEEL = 0xa3281c;
const COLUMN = 0xb3ac9a, COLUMN2 = 0x958e7e, VAT_GREEN = 0x4b5a50, VAT_GREY = 0x6a6a62, LAGGING = 0xd9d0bb, CREAM = 0xe2d8c0;
const WOOD = 0x8d6a45, WOOD2 = 0x6e5136, WOOD_DARK = 0x4c3828, STONE = 0x9c9282, MASH = 0x7d5a32, GRAIN = 0x9a7a44;
const ENAMEL_G = 0x2e5845, ENAMEL_W = 0xece4d0, CEILING = 0x8a8170, BEAM = 0x34353a, BRASS = 0xd0a24c;
const FOG_COL = 0x241c15, FOG_D = 0.0165;

const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");

// ---------------------------------------------------------------------------------------------- kit
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

function prep(geo, o, keepUv, keepColor) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) {
    if (k === 'position' || k === 'normal' || (keepUv && k === 'uv') || (keepColor && k === 'color')) continue;
    g.deleteAttribute(k);
  }
  if (keepUv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  if (o.m) g.applyMatrix4(o.m);
  else {
    if (o.q) _q.copy(o.q); else _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'YXZ'));
    _m.compose(_p.set(o.x || 0, o.y || 0, o.z || 0), _q, _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
    g.applyMatrix4(_m);
  }
  return g;
}

class Batch {
  constructor({ color = true, uv = false, post = null } = {}) { this.parts = []; this.color = color; this.uv = uv; this.post = post; }
  add(geo, color = 0xffffff, o = {}) {
    const keepColor = this.color && !!o.keepColor && !!geo.attributes.color;
    const g = prep(geo, o, this.uv, keepColor);
    if (this.color && !keepColor) {
      const n = g.attributes.position.count, a = new Float32Array(n * 3);
      _c.set(color);
      for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    if (this.post) this.post(g);
    this.parts.push(g);
    return g;
  }
  box(w, h, d, c, x = 0, y = 0, z = 0, o = {}) { return this.add(new THREE.BoxGeometry(w, h, d), c, { ...o, x, y, z }); }
  cyl(rt, rb, h, seg, c, x = 0, y = 0, z = 0, o = {}) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open), c, { ...o, x, y, z }); }
  sph(r, ws, hs, c, x = 0, y = 0, z = 0, o = {}) { return this.add(new THREE.SphereGeometry(r, ws, hs), c, { ...o, x, y, z }); }
  /** cylinder between two points */
  link(p0, p1, r0, r1, c, seg = 8) {
    const a = _v0.set(p0[0], p0[1], p0[2]), b = _v1.set(p1[0], p1[1], p1[2]);
    const d = _v2.subVectors(b, a), len = d.length();
    if (len < 1e-4) return null;
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize());
    return this.add(new THREE.CylinderGeometry(r1, r0, len, seg, 1, true), c, { q, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
  }
  /** thin box between two points (w across, t thickness) */
  bar(p0, p1, w, t, c) {
    const a = _v0.set(p0[0], p0[1], p0[2]), b = _v1.set(p1[0], p1[1], p1[2]);
    const d = _v2.subVectors(b, a), len = d.length();
    if (len < 1e-4) return null;
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize());
    return this.add(new THREE.BoxGeometry(w, len, t), c, { q, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
  }
  mesh(material) {
    if (!this.parts.length) return null;
    const geo = mergeGeometries(this.parts, false);
    geo.computeBoundingSphere();
    return new THREE.Mesh(geo, material);
  }
}
const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

/** raw triangle soup → geometry; flips winding so the first face's normal agrees with `want` (if given) */
function soup(pos, uv = null, col = null, want = null) {
  const g = new THREE.BufferGeometry();
  const P = new Float32Array(pos);
  if (want && pos.length >= 9) {
    const ax = P[3] - P[0], ay = P[4] - P[1], az = P[5] - P[2], bx = P[6] - P[0], by = P[7] - P[1], bz = P[8] - P[2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (nx * want[0] + ny * want[1] + nz * want[2] < 0) {
      const sw = (A, k) => { for (let i = 0; i < A.length; i += 3 * k) for (let j = 0; j < k; j++) { const t = A[i + k + j]; A[i + k + j] = A[i + 2 * k + j]; A[i + 2 * k + j] = t; } };
      sw(P, 3); if (uv) sw(uv, 2); if (col) sw(col, 3);
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// planar world UVs for the tall wall texture (3.6 m x 14.4 m)
function wallUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, v = Math.min(Math.max(y, 0.01), WALLT.height - 0.02) / WALLT.height;
    if (ny > 0.7) { u = (x + z) / WALLT.width; v = 0.6; } else if (nx > nz) u = z / WALLT.width; else u = x / WALLT.width;
    uv.setXY(i, u, v);
  }
}

// segmental-arch window outline: rectangle sill..spring, arch with `rise` above spring
function windowPath(path, cx, w, sill, spring, rise) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const R = (w * w / 4 + rise * rise) / (2 * rise), cy = spring + rise - R;
  const a1 = Math.atan2(spring - cy, x1 - cx), a0 = Math.PI - a1;
  path.moveTo(x0, sill); path.lineTo(x1, sill); path.lineTo(x1, spring);
  path.absarc(cx, cy, R, a1, a0, false);
  path.lineTo(x0, sill);
}
function archPoints(cx, w, spring, rise, n) {
  const R = (w * w / 4 + rise * rise) / (2 * rise), cy = spring + rise - R;
  const a1 = Math.atan2(spring - cy, w / 2), a0 = Math.PI - a1, pts = [];
  for (let i = 0; i <= n; i++) { const a = a1 + (a0 - a1) * (i / n); pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  return pts;
}

// additive materials: fade with the fog (instead of adding fog colour) and optionally near the camera
function glowPatch(mat, near = 0) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDist;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDist = -mvPosition.z;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vDist;')
      .replace('#include <fog_fragment>', `
      float ffade = 1.0;
      #ifdef FOG_EXP2
        ffade = exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
      #endif
      gl_FragColor.rgb *= ffade * ${near > 0 ? `smoothstep(${(near * 0.3).toFixed(2)}, ${near.toFixed(2)}, vDist)` : '1.0'};`);
  };
  mat.customProgramCacheKey = () => 'glow' + near;
  return mat;
}

// ---------------------------------------------------------------------------------------------- env map
function buildEnvMap(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.BoxGeometry(60, 14, 22);
  const col = new Float32Array(room.attributes.position.count * 3), p = room.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    col.set(y < -6 ? [0.12, 0.085, 0.06] : y > 6 ? [0.025, 0.022, 0.02] : [0.15, 0.13, 0.1], i * 3);
  }
  room.setAttribute('color', new THREE.BufferAttribute(col, 3));
  env.add(new THREE.Mesh(room, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 6.5, 3.2) });
  const cold = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 1.3, 1.6) });
  for (let x = -26; x <= 26; x += 7) for (const z of [-2, 3]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6), warm); s.position.set(x + (z > 0 ? 3 : 0), 2.5, z); env.add(s);
  }
  for (let x = -25; x <= 25; x += 7) for (const z of [-10.9, 10.9]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 5), cold); w.position.set(x, 2, z); w.lookAt(x, 2, 0); env.add(w);
  }
  const b = new THREE.Mesh(new THREE.PlaneGeometry(50, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.22, 0.13) }));
  b.rotation.x = -Math.PI / 2; b.position.y = -6.9; env.add(b);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.035, 0.1, 80);
  pm.dispose();
  env.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  return rt.texture;
}

// ---------------------------------------------------------------------------------------------- particles (steam)
const PARTICLE_VS = /* glsl */ `
attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSize;
uniform float fogDensity;
varying vec2 vUv; varying vec4 vCol; varying float vFog;
void main() {
  vUv = uv; vCol = iCol;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSize.y), s = sin(iSize.y);
  mv.xy += mat2(c, s, -s, c) * position.xy * iSize.x;
  float d = -mv.z;
  vFog = exp(-fogDensity * fogDensity * d * d) * smoothstep(0.15, 1.2, d);
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FS = /* glsl */ `
uniform sampler2D map; uniform vec3 fogColor;
varying vec2 vUv; varying vec4 vCol; varying float vFog;
void main() {
  float a = texture2D(map, vUv).a * vCol.a * vFog;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(fogColor, vCol.rgb, vFog), a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function createParticles(parent, tex, max) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', iPos); geo.setAttribute('iCol', iCol); geo.setAttribute('iSize', iSize);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, fogDensity: { value: FOG_D }, fogColor: { value: new THREE.Color(FOG_COL) } },
    vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 6; mesh.userData.dynamic = true;
  parent.add(mesh);
  const P = [];
  for (let i = 0; i < max; i++) P.push({ on: false });
  let cursor = 0;
  return {
    mesh,
    emit(o) {
      for (let k = 0; k < max; k++) {
        const p = P[cursor]; cursor = (cursor + 1) % max;
        if (p.on && k < max - 1) continue;
        Object.assign(p, { on: true, life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0.2, s1: 1, a: 0.3, r: 0.8, g: 0.77, b: 0.72, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.8, drag: 0.6, grav: 0, floor: -1e9, fadeIn: 0.15 }, o);
        return p;
      }
      return null;
    },
    update(dt) {
      let n = 0;
      for (const p of P) {
        if (!p.on) continue;
        p.life += dt;
        if (p.life >= p.max) { p.on = false; continue; }
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
        if (p.y < p.floor) { p.on = false; continue; }
        const f = p.life / p.max;
        const alpha = p.a * Math.min(1, f / p.fadeIn) * (1 - f) * (1 - f * 0.3);
        iPos.setXYZ(n, p.x, p.y, p.z);
        iCol.setXYZW(n, p.r, p.g, p.b, alpha);
        iSize.setXY(n, p.s0 + (p.s1 - p.s0) * Math.sqrt(f), p.rot);
        n++;
      }
      geo.instanceCount = n;
      iPos.needsUpdate = iCol.needsUpdate = iSize.needsUpdate = true;
      return n;
    },
  };
}

// ---------------------------------------------------------------------------------------------- build
export function buildFactory(ctx) {
  const { scene, renderer, camera, course, run } = ctx;
  const low = ctx.quality === 'low';
  const T = getTextures();
  const R = rng(1926);
  const root = new THREE.Group(); root.name = 'factory';
  scene.add(root);

  const path = course.path, L = course.length, LW = run.laneWidth, HALF = run.deckWidth / 2;
  const CH = 20;             // chunk length along the course (m)
  const RAIL = HALF + 0.05;  // railing line
  const LANE_EDGE = 1.5 * LW;
  const WT = 0.6;            // real outer wall thickness
  const finishS = course.finish ?? L - 2;
  const sF0 = Math.min(L - 6, finishS - 4); // finish platform starts here
  const sEnd = L + 1.2;
  const holeSpan = (h) => [h.s - h.len / 2, h.s + h.len / 2];
  const hazards = course.hazards || [];
  const sections = course.sections || [];
  const secAt = (s) => (sections.find((q) => s >= q.from && s < q.to) || sections[sections.length - 1] || { id: 'varna' }).id;
  const secRange = (id) => { const q = sections.find((x) => x.id === id); return q ? [q.from, q.to] : null; };
  /** walking surface at arc length s (v2: real floors + stairs; old course: the constant deck) */
  const dyFn = typeof course.deckAt === 'function' ? course.deckAt : null;
  const dy = (s) => (dyFn ? dyFn(Math.max(0, Math.min(L, s))) : run.deckY);

  scene.fog = new THREE.FogExp2(FOG_COL, FOG_D);
  scene.background = new THREE.Color(FOG_COL);
  let envMap = null;
  try { envMap = buildEnvMap(renderer); } catch (e) { envMap = null; }

  // ------------------------------------------------------------------ the real buildings in local coordinates
  const lx = (x) => x - L4_ORIGIN.x, lz = (z) => z - L4_ORIGIN.z;
  const bb = (b) => ({ x0: lx(b.x0), x1: lx(b.x1), z0: lz(b.z0), z1: lz(b.z1) });
  const VA = bb(BUILDINGS.varna), TW = bb(BUILDINGS.clockTower), CS = bb(BUILDINGS.cellarStair);
  const CT = bb(BUILDINGS.cellarTower), CL = bb(BUILDINGS.cellars), BO = bb(BUILDINGS.bottling);
  const VF = BUILDINGS.varna.floors, KR = BUILDINGS.varna.kettleRadius || 2.1;
  const KET = BUILDINGS.varna.kettles.map(toL4);
  const BRb = BUILDINGS.bridge;
  const BR = { x: lx(BRb.x), hw: BRb.halfWidth, z0: lz(BRb.z0), z1: lz(BRb.z1), floor: BRb.floor, spring: BRb.ceiling - 0.5, crown: BRb.ceiling + 0.5 };
  const CF = BUILDINGS.cellars.floors;
  const COOL_FLOOR = CF.coolingFloor - 0.6;    // wet tiled floor of the cooling attic; the grating catwalks stand 0.6 above it
  const LAN = bb(BUILDINGS.cellars.lantern);
  const RIDGE_X = (LAN.x0 + LAN.x1) / 2, ROOF_RISE = 4.2, EAVES = CF.eaves;
  const roofY = (x) => EAVES + ROOF_RISE * (1 - Math.abs(x - RIDGE_X) / ((CL.x1 - CL.x0) / 2)); // outer roof line
  // interior: the catwalks run 4.4 m from the side walls, where the outer roof (eaves 15.0) leaves < 2.7 m over the
  // deck — the attic gets a knee wall (Kniestock) of 3.3 m over the catwalk level, the roof rises from there
  const EIN = Math.max(EAVES, CF.coolingFloor + 3.3), RIDGE_IN = roofY(RIDGE_X) - 0.3;
  const roofIn = (x) => EIN + (RIDGE_IN - EIN) * (1 - Math.min(1, Math.abs(x - RIDGE_X) / ((CL.x1 - CL.x0) / 2)));
  const TRACKS = BUILDINGS.yardTracks.z.map(lz);
  // interiors (inner wall faces); shared walls are centred on the shared line
  const RG = {
    tower: { x0: TW.x0 + WT, x1: TW.x1 - WT, z0: TW.z0 + WT, z1: TW.z1 - WT },
    varna: { x0: VA.x0 + WT, x1: VA.x1 - WT, z0: VA.z0 + WT, z1: VA.z1 - WT },
    bridge: { x0: BR.x - BR.hw, x1: BR.x + BR.hw, z0: BR.z0, z1: BR.z1 },
    stair: { x0: CS.x0 + WT, x1: CS.x1 - WT, z0: CS.z0 + WT, z1: CS.z1 - WT / 2 },
    ctower: { x0: CT.x0 + WT, x1: CT.x1 - WT, z0: CT.z0 + WT / 2, z1: CT.z1 - WT },
    cool: { x0: CL.x0 + WT, x1: CL.x1 - WT, z0: CL.z0 + WT, z1: CL.z1 - WT },
  };
  const inR = (r, x, z, pad = 0) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
  function regionAt(x, z) {
    for (const k of ['tower', 'varna', 'bridge', 'stair', 'ctower', 'cool']) if (inR(RG[k], x, z)) return k;
    return null;
  }
  const VCEIL = VF.p3 - 0.12;                 // underside of the 3rd-floor slab (Prussian vaults between the girders)
  const TCEIL = VF.p4 - 0.3;                  // clock-tower shaft ceiling
  const CTCEIL = BUILDINGS.cellarTower.floors[3] - 0.3;
  const vault = (lat) => BR.spring + (BR.crown - BR.spring) * Math.sqrt(Math.max(0, 1 - (lat / BR.hw) ** 2));
  /** ceiling (underside) above a point */
  function ceilAt(x, z) {
    switch (regionAt(x, z)) {
      case 'tower': return TCEIL;
      case 'varna': return VCEIL;
      case 'bridge': return vault(x - BR.x);
      case 'stair': case 'ctower': return CTCEIL;
      case 'cool': return roofIn(x);
      default: return CTCEIL;
    }
  }
  /** floor below the catwalk */
  function belowAt(x, z) {
    switch (regionAt(x, z)) {
      case 'tower': return VF.p2;
      case 'varna': return VF.prizemi;
      case 'bridge': return 0;
      case 'stair': return 6.0;
      case 'ctower': return BUILDINGS.cellarTower.floors[1];
      case 'cool': return COOL_FLOOR;
      default: return 8.0;
    }
  }

  // ------------------------------------------------------------------ course frame helpers
  function fr(s) {
    const c = Math.max(0, Math.min(L, s)), p = path.at(c), e = s - c;
    return { x: p.x + p.tx * e, z: p.z + p.tz * e, tx: p.tx, tz: p.tz, rx: -p.tz, rz: p.tx };
  }
  /** local point at arc length s, lateral lat (m, + = right), height y */
  const W = (s, lat = 0, y = 0) => { const f = fr(s); return [f.x + f.rx * lat, y, f.z + f.rz * lat]; };
  function frameAt(s, lat = 0) {
    const f = fr(s), ox = f.x + f.rx * lat, oz = f.z + f.rz * lat, yaw = Math.atan2(f.tx, f.tz);
    return {
      s, yaw, f,
      p: (a, l, y) => [ox + f.tx * a + f.rx * l, y, oz + f.tz * a + f.rz * l],
      o(a, l, y, extra = {}) { const q = this.p(a, l, y); return { ...extra, order: 'YXZ', x: q[0], y: q[1], z: q[2], ry: yaw + (extra.ry || 0) }; },
    };
  }
  // corners of the course polyline (course.points if given, else the real route; must match the path)
  const near0 = (pts) => pts && pts.length > 1 && path.project(pts[0][0], pts[0][1]).d < 0.6 && path.project(pts[pts.length - 1][0], pts[pts.length - 1][1]).d < 0.6;
  const PTS = [course.points, LEVEL4_ROUTE.points.map(toL4), C4.COURSE?.points].find(near0) || LEVEL4_ROUTE.points.map(toL4);
  const P = PTS.map(([x, z]) => ({ x, z }));
  const legs = [];
  for (let i = 0; i < P.length - 1; i++) {
    const dx = P[i + 1].x - P[i].x, dz = P[i + 1].z - P[i].z, len = Math.hypot(dx, dz);
    legs.push({ a: P[i], b: P[i + 1], dx: dx / len, dz: dz / len, rx: -dz / len, rz: dx / len, len });
  }
  const corners = [];
  const radius = course.radius ?? (PTS === C4.COURSE?.points ? C4.COURSE.radius : LEVEL4_ROUTE.radius) ?? 2.6;
  for (let i = 1; i < P.length - 1; i++) {
    const a = legs[i - 1], b = legs[i];
    const cross = a.dx * b.dz - a.dz * b.dx, ang = Math.acos(Math.max(-1, Math.min(1, a.dx * b.dx + a.dz * b.dz)));
    const sc = path.project(P[i].x, P[i].z).s, half = radius * ang / 2 + 0.05;
    corners.push({ p: P[i], a, b, inner: Math.sign(cross), sc, s0: sc - half, s1: sc + half, k: 1 + a.rx * b.rx + a.rz * b.rz });
  }
  const inCorner = (s, pad = 0) => corners.some((c) => s > c.s0 - pad && s < c.s1 + pad);
  const miter = (c, lat) => [c.p.x + lat * (c.a.rx + c.b.rx) / c.k, c.p.z + lat * (c.a.rz + c.b.rz) / c.k];

  // stairs: from the course (v2) or detected from deckAt
  let stairs = Array.isArray(course.stairs) ? course.stairs.map((q) => ({ ...q })) : null;
  if (!stairs) {
    stairs = [];
    if (dyFn) {
      let cur = null;
      for (let s = 0; s < L; s += 0.25) {
        const sl = Math.abs(dy(s + 0.25) - dy(s)) > 1e-4;
        if (sl && !cur) cur = { s0: s }; else if (!sl && cur) { cur.s1 = s; stairs.push(cur); cur = null; }
      }
      if (cur) { cur.s1 = L; stairs.push(cur); }
      for (const q of stairs) { q.y0 = dy(q.s0); q.y1 = dy(q.s1); }
    }
  }
  stairs = stairs.filter((q) => q.s1 > q.s0 + 0.5 && Math.abs(q.y1 - q.y0) > 0.3);
  const onStairs = (s, pad = 0) => stairs.some((q) => s > q.s0 - pad && s < q.s1 + pad);
  const kinks = [...stairs.flatMap((q) => [q.s0, q.s1])];

  /** sample list a..b: coarse on straights, fine in fillets, split at chunk boundaries + stair ends */
  function samples(a, b, step = 2) {
    const out = [a]; let s = a;
    while (s < b - 1e-6) {
      let n = s + (inCorner(s + 0.01, 0.2) ? 0.3 : onStairs(s + 0.01) ? Math.min(step, 1) : step);
      for (const c of corners) if (s < c.s0 - 0.2 && n > c.s0 - 0.2) n = c.s0 - 0.2;
      for (const k of kinks) if (s < k - 1e-4 && n > k) n = k;
      const nb = (Math.floor(s / CH + 1e-6) + 1) * CH; if (n > nb) n = nb;
      if (n > b) n = b;
      out.push(n); s = n;
    }
    return out;
  }

  // ------------------------------------------------------------------ materials
  T.copper.color.repeat.set(4, 2); T.copper.rough.repeat.set(4, 2);
  const M = {
    props: new THREE.MeshLambertMaterial({ vertexColors: true }),
    walls: new THREE.MeshLambertMaterial({ map: T.wallTall, emissiveMap: T.wallTall, emissive: 0x2e2820 }),
    ceil: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1e1a14 }),
    floor: new THREE.MeshLambertMaterial({ map: T.floor, vertexColors: true, emissiveMap: T.floor, emissive: 0x14100c }),
    deck: new THREE.MeshLambertMaterial({ map: T.grating, vertexColors: true, side: THREE.DoubleSide }),
    brick: new THREE.MeshLambertMaterial({ map: T.brick, emissiveMap: T.brick, emissive: 0x241a14 }),
    glass: new THREE.MeshBasicMaterial({ map: T.glass, color: new THREE.Color(0.78, 0.86, 1.0) }),
    // see-through dirty glass: multiplies what is behind it (dust tint + glazing bars), no sorting issues
    glassT: new THREE.MeshBasicMaterial({ map: T.glass, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, fog: false }),
    copper: new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.copper.color, metalness: 1, roughness: 0.4, roughnessMap: T.copper.rough, envMap, envMapIntensity: 1.35 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.36, envMap, envMapIntensity: 1.2 }),
    atlas: new THREE.MeshLambertMaterial({ map: T.decals4, vertexColors: true, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2, emissiveMap: T.decals4, emissive: 0x3e3830 }),
    stain: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.42, 0.34), transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    voids: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.18, 0.16), transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide }),
    glow: glowPatch(new THREE.MeshBasicMaterial({ map: T.pool, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })),
    shaft: glowPatch(new THREE.MeshBasicMaterial({ map: T.shaft, color: new THREE.Color(0.5, 0.6, 0.74), transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 6),
    bulbs: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.3, 2.4) }),
    fire: new THREE.MeshBasicMaterial({ map: T.fire, color: new THREE.Color(2, 2, 2) }),
    // dull wort: Lambert + a weak env mix (a glossy Standard surface at grazing angles mirrored the env lamps → white sheet)
    wort: new THREE.MeshLambertMaterial({ color: 0x3c2410, emissive: 0x140a04, envMap, combine: THREE.MixOperation, reflectivity: 0.12 }),
    // outside (seen through the bridge windows): unlit, haze baked into the vertex colours, no interior fog
    out: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
    dial: new THREE.MeshBasicMaterial({ map: T.decals4, color: new THREE.Color(1.25, 1.2, 1.05), alphaTest: 0.35, side: THREE.DoubleSide, fog: false }),
  };
  const DEFS = {
    props: {}, ceil: {}, walls: { color: false, uv: true }, floor: { uv: true }, deck: { uv: true },
    brick: { color: false, uv: true }, glass: { color: false, uv: true }, glassT: { color: false, uv: true }, copper: { color: false, uv: true },
    metal: {}, atlas: { uv: true }, voids: { color: false }, stain: { color: false }, glow: { uv: true }, shaft: { color: false, uv: true }, bulbs: { color: false },
    fire: { color: false, uv: true }, wort: { color: false }, out: {}, dial: { color: false, uv: true },
  };
  const ORDER = { glow: 2, shaft: 3, voids: 1, stain: 1, glassT: 2 };
  const chunks = new Map();
  let curS = 0, curKey = null;
  let lockKey = null;
  const at = (s) => { curS = s; curKey = null; };
  function B(name) {
    const k = lockKey ?? curKey ?? Math.max(0, Math.floor(curS / CH));
    let c = chunks.get(k); if (!c) chunks.set(k, c = {});
    return c[name] || (c[name] = new Batch(DEFS[name]));
  }
  class Router extends Batch { constructor(name) { super(DEFS[name]); this.name = name; } add(g, c, o) { return B(this.name).add(g, c, o); } }
  const RT = {};
  for (const k of Object.keys(DEFS)) RT[k] = new Router(k);
  const { props, ceil, walls, floor, deck, brick, glass, copper, metal, atlas, stain, voids, bulbs, wort } = RT;
  const glows = RT.glow, shafts = RT.shaft, fireB = RT.fire;
  const sOf = (x, z) => path.project(x, z).s;
  const atXZ = (x, z) => at(sOf(x, z));

  function decal(rect, w, h, pos, q, tint = 0xffffff, router = atlas) {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
    router.add(g, tint, { x: pos[0], y: pos[1], z: pos[2], q });
  }
  const qYaw = (yaw, pitch = 0) => new THREE.Quaternion().setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
  function pool(x, y, z, size, col, q = null) {
    glows.add(new THREE.PlaneGeometry(size, size), new THREE.Color(...col), q ? { x, y, z, q } : { x, y, z, rx: -Math.PI / 2 });
  }

  const dyn = [];          // rotating parts {mesh, w}
  const emitters = [];     // ambient steam sources {x, y, z, rate, r, kind}
  const fireMeshes = [];
  // ------------------------------------------------------------------ lamps
  const halos = [];     // {x, y, z, size, col}
  const catLamps = [];  // {s, x, y, z}
  function pendant(x, y, z, cordTop, { shade = ENAMEL_G, big = 1, poolY = null, poolSize = 5, poolCol = [0.36, 0.22, 0.09] } = {}) {
    const k = big;
    if (cordTop > y + 0.3) props.link([x, y + 0.2 * k, z], [x, cordTop, z], 0.012, 0.012, 0x1a1a1a, 4);
    props.cyl(0.05 * k, 0.05 * k, 0.12 * k, 6, IRON, x, y + 0.2 * k, z);
    props.cyl(0.07 * k, 0.38 * k, 0.26 * k, 12, shade, x, y + 0.05 * k, z, { open: true });
    props.add(new THREE.CircleGeometry(0.075 * k, 8), ENAMEL_W, { x, y: y + 0.18 * k, z, rx: Math.PI / 2 });
    props.cyl(0.37 * k, 0.37 * k, 0.02, 12, ENAMEL_W, x, y - 0.08 * k, z, { open: true });
    bulbs.sph(0.075 * k, 8, 5, 0, x, y - 0.05 * k, z);
    halos.push({ x, y: y - 0.07 * k, z, size: 1.25 * k, col: [0.62, 0.4, 0.18] });
    if (poolY !== null) pool(x, poolY, z, poolSize, poolCol);
  }
  function wallLamp(x, y, z, nx, nz, floorY) {
    const bx = x + nx * 0.7, bz = z + nz * 0.7;
    props.link([x + nx * 0.05, y + 0.5, z + nz * 0.05], [bx, y + 0.5, bz], 0.02, 0.02, IRON, 5);
    props.link([bx, y + 0.5, bz], [bx, y + 0.22, bz], 0.02, 0.02, IRON, 5);
    props.box(0.12, 0.2, 0.04, IRON, x + nx * 0.03, y + 0.5, z + nz * 0.03, { ry: Math.atan2(nx, nz) });
    props.cyl(0.05, 0.26, 0.2, 10, ENAMEL_G, bx, y + 0.12, bz, { open: true });
    bulbs.sph(0.06, 6, 4, 0, bx, y + 0.02, bz);
    halos.push({ x: bx, y, z: bz, size: 1.0, col: [0.5, 0.32, 0.15] });
    pool(x + nx * 0.04, y - 0.3, z + nz * 0.04, 3.2, [0.2, 0.12, 0.05], qYaw(Math.atan2(nx, nz)));
    if (floorY != null) pool(bx + nx * 1.5, floorY + 0.02, bz + nz * 1.5, 7, [0.16, 0.1, 0.04]);
  }

  // ------------------------------------------------------------------ walls with real openings
  const LIGHT = new THREE.Vector3(0.52, -0.6, 0.6).normalize(); // daylight travel direction (from the north-west sky)
  const uvWall = (g, mat, base) => {
    const p = g.attributes.position, uv = g.attributes.uv || new THREE.BufferAttribute(new Float32Array(p.count * 2), 2);
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) - p.getZ(i), y = p.getY(i);
      if (mat === 'walls') uv.setXY(i, u / WALLT.width, Math.min(Math.max(y - base, 0.01), WALLT.height - 0.02) / WALLT.height);
      else uv.setXY(i, u / 1.2, (y - base) / 1.2);
    }
    g.setAttribute('uv', uv);
    return g;
  };
  /**
   * Wall face from A to B ([x, z]) with inward normal n, y0..y1. Holes in face coords (u from A, v = height):
   * { u0, u1, v0, v1, rise?, glass: 'win'|'clear'|'louvre'|null (door), shaft? }. Reveals are `depth` deep.
   */
  function wall(A, B, n, y0, y1, holes = [], o = {}) {
    const { mat = 'walls', base = 0, depth = WT, sunny = false, sill = true } = o;
    let ax = A[0], az = A[1];
    const bx = B[0], bz = B[1];
    const Lw = Math.hypot(bx - ax, bz - az);
    if (Lw < 0.02 || y1 - y0 < 0.02) return;
    // clamp openings into the face (a hole touching the outline breaks the triangulation)
    holes = holes.map((h) => ({ ...h, u0: Math.max(0.04, h.u0), u1: Math.min(Lw - 0.04, h.u1), v0: Math.max(y0 + 0.02, h.v0), v1: Math.min(y1 - 0.03, h.v1) }))
      .filter((h) => h.u1 - h.u0 > 0.1 && h.v1 - h.v0 > 0.1 && (!h.rise || h.v1 - h.rise > h.v0 + 0.05));
    let ux = (bx - ax) / Lw, uz = (bz - az) / Lw, hs = holes;
    if (-uz * n[0] + ux * n[1] < 0) { ax = bx; az = bz; ux = -ux; uz = -uz; hs = holes.map((h) => ({ ...h, u0: Lw - h.u1, u1: Lw - h.u0 })); }
    const X = new THREE.Vector3(ux, 0, uz), N = new THREE.Vector3(n[0], 0, n[1]);
    const m4 = new THREE.Matrix4().makeBasis(X, _Y, N).setPosition(ax, 0, az);
    const toW = (u, y, d = 0) => new THREE.Vector3(u, y, d).applyMatrix4(m4);
    if (!o.keepChunk) atXZ(ax + ux * Lw / 2 + n[0] * 1.5, az + uz * Lw / 2 + n[1] * 1.5);
    const r = RT[mat];
    const shape = new THREE.Shape();
    shape.moveTo(0, y0); shape.lineTo(Lw, y0); shape.lineTo(Lw, y1); shape.lineTo(0, y1); shape.lineTo(0, y0);
    for (const h of hs) {
      const p = new THREE.Path();
      if (h.rise) windowPath(p, (h.u0 + h.u1) / 2, h.u1 - h.u0, h.v0, h.v1 - h.rise, h.rise);
      else { p.moveTo(h.u0, h.v0); p.lineTo(h.u1, h.v0); p.lineTo(h.u1, h.v1); p.lineTo(h.u0, h.v1); p.lineTo(h.u0, h.v0); }
      shape.holes.push(p);
    }
    r.add(uvWall(new THREE.ShapeGeometry(shape, 6), mat, base), 0, { m: m4 });
    for (const h of hs) {
      const D = depth, x0 = h.u0, x1 = h.u1, cx = (x0 + x1) / 2, w = x1 - x0, top = h.rise ? h.v1 - h.rise : h.v1;
      const quad = (a, b, c, d, toward) => r.add(uvWall(soup([...a, ...b, ...c, ...a, ...c, ...d], null, null, toward), mat, base), 0, { m: m4 });
      quad([x0, h.v0, 0], [x0, top, 0], [x0, top, -D], [x0, h.v0, -D], [1, 0, 0]);
      quad([x1, h.v0, 0], [x1, top, 0], [x1, top, -D], [x1, h.v0, -D], [-1, 0, 0]);
      if (!h.glass) quad([x0, h.v0, 0], [x1, h.v0, 0], [x1, h.v0, -D], [x0, h.v0, -D], [0, 1, 0]);
      if (h.rise) {
        const arc = archPoints(cx, w, top, h.rise, 8);
        for (let i = 0; i < arc.length - 1; i++) {
          const [axx, ayy] = arc[i], [bxx, byy] = arc[i + 1];
          quad([axx, ayy, 0], [bxx, byy, 0], [bxx, byy, -D], [axx, ayy, -D], [cx - (axx + bxx) / 2, top - (ayy + byy) / 2 - 1, 0]);
        }
      } else quad([x0, top, 0], [x1, top, 0], [x1, top, -D], [x0, top, -D], [0, -1, 0]);
      if (!h.glass) continue;
      if (sill) props.add(new THREE.BoxGeometry(w + 0.2, 0.08, D + 0.16), STONE, { m: m4.clone().multiply(new THREE.Matrix4().makeTranslation(cx, h.v0 - 0.04, -D / 2 + 0.08)) });
      if (h.glass === 'louvre') {
        for (let y = h.v0 + 0.25; y < top - 0.05; y += 0.34) props.add(new THREE.BoxGeometry(w - 0.04, 0.035, 0.24), WOOD_DARK, { m: m4.clone().multiply(new THREE.Matrix4().makeTranslation(cx, y, -D * 0.5).multiply(new THREE.Matrix4().makeRotationX(-0.65))) });
        continue;
      }
      const gs = new THREE.Shape();
      if (h.rise) windowPath(gs, cx, w, h.v0, top, h.rise);
      else { gs.moveTo(x0, h.v0); gs.lineTo(x1, h.v0); gs.lineTo(x1, h.v1); gs.lineTo(x0, h.v1); gs.lineTo(x0, h.v0); }
      const gg = new THREE.ShapeGeometry(gs, 8), guv = gg.attributes.uv, gp = gg.attributes.position;
      for (let i = 0; i < gp.count; i++) guv.setXY(i, (gp.getX(i) - x0) / w, (gp.getY(i) - h.v0) / (h.v1 - h.v0));
      gg.translate(0, 0, -D + 0.08);
      RT[h.glass === 'clear' ? 'glassT' : 'glass'].add(gg, 0, { m: m4 });
      if (h.v1 - h.v0 > 1.5) props.add(new THREE.BoxGeometry(w, 0.06, 0.06), IRON, { m: m4.clone().multiply(new THREE.Matrix4().makeTranslation(cx, top - 0.02, -D + 0.12)) });
      if (sunny && h.shaft) {
        const mid = (h.v0 + top) / 2;
        const pa = toW(x0 + 0.1, mid, -0.1), pb = toW(x1 - 0.1, mid, -0.1);
        const len = Math.min(18, (mid - (o.floorY ?? 0)) / -LIGHT.y);
        const pc = pb.clone().addScaledVector(LIGHT, len), pd = pa.clone().addScaledVector(LIGHT, len);
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.Float32BufferAttribute([...pa.toArray(), ...pb.toArray(), ...pc.toArray(), ...pa.toArray(), ...pc.toArray(), ...pd.toArray()], 3));
        sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
        sg.computeVertexNormals();
        shafts.add(sg, 0, {});
        if (o.floorY != null) {
          const c4 = [[x0, h.v0], [x1, h.v0], [x1, top], [x0, top]].map(([u, y]) => { const v = toW(u, y, -0.2); return v.addScaledVector(LIGHT, (v.y - o.floorY) / -LIGHT.y).setY(o.floorY + 0.02); });
          glows.add(soup([...c4[0].toArray(), ...c4[1].toArray(), ...c4[2].toArray(), ...c4[0].toArray(), ...c4[2].toArray(), ...c4[3].toArray()], [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], null, [0, 1, 0]), new THREE.Color(0.12, 0.15, 0.2));
        }
      }
    }
  }
  /** facade along A→B split into bays; storeys: [{ v0, v1, rise, w, pair, glass, shaft }] */
  function facade(A, B, n, y0, y1, storeys, o = {}) {
    const Lw = Math.hypot(B[0] - A[0], B[1] - A[1]), nb = Math.max(1, Math.round(Lw / (o.bay || 3.9)));
    const ux = (B[0] - A[0]) / Lw, uz = (B[1] - A[1]) / Lw, bw = Lw / nb;
    for (let k = 0; k < nb; k++) {
      const u0 = k * bw, u1 = (k + 1) * bw, c = bw / 2, holes = [];
      const skip = o.skip && o.skip(k, nb);
      if (!skip) for (const st of storeys) {
        const offs = st.pair ? [-(st.w / 2 + (st.gap ?? 0.42) / 2), st.w / 2 + (st.gap ?? 0.42) / 2] : [0];
        for (const off of offs) holes.push({ u0: c + off - st.w / 2, u1: c + off + st.w / 2, v0: st.v0, v1: st.v1, rise: st.rise, glass: st.glass ?? 'win', shaft: st.shaft });
      }
      for (const d of o.doors || []) if (d.u1 > u0 && d.u0 < u1) holes.push({ ...d, u0: d.u0 - u0, u1: d.u1 - u0 });
      wall([A[0] + ux * u0, A[1] + uz * u0], [A[0] + ux * u1, A[1] + uz * u1], n, y0, y1, holes, o);
      // pilaster strip between bays
      if (k > 0 && o.pilaster !== false) {
        const px = A[0] + ux * u0, pz = A[1] + uz * u0;
        props.box(0.5, y1 - y0, 0.1, o.pilasterCol ?? 0xb8ad96, px + n[0] * 0.05, (y0 + y1) / 2, pz + n[1] * 0.05, { ry: Math.atan2(ux, uz) + Math.PI / 2 });
      }
      if (o.lamp && k % 2 === 1) {
        const mx = A[0] + ux * u0, mz = A[1] + uz * u0;
        wallLamp(mx + n[0] * 0.1, o.lamp, mz + n[1] * 0.1, n[0], n[1], o.floorY);
      }
    }
  }
  /** horizontal plane x0..x1 × z0..z1 at y, split in ≤ 7 m tiles for chunking; mat 'floor' (tiles) or 'ceil' */
  function plane(x0, x1, z0, z1, y, mat, { down = false, shade = null, uvs = 1.6, col = [1, 1, 1] } = {}) {
    const nx = Math.max(1, Math.ceil((x1 - x0) / 7)), nz = Math.max(1, Math.ceil((z1 - z0) / 7));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const a0 = x0 + (x1 - x0) * i / nx, a1 = x0 + (x1 - x0) * (i + 1) / nx, b0 = z0 + (z1 - z0) * j / nz, b1 = z0 + (z1 - z0) * (j + 1) / nz;
      atXZ((a0 + a1) / 2, (b0 + b1) / 2);
      const sa = Math.max(1, Math.round((a1 - a0) / 1.5)), sb = Math.max(1, Math.round((b1 - b0) / 1.5));
      const pos = [], uv = [], cc = [];
      for (let p = 0; p < sa; p++) for (let q = 0; q < sb; q++) {
        const u0 = a0 + (a1 - a0) * p / sa, u1 = a0 + (a1 - a0) * (p + 1) / sa, v0 = b0 + (b1 - b0) * q / sb, v1 = b0 + (b1 - b0) * (q + 1) / sb;
        for (const [x, z] of [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]]) {
          pos.push(x, y, z); uv.push(x / uvs, -z / uvs);
          const k = shade ? shade(x, z) : 1; cc.push(k * col[0], k * col[1], k * col[2]);
        }
      }
      RT[mat].add(soup(pos, mat === 'ceil' ? null : uv, cc, [0, down ? -1 : 1, 0]), 0, { keepColor: true });
    }
  }
  const noise2 = (x, z) => Math.sin(x * 0.43 + 1.3) * Math.sin(z * 0.61 - 0.4) + 0.6 * Math.sin(x * 1.17 + z * 0.83 + 2.1) * Math.sin(z * 1.01 - x * 0.37);
  /** box from x0..x1, y0..y1, z0..z1 into a router with colour */
  const slab = (r, x0, x1, y0, y1, z0, z1, c, o = {}) => r.box(x1 - x0, y1 - y0, z1 - z0, c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);

  // each building shell is ONE culling group (its walls project far along the winding path; per-s chunks hid them)
  lockKey = 'varna';
  // ================================================================== 1) VARNA — 2nd floor gallery over the kettle hall
  const VR = RG.varna, TR = RG.tower;
  {
    const yF = VF.prizemi;
    const vbase = yF;
    // storeys of the 1911 elevation: přízemí (rusticated arches), 1st + 2nd floor paired tall windows, gallery-level shafts
    const ST = [
      { v0: yF + 0.9, v1: VF.p1 - 0.5, rise: 0.45, w: 1.5, pair: false },
      { v0: VF.p1 + 0.65, v1: VF.p2 - 0.55, w: 0.9, pair: true, rise: 0.18 },
      { v0: VF.p2 + 0.8, v1: VCEIL - 0.2, w: 0.9, pair: true, rise: 0.18, shaft: true },
    ];
    const fo = { base: vbase, floorY: yF, lamp: VF.p1 + 1.7 };
    const startS = 0, startP = W(startS - 1.0, 0, 0);
    // north (z0), east (x1), south (z1, east of the tower), west (x0, north of the tower)
    facade([VR.x0, VR.z0], [VR.x1, VR.z0], [0, 1], yF, VCEIL + 0.05, ST, { ...fo, sunny: true });
    facade([VR.x1, VR.z0], [VR.x1, VR.z1], [-1, 0], yF, VCEIL + 0.05, ST, {
      ...fo, doors: [{ u0: (startP[2] - VR.z0) - 0.9, u1: (startP[2] - VR.z0) + 0.9, v0: dy(0), v1: dy(0) + 2.35, glass: null }],
    });
    facade([TW.x1, VR.z1], [VR.x1, VR.z1], [0, -1], yF, VCEIL + 0.05, ST, fo);
    facade([VR.x0, VR.z0], [VR.x0, TW.z0], [1, 0], yF, VCEIL + 0.05, ST, { ...fo, sunny: true });
    // the clock tower's walls inside the Varna (its north + east faces); the route enters the tower through the east wall
    const tDoorZ = [], tDoorY = [];
    {
      // where the course crosses x = TW.x1 inside the Varna
      for (let s = 0; s < L; s += 0.25) { const p = fr(s); if (Math.abs(p.x - TW.x1) < 0.2 && p.z > TW.z0 && p.z < VR.z1) { tDoorZ.push(p.z); tDoorY.push(dy(s)); break; } }
    }
    const tdz = tDoorZ[0] ?? (TW.z0 + TW.z1) / 2, tdy = tDoorY[0] ?? VF.p2 + 0.2;
    const tDoor = { u0: (tdz - TW.z0) - 1.55, u1: (tdz - TW.z0) + 1.55, v0: tdy - 0.25, v1: Math.min(VCEIL - 0.05, tdy + 2.55), glass: null };
    wall([TW.x0, TW.z0], [TW.x1, TW.z0], [0, -1], yF, VCEIL + 0.05, [], { base: vbase });
    wall([TW.x1, TW.z0], [TW.x1, VR.z1], [1, 0], yF, VCEIL + 0.05, [tDoor], { base: vbase });

    // floor of the kettle hall (tiles) + ceiling (3rd-floor slab) with Prussian-vault bays between riveted girders
    const notTower = (x0, x1, z0, z1, fn) => {
      fn(x0, x1, z0, TR.z0 - WT); // north part
      fn(TW.x1, x1, TR.z0 - WT, z1); // south-east part
    };
    notTower(VR.x0, VR.x1, VR.z0, VR.z1, (a, b, c, d) => plane(a, b, c, d, yF, 'floor', { shade: (x, z) => {
      let k = 0.62 + 0.38 * THREE.MathUtils.smoothstep(Math.min(x - VR.x0, VR.x1 - x, z - VR.z0, VR.z1 - z), 0, 3);
      for (const [kx, kz] of KET) k *= 0.55 + 0.45 * THREE.MathUtils.smoothstep(Math.hypot(x - kx, z - kz), KR, KR + 3);
      return k * (0.88 + 0.1 * noise2(x, z));
    } }));
    notTower(VR.x0, VR.x1, VR.z0, VR.z1, (a, b, c, d) => plane(a, b, c, d, VCEIL, 'ceil', { down: true, shade: (x, z) => 0.5 + 0.1 * noise2(x * 0.7, z), col: [0.92, 0.86, 0.76] }));
    // transverse girders (span N–S) every bay + edge beams
    for (let x = VR.x0 + 2.3; x < VR.x1 - 0.5; x += 3.7) {
      const z0 = x < TW.x1 ? VR.z0 : VR.z0, z1 = x < TW.x1 + 0.3 ? TW.z0 : VR.z1;
      atXZ(x, (z0 + z1) / 2);
      ceil.box(0.26, 0.04, z1 - z0, BEAM, x, VCEIL - 0.15, (z0 + z1) / 2);
      ceil.box(0.04, 0.14, z1 - z0, BEAM, x, VCEIL - 0.07, (z0 + z1) / 2);
    }
    // 2nd-floor slab: ledges along the walls + the NE pad (open hall below everything else; the gallery spans it)
    const yS = VF.p2;
    const ledge = (x0, x1, z0, z1) => { atXZ((x0 + x1) / 2, (z0 + z1) / 2); slab(props, x0, x1, yS - 0.3, yS, z0, z1, 0x8c8272); };
    ledge(VR.x0, VR.x1, VR.z0, VR.z0 + 0.3); ledge(VR.x1 - 0.3, VR.x1, VR.z0, VR.z1); ledge(TW.x1, VR.x1, VR.z1 - 0.3, VR.z1); ledge(VR.x0, VR.x0 + 0.3, VR.z0, TW.z0);
    // 1st-floor (4.8) ledge with a railing along the walls: the floor that was cut away for the double-height hall
    const y1 = VF.p1;
    const ledge1 = (ax, az, bx, bz, nx, nz) => {
      const w = 1.0, x0 = Math.min(ax, bx + nx * w), x1 = Math.max(ax, bx + nx * w), z0 = Math.min(az, bz + nz * w), z1 = Math.max(az, bz + nz * w);
      atXZ((x0 + x1) / 2, (z0 + z1) / 2);
      slab(props, Math.min(ax, bx, ax + nx * w), Math.max(ax, bx, ax + nx * w), y1 - 0.3, y1, Math.min(az, bz, az + nz * w), Math.max(az, bz, az + nz * w), 0x8a8070);
      const ra = [ax + nx * w, y1 + 1.0, az + nz * w], rb = [bx + nx * w, y1 + 1.0, bz + nz * w];
      props.link(ra, rb, 0.025, 0.025, IRON2, 5);
      props.link([ra[0], y1 + 0.5, ra[2]], [rb[0], y1 + 0.5, rb[2]], 0.02, 0.02, IRON2, 5);
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.8));
      for (let i = 0; i <= n; i++) { const t = i / n; props.cyl(0.025, 0.025, 1.0, 5, IRON2, ra[0] + (rb[0] - ra[0]) * t, y1 + 0.5, ra[2] + (rb[2] - ra[2]) * t); }
      void x0; void x1; void z0; void z1;
    };
    ledge1(VR.x0, VR.z0, VR.x1, VR.z0, 0, 1);
    ledge1(VR.x1, VR.z0, VR.x1, VR.z1, -1, 0);
    ledge1(VR.x0, VR.z0, VR.x0, TW.z0 - 0.6, 1, 0);

    // wall pipes: lagged steam main under the gallery, bare iron pipe near the ceiling, vertical drops with red wheels
    const pipeRun = (ax, az, bx, bz, nx, nz) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 4));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const p0 = [ax + (bx - ax) * t0 + nx * 0.4, 0, az + (bz - az) * t0 + nz * 0.4], p1 = [ax + (bx - ax) * t1 + nx * 0.4, 0, az + (bz - az) * t1 + nz * 0.4];
        atXZ((p0[0] + p1[0]) / 2, (p0[2] + p1[2]) / 2);
        props.link([p0[0], 7.15, p0[2]], [p1[0], 7.15, p1[2]], 0.15, 0.15, LAGGING, 10);
        props.link([p0[0] - nx * 0.12, VCEIL - 0.45, p0[2] - nz * 0.12], [p1[0] - nx * 0.12, VCEIL - 0.45, p1[2] - nz * 0.12], 0.07, 0.07, IRON, 8);
        props.box(0.06, 0.4, 0.5, IRON, p0[0] - nx * 0.15, 6.95, p0[2] - nz * 0.15, { ry: Math.atan2(nx, nz) });
        props.add(new THREE.CylinderGeometry(0.165, 0.165, 0.07, 10), IRON2, { x: p0[0], y: 7.15, z: p0[2], q: new THREE.Quaternion().setFromUnitVectors(_Y, _v.set(bx - ax, 0, bz - az).normalize()) });
        if (i % 2 === 1) {
          props.link([p0[0] - nx * 0.1, yF, p0[2] - nz * 0.1], [p0[0] - nx * 0.1, 7.15, p0[2] - nz * 0.1], 0.07, 0.07, IRON, 8);
          props.add(new THREE.TorusGeometry(0.16, 0.022, 4, 12), RED_WHEEL, { x: p0[0] + nx * 0.15, y: yF + 1.4, z: p0[2] + nz * 0.15, ry: Math.atan2(nx, nz) });
          props.cyl(0.1, 0.1, 0.2, 8, IRON2, p0[0] - nx * 0.1, yF + 1.4, p0[2] - nz * 0.1);
        }
      }
    };
    pipeRun(VR.x0 + 0.5, VR.z0, VR.x1 - 0.5, VR.z0, 0, 1);
    pipeRun(VR.x1, VR.z0 + 0.5, VR.x1, VR.z1 - 0.5, -1, 0);

    // ------------------------------------------------ the two copper brew kettles (přízemí), hoods through the gallery
    const toward = (kx, kz) => { const c = [(VR.x0 + VR.x1) / 2 - 2, (VR.z0 + VR.z1) / 2]; const d = Math.hypot(c[0] - kx, c[1] - kz) || 1; return [(c[0] - kx) / d, (c[1] - kz) / d]; };
    KET.forEach(([kx, kz], ki) => {
      atXZ(kx, kz);
      const r = KR, k = r / 2.1, y0 = yF;
      const [fx, fz] = toward(kx, kz);
      // octagonal brick plinth with a stone cap
      const oct = (apo, ya, yb, cap) => {
        const rc = apo / Math.cos(Math.PI / 8), fw = 2 * apo * Math.tan(Math.PI / 8), pos = [], uv = [];
        for (let q = 0; q < 8; q++) {
          const t0 = -Math.PI / 8 + (q * Math.PI) / 4, t1 = t0 + Math.PI / 4;
          const ax = kx + Math.sin(t0) * rc, az = kz + Math.cos(t0) * rc, bx = kx + Math.sin(t1) * rc, bz = kz + Math.cos(t1) * rc;
          pos.push(ax, ya, az, bx, ya, bz, bx, yb, bz, ax, ya, az, bx, yb, bz, ax, yb, az);
          uv.push(0, ya, fw / 1.2, ya, fw / 1.2, yb, 0, ya, fw / 1.2, yb, 0, yb);
          if (cap) { pos.push(kx, yb, kz, ax, yb, az, bx, yb, bz); uv.push(0.5, 0.96, 0.2, 0.96, 0.8, 0.96); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.computeVertexNormals(); brick.add(g);
      };
      const PH = 1.0, A = r + 0.4;
      oct(A, y0, y0 + PH, false); oct(A + 0.08, y0 + PH, y0 + PH + 0.09, true);
      // bowl + onion hood (section 1912: tall necks, the vapour stacks go on through the roof)
      const yb = y0 + PH + 0.09;
      const bowl = [[0.78, 0], [0.93, 0.18], [1.0, 0.55], [1.0, 1.45], [1.01, 1.55]];
      const hood = [[1.02, 1.6], [1.06, 2.0], [1.03, 2.45], [0.9, 3.0], [0.68, 3.65], [0.46, 4.35], [0.33, 5.1], [0.26, 5.85], [0.23, 6.5], [0.22, 7.0]];
      const lathe = (pts) => new THREE.LatheGeometry(pts.map(([rr, y]) => new THREE.Vector2(rr * r, yb + y * k)), low ? 28 : 40);
      copper.add(lathe(bowl), 0, { x: kx, z: kz });
      copper.add(lathe(hood), 0, { x: kx, z: kz });
      const top = yb + 7.0 * k, sr = 0.22 * r;
      const rHood = (y) => { const yy = (y - yb) / k; for (let i = 0; i < hood.length - 1; i++) { const [r0, a] = hood[i], [r1, b] = hood[i + 1]; if (yy >= a && yy <= b) return (r0 + (r1 - r0) * ((yy - a) / (b - a))) * r; } return hood[hood.length - 1][0] * r; };
      metal.add(new THREE.TorusGeometry(1.02 * r, 0.05, 6, 40), BRASS, { x: kx, y: yb + 1.58 * k, z: kz, rx: Math.PI / 2 });
      // vapour stack on through the ceiling (and the slab), brass collars
      copper.cyl(sr, sr, VCEIL + 0.3 - top, 18, 0, kx, (VCEIL + 0.3 + top) / 2, kz, { open: true });
      for (const y of [top + 0.06, VCEIL - 0.7]) metal.cyl(sr + 0.05, sr + 0.05, 0.12, 18, BRASS, kx, y, kz);
      metal.cyl(sr + 0.25, sr + 0.25, 0.06, 18, IRON2, kx, VCEIL - 0.02, kz);
      // rivets
      const nRing = low ? 28 : 44;
      for (const y of [2.0, 2.95]) for (let i = 0; i < nRing; i++) { const t = (i / nRing) * Math.PI * 2, yy = yb + y * k, rr = rHood(yy) + 0.006; copper.add(new THREE.OctahedronGeometry(0.03, 0), 0, { x: kx + Math.sin(t) * rr, y: yy, z: kz + Math.cos(t) * rr }); }
      for (let q = 0; q < 8; q++) for (let y = 1.7; y < 4.2; y += 0.22) { const t = (q / 8) * Math.PI * 2 + 0.2, yy = yb + y * k, rr = rHood(yy) + 0.006; copper.add(new THREE.OctahedronGeometry(0.028, 0), 0, { x: kx + Math.sin(t) * rr, y: yy, z: kz + Math.cos(t) * rr }); }
      // hop hatch on the hood (toward the middle gallery), puffing steam
      {
        const th = Math.atan2(fx, fz) + (ki ? -0.6 : 0.6), y = yb + 2.6 * k;
        const rr = rHood(y), slope = (rHood(y + 0.05) - rHood(y - 0.05)) / 0.1, phi = Math.atan(-slope);
        const n = new THREE.Vector3(Math.sin(th) * Math.cos(phi), Math.sin(phi), Math.cos(th) * Math.cos(phi));
        const pos = new THREE.Vector3(kx + Math.sin(th) * rr, y, kz + Math.cos(th) * rr);
        const xA = new THREE.Vector3().crossVectors(_Y, n).normalize(), yA = new THREE.Vector3().crossVectors(n, xA);
        const basis = new THREE.Matrix4().makeBasis(xA, yA, n).setPosition(pos);
        const atB = (x2, y2, z2, extra = null) => { const mm = new THREE.Matrix4().makeTranslation(x2, y2, z2); if (extra) mm.multiply(extra); return { m: basis.clone().multiply(mm) }; };
        const Wd = 0.62, Hd = 0.5;
        for (const [w, h, x2, y2] of [[Wd + 0.1, 0.06, 0, Hd / 2], [Wd + 0.1, 0.06, 0, -Hd / 2], [0.06, Hd, -Wd / 2, 0], [0.06, Hd, Wd / 2, 0]]) metal.add(new THREE.BoxGeometry(w, h, 0.08), BRASS, atB(x2, y2, 0.02));
        props.add(new THREE.PlaneGeometry(Wd - 0.04, Hd - 0.04), 0x0d0b09, atB(0, 0, 0.012));
        copper.add(new THREE.BoxGeometry(Wd, Hd, 0.04), 0, atB(0, Hd / 2 + 0.02, 0.05, new THREE.Matrix4().makeRotationX(-0.95).multiply(new THREE.Matrix4().makeTranslation(0, -Hd / 2, 0.025))));
        emitters.push({ x: pos.x + n.x * 0.2, y: pos.y + 0.1, z: pos.z + n.z * 0.2, rate: 6, r: 0.2, kind: 'hatch', nx: n.x, nz: n.z });
      }
      // safety valve with weighted lever
      {
        const t = Math.atan2(fx, fz) + 2.2, y = yb + 3.3 * k, rr = rHood(y);
        const px = kx + Math.sin(t) * rr, pz = kz + Math.cos(t) * rr;
        metal.cyl(0.08, 0.1, 0.34, 10, BRASS, px, y + 0.17, pz);
        metal.link([px, y + 0.34, pz], [px + Math.sin(t) * 0.7, y + 0.4, pz + Math.cos(t) * 0.7], 0.022, 0.022, BRASS, 6);
        props.sph(0.1, 8, 6, IRON, px + Math.sin(t) * 0.7, y + 0.4, pz + Math.cos(t) * 0.7);
      }
      // firebox on the plinth face toward the hall: iron front, glowing coals, orange floor glow
      {
        const th = Math.round(Math.atan2(fx, fz) / (Math.PI / 4)) * (Math.PI / 4);
        const nx = Math.sin(th), nz = Math.cos(th), fc = [kx + nx * A, kz + nz * A];
        const q = qYaw(th);
        const loc = (a, y, d) => ({ x: fc[0] + Math.cos(th) * a + nx * d, y: y0 + y, z: fc[1] - Math.sin(th) * a + nz * d, q });
        props.add(new THREE.BoxGeometry(1.3, 1.0, 0.3), IRON, loc(0, 0.5, 0.1));
        props.add(new THREE.BoxGeometry(1.4, 0.08, 0.36), IRON2, loc(0, 1.02, 0.12));
        fireB.add(new THREE.PlaneGeometry(0.56, 0.38), 0, loc(0, 0.6, 0.262));
        props.add(new THREE.BoxGeometry(0.6, 0.42, 0.05), IRON2, { ...loc(-0.62, 0.6, 0.45), q: q.clone().multiply(qYaw(-1.6)) });
        pool(fc[0] + nx * 1.4, y0 + 0.02, fc[1] + nz * 1.4, 3.6, [0.42, 0.16, 0.04]);
        fireMeshes.push({ x: fc[0] + nx * 0.6, z: fc[1] + nz * 0.6 });
      }
      // brewer's ring platform at the 1st-floor level around the bowl rim, with a railing
      {
        const yP = VF.p1 - 0.2, r0 = r * 1.08, r1 = r + 0.95;
        props.add(new THREE.RingGeometry(r0, r1, 28, 1), STEEL_D, { x: kx, y: yP, z: kz, rx: -Math.PI / 2 });
        props.add(new THREE.RingGeometry(r0, r1, 28, 1), IRON, { x: kx, y: yP - 0.04, z: kz, rx: Math.PI / 2 });
        props.add(new THREE.TorusGeometry(r1, 0.025, 4, 28), STEEL, { x: kx, y: yP + 1.0, z: kz, rx: Math.PI / 2 });
        for (let i = 0; i < 10; i++) { const t = (i / 10) * Math.PI * 2; props.cyl(0.025, 0.025, 1.0, 5, STEEL, kx + Math.sin(t) * r1, yP + 0.5, kz + Math.cos(t) * r1); }
        for (let i = 0; i < 4; i++) { const t = (i / 4) * Math.PI * 2 + 0.4; props.cyl(0.06, 0.06, yP - y0 - PH, 6, IRON, kx + Math.sin(t) * (r1 - 0.2), (yP + y0 + PH) / 2, kz + Math.cos(t) * (r1 - 0.2)); }
      }
      // copper wort pipe from the bowl base away to the floor manifold
      {
        const t = Math.atan2(-fx, -fz) + 0.5;
        const p0 = [kx + Math.sin(t) * 0.8 * r, y0 + 0.8, kz + Math.cos(t) * 0.8 * r], p1 = [kx + Math.sin(t) * (A + 0.9), y0 + 0.8, kz + Math.cos(t) * (A + 0.9)];
        copper.link(p0, p1, 0.11, 0.11, 0, 12);
        copper.link(p1, [p1[0], y0, p1[2]], 0.11, 0.11, 0, 12);
        props.add(new THREE.TorusGeometry(0.2, 0.025, 4, 12), RED_WHEEL, { x: p1[0], y: y0 + 1.15, z: p1[2], rx: Math.PI / 2 });
        props.cyl(0.03, 0.03, 0.4, 6, IRON, p1[0], y0 + 0.95, p1[2]);
      }
      // a pendant low over the kettle hall (long cord from the ceiling, under the gallery)
      pendant(kx + fx * (r + 1.2), VF.p1 + 0.7, kz + fz * (r + 1.2), VCEIL, { poolY: y0 + 0.02, poolSize: 7, poolCol: [0.22, 0.13, 0.05] });
      emitters.push({ x: kx, y: VCEIL - 0.3, z: kz, rate: 0, r: 0.3, kind: 'none' });
    });

    // lauter tun on the hall floor (north-west), wort receiver (south), floor manifold along the east wall
    {
      const x = VR.x0 + 3.2 + 2.4, z = VR.z0 + 3.5, r = 2.3;
      if (KET.every(([kx, kz]) => Math.hypot(kx - x, kz - z) > KR + r + 0.4)) {
        atXZ(x, z);
        for (let q = 0; q < 8; q++) { const t = (q / 8) * Math.PI * 2; props.cyl(0.12, 0.15, 0.6, 8, COLUMN, x + Math.sin(t) * (r - 0.4), yF + 0.3, z + Math.cos(t) * (r - 0.4)); }
        props.add(new THREE.LatheGeometry([[0.01, 0.6], [r - 0.1, 0.62], [r, 0.75], [r, 2.15]].map(([a, b]) => new THREE.Vector2(a, yF + b)), 36), VAT_GREY, { x, z });
        props.add(new THREE.LatheGeometry([[r - 0.06, 2.15], [r - 0.06, 1.6]].map(([a, b]) => new THREE.Vector2(a, yF + b)), 36), 0x22231f, { x, z });
        copper.add(new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.32, 36, 1, true), 0, { x, y: yF + 2.0, z });
        metal.add(new THREE.TorusGeometry(r + 0.03, 0.05, 5, 36), BRASS, { x, y: yF + 2.17, z, rx: Math.PI / 2 });
        props.add(new THREE.CircleGeometry(r - 0.07, 28), GRAIN, { x, y: yF + 1.75, z, rx: -Math.PI / 2 });
        emitters.push({ x, y: yF + 1.9, z, rate: 1.4, r: r * 0.8, kind: 'surface' });
        for (const off of [-0.3, 0.3]) props.box(2 * r + 0.5, 0.24, 0.1, IRON, x, yF + 3.3, z + off);
        for (const sx of [-1, 1]) props.box(0.14, 1.2, 0.6, IRON, x + sx * (r + 0.2), yF + 2.7, z);
        props.box(0.8, 0.6, 0.8, RED_LEAD, x, yF + 3.7, z);
        const rb = new Batch();
        rb.cyl(0.12, 0.12, 1.7, 10, STEEL, 0, yF + 2.55, 0);
        for (const sx of [-1, 1]) { rb.box(r * 0.95, 0.14, 0.16, STEEL, sx * r * 0.48, yF + 2.0, 0); for (let i = 1; i <= 6; i++) rb.box(0.03, 0.4, 0.12, STEEL_D, sx * i * r * 0.14, yF + 1.8, 0, { ry: 0.6 }); }
        const m = rb.mesh(M.props); m.position.set(x, 0, z); m.userData.dynamic = true; m.userData.chunkS = sOf(x, z); root.add(m);
        dyn.push({ mesh: m, w: 0.22 });
        for (let i = 0; i < 7; i++) { const t = Math.PI / 2 + (i - 3) * 0.14, p0 = [x + Math.sin(t) * (r + 0.04), yF + 0.9, z + Math.cos(t) * (r + 0.04)], p1 = [x + Math.sin(t) * (r + 0.45), yF + 1.05, z + Math.cos(t) * (r + 0.45)]; metal.link(p0, p1, 0.035, 0.035, BRASS, 6); metal.link(p1, [p1[0], yF + 0.85, p1[2]], 0.03, 0.03, BRASS, 6); }
      }
      // wort receiver: small closed copper vessel with gauge
      const rx = (TW.x1 + KET[1][0] - KR) / 2, rz = VR.z1 - 2.6;
      atXZ(rx, rz);
      for (let q = 0; q < 4; q++) { const t = (q / 4) * Math.PI * 2 + 0.78; props.cyl(0.08, 0.1, 0.9, 6, COLUMN, rx + Math.sin(t) * 0.8, yF + 0.45, rz + Math.cos(t) * 0.8); }
      copper.add(new THREE.CylinderGeometry(1.05, 1.05, 2.0, 28), 0, { x: rx, y: yF + 1.9, z: rz });
      copper.add(new THREE.SphereGeometry(1.05, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, { x: rx, y: yF + 2.9, z: rz, sy: 0.45 });
      metal.add(new THREE.TorusGeometry(1.07, 0.04, 5, 28), BRASS, { x: rx, y: yF + 2.9, z: rz, rx: Math.PI / 2 });
      metal.link([rx, yF + 3.4, rz], [rx, VF.p2 - 0.3, rz], 0.1, 0.1, 0x8a8e8f, 8);
      // floor manifold with red hand wheels along the east wall
      for (let z = VR.z0 + 2; z < VR.z1 - 3; z += 3) {
        const x = VR.x1 - 0.9; atXZ(x, z);
        props.link([x, yF + 1.1, z], [x, yF + 1.1, z + 3], 0.13, 0.13, IRON2, 8);
        props.link([x - 0.45, yF + 0.75, z], [x - 0.45, yF + 0.75, z + 3], 0.09, 0.09, 0x6a5a48, 8);
        props.cyl(0.04, 0.04, 0.5, 6, IRON, x, yF + 1.4, z + 1);
        props.add(new THREE.TorusGeometry(0.2, 0.024, 4, 12), RED_WHEEL, { x, y: yF + 1.65, z: z + 1, rx: Math.PI / 2 });
      }
    }
    // grist hopper (section 1912, "XI"): riveted hopper hung under the ceiling in the north-east of the hall, chute down
    {
      const hx = KET[0][0] + 2.0, hz = KET[0][1] + 1.0, r = 0.8;
      const clear = (s) => Math.hypot(fr(s).x - hx, fr(s).z - hz);
      let dmin = 1e9; for (let s = 0; s < 60; s += 0.5) dmin = Math.min(dmin, clear(s));
      if (dmin > RAIL + r + 0.25 && inR(VR, hx, hz, -0.5)) {
        atXZ(hx, hz);
        props.cyl(r, r, 1.6, 20, VAT_GREEN, hx, VCEIL - 0.9, hz);
        props.cyl(0.14, r, 1.2, 20, VAT_GREEN, hx, VCEIL - 2.3, hz, { open: true });
        for (const y of [VCEIL - 0.2, VCEIL - 1.0, VCEIL - 1.65]) props.add(new THREE.TorusGeometry(r + 0.02, 0.035, 4, 20), IRON2, { x: hx, y, z: hz, rx: Math.PI / 2 });
        riveted(hx, hz, r, VCEIL - 1.65, VCEIL - 0.15, IRON2, 6);
        props.link([hx, VCEIL - 2.9, hz], [KET[0][0] + 0.5, yF + 1.09 + 3.2 * KR / 2.1, KET[0][1] + 0.4], 0.11, 0.11, IRON2, 8);
        props.box(0.5, 0.3, 0.12, RED_LEAD, hx, VCEIL - 2.7, hz + 0.2);
        decal(DECALS4.board, 0.9, 0.45, [hx, VCEIL - 0.95, hz + r + 0.03], qYaw(0), 0xffffff);
      }
    }
  }

  lockKey = 'tower';
  // ================================================================== 2) CLOCK TOWER — cramped shaft, the tower-clock movement
  const clock = {};
  {
    const yT = VF.p2;
    // walls (interior faces): west + south outer (windows), the bridge door in the south wall
    const bridgeDoor = { u0: (BR.x - BR.hw) - TR.x0, u1: (BR.x + BR.hw) - TR.x0, v0: yT, v1: BR.spring + 0.75, rise: 0.45, glass: null };
    const winT = (u) => ({ u0: u - 0.45, u1: u + 0.45, v0: yT + 0.9, v1: TCEIL - 0.6, rise: 0.2, glass: 'win', shaft: true });
    const tdz = (() => { for (let s = 0; s < L; s += 0.25) { const p = fr(s); if (Math.abs(p.x - TW.x1) < 0.2 && p.z > TW.z0 && p.z < VR.z1) return p.z; } return (TR.z0 + TR.z1) / 2; })();
    // the west wall faces the runner along the whole tower leg: a window to the north, the dial straight ahead
    wall([TR.x0, TR.z0], [TR.x0, TR.z1], [1, 0], yT - 0.1, TCEIL + 0.05, [winT(Math.max(0.8, tdz - TR.z0 - 2.6))], { base: yT - 4, sunny: true, floorY: yT });
    wall([TR.x0, TR.z1], [TR.x1, TR.z1], [0, -1], yT - 0.1, TCEIL + 0.05, [bridgeDoor, winT(TR.x1 - TR.x0 - 1.4)], { base: yT - 4 });
    wall([TR.x0, TR.z0], [TR.x1, TR.z0], [0, 1], yT - 0.1, TCEIL + 0.05, [], { base: yT - 4 });
    wall([TR.x1, TR.z0], [TR.x1, TR.z1], [-1, 0], yT - 0.1, TCEIL + 0.05, [{ u0: tdz - TR.z0 - 1.55, u1: tdz - TR.z0 + 1.55, v0: yT, v1: Math.min(VCEIL - 0.05, yT + 2.75), glass: null }], { base: yT - 4 });
    atXZ((TR.x0 + TR.x1) / 2, (TR.z0 + TR.z1) / 2);
    plane(TR.x0, TR.x1, TR.z0, TR.z1, yT, 'floor', { shade: (x, z) => 0.5 + 0.06 * noise2(x, z) });
    plane(TR.x0, TR.x1, TR.z0, TR.z1, TCEIL, 'ceil', { down: true, shade: () => 0.4, col: [0.9, 0.84, 0.74] });
    for (let x = TR.x0 + 1.5; x < TR.x1; x += 2.2) ceil.box(0.22, 0.2, TR.z1 - TR.z0, BEAM, x, TCEIL - 0.1, (TR.z0 + TR.z1) / 2);
    // movement platform in the corner away from the route (iron grating on brackets), the movement in its iron frame
    let best = null;
    for (const [cx, cz] of [[TR.x1 - 1.6, TR.z0 + 1.3], [TR.x0 + 1.6, TR.z0 + 1.3], [TR.x1 - 1.6, TR.z1 - 1.3]]) {
      let d = 1e9; for (let s = 0; s < L; s += 0.5) { const p = fr(s); d = Math.min(d, Math.hypot(p.x - cx, p.z - cz) - 0.0); }
      if (!best || d > best.d) best = { cx, cz, d };
    }
    const { cx, cz } = best;
    const yP = Math.min(TCEIL - 1.9, VF.p3 - 0.7);
    atXZ(cx, cz);
    slab(props, cx - 1.5, cx + 1.5, yP - 0.06, yP, cz - 1.2, cz + 1.2, STEEL_D);
    for (const sx of [-1, 1]) props.box(3.0, 0.18, 0.08, IRON, cx, yP - 0.15, cz + sx * 1.15);
    for (const [ax, az] of [[cx - 1.4, cz - 1.1], [cx + 1.4, cz - 1.1], [cx - 1.4, cz + 1.1], [cx + 1.4, cz + 1.1]]) props.cyl(0.04, 0.04, yP - yT, 6, IRON, ax, (yP + yT) / 2, az);
    // movement: cast-iron flatbed frame, brass wheels, setting dial facing the route, leading-off rod up to the dials
    const mx = cx, mz = cz, my = yP;
    props.box(1.3, 0.08, 0.7, IRON, mx, my + 0.32, mz); props.box(1.3, 0.08, 0.7, IRON, mx, my + 0.92, mz);
    for (const [ax, az] of [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]]) props.box(0.07, 0.68, 0.07, IRON, mx + ax, my + 0.62, mz + az);
    for (const [ax, rr, th] of [[-0.35, 0.28, 0.05], [0.05, 0.22, 0.05], [0.4, 0.3, 0.05], [-0.1, 0.14, 0.04]]) {
      metal.add(new THREE.CylinderGeometry(rr, rr, th, 20), BRASS, { x: mx + ax, y: my + 0.62, z: mz, rx: Math.PI / 2 });
      metal.add(new THREE.CylinderGeometry(0.025, 0.025, 0.72, 6), STEEL, { x: mx + ax, y: my + 0.62, z: mz, rx: Math.PI / 2 });
    }
    for (const sx of [-1, 1]) props.add(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 14), WOOD_DARK, { x: mx + sx * 0.4, y: my + 0.15, z: mz, rz: Math.PI / 2 }); // winding barrels
    // leading-off rods: up to the high dials, and along the north wall to the dial on the west face
    props.link([mx, my + 0.96, mz], [mx, TCEIL + 0.2, mz], 0.022, 0.022, STEEL, 6);
    metal.add(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), BRASS, { x: mx, y: TCEIL - 0.25, z: mz });
    const dialY = Math.min(TCEIL - 1.2, yT + 0.2 + 2.45), dialR = 0.85, rodY = dialY + dialR + 0.25;
    props.link([mx, my + 0.96, mz], [mx, rodY, mz], 0.02, 0.02, STEEL, 6);
    props.link([mx, rodY, mz], [TR.x0 + 0.25, rodY, mz], 0.02, 0.02, STEEL, 6);
    props.link([TR.x0 + 0.25, rodY, mz], [TR.x0 + 0.25, rodY, tdz], 0.02, 0.02, STEEL, 6);
    for (const [x, z] of [[mx, mz], [TR.x0 + 0.25, mz], [TR.x0 + 0.25, tdz]]) metal.add(new THREE.BoxGeometry(0.12, 0.12, 0.12), BRASS, { x, y: rodY, z });
    props.link([TR.x0 + 0.25, rodY, tdz], [TR.x0 + 0.2, dialY, tdz], 0.02, 0.02, STEEL, 6);
    // setting dial on the movement, toward the open side (the route)
    const toRoute = (() => { const p = path.at(sOf(mx, mz)); const d = Math.hypot(p.x - mx, p.z - mz) || 1; return [(p.x - mx) / d, (p.z - mz) / d]; })();
    const qd = qYaw(Math.atan2(toRoute[0], toRoute[1]));
    decal(DECALS4.clock, 0.42, 0.42, [mx + toRoute[0] * 0.4, my + 0.62, mz + toRoute[1] * 0.4], qd);
    metal.add(new THREE.TorusGeometry(0.21, 0.02, 4, 20), BRASS, { x: mx + toRoute[0] * 0.39, y: my + 0.62, z: mz + toRoute[1] * 0.39, q: qd });
    // the back of a big clock dial in the west face, straight ahead of the runner: translucent opal glass lit by the
    // sky (numerals reversed), iron frame + spokes, the motion work on its arbor. (The 1911 dials sit at 21.6 m; this
    // lower west dial is a game liberty so the runner passes behind one.)
    {
      const dx = TR.x0 + 0.03, dz = tdz;
      atXZ(dx + 1, dz);
      const r = DECALS4.clock, mir = [r[2], r[1], r[0], r[3]];
      decal(mir, dialR * 2, dialR * 2, [dx, dialY, dz], qYaw(Math.PI / 2), 0xffffff, RT.dial);
      props.add(new THREE.TorusGeometry(dialR, 0.06, 6, 36), IRON, { x: dx + 0.05, y: dialY, z: dz, ry: Math.PI / 2 });
      for (let i = 0; i < 4; i++) props.box(0.04, dialR * 2, 0.04, IRON, dx + 0.08, dialY, dz, { ry: Math.PI / 2, rz: (i / 4) * Math.PI, order: 'YXZ' });
      props.box(0.22, 0.26, 0.26, IRON2, dx + 0.2, dialY, dz);
      metal.add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), BRASS, { x: dx + 0.15, y: dialY, z: dz, rz: Math.PI / 2 });
      halos.push({ x: dx + 0.4, y: dialY, z: dz, size: 3.2, col: [0.2, 0.22, 0.26] });
      pool(dx + 0.05, dialY, dz, 2.6, [0.12, 0.14, 0.17], qYaw(Math.PI / 2));
    }
    // weights on cables (down past the deck into a slot) + the pendulum (dynamic)
    for (const sx of [-1, 1]) {
      const wx = mx + sx * 0.4, wz = mz - 0.45 * Math.sign(mz - (TR.z0 + TR.z1) / 2 || 1);
      props.link([wx, my + 0.15, wz], [wx, yT + 1.4, wz], 0.008, 0.008, 0x8a8a8a, 3);
      props.cyl(0.13, 0.13, 0.7, 10, IRON2, wx, yT + 1.05, wz);
    }
    const pb = new Batch();
    pb.box(0.025, 1.9, 0.025, STEEL, 0, -0.95, 0);
    pb.cyl(0.17, 0.17, 0.07, 18, BRASS, 0, -1.9, 0, { rx: Math.PI / 2 });
    const pend = pb.mesh(M.props); pend.position.set(mx + 0.2, my + 0.3, mz); pend.userData.dynamic = true; root.add(pend);
    clock.pend = pend;
    // ladder up the west wall
    {
      const lz0 = TR.z0 + 0.8, x = TR.x0 + 0.12; atXZ(x, lz0);
      for (const o of [-0.22, 0.22]) props.box(0.05, TCEIL - yT, 0.07, WOOD2, x, (TCEIL + yT) / 2, lz0 + o);
      for (let y = yT + 0.3; y < TCEIL; y += 0.3) props.cyl(0.018, 0.018, 0.44, 5, WOOD2, x, y, lz0, { rx: Math.PI / 2 });
    }
    // lamp
    const lp = [cx - 0.3, TCEIL - 0.35, cz + 0.2];
    pendant(lp[0], lp[1] - 0.6, lp[2], TCEIL, { big: 0.85, poolY: yT + 0.02, poolSize: 5 });
    catLamps.push({ s: sOf(lp[0], lp[2]), x: lp[0], y: lp[1] - 0.7, z: lp[2] });
  }

  lockKey = 'bridge';
  // ================================================================== 3) COVERED BRIDGE — windows both sides, the yard outside
  {
    const bx0 = BR.x - BR.hw, bx1 = BR.x + BR.hw, yB = BR.floor;
    const n = 7, len = BR.z1 - BR.z0, sp = len / n;
    const wins = [];
    for (let i = 0; i < n; i++) { const c = (i + 0.5) * sp; wins.push({ u0: c - 0.72, u1: c + 0.72, v0: yB + 0.75, v1: BR.spring - 0.15, glass: 'clear', shaft: true }); }
    // walls split per window bay for chunking
    for (let i = 0; i < n; i++) {
      const z0 = BR.z0 + i * sp, z1 = z0 + sp, h = [{ ...wins[i], u0: wins[i].u0 - i * sp, u1: wins[i].u1 - i * sp }];
      wall([bx0, z0], [bx0, z1], [1, 0], yB - 0.35, BR.spring + 0.02, h, { base: yB - 4.2, sunny: true, floorY: yB, depth: 0.4 });
      wall([bx1, z0], [bx1, z1], [-1, 0], yB - 0.35, BR.spring + 0.02, h, { base: yB - 4.2, depth: 0.4 });
      // plank barrel vault + iron rib
      atXZ(BR.x, (z0 + z1) / 2);
      const seg = 10, pos = [], col = [];
      for (let k = 0; k < seg; k++) {
        const la = -BR.hw + 2 * BR.hw * k / seg, lb = -BR.hw + 2 * BR.hw * (k + 1) / seg;
        const ya = vault(la), yb = vault(lb), c = 0.75 + 0.18 * Math.sin(k * 2.7 + i);
        for (const [l, y, z] of [[la, ya, z0], [lb, yb, z0], [lb, yb, z1], [la, ya, z0], [lb, yb, z1], [la, ya, z1]]) { pos.push(BR.x + l, y, z); col.push(c * 0.55, c * 0.4, c * 0.27); }
      }
      props.add(soup(pos, null, col, [0, -1, 0]), 0, { keepColor: true });
      for (let k = 0; k < seg; k++) {
        const la = -BR.hw + 2 * BR.hw * k / seg, lb = -BR.hw + 2 * BR.hw * (k + 1) / seg;
        props.bar([BR.x + la, vault(la) - 0.03, z0 + 0.05], [BR.x + lb, vault(lb) - 0.03, z0 + 0.05], 0.1, 0.06, IRON);
      }
      props.box(0.08, 0.12, sp, WOOD_DARK, bx0 + 0.04, BR.spring + 0.06, (z0 + z1) / 2);
      props.box(0.08, 0.12, sp, WOOD_DARK, bx1 - 0.04, BR.spring + 0.06, (z0 + z1) / 2);
      // steel girders under the floor (seen through the holes and from the yard)
      for (const sx of [-1, 1]) slab(props, BR.x + sx * BR.hw - 0.12, BR.x + sx * BR.hw + 0.12, yB - 0.75, yB - 0.08, z0, z1, IRON);
      props.box(2 * BR.hw, 0.16, 0.12, IRON2, BR.x, yB - 0.2, z0 + 0.1);
    }
    // crown lamps
    for (let z = BR.z0 + sp; z < BR.z1 - 1; z += sp * 2) {
      atXZ(BR.x, z);
      pendant(BR.x, BR.crown - 0.32, z, BR.crown, { big: 0.75 });
      catLamps.push({ s: sOf(BR.x, z), x: BR.x, y: BR.crown - 0.45, z });
    }
  }
  // ---------------- the outside, seen through the bridge windows (one batch, baked haze, unfogged; visible near the bridge)
  const outB = new Batch({ color: true });
  const outside = {};
  {
    const C0 = new THREE.Vector3(BR.x, 9.5, (BR.z0 + BR.z1) / 2);
    const HAZE = new THREE.Color(0xbfbcae), SUN = new THREE.Vector3(-0.52, 0.6, -0.6).normalize();
    outB.post = (g) => {
      const p = g.attributes.position, nn = g.attributes.normal, c = g.attributes.color;
      for (let i = 0; i < p.count; i++) {
        const d = _v.set(p.getX(i), p.getY(i), p.getZ(i)).distanceTo(C0);
        const lit = 0.62 + 0.42 * Math.max(0, nn.getX(i) * SUN.x + nn.getY(i) * SUN.y + nn.getZ(i) * SUN.z);
        const k = Math.min(0.92, 1 - Math.exp(-d / 70));
        c.setXYZ(i, c.getX(i) * lit * (1 - k) + HAZE.r * k, c.getY(i) * lit * (1 - k) + HAZE.g * k, c.getZ(i) * lit * (1 - k) + HAZE.b * k);
      }
    };
    const ob = (x0, x1, y0, y1, z0, z1, c, o = {}) => outB.box(x1 - x0, y1 - y0, z1 - z0, c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
    // ground (subdivided so the haze varies), yard paving
    { const g = new THREE.PlaneGeometry(240, 240, 12, 12); g.rotateX(-Math.PI / 2); outB.add(g, 0x7a7262, { x: 20, y: -0.02, z: 0 }); }
    for (const tz of TRACKS) {
      ob(-90, 120, 0, 0.12, tz - 1.6, tz + 1.6, 0x5a5348);
      for (const o of [-0.72, 0.72]) ob(-90, 120, 0.12, 0.27, tz + o - 0.035, tz + o + 0.035, 0x48443f);
      for (let x = -40; x < 70; x += 1.1) ob(x - 0.12, x + 0.12, 0.08, 0.18, tz - 1.25, tz + 1.25, 0x3e3226);
    }
    // goods wagons on the tracks (wooden box vans, brake hut)
    const wagon = (x, tz, col, flat = false) => {
      ob(x - 4.2, x + 4.2, 0.9, 1.25, tz - 1.25, tz + 1.25, 0x2a2826);
      for (const ax of [-2.6, 2.6]) for (const o of [-0.75, 0.75]) outB.cyl(0.48, 0.48, 0.12, 12, 0x2a2826, x + ax, 0.75, tz + o, { rx: Math.PI / 2 });
      if (flat) { for (let i = 0; i < 5; i++) outB.cyl(0.33, 0.33, 0.8, 10, 0x7a5232, x - 3 + i * 1.4, 1.6, tz, { rz: Math.PI / 2, ry: Math.PI / 2 }); return; }
      ob(x - 4.0, x + 4.0, 1.25, 3.6, tz - 1.35, tz + 1.35, col);
      ob(x - 4.1, x + 4.1, 3.6, 3.8, tz - 1.45, tz + 1.45, 0x504a44);
      ob(x - 0.7, x + 0.7, 1.4, 3.3, tz - 1.4, tz + 1.4, 0x3e2a1e);
    };
    wagon(BR.x - 14, TRACKS[0], 0x6e3524); wagon(BR.x + 13, TRACKS[1], 0x5a3a28); wagon(BR.x + 23, TRACKS[0], 0x6a4a30, true); wagon(BR.x - 26, TRACKS[1], 0x6a3022);
    // lattice pylon under the bridge
    { const pz = (TRACKS[0] + TRACKS[1]) / 2; for (const dx of [-0.9, 0.9]) for (const dz of [-0.6, 0.6]) outB.bar([BR.x + dx * 1.25, 0, pz + dz * 1.4], [BR.x + dx, BR.floor - 0.8, pz + dz], 0.22, 0.22, 0x2b2c2f); }
    // bottling hall: walls + three parallel gable roofs
    ob(BO.x0, BO.x1, 0, 7.0, BO.z0, BO.z1, 0xd2c4a6);
    {
      const nb = 3, bw = (BO.z1 - BO.z0) / nb;
      for (let i = 0; i < nb; i++) {
        const za = BO.z0 + i * bw, zb = za + bw, zm = (za + zb) / 2, y0 = 7.0, y1 = 10.4;
        const pos = [BO.x0, y0, za, BO.x1, y0, za, BO.x1, y1, zm, BO.x0, y0, za, BO.x1, y1, zm, BO.x0, y1, zm,
          BO.x0, y0, zb, BO.x1, y1, zm, BO.x1, y0, zb, BO.x0, y0, zb, BO.x0, y1, zm, BO.x1, y1, zm];
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
        outB.add(g, 0x5d5c5e);
        const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute([BO.x0, y0, za, BO.x0, y1, zm, BO.x0, y0, zb], 3)); ge.computeVertexNormals();
        outB.add(ge, 0xd2c4a6);
        for (let x = BO.x0 + 4; x < BO.x1 - 2; x += 4.4) ob(x - 0.6, x + 0.6, 2.0, 4.6, BO.z0 - 0.06, BO.z0 + 0.02, 0x3a3836);
      }
    }
    // Varna (south + west faces), cellar tower, cellars' north front, a cooperage shed west, the chimney
    const facadeBox = (x0, x1, z0, z1, h, col, winY) => {
      ob(x0, x1, 0, h, z0, z1, col);
      for (const y of winY) {
        // window rects only OUTSIDE the faces (never poke into the interiors)
        for (let x = x0 + 1.6; x < x1 - 1; x += 3.6) { ob(x - 0.5, x + 0.5, y, y + 2.0, z1, z1 + 0.04, 0x3a3a3a); ob(x - 0.5, x + 0.5, y, y + 2.0, z0 - 0.04, z0, 0x3a3a3a); }
        for (let z = z0 + 1.6; z < z1 - 1; z += 3.6) { ob(x0 - 0.04, x0, y, y + 2.0, z - 0.5, z + 0.5, 0x3a3a3a); ob(x1, x1 + 0.04, y, y + 2.0, z - 0.5, z + 0.5, 0x3a3a3a); }
      }
    };
    // (no box for the clock tower / stair building / cellar tower: their faces would close the bridge doorways)
    facadeBox(TW.x1 + 0.05, VA.x1, VA.z0, VA.z1, 16.9, 0xcdb894, [2.2, 5.6, 8.8, 12.0]);
    facadeBox(CL.x0, CL.x1, CL.z0, CL.z1, CF.eaves, 0xbfa682, [2.4, 8.6]);
    { const y0 = CF.eaves, y1 = CF.eaves + ROOF_RISE, xm = RIDGE_X;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([CL.x0, y0, CL.z0, CL.x0, y0, CL.z1, xm, y1, CL.z1, CL.x0, y0, CL.z0, xm, y1, CL.z1, xm, y1, CL.z0,
        CL.x1, y0, CL.z0, xm, y1, CL.z1, CL.x1, y0, CL.z1, CL.x1, y0, CL.z0, xm, y1, CL.z0, xm, y1, CL.z1], 3)); g.computeVertexNormals(); outB.add(g, 0x56565a); }
    facadeBox(-40, -6, -42, -31, 6.0, 0xb8a888, [2.0]);
    ob(-40.5, -5.5, 6.0, 6.4, -42.5, -30.5, 0x585656);
    outB.cyl(1.62, 2.3, 46, 16, 0x9a6a52, lx(-76), 23 + 0.0, lz(879.5), { open: true });
    outB.cyl(1.85, 1.85, 2.2, 16, 0x5a3a2e, lx(-76), 47, lz(879.5));
    // sky: large unfogged dome behind everything (seen only through openings)
    const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    { const p = sky.geometry.attributes.position, c = new Float32Array(p.count * 3), lo = new THREE.Color(0xd8d2bf), hi = new THREE.Color(0x93a8b8);
      for (let i = 0; i < p.count; i++) { const k = THREE.MathUtils.smoothstep(p.getY(i) / 180, -0.05, 0.6); _c.copy(lo).lerp(hi, k); c.set([_c.r, _c.g, _c.b], i * 3); }
      sky.geometry.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    sky.position.set(BR.x, -20, 10); sky.renderOrder = -10; sky.frustumCulled = false; sky.name = 'sky';
    root.add(sky);
    outside.sky = sky;
  }

  lockKey = 'ctower';
  // ================================================================== 4) CELLAR-TOWER STAIR BUILDING + TOWER (masonry shaft, hoist)
  const SR = RG.stair, CR = RG.ctower;
  {
    const yR = BR.floor;
    const bm = { mat: 'brick', base: 0, sunny: false };
    const routeX = BR.x;
    const door = (c) => ({ u0: c - BR.hw, u1: c + BR.hw, v0: yR - 0.1, v1: yR + 2.95, rise: 0.4, glass: null });
    const smallWin = (u, v0, v1) => ({ u0: u - 0.45, u1: u + 0.45, v0, v1, rise: 0.25, glass: 'win', shaft: true });
    // stair building
    wall([SR.x0, SR.z0], [SR.x1, SR.z0], [0, 1], 5.5, CTCEIL + 0.05, [door(routeX - SR.x0)], bm);
    wall([SR.x0, SR.z0], [SR.x0, SR.z1], [1, 0], 5.5, CTCEIL + 0.05, [smallWin(1.4, 9.0, 10.7), smallWin(3.0, 6.4, 8.0)], { ...bm, sunny: true, floorY: 6.0 });
    wall([SR.x1, SR.z0], [SR.x1, SR.z1], [-1, 0], 5.5, CTCEIL + 0.05, [smallWin(2.2, yR + 0.9, yR + 2.6)], bm);
    wall([SR.x0, SR.z1], [SR.x1, SR.z1], [0, -1], 5.5, CTCEIL + 0.05, [door(routeX - SR.x0)], { ...bm, depth: WT / 2 });
    plane(SR.x0, SR.x1, SR.z0, SR.z1, CTCEIL, 'ceil', { down: true, shade: () => 0.38, col: [0.85, 0.78, 0.7] });
    plane(SR.x0, SR.x1, SR.z0, SR.z1, yR - 2.4, 'floor', { shade: (x, z) => 0.38 + 0.05 * noise2(x, z), col: [0.8, 0.75, 0.7] });
    // dog-leg stair west of the route: landing at the bridge level, a flight up and a flight down
    {
      const xl = SR.x0, xr = Math.min(routeX - RAIL - 0.15, SR.x0 + 3.9), zA = SR.z1 - 1.4, zB = SR.z0 + 0.1;
      atXZ((xl + xr) / 2, (SR.z0 + SR.z1) / 2);
      slab(props, xl, xr, yR - 0.22, yR, zA, SR.z1, 0x7d7569);
      const mid = (xl + xr) / 2;
      const flight = (x0, x1, ya, yb) => {
        const nst = Math.round(Math.abs(yb - ya) / 0.19), g = (zA - zB) / nst, rs = (yb - ya) / nst;
        for (let i = 0; i < nst; i++) slab(props, x0, x1, ya + rs * (i + 1) - 0.05, ya + rs * (i + 1), zA - g * (i + 1), zA - g * i + 0.03, STEEL_D);
        for (const xx of [x0 + 0.05, x1 - 0.05]) { props.bar([xx, ya - 0.1, zA], [xx, yb - 0.1, zB], 0.06, 0.25, IRON); props.link([xx, ya + 0.95, zA], [xx, yb + 0.95, zB], 0.02, 0.02, STEEL, 5); }
      };
      flight(xl + 0.05, mid - 0.05, yR, yR + 2.4);
      flight(mid + 0.05, xr, yR, yR - 2.4);
      slab(props, xl, xr, yR + 2.4 - 0.22, yR + 2.4, zB - 0.1, zB + 0.9, 0x7d7569);
      props.link([xr, yR + 1.0, zA], [xr, yR + 1.0, SR.z1], 0.025, 0.025, STEEL, 5);
    }
    // the tower: brick shaft, floor at the 2nd tower level below, ceiling above, windows east + south
    const yFl = BUILDINGS.cellarTower.floors[1];
    wall([CR.x0, CR.z0], [CR.x1, CR.z0], [0, 1], yFl, CTCEIL + 0.05, [door(routeX - CR.x0)], { ...bm, depth: WT / 2 });
    const tw = [];
    for (let u = 2.8; u < CR.z1 - CR.z0 - 1.5; u += 4.2) { tw.push(smallWin(u, yFl + 0.8, yR - 0.6), smallWin(u, yR + 1.0, CTCEIL - 0.5)); }
    wall([CR.x1, CR.z0], [CR.x1, CR.z1], [-1, 0], yFl, CTCEIL + 0.05, tw, bm);
    wall([CR.x0, CR.z1], [CR.x1, CR.z1], [0, -1], yFl, CTCEIL + 0.05, [smallWin(2.4, yR + 1.0, CTCEIL - 0.5), smallWin(6.4, yR + 1.0, CTCEIL - 0.5)], bm);
    // west wall with the stair tunnel into the cellars: find where the stairs cross the wall
    let tunnel = null;
    for (const q of stairs) {
      for (let s = q.s0; s < q.s1; s += 0.1) { const p = fr(s); if (p.x < CR.x0 && p.x > CL.x1 - 0.1 && Math.abs(p.z - (CR.z0 + CR.z1) / 2) < 12) { tunnel = { s, z: p.z }; break; } }
      if (tunnel) break;
    }
    const tz = tunnel ? tunnel.z : CR.z1 - 4.4;
    const tY0 = tunnel ? dy(tunnel.s) - 0.6 : yR;
    const tHole = { u0: tz - CR.z0 - HALF - 0.25, u1: tz - CR.z0 + HALF + 0.25, v0: tY0, v1: CF.coolingFloor - 0.15, glass: null };
    wall([CR.x0, CR.z0], [CR.x0, CR.z1], [1, 0], yFl, CF.coolingFloor - 0.1, [tHole], { ...bm, depth: CR.x0 - RG.cool.x1 });
    plane(CR.x0, CR.x1, CR.z0, CR.z1, yFl, 'floor', { shade: (x, z) => 0.42 + 0.05 * noise2(x, z), col: [0.8, 0.75, 0.7] });
    plane(CR.x0, CR.x1, CR.z0, CR.z1, CTCEIL, 'ceil', { down: true, shade: () => 0.36, col: [0.85, 0.78, 0.7] });
    for (let z = CR.z0 + 2.0; z < CR.z1; z += 3.0) { atXZ(routeX, z); ceil.box(CR.x1 - CR.x0, 0.24, 0.24, BEAM, (CR.x0 + CR.x1) / 2, CTCEIL - 0.12, z); }
    // hoist: winch drum + gear wheel under the ceiling, chain down an open well in the floor to a hanging crate
    {
      const hx = CR.x0 + 2.0, hz = CR.z0 + 4.0;
      atXZ(hx, hz);
      voids.add(new THREE.PlaneGeometry(2.6, 3.0), 0, { x: hx, y: yFl + 0.01, z: hz, rx: -Math.PI / 2 });
      for (const [a, b] of [[[hx - 1.3, hz - 1.5], [hx + 1.3, hz - 1.5]], [[hx + 1.3, hz - 1.5], [hx + 1.3, hz + 1.5]], [[hx + 1.3, hz + 1.5], [hx - 1.3, hz + 1.5]]]) {
        props.link([a[0], yFl + 1.0, a[1]], [b[0], yFl + 1.0, b[1]], 0.025, 0.025, IRON2, 5);
        props.cyl(0.03, 0.03, 1.0, 5, IRON2, a[0], yFl + 0.5, a[1]);
      }
      const yw = CTCEIL - 0.55;
      props.box(CR.x1 - CR.x0, 0.3, 0.2, BEAM, (CR.x0 + CR.x1) / 2, yw + 0.3, hz);
      props.add(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 16), IRON2, { x: hx, y: yw, z: hz, rz: Math.PI / 2 });
      props.add(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 24), RED_LEAD, { x: hx + 0.7, y: yw, z: hz, rz: Math.PI / 2 });
      props.add(new THREE.TorusGeometry(0.75, 0.04, 4, 24), IRON, { x: hx + 0.75, y: yw, z: hz, ry: Math.PI / 2 });
      for (const sx of [-1, 1]) props.box(0.1, 0.9, 0.5, IRON, hx + sx * 0.7, yw + 0.1, hz);
      props.link([hx, yw - 0.3, hz + 0.3], [hx, yR + 1.2, hz + 0.3], 0.018, 0.018, 0x55524c, 4);
      props.add(new THREE.TorusGeometry(0.09, 0.022, 4, 10, Math.PI * 1.4), STEEL, { x: hx, y: yR + 1.1, z: hz + 0.3, rz: 0.5 });
      for (const [dx, dz] of [[-0.3, -0.35], [0.3, -0.35], [-0.3, 0.35], [0.3, 0.35]]) props.link([hx, yR + 1.05, hz + 0.3], [hx + dx, yR + 0.33, hz + 0.3 + dz], 0.01, 0.01, 0xa58c5c, 3);
      atlas.add(crateGeo(), 0xffffff, { x: hx, y: yR + 0.3 - BLOCK_HEIGHT / 2 + 0.03, z: hz + 0.3 });
      // barrels on the floor below
      for (let i = 0; i < 6; i++) props.cyl(0.36, 0.33, 0.85, 12, 0x6e4a2c, CR.x0 + 0.6 + (i % 3) * 0.78, yFl + 0.43, CR.z1 - 1.0 - Math.floor(i / 3) * 0.8);
    }
    // wall lamps in the shaft
    for (const [x, z, nx, nz] of [[CR.x1, (CR.z0 + CR.z1) / 2, -1, 0], [SR.x0, (SR.z0 + SR.z1) / 2, 1, 0]]) { atXZ(x, z); wallLamp(x, yR + 1.9, z, nx, nz, yFl); }
  }

  lockKey = 'cool';
  // ================================================================== 5) COOLING FLOOR (chladicí štok) under the cellars' roof
  const KR2 = RG.cool;
  const coolPans = [];
  {
    const yF = COOL_FLOOR, yD = CF.coolingFloor;
    // stairwell opening in the floor (where the stairs come up)
    let well = null;
    for (const q of stairs) { const a = fr(q.s0), b = fr(q.s1); if (inR(KR2, b.x, b.z, 0.5)) well = { x0: Math.min(b.x, Math.max(a.x, KR2.x1)), x1: Math.max(b.x, Math.min(a.x, KR2.x1)), z0: Math.min(a.z, b.z) - HALF - 0.25, z1: Math.max(a.z, b.z) + HALF + 0.25 }; }
    // floor: tiled, wet, around the well
    const floorPart = (a, b, c, d) => { if (b - a > 0.05 && d - c > 0.05) plane(a, b, c, d, yF, 'floor', { shade: (x, z) => 0.5 + 0.08 * noise2(x * 0.8, z * 0.8), col: [0.5, 0.48, 0.45] }); };
    if (well) {
      floorPart(KR2.x0, KR2.x1, KR2.z0, well.z0); floorPart(KR2.x0, KR2.x1, well.z1, KR2.z1);
      floorPart(KR2.x0, well.x0, well.z0, well.z1); floorPart(well.x1, KR2.x1, well.z0, well.z1);
      // stairwell side walls (brick) from the tunnel down to the floor slab
      atXZ((well.x0 + well.x1) / 2, (well.z0 + well.z1) / 2);
      wall([well.x0, well.z0], [well.x1, well.z0], [0, 1], 8.0, yF, [], { mat: 'brick', keepChunk: true });
      wall([well.x0, well.z1], [well.x1, well.z1], [0, -1], 8.0, yF, [], { mat: 'brick', keepChunk: true });
      wall([well.x0, well.z0], [well.x0, well.z1], [1, 0], 8.0, yF, [], { mat: 'brick', keepChunk: true });
      props.box(0.25, 0.3, well.z1 - well.z0, IRON, well.x0, yF - 0.15, (well.z0 + well.z1) / 2);
    } else floorPart(KR2.x0, KR2.x1, KR2.z0, KR2.z1);
    // knee walls (Kniestock) with louvred vents; gable walls up to the ridge with big louvred windows
    const kw = (A, B, n, holes) => wall(A, B, n, yF - 0.05, EIN + 0.05, holes, { base: yF - 2.0 });
    const vents = (len) => { const h = []; for (let u = 3; u < len - 2; u += 5) h.push({ u0: u - 0.75, u1: u + 0.75, v0: yD + 0.9, v1: EIN - 0.35, glass: 'louvre' }); return h; };
    kw([KR2.x0, KR2.z0], [KR2.x0, KR2.z1], [1, 0], vents(KR2.z1 - KR2.z0));
    if (well) {
      kw([KR2.x1, KR2.z0], [KR2.x1, well.z0], [-1, 0], vents(well.z0 - KR2.z0));
      wall([KR2.x1, well.z0], [KR2.x1, well.z1], [-1, 0], CF.coolingFloor - 0.15, EIN + 0.05, [], { base: yF - 2.0 });
      kw([KR2.x1, well.z1], [KR2.x1, KR2.z1], [-1, 0], vents(KR2.z1 - well.z1));
    } else kw([KR2.x1, KR2.z0], [KR2.x1, KR2.z1], [-1, 0], vents(KR2.z1 - KR2.z0));
    // (the parts of the gable rectangle above the roof line are hidden behind the roof boarding)
    for (const [zz, nz] of [[KR2.z0, 1], [KR2.z1, -1]]) {
      const holes = [];
      for (const xc of [RIDGE_X - 9.5, RIDGE_X, RIDGE_X + 9.5]) {
        const top = Math.min(roofIn(xc - 1.2), roofIn(xc + 1.2)) - 0.5;
        holes.push({ u0: xc - 1.2 - KR2.x0, u1: xc + 1.2 - KR2.x0, v0: yD + 1.0, v1: top, rise: 0.45, glass: 'louvre' });
      }
      wall([KR2.x0, zz], [KR2.x1, zz], [0, nz], yF - 0.05, RIDGE_IN + 1.6, holes, { base: yF - 2.0 });
    }
    // roof underside (boarding on rafters + purlins), lantern louvres along the ridge
    const xs = [KR2.x0, LAN.x0, LAN.x1, KR2.x1];
    for (let z = KR2.z0; z < KR2.z1 - 0.01; z += 6) {
      const z1 = Math.min(KR2.z1, z + 6);
      atXZ(RIDGE_X, (z + z1) / 2);
      for (const [xa, xb] of [[xs[0], xs[1]], [xs[2], xs[3]]]) {
        const pos = [], col = [], nseg = 4;
        for (let k = 0; k < nseg; k++) {
          const a = xa + (xb - xa) * k / nseg, b = xa + (xb - xa) * (k + 1) / nseg, c = 0.42 + 0.1 * Math.sin(k * 1.7 + z);
          for (const [x, zz2] of [[a, z], [b, z], [b, z1], [a, z], [b, z1], [a, z1]]) { pos.push(x, roofIn(x), zz2); col.push(c * 0.95, c * 0.78, c * 0.58); }
        }
        ceil.add(soup(pos, null, col, [0, -1, 0]), 0, { keepColor: true });
        for (const f of [0.2, 0.45, 0.7, 0.95]) { const x = xa + (xb - xa) * f; ceil.box(0.14, 0.18, z1 - z, WOOD_DARK, x, roofIn(x) - 0.1, (z + z1) / 2); }
      }
      const yl0 = roofIn(LAN.x0), yl1 = RIDGE_IN + 1.3;
      for (const x of [LAN.x0, LAN.x1]) for (let y = yl0 + 0.2; y < yl1 - 0.1; y += 0.32) props.box(0.24, 0.035, z1 - z, WOOD_DARK, x, y, (z + z1) / 2, { rz: x < RIDGE_X ? 0.65 : -0.65 });
      ceil.box(LAN.x1 - LAN.x0 + 0.3, 0.1, z1 - z, 0x4a3c2e, RIDGE_X, yl1, (z + z1) / 2);
      for (const x of [LAN.x0 + 0.4, LAN.x1 - 0.4]) {
        const y = (yl0 + yl1) / 2, len = (y - yF) * 0.8;
        const pa = new THREE.Vector3(x, y, z + 0.6), pb = new THREE.Vector3(x, y, z1 - 0.6);
        const d = new THREE.Vector3(x < RIDGE_X ? 0.25 : -0.25, -1, 0.15).normalize();
        const pc = pb.clone().addScaledVector(d, len), pd = pa.clone().addScaledVector(d, len);
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.Float32BufferAttribute([...pa.toArray(), ...pb.toArray(), ...pc.toArray(), ...pa.toArray(), ...pc.toArray(), ...pd.toArray()], 3));
        sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
        sg.computeVertexNormals(); shafts.add(sg, 0, {});
      }
    }
    // iron trusses: tie beam on the knee walls (3.15 m over the catwalks), king post, struts to the rafters
    const tieY = EIN - 0.15;
    for (let z = KR2.z0 + 4.0; z < KR2.z1 - 2; z += 4.8) {
      atXZ(RIDGE_X, z);
      props.box(KR2.x1 - KR2.x0, 0.22, 0.14, IRON, (KR2.x0 + KR2.x1) / 2, tieY, z);
      props.box(0.12, RIDGE_IN - tieY, 0.12, IRON, RIDGE_X, (RIDGE_IN + tieY) / 2, z);
      for (const sx of [-1, 1]) {
        const xm = RIDGE_X + sx * 7.5;
        props.bar([RIDGE_X + sx * 0.1, tieY + 0.1, z], [xm, roofIn(xm) - 0.12, z], 0.1, 0.1, IRON);
        props.box(0.08, roofIn(xm) - tieY, 0.08, IRON, xm, (roofIn(xm) + tieY) / 2, z);
      }
    }
    // the cooling pans: big shallow riveted iron pans on legs, wort surface, haze
    const routeD = (x, z) => { let d = 1e9; for (let s = 0; s < L; s += 0.7) { const p = fr(s); d = Math.min(d, Math.hypot(p.x - x, p.z - z)); } return d; };
    const pan = (x0, x1, z0, z1) => {
      // keep clear of the route: cut the rectangle on the side that keeps the most area
      for (let it = 0; it < 6; it++) {
        const hits = [];
        for (let s = 0; s < L; s += 0.5) {
          const p = fr(s), clr = s > sF0 - 2 ? 3.0 : RAIL + 0.4;
          if (p.x > x0 - clr && p.x < x1 + clr && p.z > z0 - clr && p.z < z1 + clr) hits.push([p.x, p.z, clr]);
        }
        if (!hits.length) break;
        const opts = [
          [Math.max(...hits.map((h) => h[0] + h[2])), x1, z0, z1], [x0, Math.min(...hits.map((h) => h[0] - h[2])), z0, z1],
          [x0, x1, Math.max(...hits.map((h) => h[1] + h[2])), z1], [x0, x1, z0, Math.min(...hits.map((h) => h[1] - h[2]))],
        ].filter((o) => o[1] > o[0] && o[3] > o[2]);
        if (!opts.length) return;
        opts.sort((a, b) => (b[1] - b[0]) * (b[3] - b[2]) - (a[1] - a[0]) * (a[3] - a[2]));
        [x0, x1, z0, z1] = opts[0];
      }
      if (x1 - x0 < 2.5 || z1 - z0 < 2.5) return;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, yb = yD + 0.1, yt = yD + 0.72;
      atXZ(cx, cz);
      for (let x = x0 + 0.5; x < x1; x += 2.4) for (let z = z0 + 0.5; z < z1; z += 2.6) props.box(0.14, yb - yF, 0.14, IRON, x, (yb + yF) / 2, z);
      slab(props, x0, x1, yb - 0.05, yb, z0, z1, IRON2);
      wort.add(new THREE.PlaneGeometry(x1 - x0 - 0.1, z1 - z0 - 0.1), 0, { x: cx, y: yt - 0.2, z: cz, rx: -Math.PI / 2 });
      for (const [a, b, c, d] of [[x0, x1, z0 - 0.03, z0 + 0.03], [x0, x1, z1 - 0.03, z1 + 0.03], [x0 - 0.03, x0 + 0.03, z0, z1], [x1 - 0.03, x1 + 0.03, z0, z1]]) {
        slab(props, a, b, yb, yt, c, d, IRON);
        slab(props, a - 0.06, b + 0.06, yt, yt + 0.05, c - 0.06, d + 0.06, 0x6a655c);
        slab(props, a - 0.05, b + 0.05, yb + 0.12, yb + 0.18, c - 0.05, d + 0.05, IRON2);
      }
      const step = low ? 0.8 : 0.45;
      for (let x = x0 + 0.2; x < x1; x += step) for (const z of [z0 - 0.04, z1 + 0.04]) props.add(new THREE.OctahedronGeometry(0.03, 0), 0x77706a, { x, y: yt - 0.1, z });
      for (let z = z0 + 0.2; z < z1; z += step) for (const x of [x0 - 0.04, x1 + 0.04]) props.add(new THREE.OctahedronGeometry(0.03, 0), 0x77706a, { x, y: yt - 0.1, z });
      props.link([x0 + 0.4, yb - 0.05, z1 - 0.4], [x0 + 0.4, yF + 0.1, z1 - 0.4], 0.05, 0.05, IRON, 6);
      props.add(new THREE.TorusGeometry(0.12, 0.02, 4, 10), RED_WHEEL, { x: x0 + 0.4, y: yb - 0.35, z: z1 - 0.25 });
      glows.add(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.Color(0.07, 0.07, 0.065), { x: cx, y: yt + 0.35, z: cz, rx: -Math.PI / 2 });
      for (let x = x0 + 2; x < x1 - 1; x += 3.5) for (let z = z0 + 2; z < z1 - 1; z += 3.5) emitters.push({ x, y: yt, z, rate: 0.9, r: 1.6, kind: 'pan' });
      coolPans.push({ x0, x1, z0, z1 });
    };
    // bands between the route legs that run across the hall (read from the path), columns ≈ 8 m
    const cross = [];
    for (let s = 0; s < L; s += 1) { const p = fr(s); if (inR(KR2, p.x, p.z) && Math.abs(p.tz) < 0.05) { const z = Math.round(p.z * 2) / 2; if (!cross.some((q) => Math.abs(q - z) < 2)) cross.push(z); } }
    cross.sort((a, b) => a - b);
    const bandEdges = [KR2.z0 + 0.8 - (RAIL + 0.4), ...cross, KR2.z1 - 0.8 + (RAIL + 0.4)];
    const xA = KR2.x0 + 0.8, xB = KR2.x1 - 3.6, nCols = Math.max(1, Math.round((xB - xA) / 8)), cw = (xB - xA) / nCols;
    for (let b = 0; b < bandEdges.length - 1; b++) {
      const za = bandEdges[b] + RAIL + 0.4, zb = bandEdges[b + 1] - RAIL - 0.4;
      if (zb - za < 2.5) continue;
      for (let i = 0; i < nCols; i++) pan(xA + i * cw + 0.45, xA + (i + 1) * cw - 0.45, za, zb);
    }
    // Baudelot surface cooler near the stairs (vertical rack of copper pipes, trough below)
    {
      let bxp = KR2.x1 - 1.6, bzp = well ? well.z1 + 4.5 : KR2.z0 + 18;
      if (routeD(bxp, bzp) > RAIL + 0.9) {
        atXZ(bxp, bzp);
        for (const o of [-1.6, 1.6]) props.box(0.1, 2.4, 0.1, IRON, bxp, yF + 1.2, bzp + o);
        for (let y = yF + 0.6; y < yF + 2.3; y += 0.12) copper.add(new THREE.CylinderGeometry(0.045, 0.045, 3.1, 8, 1, true), 0, { x: bxp, y, z: bzp, rx: Math.PI / 2 });
        props.box(0.5, 0.25, 3.4, IRON2, bxp, yF + 0.45, bzp);
        props.box(0.4, 0.2, 3.3, 0x3a2a18, bxp, yF + 2.45, bzp);
        emitters.push({ x: bxp, y: yF + 2.2, z: bzp, rate: 1.2, r: 1.2, kind: 'pan' });
      }
    }
    // pipes along the knee walls (brine + water), pendants over the pans
    for (const [x, nx] of [[KR2.x0 + 0.35, 1], [KR2.x1 - 0.35, -1]]) {
      for (let z = KR2.z0 + 0.5; z < KR2.z1 - 0.5; z += 6) {
        const z1 = Math.min(KR2.z1 - 0.5, z + 6); atXZ(x, (z + z1) / 2);
        props.link([x, yF + 0.6, z], [x, yF + 0.6, z1], 0.09, 0.09, IRON2, 8);
        props.link([x + nx * 0.25, yF + 0.95, z], [x + nx * 0.25, yF + 0.95, z1], 0.06, 0.06, 0x6a5a48, 6);
      }
    }
    for (const p of coolPans) {
      const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, top = roofIn(cx) - 0.2;
      atXZ(cx, cz);
      pendant(cx, Math.min(top - 0.3, yD + 3.0), cz, Math.min(top, tieY), { poolY: yD + 0.42, poolSize: 6, poolCol: [0.18, 0.11, 0.04] });
    }
  }

  lockKey = null;
  // ------------------------------------------------------------------ catwalk deck (grating lane strips, real gaps at holes, stairs)
  const holesByLane = { '-1': [], 0: [], 1: [] };
  for (const h of hazards) if (h.type === 'hole') for (const l of h.lanes) holesByLane[l]?.push(holeSpan(h));
  const deckFrom = 0;
  const minus = (ints, cuts) => {
    for (const [a, b] of cuts) {
      const next = [];
      for (const [c, d] of ints) { if (b <= c || a >= d) next.push([c, d]); else { if (a > c) next.push([c, a]); if (b < d) next.push([b, d]); } }
      ints = next;
    }
    return ints;
  };
  const stairCuts = stairs.map((q) => [q.s0, q.s1]);
  {
    for (const lane of [-1, 0, 1]) {
      const lat0 = (lane - 0.5) * LW, lat1 = (lane + 0.5) * LW;
      const ints = minus(minus([[deckFrom, sF0]], holesByLane[lane]), stairCuts);
      for (const [a, b] of ints) {
        const ss = samples(a, b, 2);
        for (let i = 0; i < ss.length - 1; i++) {
          const s0 = ss[i], s1 = ss[i + 1];
          at((s0 + s1) / 2);
          const y0 = dy(s0), y1 = dy(s1);
          const A = W(s0, lat0, y0), Bp = W(s0, lat1, y0), C = W(s1, lat1, y1), D = W(s1, lat0, y1);
          const v0 = s0 / GRATE.size, v1 = s1 / GRATE.size;
          const c0 = 0.9 + 0.12 * Math.sin(s0 * 1.7 + lane * 2.1), c1 = 0.9 + 0.12 * Math.sin(s1 * 1.7 + lane * 2.1);
          deck.add(soup([...A, ...Bp, ...C, ...A, ...C, ...D], [0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1],
            [c0, c0, c0, c0, c0, c0, c1, c1, c1, c0, c0, c0, c1, c1, c1, c1, c1, c1], [0, 1, 0]), 0, { keepColor: true });
        }
      }
    }
    // outer-corner landings
    for (const c of corners) {
      if (onStairs(c.sc, 0.5)) continue;
      const so = -c.inner, ss = samples(c.s0, c.s1, 0.3), Y = dy(c.sc);
      const mp = miter(c, so * RAIL);
      at(c.sc);
      const pos = [], uv = [], col = [];
      for (let i = 0; i < ss.length - 1; i++) {
        const a = W(ss[i], so * LANE_EDGE, Y), b = W(ss[i + 1], so * LANE_EDGE, Y);
        pos.push(mp[0], Y, mp[1], ...a, ...b);
        uv.push(mp[0] / GRATE.size, mp[1] / GRATE.size, a[0] / GRATE.size, a[2] / GRATE.size, b[0] / GRATE.size, b[2] / GRATE.size);
        col.push(0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85);
      }
      deck.add(soup(pos, uv, col, [0, 1, 0]), 0, { keepColor: true });
    }
    const plate = (sa, sb, w) => {
      const ss = samples(sa, sb, 2);
      for (let i = 0; i < ss.length - 1; i++) {
        at((ss[i] + ss[i + 1]) / 2);
        const ya = dy(ss[i]), yb = dy(ss[i + 1]);
        const A = W(ss[i], -w, ya), Bp = W(ss[i], w, ya), C = W(ss[i + 1], w, yb), D = W(ss[i + 1], -w, yb);
        const u = (p) => [p[0] / GRATE.size, p[2] / GRATE.size];
        deck.add(soup([...A, ...Bp, ...C, ...A, ...C, ...D], [...u(A), ...u(Bp), ...u(C), ...u(A), ...u(C), ...u(D)], new Array(18).fill(0.82), [0, 1, 0]), 0, { keepColor: true });
      }
    };
    plate(-1.4, deckFrom, RAIL + 0.05);
    plate(sF0, sEnd, 2.6);
    // stairs: steel treads whose centres sit on the walking line, stringers, landings at both ends
    for (const q of stairs) {
      const rise0 = Math.abs(q.y1 - q.y0), n = Math.max(2, Math.round(rise0 / 0.18)), g = (q.s1 - q.s0) / n, rs = (q.y1 - q.y0) / n;
      for (let i = 0; i < n - 1; i++) {
        const sc = q.s0 + (i + 1) * g, yt = q.y0 + (i + 1) * rs, F = frameAt(sc);
        at(sc);
        props.add(new THREE.BoxGeometry(2 * LANE_EDGE + 0.1, 0.05, g + 0.04), STEEL_D, F.o(0, 0, yt - 0.025));
        props.add(new THREE.BoxGeometry(2 * LANE_EDGE + 0.1, 0.03, 0.05), 0x8f877a, F.o(-g / 2 * Math.sign(rs), 0, yt - 0.005));
        props.add(new THREE.BoxGeometry(2 * LANE_EDGE, 0.08, 0.05), IRON, F.o(g / 2 * Math.sign(rs), 0, yt - 0.09));
      }
      for (const side of [-1, 1]) {
        const ss = samples(q.s0, q.s1, 1);
        for (let i = 0; i < ss.length - 1; i++) {
          at((ss[i] + ss[i + 1]) / 2);
          const a = W(ss[i], side * (LANE_EDGE + 0.1), dy(ss[i]) - 0.15), b = W(ss[i + 1], side * (LANE_EDGE + 0.1), dy(ss[i + 1]) - 0.15);
          props.bar(a, b, 0.08, 0.32, IRON2);
        }
      }
    }
  }

  // stringers, toe plates, railings, posts, rivets, cross beams (all following deckAt)
  {
    const lineFor = (side, lat, a, b) => {
      const pts = [];
      for (const s of samples(a, b, 3)) {
        const c = corners.find((q) => s > q.s0 + 1e-3 && s < q.s1 - 1e-3);
        if (c && side === -c.inner) { if (!pts.some((p) => p.c === c)) { const m = miter(c, side * lat); pts.push({ x: m[0], z: m[1], s: c.sc, y: dy(c.sc), c }); } continue; }
        const w = W(s, side * lat, 0); pts.push({ x: w[0], z: w[2], s, y: dy(s) });
      }
      return pts;
    };
    const tube = (pts, dyy, r, col, seg = 6) => {
      for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; at((a.s + b.s) / 2); props.link([a.x, a.y + dyy, a.z], [b.x, b.y + dyy, b.z], r, r, col, seg); }
    };
    const ribbonV = (pts, d0, d1, col, out) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]; at((a.s + b.s) / 2);
        const nx = -(b.z - a.z), nz = b.x - a.x;
        props.add(soup([a.x, a.y + d0, a.z, b.x, b.y + d0, b.z, b.x, b.y + d1, b.z, a.x, a.y + d0, a.z, b.x, b.y + d1, b.z, a.x, a.y + d1, a.z], null, null, [nx * out, 0, nz * out]), col);
      }
    };
    const ribbonH = (ptsA, ptsB, dyy, col) => {
      for (let i = 0; i < Math.min(ptsA.length, ptsB.length) - 1; i++) {
        const a = ptsA[i], b = ptsA[i + 1], c = ptsB[i + 1], d = ptsB[i]; at((a.s + b.s) / 2);
        props.add(soup([a.x, a.y + dyy, a.z, b.x, b.y + dyy, b.z, c.x, c.y + dyy, c.z, a.x, a.y + dyy, a.z, c.x, c.y + dyy, c.z, d.x, d.y + dyy, d.z], null, null, [0, 1, 0]), col);
      }
    };
    for (const side of [-1, 1]) {
      const flat = minus([[deckFrom, sF0]], stairCuts);
      for (const [a, b] of flat) {
        const inner = lineFor(side, LANE_EDGE, a, b), outer = lineFor(side, RAIL + 0.06, a, b);
        ribbonH(inner, outer, 0.004, STEEL_D);
        ribbonV(outer, -0.32, 0.13, IRON2, side);
        ribbonV(lineFor(side, RAIL - 0.02, a, b), -0.3, 0, IRON, -side);
      }
      const railL = lineFor(side, RAIL, deckFrom, sF0);
      tube(railL, 1.05, 0.026, STEEL);
      tube(railL, 0.56, 0.02, STEEL);
      let acc = 0.8;
      for (let i = 0; i < railL.length - 1; i++) {
        const a = railL[i], b = railL[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
        if (a.c) { at(a.s); props.cyl(0.028, 0.028, 1.08, 6, STEEL, a.x, a.y + 0.54, a.z); props.sph(0.045, 6, 4, STEEL, a.x, a.y + 1.08, a.z); }
        while (acc < len) {
          const t = acc / len, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, s = a.s + (b.s - a.s) * t, y = a.y + (b.y - a.y) * t;
          at(s);
          props.cyl(0.026, 0.026, 1.08, 6, STEEL, x, y + 0.54, z);
          props.sph(0.042, 6, 4, STEEL, x, y + 1.08, z);
          acc += 1.6;
        }
        acc -= len;
      }
      if (!low) for (let s = deckFrom + 0.2; s < sF0; s += 0.45) {
        if (inCorner(s, 0.3) || onStairs(s, 0.2)) continue;
        at(s);
        const y = dy(s) - 0.05, w = W(s, side * (RAIL + 0.07), y);
        props.add(new THREE.OctahedronGeometry(0.02, 0), IRON2, { x: w[0], y, z: w[2] });
      }
    }
    for (let s = deckFrom + 1.25; s < sF0; s += 2.5) {
      if (inCorner(s, 0.5) || onStairs(s, 0.3)) continue;
      const F = frameAt(s); at(s);
      props.box(2 * RAIL + 0.1, 0.2, 0.09, IRON, ...F.p(0, 0, dy(s) - 0.13), { ry: F.yaw });
    }
    // gallery only: pipe rack under the catwalk + cast-iron columns from the hall floor
    const vr = secRange('varna') || [0, 0];
    const ssv = samples(Math.max(deckFrom, vr[0]), Math.min(sF0, vr[1]), 4);
    for (let i = 0; i < ssv.length - 1; i++) {
      const sa = ssv[i], sb = ssv[i + 1]; at((sa + sb) / 2);
      if (regionAt(...W(sa).filter((_, k) => k !== 1)) !== 'varna') continue;
      props.link(W(sa, -1.68, dy(sa) - 0.62), W(sb, -1.68, dy(sb) - 0.62), 0.14, 0.14, 0xb8ae98, 8);
      props.link(W(sa, 1.62, dy(sa) - 0.55), W(sb, 1.62, dy(sb) - 0.55), 0.08, 0.08, IRON2, 8);
    }
    for (let s = Math.max(4, vr[0] + 4); s < vr[1] - 2; s += 5.5) {
      if (inCorner(s, 3)) continue;
      for (const side of [-1, 1]) {
        const [x, , z] = W(s, side * 1.98, 0);
        if (regionAt(x, z) !== 'varna' || !inR(VR, x, z, -0.4) || KET.some(([kx, kz]) => Math.hypot(kx - x, kz - z) < KR + 0.7)) continue;
        at(s);
        const y0 = VF.prizemi, top = VCEIL;
        props.box(0.6, 0.35, 0.6, IRON2, x, y0 + 0.17, z);
        props.cyl(0.15, 0.18, top - y0 - 0.6, 12, COLUMN, x, (top + y0) / 2, z);
        for (const y of [y0 + 1.1, VF.p1, dy(s) - 0.35]) props.cyl(0.2, 0.2, 0.1, 12, COLUMN2, x, y, z);
        props.cyl(0.34, 0.17, 0.4, 10, COLUMN, x, top - 0.25, z);
        const b = W(s, side * 1.66, dy(s) - 0.2);
        props.box(0.12, 0.26, 0.5, IRON, b[0], b[1], b[2], { ry: Math.atan2(fr(s).rx, fr(s).rz) });
      }
    }
  }

  // finish platform + start landing railings
  {
    const box3 = (sa, sb, w) => {
      const Y = dy(sb);
      for (const side of [-1, 1]) {
        const a = W(sa, side * w, 0), b = W(sb, side * w, 0); at((sa + sb) / 2);
        props.link([a[0], Y + 1.05, a[2]], [b[0], Y + 1.05, b[2]], 0.026, 0.026, STEEL, 6);
        props.link([a[0], Y + 0.56, a[2]], [b[0], Y + 0.56, b[2]], 0.02, 0.02, STEEL, 6);
        for (let s = sa; s <= sb + 0.01; s += 1.6) { const p = W(s, side * w, Y + 0.54); at(s); props.cyl(0.026, 0.026, 1.08, 6, STEEL, p[0], p[1], p[2]); props.sph(0.042, 6, 4, STEEL, p[0], Y + 1.08, p[2]); }
        const F = frameAt((sa + sb) / 2, side * (w + 0.05));
        props.box(0.1, 0.45, sb - sa, IRON2, ...F.p(0, 0, Y - 0.1), { ry: F.yaw });
      }
      at(sa);
      for (const side of [-1, 1]) {
        const a = W(sa, side * RAIL, 0), b = W(sa, side * w, 0);
        props.link([a[0], Y + 1.05, a[2]], [b[0], Y + 1.05, b[2]], 0.026, 0.026, STEEL, 6);
        props.link([a[0], Y + 0.56, a[2]], [b[0], Y + 0.56, b[2]], 0.02, 0.02, STEEL, 6);
      }
      // legs down to the floor below
      for (const s of [sa + 0.3, sb - 0.3]) for (const side of [-1, 1]) { const p = W(s, side * (w - 0.1), 0), yb = belowAt(p[0], p[2]); at(s); props.box(0.1, Y - yb, 0.1, IRON, p[0], (Y + yb) / 2, p[2]); }
    };
    box3(sF0, sEnd, 2.65);
    // start: rails back to the east wall
    {
      const Y = dy(0), sa = -1.4;
      at(1);
      for (const side of [-1, 1]) {
        const a = W(sa, side * RAIL, 0), b = W(0, side * RAIL, 0);
        props.link([a[0], Y + 1.05, a[2]], [b[0], Y + 1.05, b[2]], 0.026, 0.026, STEEL, 6);
        props.link([a[0], Y + 0.56, a[2]], [b[0], Y + 0.56, b[2]], 0.02, 0.02, STEEL, 6);
      }
      // door leaf (open, against the reveal) in the wall behind the start
      const F = frameAt(-1.6);
      props.add(new THREE.BoxGeometry(1.0, 2.3, 0.06), WOOD2, F.o(0.15, -1.25, Y + 1.15, { ry: Math.PI / 2 }));
    }
  }

  // ------------------------------------------------------------------ route lamps (the lit path) + section plates
  {
    const list = [];
    for (let s = 4; s < sF0; s += 9) list.push(s);
    for (const h of hazards) if (!list.some((q) => Math.abs(q - (h.s - 1.6)) < 3.5)) list.push(h.s - 1.6);
    list.push(finishS + 1.5);
    list.sort((a, b) => a - b);
    let alt = 1;
    for (const s of list) {
      if (inCorner(s, 1.0) || s < 0 || s > L) continue;
      const reg = regionAt(...W(s).filter((_, k) => k !== 1));
      if (reg === 'bridge' || reg === 'tower') continue; // own lamps
      alt = -alt;
      const [x, , z] = W(s, alt * 0.43, 0), top = ceilAt(x, z), y = Math.min(top - 0.3, dy(s) + 3.0);
      at(s);
      pendant(x, y, z, top, { big: 0.8 });
      catLamps.push({ s, x, y: y - 0.1, z });
    }
    const PLATE = { varna: DECALS4.varna, tower: DECALS4.tower, bridge: DECALS4.bridge, cellarTower: DECALS4.cellarTower, cool: DECALS4.cool };
    for (const sec of sections) {
      const rect = PLATE[sec.id]; if (!rect) continue;
      const s = Math.min(sec.to - 1, sec.from + (sec.from < 1 ? 6 : 1.2));
      if (onStairs(s, 0.5)) continue;
      const F = frameAt(s), [x, , z] = W(s), top = ceilAt(x, z), y = Math.min(top - 0.32, dy(s) + 2.75);
      at(s);
      decal(rect, 1.6, 0.4, F.p(0, 0, y), qYaw(F.yaw + Math.PI));
      decal(rect, 1.6, 0.4, F.p(0.03, 0, y), qYaw(F.yaw));
      props.box(1.68, 0.46, 0.02, IRON, ...F.p(0.015, 0, y), { ry: F.yaw });
      for (const sx of [-0.7, 0.7]) props.link(F.p(0, sx, y + 0.22), F.p(0, sx, top), 0.008, 0.008, 0x1a1a1a, 3);
    }
    // enamel signs on the gallery walls
    decal(DECALS4.smoke, 2.0, 0.5, [VR.x0 + 6, VF.p2 + 2.0, VR.z0 + 0.02], qYaw(0));
    decal(DECALS4.steam, 2.0, 0.5, [VR.x1 - 0.02, VF.p2 + 2.0, (VR.z0 + VR.z1) / 2 + 3], qYaw(-Math.PI / 2));
    decal(DECALS4.board, 1.2, 0.6, [CR.x1 - 0.03, BR.floor + 1.5, CR.z0 + 6], qYaw(-Math.PI / 2));
  }

  // ------------------------------------------------------------------ hazards: static parts + dynamic pools
  const steamJets = [], drips = [], falls = [];
  const firstSteam = new Set();
  for (const h of hazards) {
    const F = frameAt(h.s); at(h.s);
    const D = dy(h.s);
    const laneLat = (l) => l * LW;
    const lanes = h.lanes || [0];
    const lo = Math.min(...lanes), hi = Math.max(...lanes);
    const [cx0, , cz0] = W(h.s), reg = regionAt(cx0, cz0), below = belowAt(cx0, cz0), ceilY = ceilAt(cx0, cz0);
    const under = Math.max(0.3, D - below - 0.05);
    if (h.type === 'hole') {
      const [s0, s1] = holeSpan(h);
      for (const l of lanes) {
        const lat0 = (l - 0.5) * LW, lat1 = (l + 0.5) * LW;
        for (const [sa, sb] of [[s0 - 0.16, s0 - 0.01], [s1 + 0.01, s1 + 0.16]]) {
          const A = W(sa, lat0 + 0.03, dy(sa) + 0.006), Bp = W(sa, lat1 - 0.03, dy(sa) + 0.006), C = W(sb, lat1 - 0.03, dy(sb) + 0.006), Dd = W(sb, lat0 + 0.03, dy(sb) + 0.006);
          props.add(soup([...A, ...Bp, ...C, ...A, ...C, ...Dd], null, null, [0, 1, 0]), 0xb2442a);
        }
        if (reg !== 'bridge') {
          const yv = D - Math.min(0.45, under * 0.6);
          const A = W(s0 - 0.3, lat0 - 0.2, yv), Bp = W(s0 - 0.3, lat1 + 0.2, yv), C = W(s1 + 0.3, lat1 + 0.2, yv), Dd = W(s1 + 0.3, lat0 - 0.2, yv);
          voids.add(soup([...A, ...Bp, ...C, ...A, ...C, ...Dd], null, null, [0, 1, 0]), 0, {});
        }
        for (const [se, dir] of [[s0, 1], [s1, -1]]) {
          const Fe = frameAt(se), De = dy(se);
          const RR = rng(Math.round(h.s * 10) + l * 7 + (dir > 0 ? 0 : 3));
          for (let i = 0; i < 3; i++) {
            const w = (LW - 0.06) / 3 * (0.6 + RR() * 0.35), lc = lat0 + 0.03 + (i + 0.5) * (LW - 0.06) / 3 + (RR() - 0.5) * 0.04;
            const len = 0.1 + RR() * 0.2, ang = 0.4 + RR() * 0.9;
            props.add(new THREE.BoxGeometry(w, 0.014, len), 0x4f4a43, Fe.o(dir * Math.cos(ang) * len / 2, lc, De - 0.01 - Math.sin(ang) * len / 2, { rx: dir * ang }));
          }
          props.add(new THREE.BoxGeometry(LW - 0.04, 0.035, 0.025), 0x8f877a, Fe.o(0, (lat0 + lat1) / 2, De - 0.017));
        }
      }
      continue;
    }
    if (h.type === 'steam') {
      for (const l of lanes) {
        const lat = laneLat(l), [x, , z] = W(h.s, lat, 0);
        props.add(new THREE.TorusGeometry(0.27, 0.035, 4, 16), RED_LEAD, { x, y: D + 0.02, z, rx: Math.PI / 2 });
        props.add(new THREE.RingGeometry(0.12, 0.25, 14), 0x15110e, { x, y: D + 0.008, z, rx: -Math.PI / 2 });
        props.cyl(0.11, 0.13, 0.18, 10, IRON2, x, D - 0.12, z);
        const rl = Math.min(1.4, under);
        props.cyl(0.08, 0.08, rl, 8, IRON, x, D - 0.2 - rl / 2, z);
        if (under > 1.1) {
          props.cyl(0.14, 0.14, 0.2, 8, IRON2, x, D - 1.0, z);
          props.add(new THREE.TorusGeometry(0.16, 0.025, 4, 12), RED_WHEEL, { ...F.o(0.2, lat, D - 1.0, { rx: 0 }) });
        }
        props.link([x, D - Math.min(1.6, under), z], W(h.s, lat < 0 ? -1.62 : 1.6, D - Math.min(0.62, under)), 0.07, 0.07, IRON, 6);
        steamJets.push({ h, x, z, lane: l, D });
      }
      if (!firstSteam.has(secAt(h.s))) {
        firstSteam.add(secAt(h.s));
        const side = lanes.includes(1) && !lanes.includes(-1) ? -1 : 1, p = W(h.s - 3, side * (RAIL + 0.04), dy(h.s - 3) + 0.8);
        decal(DECALS4.steam, 0.9, 0.23, p, qYaw(F.yaw + Math.PI));
      }
      continue;
    }
    if (h.type === 'drip') {
      const yP = Math.min(ceilY - 0.14, D + 3.0);
      if (!drips.some((d) => Math.abs(d.h.s - h.s) < 0.6)) {
        const a = W(h.s, -RAIL - 0.5, yP), b = W(h.s, RAIL + 0.5, yP);
        props.link(a, b, 0.1, 0.1, 0x4a3f36, 10);
        for (const l of [-RAIL - 0.3, RAIL + 0.3]) { const p = W(h.s, l, 0); props.link([p[0], yP + 0.1, p[2]], [p[0], ceilAt(p[0], p[2]), p[2]], 0.015, 0.015, IRON, 4); }
        for (const l of [-RAIL - 0.5, RAIL + 0.5]) { const p = W(h.s, l, yP); props.link(p, [p[0], below + 0.3, p[2]], 0.1, 0.1, 0x4a3f36, 8); }
      }
      for (const l of lanes) {
        const lat = laneLat(l), [x, , z] = W(h.s, lat, 0);
        props.add(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12), RED_LEAD, { ...F.o(0, lat, yP, { rz: Math.PI / 2 }) });
        for (const o of [-0.1, 0.1]) props.add(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 10), IRON2, { ...F.o(0, lat + o, yP, { rz: Math.PI / 2 }) });
        props.add(new THREE.ConeGeometry(0.025, 0.12, 6), 0x6a3a1c, { x, y: yP - 0.16, z, rx: Math.PI });
        stain.add(new THREE.CircleGeometry(0.3, 14), 0, { x, y: D + 0.008, z, rx: -Math.PI / 2, sx: 1, sy: 1.3 });
        stain.add(new THREE.CircleGeometry(0.14, 10), 0, { x: x + 0.12, y: D + 0.009, z: z - 0.1, rx: -Math.PI / 2 });
        drips.push({ h, x, z, yTop: yP - 0.2, lane: l, D });
      }
      continue;
    }
    if (h.type === 'fall') {
      const yR = ceilY - 0.2;
      const kind = yR - D > 3.3 ? 'sack' : 'crate';
      const w = 2 * RAIL + 1.2;
      for (const o of [-0.08, 0.08]) props.add(new THREE.BoxGeometry(w, 0.26, 0.03), BEAM, F.o(o, 0, yR - 0.13));
      props.add(new THREE.BoxGeometry(w, 0.03, 0.22), BEAM, F.o(0, 0, yR - 0.26));
      for (const l of lanes) {
        const lat = laneLat(l), [x, , z] = W(h.s, lat, 0);
        props.add(new THREE.BoxGeometry(0.34, 0.16, 0.42), RED_LEAD, F.o(0, lat, yR - 0.36));
        props.add(new THREE.CylinderGeometry(0.13, 0.13, 0.1, 12), IRON2, F.o(0, lat, yR - 0.52, { rz: Math.PI / 2 }));
        const hangBottom = kind === 'sack' ? Math.max(D + 2.1, Math.min(D + 3.3, yR - 1.65)) : Math.max(D + 1.95, Math.min(D + 3.3, yR - 1.25));
        const yHook = kind === 'sack' ? hangBottom + 1.02 : hangBottom + BLOCK_HEIGHT + 0.45;
        for (const o of [-0.07, 0.07]) props.link([x + fr(h.s).tx * o, yR - 0.55, z + fr(h.s).tz * o], [x, yHook + 0.2, z], 0.014, 0.014, 0x55524c, 4);
        props.add(new THREE.TorusGeometry(0.09, 0.022, 4, 10, Math.PI * 1.4), STEEL, { ...F.o(0, lat, yHook + 0.1, { rz: 0.5 }) });
        props.box(0.12, 0.16, 0.08, RED_LEAD, x, yHook + 0.26, z);
        if (kind === 'crate') for (const [da, dl] of [[-0.4, -0.33], [0.4, -0.33], [-0.4, 0.33], [0.4, 0.33]]) {
          const p = F.p(da, lat + dl, hangBottom + BLOCK_HEIGHT + 0.02);
          props.link([x, yHook + 0.05, z], p, 0.01, 0.01, 0xa58c5c, 3);
        }
        falls.push({ h, x, z, yaw: F.yaw, kind, lane: l, yHook, hangBottom, D });
      }
      continue;
    }
    if (h.type === 'pipe') {
      const r = 0.11, yC = D + (h.height ?? 0.45) - r;
      const full = lo === -1 && hi === 1;
      const la = full ? -RAIL - 0.35 : (lo - 0.5) * LW + 0.05, lb = full ? RAIL + 0.35 : (hi + 0.5) * LW - 0.05;
      props.link(W(h.s, la, yC), W(h.s, lb, yC), r, r, RED_LEAD, 12);
      for (const l of lanes) if (l !== 0) props.add(new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.32, 12), CREAM, F.o(0, l * LW, yC, { rz: Math.PI / 2 }));
      for (const l of [la + 0.05, lb - 0.05]) props.add(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.07, 12), IRON2, F.o(0, l, yC, { rz: Math.PI / 2 }));
      for (const l of [-0.5, 0.5]) if (l * LW > la && l * LW < lb) props.box(0.1, yC - D, 0.22, IRON, ...F.p(0, l * LW, D + (yC - D) / 2), { ry: F.yaw });
      for (const l of [la, lb]) { const p = W(h.s, l, 0); props.link([p[0], yC, p[2]], [p[0], D - Math.min(1.4, under), p[2]], r, r, RED_LEAD, 10); props.sph(r * 1.05, 8, 6, RED_LEAD, p[0], yC, p[2]); }
      continue;
    }
  }

  // ------------------------------------------------------------------ finish: the main steam valve platform
  const finish = {};
  {
    const sv = L - 0.9, F = frameAt(sv); at(sv);
    const DY = dy(sv);
    const c = F.p(0, 0, 0), top = ceilAt(c[0], c[2]), bot = belowAt(c[0], c[2]);
    props.cyl(0.26, 0.26, top - bot, 14, IRON, c[0], (top + bot) / 2, c[2]);
    for (const y of [bot + 0.3, DY - 0.3, DY + 2.2]) props.cyl(0.36, 0.36, 0.12, 14, IRON2, c[0], y, c[2]);
    props.add(new THREE.SphereGeometry(0.5, 16, 10), IRON2, { x: c[0], y: DY + 1.2, z: c[2] });
    props.cyl(0.42, 0.42, 0.14, 16, IRON2, c[0], DY + 1.2 + 0.45, c[2]);
    props.cyl(0.42, 0.42, 0.14, 16, IRON2, c[0], DY + 1.2 - 0.45, c[2]);
    const sp = F.p(-0.8, 0, DY + 1.25);
    props.link([c[0], DY + 1.25, c[2]], sp, 0.12, 0.12, IRON2, 12);
    metal.link(sp, F.p(-1.25, 0, DY + 1.25), 0.04, 0.04, 0x9a9c9e, 8);
    for (const sx of [-1, 1]) {
      const e = F.p(0, sx * 2.6, DY + 1.2), et = ceilAt(e[0], e[2]);
      props.link([c[0], DY + 1.2, c[2]], e, 0.17, 0.17, LAGGING, 12);
      props.link(e, [e[0], et, e[2]], 0.17, 0.17, LAGGING, 12);
      props.add(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 12), IRON2, F.o(0, sx * 1.2, DY + 1.2, { rz: Math.PI / 2 }));
    }
    const wb = new Batch();
    wb.add(new THREE.TorusGeometry(0.7, 0.055, 8, 32), RED_WHEEL);
    for (let i = 0; i < 6; i++) wb.add(new THREE.BoxGeometry(0.05, 1.36, 0.05), RED_WHEEL, { rz: (i / 6) * Math.PI });
    wb.add(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 12), IRON2, { rx: Math.PI / 2 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; wb.add(new THREE.SphereGeometry(0.07, 6, 4), RED_WHEEL, { x: Math.cos(a) * 0.7, y: Math.sin(a) * 0.7, sx: 0.8, sy: 0.8 }); }
    const wheel = wb.mesh(M.props);
    const wp = F.p(-1.2, 0, DY + 1.25);
    wheel.position.set(wp[0], wp[1], wp[2]); wheel.rotation.set(0, F.yaw, 0, 'YXZ');
    wheel.userData.dynamic = true; root.add(wheel);
    finish.wheel = wheel; finish.spin = 0;
    const gp = F.p(-0.9, 1.6, DY + 2.0), gq = qYaw(F.yaw + Math.PI);
    metal.add(new THREE.TorusGeometry(0.42, 0.05, 6, 28), BRASS, { x: gp[0], y: gp[1], z: gp[2], q: gq });
    metal.add(new THREE.CylinderGeometry(0.43, 0.43, 0.12, 28), BRASS, { x: gp[0], y: gp[1], z: gp[2], q: gq.clone().multiply(new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2, 0, 0))) });
    decal(DECALS4.gauge, 0.8, 0.8, F.p(-0.97, 1.6, DY + 2.0), gq);
    props.link(F.p(-0.9, 1.6, DY + 1.55), F.p(-0.4, 0.4, DY + 1.25), 0.03, 0.03, 0x8a6a3a, 6);
    props.link(F.p(-0.85, 1.6, bot), F.p(-0.85, 1.6, DY + 1.6), 0.05, 0.05, IRON, 6);
    const ng = mergeGeometries([
      new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.02, 0), new THREE.Vector2(0.02, 0), new THREE.Vector2(0.004, 0.33), new THREE.Vector2(-0.004, 0.33)])),
      new THREE.CircleGeometry(0.04, 10),
    ].map((x) => { x.deleteAttribute('uv'); x.deleteAttribute('normal'); return x; }));
    const needle = new THREE.Mesh(ng, new THREE.MeshBasicMaterial({ color: 0x1a1612 }));
    const np = F.p(-1.0, 1.6, DY + 2.0);
    needle.position.set(np[0], np[1], np[2]); needle.quaternion.copy(gq); needle.userData.dynamic = true;
    root.add(needle);
    finish.needle = needle; finish.gq = gq.clone();
    const bp = F.p(-0.5, -1.7, DY + 2.3);
    props.box(0.1, 0.1, 0.9, IRON, ...F.p(-0.1, -1.7, DY + 2.75), { ry: F.yaw });
    props.link(F.p(0.3, -1.7, DY + 2.75), F.p(0.3, -1.7, DY), 0.04, 0.04, IRON, 6);
    metal.add(new THREE.LatheGeometry([[0.02, 0.36], [0.12, 0.34], [0.17, 0.2], [0.2, 0.02], [0.26, -0.06], [0.25, -0.08]].map(([a, b]) => new THREE.Vector2(a, b)), 20), BRASS, { x: bp[0], y: bp[1] + 0.06, z: bp[2] });
    metal.sph(0.05, 8, 6, BRASS, bp[0], bp[1] - 0.12, bp[2]);
    props.link(bp, [bp[0], DY + 1.3, bp[2]], 0.008, 0.008, 0xa58c5c, 3);
    const vy = Math.min(top - 0.35, DY + 2.85);
    decal(DECALS4.valve, 1.8, 0.45, F.p(-0.6, 0, vy), qYaw(F.yaw + Math.PI));
    props.box(1.9, 0.52, 0.04, IRON, ...F.p(-0.55, 0, vy), { ry: F.yaw });
    for (const sx of [-1.5, 1.5]) { const p = F.p(-0.6, sx, Math.min(top - 0.3, DY + 3.0)); pendant(p[0], p[1], p[2], top, { big: 1.0 }); catLamps.push({ s: sv - 0.6, x: p[0], y: p[1], z: p[2] }); }
    decal(DECALS4.board, 1.2, 0.6, F.p(-0.3, 2.6, DY + 1.4), qYaw(F.yaw + Math.PI));
  }

  // ------------------------------------------------------------------ assemble static chunks
  const meshes = [];
  // visibility windows (runner s) of the building shells: from where they first show until they are behind for good
  const sr = (id, i, def) => secRange(id)?.[i] ?? def;
  const GROUP_VIS = {
    varna: [-10, sr('bridge', 0, 60) + 2],
    tower: [sr('tower', 0, 50) - 25, sr('bridge', 1, 80)],
    bridge: [sr('tower', 0, 50) - 6, sr('cellarTower', 0, 80) + 10],
    ctower: [sr('bridge', 0, 58) - 2, sr('cool', 0, 103) + 14],
    cool: [sr('cool', 0, 103) - 22, L + 10],
  };
  for (const [k, c] of [...chunks.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    for (const [name, batch] of Object.entries(c)) {
      const m = batch.mesh(M[name]);
      if (!m) continue;
      m.name = `chunk${k}-${name}`;
      m.userData.chunk = k;
      if (typeof k === 'string') m.userData.vis = GROUP_VIS[k] || [-1e9, 1e9];
      if (ORDER[name]) m.renderOrder = ORDER[name];
      root.add(m); meshes.push(m);
    }
  }
  // the outside: visible only around the bridge
  {
    const m = outB.mesh(M.out);
    if (m) {
      const br = secRange('bridge') || [sOf(BR.x, BR.z0), sOf(BR.x, BR.z1)];
      m.name = 'outside'; m.userData.vis = [br[0] - 4, br[1] + 1.0]; m.frustumCulled = true;
      root.add(m); meshes.push(m);
    }
  }
  // dynamic pieces that belong to a place (pendulum, rake): cull like their chunk
  const placed = [];
  for (const d of dyn) placed.push(d.mesh);
  if (clock.pend) placed.push(clock.pend);

  // ------------------------------------------------------------------ dynamic: lamp halos
  const haloMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowPatch(new THREE.MeshBasicMaterial({ map: T.pool, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), Math.max(1, halos.length));
  haloMesh.frustumCulled = false; haloMesh.renderOrder = 4; haloMesh.userData.dynamic = true;
  halos.forEach((hl, i) => haloMesh.setColorAt(i, _c.setRGB(...hl.col)));
  root.add(haloMesh);

  // ------------------------------------------------------------------ dynamic: steam (particles + jet cores)
  const parts = createParticles(root, T.puff, low ? 300 : 520);
  const jetGeo = new THREE.CylinderGeometry(0.45, 0.09, 2.5, 12, 1, true); jetGeo.translate(0, 1.25, 0);
  const jetMat = glowPatch(new THREE.MeshBasicMaterial({ map: T.jet, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0.9);
  const jets = new THREE.InstancedMesh(jetGeo, jetMat, Math.max(1, steamJets.length));
  jets.frustumCulled = false; jets.renderOrder = 5; jets.userData.dynamic = true;
  for (let i = 0; i < jets.count; i++) { jets.setMatrixAt(i, _m.makeScale(0, 0, 0)); jets.setColorAt(i, _c.setRGB(0, 0, 0)); }
  root.add(jets);
  steamJets.forEach((j) => { j.acc = 0; });

  // ------------------------------------------------------------------ dynamic: drips
  const nd = Math.max(1, drips.length);
  const dropMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.7, 0.7) }), nd);
  const dropHalo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowPatch(new THREE.MeshBasicMaterial({ map: T.pool, color: new THREE.Color(0.9, 0.55, 0.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), nd);
  const ringGeo = new THREE.RingGeometry(0.75, 1, 20); ringGeo.rotateX(-Math.PI / 2);
  const splash = new THREE.InstancedMesh(ringGeo, glowPatch(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), nd);
  for (const m of [dropMesh, dropHalo, splash]) {
    m.frustumCulled = false; m.userData.dynamic = true; m.renderOrder = 5;
    for (let i = 0; i < nd; i++) { m.setMatrixAt(i, _m.makeScale(0, 0, 0)); if (m !== dropMesh) m.setColorAt(i, _c.setRGB(1, 1, 1)); }
    root.add(m);
  }
  drips.forEach((d) => { d.lastSplash = false; });

  // ------------------------------------------------------------------ dynamic: falling sacks / crates
  const sackFalls = falls.filter((f) => f.kind === 'sack'), crateFalls = falls.filter((f) => f.kind === 'crate');
  const sackMesh = new THREE.InstancedMesh(sackGeo(5), M.atlas, Math.max(1, sackFalls.length));
  const crateMesh = new THREE.InstancedMesh(crateGeo(), M.atlas, Math.max(1, crateFalls.length));
  for (const [m, list] of [[sackMesh, sackFalls], [crateMesh, crateFalls]]) {
    m.frustumCulled = false; m.userData.dynamic = true;
    for (let i = 0; i < m.count; i++) { m.setMatrixAt(i, _m.makeScale(0, 0, 0)); m.setColorAt(i, _c.set(list.length ? SACK[i % 4] : 0xffffff)); }
    root.add(m);
  }

  // ------------------------------------------------------------------ real lights (≤ 4: 3 hopping lamp spots + the cold day light)
  const lampLights = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.SpotLight(0xffcf96, 0, 22, 1.2, 0.45, 2);
    l.userData.dynamic = true; l.target.userData.dynamic = true;
    root.add(l, l.target);
    lampLights.push({ light: l, lamp: -1, fade: 0 });
  }
  catLamps.sort((a, b) => a.s - b.s);
  const day = new THREE.DirectionalLight(0xa6b9cc, 0.42);
  day.position.set(-LIGHT.x * 20, -LIGHT.y * 20, -LIGHT.z * 20); day.target.position.set(0, 0, 0);
  root.add(day, day.target);
  const LAMP_I = 80;
  const bounce = new THREE.HemisphereLight(0x9a8a74, 0x2c2219, 0.42);
  root.add(bounce);
  const DAY_K = { varna: 0.42, tower: 0.4, bridge: 0.95, cellarTower: 0.45, cool: 0.62 };

  // ------------------------------------------------------------------ debug camera / clock
  const dbg = {};
  {
    const cam = params.get('artcam');
    if (cam) {
      const v = cam.split(',').map(Number);
      dbg.cam = v;
      dbg.s = v.length < 6 ? v[0] : sOf(v[3], v[5]);
      const look = THREE.Object3D.prototype.lookAt;
      const apply = () => {
        if (v.length >= 6) { camera.position.set(v[0], v[1], v[2]); look.call(camera, v[3], v[4], v[5]); }
        else {
          const [s, lat = 0, h = run.eyeHeight, ahead = 7] = v;
          const p = W(s, lat, dy(s) + h), q = W(s + ahead, lat * 0.6, dy(s + ahead) + h - 0.35);
          camera.position.set(p[0], p[1], p[2]); look.call(camera, q[0], q[1], q[2]);
        }
      };
      camera.lookAt = apply;
      apply();
    }
    if (params.has('artt')) dbg.t = Number(params.get('artt'));
    if (params.get('artfall')) dbg.fall = 0;
    if (params.get('artcut')) { scene.fog = null; for (const m of meshes) if (/-ceil$/.test(m.name)) m.visible = false; }
  }

  const VIS_BACK = 22;
  const coolFrom = secRange('cool')?.[0] ?? L;
  const aheadFor = (s) => (s < coolFrom - 14 ? 46 : 120);
  const showAll = !!params.get('artcut') || params.get('cam') === 'orbit';
  for (const m of placed) m.userData.chunkS = m.userData.chunkS ?? sOf(m.position.x, m.position.z);

  // ------------------------------------------------------------------ update
  let wall0 = 0, lastRT = 0;
  const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  function update(dt, t, vis = {}) {
    wall0 += dt;
    const wallT = wall0;
    const rs = vis.runner;
    const sR = dbg.s ?? rs?.s ?? course.start ?? 0;
    const tr = dbg.t ?? vis.raceTime ?? 0;
    const dtr = Math.max(0, Math.min(0.1, tr - lastRT)); lastRT = tr;
    const playingDt = dbg.t != null ? dt : dtr > 0 ? dtr : 0;
    const pdt = vis.state === 'paused' ? 0 : dt;
    const cp = camera.position;

    // path-distance culling (the buildings wind around; other parts sit inside the frustum behind opaque walls)
    if (!showAll) {
      const ahead = aheadFor(sR);
      for (const m of meshes) {
        if (m.userData.vis) { m.visible = sR >= m.userData.vis[0] && sR <= m.userData.vis[1]; continue; }
        const k = m.userData.chunk; m.visible = (k + 1) * CH > sR - VIS_BACK && k * CH < sR + ahead;
      }
      for (const m of placed) m.visible = m.userData.chunkS > sR - VIS_BACK - 10 && m.userData.chunkS < sR + ahead;
    }
    for (const d of dyn) d.mesh.rotation.y += d.w * pdt;
    if (clock.pend) clock.pend.rotation.z = 0.12 * Math.sin(wallT * Math.PI / 1.4);
    const fl = 1.7 + 0.35 * Math.sin(wallT * 11.3) * Math.sin(wallT * 7.1 + 1.3) + 0.15 * Math.sin(wallT * 23.0);
    M.fire.color.setRGB(fl, fl, fl);
    // daylight strength by place (the bridge is bright, the gallery dim)
    const sec = secAt(sR);
    const want = DAY_K[sec] ?? 0.45;
    day.intensity += (want - day.intensity) * Math.min(1, dt * 1.5);

    camera.getWorldQuaternion(tmpQ);
    for (let i = 0; i < halos.length; i++) {
      const hl = halos[i];
      _m.compose(_p.set(hl.x, hl.y, hl.z), tmpQ, _s.setScalar(hl.size));
      haloMesh.setMatrixAt(i, _m);
    }
    haloMesh.instanceMatrix.needsUpdate = true;

    for (let k = 0; k < 3; k++) {
      const LL = lampLights[k];
      let best = -1;
      for (let i = k; i < catLamps.length; i += 3) if (catLamps[i].s > sR - 4) { best = i; break; }
      if (best !== LL.lamp) { LL.lamp = best; LL.fade = 0; if (best >= 0) { const lp = catLamps[best]; LL.light.position.set(lp.x, lp.y, lp.z); LL.light.target.position.set(lp.x, lp.y - 5, lp.z); } }
      LL.fade = Math.min(1, LL.fade + dt / 0.35);
      if (best < 0) { LL.light.intensity = 0; continue; }
      const d = catLamps[best].s - sR;
      const f = THREE.MathUtils.smoothstep(d, -4, -1) * (1 - THREE.MathUtils.smoothstep(d, 22, 32));
      LL.light.intensity = LAMP_I * f * LL.fade;
    }

    const near = (s) => s > sR - 12 && s < sR + 70;

    for (let i = 0; i < steamJets.length; i++) {
      const j = steamJets[i];
      if (!near(j.h.s)) { jets.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      const lvl = steamLevel(j.h, tr);
      const u = (((tr + j.h.phase) % j.h.period) + j.h.period) % j.h.period, pre = j.h.period - u;
      const flick = 0.92 + 0.08 * Math.sin(wallT * 37 + i * 3.1);
      const hgt = lvl >= 0.3 ? (0.55 + 0.45 * lvl) * flick : lvl * 1.2;
      _m.compose(_p.set(j.x, j.D + 0.02, j.z), tmpQ.identity(), _s.set(0.6 + 0.5 * lvl, Math.max(0.001, hgt), 0.6 + 0.5 * lvl));
      jets.setMatrixAt(i, _m);
      const br = lvl >= 0.3 ? 0.42 * lvl * flick : lvl * 0.9;
      jets.setColorAt(i, _c.setRGB(br, br * 0.97, br * 0.93));
      let rate = 0, up = 0, life = 0.7, sz = 0.6;
      if (lvl >= 0.3) { rate = 46 * lvl; up = 4.2; life = 0.75; sz = 0.95; }
      else if (lvl > 0) { rate = 26; up = 1.6; life = 0.55; sz = 0.45; }
      else if (u >= j.h.on && pre < 0.9) { rate = 7; up = 0.9; life = 0.7; sz = 0.35; }
      j.acc += rate * (playingDt || dt * (vis.state === 'menu' || vis.state === 'countdown' ? 1 : 0));
      while (j.acc >= 1) {
        j.acc -= 1;
        const a = Math.random() * 6.283, rr = Math.random() * 0.12;
        parts.emit({ x: j.x + Math.cos(a) * rr, y: j.D + 0.05, z: j.z + Math.sin(a) * rr, vx: Math.cos(a) * 0.5, vz: Math.sin(a) * 0.5, vy: up * (0.75 + Math.random() * 0.5),
          max: life * (0.8 + Math.random() * 0.4), s0: sz * 0.35, s1: sz * (1.6 + Math.random()), a: lvl >= 0.3 ? 0.55 : 0.4, drag: 1.4, r: 0.86, g: 0.83, b: 0.78, fadeIn: 0.08 });
      }
    }
    jets.instanceMatrix.needsUpdate = true; if (jets.instanceColor) jets.instanceColor.needsUpdate = true;

    for (let i = 0; i < drips.length; i++) {
      const d = drips[i];
      if (!near(d.h.s)) { dropMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); dropHalo.setMatrixAt(i, _m); splash.setMatrixAt(i, _m); continue; }
      const st = dripState(d.h, tr);
      let y, sc = 1, sy = 1;
      if (st.y01 != null && !st.active) { y = d.yTop - st.y01 * (d.yTop - d.D - 0.05); sy = 1.25 + st.y01 * 0.9; }
      else if (st.active) { y = null; }
      else { const f = st.forming; y = d.yTop + 0.06 - 0.05 * f; sc = 0.35 + 0.65 * f; sy = 1 + 0.4 * f; }
      if (y == null) { dropMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); dropHalo.setMatrixAt(i, _m); }
      else {
        dropMesh.setMatrixAt(i, _m.compose(_p.set(d.x, y, d.z), tmpQ.identity(), _s.set(sc, sc * sy, sc)));
        camera.getWorldQuaternion(tmpQ);
        dropHalo.setMatrixAt(i, _m.compose(_p.set(d.x, y, d.z), tmpQ, _s.setScalar(0.55 * sc)));
      }
      if (st.active) {
        const k = st.splash ?? 0;
        splash.setMatrixAt(i, _m.compose(_p.set(d.x, d.D + 0.03, d.z), tmpQ.identity(), _s.setScalar(0.12 + 0.5 * k)));
        splash.setColorAt(i, _c.setRGB(0.9 * (1 - k), 0.65 * (1 - k), 0.35 * (1 - k)));
        if (!d.lastSplash) {
          for (let q = 0; q < 6; q++) { const a = Math.random() * 6.283; parts.emit({ x: d.x, y: d.D + 0.05, z: d.z, vx: Math.cos(a) * 1.4, vz: Math.sin(a) * 1.4, vy: 1.6 + Math.random(), grav: 9, drag: 0.5, max: 0.35, s0: 0.05, s1: 0.04, a: 0.9, r: 1.0, g: 0.75, b: 0.45, floor: d.D, fadeIn: 0.01 }); }
          parts.emit({ x: d.x, y: d.D + 0.1, z: d.z, vy: 0.5, max: 0.8, s0: 0.2, s1: 0.7, a: 0.3, drag: 1 });
        }
      } else splash.setMatrixAt(i, _m.makeScale(0, 0, 0));
      d.lastSplash = !!st.active;
    }
    for (const m of [dropMesh, dropHalo, splash]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

    const trig = rs?.fallTriggers || {};
    const doFall = (list, mesh, sack) => {
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        const tt = dbg.fall != null ? dbg.fall : trig[f.h.id];
        const k = fallProgress(tt, tr);
        let y, rot = 0, spin = 0;
        const yHang = sack ? f.hangBottom + 0.45 : f.hangBottom + BLOCK_HEIGHT / 2;
        const yRest = f.D + BLOCK_HEIGHT / 2;
        if (k == null) { y = yHang; spin = 0.12 * Math.sin(wallT * 0.9 + i * 2); }
        else { y = yHang + (yRest - yHang) * k * k; rot = sack ? THREE.MathUtils.smoothstep(k, 0.45, 1) * Math.PI / 2 : 0; spin = (1 - k) * 0.12 * Math.sin(i * 2); }
        if (sack && k != null && k >= 1) y = yRest;
        tmpQ.setFromEuler(tmpE.set(0, f.yaw + spin, rot, 'YXZ'));
        mesh.setMatrixAt(i, _m.compose(_p.set(f.x, y, f.z), tmpQ, _s.set(1, 1, 1)));
        if (k != null && k >= 1 && !f.dust) { f.dust = true; for (let q = 0; q < 8; q++) { const a = Math.random() * 6.283; parts.emit({ x: f.x + Math.cos(a) * 0.4, y: f.D + 0.1, z: f.z + Math.sin(a) * 0.4, vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2, vy: 0.4, max: 0.9, s0: 0.2, s1: 0.8, a: 0.25, r: 0.7, g: 0.62, b: 0.48, drag: 2 }); } }
        if (k == null) f.dust = false;
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    doFall(sackFalls, sackMesh, true);
    doFall(crateFalls, crateMesh, false);

    for (const e of emitters) {
      if (!e.rate) continue;
      const dx = e.x - cp.x, dz = e.z - cp.z;
      if (dx * dx + dz * dz > 45 * 45) continue;
      e.acc = (e.acc || 0) + e.rate * pdt;
      while (e.acc >= 1) {
        e.acc -= 1;
        const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * e.r;
        if (e.kind === 'hatch') parts.emit({ x: e.x, y: e.y, z: e.z, vx: e.nx * 0.6, vz: e.nz * 0.6, vy: 0.9, max: 2.6, s0: 0.4, s1: 2.2, a: 0.16, drag: 0.4 });
        else parts.emit({ x: e.x + Math.cos(a) * rr, y: e.y, z: e.z + Math.sin(a) * rr, vx: (Math.random() - 0.5) * 0.2, vz: (Math.random() - 0.5) * 0.2, vy: 0.35 + Math.random() * 0.3, max: 3.5, s0: 0.6, s1: 2.6, a: e.kind === 'pan' ? 0.09 : 0.12, drag: 0.3, r: 0.8, g: 0.76, b: 0.7, fadeIn: 0.25 });
      }
    }
    parts.update(pdt);

    const tl = run.timeLimit || 70;
    const frac = Math.min(1.05, (rs?.time ?? tr) / tl);
    finish.needle.quaternion.copy(finish.gq).multiply(tmpQ.setFromAxisAngle(_v.set(0, 0, 1), Math.PI * 0.75 - frac * Math.PI * 1.5));
    const won = vis.state === 'won' || (rs && rs.s >= finishS);
    finish.spin = won ? Math.min(1, finish.spin + dt * 0.8) : Math.max(0, finish.spin - dt);
    if (finish.spin > 0) finish.wheel.rotateZ(-dt * 5 * finish.spin);
  }

  return {
    update,
    lights: { lamps: lampLights.map((l) => l.light), day, bounce },
    envMap,
    meshes,
    info: () => ({ chunks: chunks.size, meshes: meshes.length, halos: halos.length, lamps: catLamps.length, jets: steamJets.length, drips: drips.length, falls: falls.length, stairs: stairs.length, pans: coolPans.length }),
  };

  // hoisted helpers (function declarations) used above
  function sackGeo(seed) {
    const g = new THREE.BoxGeometry(0.62, 0.9, 0.5, 4, 6, 3), p = g.attributes.position, RR = rng(seed);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) / 0.31, y = p.getY(i) / 0.45, z = p.getZ(i) / 0.25;
      const r = Math.hypot(x, z) || 1, m = Math.max(Math.abs(x), Math.abs(z));
      x *= m / r * 1.1; z *= m / r * 1.1;
      const prof = y > 0.55 ? 1 - (y - 0.55) * 1.6 : 1 - Math.max(0, -y - 0.75) * 1.2;
      const bulge = (0.92 + 0.12 * (1 - y * y)) * Math.max(0.18, prof);
      p.setXYZ(i, x * 0.31 * bulge * (0.96 + RR() * 0.08), y * 0.45, z * 0.25 * bulge * (0.96 + RR() * 0.08));
    }
    const uv = g.attributes.uv, r = DECALS4.jute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(p.count * 3).fill(1), 3));
    return g;
  }
  function crateGeo() {
    const g = new THREE.BoxGeometry(0.7, BLOCK_HEIGHT, 0.85), uv = g.attributes.uv, r = DECALS4.crate;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(uv.count * 3).fill(1), 3));
    return g;
  }
  function riveted(x, z, r, y0, y1, color, seams = 8) {
    for (let k = 0; k < seams; k++) {
      const t = (k / seams) * Math.PI * 2 + 0.3;
      for (let y = y0 + 0.1; y < y1 - 0.05; y += 0.16) props.add(new THREE.OctahedronGeometry(0.022, 0), color, { x: x + Math.sin(t) * (r + 0.01), y, z: z + Math.cos(t) * (r + 0.01) });
    }
  }
}
const SACK = [0xffffff, 0xeee3d0, 0xd9ccb4, 0xf4ecdf];
