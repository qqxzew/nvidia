// Headless tuning check for level 4 "Varna" (catwalk run): node scripts/level4-sim.mjs [--config] [--trace bot]
// Runs bots through the real runner (src/level4/runner.js) at 60 and 30 fps and prints the outcomes.
// Expectations: idle → fail 'time' with many hits / falls; perfect (exact knowledge, 0.15 s reaction) → 0 hits,
// 3 stars in ~32 s of 42 (v2 course: the real route, ≈ 208 m, stairs at s ≈ 99.5 → 108.5); human (0.35 s reaction, misjudges 10 % of the hazards) → finishes with 1–2 stars;
// jump-only / dodge-only → fail or 1 star.
// Also checks the course layout: corner fillets kept clear, never all three lanes blocked by steam / drips at once,
// nothing on the stairs or within 5 m of their ends, spacing of jump-only obstacles, respawn spots before holes,
// and the walking surface (deckAt / stairs / sections / finish match the route).
// PROPOSED = tuning values not yet in config.js RUN (run with --config to test config.js alone;
// L4='{"timeLimit":60}' node scripts/level4-sim.mjs tries extra overrides; L4P='{"depth":4}' tweaks the perfect bot;
// L4DBG=<s> prints the perfect / human plans around arc length s; --quick = fewer human seeds).
//
// Bots plan with the runner itself: snapshot → roll forward with no input → at the first hit, try single actions
// (←, →, ←←, →→, jump) at earlier frames, keep the ones that remove that hit, recurse (depth 3) — exact, so if the
// perfect bot gets hit, the layout really has no answer within its knowledge.
import { RUN } from '../src/level4/config.js';
import { COURSE, buildCourse, STEAM_LEN } from '../src/level4/course.js';
import { createRunner } from '../src/level4/runner.js';

const PROPOSED = {
  speedStart: 5.4, speedMax: 7.6, speedRamp: 0.055, timeLimit: 42,
  ...(process.env.L4 ? JSON.parse(process.env.L4) : {}),
};
const USE_CONFIG = process.argv.includes('--config');
const CFG = USE_CONFIG ? { ...RUN } : { ...RUN, ...PROPOSED };
const TRACE = process.argv.includes('--trace') ? process.argv[process.argv.indexOf('--trace') + 1] : null;
const QUICK = process.argv.includes('--quick');
const course = buildCourse(COURSE, CFG.laneWidth);
const HZ = course.hazards;
const NO = { left: 0, right: 0, jump: 0 };

function createBus() {
  const map = new Map();
  const log = [];
  return {
    log,
    on(n, fn) { if (!map.has(n)) map.set(n, new Set()); map.get(n).add(fn); return () => map.get(n).delete(fn); },
    emit(n, p = {}) { log.push([n, p]); const s = map.get(n); if (s) for (const fn of [...s]) fn(p); },
  };
}

// --- layout checks ------------------------------------------------------------------------------------------
function cornerCentres() {
  // v2: buildCourse gives the corner fillet centres (each corner point projected onto the path)
  if (course.corners) return course.corners;
  // samples where the heading turns, clustered into fillets → their centres
  const S = course.path.samples, turning = [];
  for (let i = 10; i < S.length - 10; i++) {
    const a = S[i - 10], b = S[i + 10];
    if (Math.abs(a.tx * b.tz - a.tz * b.tx) > 0.02) turning.push(S[i].s);
  }
  const out = [];
  let c0 = null, c1 = null;
  for (const s of turning) {
    if (c0 != null && s - c1 > 2) { out.push((c0 + c1) / 2); c0 = null; }
    if (c0 == null) c0 = s;
    c1 = s;
  }
  if (c0 != null) out.push((c0 + c1) / 2);
  return out;
}
const extent = (h) => (h.type === 'hole' ? h.len / 2 : h.type === 'steam' ? STEAM_LEN / 2 : 0.4);
function checkLayout() {
  const issues = [];
  const corners = cornerCentres();
  for (const h of HZ) {
    for (const c of corners) if (Math.abs(h.s - c) < 5 + extent(h)) issues.push(`#${h.id} ${h.type}@${h.s} inside corner fillet ${c.toFixed(1)} ±5`);
    if (h.s + extent(h) > course.finish - 4) issues.push(`#${h.id} too close to the finish`);
    if (h.s - extent(h) < course.start + 8) issues.push(`#${h.id} too close to the start`);
    for (const st of course.stairs || []) if (h.s + extent(h) > st.s0 - 5 && h.s - extent(h) < st.s1 + 5) issues.push(`#${h.id} ${h.type}@${h.s} on / within 5 m of the stairs ${st.s0.toFixed(1)}–${st.s1.toFixed(1)}`);
    if (h.type === 'steam' && h.lanes.length > 2) issues.push(`#${h.id} steam over all lanes (no dodge)`);
  }
  // steam / drips (can't be jumped) must never cover all three lanes within 1.5 m of each other
  const nj = HZ.filter((h) => h.type === 'steam' || h.type === 'drip');
  for (const a of nj) {
    const lanes = new Set();
    for (const b of nj) if (Math.abs(a.s - b.s) < 1.5 + extent(a) + extent(b)) b.lanes.forEach((l) => lanes.add(l));
    if (lanes.size === 3) issues.push(`#${a.id} ${a.type}@${a.s}: steam/drip lanes cover the whole deck around here`);
  }
  // jump-only obstacles in one lane: keep ≥ 6 m apart so a slowed (stumbling) runner can land and jump again
  const jo = HZ.filter((h) => h.type === 'pipe' || h.type === 'hole' || h.type === 'fall');
  for (let i = 0; i < jo.length; i++) for (let j = i + 1; j < jo.length; j++) {
    const a = jo[i], b = jo[j];
    const gap = (b.s - extent(b)) - (a.s + extent(a));
    if (gap > 6) continue;
    const shared = a.lanes.filter((l) => b.lanes.includes(l));
    if (shared.length) issues.push(`#${a.id} ${a.type}@${a.s} → #${b.id} ${b.type}@${b.s}: ${gap.toFixed(1)} m apart in lane(s) ${shared}`);
  }
  // respawn spot before each hole: the runner picks a free lane; report when no lane is clear
  for (const h of HZ.filter((q) => q.type === 'hole')) {
    const s = h.s - h.len / 2 - CFG.respawnBack;
    const free = [-1, 0, 1].filter((l) => !h.lanes.includes(l));
    const cand = free.length ? free : h.lanes;
    const clear = cand.filter((l) => !HZ.some((o) => o !== h && o.lanes.includes(l) && o.s + extent(o) > s - 1 && o.s - extent(o) < h.s + h.len / 2 + (free.length ? 3 : 0)));
    if (!clear.length) issues.push(`#${h.id} hole@${h.s}: respawn spot ${s.toFixed(1)} has no clear lane`);
  }
  // walking surface + sections: continuous, stairs where the deck changes, sections tile [0, length]
  if (course.deckAt) {
    for (let s = 0; s < course.length; s += 0.5) {
      const d = Math.abs(course.deckAt(s + 0.5) - course.deckAt(s));
      if (d > 0.5) issues.push(`deckAt jumps ${d.toFixed(2)} m at s ${s}`);
      const onStairs = (course.stairs || []).some((q) => s + 0.5 > q.s0 && s < q.s1);
      if (d > 1e-6 && !onStairs) issues.push(`deckAt changes outside the stairs at s ${s}`);
    }
  }
  const secs = course.sections;
  if (secs[0].from > 1e-6 || Math.abs(secs[secs.length - 1].to - course.length) > 1e-6) issues.push('sections do not cover the course');
  for (let i = 1; i < secs.length; i++) if (Math.abs(secs[i].from - secs[i - 1].to) > 1e-6 || secs[i].from <= secs[i - 1].from) issues.push(`section ${secs[i].id} does not follow ${secs[i - 1].id}`);
  if (Math.abs(course.finish - (course.length - (COURSE.finishBack ?? 4))) > 1e-6) issues.push(`finish ${course.finish} ≠ length − finishBack`);
  return { issues, corners };
}

// --- planning bot --------------------------------------------------------------------------------------------
const ACTIONS = { L: { left: 1, right: 0, jump: 0 }, R: { left: 0, right: 1, jump: 0 },
  LL: { left: 2, right: 0, jump: 0 }, RR: { left: 0, right: 2, jump: 0 }, J: { left: 0, right: 0, jump: 1 } };

function rnd32(seed) {
  let r = seed >>> 0;
  return () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// opts: reaction (s), view (m), misjudge (share of hazards ignored), allowed actions, horizon (s), depth
function plannerBot({ reaction = 0.15, view = 30, misjudge = 0, allowed = ['L', 'R', 'LL', 'RR', 'J'], horizon = 2.6,
  depth = 3, replan = 0.2, noise = 0, seed = 7 } = {}) {
  const rand = rnd32(seed);
  const ignored = new Set(HZ.filter(() => rand() < misjudge).map((h) => h.id));
  const planCourse = { ...course, hazards: [] };
  let lastFault = null, lastHole = false;
  const bus = { emit(n, p) { if (n === 'run:hit' || n === 'run:hole') { lastFault = p.id; lastHole = n === 'run:hole'; } }, on() { return () => {}; } };
  const sim = createRunner({ run: { ...CFG, headless: true }, course: planCourse, events: bus, god: true });
  const faults = () => sim.state.hits + sim.state.falls * 1000 + (sim.state.falling > 0 ? 1000 : 0);
  let dt = 1 / 60, step = 3;
  let plan = [], nextReplan = 0, pending = null;
  const hist = [];

  // roll with no input from the current sim state up to endFrame; → { frame of first fault, id } or null
  function rollout(frame, endFrame) {
    const f0 = faults();
    for (let f = frame; f < endFrame; f++) {
      lastFault = null;
      sim.update(dt, NO, true);
      if (faults() > f0) return { frame: f, id: lastFault ?? -1 };
      if (sim.state.over) return null;
    }
    return null;
  }
  // apply action a for one frame; null when that very frame already faults
  function act(snap, a) {
    sim.restore(snap);
    const f0 = faults();
    sim.update(dt, ACTIONS[a], true);
    return faults() > f0 ? null : sim.snapshot();
  }
  // → { ok, actions: [{frame, a}] }
  function solve(snap, frame, d, endFrame) {
    sim.restore(snap);
    // snapshots at candidate frames along the no-input rollout
    const snaps = [];
    const f0 = faults();
    let hitF = -1, hitId = -1, hole = false;
    for (let f = frame; f < endFrame; f++) {
      if ((f - frame) % step === 0) snaps.push({ f, sn: sim.snapshot() });
      lastFault = null;
      sim.update(dt, NO, true);
      if (faults() > f0) { hitF = f; hitId = lastFault ?? -1; hole = lastHole; break; }
      if (sim.state.over) break;
    }
    if (hitF < 0) return { ok: true, actions: [] };
    // failure score: later is better, but a fall is always worse than a hit (its respawn would only "postpone" things)
    const score = hitF - (hole ? 1e6 : 0);
    if (d === 0) return { ok: false, score };
    const hz = HZ.find((h) => h.id === hitId);
    const jumpFirst = hz && (hz.type === 'pipe' || hz.type === 'hole' || hz.type === 'fall');
    const order = jumpFirst ? ['J', 'L', 'R', 'LL', 'RR'] : ['L', 'R', 'LL', 'RR', 'J'];
    let best = { ok: false, score, actions: [] };
    for (const a of order) {
      if (!allowed.includes(a)) continue;
      // candidates that remove (or postpone) this fault
      const good = [];
      for (const { f, sn } of snaps) {
        const after = act(sn, a);
        if (!after) continue;
        const r = rollout(f + 1, endFrame);
        if (!r || r.frame > hitF + 1 || (r.id !== hitId && r.frame >= hitF)) good.push({ f, after, r });
      }
      if (!good.length) continue;
      // jumps: try the middle of the window first (robust); lane changes: the earliest first
      if (a === 'J') { const mid = good[good.length >> 1].f; good.sort((p, q) => Math.abs(p.f - mid) - Math.abs(q.f - mid)); }
      for (const g of good) {
        if (!g.r) return { ok: true, actions: [{ frame: g.f, a }] };
        const sub = solve(g.after, g.f + 1, d - 1, endFrame);
        if (sub.ok) return { ok: true, actions: [{ frame: g.f, a }, ...sub.actions] };
        if (sub.score > best.score) best = { ok: false, score: sub.score, actions: [{ frame: g.f, a }, ...(sub.actions || [])] };
      }
    }
    return best;
  }

  const bot = (frame, runner, fps) => {
    // a misjudged hazard that bit you is learned (no endless fall loop at a full-width hole)
    if (runner.state.falling > 0 || runner.state.invuln > 0) for (const id of ignored) {
      const h = HZ.find((q) => q.id === id); if (Math.abs(h.s - runner.state.s) < 3) ignored.delete(id);
    }
    dt = 1 / fps; step = Math.max(1, Math.round(0.05 * fps));
    const st = runner.state;
    hist.push({ frame, s: st.s });
    const rf = Math.round(reaction * fps);
    while (hist.length > 1 && hist[1].frame <= frame - rf) hist.shift();
    // a queued (noisy) action fires first
    if (pending) {
      if (frame >= pending.frame) { const a = pending.a; pending = null; nextReplan = frame + 1; return ACTIONS[a]; }
      return NO;
    }
    if (st.falling > 0) { plan = []; return NO; }
    if (frame >= nextReplan) {
      const sSeen = hist[0].s + view;
      planCourse.hazards = HZ.filter((h) => h.s <= sSeen && !ignored.has(h.id));
      const r = solve(runner.snapshot(), frame, depth, frame + Math.round(horizon * fps));
      plan = r.actions || [];
      if (process.env.L4DBG && Math.abs(st.s - +process.env.L4DBG) < 6 && fps === 60) console.log('plan @', frame, st.s.toFixed(1), 'lane', st.lane, 'known', planCourse.hazards.length, JSON.stringify(r));
      nextReplan = frame + Math.max(1, Math.round(replan * fps));
    }
    while (plan.length && plan[0].frame < frame) plan.shift();
    if (plan.length && plan[0].frame === frame) {
      const a = plan.shift().a;
      if (noise > 0) { pending = { frame: frame + Math.floor(rand() * (noise * fps + 1)), a }; if (pending.frame === frame) { pending = null; return ACTIONS[a]; } return NO; }
      return ACTIONS[a];
    }
    return NO;
  };
  bot.ignored = ignored;
  return bot;
}
const idleBot = () => () => NO;
// mashes jump every ~0.8 s and never steers
const masherBot = () => (frame, runner, fps) => (frame % Math.round(0.8 * fps) === 0 ? ACTIONS.J : NO);

// --- run one bot --------------------------------------------------------------------------------------------
function run(name, bot, { fps = 60, maxT = 200 } = {}) {
  const events = createBus();
  const runner = createRunner({ events, run: CFG, course });
  runner.reset();
  const st = runner.state;
  const DT = 1 / fps;
  // countdown: update(dt, NO, false) must not move anything
  const s0 = st.s;
  for (let i = 0; i < fps * 3; i++) runner.update(DT, NO, false);
  if (st.s !== s0 || st.time !== 0) throw new Error('update(dt, input, false) changed the state');
  let lanes = 0;
  for (let f = 0; f < fps * maxT && !st.over; f++) {
    const inp = bot(f, runner, fps);
    if (inp.left || inp.right) lanes++;
    runner.update(DT, inp, true);
    if (TRACE === name && fps === 60 && f % 15 === 0) {
      console.log(`t=${st.time.toFixed(2)} s=${st.s.toFixed(1)} v=${st.speed.toFixed(2)} lane=${st.lane} lat=${st.lateral.toFixed(2)} h=${st.height.toFixed(2)} hits=${st.hits} falls=${st.falls}`);
    }
  }
  const fin = events.log.find((e) => e[0] === 'finish');
  const fail = events.log.find((e) => e[0] === 'fail');
  const hitIds = events.log.filter((e) => e[0] === 'run:hit' || e[0] === 'run:hole').map((e) => e[1].id);
  if (TRACE === name && fps === 60) {
    for (const [n, p] of events.log) if (n === 'run:hit' || n === 'run:hole') {
      const h = HZ.find((q) => q.id === p.id); console.log(`  ${n} #${p.id} ${h.type}@${h.s} lanes ${h.lanes} ${p.kind || ''}`);
    }
  }
  return {
    row: {
      bot: name, fps,
      result: fin ? 'WIN' : fail ? `FAIL:${fail[1].reason}` : 'running',
      time: (fin ? fin[1].time : st.time + st.penalty).toFixed(1),
      remaining: st.remaining.toFixed(1),
      progress: (st.progress * 100).toFixed(0) + '%',
      hits: st.hits, falls: st.falls, stars: st.stars,
      jumps: st.jumps, lanes,
      sections: events.log.filter((e) => e[0] === 'run:section').map((e) => e[1].id.slice(0, 2)).join(' '),
      triggers: events.log.filter((e) => e[0] === 'run:trigger').length,
    },
    hitIds,
  };
}

// --- mechanics self-test on tiny straight courses ---------------------------------------------------------------
function mechanics() {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const mk = (hazards, cfg = {}) => {
    const c = buildCourse({ points: [[0, 0], [0, -200]], radius: 0, start: 2, finish: 150,
      sections: [{ id: 'a', from: 0, to: 80, name: 'A' }, { id: 'b', from: 80, to: 200, name: 'B' }], hazards }, CFG.laneWidth);
    const events = createBus();
    const r = createRunner({ events, run: { ...CFG, ...cfg }, course: c });
    return { r, events, st: r.state };
  };
  const DT = 1 / 60;
  const runUntil = (r, pred, inputFn = () => NO, max = 3000) => { for (let i = 0; i < max && !pred(); i++) r.update(DT, inputFn(i), true); };
  // jump buffer: a press shortly before landing fires on landing
  for (const [early, want] of [[0.1, 2], [0.2, 1]]) {
    const { r, st } = mk([]);
    r.update(DT, { left: 0, right: 0, jump: 1 }, true);
    const pressAt = Math.round((CFG.jumpTime - early) / DT);
    for (let i = 1; i < Math.round((CFG.jumpTime + 0.3) / DT); i++) r.update(DT, i === pressAt ? ACTIONS.J : NO, true);
    ok(st.jumps === want, `jump buffer: press ${early} s before landing → ${st.jumps} jumps (want ${want})`);
  }
  // coyote: jump pressed just after the feet pass the hole edge still saves you; later = fall
  for (const [late, fall] of [[0.04, 0], [0.2, 1]]) {
    const { r, st } = mk([{ type: 'hole', s: 20, len: 2.0, lanes: [0] }]);
    runUntil(r, () => st.s > 20 - 1 + r.cfg.holeEdge);          // feet just passed the usable edge
    const n = Math.round(late / DT);
    for (let i = 0; i < n && st.falling === 0; i++) r.update(DT, NO, true);
    r.update(DT, ACTIONS.J, true);
    runUntil(r, () => st.s > 23 || st.falling > 0);
    runUntil(r, () => st.falling === 0);
    ok((st.falls > 0) === !!fall, `coyote: jump ${late} s after the edge → falls ${st.falls} (want ${fall})`);
  }
  // fall → respawn before the hole in a free lane, penalty on the clock (not on time), events
  {
    const { r, st, events } = mk([{ type: 'hole', s: 20, len: 2.0, lanes: [0, 1] }]);
    runUntil(r, () => st.falls > 0);
    ok(Math.abs(st.s - (19 - CFG.respawnBack)) < 1e-6 && st.lane === -1, `respawn at s ${st.s.toFixed(2)} lane ${st.lane} (want ${19 - CFG.respawnBack}, -1)`);
    ok(Math.abs(st.remaining - (CFG.timeLimit - st.time - CFG.fallPenalty)) < 1e-9, 'fall penalty goes to remaining');
    ok(events.log.some((e) => e[0] === 'run:hole') && events.log.some((e) => e[0] === 'run:respawn'), 'run:hole / run:respawn emitted');
  }
  // lane change mid-air, and a steam double-hit is impossible (invulnerability + spent hazard)
  {
    const { r, st } = mk([{ type: 'steam', s: 20, lanes: [0], period: 10, on: 10, phase: 1 }, { type: 'steam', s: 21.5, lanes: [0], period: 10, on: 10, phase: 1 }]);
    r.update(DT, ACTIONS.J, true);
    r.update(DT, ACTIONS.R, true);
    for (let i = 0; i < 15; i++) r.update(DT, NO, true);
    ok(st.airborne && st.lateral > 0.8, `mid-air lane change (lateral ${st.lateral.toFixed(2)})`);
    r.update(DT, ACTIONS.L, true);
    runUntil(r, () => st.s > 25);
    ok(st.hits === 1, `two steam jets 1.5 m apart → ${st.hits} hits (want 1, invulnerable)`);
  }
  // pipe: jump clears it, standing hits; sack: triggers, lands, jumpable block
  {
    const { r, st, events } = mk([{ type: 'pipe', s: 20, lanes: [-1, 0, 1], height: 0.45 }, { type: 'fall', s: 40, lanes: [0], trigger: 14 }]);
    runUntil(r, () => st.s > 30);
    ok(st.hits === 1 && events.log.some((e) => e[0] === 'run:hit' && e[1].kind === 'pipe'), 'standing into a pipe hits');
    runUntil(r, () => st.s > 37.2);
    r.update(DT, ACTIONS.J, true);
    runUntil(r, () => st.s > 45);
    ok(st.hits === 1 && st.fallTriggers[1] != null && events.log.some((e) => e[0] === 'run:trigger'), `jumping a landed sack (hits ${st.hits})`);
  }
  // sections, finish payload, nearSteam
  {
    const { r, st, events } = mk([{ type: 'steam', s: 60, lanes: [0], period: 2, on: 2, phase: 0 }]);
    let maxNear = 0;
    runUntil(r, () => st.over, () => { maxNear = Math.max(maxNear, st.nearSteam); return NO; });
    const fin = events.log.find((e) => e[0] === 'finish');
    ok(fin && fin[1].stars >= 1 && 'remaining' in fin[1] && 'falls' in fin[1], 'finish payload');
    ok(events.log.filter((e) => e[0] === 'run:section').map((e) => e[1].id).join('') === 'ab', 'run:section a → b');
    ok(maxNear > 0.8, `nearSteam peaks near a jet (${maxNear.toFixed(2)})`);
    const s0 = st.s; for (let i = 0; i < 200; i++) r.update(DT, NO, false);
    ok(st.speed < 0.5 && st.s > s0, 'coasts to a stop after the finish');
  }
  // v2 deck: state.deck follows course.deckAt over stairs; a jump on the stairs clears a pipe relative to the local deck
  {
    const c = buildCourse({ points: [[0, 0], [0, -100]], radius: 0, start: 2, finish: 90,
      elevation: [{ x: 0, z: -20, y: 8.2 }, { x: 0, z: -30, y: 13.6 }],
      sections: [{ id: 'a', at: [0, 0], name: 'A' }, { id: 'b', at: [0, -50], name: 'B' }],
      hazards: [{ type: 'pipe', s: 26, lanes: [-1, 0, 1], height: 0.45 }] }, CFG.laneWidth);
    ok(c.stairs.length === 1 && Math.abs(c.stairs[0].s0 - 20) < 1e-6 && Math.abs(c.stairs[0].s1 - 30) < 1e-6 && c.stairs[0].y1 === 13.6, 'stairs from elevation knots');
    ok(Math.abs(c.deckAt(25) - 10.9) < 1e-6 && c.deckAt(0) === 8.2 && c.deckAt(99) === 13.6, 'deckAt piecewise linear');
    ok(c.sections[0].to === 50 && c.sections[1].to === c.length, 'sections from `at` points');
    const r = createRunner({ events: createBus(), run: CFG, course: c }), st = r.state;
    ok(st.deck === 8.2, `deck at the start ${st.deck}`);
    runUntil(r, () => st.s > 25.3 - (CFG.speedStart + 0.1) * CFG.jumpTime / 2);
    r.update(DT, ACTIONS.J, true);
    let maxH = 0;
    runUntil(r, () => st.s > 31, () => { maxH = Math.max(maxH, st.height); return NO; });
    ok(st.hits === 0 && Math.abs(st.deck - 13.6) < 1e-6 && maxH <= CFG.jumpHeight + 1e-9, `jump over a pipe on the stairs (hits ${st.hits}, deck ${st.deck})`);
  }
  return fails;
}

// --- main ------------------------------------------------------------------------------------------------------
console.log(USE_CONFIG ? 'config.js RUN only' : `config.js RUN + PROPOSED ${JSON.stringify(PROPOSED)}`);
const lay = checkLayout();
console.log(`course: ${HZ.length} hazards, finish ${course.finish.toFixed(1)} m of ${course.length.toFixed(1)}, corners at ${lay.corners.map((c) => c.toFixed(1)).join(', ')}`);
console.log(`sections: ${course.sections.map((q) => `${q.id} ${q.from.toFixed(1)}–${q.to.toFixed(1)}`).join(' · ')}; stairs: ${(course.stairs || []).map((q) => `${q.s0.toFixed(1)}–${q.s1.toFixed(1)} (${q.y0} → ${q.y1} m)`).join(', ') || 'none'}`);
const bySec = course.sections.map((sec) => `${sec.id} ${HZ.filter((h) => h.s >= sec.from && h.s < sec.to).length}`);
console.log(`per section: ${bySec.join(' · ')}; types: ${JSON.stringify(HZ.reduce((m, h) => ((m[h.type] = (m[h.type] || 0) + 1), m), {}))}`);
if (lay.issues.length) { console.log('LAYOUT ISSUES:'); for (const i of lay.issues) console.log('  ' + i); }
else console.log('layout: ok');

const mech = mechanics();
console.log(mech.length ? 'MECHANICS FAILED:\n  ' + mech.join('\n  ') : 'mechanics: ok (jump buffer, coyote, respawn, mid-air lane change, invulnerability, pipe, sack, sections, finish, deck / stairs)');
if (mech.length) process.exitCode = 1;

const BOTS = [
  ['idle', () => idleBot()],
  ['masher', () => masherBot()],
  ['perfect', () => plannerBot({ reaction: 0.15, view: 30, ...(process.env.L4P ? JSON.parse(process.env.L4P) : {}) })],
  ['human', (k) => plannerBot({ reaction: 0.35, view: 22, misjudge: 0.1, noise: 0.05, seed: 100 + k })],
  ['jumpOnly', () => plannerBot({ reaction: 0.15, view: 30, allowed: ['J'] })],
  ['dodgeOnly', () => plannerBot({ reaction: 0.15, view: 30, allowed: ['L', 'R', 'LL', 'RR'] })],
];
const HUMAN_SEEDS = QUICK ? 3 : 8;
const rows = [];
const perHazard = new Map();   // id → { bot: count }
const tally = (bot, ids) => { for (const id of ids) { const m = perHazard.get(id) || {}; m[bot] = (m[bot] || 0) + 1; perHazard.set(id, m); } };
const t0 = Date.now();
for (const fps of [60, 30]) {
  for (const [name, mk] of BOTS) {
    const n = name === 'human' ? (fps === 60 ? HUMAN_SEEDS : 2) : 1;
    for (let k = 0; k < n; k++) {
      const r = run(name, mk(k), { fps });
      rows.push(r.row); tally(name, r.hitIds);
    }
  }
}
console.table(rows);
const hs = rows.filter((r) => r.bot === 'human');
const stars = hs.reduce((m, r) => ((m[r.stars] = (m[r.stars] || 0) + 1), m), {});
console.log(`human: stars ${JSON.stringify(stars)}, wins ${hs.filter((r) => r.result === 'WIN').length}/${hs.length}, mean time ${(hs.reduce((a, r) => a + +r.time, 0) / hs.length).toFixed(1)} s, mean hits ${(hs.reduce((a, r) => a + r.hits, 0) / hs.length).toFixed(1)}, falls ${(hs.reduce((a, r) => a + r.falls, 0) / hs.length).toFixed(1)}`);
console.log('hits per hazard (all bots / runs):');
const hrows = [];
for (const h of HZ) {
  const m = perHazard.get(h.id) || {};
  hrows.push({ id: h.id, type: h.type, s: h.s, lanes: h.lanes.join(','), ...Object.fromEntries(BOTS.map(([b]) => [b, m[b] || ''])) });
}
console.table(hrows);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// assertions
const perfect = rows.filter((r) => r.bot === 'perfect');
const bad = [];
for (const r of perfect) if (r.hits || r.falls || r.result !== 'WIN') bad.push(`perfect @${r.fps} fps: ${r.result} hits ${r.hits} falls ${r.falls}`);
for (const r of rows.filter((q) => q.bot === 'idle')) if (r.result === 'WIN') bad.push(`idle @${r.fps} fps won`);
for (const r of rows.filter((q) => q.bot === 'jumpOnly' || q.bot === 'dodgeOnly' || q.bot === 'masher')) if (r.result === 'WIN' && r.stars > 1) bad.push(`${r.bot} @${r.fps} fps got ${r.stars} stars`);
if (bad.length) { console.log('ASSERTIONS FAILED:\n  ' + bad.join('\n  ')); process.exitCode = 1; }
else console.log('assertions: ok (perfect 0 hits, idle fails, one-trick bots ≤ 1 star)');
