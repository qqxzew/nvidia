// Level 2 chase camera (owner: gameplay).
// ~4 m behind / 2.6 m above the cellarman, lazily follows his movement direction (keeps the stick intuitive),
// looks a little ahead (between him and the pushed barrel), never through walls (layout.rayDist) or above the
// vault (layout.ceilAt). In the 3 m bays it swings toward open space, comes closer and drops to an
// over-the-shoulder view (also used while pushing, so the barrel stays visible).
import * as THREE from 'three';

const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createCamera2(ctx2) {
  const { camera, layout, config } = ctx2;
  const K = config.camera;
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  const dPos = new THREE.Vector3(), dLook = new THREE.Vector3();
  const _p = { x: 0, z: 0 };
  let yaw = 0, dist = K.distance, shake = 0;
  const view = { x: 0, z: 0, yaw: 0, inputYaw: 0 }; // yaw = actual view heading (audio pan, guide); inputYaw = stick reference

  ctx2.events.on('barrel:bump', (e) => { shake = Math.max(shake, e.strength * 0.05); });
  ctx2.events.on('rat:bite', () => { shake = Math.max(shake, 0.12); });

  let shoulder = 0, side = 1, close = 0, shoulderA = 0;
  const SHOULDER_STEPS = [1, 0.6, 0.3, 0];
  function desired(P, pushB, dt) {
    // over-the-shoulder while pushing (so the barrel is not hidden behind his back) and when cramped
    // (so we never look straight down on his cap). The stick still maps to `yaw`.
    const wantShoulder = Math.max(pushB ? 1 : 0, clamp((close - 0.25) * 2.5, 0, 1));
    if (dt >= 0) {
      if (wantShoulder > 0 && shoulder < 0.05) {
        const rx = -Math.cos(yaw), rz = Math.sin(yaw);
        side = layout.rayDist(P.x, P.z, rx, rz, 3) >= layout.rayDist(P.x, P.z, -rx, -rz, 3) ? 1 : -1;
      }
      shoulder += (wantShoulder - shoulder) * Math.min(1, dt * 1.5);
    } else shoulder = 0;
    // shoulder angle adapts to the room: in a 3 m aisle a full 0.5 rad offset would drive the camera into the
    // casks and collapse the distance (camera inside his head). Give up angle before giving up distance.
    const wantA = side * 0.5 * shoulder;
    let bestA = 0, bestFree = -1;
    for (let i = 0; i < SHOULDER_STEPS.length; i++) {
      const a = wantA * SHOULDER_STEPS[i], c = yaw + a;
      const fr = layout.rayDist(P.x, P.z, -Math.sin(c), -Math.cos(c), K.distance + 0.6) - 0.4;
      if (fr >= K.distance * 0.8) { bestA = a; bestFree = fr; break; }
      if (fr > bestFree + 0.2) { bestA = a; bestFree = fr; }
    }
    if (dt >= 0) shoulderA += (bestA - shoulderA) * Math.min(1, dt * 3); else shoulderA = bestA;
    const cy = yaw + shoulderA; // camera sits behind-right (side 1) of the line
    const bx = -Math.sin(cy), bz = -Math.cos(cy);
    const free = layout.rayDist(P.x, P.z, bx, bz, K.distance + 0.6) - 0.4;
    const want = clamp(free, 0.9, K.distance);
    if (dt < 0) dist = want; else dist += (want - dist) * Math.min(1, dt * (want < dist ? 14 : 1.8));
    close = 1 - dist / K.distance;                    // 0 far .. ~0.75 very close
    // close in: drop toward shoulder height and look further ahead instead of hovering over his head
    dPos.set(P.x + bx * dist, K.height - Math.max(0, close - 0.4) * 1.4, P.z + bz * dist);
    // side walls / pillars: push the camera point out of solid space
    _p.x = dPos.x; _p.z = dPos.z; layout.collideCircle(_p, 0.28); dPos.x = _p.x; dPos.z = _p.z;
    dPos.y = Math.min(dPos.y, layout.ceilAt(dPos.x, dPos.z) - 0.25, layout.ceilAt(P.x, P.z) - 0.2);
    // look target: a bit ahead of the player; while pushing, between him and the barrel
    const ahead = K.lookAhead + close * 1.6;
    let ax = P.x + Math.sin(yaw) * ahead, az = P.z + Math.cos(yaw) * ahead;
    if (pushB) { ax = ax * 0.4 + (pushB.x + Math.sin(yaw) * 0.6) * 0.6; az = az * 0.4 + (pushB.z + Math.cos(yaw) * 0.6) * 0.6; }
    dLook.set(ax, K.lookHeight + close * 0.2, az);
  }

  function snap(P) {
    yaw = P.yaw; dist = K.distance;
    desired(P, null, -1);
    pos.copy(dPos); look.copy(dLook);
    apply();
  }

  function apply() {
    camera.position.copy(pos);
    if (shake > 0.002) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; }
    camera.lookAt(look);
    view.x = camera.position.x; view.z = camera.position.z;
    view.yaw = Math.atan2(look.x - pos.x, look.z - pos.z);
    view.inputYaw = yaw;
  }

  /** chase update. P = player state, pushB = pushed barrel or null, orbit = rad/s slow orbit (win screen) */
  function update(dt, P, pushB, orbit = 0) {
    let target = null, rate = 0;
    if (pushB) { target = Math.atan2(pushB.x - P.x, pushB.z - P.z); rate = K.follow * 1.1; }
    else if (P.speed > 0.4) { target = Math.atan2(P.vx, P.vz); rate = K.follow * Math.min(1, P.speed / 2.2); }
    if (target !== null) {
      const d = wrap(target - yaw);
      // walking toward the camera: don't whip around, drift slowly (the stick stays camera-relative)
      // and sideways movement is followed more slowly than forward movement (no circling with a diagonal stick)
      if (Math.abs(d) > 2.2) rate *= 0.18;
      else if (!pushB) rate *= Math.max(0.4, Math.cos(d));
      yaw = wrap(yaw + d * Math.min(1, rate * dt));
    }
    if (orbit) yaw = wrap(yaw + orbit * dt);
    // cramped (3 m bays, corners): swing toward the nearby direction with the most room behind him,
    // instead of squeezing in over his head
    const room = layout.rayDist(P.x, P.z, -Math.sin(yaw), -Math.cos(yaw), K.distance);
    if (room < K.distance - 0.3) {
      let best = room, bestA = 0;
      for (let k = 1; k <= 5; k++) for (let si = 0; si < 2; si++) {
        const a = (si ? -1 : 1) * k * 0.3, r = layout.rayDist(P.x, P.z, -Math.sin(yaw + a), -Math.cos(yaw + a), K.distance) - k * 0.12;
        if (r > best + 0.25) { best = r; bestA = a; }
      }
      if (bestA) yaw = wrap(yaw + Math.sign(bestA) * Math.min(Math.abs(bestA), dt * 1.6 * (1 - room / K.distance) * 2));
    }
    desired(P, pushB, dt);
    const k = 1 - Math.exp(-K.stiffness * dt);
    pos.lerp(dPos, k);
    look.lerp(dLook, Math.min(1, k * 1.4));
    // the lagging position must never end up behind a wall: clamp along the player->camera ray
    const ex = pos.x - P.x, ez = pos.z - P.z, el = Math.hypot(ex, ez);
    if (el > 0.05) {
      const free = layout.rayDist(P.x, P.z, ex / el, ez / el, el + 0.4) - 0.3;
      if (free < el) { const s = Math.max(0.6, free) / el; pos.x = P.x + ex * s; pos.z = P.z + ez * s; }
    }
    pos.y = Math.min(pos.y, layout.ceilAt(pos.x, pos.z) - 0.2);
    pos.y += P.bob * 0.25; // subtle head-bob
    shake *= Math.max(0, 1 - dt * 8);
    apply();
  }

  // --- brief / countdown: establishing shot from the dock down the gallery, then a glide into the chase cam
  const IP = new THREE.Vector3(), IL = new THREE.Vector3();
  function introPose(t) {
    IP.set(Math.sin(t * 0.13) * 1.6, 3.2 + Math.sin(t * 0.21) * 0.15, -6.8);
    IL.set(Math.sin(t * 0.09) * 1.2, 1.0, 8);
  }
  function intro(t) {
    introPose(t);
    pos.copy(IP); look.copy(IL); apply();
  }
  function fly(u, t, P) {
    // u 0..1 over the countdown
    introPose(t);
    yaw = P.yaw; dist = K.distance;
    desired(P, null, -1);
    const e = u * u * (3 - 2 * u);
    pos.copy(IP).lerp(dPos, e);
    look.copy(IL).lerp(dLook, e);
    apply();
  }

  function setFov() { if (camera.fov !== K.fov) { camera.fov = K.fov; camera.updateProjectionMatrix(); } }
  setFov();
  return { snap, update, intro, fly, view, get yaw() { return yaw; } };
}
