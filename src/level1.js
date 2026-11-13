import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createEvents } from './core/events.js';
import { createRoute } from './world/route.js';
import { buildEnvironment } from './world/environment.js';
import { buildCity } from './world/city.js';
import { buildSquare } from './world/square.js';
import { buildSvetovar } from './world/svetovar.js';
import { createTruck } from './vehicle/truckModel.js';
import { createController } from './vehicle/controller.js';
import { createCargo } from './gameplay/cargo.js';
import { createTraffic } from './gameplay/traffic.js';
import { createCameraRig } from './fx/cameraRig.js';
import { createGrading } from './fx/grading.js';
import { createUI } from './ui/ui.js';
import { createAudio } from './audio/audio.js';
import { createAutopilot } from './debug/autopilot.js';

// ---------------------------------------------------------------------------------------------
// Level 1 "Jízda do Světovaru" (loaded by src/main.js when no ?level is given).
// Debug URL params:  ?autostart=1  ?s=600 (start arc length)  ?cam=orbit  ?view=truck|square|svetovar|city
//                    ?nograde=1  ?stats=1  ?god=1 (barrels never fall)
// ---------------------------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const VIEW = params.get('view');
const ORBIT = params.get('cam') === 'orbit' || !!VIEW;
const START_S = Number(params.get('s')) || 4;

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
const quality = params.get('q') || (isMobile ? 'low' : 'high');

// --- renderer ---------------------------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
let pixelRatio = Math.min(devicePixelRatio, CONFIG.render.maxPixelRatio);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.3, 2500);

// --- light: late-summer afternoon, low warm sun ahead-right of the driving direction ----------
const hemi = new THREE.HemisphereLight(0xd6e4f0, 0x8a7356, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0b0, 2.6);
const SUN_DIR = new THREE.Vector3(-0.45, 0.5, 0.74).normalize();
sun.castShadow = true;
sun.shadow.mapSize.set(CONFIG.render.shadowMapSize * (quality === 'high' ? 2 : 1), CONFIG.render.shadowMapSize * (quality === 'high' ? 2 : 1));
const E = CONFIG.render.shadowExtent;
Object.assign(sun.shadow.camera, { left: -E, right: E, top: E, bottom: -E, near: 1, far: 400 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
// soft fill from behind the chase camera so the truck and barrels never go black against the low sun
const fill = new THREE.DirectionalLight(0xdfe6f0, 0.55);
fill.position.set(0.35, 0.6, -0.75);
scene.add(fill);
scene.fog = new THREE.Fog(0xd8cdb6, CONFIG.render.fogNear, CONFIG.render.fogFar);

// --- shared context ------------------------------------------------------------------------------
const events = createEvents();
const route = createRoute();
const ctx = {
  THREE, scene, camera, renderer, route, events, config: CONFIG, quality, isMobile,
  sun, sunDir: SUN_DIR, hemi,
  colliders: [],        // static circle colliders {x, z, r, kind}
  dynamicColliders: [], // moving colliders, rewritten by traffic each frame {x, z, r, vx, vz, kind, onHit}
  hazards: [],          // potholes / rails: {s, lateral, radius, strength}
  dynamic: [],          // objects with update(dt, t) — smoke, flags, etc.
};
window.__game = ctx;

// --- world ---------------------------------------------------------------------------------------
const worldParts = [];
function build(name, fn) {
  try { const r = fn(ctx); if (r) worldParts.push(r); return r; }
  catch (e) { console.error(`[build] ${name} failed`, e); return null; }
}
if (VIEW !== 'truck') {
  build('environment', buildEnvironment);
  build('city', buildCity);
  build('square', buildSquare);
  build('svetovar', buildSvetovar);
} else {
  scene.background = new THREE.Color(0xc9d4d8);
  const g = new THREE.Mesh(new THREE.CircleGeometry(30, 32), new THREE.MeshLambertMaterial({ color: 0x8b7d66 }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
}
// freeze static world matrices (anything flagged userData.dynamic keeps updating)
scene.traverse((o) => { if (!o.userData.dynamic && o !== sun && o !== sun.target) { o.updateMatrix(); o.matrixAutoUpdate = false; } });

const truck = createTruck(ctx);
scene.add(truck.group);
const controller = createController(ctx, truck);
const cargo = createCargo(ctx, truck);
const traffic = VIEW === 'truck' ? null : build('traffic', createTraffic);
const rig = createCameraRig(ctx);
const ui = createUI(ctx);
const audio = createAudio(ctx);
const grading = params.get('nograde') ? null : createGrading(renderer, { samples: quality === 'high' ? 4 : 0 });

let orbit = null;
if (ORBIT) {
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  orbit = new OrbitControls(camera, renderer.domElement);
  const a = route.anchors;
  const focus = {
    truck: [0, 1.5, 0, 6, 4, 8],
    square: [a.square.cathedral.x, 10, a.square.cathedral.z, 90, 60, 90],
    svetovar: [-110, 15, 960, 80, 60, -60],
    city: null,
  }[VIEW];
  if (focus) { orbit.target.set(focus[0], focus[1], focus[2]); camera.position.set(focus[0] + focus[3], focus[1] + focus[4], focus[2] + focus[5]); }
  else { const f = route.frameAt(START_S); orbit.target.set(f.x, 2, f.z); camera.position.set(f.x + 25, 20, f.z - 25); }
  orbit.update();
}

// --- game state machine ---------------------------------------------------------------------------
const G = { state: 'menu', time: 0, countdown: 0, result: null };
function setState(s) { const prev = G.state; G.state = s; events.emit('state', { state: s, prev }); }

function resetRun() {
  controller.reset(VIEW === 'truck' ? 0 : START_S);
  if (VIEW === 'truck') { controller.state.x = 0; controller.state.z = 0; controller.state.yaw = 0; }
  cargo.reset();
  traffic?.reset?.();
  G.time = 0; G.result = null;
  rig.snap(controller.state);
}

function startRun() {
  resetRun();
  G.countdown = CONFIG.game.countdown;
  setState('countdown');
  events.emit('countdown', { n: Math.ceil(G.countdown) });
}

events.on('ui:start', () => { audio.unlock(); if (G.state === 'menu' || G.state === 'won' || G.state === 'lost') startRun(); });
events.on('ui:restart', () => { audio.unlock(); startRun(); });
events.on('ui:pause', () => { if (G.state === 'playing') setState('paused'); });
events.on('ui:resume', () => { if (G.state === 'paused') setState('playing'); });
events.on('ui:menu', () => { resetRun(); setState('menu'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') setState('paused'); });

events.on('barrel:lost', (e) => {
  if (G.state !== 'playing') return;
  if (e.lost > CONFIG.game.maxLostBarrels) fail('barrels');
});

function fail(reason) {
  G.result = { reason, time: G.time, lost: cargo.lost };
  setState('lost');
  events.emit('fail', { reason, time: G.time, lost: cargo.lost });
}

function finish() {
  const lost = cargo.lost;
  const t = G.time;
  const L = CONFIG.game.timeLimit;
  let stars = 1;
  if (lost === 0 && t <= L * 0.8) stars = 3;
  else if (lost <= 1 && t <= L * 0.92) stars = 2;
  G.result = { time: t, lost, stars };
  setState('won');
  events.emit('finish', { time: t, lost, stars, remaining: cargo.remaining });
}

// --- resize & adaptive resolution ----------------------------------------------------------------
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
  if (avg > 1 / 42) next = Math.max(CONFIG.render.minPixelRatio, pixelRatio - 0.15);
  else if (avg < 1 / 58) next = Math.min(Math.min(devicePixelRatio, CONFIG.render.maxPixelRatio), pixelRatio + 0.1);
  if (Math.abs(next - pixelRatio) > 0.01) { pixelRatio = next; resize(); }
  G.fps = Math.round(1 / avg);
}

// --- main loop -----------------------------------------------------------------------------------
let lastNow = performance.now(), elapsed = 0;
const god = !!params.get('god');
const autopilot = params.get('autopilot') ? createAutopilot(ctx, Number(params.get('alat')) || 4.5) : null;
resetRun();
setState('menu');
if (params.get('autostart')) startRun();

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - lastNow) / 1000, 1 / 20);
  lastNow = now; elapsed += dt;
  const t = elapsed;
  ui.update?.(dt);

  const playing = G.state === 'playing';
  if (G.state === 'countdown') {
    const before = Math.ceil(G.countdown);
    G.countdown -= dt;
    const now = Math.ceil(G.countdown);
    if (now !== before) events.emit('countdown', { n: Math.max(0, now) });
    if (G.countdown <= 0) setState('playing');
  }

  if (G.state !== 'paused') {
    if (playing) G.time += dt;
    if (autopilot && playing) autopilot.drive(controller.state, ui.input);
    controller.update(dt, ui.input, playing);
    const st = controller.state;
    if (god) cargo.barrels.forEach((b) => { b.loose = Math.min(b.loose, 0.5); });
    cargo.update(dt, st, playing);
    traffic?.update?.(dt, st, t);
    for (const p of worldParts) p.update?.(dt, t, st);
    // coarse distance culling of the two big landmark meshes (each is one huge bounding sphere)
    if (ctx.landmarks) {
      const sq = ctx.landmarks.square?.group, sv = ctx.landmarks.svetovar?.group;
      const intro = G.state === 'menu' || G.state === 'countdown';
      if (sq) sq.visible = intro || st.s < 470;
      if (sv) sv.visible = !intro && st.s > 430;
    }
    for (const d of ctx.dynamic) d.update?.(dt, t, st);

    if (playing) {
      const fin = route.anchors.finish;
      if (Math.hypot(st.x - fin.x, st.z - fin.z) < fin.radius || st.s >= route.length - 3) finish();
      else if (G.time >= CONFIG.game.timeLimit) fail('time');
    }
    if (!orbit) {
      const intro = START_S < 20 && VIEW !== 'truck';
      if (intro && G.state === 'menu') rig.introMenu(t);
      else if (intro && G.state === 'countdown') rig.introFly(1 - Math.max(0, G.countdown) / CONFIG.game.countdown, st, t);
      else rig.update(dt, st);
    }
    audio.update?.(dt, st, G);
  }
  if (orbit) orbit.update();

  // shadow camera follows the truck
  const st = controller.state;
  sun.target.position.set(st.x + Math.sin(st.yaw) * 12, 0, st.z + Math.cos(st.yaw) * 12);
  sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 200);
  sun.target.updateMatrixWorld();

  ui.setHUD?.({
    state: G.state,
    time: G.time,
    timeLimit: CONFIG.game.timeLimit,
    remaining: cargo.remaining,
    lost: cargo.lost,
    total: cargo.barrels.length,
    maxLost: CONFIG.game.maxLostBarrels,
    speedKmh: Math.abs(st.speed) * 3.6,
    warning: cargo.warning,
    looseness: cargo.maxLoose,
    progress: st.progress,
    zone: st.zone,
    fps: G.fps,
  });

  if (grading) grading.render(scene, camera, t); else renderer.render(scene, camera);
  adaptResolution(dt);
});

window.__game.G = G;
window.__game.controller = controller;
window.__game.cargo = cargo;
window.__game.startRun = startRun;
