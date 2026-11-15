import * as THREE from 'three';
import { rng } from '../level4/textures.js';

// Level 5 "Šílená stáčírna" — procedural CanvasTextures (owner: art). Same hand-painted style as level 1 / 4:
// small canvases, sRGB, mipmapped, created lazily and shared. Wall / glass / soft gradients come from level 4.
export { rng };

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
function grime(g, w, h, R, n, color, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, y = R() * h, r = rMin + R() * (rMax - rMin);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}
function speckle(g, w, h, R, n, r0, r1, col) {
  for (let i = 0; i < n; i++) { g.fillStyle = col(R); g.beginPath(); g.arc(R() * w, R() * h, r0 + R() * (r1 - r0), 0, 6.283); g.fill(); }
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ------------------------------------------------------------------ floor: worn cement screed in 1 m slabs
// 512 px = 2 m. Warm grey cement, slab joints, cracks, rust/beer stains, a few clinker patches.
export const FLOOR_TEX = 2.0;
function drawFloor() {
  const S = 512, c = canvas(S, S), g = c.getContext('2d'), R = rng(1926);
  g.fillStyle = '#8f8676'; g.fillRect(0, 0, S, S);
  const n = 2, s = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = R() * 18 - 9;
    g.fillStyle = rgba(150 + v, 141 + v, 124 + v); g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    // trowel swirls
    for (let k = 0; k < 40; k++) {
      g.strokeStyle = R() < 0.5 ? 'rgba(255,245,225,0.05)' : 'rgba(60,50,40,0.05)'; g.lineWidth = 2 + R() * 6;
      g.beginPath(); const cx = i * s + R() * s, cy = j * s + R() * s, r = 10 + R() * 40;
      g.arc(cx, cy, r, R() * 6, R() * 6 + 1.5); g.stroke();
    }
  }
  grime(g, S, S, R, 30, 'rgba(70,58,44,0.16)', 25, 90);
  grime(g, S, S, R, 12, 'rgba(230,220,200,0.08)', 30, 80);
  grime(g, S, S, R, 6, 'rgba(110,70,30,0.12)', 15, 45); // beer / rust stains
  speckle(g, S, S, R, 3200, 0.4, 1.3, (Rn) => { const v = 50 + Rn() * 170; return rgba(v, v - 4, v - 12, 0.2); });
  // joints (dark, slightly chipped)
  g.strokeStyle = 'rgba(48,40,32,0.85)'; g.lineWidth = 3;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, S); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(S, i * s); g.stroke(); }
  // cracks
  g.strokeStyle = 'rgba(45,38,30,0.55)'; g.lineWidth = 1.2;
  for (let k = 0; k < 7; k++) {
    let x = R() * S, y = R() * S; g.beginPath(); g.moveTo(x, y);
    for (let q = 0; q < 7; q++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  return tex(c);
}

// ------------------------------------------------------------------ belt deck: dark iron slats + painted chevrons
// 256 x 256 = 0.8 m across (u) x 1.0 m along (v). v grows in the travel direction; chevron points to +v.
function drawBelt() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = rng(311);
  g.fillStyle = '#121212'; g.fillRect(0, 0, S, S);
  const slats = 10, sh = S / slats;
  for (let i = 0; i < slats; i++) {
    const y = i * sh, v = 52 + R() * 12;
    const gr = g.createLinearGradient(0, y, 0, y + sh);
    gr.addColorStop(0, rgba(v + 30, v + 30, v + 30)); gr.addColorStop(0.18, rgba(v + 8, v + 8, v + 10));
    gr.addColorStop(0.85, rgba(v - 8, v - 9, v - 8)); gr.addColorStop(1, rgba(v - 22, v - 22, v - 22));
    g.fillStyle = gr; g.fillRect(6, y + 2, S - 12, sh - 4);
    // rust + wear
    for (let k = 0; k < 6; k++) { g.fillStyle = rgba(110 + R() * 30, 60 + R() * 16, 30, 0.18 + R() * 0.2); g.fillRect(6 + R() * (S - 30), y + 3 + R() * (sh - 8), 4 + R() * 26, 1 + R() * 3); }
    // rivets at the chain ends
    g.fillStyle = 'rgba(150,150,145,0.8)';
    for (const x of [16, S - 16]) { g.beginPath(); g.arc(x, y + sh / 2, 2.6, 0, 6.283); g.fill(); }
  }
  // chain strips along both edges
  g.fillStyle = '#2a2724'; g.fillRect(0, 0, 7, S); g.fillRect(S - 7, 0, 7, S);
  // painted chevron (cream enamel, chipped), pointing toward +v (canvas y down = -v, so draw it pointing up)
  g.save();
  g.translate(S / 2, S * 0.5);
  g.fillStyle = 'rgba(226,212,170,0.92)';
  g.beginPath();
  g.moveTo(0, -46); g.lineTo(62, 14); g.lineTo(62, 44); g.lineTo(0, -16); g.lineTo(-62, 44); g.lineTo(-62, 14); g.closePath(); g.fill();
  g.restore();
  // chips through the paint along the slat gaps
  g.fillStyle = '#121212'; for (let i = 0; i <= slats; i++) g.fillRect(0, i * sh - 1.5, S, 3);
  for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(40,38,34,0.7)'; g.beginPath(); g.arc(70 + R() * 116, 70 + R() * 120, 1 + R() * 2.5, 0, 6.283); g.fill(); }
  return tex(c, { aniso: 8 });
}

// ------------------------------------------------------------------ oak staves (clean + grimy variant)
// 256 x 128: u around the barrel (16 staves), v along the axis.
function drawStaves(dirty) {
  const W = 256, H = 128, c = canvas(W, H), g = c.getContext('2d'), R = rng(dirty ? 71 : 70);
  const n = 16, sw = W / n;
  for (let i = 0; i < n; i++) {
    const v = R() * 26 - 13;
    const base = dirty ? [158 + v, 136 + v, 106 + v] : [204 + v, 146 + v, 86 + v];
    g.fillStyle = rgba(...base); g.fillRect(i * sw, 0, sw, H);
    // grain
    for (let k = 0; k < 6; k++) {
      g.strokeStyle = `rgba(80,48,22,${0.12 + R() * 0.12})`; g.lineWidth = 0.7 + R();
      const x = i * sw + 1 + R() * (sw - 2);
      g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + (R() - 0.5) * 4, H * 0.3, x + (R() - 0.5) * 4, H * 0.7, x + (R() - 0.5) * 3, H); g.stroke();
    }
    g.fillStyle = 'rgba(40,24,12,0.55)'; g.fillRect(i * sw, 0, 1.4, H); // joint
    g.fillStyle = 'rgba(255,230,190,0.10)'; g.fillRect(i * sw + 1.4, 0, 1.4, H);
  }
  // darker heads ends (chime)
  const eg = g.createLinearGradient(0, 0, 0, H);
  eg.addColorStop(0, 'rgba(50,30,15,0.35)'); eg.addColorStop(0.12, 'rgba(50,30,15,0)'); eg.addColorStop(0.88, 'rgba(50,30,15,0)'); eg.addColorStop(1, 'rgba(50,30,15,0.35)');
  g.fillStyle = eg; g.fillRect(0, 0, W, H);
  if (dirty) {
    grime(g, W, H, R, 22, 'rgba(58,50,36,0.5)', 8, 26);   // old beer scale + cellar mould (blotchy, not uniformly dark)
    grime(g, W, H, R, 12, 'rgba(84,96,60,0.4)', 6, 18);
    speckle(g, W, H, R, 700, 0.5, 1.6, (Rn) => rgba(40, 34, 24, 0.3 + Rn() * 0.3));
  } else {
    speckle(g, W, H, R, 200, 0.4, 1.0, () => 'rgba(90,55,25,0.2)');
  }
  return tex(c);
}

// ------------------------------------------------------------------ barrel tags: the main gameplay cue
// 512 x 256 atlas: row 0 = 4 icons on their station colour, row 1 = same with a "waiting" pause badge.
export const TAG_ORDER = ['wash', 'fill', 'cap', 'ship'];
// same silhouettes as the HUD switch buttons (src/level5/ui.js, 24 x 24 viewBox) so tag and button read as one
const ICON_PATHS = {
  wash: ['M10 1.5h4v3h5.5v3.2h-15V4.5H10z', 'M6.5 10l1.6 3.3a1.8 1.8 0 1 1-3.2 0z', 'M12 11.5l1.6 3.3a1.8 1.8 0 1 1-3.2 0z',
    'M17.5 10l1.6 3.3a1.8 1.8 0 1 1-3.2 0z', 'M9 17l1.4 2.9a1.6 1.6 0 1 1-2.8 0z', 'M15 17l1.4 2.9a1.6 1.6 0 1 1-2.8 0z'],
  fill: ['M1.5 3.5h11a5.5 5.5 0 0 1 5.5 5.5v2.5h-4.2V9a1.3 1.3 0 0 0-1.3-1.3h-11z', 'M12.6 11.5h6.6v1.8h-6.6z', 'M15.9 14.6l2.9 5a3.3 3.3 0 1 1-5.8 0z'],
  ship: ['M1 5.5h12.5v10.5H1z', 'M14.5 8.5h4.6l3.9 4.3v3.2h-8.5z', 'M8.1 19a2.6 2.6 0 1 1-5.2 0a2.6 2.6 0 1 1 5.2 0z', 'M20.6 19a2.6 2.6 0 1 1-5.2 0a2.6 2.6 0 1 1 5.2 0z'],
};
function drawIcon(g, id, cx, cy, s, ink) {
  g.save(); g.translate(cx, cy); g.scale(s / 24, s / 24); g.translate(-12, -12);
  g.fillStyle = ink;
  if (id === 'cap') { // mallet (rotated -40°)
    g.translate(12, 12); g.rotate(-40 * Math.PI / 180); g.translate(-12, -12);
    roundRect(g, 5, 1.5, 14, 8, 2); g.fill();
    roundRect(g, 10.6, 9.5, 2.8, 13, 1); g.fill();
    g.globalAlpha = 0.45; g.fillStyle = '#000'; g.fillRect(5, 3.2, 1.6, 4.6); g.globalAlpha = 1;
  } else for (const d of ICON_PATHS[id] || []) g.fill(new Path2D(d));
  g.restore();
}
function drawTags(stations) {
  const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d');
  TAG_ORDER.forEach((id, i) => {
    for (let row = 0; row < 2; row++) {
      const cx = i * 128 + 64, cy = row * 128 + 64;
      // dark outline, cream enamel rim, colour field
      g.fillStyle = 'rgba(18,14,10,0.95)'; g.beginPath(); g.arc(cx, cy, 61, 0, 6.283); g.fill();
      g.fillStyle = '#f2ead6'; g.beginPath(); g.arc(cx, cy, 56, 0, 6.283); g.fill();
      g.fillStyle = stations[id].color; g.beginPath(); g.arc(cx, cy, 48, 0, 6.283); g.fill();
      const hl = g.createRadialGradient(cx - 18, cy - 22, 4, cx, cy, 50);
      hl.addColorStop(0, 'rgba(255,255,255,0.28)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hl; g.beginPath(); g.arc(cx, cy, 48, 0, 6.283); g.fill();
      drawIcon(g, id, cx, cy, 66, '#fbf5e6');
      if (row === 1) { // pause badge bottom-right
        g.fillStyle = '#1b1612'; g.beginPath(); g.arc(cx + 38, cy + 38, 20, 0, 6.283); g.fill();
        g.fillStyle = '#f2ead6'; g.fillRect(cx + 30, cy + 29, 6, 18); g.fillRect(cx + 40, cy + 29, 6, 18);
      }
    }
  });
  return tex(c, { repeat: false, aniso: 4 });
}

// ------------------------------------------------------------------ switch signal disk arrow (white on transparent)
function drawArrow() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#fbf5e6';
  g.beginPath();
  g.moveTo(64, 10); g.lineTo(106, 56); g.lineTo(78, 56); g.lineTo(78, 116); g.lineTo(50, 116); g.lineTo(50, 56); g.lineTo(22, 56); g.closePath(); g.fill();
  return tex(c, { repeat: false, srgb: true });
}

// ------------------------------------------------------------------ decal atlas (1024 x 1024), rects in UV (u0, v0, u1, v1), v1 = top
// row layout in canvas px (y from the top):
//   0..128     big sign "STÁČÍRNA" (1024 wide)
//   128..256   "PLZEŇSKÝ SVĚTOVAR" brand plate (512) + "ZMETKY" board (256) + "POZOR" (256)
//   256..384   station signs wash | fill (512 each)
//   384..512   station signs cap | ship
//   512..640   number plates 1..4 (128 each) + bell plate + lift sign (512)
//   640..896   chalk tally board (512 x 256) + "KOUŘITI SE ZAKAZUJE" (512 x 128) + floor stencil (512 x 128)
//   896..1024  barrel head brand (128) + dispatch counter (256) + crate stencil (256)
const px = (x, y, w, h) => [x / 1024, 1 - (y + h) / 1024, (x + w) / 1024, 1 - y / 1024];
export const DECALS = {
  hall: px(0, 0, 1024, 128),
  brand: px(0, 128, 512, 128), rejects: px(512, 128, 256, 128), caution: px(768, 128, 256, 128),
  st_wash: px(0, 256, 512, 128), st_fill: px(512, 256, 512, 128), st_cap: px(0, 384, 512, 128), st_ship: px(512, 384, 512, 128),
  key1: px(0, 512, 128, 128), key2: px(128, 512, 128, 128), key3: px(256, 512, 128, 128), key4: px(384, 512, 128, 128),
  lift: px(512, 512, 512, 128),
  board: px(0, 640, 512, 256), smoke: px(512, 640, 512, 128), stencil: px(512, 768, 512, 128),
  head: px(0, 896, 128, 128), counter: px(128, 896, 256, 128), crate: px(384, 896, 256, 128),
};
function drawDecals(stations) {
  const W = 1024, H = 1024, c = canvas(W, H), g = c.getContext('2d'), R = rng(5);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const chips = (x, y, w, h, n) => { for (let i = 0; i < n; i++) { g.fillStyle = 'rgba(30,26,22,0.85)'; g.beginPath(); g.arc(x + R() * w, y + (R() < 0.5 ? R() * 8 : h - R() * 8), 1.5 + R() * 4, 0, 6.283); g.fill(); } };
  const enamel = (x, y, w, h, bg, ink, text, font, sub = null) => {
    g.fillStyle = '#ece4d0'; roundRect(g, x + 4, y + 4, w - 8, h - 8, 14); g.fill();
    g.fillStyle = bg; roundRect(g, x + 12, y + 12, w - 24, h - 24, 10); g.fill();
    g.strokeStyle = ink; g.lineWidth = 2.5; roundRect(g, x + 19, y + 19, w - 38, h - 38, 7); g.stroke();
    g.fillStyle = ink; g.font = font;
    g.fillText(text, x + w / 2, y + h / 2 + (sub ? -10 : 2), w - 60);
    if (sub) { g.font = 'bold 20px Georgia, serif'; g.fillText(sub, x + w / 2, y + h / 2 + 30, w - 60); }
    chips(x + 6, y + 6, w - 12, h - 12, Math.round(w / 40));
  };
  enamel(0, 0, 1024, 128, '#1e3a2c', '#efe6cc', 'STÁČÍRNA', 'bold 76px Georgia, serif');
  enamel(0, 128, 512, 128, '#7c2318', '#f2e8cf', 'PLZEŇSKÝ SVĚTOVAR', 'bold 40px Georgia, serif', 'ČESKÝ PLZEŇSKÝ PIVOVAR · 1913');
  // rejects board (wood, painted letters)
  g.fillStyle = '#5a4128'; g.fillRect(512, 128, 256, 128);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#6b4e30' : '#614629'; g.fillRect(516, 132 + i * 30, 248, 28); }
  g.fillStyle = '#e8dcc0'; g.font = 'bold 50px Georgia, serif'; g.fillText('ZMETKY', 640, 194, 230);
  enamel(768, 128, 256, 128, '#b8892e', '#1d1712', 'POZOR!', 'bold 46px Georgia, serif', 'MOKRÁ PODLAHA');
  // station signs: cream enamel, colour band left with the station's tag icon, black name
  const order = ['wash', 'fill', 'cap', 'ship'];
  order.forEach((id, i) => {
    const x = (i % 2) * 512, y = 256 + Math.floor(i / 2) * 128;
    g.fillStyle = '#1a1612'; roundRect(g, x + 2, y + 2, 508, 124, 16); g.fill();
    g.fillStyle = '#efe7d3'; roundRect(g, x + 8, y + 8, 496, 112, 12); g.fill();
    g.fillStyle = stations[id].color; roundRect(g, x + 8, y + 8, 124, 112, 12); g.fill(); g.fillRect(x + 100, y + 8, 32, 112);
    drawIcon(g, id, x + 70, y + 64, 74, '#fbf5e6');
    g.fillStyle = '#1d1712'; g.font = 'bold 62px Georgia, serif'; g.fillText(stations[id].name.toUpperCase(), x + 318, y + 66, 350);
    g.fillStyle = stations[id].color; g.fillRect(x + 150, y + 100, 336, 6);
    chips(x + 6, y + 6, 500, 116, 10);
  });
  // number plates (keyboard keys) — black enamel squares, cream digit, station colour frame
  order.forEach((id, i) => {
    const x = i * 128, y = 512;
    g.fillStyle = '#ece4d0'; roundRect(g, x + 4, y + 4, 120, 120, 14); g.fill();
    g.fillStyle = stations[id].color; roundRect(g, x + 10, y + 10, 108, 108, 10); g.fill();
    g.fillStyle = '#17130f'; roundRect(g, x + 20, y + 20, 88, 88, 8); g.fill();
    g.fillStyle = '#f5edd8'; g.font = 'bold 80px Georgia, serif'; g.fillText(String(i + 1), x + 64, y + 70);
    chips(x + 6, y + 6, 116, 116, 3);
  });
  enamel(512, 512, 512, 128, '#1f3d6e', '#f2ecdc', 'VÝTAH ZE SKLEPŮ', 'bold 44px Georgia, serif', 'LEŽÁCKÉ SKLEPY II');
  // chalk tally board
  {
    const x = 0, y = 640;
    g.fillStyle = '#5a4128'; g.fillRect(x, y, 512, 256);
    g.fillStyle = '#23282a'; g.fillRect(x + 14, y + 14, 484, 228);
    g.fillStyle = 'rgba(236,232,220,0.9)'; g.textAlign = 'left';
    g.font = 'italic bold 34px Georgia, serif'; g.fillText('Expedice, Plzeň', x + 34, y + 50);
    g.font = 'italic 26px Georgia, serif';
    g.fillText('Hostinec U Salzmannů', x + 38, y + 98);
    g.fillText('Měšťanská beseda', x + 38, y + 134);
    g.fillText('Restaurace Na Spilce', x + 38, y + 170);
    g.strokeStyle = 'rgba(236,232,220,0.8)'; g.lineWidth = 3;
    for (let k = 0; k < 3; k++) { // tally marks
      const yy = y + 88 + k * 36;
      for (let m = 0; m < 4 + (k % 2); m++) { g.beginPath(); g.moveTo(x + 360 + m * 14, yy + 2); g.lineTo(x + 364 + m * 14, yy + 24); g.stroke(); }
      g.beginPath(); g.moveTo(x + 354, yy + 18); g.lineTo(x + 420, yy + 6); g.stroke();
    }
    g.font = 'italic 24px Georgia, serif'; g.fillText('12 sudů 1/2 hl', x + 38, y + 214);
    g.textAlign = 'center';
  }
  enamel(512, 640, 512, 128, '#1f3d6e', '#f2ecdc', 'KOUŘITI SE ZAKAZUJE', 'bold 44px Georgia, serif');
  // floor stencil (painted directly on the cement, used on the dock)
  g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(512, 768, 512, 128);
  g.fillStyle = 'rgba(232,220,186,0.85)'; g.font = 'bold 74px Georgia, serif'; g.fillText('EXPEDICE', 768, 834, 470);
  // barrel head brand (burnt into the oak)
  {
    const cx = 64, cy = 960;
    g.fillStyle = '#b07a44'; g.beginPath(); g.arc(cx, cy, 62, 0, 6.283); g.fill();
    g.strokeStyle = 'rgba(60,30,12,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 50, 0, 6.283); g.stroke();
    g.fillStyle = 'rgba(60,30,12,0.85)'; g.font = 'bold 20px Georgia, serif'; g.fillText('PLZEŇ', cx, cy - 12); g.font = 'bold 16px Georgia, serif'; g.fillText('1926', cx, cy + 14);
  }
  // dispatch counter face (brass bezel, number wheels)
  {
    const x = 128, y = 896;
    g.fillStyle = '#9a7a3a'; roundRect(g, x + 4, y + 8, 248, 112, 14); g.fill();
    g.fillStyle = '#1b1712'; roundRect(g, x + 16, y + 22, 224, 66, 6); g.fill();
    g.font = 'bold 50px Georgia, serif';
    for (let i = 0; i < 4; i++) { g.fillStyle = '#efe6d0'; g.fillRect(x + 26 + i * 54, y + 28, 46, 54); g.fillStyle = '#1b1712'; g.fillText(String([0, 0, 1, 2][i]), x + 49 + i * 54, y + 57); }
    g.fillStyle = '#1b1712'; g.font = 'bold 18px Georgia, serif'; g.fillText('SUDŮ ODESLÁNO', x + 128, y + 104);
  }
  // crate stencil
  g.fillStyle = '#8d6a45'; g.fillRect(384, 896, 256, 128);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#7d5c3a' : '#8a6842'; g.fillRect(386, 898 + i * 31, 252, 29); }
  g.fillStyle = 'rgba(40,24,14,0.8)'; g.font = 'bold 36px Georgia, serif'; g.fillText('ZÁTKY · ČPP', 512, 962, 230);
  return tex(c, { repeat: false });
}

// ------------------------------------------------------------------ splash / foam blob (alpha), for puddles + particles
function drawSplat() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d'), R = rng(17);
  const img = g.createImageData(S, S);
  const lobes = Array.from({ length: 11 }, () => ({ a: R() * 6.283, d: 0.25 + R() * 0.35, r: 0.1 + R() * 0.14 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S - 0.5, v = y / S - 0.5, d = Math.hypot(u, v) * 2;
    let l = Math.max(0, 1 - d / 0.62);
    for (const k of lobes) { const dx = u - Math.cos(k.a) * k.d * 0.5, dy = v - Math.sin(k.a) * k.d * 0.5; l = Math.max(l, 1 - Math.hypot(dx, dy) / k.r); }
    const a = Math.min(1, Math.max(0, l * 2.2));
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  return tex(c, { repeat: false, srgb: false });
}

let cache = null;
export function getTextures5(stations) {
  if (cache) return cache;
  cache = {
    floor: drawFloor(), belt: drawBelt(), staves: drawStaves(false), stavesDirty: drawStaves(true),
    tags: drawTags(stations), arrow: drawArrow(), decals: drawDecals(stations), splat: drawSplat(),
  };
  return cache;
}
