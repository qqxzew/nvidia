// Náměstí Republiky, Plzeň (~1926): St. Bartholomew's cathedral (Gothic hall church, very tall west
// tower ~102 m, long nave with a steep roof, polygonal east chancel), the Renaissance town hall with
// sgraffito facade, gables and a small tower on the north side, the baroque plague column and a ring of
// colourful burgher houses. Owned by "landmarks".
//
// Draw calls: 4 meshes (walls / roofs / props / plaza) — each merged by material.
import * as THREE from 'three';
import {
  getKit, Builder, rng, M4, gableRoof, hipRoof, mansardRoof, dormer, addGable, addTree, addLamp, addBollard,
} from './landmarkUtils.js';

const PALETTE = [0xe2c27e, 0xdba48a, 0xc7cf9f, 0xb9c5c9, 0xeedfba, 0xe2b0a4, 0xe7d58e, 0xe9e2d2, 0xd7bf9a, 0xc9d3b1, 0xf0d2a8, 0xd1b8c4];
const ROOFS = [0xa2553d, 0x9a4e38, 0x8d4a37, 0xa86048, 0x7e4636, 0x6f6660];

export function buildSquare(ctx) {
  const { scene, route } = ctx;
  const kit = getKit(ctx);
  const A = route.anchors.square;
  const R = rng(1295);
  const wb = new Builder(kit); // atlas walls
  const rb = new Builder(kit); // roof tiles
  const pb = new Builder(kit); // vertex-coloured props
  const gb = new Builder(kit); // plaza cobbles

  // ------------------------------------------------------------------ plaza surface (y = 0.01)
  const PL = 0xd9cfbe;
  const ground = (x0, x1, z0, z1, c = PL) => gb.poly([[x0, 0.01, z1], [x1, 0.01, z1], [x1, 0.01, z0], [x0, 0.01, z0]], c, null, 'world', 4);
  ground(A.minX, 42, A.minZ, A.maxZ);
  ground(18, 36, A.maxZ, 70);
  const C = A.cathedral;

  // ------------------------------------------------------------------ cathedral of St. Bartholomew
  buildCathedral(wb, rb, pb, C.x, C.z);

  // ------------------------------------------------------------------ burgher house rows
  const rows = [
    // north row: facade z = minZ facing +Z (town hall slot at local 50..80 -> x -44..-14)
    { ox: A.minX - 14, oz: A.minZ, rot: 0, L: 152, slots: [{ at: 50, w: 30, kind: 'townhall' }] },
    // south row west part: facade z = maxZ facing -Z, local x runs west from the exit street; first house is the corner
    { ox: 18, oz: A.maxZ, rot: Math.PI, L: 98, first: { w: 14, d: 16, sideL: true, roof: 'hip' } },
    // south row east part (runs west from x=58 to the exit street x=36; last house is the corner)
    { ox: 58, oz: A.maxZ, rot: Math.PI, L: 22, fixed: [{ w: 8 }, { w: 14, d: 16, sideR: true, roof: 'hip' }] },
    // west row: facade x = minX facing +X (local x runs north)
    { ox: A.minX, oz: 66, rot: Math.PI / 2, L: 130 },
    // east row: facade x = 42 facing -X (local x runs south) — the most visible one at the start
    { ox: 42, oz: A.minZ, rot: -Math.PI / 2, L: A.maxZ - A.minZ, showy: true },
  ];
  let seed = 0;
  for (const row of rows) {
    const cos = Math.cos(row.rot), sin = Math.sin(row.rot);
    const place = (x) => [row.ox + x * cos, row.oz - x * sin];
    let x = 0, k = 0;
    while (x < row.L - 0.5) {
      const slot = row.slots?.find((s) => Math.abs(s.at - x) < 0.01);
      if (slot) {
        const [hx, hz] = place(x);
        townHall(wb, rb, pb, hx, hz, row.rot, slot.w);
        x += slot.w; continue;
      }
      let w = 9 + R() * 6;
      let o = {};
      if (row.fixed) { o = row.fixed[k] || {}; w = o.w; }
      else if (k === 0 && row.first) { o = row.first; w = o.w; }
      const next = row.slots?.find((s) => s.at > x);
      const limit = next ? next.at : row.L;
      if (limit - (x + w) < 7) w = limit - x;
      const [hx, hz] = place(x);
      burgherHouse(wb, rb, hx, hz, row.rot, { w, seed: seed++, showy: row.showy, ...o });
      x += w; k++;
    }
  }

  // ------------------------------------------------------------------ plague column (1681) NW of the cathedral
  plagueColumn(wb, pb, C.x - 50, C.z - 27);

  // ------------------------------------------------------------------ road edge on the plaza side (x ≈ 22): bollards + chain + lamps
  const EDGE = 22.3;
  let prev = null;
  for (let z = A.minZ + 4; z <= A.maxZ - 1; z += 3) {
    addBollard(pb, EDGE, z);
    if (prev !== null) {
      const zm = (prev + z) / 2;
      pb.add(chainGeo, M4(EDGE, 0.66, (prev + zm) / 2, 0, 1, 1, (zm - prev) + 0.05, 0.12), 0x2a2724);
      pb.add(chainGeo, M4(EDGE, 0.66, (zm + z) / 2, 0, 1, 1, (z - zm) + 0.05, -0.12), 0x2a2724);
    }
    prev = z;
  }
  for (let z = A.minZ + 8; z <= A.maxZ; z += 16) addLamp(pb, EDGE - 0.8, z, 4.8);
  for (let z = A.minZ + 12; z <= A.maxZ; z += 20) addLamp(pb, 39.6, z, 4.8);
  for (let z = 54; z <= 68; z += 14) { addLamp(pb, 19.2, z, 4.6); addLamp(pb, 34.8, z, 4.6); }
  // lamps around the cathedral
  for (const [lx, lz] of [[-30, -24], [0, -24], [-30, 16], [0, 16], [-62, -16], [-62, 8]]) addLamp(pb, C.x + 18 + lx, C.z + 4 + lz, 4.6);

  // ------------------------------------------------------------------ market stalls between the apse and the road
  for (let i = 0; i < 5; i++) stall(wb, pb, 16.5, 18 + i * 5.6, R);
  for (let i = 0; i < 3; i++) stall(wb, pb, 16.5, A.minZ + 16 + i * 5.6, R);
  // crates / barrels / sacks around the stalls
  for (let i = 0; i < 14; i++) {
    const z = 16 + R() * 30, x = 12 + R() * 2.5;
    pb.add(crateGeo, M4(x, 0.25, z, R() * 0.5, 0.6 + R() * 0.3, 0.5, 0.5 + R() * 0.3), R() < 0.5 ? 0x8a6a46 : 0x9a7b55);
  }

  // advertising columns
  advertColumn(wb, rb, pb, 8, A.minZ + 34);
  advertColumn(wb, rb, pb, C.x - 27, C.z + 34);

  // ------------------------------------------------------------------ a few lindens on the quieter west/south sides
  for (const [tx, tz] of [[-70, 30], [-70, 42], [-58, 44], [-44, 44], [-30, 44], [-70, -50], [-70, -40]]) addTree(pb, tx, tz, 1.15, R);

  // ------------------------------------------------------------------ meshes
  const group = new THREE.Group();
  group.name = 'square';
  const add = (m) => m && group.add(m);
  add(wb.mesh(kit.mats.wall, { name: 'square-walls' }));
  add(rb.mesh(kit.mats.roof, { name: 'square-roofs' }));
  add(pb.mesh(kit.mats.props, { name: 'square-props' }));
  add(gb.mesh(kit.mats.ground, { cast: false, name: 'square-plaza' }));
  scene.add(group);
  ctx.landmarks = ctx.landmarks || {};
  ctx.landmarks.square = { group, triangles: wb.triangles + rb.triangles + pb.triangles + gb.triangles };
  return {};
}

const chainGeo = new THREE.BoxGeometry(0.04, 0.04, 1);
const crateGeo = new THREE.BoxGeometry(1, 1, 1);

// =============================================================================================
function buildCathedral(wb, rb, pb, cx, cz) {
  const S = 0xefe9dc, SD = 0xdcd4c4, ROOF = 0x5f5149, SPIRE = 0x515a54, GOLD = 0xd8b45a;
  const xT0 = cx - 40, xT1 = cx - 28;       // west tower (12 x 12)
  const xN0 = xT1, xN1 = cx + 18;           // nave 46 m
  const xP1 = cx + 29;                       // chancel, apse centre
  const zN = cz - 12, zS = cz + 12;         // nave width 24
  const NAVE_H = 21, NAVE_R = 15;
  const lanc = (i, j) => (j === 1 ? 'lancet' : 'ashlar');

  // nave walls
  const bays = 7;
  wb.wall(xN0, zS, xN1, zS, [0, 2.5, 19, NAVE_H], bays, lanc, S);
  wb.wall(xN1, zN, xN0, zN, [0, 2.5, 19, NAVE_H], bays, lanc, S);
  wb.wall(xN0, zN, xN0, zS, [0, NAVE_H], 4, 'ashlar', S);
  wb.wall(xN1, zS, xN1, zN, [0, NAVE_H], 4, 'ashlar', S);
  wb.poly([[xN1, NAVE_H, zS], [xN1, NAVE_H, zN], [xN1, NAVE_H + NAVE_R, cz]], S, 'ashlar');
  wb.poly([[xN0, NAVE_H, zN], [xN0, NAVE_H, zS], [xN0, NAVE_H + NAVE_R, cz]], S, 'ashlar');
  // eaves cornice
  wb.box(xN0, xN1, NAVE_H - 0.6, NAVE_H, zS, zS + 0.5, 'stone', SD, { sides: 'se w' });
  wb.box(xN0, xN1, NAVE_H - 0.6, NAVE_H, zN - 0.5, zN, 'stone', SD, { sides: 'ne w' });
  gableRoof(rb, null, xN0, xN1, zN, zS, NAVE_H, NAVE_R, 'x', 0.7, ROOF);
  // buttresses
  const bw = (xN1 - xN0) / bays;
  for (let k = 0; k <= bays; k++) {
    const x = xN0 + k * bw;
    if (k === 0) continue; // the tower covers the west corners
    for (const side of [1, -1]) {
      const z0 = side > 0 ? zS : zN - 2.4, z1 = side > 0 ? zS + 2.4 : zN;
      wb.box(x - 0.75, x + 0.75, 0, 13, z0, z1, 'ashlar', SD);
      const z0b = side > 0 ? zS : zN - 1.5, z1b = side > 0 ? zS + 1.5 : zN;
      wb.box(x - 0.6, x + 0.6, 13, 18.5, z0b, z1b, 'ashlar', SD);
      pb.add(pinnacleGeo, M4(x, 19.6, side > 0 ? zS + 0.7 : zN - 0.7, Math.PI / 4, 0.8, 2.4, 0.8), SD);
    }
  }

  // chancel (presbytery) + polygonal apse
  const PH = 20, PR = 10.5, pz0 = cz - 7, pz1 = cz + 7;
  wb.wall(xN1, pz1, xP1, pz1, [0, 2.5, 18, PH], 2, lanc, S);
  wb.wall(xP1, pz0, xN1, pz0, [0, 2.5, 18, PH], 2, lanc, S);
  gableRoof(rb, null, xN1, xP1, pz0, pz1, PH, PR, 'x', 0.6, ROOF);
  const ap = [];
  for (let k = 0; k <= 4; k++) { const f = -Math.PI / 2 + (k * Math.PI) / 4; ap.push([xP1 + 7 * Math.cos(f), cz + 7 * Math.sin(f), f]); }
  for (let k = 0; k < 4; k++) {
    const [ax, az] = ap[k], [bx, bz] = ap[k + 1];
    wb.wall(bx, bz, ax, az, [0, 2.5, 18, PH], 1, lanc, S);
    // apse roof facet (eaves pushed out radially)
    const o = 0.6, ea = [xP1 + 7.6 * Math.cos(ap[k][2]), PH - 0.4, cz + 7.6 * Math.sin(ap[k][2])], eb = [xP1 + 7.6 * Math.cos(ap[k + 1][2]), PH - 0.4, cz + 7.6 * Math.sin(ap[k + 1][2])];
    void o;
    rb.poly([eb, ea, [xP1, PH + PR, cz]], ROOF, null, 'world');
  }
  for (let k = 1; k <= 3; k++) {
    const f = ap[k][2];
    wb.add(btGeo, M4(xP1 + 8.0 * Math.cos(f), 7, cz + 8.0 * Math.sin(f), -f, 2.4, 14, 1.4), SD, 'ashlar');
    wb.add(btGeo, M4(xP1 + 7.6 * Math.cos(f), 16, cz + 7.6 * Math.sin(f), -f, 1.4, 4, 1.1), SD, 'ashlar');
    pb.add(pinnacleGeo, M4(xP1 + 7.6 * Math.cos(f), 19.2, cz + 7.6 * Math.sin(f), Math.PI / 4, 0.7, 2.2, 0.7), SD);
  }
  // corner buttresses of the chancel
  for (const z of [pz0 - 1.2, pz1 + 1.2]) wb.box(xN1 + 4.6, xN1 + 6, 0, 15, z - 1.2, z + 1.2, 'ashlar', SD);

  // Šternberk chapel (south) and sacristy (north)
  const chap = (i, j) => (j === 1 ? 'lancet' : 'ashlar');
  wb.block(xN1 + 1, xN1 + 9, pz1, zS + 2, [0, 2, 10, 12], { s: chap, e: chap, w: 'ashlar', n: null }, S, 4);
  hipRoof(rb, xN1 + 1, xN1 + 9, pz1, zS + 2, 12, 4.5, 0.4, ROOF);
  wb.block(xN1 + 1, xN1 + 8, zN - 2, pz0, [0, 7.5], { n: 'ashlar', e: 'ashlar', w: 'ashlar', s: null }, S, 3.5);
  hipRoof(rb, xN1 + 1, xN1 + 8, zN - 2, pz0, 7.5, 3, 0.3, ROOF);

  // ridge turret
  wb.cyl(xN1 - 8, cz, NAVE_H + NAVE_R - 2.5, NAVE_H + NAVE_R + 3.5, 1.0, 0.9, 6, 1, 'belfry', 0x9a8a72, { smooth: false });
  rb.cone(xN1 - 8, cz, NAVE_H + NAVE_R + 3.5, 7, 1.3, 6, SPIRE, null, 0, 'world', 2);

  // ---- west tower
  const tz0 = cz - 6, tz1 = cz + 6, txm = (xT0 + xT1) / 2;
  const ys = [0, 3, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 59.5, 62];
  const tf = (face) => (i, j) => {
    if (j === 0) return 'ashlar';
    if (face === 'w' && i === 1 && j === 1) return 'portal';
    if (face === 'w' && i === 1 && j === 3) return 'rose';
    if (j === 10 || j === 11) return 'belfry';
    if (i === 1 && (j === 5 || j === 7 || j === 9)) return 'lancet';
    return 'ashlar';
  };
  wb.block(xT0, xT1, tz0, tz1, ys, { w: tf('w'), n: tf('n'), s: tf('s'), e: tf('e') }, S, 4, 'ashlar');
  // stepped corner buttresses
  for (const [sx, sz] of [[xT0, tz0], [xT0, tz1], [xT1, tz0], [xT1, tz1]]) {
    const dx = sx === xT0 ? -1 : 1, dz = sz === tz0 ? -1 : 1;
    const steps = [[0, 24, 2.8], [24, 44, 2.2], [44, 57, 1.5]];
    for (const [y0, y1, s] of steps) {
      const bx = sx + dx * (s / 2 - 0.5), bz = sz + dz * (s / 2 - 0.5);
      wb.box(bx - s / 2, bx + s / 2, y0, y1, bz - s / 2, bz + s / 2, 'ashlar', SD);
    }
  }
  // gallery at ~62 m: slab, parapet, corner pinnacles
  wb.box(xT0 - 1, xT1 + 1, 61.6, 62.6, tz0 - 1, tz1 + 1, 'stone', S, { bottom: true });
  const PT = 0.35, PY = 63.9;
  wb.box(xT0 - 1, xT1 + 1, 62.6, PY, tz1 + 1 - PT, tz1 + 1, 'ashlarDark', S);
  wb.box(xT0 - 1, xT1 + 1, 62.6, PY, tz0 - 1, tz0 - 1 + PT, 'ashlarDark', S);
  wb.box(xT0 - 1, xT0 - 1 + PT, 62.6, PY, tz0 - 1, tz1 + 1, 'ashlarDark', S);
  wb.box(xT1 + 1 - PT, xT1 + 1, 62.6, PY, tz0 - 1, tz1 + 1, 'ashlarDark', S);
  for (const [px, pz] of [[xT0 - 0.6, tz0 - 0.6], [xT0 - 0.6, tz1 + 0.6], [xT1 + 0.6, tz0 - 0.6], [xT1 + 0.6, tz1 + 0.6]]) {
    wb.cyl(px, pz, 62.6, 67.5, 0.85, 0.8, 6, 1, 'ashlar', S, { smooth: false });
    rb.cone(px, pz, 67.5, 3.8, 1.0, 6, SPIRE, null, 0, 'world', 2);
    pb.add(ballGeo, M4(px, 71.4, pz, 0, 0.18, 0.18, 0.18), GOLD);
  }
  // octagonal upper stage + tall spire (top ≈ 102 m)
  wb.cyl(txm, cz, 62.6, 74, 4.9, 4.6, 8, 2, null, S, { rot: Math.PI / 8, smooth: false, tilesFn: (k, j) => (j === 1 ? 'belfry' : 'ashlar') });
  wb.cyl(txm, cz, 74, 74.8, 5.2, 5.2, 8, 1, 'stone', SD, { rot: Math.PI / 8, smooth: false });
  rb.cone(txm, cz, 74.8, 23.6, 5.0, 8, SPIRE, null, Math.PI / 8, 'world', 2.5);
  // small gablets around the spire foot
  for (let k = 0; k < 8; k += 2) {
    const a = Math.PI / 8 + (k + 0.5) * (Math.PI / 4);
    rb.cone(txm + Math.sin(a) * 4.1, cz + Math.cos(a) * 4.1, 74.8, 3.4, 0.9, 4, SPIRE, null, a + Math.PI / 4, 'world', 2);
  }
  pb.add(ballGeo, M4(txm, 98.6, cz, 0, 0.45, 0.45, 0.45), GOLD);
  pb.add(crossGeo, M4(txm, 100.4, cz, 0, 0.14, 3.2, 0.14), GOLD);
  pb.add(crossGeo, M4(txm, 101.0, cz, 0, 1.4, 0.14, 0.14), GOLD);
}

const pinnacleGeo = new THREE.ConeGeometry(0.75, 1, 4);
const btGeo = new THREE.BoxGeometry(1, 1, 1);
const ballGeo = new THREE.SphereGeometry(1, 8, 6);
const crossGeo = new THREE.BoxGeometry(1, 1, 1);

// =============================================================================================
// Burgher house in a local frame: facade along local x (0..w) at z=0 facing +Z, depth to -d.
function burgherHouse(wb, rb, hx, hz, rot, o) {
  const R = rng(4049 + o.seed * 7919);
  const w = o.w, d = o.d || 12 + R() * 2;
  const color = o.color || PALETTE[Math.floor(R() * PALETTE.length)];
  const roofCol = o.roofCol || ROOFS[Math.floor(R() * ROOFS.length)];
  const floors = o.floors || (o.showy ? 3 + Math.floor(R() * 2) : 2 + Math.floor(R() * 3));
  const gh = 4.3 + R() * 0.6, fh = 3.4 + R() * 0.5;
  const ys = [0, gh];
  for (let k = 0; k < floors; k++) ys.push(gh + (k + 1) * fh);
  const yE = ys[ys.length - 1];
  const cols = Math.max(2, Math.round(w / 3.3));
  const ground = ['shop', 'shopB', 'rustic', 'shop'][Math.floor(R() * 4)];
  const upperSet = ['win', 'winOrn', 'winBaroque', 'winArch', 'winShutter', 'villaWin'];
  const upper = upperSet[Math.floor(R() * upperSet.length)];
  const second = R() < 0.5 ? upperSet[Math.floor(R() * upperSet.length)] : upper;
  const doorCol = Math.floor(R() * cols);
  const facade = (i, j, c, r) => {
    if (j === 0) return i === doorCol ? 'door' : ground;
    if (j === 1) return second;
    return upper;
  };
  wb.at(hx, hz, rot); rb.at(hx, hz, rot);

  wb.wall(0, 0, w, 0, ys, cols, facade, color);
  const dc = Math.max(1, Math.round(d / 3.3));
  const side = (i, j) => (j === 0 ? 'rustic' : upper);
  wb.wall(0, -d, 0, 0, o.sideL ? ys : [0, yE], o.sideL ? dc : 2, o.sideL ? side : 'plain', color);
  wb.wall(w, 0, w, -d, o.sideR ? ys : [0, yE], o.sideR ? dc : 2, o.sideR ? side : 'plain', color);
  wb.wall(w, -d, 0, -d, [0, yE], 2, 'plain', color);
  // string course + main cornice
  wb.box(-0.05, w + 0.05, gh - 0.35, gh, -0.05, 0.22, 'stone', color, { sides: 'sew' });
  wb.box(-0.2, w + 0.2, yE - 0.55, yE + 0.1, -0.2, 0.45, 'cornice', color, { sides: 'sew' });
  if (o.sideL) wb.box(-0.45, 0, yE - 0.55, yE + 0.1, -d, 0, 'cornice', color, { sides: 'w', top: false });
  if (o.sideR) wb.box(w, w + 0.45, yE - 0.55, yE + 0.1, -d, 0, 'cornice', color, { sides: 'e', top: false });

  let roof = o.roof;
  if (!roof) { const r = R(); roof = r < 0.42 ? 'front' : r < 0.75 ? 'eaves' : 'mansard'; }
  const chim = (x, z, y0, h) => wb.box(x - 0.35, x + 0.35, y0, y0 + h, z - 0.35, z + 0.35, 'brick', 0xd8c8b8);
  if (roof === 'front' && w <= 15) {
    const h = Math.min(9, w * 0.62);
    gableRoof(rb, wb, 0, w, -d, 0, yE + 0.1, h, 'z', 0.02, roofCol, color, 'plain');
    const style = ['volute', 'volute', 'stepped', 'triangle'][Math.floor(R() * 4)];
    addGable(wb, w / 2, yE + 0.1, 0.12, w + 0.1, h * (style === 'triangle' ? 1.02 : 1.14), style, color, 'gable');
    chim(w * 0.3, -d * 0.6, yE + h * 0.4, h * 0.75);
  } else if (roof === 'mansard') {
    mansardRoof(rb, 0, w, -d, 0, yE + 0.1, 3.4, 1.1, 2.2, 0.25, roofCol);
    const n = Math.max(1, Math.round(w / 4.2));
    for (let k = 0; k < n; k++) dormer(wb, rb, (w * (k + 0.5)) / n, -0.75, 1.5, yE + 0.6, 1.9, 1.6, color, roofCol, 'winSmall');
    chim(w * 0.7, -d * 0.5, yE + 4, 2.8);
  } else if (roof === 'hip') {
    const h = Math.min(w, d) * 0.42;
    hipRoof(rb, 0, w, -d, 0, yE + 0.1, h, 0.4, roofCol);
    const n = Math.max(1, Math.round(w / 5));
    const slope = h / (Math.min(w, d) / 2);
    for (let k = 0; k < n; k++) dormer(wb, rb, (w * (k + 0.5)) / n, -1.6, 1.5, yE + 0.1 + 1.0 * slope, 1.7, 2.6, color, roofCol, 'winSmall');
    chim(w * 0.5, -d * 0.5, yE + h * 0.5, h * 0.75);
  } else {
    const h = d * 0.42;
    gableRoof(rb, wb, 0, w, -d, 0, yE + 0.1, h, 'x', 0.4, roofCol, color, 'plain');
    const n = Math.max(1, Math.floor(w / 4.6));
    const slope = h / (d / 2);
    for (let k = 0; k < n; k++) dormer(wb, rb, (w * (k + 0.5)) / n, -1.4, 1.5, yE + 0.1 + 1.0 * slope, 1.7, 2.6, color, roofCol, R() < 0.3 ? 'winRound' : 'winSmall');
    chim(w * 0.25, -d * 0.5, yE + h * 0.6, h * 0.6);
    if (w > 11) chim(w * 0.78, -d * 0.5, yE + h * 0.6, h * 0.6);
  }
  wb.reset(); rb.reset();
}

// =============================================================================================
// Renaissance town hall (1554–59): sgraffito facade, high decorative attic gables, slender tower.
function townHall(wb, rb, pb, hx, hz, rot, W) {
  const D = 18, C = 0xeeebe3, ROOF = 0x8e4f3c, GOLD = 0xd8b45a, SP = 0x55605a;
  wb.at(hx, hz, rot); rb.at(hx, hz, rot); pb.at(hx, hz, rot);
  const ys = [0, 5, 9.4, 13.8, 18.2];
  const cols = 8;
  wb.wall(0, 0, W, 0, ys, cols, (i, j) => {
    if (j === 0) return i === 3 || i === 4 ? 'door' : 'sgraf';
    if (j === 3 && (i === 0 || i === 7)) return 'sgrafFig';
    return 'sgrafWin';
  }, C);
  wb.wall(W, 0, W, -D, [0, 18.2], 4, 'sgraf', C);
  wb.wall(0, -D, 0, 0, [0, 18.2], 4, 'sgraf', C);
  wb.wall(W, -D, 0, -D, [0, 18.2], 6, 'plain', C);
  // stone portal frame + balcony slab
  wb.box(W / 2 - 4.4, W / 2 + 4.4, 0, 0.6, 0, 0.8, 'stone', 0xd8d0c0);
  wb.box(W / 2 - 4, W / 2 + 4, 5.0, 5.5, 0, 1.4, 'stone', 0xd8d0c0);
  wb.box(-0.3, W + 0.3, 17.6, 18.4, -0.4, 0.55, 'cornice', C);
  gableRoof(rb, wb, 0, W, -D, 0, 18.3, 8, 'x', 0.3, ROOF, C, 'sgraf');
  // attic gables (stepped Renaissance shields with obelisks)
  const gables = [[W / 2, 12, 10.5], [5.2, 8, 7], [W - 5.2, 8, 7]];
  for (const [gx, gw, gh] of gables) {
    addGable(wb, gx, 18.3, 0.18, gw, gh, 'stepped', C, 'sgrafWin');
    for (const ox of [-gw / 2, gw / 2]) pb.add(obeliskGeo, M4(gx + ox * 0.95, 18.3 + 1.0, 0.25, 0, 0.5, 2, 0.5), 0xd8d0c0);
    pb.add(obeliskGeo, M4(gx, 18.3 + gh + 0.9, 0.2, 0, 0.45, 1.8, 0.45), 0xd8d0c0);
    pb.add(ballGeo, M4(gx, 18.3 + gh + 1.9, 0.2, 0, 0.22, 0.22, 0.22), GOLD);
  }
  // tower behind the facade: square shaft, clock, octagonal lantern, onion + spire
  const tx = W / 2, tz = -11, h0 = 18;
  wb.block(tx - 2.3, tx + 2.3, tz - 2.3, tz + 2.3, [h0, 23, 27.5, 29, 33], { all: (i, j) => (j === 3 ? 'clock' : j === 2 ? 'plain' : 'winSmall') }, C, 4.6);
  wb.box(tx - 2.7, tx + 2.7, 33, 33.7, tz - 2.7, tz + 2.7, 'stone', 0xd8d0c0);
  wb.cyl(tx, tz, 33.7, 37.2, 1.9, 1.75, 8, 1, 'arcadeWin', C, { rot: Math.PI / 8, smooth: false });
  rb.cyl(tx, tz, 37.2, 38.6, 2.1, 2.5, 8, 1, 'plain', SP, { rot: Math.PI / 8 });
  rb.cyl(tx, tz, 38.6, 39.8, 2.5, 1.2, 8, 1, 'plain', SP, { rot: Math.PI / 8, cap: false });
  rb.cone(tx, tz, 39.8, 8, 1.2, 8, SP, null, Math.PI / 8, 'world', 2);
  pb.add(ballGeo, M4(tx, 48.2, tz, 0, 0.3, 0.3, 0.3), GOLD);
  pb.add(crossGeo, M4(tx, 49.4, tz, 0, 0.1, 2, 0.1), GOLD);
  wb.reset(); rb.reset(); pb.reset();
}
const obeliskGeo = new THREE.ConeGeometry(0.5, 1, 4);

// =============================================================================================
function plagueColumn(wb, pb, x, z) {
  const S = 0xd2c8b4, GOLD = 0xdcb85c;
  wb.box(x - 3, x + 3, 0, 0.35, z - 3, z + 3, 'stone', S);
  wb.box(x - 2.4, x + 2.4, 0.35, 0.7, z - 2.4, z + 2.4, 'stone', S);
  wb.box(x - 1.8, x + 1.8, 0.7, 1.05, z - 1.8, z + 1.8, 'stone', S);
  wb.box(x - 1.2, x + 1.2, 1.05, 4.2, z - 1.2, z + 1.2, 'plinth', 0xe2dacb);
  wb.box(x - 1.45, x + 1.45, 4.2, 4.6, z - 1.45, z + 1.45, 'stone', S);
  wb.cyl(x, z, 4.6, 12.2, 0.48, 0.38, 10, 4, 'stone', S, { cap: false });
  wb.box(x - 0.7, x + 0.7, 12.2, 12.8, z - 0.7, z + 0.7, 'stone', S);
  // Madonna on a cloud + halo (gilded)
  pb.add(new THREE.SphereGeometry(0.7, 8, 5), M4(x, 13.0, z, 0, 1, 0.55, 1), 0xd9d1c2);
  pb.add(new THREE.ConeGeometry(0.45, 1.6, 8), M4(x, 14.0, z), GOLD);
  pb.add(ballGeo, M4(x, 15.0, z, 0, 0.22, 0.24, 0.22), GOLD);
  pb.add(new THREE.TorusGeometry(0.35, 0.05, 4, 12), M4(x, 15.25, z), GOLD);
  // four saints on the pedestal corners
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    pb.add(new THREE.ConeGeometry(0.28, 1.3, 6), M4(x + dx * 1.95, 1.7, z + dz * 1.95), 0xcfc6b5);
    pb.add(ballGeo, M4(x + dx * 1.95, 2.45, z + dz * 1.95, 0, 0.16, 0.16, 0.16), 0xcfc6b5);
  }
}

// =============================================================================================
function stall(wb, pb, x, z, R) {
  const W = 4.6, D = 2.8, H = 2.3, wood = 0x6e5236;
  for (const [dx, dz] of [[-D / 2, -W / 2], [D / 2, -W / 2], [-D / 2, W / 2], [D / 2, W / 2]]) pb.add(postGeo, M4(x + dx, H / 2, z + dz, 0, 0.1, H, 0.1), wood);
  pb.add(postGeo, M4(x + 0.3, 0.85, z, 0, D - 0.6, 0.08, W - 0.4), 0x8a6a46); // table
  pb.add(postGeo, M4(x + 0.3, 0.42, z, 0, D - 0.8, 0.84, W - 0.6), 0x5e4630);
  // goods
  const goods = [0xb5452f, 0xd49a3a, 0x7c8f3c, 0xe2d2a0, 0x8a5a9a, 0xc76b2e];
  for (let i = 0; i < 6; i++) pb.add(postGeo, M4(x + 0.3 + (R() - 0.5) * 1.4, 0.98, z + (i - 2.5) * 0.7, R(), 0.5, 0.18 + R() * 0.12, 0.5), goods[Math.floor(R() * goods.length)]);
  // striped canvas roof sloping toward the road
  const yb = H + 0.1, yt = H + 0.9;
  wb.quad([x + D / 2 + 0.4, yb, z + W / 2 + 0.2], [x + D / 2 + 0.4, yb, z - W / 2 - 0.2], [x - D / 2 - 0.2, yt, z - W / 2 - 0.2], [x - D / 2 - 0.2, yt, z + W / 2 + 0.2], 0xffffff, 'awning');
  wb.quad([x - D / 2 - 0.2, yt, z + W / 2 + 0.2], [x - D / 2 - 0.2, yt, z - W / 2 - 0.2], [x + D / 2 + 0.4, yb, z - W / 2 - 0.2], [x + D / 2 + 0.4, yb, z + W / 2 + 0.2], 0xd8d0c4, 'awning');
  // valance
  wb.quad([x + D / 2 + 0.4, yb - 0.35, z + W / 2 + 0.2], [x + D / 2 + 0.4, yb - 0.35, z - W / 2 - 0.2], [x + D / 2 + 0.4, yb, z - W / 2 - 0.2], [x + D / 2 + 0.4, yb, z + W / 2 + 0.2], 0xffffff, 'awning');
}
const postGeo = new THREE.BoxGeometry(1, 1, 1);

function advertColumn(wb, rb, pb, x, z) {
  pb.add(new THREE.CylinderGeometry(0.85, 0.9, 0.4, 10), M4(x, 0.2, z), 0x3b4a3e);
  wb.cyl(x, z, 0.4, 3.4, 0.75, 0.75, 10, 1, 'poster', 0xffffff, { cap: false });
  pb.add(new THREE.CylinderGeometry(0.9, 0.85, 0.25, 10), M4(x, 3.5, z), 0x3b4a3e);
  rb.cone(x, z, 3.6, 0.9, 0.85, 10, 0x4c5e50, null, 0, 'world', 1);
  pb.add(ballGeo, M4(x, 4.6, z, 0, 0.12, 0.12, 0.12), 0xd8b45a);
}
