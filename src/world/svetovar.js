// Světovar — Český plzeňský pivovar, Bory (1910–13, today TechTower). Owned by "landmarks".
//
// Layout (world coords, X = east, Z = south). The field road runs south along x ≈ 6 just outside the
// east fence (x = -6); the player sees the complex on the RIGHT, i.e. looking west, which is the view of
// the 1911 street elevation and the period photos: from left (south) to right (north)
//   admin villas (z 974–1040) · tall cellar tower with mansard (x -64..-82, z 978–996)
//   · brewhouse "Varna" with clock tower + silo + machine room + boiler house (z 890–922)
//   · the brick chimney (-42, 888, 58 m) · dark lattice cooling tower (-40, 867)
//   · long storage block with vent turret (x -48..-70, z 780–872) · gabled house by the fence (z 846–870).
// Railway z = 880 continues from the fence to a buffer stop at x ≈ -233; a siding (z = 885 from x ≈ -135)
// holds the parked "PLZEŇSKÝ SVĚTOVAR" wagons. Expedition (Stáčení piva) with the loading ramp at
// x ≈ -100 frames the end of the drive (finish ≈ (-76, 951), truck facing -X).
// The yard band z 935..968 for x -95..-6 is kept free (only flat chalk marks + paving).
//
// Draw calls: walls, roofs, props, yard (merged by material) + fence panels, wagons, barrels (instanced)
// + smoke + flag = 9.
import * as THREE from 'three';
import {
  getKit, Builder, rng, M4, gableRoof, hipRoof, mansardRoof, dormer, addGable, addTree, addLamp,
  barrelGeometry, createSmoke,
} from './landmarkUtils.js';

const CREAM = 0xebdfc4, CREAM2 = 0xe5d5b5, OCHRE = 0xe2cfa6, VILLA = 0xeee2c8;
const SLATE = 0x5f5a55, RED = 0x8f4a36, RED2 = 0x9a553d;

export function buildSvetovar(ctx) {
  const { scene, route, camera } = ctx;
  const kit = getKit(ctx);
  const a = route.anchors;
  const R = rng(1911);
  const wb = new Builder(kit), rb = new Builder(kit), pb = new Builder(kit), gb = new Builder(kit);
  const FX = a.fence.x, RZ = a.rail.z;
  const Z0 = a.fence.fromZ, Z1 = a.fence.toZ, X0 = Math.min(a.brewery.minX, a.rail.toX) - 3; // west fence

  // ------------------------------------------------------------------ yard surface + lawns
  gb.poly([[X0, 0.01, Z1], [FX, 0.01, Z1], [FX, 0.01, Z0], [X0, 0.01, Z0]], 0xcdbd9d, null, 'world', 5);
  const lawn = (x0, x1, z0, z1, c = 0x86955a) => pb.quad([x0, 0.025, z1], [x1, 0.025, z1], [x1, 0.025, z0], [x0, 0.025, z0], c);
  lawn(-36, -7, 1006, 1088); lawn(-60, -36, 1040, 1088, 0x7f8f55); lawn(-44, -7, 788, 844, 0x7f8f55);
  lawn(-235, -100, 1036, 1088, 0x8a9660); lawn(-235, -178, 890, 938, 0x84925a); lawn(-235, -174, 980, 1036, 0x8a9660);
  lawn(-86, -72, 800, 872, 0x7f8f55); lawn(-235, -140, 762, 790, 0x8a9660); lawn(-40, -7, 1004, 1006, 0x7a8a50);

  // ------------------------------------------------------------------ railway: main line + siding
  const track = buildTrack(pb, RZ);
  const wagonsZ = track.sidingZ;

  // ------------------------------------------------------------------ buildings
  // --- north sector (right side of the photos)
  // garage / coachmen's house in the NE corner (far right of the 1911 elevation)
  wb.block(-26, -14, 772, 786, [0, 0.8, 3.8, 6.4], { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'win' : 'win'), e: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'gate' : 'win') }, OCHRE, 3.5);
  gableRoof(rb, wb, -26, -14, 772, 786, 6.4, 5.2, 'x', 0.45, RED, OCHRE, 'gable');
  chimney(wb, -20, 779, 9, 3);
  // the big gabled house by the fence (gable to the road) + lower wing
  wb.block(-32, -12, 846, 870, [0, 0.8, 4.4, 8, 11.4], { all: (i, j) => (j === 0 ? 'plinth' : 'win') }, CREAM, 3.6);
  gableRoof(rb, wb, -32, -12, 846, 870, 11.4, 9.5, 'x', 0.45, SLATE, CREAM, 'gable');
  wb.box(-12.3, -11.9, 11.0, 11.6, 845.6, 870.4, 'cornice', CREAM);
  chimney(wb, -18, 858, 18, 4); chimney(wb, -27, 858, 18, 4);
  wb.block(-30, -14, 834, 846, [0, 0.8, 4.2, 6.6], { all: (i, j) => (j === 0 ? 'plinth' : 'win'), s: null }, CREAM2, 3.6);
  gableRoof(rb, wb, -30, -14, 834, 846, 6.6, 3.8, 'x', 0.4, SLATE, CREAM2, 'plain');
  // long storage block with the belfry-like vent turret
  const sb = (i, j) => (j === 0 ? 'plinth' : 'win');
  wb.block(-70, -48, 780, 872, [0, 1.2, 5.4, 9.4, 13.4, 17.4], { all: sb }, CREAM, 3.6);
  wb.box(-70.4, -47.6, 17.0, 17.7, 779.6, 872.4, 'cornice', CREAM);
  hipRoof(rb, -70, -48, 780, 872, 17.6, 5.5, 0.5, SLATE);
  wb.box(-61.2, -56.8, 19, 22.5, 861.8, 866.2, 'plain', CREAM);
  wb.cyl(-59, 864, 22.5, 30.5, 1.85, 1.7, 10, 2, 'winSmall', CREAM, { cap: false });
  wb.cyl(-59, 864, 30.5, 31.2, 2.3, 2.3, 10, 1, 'stone', CREAM2);
  rb.cone(-59, 864, 31.2, 2.4, 2.4, 10, SLATE, null, 0, 'world', 2);
  pb.add(ballG, M4(-59, 34.0, 864, 0, 0.3, 0.3, 0.3), 0x3c3a36);
  pb.add(boxG, M4(-59, 35.2, 864, 0, 0.08, 2.2, 0.08), 0x3c3a36);
  for (const z of [800, 830]) wb.cyl(-59, z, 20, 23.6, 0.5, 0.5, 6, 1, 'slats', 0xffffff, { smooth: false });
  // dark lattice cooling tower (photo 15, right of the chimney)
  wb.cyl(-40, 867, 0, 15.5, 5.7, 3.9, 4, 3, 'slats', 0xffffff, { rot: Math.PI / 4, smooth: false, cap: true });
  wb.box(-42, -38, 15.5, 17.0, 865, 869, 'slats', 0xcccccc);
  // cooperage (Bednárna) and coach house (Kolna) north of the line
  wb.block(-200, -150, 852, 873, [0, 0.8, 5.2, 7.4], { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? (i % 3 === 1 ? 'loadDoor' : 'win') : 'winSmall') }, OCHRE, 4);
  gableRoof(rb, wb, -200, -150, 852, 873, 7.4, 4.5, 'x', 0.4, SLATE, OCHRE, 'gable');
  wb.block(-231, -206, 792, 872, [0, 6.2], { all: 'loadDoor', w: 'plain' }, CREAM2, 4.5);
  gableRoof(rb, wb, -231, -206, 792, 872, 6.2, 4.2, 'z', 0.4, SLATE, CREAM2, 'plain');
  // malt house (Sladovna) — big block behind the wagons
  wb.block(-138, -90, 798, 862, [0, 1.2, 5.4, 9.6, 13.8, 18], { all: (i, j) => (j === 0 ? 'plinth' : 'malt') }, CREAM, 4);
  wb.box(-138.4, -89.6, 17.6, 18.3, 797.6, 862.4, 'cornice', CREAM);
  hipRoof(rb, -138, -90, 798, 862, 18.2, 6, 0.5, SLATE);
  for (const z of [815, 845]) {
    wb.box(-117, -111, 20, 26, z - 3, z + 3, 'slats', 0xffffff);
    rb.cone(-114, z, 26, 3.4, 4.6, 4, SLATE, null, Math.PI / 4, 'world', 2);
  }

  // --- brewhouse row between the railway and the yard (z 884..922)
  // chimney: stone/brick plinth + tapered shaft, ~58 m, top cornice, iron bands
  const CH = [-42, 888];
  wb.block(CH[0] - 3.4, CH[0] + 3.4, CH[1] - 3.4, CH[1] + 3.4, [0, 1.4, 8.2], { all: (i, j) => (j === 0 ? 'plinth' : 'brickDark') }, 0xffffff, 3.4);
  wb.box(CH[0] - 3.8, CH[0] + 3.8, 8.2, 9.2, CH[1] - 3.8, CH[1] + 3.8, 'stone', 0xd6ccbc);
  wb.cyl(CH[0], CH[1], 9.2, 56.6, 2.75, 1.68, 14, 30, 'brickGrey', 0xf2ece4, { cap: false });
  wb.cyl(CH[0], CH[1], 56.6, 57.9, 2.02, 2.05, 14, 1, 'brickDark', 0xffffff, { cap: false });
  wb.cyl(CH[0], CH[1], 57.9, 58.6, 1.9, 1.85, 14, 1, 'brickDark', 0xd0c0b0, { cap: true });
  for (let y = 16; y < 56; y += 8) { const r = 2.75 + (1.68 - 2.75) * ((y - 9.2) / 47.4) + 0.04; wb.cyl(CH[0], CH[1], y, y + 0.22, r, r, 14, 1, 'dark', 0xffffff, { cap: false }); }
  pb.add(boxG, M4(CH[0], 60.2, CH[1] + 1.5, 0, 0.06, 3.4, 0.06), 0x2d2a26);
  // boiler house (Kotelna) with a ridge lantern
  wb.block(-38, -22, 890, 918, [0, 1, 9, 11], { all: (i, j) => (j === 1 ? 'winTall' : j === 0 ? 'plinth' : 'plain') }, CREAM, 4);
  gableRoof(rb, wb, -38, -22, 890, 918, 11, 4.2, 'x', 0.4, SLATE, CREAM, 'winRound');
  wb.block(-36, -24, 902.4, 905.6, [14, 15.8], { all: 'slats' }, 0xffffff, 3);
  gableRoof(rb, null, -36, -24, 902.4, 905.6, 15.8, 1.0, 'x', 0.35, SLATE);
  // machine room (Strojovna) with dormer gables
  wb.block(-66, -46, 893, 919, [0, 1.2, 10.4, 12.4], { all: (i, j) => (j === 1 ? 'winTall' : j === 0 ? 'plinth' : 'cornice') }, CREAM, 4);
  gableRoof(rb, wb, -66, -46, 893, 919, 12.4, 5, 'x', 0.4, SLATE, CREAM, 'gable');
  for (const x of [-61, -56, -51]) dormer(wb, rb, x, 918.0, 2.4, 12.6, 2.0, 2.6, CREAM, SLATE, 'winArch');
  // silo / pre-heaters (tall narrow)
  wb.block(-73, -66, 892, 920, [0, 1.2, 6, 10.5, 15, 19.5, 24, 25.5], { all: (i, j) => (j === 0 ? 'plinth' : j === 6 ? 'cornice' : i % 2 ? 'winSmall' : 'plain') }, CREAM2, 3.5, 'plain');
  wb.box(-71, -68, 25.5, 28, 902, 910, 'winSmall', CREAM2);
  hipRoof(rb, -71, -68, 902, 910, 28, 1.4, 0.3, SLATE);
  // brewhouse (Varna) + clock tower with a steep spire
  const VX0 = -96, VX1 = -73, VZ0 = 890, VZ1 = 922;
  wb.block(VX0, VX1, VZ0, VZ1, [0, 1.2, 5.6, 9.6, 13.6, 17.6, 21.4, 23.4], { all: (i, j) => (j === 0 ? 'plinth' : j === 6 ? 'cornice' : 'lesene') }, CREAM, 4);
  hipRoof(rb, VX0, VX1, VZ0, VZ1, 23.4, 4.5, 0.6, SLATE);
  const T = { x0: -96.4, x1: -87.2, z0: 912.6, z1: 922.4 };
  const tcx = (T.x0 + T.x1) / 2, tcz = (T.z0 + T.z1) / 2;
  wb.block(T.x0, T.x1, T.z0, T.z1, [23.4, 28.4, 31.8, 34.6], { all: (i, j) => (j === 0 ? 'arcadeWin' : j === 1 ? 'clock' : 'cornice') }, CREAM, 9.2, 'plain');
  wb.box(T.x0 - 0.4, T.x1 + 0.4, 34.6, 35.3, T.z0 - 0.4, T.z1 + 0.4, 'stone', CREAM2);
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = tcx + dx * 4.4, pz = tcz + dz * 4.6;
    wb.cyl(px, pz, 35.3, 37.2, 0.55, 0.5, 6, 1, 'plain', CREAM, { smooth: false });
    rb.cone(px, pz, 37.2, 2.2, 0.7, 6, SLATE, null, 0, 'world', 2);
  }
  rb.cone(tcx, tcz, 35.3, 9.6, 6.6, 4, SLATE, null, Math.PI / 4, 'world', 3);
  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    // small clock-dormers on the spire faces
    const dx = tcx + nx * 4.3, dz = tcz + nz * 4.3;
    wb.at(dx, dz, Math.atan2(nx, nz));
    rb.at(dx, dz, Math.atan2(nx, nz));
    dormer(wb, rb, 0, 0, 1.5, 36.2, 1.4, 1.8, CREAM, SLATE, 'winRound');
    wb.reset(); rb.reset();
  }
  wb.cyl(tcx, tcz, 42.8, 44.2, 0.6, 0.55, 8, 1, 'arcadeWin', CREAM, { smooth: false });
  rb.cone(tcx, tcz, 44.2, 2.4, 0.75, 8, SLATE, null, 0, 'world', 1);
  pb.add(ballG, M4(tcx, 46.8, tcz, 0, 0.22, 0.22, 0.22), 0xc9a64e);
  pb.add(boxG, M4(tcx, 48.0, tcz, 0, 0.07, 2.4, 0.07), 0x2d2a26);

  // --- south sector (left side of the photos)
  // tall cellar tower ("věž sklepů", 7 storeys + mansard)
  const CT = { x0: -82, x1: -64, z0: 978, z1: 996 };
  wb.block(CT.x0, CT.x1, CT.z0, CT.z1, [0, 1.2, 5.6, 9.8, 14, 18.2, 22.4, 26.6, 29.6, 30.6],
    { all: (i, j) => (j === 0 ? 'plinth' : j === 9 - 1 ? 'cornice' : j >= 6 ? 'winArch' : 'winPair') }, CREAM, 4.5);
  wb.box(CT.x0 - 0.5, CT.x1 + 0.5, 30.2, 31.0, CT.z0 - 0.5, CT.z1 + 0.5, 'stone', CREAM2);
  mansardRoof(rb, CT.x0, CT.x1, CT.z0, CT.z1, 31.0, 3.8, 1.5, 2.6, 0.3, SLATE);
  for (const lx of [4.5, 9, 13.5]) {
    wb.at(CT.x1, CT.z1, Math.PI / 2); rb.at(CT.x1, CT.z1, Math.PI / 2); // east face
    dormer(wb, rb, lx, -0.7, 1.6, 31.5, 1.9, 1.6, CREAM, SLATE, 'winSmall');
    wb.at(CT.x0, CT.z1, 0); rb.at(CT.x0, CT.z1, 0); // south face
    dormer(wb, rb, lx, -0.7, 1.6, 31.5, 1.9, 1.6, CREAM, SLATE, 'winSmall');
  }
  wb.reset(); rb.reset();
  wb.cyl(-73, 987, 37.4, 39.4, 1.3, 1.2, 8, 1, 'arcadeWin', CREAM, { smooth: false });
  rb.cone(-73, 987, 39.4, 2.6, 1.6, 8, SLATE, null, 0, 'world', 2);
  chimney(wb, -66, 980, 33, 4); chimney(wb, -80, 994, 33, 4);
  // long cellar block (Sklepy) with the raised cooling-ship hall
  wb.block(-170, -82, 980, 1030, [0, 1.2, 5.8, 10.2, 14.6], { all: (i, j) => (j === 0 ? 'plinth' : 'malt') }, CREAM2, 4);
  wb.box(-170.4, -81.6, 14.2, 14.9, 979.6, 1030.4, 'cornice', CREAM2);
  gableRoof(rb, wb, -170, -82, 980, 1030, 14.8, 5.5, 'x', 0.5, SLATE, CREAM2, 'plain');
  wb.block(-150, -102, 995, 1015, [16, 21.5], { all: 'arcadeWin' }, CREAM, 4);
  gableRoof(rb, wb, -150, -102, 995, 1015, 21.5, 3.6, 'x', 0.4, SLATE, CREAM, 'winRound');
  // expedition / bottling (Stáčení piva) with the loading ramp — frames the end of the drive
  stacheni(wb, rb, pb);
  // fire station + washing hall (Požárna a umývárna) with a hose tower
  wb.block(-176, -140, 938, 972, [0, 0.8, 4.8, 8.4], { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? (i % 2 ? 'loadDoor' : 'win') : 'winSmall') }, OCHRE, 4);
  gableRoof(rb, wb, -176, -140, 938, 972, 8.4, 5, 'x', 0.4, RED2, OCHRE, 'gable');
  wb.block(-174, -169, 932, 937.5, [0, 4, 8, 12, 16.5], { all: (i, j) => (j === 0 ? 'gate' : 'winSmall') }, OCHRE, 5);
  rb.cone(-171.5, 934.75, 16.5, 4.2, 4.2, 4, RED2, null, Math.PI / 4, 'world', 2);
  // sheds (cooperage stores)
  wb.block(-228, -182, 942, 976, [0, 6.5], { all: 'loadDoor', w: 'plain', n: 'plain' }, CREAM2, 4.6);
  gableRoof(rb, wb, -228, -182, 942, 976, 6.5, 4, 'x', 0.4, SLATE, CREAM2, 'plain');

  // administration villa (big, by the gate) — facade to the road (east)
  adminVilla(wb, rb, -14, 1004);
  smallVilla(wb, rb, -16, 1042);

  // ------------------------------------------------------------------ perimeter fence + gate
  const gw = gateway(wb, pb, route, a.gate);
  const ZN = 914, ZS = 962; // where the fence leaves the x = FX line toward the gate pillars
  const toward = (p, q, d) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [p[0] + ((q[0] - p[0]) * d) / l, p[1] + ((q[1] - p[1]) * d) / l]; };
  const fence = buildFence(wb, kit, [
    { a: [FX, Z0], b: [FX, ZN], gaps: [[RZ - 4.5 - Z0, RZ + 4.5 - Z0]] }, // east, along the field road (rail opening)
    { a: [FX, ZN], b: toward(gw.right, [FX, ZN], 1.3) },                 // swing in to the right gate pillar
    { a: toward(gw.left, [FX, ZS], 1.3), b: [FX, ZS] },                  // from the left gate pillar back to the line
    { a: [FX, ZS], b: [FX, Z1] },
    { a: [FX, Z1], b: [X0, Z1] }, // south
    { a: [X0, Z1], b: [X0, Z0] }, // west
    { a: [X0, Z0], b: [FX, Z0] }, // north
  ]);

  // ------------------------------------------------------------------ trees, lamps, finish marks, props
  for (const z of [1010, 1024, 1048, 1062, 1076]) addTree(pb, -9.5, z, 1.1, R);
  for (const [x, z] of [[-42, 1058], [-50, 1074], [-30, 1080], [-9.5, 796], [-9.5, 812], [-9.5, 826], [-38, 798], [-38, 818], [-40, 836], [-58, 1050], [-75, 1052]]) addTree(pb, x, z, 1.1, R);
  for (let x = -100; x > -230; x -= 22) addTree(pb, x, 1084, 1.0, R);
  for (let z = 1076; z > 990; z -= 24) addTree(pb, -231, z, 1.0, R);
  for (const [x, z] of [[-20, 966], [-48, 967], [-28, 934], [-62, 933], [-92, 932], [-120, 930]]) addLamp(pb, x, z, 4.6);

  finishMarks(pb, a.finish);
  const barrels = [];
  rampBarrels(barrels);
  for (const [bx, bz] of [[-150, 892], [-162, 893], [-176, 892]]) barrelPile(barrels, bx, bz, 4, 0);
  barrelPile(barrels, -46, 926, 4, Math.PI / 2);
  barrelPile(barrels, -132, 931, 3, 0);
  // crates + carts
  for (let i = 0; i < 10; i++) pb.add(boxG, M4(-143 + R() * 6, 0.35, 930 + R() * 5, R() * 0.4, 0.8, 0.7, 0.8), i % 2 ? 0x8a6a46 : 0x9a7b55);
  handCart(pb, -96.5, 976.5, 0.4);
  handCart(pb, -170, 893.8, 1.6);

  // ------------------------------------------------------------------ assemble
  const group = new THREE.Group();
  group.name = 'svetovar';
  const add = (m) => m && group.add(m);
  add(wb.mesh(kit.mats.wall, { name: 'svetovar-walls' }));
  add(rb.mesh(kit.mats.roof, { name: 'svetovar-roofs' }));
  add(pb.mesh(kit.mats.props, { name: 'svetovar-props' }));
  add(gb.mesh(kit.mats.ground, { cast: false, name: 'svetovar-yard' }));
  add(fence.panels);
  add(wagonMesh(kit, wagonsZ));
  add(barrelMesh(kit, barrels));

  // smoke plume from the chimney (dynamic)
  const smoke = createSmoke(kit, camera, [CH[0], 58.8, CH[1]], { count: 14, rise: 26, drift: [16, 0, 9], size: [3, 16], alpha: 0.8, period: 11 });
  group.add(smoke.mesh);
  // flag on the loading ramp (dynamic)
  const flag = makeFlag(kit, -95.6, 975);
  group.add(flag.pole); group.add(flag.flag);
  ctx.dynamic.push({ update: (dt, t) => { smoke.update(dt, t); flag.update(dt, t); } });

  scene.add(group);
  ctx.landmarks = ctx.landmarks || {};
  ctx.landmarks.svetovar = { group, triangles: wb.triangles + rb.triangles + pb.triangles + gb.triangles };
  return {};
}

const boxG = new THREE.BoxGeometry(1, 1, 1);
const ballG = new THREE.SphereGeometry(1, 8, 6);
const cylG = new THREE.CylinderGeometry(1, 1, 1, 10);

function chimney(wb, x, z, y0, h) { wb.box(x - 0.4, x + 0.4, y0, y0 + h, z - 0.4, z + 0.4, 'brick', 0xd8c8b8); wb.box(x - 0.5, x + 0.5, y0 + h, y0 + h + 0.25, z - 0.5, z + 0.5, 'stone', 0xd0c4b0); }

// ---------------------------------------------------------------------------------------------
function buildTrack(pb, RZ) {
  const BALLAST = 0x8b8273, SLEEPER = 0x4f3f31, RAIL = 0x45423e;
  const SIDING_Z = RZ + 5;
  const xs = -6, xe = -233;
  // main line ballast + rails + sleepers
  const seg = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(z1 - z0, x0 - x1); // along -X
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const nx = -(z1 - z0) / len, nz = (x1 - x0) / len; // perpendicular
    pb.add(boxG, M4(mx, 0.05, mz, yaw, len + 0.05, 0.1, 3.0), BALLAST);
    for (const g of [-0.72, 0.72]) pb.add(boxG, M4(mx + nx * g, 0.16, mz + nz * g, yaw, len + 0.02, 0.12, 0.08), RAIL); // rail top 0.22 = city.js RAIL_Y
    return len;
  };
  const sleepers = (pts) => {
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
  seg(xs, RZ, xe, RZ);
  sleepers([[xs, RZ], [xe, RZ]]);
  // siding: leaves the main line at x≈-100, curves to z = RZ+5 by x≈-136
  const pts = [];
  for (let x = -100; x >= -136; x -= 3) { const t = (-100 - x) / 36; const s = t * t * (3 - 2 * t); pts.push([x, RZ + 5 * s]); }
  pts.push([xe, SIDING_Z]);
  for (let i = 1; i < pts.length; i++) seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  sleepers(pts);
  // buffer stops
  for (const z of [RZ, SIDING_Z]) {
    pb.add(boxG, M4(xe - 0.4, 0.75, z, 0, 0.6, 1.5, 2.6), 0x5b4a3a);
    pb.add(boxG, M4(xe + 0.05, 1.05, z, 0, 0.1, 0.5, 2.0), 0xd8d0c0);
    pb.add(boxG, M4(xe + 0.08, 1.05, z, 0, 0.1, 0.5, 0.6), 0xa53a2e);
  }
  // loading platform along the siding (south side)
  pb.add(boxG, M4(-185, 0.5, SIDING_Z + 3.6, 0, 90, 1.0, 3.2), 0xa49a8a);
  return { sidingZ: SIDING_Z };
}

// ---------------------------------------------------------------------------------------------
function stacheni(wb, rb, pb) {
  // local frame: facade at x = -100 facing east (+X); local x runs south→north (z 972 → 936)
  const OX = -100, OZ = 972, W = 36, D = 40, C = CREAM;
  wb.at(OX, OZ, Math.PI / 2); rb.at(OX, OZ, Math.PI / 2); pb.at(OX, OZ, Math.PI / 2);
  const ys = [0, 1.2, 5.2, 8.8];
  wb.wall(0, 0, W, 0, ys, 10, (i, j) => (j === 0 ? 'plinth' : j === 1 ? (i % 2 === 0 ? 'loadDoor' : 'win') : 'winSmall'), C);
  wb.wall(W, 0, W, -D, ys, 10, (i, j) => (j === 0 ? 'plinth' : 'win'), C);
  wb.wall(0, -D, 0, 0, ys, 10, (i, j) => (j === 0 ? 'plinth' : 'win'), C);
  wb.wall(W, -D, 0, -D, [0, 8.8], 4, 'plain', C);
  wb.box(-0.3, W + 0.3, 8.4, 9.1, -0.3, 0.45, 'cornice', C, { sides: 'sew' });
  gableRoof(rb, wb, 0, W, -D, 0, 9.0, 6, 'x', 0.4, SLATE, C, 'gable');
  addGable(wb, W / 2, 9.0, 0.2, 13, 6.8, 'volute', C, 'gable');
  // loading ramp + canopy
  wb.box(1, W - 1, 0, 1.1, 0, 3.2, 'plinth', 0xd8d0c0);
  rb.poly([[0.5, 4.5, 3.7], [W - 0.5, 4.5, 3.7], [W - 0.5, 5.15, 0.05], [0.5, 5.15, 0.05]], SLATE, null, 'world');
  for (let x = 2; x <= W - 2; x += 5.6) {
    pb.add(boxG, M4(x, 2.8, 3.35, 0, 0.14, 3.4, 0.14), 0x2c2a27);
    pb.add(boxG, M4(x, 4.55, 1.7, 0, 0.1, 0.12, 3.4, 0.17), 0x2c2a27);
  }
  // hanging "SVĚTOVAR" sign facing the arriving truck (z ≈ 951 => local x = 21)
  const sx = OZ - 951, sy0 = 2.7, sy1 = 4.1, sw = 3.2;
  wb.quad([sx - sw, sy0, 3.55], [sx + sw, sy0, 3.55], [sx + sw, sy1, 3.55], [sx - sw, sy1, 3.55], 0xffffff, 'svetovar');
  wb.quad([sx + sw, sy0, 3.45], [sx - sw, sy0, 3.45], [sx - sw, sy1, 3.45], [sx + sw, sy1, 3.45], 0x777777, 'dark');
  for (const dx of [-sw + 0.3, sw - 0.3]) pb.add(boxG, M4(sx + dx, (sy1 + 4.5) / 2, 3.5, 0, 0.05, 4.5 - sy1, 0.05), 0x2c2a27);
  // name band over the doors
  wb.quad([W / 2 - 7, 5.4, 0.12], [W / 2 + 7, 5.4, 0.12], [W / 2 + 7, 6.6, 0.12], [W / 2 - 7, 6.6, 0.12], 0xffffff, 'cpp');
  wb.reset(); rb.reset(); pb.reset();
}

function adminVilla(wb, rb, ox, oz) {
  // local frame: facade at x = ox facing east, local x runs from z = oz northwards (decreasing z)
  const W = 30, D = 20, C = VILLA;
  wb.at(ox, oz, Math.PI / 2); rb.at(ox, oz, Math.PI / 2);
  const ys = [0, 1.0, 4.8, 8.4, 11.6];
  const t = (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'rustic' : j === 2 ? 'villaWin' : 'winOrn');
  wb.wall(0, 0, W, 0, ys, 9, t, C);
  wb.wall(W, 0, W, -D, ys, 6, t, C);
  wb.wall(0, -D, 0, 0, ys, 6, t, C);
  wb.wall(W, -D, 0, -D, ys, 9, t, C);
  wb.box(-0.3, W + 0.3, 11.2, 11.9, -D - 0.3, 0.45, 'cornice', C, { sides: 'nsew' });
  hipRoof(rb, 0, W, -D, 0, 11.8, 7, 0.6, RED);
  // central risalit with a baroque gable + balcony
  wb.block(10, 20, 0, 1.4, ys, { s: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'door' : t(i, j)), e: 'plain', w: 'plain', n: null }, C, 3.4);
  wb.box(9.8, 20.2, 11.2, 11.9, 0, 1.8, 'cornice', C);
  addGable(wb, 15, 11.9, 1.55, 10.4, 7.2, 'volute', C, 'gable');
  gableRoof(rb, null, 10, 20, -6, 1.4, 11.9, 6.4, 'z', 0.05, RED, C, 'plain', { ends: false });
  wb.box(11.5, 18.5, 4.6, 4.9, 1.4, 2.6, 'stone', 0xd8d0c0);
  // side gable (south end) and dormers
  addGable(wb, 4.5, 11.9, 0.3, 7, 5.2, 'triangle', C, 'gable');
  gableRoof(rb, null, 1, 8, -6, 0.3, 11.9, 4.8, 'z', 0.05, RED, C, 'plain', { ends: false });
  for (const x of [24, 27.5]) dormer(wb, rb, x, -1.6, 1.4, 12.6, 1.7, 2.6, C, RED, 'winSmall');
  for (const [x, z] of [[3, -10], [12, -14], [22, -6], [27, -12]]) chimney(wb, x, z, 14, 5.5);
  wb.reset(); rb.reset();
}

function smallVilla(wb, rb, ox, oz) {
  const W = 22, D = 14, C = 0xe9dcc0;
  wb.at(ox, oz, Math.PI / 2); rb.at(ox, oz, Math.PI / 2);
  const ys = [0, 0.9, 4.6, 8.2];
  const t = (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'winShutter' : 'win');
  wb.wall(0, 0, W, 0, ys, 6, (i, j) => (j === 1 && i === 2 ? 'door' : t(i, j)), C);
  wb.wall(W, 0, W, -D, ys, 4, t, C);
  wb.wall(0, -D, 0, 0, ys, 4, t, C);
  wb.wall(W, -D, 0, -D, ys, 6, t, C);
  wb.box(-0.3, W + 0.3, 7.8, 8.4, -D - 0.3, 0.4, 'cornice', C, { sides: 'nsew' });
  hipRoof(rb, 0, W, -D, 0, 8.3, 6.4, 0.6, RED2);
  addGable(wb, 8, 8.3, 0.25, 8, 6.4, 'triangle', C, 'gable');
  gableRoof(rb, null, 4, 12, -6, 0.25, 8.3, 5.6, 'z', 0.05, RED2, C, 'plain', { ends: false });
  chimney(wb, 15, -7, 11, 5); chimney(wb, 5, -9, 10, 5);
  wb.reset(); rb.reset();
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
  const IRON = 0x2a2927, ST = 0xe6dccb;
  const f = route.frameAt(gate.s);
  const P = route.halfWidthAt(gate.s) + 2.8;
  const rot = Math.atan2(-f.tx, -f.tz);
  wb.at(f.x, f.z, rot); pb.at(f.x, f.z, rot);
  const pillar = (x) => {
    wb.box(x - 1.2, x + 1.2, 0, 0.7, -1.2, 1.2, 'plinth', 0xcfc6b5);
    wb.block(x - 0.95, x + 0.95, -0.95, 0.95, [0.7, 2.8, 4.9, 5.6], { all: (i, j) => (j === 2 ? 'cornice' : 'stone') }, ST, 1.9);
    wb.box(x - 1.25, x + 1.25, 5.6, 6.1, -1.25, 1.25, 'stone', 0xd8cebd);
    wb.cone(x, 0, 6.1, 0.9, 1.45, 4, 0xcfc5b2, 'stone', Math.PI / 4);
    pb.add(cylG, M4(x, 7.25, 0, 0, 0.08, 0.6, 0.08), IRON);
    pb.add(lanternG, M4(x, 7.85, 0), 0xf3e2b0);
    pb.add(lanternCapG, M4(x, 8.4, 0), IRON);
    // short wing wall toward the fence
  };
  pillar(-P); pillar(P);
  // iron arch: two curved chords with a lattice between them, carrying the name board
  const yAt = (x, top) => 6.0 + top * (1 - (x / P) ** 2);
  const N = 18;
  for (let i = 0; i < N; i++) {
    const xa = -P + (2 * P * i) / N, xb = -P + (2 * P * (i + 1)) / N;
    for (const [top, off] of [[3.8, 0], [3.2, -0.55]]) {
      const ya = yAt(xa, top) + off, yb = yAt(xb, top) + off;
      pb.add(boxG, M4((xa + xb) / 2, (ya + yb) / 2, 0, 0, Math.hypot(xb - xa, yb - ya) + 0.02, 0.12, 0.12, 0, Math.atan2(yb - ya, xb - xa)), IRON);
    }
    const xc = (xa + xb) / 2, y1 = yAt(xc, 3.8), y0 = yAt(xc, 3.2) - 0.55;
    pb.add(boxG, M4(xc, (y0 + y1) / 2, 0, 0, 0.06, y1 - y0, 0.06, 0, i % 2 ? 0.5 : -0.5), IRON);
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
  // on the loading ramp (top y = 1.1) at x ≈ -98.4, lying barrels across the ramp
  const groups = [[937.5, 945.5], [957.5, 969.5]];
  for (const [z0, z1] of groups) {
    for (let layer = 0; layer < 3; layer++) {
      for (let z = z0 + layer * 0.35; z <= z1 - layer * 0.35 + 0.01; z += 0.7) {
        list.push({ x: -98.6, y: 1.1 + 0.33 + layer * 0.58, z, lie: true, yaw: Math.PI / 2 });
      }
    }
  }
  // a few standing ones at the ramp edge
  for (const z of [947, 947.8, 956.2]) list.push({ x: -97.6, y: 1.1 + 0.4, z, lie: false, yaw: 0 });
}

function barrelPile(list, x, z, n, yaw) {
  const ax = Math.cos(yaw), az = -Math.sin(yaw);
  for (let layer = 0; layer < 3 && n - layer > 0; layer++) {
    for (let k = 0; k < n - layer; k++) {
      const o = (k - (n - layer - 1) / 2) * 0.7;
      list.push({ x: x + ax * o, y: 0.33 + layer * 0.58, z: z + az * o, lie: true, yaw });
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
// Box wagons "PLZEŇSKÝ SVĚTOVAR" (photo 16) — one InstancedMesh
function wagonMesh(kit, z) {
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
    b.quad([L + 0.15, ya, zb === za ? za : za], [-L - 0.15, ya, za], [-L - 0.15, yb, zb], [L + 0.15, yb, zb], 0x8a8682, 'dark');
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
  const xs = [];
  for (let i = 0; i < 7; i++) xs.push(-142 - i * 9.95);
  const inst = new THREE.InstancedMesh(geo, kit.mats.wall, xs.length);
  const m = new THREE.Matrix4();
  xs.forEach((x, i) => { m.makeRotationY(i === 3 ? Math.PI : 0).setPosition(x, -0.14, z); inst.setMatrixAt(i, m); }); // wheels sit on rail top 0.22
  inst.castShadow = true; inst.receiveShadow = true; inst.name = 'svetovar-wagons';
  inst.computeBoundingSphere();
  return inst;
}

// ---------------------------------------------------------------------------------------------
function makeFlag(kit, x, z) {
  const pb = new Builder(kit);
  pb.add(cylG, M4(x, 5.5, z, 0, 0.07, 11, 0.07), 0xe8e2d6);
  pb.add(ballG, M4(x, 11.1, z, 0, 0.13, 0.13, 0.13), 0xc9a64e);
  const pole = pb.mesh(kit.mats.props, { name: 'svetovar-flagpole' });
  // Czechoslovak flag (1920): white over red with a blue hoist triangle; pivot at the pole
  const fb = new Builder(kit);
  const L = 2.7, H = 1.8;
  const quads = [[0, H / 2, L, H, 0xf2efe8], [0, 0, L, H / 2, 0xb8352c]];
  for (const [u0, v0, u1, v1, c] of quads) {
    fb.quad([u0, v0, 0], [u1, v0, 0], [u1, v1, 0], [u0, v1, 0], c);
    fb.quad([u1, v0, 0], [u0, v0, 0], [u0, v1, 0], [u1, v1, 0], c);
  }
  fb.tri([0, 0, 0.01], [L * 0.5, H / 2, 0.01], [0, H, 0.01], 0x2d4f8a);
  fb.tri([0, H, -0.01], [L * 0.5, H / 2, -0.01], [0, 0, -0.01], 0x2d4f8a);
  const flag = fb.mesh(kit.mats.props, { name: 'svetovar-flag' });
  flag.position.set(x, 11 - H - 0.1, z);
  flag.userData.dynamic = true;
  return {
    pole, flag,
    update(dt, t) {
      flag.rotation.y = -0.5 + Math.sin(t * 1.3) * 0.22 + Math.sin(t * 3.1) * 0.06;
      flag.rotation.z = Math.sin(t * 2.3) * 0.02;
    },
  };
}
