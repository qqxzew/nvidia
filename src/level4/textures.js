import * as THREE from 'three';

// Level 4 "Varna" — procedural CanvasTextures (owner: art). Same hand-painted style as level 1
// (src/world/textures.js): small canvases, sRGB, mipmapped, created lazily (on first access) and shared.
// Level 5 imports getTextures / WALL_TEX / rng from here — keep those working.

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

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = true, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
function speckle(g, w, h, R, n, r0, r1, col) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = r0 + R() * (r1 - r0);
    g.fillStyle = col(R); g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
  }
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function grime(g, w, h, R, n, color, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = rMin + R() * (rMax - rMin);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

// ------------------------------------------------------------------ floor: Mettlach octagon tiles
// 512 px = 1.6 m. Cream/ochre octagons (20 cm) with small terracotta squares, worn and grimy.
function drawFloor() {
  const S = 512, c = canvas(S, S), g = c.getContext('2d'), R = rng(1913);
  g.fillStyle = '#7a6a5a'; g.fillRect(0, 0, S, S); // grout
  const n = 8, s = S / n, k = s * 0.29; // corner cut
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = i * s, y = j * s, t = R();
    const base = 182 + R() * 24;
    let cr = base, cg = base * 0.86, cb = base * 0.66;
    if (t < 0.12) { cr -= 22; cg -= 22; cb -= 16; } else if (t > 0.9) { cr += 8; cg += 10; cb += 12; }
    const gr = g.createLinearGradient(x, y, x + s, y + s);
    gr.addColorStop(0, rgba(cr + 10, cg + 10, cb + 8)); gr.addColorStop(1, rgba(cr - 16, cg - 16, cb - 14));
    g.fillStyle = gr;
    const p = 1.6;
    g.beginPath();
    g.moveTo(x + k, y + p); g.lineTo(x + s - k, y + p); g.lineTo(x + s - p, y + k); g.lineTo(x + s - p, y + s - k);
    g.lineTo(x + s - k, y + s - p); g.lineTo(x + k, y + s - p); g.lineTo(x + p, y + s - k); g.lineTo(x + p, y + k);
    g.closePath(); g.fill();
    // chip / crack
    if (R() < 0.18) {
      g.strokeStyle = 'rgba(60,45,35,0.45)'; g.lineWidth = 1;
      g.beginPath(); let px = x + R() * s, py = y + R() * s; g.moveTo(px, py);
      for (let q = 0; q < 4; q++) { px += (R() - 0.5) * 22; py += (R() - 0.5) * 22; g.lineTo(px, py); }
      g.stroke();
    }
  }
  // terracotta / dark red inserts at the corners
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const x = i * s, y = j * s, r = k * 0.78;
    const dark = (i + j) % 2 === 0;
    g.fillStyle = dark ? rgba(132 + R() * 16, 70, 50) : rgba(96, 62, 48);
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill();
  }
  // wear + dirt + grain
  grime(g, S, S, R, 26, 'rgba(70,55,40,0.16)', 20, 70);
  grime(g, S, S, R, 10, 'rgba(240,225,200,0.08)', 30, 80);
  speckle(g, S, S, R, 2200, 0.4, 1.3, (Rn) => { const v = 60 + Rn() * 150; return rgba(v, v - 6, v - 14, 0.22); });
  return tex(c);
}

// ------------------------------------------------------------------ walls: glazed tile dado + plaster
// 512 x 1024 px = 3.6 m wide x 7.2 m high (canvas top = 7.2 m). Dado up to 2.1 m.
export const WALL_TEX = { width: 3.6, height: 7.2, dado: 2.1 };
function drawWall() {
  const W = 512, H = 1024, c = canvas(W, H), g = c.getContext('2d'), R = rng(77);
  const ppm = H / 7.2, Y = (m) => H - m * ppm;
  // plaster
  const pg = g.createLinearGradient(0, 0, 0, Y(2.1));
  pg.addColorStop(0, '#9e937f'); pg.addColorStop(0.35, '#d7ccb4'); pg.addColorStop(1, '#e6dcc6');
  g.fillStyle = pg; g.fillRect(0, 0, W, Y(2.1));
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = R() < 0.5 ? rgba(0, 0, 0, 0.03 + R() * 0.04) : rgba(255, 250, 235, 0.06);
    g.fillRect(R() * W, R() * Y(2.1), 1 + R() * 6, 1 + R() * 3);
  }
  // damp streaks running down from the top + patches
  for (let i = 0; i < 16; i++) {
    const x = R() * W, w = 6 + R() * 30, len = 120 + R() * 420;
    const gr = g.createLinearGradient(0, 0, 0, len);
    gr.addColorStop(0, 'rgba(80,66,46,0.20)'); gr.addColorStop(1, 'rgba(80,66,46,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, len);
  }
  grime(g, W, Y(2.4), R, 10, 'rgba(110,95,70,0.12)', 30, 90);
  // painted dark-green line above the dado
  g.fillStyle = '#2f4a3a'; g.fillRect(0, Y(2.2), W, 5);
  // dado tiles
  const top = Y(2.1), tw = W / 24, rows = 13, th = (Y(0.15) - Y(1.95)) / 12;
  g.fillStyle = '#7f7a6c'; g.fillRect(0, top, W, H - top);
  // border band: ochre bullnose + dark green row
  g.fillStyle = '#b48a4a'; g.fillRect(0, top, W, Y(2.04) - top);
  for (let i = 0; i < 24; i++) {
    g.fillStyle = rgba(40 + R() * 10, 78 + R() * 12, 60 + R() * 8);
    g.fillRect(i * tw + 1, Y(2.04) + 1, tw - 2, Y(1.95) - Y(2.04) - 2);
  }
  for (let r = 0; r < rows - 1; r++) for (let i = 0; i < 24; i++) {
    const y = Y(1.95) + r * th, v = 214 + R() * 22;
    const gr = g.createLinearGradient(0, y, 0, y + th);
    gr.addColorStop(0, rgba(v + 8, v + 4, v - 8)); gr.addColorStop(1, rgba(v - 14, v - 18, v - 30));
    g.fillStyle = gr; g.fillRect(i * tw + 1, y + 1, tw - 2, th - 2);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(i * tw + 2, y + 2, tw * 0.5, 1.5);
    if (R() < 0.05) { g.strokeStyle = 'rgba(70,60,50,0.5)'; g.beginPath(); g.moveTo(i * tw + R() * tw, y); g.lineTo(i * tw + R() * tw, y + th); g.stroke(); }
  }
  // skirting row (dark brown)
  for (let i = 0; i < 12; i++) { g.fillStyle = rgba(58 + R() * 10, 44, 34); g.fillRect(i * tw * 2 + 1, Y(0.15) + 1, tw * 2 - 2, H - Y(0.15) - 2); }
  // dirt on the lower tiles
  const dg = g.createLinearGradient(0, Y(0.9), 0, H);
  dg.addColorStop(0, 'rgba(60,48,34,0)'); dg.addColorStop(1, 'rgba(60,48,34,0.35)');
  g.fillStyle = dg; g.fillRect(0, Y(0.9), W, H - Y(0.9));
  grime(g, W, H, R, 8, 'rgba(70,60,45,0.10)', 20, 60);
  return tex(c);
}

// ------------------------------------------------------------------ plinth: brick + glazed tile cap band
// 256 x 256 = 1.2 m wide x 1.0 m tall (canvas top = 1.0 m)
function drawBrick() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = rng(5);
  const Y = (m) => S - m * S;
  g.fillStyle = '#4c3a30'; g.fillRect(0, 0, S, S);
  const bh = (Y(0.08) - Y(0.72)) / 9, bw = S / 4.5;
  for (let r = 0; r < 9; r++) {
    const y = Y(0.72) + r * bh, off = (r % 2) * bw * 0.5;
    for (let i = -1; i < 6; i++) {
      const x = i * bw + off, t = R();
      let cr = 128 + R() * 30, cg = 58 + R() * 16, cb = 40 + R() * 10;
      if (t < 0.15) { cr -= 40; cg -= 20; cb -= 10; }
      g.fillStyle = rgba(cr, cg, cb); g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      g.fillStyle = 'rgba(255,220,190,0.07)'; g.fillRect(x + 2, y + 2, bw - 4, 2);
    }
  }
  // base course (dark)
  g.fillStyle = '#2b2622'; g.fillRect(0, Y(0.08), S, S - Y(0.08));
  // glazed tile band (cream + green line) and stone cap
  g.fillStyle = '#2f4a3a'; g.fillRect(0, Y(0.76), S, Y(0.72) - Y(0.76));
  for (let i = 0; i < 8; i++) {
    const v = 214 + R() * 20;
    g.fillStyle = rgba(v, v - 6, v - 22); g.fillRect(i * 32 + 1, Y(0.92) + 1, 30, Y(0.76) - Y(0.92) - 2);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(i * 32 + 2, Y(0.92) + 2, 16, 2);
  }
  g.fillStyle = '#8a8070'; g.fillRect(0, 0, S, Y(0.92));
  // soot above the firebox side + splashes
  speckle(g, S, S, R, 900, 0.4, 1.2, (Rn) => rgba(30, 24, 20, 0.2 + Rn() * 0.2));
  const sg = g.createLinearGradient(0, Y(0.1), 0, S);
  sg.addColorStop(0, 'rgba(30,24,20,0)'); sg.addColorStop(1, 'rgba(30,24,20,0.4)');
  g.fillStyle = sg; g.fillRect(0, Y(0.1), S, S);
  return tex(c);
}

// ------------------------------------------------------------------ copper: hammered colour + roughness
function drawCopper() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = rng(29);
  g.fillStyle = '#d9906a'; g.fillRect(0, 0, S, S);
  // hammer dimples
  for (let i = 0; i < 900; i++) {
    const x = R() * S, y = R() * S, r = 3 + R() * 6;
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    const l = R() < 0.5;
    gr.addColorStop(0, l ? 'rgba(255,214,170,0.22)' : 'rgba(120,50,30,0.18)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // darker oxidised streaks (vertical, from heat) + a hint of verdigris
  for (let i = 0; i < 14; i++) {
    const x = R() * S, w = 4 + R() * 18;
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, 'rgba(90,40,25,0)'); gr.addColorStop(0.5, `rgba(90,40,25,${0.08 + R() * 0.12})`); gr.addColorStop(1, 'rgba(90,40,25,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, S);
  }
  grime(g, S, S, R, 5, 'rgba(70,130,110,0.10)', 10, 26);
  const color = tex(c);

  const r = canvas(S, S), q = r.getContext('2d'), R2 = rng(31);
  q.fillStyle = 'rgb(205,205,205)'; q.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) {
    const x = R2() * S, y = R2() * S, rr = 3 + R2() * 8, v = 150 + R2() * 105;
    const gr = q.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, `rgba(${v},${v},${v},0.5)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    q.fillStyle = gr; q.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // roughness is read from the G channel; keep it linear
  const rough = tex(r, { srgb: false });
  return { color, rough };
}

// ------------------------------------------------------------------ dirty window glass (arched top cut by geometry)
// 256 x 512, pane grid painted in (iron glazing bars), grime heavier at the bottom, a few lighter replaced panes,
// faint silhouette of the neighbouring malt house + chimney behind the glass.
function drawGlass() {
  const W = 256, H = 512, c = canvas(W, H), g = c.getContext('2d'), R = rng(41);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#d7dde0'); bg.addColorStop(0.55, '#b8c1c4'); bg.addColorStop(1, '#8f9590');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // silhouettes outside (very soft)
  g.fillStyle = 'rgba(70,78,84,0.25)';
  g.fillRect(0, H * 0.58, W, H * 0.42);
  g.beginPath(); g.moveTo(0, H * 0.58); g.lineTo(W * 0.3, H * 0.47); g.lineTo(W * 0.62, H * 0.58); g.fill();
  g.fillRect(W * 0.72, H * 0.18, 18, H * 0.42);
  // pane grid
  const cols = 4, rows = 9, cw = W / cols, rh = H / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const t = R();
    if (t < 0.1) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(i * cw, j * rh, cw, rh); }
    else if (t < 0.22) { g.fillStyle = 'rgba(80,80,60,0.22)'; g.fillRect(i * cw, j * rh, cw, rh); }
    // diagonal glint
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath(); g.moveTo(i * cw + 4, j * rh + rh * 0.7); g.lineTo(i * cw + cw * 0.5, j * rh + 3); g.lineTo(i * cw + cw * 0.65, j * rh + 3); g.lineTo(i * cw + 8, j * rh + rh * 0.9); g.fill();
  }
  // grime: dust drifts in the bottom corners of every pane + overall soot
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const gr = g.createLinearGradient(0, j * rh + rh * 0.4, 0, (j + 1) * rh);
    gr.addColorStop(0, 'rgba(90,82,64,0)'); gr.addColorStop(1, 'rgba(90,82,64,0.35)');
    g.fillStyle = gr; g.fillRect(i * cw, j * rh, cw, rh);
  }
  grime(g, W, H, R, 30, 'rgba(80,72,56,0.18)', 14, 60);
  const sg = g.createLinearGradient(0, H * 0.6, 0, H);
  sg.addColorStop(0, 'rgba(70,62,48,0)'); sg.addColorStop(1, 'rgba(70,62,48,0.45)');
  g.fillStyle = sg; g.fillRect(0, 0, W, H);
  // glazing bars
  g.fillStyle = '#25231f';
  for (let i = 0; i <= cols; i++) g.fillRect(i * cw - 3, 0, 6, H);
  for (let j = 0; j <= rows; j++) g.fillRect(0, j * rh - 2.5, W, 5);
  return tex(c, { repeat: false });
}

// ------------------------------------------------------------------ soft gradients for shafts / pools / particles
function drawShaft() {
  const W = 64, H = 256, c = canvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / (W - 1), v = y / (H - 1);
    const edge = Math.sin(Math.PI * u) ** 1.6;
    const along = Math.min(1, v * 6) * (1 - v) ** 1.3;   // v = 0 at the window, fades into the room
    const streak = 0.8 + 0.2 * Math.sin(u * 37.0 + Math.sin(u * 11.0) * 3.0);
    const a = edge * along * streak;
    const i = (y * W + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: false, srgb: false });
}
function drawPool() {
  // opaque: intensity lives in RGB (black outside) so it works as an additive map and as an emissive map
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgb(255,255,255)'); gr.addColorStop(0.35, 'rgb(140,140,140)');
  gr.addColorStop(0.7, 'rgb(38,38,38)'); gr.addColorStop(1, 'rgb(0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(c, { repeat: false, srgb: false });
}
function drawPuff() {
  // soft billowy puff: smooth radial falloff modulated by low-frequency lumps (no hard blob edges)
  const S = 128, c = canvas(S, S), g = c.getContext('2d'), R = rng(3);
  const lumps = Array.from({ length: 9 }, () => ({ a: R() * 6.283, d: 0.12 + R() * 0.22, r: 0.16 + R() * 0.16 }));
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S - 0.5, v = y / S - 0.5, d = Math.hypot(u, v) * 2;
    let l = 0;
    for (const k of lumps) { const dx = u - Math.cos(k.a) * k.d * 0.5, dy = v - Math.sin(k.a) * k.d * 0.5; l += Math.exp(-(dx * dx + dy * dy) / (k.r * k.r * 0.25)); }
    const base = Math.max(0, 1 - d) ** 1.6;
    const a = Math.min(1, base * (0.55 + 0.35 * Math.min(1.5, l)));
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: false, srgb: false });
}

// ------------------------------------------------------------------ glowing coals behind the firebox door
function drawFire() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d'), R = rng(9);
  g.fillStyle = '#3a0d04'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = R() * S, y = S * 0.35 + R() * S * 0.65, r = 6 + R() * 12;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, R() < 0.4 ? '#fff0a0' : '#ffb040'); gr.addColorStop(0.5, 'rgba(255,90,20,0.8)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(20,6,2,0.6)'; g.beginPath(); g.arc(R() * S, S * 0.5 + R() * S * 0.5, 2 + R() * 4, 0, 6.283); g.fill(); }
  return tex(c, { repeat: false });
}

// ------------------------------------------------------------------ catwalk grating panel
// 512 x 512 px = one lane (0.85 m) x 0.85 m along the run. u = across the lane, v = along the running direction.
// Bearing bars run along v, round cross rods every ~10 cm, a flat-bar panel frame on all four sides (the frame on
// the u edges makes the subtle lane seams). Worn bright tops, rust, grime; the gaps show darkness below.
export const GRATE = { size: 0.85 };
function drawGrating() {
  const S = 512, c = canvas(S, S), g = c.getContext('2d'), R = rng(606);
  // darkness under the grating (faint warm floor far below)
  const bg = g.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, '#191512'); bg.addColorStop(1, '#120f0d');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  const F = 14;                       // frame width (px)
  const nb = 22, pitch = (S - 2 * F) / nb, bw = pitch * 0.46;
  // cross rods (under the bearing bars, darker, round)
  for (let y = F + 20; y < S - F; y += 58) {
    const gr = g.createLinearGradient(0, y - 4, 0, y + 4);
    gr.addColorStop(0, '#3a3530'); gr.addColorStop(0.5, '#6a6258'); gr.addColorStop(1, '#2c2824');
    g.fillStyle = gr; g.fillRect(F, y - 4, S - 2 * F, 8);
  }
  // bearing bars (seen from above: narrow tops with bevelled sides)
  for (let i = 0; i < nb; i++) {
    const x = F + i * pitch + (pitch - bw) / 2;
    const v = 132 + R() * 18;
    const gr = g.createLinearGradient(x, 0, x + bw, 0);
    gr.addColorStop(0, rgba(v * 0.55, v * 0.52, v * 0.48)); gr.addColorStop(0.3, rgba(v + 22, v + 18, v + 10));
    gr.addColorStop(0.7, rgba(v + 10, v + 6, v)); gr.addColorStop(1, rgba(v * 0.5, v * 0.47, v * 0.43));
    g.fillStyle = gr; g.fillRect(x, 0, bw, S);
  }
  // worn walking path: brighter steel down the middle, darker grime toward the frame
  const wg = g.createLinearGradient(0, 0, S, 0);
  wg.addColorStop(0, 'rgba(20,16,12,0.35)'); wg.addColorStop(0.25, 'rgba(255,240,215,0.0)');
  wg.addColorStop(0.5, 'rgba(255,240,215,0.10)'); wg.addColorStop(0.75, 'rgba(255,240,215,0.0)'); wg.addColorStop(1, 'rgba(20,16,12,0.35)');
  g.fillStyle = wg; g.fillRect(0, 0, S, S);
  // rust + grime blotches (only tint, keep the gaps dark)
  grime(g, S, S, R, 22, 'rgba(120,58,28,0.22)', 10, 46);
  grime(g, S, S, R, 14, 'rgba(18,14,10,0.30)', 16, 60);
  speckle(g, S, S, R, 1600, 0.5, 1.4, (Rn) => (Rn() < 0.5 ? rgba(30, 24, 18, 0.35) : rgba(170, 150, 120, 0.18)));
  // panel frame flat bars: across (v edges) and along (u edges = lane seams, slightly darker)
  const frame = (x, y, w, h, light) => {
    const gr = w > h ? g.createLinearGradient(0, y, 0, y + h) : g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, '#1c1814'); gr.addColorStop(0.25, light); gr.addColorStop(0.75, '#6e675d'); gr.addColorStop(1, '#1c1814');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  };
  frame(0, 0, S, F, '#9a9183'); frame(0, S - F, S, F, '#9a9183');
  frame(0, 0, F, S, '#857d70'); frame(S - F, 0, F, S, '#857d70');
  // tack welds / rivet heads on the frame
  for (let i = 0; i < 6; i++) for (const [x, y] of [[F / 2, 40 + i * 86], [S - F / 2, 40 + i * 86], [40 + i * 86, F / 2], [40 + i * 86, S - F / 2]]) {
    g.fillStyle = '#9a9184'; g.beginPath(); g.arc(x, y, 3.2, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(x + 1, y + 1, 3.2, 0, 3.14); g.fill();
  }
  const t = tex(c, { aniso: 8 });
  return t;
}

// ------------------------------------------------------------------ tall hall wall: glazed tile dado + plaster (14.4 m)
// 512 x 1024 px = 3.6 m wide x 14.4 m high. Dado up to 2.1 m, painted bands at 2.2 m and 6.0 m, soot toward the top.
export const WALLT = { width: 3.6, height: 14.4 };
function drawWallTall() {
  const W = 512, H = 1024, c = canvas(W, H), g = c.getContext('2d'), R = rng(78);
  const ppm = H / WALLT.height, Y = (m) => H - m * ppm;
  const pg = g.createLinearGradient(0, 0, 0, Y(2.1));
  pg.addColorStop(0, '#5e5547'); pg.addColorStop(0.18, '#8f846f'); pg.addColorStop(0.45, '#c9bea6');
  pg.addColorStop(0.8, '#ddd2bb'); pg.addColorStop(1, '#d9ceb6');
  g.fillStyle = pg; g.fillRect(0, 0, W, Y(2.1));
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = R() < 0.55 ? rgba(0, 0, 0, 0.03 + R() * 0.05) : rgba(255, 250, 235, 0.05);
    g.fillRect(R() * W, R() * Y(2.1), 1 + R() * 7, 1 + R() * 3);
  }
  // damp streaks from the top + from the band at 6 m, flaking patches
  for (let i = 0; i < 20; i++) {
    const x = R() * W, w = 5 + R() * 28, y0 = R() < 0.6 ? 0 : Y(6.0), len = 100 + R() * 380;
    const gr = g.createLinearGradient(0, y0, 0, y0 + len);
    gr.addColorStop(0, 'rgba(70,58,40,0.24)'); gr.addColorStop(1, 'rgba(70,58,40,0)');
    g.fillStyle = gr; g.fillRect(x, y0, w, len);
  }
  grime(g, W, Y(2.4), R, 16, 'rgba(100,86,62,0.13)', 24, 90);
  grime(g, W, Y(9), R, 6, 'rgba(240,232,214,0.10)', 30, 80);
  // painted bands
  g.fillStyle = '#2f4a3a'; g.fillRect(0, Y(2.2), W, 4);
  g.fillStyle = '#6b5638'; g.fillRect(0, Y(6.05), W, 3); g.fillStyle = '#2f4a3a'; g.fillRect(0, Y(6.0), W, 5);
  // dado tiles
  const top = Y(2.1), tw = W / 24, th = (Y(0.15) - Y(1.95)) / 12;
  g.fillStyle = '#7f7a6c'; g.fillRect(0, top, W, H - top);
  g.fillStyle = '#b48a4a'; g.fillRect(0, top, W, Y(2.04) - top);
  for (let i = 0; i < 24; i++) { g.fillStyle = rgba(40 + R() * 10, 78 + R() * 12, 60 + R() * 8); g.fillRect(i * tw + 1, Y(2.04) + 1, tw - 2, Y(1.95) - Y(2.04) - 1); }
  for (let r = 0; r < 12; r++) for (let i = 0; i < 24; i++) {
    const y = Y(1.95) + r * th, v = 210 + R() * 24;
    g.fillStyle = rgba(v, v - 5, v - 20); g.fillRect(i * tw + 1, y + 0.5, tw - 2, th - 1);
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(i * tw + 2, y + 1, tw * 0.5, 1);
  }
  for (let i = 0; i < 12; i++) { g.fillStyle = rgba(58 + R() * 10, 44, 34); g.fillRect(i * tw * 2 + 1, Y(0.15) + 1, tw * 2 - 2, H - Y(0.15) - 2); }
  const dg = g.createLinearGradient(0, Y(0.9), 0, H);
  dg.addColorStop(0, 'rgba(60,48,34,0)'); dg.addColorStop(1, 'rgba(60,48,34,0.4)');
  g.fillStyle = dg; g.fillRect(0, Y(0.9), W, H - Y(0.9));
  return tex(c);
}

// ------------------------------------------------------------------ steam jet core: soft column, bright at the nozzle
function drawJet() {
  const W = 64, H = 256, c = canvas(W, H), g = c.getContext('2d'), R = rng(8);
  const img = g.createImageData(W, H);
  const ph = Array.from({ length: 4 }, () => R() * 6.283);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / (W - 1), v = 1 - y / (H - 1); // v = 0 at the nozzle (canvas bottom)
    const edge = Math.sin(Math.PI * u) ** 1.3;
    const streak = 0.75 + 0.25 * Math.sin(u * 31 + v * 9 + ph[0]) * Math.sin(u * 13 - v * 5 + ph[1]);
    const a = edge * Math.min(1, v * 14 + 0.25) * (1 - v) ** 1.4 * streak;
    const i = (y * W + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(Math.min(1, a) * 255);
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: false, srgb: false });
}

// ------------------------------------------------------------------ level 4 decal atlas (1024 x 1024)
// enamel signs, section plates, gauge, clock, chalk board, jute sack print, crate planks. Rects (u0, v0, u1, v1), v1 = top.
const px = (x0, y0, x1, y1) => [x0 / 1024, 1 - y1 / 1024, x1 / 1024, 1 - y0 / 1024];
export const DECALS4 = {
  steam: px(0, 0, 512, 128), smoke: px(512, 0, 1024, 128),
  mash: px(0, 128, 512, 256), lauter: px(512, 128, 1024, 256),
  kettles: px(0, 256, 512, 384), hops: px(512, 256, 1024, 384),
  cool: px(0, 384, 512, 512), valve: px(512, 384, 1024, 512),
  gauge: px(0, 512, 256, 768), clock: px(256, 512, 512, 768), board: px(512, 512, 1024, 768),
  jute: px(0, 768, 512, 1024), crate: px(512, 768, 1024, 1024),
};
// v2 section ids → plates
Object.assign(DECALS4, { varna: DECALS4.kettles, tower: DECALS4.mash, bridge: DECALS4.lauter, cellarTower: DECALS4.hops });
function drawDecals4() {
  const S = 1024, c = canvas(S, S), g = c.getContext('2d'), R = rng(4);
  const chips = (x, y, w, h, n) => { for (let i = 0; i < n; i++) { g.fillStyle = 'rgba(30,26,22,0.85)'; g.beginPath(); g.arc(x + R() * w, y + (R() < 0.5 ? R() * 10 : h - R() * 10), 2 + R() * 5, 0, 6.283); g.fill(); } };
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const enamel = (x, y, fill, text, size = 48) => {
    g.fillStyle = '#e8e2d2'; roundRect(g, x + 4, y + 4, 504, 120, 14); g.fill();
    g.fillStyle = fill; roundRect(g, x + 12, y + 12, 488, 104, 10); g.fill();
    g.fillStyle = '#f2ecdc'; g.font = `bold ${size}px Georgia, serif`; g.fillText(text, x + 256, y + 66, 460);
    chips(x + 8, y + 8, 496, 112, 12);
  };
  enamel(0, 0, '#8c2a22', 'POZOR! HORKÁ PÁRA');
  enamel(512, 0, '#1f3d6e', 'KOUŘITI SE ZAKAZUJE', 46);
  // section plates: green enamel, brass border, two lines
  const plate = (x, y, big, small) => {
    g.fillStyle = '#1e3a2c'; roundRect(g, x + 4, y + 4, 504, 120, 12); g.fill();
    g.strokeStyle = '#c9a65a'; g.lineWidth = 5; roundRect(g, x + 14, y + 14, 484, 100, 8); g.stroke();
    g.fillStyle = '#e9dcb4'; g.font = 'bold 50px Georgia, serif'; g.fillText(big, x + 256, y + 56, 450);
    g.font = 'bold 19px Georgia, serif'; g.fillText(small, x + 256, y + 98, 450);
    chips(x + 8, y + 8, 496, 112, 5);
  };
  // level 4 v2 sections (the old mash / lauter / hops slots are reused: keys kept, aliases on DECALS4)
  plate(0, 128, 'HODINOVÁ VĚŽ', 'VARNA · ČESKÝ PLZEŇSKÝ PIVOVAR');
  plate(512, 128, 'KRYTÝ MOST', 'VARNA → VĚŽ SKLEPŮ · NAD VLEČKOU');
  plate(0, 256, 'MLADINOVÉ PÁNVE', 'VARNA · 2. PATRO · CHMELOVAR');
  plate(512, 256, 'VĚŽ SKLEPŮ', 'SCHODIŠTĚ · LEŽÁCKÉ SKLEPY');
  plate(0, 384, 'CHLADICÍ ŠTOK', 'LEŽÁCKÉ SKLEPY · CHLAZENÍ MLADINY');
  enamel(512, 384, '#8c2a22', 'HLAVNÍ PARNÍ VENTIL', 44);
  // pressure gauge 256 x 256 at (0, 512): brass bezel, red zone, "atm"
  {
    const cx = 128, cy = 640;
    g.fillStyle = '#9a7a3a'; g.beginPath(); g.arc(cx, cy, 126, 0, 6.283); g.fill();
    g.fillStyle = '#f1ebda'; g.beginPath(); g.arc(cx, cy, 108, 0, 6.283); g.fill();
    g.strokeStyle = '#a8322a'; g.lineWidth = 12; g.beginPath(); g.arc(cx, cy, 90, -Math.PI * 0.25 + 0.02, Math.PI * 0.25); g.stroke();
    g.strokeStyle = '#1d1a17';
    for (let i = 0; i <= 20; i++) {
      const a = -Math.PI * 1.25 + (i / 20) * Math.PI * 1.5, r0 = i % 2 ? 88 : 78;
      g.lineWidth = i % 2 ? 2 : 4; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * 100, cy + Math.sin(a) * 100); g.stroke();
      if (!(i % 4)) { g.fillStyle = '#1d1a17'; g.font = 'bold 20px Georgia, serif'; g.fillText(String(i / 2), cx + Math.cos(a) * 62, cy + Math.sin(a) * 62); }
    }
    g.font = 'bold 22px Georgia, serif'; g.fillText('atm', cx, cy + 44);
    g.font = 'italic 14px Georgia, serif'; g.fillText('Schäffer & Budenberg', cx, cy + 70);
  }
  // clock 256 x 256 at (256, 512)
  {
    const cx = 384, cy = 640;
    g.fillStyle = '#2a2420'; g.beginPath(); g.arc(cx, cy, 126, 0, 6.283); g.fill();
    g.fillStyle = '#f4efe0'; g.beginPath(); g.arc(cx, cy, 112, 0, 6.283); g.fill();
    const roman = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    g.fillStyle = '#1d1a17'; g.font = 'bold 22px Georgia, serif';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283 - Math.PI / 2; g.fillText(roman[i], cx + Math.cos(a) * 88, cy + Math.sin(a) * 88); }
    const hand = (a, l, w) => { g.save(); g.translate(cx, cy); g.rotate(a); g.fillRect(-w / 2, -l, w, l + 10); g.restore(); };
    hand((6.4 / 12) * 6.283, 54, 7); hand((25 / 60) * 6.283, 82, 4.5);
    g.beginPath(); g.arc(cx, cy, 7, 0, 6.283); g.fill();
  }
  // chalk board 512 x 256 at (512, 512)
  {
    g.fillStyle = '#5a4128'; g.fillRect(512, 512, 512, 256);
    g.fillStyle = '#23282a'; g.fillRect(526, 526, 484, 228);
    g.fillStyle = 'rgba(236,232,220,0.9)'; g.textAlign = 'left';
    g.font = 'italic bold 34px Georgia, serif'; g.fillText('Var č. 47 — 1926', 548, 562);
    g.font = 'italic 26px Georgia, serif';
    g.fillText('Rmut   62° – 68°', 552, 606); g.fillText('Sladina   72° – 78°', 552, 642);
    g.fillText('Chmelovar   100°', 552, 678); g.fillText('Chmel žatecký  3×', 552, 714);
    g.textAlign = 'center';
  }
  // jute weave + print 512 x 256 at (0, 768)
  {
    g.fillStyle = '#b09062'; g.fillRect(0, 768, 512, 256);
    for (let y = 768; y < 1024; y += 4) { g.fillStyle = `rgba(80,60,36,${0.12 + R() * 0.1})`; g.fillRect(0, y, 512, 1.5); }
    for (let x = 0; x < 512; x += 4) { g.fillStyle = `rgba(230,210,170,${0.06 + R() * 0.08})`; g.fillRect(x, 768, 1.5, 256); }
    for (let i = 0; i < 10; i++) { const x = R() * 512, y = 768 + R() * 256, r = 20 + R() * 50; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(70,52,30,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.fillStyle = 'rgba(60,36,24,0.8)'; g.font = 'bold 54px Georgia, serif'; g.fillText('ŽATEC', 256, 870);
    g.font = 'bold 30px Georgia, serif'; g.fillText('1926 · 50 kg', 256, 922);
    g.strokeStyle = 'rgba(60,36,24,0.7)'; g.lineWidth = 4; g.strokeRect(120, 820, 272, 130);
  }
  // crate planks + stencil 512 x 256 at (512, 768)
  {
    for (let i = 0; i < 4; i++) {
      const y = 768 + i * 64, v = 150 + R() * 30;
      g.fillStyle = rgba(v, v * 0.72, v * 0.46); g.fillRect(512, y, 512, 64);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(90,60,30,${0.1 + R() * 0.15})`; g.fillRect(512 + R() * 512, y + R() * 64, 30 + R() * 120, 1.2); }
      g.fillStyle = 'rgba(40,26,14,0.8)'; g.fillRect(512, y, 512, 3);
    }
    g.fillStyle = 'rgba(70,40,24,0.85)'; g.fillRect(512, 768, 40, 256); g.fillRect(984, 768, 40, 256);
    g.fillStyle = 'rgba(40,26,18,0.8)'; g.font = 'bold 72px Georgia, serif'; g.fillText('SLAD', 768, 880);
    g.font = 'bold 26px Georgia, serif'; g.fillText('SVĚTOVAR · PLZEŇ', 768, 940);
  }
  return tex(c, { repeat: false });
}

// ------------------------------------------------------------------ lazy, shared texture cache
// Level 5 uses: wall, copper, glass, shaft, pool, puff (WALL_TEX mapping). Level 4 adds the rest.
let cache = null;
export function getTextures() {
  if (cache) return cache;
  cache = {};
  const lazy = (name, fn) => Object.defineProperty(cache, name, {
    configurable: true, enumerable: true,
    get() { const v = fn(); Object.defineProperty(cache, name, { value: v, enumerable: true }); return v; },
  });
  lazy('floor', drawFloor); lazy('wall', drawWall); lazy('brick', drawBrick); lazy('copper', drawCopper);
  lazy('glass', drawGlass); lazy('shaft', drawShaft); lazy('pool', drawPool); lazy('puff', drawPuff); lazy('fire', drawFire);
  lazy('grating', drawGrating); lazy('wallTall', drawWallTall); lazy('jet', drawJet); lazy('decals4', drawDecals4);
  return cache;
}
