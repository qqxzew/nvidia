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
// The complex is also the hero of the main menu (camera swinging around it from the east at 100–200 m),
// so silhouettes carry the detail: ridge/hip caps, fascia boards, dormer rows, the bell-cast clock spire
// with real clock dials, the brewhouse vapour stacks, the corbelled chimney crown, cornices and string
// courses as relief geometry, per-building plaster tones, a coal-smoke plume, steam, and two flags.
//
// Draw calls: walls, roofs, props, yard (merged by material) + fence panels, wagons, barrels (instanced)
// + coal smoke + 2 steam plumes + flags (instanced) = 11.
import * as THREE from 'three';
import {
  getKit, Builder, rng, M4, gableRoof, hipRoof, mansardRoof, dormer, addGable, addTree, addLamp,
  barrelGeometry, createSmoke,
} from './landmarkUtils.js';

const CREAM = 0xebdfc4, CREAM2 = 0xe5d5b5, OCHRE = 0xe2cfa6, VILLA = 0xeee2c8;
// per-building plaster tones (hand-coloured postcards: warm cream, light ochre, one whiter render)
const T_BREW = 0xf0e6d0, T_TOWER = 0xeadab8, T_CELLAR = 0xe4d3b0, T_STORE = 0xe9d8b2, T_MALT = 0xece0c4;
const T_HOUSE = 0xf1e8d4, T_MACH = 0xe9dcc0, T_BOIL = 0xe6d5b2, T_EXP = 0xeadfc6;
const SLATE = 0x5f5a55, SLATE2 = 0x58595b, SLATE3 = 0x655c54, RED = 0x8f4a36, RED2 = 0x9a553d;
const FASCIA = 0x3d3833, STONE = 0xddd3c0;
const ROOF_SCALE = 7; // world repeat of the hero roof texture (m)

export function buildSvetovar(ctx) {
  const { scene, route, camera } = ctx;
  const kit = getKit(ctx);
  const a = route.anchors;
  const R = rng(1911);
  const wb = new Builder(kit), rb = new Builder(kit), pb = new Builder(kit), gb = new Builder(kit);
  rb.worldScale = ROOF_SCALE;
  const FX = a.fence.x, RZ = a.rail.z;
  const Z0 = a.fence.fromZ, Z1 = a.fence.toZ, X0 = Math.min(a.brewery.minX, a.rail.toX) - 3; // west fence

  // ------------------------------------------------------------------ yard surface, paving, lawns
  // beaten-earth base of the whole compound (untextured: reads as dusty ground from the menu camera),
  // cobbled areas on top of it in the ground material
  pb.quad([X0, 0.006, Z1], [FX, 0.006, Z1], [FX, 0.006, Z0], [X0, 0.006, Z0], 0xb3a68c);
  const pave = (x0, x1, z0, z1, c, y = 0.013) => gb.poly([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], c, null, 'world', 5);
  pave(-100, -6, 920, 976, 0xd6cbb8);                 // cobbled main yard (gate → expedition), under the road ribbon
  pave(-100, -14, 884, 892, 0xc8beae);                // cobbled strip along the brewhouse row (north side)
  pave(X0, -6, 874, 884, 0x968b7c);                   // cinders around the railway (rails stay free)
  pave(-230, -100, 884, 896, 0xa89d8b);               // siding / loading platform apron
  pave(-176, -100, 925, 938, 0xcfc3ad);               // lane in front of the fire station
  pave(-82, -62, 996, 1001, 0xcfc3ad);                // path behind the cellar tower
  // stone sidewalks along the yard faces of the main buildings (read as a crisp base line from afar)
  const walk = (x0, x1, z0, z1) => pave(x0, x1, z0, z1, 0xd9d0bf, 0.035);
  walk(-96, -22, 922, 924.2); walk(-14, -12.2, 972, 1004); walk(-82.5, -63.5, 976.2, 978); walk(-63.8, -62, 976, 996.5);
  const lawn = (x0, x1, z0, z1, c = 0x86955a) => pb.quad([x0, 0.04, z1], [x1, 0.04, z1], [x1, 0.04, z0], [x0, 0.04, z0], c);
  lawn(-36, -7, 1006, 1088); lawn(-60, -36, 1040, 1088, 0x7f8f55); lawn(-44, -7, 788, 844, 0x7f8f55);
  lawn(-235, -100, 1036, 1088, 0x8a9660); lawn(-235, -178, 896, 938, 0x84925a); lawn(-235, -174, 980, 1036, 0x8a9660);
  lawn(-86, -72, 800, 872, 0x7f8f55); lawn(-235, -140, 762, 790, 0x8a9660); lawn(-40, -7, 1004, 1006, 0x7a8a50);
  lawn(-12, -7, 972, 1004, 0x83935a); // front garden of the administration villa

  // ------------------------------------------------------------------ railway: main line + siding
  const track = buildTrack(pb, RZ);
  const wagonsZ = track.sidingZ;

  // ------------------------------------------------------------------ roof helpers (caps + fascia)
  const RC = (c) => new THREE.Color(c).multiplyScalar(0.72);
  const GR = (x0, x1, z0, z1, yE, h, axis, o, roofCol, wallCol, gTile = 'plain', opts = {}) => {
    gableRoof(rb, opts.noWalls ? null : wb, x0, x1, z0, z1, yE, h, axis, o, roofCol, wallCol, gTile, opts);
    gableCaps(rb, x0, x1, z0, z1, yE, h, axis, o, roofCol, opts.ends !== false);
  };
  const HR = (x0, x1, z0, z1, yE, h, o, roofCol) => { hipRoof(rb, x0, x1, z0, z1, yE, h, o, roofCol); hipCaps(rb, x0, x1, z0, z1, yE, h, o, roofCol); };

  // ------------------------------------------------------------------ buildings
  // --- north sector (right side of the photos)
  // garage / coachmen's house in the NE corner (far right of the 1911 elevation)
  wb.block(-26, -14, 772, 786, [0, 0.8, 3.8, 6.4], { all: (i, j) => (j === 0 ? 'plinth' : 'win'), e: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'gate' : 'win') }, OCHRE, 3.5);
  GR(-26, -14, 772, 786, 6.4, 5.2, 'x', 0.45, RED, OCHRE, 'gable');
  chimney(wb, -20, 779, 9, 3);
  // the big gabled house by the fence (gable to the road, photo 8 / 15) + lower wing
  wb.block(-32, -12, 846, 870, [0, 0.8, 4.4, 8, 11.4], { all: (i, j) => (j === 0 ? 'plinthWin' : 'win') }, T_HOUSE, 3.6);
  bands(wb, -32, -12, 846, 870, [4.4], T_HOUSE);
  GR(-32, -12, 846, 870, 11.4, 9.5, 'x', 0.45, SLATE, T_HOUSE, 'plain');
  // attic windows in both gables (photo 8: one double window high in the gable facing the road)
  for (const [x, sg] of [[-11.9, 1], [-32.1, -1]]) {
    for (const [zc, y0, hh, tl] of [[858, 13.0, 3.0, 'winPair'], [858, 17.2, 1.8, 'winSmall']]) {
      const hw = tl === 'winPair' ? 1.9 : 1.0, za = zc + sg * hw, zb = zc - sg * hw;
      wb.quad([x, y0, za], [x, y0, zb], [x, y0 + hh, zb], [x, y0 + hh, za], T_HOUSE, tl);
    }
  }
  wb.box(-12.3, -11.9, 11.0, 11.6, 845.6, 870.4, 'corniceHeavy', T_HOUSE);
  wb.box(-32.4, -11.6, 11.0, 11.6, 845.6, 846.0, 'corniceHeavy', T_HOUSE, { top: false });
  wb.box(-32.4, -11.6, 11.0, 11.6, 870.0, 870.4, 'corniceHeavy', T_HOUSE, { top: false });
  for (const side of ['n', 's']) dormerRow(wb, rb, { x0: -32, x1: -12, z0: 846, z1: 870 }, side, 11.4, 9.5 / 12, [6, 14], { wallCol: T_HOUSE, roofCol: SLATE });
  chimney(wb, -18, 858, 18, 4.4); chimney(wb, -27, 858, 18, 4.4);
  wb.block(-30, -14, 834, 846, [0, 0.8, 4.2, 6.6], { all: (i, j) => (j === 0 ? 'plinth' : 'win'), s: null }, CREAM2, 3.6);
  GR(-30, -14, 834, 846, 6.6, 3.8, 'x', 0.4, SLATE3, CREAM2, 'plain');
  // long storage block with the belfry-like vent turret (photos 8, 13, 15)
  const sb = (i, j) => (j === 0 ? 'plinthWin' : 'win');
  wb.block(-70, -48, 780, 872, [0, 1.2, 5.4, 9.4, 13.4, 17.4], { all: sb }, T_STORE, 3.6);
  wb.box(-70.45, -47.55, 17.0, 17.75, 779.55, 872.45, 'corniceHeavy', T_STORE);
  bands(wb, -70, -48, 780, 872, [5.4], T_STORE);
  pilasters(wb, -70, -48, 780, 872, 0, 17.0, T_STORE);
  HR(-70, -48, 780, 872, 17.6, 5.5, 0.5, SLATE);
  for (const side of ['e', 'w']) dormerRow(wb, rb, { x0: -70, x1: -48, z0: 780, z1: 872 }, side, 17.6 + 0.5 * 0.478, 0.478, [14, 26, 38, 50, 62, 74], { wallCol: T_STORE, roofCol: SLATE, d0: 1.0 });
  for (const z of [792, 822, 852]) chimney(wb, -59, z, 21, 3.4);
  ventTurret(wb, rb, -59, 864, T_STORE);
  // dark lattice cooling tower (photo 15, right of the chimney)
  wb.cyl(-40, 867, 0, 15.5, 5.7, 3.9, 4, 3, 'slats', 0xffffff, { rot: Math.PI / 4, smooth: false, cap: true });
  wb.box(-42, -38, 15.5, 17.0, 865, 869, 'slats', 0xcccccc);
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rb.beam([-40 + dx * 4.03, 0, 867 + dz * 4.03], [-40 + dx * 2.76, 15.6, 867 + dz * 2.76], 0.3, 0.3, 0x2a2622);
  // cooperage (Bednárna) and coach house (Kolna) north of the line
  wb.block(-200, -150, 852, 873, [0, 0.8, 5.2, 7.4], { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? (i % 3 === 1 ? 'loadDoor' : 'win') : 'winSmall') }, OCHRE, 4);
  GR(-200, -150, 852, 873, 7.4, 4.5, 'x', 0.4, SLATE3, OCHRE, 'gable');
  wb.block(-231, -206, 792, 872, [0, 6.2], { all: 'loadDoor', w: 'plain' }, CREAM2, 4.5);
  GR(-231, -206, 792, 872, 6.2, 4.2, 'z', 0.4, SLATE, CREAM2, 'plain');
  // malt house (Sladovna) — big block behind the wagons
  wb.block(-138, -90, 798, 862, [0, 1.2, 5.4, 9.6, 13.8, 18], { all: (i, j) => (j === 0 ? 'plinthWin' : 'malt') }, T_MALT, 4);
  wb.box(-138.45, -89.55, 17.6, 18.35, 797.55, 862.45, 'corniceHeavy', T_MALT);
  bands(wb, -138, -90, 798, 862, [5.4], T_MALT);
  pilasters(wb, -138, -90, 798, 862, 0, 17.6, T_MALT);
  HR(-138, -90, 798, 862, 18.2, 6, 0.5, SLATE2);
  for (const z of [815, 845]) {
    wb.box(-117, -111, 20, 26, z - 3, z + 3, 'louver', T_MALT);
    rb.cone(-114, z, 26, 3.4, 4.6, 4, SLATE2, null, Math.PI / 4, 'world', 2);
    pb.add(ballG, M4(-114, 29.6, z, 0, 0.25, 0.25, 0.25), 0x3c3a36);
  }

  // --- brewhouse row between the railway and the yard (z 884..922)
  // chimney: stone/brick plinth + tapered shaft, ~58 m, corbelled crown, iron bands
  const CH = [-42, 888];
  wb.block(CH[0] - 3.4, CH[0] + 3.4, CH[1] - 3.4, CH[1] + 3.4, [0, 1.4, 8.2], { all: (i, j) => (j === 0 ? 'plinth' : 'brickDark') }, 0xffffff, 3.4);
  wb.box(CH[0] - 3.8, CH[0] + 3.8, 8.2, 9.2, CH[1] - 3.8, CH[1] + 3.8, 'stone', 0xd6ccbc);
  wb.box(CH[0] - 3.55, CH[0] + 3.55, 6.9, 7.4, CH[1] - 3.55, CH[1] + 3.55, 'stone', 0xd6ccbc, { top: false, bottom: true });
  const shaftR = (y) => 2.75 + (1.72 - 2.75) * ((y - 9.2) / (54.6 - 9.2));
  wb.cyl(CH[0], CH[1], 9.2, 54.6, 2.75, 1.72, 18, 24, 'brickGrey', 0xf2ece4, { cap: false });
  wb.cyl(CH[0], CH[1], 54.6, 55.8, 1.72, 2.05, 18, 1, 'brickDark', 0xffffff, { cap: false });   // corbel flare
  wb.cyl(CH[0], CH[1], 55.8, 57.6, 2.05, 2.05, 18, 1, 'brickDark', 0xe8ddd0, { cap: false });
  wb.cyl(CH[0], CH[1], 57.6, 58.2, 2.16, 2.16, 18, 1, 'stone', 0xb8afa2, { cap: false });
  wb.cyl(CH[0], CH[1], 58.2, 58.6, 1.95, 1.85, 18, 1, 'dark', 0xffffff, { cap: true });
  for (let y = 14; y < 54; y += 6.5) { const r = shaftR(y) + 0.05; wb.cyl(CH[0], CH[1], y, y + 0.3, r, r, 18, 1, 'dark', 0xffffff, { cap: false }); }
  pb.add(boxG, M4(CH[0], 60.2, CH[1] + 1.5, 0, 0.06, 3.4, 0.06), 0x2d2a26);
  // boiler house (Kotelna) with a ridge lantern
  wb.block(-38, -22, 890, 918, [0, 1, 9, 11], { all: (i, j) => (j === 1 ? 'winTall' : j === 0 ? 'plinth' : 'plain') }, T_BOIL, 4);
  bands(wb, -38, -22, 890, 918, [9], T_BOIL, 0.25, 0.35, 'corniceHeavy');
  pilasters(wb, -38, -22, 890, 918, 0, 11, T_BOIL, 0.8, 0.18);
  GR(-38, -22, 890, 918, 11, 4.2, 'x', 0.4, SLATE, T_BOIL, 'winRound');
  wb.block(-36, -24, 902.4, 905.6, [14, 15.8], { all: 'slats' }, 0xffffff, 3);
  GR(-36, -24, 902.4, 905.6, 15.8, 1.0, 'x', 0.35, SLATE, null, 'plain', { noWalls: true });
  // machine room (Strojovna) with pedimented dormers (section 17/18)
  wb.block(-66, -46, 893, 919, [0, 1.2, 10.4, 12.4], { all: (i, j) => (j === 1 ? 'winTall' : j === 0 ? 'plinth' : 'corniceHeavy') }, T_MACH, 4);
  pilasters(wb, -66, -46, 893, 919, 0, 12.4, T_MACH, 0.8, 0.18);
  GR(-66, -46, 893, 919, 12.4, 5, 'x', 0.4, SLATE3, T_MACH, 'gable');
  for (const x of [-62, -58.5, -55, -51.5]) dormer(wb, rb, x, 918.0, 2.4, 12.6, 2.0, 2.6, T_MACH, SLATE3, 'winArch');
  // silo / pre-heaters (tall narrow)
  wb.block(-73, -66, 892, 920, [0, 1.2, 6, 10.5, 15, 19.5, 24, 25.5], { all: (i, j) => (j === 0 ? 'plinth' : j === 6 ? 'corniceHeavy' : i % 2 ? 'winSmall' : 'plain') }, CREAM2, 3.5);
  HR(-73, -66, 892, 920, 25.5, 1.5, 0.3, SLATE);
  wb.box(-71, -68, 25.5, 28, 902, 910, 'louver', CREAM2);
  HR(-71, -68, 902, 910, 28, 1.4, 0.3, SLATE);
  // brewhouse (Varna) + clock tower with a bell-cast spire
  const VX0 = -96, VX1 = -73, VZ0 = 890, VZ1 = 922;
  const T = { x0: -96.4, x1: -87.2, z0: 912.6, z1: 922.4 };
  wb.block(VX0, VX1, VZ0, VZ1, [0, 1.2, 5.6, 9.6, 13.6, 17.6, 21.4, 23.4], { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'rusticArch' : j === 6 ? 'corniceHeavy' : 'lesene') }, T_BREW, 4);
  bands(wb, VX0, VX1, VZ0, VZ1, [5.6], T_BREW, 0.22, 0.4);
  wb.box(VX0 - 0.5, VX1 + 0.5, 23.0, 23.6, VZ0 - 0.5, VZ1 + 0.5, 'stone', STONE, { bottom: true });
  pilasters(wb, VX0, VX1, VZ0, VZ1, 1.2, 23.0, T_BREW, 1.0, 0.25);
  // attic parapet with pinnacles over the main cornice (elevation 12, photo 9); the roof sits behind it
  ring(wb, VX0, VX1, VZ0, VZ1, 23.6, 24.5, 0.15, 0.3, 'stone', T_BREW);
  ring(wb, VX0, VX1, VZ0, VZ1, 24.5, 24.7, 0.25, 0.5, 'stone', STONE);
  for (const [ax, az, bx, bz] of [[VX0, VZ0, VX1, VZ0], [VX1, VZ0, VX1, VZ1], [VX1, VZ1, VX0, VZ1], [VX0, VZ1, VX0, VZ0]]) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 2.9);
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      if (x < T.x1 + 0.3 && z > T.z0 - 0.3) continue; // inside the clock tower
      wb.box(x - 0.24, x + 0.24, 24.7, 25.5, z - 0.24, z + 0.24, 'stone', STONE);
      pb.add(ballG, M4(x, 25.72, z, 0, 0.22, 0.22, 0.22), 0xd2c8b4);
    }
  }
  HR(VX0, VX1, VZ0, VZ1, 23.6, 4.5, -0.3, SLATE2);
  dormerRow(wb, rb, { x0: VX0, x1: VX1, z0: VZ0, z1: VZ1 }, 'e', 23.6 - 0.3 * 0.4, 0.4, [8, 14, 20], { wallCol: T_BREW, roofCol: SLATE2, d0: 1.3, w: 1.4, hw: 1.3 });
  // vapour stacks of the two brew kettles (section 17): slim iron pipes through the roof, conical hats
  const STACKS = [[-80, 899], [-80, 906]];
  for (const [x, z] of STACKS) {
    pb.add(cylG, M4(x, 31, z, 0, 0.45, 13, 0.45), 0x3a3733);
    pb.add(cylG, M4(x, 26.3, z, 0, 0.62, 0.5, 0.62), 0x2e2b28);
    pb.add(coneG, M4(x, 38.1, z, 0, 1.0, 0.7, 1.0), 0x2e2b28);
    for (const k of [0, 1, 2]) { const ang = (k / 3) * Math.PI * 2; pb.add(boxG, M4(x + Math.sin(ang) * 0.55, 37.6, z + Math.cos(ang) * 0.55, ang, 0.06, 0.6, 0.06), 0x2e2b28); }
  }
  const tcx = (T.x0 + T.x1) / 2, tcz = (T.z0 + T.z1) / 2;
  wb.block(T.x0, T.x1, T.z0, T.z1, [23.6, 28.0, 32.4, 34.0], { all: (i, j) => (j === 0 ? 'arcadeWin' : j === 1 ? 'plain' : 'corniceHeavy') }, T_BREW, 9.2, 'plain');
  bands(wb, T.x0, T.x1, T.z0, T.z1, [28.0], T_BREW, 0.2, 0.35);
  wb.box(T.x0 - 0.5, T.x1 + 0.5, 34.0, 34.6, T.z0 - 0.5, T.z1 + 0.5, 'stone', STONE, { bottom: true });
  pilasters(wb, T.x0, T.x1, T.z0, T.z1, 23.6, 34.0, T_BREW, 0.9, 0.22);
  // clock dials on all four faces (square quads so the dial stays round)
  const CD = 1.75, CY = 30.2;
  wb.quad([T.x1 + 0.1, CY - CD, tcz + CD], [T.x1 + 0.1, CY - CD, tcz - CD], [T.x1 + 0.1, CY + CD, tcz - CD], [T.x1 + 0.1, CY + CD, tcz + CD], T_BREW, 'clockFace');
  wb.quad([T.x0 - 0.1, CY - CD, tcz - CD], [T.x0 - 0.1, CY - CD, tcz + CD], [T.x0 - 0.1, CY + CD, tcz + CD], [T.x0 - 0.1, CY + CD, tcz - CD], T_BREW, 'clockFace');
  wb.quad([tcx - CD, CY - CD, T.z1 + 0.1], [tcx + CD, CY - CD, T.z1 + 0.1], [tcx + CD, CY + CD, T.z1 + 0.1], [tcx - CD, CY + CD, T.z1 + 0.1], T_BREW, 'clockFace');
  wb.quad([tcx + CD, CY - CD, T.z0 - 0.1], [tcx - CD, CY - CD, T.z0 - 0.1], [tcx - CD, CY + CD, T.z0 - 0.1], [tcx + CD, CY + CD, T.z0 - 0.1], T_BREW, 'clockFace');
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = tcx + dx * 4.4, pz = tcz + dz * 4.6;
    wb.cyl(px, pz, 34.6, 36.8, 0.5, 0.45, 6, 1, 'louver', T_BREW, { smooth: false });
    rb.cone(px, pz, 36.8, 2.4, 0.72, 6, SLATE2, null, 0, 'world', 2);
    pb.add(ballG, M4(px, 39.3, pz, 0, 0.12, 0.12, 0.12), 0xc9a64e);
  }
  // bell-cast square spire (photo 9): flared kick, steep body, lantern, small cap, gilt ball + needle
  spire(rb, tcx, tcz, [[34.6, 5.37], [35.4, 5.0], [40.5, 2.6], [43.4, 1.15]], 4, SLATE2, Math.PI / 4);
  for (const [nx, nz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    // small clock-dormers on the spire faces
    const dx = tcx + nx * 3.9, dz = tcz + nz * 3.9;
    wb.at(dx, dz, Math.atan2(nx, nz)); rb.at(dx, dz, Math.atan2(nx, nz));
    dormer(wb, rb, 0, 0, 1.5, 35.6, 1.5, 2.0, T_BREW, SLATE2, 'winRound');
    wb.reset(); rb.reset();
  }
  wb.cyl(tcx, tcz, 43.4, 45.0, 0.75, 0.7, 8, 1, 'louver', T_BREW, { smooth: false });
  wb.cyl(tcx, tcz, 45.0, 45.3, 0.92, 0.92, 8, 1, 'stone', STONE, { smooth: false });
  spire(rb, tcx, tcz, [[45.3, 0.95], [46.1, 0.62], [47.6, 0.0]], 8, SLATE2, 0);
  pb.add(ballG, M4(tcx, 47.9, tcz, 0, 0.26, 0.26, 0.26), 0xc9a64e);
  pb.add(boxG, M4(tcx, 49.2, tcz, 0, 0.07, 2.6, 0.07), 0x2d2a26);
  pb.add(boxG, M4(tcx, 49.4, tcz, Math.PI / 4, 0.9, 0.05, 0.05), 0x2d2a26);

  // --- south sector (left side of the photos)
  // tall cellar tower ("věž sklepů", 7 storeys + mansard) — elevation 12, photos 3, 13
  const CT = { x0: -82, x1: -64, z0: 978, z1: 996 };
  wb.block(CT.x0, CT.x1, CT.z0, CT.z1, [0, 1.2, 5.6, 9.8, 14, 18.2, 22.4, 26.6, 29.6, 30.6],
    { all: (i, j) => (j === 0 ? 'plinthWin' : j === 1 ? 'rustic' : j === 9 - 1 ? 'corniceHeavy' : j >= 6 ? 'winArch' : 'winPair') }, T_TOWER, 4.5);
  bands(wb, CT.x0, CT.x1, CT.z0, CT.z1, [5.6, 22.4], T_TOWER, 0.22, 0.4);
  pilasters(wb, CT.x0, CT.x1, CT.z0, CT.z1, 1.2, 30.2, T_TOWER, 1.1, 0.25);
  wb.box(CT.x0 - 0.55, CT.x1 + 0.55, 30.2, 31.0, CT.z0 - 0.55, CT.z1 + 0.55, 'stone', STONE, { bottom: true });
  mansardRoof(rb, CT.x0, CT.x1, CT.z0, CT.z1, 31.0, 3.8, 1.5, 2.6, 0.3, SLATE3);
  mansardCaps(rb, CT.x0, CT.x1, CT.z0, CT.z1, 31.0, 3.8, 1.5, 2.6, 0.3, SLATE3);
  for (const [fx, fz, rot] of [[CT.x1, CT.z1, Math.PI / 2], [CT.x0, CT.z1, 0], [CT.x0, CT.z0, -Math.PI / 2], [CT.x1, CT.z0, Math.PI]]) {
    wb.at(fx, fz, rot); rb.at(fx, fz, rot);
    for (const lx of [4.5, 9, 13.5]) dormer(wb, rb, lx, 0.15, lx === 9 ? 2.8 : 2.2, 31.25, lx === 9 ? 2.2 : 1.9, 2.0, T_TOWER, SLATE3, 'dormerWin');
  }
  wb.reset(); rb.reset();
  wb.cyl(-73, 987, 37.4, 39.4, 1.3, 1.2, 8, 1, 'louver', T_TOWER, { smooth: false });
  spire(rb, -73, 987, [[39.4, 1.65], [40.2, 1.2], [42.2, 0]], 8, SLATE3, 0);
  pb.add(ballG, M4(-73, 42.4, 987, 0, 0.2, 0.2, 0.2), 0xc9a64e);
  for (const [x, z] of [[-66, 980], [-80, 994], [-80, 980], [-66, 994]]) chimney(wb, x, z, 33, 4.2);
  // long cellar block (Sklepy) with the raised cooling-ship hall and its ventilating lantern (section 17)
  wb.block(-170, -82, 980, 1030, [0, 1.2, 5.8, 10.2, 14.6], { all: (i, j) => (j === 0 ? 'plinthWin' : 'malt') }, T_CELLAR, 4);
  wb.box(-170.45, -81.55, 14.2, 14.95, 979.55, 1030.45, 'corniceHeavy', T_CELLAR);
  bands(wb, -170, -82, 980, 1030, [5.8], T_CELLAR);
  GR(-170, -82, 980, 1030, 14.8, 5.5, 'x', 0.5, SLATE, T_CELLAR, 'plain');
  for (const x of [-165, -158, -95, -88]) for (const z of [990, 1020]) chimney(wb, x, z, 15.6, 3.2); // vent stacks on the cellar roofs (photo 3)
  wb.block(-150, -102, 995, 1015, [16, 21.5], { all: 'arcadeWin' }, T_CELLAR, 4);
  GR(-150, -102, 995, 1015, 21.5, 3.6, 'x', 0.4, SLATE2, T_CELLAR, 'winRound');
  wb.block(-144, -108, 1003.4, 1006.6, [24.6, 26.4], { all: 'louver' }, T_CELLAR, 3);
  GR(-144, -108, 1003.4, 1006.6, 26.4, 1.0, 'x', 0.3, SLATE2, T_CELLAR, 'plain');
  // expedition / bottling (Stáčení piva) with the loading ramp — frames the end of the drive
  stacheni(wb, rb, pb);
  // fire station + washing hall (Požárna a umývárna) with a hose tower
  wb.block(-176, -140, 938, 972, [0, 0.8, 4.8, 8.4], { all: (i, j) => (j === 0 ? 'plinth' : j === 1 ? (i % 2 ? 'loadDoor' : 'win') : 'winSmall') }, OCHRE, 4);
  GR(-176, -140, 938, 972, 8.4, 5, 'x', 0.4, RED2, OCHRE, 'gable');
  wb.block(-174, -169, 932, 937.5, [0, 4, 8, 12, 16.5], { all: (i, j) => (j === 0 ? 'gate' : 'winSmall') }, OCHRE, 5);
  rb.cone(-171.5, 934.75, 16.5, 4.2, 4.2, 4, RED2, null, Math.PI / 4, 'world', 2);
  // sheds (cooperage stores)
  wb.block(-228, -182, 942, 976, [0, 6.5], { all: 'loadDoor', w: 'plain', n: 'plain' }, CREAM2, 4.6);
  GR(-228, -182, 942, 976, 6.5, 4, 'x', 0.4, SLATE, CREAM2, 'plain');

  // administration villa (big, by the gate) — facade to the road (east)
  adminVilla(wb, rb, pb, -14, 1004);
  smallVilla(wb, rb, -16, 1042);

  // coal heaps by the boiler house and at the siding (photos 9, 16)
  heap(pb, -15, 889, 3.6, 2.2, 0x2f2c29); heap(pb, -19.5, 887.5, 2.2, 1.4, 0x34302c);
  heap(pb, -120, 891.5, 3.0, 1.8, 0x34312d);

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
  // villa garden (photos 4, 11): a big lime in front of the villa, columnar poplars along the fence, shrubs
  addTree(pb, -9.4, 989, 1.15, R);
  for (const z of [976, 1001, 1017, 1032, 1055, 1069]) poplar(pb, -8.4, z, R);
  for (const [x, z] of [[-11.5, 980], [-11.8, 996], [-10.8, 1040], [-12.5, 1046], [-36.5, 1012], [-38, 1030], [-34, 1048]]) shrub(pb, x, z, R);
  for (const [x, z] of [[-20, 966], [-48, 967], [-28, 934], [-62, 933], [-92, 932], [-120, 930]]) addLamp(pb, x, z, 4.6);

  finishMarks(pb, a.finish);
  const barrels = [];
  rampBarrels(barrels);
  for (const [bx, bz] of [[-150, 892], [-162, 893], [-176, 892]]) barrelPile(barrels, bx, bz, 4, 0);
  barrelPile(barrels, -46, 926, 4, Math.PI / 2);
  barrelPile(barrels, -132, 931, 3, 0);
  barrelPile(barrels, -105, 930, 5, Math.PI / 2);
  // crates + carts
  for (let i = 0; i < 10; i++) pb.add(boxG, M4(-143 + R() * 6, 0.35, 930 + R() * 5, R() * 0.4, 0.8, 0.7, 0.8), i % 2 ? 0x8a6a46 : 0x9a7b55);
  handCart(pb, -96.5, 976.5, 0.4);
  handCart(pb, -170, 893.8, 1.6);

  // flagpoles (static) — the flags themselves are one instanced dynamic mesh
  const FLAGS = [{ x: -95.6, z: 975, top: 11, s: 1 }, { x: -18, z: 989, top: 25.5, s: 1.25 }];
  for (const f of FLAGS) {
    const y0 = f.top > 12 ? 17.6 : 0;
    pb.add(cylG, M4(f.x, (y0 + f.top) / 2, f.z, 0, 0.07 * f.s, f.top - y0, 0.07 * f.s), 0xe8e2d6);
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
  const wagons = wagonMesh(kit, wagonsZ);
  add(wagons);
  const barrelInst = barrelMesh(kit, barrels);
  add(barrelInst);

  // coal smoke from the chimney: dark, drifting west-south-west so it streams sideways across the sky in
  // both the aerial (from SE) and the field / crane menu shots (from NE)
  const smoke = createSmoke(kit, camera, [CH[0], 58.9, CH[1]], { count: 34, rise: 9, drift: [-34, 0, 10], size: [4.0, 22], alpha: 0.42, period: 17, material: kit.mats.smokeDark, spread: 2.0 });
  smoke.mesh.name = 'svetovar-smoke';
  group.add(smoke.mesh);
  // white steam from the brewhouse vapour stacks (photo 3)
  const steam = STACKS.map(([x, z], i) => {
    const st = createSmoke(kit, camera, [x, 38.6, z], { count: 10, rise: 10, drift: [-16, 0, 5], size: [2.0, 10], alpha: 0.95, period: 8 + i * 1.3, spread: 1.5 });
    st.mesh.name = 'svetovar-steam'; group.add(st.mesh); return st;
  });
  // Czechoslovak flags (ramp + administration villa)
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
  ctx.landmarks.svetovar = { group, triangles, drawCalls: group.children.length };
  return {};
}

const boxG = new THREE.BoxGeometry(1, 1, 1);
const ballG = new THREE.SphereGeometry(1, 8, 6);
const cylG = new THREE.CylinderGeometry(1, 1, 1, 10);
const coneG = new THREE.ConeGeometry(1, 1, 10);

function chimney(wb, x, z, y0, h) {
  wb.box(x - 0.45, x + 0.45, y0, y0 + h, z - 0.45, z + 0.45, 'brick', 0xd8c8b8);
  wb.box(x - 0.58, x + 0.58, y0 + h, y0 + h + 0.28, z - 0.58, z + 0.58, 'stone', 0xd0c4b0);
  wb.box(x - 0.3, x + 0.3, y0 + h + 0.28, y0 + h + 0.5, z - 0.3, z + 0.3, 'dark', 0xffffff);
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
/** A row of dormers on one roof slope of the footprint fp. yW = roof height at the wall line, slope = rise per metre inward.
 *  xs = positions along the face measured from its start (s face: from x0, e: from z1, n: from x1, w: from z0). */
function dormerRow(wb, rb, fp, side, yW, slope, xs, { w = 1.6, hw = 1.5, d0 = 1.2, tile = 'dormerWin', wallCol = CREAM, roofCol = SLATE } = {}) {
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
/** Ventilation turret on the storage-block ridge (photos 8, 15): square base, louvred drum, onion cap. */
function ventTurret(wb, rb, x, z, col) {
  wb.box(x - 2.2, x + 2.2, 19, 22.5, z - 2.2, z + 2.2, 'plain', col);
  wb.box(x - 2.4, x + 2.4, 22.3, 22.7, z - 2.4, z + 2.4, 'stone', STONE);
  wb.cyl(x, z, 22.7, 29.8, 1.85, 1.7, 10, 2, 'louver', col, { cap: false });
  wb.cyl(x, z, 29.8, 30.6, 2.25, 2.25, 10, 1, 'stone', STONE);
  spire(rb, x, z, [[30.6, 2.35], [31.5, 2.5], [32.6, 1.7], [33.5, 0.55], [34.7, 0.18], [35.3, 0]], 10, SLATE, 0);
  rb.add(ballG, M4(x, 35.4, z, 0, 0.26, 0.26, 0.26), 0xc9a64e);
  rb.add(boxG, M4(x, 36.4, z, 0, 0.07, 2.0, 0.07), 0x3a3632);
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
  const OX = -100, OZ = 972, W = 36, D = 40, C = T_EXP;
  wb.at(OX, OZ, Math.PI / 2); rb.at(OX, OZ, Math.PI / 2); pb.at(OX, OZ, Math.PI / 2);
  const ys = [0, 1.2, 5.2, 8.8];
  wb.wall(0, 0, W, 0, ys, 10, (i, j) => (j === 0 ? 'plinth' : j === 1 ? (i % 2 === 0 ? 'loadDoor' : 'win') : 'winSmall'), C);
  wb.wall(W, 0, W, -D, ys, 10, (i, j) => (j === 0 ? 'plinth' : 'win'), C);
  wb.wall(0, -D, 0, 0, ys, 10, (i, j) => (j === 0 ? 'plinth' : 'win'), C);
  wb.wall(W, -D, 0, -D, [0, 8.8], 4, 'plain', C);
  wb.box(-0.3, W + 0.3, 8.4, 9.1, -0.3, 0.45, 'corniceHeavy', C, { sides: 'sew' });
  pilasters(wb, 0, W, -D, 0, 1.2, 8.4, C, 0.8, 0.18);
  gableRoof(rb, wb, 0, W, -D, 0, 9.0, 6, 'x', 0.4, SLATE, C, 'gable');
  gableCaps(rb, 0, W, -D, 0, 9.0, 6, 'x', 0.4, SLATE);
  addGable(wb, W / 2, 9.0, 0.2, 13, 6.8, 'volute', C, 'gable');
  pb.add(ballG, M4(W / 2, 16.2, 0.1, 0, 0.22, 0.22, 0.22), 0xc9a64e);
  // loading ramp + canopy
  wb.box(1, W - 1, 0, 1.1, 0, 3.2, 'plinth', 0xd8d0c0);
  rb.poly([[0.5, 4.5, 3.7], [W - 0.5, 4.5, 3.7], [W - 0.5, 5.15, 0.05], [0.5, 5.15, 0.05]], SLATE, null, 'world');
  rb.beam([0.5, 4.42, 3.72], [W - 0.5, 4.42, 3.72], 0.1, 0.22, FASCIA);
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

function adminVilla(wb, rb, pb, ox, oz) {
  // local frame: facade at x = ox facing east, local x runs from z = oz northwards (decreasing z)
  const W = 30, D = 20, C = VILLA;
  wb.at(ox, oz, Math.PI / 2); rb.at(ox, oz, Math.PI / 2); pb.at(ox, oz, Math.PI / 2);
  const ys = [0, 1.0, 4.8, 8.4, 11.6];
  const t = (i, j) => (j === 0 ? 'plinthWin' : j === 1 ? 'rustic' : j === 2 ? 'villaWin' : 'winOrn');
  wb.wall(0, 0, W, 0, ys, 9, t, C);
  wb.wall(W, 0, W, -D, ys, 6, t, C);
  wb.wall(0, -D, 0, 0, ys, 6, t, C);
  wb.wall(W, -D, 0, -D, ys, 9, t, C);
  wb.box(-0.35, W + 0.35, 11.2, 11.9, -D - 0.35, 0.5, 'corniceHeavy', C, { sides: 'nsew' });
  bands(wb, 0, W, -D, 0, [4.8], C, 0.16, 0.3);
  pilasters(wb, 0, W, -D, 0, 1.0, 11.2, C, 0.9, 0.2);
  hipRoof(rb, 0, W, -D, 0, 11.8, 7, 0.6, RED);
  hipCaps(rb, 0, W, -D, 0, 11.8, 7, 0.6, RED);
  // central risalit with a baroque gable + balcony
  wb.block(10, 20, 0, 1.4, ys, { s: (i, j) => (j === 0 ? 'plinth' : j === 1 ? 'door' : j === 2 ? 'winTriple' : t(i, j)), e: 'plain', w: 'plain', n: null }, C, 3.4);
  wb.box(9.8, 20.2, 11.2, 11.9, 0, 1.8, 'corniceHeavy', C);
  pilasters(wb, 10, 20, 0.2, 1.4, 1.0, 11.2, C, 0.7, 0.15);
  addGable(wb, 15, 11.9, 1.55, 10.4, 7.2, 'volute', C, 'gable');
  gableRoof(rb, null, 10, 20, -6, 1.4, 11.9, 6.4, 'z', 0.05, RED, C, 'plain', { ends: false });
  gableCaps(rb, 10, 20, -6, 1.4, 11.9, 6.4, 'z', 0.05, RED, false);
  wb.box(11.5, 18.5, 4.6, 4.9, 1.4, 2.6, 'stone', 0xd8d0c0);
  for (let x = 11.7; x <= 18.4; x += 0.55) pb.add(boxG, M4(x, 5.35, 2.5, 0, 0.06, 0.9, 0.06), 0x34312c); // balcony railing
  pb.add(boxG, M4(15, 5.8, 2.5, 0, 7.0, 0.07, 0.07), 0x34312c);
  pb.add(ballG, M4(15, 19.6, 1.55, 0, 0.2, 0.2, 0.2), 0xc9a64e);
  // side gable (south end)
  addGable(wb, 4.5, 11.9, 0.3, 7, 5.2, 'triangle', C, 'gable');
  gableRoof(rb, null, 1, 8, -6, 0.3, 11.9, 4.8, 'z', 0.05, RED, C, 'plain', { ends: false });
  gableCaps(rb, 1, 8, -6, 0.3, 11.9, 4.8, 'z', 0.05, RED, false);
  for (const [x, z] of [[3, -10], [12, -14], [22, -6], [27, -12]]) chimney(wb, x, z, 14, 5.8);
  // finials at the ridge ends
  for (const x of [10, 20]) pb.add(cylG, M4(x, 19.6, -10, 0, 0.05, 1.6, 0.05), 0x34312c);
  wb.reset(); rb.reset(); pb.reset();
  // dormers (world-space footprint x -34..-14, z 974..1004; hip slope 7 / 10.6)
  const fp = { x0: ox - D, x1: ox, z0: oz - W, z1: oz }, yW = 11.8 + 0.6 * 0.66, o = { wallCol: C, roofCol: RED, w: 1.4, hw: 1.5, d0: 1.3, tile: 'dormerWin' };
  dormerRow(wb, rb, fp, 'e', yW, 0.66, [23], o);
  dormerRow(wb, rb, fp, 'w', yW, 0.66, [9, 15, 21], o);
  dormerRow(wb, rb, fp, 'n', yW, 0.66, [10], o);
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
  wb.box(-0.3, W + 0.3, 7.8, 8.4, -D - 0.3, 0.4, 'corniceHeavy', C, { sides: 'nsew' });
  pilasters(wb, 0, W, -D, 0, 0.9, 7.8, C, 0.7, 0.15);
  hipRoof(rb, 0, W, -D, 0, 8.3, 6.4, 0.6, RED2);
  hipCaps(rb, 0, W, -D, 0, 8.3, 6.4, 0.6, RED2);
  addGable(wb, 8, 8.3, 0.25, 8, 6.4, 'triangle', C, 'gable');
  gableRoof(rb, null, 4, 12, -6, 0.25, 8.3, 5.6, 'z', 0.05, RED2, C, 'plain', { ends: false });
  gableCaps(rb, 4, 12, -6, 0.25, 8.3, 5.6, 'z', 0.05, RED2, false);
  chimney(wb, 15, -7, 11, 5); chimney(wb, 5, -9, 10, 5);
  wb.reset(); rb.reset();
  dormerRow(wb, rb, { x0: ox - D, x1: ox, z0: oz - W, z1: oz }, 'e', 8.3 + 0.6 * 0.84, 0.84, [17], { wallCol: C, roofCol: RED2, w: 1.3, hw: 1.3, d0: 1.0 });
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
