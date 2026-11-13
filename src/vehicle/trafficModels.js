// Procedural low-poly models for traffic (tram, horse cart, pedestrians, steam train, level-crossing
// barriers) plus the small geometry toolkit shared with truckModel.js.
// Everything is built from vertex-coloured primitives merged into as few geometries as possible.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------------------------------------
// geometry toolkit
// ------------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _Y = new THREE.Vector3(0, 1, 0);

/** Clone `geo` as non-indexed position/normal/colour geometry, transformed (scale -> rotate XYZ -> translate). */
export function G(geo, color, o = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.clearGroups();
  if (o.q) _q.copy(o.q); else { _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'XYZ'); _q.setFromEuler(_e); }
  _m.compose(_v.set(o.x || 0, o.y || 0, o.z || 0), _q, _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
  g.applyMatrix4(_m);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _c.set(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export const box = (w, h, d, c, x = 0, y = 0, z = 0, o = {}) => G(new THREE.BoxGeometry(w, h, d), c, { ...o, x, y, z });
export const cyl = (rt, rb, h, seg, c, x = 0, y = 0, z = 0, o = {}) => G(new THREE.CylinderGeometry(rt, rb, h, seg), c, { ...o, x, y, z });
/** cylinder with its axis along Z */
export const cylZ = (rt, rb, h, seg, c, x = 0, y = 0, z = 0, o = {}) => cyl(rt, rb, h, seg, c, x, y, z, { ...o, rx: Math.PI / 2 });
/** cylinder with its axis along X */
export const cylX = (rt, rb, h, seg, c, x = 0, y = 0, z = 0, o = {}) => cyl(rt, rb, h, seg, c, x, y, z, { ...o, rz: Math.PI / 2 });
export const sph = (r, ws, hs, c, x = 0, y = 0, z = 0, o = {}) => G(new THREE.SphereGeometry(r, ws, hs), c, { ...o, x, y, z });
/** tapered cylinder between two points */
export function link(p0, p1, r0, r1, c, seg = 6) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
  const d = b.clone().sub(a); const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize());
  const mid = a.add(b).multiplyScalar(0.5);
  return G(new THREE.CylinderGeometry(r1, r0, len, seg), c, { q, x: mid.x, y: mid.y, z: mid.z });
}
/** thin box between two points */
export function bar(p0, p1, w, t, c) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
  const d = b.clone().sub(a); const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize());
  const mid = a.add(b).multiplyScalar(0.5);
  return G(new THREE.BoxGeometry(w, len, t), c, { q, x: mid.x, y: mid.y, z: mid.z });
}
export const merge = (parts) => {
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
};
export const vcolMaterial = (opts = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });

/**
 * Static parts + vertex-animated parts merged into ONE geometry (one draw call).
 * anims: [{ geo, kind: 'rot'|'orbit', cy, cz, r }] ; set(i, angle) rotates part i about the X axis through (cy, cz)
 * ('rot'), or moves it on a circle of radius r ('orbit').
 */
export function buildAnimated(statics, anims) {
  const geometry = mergeGeometries([...statics, ...anims.map((a) => a.geo)], false);
  let off = 0;
  for (const g of statics) off += g.attributes.position.count;
  const items = anims.map((a) => { const n = a.geo.attributes.position.count; const it = { ...a, start: off, n }; off += n; return it; });
  const pos = geometry.attributes.position, nor = geometry.attributes.normal;
  const bp = Float32Array.from(pos.array), bn = Float32Array.from(nor.array);
  pos.setUsage(THREE.DynamicDrawUsage); nor.setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 1.0;
  function set(i, a) {
    const it = items[i]; const c = Math.cos(a), s = Math.sin(a);
    const pa = pos.array, na = nor.array;
    for (let k = it.start * 3, e = (it.start + it.n) * 3; k < e; k += 3) {
      if (it.kind === 'orbit') {
        pa[k] = bp[k]; pa[k + 1] = bp[k + 1] + it.r * (c - 1); pa[k + 2] = bp[k + 2] + it.r * s;
      } else {
        const y = bp[k + 1] - it.cy, z = bp[k + 2] - it.cz;
        pa[k] = bp[k]; pa[k + 1] = it.cy + y * c - z * s; pa[k + 2] = it.cz + y * s + z * c;
        const ny = bn[k + 1], nz = bn[k + 2];
        na[k] = bn[k]; na[k + 1] = ny * c - nz * s; na[k + 2] = ny * s + nz * c;
      }
    }
  }
  return { geometry, set, flush() { pos.needsUpdate = true; nor.needsUpdate = true; } };
}

/** Spoked wooden wheel (axis = X) as an array of coloured geometries. */
export function wheelParts(R, { spokes = 10, width = 0.1, dual = false, wood = 0x8b6a3c, felloe = 0x6a4d2b, tyre = 0x2c2b2a, hub = 0x2a2a2c, cap = 0xb98a2f, tyreW = 0.12, seg = 22, hubCap = true } = {}) {
  const P = [];
  const tw = tyreW;
  const span = dual ? tw * 2 + 0.02 : tw;
  const tyreProfile = (a) => [
    new THREE.Vector2(R - 0.085, a - tw / 2), new THREE.Vector2(R - 0.012, a - tw / 2), new THREE.Vector2(R, a - tw / 2 + 0.018),
    new THREE.Vector2(R, a + tw / 2 - 0.018), new THREE.Vector2(R - 0.012, a + tw / 2), new THREE.Vector2(R - 0.085, a + tw / 2),
  ];
  const lathe = (pts, col) => G(new THREE.LatheGeometry(pts, seg), col, { rz: Math.PI / 2 });
  if (dual) { P.push(lathe(tyreProfile(-(tw / 2 + 0.01)), tyre)); P.push(lathe(tyreProfile(tw / 2 + 0.01), tyre)); }
  else P.push(lathe(tyreProfile(0), tyre));
  const fi = R - 0.17, fo = R - 0.08, fw = span / 2 - 0.01;
  P.push(lathe([new THREE.Vector2(fi, -fw), new THREE.Vector2(fo, -fw), new THREE.Vector2(fo, fw), new THREE.Vector2(fi, fw), new THREE.Vector2(fi, -fw)], felloe));
  const len = fi + 0.02 - 0.06;
  for (let i = 0; i < spokes; i++) {
    const g = new THREE.BoxGeometry(0.055, len, 0.05).translate(0, 0.06 + len / 2, 0);
    P.push(G(g, wood, { rx: (i / spokes) * Math.PI * 2 }));
  }
  P.push(cylX(0.075, 0.075, span * 0.8 + 0.06, 8, hub));
  if (hubCap) P.push(cylX(0.05, 0.05, 0.02, 8, cap, span / 2 + 0.05));
  return P;
}

// ------------------------------------------------------------------------------------------------
// palette
// ------------------------------------------------------------------------------------------------
const IRON = 0x25262a, BRASS = 0xb98a2f, WOODC = 0x8a6a3e, WOOD_DARK = 0x3a2c1f, CREAM = 0xcfc4a0, GLASS = 0x26343c, RED = 0x7a1f1c;

// ------------------------------------------------------------------------------------------------
// text / emblem textures
// ------------------------------------------------------------------------------------------------
const FONT = 'Georgia, "Times New Roman", Times, serif';
export function drawEmblem(c, cx, cy, r, ink = '#ece6d4', bg = '#201c18') {
  c.fillStyle = ink; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = bg; c.beginPath(); c.arc(cx, cy, r * 0.84, 0, Math.PI * 2); c.fill();
  c.fillStyle = ink; c.beginPath(); c.arc(cx, cy, r * 0.62, 0, Math.PI * 2); c.fill();
  c.fillStyle = bg; c.beginPath(); c.arc(cx, cy, r * 0.5, 0, Math.PI * 2); c.fill();
  c.fillStyle = ink;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.beginPath(); c.arc(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3, r * 0.07, 0, Math.PI * 2); c.fill(); }
  c.beginPath(); c.arc(cx, cy, r * 0.12, 0, Math.PI * 2); c.fill();
}
/** "PLZEŇSKÝ (emblem) SVĚTOVAR" laid out in the box (x, y, w, h) of a 2D canvas context. */
export function drawBrandLine(c, x, y, w, h, { ink = '#ece6d4', bg = '#201c18', capH = 0.62 } = {}) {
  const size = h * capH / 0.7;
  c.font = `bold ${size}px ${FONT}`;
  c.textBaseline = 'middle'; c.textAlign = 'left';
  const t1 = 'PLZEŇSKÝ', t2 = 'SVĚTOVAR';
  const w1 = c.measureText(t1).width, w2 = c.measureText(t2).width;
  const emb = h * 0.62, gap = h * 0.16;
  const total = w1 + w2 + emb + gap * 2;
  const avail = w * 0.94;
  const sx = Math.min(1, avail / total);
  c.save();
  c.translate(x + w / 2, y + h / 2); c.scale(sx, 1); c.translate(-total / 2, 0);
  c.fillStyle = ink;
  c.fillText(t1, 0, 0);
  drawEmblem(c, w1 + gap + emb / 2, 0, emb / 2, ink, bg);
  c.fillStyle = ink;
  c.fillText(t2, w1 + gap * 2 + emb, 0);
  c.restore();
}

// ------------------------------------------------------------------------------------------------
// TRAM  (1920s Plzeň two-axle motor car; origin at ground between axles, faces +Z, trolley pole trails to -Z)
// ------------------------------------------------------------------------------------------------
export const TRAM = { length: 8.8, width: 2.2, wireY: 5.6 };
export function buildTramGeometry() {
  const P = [];
  const W = 2.2;
  const CR = 0xcfc4a0, ROOF = 0x7d7a70, DARKRED = 0x6e1b19;
  const hl = 4.4;
  // underframe + wheels
  P.push(box(1.9, 0.14, 8.4, IRON, 0, 0.47, 0));
  for (const z of [-1.4, 1.4]) for (const sx of [-1, 1]) {
    P.push(cylX(0.38, 0.38, 0.09, 14, IRON, sx * 0.82, 0.38, z));
    P.push(cylX(0.1, 0.1, 0.12, 8, 0x55534e, sx * 0.82, 0.38, z));
  }
  P.push(box(0.14, 0.14, 3.2, IRON, 0.82, 0.38, 0), box(0.14, 0.14, 3.2, IRON, -0.82, 0.38, 0));
  // lower body (dark red) and cream upper saloon
  P.push(box(W, 0.8, 5.4, DARKRED, 0, 0.95, 0));
  P.push(box(W - 0.06, 1.5, 5.4, CR, 0, 2.1, 0));
  P.push(box(W + 0.04, 0.06, 5.44, 0x4a1210, 0, 1.38, 0)); // waist moulding
  // windows (proud of the walls) and pillars
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) P.push(box(0.03, 0.72, 0.78, GLASS, sx * 1.075, 2.15, -2.0 + i * 1.0));
    for (let i = 0; i < 6; i++) P.push(box(0.04, 0.9, 0.08, 0x8f8565, sx * 1.075, 2.15, -2.5 + i * 1.0));
  }
  for (const sz of [-1, 1]) P.push(box(0.9, 0.9, 0.03, GLASS, 0, 2.1, sz * 2.71), box(0.05, 1.3, 0.04, 0x8f8565, 0, 2.05, sz * 2.72));
  // platforms (open, with railings, dash panel, lamp)
  for (const sz of [-1, 1]) {
    P.push(box(W - 0.1, 0.07, 1.75, WOODC, 0, 0.62, sz * 3.55));
    P.push(box(W - 0.1, 0.9, 0.07, DARKRED, 0, 1.1, sz * 4.38));          // dash
    P.push(box(W - 0.1, 0.06, 0.09, 0x4a1210, 0, 1.58, sz * 4.38));
    P.push(box(0.34, 0.26, 0.05, 0xe9d9a0, 0, 1.3, sz * 4.43));            // lamp
    P.push(box(0.4, 0.06, 0.06, BRASS, 0, 1.15, sz * 4.43));
    P.push(box(0.5, 0.3, 0.05, 0xdcd6c2, 0, 3.0, sz * 4.2));               // destination board
    P.push(box(0.4, 0.06, 0.06, 0x1d1d1d, 0, 3.0, sz * 4.24));
    for (const sx of [-1, 1]) {
      P.push(box(0.06, 1.5, 0.06, CR, sx * 1.04, 2.1, sz * 4.36));          // end posts
      P.push(box(0.05, 0.05, 1.7, IRON, sx * 1.05, 1.3, sz * 3.55));        // side rails
      P.push(box(0.05, 0.05, 1.7, IRON, sx * 1.05, 1.75, sz * 3.55));
      P.push(box(0.05, 0.5, 0.05, BRASS, sx * 0.55, 1.65, sz * 2.8));       // entrance grab pole
    }
    P.push(box(1.7, 0.28, 0.12, 0x2d2d2d, 0, 0.3, sz * 4.55));              // life guard
    for (let i = -3; i <= 3; i++) P.push(box(0.04, 0.3, 0.05, 0x55534e, i * 0.22, 0.3, sz * 4.62));
  }
  // roof: flat deck + clerestory arch
  P.push(box(W + 0.1, 0.08, 8.9, ROOF, 0, 2.92, 0));
  P.push(G(new THREE.CylinderGeometry(1.0, 1.0, 5.9, 12, 1, false, Math.PI / 2, Math.PI), 0x8f8c82, { rx: Math.PI / 2, sz: 0.2, sx: 0.98, y: 2.96 }));
  // trolley pole trailing to -Z, tip at wire height
  P.push(box(0.3, 0.1, 0.3, IRON, 0, 3.0, -1.0));
  P.push(link([0, 3.05, -1.0], [0, TRAM.wireY - 0.05, -3.7], 0.035, 0.022, 0x2a2a2a, 5));
  P.push(box(0.55, 0.05, 0.08, IRON, 0, TRAM.wireY, -3.7));
  P.push(bar([0.18, 3.05, -1.0], [0.18, 3.8, -1.6], 0.02, 0.02, 0x3a3a3a));
  return merge(P);
}

// ------------------------------------------------------------------------------------------------
// HORSE CART (origin at ground below the cart centre, horse in front at +Z)
// ------------------------------------------------------------------------------------------------
export const CART = { circles: [[-0.5, 0.95], [0.6, 0.95], [3.0, 0.62], [3.9, 0.62]] };
export function buildHorseCart(seed = 0) {
  const S = [], A = [];
  const wood = seed % 2 ? 0x6b4e2a : 0x7a5a30, paint = seed % 2 ? 0x3d5a3a : 0x6a3322, wheelC = seed % 2 ? 0xa08040 : 0x9c7a3a;
  const bay = seed % 2 ? 0x4e3020 : 0x6b3d22, dark = 0x1a1410;
  // cart bed
  S.push(box(1.5, 0.08, 2.5, wood, 0, 1.0, 0));
  for (const sx of [-1, 1]) S.push(box(0.05, 0.32, 2.5, paint, sx * 0.76, 1.2, 0));
  S.push(box(1.5, 0.32, 0.05, paint, 0, 1.2, -1.25), box(1.5, 0.32, 0.05, paint, 0, 1.2, 1.25));
  S.push(box(0.12, 0.12, 2.2, IRON, 0, 0.9, 0)); // chassis beam
  S.push(cylX(0.05, 0.05, 1.9, 6, IRON, 0, 0.55, -0.1)); // axle
  // load: two barrels + sacks
  for (const z of [-0.55, 0.15]) S.push(cylX(0.3, 0.3, 0.7, 10, 0x7a4b22, 0, 1.4, z), cylX(0.31, 0.31, 0.04, 10, IRON, 0, 1.4, z + 0.18), cylX(0.31, 0.31, 0.04, 10, IRON, 0, 1.4, z - 0.18));
  S.push(box(0.5, 0.28, 0.45, 0xb9a98a, 0.4, 1.18, -1.0), box(0.45, 0.25, 0.4, 0xa89878, -0.35, 1.17, -1.0));
  // driver on a plank seat at the front
  S.push(box(1.0, 0.06, 0.32, wood, 0, 1.55, 0.88), box(0.06, 0.5, 0.06, wood, -0.4, 1.28, 0.88), box(0.06, 0.5, 0.06, wood, 0.4, 1.28, 0.88));
  S.push(box(0.42, 0.55, 0.26, 0x5a4a3a, 0.15, 1.85, 0.8));
  S.push(sph(0.11, 7, 5, 0xc9a283, 0.15, 2.27, 0.82), cyl(0.125, 0.125, 0.05, 8, 0x2a2724, 0.15, 2.36, 0.82), box(0.12, 0.02, 0.1, 0x2a2724, 0.15, 2.34, 0.93));
  S.push(box(0.14, 0.14, 0.5, 0x3a3128, 0.07, 1.65, 1.1), box(0.14, 0.14, 0.5, 0x3a3128, 0.24, 1.65, 1.1));
  S.push(box(0.12, 0.5, 0.12, 0x2a2118, 0.07, 1.4, 1.34), box(0.12, 0.5, 0.12, 0x2a2118, 0.24, 1.4, 1.34));
  S.push(link([0.0, 2.05, 0.8], [-0.06, 1.75, 1.35], 0.05, 0.04, 0x5a4a3a), link([0.3, 2.05, 0.8], [0.26, 1.75, 1.35], 0.05, 0.04, 0x5a4a3a));
  // shafts + harness
  for (const sx of [-1, 1]) S.push(link([sx * 0.6, 1.05, 1.1], [sx * 0.42, 1.55, 3.4], 0.04, 0.035, wood));
  // horse body
  S.push(sph(1, 9, 7, bay, 0, 1.5, 3.3, { sx: 0.38, sy: 0.45, sz: 0.95 }));
  S.push(sph(1, 7, 6, bay, 0, 1.55, 3.8, { sx: 0.36, sy: 0.44, sz: 0.42 })); // chest
  S.push(sph(1, 7, 6, bay, 0, 1.55, 2.75, { sx: 0.37, sy: 0.44, sz: 0.42 })); // haunch
  S.push(torusCollar());
  S.push(link([0, 1.35, 2.55], [0, 0.95, 2.45], 0.05, 0.03, dark, 5), link([0, 1.35, 2.55], [0, 1.05, 2.3], 0.07, 0.04, dark, 5)); // tail
  S.push(box(0.04, 0.3, 0.5, dark, 0, 2.02, 4.28, { rx: 0.5 })); // mane
  S.push(box(0.1, 0.12, 0.5, 0x7a5a30, 0, 1.78, 3.4)); // saddle pad / harness
  const head = [];
  head.push(link([0, 1.7, 3.95], [0, 2.3, 4.4], 0.17, 0.12, bay, 7));
  head.push(link([0, 2.3, 4.4], [0, 1.95, 4.88], 0.1, 0.065, bay, 6));
  head.push(box(0.04, 0.12, 0.05, bay, 0.07, 2.45, 4.35), box(0.04, 0.12, 0.05, bay, -0.07, 2.45, 4.35));
  head.push(box(0.14, 0.14, 0.06, dark, 0, 1.92, 4.9));
  A.push({ geo: merge(head), kind: 'rot', cy: 1.7, cz: 3.95 }); // 0 head
  // legs (hip pivots) -- 1 FL, 2 FR, 3 RL, 4 RR
  const leg = (x, zh) => {
    const p = [];
    p.push(link([x, 1.3, zh], [x, 0.55, zh + 0.02], 0.12, 0.075, bay, 6));
    p.push(link([x, 0.55, zh + 0.02], [x, 0.1, zh], 0.06, 0.055, 0x3a2416, 6));
    p.push(box(0.12, 0.1, 0.14, dark, x, 0.05, zh + 0.02));
    return merge(p);
  };
  A.push({ geo: leg(0.2, 3.85), kind: 'rot', cy: 1.3, cz: 3.85 });
  A.push({ geo: leg(-0.2, 3.85), kind: 'rot', cy: 1.3, cz: 3.85 });
  A.push({ geo: leg(0.2, 2.75), kind: 'rot', cy: 1.3, cz: 2.75 });
  A.push({ geo: leg(-0.2, 2.75), kind: 'rot', cy: 1.3, cz: 2.75 });
  // wheels (both sides in one item, pivot = axle)
  const wp = [];
  for (const sx of [-1, 1]) for (const g of wheelParts(0.55, { spokes: 10, tyreW: 0.07, wood: wheelC, felloe: 0x7a5a30, tyre: 0x303030, seg: 16, hubCap: false })) wp.push(shiftGeo(g, sx * 0.88, 0.55, -0.1));
  A.push({ geo: merge(wp), kind: 'rot', cy: 0.55, cz: -0.1 }); // 5 wheels
  return buildAnimated(S, A);
}
function torusCollar() {
  return G(new THREE.TorusGeometry(0.2, 0.05, 5, 10), 0x2a1c12, { y: 1.55, z: 3.95 });
}
function shiftGeo(g, x, y, z) { // translate an already coloured geometry
  const c = g.clone(); c.translate(x, y, z); return c;
}

// ------------------------------------------------------------------------------------------------
// PEDESTRIANS (1920s clothes). Origin at feet, facing +Z, ~1.75 m. 5 variants.
// ------------------------------------------------------------------------------------------------
export const PED_VARIANTS = 5;
export function buildPedGeometry(kind) {
  const P = [];
  const skin = 0xc9a283, skin2 = 0xb98e6c;
  const arms = (col, y0 = 1.45, y1 = 0.98, sp = 0.22) => {
    for (const sx of [-1, 1]) { P.push(link([sx * sp, y0, 0], [sx * (sp + 0.02), y1, 0.04], 0.052, 0.045, col, 5)); P.push(sph(0.042, 5, 4, skin, sx * (sp + 0.02), y1 - 0.04, 0.04)); }
  };
  const legs = (col, h = 0.5, boot = 0x1a1a1a) => { for (const sx of [-1, 1]) { P.push(box(0.1, h, 0.12, col, sx * 0.07, h / 2, 0)); P.push(box(0.1, 0.07, 0.19, boot, sx * 0.07, 0.035, 0.03)); } };
  switch (kind) {
    case 0: { // gentleman: long dark overcoat, bowler hat
      legs(0x2a2a2e, 0.55);
      P.push(cyl(0.21, 0.28, 0.65, 8, 0x2b2b30, 0, 0.78, 0), cyl(0.2, 0.21, 0.46, 8, 0x2b2b30, 0, 1.28, 0));
      P.push(box(0.1, 0.12, 0.06, 0xe8e2d0, 0, 1.45, 0.17)); // collar / shirt
      arms(0x2b2b30);
      P.push(sph(0.11, 7, 5, skin, 0, 1.62, 0), sph(0.125, 7, 5, 0x1c1c1c, 0, 1.69, 0, { sy: 0.75 }), cyl(0.18, 0.18, 0.014, 10, 0x1c1c1c, 0, 1.67, 0));
      break;
    }
    case 1: { // workman: grey-brown jacket, trousers, flat cap
      legs(0x3d3a33, 0.82);
      P.push(cyl(0.2, 0.22, 0.62, 8, 0x6a6154, 0, 1.12, 0), box(0.4, 0.1, 0.24, 0x6a6154, 0, 1.45, 0));
      arms(0x6a6154, 1.45, 0.95, 0.23);
      P.push(sph(0.11, 7, 5, skin2, 0, 1.6, 0), cyl(0.125, 0.13, 0.05, 8, 0x3a362e, 0, 1.7, 0), box(0.14, 0.015, 0.09, 0x3a362e, 0, 1.68, 0.12));
      break;
    }
    case 2: { // woman: long dress, blouse, wide hat
      P.push(cyl(0.12, 0.31, 1.0, 9, 0x6b4a5a, 0, 0.62, 0), cyl(0.14, 0.13, 0.36, 8, 0xe6dccb, 0, 1.3, 0));
      P.push(box(0.2, 0.05, 0.12, 0x3a2a30, 0, 1.12, 0));
      arms(0xe6dccb, 1.42, 1.0, 0.18);
      P.push(sph(0.1, 7, 5, skin, 0, 1.54, 0), sph(0.06, 5, 4, 0x3a2418, 0, 1.55, -0.08), cyl(0.23, 0.23, 0.014, 10, 0x4a3a52, 0, 1.62, 0), cyl(0.1, 0.12, 0.1, 8, 0x4a3a52, 0, 1.68, 0));
      break;
    }
    case 3: { // woman: long grey coat, headscarf, basket
      P.push(cyl(0.14, 0.3, 1.1, 9, 0x4d5560, 0, 0.7, 0), cyl(0.15, 0.14, 0.3, 8, 0x4d5560, 0, 1.3, 0));
      arms(0x4d5560, 1.42, 1.0, 0.19);
      P.push(sph(0.1, 7, 5, skin, 0, 1.54, 0), sph(0.115, 7, 5, 0x8a3b30, 0, 1.57, -0.015, { sy: 0.9 }));
      P.push(box(0.26, 0.16, 0.2, 0x7a5a30, 0.3, 0.9, 0.06), link([0.2, 1.0, 0.06], [0.4, 1.0, 0.06], 0.012, 0.012, 0x5a4020, 4));
      break;
    }
    default: { // man in light summer jacket, boater
      legs(0x4a4a4e, 0.85);
      P.push(cyl(0.2, 0.22, 0.58, 8, 0xb8ad94, 0, 1.12, 0), box(0.4, 0.1, 0.24, 0xb8ad94, 0, 1.43, 0));
      arms(0xb8ad94, 1.43, 0.95, 0.23);
      P.push(sph(0.11, 7, 5, skin, 0, 1.6, 0), cyl(0.11, 0.11, 0.07, 9, 0xd9c98a, 0, 1.72, 0), cyl(0.18, 0.18, 0.014, 10, 0xd9c98a, 0, 1.685, 0), cyl(0.112, 0.112, 0.02, 9, 0x2a2a30, 0, 1.70, 0));
    }
  }
  return merge(P);
}

// ------------------------------------------------------------------------------------------------
// STEAM SHUNTING TRAIN: loco + 3 covered brewery wagons. Origin at the front buffer beam on the rail, faces +Z.
// ------------------------------------------------------------------------------------------------
export const TRAIN = { wagons: 3, wagonLen: 7.2, wagonPitch: 8.2, locoLen: 6.45, wheelR: 0.55, crank: 0.2, axles: [-1.7, -3.0, -4.3], chimney: [0, 3.2, -0.65] };
TRAIN.length = 7.3 + 2 * TRAIN.wagonPitch + TRAIN.wagonLen; // ~30.9
export function buildTrainGeometry() {
  const S = [], A = [];
  const GREEN = 0x1f3a2c, BLACK = 0x161616, WR = TRAIN.wheelR;
  // frame, buffer beams, buffers
  S.push(box(2.3, 0.25, 6.4, IRON, 0, 0.8, -3.2));
  for (const z of [0, -6.44]) {
    S.push(box(2.6, 0.34, 0.14, 0x7a1f1c, 0, 0.8, z));
    for (const sx of [-1, 1]) S.push(cylZ(0.1, 0.1, 0.3, 8, 0x55534e, sx * 0.85, 0.8, z + (z === 0 ? 0.2 : -0.2)), cylZ(0.16, 0.16, 0.04, 8, IRON, sx * 0.85, 0.8, z + (z === 0 ? 0.36 : -0.36)));
  }
  // boiler, smokebox, chimney, dome
  S.push(cylZ(0.62, 0.62, 3.5, 12, GREEN, 0, 1.65, -2.05));
  S.push(cylZ(0.66, 0.66, 0.55, 12, BLACK, 0, 1.65, -0.58));
  S.push(cylZ(0.58, 0.58, 0.03, 12, 0x2a2a2a, 0, 1.65, -0.29), sph(0.07, 6, 5, BRASS, 0, 1.65, -0.25));
  S.push(cyl(0.12, 0.14, 0.8, 8, BLACK, 0, 2.62, -0.65), cyl(0.21, 0.13, 0.2, 8, BLACK, 0, 3.12, -0.65));
  S.push(sph(1, 8, 6, GREEN, 0, 2.3, -2.3, { sx: 0.3, sy: 0.36, sz: 0.3 }), cyl(0.07, 0.09, 0.2, 6, BRASS, 0, 2.7, -2.3));
  S.push(cyl(0.05, 0.06, 0.28, 6, BRASS, 0, 2.4, -3.3), cyl(0.2, 0.2, 0.05, 8, BRASS, 0, 2.28, -2.3));
  for (const z of [-1.1, -1.9, -2.7, -3.5]) S.push(cylZ(0.645, 0.645, 0.05, 12, 0x2b2b2b, 0, 1.65, z)); // boiler bands
  S.push(box(0.22, 0.26, 0.22, BLACK, 0, 2.45, -0.15), box(0.14, 0.14, 0.04, 0xe9d9a0, 0, 2.45, -0.04)); // headlamp
  // side tanks
  for (const sx of [-1, 1]) {
    S.push(box(0.56, 0.9, 3.2, GREEN, sx * 0.92, 1.62, -2.15), box(0.6, 0.06, 3.24, 0x2c2c2c, sx * 0.92, 2.1, -2.15));
    S.push(box(0.05, 0.5, 2.9, 0x2a4a38, sx * 1.21, 1.62, -2.15));
  }
  // cab
  S.push(box(2.5, 0.1, 2.7, IRON, 0, 1.08, -5.15));
  S.push(box(2.4, 2.0, 0.08, GREEN, 0, 2.1, -3.85));
  for (const sx of [-1, 1]) {
    S.push(box(0.06, 0.8, 2.6, GREEN, sx * 1.22, 1.5, -5.15));
    S.push(box(0.06, 2.0, 0.06, GREEN, sx * 1.22, 2.1, -3.9), box(0.06, 2.0, 0.06, GREEN, sx * 1.22, 2.1, -6.4));
    S.push(box(0.04, 0.55, 0.7, 0x111111, sx * 1.22, 2.4, -5.15));
  }
  S.push(box(2.6, 0.08, 3.0, 0x2c2c2c, 0, 3.15, -5.1), box(2.45, 0.05, 3.1, 0x3a3a38, 0, 3.2, -5.1, { rz: 0 }));
  S.push(box(2.4, 1.5, 0.6, GREEN, 0, 1.85, -6.15), box(2.0, 0.3, 0.45, BLACK, 0, 2.7, -6.15)); // bunker + coal
  // wheels: 3 axles, both sides; coupling rods
  for (let i = 0; i < 3; i++) {
    const az = TRAIN.axles[i];
    const w = [];
    for (const sx of [-1, 1]) {
      const x = sx * 0.86;
      w.push(cylX(WR, WR, 0.1, 16, 0x1c1c1c, x, WR, az));
      w.push(cylX(WR - 0.07, WR - 0.07, 0.13, 16, 0x2e2e30, x, WR, az));
      for (let k = 0; k < 8; k++) w.push(G(new THREE.BoxGeometry(0.14, WR - 0.12, 0.06).translate(0, 0.12 + (WR - 0.12) / 2 - 0.0, 0), 0x6a6a66, { rx: (k / 8) * Math.PI * 2, x, y: WR, z: az }));
      w.push(cylX(0.11, 0.11, 0.16, 8, 0x55534e, x, WR, az));
      w.push(cylX(0.06, 0.06, 0.24, 6, BRASS, x + sx * 0.02, WR + TRAIN.crank, az));
      w.push(box(0.12, 0.2, 0.2, 0x3a3a38, x + sx * 0.03, WR + 0.34, az)); // counterweight at crank side (rotates)
    }
    A.push({ geo: merge(w), kind: 'rot', cy: WR, cz: az });
  }
  const rods = [];
  for (const sx of [-1, 1]) rods.push(box(0.05, 0.08, TRAIN.axles[0] - TRAIN.axles[2] > 0 ? 2.6 : 2.6, 0x8c8a84, sx * 0.99, WR + TRAIN.crank, (TRAIN.axles[0] + TRAIN.axles[2]) / 2));
  A.push({ geo: merge(rods), kind: 'orbit', r: TRAIN.crank });
  // wagons
  for (let i = 0; i < TRAIN.wagons; i++) {
    const zf = -7.3 - i * TRAIN.wagonPitch, zc = zf - TRAIN.wagonLen / 2;
    S.push(box(2.1, 0.25, 7.2, IRON, 0, 0.62, zc));
    S.push(box(2.7, 2.3, 7.0, 0x2a2220, 0, 1.9, zc));
    S.push(G(new THREE.CylinderGeometry(1.0, 1.0, 7.1, 12, 1, false, Math.PI / 2, Math.PI), 0x3b3532, { rx: Math.PI / 2, sz: 0.22, sx: 1.38, y: 3.05, z: zc }));
    for (const sx of [-1, 1]) {
      S.push(box(0.06, 1.15, 2.1, 0x40332a, sx * 1.37, 1.45, zc));           // sliding door
      S.push(box(0.08, 0.06, 3.2, IRON, sx * 1.38, 2.1, zc));                  // door rail
      for (const dz of [-3.3, -1.2, 1.2, 3.3]) S.push(box(0.05, 2.3, 0.1, 0x3a3a3c, sx * 1.36, 1.9, zc + dz));
    }
    for (const dz of [-3.6, 3.6]) {
      const bz = zc + dz;
      S.push(box(2.6, 0.3, 0.12, 0x2b2b2b, 0, 0.8, bz));
      for (const sx of [-1, 1]) S.push(cylZ(0.09, 0.09, 0.28, 8, 0x55534e, sx * 0.85, 0.8, bz + Math.sign(dz) * 0.2));
    }
    for (const dz of [-2.4, 2.4]) for (const sx of [-1, 1]) {
      S.push(cylX(0.45, 0.45, 0.09, 14, 0x1c1c1c, sx * 0.88, 0.45, zc + dz), cylX(0.08, 0.08, 0.14, 8, 0x55534e, sx * 0.88, 0.45, zc + dz));
    }
    S.push(box(2.0, 0.08, 0.08, IRON, 0, 0.45, zc - 2.4), box(2.0, 0.08, 0.08, IRON, 0, 0.45, zc + 2.4));
    // couplings
    S.push(box(0.12, 0.12, 1.2, IRON, 0, 0.8, zf + 0.5));
  }
  return buildAnimated(S, A);
}
/** Planes with brewery lettering on both sides of every wagon (UV into a transparent canvas). */
export function buildTrainSigns() {
  const parts = [];
  const w = 5.0, h = 0.9;
  for (let i = 0; i < TRAIN.wagons; i++) {
    const zc = -7.3 - i * TRAIN.wagonPitch - TRAIN.wagonLen / 2;
    for (const sx of [-1, 1]) {
      const pg = new THREE.PlaneGeometry(w, h);
      pg.rotateY(sx * Math.PI / 2);
      pg.translate(sx * 1.405, 2.5, zc);
      parts.push(pg);
    }
  }
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}
export function makeTrainSignTexture() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 184;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  drawBrandLine(c, 0, 0, 1024, 184, { ink: '#efe9d8', bg: '#2a2220', capH: 0.62 });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true;
  return t;
}

// ------------------------------------------------------------------------------------------------
// LEVEL CROSSING: static posts / crossbucks and booms
// ------------------------------------------------------------------------------------------------
/** Boom arm: hinge at origin, extends along +X for `len`; striped red/white; counterweight stub on -X. */
export function buildBoomGeometry(len) {
  const P = [];
  const n = Math.max(4, Math.round(len / 1.1));
  const seg = len / n;
  for (let i = 0; i < n; i++) P.push(box(seg, 0.13, 0.08, i % 2 ? 0xe9e5da : 0xb3241d, seg * (i + 0.5), 0, 0));
  P.push(box(0.9, 0.2, 0.14, 0x1d1d1d, -0.45, 0, 0), box(0.28, 0.28, 0.2, 0x3a3a3a, -0.75, -0.05, 0));
  P.push(box(0.16, 0.16, 0.12, 0xd02b20, len * 0.55, 0.14, 0));
  return merge(P);
}
export function buildCrossingPosts(posts) {
  // posts: [{x,z,yaw}] world placement of St Andrew's crosses; returns geometry in world coordinates
  const P = [];
  for (const p of posts) {
    const parts = [];
    parts.push(box(0.14, 3.0, 0.14, 0xe9e5da, 0, 1.5, 0), box(0.15, 0.5, 0.15, 0xb3241d, 0, 0.9, 0), box(0.15, 0.5, 0.15, 0xb3241d, 0, 2.0, 0));
    for (const s of [-1, 1]) parts.push(box(1.5, 0.2, 0.05, s > 0 ? 0xe9e5da : 0xe9e5da, 0, 3.1, 0.09, { rz: s * 0.62 }), box(1.38, 0.08, 0.06, 0xb3241d, 0, 3.1, 0.09, { rz: s * 0.62 }));
    const g = mergeGeometries(parts, false);
    g.rotateY(p.yaw); g.translate(p.x, 0, p.z);
    P.push(g);
  }
  return mergeGeometries(P, false);
}
export { IRON, BRASS, WOODC, WOOD_DARK, CREAM, GLASS, RED };
