// Světovar — Český plzeňský pivovar, Bory (1910–13, today TechTower). Owned by "landmarks".
//
// Rebuilt to the archive material (docs/reference + the 1911/1912 permit drawings):
//   · footprints from the 1912 site plan ("Český plzeň. pivovar", 13 Nov 1912, č. 31659) — plan right =
//     east (the field road, fence x = -6), plan up = north (-Z), ≈ 0.30 m per plan pixel (calibrated on
//     the 4.5 m spacing of the yard tracks and the admin building's width in the elevation);
//   · heights from the 1911 street elevation "celkový pohled na pivovar" (1:250 scale bar ≈ 10 px/m):
//     chimney ≈ 48 m, clock spire ≈ 34 m (finial 36 m), brewhouse parapet ≈ 16 m, cellar tower ridge
//     ≈ 28.5 m with its stair tower ≈ 25 m, admin eaves ≈ 9 m;
//   · shapes from the period photos (field view with the people, the wagon photo, the two postcards and
//     the aerial postcard, which shows the same layout as the plan seen from the south-east).
//
// Layout (world coords, X = east, Z = south; the field road runs south along x ≈ 6 east of the fence):
//   north of the upper track (z 870): malt house "Sladovna" with the kiln turret (x -148..-94, z 829..866),
//     coachmen's house + garage in the NE corner (gable to the road), coach house + cooperage along the
//     west fence, the petrol shed.
//   between the tracks: chimney (-76, 879.5) + dark lattice cooling tower + condenser house; the brewhouse row
//     Varna (clock tower at its SW corner, timber coolship on the roof) · silo · pre-heaters · machine room
//     · boiler house (x -161..-86, z 892..915); the Kantina pavilion with its turret by the east fence.
//   yard tracks z 921 / 930 with the "PLZEŇSKÝ SVĚTOVAR" wagons and buffer stops at x ≈ -45 (wagon photo:
//     the truck stands right next to the wagons, the brewhouse row behind them).
//   south of the tracks: lager cellars (x -203..-156) with the cellar tower on their NE corner, linked to
//     the Varna by a covered bridge; bottling + fire station / barrel wash (x -156..-98) whose east front
//     with the loading ramp ends the drive (finish ≈ (-76, 951), truck facing -X); administration
//     building angled along the SE boundary street, a villa beside it.
// The yard band z 935..968 for x -95..-6 is kept free (only flat chalk marks + paving).
// The railway really came from the west; in the game the upper track continues east through the fence to
// the level crossing on the field road (route.anchors.rail).
//
// Draw calls: walls, roofs, props, yard (merged by material) + fence panels, wagons, barrels (instanced)
// + coal smoke + 2 steam plumes + flags (instanced) = 11.
import * as THREE from 'three';
import {
  getKit, Builder, rng, M4, gableRoof, hipRoof, mansardRoof, dormer, addGable, addTree, addLamp,
  barrelGeometry, createSmoke,
} from './landmarkUtils.js';

const CREAM2 = 0xe5d5b5, OCHRE = 0xe2cfa6, VILLA = 0xeee2c8;
// per-building plaster tones (hand-coloured postcards: warm cream, light ochre, one whiter render)
const T_BREW = 0xf0e6d0, T_TOWER = 0xeadab8, T_CELLAR = 0xe4d3b0, T_MALT = 0xece0c4, T_MALT2 = 0xe6d8b8;
const T_HOUSE = 0xf1e8d4, T_MACH = 0xe9dcc0, T_BOIL = 0xe6d5b2, T_EXP = 0xeadfc6, T_KANT = 0xf0e4cc;
const SLATE = 0x5f5a55, SLATE2 = 0x58595b, SLATE3 = 0x655c54, RED = 0x8f4a36, RED2 = 0x9a553d;
const FASCIA = 0x3d3833, STONE = 0xddd3c0, IRON = 0x2d2a26;
const ROOF_SCALE = 7; // world repeat of the hero roof texture (m)

// key positions (1912 plan / 1911 elevation)
const CH = [-76, 879.5];                                      // chimney (the small circle in the plan)
const CH_H = 48;                                              // chimney height
const VAR = { x0: -160, x1: -141, z0: 895, z1: 915 };         // brewhouse (Varna)
const TWR = { x0: -161, x1: -153.6, z0: 907.8, z1: 915.6 };   // its clock tower (SW corner)
const CT = { x0: -166, x1: -156, z0: 942, z1: 960 };          // cellar tower (věž sklepů)
const CTS = { x0: -165, x1: -157, z0: 936.4, z1: 942 };       // … and its stair tower (north side)
const L1Z = 921, L2Z = 930;                                   // yard tracks
const STACKS = [[-147.1, 901], [-147.1, 908.5]];              // brew-kettle vapour stacks
const ADM = { x: -34.7, z: 976.8, rot: -2.618 };              // admin building (front faces NW to the yard)
const VILLA2 = { x: -66, z: 992.6, rot: -2.618 };

export function buildSvetovar(ctx) {
  const { scene, route, camera } = ctx;
  const kit = getKit(ctx);
  const a = route.anchors;
  const R = rng(1911);
  const wb = new Builder(kit), rb = new Builder(kit), pb = new Builder(kit), gb = new Builder(kit);
  rb.worldScale = ROOF_SCALE;
  const FX = a.fence.x, RZ = a.rail.z;
  // boundary of the 1912 plan: straight east side along the road, a diagonal street in the south-east
  const NE = [FX, a.brewery.minZ], SE = [FX, a.fence.toZ], SM = [-109, 1028.7], SW = [a.brewery.minX, a.brewery.maxZ], NW = [a.brewery.minX, 800];
  const GR = (...args) => GRf(wb, rb, ...args);
  const HR = (...args) => HRf(rb, ...args);

  // ------------------------------------------------------------------ yard surface, paving, lawns
  // beaten-earth base of the whole compound (untextured: reads as dusty ground from the menu camera),
  // cobbled / cinder areas on top of it in the ground material
  flat(pb, [SE, NE, NW, SW, SM], 0.006, 0xb3a68c);
  const pave = (x0, x1, z0, z1, c, y = 0.013) => gb.poly([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], c, null, 'world', 5);
  pave(-98, -7, 930, 972, 0xd6cbb8);                 // cobbled main yard (gate → expedition), under the road ribbon
  pave(-162, -86, 915, 918.6, 0xc8beae);             // cobbles along the brewhouse row
  pave(-276, -40, 916.6, 934.4, 0x968b7c);           // cinders of the yard tracks
  pave(-176, -7, 865.6, 874.4, 0x968b7c);            // cinders of the upper track
  pave(-86, -60, 876, 916, 0x8d8378);                // coal yard by the boiler house
  pave(-156, -98, 977, 983, 0xcfc3ad);               // lane behind the bottling hall
  pave(-203, -156, 989, 995, 0xcfc3ad);              // lane behind the cellars
  const lawn = (x0, x1, z0, z1, c = 0x86955a) => pb.quad([x0, 0.04, z1], [x1, 0.04, z1], [x1, 0.04, z0], [x0, 0.04, z0], c);
  lawn(-58, -31, 885, 914);                          // lawn in front of the chimney (aerial postcard)
  lawn(-29, -6.6, 875, 921, 0x83935a);               // Kantina garden
  lawn(-92, -52, 813, 862, 0x7f8f55);                // between malt house and coachmen's house
  lawn(-160, -50, 792, 826, 0x8a9660);               // north strip
  lawn(-255, -205, 940, 1050, 0x8a9660);             // west field inside the fence
  lawn(-280, -208, 800, 860, 0x84925a);
  // admin + villa garden along the diagonal street
  flat(pb, [[-6.5, 973.2], [-6.5, 962], [-22, 958.5], [-84, 993], [-104, 1026.3]], 0.04, 0x86955a);

  // ------------------------------------------------------------------ railway: upper track + yard tracks
  const wagonsAt = buildTrack(pb, RZ);

  // ------------------------------------------------------------------ north: malt house, coachmen's house, sheds
  sladovna(wb, rb, pb, GR, HR);
  coachmensHouse(wb, rb, GR, HR);
  // coach house (Kolna) + cooperage (Bednárna) along the west fence
  wb.block(-275, -262, 806, 852, [0, 0.8, 5.4], { all: (i, j) => (j === 0 ? 'plinth' : 'win'), e: (i, j) => (j === 0 ? 'plinth' : 'loadDoor') }, OCHRE, 4.2);
  GR(-275, -262, 806, 852, 5.4, 4.0, 'z', 0.4, SLATE3, OCHRE, 'gable');
  wb.block(-275, -262, 852, 883, [0, 0.8, 5.4], { all: (i, j) => (j === 0 ? 'plinth' : 'win') }, CREAM2, 3.9);
  GR(-275, -262, 852, 883, 5.4, 4.0, 'z', 0.4, SLATE, CREAM2, 'gable');
  chimney(wb, -268.5, 868, 8.0, 2.2);
  // petrol shed (Benzinka) with a pump
  wb.block(-178, -166, 800, 806, [0, 3.2], { all: 'plain', s: (i) => (i === 1 ? 'door' : 'win') }, CREAM2, 4);
  GR(-178, -166, 800, 806, 3.2, 1.6, 'x', 0.3, SLATE3, CREAM2, 'plain');
  pb.add(cylG, M4(-171, 1.1, 808.2, 0, 0.22, 2.2, 0.22), 0xa53a2e);
  pb.add(ballG, M4(-171, 2.45, 808.2, 0, 0.26, 0.3, 0.26), 0xf1ead8);

  // ------------------------------------------------------------------ between the tracks: brewhouse row, chimney
  brewhouse(wb, rb, pb, GR, HR);
  chimneyStack(wb, pb);
  // dark lattice cooling tower west of the chimney (the octagon in the plan): right of the chimney in the
  // photo with the people (seen from the NE), left of it on the aerial postcard (seen from the SE)
  const KT = [-88.4, 882];
  wb.cyl(KT[0], KT[1], 0, 13.0, 4.5, 3.0, 8, 3, 'slats', 0xffffff, { rot: Math.PI / 8, smooth: false, cap: true });
  wb.cyl(KT[0], KT[1], 13.0, 14.5, 2.4, 2.4, 8, 1, 'slats', 0xcccccc, { rot: Math.PI / 8, smooth: false, cap: true });
  for (let k = 0; k < 8; k++) { const an = Math.PI / 8 + (k / 8) * Math.PI * 2; rb.beam([KT[0] + Math.sin(an) * 4.55, 0, KT[1] + Math.cos(an) * 4.55], [KT[0] + Math.sin(an) * 3.05, 13.1, KT[1] + Math.cos(an) * 3.05], 0.26, 0.26, 0x2a2622); }
  // condenser house (KOND.)
  wb.block(-115, -103, 875, 887, [0, 0.8, 5.0], { all: (i, j) => (j === 0 ? 'plinth' : 'win') }, T_MACH, 4);
  wb.box(-115.3, -102.7, 4.8, 5.4, 874.7, 887.3, 'corniceHeavy', T_MACH);
  HR(-115, -103, 875, 887, 5.4, 2.4, 0.4, SLATE3);
  kantina(wb, rb, pb);

  // ------------------------------------------------------------------ south of the tracks
  cellars(wb, rb, pb, GR, HR);
  cellarTower(wb, rb, pb);
  // covered bridge Varna → cellar tower over the yard tracks (wagon photo), on a lattice pylon
  {
    const BX = -159, y0 = 8.2, y1 = 10.8, za = TWR.z1, zb = CTS.z0;
    wb.wall(BX + 1.2, zb, BX + 1.2, za, [y0, y1], 7, 'winSmall', T_BREW);
    wb.wall(BX - 1.2, za, BX - 1.2, zb, [y0, y1], 7, 'winSmall', T_BREW);
    wb.box(BX - 1.2, BX + 1.2, y0 - 0.25, y0, za, zb, 'stone', STONE, { bottom: true, sides: 'ew' });
    wb.box(BX - 1.4, BX + 1.4, y1, y1 + 0.3, za, zb, 'stone', STONE, { bottom: true, sides: 'ew' });
    const pz = (L1Z + L2Z) / 2;
    for (const dx of [-0.9, 0.9]) for (const dz of [-0.6, 0.6]) rb.beam([BX + dx * 1.25, 0, pz + dz * 1.4], [BX + dx, y0 - 0.25, pz + dz], 0.22, 0.22, IRON);
    for (let k = 0; k < 4; k++) {
      const ya = (k * (y0 - 0.3)) / 4, yb = ((k + 1) * (y0 - 0.3)) / 4;
      for (const dx of [-0.9, 0.9]) rb.beam([BX + dx, ya, pz - 0.75], [BX + dx, yb, pz + 0.75], 0.08, 0.08, IRON);
      for (const dz of [-0.6, 0.6]) rb.beam([BX - 1.0, ya, pz + dz], [BX + 1.0, yb, pz + dz], 0.08, 0.08, IRON);
    }
  }
  expedition(wb, rb, pb);
  adminBuilding(wb, rb, pb, ADM.x, ADM.z, ADM.rot);
  smallVilla(wb, rb, VILLA2.x, VILLA2.z, VILLA2.rot);

  // coal heaps by the boiler house and along the yard track (wagon photo)
  heap(pb, -78, 899, 4.2, 2.4, 0x2f2c29); heap(pb, -69.5, 906, 3.0, 1.8, 0x34302c); heap(pb, -81, 910.5, 2.4, 1.4, 0x312d2a);
  heap(pb, -58, 935.6, 2.4, 1.3, 0x34312d); heap(pb, -37, 933.5, 2.8, 1.5, 0x2f2c29);

  // ------------------------------------------------------------------ perimeter fence + gates
  const gw = gateway(wb, pb, route, a.gate);
  const GZN = 922; // where the fence leaves the x = FX line toward the right gate pillar
  const toward = (p, q, d) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [p[0] + ((q[0] - p[0]) * d) / l, p[1] + ((q[1] - p[1]) * d) / l]; };
  const sLen = Math.hypot(SW[0] - SM[0], SW[1] - SM[1]), sGate = sLen * ((-232 - SM[0]) / (SW[0] - SM[0])); // "menší vjezd"
  const fence = buildFence(wb, kit, [
    { a: NE, b: [FX, GZN], gaps: [[RZ - 4.5 - NE[1], RZ + 4.5 - NE[1]]] }, // east, along the field road (rail opening)
    { a: [FX, GZN], b: toward(gw.right, [FX, GZN], 1.3) },                // swing in to the right gate pillar
    { a: toward(gw.left, SE, 1.3), b: SE },                               // from the left gate pillar to the SE corner
    { a: SE, b: SM },                                                     // diagonal street (south-east)
    { a: SM, b: SW, gaps: [[sGate - 3.4, sGate + 3.4]] },                 // south, with the smaller entrance
    { a: SW, b: NW },                                                     // west
    { a: NW, b: NE },                                                     // north
  ]);
  for (const sg of [-1, 1]) {
    const t = (sGate + sg * 3.6) / sLen, x = SM[0] + (SW[0] - SM[0]) * t, z = SM[1] + (SW[1] - SM[1]) * t;
    wb.block(x - 0.6, x + 0.6, z - 0.6, z + 0.6, [0, 0.6, 3.2], { all: (i, j) => (j === 0 ? 'plinth' : 'stone') }, 0xe6dccb, 1.2);
    wb.box(x - 0.75, x + 0.75, 3.2, 3.5, z - 0.75, z + 0.75, 'stone', 0xd8cebd);
    wb.cone(x, z, 3.5, 0.6, 0.75, 4, 0xcfc5b2, 'stone', Math.PI / 4);
  }

  // ------------------------------------------------------------------ trees, lamps, finish marks, props
  // avenue along the diagonal street outside the fence (aerial postcard) + garden trees
  for (let t = 0.04; t < 1; t += 0.13) addTree(pb, SE[0] + (SM[0] - SE[0]) * t + 2.6, SE[1] + (SM[1] - SE[1]) * t + 4.6, 1.1, R);
  for (let x = -125; x > -280; x -= 24) addTree(pb, x, 1032 + (x + 109) * -0.19 + 6, 1.0, R);
  addTree(pb, -11.5, 966.5, 1.15, R); addTree(pb, -84, 1001, 1.05, R); addTree(pb, -96, 1007, 1.0, R);
  for (const [x, z] of [[-44, 1003], [-30, 993]]) poplar(pb, x, z, R);
  for (const [x, z] of [[-28, 912], [-28, 884], [-52, 912], [-35, 887]]) addTree(pb, x, z, 0.95, R);
  for (const z of [878, 894, 906, 919]) poplar(pb, -8.6, z, R);
  for (const x of [-70, -86, -150, -190, -230]) addTree(pb, x, 796.5, 1.0, R);
  for (const z of [900, 930, 960, 990, 1020]) addTree(pb, -279, z, 1.0, R);
  for (const [x, z] of [[-9.8, 964], [-28, 961.5], [-46, 969], [-60, 983.5], [-12, 924]]) shrub(pb, x, z, R);
  for (const [x, z] of [[-22, 933], [-52, 937.6], [-80, 937.6], [-62, 965], [-92, 966], [-130, 935]]) addLamp(pb, x, z, 4.6);

  finishMarks(pb, a.finish);
  const barrels = [];
  rampBarrels(barrels);
  barrelPile(barrels, -112, 934.4, 5, 0, 1.0); barrelPile(barrels, -96, 934.4, 4, 0, 1.0); barrelPile(barrels, -70, 934.4, 4, 0, 1.0);
  barrelPile(barrels, -14, 929, 4, 0);
  barrelPile(barrels, -150, 980, 4, 0);
  // crates + carts
  for (let i = 0; i < 10; i++) pb.add(boxG, M4(-150 + R() * 12, 0.35, 934.8 + R() * 2.2, R() * 0.4, 0.8, 0.7, 0.8), i % 2 ? 0x8a6a46 : 0x9a7b55);
  handCart(pb, -95, 979, 0.4);
  handCart(pb, -140, 935.6, 1.6);

  // flagpoles (static) — the flags themselves are one instanced dynamic mesh
  const admTop = local(ADM, 0, 0);
  const FLAGS = [{ x: -95.4, z: 977.6, y0: 0, top: 11, s: 1 }, { x: admTop[0], z: admTop[1], y0: 14.6, top: 21.6, s: 1.2 }];
  for (const f of FLAGS) {
    pb.add(cylG, M4(f.x, (f.y0 + f.top) / 2, f.z, 0, 0.07 * f.s, f.top - f.y0, 0.07 * f.s), 0xe8e2d6);
    pb.add(ballG, M4(f.x, f.top + 0.1, f.z, 0, 0.13 * f.s, 0.13 * f.s, 0.13 * f.s), 0xc9a64e);
  }

  // ------------------------------------------------------------------ assemble
  const group = new THREE.Group();
  group.name = 'svetovar';
  const add = (m) => m && group.add(m);
  add(wb.mesh(kit.mats.wall, { name: 'svetovar-walls' }));
  add(rb.mesh(kit.mats.roofHero, { name: 'svetovar-roofs' }));
  add(pb.mesh(kit.mats.props, { name: 'svetovar-props' }));
  add(gb.mesh(kit.mats.ground, { cast: false, name: 'svetovar-yard' }));
  add(fence.panels);
  add(wagonMesh(kit, wagonsAt));
  add(barrelMesh(kit, barrels));

  // coal smoke from the chimney: dark, drifting west-south-west so it streams sideways across the sky in
  // both the aerial (from SE) and the field / crane menu shots (from NE)
  const smoke = createSmoke(kit, camera, [CH[0], CH_H + 0.6, CH[1]], { count: 34, rise: 9, drift: [-34, 0, 10], size: [4.0, 22], alpha: 0.42, period: 17, material: kit.mats.smokeDark, spread: 2.0 });
  smoke.mesh.name = 'svetovar-smoke';
  group.add(smoke.mesh);
  // white steam from the brewhouse vapour stacks
  const steam = STACKS.map(([x, z], i) => {
    const st = createSmoke(kit, camera, [x, 26.4, z], { count: 10, rise: 10, drift: [-16, 0, 5], size: [2.0, 10], alpha: 0.95, period: 8 + i * 1.3, spread: 1.5 });
    st.mesh.name = 'svetovar-steam'; group.add(st.mesh); return st;
  });
  // Czechoslovak flags (ramp + administration building)
  const flags = makeFlags(kit, FLAGS);
  group.add(flags.mesh);
  ctx.dynamic.push({ update: (dt, t) => { smoke.update(dt, t); steam[0].update(dt, t + 3.1); steam[1].update(dt, t); flags.update(dt, t); } });

  scene.add(group);
  ctx.landmarks = ctx.landmarks || {};
  // triangles incl. instanced meshes (smoke/steam billboards: 2 tris each)
  let triangles = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    triangles += n * (o.isInstancedMesh ? o.count : 1);
  });
  ctx.landmarks.svetovar = { group, triangles, drawCalls: group.children.length, chimney: { x: CH[0], z: CH[1], h: CH_H } };
  return {};
}

const boxG = new THREE.BoxGeometry(1, 1, 1);
const ballG = new THREE.SphereGeometry(1, 8, 6);
const cylG = new THREE.CylinderGeometry(1, 1, 1, 10);
const coneG = new THREE.ConeGeometry(1, 1, 10);

/** World point of a building-local offset (lx along the front, lz toward the front). */
function local(f, lx, lz) {
  const c = Math.cos(f.rot), s = Math.sin(f.rot);
  return [f.x + lx * c + lz * s, f.z - lx * s + lz * c];
}
/** Put builders into a rotated building frame (+ optional local offset / extra yaw). */
function frame(f, lx = 0, lz = 0, r = 0, ...bs) {
  const [x, z] = local(f, lx, lz);
  for (const b of bs) b.at(x, z, f.rot + r);
}
/** Flat horizontal polygon (xz points), oriented to face up whatever the input winding. */
function flat(b, pts, y, color) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; }
  const P = (s > 0 ? pts.slice().reverse() : pts).map(([x, z]) => [x, y, z]);
  b.poly(P, color);
}

function chimney(wb, x, z, y0, h) {
  wb.box(x - 0.45, x + 0.45, y0, y0 + h, z - 0.45, z + 0.45, 'brick', 0xd8c8b8);
  wb.box(x - 0.58, x + 0.58, y0 + h, y0 + h + 0.28, z - 0.58, z + 0.58, 'stone', 0xd0c4b0);
  wb.box(x - 0.3, x + 0.3, y0 + h + 0.28, y0 + h + 0.5, z - 0.3, z + 0.3, 'dark', 0xffffff);
}

function GRf(wb, rb, x0, x1, z0, z1, yE, h, axis, o, roofCol, wallCol, gTile = 'plain', opts = {}) {
  gableRoof(rb, opts.noWalls ? null : wb, x0, x1, z0, z1, yE, h, axis, o, roofCol, wallCol, gTile, opts);
  gableCaps(rb, x0, x1, z0, z1, yE, h, axis, o, roofCol, opts.ends !== false);
}
function HRf(rb, x0, x1, z0, z1, yE, h, o, roofCol) {
  hipRoof(rb, x0, x1, z0, z1, yE, h, o, roofCol);
  hipCaps(rb, x0, x1, z0, z1, yE, h, o, roofCol);
}

// ---------------------------------------------------------------------------------------------
// relief helpers
/** String courses / cornices: projecting bands all around a rectangular block. */
function bands(wb, x0, x1, z0, z1, ys, color, p = 0.2, t = 0.32, tile = 'cornice') {
  for (const y of ys) wb.box(x0 - p, x1 + p, y - t / 2, y + t / 2, z0 - p, z1 + p, tile, color, { bottom: true });
}
/** Thin wall ring (parapet / coping) around a footprint: outer face p outside the wall line, thickness t. */
function ring(wb, x0, x1, z0, z1, y0, y1, p, t, tile, color) {
  wb.box(x0 - p, x1 + p, y0, y1, z0 - p, z0 - p + t, tile, color, { bottom: true });
  wb.box(x0 - p, x1 + p, y0, y1, z1 + p - t, z1 + p, tile, color, { bottom: true });
  wb.box(x0 - p, x0 - p + t, y0, y1, z0 - p + t, z1 + p - t, tile, color, { bottom: true });
  wb.box(x1 + p - t, x1 + p, y0, y1, z0 - p + t, z1 + p - t, tile, color, { bottom: true });
}
/** Corner pilasters (lesenes) — they catch the low sun and give the blocks a crisp outline. */
function pilasters(wb, x0, x1, z0, z1, y0, y1, color, w = 0.9, p = 0.2) {
  for (const [x, sx] of [[x0, -1], [x1, 1]]) for (const [z, sz] of [[z0, -1], [z1, 1]]) {
    const xa = sx < 0 ? x - p : x - w + p, xb = sx < 0 ? x + w - p : x + p;
    const za = sz < 0 ? z - p : z - w + p, zb = sz < 0 ? z + w - p : z + p;
    wb.box(Math.min(xa, xb), Math.max(xa, xb), y0, y1, Math.min(za, zb), Math.max(za, zb), 'plain', color, { top: false });
  }
}
/** Flat roof deck (tarred) on top of a block. */
function deck(wb, x0, x1, z0, z1, y, color = 0x8f877c) {
  wb.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color, 'dark');
}
/** Iron railing around a flat roof. */
function railing(pb, x0, x1, z0, z1, y) {
  for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.6)), yaw = Math.atan2(-(bz - az), bx - ax);
    pb.add(boxG, M4((ax + bx) / 2, y + 1.0, (az + bz) / 2, yaw, L, 0.06, 0.06), IRON);
    for (let k = 0; k <= n; k++) pb.add(boxG, M4(ax + ((bx - ax) * k) / n, y + 0.5, az + ((bz - az) * k) / n, 0, 0.05, 1.0, 0.05), IRON);
  }
}
/** Ridge roll, eave fascia and verge boards for gableRoof(). */
function gableCaps(rb, x0, x1, z0, z1, yE, h, axis, o, roofCol, ends = true) {
  const rc = new THREE.Color(roofCol).multiplyScalar(0.72), yR = yE + h, ROLL = { roll: Math.PI / 4 };
  if (axis === 'x') {
    const zm = (z0 + z1) / 2, A = x0 - o - 0.08, B = x1 + o + 0.08, dz = (z1 - z0) / 2 + o, ye = yE - (o * h) / ((z1 - z0) / 2);
    rb.beam([A, yR + 0.04, zm], [B, yR + 0.04, zm], 0.36, 0.36, rc, null, ROLL);
    for (const sg of [-1, 1]) rb.beam([A, ye - 0.14, zm + sg * dz], [B, ye - 0.14, zm + sg * dz], 0.14, 0.3, FASCIA);
    if (ends) for (const X of [A, B]) for (const sg of [-1, 1]) rb.beam([X, ye - 0.1, zm + sg * (dz + 0.05)], [X, yR + 0.1, zm], 0.18, 0.34, rc);
  } else {
    const xm = (x0 + x1) / 2, A = z0 - o - 0.08, B = z1 + o + 0.08, dx = (x1 - x0) / 2 + o, ye = yE - (o * h) / ((x1 - x0) / 2);
    rb.beam([xm, yR + 0.04, A], [xm, yR + 0.04, B], 0.36, 0.36, rc, null, ROLL);
    for (const sg of [-1, 1]) rb.beam([xm + sg * dx, ye - 0.14, A], [xm + sg * dx, ye - 0.14, B], 0.14, 0.3, FASCIA);
    if (ends) for (const Z of [A, B]) for (const sg of [-1, 1]) rb.beam([xm + sg * (dx + 0.05), ye - 0.1, Z], [xm, yR + 0.1, Z], 0.18, 0.34, rc);
  }
}
/** Ridge + hip rolls and the fascia ring for hipRoof(). */
function hipCaps(rb, x0, x1, z0, z1, yE, h, o, roofCol) {
  const rc = new THREE.Color(roofCol).multiplyScalar(0.72), ROLL = { roll: Math.PI / 4 };
  const X0 = x0 - o, X1 = x1 + o, Z0 = z0 - o, Z1 = z1 + o, w = X1 - X0, d = Z1 - Z0, yR = yE + h + 0.04;
  let ra, rbb;
  if (w >= d) { const zm = (Z0 + Z1) / 2; ra = [X0 + d / 2, yR, zm]; rbb = [X1 - d / 2, yR, zm]; } else { const xm = (X0 + X1) / 2; ra = [xm, yR, Z0 + w / 2]; rbb = [xm, yR, Z1 - w / 2]; }
  if (Math.hypot(rbb[0] - ra[0], rbb[2] - ra[2]) > 0.2) rb.beam(ra, rbb, 0.36, 0.36, rc, null, ROLL);
  const cs = [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]];
  for (const [cx, cz] of cs) {
    const tgt = w >= d ? (cx === X0 ? ra : rbb) : (cz === Z0 ? ra : rbb);
    rb.beam([cx, yE + 0.04, cz], tgt, 0.32, 0.32, rc, null, ROLL);
  }
  for (let i = 0; i < 4; i++) { const [ax, az] = cs[i], [bx, bz] = cs[(i + 1) % 4]; rb.beam([ax, yE - 0.14, az], [bx, yE - 0.14, bz], 0.14, 0.3, FASCIA); }
}
/** Corner rolls, kerb ring and top hips for mansardRoof(). */
function mansardCaps(rb, x0, x1, z0, z1, yE, h1, inset, h2, o, roofCol) {
  const rc = new THREE.Color(roofCol).multiplyScalar(0.72), ROLL = { roll: Math.PI / 4 };
  const X0 = x0 - o, X1 = x1 + o, Z0 = z0 - o, Z1 = z1 + o, y1 = yE + h1;
  const lo = [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]];
  const hi = [[x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x1 - inset, z1 - inset], [x0 + inset, z1 - inset]];
  for (let i = 0; i < 4; i++) {
    rb.beam([lo[i][0], yE, lo[i][1]], [hi[i][0], y1, hi[i][1]], 0.3, 0.3, rc, null, ROLL);
    const j = (i + 1) % 4;
    rb.beam([hi[i][0], y1, hi[i][1]], [hi[j][0], y1, hi[j][1]], 0.22, 0.28, rc);
    rb.beam([lo[i][0], yE - 0.14, lo[i][1]], [lo[j][0], yE - 0.14, lo[j][1]], 0.14, 0.3, FASCIA);
  }
  hipCaps(rb, x0 + inset, x1 - inset, z0 + inset, z1 - inset, y1, h2, 0, roofCol);
}
/** Low hipped roof with a wide kicked-out eave and a soffit (cellar tower, 1911 elevation + postcards). */
function flaredHip(rb, x0, x1, z0, z1, yE, h, o, col) {
  const k = 0.35, yK = yE + (o - k) * 0.3;
  const lo = [[x0 - o, z1 + o], [x1 + o, z1 + o], [x1 + o, z0 - o], [x0 - o, z0 - o]];
  const hi = [[x0 - k, z1 + k], [x1 + k, z1 + k], [x1 + k, z0 - k], [x0 - k, z0 - k]];
  const wl = [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    rb.poly([[lo[i][0], yE, lo[i][1]], [lo[j][0], yE, lo[j][1]], [hi[j][0], yK, hi[j][1]], [hi[i][0], yK, hi[i][1]]], col, null, 'world');
    rb.poly([[wl[i][0], yE - 0.03, wl[i][1]], [wl[j][0], yE - 0.03, wl[j][1]], [lo[j][0], yE - 0.03, lo[j][1]], [lo[i][0], yE - 0.03, lo[i][1]]], 0x6b625a, null, 'world'); // soffit
    rb.beam([lo[i][0], yE - 0.1, lo[i][1]], [lo[j][0], yE - 0.1, lo[j][1]], 0.14, 0.24, FASCIA);
  }
  hipRoof(rb, x0, x1, z0, z1, yK, h - (yK - yE), k, col);
  hipCaps(rb, x0, x1, z0, z1, yK, h - (yK - yE), k, col);
}
/** A row of dormers on one roof slope of the footprint fp. yW = roof height at the wall line, slope = rise per metre inward.
 *  xs = positions along the face measured from its start (s face: from x0, e: from z1, n: from x1, w: from z0). */
function dormerRow(wb, rb, fp, side, yW, slope, xs, { w = 1.6, hw = 1.5, d0 = 1.2, tile = 'dormerWin', wallCol = T_MALT, roofCol = SLATE } = {}) {
  const fr = { s: [fp.x0, fp.z1, 0], e: [fp.x1, fp.z1, Math.PI / 2], n: [fp.x1, fp.z0, Math.PI], w: [fp.x0, fp.z0, -Math.PI / 2] }[side];
  wb.at(fr[0], fr[1], fr[2]); rb.at(fr[0], fr[1], fr[2]);
  const yb = yW + d0 * slope - 0.08, depth = (hw + w * 0.45 + 0.35) / slope;
  for (const x of xs) dormer(wb, rb, x, -d0, w, yb, hw, depth, wallCol, roofCol, tile);
  wb.reset(); rb.reset();
}
/** Square / polygonal spire from a profile [[y, cornerRadius], ...] (last radius 0 = apex). */
function spire(rb, cx, cz, prof, sides, color, rot = 0) {
  const P = (a, r, y) => [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r];
  for (let i = 0; i < prof.length - 1; i++) {
    const [ya, ra] = prof[i], [yb, rb2] = prof[i + 1];
    for (let k = 0; k < sides; k++) {
      const a0 = rot + (k / sides) * Math.PI * 2, a1 = rot + ((k + 1) / sides) * Math.PI * 2;
      if (rb2 < 1e-3) rb.poly([P(a0, ra, ya), P(a1, ra, ya), [cx, yb, cz]], color, null, 'world', 2);
      else rb.poly([P(a0, ra, ya), P(a1, ra, ya), P(a1, rb2, yb), P(a0, rb2, yb)], color, null, 'world', 2);
    }
  }
}
/** Round-headed (segmental) parapet gable facing +X ('e') or -X ('w'), centred at (x, zc), base y0. */
function archGable(wb, face, x, zc, y0, w, h, color, win = 2.6) {
  const s = new THREE.Shape(), hw = w / 2, h0 = 0.5, N = 12;
  s.moveTo(-hw, 0); s.lineTo(-hw, h0);
  for (let k = 1; k < N; k++) { const t = (k / N) * Math.PI; s.lineTo(-hw * Math.cos(t), h0 + (h - h0) * Math.sin(t)); }
  s.lineTo(hw, h0); s.lineTo(hw, 0); s.closePath();
  const geo = new THREE.ShapeGeometry(s, 1);
  geo.computeBoundingBox();
  const bb = geo.boundingBox, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (uv.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  const ry = face === 'e' ? Math.PI / 2 : -Math.PI / 2, sg = face === 'e' ? 1 : -1;
  wb.add(geo, M4(x, y0, zc, ry), color, 'plain');
  wb.add(geo, M4(x - sg * 0.3, y0, zc, ry + Math.PI), color, 'plain');
  if (win > 0) { // round lunette window, square quad so it stays round
    const xw = x + sg * 0.02, yc = y0 + h0 + (h - h0) * 0.42, r = win / 2;
    wb.quad([xw, yc - r, zc + sg * r], [xw, yc - r, zc - sg * r], [xw, yc + r, zc - sg * r], [xw, yc + r, zc + sg * r], color, 'winRound');
  }
  // coping along the arch
  for (let k = 0; k < N; k++) {
    const t0 = (k / N) * Math.PI, t1 = ((k + 1) / N) * Math.PI;
    const p = (t) => [x - sg * 0.15, y0 + h0 + (h - h0) * Math.sin(t) + 0.08, zc - sg * -hw * Math.cos(t)];
    wb.beam(p(t0), p(t1), 0.5, 0.18, STONE, 'stone', { ends: false });
  }
  geo.dispose();
}
/** Columnar poplar (photo 11). */
function poplar(pb, x, z, R) {
  const h = 2 + R(), s = 0.9 + R() * 0.3;
  pb.add(cylG, M4(x, h / 2, z, 0, 0.2, h, 0.2), 0x5a4636);
  const c = new THREE.Color([0x5a7536, 0x63803f, 0x546d33][Math.floor(R() * 3)]);
  pb.add(blobG, M4(x, h + 4.2 * s, z, R() * 3, 1.5 * s, 5.4 * s, 1.5 * s), c);
  pb.add(blobG, M4(x + 0.3, h + 7.2 * s, z - 0.2, R() * 3, 1.0 * s, 3.0 * s, 1.0 * s), c.clone().offsetHSL(0, 0, 0.03));
}
function shrub(pb, x, z, R) {
  const s = 0.8 + R() * 0.5;
  pb.add(blobG, M4(x, 0.7 * s, z, R() * 3, 1.3 * s, 0.9 * s, 1.2 * s), [0x5d7838, 0x6a8442, 0x52692f][Math.floor(R() * 3)]);
}
const blobG = new THREE.IcosahedronGeometry(1, 0);
function heap(pb, x, z, r, h, color) {
  pb.add(heapG, M4(x, 0, z, x * 0.37, r, h, r * 0.85), color);
}
const heapG = (() => { const g = new THREE.ConeGeometry(1, 1, 9, 2); g.translate(0, 0.5, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y > 0.2 && y < 0.8) { p.setX(i, p.getX(i) * 1.25); p.setZ(i, p.getZ(i) * 1.25); } } g.computeVertexNormals(); return g; })();

// ---------------------------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------------------------
/** Brewhouse row between the tracks (plan: VARNA · SILO · CHLADIČ · STROJOVNA · KOTELNA; sections 1912). */
function brewhouse(wb, rb, pb, GR, HR) {
  // --- Varna: five storeys under a flat roof behind a parapet with urns (1911 elevation ≈ 16 m)
  const { x0, x1, z0, z1 } = VAR, T = TWR;
  const ys = [0, 1.2, 4.8, 8.0, 11.2, 14.4, 15.8];
  wb.block(x0, x1, z0, z1, ys, { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'rusticArch' : j === 5 ? 'corniceHeavy' : j === 4 ? 'winArch' : 'winPair') }, T_BREW, 3.8);
  bands(wb, x0, x1, z0, z1, [4.8], T_BREW, 0.22, 0.4);
  pilasters(wb, x0, x1, z0, z1, 1.2, 15.8, T_BREW, 1.0, 0.25);
  deck(wb, x0, x1, z0, z1, 15.8);
  ring(wb, x0, x1, z0, z1, 15.8, 16.7, 0.1, 0.3, 'stone', T_BREW);
  ring(wb, x0, x1, z0, z1, 16.7, 16.9, 0.2, 0.5, 'stone', STONE);
  for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 3.2);
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      if (x < T.x1 + 0.4 && z > T.z0 - 0.4) continue; // inside the clock tower
      pb.add(cylG, M4(x, 17.15, z, 0, 0.22, 0.5, 0.22), 0xd2c8b4);
      pb.add(ballG, M4(x, 17.55, z, 0, 0.26, 0.24, 0.26), 0xd2c8b4);
    }
  }
  // timber-louvred coolship room on the roof — the dark band right of the tower in the photos
  const C = { x0: -152.6, x1: -141.6, z0: 895.6, z1: 914.4 };
  wb.block(C.x0, C.x1, C.z0, C.z1, [15.8, 19.6], { all: 'slats' }, 0xbab2a8, 2.6);
  HR(C.x0, C.x1, C.z0, C.z1, 19.6, 1.6, 0.45, SLATE2);
  // vapour stacks of the two brew kettles (section 1912): iron pipes through the roof, conical hats
  for (const [x, z] of STACKS) {
    pb.add(cylG, M4(x, 21, z, 0, 0.42, 9.6, 0.42), 0x3a3733);
    pb.add(cylG, M4(x, 21.3, z, 0, 0.6, 0.45, 0.6), 0x2e2b28);
    pb.add(coneG, M4(x, 26.1, z, 0, 0.95, 0.65, 0.95), 0x2e2b28);
    for (const k of [0, 1, 2]) { const ang = (k / 3) * Math.PI * 2; pb.add(boxG, M4(x + Math.sin(ang) * 0.5, 25.6, z + Math.cos(ang) * 0.5, ang, 0.06, 0.55, 0.06), 0x2e2b28); }
  }
  // --- clock tower at the SW corner: body to 24.6 m, clock at 21.6 m, bell-cast roof, lantern, spire (≈ 34 m)
  const tcx = (T.x0 + T.x1) / 2, tcz = (T.z0 + T.z1) / 2;
  wb.block(T.x0, T.x1, T.z0, T.z1, [0, 1.2, 4.8, 8.0, 11.2, 14.4, 16.9, 19.5, 23.7, 24.6],
    { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'rusticArch' : j === 6 ? 'arcadeWin' : j === 7 ? 'plain' : j === 8 ? 'corniceHeavy' : j === 5 ? 'winArch' : 'winPair') }, T_BREW, 3.7);
  bands(wb, T.x0, T.x1, T.z0, T.z1, [4.8, 16.9], T_BREW, 0.22, 0.38);
  pilasters(wb, T.x0, T.x1, T.z0, T.z1, 1.2, 24.6, T_BREW, 0.9, 0.24);
  wb.box(T.x0 - 0.45, T.x1 + 0.45, 24.6, 25.1, T.z0 - 0.45, T.z1 + 0.45, 'stone', STONE, { bottom: true });
  const CD = 1.5, CY = 21.6; // clock dials on all four faces (square quads so the dial stays round)
  wb.quad([T.x1 + 0.1, CY - CD, tcz + CD], [T.x1 + 0.1, CY - CD, tcz - CD], [T.x1 + 0.1, CY + CD, tcz - CD], [T.x1 + 0.1, CY + CD, tcz + CD], T_BREW, 'clockFace');
  wb.quad([T.x0 - 0.1, CY - CD, tcz - CD], [T.x0 - 0.1, CY - CD, tcz + CD], [T.x0 - 0.1, CY + CD, tcz + CD], [T.x0 - 0.1, CY + CD, tcz - CD], T_BREW, 'clockFace');
  wb.quad([tcx - CD, CY - CD, T.z1 + 0.1], [tcx + CD, CY - CD, T.z1 + 0.1], [tcx + CD, CY + CD, T.z1 + 0.1], [tcx - CD, CY + CD, T.z1 + 0.1], T_BREW, 'clockFace');
  wb.quad([tcx + CD, CY - CD, T.z0 - 0.1], [tcx - CD, CY - CD, T.z0 - 0.1], [tcx - CD, CY + CD, T.z0 - 0.1], [tcx + CD, CY + CD, T.z0 - 0.1], T_BREW, 'clockFace');
  // corner bartizans with pointed caps (elevation 1911)
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = tcx + dx * 3.55, pz = tcz + dz * 3.75;
    wb.cyl(px, pz, 25.1, 26.5, 0.46, 0.42, 6, 1, 'louver', T_BREW, { smooth: false });
    rb.cone(px, pz, 26.5, 1.7, 0.6, 6, SLATE2, null, 0, 'world', 2);
    pb.add(ballG, M4(px, 28.3, pz, 0, 0.11, 0.11, 0.11), 0xc9a64e);
  }
  // bell-cast square roof: flared kick, steep body; small clock-dormers on its faces
  spire(rb, tcx, tcz, [[25.1, 5.75], [25.6, 5.1], [27.4, 3.3], [28.8, 1.7]], 4, SLATE2, Math.PI / 4);
  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const dx = tcx + nx * 3.5, dz = tcz + nz * 3.6;
    wb.at(dx, dz, Math.atan2(nx, nz)); rb.at(dx, dz, Math.atan2(nx, nz));
    dormer(wb, rb, 0, 0, 1.3, 25.5, 1.3, 1.8, T_BREW, SLATE2, 'winRound');
    wb.reset(); rb.reset();
  }
  wb.cyl(tcx, tcz, 28.8, 30.4, 0.85, 0.8, 8, 1, 'louver', T_BREW, { smooth: false });
  wb.cyl(tcx, tcz, 30.4, 30.65, 1.0, 1.0, 8, 1, 'stone', STONE, { smooth: false });
  spire(rb, tcx, tcz, [[30.65, 1.02], [31.3, 0.62], [33.8, 0.0]], 8, SLATE2, 0);
  pb.add(ballG, M4(tcx, 34.05, tcz, 0, 0.24, 0.24, 0.24), 0xc9a64e);
  pb.add(boxG, M4(tcx, 35.0, tcz, 0, 0.07, 1.9, 0.07), IRON);
  pb.add(boxG, M4(tcx, 35.2, tcz, Math.PI / 4, 0.8, 0.05, 0.05), IRON);

  // --- silo: plain tall block, small windows only under the eaves (wagon photo)
  wb.block(-141, -134, 892, 915, [0, 1.2, 15.0, 17.6, 18.8], { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'plain' : j === 2 ? 'winSmall' : 'corniceHeavy') }, CREAM2, 3.8);
  HR(-141, -134, 892, 915, 18.8, 1.8, 0.35, SLATE);
  // --- pre-heaters / cooler tower: four storeys, flat roof with a railing (section: XIII–XXII)
  wb.block(-134, -126, 892, 915, [0, 1.2, 4.6, 8.0, 11.4, 14.2, 15.0], { all: (i, j) => (j === 0 ? 'plinth' : j === 5 ? 'corniceHeavy' : 'win') }, T_MACH, 3.8);
  deck(wb, -134, -126, 892, 915, 15.0);
  railing(pb, -133.8, -126.2, 892.2, 914.8, 15.0);
  // --- machine room: tall arched windows, gabled roof with pedimented dormers, east gable with the round window
  wb.block(-126, -103, 892, 915, [0, 1.2, 8.8, 10.2], { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'winTall' : 'corniceHeavy') }, T_MACH, 3.8);
  pilasters(wb, -126, -103, 892, 915, 0, 10.2, T_MACH, 0.8, 0.18);
  GR(-126, -103, 892, 915, 10.2, 5.0, 'x', 0.4, SLATE3, T_MACH, 'plain');
  for (const [x, sg] of [[-102.92, 1], [-126.08, -1]]) { // round medallion window in both gables (wagon photo)
    const yc = 12.4, r = 1.25;
    wb.quad([x, yc - r, 903.5 + sg * r], [x, yc - r, 903.5 - sg * r], [x, yc + r, 903.5 - sg * r], [x, yc + r, 903.5 + sg * r], T_MACH, 'winRound');
  }
  for (const x of [-121.5, -117, -112.5, -108]) dormer(wb, rb, x, 915.0, 2.2, 10.4, 1.8, 2.6, T_MACH, SLATE3, 'winArch');
  // --- boiler house: tall hall, roof ridge north–south with a ventilating lantern
  wb.block(-103, -86, 891, 915, [0, 1.0, 9.6, 11.2], { all: (i, j) => (j === 1 ? 'winTall' : j === 0 ? 'plinth' : 'corniceHeavy') }, T_BOIL, 4);
  pilasters(wb, -103, -86, 891, 915, 0, 11.2, T_BOIL, 0.8, 0.18);
  GR(-103, -86, 891, 915, 11.2, 4.0, 'z', 0.4, SLATE, T_BOIL, 'winRound');
  wb.block(-96, -93, 895, 911, [14.4, 16.2], { all: 'slats' }, 0xcfc6ba, 3);
  GR(-96, -93, 895, 911, 16.2, 0.9, 'z', 0.35, SLATE, null, 'plain', { noWalls: true });
}

/** Chimney: octagonal pedestal, round tapered brick shaft, corbelled crown — 48 m (elevation 1911). */
function chimneyStack(wb, pb) {
  const [x, z] = CH, O = { rot: Math.PI / 8, smooth: false };
  wb.cyl(x, z, 0, 1.4, 3.65, 3.65, 8, 1, 'plinth', 0xffffff, { ...O, cap: false });
  wb.cyl(x, z, 1.4, 6.6, 3.4, 3.3, 8, 2, 'brickDark', 0xffffff, { ...O, cap: false });
  wb.cyl(x, z, 6.6, 7.4, 3.7, 3.7, 8, 1, 'stone', 0xd6ccbc, { ...O, cap: true });
  wb.cyl(x, z, 6.0, 6.6, 3.5, 3.5, 8, 1, 'stone', 0xd6ccbc, { ...O, cap: false });
  const yS = 7.4, yT = CH_H - 2.4, r0 = 2.3, r1 = 1.62;
  const shaftR = (y) => r0 + (r1 - r0) * ((y - yS) / (yT - yS));
  wb.cyl(x, z, yS, yT, r0, r1, 18, 22, 'brickGrey', 0xf2ece4, { cap: false });
  wb.cyl(x, z, yT, yT + 1.0, r1, 1.95, 18, 1, 'brickDark', 0xffffff, { cap: false });   // corbel flare
  wb.cyl(x, z, yT + 1.0, yT + 1.9, 1.95, 1.95, 18, 1, 'brickDark', 0xe8ddd0, { cap: false });
  wb.cyl(x, z, yT + 1.9, yT + 2.3, 2.05, 2.05, 18, 1, 'stone', 0xb8afa2, { cap: false });
  wb.cyl(x, z, yT + 2.3, CH_H + 0.1, 1.85, 1.75, 18, 1, 'dark', 0xffffff, { cap: true });
  for (let y = 12; y < yT - 1; y += 6) { const r = shaftR(y) + 0.05; wb.cyl(x, z, y, y + 0.3, r, r, 18, 1, 'dark', 0xffffff, { cap: false }); }
  pb.add(boxG, M4(x, CH_H + 1.6, z + 1.4, 0, 0.06, 3.2, 0.06), IRON); // lightning rod
}

/** Malt house: five low malting floors under a hipped roof with the kiln turret; lower wing to the south-east. */
function sladovna(wb, rb, pb, GR, HR) {
  const A = { x0: -148, x1: -106, z0: 829, z1: 855 };
  const ys = [0, 1.2, 4.8, 8.4, 12.0, 15.6, 19.0];
  wb.block(A.x0, A.x1, A.z0, A.z1, ys, { all: (i, j) => (j === 0 ? 'plinthWin' : 'malt') }, T_MALT, 4);
  wb.box(A.x0 - 0.45, A.x1 + 0.45, 18.7, 19.4, A.z0 - 0.45, A.z1 + 0.45, 'corniceHeavy', T_MALT);
  bands(wb, A.x0, A.x1, A.z0, A.z1, [4.8], T_MALT);
  pilasters(wb, A.x0, A.x1, A.z0, A.z1, 0, 18.7, T_MALT);
  HR(A.x0, A.x1, A.z0, A.z1, 19.4, 8.0, 0.6, SLATE2);
  const sl = 8.0 / (13 + 0.6), yW = 19.4 + 0.6 * sl;
  for (const side of ['s', 'n']) dormerRow(wb, rb, A, side, yW, sl, [7, 15, 23, 31], { wallCol: T_MALT, roofCol: SLATE2, w: 1.5, hw: 1.0, d0: 1.6 });
  dormerRow(wb, rb, A, 'e', yW, sl, [13], { wallCol: T_MALT, roofCol: SLATE2, w: 1.5, hw: 1.0, d0: 1.6 });
  for (const x of [-131, -116]) chimney(wb, x, 842, 24.5, 3.2);
  kilnTurret(wb, rb, pb, -140, 842);
  // lower wing (4 storeys) — the part in front of the hipped block in the photo with the people
  const wing = (x0, x1, z0, z1) => {
    wb.block(x0, x1, z0, z1, [0, 1.2, 4.8, 8.4, 12.0, 15.2], { all: (i, j) => (j === 0 ? 'plinthWin' : 'malt') }, T_MALT2, 4);
    wb.box(x0 - 0.4, x1 + 0.4, 14.9, 15.5, z0 - 0.4, z1 + 0.4, 'corniceHeavy', T_MALT2);
  };
  wing(-106, -94, 829, 866); wing(-133, -106, 855, 866);
  HR(-106, -94, 829, 866, 15.5, 2.6, 0.45, SLATE2);
  HR(-133, -106, 855, 866, 15.5, 2.2, 0.45, SLATE2);
}
/** Kiln turret on the malt house (postcards): plastered drum, louvred neck, wide flat hat, small top + spike. */
function kilnTurret(wb, rb, pb, x, z) {
  wb.cyl(x, z, 22.0, 31.0, 1.55, 1.45, 12, 3, 'plain', T_MALT, { cap: false });
  wb.cyl(x, z, 29.0, 29.4, 1.6, 1.6, 12, 1, 'stone', STONE, { cap: false });
  wb.cyl(x, z, 31.0, 31.9, 1.25, 1.25, 12, 1, 'louver', T_MALT, { cap: false });
  wb.cyl(x, z, 31.75, 31.95, 2.75, 2.75, 12, 1, 'dark', 0x8a8278, { cap: false });
  rb.cone(x, z, 31.95, 0.85, 2.75, 12, SLATE, null, 0, 'world', 2);
  wb.cyl(x, z, 32.5, 33.4, 0.5, 0.45, 8, 1, 'plain', T_MALT, { smooth: false });
  rb.cone(x, z, 33.4, 0.7, 0.75, 8, SLATE, null, 0, 'world', 2);
  pb.add(boxG, M4(x, 34.8, z, 0, 0.06, 1.6, 0.06), IRON);
}

/** Coachmen's flats + garage in the NE corner: the big gable to the road with one attic window (photos). */
function coachmensHouse(wb, rb, GR, HR) {
  const C = T_HOUSE;
  wb.block(-23, -8, 797, 810, [0, 0.9, 4.4, 7.9], { all: (i, j) => (j === 0 ? 'plinthWin' : 'win') }, C, 3.4);
  bands(wb, -23, -8, 797, 810, [0.95, 4.4], C, 0.14, 0.26);
  GR(-23, -8, 797, 810, 7.9, 7.4, 'x', 0.45, SLATE, C, 'plain');
  wb.box(-8.4, -7.9, 7.6, 8.2, 796.6, 810.4, 'corniceHeavy', C, { top: false });
  for (const [zc, y0, hh, tl] of [[803.5, 10.0, 2.8, 'winPair'], [803.5, 13.6, 1.5, 'winSmall']]) {
    const hw = tl === 'winPair' ? 1.8 : 0.8;
    wb.quad([-7.88, y0, zc + hw], [-7.88, y0, zc - hw], [-7.88, y0 + hh, zc - hw], [-7.88, y0 + hh, zc + hw], C, tl);
  }
  dormerRow(wb, rb, { x0: -23, x1: -8, z0: 797, z1: 810 }, 's', 7.9 + 0.45 * (7.4 / 6.5), 7.4 / 6.95, [5, 10], { wallCol: C, roofCol: SLATE });
  chimney(wb, -14, 803.5, 13, 4.6);
  // garage wing with a hipped roof
  wb.block(-48, -23, 798, 809, [0, 0.8, 4.4, 6.2], { all: (i, j) => (j === 0 ? 'plinth' : 'win'), s: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'gate' : 'win') }, CREAM2, 3.6);
  HR(-48, -23, 798, 809, 6.2, 3.8, 0.4, SLATE);
  for (const side of ['s', 'n']) dormerRow(wb, rb, { x0: -48, x1: -23, z0: 798, z1: 809 }, side, 6.2 + 0.4 * (3.8 / 5.9), 3.8 / 5.9, [6, 12.5, 19], { wallCol: CREAM2, roofCol: SLATE, w: 1.3, hw: 1.1, d0: 0.9 });
  chimney(wb, -35, 803.5, 9, 2.4);
}

/** Kantina by the east fence: low hall with arched gables + the octagonal turret with a statue (wagon photo). */
function kantina(wb, rb, pb) {
  const C = T_KANT;
  wb.block(-24, -10, 886, 908, [0, 0.9, 4.8, 5.4], { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'arcadeWin' : 'corniceHeavy') }, C, 3.7);
  mansardRoof(rb, -24, -10, 886, 908, 5.4, 2.0, 1.1, 1.3, 0.35, SLATE2);
  mansardCaps(rb, -24, -10, 886, 908, 5.4, 2.0, 1.1, 1.3, 0.35, SLATE2);
  for (const [z0, z1] of [[880, 886.4], [907.6, 914]]) {
    wb.block(-25, -8.6, z0, z1, [0, 0.9, 4.8, 5.4], { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'villaWin' : 'corniceHeavy') }, C, 3.2);
    gableRoof(rb, null, -25, -8.6, z0, z1, 5.4, 3.0, 'x', 0.3, SLATE2, C, 'plain', { ends: false });
    gableCaps(rb, -25, -8.6, z0, z1, 5.4, 3.0, 'x', 0.3, SLATE2, false);
    archGable(wb, 'e', -8.25, (z0 + z1) / 2, 5.4, z1 - z0 + 0.5, 3.5, C, 2.2);
    archGable(wb, 'w', -25.35, (z0 + z1) / 2, 5.4, z1 - z0 + 0.5, 3.5, C, 2.2);
  }
  const tx = -17, tz = 897, O = { rot: Math.PI / 8, smooth: false };
  wb.cyl(tx, tz, 7.0, 10.6, 1.95, 1.9, 8, 1, 'arcadeWin', C, { ...O, cap: false });
  wb.cyl(tx, tz, 10.6, 11.0, 2.25, 2.25, 8, 1, 'stone', STONE, O);
  spire(rb, tx, tz, [[11.0, 2.45], [11.6, 2.05], [12.8, 1.3], [13.8, 0.5]], 8, SLATE2, Math.PI / 8);
  wb.cyl(tx, tz, 13.8, 14.6, 0.5, 0.45, 8, 1, 'louver', C, O);
  spire(rb, tx, tz, [[14.6, 0.62], [15.0, 0.0]], 8, SLATE2, 0);
  // the little bronze figure on top
  const BR = 0x4d4436;
  pb.add(cylG, M4(tx, 15.55, tz, 0, 0.24, 1.1, 0.2), BR);
  pb.add(ballG, M4(tx, 16.3, tz, 0, 0.18, 0.2, 0.18), BR);
  pb.add(boxG, M4(tx + 0.28, 16.25, tz, 0, 0.1, 0.8, 0.1, 0, -0.35), BR);
}

/** Lager cellars: plain block, two cellar storeys + the hall under a low roof with a ridge lantern (1912 sections). */
function cellars(wb, rb, pb, GR, HR) {
  const K = { x0: -203, x1: -166, z0: 941, z1: 989 }, C = T_CELLAR;
  const ys = [0, 1.2, 7.6, 13.6, 15.0];
  const t = (i, j) => (j === 0 ? 'plinthWin' : j === 3 ? 'corniceHeavy' : 'malt');
  wb.block(K.x0, K.x1, K.z0, K.z1, ys, { all: t }, C, 4.6);
  bands(wb, K.x0, K.x1, K.z0, K.z1, [7.6], C);
  GR(K.x0, K.x1, K.z0, K.z1, 15.0, 4.2, 'z', 0.5, SLATE, C, 'plain');
  wb.block(-187, -182, 945, 985, [18.4, 20.2], { all: 'louver' }, C, 3);
  GR(-187, -182, 945, 985, 20.2, 1.1, 'z', 0.3, SLATE2, C, 'plain');
  // strip south of the tower (plan: the fifth cellar)
  wb.block(-166, -156, 960, 989, ys, { all: t, w: null }, C, 4.6);
  HR(-166, -156, 960, 989, 15.0, 2.4, 0.4, SLATE);
  for (const [x, z] of [[-198, 952], [-198, 978], [-171, 952], [-171, 978]]) chimney(wb, x, z, 15.4, 2.6); // vent stacks
}

/** Cellar tower (věž sklepů): seven levels, an Art Nouveau top storey with triple windows, a low hipped
 *  roof with a wide kicked eave and gabled dormers, a stair tower on the north side (elevation 1911). */
function cellarTower(wb, rb, pb) {
  const { x0, x1, z0, z1 } = CT, C = T_TOWER;
  const ys = [0, 1.2, 5.4, 9.4, 13.2, 17.0, 21.0, 21.6];
  const t = (i, j) => (j === 0 ? 'plinthWin' : j === 1 ? 'rustic' : j === 6 ? 'corniceHeavy' : j === 2 ? 'winTall' : j === 5 ? 'win' : 'winArch');
  wb.block(x0, x1, z0, z1, ys, { all: t }, C, 6);
  wb.block(x0, x1, z0, z1, [21.6, 25.6], { all: 'winTriple' }, C, 6);
  bands(wb, x0, x1, z0, z1, [5.4, 13.2], C, 0.22, 0.4);
  pilasters(wb, x0, x1, z0, z1, 1.2, 25.6, C, 1.1, 0.25);
  // timber brackets under the deep eave
  for (const [ax, az, bx, bz, nx, nz] of [[x0, z1, x1, z1, 0, 1], [x1, z1, x1, z0, 1, 0], [x1, z0, x0, z0, 0, -1], [x0, z0, x0, z1, -1, 0]]) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 2);
    for (let k = 1; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      rb.beam([x, 24.6, z], [x + nx * 1.45, 25.5, z + nz * 1.45], 0.16, 0.2, 0x4a4038);
    }
  }
  flaredHip(rb, x0, x1, z0, z1, 25.6, 3.0, 1.6, SLATE3);
  for (const [fx, fz, rot, xs] of [[x1, z1, Math.PI / 2, [3, 9, 15]], [x0, z0, -Math.PI / 2, [3, 9, 15]], [x1, z0, Math.PI, [5]], [x0, z1, 0, [5]]]) {
    wb.at(fx, fz, rot); rb.at(fx, fz, rot);
    for (const lx of xs) dormer(wb, rb, lx, 1.75, 3.0, 25.45, 1.6, 4.2, C, SLATE3, 'dormerWin');
  }
  wb.reset(); rb.reset();
  for (const z of [946, 956]) { pb.add(cylG, M4(-161, 29.0, z, 0, 0.05, 1.4, 0.05), IRON); pb.add(ballG, M4(-161, 29.75, z, 0, 0.12, 0.12, 0.12), 0xc9a64e); }
  // stair tower: a vertical strip of landing windows, its own kicked hipped roof (≈ 25 m)
  const S = CTS;
  const sy = [0, 1.2, 3.8, 6.4, 9.0, 11.6, 14.2, 16.8, 19.4, 21.6, 22.2];
  wb.block(S.x0, S.x1, S.z0, S.z1, sy, { all: (i, j) => (j === 0 ? 'plinth' : j === 9 ? 'corniceHeavy' : 'winSmall'), s: null }, C, 4);
  flaredHip(rb, S.x0, S.x1, S.z0, S.z1, 22.2, 2.9, 1.0, SLATE3);
}

/** Bottling hall + fire station / barrel wash: one storey with three parallel roofs that end in round-headed
 *  gables over the east front (photo with the people, aerial postcard); the loading ramp ends the drive. */
function expedition(wb, rb, pb) {
  const X0 = -156, X1 = -98, Z0 = 938, Z1 = 977, C = T_EXP, H = 7.0;
  wb.block(X0, X1, Z0, Z1, [0, 1.2, 5.2, H], {
    all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'win' : 'winSmall'),
    e: (i, j) => (j === 0 ? 'plinth' : j === 1 ? (i % 2 === 0 ? 'loadDoor' : 'win') : 'winSmall'),
    n: (i, j) => (j === 0 ? 'plinth' : j === 1 ? (i % 3 === 1 ? 'loadDoor' : 'win') : 'winSmall'),
  }, C, 4.4);
  wb.box(X1 - 0.3, X1 + 0.3, H - 0.4, H + 0.15, Z0 - 0.3, Z1 + 0.3, 'corniceHeavy', C);
  pilasters(wb, X0, X1, Z0, Z1, 1.2, H, C, 0.8, 0.18);
  for (const [za, zb] of [[938, 951], [951, 964], [964, 977]]) {
    gableRoof(rb, null, X0, X1, za, zb, H, 3.4, 'x', 0.3, SLATE, C, 'plain', { ends: false });
    gableCaps(rb, X0, X1, za, zb, H, 3.4, 'x', 0.3, SLATE, false);
    archGable(wb, 'e', X1 + 0.38, (za + zb) / 2, H, zb - za + 0.4, 4.2, C, 3.0);
    wb.poly([[X0, H, za], [X0, H, zb], [X0, H + 3.4, (za + zb) / 2]], C, 'gable');
  }
  // loading ramp + canopy on iron posts
  wb.box(X1, X1 + 3.2, 0, 1.1, 939, 976, 'plinth', 0xd8d0c0);
  rb.poly([[X1 + 3.7, 4.5, 976.5], [X1 + 3.7, 4.5, 938.5], [X1 + 0.05, 5.15, 938.5], [X1 + 0.05, 5.15, 976.5]], SLATE, null, 'world');
  rb.beam([X1 + 3.72, 4.42, 938.5], [X1 + 3.72, 4.42, 976.5], 0.1, 0.22, FASCIA);
  for (let z = 940; z <= 975; z += 5.6) {
    pb.add(boxG, M4(X1 + 3.35, 2.8, z, 0, 0.14, 3.4, 0.14), 0x2c2a27);
    pb.add(boxG, M4(X1 + 1.7, 4.55, z, 0, 3.4, 0.12, 0.1, 0, 0.17), 0x2c2a27);
  }
  // hanging "SVĚTOVAR" sign facing the arriving truck (z ≈ 951) + the company name band over the doors
  const sz = 951, sy0 = 2.7, sy1 = 4.1, sw = 3.2, sx = X1 + 3.55;
  wb.quad([sx, sy0, sz + sw], [sx, sy0, sz - sw], [sx, sy1, sz - sw], [sx, sy1, sz + sw], 0xffffff, 'svetovar');
  wb.quad([sx - 0.1, sy0, sz - sw], [sx - 0.1, sy0, sz + sw], [sx - 0.1, sy1, sz + sw], [sx - 0.1, sy1, sz - sw], 0x777777, 'dark');
  for (const dz of [-sw + 0.3, sw - 0.3]) pb.add(boxG, M4(sx - 0.05, (sy1 + 4.5) / 2, sz + dz, 0, 0.05, 4.5 - sy1, 0.05), 0x2c2a27);
  wb.quad([X1 + 0.12, 5.35, 964], [X1 + 0.12, 5.35, 950], [X1 + 0.12, 6.55, 950], [X1 + 0.12, 6.55, 964], 0xffffff, 'cpp');
}

/** Administration building (1912 plan: angled along the diagonal street; photo with the people): two storeys
 *  on a raised ground floor, high red hipped roof, a volute-gable risalit, a side gable and a balcony. */
function adminBuilding(wb, rb, pb, ox, oz, rot) {
  const f = { x: ox, z: oz, rot }, C = VILLA, W = 20, D = 7;
  frame(f, 0, 0, 0, wb, rb, pb);
  const ys = [0, 1.0, 4.8, 8.6];
  const t = (i, j) => (j === 0 ? 'plinthWin' : j === 1 ? 'villaWin' : 'winOrn');
  wb.block(-W, W, -D, D, ys, { all: t }, C, 3.4);
  wb.box(-W - 0.35, W + 0.35, 8.3, 9.0, -D - 0.35, D + 0.35, 'corniceHeavy', C);
  bands(wb, -W, W, -D, D, [4.8], C, 0.16, 0.3);
  pilasters(wb, -W, W, -D, D, 1.0, 8.3, C, 0.9, 0.2);
  hipRoof(rb, -W, W, -D, D, 8.9, 6.2, 0.6, RED);
  hipCaps(rb, -W, W, -D, D, 8.9, 6.2, 0.6, RED);
  // volute-gable risalit with the entrance
  wb.block(2, 9, D, D + 1.2, ys, { s: (i, j) => (j === 0 ? 'plinth' : j === 1 ? (i === 1 ? 'door' : 'villaWin') : j === 2 ? 'winTriple' : t(i, j)), e: 'plain', w: 'plain', n: null }, C, 3.5);
  wb.box(1.8, 9.2, 8.3, 9.0, D, D + 1.5, 'corniceHeavy', C);
  addGable(wb, 5.5, 9.0, D + 1.35, 7.4, 5.8, 'volute', C, 'gable');
  gableRoof(rb, null, 2, 9, 1, D + 1.2, 9.0, 4.6, 'z', 0.05, RED, C, 'plain', { ends: false });
  gableCaps(rb, 2, 9, 1, D + 1.2, 9.0, 4.6, 'z', 0.05, RED, false);
  pb.add(ballG, M4(5.5, 15.1, D + 1.35, 0, 0.2, 0.2, 0.2), 0xc9a64e);
  // side gable (triangular) at the south-west end
  wb.block(12, 19, D, D + 0.8, ys, { s: t, e: 'plain', w: 'plain', n: null }, C, 3.5);
  addGable(wb, 15.5, 9.0, D + 0.95, 7.6, 5.0, 'triangle', C, 'gable');
  gableRoof(rb, null, 12, 19, 1, D + 0.8, 9.0, 4.6, 'z', 0.05, RED, C, 'plain', { ends: false });
  gableCaps(rb, 12, 19, 1, D + 0.8, 9.0, 4.6, 'z', 0.05, RED, false);
  // balcony on the north-east end
  wb.box(-19.2, -9.8, 4.6, 4.9, D, D + 1.4, 'stone', 0xd8d0c0);
  for (let x = -19; x <= -10; x += 0.55) pb.add(boxG, M4(x, 5.35, D + 1.3, 0, 0.06, 0.9, 0.06), 0x34312c);
  pb.add(boxG, M4(-14.5, 5.8, D + 1.3, 0, 9.4, 0.07, 0.07), 0x34312c);
  for (const [x, z] of [[-14, -2], [-4, 2], [8, -2], [16, 2]]) chimney(wb, x, z, 13.2, 4.4);
  wb.reset(); rb.reset(); pb.reset();
  // dormers: front slope (local +z) and back slope (frame turned by π)
  const sl = 6.2 / (D + 0.6), yW = 8.9 + 0.6 * sl, yb = yW + 1.3 * sl - 0.08, dep = (1.5 + 1.4 * 0.45 + 0.35) / sl;
  frame(f, 0, 0, 0, wb, rb);
  for (const x of [-15, -8.5, -2]) dormer(wb, rb, x, D - 1.3, 1.4, yb, 1.5, dep, C, RED, 'dormerWin');
  frame(f, 0, 0, Math.PI, wb, rb);
  for (const x of [-12, 0, 12]) dormer(wb, rb, x, D - 1.3, 1.4, yb, 1.5, dep, C, RED, 'dormerWin');
  wb.reset(); rb.reset();
}

function smallVilla(wb, rb, ox, oz, rot) {
  const f = { x: ox, z: oz, rot }, C = 0xe9dcc0, W = 11, D = 6;
  frame(f, 0, 0, 0, wb, rb);
  const ys = [0, 0.9, 4.6, 8.2];
  const t = (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'winShutter' : 'win');
  wb.block(-W, W, -D, D, ys, { all: t, s: (i, j) => (j === 1 && i === 3 ? 'door' : t(i, j)) }, C, 3.6);
  wb.box(-W - 0.3, W + 0.3, 7.8, 8.4, -D - 0.3, D + 0.3, 'corniceHeavy', C);
  pilasters(wb, -W, W, -D, D, 0.9, 7.8, C, 0.7, 0.15);
  hipRoof(rb, -W, W, -D, D, 8.3, 5.6, 0.6, RED2);
  hipCaps(rb, -W, W, -D, D, 8.3, 5.6, 0.6, RED2);
  addGable(wb, 6, 8.3, D + 0.25, 7, 5.6, 'triangle', C, 'gable');
  gableRoof(rb, null, 2.5, 9.5, 0, D + 0.25, 8.3, 5.2, 'z', 0.05, RED2, C, 'plain', { ends: false });
  gableCaps(rb, 2.5, 9.5, 0, D + 0.25, 8.3, 5.2, 'z', 0.05, RED2, false);
  chimney(wb, -4, -1, 11, 4.4); chimney(wb, 5, 1, 10.5, 4.4);
  wb.reset(); rb.reset();
}

// ---------------------------------------------------------------------------------------------
// Railway: the upper track (continues east to the level crossing on the field road) curves south near the
// west fence into the yard tracks; buffer stops in the yard at x ≈ -45 and at the west end.
function buildTrack(pb, RZ) {
  const BALLAST = 0x8b8273, SLEEPER = 0x4f3f31, RAIL = 0x45423e;
  const seg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(z1 - z0, x0 - x1); // along -X
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const nx = -(z1 - z0) / len, nz = (x1 - x0) / len; // perpendicular
    pb.add(boxG, M4(mx, 0.05, mz, yaw, len + 0.05, 0.1, 3.0), BALLAST);
    for (const g of [-0.72, 0.72]) pb.add(boxG, M4(mx + nx * g, 0.16, mz + nz * g, yaw, len + 0.02, 0.12, 0.08), RAIL); // rail top 0.22 = city.js RAIL_Y
  };
  const line = (pts) => {
    for (let i = 1; i < pts.length; i++) seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(z1 - z0, x0 - x1);
      for (let d = (0.75 - acc) % 0.75; d < len; d += 0.75) {
        const t = d / len;
        pb.add(boxG, M4(x0 + (x1 - x0) * t, 0.08, z0 + (z1 - z0) * t, yaw, 0.24, 0.1, 2.5), SLEEPER);
      }
      acc = (acc + len) % 0.75;
    }
  };
  const curve = (xa, za, xb, zb, n) => {
    const p = [];
    for (let k = 1; k <= n; k++) { const t = k / n, s = t * t * (3 - 2 * t); p.push([xa + (xb - xa) * t, za + (zb - za) * s]); }
    return p;
  };
  const XW = -276; // west buffer stop (inside the west fence)
  line([[-6, RZ], [-175, RZ], ...curve(-175, RZ, -262, L1Z, 16)]);
  line([[-44, L1Z], [XW, L1Z]]);
  line([[-46, L2Z], [-205, L2Z], ...curve(-205, L2Z, -240, L1Z, 8)]);
  bufferStop(pb, -44, L1Z, 1); bufferStop(pb, -46, L2Z, 1); bufferStop(pb, XW, L1Z, -1);
  // loading platform along the south side of the second yard track
  pb.add(boxG, M4(-90, 0.5, L2Z + 4.4, 0, 60, 1.0, 3.6), 0xa49a8a);
  pb.add(boxG, M4(-90, 1.02, L2Z + 2.66, 0, 60, 0.06, 0.14), 0xd8d0c0);
  // wagons: a long rake on the second track (wagon photo), a shorter one in front of the brewhouse
  const wagons = [];
  for (let i = 0; i < 7; i++) wagons.push({ x: -53 - i * 9.95, z: L2Z, flip: i === 3 });
  for (let i = 0; i < 5; i++) wagons.push({ x: -122 - i * 9.95, z: L1Z, flip: i === 2 });
  return wagons;
}
/** Buffer stop at the track end x; dir = +1: the wagons arrive from the west (stop faces -X), -1: from the east. */
function bufferStop(pb, x, z, dir) {
  pb.add(boxG, M4(x + dir * 0.4, 0.75, z, 0, 0.6, 1.5, 2.6), 0x5b4a3a);
  pb.add(boxG, M4(x - dir * 0.05, 1.05, z, 0, 0.1, 0.5, 2.0), 0xd8d0c0);
  pb.add(boxG, M4(x - dir * 0.08, 1.05, z, 0, 0.1, 0.5, 0.6), 0xa53a2e);
}

// ---------------------------------------------------------------------------------------------
// Fence: low masonry base, rendered posts with caps, diagonal-lattice panels (instanced).
// lines: [{ a:[x,z], b:[x,z], gaps:[[t0,t1]] (metres along the line) }]
function buildFence(wb, kit, lines) {
  const panels = [];
  const POST = 0.46, BASE = 0.55, PH = 1.75, SP = 3.3, PC = 0xd9d0bf;
  for (const L of lines) {
    const dx = L.b[0] - L.a[0], dz = L.b[1] - L.a[1], len = Math.hypot(dx, dz);
    const ux = dx / len, uz = dz / len, yaw = Math.atan2(-uz, ux);
    const gaps = (L.gaps || []).slice().sort((p, q) => p[0] - q[0]);
    const runs = []; let t = 0;
    for (const [g0, g1] of gaps) { if (g0 > t) runs.push([t, g0]); t = Math.max(t, g1); }
    if (t < len) runs.push([t, len]);
    for (const [r0, r1] of runs) {
      if (r1 - r0 < 0.8) continue;
      const n = Math.max(1, Math.round((r1 - r0) / SP));
      const step = (r1 - r0) / n;
      for (let k = 0; k <= n; k++) {
        const s = r0 + k * step, px = L.a[0] + ux * s, pz = L.a[1] + uz * s;
        wb.box(px - POST / 2, px + POST / 2, 0, BASE + PH + 0.25, pz - POST / 2, pz + POST / 2, 'stone', PC, { top: false });
        wb.box(px - 0.32, px + 0.32, BASE + PH + 0.25, BASE + PH + 0.38, pz - 0.32, pz + 0.32, 'stone', 0xcfc5b2);
        wb.cone(px, pz, BASE + PH + 0.38, 0.32, 0.4, 4, 0xc8bea9, 'stone', Math.PI / 4);
        if (k < n) {
          const s2 = s + step / 2, mx = L.a[0] + ux * s2, mz = L.a[1] + uz * s2;
          wb.add(boxG, M4(mx, BASE / 2, mz, yaw, step - POST, BASE, 0.4), 0xd2c9b8, 'plinth');
          panels.push({ x: mx, z: mz, yaw, w: step - POST });
        }
      }
    }
  }
  const geo = new THREE.PlaneGeometry(1, 1);
  const inst = new THREE.InstancedMesh(geo, kit.mats.lattice, panels.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  panels.forEach((pn, i) => {
    q.setFromAxisAngle(up, pn.yaw); p.set(pn.x, BASE + PH / 2, pn.z); s.set(pn.w, PH, 1);
    m.compose(p, q, s); inst.setMatrixAt(i, m);
  });
  inst.castShadow = true; inst.receiveShadow = true; inst.name = 'svetovar-fence-panels';
  inst.computeBoundingSphere();
  return { panels: inst };
}

// Main gate, built square to the road where it crosses the fence line so that the name board faces the
// arriving truck. Local frame: x = lateral (route right), +z = toward the arriving truck.
function gateway(wb, pb, route, gate) {
  const ST = 0xe6dccb;
  const f = route.frameAt(gate.s);
  const P = route.halfWidthAt(gate.s) + 2.8;
  const rot = Math.atan2(-f.tx, -f.tz);
  wb.at(f.x, f.z, rot); pb.at(f.x, f.z, rot);
  const pillar = (x) => {
    wb.box(x - 1.2, x + 1.2, 0, 0.7, -1.2, 1.2, 'plinth', 0xcfc6b5);
    wb.block(x - 0.95, x + 0.95, -0.95, 0.95, [0.7, 2.8, 4.9, 5.6], { all: (i, j) => (j === 2 ? 'cornice' : 'stone') }, ST, 1.9);
    wb.box(x - 1.25, x + 1.25, 5.6, 6.1, -1.25, 1.25, 'stone', 0xd8cebd);
    wb.cone(x, 0, 6.1, 0.9, 1.45, 4, 0xcfc5b2, 'stone', Math.PI / 4);
    pb.add(cylG, M4(x, 7.25, 0, 0, 0.08, 0.6, 0.08), 0x2a2927);
    pb.add(lanternG, M4(x, 7.85, 0), 0xf3e2b0);
    pb.add(lanternCapG, M4(x, 8.4, 0), 0x2a2927);
  };
  pillar(-P); pillar(P);
  // iron arch: two curved chords with a lattice between them, carrying the name board
  const yAt = (x, top) => 6.0 + top * (1 - (x / P) ** 2);
  const N = 18, GI = 0x2a2927;
  for (let i = 0; i < N; i++) {
    const xa = -P + (2 * P * i) / N, xb = -P + (2 * P * (i + 1)) / N;
    for (const [top, off] of [[3.8, 0], [3.2, -0.55]]) {
      const ya = yAt(xa, top) + off, yb = yAt(xb, top) + off;
      pb.add(boxG, M4((xa + xb) / 2, (ya + yb) / 2, 0, 0, Math.hypot(xb - xa, yb - ya) + 0.02, 0.12, 0.12, 0, Math.atan2(yb - ya, xb - xa)), GI);
    }
    const xc = (xa + xb) / 2, y1 = yAt(xc, 3.8), y0 = yAt(xc, 3.2) - 0.55;
    pb.add(boxG, M4(xc, (y0 + y1) / 2, 0, 0, 0.06, y1 - y0, 0.06, 0, i % 2 ? 0.5 : -0.5), GI);
  }
  // name board (text faces the arriving truck)
  const bw = 7.6, by0 = 8.0, by1 = 9.75;
  wb.quad([-bw, by0, 0.08], [bw, by0, 0.08], [bw, by1, 0.08], [-bw, by1, 0.08], 0xffffff, 'cpp');
  wb.quad([bw, by0, -0.08], [-bw, by0, -0.08], [-bw, by1, -0.08], [bw, by1, -0.08], 0x888888, 'dark');
  wb.box(-bw - 0.1, bw + 0.1, by0 - 0.1, by0, -0.1, 0.1, 'dark', 0xffffff);
  wb.box(-bw - 0.1, bw + 0.1, by1, by1 + 0.1, -0.1, 0.1, 'dark', 0xffffff);
  pb.add(ballG, M4(0, 10.35, 0, 0, 0.35, 0.35, 0.35), 0xc9a64e);
  wb.reset(); pb.reset();
  const L = route.pointAt(gate.s, -P), R = route.pointAt(gate.s, P);
  return { left: [L.x, L.z], right: [R.x, R.z], dir: [f.rx, f.rz] };
}
const lanternG = new THREE.CylinderGeometry(0.32, 0.2, 0.7, 6);
const lanternCapG = new THREE.ConeGeometry(0.4, 0.4, 6);

// ---------------------------------------------------------------------------------------------
function finishMarks(pb, fin) {
  // chalk-marked loading bay around the finish point, aligned with the truck's heading
  const hx = Math.sin(fin.yaw), hz = Math.cos(fin.yaw), rx = -hz, rz = hx;
  const P = (f, r) => [fin.x + hx * f + rx * r, 0.03, fin.z + hz * f + rz * r];
  const line = (f0, r0, f1, r1, w = 0.16) => {
    const dx = f1 - f0, dr = r1 - r0, l = Math.hypot(dx, dr) || 1;
    const nf = (-dr / l) * w / 2, nr = (dx / l) * w / 2;
    const a = P(f0 - nf, r0 - nr), b = P(f1 - nf, r1 - nr), c = P(f1 + nf, r1 + nr), d = P(f0 + nf, r0 + nr);
    pb.quad(a, b, c, d, 0xf1ece0);
    pb.quad(d, c, b, a, 0xf1ece0);
  };
  const L = 5.2, Wd = 2.8;
  line(-L, -Wd, L, -Wd); line(-L, Wd, L, Wd); line(-L, -Wd, -L, Wd); line(L, -Wd, L, Wd, 0.5);
  for (let k = -2; k <= 2; k++) line(L - 1.8, k * 1.1 - 0.5, L - 0.4, k * 1.1 + 0.5, 0.12);
}

function rampBarrels(list) {
  // on the loading ramp (top y = 1.1) along the expedition front, lying barrels across the ramp
  const groups = [[939.8, 946.8], [957.5, 969.5]];
  for (const [z0, z1] of groups) {
    for (let layer = 0; layer < 3; layer++) {
      for (let z = z0 + layer * 0.35; z <= z1 - layer * 0.35 + 0.01; z += 0.7) {
        list.push({ x: -96.6, y: 1.1 + 0.33 + layer * 0.58, z, lie: true, yaw: Math.PI / 2 });
      }
    }
  }
  // a few standing ones at the ramp edge
  for (const z of [948, 948.8, 956.2]) list.push({ x: -95.6, y: 1.1 + 0.4, z, lie: false, yaw: 0 });
}

function barrelPile(list, x, z, n, yaw, y0 = 0) {
  const ax = Math.cos(yaw), az = -Math.sin(yaw);
  for (let layer = 0; layer < 3 && n - layer > 0; layer++) {
    for (let k = 0; k < n - layer; k++) {
      const o = (k - (n - layer - 1) / 2) * 0.7;
      list.push({ x: x + ax * o, y: y0 + 0.33 + layer * 0.58, z: z + az * o, lie: true, yaw });
    }
  }
}

function barrelMesh(kit, list) {
  const inst = new THREE.InstancedMesh(barrelGeometry(), kit.mats.props, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  list.forEach((b, i) => {
    e.set(b.lie ? Math.PI / 2 : 0, b.yaw, 0, 'YXZ'); q.setFromEuler(e); p.set(b.x, b.y, b.z);
    m.compose(p, q, s); inst.setMatrixAt(i, m);
  });
  inst.castShadow = true; inst.receiveShadow = true; inst.name = 'svetovar-barrels';
  inst.computeBoundingSphere();
  return inst;
}

function handCart(pb, x, z, yaw) {
  const W = 0x6e5236, c = Math.cos(yaw), sn = Math.sin(yaw);
  const P = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  pb.add(boxG, M4(x, 0.95, z, yaw, 2.4, 0.1, 1.3), W);
  for (const sd of [-1, 1]) {
    const [bx, bz] = P(0, sd * 0.68); pb.add(boxG, M4(bx, 1.2, bz, yaw, 2.4, 0.4, 0.06), W);
    const [wx, wz] = P(0, sd * 0.78); pb.add(wheelG, M4(wx, 0.62, wz, yaw, 1, 1, 1, Math.PI / 2), 0x4a3828);
    const [sx, sz] = P(2.1, sd * 0.42); pb.add(boxG, M4(sx, 0.78, sz, yaw, 1.9, 0.08, 0.08, 0, 0.18), W);
  }
}
const wheelG = new THREE.CylinderGeometry(0.62, 0.62, 0.08, 12);

// ---------------------------------------------------------------------------------------------
// Box wagons "PLZEŇSKÝ SVĚTOVAR" (wagon photo) — one InstancedMesh; list = [{ x, z, flip }]
function wagonMesh(kit, list) {
  const b = new Builder(kit);
  const L = 4.3, Wd = 1.4, y0 = 1.25, y1 = 3.55, D = 0x3a3632;
  b.quad([-L, y0, Wd], [L, y0, Wd], [L, y1, Wd], [-L, y1, Wd], 0xffffff, 'wagon');
  b.quad([L, y0, -Wd], [-L, y0, -Wd], [-L, y1, -Wd], [L, y1, -Wd], 0xffffff, 'wagon');
  b.quad([L, y0, Wd], [L, y0, -Wd], [L, y1, -Wd], [L, y1, Wd], 0xffffff, 'wagonEnd');
  b.quad([-L, y0, -Wd], [-L, y0, Wd], [-L, y1, Wd], [-L, y1, -Wd], 0xffffff, 'wagonEnd');
  // curved roof (3 facets) + end caps
  const rp = [[-Wd - 0.1, y1], [-Wd * 0.45, y1 + 0.38], [Wd * 0.45, y1 + 0.38], [Wd + 0.1, y1]];
  for (let i = 0; i < 3; i++) {
    const [za, ya] = rp[i], [zb, yb] = rp[i + 1];
    b.quad([L + 0.15, ya, za], [-L - 0.15, ya, za], [-L - 0.15, yb, zb], [L + 0.15, yb, zb], 0x8a8682, 'dark');
  }
  b.poly([[L + 0.15, y1, Wd + 0.1], [L + 0.15, y1, -Wd - 0.1], [L + 0.15, y1 + 0.38, -Wd * 0.45], [L + 0.15, y1 + 0.38, Wd * 0.45]], 0x8a8682, 'dark');
  b.poly([[-L - 0.15, y1, -Wd - 0.1], [-L - 0.15, y1, Wd + 0.1], [-L - 0.15, y1 + 0.38, Wd * 0.45], [-L - 0.15, y1 + 0.38, -Wd * 0.45]], 0x8a8682, 'dark');
  // underframe, axle boxes, wheels, buffers
  b.box(-L - 0.2, L + 0.2, 0.95, y0, -Wd + 0.1, Wd - 0.1, 'dark', D, { bottom: true });
  const wheel = new THREE.CylinderGeometry(0.46, 0.46, 0.14, 12);
  for (const x of [-2.5, 2.5]) for (const s of [-1, 1]) {
    b.add(wheel, M4(x, 0.82, s * 0.72, 0, 1, 1, 1, Math.PI / 2), 0x2a2724, 'dark');
    b.box(x - 0.25, x + 0.25, 0.75, 1.0, s * 0.82 - 0.12, s * 0.82 + 0.12, 'dark', D);
  }
  const buf = new THREE.CylinderGeometry(0.16, 0.16, 0.5, 8);
  for (const x of [-L - 0.45, L + 0.45]) for (const s of [-1, 1]) b.add(buf, M4(x, 1.05, s * 0.85, 0, 1, 1, 1, 0, Math.PI / 2), 0x2a2724, 'dark');
  // brake hut on one end
  b.box(L - 0.9, L + 0.05, y1, y1 + 0.9, -0.6, 0.6, 'wagonEnd', 0xffffff);
  const geo = b.geometry();
  const inst = new THREE.InstancedMesh(geo, kit.mats.wall, list.length);
  const m = new THREE.Matrix4();
  list.forEach((w, i) => { m.makeRotationY(w.flip ? Math.PI : 0).setPosition(w.x, -0.14, w.z); inst.setMatrixAt(i, m); }); // wheels sit on rail top 0.22
  inst.castShadow = true; inst.receiveShadow = true; inst.name = 'svetovar-wagons';
  inst.computeBoundingSphere();
  return inst;
}

// ---------------------------------------------------------------------------------------------
// Czechoslovak flags (1920: white over red with a blue hoist triangle reaching half the length) as ONE
// instanced mesh. The cloth has a baked wave; the instances flutter around the wind direction.
function makeFlags(kit, list) {
  const fb = new Builder(kit);
  const L = 2.7, H = 1.8, N = 6;
  const zf = (u) => Math.sin((u / L) * Math.PI * 1.7) * 0.18 * (u / L + 0.25);
  for (let i = 0; i < N; i++) {
    const u0 = (i / N) * L, u1 = ((i + 1) / N) * L, z0 = zf(u0), z1 = zf(u1);
    for (const [v0, v1, c] of [[H / 2, H, 0xf2efe8], [0, H / 2, 0xb8352c]]) {
      fb.quad([u0, v0, z0], [u1, v0, z1], [u1, v1, z1], [u0, v1, z0], c);
      fb.quad([u1, v0, z1], [u0, v0, z0], [u0, v1, z0], [u1, v1, z1], c);
    }
  }
  const M = 3;
  for (let i = 0; i < M; i++) {
    const u0 = (i / M) * (L / 2), u1 = ((i + 1) / M) * (L / 2), k0 = u0 / (L / 2), k1 = u1 / (L / 2);
    const a0 = (H / 2) * k0, b0 = H - (H / 2) * k0, a1 = (H / 2) * k1, b1 = H - (H / 2) * k1;
    for (const off of [0.012, -0.012]) {
      const z0 = zf(u0) + off, z1 = zf(u1) + off;
      const p = [[u0, a0, z0], [u1, a1, z1], [u1, b1, z1], [u0, b0, z0]];
      if (off > 0) fb.quad(p[0], p[1], p[2], p[3], 0x2d4f8a); else fb.quad(p[1], p[0], p[3], p[2], 0x2d4f8a);
    }
  }
  const geo = fb.geometry();
  const mesh = new THREE.InstancedMesh(geo, kit.mats.props, list.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = true; mesh.frustumCulled = false; mesh.name = 'svetovar-flags';
  mesh.userData.dynamic = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const WIND = -2.86; // flags stream toward the west-south-west, like the chimney smoke
  function update(dt, t) {
    list.forEach((f, i) => {
      const ph = i * 1.7;
      e.set(0, WIND + Math.sin(t * 1.3 + ph) * 0.22 + Math.sin(t * 3.1 + ph) * 0.06, Math.sin(t * 2.3 + ph) * 0.03);
      q.setFromEuler(e); p.set(f.x, f.top - 0.1 - H * f.s, f.z); s.set(f.s, f.s, f.s);
      m.compose(p, q, s); mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { mesh, update };
}
