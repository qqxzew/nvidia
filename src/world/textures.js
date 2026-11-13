import * as THREE from 'three';

// Procedural CanvasTextures for the city / environment (owner: city).
// All textures are <= 1024 px, sRGB, mipmapped, created lazily and shared via getTextures().

function rngFactory(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rgba = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const clamp255 = (v) => Math.max(0, Math.min(255, v));

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function toTexture(c, { repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const wrap = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapS = wrap; t.wrapT = wrap;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// draw `fn(dx, dy)` at an object position and, when close to a tile edge, at wrapped copies (seamless tiles)
function wrapped(w, h, x, y, rx, ry, fn) {
  for (let dx = -1; dx <= 1; dx++) {
    if (dx < 0 && x - rx >= 0) continue;
    if (dx > 0 && x + rx <= w) continue;
    for (let dy = -1; dy <= 1; dy++) {
      if (dy < 0 && y - ry >= 0) continue;
      if (dy > 0 && y + ry <= h) continue;
      fn(dx * w, dy * h);
    }
  }
}

function speckle(g, w, h, R, n, rMin, rMax, colorFn) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = rMin + R() * (rMax - rMin);
    g.fillStyle = colorFn(R);
    wrapped(w, h, x, y, r, r, (ox, oy) => { g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.283); g.fill(); });
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// ------------------------------------------------------------------ road surfaces
function drawSetts(size = 512) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), R = rngFactory(11);
  g.fillStyle = '#4b453e'; g.fillRect(0, 0, size, size);
  const rows = 19, rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const base = rh * 1.12;
    let widths = [], sum = 0;
    while (sum < size - base * 0.7) { const w = base * (0.8 + R() * 0.55); widths.push(w); sum += w; }
    const k = size / sum; widths = widths.map((w) => w * k);
    let x = R() * size;
    for (const w of widths) {
      const y = r * rh;
      const tone = 128 + R() * 52;
      const warm = R();
      let cr = tone, cg = tone - 2, cb = tone - 6;
      if (warm < 0.18) { cr += 16; cg += 2; cb -= 10; }
      else if (warm < 0.34) { cr -= 10; cg -= 2; cb += 10; }
      const drawStone = (ox) => {
        const sx = x + ox + 1.6, sy = y + 1.6, sw = w - 3.2, sh = rh - 3.2;
        const gr = g.createLinearGradient(0, sy, 0, sy + sh);
        gr.addColorStop(0, rgba(cr + 16, cg + 14, cb + 12));
        gr.addColorStop(1, rgba(cr - 14, cg - 14, cb - 14));
        g.fillStyle = gr;
        roundRect(g, sx, sy, sw, sh, 5); g.fill();
        g.fillStyle = rgba(255, 255, 255, 0.07);
        g.fillRect(sx + 3, sy + 2, sw * 0.5, 2);
      };
      drawStone(0); drawStone(-size);
      x = (x + w) % size;
    }
  }
  // grain + dust + sand in the joints
  speckle(g, size, size, R, 2600, 0.5, 1.4, (Rn) => { const v = 60 + Rn() * 140; return rgba(v, v - 2, v - 6, 0.28); });
  speckle(g, size, size, R, 160, 4, 11, () => rgba(150, 130, 100, 0.06));
  return toTexture(c);
}

function drawMacadam(size = 256) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), R = rngFactory(23);
  g.fillStyle = '#8c8272'; g.fillRect(0, 0, size, size);
  speckle(g, size, size, R, 220, 6, 20, () => rgba(150 + R() * 20, 135 + R() * 18, 108, 0.12));
  speckle(g, size, size, R, 1800, 0.6, 2.6, (Rn) => { const v = 70 + Rn() * 130; return rgba(v, v - 4, v - 12, 0.55); });
  speckle(g, size, size, R, 120, 1.5, 4, () => rgba(205, 195, 178, 0.35));
  return toTexture(c);
}

function drawDirt(size = 512) {
  // u (x) = lateral / 4 + 0.5 : wheel ruts at u = 0.25 and 0.75 (lateral = -/+ 1 m), grass tufts on the crown (u = 0.5)
  const c = makeCanvas(size, size), g = c.getContext('2d'), R = rngFactory(37);
  g.fillStyle = '#a07f58'; g.fillRect(0, 0, size, size);
  speckle(g, size, size, R, 260, 8, 30, () => rgba(130 + R() * 40, 100 + R() * 30, 62 + R() * 20, 0.1));
  const rut = (cx) => {
    const gr = g.createLinearGradient(cx - 44, 0, cx + 44, 0);
    gr.addColorStop(0, 'rgba(70,50,30,0)');
    gr.addColorStop(0.25, 'rgba(78,56,34,0.55)');
    gr.addColorStop(0.5, 'rgba(66,46,28,0.78)');
    gr.addColorStop(0.75, 'rgba(78,56,34,0.55)');
    gr.addColorStop(1, 'rgba(70,50,30,0)');
    g.fillStyle = gr; g.fillRect(cx - 44, 0, 88, size);
    // lighter ridge beside the rut
    g.fillStyle = 'rgba(190,160,118,0.22)'; g.fillRect(cx + 40, 0, 16, size);
  };
  rut(size * 0.25); rut(size * 0.75);
  // grass crown + patches
  const crown = g.createLinearGradient(size * 0.5 - 40, 0, size * 0.5 + 40, 0);
  crown.addColorStop(0, 'rgba(96,120,58,0)'); crown.addColorStop(0.5, 'rgba(96,120,58,0.65)'); crown.addColorStop(1, 'rgba(96,120,58,0)');
  g.fillStyle = crown; g.fillRect(size * 0.5 - 40, 0, 80, size);
  for (let i = 0; i < 520; i++) {
    const x = size * 0.5 + (R() - 0.5) * 60, y = R() * size;
    g.strokeStyle = rgba(70 + R() * 40, 100 + R() * 40, 40 + R() * 20, 0.7);
    g.lineWidth = 1.2;
    wrapped(size, size, x, y, 6, 8, (ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + (R() - 0.5) * 6, y + oy - 5 - R() * 5); g.stroke(); });
  }
  speckle(g, size, size, R, 1500, 0.6, 2.4, (Rn) => { const v = 90 + Rn() * 120; return rgba(v, v - 12, v - 34, 0.5); });
  return toTexture(c);
}

function drawSidewalk(size = 256) {
  // 2 m x 2 m: four 1 m granite slabs
  const c = makeCanvas(size, size), g = c.getContext('2d'), R = rngFactory(5);
  g.fillStyle = '#6e685e'; g.fillRect(0, 0, size, size);
  const n = 2, s = size / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const t = 168 + R() * 26;
    g.fillStyle = rgba(t, t - 3, t - 10);
    g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    g.fillStyle = rgba(255, 255, 255, 0.08); g.fillRect(i * s + 2, j * s + 2, s - 4, 3);
  }
  speckle(g, size, size, R, 1400, 0.5, 1.6, (Rn) => { const v = 80 + Rn() * 150; return rgba(v, v, v - 6, 0.3); });
  speckle(g, size, size, R, 40, 6, 16, () => rgba(120, 112, 98, 0.1));
  return toTexture(c);
}

function drawGround(size = 512) {
  const c = makeCanvas(size, size), g = c.getContext('2d'), R = rngFactory(71);
  g.fillStyle = '#7f9650'; g.fillRect(0, 0, size, size);
  speckle(g, size, size, R, 160, 14, 46, (Rn) => { const k = Rn(); return k < 0.5 ? rgba(110, 140, 70, 0.16) : rgba(150, 150, 80, 0.12); });
  for (let i = 0; i < 2600; i++) {
    const x = R() * size, y = R() * size;
    const v = R();
    g.strokeStyle = v < 0.5 ? rgba(88 + R() * 30, 120 + R() * 30, 52, 0.55) : rgba(150 + R() * 30, 150 + R() * 20, 80, 0.4);
    g.lineWidth = 1.1;
    wrapped(size, size, x, y, 5, 8, (ox, oy) => { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + (R() - 0.5) * 5, y + oy - 3 - R() * 6); g.stroke(); });
  }
  speckle(g, size, size, R, 60, 1, 2.4, () => rgba(235, 220, 130, 0.6)); // tiny flowers
  return toTexture(c);
}

function drawField(size = 256) {
  // greyscale furrows running along v (tinted per patch with vertex colour)
  const c = makeCanvas(size, size), g = c.getContext('2d'), R = rngFactory(91);
  g.fillStyle = '#b4b0a8'; g.fillRect(0, 0, size, size);
  const n = 16, w = size / n;
  for (let i = 0; i < n; i++) {
    const gr = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.55, 'rgba(120,115,105,0.15)'); gr.addColorStop(1, 'rgba(60,55,50,0.5)');
    g.fillStyle = gr; g.fillRect(i * w, 0, w, size);
  }
  speckle(g, size, size, R, 1400, 0.5, 1.8, (Rn) => { const v = 80 + Rn() * 150; return rgba(v, v, v, 0.22); });
  for (let i = 0; i < 90; i++) { g.fillStyle = rgba(255, 255, 255, 0.05 + R() * 0.05); g.fillRect(R() * size, R() * size, 2, 8 + R() * 18); }
  return toTexture(c);
}

// ------------------------------------------------------------------ facade atlas
// 4 x 4 cells of 256 px. Cells are almost white/greyscale (tinted by vertex colour) except shop details.
export const ATLAS = {
  U0: [0, 0], U1: [1, 0], U2: [2, 0], U3: [3, 0],
  U4: [0, 1], U5: [1, 1], U6: [2, 1], U7: [3, 1],
  G0: [0, 2], G1: [1, 2], G2: [2, 2], G3: [3, 2],
  G4: [0, 3], G5: [1, 3], ROOF: [2, 3],
};
// the 4th cell of row 3 is split into 4 sub cells of 128: PLASTER, BRICK, AWNING_A, AWNING_B
export const ATLAS_SUB = { PLASTER: [6, 6, 7, 7], BRICK: [7, 6, 8, 7], AWN_A: [6, 7, 7, 8], AWN_B: [7, 7, 8, 8] };
const INSET = 0.007;
const SUB_INSET = 0.02;
/** UV rect [u0, v0, u1, v1] (v1 = top) of an atlas cell. */
export function atlasRect(name) {
  if (ATLAS_SUB[name]) {
    const [a, b, c, d] = ATLAS_SUB[name]; // in units of 128 px
    return [a / 8 + SUB_INSET, 1 - d / 8 + SUB_INSET, c / 8 - SUB_INSET, 1 - b / 8 - SUB_INSET];
  }
  const [cx, cy] = ATLAS[name];
  return [cx / 4 + INSET, 1 - (cy + 1) / 4 + INSET, (cx + 1) / 4 - INSET, 1 - cy / 4 - INSET];
}

const PLASTER = '#f1eadb';

function plasterBase(g, R, tone = 0) {
  g.fillStyle = PLASTER; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const x = R() * 256, y = R() * 256;
    g.fillStyle = R() < 0.5 ? rgba(0, 0, 0, 0.03 + R() * 0.03) : rgba(255, 255, 255, 0.06);
    g.fillRect(x, y, 1 + R() * 5, 1 + R() * 3);
  }
  // soft stains from the top
  for (let i = 0; i < 5; i++) {
    const x = R() * 256, w = 10 + R() * 24;
    const gr = g.createLinearGradient(0, 0, 0, 120);
    gr.addColorStop(0, 'rgba(70,60,40,0.10)'); gr.addColorStop(1, 'rgba(70,60,40,0)');
    g.fillStyle = gr; g.fillRect(x, 0, w, 120);
  }
  if (tone) { g.fillStyle = rgba(0, 0, 0, tone); g.fillRect(0, 0, 256, 256); }
}

function glass(g, x, y, w, h, R, warm = false) {
  const gr = g.createLinearGradient(x, y, x, y + h);
  if (warm) { gr.addColorStop(0, '#caa05a'); gr.addColorStop(0.6, '#b07a36'); gr.addColorStop(1, '#6e4a22'); }
  else { gr.addColorStop(0, '#8fa4b0'); gr.addColorStop(0.35, '#566976'); gr.addColorStop(1, '#232a30'); }
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath(); g.moveTo(x + w * 0.12, y + h * 0.05); g.lineTo(x + w * 0.5, y + h * 0.05); g.lineTo(x + w * 0.1, y + h * 0.7); g.lineTo(x + w * 0.02, y + h * 0.7); g.closePath(); g.fill();
  if (R() < 0.55 && !warm) { // curtain
    g.fillStyle = rgba(236, 228, 208, 0.55 + R() * 0.2);
    const cw = w * (0.25 + R() * 0.25);
    g.fillRect(x, y, cw, h * (0.5 + R() * 0.4)); g.fillRect(x + w - cw * 0.8, y, cw * 0.8, h * 0.6);
  }
}

// rectangular (or arched) window with frame, mullions, sill
function windowRect(g, R, cx, top, w, h, { arch = false, frame = '#fbf8f0', mullion = true, sill = true, warm = false, shutters = null } = {}) {
  const x = cx - w / 2, fw = 7;
  if (shutters) {
    g.fillStyle = shutters;
    g.fillRect(x - w * 0.46, top, w * 0.44, h); g.fillRect(x + w * 1.02, top, w * 0.44, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 7; i++) { g.fillRect(x - w * 0.46, top + 6 + i * h / 7, w * 0.44, 2); g.fillRect(x + w * 1.02, top + 6 + i * h / 7, w * 0.44, 2); }
  }
  // dark outer reveal (depth)
  g.fillStyle = 'rgba(40,34,28,0.55)';
  if (arch) { roundRectArch(g, x - 5, top - 5, w + 10, h + 10); g.fill(); } else g.fillRect(x - 4, top - 4, w + 8, h + 8);
  g.fillStyle = frame;
  if (arch) { roundRectArch(g, x - 1, top - 1, w + 2, h + 2); g.fill(); } else g.fillRect(x - 1, top - 1, w + 2, h + 2);
  g.save();
  if (arch) { roundRectArch(g, x + fw, top + fw, w - fw * 2, h - fw * 2); g.clip(); } else { g.beginPath(); g.rect(x + fw, top + fw, w - fw * 2, h - fw * 2); g.clip(); }
  glass(g, x + fw, top + fw, w - fw * 2, h - fw * 2, R, warm);
  g.restore();
  g.fillStyle = frame;
  if (mullion) {
    g.fillRect(cx - 2.5, top + fw, 5, h - fw * 2);
    g.fillRect(x + fw, top + h * 0.34, w - fw * 2, 4.5);
  }
  if (sill) {
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x - 12, top + h + 10, w + 24, 8);
    g.fillStyle = '#fffaf0'; g.fillRect(x - 10, top + h, w + 20, 10);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 10, top + h + 8, w + 20, 2);
  }
}
function roundRectArch(g, x, y, w, h) {
  const r = w / 2;
  g.beginPath();
  g.moveTo(x, y + h); g.lineTo(x, y + r);
  g.arc(x + r, y + r, r, Math.PI, 0);
  g.lineTo(x + w, y + h); g.closePath();
}

function pediment(g, cx, y, w, kind, tone = 'rgba(0,0,0,0.30)') {
  g.save();
  g.fillStyle = '#fffaf0'; g.strokeStyle = tone; g.lineWidth = 2;
  g.beginPath();
  if (kind === 'tri') { g.moveTo(cx - w / 2, y); g.lineTo(cx, y - w * 0.22); g.lineTo(cx + w / 2, y); }
  else { g.moveTo(cx - w / 2, y); g.quadraticCurveTo(cx, y - w * 0.4, cx + w / 2, y); }
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(cx - w / 2, y, w, 7); // entablature shadow
  g.fillStyle = '#fffaf0'; g.fillRect(cx - w / 2 - 3, y, w + 6, 5);
  g.restore();
}

function sgraffito(g, R, x, y, w, h, alpha = 0.10) {
  // diamond / rustication pattern
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.strokeStyle = rgba(90, 70, 50, alpha); g.lineWidth = 2;
  const s = 28;
  for (let i = -h; i < w + h; i += s) {
    g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i + h, y + h); g.stroke();
    g.beginPath(); g.moveTo(x + i + h, y); g.lineTo(x + i, y + h); g.stroke();
  }
  g.restore();
}

function drawFacadeAtlas() {
  const c = makeCanvas(1024, 1024), g = c.getContext('2d'), R = rngFactory(1926);
  g.fillStyle = PLASTER; g.fillRect(0, 0, 1024, 1024);
  const cell = (name, fn) => {
    const [cx, cy] = ATLAS[name];
    g.save(); g.translate(cx * 256, cy * 256);
    g.beginPath(); g.rect(0, 0, 256, 256); g.clip();
    fn();
    g.restore();
  };

  cell('U0', () => { // plain window, simple lintel
    plasterBase(g, R);
    g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(56, 44, 144, 14);
    g.fillStyle = '#fffaf0'; g.fillRect(56, 38, 144, 10);
    windowRect(g, R, 128, 56, 104, 150);
  });
  cell('U1', () => { // triangular pediment
    plasterBase(g, R);
    windowRect(g, R, 128, 68, 100, 140);
    pediment(g, 128, 62, 136, 'tri');
  });
  cell('U2', () => { // segmental arch pediment + keystone, rusticated flanks
    plasterBase(g, R);
    g.strokeStyle = 'rgba(70,55,40,0.22)'; g.lineWidth = 2;
    for (let y = 20; y < 256; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    windowRect(g, R, 128, 70, 98, 138);
    pediment(g, 128, 64, 134, 'seg');
    g.fillStyle = '#fffaf0'; g.fillRect(120, 36, 16, 18);
  });
  cell('U3', () => { // Art Nouveau: arched window + whiplash ornament + flower medallions
    plasterBase(g, R);
    g.strokeStyle = 'rgba(80,100,70,0.38)'; g.lineWidth = 5; g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(128 + s * 52, 230); g.bezierCurveTo(128 + s * 78, 170, 128 + s * 30, 120, 128 + s * 64, 70); g.stroke();
      g.beginPath(); g.moveTo(128 + s * 64, 70); g.bezierCurveTo(128 + s * 82, 40, 128 + s * 42, 20, 128 + s * 20, 28); g.stroke();
    }
    g.fillStyle = 'rgba(190,120,90,0.5)';
    for (const [x, y] of [[128, 22], [70, 150], [186, 150]]) { g.beginPath(); g.arc(x, y, 9, 0, 6.283); g.fill(); g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(x, y, 4, 0, 6.283); g.fill(); g.fillStyle = 'rgba(190,120,90,0.5)'; }
    windowRect(g, R, 128, 58, 92, 160, { arch: true, mullion: true, sill: true });
  });
  cell('U4', () => { // coupled window (two lights + column)
    plasterBase(g, R);
    g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(22, 34, 212, 12);
    g.fillStyle = '#fffaf0'; g.fillRect(22, 30, 212, 8);
    windowRect(g, R, 78, 54, 72, 148, { sill: false });
    windowRect(g, R, 178, 54, 72, 148, { sill: false });
    g.fillStyle = '#fffaf0'; g.fillRect(14, 206, 228, 10);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(14, 214, 228, 3);
    g.fillStyle = '#fffaf0'; g.fillRect(122, 50, 12, 156);
  });
  cell('U5', () => { // piano nobile: pediment, consoles, balustrade
    plasterBase(g, R);
    windowRect(g, R, 128, 62, 104, 136, { sill: false });
    pediment(g, 128, 56, 142, 'seg');
    g.fillStyle = '#fffaf0'; g.fillRect(34, 198, 188, 12);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(34, 208, 188, 4);
    g.fillStyle = 'rgba(40,36,32,0.85)';
    for (let x = 40; x < 218; x += 11) g.fillRect(x, 212, 5, 36);
    g.fillRect(34, 210, 188, 4); g.fillRect(34, 246, 188, 5);
    g.fillStyle = '#fffaf0'; for (const x of [58, 186]) g.fillRect(x, 140, 10, 58);
  });
  cell('U6', () => { // blind pier / stair window with sgraffito
    plasterBase(g, R);
    sgraffito(g, R, 0, 0, 256, 256, 0.10);
    windowRect(g, R, 128, 84, 52, 92, { mullion: false, sill: true });
  });
  cell('U7', () => { // attic: small square window in a wreath, sgraffito band
    plasterBase(g, R);
    sgraffito(g, R, 0, 0, 256, 40, 0.14); sgraffito(g, R, 0, 216, 256, 40, 0.14);
    g.strokeStyle = 'rgba(80,110,70,0.5)'; g.lineWidth = 9;
    g.beginPath(); g.arc(128, 128, 62, 0, 6.283); g.stroke();
    windowRect(g, R, 128, 90, 76, 76, { mullion: false, sill: false });
  });

  // ----- ground floor
  const plinth = () => { g.fillStyle = '#9d968a'; g.fillRect(0, 232, 256, 24); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 230, 256, 3); };
  const shop = (frame, interior) => {
    plasterBase(g, R);
    g.fillStyle = 'rgba(40,30,22,0.9)'; g.fillRect(14, 78, 228, 154);
    g.fillStyle = frame; g.fillRect(16, 80, 224, 150);
    const gr = g.createLinearGradient(0, 96, 0, 226);
    gr.addColorStop(0, interior[0]); gr.addColorStop(1, interior[1]);
    g.fillStyle = gr; g.fillRect(28, 100, 200, 118);
    // goods on the shelves
    for (let i = 0; i < 24; i++) { g.fillStyle = rgba(150 + R() * 90, 100 + R() * 80, 60 + R() * 60, 0.75); g.fillRect(34 + R() * 180, 132 + R() * 80, 10 + R() * 14, 8 + R() * 14); }
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(40, 100); g.lineTo(110, 100); g.lineTo(60, 218); g.lineTo(30, 218); g.closePath(); g.fill();
    g.fillStyle = frame; g.fillRect(28, 92, 200, 8); g.fillRect(124, 100, 5, 118); g.fillRect(28, 118, 200, 4);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(28, 96, 200, 5);
    plinth();
  };
  cell('G0', () => shop('#2f4a3a', ['#a8895a', '#4d3b26']));
  cell('G1', () => { // shop with glazed door
    plasterBase(g, R);
    g.fillStyle = 'rgba(40,30,22,0.9)'; g.fillRect(14, 78, 228, 154);
    g.fillStyle = '#6b2a24'; g.fillRect(16, 80, 224, 150);
    glass(g, 28, 100, 82, 118, R, true); glass(g, 146, 100, 82, 118, R, true);
    g.fillStyle = '#6b2a24'; g.fillRect(110, 80, 36, 150);
    g.fillStyle = 'rgba(30,20,16,0.95)'; g.fillRect(114, 100, 28, 132);
    glass(g, 117, 104, 22, 70, R, true);
    g.fillStyle = '#d8b25a'; g.fillRect(133, 168, 4, 14);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(28, 96, 200, 5);
    plinth();
  });
  cell('G2', () => { // carriage gate
    plasterBase(g, R);
    g.fillStyle = '#a89e8f'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(60,50,40,0.28)'; g.lineWidth = 2;
    for (let y = 0; y < 256; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    g.fillStyle = 'rgba(30,24,20,0.9)'; roundRectArch(g, 40, 54, 176, 210); g.fill();
    g.fillStyle = '#5a3b26'; roundRectArch(g, 48, 62, 160, 200); g.fill();
    g.strokeStyle = 'rgba(25,16,10,0.8)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(128, 62); g.lineTo(128, 256); g.stroke();
    for (let y = 100; y < 256; y += 30) { g.beginPath(); g.moveTo(52, y); g.lineTo(204, y); g.stroke(); }
    g.fillStyle = 'rgba(210,190,140,0.65)';
    for (let x = 62; x < 200; x += 20) for (let y = 110; y < 250; y += 30) { g.beginPath(); g.arc(x, y, 2.2, 0, 6.283); g.fill(); }
    g.fillStyle = '#e9e1d0'; g.fillRect(118, 36, 20, 22);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(34, 252, 188, 4);
  });
  cell('G3', () => { // pub: arched warm-lit windows, curtains, central door
    plasterBase(g, R);
    sgraffito(g, R, 0, 70, 256, 170, 0.06);
    for (const cx of [58, 198]) windowRect(g, R, cx, 100, 70, 112, { arch: true, warm: true, mullion: false, sill: true, frame: '#e6dcc2' });
    g.fillStyle = 'rgba(30,24,20,0.9)'; roundRectArch(g, 106, 98, 44, 138); g.fill();
    g.fillStyle = '#4a2c20'; roundRectArch(g, 110, 102, 36, 134); g.fill();
    g.fillStyle = 'rgba(240,190,100,0.75)'; g.fillRect(117, 118, 22, 30);
    plinth();
  });
  cell('G4', () => { // villa ground floor window w/ shutters
    plasterBase(g, R);
    windowRect(g, R, 128, 64, 92, 128, { shutters: '#4f6d4a' });
    plinth();
  });
  cell('G5', () => { // villa door with porch canopy
    plasterBase(g, R);
    g.fillStyle = 'rgba(30,24,20,0.9)'; g.fillRect(84, 74, 88, 170);
    g.fillStyle = '#5b3a28'; g.fillRect(88, 78, 80, 166);
    glass(g, 98, 90, 60, 50, R, true);
    g.fillStyle = '#d8b25a'; g.fillRect(148, 170, 5, 16);
    g.fillStyle = '#fffaf0'; g.fillRect(70, 60, 116, 14);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(70, 72, 116, 5);
    g.fillStyle = '#bdb6a8'; g.fillRect(70, 236, 116, 12); g.fillRect(60, 246, 136, 10);
  });
  cell('ROOF', () => { // light greyscale tile courses (tinted terracotta / slate by vertex colour)
    g.fillStyle = '#d6cfc6'; g.fillRect(0, 0, 256, 256);
    const rowH = 32;
    for (let r = 0; r < 8; r++) {
      const off = (r % 2) * 16;
      for (let x = -16; x < 256 + 32; x += 32) {
        const t = 188 + R() * 50;
        g.fillStyle = rgba(t, t - 6, t - 12); g.fillRect(x + off + 1, r * rowH + 1, 30, rowH - 2);
        g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(x + off + 1, r * rowH + rowH - 7, 30, 6);
        g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + off + 1, r * rowH + 1, 30, 3);
      }
    }
    speckle(g, 256, 256, R, 40, 3, 12, () => rgba(60, 80, 50, 0.12)); // moss
  });
  // sub cells (128 px) in the 4th cell of row 3
  g.save(); g.translate(768, 768);
  g.fillStyle = PLASTER; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) { g.fillStyle = R() < 0.5 ? rgba(0, 0, 0, 0.04) : rgba(255, 255, 255, 0.07); g.fillRect(R() * 128, R() * 128, 1 + R() * 4, 1 + R() * 3); }
  // brick
  g.save(); g.translate(128, 0);
  g.fillStyle = '#7a6a5e'; g.fillRect(0, 0, 128, 128);
  for (let r = 0; r < 12; r++) for (let x = -12; x < 140; x += 22) {
    const t = 150 + R() * 60; g.fillStyle = rgba(t, t * 0.55, t * 0.42);
    g.fillRect(x + (r % 2) * 11 + 1, r * 10.6 + 1, 20, 8.8);
  }
  g.restore();
  // awnings (vertical stripes, striped canvas)
  const awn = (ox, a, b) => {
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(ox + i * 10.6, 0, 10.8, 128); }
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr; g.fillRect(ox, 0, 128, 128);
  };
  g.save(); g.translate(0, 128); awn(0, '#b3342b', '#efe6d2'); g.restore();
  g.save(); g.translate(128, 128); awn(0, '#3b6b4a', '#efe6d2'); g.restore();
  g.restore();
  return toTexture(c);
}

// ------------------------------------------------------------------ signs (period Czech, no modern trademarks)
export const SIGNS = [
  { text: 'HOSTINEC U ZLATÉHO LVA', board: '#1f3b2c', ink: '#e8c35a', font: 'bold 62px Georgia, "Times New Roman", serif' },
  { text: 'PEKAŘSTVÍ', board: '#efe3c4', ink: '#7a2a20', font: 'bold 70px Georgia, "Times New Roman", serif' },
  { text: 'ŘEZNICTVÍ', board: '#7a2b25', ink: '#f1e6c8', font: 'bold 70px Georgia, "Times New Roman", serif' },
  { text: 'KAVÁRNA SLAVIA', board: '#1b1b1e', ink: '#e8d9a8', font: 'italic bold 62px Georgia, "Times New Roman", serif' },
  { text: 'LÉKÁRNA', board: '#eae6da', ink: '#1f4a36', font: 'bold 70px Georgia, "Times New Roman", serif' },
  { text: 'PIVO SVĚTOVAR', board: '#26405e', ink: '#f0e2b0', font: 'bold 66px Georgia, "Times New Roman", serif' },
  { text: 'KOLONIÁL · SMÍŠENÉ ZBOŽÍ', board: '#3d3a2a', ink: '#e8dcb0', font: 'bold 54px Georgia, "Times New Roman", serif' },
  { text: 'TRAFIKA', board: '#6a5a2c', ink: '#f6ecc8', font: 'bold 70px Georgia, "Times New Roman", serif' },
  { text: 'POZOR VLAK!', board: '#f2efe6', ink: '#161616', font: 'bold 74px Arial, Helvetica, sans-serif', border: '#c01e1e' },
  { text: 'ZÁJEZDNÍ HOSTINEC U ČERNÉHO KONĚ', board: '#2a2420', ink: '#e9dcae', font: 'bold 48px Georgia, "Times New Roman", serif' },
];
const SIGN_ROW = 102;
export function signRect(i) {
  const v1 = 1 - (i * SIGN_ROW) / 1024, v0 = 1 - ((i + 1) * SIGN_ROW) / 1024;
  return [0.002, v0 + 0.003, 0.998, v1 - 0.003];
}
function drawSignAtlas() {
  const c = makeCanvas(1024, 1024), g = c.getContext('2d'), R = rngFactory(77);
  g.fillStyle = '#222'; g.fillRect(0, 0, 1024, 1024);
  SIGNS.forEach((s, i) => {
    const y = i * SIGN_ROW;
    g.fillStyle = s.board; g.fillRect(0, y, 1024, SIGN_ROW);
    const bc = s.border || s.ink;
    g.strokeStyle = bc; g.lineWidth = s.border ? 8 : 3;
    g.strokeRect(8, y + 8, 1008, SIGN_ROW - 16);
    if (!s.border) g.strokeRect(15, y + 15, 994, SIGN_ROW - 30);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = s.font;
    let size = parseInt(/(\d+)px/.exec(s.font)[1], 10);
    const maxW = 940;
    let w = g.measureText(s.text).width;
    if (w > maxW) { size = Math.floor(size * maxW / w); g.font = s.font.replace(/\d+px/, size + 'px'); }
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillText(s.text, 514, y + SIGN_ROW / 2 + 5);
    g.fillStyle = s.ink; g.fillText(s.text, 512, y + SIGN_ROW / 2 + 3);
    // weathering
    for (let k = 0; k < 120; k++) { g.fillStyle = rgba(0, 0, 0, 0.05 + R() * 0.05); g.fillRect(R() * 1024, y + R() * SIGN_ROW, 3 + R() * 20, 1 + R() * 2); }
  });
  return toTexture(c, { repeat: false });
}

// ------------------------------------------------------------------ misc
function drawPoster() {
  // wrapped around an advertising column: 4 posters of 128 px
  const c = makeCanvas(512, 256), g = c.getContext('2d'), R = rngFactory(3);
  const posters = [
    { bg: '#d9b25a', ink: '#2a1a12', t: ['DIVADLO', 'J. K. TYL', 'dnes 19 hod.'] },
    { bg: '#b5382c', ink: '#f2e8cf', t: ['CIRKUS', 'BUSCH', 'od neděle'] },
    { bg: '#2f5a74', ink: '#f2e8cf', t: ['PLZEŇSKÝ', 'KONCERT', 'v sobotu'] },
    { bg: '#e8dcc0', ink: '#7a2a20', t: ['SVĚTOVAR', 'pivo české', 'výčep dnes'] },
  ];
  posters.forEach((p, i) => {
    const x = i * 128;
    g.fillStyle = '#e9dfc4'; g.fillRect(x, 0, 128, 256);
    g.fillStyle = p.bg; g.fillRect(x + 6, 10, 116, 236);
    g.strokeStyle = p.ink; g.lineWidth = 3; g.strokeRect(x + 11, 15, 106, 226);
    g.fillStyle = p.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 22px Georgia, serif'; g.fillText(p.t[0], x + 64, 60, 100);
    g.font = 'bold 24px Georgia, serif'; g.fillText(p.t[1], x + 64, 120, 100);
    g.font = 'italic 16px Georgia, serif'; g.fillText(p.t[2], x + 64, 200, 100);
    g.beginPath(); g.arc(x + 64, 160, 12, 0, 6.283); g.fill();
    for (let k = 0; k < 40; k++) { g.fillStyle = rgba(0, 0, 0, 0.06); g.fillRect(x + R() * 128, R() * 256, 10, 2); }
  });
  return toTexture(c);
}

function drawCloud() {
  const c = makeCanvas(512, 256), g = c.getContext('2d'), R = rngFactory(8);
  g.clearRect(0, 0, 512, 256);
  const puffs = [];
  for (let i = 0; i < 26; i++) {
    const u = R();
    const x = 90 + u * 330, bell = 1 - Math.abs(u - 0.5) * 1.5;
    puffs.push({ x, y: 170 - bell * 60 - R() * 36, r: 30 + bell * 36 + R() * 18 });
  }
  puffs.sort((a, b) => b.y - a.y);
  for (const p of puffs) {
    const gr = g.createRadialGradient(p.x, p.y - p.r * 0.25, p.r * 0.1, p.x, p.y, p.r);
    gr.addColorStop(0, 'rgba(255,252,246,0.96)');
    gr.addColorStop(0.6, 'rgba(250,236,222,0.80)');
    gr.addColorStop(1, 'rgba(236,206,190,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
  }
  // flat grey-peach underside
  const sh = g.createLinearGradient(0, 150, 0, 215);
  sh.addColorStop(0, 'rgba(190,170,170,0)'); sh.addColorStop(1, 'rgba(190,165,165,0.55)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = sh; g.fillRect(0, 140, 512, 100);
  g.globalCompositeOperation = 'destination-in';
  const fade = g.createLinearGradient(0, 120, 0, 215);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.8, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade; g.fillRect(0, 0, 512, 256);
  return toTexture(c, { repeat: false, aniso: 1 });
}

function drawPothole() {
  const c = makeCanvas(128, 128), g = c.getContext('2d'), R = rngFactory(19);
  g.clearRect(0, 0, 128, 128);
  // worn rim
  const rim = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  rim.addColorStop(0, 'rgba(80,66,50,0.55)'); rim.addColorStop(0.7, 'rgba(100,86,66,0.30)'); rim.addColorStop(1, 'rgba(100,86,66,0)');
  g.fillStyle = rim; g.beginPath(); g.arc(64, 64, 62, 0, 6.283); g.fill();
  // irregular dark hole
  g.beginPath();
  for (let i = 0; i <= 24; i++) { const a = i / 24 * 6.283, r = 30 + R() * 10; const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r * 0.82; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath();
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 38);
  gr.addColorStop(0, 'rgba(28,24,20,0.92)'); gr.addColorStop(1, 'rgba(48,40,32,0.8)');
  g.fillStyle = gr; g.fill();
  // puddle sheen
  g.fillStyle = 'rgba(160,180,195,0.40)'; g.beginPath(); g.ellipse(60, 70, 18, 10, 0.3, 0, 6.283); g.fill();
  return toTexture(c, { repeat: false, aniso: 2 });
}

function drawFence() {
  // picket fence with alpha (tinted by vertex colour); tiles every 1.6 m horizontally
  const c = makeCanvas(256, 128), g = c.getContext('2d');
  g.clearRect(0, 0, 256, 128);
  g.fillStyle = '#e8e2d2';
  for (let i = 0; i < 8; i++) {
    const x = i * 32 + 5;
    g.beginPath(); g.moveTo(x, 128); g.lineTo(x, 22); g.lineTo(x + 11, 8); g.lineTo(x + 22, 22); g.lineTo(x + 22, 128); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x + 16, 22, 6, 106); g.fillStyle = '#e8e2d2';
  }
  g.fillStyle = '#d4cdb8'; g.fillRect(0, 40, 256, 9); g.fillRect(0, 96, 256, 9);
  return toTexture(c, { aniso: 2 });
}

let cache = null;
export function getTextures() {
  if (cache) return cache;
  cache = {
    setts: drawSetts(), macadam: drawMacadam(), dirt: drawDirt(), sidewalk: drawSidewalk(),
    ground: drawGround(), field: drawField(),
    facade: drawFacadeAtlas(), signs: drawSignAtlas(), poster: drawPoster(),
    cloud: drawCloud(), pothole: drawPothole(), fence: drawFence(),
  };
  return cache;
}
