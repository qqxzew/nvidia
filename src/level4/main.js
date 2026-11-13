// Level 4 "Varna" — first-person run across the brewhouse catwalks (owner: lead). Loaded by src/boot.js on ?level=4.
// Wires: renderer + first-person camera + grading, factory interior + hazards (art), runner simulation (gameplay),
// UI + audio (ui). See docs/LEVEL4.md for the contract.
//
// Debug URL params:  ?level=4&autostart=1  &nograde=1  &cam=orbit  &q=low|high  &god=1 (no fail)  &s=120 (start at s)
import * as THREE from 'three';
import { RUN, CAMERA } from './config.js';
import { COURSE, buildCourse } from './course.js';
import { createEvents } from '../core/events.js';
import { createGrading } from '../fx/grading.js';

const params = new URLSearchParams(location.search);
const ORBIT = params.get('cam') === 'orbit';
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
const quality = params.get('q') || (isMobile ? 'low' : 'high');
const MAX_PR = 1.5, MIN_PR = 0.85;

document.title = 'Plzeň 1926 – Varna';

// modules from the other owners are loaded defensively so one broken part never blanks the level
async function load(importer, name) {
  try { return (await importer())[name]; }
  catch (e) { console.error(`[level4] ${name} failed to load`, e); return null; }
}
const [buildFactory, createRunner, createUI4, createAudio4] = await Promise.all([
  load(() => import('./factory.js'), 'buildFactory'),
  load(() => import('./runner.js'), 'createRunner'),
  load(() => import('./ui.js'), 'createUI4'),
  load(() => import('./audio.js'), 'createAudio4'),
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
scene.background = new THREE.Color(0x17120d);
const camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, CAMERA.near, CAMERA.far);
scene.add(camera); // so art may parent things to the camera (e.g. hands)

// faint fill so nothing goes pitch black; the factory module owns the real lights
const hemi = new THREE.HemisphereLight(0xb8c4cc, 0x3a2a1c, 0.35);
scene.add(hemi);

// --- context --------------------------------------------------------------------------------------
const events = createEvents();
const course = buildCourse(COURSE, RUN.laneWidth);
const god = !!params.get('god');
const ctx = { THREE, scene, camera, renderer, events, run: RUN, course, quality, isMobile, god, dynamic: [] };
window.__game = ctx;

function safe(name, fn) {
  if (!fn) return null;
  try { return fn(ctx); } catch (e) { console.error(`[level4] ${name} failed`, e); return null; }
}

let factory = safe('factory', buildFactory);
if (!factory) factory = buildPlaceholder();
scene.traverse((o) => { if (!o.userData.dynamic && o !== camera) { o.updateMatrix(); o.matrixAutoUpdate = false; } });

const runner = safe('runner', createRunner);
const ui = safe('ui', createUI4);
const audio = safe('audio', createAudio4);
const input = ui?.input || { left: 0, right: 0, jump: 0 };
const grading = params.get('nograde') ? null : createGrading(renderer, { samples: quality === 'high' ? 4 : 0 });
if (grading) {
  grading.material.uniforms.uSepia.value = 0.18;
  grading.material.uniforms.uVignette.value = 0.46;
}

let orbit = null;
if (ORBIT) {
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  orbit = new OrbitControls(camera, renderer.domElement);
  const p = course.path.at(Number(params.get('s')) || 40);
  orbit.target.set(p.x, RUN.deckY, p.z);
  camera.position.set(p.x + 25, RUN.deckY + 18, p.z + 25);
  orbit.update();
}

// --- game state machine ---------------------------------------------------------------------------
const G = { state: 'menu', countdown: 0, result: null, fps: 0 };
function setState(s) { const prev = G.state; G.state = s; events.emit('state', { state: s, prev }); }

function resetRun() {
  runner?.reset?.();
  const s0 = Number(params.get('s'));
  if (runner && s0) runner.state.s = s0;
  G.result = null;
  camRig.snap = true;
}
function startRun() {
  resetRun();
  G.countdown = RUN.countdown;
  setState('countdown');
  events.emit('countdown', { n: Math.ceil(G.countdown) });
}

events.on('ui:start', () => { audio?.unlock?.(); if (G.state === 'menu' || G.state === 'won' || G.state === 'lost') startRun(); });
events.on('ui:restart', () => { audio?.unlock?.(); startRun(); });
events.on('ui:pause', () => { if (G.state === 'playing') setState('paused'); });
events.on('ui:resume', () => { if (G.state === 'paused') setState('playing'); });
events.on('ui:menu', () => { resetRun(); setState('menu'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') setState('paused'); });
events.on('finish', (e) => { if (G.state === 'playing') { G.result = e; setState('won'); } });
events.on('fail', (e) => { if (G.state === 'playing' && !god) { G.result = e; setState('lost'); } });
events.on('run:hit', () => { camRig.shake = 1; });

// --- first-person camera ----------------------------------------------------------------------------
const camRig = { snap: true, shake: 0, roll: 0, bob: 0, lastLat: 0, look: new THREE.Vector3(), fovK: 0 };
const _look = new THREE.Vector3();
function updateCamera(dt, t, rs) {
  const path = course.path;
  const s = rs ? rs.s : course.start;
  const lat = rs ? rs.lateral : 0;
  const p = path.at(s);
  const rx = -p.tz, rz = p.tx;
  // vertical: eye height + jump + running bob, sinking through the grating while falling into a hole
  const speed = rs?.speed ?? 0;
  const running = G.state === 'playing' && !(rs?.airborne) && !(rs?.falling > 0);
  camRig.bob += dt * (running ? speed * 1.55 : 0);
  const bobY = running ? Math.abs(Math.sin(camRig.bob)) * 0.06 * Math.min(1, speed / 6) : 0;
  const fall = rs?.falling ?? 0;
  const y = RUN.deckY + RUN.eyeHeight + (rs?.height ?? 0) + bobY - fall * fall * 4.5 - (rs?.stumble ?? 0) * 0.12;
  camera.position.set(p.x + rx * lat, y, p.z + rz * lat);
  // look ahead along the path so corners are anticipated smoothly
  const ahead = path.at(Math.min(path.length, s + 7));
  _look.set(ahead.x + (-ahead.tz) * lat * 0.6, RUN.deckY + RUN.eyeHeight - 0.35 + (rs?.height ?? 0) * 0.4 - fall * 3, ahead.z + ahead.tx * lat * 0.6);
  if (camRig.snap) { camRig.look.copy(_look); camRig.snap = false; }
  else camRig.look.lerp(_look, 1 - Math.exp(-dt * 10));
  camera.up.set(0, 1, 0);
  camera.lookAt(camRig.look);
  // roll into lane changes, shake on hits
  const latVel = dt > 0 ? (lat - camRig.lastLat) / dt : 0;
  camRig.lastLat = lat;
  camRig.roll += ((-latVel * 0.012) - camRig.roll) * Math.min(1, dt * 10);
  camRig.shake = Math.max(0, camRig.shake - dt * 2.5);
  const sh = camRig.shake * camRig.shake * 0.05;
  camera.rotateZ(camRig.roll + Math.sin(t * 47) * sh);
  camera.rotateX(Math.sin(t * 39) * sh);
  // speed fov
  const k = Math.min(1, Math.max(0, (speed - RUN.speedStart) / Math.max(0.1, RUN.speedMax - RUN.speedStart)));
  camRig.fovK += (k - camRig.fovK) * Math.min(1, dt * 2);
  const fov = baseFov() + CAMERA.fovBoost * camRig.fovK;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
}
// keep the horizontal field of view sane on narrow screens
function baseFov() {
  const a = innerWidth / innerHeight, ref = 16 / 9;
  if (a >= ref) return CAMERA.fov;
  return Math.min(90, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAMERA.fov) / 2) * ref / a)));
}

// --- resize & adaptive resolution ----------------------------------------------------------------
function resize() {
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = baseFov();
  camera.updateProjectionMatrix();
  if (grading) { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); grading.setSize(s.x, s.y); }
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

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
const NO_INPUT = { left: 0, right: 0, jump: 0 };
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
  if (!paused && runner) runner.update(dt, playing ? input : NO_INPUT, playing);
  input.left = 0; input.right = 0; input.jump = 0;
  const rs = runner?.state;

  if (!paused) {
    factory?.update?.(dt, t, { state: G.state, raceTime: rs?.time ?? 0, runner: rs });
    for (const d of ctx.dynamic) d.update?.(dt, t);
  }
  if (orbit) orbit.update(); else if (!paused) updateCamera(dt, t, rs);

  const hud = {
    state: G.state,
    time: rs?.time ?? 0,
    remaining: rs?.remaining ?? RUN.timeLimit,
    timeLimit: RUN.timeLimit,
    progress: rs?.progress ?? 0,
    speed: rs?.speed ?? 0,
    hits: rs?.hits ?? 0,
    falls: rs?.falls ?? 0,
    section: rs?.section ?? null,
    lane: rs?.lane ?? 0,
    airborne: !!rs?.airborne,
    stumble: rs?.stumble ?? 0,
    falling: rs?.falling ?? 0,
    nearSteam: rs?.nearSteam ?? 0,
    nearDrip: rs?.nearDrip ?? 0,
    result: G.result,
    fps: G.fps,
  };
  ui?.setHUD?.(hud);
  audio?.update?.(dt, hud);

  if (grading) grading.render(scene, camera, t); else renderer.render(scene, camera);
  adaptResolution(dt);
});

Object.assign(window.__game, { G, runner, factory, ui, input, startRun, setState });

// --- placeholder visuals (only when factory.js is missing or throws) ----------------------------------
function buildPlaceholder() {
  const mat = new THREE.MeshLambertMaterial({ color: 0x6b6258 });
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const g = new THREE.Group();
  for (const q of course.path.samples) {
    if (Math.round(q.s * 20) % 20) continue; // one slab per meter
    const m = new THREE.Mesh(new THREE.BoxGeometry(RUN.deckWidth, 0.08, 1.02), mat);
    m.position.set(q.x, RUN.deckY - 0.04, q.z); m.rotation.y = Math.atan2(q.tx, q.tz); g.add(m);
  }
  for (const h of course.hazards) {
    const p = course.path.at(h.s);
    for (const lane of h.lanes) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(RUN.laneWidth * 0.9, 0.1, h.type === 'hole' ? h.len : 0.5), h.type === 'hole' ? holeMat : new THREE.MeshLambertMaterial({ color: { steam: 0xdddddd, drip: 0x5588aa, fall: 0x8a6a3a, pipe: 0x7a3a2a }[h.type] }));
      m.position.set(p.x - p.tz * lane * RUN.laneWidth, RUN.deckY + (h.type === 'hole' ? 0.01 : 0.3), p.z + p.tx * lane * RUN.laneWidth);
      m.rotation.y = Math.atan2(p.tx, p.tz); g.add(m);
    }
  }
  scene.add(g);
  const l = new THREE.PointLight(0xffe2b8, 40, 30); l.userData.dynamic = true; scene.add(l);
  return { update() { l.position.copy(camera.position).add(new THREE.Vector3(0, 2, 0)); } };
}
