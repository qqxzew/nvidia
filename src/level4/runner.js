// Level 4 "Varna" — the first-person catwalk runner (owner: gameplay). Pure JS, no three.js: node can run it.
// Deterministic given dt + inputs (no randomness at all). Headless check: node scripts/level4-sim.mjs
//
// createRunner(ctx) → {
//   state: { time (race clock s, only runs while playing — the hazard helpers use THIS), penalty (s added by falls),
//            remaining = timeLimit − time − penalty, s (arc length), progress 0..1 (start → finish), lane (target −1|0|1),
//            lateral (current m, + = right of the running direction), x, z, yaw, tx, tz (unit tangent),
//            height (feet above the deck, jump arc; stays 0 while falling), airborne, speed (m/s), stumble 1→0 after a hit,
//            falling 0..1 (sinking through a hole, then respawn), invuln (s left), lean −1..1 (lane-change velocity, for
//            camera roll), stride (m run in total, for footsteps / head bob), hits, falls, jumps,
//            section {id, name}, fallTriggers {hazardId: raceTime}, nearSteam 0..1, nearDrip 0..1,
//            over, result null|'finish'|'fail', stars },
//   reset(), update(dt, input, playing), cfg,
//   snapshot() / restore(snap)        // full state copy (sim / bots / debugging)
// }
// ctx: { events, run (config.js RUN), course (buildCourse result; built here when missing), god? }
//   god (ctx.god or run.god): 'fail' is still emitted once, the run keeps going (remaining goes negative).
// input = { left, right, jump }: presses since the last frame (main.js zeroes them every frame).
//
// Conventions
//   world position = path.at(s) + right × lateral, right of tangent (tx, tz) = (−tz, tx); lane −1 = left.
//   yaw = atan2(tx, tz): yaw 0 faces +Z. An object modelled facing +Z gets rotation.y = yaw; a three.js camera
//   (looks down −Z) needs rotation.y = yaw + π (or just lookAt a point ahead on the path).
//
// Rules
//   speed = (speedStart + momentum) × stumble factor. momentum grows by speedRamp per second up to speedMax − speedStart;
//   a hit / fall keeps only hitMomentum of it (clean runs are faster) and starts a stumble: × stumbleSpeed, recovering
//   (ease-out) over stumbleTime. After a hit the runner is invulnerable for `invuln` s — a hazard whose hit is swallowed
//   that way is spent for this pass, so nothing can double-hit.
//   Lane change: ← / → retarget the lane at once (also mid-air and mid-slide); lateral eases out to the lane centre in
//   laneTime per lane. Jump: a press starts a jumpTime / jumpHeight parabola when grounded; a press while airborne is
//   buffered for jumpBuffer s and fires on landing. Coyote: standing over a hole you get `coyote` s to still jump.
//   Collisions use the body interval swept over the frame [s_prev − bodyHalf, s + bodyHalf] and the current lateral:
//   a hazard lane counts while |lateral − laneCentre| < lat<Kind> (0.45–0.55 m: a half-finished slide still gets clipped).
//     hole  (centred at h.s, h.len long): feet (s) inside [h.s − len/2 + holeEdge, h.s + len/2 − holeEdge] and laterally
//           inside the hole lanes (merged, minus holeSide) while grounded for > coyote s → 'run:hole', fall animation
//           (fallAnim s), then respawn respawnBack m before the hole in the nearest safe lane (same lane if the hole spans
//           the deck), penalty += fallPenalty (added to the clock, NOT to `time`, so the hazard rhythm never jumps), falls++.
//     steam: steamLevel(h, t) ≥ steamHit (≈ the steamActive window minus its 0.05–0.08 s fade edges) over h.s ± steamHalf;
//           jumping doesn't help (steamSafeHeight > jumpHeight) — change lane or pass while it's off.
//     drip : dripState(h, t).active over h.s ± dripHalf (a jump doesn't help either).
//     fall : the sack is released when s ≥ h.s − h.trigger ('run:trigger', fallTriggers[id] = time); while it falls
//           (k ≥ sackHitK) it hits kind 'fall'; landed (k = 1) it is a BLOCK_HEIGHT block over h.s ± sackHalf: kind 'block'
//           unless feet > BLOCK_HEIGHT − blockClear (jump it or change lane).
//     pipe : h.s ± pipeHalf, hit unless feet > h.height + pipeClear.
//   Clock: `time` runs only while playing. remaining ≤ 0 → fail {reason: 'time'}. Crossing course.finish →
//   finish {time: time + penalty, remaining, hits, falls, stars}; stars: 3 = remaining ≥ star3Remaining, hits ≤ star3Hits,
//   no fall · 2 = remaining ≥ star2Remaining and hits + 2·falls ≤ star2Faults · else 1. After the end the runner coasts
//   to a stop (keep calling update; inputs are ignored).
//
// Events: run:lane {lane} · run:jump · run:land · run:hit {kind, id, x, z} · run:hole {id} · run:respawn {id, s, lane}
//   · run:trigger {id} · run:section {id, name} · finish {...} · fail {reason: 'time', progress}
import { COURSE, buildCourse, steamLevel, dripState, fallProgress, BLOCK_HEIGHT } from './course.js';

const DEFAULTS = {
  // RUN keys (config.js RUN overrides every one of these; values here = the tuning proposed by scripts/level4-sim.mjs)
  timeLimit: 62,
  laneWidth: 0.85,
  speedStart: 5.4,
  speedMax: 7.6,
  speedRamp: 0.055,
  laneTime: 0.17,
  jumpTime: 0.72,
  jumpHeight: 1.05,
  stumbleTime: 0.9,
  stumbleSpeed: 0.45,
  fallPenalty: 2.5,
  respawnBack: 5,
  // runner-only tuning
  jumpBuffer: 0.12,      // s a jump pressed in the air is remembered
  coyote: 0.08,          // s over a hole edge before you drop (a jump still works)
  invuln: 0.6,           // s after a hit
  respawnInvuln: 0.8,    // s after a respawn (holes still count)
  hitMomentum: 0.6,      // share of the built-up speed kept after a hit / fall
  fallAnim: 0.6,         // s sinking through the grating before the respawn
  bodyHalf: 0.3,         // ± m body depth along the course
  holeEdge: 0.15,        // m of each hole edge you can still stand on
  holeSide: 0.15,        // m of the hole's side edges (lateral) you can still stand on
  steamHalf: 0.5, dripHalf: 0.15, sackHalf: 0.35, pipeHalf: 0.08,
  latSteam: 0.55, latDrip: 0.45, latSack: 0.5, latPipe: 0.55,
  steamHit: 0.5,         // steamLevel that hurts
  steamSafeHeight: 1.6, dripSafeHeight: 1.2, blockClear: 0.05, pipeClear: 0.05,
  sackHitK: 0.55,        // a falling sack hurts in the lower part of its fall
  nearRange: 12,         // m ahead for nearSteam / nearDrip
  star3Remaining: 10, star3Hits: 0, star2Remaining: 4, star2Faults: 3,
  maxDt: 0.1,
  headless: false,       // true: skip the audio helpers (nearSteam / nearDrip) — bots / planners
};

const NO_INPUT = { left: 0, right: 0, jump: 0 };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createRunner(ctx = {}) {
  const C = { ...DEFAULTS, ...(ctx.run || {}) };
  const events = ctx.events || { emit() {}, on() { return () => {}; } };
  const emit = (n, p) => events.emit(n, p);
  const course = ctx.course || buildCourse(COURSE, C.laneWidth);
  const path = course.path;
  const god = !!(ctx.god || C.god);
  const W = C.laneWidth;
  const maxMomentum = Math.max(0, C.speedMax - C.speedStart);
  // the hazard list is read through course.hazards every frame (sorted by s), so a planner may swap it
  const H = () => course.hazards;

  const st = {};
  // internal (snapshotted together with st)
  let I = {};

  function reset() {
    I = {
      momentum: 0, stumbleT: 0, jumpT: 0, jumpBuf: 0, coyote: 0,
      tweenFrom: 0, tweenTo: 0, tweenT: 0, tweenDur: 0,
      fallHole: null, consumed: new Set(), secId: null, failSent: false, prevLat: 0,
    };
    Object.assign(st, {
      time: 0, penalty: 0, remaining: C.timeLimit, timeLimit: C.timeLimit,
      s: course.start, progress: 0, lane: 0, lateral: 0, x: 0, z: 0, yaw: 0, tx: 0, tz: -1,
      height: 0, airborne: false, speed: C.speedStart, stumble: 0, falling: 0, invuln: 0, lean: 0, stride: 0,
      hits: 0, falls: 0, jumps: 0,
      section: sectionAt(course.start), fallTriggers: {}, nearSteam: 0, nearDrip: 0,
      over: false, result: null, stars: 0,
    });
    pose();
  }

  function sectionAt(s) {
    const secs = course.sections || [];
    for (const sec of secs) if (s >= sec.from && s < sec.to) return { id: sec.id, name: sec.name };
    const last = secs[secs.length - 1];
    return last ? { id: last.id, name: last.name } : null;
  }

  function pose() {
    const p = path.at(st.s);
    st.tx = p.tx; st.tz = p.tz;
    st.x = p.x - p.tz * st.lateral;
    st.z = p.z + p.tx * st.lateral;
    st.yaw = Math.atan2(p.tx, p.tz);
    st.progress = clamp((st.s - course.start) / (course.finish - course.start), 0, 1);
  }

  // --- controls -------------------------------------------------------------------------------------------
  function setLane(lane) {
    lane = clamp(lane, -1, 1);
    if (lane === st.lane) return;
    st.lane = lane;
    I.tweenFrom = st.lateral; I.tweenTo = lane * W; I.tweenT = 0;
    I.tweenDur = Math.max(0.06, C.laneTime * Math.abs(I.tweenTo - I.tweenFrom) / W);
    emit('run:lane', { lane });
  }
  function startJump() {
    st.airborne = true; I.jumpT = 0; I.jumpBuf = 0; I.coyote = 0;
    st.jumps++;
    emit('run:jump', {});
  }

  // --- hits -------------------------------------------------------------------------------------------------
  function knock() {
    I.momentum *= C.hitMomentum;
    I.stumbleT = C.stumbleTime;
  }
  function hit(kind, h) {
    I.consumed.add(h.id);
    if (st.invuln > 0) return;            // swallowed by the invulnerability, and spent for this pass
    st.hits++;
    knock();
    st.invuln = C.invuln;
    emit('run:hit', { kind, id: h.id, x: st.x, z: st.z });
  }

  // lane occupancy: is the runner (at its current lateral) inside one of h's lanes?
  function inLanes(h, tol) {
    for (const l of h.lanes) if (Math.abs(st.lateral - l * W) < tol) return true;
    return false;
  }
  // is lateral x over the hole's gap (lanes merged into intervals, shrunk by holeSide at the outer edges)?
  function overGap(h, x) {
    const ls = [...h.lanes].sort((a, b) => a - b);
    let i = 0;
    while (i < ls.length) {
      let j = i;
      while (j + 1 < ls.length && ls[j + 1] === ls[j] + 1) j++;
      const lo = ls[i] * W - W / 2 + C.holeSide, hi = ls[j] * W + W / 2 - C.holeSide;
      if (x > lo && x < hi) return true;
      i = j + 1;
    }
    return false;
  }

  function startFall(h) {
    I.fallHole = h;
    st.falling = 1e-4;
    st.airborne = false; st.height = 0; I.jumpBuf = 0; I.coyote = 0;
    I.tweenDur = 0;                         // freeze the slide
    emit('run:hole', { id: h.id });
  }

  function respawn() {
    const h = I.fallHole;
    const s = Math.max(course.start, h.s - h.len / 2 - C.respawnBack);
    // nearest lane the hole doesn't cover, preferring one with no other hazard until just past the hole
    let lane = st.lane;
    const free = [-1, 0, 1].filter((l) => !h.lanes.includes(l));
    if (free.length) {
      const busy = (l) => H().some((o) => o !== h && o.type !== 'hole' && o.lanes.includes(l)
        && o.s > s - 1 && o.s < h.s + h.len / 2 + 3);
      free.sort((a, b) => (busy(a) - busy(b)) || (Math.abs(a - st.lane) - Math.abs(b - st.lane)) || (Math.abs(a) - Math.abs(b)));
      lane = free[0];
    }
    st.s = s; st.lane = lane; st.lateral = lane * W; I.tweenDur = 0; I.prevLat = st.lateral;
    st.falling = 0; I.fallHole = null;
    st.penalty += C.fallPenalty;
    st.falls++;
    knock();
    st.invuln = Math.max(st.invuln, C.respawnInvuln);
    for (const id of [...I.consumed]) { const o = H().find((q) => q.id === id); if (!o || o.s > s - 1) I.consumed.delete(id); }
    emit('run:respawn', { id: h.id, s, lane });
  }

  // --- collisions over the swept body interval -----------------------------------------------------------
  function collide(sPrev, hPrev) {
    const t = st.time;
    const a = sPrev - C.bodyHalf, b = st.s + C.bodyHalf;
    const hMin = Math.min(hPrev, st.height);
    const hz = H();
    // first hazard that may matter (sorted by s; the longest reach is a sack trigger ≤ ~25 m ahead)
    let lo = 0, hi = hz.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (hz[m].s < a - 2) lo = m + 1; else hi = m; }
    let overHole = null;
    for (let i = lo; i < hz.length; i++) {
      const h = hz[i];
      if (h.s > st.s + 30) break;
      if (h.type === 'fall' && st.fallTriggers[h.id] == null && st.s >= h.s - h.trigger) {
        st.fallTriggers[h.id] = t;
        emit('run:trigger', { id: h.id });
      }
      if (h.s > b + 1.2) continue;
      if (h.type === 'hole') {
        const half = h.len / 2 - C.holeEdge;
        if (!overHole && Math.abs(st.s - h.s) < half && overGap(h, st.lateral)) overHole = h;
        continue;
      }
      if (I.consumed.has(h.id)) continue;
      switch (h.type) {
        case 'steam':
          if (b > h.s - C.steamHalf && a < h.s + C.steamHalf && hMin < C.steamSafeHeight
            && inLanes(h, C.latSteam) && steamLevel(h, t) >= C.steamHit) hit('steam', h);
          break;
        case 'drip':
          if (b > h.s - C.dripHalf && a < h.s + C.dripHalf && hMin < C.dripSafeHeight
            && inLanes(h, C.latDrip) && dripState(h, t).active) hit('drip', h);
          break;
        case 'fall': {
          if (!(b > h.s - C.sackHalf && a < h.s + C.sackHalf) || !inLanes(h, C.latSack)) break;
          const k = fallProgress(st.fallTriggers[h.id], t);
          if (k == null) break;
          if (k < 1) { if (k >= C.sackHitK) hit('fall', h); }
          else if (hMin < BLOCK_HEIGHT - C.blockClear) hit('block', h);
          break;
        }
        case 'pipe':
          if (b > h.s - C.pipeHalf && a < h.s + C.pipeHalf && hMin < (h.height ?? 0.45) + C.pipeClear
            && inLanes(h, C.latPipe)) hit('pipe', h);
          break;
      }
    }
    return overHole && !st.airborne ? overHole : null;   // the caller runs the coyote timer
  }

  function stars() {
    const r = st.remaining;
    if (r >= C.star3Remaining && st.hits <= C.star3Hits && st.falls === 0) return 3;
    if (r >= C.star2Remaining && st.hits + 2 * st.falls <= C.star2Faults) return 2;
    return 1;
  }

  function near() {
    if (C.headless) return;
    let ns = 0, nd = 0;
    const R = C.nearRange, t = st.time;
    for (const h of H()) {
      const d = h.s - st.s;
      if (d < -2) continue;
      if (d > R) break;
      const dist = 1 - Math.max(0, d) / R;
      if (h.type === 'steam') {
        const v = steamLevel(h, t) * dist * (inLanes(h, C.latSteam) ? 1 : 0.55);
        if (v > ns) ns = v;
      } else if (h.type === 'drip') {
        const ds = dripState(h, t);
        if (ds.y01 == null) continue;
        const v = dist * (ds.active ? 1 : 0.6) * (inLanes(h, C.latDrip) ? 1 : 0.6);
        if (v > nd) nd = v;
      }
    }
    st.nearSteam = ns; st.nearDrip = nd;
  }

  function section() {
    const sec = sectionAt(st.s);
    if (sec && sec.id !== I.secId) {
      I.secId = sec.id; st.section = sec;
      emit('run:section', { id: sec.id, name: sec.name });
    }
  }

  function advanceLateral(dt) {
    if (I.tweenDur > 0) {
      I.tweenT += dt;
      const u = Math.min(1, I.tweenT / I.tweenDur);
      const e = 1 - (1 - u) * (1 - u);                      // ease-out: snappy start, soft arrival
      st.lateral = I.tweenFrom + (I.tweenTo - I.tweenFrom) * e;
      if (u >= 1) { st.lateral = I.tweenTo; I.tweenDur = 0; }
    }
    const v = (st.lateral - I.prevLat) / dt;
    I.prevLat = st.lateral;
    st.lean = clamp(v / (W / Math.max(0.05, C.laneTime)), -1, 1);
  }

  function coast(dt) {
    st.speed *= Math.exp(-dt * 2.2);
    if (st.speed < 0.05) st.speed = 0;
    st.s = Math.min(path.length - 0.5, st.s + st.speed * dt);
    st.stride += st.speed * dt;
    if (st.airborne) {
      I.jumpT += dt;
      if (I.jumpT >= C.jumpTime) { st.airborne = false; st.height = 0; emit('run:land', {}); }
      else { const u = I.jumpT / C.jumpTime; st.height = 4 * C.jumpHeight * u * (1 - u); }
    }
    advanceLateral(dt);
    st.stumble = Math.max(0, st.stumble - dt / Math.max(0.01, C.stumbleTime));
    st.nearSteam = 0; st.nearDrip = 0;
    pose();
  }

  function clock() {
    st.remaining = C.timeLimit - st.time - st.penalty;
    if (st.remaining <= 0 && !I.failSent) {
      I.failSent = true;
      emit('fail', { reason: 'time', progress: st.progress });
      if (!god) { st.over = true; st.result = 'fail'; st.stars = 0; }
    }
  }

  function update(dt, input = NO_INPUT, playing = false) {
    dt = Math.min(Math.max(+dt || 0, 0), C.maxDt);
    if (dt === 0) return;
    if (st.over) { coast(dt); return; }
    if (!playing) { pose(); return; }
    st.time += dt;
    st.invuln = Math.max(0, st.invuln - dt);

    // --- falling through a hole: no control, sink, then respawn
    if (st.falling > 0) {
      const h = I.fallHole;
      st.falling = Math.min(1, st.falling + dt / C.fallAnim);
      st.speed *= Math.exp(-dt * 4);
      st.s = Math.min(h.s + h.len / 2 - 0.1, st.s + st.speed * dt * (1 - st.falling));
      if (st.falling >= 1) respawn();
      pose(); clock(); near();
      return;
    }

    // --- input
    const n = (input.right | 0) - (input.left | 0);
    if (n) setLane(st.lane + n);
    if (input.jump > 0) I.jumpBuf = C.jumpBuffer;
    if (I.jumpBuf > 0 && !st.airborne) startJump();

    // --- speed
    I.momentum = Math.min(maxMomentum, I.momentum + C.speedRamp * dt);
    let f = 1;
    if (I.stumbleT > 0) {
      I.stumbleT = Math.max(0, I.stumbleT - dt);
      const u = 1 - I.stumbleT / C.stumbleTime;            // 0 at the hit → 1 recovered
      f = C.stumbleSpeed + (1 - C.stumbleSpeed) * (1 - (1 - u) * (1 - u));
    }
    st.stumble = I.stumbleT / C.stumbleTime;
    st.speed = (C.speedStart + I.momentum) * f;

    // --- move, jump arc, slide
    const sPrev = st.s, hPrev = st.height;
    st.s += st.speed * dt;
    st.stride += st.speed * dt;
    if (st.airborne) {
      I.jumpT += dt;
      if (I.jumpT >= C.jumpTime) {
        st.airborne = false; st.height = 0;
        emit('run:land', {});
        if (I.jumpBuf > 0) { startJump(); I.jumpT = 0; }
      } else {
        const u = I.jumpT / C.jumpTime;
        st.height = 4 * C.jumpHeight * u * (1 - u);
      }
    }
    I.jumpBuf = Math.max(0, I.jumpBuf - dt);
    advanceLateral(dt);
    pose();

    // --- hazards
    const hole = collide(sPrev, hPrev);
    if (hole) {
      I.coyote += dt;
      if (I.coyote > C.coyote) startFall(hole);
    } else I.coyote = 0;

    section();
    clock();
    if (!st.over && st.s >= course.finish) {
      st.remaining = C.timeLimit - st.time - st.penalty;
      st.over = true; st.result = 'finish';
      st.stars = stars();
      emit('finish', { time: st.time + st.penalty, remaining: st.remaining, hits: st.hits, falls: st.falls, stars: st.stars });
    }
    near();
  }

  function snapshot() {
    return {
      st: { ...st, fallTriggers: { ...st.fallTriggers } },
      I: { ...I, consumed: new Set(I.consumed) },
    };
  }
  function restore(sn) {
    Object.assign(st, sn.st);
    st.fallTriggers = { ...sn.st.fallTriggers };
    I = { ...sn.I, consumed: new Set(sn.I.consumed) };
  }

  reset();
  return { state: st, reset, update, snapshot, restore, cfg: C, course };
}
