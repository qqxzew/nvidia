// Level 2 rats (owner: gameplay): random wanderers on the walkable floor. They pause and sniff, walk along
// the walls and into the dark, make sudden dashes, now and then dart across the player's path, bolt from a
// rolling barrel (squeal when hit) and from an approaching player (sometimes they freeze instead).
// Touching the player = a bite (handled by the caller through onBite).
import * as THREE from 'three';
import { createRat, RB } from './models2.js';

const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const rnd = (a, b) => a + Math.random() * (b - a);
const DEFLECT = [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5];
const _fix = { x: 0, z: 0 };

export function createRats(ctx2) {
  const { layout, config, events } = ctx2;
  const C = config.rats, RR = C.radius, BR = config.barrel.radius;
  const group = new THREE.Group();
  group.userData.dynamic = true;
  const rats = [];
  for (let i = 0; i < C.count; i++) {
    const rig = createRat();
    const g = new THREE.Group(); g.add(rig.mesh); group.add(g);
    rats.push({ i, rig, g, x: 0, z: 0, yaw: 0, speed: 0, tspeed: 0, mode: 'sniff', timer: 1, tx: 0, tz: 0,
      phase: Math.random() * TAU, seed: Math.random() * 10, squeakT: 3, crossT: 5, scare: 0, turn: 8, biteCd: 0 });
  }

  // darkness: far from the bright bulbs (precomputed per query, 9 bulbs)
  function darkness(x, z) {
    let m = 1e9;
    for (const b of layout.BULBS) { const d = ((b.x - x) ** 2 + (b.z - z) ** 2) / (0.2 + b.power); if (d < m) m = d; }
    return Math.min(1, Math.sqrt(m) / 6);
  }
  function clearLine(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.2);
    for (let k = 1; k <= n; k++) { const t = k / n; if (!layout.fits(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, RR)) return false; }
    return true;
  }
  function pickTarget(r, minD, maxD, P, awayX = 0, awayZ = 0) {
    let best = -1e9, bx = r.x, bz = r.z;
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * TAU, d = rnd(minD, maxD);
      let x = r.x + Math.sin(a) * d, z = r.z + Math.cos(a) * d;
      if (!layout.fits(x, z, RR) || !clearLine(r.x, r.z, x, z)) continue;
      const wall = layout.fits(x, z, 0.5) ? 0 : 1.4;
      let score = wall + darkness(x, z) * 1.2 + Math.random() * 0.8;
      if (P) { const dp = Math.hypot(x - P.x, z - P.z); if (dp < 2) score -= 2; }
      if (awayX || awayZ) score += 2.5 * (Math.sin(a) * awayX + Math.cos(a) * awayZ);
      if (score > best) { best = score; bx = x; bz = z; }
    }
    r.tx = bx; r.tz = bz;
    return best > -1e9;
  }
  function go(r, mode, speed, timer = 6) { r.mode = mode; r.tspeed = speed; r.timer = timer; r.turn = mode === 'walk' ? 7 : 14; }
  function sniff(r, tmin = 0.6, tmax = 2.4) { r.mode = 'sniff'; r.tspeed = 0; r.timer = rnd(tmin, tmax); }
  function flee(r, ax, az, P) {
    const l = Math.hypot(ax, az) || 1;
    pickTarget(r, 2.5, 6, P, ax / l, az / l);
    go(r, 'flee', C.fleeSpeed, rnd(1.2, 2.2));
  }
  function squeak(r, camX, camZ, camYaw, loud = false) {
    const dx = r.x - camX, dz = r.z - camZ, d = Math.hypot(dx, dz) || 1;
    const pan = Math.max(-1, Math.min(1, (dx * -Math.cos(camYaw) + dz * Math.sin(camYaw)) / d));
    events.emit('rat:squeak', { distance: d, pan, loud });
  }

  function reset() {
    const idx = layout.RAT_SPAWNS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    // keep the hall spawn (right next to the start) out of the first pick unless there are not enough others
    idx.sort((a, b) => (layout.RAT_SPAWNS[a].z < 0) - (layout.RAT_SPAWNS[b].z < 0));
    rats.forEach((r, i) => {
      const s = layout.RAT_SPAWNS[idx[i % idx.length]];
      Object.assign(r, { x: s.x, z: s.z, yaw: Math.random() * TAU, speed: 0, squeakT: rnd(2, 8), crossT: rnd(6, 12), scare: 0, biteCd: 0 });
      sniff(r, 0.5, 2);
      pose(r, 0, 0);
    });
  }

  /**
   * P = player state; barrels = barrel list; cam = {x, z, yaw}; canBite; onBite(rat)
   * returns the distance of the nearest rat to the player
   */
  function update(dt, t, P, barrels, cam, active, canBite, onBite) {
    let nearest = 1e9;
    for (const r of rats) {
      r.timer -= dt; r.crossT -= dt; r.squeakT -= dt;
      const pdx = r.x - P.x, pdz = r.z - P.z, pd = Math.hypot(pdx, pdz);
      // --- threats -----------------------------------------------------------------------------
      if (r.mode !== 'flee') {
        for (const b of barrels) {
          if (b.delivered) continue;
          const bx = Math.sin(b.yaw) * b.v, bz = Math.cos(b.yaw) * b.v, bs = Math.hypot(bx, bz);
          if (bs < 0.6) continue;
          const dx = r.x - b.x, dz = r.z - b.z, d = Math.hypot(dx, dz);
          if (d > 2.4) continue;
          const along = (dx * bx + dz * bz) / bs, across = (dx * bz - dz * bx) / bs;
          if (along > -0.3 && Math.abs(across) < 1.1) { // in its path: run sideways out of the line
            const s = across >= 0 ? 1 : -1;
            flee(r, (bz / bs) * s + (bx / bs) * 0.3, (-bx / bs) * s + (bz / bs) * 0.3, P);
            break;
          }
        }
      }
      if (active && r.mode !== 'flee' && r.mode !== 'cross' && pd < C.scareDist) {
        if (r.scare === 0) r.scare = Math.random() < 0.8 ? 1 : 2; // 1 = bolt, 2 = freeze
        if (r.scare === 1) flee(r, pdx, pdz, P);
        else if (r.mode !== 'sniff') sniff(r, 0.8, 1.5);
      } else if (pd > C.scareDist + 1.2) r.scare = 0;

      // --- behaviour --------------------------------------------------------------------------
      if (r.mode === 'sniff') {
        if (r.timer <= 0) {
          if (active && r.crossT <= 0 && pd < 7 && pd > 2) {
            // dart across in front of the player
            const hx = P.speed > 0.3 ? P.vx / P.speed : P.faceX, hz = P.speed > 0.3 ? P.vz / P.speed : P.faceZ;
            const ax = P.x + hx * (1.2 + P.speed * 0.5), az = P.z + hz * (1.2 + P.speed * 0.5);
            const dx = ax - r.x, dz = az - r.z, dl = Math.hypot(dx, dz) || 1;
            let ok = false;
            for (const over of [2.5, 1.6, 0.8]) {
              const tx = ax + (dx / dl) * over, tz = az + (dz / dl) * over;
              if (layout.fits(tx, tz, RR) && clearLine(r.x, r.z, tx, tz)) { r.tx = tx; r.tz = tz; ok = true; break; }
            }
            r.crossT = rnd(C.crossEvery[0], C.crossEvery[1]);
            if (ok) { go(r, 'cross', C.dashSpeed, 3); r.squeakT = Math.min(r.squeakT, 0.2); }
            else sniff(r, 0.3, 0.8);
          } else if (Math.random() < 0.72) { pickTarget(r, 1.5, 5.5, active ? P : null); go(r, 'walk', C.walkSpeed * rnd(0.8, 1.2), 9); }
          else { pickTarget(r, 3, 7, active ? P : null); go(r, 'dash', C.dashSpeed * rnd(0.85, 1.1), 4); }
        }
      } else if (r.timer <= 0 || Math.hypot(r.tx - r.x, r.tz - r.z) < 0.2) sniff(r);

      // --- motion -----------------------------------------------------------------------------
      if (r.mode !== 'sniff') {
        const want = Math.atan2(r.tx - r.x, r.tz - r.z);
        r.yaw = wrap(r.yaw + wrap(want - r.yaw) * Math.min(1, r.turn * dt));
      }
      r.speed += (r.tspeed - r.speed) * Math.min(1, dt * (r.tspeed > r.speed ? 10 : 14));
      if (r.speed > 0.02) {
        const step = r.speed * dt;
        let moved = false;
        for (const a of DEFLECT) {
          const yy = r.yaw + a, nx = r.x + Math.sin(yy) * step, nz = r.z + Math.cos(yy) * step;
          if (layout.fits(nx, nz, RR)) { r.x = nx; r.z = nz; if (a) r.yaw = wrap(r.yaw + a * 0.35); moved = true; break; }
        }
        if (!moved) { r.yaw = wrap(r.yaw + Math.PI * 0.6); sniff(r, 0.2, 0.6); }
      }
      // never inside a barrel; a fast barrel hitting a rat makes it squeal and bolt
      for (const b of barrels) {
        if (b.delivered) continue;
        const dx = r.x - b.x, dz = r.z - b.z, d = Math.hypot(dx, dz), m = BR + RR;
        if (d < m && d > 1e-4) {
          r.x = b.x + (dx / d) * m; r.z = b.z + (dz / d) * m;
          if (Math.abs(b.v) > 1.0 && r.mode !== 'flee') { squeak(r, cam.x, cam.z, cam.yaw, true); r.squeakT = rnd(2, 4); flee(r, dx, dz, P); }
        }
      }
      if (!layout.fits(r.x, r.z, RR * 0.6)) { _fix.x = r.x; _fix.z = r.z; layout.collideCircle(_fix, RR); r.x = _fix.x; r.z = _fix.z; }

      // --- bite ---------------------------------------------------------------------------------
      const d2 = Math.hypot(r.x - P.x, r.z - P.z);
      r.biteCd -= dt;
      if (active && canBite && d2 < C.biteDist && P.invuln <= 0 && r.biteCd <= 0) {
        onBite(r);
        squeak(r, cam.x, cam.z, cam.yaw, true); r.squeakT = rnd(3, 6);
        // the biter and every rat close by scatter; the biter won't bite again for a while
        for (const o of rats) {
          const dx = o.x - P.x, dz = o.z - P.z;
          if (o === r || dx * dx + dz * dz < 6.25) { flee(o, dx || 0.01, dz, P); o.timer = 2.5; o.scare = 1; }
        }
        r.biteCd = 6;
      }
      if (d2 < nearest) nearest = d2;
      if (r.squeakT <= 0) { squeak(r, cam.x, cam.z, cam.yaw); r.squeakT = rnd(C.squeakEvery[0], C.squeakEvery[1]); }
      pose(r, dt, t);
    }
    return nearest;
  }

  function pose(r, dt, t) {
    const B = r.rig.bones, m = Math.min(1, r.speed / 1.5);
    r.phase = (r.phase + r.speed * dt * 30 + dt * 2) % TAU;
    const s = Math.sin(r.phase), amp = 0.9 * Math.min(1, r.speed / 0.4);
    B[RB.legFL].rotation.x = s * amp; B[RB.legBR].rotation.x = s * amp;
    B[RB.legFR].rotation.x = -s * amp; B[RB.legBL].rotation.x = -s * amp;
    const rest = r.rig.rest[RB.body];
    B[RB.body].position.y = rest.y + Math.abs(s) * 0.012 * m;
    B[RB.body].rotation.x = Math.cos(r.phase) * 0.06 * m;
    const sn = r.mode === 'sniff' ? 1 : 0;
    B[RB.head].rotation.set(sn * (Math.sin(t * 19 + r.seed) * 0.07 - 0.1) - 0.05 * m, sn * Math.sin(t * 1.4 + r.seed) * 0.45, 0);
    for (let k = 0; k < 4; k++) {
      B[RB.t1 + k].rotation.set(k === 0 ? -0.12 * m : 0.04, Math.sin(t * (4 + 6 * m) - k * 0.9 + r.seed) * (0.18 + 0.2 * m), 0);
    }
    r.g.position.set(r.x, 0, r.z);
    r.g.rotation.y = r.yaw;
  }

  return { rats, group, reset, update };
}
