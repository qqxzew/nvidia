import { progress } from '../core/progress.js';
// Level 5 "Šílená stáčírna" — the racking hall conveyor puzzle (owner: lead). Loaded by src/boot.js on ?level=5.
// Wires: renderer + fixed top-down camera + grading, hall + belts + barrels (art), line simulation (gameplay),
// UI + audio (ui). See docs/LEVEL5.md for the contract.
//
// Debug URL params:  ?level=5&autostart=1  &nograde=1  &cam=orbit  &q=low|high  &god=1 (no fail)
import * as THREE from 'three';
import { LAYOUT, CAMERA, LINE, STATIONS, buildBelts } from './config.js';
import { createEvents } from '../core/events.js';
import { createGrading } from '../fx/grading.js';

const params = new URLSearchParams(location.search);
const ORBIT = params.get('cam') === 'orbit';
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
const quality = params.get('q') || (isMobile ? 'low' : 'high');
const MAX_PR = 1.5, MIN_PR = 0.85;

document.title = 'Plzeň 1926 – Šílená stáčírna';

// modules from the other owners are loaded defensively so one broken part never blanks the level
async function load(importer, name) {
  try { return (await importer())[name]; }
  catch (e) { console.error(`[level5] ${name} failed to load`, e); return null; }
}
const [buildHall, createLine, createUI5, createAudio5] = await Promise.all([
  load(() => import('./hall.js'), 'buildHall'),
  load(() => import('./line.js'), 'createLine'),
  load(() => import('./ui.js'), 'createUI5'),
  load(() => import('./audio.js'), 'createAudio5'),
]);

// --- renderer -------------------------------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
let pixelRatio = Math.min(devicePixelRatio, MAX_PR);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15100c);
const camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.3, 120);
const camTarget = new THREE.Vector3(...CAMERA.target);
camera.position.set(...CAMERA.position);
camera.lookAt(camTarget);

// faint fill so nothing goes pitch black; the hall module owns the real lights
const hemi = new THREE.HemisphereLight(0xb8c4cc, 0x3a2a1c, 0.35);
scene.add(hemi);

// --- context --------------------------------------------------------------------------------------
const events = createEvents();
const belts = buildBelts(LAYOUT);
const god = !!params.get('god');
const ctx = { THREE, scene, camera, renderer, events, layout: LAYOUT, lineCfg: LINE, stations: STATIONS, belts, quality, isMobile, god, dynamic: [] };
window.__game = ctx;

function safe(name, fn) {
  if (!fn) return null;
  try { return fn(ctx); } catch (e) { console.error(`[level5] ${name} failed`, e); return null; }
}

let hall = safe('hall', buildHall);
if (!hall) hall = buildPlaceholder(); // keeps the level playable while the art module is missing
// freeze static matrices (anything flagged userData.dynamic keeps updating)
scene.traverse((o) => { if (!o.userData.dynamic) { o.updateMatrix(); o.matrixAutoUpdate = false; } });

const line = safe('line', createLine);
const ui = safe('ui', createUI5);
const audio = safe('audio', createAudio5);
const grading = params.get('nograde') ? null : createGrading(renderer, { samples: quality === 'high' ? 4 : 0 });
if (grading) { // interior grade, same as level 4
  grading.material.uniforms.uSepia.value = 0.18;
  grading.material.uniforms.uVignette.value = 0.46;
}

let orbit = null;
if (ORBIT) {
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.target.copy(camTarget);
  orbit.update();
}

// --- game state machine ---------------------------------------------------------------------------
const G = { state: 'menu', countdown: 0, result: null, fps: 0 };
function setState(s) { const prev = G.state; G.state = s; events.emit('state', { state: s, prev }); }

function resetRun() { line?.reset?.(); G.result = null; }
function startRun() {
  resetRun();
  G.countdown = LINE.countdown;
  setState('countdown');
  events.emit('countdown', { n: Math.ceil(G.countdown) });
}

events.on('ui:start', () => { audio?.unlock?.(); if (G.state === 'menu' || G.state === 'won' || G.state === 'lost') startRun(); });
events.on('ui:restart', () => { audio?.unlock?.(); startRun(); });
events.on('ui:pause', () => { if (G.state === 'playing') setState('paused'); });
events.on('ui:resume', () => { if (G.state === 'paused') setState('playing'); });
events.on('ui:menu', () => { resetRun(); setState('menu'); });
events.on('ui:switch', ({ id }) => { if ((G.state === 'playing' || G.state === 'countdown') && line) line.toggle(id); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') setState('paused'); });
events.on('finish', (e) => { if (G.state === 'playing') { G.result = e; try { progress.complete(5, { stars: e?.stars || 1, time: e?.time || 0 }); } catch {} setState('won'); } });
events.on('fail', (e) => { if (G.state === 'playing' && !god) { G.result = e; setState('lost'); } });

// --- resize & adaptive resolution ----------------------------------------------------------------
// keep the whole line in view on any aspect: widen the vertical fov on narrow screens
function fitCamera() {
  const a = innerWidth / innerHeight;
  const ref = 16 / 9;
  const fov = a >= ref ? CAMERA.fov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA.fov) / 2) * ref / a));
  camera.fov = Math.min(fov, 70);
  camera.aspect = a;
  camera.updateProjectionMatrix();
}
function resize() {
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  fitCamera();
  if (grading) { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); grading.setSize(s.x, s.y); }
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));
fitCamera();

let perfAcc = 0, perfFrames = 0;
function adaptResolution(dt) {
  perfAcc += dt; perfFrames++;
  if (perfAcc < 2) return;
  const avg = perfAcc / perfFrames;
  perfAcc = 0; perfFrames = 0;
  let next = pixelRatio;
  if (avg > 1 / 42) next = Math.max(MIN_PR, pixelRatio - 0.15);
  else if (avg < 1 / 58) next = Math.min(Math.min(devicePixelRatio, MAX_PR), pixelRatio + 0.1);
  if (Math.abs(next - pixelRatio) > 0.01) { pixelRatio = next; resize(); }
  G.fps = Math.round(1 / avg);
}

// --- main loop -----------------------------------------------------------------------------------
const EMPTY = { time: 0, speed: LINE.speedStart, shipped: 0, quota: LINE.quota, strikes: 0, maxStrikes: LINE.maxStrikes,
  switches: { wash: false, fill: false, cap: false, ship: false }, barrels: [] };
let lastNow = performance.now(), elapsed = 0;
resetRun();
setState('menu');
if (params.get('autostart')) startRun();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 1 / 20);
  lastNow = now; elapsed += dt;
  const t = elapsed;
  ui?.update?.(dt);

  if (G.state === 'countdown') {
    const before = Math.ceil(G.countdown);
    G.countdown -= dt;
    const n = Math.ceil(G.countdown);
    if (n !== before) events.emit('countdown', { n: Math.max(0, n) });
    if (G.countdown <= 0) setState('playing');
  }

  const paused = G.state === 'paused';
  const playing = G.state === 'playing';
  if (!paused) line?.update?.(dt, playing);
  const ls = line?.state || EMPTY;

  if (!paused) {
    hall?.update?.(dt, t, { state: G.state, line: ls });
    for (const d of ctx.dynamic) d.update?.(dt, t);
  }
  if (orbit) orbit.update();

  const hud = {
    state: G.state,
    time: ls.time,
    speed: ls.speed,
    speedStart: LINE.speedStart,
    speedMax: LINE.speedMax,
    shipped: ls.shipped,
    quota: ls.quota,
    strikes: ls.strikes,
    maxStrikes: ls.maxStrikes,
    switches: ls.switches,
    barrels: ls.barrels,
    liftQueue: ls.liftQueue ?? 0,
    liftMax: ls.liftMax ?? 5,
    level: ls.level ?? 0,
    result: G.result,
    fps: G.fps,
  };
  ui?.setHUD?.(hud);
  audio?.update?.(dt, hud);

  if (grading) grading.render(scene, camera, t); else renderer.render(scene, camera);
  adaptResolution(dt);
});

Object.assign(window.__game, { G, line, hall, ui, startRun, setState });

// --- placeholder visuals (only when hall.js is missing or throws) -----------------------------------
function buildPlaceholder() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 12.5), new THREE.MeshLambertMaterial({ color: 0x5f5246 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -0.25; scene.add(floor);
  const l = new THREE.PointLight(0xffe2b8, 60, 40); l.position.set(0, 8, 1); scene.add(l);
  const beltMat = new THREE.LineBasicMaterial({ color: 0xd8cdb6 });
  const addPath = (p) => {
    const g = new THREE.BufferGeometry().setFromPoints(p.samples.map((q) => new THREE.Vector3(q.x, LAYOUT.beltHeight, q.z)));
    scene.add(new THREE.Line(g, beltMat));
  };
  addPath(belts.ring); addPath(belts.entry.path);
  for (const b of Object.values(belts.branches)) addPath(b.path);
  const colors = { dirty: 0x4a3a2a, clean: 0xb98a55, full: 0x8a5a2e, capped: 0xc0392b };
  const geo = new THREE.CylinderGeometry(LAYOUT.barrel.radius, LAYOUT.barrel.radius, 0.6, 12);
  const mats = Object.fromEntries(Object.entries(colors).map(([k, c]) => [k, new THREE.MeshLambertMaterial({ color: c })]));
  const pool = new Map();
  const group = new THREE.Group(); group.userData.dynamic = true; scene.add(group);
  return {
    update(dt, t, vis) {
      const seen = new Set();
      for (const b of vis.line.barrels) {
        let m = pool.get(b.id);
        if (!m) { m = new THREE.Mesh(geo, mats.dirty); m.userData.dynamic = true; group.add(m); pool.set(b.id, m); }
        m.material = mats[b.state] || mats.dirty;
        m.position.set(b.x, LAYOUT.beltHeight + 0.3, b.z);
        seen.add(b.id);
      }
      for (const [id, m] of pool) if (!seen.has(id)) { group.remove(m); pool.delete(id); }
    },
  };
}
