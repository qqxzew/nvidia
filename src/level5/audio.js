// Level 5 "Šílená stáčírna" — procedural WebAudio (owner: ui). No audio files.
// Persistent graph built once in unlock(): big hall room tone (rumble, mains hum, air), conveyor roller rattle +
// motor drone (∝ hud.speed), barrels clacking over the rollers (∝ barrels on the belts × speed), distant steam
// engine thump and a compressor's slow chug.
// One-shots: switch clack (line:switch), washer spray hiss, filler gurgle + foam fizz, bung-driver mallet knocks,
// dispatch roll + distant cart, burst crack + staves + splash, reject buzzer + bell, speed-up ratchet, lift bell
// on spawn, countdown, finish jingle, fail.
//
// createAudio5(ctx) -> { unlock(), update(dt, hud) }
// Settings (volume / mute) from ../ui/shared.js and the events 'audio:volume' {value} / 'audio:mute' {muted}.
import { settings } from '../ui/shared.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MAX_VOICES = 36;

export function createAudio5(ctx) {
  const { events, layout } = ctx;
  const LINE = ctx.lineCfg || {};
  // stereo positions from the world X of things (camera looks from +Z, X maps to pan)
  const halfW = Math.max(6, ((layout?.room?.maxX ?? 10) - (layout?.room?.minX ?? -10)) / 2);
  const panX = (x) => clamp((x || 0) / halfW, -0.9, 0.9);
  const PAN = {};
  const SW_PAN = {};
  for (const s of layout?.switches || []) { PAN[s.id] = panX(s.station?.x); SW_PAN[s.id] = panX(s.points?.[0]?.[0]); }
  const PAN_LIFT = panX(layout?.entry?.lift?.x ?? -9);

  let ac = null;
  let master, comp, busWorld, busSfx, verbSend;
  let white, brown;
  let room = null, belt = null;
  let paused = false;
  let gameState = 'menu';
  let voices = 0;
  let acc = 0;
  let pauseTimer = 0;
  let liveMask = 0;
  let lastLift = 0;
  let clackTimer = 0, engineTimer = 1, chugTimer = 4, clankTimer = 8, hissTimer = 6;

  const ready = () => !!ac && ac.state === 'running' && !paused;

  // ----------------------------------------------------------------------------------------
  // helpers (same toolkit as level 4)
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
    if (o.lp) { const f = biquad('lowpass', o.lp, o.q || 0.7); s.connect(f); f.connect(g); } else s.connect(g);
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

  // a short synthetic reverb: the big racking hall on the ground floor (bare brick, tiles, high ceiling)
  function makeVerb() {
    const sr = ac.sampleRate, len = Math.floor(sr * 2.0);
    const ir = ac.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) { const x = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, 3.4) * (i < sr * 0.015 ? i / (sr * 0.015) : 1); }
    }
    const cv = ac.createConvolver(); cv.buffer = ir;
    const pre = biquad('lowpass', 3400, 0.5);
    const hp = biquad('highpass', 170, 0.5);
    const ret = gain(0.3);
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

    // --- room tone: deep rumble of the building, faint mains hum of the lamps, airy hall noise
    const rum = loopSrc(brown);
    const rumLp = biquad('lowpass', 110, 0.6);
    const rumG = gain(0.14);
    rum.connect(rumLp); rumLp.connect(rumG); rumG.connect(busWorld);
    const hum = ac.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 50;
    const humLp = biquad('lowpass', 240, 0.6);
    const humG = gain(0.007);
    hum.connect(humLp); humLp.connect(humG); humG.connect(busWorld); hum.start();
    const air = loopSrc(white);
    const airBp = biquad('bandpass', 650, 0.4);
    const airG = gain(0.01);
    air.connect(airBp); airBp.connect(airG); airG.connect(busWorld);
    const airLfo = ac.createOscillator(); airLfo.frequency.value = 0.06;
    const airLfoG = gain(0.005); airLfo.connect(airLfoG); airLfoG.connect(airG.gain); airLfo.start();
    room = { rumG };

    // --- conveyor: roller rattle (band noise chopped at the roller rate) + motor/chain drone + belt rumble
    const rat = loopSrc(white);
    const ratBp = biquad('bandpass', 1100, 0.9);
    const ratG = gain(0);          // overall rattle level
    const ratAm = gain(0.5);       // AM by the roller "tick" LFO
    const ratLfo = ac.createOscillator(); ratLfo.type = 'square'; ratLfo.frequency.value = 12;
    const ratLfoG = gain(0.45); ratLfo.connect(ratLfoG); ratLfoG.connect(ratAm.gain); ratLfo.start();
    rat.connect(ratBp); ratBp.connect(ratAm); ratAm.connect(ratG);
    const rumB = loopSrc(brown);
    const rumBLp = biquad('lowpass', 160, 0.8);
    const rumBG = gain(0);
    rumB.connect(rumBLp); rumBLp.connect(rumBG);
    const motor = ac.createOscillator(); motor.type = 'sawtooth'; motor.frequency.value = 70;
    const motorLp = biquad('lowpass', 300, 1.2);
    const motorG = gain(0);
    motor.connect(motorLp); motorLp.connect(motorG); motor.start();
    const beltOut = gain(1);
    ratG.connect(beltOut); rumBG.connect(beltOut); motorG.connect(beltOut);
    out(beltOut, busWorld, 0, 0.18);
    belt = { ratBp, ratG, ratLfo, rumBG, rumBLp, motor, motorG, motorLp };

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
    } catch (e) { console.warn('[audio5] unlock failed', e); }
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
      ac.resume().then(() => applyMaster(false), () => {});
    }
  }

  events.on('state', ({ state }) => {
    gameState = state;
    setPaused(state === 'paused');
    if (state === 'countdown' || state === 'menu') lastLift = 0;
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
  function bell(vol = 0.1, f = 1320, pan = 0, strikes = 1) {
    const parts = [[1, 1, 1.3], [2.0, 0.35, 0.9], [2.76, 0.4, 0.7], [5.4, 0.15, 0.35]];
    for (let k = 0; k < strikes; k++) {
      const t0 = k * 0.3;
      for (const [r, a, d] of parts) osc('sine', f * r, f * r, d, vol * a, { t0, atk: 0.002, pan, wet: 0.45 });
      noise(0.015, vol * 0.4, 'highpass', 5000, 0.7, { t0, pan });
    }
  }
  function drip(t0 = 0, vol = 0.02, pan = rand(-0.8, 0.8)) {
    const f = rand(900, 1600);
    osc('sine', f, f * rand(1.5, 2.1), 0.05, vol, { t0, pan, atk: 0.002, wet: 0.5 });
  }
  function bubble(t0 = 0, vol = 0.03, pan = 0, lo = 160, hi = 420) {
    const f = rand(lo, hi);
    osc('sine', f, f * rand(1.6, 2.4), rand(0.03, 0.07), vol, { t0, lp: 1800, pan: pan + rand(-0.08, 0.08), atk: 0.003, wet: 0.15 });
  }

  // the switch flap: a solid iron clack (higher when it opens the branch) + the lever thunk
  function switchClack(id, on) {
    const pan = SW_PAN[id] ?? 0;
    metal(on ? rand(520, 560) : rand(400, 430), 0.07, 0.22, { pan, wet: 0.3 });
    noise(0.05, 0.16, 'bandpass', on ? 1800 : 1300, 1.6, { pan, wet: 0.2 });
    osc('sine', on ? 150 : 120, 60, 0.08, 0.14, { pan, lp: 600 });
    noise(0.04, 0.05, 'highpass', 3500, 0.8, { t0: 0.05, pan }); // latch
  }
  // washer: a hot-water spray hiss with a splashy band and a few drips
  function washSound() {
    const pan = PAN.wash ?? -0.2;
    noise(1.1, 0.07, 'highpass', 2600, 0.6, { pan, atk: 0.08, hold: 0.5, wet: 0.35 });
    noise(1.0, 0.06, 'bandpass', 1200, 0.9, { pan, atk: 0.1, hold: 0.4, f1: 900, wet: 0.3 });
    osc('sine', 90, 70, 0.6, 0.03, { pan, lp: 200, atk: 0.1 }); // pump
    for (let i = 0; i < 4; i++) drip(1.0 + i * rand(0.08, 0.16), 0.022, pan);
  }
  // filler: the brass nozzle opens, beer gurgles into the barrel (pitch rising as it fills), foam fizzes
  function fillSound() {
    const pan = PAN.fill ?? 0.6;
    osc('sine', 300, 300, 0.05, 0.03, { pan, atk: 0.002 }); metal(880, 0.025, 0.15, { pan }); // valve
    noise(1.4, 0.09, 'lowpass', 260, 0.9, { pan, brown: true, atk: 0.12, hold: 0.7, f1: 520, wet: 0.2 });
    for (let i = 0; i < 14; i++) bubble(0.1 + i * 0.09 + rand(0, 0.04), 0.03, pan, 140 + i * 18, 260 + i * 28);
    noise(0.9, 0.035, 'highpass', 4500, 0.7, { t0: 1.2, pan, atk: 0.08, wet: 0.2 }); // foam fizz
  }
  // bung driver: a wooden mallet drives the bung, two light taps and one hard knock
  function knock(t0, vol, pan) {
    osc('sine', rand(210, 240), 95, 0.09, vol, { t0, pan, atk: 0.001, wet: 0.35 });
    noise(0.03, vol * 0.8, 'bandpass', rand(700, 900), 2.2, { t0, pan, wet: 0.3 });
    osc('triangle', rand(420, 470), 300, 0.05, vol * 0.25, { t0, pan, atk: 0.001 }); // hollow barrel ring
  }
  function capSound() {
    const pan = PAN.cap ?? 0.2;
    knock(0, 0.12, pan); knock(0.2, 0.12, pan); knock(0.42, 0.22, pan);
  }
  // dispatch: the barrel rolls down the ramp out of the hall, a cart creaks away outside
  function shipSound() {
    const pan = PAN.ship ?? -0.7;
    if (voices > MAX_VOICES - 4) return;
    const T = ac.currentTime;
    const s = ac.createBufferSource(); s.buffer = brown;
    const lp = biquad('lowpass', 220, 0.9);
    const g = gain(0); env(g, T, 0.08, 0.2, 1.3, 0.5);
    let n = g;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.setValueAtTime(pan * 0.5, T); p.pan.linearRampToValueAtTime(-0.95, T + 1.3); g.connect(p); n = p; }
    s.connect(lp); lp.connect(g); n.connect(busSfx);
    const w = gain(0.25); n.connect(w); w.connect(verbSend);
    s.start(T, rand(0, 1.5)); voiceStart(s, T + 1.4);
    for (let i = 0; i < 6; i++) noise(0.02, 0.05, 'bandpass', rand(900, 1500), 2, { t0: i * 0.17 + rand(0, 0.04), pan: pan - i * 0.04 }); // hoops on the slats
    // the cart outside: a wooden thump as it lands and a wheel creak
    osc('sine', 110, 55, 0.18, 0.1, { t0: 1.15, pan: -0.95, lp: 400, wet: 0.4 });
    const T2 = T + 1.4;
    if (voices < MAX_VOICES - 2) {
      const c = ac.createOscillator(); c.type = 'sawtooth';
      c.frequency.setValueAtTime(rand(300, 360), T2); c.frequency.linearRampToValueAtTime(rand(380, 440), T2 + 0.35);
      const bp = biquad('bandpass', 1400, 7);
      const cg = gain(0); env(cg, T2, 0.05, 0.02, 0.4, 0.15);
      c.connect(bp); bp.connect(cg); out(cg, busSfx, -0.95, 0.6);
      c.start(T2); voiceStart(c, T2 + 0.45);
    }
    // a small "counted" chime: the tally clerk's bell
    osc('sine', mtof(84), mtof(84), 0.35, 0.05, { t0: 0.05, wet: 0.4 });
    osc('sine', mtof(88), mtof(88), 0.45, 0.045, { t0: 0.13, wet: 0.4 });
  }
  // burst: staves crack, hoops spring, beer splashes onto the floor and fizzes
  function burstSound(x) {
    const pan = x != null ? panX(x) : (PAN.fill ?? 0.6);
    noise(0.09, 0.4, 'highpass', 900, 0.6, { pan, wet: 0.4 });
    noise(0.18, 0.3, 'bandpass', 500, 0.8, { pan, wet: 0.4 });
    osc('sine', 120, 40, 0.3, 0.3, { pan, lp: 300 });
    for (let i = 0; i < 7; i++) {
      const t0 = 0.05 + Math.pow(Math.random(), 1.5) * 0.45;
      noise(0.04, rand(0.06, 0.12), 'bandpass', rand(600, 1400), 3, { t0, pan: pan + rand(-0.15, 0.15), wet: 0.35 }); // staves
      if (i % 2 === 0) osc('triangle', rand(250, 380), rand(160, 220), 0.12, 0.05, { t0, pan });
    }
    metal(rand(300, 360), 0.06, 0.7, { t0: 0.08, pan, wet: 0.5 }); // a hoop rings off
    noise(1.0, 0.16, 'bandpass', 900, 0.8, { t0: 0.06, pan, atk: 0.04, f1: 400, wet: 0.35 }); // splash
    noise(1.6, 0.05, 'highpass', 4200, 0.7, { t0: 0.4, pan, atk: 0.2, wet: 0.2 }); // foam fizz
    for (let i = 0; i < 5; i++) drip(0.5 + i * rand(0.1, 0.25), 0.03, pan);
  }
  // reject: the foreman's buzzer and a bell — "that one is not ready"
  function rejectSound(x) {
    const pan = x != null ? panX(x) : (PAN.ship ?? -0.7);
    for (const det of [1, 1.03]) osc('square', 118 * det, 116 * det, 0.5, 0.05, { lp: 1100, atk: 0.01, hold: 0.32, pan: pan * 0.5, wet: 0.2 });
    bell(0.08, 990, pan * 0.5, 2);
    noise(0.12, 0.08, 'bandpass', 700, 1.4, { t0: 0.05, pan });
  }
  // full barrel through the washer: the beer glugs out and splashes down the drain
  function spillSound(x) {
    const pan = x != null ? panX(x) : (PAN.wash ?? -0.2);
    for (let i = 0; i < 6; i++) bubble(i * 0.12 + rand(0, 0.03), 0.05, pan, 90, 200); // glug glug
    noise(1.2, 0.1, 'bandpass', 700, 0.8, { t0: 0.1, pan, atk: 0.1, f1: 350, wet: 0.35 });
    noise(0.9, 0.04, 'highpass', 4000, 0.7, { t0: 0.3, pan, atk: 0.1, wet: 0.2 });
    osc('triangle', 330, 220, 0.4, 0.04, { t0: 0.1, lp: 900, pan }); // a small "oh no" fall
  }
  // the lift is backing up: a low double bell from the cellar, more urgent near the limit
  function liftWarn(q, max) {
    const urgent = q >= max - 1;
    bell(urgent ? 0.09 : 0.06, urgent ? 784 : 659, PAN_LIFT, urgent ? 3 : 2);
  }
  // speed up: the drive's ratchet clicks a notch higher, the motor whines briefly
  function speedSound() {
    for (let i = 0; i < 4; i++) {
      noise(0.02, 0.07, 'bandpass', 2400 + i * 200, 3, { t0: i * 0.07 });
      osc('square', 900 + i * 90, 650, 0.02, 0.01, { t0: i * 0.07, lp: 2600 });
    }
    osc('sawtooth', 120, 160, 0.5, 0.025, { t0: 0.25, lp: 500, atk: 0.1 });
  }
  // a new barrel comes up from the lager cellar: lift bell + chain rattle + the cage gate
  function spawnSound() {
    bell(0.05, 1568, PAN_LIFT, 1);
    for (let i = 0; i < 8; i++) noise(0.018, 0.035, 'bandpass', rand(2500, 3800), 3, { t0: 0.1 + i * 0.05, pan: PAN_LIFT });
    metal(rand(260, 300), 0.03, 0.4, { t0: 0.55, pan: PAN_LIFT, wet: 0.4 });
  }
  function clank() {
    metal(rand(240, 380), rand(0.02, 0.035), rand(0.5, 0.9), { pan: rand(-0.9, 0.9), wet: 0.6 });
  }
  function engineThump() {
    // the steam engine behind the wall: a soft double "thum-thum"
    osc('sine', 58, 40, 0.24, 0.035, { lp: 180, wet: 0.3, pan: 0.3 });
    osc('sine', 52, 38, 0.2, 0.028, { t0: 0.27, lp: 180, wet: 0.3, pan: 0.3 });
  }
  function compressorChug() {
    // the CO2 / air compressor for the counter-pressure filler: three slow chugs and a release hiss
    for (let i = 0; i < 3; i++) noise(0.16, 0.03, 'lowpass', 400, 0.8, { t0: i * 0.33, brown: true, pan: 0.75, atk: 0.03, wet: 0.3 });
    noise(0.6, 0.012, 'highpass', 3000, 0.6, { t0: 1.05, pan: 0.75, atk: 0.05, wet: 0.4 });
  }
  function rollerClack(level) {
    noise(0.018, rand(0.025, 0.05) * level, 'bandpass', rand(700, 1300), 2.5, { pan: rand(-0.6, 0.6), wet: 0.15 });
  }
  function countdownTick(n) {
    if (n > 0) {
      osc('sine', 880, 880, 0.11, 0.24, { atk: 0.003 });
      noise(0.02, 0.1, 'highpass', 4000, 0.7);
    } else { bell(0.2, 660, 0, 1); osc('sawtooth', 70, 90, 0.6, 0.05, { lp: 300, atk: 0.15 }); } // the line starts
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
  function finishJingle() {
    const b = 0.18;
    const mel = [[67, 0, 1], [72, 1, 1], [76, 2, 1], [79, 3, 2], [77, 5, 1], [76, 6, 1], [72, 7, 5]];
    for (const [m, s, l] of mel) brass(m, s * b, l * b * 0.95, 0.18);
    for (const [m, s] of [[48, 0], [55, 2], [48, 4], [43, 6]]) osc('triangle', mtof(m), mtof(m), 0.28, 0.28, { t0: s * b, atk: 0.01, lp: 700 });
    for (const m of [64, 67]) brass(m, 7 * b, 5 * b, 0.1);
    brass(48, 7 * b, 5 * b, 0.12);
    bell(0.12, 1320, 0, 1);
  }
  function failSound() {
    // the line grinds to a halt: motor winds down, a steam whistle falls, two low notes
    osc('sawtooth', 110, 30, 1.4, 0.06, { lp: 400, atk: 0.02 });
    noise(1.4, 0.07, 'bandpass', 1600, 3, { f1: 500, atk: 0.1 });
    for (const [m, t0, d] of [[55, 0.3, 0.5], [50, 0.85, 1.3]]) {
      for (const det of [1, 1.006]) osc('sawtooth', mtof(m) * det, mtof(m) * det * 0.985, d, 0.08, { t0, atk: 0.05, hold: d * 0.5, lp: 700 });
    }
  }

  // ----------------------------------------------------------------------------------------
  // events
  // ----------------------------------------------------------------------------------------
  const on = (name, fn) => events.on(name, (e) => { if (ready()) { try { fn(e || {}); } catch (err) { console.warn('[audio5]', name, err); } } });
  on('line:switch', (e) => switchClack(e.id, !!e.on));
  on('line:station', (e) => {
    if (e.effect === 'wash') washSound();
    else if (e.effect === 'fill') fillSound();
    else if (e.effect === 'cap') capSound();
  });
  on('line:ship', () => shipSound());
  on('line:burst', (e) => burstSound(e.x));
  on('line:reject', (e) => { if (e.where === 'cap') { knock(0, 0.2, panX(e.x ?? 2)); knock(0.12, 0.14, panX(e.x ?? 2)); } rejectSound(e.x); });
  on('line:spill', (e) => spillSound(e.x));
  on('line:lift', (e) => {
    const q = e.queue ?? 0;
    if (gameState === 'playing' && q >= 3 && q > lastLift) liftWarn(q, e.max ?? 5);
    lastLift = q;
  });
  on('line:speed', () => { if (gameState === 'playing') speedSound(); });
  on('line:spawn', () => { if (gameState === 'playing') spawnSound(); });
  on('countdown', (e) => countdownTick(e.n));
  on('finish', () => finishJingle());
  on('fail', () => failSound());

  // ----------------------------------------------------------------------------------------
  // per-frame (throttled to ~30 Hz; only AudioParam targets are touched)
  // ----------------------------------------------------------------------------------------
  function update(dt, hud) {
    if (!ready() || !belt) return;
    acc += dt;
    if (acc < 0.033) return;
    const step = Math.min(acc, 0.25); acc = 0;
    const T = ac.currentTime;
    const h = hud || {};

    // the belt runs (slowly) in the menu too; it stops only when the line is stopped (fail)
    const running = gameState === 'playing' || gameState === 'countdown' || gameState === 'menu' || gameState === 'won';
    const maskTarget = gameState === 'playing' ? 1 : gameState === 'countdown' ? 0.7 : gameState === 'lost' ? 0 : 0.35;
    liveMask += (maskTarget - liveMask) * Math.min(1, step * 2);

    const lo = h.speedStart ?? LINE.speedStart ?? 1.3, hi = h.speedMax ?? LINE.speedMax ?? 3;
    const speed = running ? (h.speed ?? lo) : 0;
    const sv = clamp((speed - lo * 0.6) / (hi - lo * 0.6), 0, 1); // 0..1 over the playable range
    const m = liveMask;
    belt.ratLfo.frequency.setTargetAtTime(Math.max(2, speed * 9), T, 0.3);   // rollers every ~11 cm
    belt.ratBp.frequency.setTargetAtTime(900 + 700 * sv, T, 0.4);
    belt.ratG.gain.setTargetAtTime((0.012 + 0.03 * sv) * m, T, 0.3);
    belt.rumBG.gain.setTargetAtTime((0.05 + 0.08 * sv) * m, T, 0.4);
    belt.rumBLp.frequency.setTargetAtTime(130 + 120 * sv, T, 0.4);
    belt.motor.frequency.setTargetAtTime(55 + 45 * sv, T, 0.4);
    belt.motorG.gain.setTargetAtTime((0.006 + 0.01 * sv) * m, T, 0.4);
    belt.motorLp.frequency.setTargetAtTime(240 + 200 * sv, T, 0.4);

    // barrels clacking over the rollers: more barrels, faster belt -> denser (capped so it never turns to noise)
    const nB = Array.isArray(h.barrels) ? h.barrels.length : 0;
    if (gameState === 'playing' && nB > 0 && speed > 0) {
      clackTimer -= step;
      const rate = Math.min(9, nB * speed * 0.55);
      if (clackTimer <= 0) { rollerClack(0.6 + 0.6 * sv); clackTimer = rand(0.5, 1.5) / rate; }
    }

    // the hall itself
    room.rumG.gain.setTargetAtTime(gameState === 'menu' ? 0.1 : 0.14, T, 0.5);
    engineTimer -= step;
    if (engineTimer <= 0) { engineThump(); engineTimer = rand(1.15, 1.3); }
    chugTimer -= step;
    if (chugTimer <= 0) { compressorChug(); chugTimer = rand(11, 19); }
    clankTimer -= step;
    if (clankTimer <= 0) { clank(); clankTimer = rand(9, 22); }
    hissTimer -= step;
    if (hissTimer <= 0) { drip(0, rand(0.008, 0.016)); hissTimer = rand(2, 6); }
  }

  return { unlock, update };
}
