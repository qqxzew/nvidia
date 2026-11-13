// Level 3 actors: 1920s gangsters breaking in through the hall windows, plus the innocent night watchman.
// Contract: docs/LEVEL3.md (createGangsters, v2 stealing flow). Every actor is ONE SkinnedMesh with rigid (1-bone) skinning:
// body, hat, crowbar and the carried barrel are all bones of one shared per-variant geometry, so an actor
// costs a single draw call (the watchman adds his glowing lantern: +2). Model faces +Z, origin at the feet.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, cylZ, sph, link, merge, vcolMaterial } from '../../vehicle/trafficModels.js';
import { createBarrelMesh } from '../../vehicle/truckModel.js';

// ------------------------------------------------------------------------------------------------
// skeleton
// ------------------------------------------------------------------------------------------------
const BONES = ['root', 'hips', 'spine', 'head', 'armL', 'armR', 'thighL', 'thighR', 'shinL', 'shinR', 'hat', 'barrel', 'lantern'];
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const PARENT = { hips: 'root', spine: 'hips', head: 'spine', armL: 'spine', armR: 'spine', thighL: 'hips', thighR: 'hips',
  shinL: 'thighL', shinR: 'thighR', hat: 'head', barrel: 'spine', lantern: 'armR' };
// bind-pose joint positions in model space (base size, ~1.75 m man). The model's right hand is at -X.
const REST = {
  root: [0, 0, 0], hips: [0, 0.95, 0], spine: [0, 1.0, 0], head: [0, 1.5, 0],
  armL: [0.21, 1.44, 0], armR: [-0.21, 1.44, 0], thighL: [0.09, 0.92, 0], thighR: [-0.09, 0.92, 0],
  shinL: [0.09, 0.49, 0], shinR: [-0.09, 0.49, 0], hat: [0, 1.71, 0], barrel: [0, 1.12, 0.38], lantern: [-0.25, 0.9, 0.04],
};
const HIP_DROP = 0.46; // hips lowering for a full crouch (thigh -1.45, shin +1.9)

// ------------------------------------------------------------------------------------------------
// variants
// ------------------------------------------------------------------------------------------------
const SKIN = 0xc9a283;
const VARIANTS = {
  // charcoal pinstripe suit, black fedora, red tie
  g0: { suit: 0x464852, legs: 0x3e4048, stripe: 0xa4a4ac, shirt: 0xd8d2c0, tie: 0x7a1f1c, hat: 0x34343a, band: 0x141416, hatType: 'fedora', skin: SKIN, hair: 0x2a1d14, crowbar: true },
  // camel long coat, brown fedora, moustache
  g1: { suit: 0xa08058, legs: 0x48443e, coat: true, shirt: 0xcfc8b4, tie: 0x2a3a5a, hat: 0x6a5238, band: 0x1a1410, hatType: 'fedora', skin: 0xb98e6c, hair: 0x3a2818, moustache: 0x2a1d14, crowbar: true },
  // tweed jacket, flat cap, red scarf
  g2: { suit: 0x7a7258, legs: 0x504a40, shirt: 0xc8bea8, scarf: 0x8a3028, hat: 0x6a6452, hatType: 'cap', skin: 0xc29a7a, hair: 0x4a3420, stubble: true, crowbar: true },
  // navy pinstripe, pale grey fedora, mustard tie
  g3: { suit: 0x34405e, legs: 0x2e3852, stripe: 0xb0b6c8, shirt: 0xe2dccb, tie: 0xb98a2f, hat: 0xa09d94, band: 0x1a1a1a, hatType: 'fedora', skin: SKIN, hair: 0x1a120c, crowbar: true },
  // the boss: big, black long coat, white scarf, cigar. Needs two hits.
  tough: { suit: 0x2e2e34, legs: 0x26262c, coat: true, shirt: 0xd8d2c0, tie: 0x7a1f1c, scarf: 0xe6e0d0, hat: 0x222226, band: 0x7a2420, hatType: 'fedora', skin: 0xb88a68, hair: 0x15100c, cigar: true, stubble: true, wide: 1.28, scale: 1.12, crowbar: true },
  // night watchman: blue-grey uniform coat with brass buttons, peaked cap, moustache, lantern
  watch: { suit: 0x45546a, legs: 0x2e343e, coat: true, buttons: 0xc9a040, shirt: 0x45546a, hat: 0x2e343e, band: 0xb98a2f, hatType: 'peak', skin: SKIN, hair: 0x6a6258, moustache: 0x6a6258, lantern: true },
};
const GANGSTER_KEYS = ['g0', 'g1', 'g2', 'g3'];

function withSkin(geo, bone) {
  const n = geo.attributes.position.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return geo;
}

let barrelSrc = null;
function buildFigure(o, ctx) {
  const W = o.wide || 1;
  const parts = {}; // bone name -> geometries
  const add = (bone, ...g) => { (parts[bone] ||= []).push(...g); };
  const skinD = new THREE.Color(o.skin).multiplyScalar(0.8).getHex();
  const shoe = 0x141210;

  // legs
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R', x = s * 0.09;
    add('thigh' + L, box(0.14 * W, 0.46, 0.15, o.legs, x, 0.7, 0));
    add('shin' + L, box(0.12 * W, 0.44, 0.13, o.legs, x, 0.27, 0), box(0.12, 0.08, 0.25, shoe, x, 0.04, 0.045));
  }
  // pelvis / coat skirt
  add('hips', box(0.33 * W, 0.18, 0.21, o.legs, 0, 0.9, 0));
  if (o.coat) add('hips', cyl(0.215 * W, 0.27 * W, 0.46, 8, o.suit, 0, 0.74, 0, { sz: 0.8 }));
  // torso
  const R = 0.19 * W, ZS = 0.72;
  add('spine', cyl(R, R * 0.93, 0.5, 8, o.suit, 0, 1.22, 0, { sz: ZS }));
  add('spine', box(0.47 * W, 0.11, 0.25, o.suit, 0, 1.43, 0)); // shoulders
  add('spine', cyl(0.055, 0.06, 0.1, 6, o.skin, 0, 1.5, 0)); // neck
  const front = R * ZS + 0.005;
  add('spine', box(0.09, 0.17, 0.02, o.shirt, 0, 1.38, front)); // shirt V
  if (o.tie) add('spine', box(0.035, 0.22, 0.02, o.tie, 0, 1.31, front + 0.008));
  for (const s of [1, -1]) add('spine', box(0.05, 0.22, 0.02, new THREE.Color(o.suit).multiplyScalar(0.75).getHex(), s * 0.055, 1.36, front + 0.004, { rz: s * 0.35 })); // lapels
  if (o.buttons) for (let i = 0; i < 4; i++) for (const s of [1, -1]) add('spine', sph(0.012, 4, 3, o.buttons, s * 0.06, 1.38 - i * 0.12, front + 0.004));
  if (o.stripe) {
    for (let i = -5; i <= 5; i++) {
      if (i === 0) continue;
      const th = (i / 5.5) * Math.PI * 0.9;
      add('spine', box(0.006, 0.48, 0.004, o.stripe, Math.sin(th) * (R + 0.003), 1.22, Math.cos(th) * (R * ZS + 0.003), { ry: th }));
    }
  }
  if (o.scarf) add('spine', cyl(0.1, 0.13, 0.08, 8, o.scarf, 0, 1.48, 0), box(0.07, 0.22, 0.02, o.scarf, 0.06, 1.33, front + 0.012, { rz: 0.1 }));
  // head
  add('head', sph(0.115, 8, 6, o.skin, 0, 1.61, 0.005));
  add('head', sph(0.118, 7, 5, o.hair, 0, 1.63, -0.025, { sy: 0.85 }));
  add('head', box(0.03, 0.055, 0.045, skinD, 0, 1.6, 0.115)); // nose
  for (const s of [1, -1]) {
    add('head', box(0.022, 0.014, 0.01, 0x14100c, s * 0.04, 1.632, 0.106)); // eyes
    add('head', box(0.045, 0.014, 0.012, o.hair, s * 0.045, 1.655, 0.104, { rz: s * -0.25 })); // brows (scowl)
    add('head', box(0.025, 0.05, 0.03, skinD, s * 0.115, 1.61, 0)); // ears
  }
  if (o.moustache) add('head', box(0.085, 0.02, 0.02, o.moustache, 0, 1.572, 0.11));
  if (o.stubble) add('head', sph(0.1, 6, 4, new THREE.Color(o.skin).multiplyScalar(0.62).getHex(), 0, 1.565, 0.03, { sy: 0.55 }));
  if (o.cigar) add('head', cylZ(0.009, 0.009, 0.1, 5, 0x5a3a1c, 0.03, 1.555, 0.16), cylZ(0.01, 0.01, 0.012, 5, 0xff7a2a, 0.03, 1.555, 0.21));
  // hat
  if (o.hatType === 'fedora') {
    add('hat', cyl(0.095, 0.125, 0.13, 9, o.hat, 0, 1.75, 0), cyl(0.205, 0.205, 0.016, 12, o.hat, 0, 1.69, 0),
      cyl(0.127, 0.127, 0.032, 9, o.band, 0, 1.705, 0), box(0.012, 0.03, 0.14, new THREE.Color(o.hat).multiplyScalar(0.7).getHex(), 0, 1.81, 0));
  } else if (o.hatType === 'cap') {
    add('hat', cyl(0.13, 0.125, 0.06, 9, o.hat, 0, 1.71, -0.01, { sz: 1.08 }), box(0.17, 0.016, 0.1, o.hat, 0, 1.685, 0.125, { rx: 0.15 }), sph(0.015, 4, 3, o.hat, 0, 1.745, -0.01));
  } else if (o.hatType === 'peak') {
    add('hat', cyl(0.13, 0.115, 0.1, 9, o.hat, 0, 1.73, 0), cyl(0.132, 0.132, 0.02, 9, 0x111316, 0, 1.69, 0),
      box(0.17, 0.014, 0.09, 0x0e0f12, 0, 1.68, 0.12, { rx: 0.25 }), box(0.035, 0.035, 0.01, o.band, 0, 1.73, 0.125));
  }
  // arms (hanging, hands slightly forward)
  const cuff = new THREE.Color(o.suit).multiplyScalar(0.8).getHex();
  for (const s of [1, -1]) {
    const B = s > 0 ? 'armL' : 'armR', x0 = s * 0.21, x1 = s * 0.24;
    add(B, link([x0, 1.44, 0], [x1, 0.99, 0.03], 0.058 * W, 0.047 * W, o.suit, 6), cyl(0.05, 0.05, 0.04, 6, cuff, x1, 0.985, 0.03), sph(0.046, 5, 4, o.skin, x1, 0.94, 0.035));
  }
  if (o.crowbar) {
    const I = 0x45474c, x = -0.24;
    add('armR', link([x, 1.03, 0.0], [x, 0.3, 0.19], 0.014, 0.014, I, 5), link([x, 0.3, 0.19], [x, 0.27, 0.27], 0.013, 0.008, I, 5), link([x, 1.03, 0.0], [x, 1.08, 0.05], 0.013, 0.01, I, 5));
  }
  if (o.lantern) {
    const [lx, ly, lz] = REST.lantern, F = 0x1e1d1b;
    add('armR', link([-0.24, 0.94, 0.035], [lx, ly, lz], 0.006, 0.006, F, 4));
    add('lantern', box(0.13, 0.025, 0.13, F, lx, ly - 0.23, lz), cyl(0.02, 0.085, 0.06, 6, F, lx, ly - 0.06, lz), link([lx, ly - 0.03, lz], [lx, ly, lz], 0.01, 0.01, F, 4));
    for (const a of [-1, 1]) for (const b of [-1, 1]) add('lantern', box(0.012, 0.15, 0.012, F, lx + a * 0.055, ly - 0.15, lz + b * 0.055));
  }
  // carried barrel (lying across the arms), shares the truck barrel's geometry
  if (!o.lantern) {
    if (!barrelSrc) barrelSrc = createBarrelMesh(ctx).geometry;
    const bg = barrelSrc.clone();
    for (const k of Object.keys(bg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') bg.deleteAttribute(k);
    bg.rotateZ(Math.PI / 2); bg.translate(...REST.barrel);
    add('barrel', bg);
  }
  const list = [];
  for (const [bone, geos] of Object.entries(parts)) list.push(withSkin(merge(geos), BI[bone]));
  const geo = mergeGeometries(list, false);
  const S = o.scale || 1;
  if (S !== 1) geo.scale(S, S, S);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius += 2;
  return geo;
}

// ------------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------------
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOut = (t) => { t = clamp01(t); return 1 - (1 - t) * (1 - t); };
const easeIn = (t) => { t = clamp01(t); return t * t; };
const rnd = (a, b) => a + Math.random() * (b - a);
const range = (v, def) => (Array.isArray(v) ? v : def);

function glowTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,220,150,1)'); g.addColorStop(0.25, 'rgba(255,180,90,0.55)'); g.addColorStop(1, 'rgba(255,150,60,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Fallback stealable-barrel layout (v2 contract) if the hall does not provide barrelSlots:
// two groups of 5 lying barrels (axis along X), 3 on the floor + 2 on top, around (±6.5, 0, -3.2).
function fallbackSlots() {
  const out = [];
  for (const s of [-1, 1]) {
    for (const z of [-3.9, -3.2, -2.5]) out.push({ pos: new THREE.Vector3(s * 6.5, 0.36, z), yaw: 0 });
    for (const z of [-3.55, -2.85]) out.push({ pos: new THREE.Vector3(s * 6.5, 0.98, z), yaw: 0 });
  }
  return out;
}

/** Shared vertex-colour Lambert with a cool fresnel rim + a little self-lift so actors read in the dark hall. */
function actorMaterial() {
  const m = vcolMaterial();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: new THREE.Color(0x9fb6d8) };
    sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float nv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += uRim * (pow(1.0 - nv, 3.0) * 0.5) + diffuseColor.rgb * 0.08;
      }`);
  };
  m.customProgramCacheKey = () => 'g3-actor-rim';
  return m;
}

// ------------------------------------------------------------------------------------------------
// createGangsters
// ------------------------------------------------------------------------------------------------
export function createGangsters(ctx, hall) {
  const { scene, events, camera } = ctx;
  const C = Object.assign({ rise: 0.9, smash: 1.6, climb: 1.7, escape: 1.6, speedUpMin: 0.55, spawnInterval: [2.4, 0.9],
    maxActive: [1, 4], innocentChance: 0.12, toughChance: 0.15, walkSpeed: 2.3, carrySpeed: 1.6, pickup: 0.7 }, ctx.config?.gangsters || {});
  const MAX_ALIVE = 6, WATCH_WALK = 3.2, DOWN_T = 0.8, STAGGER_T = 0.55, FLOOR_T = 2.0, DROP_T = 1.1, INSIDE_D = 0.9;

  const root = new THREE.Group();
  root.name = 'gangsters';
  root.userData.dynamic = true;
  scene.add(root);

  const material = actorMaterial();
  const geos = {};
  const geoFor = (key) => (geos[key] ||= buildFigure(VARIANTS[key], ctx));
  const glowTex = glowTexture();

  const windows = hall.windows;
  const slots = Array.isArray(hall.barrelSlots) && hall.barrelSlots.length ? hall.barrelSlots : fallbackSlots();
  const slotState = slots.map(() => 'shelf'); // shelf | reserved | carried | dropped | gone
  const slotOwner = slots.map(() => null);
  const occupied = new Map();   // windowId -> actor
  const cooldown = new Map();   // windowId -> seconds until reusable
  const broken = new Set();     // windowIds whose glass we smashed
  const pool = [];              // all actors ever made (reused)
  const live = [];
  const dropped = [];           // barrels knocked out of a gangster's arms
  let nextId = 1, spawnT = 1.2, wasPlaying = false;

  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _oc = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qI = new THREE.Quaternion(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  const _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1);
  const _qLay = new THREE.Quaternion().setFromAxisAngle(_Z, -Math.PI / 2); // barrel mesh axis Y -> X
  const _glowOff = new THREE.Color(0x5a3a1a);

  const slotQuat = (i, out) => out.setFromAxisAngle(_Y, slots[i].yaw || 0); // local X = barrel axis
  const slotFree = (i) => slotState[i] === 'shelf' && (typeof hall.isBarrelVisible !== 'function' || hall.isBarrelVisible(i));

  // actors -------------------------------------------------------------------------------------
  function makeActor(key) {
    const def = VARIANTS[key];
    const S = def.scale || 1;
    const bones = BONES.map((n) => { const b = new THREE.Bone(); b.name = n; b.userData.dynamic = true; return b; });
    const rest = {};
    BONES.forEach((n, i) => {
      const p = PARENT[n], r = REST[n];
      const local = p ? new THREE.Vector3(r[0] - REST[p][0], r[1] - REST[p][1], r[2] - REST[p][2]) : new THREE.Vector3(...r);
      local.multiplyScalar(S);
      bones[i].position.copy(local);
      rest[n] = local.clone();
      if (p) bones[BI[p]].add(bones[i]);
    });
    const mesh = new THREE.SkinnedMesh(geoFor(key), material);
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.frustumCulled = false;
    mesh.castShadow = ctx.quality !== 'low';
    mesh.userData.dynamic = true;
    mesh.rotation.order = 'YXZ';
    mesh.visible = false;
    const b = Object.fromEntries(BONES.map((n, i) => [n, bones[i]]));
    const a = { key, def, S, mesh, b, rest, inUse: false, kind: key === 'watch' ? 'innocent' : 'gangster', tough: key === 'tough',
      hatVel: new THREE.Vector3(), hatSpin: new THREE.Vector3() };
    if (def.lantern) {
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.12, 0.085), glowMat);
      glow.position.set(0, -0.15 * S, 0);
      const haloMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const halo = new THREE.Sprite(haloMat);
      halo.scale.set(0.9, 0.9, 1);
      glow.add(halo);
      glow.userData.dynamic = halo.userData.dynamic = true;
      b.lantern.add(glow);
      a.glowMat = glowMat; a.haloMat = haloMat; a.halo = halo;
    }
    root.add(mesh);
    pool.push(a);
    return a;
  }

  function acquire(key) {
    let a = pool.find((p) => !p.inUse && p.key === key);
    if (!a) a = makeActor(key);
    a.inUse = true;
    // reattach the detachable bones (hat / lantern live in world space while flying)
    if (a.b.hat.parent !== a.b.head) { a.b.hat.removeFromParent(); a.b.head.add(a.b.hat); }
    if (a.b.lantern.parent !== a.b.armR) { a.b.lantern.removeFromParent(); a.b.armR.add(a.b.lantern); }
    if (a.glowMat) { a.glowMat.color.setHex(0xffd27a); a.haloMat.opacity = 1; }
    a.hatOff = false; a.hatVel.set(0, 0, 0); a.hatSpin.set(0, 0, 0);
    a.lanternOff = false; a.lanternVel = 0;
    a.mesh.position.set(0, -50, 0);
    a.mesh.visible = true;
    return a;
  }

  function unreserve(a) {
    const i = a.slot;
    if (i != null && slotOwner[i] === a) {
      if (slotState[i] === 'reserved') slotState[i] = 'shelf';
      slotOwner[i] = null;
    }
    a.slot = null;
  }

  function release(a) {
    unreserve(a);
    a.inUse = false;
    a.hasBarrel = false;
    a.mesh.visible = false;
    a.b.hat.scale.setScalar(0.0001); // a hat lying in world space would otherwise linger in the skeleton
    const i = live.indexOf(a);
    if (i >= 0) live.splice(i, 1);
    if (a.win && occupied.get(a.win.id) === a) { occupied.delete(a.win.id); cooldown.set(a.win.id, 1.2); }
  }

  // placement --------------------------------------------------------------------------------------
  /** d = distance OUTWARD from the inner sill face (negative = inside the hall). */
  function place(a, d, y) {
    const w = a.win;
    a.d = d; a.y = y;
    a.mesh.position.set(w.sill.x - w.normal.x * d, y, w.sill.z - w.normal.z * d);
  }
  const insidePoint = (w, out) => out.set(w.sill.x + w.normal.x * INSIDE_D, 0, w.sill.z + w.normal.z * INSIDE_D);
  function glassPos(w) { return { x: w.sill.x - w.normal.x * 0.3, y: 1.7, z: w.sill.z - w.normal.z * 0.3 }; }
  function headPos(a) {
    a.b.head.localToWorld(_v.set(0, 0.11 * a.S, 0));
    return { x: _v.x, y: _v.y, z: _v.z };
  }
  /** Walk toward (tx, tz) on the floor. Returns true when arrived. */
  function moveTo(a, tx, tz, speed, dt) {
    const p = a.mesh.position;
    const dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
    const step = Math.min(dist, speed * dt);
    if (dist > 1e-4) {
      p.x += (dx / dist) * step; p.z += (dz / dist) * step;
      if (dist > 0.05) turnTo(a, Math.atan2(dx, dz), dt);
    }
    p.y = 0; a.y = 0; a.d = -1;
    a.phase += step * 4.2; // ~1.5 m per stride cycle
    return dist - step <= 0.02;
  }
  function turnTo(a, yaw, dt) {
    let d = yaw - a.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    a.yaw += d * Math.min(1, dt * 10);
  }

  // pose helpers -------------------------------------------------------------------------------
  function resetPose(a) {
    for (const n of BONES) {
      const bn = a.b[n];
      if ((n === 'hat' && a.hatOff) || (n === 'lantern' && a.lanternOff)) continue;
      bn.position.copy(a.rest[n]);
      bn.rotation.set(0, 0, 0);
      bn.scale.set(1, 1, 1);
    }
    a.b.barrel.scale.setScalar(0.0001);
  }
  function crouch(a, w) { // w 0..1
    const b = a.b;
    b.hips.position.y -= HIP_DROP * a.S * w;
    b.thighL.rotation.x = b.thighR.rotation.x = -1.45 * w;
    b.shinL.rotation.x = b.shinR.rotation.x = 1.9 * w;
    b.spine.rotation.x += 0.5 * w;
    b.head.rotation.x -= 0.35 * w;
  }
  function legCycle(a, amp, armAmp = amp * 0.8) {
    const b = a.b, ph = a.phase;
    b.thighL.rotation.x = Math.sin(ph) * amp; b.thighR.rotation.x = -Math.sin(ph) * amp;
    b.shinL.rotation.x = Math.max(0, -Math.cos(ph)) * amp * 1.3; b.shinR.rotation.x = Math.max(0, Math.cos(ph)) * amp * 1.3;
    b.armL.rotation.x = -Math.sin(ph) * armAmp; b.armR.rotation.x = Math.sin(ph) * armAmp - 0.25;
    b.root.position.y += Math.abs(Math.sin(ph)) * amp * 0.06;
  }
  function holdArms(a, w) {
    const b = a.b;
    b.armL.rotation.x = lerp(b.armL.rotation.x, -1.15, w); b.armR.rotation.x = lerp(b.armR.rotation.x, -1.15, w);
    b.armL.rotation.z = lerp(b.armL.rotation.z, -0.18, w); b.armR.rotation.z = lerp(b.armR.rotation.z, 0.18, w);
  }
  /** Carried barrel: blend 0 = lying exactly in its slot, 1 = in the arms. Must run after all other bones are posed. */
  function poseBarrel(a) {
    const bb = a.b.barrel;
    if (!a.hasBarrel) { bb.scale.setScalar(0.0001); return; }
    const inv = 1 / a.S;
    if (a.barrelBlend >= 1) { bb.position.copy(a.rest.barrel); bb.quaternion.identity(); bb.scale.setScalar(inv); return; }
    a.mesh.updateMatrixWorld(true);
    const spineW = a.b.spine.matrixWorld;
    _m1.compose(a.rest.barrel, _qI, _s.setScalar(inv));
    _m2.multiplyMatrices(spineW, _m1).decompose(_w, _q2, _s); // carry pose, world
    const k = a.barrelBlend;
    _p.copy(slots[a.slot].pos).lerp(_w, k);
    slotQuat(a.slot, _q).slerp(_q2, k);
    _m1.compose(_p, _q, _s.setScalar(inv));
    _m2.copy(spineW).invert().multiply(_m1).decompose(bb.position, bb.quaternion, bb.scale);
  }

  function climbIn(a, u) {
    const b = a.b;
    a.yaw = a.yIn; a.facingOut = false;
    if (u < 0.35) { // hoist onto the sill
      const k = u / 0.35, e = smooth(k);
      place(a, lerp(0.95, 0.5, e), lerp(0, 0.9, e));
      crouch(a, e);
      b.armL.rotation.x = b.armR.rotation.x = lerp(-1.5, -0.6, e);
      b.thighL.rotation.x -= Math.sin(Math.PI * k) * 0.6;
    } else if (u < 0.65) { // crouch through the frame
      const k = smooth((u - 0.35) / 0.3);
      place(a, lerp(0.5, -0.2, k), 0.9);
      crouch(a, 1);
      b.armL.rotation.x = -0.7; b.armR.rotation.x = -0.6;
    } else { // hop down inside
      const k = (u - 0.65) / 0.35;
      a.inside = true;
      place(a, lerp(-0.2, -INSIDE_D, smooth(k)), 0.9 * (1 - easeIn(k)) + Math.sin(Math.PI * k) * 0.12);
      crouch(a, k < 0.75 ? 1 - k * 0.6 : lerp(0.55, 0.15, (k - 0.75) / 0.25));
      b.armL.rotation.x = b.armR.rotation.x = -0.9 + k * 0.5;
      b.armL.rotation.z = 0.4; b.armR.rotation.z = -0.4;
    }
  }
  function climbOut(a, u) {
    const b = a.b;
    a.yaw = a.yIn + Math.PI; a.facingOut = true;
    if (u < 0.3) { // up onto the sill from inside
      const e = smooth(u / 0.3);
      a.inside = true;
      place(a, lerp(-INSIDE_D, -0.25, e), lerp(0, 0.9, e));
      crouch(a, e);
      b.thighL.rotation.x -= Math.sin(Math.PI * u / 0.3) * 0.5;
    } else if (u < 0.6) { // across the sill
      a.inside = false;
      place(a, lerp(-0.25, 0.55, smooth((u - 0.3) / 0.3)), 0.9);
      crouch(a, 1);
    } else { // drop out of sight
      a.inside = false;
      const k = (u - 0.6) / 0.4;
      place(a, lerp(0.55, 1.1, smooth(k)), lerp(0.9, -1.6, easeIn(k)));
      crouch(a, 1 - smooth(k * 1.6));
    }
    if (!a.hasBarrel) { b.armL.rotation.x = -0.6; b.armR.rotation.x = -0.6; }
  }

  // stage poses (also used to freeze the pose while falling) ------------------------------------
  function poseGangster(a, T) {
    const b = a.b, u = a.dur > 0 ? clamp01(a.t / a.dur) : 1;
    resetPose(a);
    switch (a.stage) {
      case 'rise': {
        a.yaw = a.yIn; a.facingOut = false;
        place(a, 0.95, lerp(-1.4, 0, easeOut(u)));
        b.spine.rotation.x = 0.12;
        b.head.rotation.y = Math.sin(T * 2.3 + a.seed) * 0.35;
        b.armR.rotation.x = -0.55; b.armL.rotation.x = -0.25;
        break;
      }
      case 'smash': {
        a.yaw = a.yIn; a.facingOut = false;
        place(a, 0.95, 0);
        const s = (u * 2) % 1;
        let arm, lean;
        if (s < 0.55) { const k = smooth(s / 0.55); arm = lerp(-0.55, -2.9, k); lean = lerp(0.1, -0.15, k); }
        else if (s < 0.68) { const k = easeIn((s - 0.55) / 0.13); arm = lerp(-2.9, -1.25, k); lean = lerp(-0.15, 0.32, k); }
        else { const k = smooth((s - 0.68) / 0.32); arm = lerp(-1.25, -0.55, k); lean = lerp(0.32, 0.1, k); }
        b.armR.rotation.x = arm; b.armR.rotation.z = -0.15;
        b.spine.rotation.x = lean; b.spine.rotation.y = -0.15;
        b.armL.rotation.x = -1.2; b.armL.rotation.z = 0.35;
        b.head.rotation.x = -0.1;
        break;
      }
      case 'climb': climbIn(a, u); break;
      case 'walk': {
        legCycle(a, 0.55);
        b.spine.rotation.x = 0.12;
        b.head.rotation.y = Math.sin(T * 2.1 + a.seed) * 0.25;
        break;
      }
      case 'pickup': {
        const bw = lerp(0.35, 1, clamp01((1.1 - slots[a.slotUsed].pos.y) / 0.7));
        const bend = u < 0.4 ? smooth(u / 0.4) * bw : bw * (1 - smooth((u - 0.4) / 0.6));
        crouch(a, 0.55 * bend);
        b.spine.rotation.x += 0.75 * bend;
        b.armL.rotation.x = b.armR.rotation.x = lerp(-0.3, -1.3, bend);
        b.armL.rotation.z = -0.15 * bend; b.armR.rotation.z = 0.15 * bend;
        if (a.hasBarrel) holdArms(a, smooth((u - 0.4) / 0.6));
        break;
      }
      case 'carry': {
        legCycle(a, 0.32);
        holdArms(a, 1);
        b.spine.rotation.x = -0.12; // leaning back under the weight
        b.spine.rotation.z = Math.sin(a.phase * 0.5) * 0.08;
        b.root.position.x = Math.sin(a.phase * 0.5) * 0.04;
        break;
      }
      case 'escape': climbOut(a, u); if (a.hasBarrel) holdArms(a, 1); break;
      case 'giveup': {
        b.armR.rotation.x = -2.5 + Math.sin(T * 16) * 0.35; b.armR.rotation.z = -0.2;
        b.armL.rotation.x = -0.4; b.head.rotation.x = -0.3; b.spine.rotation.x = -0.1;
        break;
      }
      case 'flee': {
        if (a.fleePhase === 'walk') { legCycle(a, 0.75); b.spine.rotation.x = 0.3; }
        else if (a.fleePhase === 'climb') climbOut(a, u);
        else { // outside: just sink out of sight
          const k = clamp01(a.t / 0.7);
          place(a, lerp(a.fleeD, 1.0, smooth(k)), lerp(a.fleeY, -1.6, easeIn(k)));
          crouch(a, (1 - k) * (a.fleeY > 0.5 ? 1 : 0));
          b.armL.rotation.x = b.armR.rotation.x = -0.4;
        }
        break;
      }
    }
    a.mesh.rotation.y = a.yaw;
    b.spine.rotation.z += Math.sin(T * 1.7 + a.seed) * 0.03; // breathing / sway
    if (a.staggerT > 0) {
      const k = Math.sin(Math.PI * (1 - a.staggerT / STAGGER_T));
      b.spine.rotation.x -= 0.55 * k; b.head.rotation.x -= 0.5 * k;
      b.armL.rotation.z += 0.9 * k; b.armR.rotation.z -= 0.9 * k;
      b.root.position.z -= 0.18 * k;
    }
    poseBarrel(a);
  }

  /** Falling back out of the window (hit outside / on the sill). */
  function poseDown(a, T) {
    const b = a.b, u = clamp01(a.downT / DOWN_T), w = clamp01(a.downT / 0.12);
    poseGangster(a, T); // frozen stage pose (a.t no longer advances)
    const sg = a.facingOut ? 1 : -1; // always topple toward the outside
    b.root.rotation.x = sg * 1.7 * easeIn(u);
    b.root.position.z = sg * 0.55 * u;
    b.root.position.y = -2.2 * u * u;
    b.armL.rotation.x = lerp(b.armL.rotation.x, -2.7, w); b.armL.rotation.z = lerp(b.armL.rotation.z, 0.55, w);
    b.armR.rotation.x = lerp(b.armR.rotation.x, -2.5, w); b.armR.rotation.z = lerp(b.armR.rotation.z, -0.55, w);
    b.head.rotation.x = lerp(b.head.rotation.x, -0.6, w);
    b.thighL.rotation.x = lerp(b.thighL.rotation.x, -0.7, w);
    b.thighR.rotation.x = lerp(b.thighR.rotation.x, -0.3, w);
  }

  /** Knocked down inside the hall: falls on his back, lies dazed, gets up. */
  function poseFloor(a, T) {
    const b = a.b, ft = a.floorT;
    resetPose(a);
    a.mesh.rotation.y = a.yaw;
    const fall = easeIn(clamp01(ft / 0.4));
    const up = smooth((ft - 1.4) / 0.6);
    const lie = fall * (1 - up);
    b.root.rotation.x = -1.5 * lie;
    b.root.position.y = 0.11 * a.S * lie;
    b.root.position.z = -0.25 * lie;
    b.armL.rotation.z = 1.2 * lie; b.armR.rotation.z = -1.2 * lie;
    b.armL.rotation.x = -0.4 * lie;
    b.thighL.rotation.x = -0.5 * lie; b.shinL.rotation.x = 0.8 * lie;
    if (ft > 0.4 && ft < 1.5) b.head.rotation.y = Math.sin(T * 6) * 0.45; // dazed
    if (ft > 1.4) crouch(a, Math.sin(Math.PI * up) * 0.7); // scramble up
  }

  function poseWatch(a, T) {
    const b = a.b, w = a.win;
    resetPose(a);
    const tan = a.tan;
    a.mesh.position.set(w.sill.x - w.normal.x * 1.5 + tan.x * a.s, 0, w.sill.z - w.normal.z * 1.5 + tan.z * a.s);
    a.mesh.rotation.y = a.yaw;
    const running = a.state === 'down' && a.downT > 0.5;
    if (a.state === 'down' && !running) { // duck, arms over the head
      const k = smooth(a.downT / 0.15);
      crouch(a, k * 0.8);
      b.armL.rotation.x = b.armR.rotation.x = -2.7 * k;
      b.armL.rotation.z = -0.5 * k; b.armR.rotation.z = 0.5 * k;
      b.head.rotation.x = 0.4 * k;
    } else if (running) {
      legCycle(a, 0.8);
      b.spine.rotation.x = 0.3;
    } else {
      legCycle(a, 0.42);
      b.spine.rotation.x = 0.04;
      b.armR.rotation.x = -0.75;
      b.lantern.rotation.x = 0.75 + Math.sin(a.phase * 2) * 0.12; // keep the lantern hanging
      b.head.rotation.y = a.lookSign * (0.5 + Math.sin(T * 1.1) * 0.25) * smooth(Math.min(a.t, WATCH_WALK - a.t)); // peeks into the hall
    }
  }

  // hat / lantern / dropped barrels (world space) ----------------------------------------------------
  function knockHat(a) {
    if (a.hatOff) return;
    a.mesh.updateMatrixWorld(true);
    root.attach(a.b.hat);
    a.hatOff = true;
    const back = a.facingOut ? 1 : -1, ys = Math.sin(a.yaw), yc = Math.cos(a.yaw), side = rnd(-0.7, 0.7);
    a.hatVel.set(ys * back * rnd(1.1, 1.8) + yc * side, rnd(2.4, 3.2), yc * back * rnd(1.1, 1.8) - ys * side);
    a.hatSpin.set(rnd(-9, -5), rnd(-6, 6), rnd(-4, 4));
  }
  function flyHat(a, dt) {
    const h = a.b.hat;
    if (a.hatVel.lengthSq() === 0) return;
    a.hatVel.y -= 9 * dt;
    h.position.addScaledVector(a.hatVel, dt);
    h.rotation.x += a.hatSpin.x * dt; h.rotation.y += a.hatSpin.y * dt; h.rotation.z += a.hatSpin.z * dt;
    if (h.position.y < 0.03) { // lands (inside on the floor, outside on the yard)
      h.position.y = 0.03; a.hatVel.set(0, 0, 0);
      h.rotation.x = 0; h.rotation.z = 0;
    }
  }
  function dropLantern(a, dt) {
    const l = a.b.lantern;
    if (l.position.y <= 0.25) {
      l.rotation.z = lerp(l.rotation.z, 1.35, Math.min(1, dt * 12)); // tips over
      a.glowMat.color.lerp(_glowOff, Math.min(1, dt * 2));
      a.haloMat.opacity = Math.max(0, a.haloMat.opacity - dt * 1.5);
      return;
    }
    a.lanternVel -= 9 * dt;
    l.position.y = Math.max(0.25, l.position.y + a.lanternVel * dt);
  }

  function dropBarrel(a) {
    const i = a.slot;
    a.hasBarrel = false;
    a.slot = null;
    if (i == null) return;
    slotOwner[i] = null;
    slotState[i] = 'dropped';
    a.mesh.updateMatrixWorld(true);
    a.b.barrel.matrixWorld.decompose(_p, _q, _s);
    // a barrel dropped on the sill falls inside, not into the wall
    const w = a.win, dOut = -((_p.x - w.sill.x) * w.normal.x + (_p.z - w.sill.z) * w.normal.z);
    if (dOut > -0.7) _p.addScaledVector(w.normal, dOut + 0.7);
    let d = dropped.find((x) => !x.active);
    if (!d) {
      const mesh = createBarrelMesh(ctx);
      mesh.userData.dynamic = true;
      mesh.visible = false;
      root.add(mesh);
      d = { mesh, vel: new THREE.Vector3(), active: false };
      dropped.push(d);
    }
    d.active = true; d.t = 0; d.slot = i;
    d.mesh.visible = true;
    d.mesh.position.copy(_p);
    d.mesh.quaternion.copy(_q).multiply(_qLay);
    const fw = a.facingOut ? -1 : 1; // roll back into the hall
    d.vel.set(Math.sin(a.yaw) * fw * 0.9 + rnd(-0.4, 0.4), 0.6, Math.cos(a.yaw) * fw * 0.9 + rnd(-0.4, 0.4));
  }
  function stepDropped(dt) {
    for (const d of dropped) {
      if (!d.active) continue;
      d.t += dt;
      const p = d.mesh.position, v = d.vel, R = 0.33;
      v.y -= 9.8 * dt;
      p.addScaledVector(v, dt);
      if (p.y < R) {
        p.y = R; v.y = Math.abs(v.y) > 1 ? -v.y * 0.25 : 0;
        v.x *= Math.exp(-1.6 * dt); v.z *= Math.exp(-1.6 * dt);
        // lie flat: axis toward horizontal
        _v.set(0, 1, 0).applyQuaternion(d.mesh.quaternion);
        if (Math.abs(_v.y) > 0.02) {
          _w.set(_v.x, 0, _v.z);
          if (_w.lengthSq() < 1e-6) _w.set(1, 0, 0);
          _q.setFromUnitVectors(_v, _w.normalize());
          _q2.identity().slerp(_q, Math.min(1, dt * 10));
          d.mesh.quaternion.premultiply(_q2);
        }
        // roll: only the motion across the axis survives
        const along = v.x * _v.x + v.z * _v.z;
        v.x -= along * _v.x * Math.min(1, dt * 8); v.z -= along * _v.z * Math.min(1, dt * 8);
      }
      const sp = Math.hypot(v.x, v.z);
      if (sp > 1e-3) {
        _w.set(v.z, 0, -v.x).normalize(); // up x v
        _q.setFromAxisAngle(_w, (sp * dt) / R);
        d.mesh.quaternion.premultiply(_q);
      }
      if (d.t >= DROP_T) {
        d.active = false; d.mesh.visible = false;
        if (slotState[d.slot] === 'dropped') slotState[d.slot] = 'shelf';
        hall.setBarrelVisible?.(d.slot, true);
      }
    }
  }

  // spawning -----------------------------------------------------------------------------------
  function freeWindows() { return windows.filter((w) => !occupied.has(w.id) && !(cooldown.get(w.id) > 0)); }
  function pickWindow() {
    const free = freeWindows();
    if (!free.length) return null;
    const p = hall.player || camera.position;
    const yaw = camera.rotation.y;
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect) * 0.8;
    const visible = free.filter((w) => {
      let d = Math.atan2(-(w.sill.x - p.x), -(w.sill.z - p.z)) - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return Math.abs(d) < half;
    });
    const list = visible.length && Math.random() < 0.5 ? visible : free;
    return list[Math.floor(Math.random() * list.length)];
  }

  function spawnGangster(win, difficulty) {
    const tough = difficulty >= 0.4 && Math.random() < C.toughChance;
    const a = acquire(tough ? 'tough' : GANGSTER_KEYS[Math.floor(Math.random() * GANGSTER_KEYS.length)]);
    const yIn = Math.atan2(win.normal.x, win.normal.z);
    Object.assign(a, { id: nextId++, win, state: 'alive', stage: 'rise', t: 0, dur: 1, hp: tough ? 2 : 1, hasBarrel: false,
      knocked: false, smashed: false, staggerT: 0, downT: 0, floorT: 0, seed: Math.random() * 10, d: 0.95, y: -1.4,
      yIn, yaw: yIn, facingOut: false, inside: false, slot: null, slotUsed: 0, barrelBlend: 1, phase: 0, fleePhase: null,
      target: new THREE.Vector3() });
    occupied.set(win.id, a);
    live.push(a);
    poseGangster(a, 0);
    a.mesh.updateMatrixWorld(true);
    events.emit('gangster:appear', { id: a.id, windowId: win.id, kind: 'gangster', tough, ...headPos(a) });
  }

  function spawnWatchman(win) {
    const a = acquire('watch');
    const dir = Math.random() < 0.5 ? 1 : -1;
    const tan = new THREE.Vector3(win.normal.z * dir, 0, -win.normal.x * dir);
    Object.assign(a, { id: nextId++, win, state: 'alive', stage: 'walk', t: 0, s: -2.3, tan, phase: 0, downT: 0, hasBarrel: false,
      staggerT: 0, hp: 1, seed: 0, slot: null, yaw: Math.atan2(tan.x, tan.z), inside: false, facingOut: false });
    a.lookSign = Math.sign(tan.z * win.normal.x - tan.x * win.normal.z) || 1; // model +X (= (tan.z, 0, -tan.x)) · normal
    occupied.set(win.id, a);
    live.push(a);
    poseWatch(a, 0);
    a.mesh.updateMatrixWorld(true);
    events.emit('gangster:appear', { id: a.id, windowId: win.id, kind: 'innocent', tough: false, ...headPos(a) });
  }

  function trySpawn(difficulty) {
    if (live.length >= MAX_ALIVE) return;
    const win = pickWindow();
    if (!win) return;
    const watchBusy = live.some((a) => a.kind === 'innocent');
    if (!watchBusy && Math.random() < C.innocentChance) { spawnWatchman(win); return; }
    const mA = range(C.maxActive, [1, 4]);
    const max = Math.round(lerp(mA[0], mA[1], difficulty));
    const threats = live.filter((a) => a.kind === 'gangster' && a.state === 'alive' && a.stage !== 'flee').length;
    if (threats >= max) return;
    spawnGangster(win, difficulty);
  }

  // stealing -----------------------------------------------------------------------------------
  /** A barrel is buried while another barrel still rests on top of it — take the top layer first. */
  function slotBuried(i) {
    const b = slots[i].pos;
    for (let j = 0; j < slots.length; j++) {
      if (j === i) continue;
      const st = slotState[j];
      if (st !== 'shelf' && st !== 'reserved' && st !== 'dropped') continue;
      const o = slots[j].pos;
      if (o.y > b.y + 0.3 && Math.hypot(o.x - b.x, o.z - b.z) < 0.75) return true;
    }
    return false;
  }
  function chooseSlot(a) {
    const p = a.mesh.position;
    let best = -1, bd = Infinity;
    for (let i = 0; i < slots.length; i++) {
      if (!slotFree(i) || slotBuried(i)) continue;
      const d = p.distanceToSquared(slots[i].pos);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  /** Spot beside the barrel (side or end), whichever is closest to the gangster. */
  function standPoint(a, i, out) {
    const s = slots[i], yaw = s.yaw || 0, p = a.mesh.position;
    const ax = Math.cos(yaw), az = -Math.sin(yaw);
    let bd = Infinity;
    for (const [dx, dz, r] of [[-az, ax, 0.72], [az, -ax, 0.72], [ax, az, 0.78], [-ax, -az, 0.78]]) {
      const x = s.pos.x + dx * r, z = s.pos.z + dz * r;
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < bd) { bd = d; out.set(x, 0, z); }
    }
    out.x = THREE.MathUtils.clamp(out.x, -10.4, 10.4);
    out.z = THREE.MathUtils.clamp(out.z, -8.4, 6.4);
    return out;
  }
  function startFlee(a) {
    a.stage = 'flee'; a.t = 0; a.dur = 1.0 * a.k;
    if (a.inside) { a.fleePhase = 'walk'; insidePoint(a.win, a.target); }
    else { a.fleePhase = 'sink'; a.fleeD = a.d; a.fleeY = a.y; }
  }

  // per-actor update ----------------------------------------------------------------------------
  function stepGangster(a, dt, T, k, playing) {
    a.k = k;
    if (a.hatOff) flyHat(a, dt);
    if (a.state === 'down') {
      a.downT += dt;
      poseDown(a, T);
      if (a.downT >= DOWN_T) release(a);
      return;
    }
    if (a.state === 'floor') {
      a.floorT += dt;
      poseFloor(a, T);
      if (a.floorT >= FLOOR_T) { a.state = 'alive'; startFlee(a); }
      return;
    }
    if (!playing && a.stage !== 'flee') { // police / menu: drop everything and get out
      if (a.hasBarrel) dropBarrel(a);
      unreserve(a);
      startFlee(a);
    }
    let adv = dt;
    if (a.staggerT > 0) { a.staggerT = Math.max(0, a.staggerT - dt); adv = 0; }
    a.t += adv;
    const durOf = (s) => (C[s] ?? 1) * k;
    if (a.stage === 'rise' || a.stage === 'smash' || a.stage === 'climb' || a.stage === 'escape') a.dur = durOf(a.stage);
    const u = a.t / a.dur;
    switch (a.stage) {
      case 'rise':
        if (u >= 1) { a.stage = broken.has(a.win.id) ? 'climb' : 'smash'; a.t = 0; }
        break;
      case 'smash':
        if (!a.knocked && u >= 0.34) { a.knocked = true; events.emit('gangster:knock', { id: a.id, windowId: a.win.id, ...glassPos(a.win) }); }
        if (!a.smashed && u >= 0.84) {
          a.smashed = true;
          if (!broken.has(a.win.id)) {
            broken.add(a.win.id);
            hall.setGlass(a.win.id, false);
            events.emit('glass:break', { windowId: a.win.id, ...glassPos(a.win) });
          }
        }
        if (u >= 1) { a.stage = 'climb'; a.t = 0; }
        break;
      case 'climb':
        if (u >= 1) {
          a.inside = true;
          place(a, -INSIDE_D, 0);
          const i = chooseSlot(a);
          if (i >= 0) {
            a.slot = a.slotUsed = i; slotState[i] = 'reserved'; slotOwner[i] = a;
            standPoint(a, i, a.target);
            a.stage = 'walk'; a.t = 0;
          } else {
            a.stage = 'giveup'; a.t = 0; a.dur = 0.8;
            events.emit('gangster:shout', { id: a.id, windowId: a.win.id, ...headPos(a) });
          }
        }
        break;
      case 'walk':
        if (adv > 0 && moveTo(a, a.target.x, a.target.z, C.walkSpeed / k, adv)) {
          const s = slots[a.slot].pos;
          a.stage = 'pickup'; a.t = 0; a.dur = C.pickup * k;
          a.yaw = Math.atan2(s.x - a.mesh.position.x, s.z - a.mesh.position.z);
        }
        break;
      case 'pickup': {
        a.dur = C.pickup * k;
        const s = slots[a.slot].pos;
        turnTo(a, Math.atan2(s.x - a.mesh.position.x, s.z - a.mesh.position.z), dt);
        if (!a.hasBarrel && u >= 0.4) {
          a.hasBarrel = true; slotState[a.slot] = 'carried';
          hall.setBarrelVisible?.(a.slot, false);
          events.emit('gangster:grab', { id: a.id, windowId: a.win.id, barrel: a.slot, ...headPos(a) });
        }
        a.barrelBlend = smooth((u - 0.4) / 0.6);
        if (u >= 1) { a.barrelBlend = 1; a.stage = 'carry'; a.t = 0; insidePoint(a.win, a.target); }
        break;
      }
      case 'carry':
        if (adv > 0 && moveTo(a, a.target.x, a.target.z, C.carrySpeed / k, adv)) { a.stage = 'escape'; a.t = 0; }
        break;
      case 'escape':
        if (u >= 1) {
          if (a.hasBarrel) {
            slotState[a.slot] = 'gone'; slotOwner[a.slot] = null;
            if (playing) events.emit('gangster:escape', { id: a.id, windowId: a.win.id, barrel: a.slot, ...headPos(a) });
          }
          release(a); return;
        }
        break;
      case 'giveup':
        if (a.t >= a.dur) startFlee(a);
        break;
      case 'flee':
        if (a.fleePhase === 'walk') {
          if (moveTo(a, a.target.x, a.target.z, 2.6 / k, dt)) { a.fleePhase = 'climb'; a.t = 0; a.dur = 1.0 * k; }
        } else if (a.t >= (a.fleePhase === 'climb' ? a.dur : 0.7)) { release(a); return; }
        break;
    }
    poseGangster(a, T);
  }

  function stepWatch(a, dt, T) {
    if (a.state === 'down') {
      a.downT += dt;
      if (a.downT > 0.5) { a.s += 4.2 * dt; a.phase += dt * 15; }
      if (a.lanternOff) dropLantern(a, dt);
      poseWatch(a, T);
      if (a.downT > 0.5 && Math.abs(a.s) > 2.6) release(a);
      return;
    }
    a.t += dt;
    a.s = lerp(-2.3, 2.3, a.t / WATCH_WALK);
    a.phase += dt * 2 * Math.PI * 1.5;
    poseWatch(a, T);
    if (a.t >= WATCH_WALK) release(a);
  }

  // public API ----------------------------------------------------------------------------------
  function update(dt, t, game) {
    const state = game?.state;
    if (state === 'paused') return;
    const playing = state === 'playing';
    const difficulty = clamp01(game?.difficulty ?? 0);
    const k = lerp(1, C.speedUpMin, difficulty);
    for (const [id, v] of cooldown) { if (v - dt <= 0) cooldown.delete(id); else cooldown.set(id, v - dt); }

    if (playing) {
      if (!wasPlaying) spawnT = Math.min(spawnT, 1.0);
      spawnT -= dt;
      if (spawnT <= 0) {
        const si = range(C.spawnInterval, [2.4, 0.9]);
        spawnT = lerp(si[0], si[1], difficulty) * rnd(0.75, 1.25);
        trySpawn(difficulty);
      }
    }
    wasPlaying = playing;

    for (const a of [...live]) {
      if (a.kind === 'innocent') stepWatch(a, dt, t);
      else stepGangster(a, dt, t, k, playing);
    }
    stepDropped(dt);
    root.updateMatrixWorld(true); // so hitTest sees this frame's pose
  }

  function hitTest(raycaster) {
    const ray = raycaster.ray;
    let best = null, bestD = Infinity;
    for (const a of live) {
      if (a.state !== 'alive' || a.stage === 'flee') continue;
      const w = a.win;
      a.b.head.localToWorld(_v.set(0, 0.11 * a.S, 0));
      if (!a.inside && _v.y < w.sillY + 0.05) continue; // still hidden below the sill
      if (a.kind === 'innocent' && Math.abs(a.s) > w.width / 2 + 0.15) continue; // behind the wall
      a.b.spine.localToWorld(_w.set(0, 0.22 * a.S, 0));
      for (const [c, r] of [[_v, 0.3 * a.S], [_w, 0.45 * a.S]]) {
        _oc.subVectors(c, ray.origin);
        const tca = _oc.dot(ray.direction);
        if (tca <= 0) continue;
        if (_oc.lengthSq() - tca * tca <= r * r && tca < bestD) { bestD = tca; best = a; }
      }
    }
    return best ? { id: best.id, kind: best.kind, distance: bestD } : null;
  }

  function hit(id) {
    const a = live.find((x) => x.id === id && x.state === 'alive' && x.stage !== 'flee');
    if (!a) return;
    a.mesh.updateMatrixWorld(true);
    if (a.kind === 'innocent') {
      a.state = 'down'; a.downT = 0;
      root.attach(a.b.lantern); // the lantern drops where it is
      a.lanternOff = true; a.lanternVel = 0.8;
      if (a.s < 0) { a.tan.negate(); a.s = -a.s; a.lookSign = -a.lookSign; a.yaw += Math.PI; } // run away the short way
      events.emit('gangster:down', { id, kind: 'innocent', stage: 'walk', withBarrel: false, barrel: null, windowId: a.win.id, tough: false, ...headPos(a) });
      return;
    }
    if (a.hp > 1) { // tough guy: stagger, lose the hat, lose some progress
      a.hp--;
      a.staggerT = STAGGER_T;
      if (a.stage === 'rise' || a.stage === 'smash' || a.stage === 'climb' || a.stage === 'escape' || a.stage === 'pickup') {
        a.t = Math.max(a.stage === 'pickup' && a.hasBarrel ? a.dur * 0.4 : 0, a.t - 0.35 * a.dur);
      }
      knockHat(a);
      events.emit('gangster:hurt', { id, windowId: a.win.id, ...headPos(a) });
      return;
    }
    const stage = a.stage;
    const withBarrel = !!a.hasBarrel;
    const barrel = withBarrel ? a.slot : null;
    if (withBarrel) dropBarrel(a); else unreserve(a);
    const outside = !a.inside || (stage === 'escape' && a.d > -0.35);
    a.staggerT = 0;
    knockHat(a);
    if (outside) { a.state = 'down'; a.downT = 0; }
    else { a.state = 'floor'; a.floorT = 0; a.inside = true; }
    events.emit('gangster:down', { id, kind: 'gangster', stage, withBarrel, barrel, windowId: a.win.id, tough: a.tough, ...headPos(a) });
  }

  function reset() {
    for (const a of [...live]) release(a);
    for (const d of dropped) { d.active = false; d.mesh.visible = false; }
    slotState.fill('shelf'); slotOwner.fill(null);
    occupied.clear(); cooldown.clear(); broken.clear();
    hall.resetGlass?.();
    spawnT = 1.2; wasPlaying = false;
  }

  return {
    update, hitTest, hit, reset,
    /** debug/tests: head positions of the live, hittable actors */
    debugTargets: () => live.filter((a) => a.state === 'alive' && a.stage !== 'flee')
      .map((a) => ({ id: a.id, kind: a.kind, stage: a.stage, ...headPos(a) })),
    get active() { return live.filter((a) => a.state === 'alive' && a.stage !== 'flee').length; },
  };
}
