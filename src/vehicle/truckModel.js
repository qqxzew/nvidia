// Procedural ~1920 Czech brewery lorry (Laurin & Klement / Praga style) and the beer barrel.
// Axes: Y up, model faces +Z, origin between the axles at ground level.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, cylX, cylZ, sph, link, G, merge, vcolMaterial, wheelParts, drawBrandLine, drawEmblem } from './trafficModels.js';

const PAINT = 0x2b4435, PAINT2 = 0x18221c, WOOD = 0x9a7a4c, WOOD_DARK = 0x4a3a2a, BRASS = 0xb98a2f;
const IRON = 0x25262a, LEATHER = 0x3b2a1f, LENS = 0xe9d9a0;

const FRONT = { r: 0.42, x: 0.88, z: 1.7 };
const REAR = { r: 0.5, x: 0.855, z: -1.7 };
const SPIN_REF = 0.45; // radius the controller assumes when integrating wheelSpin

// bed geometry
const BED = { floorY: 1.1, z0: -2.7, z1: -0.56, half: 0.84, board: 0.42, barrelR: 0.33 };
const SLOT_X = 0.42, SLOT_Z = [-0.95, -1.65, -2.35], TOP_Z = [-1.3, -2.0];

let signTex = null;
function signTexture() {
  if (signTex) return signTex;
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const c = cv.getContext('2d');
  const board = (y, h, ink) => {
    c.fillStyle = '#26211b'; c.fillRect(0, y, 1024, h);
    c.globalAlpha = 0.18; c.fillStyle = '#000';
    for (let i = 1; i < 4; i++) c.fillRect(0, y + (h * i) / 4 - 1, 1024, 2);
    c.globalAlpha = 1;
    c.strokeStyle = '#6d5a3c'; c.lineWidth = 3; c.strokeRect(8, y + 8, 1008, h - 16);
  };
  board(0, 256); drawBrandLine(c, 24, 0, 976, 256, { ink: '#efe9d8', bg: '#26211b', capH: 0.5 });
  board(256, 256);
  // tailboard: emblem in the middle, words either side (narrower board, same atlas width)
  drawBrandLine(c, 24, 256, 976, 256, { ink: '#efe9d8', bg: '#26211b', capH: 0.42 });
  signTex = new THREE.CanvasTexture(cv);
  signTex.colorSpace = THREE.SRGBColorSpace; signTex.anisotropy = 4; signTex.generateMipmaps = true;
  return signTex;
}

function signGeometry() {
  const parts = [];
  const h = 0.5, len = 2.1;
  const uv = (pg, v0, v1) => { const a = pg.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i), v0 + a.getY(i) * (v1 - v0)); };
  // +X side (left of the truck): text runs front -> rear; -X side: rear -> front
  for (const sx of [1, -1]) {
    const pg = new THREE.PlaneGeometry(len, h); uv(pg, 0.505, 0.995);
    pg.rotateY(sx * Math.PI / 2); pg.translate(sx * 0.925, 1.24, -1.63);
    parts.push(pg);
  }
  const tg = new THREE.PlaneGeometry(1.8, h); uv(tg, 0.005, 0.495);
  tg.rotateY(Math.PI); tg.translate(0, 1.24, -2.705);
  parts.push(tg);
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere();
  return g;
}

function buildBody() {
  const P = [];
  // ---- chassis & running gear (sprung with the body) ----
  for (const sx of [-1, 1]) P.push(box(0.12, 0.18, 5.0, PAINT2, sx * 0.42, 0.78, -0.2));
  P.push(box(0.96, 0.12, 0.1, PAINT2, 0, 0.78, 2.35), box(0.96, 0.12, 0.1, PAINT2, 0, 0.78, -2.6));
  P.push(box(1.8, 0.1, 0.1, IRON, 0, FRONT.r, FRONT.z), box(1.7, 0.12, 0.12, IRON, 0, REAR.r, REAR.z));
  for (const sx of [-1, 1]) {
    P.push(box(0.07, 0.07, 1.1, IRON, sx * 0.55, 0.62, FRONT.z), box(0.08, 0.08, 1.5, IRON, sx * 0.6, 0.82, REAR.z));
  }
  P.push(box(0.5, 0.22, 0.4, IRON, 0.5, 0.58, 0.2)); // fuel tank / tool box under the cab
  P.push(box(0.05, 0.05, 0.14, IRON, 0, 0.62, 2.72)); // starting crank
  // ---- bonnet ----
  P.push(box(0.92, 0.54, 1.52, PAINT, 0, 1.15, 1.66));
  P.push(box(0.76, 0.1, 1.52, PAINT, 0, 1.47, 1.66));
  P.push(box(0.1, 0.03, 1.52, PAINT2, 0, 1.53, 1.66));
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) P.push(box(0.012, 0.26, 0.03, PAINT2, sx * 0.466, 1.17, 1.15 + i * 0.12));
  // ---- radiator: flat vertical, brass surround, cap ----
  P.push(box(0.86, 0.9, 0.16, BRASS, 0, 1.2, 2.54));
  P.push(box(0.7, 0.74, 0.04, IRON, 0, 1.2, 2.625));
  for (let i = -3; i <= 3; i++) P.push(box(0.012, 0.7, 0.02, 0x6b5a30, i * 0.095, 1.2, 2.65));
  P.push(box(0.7, 0.07, 0.14, BRASS, 0, 1.69, 2.54));
  P.push(cyl(0.055, 0.065, 0.1, 8, BRASS, 0, 1.78, 2.54), sph(0.045, 6, 5, BRASS, 0, 1.86, 2.54));
  // ---- front mudguards, running boards, headlamps ----
  for (const sx of [-1, 1]) {
    const arc = new THREE.CylinderGeometry(0.53, 0.53, 0.28, 14, 1, true, -Math.PI - 0.3, Math.PI + 0.6);
    P.push(G(arc, PAINT2, { rz: -Math.PI / 2, x: sx * FRONT.x, y: FRONT.r, z: FRONT.z }));
    P.push(box(0.36, 0.03, 1.2, PAINT2, sx * 0.64, 0.945, 1.75));
    P.push(box(0.26, 0.04, 2.0, PAINT2, sx * 0.97, 0.63, 0.35));
    P.push(box(0.2, 0.05, 0.05, IRON, sx * 0.9, 0.62, 0.9));
    P.push(cylZ(0.11, 0.11, 0.16, 10, BRASS, sx * 0.6, 1.1, 2.28), cylZ(0.095, 0.095, 0.03, 10, LENS, sx * 0.6, 1.1, 2.37));
    P.push(box(0.04, 0.12, 0.04, IRON, sx * 0.6, 1.0, 2.28));
  }
  // ---- cab: dash, floor, low sides (no doors), seat ----
  P.push(box(1.76, 0.55, 0.16, PAINT, 0, 1.25, 0.86));
  P.push(box(1.76, 0.06, 1.5, WOOD_DARK, 0, 1.0, 0.18));
  for (const sx of [-1, 1]) P.push(box(0.05, 0.42, 1.3, PAINT, sx * 0.9, 1.25, 0.12));
  P.push(box(1.84, 0.95, 0.06, PAINT, 0, 1.475, -0.56)); // bulkhead / bed headboard
  P.push(box(1.5, 0.1, 0.42, LEATHER, 0, 1.27, -0.3), box(1.5, 0.42, 0.07, LEATHER, 0, 1.52, -0.5, { rx: -0.1 }));
  // roof on thin posts, windscreen frame
  for (const sx of [-1, 1]) {
    P.push(box(0.05, 1.0, 0.05, PAINT, sx * 0.88, 2.0, -0.5));
    P.push(box(0.05, 1.0, 0.05, PAINT, sx * 0.88, 2.0, 0.86));
    P.push(box(0.04, 0.5, 0.04, IRON, sx * 0.88, 1.8, 0.8, { rx: 0 }));
    P.push(box(0.1, 0.14, 0.1, BRASS, sx * 0.93, 1.8, 0.9), box(0.06, 0.1, 0.06, LENS, sx * 0.93, 1.8, 0.96)); // side lamps
  }
  P.push(box(1.86, 0.04, 0.04, PAINT, 0, 1.95, 0.88), box(0.04, 0.44, 0.04, PAINT, 0, 1.75, 0.88)); // windscreen header + centre post
  P.push(box(1.98, 0.06, 2.05, PAINT2, 0, 2.53, 0.4));
  P.push(box(1.86, 0.03, 1.9, 0x5c5d4e, 0, 2.58, 0.4)); // canvas top
  // ---- driver (left-hand drive), flat cap ----
  const dx = 0.42, coat = 0x2e3540;
  P.push(box(0.4, 0.5, 0.26, coat, dx, 1.7, -0.28, { rx: 0.12 }));
  P.push(box(0.15, 0.14, 0.5, 0x3a3128, dx - 0.1, 1.42, 0.04), box(0.15, 0.14, 0.5, 0x3a3128, dx + 0.1, 1.42, 0.04));
  P.push(box(0.14, 0.4, 0.14, 0x2a2118, dx - 0.1, 1.22, 0.3), box(0.14, 0.4, 0.14, 0x2a2118, dx + 0.1, 1.22, 0.3));
  P.push(sph(0.115, 8, 6, 0xc9a283, dx, 2.09, -0.24), cyl(0.14, 0.15, 0.05, 9, 0x2a2724, dx, 2.2, -0.24), box(0.16, 0.02, 0.1, 0x2a2724, dx, 2.185, -0.12));
  P.push(link([dx - 0.2, 1.88, -0.28], [dx - 0.14, 1.74, 0.38], 0.055, 0.045, coat), link([dx + 0.2, 1.88, -0.28], [dx + 0.14, 1.74, 0.38], 0.055, 0.045, coat));
  P.push(link([dx, 1.3, 0.8], [dx, 1.66, 0.42], 0.025, 0.02, IRON)); // steering column
  // ---- cargo bed: floor, dark side boards, tailboard ----
  P.push(box(1.84, 0.1, 2.14, WOOD, 0, 1.05, -1.63));
  P.push(box(1.84, 0.1, 2.14, PAINT2, 0, 0.95, -1.63));
  for (const sx of [-1, 1]) P.push(box(0.08, 0.56, 2.14, WOOD_DARK, sx * 0.88, 1.24, -1.63), box(0.1, 0.04, 2.16, 0x5a4a34, sx * 0.88, 1.53, -1.63));
  P.push(box(1.84, 0.56, 0.08, WOOD_DARK, 0, 1.24, -2.66), box(1.86, 0.04, 0.1, 0x5a4a34, 0, 1.53, -2.66));
  P.push(box(0.12, 0.12, 0.1, 0x9a1f1a, 0.75, 1.0, -2.78)); // tail lamp
  return merge(P);
}

function buildSteeringWheel() {
  const P = [];
  P.push(G(new THREE.TorusGeometry(0.2, 0.022, 6, 16), 0x1e1812, {}));
  for (let i = 0; i < 3; i++) P.push(G(new THREE.BoxGeometry(0.02, 0.19, 0.02).translate(0, 0.095, 0), 0x2a2018, { rz: (i / 3) * Math.PI * 2 }));
  P.push(cylZ(0.04, 0.04, 0.05, 8, BRASS));
  return merge(P);
}

export function createTruck(ctx) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const mat = vcolMaterial({ side: THREE.DoubleSide });

  const bodyMesh = new THREE.Mesh(buildBody(), mat);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  body.add(bodyMesh);

  const signMat = new THREE.MeshLambertMaterial({ map: signTexture(), color: 0xdddddd });
  const signs = new THREE.Mesh(signGeometry(), signMat);
  signs.castShadow = false; signs.receiveShadow = true;
  body.add(signs);

  // steering wheel (turns with the steering input)
  const swTilt = new THREE.Group();
  swTilt.position.set(0.42, 1.68, 0.46); swTilt.rotation.x = 0.7;
  const sw = new THREE.Mesh(buildSteeringWheel(), mat);
  sw.castShadow = false;
  swTilt.add(sw); body.add(swTilt);

  // wheels live on the group (unsprung)
  const frontGeo = merge(wheelParts(FRONT.r, { spokes: 10, tyreW: 0.12 }));
  const rearGeo = merge(wheelParts(REAR.r, { spokes: 12, tyreW: 0.12, dual: true }));
  const wheels = [];
  const makeWheel = (geo, r, x, z, side, parent) => {
    const root = new THREE.Group();
    root.position.set(x, r, z);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    if (side < 0) m.rotation.y = Math.PI; // hub cap faces outward
    root.add(m);
    parent.add(root);
    wheels.push({ root, r });
    return root;
  };
  const pivots = [];
  for (const sx of [1, -1]) {
    const piv = new THREE.Group();
    piv.position.set(sx * FRONT.x, 0, FRONT.z);
    group.add(piv); pivots.push(piv);
    makeWheel(frontGeo, FRONT.r, 0, 0, sx, piv);
    makeWheel(rearGeo, REAR.r, sx * REAR.x, REAR.z, sx, group);
  }

  // cargo: 6 on the bed (2 across x 3 along), 4 resting in the grooves on top (2 x 2)
  const cargoRoot = new THREE.Group();
  body.add(cargoRoot);
  const rot = () => new THREE.Euler(0, 0, Math.PI / 2);
  const y0 = BED.floorY + BED.barrelR;
  const cargoSlots = [];
  for (let i = 0; i < 6; i++) cargoSlots.push({ position: new THREE.Vector3((i % 2 ? 1 : -1) * SLOT_X, y0, SLOT_Z[Math.floor(i / 2)]), rotation: rot(), layer: 0 });
  const y1 = y0 + Math.sqrt((2 * BED.barrelR) ** 2 - 0.35 ** 2);
  for (let i = 0; i < 4; i++) cargoSlots.push({ position: new THREE.Vector3((i % 2 ? 1 : -1) * SLOT_X, y1, TOP_Z[Math.floor(i / 2)]), rotation: rot(), layer: 1 });

  const steerSign = -1; // steer > 0 = right = toward -X when facing +Z = rotation.y < 0
  function setWheels(spin, steer = 0) {
    for (const w of wheels) w.root.rotation.x = spin * SPIN_REF / w.r;
    for (const p of pivots) p.rotation.y = steerSign * steer;
    sw.rotation.z = steer * 2.4; // right turn = clockwise seen by the driver
  }
  setWheels(0, 0);

  return { group, body, cargoRoot, cargoSlots, setWheels, dims: { length: 5.4, width: 2.0, height: 2.6, wheelBase: 3.4 } };
}

// ---------------------------------------------------------------------------------------------
// Beer barrel: bulged staves (flat-shaded facets, vertex colours), iron hoops, heads, bung. ~330 triangles.
// ---------------------------------------------------------------------------------------------
let barrelGeo = null, barrelMat = null;
function buildBarrelGeometry() {
  const N = 14, H = 0.4, R0 = 0.33, R1 = 0.265;
  const prof = (y) => R1 + (R0 - R1) * (1 - (y / H) ** 2);
  const dprof = (y) => (R0 - R1) * (-2 * y) / (H * H);
  const pos = [], nor = [], col = [];
  const c = new THREE.Color();
  const push = (p, n, color) => { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); c.set(color); col.push(c.r, c.g, c.b); };
  const band = (y0, y1, off, colorFn) => {
    for (let j = 0; j < N; j++) {
      const t0 = (j / N) * Math.PI * 2, t1 = ((j + 1) / N) * Math.PI * 2, tc = (t0 + t1) / 2;
      const color = colorFn(j);
      const mk = (t, y, ymid) => {
        const r = prof(y) + off;
        const nx = Math.cos(tc), nz = Math.sin(tc), ny = -dprof(ymid);
        const l = Math.hypot(nx, ny, nz);
        return [[r * Math.cos(t), y, r * Math.sin(t)], [nx / l, ny / l, nz / l]];
      };
      const ym = (y0 + y1) / 2;
      const a = mk(t0, y0, ym), b = mk(t1, y0, ym), cc = mk(t1, y1, ym), d = mk(t0, y1, ym);
      for (const v of [a, d, cc, a, cc, b]) push(v[0], v[1], color);
    }
  };
  const ys = [-0.4, -0.27, -0.135, 0, 0.135, 0.27, 0.4];
  const wood = [0xb47c40, 0xa56f38, 0xbe874a, 0xab763f]; // light oak: barrels must read from the chase cam
  for (let i = 0; i < ys.length - 1; i++) band(ys[i], ys[i + 1], 0, (j) => wood[j % 4]);
  for (const hy of [-0.33, -0.12, 0.12, 0.33]) band(hy - 0.03, hy + 0.03, 0.012, () => 0x2a2a2d);
  // heads
  for (const s of [1, -1]) {
    const y = s * (H - 0.004), r = R1 - 0.012;
    for (let j = 0; j < N; j++) {
      const t0 = (j / N) * Math.PI * 2, t1 = ((j + 1) / N) * Math.PI * 2;
      const p0 = [r * Math.cos(t0), y, r * Math.sin(t0)], p1 = [r * Math.cos(t1), y, r * Math.sin(t1)];
      const color = j % 2 ? 0xc49a5c : 0xb88d52;
      if (s > 0) { push([0, y, 0], [0, 1, 0], 0x6b4524); push(p1, [0, 1, 0], color); push(p0, [0, 1, 0], color); }
      else { push([0, y, 0], [0, -1, 0], 0x6b4524); push(p0, [0, -1, 0], color); push(p1, [0, -1, 0], color); }
    }
  }
  // bung on the +X side (ends up on top once the barrel is laid down)
  const bung = box(0.07, 0.05, 0.07, 0x2a1a10, R0 + 0.01, 0.05, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const out = merge([g, bung]);
  out.computeBoundingSphere();
  return out;
}

export function createBarrelMesh(ctx) {
  if (!barrelGeo) {
    barrelGeo = buildBarrelGeometry();
    barrelMat = vcolMaterial();
  }
  const m = new THREE.Mesh(barrelGeo, barrelMat);
  m.castShadow = true;
  return m;
}
