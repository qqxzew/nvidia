// Headless tuning check for level 5 "Šílená stáčírna": node scripts/level5-sim.mjs [--config] [--trace bot]
// Runs switch-toggling bots through the real line model at 60 and 30 fps and prints the outcomes.
// Expectations: idle → never ships, ends with fail 'jam' (no soft lock); all-on → fails fast (empty barrels capped);
// lazy (some switches parked ON) → fail or ≤ 1 star;
// good (0.25 s reaction) → win 2–3 stars in ~2:30–3:30; sloppy (0.6 s, forgets 5 % of decisions) → 1–2 stars
// or a narrow fail; clumsy (forgets 10 %) → fails.
// Also checks: no two barrels on one belt closer than 0.9 × minGap, nothing waits forever.
// PROPOSED = tuning values not yet in config.js LINE (run with --config to test config.js alone;
// L5='{"quota":30}' node scripts/level5-sim.mjs tries extra overrides).
import { LAYOUT, LINE, NEXT_STATION, buildBelts } from '../src/level5/config.js';
import { createLine } from '../src/level5/line.js';

const PROPOSED = { ...(process.env.L5 ? JSON.parse(process.env.L5) : {}) };
const USE_CONFIG = process.argv.includes('--config');
const CFG = USE_CONFIG ? { ...LINE } : { ...LINE, ...PROPOSED };
const TRACE = process.argv.includes('--trace') ? process.argv[process.argv.indexOf('--trace') + 1] : null;

// L5SW='{"cap":[[x,z],...]}' replaces switch polylines (layout experiments only)
const SW_OVERRIDE = process.env.L5SW ? JSON.parse(process.env.L5SW) : null;
const LAY = SW_OVERRIDE ? { ...LAYOUT, switches: LAYOUT.switches.map((w) => (SW_OVERRIDE[w.id]
  ? { ...w, points: SW_OVERRIDE[w.id].points, station: SW_OVERRIDE[w.id].station } : w)) } : LAYOUT;
const belts = buildBelts(LAY);
const RL = belts.ring.length;
const wrap = (s) => ((s % RL) + RL) % RL;
const SW = Object.values(belts.branches).sort((a, b) => a.sw - b.sw);

function createBus() {
  const map = new Map();
  const log = [];
  return {
    log,
    on(n, fn) { if (!map.has(n)) map.set(n, new Set()); map.get(n).add(fn); return () => map.get(n).delete(fn); },
    emit(n, p = {}) { log.push([n, p]); const s = map.get(n); if (s) for (const fn of [...s]) fn(p); },
  };
}

// --- what a barrel meets next: the first switch ahead on the ring (from s), and how far away it is -----------
function nextSwitchFrom(s) {
  let best = null, bk = Infinity;
  for (const br of SW) { const k = wrap(br.sw - s); if (k > 1e-6 && k < bk) { bk = k; best = br; } }
  return { id: best.id, dist: bk };
}
function afterStation(id, state) {
  if (id === 'wash') return 'clean';                                    // dirty → clean, full/capped → spilled
  if (id === 'fill') return state === 'dirty' ? null : state === 'clean' ? 'full' : state;
  if (id === 'cap') return state === 'full' || state === 'capped' ? 'capped' : null;  // empty → capEmpty reject
  return null;
}
// → { sw, dist, state } or null (leaving the hall)
function nextEncounter(b) {
  if (b.belt === 'ring') { const n = nextSwitchFrom(b.s); return { sw: n.id, dist: n.dist, state: b.state }; }
  if (b.belt === 'ship') return null;
  const inf = b.belt === 'entry' ? belts.entry : belts.branches[b.belt];
  const L = (b.belt === 'entry' ? belts.entry.path : inf.path).length;
  let state = b.state;
  if (b.belt !== 'entry' && b.s < inf.stationS) state = afterStation(b.belt, state);
  if (!state) return null;
  const n = nextSwitchFrom(inf.join);
  return { sw: n.id, dist: L - b.s + n.dist, state };
}
// does barrel in `state` want switch `sw` ON ('yes'), must it be OFF ('harm': strike or spilled beer),
// or doesn't it matter ('ok': clean → wash, full/capped → fill, capped → cap)?
const HARM = { wash: ['full', 'capped'], fill: ['dirty'], cap: ['dirty', 'clean'], ship: ['dirty', 'clean', 'full'] };
function need(sw, state) {
  if (NEXT_STATION[state] === sw) return 'yes';
  return HARM[sw].includes(state) ? 'harm' : 'ok';
}

// --- bots: (t, line, mem) → nothing (they call line.set) --------------------------------------------------------
const idleBot = () => () => {};
const allOnBot = () => (t, line) => { for (const id of Object.keys(line.state.switches)) line.set(id, true); };

// reaction: decides on a snapshot `reaction` s old. forget: chance per (barrel, switch, state) to ignore that barrel.
// only: restrict to these switches (others stay as `fixed`).
function brainBot({ reaction = 0.25, forget = 0, seed = 7, only = null, fixed = {} } = {}) {
  const hist = [];
  const forgot = new Map();
  let r = seed >>> 0;
  const rnd = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
  return (t, line) => {
    hist.push({ t, barrels: line.state.barrels.map((b) => ({ id: b.id, belt: b.belt, s: b.s, state: b.state })) });
    while (hist.length > 1 && hist[1].t <= t - reaction) hist.shift();
    const seen = hist[0].barrels;
    const enc = [];
    for (const b of seen) { const e = nextEncounter(b); if (e) enc.push({ ...e, id: b.id }); }
    enc.sort((a, b) => a.dist - b.dist);
    for (const id of Object.keys(line.state.switches)) {
      if (only && !only.includes(id)) { if (id in fixed) line.set(id, fixed[id]); continue; }
      for (const e of enc) {
        if (e.sw !== id) continue;
        const n = need(id, e.state);
        if (n === 'ok') continue;
        const key = `${e.id}:${id}:${e.state}`;
        if (!forgot.has(key)) forgot.set(key, rnd() < forget);
        if (forgot.get(key)) continue;
        line.set(id, n === 'yes');
        break;
      }
    }
  };
}

function fmt(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }

function run(name, bot, { seed = 1926, fps = 60, cfg = CFG, maxT = 900 } = {}) {
  const events = createBus();
  const line = createLine({ events, layout: LAY, lineCfg: cfg, belts });
  line.reset(seed);
  const st = line.state, C = line.cfg;
  const DT = 1 / fps;
  let minSame = Infinity, minEuclid = Infinity, maxWait = 0, maxHall = 0, maxLift = 0, overlaps = 0;
  const lastMove = new Map();  // id → time the barrel last moved
  let maxStill = 0;
  // countdown: the line is updated with playing = false (must not move anything)
  const before = JSON.stringify(st.barrels);
  for (let i = 0; i < fps * 3; i++) line.update(DT, false);
  if (JSON.stringify(st.barrels) !== before || st.time !== 0) throw new Error('update(dt, false) changed the state');
  const prevS = new Map();
  for (let i = 0; i < fps * maxT && !st.over; i++) {
    const t = i * DT;
    bot(t, line);
    line.update(DT, true);
    const bs = st.barrels;
    let hall = 0;
    for (let a = 0; a < bs.length; a++) {
      const A = bs[a];
      if (A.belt !== 'entry' && A.belt !== 'ship') hall++;
      maxWait = Math.max(maxWait, A.wait);
      const key = `${A.belt}:${A.s.toFixed(4)}`;
      if (prevS.get(A.id) !== key) { prevS.set(A.id, key); lastMove.set(A.id, st.time); }
      maxStill = Math.max(maxStill, st.time - (lastMove.get(A.id) ?? st.time));
      for (let b = a + 1; b < bs.length; b++) {
        const B = bs[b];
        minEuclid = Math.min(minEuclid, Math.hypot(A.x - B.x, A.z - B.z));
        if (A.belt !== B.belt) continue;
        let ds = Math.abs(A.s - B.s);
        if (A.belt === 'ring') ds = Math.min(ds, RL - ds);
        minSame = Math.min(minSame, ds);
        if (ds < 0.9 * C.minGap) overlaps++;
      }
    }
    maxHall = Math.max(maxHall, hall);
    maxLift = Math.max(maxLift, st.liftQueue);
    if (TRACE === name && fps === 60 && seed === 1926 && i % 60 === 0) {
      console.log(`t=${st.time.toFixed(0).padStart(3)} v=${st.speed.toFixed(2)} sw=${Object.entries(st.switches).map(([k, v]) => (v ? k.toUpperCase() : k)).join(',')} lift=${st.liftQueue} shipped=${st.shipped} strikes=${st.strikes} ` +
        bs.map((b) => `${b.id}${b.state[0]}@${b.belt}:${b.s.toFixed(1)}${b.waiting ? 'W' : ''}`).join(' '));
    }
  }
  const fail = events.log.find((e) => e[0] === 'fail');
  const fin = events.log.find((e) => e[0] === 'finish');
  const speedEv = events.log.filter((e) => e[0] === 'line:speed').length;
  return {
    bot: name, fps, seed,
    result: fin ? 'WIN' : fail ? `FAIL:${fail[1].reason}` : 'running',
    time: fmt(st.time),
    shipped: `${st.shipped}/${st.quota}`,
    strikes: st.strikes, stars: st.stars,
    'burst/capE/rej/spill': `${st.stats.burst}/${st.stats.capEmpty}/${st.stats.reject}/${st.stats.spill}`,
    spawned: st.spawned,
    speed: st.speed.toFixed(2),
    spdEv: speedEv,
    toggles: st.stats.toggles,
    blocked: st.stats.blocked,
    hall: maxHall, lift: maxLift,
    maxWait: maxWait.toFixed(1),
    still: maxStill.toFixed(1),
    minSame: minSame === Infinity ? '-' : minSame.toFixed(2),
    minXZ: minEuclid === Infinity ? '-' : minEuclid.toFixed(2),
    overlap: overlaps,
  };
}

console.log(USE_CONFIG ? 'config.js LINE only' : `config.js LINE + PROPOSED ${JSON.stringify(PROPOSED)}`);
const rows = [];
if (process.env.L5BOT) {   // L5BOT='[{"reaction":0.6,"forget":0}, ...]' → just these bots over 4 seeds
  for (const o of JSON.parse(process.env.L5BOT)) for (const seed of [1926, 1, 2, 3, 4, 5])
    rows.push(run(JSON.stringify(o), brainBot({ ...o, seed: seed + 11 }), { seed }));
  console.table(rows);
  process.exit(0);
}
for (const fps of [60, 30]) {
  rows.push(run('idle', idleBot(), { fps }));
  rows.push(run('all-on', allOnBot(), { fps }));
  for (const seed of fps === 60 ? [1926, 1, 2, 3] : [1926]) rows.push(run('good', brainBot({ reaction: 0.25 }), { seed, fps }));
  for (const seed of fps === 60 ? [1926, 1, 2, 3] : [1926]) rows.push(run('sloppy', brainBot({ reaction: 0.6, forget: 0.05, seed: seed + 11 }), { seed, fps }));
}
rows.push(run('medium', brainBot({ reaction: 0.4, forget: 0.02 })));
for (const seed of [1926, 1]) rows.push(run('clumsy', brainBot({ reaction: 0.6, forget: 0.1, seed: seed + 11 }), { seed }));
rows.push(run('slow', brainBot({ reaction: 0.9 })));
rows.push(run('lazy3on', brainBot({ reaction: 0.25, only: ['ship'], fixed: { wash: true, cap: true, fill: true } })));
rows.push(run('lazyWF', brainBot({ reaction: 0.25, only: ['cap', 'ship'], fixed: { wash: true, fill: true } })));
rows.push(run('lazyF', brainBot({ reaction: 0.25, only: ['wash', 'cap', 'ship'], fixed: { fill: true } })));
console.table(rows);

// event summary (good bot)
{
  const events = createBus();
  const line = createLine({ events, layout: LAY, lineCfg: CFG, belts });
  line.reset(1926);
  const bot = brainBot({ reaction: 0.25 });
  for (let i = 0; i < 60 * 900 && !line.state.over; i++) { bot(i / 60, line); line.update(1 / 60, true); }
  const counts = {};
  for (const [n, p] of events.log) { const k = n === 'line:station' ? `${n}:${p.station}:${p.effect}` : n; counts[k] = (counts[k] || 0) + 1; }
  console.log('events (good bot):', JSON.stringify(counts));
  console.log('speed steps:', events.log.filter((e) => e[0] === 'line:speed').map((e) => `${e[1].level}@${e[1].speed.toFixed(2)}`).join(' '));
  const ships = events.log.filter((e) => e[0] === 'line:ship').length;
  console.log('end:', JSON.stringify(events.log.find((e) => e[0] === 'finish' || e[0] === 'fail')), 'ships', ships);
}
