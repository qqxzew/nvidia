// Level 2 cellar — props (owner: world): lager casks, arcade, dock, lift, blocks, pipes, cables, bulbs, puddles, decals.
import * as THREE from 'three';
import { BLOCKS, DOCK, LIFT, BULBS, TARGET } from './layout.js';
import { BAYS, CASK, caskXs, GAL, HALL, PZ, SHAFT, SHAFT_TOP, ID, ARCS, ceilH, arcH, regionAt, GUTTER, MB, lin, noise3 } from './cellarGeo.js';
import { END_ARCH } from './cellarShell.js';
import { BRICK_TILE, caskHeadRect, CASK_HEADS, decalUV, rng } from './cellarTextures.js';


const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
const _Y = new THREE.Vector3(0, 1, 0);
/** matrix placing a unit-height Y-axis geometry between two points */
function between(a, b) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A), len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.multiplyScalar(1 / len));
  return { m: new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1)), len };
}
const ceilAtP = (x, z) => { const id = regionAt(x, z); return id ? ceilH(id, x, z) : 3; };

const IRON = lin(0x2b2724), IRON_L = lin(0x4a443e), RUST = lin(0x5a3424), BRASS = lin(0x6e5a30), PORCELAIN = lin(0xd8d2c4);
const FROST = lin(0x6c7072), WOOD = lin(0xffffff), WOOD_D = lin(0x8a7a6a), BRICK_RED = lin(0x8a4a36), STONE = lin(0x8a847a);

// ------------------------------------------------------------------ lager casks (instanced)
export function caskGeometry() {
  const { L, rMid, rHead } = CASK;
  const chime = 0.045, lip = 0.035;
  const prof = [new THREE.Vector2(rHead - lip, chime), new THREE.Vector2(rHead, 0)];
  const N = 10;
  for (let i = 1; i < N; i++) { const t = i / N; prof.push(new THREE.Vector2(rHead + (rMid - rHead) * Math.pow(Math.sin(Math.PI * t), 0.75), L * t)); }
  prof.push(new THREE.Vector2(rHead, L), new THREE.Vector2(rHead - lip, L - chime));
  const seg = 22;
  const parts = [];
  const body = new THREE.LatheGeometry(prof, seg).toNonIndexed();
  // body uv -> atlas left half, v 0..0.88
  { const uv = body.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.88); }
  parts.push(body);
  // heads (front at y = chime, back at y = L - chime)
  for (const [y, flip] of [[chime, true], [L - chime, false]]) {
    const h = new THREE.CircleGeometry(rHead - lip + 0.004, seg).toNonIndexed();
    const r = caskHeadRect(0);
    const uv = h.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
    // circle lies in XY facing +Z; lathe axis is Y: rotate so it faces -Y (front) / +Y (back)
    h.applyMatrix4(new THREE.Matrix4().makeRotationX(flip ? Math.PI / 2 : -Math.PI / 2));
    h.translate(0, y, 0);
    parts.push(h);
  }
  // iron hoops
  const rAt = (y) => rHead + (rMid - rHead) * Math.pow(Math.sin(Math.PI * y / L), 0.75);
  for (const y of [0.12, 0.42, L - 0.42, L - 0.12]) {
    const r = rAt(y) + 0.012;
    const h = new THREE.CylinderGeometry(r, r, 0.075, seg, 1, true).toNonIndexed();
    const uv = h.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, 0.91 + uv.getY(i) * 0.08);
    h.translate(0, y, 0);
    parts.push(h);
  }
  // colour attribute: heads slightly lighter / greyer, hoops neutral
  for (const p of parts) { const c = new Float32Array(p.attributes.position.count * 3).fill(1); p.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  const g = mergeAll(parts);
  // lathe axis Y -> -Z: front head at z = 0 facing +Z, body extends to z = -L
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  g.computeBoundingSphere();
  return g;
}
function mergeAll(parts) {
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2), C = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    if (!p.attributes.normal) p.computeVertexNormals();
    P.set(p.attributes.position.array, o * 3); N.set(p.attributes.normal.array, o * 3); U.set(p.attributes.uv.array, o * 2); C.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return g;
}
/** cask instances: [{ matrix, head, x, z, front: {x,z, nz} }] */
export function caskInstances() {
  const out = [], R = rng(88);
  let k = 0;
  for (const b of BAYS) {
    for (const [zf, dir] of [[b.z0, 1], [b.z1, -1]]) {         // north strip heads face +z, south strip heads face -z
      for (const x of caskXs(b)) {
        const yaw = dir > 0 ? 0 : Math.PI;
        const m = M(x, CASK.cy, zf, 0, yaw, (R() - 0.5) * 0.25);   // roll about its own axis for variety
        out.push({ matrix: m, head: (k * 5 + 3) % CASK_HEADS, x, z: zf, dir, tint: 0.8 + R() * 0.35 });
        k++;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ static structure: beams, pillars, arcade, dock, lift, door
export function buildStructure({ brick, floor, wood, misc }) {
  // beams under the casks (2 per strip, along x)
  for (const b of BAYS) {
    for (const [zf, dir] of [[b.z0, 1], [b.z1, -1]]) {
      for (const dz of [0.32, CASK.L - 0.38]) {
        const z = zf - dir * dz, len = b.bx1 - b.bx0 - 0.1;
        wood.geo(new THREE.BoxGeometry(len, CASK.beamH, 0.24), M((b.bx0 + b.bx1) / 2, CASK.beamH / 2, z), { uv: 'box', tile: 1.3, color: lin(0x6a5a4c), w: 0 });
        // wedges at each cask
        for (const x of caskXs(b)) for (const s of [-1, 1]) wood.geo(new THREE.BoxGeometry(0.16, 0.12, 0.22), M(x + s * 0.62, CASK.beamH + 0.05, z, 0, 0, s * 0.5), { uv: 'box', tile: 1, color: lin(0x75624e) });
      }
    }
  }
  // pillars: stone plinth + impost
  for (const p of BLOCKS.filter((b) => b.kind === 'pillar')) {
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, w = p.x1 - p.x0 + 0.05, d = p.z1 - p.z0 + 0.05;
    floor.geo(new THREE.BoxGeometry(w, 0.34, d), M(cx, 0.17, cz), { uv: 'box', tile: 4, color: STONE, w: 0.15 });
    floor.geo(new THREE.BoxGeometry(w + 0.08, 0.15, d + 0.08), M(cx, 2.27, cz), { uv: 'box', tile: 4, color: STONE, w: 0 });
  }
  // arcade along z = PZ: arches between hall walls and pillars, spandrel faces up to the vaults
  const pil = BLOCKS.filter((b) => b.kind === 'pillar').sort((a, b) => a.x0 - b.x0);
  const supports = [HALL.x0, ...pil.flatMap((p) => [p.x0, p.x1]), HALL.x1];
  const half = 0.3, spring = 2.35;
  for (let s = 0; s + 1 < supports.length; s += 2) {
    const xa = supports[s], xb = supports[s + 1], span = xb - xa;
    if (span < 0.6) continue;
    const rise = Math.min(0.55, span * 0.11);
    const under = (x) => { const t = (x - xa) / span; return spring + rise * Math.sin(Math.PI * t); };
    const nSeg = Math.max(6, Math.round(span / 0.25));
    const vtx = (x, y, z, n) => ({ x, y, z, nx: n[0], ny: n[1], nz: n[2], u: x / BRICK_TILE, v: (y + z) / BRICK_TILE, c: [0.9, 0.88, 0.86], w: 0.55 });
    for (let k = 0; k < nSeg; k++) {
      const x0 = xa + span * k / nSeg, x1 = xa + span * (k + 1) / nSeg, y0 = under(x0), y1 = under(x1);
      // soffit
      brick.quad(vtx(x0, y0, PZ - half, [0, -1, 0]), vtx(x1, y1, PZ - half, [0, -1, 0]), vtx(x1, y1, PZ + half, [0, -1, 0]), vtx(x0, y0, PZ + half, [0, -1, 0]), [0, -1, 0]);
      // spandrels (both sides), subdivided vertically for the bake
      for (const sz of [-1, 1]) {
        const z = PZ + sz * half, n = [0, 0, sz];
        const t0 = ceilH(ID.HALL, x0, z + sz * 0.01), t1 = ceilH(ID.HALL, x1, z + sz * 0.01);
        const rows = 4;
        for (let r = 0; r < rows; r++) {
          const ya0 = y0 + (t0 - y0) * r / rows, ya1 = y0 + (t0 - y0) * (r + 1) / rows;
          const yb0 = y1 + (t1 - y1) * r / rows, yb1 = y1 + (t1 - y1) * (r + 1) / rows;
          brick.quad(vtx(x0, ya0, z, n), vtx(x1, yb0, z, n), vtx(x1, yb1, z, n), vtx(x0, ya1, z, n), n);
        }
      }
    }
  }
  // dock: iron edge angle along the front
  misc.geo(new THREE.BoxGeometry(DOCK.x1 - DOCK.x0, 0.035, 0.09), M((DOCK.x0 + DOCK.x1) / 2, DOCK.height + 0.012, DOCK.z1 - 0.045), { color: IRON_L });
  misc.geo(new THREE.BoxGeometry(DOCK.x1 - DOCK.x0, 0.1, 0.02), M((DOCK.x0 + DOCK.x1) / 2, DOCK.height - 0.04, DOCK.z1 + 0.005), { color: IRON });
  // timber fenders on the dock face
  for (let x = DOCK.x0 + 0.8; x < DOCK.x1 - 0.5; x += 2.2) wood.geo(new THREE.BoxGeometry(0.16, 0.26, 0.05), M(x, 0.15, DOCK.z1 + 0.02), { uv: 'box', tile: 1, color: WOOD_D });
  buildLift({ wood, misc });
  // stair door in the hall west wall (to the upper floors), closed
  {
    const x = HALL.x0 + 0.03, z0 = -2.6, z1 = -1.3, h = 2.15;
    wood.geo(new THREE.BoxGeometry(0.05, h, z1 - z0), M(x, h / 2, (z0 + z1) / 2), { uv: 'box', tile: 1.1, color: lin(0x7a6656) });
    for (const y of [0.35, 1.1, 1.85]) misc.geo(new THREE.BoxGeometry(0.02, 0.06, z1 - z0 - 0.08), M(x + 0.035, y, (z0 + z1) / 2), { color: IRON });
    misc.geo(new THREE.TorusGeometry(0.05, 0.008, 4, 10), M(x + 0.05, 1.05, z0 + 0.22, 0, Math.PI / 2, 0), { color: IRON_L });
    floor.geo(new THREE.BoxGeometry(0.08, 0.14, z1 - z0 + 0.3), M(x, h + 0.07, (z0 + z1) / 2), { uv: 'box', tile: 4, color: STONE });
    for (const z of [z0 - 0.08, z1 + 0.08]) floor.geo(new THREE.BoxGeometry(0.08, h, 0.16), M(x, h / 2, z), { uv: 'box', tile: 4, color: STONE });
  }
}

function buildLift({ wood, misc }) {
  const { x0, x1, z0, z1 } = SHAFT, y0 = DOCK.height;
  const ix0 = x0 + 0.15, ix1 = x1 - 0.15, iz0 = z0 + 0.15, iz1 = z1 - 0.12, top = y0 + 2.5;
  // cage platform
  wood.geo(new THREE.BoxGeometry(ix1 - ix0, 0.06, iz1 - iz0), M((ix0 + ix1) / 2, y0 + 0.03, (iz0 + iz1) / 2), { uv: 'box', tile: 1, color: lin(0x6e5c4a) });
  const PAINT = lin(0x6a756c);
  const bar = (a, b, w = 0.04, col = PAINT) => { const { m } = between(a, b); misc.geo(new THREE.BoxGeometry(w, 1, w), m, { color: col }); };
  // corner posts, top frame, mid rail
  const cs = [[ix0, iz0], [ix1, iz0], [ix1, iz1], [ix0, iz1]];
  for (const [x, z] of cs) bar([x, y0, z], [x, top, z], 0.05);
  for (let k = 0; k < 4; k++) {
    const [ax, az] = cs[k], [bx, bz] = cs[(k + 1) % 4];
    bar([ax, top, az], [bx, top, bz], 0.05);
    if (k !== 2) { bar([ax, y0 + 1.05, az], [bx, y0 + 1.05, bz], 0.035); bar([ax, y0 + 0.06, az], [bx, y0 + 0.06, bz], 0.04); }
  }
  // lattice on the three closed sides (W, N, E)
  const lattice = (ax, az, bx, bz) => {
    const n = 3;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const p0 = [ax + (bx - ax) * t0, az + (bz - az) * t0], p1 = [ax + (bx - ax) * t1, az + (bz - az) * t1];
      bar([p0[0], y0 + 1.05, p0[1]], [p1[0], top, p1[1]], 0.02);
      bar([p1[0], y0 + 1.05, p1[1]], [p0[0], top, p0[1]], 0.02);
      bar([p0[0], y0 + 0.06, p0[1]], [p1[0], y0 + 1.05, p1[1]], 0.02);
      bar([p1[0], y0 + 0.06, p1[1]], [p0[0], y0 + 1.05, p0[1]], 0.02);
    }
  };
  lattice(ix0, iz1, ix0, iz0); lattice(ix0, iz0, ix1, iz0); lattice(ix1, iz0, ix1, iz1);
  // roof cross + hoist block + ropes up into the dark shaft
  const cx = (ix0 + ix1) / 2, cz = (iz0 + iz1) / 2;
  bar([ix0, top, iz0], [ix1, top, iz1], 0.04); bar([ix1, top, iz0], [ix0, top, iz1], 0.04);
  misc.geo(new THREE.BoxGeometry(0.22, 0.18, 0.16), M(cx, top + 0.1, cz), { color: IRON_L });
  for (const dx of [-0.05, 0.05]) bar([cx + dx, top + 0.18, cz], [cx + dx, SHAFT_TOP, cz], 0.018, lin(0x3c3833));
  // guide rails on the shaft back wall
  for (const x of [cx - 0.5, cx + 0.5]) bar([x, y0, z0 + 0.05], [x, SHAFT_TOP, z0 + 0.05], 0.06, IRON);
  // folding lattice gate, pushed to the west side (half open)
  const gz = z1 - 0.05, gx0 = x0 + 0.08, gx1 = cx - 0.25, gy0 = y0 + 0.05, gy1 = y0 + 2.3;
  const nb = 7;
  for (let k = 0; k <= nb; k++) { const x = gx0 + (gx1 - gx0) * k / nb; bar([x, gy0, gz], [x, gy1, gz], 0.025); }
  for (let k = 0; k < nb; k++) {
    const xa = gx0 + (gx1 - gx0) * k / nb, xb = gx0 + (gx1 - gx0) * (k + 1) / nb;
    for (let r = 0; r < 3; r++) {
      const ya = gy0 + (gy1 - gy0) * r / 3, yb = gy0 + (gy1 - gy0) * (r + 1) / 3;
      bar([xa, ya, gz], [xb, yb, gz], 0.015); bar([xb, ya, gz], [xa, yb, gz], 0.015);
    }
  }
  bar([gx0, gy1 + 0.06, gz], [x1 - 0.08, gy1 + 0.06, gz], 0.03); // gate track
  // call button box beside the opening
  misc.geo(new THREE.BoxGeometry(0.16, 0.24, 0.06), M(x1 + 0.45, 1.45, z1 + 0.03), { color: lin(0x3a3a34) });
  misc.geo(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8), M(x1 + 0.45, 1.5, z1 + 0.065, Math.PI / 2, 0, 0), { color: lin(0x8a2a22) });
  bar([x1 + 0.45, 1.57, z1 + 0.02], [x1 + 0.45, 2.9, z1 + 0.02], 0.02, IRON); // conduit up
}

// ------------------------------------------------------------------ blocks: crates, kegs, cart, rubble; end wall arch
export function buildBlocks({ brick, wood, misc }) {
  const R = rng(4711);
  for (const b of BLOCKS) {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    if (b.kind === 'crates') {
      const crate = (w, h, d, x, y, z, ry) => {
        wood.geo(new THREE.BoxGeometry(w, h, d), M(x, y + h / 2, z, 0, ry, 0), { uv: 'box', tile: 0.9, color: lin(0x8c7a64) });
        // battens on the vertical edges and rims
        const m0 = M(x, y, z, 0, ry, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const m = m0.clone().multiply(M(sx * (w / 2 - 0.025), h / 2, sz * (d / 2 - 0.025)));
          wood.geo(new THREE.BoxGeometry(0.07, h + 0.01, 0.07), m, { uv: 'box', tile: 0.9, color: lin(0x5e4e3e) });
        }
        for (const yy of [0.04, h - 0.04]) for (const sz of [-1, 1]) {
          wood.geo(new THREE.BoxGeometry(w + 0.01, 0.07, 0.03), m0.clone().multiply(M(0, yy, sz * (d / 2 + 0.005))), { uv: 'box', tile: 0.9, color: lin(0x5e4e3e) });
        }
      };
      crate(0.88, 0.66, 0.9, cx + 0.02, 0, cz, 0.03);
      crate(0.78, 0.56, 0.76, cx - 0.02, 0.66, cz + 0.02, 0.16);
      crate(0.5, 0.34, 0.44, cx + 0.12, 1.22, cz - 0.1, -0.2);
    } else if (b.kind === 'kegs') {
      // trestle: two A-frames across x, two rails along z
      const za = b.z0 + 0.15, zb = b.z1 - 0.15, top = 0.72;
      for (const z of [za, zb]) for (const s of [-1, 1]) {
        const { m } = between([cx + s * 0.4, 0, z], [cx + s * 0.18, top, z]);
        wood.geo(new THREE.BoxGeometry(0.07, 1, 0.07), m, { uv: 'box', tile: 1, color: WOOD_D });
      }
      for (const s of [-1, 1]) wood.geo(new THREE.BoxGeometry(0.08, 0.08, zb - za + 0.1), M(cx + s * 0.22, top - 0.04, (za + zb) / 2), { uv: 'box', tile: 1, color: WOOD_D });
      const keg = kegGeometry();
      wood.geo(keg, M(cx, top + 0.25, b.z0 + 0.45, 0, 0, Math.PI / 2), { uv: 'keep', color: kegColor });
      wood.geo(keg, M(cx, top + 0.25, b.z1 - 0.47, 0, 0.12, Math.PI / 2), { uv: 'keep', color: kegColor });
      wood.geo(keg, M(cx, 0.28, cz, 0, 0.4, 0), { uv: 'keep', color: kegColor });
    } else if (b.kind === 'cart') {
      buildCart(wood, misc, b);
    } else if (b.kind === 'rubble') {
      const ax = b.x0, az = b.z1;   // the collapsed corner
      const heap = (x, z) => Math.max(0, 0.95 * (1 - Math.hypot((x - ax) / (b.x1 - b.x0 + 0.2), (z - az) / (b.z1 - b.z0 + 0.6)) * 0.95));
      for (let i = 0; i < 110; i++) {
        const x = b.x0 + 0.1 + R() * (b.x1 - b.x0 - 0.2), z = b.z0 + 0.08 + R() * (b.z1 - b.z0 - 0.12);
        const y = heap(x, z) * (0.35 + 0.65 * R());
        const col = R() < 0.15 ? lin(0x6a625a) : lin(0x8a4a36, 0.6 + R() * 0.5);
        misc.geo(new THREE.BoxGeometry(0.25, 0.065, 0.12), M(x, y + 0.03, z, (R() - 0.5) * 1.4, R() * 6.28, (R() - 0.5) * 1.4), { color: col });
      }
      for (let i = 0; i < 9; i++) {
        const x = b.x0 + 0.2 + R() * (b.x1 - b.x0 - 0.4), z = b.z0 + 0.25 + R() * (b.z1 - b.z0 - 0.3);
        misc.geo(new THREE.DodecahedronGeometry(0.1 + R() * 0.12, 0), M(x, heap(x, z) * 0.6, z, R() * 3, R() * 3, R() * 3, 1, 0.7, 1), { color: lin(0x6e665c, 0.7 + R() * 0.4) });
      }
      // straw of the rats' nest
      for (let i = 0; i < 26; i++) {
        const x = b.x0 + 0.15 + R() * 0.7, z = b.z1 - 0.15 - R() * 0.6;
        misc.geo(new THREE.BoxGeometry(0.22, 0.008, 0.012), M(x, heap(x, z) * 0.5 + 0.02, z, 0, R() * 6.28, (R() - 0.5) * 0.4), { color: lin(0xa08850) });
      }
      // dark breach in the bricked-up arch behind the heap
      const hx = b.x0 + 0.9, hy = 1.35, hz = GAL.z1 - 0.012, pts = [];
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; const r = 0.42 * (0.7 + 0.5 * noise3(Math.cos(a) * 2 + 7, Math.sin(a) * 2, 1)); pts.push([hx + Math.cos(a) * r * 1.2, hy + Math.sin(a) * r]); }
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k], q = pts[(k + 1) % pts.length];
        const v = (x, y, ao) => ({ x, y, z: hz, nx: 0, ny: 0, nz: -1, u: 0, v: 0, c: [0.012, 0.01, 0.009], w: 0, ao });
        misc.tri(v(hx, hy, 0.2), v(p[0], p[1], 0.5), v(q[0], q[1], 0.5), [0, 0, -1]);
      }
      // loose bricks on the floor in front
      for (let i = 0; i < 5; i++) misc.geo(new THREE.BoxGeometry(0.25, 0.065, 0.12), M(b.x0 + 0.2 + R() * 1.6, 0.033, b.z0 + 0.1 + R() * 0.3, 0, R() * 3, 0), { color: lin(0x8a4a36, 0.7 + R() * 0.3) });
    }
  }
  // bricked-up arch: protruding brick ring + jambs on the gallery end wall
  {
    const z = GAL.z1, t = 0.06, { x: ax, y: ay, r, ring } = END_ARCH, R2 = r + ring;
    const v = (x, y, zz, n) => ({ x, y, z: zz, nx: n[0], ny: n[1], nz: n[2], u: x / BRICK_TILE, v: y / BRICK_TILE, c: [0.95, 0.85, 0.8], w: 0.1 });
    const nSeg = 18;
    for (let k = 0; k < nSeg; k++) {
      const a0 = Math.PI * k / nSeg, a1 = Math.PI * (k + 1) / nSeg;
      const P = (rr, a) => [ax + Math.cos(a) * rr, ay + Math.sin(a) * rr];
      const [ix0, iy0] = P(r, a0), [ix1, iy1] = P(r, a1), [ox0, oy0] = P(R2, a0), [ox1, oy1] = P(R2, a1);
      brick.quad(v(ix0, iy0, z - t, [0, 0, -1]), v(ox0, oy0, z - t, [0, 0, -1]), v(ox1, oy1, z - t, [0, 0, -1]), v(ix1, iy1, z - t, [0, 0, -1]), [0, 0, -1]);
      const ni = [-Math.cos((a0 + a1) / 2), -Math.sin((a0 + a1) / 2), 0], no = [-ni[0], -ni[1], 0];
      brick.quad(v(ix0, iy0, z, ni), v(ix1, iy1, z, ni), v(ix1, iy1, z - t, ni), v(ix0, iy0, z - t, ni), ni);
      brick.quad(v(ox0, oy0, z, no), v(ox1, oy1, z, no), v(ox1, oy1, z - t, no), v(ox0, oy0, z - t, no), no);
    }
    for (const s of [-1, 1]) {
      const xi = ax + s * r, xo = ax + s * R2;
      const rows = 4;
      for (let k = 0; k < rows; k++) {
        const y0 = ay * k / rows, y1 = ay * (k + 1) / rows;
        brick.quad(v(xi, y0, z - t, [0, 0, -1]), v(xo, y0, z - t, [0, 0, -1]), v(xo, y1, z - t, [0, 0, -1]), v(xi, y1, z - t, [0, 0, -1]), [0, 0, -1]);
        brick.quad(v(xi, y0, z, [-s, 0, 0]), v(xi, y1, z, [-s, 0, 0]), v(xi, y1, z - t, [-s, 0, 0]), v(xi, y0, z - t, [-s, 0, 0]), [-s, 0, 0]);
      }
    }
  }
}
const kegColor = (x, y, z, nx, ny, nz, lx, ly) => (Math.abs(Math.abs(ly) - 0.17) < 0.03 || Math.abs(ly) > 0.255 ? lin(0x4a4038) : lin(0x9a7a5a));
let _keg = null;
function kegGeometry() {
  if (_keg) return _keg;
  const prof = [new THREE.Vector2(0, -0.27), new THREE.Vector2(0.2, -0.27), new THREE.Vector2(0.21, -0.28)];
  for (let i = 0; i <= 6; i++) { const t = i / 6; prof.push(new THREE.Vector2(0.21 + 0.045 * Math.sin(Math.PI * t), -0.28 + 0.56 * t)); }
  prof.push(new THREE.Vector2(0.2, 0.27), new THREE.Vector2(0, 0.27));
  _keg = new THREE.LatheGeometry(prof, 12).toNonIndexed();
  _keg.computeVertexNormals();
  return _keg;
}
function buildCart(wood, misc, b) {
  const cx = (b.x0 + b.x1) / 2, axleZ = b.z1 - 0.42, rW = 0.36, axleY = rW;
  const frame = M(cx, 0.47, (b.z0 + b.z1) / 2 + 0.02, -0.26, 0, 0);
  const add = (geo, local, opts) => wood.geo(geo, frame.clone().multiply(local), opts);
  add(new THREE.BoxGeometry(0.66, 0.05, 1.22), M(0, 0, 0), { uv: 'box', tile: 1, color: lin(0x7c6a58) });
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.04, 0.22, 1.22), M(s * 0.33, 0.12, 0), { uv: 'box', tile: 1, color: lin(0x6a5a4a) });
    add(new THREE.BoxGeometry(0.05, 0.05, 0.42), M(s * 0.3, -0.02, -0.78), { uv: 'box', tile: 1, color: WOOD_D }); // handles
  }
  add(new THREE.BoxGeometry(0.66, 0.24, 0.04), M(0, 0.12, 0.6), { uv: 'box', tile: 1, color: lin(0x6a5a4a) });
  // wheels
  for (const s of [-1, 1]) {
    const x = cx + s * 0.43;
    misc.geo(new THREE.TorusGeometry(rW - 0.02, 0.028, 4, 18), M(x, axleY, axleZ, 0, Math.PI / 2, 0), { color: IRON_L });
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      wood.geo(new THREE.BoxGeometry(0.03, rW - 0.05, 0.03), M(x, axleY + Math.cos(a) * (rW - 0.05) / 2, axleZ + Math.sin(a) * (rW - 0.05) / 2, a, 0, 0), { uv: 'box', tile: 1, color: WOOD_D });
    }
    misc.geo(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), M(x, axleY, axleZ, 0, 0, Math.PI / 2), { color: IRON });
  }
  misc.geo(new THREE.CylinderGeometry(0.025, 0.025, 0.86, 6), M(cx, axleY, axleZ, 0, 0, Math.PI / 2), { color: IRON });
}

// ------------------------------------------------------------------ pipes, cables, bulbs (cords + sockets)
function tube(mb, pts, r, sides, col, ao = 1) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const { m, len } = between(pts[k], pts[k + 1]);
    if (len < 1e-4) continue;
    mb.geo(new THREE.CylinderGeometry(r, r, 1, sides, 1, true), m, { color: col, ao });
  }
}
/** a polyline hugging the vault: from (x0,z0) to (x1,z1), every `step` m, `drop` below the ceiling (and under the arcade) */
function ceilPath(x0, z0, x1, z1, drop, step = 0.5) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / step)), pts = [];
  for (let k = 0; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
    let y = ceilAtP(x, z) - drop;
    if (regionAt(x, z) === ID.HALL && Math.abs(z - PZ) < 0.36) y = Math.min(y, 2.35 + 0.53 - drop); // under the arcade soffit
    pts.push([x, y, z]);
  }
  return pts;
}
export function buildServices({ misc }) {
  // brine pipes along the gallery crown (the big one frosted), ending in the hall vault
  for (const [x, r, col] of [[0.8, 0.055, FROST], [1.06, 0.035, RUST]]) {
    const y = arcH(ARCS.g, x) - 0.17 - r;
    const zA = GAL.z0 - 0.4, zB = GAL.z1;
    const pts = [];
    for (let z = zA; z <= zB + 1e-6; z += 0.6) pts.push([x, y, Math.min(z, zB)]);
    if (pts[pts.length - 1][2] < zB) pts.push([x, y, zB]);
    tube(misc, pts, r, 8, col);
    tube(misc, [[x, y, zA], [x, y + 0.6, zA]], r, 8, col);   // bends up into the vault
    for (let z = zA + 0.8; z < zB; z += 2.4) { // hangers
      const top = ceilAtP(x, z);
      misc.geo(new THREE.BoxGeometry(0.02, top - y, 0.03), M(x, (top + y) / 2, z), { color: IRON });
    }
    for (let z = zA + 3; z < zB; z += 6) misc.geo(new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.09, 8), M(x, y, z, Math.PI / 2, 0, 0), { color: col }); // flanges
  }
  // electric cable along the vault, porcelain insulators, branches to the bulbs
  const cx = 0, drop = 0.035;
  const lit = BULBS.map((b) => ({ x: b.x, z: b.z }));
  const branches = [];
  const zs = BULBS.filter((b) => regionAt(b.x, b.z) === ID.GAL).map((b) => b.z);
  const zEnd = Math.max(...zs, GAL.z0 + 2);
  const hallBulbs = BULBS.filter((b) => regionAt(b.x, b.z) === ID.HALL);
  const zHall = Math.min(...hallBulbs.map((b) => b.z), -1);
  branches.push(ceilPath(cx, zHall, cx, zEnd, drop));
  for (const b of BULBS) {
    if (Math.abs(b.x - cx) > 0.3) branches.push(ceilPath(cx, b.z, b.x, b.z, drop));
  }
  // dead branch into the unlit bay (empty socket, broken bulb)
  const dark = BAYS.filter((bay) => !BULBS.some((b) => regionAt(b.x, b.z) === ID.BAY0 + bay.k));
  for (const bay of dark) branches.push(ceilPath(cx, bay.c, (bay.x0 + bay.x1) / 2 + bay.side * 0.5, bay.c, drop));
  for (const p of branches) {
    tube(misc, p, 0.011, 4, lin(0x1e1a17), 0.8);
    for (let k = 0; k < p.length; k += 3) misc.geo(new THREE.CylinderGeometry(0.018, 0.022, 0.035, 6), M(p[k][0], p[k][1] + 0.022, p[k][2]), { color: PORCELAIN });
  }
  // cords + sockets
  const cord = (x, yBot, z, seed) => {
    const top = ceilAtP(x, z) - drop;
    const len = top - yBot; if (len <= 0.02) return;
    misc.geo(new THREE.CylinderGeometry(0.03, 0.036, 0.035, 10), M(x, top + 0.004, z), { color: PORCELAIN }); // ceiling rose
    const turns = len / 0.07, n = Math.ceil(turns * 3);
    for (const ph of [0, Math.PI]) {
      const pts = [];
      for (let k = 0; k <= n; k++) { const t = k / n, a = ph + t * turns * Math.PI * 2 + seed; pts.push([x + Math.cos(a) * 0.0055, yBot + t * len, z + Math.sin(a) * 0.0055]); }
      tube(misc, pts, 0.0045, 3, lin(0x2a1f18), 0.9);
    }
  };
  BULBS.forEach((b, i) => {
    misc.geo(new THREE.CylinderGeometry(0.021, 0.019, 0.06, 10), M(b.x, b.y + 0.08, b.z), { color: BRASS, ao: 0.8 });
    misc.geo(new THREE.CylinderGeometry(0.012, 0.021, 0.025, 8), M(b.x, b.y + 0.122, b.z), { color: lin(0x2a2420) });
    cord(b.x, b.y + 0.134, b.z, i * 1.7);
  });
  for (const bay of dark) {
    const x = (bay.x0 + bay.x1) / 2 + bay.side * 0.5, z = bay.c, y = 2.85;
    misc.geo(new THREE.CylinderGeometry(0.021, 0.019, 0.06, 10), M(x, y + 0.08, z), { color: BRASS });
    misc.geo(new THREE.CylinderGeometry(0.019, 0.016, 0.02, 8), M(x, y + 0.045, z), { color: lin(0x5a5040) }); // broken glass stub
    cord(x, y + 0.11, z, 3.3);
  }
  // drain grates at the ends of the gutter
  for (const z of [GUTTER.z0 - 0.35, GUTTER.z1 + 0.35]) {
    const y = 0.006, s = 0.42;
    const v = (x, zz, c) => ({ x, y, z: zz, nx: 0, ny: 1, nz: 0, u: 0, v: 0, c, w: 0, ao: 0.6 });
    misc.quad(v(GUTTER.x - s / 2, z - s / 2, [0.01, 0.01, 0.01]), v(GUTTER.x - s / 2, z + s / 2, [0.01, 0.01, 0.01]), v(GUTTER.x + s / 2, z + s / 2, [0.01, 0.01, 0.01]), v(GUTTER.x + s / 2, z - s / 2, [0.01, 0.01, 0.01]), [0, 1, 0]);
    for (let k = 0; k <= 6; k++) misc.geo(new THREE.BoxGeometry(0.025, 0.02, s), M(GUTTER.x - s / 2 + s * k / 6, y + 0.005, z), { color: IRON_L });
    for (const dz of [-1, 1]) misc.geo(new THREE.BoxGeometry(s + 0.03, 0.02, 0.03), M(GUTTER.x, y + 0.005, z + dz * s / 2), { color: IRON_L });
  }
  // ventilation slots high in the bay back walls
  for (const bay of BAYS) {
    const x = bay.side > 0 ? bay.x1 - 0.012 : bay.x0 + 0.012, z = bay.c, y0 = 2.55, y1 = 3.0, w = 0.7;
    const v = (yy, zz) => ({ x, y: yy, z: zz, nx: -bay.side, ny: 0, nz: 0, u: 0, v: 0, c: [0.008, 0.007, 0.006], w: 0, ao: 0.4 });
    misc.quad(v(y0, z - w / 2), v(y0, z + w / 2), v(y1, z + w / 2), v(y1, z - w / 2), [-bay.side, 0, 0]);
    for (let k = 1; k < 6; k++) misc.geo(new THREE.BoxGeometry(0.025, y1 - y0, 0.025), M(x - bay.side * 0.015, (y0 + y1) / 2, z - w / 2 + w * k / 6), { color: IRON });
  }
}

/** emissive bulb glass, merged; attribute aIdx = bulb index */
export function bulbGlassGeometry() {
  const prof = [new THREE.Vector2(0, -0.055), new THREE.Vector2(0.025, -0.05), new THREE.Vector2(0.042, -0.025), new THREE.Vector2(0.046, 0.0),
    new THREE.Vector2(0.04, 0.025), new THREE.Vector2(0.022, 0.045), new THREE.Vector2(0.018, 0.058), new THREE.Vector2(0.0, 0.06)];
  const base = new THREE.LatheGeometry(prof, 10).toNonIndexed();
  base.computeVertexNormals();
  const P = [], Nn = [], I = [];
  BULBS.forEach((b, i) => {
    const p = base.attributes.position, n = base.attributes.normal;
    for (let k = 0; k < p.count; k++) { P.push(p.getX(k) + b.x, p.getY(k) + b.y, p.getZ(k) + b.z); Nn.push(n.getX(k), n.getY(k), n.getZ(k)); I.push(i); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('aIdx', new THREE.Float32BufferAttribute(I, 1));
  g.computeBoundingSphere();
  return g;
}
/** camera-facing halo quads, merged; aCorner in -1..1, aIdx = bulb index */
export function haloGeometry() {
  const P = [], C = [], I = [], idx = [];
  BULBS.forEach((b, i) => {
    const o = P.length / 3;
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push(b.x, b.y, b.z); C.push(cx, cy); I.push(i); }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(C, 2));
  g.setAttribute('aIdx', new THREE.Float32BufferAttribute(I, 1));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 12), 40);
  return g;
}

// ------------------------------------------------------------------ puddles (go into the floor mesh)
export const PUDDLES = [
  [-4.6, -1.6, 0.75], [4.4, -6.9, 0.6], [-1.1, 9.2, 0.7], [0.3, 17.6, 0.9], [-0.7, 26.8, 0.65], [0.9, 31.6, 0.55],
  [9.4, 6.9, 0.55], [-6.2, 12.0, 0.6], [5.4, 18.1, 0.75], [-9.3, 25.0, 0.5], [-3.9, -6.6, 0.45],
];
export function buildPuddles(floor) {
  PUDDLES.forEach(([px, pz, r], i) => {
    const n = 16, y = 0.004, ring = [];
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      const rr = r * (0.62 + 0.55 * noise3(Math.cos(a) * 1.3 + i * 7, Math.sin(a) * 1.3, i));
      ring.push([px + Math.cos(a) * rr * 1.25, pz + Math.sin(a) * rr]);
    }
    const v = (x, z, w) => ({ x, y, z, nx: 0, ny: 1, nz: 0, u: x / 4, v: -z / 4, c: [0.42, 0.42, 0.42], w, ao: 1 });
    for (let k = 0; k < n; k++) {
      const a = ring[k], b = ring[(k + 1) % n];
      floor.tri(v(px, pz, 1), v(a[0], a[1], 0.92), v(b[0], b[1], 0.92), [0, 1, 0]);
    }
  });
}

// ------------------------------------------------------------------ decals (chalk, enamel signs, cobwebs)
function decalQuad(mb, rectName, origin, uDir, vDir, w, h, n, nu = 1, nv = 1, col = [1, 1, 1]) {
  const [u0, v0, u1, v1] = decalUV(rectName);
  const P = (s, t) => ({
    x: origin[0] + uDir[0] * w * s + vDir[0] * h * t, y: origin[1] + uDir[1] * w * s + vDir[1] * h * t, z: origin[2] + uDir[2] * w * s + vDir[2] * h * t,
    nx: n[0], ny: n[1], nz: n[2], u: u0 + (u1 - u0) * s, v: v0 + (v1 - v0) * t, c: col, w: 0, ao: 1,
  });
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    mb.quad(P(i / nu, j / nv), P((i + 1) / nu, j / nv), P((i + 1) / nu, (j + 1) / nv), P(i / nu, (j + 1) / nv), n);
  }
}
export function buildDecals(decal) {
  // delivery zone (texture top = north = toward the dock)
  decalQuad(decal, 'target', [TARGET.x0, 0.007, TARGET.z1], [1, 0, 0], [0, 0, -1], TARGET.x1 - TARGET.x0, TARGET.z1 - TARGET.z0, [0, 1, 0], 10, 5, [0.95, 0.95, 0.92]);
  // enamel signs
  decalQuad(decal, 'noSmoke', [-3.75, 1.62, HALL.z1 - 0.012], [-1, 0, 0], [0, 1, 0], 1.0, 0.25, [0, 0, -1], 2, 1);
  decalQuad(decal, 'lift', [SHAFT.x1 + 0.75, 1.72, HALL.z0 + 0.012], [1, 0, 0], [0, 1, 0], 1.0, 0.25, [0, 0, 1], 2, 1);
  BAYS.forEach((b, i) => {
    const x = b.side > 0 ? GAL.x1 - 0.012 : GAL.x0 + 0.012, u = b.side > 0 ? [0, 0, 1] : [0, 0, -1];
    const zc = b.z0 - 0.55, w = 0.52;
    decalQuad(decal, 'bay' + Math.min(3, i), [x, 1.9, zc - u[2] * w / 2], u, [0, 1, 0], w, 0.26, [-b.side, 0, 0]);
  });
  // chalk arrows "VÝTAH" pointing back toward the hall
  const arrows = [[1, 11.4], [1, 24.6], [-1, 18.3], [-1, 29.6], [-1, 4.0]];
  for (const [side, z] of arrows) {
    const x = side > 0 ? GAL.x1 - 0.012 : GAL.x0 + 0.012, u = side > 0 ? [0, 0, 1] : [0, 0, -1], w = 1.15;
    decalQuad(decal, side > 0 ? 'arrowL' : 'arrowR', [x, 1.32, z - u[2] * w / 2], u, [0, 1, 0], w, w / 4, [-side, 0, 0], 2, 1, [0.9, 0.9, 0.88]);
  }
  // cobwebs in vault corners: [corner point, dir A (texture u), dir B (texture -v), size]
  const webs = [];
  const add = (p, a, b, s, k) => webs.push({ p, a, b, s, k });
  for (const bay of BAYS) {
    const xb = bay.side > 0 ? bay.x1 - 0.02 : bay.x0 + 0.02, sx = -bay.side;
    add([xb, 2.38, bay.n0 + 0.02], [0, -0.35, 1], [sx, -0.35, 0], 0.75, 0);
    add([xb, 2.38, bay.n1 - 0.02], [sx, -0.35, 0], [0, -0.35, -1], 0.7, 1);
  }
  add([GAL.x0 + 0.02, 2.36, GAL.z1 - 0.02], [1, -0.3, 0], [0, -0.3, -1], 0.9, 0);
  add([GAL.x1 - 0.02, 2.36, GAL.z1 - 0.02], [0, -0.3, -1], [-1, -0.3, 0], 0.8, 1);
  add([HALL.x0 + 0.02, 2.96, HALL.z1 - 0.02], [0, -0.3, -1], [1, -0.3, 0], 0.85, 1);
  add([HALL.x1 - 0.02, 2.96, HALL.z1 - 0.02], [-1, -0.3, 0], [0, -0.3, -1], 0.7, 0);
  add([HALL.x1 - 0.02, 2.96, HALL.z0 + 0.02], [0, -0.3, 1], [-1, -0.3, 0], 0.9, 1);
  add([HALL.x0 + 0.02, 2.96, HALL.z0 + 0.02], [1, -0.3, 0], [0, -0.3, 1], 0.75, 0);
  for (const p of BLOCKS.filter((b) => b.kind === 'pillar')) {
    add([p.x1 + 0.01, 2.58, p.z0 - 0.01], [1, -0.4, 0], [0, -0.4, -1], 0.45, 0);
  }
  for (const w of webs) {
    const na = Math.hypot(...w.a), nb = Math.hypot(...w.b);
    const A = w.a.map((c) => c / na), B = w.b.map((c) => c / nb);
    const n = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
    const name = 'web' + w.k;
    // texture anchor: web0 top-left (u0, v1), web1 top-right (u1, v1)
    const [u0, v0, u1, v1] = decalUV(name);
    const ua = w.k ? u1 : u0, ub = w.k ? u0 : u1;
    const P = (s, t) => ({ x: w.p[0] + (A[0] * s + B[0] * t) * w.s, y: w.p[1] + (A[1] * s + B[1] * t) * w.s, z: w.p[2] + (A[2] * s + B[2] * t) * w.s, nx: n[0], ny: n[1], nz: n[2], u: ua + (ub - ua) * s, v: v1 + (v0 - v1) * t, c: [0.75, 0.75, 0.72], w: 0, ao: 1 });
    decal.quad(P(0, 0), P(1, 0), P(1, 1), P(0, 1));
  }
}
