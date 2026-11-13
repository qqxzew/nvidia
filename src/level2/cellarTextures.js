// Level 2 cellar — procedural textures (owner: world). All <= 1024 px, sRGB, mipmapped, created once.
// Brick + flagstone carry an extra mask in the alpha channel (whitewash threshold / gloss), so they are
// uploaded as DataTextures (canvas alpha would be premultiplied and lose precision).
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rgba = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function setupTex(t, repeat, aniso = 4) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
const canvasTex = (c, repeat = true, aniso = 4) => setupTex(new THREE.CanvasTexture(c), repeat, aniso);
function dataTex(c, alphaFn, repeat = true) {
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const data = new Uint8Array(w * h * 4);
  // DataTexture rows go bottom-up (no flipY); copy flipped so it matches canvas orientation
  for (let y = 0; y < h; y++) {
    const sy = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const s = (sy * w + x) * 4, d = (y * w + x) * 4;
      data[d] = src[s]; data[d + 1] = src[s + 1]; data[d + 2] = src[s + 2];
      data[d + 3] = Math.max(0, Math.min(255, Math.round(alphaFn(x, sy) * 255)));
    }
  }
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  return setupTex(t, repeat, 4);
}

/** periodic value noise (period = size), octaves summed, result 0..1 */
function tiledNoise(size, baseCells, octaves, R) {
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const n = baseCells << o, grid = new Float32Array(n * n);
    for (let i = 0; i < grid.length; i++) grid[i] = R();
    const cs = size / n;
    for (let y = 0; y < size; y++) {
      const gy = y / cs, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      const r0 = (y0 % n) * n, r1 = ((y0 + 1) % n) * n;
      for (let x = 0; x < size; x++) {
        const gx = x / cs, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const c0 = x0 % n, c1 = (x0 + 1) % n;
        const a = grid[r0 + c0] + (grid[r0 + c1] - grid[r0 + c0]) * sx;
        const b = grid[r1 + c0] + (grid[r1 + c1] - grid[r1 + c0]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function speckle(g, w, h, R, n, rMin, rMax, colorFn) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = rMin + R() * (rMax - rMin);
    g.fillStyle = colorFn(R);
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      if (x + ox < -r || x + ox > w + r || y + oy < -r || y + oy > h + r) continue;
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.283); g.fill();
    }
  }
}

// ------------------------------------------------------------------ brick (tile = BRICK_TILE metres)
export const BRICK_TILE = 2.4;
function drawBrick() {
  const S = 1024, c = makeCanvas(S, S), g = c.getContext('2d'), R = rng(1912);
  const RH = 32, J = 4;                      // course height / joint (px)
  g.fillStyle = '#4e463d'; g.fillRect(0, 0, S, S);
  speckle(g, S, S, R, 3000, 0.6, 1.8, (r) => { const v = 50 + r() * 50; return rgba(v, v * 0.92, v * 0.8, 0.5); });
  const courses = S / RH;
  const rowInfo = [];
  for (let r = 0; r < courses; r++) {
    const header = r % 2 === 1;
    const bw = header ? 64 : 128;
    const off = header ? 32 : (r % 4 === 0 ? 0 : 64);
    rowInfo.push({ bw, off });
    for (let k = -1; k <= S / bw; k++) {
      const x = off + k * bw, y = r * RH;
      let br = 92 + R() * 32, bg = 60 + R() * 16, bb = 50 + R() * 12;
      const kind = R();
      if (kind < 0.12) { br *= 0.6; bg *= 0.66; bb *= 0.72; }                 // over-fired, almost black
      else if (kind < 0.2) { br += 26; bg += 22; bb += 18; }                    // pale
      else if (kind < 0.27) { br -= 10; bg += 6; bb += 8; }                     // brownish
      for (const ox of [-S, 0, S]) {
        const bx = x + ox + J / 2, by = y + J / 2, w = bw - J, h = RH - J;
        if (bx > S || bx + w < 0) continue;
        const gr = g.createLinearGradient(0, by, 0, by + h);
        gr.addColorStop(0, rgba(br + 18, bg + 12, bb + 8));
        gr.addColorStop(0.5, rgba(br, bg, bb));
        gr.addColorStop(1, rgba(br - 22, bg - 14, bb - 10));
        g.fillStyle = gr;
        g.beginPath(); g.roundRect ? g.roundRect(bx, by, w, h, 3) : g.rect(bx, by, w, h); g.fill();
      }
    }
  }
  // surface grain, chips, soot specks
  speckle(g, S, S, R, 9000, 0.5, 1.5, (r) => (r() < 0.5 ? rgba(0, 0, 0, 0.16) : rgba(255, 220, 190, 0.07)));
  speckle(g, S, S, R, 260, 2, 6, () => rgba(40, 32, 28, 0.35));
  speckle(g, S, S, R, 90, 4, 14, () => rgba(20, 16, 14, 0.12));
  const mask = tiledNoise(S, 4, 5, rng(77));
  const fine = tiledNoise(S, 32, 2, rng(78));
  const isJoint = (x, y) => {
    const r = Math.floor(y / RH) % courses, yy = y % RH;
    if (yy < J / 2 + 1 || yy >= RH - J / 2 - 1) return true;
    const ri = rowInfo[r];
    const xx = (((x - ri.off) % ri.bw) + ri.bw) % ri.bw;
    return xx < J / 2 + 1 || xx >= ri.bw - J / 2 - 1;
  };
  // alpha = whitewash threshold (whitewash shows where the per-vertex amount exceeds it);
  // joints keep their lime longest
  return dataTex(c, (x, y) => {
    const i = y * S + x;
    let a = 0.18 + 0.8 * (mask[i] * 0.8 + fine[i] * 0.2);
    if (isJoint(x, y)) a -= 0.2;
    return Math.max(0.03, Math.min(1, a));
  });
}

// ------------------------------------------------------------------ flagstones (tile = FLOOR_TILE metres)
export const FLOOR_TILE = 4;
function drawFlags() {
  const S = 1024, c = makeCanvas(S, S), g = c.getContext('2d'), R = rng(1926);
  const m = makeCanvas(S, S), mg = m.getContext('2d');
  g.fillStyle = '#211d19'; g.fillRect(0, 0, S, S);
  mg.fillStyle = '#000'; mg.fillRect(0, 0, S, S);
  let heights = [], sum = 0;
  while (sum < S - 120) { const h = 120 + R() * 110; heights.push(h); sum += h; }
  heights = heights.map((h) => h * S / sum);
  let y = 0;
  for (const rh of heights) {
    let widths = [], ws = 0;
    while (ws < S - 150) { const w = 150 + R() * 150; widths.push(w); ws += w; }
    widths = widths.map((w) => w * S / ws);
    let x = R() * S;
    for (const w of widths) {
      const tone = 86 + R() * 38, warm = R() * 10;
      const J = 4 + R() * 4;
      for (const ox of [-S, 0, S]) {
        const sx = x + ox + J / 2, sy = y + J / 2, sw = w - J, sh = rh - J;
        if (sx > S || sx + sw < 0) continue;
        const gr = g.createRadialGradient(sx + sw * 0.5, sy + sh * 0.5, 10, sx + sw * 0.5, sy + sh * 0.5, Math.max(sw, sh) * 0.7);
        gr.addColorStop(0, rgba(tone + warm, tone, tone - 6 - warm * 0.5));
        gr.addColorStop(1, rgba(tone * 0.72 + warm, tone * 0.7, tone * 0.66));
        g.fillStyle = gr;
        g.beginPath(); g.roundRect ? g.roundRect(sx, sy, sw, sh, 9) : g.rect(sx, sy, sw, sh); g.fill();
        mg.fillStyle = '#fff';
        mg.beginPath(); mg.roundRect ? mg.roundRect(sx, sy, sw, sh, 9) : mg.rect(sx, sy, sw, sh); mg.fill();
        // cracks
        if (R() < 0.35) {
          g.strokeStyle = 'rgba(20,16,12,0.7)'; g.lineWidth = 1.5;
          g.beginPath(); let cx = sx + R() * sw, cy = sy; g.moveTo(cx, cy);
          for (let k = 0; k < 6; k++) { cx += (R() - 0.5) * 40; cy += sh / 6; g.lineTo(cx, cy); }
          g.stroke();
        }
      }
      x = (x + w) % S;
    }
    y += rh;
  }
  speckle(g, S, S, R, 14000, 0.5, 1.6, (r) => { const v = 40 + r() * 110; return rgba(v, v * 0.97, v * 0.9, 0.22); });
  speckle(g, S, S, R, 300, 6, 26, (r) => rgba(30 + r() * 30, 26, 20, 0.12));   // stains
  speckle(g, S, S, R, 120, 3, 9, () => rgba(140, 130, 112, 0.10));              // worn lighter spots
  const md = mg.getImageData(0, 0, S, S).data;
  const gl = tiledNoise(S, 4, 4, rng(5));
  return dataTex(c, (x, y) => {
    const i = y * S + x;
    const slab = md[i * 4] / 255;
    return slab < 0.5 ? 0.97 : 0.18 + gl[i] * 0.6;               // gloss: water stands in the joints
  });
}

// ------------------------------------------------------------------ wood planks (tile = 1 m)
function drawWood() {
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'), R = rng(44);
  g.fillStyle = '#6e5038'; g.fillRect(0, 0, S, S);
  const boards = 4, bh = S / boards;
  for (let b = 0; b < boards; b++) {
    const t = 0.8 + R() * 0.35;
    g.fillStyle = rgba(118 * t, 84 * t, 56 * t); g.fillRect(0, b * bh + 2, S, bh - 4);
    for (let k = 0; k < 26; k++) {
      const yy = b * bh + 4 + R() * (bh - 8), amp = 2 + R() * 5, ph = R() * 6, fr = 0.01 + R() * 0.02;
      g.strokeStyle = rgba(60 * t, 40 * t, 26 * t, 0.35 + R() * 0.3); g.lineWidth = 0.8 + R() * 1.6;
      g.beginPath();
      for (let x = 0; x <= S; x += 16) { const yv = yy + Math.sin(x * fr * 6.283 / 8 + ph) * amp; if (x) g.lineTo(x, yv); else g.moveTo(x, yv); }
      g.stroke();
    }
    if (R() < 0.6) { // knot
      const kx = R() * S, ky = b * bh + bh * (0.3 + R() * 0.4);
      g.fillStyle = 'rgba(40,26,16,0.7)'; g.beginPath(); g.ellipse(kx, ky, 9, 5, 0, 0, 6.283); g.fill();
    }
    g.fillStyle = 'rgba(20,12,8,0.85)'; g.fillRect(0, b * bh, S, 3);
  }
  speckle(g, S, S, R, 2500, 0.5, 1.4, () => rgba(0, 0, 0, 0.18));
  return canvasTex(c);
}

// ------------------------------------------------------------------ lager cask atlas
// left half (u 0..0.5): staves around (u) x length (v 0..0.88); v 0.9..1 = iron hoop strip.
// right half: 2 x 4 cask heads (256 px each) with chalk marks.
export const CASK_HEADS = 8;
export function caskHeadRect(i) { const col = i % 2, row = (i >> 1); return [0.5 + col * 0.25, 1 - (row + 1) * 0.25, 0.5 + (col + 1) * 0.25, 1 - row * 0.25]; }

function chalkLayer(w, h, drawFn, seed, erase = 0.35) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = '#ece8dc'; g.strokeStyle = '#ece8dc';
  for (let k = 0; k < 3; k++) {
    g.save(); g.globalAlpha = 0.45; g.translate((R() - 0.5) * 2.2, (R() - 0.5) * 2.2);
    drawFn(g, R); g.restore();
  }
  g.globalCompositeOperation = 'destination-out';
  speckle(g, w, h, R, Math.floor(w * h * 0.012), 0.5, 1.6, () => `rgba(0,0,0,${erase + R() * 0.5})`);
  g.globalCompositeOperation = 'source-over';
  return c;
}

function drawCask() {
  const S = 1024, c = makeCanvas(S, S), g = c.getContext('2d'), R = rng(321);
  // staves
  const staves = 22, sw = 512 / staves;
  for (let s = 0; s < staves; s++) {
    const t = 0.78 + R() * 0.4;
    g.fillStyle = rgba(104 * t, 72 * t, 48 * t); g.fillRect(s * sw, 0, sw + 1, S * 0.9);
    for (let k = 0; k < 9; k++) {
      const x = s * sw + R() * sw;
      g.strokeStyle = rgba(30 * t, 18 * t, 10 * t, 0.4 + R() * 0.3); g.lineWidth = 0.7 + R();
      g.beginPath(); g.moveTo(x, 0);
      for (let y = 0; y <= S * 0.9; y += 40) g.lineTo(x + Math.sin(y * 0.01 + k) * 1.5, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(10,6,4,0.9)'; g.fillRect(s * sw, 0, 1.6, S * 0.9);
    // wet sheen streaks / wear
    if (R() < 0.5) { g.fillStyle = 'rgba(150,120,90,0.10)'; g.fillRect(s * sw + 3, 0, sw * 0.4, S * 0.9); }
  }
  // drips + stains
  for (let i = 0; i < 40; i++) {
    const x = R() * 512, y0 = R() * S * 0.6, len = 40 + R() * 200;
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, 'rgba(15,10,6,0.35)'); gr.addColorStop(1, 'rgba(15,10,6,0)');
    g.fillStyle = gr; g.fillRect(x, y0, 3 + R() * 6, len);
  }
  // iron strip
  g.fillStyle = '#2c2926'; g.fillRect(0, S * 0.9, 512, S * 0.1);
  for (let i = 0; i < 300; i++) { g.fillStyle = R() < 0.5 ? rgba(96, 52, 30, 0.45) : rgba(70, 66, 60, 0.4); g.fillRect(R() * 512, S * 0.9 + R() * S * 0.1, 2 + R() * 7, 1 + R() * 4); }
  // heads
  const marks = [
    { t: ['Č. 41'], tally: 3 }, { t: ['XXIII'], cross: true }, { t: ['Č. 17', '1925'] }, { t: ['LEŽÁK', '12°'] },
    { t: ['Č. 8'], tally: 5 }, { t: ['XIV'] }, { t: ['Č. 33', '9/26'] }, { t: ['Č. 52'], cross: true },
  ];
  for (let i = 0; i < CASK_HEADS; i++) {
    const col = i % 2, row = i >> 1, x0 = 512 + col * 256, y0 = row * 256;
    g.save(); g.beginPath(); g.rect(x0, y0, 256, 256); g.clip();
    const boards = 6, bh = 256 / boards;
    for (let b = 0; b < boards; b++) {
      const t = 0.85 + R() * 0.35;
      g.fillStyle = rgba(128 * t, 94 * t, 64 * t); g.fillRect(x0, y0 + b * bh, 256, bh);
      for (let k = 0; k < 6; k++) {
        g.strokeStyle = rgba(40, 26, 16, 0.3 + R() * 0.3); g.lineWidth = 0.8;
        const yy = y0 + b * bh + R() * bh; g.beginPath(); g.moveTo(x0, yy); g.bezierCurveTo(x0 + 80, yy + 3, x0 + 170, yy - 3, x0 + 256, yy + 1); g.stroke();
      }
      g.fillStyle = 'rgba(12,8,5,0.9)'; g.fillRect(x0, y0 + b * bh, 256, 2);
    }
    // darkened rim, bung, tap plate
    const rg = g.createRadialGradient(x0 + 128, y0 + 128, 70, x0 + 128, y0 + 128, 130);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(8,5,3,0.6)');
    g.fillStyle = rg; g.fillRect(x0, y0, 256, 256);
    g.fillStyle = '#3a2c1c'; g.beginPath(); g.arc(x0 + 128, y0 + 214, 15, 0, 6.283); g.fill();
    g.strokeStyle = '#7c6a40'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#16100a'; g.beginPath(); g.arc(x0 + 128, y0 + 214, 6, 0, 6.283); g.fill();
    // chalk
    const mk = marks[i];
    const layer = chalkLayer(256, 256, (cg, r) => {
      cg.textAlign = 'center'; cg.textBaseline = 'middle';
      cg.save(); cg.translate(128, 104); cg.rotate((r() - 0.5) * 0.16);
      mk.t.forEach((line, li) => { cg.font = `bold ${li ? 34 : 46}px "Trebuchet MS", Arial, sans-serif`; cg.fillText(line, 0, (li - (mk.t.length - 1) / 2) * 46); });
      cg.restore();
      cg.lineWidth = 3.5; cg.lineCap = 'round';
      if (mk.tally) for (let k = 0; k < mk.tally; k++) { cg.beginPath(); cg.moveTo(84 + k * 13, 150); cg.lineTo(88 + k * 13, 182); cg.stroke(); }
      if (mk.tally === 5) { cg.beginPath(); cg.moveTo(76, 176); cg.lineTo(150, 152); cg.stroke(); }
      if (mk.cross) { cg.beginPath(); cg.moveTo(100, 150); cg.lineTo(156, 186); cg.moveTo(156, 150); cg.lineTo(100, 186); cg.stroke(); }
      cg.beginPath(); cg.moveTo(70, 62); cg.lineTo(186, 58); cg.stroke(); // underline / check stroke
    }, 900 + i, 0.4);
    g.globalAlpha = 0.7; g.drawImage(layer, x0, y0); g.globalAlpha = 1;
    g.restore();
  }
  return canvasTex(c);
}

// ------------------------------------------------------------------ decal atlas (transparent)
// rects in canvas px (x, y, w, h), y from the top. uvOf() converts for flipY = true.
export const DECAL = {
  target: [0, 0, 1024, 512],
  web0: [0, 512, 256, 256], web1: [256, 512, 256, 256],
  noSmoke: [512, 512, 512, 128], lift: [512, 640, 512, 128],
  arrowL: [0, 768, 512, 128], arrowR: [512, 768, 512, 128],
  bay0: [0, 896, 256, 128], bay1: [256, 896, 256, 128], bay2: [512, 896, 256, 128], bay3: [768, 896, 256, 128],
};
/** [u0, v0, u1, v1] with v1 = top edge of the rect */
export function decalUV(name) { const [x, y, w, h] = DECAL[name]; return [(x + 1) / 1024, 1 - (y + h - 1) / 1024, (x + w - 1) / 1024, 1 - (y + 1) / 1024]; }

function enamel(g, x, y, w, h, bg, ink, lines, R, { oval = false } = {}) {
  g.save();
  g.beginPath();
  if (oval) g.ellipse(x + w / 2, y + h / 2, w / 2 - 2, h / 2 - 2, 0, 0, 6.283); else g.roundRect ? g.roundRect(x + 2, y + 2, w - 4, h - 4, 14) : g.rect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle = bg; g.fill();
  g.lineWidth = 5; g.strokeStyle = ink; g.stroke();
  g.clip();
  g.beginPath();
  if (oval) g.ellipse(x + w / 2, y + h / 2, w / 2 - 12, h / 2 - 12, 0, 0, 6.283); else g.rect(x + 12, y + 12, w - 24, h - 24);
  g.lineWidth = 2; g.stroke();
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([txt, size], i) => {
    g.font = `bold ${size}px Georgia, "Times New Roman", serif`;
    const yy = y + h / 2 + (i - (lines.length - 1) / 2) * size * 1.1;
    let s = size; while (g.measureText(txt).width > w - 40 && s > 10) { s -= 2; g.font = `bold ${s}px Georgia, serif`; }
    g.fillText(txt, x + w / 2, yy + 2);
  });
  // chipped enamel (dark iron showing through) + rust runs + grime
  for (let i = 0; i < 26; i++) {
    const cx = x + R() * w, cy = y + (R() < 0.6 ? (R() < 0.5 ? 6 + R() * 16 : h - 6 - R() * 16) : R() * h), r = 2 + R() * 7;
    g.fillStyle = '#1a1714'; g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(110,56,26,0.5)'; g.fillRect(cx - 1, cy, 2.5, 6 + R() * 22);
  }
  const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(30,24,18,0.05)'); gr.addColorStop(1, 'rgba(30,24,18,0.35)');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.restore();
}

function drawDecals() {
  const S = 1024, c = makeCanvas(S, S), g = c.getContext('2d'), R = rng(2024);
  g.clearRect(0, 0, S, S);
  // --- chalk delivery zone: rectangle + corner hatching + STÁČÍRNA + arrow (arrow points to the canvas top = north)
  const tgt = chalkLayer(1024, 512, (cg, r) => {
    cg.lineCap = 'round'; cg.lineJoin = 'round';
    const wob = (x, y) => [x + (r() - 0.5) * 4, y + (r() - 0.5) * 4];
    const line = (x0, y0, x1, y1, w = 9) => {
      cg.lineWidth = w; cg.beginPath();
      const n = 8; for (let k = 0; k <= n; k++) { const t = k / n; const [x, y] = wob(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t); if (k) cg.lineTo(x, y); else cg.moveTo(x, y); }
      cg.stroke();
    };
    const m = 16;
    line(m, m, 1024 - m, m); line(1024 - m, m, 1024 - m, 512 - m); line(1024 - m, 512 - m, m, 512 - m); line(m, 512 - m, m, m);
    line(m + 14, m + 12, 1024 - m - 10, m + 16, 4); // double stroke on the dock side
    for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [1024 - m, m, -1, 1], [1024 - m, 512 - m, -1, -1], [m, 512 - m, 1, -1]]) {
      for (let k = 1; k <= 5; k++) line(cx + sx * k * 16, cy, cx, cy + sy * k * 16, 5);
    }
    cg.textAlign = 'center'; cg.textBaseline = 'middle';
    cg.save(); cg.translate(512, 330); cg.rotate(-0.02);
    cg.font = 'bold 132px "Trebuchet MS", "Arial Black", Arial, sans-serif';
    cg.fillText('STÁČÍRNA', 0, 0);
    cg.restore();
    // arrow pointing north (to the dock / lift)
    cg.lineWidth = 14;
    line(512, 236, 512, 70, 14);
    cg.beginPath(); cg.moveTo(450, 132); cg.lineTo(512, 58); cg.lineTo(574, 132); cg.stroke();
    // small notes
    cg.font = 'bold 40px "Trebuchet MS", Arial, sans-serif';
    cg.fillText('4 SUDY', 860, 430);
    for (let k = 0; k < 4; k++) line(100 + k * 22, 410, 106 + k * 22, 460, 6);
  }, 11, 0.3);
  g.drawImage(tgt, 0, 0);

  // --- cobwebs (radial threads + sagging rings), white on transparent
  for (let w = 0; w < 2; w++) {
    const [x0, y0] = DECAL['web' + w];
    g.save(); g.translate(x0, y0);
    g.strokeStyle = 'rgba(230,230,225,0.85)'; g.lineWidth = 1.3;
    const ox = w ? 256 : 0, oy = 0; // anchor corner
    const spokes = 9, rings = 8;
    const ang = [];
    for (let s = 0; s < spokes; s++) ang.push((w ? Math.PI / 2 : 0) + (s / (spokes - 1)) * Math.PI / 2 + (R() - 0.5) * 0.08);
    for (const a of ang) { g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(a) * 250, oy + Math.sin(a) * 250); g.stroke(); }
    g.lineWidth = 1;
    for (let rI = 1; rI <= rings; rI++) {
      const rr = rI * 28 + R() * 6;
      g.strokeStyle = `rgba(225,225,220,${0.45 + R() * 0.4})`;
      g.beginPath();
      for (let s = 0; s < spokes; s++) {
        const a = ang[s], px = ox + Math.cos(a) * rr, py = oy + Math.sin(a) * rr;
        if (s === 0) g.moveTo(px, py); else {
          const am = (ang[s - 1] + a) / 2, sag = rr * 0.86;
          g.quadraticCurveTo(ox + Math.cos(am) * sag, oy + Math.sin(am) * sag, px, py);
        }
      }
      g.stroke();
    }
    // torn, dusty strands
    g.strokeStyle = 'rgba(200,200,195,0.5)';
    for (let k = 0; k < 6; k++) { g.beginPath(); const a = ang[Math.floor(R() * spokes)], rr = 60 + R() * 150; g.moveTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr); g.quadraticCurveTo(128, 200, R() * 256, 230 + R() * 20); g.stroke(); }
    g.restore();
  }

  // --- enamel signs
  enamel(g, 512, 512, 512, 128, '#e9e2cf', '#9a1f1a', [['KOUŘENÍ ZAKÁZÁNO!', 54]], R);
  enamel(g, 512, 640, 512, 128, '#23324a', '#efe6c8', [['VÝTAH DO STÁČÍRNY', 40], ['nosnost 1000 kg', 28]], R);
  // --- chalk arrows on the walls
  const arrow = (dir) => chalkLayer(512, 128, (cg) => {
    cg.lineWidth = 9; cg.lineCap = 'round'; cg.lineJoin = 'round';
    cg.font = 'bold 66px "Trebuchet MS", Arial, sans-serif'; cg.textBaseline = 'middle';
    if (dir < 0) {
      cg.beginPath(); cg.moveTo(160, 64); cg.lineTo(30, 64); cg.moveTo(70, 30); cg.lineTo(28, 64); cg.lineTo(70, 98); cg.stroke();
      cg.textAlign = 'left'; cg.fillText('VÝTAH', 190, 68);
    } else {
      cg.beginPath(); cg.moveTo(352, 64); cg.lineTo(482, 64); cg.moveTo(442, 30); cg.lineTo(484, 64); cg.lineTo(442, 98); cg.stroke();
      cg.textAlign = 'right'; cg.fillText('VÝTAH', 322, 68);
    }
  }, 60 + dir, 0.35);
  g.drawImage(arrow(-1), 0, 768); g.drawImage(arrow(1), 512, 768);
  // --- bay number plates (enamel, white on blue)
  ['I', 'II', 'III', 'IV'].forEach((n, i) => enamel(g, i * 256, 896, 256, 128, '#e8e0c8', '#203a5c', [['SKLEP', 24], [n, 58]], R, { oval: true }));
  return canvasTex(c, false, 4);
}

let cache = null;
export function getCellarTextures() {
  if (cache) return cache;
  cache = { brick: drawBrick(), flags: drawFlags(), wood: drawWood(), cask: drawCask(), decals: drawDecals() };
  return cache;
}
