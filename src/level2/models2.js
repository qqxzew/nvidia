// Level 2 models (owner: gameplay): the cellarman (sklepník) and the cellar rat.
// Both are ONE SkinnedMesh each (one draw call): vertex-coloured low-poly parts in the style of
// trafficModels.buildPedGeometry(1), every part rigidly bound to one bone. Facing +Z, origin at the feet.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, sph, link, vcolMaterial } from '../vehicle/trafficModels.js';

let sharedMat = null;
export function skinMaterial() { return sharedMat || (sharedMat = vcolMaterial()); }

/** bone defs: [{ name, parent (index | -1), at: [x, y, z] in model space }] ; parts: [[geometry, boneIndex]] */
function buildSkinned(defs, parts) {
  const geos = parts.map(([g, b]) => {
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = b; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    return g;
  });
  const geometry = mergeGeometries(geos, false);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 0.6; // animated limbs reach out of the bind-pose bounds
  return geometry;
}

function makeRig(defs, geometry, material) {
  const bones = defs.map((d) => { const b = new THREE.Bone(); b.name = d.name; return b; });
  defs.forEach((d, i) => {
    const p = d.parent >= 0 ? defs[d.parent].at : [0, 0, 0];
    bones[i].position.set(d.at[0] - p[0], d.at[1] - p[1], d.at[2] - p[2]);
    if (d.parent >= 0) bones[d.parent].add(bones[i]);
  });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.frustumCulled = false; // tiny, always near the camera; skinned bounds are unreliable anyway
  const rest = bones.map((b) => b.position.clone());
  return { mesh, bones, rest };
}

// ------------------------------------------------------------------------------------------------
// CELLARMAN ~1.76 m: flat cap, moustache, collarless shirt with rolled-up sleeves, dark waistcoat,
// long leather apron (bib + skirt on its own bone so it swings away from the knees), boots.
// ------------------------------------------------------------------------------------------------
export const MAN = {
  hipY: 0.92, spineY: 1.0, shoulderY: 1.45, shoulderX: 0.23, upper: 0.27, fore: 0.27,
};
const MAN_BONES = [
  { name: 'root', parent: -1, at: [0, 0, 0] },
  { name: 'hips', parent: 0, at: [0, 0.92, 0] },
  { name: 'spine', parent: 1, at: [0, 1.0, 0] },
  { name: 'head', parent: 2, at: [0, 1.5, 0] },
  { name: 'armL', parent: 2, at: [0.23, 1.45, 0] },
  { name: 'foreL', parent: 4, at: [0.235, 1.18, 0] },
  { name: 'armR', parent: 2, at: [-0.23, 1.45, 0] },
  { name: 'foreR', parent: 6, at: [-0.235, 1.18, 0] },
  { name: 'thighL', parent: 1, at: [0.09, 0.9, 0] },
  { name: 'shinL', parent: 8, at: [0.09, 0.48, 0] },
  { name: 'thighR', parent: 1, at: [-0.09, 0.9, 0] },
  { name: 'shinR', parent: 10, at: [-0.09, 0.48, 0] },
  { name: 'apron', parent: 1, at: [0, 0.95, 0.14] },
];
export const B = { root: 0, hips: 1, spine: 2, head: 3, armL: 4, foreL: 5, armR: 6, foreR: 7, thighL: 8, shinL: 9, thighR: 10, shinR: 11, apron: 12 };

let manGeo = null;
function buildManGeometry() {
  const skin = 0xd2ab8a, skin2 = 0xc0956f, trousers = 0x504a3e, boot = 0x241d18, shirt = 0xdcd2b8, vest = 0x4d4438;
  const leather = 0x8a5a30, leatherDk = 0x5a3a1e, cap = 0x4a443a, hair = 0x3a2a1c;
  const P = [];
  for (const sx of [1, -1]) {
    const L = sx > 0;
    const thigh = L ? B.thighL : B.thighR, shin = L ? B.shinL : B.shinR, arm = L ? B.armL : B.armR, fore = L ? B.foreL : B.foreR;
    P.push([box(0.12, 0.08, 0.24, boot, sx * 0.09, 0.04, 0.035), shin]);
    P.push([box(0.125, 0.04, 0.13, boot, sx * 0.09, 0.1, 0.0), shin]);
    P.push([box(0.115, 0.38, 0.125, trousers, sx * 0.09, 0.3, 0), shin]);
    P.push([box(0.135, 0.44, 0.145, trousers, sx * 0.09, 0.69, 0), thigh]);
    // rolled sleeve: shirt upper arm + thick cuff, bare forearm, hand
    P.push([link([sx * 0.23, 1.45, 0], [sx * 0.235, 1.2, 0], 0.058, 0.05, shirt, 6), arm]);
    P.push([cyl(0.058, 0.058, 0.05, 6, shirt, sx * 0.235, 1.2, 0), arm]);
    P.push([link([sx * 0.235, 1.18, 0], [sx * 0.24, 0.95, 0], 0.044, 0.038, skin, 6), fore]);
    P.push([sph(0.046, 6, 4, skin2, sx * 0.24, 0.91, 0.005, { sz: 0.8 }), fore]);
  }
  // pelvis, torso, waistcoat, shoulders
  P.push([box(0.32, 0.16, 0.21, trousers, 0, 0.94, 0), B.hips]);
  P.push([box(0.4, 0.045, 0.25, leatherDk, 0, 0.99, 0), B.hips]); // apron tie / belt
  P.push([cyl(0.185, 0.175, 0.44, 8, vest, 0, 1.22, 0), B.spine]);
  P.push([box(0.43, 0.11, 0.23, shirt, 0, 1.44, 0), B.spine]);
  P.push([box(0.12, 0.08, 0.05, shirt, 0, 1.42, 0.1), B.spine]); // open collar
  // apron bib + straps
  P.push([box(0.3, 0.36, 0.035, leather, 0, 1.17, 0.175), B.spine]);
  for (const sx of [1, -1]) P.push([box(0.035, 0.03, 0.26, leatherDk, sx * 0.12, 1.47, 0.0), B.spine]);
  // apron skirt (hangs from the waist to mid-shin), slightly flared
  P.push([box(0.44, 0.34, 0.03, leather, 0, 0.8, 0.15), B.apron]);
  P.push([box(0.48, 0.3, 0.03, leather, 0, 0.48, 0.155), B.apron]);
  P.push([box(0.48, 0.03, 0.035, leatherDk, 0, 0.33, 0.155), B.apron]);
  // head: neck, face, moustache, nose, ears, flat cap with brim
  P.push([cyl(0.052, 0.058, 0.1, 6, skin2, 0, 1.52, 0), B.head]);
  P.push([sph(0.108, 8, 6, skin, 0, 1.62, 0, { sy: 1.08 }), B.head]);
  P.push([box(0.035, 0.05, 0.04, skin2, 0, 1.615, 0.105), B.head]);
  P.push([box(0.11, 0.024, 0.035, hair, 0, 1.582, 0.095), B.head]);
  for (const sx of [1, -1]) P.push([box(0.025, 0.05, 0.03, skin2, sx * 0.105, 1.62, 0), B.head]);
  P.push([sph(0.112, 8, 4, hair, 0, 1.64, -0.02, { sy: 0.8 }), B.head]); // hair at the back
  P.push([sph(0.13, 8, 5, cap, 0, 1.69, 0.01, { sy: 0.42, rx: 0.12 }), B.head]);
  P.push([box(0.17, 0.016, 0.1, cap, 0, 1.685, 0.12, { rx: 0.18 }), B.head]);
  return buildSkinned(MAN_BONES, P.map(([g, b]) => [g, b]));
}

/** → { mesh, bones, rest } ; animate with poseMan(rig, pose) */
export function createCellarman() {
  if (!manGeo) manGeo = buildManGeometry();
  return makeRig(MAN_BONES, manGeo, skinMaterial());
}

// ------------------------------------------------------------------------------------------------
// RAT ~0.5 m with the tail: hunched body, pointed head, pink ears/feet/tail. Tail = 4 bones.
// ------------------------------------------------------------------------------------------------
const RS = 1.15; // a touch bigger than life so it reads from the chase camera
const r3 = (x, y, z) => [x * RS, y * RS, z * RS];
const RAT_BONES = [
  { name: 'root', parent: -1, at: [0, 0, 0] },
  { name: 'body', parent: 0, at: r3(0, 0.07, 0) },
  { name: 'head', parent: 1, at: r3(0, 0.085, 0.1) },
  { name: 't1', parent: 1, at: r3(0, 0.06, -0.13) },
  { name: 't2', parent: 3, at: r3(0, 0.05, -0.19) },
  { name: 't3', parent: 4, at: r3(0, 0.04, -0.25) },
  { name: 't4', parent: 5, at: r3(0, 0.03, -0.31) },
  { name: 'legFL', parent: 1, at: r3(0.04, 0.05, 0.07) },
  { name: 'legFR', parent: 1, at: r3(-0.04, 0.05, 0.07) },
  { name: 'legBL', parent: 1, at: r3(0.05, 0.06, -0.07) },
  { name: 'legBR', parent: 1, at: r3(-0.05, 0.06, -0.07) },
];
export const RB = { root: 0, body: 1, head: 2, t1: 3, t2: 4, t3: 5, t4: 6, legFL: 7, legFR: 8, legBL: 9, legBR: 10 };

let ratGeo = null;
function buildRatGeometry() {
  const fur = 0x4a4038, furDk = 0x352e28, belly = 0x6b5e50, pink = 0xb98278, pinkDk = 0x9c6a62, eye = 0x060505;
  const S = RS, P = [];
  const sc = (o = {}) => ({ ...o, sx: (o.sx ?? 1) * S, sy: (o.sy ?? 1) * S, sz: (o.sz ?? 1) * S });
  P.push([sph(0.075, 8, 6, fur, 0, 0.075 * S, -0.01 * S, sc({ sx: 0.95, sy: 0.78, sz: 1.55 })), RB.body]);
  P.push([sph(0.072, 7, 5, furDk, 0, 0.085 * S, -0.06 * S, sc({ sx: 1.0, sy: 0.85, sz: 1.0 })), RB.body]);
  P.push([sph(0.06, 7, 4, belly, 0, 0.055 * S, 0.0, sc({ sx: 0.9, sy: 0.6, sz: 1.5 })), RB.body]);
  // head: skull + snout + nose, ears, eyes
  P.push([sph(0.048, 7, 5, fur, 0, 0.088 * S, 0.14 * S, sc({ sz: 1.25 })), RB.head]);
  P.push([G2(cyl(0.004, 0.032, 0.075, 6, fur), 0, 0.078 * S, 0.195 * S, S), RB.head]);
  P.push([sph(0.011, 5, 4, pinkDk, 0, 0.076 * S, 0.233 * S, sc()), RB.head]);
  for (const sx of [1, -1]) {
    P.push([cyl(0.026, 0.026, 0.008, 7, pink, sx * 0.034 * S, 0.128 * S, 0.125 * S, sc({ rx: Math.PI / 2 - 0.3, rz: sx * 0.4 })), RB.head]);
    P.push([sph(0.0105, 5, 4, eye, sx * 0.03 * S, 0.1 * S, 0.172 * S, sc()), RB.head]);
  }
  // tail: tapered pink segments
  const tz = [-0.13, -0.19, -0.25, -0.31, -0.37], ty = [0.06, 0.05, 0.04, 0.03, 0.025], tr = [0.017, 0.013, 0.01, 0.007, 0.004];
  for (let i = 0; i < 4; i++) P.push([link(r3(0, ty[i], tz[i]), r3(0, ty[i + 1], tz[i + 1]), tr[i] * S, tr[i + 1] * S, i ? pink : furDk, 5), RB.t1 + i]);
  // legs + pink feet
  const legs = [[RB.legFL, 0.04, 0.07], [RB.legFR, -0.04, 0.07], [RB.legBL, 0.05, -0.07], [RB.legBR, -0.05, -0.07]];
  for (const [b, x, z] of legs) {
    P.push([box(0.022 * S, 0.05 * S, 0.026 * S, furDk, x * S, 0.03 * S, z * S), b]);
    P.push([box(0.024 * S, 0.01 * S, 0.04 * S, pink, x * S, 0.006 * S, (z + 0.01) * S), b]);
  }
  return buildSkinned(RAT_BONES, P);
}
function G2(g, x, y, z, s) { // cone along +Z (tip forward), scaled
  g.rotateX(Math.PI / 2); g.scale(s, s, s); g.translate(x, y, z); return g;
}

export function createRat() {
  if (!ratGeo) ratGeo = buildRatGeometry();
  return makeRig(RAT_BONES, ratGeo, skinMaterial());
}

// ------------------------------------------------------------------------------------------------
// Blob shadows: one InstancedMesh of flat quads with a shared radial texture (1 draw call).
// ------------------------------------------------------------------------------------------------
export function createBlobShadows(count) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.45, 'rgba(0,0,0,0.75)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, map: tex, transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  return {
    mesh,
    /** i, position, size along the facing (sz) and across (sx), yaw */
    set(i, x, y, z, sx, sz, yaw = 0) {
      q.setFromAxisAngle(Y, yaw); p.set(x, y + 0.012, z); s.set(sx, 1, sz);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
    },
    flush() { mesh.instanceMatrix.needsUpdate = true; },
  };
}
