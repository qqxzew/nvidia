// Level 2 player (owner: gameplay): the cellarman — camera-relative analog movement, wall collision,
// procedural animation (walk cycle, idle breathing, leaning push with 2-bone arm IK onto the barrel, bite flinch).
import * as THREE from 'three';
import { createCellarman, B } from './models2.js';

const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createPlayer(ctx2) {
  const { layout, config } = ctx2;
  const C = config.player;
  const rig = createCellarman();
  const group = new THREE.Group();
  group.add(rig.mesh);
  group.userData.dynamic = true;
  const bones = rig.bones, rest = rig.rest;

  const P = {
    x: 0, z: 0, yaw: 0, vx: 0, vz: 0, speed: 0,
    faceX: 0, faceZ: 1,      // facing unit vector (sin yaw, cos yaw)
    dirX: 0, dirZ: 1, stick: 0, // desired move direction (world) + stick magnitude
    push: null, pushDist: 0, // barrel being pushed (set by barrels.interact)
    flinch: 0, invuln: 0,
    walkPhase: 0, walkAmt: 0, pushAmt: 0, flinchT: 1, handZ: 0.62, bob: 0,
  };

  function reset() {
    const s = layout.PLAYER_START;
    Object.assign(P, { x: s.x, z: s.z, yaw: s.yaw, vx: 0, vz: 0, speed: 0, faceX: Math.sin(s.yaw), faceZ: Math.cos(s.yaw),
      dirX: 0, dirZ: 1, stick: 0, push: null, pushDist: 0, flinch: 0, invuln: 0, walkPhase: 0, walkAmt: 0, pushAmt: 0, flinchT: 1, bob: 0 });
    apply(0, 0);
  }

  function bite() {
    P.flinch = C.flinchTime; P.flinchT = 0; P.invuln = C.invulnTime; P.push = null;
    P.vx *= 0.2; P.vz *= 0.2;
  }

  /** input {x, y} screen-space stick; camYaw = camera heading; active = state 'playing' */
  const _p = { x: 0, z: 0 };
  function control(dt, input, camYaw, active) {
    P.flinch = Math.max(0, P.flinch - dt);
    P.invuln = Math.max(0, P.invuln - dt);
    let ix = active ? input.x || 0 : 0, iy = active ? input.y || 0 : 0;
    let mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
    if (mag < 0.08 || P.flinch > 0) mag = 0;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
    if (mag > 0) {
      const wx = fx * iy + rx * ix, wz = fz * iy + rz * ix, l = Math.hypot(wx, wz) || 1;
      P.dirX = wx / l; P.dirZ = wz / l;
    }
    P.stick = mag;
    // speed: analog, gentle acceleration
    const vmax = (P.push ? C.pushSpeed : C.walkSpeed) * mag;
    const tvx = P.dirX * vmax, tvz = P.dirZ * vmax;
    let dvx = tvx - P.vx, dvz = tvz - P.vz;
    const dl = Math.hypot(dvx, dvz);
    const a = (mag > 0 ? C.accel : C.decel) * dt;
    if (dl > a) { dvx *= a / dl; dvz *= a / dl; }
    P.vx += dvx; P.vz += dvz;
    // facing turns toward the stick direction (rate-limited while pushing)
    if (mag > 0) {
      const d = wrap(Math.atan2(P.dirX, P.dirZ) - P.yaw);
      let step = d * Math.min(1, C.turnRate * dt);
      if (P.push) step = clamp(step, -C.pushTurnRate * dt, C.pushTurnRate * dt);
      P.yaw = wrap(P.yaw + step);
    }
    P.faceX = Math.sin(P.yaw); P.faceZ = Math.cos(P.yaw);
    P.x += P.vx * dt; P.z += P.vz * dt;
    collideWalls();
  }

  function collideWalls() {
    _p.x = P.x; _p.z = P.z;
    const hit = layout.collideCircle(_p, C.radius);
    P.x = _p.x; P.z = _p.z;
    if (hit) { const vn = P.vx * hit.nx + P.vz * hit.nz; if (vn < 0) { P.vx -= vn * hit.nx; P.vz -= vn * hit.nz; } }
  }

  // --- animation ----------------------------------------------------------------------------------
  const L1 = 0.27, L2 = 0.3; // upper arm, forearm + hand
  function armIK(lean, hipsY, hipsZ, hy, hz) {
    // shoulder in model space (spine pivots 0.08 above the hips bone)
    const sy = hipsY + 0.08 + 0.45 * Math.cos(lean), sz = hipsZ + 0.45 * Math.sin(lean);
    const dy = hy - sy, dz = hz - sz;
    const D = clamp(Math.hypot(dy, dz), 0.2, L1 + L2 - 0.005);
    const phi = Math.atan2(-dz, -dy);
    const a1 = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    const a2 = Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
    ikOut.arm = phi + a1 - lean;
    ikOut.fore = -(Math.PI - a2);
  }
  const ikOut = { arm: 0, fore: 0 };

  function apply(dt, t) {
    const sp = Math.hypot(P.vx, P.vz);
    P.speed = sp;
    const k = Math.min(1, dt * 8);
    P.walkAmt += (Math.min(1, sp / 1.6) - P.walkAmt) * k;
    const pushing = !!P.push && P.pushDist < config.player.radius + config.barrel.pushRadius + 0.14;
    P.pushAmt += ((pushing ? 1 : 0) - P.pushAmt) * Math.min(1, dt * 7);
    P.walkPhase = (P.walkPhase + (sp * dt * TAU) / (pushing ? 1.0 : 1.35)) % TAU;
    P.flinchT = Math.min(1, P.flinchT + dt / C.flinchTime);
    if (pushing) {
      // hands on the upper back of the barrel: barrel centre in model space minus its radius at ~55°
      const dx = P.push.x - P.x, dz = P.push.z - P.z;
      const lz = dx * Math.sin(P.yaw) + dz * Math.cos(P.yaw);
      P.handZ += (lz - 0.19 - P.handZ) * Math.min(1, dt * 12);
    }

    const w = P.walkAmt, pa = P.pushAmt, ph = P.walkPhase;
    const sw = Math.sin(ph), cw = Math.cos(ph);
    const ft = P.flinchT;
    const f = ft < 1 ? (ft < 0.15 ? ft / 0.15 : 1 - (ft - 0.15) / 0.85) ** 1.5 : 0;
    const breath = Math.sin(t * 1.7);

    // hips
    const hipsY = rest[B.hips].y - 0.035 * w * Math.abs(sw) - 0.09 * pa + 0.05 * f;
    const hipsZ = -0.06 * pa;
    bones[B.hips].position.set(0, hipsY, hipsZ);
    bones[B.hips].rotation.set(0, 0.09 * sw * w * (1 - pa), 0);
    P.bob = hipsY - rest[B.hips].y;
    // legs: stride, knee bend in the swing phase, slanted back while pushing
    const stride = 0.55 * w * (1 - 0.3 * pa);
    const knee = w * (1 - 0.45 * pa);
    bones[B.thighL].rotation.set(-sw * stride + 0.22 * pa, 0, 0);
    bones[B.thighR].rotation.set(sw * stride + 0.22 * pa - 0.75 * f, 0, 0);
    bones[B.shinL].rotation.set(knee * (0.1 + 0.85 * Math.max(0, cw)) + 0.18 * pa, 0, 0);
    bones[B.shinR].rotation.set(knee * (0.1 + 0.85 * Math.max(0, -cw)) + 0.18 * pa + 1.3 * f, 0, 0);
    bones[B.apron].rotation.set(-Math.max(0, stride * Math.abs(sw)) * 0.8 - 0.05 * pa - 0.3 * f, 0, 0);
    // spine: lean, counter-twist, breathing, flinch recoil
    const lean = 0.05 * w + 0.6 * pa + breath * 0.016 * (1 - w) - 0.42 * f;
    bones[B.spine].rotation.set(lean, -0.12 * sw * w * (1 - pa), 0);
    bones[B.head].rotation.set(-lean * 0.55 + 0.4 * f + Math.sin(t * 0.37) * 0.04 * (1 - w), Math.sin(t * 0.23) * 0.2 * (1 - w) * (1 - pa), Math.sin(t * 45) * 0.06 * f);
    // arms: walk swing vs. IK onto the barrel
    let armW = 0.45 * w, foreW = -0.18 - 0.3 * w;
    armIK(lean, hipsY, hipsZ, 0.6, P.handZ);
    for (let si = 0; si < 2; si++) {
      const s = si ? -1 : 1;
      const swing = s > 0 ? sw * armW : -sw * armW;
      const armX = swing * (1 - pa) + ikOut.arm * pa - (s > 0 ? 1.2 : 0.95) * f;
      const foreX = foreW * (1 - pa) + ikOut.fore * pa - 0.6 * f;
      const armZ = s * (0.06 + breath * 0.012 * (1 - w) - 0.09 * pa + 0.45 * f);
      bones[s > 0 ? B.armL : B.armR].rotation.set(armX, 0, armZ);
      bones[s > 0 ? B.foreL : B.foreR].rotation.set(foreX, 0, 0);
    }
    bones[B.root].rotation.set(0, Math.sin(t * 38) * 0.07 * f, 0);
    group.position.set(P.x, 0, P.z);
    group.rotation.y = P.yaw;
  }

  return { P, group, mesh: rig.mesh, reset, control, collideWalls, animate: apply, bite };
}
