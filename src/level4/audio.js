// Level 4 "Varna" (first-person catwalk run) — procedural WebAudio (owner: ui). No audio files.
// Persistent graph built once in unlock(): the big brewhouse hall (boiling kettles rumble, bubbling that gets more
// violent as the clock runs out, lamp hum, air), the steam jets below the catwalk (∝ hud.nearSteam), the rising
// pressure whine in the last 15 s.
// Scheduled: footsteps on the steel grating (cadence ∝ hud.speed, alternating L/R, slight randomness, look-ahead
// scheduled on the audio clock), drip plinks (∝ hud.nearDrip), heartbeat in the last 15 s, distant steam engine,
// chains, clanks and drips in the hall.
// One-shots: lane swish (run:lane), jump whoosh (run:jump), landing clang (run:land), hits by kind (run:hit: steam
// hiss, drip sizzle, thud for block / pipe / sack + a short low grunt), hole fall + distant clang (run:hole),
// respawn (run:respawn), sack hoist creak + thud (run:trigger), countdown + factory whistle on GO, finish (valve
// squeal + steam release + brewery bell), fail (boil-over surge).
//
// createAudio4(ctx) -> { unlock(), update(dt, hud) }
// Settings (volume / mute) from ../ui/shared.js and the events 'audio:volume' {value} / 'audio:mute' {muted}.
import { settings } from '../ui/shared.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MAX_VOICES = 40;
const STRIDE = 2.3;       // metres per running step (6.2 m/s ≈ 2.7 steps/s, 8.2 m/s ≈ 3.6 steps/s)
const FALL_TIME = 0.8;    // sack fall duration (course.js FALL_TIME)
const LOW_S = 15;         // pressure whine + heartbeat start

export function createAudio4(ctx) {
  const { events } = ctx;
  const RUN = ctx.run || {};
  const TL = RUN.timeLimit ?? 70;

  let ac = null;
  let master, comp, busWorld, busSfx, verbSend;
  let white, brown;
  let room = null, steam = null, press = null;
  let paused = false;
  let gameState = 'menu';
  let voices = 0;
  let acc = 0;
  let pauseTimer = 0;
  let liveMask = 0;
  let falling = false;
  let footL = false;
  let nextStep = 0;         // audio-clock time of the next footstep (0 = not scheduled)
  let bubbleTimer = 0, engineTimer = 1, chainTimer = 7, clankTimer = 5, dripAmbTimer = 3, dripNearTimer = 0, hbTimer = 0;

  const ready = () => !!ac && ac.state === 'running' && !paused;

  // ----------------------------------------------------------------------------------------
  // helpers (same toolkit as levels 4 / 5)
  // ----------------------------------------------------------------------------------------
  function makeNoiseBuffers() {
    const sr = ac.sampleRate;
    white = ac.createBuffer(1, sr * 2, sr);
    let d = white.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    brown = ac.createBuffer(1, sr * 3, sr);
    d = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  }
  function loopSrc(buf) {
    const s = ac.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.start(0, Math.random() * buf.duration);
    return s;
  }
  function biquad(type, f, q = 0.7) {
    const b = ac.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  }
  function gain(v = 0) { const g = ac.createGain(); g.gain.value = v; return g; }
  function out(node, dest, pan, wet = 0) {
    let n = node;
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
      node.connect(p); n = p;
    }
    n.connect(dest);
    if (wet > 0 && verbSend) { const w = gain(wet); n.connect(w); w.connect(verbSend); }
  }
  function env(g, t0, atk, vol, dur, hold = 0) {
    const p = g.gain;
    p.setValueAtTime(0.0001, t0);
    p.linearRampToValueAtTime(vol, t0 + atk);
    if (hold > 0) p.setValueAtTime(vol, t0 + atk + hold);
    p.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function voiceStart(src, stopAt) {
    voices++;
    src.onended = () => { voices--; };
    src.stop(stopAt);
  }
  function osc(type, f0, f1, dur, vol, o = {}) {
    if (voices > MAX_VOICES) return null;
    const t0 = ac.currentTime + (o.t0 || 0);
    const s = ac.createOscillator();
    s.type = type;
    s.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) s.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = gain(0);
    env(g, t0, o.atk ?? 0.004, vol, dur, o.hold || 0);
    if (o.bp) { const f = biquad('bandpass', o.bp, o.q || 4); s.connect(f); f.connect(g); }
    else if (o.lp) { const f = biquad('lowpass', o.lp, o.q || 0.7); s.connect(f); f.connect(g); }
    else s.connect(g);
    out(g, o.dest || busSfx, o.pan, o.wet ?? 0.25);
    s.start(t0);
    voiceStart(s, t0 + dur + 0.05);
    return s;
  }
  function noise(dur, vol, type, f0, q, o = {}) {
    if (voices > MAX_VOICES) return null;
    const t0 = ac.currentTime + (o.t0 || 0);
    const buf = o.brown ? brown : white;
    const s = ac.createBufferSource();
    s.buffer = buf;
    const f = biquad(type, f0, q);
    if (o.f1) { f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur); }
    const g = gain(0);
    env(g, t0, o.atk ?? 0.003, vol, dur, o.hold || 0);
    s.connect(f); f.connect(g);
    out(g, o.dest || busSfx, o.pan, o.wet ?? 0.25);
    s.start(t0, rand(0, Math.max(0, buf.duration - dur - 0.1)));
    voiceStart(s, t0 + dur + 0.05);
    return s;
  }

  // synthetic reverb: a tall vaulted brick brewhouse with copper vessels (long, a bit bright)
  function makeVerb() {
    const sr = ac.sampleRate, len = Math.floor(sr * 2.6);
    const ir = ac.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) { const x = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, 3.0) * (i < sr * 0.02 ? i / (sr * 0.02) : 1); }
    }
    const cv = ac.createConvolver(); cv.buffer = ir;
    const pre = biquad('lowpass', 4200, 0.5);
    const hp = biquad('highpass', 160, 0.5);
    const ret = gain(0.32);
    pre.connect(hp); hp.connect(cv); cv.connect(ret); ret.connect(master);
    return pre;
  }

  // ----------------------------------------------------------------------------------------
  // persistent graph
  // ----------------------------------------------------------------------------------------
  function build() {
    makeNoiseBuffers();
    master = gain(0);
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ac.destination);
    verbSend = makeVerb();
    busWorld = gain(0.9); busWorld.connect(master);
    busSfx = gain(1); busSfx.connect(master);

    // --- the hall: deep rumble of the boiling kettles (slowly surging), lamp hum, airy room noise
    const rum = loopSrc(brown);
    const rumLp = biquad('lowpass', 120, 0.7);
    const rumG = gain(0.1);
    const rumLfo = ac.createOscillator(); rumLfo.frequency.value = 0.13;
    const rumLfoG = gain(0.03); rumLfo.connect(rumLfoG); rumLfoG.connect(rumG.gain); rumLfo.start();
    rum.connect(rumLp); rumLp.connect(rumG); rumG.connect(busWorld);
    // the kettle's roll: band noise around 300 Hz (a big pot on a rolling boil)
    const roll = loopSrc(brown);
    const rollBp = biquad('bandpass', 320, 0.9);
    const rollG = gain(0.02);
    roll.connect(rollBp); rollBp.connect(rollG); out(rollG, busWorld, 0, 0.4);
    const hum = ac.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 50;
    const humLp = biquad('lowpass', 220, 0.6);
    const humG = gain(0.006);
    hum.connect(humLp); humLp.connect(humG); humG.connect(busWorld); hum.start();
    const air = loopSrc(white);
    const airBp = biquad('bandpass', 560, 0.4);
    const airG = gain(0.012);
    air.connect(airBp); airBp.connect(airG); airG.connect(busWorld);
    room = { rumG, rumLp, rollG, rollBp };

    // --- steam jets near the runner: a bright hiss + a lower roar (both ∝ nearSteam)
    const st = loopSrc(white);
    const stHp = biquad('highpass', 1800, 0.6);
    const stBp = biquad('bandpass', 3800, 0.5);
    const stG = gain(0);
    st.connect(stHp); stHp.connect(stBp); stBp.connect(stG); out(stG, busWorld, 0, 0.25);
    const ro = loopSrc(white);
    const roBp = biquad('bandpass', 750, 0.7);
    const roG = gain(0);
    ro.connect(roBp); roBp.connect(roG); out(roG, busWorld, 0, 0.3);
    steam = { stG, stBp, roG };

    // --- pressure: a thin rising whine of the overheated kettle (last 15 s)
    const wh = ac.createOscillator(); wh.type = 'triangle'; wh.frequency.value = 300;
    const wh2 = ac.createOscillator(); wh2.type = 'sine'; wh2.frequency.value = 303;
    const whVib = ac.createOscillator(); whVib.frequency.value = 5.5;
    const whVibG = gain(6); whVib.connect(whVibG); whVibG.connect(wh.frequency); whVibG.connect(wh2.frequency); whVib.start();
    const whBp = biquad('bandpass', 900, 1.2);
    const whG = gain(0);
    wh.connect(whBp); wh2.connect(whBp); whBp.connect(whG); out(whG, busWorld, 0, 0.35);
    wh.start(); wh2.start();
    press = { wh, wh2, whG, whBp };

    applyMaster(true);
  }

  function applyMaster(instant) {
    if (!master) return;
    const target = settings.muted ? 0 : Math.pow(clamp(settings.volume, 0, 1), 2) * 0.95;
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    if (instant) master.gain.setValueAtTime(paused ? 0 : target, t);
    else master.gain.setTargetAtTime(paused ? 0 : target, t, 0.04);
  }

  // ----------------------------------------------------------------------------------------
  // unlock / suspend
  // ----------------------------------------------------------------------------------------
  function unlock() {
    try {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ac = new AC({ latencyHint: 'interactive' });
        build();
        const b = ac.createBuffer(1, 1, 22050); const s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0);
      }
      if (!paused && ac.state !== 'running') { const p = ac.resume(); p && p.catch && p.catch(() => {}); }
    } catch (e) { console.warn('[audio4] unlock failed', e); }
  }
  const gestureUnlock = () => { unlock(); if (ac && ac.state === 'running') removeGestureListeners(); };
  const gestureEvents = ['pointerdown', 'touchend', 'keydown', 'click'];
  function removeGestureListeners() { gestureEvents.forEach((ev) => window.removeEventListener(ev, gestureUnlock, true)); }
  gestureEvents.forEach((ev) => window.addEventListener(ev, gestureUnlock, true));

  function setPaused(p) {
    if (p === paused) return;
    paused = p;
    clearTimeout(pauseTimer);
    if (!ac) return;
    if (p) {
      applyMaster(false);
      pauseTimer = setTimeout(() => { if (paused && ac.state === 'running') ac.suspend().catch(() => {}); }, 160);
    } else {
      nextStep = 0;
      ac.resume().then(() => applyMaster(false), () => {});
    }
  }

  events.on('state', ({ state }) => {
    gameState = state;
    setPaused(state === 'paused');
    if (state !== 'playing') nextStep = 0;
    if (state === 'countdown' || state === 'menu') { falling = false; hbTimer = 0; }
  });
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) { clearTimeout(pauseTimer); ac.suspend().catch(() => {}); }
    else if (!paused) ac.resume().catch(() => {});
  });
  events.on('audio:volume', ({ value }) => { if (typeof value === 'number') settings.volume = clamp(value, 0, 1); if (ac) applyMaster(false); });
  events.on('audio:mute', ({ muted }) => { settings.muted = !!muted; if (ac) applyMaster(false); });

  // ----------------------------------------------------------------------------------------
  // one-shot recipes
  // ----------------------------------------------------------------------------------------
  function metal(f, vol, dur, o = {}) {
    const parts = [[1, 1], [2.32, 0.55], [4.25, 0.3], [6.8, 0.14]];
    for (const [r, a] of parts) osc('sine', f * r, f * r * 0.998, dur * (1.1 - r * 0.1), vol * a, { ...o, atk: 0.002 });
    noise(0.02, vol * 0.6, 'bandpass', f * 3, 2, o);
  }
  function bell(vol = 0.1, f = 1320, pan = 0, strikes = 1, gap = 0.3, t0 = 0) {
    const parts = [[1, 1, 1.6], [2.0, 0.35, 1.1], [2.76, 0.4, 0.8], [5.4, 0.15, 0.4]];
    for (let k = 0; k < strikes; k++) {
      const tk = t0 + k * gap;
      for (const [r, a, d] of parts) osc('sine', f * r, f * r, d, vol * a, { t0: tk, atk: 0.002, pan, wet: 0.5 });
      noise(0.015, vol * 0.4, 'highpass', 5000, 0.7, { t0: tk, pan });
    }
  }
  function drip(t0 = 0, vol = 0.02, pan = rand(-0.8, 0.8)) {
    const f = rand(900, 1700);
    osc('sine', f, f * rand(1.5, 2.1), 0.05, vol, { t0, pan, atk: 0.002, wet: 0.55 });
  }
  function bubble(t0 = 0, vol = 0.03, pan = 0, lo = 90, hi = 260) {
    const f = rand(lo, hi);
    osc('sine', f, f * rand(1.6, 2.4), rand(0.04, 0.09), vol, { t0, lp: 1200, pan: pan + rand(-0.1, 0.1), atk: 0.004, wet: 0.4 });
  }
  // a short, low "uh" — two formants on a falling buzz (kept quiet: a hint of effort, not a scream)
  function grunt(t0 = 0, vol = 0.05) {
    const f = rand(118, 138);
    osc('sawtooth', f, f * 0.72, 0.2, vol, { t0, bp: 560, q: 5, atk: 0.015 });
    osc('sawtooth', f, f * 0.72, 0.18, vol * 0.5, { t0, bp: 1050, q: 6, atk: 0.015 });
  }

  // a running step on the steel grating: dull boot thud + grating rattle + a short ring of the plate
  function footstep(t0, k = 1) {
    t0 = Math.max(0, t0);
    footL = !footL;
    const pan = (footL ? -0.14 : 0.14) + rand(-0.03, 0.03);
    const v = k * rand(0.85, 1.1);
    osc('sine', rand(130, 160), 55, 0.07, 0.13 * v, { t0, pan, lp: 380, atk: 0.002, wet: 0.08 });
    noise(0.045, 0.06 * v, 'bandpass', rand(1700, 2900), 2.6, { t0, pan, wet: 0.18 });
    const f = rand(360, 520);
    osc('sine', f, f * 0.997, 0.16, 0.022 * v, { t0, pan, atk: 0.001, wet: 0.3 });
    osc('sine', f * 2.7, f * 2.69, 0.08, 0.01 * v, { t0, pan, atk: 0.001, wet: 0.3 });
  }
  function laneSwish(lane) {
    const pan = clamp((lane || 0) * 0.35, -0.5, 0.5);
    noise(0.13, 0.035, 'bandpass', 900, 1.2, { pan, f1: 2200, atk: 0.02, wet: 0.1 });
    noise(0.03, 0.03, 'bandpass', rand(2200, 3000), 3, { t0: 0.06, pan, wet: 0.15 }); // scuff on the grating
  }
  function jumpSound() {
    footstep(0, 1.25);
    noise(0.32, 0.07, 'bandpass', 500, 1.1, { f1: 1900, atk: 0.06, wet: 0.15 });
    noise(0.07, 0.025, 'bandpass', 900, 2, { t0: 0.02, atk: 0.01 }); // a sharp breath out
  }
  function landSound() {
    osc('sine', 125, 45, 0.16, 0.22, { lp: 420, atk: 0.002, wet: 0.15 });
    noise(0.12, 0.13, 'bandpass', 1500, 1.2, { wet: 0.3 });
    metal(rand(250, 320), 0.05, 0.6, { wet: 0.5 });
    for (let i = 0; i < 4; i++) noise(0.02, 0.035, 'bandpass', rand(2000, 3200), 3, { t0: 0.05 + i * rand(0.04, 0.07), pan: rand(-0.3, 0.3) });
  }
  function hitSound(kind) {
    if (kind === 'steam') {
      noise(0.7, 0.22, 'highpass', 2400, 0.6, { atk: 0.01, hold: 0.15, wet: 0.3 });
      noise(0.5, 0.12, 'bandpass', 1100, 0.8, { atk: 0.01, f1: 700, wet: 0.3 });
      grunt(0.04, 0.05);
    } else if (kind === 'drip') {
      noise(0.16, 0.13, 'bandpass', 1800, 1.1, { wet: 0.25 });                    // splat
      noise(0.5, 0.06, 'highpass', 5200, 0.7, { t0: 0.03, atk: 0.02, wet: 0.2 });   // hot wort sizzles
      drip(0, 0.05, 0);
      grunt(0.05, 0.04);
    } else {
      // block (sack / crate), pipe or a falling sack: body thud, then what it is made of
      osc('sine', 110, 42, 0.26, 0.3, { lp: 380, atk: 0.002, wet: 0.2 });
      noise(0.16, 0.2, 'lowpass', 500, 0.8, { brown: true, wet: 0.2 });
      if (kind === 'pipe') metal(rand(170, 220), 0.08, 1.0, { t0: 0.005, wet: 0.5 });          // the pipe rings
      else noise(0.22, 0.07, 'bandpass', 850, 0.9, { t0: 0.02, atk: 0.01, wet: 0.2 });         // burlap / wood
      footstep(0.16, 0.9); footstep(0.31, 0.7);                                                 // stumbling steps
      grunt(0.03, 0.06);
    }
  }
  function holeSound() {
    noise(1.0, 0.13, 'bandpass', 1800, 0.9, { f1: 260, atk: 0.05, wet: 0.35 });   // wind of the fall
    grunt(0, 0.05);
    // far below: the floor, a bucket, the echo
    osc('sine', 90, 40, 0.3, 0.14, { t0: 0.85, lp: 260, wet: 0.7 });
    metal(rand(140, 180), 0.05, 1.4, { t0: 0.88, wet: 0.9 });
    noise(0.25, 0.05, 'lowpass', 600, 0.8, { t0: 0.86, brown: true, wet: 0.8 });
  }
  function respawnSound() {
    noise(0.35, 0.05, 'bandpass', 300, 1, { f1: 1300, atk: 0.12, wet: 0.2 });
    footstep(0.3, 1.1);
  }
  // a hoist lets go of a sack: pulley creak, chain rattle, then it slams onto the catwalk
  function triggerSound() {
    if (voices < MAX_VOICES - 2) {
      const T = ac.currentTime;
      const c = ac.createOscillator(); c.type = 'sawtooth';
      c.frequency.setValueAtTime(rand(240, 280), T); c.frequency.linearRampToValueAtTime(rand(330, 380), T + 0.4);
      const bp = biquad('bandpass', 1500, 8);
      const g = gain(0); env(g, T, 0.04, 0.035, 0.45, 0.2);
      c.connect(bp); bp.connect(g); out(g, busSfx, 0, 0.5);
      c.start(T); voiceStart(c, T + 0.5);
    }
    for (let i = 0; i < 7; i++) noise(0.018, 0.04, 'bandpass', rand(2600, 3800), 3, { t0: 0.1 + i * 0.05, wet: 0.4 });
    osc('sine', 95, 40, 0.3, 0.16, { t0: FALL_TIME, lp: 300, wet: 0.5 });
    noise(0.22, 0.08, 'bandpass', 700, 0.9, { t0: FALL_TIME, atk: 0.01, wet: 0.5 });
  }
  function engineThump() {
    // the steam engine behind the wall: a soft double "thum-thum"
    osc('sine', 56, 40, 0.24, 0.04, { lp: 180, wet: 0.35, pan: -0.4 });
    osc('sine', 50, 37, 0.2, 0.032, { t0: 0.27, lp: 180, wet: 0.35, pan: -0.4 });
  }
  function chains() {
    const pan = rand(-0.8, 0.8);
    const n = 5 + (Math.random() * 6 | 0);
    for (let i = 0; i < n; i++) noise(0.02, rand(0.012, 0.025), 'bandpass', rand(2400, 4200), 3, { t0: i * rand(0.05, 0.11), pan, wet: 0.6 });
  }
  function clank() {
    metal(rand(200, 360), rand(0.015, 0.03), rand(0.6, 1.0), { pan: rand(-0.9, 0.9), wet: 0.7 });
  }
  function heartbeat(k) {
    const v = 0.07 + 0.08 * k;
    osc('sine', 62, 38, 0.13, v, { lp: 160, atk: 0.006, wet: 0.05 });
    osc('sine', 56, 36, 0.12, v * 0.7, { t0: 0.17, lp: 160, atk: 0.006, wet: 0.05 });
  }
  function whistle(t0 = 0, dur = 0.7, vol = 0.07) {
    // a factory steam whistle: two slightly detuned pipes + breathy steam
    for (const [f, a] of [[720, 1], [905, 0.6]]) osc('triangle', f * 0.97, f, dur, vol * a, { t0, atk: 0.05, hold: dur * 0.5, lp: 2600, wet: 0.5 });
    noise(dur, vol * 0.5, 'bandpass', 1900, 1.2, { t0, atk: 0.04, hold: dur * 0.5, wet: 0.4 });
  }
  function countdownTick(n) {
    if (n > 0) {
      osc('sine', 880, 880, 0.11, 0.22, { atk: 0.003 });
      noise(0.02, 0.1, 'highpass', 4000, 0.7);
    } else whistle(0, 0.6, 0.08);
  }
  function brass(midi, t0, dur, vol) {
    if (voices > MAX_VOICES) return;
    const f = mtof(midi);
    const T = ac.currentTime + t0;
    const lp = biquad('lowpass', f * 1.2, 0.8);
    lp.frequency.setValueAtTime(f * 1.2, T);
    lp.frequency.linearRampToValueAtTime(f * 5, T + 0.07);
    lp.frequency.exponentialRampToValueAtTime(f * 2.6, T + dur);
    const g = gain(0);
    g.gain.setValueAtTime(0.0001, T);
    g.gain.linearRampToValueAtTime(vol, T + 0.035);
    g.gain.setValueAtTime(vol * 0.85, T + Math.max(0.05, dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, T + dur + 0.05);
    lp.connect(g); out(g, busSfx, 0, 0.3);
    for (const cents of [-7, 6]) {
      const s = ac.createOscillator(); s.type = 'sawtooth'; s.frequency.value = f; s.detune.value = cents;
      s.connect(lp); s.start(T); voiceStart(s, T + dur + 0.1);
    }
  }
  function finishSound() {
    // the big valve wheel squeals round, the steam lets go with a long falling hiss, the brewery bell rings
    if (voices < MAX_VOICES - 2) {
      const T = ac.currentTime;
      const c = ac.createOscillator(); c.type = 'sawtooth';
      c.frequency.setValueAtTime(820, T); c.frequency.linearRampToValueAtTime(1180, T + 0.35); c.frequency.linearRampToValueAtTime(960, T + 0.6);
      const bp = biquad('bandpass', 2200, 9);
      const g = gain(0); env(g, T, 0.03, 0.05, 0.65, 0.35);
      c.connect(bp); bp.connect(g); out(g, busSfx, 0, 0.4);
      c.start(T); voiceStart(c, T + 0.7);
    }
    metal(300, 0.05, 0.6, { t0: 0.6, wet: 0.5 });                                                // wheel stops
    noise(2.4, 0.16, 'highpass', 2600, 0.6, { t0: 0.3, atk: 0.05, f1: 700, wet: 0.45 });          // steam release
    noise(2.0, 0.08, 'bandpass', 900, 0.7, { t0: 0.35, atk: 0.1, f1: 300, wet: 0.4 });
    bell(0.12, 1046, 0.2, 3, 0.42, 0.9);
    const b = 0.17;
    for (const [m, s, l] of [[67, 0, 1], [72, 1, 1], [76, 2, 1], [79, 3, 3]]) brass(m, 2.2 + s * b, l * b * 0.95, 0.12);
    brass(48, 2.2 + 3 * b, 3 * b, 0.09);
  }
  function failSound() {
    // boil-over: the kettle surges, foam and wort pour over the rim with a roar of steam, two low notes
    noise(2.2, 0.32, 'lowpass', 180, 0.8, { brown: true, atk: 0.4, f1: 900, wet: 0.35 });
    noise(2.0, 0.16, 'highpass', 1800, 0.6, { t0: 0.3, atk: 0.15, hold: 0.6, wet: 0.45 });
    for (let i = 0; i < 18; i++) bubble(0.15 + i * 0.07 + rand(0, 0.04), 0.06, rand(-0.5, 0.5), 70, 220);
    whistle(0.2, 1.1, 0.05);
    for (const [m, t0, d] of [[55, 0.6, 0.5], [50, 1.15, 1.4]]) {
      for (const det of [1, 1.006]) osc('sawtooth', mtof(m) * det, mtof(m) * det * 0.985, d, 0.07, { t0, atk: 0.05, hold: d * 0.5, lp: 700 });
    }
  }

  // ----------------------------------------------------------------------------------------
  // events
  // ----------------------------------------------------------------------------------------
  const on = (name, fn) => events.on(name, (e) => { if (ready()) { try { fn(e || {}); } catch (err) { console.warn('[audio4]', name, err); } } });
  on('run:lane', (e) => { if (gameState === 'playing') laneSwish(e.lane); });
  on('run:jump', () => { if (gameState === 'playing') { jumpSound(); nextStep = 0; } });
  on('run:land', () => {
    if (gameState !== 'playing') return;
    landSound();
    nextStep = ac.currentTime + 0.22;
  });
  on('run:hit', (e) => hitSound(e.kind));
  on('run:hole', () => { falling = true; nextStep = 0; holeSound(); });
  on('run:trigger', () => { if (gameState === 'playing') triggerSound(); });
  on('countdown', (e) => countdownTick(e.n));
  on('finish', () => finishSound());
  on('fail', () => failSound());
  // respawn / reset are state, not sound only: track them even while the context is not running
  events.on('run:respawn', () => {
    falling = false;
    if (ready() && gameState === 'playing') { respawnSound(); nextStep = ac.currentTime + 0.45; }
  });

  // ----------------------------------------------------------------------------------------
  // per-frame (throttled to ~30 Hz; only AudioParam targets are touched, footsteps are look-ahead scheduled)
  // ----------------------------------------------------------------------------------------
  function update(dt, hud) {
    if (!ready() || !room) return;
    acc += dt;
    if (acc < 0.033) return;
    const step = Math.min(acc, 0.25); acc = 0;
    const T = ac.currentTime;
    const h = hud || {};
    const playing = gameState === 'playing';

    const maskTarget = playing ? 1 : gameState === 'countdown' ? 0.75 : gameState === 'won' ? 0.4 : gameState === 'lost' ? 0.9 : 0.45;
    liveMask += (maskTarget - liveMask) * Math.min(1, step * 2);
    const limit = h.timeLimit ?? TL;
    const rem = playing || gameState === 'paused' ? clamp(h.remaining ?? limit, 0, limit) : limit;
    const heat = playing ? clamp(1 - rem / limit, 0, 1) : gameState === 'lost' ? 1 : 0; // how close to boiling over

    // --- the hall: rumble and roll grow with the heat
    room.rumG.gain.setTargetAtTime((0.08 + 0.1 * heat) * liveMask + 0.03, T, 0.6);
    room.rumLp.frequency.setTargetAtTime(110 + 80 * heat, T, 0.8);
    room.rollG.gain.setTargetAtTime((0.015 + 0.04 * heat) * liveMask, T, 0.6);
    room.rollBp.frequency.setTargetAtTime(300 + 120 * heat, T, 0.8);
    bubbleTimer -= step;
    if (bubbleTimer <= 0) {
      bubble(0, (0.012 + 0.03 * heat) * liveMask, rand(-0.7, 0.7));
      bubbleTimer = rand(0.5, 1.5) / (3 + 9 * heat);
    }
    engineTimer -= step;
    if (engineTimer <= 0) { engineThump(); engineTimer = rand(1.1, 1.25); }
    chainTimer -= step;
    if (chainTimer <= 0) { chains(); chainTimer = rand(8, 16); }
    clankTimer -= step;
    if (clankTimer <= 0) { clank(); clankTimer = rand(7, 18); }
    dripAmbTimer -= step;
    if (dripAmbTimer <= 0) { drip(0, rand(0.008, 0.016)); dripAmbTimer = rand(1.5, 4.5); }

    // --- steam jets and drips near the runner
    const ns = playing ? clamp(h.nearSteam ?? 0, 0, 1) : 0;
    steam.stG.gain.setTargetAtTime(0.11 * ns, T, 0.06);
    steam.stBp.frequency.setTargetAtTime(3000 + 1600 * ns, T, 0.1);
    steam.roG.gain.setTargetAtTime(0.07 * ns * ns, T, 0.08);
    const nd = playing ? clamp(h.nearDrip ?? 0, 0, 1) : 0;
    if (nd > 0.05) {
      dripNearTimer -= step;
      if (dripNearTimer <= 0) { drip(0, 0.02 + 0.05 * nd, rand(-0.4, 0.4)); dripNearTimer = rand(0.6, 1.2) / (1 + 4 * nd); }
    }

    // --- pressure: whine + heartbeat in the last LOW_S seconds
    const k = playing && rem < LOW_S ? clamp(1 - rem / LOW_S, 0, 1) : 0;
    press.whG.gain.setTargetAtTime(k > 0 ? 0.008 + 0.03 * k : 0, T, 0.3);
    const wf = 280 + 640 * k;
    press.wh.frequency.setTargetAtTime(wf, T, 0.3);
    press.wh2.frequency.setTargetAtTime(wf * 1.012, T, 0.3);
    press.whBp.frequency.setTargetAtTime(wf * 1.6, T, 0.3);
    if (k > 0) {
      hbTimer -= step;
      if (hbTimer <= 0) { heartbeat(k); hbTimer = 0.9 - 0.48 * k; }
    } else hbTimer = 0;

    // --- footsteps on the grating (scheduled ~0.12 s ahead on the audio clock)
    const speed = h.speed ?? 0;
    const grounded = playing && !h.airborne && !falling && !(h.falling > 0) && speed > 0.5;
    if (!grounded) nextStep = 0;
    else {
      const interval = (STRIDE / speed) * (1 + 0.35 * clamp(h.stumble ?? 0, 0, 1));
      if (!nextStep || nextStep < T - 0.05) nextStep = T + 0.02;
      let guard = 0;
      while (nextStep < T + 0.12 && guard++ < 3) {
        const stumbling = (h.stumble ?? 0) > 0.2;
        footstep(nextStep - T, stumbling ? rand(0.7, 1.3) : 1);
        nextStep += interval * rand(0.95, 1.05);
      }
    }
  }

  return { unlock, update };
}
