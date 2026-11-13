// Shared helpers for the two landmarks (náměstí Republiky + Světovar).
// Owned by "landmarks". One procedural texture atlas for every wall/facade (tinted by vertex colours),
// a repeating roof-tile texture, a cobble texture, a fence-lattice texture and a smoke puff.
// Geometry is accumulated in Builders (plain arrays) and merged into ONE mesh per material.
import * as THREE from 'three';

// ---------------------------------------------------------------------------------------------
// small utils
// ---------------------------------------------------------------------------------------------
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _colCache = new Map();
export function col(c) {
  if (c && c.isColor) return c;
  let k = _colCache.get(c);
  if (!k) { k = new THREE.Color(c); _colCache.set(c, k); }
  return k;
}

// ---------------------------------------------------------------------------------------------
// atlas layout: 8 x 8 tiles of 128 px in a 1024 canvas. [col, row, widthInTiles, heightInTiles]
// ---------------------------------------------------------------------------------------------
const TP = 128;
const AT = 1024;
const LAYOUT = {
  plain: [0, 0], win: [1, 0], winArch: [2, 0], winOrn: [3, 0], winSmall: [4, 0], winTall: [5, 0], door: [6, 0], shop: [7, 0],
  rustic: [0, 1], sgraf: [1, 1], sgrafWin: [2, 1], ashlar: [3, 1], lancet: [4, 1], belfry: [5, 1], brick: [6, 1], slats: [7, 1],
  stone: [0, 2], clock: [1, 2], dark: [2, 2], cornice: [3, 2], gable: [4, 2], lesene: [5, 2], gate: [6, 2], wood: [7, 2],
  wagon: [0, 3, 3, 1], awning: [3, 3], winBaroque: [4, 3], portal: [5, 3], rose: [6, 3], villaWin: [7, 3],
  svetovar: [0, 4, 2, 1], malt: [2, 4], plinth: [3, 4], white: [4, 4], loadDoor: [5, 4], poster: [6, 4], winPair: [7, 4],
  cpp: [0, 5, 4, 1], shopB: [4, 5], winShutter: [5, 5], sgrafFig: [6, 5], ashlarDark: [7, 5],
  wagonEnd: [0, 6], winRound: [1, 6], arcadeWin: [2, 6], glass: [3, 6], tile: [4, 6], brickDark: [5, 6], grass: [6, 6], earth: [7, 6],
  brickGrey: [0, 7], rusticArch: [1, 7], winTriple: [2, 7], dormerWin: [3, 7], louver: [4, 7], plinthWin: [5, 7], clockFace: [6, 7], corniceHeavy: [7, 7],
};

let KIT = null;

/** Lazily created shared textures + materials + tile UV rects. */
export function getKit(ctx) {
  if (KIT) return KIT;
  const aniso = Math.min(8, ctx?.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  const tiles = {};
  const inset = 2;
  for (const [name, [cx, cy, cw = 1, ch = 1]] of Object.entries(LAYOUT)) {
    const x = cx * TP, y = cy * TP, w = cw * TP, h = ch * TP;
    tiles[name] = [(x + inset) / AT, 1 - (y + h - inset) / AT, (x + w - inset) / AT, 1 - (y + inset) / AT];
  }
  const atlasTex = canvasTex(paintAtlas(), { aniso: Math.min(4, aniso) });
  const roofTex = canvasTex(paintRoof(), { repeat: true, aniso });
  const cobbleTex = canvasTex(paintCobbles(), { repeat: true, aniso });
  const latticeTex = canvasTex(paintLattice(), { aniso: Math.min(4, aniso) });
  const smokeTex = canvasTex(paintSmoke(), {});
  const roofHeroTex = canvasTex(paintRoofHero(), { repeat: true, aniso });

  const mats = {
    wall: new THREE.MeshLambertMaterial({ map: atlasTex, vertexColors: true }),
    roof: new THREE.MeshLambertMaterial({ map: roofTex, vertexColors: true, side: THREE.DoubleSide }),
    props: new THREE.MeshLambertMaterial({ vertexColors: true }),
    ground: new THREE.MeshLambertMaterial({ map: cobbleTex, vertexColors: true }),
    lattice: new THREE.MeshLambertMaterial({ map: latticeTex, alphaTest: 0.5, side: THREE.DoubleSide }),
    smoke: makeSmokeMaterial(smokeTex),
    // Světovar (menu hero): roof texture readable from 100–200 m, and a darker coal-smoke material
    roofHero: new THREE.MeshLambertMaterial({ map: roofHeroTex, vertexColors: true, side: THREE.DoubleSide }),
    smokeDark: makeSmokeMaterial(smokeTex, 0xa49d94),
  };
  mats.wall.name = 'lm-wall'; mats.roof.name = 'lm-roof'; mats.props.name = 'lm-props';
  mats.ground.name = 'lm-ground'; mats.lattice.name = 'lm-lattice'; mats.smoke.name = 'lm-smoke';
  mats.roofHero.name = 'lm-roof-hero'; mats.smokeDark.name = 'lm-smoke-dark';
  KIT = { tiles, mats, textures: { atlasTex, roofTex, cobbleTex, latticeTex, smokeTex, roofHeroTex } };
  return KIT;
}

function canvasTex(cv, { repeat = false, aniso = 1 } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeSmokeMaterial(map, color = 0xeeeae2) {
  // emissive share keeps backlit smoke from turning into black blobs at dusk
  const m = new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, color, emissive: new THREE.Color(color).multiplyScalar(0.5) });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vAlpha;');
  };
  return m;
}

// ---------------------------------------------------------------------------------------------
// canvas painting
// ---------------------------------------------------------------------------------------------
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function speckle(g, R, x, y, w, h, n, dark = 0.07, light = 0.07) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = R() < 0.5 ? `rgba(70,60,45,${R() * dark})` : `rgba(255,252,240,${R() * light})`;
    g.fillRect(x + R() * w, y + R() * h, 1 + R() * 2.5, 1 + R() * 2.5);
  }
}

function plaster(g, R, x, y, w, h, base = '#ece7dc', dirt = 0.09) {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  speckle(g, R, x, y, w, h, (w * h) / 40);
  for (let i = 0; i < 3; i++) {
    const cx = x + R() * w, cy = y + R() * h, r = 12 + R() * 30;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(110,95,70,${0.04 + R() * 0.05})`); gr.addColorStop(1, 'rgba(110,95,70,0)');
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  if (dirt) {
    const gr = g.createLinearGradient(0, y + h * 0.55, 0, y + h);
    gr.addColorStop(0, 'rgba(80,68,50,0)'); gr.addColorStop(1, `rgba(80,68,50,${dirt})`);
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  }
}

function ashlar(g, R, x, y, w, h, base = '#c9c3b6', rowH = 14, joint = 'rgba(60,50,38,0.5)') {
  g.fillStyle = base; g.fillRect(x, y, w, h);
  for (let yy = y; yy < y + h; yy += rowH) {
    let xx = x - R() * 20;
    while (xx < x + w) {
      const bw = 18 + R() * 26;
      const v = (R() - 0.5) * 0.16;
      g.fillStyle = v > 0 ? `rgba(255,250,235,${v})` : `rgba(50,40,30,${-v})`;
      g.fillRect(xx, yy, bw, rowH);
      g.fillStyle = joint; g.fillRect(xx, yy, 1.5, rowH);
      xx += bw;
    }
    g.fillStyle = joint; g.fillRect(x, yy, w, 1.5);
  }
  speckle(g, R, x, y, w, h, (w * h) / 30, 0.12, 0.08);
}

function brick(g, R, x, y, w, h, tones, mortar = '#9d8b78', bh = 8, bw = 22) {
  g.fillStyle = mortar; g.fillRect(x, y, w, h);
  let r = 0;
  for (let yy = y; yy < y + h; yy += bh, r++) {
    for (let xx = x - (r % 2 ? bw / 2 : 0); xx < x + w; xx += bw) {
      g.fillStyle = tones[Math.floor(R() * tones.length)];
      g.fillRect(xx + 1, yy + 1, bw - 2, bh - 2);
    }
  }
  speckle(g, R, x, y, w, h, (w * h) / 25, 0.15, 0.06);
}

function winPath(g, x, y, w, h, arch) {
  g.beginPath();
  if (arch === 'round') {
    const r = w / 2;
    g.moveTo(x, y + h); g.lineTo(x, y + r); g.arc(x + r, y + r, r, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath();
  } else if (arch === 'seg') {
    const rise = w * 0.18, r = (w * w / 4 + rise * rise) / (2 * rise);
    const a = Math.asin((w / 2) / r);
    g.moveTo(x, y + h); g.lineTo(x, y + rise);
    g.arc(x + w / 2, y + r, r, -Math.PI / 2 - a, -Math.PI / 2 + a);
    g.lineTo(x + w, y + h); g.closePath();
  } else if (arch === 'point') {
    const ys = y + w * 0.866;
    g.moveTo(x, y + h); g.lineTo(x, ys);
    g.arc(x + w, ys, w, Math.PI, Math.PI * 4 / 3);
    g.arc(x, ys, w, -Math.PI / 3, 0);
    g.lineTo(x + w, y + h); g.closePath();
  } else g.rect(x, y, w, h);
}

function windowPaint(g, cx, top, ww, wh, o = {}) {
  const { arch = null, cols = 2, rows = 3, frame = 'rgba(255,253,246,0.92)', fw = 5, sill = true, head = 'cornice', bar = 'rgba(232,226,214,0.95)' } = o;
  const x = cx - ww / 2;
  g.fillStyle = frame; winPath(g, x - fw, top - fw, ww + fw * 2, wh + fw * 2, arch); g.fill();
  g.fillStyle = 'rgba(30,26,22,0.8)'; winPath(g, x, top, ww, wh, arch); g.fill();
  const gr = g.createLinearGradient(x, top, x + ww * 0.8, top + wh);
  gr.addColorStop(0, '#6b7882'); gr.addColorStop(0.35, '#34404a'); gr.addColorStop(1, '#1b2127');
  g.fillStyle = gr; winPath(g, x + 2, top + 2, ww - 4, wh - 3, arch); g.fill();
  g.strokeStyle = bar; g.lineWidth = 2;
  const archH = arch === 'round' ? ww / 2 : arch === 'point' ? ww * 0.866 : arch === 'seg' ? ww * 0.18 : 0;
  for (let i = 1; i < cols; i++) {
    const xx = x + (ww * i) / cols;
    g.beginPath(); g.moveTo(xx, top + archH * 0.5); g.lineTo(xx, top + wh); g.stroke();
  }
  for (let j = 1; j < rows; j++) {
    const yy = top + archH + ((wh - archH) * j) / rows;
    g.beginPath(); g.moveTo(x, yy); g.lineTo(x + ww, yy); g.stroke();
  }
  if (archH) { g.beginPath(); g.moveTo(x, top + archH); g.lineTo(x + ww, top + archH); g.stroke(); }
  if (sill) {
    g.fillStyle = frame; g.fillRect(x - fw - 3, top + wh + fw - 1, ww + fw * 2 + 6, 5);
    g.fillStyle = 'rgba(50,40,30,0.25)'; g.fillRect(x - fw - 3, top + wh + fw + 4, ww + fw * 2 + 6, 4);
  }
  if (head === 'cornice') {
    g.fillStyle = frame; g.fillRect(x - fw - 4, top - fw - 8, ww + fw * 2 + 8, 7);
    g.fillStyle = 'rgba(50,40,30,0.28)'; g.fillRect(x - fw - 4, top - fw - 1, ww + fw * 2 + 8, 2);
  } else if (head === 'pediment') {
    g.fillStyle = frame; g.beginPath();
    g.moveTo(x - fw - 6, top - fw - 2); g.lineTo(cx, top - fw - 20); g.lineTo(x + ww + fw + 6, top - fw - 2); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(60,50,40,0.35)'; g.lineWidth = 1.5; g.stroke();
  } else if (head === 'key' && arch) {
    g.fillStyle = frame; g.fillRect(cx - 5, top - fw - 6, 10, 12);
  }
}

function fitText(g, text, cx, cy, maxW, font, color) {
  g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = g.measureText(text).width;
  const s = Math.min(1, maxW / w);
  g.save(); g.translate(cx, cy); g.scale(s, 1); g.fillText(text, 0, 0); g.restore();
}

function paintAtlas() {
  const cv = mkCanvas(AT, AT);
  const g = cv.getContext('2d');
  const R = rng(1926);
  g.fillStyle = '#e9e3d6'; g.fillRect(0, 0, AT, AT);
  const P = {
    plain(x, y, w, h) { plaster(g, R, x, y, w, h); },
    win(x, y, w, h) { plaster(g, R, x, y, w, h); windowPaint(g, x + w / 2, y + 30, 44, 66, { rows: 3 }); },
    winArch(x, y, w, h) { plaster(g, R, x, y, w, h); windowPaint(g, x + w / 2, y + 24, 44, 74, { arch: 'round', head: 'key' }); },
    winOrn(x, y, w, h) {
      plaster(g, R, x, y, w, h); windowPaint(g, x + w / 2, y + 34, 42, 62, { head: 'pediment' });
      g.fillStyle = 'rgba(255,253,246,0.85)'; g.fillRect(x + w / 2 - 26, y + 110, 52, 9);
      g.fillStyle = 'rgba(60,50,40,0.18)'; for (let i = 0; i < 5; i++) g.fillRect(x + w / 2 - 22 + i * 10, y + 112, 5, 5);
    },
    winSmall(x, y, w, h) { plaster(g, R, x, y, w, h); windowPaint(g, x + w / 2, y + 44, 34, 38, { rows: 2, head: null }); },
    winTall(x, y, w, h) { plaster(g, R, x, y, w, h, '#ebe4d4', 0.05); windowPaint(g, x + w / 2, y + 10, 76, 108, { arch: 'seg', cols: 4, rows: 6, head: 'key', fw: 6, sill: false }); },
    door(x, y, w, h) {
      plaster(g, R, x, y, w, h);
      g.fillStyle = 'rgba(255,253,246,0.92)'; winPath(g, x + 28, y + 26, 72, 104, 'round'); g.fill();
      g.fillStyle = '#4a3324'; winPath(g, x + 35, y + 33, 58, 97, 'round'); g.fill();
      g.fillStyle = '#2c3138'; winPath(g, x + 38, y + 36, 52, 30, 'round'); g.fill();
      g.strokeStyle = 'rgba(20,14,10,0.6)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x + 64, y + 66); g.lineTo(x + 64, y + 128); g.stroke();
      for (let i = 0; i < 2; i++) { g.strokeRect(x + 41 + i * 26, y + 74, 20, 20); g.strokeRect(x + 41 + i * 26, y + 100, 20, 24); }
    },
    shop(x, y, w, h) {
      plaster(g, R, x, y, w, h);
      g.fillStyle = '#3d3226'; g.fillRect(x + 8, y + 22, w - 16, h - 22);
      g.fillStyle = '#2a3a33'; g.fillRect(x + 8, y + 22, w - 16, 20);
      fitText(g, ['OBCHOD', 'KÁVA', 'PEKAŘ', 'TABÁK', 'ŘEZNÍK', 'LÁTKY'][Math.floor(R() * 6)], x + w / 2, y + 33, w - 30, 'bold 14px Georgia, serif', '#e9d9a6');
      const gr = g.createLinearGradient(x, y + 46, x + w, y + h); gr.addColorStop(0, '#71808a'); gr.addColorStop(0.5, '#2b343c'); gr.addColorStop(1, '#1b2025');
      g.fillStyle = gr; g.fillRect(x + 14, y + 48, 58, h - 60); g.fillRect(x + 82, y + 48, 32, h - 52);
      g.fillStyle = '#56442f'; g.fillRect(x + 14, y + h - 18, 58, 6);
      g.fillStyle = 'rgba(210,190,140,0.6)'; for (let i = 0; i < 4; i++) g.fillRect(x + 18 + i * 13, y + h - 30, 9, 11);
    },
    shopB(x, y, w, h) {
      plaster(g, R, x, y, w, h);
      g.fillStyle = '#5b2f26'; g.fillRect(x + 6, y + 20, w - 12, h - 20);
      g.fillStyle = '#e7dcc2'; g.fillRect(x + 6, y + 20, w - 12, 18);
      fitText(g, ['HOSTINEC', 'LÉKÁRNA', 'KNIHY', 'HODINY'][Math.floor(R() * 4)], x + w / 2, y + 30, w - 24, 'bold 13px Georgia, serif', '#5b2f26');
      const gr = g.createLinearGradient(x, y + 46, x + w, y + h); gr.addColorStop(0, '#76848d'); gr.addColorStop(1, '#1d2228');
      g.fillStyle = gr; g.fillRect(x + 12, y + 46, 44, h - 56); g.fillRect(x + 72, y + 46, 44, h - 56);
      g.fillStyle = '#3d2a1e'; g.fillRect(x + 58, y + 46, 12, h - 46);
    },
    rustic(x, y, w, h) {
      plaster(g, R, x, y, w, h, '#e3dccd', 0.12);
      g.fillStyle = 'rgba(60,50,40,0.28)'; for (let yy = y + 14; yy < y + h; yy += 16) g.fillRect(x, yy, w, 3);
      windowPaint(g, x + w / 2, y + 36, 42, 58, { head: 'key', arch: 'seg' });
    },
    sgraf(x, y, w, h) { sgraffito(g, R, x, y, w, h); },
    sgrafWin(x, y, w, h) { sgraffito(g, R, x, y, w, h); windowPaint(g, x + w / 2, y + 30, 42, 62, { frame: 'rgba(238,234,224,1)', head: 'pediment', fw: 7 }); },
    sgrafFig(x, y, w, h) {
      sgraffito(g, R, x, y, w, h);
      g.fillStyle = '#e9e6de'; g.fillRect(x + 6, y + 20, w - 12, h - 40);
      g.strokeStyle = '#3f3f3c'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { // stylised figures / scrolls
        const cx = x + 26 + i * 38; g.beginPath(); g.arc(cx, y + 42, 7, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(cx, y + 49); g.lineTo(cx, y + 80); g.moveTo(cx - 12, y + 60); g.lineTo(cx + 12, y + 60);
        g.moveTo(cx, y + 80); g.lineTo(cx - 9, y + 100); g.moveTo(cx, y + 80); g.lineTo(cx + 9, y + 100); g.stroke();
      }
    },
    ashlar(x, y, w, h) { ashlar(g, R, x, y, w, h); },
    ashlarDark(x, y, w, h) { ashlar(g, R, x, y, w, h, '#aaa293'); },
    lancet(x, y, w, h) {
      ashlar(g, R, x, y, w, h);
      const ww = 50, x0 = x + w / 2 - ww / 2, top = y + 6;
      g.fillStyle = '#b7b0a2'; winPath(g, x0 - 7, top - 4, ww + 14, h - 6, 'point'); g.fill();
      g.fillStyle = '#20262c'; winPath(g, x0, top + 3, ww, h - 12, 'point'); g.fill();
      g.strokeStyle = 'rgba(120,110,95,0.35)'; g.lineWidth = 1;
      for (let k = -h; k < h; k += 7) { g.beginPath(); g.moveTo(x0 + k, top); g.lineTo(x0 + k + h, top + h); g.moveTo(x0 + k + h, top); g.lineTo(x0 + k, top + h); g.stroke(); }
      g.fillStyle = '#b3a68d'; g.fillRect(x + w / 2 - 2, top + 34, 4, h - 40);
      g.strokeStyle = '#b3a68d'; g.lineWidth = 4; g.beginPath(); g.arc(x + w / 2, top + 22, 9, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#b3a68d'; g.fillRect(x0 - 8, y + h - 8, ww + 16, 8);
    },
    portal(x, y, w, h) {
      ashlar(g, R, x, y, w, h);
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#b8ab92' : '#9c8f78'; winPath(g, x + 10 + i * 6, y + 10 + i * 6, w - 20 - i * 12, h - 10 - i * 6, 'point'); g.fill(); }
      g.fillStyle = '#3a2a1e'; winPath(g, x + 36, y + 40, w - 72, h - 40, 'point'); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + w / 2 - 1, y + 70, 2, h - 70);
    },
    rose(x, y, w, h) {
      ashlar(g, R, x, y, w, h);
      g.fillStyle = '#ab9e85'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 54, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#20262c'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 47, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ab9e85'; g.lineWidth = 4;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(x + w / 2, y + h / 2); g.lineTo(x + w / 2 + Math.cos(a) * 47, y + h / 2 + Math.sin(a) * 47); g.stroke(); }
      g.beginPath(); g.arc(x + w / 2, y + h / 2, 16, 0, Math.PI * 2); g.stroke();
    },
    belfry(x, y, w, h) {
      ashlar(g, R, x, y, w, h);
      for (const ox of [-24, 24]) {
        const ww = 30, x0 = x + w / 2 + ox - ww / 2;
        g.fillStyle = '#ac9f86'; winPath(g, x0 - 5, y + 12, ww + 10, h - 22, 'point'); g.fill();
        g.fillStyle = '#1c1b1a'; winPath(g, x0, y + 17, ww, h - 30, 'point'); g.fill();
        g.fillStyle = '#5a4e40'; for (let yy = y + 44; yy < y + h - 16; yy += 9) g.fillRect(x0, yy, ww, 4);
      }
    },
    brick(x, y, w, h) { brick(g, R, x, y, w, h, ['#94604a', '#86553f', '#9c6a50', '#7b4c39', '#a0705a']); },
    brickGrey(x, y, w, h) { brick(g, R, x, y, w, h, ['#8c776a', '#7f6b5f', '#968274', '#86705f', '#9a8a7c'], '#a39a8e'); },
    brickDark(x, y, w, h) { brick(g, R, x, y, w, h, ['#6e4a3c', '#634235', '#7a5444', '#5a3c30'], '#857565'); },
    slats(x, y, w, h) {
      g.fillStyle = '#2b2622'; g.fillRect(x, y, w, h);
      for (let yy = y; yy < y + h; yy += 8) { g.fillStyle = `rgba(${90 + R() * 30},${80 + R() * 20},${70 + R() * 20},1)`; g.fillRect(x, yy, w, 5); }
      g.fillStyle = '#1d1a17'; for (let xx = x; xx < x + w; xx += 32) g.fillRect(xx, y, 5, h);
      g.strokeStyle = 'rgba(20,17,14,0.9)'; g.lineWidth = 3; g.beginPath();
      g.moveTo(x, y); g.lineTo(x + w, y + h); g.moveTo(x + w, y); g.lineTo(x, y + h); g.stroke();
    },
    stone(x, y, w, h) { ashlar(g, R, x, y, w, h, '#ddd5c4', 22, 'rgba(90,80,65,0.4)'); },
    plinth(x, y, w, h) { ashlar(g, R, x, y, w, h, '#a8a296', 20, 'rgba(50,45,40,0.6)'); },
    clock(x, y, w, h) {
      plaster(g, R, x, y, w, h, '#e8e2d4', 0);
      const cx = x + w / 2, cy = y + h / 2;
      g.fillStyle = '#2e2b27'; g.beginPath(); g.arc(cx, cy, 54, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f4efe2'; g.beginPath(); g.arc(cx, cy, 47, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#26231f';
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.save(); g.translate(cx + Math.sin(a) * 40, cy - Math.cos(a) * 40); g.rotate(a); g.fillRect(-2, -5, 4, 10); g.restore(); }
      g.strokeStyle = '#1d1a17'; g.lineCap = 'round';
      g.lineWidth = 5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - 20, cy - 12); g.stroke();
      g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 26, cy - 22); g.stroke();
      g.lineCap = 'butt';
    },
    dark(x, y, w, h) { g.fillStyle = '#2f2b27'; g.fillRect(x, y, w, h); speckle(g, R, x, y, w, h, 300, 0.2, 0.06); },
    white(x, y, w, h) { g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h); },
    glass(x, y, w, h) { const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#fff6d8'); gr.addColorStop(1, '#e8c98a'); g.fillStyle = gr; g.fillRect(x, y, w, h); },
    cornice(x, y, w, h) {
      plaster(g, R, x, y, w, h, '#efe9dd', 0);
      g.fillStyle = 'rgba(60,50,40,0.25)'; g.fillRect(x, y + 70, w, 6);
      g.fillStyle = 'rgba(255,255,250,0.7)'; g.fillRect(x, y + 50, w, 18);
      g.fillStyle = 'rgba(60,50,40,0.3)'; for (let xx = x + 3; xx < x + w; xx += 12) g.fillRect(xx, y + 54, 6, 10);
      g.fillStyle = 'rgba(255,255,250,0.5)'; g.fillRect(x, y + 86, w, 8);
    },
    gable(x, y, w, h) {
      plaster(g, R, x, y, w, h, '#ece7dc', 0);
      g.fillStyle = 'rgba(255,253,246,0.95)'; g.beginPath(); g.arc(x + w / 2, y + 74, 20, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#26303a'; g.beginPath(); g.arc(x + w / 2, y + 74, 14, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(240,236,226,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + w / 2 - 14, y + 74); g.lineTo(x + w / 2 + 14, y + 74); g.moveTo(x + w / 2, y + 60); g.lineTo(x + w / 2, y + 88); g.stroke();
      g.fillStyle = 'rgba(60,50,40,0.18)'; g.fillRect(x, y + h - 10, w, 4);
    },
    winRound(x, y, w, h) {
      plaster(g, R, x, y, w, h, '#ece7dc', 0.04);
      g.fillStyle = 'rgba(255,253,246,0.95)'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 24, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#26303a'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 17, 0, Math.PI * 2); g.fill();
    },
    lesene(x, y, w, h) {
      plaster(g, R, x, y, w, h, '#eee8dc');
      g.fillStyle = 'rgba(255,255,250,0.55)'; g.fillRect(x, y, 14, h); g.fillRect(x + w - 14, y, 14, h);
      g.fillStyle = 'rgba(70,60,45,0.22)'; g.fillRect(x + 14, y, 2, h); g.fillRect(x + w - 16, y, 2, h);
      windowPaint(g, x + w / 2, y + 26, 46, 76, { arch: 'seg', rows: 4, cols: 3, head: 'key' });
    },
    gate(x, y, w, h) {
      plaster(g, R, x, y, w, h);
      g.fillStyle = '#d8d0bf'; winPath(g, x + 10, y + 12, w - 20, h - 12, 'seg'); g.fill();
      g.fillStyle = '#4b3726'; winPath(g, x + 17, y + 19, w - 34, h - 19, 'seg'); g.fill();
      g.fillStyle = 'rgba(25,18,12,0.55)'; for (let xx = x + 24; xx < x + w - 20; xx += 11) g.fillRect(xx, y + 30, 2, h - 30);
      g.fillRect(x + w / 2 - 2, y + 22, 4, h - 22);
      g.strokeStyle = 'rgba(25,18,12,0.6)'; g.lineWidth = 3; g.beginPath();
      g.moveTo(x + 20, y + h - 6); g.lineTo(x + w / 2 - 2, y + 40); g.moveTo(x + w - 20, y + h - 6); g.lineTo(x + w / 2 + 2, y + 40); g.stroke();
    },
    loadDoor(x, y, w, h) {
      plaster(g, R, x, y, w, h, '#e9e2d1', 0.14);
      g.fillStyle = '#d9d1c0'; g.fillRect(x + 14, y + 16, w - 28, h - 16);
      g.fillStyle = '#5a4430'; g.fillRect(x + 20, y + 22, w - 40, h - 22);
      g.fillStyle = 'rgba(25,18,12,0.5)'; for (let xx = x + 26; xx < x + w - 22; xx += 10) g.fillRect(xx, y + 22, 2, h - 22);
      g.fillStyle = 'rgba(30,24,18,0.7)'; g.fillRect(x + w / 2 - 1, y + 22, 3, h - 22);
    },
    wood(x, y, w, h) {
      g.fillStyle = '#7a5a3c'; g.fillRect(x, y, w, h);
      for (let yy = y; yy < y + h; yy += 12) { g.fillStyle = `rgba(${100 + R() * 40},${70 + R() * 30},${40 + R() * 20},0.6)`; g.fillRect(x, yy, w, 10); g.fillStyle = 'rgba(30,20,10,0.5)'; g.fillRect(x, yy + 10, w, 2); }
      speckle(g, R, x, y, w, h, 400, 0.2, 0.05);
    },
    awning(x, y, w, h) {
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#efe4cc' : '#a8423a'; g.fillRect(x + (i * w) / 8, y, w / 8, h); }
      speckle(g, R, x, y, w, h, 300, 0.15, 0.1);
      g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(x, y + h - 10, w, 10);
    },
    winBaroque(x, y, w, h) {
      plaster(g, R, x, y, w, h);
      g.fillStyle = 'rgba(255,253,246,0.9)';
      g.beginPath(); g.moveTo(x + 30, y + 26); g.quadraticCurveTo(x + w / 2, y + 2, x + w - 30, y + 26); g.lineTo(x + w - 30, y + 30); g.lineTo(x + 30, y + 30); g.fill();
      g.fillRect(x + 32, y + 98, w - 64, 18);
      windowPaint(g, x + w / 2, y + 32, 42, 62, { head: null, fw: 6 });
      g.fillStyle = 'rgba(90,75,55,0.25)'; g.beginPath(); g.arc(x + w / 2, y + 107, 6, 0, Math.PI * 2); g.fill();
    },
    winShutter(x, y, w, h) {
      plaster(g, R, x, y, w, h);
      windowPaint(g, x + w / 2, y + 32, 40, 62, { head: 'cornice' });
      g.fillStyle = '#4f6146'; g.fillRect(x + w / 2 - 46, y + 27, 18, 72); g.fillRect(x + w / 2 + 28, y + 27, 18, 72);
      g.fillStyle = 'rgba(20,30,20,0.4)'; for (let yy = y + 31; yy < y + 97; yy += 6) { g.fillRect(x + w / 2 - 44, yy, 14, 2); g.fillRect(x + w / 2 + 30, yy, 14, 2); }
    },
    villaWin(x, y, w, h) {
      plaster(g, R, x, y, w, h, '#ede5d3');
      g.fillStyle = 'rgba(150,110,80,0.35)'; g.fillRect(x, y + h - 14, w, 6);
      windowPaint(g, x + w / 2, y + 28, 46, 70, { arch: 'seg', head: 'key', rows: 3, cols: 2, fw: 7 });
      g.fillStyle = 'rgba(255,253,246,0.9)'; g.fillRect(x + w / 2 - 20, y + 108, 40, 6);
    },
    arcadeWin(x, y, w, h) {
      plaster(g, R, x, y, w, h);
      windowPaint(g, x + w / 2 - 22, y + 26, 30, 78, { arch: 'round', head: null, cols: 1 });
      windowPaint(g, x + w / 2 + 22, y + 26, 30, 78, { arch: 'round', head: null, cols: 1 });
    },
    malt(x, y, w, h) {
      plaster(g, R, x, y, w, h, '#ebe4d3', 0.08);
      for (const ox of [-26, 26]) windowPaint(g, x + w / 2 + ox, y + 40, 26, 40, { head: 'cornice', rows: 2, cols: 2, fw: 4 });
    },
    winPair(x, y, w, h) {
      plaster(g, R, x, y, w, h);
      for (const ox of [-22, 22]) windowPaint(g, x + w / 2 + ox, y + 30, 28, 66, { head: null, rows: 3, cols: 1, fw: 4 });
      g.fillStyle = 'rgba(255,253,246,0.9)'; g.fillRect(x + 14, y + 18, w - 28, 7);
    },
    poster(x, y, w, h) {
      g.fillStyle = '#d8ceb4'; g.fillRect(x, y, w, h);
      const cs = ['#a8423a', '#d9b45a', '#3d5a6e', '#e8dfc8', '#5b6e3f', '#28241f'];
      for (let i = 0; i < 9; i++) {
        const pw = 30 + R() * 40, ph = 36 + R() * 40; const px = x + R() * (w - pw), py = y + R() * (h - ph);
        g.fillStyle = cs[i % cs.length]; g.fillRect(px, py, pw, ph);
        g.fillStyle = cs[(i + 3) % cs.length]; g.fillRect(px + 4, py + 6, pw - 8, 6); g.fillRect(px + 4, py + 16, pw * 0.6, 4);
      }
    },
    tile(x, y, w, h) { g.fillStyle = '#a65a43'; g.fillRect(x, y, w, h); speckle(g, R, x, y, w, h, 400, 0.2, 0.1); },
    grass(x, y, w, h) { g.fillStyle = '#7d8c4e'; g.fillRect(x, y, w, h); speckle(g, R, x, y, w, h, 900, 0.25, 0.15); },
    earth(x, y, w, h) { g.fillStyle = '#9b8b70'; g.fillRect(x, y, w, h); speckle(g, R, x, y, w, h, 900, 0.25, 0.15); },
    wagon(x, y, w, h) {
      g.fillStyle = '#2a2521'; g.fillRect(x, y, w, h);
      for (let xx = x; xx < x + w; xx += 9) { g.fillStyle = `rgba(${55 + R() * 20},${48 + R() * 15},${42 + R() * 12},1)`; g.fillRect(xx, y, 8, h); }
      g.fillStyle = '#1b1815'; g.fillRect(x, y, w, 5); g.fillRect(x, y + h - 9, w, 9); g.fillRect(x, y, 6, h); g.fillRect(x + w - 6, y, 6, h);
      for (const fx of [0.25, 0.75]) { g.fillRect(x + w * fx - 2, y, 4, h); }
      g.strokeStyle = '#141210'; g.lineWidth = 3; g.strokeRect(x + w / 2 - 38, y + 8, 76, h - 17);
      g.beginPath(); g.moveTo(x + 6, y + h - 9); g.lineTo(x + w * 0.25, y + 6); g.moveTo(x + w - 6, y + h - 9); g.lineTo(x + w * 0.75, y + 6); g.stroke();
      fitText(g, 'PLZEŇSKÝ SVĚTOVAR', x + w / 2, y + 28, w - 40, 'bold 34px Arial, Helvetica, sans-serif', '#f2efe6');
      g.fillStyle = '#f2efe6'; g.beginPath(); g.arc(x + w / 2, y + 74, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a2521'; g.beginPath(); g.arc(x + w / 2, y + 74, 9, 0, Math.PI * 2); g.fill();
      fitText(g, 'Č.P.P.  V PLZNI', x + w * 0.82, y + 70, 70, 'bold 11px Arial, sans-serif', '#e6e2d8');
      fitText(g, '15 000 kg', x + w * 0.18, y + 70, 60, 'bold 11px Arial, sans-serif', '#e6e2d8');
    },
    wagonEnd(x, y, w, h) {
      g.fillStyle = '#2a2521'; g.fillRect(x, y, w, h);
      for (let xx = x; xx < x + w; xx += 9) { g.fillStyle = `rgba(${55 + R() * 20},${48 + R() * 15},${42 + R() * 12},1)`; g.fillRect(xx, y, 8, h); }
      g.fillStyle = '#1b1815'; g.fillRect(x, y, w, 6); g.fillRect(x, y + h - 9, w, 9);
    },
    svetovar(x, y, w, h) {
      g.fillStyle = '#1f3b2d'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#d9bd72'; g.lineWidth = 5; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
      g.lineWidth = 1.5; g.strokeRect(x + 15, y + 15, w - 30, h - 30);
      fitText(g, 'SVĚTOVAR', x + w / 2, y + h / 2 - 8, w - 50, 'bold 54px Georgia, "Times New Roman", serif', '#f0d688');
      fitText(g, '· STÁČENÍ PIVA ·', x + w / 2, y + h - 30, w - 90, 'bold 15px Georgia, serif', '#e9dfc0');
    },
    cpp(x, y, w, h) {
      g.fillStyle = '#26231f'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#c9b27a'; g.lineWidth = 4; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
      fitText(g, 'ČESKÝ PLZEŇSKÝ PIVOVAR', x + w / 2, y + h / 2 - 4, w - 40, 'bold 48px Georgia, "Times New Roman", serif', '#f1e3b6');
      fitText(g, 'AKCIOVÁ SPOLEČNOST · SVĚTOVAR', x + w / 2, y + h - 22, w - 140, 'bold 14px Georgia, serif', '#cdb985');
    },
    // --- Světovar hero tiles (row 7)
    rusticArch(x, y, w, h) {
      // rusticated ground floor: deep horizontal joints + round-arched window with a keystone
      plaster(g, R, x, y, w, h, '#e4dccb', 0.14);
      g.fillStyle = 'rgba(55,45,35,0.34)'; for (let yy = y + 12; yy < y + h; yy += 15) g.fillRect(x, yy, w, 3);
      g.fillStyle = 'rgba(255,252,242,0.35)'; for (let yy = y + 15; yy < y + h; yy += 15) g.fillRect(x, yy, w, 2);
      windowPaint(g, x + w / 2, y + 30, 46, 80, { arch: 'round', head: 'key', rows: 3, cols: 2, fw: 7 });
      g.fillStyle = 'rgba(255,253,246,0.95)'; g.fillRect(x + w / 2 - 7, y + 14, 14, 16);
    },
    winTriple(x, y, w, h) {
      // Art Nouveau triple window with a segmental head and an ornamental panel below
      plaster(g, R, x, y, w, h, '#ede5d3');
      g.fillStyle = 'rgba(255,253,246,0.95)'; winPath(g, x + 10, y + 16, w - 20, 92, 'seg'); g.fill();
      for (const [ox, ww] of [[-36, 24], [0, 34], [36, 24]]) windowPaint(g, x + w / 2 + ox, y + 26, ww, 72, { head: null, rows: 3, cols: 1, fw: 2, sill: false, frame: 'rgba(250,246,236,1)' });
      g.fillStyle = 'rgba(255,253,246,0.95)'; g.fillRect(x + 8, y + 104, w - 16, 7);
      g.fillStyle = 'rgba(150,120,80,0.4)'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x + 22 + i * 17, y + 118, 4, 0, Math.PI * 2); g.fill(); }
    },
    dormerWin(x, y, w, h) {
      // dormer front: a big dark window that still reads from far away
      plaster(g, R, x, y, w, h, '#ece6d8', 0);
      windowPaint(g, x + w / 2, y + 22, 76, 88, { arch: 'seg', head: null, rows: 2, cols: 2, fw: 8, sill: true });
    },
    louver(x, y, w, h) {
      // round-arched opening with timber louvres (vent turrets, lanterns)
      plaster(g, R, x, y, w, h, '#ece6d8', 0);
      g.fillStyle = 'rgba(255,253,246,0.95)'; winPath(g, x + 22, y + 10, w - 44, h - 16, 'round'); g.fill();
      g.fillStyle = '#2a2420'; winPath(g, x + 30, y + 18, w - 60, h - 28, 'round'); g.fill();
      g.fillStyle = '#6a5a48'; for (let yy = y + 50; yy < y + h - 14; yy += 10) g.fillRect(x + 30, yy, w - 60, 5);
    },
    plinthWin(x, y, w, h) {
      // stone plinth with a small barred cellar window
      ashlar(g, R, x, y, w, h, '#a8a296', 20, 'rgba(50,45,40,0.6)');
      g.fillStyle = '#c9c2b4'; g.fillRect(x + w / 2 - 30, y + 30, 60, 50);
      g.fillStyle = '#1e2226'; g.fillRect(x + w / 2 - 24, y + 36, 48, 38);
      g.fillStyle = 'rgba(120,110,100,0.9)'; for (let xx = x + w / 2 - 18; xx < x + w / 2 + 24; xx += 10) g.fillRect(xx, y + 36, 3, 38);
    },
    clockFace(x, y, w, h) {
      // large dial filling the tile: stone surround, gilt ring, white face, bold hour marks
      const cx = x + w / 2, cy = y + h / 2;
      plaster(g, R, x, y, w, h, '#ece6d8', 0);
      g.fillStyle = '#d6ccb8'; g.beginPath(); g.arc(cx, cy, 63, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#b8964a'; g.beginPath(); g.arc(cx, cy, 57, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#26231f'; g.beginPath(); g.arc(cx, cy, 53, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f6f1e4'; g.beginPath(); g.arc(cx, cy, 49, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1f1c19';
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.save(); g.translate(cx + Math.sin(a) * 41, cy - Math.cos(a) * 41); g.rotate(a); g.fillRect(-2.5, -7, i % 3 ? 4 : 7, 14); g.restore(); }
      g.strokeStyle = '#1d1a17'; g.lineCap = 'round';
      g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - 22, cy - 13); g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 22, cy - 30); g.stroke();
      g.lineCap = 'butt';
      g.fillStyle = '#b8964a'; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
    },
    corniceHeavy(x, y, w, h) {
      // main cornice seen from the street: lit crown moulding, dentils, deep shadow below
      plaster(g, R, x, y, w, h, '#f1ebdf', 0);
      g.fillStyle = 'rgba(255,255,250,0.85)'; g.fillRect(x, y, w, 30);
      g.fillStyle = 'rgba(60,50,40,0.22)'; g.fillRect(x, y + 30, w, 8);
      g.fillStyle = 'rgba(255,255,250,0.6)'; g.fillRect(x, y + 38, w, 26);
      g.fillStyle = 'rgba(55,45,35,0.42)'; for (let xx = x + 2; xx < x + w; xx += 14) g.fillRect(xx, y + 44, 7, 16);
      g.fillStyle = 'rgba(55,45,35,0.5)'; g.fillRect(x, y + 64, w, 14);
      g.fillStyle = 'rgba(55,45,35,0.25)'; g.fillRect(x, y + 78, w, 20);
      g.fillStyle = 'rgba(255,255,250,0.5)'; g.fillRect(x, y + 100, w, 8);
    },
  };
  for (const [name, [cx, cy, cw = 1, ch = 1]] of Object.entries(LAYOUT)) {
    const x = cx * TP, y = cy * TP, w = cw * TP, h = ch * TP;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    (P[name] || P.plain)(x, y, w, h);
    g.restore();
  }
  return cv;
}

function sgraffito(g, R, x, y, w, h) {
  // Renaissance "psaníčka" (envelope) sgraffito: light rectangles with diagonals on dark grey.
  g.fillStyle = '#4b4945'; g.fillRect(x, y, w, h);
  const bw = 32, bh = 16;
  for (let yy = y, r = 0; yy < y + h; yy += bh, r++) {
    for (let xx = x - (r % 2 ? bw / 2 : 0); xx < x + w; xx += bw) {
      g.fillStyle = '#ebe7dd'; g.fillRect(xx + 2, yy + 2, bw - 4, bh - 4);
      g.strokeStyle = 'rgba(75,73,69,0.85)'; g.lineWidth = 1.2; g.beginPath();
      g.moveTo(xx + 2, yy + 2); g.lineTo(xx + bw - 2, yy + bh - 2); g.moveTo(xx + bw - 2, yy + 2); g.lineTo(xx + 2, yy + bh - 2); g.stroke();
    }
  }
  speckle(g, R, x, y, w, h, 300, 0.1, 0.05);
}

function paintRoof() {
  const S = 512, cv = mkCanvas(S, S), g = cv.getContext('2d'), R = rng(77);
  g.fillStyle = '#9a948c'; g.fillRect(0, 0, S, S);
  const rowH = 16, tw = 16;
  for (let r = 0; r < S / rowH; r++) {
    const y = r * rowH;
    for (let i = -1; i < S / tw + 1; i++) {
      const x = i * tw + (r % 2 ? tw / 2 : 0);
      const v = 200 + Math.floor((R() - 0.5) * 40);
      g.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
      g.beginPath(); g.moveTo(x + 1, y); g.lineTo(x + tw - 1, y); g.lineTo(x + tw - 1, y + rowH - 4);
      g.quadraticCurveTo(x + tw / 2, y + rowH + 3, x + 1, y + rowH - 4); g.closePath(); g.fill();
      g.fillStyle = 'rgba(40,35,30,0.35)'; g.fillRect(x + tw - 2, y, 1.5, rowH - 3);
    }
    g.fillStyle = 'rgba(40,35,30,0.25)'; g.fillRect(0, y, S, 2);
  }
  // weathering streaks + moss blotches
  for (let i = 0; i < 40; i++) {
    const x = R() * S, w = 4 + R() * 18;
    g.fillStyle = `rgba(60,55,45,${0.04 + R() * 0.08})`; g.fillRect(x, 0, w, S);
  }
  for (let i = 0; i < 30; i++) {
    const cx = R() * S, cy = R() * S, r = 6 + R() * 24;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(${R() < 0.5 ? '90,95,60' : '60,50,40'},${0.12 + R() * 0.12})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  return cv;
}

// Roof for the Světovar showcase: authored for a ~7 m world repeat (Builder.worldScale = 7), so the
// courses, weathering streaks, patched areas and lichen still read from the 100–200 m menu camera.
// Neutral grey so vertex colours set the hue (slate / dark tile / red tile).
function paintRoofHero() {
  const S = 512, cv = mkCanvas(S, S), g = cv.getContext('2d'), R = rng(1912);
  g.fillStyle = '#b4aea6'; g.fillRect(0, 0, S, S);
  // patched areas (re-laid tiles): large soft rectangles, wrapped
  const wrapRect = (x, y, w, h) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) g.fillRect(x + dx, y + dy, w, h); };
  for (let i = 0; i < 14; i++) {
    g.fillStyle = R() < 0.5 ? `rgba(70,62,54,${0.06 + R() * 0.08})` : `rgba(240,234,224,${0.05 + R() * 0.07})`;
    wrapRect(R() * S, R() * S, 40 + R() * 120, 30 + R() * 90);
  }
  // courses (rows of ~0.33 m) with individual tile shading
  const rowH = 24, tw = 22;
  for (let r = 0; r < S / rowH; r++) {
    const y = r * rowH;
    for (let i = -1; i < S / tw + 1; i++) {
      const x = i * tw + (r % 2 ? tw / 2 : 0);
      const v = Math.floor((R() - 0.5) * 34);
      g.fillStyle = v > 0 ? `rgba(255,250,240,${v / 160})` : `rgba(40,34,28,${-v / 140})`;
      g.fillRect(x + 1, y + 2, tw - 2, rowH - 5);
      g.fillStyle = 'rgba(35,30,25,0.28)'; g.fillRect(x + tw - 2, y + 2, 2, rowH - 6);
    }
    g.fillStyle = 'rgba(30,26,22,0.42)'; g.fillRect(0, y + rowH - 4, S, 4);   // shadow under each course
    g.fillStyle = 'rgba(255,250,240,0.16)'; g.fillRect(0, y, S, 2);            // lit edge of the course
  }
  // vertical rain streaks (dark) and sun-bleached runs (light), wrapped horizontally
  for (let i = 0; i < 34; i++) {
    const x = R() * S, w = 6 + R() * 34, a = 0.05 + R() * 0.1;
    const c = R() < 0.65 ? '45,40,34' : '245,240,230';
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, `rgba(${c},${a * 0.3})`); gr.addColorStop(0.3 + R() * 0.3, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},${a * 0.3})`);
    g.fillStyle = gr; g.fillRect(x, 0, w, S); if (x + w > S) g.fillRect(x - S, 0, w, S);
  }
  // lichen / moss blotches
  for (let i = 0; i < 40; i++) {
    const cx = R() * S, cy = R() * S, r = 8 + R() * 30;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, R() < 0.6 ? `rgba(120,118,70,${0.12 + R() * 0.14})` : `rgba(50,44,36,${0.12 + R() * 0.12})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) g.fillRect(cx - r + dx, cy - r + dy, r * 2, r * 2);
  }
  speckle(g, R, 0, 0, S, S, 2500, 0.18, 0.1);
  return cv;
}

function paintCobbles() {
  const S = 512, cv = mkCanvas(S, S), g = cv.getContext('2d'), R = rng(5);
  g.fillStyle = '#6d675d'; g.fillRect(0, 0, S, S);
  const rowH = 16;
  for (let r = 0; r < S / rowH; r++) {
    let x = (r % 2) * 9 - 18;
    while (x < S) {
      const w = 14 + R() * 9;
      const v = 150 + Math.floor((R() - 0.5) * 50);
      const tint = R() < 0.3 ? 10 : 0;
      g.fillStyle = `rgb(${v + tint},${v - 3},${v - 10 - tint})`;
      const y = r * rowH;
      g.beginPath();
      if (g.roundRect) g.roundRect(x + 1.5, y + 1.5, w - 3, rowH - 3, 4); else g.rect(x + 1.5, y + 1.5, w - 3, rowH - 3);
      g.fill();
      g.fillStyle = 'rgba(255,250,235,0.12)'; g.fillRect(x + 3, y + 3, w - 7, 3);
      // wrap the row seamlessly
      if (x + w > S) { g.fillStyle = `rgb(${v + tint},${v - 3},${v - 10 - tint})`; g.fillRect(x - S + 1.5, y + 1.5, w - 3, rowH - 3); }
      x += w;
    }
  }
  for (let i = 0; i < 25; i++) {
    const cx = R() * S, cy = R() * S, r = 20 + R() * 60;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, `rgba(${R() < 0.5 ? '120,100,70' : '40,35,30'},${0.08 + R() * 0.1})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  return cv;
}

function paintLattice() {
  const W = 256, H = 128, cv = mkCanvas(W, H), g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  const c = '#c4bcac', d = '#8f887b';
  g.lineCap = 'square';
  // diagonal diamond lattice, as in the Světovar fence photos
  g.save(); g.beginPath(); g.rect(0, 10, W, H - 20); g.clip();
  for (let k = -H; k < W + H; k += 32) {
    g.strokeStyle = d; g.lineWidth = 9;
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H, H); g.stroke();
    g.beginPath(); g.moveTo(k + H, 0); g.lineTo(k, H); g.stroke();
    g.strokeStyle = c; g.lineWidth = 6;
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + H, H); g.stroke();
    g.beginPath(); g.moveTo(k + H, 0); g.lineTo(k, H); g.stroke();
  }
  g.restore();
  g.fillStyle = d; g.fillRect(0, 0, W, 13); g.fillRect(0, H - 13, W, 13); g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
  g.fillStyle = c; g.fillRect(0, 1, W, 9); g.fillRect(0, H - 11, W, 9); g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
  return cv;
}

function paintSmoke() {
  const S = 64, cv = mkCanvas(S, S), g = cv.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return cv;
}

// ---------------------------------------------------------------------------------------------
// Builder: accumulates non-indexed triangles (position/normal/uv/color) for one material.
// Geometry helpers take [x,y,z] arrays. An optional local transform (translation + yaw) lets
// facades be authored in a local frame: local +Z = outward facade normal, local +X along facade.
// ---------------------------------------------------------------------------------------------
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _mat = new THREE.Matrix4(), _nmat = new THREE.Matrix3();
const WHITE = new THREE.Color(1, 1, 1);

export class Builder {
  constructor(kit) {
    this.kit = kit; this.tiles = kit.tiles;
    this.P = []; this.N = []; this.U = []; this.C = [];
    this.m = new THREE.Matrix4(); this.nm = new THREE.Matrix3(); this.ident = true;
  }
  at(x, z, rotY = 0, y = 0) { this.m.makeRotationY(rotY).setPosition(x, y, z); this.nm.getNormalMatrix(this.m); this.ident = false; return this; }
  reset() { this.m.identity(); this.nm.identity(); this.ident = true; return this; }
  get triangles() { return this.P.length / 9; }

  _v(p, n, u, v, c) {
    _p.set(p[0], p[1], p[2]); _q.set(n[0], n[1], n[2]);
    if (!this.ident) { _p.applyMatrix4(this.m); _q.applyMatrix3(this.nm).normalize(); }
    this.P.push(_p.x, _p.y, _p.z); this.N.push(_q.x, _q.y, _q.z); this.U.push(u, v); this.C.push(c.r, c.g, c.b);
  }
  static normal(a, b, c) {
    _e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _e1.cross(_e2); const l = _e1.length() || 1; return [_e1.x / l, _e1.y / l, _e1.z / l];
  }
  tileRect(t) { return typeof t === 'string' ? this.tiles[t] || this.tiles.plain : t || this.tiles.white; }

  tri(a, b, c, color, ua = [0, 0], ub = [1, 0], uc = [0.5, 1], ns = null) {
    const cc = col(color ?? 0xffffff);
    const n = ns ? null : Builder.normal(a, b, c);
    this._v(a, ns ? ns[0] : n, ua[0], ua[1], cc); this._v(b, ns ? ns[1] : n, ub[0], ub[1], cc); this._v(c, ns ? ns[2] : n, uc[0], uc[1], cc);
  }
  /** a=bottom-left b=bottom-right c=top-right d=top-left (counter-clockwise seen from the front). */
  quad(a, b, c, d, color, tile, ns = null) {
    const r = this.tileRect(tile);
    const cc = col(color ?? 0xffffff);
    let n = ns;
    if (!n) {
      // Newell normal (robust for degenerate quads)
      let nx = 0, ny = 0, nz = 0; const pts = [a, b, c, d];
      for (let i = 0; i < 4; i++) { const p = pts[i], q = pts[(i + 1) % 4]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
      const l = Math.hypot(nx, ny, nz) || 1; const f = [nx / l, ny / l, nz / l]; n = [f, f, f, f];
    }
    this._v(a, n[0], r[0], r[1], cc); this._v(b, n[1], r[2], r[1], cc); this._v(c, n[2], r[2], r[3], cc);
    this._v(a, n[0], r[0], r[1], cc); this._v(c, n[2], r[2], r[3], cc); this._v(d, n[3], r[0], r[3], cc);
  }
  /** Convex polygon (counter-clockwise from the front), uv: 'tile' (bbox mapped into tile) or 'world' (roof texture, metres/scale). */
  poly(pts, color, tile = null, mode = 'tile', scale = this.worldScale ?? 4) {
    const cc = col(color ?? 0xffffff);
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]); }
    const l = Math.hypot(nx, ny, nz) || 1; const n = [nx / l, ny / l, nz / l];
    // in-plane basis: e = horizontal (or x if face is flat), s = n x e
    let ex = n[2], ez = -n[0]; let el = Math.hypot(ex, ez);
    if (el < 1e-3) { ex = 1; ez = 0; el = 1; }
    ex /= el; ez /= el;
    const s = [n[1] * ez - 0, n[2] * ex - n[0] * ez, 0 - n[1] * ex];
    const uvs = pts.map((p) => [p[0] * ex + p[2] * ez, p[0] * s[0] + p[1] * s[1] + p[2] * s[2]]);
    let uv;
    if (mode === 'world') uv = uvs.map(([u, v]) => [u / scale, v / scale]);
    else {
      const r = this.tileRect(tile);
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const [u, v] of uvs) { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      uv = uvs.map(([u, v]) => [r[0] + ((u - u0) / (u1 - u0 || 1)) * (r[2] - r[0]), r[1] + ((v - v0) / (v1 - v0 || 1)) * (r[3] - r[1])]);
    }
    for (let i = 1; i < pts.length - 1; i++) {
      this._v(pts[0], n, uv[0][0], uv[0][1], cc); this._v(pts[i], n, uv[i][0], uv[i][1], cc); this._v(pts[i + 1], n, uv[i + 1][0], uv[i + 1][1], cc);
    }
  }
  /** Vertical wall from (x0,z0) to (x1,z1); outward normal is to the RIGHT of the direction of travel. ys = row boundaries. */
  wall(x0, z0, x1, z1, ys, cols, tileFn, color) {
    const tf = typeof tileFn === 'function' ? tileFn : () => tileFn;
    const rows = ys.length - 1;
    for (let i = 0; i < cols; i++) {
      const ta = i / cols, tb = (i + 1) / cols;
      const ax = x0 + (x1 - x0) * ta, az = z0 + (z1 - z0) * ta, bx = x0 + (x1 - x0) * tb, bz = z0 + (z1 - z0) * tb;
      for (let j = 0; j < rows; j++) {
        const t = tf(i, j, cols, rows);
        if (t === null) continue;
        this.quad([ax, ys[j], az], [bx, ys[j], bz], [bx, ys[j + 1], bz], [ax, ys[j + 1], az], color, t);
      }
    }
  }
  /** Simple box, every face mapped to one tile. */
  box(x0, x1, y0, y1, z0, z1, tile, color, { top = true, bottom = false, sides = 'nsew' } = {}) {
    if (sides.includes('s')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, tile);
    if (sides.includes('n')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, tile);
    if (sides.includes('e')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, tile);
    if (sides.includes('w')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, tile);
    if (top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], color, tile);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, tile);
  }
  /** Building block with tiled facades. faces: {s,n,e,w}: tile name / fn(i,j,cols,rows) / null (skip). */
  block(x0, x1, z0, z1, ys, faces, color, bay = 3.6, top = null) {
    const cx = Math.max(1, Math.round((x1 - x0) / bay)), cz = Math.max(1, Math.round((z1 - z0) / bay));
    const f = (k) => (faces[k] !== undefined ? faces[k] : faces.all);
    if (f('s') != null) this.wall(x0, z1, x1, z1, ys, cx, f('s'), color);
    if (f('n') != null) this.wall(x1, z0, x0, z0, ys, cx, f('n'), color);
    if (f('e') != null) this.wall(x1, z1, x1, z0, ys, cz, f('e'), color);
    if (f('w') != null) this.wall(x0, z0, x0, z1, ys, cz, f('w'), color);
    if (top) { const y = ys[ys.length - 1]; this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color, top); }
  }
  /** Cylinder / frustum around Y. tile repeated per side & row. */
  cyl(cx, cz, y0, y1, r0, r1, sides, rows, tile, color, { cap = true, rot = 0, smooth = true, tilesFn = null } = {}) {
    const slope = (r0 - r1) / (y1 - y0);
    for (let k = 0; k < sides; k++) {
      const a0 = rot + (k / sides) * Math.PI * 2, a1 = rot + ((k + 1) / sides) * Math.PI * 2;
      const n0 = norm3([Math.sin(a0), slope, Math.cos(a0)]), n1 = norm3([Math.sin(a1), slope, Math.cos(a1)]);
      const am = (a0 + a1) / 2, nf = norm3([Math.sin(am), slope, Math.cos(am)]);
      for (let j = 0; j < rows; j++) {
        const ya = y0 + ((y1 - y0) * j) / rows, yb = y0 + ((y1 - y0) * (j + 1)) / rows;
        const ra = r0 + ((r1 - r0) * j) / rows, rb = r0 + ((r1 - r0) * (j + 1)) / rows;
        const t = tilesFn ? tilesFn(k, j) : tile;
        this.quad(
          [cx + Math.sin(a0) * ra, ya, cz + Math.cos(a0) * ra], [cx + Math.sin(a1) * ra, ya, cz + Math.cos(a1) * ra],
          [cx + Math.sin(a1) * rb, yb, cz + Math.cos(a1) * rb], [cx + Math.sin(a0) * rb, yb, cz + Math.cos(a0) * rb],
          color, t, smooth ? [n0, n1, n1, n0] : [nf, nf, nf, nf]);
      }
    }
    if (cap && r1 > 0) {
      const pts = [];
      for (let k = sides - 1; k >= 0; k--) { const a = rot + (k / sides) * Math.PI * 2; pts.push([cx + Math.sin(a) * r1, y1, cz + Math.cos(a) * r1]); }
      // reverse order gives CCW seen from above
      this.poly(pts.reverse(), color, tile);
    }
  }
  /** Pyramid / cone (spires). mode 'world' for the roof texture. */
  cone(cx, cz, y0, h, r, sides, color, tile = null, rot = 0, mode = 'tile', scale = 4) {
    const apex = [cx, y0 + h, cz];
    for (let k = 0; k < sides; k++) {
      const a0 = rot + (k / sides) * Math.PI * 2, a1 = rot + ((k + 1) / sides) * Math.PI * 2;
      this.poly([[cx + Math.sin(a0) * r, y0, cz + Math.cos(a0) * r], [cx + Math.sin(a1) * r, y0, cz + Math.cos(a1) * r], apex], color, tile, mode, scale);
    }
  }
  /** Box-section beam from point p to point q (ridge caps, hip caps, fascia boards, rods).
   *  w = width (horizontal, across), h = height (perpendicular, "up"); roll rotates the section (π/4 = ridge roll). */
  beam(p, q, w, h, color, tile = null, { roll = 0, ends = true } = {}) {
    const d = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const L = Math.hypot(d[0], d[1], d[2]) || 1; d[0] /= L; d[1] /= L; d[2] /= L;
    let sx = d[2], sz = -d[0]; const sl = Math.hypot(sx, sz); // side = horizontal, perpendicular to the beam
    if (sl < 1e-4) { sx = 1; sz = 0; } else { sx /= sl; sz /= sl; }
    let s = [sx, 0, sz];
    let u = [s[1] * d[2] - s[2] * d[1], s[2] * d[0] - s[0] * d[2], s[0] * d[1] - s[1] * d[0]];
    if (u[1] < 0) u = u.map((v) => -v);
    if (roll) { const c = Math.cos(roll), n = Math.sin(roll); const s2 = s.map((v, i) => v * c + u[i] * n); u = u.map((v, i) => v * c - s[i] * n); s = s2; }
    const hw = w / 2, hh = h / 2;
    const P = (a, sg, ug) => [a[0] + s[0] * sg * hw + u[0] * ug * hh, a[1] + s[1] * sg * hw + u[1] * ug * hh, a[2] + s[2] * sg * hw + u[2] * ug * hh];
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    // winding is fixed below by checking the Newell normal against the outward direction
    const face = (a, b, c, d2, out) => {
      const n = Builder.normal(a, b, c);
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) this.quad(b, a, d2, c, color, tile);
      else this.quad(a, b, c, d2, color, tile);
    };
    for (let k = 0; k < 4; k++) {
      const [s0, u0] = cs[k], [s1, u1] = cs[(k + 1) % 4];
      const out = [s[0] * (s0 + s1) + u[0] * (u0 + u1), s[1] * (s0 + s1) + u[1] * (u0 + u1), s[2] * (s0 + s1) + u[2] * (u0 + u1)];
      face(P(p, s0, u0), P(p, s1, u1), P(q, s1, u1), P(q, s0, u0), out);
    }
    if (ends) {
      face(P(p, -1, -1), P(p, 1, -1), P(p, 1, 1), P(p, -1, 1), d.map((v) => -v));
      face(P(q, -1, -1), P(q, 1, -1), P(q, 1, 1), P(q, -1, 1), d);
    }
  }
  /** Add any THREE geometry (indexed or not), transformed by `matrix`, tinted, uv remapped into `tile`. */
  add(geo, matrix, color, tile = null) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    const r = this.tileRect(tile);
    const cc = col(color ?? 0xffffff);
    _mat.copy(matrix || new THREE.Matrix4()); _nmat.getNormalMatrix(_mat);
    const p = [0, 0, 0], n = [0, 1, 0];
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i).applyMatrix4(_mat);
      p[0] = _p.x; p[1] = _p.y; p[2] = _p.z;
      if (nor) { _q.fromBufferAttribute(nor, i).applyMatrix3(_nmat).normalize(); n[0] = _q.x; n[1] = _q.y; n[2] = _q.z; }
      const u = uv ? uv.getX(i) : 0.5, v = uv ? uv.getY(i) : 0.5;
      this._v(p, n, r[0] + u * (r[2] - r[0]), r[1] + v * (r[3] - r[1]), cc);
    }
    if (g !== geo) g.dispose();
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  mesh(material, { cast = true, receive = true, name = '' } = {}) {
    if (!this.P.length) return null;
    const m = new THREE.Mesh(this.geometry(), material);
    m.castShadow = cast; m.receiveShadow = receive; m.name = name;
    return m;
  }
}

function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

export const M4 = (x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));

// ---------------------------------------------------------------------------------------------
// Roofs (roof builder rb uses 'world' uvs on the repeating tile texture; wb = wall builder for gable ends)
// ---------------------------------------------------------------------------------------------
export function gableRoof(rb, wb, x0, x1, z0, z1, yE, h, axis, o, roofCol, wallCol, gableTile = 'plain', { ends = true } = {}) {
  const yR = yE + h;
  if (axis === 'x') {
    const zm = (z0 + z1) / 2, X0 = x0 - o, X1 = x1 + o;
    const dz = (z1 - z0) / 2 + o, ye = yE - (o * h) / ((z1 - z0) / 2);
    rb.poly([[X0, ye, zm + dz], [X1, ye, zm + dz], [X1, yR, zm], [X0, yR, zm]], roofCol, null, 'world');
    rb.poly([[X1, ye, zm - dz], [X0, ye, zm - dz], [X0, yR, zm], [X1, yR, zm]], roofCol, null, 'world');
    if (wb && ends) {
      wb.poly([[x1, yE, z1], [x1, yE, z0], [x1, yR, zm]], wallCol, gableTile);
      wb.poly([[x0, yE, z0], [x0, yE, z1], [x0, yR, zm]], wallCol, gableTile);
    }
  } else {
    const xm = (x0 + x1) / 2, Z0 = z0 - o, Z1 = z1 + o;
    const dx = (x1 - x0) / 2 + o, ye = yE - (o * h) / ((x1 - x0) / 2);
    rb.poly([[xm + dx, ye, Z1], [xm + dx, ye, Z0], [xm, yR, Z0], [xm, yR, Z1]], roofCol, null, 'world');
    rb.poly([[xm - dx, ye, Z0], [xm - dx, ye, Z1], [xm, yR, Z1], [xm, yR, Z0]], roofCol, null, 'world');
    if (wb && ends) {
      wb.poly([[x0, yE, z1], [x1, yE, z1], [xm, yR, z1]], wallCol, gableTile);
      wb.poly([[x1, yE, z0], [x0, yE, z0], [xm, yR, z0]], wallCol, gableTile);
    }
  }
}

export function hipRoof(rb, x0, x1, z0, z1, yE, h, o, roofCol) {
  const X0 = x0 - o, X1 = x1 + o, Z0 = z0 - o, Z1 = z1 + o;
  const w = X1 - X0, d = Z1 - Z0, yR = yE + h;
  if (w >= d) {
    const inset = d / 2, zm = (Z0 + Z1) / 2;
    const ra = [X0 + inset, yR, zm], rbb = [X1 - inset, yR, zm];
    rb.poly([[X0, yE, Z1], [X1, yE, Z1], rbb, ra], roofCol, null, 'world');
    rb.poly([[X1, yE, Z0], [X0, yE, Z0], ra, rbb], roofCol, null, 'world');
    rb.poly([[X1, yE, Z1], [X1, yE, Z0], rbb], roofCol, null, 'world');
    rb.poly([[X0, yE, Z0], [X0, yE, Z1], ra], roofCol, null, 'world');
  } else {
    const inset = w / 2, xm = (X0 + X1) / 2;
    const ra = [xm, yR, Z0 + inset], rbb = [xm, yR, Z1 - inset];
    rb.poly([[X1, yE, Z1], [X1, yE, Z0], ra, rbb], roofCol, null, 'world');
    rb.poly([[X0, yE, Z0], [X0, yE, Z1], rbb, ra], roofCol, null, 'world');
    rb.poly([[X0, yE, Z1], [X1, yE, Z1], rbb], roofCol, null, 'world');
    rb.poly([[X1, yE, Z0], [X0, yE, Z0], ra], roofCol, null, 'world');
  }
}

/** Mansard: steep lower band (h1, inset) + hip roof on top (h2). */
export function mansardRoof(rb, x0, x1, z0, z1, yE, h1, inset, h2, o, roofCol) {
  const X0 = x0 - o, X1 = x1 + o, Z0 = z0 - o, Z1 = z1 + o, y1 = yE + h1;
  const a = [X0, yE, Z1], b = [X1, yE, Z1], c = [X1, yE, Z0], d = [X0, yE, Z0];
  const A = [x0 + inset, y1, z1 - inset], B = [x1 - inset, y1, z1 - inset], C = [x1 - inset, y1, z0 + inset], D = [x0 + inset, y1, z0 + inset];
  rb.poly([a, b, B, A], roofCol, null, 'world');
  rb.poly([b, c, C, B], roofCol, null, 'world');
  rb.poly([c, d, D, C], roofCol, null, 'world');
  rb.poly([d, a, A, D], roofCol, null, 'world');
  hipRoof(rb, x0 + inset, x1 - inset, z0 + inset, z1 - inset, y1, h2, 0, roofCol);
}

/** Dormer on a slope facing +Z in the CURRENT builder frame (front wall at z = zf). */
export function dormer(wb, rb, cx, zf, w, yb, hw, depth, wallCol, roofCol, tile = 'winSmall') {
  const x0 = cx - w / 2, x1 = cx + w / 2, yt = yb + hw, z0 = zf - depth;
  wb.quad([x0, yb, zf], [x1, yb, zf], [x1, yt, zf], [x0, yt, zf], wallCol, tile);
  wb.quad([x1, yb, zf], [x1, yb, z0], [x1, yt, z0], [x1, yt, zf], wallCol, 'plain');
  wb.quad([x0, yb, z0], [x0, yb, zf], [x0, yt, zf], [x0, yt, z0], wallCol, 'plain');
  wb.poly([[x0, yt, zf], [x1, yt, zf], [cx, yt + w * 0.45, zf]], wallCol, 'plain');
  const o = 0.25;
  rb.poly([[x1 + o, yt - 0.1, zf + o], [x1 + o, yt - 0.1, z0], [cx, yt + w * 0.45, z0], [cx, yt + w * 0.45, zf + o]], roofCol, null, 'world');
  rb.poly([[x0 - o, yt - 0.1, z0], [x0 - o, yt - 0.1, zf + o], [cx, yt + w * 0.45, zf + o], [cx, yt + w * 0.45, z0]], roofCol, null, 'world');
}

/** Decorative gable outline (in the x/y plane, centred at x=0, base at y=0), returned as THREE.Shape. */
export function gableShape(w, h, style = 'volute') {
  const s = new THREE.Shape();
  const hw = w / 2;
  if (style === 'stepped') {
    const steps = 3; s.moveTo(-hw, 0);
    for (let i = 0; i < steps; i++) {
      const x = -hw + (hw * 0.8 * i) / steps, y = (h * 0.85 * (i + 1)) / steps;
      s.lineTo(x, y); s.lineTo(-hw + (hw * 0.8 * (i + 1)) / steps, y);
    }
    s.lineTo(-hw * 0.2, h * 0.85); s.lineTo(-hw * 0.2, h); s.lineTo(hw * 0.2, h); s.lineTo(hw * 0.2, h * 0.85);
    for (let i = steps - 1; i >= 0; i--) {
      const y = (h * 0.85 * (i + 1)) / steps;
      s.lineTo(hw - (hw * 0.8 * (i + 1)) / steps, y); s.lineTo(hw - (hw * 0.8 * i) / steps, y);
    }
    s.lineTo(hw, 0); s.closePath();
  } else if (style === 'triangle') {
    s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(0, h); s.closePath();
  } else {
    // baroque volute gable: S-curves up to a narrow top with a segmental pediment
    const tw = w * 0.22;
    s.moveTo(-hw, 0);
    s.quadraticCurveTo(-hw, h * 0.32, -hw * 0.62, h * 0.38);
    s.quadraticCurveTo(-tw * 1.05, h * 0.45, -tw, h * 0.78);
    s.lineTo(-tw * 1.2, h * 0.82);
    s.quadraticCurveTo(0, h * 1.08, tw * 1.2, h * 0.82);
    s.lineTo(tw, h * 0.78);
    s.quadraticCurveTo(tw * 1.05, h * 0.45, hw * 0.62, h * 0.38);
    s.quadraticCurveTo(hw, h * 0.32, hw, 0);
    s.closePath();
  }
  return s;
}

/** Add a decorative flat gable facing +Z in the builder's current frame. */
export function addGable(wb, cx, y0, z, w, h, style, color, tile = 'gable') {
  const geo = new THREE.ShapeGeometry(gableShape(w, h, style), 6);
  // remap shape uvs (raw xy) into 0..1 so the tile is mapped onto the bbox
  geo.computeBoundingBox();
  const bb = geo.boundingBox, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (uv.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  wb.add(geo, M4(cx, y0, z), color, tile);
  // thin back face so the gable reads from behind as well
  wb.add(geo, M4(cx, y0, z - 0.25, Math.PI), color, 'plain');
  geo.dispose();
}

// ---------------------------------------------------------------------------------------------
// Small props (into a vertex-coloured props builder)
// ---------------------------------------------------------------------------------------------
const GEO = {};
function geoCache(key, make) { return GEO[key] || (GEO[key] = make()); }

export function addTree(pb, x, z, s = 1, R = Math.random, tint = 0) {
  const trunk = geoCache('trunk', () => new THREE.CylinderGeometry(0.18, 0.28, 1, 6));
  const blob = geoCache('blob', () => new THREE.IcosahedronGeometry(1, 0));
  const h = (3.2 + R()) * s;
  pb.add(trunk, M4(x, h / 2, z, 0, s, h, s), 0x5a4636);
  const greens = [0x5f7a3a, 0x6b8443, 0x566f35, 0x738a48];
  const n = 3 + Math.floor(R() * 2);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, r = (0.8 + R() * 0.8) * s;
    const c = new THREE.Color(greens[Math.floor(R() * greens.length)]).offsetHSL(0, 0, tint + (R() - 0.5) * 0.04);
    const sc = (1.7 + R() * 0.9) * s;
    pb.add(blob, M4(x + Math.cos(a) * r, h + (0.8 + R() * 1.8) * s, z + Math.sin(a) * r, R() * 3, sc, sc * 0.9, sc, R(), R()), c);
  }
  pb.add(blob, M4(x, h + 2.6 * s, z, 0, 2.2 * s, 2.0 * s, 2.2 * s), greens[0]);
}

export function addLamp(pb, x, z, h = 4.6) {
  const post = geoCache('lpost', () => new THREE.CylinderGeometry(0.07, 0.12, 1, 6));
  const base = geoCache('lbase', () => new THREE.CylinderGeometry(0.2, 0.26, 1, 8));
  const lant = geoCache('llant', () => new THREE.CylinderGeometry(0.3, 0.16, 1, 6));
  const capg = geoCache('lcap', () => new THREE.ConeGeometry(0.36, 1, 6));
  const iron = 0x2c302c;
  pb.add(base, M4(x, 0.5, z, 0, 1, 1, 1), iron);
  pb.add(post, M4(x, 0.95 + (h - 1) / 2, z, 0, 1, h - 1, 1), iron);
  pb.add(lant, M4(x, h + 0.25, z, 0, 1, 0.55, 1), 0xf2e2b0);
  pb.add(capg, M4(x, h + 0.68, z, 0, 1, 0.35, 1), iron);
}

export function addBollard(pb, x, z, color = 0x9d968a) {
  const b = geoCache('boll', () => new THREE.CylinderGeometry(0.15, 0.2, 0.85, 7));
  const top = geoCache('bolltop', () => new THREE.SphereGeometry(0.17, 6, 3));
  pb.add(b, M4(x, 0.425, z), color);
  pb.add(top, M4(x, 0.85, z), color);
}

/** Barrel geometry (axis along Y, radius ~0.33, length 0.8) with wood + hoop colours baked in. */
export function barrelGeometry() {
  return geoCache('barrel', () => {
    const prof = [];
    const N = 5;
    for (let i = 0; i <= N; i++) { const t = i / N; prof.push(new THREE.Vector2(0.28 + 0.06 * Math.sin(Math.PI * t), -0.4 + 0.8 * t)); }
    prof.unshift(new THREE.Vector2(0, -0.4)); prof.push(new THREE.Vector2(0, 0.4));
    const g = new THREE.LatheGeometry(prof, 9).toNonIndexed();
    g.computeVertexNormals();
    const pos = g.attributes.position; const c = new Float32Array(pos.count * 3);
    const wood = new THREE.Color(0x8a6239), hoop = new THREE.Color(0x2f2a25), lid = new THREE.Color(0x7a5532);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), r = Math.hypot(pos.getX(i), pos.getZ(i));
      const cc = r < 0.27 ? lid : (Math.abs(Math.abs(y) - 0.3) < 0.045 || Math.abs(y) < 0.04 ? hoop : wood);
      c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    return g;
  });
}

/** Camera-facing smoke plume as ONE instanced mesh. Returns { mesh, update(dt, t) }. */
export function createSmoke(kit, camera, origin, { count = 12, rise = 26, drift = [14, 0, 6], size = [2.5, 13], alpha = 0.55, period = 9, material = null, spread = 1 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  aAlpha.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAlpha', aAlpha);
  const mesh = new THREE.InstancedMesh(geo, material || kit.mats.smoke, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  mesh.userData.dynamic = true;
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const seeds = Array.from({ length: count }, (_, i) => [(i * 0.618) % 1, Math.sin(i * 12.9) * 0.5]);
  function update(dt, t) {
    for (let i = 0; i < count; i++) {
      const age = (t / period + i / count) % 1;
      const wob = seeds[i][1];
      p.set(origin[0] + drift[0] * age * (1 + age) * 0.6 + wob * 1.5 * age * spread,
        origin[1] + rise * Math.sqrt(age) + age * 4 + wob * age * 2 * (spread - 1),
        origin[2] + drift[2] * age * (1 + age) * 0.6 + wob * age * 2 * spread);
      const sc = size[0] + (size[1] - size[0]) * Math.sqrt(age);
      s.set(sc, sc, sc);
      m.compose(p, camera.quaternion, s);
      mesh.setMatrixAt(i, m);
      aAlpha.setX(i, alpha * Math.min(1, age * 14) * Math.pow(1 - age, 1.6)); // dense at the stack, long soft tail
    }
    mesh.instanceMatrix.needsUpdate = true; aAlpha.needsUpdate = true;
  }
  update(0, 0);
  return { mesh, update };
}
