// Level 4 "Varna" — the brewhouse interior + catwalk + hazard visuals for the first-person run (owner: art).
// An upper floor of the Světovar brewhouse, c. 1913–1930 (refs: docs/reference/indoor/i1–i7): a long L-shaped hall with
// plastered walls over a glazed-tile dado, tall dirty arched windows (weak cold daylight shafts), cast-iron columns,
// riveted ceiling girders, pipe runs with valves, enamel signs and lamps. A riveted steel catwalk with grating panels
// runs through it 6 m above the tiled floor; below it, per section: mash tuns with stirring gear, the lauter tun with
// its rotating rake, three hero copper wort kettles with onion hoods and vapour stacks, the hop store (jute sacks,
// hoists), the cooling floor (one huge shallow iron pan), and the main steam valve platform at the finish.
//
// Everything is built from ctx.course (path, sections, hazards — read at runtime, never hard-coded) and ctx.run.
// Static geometry is merged per material per 40 m chunk of course (frustum culling); hazards animate through the
// shared timing helpers of course.js so visuals match the simulation.
//
// Lights (4): three warm SpotLights that hop between the pendant lamps nearest ahead of the runner (with fades),
// one cold DirectionalLight "through the windows". No shadow maps; contact darkening is baked in vertex colours,
// lamp pools are additive decals. Fog: FogExp2 set on the scene here (warm dark haze).
//
// Debug URL params (work without runner.js):
//   &artcam=s,lat[,h,lookAhead]   first-person camera at course arc length s, lateral lat (m), eye height h above the deck
//   &artcam=x,y,z,tx,ty,tz        free camera (world position + target)
//   &artt=12.3                    freeze the hazard clock at this race time
//   &artfall=1                    all falling sacks/crates triggered at race time 0 (so they lie on the deck when artt ≥ 0.8)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTextures, rng, WALLT, DECALS4, GRATE } from './textures.js';
import { COURSE, steamLevel, dripState, fallProgress, BLOCK_HEIGHT } from './course.js';

// palette (sRGB)
const IRON = 0x2b2c2f, IRON2 = 0x3c3e42, STEEL = 0x9a968a, STEEL_D = 0x3f3c38, RED_LEAD = 0x9a3b22, RED_WHEEL = 0xa3281c;
const COLUMN = 0xb3ac9a, COLUMN2 = 0x958e7e, VAT_GREEN = 0x4b5a50, VAT_GREY = 0x6a6a62, LAGGING = 0xd9d0bb, CREAM = 0xe2d8c0;
const WOOD = 0x8d6a45, WOOD2 = 0x6e5136, WOOD_DARK = 0x4c3828, STONE = 0x9c9282, MASH = 0x7d5a32, GRAIN = 0x9a7a44;
const ENAMEL_G = 0x2e5845, ENAMEL_W = 0xece4d0, CEILING = 0x8a8170, BEAM = 0x34353a, BRASS = 0xd0a24c;
const FOG_COL = 0x241c15, FOG_D = 0.0165;

const params = new URLSearchParams(location.search);

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

  const path = course.path, L = course.length, LW = run.laneWidth, DY = run.deckY, HALF = run.deckWidth / 2;
  const H = 10.5;            // hall half width (catwalk centre line → wall)
  const CEIL = 13.8;         // ceiling height above the hall floor
  const CH = 40;             // chunk length along the course (m)
  const RAIL = HALF + 0.05;  // railing line
  const LANE_EDGE = 1.5 * LW;
  const E0 = 4.5;            // hall extends this far behind s = 0
  const sF0 = Math.min(L - 6, course.finish - 4); // finish platform starts here
  const sEnd = L + 1.2;      // platform end; the end wall stands at L + 2.6
  const E1 = 2.6;
  const holeSpan = (h) => [h.s - h.len / 2, h.s + h.len / 2];
  const hazards = course.hazards || [];
  const sections = course.sections || [];
  const secAt = (s) => (sections.find((q) => s >= q.from && s < q.to) || sections[sections.length - 1] || { id: 'mash' }).id;

  scene.fog = new THREE.FogExp2(FOG_COL, FOG_D);
  scene.background = new THREE.Color(FOG_COL);
  const envMap = buildEnvMap(renderer);

  // ------------------------------------------------------------------ course frame helpers
  function fr(s) {
    const c = Math.max(0, Math.min(L, s)), p = path.at(c), e = s - c;
    return { x: p.x + p.tx * e, z: p.z + p.tz * e, tx: p.tx, tz: p.tz, rx: -p.tz, rz: p.tx };
  }
  /** world point at arc length s, lateral lat (m, + = right), height y */
  const W = (s, lat = 0, y = 0) => { const f = fr(s); return [f.x + f.rx * lat, y, f.z + f.rz * lat]; };
  /** local frame at (s, lat): p(along, lateral, y) → world; o(...) → Batch placement (local +Z forward, +X = LEFT) */
  function frameAt(s, lat = 0) {
    const f = fr(s), ox = f.x + f.rx * lat, oz = f.z + f.rz * lat, yaw = Math.atan2(f.tx, f.tz);
    return {
      s, yaw, f,
      p: (a, l, y) => [ox + f.tx * a + f.rx * l, y, oz + f.tz * a + f.rz * l],
      o(a, l, y, extra = {}) { const q = this.p(a, l, y); return { ...extra, order: 'YXZ', x: q[0], y: q[1], z: q[2], ry: yaw + (extra.ry || 0) }; },
    };
  }
  // corners of the course polyline
  const P = (course.points || COURSE.points).map(([x, z]) => ({ x, z }));
  const legs = [];
  for (let i = 0; i < P.length - 1; i++) {
    const dx = P[i + 1].x - P[i].x, dz = P[i + 1].z - P[i].z, len = Math.hypot(dx, dz);
    legs.push({ a: P[i], b: P[i + 1], dx: dx / len, dz: dz / len, rx: -dz / len, rz: dx / len, len });
  }
  const corners = [];
  const radius = course.radius ?? COURSE.radius ?? 3.5;
  for (let i = 1; i < P.length - 1; i++) {
    const a = legs[i - 1], b = legs[i];
    const cross = a.dx * b.dz - a.dz * b.dx, ang = Math.acos(Math.max(-1, Math.min(1, a.dx * b.dx + a.dz * b.dz)));
    const sc = path.project(P[i].x, P[i].z).s, half = radius * ang / 2 + 0.05;
    corners.push({ p: P[i], a, b, inner: Math.sign(cross), sc, s0: sc - half, s1: sc + half, k: 1 + a.rx * b.rx + a.rz * b.rz });
  }
  const inCorner = (s, pad = 0) => corners.some((c) => s > c.s0 - pad && s < c.s1 + pad);
  /** miter point of the offset lines at a corner (lat + = right) */
  const miter = (c, lat) => [c.p.x + lat * (c.a.rx + c.b.rx) / c.k, c.p.z + lat * (c.a.rz + c.b.rz) / c.k];
  /** sample list a..b: coarse on straights, fine in fillets, always split at chunk boundaries */
  function samples(a, b, step = 2) {
    const out = [a]; let s = a;
    while (s < b - 1e-6) {
      let n = s + (inCorner(s + 0.01, 0.2) ? 0.3 : step);
      for (const c of corners) if (s < c.s0 - 0.2 && n > c.s0 - 0.2) n = c.s0 - 0.2;
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
    brick: new THREE.MeshLambertMaterial({ map: T.brick }),
    glass: new THREE.MeshBasicMaterial({ map: T.glass, color: new THREE.Color(0.95, 1.05, 1.2) }),
    copper: new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.copper.color, metalness: 1, roughness: 0.4, roughnessMap: T.copper.rough, envMap, envMapIntensity: 1.35 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.36, envMap, envMapIntensity: 1.2 }),
    atlas: new THREE.MeshLambertMaterial({ map: T.decals4, vertexColors: true, alphaTest: 0.35, polygonOffset: true, polygonOffsetFactor: -2, emissiveMap: T.decals4, emissive: 0x3e3830 }),
    stain: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.42, 0.34), transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
    voids: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.18, 0.16), transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide }),
    glow: glowPatch(new THREE.MeshBasicMaterial({ map: T.pool, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })),
    shaft: glowPatch(new THREE.MeshBasicMaterial({ map: T.shaft, color: new THREE.Color(0.5, 0.6, 0.74), transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 6),
    bulbs: new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.3, 2.4) }),
    fire: new THREE.MeshBasicMaterial({ map: T.fire, color: new THREE.Color(2, 2, 2) }),
    wort: new THREE.MeshStandardMaterial({ color: 0x2a1508, roughness: 0.16, metalness: 0.0, envMap, envMapIntensity: 0.45 }),
  };
  const DEFS = {
    props: {}, ceil: {}, walls: { color: false, uv: true, post: wallUV }, floor: { uv: true }, deck: { uv: true },
    brick: { color: false, uv: true }, glass: { color: false, uv: true }, copper: { color: false, uv: true },
    metal: {}, atlas: { uv: true }, voids: { color: false }, stain: { color: false }, glow: { uv: true }, shaft: { color: false, uv: true }, bulbs: { color: false },
    fire: { color: false, uv: true }, wort: { color: false },
  };
  const ORDER = { glow: 2, shaft: 3, voids: 1, stain: 1 };
  const chunks = new Map();
  let curS = 0;
  const at = (s) => { curS = s; };
  function B(name) {
    const k = Math.max(0, Math.floor(curS / CH));
    let c = chunks.get(k); if (!c) chunks.set(k, c = {});
    return c[name] || (c[name] = new Batch(DEFS[name]));
  }
  class Router extends Batch { constructor(name) { super(DEFS[name]); this.name = name; } add(g, c, o) { return B(this.name).add(g, c, o); } }
  const ceil = new Router('ceil');
  const props = new Router('props'), walls = new Router('walls'), floor = new Router('floor'), deck = new Router('deck');
  const brick = new Router('brick'), glass = new Router('glass'), copper = new Router('copper'), metal = new Router('metal');
  const atlas = new Router('atlas'), glows = new Router('glow'), shafts = new Router('shaft'), bulbs = new Router('bulbs');
  const fireB = new Router('fire'), wort = new Router('wort'), voids = new Router('voids'), stain = new Router('stain');
  const sOf = (x, z) => path.project(x, z).s;
  const atXZ = (x, z) => at(sOf(x, z));

  /** atlas quad (decal) at a world position facing direction (nx, nz) (vertical) or custom quaternion */
  function decal(rect, w, h, pos, q, tint = 0xffffff) {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * (rect[2] - rect[0]), rect[1] + uv.getY(i) * (rect[3] - rect[1]));
    atlas.add(g, tint, { x: pos[0], y: pos[1], z: pos[2], q });
  }
  const qYaw = (yaw, pitch = 0) => new THREE.Quaternion().setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
  const qFlat = (yaw = 0) => new THREE.Quaternion().setFromEuler(_e.set(-Math.PI / 2, yaw, 0, 'YXZ'));
  /** additive soft pool (floor/deck glow) */
  function pool(x, y, z, size, col, q = null) {
    glows.add(new THREE.PlaneGeometry(size, size), new THREE.Color(...col), q ? { x, y, z, q } : { x, y, z, rx: -Math.PI / 2 });
  }

  // ------------------------------------------------------------------ lamps (fixtures, halos, pools); real lights hop between catwalk lamps
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
  function wallLamp(x, y, z, nx, nz) {
    // gooseneck bracket from the wall + small enamel shade
    const bx = x + nx * 0.7, bz = z + nz * 0.7;
    props.link([x + nx * 0.05, y + 0.5, z + nz * 0.05], [bx, y + 0.5, bz], 0.02, 0.02, IRON, 5);
    props.link([bx, y + 0.5, bz], [bx, y + 0.22, bz], 0.02, 0.02, IRON, 5);
    props.box(0.12, 0.2, 0.04, IRON, x + nx * 0.03, y + 0.5, z + nz * 0.03, { ry: Math.atan2(nx, nz) });
    props.cyl(0.05, 0.26, 0.2, 10, ENAMEL_G, bx, y + 0.12, bz, { open: true });
    bulbs.sph(0.06, 6, 4, 0, bx, y + 0.02, bz);
    halos.push({ x: bx, y: y + 0.0, z: bz, size: 1.0, col: [0.5, 0.32, 0.15] });
    // glow on the wall + pool on the floor
    pool(x + nx * 0.04, y - 0.3, z + nz * 0.04, 3.2, [0.2, 0.12, 0.05], qYaw(Math.atan2(nx, nz)));
    pool(bx + nx * 1.5, 0.02, bz + nz * 1.5, 7, [0.16, 0.1, 0.04]);
  }

  // ------------------------------------------------------------------ hall: floor, ceiling, walls with windows
  const LIGHT = new THREE.Vector3(0.52, -0.6, 0.6).normalize(); // daylight travel direction (through the windows)
  const WIN = { w: 2.3, sill: 7.0, spring: 11.4, rise: 0.9, depth: 0.55 };
  const WIN2 = { w: 1.7, sill: 1.5, spring: 4.2, rise: 0.5, depth: 0.5 };
  const WS = 7.2; // window bay spacing
  {
    // floor + ceiling per leg (corner squares belong to the incoming leg)
    legs.forEach((g, i) => {
      const a0 = i === 0 ? -E0 : H, a1 = g.len + (i === legs.length - 1 ? E1 : H);
      const n = Math.max(1, Math.round((a1 - a0) / 20));
      for (let k = 0; k < n; k++) {
        const u0 = a0 + (a1 - a0) * k / n, u1 = a0 + (a1 - a0) * (k + 1) / n;
        const cx = g.a.x + g.dx * (u0 + u1) / 2, cz = g.a.z + g.dz * (u0 + u1) / 2;
        atXZ(cx, cz);
        const segA = Math.max(2, Math.round((u1 - u0) / 1.6)), segL = 14;
        const pos = [], uv = [], col = [], cpos = [], ccol = [];
        const pt = (u, l) => [g.a.x + g.dx * u + g.rx * l, g.a.z + g.dz * u + g.rz * l];
        const shade = (x, z, l, u) => {
          const dw = H - Math.abs(l);
          let c = 0.55 + 0.45 * THREE.MathUtils.smoothstep(dw, 0, 3.2);
          c *= 0.32 + 0.68 * THREE.MathUtils.smoothstep(Math.abs(l), 1.0, 3.2); // under the catwalk
          const n1 = Math.sin(x * 0.43 + 1.3) * Math.sin(z * 0.61 - 0.4) + 0.6 * Math.sin(x * 1.17 + z * 0.83 + 2.1) * Math.sin(z * 1.01 - x * 0.37);
          c *= 0.86 + 0.12 * n1;
          return c;
        };
        for (let ia = 0; ia < segA; ia++) for (let il = 0; il < segL; il++) {
          const ua = u0 + (u1 - u0) * ia / segA, ub = u0 + (u1 - u0) * (ia + 1) / segA;
          const la = -H + 2 * H * il / segL, lb = -H + 2 * H * (il + 1) / segL;
          const quad = [[ua, la], [ub, la], [ub, lb], [ua, la], [ub, lb], [ua, lb]];
          for (const [u, l] of quad) {
            const [x, z] = pt(u, l);
            pos.push(x, 0, z); uv.push(x / 1.6, -z / 1.6);
            const c = shade(x, z, l, u); col.push(c, c * 0.96, c * 0.9);
            cpos.push(x, CEIL, z);
            const cc = 0.5 + 0.25 * THREE.MathUtils.smoothstep(Math.abs(l), 0, H) + 0.08 * Math.sin(x * 0.7 + z * 0.3);
            ccol.push(cc, cc * 0.95, cc * 0.86);
          }
        }
        floor.add(soup(pos, uv, col, [0, 1, 0]), 0, { keepColor: true });
        ceil.add(soup(cpos, null, ccol, [0, -1, 0]), 0, { keepColor: true });
        // transverse riveted ceiling girders every 5 m + longitudinal beam over the catwalk
        for (let u = Math.ceil(u0 / 5) * 5; u < u1; u += 5) {
          const [bx, bz] = pt(u, 0), yaw = Math.atan2(g.dx, g.dz);
          ceil.box(2 * H, 0.06, 0.3, BEAM, bx, CEIL - 0.62, bz, { ry: yaw });
          ceil.box(2 * H, 0.55, 0.05, BEAM, bx, CEIL - 0.33, bz, { ry: yaw });
          ceil.box(2 * H, 0.06, 0.3, BEAM, bx, CEIL - 0.04, bz, { ry: yaw });
        }
      }
    });

    // walls: offset polylines of the course corners at ±H (miter joins) + two end walls
    const Q = (side) => {
      const out = [];
      const g0 = legs[0], gl = legs[legs.length - 1];
      out.push([g0.a.x - g0.dx * E0 + side * H * g0.rx, g0.a.z - g0.dz * E0 + side * H * g0.rz]);
      for (const c of corners) out.push(miter(c, side * H));
      out.push([gl.b.x + gl.dx * E1 + side * H * gl.rx, gl.b.z + gl.dz * E1 + side * H * gl.rz]);
      return out;
    };
    const wallRuns = [];
    for (const side of [-1, 1]) {
      const q = Q(side);
      for (let i = 0; i < q.length - 1; i++) {
        const g = legs[i];
        wallRuns.push({ A: q[i], B: q[i + 1], n: [-side * g.rx, -side * g.rz], windows: true });
      }
    }
    const ql = Q(-1), qr = Q(1);
    wallRuns.push({ A: ql[0], B: qr[0], n: [legs[0].dx, legs[0].dz], windows: false, end: 'start' });
    wallRuns.push({ A: ql[ql.length - 1], B: qr[qr.length - 1], n: [-legs[legs.length - 1].dx, -legs[legs.length - 1].dz], windows: false, end: 'finish' });

    const WALL_TOP = CEIL + 0.2;
    for (const run of wallRuns) {
      const ax = run.B[0] - run.A[0], az = run.B[1] - run.A[1], Lw = Math.hypot(ax, az);
      const ux = ax / Lw, uz = az / Lw;
      // local X must satisfy X × up = inward normal
      const flip = (-uz * run.n[0] + ux * run.n[1]) < 0;
      const X = new THREE.Vector3(flip ? -ux : ux, 0, flip ? -uz : uz), N = new THREE.Vector3(run.n[0], 0, run.n[1]);
      const O = flip ? run.B : run.A;
      const mat = new THREE.Matrix4().makeBasis(X, _Y, N).setPosition(O[0], 0, O[1]);
      const toW = (u, y, d = 0) => new THREE.Vector3(u, y, d).applyMatrix4(mat);
      const sunny = run.windows && (N.x * LIGHT.x + N.z * LIGHT.z) > 0.25;
      const count = run.windows ? Math.max(0, Math.floor((Lw - 4) / WS)) : 0;
      const off = (Lw - count * WS) / 2;
      const cuts = [0]; for (let k = 0; k <= count; k++) cuts.push(off + k * WS); cuts.push(Lw);
      for (let k = 0; k < cuts.length - 1; k++) {
        const u0 = cuts[k], u1 = cuts[k + 1];
        if (u1 - u0 < 0.05) continue;
        const cw = toW((u0 + u1) / 2, 0, 0);
        atXZ(cw.x, cw.z);
        const sec = secAt(curS);
        const hasWin = run.windows && k > 0 && k < cuts.length - 2;
        const lower = hasWin && (k % 2 === 1);
        const cx = (u0 + u1) / 2;
        const shape = new THREE.Shape();
        shape.moveTo(u0, 0); shape.lineTo(u1, 0); shape.lineTo(u1, WALL_TOP); shape.lineTo(u0, WALL_TOP); shape.lineTo(u0, 0);
        const wins = [];
        if (hasWin) wins.push(WIN);
        if (lower) wins.push(WIN2);
        for (const w of wins) { const h = new THREE.Path(); windowPath(h, cx, w.w, w.sill, w.spring, w.rise); shape.holes.push(h); }
        walls.add(new THREE.ShapeGeometry(shape, 10), 0, { m: mat });
        // pilaster at the bay boundary + string course at deck level
        if (k > 0) walls.add(new THREE.BoxGeometry(0.72, WALL_TOP, 0.3), 0, { m: mat.clone().multiply(new THREE.Matrix4().makeTranslation(u0, WALL_TOP / 2, 0.15)) });
        props.add(new THREE.BoxGeometry(u1 - u0, 0.22, 0.16), 0x9a907c, { m: mat.clone().multiply(new THREE.Matrix4().makeTranslation(cx, 6.1, 0.08)) });
        // wall pipes: lagged steam main + bare iron water pipe, brackets
        if (run.windows && u1 - u0 > 1) {
          const pa = toW(u0 + 0.3, 5.55, 0.42), pb = toW(u1 - 0.3, 5.55, 0.42);
          props.link([pa.x, pa.y, pa.z], [pb.x, pb.y, pb.z], 0.15, 0.15, LAGGING, 10);
          const ia = toW(u0 + 0.3, 6.55, 0.3), ib = toW(u1 - 0.3, 6.55, 0.3);
          props.link([ia.x, ia.y, ia.z], [ib.x, ib.y, ib.z], 0.08, 0.08, IRON, 8);
          for (let u = u0 + 1.2; u < u1 - 0.5; u += 2.4) {
            const b = toW(u, 5.35, 0.25); props.add(new THREE.BoxGeometry(0.06, 0.45, 0.5), IRON, { m: mat.clone().setPosition(b.x, b.y, b.z) });
            const f = toW(u, 5.55, 0.42); props.add(new THREE.CylinderGeometry(0.165, 0.165, 0.07, 10), IRON2, { m: mat.clone().multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).setPosition(f.x, f.y, f.z) });
          }
          // vertical drop with a red valve wheel at some bays
          if (k % 3 === 1) {
            const d0 = toW(u0 + 0.9, 0, 0.3), d1 = toW(u0 + 0.9, 6.55, 0.3);
            props.link([d0.x, 0, d0.z], [d1.x, 6.55, d1.z], 0.07, 0.07, IRON, 8);
            const vb = toW(u0 + 0.9, 1.5, 0.3); props.add(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 8), IRON2, { x: vb.x, y: 1.5, z: vb.z });
            const vw = toW(u0 + 0.9, 1.5, 0.55);
            props.add(new THREE.TorusGeometry(0.15, 0.022, 4, 12), RED_WHEEL, { m: mat.clone().setPosition(vw.x, 1.5, vw.z) });
          }
        }
        // wall lamps at alternate pilasters (lower level) — they light the hall floor and the vessels
        if (run.windows && k > 0 && k % 2 === 0) { const wl = toW(u0, 4.9, 0.15); wallLamp(wl.x, 4.9, wl.z, N.x, N.z); }
        // windows: reveals, sill, glass, shafts
        for (const w of wins) {
          const D = w.depth, x0 = cx - w.w / 2, x1 = cx + w.w / 2;
          const quad = (a, b, c, d, toward) => walls.add(soup([...a, ...b, ...c, ...a, ...c, ...d], null, null, toward), 0, { m: mat });
          quad([x0, w.sill, 0], [x0, w.spring, 0], [x0, w.spring, -D], [x0, w.sill, -D], [1, 0, 0]);
          quad([x1, w.sill, 0], [x1, w.spring, 0], [x1, w.spring, -D], [x1, w.sill, -D], [-1, 0, 0]);
          quad([x0, w.sill, 0], [x1, w.sill, 0], [x1, w.sill, -D], [x0, w.sill, -D], [0, 1, 0]);
          const arc = archPoints(cx, w.w, w.spring, w.rise, 8);
          for (let i = 0; i < arc.length - 1; i++) {
            const [axx, ayy] = arc[i], [bxx, byy] = arc[i + 1];
            quad([axx, ayy, 0], [bxx, byy, 0], [bxx, byy, -D], [axx, ayy, -D], [cx - (axx + bxx) / 2, w.spring - (ayy + byy) / 2 - 1, 0]);
          }
          props.add(new THREE.BoxGeometry(w.w + 0.24, 0.09, D + 0.22), STONE, { m: mat.clone().multiply(new THREE.Matrix4().makeTranslation(cx, w.sill - 0.045, -D / 2 + 0.11)) });
          const gs = new THREE.Shape(); windowPath(gs, cx, w.w, w.sill, w.spring, w.rise);
          const gg = new THREE.ShapeGeometry(gs, 8), guv = gg.attributes.uv, gp = gg.attributes.position;
          for (let i = 0; i < gp.count; i++) guv.setXY(i, (gp.getX(i) - x0) / w.w, (gp.getY(i) - w.sill) / (w.spring + w.rise - w.sill));
          gg.translate(0, 0, -D + 0.1);
          glass.add(gg, 0, { m: mat });
          props.add(new THREE.BoxGeometry(w.w, 0.07, 0.07), IRON, { m: mat.clone().multiply(new THREE.Matrix4().makeTranslation(cx, w.spring, -D + 0.12)) });
          // cooling floor: louvres instead of a closed sash (open to the air), more light
          if (sec === 'cool' && w === WIN) {
            for (let y = w.sill + 0.35; y < w.spring; y += 0.42) props.add(new THREE.BoxGeometry(w.w - 0.05, 0.05, 0.22), WOOD_DARK, { m: mat.clone().multiply(new THREE.Matrix4().makeTranslation(cx, y, -D + 0.22).multiply(new THREE.Matrix4().makeRotationX(-0.6))) });
          }
          if (sunny && w === WIN) {
            const mid = (w.sill + w.spring) / 2;
            const pa = toW(x0 + 0.15, mid, -0.1), pb = toW(x1 - 0.15, mid, -0.1);
            const len = Math.min(26, mid / -LIGHT.y);
            const pc = pb.clone().addScaledVector(LIGHT, len), pd = pa.clone().addScaledVector(LIGHT, len);
            const sg = new THREE.BufferGeometry();
            sg.setAttribute('position', new THREE.Float32BufferAttribute([...pa.toArray(), ...pb.toArray(), ...pc.toArray(), ...pa.toArray(), ...pc.toArray(), ...pd.toArray()], 3));
            sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
            sg.computeVertexNormals();
            shafts.add(sg, 0, {});
            // second, shorter sheet from the arch for volume
            const qa = toW(x0 + 0.3, w.spring, -0.1), qb = toW(x1 - 0.3, w.spring, -0.1), l2 = len * 0.8;
            const sg2 = new THREE.BufferGeometry();
            const qc = qb.clone().addScaledVector(LIGHT, l2), qd = qa.clone().addScaledVector(LIGHT, l2);
            sg2.setAttribute('position', new THREE.Float32BufferAttribute([...qa.toArray(), ...qb.toArray(), ...qc.toArray(), ...qa.toArray(), ...qc.toArray(), ...qd.toArray()], 3));
            sg2.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
            sg2.computeVertexNormals();
            shafts.add(sg2, 0, {});
            // cold patch where it lands on the floor
            const corners4 = [[x0, w.sill], [x1, w.sill], [x1, w.spring + 0.4], [x0, w.spring + 0.4]].map(([u, y]) => {
              const v = toW(u, y, -0.2); return v.addScaledVector(LIGHT, v.y / -LIGHT.y).setY(0.02);
            });
            const [c0, c1, c2, c3] = corners4;
            glows.add(soup([...c0.toArray(), ...c1.toArray(), ...c2.toArray(), ...c0.toArray(), ...c2.toArray(), ...c3.toArray()], [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], null, [0, 1, 0]), new THREE.Color(0.13, 0.16, 0.21));
          }
        }
        // end walls: the door at the start landing; the big painted name over the valve platform
        if (run.end === 'start' && k === 0) {
          const dc = Lw / 2;
          props.add(new THREE.BoxGeometry(2.0, 2.5, 0.08), WOOD2, { m: mat.clone().multiply(new THREE.Matrix4().makeTranslation(dc, DY + 1.25, 0.05)) });
          props.add(new THREE.BoxGeometry(2.3, 0.14, 0.14), STONE, { m: mat.clone().multiply(new THREE.Matrix4().makeTranslation(dc, DY + 2.57, 0.07)) });
          for (const sx of [-1, 1]) props.add(new THREE.BoxGeometry(0.14, 2.6, 0.14), STONE, { m: mat.clone().multiply(new THREE.Matrix4().makeTranslation(dc + sx * 1.08, DY + 1.3, 0.07)) });
          props.add(new THREE.BoxGeometry(0.03, 2.4, 0.1), WOOD_DARK, { m: mat.clone().multiply(new THREE.Matrix4().makeTranslation(dc, DY + 1.2, 0.1)) });
        }
      }
    }
  }

  // ------------------------------------------------------------------ catwalk deck (grating lane strips, real gaps at holes)
  const holesByLane = { '-1': [], 0: [], 1: [] };
  for (const h of hazards) if (h.type === 'hole') for (const l of h.lanes) holesByLane[l]?.push(holeSpan(h));
  const deckFrom = 0;
  {
    for (const lane of [-1, 0, 1]) {
      const lat0 = (lane - 0.5) * LW, lat1 = (lane + 0.5) * LW;
      // solid intervals = [deckFrom, sF0] minus holes
      let ints = [[deckFrom, sF0]];
      for (const [a, b] of holesByLane[lane]) {
        const next = [];
        for (const [c, d] of ints) { if (b <= c || a >= d) next.push([c, d]); else { if (a > c) next.push([c, a]); if (b < d) next.push([b, d]); } }
        ints = next;
      }
      for (const [a, b] of ints) {
        const ss = samples(a, b, 2);
        for (let i = 0; i < ss.length - 1; i++) {
          const s0 = ss[i], s1 = ss[i + 1];
          at((s0 + s1) / 2);
          const A = W(s0, lat0, DY), Bp = W(s0, lat1, DY), C = W(s1, lat1, DY), D = W(s1, lat0, DY);
          const v0 = s0 / GRATE.size, v1 = s1 / GRATE.size;
          const c0 = 0.9 + 0.12 * Math.sin(s0 * 1.7 + lane * 2.1), c1 = 0.9 + 0.12 * Math.sin(s1 * 1.7 + lane * 2.1);
          deck.add(soup([...A, ...Bp, ...C, ...A, ...C, ...D], [0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1],
            [c0, c0, c0, c0, c0, c0, c1, c1, c1, c0, c0, c0, c1, c1, c1, c1, c1, c1], [0, 1, 0]), 0, { keepColor: true });
        }
      }
    }
    // outer-corner landings: fill between the outer arc and the square corner
    for (const c of corners) {
      const so = -c.inner, ss = samples(c.s0, c.s1, 0.3);
      const mp = miter(c, so * RAIL);
      at(c.sc);
      const pos = [], uv = [], col = [];
      for (let i = 0; i < ss.length - 1; i++) {
        const a = W(ss[i], so * LANE_EDGE, DY), b = W(ss[i + 1], so * LANE_EDGE, DY);
        pos.push(mp[0], DY, mp[1], ...a, ...b);
        uv.push(mp[0] / GRATE.size, mp[1] / GRATE.size, a[0] / GRATE.size, a[2] / GRATE.size, b[0] / GRATE.size, b[2] / GRATE.size);
        col.push(0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85);
      }
      deck.add(soup(pos, uv, col, [0, 1, 0]), 0, { keepColor: true });
    }
    // start landing + finish platform: wide plates (world-mapped grating)
    const plate = (sa, sb, w) => {
      for (const ss of [samples(sa, sb, 2)]) for (let i = 0; i < ss.length - 1; i++) {
        at((ss[i] + ss[i + 1]) / 2);
        const A = W(ss[i], -w, DY), Bp = W(ss[i], w, DY), C = W(ss[i + 1], w, DY), D = W(ss[i + 1], -w, DY);
        const u = (p) => [p[0] / GRATE.size, p[2] / GRATE.size];
        deck.add(soup([...A, ...Bp, ...C, ...A, ...C, ...D], [...u(A), ...u(Bp), ...u(C), ...u(A), ...u(C), ...u(D)], new Array(18).fill(0.82), [0, 1, 0]), 0, { keepColor: true });
      }
    };
    plate(-E0 + 0.3, deckFrom, 2.6);
    plate(sF0, sEnd, 2.6);
  }

  // stringers, toe plates, railings (outer corners squared), posts, rivets, cross beams
  const railLines = {};
  {
    const lineFor = (side, lat, a, b) => {
      const pts = [];
      for (const s of samples(a, b, 3)) {
        const c = corners.find((q) => s > q.s0 + 1e-3 && s < q.s1 - 1e-3);
        if (c && side === -c.inner) { if (!pts.some((p) => p.c === c)) { const m = miter(c, side * lat); pts.push({ x: m[0], z: m[1], s: c.sc, c }); } continue; }
        const w = W(s, side * lat, 0); pts.push({ x: w[0], z: w[2], s });
      }
      return pts;
    };
    const tube = (pts, y, r, col, seg = 6) => {
      for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; at((a.s + b.s) / 2); props.link([a.x, y, a.z], [b.x, y, b.z], r, r, col, seg); }
    };
    const ribbonV = (pts, y0, y1, col, out) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1]; at((a.s + b.s) / 2);
        const nx = -(b.z - a.z), nz = b.x - a.x;
        props.add(soup([a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y0, a.z, b.x, y1, b.z, a.x, y1, a.z], null, null, [nx * out, 0, nz * out]), col);
      }
    };
    const ribbonH = (ptsA, ptsB, y, col) => {
      for (let i = 0; i < Math.min(ptsA.length, ptsB.length) - 1; i++) {
        const a = ptsA[i], b = ptsA[i + 1], c = ptsB[i + 1], d = ptsB[i]; at((a.s + b.s) / 2);
        props.add(soup([a.x, y, a.z, b.x, y, b.z, c.x, y, c.z, a.x, y, a.z, c.x, y, c.z, d.x, y, d.z], null, null, [0, 1, 0]), col);
      }
    };
    for (const side of [-1, 1]) {
      const inner = lineFor(side, LANE_EDGE, deckFrom, sF0), outer = lineFor(side, RAIL + 0.06, deckFrom, sF0);
      const railL = lineFor(side, RAIL, deckFrom, sF0);
      railLines[side] = railL;
      // top flange (walkable edge strip) + outer web + bottom flange + toe plate
      ribbonH(inner, outer, DY + 0.004, STEEL_D);
      ribbonV(outer, DY - 0.32, DY + 0.13, IRON2, side);
      ribbonV(lineFor(side, RAIL - 0.02, deckFrom, sF0), DY - 0.3, DY, IRON, -side);
      // railing tubes (top + mid) — skip where the finish platform starts
      tube(railL, DY + 1.05, 0.026, STEEL);
      tube(railL, DY + 0.56, 0.02, STEEL);
      // posts every ~1.6 m along the polyline (arc length), always at corners
      let acc = 0.8;
      for (let i = 0; i < railL.length - 1; i++) {
        const a = railL[i], b = railL[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
        if (a.c) { at(a.s); props.cyl(0.028, 0.028, 1.08, 6, STEEL, a.x, DY + 0.54, a.z); props.sph(0.045, 6, 4, STEEL, a.x, DY + 1.08, a.z); }
        while (acc < len) {
          const t = acc / len, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, s = a.s + (b.s - a.s) * t;
          at(s);
          props.cyl(0.026, 0.026, 1.08, 6, STEEL, x, DY + 0.54, z);
          props.sph(0.042, 6, 4, STEEL, x, DY + 1.08, z);
          props.sph(0.034, 5, 3, STEEL, x, DY + 0.56, z);
          acc += 1.6;
        }
        acc -= len;
      }
      // rivets on the outer web (straights only)
      for (let s = deckFrom + 0.2; s < sF0; s += low ? 0.5 : 0.32) {
        if (inCorner(s, 0.3)) continue;
        at(s);
        for (const y of low ? [DY - 0.05] : [DY - 0.05, DY - 0.24]) {
          const w = W(s, side * (RAIL + 0.07), y);
          props.add(new THREE.OctahedronGeometry(0.02, 0), IRON2, { x: w[0], y, z: w[2] });
        }
      }
    }
    // cross beams under the deck + pipe rack under the catwalk
    for (let s = deckFrom + 1.25; s < sF0; s += 2.5) {
      if (inCorner(s, 0.5)) continue;
      const F = frameAt(s); at(s);
      props.box(2 * RAIL + 0.1, 0.2, 0.09, IRON, ...F.p(0, 0, DY - 0.13), { ry: F.yaw });
    }
    const rack = (lat, y, r, col) => {
      const ss = samples(deckFrom, sF0, 6);
      for (let i = 0; i < ss.length - 1; i++) { at((ss[i] + ss[i + 1]) / 2); props.link(W(ss[i], lat, y), W(ss[i + 1], lat, y), r, r, col, 8); }
    };
    rack(-1.68, DY - 0.62, 0.15, 0xb8ae98);
    rack(1.62, DY - 0.55, 0.09, IRON2);
    rack(1.75, DY - 0.85, 0.07, 0x5a4a3a);
  }

  // finish platform + start landing railings
  {
    const box3 = (sa, sb, w) => {
      for (const side of [-1, 1]) {
        const a = W(sa, side * w, 0), b = W(sb, side * w, 0); at((sa + sb) / 2);
        props.link([a[0], DY + 1.05, a[2]], [b[0], DY + 1.05, b[2]], 0.026, 0.026, STEEL, 6);
        props.link([a[0], DY + 0.56, a[2]], [b[0], DY + 0.56, b[2]], 0.02, 0.02, STEEL, 6);
        for (let s = sa; s <= sb + 0.01; s += 1.6) { const p = W(s, side * w, DY + 0.54); at(s); props.cyl(0.026, 0.026, 1.08, 6, STEEL, p[0], p[1], p[2]); props.sph(0.042, 6, 4, STEEL, p[0], DY + 1.08, p[2]); }
        const F = frameAt((sa + sb) / 2, side * (w + 0.05));
        props.box(0.1, 0.45, sb - sa, IRON2, ...F.p(0, 0, DY - 0.1), { ry: F.yaw });
      }
      // short rails joining the narrow catwalk to the wide plate
      at(sa);
      for (const side of [-1, 1]) {
        const a = W(sa, side * RAIL, 0), b = W(sa, side * w, 0);
        props.link([a[0], DY + 1.05, a[2]], [b[0], DY + 1.05, b[2]], 0.026, 0.026, STEEL, 6);
        props.link([a[0], DY + 0.56, a[2]], [b[0], DY + 0.56, b[2]], 0.02, 0.02, STEEL, 6);
      }
    };
    box3(sF0, sEnd, 2.65);
    // start landing: rails on the right only; stair down on the left
    {
      const sa = -E0 + 0.3, sb = deckFrom;
      at(1);
      const a = W(sa, 2.65, 0), b = W(sb, 2.65, 0);
      props.link([a[0], DY + 1.05, a[2]], [b[0], DY + 1.05, b[2]], 0.026, 0.026, STEEL, 6);
      props.link([a[0], DY + 0.56, a[2]], [b[0], DY + 0.56, b[2]], 0.02, 0.02, STEEL, 6);
      const c = W(sb, 2.65, 0), d = W(sb, RAIL, 0);
      props.link([c[0], DY + 1.05, c[2]], [d[0], DY + 1.05, d[2]], 0.026, 0.026, STEEL, 6);
      const F = frameAt(-2.2);
      for (const side of [-1, 1]) props.box(0.1, 0.45, E0 - 0.3, IRON2, ...F.p(0, side * 2.7, DY - 0.1), { ry: F.yaw });
      // steel stair from the landing down to the floor (toward the left wall)
      const steps = 20, rise = DY / steps, tread = 0.27;
      for (let i = 0; i < steps; i++) {
        const y = DY - (i + 1) * rise, l = -2.9 - i * tread;
        props.box(tread + 0.04, 0.04, 1.0, STEEL_D, ...F.p(-0.9, l, y + 0.02), { ry: F.yaw });
      }
      for (const a2 of [-1.45, -0.35]) {
        const p0 = F.p(a2, -2.75, DY), p1 = F.p(a2, -2.75 - steps * tread, 0);
        props.bar(p0, p1, 0.04, 0.22, IRON);
        props.link([p0[0], p0[1] + 0.95, p0[2]], [p1[0], p1[1] + 0.95, p1[2]], 0.022, 0.022, STEEL, 6);
      }
    }
  }

  // ------------------------------------------------------------------ cast-iron columns along the catwalk (floor → ceiling)
  {
    for (let s = 6; s < sF0 - 2; s += 10) {
      if (inCorner(s, 3.5)) continue;
      for (const side of [-1, 1]) {
        const p = W(s, side * 1.98, 0); at(s);
        const [x, , z] = p;
        props.box(0.62, 0.4, 0.62, IRON2, x, 0.2, z);
        props.cyl(0.24, 0.3, 0.3, 10, COLUMN, x, 0.55, z);
        props.cyl(0.16, 0.19, CEIL - 1.2, 12, COLUMN, x, (CEIL - 1.2) / 2 + 0.7, z);
        for (const y of [1.3, DY - 0.35, DY + 2.6]) props.cyl(0.205, 0.205, 0.1, 12, COLUMN2, x, y, z);
        props.cyl(0.36, 0.18, 0.45, 10, COLUMN, x, CEIL - 0.85, z);
        props.box(0.75, 0.1, 0.75, IRON2, x, CEIL - 0.6, z);
        // bracket carrying the stringer
        const b = W(s, side * 1.66, DY - 0.2);
        props.box(0.12, 0.26, 0.5, IRON, b[0], b[1], b[2], { ry: Math.atan2(fr(s).rx, fr(s).rz) });
      }
    }
  }

  // ------------------------------------------------------------------ catwalk lamps (the lit path)
  {
    const hz = hazards.map((h) => h.s);
    const list = [];
    for (let s = 5; s < sF0; s += 12) list.push(s);
    for (const s of hz) if (!list.some((q) => Math.abs(q - (s - 1.6)) < 4)) list.push(s - 1.6);
    list.push(course.finish + 2, L - 3);
    list.sort((a, b) => a - b);
    for (const s of list) {
      if (inCorner(s, 1.5)) continue;
      const [x, , z] = W(s, 0, 0), y = DY + 3.35;
      at(s);
      pendant(x, y, z, CEIL - 0.6, { big: 1.05 });
      catLamps.push({ s, x, y: y - 0.1, z });
    }
    // one over every corner landing (toward the squared outer corner)
    for (const c of corners) {
      const so = -c.inner, m = miter(c, so * RAIL), p = W(c.sc, 0, 0);
      const x = p[0] + (m[0] - p[0]) * 0.35, z = p[2] + (m[1] - p[2]) * 0.35, y = DY + 3.35;
      at(c.sc);
      pendant(x, y, z, CEIL - 0.6, { big: 1.05 });
      catLamps.push({ s: c.sc, x, y: y - 0.1, z });
    }
  }

  // ------------------------------------------------------------------ section dressing (vessels on the floor below)
  const dyn = [];          // rotating parts {mesh, w}
  const emitters = [];     // ambient steam sources {x, y, z, rate, r, kind}
  const fireMeshes = [];
  const SIGN = { mash: DECALS4.mash, lauter: DECALS4.lauter, kettles: DECALS4.kettles, hops: DECALS4.hops, cool: DECALS4.cool };

  function sackGeo(seed) {
    // jute sack (upright: 0.9 m tall): plump rounded body, pinched + tied at the top, flattened where it lies
    const g = new THREE.BoxGeometry(0.62, 0.9, 0.5, 4, 6, 3), p = g.attributes.position, RR = rng(seed);
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i) / 0.31, y = p.getY(i) / 0.45, z = p.getZ(i) / 0.25;
      // round the cross-section (box → superellipse) and the ends
      const r = Math.hypot(x, z) || 1, m = Math.max(Math.abs(x), Math.abs(z));
      x *= m / r * 1.1; z *= m / r * 1.1;
      const prof = y > 0.55 ? 1 - (y - 0.55) * 1.6 : 1 - Math.max(0, -y - 0.75) * 1.2;  // pinched top, soft base
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
  const SACK = [0xffffff, 0xeee3d0, 0xd9ccb4, 0xf4ecdf];
  /** pyramid stack of sacks lying on a pallet, centered at world (x, z), oriented by yaw */
  function sackStack(x, z, yaw, nx, ny) {
    const q = qYaw(yaw), cs = Math.cos(yaw), sn = Math.sin(yaw);
    const loc = (a, b, y) => ({ x: x + cs * a + sn * b, y, z: z - sn * a + cs * b });
    props.add(new THREE.BoxGeometry(nx * 0.68 + 0.2, 0.14, ny * 0.95 + 0.2), WOOD2, { ...loc(0, 0, 0.07), q });
    let lvl = 0;
    for (let cx = nx, cy = ny; cx > 0 && cy > 0 && lvl < 4; cx--, lvl++) {
      for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) {
        const a = (i - (cx - 1) / 2) * 0.68, b = (j - (cy - 1) / 2) * 0.95;
        const qq = q.clone().multiply(new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2, (R() - 0.5) * 0.2, 0)));
        atlas.add(sackGeo(lvl * 31 + i * 7 + j), SACK[(i + j + lvl) % 4], { ...loc(a, b, 0.14 + 0.25 + lvl * 0.46), q: qq });
      }
      if (lvl % 2 === 1) cy = Math.max(1, cy - 1);
    }
  }

  // riveted open vessel helper (lathe) — returns nothing, adds to props
  function riveted(x, z, r, y0, y1, color, seams = 8) {
    for (let k = 0; k < seams; k++) {
      const t = (k / seams) * Math.PI * 2 + 0.3;
      for (let y = y0 + 0.1; y < y1 - 0.05; y += 0.16) props.add(new THREE.OctahedronGeometry(0.022, 0), color, { x: x + Math.sin(t) * (r + 0.01), y, z: z + Math.cos(t) * (r + 0.01) });
    }
  }

  function mashTun(s, lat) {
    const F = frameAt(s, lat), [x, , z] = F.p(0, 0, 0), r = 2.6;
    at(s);
    // cast-iron legs + ring beam
    for (let k = 0; k < 6; k++) { const t = (k / 6) * Math.PI * 2; props.cyl(0.12, 0.16, 1.0, 8, COLUMN, x + Math.sin(t) * (r - 0.4), 0.5, z + Math.cos(t) * (r - 0.4)); }
    props.add(new THREE.TorusGeometry(r - 0.4, 0.08, 4, 24), IRON, { x, y: 0.98, z, rx: Math.PI / 2 });
    // body: outer + inner walls (lathe), dished bottom, hoops
    props.add(new THREE.LatheGeometry([[0.01, 1.0], [r * 0.7, 1.05], [r - 0.05, 1.25], [r, 1.5], [r, 3.75]].map(([a, b]) => new THREE.Vector2(a, b)), 32), VAT_GREEN, { x, z });
    props.add(new THREE.LatheGeometry([[r - 0.06, 3.75], [r - 0.06, 3.0]].map(([a, b]) => new THREE.Vector2(a, b)), 32), 0x232622, { x, z });
    props.add(new THREE.TorusGeometry(r, 0.06, 5, 32), IRON, { x, y: 3.77, z, rx: Math.PI / 2 });
    for (const y of [1.7, 2.45, 3.2]) props.add(new THREE.TorusGeometry(r + 0.025, 0.035, 4, 32), IRON2, { x, y, z, rx: Math.PI / 2 });
    riveted(x, z, r, 1.5, 3.7, IRON2, 8);
    // mash surface + warm glow, gentle steam
    props.add(new THREE.CircleGeometry(r - 0.07, 28), MASH, { x, y: 3.25, z, rx: -Math.PI / 2 });
    pool(x, 3.27, z, r * 2, [0.12, 0.06, 0.02]);
    emitters.push({ x, y: 3.4, z, rate: 2.2, r: r * 0.8, kind: 'surface' });
    // stirring gear: bridge across the top, gearbox, drive shaft + pulley + belt to the ceiling line shaft
    const yb = 4.35;
    for (const off of [-0.25, 0.25]) props.box(2 * r + 0.6, 0.24, 0.1, IRON, ...F.p(off, 0, yb), { ry: F.yaw });
    for (const sx of [-1, 1]) props.box(0.14, yb - 3.75, 0.6, IRON, ...F.p(0, sx * (r + 0.2), (yb + 3.75) / 2), { ry: F.yaw });
    props.box(0.7, 0.55, 0.7, IRON2, x, yb + 0.35, z);
    props.cyl(0.24, 0.3, 0.3, 12, RED_LEAD, x, yb + 0.75, z);
    const dp = F.p(0, -1.6, yb + 0.35);
    props.link([x, yb + 0.35, z], dp, 0.06, 0.06, STEEL, 8);
    props.add(new THREE.TorusGeometry(0.42, 0.05, 5, 16), IRON2, { x: dp[0], y: dp[1], z: dp[2], ry: F.yaw + Math.PI / 2 });
    props.add(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 16), IRON2, { x: dp[0], y: dp[1], z: dp[2], q: qYaw(F.yaw).multiply(new THREE.Quaternion().setFromEuler(_e.set(0, 0, Math.PI / 2))) });
    for (const o of [-0.38, 0.38]) props.bar([dp[0], dp[1] + o * 0.0, dp[2]].map((v, i) => v + (i === 1 ? o : 0)), [dp[0], CEIL - 0.9, dp[2]], 0.12, 0.012, 0x3a2a1c);
    // rotating stirrer (dynamic): shaft + two paddle arms just above the mash
    const sb = new Batch();
    sb.cyl(0.07, 0.07, yb - 2.9, 8, STEEL, 0, (yb + 2.9) / 2, 0);
    for (const sx of [-1, 1]) {
      sb.box(r * 1.7, 0.08, 0.12, STEEL, sx * r * 0.45, 3.5, 0);
      for (let i = 1; i <= 4; i++) sb.box(0.06, 0.5, 0.22, STEEL_D, sx * i * r * 0.2, 3.3, 0, { ry: 0.5 });
    }
    const m = sb.mesh(M.props); m.position.set(x, 0, z); m.userData.dynamic = true; root.add(m);
    dyn.push({ mesh: m, w: 0.45 });
    pendant(x + 1.2, 7.4, z, CEIL - 0.6, { poolY: 3.28, poolSize: 3, poolCol: [0.14, 0.08, 0.03] });
  }

  function kettle(s, lat, k = 1.4, withStack = true) {
    const F = frameAt(s, lat), [kx, , kz] = F.p(0, 0, 0);
    at(s);
    const A = 2.45 * k, PH = 1.0;
    const toCat = -Math.sign(lat || 1); // direction from the kettle toward the catwalk (in lateral units)
    // octagonal brick plinth with a stone cap
    const oct = (apo, y0, y1, cap) => {
      const rc = apo / Math.cos(Math.PI / 8), fw = 2 * apo * Math.tan(Math.PI / 8), pos = [], uv = [];
      for (let q = 0; q < 8; q++) {
        const t0 = -Math.PI / 8 + (q * Math.PI) / 4, t1 = t0 + Math.PI / 4;
        const ax = kx + Math.sin(t0) * rc, az = kz + Math.cos(t0) * rc, bx = kx + Math.sin(t1) * rc, bz = kz + Math.cos(t1) * rc;
        pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
        uv.push(0, y0, fw / 1.2, y0, fw / 1.2, y1, 0, y0, fw / 1.2, y1, 0, y1);
        if (cap) { pos.push(kx, y1, kz, ax, y1, az, bx, y1, bz); uv.push(0.5, 0.96, 0.2, 0.96, 0.8, 0.96); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals(); brick.add(g);
    };
    oct(A, 0, PH, false); oct(A + 0.08, PH, PH + 0.09, true);
    const bowl = [[1.9, 0.85], [2.06, 0.98], [2.15, 1.18], [2.18, 1.4], [2.16, 1.6], [2.12, 1.74]];
    const hood = [[2.13, 1.8], [2.19, 1.98], [2.2, 2.2], [2.13, 2.52], [1.94, 2.88], [1.64, 3.25], [1.26, 3.6], [0.9, 3.88], [0.63, 4.1], [0.48, 4.28], [0.42, 4.5]];
    const lift = PH + 0.09 - 0.85 * k;
    const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r * k, y * k + lift)), low ? 32 : 48);
    copper.add(lathe(bowl), 0, { x: kx, z: kz });
    copper.add(lathe(hood), 0, { x: kx, z: kz });
    const top = 4.5 * k + lift;
    const rHood = (y) => {
      const yy = (y - lift) / k;
      for (let i = 0; i < hood.length - 1; i++) { const [r0, y0] = hood[i], [r1, y1] = hood[i + 1]; if (yy >= y0 && yy <= y1) return (r0 + (r1 - r0) * ((yy - y0) / (y1 - y0))) * k; }
      return hood[hood.length - 1][0] * k;
    };
    metal.add(new THREE.TorusGeometry(2.155 * k, 0.05 * k, 6, 40), BRASS, { x: kx, y: 1.77 * k + lift, z: kz, rx: Math.PI / 2 });
    if (withStack) {
      const sr = 0.42 * k * 0.98;
      copper.cyl(sr, sr, CEIL - top + 0.2, 20, 0, kx, (CEIL + top) / 2, kz, { open: true });
      for (const y of [top + 0.08, top + 2.4, DY + 3.0, CEIL - 0.9]) metal.cyl(sr + 0.05, sr + 0.05, 0.12, 20, BRASS, kx, y, kz);
    }
    // rivets: rings + vertical seams
    const nRing = low ? 36 : 56;
    for (const y of [1.97, 2.88, 3.6]) for (let i = 0; i < nRing; i++) { const t = (i / nRing) * Math.PI * 2, yy = y * k + lift, r = rHood(yy) + 0.006; copper.add(new THREE.OctahedronGeometry(0.03, 0), 0, { x: kx + Math.sin(t) * r, y: yy, z: kz + Math.cos(t) * r }); }
    for (let q = 0; q < 8; q++) for (let y = 2.05; y < 4.15; y += 0.18) { const t = (q / 8) * Math.PI * 2 + 0.2, yy = y * k + lift, r = rHood(yy) + 0.006; copper.add(new THREE.OctahedronGeometry(0.028, 0), 0, { x: kx + Math.sin(t) * r, y: yy, z: kz + Math.cos(t) * r }); }
    // open hop hatch on the hood, facing the catwalk, puffing steam
    {
      const th = Math.atan2(F.f.rx * toCat, F.f.rz * toCat) + 0.5, y = 3.0 * k + lift;
      const r = rHood(y), slope = (rHood(y + 0.05) - rHood(y - 0.05)) / 0.1, phi = Math.atan(-slope);
      const n = new THREE.Vector3(Math.sin(th) * Math.cos(phi), Math.sin(phi), Math.cos(th) * Math.cos(phi));
      const pos = new THREE.Vector3(kx + Math.sin(th) * r, y, kz + Math.cos(th) * r);
      const xA = new THREE.Vector3().crossVectors(_Y, n).normalize(), yA = new THREE.Vector3().crossVectors(n, xA);
      const basis = new THREE.Matrix4().makeBasis(xA, yA, n).setPosition(pos);
      const atB = (x2, y2, z2, extra = null) => { const mm = new THREE.Matrix4().makeTranslation(x2, y2, z2); if (extra) mm.multiply(extra); return { m: basis.clone().multiply(mm) }; };
      const Wd = 0.62 * k, Hd = 0.5 * k;
      for (const [w, h, x2, y2] of [[Wd + 0.1, 0.06, 0, Hd / 2], [Wd + 0.1, 0.06, 0, -Hd / 2], [0.06, Hd, -Wd / 2, 0], [0.06, Hd, Wd / 2, 0]]) metal.add(new THREE.BoxGeometry(w, h, 0.08), BRASS, atB(x2, y2, 0.02));
      props.add(new THREE.PlaneGeometry(Wd - 0.04, Hd - 0.04), 0x0d0b09, atB(0, 0, 0.012));
      pool(...atB(0, 0, 0.03).m.elements.slice(12, 15), 0.9, [0.3, 0.16, 0.05], new THREE.Quaternion().setFromRotationMatrix(basis));
      copper.add(new THREE.BoxGeometry(Wd, Hd, 0.04), 0, atB(0, Hd / 2 + 0.02, 0.05, new THREE.Matrix4().makeRotationX(-0.95).multiply(new THREE.Matrix4().makeTranslation(0, -Hd / 2, 0.025))));
      emitters.push({ x: pos.x + n.x * 0.2, y: pos.y + 0.1, z: pos.z + n.z * 0.2, rate: 6, r: 0.2, kind: 'hatch', nx: n.x, nz: n.z });
    }
    // safety valve with weighted lever, sight glass
    {
      const t = Math.atan2(F.f.rx * toCat, F.f.rz * toCat) - 1.4, y = 3.75 * k + lift, r = rHood(y);
      const px = kx + Math.sin(t) * r, pz = kz + Math.cos(t) * r;
      metal.cyl(0.08, 0.1, 0.34, 10, BRASS, px, y + 0.17, pz);
      metal.link([px, y + 0.34, pz], [px + Math.sin(t) * 0.7, y + 0.4, pz + Math.cos(t) * 0.7], 0.022, 0.022, BRASS, 6);
      props.sph(0.1, 8, 6, IRON, px + Math.sin(t) * 0.7, y + 0.4, pz + Math.cos(t) * 0.7);
    }
    // firebox on the plinth face toward the catwalk: iron front, glowing coals, orange floor glow
    {
      const th = Math.round(Math.atan2(F.f.rx * toCat, F.f.rz * toCat) / (Math.PI / 4)) * (Math.PI / 4);
      const nx = Math.sin(th), nz = Math.cos(th), fc = [kx + nx * A, kz + nz * A];
      const q = qYaw(th);
      const loc = (a, y, d) => ({ x: fc[0] + Math.cos(th) * a + nx * d, y, z: fc[1] - Math.sin(th) * a + nz * d, q });
      props.add(new THREE.BoxGeometry(1.3, 1.0, 0.3), IRON, loc(0, 0.5, 0.1));
      props.add(new THREE.BoxGeometry(1.4, 0.08, 0.36), IRON2, loc(0, 1.02, 0.12));
      for (let i = 0; i < 7; i++) for (const y of [0.14, 0.92]) props.add(new THREE.OctahedronGeometry(0.024, 0), IRON2, loc(-0.54 + i * 0.18, y, 0.26));
      const fg = new THREE.PlaneGeometry(0.56, 0.38);
      fireB.add(fg, 0, loc(0, 0.6, 0.262));
      props.add(new THREE.BoxGeometry(0.6, 0.42, 0.05), IRON2, { ...loc(-0.62, 0.6, 0.45), q: q.clone().multiply(qYaw(-1.6)) });
      pool(fc[0] + nx * 1.4, 0.02, fc[1] + nz * 1.4, 3.6, [0.42, 0.16, 0.04]);
      fireMeshes.push({ x: fc[0] + nx * 0.6, z: fc[1] + nz * 0.6 });
    }
    // copper wort pipe from the bowl base down and away
    {
      const t = Math.atan2(F.f.tx, F.f.tz);
      const p0 = [kx + Math.sin(t) * 1.9 * k, 0.9, kz + Math.cos(t) * 1.9 * k], p1 = [kx + Math.sin(t) * (A + 1.0), 0.9, kz + Math.cos(t) * (A + 1.0)];
      copper.link(p0, p1, 0.11, 0.11, 0, 12);
      copper.link(p1, [p1[0], 0.2, p1[2]], 0.11, 0.11, 0, 12);
      metal.cyl(0.16, 0.16, 0.1, 12, BRASS, p1[0], 0.6, p1[2]);
      props.add(new THREE.TorusGeometry(0.2, 0.025, 4, 12), RED_WHEEL, { x: p1[0], y: 1.15, z: p1[2], rx: Math.PI / 2 });
      props.cyl(0.03, 0.03, 0.5, 6, IRON, p1[0], 0.9, p1[2]);
    }
    pendant(kx - F.f.rx * toCat * 2.8, DY + 0.6, kz - F.f.rz * toCat * 2.8, CEIL - 0.6, { poolY: 0.02, poolSize: 7, poolCol: [0.2, 0.12, 0.05] });
    emitters.push({ x: kx, y: top + 0.2, z: kz, rate: 0, r: 0.3, kind: 'none' });
  }

  function lauterTun(s, lat) {
    const F = frameAt(s, lat), [x, , z] = F.p(0, 0, 0), r = 3.7;
    at(s);
    for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2; props.cyl(0.13, 0.17, 0.7, 8, COLUMN, x + Math.sin(t) * (r - 0.5), 0.35, z + Math.cos(t) * (r - 0.5)); }
    props.add(new THREE.LatheGeometry([[0.01, 0.7], [r - 0.1, 0.72], [r, 0.85], [r, 2.35]].map(([a, b]) => new THREE.Vector2(a, b)), 40), VAT_GREY, { x, z });
    props.add(new THREE.LatheGeometry([[r - 0.06, 2.35], [r - 0.06, 1.7]].map(([a, b]) => new THREE.Vector2(a, b)), 40), 0x22231f, { x, z });
    copper.add(new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.35, 40, 1, true), 0, { x, y: 2.2, z });
    metal.add(new THREE.TorusGeometry(r + 0.03, 0.05, 5, 40), BRASS, { x, y: 2.38, z, rx: Math.PI / 2 });
    riveted(x, z, r, 0.9, 2.0, IRON2, 10);
    props.add(new THREE.CircleGeometry(r - 0.07, 32), GRAIN, { x, y: 1.85, z, rx: -Math.PI / 2 });
    emitters.push({ x, y: 2.0, z, rate: 1.5, r: r * 0.8, kind: 'surface' });
    // bridge + gearbox, rake (dynamic)
    const yb = 3.6;
    for (const off of [-0.3, 0.3]) props.box(2 * r + 0.6, 0.26, 0.1, IRON, ...F.p(off, 0, yb), { ry: F.yaw });
    for (const sx of [-1, 1]) props.box(0.14, yb - 2.35, 0.7, IRON, ...F.p(0, sx * (r + 0.2), (yb + 2.35) / 2), { ry: F.yaw });
    props.box(0.8, 0.6, 0.8, RED_LEAD, x, yb + 0.4, z);
    props.cyl(0.32, 0.32, 0.24, 14, IRON2, x, yb + 0.82, z);
    const rb = new Batch();
    rb.cyl(0.12, 0.12, yb - 1.8, 10, STEEL, 0, (yb + 1.8) / 2, 0);
    for (const sx of [-1, 1]) {
      rb.box(r * 0.95, 0.14, 0.16, STEEL, sx * r * 0.48, 2.15, 0);
      for (let i = 1; i <= 7; i++) rb.box(0.03, 0.42, 0.12, STEEL_D, sx * i * r * 0.13, 1.92, 0, { ry: 0.6 });
    }
    rb.box(0.16, 0.14, r * 1.6, STEEL, 0, 2.15, 0);
    const m = rb.mesh(M.props); m.position.set(x, 0, z); m.userData.dynamic = true; root.add(m);
    dyn.push({ mesh: m, w: 0.22 });
    pendant(x, 6.8, z, CEIL - 0.6, { poolY: 1.87, poolSize: 5, poolCol: [0.16, 0.1, 0.04] });
    // row of brass taps (grant) on the side facing the run, small trough
    const toCat = -Math.sign(lat || 1);
    for (let i = 0; i < 9; i++) {
      const t = Math.atan2(F.f.rx * toCat, F.f.rz * toCat) + (i - 4) * 0.13;
      const p0 = [x + Math.sin(t) * (r + 0.04), 1.0, z + Math.cos(t) * (r + 0.04)], p1 = [x + Math.sin(t) * (r + 0.45), 1.15, z + Math.cos(t) * (r + 0.45)];
      metal.link(p0, p1, 0.035, 0.035, BRASS, 6);
      metal.link(p1, [p1[0], 0.95, p1[2]], 0.03, 0.03, BRASS, 6);
    }
  }

  function receiver(s, lat) {
    // small closed copper vessel with gauge + manifold (wort receiver)
    const F = frameAt(s, lat), [x, , z] = F.p(0, 0, 0);
    at(s);
    for (let k = 0; k < 4; k++) { const t = (k / 4) * Math.PI * 2 + 0.78; props.cyl(0.08, 0.1, 0.9, 6, COLUMN, x + Math.sin(t) * 1.0, 0.45, z + Math.cos(t) * 1.0); }
    copper.add(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 32), 0, { x, y: 2.0, z });
    copper.add(new THREE.SphereGeometry(1.3, 32, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, { x, y: 3.1, z, sy: 0.45 });
    metal.add(new THREE.TorusGeometry(1.32, 0.04, 5, 32), BRASS, { x, y: 3.1, z, rx: Math.PI / 2 });
    metal.add(new THREE.TorusGeometry(1.32, 0.04, 5, 32), BRASS, { x, y: 0.92, z, rx: Math.PI / 2 });
    metal.link([x, 3.7, z], [x, CEIL - 1, z], 0.1, 0.1, 0x8a8e8f, 8);
    metal.add(new THREE.SphereGeometry(0.16, 10, 6), BRASS, { x, y: 3.75, z });
    const g = F.p(0, -Math.sign(lat) * 1.32, 2.3);
    decal(DECALS4.gauge, 0.36, 0.36, [g[0], g[1], g[2]], qYaw(Math.atan2(-F.f.rx * Math.sign(lat), -F.f.rz * Math.sign(lat))));
  }

  // pipe manifold on the floor along a stretch (valves with red hand wheels)
  function manifold(s0, s1, lat) {
    const n = Math.max(2, Math.round((s1 - s0) / 3));
    for (let i = 0; i < n; i++) {
      const a = s0 + (s1 - s0) * i / n, b = s0 + (s1 - s0) * (i + 1) / n; at((a + b) / 2);
      props.link(W(a, lat, 1.1), W(b, lat, 1.1), 0.13, 0.13, IRON2, 8);
      props.link(W(a, lat + 0.5, 0.75), W(b, lat + 0.5, 0.75), 0.09, 0.09, 0x6a5a48, 8);
      const v = W(a + 1, lat, 1.1);
      props.cyl(0.2, 0.2, 0.16, 10, IRON, v[0], v[1], v[2], { rx: Math.PI / 2, ry: Math.atan2(fr(a).tx, fr(a).tz) });
      props.cyl(0.04, 0.04, 0.5, 6, IRON, v[0], 1.4, v[2]);
      props.add(new THREE.TorusGeometry(0.2, 0.024, 4, 12), RED_WHEEL, { x: v[0], y: 1.65, z: v[2], rx: Math.PI / 2 });
      props.box(0.4, 1.1, 0.12, IRON, v[0], 0.55, v[2], { ry: Math.atan2(fr(a).tx, fr(a).tz) });
    }
  }

  // section plate hung over the catwalk (two-sided), seen straight ahead
  function sectionPlate(s, rect) {
    const F = frameAt(s); at(s);
    const p = F.p(0, 0, DY + 3.0);
    decal(rect, 2.0, 0.5, p, qYaw(F.yaw + Math.PI));
    decal(rect, 2.0, 0.5, [p[0] + F.f.tx * 0.03, p[1], p[2] + F.f.tz * 0.03], qYaw(F.yaw));
    props.box(2.1, 0.58, 0.02, IRON, ...F.p(0.015, 0, DY + 3.0), { ry: F.yaw });
    for (const sx of [-0.85, 0.85]) props.link(F.p(0, sx, DY + 3.28), F.p(0, sx, CEIL - 0.6), 0.008, 0.008, 0x1a1a1a, 3);
  }

  // per-section layout (positions relative to the section ranges so course tweaks keep it sensible)
  for (const sec of sections) {
    const a = Math.max(sec.from, 0), b = Math.min(sec.to, sF0), len = b - a;
    const mid = (a + b) / 2;
    sectionPlate(Math.min(b - 2, a + (a < 1 ? 9 : 7)), SIGN[sec.id] || DECALS4.mash);
    if (sec.id === 'mash') {
      mashTun(a + len * 0.19, -5.9);
      kettle(a + len * 0.43, 6.2, 1.05, true);
      mashTun(a + len * 0.66, -5.9);
      mashTun(a + len * 0.86, 5.9);
      manifold(a + 4, a + len * 0.3, 8.6);
    } else if (sec.id === 'lauter') {
      lauterTun(mid + 2, -6.3);
      receiver(mid - 2, 5.6);
      manifold(a + 6, b - 4, 8.8);
    } else if (sec.id === 'kettles') {
      kettle(a + len * 0.17, -6.3, 1.4);
      kettle(a + len * 0.5, 6.3, 1.4);
      kettle(a + len * 0.83, -6.3, 1.4);
      manifold(a + len * 0.3, a + len * 0.7, -8.8);
    } else if (sec.id === 'hops') {
      for (let s = a + 5, i = 0; s < b - 4; s += 6.5, i++) {
        for (const side of [-1, 1]) {
          const F = frameAt(s + side * 1.5, side * (5 + (i % 2) * 2.2)); at(s);
          const [x, , z] = F.p(0, 0, 0);
          sackStack(x, z, F.yaw, 3 + (i % 2), 2);
        }
      }
      // hop scale + loose sacks near the wall
      const F = frameAt(mid, 8.2), [x, , z] = F.p(0, 0, 0); at(mid);
      props.box(1.4, 0.2, 1.0, IRON2, x, 0.1, z); props.box(1.2, 0.05, 0.9, 0x6a6258, x, 0.24, z);
      props.box(0.12, 1.5, 0.12, IRON, ...F.p(-0.4, -0.55, 0.95), { ry: F.yaw });
      props.box(0.6, 0.5, 0.15, IRON2, ...F.p(-0.4, -0.55, 1.75), { ry: F.yaw });
      decal(DECALS4.clock, 0.4, 0.4, F.p(-0.4, -0.47, 1.75), qYaw(F.yaw - Math.PI / 2));
    } else if (sec.id === 'cool') {
      // the cooling pan: one huge shallow riveted iron pan on short legs, the whole hall wide
      const s0 = a + 5, s1 = Math.min(b, sF0) - 6, w = 8.6;
      for (const ss of [samples(s0, s1, 10)]) for (let i = 0; i < ss.length - 1; i++) {
        const p0 = ss[i], p1 = ss[i + 1]; at((p0 + p1) / 2);
        const F = frameAt((p0 + p1) / 2), lenS = p1 - p0;
        props.box(2 * w, 0.06, lenS, IRON2, ...F.p(0, 0, 0.5), { ry: F.yaw });
        wort.add(new THREE.PlaneGeometry(2 * w - 0.1, lenS), 0, { ...F.o(0, 0, 0.78, { rx: -Math.PI / 2 }) });
        for (const sx of [-1, 1]) {
          props.box(0.08, 0.48, lenS, IRON, ...F.p(0, sx * w, 0.73), { ry: F.yaw });
          props.box(0.2, 0.06, lenS, IRON2, ...F.p(0, sx * (w + 0.06), 0.98), { ry: F.yaw });
        }
        for (let q = p0 + 1; q < p1; q += 3) for (let l = -w + 1.5; l < w; l += 3) { const pp = W(q, l, 0.25); props.box(0.16, 0.5, 0.16, IRON, pp[0], 0.25, pp[2]); }
      }
      for (const ends of [s0, s1]) { const F = frameAt(ends); at(ends); props.box(2 * w + 0.1, 0.5, 0.08, IRON, ...F.p(0, 0, 0.73), { ry: F.yaw }); }
      for (let s = s0 + 4; s < s1; s += 9) for (const l of [-5, 0, 5]) { const p = W(s + l * 0.3, l, 0); emitters.push({ x: p[0], y: 0.9, z: p[2], rate: 1.2, r: 3, kind: 'pan' }); }
      // floor lamps over the pan
      for (let s = s0 + 6; s < s1; s += 16) for (const l of [-5.5, 5.5]) { const p = W(s, l, 0); at(s); pendant(p[0], 5.0, p[2], CEIL - 0.6, { poolY: 0.8, poolSize: 7, poolCol: [0.18, 0.11, 0.04] }); }
    }
  }
  // enamel signs on the walls of every section (big, readable "brewery" texture)
  {
    let i = 0;
    for (let s = 14; s < sF0; s += 23, i++) {
      if (inCorner(s, 8)) continue;
      const side = i % 2 ? 1 : -1, F = frameAt(s, side * (H - 0.18)); at(s);
      const rect = i % 3 === 0 ? DECALS4.smoke : DECALS4.steam;
      decal(rect, 2.4, 0.6, F.p(0, 0, 8.0 - (i % 2) * 2.4 + 2.4), qYaw(F.yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2)));
    }
  }

  // ------------------------------------------------------------------ hazards: static parts + dynamic pools
  const steamJets = [];  // {h, x, z, lane}
  const drips = [];      // {h, x, z, yTop}
  const falls = [];      // {h, x, z, yaw, kind, lane}
  const firstSteam = new Set();
  for (const h of hazards) {
    const F = frameAt(h.s); at(h.s);
    const laneLat = (l) => l * LW;
    const lanes = h.lanes || [0];
    const lo = Math.min(...lanes), hi = Math.max(...lanes);
    if (h.type === 'hole') {
      const [s0, s1] = holeSpan(h);
      for (const l of lanes) {
        const lat0 = (l - 0.5) * LW, lat1 = (l + 0.5) * LW;
        // red-lead painted warning edges on the grating before / after the gap
        for (const [sa, sb] of [[s0 - 0.16, s0 - 0.01], [s1 + 0.01, s1 + 0.16]]) {
          const A = W(sa, lat0 + 0.03, DY + 0.006), Bp = W(sa, lat1 - 0.03, DY + 0.006), C = W(sb, lat1 - 0.03, DY + 0.006), D = W(sb, lat0 + 0.03, DY + 0.006);
          props.add(soup([...A, ...Bp, ...C, ...A, ...C, ...D], null, null, [0, 1, 0]), 0xb2442a);
        }
        // darkness under the gap (multiplies whatever is seen through it: reads as depth, not as lit floor)
        {
          const A = W(s0 - 0.3, lat0 - 0.2, DY - 0.45), Bp = W(s0 - 0.3, lat1 + 0.2, DY - 0.45), C = W(s1 + 0.3, lat1 + 0.2, DY - 0.45), D = W(s1 + 0.3, lat0 - 0.2, DY - 0.45);
          voids.add(soup([...A, ...Bp, ...C, ...A, ...C, ...D], null, null, [0, 1, 0]), 0, {});
        }
        // torn, bent grating tabs hanging into the gap
        for (const [se, dir] of [[s0, 1], [s1, -1]]) {
          const Fe = frameAt(se);
          const n = 3, RR = rng(Math.round(h.s * 10) + l * 7 + (dir > 0 ? 0 : 3));
          for (let i = 0; i < n; i++) {
            const w = (LW - 0.06) / n * (0.6 + RR() * 0.35), lc = lat0 + 0.03 + (i + 0.5) * (LW - 0.06) / n + (RR() - 0.5) * 0.04;
            const len = 0.1 + RR() * 0.2, ang = 0.4 + RR() * 0.9;
            const off = [0, -Math.sin(ang) * len / 2, dir * Math.cos(ang) * len / 2];
            props.add(new THREE.BoxGeometry(w, 0.014, len), 0x4f4a43, Fe.o(off[2], lc, DY - 0.01 + off[1], { rx: dir * ang }));
          }
          // cut edge (bright worn steel)
          props.add(new THREE.BoxGeometry(LW - 0.04, 0.035, 0.025), 0x8f877a, Fe.o(0, (lat0 + lat1) / 2, DY - 0.017));
        }
      }
      continue;
    }
    if (h.type === 'steam') {
      for (const l of lanes) {
        const lat = laneLat(l), [x, , z] = W(h.s, lat, 0);
        // red-lead vent collar on the grating + riser from below with a valve
        props.add(new THREE.TorusGeometry(0.27, 0.035, 4, 16), RED_LEAD, { x, y: DY + 0.02, z, rx: Math.PI / 2 });
        props.add(new THREE.RingGeometry(0.12, 0.25, 14), 0x15110e, { x, y: DY + 0.008, z, rx: -Math.PI / 2 });
        props.cyl(0.11, 0.13, 0.18, 10, IRON2, x, DY - 0.12, z);
        props.cyl(0.08, 0.08, 1.4, 8, IRON, x, DY - 0.9, z);
        props.cyl(0.14, 0.14, 0.2, 8, IRON2, x, DY - 1.0, z);
        props.add(new THREE.TorusGeometry(0.16, 0.025, 4, 12), RED_WHEEL, { ...F.o(0.2, lat, DY - 1.0, { rx: 0 }) });
        props.link([x, DY - 1.6, z], W(h.s, lat < 0 ? -1.62 : 1.6, DY - 0.62), 0.07, 0.07, IRON, 6);
        steamJets.push({ h, x, z, lane: l });
      }
      if (!firstSteam.has(secAt(h.s))) {
        firstSteam.add(secAt(h.s));
        const side = lanes.includes(1) && !lanes.includes(-1) ? -1 : 1, p = W(h.s - 3, side * (RAIL + 0.04), DY + 0.8);
        decal(DECALS4.steam, 0.9, 0.23, p, qYaw(F.yaw + Math.PI));
      }
      continue;
    }
    if (h.type === 'drip') {
      const yP = DY + 3.0;
      // one crossing pipe per s (wall to wall), hung from the ceiling
      if (!drips.some((d) => Math.abs(d.h.s - h.s) < 0.6)) {
        const a = W(h.s, -H + 0.3, yP), b = W(h.s, H - 0.3, yP);
        props.link(a, b, 0.1, 0.1, 0x4a3f36, 10);
        for (const l of [-6.5, -2.4, 2.4, 6.5]) { const p = W(h.s, l, 0); props.link([p[0], yP + 0.1, p[2]], [p[0], CEIL - 0.6, p[2]], 0.015, 0.015, IRON, 4); props.add(new THREE.TorusGeometry(0.12, 0.018, 4, 10), IRON, { ...F.o(0, l, yP, { ry: Math.PI / 2 }) }); }
        for (const l of [-4.5, 4.5]) props.add(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10), IRON2, { ...F.o(0, l, yP, { rz: Math.PI / 2 }) });
      }
      for (const l of lanes) {
        const lat = laneLat(l), [x, , z] = W(h.s, lat, 0);
        // leaking flange (rusty red-lead), rust streak, wet stain on the grating
        props.add(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 12), RED_LEAD, { ...F.o(0, lat, yP, { rz: Math.PI / 2 }) });
        for (const o of [-0.1, 0.1]) props.add(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 10), IRON2, { ...F.o(0, lat + o, yP, { rz: Math.PI / 2 }) });
        props.add(new THREE.ConeGeometry(0.025, 0.12, 6), 0x6a3a1c, { x, y: yP - 0.16, z, rx: Math.PI });
        stain.add(new THREE.CircleGeometry(0.3, 14), 0, { x, y: DY + 0.008, z, rx: -Math.PI / 2, sx: 1, sy: 1.3 });
        stain.add(new THREE.CircleGeometry(0.14, 10), 0, { x: x + 0.12, y: DY + 0.009, z: z - 0.1, rx: -Math.PI / 2 });
        drips.push({ h, x, z, yTop: yP - 0.2, lane: l });
      }
      continue;
    }
    if (h.type === 'fall') {
      const kind = ['hops', 'lauter', 'mash'].includes(secAt(h.s)) ? 'sack' : 'crate';
      // hoist runway beam across the hall under the ceiling + trolley, pulley block, chain, hook
      const yR = CEIL - 1.0;
      for (const o of [-0.08, 0.08]) props.add(new THREE.BoxGeometry(8.5, 0.32, 0.03), BEAM, F.o(o, 0, yR));
      props.add(new THREE.BoxGeometry(8.5, 0.03, 0.22), BEAM, F.o(0, 0, yR - 0.16));
      for (const l of [-3.8, 3.8]) props.link(W(h.s, l, yR), W(h.s, l, CEIL - 0.6), 0.03, 0.03, IRON, 4);
      for (const l of lanes) {
        const lat = laneLat(l), [x, , z] = W(h.s, lat, 0);
        props.add(new THREE.BoxGeometry(0.34, 0.2, 0.42), RED_LEAD, F.o(0, lat, yR - 0.3));
        props.add(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 12), IRON2, F.o(0, lat, yR - 0.6, { rz: Math.PI / 2 }));
        const yHook = DY + (kind === 'sack' ? 4.25 : 4.0);
        for (const o of [-0.07, 0.07]) props.link([x + fr(h.s).tx * o, yR - 0.6, z + fr(h.s).tz * o], [x, yHook + 0.2, z], 0.014, 0.014, 0x55524c, 4);
        props.add(new THREE.TorusGeometry(0.09, 0.022, 4, 10, Math.PI * 1.4), STEEL, { ...F.o(0, lat, yHook + 0.1, { rz: 0.5 }) });
        props.box(0.12, 0.16, 0.08, RED_LEAD, x, yHook + 0.26, z);
        if (kind === 'crate') for (const [da, dl] of [[-0.4, -0.33], [0.4, -0.33], [-0.4, 0.33], [0.4, 0.33]]) {
          const p = F.p(da, lat + dl, yHook - 0.4 - 0.12 + 0.55 + 0.02);
          props.link([x, yHook + 0.05, z], [p[0], DY + 3.3 + BLOCK_HEIGHT + 0.02, p[2]], 0.01, 0.01, 0xa58c5c, 3);
        }
        falls.push({ h, x, z, yaw: F.yaw, kind, lane: l, yHook });
      }
      continue;
    }
    if (h.type === 'pipe') {
      const r = 0.11, yC = DY + (h.height ?? 0.45) - r;
      const full = lo === -1 && hi === 1;
      const la = full ? -RAIL - 0.35 : (lo - 0.5) * LW + 0.05, lb = full ? RAIL + 0.35 : (hi + 0.5) * LW - 0.05;
      props.link(W(h.s, la, yC), W(h.s, lb, yC), r, r, RED_LEAD, 12);
      // cream lagging collars on the outer lanes → striped, readable at distance
      for (const l of lanes) if (l !== 0) props.add(new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.32, 12), CREAM, F.o(0, l * LW, yC, { rz: Math.PI / 2 }));
      for (const l of [la + 0.05, lb - 0.05]) props.add(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.07, 12), IRON2, F.o(0, l, yC, { rz: Math.PI / 2 }));
      // saddles on the lane seams
      for (const l of [-0.5, 0.5]) if (l * LW > la && l * LW < lb) props.box(0.1, yC - DY, 0.22, IRON, ...F.p(0, l * LW, DY + (yC - DY) / 2), { ry: F.yaw });
      // elbows down through the deck at the ends
      for (const l of [la, lb]) { const p = W(h.s, l, 0); props.link([p[0], yC, p[2]], [p[0], DY - 1.4, p[2]], r, r, RED_LEAD, 10); props.sph(r * 1.05, 8, 6, RED_LEAD, p[0], yC, p[2]); }
      continue;
    }
  }

  // ------------------------------------------------------------------ finish: the main steam valve platform
  const finish = {};
  {
    const sv = L - 0.9, F = frameAt(sv); at(sv);
    // main steam line: vertical pipe from the floor to the ceiling behind the valve, big valve body
    const c = F.p(0, 0, 0);
    props.cyl(0.26, 0.26, CEIL, 14, IRON, c[0], CEIL / 2, c[2]);
    for (const y of [1.0, DY - 0.4, DY + 2.2, CEIL - 1.2]) props.cyl(0.36, 0.36, 0.12, 14, IRON2, c[0], y, c[2]);
    props.add(new THREE.SphereGeometry(0.5, 16, 10), IRON2, { x: c[0], y: DY + 1.2, z: c[2] });
    props.cyl(0.42, 0.42, 0.14, 16, IRON2, c[0], DY + 1.2 + 0.45, c[2]);
    props.cyl(0.42, 0.42, 0.14, 16, IRON2, c[0], DY + 1.2 - 0.45, c[2]);
    // spindle toward the runner + bonnet
    const sp = F.p(-0.8, 0, DY + 1.25);
    props.link([c[0], DY + 1.25, c[2]], sp, 0.12, 0.12, IRON2, 12);
    metal.link(sp, F.p(-1.25, 0, DY + 1.25), 0.04, 0.04, 0x9a9c9e, 8);
    // horizontal branch lines left/right with flanges
    for (const sx of [-1, 1]) {
      props.link([c[0], DY + 1.2, c[2]], F.p(0, sx * 2.6, DY + 1.2), 0.17, 0.17, LAGGING, 12);
      props.link(F.p(0, sx * 2.6, DY + 1.2), F.p(0, sx * 2.6, CEIL - 0.6), 0.17, 0.17, LAGGING, 12);
      props.add(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 12), IRON2, F.o(0, sx * 1.2, DY + 1.2, { rz: Math.PI / 2 }));
    }
    // the big red hand wheel (dynamic: spins when the valve is closed at the finish)
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
    // pressure gauge (big) on a stand at the left, needle = elapsed time
    const gp = F.p(-0.9, 1.6, DY + 2.0), gq = qYaw(F.yaw + Math.PI);
    metal.add(new THREE.TorusGeometry(0.42, 0.05, 6, 28), BRASS, { x: gp[0], y: gp[1], z: gp[2], q: gq });
    metal.add(new THREE.CylinderGeometry(0.43, 0.43, 0.12, 28), BRASS, { x: gp[0], y: gp[1], z: gp[2], q: gq.clone().multiply(new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2, 0, 0))) });
    const gfp = F.p(-0.97, 1.6, DY + 2.0);
    decal(DECALS4.gauge, 0.8, 0.8, gfp, gq);
    props.link(F.p(-0.9, 1.6, DY + 1.55), F.p(-0.4, 0.4, DY + 1.25), 0.03, 0.03, 0x8a6a3a, 6);
    props.link(F.p(-0.85, 1.6, 0), F.p(-0.85, 1.6, DY + 1.6), 0.05, 0.05, IRON, 6);
    const ng = mergeGeometries([
      new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.02, 0), new THREE.Vector2(0.02, 0), new THREE.Vector2(0.004, 0.33), new THREE.Vector2(-0.004, 0.33)])),
      new THREE.CircleGeometry(0.04, 10),
    ].map((x) => { x.deleteAttribute('uv'); x.deleteAttribute('normal'); return x; }));
    const needle = new THREE.Mesh(ng, new THREE.MeshBasicMaterial({ color: 0x1a1612 }));
    const np = F.p(-1.0, 1.6, DY + 2.0);
    needle.position.set(np[0], np[1], np[2]); needle.quaternion.copy(gq); needle.userData.dynamic = true;
    root.add(needle);
    finish.needle = needle; finish.gq = gq.clone();
    // brass bell on a bracket at the right
    const bp = F.p(-0.5, -1.7, DY + 2.5);
    props.box(0.1, 0.1, 0.9, IRON, ...F.p(-0.1, -1.7, DY + 2.95), { ry: F.yaw });
    props.link(F.p(0.3, -1.7, DY + 2.95), F.p(0.3, -1.7, DY), 0.04, 0.04, IRON, 6);
    metal.add(new THREE.LatheGeometry([[0.02, 0.36], [0.12, 0.34], [0.17, 0.2], [0.2, 0.02], [0.26, -0.06], [0.25, -0.08]].map(([a, b]) => new THREE.Vector2(a, b)), 20), BRASS, { x: bp[0], y: bp[1] + 0.06, z: bp[2] });
    metal.sph(0.05, 8, 6, BRASS, bp[0], bp[1] - 0.12, bp[2]);
    props.link(bp, [bp[0], DY + 1.3, bp[2]], 0.008, 0.008, 0xa58c5c, 3);
    // enamel plate over the valve, clock, lamps
    decal(DECALS4.valve, 2.0, 0.5, F.p(-0.6, 0, DY + 3.0), qYaw(F.yaw + Math.PI));
    props.box(2.1, 0.58, 0.04, IRON, ...F.p(-0.55, 0, DY + 3.0), { ry: F.yaw });
    for (const sx of [-1.5, 1.5]) { const p = F.p(-0.6, sx, DY + 3.6); pendant(p[0], p[1], p[2], CEIL - 0.6, { big: 1.1 }); catLamps.push({ s: sv - 0.6, x: p[0], y: p[1], z: p[2] }); }
    decal(DECALS4.board, 1.2, 0.6, F.p(-0.3, 2.6, DY + 1.4), qYaw(F.yaw + Math.PI));
  }

  // ------------------------------------------------------------------ assemble static chunks
  const meshes = [];
  for (const [k, c] of [...chunks.entries()].sort((a, b) => a[0] - b[0])) {
    for (const [name, batch] of Object.entries(c)) {
      const m = batch.mesh(M[name]);
      if (!m) continue;
      m.name = `chunk${k}-${name}`;
      m.userData.chunk = k;
      if (ORDER[name]) m.renderOrder = ORDER[name];
      root.add(m); meshes.push(m);
    }
  }

  // ------------------------------------------------------------------ dynamic: lamp halos (camera-facing, one draw call)
  const haloMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowPatch(new THREE.MeshBasicMaterial({ map: T.pool, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), halos.length);
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

  // ------------------------------------------------------------------ dynamic: drips (drop, halo, splash ring)
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

  // ------------------------------------------------------------------ real lights
  const lampLights = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.SpotLight(0xffcf96, 0, 24, 1.2, 0.45, 2);
    l.userData.dynamic = true; l.target.userData.dynamic = true;
    root.add(l, l.target);
    lampLights.push({ light: l, lamp: -1, fade: 0 });
  }
  catLamps.sort((a, b) => a.s - b.s);
  const day = new THREE.DirectionalLight(0xa6b9cc, 0.42);
  day.position.set(-LIGHT.x * 20, -LIGHT.y * 20, -LIGHT.z * 20); day.target.position.set(0, 0, 0);
  root.add(day, day.target);
  const LAMP_I = 110;
  // warm bounce fill (the hall is lit by many lamps we do not simulate): lifts every lit material by its albedo
  const bounce = new THREE.HemisphereLight(0x9a8a74, 0x2c2219, 0.42);
  root.add(bounce);

  // ------------------------------------------------------------------ debug camera / clock
  const dbg = {};
  {
    const cam = params.get('artcam');
    if (cam) {
      const v = cam.split(',').map(Number);
      dbg.cam = v;
      dbg.s = v.length < 6 ? v[0] : sOf(v[3], v[5]);
      // the lead's first-person rig ends every frame with camera.lookAt(): hijack it so the pose is set before
      // the renderer updates matrices (overriding later, e.g. in onBeforeRender, leaves view-space lights stale)
      const look = THREE.Object3D.prototype.lookAt;
      const apply = () => {
        if (v.length >= 6) { camera.position.set(v[0], v[1], v[2]); look.call(camera, v[3], v[4], v[5]); }
        else {
          const [s, lat = 0, h = run.eyeHeight, ahead = 7] = v;
          const p = W(s, lat, DY + h), q = W(s + ahead, lat * 0.6, DY + h - 0.35);
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

  const VIS_BACK = 20, VIS_AHEAD = 105;
  const showAll = !!params.get('artcut') || params.get('cam') === 'orbit';
  // ------------------------------------------------------------------ update
  let wall = 0, lastRT = 0, dripCycle = new Map();
  const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
  function update(dt, t, vis = {}) {
    wall += dt;
    const rs = vis.runner;
    const sR = dbg.s ?? rs?.s ?? course.start;
    const tr = dbg.t ?? vis.raceTime ?? 0;
    const dtr = Math.max(0, Math.min(0.1, tr - lastRT)); lastRT = tr;
    const playingDt = dbg.t != null ? dt : dtr > 0 ? dtr : dt * 0.0; // particles flow while the race clock runs (or in debug)
    const pdt = vis.state === 'paused' ? 0 : dt;
    const cp = camera.position;

    // path-distance culling: the hall is L-shaped, so other legs sit inside the frustum behind opaque walls
    if (!showAll) for (const m of meshes) { const k = m.userData.chunk; m.visible = (k + 1) * CH > sR - VIS_BACK && k * CH < sR + VIS_AHEAD; }
    // rotating gear
    for (const d of dyn) d.mesh.rotation.y += d.w * pdt;
    // fire flicker
    const fl = 1.7 + 0.35 * Math.sin(wall * 11.3) * Math.sin(wall * 7.1 + 1.3) + 0.15 * Math.sin(wall * 23.0);
    M.fire.color.setRGB(fl, fl, fl);

    // halos face the camera
    camera.getWorldQuaternion(tmpQ);
    for (let i = 0; i < halos.length; i++) {
      const hl = halos[i];
      _m.compose(_p.set(hl.x, hl.y, hl.z), tmpQ, _s.setScalar(hl.size));
      haloMesh.setMatrixAt(i, _m);
    }
    haloMesh.instanceMatrix.needsUpdate = true;

    // lamp lights: each of the 3 lights serves every 3rd lamp — the nearest one ahead of the runner
    for (let k = 0; k < 3; k++) {
      const LL = lampLights[k];
      let best = -1;
      for (let i = k; i < catLamps.length; i += 3) if (catLamps[i].s > sR - 4) { best = i; break; }
      if (best !== LL.lamp) { LL.lamp = best; LL.fade = 0; if (best >= 0) { const lp = catLamps[best]; LL.light.position.set(lp.x, lp.y, lp.z); LL.light.target.position.set(lp.x, lp.y - 5, lp.z); } }
      LL.fade = Math.min(1, LL.fade + dt / 0.35);
      if (best < 0) { LL.light.intensity = 0; continue; }
      const d = catLamps[best].s - sR;
      const f = THREE.MathUtils.smoothstep(d, -4, -1) * (1 - THREE.MathUtils.smoothstep(d, 26, 38));
      LL.light.intensity = LAMP_I * f * LL.fade;
    }

    const near = (s) => s > sR - 12 && s < sR + 85;

    // steam jets
    for (let i = 0; i < steamJets.length; i++) {
      const j = steamJets[i];
      if (!near(j.h.s)) { jets.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      const lvl = steamLevel(j.h, tr);
      // anticipation wisp (same cycle maths as the helper): < 0.9 s before the jet opens
      const u = (((tr + j.h.phase) % j.h.period) + j.h.period) % j.h.period, pre = j.h.period - u;
      const flick = 0.92 + 0.08 * Math.sin(wall * 37 + i * 3.1);
      const hgt = lvl >= 0.3 ? (0.55 + 0.45 * lvl) * flick : lvl * 1.2;
      _m.compose(_p.set(j.x, DY + 0.02, j.z), tmpQ.identity(), _s.set(0.6 + 0.5 * lvl, Math.max(0.001, hgt), 0.6 + 0.5 * lvl));
      jets.setMatrixAt(i, _m);
      const br = lvl >= 0.3 ? 0.42 * lvl * flick : lvl * 0.9;
      jets.setColorAt(i, _c.setRGB(br, br * 0.97, br * 0.93));
      // particles
      let rate = 0, up = 0, life = 0.7, sz = 0.6;
      if (lvl >= 0.3) { rate = 46 * lvl; up = 4.2; life = 0.75; sz = 0.95; }
      else if (lvl > 0) { rate = 26; up = 1.6; life = 0.55; sz = 0.45; }
      else if (u >= j.h.on && pre < 0.9) { rate = 7; up = 0.9; life = 0.7; sz = 0.35; }
      j.acc += rate * (playingDt || dt * (vis.state === 'menu' || vis.state === 'countdown' ? 1 : 0));
      while (j.acc >= 1) {
        j.acc -= 1;
        const a = Math.random() * 6.283, rr = Math.random() * 0.12;
        parts.emit({ x: j.x + Math.cos(a) * rr, y: DY + 0.05, z: j.z + Math.sin(a) * rr, vx: Math.cos(a) * 0.5, vz: Math.sin(a) * 0.5, vy: up * (0.75 + Math.random() * 0.5),
          max: life * (0.8 + Math.random() * 0.4), s0: sz * 0.35, s1: sz * (1.6 + Math.random()), a: lvl >= 0.3 ? 0.55 : 0.4, drag: 1.4, r: 0.86, g: 0.83, b: 0.78, fadeIn: 0.08 });
      }
    }
    jets.instanceMatrix.needsUpdate = true; if (jets.instanceColor) jets.instanceColor.needsUpdate = true;

    // drips
    for (let i = 0; i < drips.length; i++) {
      const d = drips[i];
      if (!near(d.h.s)) { dropMesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); dropHalo.setMatrixAt(i, _m); splash.setMatrixAt(i, _m); continue; }
      const st = dripState(d.h, tr);
      let y, sc = 1, sy = 1;
      if (st.y01 != null && !st.active) { y = d.yTop - st.y01 * (d.yTop - DY - 0.05); sy = 1.25 + st.y01 * 0.9; }
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
        splash.setMatrixAt(i, _m.compose(_p.set(d.x, DY + 0.03, d.z), tmpQ.identity(), _s.setScalar(0.12 + 0.5 * k)));
        splash.setColorAt(i, _c.setRGB(0.9 * (1 - k), 0.65 * (1 - k), 0.35 * (1 - k)));
        if (!d.lastSplash) {
          for (let q = 0; q < 6; q++) { const a = Math.random() * 6.283; parts.emit({ x: d.x, y: DY + 0.05, z: d.z, vx: Math.cos(a) * 1.4, vz: Math.sin(a) * 1.4, vy: 1.6 + Math.random(), grav: 9, drag: 0.5, max: 0.35, s0: 0.05, s1: 0.04, a: 0.9, r: 1.0, g: 0.75, b: 0.45, floor: DY, fadeIn: 0.01 }); }
          parts.emit({ x: d.x, y: DY + 0.1, z: d.z, vy: 0.5, max: 0.8, s0: 0.2, s1: 0.7, a: 0.3, drag: 1 });
        }
      } else splash.setMatrixAt(i, _m.makeScale(0, 0, 0));
      d.lastSplash = !!st.active;
    }
    for (const m of [dropMesh, dropHalo, splash]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

    // falling sacks / crates
    const trig = rs?.fallTriggers || {};
    const doFall = (list, mesh, sack) => {
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        const tt = dbg.fall != null ? dbg.fall : trig[f.h.id];
        const k = fallProgress(tt, tr);
        let y, rot = 0, spin = 0;
        const hangBottom = sack ? f.yHook - 0.12 - 0.9 : DY + 3.3;
        const yHang = sack ? hangBottom + 0.45 : hangBottom + BLOCK_HEIGHT / 2;
        const yRest = DY + BLOCK_HEIGHT / 2;
        if (k == null) { y = yHang; spin = 0.12 * Math.sin(wall * 0.9 + i * 2); }
        else { y = yHang + (yRest - yHang) * k * k; rot = sack ? THREE.MathUtils.smoothstep(k, 0.45, 1) * Math.PI / 2 : 0; spin = (1 - k) * 0.12 * Math.sin(i * 2); }
        if (sack && k != null && k >= 1) y = yRest;
        tmpQ.setFromEuler(tmpE.set(0, f.yaw + spin, rot, 'YXZ')); // sacks tip over sideways: lying across the lane
        mesh.setMatrixAt(i, _m.compose(_p.set(f.x, y, f.z), tmpQ, _s.set(1, 1, 1)));
        if (k != null && k >= 1 && !f.dust) { f.dust = true; for (let q = 0; q < 8; q++) { const a = Math.random() * 6.283; parts.emit({ x: f.x + Math.cos(a) * 0.4, y: DY + 0.1, z: f.z + Math.sin(a) * 0.4, vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2, vy: 0.4, max: 0.9, s0: 0.2, s1: 0.8, a: 0.25, r: 0.7, g: 0.62, b: 0.48, drag: 2 }); } }
        if (k == null) f.dust = false;
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    doFall(sackFalls, sackMesh, true);
    doFall(crateFalls, crateMesh, false);

    // ambient steam from vessels near the camera
    for (const e of emitters) {
      if (!e.rate) continue;
      const dx = e.x - cp.x, dz = e.z - cp.z;
      if (dx * dx + dz * dz > 60 * 60) continue;
      e.acc = (e.acc || 0) + e.rate * pdt;
      while (e.acc >= 1) {
        e.acc -= 1;
        const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * e.r;
        if (e.kind === 'hatch') parts.emit({ x: e.x, y: e.y, z: e.z, vx: e.nx * 0.6, vz: e.nz * 0.6, vy: 0.9, max: 2.6, s0: 0.4, s1: 2.2, a: 0.16, drag: 0.4 });
        else parts.emit({ x: e.x + Math.cos(a) * rr, y: e.y, z: e.z + Math.sin(a) * rr, vx: (Math.random() - 0.5) * 0.2, vz: (Math.random() - 0.5) * 0.2, vy: 0.45 + Math.random() * 0.3, max: 3.5, s0: 0.6, s1: 2.6, a: e.kind === 'pan' ? 0.09 : 0.12, drag: 0.3, r: 0.8, g: 0.76, b: 0.7, fadeIn: 0.25 });
      }
    }
    parts.update(pdt);

    // finish valve: needle shows elapsed time against the limit; the wheel spins once the run is won
    const tl = run.timeLimit || 70;
    const frac = Math.min(1.05, (rs?.time ?? tr) / tl);
    finish.needle.quaternion.copy(finish.gq).multiply(tmpQ.setFromAxisAngle(_v.set(0, 0, 1), Math.PI * 0.75 - frac * Math.PI * 1.5));
    const won = vis.state === 'won' || (rs && rs.s >= course.finish);
    finish.spin = won ? Math.min(1, finish.spin + dt * 0.8) : Math.max(0, finish.spin - dt);
    if (finish.spin > 0) finish.wheel.rotateZ(-dt * 5 * finish.spin);
  }

  return {
    update,
    lights: { lamps: lampLights.map((l) => l.light), day, bounce },
    envMap,
    meshes,
    info: () => ({ chunks: chunks.size, meshes: meshes.length, halos: halos.length, lamps: catLamps.length, jets: steamJets.length, drips: drips.length, falls: falls.length }),
  };
}
