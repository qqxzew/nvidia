// Level 2 barrels (owner: gameplay): rolling physics, pushing, bounces, delivery onto the dock.
//
// A barrel lies on its side. yaw = ROLLING direction R = (sin yaw, cos yaw); the barrel axis A = (cos yaw, -sin yaw)
// is horizontal and perpendicular to it. State: v = rolling speed along R (signed — it rolls either way),
// s = sideways slide speed along A (heavy friction), roll = visual roll angle (= distance / 0.33).
//
// Pushing (see interact()):
//   * contact from behind (contact normal within 40° of ±R) while the stick points at the barrel -> the barrel
//     picks up the player's forward speed (with a little inertia) and its rolling direction is steered toward the
//     player's facing, rate-limited (0.95 rad/s at speed -> ~2.1 m turning radius at 2 m/s). The pusher is pulled
//     softly onto the barrel's centre line, so it is easy to keep. Turning harder than 55° away loses the barrel:
//     it rolls on alone (0.55 s before it can be grabbed again).
//   * contact from the side -> it slides slowly along its axis and swivels its rolling direction toward the push.
//   * free: rolls on, decelerates 1 m/s², bounces softly off walls (velocity reflected, damped, yaw partially
//     re-aligned to the new direction) and off other barrels; emits 'barrel:bump'.
import * as THREE from 'three';
import { createBarrelMesh } from '../vehicle/truckModel.js';

const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const toward = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createBarrels(ctx2) {
  const { layout, events, config } = ctx2;
  const C = config.barrel, PR = config.player.radius;
  const T = layout.TARGET;
  const N = config.barrels;

  // one instanced draw call for all barrels (geometry/material reused from level 1's createBarrelMesh)
  const proto = createBarrelMesh(ctx2);
  const mesh = new THREE.InstancedMesh(proto.geometry, proto.material, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.userData.dynamic = true;

  const list = [];
  for (let i = 0; i < N; i++) {
    list.push({ i, x: 0, z: 0, yaw: 0, v: 0, s: 0, roll: 0, delivered: false, anim: -1, slot: 0,
      ax: 0, az: 0, ayaw: 0, aroll: 0, regrab: 0, lose: 0, bumpCd: 0, pushed: false, touched: false, pin: 0, pinX: 0, pinZ: 0, inDock: false });
  }
  let delivered = 0;

  function reset() {
    delivered = 0;
    list.forEach((b, i) => {
      const sp = layout.BARREL_SPAWNS[i % layout.BARREL_SPAWNS.length];
      Object.assign(b, { x: sp.x, z: sp.z, yaw: sp.yaw, v: 0, s: 0, roll: (i * 1.7) % TAU, delivered: false, anim: -1, slot: 0,
        regrab: 0, lose: 0, bumpCd: 0, pushed: false, touched: false, pin: 0, pinX: 0, pinZ: 0, inDock: false });
    });
    writeMatrices(0);
  }

  // decompose a world velocity into rolling / sliding parts; yaw partially re-aligned to it (barrels roll both ways)
  function setVelocity(b, vx, vz, realign) {
    const sp = Math.hypot(vx, vz);
    if (realign > 0 && sp > 0.08) {
      let d = wrap(Math.atan2(vx, vz) - b.yaw);
      if (d > Math.PI / 2) d -= Math.PI; else if (d < -Math.PI / 2) d += Math.PI;
      b.yaw = wrap(b.yaw + d * realign);
    }
    const rx = Math.sin(b.yaw), rz = Math.cos(b.yaw);
    b.v = vx * rx + vz * rz;
    b.s = vx * rz - vz * rx; // A = (rz, -rx)
  }

  function bump(b, strength, x, z) {
    if (b.bumpCd > 0 || strength < 0.04) return;
    b.bumpCd = 0.22;
    events.emit('barrel:bump', { strength: Math.min(1, strength), x, z });
  }

  /**
   * Player <-> barrel contact. P = player state (mutated: position corrected, P.push set).
   * Called after the player moved, before update().
   */
  function interact(dt, P) {
    const D = PR + C.pushRadius;            // centre distance at contact (0.7)
    const REACH = 0.16;                      // hands reach a bit further than the body
    let pushB = null;
    for (const b of list) {
      b.pushed = false; b.touched = false;
      if (b.delivered) continue;
      b.regrab -= dt;
      let dx = b.x - P.x, dz = b.z - P.z;
      const d = Math.hypot(dx, dz) || 1e-4;
      if (d > D + REACH) { b.lose = 0; continue; }
      const nx = dx / d, nz = dz / d;
      const rx = Math.sin(b.yaw), rz = Math.cos(b.yaw);
      const c = nx * rx + nz * rz;
      const intent = P.stick > 0.12 ? P.dirX * nx + P.dirZ * nz : 0; // stick toward the barrel
      const approach = Math.max(0, P.vx * nx + P.vz * nz);
      const behind = Math.abs(c) >= C.behindCos;
      let pushing = false;

      if (behind && intent > 0.45 && b.regrab <= 0 && P.flinch <= 0 && !pushB) {
        const sg = c >= 0 ? 1 : -1, fx = sg * rx, fz = sg * rz;   // the barrel's forward (away from the pusher)
        const ang = wrap(Math.atan2(P.faceX, P.faceZ) - Math.atan2(fx, fz));
        if (Math.abs(ang) > C.loseAngle) {
          b.lose += dt;
          if (b.lose > C.loseTime) { b.regrab = C.regrab; b.lose = 0; }
        } else b.lose = Math.max(0, b.lose - dt);
        if (b.regrab <= 0) {
          pushB = b; b.pushed = true; b.touched = true;
          // rolling speed follows the pusher's forward speed (push only, never pull)
          const u = P.vx * fx + P.vz * fz;
          let vf = b.v * sg;
          if (u > vf) vf += (u - vf) * Math.min(1, C.follow * dt);
          vf = Math.min(vf, C.maxSpeed);
          b.v = vf * sg;
          b.s *= Math.max(0, 1 - 6 * dt);
          // steer the rolling direction toward the player's facing, rate-limited
          const rate = C.pivotRate + (C.turnRate - C.pivotRate) * Math.min(1, Math.abs(vf) / C.turnSpeed);
          const lim = Math.abs(ang) > C.loseAngle ? 0 : rate * dt;
          b.yaw = wrap(b.yaw + clamp(ang, -lim, lim));
          // pull the pusher onto the centre line behind the barrel
          const ax = Math.cos(b.yaw), az = -Math.sin(b.yaw);
          const lat = (P.x - b.x) * ax + (P.z - b.z) * az;
          const k = Math.min(1, C.magnet * dt);
          P.x -= ax * lat * k; P.z -= az * lat * k;
          P.pushDist = d;
          pushing = true;
        }
      }
      if (!pushing && d < D + 0.03 && intent > 0.2 && approach > 0.05) {
        // side push (or behind during the regrab cooldown): slide along the axis, swivel toward the push
        const ax = rz, az = -rx;
        const ca = nx * ax + nz * az;
        const push = approach * intent;
        b.touched = true;
        b.s += (Math.sign(ca) * push * C.sideSlide * Math.abs(ca) - b.s) * Math.min(1, 6 * dt);
        const vr = c * push * 0.8;
        if ((vr > 0 && vr > b.v) || (vr < 0 && vr < b.v)) b.v += (vr - b.v) * Math.min(1, 4 * dt);
        if (!behind) {
          const sg = c >= 0 ? 1 : -1;
          const ang = wrap(Math.atan2(nx, nz) - Math.atan2(sg * rx, sg * rz));
          const lim = C.sideSwivel * Math.min(1, push / 1.5) * dt;
          b.yaw = wrap(b.yaw + clamp(ang, -lim, lim));
        }
      }
      // never overlap: the player gives way; a barrel rolling into the player is stopped by his legs
      if (d < D) {
        const pen = D - d;
        P.x -= nx * pen * 0.85; P.z -= nz * pen * 0.85;
        b.x += nx * pen * 0.15; b.z += nz * pen * 0.15;
        const rx2 = Math.sin(b.yaw), rz2 = Math.cos(b.yaw);
        let vx = rx2 * b.v + rz2 * b.s, vz = rz2 * b.v - rx2 * b.s;
        const vn = vx * nx + vz * nz;
        if (vn < -0.05) {
          vx -= 1.25 * vn * nx; vz -= 1.25 * vn * nz;
          setVelocity(b, vx, vz, 0);
          if (vn < -0.8) bump(b, -vn / 4, b.x, b.z);
        }
      }
    }
    P.push = pushB;
  }

  const _p = { x: 0, z: 0 };
  function update(dt, onDelivered) {
    for (const b of list) {
      if (b.delivered) { if (b.anim >= 0 && b.anim < 1) b.anim = Math.min(1, b.anim + dt / C.deliverTime); continue; }
      b.bumpCd -= dt;
      if (!b.pushed) b.v = toward(b.v, 0, C.rollFriction * dt);
      b.s = toward(b.s, 0, C.slideFriction * dt);
      b.v = clamp(b.v, -C.maxSpeed, C.maxSpeed);
      const rx = Math.sin(b.yaw), rz = Math.cos(b.yaw);
      let vx = rx * b.v + rz * b.s, vz = rz * b.v - rx * b.s;
      b.x += vx * dt; b.z += vz * dt;
      b.roll += (b.v * dt) / C.rollRadius;
      _p.x = b.x; _p.z = b.z;
      const hit = layout.collideCircle(_p, C.radius);
      if (hit) { b.x = _p.x; b.z = _p.z; }
      if (hit) {
        const vn = vx * hit.nx + vz * hit.nz;
        if (vn < 0) {
          // reflect the normal part (damped), damp the tangential part, re-align the rolling direction
          let tx = vx - vn * hit.nx, tz = vz - vn * hit.nz;
          tx *= 0.85; tz *= 0.85;
          vx = tx - vn * C.restitution * hit.nx; vz = tz - vn * C.restitution * hit.nz;
          setVelocity(b, vx, vz, C.realign);
          if (-vn > C.bumpMin) bump(b, -vn / 2.6, b.x, b.z);
        }
        // anti soft-lock: a barrel pinned against a wall (or into a corner) by the pusher for a moment rolls
        // out along the wall, toward the side with more room (push-only would otherwise trap it in corners)
        if (Math.hypot(b.x - b.pinX, b.z - b.pinZ) > 0.15) { b.pinX = b.x; b.pinZ = b.z; b.pin = 0; } // it is getting somewhere
        else if (b.touched) b.pin += dt;
        if (b.pin > C.pinTime) {
          let tx = -hit.nz, tz = hit.nx;
          if (layout.rayDist(b.x, b.z, -tx, -tz, 4) > layout.rayDist(b.x, b.z, tx, tz, 4)) { tx = -tx; tz = -tz; }
          b.yaw = Math.atan2(tx + hit.nx * 0.25, tz + hit.nz * 0.25); b.v = C.pinKick; b.s = 0; b.pin = 0; b.regrab = 0.45;
          bump(b, 0.3, b.x, b.z);
        }
      } else b.pin = Math.max(0, b.pin - dt * 2);
    }
    // barrel <-> barrel (equal masses)
    const R2 = C.radius * 2;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]; if (a.delivered) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]; if (b.delivered) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 >= R2 * R2) continue;
        const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d, pen = R2 - d;
        a.x -= nx * pen * 0.5; a.z -= nz * pen * 0.5; b.x += nx * pen * 0.5; b.z += nz * pen * 0.5;
        const arx = Math.sin(a.yaw), arz = Math.cos(a.yaw), brx = Math.sin(b.yaw), brz = Math.cos(b.yaw);
        let avx = arx * a.v + arz * a.s, avz = arz * a.v - arx * a.s;
        let bvx = brx * b.v + brz * b.s, bvz = brz * b.v - brx * b.s;
        const rel = (bvx - avx) * nx + (bvz - avz) * nz;
        if (rel < 0) {
          const jn = -(1 + C.barrelRestitution) * rel * 0.5;
          avx -= jn * nx; avz -= jn * nz; bvx += jn * nx; bvz += jn * nz;
          setVelocity(a, avx, avz, C.realign * 0.6); setVelocity(b, bvx, bvz, C.realign * 0.6);
          if (-rel > C.bumpMin) bump(a, -rel / 2.6, (a.x + b.x) / 2, (a.z + b.z) / 2);
        }
        // pushing it out of a wall again would be nice but collideCircle runs next frame anyway
      }
    }
    // delivery: centre inside the chalk rectangle
    for (const b of list) {
      if (b.delivered) continue;
      if (b.x > T.x0 && b.x < T.x1 && b.z > T.z0 && b.z < T.z1) {
        b.delivered = true; b.anim = 0; b.slot = delivered; b.ax = b.x; b.az = b.z; b.ayaw = b.yaw; b.aroll = b.roll;
        b.v = 0; b.s = 0;
        delivered++;
        onDelivered?.(b, delivered);
      }
    }
  }

  // --- visuals ------------------------------------------------------------------------------------
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
  const _pos = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const LAY = new THREE.Quaternion().setFromAxisAngle(Z, Math.PI / 2); // mesh axis Y -> -X, bung (+X) -> up
  function lyingQuat(out, yaw, roll, wob) {
    out.setFromAxisAngle(Y, yaw);
    _q2.setFromAxisAngle(Z, wob); out.multiply(_q2);
    _q2.setFromAxisAngle(X, roll); out.multiply(_q2);
    out.multiply(LAY);
    return out;
  }
  const ease = (t) => t * t * (3 - 2 * t);
  function writeMatrices() {
    for (const b of list) {
      if (b.delivered) {
        const slot = layout.DOCK_SLOTS[Math.min(b.slot, layout.DOCK_SLOTS.length - 1)];
        const t = ease(Math.max(0, b.anim));
        lyingQuat(_q, b.ayaw, b.aroll, 0);
        _q3.setFromAxisAngle(Y, 0.4 * (b.slot - 1.5)); // stood upright, bung turned a little
        _q.slerp(_q3, Math.min(1, t * 1.25));
        _pos.set(b.ax + (slot.x - b.ax) * t, 0.33 + (slot.y + 0.4 - 0.33) * t + Math.sin(Math.PI * t) * 0.35, b.az + (slot.z - b.az) * t);
      } else {
        const sp = Math.min(1, Math.abs(b.v) / 1.5);
        const wob = Math.sin(b.roll) * 0.03 * sp;
        lyingQuat(_q, b.yaw, b.roll, wob);
        _pos.set(b.x, 0.33 + Math.abs(Math.sin(b.roll * 2)) * 0.006 * sp, b.z);
      }
      _m.compose(_pos, _q, _one);
      mesh.setMatrixAt(b.i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    list, mesh, reset, interact, update, writeMatrices,
    get delivered() { return delivered; },
    /** max rolling speed of any free barrel (audio) */
    maxRoll() { let m = 0; for (const b of list) if (!b.delivered) m = Math.max(m, Math.hypot(b.v, b.s)); return m; },
  };
}
