// Level 2 audio: procedural WebAudio with its OWN AudioContext (created/resumed on a user gesture).
// Cellar ambience (room tone, distant hum, water drips), footsteps on wet stone, barrel rolling rumble with hoop
// rattle, bumps, rat squeaks and patter, bite sting, delivery thunk, win / fail jingles. No files, kept quiet.
//
// createAudio2(ctx2) -> { unlock(), update(dt, s) }
//   s = { state, playerSpeed, pushing, barrelRoll, ratDist }
// Events (ctx2.events): state, countdown, barrel:bump, barrel:delivered, rat:bite, rat:squeak, finish, fail,
//                       audio:volume {value}, audio:mute {muted}.  Settings come from ../ui/shared.js.
import { settings } from '../ui/shared.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MAX_VOICES = 30;

export function createAudio2(ctx2) {
  const { events } = ctx2;

  let ac = null;
  let master, comp, busAmb, busSfx, rvIn;
  let white, brown;
  let roll = null;
  let state = 'off';
  let voices = 0;
  let acc = 0;
  let dripT = 1.5, stepT = 0, stepSide = 1, pattT = 0, pattBurst = 0, pauseTimer = 0;
  let lastBump = 0, lastSqueak = 0;
  let pushing = false;

  const silent = () => state === 'off' || state === 'paused';
  const ready = () => !!ac && ac.state === 'running' && !silent();

  // ----------------------------------------------------------------------------------------
  // helpers
  // ----------------------------------------------------------------------------------------
  function makeBuffers() {
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
  // route a node to a bus (optionally panned) plus an optional reverb send
  function out(node, dest, pan, send = 0) {
    let n = node;
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
      node.connect(p); n = p;
    }
    n.connect(dest);
    if (send > 0) { const sg = gain(send); n.connect(sg); sg.connect(rvIn); }
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
    out(g, o.dest || busSfx, o.pan, o.send);
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
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    const g = gain(0);
    env(g, t0, o.atk ?? 0.003, vol, dur, o.hold || 0);
    s.connect(f); f.connect(g);
    out(g, o.dest || busSfx, o.pan, o.send);
    s.start(t0, rand(0, buf.duration - dur - 0.1));
    voiceStart(s, t0 + dur + 0.05);
    return s;
  }

  // ----------------------------------------------------------------------------------------
  // persistent graph
  // ----------------------------------------------------------------------------------------
  function build() {
    makeBuffers();
    master = gain(0);
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ac.destination);
    busAmb = gain(0.9); busAmb.connect(master);
    busSfx = gain(1); busSfx.connect(master);

    // stone cellar reverb: generated impulse (decaying stereo noise), darkened
    const sr = ac.sampleRate, len = Math.floor(sr * 2.1);
    const ir = ac.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += (Math.random() * 2 - 1 - lp) * 0.35;
        d[i] = lp * Math.pow(1 - i / len, 2.6);
      }
    }
    const conv = ac.createConvolver(); conv.buffer = ir;
    rvIn = gain(1);
    const rvOut = gain(0.55);
    rvIn.connect(conv); conv.connect(rvOut); rvOut.connect(master);

    // room tone: low brown noise + a faint far-off mechanical hum (two sines, slow wobble)
    const tone = loopSrc(brown);
    const tLp = biquad('lowpass', 160, 0.6);
    const tG = gain(0.22);
    tone.connect(tLp); tLp.connect(tG); tG.connect(busAmb);
    const air = loopSrc(white);
    const aBp = biquad('bandpass', 520, 0.8);
    const aG = gain(0.012);
    air.connect(aBp); aBp.connect(aG); aG.connect(busAmb);
    const airLfo = ac.createOscillator(); airLfo.frequency.value = 0.07;
    const airLfoG = gain(0.008);
    airLfo.connect(airLfoG); airLfoG.connect(aG.gain); airLfo.start();
    const hum1 = ac.createOscillator(); hum1.type = 'sine'; hum1.frequency.value = 49.6;
    const hum2 = ac.createOscillator(); hum2.type = 'sine'; hum2.frequency.value = 74.7;
    const humG = gain(0.035);
    const humLfo = ac.createOscillator(); humLfo.frequency.value = 0.11;
    const humLfoG = gain(0.015);
    humLfo.connect(humLfoG); humLfoG.connect(humG.gain);
    hum1.connect(humG); hum2.connect(humG); humG.connect(busAmb);
    hum1.start(); hum2.start(); humLfo.start();

    // barrel rolling: wooden rumble (brown noise through a moving low-pass) + iron hoop rattle
    const rum = loopSrc(brown);
    const rLp = biquad('lowpass', 140, 0.9);
    const rG = gain(0);
    rum.connect(rLp); rLp.connect(rG); rG.connect(busSfx);
    const rum2 = loopSrc(white);
    const r2Bp = biquad('bandpass', 380, 1.4);
    const r2G = gain(0);
    rum2.connect(r2Bp); r2Bp.connect(r2G); r2G.connect(busSfx);
    const rat = loopSrc(white);
    const hBp = biquad('bandpass', 2600, 3.5);
    const hG = gain(0);
    rat.connect(hBp); hBp.connect(hG); hG.connect(busSfx);
    const hLfo = ac.createOscillator(); hLfo.type = 'square'; hLfo.frequency.value = 7;
    const hLfoG = gain(0);
    hLfo.connect(hLfoG); hLfoG.connect(hG.gain); hLfo.start();
    const bLfo = ac.createOscillator(); bLfo.frequency.value = 3;
    const bLfoG = gain(0);
    bLfo.connect(bLfoG); bLfoG.connect(rG.gain); bLfo.start();
    roll = { rLp, rG, r2Bp, r2G, hBp, hG, hLfo, hLfoG, bLfo, bLfoG };

    applyMaster(true);
  }

  function masterTarget() { return settings.muted ? 0 : Math.pow(clamp(settings.volume, 0, 1), 2) * 0.9; }
  function applyMaster(instant) {
    if (!master) return;
    const target = silent() ? 0 : masterTarget();
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    if (instant) master.gain.setValueAtTime(target, t);
    else master.gain.setTargetAtTime(target, t, 0.05);
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
      if (!silent() && ac.state !== 'running') { const p = ac.resume(); p && p.catch && p.catch(() => {}); }
    } catch (e) { console.warn('[audio2] unlock failed', e); }
  }
  const gestureUnlock = () => { if (state === 'off') return; unlock(); if (ac && ac.state === 'running') removeGestureListeners(); };
  const gestureEvents = ['pointerdown', 'touchend', 'keydown', 'click'];
  function removeGestureListeners() { gestureEvents.forEach((ev) => window.removeEventListener(ev, gestureUnlock, true)); }
  gestureEvents.forEach((ev) => window.addEventListener(ev, gestureUnlock, true));

  function syncRun() {
    clearTimeout(pauseTimer);
    if (!ac) return;
    const wantSilent = silent() || document.hidden;
    if (wantSilent) {
      applyMaster(false);
      pauseTimer = setTimeout(() => { if ((silent() || document.hidden) && ac.state === 'running') ac.suspend().catch(() => {}); }, 220);
    } else {
      ac.resume().then(() => applyMaster(false), () => {});
    }
  }

  function setState(s) {
    if (s === state) return;
    const wasSilent = silent();
    state = s;
    if (silent() !== wasSilent) { if (s === 'off') resetTimers(); syncRun(); }
  }
  function resetTimers() { dripT = 1.5; stepT = 0; pattT = 0; pattBurst = 0; pushing = false; }
  events.on('state', (e) => setState(e.state));
  document.addEventListener('visibilitychange', () => syncRun());
  events.on('audio:volume', ({ value }) => { if (typeof value === 'number') settings.volume = clamp(value, 0, 1); if (ac) applyMaster(false); });
  events.on('audio:mute', ({ muted }) => { settings.muted = !!muted; if (ac) applyMaster(false); });
  events.on('push', (e) => { pushing = !!(e && e.on); });

  // ----------------------------------------------------------------------------------------
  // one-shot recipes
  // ----------------------------------------------------------------------------------------
  function drip() {
    const pan = rand(-0.85, 0.85);
    const f = rand(1100, 2600);
    const v = rand(0.035, 0.08);
    osc('sine', f, f * 1.7, 0.07, v, { atk: 0.002, pan, send: 0.9, dest: busAmb });
    osc('sine', f * 1.5, f * 2.1, 0.05, v * 0.3, { atk: 0.002, pan, send: 0.9, dest: busAmb });
    if (Math.random() < 0.3) { // a second, smaller plop
      osc('sine', f * 0.8, f * 1.3, 0.06, v * 0.55, { t0: rand(0.12, 0.3), atk: 0.002, pan, send: 0.9, dest: busAmb });
    }
  }
  function footstep(speed) {
    const v = clamp(0.07 + speed * 0.025, 0.07, 0.17);
    stepSide = -stepSide;
    const pan = stepSide * 0.08;
    const j = rand(0.9, 1.12);
    // heel on wet stone: dull knock + a thin wet slap
    osc('sine', 110 * j, 62, 0.07, v, { atk: 0.002, pan, send: 0.35 });
    noise(0.045, v * 0.9, 'bandpass', 650 * j, 1.1, { pan, send: 0.4, atk: 0.002 });
    noise(0.07, v * 0.35, 'highpass', 2800, 0.7, { pan, send: 0.5, t0: 0.012, atk: 0.003 });
    if (Math.random() < 0.18) noise(0.05, v * 0.2, 'bandpass', 4200, 2, { pan, send: 0.6, t0: 0.05 }); // a splash of a puddle
  }
  function knock(strength) {
    const s = clamp(strength, 0, 1);
    const v = 0.14 + 0.42 * s;
    const j = rand(0.9, 1.1);
    osc('sine', 170 * j, 82, 0.14, v, { atk: 0.002, send: 0.3 });
    osc('triangle', 330 * j, 190, 0.07, v * 0.45, { atk: 0.002, send: 0.3 });
    noise(0.035, v * 0.8, 'bandpass', 900, 1.4, { send: 0.3 });
    osc('sine', 1700 * j, 1650 * j, 0.1, v * 0.07 * (0.4 + s), { atk: 0.001, send: 0.5 }); // hoop
  }
  function squeak(dist, pan) {
    const v = clamp(1 - dist / 20, 0.1, 1) * 0.15;
    const n = Math.random() < 0.5 ? 2 : 3;
    let t = 0;
    for (let i = 0; i < n; i++) {
      const f = rand(2700, 3600);
      const o = osc('triangle', f, f * rand(1.15, 1.5), 0.075, v * (1 - i * 0.18), { t0: t, atk: 0.006, lp: 6200, pan, send: 0.3 });
      if (o) {
        const l = ac.createOscillator(); l.frequency.value = 38;
        const lg = gain(f * 0.04); l.connect(lg); lg.connect(o.frequency);
        const T = ac.currentTime + t;
        l.start(T); l.stop(T + 0.1);
      }
      t += rand(0.07, 0.11);
    }
  }
  function biteSting() {
    osc('sawtooth', 760, 330, 0.2, 0.18, { atk: 0.003, lp: 2300, q: 1.2 });
    osc('square', 1110, 510, 0.14, 0.07, { atk: 0.003, lp: 2600 });
    noise(0.1, 0.14, 'highpass', 3200, 0.7, { atk: 0.002 });
    osc('sine', 120, 55, 0.26, 0.28, { atk: 0.004, send: 0.3 });
  }
  function delivered() {
    // wooden thunk onto the dock, then a soft two-note chime
    osc('sine', 150, 62, 0.3, 0.42, { atk: 0.003, send: 0.35 });
    osc('triangle', 310, 170, 0.1, 0.2, { atk: 0.002, send: 0.3 });
    noise(0.12, 0.3, 'lowpass', 520, 0.8, { atk: 0.002, send: 0.3 });
    noise(0.03, 0.22, 'bandpass', 1100, 1.3);
    const c = [[mtof(76), 0.2], [mtof(83), 0.34]];
    for (const [f, t0] of c) {
      osc('sine', f, f, 0.7, 0.09, { t0, atk: 0.005, send: 0.5 });
      osc('sine', f * 2.01, f * 2.01, 0.4, 0.025, { t0, atk: 0.005, send: 0.5 });
    }
  }
  function pluck(midi, t0, dur, vol) {
    const f = mtof(midi);
    if (voices > MAX_VOICES) return;
    const T = ac.currentTime + t0;
    const lp = biquad('lowpass', f * 4, 0.8);
    lp.frequency.setValueAtTime(f * 5, T);
    lp.frequency.exponentialRampToValueAtTime(f * 1.5, T + dur);
    const g = gain(0);
    g.gain.setValueAtTime(0.0001, T);
    g.gain.linearRampToValueAtTime(vol, T + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, T + dur);
    lp.connect(g); out(g, busSfx, 0, 0.35);
    for (const [type, cents] of [['triangle', -5], ['sawtooth', 6]]) {
      const s = ac.createOscillator(); s.type = type; s.frequency.value = f; s.detune.value = cents;
      s.connect(lp); s.start(T); voiceStart(s, T + dur + 0.05);
    }
  }
  function winJingle() {
    const b = 0.16;
    [[67, 0], [72, 1], [76, 2], [79, 3], [84, 4.5]].forEach(([m, s]) => pluck(m, s * b, s === 4.5 ? 1.3 : 0.5, 0.1));
    [[48, 0], [55, 2]].forEach(([m, s]) => osc('triangle', mtof(m), mtof(m), 0.4, 0.2, { t0: s * b, atk: 0.01, lp: 700, send: 0.3 }));
    [72, 76, 79].forEach((m) => pluck(m, 4.5 * b, 1.4, 0.06));
    pluck(60, 4.5 * b, 1.6, 0.09);
  }
  function failJingle() {
    pluck(60, 0, 0.7, 0.12); pluck(56, 0.4, 0.8, 0.12); pluck(53, 0.8, 1.6, 0.13);
    osc('triangle', mtof(41), mtof(40), 1.8, 0.2, { t0: 0.8, atk: 0.04, lp: 400, send: 0.3 });
  }
  function tick(n) {
    if (n > 0) osc('sine', 660, 660, 0.09, 0.1, { atk: 0.003, send: 0.3 });
    else { osc('triangle', 990, 990, 0.35, 0.12, { atk: 0.005, send: 0.4 }); osc('sine', 1485, 1485, 0.3, 0.05, { atk: 0.005, send: 0.4 }); }
  }

  // ----------------------------------------------------------------------------------------
  // events
  // ----------------------------------------------------------------------------------------
  const on = (name, fn) => events.on(name, (e) => { if (ready()) { try { fn(e || {}); } catch (err) { console.warn('[audio2]', name, err); } } });
  on('barrel:bump', (e) => {
    const t = performance.now();
    if (t - lastBump < 110) return;
    lastBump = t;
    knock(e.strength ?? 0.5);
  });
  on('barrel:delivered', delivered);
  on('rat:bite', biteSting);
  on('rat:squeak', (e) => {
    const t = performance.now();
    if (t - lastSqueak < 250) return;
    lastSqueak = t;
    squeak(e.distance ?? 8, e.pan ?? 0);
  });
  on('countdown', (e) => tick(e.n));
  on('finish', winJingle);
  on('fail', failJingle);

  // ----------------------------------------------------------------------------------------
  // per-frame
  // ----------------------------------------------------------------------------------------
  function update(dt, s) {
    if (!ready() || !roll) return;
    s = s || {};
    if (s.state && s.state !== state && (s.state === 'off' || s.state === 'paused')) setState(s.state);
    const live = state === 'playing';
    const speed = live ? Math.max(0, s.playerSpeed || 0) : 0;

    // timers (every frame)
    dripT -= dt;
    if (dripT <= 0) { drip(); dripT = rand(0.7, 3.6); }
    if (live && speed > 0.35) {
      stepT -= dt;
      if (stepT <= 0) { footstep(speed); stepT = clamp(1.45 / (speed + 0.6), 0.3, 0.62); }
    } else stepT = Math.min(stepT, 0.05);
    const rd = live && typeof s.ratDist === 'number' ? s.ratDist : 99;
    if (rd < 6.5) {
      pattT -= dt;
      if (pattT <= 0) {
        const near = 1 - rd / 6.5;
        if (pattBurst <= 0) { pattBurst = 3 + Math.floor(Math.random() * 6); pattT = rand(0.25, 0.9); }
        else {
          pattBurst--;
          noise(0.012, 0.035 + 0.07 * near, 'bandpass', rand(3200, 5000), 2.2, { atk: 0.001, pan: rand(-0.5, 0.5), send: 0.25 });
          pattT = rand(0.035, 0.075);
        }
      }
    } else { pattBurst = 0; pattT = 0; }

    acc += dt;
    if (acc < 0.033) return;
    acc = 0;
    const T = ac.currentTime;

    // barrel roll
    const r = live ? clamp((s.barrelRoll || 0) / 3.2, 0, 1) : 0;
    const rr = Math.pow(r, 0.8);
    roll.rG.gain.setTargetAtTime(rr * 0.5, T, 0.08);
    roll.rLp.frequency.setTargetAtTime(110 + 260 * rr, T, 0.1);
    roll.r2G.gain.setTargetAtTime(rr * 0.07, T, 0.08);
    roll.r2Bp.frequency.setTargetAtTime(300 + 260 * rr, T, 0.1);
    roll.bLfo.frequency.setTargetAtTime(2.2 + 6 * rr, T, 0.1);
    roll.bLfoG.gain.setTargetAtTime(rr * 0.14, T, 0.1);
    const hBase = rr * 0.03;
    roll.hG.gain.setTargetAtTime(hBase, T, 0.1);
    roll.hLfo.frequency.setTargetAtTime(5 + 15 * rr, T, 0.1);
    roll.hLfoG.gain.setTargetAtTime(hBase * 0.9, T, 0.1);
    roll.hBp.frequency.setTargetAtTime(2200 + 900 * rr, T, 0.1);
  }

  return { unlock, update };
}
