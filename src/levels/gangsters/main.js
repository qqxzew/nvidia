import * as THREE from 'three';
import { CONFIG3 } from './config.js';
import { createEvents } from '../../core/events.js';
import { createGrading } from '../../fx/grading.js';
import { buildHall } from './hall.js';
import { createGangsters } from './gangsters.js';
import { createShotgun } from './shotgun.js';
import { createUI3 } from './ui.js';
import { createAudio3 } from './audio.js';
import { progress } from '../../core/progress.js';
import { t } from '../../ui/i18n.js';

// Level 3 "Gangsteři ve Světovaru" — game loop, state machine, shooting, barrels and score.
// Contract between the modules: docs/LEVEL3.md.
// Debug URL params: ?level=3&autostart=1  &god=1 (barrels can't be stolen)  &nograde=1  &q=low|high

const params = new URLSearchParams(location.search);
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
const quality = params.get('q') || (isMobile ? 'low' : 'high');
const god = !!params.get('god');
const C = CONFIG3;

document.title = `${t('g3subtitle').split('·')[0].trim()} – ${t('g3title')}`;

// --- renderer --------------------------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
let pixelRatio = Math.min(devicePixelRatio, C.render.maxPixelRatio);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d14);
const camera = new THREE.PerspectiveCamera(C.camera.fov, innerWidth / innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';

const events = createEvents();
const ctx = { THREE, scene, camera, renderer, events, config: C, quality, isMobile };
window.__game3 = ctx;

// --- world -----------------------------------------------------------------------------------
const hall = buildHall(ctx);
camera.position.copy(hall.player);
// freeze the static hall (anything flagged userData.dynamic keeps updating)
scene.traverse((o) => { if (!o.userData.dynamic && !o.isLight) { o.updateMatrix(); o.matrixAutoUpdate = false; } });

// created after the freeze: these animate
scene.add(camera);
camera.userData.dynamic = true;
const shotgun = createShotgun(ctx);
camera.add(shotgun.group);
const gangsters = createGangsters(ctx, hall);

// muzzle flash light: always in the scene (intensity 0) so adding it never recompiles shaders
const muzzle = new THREE.PointLight(0xffc98a, 0, 14, 1.6);
muzzle.position.set(0.3, -0.2, -0.9);
camera.add(muzzle);

const ui = createUI3(ctx);
const audio = createAudio3(ctx);
const grading = params.get('nograde') ? null : createGrading(renderer, { samples: quality === 'high' ? 4 : 0 });

// --- game state --------------------------------------------------------------------------------
const G = {
  state: 'menu', time: 0, countdown: 0,
  shells: C.shotgun.shells, reloadT: -1, cooldown: 0,
  onShelf: C.game.barrelCount, carried: 0, stolen: 0,
  score: 0, yaw: 0, pitch: C.camera.pitch, flash: 0, fps: 0, result: null,
};
const actorWindow = new Map(); // actor id -> window id (for score popups)
const windowById = new Map(hall.windows.map((w) => [w.id, w]));

function setState(s) { const prev = G.state; G.state = s; events.emit('state', { state: s, prev }); }

function resetRun() {
  gangsters.reset();
  hall.resetGlass();
  hall.setBarrels(C.game.barrelCount);
  Object.assign(G, {
    time: 0, shells: C.shotgun.shells, reloadT: -1, cooldown: 0,
    onShelf: C.game.barrelCount, carried: 0, stolen: 0, score: 0, yaw: 0, pitch: C.camera.pitch, flash: 0, result: null,
  });
  actorWindow.clear();
}

function startRun() {
  resetRun();
  G.countdown = C.game.countdown;
  setState('countdown');
  events.emit('countdown', { n: Math.ceil(G.countdown) });
}

events.on('ui:start', () => { audio.unlock(); if (G.state === 'menu' || G.state === 'won' || G.state === 'lost') startRun(); });
events.on('ui:restart', () => { audio.unlock(); startRun(); });
events.on('ui:pause', () => { if (G.state === 'playing') setState('paused'); });
events.on('ui:resume', () => { if (G.state === 'paused') setState('playing'); });
events.on('ui:menu', () => { resetRun(); setState('menu'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') setState('paused'); });

// --- shooting ------------------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
// aim point first, then a ring around it: salt spreads, so near misses still count
const RING = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];

function startReload() {
  if (G.reloadT >= 0 || G.shells >= C.shotgun.shells) return;
  G.reloadT = 0;
  shotgun.reload(C.shotgun.reload);
  events.emit('reload:start', { duration: C.shotgun.reload });
}

events.on('g3:reload', () => { if (G.state === 'playing') startReload(); });

events.on('g3:shoot', ({ ndcX = 0, ndcY = 0 } = {}) => {
  if (G.state !== 'playing' || G.reloadT >= 0 || G.cooldown > 0) return;
  if (G.shells <= 0) { events.emit('dry', {}); startReload(); return; }
  G.shells--;
  G.cooldown = C.shotgun.cooldown;
  shotgun.fire();
  muzzle.intensity = 9;

  let hit = null;
  const sx = (C.shotgun.spreadPx * 2) / innerWidth, sy = (C.shotgun.spreadPx * 2) / innerHeight;
  for (const [ox, oy] of RING) {
    ndc.set(ndcX + ox * sx, ndcY + oy * sy);
    raycaster.setFromCamera(ndc, camera);
    hit = gangsters.hitTest(raycaster);
    if (hit) break;
  }
  if (hit) gangsters.hit(hit.id);
  events.emit('shot', { hit: hit ? hit.kind : null, shells: G.shells });
  if (G.shells <= 0) setTimeout(() => { if (G.state === 'playing' && G.shells <= 0) startReload(); }, C.shotgun.cooldown * 1000);
});

// --- actors → barrels & score -------------------------------------------------------------------------
// The gangsters module shows/hides the barrels itself (pickup, drop); main only counts them.
function popupAt(id, p) {
  if (p && Number.isFinite(p.x)) return { x: p.x, y: p.y + 0.4, z: p.z };
  const w = windowById.get(actorWindow.get(id));
  return w ? { x: w.sill.x, y: w.sill.y + 1.1, z: w.sill.z } : { x: 0, y: 2, z: -6 };
}
function addScore(delta, id, p) {
  G.score = Math.max(0, G.score + delta);
  events.emit('score', { score: G.score, delta, ...popupAt(id, p) });
}

events.on('gangster:appear', ({ id, windowId }) => actorWindow.set(id, windowId));

events.on('gangster:grab', () => {
  G.onShelf = Math.max(0, G.onShelf - 1); G.carried++;
});

events.on('gangster:down', (e) => {
  const { id, kind, stage, withBarrel } = e;
  if (kind === 'innocent') {
    addScore(C.score.innocent, id, e);
    G.flash = 0.45;
  } else {
    let pts = C.score.gangster;
    if (stage === 'rise') pts += C.score.early;
    if (withBarrel) {
      pts += C.score.recovered;
      G.carried = Math.max(0, G.carried - 1); G.onShelf++;
      events.emit('barrel:recovered', {});
    }
    addScore(pts, id, e);
  }
  actorWindow.delete(id);
});

events.on('gangster:escape', ({ id, barrel }) => {
  actorWindow.delete(id);
  G.carried = Math.max(0, G.carried - 1);
  if (god) { G.onShelf++; if (Number.isInteger(barrel)) hall.setBarrelVisible?.(barrel, true); return; }
  G.stolen++;
  events.emit('barrel:stolen', { stolen: G.stolen, remaining: C.game.barrelCount - G.stolen });
  if (G.state === 'playing' && G.stolen > C.game.maxStolen) fail('barrels');
});

function fail(reason) {
  G.result = { reason, stolen: G.stolen, score: G.score };
  setState('lost');
  events.emit('fail', { reason, stolen: G.stolen, score: G.score });
}

function finish() {
  const kept = G.onShelf + G.carried;
  G.score += kept * C.score.perBarrelLeft;
  const stars = G.stolen === 0 ? 3 : G.stolen <= 1 ? 2 : 1;
  G.result = { time: G.time, stolen: G.stolen, stars, score: G.score };
  progress.complete(3, { stars, time: G.time });
  setState('won');
  events.emit('finish', { time: G.time, stolen: G.stolen, stars, score: G.score });
}

// --- resize & adaptive resolution ---------------------------------------------------------------------
function resize() {
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (grading) { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); grading.setSize(s.x, s.y); }
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

let perfAcc = 0, perfFrames = 0;
function adaptResolution(dt) {
  perfAcc += dt; perfFrames++;
  if (perfAcc < 2) return;
  const avg = perfAcc / perfFrames;
  perfAcc = 0; perfFrames = 0;
  let next = pixelRatio;
  if (avg > 1 / 42) next = Math.max(C.render.minPixelRatio, pixelRatio - 0.15);
  else if (avg < 1 / 58) next = Math.min(Math.min(devicePixelRatio, C.render.maxPixelRatio), pixelRatio + 0.1);
  if (Math.abs(next - pixelRatio) > 0.01) { pixelRatio = next; resize(); }
  G.fps = Math.round(1 / avg);
}

// --- main loop -----------------------------------------------------------------------------------------
let lastNow = performance.now(), elapsed = 0;
resetRun();
setState('menu');
if (params.get('autostart')) startRun();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 1 / 20);
  lastNow = now;
  frame(dt);
});

function frame(dt) {
  ui.update?.(dt);

  if (G.state === 'countdown') {
    const before = Math.ceil(G.countdown);
    G.countdown -= dt;
    const n = Math.ceil(G.countdown);
    if (n !== before) events.emit('countdown', { n: Math.max(0, n) });
    if (G.countdown <= 0) setState('playing');
  }

  if (G.state !== 'paused') {
    elapsed += dt;
    const playing = G.state === 'playing';
    if (playing) G.time += dt;

    // camera: FPS mouse/touch look + keyboard pan; idle sway in the menu. Shots always go through the center.
    const inp = ui.input;
    if (G.state === 'menu') { G.yaw = Math.sin(elapsed * 0.25) * 0.45; G.pitch = C.camera.pitch + Math.sin(elapsed * 0.17) * 0.05; }
    else if (G.state === 'playing' || G.state === 'countdown') {
      G.yaw -= (inp.pan || 0) * C.camera.panSpeed * dt + (inp.look || 0);
      G.pitch += (inp.panY || 0) * C.camera.panSpeed * 0.7 * dt + (inp.lookY || 0);
      G.yaw = THREE.MathUtils.clamp(G.yaw, -C.camera.yawLimit, C.camera.yawLimit);
      G.pitch = THREE.MathUtils.clamp(G.pitch, C.camera.pitchMin, C.camera.pitchMax);
    }
    inp.look = 0; inp.lookY = 0;
    camera.rotation.set(G.pitch, G.yaw, 0);

    // shotgun timers
    G.cooldown = Math.max(0, G.cooldown - dt);
    if (G.reloadT >= 0) {
      G.reloadT += dt;
      if (G.reloadT >= C.shotgun.reload) {
        G.reloadT = -1; G.shells = C.shotgun.shells;
        events.emit('reload:done', { shells: G.shells });
      }
    }
    muzzle.intensity = Math.max(0, muzzle.intensity - dt * 120);
    G.flash = Math.max(0, G.flash - dt * 1.2);
    if (grading) grading.material.uniforms.uFlash.value = G.flash;

    const difficulty = THREE.MathUtils.clamp(G.time / C.game.duration, 0, 1);
    gangsters.update(dt, elapsed, { state: G.state, difficulty });
    shotgun.update(dt);
    hall.update?.(dt, elapsed);
    audio.update?.(dt, G);

    if (playing && G.time >= C.game.duration) finish();
  }

  ui.setHUD?.({
    state: G.state,
    time: G.time,
    duration: C.game.duration,
    remaining: Math.max(0, C.game.duration - G.time),
    barrels: G.onShelf,
    stolen: G.stolen,
    maxStolen: C.game.maxStolen,
    total: C.game.barrelCount,
    shells: G.shells,
    maxShells: C.shotgun.shells,
    reloading: G.reloadT >= 0 ? G.reloadT / C.shotgun.reload : -1,
    score: G.score,
    fps: G.fps,
  });

  if (grading) grading.render(scene, camera, elapsed); else renderer.render(scene, camera);
  adaptResolution(dt);
}

// debug: advance the simulation by n fixed frames (for automated tests in throttled tabs)
function step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); }

Object.assign(window.__game3, { G, hall, gangsters, shotgun, startRun, step });
