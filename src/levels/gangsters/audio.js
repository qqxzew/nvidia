// Procedural WebAudio for level 3 "Gangsteři ve Světovaru": salt-loaded shotgun, glass, gangster voices,
// barrels, police at dawn and a night ambience (crickets, bulb hum, distant dog, owl, wind through
// broken windows – louder with every broken pane). No audio files; same structure as src/audio/audio.js:
// compressor -> master, buses (ambience / sfx) plus a small generated hall reverb.
//
// createAudio3(ctx) -> { unlock(), update(dt, game) }
// Settings (volume / mute) come from ../../ui/shared.js and the events 'audio:volume' / 'audio:mute'.
// Consumes: state, countdown, shot, dry, reload:start, reload:done, glass:break, gangster:appear,
//           gangster:grab, gangster:down, gangster:escape, barrel:stolen, barrel:recovered, finish, fail
import { settings } from '../../ui/shared.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const MAX_VOICES = 40;
const WINDOW_COUNT = 9;

export function createAudio3(ctx) {
  const { events, THREE, camera } = ctx;

  let ac = null;
  let master, comp, busAmb, busSfx, revIn;
  let white, brown;
  let amb = null;
  let paused = false;
  let gameState = 'menu';
  let voices = 0;
  let acc = 0;
  let ambMask = 0.6;
  let dogTimer = rand(6, 14), owlTimer = rand(14, 26), creakTimer = rand(8, 18);
  let lastDry = 0;
  let pauseTimer = 0;
  const broken = new Set();

  const ready = () => !!ac && ac.state === 'running' && !paused;

  // ----------------------------------------------------------------------------------------
  // helpers
  // ----------------------------------------------------------------------------------------
  function makeNoiseBuffers() {
    const sr = ac.sampleRate;
    white = ac.createBuffer(1, sr * 3, sr);
    let d = white.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    brown = ac.createBuffer(1, sr * 4, sr);
    d = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  }
  // short stereo impulse response: the brick brewhouse hall (~1.3 s)
  function makeHallIR() {
    const sr = ac.sampleRate;
    const len = Math.floor(sr * 1.3);
    const ir = ac.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const tt = i / sr;
        const early = tt < 0.06 && Math.random() < 0.012 ? 2.2 : 0; // a few early reflections
        d[i] = ((Math.random() * 2 - 1) + early) * Math.exp(-tt * 4.2) * (tt < 0.004 ? tt / 0.004 : 1);
      }
    }
    return ir;
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
  function out(node, dest, pan, rev) {
    let n = node;
    if (pan && ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
      node.connect(p); n = p;
    }
    n.connect(dest);
    if (rev && revIn) { const s = gain(rev); n.connect(s); s.connect(revIn); }
  }
  function env(g, t0, atk, vol, dur, hold = 0) {
    const p = g.gain;
    p.setValueAtTime(0.0001, t0);
    p.linearRampToValueAtTime(Math.max(0.0002, vol), t0 + atk);
    if (hold > 0) p.setValueAtTime(Math.max(0.0002, vol), t0 + atk + hold);
    p.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, atk + hold + 0.01));
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
    out(g, o.dest || busSfx, o.pan, o.rev);
    s.start(t0);
    voiceStart(s, t0 + dur + (o.hold || 0) + 0.05);
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
    if (o.f1) { f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur); }
    const g = gain(0);
    env(g, t0, o.atk ?? 0.003, vol, dur, o.hold || 0);
    s.connect(f); f.connect(g);
    out(g, o.dest || busSfx, o.pan, o.rev);
    s.start(t0, rand(0, Math.max(0, buf.duration - dur - (o.hold || 0) - 0.1)));
    voiceStart(s, t0 + dur + (o.hold || 0) + 0.05);
    return s;
  }

  // stereo pan of a world point relative to where the camera looks (-1 left .. +1 right)
  const tmp = THREE ? new THREE.Vector3() : null;
  function panOf(x, y, z) {
    if (!tmp || !camera || !Number.isFinite(x) || !Number.isFinite(z)) return 0;
    tmp.set(x, Number.isFinite(y) ? y : 1.6, z).applyMatrix4(camera.matrixWorldInverse);
    const d = Math.hypot(tmp.x, tmp.z) || 1;
    return clamp((tmp.x / d) * 0.85, -0.85, 0.85);
  }
  // window id -> rough pan from the hall layout (front F0..F4 by x, left/right walls)
  function panOfWindow(id) {
    if (!id || typeof id !== 'string') return rand(-0.4, 0.4);
    const n = Number(id.slice(1)) || 0;
    if (id[0] === 'F') { const x = [-7.2, -3.6, 0, 3.6, 7.2][n] ?? 0; return panOf(x, 1.5, -9); }
    if (id[0] === 'L') return panOf(-11, 1.5, n ? -1 : -5);
    if (id[0] === 'R') return panOf(11, 1.5, n ? -1 : -5);
    return 0;
  }

  // ----------------------------------------------------------------------------------------
  // persistent graph
  // ----------------------------------------------------------------------------------------
  function build() {
    makeNoiseBuffers();
    master = gain(0);
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 16; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ac.destination);
    busAmb = gain(0.9); busAmb.connect(master);
    busSfx = gain(1); busSfx.connect(master);
    try {
      const conv = ac.createConvolver();
      conv.buffer = makeHallIR();
      revIn = gain(1);
      const revOut = gain(0.32);
      revIn.connect(conv); conv.connect(revOut); revOut.connect(master);
    } catch (e) { revIn = null; }

    // --- crickets outside: two voices, each a sine carrier gated by a fast square (the chirp)
    //     and a slow sine (the phrase), lowpassed a little because they are behind the walls
    const crOut = gain(0);
    const crLp = biquad('lowpass', 5200, 0.6);
    crLp.connect(crOut); crOut.connect(busAmb);
    const crickets = [];
    for (const [f, rate, phrase, pan] of [[4350, 15.5, 0.37, -0.55], [4720, 18, 0.23, 0.6]]) {
      const car = ac.createOscillator(); car.type = 'sine'; car.frequency.value = f;
      const gate = gain(0.5);
      const sq = ac.createOscillator(); sq.type = 'square'; sq.frequency.value = rate;
      const sqG = gain(0.5); sq.connect(sqG); sqG.connect(gate.gain);
      const ph = gain(0.5);
      const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = phrase;
      const lfoG = gain(0.5); lfo.connect(lfoG); lfoG.connect(ph.gain);
      car.connect(gate); gate.connect(ph);
      out(ph, crLp, pan);
      car.start(); sq.start(); lfo.start();
      crickets.push(car);
    }

    // --- bulb hum: 100 Hz mains hum with a little buzz (50 Hz grid)
    const hum = ac.createOscillator(); hum.type = 'sine'; hum.frequency.value = 100;
    const buzz = ac.createOscillator(); buzz.type = 'sawtooth'; buzz.frequency.value = 100;
    const buzzLp = biquad('bandpass', 300, 1.5);
    const humG = gain(0.5), buzzG = gain(0.12), humOut = gain(0);
    hum.connect(humG); humG.connect(humOut);
    buzz.connect(buzzLp); buzzLp.connect(buzzG); buzzG.connect(humOut);
    humOut.connect(busAmb);
    hum.start(); buzz.start();

    // --- wind: low brown rumble + a whistling band through the broken panes
    const wind = loopSrc(brown);
    const wLp = biquad('lowpass', 380, 0.5);
    const wG = gain(0);
    wind.connect(wLp); wLp.connect(wG); wG.connect(busAmb);
    const whis = loopSrc(white);
    const whBp = biquad('bandpass', 720, 7);
    const whG = gain(0);
    whis.connect(whBp); whBp.connect(whG); whG.connect(busAmb);
    const gust = ac.createOscillator(); gust.frequency.value = 0.09;
    const gustG = gain(0); gust.connect(gustG); gustG.connect(whG.gain);
    const gustF = gain(160); gust.connect(gustF); gustF.connect(whBp.frequency);
    gust.start();
    // the brewery at night: a faint low room tone
    const room = loopSrc(brown);
    const roomLp = biquad('lowpass', 160, 0.5);
    const roomG = gain(0);
    room.connect(roomLp); roomLp.connect(roomG); roomG.connect(busAmb);

    amb = { crOut, humOut, wG, wLp, whG, gustG, roomG };
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
    } catch (e) { console.warn('[audio3] unlock failed', e); }
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
    if (state === 'countdown' || state === 'menu') broken.clear(); // new run: hall.resetGlass()
    setPaused(state === 'paused');
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
  // metal: inharmonic partials with fast decay (crowbar, gun action)
  function clank(vol, base, dur, o = {}) {
    for (const [r, a] of [[1, 1], [2.32, 0.6], [3.87, 0.4], [5.45, 0.25]]) osc('triangle', base * r, base * r * 0.995, dur / (0.6 + r * 0.25), vol * a, { ...o, atk: 0.001 });
    noise(0.025, vol * 0.9, 'bandpass', base * 3.2, 1.2, o);
  }

  // salt-loaded double-barrel: crack, boom, hall tail
  function blast(o = {}) {
    noise(0.05, 1.0, 'highpass', 1800, 0.7, { atk: 0.001 });
    noise(0.4, 0.95, 'lowpass', 7000, 0.6, { f1: 500, atk: 0.001, rev: 0.9 });
    osc('sine', 120, 34, 0.5, 1.0, { atk: 0.001 });
    osc('triangle', 70, 30, 0.35, 0.5, { atk: 0.001 });
    noise(1.1, 0.22, 'lowpass', 900, 0.6, { brown: true, t0: 0.03, f1: 200, rev: 0.6 });
    // salt grains rattling on the brick and the window frames
    for (let i = 0; i < 6; i++) noise(0.02, rand(0.03, 0.07), 'bandpass', rand(3500, 7000), 3, { t0: rand(0.08, 0.32), pan: rand(-0.6, 0.6) + (o.pan || 0) * 0.5 });
  }
  function dryClick() {
    const now = performance.now();
    if (now - lastDry < 90) return;
    lastDry = now;
    noise(0.012, 0.45, 'highpass', 3200, 0.8, { atk: 0.0005 });
    osc('square', 1900, 1500, 0.02, 0.12, { atk: 0.0005, lp: 5000 });
    noise(0.01, 0.25, 'bandpass', 2400, 2, { t0: 0.045, atk: 0.0005 });
  }
  // break-open -> shells out -> shells in -> snap shut, spread across the reload duration
  function reloadSeq(duration) {
    const d = clamp(duration || 1.3, 0.4, 4);
    clank(0.35, 620, 0.12);                                        // top lever + barrels drop open
    osc('sine', 180, 120, 0.12, 0.25, { t0: 0.02 });
    noise(0.05, 0.18, 'bandpass', 900, 1.2, { t0: 0.04 });
    for (const k of [0, 1]) {                                     // spent hulls pop out and land
      osc('triangle', 2600 + k * 230, 2300, 0.06, 0.08, { t0: d * 0.18 + k * 0.04 });
      knock(0.08, 520 + k * 60, { t0: d * 0.38 + k * 0.09, pan: 0.3 });
    }
    for (const k of [0, 1]) {                                     // fresh shells slid in
      noise(0.07, 0.2, 'bandpass', 1300, 1.5, { t0: d * (0.5 + k * 0.17), f1: 700 });
      knock(0.18, 330, { t0: d * (0.55 + k * 0.17) });
    }
    clank(0.45, 540, 0.14, { t0: d * 0.92 });                     // snap shut
    osc('sine', 150, 90, 0.1, 0.3, { t0: d * 0.92 });
  }
  function glassSmash(pan) {
    clank(0.55, 410, 0.18, { pan, rev: 0.4 });                   // the crowbar hit
    noise(0.6, 0.7, 'highpass', 2600, 0.7, { t0: 0.02, pan, rev: 0.5 });
    noise(0.25, 0.4, 'bandpass', 1500, 0.9, { t0: 0.02, pan });
    osc('sine', 160, 70, 0.18, 0.25, { t0: 0.02, pan });
    for (let i = 0; i < 9; i++) {                                 // shards ringing and falling on the sill / floor
      const f = rand(2800, 7600);
      osc('sine', f, f * rand(0.97, 1.0), rand(0.05, 0.22), rand(0.03, 0.09), { t0: rand(0.03, 0.75), pan: pan + rand(-0.15, 0.15), rev: 0.3 });
    }
  }
  // crowbar tapping the window frame: a cue that a gangster is at this window
  function crowbarTap(pan) {
    clank(0.14, 380 + rand(-30, 30), 0.1, { pan, lp: 3000, rev: 0.3 });
    clank(0.1, 380 + rand(-30, 30), 0.1, { pan, t0: rand(0.18, 0.28), lp: 3000 });
  }

  // a crude formant voice: two detuned saws through two vocal bandpasses
  function voice(pts, vol, formants, o = {}) {
    if (voices > MAX_VOICES - 4) return;
    const T = ac.currentTime + (o.t0 || 0);
    const dur = pts[pts.length - 1][0];
    const g = gain(0);
    g.gain.setValueAtTime(0.0001, T);
    g.gain.linearRampToValueAtTime(vol, T + 0.03);
    g.gain.setValueAtTime(vol, T + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, T + dur);
    const mix = gain(1);
    for (const [f, q, a] of formants) { const b = biquad('bandpass', f, q); const bg = gain(a); mix.connect(b); b.connect(bg); bg.connect(g); }
    out(g, busSfx, o.pan, o.rev ?? 0.5);
    for (const det of [-8, 9]) {
      const s = ac.createOscillator(); s.type = 'sawtooth'; s.detune.value = det;
      s.frequency.setValueAtTime(pts[0][1], T);
      for (let i = 1; i < pts.length; i++) s.frequency.linearRampToValueAtTime(pts[i][1], T + pts[i][0]);
      s.connect(mix); s.start(T); voiceStart(s, T + dur + 0.05);
    }
    if (o.breath) noise(dur, vol * 0.25, 'bandpass', 1800, 1, { t0: o.t0, pan: o.pan });
  }
  // "Auuu!" – hit by salt
  function yelp(pan, innocent) {
    const p = innocent ? 0.8 : rand(0.95, 1.2);
    voice([[0, 420 * p], [0.07, 760 * p], [0.22, 640 * p], [0.45, 330 * p]], innocent ? 0.32 : 0.38,
      [[750, 5, 1], [1150, 6, 0.6], [2600, 8, 0.25]], { pan, breath: true });
    if (innocent) {                                               // the lantern rattles
      for (let i = 0; i < 4; i++) osc('sine', rand(3000, 4200), 2900, 0.08, 0.04, { t0: 0.1 + i * 0.07, pan });
    } else {
      osc('sine', 140, 60, 0.25, 0.25, { t0: 0.35, pan });         // tumbling back out over the sill
      noise(0.2, 0.15, 'lowpass', 500, 0.7, { t0: 0.4, pan });
    }
  }
  // gruff "Hej! Dělej!" when a gangster grabs a barrel
  function shout(pan) {
    const p = rand(0.9, 1.1);
    voice([[0, 150 * p], [0.08, 210 * p], [0.22, 175 * p]], 0.3, [[620, 4, 1], [1050, 5, 0.6], [2400, 7, 0.2]], { pan });
    voice([[0, 190 * p], [0.1, 230 * p], [0.3, 150 * p]], 0.28, [[550, 4, 1], [1700, 5, 0.5], [2500, 7, 0.2]], { pan, t0: 0.28 });
  }
  // barrel dragged over the brick floor
  function scrape(dur, vol, pan, t0 = 0) {
    if (voices > MAX_VOICES - 4) return;
    const T = ac.currentTime + t0;
    const s = ac.createBufferSource(); s.buffer = brown;
    const bp = biquad('bandpass', 380, 1.2);
    const g = gain(0);
    env(g, T, 0.06, vol, dur, dur * 0.5);
    const lfo = ac.createOscillator(); lfo.frequency.setValueAtTime(rand(5, 8), T);
    const lg = gain(vol * 0.5); lfo.connect(lg); lg.connect(g.gain);
    s.connect(bp); bp.connect(g); out(g, busSfx, pan, 0.3);
    s.start(T, rand(0, brown.duration - dur - 0.2));
    lfo.start(T); lfo.stop(T + dur + 0.05);
    voiceStart(s, T + dur + 0.05);
    noise(dur * 0.8, vol * 0.25, 'bandpass', 2200, 2, { t0, pan, atk: 0.05 });
  }

  function bell(vol, f, t0, lp = 9000, pan = 0) {
    for (const [r, a, d] of [[1, 1, 0.9], [2.76, 0.5, 0.5], [5.4, 0.25, 0.3], [8.9, 0.1, 0.15]]) {
      osc('sine', f * r, f * r, d, vol * a, { t0, atk: 0.002, lp, pan });
    }
  }
  // police pea whistle: high tone with a fast rolling trill
  function policeWhistle(t0, dur, vol, pan) {
    if (voices > MAX_VOICES - 3) return;
    const T = ac.currentTime + t0;
    const s = ac.createOscillator(); s.type = 'sine'; s.frequency.value = rand(2700, 3100);
    const tr = ac.createOscillator(); tr.frequency.value = rand(26, 32);
    const trG = gain(180); tr.connect(trG); trG.connect(s.frequency);
    const g = gain(0);
    env(g, T, 0.02, vol, dur, dur * 0.75);
    s.connect(g); out(g, busSfx, pan, 0.2);
    s.start(T); tr.start(T); tr.stop(T + dur + 0.05);
    voiceStart(s, T + dur + 0.05);
    noise(dur, vol * 0.2, 'bandpass', 3000, 3, { t0, pan, atk: 0.02, hold: dur * 0.6 });
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
    lp.connect(g); g.connect(busSfx);
    for (const cents of [-7, 6]) {
      const s = ac.createOscillator(); s.type = 'sawtooth'; s.frequency.value = f; s.detune.value = cents;
      s.connect(lp); s.start(T); voiceStart(s, T + dur + 0.1);
    }
  }
  // the police arrive: whistles from the yard, the patrol car's bell, a short brass cadence
  function policeArrive() {
    policeWhistle(0.0, 0.9, 0.16, -0.5);
    policeWhistle(0.5, 0.6, 0.12, 0.6);
    policeWhistle(1.25, 1.1, 0.15, -0.2);
    for (let i = 0; i < 12; i++) bell(0.12 * (0.6 + 0.4 * (i / 11)), 1320, 0.3 + i * 0.16, 6000, 0.3);
    const b = 0.17, s0 = 2.4;
    for (const [m, st, l] of [[67, 0, 1], [72, 1, 1], [76, 2, 1], [79, 3, 3]]) brass(m, s0 + st * b, l * b * 0.95, 0.18);
    for (const m of [60, 72, 76]) brass(m, s0 + 3 * b, 3 * b, 0.1);
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
  function dogBarks() {
    const pan = rand(-0.9, 0.9);
    const n = 1 + Math.floor(Math.random() * 3);
    const vol = rand(0.05, 0.09);
    const p = rand(0.85, 1.15);
    for (let i = 0; i < n; i++) {
      const t0 = i * rand(0.32, 0.45);
      osc('sawtooth', 520 * p, 300 * p, 0.13, vol, { t0, lp: 1100, q: 2, pan, dest: busAmb, atk: 0.01 });
      noise(0.1, vol * 0.5, 'bandpass', 900, 1.5, { t0, pan, dest: busAmb });
    }
  }
  function owl() {
    const pan = rand(-0.8, 0.8);
    const f = rand(340, 400);
    const o = { pan, dest: busAmb, atk: 0.05, lp: 900 };
    osc('sine', f, f * 0.93, 0.45, 0.05, { ...o, hold: 0.15 });
    osc('sine', f * 0.93, f * 0.86, 0.35, 0.035, { ...o, t0: 0.75 });
    osc('sine', f, f * 0.9, 0.7, 0.045, { ...o, t0: 1.15, hold: 0.25 });
  }
  function creak() {
    const pan = rand(-0.7, 0.7);
    const f = rand(160, 260);
    osc('sawtooth', f, f * rand(1.2, 1.6), rand(0.4, 0.8), 0.02, { pan, dest: busAmb, lp: 900, q: 4, atk: 0.1, rev: 0.6 });
  }

  // ----------------------------------------------------------------------------------------
  // events
  // ----------------------------------------------------------------------------------------
  const on = (name, fn) => events.on(name, (e) => { if (ready()) { try { fn(e || {}); } catch (err) { console.warn('[audio3]', name, err); } } });
  // window ids by actor id, so later events (grab / down / escape) can be panned too
  const actorWin = new Map();

  on('countdown', (e) => countdownTick(e.n));
  on('shot', () => blast());
  on('dry', () => dryClick());
  on('reload:start', (e) => reloadSeq(e.duration));
  on('glass:break', (e) => glassSmash(Number.isFinite(e.x) ? panOf(e.x, e.y, e.z) : panOfWindow(e.windowId)));
  on('gangster:appear', (e) => {
    if (e.id != null) actorWin.set(e.id, e.windowId);
    if (e.kind !== 'innocent') crowbarTap(panOfWindow(e.windowId));
  });
  on('gangster:grab', (e) => {
    const pan = panOfWindow(e.windowId ?? actorWin.get(e.id));
    shout(pan);
    scrape(0.9, 0.22, pan * 0.6, 0.15);
  });
  on('gangster:down', (e) => {
    const pan = panOfWindow(actorWin.get(e.id));
    yelp(pan, e.kind === 'innocent');
    if (e.withBarrel) { thud(0.4, 1, { pan }); knock(0.2, 200, { t0: 0.15, pan }); }
    actorWin.delete(e.id);
  });
  on('gangster:escape', (e) => {
    const pan = panOfWindow(e.windowId ?? actorWin.get(e.id));
    scrape(0.6, 0.15, pan, 0);
    thud(0.22, 0.8, { t0: 0.45, pan });                            // the barrel lands in the yard
    actorWin.delete(e.id);
  });
  on('barrel:stolen', () => { osc('triangle', 220, 196, 0.35, 0.12, { lp: 1200, atk: 0.01, t0: 0.5 }); });
  on('barrel:recovered', () => { thud(0.35, 1.1); knock(0.15, 240, { t0: 0.1 }); });
  on('finish', () => policeArrive());
  on('fail', () => failTrombone());

  // ----------------------------------------------------------------------------------------
  // per-frame (throttled to ~30 Hz; only AudioParam targets are touched)
  // ----------------------------------------------------------------------------------------
  function update(dt, game) {
    if (!ready() || !amb) return;
    acc += dt;
    if (acc < 0.033) return;
    const step = acc; acc = 0;
    const T = ac.currentTime;
    const st = game?.state || gameState;

    const live = st === 'playing' || st === 'countdown';
    const maskTarget = live ? 1 : st === 'menu' ? 0.55 : 0.4;
    ambMask += (maskTarget - ambMask) * Math.min(1, step * 1.5);

    const b = clamp(broken.size / WINDOW_COUNT, 0, 1);
    amb.crOut.gain.setTargetAtTime(ambMask * (0.022 + 0.03 * b), T, 0.3);   // more crickets through open windows
    amb.humOut.gain.setTargetAtTime(ambMask * 0.035, T, 0.3);
    amb.roomG.gain.setTargetAtTime(ambMask * 0.05, T, 0.4);
    amb.wG.gain.setTargetAtTime(ambMask * (0.03 + 0.11 * b), T, 0.5);
    amb.wLp.frequency.setTargetAtTime(380 + 500 * b, T, 0.5);
    amb.whG.gain.setTargetAtTime(ambMask * 0.022 * b, T, 0.5);
    amb.gustG.gain.setTargetAtTime(ambMask * 0.018 * b, T, 0.5);

    dogTimer -= step;
    if (dogTimer <= 0) { dogBarks(); dogTimer = rand(12, 30); }
    owlTimer -= step;
    if (owlTimer <= 0) { owl(); owlTimer = rand(20, 45); }
    creakTimer -= step;
    if (creakTimer <= 0) { creak(); creakTimer = rand(10, 24); }
  }

  // broken panes are counted from events even when the context is not running yet
  events.on('glass:break', (e) => { if (e.windowId) broken.add(e.windowId); });

  return { unlock, update };
}
