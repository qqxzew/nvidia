// Where each level happens in the real Světovar (Český plzeňský pivovar, Bory, 1910–13 — today TechTower).
// Owner: lead. Pure data, no three.js, so node scripts can import it.
//
// All coordinates are in the LEVEL-1 WORLD (src/world/svetovar.js): meters, X = east, Z = south, Y = up,
// ground y = 0. They come from the archive drawings in docs/reference/:
//   19.jpg  site plan 13 Nov 1912 (footprints, ≈ 0.22–0.30 m per plan pixel, calibrated in svetovar.js)
//   17/18   sections 1:250 (floor heights, kettle hall, cellar tower, cellars with the cooling floor "štoky")
//   12.webp street elevation 1911 (heights: Varna parapet ≈ 16 m, cellar tower ≈ 28.5 m, chimney ≈ 48 m)
// The drawings contain no floor plans of the individual storeys: partitions inside a floor are not known.
// Where the game needs one (e.g. a gallery), it is an informed guess and marked "guess" below.

/** Buildings (footprint x0..x1 / z0..z1, floor levels = walking surfaces in m above ground). */
export const BUILDINGS = {
  varna: {
    name: 'Varna', x0: -160, x1: -141, z0: 895, z1: 915,
    floors: { prizemi: 1.2, p1: 4.8, p2: 8.0, p3: 11.2, p4: 14.4, roof: 15.8 },
    // the two brew kettles (rmutovací + mladinová pánev) stand in the double-height kettle hall
    // (přízemí + 1st floor); their vapour stacks rise through the roof at these XZ points
    kettles: [[-147.1, 901], [-147.1, 908.5]],
    kettleRadius: 2.1,
  },
  clockTower: { name: 'Hodinová věž', x0: -161, x1: -153.6, z0: 907.8, z1: 915.6 },
  // covered bridge from the Varna (clock tower) over the yard tracks to the cellar-tower staircase
  // halfWidth: the level-1 exterior draws 1.2 m; level 4 needs room for 3 lanes (real width unknown, photos suggest ~3 m)
  bridge: { name: 'Krytý most', x: -159, halfWidth: 1.5, z0: 915.6, z1: 936.4, floor: 8.2, ceiling: 10.8 },
  cellarStair: { name: 'Schodiště věže sklepů', x0: -165, x1: -157, z0: 936.4, z1: 942 },
  cellarTower: {
    name: 'Věž sklepů', x0: -166, x1: -156, z0: 942, z1: 960,
    floors: [1.2, 5.4, 9.4, 13.2, 17.0, 21.0],
  },
  // lager cellars: lower + upper cellar storeys, the cooling floor ("chladicí štok", coolers on legs)
  // under the roof with a louvred ridge lantern (x -187..-182)
  cellars: {
    name: 'Ležácké sklepy', x0: -203, x1: -166, z0: 941, z1: 989,
    floors: { lower: 1.2, upper: 7.6, coolingFloor: 13.6, eaves: 15.0 },
    lantern: { x0: -187, x1: -182, z0: 945, z1: 985 },
  },
  bottling: { name: 'Stáčírna a umývárna sudů', x0: -156, x1: -98, z0: 938, z1: 977, height: 7.0 },
  yardTracks: { z: [921, 930] },
};

/** Map pins + highlighted volumes for the main-menu map (one entry per level). */
export const LEVEL_SITES = [
  {
    id: 1, building: 'yard',
    // the drive ends in the yard at the bottling-hall ramp (level-1 route anchors.finish ≈ (-76, 951));
    // the map draws the last part of the level-1 route from the gate
    pin: { x: -60, y: 6, z: 950 },
    volumes: [],
    route: 'level1',
  },
  {
    id: 2, building: 'cellars', where: 'Spodní ležácké sklepy',
    pin: { x: -192, y: 6, z: 978 },
    volumes: [{ x0: -203, x1: -166, z0: 941, z1: 989, y0: 0, y1: 7.6 }],
  },
  {
    id: 3, building: 'varna', where: 'Přízemí varny (dnešní TechTower)',
    pin: { x: -150.5, y: 7, z: 905 },
    volumes: [{ x0: -160, x1: -141, z0: 895, z1: 915, y0: 1.2, y1: 4.8 }],
  },
  {
    id: 4, building: 'varna', where: 'Varna 2. patro → krytý most → věž sklepů → chladicí štok',
    pin: { x: -161, y: 27, z: 951 },   // above the cellar tower: keeps clear of the level-3 pin on the Varna
    volumes: [
      { x0: -160, x1: -141, z0: 895, z1: 915, y0: 8.0, y1: 11.2 },
      { x0: -160.2, x1: -157.8, z0: 915.6, z1: 936.4, y0: 8.2, y1: 10.8 },
      { x0: -166, x1: -156, z0: 936.4, z1: 960, y0: 8.2, y1: 13.2 },
      { x0: -203, x1: -166, z0: 941, z1: 989, y0: 13.6, y1: 15.0 },
    ],
    route: 'level4',
  },
  {
    id: 5, building: 'bottling', where: 'Stáčírna piva a umývárna sudů',
    pin: { x: -127, y: 10, z: 957.5 },
    volumes: [{ x0: -156, x1: -98, z0: 938, z1: 977, y0: 0, y1: 7.0 }],
  },
];

/**
 * Level 4 route through the real buildings (world XZ corners of the catwalk centre line).
 * Varna 2nd floor (gallery around the open kettle hall — guess) → clock tower → covered bridge →
 * cellar-tower staircase + tower → stairs up into the cellars' cooling floor → serpentine between the coolers.
 */
export const LEVEL4_ROUTE = {
  points: [
    [-143.2, 897.4],   // start: NE corner of the Varna, 2nd floor, running west along the north wall
    [-157.8, 897.4],
    [-157.8, 904.75],  // between the two kettles (z 901 / 908.5)
    [-143.2, 904.75],
    [-143.2, 912.6],
    [-159.0, 912.6],   // through the clock tower (SW corner) …
    [-159.0, 955.0],   // … over the covered bridge, through the staircase and the cellar tower
    [-198.0, 955.0],   // west: stairs up into the cooling floor of the cellars, then along the coolers
    [-198.0, 968.0],
    [-171.0, 968.0],
    [-171.0, 981.0],
    [-196.0, 981.0],   // finish: main valve platform at the west end
  ],
  radius: 2.6,
  // walking-surface height: piecewise linear between knots given as world XZ points (projected onto the path)
  elevation: [
    { x: -143.2, z: 897.4, y: 8.2 },
    { x: -162.6, z: 955.0, y: 8.2 },   // top of the cellar-tower floor
    { x: -171.6, z: 955.0, y: 13.6 },  // stairs through the tower/cellar wall (x -166) up to the cooling floor
    { x: -196.0, z: 981.0, y: 13.6 },
  ],
  // named stretches, given by the world point where each one begins (projected onto the path)
  sections: [
    { id: 'varna', at: [-143.2, 897.4], name: 'Varna, galerie nad pánvemi' },
    { id: 'tower', at: [-153.6, 912.6], name: 'Hodinová věž' },
    { id: 'bridge', at: [-159.0, 915.6], name: 'Krytý most nad vlečkou' },
    { id: 'cellarTower', at: [-159.0, 936.4], name: 'Věž sklepů' },
    { id: 'cool', at: [-166.0, 955.0], name: 'Chladicí štok' },
  ],
};

/** Level 4 builds its scene in local coordinates: local = world − L4_ORIGIN (Y unchanged). */
export const L4_ORIGIN = { x: -170, z: 940 };
export const toL4 = ([x, z]) => [x - L4_ORIGIN.x, z - L4_ORIGIN.z];
