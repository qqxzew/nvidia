// Procedural WebAudio for "Plzeň 1926": 4-cylinder putter engine, road rumble, ambience, one-shots.
// No audio files. Persistent graph is built once in unlock(); one-shots create a few short-lived nodes.
//
// createAudio(ctx) -> { unlock(), update(dt, truckState, game) }
// Settings (volume / mute) come from ../ui/shared.js (written by the UI) and from the events
// 'audio:volume' {value} and 'audio:mute' {muted}. Throttle for the engine is read from shared input.
import { input, settings } from '../ui/shared.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const MAX_SPEED = 15.5;
const MAX_VOICES = 28;

// per-zone mix: road roughness (rumble), gravel crunch, city murmur, birdsong
const ZONES = {
  square: { rough: 0.95, grav: 0.08, mur: 1.0, bird: 0.0 },
  town: { rough: 0.9, grav: 0.08, mur: 0.8, bird: 0.0 },
  suburb: { rough: 0.5, grav: 0.25, mur: 0.2, bird: 0.55 },
  field: { rough: 0.3, grav: 1.0, mur: 0.0, bird: 1.0 },
  brewery: { rough: 0.8, grav: 0.1, mur: 0.25, bird: 0.3 },
};

export function createAudio(ctx) {
  const { events } = ctx;

  let ac = null;
  let master, comp, busEngine, busWorld, busSfx;
  let white, brown;
  let eng = null, road = null, amb = null;
  let paused = false;
  let gameState = 'menu';
  let voices = 0;
  let acc = 0;
  let engineMask = 0;
  let birdTimer = 2, clopTimer = 6;
  let lastBump = 0, lastHorn = 0, lastKnock = 0;
  const zv = { rough: 0.9, grav: 0.1, mur: 1, bird: 0 };
  let pauseTimer = 0;
  let wantRunning = true;

  const ready = () => !!ac && ac.state === 'running' && !paused;

  // ----------------------------------------------------------------------------------------
  // helpers
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
  function out(node, dest, pan) {
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
      node.connect(p); p.connect(dest);
    } else node.connect(dest);
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

  // one oscillator voice with an exponential decay envelope
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
    out(g, o.dest || busSfx, o.pan);
    s.start(t0);
    voiceStart(s, t0 + dur + 0.05);
    return s;
  }
  // filtered noise burst
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
    out(g, o.dest || busSfx, o.pan);
    s.start(t0, rand(0, buf.duration - dur - 0.1));
    voiceStart(s, t0 + dur + 0.05);
    return s;
  }

  // ----------------------------------------------------------------------------------------
  // persistent graph
  // ----------------------------------------------------------------------------------------
  function pulseWave(duty, n = 40) {
    const real = new Float32Array(n + 1), imag = new Float32Array(n + 1);
    for (let k = 1; k <= n; k++) {
      real[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI);
      imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI);
    }
    return ac.createPeriodicWave(real, imag);
  }

  function build() {
    makeNoiseBuffers();
    master = gain(0);
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ac.destination);
    busEngine = gain(0.6); busEngine.connect(master);
    busWorld = gain(0.85); busWorld.connect(master);
    busSfx = gain(1); busSfx.connect(master);

    // --- engine: narrow pulse train at the firing frequency (the "put-put"), a 2nd order saw and exhaust puffs
    const pulse = ac.createOscillator();
    pulse.setPeriodicWave(pulseWave(0.16));
    pulse.frequency.value = 14;
    const saw = ac.createOscillator();
    saw.type = 'sawtooth'; saw.frequency.value = 28;
    const lp1 = biquad('lowpass', 500, 0.9), lp2 = biquad('lowpass', 420, 0.7);
    const g1 = gain(0.3), g2 = gain(0.05);
    pulse.connect(lp1); lp1.connect(g1);
    saw.connect(lp2); lp2.connect(g2);
    const puffNoise = loopSrc(white);
    const puffBp = biquad('bandpass', 320, 1.1);
    const puffG = gain(0.03);
    puffNoise.connect(puffBp); puffBp.connect(puffG);
    const puffDepth = gain(0.1); // pulse -> noise gain: exhaust puffs in sync with the firing
    pulse.connect(puffDepth); puffDepth.connect(puffG.gain);
    // body knock (mechanical clatter, rises with revs)
    const clatter = loopSrc(white);
    const clBp = biquad('bandpass', 1500, 2);
    const clG = gain(0);
    clatter.connect(clBp); clBp.connect(clG);
    const clDepth = gain(0.06);
    pulse.connect(clDepth); clDepth.connect(clG.gain); // mechanical tick in sync with the firing
    const engOut = gain(0);
    g1.connect(engOut); g2.connect(engOut); puffG.connect(engOut); clG.connect(engOut);
    engOut.connect(busEngine);
    pulse.start(); saw.start();
    eng = { pulse, saw, lp1, lp2, g1, g2, puffG, clG, engOut, fire: 14 };

    // --- road: brown noise rumble with cobble rhythm + gravel crunch
    const rumble = loopSrc(brown);
    const rLp = biquad('lowpass', 300, 0.7);
    const rG = gain(0);
    rumble.connect(rLp); rLp.connect(rG); rG.connect(busWorld);
    const cobLfo = ac.createOscillator();
    cobLfo.type = 'sine'; cobLfo.frequency.value = 6;
    const cobDepth = gain(0);
    cobLfo.connect(cobDepth); cobDepth.connect(rG.gain);
    cobLfo.start();
    const crunch = loopSrc(white);
    const cBp = biquad('bandpass', 2200, 0.7);
    const cG = gain(0);
    crunch.connect(cBp); cBp.connect(cG); cG.connect(busWorld);
    const clack = loopSrc(white); // cobble clatter (highs, speed-amplitude-modulated by the same LFO)
    const kBp = biquad('bandpass', 900, 1.2);
    const kG = gain(0);
    clack.connect(kBp); kBp.connect(kG); kG.connect(busWorld);
    const kDepth = gain(0);
    cobLfo.connect(kDepth); kDepth.connect(kG.gain);
    road = { rLp, rG, cobLfo, cobDepth, cG, kG, kDepth };

    // --- ambience: city murmur
    const m1 = loopSrc(white), m2 = loopSrc(white);
    const m1b = biquad('bandpass', 480, 0.9), m2b = biquad('bandpass', 1250, 1.6);
    const m1g = gain(0.5), m2g = gain(0.18), mOut = gain(0);
    m1.connect(m1b); m1b.connect(m1g); m1g.connect(mOut);
    m2.connect(m2b); m2b.connect(m2g); m2g.connect(mOut);
    const mLfo = ac.createOscillator(); mLfo.frequency.value = 0.21;
    const mLfoG = gain(0.22);
    mLfo.connect(mLfoG); mLfoG.connect(m1g.gain); mLfo.start();
    const mLfo2 = ac.createOscillator(); mLfo2.frequency.value = 0.37;
    const mLfo2G = gain(0.1);
    mLfo2.connect(mLfo2G); mLfo2G.connect(m2g.gain); mLfo2.start();
    mOut.connect(busWorld);
    // field wind
    const wind = loopSrc(brown);
    const wLp = biquad('lowpass', 500, 0.5);
    const wG = gain(0);
    wind.connect(wLp); wLp.connect(wG); wG.connect(busWorld);
    amb = { mOut, wG };

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
        // iOS: a silent buffer started inside the gesture fully unlocks output
        const b = ac.createBuffer(1, 1, 22050); const s = ac.createBufferSource(); s.buffer = b; s.connect(ac.destination); s.start(0);
      }
      if (!paused && ac.state !== 'running') { const p = ac.resume(); p && p.catch && p.catch(() => {}); }
    } catch (e) { console.warn('[audio] unlock failed', e); }
  }
  // robust fallback: any first gesture also unlocks
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
    setPaused(state === 'paused' || state === 'level2'); // level 2 has its own audio: stay silent
  });
  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) { wantRunning = false; clearTimeout(pauseTimer); ac.suspend().catch(() => {}); }
    else { wantRunning = true; if (!paused) ac.resume().catch(() => {}); }
  });
  events.on('audio:volume', ({ value }) => { if (typeof value === 'number') settings.volume = clamp(value, 0, 1); if (ac) applyMaster(false); });
  events.on('audio:mute', ({ muted }) => { settings.muted = !!muted; if (ac) applyMaster(false); });

  // ----------------------------------------------------------------------------------------
  // one-shot recipes
  // ----------------------------------------------------------------------------------------
  function knock(vol, pitch = 250, o = {}) {
    osc('sine', pitch, pitch * 0.55, 0.13, vol, o);
    osc('triangle', pitch * 2.1, pitch * 1.3, 0.06, vol * 0.4, o);
    noise(0.03, vol * 0.7, 'bandpass', 1800, 1.5, o);
  }
  function thud(vol, low = 1, o = {}) {
    osc('sine', 125 * low, 42 * low, 0.38, vol, o);
    noise(0.14, vol * 0.8, 'lowpass', 600, 0.7, o);
    osc('triangle', 190, 110, 0.14, vol * 0.4, o);
  }
  function roll(dur, vol, o = {}) {
    if (voices > MAX_VOICES - 4) return;
    const t0 = ac.currentTime + (o.t0 || 0);
    const s = ac.createBufferSource(); s.buffer = brown;
    const lp = biquad('lowpass', 320, 0.8);
    const g = gain(0);
    env(g, t0, 0.08, vol, dur, 0.2);
    const lfo = ac.createOscillator(); lfo.frequency.setValueAtTime(9, t0); lfo.frequency.linearRampToValueAtTime(3, t0 + dur);
    const lg = gain(vol * 0.5);
    lfo.connect(lg); lg.connect(g.gain);
    s.connect(lp); lp.connect(g); out(g, busSfx, o.pan);
    s.start(t0, rand(0, brown.duration - dur - 0.1));
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
    voiceStart(s, t0 + dur + 0.05);
  }

  function bell(vol, lpHz, t0) {
    const parts = [[1, 1, 0.9], [2.76, 0.5, 0.5], [5.4, 0.25, 0.3], [8.9, 0.1, 0.15]];
    const f = 1150;
    for (const [r, a, d] of parts) osc('sine', f * r, f * r, d, vol * a, { t0, atk: 0.002, lp: lpHz });
  }
  function tramBell(distance) {
    const v = Math.pow(clamp(1 - distance / 120, 0.08, 1), 1.4) * 0.55;
    const lp = 2500 + 9000 * clamp(1 - distance / 150, 0, 1);
    for (let k = 0; k < 3; k++) bell(v, lp, k * 0.24);
  }

  function whistle(vol, t0, dur) {
    const notes = [440, 554, 659];
    for (const f of notes) {
      osc('triangle', f, f * 0.985, dur, vol / 2.2, { t0, atk: 0.1, hold: Math.max(0, dur - 0.5) });
    }
    noise(dur, vol * 0.18, 'bandpass', 2800, 2, { t0, atk: 0.1, hold: Math.max(0, dur - 0.5) });
  }
  function trainWhistle(distance) {
    const v = Math.pow(clamp(1 - distance / 400, 0.1, 1), 1.2) * 0.5;
    whistle(v, 0, 0.45);
    whistle(v, 0.6, 1.3);
  }

  // rubber-bulb "aa-oo-gah"
  function reed(f0, f1, t0, dur, vol) {
    for (const det of [0, 1.004]) {
      osc('sawtooth', f0 * (det || 1), f1 * (det || 1), dur, vol * 0.5, { t0, atk: 0.012, hold: dur * 0.6, lp: 2300, q: 1.4 });
    }
    osc('square', f0 * 0.5, f1 * 0.5, dur, vol * 0.25, { t0, atk: 0.012, hold: dur * 0.6, lp: 900 });
  }
  function horn() {
    const now = performance.now();
    if (now - lastHorn < 260) return;
    lastHorn = now;
    noise(0.12, 0.08, 'bandpass', 2600, 1.2);
    reed(370, 392, 0.0, 0.16, 0.5);
    reed(294, 277, 0.16, 0.14, 0.5);
    reed(330, 440, 0.30, 0.36, 0.55);
  }

  function brass(midi, t0, dur, vol) {
    const f = mtof(midi);
    if (voices > MAX_VOICES) return;
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
    lp.connect(g); g.connect(busSfx);
    for (const cents of [-7, 6]) {
      const s = ac.createOscillator(); s.type = 'sawtooth'; s.frequency.value = f; s.detune.value = cents;
      s.connect(lp); s.start(T); voiceStart(s, T + dur + 0.1);
    }
  }
  function finishJingle() {
    const b = 0.17;
    // melody (midi, start, length)
    const mel = [[67, 0, 1], [72, 1, 1], [76, 2, 1], [79, 3, 2], [76, 5, 1], [79, 6, 1], [84, 7, 5]];
    for (const [m, s, l] of mel) brass(m, s * b, l * b * 0.95, 0.2);
    // oom-pah bass + final chord
    const bass = [[48, 0], [55, 2], [48, 4], [55, 6]];
    for (const [m, s] of bass) osc('triangle', mtof(m), mtof(m), 0.28, 0.3, { t0: s * b, atk: 0.01, lp: 700 });
    for (const m of [72, 76, 79]) brass(m, 7 * b, 5 * b, 0.12);
    brass(60, 7 * b, 5 * b, 0.14);
    // cymbal-ish shimmer
    noise(0.8, 0.07, 'highpass', 6000, 0.7, { t0: 7 * b });
  }

  function trombone(f0, f1, t0, dur, vol, vib) {
    if (voices > MAX_VOICES) return;
    const T = ac.currentTime + t0;
    const lp = biquad('lowpass', 420, 1.2);
    lp.frequency.setValueAtTime(380, T);
    lp.frequency.linearRampToValueAtTime(1100, T + dur * 0.35);
    lp.frequency.linearRampToValueAtTime(450, T + dur);
    const g = gain(0);
    g.gain.setValueAtTime(0.0001, T);
    g.gain.linearRampToValueAtTime(vol, T + 0.05);
    g.gain.setValueAtTime(vol, T + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, T + dur + 0.05);
    lp.connect(g); g.connect(busSfx);
    for (const cents of [-6, 5]) {
      const s = ac.createOscillator(); s.type = 'sawtooth'; s.detune.value = cents;
      s.frequency.setValueAtTime(f0, T);
      if (f1 !== f0) s.frequency.exponentialRampToValueAtTime(f1, T + dur);
      s.connect(lp);
      if (vib) {
        const l = ac.createOscillator(); l.frequency.value = 5.5;
        const lg = gain(f0 * 0.012); l.connect(lg); lg.connect(s.frequency); l.start(T + dur * 0.4); l.stop(T + dur + 0.1);
      }
      s.start(T); voiceStart(s, T + dur + 0.1);
    }
  }
  function failTrombone() {
    trombone(mtof(58), mtof(58), 0.0, 0.38, 0.22, false);
    trombone(mtof(57), mtof(57), 0.42, 0.38, 0.22, false);
    trombone(mtof(56), mtof(56), 0.84, 0.38, 0.22, false);
    trombone(mtof(55), mtof(53.6), 1.28, 1.3, 0.24, true);
  }

  function crunch(strength, kind) {
    const s = clamp(strength, 0, 1);
    const v = 0.3 + 0.6 * s;
    if (kind === 'tram') {
      osc('square', 210, 205, 0.5, v * 0.25, { lp: 2400 });
      osc('square', 317, 310, 0.4, v * 0.2, { lp: 2400 });
    }
    noise(0.1 + 0.25 * s, v, 'bandpass', 1100, 0.6, { f1: 320 });
    osc('sine', 95, 38, 0.3, v * 0.9);
    if (kind === 'cart' || kind === 'obstacle' || s > 0.55) { knock(v * 0.5, 190); knock(v * 0.4, 150, { t0: 0.07 }); }
    if (s > 0.6) noise(0.12, v * 0.3, 'highpass', 3000, 0.7, { t0: 0.02 });
  }
  function bump(strength) {
    const t = performance.now();
    if (t - lastBump < 90) return;
    lastBump = t;
    const s = clamp(strength, 0, 1);
    osc('sine', 78, 42, 0.16, 0.18 + 0.5 * s);
    noise(0.07, 0.12 + 0.3 * s, 'lowpass', 450, 0.7);
  }
  function countdownTick(n) {
    if (n > 0) {
      osc('sine', 880, 880, 0.11, 0.28, { atk: 0.003 });
      noise(0.02, 0.12, 'highpass', 4000, 0.7);
    } else {
      osc('triangle', 660, 660, 0.55, 0.28, { atk: 0.008, hold: 0.2 });
      osc('sine', 1320, 1320, 0.5, 0.2, { atk: 0.008, hold: 0.15 });
      osc('triangle', 990, 990, 0.5, 0.15, { atk: 0.008, hold: 0.15 });
    }
  }

  // ambience one-shots
  function chirpPhrase() {
    if (voices > MAX_VOICES - 6) return;
    const T = ac.currentTime + 0.02;
    const pan = rand(-0.9, 0.9);
    const base = rand(2300, 4200);
    const notes = 2 + Math.floor(Math.random() * 4);
    const level = 0.035 * (0.35 + zv.bird);
    const s = ac.createOscillator(); s.type = 'sine';
    const g = gain(0);
    s.connect(g); out(g, busWorld, pan);
    let t = T;
    g.gain.setValueAtTime(0.0001, T);
    for (let i = 0; i < notes; i++) {
      const f = base * (1 + rand(-0.2, 0.25));
      s.frequency.setValueAtTime(f, t);
      s.frequency.exponentialRampToValueAtTime(f * rand(1.1, 1.45), t + 0.05);
      g.gain.linearRampToValueAtTime(level, t + 0.012);
      g.gain.linearRampToValueAtTime(0.0001, t + 0.07);
      t += rand(0.08, 0.14);
    }
    s.start(T); voiceStart(s, t + 0.1);
  }
  function horseTrot() {
    if (voices > MAX_VOICES - 10) return;
    const pan = rand(-0.8, 0.8);
    const hits = 6 + Math.floor(Math.random() * 6);
    const vol = rand(0.05, 0.1);
    let t = 0;
    for (let i = 0; i < hits; i++) {
      const hi = i % 2 === 0;
      noise(0.05, vol, 'bandpass', hi ? 1400 : 1000, 2.2, { t0: t, dest: busWorld, pan, atk: 0.002 });
      osc('sine', hi ? 330 : 260, hi ? 200 : 160, 0.06, vol * 0.7, { t0: t, dest: busWorld, pan, atk: 0.002 });
      t += i % 2 === 0 ? 0.16 : 0.2;
    }
  }

  // ----------------------------------------------------------------------------------------
  // events
  // ----------------------------------------------------------------------------------------
  const on = (name, fn) => events.on(name, (e) => { if (ready()) { try { fn(e || {}); } catch (err) { console.warn('[audio]', name, err); } } });

  on('barrel:wobble', (e) => {
    const t = performance.now();
    if (t - lastKnock < 120) return;
    lastKnock = t;
    knock(0.22, rand(210, 300));
  });
  on('barrel:lost', () => { thud(0.55, 1); roll(2.2, 0.35); knock(0.3, 170, { t0: 0.12 }); });
  on('barrel:land', (e) => {
    const s = clamp(e.strength ?? 0.5, 0, 1);
    thud(0.2 + 0.5 * s, 0.9 + 0.3 * s);
    roll(0.6 + 1.2 * s, 0.12 + 0.2 * s, { t0: 0.1 });
  });
  on('impact', (e) => crunch(e.strength ?? 0.5, e.kind));
  on('bump', (e) => bump(e.strength ?? 0.3));
  on('tram:bell', (e) => tramBell(e.distance ?? 40));
  on('train:whistle', (e) => trainWhistle(e.distance ?? 150));
  on('horn', horn);
  on('countdown', (e) => countdownTick(e.n));
  on('finish', () => finishJingle());
  on('fail', () => failTrombone());

  // ----------------------------------------------------------------------------------------
  // per-frame (throttled to ~30 Hz; only AudioParam targets are touched)
  // ----------------------------------------------------------------------------------------
  function update(dt, st) {
    if (!ready() || !eng) return;
    acc += dt;
    if (acc < 0.033) return;
    const step = acc; acc = 0;
    const T = ac.currentTime;

    const live = gameState === 'playing' || gameState === 'countdown';
    const maskTarget = live ? 1 : gameState === 'menu' ? 0 : 0.25;
    engineMask += (maskTarget - engineMask) * Math.min(1, step * 2.5);

    const spd = Math.abs(st?.speed || 0);
    const s = clamp(spd / MAX_SPEED, 0, 1);
    let thr = live ? input.throttle : 0;
    if (!thr && live && (st?.longAcc || 0) > 0.8) thr = 0.6; // fallback: infer from acceleration
    const r = Math.pow(s, 0.8) * 0.8 + thr * 0.2;

    // engine
    const jitter = 1 + (Math.random() - 0.5) * (0.1 - 0.07 * s);
    const fire = clamp((13 + 42 * r) * jitter, 11, 62);
    eng.pulse.frequency.setTargetAtTime(fire, T, 0.07);
    eng.saw.frequency.setTargetAtTime(fire * 2, T, 0.07);
    const cutoff = 360 + 950 * r + 450 * thr;
    eng.lp1.frequency.setTargetAtTime(cutoff, T, 0.08);
    eng.lp2.frequency.setTargetAtTime(cutoff * 0.8, T, 0.08);
    eng.g1.gain.setTargetAtTime(0.3 + 0.18 * r + 0.1 * thr, T, 0.08);
    eng.g2.gain.setTargetAtTime(0.05 + 0.08 * r, T, 0.08);
    eng.puffG.gain.setTargetAtTime(0.03 + 0.05 * r + 0.05 * thr, T, 0.08);
    eng.clG.gain.setTargetAtTime(0.02 + 0.05 * r, T, 0.1);
    eng.engOut.gain.setTargetAtTime(engineMask * (0.45 + 0.3 * r + 0.15 * thr), T, 0.1);

    // zone cross-fade
    const z = ZONES[st?.zone] || ZONES.square;
    const k = Math.min(1, step * 1.2);
    zv.rough += (z.rough - zv.rough) * k;
    zv.grav += (z.grav - zv.grav) * k;
    zv.mur += (z.mur - zv.mur) * k;
    zv.bird += (z.bird - zv.bird) * k;

    // road
    const roadMask = live ? 1 : gameState === 'menu' ? 0 : s > 0.05 ? 0.6 : 0;
    const A = zv.rough * Math.pow(s, 1.1) * 0.5 * roadMask;
    road.rLp.frequency.setTargetAtTime(200 + 450 * s, T, 0.1);
    road.rG.gain.setTargetAtTime(A * 0.65, T, 0.1);
    road.cobDepth.gain.setTargetAtTime(A * 0.3, T, 0.1);
    road.cobLfo.frequency.setTargetAtTime(3 + 15 * s, T, 0.1);
    road.cG.gain.setTargetAtTime(zv.grav * Math.pow(s, 0.9) * 0.1 * roadMask, T, 0.1);
    road.kG.gain.setTargetAtTime(zv.rough * s * 0.05 * roadMask, T, 0.1);
    road.kDepth.gain.setTargetAtTime(zv.rough * s * 0.045 * roadMask, T, 0.1);

    // ambience
    amb.mOut.gain.setTargetAtTime(zv.mur * 0.2, T, 0.25);
    amb.wG.gain.setTargetAtTime(zv.bird * 0.05, T, 0.4);

    if (zv.bird > 0.08) {
      birdTimer -= step;
      if (birdTimer <= 0) { chirpPhrase(); birdTimer = rand(0.9, 3.8) / (0.35 + zv.bird); }
    }
    if (zv.mur > 0.45) {
      clopTimer -= step;
      if (clopTimer <= 0) { horseTrot(); clopTimer = rand(7, 16); }
    }
  }

  return { unlock, update };
}
