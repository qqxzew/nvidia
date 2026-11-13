// Level 5 "Šílená stáčírna" — the conveyor-line simulation (owner: gameplay). Pure JS, no three.js: node can run it.
// Deterministic given dt + inputs (the only randomness is a seeded RNG jittering the spawn interval).
//
// createLine(ctx) → {
//   state: { time, speed, level (speed step index), shipped, quota, strikes, maxStrikes, over, result: null|'finish'|'fail',
//            reason (fail reason), stars, switches: { wash, fill, cap, ship } (true = divert),
//            barrels: [{ id, belt: 'entry'|'ring'|'wash'|'fill'|'cap'|'ship', s, x, z, tx, tz,
//                        state: 'dirty'|'clean'|'full'|'capped', next, waiting, wait (s waiting), age }],
//            liftQueue (barrels waiting in the lift), liftMax (more than this → fail 'jam'), spawned,
//            stats: { burst, reject, capEmpty, spill, washed, filled, capped, diverted, blocked, toggles } },
//   reset(seed?), toggle(id), set(id, on), update(dt, playing), cfg }
//
// ctx: { events, layout, lineCfg, belts?, god? }  (belts built with buildBelts(layout) when missing;
//      god / lineCfg.god: 'fail' is still emitted but the line keeps running)
//
// Rules (docs/LEVEL5.md):
//   Barrels move at state.speed (arc length / s). Ring barrels never stop. When a ring barrel crosses a switch point
//   `branches[id].sw` and that switch is ON it moves onto the branch (s = overshoot) — unless the branch is backed up
//   to its start (a queued barrel within minGap of s = 0), then it stays on the ring (stats.blocked++).
//   At `stationS` the station acts (player rule: "send a barrel only where its tag points"):
//     wash: dirty → clean ('wash') · full/capped → clean again, the beer is rinsed out ('spill', line:spill, NO strike)
//           · clean → 'pass'
//     fill: clean → full ('fill') · dirty → BURST (line:burst, strike 'burst', removed) · full/capped → 'pass'
//     cap:  full → capped ('cap') · dirty/clean → hammered an empty barrel (line:reject where 'cap',
//           strike 'capEmpty', removed) · capped → 'pass'
//     ship (dock at stationS on the exit branch): capped → dispatched (+1, line:ship, removed) · anything else →
//           REJECTED (line:reject where 'ship', strike 'reject', removed)
//   'line:station' fires for the wash/fill/cap stations when the barrel stays on the line (effect 'wash'|'spill'|
//   'fill'|'cap'|'pass'); burst / capEmpty / ship / reject have only their own events.
//   Zipper merge: a barrel on a station branch / the entry path stops `holdBack` m before the end of its path
//   (waiting = true) until the ring is clear around the join point; barrels behind queue at minGap. Clearance is
//   checked on the ring's arc length, time-aligned (everything moves at the same speed), against ring barrels and
//   barrels already committed to another merge: branch → mergeGap (minGap after maxWait s), lift → entryGap and only
//   while fewer than hallCap barrels are on the ring + station branches. So ring spacing ≥ minGap, always.
//   Lift: the spawner adds barrels to liftQueue on a timer (opening[] delays for the first barrels, then an interval
//   from spawnStart down to spawnMin as the belt speeds up). A barrel leaves the lift onto the entry path when its
//   start is clear ('line:spawn').
//   Speed: speedStart + speedRamp·(time − rampDelay), capped at speedMax; 'line:speed' on every speedStep step.
//
// Events: line:switch {id, on} · line:spawn {id} · line:lift {queue, max} (lift queue changed) ·
//   line:station {station, id, effect: 'wash'|'spill'|'fill'|'cap'|'pass'} · line:spill {id, x, z} ·
//   line:burst {id, x, z} · line:reject {id, x, z, where: 'cap'|'ship'} · line:ship {id, shipped, quota} ·
//   line:strike {strikes, max, reason: 'burst'|'reject'|'capEmpty'} · line:speed {speed, level} ·
//   finish {time, strikes, stars, shipped} · fail {reason: 'strikes'|'jam', time, shipped, strikes}
//   EXTRA fail reason 'jam': the hall overfilled (barrels left circling) and more than liftMax barrels wait in the lift.
//   Stars: 3 = no strike, 2 = one, 1 = two.
import { LAYOUT, LINE, NEXT_STATION, buildBelts } from './config.js';

const DEFAULTS = {
  seed: 1926,
  quota: 24,             // (config.js LINE overrides every key here)
  maxStrikes: 3,
  speedStart: 1.3,       // m/s
  speedMax: 3.0,
  speedRamp: 0.009,      // m/s per s
  rampDelay: 6,          // s at speedStart before the ramp starts
  speedStep: 0.25,       // 'line:speed' every this much
  spawnStart: 6.5,       // s between barrels at speedStart …
  spawnMin: 2.8,         // … and at speedMax
  spawnJitter: 0.12,     // ± fraction
  opening: [0.4, 9, 7],  // s before barrel 1, 2, 3 enter the lift (gentle start: the first one comes alone)
  minGap: 1.0,           // hard min centre distance on one belt
  mergeGap: 2.0,         // ring clearance a branch barrel needs to rejoin (both sides)
  entryGap: 2.5,         // ring clearance a lift barrel needs to merge (keeps the decisions readable)
  holdBack: 1.0,         // m before the end of a branch / the entry where barrels wait for the zipper
  maxWait: 3,            // s: then a waiting branch barrel accepts a minGap clearance
  hallCap: 14,           // the lift holds new barrels back while this many are on the ring + station branches
  liftMax: 5,            // more barrels than this waiting in the lift → fail 'jam'
  maxDt: 0.1,
};

const STATION_IDS = ['wash', 'fill', 'cap', 'ship'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createLine(ctx = {}) {
  const C = { ...DEFAULTS, ...(ctx.lineCfg || LINE) };
  const events = ctx.events || { emit() {}, on() { return () => {}; } };
  const emit = (n, p) => events.emit(n, p);
  const belts = ctx.belts || buildBelts(ctx.layout || LAYOUT);
  const god = !!(ctx.god || C.god);
  const ring = belts.ring, RL = ring.length;
  const BR = belts.branches;
  const ENTRY = { id: 'entry', path: belts.entry.path, join: belts.entry.join, exit: false };
  const pathOf = (belt) => (belt === 'ring' ? ring : belt === 'entry' ? ENTRY.path : BR[belt].path);
  const infoOf = (belt) => (belt === 'entry' ? ENTRY : BR[belt]);
  const wrap = (s) => ((s % RL) + RL) % RL;
  // switches in ring order (for crossing tests)
  const swList = STATION_IDS.filter((id) => BR[id]).map((id) => BR[id]).sort((a, b) => a.sw - b.sw);
  const sideBelts = ['entry', ...STATION_IDS.filter((id) => BR[id])];

  const st = { switches: { wash: false, fill: false, cap: false, ship: false }, barrels: [], stats: {} };
  let rng = mulberry32(C.seed);
  let nextId = 0, spawnT = 0, spawnIdx = 0, frame = 0, failSent = false;

  function reset(seed) {
    rng = mulberry32(seed ?? C.seed);
    nextId = 0; spawnIdx = 0; frame = 0; failSent = false;
    spawnT = C.opening.length ? C.opening[0] : C.spawnStart;
    for (const id of STATION_IDS) st.switches[id] = false;
    st.barrels.length = 0;
    Object.assign(st, {
      time: 0, speed: C.speedStart, speedStart: C.speedStart, speedMax: C.speedMax, level: 0,
      shipped: 0, quota: C.quota, strikes: 0, maxStrikes: C.maxStrikes,
      over: false, result: null, reason: null, stars: 0,
      liftQueue: 0, liftMax: C.liftMax, spawned: 0,
    });
    st.stats = { burst: 0, reject: 0, capEmpty: 0, spill: 0, washed: 0, filled: 0, capped: 0, diverted: 0, blocked: 0, toggles: 0 };
  }

  function set(id, on) {
    if (!(id in st.switches) || st.over) return;
    on = !!on;
    if (st.switches[id] === on) return;
    st.switches[id] = on;
    st.stats.toggles++;
    emit('line:switch', { id, on });
  }
  const toggle = (id) => { if (id in st.switches) set(id, !st.switches[id]); };

  function strike(reason) {
    st.strikes++;
    emit('line:strike', { strikes: st.strikes, max: C.maxStrikes, reason });
  }

  function place(b) {
    const p = pathOf(b.belt).at(b.s);
    b.x = p.x; b.z = p.z; b.tx = p.tx; b.tz = p.tz;
  }

  // station acts on barrel b (on branch id). Returns false when the barrel is removed.
  function station(b, id) {
    place(b);
    if (id === 'ship') {
      if (b.state === 'capped') {
        st.shipped++;
        emit('line:ship', { id: b.id, shipped: st.shipped, quota: C.quota });
      } else {
        st.stats.reject++;
        emit('line:reject', { id: b.id, x: b.x, z: b.z, where: 'ship' });
        strike('reject');
      }
      return false;
    }
    if (id === 'fill' && b.state === 'dirty') {
      st.stats.burst++;
      emit('line:burst', { id: b.id, x: b.x, z: b.z });
      strike('burst');
      return false;
    }
    if (id === 'cap' && (b.state === 'dirty' || b.state === 'clean')) {
      st.stats.capEmpty++;
      emit('line:reject', { id: b.id, x: b.x, z: b.z, where: 'cap' });
      strike('capEmpty');
      return false;
    }
    let effect = 'pass';
    if (id === 'wash' && b.state === 'dirty') { b.state = 'clean'; effect = 'wash'; st.stats.washed++; }
    else if (id === 'wash' && (b.state === 'full' || b.state === 'capped')) {
      b.state = 'clean'; effect = 'spill'; st.stats.spill++;
      emit('line:spill', { id: b.id, x: b.x, z: b.z });
    }
    else if (id === 'fill' && b.state === 'clean') { b.state = 'full'; effect = 'fill'; st.stats.filled++; }
    else if (id === 'cap' && b.state === 'full') { b.state = 'capped'; effect = 'cap'; st.stats.capped++; }
    b.next = NEXT_STATION[b.state];
    emit('line:station', { station: id, id: b.id, effect });
    return true;
  }

  // move a barrel along a side path (entry / branch) from s0 to target (already limited by the queue).
  // Returns false when the barrel was removed.
  function sideStations(b, s0, target) {
    const br = BR[b.belt];
    if (br && s0 < br.stationS && target >= br.stationS) {
      const keep = b.s; b.s = br.stationS;
      const alive = station(b, b.belt);
      b.s = keep;
      return alive;
    }
    return true;
  }

  // ring move from arc length s0 by dist, diverting at ON switches
  function ringAdvance(b, s0, dist) {
    let best = null, bestK = Infinity;
    for (const br of swList) {
      if (!st.switches[br.id]) continue;
      const k = wrap(br.sw - s0);
      if (k > 1e-9 && k <= dist && k < bestK) {
        const over = dist - k;
        // branch backed up to its start → can't take the barrel
        let free = true;
        for (const q of st.barrels) if (q.belt === br.id && q !== b && q.s - over < C.minGap) { free = false; break; }
        if (free) { best = br; bestK = k; }
        else if (!b._blk || b._blk !== br.id + ':' + frame) { st.stats.blocked++; b._blk = br.id + ':' + frame; }
      }
    }
    if (best) {
      b.belt = best.id; b.s = 0; st.stats.diverted++;
      const over = dist - bestK;
      if (!sideStations(b, 0, over)) return false;
      b.s = over;
      return true;
    }
    b.s = wrap(s0 + dist);
    return true;
  }

  // virtual ring positions (frame start): ring barrels + barrels committed to a merge
  let occ = [];
  function snapshot() {
    occ.length = 0;
    for (const b of st.barrels) {
      if (b.belt === 'ring') occ.push({ b, vs: b.s });
      else if (b.committed) { const inf = infoOf(b.belt); occ.push({ b, vs: wrap(inf.join - (pathOf(b.belt).length - b.s)) }); }
    }
  }
  function canMerge(b, s0) {
    const inf = infoOf(b.belt);
    let gap;
    if (b.belt === 'entry') {
      let hall = 0;
      for (const q of st.barrels) if (q.belt === 'ring' || (q.belt !== 'entry' && q.belt !== 'ship')) hall++;
      if (hall >= C.hallCap) return false;
      gap = C.entryGap;
    } else gap = b.wait >= C.maxWait ? C.minGap : C.mergeGap;
    const L = pathOf(b.belt).length, hold = L - C.holdBack;
    const vb = wrap(inf.join - C.holdBack);
    const shift = hold - s0;  // everybody moves the same distance until b reaches the hold point
    for (const o of occ) {
      if (o.b === b) continue;
      const d = wrap(o.vs + shift - vb);
      if (Math.min(d, RL - d) < gap) return false;
    }
    return true;
  }

  function newBarrel() {
    const b = { id: ++nextId, belt: 'entry', s: 0, x: 0, z: 0, tx: 1, tz: 0, state: 'dirty', next: NEXT_STATION.dirty,
      waiting: false, wait: 0, age: 0, committed: false, _f: -1 };
    place(b);
    st.barrels.push(b);
    st.spawned++;
    emit('line:spawn', { id: b.id });
    return b;
  }

  function end(result, reason) {
    if (result === 'fail' && god) {
      if (!failSent) { failSent = true; emit('fail', { reason, time: st.time, shipped: st.shipped, strikes: st.strikes }); }
      return;
    }
    st.over = true; st.result = result; st.reason = reason || null;
    if (result === 'finish') {
      st.stars = st.strikes === 0 ? 3 : st.strikes === 1 ? 2 : 1;
      emit('finish', { time: st.time, strikes: st.strikes, stars: st.stars, shipped: st.shipped });
    } else {
      st.stars = 0;
      emit('fail', { reason, time: st.time, shipped: st.shipped, strikes: st.strikes });
    }
  }

  function update(dt, playing) {
    if (!playing || st.over) return;
    dt = Math.min(Math.max(dt || 0, 0), C.maxDt);
    if (dt <= 0) return;
    frame++;
    st.time += dt;

    // --- speed ramp ---
    st.speed = Math.min(C.speedMax, C.speedStart + C.speedRamp * Math.max(0, st.time - C.rampDelay));
    const lvl = Math.floor((st.speed - C.speedStart) / C.speedStep + 1e-6);
    if (lvl > st.level) { st.level = lvl; emit('line:speed', { speed: st.speed, level: lvl }); }

    // --- spawner → lift ---
    spawnT -= dt;
    if (spawnT <= 0) {
      spawnIdx++;
      st.liftQueue++;
      emit('line:lift', { queue: st.liftQueue, max: C.liftMax });
      let iv;
      if (spawnIdx < C.opening.length) iv = C.opening[spawnIdx];
      else {
        const p = C.speedMax > C.speedStart ? (st.speed - C.speedStart) / (C.speedMax - C.speedStart) : 1;
        iv = (C.spawnStart + (C.spawnMin - C.spawnStart) * p) * (1 + C.spawnJitter * (rng() * 2 - 1));
      }
      spawnT += iv;
      if (st.liftQueue > C.liftMax) {
        end('fail', 'jam');
        if (st.over) return;
        st.liftQueue = C.liftMax;   // god mode: the extra barrel is dropped
      }
    }

    const d = st.speed * dt;
    snapshot();

    // --- side paths (entry + branches), front to back so the queue sees the moved barrel ahead ---
    for (const belt of sideBelts) {
      const list = st.barrels.filter((b) => b.belt === belt).sort((a, b) => b.s - a.s);
      const inf = infoOf(belt);
      const L = pathOf(belt).length, hold = L - C.holdBack;
      let ahead = null;
      for (const b of list) {
        if (b._f === frame) { ahead = b; continue; }   // arrived on this belt earlier this frame
        b._f = frame;
        const s0 = b.s;
        let target = s0 + d;
        if (ahead && ahead.belt === belt) target = Math.min(target, ahead.s - C.minGap);
        target = Math.max(s0, target);
        if (!sideStations(b, s0, target)) { b._dead = true; continue; }
        if (!inf.exit) {
          if (!b.committed && target > hold) {
            if (canMerge(b, s0)) b.committed = true;
            else {
              if (s0 >= hold - 1e-6) b.wait += dt;
              target = Math.max(s0, hold);
              b.waiting = true;
            }
          }
          if (b.committed) { b.waiting = false; b.wait = 0; }
          if (target >= L) {
            const over = target - L;
            b.belt = 'ring'; b.committed = false; b.waiting = false; b.wait = 0;
            if (!ringAdvance(b, inf.join, over)) { b._dead = true; continue; }
            continue;   // left this belt: no queue constraint for the next one
          }
        }
        b.s = target;
        ahead = b;
      }
    }

    // --- ring ---
    for (const b of st.barrels) {
      if (b._dead || b.belt !== 'ring' || b._f === frame) continue;
      b._f = frame;
      if (!ringAdvance(b, b.s, d)) b._dead = true;
    }

    // remove dead (in place, keep the array object)
    let w = 0;
    for (let i = 0; i < st.barrels.length; i++) { const b = st.barrels[i]; if (!b._dead) st.barrels[w++] = b; }
    st.barrels.length = w;

    // --- lift → entry ---
    if (st.liftQueue > 0) {
      let clear = true;
      for (const b of st.barrels) if (b.belt === 'entry' && b.s < C.minGap) { clear = false; break; }
      if (clear) {
        st.liftQueue--;
        emit('line:lift', { queue: st.liftQueue, max: C.liftMax });
        newBarrel();
      }
    }

    for (const b of st.barrels) {
      place(b);
      b.next = NEXT_STATION[b.state];
      b.age += dt;
    }

    // --- end ---
    if (st.strikes >= C.maxStrikes) end('fail', 'strikes');
    else if (st.shipped >= C.quota) end('finish');
  }

  reset();
  return { state: st, reset, toggle, set, update, cfg: C };
}
