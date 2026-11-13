// Level 3 "Gangsteři ve Světovaru" — the night interior of the Světovar brewhouse ground floor (ca. 1930).
// Owned by "landmarks". Contract: docs/LEVEL3.md → buildHall(ctx) (v2 block).
//
// Restyled after the archive photos (docs/reference/indoor/): whitewashed plaster walls over a glazed-tile
// dado with a painted meander frieze, pilasters, tall rectangular iron windows with many small panes,
// whitewashed vaults between steel beams, a travelling crane, a tiled floor. The front half of the hall
// (the arena x ∈ [-10.4, 10.4], z ∈ [-8.4, -1.8]) is kept clear except the 10 stealable barrels lying on
// chocks; the back half holds the decor: a pyramid wall of barrels, a barrel conveyor, a steam engine with
// a turning flywheel, a marble gauge board, a workbench, sacks, a sack truck, a copper kettle bottom.
// Outside: cobbled yard, moonlit night sky, silhouettes of the brewery, a yard gas lamp.
//
// Draw calls ≈ 26 (+ shadow pass for casters), triangles ≈ 35 k.
import * as THREE from 'three';
import { getKit, Builder, rng, M4 } from '../../world/landmarkUtils.js';
import { createBarrelMesh } from '../../vehicle/truckModel.js';

// ---------------------------------------------------------------------------------------------
// layout constants (see docs/LEVEL3.md)
// ---------------------------------------------------------------------------------------------
const X0 = -11, X1 = 11, Z0 = -9, Z1 = 7;
const CEIL = 6.5, WT = 0.6, WALL_H = 7.2;
const WR = 0.8, SILL = 0.9, TOP = 3.6, GLASS_D = 0.3;
const DADO = 1.35, FR0 = 4.3, FR1 = 4.6;            // tiled dado top, painted frieze band
const PL_S = 2.0, STRIP_S = 2.0, FLOOR_S = 1.2, YARD_S = 4.0;
const PLAYER = new THREE.Vector3(0, 1.65, -1);

// wall frames: local +X along the wall, local +Z = outward, inner face at local z = 0.
const WALLS = {
  front: { x: 0, z: Z0, rot: Math.PI, u0: X0, u1: X1, wide: true, pil: [-5.4, 5.4] },        // u = -x
  back: { x: 0, z: Z1, rot: 0, u0: X0, u1: X1, wide: true, pil: [-5.4, 5.4] },               // u = x
  left: { x: X0, z: 0, rot: -Math.PI / 2, u0: Z0, u1: Z1, pil: [-7.4, -3, 4] },             // u = z
  right: { x: X1, z: 0, rot: Math.PI / 2, u0: -Z1, u1: -Z0, pil: [7.4, 3, -4] },            // u = -z
};
// [id, wall, u]; order F0..F4, L0, L1, R0, R1
const WINDOW_DEFS = [
  ['F0', 'front', 7.2], ['F1', 'front', 3.6], ['F2', 'front', 0], ['F3', 'front', -3.6], ['F4', 'front', -7.2],
  ['L0', 'left', -5], ['L1', 'left', -1], ['R0', 'right', 5], ['R1', 'right', 1],
];

const C = {
  plaster: 0xf2eee6, pilaster: 0xf7f4ee, reveal: 0xe4ddd0, vault: 0xe9e4da, stucco: 0xa69683, stuccoLow: 0x7a6d60,
  iron: 0x3d4043, castIron: 0x3a4540, crane: 0x4a4f4a, copper: 0xb4693c, copperDark: 0x8d4d2c, stone: 0xa8a296,
  concrete: 0x9a958c, wood: 0x6e4f33, woodDark: 0x463222, woodLight: 0x8f6a45, burlap: 0xa48c63,
  enamelOut: 0x2d4b3b, enamelIn: 0xefe8d8, cord: 0x161616, engine: 0x2b3530, brass: 0xb08d3e,
};

// moon: light direction (towards the moon) — from beyond the front wall, up-left; elevation ≈ 28°
const MOON_DIR = new THREE.Vector3(-0.3, 0, -0.954).normalize().multiplyScalar(Math.cos(0.49)).setY(Math.sin(0.49)).normalize();
// the visible moon disk sits low in the sky, framed by window F1 (artistic licence vs. the light)
const MOON_VIS = new THREE.Vector3(-3.6, 3.0, -9).sub(PLAYER).normalize();

// strip texture layout (v ranges, canvas flipY): frieze on top, gauge board in the middle, dado at the bottom
const SV = { fr0: 0.846, fr1: 0.998, gb0: 0.4375, gb1: 0.8125, da0: 0.002, da1: 0.404 };

// ---------------------------------------------------------------------------------------------
// procedural textures (shared, lazily created)
// ---------------------------------------------------------------------------------------------
let TEX = null;
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function canvasTex(cv, { s = false, t = false, aniso = 1 } = {}) {
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.generateMipmaps = true;
  tx.minFilter = THREE.LinearMipmapLinearFilter;
  tx.anisotropy = aniso;
  if (s) tx.wrapS = THREE.RepeatWrapping;
  if (t) tx.wrapT = THREE.RepeatWrapping;
  return tx;
}

/** Whitewashed lime plaster, mottled and stained. 512 px = 2 m. */
function paintPlaster() {
  const S = 512, cv = mkCanvas(S, S), g = cv.getContext('2d'), R = rng(1930);
  g.fillStyle = '#e8e3d8'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = R() * S, y = R() * S, r = 20 + R() * 70;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      const dark = R() < 0.6;
      gr.addColorStop(0, dark ? `rgba(120,108,90,${0.03 + R() * 0.05})` : `rgba(255,253,246,${0.04 + R() * 0.05})`);
      gr.addColorStop(1, 'rgba(120,108,90,0)');
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
    }
  }
  for (let i = 0; i < 3200; i++) {
    g.fillStyle = R() < 0.55 ? `rgba(80,70,55,${R() * 0.1})` : `rgba(255,255,250,${R() * 0.12})`;
    g.fillRect(R() * S, R() * S, 1 + R() * 2.5, 1 + R() * 2.5);
  }
  g.strokeStyle = 'rgba(90,80,65,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    let x = R() * S, y = R() * S; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 30; y += R() * 22; g.lineTo(x, y); }
    g.stroke();
  }
  return cv;
}

/** 512 × 1024: painted meander frieze (top), marble gauge board (middle), glazed-tile dado (bottom). */
function paintStrip() {
  const W = 512, H = 1024, cv = mkCanvas(W, H), g = cv.getContext('2d'), R = rng(31);
  g.fillStyle = '#e8e3d8'; g.fillRect(0, 0, W, H);
  // --- frieze: canvas rows 0..160 (0.3 m tall, 2 m wide)
  {
    const y0 = 2, h = 156;
    g.fillStyle = '#e6e0d3'; g.fillRect(0, y0, W, h);
    g.fillStyle = '#7a4d33'; g.fillRect(0, y0 + 10, W, 7); g.fillRect(0, y0 + h - 17, W, 7);
    g.fillStyle = '#4f6b5a'; g.fillRect(0, y0 + 22, W, 3); g.fillRect(0, y0 + h - 25, W, 3);
    // greek key (meander), period 64 px
    g.strokeStyle = '#8a5a3a'; g.lineWidth = 7; g.lineCap = 'square';
    const top = y0 + 40, bot = y0 + h - 40, m = (top + bot) / 2;
    for (let x = -64; x < W + 64; x += 64) {
      g.beginPath();
      g.moveTo(x, bot); g.lineTo(x, top); g.lineTo(x + 44, top); g.lineTo(x + 44, bot - 16); g.lineTo(x + 18, bot - 16);
      g.lineTo(x + 18, m - 6); g.lineTo(x + 30, m - 6);
      g.moveTo(x, bot); g.lineTo(x + 64, bot);
      g.stroke();
    }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(90,75,55,${R() * 0.12})`; g.fillRect(R() * W, y0 + R() * h, 2, 2); }
  }
  // --- gauge board: canvas rows 192..576
  {
    const x0 = 0, y0 = 192, w = 512, h = 384;
    g.fillStyle = '#ddd8cc'; g.fillRect(x0, y0, w, h);
    for (let i = 0; i < 26; i++) {                                    // marble veins
      g.strokeStyle = `rgba(110,110,105,${0.08 + R() * 0.12})`; g.lineWidth = 1 + R() * 1.5;
      let x = R() * w, y = y0 + R() * h; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (R() - 0.3) * 60; y += (R() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = '#2b2b28'; g.lineWidth = 10; g.strokeRect(x0 + 5, y0 + 5, w - 10, h - 10);
    g.strokeStyle = '#6d6a62'; g.lineWidth = 2; for (const xx of [170, 342]) { g.beginPath(); g.moveTo(xx, y0 + 12); g.lineTo(xx, y0 + h - 12); g.stroke(); }
    const dial = (cx, cy, r) => {
      g.fillStyle = '#1e1d1b'; g.beginPath(); g.arc(cx, cy, r + 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f3efe4'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#222'; g.lineWidth = 1.5;
      for (let k = 0; k <= 8; k++) { const a = Math.PI * 0.75 + (k / 8) * Math.PI * 1.5; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); g.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); g.stroke(); }
      const a = Math.PI * 0.75 + R() * Math.PI * 1.5;
      g.strokeStyle = '#a3241c'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); g.stroke();
    };
    for (const cx of [85, 256, 427]) { dial(cx - 38, y0 + 70, 26); dial(cx + 38, y0 + 70, 26); }
    dial(256, y0 + 150, 34);
    // brass plates + knife switches
    for (const cx of [85, 256, 427]) {
      g.fillStyle = '#b8954a'; g.fillRect(cx - 50, y0 + 112, 100, 14);
      for (let k = -1; k <= 1; k++) {
        const sx = cx + k * 30, sy = y0 + 220;
        g.fillStyle = '#2a2826'; g.fillRect(sx - 9, sy, 18, 70);
        g.fillStyle = '#b07a3a'; g.fillRect(sx - 3, sy - 18, 6, 50);
        g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(sx, sy - 20, 6, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#3a3734'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx - 36 + k * 24, y0 + 330, 6, 0, Math.PI * 2); g.fill(); }
    }
  }
  // --- dado: canvas rows 608..1024 (1.35 m tall), cream glazed tiles under a dark green border
  {
    const y0 = 610, h = 1024 - y0;
    g.fillStyle = '#9c9484'; g.fillRect(0, y0, W, h);
    g.fillStyle = '#2f4a3b'; g.fillRect(0, y0, W, 22);
    g.fillStyle = '#c9c1ae'; g.fillRect(0, y0 + 22, W, 5);
    const rows = 10, th = (h - 30) / rows, cols = 12, tw = W / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const v = 0.93 + R() * 0.08;
      g.fillStyle = `rgb(${Math.round(226 * v)},${Math.round(219 * v)},${Math.round(200 * v)})`;
      g.fillRect(c * tw + 1.5, y0 + 30 + r * th + 1.5, tw - 3, th - 3);
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(c * tw + 4, y0 + 33 + r * th, tw * 0.4, 3);
    }
    const gr = g.createLinearGradient(0, y0 + h * 0.6, 0, H);
    gr.addColorStop(0, 'rgba(70,60,45,0)'); gr.addColorStop(1, 'rgba(70,60,45,0.28)');
    g.fillStyle = gr; g.fillRect(0, y0, W, h);
  }
  return cv;
}

/** Small grey / cream floor tiles (15 cm) in a checker, worn. 512 px = 1.2 m. */
function paintFloor() {
  const S = 512, cv = mkCanvas(S, S), g = cv.getContext('2d'), R = rng(77);
  const n = 8, t = S / n;
  g.fillStyle = '#4a443c'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const base = (i + j) % 2 ? [196, 189, 172] : [132, 124, 110];
    const v = 0.9 + R() * 0.14;
    g.fillStyle = `rgb(${Math.round(base[0] * v)},${Math.round(base[1] * v)},${Math.round(base[2] * v)})`;
    g.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
  }
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = R() < 0.6 ? `rgba(30,22,15,${R() * 0.2})` : `rgba(255,248,230,${R() * 0.1})`;
    g.fillRect(R() * S, R() * S, 1 + R() * 2.5, 1 + R() * 2.5);
  }
  for (let i = 0; i < 5; i++) {
    const x = R() * S, y = R() * S, r = 30 + R() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(40,32,22,0.16)'); gr.addColorStop(1, 'rgba(40,32,22,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  return cv;
}

/** Old factory glass: faint, streaky, grimy towards the bottom. */
function paintGlass() {
  const S = 128, cv = mkCanvas(S, S), g = cv.getContext('2d'), R = rng(3);
  g.fillStyle = 'rgba(235,242,248,0.24)'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) { g.fillStyle = `rgba(${200 + R() * 40},${205 + R() * 40},${210 + R() * 40},${0.05 + R() * 0.1})`; g.fillRect(R() * S, 0, 1 + R() * 2, S); }
  const gr = g.createLinearGradient(0, 0, 0, S);
  gr.addColorStop(0, 'rgba(120,118,105,0)'); gr.addColorStop(1, 'rgba(110,104,90,0.3)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.save(); g.translate(S / 2, S / 2); g.rotate(-0.6);
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(-S, -14, 2 * S, 10); g.fillRect(-S, 6, 2 * S, 4);
  g.restore();
  return cv;
}

/** Radial crack web with a white impact star, on a transparent canvas (centre = impact). */
function paintCrack() {
  const S = 512, cv = mkCanvas(S, S), g = cv.getContext('2d'), R = rng(808);
  const c = S / 2;
  g.clearRect(0, 0, S, S);
  const star = g.createRadialGradient(c, c, 0, c, c, 46);
  star.addColorStop(0, 'rgba(255,255,255,0.95)'); star.addColorStop(0.35, 'rgba(240,250,250,0.45)'); star.addColorStop(1, 'rgba(240,250,250,0)');
  g.fillStyle = star; g.fillRect(c - 46, c - 46, 92, 92);
  const N = 13, rays = [];
  for (let k = 0; k < N; k++) {
    const a0 = (k / N) * Math.PI * 2 + (R() - 0.5) * 0.35, len = 150 + R() * 100, pts = [[c, c]];
    let a = a0, x = c, y = c;
    for (let s = 1; s <= 7; s++) { a += (R() - 0.5) * 0.35; const r = (len * s) / 7; x = c + Math.cos(a) * r; y = c + Math.sin(a) * r; pts.push([x, y]); }
    rays.push(pts);
  }
  const stroke = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.stroke(); };
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const p of rays) { stroke(p, 3.2, 'rgba(20,30,35,0.35)'); stroke(p, 1.6, 'rgba(255,255,255,0.9)'); }
  // concentric rings joining neighbouring rays
  for (const ring of [1, 2, 4]) {
    for (let k = 0; k < N; k++) {
      if (R() < 0.25) continue;
      const a = rays[k][ring], b = rays[(k + 1) % N][ring];
      const m = [(a[0] + b[0]) / 2 + (R() - 0.5) * 14, (a[1] + b[1]) / 2 + (R() - 0.5) * 14];
      stroke([a, m, b], 2.4, 'rgba(20,30,35,0.25)'); stroke([a, m, b], 1.1, 'rgba(255,255,255,0.75)');
    }
  }
  // fine splinters near the centre
  for (let k = 0; k < 40; k++) {
    const a = R() * Math.PI * 2, r0 = 10 + R() * 40, r1 = r0 + 6 + R() * 18;
    stroke([[c + Math.cos(a) * r0, c + Math.sin(a) * r0], [c + Math.cos(a + 0.1) * r1, c + Math.sin(a + 0.1) * r1]], 1, 'rgba(255,255,255,0.7)');
  }
  return cv;
}

function paintGlow() {
  const S = 128, cv = mkCanvas(S, S), g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return cv;
}

function getTex3(renderer) {
  if (TEX) return TEX;
  const aniso = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  TEX = {
    plaster: canvasTex(paintPlaster(), { s: true, t: true, aniso }),
    strip: canvasTex(paintStrip(), { s: true, aniso }),
    floor: canvasTex(paintFloor(), { s: true, t: true, aniso }),
    glass: canvasTex(paintGlass()),
    glow: canvasTex(paintGlow()),
    crack: canvasTex(paintCrack()),
  };
  return TEX;
}

// ---------------------------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------------------------
/** Planar polygon (3 or 4 points) with explicit uvs; winding is flipped if needed so the normal matches `nrm`. */
function face(b, pts, uvs, color, nrm) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  if (nx * nrm[0] + ny * nrm[1] + nz * nrm[2] < 0) { pts = pts.slice().reverse(); uvs = uvs.slice().reverse(); }
  b.tri(pts[0], pts[1], pts[2], color, uvs[0], uvs[1], uvs[2]);
  if (pts.length === 4) b.tri(pts[0], pts[2], pts[3], color, uvs[0], uvs[2], uvs[3]);
}
const uvXY = (s) => (p) => [p[0] / s, p[1] / s];
const uvXZ = (s) => (p) => [p[0] / s, p[2] / s];
const uvZY = (s) => (p) => [p[2] / s, p[1] / s];
function faceUV(b, pts, mapper, color, nrm) { face(b, pts, pts.map(mapper), color, nrm); }

const _up = new THREE.Vector3(0, 1, 0);
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vd = new THREE.Vector3();
const _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
function between(a, c) {
  _va.set(a[0], a[1], a[2]); _vb.set(c[0], c[1], c[2]);
  _vd.subVectors(_vb, _va); const len = _vd.length(); _vd.divideScalar(len || 1);
  _q.setFromUnitVectors(_up, _vd);
  const m = new THREE.Matrix4().compose(_va.clone().add(_vb).multiplyScalar(0.5), _q, _one);
  return { m, len };
}
function cylBetween(b, a, c, r, color, seg = 8, open = true) {
  const { m, len } = between(a, c);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
  b.add(g, m, color); g.dispose();
}
function barBetween(b, a, c, t, color) {
  const { m, len } = between(a, c);
  const g = new THREE.BoxGeometry(t, len, t);
  b.add(g, m, color); g.dispose();
}
function addGeo(b, g, m, color) { b.add(g, m, color); g.dispose(); }
function pipeRun(b, pts, r, color, joint = C.copperDark) {
  for (let i = 0; i < pts.length - 1; i++) cylBetween(b, pts[i], pts[i + 1], r, color);
  for (let i = 1; i < pts.length - 1; i++) addGeo(b, new THREE.SphereGeometry(r * 1.2, 8, 6), M4(...pts[i]), joint);
  for (const p of [pts[0], pts[pts.length - 1]]) addGeo(b, new THREE.SphereGeometry(r * 1.05, 8, 4), M4(...p), joint);
}
/** Turn a geometry inside out (for the white inside of the enamel shades). */
function flipped(g) {
  const ng = g.index ? g.toNonIndexed() : g.clone();
  const pos = ng.attributes.position, nor = ng.attributes.normal;
  for (let i = 0; i < pos.count; i += 3) {
    for (const a of [pos, nor]) {
      const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2)); a.setXYZ(i + 2, x, y, z);
    }
  }
  for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
  return ng;
}
function shaded(color, n) {
  const k = 0.68 + 0.5 * Math.max(0, n[0] * MOON_DIR.x + n[1] * MOON_DIR.y + n[2] * MOON_DIR.z);
  return new THREE.Color(color).multiplyScalar(k);
}

/** Lying barrel = createBarrelMesh (axis local Y) with rotation.z = π/2 (axis → local X, bung up), then
 *  rotation.y = yaw — i.e. Euler(0, yaw, π/2, 'XYZ'), same as the gangsters' carried barrel. */
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _zAxis = new THREE.Vector3(0, 0, 1);
function barrelQuat(yaw, out = new THREE.Quaternion()) {
  _qa.setFromAxisAngle(_up, yaw);
  _qb.setFromAxisAngle(_zAxis, Math.PI / 2);
  return out.copy(_qa).multiply(_qb);
}

// ---------------------------------------------------------------------------------------------
// walls: plaster (plB) above a tiled dado + painted frieze (stB), rectangular window openings
// ---------------------------------------------------------------------------------------------
/** Emit an inner-face rectangle split into dado / plaster / frieze / plaster bands. */
function bandRect(plB, stB, u0, u1, y0, y1, w, n) {
  if (u1 - u0 < 1e-4) return;
  const bands = [[0, DADO, 'da'], [DADO, FR0, 'pl'], [FR0, FR1, 'fr'], [FR1, WALL_H, 'pl']];
  for (const [b0, b1, kind] of bands) {
    const a = Math.max(y0, b0), c = Math.min(y1, b1);
    if (c - a < 1e-4) continue;
    const pts = [[u0, a, w], [u1, a, w], [u1, c, w], [u0, c, w]];
    if (kind === 'pl') { faceUV(plB, pts, uvXY(PL_S), C.plaster, n); continue; }
    const v = kind === 'da' ? (y) => SV.da0 + (y / DADO) * (SV.da1 - SV.da0) : (y) => SV.fr0 + ((y - FR0) / (FR1 - FR0)) * (SV.fr1 - SV.fr0);
    face(stB, pts, pts.map((p) => [p[0] / STRIP_S, v(p[1])]), 0xffffff, n);
  }
}

function buildWall(plB, stB, def, opens) {
  plB.at(def.x, def.z, def.rot); stB.at(def.x, def.z, def.rot);
  const ext = def.wide ? WT : 0;
  const o0 = def.u0 - ext, o1 = def.u1 + ext;
  const IN = [0, 0, -1], OUT = [0, 0, 1];
  const sorted = opens.slice().sort((a, c) => a - c);
  const pl = (pts, map, col, n) => faceUV(plB, pts, map, col, n);
  const rectP = (u0, u1, v0, v1, w, n, col) => { if (u1 - u0 > 1e-4 && v1 - v0 > 1e-4) pl([[u0, v0, w], [u1, v0, w], [u1, v1, w], [u0, v1, w]], uvXY(PL_S), col, n); };

  // inner face
  let cur = def.u0;
  for (const c of sorted) {
    bandRect(plB, stB, cur, c - WR, 0, WALL_H, 0, IN);
    bandRect(plB, stB, c - WR, c + WR, 0, SILL, 0, IN);
    bandRect(plB, stB, c - WR, c + WR, TOP, WALL_H, 0, IN);
    cur = c + WR;
  }
  bandRect(plB, stB, cur, def.u1, 0, WALL_H, 0, IN);

  // pilasters (0.8 wide, 0.12 proud) carrying the dado and the frieze around them
  for (const p of def.pil || []) {
    const a = p - 0.4, c = p + 0.4, w = -0.12;
    bandRect(plB, stB, a, c, 0, CEIL, w, IN);
    for (const [u, n] of [[a, [-1, 0, 0]], [c, [1, 0, 0]]]) {
      pl([[u, 0, w], [u, 0, 0], [u, CEIL, 0], [u, CEIL, w]], uvZY(PL_S), C.pilaster, n);
    }
  }

  // outer face (old stucco)
  cur = o0;
  const outCol = (a, c, v0, v1) => { rectP(a, c, v0, Math.min(v1, 0.6), WT, OUT, C.stuccoLow); rectP(a, c, Math.max(v0, 0.6), v1, WT, OUT, C.stucco); };
  for (const c of sorted) {
    outCol(cur, c - WR, 0, WALL_H);
    outCol(c - WR, c + WR, 0, SILL);
    outCol(c - WR, c + WR, TOP, WALL_H);
    cur = c + WR;
  }
  outCol(cur, o1, 0, WALL_H);

  // reveals: jambs + lintel soffit (plastered)
  for (const c of sorted) {
    pl([[c - WR, SILL, 0], [c - WR, SILL, WT], [c - WR, TOP, WT], [c - WR, TOP, 0]], uvZY(PL_S), C.reveal, [1, 0, 0]);
    pl([[c + WR, SILL, 0], [c + WR, SILL, WT], [c + WR, TOP, WT], [c + WR, TOP, 0]], uvZY(PL_S), C.reveal, [-1, 0, 0]);
    pl([[c - WR, TOP, 0], [c + WR, TOP, 0], [c + WR, TOP, WT], [c - WR, TOP, WT]], uvXZ(PL_S), C.reveal, [0, -1, 0]);
  }

  // top cap + end caps
  pl([[o0, WALL_H, 0], [o1, WALL_H, 0], [o1, WALL_H, WT], [o0, WALL_H, WT]], uvXZ(PL_S), C.stucco, [0, 1, 0]);
  if (def.wide) {
    for (const [u, n] of [[o0, [-1, 0, 0]], [o1, [1, 0, 0]]]) pl([[u, 0, 0], [u, 0, WT], [u, WALL_H, WT], [u, WALL_H, 0]], uvZY(PL_S), C.stucco, n);
  }
  plB.reset(); stB.reset();
}

// ---------------------------------------------------------------------------------------------
// buildHall
// ---------------------------------------------------------------------------------------------
export function buildHall(ctx) {
  const { scene, renderer } = ctx;
  const high = ctx.quality !== 'low';
  const kit = getKit(ctx);
  const tex = getTex3(renderer);
  const R = rng(1929);

  const root = new THREE.Group();
  root.name = 'hall';
  scene.add(root);

  const mats = {
    plaster: new THREE.MeshLambertMaterial({ map: tex.plaster, vertexColors: true }),
    strip: new THREE.MeshLambertMaterial({ map: tex.strip, vertexColors: true }),
    floor: new THREE.MeshLambertMaterial({ map: tex.floor, vertexColors: true }),
    glass: new THREE.MeshLambertMaterial({ color: 0xa9bccb, map: tex.glass, transparent: true, depthWrite: false, side: THREE.DoubleSide, emissive: 0x0c1422 }),
    shard: new THREE.MeshStandardMaterial({ color: 0xcdeee6, roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false, emissive: 0x1d3a36, emissiveIntensity: 0.7 }),
    crack: new THREE.MeshBasicMaterial({ map: tex.crack, color: 0xeaf6f4, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    sky: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }),
    backdrop: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }),
    shaft: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffe3ad }),
  };
  mats.bulbFlicker = mats.bulb.clone();
  for (const [k, m] of Object.entries(mats)) m.name = 'hall-' + k;

  // -------------------------------------------------------------------- walls + vaulted ceiling
  const plB = new Builder(kit), stB = new Builder(kit);
  const opensByWall = { front: [], back: [], left: [], right: [] };
  for (const [, wall, u] of WINDOW_DEFS) opensByWall[wall].push(u);
  for (const k of Object.keys(WALLS)) buildWall(plB, stB, WALLS[k], opensByWall[k]);

  const BEAMS_Z = [-9, -7, -5, -3, -1, 1, 3, 5, 7];
  for (let i = 0; i < BEAMS_Z.length - 1; i++) {
    const za = BEAMS_Z[i], zb = BEAMS_Z[i + 1], S = 5;
    for (let s = 0; s < S; s++) {
      const t0 = s / S, t1 = (s + 1) / S;
      const y0 = CEIL + 0.24 * Math.sin(Math.PI * t0), y1 = CEIL + 0.24 * Math.sin(Math.PI * t1);
      const z0 = za + (zb - za) * t0, z1 = za + (zb - za) * t1;
      faceUV(plB, [[X0, y0, z0], [X1, y0, z0], [X1, y1, z1], [X0, y1, z1]], uvXZ(PL_S), C.vault, [0, -1, 0]);
    }
  }
  // marble gauge board on the back wall (strip texture, middle region)
  {
    const z = Z1 - 0.035, xa = 0.3, xb = 2.9, ya = 1.0, yb = 2.95;
    face(stB, [[xb, ya, z], [xa, ya, z], [xa, yb, z], [xb, yb, z]], [[0, SV.gb0], [1, SV.gb0], [1, SV.gb1], [0, SV.gb1]], 0xffffff, [0, 0, -1]);
  }
  root.add(plB.mesh(mats.plaster, { cast: true, receive: true, name: 'hall-walls' }));
  root.add(stB.mesh(mats.strip, { cast: true, receive: true, name: 'hall-dado' }));

  // -------------------------------------------------------------------- floor (tiles) + yard (cobbles)
  const fb = new Builder(kit);
  const fr = rng(11);
  const NX = 11, NZ = 8;
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    const xa = X0 + ((X1 - X0) * i) / NX, xb = X0 + ((X1 - X0) * (i + 1)) / NX;
    const za = Z0 + ((Z1 - Z0) * j) / NZ, zb = Z0 + ((Z1 - Z0) * (j + 1)) / NZ;
    const cx = (xa + xb) / 2, cz = (za + zb) / 2;
    const edge = Math.min(cx - X0, X1 - cx, cz - Z0, Z1 - cz);
    const k = (0.82 + 0.18 * Math.min(1, edge / 4)) * (0.95 + fr() * 0.08);
    faceUV(fb, [[xa, 0, za], [xb, 0, za], [xb, 0, zb], [xa, 0, zb]], uvXZ(FLOOR_S), new THREE.Color(k, k * 0.98, k * 0.95), [0, 1, 0]);
  }
  root.add(fb.mesh(mats.floor, { cast: false, receive: true, name: 'hall-floor' }));

  const yb = new Builder(kit);
  const ox0 = X0 - WT, ox1 = X1 + WT, oz0 = Z0 - WT, oz1 = Z1 + WT, E = 90;
  const yardRect = (xa, xb, za, zb, c) => faceUV(yb, [[xa, 0, za], [xb, 0, za], [xb, 0, zb], [xa, 0, zb]], uvXZ(YARD_S), c, [0, 1, 0]);
  const nearC = 0x9b958a, farC = 0x6f6b64;
  yardRect(-24, 24, -24, oz0, nearC); yardRect(-24, ox0, oz0, oz1, nearC); yardRect(ox1, 24, oz0, oz1, nearC); yardRect(-24, 24, oz1, 18, nearC);
  yardRect(-E, E, -E, -24, farC); yardRect(-E, -24, -24, 18, farC); yardRect(24, E, -24, 18, farC); yardRect(-E, E, 18, 40, farC);
  root.add(yb.mesh(kit.mats.ground, { cast: false, receive: true, name: 'hall-yard' }));

  // -------------------------------------------------------------------- props (one vertex-coloured mesh)
  const pb = new Builder(kit);

  // steel I-beams across (x) on two longitudinal girders (z) carried by cast-iron columns in the back half
  for (let i = 1; i < BEAMS_Z.length - 1; i++) {
    const z = BEAMS_Z[i];
    pb.box(X0, X1, 6.16, 6.23, z - 0.1, z + 0.1, null, C.iron, { top: false, bottom: true, sides: 'ns' });
    pb.box(X0, X1, 6.23, CEIL, z - 0.025, z + 0.025, null, C.iron, { top: false, sides: 'ns' });
  }
  const GX = 4.5;
  for (const x of [-GX, GX]) {
    pb.box(x - 0.14, x + 0.14, 5.7, 5.78, Z0, Z1, null, C.iron, { top: false, bottom: true, sides: 'ew' });
    pb.box(x - 0.035, x + 0.035, 5.78, 6.16, Z0, Z1, null, C.iron, { top: false, sides: 'ew' });
  }
  const colProf = [[0, 0], [0.25, 0], [0.25, 0.12], [0.19, 0.18], [0.15, 0.3], [0.13, 0.42], [0.115, 5.0], [0.13, 5.12], [0.2, 5.4], [0.26, 5.6], [0.26, 5.7], [0, 5.7]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  for (const [x, z] of [[-GX, 1.0], [GX, 1.0], [-GX, 4.6], [GX, 4.6]]) addGeo(pb, new THREE.LatheGeometry(colProf, 10), M4(x, 0, z), C.castIron);

  // travelling crane: runway beams on wall brackets + bridge girder with trolley and hook (back half)
  for (const s of [-1, 1]) {
    const xw = s > 0 ? X1 : X0, xi = xw - s * 0.4;
    pb.box(Math.min(xw - s * 0.08, xi), Math.max(xw - s * 0.08, xi), 4.95, 5.2, Z0, Z1, null, C.crane, { bottom: true });
    for (let z = -7; z <= 6; z += 3.25) barBetween(pb, [xw - s * 0.05, 4.2, z], [xi + s * 0.1, 4.95, z], 0.08, C.crane);
  }
  const CZ = 5.5;
  for (const dz of [-0.22, 0.22]) pb.box(X0 + 0.35, X1 - 0.35, 5.2, 5.55, CZ + dz - 0.07, CZ + dz + 0.07, null, C.crane, { bottom: true });
  for (const s of [-1, 1]) pb.box(s > 0 ? X1 - 0.75 : X0 + 0.35, s > 0 ? X1 - 0.35 : X0 + 0.75, 5.2, 5.6, CZ - 0.45, CZ + 0.45, null, C.crane, { bottom: true });
  pb.box(-3.4, -2.6, 5.55, 5.85, CZ - 0.35, CZ + 0.35, null, 0x3a3e3a, { bottom: true });
  for (const dx of [-0.08, 0.08]) cylBetween(pb, [-3 + dx, 5.55, CZ], [-3 + dx, 3.4, CZ], 0.018, 0x2a2a2a, 5);
  pb.box(-3.18, -2.82, 3.15, 3.45, CZ - 0.12, CZ + 0.12, null, 0x8a3a24, { bottom: true });
  addGeo(pb, new THREE.TorusGeometry(0.12, 0.03, 5, 10, Math.PI * 1.5), M4(-3, 2.98, CZ, Math.PI / 2, 1, 1, 1, 0, Math.PI), C.iron);

  // copper kettle bottom poking through the vault (back half, over the gauge board)
  const KX = 0, KZ = 2.8, KR = 1.6;
  addGeo(pb, new THREE.SphereGeometry(KR, 20, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M4(KX, CEIL + 0.05, KZ), C.copper);
  addGeo(pb, new THREE.CylinderGeometry(KR + 0.08, KR + 0.08, 0.12, 20), M4(KX, CEIL, KZ), C.copperDark);
  addGeo(pb, new THREE.TorusGeometry(KR * 0.72, 0.035, 5, 20), M4(KX, CEIL + 0.05 - KR * 0.69, KZ, 0, 1, 1, 1, Math.PI / 2), C.copperDark);
  const dz = Z1 - 0.2;
  pipeRun(pb, [[KX, CEIL + 0.05 - KR, KZ], [KX, 4.7, KZ], [KX, 4.7, dz], [-0.3, 4.7, dz], [-0.3, 0.32, dz], [-0.3, 0.32, dz - 0.4], [-0.3, 0.02, dz - 0.4]], 0.07, C.copper);
  addGeo(pb, new THREE.TorusGeometry(0.16, 0.022, 5, 14), M4(-0.3, 1.25, dz - 0.17), C.iron);
  barBetween(pb, [-0.46, 1.25, dz - 0.17], [-0.14, 1.25, dz - 0.17], 0.02, C.iron);
  barBetween(pb, [-0.3, 1.09, dz - 0.17], [-0.3, 1.41, dz - 0.17], 0.02, C.iron);
  addGeo(pb, new THREE.CylinderGeometry(0.11, 0.11, 0.14, 8), M4(-0.3, 1.25, dz), C.copperDark);
  // high pipe runs along all walls (above the frieze), with brackets
  for (const [y, r] of [[5.92, 0.075], [5.7, 0.045]]) {
    pipeRun(pb, [[X0 + 0.25, y, Z0 + 0.25], [X1 - 0.25, y, Z0 + 0.25], [X1 - 0.25, y, Z1 - 0.3]], r, C.copper);
    pipeRun(pb, [[X0 + 0.25, y, Z0 + 0.25], [X0 + 0.25, y, Z1 - 0.3]], r, C.copper);
  }
  for (let x = -9; x <= 9; x += 3) pb.box(x - 0.03, x + 0.03, 5.6, 6.02, Z0, Z0 + 0.27, null, C.iron, { top: true, sides: 'sew' });
  for (let z = -7; z <= 5; z += 3) {
    pb.box(X0, X0 + 0.27, 5.6, 6.02, z - 0.03, z + 0.03, null, C.iron, { top: true, sides: 'nse' });
    pb.box(X1 - 0.27, X1, 5.6, 6.02, z - 0.03, z + 0.03, null, C.iron, { top: true, sides: 'nsw' });
  }
  // big valve wheel on the right wall run
  addGeo(pb, new THREE.TorusGeometry(0.22, 0.025, 5, 16), M4(X1 - 0.45, 5.92, -2.5, Math.PI / 2), C.iron);
  barBetween(pb, [X1 - 0.45, 5.7, -2.5], [X1 - 0.45, 6.14, -2.5], 0.025, C.iron);
  barBetween(pb, [X1 - 0.45, 5.92, -2.72], [X1 - 0.45, 5.92, -2.28], 0.025, C.iron);

  // pilaster plinths (stone) — they sit at the wall, outside the arena
  for (const [k, def] of Object.entries(WALLS)) {
    for (const p of def.pil) {
      const m = new THREE.Matrix4().makeRotationY(def.rot).setPosition(def.x, 0, def.z);
      const g = new THREE.BoxGeometry(0.9, 0.3, 0.2); g.translate(p, 0.15, -0.1);
      addGeo(pb, g, m, C.stone);
      void k;
    }
  }

  // window frames: stone sill + fixed iron outer frame (the many-pane casement is instanced below)
  const frames = WINDOW_DEFS.map(([id, wall, u]) => {
    const d = WALLS[wall];
    const m = new THREE.Matrix4().makeRotationY(d.rot).setPosition(d.x, 0, d.z).multiply(new THREE.Matrix4().makeTranslation(u, 0, 0));
    return { id, wall, u, m };
  });
  const sillB = new Builder(kit);
  sillB.box(-0.9, 0.9, SILL - 0.08, SILL, -0.09, WT + 0.08, null, C.stone, { bottom: true });
  const sillGeo = sillB.geometry();
  const frB = new Builder(kit);
  const fw0 = GLASS_D - 0.035, fw1 = GLASS_D + 0.035;
  frB.box(-WR, -WR + 0.06, SILL, TOP, fw0, fw1, null, C.iron);
  frB.box(WR - 0.06, WR, SILL, TOP, fw0, fw1, null, C.iron);
  frB.box(-WR, WR, SILL, SILL + 0.06, fw0, fw1, null, C.iron);
  frB.box(-WR, WR, TOP - 0.06, TOP, fw0, fw1, null, C.iron);
  frB.box(-WR, WR, 2.86, 2.92, fw0, fw1, null, C.iron);           // transom (top-hung vent above)
  const frameGeo = frB.geometry();
  for (const f of frames) { pb.add(sillGeo, f.m, C.stone); pb.add(frameGeo, f.m, C.iron); }

  // chocks under the stealable barrel groups (low, inside the arena by design)
  for (const s of [-1, 1]) {
    for (const dx of [-0.26, 0.26]) {
      const x = s * 6.5 + dx;
      pb.box(x - 0.06, x + 0.06, 0, 0.11, -4.35, -2.05, null, C.woodDark);
      for (const z of [-3.9, -3.2, -2.5]) for (const sz of [-1, 1]) {
        const zc = z + sz * 0.27;
        pb.box(x - 0.055, x + 0.055, 0.11, 0.15, zc - 0.05, zc + 0.05, null, C.wood);
      }
    }
  }

  // barrel wall: pyramid of barrels lying along the back wall (instanced below) on planks
  pb.box(-10.7, -1.3, 0, 0.03, 5.85, 6.85, null, C.woodDark);
  // barrel conveyor rails on posts (left back), ending at the barrel wall
  {
    const zA = 0.4, zB = 5.7, y = 0.78;
    for (const x of [-7.45, -6.95]) {
      pb.box(x - 0.04, x + 0.04, y - 0.1, y, zA, zB, null, C.iron, { bottom: true });
      for (let z = zA + 0.2; z < zB; z += 1.3) pb.box(x - 0.035, x + 0.035, 0, y - 0.1, z - 0.035, z + 0.035, null, C.iron);
    }
    for (let z = zA + 0.1; z < zB; z += 0.45) cylBetween(pb, [-7.5, y + 0.02, z], [-6.9, y + 0.02, z], 0.03, 0x55595a, 6, false);
    pb.box(-7.6, -6.8, 0, 0.06, zA - 0.2, zA + 0.1, null, C.stone);
  }

  // workbench along the left wall (back half)
  {
    const x0 = X0 + 0.02, x1 = X0 + 0.78, z0 = 0.6, z1 = 3.0;
    pb.box(x0, x1, 0.86, 0.93, z0, z1, null, C.woodLight, { bottom: true });
    for (const [x, z] of [[x0 + 0.08, z0 + 0.08], [x1 - 0.08, z0 + 0.08], [x0 + 0.08, z1 - 0.08], [x1 - 0.08, z1 - 0.08]]) pb.box(x - 0.045, x + 0.045, 0, 0.86, z - 0.045, z + 0.045, null, C.woodDark);
    pb.box(x0 + 0.05, x1 - 0.05, 0.22, 0.26, z0 + 0.05, z1 - 0.05, null, C.wood);
    pb.box(x1 - 0.18, x1 + 0.04, 0.93, 1.06, z0 + 0.26, z0 + 0.5, null, C.iron);        // vise
    barBetween(pb, [x1 + 0.04, 1.0, z0 + 0.28], [x1 + 0.04, 1.0, z0 + 0.48], 0.025, C.iron);
    pb.box(X0 + 0.01, X0 + 0.04, 1.5, 2.3, z0 + 0.15, z1 - 0.15, null, C.wood);           // tool board
    for (let k = 0; k < 6; k++) { const z = z0 + 0.4 + k * 0.33; pb.box(X0 + 0.04, X0 + 0.07, 1.7 + (k % 3) * 0.08, 2.15 - (k % 2) * 0.12, z - 0.03, z + 0.03, null, C.iron); }
    addGeo(pb, new THREE.CylinderGeometry(0.09, 0.11, 0.24, 8), M4(x0 + 0.35, 1.05, z0 + 0.5), 0x5b6066);
    addGeo(pb, new THREE.CylinderGeometry(0.035, 0.04, 0.26, 6), M4(x0 + 0.4, 1.06, z0 + 0.95), 0x3d5a34);
    addGeo(pb, new THREE.BoxGeometry(0.42, 0.04, 0.3), M4(x0 + 0.4, 0.95, z0 + 1.5, 0.3), 0x8a7a5a);
    pipeRun(pb, [[X0 + 0.25, 5.7, 2.6], [X0 + 0.25, 1.55, 2.6], [X0 + 0.5, 1.55, 2.6]], 0.04, C.copper);
    pb.box(X0 + 0.47, X0 + 0.55, 1.42, 1.58, 2.55, 2.65, null, C.brass);
  }

  // malt sacks beside the conveyor (left back)
  {
    const sacks = [[-10.3, 0, 3.6, 0.1], [-10.3, 0, 4.4, -0.1], [-9.5, 0, 4.0, 1.5], [-10.25, 1, 4.0, 0.2], [-9.4, 0, 3.35, 1.2]];
    for (const [x, layer, z, ry] of sacks) {
      const c = new THREE.Color(C.burlap).multiplyScalar(0.88 + R() * 0.2);
      addGeo(pb, new THREE.SphereGeometry(1, 9, 6), M4(x, 0.15 + layer * 0.27, z, ry, 0.44, 0.17, 0.3), c);
      addGeo(pb, new THREE.CylinderGeometry(0.05, 0.08, 0.12, 6), M4(x + Math.cos(ry) * 0.44, 0.17 + layer * 0.27, z - Math.sin(ry) * 0.44, ry, 1, 1, 1, 0, Math.PI / 2), c);
    }
  }

  // two-wheeled sack truck leaning near the barrel wall
  {
    const cx = -0.9, cz = 4.7, ry = 0.5, lean = 0.35;
    const T = new THREE.Matrix4().makeRotationY(ry).setPosition(cx, 0, cz);
    const P = (x, y, z) => { const v = new THREE.Vector3(x, y * Math.cos(lean), -y * Math.sin(lean) + z).applyMatrix4(T); return [v.x, v.y, v.z]; };
    for (const s of [-1, 1]) {
      const w = P(s * 0.25, 0.2, 0.05); addGeo(pb, new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), M4(w[0], 0.2, w[2], ry, 1, 1, 1, 0, Math.PI / 2), C.iron);
      barBetween(pb, P(s * 0.18, 0.03, 0.2), P(s * 0.18, 1.35, 0.2), 0.04, C.wood);
      barBetween(pb, P(s * 0.18, 1.35, 0.2), P(s * 0.22, 1.45, 0.32), 0.035, C.woodDark);
    }
    cylBetween(pb, P(-0.28, 0.2, 0.05), P(0.28, 0.2, 0.05), 0.02, C.iron);
    for (const y of [0.45, 0.8, 1.1]) barBetween(pb, P(-0.18, y, 0.2), P(0.18, y, 0.2), 0.03, C.wood);
    const n = P(0, 0.03, 0.0); pb.box(n[0] - 0.2, n[0] + 0.2, 0, 0.025, n[2] - 0.12, n[2] + 0.12, null, C.iron);
  }

  // gauge board frame + cable conduits
  pb.box(0.2, 3.0, 0.9, 3.05, Z1 - 0.03, Z1, null, 0x2b2b28, { sides: 'n' });
  for (const x of [0.7, 1.6, 2.5]) cylBetween(pb, [x, 3.05, Z1 - 0.06], [x, 5.7, Z1 - 0.06], 0.025, 0x2f2f2c, 6);
  pb.box(0.4, 2.8, 0.0, 0.9, Z1 - 0.25, Z1, null, 0x5d5850);   // switch cabinet plinth

  // horizontal steam engine with crosshead, governor and (separately animated) flywheel — right back
  const FW = { x: 6.6, y: 1.6, z: 2.6, r: 1.3 };
  {
    pb.box(5.6, 10.3, 0, 0.35, 2.0, 5.3, null, C.concrete);
    pb.box(5.4, 7.8, 0, 0.36, 2.35, 2.85, null, 0x6a665e);                         // flywheel pit edge
    const cyZ = 3.9;
    addGeo(pb, new THREE.CylinderGeometry(0.55, 0.55, 1.9, 16), M4(9.0, 1.05, cyZ, 0, 1, 1, 1, 0, Math.PI / 2), C.engine);
    for (const x of [8.02, 9.98]) addGeo(pb, new THREE.CylinderGeometry(0.64, 0.64, 0.1, 16), M4(x, 1.05, cyZ, 0, 1, 1, 1, 0, Math.PI / 2), 0x232b27);
    pb.box(8.2, 9.8, 0.35, 0.6, cyZ - 0.4, cyZ + 0.4, null, 0x2a2f2c);
    pb.box(6.9, 8.0, 0.75, 1.0, cyZ - 0.22, cyZ + 0.22, null, C.engine);             // crosshead guide
    cylBetween(pb, [6.95, 1.05, cyZ], [9.9, 1.05, cyZ], 0.05, 0x9a9a92, 8, false);   // piston rod
    barBetween(pb, [6.6, 1.6, 3.0], [7.3, 1.05, cyZ], 0.09, 0x4a4e48);                // connecting rod
    cylBetween(pb, [FW.x, FW.y, 2.2], [FW.x, FW.y, 3.4], 0.1, 0x6f716a, 10, false);    // crankshaft
    for (const z of [2.15, 3.2]) pb.box(FW.x - 0.25, FW.x + 0.25, 0.35, 1.5, z - 0.12, z + 0.12, null, C.engine);
    pb.box(8.7, 9.3, 1.6, 1.9, cyZ - 0.25, cyZ + 0.25, null, 0x2a2f2c);             // valve chest
    cylBetween(pb, [9.0, 1.9, cyZ], [9.0, 2.6, cyZ], 0.03, C.brass, 6, false);        // governor
    for (const s of [-1, 1]) addGeo(pb, new THREE.SphereGeometry(0.08, 8, 6), M4(9.0 + s * 0.16, 2.45, cyZ), C.brass);
    pipeRun(pb, [[9.6, 1.6, cyZ], [9.6, 4.0, cyZ], [10.75, 4.0, cyZ], [10.75, 5.7, cyZ]], 0.09, 0x3b3f3c, 0x2b2f2c);
    addGeo(pb, new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10), M4(9.6, 3.3, cyZ, 0, 1, 1, 1, Math.PI / 2), C.iron);
    // handwheel stand at the front of the engine
    cylBetween(pb, [8.0, 0.35, 2.3], [8.0, 1.25, 2.3], 0.05, C.engine);
    addGeo(pb, new THREE.TorusGeometry(0.22, 0.025, 5, 16), M4(8.0, 1.28, 2.3, 0, 1, 1, 1, Math.PI / 2), C.iron);
  }

  // wooden door in the right wall (back corner)
  pb.box(X1 - 0.08, X1 - 0.02, 0, 3.05, 4.55, 6.65, null, C.woodDark, { sides: 'w' });
  for (const y of [0.5, 1.5, 2.5]) pb.box(X1 - 0.11, X1 - 0.08, y - 0.05, y + 0.05, 4.65, 6.55, null, C.iron, { sides: 'wns' });

  // wall clock case on the front pilaster (x = 5.4); dial goes to the atlas mesh
  const CLK = [5.4, 3.55, Z0 + 0.13];
  addGeo(pb, new THREE.CylinderGeometry(0.37, 0.37, 0.1, 20), M4(CLK[0], CLK[1], CLK[2] + 0.05, 0, 1, 1, 1, Math.PI / 2), C.woodDark);

  // the yard gas lamp (post; the glass is in the backdrop mesh) and a low yard wall with a gate
  const YL = [-4.2, -17];
  addGeo(pb, new THREE.CylinderGeometry(0.06, 0.1, 3.4, 8), M4(YL[0], 1.7, YL[1]), 0x24282a);
  addGeo(pb, new THREE.CylinderGeometry(0.18, 0.2, 0.3, 8), M4(YL[0], 0.15, YL[1]), 0x24282a);
  addGeo(pb, new THREE.ConeGeometry(0.3, 0.22, 4), M4(YL[0], 3.95, YL[1], Math.PI / 4), 0x24282a);
  for (const [xa, xb] of [[-34, -3], [3, 34]]) {
    pb.box(xa, xb, 0, 2.1, -29.3, -28.8, null, 0x6a5148, { top: true });
    pb.box(xa, xb, 2.1, 2.25, -29.4, -28.7, null, 0x7c766c, { top: true });
  }
  for (const x of [-3.3, 3.3]) pb.box(x - 0.35, x + 0.35, 0, 2.9, -29.4, -28.7, null, 0x7c766c, { top: true });

  root.add(pb.mesh(kit.mats.props, { cast: true, receive: true, name: 'hall-props' }));

  // flywheel (turning slowly — the night shift keeps the engine ticking over)
  const flywheel = (() => {
    const b = new Builder(kit);
    addGeo(b, new THREE.TorusGeometry(FW.r, 0.1, 6, 36), M4(0, 0, 0), 0x2e3833);
    addGeo(b, new THREE.CylinderGeometry(FW.r - 0.04, FW.r - 0.04, 0.22, 36, 1, true), M4(0, 0, 0, 0, 1, 1, 1, Math.PI / 2), 0x34403a);
    addGeo(b, new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), M4(0, 0, 0, 0, 1, 1, 1, Math.PI / 2), 0x2a302c);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; barBetween(b, [Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0], [Math.cos(a) * (FW.r - 0.05), Math.sin(a) * (FW.r - 0.05), 0], 0.07, 0x2e3833); }
    const m = b.mesh(kit.mats.props, { cast: true, receive: true, name: 'hall-flywheel' });
    m.position.set(FW.x, FW.y, FW.z); m.userData.dynamic = true;
    return m;
  })();
  root.add(flywheel);

  // -------------------------------------------------------------------- atlas-textured decor
  const ab = new Builder(kit);
  {
    const g = new THREE.CircleGeometry(0.31, 24);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + (uv.getX(i) - 0.5) * 0.86, 0.5 + (uv.getY(i) - 0.5) * 0.86);
    ab.add(g, M4(CLK[0], CLK[1], CLK[2] + 0.105), 0xf2ead8, 'clock');
    g.dispose();
    const zS = Z0 + 0.03;
    ab.quad([-1.25, 3.72, zS], [1.25, 3.72, zS], [1.25, 4.24, zS], [-1.25, 4.24, zS], 0xc8bca4, 'cpp');
    const zP = Z0 + 0.13;
    ab.quad([-5.75, 1.6, zP], [-5.05, 1.6, zP], [-5.05, 2.5, zP], [-5.75, 2.5, zP], 0xb8ad98, 'poster');
    ab.quad([-6.8, 3.1, Z1 - 0.03], [-8.4, 3.1, Z1 - 0.03], [-8.4, 3.9, Z1 - 0.03], [-6.8, 3.9, Z1 - 0.03], 0xb8ad98, 'svetovar');
    ab.quad([X1 - 0.085, 0, 4.6], [X1 - 0.085, 0, 6.6], [X1 - 0.085, 3.0, 6.6], [X1 - 0.085, 3.0, 4.6], 0x9a8670, 'wood');
  }
  root.add(ab.mesh(kit.mats.wall, { cast: false, receive: true, name: 'hall-decor' }));

  // -------------------------------------------------------------------- night backdrop
  {
    const g = new THREE.SphereGeometry(150, 32, 16);
    const pos = g.attributes.position, cols = new Float32Array(pos.count * 3);
    const zen = new THREE.Color(0x070b18), hor = new THREE.Color(0x2b3a5a), below = new THREE.Color(0x0e121c), glow = new THREE.Color(0x8193b8);
    const v = new THREE.Vector3(), c = new THREE.Color(), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const el = Math.asin(THREE.MathUtils.clamp(v.y, -1, 1));
      if (el < 0) c.copy(hor).lerp(below, Math.min(1, -el / 0.15));
      else c.copy(hor).lerp(zen, THREE.MathUtils.smoothstep(el, 0, 0.9));
      const ang = Math.acos(THREE.MathUtils.clamp(v.dot(MOON_VIS), -1, 1));
      c.add(tmp.copy(glow).multiplyScalar(0.45 * Math.exp(-ang / 0.22)));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const sky = new THREE.Mesh(g, mats.sky);
    sky.name = 'hall-sky'; sky.renderOrder = -10; sky.position.copy(PLAYER).setY(0);
    root.add(sky);
  }
  {
    const n = high ? 320 : 180, pos = new Float32Array(n * 3), cols = new Float32Array(n * 3), v = new THREE.Vector3();
    const sr = rng(42);
    for (let i = 0; i < n; i++) {
      do {
        const az = sr() * Math.PI * 2, el = 0.06 + Math.pow(sr(), 0.7) * 1.3;
        v.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
      } while (v.angleTo(MOON_VIS) < 0.2);
      v.multiplyScalar(140).add(PLAYER);
      pos.set([v.x, v.y, v.z], i * 3);
      const b = 0.45 + sr() * 0.55; cols.set([b * 0.9, b * 0.95, b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false }));
    stars.name = 'hall-stars'; stars.renderOrder = -9;
    root.add(stars);
  }
  const db = new Builder(kit);
  {
    const sil = 0x161c2b, silWarm = 0x1b1c24, roofC = 0x1d2436;
    const quadN = (pts, base, n) => face(db, pts, [[0, 0], [1, 0], [1, 1], [0, 1]].slice(0, pts.length), shaded(base, n), n);
    const boxS = (x0, x1, y0, y1, z0, z1, base) => {
      quadN([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], base, [0, 0, 1]);
      quadN([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], base, [0, 0, -1]);
      quadN([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], base, [1, 0, 0]);
      quadN([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], base, [-1, 0, 0]);
      quadN([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], base, [0, 1, 0]);
    };
    const gable = (x0, x1, z0, z1, y, h, alongX, base) => {
      if (alongX) {
        const zm = (z0 + z1) / 2;
        quadN([[x0, y, z1], [x1, y, z1], [x1, y + h, zm], [x0, y + h, zm]], base, Builder.normal([x0, y, z1], [x1, y, z1], [x1, y + h, zm]));
        quadN([[x1, y, z0], [x0, y, z0], [x0, y + h, zm], [x1, y + h, zm]], base, Builder.normal([x1, y, z0], [x0, y, z0], [x0, y + h, zm]));
        face(db, [[x0, y, z0], [x0, y, z1], [x0, y + h, zm]], [[0, 0], [1, 0], [0.5, 1]], shaded(base, [-1, 0, 0]), [-1, 0, 0]);
        face(db, [[x1, y, z0], [x1, y, z1], [x1, y + h, zm]], [[0, 0], [1, 0], [0.5, 1]], shaded(base, [1, 0, 0]), [1, 0, 0]);
      } else {
        const xm = (x0 + x1) / 2;
        quadN([[x1, y, z1], [x1, y, z0], [xm, y + h, z0], [xm, y + h, z1]], base, Builder.normal([x1, y, z1], [x1, y, z0], [xm, y + h, z0]));
        quadN([[x0, y, z0], [x0, y, z1], [xm, y + h, z1], [xm, y + h, z0]], base, Builder.normal([x0, y, z0], [x0, y, z1], [xm, y + h, z1]));
        face(db, [[x0, y, z1], [x1, y, z1], [xm, y + h, z1]], [[0, 0], [1, 0], [0.5, 1]], shaded(base, [0, 0, 1]), [0, 0, 1]);
        face(db, [[x0, y, z0], [x1, y, z0], [xm, y + h, z0]], [[0, 0], [1, 0], [0.5, 1]], shaded(base, [0, 0, -1]), [0, 0, -1]);
      }
    };
    const lit = (x, y, z, w, h, c = 0xd9a056) => face(db, [[x - w / 2, y, z], [x + w / 2, y, z], [x + w / 2, y + h, z], [x - w / 2, y + h, z]], [[0, 0], [1, 0], [1, 1], [0, 1]], c, [0, 0, 1]);
    const darkWin = (x, y, z, w, h) => lit(x, y, z, w, h, 0x0d111b);

    boxS(-1, 19, 0, 15, -52, -38, sil); gable(-1, 19, -52, -38, 15, 4.5, true, roofC);
    boxS(4, 9.5, 0, 25, -46, -40.5, sil); db.cone(6.75, -43.25, 25, 7, 4.2, 4, shaded(roofC, [0, 0.7, 0.7]), null, Math.PI / 4);
    db.cyl(6.75, -43.25, 31.5, 33.5, 0.6, 0.5, 6, 1, null, shaded(sil, [0, 0, 1]), { smooth: false });
    db.cone(6.75, -43.25, 33.5, 5, 0.6, 6, shaded(roofC, [0, 0.5, 1]));
    face(db, [[6.0, 21.2, -40.4], [7.5, 21.2, -40.4], [7.5, 22.7, -40.4], [6.0, 22.7, -40.4]], [[0, 0], [1, 0], [1, 1], [0, 1]], 0xb9a57a, [0, 0, 1]);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      const x = 0.8 + i * 3.1, y = 2 + j * 4.3;
      if ((i * 7 + j * 3) % 5 === 1) lit(x, y, -37.95, 1.1, 2.0); else darkWin(x, y, -37.95, 1.1, 2.0);
    }
    boxS(-36, -21, 0, 23, -58, -44, silWarm); gable(-36, -21, -58, -44, 23, 5, false, roofC);
    boxS(-30.5, -26.5, 28, 30.5, -53, -49, silWarm);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) {
      const x = -33.5 + i * 3.6, y = 2.5 + j * 4;
      if (i === 2 && j === 1) lit(x, y, -43.95, 1.0, 1.8, 0xc98c48); else darkWin(x, y, -43.95, 1.0, 1.8);
    }
    db.cyl(24, -60, 0, 52, 1.9, 1.15, 10, 1, null, shaded(sil, [0, 0, 1]), { smooth: false, cap: true });
    db.cyl(24, -60, 50, 51.4, 1.35, 1.35, 10, 1, null, shaded(roofC, [0, 0, 1]), { smooth: false, cap: true });
    boxS(17, 31, 0, 10, -66, -54, sil); gable(17, 31, -66, -54, 10, 3, true, roofC);
    boxS(22, 40, 0, 9, -38, -26, sil); gable(22, 40, -38, -26, 9, 3, true, roofC);
    for (let i = 0; i < 4; i++) darkWin(24.5 + i * 4.2, 2.5, -25.95, 1.6, 3.2);
    lit(32.9, 2.5, -25.94, 1.6, 3.2, 0xb27a40);
    boxS(-62, -38, 0, 6, -32, -20, sil); gable(-62, -38, -32, -20, 6, 2.5, true, roofC);
    boxS(34, 46, 0, 8, -16, 10, silWarm); gable(34, 46, -16, 10, 8, 3, false, roofC);
    boxS(-46, -34, 0, 7, -12, 12, silWarm); gable(-46, -34, -12, 12, 7, 3, false, roofC);
    const tr = rng(9);
    for (const [x, z, s] of [[-14, -33, 1], [-19, -36, 1.2], [14, -32, 1.1], [40, -42, 1.3], [-48, -40, 1.4], [-28, 22, 1.2], [-30, -2, 1], [30, -3, 1.1], [52, 0, 1.4], [-55, 6, 1.3]]) {
      const g = new THREE.IcosahedronGeometry(3.2 * s, 0);
      db.add(g, M4(x, 4.6 * s + 1.5, z, tr() * 3, 1, 1.25, 1), new THREE.Color(0x0d1511).multiplyScalar(0.9 + tr() * 0.3));
      g.dispose();
      db.box(x - 0.25, x + 0.25, 0, 3, z - 0.25, z + 0.25, null, 0x0c0f12);
    }
    const N = 72, RR = 110;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI * 2, a1 = ((k + 1) / N) * Math.PI * 2;
      const h = (a) => 5 + 3 * Math.sin(a * 3 + 1) + 2 * Math.sin(a * 7.3) + 1.2 * Math.sin(a * 17.1 + 2);
      const p0 = [PLAYER.x + Math.sin(a0) * RR, -3, PLAYER.z + Math.cos(a0) * RR], p1 = [PLAYER.x + Math.sin(a1) * RR, -3, PLAYER.z + Math.cos(a1) * RR];
      face(db, [p0, p1, [p1[0], h(a1), p1[2]], [p0[0], h(a0), p0[2]]], [[0, 0], [1, 0], [1, 1], [0, 1]], 0x0c1019, [-Math.sin(a0), 0, -Math.cos(a0)]);
    }
    const mp = MOON_VIS.clone().multiplyScalar(125).add(PLAYER);
    const o = new THREE.Object3D(); o.position.copy(mp); o.lookAt(PLAYER); o.updateMatrix();
    const disk = new THREE.CircleGeometry(4.0, 28);
    db.add(disk, o.matrix, 0xeef1f6);
    for (const [x, y, r] of [[-1.2, 0.9, 1.3], [1.1, -0.4, 1.0], [0.2, -1.8, 0.7]]) {
      const g = new THREE.CircleGeometry(r, 14);
      db.add(g, o.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, 0.05)), 0xc9cfda);
      g.dispose();
    }
    disk.dispose();
    const lg = new THREE.CylinderGeometry(0.2, 0.15, 0.42, 4);
    db.add(lg, M4(YL[0], 3.62, YL[1], Math.PI / 4), 0xffd18a);
    lg.dispose();
  }
  root.add(db.mesh(mats.backdrop, { cast: false, receive: false, name: 'hall-backdrop' }));

  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0x9fb2dc, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.55 }));
  moonGlow.position.copy(MOON_VIS).multiplyScalar(124).add(PLAYER); moonGlow.scale.setScalar(34);
  moonGlow.name = 'hall-moonglow';
  root.add(moonGlow);
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0xffb760, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.6 }));
  lampGlow.position.set(YL[0], 3.62, YL[1]); lampGlow.scale.setScalar(2.6);
  lampGlow.name = 'hall-lampglow';
  root.add(lampGlow);

  // -------------------------------------------------------------------- moonlight shafts (fake volumetrics)
  {
    const d = MOON_DIR.clone().negate();
    const outline = [[-WR, SILL], [WR, SILL], [WR, TOP], [-WR, TOP]];
    const pos = [], cols = [];
    const I0 = new THREE.Color(0x222d44), I1 = new THREE.Color(0x000000);
    const push = (p, c) => { pos.push(p[0], p[1], p[2]); cols.push(c.r, c.g, c.b); };
    for (const f of frames) {
      if (f.wall !== 'front') continue;
      const P = outline.map(([u, v]) => new THREE.Vector3(u, v, 0).applyMatrix4(f.m));
      const Q = P.map((p) => p.clone().addScaledVector(d, (p.y / -d.y) * 0.92));
      for (let i = 1; i < P.length; i++) {
        const j = (i + 1) % P.length;
        const a = P[i].toArray(), b = P[j].toArray(), c = Q[j].toArray(), e = Q[i].toArray();
        push(a, I0); push(b, I0); push(c, I1);
        push(a, I0); push(c, I1); push(e, I1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const shafts = new THREE.Mesh(g, mats.shaft);
    shafts.name = 'hall-moonshafts'; shafts.renderOrder = 5;
    root.add(shafts);
  }

  // -------------------------------------------------------------------- glass, many-pane casements, shards (instanced, dynamic)
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const glassGeo = new THREE.PlaneGeometry(2 * WR - 0.08, TOP - SILL - 0.08);
  glassGeo.translate(0, (SILL + TOP) / 2, GLASS_D);
  const glass = new THREE.InstancedMesh(glassGeo, mats.glass, frames.length);
  glass.name = 'hall-glass'; glass.frustumCulled = false; glass.renderOrder = 4; glass.userData.dynamic = true;
  root.add(glass);

  const casB = new Builder(kit);
  const cw0 = GLASS_D - 0.02, cw1 = GLASS_D + 0.02, t = 0.016;
  for (let k = 1; k < 4; k++) { const u = -WR + (2 * WR * k) / 4; casB.box(u - t, u + t, SILL + 0.05, TOP - 0.05, cw0, cw1, null, C.iron); }
  const ROWS = 7;
  for (let k = 1; k < ROWS; k++) {
    const v = SILL + ((TOP - SILL) * k) / ROWS;
    if (Math.abs(v - 2.89) < 0.12) continue;  // the fixed transom is there
    casB.box(-WR + 0.05, WR - 0.05, v - t, v + t, cw0, cw1, null, C.iron);
  }
  casB.box(-0.06, 0.06, 1.6, 1.68, cw0 - 0.05, cw0, null, 0x2a2c2e); // latch
  const bars = new THREE.InstancedMesh(casB.geometry(), kit.mats.props, frames.length);
  bars.name = 'hall-casements'; bars.frustumCulled = false; bars.castShadow = true; bars.userData.dynamic = true;
  root.add(bars);


  // ---- crack web overlay (crackGlass): one shared texture, one instanced quad per window
  const crackGeo = new THREE.PlaneGeometry(1, 1);
  const cracks = new THREE.InstancedMesh(crackGeo, mats.crack, frames.length);
  cracks.name = 'hall-cracks'; cracks.frustumCulled = false; cracks.renderOrder = 5; cracks.userData.dynamic = true;
  cracks.raycast = () => {};
  root.add(cracks);

  // ---- shatter: pooled shards (window-local physics) + glitter burst
  const SPW = 50, STUCK = 6, NSH = frames.length * SPW;
  const shardGeo = new THREE.BufferGeometry();
  shardGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.06, 0, 0.04, 0.07, 0, 0.03, 0.01, 0, -0.08], 3));
  shardGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  const shards = new THREE.InstancedMesh(shardGeo, mats.shard, NSH);
  shards.name = 'hall-shards'; shards.frustumCulled = false; shards.renderOrder = 4; shards.userData.dynamic = true;
  shards.raycast = () => {};
  root.add(shards);
  const sP = new Float32Array(NSH * 3), sV = new Float32Array(NSH * 3), sA = new Float32Array(NSH * 3), sW = new Float32Array(NSH * 3);
  const sS = new Float32Array(NSH * 3), sOff = new Float32Array(NSH), sB = new Float32Array(NSH), sSt = new Uint8Array(NSH);
  const moving = new Int16Array(frames.length);
  const winInv = frames.map((f) => f.m.clone().invert());
  const winOrigin = frames.map((f) => new THREE.Vector3().setFromMatrixPosition(f.m));
  const impact = new Float32Array(frames.length * 2);
  const cracked = new Uint8Array(frames.length);

  const GL = 36, NGL = frames.length * GL, GLIFE = 0.4;
  const gPos = new Float32Array(NGL * 3), gCol = new Float32Array(NGL * 3), gVel = new Float32Array(NGL * 3), gLife = new Float32Array(NGL);
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3).setUsage(THREE.DynamicDrawUsage));
  const glitter = new THREE.Points(gGeo, new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glitter.name = 'hall-glitter'; glitter.frustumCulled = false; glitter.renderOrder = 6; glitter.userData.dynamic = true;
  glitter.raycast = () => {};
  root.add(glitter);
  let glitterLive = 0;

  const _e = new THREE.Euler(0, 0, 0, 'XZY'), _qq = new THREE.Quaternion(), _pp = new THREE.Vector3(), _ss = new THREE.Vector3();
  const _lm = new THREE.Matrix4(), _wm = new THREE.Matrix4(), _cc = new THREE.Color(), _tv = new THREE.Vector3();
  const SR = rng(4242);
  const TINT = [0.86, 1.0, 0.97];

  function writeShard(i) {
    const w = (i / SPW) | 0, j = i * 3;
    _e.set(sA[j], sA[j + 1], sA[j + 2]); _qq.setFromEuler(_e);
    _pp.set(sP[j], sP[j + 1], sP[j + 2]); _ss.set(sS[j], sS[j + 1], sS[j + 2]);
    _lm.compose(_pp, _qq, _ss);
    _wm.multiplyMatrices(frames[w].m, _lm);
    shards.setMatrixAt(i, _wm);
  }
  function shardColor(i, b) { _cc.setRGB(TINT[0] * b, TINT[1] * b, TINT[2] * b); shards.setColorAt(i, _cc); }
  function hideWindowShards(w) {
    for (let k = 0; k < SPW; k++) { const i = w * SPW + k; sSt[i] = 0; shards.setMatrixAt(i, ZERO); }
    moving[w] = 0;
  }
  const floorAt = (u, w) => (Math.abs(u) < 0.9 && w > -0.09 && w < 0.68 ? SILL : 0);
  const nearestPi = (a) => Math.round(a / Math.PI) * Math.PI;

  // jagged leftovers stuck in the frame: [u, v, tip direction u, tip direction v]
  const STUCK_AT = [[-0.72, 1.05, 1, 0.3], [0.72, 1.3, -1, 0.2], [-0.72, 2.45, 1, -0.2], [0.72, 3.25, -1, -0.4], [-0.25, 3.52, 0.1, -1], [0.3, 0.98, -0.1, 1]];

  function shatter(w) {
    const iu = impact[w * 2], iv = impact[w * 2 + 1];
    const base = w * SPW;
    for (let k = 0; k < STUCK; k++) {
      const i = base + k, j = i * 3, [u, v, du, dv] = STUCK_AT[k];
      sP[j] = u; sP[j + 1] = v; sP[j + 2] = GLASS_D;
      sA[j] = Math.PI / 2; sA[j + 1] = Math.atan2(-du, dv) + (SR() - 0.5) * 0.5; sA[j + 2] = 0;
      sS[j] = 0.9 + SR() * 0.6; sS[j + 1] = 1; sS[j + 2] = 1.6 + SR() * 1.2;
      sSt[i] = 2; writeShard(i); shardColor(i, 0.9 + SR() * 0.4);
    }
    // flying pieces: one per small pane, the rest around the impact point
    const CU = 4, CV = 7, cw = (2 * WR) / CU, ch = (TOP - SILL) / CV;
    for (let k = STUCK; k < SPW; k++) {
      const i = base + k, j = i * 3, n = k - STUCK;
      let u, v;
      if (n < CU * CV) { u = -WR + cw * ((n % CU) + 0.5) + (SR() - 0.5) * cw * 0.6; v = SILL + ch * (((n / CU) | 0) + 0.5) + (SR() - 0.5) * ch * 0.6; }
      else { const a = SR() * Math.PI * 2, r = 0.05 + SR() * 0.45; u = THREE.MathUtils.clamp(iu + Math.cos(a) * r, -0.7, 0.7); v = THREE.MathUtils.clamp(iv + Math.sin(a) * r, SILL + 0.1, TOP - 0.1); }
      let du = u - iu, dv = v - iv; const dist = Math.hypot(du, dv) || 0.01; du /= dist; dv /= dist;
      const sz = (0.55 + 0.7 * Math.min(1, dist / 0.8)) * (0.8 + SR() * 0.6);
      sP[j] = u; sP[j + 1] = v; sP[j + 2] = GLASS_D + (SR() - 0.5) * 0.02;
      sA[j] = Math.PI / 2 + (SR() - 0.5) * 0.3; sA[j + 1] = SR() * Math.PI * 2; sA[j + 2] = (SR() - 0.5) * 0.3;
      sS[j] = sz * (1.0 + SR() * 0.8); sS[j + 1] = 1; sS[j + 2] = sz * (1.0 + SR() * 0.8);
      const radial = (0.4 + SR() * 1.2) * (1.3 - Math.min(dist, 1));
      const inward = SR() < 0.82;
      sV[j] = du * radial; sV[j + 1] = dv * radial + SR() * 0.8; sV[j + 2] = inward ? -(1.8 + SR() * 3.0) : 0.5 + SR() * 1.5;
      sW[j] = (SR() - 0.5) * 26; sW[j + 1] = (SR() - 0.5) * 20; sW[j + 2] = (SR() - 0.5) * 26;
      sOff[i] = 0.002 + SR() * 0.004; sB[i] = 0.7 + SR() * 0.7;
      sSt[i] = 1; writeShard(i); shardColor(i, sB[i]);
    }
    moving[w] = SPW - STUCK;
    shards.instanceMatrix.needsUpdate = true; if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
    // glitter burst from the impact point
    const o = winOrigin[w];
    for (let k = 0; k < GL; k++) {
      const g = w * GL + k, j = g * 3;
      _tv.set(iu + (SR() - 0.5) * 0.3, iv + (SR() - 0.5) * 0.3, GLASS_D).applyMatrix4(frames[w].m);
      gPos[j] = _tv.x; gPos[j + 1] = _tv.y; gPos[j + 2] = _tv.z;
      const a = SR() * Math.PI * 2, sp = 1 + SR() * 3;
      _tv.set(Math.cos(a) * sp, Math.sin(a) * sp, -(1 + SR() * 3)).applyMatrix4(frames[w].m).sub(o);
      gVel[j] = _tv.x; gVel[j + 1] = _tv.y; gVel[j + 2] = _tv.z;
      gLife[g] = GLIFE * (0.6 + SR() * 0.4);
    }
    glitterLive = 1;
  }

  function stepShards(dt) {
    let dirty = false;
    for (let w = 0; w < frames.length; w++) {
      if (moving[w] <= 0) continue;
      dirty = true;
      for (let k = STUCK; k < SPW; k++) {
        const i = w * SPW + k;
        if (sSt[i] !== 1) continue;
        const j = i * 3;
        sV[j + 1] -= 9.81 * dt;
        sP[j] += sV[j] * dt; sP[j + 1] += sV[j + 1] * dt; sP[j + 2] += sV[j + 2] * dt;
        const u = sP[j], z = sP[j + 2];
        if (z > -0.02 && z < 0.62) {                       // inside the reveal: jambs + lintel
          if (Math.abs(u) > 0.76) { sP[j] = Math.sign(u) * 0.76; sV[j] = -sV[j] * 0.3; }
          if (sP[j + 1] > TOP - 0.04) { sP[j + 1] = TOP - 0.04; sV[j + 1] = -Math.abs(sV[j + 1]) * 0.3; }
        }
        const fy = floorAt(sP[j], sP[j + 2]) + sOff[i];
        if (sP[j + 1] <= fy) {
          sP[j + 1] = fy;
          if (sV[j + 1] < -0.7) {                          // bounce
            sV[j + 1] = -sV[j + 1] * 0.22; sV[j] *= 0.55; sV[j + 2] *= 0.55;
            sW[j] *= 0.45; sW[j + 1] *= 0.6; sW[j + 2] *= 0.45;
          } else {                                         // slide + lie flat
            sV[j + 1] = 0;
            const fr = Math.max(0, 1 - 7 * dt); sV[j] *= fr; sV[j + 2] *= fr;
            sW[j] = 0; sW[j + 2] = 0; sW[j + 1] *= fr;
            const lf = Math.min(1, dt * 14);
            sA[j] += (nearestPi(sA[j]) - sA[j]) * lf; sA[j + 2] += (nearestPi(sA[j + 2]) - sA[j + 2]) * lf;
            if (Math.abs(sV[j]) + Math.abs(sV[j + 2]) < 0.03 && Math.abs(sA[j] - nearestPi(sA[j])) + Math.abs(sA[j + 2] - nearestPi(sA[j + 2])) < 0.02) {
              sA[j] = nearestPi(sA[j]); sA[j + 2] = nearestPi(sA[j + 2]);
              sSt[i] = 2; moving[w]--;
            }
          }
        }
        sA[j] += sW[j] * dt; sA[j + 1] += sW[j + 1] * dt; sA[j + 2] += sW[j + 2] * dt;
        writeShard(i);
        // glint while tumbling: brighter when the face turns up toward the moon / bulbs
        shardColor(i, sB[i] * (0.65 + 0.7 * Math.abs(Math.cos(sA[j]) * Math.cos(sA[j + 2]))));
      }
    }
    if (dirty) { shards.instanceMatrix.needsUpdate = true; if (shards.instanceColor) shards.instanceColor.needsUpdate = true; }
  }

  function stepGlitter(dt) {
    if (!glitterLive) return;
    let live = 0;
    for (let g = 0; g < NGL; g++) {
      const j = g * 3;
      if (gLife[g] <= 0) { if (gCol[j] !== 0) { gCol[j] = gCol[j + 1] = gCol[j + 2] = 0; } continue; }
      live++;
      gLife[g] -= dt;
      gVel[j + 1] -= 4.9 * dt;
      gPos[j] += gVel[j] * dt; gPos[j + 1] += gVel[j + 1] * dt; gPos[j + 2] += gVel[j + 2] * dt;
      const k = Math.max(0, gLife[g] / GLIFE); const b = k * k * 1.6;
      gCol[j] = 0.8 * b; gCol[j + 1] = 0.95 * b; gCol[j + 2] = b;
    }
    gGeo.attributes.position.needsUpdate = true; gGeo.attributes.color.needsUpdate = true;
    glitterLive = live;
  }

  function clearGlitter(w) {
    for (let k = 0; k < GL; k++) { const g = w * GL + k, j = g * 3; gLife[g] = 0; gCol[j] = gCol[j + 1] = gCol[j + 2] = 0; }
    gGeo.attributes.color.needsUpdate = true;
  }

  const intact = frames.map(() => true);
  const idxOf = new Map(frames.map((f, i) => [f.id, i]));
  function setCrack(i, on) {
    if (!on) { cracks.setMatrixAt(i, ZERO); cracked[i] = 0; cracks.instanceMatrix.needsUpdate = true; return; }
    const s = 1.1 + SR() * 0.5;
    _pp.set(impact[i * 2], impact[i * 2 + 1], GLASS_D - 0.012);
    _qq.setFromAxisAngle(_zAxis, SR() * Math.PI * 2);
    _ss.set(SR() < 0.5 ? -s : s, s, 1);
    _lm.compose(_pp, _qq, _ss);
    _wm.multiplyMatrices(frames[i].m, _lm);
    cracks.setMatrixAt(i, _wm); cracked[i] = 1;
    cracks.instanceMatrix.needsUpdate = true;
  }
  function setImpact(i, x, y, z) {
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      _tv.set(x, y, z).applyMatrix4(winInv[i]);
      impact[i * 2] = THREE.MathUtils.clamp(_tv.x, -0.6, 0.6); impact[i * 2 + 1] = THREE.MathUtils.clamp(_tv.y, SILL + 0.25, TOP - 0.3);
    } else { impact[i * 2] = (SR() - 0.5) * 0.8; impact[i * 2 + 1] = 1.4 + SR() * 0.8; }
  }
  /** First crowbar blow: radial crack web around the impact point (world coords; optional). */
  function crackGlass(id, x, y, z) {
    const i = idxOf.get(id);
    if (i === undefined || !intact[i]) return;
    setImpact(i, x, y, z); setCrack(i, true);
  }
  function setGlass(id, ok) {
    const i = idxOf.get(id);
    if (i === undefined) return;
    ok = !!ok;
    if (ok === intact[i]) return;
    intact[i] = ok;
    glass.setMatrixAt(i, ok ? frames[i].m : ZERO);
    bars.setMatrixAt(i, ok ? frames[i].m : ZERO);
    glass.instanceMatrix.needsUpdate = true; bars.instanceMatrix.needsUpdate = true;
    setCrack(i, false);
    if (ok) { hideWindowShards(i); clearGlitter(i); shards.instanceMatrix.needsUpdate = true; }
    else { if (!cracked[i] && impact[i * 2 + 1] === 0) setImpact(i); shatter(i); impact[i * 2 + 1] = 0; }
  }
  function resetGlass() {
    for (let i = 0; i < frames.length; i++) {
      intact[i] = true; glass.setMatrixAt(i, frames[i].m); bars.setMatrixAt(i, frames[i].m);
      setCrack(i, false); hideWindowShards(i); clearGlitter(i); impact[i * 2] = 0; impact[i * 2 + 1] = 0;
    }
    glitterLive = 0;
    glass.instanceMatrix.needsUpdate = true; bars.instanceMatrix.needsUpdate = true; shards.instanceMatrix.needsUpdate = true; cracks.instanceMatrix.needsUpdate = true;
  }
  for (let i = 0; i < NSH; i++) shardColor(i, 1);   // allocate instanceColor before the first render
  resetGlass();


  // -------------------------------------------------------------------- barrels
  const proto = createBarrelMesh(ctx);
  const BR = 0.33;                 // barrel radius at the bulge
  const yLow = 0.11 + BR;          // on the chocks
  const yTop = yLow + Math.sqrt((2 * BR) ** 2 - 0.35 ** 2);
  // stealable: two groups of 5 (3 below, 2 nested on top), axis along X (heads toward the player).
  // barrelSlots[i] = { pos: barrel centre (world), yaw, quat }. Convention (shared with gangsters.js): yaw is
  // rotation.y applied to a barrel lying with its axis along local X, i.e. createBarrelMesh (axis local Y)
  // rotated z = π/2, then rotation.y = yaw  →  mesh.rotation.set(0, yaw, Math.PI / 2). quat is that rotation.
  const barrelSlots = [];
  {
    const low = [-3.9, -3.2, -2.5], top = [-3.55, -2.85];
    const order = [];
    for (const z of low) for (const s of [-1, 1]) order.push([s * 6.5, yLow, z]);
    for (const z of top) for (const s of [-1, 1]) order.push([s * 6.5, yTop, z]);
    for (const [x, y, z] of order) {
      const yaw = 0;
      barrelSlots.push({ pos: new THREE.Vector3(x, y, z), yaw, quat: barrelQuat(yaw) });
    }
  }
  const barrels = new THREE.InstancedMesh(proto.geometry, proto.material, barrelSlots.length);
  barrels.name = 'hall-barrels'; barrels.castShadow = true; barrels.receiveShadow = true; barrels.frustumCulled = false; barrels.userData.dynamic = true;
  root.add(barrels);
  const slotMat = barrelSlots.map((s) => new THREE.Matrix4().compose(s.pos, s.quat, _one));
  const visible = barrelSlots.map(() => true);
  function setBarrelVisible(i, v) {
    if (!(i >= 0 && i < barrelSlots.length)) return;
    visible[i] = !!v;
    barrels.setMatrixAt(i, visible[i] ? slotMat[i] : ZERO);
    barrels.instanceMatrix.needsUpdate = true;
  }
  function setBarrels(n) {
    const k = Math.max(0, Math.min(barrelSlots.length, Math.round(n)));
    for (let i = 0; i < barrelSlots.length; i++) { visible[i] = i < k; barrels.setMatrixAt(i, visible[i] ? slotMat[i] : ZERO); }
    barrels.instanceMatrix.needsUpdate = true;
  }
  setBarrels(barrelSlots.length);

  // decorative: barrel pyramid along the back wall (axis along Z, heads to the hall) + barrels on the conveyor
  {
    const list = [];
    const zW = 6.35;
    for (let r = 0; r < 3; r++) {
      const n = 13 - r, x0 = -10.25 + r * 0.35, y = 0.03 + BR + r * Math.sqrt((2 * BR) ** 2 - 0.35 ** 2);
      for (let k = 0; k < n; k++) list.push([x0 + k * 0.7, y, zW, Math.PI / 2]);   // axis along Z
    }
    for (const z of [1.1, 2.3, 3.4, 4.5]) list.push([-7.2, 0.8 + 0.3, z, 0]);       // axis along X
    const deco = new THREE.InstancedMesh(proto.geometry, proto.material, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), qr = new THREE.Quaternion(), br = rng(5);
    list.forEach(([x, y, z, yaw], i) => {
      barrelQuat(yaw, q);
      qr.setFromAxisAngle(_up, (br() - 0.5) * 1.2);               // random roll about the barrel's own axis
      m.compose(new THREE.Vector3(x, y, z), q.multiply(qr), _one);
      deco.setMatrixAt(i, m);
    });
    deco.name = 'hall-barrelwall'; deco.castShadow = true; deco.receiveShadow = true;
    deco.computeBoundingSphere();
    root.add(deco);
  }

  // -------------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0x8090bb, 0x3d3228, 1.0);
  hemi.name = 'hall-hemi';
  root.add(hemi);

  const moon = new THREE.DirectionalLight(0xa8bdea, 1.6);
  moon.name = 'hall-moon';
  const target = new THREE.Vector3(0, 0, -3);
  moon.position.copy(target).addScaledVector(MOON_DIR, 45);
  moon.target.position.copy(target);
  moon.castShadow = true;
  const sm = (ctx.config?.render?.shadowMapSize || 1024) * (high ? 2 : 1);
  moon.shadow.mapSize.set(sm, sm);
  Object.assign(moon.shadow.camera, { left: -17, right: 17, top: 15, bottom: -15, near: 5, far: 90 });
  moon.shadow.camera.updateProjectionMatrix();
  moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.035;
  root.add(moon, moon.target);

  // pendant lamps over the arena: cord + enamel shade, bulb, PointLight; gently swinging
  const lampDefs = [[-6.5, -3, true], [6.5, -3, false], [0, -5, false]];
  const lamps = [];
  const LAMP_I = 36;
  {
    const lb = new Builder(kit);
    const L = 1.75;
    cylBetween(lb, [0, 0, 0], [0, -L + 0.2, 0], 0.008, C.cord, 5);
    addGeo(lb, new THREE.CylinderGeometry(0.035, 0.03, 0.08, 8), M4(0, -L + 0.22, 0), 0x2a2620);
    const outer = new THREE.CylinderGeometry(0.05, 0.3, 0.2, 16, 1, true);
    lb.add(outer, M4(0, -L + 0.1, 0), C.enamelOut);
    const inner = flipped(new THREE.CylinderGeometry(0.048, 0.292, 0.2, 16, 1, true));
    lb.add(inner, M4(0, -L + 0.1, 0), C.enamelIn);
    addGeo(lb, new THREE.TorusGeometry(0.3, 0.012, 4, 16), M4(0, -L, 0, 0, 1, 1, 1, Math.PI / 2), 0x1c2a22);
    outer.dispose(); inner.dispose();
    const shadeGeo = lb.geometry();
    const bulbGeo = new THREE.SphereGeometry(0.065, 12, 8);
    bulbGeo.scale(1, 1.25, 1); bulbGeo.translate(0, -L + 0.02, 0);
    lampDefs.forEach(([x, z, flick], i) => {
      const gr = new THREE.Group();
      gr.name = 'hall-lamp' + i; gr.position.set(x, 6.16, z); gr.userData.dynamic = true;
      const shade = new THREE.Mesh(shadeGeo, kit.mats.props); shade.castShadow = false; shade.receiveShadow = false;
      const bulb = new THREE.Mesh(bulbGeo, flick ? mats.bulbFlicker : mats.bulb);
      const light = new THREE.PointLight(0xffc888, LAMP_I, 24, 2);
      light.position.set(0, -L - 0.03, 0);
      gr.add(shade, bulb, light);
      root.add(gr);
      lamps.push({ gr, light, flick, base: LAMP_I, phase: i * 1.7 + 0.4 });
    });
  }
  const bulbBase = new THREE.Color(0xffe3ad);

  function update(dt, t) {
    flywheel.rotation.z = -t * 0.45;
    const h = Math.min(dt || 0, 0.05);
    if (h > 0) { stepShards(h); stepGlitter(h); }
    for (const l of lamps) {
      l.gr.rotation.x = 0.02 * Math.sin(t * 0.83 + l.phase);
      l.gr.rotation.z = 0.015 * Math.sin(t * 0.61 + l.phase * 1.3);
      if (l.flick) {
        const cyc = (t + 2.3) % 8.5;
        let f = 0.97 + 0.03 * Math.sin(t * 37);
        if (cyc < 0.6) f = Math.sin(t * 63) * Math.sin(t * 21.7) > -0.15 ? 0.85 : 0.35;
        else if (cyc > 5.0 && cyc < 5.1) f = 0.55;
        l.light.intensity = l.base * f;
        mats.bulbFlicker.color.copy(bulbBase).multiplyScalar(0.25 + 0.75 * f);
      }
    }
  }

  // -------------------------------------------------------------------- API
  const windows = frames.map((f) => ({
    id: f.id,
    sill: new THREE.Vector3(0, SILL, 0).applyMatrix4(f.m),
    normal: new THREE.Vector3(0, 0, -1).transformDirection(f.m).round(),
    width: 2 * WR, sillY: SILL, topY: TOP,
  }));
  for (const w of windows) { w.normal.addScalar(0); w.sill.x = Math.round(w.sill.x * 1000) / 1000; w.sill.z = Math.round(w.sill.z * 1000) / 1000; }

  return {
    windows,
    player: PLAYER.clone(),
    barrelSlots,
    setBarrelVisible,
    setBarrels,
    setGlass,
    resetGlass,
    crackGlass,
    update,
    root,
    lights: { hemi, moon, bulbs: lamps.map((l) => l.light) },
  };
}
