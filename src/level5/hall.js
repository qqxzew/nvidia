// Level 5 "Šílená stáčírna" — the racking hall, conveyor belts, switches, stations and barrels (owner: art).
// Ground floor of the Světovar brewery, c. 1913–1926: glazed-tile walls with dirty arched windows, cast-iron columns,
// cement floor with drains and wet patches, the lager-cellar lift (left wall), the dispatch gate with the brewery
// lorry backed in (left wall, bottom), a barrel-pitching kettle, barrel stacks, enamel signs. Fixed steep camera
// from +Z: no ceiling and no front wall (cut-away diorama). Readability first — nothing tall stands in front of a belt.
//
// Lights (4): warm SpotLight key (the only shadow caster), cold DirectionalLight "through the windows",
// warm PointLight over the dispatch / lift side, warm PointLight over the filler / pitch kettle side.
//
// Debug URL params: ?artvis=1 (fake barrels in every state + cycling FX, works without line.js),
//                   &artcam=x,y,z,tx,ty,tz (camera override), &hideui=1
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTextures, WALL_TEX } from '../level4/textures.js';
import { createTruck } from '../vehicle/truckModel.js';
import { STATIONS, NEXT_STATION } from './config.js';
import { getTextures5, DECALS, TAG_ORDER, FLOOR_TEX, rng } from './textures.js';

// palette (sRGB)
const IRON = 0x2b2c2f, IRON2 = 0x3c3e42, MACH = 0x3e564b, MACH2 = 0x2f4239, RAIL = 0x75776f, RED_LEAD = 0x7e3426;
const STONE = 0x9c9282, WOOD = 0x8d6a45, WOOD2 = 0x6e5136, WOOD_DARK = 0x4c3828, COLUMN = 0x46564c, BRICK = 0x8a4632;
const ENAMEL_G = 0x2e5845, ENAMEL_W = 0xece4d0, ZINC = 0x8a8e8f, FASCIA = 0x2c2622, BRASS = 0xd0a24c, STEEL = 0x9a9c9e;
const OAK = 0xb47c40, OAK2 = 0x9a6a38, OAK_DARK = 0x6e4a28;

// ---------------------------------------------------------------------------------------------- kit (as level 4)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

function prep(geo, o, keepUv) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUv && k === 'uv')) g.deleteAttribute(k);
  if (keepUv && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  if (o.m) g.applyMatrix4(o.m);
  else {
    if (o.q) _q.copy(o.q); else _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ'));
    _m.compose(_p.set(o.x || 0, o.y || 0, o.z || 0), _q, _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
    g.applyMatrix4(_m);
  }
  return g;
}

class Batch {
  constructor({ color = true, uv = false, post = null } = {}) { this.parts = []; this.color = color; this.uv = uv; this.post = post; }
  add(geo, color = 0xffffff, o = {}) {
    const g = prep(geo, o, this.uv);
    if (this.color) {
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
  link(p0, p1, r0, r1, c, seg = 8) {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
    const d = b.clone().sub(a), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize());
    const mid = a.add(b).multiplyScalar(0.5);
    return this.add(new THREE.CylinderGeometry(r1, r0, len, seg), c, { q, x: mid.x, y: mid.y, z: mid.z });
  }
  bar(p0, p1, w, t, c) {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
    const d = b.clone().sub(a), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize());
    const mid = a.add(b).multiplyScalar(0.5);
    return this.add(new THREE.BoxGeometry(w, len, t), c, { q, x: mid.x, y: mid.y, z: mid.z });
  }
  get empty() { return this.parts.length === 0; }
  mesh(material, { cast = false, receive = false } = {}) {
    const geo = mergeGeometries(this.parts, false);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  }
}

function wallUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, v = Math.min(y, WALL_TEX.height - 0.02) / WALL_TEX.height;
    if (ny > 0.7) { u = (x + z) / WALL_TEX.width; v = 0.72; } else if (nx > nz) u = z / WALL_TEX.width; else u = x / WALL_TEX.width;
    uv.setXY(i, u, v);
  }
}
function quadGeo(a, b, c, d, toward) {
  const g = new THREE.BufferGeometry();
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), C = new THREE.Vector3(...c), D = new THREE.Vector3(...d);
  const n = B.clone().sub(A).cross(C.clone().sub(A));
  const pts = n.dot(new THREE.Vector3(...toward)) >= 0 ? [A, B, C, A, C, D] : [A, C, B, A, D, C];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((v) => [v.x, v.y, v.z]), 3));
  g.computeVertexNormals();
  return g;
}
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
/** raw triangle soup → BufferGeometry with flat normals */
function soup(pos, uv = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------- env map
function buildEnvMap(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.BoxGeometry(22, 9, 15);
  const col = new Float32Array(room.attributes.position.count * 3), p = room.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    col.set(y < -4 ? [0.11, 0.09, 0.07] : y > 4 ? [0.03, 0.028, 0.026] : [0.17, 0.15, 0.12], i * 3);
  }
  room.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const roomM = new THREE.Mesh(room, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
  roomM.position.set(0, 3.5, 0);
  env.add(roomM);
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 6, 3) });
  const cold = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.8, 2.2) });
  for (const [x, y, z] of [[-2.6, 4, 2], [2.6, 4, 2], [7, 3.6, 1.6], [-6, 3.6, 5], [0, 4, -5]]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6), warm); s.position.set(x, y, z); env.add(s);
  }
  for (const x of [-7.5, -4.5, -1.5, 1.5, 4.5]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.2), cold); w.position.set(x, 1.7, -7.4); env.add(w); }
  for (const z of [-4.6, -1.9]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.2), cold); w.rotation.y = Math.PI / 2; w.position.set(-10.9, 1.7, z); env.add(w); }
  const top = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.42, 0.3) }));
  top.rotation.x = Math.PI / 2; top.position.set(0, 7.9, 0); env.add(top);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.035, 0.1, 60);
  pm.dispose();
  env.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  return rt.texture;
}

// ---------------------------------------------------------------------------------------------- particles (level 4 pool)
const PARTICLE_VS = /* glsl */ `
attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSize;
varying vec2 vUv; varying vec4 vCol;
void main() {
  vUv = uv; vCol = iCol;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSize.y), s = sin(iSize.y);
  mv.xy += mat2(c, s, -s, c) * position.xy * iSize.x;
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FS = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv; varying vec4 vCol;
void main() {
  float a = texture2D(map, vUv).a * vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, a);
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
  const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: tex } }, vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
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
        Object.assign(p, { on: true, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, max: 1, s0: 0.2, s1: 1, a: 0.3, r: 1, g: 1, b: 1, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.8, drag: 0.6, grav: 0, fadeIn: 0.15, floor: 0.03 }, o);
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
        if (p.grav > 0 && p.y < p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.4; p.vz *= 0.4; }
        const f = p.life / p.max;
        const alpha = p.a * Math.min(1, f / p.fadeIn) * (1 - f) * (1 - f * 0.3);
        iPos.setXYZ(n, p.x, p.y, p.z);
        iCol.setXYZW(n, p.r, p.g, p.b, alpha);
        iSize.setXY(n, p.s0 + (p.s1 - p.s0) * Math.sqrt(f), p.rot);
        n++;
      }
      geo.instanceCount = n;
      iPos.needsUpdate = iCol.needsUpdate = iSize.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------------------------------------- barrel tags (billboards, atlas)
const TAG_VS = /* glsl */ `
attribute vec3 iPos; attribute vec3 iTag; // xy = atlas cell offset, z = size (m)
attribute float iAlpha;
varying vec2 vUv; varying float vA;
void main() {
  vUv = uv * vec2(0.25, 0.5) + iTag.xy; vA = iAlpha;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * iTag.z;
  gl_Position = projectionMatrix * mv;
}`;
const TAG_FS = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv; varying float vA;
void main() {
  vec4 c = texture2D(map, vUv);
  float a = c.a * vA;
  if (a < 0.02) discard;
  gl_FragColor = vec4(c.rgb * 1.12, a);
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------------------------------------- build
export function buildHall(ctx) {
  const { scene, renderer, camera, layout: L, belts, events } = ctx;
  const ST = ctx.stations || STATIONS;
  const low = ctx.quality === 'low';
  const T4 = getTextures();
  const T = getTextures5(ST);
  const room = L.room, BH = L.beltHeight, BW = L.beltWidth, HW = BW / 2;
  const BR = L.barrel.radius, BLEN = L.barrel.length;
  const R = rng(513);
  const root = new THREE.Group(); root.name = 'hall';
  scene.add(root);
  const envMap = buildEnvMap(renderer);
  const camPos = camera.position.clone();

  // ------------------------------------------------------------------ materials
  const mProps = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mWall = new THREE.MeshLambertMaterial({ map: T4.wall });
  const mFloor = new THREE.MeshLambertMaterial({ map: T.floor, vertexColors: true });
  const mDeck = new THREE.MeshLambertMaterial({ map: T.belt });
  const mMetal = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.38, envMap, envMapIntensity: 1.2 });
  T4.copper.color.repeat.set(3, 1.5); T4.copper.rough.repeat.set(3, 1.5);
  const mCopper = new THREE.MeshStandardMaterial({ color: 0xffffff, map: T4.copper.color, metalness: 1, roughness: 0.4, roughnessMap: T4.copper.rough, envMap, envMapIntensity: 1.25 });
  const mGlass = new THREE.MeshBasicMaterial({ map: T4.glass, color: new THREE.Color(1.5, 1.68, 1.9) });
  const mDecal = new THREE.MeshLambertMaterial({ map: T.decals, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
  const mShaft = new THREE.MeshBasicMaterial({ map: T4.shaft, color: new THREE.Color(0.55, 0.66, 0.8), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mGlow = new THREE.MeshBasicMaterial({ map: T4.pool, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const mBulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.3, 2.4) });
  const mWet = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.5, envMap, envMapIntensity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });

  const props = new Batch();          // shadow casting, vertex coloured
  const deco = new Batch();           // non shadow-casting props (lamps, cords, fascia, floor bits)
  const metal = new Batch();          // brass / steel (vertex coloured, PBR)
  const copper = new Batch({ color: false, uv: true });
  const walls = new Batch({ color: false, uv: true, post: wallUV });
  const glass = new Batch({ color: false, uv: true });
  const decals = new Batch({ color: false, uv: true });
  const shafts = new Batch({ color: false, uv: true });
  const glows = new Batch({ uv: true });
  const bulbs = new Batch({ color: false });
  const wet = new Batch();
  const deck = new Batch({ color: false, uv: true });

  // helpers ---------------------------------------------------------------------------------------
  const faceCam = (x, y, z, roll = 0) => {
    const o = new THREE.Object3D(); o.position.set(x, y, z); o.lookAt(camPos);
    if (roll) o.rotateZ(roll);
    return o.quaternion.clone();
  };
  function decal(rect, w, h, pos, q) {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
    decals.add(g, 0, { x: pos[0], y: pos[1], z: pos[2], q: q instanceof THREE.Quaternion ? q : new THREE.Quaternion().setFromEuler(_e.set(q?.rx || 0, q?.ry || 0, 0, 'YXZ')) });
  }
  const floorDecal = (rect, w, h, x, z, yaw = 0) => decal(rect, w, h, [x, 0.012, z], new THREE.Quaternion().setFromEuler(_e.set(-Math.PI / 2, yaw, 0, 'YXZ')));
  // puddle-ish blob (indexed fan) with vertex colours, used for static wet patches
  function blob(x, z, r, col, rimCol, seed) {
    const RR = rng(seed), N = 24, p1 = RR() * 6.28, p2 = RR() * 6.28, pos = [], cols = [];
    const rr = []; for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; rr.push(r * (0.85 + 0.12 * Math.sin(a * 2 + p1) + 0.08 * Math.sin(a * 3 + p2) + 0.04 * Math.sin(a * 7))); }
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, j = (i + 1) % N;
      pos.push(x, 0.011, z, x + Math.cos(a1) * rr[j], 0.011, z + Math.sin(a1) * rr[j], x + Math.cos(a0) * rr[i], 0.011, z + Math.sin(a0) * rr[i]);
      cols.push(...col, ...rimCol, ...rimCol);
    }
    const g = soup(pos);
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    return g;
  }
  function addWet(x, z, r, seed, tint = [0.16, 0.15, 0.13]) {
    const g = blob(x, z, r, tint, tint.map((c) => c * 1.6), seed);
    g.deleteAttribute('color');
    const cols = []; const n = g.attributes.position.count;
    for (let i = 0; i < n; i++) cols.push(...(i % 3 === 0 ? tint : tint.map((c) => c * 1.5)));
    wet.add(g, 0xffffff);
    wet.parts[wet.parts.length - 1].setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  }

  // all belt paths (ring on top, branches / entry 6 mm lower so the ring deck covers the overlaps)
  const beltDefs = [{ id: 'ring', path: belts.ring, y: BH }];
  for (const b of Object.values(belts.branches)) beltDefs.push({ id: b.id, path: b.path, y: BH - 0.006, exit: b.exit });
  beltDefs.push({ id: 'entry', path: belts.entry.path, y: BH - 0.006 });
  const distToBelt = (x, z, skip = null) => {
    let d = Infinity;
    for (const b of beltDefs) if (b !== skip) d = Math.min(d, b.path.project(x, z).d);
    return d;
  };

  // ------------------------------------------------------------------ floor (cement, vertex-colour dirt, yard outside the gate)
  {
    const fx0 = room.minX - 6.5, fx1 = room.maxX + 0.6, fz0 = room.minZ - 0.6, fz1 = room.maxZ + 6;
    const g = new THREE.PlaneGeometry(fx1 - fx0, fz1 - fz0, 110, 72);
    g.rotateX(-Math.PI / 2); g.translate((fx0 + fx1) / 2, 0, (fz0 + fz1) / 2);
    const p = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      uv.setXY(i, x / FLOOR_TEX, -z / FLOOR_TEX);
      const n1 = Math.sin(x * 0.55 + 1.3) * Math.sin(z * 0.71 - 0.4) + 0.6 * Math.sin(x * 1.37 + z * 0.93 + 2.1) * Math.sin(z * 1.21 - x * 0.37);
      let r, gg, b;
      if (x < room.minX - 0.05) { // yard: cooler daylight paving
        const c = (0.78 + 0.08 * n1) * (0.95 + 0.08 * R());
        r = c * 0.86; gg = c * 0.9; b = c * 0.95;
      } else {
        const dw = Math.min(x - room.minX, room.maxX - x, z - room.minZ);
        let c = 0.64 + 0.36 * THREE.MathUtils.smoothstep(dw, 0, 2.6);
        const db = distToBelt(x, z);
        c *= 0.62 + 0.38 * THREE.MathUtils.smoothstep(db, HW - 0.1, HW + 0.75);   // soft contact shadow under conveyors
        c *= 0.9 + 0.1 * n1;
        c *= 0.95 + 0.08 * R();
        const wetW = Math.exp(-((x + 1.8) ** 2) / 2.2 - ((z + 4.4) ** 2) / 0.9) + 0.7 * Math.exp(-((x - 6.6) ** 2) / 0.8 - (z ** 2) / 1.6);
        c *= 1 - 0.3 * Math.min(1, wetW);
        c *= 1 - 0.4 * THREE.MathUtils.smoothstep(z, room.maxZ + 0.2, room.maxZ + 4); // fade toward the cut-away edge
        r = c; gg = c * 0.97; b = c * 0.93;
        if (wetW > 0.05) { b *= 1 + 0.06 * Math.min(1, wetW); }
      }
      col.set([r, gg, b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const floor = new THREE.Mesh(g, mFloor);
    floor.receiveShadow = true;
    root.add(floor);
  }

  // ------------------------------------------------------------------ walls with arched dirty windows + openings
  const WIN = { w: 1.7, sill: 1.05, spring: 3.85, rise: 0.5, depth: 0.42 };
  const WALL_TOP = 7.2;
  const backM = new THREE.Matrix4().makeTranslation(0, 0, room.minZ);
  const leftM = new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(room.minX, 0, 0));
  const rightM = new THREE.Matrix4().makeRotationY(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(room.maxX, 0, 0));
  const shaftDirBack = new THREE.Vector3(0.22, -0.5, 0.84).normalize();
  const shaftDirLeft = new THREE.Vector3(0.84, -0.5, 0.2).normalize();
  const GATE = { z0: 2.45, z1: 5.35, h: 3.7 };
  const LIFT = { z0: 0.1, z1: 1.7, h: 3.0, x0: room.minX, x1: room.minX + 1.45 };

  function wall(matrix, u0, u1, wins, dir, openings = []) {
    const shape = new THREE.Shape();
    shape.moveTo(u0, 0);
    // openings cut from the bottom edge (doors / gates)
    const ops = [...openings].sort((a, b) => a.u0 - b.u0);
    for (const o of ops) { shape.lineTo(o.u0, 0); shape.lineTo(o.u0, o.h); shape.lineTo(o.u1, o.h); shape.lineTo(o.u1, 0); }
    shape.lineTo(u1, 0); shape.lineTo(u1, WALL_TOP); shape.lineTo(u0, WALL_TOP); shape.lineTo(u0, 0);
    for (const cx of wins) { const h = new THREE.Path(); windowPath(h, cx, WIN.w, WIN.sill, WIN.spring, WIN.rise); shape.holes.push(h); }
    walls.add(new THREE.ShapeGeometry(shape, 12), 0xffffff, { m: matrix });
    const fz = new THREE.BoxGeometry(u1 - u0, 2.6, 0.5); fz.translate((u0 + u1) / 2, WALL_TOP + 1.3, 0.05);
    deco.add(fz, FASCIA, { m: matrix });
    const D = WIN.depth;
    for (const o of ops) { // reveals + lintel
      walls.add(quadGeo([o.u0, 0, 0], [o.u0, o.h, 0], [o.u0, o.h, -0.5], [o.u0, 0, -0.5], [1, 0, 0]), 0, { m: matrix });
      walls.add(quadGeo([o.u1, 0, 0], [o.u1, o.h, 0], [o.u1, o.h, -0.5], [o.u1, 0, -0.5], [-1, 0, 0]), 0, { m: matrix });
      walls.add(quadGeo([o.u0, o.h, 0], [o.u1, o.h, 0], [o.u1, o.h, -0.5], [o.u0, o.h, -0.5], [0, -1, 0]), 0, { m: matrix });
      const lt = new THREE.BoxGeometry(o.u1 - o.u0 + 0.3, 0.22, 0.08); lt.translate((o.u0 + o.u1) / 2, o.h + 0.11, 0.04);
      props.add(lt, IRON2, { m: matrix });
    }
    for (const cx of wins) {
      const x0 = cx - WIN.w / 2, x1 = cx + WIN.w / 2;
      walls.add(quadGeo([x0, WIN.sill, 0], [x0, WIN.spring, 0], [x0, WIN.spring, -D], [x0, WIN.sill, -D], [1, 0, 0]), 0, { m: matrix });
      walls.add(quadGeo([x1, WIN.sill, 0], [x1, WIN.spring, 0], [x1, WIN.spring, -D], [x1, WIN.sill, -D], [-1, 0, 0]), 0, { m: matrix });
      const arc = archPoints(cx, WIN.w, WIN.spring, WIN.rise, 10);
      for (let i = 0; i < arc.length - 1; i++) {
        const [ax, ay] = arc[i], [bx, by] = arc[i + 1];
        walls.add(quadGeo([ax, ay, 0], [bx, by, 0], [bx, by, -D], [ax, ay, -D], [cx - (ax + bx) / 2, WIN.spring - (ay + by) / 2 - 1, 0]), 0, { m: matrix });
      }
      const sl = new THREE.BoxGeometry(WIN.w + 0.2, 0.08, D + 0.18); sl.translate(cx, WIN.sill - 0.04, -D / 2 + 0.09);
      props.add(sl, STONE, { m: matrix });
      const gs = new THREE.Shape(); windowPath(gs, cx, WIN.w, WIN.sill, WIN.spring, WIN.rise);
      const gg = new THREE.ShapeGeometry(gs, 12);
      const uv = gg.attributes.uv, pp = gg.attributes.position;
      for (let i = 0; i < pp.count; i++) uv.setXY(i, (pp.getX(i) - x0) / WIN.w, (pp.getY(i) - WIN.sill) / (WIN.spring + WIN.rise - WIN.sill));
      gg.translate(0, 0, -D + 0.08);
      glass.add(gg, 0, { m: matrix });
      const tb = new THREE.BoxGeometry(WIN.w, 0.06, 0.06); tb.translate(cx, WIN.spring, -D + 0.1);
      props.add(tb, IRON, { m: matrix });
      if (!dir) continue;
      const mid = (WIN.sill + WIN.spring) / 2 + 0.2;
      const pa = new THREE.Vector3(x0 + 0.1, mid, -0.1).applyMatrix4(matrix), pb = new THREE.Vector3(x1 - 0.1, mid, -0.1).applyMatrix4(matrix);
      const len = mid / -dir.y;
      const pc = pb.clone().addScaledVector(dir, len), pd = pa.clone().addScaledVector(dir, len);
      shafts.add(soup([...pa.toArray(), ...pb.toArray(), ...pc.toArray(), ...pa.toArray(), ...pc.toArray(), ...pd.toArray()], [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]));
      const corners = [[x0, WIN.sill], [x1, WIN.sill], [x1, WIN.spring + 0.3], [x0, WIN.spring + 0.3]].map(([u, y]) => {
        const v = new THREE.Vector3(u, y, -0.2).applyMatrix4(matrix); return v.addScaledVector(dir, v.y / -dir.y).setY(0.015);
      });
      const [c0, c1, c2, c3] = corners;
      const fg = soup([...c0.toArray(), ...c1.toArray(), ...c2.toArray(), ...c0.toArray(), ...c2.toArray(), ...c3.toArray()], [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
      fg.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(18).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      glows.add(fg, new THREE.Color(0.14, 0.18, 0.24));
    }
  }
  const backWins = [-7.5, -4.5, -1.5, 1.5, 4.5];
  wall(backM, room.minX - 0.6, room.maxX + 0.6, backWins, shaftDirBack);
  // left wall local u = -z
  wall(leftM, -(room.maxZ + 1.5), -(room.minZ - 0.6), [4.6, 1.9 + 0.1], shaftDirLeft, [
    { u0: -GATE.z1, u1: -GATE.z0, h: GATE.h }, { u0: -LIFT.z1, u1: -LIFT.z0, h: LIFT.h },
  ]);
  wall(rightM, room.minZ - 0.6, room.maxZ + 1.5, [-4.3, -0.9, 2.5], null);
  // outer face of the left wall around the gate (seen through the opening) + dark lift shaft
  {
    // simple brick outer skin: a box behind the wall, with the gate cut by two boxes on either side
    props.box(0.5, WALL_TOP, room.maxZ + 1.5 - GATE.z1, 0x7a3f2c, room.minX - 0.25, WALL_TOP / 2, (GATE.z1 + room.maxZ + 1.5) / 2);
    props.box(0.5, WALL_TOP, GATE.z0 - LIFT.z1, 0x7a3f2c, room.minX - 0.25, WALL_TOP / 2, (GATE.z0 + LIFT.z1) / 2);
    props.box(0.5, WALL_TOP - GATE.h, GATE.z1 - GATE.z0, 0x7a3f2c, room.minX - 0.25, (WALL_TOP + GATE.h) / 2, (GATE.z0 + GATE.z1) / 2);
    // lift shaft: dark box behind the opening
    deco.box(1.6, 3.4, LIFT.z1 - LIFT.z0 + 0.4, 0x0d0b0a, room.minX - 1.0, 1.7, (LIFT.z0 + LIFT.z1) / 2);
    // gate leaves (planked, swung open against the outer wall)
    for (const [z, s] of [[GATE.z0, -1], [GATE.z1, 1]]) {
      const lw = (GATE.z1 - GATE.z0) / 2;
      for (let i = 0; i < 6; i++) props.box(lw / 6 - 0.01, GATE.h - 0.1, 0.06, i % 2 ? WOOD2 : 0x5d4630, room.minX - 0.55 - (i + 0.5) * (lw / 6), GATE.h / 2, z + s * 0.08);
      props.box(lw, 0.1, 0.08, IRON2, room.minX - 0.55 - lw / 2, 0.6, z + s * 0.12);
      props.box(lw, 0.1, 0.08, IRON2, room.minX - 0.55 - lw / 2, GATE.h - 0.6, z + s * 0.12);
    }
    // cobbled kerb line of the yard + daylight spilling in
    deco.box(0.25, 0.05, GATE.z1 - GATE.z0, STONE, room.minX - 0.1, 0.025, (GATE.z0 + GATE.z1) / 2);
    glows.add(new THREE.PlaneGeometry(3.6, 3.4), new THREE.Color(0.2, 0.24, 0.3), { x: room.minX + 1.4, y: 0.014, z: (GATE.z0 + GATE.z1) / 2, rx: -Math.PI / 2 });
  }
  // pilasters between windows + corner piers
  const pil = (x, z, w, d) => walls.add(new THREE.BoxGeometry(w, WALL_TOP, d), 0, { x, y: WALL_TOP / 2, z });
  for (const x of [-9.75, -6.0, -3.0, 0, 3.0, 6.0, 9.75]) pil(x, room.minZ + 0.12, 0.62, 0.24);
  for (const z of [-6.0, -3.3, 5.9]) pil(room.minX + 0.12, z, 0.24, 0.62);
  for (const z of [-2.6, 0.8, 4.3]) pil(room.maxX - 0.12, z, 0.24, 0.62);

  // ------------------------------------------------------------------ cast-iron columns + girders (kept clear of the belts' sight lines)
  const columns = [[-7.7, -4.6], [7.9, -4.6], [-7.6, -1.6], [8.7, 2.4]];
  for (const [cx, cz] of columns) {
    props.box(0.62, 0.36, 0.62, IRON2, cx, 0.18, cz);
    props.cyl(0.24, 0.3, 0.3, 12, COLUMN, cx, 0.5, cz);
    props.cyl(0.17, 0.2, 5.7, 14, COLUMN, cx, 3.5, cz);
    for (const y of [1.2, 6.0]) props.cyl(0.215, 0.215, 0.1, 14, COLUMN, cx, y, cz);
    props.cyl(0.38, 0.19, 0.42, 12, COLUMN, cx, 6.55, cz);
    props.box(0.8, 0.12, 0.8, IRON2, cx, 6.82, cz);
    const z0 = room.minZ, z1 = cz + 0.4;
    props.box(0.36, 0.06, z1 - z0, IRON2, cx, 6.9, (z0 + z1) / 2);
    props.box(0.05, 0.6, z1 - z0, IRON2, cx, 7.22, (z0 + z1) / 2);
    props.box(0.36, 0.06, z1 - z0, IRON2, cx, 7.54, (z0 + z1) / 2);
  }

  // ------------------------------------------------------------------ pipes along the back + left wall
  {
    const zb = room.minZ + 0.32;
    props.cyl(0.11, 0.11, room.maxX - room.minX, 10, 0xd9d0bb, 0, 4.4, zb, { rz: Math.PI / 2 }); // lagged steam main
    props.cyl(0.07, 0.07, room.maxX - room.minX, 8, IRON, 0, 3.95, zb - 0.06, { rz: Math.PI / 2 }); // water main
    for (let x = room.minX + 1.0; x < room.maxX; x += 2.4) props.box(0.06, 0.6, 0.3, IRON, x, 4.2, room.minZ + 0.15);
    // water drop to the washer
    props.cyl(0.06, 0.06, 3.9, 8, IRON, -2.2, 1.95, zb - 0.06);
    props.add(new THREE.TorusGeometry(0.12, 0.018, 4, 12), RED_LEAD, { x: -2.2, y: 1.4, z: zb + 0.1 });
    props.cyl(0.08, 0.08, room.maxZ - room.minZ, 8, IRON, room.minX + 0.3, 4.6, (room.minZ + room.maxZ) / 2, { rx: Math.PI / 2 });
  }

  // ------------------------------------------------------------------ belts: decks (scrolling), rails, skirts, legs
  {
    const DECK_REP = 1.0; // texture repeats every metre along the belt
    const insideOther = (x, z, self, margin) => {
      for (const b of beltDefs) if (b !== self && b.path.project(x, z).d < HW - margin) return true;
      return false;
    };
    for (const def of beltDefs) {
      const S = def.path.samples, y = def.y;
      // deck ribbon
      const pos = [], uv = [];
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1];
        const ra = [-a.tz, a.tx], rb = [-b.tz, b.tx];
        const A = [a.x - ra[0] * HW, y, a.z - ra[1] * HW], B = [a.x + ra[0] * HW, y, a.z + ra[1] * HW];
        const C = [b.x - rb[0] * HW, y, b.z - rb[1] * HW], D = [b.x + rb[0] * HW, y, b.z + rb[1] * HW];
        const va = a.s / DECK_REP, vb = b.s / DECK_REP;
        pos.push(...A, ...B, ...C, ...B, ...D, ...C);
        uv.push(0, va, 1, va, 0, vb, 1, va, 1, vb, 0, vb);
      }
      const g = soup(pos, uv);
      deck.add(g);
      // rails (top + both faces) and skirt (outer face down to the frame), skipping where another deck covers the edge
      for (const side of [-1, 1]) {
        let prev = null;
        const rp = [], rc = [];
        // push a triangle, flipping it so its normal points along `want`
        const push = (col, want, a, b, c) => {
          const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          if (nx * want[0] + ny * want[1] + nz * want[2] < 0) rp.push(...a, ...c, ...b); else rp.push(...a, ...b, ...c);
          for (let k = 0; k < 3; k++) rc.push(col.r, col.g, col.b);
        };
        const cRail = new THREE.Color(RAIL), cSkirt = new THREE.Color(MACH), cIn = new THREE.Color(MACH2);
        for (let i = 0; i < S.length; i += 2) {
          const a = S[i], rx = -a.tz * side, rz = a.tx * side;
          const ex = a.x + rx * HW, ez = a.z + rz * HW;
          const keep = !insideOther(ex, ez, def, 0.03);
          const cur = keep ? { i0: [ex - rx * 0.035, ez - rz * 0.035], o0: [ex + rx * 0.035, ez + rz * 0.035] } : null;
          if (cur && prev) {
            const yT = y + 0.06, yB = y - 0.17;
            const I0 = prev.i0, O0 = prev.o0, I1 = cur.i0, O1 = cur.o0;
            const up = [0, 1, 0], out = [rx, 0, rz], inn = [-rx, 0, -rz];
            push(cRail, up, [I0[0], yT, I0[1]], [O0[0], yT, O0[1]], [I1[0], yT, I1[1]]);
            push(cRail, up, [O0[0], yT, O0[1]], [O1[0], yT, O1[1]], [I1[0], yT, I1[1]]);
            push(cSkirt, out, [O0[0], yT, O0[1]], [O0[0], yB, O0[1]], [O1[0], yT, O1[1]]);
            push(cSkirt, out, [O0[0], yB, O0[1]], [O1[0], yB, O1[1]], [O1[0], yT, O1[1]]);
            push(cIn, inn, [I0[0], yT, I0[1]], [I1[0], yT, I1[1]], [I0[0], y, I0[1]]);
            push(cIn, inn, [I1[0], yT, I1[1]], [I1[0], y, I1[1]], [I0[0], y, I0[1]]);
          }
          prev = cur;
        }
        if (rp.length) {
          const gg = soup(rp);
          gg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
          props.parts.push(gg);
        }
      }
      // legs + cross braces every ~1.5 m
      const step = 1.5;
      for (let s = 0.5; s < def.path.length - 0.3; s += step) {
        const a = def.path.at(s);
        if (def.id !== 'ring' && insideOther(a.x, a.z, def, -0.2)) continue;
        const rx = -a.tz, rz = a.tx, yaw = Math.atan2(a.tx, a.tz);
        for (const sd of [-1, 1]) props.box(0.07, y - 0.17, 0.07, MACH2, a.x + rx * sd * (HW - 0.05), (y - 0.17) / 2, a.z + rz * sd * (HW - 0.05), { ry: yaw });
        props.box(BW - 0.1, 0.05, 0.05, MACH2, a.x, 0.22, a.z, { ry: yaw });
        props.box(BW - 0.04, 0.06, 0.12, MACH2, a.x, y - 0.2, a.z, { ry: yaw });
      }
      // drum ends where a belt starts / ends in the open (entry start, ship exit)
      const ends = [];
      if (def.id === 'entry') ends.push(0);
      if (def.exit) ends.push(def.path.length);
      for (const s of ends) {
        const a = def.path.at(s), yaw = Math.atan2(a.tx, a.tz);
        metal.cyl(0.075, 0.075, BW + 0.04, 14, STEEL, a.x, y - 0.075, a.z, { rz: Math.PI / 2, ry: yaw, order: 'YXZ' });
      }
    }
  }

  // ------------------------------------------------------------------ switches: gate arm (dynamic) + signal disk + number plate
  const switchRefs = [];
  const SW_ORDER = Object.values(belts.branches).sort((a, b) => a.order - b.order);
  {
    const ARM = 1.25, theta = Math.asin((BW - 0.08) / ARM);
    const discGeo = new THREE.CircleGeometry(0.33, 28);
    const arrowGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const mDisc = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mArrow = new THREE.MeshBasicMaterial({ map: T.arrow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    var discs = new THREE.InstancedMesh(discGeo, mDisc, 4);
    var arrows = new THREE.InstancedMesh(arrowGeo, mArrow, 4);
    discs.frustumCulled = arrows.frustumCulled = false;
    arrows.renderOrder = 3;
    const camQ = (p) => faceCam(p.x, p.y, p.z);
    // screen-space angle of a world direction at a point (for the arrow drawn on the camera-facing disk)
    const screenAngle = (p, dx, dz) => {
      const a = p.clone().project(camera), b = new THREE.Vector3(p.x + dx * 0.4, p.y, p.z + dz * 0.4).project(camera);
      const sx = (b.x - a.x) * camera.aspect, sy = b.y - a.y;
      return Math.atan2(-sx, sy);
    };
    SW_ORDER.forEach((b, i) => {
      const P = b.path.at(0), tr = belts.ring.at(b.sw);
      const rx = -tr.tz, rz = tr.tx;
      const right = P.tx * rx + P.tz * rz > 0;   // branch leaves to the right of the ring flow
      const sgn = right ? 1 : -1;
      const ox = -rx * sgn, oz = -rz * sgn;      // opposite side (where the pivot sits)
      const pivot = new THREE.Vector3(P.x - tr.tx * ARM * Math.cos(theta) + ox * (HW + 0.02), BH, P.z - tr.tz * ARM * Math.cos(theta) + oz * (HW + 0.02));
      const dir = (ang) => { // tr rotated toward the branch side by ang
        const c = Math.cos(ang), s = Math.sin(ang);
        return [tr.tx * c + rx * sgn * s, tr.tz * c + rz * sgn * s];
      };
      const yawOf = (d) => Math.atan2(-d[1], d[0]);
      // pivot post + base
      props.cyl(0.09, 0.12, BH + 0.32, 10, IRON2, pivot.x, (BH + 0.32) / 2, pivot.z);
      metal.cyl(0.1, 0.1, 0.05, 12, BRASS, pivot.x, BH + 0.34, pivot.z);
      // the arm (local +X along the arm, y = 0 at deck height)
      const ab = new Batch();
      const col = ST[b.id].color;
      ab.box(ARM, 0.2, 0.05, IRON2, ARM / 2, 0.17, 0);
      ab.box(ARM - 0.04, 0.035, 0.14, col, ARM / 2 + 0.01, 0.285, 0);   // station-colour top flange (reads from above)
      ab.box(ARM - 0.1, 0.01, 0.05, 0xf2ead6, ARM / 2 + 0.04, 0.307, 0); // cream pin-stripe
      ab.cyl(0.05, 0.05, 0.24, 10, STEEL, ARM, 0.17, 0);                 // end roller
      ab.cyl(0.075, 0.075, 0.3, 10, IRON, 0, 0.17, 0);                   // hub
      ab.box(0.42, 0.06, 0.06, IRON2, -0.21, 0.28, 0);                   // counterweight lever
      ab.sph(0.085, 8, 6, IRON, -0.44, 0.28, 0);
      const arm = ab.mesh(mProps, { cast: true });
      arm.userData.dynamic = true;
      const holder = new THREE.Group(); holder.position.copy(pivot); holder.userData.dynamic = true;
      holder.add(arm); root.add(holder);
      // signal post with the disk (inside the ring, beside the pivot)
      const sp = new THREE.Vector3(pivot.x + ox * 0.62 + tr.tx * 0.15, 0, pivot.z + oz * 0.62 + tr.tz * 0.15);
      props.box(0.36, 0.08, 0.36, IRON2, sp.x, 0.04, sp.z);
      props.cyl(0.04, 0.055, 1.05, 8, IRON, sp.x, 0.55, sp.z);
      const dc = new THREE.Vector3(sp.x, 1.22, sp.z);
      (ctx.switchDiscs ||= {})[b.id] = dc.clone(); // UI picks clicks by the visible disk (see ui.js pickAt)
      const q = camQ(dc);
      const bk = new THREE.Vector3(0, 0, -0.012).applyQuaternion(q);
      props.add(new THREE.CircleGeometry(0.42, 28), 0x16130f, { x: dc.x + bk.x, y: dc.y + bk.y, z: dc.z + bk.z, q });
      const ring = new THREE.RingGeometry(0.34, 0.39, 28);
      deco.add(ring, 0xece4d0, { m: new THREE.Matrix4().compose(dc.clone().add(new THREE.Vector3(0, 0, 0).applyQuaternion(q)), q, _s.set(1, 1, 1)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.004)) });
      // number plate under / beside the disk
      const np = new THREE.Vector3(sp.x + tr.tx * 0.55, 0.62, sp.z + tr.tz * 0.55);
      props.box(0.05, 0.62, 0.05, IRON, np.x, 0.31, np.z);
      decal(DECALS['key' + (i + 1)], 0.44, 0.44, [np.x, np.y + 0.18, np.z], faceCam(np.x, np.y + 0.18, np.z));
      // switch glow decals: a camera-facing halo behind the disk and a pool on the deck at the switch
      const ref = {
        id: b.id, key: b.key, holder, col: new THREE.Color(col), on: 0, ang: 0, last: false,
        yawStraight: yawOf(dir(0)), yawDivert: yawOf(dir(theta)),
        disc: dc, q, aS: screenAngle(dc, tr.tx, tr.tz), aD: screenAngle(dc, P.tx, P.tz),
        pool: new THREE.Vector3(P.x - tr.tx * 0.35, BH + 0.012, P.z - tr.tz * 0.35),
        tip: new THREE.Vector3(),
      };
      holder.rotation.y = ref.yawStraight;
      switchRefs.push(ref);
      const m = new THREE.Matrix4().compose(dc, q, _s.set(1, 1, 1));
      discs.setMatrixAt(i, m);
      discs.setColorAt(i, ref.col);
    });
    discs.instanceMatrix.needsUpdate = true;
    root.add(discs, arrows);
  }
  const swGlow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: T4.pool, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true }), 8);
  swGlow.frustumCulled = false; swGlow.renderOrder = 4;
  for (let i = 0; i < 8; i++) { swGlow.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); swGlow.setColorAt(i, _c.setRGB(0, 0, 0)); }
  root.add(swGlow);

  // ------------------------------------------------------------------ station frames
  const branch = belts.branches;
  function frame(id, backSign) {
    const b = branch[id], s = b.station, a = b.path.at(b.stationS);
    const T_ = [a.tx, a.tz], Rn = [-a.tz, a.tx];
    const yaw = Math.atan2(-a.tz, a.tx); // local +X along the belt
    const q = new THREE.Quaternion().setFromAxisAngle(_Y, yaw);
    // local(a, b, y): a along the belt, b toward the machine's back side, y up
    const local = (u, v, y) => new THREE.Vector3(a.x + T_[0] * u + Rn[0] * v * backSign, y, a.z + T_[1] * u + Rn[1] * v * backSign);
    // at(u, y, v): position + belt-aligned rotation for Batch.add (note: height before depth)
    const at = (u, y, v, extra) => { const p = local(u, v, y); return { x: p.x, y: p.y, z: p.z, q: extra ? q.clone().multiply(extra) : q }; };
    return { b, s, a, q, yaw, local, at, backSign };
  }
  // which side is "back" (away from the camera) for each station: sign relative to the belt's right normal
  const backSignFor = (id, want) => { const a = branch[id].path.at(branch[id].stationS); return (-a.tz * want[0] + a.tx * want[1]) >= 0 ? 1 : -1; };
  const qX90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const qZ90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  const signStand = (rect, pos, w = 1.5, h = 0.375, posts = true) => {
    // two thin posts + a camera-facing enamel sign
    const q = faceCam(pos.x, pos.y, pos.z);
    decal(rect, w, h, [pos.x, pos.y, pos.z], q);
    const back = new THREE.Vector3(0, 0, -0.02).applyQuaternion(q);
    props.add(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.025), 0x1a1612, { x: pos.x + back.x, y: pos.y + back.y, z: pos.z + back.z, q });
    if (posts) for (const sx of [-0.4, 0.4]) {
      const off = new THREE.Vector3(sx * w, 0, 0).applyQuaternion(q);
      props.box(0.04, pos.y - h / 2, 0.04, IRON, pos.x + off.x + back.x * 2, (pos.y - h / 2) / 2, pos.z + off.z + back.z * 2);
    }
  };

  // ---- 1 Myčka (barrel washer): housing behind, open spray arches over the belt, wet floor
  const washRef = {};
  {
    const F = frame('wash', backSignFor('wash', [0, -1]));
    const { at, local } = F;
    // housing (riveted, machine green) with a zinc water tank on top and a pump
    props.add(new THREE.BoxGeometry(2.2, 1.35, 0.85), MACH, at(0, 0.7, 1.02));
    props.add(new THREE.BoxGeometry(2.3, 0.08, 0.95), MACH2, at(0, 1.4, 1.02));
    for (let i = 0; i < 10; i++) metal.add(new THREE.SphereGeometry(0.02, 5, 3), STEEL, at(-1.0 + i * 0.22, 1.24, 0.59));
    props.add(new THREE.CylinderGeometry(0.3, 0.3, 1.8, 14), ZINC, at(0, 1.74, 1.24, qZ90));
    for (const u of [-0.7, 0.7]) props.add(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 14), IRON2, at(u, 1.74, 1.24, qZ90));
    props.add(new THREE.CylinderGeometry(0.2, 0.2, 0.4, 12), IRON2, at(1.35, 0.2, 1.0));          // pump body
    metal.add(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 16), BRASS, at(1.35, 0.42, 1.0));
    props.add(new THREE.TorusGeometry(0.22, 0.03, 5, 16), RED_LEAD, at(1.35, 0.7, 0.75));
    // spray arches over the belt: thin pipes only, so barrels stay visible from the top camera
    for (const u of [-0.55, 0, 0.55]) {
      const p0 = local(u, -0.5, 0), p1 = local(u, -0.5, BH + 0.95), p2 = local(u, 0.5, BH + 0.95), p3 = local(u, 0.5, 0.95);
      metal.link(p0.toArray(), p1.toArray(), 0.03, 0.03, STEEL, 6);
      metal.link(p1.toArray(), p2.toArray(), 0.03, 0.03, STEEL, 6);
      metal.link(p2.toArray(), p3.toArray(), 0.03, 0.03, STEEL, 6);
    }
    // side spray manifolds with nozzles
    const nozzles = [];
    for (const v of [-0.48, 0.48]) {
      const a0 = local(-0.75, v, BH + 0.42), a1 = local(0.75, v, BH + 0.42);
      metal.link(a0.toArray(), a1.toArray(), 0.035, 0.035, BRASS, 8);
      for (let k = 0; k < 6; k++) {
        const p = local(-0.6 + k * 0.24, v, BH + 0.42);
        metal.add(new THREE.SphereGeometry(0.03, 6, 4), BRASS, { x: p.x, y: p.y, z: p.z });
        nozzles.push({ p, v: -Math.sign(v) });
      }
    }
    for (let k = 0; k < 4; k++) nozzles.push({ p: local(-0.45 + k * 0.3, 0, BH + 0.92), v: 0, down: true });
    // drip tray under the belt + drain grate in front
    props.add(new THREE.BoxGeometry(2.2, 0.08, 1.1), ZINC, at(0, 0.06, 0));
    const dr = local(0, -1.0, 0);
    props.cyl(0.22, 0.22, 0.016, 14, 0x55524c, dr.x, 0.008, dr.z);
    for (let i = -2; i <= 2; i++) props.add(new THREE.BoxGeometry(0.03, 0.02, 0.32 - Math.abs(i) * 0.05), 0x1a1816, at(i * 0.07, 0.012, -1.0));
    addWet(dr.x - 0.3, dr.z + 0.1, 1.3, 11); addWet(dr.x + 1.2, dr.z - 0.2, 0.7, 12); addWet(local(0, -0.2, 0).x - 1.4, local(0, -0.2, 0).z, 0.6, 13);
    // hose from the water main down to the housing
    props.link(local(0.9, 1.2, 1.45).toArray(), [-2.2, 1.45, room.minZ + 0.3], 0.05, 0.05, 0x3a2e26, 6);
    // sign
    signStand(DECALS.st_wash, local(0, 0.72, 1.64), 1.5, 0.375, false);
    Object.assign(washRef, { nozzles, center: local(0, 0, BH + 0.4), vent: local(1.0, 1.05, 1.45), t: 99, pass: 99 });
  }

  // ---- 3 Naražeč (bung driver): cast-iron column press with a dropping ram, bung crate
  const capRef = {};
  {
    const F = frame('cap', backSignFor('cap', [0, -1]));
    const { at, local } = F;
    props.add(new THREE.BoxGeometry(0.9, 0.3, 0.7), IRON2, at(0, 0.15, 0.95));
    props.add(new THREE.CylinderGeometry(0.15, 0.2, 1.75, 12), MACH, at(0, 1.15, 0.95));
    props.add(new THREE.BoxGeometry(0.22, 0.24, 1.15), MACH, at(0, 2.02, 0.45));                // arm over the belt
    props.add(new THREE.CylinderGeometry(0.11, 0.11, 0.4, 12), MACH2, at(0, 1.84, 0));            // ram guide
    metal.add(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 14), BRASS, at(0, 2.16, 0));
    // flywheel on the column side
    props.add(new THREE.TorusGeometry(0.36, 0.045, 6, 22), IRON, at(0.32, 1.55, 0.95, new THREE.Quaternion().setFromAxisAngle(_Y, Math.PI / 2)));
    for (let k = 0; k < 4; k++) props.add(new THREE.BoxGeometry(0.03, 0.7, 0.03), IRON2, at(0.32, 1.55, 0.95, new THREE.Quaternion().setFromAxisAngle(_Y, Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), k * Math.PI / 4))));
    props.add(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), RED_LEAD, at(0.2, 1.55, 0.95, qZ90));
    // the ram (dynamic): rod + hammer head + rubber tip, origin at the guide bottom
    const rb = new Batch();
    rb.cyl(0.035, 0.035, 0.7, 8, STEEL, 0, 0.35, 0);
    rb.cyl(0.1, 0.1, 0.18, 14, IRON, 0, 0.0, 0);
    rb.cyl(0.07, 0.06, 0.05, 12, 0x1b1712, 0, -0.11, 0);
    const ram = rb.mesh(mProps, { cast: true });
    const rp = local(0, 0, 0);
    ram.position.set(rp.x, BH + 1.0, rp.z); ram.userData.dynamic = true;
    root.add(ram);
    // bung crate + red bungs + wooden mallet
    const cr = at(0.95, 0.2, 0.9);
    props.add(new THREE.BoxGeometry(0.6, 0.4, 0.45), WOOD, cr);
    decal(DECALS.crate, 0.56, 0.28, [local(0.95, 0.66, 0.22).x, 0.22, local(0.95, 0.66, 0.22).z], F.q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(_Y, F.backSign > 0 ? Math.PI : 0)));
    for (let k = 0; k < 18; k++) props.add(new THREE.CylinderGeometry(0.035, 0.03, 0.04, 6), k % 3 ? 0x8f2a1c : 0xa8402a, at(0.95 + (R() - 0.5) * 0.48, 0.42, 0.9 + (R() - 0.5) * 0.34, new THREE.Quaternion().setFromEuler(_e.set(R(), R(), 0))));
    props.add(new THREE.CylinderGeometry(0.07, 0.07, 0.22, 10), WOOD_DARK, at(-0.95, 0.07, 0.9, qZ90));
    props.add(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), WOOD, at(-0.95, 0.07, 0.62, qX90));
    signStand(DECALS.st_cap, local(-0.2, 0.62, 1.22), 1.5, 0.375);
    Object.assign(capRef, { ram, rest: BH + 1.0, strike: BH + 2 * BR + 0.11, t: 99, hit: local(0, 0, BH + 2 * BR) });
  }

  // ---- 2 Plnička (filling counter): copper pressure tank behind, gantry with a dropping brass nozzle
  const fillRef = {};
  {
    const F = frame('fill', backSignFor('fill', [1, 0]));
    const { at, local } = F;
    const tk = local(0, 1.35, 0);
    copper.cyl(0.5, 0.5, 1.7, 26, 0, tk.x, 1.05, tk.z);
    copper.add(new THREE.SphereGeometry(0.5, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, { x: tk.x, y: 1.9, z: tk.z });
    for (const y of [0.4, 1.0, 1.6]) metal.add(new THREE.TorusGeometry(0.51, 0.025, 5, 26), BRASS, { x: tk.x, y, z: tk.z, rx: Math.PI / 2 });
    for (let k = 0; k < 3; k++) { const ang = k * 2.09; props.box(0.08, 0.3, 0.08, IRON2, tk.x + Math.cos(ang) * 0.42, 0.15, tk.z + Math.sin(ang) * 0.42); }
    // gauge facing the camera
    const gp = local(-0.05, 0.86, 1.55);
    const gq = faceCam(gp.x, gp.y, gp.z);
    metal.add(new THREE.TorusGeometry(0.14, 0.025, 5, 18), BRASS, { x: gp.x, y: gp.y, z: gp.z, q: gq });
    deco.add(new THREE.CircleGeometry(0.13, 18), 0xf1ebda, { x: gp.x, y: gp.y, z: gp.z, q: gq });
    deco.add(new THREE.BoxGeometry(0.015, 0.11, 0.01), 0x1a1612, { m: new THREE.Matrix4().compose(new THREE.Vector3(gp.x, gp.y, gp.z), gq, _s.set(1, 1, 1)).multiply(new THREE.Matrix4().makeRotationZ(-0.6)).multiply(new THREE.Matrix4().makeTranslation(0, 0.05, 0.01)) });
    // sight glass (amber)
    deco.add(new THREE.BoxGeometry(0.06, 0.8, 0.06), 0xc88a2a, at(-0.3, 1.1, 0.88));
    // gantry: column behind the belt + arm over it
    props.add(new THREE.CylinderGeometry(0.08, 0.1, 2.0, 10), MACH, at(0, 1.0, 0.72));
    props.add(new THREE.BoxGeometry(0.16, 0.16, 0.86), MACH, at(0, 2.05, 0.35));
    props.add(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 10), MACH2, at(0, 1.9, 0));
    copper.link(local(0, 0.86, 1.6).toArray(), local(0, 0.45, 2.05).toArray(), 0.04, 0.04, 0, 8);
    copper.link(local(0, 0.45, 2.05).toArray(), local(0, 0.02, 2.05).toArray(), 0.04, 0.04, 0, 8);
    // nozzle (dynamic, brass): rod + filling head + hand lever
    const nb = new Batch();
    nb.cyl(0.03, 0.03, 0.6, 8, BRASS, 0, 0.3, 0);
    nb.cyl(0.065, 0.065, 0.12, 12, BRASS, 0, 0.0, 0);
    nb.cyl(0.03, 0.012, 0.12, 8, 0x9a7a3a, 0, -0.12, 0);
    nb.box(0.32, 0.03, 0.03, IRON, 0.16, 0.1, 0);
    nb.sph(0.035, 6, 4, 0x1b1712, 0.32, 0.1, 0);
    const nozzle = nb.mesh(mMetal, { cast: true });
    const np = local(0, 0, 0);
    nozzle.position.set(np.x, BH + 1.15, np.z); nozzle.rotation.y = F.yaw; nozzle.userData.dynamic = true;
    root.add(nozzle);
    // foam bucket + a mug on the tank skirt
    const bk = at(0.85, 0.17, 0.9);
    props.add(new THREE.CylinderGeometry(0.18, 0.15, 0.32, 12, 1, true), ZINC, bk);
    props.add(new THREE.CircleGeometry(0.16, 12), 0xefe4c8, at(0.85, 0.3, 0.9, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)));
    addWet(local(0.1, -0.3, 0).x, local(0.1, -0.3, 0).z, 0.55, 21, [0.2, 0.15, 0.08]);
    signStand(DECALS.st_fill, local(1.45, 1.25, 0.95), 1.3, 0.325);
    Object.assign(fillRef, { nozzle, rest: BH + 1.15, low: BH + 2 * BR + 0.18, t: 99, head: local(0, 0, BH + 2 * BR + 0.05) });
  }

  // ---- 4 Expedice (dispatch dock): clerk's lectern + tally board behind, floor stencil, chute to the lorry
  const shipRef = {};
  {
    const F = frame('ship', backSignFor('ship', [0, -1]));
    const { at, local } = F;
    // clerk's lectern with ledger
    props.add(new THREE.BoxGeometry(0.7, 1.0, 0.45), WOOD2, at(0.4, 0.5, 1.05));
    props.add(new THREE.BoxGeometry(0.8, 0.05, 0.6), WOOD, at(0.4, 1.06, 1.0, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.25 * F.backSign)));
    props.add(new THREE.BoxGeometry(0.45, 0.03, 0.32), 0xe8dcc0, at(0.4, 1.1, 0.98));
    // tally board on an easel
    const tb = local(1.6, 1.25, 1.25);
    decal(DECALS.board, 1.1, 0.55, [tb.x, tb.y, tb.z], faceCam(tb.x, tb.y, tb.z));
    for (const sx of [-0.4, 0.4]) props.link([tb.x + sx, 0, tb.z - 0.1], [tb.x + sx * 0.8, tb.y + 0.3, tb.z - 0.05], 0.025, 0.02, WOOD, 5);
    // dispatch counter on a post beside the belt
    const cp = local(-0.9, 0.65, 1.0);
    props.box(0.08, 1.0, 0.08, IRON, cp.x, 0.5, cp.z);
    decal(DECALS.counter, 0.5, 0.25, [cp.x, 1.1, cp.z], faceCam(cp.x, 1.1, cp.z));
    // signal arm that lifts for every dispatched barrel (dynamic)
    const ap = local(0.0, 0.55, 0);
    props.cyl(0.05, 0.06, 1.3, 8, IRON, ap.x, 0.65, ap.z);
    const sb = new Batch();
    sb.box(0.9, 0.08, 0.05, 0xece4d0, 0.45, 0, 0);
    sb.box(0.25, 0.085, 0.055, ST.ship.color, 0.2, 0, 0);
    sb.box(0.25, 0.085, 0.055, ST.ship.color, 0.7, 0, 0);
    const sarm = sb.mesh(mProps, { cast: true });
    const toBelt = local(0, -1, 0).sub(local(0, 0, 0));
    const sh = new THREE.Group(); sh.position.set(ap.x, 1.3, ap.z); sh.rotation.y = Math.atan2(-toBelt.z, toBelt.x);
    sh.userData.dynamic = true; sarm.userData.dynamic = true;
    const sp2 = new THREE.Group(); sp2.userData.dynamic = true; sh.add(sp2); sp2.add(sarm);
    root.add(sh);
    floorDecal(DECALS.stencil, 2.2, 0.55, local(0.3, -1.05, 0).x, local(0.3, -1.05, 0).z);
    signStand(DECALS.st_ship, local(-0.6, 1.9, 1.65), 1.5, 0.375);
    Object.assign(shipRef, { arm: sp2, t: 99 });
  }

  // ------------------------------------------------------------------ the lorry backed into the dispatch gate + chute
  const shipEnd = branch.ship.path.at(branch.ship.path.length);
  let truck = null; const cargoSlots = [];
  {
    try {
      truck = createTruck({ ...ctx });
      truck.group.rotation.y = -Math.PI / 2;
      truck.group.position.set(room.minX - 0.3 - 2.7, 0, shipEnd.z);
      root.add(truck.group);
      truck.group.updateMatrixWorld(true);
      for (const s of truck.cargoSlots) cargoSlots.push(truck.cargoRoot.localToWorld(s.position.clone()));
    } catch (e) { console.warn('[hall] truck', e); }
    // plank chute from the belt end up to the lorry bed
    const x0 = shipEnd.x - 0.05, x1 = room.minX - 0.25, y0 = BH, y1 = 1.1;
    const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x0 - x1);
    for (let k = 0; k < 4; k++) props.box(len, 0.04, 0.17, k % 2 ? WOOD : WOOD2, (x0 + x1) / 2, (y0 + y1) / 2, shipEnd.z - 0.3 + k * 0.2, { rz: -ang });
    for (const sd of [-1, 1]) props.box(len, 0.1, 0.04, WOOD_DARK, (x0 + x1) / 2, (y0 + y1) / 2 + 0.05, shipEnd.z + sd * 0.42, { rz: -ang });
    props.box(0.08, BH - 0.02, 0.08, WOOD_DARK, x0 - 0.1, BH / 2, shipEnd.z - 0.38);
    props.box(0.08, BH - 0.02, 0.08, WOOD_DARK, x0 - 0.1, BH / 2, shipEnd.z + 0.38);
    // stacked capped barrels on the floor by the gate (decor) + a sack truck
  }

  // ------------------------------------------------------------------ the lager-cellar lift (left wall) where barrels arrive
  const liftRef = {};
  {
    const x0 = LIFT.x0 + 0.05, x1 = LIFT.x1, z0 = LIFT.z0, z1 = LIFT.z1, H = 3.1;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) props.box(0.08, H, 0.08, IRON, x, H / 2, z);
    for (const z of [z0, z1]) {
      props.box(x1 - x0, 0.08, 0.08, IRON, (x0 + x1) / 2, H, z);
      props.box(x1 - x0, 0.06, 0.06, IRON, (x0 + x1) / 2, 0.06, z);
      // lattice (diagonal flats)
      for (let k = 0; k < 6; k++) {
        const y0 = 0.15 + k * 0.48;
        props.bar([x0, y0, z], [x1, y0 + 0.48, z], 0.03, 0.015, IRON2);
        props.bar([x1, y0, z], [x0, y0 + 0.48, z], 0.03, 0.015, IRON2);
      }
    }
    props.box(0.08, 0.08, z1 - z0, IRON, x1, H, (z0 + z1) / 2);
    // platform (chequer plate) at belt height + hoist beam with pulley
    metal.box(x1 - x0 - 0.1, 0.05, z1 - z0 - 0.1, 0x6f716e, (x0 + x1) / 2, BH - 0.035, (z0 + z1) / 2);
    props.box(0.12, 0.2, z1 - z0 + 0.3, IRON2, (x0 + x1) / 2 - 0.2, H + 0.22, (z0 + z1) / 2);
    props.add(new THREE.TorusGeometry(0.3, 0.04, 6, 18), IRON, { x: (x0 + x1) / 2 - 0.2, y: H + 0.55, z: (z0 + z1) / 2 });
    for (const dz of [-0.55, 0.55]) props.link([(x0 + x1) / 2 - 0.2, H + 0.3, (z0 + z1) / 2 + dz * 0.5], [(x0 + x1) / 2 - 0.2, BH + 0.02, (z0 + z1) / 2 + dz], 0.012, 0.012, 0x1b1b1b, 4);
    // sliding gate above the belt mouth (dynamic, lifts when a barrel arrives)
    const gb = new Batch();
    gb.box(0.04, 0.7, z1 - z0 - 0.1, IRON2, 0, 0, 0);
    for (let k = 0; k < 5; k++) gb.box(0.05, 0.72, 0.025, IRON, 0, 0, -0.6 + k * 0.3);
    const gate = gb.mesh(mProps, { cast: true });
    gate.position.set(x1, BH + 0.95, (z0 + z1) / 2); gate.userData.dynamic = true;
    root.add(gate);
    // bell on the wall (dynamic)
    const bb = new Batch();
    bb.add(new THREE.CylinderGeometry(0.05, 0.13, 0.17, 12, 1, true), BRASS, { y: -0.12 });
    bb.sph(0.03, 6, 4, IRON, 0, -0.22, 0);
    const bell = bb.mesh(mMetal, { cast: false });
    bell.position.set(room.minX + 0.15, 2.4, z0 - 0.35); bell.userData.dynamic = true;
    root.add(bell);
    props.box(0.25, 0.05, 0.05, IRON, room.minX + 0.12, 2.42, z0 - 0.35);
    // lift sign on the wall above
    decal(DECALS.lift, 1.7, 0.42, [room.minX + 0.03, 3.45, (z0 + z1) / 2], { ry: Math.PI / 2 });
    Object.assign(liftRef, { gate, gateY: BH + 0.95, bell, t: 99, mouth: new THREE.Vector3(x1, BH + 0.5, (z0 + z1) / 2) });
  }

  // where queued lift barrels stand (left wall, beside the cage)
  const LIFTQ = [0, 1, 2, 3, 4, 5].map((i) => ({ x: room.minX + 0.62 + i * 0.64, z: LIFT.z0 - 0.3 - (i % 2) * 0.04 }));
  // ------------------------------------------------------------------ decor barrels (static, vertex coloured)
  function decoBarrel(x, y, z, o = {}) {
    const N = 12, h = 0.31, R0 = 0.3, R1 = 0.258;
    const prof = (yy) => R1 + (R0 - R1) * (1 - (yy / h) ** 2);
    const pts = []; for (let i = 0; i <= 6; i++) { const yy = -h + (2 * h * i) / 6; pts.push(new THREE.Vector2(prof(yy), yy)); }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')), _s.set(1, 1, 1));
    props.add(new THREE.LatheGeometry(pts, N), o.wood ?? OAK2, { m });
    for (const s of [-1, 1]) props.add(new THREE.CircleGeometry(R1 - 0.01, N), o.head ?? OAK, { m: m.clone().multiply(new THREE.Matrix4().makeTranslation(0, s * (h - 0.005), 0)).multiply(new THREE.Matrix4().makeRotationX(-s * Math.PI / 2)) });
    for (const hy of [-0.24, -0.1, 0.1, 0.24]) props.add(new THREE.CylinderGeometry(prof(hy) + 0.006, prof(hy) + 0.006, 0.03, N, 1, true), o.hoop ?? IRON2, { m: m.clone().multiply(new THREE.Matrix4().makeTranslation(0, hy, 0)) });
  }
  // capped barrels stacked by the gate (pyramid, lying), a few standing
  {
    const bx = room.minX + 1.0, bz = 5.55;
    for (let k = 0; k < 3; k++) decoBarrel(bx + k * 0.64, 0.3, bz, { rx: Math.PI / 2, wood: OAK_DARK, hoop: 0x8a6a2a });
    for (let k = 0; k < 2; k++) decoBarrel(bx + 0.32 + k * 0.64, 0.84, bz, { rx: Math.PI / 2, wood: OAK_DARK, hoop: 0x8a6a2a });
    decoBarrel(bx + 0.64, 1.38, bz, { rx: Math.PI / 2, wood: OAK_DARK, hoop: 0x8a6a2a });
    // empty dirty barrels waiting near the back-left (from the cellar)
    const ex = -6.4, ez = -5.3;
    for (let k = 0; k < 3; k++) decoBarrel(ex + k * 0.66, 0.31, ez, { wood: 0x6a5642, head: 0x7d6650, hoop: 0x3a2a20 });
    decoBarrel(ex + 0.33, 0.31, ez + 0.62, { wood: 0x6a5642, head: 0x7d6650, hoop: 0x3a2a20 });
    decoBarrel(ex + 0.33, 0.92, ez + 0.1, { rx: Math.PI / 2, ry: 0.3, wood: 0x6a5642, head: 0x7d6650, hoop: 0x3a2a20 });
    // clean barrels drying on a rack, front right
    const cx = 7.4, cz = 4.9;
    props.box(2.0, 0.08, 0.12, WOOD_DARK, cx + 0.5, 0.18, cz - 0.3); props.box(2.0, 0.08, 0.12, WOOD_DARK, cx + 0.5, 0.18, cz + 0.3);
    for (let k = 0; k < 3; k++) decoBarrel(cx + k * 0.64, 0.52, cz, { rx: Math.PI / 2, wood: OAK, head: 0xc49a5c });
    decoBarrel(cx + 0.32, 1.05, cz, { rx: Math.PI / 2, wood: OAK, head: 0xc49a5c });
  }

  // ------------------------------------------------------------------ pitch kettle (Pechkessel) back right, for pitching barrel insides
  const pitchRef = {};
  {
    const kx = 8.3, kz = -5.5;
    // brick firebox
    props.box(1.3, 0.85, 1.1, BRICK, kx, 0.425, kz);
    props.box(1.38, 0.06, 1.18, STONE, kx, 0.88, kz);
    props.box(0.4, 0.28, 0.05, 0x1a0d08, kx, 0.3, kz + 0.56);
    props.cyl(0.5, 0.42, 0.42, 16, IRON, kx, 1.1, kz);
    props.add(new THREE.CircleGeometry(0.46, 16), 0x0e0b08, { x: kx, y: 1.315, z: kz, rx: -Math.PI / 2 });
    props.add(new THREE.TorusGeometry(0.5, 0.03, 5, 18), IRON2, { x: kx, y: 1.31, z: kz, rx: Math.PI / 2 });
    // flue pipe up the back wall
    props.link([kx + 0.35, 0.85, kz - 0.4], [kx + 0.35, 6.5, room.minZ + 0.25], 0.09, 0.09, IRON, 8);
    // pitch ladle + a barrel standing open, being pitched
    props.link([kx - 0.1, 1.3, kz], [kx - 0.85, 1.65, kz + 0.25], 0.02, 0.02, WOOD, 5);
    decoBarrel(kx - 1.3, 0.31, kz + 0.2, { wood: OAK2 });
    glows.add(new THREE.PlaneGeometry(1.6, 1.6), new THREE.Color(0.5, 0.2, 0.05), { x: kx, y: 0.014, z: kz + 0.9, rx: -Math.PI / 2 });
    deco.add(new THREE.PlaneGeometry(0.36, 0.24), 0xff7a2a, { x: kx, y: 0.3, z: kz + 0.585 });
    Object.assign(pitchRef, { mouth: new THREE.Vector3(kx, 1.35, kz) });
  }

  // ------------------------------------------------------------------ reject pen (ZMETKY) by the dispatch belt
  const PEN = { x: -6.7, z: 5.35 };
  {
    const w = 1.9, d = 1.0;
    for (const sz of [-1, 1]) for (let k = 0; k < 2; k++) props.box(w, 0.1, 0.04, k ? WOOD : WOOD2, PEN.x, 0.18 + k * 0.2, PEN.z + sz * d / 2);
    for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) props.box(0.04, 0.1, d, k ? WOOD : WOOD2, PEN.x + sx * w / 2, 0.18 + k * 0.2, PEN.z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) props.box(0.07, 0.5, 0.07, WOOD_DARK, PEN.x + sx * w / 2, 0.25, PEN.z + sz * d / 2);
    const bp = new THREE.Vector3(PEN.x + w / 2 + 0.05, 0.75, PEN.z);
    props.box(0.05, 0.75, 0.05, WOOD_DARK, bp.x, 0.375, bp.z);
    decal(DECALS.rejects, 0.7, 0.35, [bp.x, 0.82, bp.z + 0.03], faceCam(bp.x, 0.82, bp.z + 0.03));
    addWet(PEN.x - 0.2, PEN.z + 0.1, 0.7, 31, [0.17, 0.14, 0.1]);
  }
  const penSlots = [];
  for (let k = 0; k < 6; k++) {
    const row = k < 3 ? 0 : 1, i = row ? k - 3 : k;
    if (row && i > 1) break;
    penSlots.push(new THREE.Vector3(PEN.x - 0.62 + i * 0.62 + (row ? 0.31 : 0), BR + row * 0.52, PEN.z));
  }
  // second, smaller scrap pile by the bung driver (empty barrels hammered there get shoved off the line)
  const CAPPILE = { x: 4.7, z: -5.25 };
  {
    props.box(1.5, 0.06, 0.9, WOOD_DARK, CAPPILE.x, 0.03, CAPPILE.z);
    for (let k = 0; k < 5; k++) props.box(0.08, 0.03, 0.6, k % 2 ? OAK2 : OAK_DARK, CAPPILE.x - 0.6 + k * 0.3, 0.075, CAPPILE.z + 0.3, { ry: 0.3 * k }); // loose staves
    const bp = new THREE.Vector3(CAPPILE.x + 0.85, 0.7, CAPPILE.z - 0.3);
    props.box(0.05, 0.7, 0.05, WOOD_DARK, bp.x, 0.35, bp.z);
    decal(DECALS.rejects, 0.6, 0.3, [bp.x, 0.78, bp.z + 0.03], faceCam(bp.x, 0.78, bp.z + 0.03));
  }
  const capSlots = [[-0.35, 0], [0.35, 0], [0, 0.52]].map(([dx, dy]) => new THREE.Vector3(CAPPILE.x + dx, 0.06 + BR + dy, CAPPILE.z));
  const piles = { reject: { slots: penSlots, list: [], n: 0 }, rejectCap: { slots: capSlots, list: [], n: 0 } };

  // ------------------------------------------------------------------ odds and ends: drains, sack truck, hose, signs, foreman's desk
  {
    // floor drains with channels
    for (const [x, z] of [[0, 0.3], [6.4, 1.7], [-6.0, 2.2]]) {
      deco.cyl(0.2, 0.2, 0.016, 14, 0x55524c, x, 0.008, z);
      for (let i = -2; i <= 2; i++) deco.box(0.03, 0.02, 0.3 - Math.abs(i) * 0.05, 0x1a1816, x + i * 0.07, 0.012, z);
    }
    addWet(0.2, 0.4, 0.9, 41); addWet(6.6, 1.6, 0.6, 42);
    // foreman's standing desk in the middle of the loop (low, nothing tall in front of a belt)
    props.box(0.9, 0.06, 0.6, WOOD, -0.6, 1.0, -0.4, { rx: -0.2 });
    props.box(0.8, 0.95, 0.5, WOOD2, -0.6, 0.48, -0.35);
    props.box(0.4, 0.025, 0.3, 0xe8dcc0, -0.65, 1.05, -0.38, { rx: -0.2 });
    props.cyl(0.18, 0.18, 0.04, 10, WOOD_DARK, 0.3, 0.62, -0.5);
    for (let k = 0; k < 3; k++) props.link([0.3, 0.6, -0.5], [0.3 + Math.cos(k * 2.1) * 0.2, 0, -0.5 + Math.sin(k * 2.1) * 0.2], 0.02, 0.02, WOOD_DARK, 4);
    // coiled hose on the floor
    deco.add(new THREE.TorusGeometry(0.32, 0.035, 5, 18), 0x3a2e26, { x: 1.4, y: 0.035, z: 0.5, rx: Math.PI / 2 });
    deco.add(new THREE.TorusGeometry(0.25, 0.035, 5, 18), 0x3a2e26, { x: 1.4, y: 0.09, z: 0.5, rx: Math.PI / 2 });
    // two-wheeled barrel truck (rudl) near the cellar barrels
    const hx = -4.6, hz = -5.0;
    props.link([hx, 0.1, hz], [hx + 0.2, 1.2, hz - 0.4], 0.025, 0.025, IRON2, 5);
    props.link([hx + 0.5, 0.1, hz], [hx + 0.7, 1.2, hz - 0.4], 0.025, 0.025, IRON2, 5);
    for (const sx of [0, 0.5]) props.add(new THREE.TorusGeometry(0.15, 0.04, 5, 12), IRON, { x: hx + sx - 0.04 + (sx ? 0.08 : 0), y: 0.15, z: hz + 0.05, ry: Math.PI / 2 });
    props.box(0.5, 0.03, 0.25, IRON2, hx + 0.25, 0.08, hz + 0.15);
    // big enamel hall signs (walls) + "no smoking" + wet floor
    decal(DECALS.hall, 3.0, 0.38, [0, 0.82, room.minZ + 0.27], { ry: 0 });
    decal(DECALS.brand, 1.6, 0.4, [-6.0, 2.6, room.minZ + 0.03], { ry: 0 });
    decal(DECALS.smoke, 1.2, 0.3, [room.maxX - 0.03, 1.6, -1.9], { ry: -Math.PI / 2 });
    decal(DECALS.caution, 0.8, 0.4, [room.maxX - 0.03, 1.5, 1.6], { ry: -Math.PI / 2 });
    decal(DECALS.brand, 1.6, 0.4, [room.minX + 0.03, 2.2, -0.7], { ry: Math.PI / 2 });
  }

  // ------------------------------------------------------------------ pendant lamps (enamel shades, bare bulbs) — placed so shades/cords never cover a belt
  const lamps = [[7.7, 4.4, 1.2], [0.9, 4.6, -5.7], [-5.6, 4.6, -5.8]];
  for (const [x, z] of [[-2.4, 0.9], [2.4, 0.9], [0, -3.6], [-2.0, 4.6], [3.6, 4.4]]) glows.add(new THREE.PlaneGeometry(5.2, 5.2), new THREE.Color(0.3, 0.18, 0.075), { x, y: 0.012, z, rx: -Math.PI / 2 });
  for (const [x, y, z] of lamps) {
    deco.link([x, y + 0.2, z], [x, 6.6, z], 0.012, 0.012, 0x1a1a1a, 4);
    deco.cyl(0.05, 0.05, 0.12, 8, IRON, x, y + 0.2, z);
    deco.cyl(0.07, 0.36, 0.24, 14, ENAMEL_G, x, y + 0.05, z, { open: true });
    deco.add(new THREE.TorusGeometry(0.36, 0.012, 4, 16), ENAMEL_W, { x, y: y - 0.07, z, rx: Math.PI / 2 });
    deco.add(new THREE.CircleGeometry(0.08, 10), ENAMEL_W, { x, y: y + 0.17, z, rx: -Math.PI / 2 });
    bulbs.sph(0.07, 8, 6, 0, x, y - 0.06, z);
    const hm = new THREE.Object3D(); hm.position.set(x, y - 0.06, z); hm.lookAt(camPos); hm.updateMatrix();
    glows.add(new THREE.PlaneGeometry(1.1, 1.1), new THREE.Color(0.5, 0.33, 0.16), { m: hm.matrix });
    glows.add(new THREE.PlaneGeometry(4.6, 4.6), new THREE.Color(0.36, 0.22, 0.09), { x, y: 0.012, z, rx: -Math.PI / 2 });
  }

  // ------------------------------------------------------------------ real lights
  const key = new THREE.SpotLight(0xffcf9a, 300, 0, 0.78, 0.8, 2);
  key.position.set(1.0, 13.5, 6.5);
  key.target.position.set(-0.4, 0, -0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  key.shadow.camera.near = 5; key.shadow.camera.far = 26;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025;
  root.add(key, key.target);
  const day = new THREE.DirectionalLight(0x9fb6cc, 0.7);
  day.position.set(-6, 8, -9); day.target.position.set(1, 0, 0);
  root.add(day, day.target);
  const lampL = new THREE.PointLight(0xffbe7a, 16, 11, 2);
  lampL.position.set(-6.8, 4.0, 3.2);
  const lampR = new THREE.PointLight(0xffbe7a, 14, 11, 2);
  lampR.position.set(7.2, 4.0, -1.8);
  root.add(lampL, lampR);

  // ------------------------------------------------------------------ assemble static meshes
  root.add(walls.mesh(mWall, { receive: true }));
  root.add(props.mesh(mProps, { cast: true, receive: true }));
  root.add(deco.mesh(mProps, { receive: true }));
  root.add(metal.mesh(mMetal, { cast: true, receive: true }));
  root.add(copper.mesh(mCopper, { cast: true, receive: true }));
  root.add(glass.mesh(mGlass));
  root.add(decals.mesh(mDecal, { receive: true }));
  const deckMesh = deck.mesh(mDeck, { receive: true }); root.add(deckMesh);
  const wetMesh = wet.mesh(mWet); wetMesh.renderOrder = 1; root.add(wetMesh);
  const shaftMesh = shafts.mesh(mShaft); shaftMesh.renderOrder = 3; root.add(shaftMesh);
  const glowMesh = glows.mesh(mGlow); glowMesh.renderOrder = 2; root.add(glowMesh);
  root.add(bulbs.mesh(mBulb));

  // ------------------------------------------------------------------ barrels (instanced, per state look)
  const MAXB = 64;
  const bar = {};
  {
    const h = BLEN / 2, R1 = BR * 0.86;
    const prof = (y) => R1 + (BR - R1) * (1 - (y / h) ** 2);
    const pts = []; for (let i = 0; i <= 8; i++) { const y = -h + (2 * h * i) / 8; pts.push(new THREE.Vector2(prof(y), y)); }
    const body = new THREE.LatheGeometry(pts, 16);
    const headR = prof(h) - 0.012;
    const heads = [1, -1].map((s) => {
      const c = new THREE.CircleGeometry(headR, 16);
      c.rotateX(-s * Math.PI / 2); c.translate(0, s * (h - 0.01), 0);
      const uv = c.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.3 + uv.getX(i) * 0.4, 0.15 + uv.getY(i) * 0.7);
      return c;
    });
    const bodyGeo = mergeGeometries([body, ...heads].map((g) => g.toNonIndexed()));
    bodyGeo.rotateZ(-Math.PI / 2);            // axis along local X (across the belt)
    const hoopParts = [];
    for (const hy of [-0.255, -0.11, 0.11, 0.255]) {
      const lp = [new THREE.Vector2(prof(hy - 0.018) + 0.007, hy - 0.018), new THREE.Vector2(prof(hy + 0.018) + 0.007, hy + 0.018)];
      const g = new THREE.LatheGeometry(lp, 16).toNonIndexed(); g.deleteAttribute('uv'); hoopParts.push(g);
    }
    const hoopGeo = mergeGeometries(hoopParts); hoopGeo.rotateZ(-Math.PI / 2);
    const bungGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.03, 10); bungGeo.translate(0, BR + 0.003, 0);
    const foamParts = [];
    const FR = rng(77);
    for (let k = 0; k < 14; k++) {
      const a = FR() * 6.28, d = Math.sqrt(FR()) * 0.11;
      const g = new THREE.IcosahedronGeometry(0.025 + FR() * 0.03, 0); g.deleteAttribute('uv');
      g.scale(1, 0.6, 1); g.translate(Math.cos(a) * d, BR - 0.004 + (0.11 - d) * 0.12, Math.sin(a) * d * 1.3);
      foamParts.push(g);
    }
    const foamGeo = mergeGeometries(foamParts);
    const mk = (geo, mat, cast = true) => {
      const m = new THREE.InstancedMesh(geo, mat, MAXB);
      m.count = 0; m.frustumCulled = false; m.castShadow = cast; m.receiveShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      root.add(m); return m;
    };
    bar.dirty = mk(bodyGeo, new THREE.MeshLambertMaterial({ map: T.stavesDirty }));
    bar.clean = mk(bodyGeo, new THREE.MeshStandardMaterial({ map: T.staves, roughness: 0.34, metalness: 0.0, envMap, envMapIntensity: 0.9 }));
    bar.hoop = mk(hoopGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.42, envMap, envMapIntensity: 1.1 }));
    bar.bung = mk(bungGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), false);
    bar.foam = mk(foamGeo, new THREE.MeshLambertMaterial({ color: 0xf4ecd8, emissive: 0x3a3224 }), false);
    for (const k of ['clean', 'hoop', 'bung']) { bar[k].setColorAt(0, _c.set(0xffffff)); bar[k].instanceColor.setUsage(THREE.DynamicDrawUsage); }
  }
  const LOOK = {
    dirty: { body: null, hoop: new THREE.Color(0.22, 0.15, 0.11), bung: new THREE.Color(0.04, 0.03, 0.02), bungS: 1, foam: false },
    clean: { body: new THREE.Color(1.08, 1.0, 0.92), hoop: new THREE.Color(0.5, 0.5, 0.52), bung: new THREE.Color(0.05, 0.035, 0.02), bungS: 1, foam: false },
    full: { body: new THREE.Color(0.7, 0.55, 0.42), hoop: new THREE.Color(0.42, 0.42, 0.44), bung: new THREE.Color(0.96, 0.92, 0.8), bungS: 1, foam: true },
    capped: { body: new THREE.Color(0.8, 0.62, 0.46), hoop: new THREE.Color(0.95, 0.68, 0.28), bung: new THREE.Color(0.78, 0.08, 0.05), bungS: 1.55, foam: false },
  };

  // tags
  const tagMax = MAXB;
  const tagGeo = new THREE.InstancedBufferGeometry();
  {
    const base = new THREE.PlaneGeometry(1, 1);
    tagGeo.index = base.index; tagGeo.attributes.position = base.attributes.position; tagGeo.attributes.uv = base.attributes.uv;
    tagGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(tagMax * 3), 3).setUsage(THREE.DynamicDrawUsage));
    tagGeo.setAttribute('iTag', new THREE.InstancedBufferAttribute(new Float32Array(tagMax * 3), 3).setUsage(THREE.DynamicDrawUsage));
    tagGeo.setAttribute('iAlpha', new THREE.InstancedBufferAttribute(new Float32Array(tagMax), 1).setUsage(THREE.DynamicDrawUsage));
    tagGeo.instanceCount = 0;
  }
  const tagMesh = new THREE.Mesh(tagGeo, new THREE.ShaderMaterial({ uniforms: { map: { value: T.tags } }, vertexShader: TAG_VS, fragmentShader: TAG_FS, transparent: true, depthTest: false, depthWrite: false }));
  tagMesh.frustumCulled = false; tagMesh.renderOrder = 20;
  root.add(tagMesh);

  // stave debris for bursts
  const STAVES = 40;
  const staveGeo = new THREE.BoxGeometry(0.075, 0.025, BLEN * 0.95);
  staveGeo.translate(0, 0, 0);
  const staveMesh = new THREE.InstancedMesh(staveGeo, new THREE.MeshLambertMaterial({ map: T.stavesDirty, color: 0xd8c0a0 }), STAVES);
  staveMesh.count = 0; staveMesh.frustumCulled = false; staveMesh.castShadow = true;
  root.add(staveMesh);
  const staves = []; for (let i = 0; i < STAVES; i++) staves.push({ on: false });

  // puddles (beer / muddy water) pool of 4
  const puddles = [];
  for (let i = 0; i < 4; i++) {
    const g = blob(0, 0, 1, [0.26, 0.15, 0.05], [0.5, 0.38, 0.2], 100 + i);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0, envMap, envMapIntensity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.visible = false; m.renderOrder = 1; m.userData.dynamic = true;
    root.add(m); puddles.push({ mesh: m, t: 99 });
  }
  // red reject flash (floor ring)
  const flash = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.75, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.25, 0.15), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.rotation.x = -Math.PI / 2; flash.visible = false; flash.userData.dynamic = true; flash.renderOrder = 6;
  root.add(flash);
  let flashT = 99;

  const parts = createParticles(root, T4.puff, low ? 220 : 340);

  // ------------------------------------------------------------------ events
  const pool = new Map();     // id -> { x, z, tx, tz, state, next, age, pulse, drip, foam }
  const gone = new Set();     // ids handed over to a flyer (ship / reject) — hidden if the line still lists them
  const flyers = [];          // { kind, state, t, dur, from, to, path, s0, slot }
  let cargo = 0;             // barrels resting on the lorry
  let lastShipped = 0;

  const emitDrop = (p, vx, vy, vz, o = {}) => parts.emit({ x: p.x, y: p.y, z: p.z, vx, vy, vz, max: 0.5 + Math.random() * 0.3, s0: 0.05, s1: 0.035, a: 0.85, r: 0.75, g: 0.85, b: 0.95, drag: 0.6, grav: 7, fadeIn: 0.02, floor: 0.02, ...o });
  function washBurst(strength = 1) {
    for (const n of washRef.nozzles) {
      const c = n.down ? 2 : 3;
      for (let k = 0; k < c * strength; k++) {
        const vx = (washRef.center.x - n.p.x) * 2.4 + (Math.random() - 0.5) * 0.6, vz = (washRef.center.z - n.p.z) * 2.4 + (Math.random() - 0.5) * 0.6;
        emitDrop(n.p, vx, n.down ? -2.5 : 0.6 + Math.random(), vz, { floor: BH + 0.02 });
      }
    }
    for (let k = 0; k < 4 * strength; k++) parts.emit({ x: washRef.center.x + (Math.random() - 0.5) * 1.2, y: BH + 0.5, z: washRef.center.z + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 0.3, vy: 0.5 + Math.random() * 0.5, vz: -0.15, max: 1.6 + Math.random(), s0: 0.3, s1: 1.2, a: 0.16, r: 1, g: 1, b: 1, drag: 0.6 });
  }
  function foamPuff(p, n = 6) {
    for (let k = 0; k < n; k++) parts.emit({ x: p.x + (Math.random() - 0.5) * 0.1, y: p.y, z: p.z + (Math.random() - 0.5) * 0.1, vx: (Math.random() - 0.5) * 0.5, vy: 0.4 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.5, max: 0.6 + Math.random() * 0.4, s0: 0.08, s1: 0.16, a: 0.95, r: 1.05, g: 1.0, b: 0.88, drag: 1.5, grav: 2.5, fadeIn: 0.03, floor: BH + 2 * BR });
  }
  function chips(p) {
    for (let k = 0; k < 10; k++) parts.emit({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 2.4, vy: 1 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 2.4, max: 0.5, s0: 0.05, s1: 0.04, a: 1, r: 0.7, g: 0.5, b: 0.3, grav: 8, fadeIn: 0.01, floor: BH + 0.02 });
    for (let k = 0; k < 4; k++) parts.emit({ x: p.x, y: p.y + 0.05, z: p.z, vx: (Math.random() - 0.5) * 0.6, vy: 0.4, vz: (Math.random() - 0.5) * 0.6, max: 0.9, s0: 0.15, s1: 0.5, a: 0.35, r: 0.75, g: 0.68, b: 0.58, drag: 1.2 });
  }
  // a full barrel sent into the washer: the beer is rinsed out — amber gush + foam from the washer, no break
  let spillT = 99;
  function spill() {
    if (spillT < 0.3) return;
    spillT = 0;
    const c = washRef.center;
    for (let k = 0; k < 34; k++) parts.emit({ x: c.x + (Math.random() - 0.5) * 0.6, y: BH + 0.35, z: c.z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 2.2, vy: 0.6 + Math.random() * 2, vz: (Math.random() - 0.3) * 2.2, max: 0.8 + Math.random() * 0.4, s0: 0.08, s1: 0.05, a: 1, r: 0.92, g: 0.6, b: 0.14, grav: 8, fadeIn: 0.01, drag: 0.3 });
    for (let k = 0; k < 18; k++) parts.emit({ x: c.x + (Math.random() - 0.5) * 0.9, y: BH + 0.2, z: c.z + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 0.8, vy: 0.3 + Math.random() * 0.6, vz: 0.3 + Math.random() * 0.5, max: 1.6 + Math.random(), s0: 0.25, s1: 0.7, a: 0.95, r: 1.05, g: 0.98, b: 0.84, grav: 1.5, fadeIn: 0.03, drag: 1, floor: 0.05 });
    const pd = puddles.reduce((a, b) => (a.t > b.t ? a : b));
    pd.t = 0; pd.x = c.x + 0.3; pd.z = c.z + 0.9; pd.r = 1.0; pd.mesh.rotation.y = Math.random() * 6;
  }
  function burst(x, z) {
    const c = new THREE.Vector3(x, BH + BR, z);
    for (let k = 0; k < 12; k++) {
      const s = staves.find((q) => !q.on) || staves[(Math.random() * STAVES) | 0];
      const a = (k / 12) * Math.PI * 2 + Math.random() * 0.3;
      Object.assign(s, { on: true, t: 0, x: c.x + Math.cos(a) * 0.2, y: c.y + Math.sin(a) * 0.2, z: c.z, vx: Math.cos(a) * (1.5 + Math.random() * 2), vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 3 + Math.sin(a) * 1.5, rx: Math.random() * 6, ry: Math.random() * 6, rz: 0, wx: (Math.random() - 0.5) * 14, wy: (Math.random() - 0.5) * 10, rest: false });
    }
    for (let k = 0; k < 40; k++) parts.emit({ x: c.x, y: c.y, z: c.z, vx: (Math.random() - 0.5) * 5, vy: 1 + Math.random() * 3.5, vz: (Math.random() - 0.5) * 5, max: 0.7 + Math.random() * 0.5, s0: 0.09, s1: 0.06, a: 1, r: Math.random() < 0.5 ? 0.85 : 0.4, g: Math.random() < 0.5 ? 0.55 : 0.3, b: 0.15, grav: 9, fadeIn: 0.01, drag: 0.3 });
    for (let k = 0; k < 16; k++) parts.emit({ x: c.x, y: c.y, z: c.z, vx: (Math.random() - 0.5) * 2, vy: 0.8 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 2, max: 1.0 + Math.random() * 0.6, s0: 0.2, s1: 0.6, a: 0.9, r: 1.0, g: 0.95, b: 0.82, grav: 3, fadeIn: 0.02, drag: 1.2 });
    for (let k = 0; k < 8; k++) parts.emit({ x: c.x, y: c.y, z: c.z, vx: (Math.random() - 0.5) * 1.2, vy: 0.6 + Math.random(), vz: (Math.random() - 0.5) * 1.2, max: 1.8, s0: 0.4, s1: 1.6, a: 0.35, r: 0.45, g: 0.36, b: 0.26, drag: 0.8 });
    const pd = puddles.reduce((a, b) => (a.t > b.t ? a : b));
    pd.t = 0; pd.x = x + 0.25; pd.z = z + 0.2; pd.r = 0.9 + Math.random() * 0.3; pd.mesh.rotation.y = Math.random() * 6;
  }
  function startFlyer(kind, id, x, z) {
    const rec = pool.get(id);
    gone.add(id);
    const state = rec?.state || (kind === 'ship' ? 'capped' : 'dirty');
    const from = new THREE.Vector3(rec?.x ?? x ?? 0, BH + BR, rec?.z ?? z ?? 0);
    if (kind === 'ship') {
      const sp = branch.ship.path, s0 = sp.project(from.x, from.z).s;
      const slot = cargo < cargoSlots.length ? cargoSlots[cargo] : null;
      const to = slot ? slot.clone() : new THREE.Vector3(room.minX - 2.0, 1.1 + BR, shipEnd.z);
      flyers.push({ kind, id, state, t: 0, path: sp, s0, belt: Math.max(0.01, sp.length - s0), from, to, slot: !!slot });
      if (slot) cargo++;
      shipRef.t = 0;
    } else {
      const pile = piles[kind];
      const slot = pile.slots[pile.n++ % pile.slots.length];
      flyers.push({ kind, id, state, t: 0, dur: 0.75, from, to: slot.clone(), pile });
      flashT = 0; flash.position.set(from.x, BH + 0.02, from.z);
      for (let k = 0; k < 14; k++) parts.emit({ x: from.x, y: BH + 0.5, z: from.z, vx: (Math.random() - 0.5) * 2, vy: 0.5 + Math.random(), vz: (Math.random() - 0.5) * 2, max: 0.5, s0: 0.12, s1: 0.04, a: 1, r: 3, g: 0.4, b: 0.25, drag: 1.5, fadeIn: 0.01 });
    }
  }
  const on = (n, f) => events?.on?.(n, (e) => { try { f(e || {}); } catch (err) { console.warn('[hall]', n, err); } });
  on('line:station', (e) => {
    const rec = pool.get(e.id);
    if (e.station === 'wash') {
      if (e.effect === 'wash') { washRef.t = 0; if (rec) rec.drip = 1.6; } else if (e.effect === 'spill') spill(); else washRef.pass = 0;
    } else if (e.station === 'fill') {
      if (e.effect === 'fill') { fillRef.t = 0; if (rec) rec.foam = 1.4; }
    } else if (e.station === 'cap') {
      if (e.effect === 'cap') { capRef.t = 0; }
    } else if (e.station === 'ship') { if (e.effect !== 'pass') shipRef.t = 0; }
  });
  on('line:burst', (e) => { gone.add(e.id); const rec = pool.get(e.id); burst(e.x ?? rec?.x ?? fillRef.head.x, e.z ?? rec?.z ?? fillRef.head.z); });
  on('line:reject', (e) => startFlyer(e.where === 'cap' ? 'rejectCap' : 'reject', e.id, e.x, e.z));
  on('line:spill', () => spill());
  on('line:ship', (e) => startFlyer('ship', e.id));
  on('line:spawn', () => { liftRef.t = 0; });

  // ------------------------------------------------------------------ debug: ?artvis=1 (fake line), ?artcam=..., ?hideui=1
  const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const ARTVIS = qs?.get('artvis');
  const artcam = qs?.get('artcam')?.split(',').map(Number);
  if (artcam?.length === 6) { camera.position.set(artcam[0], artcam[1], artcam[2]); camera.lookAt(artcam[3], artcam[4], artcam[5]); }
  if (qs?.get('hideui')) { const st = document.createElement('style'); st.textContent = 'body > *:not(#app){display:none!important}'; document.head.appendChild(st); }
  const fake = { t: 0, ev: 0, k: 0 };
  function fakeLine(dt) {
    fake.t += dt;
    const speed = 1.5, S = ['dirty', 'clean', 'full', 'capped'];
    const barrels = [];
    const add = (id, belt, path, s, state, waiting = false) => { const p = path.at(s); barrels.push({ id, belt, s, x: p.x, z: p.z, tx: p.tx, tz: p.tz, state, next: NEXT_STATION[state], waiting, age: fake.t }); };
    const ring = belts.ring;
    for (let k = 0; k < 10; k++) add(k, 'ring', ring, (fake.t * speed + k * 2.85) % ring.length, S[k % 4]);
    let id = 100;
    for (const b of Object.values(belts.branches)) {
      const L2 = b.path.length;
      add(id++, b.id, b.path, b.exit ? (fake.t * speed * 0.7) % L2 : Math.min(L2 - 0.3, (fake.t * speed * 0.6) % (L2 + 1.5)), b.id === 'wash' ? 'dirty' : b.id === 'fill' ? 'clean' : b.id === 'cap' ? 'full' : 'capped', !b.exit && (fake.t * speed * 0.6) % (L2 + 1.5) > L2 - 0.3);
    }
    add(200, 'entry', belts.entry.path, (fake.t * 0.8) % belts.entry.path.length, 'dirty');
    const sw = { wash: Math.floor(fake.t / 3) % 2 === 0, fill: Math.floor(fake.t / 3.7) % 2 === 1, cap: Math.floor(fake.t / 2.6) % 2 === 0, ship: Math.floor(fake.t / 4.1) % 2 === 1 };
    fake.ev += dt;
    if (fake.ev > 1.1) {
      fake.ev = 0; fake.k++;
      const k = fake.k % 8;
      const emit = (n, p) => events?.emit?.(n, p);
      if (k === 0) emit('line:station', { station: 'wash', id: 100, effect: 'wash' });
      if (k === 1) emit('line:station', { station: 'fill', id: 101, effect: 'fill' });
      if (k === 2) emit('line:station', { station: 'cap', id: 102, effect: 'cap' });
      if (k === 3) emit('line:burst', { id: -1, x: fillRef.head.x, z: fillRef.head.z });
      if (k === 4) emit('line:reject', { id: -2 - fake.k, x: -7.0, z: 3.9 });
      if (k === 5) emit('line:ship', { id: -3 - fake.k });
      if (k === 6) emit('line:spawn', { id: 300 });
      if (k === 7) { emit('line:station', { station: 'ship', id: 103, effect: 'ship' }); if (fake.k % 16 === 7) emit('line:spill', { id: 100 }); else emit('line:reject', { id: -9 - fake.k, x: capRef.hit.x, z: capRef.hit.z, where: 'cap' }); }
    }
    return { liftQueue: 1 + (Math.floor(fake.t / 2) % 5), time: fake.t, speed, shipped: Math.floor(fake.t / 8.8), quota: 12, strikes: 0, maxStrikes: 3, switches: sw, barrels };
  }

  // ------------------------------------------------------------------ update
  let warmed = false, beltOff = 0, moteAcc = 0, steamAcc = 0, pitchAcc = 0;
  let lastTime = 0;
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  const X = new THREE.Vector3(), Yv = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3();
  const counts = { dirty: 0, clean: 0, hoop: 0, bung: 0, foam: 0 };
  let tagN = 0;
  const iPos = tagGeo.attributes.iPos, iTag = tagGeo.attributes.iTag, iAlpha = tagGeo.attributes.iAlpha;
  const tagCell = (next, waiting) => [Math.max(0, TAG_ORDER.indexOf(next)) * 0.25, waiting ? 0 : 0.5];

  function putBarrel(x, y, z, tx, tz, state, extra = {}) {
    const look = LOOK[state] || LOOK.dirty;
    X.set(-tz, 0, tx).normalize(); Z.crossVectors(X, Yv);
    tmpM.makeBasis(X, Yv, Z);
    if (extra.upright) tmpM.makeBasis(Yv, _v2.set(-tx, 0, -tz), _v.set(-tz, 0, tx));
    if (extra.roll) tmpM.multiply(_m.makeRotationX(extra.roll));
    if (extra.tilt) tmpM.premultiply(_m.makeRotationAxis(_v.set(tx, 0, tz).normalize(), extra.tilt));
    const sc = extra.scale ?? 1;
    tmpM.scale(tmpS.set(sc, sc, sc));
    tmpM.setPosition(x, y, z);
    if (state === 'dirty') { if (counts.dirty < MAXB) bar.dirty.setMatrixAt(counts.dirty++, tmpM); }
    else if (counts.clean < MAXB) { bar.clean.setMatrixAt(counts.clean, tmpM); bar.clean.setColorAt(counts.clean++, look.body); }
    if (counts.hoop < MAXB) { bar.hoop.setMatrixAt(counts.hoop, tmpM); bar.hoop.setColorAt(counts.hoop++, look.hoop); }
    if (!extra.noBung && counts.bung < MAXB) {
      _m.copy(tmpM);
      if (look.bungS !== 1) _m.multiply(_m2.makeScale(look.bungS, 1.4, look.bungS));
      bar.bung.setMatrixAt(counts.bung, _m); bar.bung.setColorAt(counts.bung++, look.bung);
    }
    if (look.foam && counts.foam < MAXB) bar.foam.setMatrixAt(counts.foam++, tmpM);
  }
  const _m2 = new THREE.Matrix4();
  function putTag(x, y, z, next, waiting, scale = 1, alpha = 1) {
    if (tagN >= tagMax) return;
    const [u, v] = tagCell(next, waiting);
    iPos.setXYZ(tagN, x, y, z); iTag.setXYZ(tagN, u, v, 0.62 * scale); iAlpha.setX(tagN, alpha);
    tagN++;
  }

  let infoT = 0, simDone = false;
  const ARTSIM = +(qs?.get('artsim') || 0);
  function update(dt, t, vis = {}) {
    // ?artsim=N: fast-forward the real line N seconds with random switching (debug screenshots)
    if (ARTSIM && !simDone && window.__game?.line) {
      simDone = true;
      const g = window.__game, ln = g.line, RS = rng(7);
      g.setState?.('playing');
      for (let i = 0; i < ARTSIM * 30; i++) {
        if (RS() < 1 / 50) ln.toggle(['wash', 'fill', 'cap', 'ship'][(RS() * 4) | 0]);
        ln.update(1 / 30, true);
        update(1 / 30, t - ARTSIM + i / 30, { state: 'playing', line: ln.state });
      }
    }
    if (qs?.get("artinfo") && ++infoT === 12 + ARTSIM * 30) { infoT = -1e9; const i = renderer.info.render; let tri = 0; console.log(`[hall] calls=${i.calls} tris=${i.triangles} hallTris=${(() => { root.traverse((o) => { if (o.isMesh && o.geometry.index) tri += o.geometry.index.count / 3 * (o.isInstancedMesh ? o.count : 1); else if (o.isMesh) tri += o.geometry.attributes.position.count / 3 * (o.isInstancedMesh ? o.count : 1); }); return Math.round(tri); })()} meshes=${(() => { let n = 0; root.traverse((o) => { if (o.isMesh && o.visible) n++; }); return n; })()}`); }
    if (ARTVIS) {
      if (!warmed) { warmed = true; for (let i = 0; i < 60; i++) update(1 / 30, t - 2 + i / 30, vis); }
      dt = Math.max(dt, 1 / 15);
      vis = { state: 'playing', line: fakeLine(dt) };
    }
    const line = vis.line || {};
    const playing = vis.state === 'playing' || vis.state === 'menu' || !!ARTVIS;
    const speed = line.speed ?? 1.3;

    // new run → clear lorry cargo, pen and transient state
    if ((line.time ?? 0) < lastTime - 0.5 || ((line.shipped ?? 0) === 0 && lastShipped > 0)) { cargo = 0; for (const k in piles) { piles[k].list.length = 0; piles[k].n = 0; } flyers.length = 0; gone.clear(); pool.clear(); }
    lastTime = line.time ?? 0; lastShipped = line.shipped ?? 0;

    // belts scroll with the line speed
    if (playing) { beltOff = (beltOff + speed * dt) % 1000; T.belt.offset.y = -beltOff; }

    // switches
    const sws = line.switches || {};
    for (let i = 0; i < switchRefs.length; i++) {
      const s = switchRefs[i], want = sws[s.id] ? 1 : 0;
      if (!!want !== s.last) {
        s.last = !!want;
        const p = s.holder.position;
        for (let k = 0; k < 5; k++) parts.emit({ x: p.x, y: BH + 0.3, z: p.z, vx: (Math.random() - 0.5) * 0.8, vy: 0.3 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.8, max: 0.6, s0: 0.12, s1: 0.35, a: 0.25, r: 0.8, g: 0.75, b: 0.7, drag: 2 });
      }
      s.ang += (want - s.ang) * Math.min(1, dt * 11);
      s.on += (want - s.on) * Math.min(1, dt * 14);
      // arm swing (shortest angle)
      let d = s.yawDivert - s.yawStraight; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      s.holder.rotation.y = s.yawStraight + d * s.ang;
      // disk colour: dim enamel when straight, glowing when diverting
      const pulse = 1 + 0.12 * Math.sin(t * 6) * s.on;
      _c.copy(s.col).multiplyScalar((0.42 + 1.9 * s.on) * pulse);
      discs.setColorAt(i, _c);
      // arrow in-plane angle
      let da = s.aD - s.aS; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      tmpQ.copy(s.q).multiply(tmpQ2.setFromAxisAngle(_v.set(0, 0, 1), s.aS + da * s.ang));
      tmpM.compose(tmpP.copy(s.disc).add(_v2.set(0, 0, 0.01).applyQuaternion(s.q)), tmpQ, tmpS.set(1, 1, 1));
      arrows.setMatrixAt(i, tmpM);
      // glows: halo behind the disk + pool on the deck where the arm sits
      tmpM.compose(tmpP.copy(s.disc).add(_v2.set(0, 0, -0.02).applyQuaternion(s.q)), s.q, tmpS.set(1.7, 1.7, 1));
      swGlow.setMatrixAt(i * 2, tmpM); swGlow.setColorAt(i * 2, _c.copy(s.col).multiplyScalar(1.1 * s.on));
      tmpM.compose(s.pool, tmpQ.setFromEuler(_e.set(-Math.PI / 2, 0, 0)), tmpS.set(2.1, 2.1, 1));
      swGlow.setMatrixAt(i * 2 + 1, tmpM); swGlow.setColorAt(i * 2 + 1, _c.copy(s.col).multiplyScalar(0.55 * s.on));
    }
    discs.instanceColor.needsUpdate = true; arrows.instanceMatrix.needsUpdate = true;
    swGlow.instanceMatrix.needsUpdate = true; if (swGlow.instanceColor) swGlow.instanceColor.needsUpdate = true;

    // barrels from the line
    counts.dirty = counts.clean = counts.hoop = counts.bung = counts.foam = 0; tagN = 0;
    const seen = new Set();
    for (const b of line.barrels || []) {
      if (gone.has(b.id)) continue;
      seen.add(b.id);
      let rec = pool.get(b.id);
      if (!rec) { rec = { age: 0, pulse: 0, drip: 0, foam: 0, next: b.next }; pool.set(b.id, rec); }
      rec.x = b.x; rec.z = b.z; rec.tx = b.tx; rec.tz = b.tz; rec.state = b.state; rec.age += dt;
      if (rec.next !== b.next) { rec.next = b.next; rec.pulse = 1; }
      rec.pulse = Math.max(0, rec.pulse - dt * 2.5); rec.drip = Math.max(0, rec.drip - dt); rec.foam = Math.max(0, rec.foam - dt);
      const pop = Math.min(1, rec.age / 0.25);
      const sc = 0.6 + 0.4 * pop;
      putBarrel(b.x, BH + BR * sc, b.z, b.tx ?? 1, b.tz ?? 0, b.state, { scale: sc });
      const bob = Math.sin(t * 3 + b.id * 1.7) * 0.025;
      const ts = (1 + rec.pulse * 0.5) * (b.waiting ? 0.92 + 0.08 * Math.sin(t * 8) : 1) * pop;
      putTag(b.x, BH + 2 * BR + 0.4 + bob, b.z, b.next, !!b.waiting, ts);
      // per-barrel FX trails
      if (rec.drip > 0 && Math.random() < dt * 14) emitDrop(_v.set(b.x + (Math.random() - 0.5) * 0.5, BH + 0.3, b.z + (Math.random() - 0.5) * 0.3), 0, -0.2, 0, { floor: 0.02, max: 0.4 });
      if (rec.foam > 0 && Math.random() < dt * 18) foamPuff(_v.set(b.x, BH + 2 * BR + 0.03, b.z), 1);
    }
    for (const id of pool.keys()) if (!seen.has(id)) pool.delete(id);
    for (const id of gone) if (!seen.has(id) && !flyers.some((f) => f.id === id)) gone.delete(id);

    // flyers: dispatched barrels roll to the lorry, rejected ones are shoved into the pen
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt;
      if (f.kind === 'ship') {
        const v = Math.max(1.6, speed);
        const tBelt = f.belt / v, tUp = 0.7;
        if (f.t < tBelt) {
          const p = f.path.at(f.s0 + f.t * v);
          putBarrel(p.x, BH + BR, p.z, p.tx, p.tz, f.state);
        } else if (f.t < tBelt + tUp) {
          const u = (f.t - tBelt) / tUp, e = u * u * (3 - 2 * u);
          const sx = shipEnd.x, sz = shipEnd.z;
          putBarrel(sx + (f.to.x - sx) * e, BH + BR + (f.to.y - BH - BR) * e + Math.sin(u * Math.PI) * 0.15, sz + (f.to.z - sz) * e, -1, 0, f.state);
        } else {
          if (!f.slot) { flyers.splice(i, 1); continue; }
          f.done = true;
          putBarrel(f.to.x, f.to.y, f.to.z, 1, 0, f.state); // axis along the lorry width (world Z): tangent +X
        }
      } else {
        const u = Math.min(1, f.t / f.dur), e = 1 - (1 - u) * (1 - u);
        const x = f.from.x + (f.to.x - f.from.x) * e, z = f.from.z + (f.to.z - f.from.z) * e;
        const y = f.from.y + (f.to.y - f.from.y) * e + Math.sin(u * Math.PI) * 0.35;
        putBarrel(x, y, z, 1, 0, f.state, { tilt: u * 0.25 });
        if (u >= 1 && !f.done) {
          f.done = true; f.pile.list.push(f);
          if (f.pile.list.length > f.pile.slots.length) { const old = f.pile.list.shift(); const j = flyers.indexOf(old); if (j >= 0) flyers.splice(j, 1); }
        }
      }
    }
    // barrels waiting in the lift: standing in a row along the wall next to the cage
    const lq = Math.min(LIFTQ.length, line.liftQueue | 0);
    for (let i = 0; i < lq; i++) { const q = LIFTQ[i]; putBarrel(q.x, BLEN / 2, q.z, 1, 0, 'dirty', { upright: true, noBung: true }); }
    for (const k of ['dirty', 'clean', 'hoop', 'bung', 'foam']) { bar[k].count = counts[k]; bar[k].instanceMatrix.needsUpdate = true; if (bar[k].instanceColor) bar[k].instanceColor.needsUpdate = true; }
    tagGeo.instanceCount = tagN; iPos.needsUpdate = iTag.needsUpdate = iAlpha.needsUpdate = true;

    // ---- station animations
    // washer
    washRef.t += dt; washRef.pass += dt;
    if (washRef.t < 1.0) { if (Math.random() < 0.9) washBurst(0.35); }
    else if (washRef.pass < 0.4 && Math.random() < 0.3) washBurst(0.1);
    steamAcc += dt * 2.2;
    while (steamAcc >= 1) { steamAcc -= 1; const p = washRef.vent; parts.emit({ x: p.x, y: p.y, z: p.z, vx: 0.1 + (Math.random() - 0.5) * 0.2, vy: 0.5 + Math.random() * 0.4, vz: -0.25, max: 2.2, s0: 0.25, s1: 1.1, a: 0.1, r: 1, g: 1, b: 1, drag: 0.5 }); }
    spillT += dt;
    if (spillT < 0.8 && Math.random() < 0.7) foamPuff(washRef.center, 2);
    // filler nozzle: quick drop, hold, rise
    fillRef.t += dt;
    {
      const ft = fillRef.t;
      const k = ft < 0.1 ? ft / 0.1 : ft < 0.42 ? 1 : ft < 0.7 ? 1 - (ft - 0.42) / 0.28 : 0;
      fillRef.nozzle.position.y = fillRef.rest + (fillRef.low - fillRef.rest) * k;
      if (ft < 0.45 && Math.random() < 0.8) foamPuff(fillRef.head, 2);
    }
    // bung driver: slam + recoil (double knock)
    capRef.t += dt;
    {
      const ct = capRef.t;
      let k = 0;
      if (ct < 0.06) k = ct / 0.06; else if (ct < 0.16) k = 1 - (ct - 0.06) / 0.1 * 0.6; else if (ct < 0.22) k = 0.4 + (ct - 0.16) / 0.06 * 0.6; else if (ct < 0.6) k = 1 - (ct - 0.22) / 0.38; else k = 0;
      capRef.ram.position.y = capRef.rest + (capRef.strike - capRef.rest) * k;
      if ((ct - dt < 0.06 && ct >= 0.06) || (ct - dt < 0.22 && ct >= 0.22)) chips(capRef.hit);
    }
    // dispatch signal arm lifts briefly
    shipRef.t += dt;
    { const st = shipRef.t, k = st < 0.15 ? st / 0.15 : st < 0.8 ? 1 : st < 1.2 ? 1 - (st - 0.8) / 0.4 : 0; shipRef.arm.rotation.z = k * 0.9; }
    // lift: gate lifts + bell swings
    liftRef.t += dt;
    {
      const lt = liftRef.t, k = lt < 0.25 ? lt / 0.25 : lt < 1.0 ? 1 : lt < 1.4 ? 1 - (lt - 1.0) / 0.4 : 0;
      liftRef.gate.position.y = liftRef.gateY + k * 0.75;
      liftRef.bell.rotation.x = lt < 1.6 ? Math.sin(lt * 18) * 0.5 * (1 - lt / 1.6) : 0;
    }
    // pitch kettle smoke
    pitchAcc += dt * 1.4;
    while (pitchAcc >= 1) { pitchAcc -= 1; const p = pitchRef.mouth; parts.emit({ x: p.x + (Math.random() - 0.5) * 0.4, y: p.y, z: p.z + (Math.random() - 0.5) * 0.4, vx: 0.05, vy: 0.4 + Math.random() * 0.3, vz: 0.1, max: 3.2, s0: 0.3, s1: 1.5, a: 0.18, r: 0.32, g: 0.28, b: 0.24, drag: 0.4 }); }
    // dust motes in the window light
    moteAcc += dt * (low ? 2 : 4);
    while (moteAcc >= 1) { moteAcc -= 1; parts.emit({ x: -9 + Math.random() * 18, y: 0.8 + Math.random() * 3, z: -6 + Math.random() * 5, vx: (Math.random() - 0.5) * 0.06, vy: (Math.random() - 0.5) * 0.04, vz: (Math.random() - 0.5) * 0.06, max: 5 + Math.random() * 3, s0: 0.035, s1: 0.035, a: 0.5, r: 1.4, g: 1.45, b: 1.5, drag: 0.1, fadeIn: 0.3 }); }

    // stave debris
    let sn = 0;
    for (const s of staves) {
      if (!s.on) continue;
      s.t += dt;
      if (s.t > 5) { s.on = false; continue; }
      if (!s.rest) {
        s.vy -= 9.8 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.rx += s.wx * dt; s.ry += s.wy * dt;
        if (s.y < 0.03) { s.y = 0.03; if (Math.abs(s.vy) < 1.2) { s.rest = true; s.rx = Math.PI / 2 * Math.round(s.rx / (Math.PI / 2)); s.rx = 0; } else { s.vy = -s.vy * 0.3; s.vx *= 0.5; s.vz *= 0.5; s.wx *= 0.5; } }
      }
      const sink = s.t > 4 ? (s.t - 4) * 0.05 : 0;
      tmpM.compose(tmpP.set(s.x, s.y - sink, s.z), tmpQ.setFromEuler(_e.set(s.rx, s.ry, s.rz)), tmpS.set(1, 1, 1));
      staveMesh.setMatrixAt(sn++, tmpM);
    }
    staveMesh.count = sn; staveMesh.instanceMatrix.needsUpdate = true;
    // puddles
    for (const p of puddles) {
      p.t += dt;
      const vis2 = p.t < 9;
      p.mesh.visible = vis2;
      if (!vis2) continue;
      const grow = Math.min(1, 0.3 + p.t / 0.6), fade = p.t < 6 ? 1 : 1 - (p.t - 6) / 3;
      p.mesh.position.set(p.x, 0.013, p.z);
      p.mesh.scale.set(p.r * grow, 1, p.r * grow);
      p.mesh.material.opacity = 0.85 * fade;
    }
    // reject flash
    flashT += dt;
    flash.visible = flashT < 0.7;
    if (flash.visible) { const u = flashT / 0.7; flash.scale.setScalar(0.6 + u * 1.4); flash.material.opacity = (1 - u) * 0.9; }

    parts.update(dt);
  }

  return { update, envMap, lights: { key, day, lampL, lampR }, truck };
}
