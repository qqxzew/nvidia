// Level 2 cellar — floor / vault / wall shell generated from the region grid (owner: world).
import { VG, REG, FLO, ID, BAYS, GAL, HALL, PZ, SHAFT, ceilH, ceilCyl, arcH, gutterDepth, GUTTER, MB, fbm, noise3, lin, smooth } from './cellarGeo.js';
import { BLOCKS } from './layout.js';
import { BRICK_TILE, FLOOR_TILE } from './cellarTextures.js';

const FLOOR_SUB = 2;   // 0.25 m floor cells
const CEIL_SUB = 2;    // 0.25 m vault cells
const WALL_SUB = 2;    // 0.25 m wall columns (matches the vault edge)
const WALL_ROWS = 6;   // vertical subdivisions of a full-height wall
const C = VG.c;

const rubble = BLOCKS.find((b) => b.kind === 'rubble');
// bricked-up arch in the gallery end wall
export const END_ARCH = { x: (GAL.x0 + GAL.x1) / 2, y: 1.75, r: 1.55, ring: 0.34 };

// ------------------------------------------------------------------ albedo / whitewash functions
const BRICK_BASE = lin(0xffffff);
function brickTint(x, y, z, id, kind) {
  const n1 = fbm(x * 0.45 + 3.1, y * 0.45, z * 0.45, 3), n2 = noise3(x * 1.7, y * 1.7 + 9, z * 1.7);
  let k = 0.78 + 0.4 * n1;
  // soot creeping up the walls and over the vault
  const soot = smooth(1.6, 4.2, y) * (0.45 + 0.35 * n2);
  k *= 1 - soot * 0.75;
  // rising damp: darker, a bit greenish band near the floor
  const dampTop = 0.45 + 0.5 * fbm(x * 0.8, 0, z * 0.8, 2);
  const damp = 1 - smooth(dampTop - 0.15, dampTop + 0.1, y);
  let r = BRICK_BASE[0] * k, g = BRICK_BASE[1] * k, b = BRICK_BASE[2] * k;
  r *= 1 - damp * 0.42; g *= 1 - damp * 0.3; b *= 1 - damp * 0.32;
  if (id >= ID.BAY0) { r *= 0.86; g *= 0.84; b *= 0.82; }   // bays: older, darker
  if (kind === 'infill') { r *= 1.25; g *= 1.4; b *= 1.5; }   // newer, paler bricks
  if (kind === 'shaft') { r *= 0.85; g *= 0.85; b *= 0.85; }
  return [r, g, b];
}
function whitewash(x, y, z, id, kind) {
  const n = fbm(x * 0.32 + 11, y * 0.5, z * 0.32, 3);
  let base;
  if (kind === 'vault') base = id === ID.HALL ? 0.22 : id === ID.GAL ? 0.14 : 0.04;
  else if (kind === 'pillar') base = 0.62;
  else if (kind === 'infill' || kind === 'shaft') base = 0.05;
  else base = id === ID.HALL ? 0.5 : id === ID.GAL ? 0.42 : 0.2;
  let w = base + (n - 0.5) * 0.45;
  if (kind !== 'vault') w -= smooth(1.9, 3.2, y) * 0.35;                 // lime brushed only to reach height
  w -= (1 - smooth(0.2, 0.9, y)) * 0.25;                                   // peeled by damp at the foot
  w += Math.max(0, 0.25 - Math.abs(y - 0.8)) * 1.2 * noise3(x * 2, 3, z * 2); // salt bloom
  return Math.max(0, Math.min(1, w));
}
function floorTint(x, z, id) {
  const n = fbm(x * 0.35, 1.7, z * 0.35, 3), m = noise3(x * 1.3, 5, z * 1.3);
  let k = 0.72 + 0.45 * n;
  if (id >= ID.BAY0) k *= 0.82;
  if (id === ID.LIFT) k *= 0.7;
  k *= 0.9 + 0.2 * m;
  return [k, k * 0.97, k * 0.93];
}
function wetness(x, z, id) {
  let w = 0.25 + 0.55 * smooth(0.45, 0.75, fbm(x * 0.22 + 4, 2.2, z * 0.22, 3));
  if (id === ID.GAL) w += 0.5 * Math.max(0, 1 - Math.abs(x - GUTTER.x) / 0.6);
  if (id >= ID.BAY0) w += 0.1;
  return Math.min(1, w);
}

// ------------------------------------------------------------------ build
/** returns { brick: MB, floor: MB } filled with the shell */
export function buildShell(brick, floor) {
  const nx = VG.nx, nz = VG.nz;
  const reg = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz ? 0 : REG[j * nx + i]);
  const flo = (i, j) => FLO[j * nx + i];

  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const id = reg(i, j);
      if (!id) continue;
      const x0 = VG.x0 + i * C, z0 = VG.z0 + j * C, fy = flo(i, j);
      // ---------------- floor
      const fv = (x, z) => {
        const y = fy - (id === ID.GAL ? gutterDepth(x, z) : 0);
        return { x, y, z, nx: 0, ny: 1, nz: 0, u: x / FLOOR_TILE, v: -z / FLOOR_TILE, c: floorTint(x, z, id), w: wetness(x, z, id) };
      };
      // fine floor only along the gutter; elsewhere 0.5 m is plenty for the high bulbs
      const fsub = id === ID.GAL && Math.abs(x0 + C / 2 - GUTTER.x) < 0.6 ? FLOOR_SUB : 1;
      const fs = C / fsub;
      for (let a = 0; a < fsub; a++) for (let b = 0; b < fsub; b++) {
        const xa = x0 + a * fs, xb = xa + fs, za = z0 + b * fs, zb = za + fs;
        floor.quad(fv(xa, za), fv(xa, zb), fv(xb, zb), fv(xb, za), [0, 1, 0]);
      }
      // ---------------- vault
      // subdivide only cells crossed by a vault intersection (lunette crease) or the hall arcade valley
      const cA = ceilCyl(id, x0 + 0.01, z0 + 0.01), cB = ceilCyl(id, x0 + C - 0.01, z0 + C - 0.01), cC = ceilCyl(id, x0 + 0.01, z0 + C - 0.01), cD = ceilCyl(id, x0 + C - 0.01, z0 + 0.01);
      const crease = cA && (cA.a !== cB.a || cA.a !== cC.a || cA.a !== cD.a);
      const csub = crease ? CEIL_SUB : 1, cs = C / csub;
      for (let a = 0; a < csub; a++) for (let b = 0; b < csub; b++) {
        const xa = x0 + a * cs, xb = xa + cs, za = z0 + b * cs, zb = za + cs;
        const cyl = ceilCyl(id, (xa + xb) / 2, (za + zb) / 2);
        const cv = (x, z) => {
          const y = ceilH(id, x, z);
          let n = [0, -1, 0], u = x, v = z;
          if (cyl) {
            const A = cyl.a;
            if (cyl.ax === 'x') { // vault running along x, profile across z
              const yc = arcH(A, z); n = [0, A.y0 - yc, A.c - z]; u = x; v = A.c + A.R * Math.asin(Math.max(-1, Math.min(1, (z - A.c) / A.R)));
            } else {
              const yc = arcH(A, x); n = [A.c - x, A.y0 - yc, 0]; u = z; v = A.c + A.R * Math.asin(Math.max(-1, Math.min(1, (x - A.c) / A.R)));
            }
            const l = Math.hypot(n[0], n[1], n[2]); n = [n[0] / l, n[1] / l, n[2] / l];
          }
          let kind = 'vault', ao = 1;
          if (id === ID.LIFT) kind = 'shaft';
          // collapsed patch above the rubble
          if (id === ID.GAL && rubble && x < rubble.x1 + 0.3 && z > rubble.z0 - 0.6) ao = 0.5;
          return { x, y, z, nx: n[0], ny: n[1], nz: n[2], u: u / BRICK_TILE, v: v / BRICK_TILE, c: brickTint(x, y, z, id, kind), w: whitewash(x, y, z, id, kind), ao };
        };
        brick.quad(cv(xa, za), cv(xb, za), cv(xb, zb), cv(xa, zb), [0, -1, 0]);
      }
      // ---------------- walls & steps toward the 4 neighbours
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nid = reg(i + di, j + dj);
        if (nid === id && (nid === 0 || flo(i + di, j + dj) === fy)) continue;
        // edge endpoints
        let ex0, ez0, ex1, ez1;
        if (di === 1) { ex0 = ex1 = x0 + C; ez0 = z0; ez1 = z0 + C; }
        else if (di === -1) { ex0 = ex1 = x0; ez0 = z0; ez1 = z0 + C; }
        else if (dj === 1) { ez0 = ez1 = z0 + C; ex0 = x0; ex1 = x0 + C; }
        else { ez0 = ez1 = z0; ex0 = x0; ex1 = x0 + C; }
        const fn = [-di, 0, -dj];           // into this cell
        // sample along the edge slightly inside each region so ceilH picks the right side's function
        const eps = 1e-4;
        const tops = [], bots = [], pts = [];
        for (let s = 0; s <= WALL_SUB; s++) {
          const t = s / WALL_SUB, x = ex0 + (ex1 - ex0) * t, z = ez0 + (ez1 - ez0) * t;
          pts.push([x, z]);
          tops.push(ceilH(id, x - di * eps, z - dj * eps));
          bots.push(nid ? ceilH(nid, x + di * eps, z + dj * eps) : null);
        }
        if (!nid) {
          wallStrip(brick, pts, tops.map(() => fy), tops, fn, id, WALL_ROWS);
        } else {
          // ceiling step: visible from this side where our vault is higher
          const lo = bots.map((b, k) => Math.min(b, tops[k]));
          if (tops.some((t, k) => t - lo[k] > 1e-3)) wallStrip(brick, pts, lo, tops, fn, id, 2);
          // floor step (dock front / lift sill): visible from the lower side
          const nfy = flo(i + di, j + dj);
          if (nfy > fy + 1e-3) stepStrip(floor, pts, fy, nfy, fn, id);
        }
      }
    }
  }
}

function wallKind(x, y, z, id, fn) {
  if (id === ID.LIFT) return 'shaft';
  // pillar faces
  for (const b of BLOCKS) if (b.kind === 'pillar' && x >= b.x0 - 0.01 && x <= b.x1 + 0.01 && z >= b.z0 - 0.01 && z <= b.z1 + 0.01) return 'pillar';
  if (id === ID.GAL && fn[2] < -0.5) { // end wall facing -z
    const dx = x - END_ARCH.x, dy = Math.max(0, y - END_ARCH.y);
    const inArch = (y < END_ARCH.y && Math.abs(dx) < END_ARCH.r) || Math.hypot(dx, dy) < END_ARCH.r;
    if (inArch) return 'infill';
  }
  return 'wall';
}

function wallStrip(mb, pts, bots, tops, fn, id, rows) {
  const horiz = Math.abs(fn[0]) > 0.5 ? 'z' : 'x';
  for (let s = 0; s < pts.length - 1; s++) {
    const col = [];
    for (const k of [s, s + 1]) {
      const [x, z] = pts[k];
      const arr = [];
      for (let r = 0; r <= rows; r++) {
        const y = bots[k] + (tops[k] - bots[k]) * (r / rows);
        const u = (horiz === 'z' ? z : x) * (horiz === 'z' ? -fn[0] : fn[2]);
        const kind = wallKind(x, y, z, id, fn);
        // AO: darker at the foot and under the springing
        arr.push({ x, y, z, nx: fn[0], ny: 0, nz: fn[2], u: u / BRICK_TILE, v: y / BRICK_TILE, c: brickTint(x, y, z, id, kind), w: whitewash(x, y, z, id, kind), ao: 1 });
      }
      col.push(arr);
    }
    for (let r = 0; r < rows; r++) {
      const a = col[0][r], b = col[1][r], c = col[1][r + 1], d = col[0][r + 1];
      if (Math.abs(a.y - d.y) < 1e-4 && Math.abs(b.y - c.y) < 1e-4) continue;
      mb.quad(a, b, c, d, fn);
    }
  }
}
function stepStrip(mb, pts, y0, y1, fn, id) {
  for (let s = 0; s < pts.length - 1; s++) {
    const [xa, za] = pts[s], [xb, zb] = pts[s + 1];
    const mk = (x, y, z) => ({ x, y, z, nx: fn[0], ny: 0, nz: fn[2], u: (x + z) / FLOOR_TILE, v: y / FLOOR_TILE + 0.37, c: [0.62, 0.6, 0.57], w: 0.3, ao: 1 });
    mb.quad(mk(xa, y0, za), mk(xb, y0, zb), mk(xb, y1, zb), mk(xa, y1, za), fn);
  }
}
