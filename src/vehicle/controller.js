import * as THREE from 'three';

// Arcade driving model for the 1920s brewery truck.
// Kinematic bicycle model + grip limit, corridor (curb/wall) collisions against the route,
// circle collisions against static props and traffic, surface vibration and hazards.

const ROUGHNESS = { square: 0.45, town: 0.4, suburb: 0.25, field: 0.55, brewery: 0.3 };
const WHEEL_RADIUS = 0.45;

export function createController(ctx, truck) {
  const { route, events, config } = ctx;
  const C = config.truck;

  const st = {
    x: 0, z: 0, yaw: 0, speed: 0, steer: 0, wheelAngle: 0,
    yawRate: 0, latAcc: 0, longAcc: 0, sliding: false,
    s: 0, lateral: 0, index: -1, zone: 'square', progress: 0,
    wheelSpin: 0, pitch: 0, roll: 0, heave: 0, vib: 0,
    distance: 0,
  };
  const v = new THREE.Vector2();
  let impactCooldown = 0;
  let bumpCooldown = 0;
  let lastZone = null;
  const hazardHit = new Map();

  function reset(startS = 4) {
    const f = route.frameAt(startS);
    st.x = f.x; st.z = f.z; st.yaw = f.yaw; st.speed = 0; st.steer = 0; st.wheelAngle = 0;
    st.yawRate = 0; st.latAcc = 0; st.longAcc = 0; st.index = -1; st.distance = 0;
    st.pitch = 0; st.roll = 0; st.heave = 0;
    hazardHit.clear(); lastZone = null;
    const p = route.project(st.x, st.z);
    st.s = p.s; st.lateral = p.lateral; st.index = p.index; st.zone = route.zoneAt(st.s);
    apply(0);
  }

  function impact(strength, kind) {
    if (impactCooldown > 0 || strength < 0.06) return;
    impactCooldown = 0.35;
    events.emit('impact', { strength: Math.min(1, strength), x: st.x, z: st.z, kind });
  }

  function update(dt, input, active) {
    impactCooldown -= dt; bumpCooldown -= dt;
    const steerIn = active ? input.steer : 0;
    const thr = active ? input.throttle : 0;
    const brk = active ? input.brake : 1;

    // --- steering (smoothed) ---
    st.steer += (steerIn - st.steer) * Math.min(1, C.steerRate * dt);
    const speedFactor = Math.min(1, Math.abs(st.speed) / C.maxSpeed);
    st.wheelAngle = st.steer * THREE.MathUtils.lerp(C.maxSteer, C.highSpeedSteer, speedFactor);

    // --- longitudinal ---
    const prevSpeed = st.speed;
    let acc;
    if (thr > 0 && brk > 0) acc = st.speed > 0 ? -C.brake * brk : 0;
    else if (thr > 0) acc = st.speed < -0.2 ? C.brake : C.accel * thr * (1 - Math.pow(Math.max(0, st.speed) / C.maxSpeed, 2));
    else if (brk > 0) acc = st.speed > 0.2 ? -C.brake * brk : (active ? -C.accel * 0.7 * brk : -Math.sign(st.speed) * C.brake);
    else acc = -Math.sign(st.speed) * C.coastDrag;
    st.speed += acc * dt;
    if (!thr && !(brk && active) && Math.abs(st.speed) < 0.25) st.speed = 0;
    if (!active && Math.abs(st.speed) < 0.3) st.speed = 0;
    st.speed = THREE.MathUtils.clamp(st.speed, -C.reverseMax, C.maxSpeed);

    // --- lateral / yaw ---
    let yawRate = (st.speed * Math.tan(st.wheelAngle)) / C.wheelBase;
    const lat = st.speed * yawRate;
    st.sliding = Math.abs(lat) > C.gripLimit;
    if (st.sliding) yawRate *= C.gripLimit / Math.abs(lat);
    st.yawRate = yawRate;
    st.yaw -= yawRate * dt; // steer right (+) => heading rotates toward -X when facing +Z
    st.latAcc = st.speed * yawRate; // + = turning right, cargo pushed to the left (+X local)
    st.longAcc = (st.speed - prevSpeed) / Math.max(dt, 1e-4);

    const hx = Math.sin(st.yaw), hz = Math.cos(st.yaw);
    st.x += hx * st.speed * dt;
    st.z += hz * st.speed * dt;
    st.distance += Math.abs(st.speed) * dt;

    // --- corridor collision (curbs / house fronts / fences) ---
    let p = route.project(st.x, st.z, st.index);
    const hw = route.halfWidthAt(p.s) - C.halfWidth * 0.85;
    if (Math.abs(p.lateral) > hw) {
      const f = route.frameAt(p.s);
      const sgn = Math.sign(p.lateral);
      const excess = Math.abs(p.lateral) - hw;
      st.x -= f.rx * sgn * excess; st.z -= f.rz * sgn * excess;
      // velocity into the wall
      v.set(hx * st.speed, hz * st.speed);
      const nx = f.rx * sgn, nz = f.rz * sgn;
      const vn = v.x * nx + v.y * nz;
      if (vn > 0) {
        const strength = vn / 7;
        impact(strength, 'wall');
        // scrape: lose the normal component, bleed some speed, nudge heading along the road
        st.speed *= 1 - Math.min(0.6, strength * 0.7);
        const along = Math.atan2(f.tx, f.tz);
        const dir = st.speed >= 0 ? along : along + Math.PI;
        st.yaw += angleDelta(st.yaw, dir) * Math.min(1, 0.15 + strength * 0.5);
      }
      p = route.project(st.x, st.z, p.index);
    }
    // don't let the player reverse out of the start
    if (p.s < 2 && st.speed < 0) { st.speed = 0; }

    // --- circle colliders: static props + traffic ---
    collideCircles(ctx.colliders);
    if (ctx.dynamicColliders) collideCircles(ctx.dynamicColliders);

    p = route.project(st.x, st.z, p.index);
    st.s = p.s; st.lateral = p.lateral; st.index = p.index;
    st.progress = st.s / route.length;
    st.zone = route.zoneAt(st.s);
    if (st.zone !== lastZone) { lastZone = st.zone; events.emit('zone', { id: st.zone }); }

    // --- surface vibration, random cobble bumps, hazards ---
    const rough = ROUGHNESS[st.zone] ?? 0.3;
    const sf = Math.min(1, Math.abs(st.speed) / C.maxSpeed);
    st.vib = rough * sf;
    if (active && bumpCooldown <= 0 && Math.random() < rough * Math.abs(st.speed) * dt * 0.03) {
      bumpCooldown = 0.4;
      events.emit('bump', { strength: rough * sf * (0.5 + Math.random() * 0.5) });
      st.heave += 0.05 * sf;
    }
    if (ctx.hazards) {
      for (let i = 0; i < ctx.hazards.length; i++) {
        const h = ctx.hazards[i];
        if (Math.abs(h.s - st.s) > h.radius + 3) continue;
        const d = Math.hypot(h.lateral - st.lateral, h.s - st.s);
        const inside = d < h.radius + 0.9;
        if (inside && !hazardHit.get(h)) {
          hazardHit.set(h, true);
          const strength = h.strength * (0.3 + 0.7 * sf);
          events.emit('bump', { strength });
          st.heave += 0.12 * strength;
        } else if (!inside && d > h.radius + 2) hazardHit.set(h, false);
      }
    }

    apply(dt);
  }

  // Three circles along the truck body vs. circle colliders.
  const OFFS = [-C.halfLength * 0.65, 0, C.halfLength * 0.65];
  function collideCircles(list) {
    if (!list) return;
    const hx = Math.sin(st.yaw), hz = Math.cos(st.yaw);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.active === false) continue;
      const dx0 = c.x - st.x, dz0 = c.z - st.z;
      if (dx0 * dx0 + dz0 * dz0 > (c.r + 6) ** 2) continue;
      for (const o of OFFS) {
        const cx = st.x + hx * o, cz = st.z + hz * o;
        const dx = cx - c.x, dz = cz - c.z;
        const d = Math.hypot(dx, dz);
        const minD = c.r + C.halfWidth;
        if (d < minD && d > 1e-4) {
          const nx = dx / d, nz = dz / d;
          st.x += nx * (minD - d); st.z += nz * (minD - d);
          const relVx = hx * st.speed - (c.vx || 0), relVz = hz * st.speed - (c.vz || 0);
          const vn = -(relVx * nx + relVz * nz);
          if (vn > 0) {
            const strength = vn / 6;
            impact(strength, c.kind || 'obstacle');
            st.speed *= 1 - Math.min(0.75, strength * 0.8);
            if (c.onHit) c.onHit(strength);
          }
          break;
        }
      }
    }
  }

  function apply(dt) {
    const g = truck.group;
    g.position.set(st.x, 0, st.z);
    g.rotation.y = st.yaw;
    // suspension feel: pitch from accel, roll from cornering, heave + vibration
    const targetPitch = THREE.MathUtils.clamp(-st.longAcc * 0.006, -0.05, 0.05);
    const targetRoll = THREE.MathUtils.clamp(st.latAcc * 0.007, -0.06, 0.06);
    const k = Math.min(1, dt * 6);
    st.pitch += (targetPitch - st.pitch) * k;
    st.roll += (targetRoll - st.roll) * k;
    st.heave *= Math.max(0, 1 - dt * 6);
    const t = performance.now() * 0.001;
    const vib = st.vib * 0.012;
    if (truck.body) {
      truck.body.rotation.x = st.pitch + Math.sin(t * 31) * vib;
      truck.body.rotation.z = st.roll + Math.sin(t * 27 + 1.3) * vib;
      truck.body.position.y = Math.abs(Math.sin(t * 23)) * vib * 2 + st.heave;
    }
    st.wheelSpin += (st.speed * dt) / WHEEL_RADIUS;
    truck.setWheels?.(st.wheelSpin, st.wheelAngle);
  }

  return { state: st, update, reset };
}

function angleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
