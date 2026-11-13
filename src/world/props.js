import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Geometry helpers and small prop factories shared by city.js / environment.js (owner: city).

export function rngFactory(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _c = new THREE.Color();
/** hex / css / Color -> linear [r, g, b] (vertex colours are linear) */
export function lin(c) {
  if (Array.isArray(c)) return c;
  _c.set(c);
  return [_c.r, _c.g, _c.b];
}
export function mixCol(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function scaleCol(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }

/**
 * Non-indexed geometry builder with flat normals, UVs and vertex colours.
 * quad(a, b, c, d, uv, col, nHint, colTop): a = bottom-left, b = bottom-right, c = top-right, d = top-left (as seen from outside),
 * uv = [u0, v0, u1, v1] (v1 = top). Winding is flipped automatically to agree with the hint normal.
 */
export class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; }
  get triCount() { return this.pos.length / 9; }
  _push(p, n, uv, c) {
    this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]); this.uv.push(uv[0], uv[1]); this.col.push(c[0], c[1], c[2]);
  }
  tri(a, b, c, uva, uvb, uvc, col, hint, colB, colC) {
    let n = cross3(sub3(b, a), sub3(c, a));
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-9) return;
    n = [n[0] / l, n[1] / l, n[2] / l];
    if (hint && n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
      n = [-n[0], -n[1], -n[2]];
      const ca = col, cb = colB || col, cc = colC || col;
      this._push(a, n, uva, ca); this._push(c, n, uvc, cc); this._push(b, n, uvb, cb);
      return;
    }
    this._push(a, n, uva, col); this._push(b, n, uvb, colB || col); this._push(c, n, uvc, colC || col);
  }
  quad(a, b, c, d, uv, col, hint, colTop) {
    const col0 = lin(col), col1 = colTop ? lin(colTop) : col0;
    const [u0, v0, u1, v1] = uv;
    this.tri(a, b, c, [u0, v0], [u1, v0], [u1, v1], col0, hint, col0, col1);
    this.tri(a, c, d, [u0, v0], [u1, v1], [u0, v1], col0, hint, col1, col1);
  }
  /** quad subdivided nu x nv (bilinear), UV rect spread over the whole quad */
  gridQuad(a, b, c, d, nu, nv, uv, col, hint) {
    const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const t0 = i / nu, t1 = (i + 1) / nu, s0 = j / nv, s1 = (j + 1) / nv;
        const pa = lerp(lerp(a, b, t0), lerp(d, c, t0), s0), pb = lerp(lerp(a, b, t1), lerp(d, c, t1), s0);
        const pc = lerp(lerp(a, b, t1), lerp(d, c, t1), s1), pd = lerp(lerp(a, b, t0), lerp(d, c, t0), s1);
        this.quad(pa, pb, pc, pd, uv, col, hint);
      }
    }
  }
  /** axis-aligned-in-world box (optionally yawed) centred at (x, y0..y1, z) */
  box(cx, y0, cz, sx, sy, sz, yaw, col, uv = [0, 0, 1, 1], colTop) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (lx, ly, lz) => [cx + lx * cs + lz * sn, y0 + ly, cz - lx * sn + lz * cs];
    const hx = sx / 2, hz = sz / 2;
    const N = (lx, lz) => [lx * cs + lz * sn, 0, -lx * sn + lz * cs];
    const top = colTop || col;
    this.quad(P(-hx, 0, hz), P(hx, 0, hz), P(hx, sy, hz), P(-hx, sy, hz), uv, col, N(0, 1), top);
    this.quad(P(hx, 0, -hz), P(-hx, 0, -hz), P(-hx, sy, -hz), P(hx, sy, -hz), uv, col, N(0, -1), top);
    this.quad(P(hx, 0, hz), P(hx, 0, -hz), P(hx, sy, -hz), P(hx, sy, hz), uv, col, N(1, 0), top);
    this.quad(P(-hx, 0, -hz), P(-hx, 0, hz), P(-hx, sy, hz), P(-hx, sy, -hz), uv, col, N(-1, 0), top);
    this.quad(P(-hx, sy, hz), P(hx, sy, hz), P(hx, sy, -hz), P(-hx, sy, -hz), uv, top, [0, 1, 0]);
  }
  /** append a three.js geometry transformed by `matrix`, with a flat colour (or fn(y) -> colour) and optional constant uv */
  addGeometry(geom, matrix, color, constUV) {
    const g = geom.index ? geom.toNonIndexed() : geom;
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      nn.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      const c = typeof color === 'function' ? lin(color(v, i)) : lin(color);
      this._push([v.x, v.y, v.z], [nn.x, nn.y, nn.z], constUV || (uv ? [uv.getX(i), uv.getY(i)] : [0, 0]), c);
    }
  }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  toMesh(material, { cast = false, receive = false } = {}) {
    const m = new THREE.Mesh(this.toGeometry(), material);
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  }
}
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const M4 = new THREE.Matrix4();
export function mat(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = sx, sz = sx) {
  return M4.clone().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));
}

// ------------------------------------------------------------------ instanced prop geometries
/** cast-iron gas/electric street lamp ~4.6 m (merged, vertex coloured) */
export function makeLampGeometry() {
  const b = new GeoBuilder();
  const iron = 0x26282a, lamp = 0xffe9a8;
  b.addGeometry(new THREE.CylinderGeometry(0.17, 0.24, 0.55, 8), mat(0, 0.275, 0), iron);
  b.addGeometry(new THREE.CylinderGeometry(0.1, 0.14, 0.35, 8), mat(0, 0.72, 0), iron);
  b.addGeometry(new THREE.CylinderGeometry(0.055, 0.075, 3.3, 6), mat(0, 2.5, 0), iron);
  b.addGeometry(new THREE.CylinderGeometry(0.13, 0.08, 0.2, 8), mat(0, 4.2, 0), iron);
  b.addGeometry(new THREE.BoxGeometry(0.42, 0.55, 0.42), mat(0, 4.55, 0), lamp);
  b.addGeometry(new THREE.ConeGeometry(0.38, 0.32, 4), mat(0, 5.0, 0, Math.PI / 4), iron);
  b.addGeometry(new THREE.SphereGeometry(0.06, 5, 4), mat(0, 5.2, 0), iron);
  // little bracket arm with a ladder bar
  b.addGeometry(new THREE.BoxGeometry(0.5, 0.04, 0.04), mat(0, 3.4, 0), iron);
  return b.toGeometry();
}

function perturbed(geom, R, amount) {
  const p = geom.attributes.position;
  const v = new THREE.Vector3();
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let d = seen.get(key);
    if (!d) { d = [(R() - 0.5) * amount, (R() - 0.5) * amount, (R() - 0.5) * amount]; seen.set(key, d); }
    p.setXYZ(i, v.x + d[0], v.y + d[1], v.z + d[2]);
  }
  return geom;
}

function foliageColor(base, top, y0, y1) {
  const a = new THREE.Color(base), b = new THREE.Color(top);
  return (v) => { const t = THREE.MathUtils.clamp((v.y - y0) / (y1 - y0), 0, 1); return a.clone().lerp(b, t); };
}

/** broadleaf tree (lime / chestnut), ~9 m tall, origin at the foot */
export function makeBroadTreeGeometry(seed = 5) {
  const R = rngFactory(seed), b = new GeoBuilder();
  b.addGeometry(new THREE.CylinderGeometry(0.16, 0.26, 3.2, 6), mat(0, 1.6, 0), 0x5a4533);
  const col = foliageColor(0x3f5f34, 0x86a24e, 2.4, 9);
  const blob = (x, y, z, r, detail) => {
    const g = perturbed(new THREE.IcosahedronGeometry(r, detail), R, r * 0.22);
    b.addGeometry(g, mat(x, y, z, R() * 6, 1, 0.86, 1), col);
  };
  blob(0, 5.6, 0, 2.7, 1);
  blob(1.5, 4.7, 0.5, 1.9, 0);
  blob(-1.4, 4.9, -0.6, 2.0, 0);
  blob(0.3, 7.0, 0.2, 1.8, 0);
  blob(-0.6, 4.4, 1.5, 1.6, 0);
  return b.toGeometry();
}

/** tall poplar, ~15 m */
export function makePoplarGeometry(seed = 9) {
  const R = rngFactory(seed), b = new GeoBuilder();
  b.addGeometry(new THREE.CylinderGeometry(0.14, 0.22, 3.0, 5), mat(0, 1.5, 0), 0x5a4a3a);
  const col = foliageColor(0x3a5632, 0x6f9444, 2.5, 15);
  for (let i = 0; i < 5; i++) {
    const y = 4.5 + i * 2.2, r = 1.55 - Math.abs(i - 1.6) * 0.18;
    b.addGeometry(perturbed(new THREE.IcosahedronGeometry(r, 0), R, 0.3), mat(0, y, 0, R() * 6, 1, 1.5, 1), col);
  }
  return b.toGeometry();
}

/** spruce / thuja for villa gardens, ~6 m */
export function makeSpruceGeometry() {
  const b = new GeoBuilder();
  b.addGeometry(new THREE.CylinderGeometry(0.12, 0.18, 1.0, 5), mat(0, 0.5, 0), 0x4a3a2c);
  const col = foliageColor(0x254a30, 0x3f6a3e, 0.5, 6);
  for (let i = 0; i < 4; i++) b.addGeometry(new THREE.ConeGeometry(1.7 - i * 0.35, 2.2, 7), mat(0, 1.6 + i * 1.2, 0, i), col);
  return b.toGeometry();
}

/** wheat sheaf (stook) */
export function makeSheafGeometry() {
  const b = new GeoBuilder();
  b.addGeometry(new THREE.ConeGeometry(0.34, 0.95, 6), mat(0, 0.47, 0), 0xcdaa55);
  b.addGeometry(new THREE.CylinderGeometry(0.2, 0.3, 0.18, 6), mat(0, 0.38, 0), 0x8a6a35);
  b.addGeometry(new THREE.ConeGeometry(0.2, 0.4, 5), mat(0, 1.05, 0), 0xe2c36a);
  return b.toGeometry();
}

/** white roadside post (field road) */
export function makePostGeometry() {
  const b = new GeoBuilder();
  b.addGeometry(new THREE.BoxGeometry(0.16, 0.8, 0.16), mat(0, 0.4, 0), 0xe9e4d6);
  b.addGeometry(new THREE.BoxGeometry(0.17, 0.14, 0.17), mat(0, 0.62, 0), 0x2a2a2a);
  return b.toGeometry();
}

export function makeSleeperGeometry() {
  const g = new THREE.BoxGeometry(0.26, 0.16, 2.6);
  return g;
}

// ------------------------------------------------------------------ static prop builders (append to a GeoBuilder, world space)
export function addBench(b, x, z, yaw) {
  const wood = 0x7a5a38, iron = 0x26282a;
  b.box(x, 0.42, z, 1.6, 0.06, 0.45, yaw, wood);
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  // backrest (towards local -z)
  b.box(x - 0.2 * sn, 0.7, z - 0.2 * cs, 1.6, 0.3, 0.05, yaw, wood);
  for (const sx of [-0.7, 0.7]) b.box(x + sx * cs, 0, z - sx * sn, 0.06, 0.45, 0.4, yaw, iron);
}

export function addTrough(b, x, z, yaw) {
  b.box(x, 0, z, 2.2, 0.7, 0.8, yaw, 0x8c877d);
  b.box(x, 0.66, z, 1.9, 0.06, 0.5, yaw, 0x4e6d7a); // water
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  b.box(x + cs * 1.4, 0, z - sn * 1.4, 0.28, 1.3, 0.28, yaw, 0x2a3a30); // cast-iron pump
  b.box(x + cs * 1.4, 1.25, z - sn * 1.4, 0.5, 0.1, 0.12, yaw, 0x2a3a30);
}

/** telegraph pole with a cross arm; returns top positions of the 4 insulators */
export function addTelegraphPole(b, x, z, yaw, h = 7.2) {
  b.addGeometry(new THREE.CylinderGeometry(0.09, 0.14, h, 6), mat(x, h / 2, z), 0x5b4a3a);
  b.box(x, h - 0.5, z, 0.1, 0.12, 1.5, yaw, 0x4d3f31);
  b.box(x, h - 1.1, z, 0.1, 0.12, 1.2, yaw, 0x4d3f31);
}

/** advertising column (Litfaß) – returns {geom} with poster UVs; caller supplies a material with the poster map */
export function makeAdColumnGeometry() {
  const b = new GeoBuilder();
  b.addGeometry(new THREE.CylinderGeometry(0.62, 0.7, 0.35, 12), mat(0, 0.175, 0), 0x3a4a3c, [0.004, 0.5]);
  b.addGeometry(new THREE.CylinderGeometry(0.58, 0.58, 2.5, 16, 1, true), mat(0, 1.6, 0), [1, 1, 1], null);
  b.addGeometry(new THREE.CylinderGeometry(0.66, 0.6, 0.18, 12), mat(0, 2.95, 0), 0x3a4a3c, [0.004, 0.5]);
  b.addGeometry(new THREE.ConeGeometry(0.72, 0.5, 12), mat(0, 3.3, 0), 0x2f4a38, [0.004, 0.5]);
  b.addGeometry(new THREE.SphereGeometry(0.09, 5, 4), mat(0, 3.62, 0), 0x2a2a2a, [0.004, 0.5]);
  return b.toGeometry();
}

export { mergeGeometries };
