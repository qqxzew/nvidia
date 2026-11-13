// Level 2 "Válení sudů ve sklepě" (owner: gameplay): state machine, simulation loop, HUD/audio feed, debug.
// Contract: docs/LEVEL2.md. main.js calls createLevel2(host) once, then enter()/exit()/frame()/resize().
import * as THREE from 'three';
import { createEvents } from '../core/events.js';
import { progress } from '../core/progress.js';
import * as layout from './layout.js';
import { CONFIG2 } from './config2.js';
import { buildCellar } from './cellar.js';
import { createUI2 } from './ui2.js';
import { createAudio2 } from './audio2.js';
import { createPlayer } from './player.js';
import { createBarrels } from './barrels.js';
import { createRats } from './rats.js';
import { createCamera2 } from './camera2.js';
import { createBlobShadows } from './models2.js';
import { createBot2 } from './bot2.js';

const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };

export function createLevel2(host) {
  const params = host.params || new URLSearchParams(location.search);
  const K = CONFIG2.camera;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(K.fov, innerWidth / innerHeight, K.near, K.far);
  const events = createEvents();
  const ctx2 = { THREE, scene, camera, renderer: host.renderer, events, config: CONFIG2, quality: host.quality, isMobile: host.isMobile, layout };

  let world = null;
  try { world = buildCellar(ctx2); } catch (e) { console.error('[level2] buildCellar failed', e); }
  if (!world) world = { update() {} };
  const ui = createUI2(ctx2);
  const audio = createAudio2(ctx2);

  const player = createPlayer(ctx2);
  const barrels = createBarrels(ctx2);
  const rats = createRats(ctx2);
  const cam = createCamera2(ctx2);
  const nShadows = 1 + barrels.list.length + rats.rats.length;
  const shadows = createBlobShadows(nShadows);
  scene.add(player.group, barrels.mesh, rats.group, shadows.mesh);
  const P = player.P;

  // --- debug --------------------------------------------------------------------------------------
  const BOT = params.get('l2bot') === '1';
  const GOD = !!params.get('god');
  const AUTOSTART = !!params.get('autostart');
  const bot = BOT ? createBot2(ctx2) : null;
  const botInput = { x: 0, y: 0 };
  if (params.get('l2light')) scene.add(new THREE.HemisphereLight(0xfff0dd, 0x403020, 2.2)); // debug: see the models
  let orbit = null;
  if (params.get('cam') === 'orbit') {
    import('three/addons/controls/OrbitControls.js').then(({ OrbitControls }) => {
      orbit = new OrbitControls(camera, host.renderer.domElement);
      orbit.target.set(0, 1, 6); camera.position.set(6, 9, -6); orbit.update();
    });
  }

  // --- state --------------------------------------------------------------------------------------
  const S = { state: 'off', time: 0, countdown: 0, bites: 0, result: null, pushOn: false, pushT: 0, fps: 60, ratDist: 99 };
  const grade = { ...CONFIG2.grade, flash: 0, fade: 0 };
  const hud = { state: 'off', time: 0, timeLimit: CONFIG2.timeLimit, delivered: 0, total: CONFIG2.barrels, bites: 0, maxBites: CONFIG2.maxBites, pushing: false, guide: null, fps: 60 };
  const as = { state: 'off', playerSpeed: 0, pushing: false, barrelRoll: 0, ratDist: 99 };
  let dbgInput = null;

  function setState(s) { const prev = S.state; if (prev === s) return; S.state = s; events.emit('state', { state: s, prev }); }

  function reset() {
    player.reset(); barrels.reset(); rats.reset();
    S.time = 0; S.bites = 0; S.result = null; S.pushOn = false; S.pushT = 0;
    grade.flash = 0;
    if (bot) Object.assign(bot.bot, { target: null, phase: 'pick', t: 0 });
    cam.snap(P);
    writeShadows();
  }
  function startRun() {
    reset();
    S.countdown = CONFIG2.countdown;
    setState('countdown');
    events.emit('countdown', { n: Math.ceil(S.countdown) });
  }

  events.on('ui:start', () => { audio.unlock?.(); if (S.state === 'brief' || S.state === 'won' || S.state === 'lost') startRun(); });
  events.on('ui:restart', () => { audio.unlock?.(); if (S.state !== 'off') startRun(); });
  events.on('ui:pause', () => { if (S.state === 'playing') setState('paused'); });
  events.on('ui:resume', () => { if (S.state === 'paused') setState('playing'); });
  events.on('ui:title', () => { if (S.state !== 'off') host.onExit?.(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S.state === 'playing') setState('paused'); });

  function onDelivered(b, n) {
    if (P.push === b) P.push = null;
    events.emit('barrel:delivered', { index: b.i, delivered: n, total: barrels.list.length });
    if (n >= barrels.list.length && S.state === 'playing') finish();
  }
  function onBite() {
    S.bites++;
    player.bite();
    grade.flash = 0.5;
    events.emit('rat:bite', { bites: S.bites, maxBites: CONFIG2.maxBites });
    if (S.bites >= CONFIG2.maxBites) fail('rats');
  }
  function finish() {
    const t = S.time, b = S.bites, st = CONFIG2.stars;
    const stars = t <= st.three.time && b <= st.three.bites ? 3 : t <= st.two.time && b <= st.two.bites ? 2 : 1;
    S.result = { time: t, bites: b, stars };
    setState('won');
    events.emit('finish', { time: t, bites: b, stars });
    try { progress.complete(2, { stars, time: t }); } catch (e) { console.warn(e); }
  }
  function fail(reason) {
    S.result = { reason, time: S.time, bites: S.bites, delivered: barrels.delivered };
    setState('lost');
    events.emit('fail', { reason, time: S.time, bites: S.bites, delivered: barrels.delivered });
  }

  // --- simulation ---------------------------------------------------------------------------------
  const ZERO = { x: 0, y: 0 };
  function simulate(dt, t, playing) {
    let input = ui.input || ZERO;
    if (dbgInput) input = dbgInput;
    if (bot && playing) { bot.drive(dt, P, barrels.list, cam.view, botInput); input = botInput; }
    player.control(dt, input, cam.view.inputYaw, playing);
    barrels.interact(dt, P);
    barrels.update(dt, onDelivered);
    player.collideWalls();
    S.ratDist = rats.update(dt, t, P, barrels.list, cam.view, playing && S.state === 'playing', !(GOD), onBite);
    player.animate(dt, t);
    barrels.writeMatrices();
    writeShadows();
    // push event with a little hysteresis (no flicker on contact jitter)
    if (P.push) { S.pushT = Math.min(0.3, S.pushT + dt); } else S.pushT = Math.max(0, S.pushT - dt);
    const on = S.pushOn ? S.pushT > 0 : S.pushT > 0.08;
    if (on !== S.pushOn) { S.pushOn = on; events.emit('push', { on }); }
    if (S.state === 'playing' && S.time >= CONFIG2.timeLimit) fail('time');
  }

  function writeShadows() {
    let k = 0;
    const ps = 0.8 + 0.25 * P.pushAmt;
    shadows.set(k++, P.x + P.faceX * 0.08 * P.pushAmt, 0, P.z + P.faceZ * 0.08 * P.pushAmt, 0.7, ps, P.yaw);
    for (const b of barrels.list) {
      if (b.delivered) {
        const sl = layout.DOCK_SLOTS[Math.min(b.slot, layout.DOCK_SLOTS.length - 1)];
        const u = Math.max(0, b.anim), e = u * u * (3 - 2 * u);
        const s = 0.95 - 0.15 * e;
        shadows.set(k++, b.ax + (sl.x - b.ax) * e, sl.y * e, b.az + (sl.z - b.az) * e, s, s, 0);
      } else shadows.set(k++, b.x, 0, b.z, 1.05, 0.85, b.yaw);
    }
    for (const r of rats.rats) shadows.set(k++, r.x, 0, r.z, 0.26, 0.5, r.yaw);
    shadows.flush();
  }

  function guideAngle() {
    if (S.state !== 'playing' && S.state !== 'paused') return null;
    let tx, tz;
    if (P.push) { const T = layout.TARGET; tx = (T.x0 + T.x1) / 2; tz = (T.z0 + T.z1) / 2; }
    else {
      let best = Infinity;
      for (const b of barrels.list) { if (b.delivered) continue; const d = Math.hypot(b.x - P.x, b.z - P.z); if (d < best) { best = d; tx = b.x; tz = b.z; } }
      if (best === Infinity) return null;
    }
    return wrap(cam.view.yaw - Math.atan2(tx - P.x, tz - P.z)); // + = right
  }

  // --- frame --------------------------------------------------------------------------------------
  function frame(dt, t) {
    ui.update?.(dt);
    if (S.state === 'off' || S.freeze) return; // freeze: debug screenshots
    S.fps += (1 / Math.max(dt, 1e-3) - S.fps) * 0.05;
    if (S.state === 'countdown') {
      const before = Math.ceil(S.countdown);
      S.countdown -= dt;
      const now = Math.max(0, Math.ceil(S.countdown));
      if (now !== before) events.emit('countdown', { n: now });
      if (S.countdown <= 0) setState('playing');
    }
    const st = S.state;
    if (st !== 'paused') {
      if (st === 'playing') S.time += dt;
      simulate(dt, t, st === 'playing');
    }
    if (orbit) orbit.update();
    else if (st === 'brief') cam.intro(t);
    else if (st === 'countdown') cam.fly(1 - Math.max(0, S.countdown) / CONFIG2.countdown, t, P);
    else if (st === 'won') cam.update(dt, P, null, 0.22);
    else if (st !== 'paused') cam.update(dt, P, P.push);

    grade.flash = Math.max(0, grade.flash - dt * 1.4);
    grade.fade = Math.max(0, grade.fade - dt * 1.2);

    hud.state = S.state; hud.time = S.time; hud.delivered = barrels.delivered; hud.bites = S.bites;
    hud.pushing = S.pushOn; hud.guide = guideAngle(); hud.fps = Math.round(S.fps);
    ui.setHUD?.(hud);
    as.state = S.state; as.playerSpeed = P.speed; as.pushing = S.pushOn; as.barrelRoll = barrels.maxRoll(); as.ratDist = S.ratDist;
    audio.update?.(dt, as);
    world.update?.(dt, t, P);
  }

  function resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); }

  const api = {
    scene, camera, events, grade,
    enter() {
      reset();
      grade.fade = 1;
      setState('brief');
      if (AUTOSTART || BOT) startRun();
    },
    exit() {
      setState('off');
      dbgInput = null;
      if (ui.input) { ui.input.x = 0; ui.input.y = 0; }
      grade.flash = 0; grade.fade = 0;
      as.state = 'off'; as.playerSpeed = 0; as.pushing = false; as.barrelRoll = 0;
      try { audio.update?.(0, as); audio.stop?.(); } catch (e) { /* ignore */ }
    },
    frame, resize,
  };

  // window.__l2: debug handle. sim(sec) fast-forwards the simulation without rendering (bot timing).
  window.__l2 = {
    ctx2, S, player, P, barrels, rats, cam, bot, layout, config: CONFIG2, api, events, grade,
    get state() { return S.state; },
    set input(v) { dbgInput = v; },
    get input() { return dbgInput; },
    start: startRun, reset, finish, fail,
    sim(sec, step = 1 / 60) { let t = performance.now() / 1000; for (let k = 0, n = Math.round(sec / step); k < n; k++) { frame(step, t); t += step; if (S.state === 'won' || S.state === 'lost') break; } return { state: S.state, time: S.time, delivered: barrels.delivered, bites: S.bites }; },
  };
  return api;
}
