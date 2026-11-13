import * as THREE from 'three';

// Smooth chase camera that stays inside the street corridor (never clips into house fronts).
export function createCameraRig(ctx) {
  const { camera, route, config } = ctx;
  const K = config.camera;
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  let camYaw = 0;
  let shake = 0;
  let hint = -1;

  ctx.events.on('impact', (e) => { shake = Math.max(shake, e.strength * 0.35); });
  ctx.events.on('bump', (e) => { shake = Math.max(shake, e.strength * 0.08); });

  function snap(st) {
    camYaw = st.yaw;
    compute(st);
    pos.copy(desired); look.copy(desiredLook);
    camera.position.copy(pos); camera.lookAt(look);
  }

  function compute(st) {
    const hx = Math.sin(camYaw), hz = Math.cos(camYaw);
    desired.set(st.x - hx * K.distance, K.height, st.z - hz * K.distance);
    // keep the camera inside the corridor (+2 m sidewalk)
    const p = route.project(desired.x, desired.z, hint);
    hint = p.index;
    const lim = route.halfWidthAt(p.s) + 2;
    if (Math.abs(p.lateral) > lim) {
      const f = route.frameAt(p.s);
      const ex = Math.abs(p.lateral) - lim;
      const sg = Math.sign(p.lateral);
      desired.x -= f.rx * sg * ex; desired.z -= f.rz * sg * ex;
      desired.y += Math.min(3, ex * 0.6);
    }
    const ahead = K.lookAhead + Math.max(0, st.speed) * 0.25;
    desiredLook.set(st.x + Math.sin(st.yaw) * ahead, K.lookHeight, st.z + Math.cos(st.yaw) * ahead);
  }

  function update(dt, st) {
    // camera yaw lags behind the truck yaw (more lag when reversing is not wanted)
    const target = st.speed < -0.5 ? st.yaw : st.yaw;
    let d = target - camYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    camYaw += d * Math.min(1, dt * 3.2);
    compute(st);
    const k = 1 - Math.exp(-K.stiffness * dt);
    pos.lerp(desired, k);
    look.lerp(desiredLook, Math.min(1, k * 1.6));
    camera.position.copy(pos);
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.max(0, 1 - dt * 7);
    }
    camera.lookAt(look);
    const sf = Math.min(1, Math.max(0, st.speed) / ctx.config.truck.maxSpeed);
    const fov = K.fov + K.fovBoost * sf * sf;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix(); }
  }

  // --- establishing shot of náměstí Republiky (menu) and fly-in to the chase cam (countdown) ---
  // open south part of the plaza, looking north-west: cathedral tower on the left, truck on the right
  const INTRO_POS = new THREE.Vector3(10, 9, 38);
  const INTRO_LOOK = new THREE.Vector3(-15, 34, -20);
  const iPos = new THREE.Vector3();
  const iLook = new THREE.Vector3();
  function introPose(t) {
    // slow drift so the menu background feels alive
    iPos.set(INTRO_POS.x + Math.sin(t * 0.07) * 4, INTRO_POS.y + Math.sin(t * 0.11) * 1.2, INTRO_POS.z + Math.cos(t * 0.07) * 3);
    iLook.set(INTRO_LOOK.x + Math.sin(t * 0.05) * 6, INTRO_LOOK.y, INTRO_LOOK.z);
  }
  function introMenu(t) {
    introPose(t);
    camera.position.copy(iPos); camera.lookAt(iLook);
    if (camera.fov !== K.fov) { camera.fov = K.fov; camera.updateProjectionMatrix(); }
  }
  /** k: 0..1 progress of the countdown. At k = 1 the pose equals the chase pose exactly. */
  function introFly(k, st, t) {
    introPose(t);
    camYaw = st.yaw;
    compute(st);
    const e = k * k * (3 - 2 * k);
    pos.copy(iPos).lerp(desired, e);
    const arc = Math.sin(e * Math.PI);
    pos.y += arc * 7;   // over the market stalls
    pos.x += arc * 15;  // swing east over the road, clear of the cathedral apse
    look.copy(iLook).lerp(desiredLook, Math.min(1, e * 1.15));
    camera.position.copy(pos); camera.lookAt(look);
  }

  // --- main menu: a short film about Světovar — slow dolly shots joined by dissolves ---------------
  // Every shot is framed in the right part of the screen (setViewOffset), the menu lives on the left.
  const TITLE_C = new THREE.Vector3(-110, 0, 925);
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const SHOTS = [
    // aerial reveal of the whole complex from the south-east, as on the aerial postcard
    { p0: V(66, 72, 1108), p1: V(38, 58, 1062), l0: V(-118, 6, 928), l1: V(-126, 12, 918), fov: 48, dur: 11 },
    // low in the field across the road: grass, the lattice fence, the chimney towering (photo with the people)
    { p0: V(46, 2.4, 760), p1: V(46, 2.8, 806), l0: V(-76, 22, 879.5), l1: V(-98, 18, 902), fov: 40, dur: 10 },
    // slow crane up the chimney with the brewhouse below and its smoke above
    { p0: V(-30, 8, 836), p1: V(-36, 22, 850), l0: V(-76, 22, 879.5), l1: V(-76, 36, 879.5), fov: 44, dur: 9 },
    // arrival: from the field road through the gate with its name board, wagons and the clock tower behind
    { p0: V(34, 3.2, 925), p1: V(16, 3.6, 936), l0: V(-60, 9, 935), l1: V(-108, 13, 926), fov: 46, dur: 9 },
  ];
  const TOTAL = SHOTS.reduce((a, s) => a + s.dur, 0);
  const DISSOLVE = 0.8;
  let offsetOn = false;
  let tt = 0;
  const lp = new THREE.Vector3();
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x); // ease-in-out sine

  /** Advance the menu film; returns the dip-to-dark amount 0..1 for the grade (dissolves between shots). */
  function titleShots(dt) {
    tt += dt;
    let u = tt % TOTAL, i = 0;
    while (u > SHOTS[i].dur) { u -= SHOTS[i].dur; i++; }
    const s = SHOTS[i];
    rig.shot = i;
    const k = ease(u / s.dur);
    camera.position.lerpVectors(s.p0, s.p1, k);
    lp.lerpVectors(s.l0, s.l1, k);
    camera.lookAt(lp);
    if (camera.fov !== s.fov) { camera.fov = s.fov; }
    const w = innerWidth, h = innerHeight;
    camera.setViewOffset(w, h, -w * 0.2, 0, w, h); // also updates the projection matrix
    offsetOn = true;
    const edge = Math.min(u, s.dur - u);
    const open = Math.max(0, 1 - tt / 1.6); // fade in from dark when the menu opens
    return Math.max(open, edge < DISSOLVE ? 1 - edge / DISSOLVE : 0);
  }
  function titleReset() { tt = 0; }
  function titleSeek(x) { tt = x; } // debug: jump to a moment of the menu film
  function clearOffset() {
    if (offsetOn) { camera.clearViewOffset(); offsetOn = false; camera.fov = K.fov; camera.updateProjectionMatrix(); }
  }

  const rig = { update, snap, introMenu, introFly, titleShots, titleReset, titleSeek, clearOffset, titleCenter: TITLE_C, shot: 0 };
  return rig;
}
