// Traffic for "Jízda do Světovaru": trams, horse carts, pedestrians and the shunting train at the level crossing.
// Everything is scripted/trigger-based relative to the truck so the obstacles show up where intended and stay fair:
//  * oncoming tram  : parked at the end of the long avenue, dispatched when the truck is ~200 m before it
//  * stopped tram   : standing at a stop in the first part of the avenue (single track, lateral 0)
//  * horse carts    : standing at the right curb in the suburb / field, pull out when the truck is ~90 m behind
//  * pedestrians    : sidewalks + 3 crossings (they never step out in front of the truck and run back if it comes close)
//  * train          : triggered 150 m before the crossing; occupies the road for ~6 s; booms close 3 s before
// Moving circle colliders are rewritten into ctx.dynamicColliders every frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  vcolMaterial, buildTramGeometry, buildHorseCart, CART, buildPedGeometry, PED_VARIANTS,
  buildTrainGeometry, buildTrainSigns, makeTrainSignTexture, TRAIN, buildBoomGeometry, G,
} from '../vehicle/trafficModels.js';

const TAU = Math.PI * 2;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

export function createTraffic(ctx) {
  const { scene, route, events } = ctx;
  const cols = ctx.dynamicColliders;
  const high = ctx.quality === 'high';
  const root = new THREE.Group();
  root.userData.dynamic = true;
  root.name = 'traffic';
  scene.add(root);
  const mat = vcolMaterial({ side: THREE.DoubleSide });
  const zone = (id) => route.zones.find((z) => z.id === id);
  const town = zone('town'), suburb = zone('suburb'), field = zone('field');
  const simT = { t: 0, bell: -99 };

  const dyn = (o) => { o.userData.dynamic = true; return o; };
  const mkMesh = (geo, material = mat, shadow = true) => {
    const m = dyn(new THREE.Mesh(geo, material));
    m.castShadow = shadow; m.receiveShadow = false;
    root.add(m);
    return m;
  };
  const mkCol = (kind, r) => ({ x: 0, z: 0, r, vx: 0, vz: 0, kind, onHit: (strength) => events.emit('traffic:hit', { kind, strength }) });
  const place = (obj, s, lat, yawAdd = 0, y = 0) => {
    const f = route.frameAt(s);
    obj.position.set(f.x + f.rx * lat, y, f.z + f.rz * lat);
    obj.rotation.y = f.yaw + yawAdd;
    return f;
  };

  // longest straight stretch of the town (the long avenue after the second corner)
  function straightest(z) {
    let best = [z.s0 + 20, z.s0 + 40], run = -1;
    for (let s = z.s0 + 4; s < z.s1 - 12; s += 4) {
      if (Math.abs(angDiff(route.frameAt(s + 8).yaw, route.frameAt(s).yaw)) < 0.025) {
        if (run < 0) run = s;
        if (s - run > best[1] - best[0]) best = [run, s];
      } else run = -1;
    }
    return best;
  }
  const avenue = straightest(town);

  // =============================================================================================
  // TRAMS
  // =============================================================================================
  const trams = (() => {
    const geo = buildTramGeometry();
    const a0 = avenue[0] + 12, a1 = avenue[1] - 6;
    const sB = a0 + 38;                       // stopped tram (waiting at the stop)
    const sA0 = a1;                           // oncoming tram waits here until dispatched
    const sAStop = sB + 15;                   // ... and halts behind the stopped one after passing the truck
    const meet = a0 + 0.62 * (a1 - a0);
    const trig = THREE.MathUtils.clamp((meet - 0.7 * sA0) / 0.3, a0 - 110, a0 + 20);
    const V = 6.0, ACC = 2.0, DEC = 2.4;
    const OFFS = [-3.3, -1.1, 1.1, 3.3];
    const mk = (s, dir) => ({ mesh: mkMesh(geo), s, dir, v: 0, state: 'parked', cols: OFFS.map(() => mkCol('tram', 1.25)) });
    const A = mk(sA0, -1), B = mk(sB, 1);
    const all = [A, B];

    function reset() {
      A.s = sA0; A.v = 0; A.state = 'parked';
      B.s = sB; B.v = 0; B.state = 'stop';
      sync();
    }
    function sync() {
      for (const T of all) {
        const f = place(T.mesh, T.s, 0, T.dir < 0 ? Math.PI : 0);
        const hx = Math.sin(T.mesh.rotation.y), hz = Math.cos(T.mesh.rotation.y);
        T.cols.forEach((c, i) => {
          c.x = T.mesh.position.x + hx * OFFS[i]; c.z = T.mesh.position.z + hz * OFFS[i];
          c.vx = hx * T.v * (T.dir < 0 ? 1 : 1); c.vz = hz * T.v;
          cols.push(c);
        });
        void f;
      }
    }
    function update(dt, st) {
      if (A.state === 'parked' && st.s >= trig && st.s < sA0 - 30) A.state = 'run';
      if (A.state === 'run') {
        const remaining = A.s - sAStop;
        const stopDist = (A.v * A.v) / (2 * DEC) + 0.4;
        if (remaining <= stopDist) A.v = Math.max(0, A.v - DEC * dt);
        else A.v = Math.min(V, A.v + ACC * dt);
        A.s -= A.v * dt;
        if (A.s <= sAStop || (A.v < 0.05 && A.s - sAStop < 1)) { A.s = Math.max(A.s, sAStop); A.v = 0; A.state = 'stop'; }
      }
      // bell: the nearest moving tram ahead of the truck within 45 m (max once per 4 s)
      if (A.state === 'run' && simT.t - simT.bell > 4) {
        const dx = A.mesh.position.x - st.x, dz = A.mesh.position.z - st.z;
        const d = Math.hypot(dx, dz);
        if (d < 45 && dx * Math.sin(st.yaw) + dz * Math.cos(st.yaw) > -4) { simT.bell = simT.t; events.emit('tram:bell', { distance: d }); }
      }
      sync();
    }
    return { update, reset, A, B, sB, sAStop };
  })();

  // =============================================================================================
  // HORSE CARTS
  // =============================================================================================
  const carts = (() => {
    const sMax = route.anchors.railCrossing.s - 110;
    const specs = [
      { s0: suburb.s0 + 45, seed: 0 },
      { s0: Math.min(field.s0 + 40, sMax - 30), seed: 1 },
    ];
    const V = 2.5;
    const list = specs.map((sp) => {
      const model = buildHorseCart(sp.seed);
      return {
        model, mesh: mkMesh(model.geometry), s0: sp.s0, s: sp.s0, v: 0, dist: Math.random() * 6, moving: false,
        idle: Math.random() * 10, cols: CART.circles.map(([, r]) => mkCol('cart', r)),
      };
    });
    function pose(c, t) {
      const g = c.dist * 2.6, amp = 0.3 * Math.min(1, c.v / V);
      const m = c.model;
      m.set(1, amp * Math.sin(g)); m.set(4, 0.8 * amp * Math.sin(g));
      m.set(2, -amp * Math.sin(g)); m.set(3, -0.8 * amp * Math.sin(g));
      m.set(0, 0.06 * Math.sin(g * 2) * (c.v / V) + 0.03 * Math.sin(t * 1.4 + c.idle) - 0.02);
      m.set(5, c.dist / 0.55);
      m.flush();
    }
    function sync(c) {
      const hw = route.halfWidthAt(c.s);
      const lat = THREE.MathUtils.clamp(hw - 1.9, 2.5, 3.0);
      place(c.mesh, c.s, lat);
      const hx = Math.sin(c.mesh.rotation.y), hz = Math.cos(c.mesh.rotation.y);
      c.cols.forEach((col, i) => {
        const off = CART.circles[i][0];
        col.x = c.mesh.position.x + hx * off; col.z = c.mesh.position.z + hz * off;
        col.vx = hx * c.v; col.vz = hz * c.v;
        cols.push(col);
      });
    }
    function reset() {
      for (const c of list) { c.s = c.s0; c.v = 0; c.moving = false; c.dist = 0; pose(c, 0); sync(c); }
      cols.length = 0;
    }
    function update(dt, st) {
      for (const c of list) {
        if (!c.moving && st.s > c.s0 - 90) c.moving = true;
        if (c.moving) {
          c.v = Math.min(V, c.v + 1.2 * dt);
          c.s = Math.min(sMax, c.s + c.v * dt);
          if (c.s >= sMax) c.v = Math.max(0, c.v - 2 * dt);
          c.dist += c.v * dt;
        }
        // skip the heavy re-posing for carts that are far away
        if (Math.abs(c.s - st.s) < 220) pose(c, simT.t);
        sync(c);
      }
    }
    return { update, reset };
  })();

  // =============================================================================================
  // PEDESTRIANS
  // =============================================================================================
  const peds = (() => {
    const R = rng(1926);
    const list = [];
    const sEnd = field.s0 - 10;
    // sidewalk walkers: ping-pong between two points with a short pause at each end
    const step = high ? 24 : 34;
    for (let s = 16; s < sEnd; s += step * (0.75 + R() * 0.6)) {
      const len = 22 + R() * 28;
      list.push({
        kind: 'walk', variant: Math.floor(R() * PED_VARIANTS), sA: s, len, side: R() < 0.5 ? -1 : 1,
        v: 0.95 + R() * 0.4, off: R() * 100, pause: 1.0 + R(), ph: R() * TAU,
      });
    }
    // crossings
    const crossS = [town.s0 + 22, town.s0 + 124, avenue[0] + 0.78 * (avenue[1] - avenue[0])];
    crossS.forEach((cs, k) => {
      for (let j = 0; j < 2; j++) {
        list.push({
          kind: 'cross', variant: Math.floor(R() * PED_VARIANTS), cs: cs + (j ? 2.2 : -1.2), side: j ? 1 : -1, lat: 0, state: 'wait',
          timer: 1 + R() * 4 + k, ph: R() * TAU, walking: false, hurry: false, dirSgn: 1, face: 1,
        });
      }
    });
    const counts = new Array(PED_VARIANTS).fill(0);
    for (const p of list) p.idx = counts[p.variant]++;
    const meshes = counts.map((n, k) => {
      const m = new THREE.InstancedMesh(buildPedGeometry(k), vcolMaterial(), Math.max(1, n));
      dyn(m); m.name = 'traffic-ped'; m.frustumCulled = false; m.castShadow = high; m.count = Math.max(1, n);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) { c.setScalar(0.82 + R() * 0.25); m.setColorAt(i, c); }
      root.add(m);
      return m;
    });
    const dummy = new THREE.Object3D();
    const hideDummy = new THREE.Matrix4().makeScale(0, 0, 0);

    function resetCross(p) { p.state = 'wait'; p.lat = p.side * (route.halfWidthAt(p.cs) + 1.0); p.timer = 1 + (p.ph % 4); p.walking = false; }
    function reset() {
      for (const p of list) if (p.kind === 'cross') {
        p.side = p.ph < Math.PI ? -1 : 1; resetCross(p);
      }
    }

    function put(p, x, z, yaw, bob, tilt, vis) {
      const m = meshes[p.variant];
      if (!vis) { m.setMatrixAt(p.idx, hideDummy); return; }
      dummy.position.set(x, bob, z); dummy.rotation.set(0, yaw, tilt); dummy.scale.setScalar(1.08);
      dummy.updateMatrix();
      m.setMatrixAt(p.idx, dummy.matrix);
    }

    function update(dt, st) {
      const t = simT.t;
      const sp = Math.max(0, st.speed);
      for (const p of list) {
        if (p.kind === 'walk') {
          const mid = p.sA + p.len / 2;
          if (Math.abs(mid - st.s) > 200 + p.len) { put(p, 0, 0, 0, 0, 0, false); continue; }
          const T1 = p.len / p.v, P = p.pause, cyc = 2 * (T1 + P);
          const u = (t + p.off) % cyc;
          let f, dir, turn = 0, moving = true;
          if (u < T1) { f = u / T1; dir = 1; }
          else if (u < T1 + P) { f = 1; dir = 1; turn = ((u - T1) / P) * Math.PI; moving = false; }
          else if (u < 2 * T1 + P) { f = 1 - (u - T1 - P) / T1; dir = -1; }
          else { f = 0; dir = -1; turn = ((u - 2 * T1 - P) / P) * Math.PI; moving = false; }
          const s = p.sA + f * p.len;
          const fr = route.frameAt(s);
          const lat = p.side * (route.halfWidthAt(s) + 1.5);
          const yaw = fr.yaw + (dir > 0 ? 0 : Math.PI) + turn * (dir > 0 ? 1 : 1);
          const w = t * 5.6 + p.ph;
          put(p, fr.x + fr.rx * lat, fr.z + fr.rz * lat, yaw, moving ? 0.03 * Math.abs(Math.sin(w)) : 0, moving ? 0.04 * Math.sin(w) : 0, true);
        } else {
          if (Math.abs(p.cs - st.s) > 230) { put(p, 0, 0, 0, 0, 0, false); continue; }
          const hw = route.halfWidthAt(p.cs), curb = hw + 1.0;
          const dT = p.cs - st.s;
          const near = dT > -4 && dT < 38 + 0.9 * sp;
          let tramNear = false, tramClose = false;
          for (const T of [trams.A, trams.B]) { const d = Math.abs(T.s - p.cs); if (d < 30 && T.v > 0.2) tramNear = true; if (d < 48) tramClose = true; }
          const danger = near || tramNear;
          const safe = (dT > 55 + sp || dT < -8) && !tramClose;
          p.walking = false; p.hurry = false;
          if (p.state === 'wait') {
            p.lat = p.side * curb;
            p.timer -= dt;
            p.face = -p.side;
            if (p.timer <= 0 && safe) p.state = 'cross';
          } else if (p.state === 'cross') {
            if (danger) p.state = 'flee';
            else {
              p.lat -= p.side * 1.35 * dt; p.walking = true; p.face = -p.side;
              if (Math.abs(p.lat) >= curb && Math.sign(p.lat) !== p.side) { p.lat = -p.side * curb; p.side = -p.side; p.state = 'wait'; p.timer = 3 + (p.ph % 5); p.walking = false; }
            }
          }
          if (p.state === 'flee') {
            const cs = Math.sign(p.lat) || p.side;
            p.lat += cs * 3.3 * dt; p.walking = true; p.hurry = true; p.face = cs;
            if (Math.abs(p.lat) >= curb) { p.lat = cs * curb; p.side = cs; p.state = 'wait'; p.timer = 1.5 + (p.ph % 3); p.walking = false; }
          }
          const fr = route.frameAt(p.cs);
          const yaw = Math.atan2(fr.rx * p.face, fr.rz * p.face);
          const w = t * (p.hurry ? 9 : 5.6) + p.ph;
          const idleSway = p.walking ? 0 : 0.012 * Math.sin(t * 1.3 + p.ph);
          put(p, fr.x + fr.rx * p.lat, fr.z + fr.rz * p.lat, yaw, p.walking ? 0.03 * Math.abs(Math.sin(w)) : 0, p.walking ? (p.hurry ? 0.08 : 0.04) * Math.sin(w) : idleSway, true);
        }
      }
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    }
    return { update, reset };
  })();

  // =============================================================================================
  // TRAIN + LEVEL CROSSING
  // =============================================================================================
  const train = (() => {
    const rail = route.anchors.rail, cx = route.anchors.railCrossing;
    const hwC = route.halfWidthAt(cx.s);
    const roadE = cx.x + hwC + 1.8, roadW = cx.x - hwC - 1.8;
    const L = TRAIN.length;
    // tune here ---------------------------------------------------------------
    const TRIGGER_DIST = 165;   // truck distance before the crossing that starts the train
    const T_ENTER = 10.8;       // s after trigger: train front reaches the east edge of the road
    const V = 8.0, TA = 2.0;    // cruise speed (m/s) and acceleration time
    const BOOM_LEAD = 3.0;      // booms are down this many seconds before the train enters
    // -------------------------------------------------------------------------
    const dist = (tau) => (tau < TA ? (0.5 * V * tau * tau) / TA : V * (tau - TA / 2));
    const X0 = roadE + dist(T_ENTER);
    const D_MAX = X0 + 160;                   // front stops at x ~ -160 (inside the brewery, out of the way)
    const tauExit = (X0 - (roadW - L)) / V + TA / 2;
    const speedAt = (tau) => (tau < 0 ? 0 : tau < TA ? (V * tau) / TA : dist(tau) >= D_MAX ? 0 : V);

    const model = buildTrainGeometry();
    const group = dyn(new THREE.Group());
    group.rotation.y = -Math.PI / 2;
    root.add(group);
    const body = dyn(new THREE.Mesh(model.geometry, mat)); body.castShadow = true; group.add(body);
    const signMat = new THREE.MeshLambertMaterial({ map: makeTrainSignTexture(), transparent: false, alphaTest: 0.5, side: THREE.DoubleSide });
    const signs = dyn(new THREE.Mesh(buildTrainSigns(), signMat)); group.add(signs);
    const circles = [];
    for (let d = 1.0; d < L - 0.5; d += 2.1) circles.push({ d, c: mkCol('train', 1.55) });

    // smoke puffs (world space)
    const NP = 18;
    const smokeMesh = dyn(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xe2ddd2, transparent: true, opacity: 0.6, depthWrite: false }), NP));
    smokeMesh.frustumCulled = false; root.add(smokeMesh);
    const puffs = Array.from({ length: NP }, () => ({ x: 0, y: 0, z: 0, age: 9, life: 3 }));
    let spawnT = 0, puffI = 0;
    const dm = new THREE.Object3D();

    // booms and crossing furniture
    const fa = route.frameAt(cx.s - 7.5), fb = route.frameAt(cx.s + 7.5);
    const boomGeo = buildBoomGeometry(hwC * 2 + 1.5);
    const mkBoom = (frame, lat, yawAdd) => {
      const g = dyn(new THREE.Group());
      g.position.set(frame.x + frame.rx * lat, 1.05, frame.z + frame.rz * lat);
      g.rotation.y = frame.yaw + yawAdd;
      const m = dyn(new THREE.Mesh(boomGeo, mat)); m.castShadow = true;
      g.add(m); root.add(g);
      return g;
    };
    const boomA = mkBoom(fa, hwC + 0.9, 0), boomB = mkBoom(fb, -(hwC + 0.9), Math.PI);
    const RAISED = 1.3;
    let boomAngle = RAISED;
    {
      const hinges = [[fa, hwC + 0.9, fa.yaw], [fb, -(hwC + 0.9), fb.yaw]].map(([f, lat, yaw]) => G(new THREE.BoxGeometry(0.3, 1.1, 0.3), 0x2a2a2c, { x: f.x + f.rx * lat, y: 0.55, z: f.z + f.rz * lat, ry: yaw }));
      const fixed = new THREE.Mesh(mergeGeometries(hinges, false), mat);
      fixed.castShadow = true; fixed.userData.dynamic = true; root.add(fixed);
    }

    const S = { triggered: false, tau: -1, xf: X0, dist: 0 };

    function setBooms(a) { boomA.children[0].rotation.z = a; boomB.children[0].rotation.z = a; }
    function reset() {
      S.triggered = false; S.tau = -1; S.dist = 0; S.xf = X0; boomAngle = RAISED; setBooms(boomAngle);
      place1(); for (const p of puffs) p.age = 9;
      cols.length = 0;
    }
    function place1() {
      group.position.set(S.xf, 0.22, rail.z); // wheels on the rail head (y = 0.22)
      model.set(0, S.dist / TRAIN.wheelR); model.set(1, S.dist / TRAIN.wheelR); model.set(2, S.dist / TRAIN.wheelR); model.set(3, S.dist / TRAIN.wheelR);
      model.flush();
    }
    function update(dt, st) {
      if (!S.triggered && st.s >= cx.s - TRIGGER_DIST && st.s < cx.s - 5) {
        S.triggered = true; S.tau = 0;
        events.emit('train:whistle', { distance: Math.hypot(st.x - S.xf, st.z - rail.z) });
      }
      let v = 0;
      if (S.triggered) {
        // wait (don't enter) while the truck is standing on the crossing
        const hold = S.xf > roadE && S.xf < roadE + 14 && Math.abs(st.s - cx.s) < 9 && st.speed < 5;
        if (!hold) S.tau += dt;
        v = hold ? 0 : speedAt(S.tau);
        S.dist = Math.min(dist(S.tau), D_MAX);
        S.xf = X0 - S.dist;
        place1();
      }
      // booms
      const wantDown = S.triggered && S.tau >= T_ENTER - BOOM_LEAD && S.tau < tauExit + 1.2;
      const target = wantDown ? 0 : RAISED;
      const rate = 0.85 * dt;
      boomAngle += Math.max(-rate, Math.min(rate, target - boomAngle));
      setBooms(boomAngle);
      // colliders (only while the train is near the road)
      if (S.xf < roadE + 10 && S.xf + L > roadW - 10) {
        for (const { d, c } of circles) {
          c.x = S.xf + d; c.z = rail.z; c.vx = -v; c.vz = 0;
          cols.push(c);
        }
      }
      // smoke
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = v > 0.5 ? 0.11 : 0.5;
        const p = puffs[puffI++ % NP];
        p.x = S.xf + 0.65; p.y = 3.4; p.z = rail.z; p.age = 0; p.life = 2.2 + Math.random() * 0.8;
      }
      for (let i = 0; i < NP; i++) {
        const p = puffs[i];
        p.age += dt;
        if (p.age >= p.life) { dm.scale.setScalar(0); }
        else {
          const k = p.age / p.life;
          p.y += (1.4 - k) * dt; p.x += (0.5 + v * 0.05) * dt;
          dm.position.set(p.x, p.y, p.z);
          dm.scale.setScalar((0.2 + 0.75 * k) * (1 - k * k * 0.6));
        }
        dm.updateMatrix();
        smokeMesh.setMatrixAt(i, dm.matrix);
      }
      smokeMesh.instanceMatrix.needsUpdate = true;
    }
    reset();
    return { update, reset, S };
  })();

  // =============================================================================================
  function reset() {
    cols.length = 0;
    trams.reset(); carts.reset(); peds.reset(); train.reset();
  }
  reset();

  return {
    update(dt, st, t) {
      simT.t += dt; // own clock (independent of the caller's t)
      cols.length = 0;
      trams.update(dt, st);
      carts.update(dt, st);
      peds.update(dt, st);
      train.update(dt, st);
    },
    reset,
    debug: { trams, carts, train, avenue },
  };
}
