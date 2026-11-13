// Level 3: first-person 1920s side-by-side double-barrelled shotgun (salt loads). Contract: docs/LEVEL3.md.
// Camera space: the gun points along -Z. Draw calls: stock/action (1) + barrels (1) + shells OR muzzle flash
// (never visible at the same time, so <= 3).
import * as THREE from 'three';
import { box, cyl, cylZ, sph, link, merge } from '../../vehicle/trafficModels.js';

const STEEL = 0x24262b, STEEL_HI = 0x3a3d44, CASE = 0x5b5a58, WALNUT = 0x5a3219, WALNUT_D = 0x3d220f, BRASS = 0xc59a3c;
const BARREL_LEN = 0.46, BORE_X = 0.021, BORE_R = 0.02;
const PIVOT = new THREE.Vector3(0, -0.028, 0.0); // hinge pin, below the breech face (z = 0)
// compact first-person placement: breech near the lower-right corner, muzzle ends at ~(0.3, -0.45) NDC, well short of the crosshair
const REST_POS = new THREE.Vector3(0.44, -0.36, -0.72);
const CONVERGE = 12; // barrels aim at the screen centre this far ahead (m)
const REST_ROT = new THREE.Euler(Math.atan2(-REST_POS.y, CONVERGE), Math.atan2(REST_POS.x, CONVERGE), 0.04);
const OPEN = -0.58; // barrels drop this far (rad) when broken open

function buildAction() {
  const P = [];
  // receiver / action body (case-hardened), behind the hinge
  P.push(box(0.064, 0.05, 0.11, CASE, 0, -0.012, 0.055));
  P.push(box(0.058, 0.02, 0.05, STEEL_HI, 0, 0.018, 0.035)); // top strap
  P.push(box(0.012, 0.012, 0.03, STEEL, 0, 0.033, 0.055));   // top lever
  for (const s of [-1, 1]) P.push(box(0.008, 0.035, 0.012, STEEL, s * 0.016, 0.03, 0.095, { rx: -0.5 })); // hammers
  P.push(cyl(0.012, 0.012, 0.07, 8, STEEL_HI, 0, PIVOT.y, PIVOT.z, { rz: Math.PI / 2 })); // hinge pin
  // trigger guard + triggers
  P.push(box(0.012, 0.006, 0.09, STEEL, 0, -0.07, 0.08));
  P.push(link([0, -0.07, 0.035], [0, -0.04, 0.03], 0.004, 0.004, STEEL, 4), link([0, -0.07, 0.125], [0, -0.035, 0.14], 0.004, 0.004, STEEL, 4));
  P.push(box(0.006, 0.03, 0.006, STEEL_HI, 0, -0.05, 0.07, { rx: 0.3 }), box(0.006, 0.03, 0.006, STEEL_HI, 0, -0.05, 0.095, { rx: 0.3 }));
  // wrist + butt stock (walnut), dropping slightly toward the shoulder
  P.push(link([0, -0.015, 0.11], [0, -0.05, 0.27], 0.022, 0.024, WALNUT, 8));
  P.push(box(0.044, 0.1, 0.32, WALNUT, 0, -0.085, 0.42, { rx: -0.16 }));
  P.push(box(0.046, 0.06, 0.2, WALNUT_D, 0, -0.03, 0.39, { rx: -0.08 })); // comb
  P.push(box(0.048, 0.13, 0.015, 0x1a1512, 0, -0.11, 0.585, { rx: -0.16 })); // butt plate
  for (const s of [-1, 1]) P.push(box(0.003, 0.05, 0.05, WALNUT_D, s * 0.0225, -0.02, 0.2)); // checkering panels
  return merge(P);
}

function buildBarrels() {
  // built relative to the hinge pivot (the group sits at PIVOT)
  const P = [], py = -PIVOT.y, L = BARREL_LEN;
  for (const s of [-1, 1]) {
    P.push(cylZ(BORE_R * 0.9, BORE_R, L, 10, STEEL, s * BORE_X, py, -L / 2));
    P.push(cylZ(BORE_R * 0.55, BORE_R * 0.55, 0.004, 8, 0x050505, s * BORE_X, py, -L - 0.001)); // muzzle bore
    P.push(cylZ(BORE_R * 0.55, BORE_R * 0.55, 0.004, 8, 0x0a0a0a, s * BORE_X, py, 0.001));    // chamber mouth
  }
  P.push(box(0.012, 0.008, L, STEEL_HI, 0, py + BORE_R + 0.002, -L / 2)); // top rib
  P.push(box(0.016, 0.01, L * 0.9, STEEL, 0, py - BORE_R, -L * 0.45));   // bottom rib
  P.push(sph(0.0045, 6, 4, BRASS, 0, py + BORE_R + 0.009, -L + 0.012));   // brass bead
  P.push(box(0.05, 0.04, 0.04, CASE, 0, py - 0.012, -0.02));              // lump / breech block
  // splinter fore-end (walnut) under the barrels
  P.push(box(0.05, 0.03, 0.22, WALNUT, 0, py - 0.03, -0.17));
  P.push(box(0.044, 0.02, 0.04, STEEL, 0, py - 0.035, -0.06));
  return merge(P);
}

function buildShells() {
  const P = [];
  for (const s of [-1, 1]) {
    P.push(cylZ(0.0185, 0.0185, 0.055, 8, 0xa3241d, s * BORE_X, 0, -0.03)); // red paper hull
    P.push(cylZ(0.021, 0.021, 0.012, 8, BRASS, s * BORE_X, 0, 0.004));     // brass head + rim
  }
  return merge(P);
}

function flashTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.2, 'rgba(255,210,120,0.95)');
  g.addColorStop(0.5, 'rgba(255,140,40,0.45)'); g.addColorStop(1, 'rgba(255,90,20,0)');
  c.fillStyle = g;
  c.beginPath();
  for (let i = 0; i < 16; i++) { // ragged star
    const a = (i / 16) * Math.PI * 2, r = i % 2 ? 26 : 62;
    c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  c.closePath(); c.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildFlashGeometry() {
  // a front-facing star + two crossed lengthwise quads, merged (one draw call)
  const parts = [];
  const front = new THREE.PlaneGeometry(0.22, 0.22);
  parts.push(front);
  for (const r of [0, Math.PI / 2]) {
    const q = new THREE.PlaneGeometry(0.14, 0.3);
    q.rotateX(-Math.PI / 2); q.rotateZ(r); q.translate(0, 0, -0.12);
    parts.push(q);
  }
  return mergeFlat(parts);
}
function mergeFlat(parts) {
  // position + uv only, indexed planes -> non-indexed merge
  const pos = [], uv = [];
  for (const p of parts) {
    const g = p.toNonIndexed();
    pos.push(...g.attributes.position.array); uv.push(...g.attributes.uv.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

export function createShotgun(ctx) {
  const material = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 38, specular: 0x2a2826, emissive: 0x0d0a08 });

  const group = new THREE.Group();
  group.name = 'shotgun';
  group.position.copy(REST_POS);
  group.rotation.copy(REST_ROT);

  const action = new THREE.Mesh(buildAction(), material);
  group.add(action);

  const barrels = new THREE.Group(); // hinge
  barrels.position.copy(PIVOT);
  const barrelMesh = new THREE.Mesh(buildBarrels(), material);
  barrels.add(barrelMesh);
  group.add(barrels);

  const shells = new THREE.Mesh(buildShells(), material);
  shells.visible = false;
  barrels.add(shells);

  const flashMat = new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const flash = new THREE.Mesh(buildFlashGeometry(), flashMat);
  flash.position.set(0, -PIVOT.y, -BARREL_LEN - 0.08);
  flash.visible = false;
  barrels.add(flash);

  group.traverse((o) => { o.userData.dynamic = true; o.frustumCulled = false; o.renderOrder = 10; });

  let recoil = 0, flashT = 0, reloadT = -1, reloadD = 1, time = 0;
  const py = -PIVOT.y;

  function fire() {
    recoil = 1;
    flashT = 0.06;
    flash.visible = true;
    flash.rotation.z = Math.random() * Math.PI;
    const s = 0.85 + Math.random() * 0.4;
    flash.scale.set(s, s, s);
  }

  function reload(duration = 1.3) {
    reloadD = Math.max(0.2, duration);
    reloadT = 0;
    flashT = 0; flash.visible = false;
  }

  const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

  function update(dt) {
    time += dt;
    recoil *= Math.exp(-dt * 9);
    if (recoil < 1e-3) recoil = 0;
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.visible = false; }

    let open = 0, tilt = 0, lift = 0;
    if (reloadT >= 0) {
      reloadT += dt;
      const u = reloadT / reloadD;
      // 0-0.22 break open, 0.22-0.75 two shells slide in, 0.78-1 snap shut
      if (u < 0.22) open = smooth(u / 0.22);
      else if (u < 0.78) open = 1;
      else open = 1 - smooth((u - 0.78) / 0.18);
      tilt = Math.sin(Math.PI * Math.min(1, u)) ; // gun rolls/lifts toward the view while loading
      lift = tilt;
      if (u > 0.2 && u < 0.8) {
        shells.visible = true;
        // the pair of shells comes up from below-right, then seats along the bore axis
        const k = smooth((u - 0.25) / 0.45);
        const approach = 1 - smooth((u - 0.25) / 0.3);
        shells.position.set(0.09 * approach, py - 0.12 * approach, 0.075 * (1 - k) + 0.02 * approach);
        shells.rotation.x = 0.6 * approach;
      } else shells.visible = false;
      if (u >= 1) { reloadT = -1; shells.visible = false; }
    }
    barrels.rotation.x = OPEN * open;

    // idle sway + recoil kick (back and muzzle up)
    const sway = Math.sin(time * 1.3) * 0.004, sway2 = Math.sin(time * 0.9 + 1) * 0.003;
    group.position.set(REST_POS.x + sway2 - 0.02 * lift, REST_POS.y + sway + 0.05 * lift, REST_POS.z + 0.09 * recoil + 0.04 * lift);
    group.rotation.set(REST_ROT.x + 0.16 * recoil + 0.18 * tilt, REST_ROT.y + 0.12 * tilt, REST_ROT.z - 0.03 * recoil + 0.35 * tilt);
  }

  update(0);
  return { group, fire, reload, update };
}
