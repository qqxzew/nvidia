// Level 2 cellar — visual volume model + light baking (owner: world).
//
// The cellar is described as a 0.5 m grid of "air" cells (rooms + the cask strips beside each bay aisle
// + the dock + the lift shaft). Every air cell belongs to a region with its own vault function
// (barrel vaults = cylinder segments; where two vaults meet, the higher one wins, which yields proper
// lunettes). Floors, vaults and walls are generated from that grid so they are watertight, and the
// same model answers "is this point inside air?" for baking bulb visibility and ambient occlusion.
import * as THREE from 'three';
import { ROOMS, BLOCKS, DOCK, LIFT, BULBS } from './layout.js';

// ------------------------------------------------------------------ dimensions
export const BAND = 2.5;            // depth of the cask strip on each side of a bay aisle (outer bay walls)
export const WALL_T = 0.5;          // gallery wall thickness beside the cask strips
export const BAY_SPRING = 2.4;      // bays: vault springs from the outer walls above the casks
export const SHAFT_DEPTH = 2;       // lift shaft behind the north wall
export const SHAFT_TOP = 7.5;
export const CASK = { L: 2.1, rMid: 0.95, rHead: 0.84, cy: 1.22, pitch: 2.0, beamH: 0.3 };

function arc(c, w, s, k) { const rise = k - s; const R = (w * w + rise * rise) / (2 * rise); return { c, w, s, k, R, y0: k - R }; }
export function arcH(a, u) { const d = u - a.c; const q = a.R * a.R - d * d; return a.y0 + Math.sqrt(q > 0 ? q : 0); }

const HALLR = ROOMS.find((r) => r.id === 'hall');
const GALR = ROOMS.find((r) => r.id === 'gallery');
export const HALL = { x0: HALLR.x0, x1: HALLR.x1, z0: DOCK.z0, z1: HALLR.z1 };
const pil = BLOCKS.filter((b) => b.kind === 'pillar');
export const PZ = pil.length ? (pil[0].z0 + pil[0].z1) / 2 : (HALL.z0 + HALL.z1) / 2;   // arcade line in the hall
export const GAL = { x0: GALR.x0, x1: GALR.x1, z0: GALR.z0, z1: GALR.z1 };
export const SHAFT = { x0: LIFT.x - LIFT.width / 2, x1: LIFT.x + LIFT.width / 2, z0: LIFT.z - SHAFT_DEPTH, z1: LIFT.z };

export const ARCS = {
  hs: arc((PZ + HALL.z1) / 2, (HALL.z1 - PZ) / 2, HALLR.spring, HALLR.ceil),
  hn: arc((HALL.z0 + PZ) / 2, (PZ - HALL.z0) / 2, HALLR.spring, HALLR.ceil),
  g: arc((GAL.x0 + GAL.x1) / 2, (GAL.x1 - GAL.x0) / 2, GALR.spring, GALR.ceil),
  lift: arc(LIFT.x, LIFT.width / 2, HALLR.spring, Math.max(LIFT.height, HALLR.spring + 0.1)),
};
export const BAYS = ROOMS.filter((r) => r.kind === 'bay').map((r, k) => ({
  ...r, k, c: (r.z0 + r.z1) / 2, n0: r.z0 - BAND, n1: r.z1 + BAND,
  bx0: r.side > 0 ? r.x0 + WALL_T : r.x0, bx1: r.side > 0 ? r.x1 : r.x1 - WALL_T,
  arc: arc((r.z0 + r.z1) / 2, (r.z1 - r.z0) / 2 + BAND, BAY_SPRING, r.ceil),
}));
/** x centres of the casks in a strip (4 per strip with the default sizes) */
export function caskXs(b) {
  const xs = [], w = b.bx1 - b.bx0, n = Math.floor((w - 0.1) / CASK.pitch);
  const start = b.side > 0 ? b.bx0 + 0.05 + CASK.rMid : b.bx1 - 0.05 - CASK.rMid;
  for (let i = 0; i < n; i++) xs.push(start + b.side * i * CASK.pitch);
  return xs;
}

// ------------------------------------------------------------------ region grid
export const ID = { HALL: 1, LIFT: 2, GAL: 3, BAY0: 4 };
export const VG = { c: 0.5, x0: -12, z0: -12, nx: 48, nz: 94 };
export const REG = new Uint8Array(VG.nx * VG.nz);
export const FLO = new Float32Array(VG.nx * VG.nz);
const inR = (x, z, x0, x1, z0, z1) => x >= x0 && x < x1 && z >= z0 && z < z1;
for (let j = 0; j < VG.nz; j++) {
  for (let i = 0; i < VG.nx; i++) {
    const x = VG.x0 + (i + 0.5) * VG.c, z = VG.z0 + (j + 0.5) * VG.c;
    let id = 0, f = 0;
    if (inR(x, z, HALL.x0, HALL.x1, HALL.z0, HALL.z1)) { id = ID.HALL; if (z < DOCK.z1 && x >= DOCK.x0 && x < DOCK.x1) f = DOCK.height; }
    if (inR(x, z, SHAFT.x0, SHAFT.x1, SHAFT.z0, SHAFT.z1)) { id = ID.LIFT; f = DOCK.height; }
    if (inR(x, z, GAL.x0, GAL.x1, GAL.z0, GAL.z1)) id = ID.GAL;
    for (const b of BAYS) {
      if (inR(x, z, b.x0, b.x1, b.z0, b.z1) || (inR(x, z, b.bx0, b.bx1, b.n0, b.n1))) { id = ID.BAY0 + b.k; f = 0; }
    }
    for (const p of pil) if (inR(x, z, p.x0, p.x1, p.z0, p.z1)) id = 0;
    REG[j * VG.nx + i] = id; FLO[j * VG.nx + i] = f;
  }
}
export function cellIndex(x, z) {
  const i = Math.floor((x - VG.x0) / VG.c), j = Math.floor((z - VG.z0) / VG.c);
  return i < 0 || j < 0 || i >= VG.nx || j >= VG.nz ? -1 : j * VG.nx + i;
}
export function regionAt(x, z) { const k = cellIndex(x, z); return k < 0 ? 0 : REG[k]; }

// gutter along the gallery axis (visual only): shallow V channel, 0.5 m wide
export const GUTTER = { x: (GAL.x0 + GAL.x1) / 2, half: 0.25, depth: 0.05, z0: GAL.z0 + 0.6, z1: GAL.z1 - 0.9 };
export function gutterDepth(x, z) {
  const d = Math.abs(x - GUTTER.x);
  if (d >= GUTTER.half || z < GUTTER.z0 - 0.5 || z > GUTTER.z1 + 0.5) return 0;
  const along = Math.min(1, (z - GUTTER.z0 + 0.5) / 0.5, (GUTTER.z1 + 0.5 - z) / 0.5);
  return GUTTER.depth * (1 - d / GUTTER.half) * Math.max(0, along);
}

/** vault height above (x, z) for region id (no allocation, used in hot loops) */
export function ceilH(id, x, z) {
  if (id === ID.HALL) {
    let h = z >= PZ ? arcH(ARCS.hs, z) : arcH(ARCS.hn, z);
    if (x > GAL.x0 && x < GAL.x1 && z > PZ) { const g = arcH(ARCS.g, x); if (g > h) h = g; }
    if (x > SHAFT.x0 && x < SHAFT.x1 && z < HALL.z0 + 2.5) { const l = arcH(ARCS.lift, x); if (l > h) h = l; }
    return h;
  }
  if (id === ID.LIFT) return SHAFT_TOP;
  if (id === ID.GAL) {
    let h = arcH(ARCS.g, x);
    for (let k = 0; k < BAYS.length; k++) {
      const b = BAYS[k];
      if (b.side * x > 0 && z > b.n0 && z < b.n1) { const v = arcH(b.arc, z); if (v > h) h = v; }
    }
    return h;
  }
  if (id >= ID.BAY0) return arcH(BAYS[id - ID.BAY0].arc, z);
  return 0;
}
/** which vault cylinder defines the ceiling at (x, z): { a, ax: 'x'|'z' } (axis of the vault) or null = flat */
export function ceilCyl(id, x, z) {
  if (id === ID.HALL) {
    let a = z >= PZ ? ARCS.hs : ARCS.hn, h = arcH(a, z), ax = 'x';
    if (x > GAL.x0 && x < GAL.x1 && z > PZ) { const g = arcH(ARCS.g, x); if (g > h) { h = g; a = ARCS.g; ax = 'z'; } }
    if (x > SHAFT.x0 && x < SHAFT.x1 && z < HALL.z0 + 2.5) { const l = arcH(ARCS.lift, x); if (l > h) { h = l; a = ARCS.lift; ax = 'z'; } }
    return { a, ax };
  }
  if (id === ID.LIFT) return null;
  if (id === ID.GAL) {
    let a = ARCS.g, h = arcH(a, x), ax = 'z';
    for (const b of BAYS) if (b.side * x > 0 && z > b.n0 && z < b.n1) { const v = arcH(b.arc, z); if (v > h) { h = v; a = b.arc; ax = 'x'; } }
    return { a, ax };
  }
  return { a: BAYS[id - ID.BAY0].arc, ax: 'x' };
}

// ------------------------------------------------------------------ solid props for occlusion
const PROP_H = { crates: 1.45, kegs: 1.05, cart: 0.85, rubble: 0.9 };
const PROPS = BLOCKS.filter((b) => PROP_H[b.kind]).map((b) => ({ ...b, h: PROP_H[b.kind] }));
const R2 = CASK.rMid * CASK.rMid, CTOP = CASK.cy + CASK.rMid;

/** true if the point is inside the cellar's air (not inside walls, vaults, floor, casks, pillars, props) */
export function air(x, y, z) {
  const k = cellIndex(x, z);
  if (k < 0) return false;
  const id = REG[k];
  if (id === 0) return false;
  if (y <= FLO[k]) return false;
  if (y >= ceilH(id, x, z)) return false;
  if (id >= ID.BAY0 && y < CTOP) {
    const b = BAYS[id - ID.BAY0];
    if (z < b.z0 || z > b.z1) {
      const ax = Math.abs(x);
      const lo = Math.min(Math.abs(b.bx0), Math.abs(b.bx1)) + 0.05;
      const idx = Math.max(0, Math.min(3, Math.floor((ax - lo) / CASK.pitch)));
      const dx = ax - (lo + CASK.rMid + idx * CASK.pitch), dy = y - CASK.cy;
      if (dx * dx + dy * dy < R2) return false;
      if (y < CASK.beamH) return false;
    }
  }
  for (let i = 0; i < PROPS.length; i++) {
    const p = PROPS[i];
    if (y < p.h && x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return false;
  }
  return true;
}

/** 0..1 line of sight from p (already offset off its surface) to the light at b */
export function visible(px, py, pz, bx, by, bz) {
  const dx = bx - px, dy = by - py, dz = bz - pz;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const end = d - 0.12;
  if (end <= 0) return 1;
  const ix = dx / d, iy = dy / d, iz = dz / d;
  for (let t = 0.04; t < end; t += 0.22) {
    if (!air(px + ix * t, py + iy * t, pz + iz * t)) return 0;
  }
  return 1;
}

const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _n = new THREE.Vector3();
const AO_DIRS = [];
for (let k = 0; k < 6; k++) {
  if (k === 0) AO_DIRS.push([0, 0, 1]);
  else { const a = (k - 1) / 5 * Math.PI * 2 + 0.3, s = Math.sin(1.0), c = Math.cos(1.0); AO_DIRS.push([Math.cos(a) * s, Math.sin(a) * s, c]); }
}
const AO_STEPS = [0.12, 0.3, 0.55, 0.85, 1.2];
/** cheap ray-marched ambient occlusion, 1 = open */
export function ambientOcclusion(px, py, pz, nx, ny, nz) {
  _n.set(nx, ny, nz);
  if (Math.abs(ny) < 0.9) _t1.set(0, 1, 0); else _t1.set(1, 0, 0);
  _t1.cross(_n).normalize(); _t2.copy(_n).cross(_t1);
  let occ = 0;
  for (const [a, b, c] of AO_DIRS) {
    const dx = _t1.x * a + _t2.x * b + nx * c, dy = _t1.y * a + _t2.y * b + ny * c, dz = _t1.z * a + _t2.z * b + nz * c;
    for (const t of AO_STEPS) {
      if (!air(px + dx * t, py + dy * t, pz + dz * t)) { occ += 1 - t / 1.4; break; }
    }
  }
  return 1 - 0.9 * occ / AO_DIRS.length;
}

// ------------------------------------------------------------------ bulbs & baking
export const BULB_K = 34;           // candela per unit of BULBS[].power
export const BULB_RANGE = 18;       // PointLight.distance (and baked window)
export const BOUNCE = 0.22;         // fake one-bounce fill near each bulb
export const bulbI = (b) => b.power * BULB_K;
/** flickering bulbs get their own baked channel (max 5), the rest is summed into the static channel */
export const FLICK_SLOT = (() => { let n = 0; return BULBS.map((b) => (b.flicker > 0.02 && n < 5 ? n++ : -1)); })();

function lightAt(px, py, pz, nx, ny, nz, ao, out) {
  // out: [amb, static, f0, f1, f2, f3, f4]
  out[0] = ao; out[1] = 0; out[2] = out[3] = out[4] = out[5] = out[6] = 0;
  const sx = px + nx * 0.06, sy = py + ny * 0.06, sz = pz + nz * 0.06;
  for (let i = 0; i < BULBS.length; i++) {
    const b = BULBS[i];
    const dx = b.x - px, dy = b.y - py, dz = b.z - pz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > BULB_RANGE * BULB_RANGE) continue;
    const d = Math.sqrt(d2);
    const nl = (nx * dx + ny * dy + nz * dz) / d;
    const q = d / BULB_RANGE, win = (1 - q * q * q * q) ** 2;
    const I = bulbI(b);
    const dMax = nl > 0 ? I * nl / (Math.PI * Math.max(d2, 0.36)) : 0;
    const bMax = I * BOUNCE / (Math.PI * (d2 + 2.5)) * (0.4 + 0.6 * ao);
    if ((dMax + bMax) * win < 0.004) continue;                     // negligible: skip the ray march
    // back faces only get the (soft) bounce term: no march needed
    const vis = nl > 0 ? visible(sx, sy, sz, b.x, b.y, b.z) : 0.35;
    const direct = dMax * vis;
    const bounce = bMax * (0.25 + 0.75 * vis);
    const v = (direct + bounce) * win;
    const s = FLICK_SLOT[i];
    out[s < 0 ? 1 : 2 + s] += v;
  }
  return out;
}

// ------------------------------------------------------------------ mesh builder
/** Accumulates non-indexed triangles: position, normal (for baking), uv, albedo colour (linear), w (whitewash / wetness), ao multiplier. */
export class MB {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.w = []; this.ao = []; }
  get count() { return this.p.length / 3; }
  v(x, y, z, nx, ny, nz, u, vv, col, w = 0, ao = 1) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, vv); this.c.push(col[0], col[1], col[2]); this.w.push(w); this.ao.push(ao);
  }
  /** triangle from vertex records {x,y,z,nx,ny,nz,u,v,c,w,ao}; flips winding so the face points along `fn` (if given) */
  tri(a, b, c, fn) {
    if (fn) {
      const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = c.x - a.x, wy = c.y - a.y, wz = c.z - a.z;
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      if (cx * fn[0] + cy * fn[1] + cz * fn[2] < 0) { const t = b; b = c; c = t; }
    }
    for (const q of [a, b, c]) this.v(q.x, q.y, q.z, q.nx, q.ny, q.nz, q.u, q.v, q.c, q.w ?? 0, q.ao ?? 1);
  }
  quad(a, b, c, d, fn) { this.tri(a, b, c, fn); this.tri(a, c, d, fn); }
  /**
   * Append a three.js geometry, transformed by `m` (Matrix4).
   * opts: color [r,g,b] | fn(x,y,z,nx,ny,nz)->[r,g,b]; uv: 'keep' | 'box' (local box projection, metres / tile); tile; uvRect [u0,v0,u1,v1]; w; ao
   */
  geo(geometry, m, opts = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const tile = opts.tile || 1, rect = opts.uvRect;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      let u = 0, vv = 0;
      if (opts.uv === 'box') {
        const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
        if (ax >= ay && ax >= az) { u = v.z; vv = v.y; } else if (ay >= az) { u = v.x; vv = v.z; } else { u = v.x; vv = v.y; }
        u /= tile; vv /= tile;
        if (opts.uvOff) { u += opts.uvOff[0]; vv += opts.uvOff[1]; }
      } else if (U) {
        u = U.getX(i); vv = U.getY(i);
        if (rect) { u = rect[0] + u * (rect[2] - rect[0]); vv = rect[1] + vv * (rect[3] - rect[1]); }
      }
      const lx = v.x, ly = v.y, lz = v.z;
      v.applyMatrix4(m); n.applyMatrix3(nm).normalize();
      const col = typeof opts.color === 'function' ? opts.color(v.x, v.y, v.z, n.x, n.y, n.z, lx, ly, lz) : (opts.color || [1, 1, 1]);
      const w = typeof opts.w === 'function' ? opts.w(v.x, v.y, v.z) : (opts.w ?? 0);
      this.v(v.x, v.y, v.z, n.x, n.y, n.z, u, vv, col, w, opts.ao ?? 1);
    }
    return this;
  }
  /**
   * Bake + build. Attributes: position, uv, color (albedo), aL (amb, static warm, flicker slot 4, w), aF (flicker slots 0..3).
   * opts.aoScale: how much the ray-marched AO darkens (0..1); opts.keepNormal
   */
  build(opts = {}) {
    const n = this.count;
    const aL = new Float32Array(n * 4), aF = new Float32Array(n * 4);
    const cache = new Map(), out = new Array(7);
    const aoScale = opts.aoScale ?? 1;
    for (let i = 0; i < n; i++) {
      const x = this.p[i * 3], y = this.p[i * 3 + 1], z = this.p[i * 3 + 2];
      const nx = this.n[i * 3], ny = this.n[i * 3 + 1], nz = this.n[i * 3 + 2];
      const key = (((Math.round(x * 200) + 3000) * 2400 + Math.round(y * 200) + 400) * 12000 + Math.round(z * 200) + 3000) * 9261
        + (Math.round(nx * 10) + 10) * 441 + (Math.round(ny * 10) + 10) * 21 + Math.round(nz * 10) + 10;
      let r = cache.get(key);
      if (!r) {
        const ox = x + nx * 0.03, oy = y + ny * 0.03, oz = z + nz * 0.03;
        const ao = 1 - aoScale * (1 - ambientOcclusion(ox, oy, oz, nx, ny, nz));
        r = lightAt(x, y, z, nx, ny, nz, ao, out).slice();
        cache.set(key, r);
      }
      const am = this.ao[i];
      aL[i * 4] = r[0] * am; aL[i * 4 + 1] = r[1] * (0.35 + 0.65 * am); aL[i * 4 + 2] = r[6] * (0.35 + 0.65 * am); aL[i * 4 + 3] = this.w[i];
      aF[i * 4] = r[2] * (0.35 + 0.65 * am); aF[i * 4 + 1] = r[3] * (0.35 + 0.65 * am); aF[i * 4 + 2] = r[4] * (0.35 + 0.65 * am); aF[i * 4 + 3] = r[5] * (0.35 + 0.65 * am);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    if (opts.keepNormal) g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aL', new THREE.BufferAttribute(aL, 4));
    g.setAttribute('aF', new THREE.BufferAttribute(aF, 4));
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ small noise helpers (for albedo variation)
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x, y, z) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(x0 + i, y0 + j, z0 + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy), l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy), sz);
}
export function fbm(x, y, z, oct = 3) { let a = 1, s = 0, t = 0; for (let i = 0; i < oct; i++) { s += noise3(x, y, z) * a; t += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s / t; }
const _c = new THREE.Color();
/** sRGB hex -> linear [r, g, b] */
export function lin(hex, k = 1) { _c.set(hex); return [_c.r * k, _c.g * k, _c.b * k]; }
export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
