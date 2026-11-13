// Level 2 "Válení sudů ve sklepě" — the cellar plan. OWNED BY THE LEAD. Read-only for everybody else.
// Single source of truth for the world builder (cellar.js) and the gameplay (level2.js & co).
//
// Units meters, Y up, X = east, Z = south, floor y = 0. yaw 0 faces +Z, heading = (sin yaw, cos yaw).
//
// Walkable space = union of WALK rects minus BLOCK rects, rasterised on a 0.5 m grid.
// Collision walls are the boundary edges of that grid, merged into long axis-aligned segments (WALLS).
// So: everything outside walkable cells is solid. Visual walls / casks / pillars must sit exactly on
// those boundaries (all rect coordinates are multiples of 0.5).

export const CELL = 0.5;
const GX0 = -12, GX1 = 12, GZ0 = -10, GZ1 = 35; // grid bounds
const NX = Math.round((GX1 - GX0) / CELL), NZ = Math.round((GZ1 - GZ0) / CELL);

// --- rooms --------------------------------------------------------------------------------------
// ceil = vault crown height, spring = height where the vault starts curving (walls are straight below)
export const ROOMS = [
  { id: 'hall',    kind: 'hall',    x0: -6,  x1: 6,    z0: -8, z1: 0,  ceil: 4.8, spring: 3.0 }, // expedice u výtahu
  { id: 'gallery', kind: 'gallery', x0: -2.5, x1: 2.5, z0: 0,  z1: 34, ceil: 4.2, spring: 2.4, axis: 'z' },
  { id: 'bayE1',   kind: 'bay', side: 1,  x0: 2.5,  x1: 11,  z0: 5,  z1: 8,  ceil: 3.4, spring: 2.0, axis: 'x' },
  { id: 'bayW1',   kind: 'bay', side: -1, x0: -11,  x1: -2.5, z0: 11, z1: 14, ceil: 3.4, spring: 2.0, axis: 'x' },
  { id: 'bayE2',   kind: 'bay', side: 1,  x0: 2.5,  x1: 11,  z0: 17, z1: 20, ceil: 3.4, spring: 2.0, axis: 'x' },
  { id: 'bayW2',   kind: 'bay', side: -1, x0: -11,  x1: -2.5, z0: 23, z1: 26, ceil: 3.4, spring: 2.0, axis: 'x' },
];
// Bays: the 3 m walkable aisle is lined on both sides by big lager casks lying on wooden beams
// (cask heads face the aisle, cask front exactly at the aisle edge z0 / z1). Bay outer walls are at
// z0 - 2.5 and z1 + 2.5, and the bay vaults spring at 2.4 m from those outer walls so they clear the
// cask tops (ROOMS.spring is the aisle value). The back wall of each bay is at x = ±11.
// ceilAt() ignores the vault curve: within ~0.7 m of a gallery wall the vault is lower than it returns.

// Loading dock along the hall's north wall: raised stone ledge (not walkable), delivered barrels stand on it.
export const DOCK = { x0: -6, x1: 6, z0: -9.5, z1: -8, height: 0.35 };
// The lift shaft (výtah do stáčírny) behind the dock, in the north wall: visual only.
export const LIFT = { x: 0, z: -9.5, width: 3, height: 3.4 };

// Solid things standing inside the rooms (not walkable). kind tells the builder what to draw.
export const BLOCKS = [
  { kind: 'pillar', x0: -3.5, x1: -2.5, z0: -4.5, z1: -3.5 },
  { kind: 'pillar', x0: 2.5,  x1: 3.5,  z0: -4.5, z1: -3.5 },
  { kind: 'crates', x0: 1.5,  x1: 2.5,  z0: 13,   z1: 14 },   // stacked wooden crates against the east wall
  { kind: 'kegs',   x0: -2.5, x1: -1.5, z0: 19.5, z1: 21 },   // trestle with small empty kegs, west wall
  { kind: 'cart',   x0: 1.5,  x1: 2.5,  z0: 27,   z1: 28.5 }, // old wooden hand cart, east wall
  { kind: 'rubble', x0: -2.5, x1: -0.5, z0: 32.5, z1: 34 },   // collapsed corner at the dead end (rats' nest)
];
// The gallery ends at z = 34 with a bricked-up arch.

// --- gameplay anchors ----------------------------------------------------------------------------
// Delivery zone: chalk-marked rectangle on the floor in front of the dock. A barrel is delivered when
// its center is inside and it is (almost) stopped, or simply when its center enters (gameplay decides).
export const TARGET = { x0: -2.5, x1: 2.5, z0: -8, z1: -5.5 };
// Where delivered barrels end up: standing upright on the dock (y = DOCK.height), one per slot.
export const DOCK_SLOTS = [-3.6, -1.2, 1.2, 3.6].map((x) => ({ x, y: DOCK.height, z: -8.75 }));

export const PLAYER_START = { x: 0, z: -3, yaw: 0 }; // facing +Z, i.e. down the gallery

// Barrels lie on their side. yaw = their ROLLING direction (sin yaw, cos yaw); the barrel axis is
// perpendicular to it (horizontal). All four lie in the bays, rolled toward the gallery.
export const BARREL_SPAWNS = [
  { x: 8,  z: 6.5,  yaw: -Math.PI / 2 }, // bayE1
  { x: -8, z: 12.5, yaw: Math.PI / 2 },  // bayW1
  { x: 8,  z: 18.5, yaw: -Math.PI / 2 }, // bayE2 (the dark bay)
  { x: -8, z: 24.5, yaw: Math.PI / 2 },  // bayW2
];

// Bare incandescent bulbs on a twisted cord hanging from the vault. power 0..1, flicker 0..1.
export const BULBS = [
  { x: 0,  y: 4.0, z: -6.6, power: 1.0,  flicker: 0 },    // above the delivery zone
  { x: 4,  y: 4.0, z: -2,   power: 0.55, flicker: 0.5 },
  { x: 0,  y: 3.6, z: 5,    power: 0.8,  flicker: 0 },
  { x: 0,  y: 3.6, z: 13.5, power: 0.7,  flicker: 0.15 },
  { x: 0,  y: 3.6, z: 22,   power: 0.75, flicker: 0 },
  { x: 0,  y: 3.6, z: 30,   power: 0.5,  flicker: 0.8 },  // dying bulb near the dead end
  { x: 7,  y: 2.9, z: 6.5,  power: 0.6,  flicker: 0 },    // bayE1
  { x: -7, y: 2.9, z: 12.5, power: 0.6,  flicker: 0.1 },  // bayW1
  { x: -7, y: 2.9, z: 24.5, power: 0.55, flicker: 0.6 },  // bayW2  (bayE2 has no bulb)
];

export const RAT_SPAWNS = [
  { x: 0.5, z: 31.5 }, { x: 9, z: 18.5 }, { x: -9.5, z: 12.5 }, { x: 1, z: 24 }, { x: -4, z: -1.5 },
];

// --- grid ---------------------------------------------------------------------------------------
const inRect = (r, x, z) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1;
const grid = new Uint8Array(NX * NZ);
for (let j = 0; j < NZ; j++) {
  for (let i = 0; i < NX; i++) {
    const x = GX0 + (i + 0.5) * CELL, z = GZ0 + (j + 0.5) * CELL;
    grid[j * NX + i] = ROOMS.some((r) => inRect(r, x, z)) && !BLOCKS.some((b) => inRect(b, x, z)) ? 1 : 0;
  }
}
const cell = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NZ ? 0 : grid[j * NX + i]);

/** true if the point is on walkable floor */
export function isWalkable(x, z) {
  return cell(Math.floor((x - GX0) / CELL), Math.floor((z - GZ0) / CELL)) === 1;
}
/** true if a circle of radius r centered at (x, z) fits entirely in walkable space (approximate, 8 samples) */
export function fits(x, z, r) {
  if (!isWalkable(x, z)) return false;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; if (!isWalkable(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false; }
  return true;
}

// --- wall segments (boundary edges between walkable and solid cells, merged) ------------------------
// Each: { ax, az, bx, bz, nx, nz } with (nx, nz) the unit normal pointing INTO walkable space.
export const WALLS = [];
{
  // horizontal edges (constant z) between rows j-1 and j
  for (let j = 0; j <= NZ; j++) {
    let run = null;
    for (let i = 0; i <= NX; i++) {
      const a = cell(i, j - 1), b = cell(i, j);
      const type = i < NX && a !== b ? (b ? 1 : -1) : 0; // 1: walkable below (+z) -> normal +z
      if (run && type !== run.type) { WALLS.push(mk(run.i0, j, i, j, 0, run.type)); run = null; }
      if (type && !run) run = { i0: i, type };
    }
  }
  for (let i = 0; i <= NX; i++) {
    let run = null;
    for (let j = 0; j <= NZ; j++) {
      const a = cell(i - 1, j), b = cell(i, j);
      const type = j < NZ && a !== b ? (b ? 1 : -1) : 0;
      if (run && type !== run.type) { WALLS.push(mk(i, run.j0, i, j, run.type, 0)); run = null; }
      if (type && !run) run = { j0: j, type };
    }
  }
  function mk(i0, j0, i1, j1, nx, nz) {
    return { ax: GX0 + i0 * CELL, az: GZ0 + j0 * CELL, bx: GX0 + i1 * CELL, bz: GZ0 + j1 * CELL, nx, nz };
  }
}

/**
 * Push a circle out of all walls. Mutates p ({x, z}). Returns null when free, otherwise
 * { nx, nz, depth } = the deepest contact normal (into walkable space) and penetration.
 * Handles convex corners correctly (closest point on segment). Run it 2x for fast movers.
 */
export function collideCircle(p, r) {
  let best = null;
  for (let pass = 0; pass < 2; pass++) {
    for (const w of WALLS) {
      // quick reject on the segment's bounding box
      if (p.x < Math.min(w.ax, w.bx) - r || p.x > Math.max(w.ax, w.bx) + r || p.z < Math.min(w.az, w.bz) - r || p.z > Math.max(w.az, w.bz) + r) continue;
      const cx = Math.min(Math.max(p.x, Math.min(w.ax, w.bx)), Math.max(w.ax, w.bx));
      const cz = Math.min(Math.max(p.z, Math.min(w.az, w.bz)), Math.max(w.az, w.bz));
      let dx = p.x - cx, dz = p.z - cz;
      let d = Math.hypot(dx, dz);
      // on the solid side of the face (deep penetration): use the face normal
      const side = (p.x - cx) * w.nx + (p.z - cz) * w.nz;
      // (only when the center is less than r behind the face, so thin solids are never tunnelled through)
      if (side < 0 && side > -r && (w.nx ? cz > Math.min(w.az, w.bz) && cz < Math.max(w.az, w.bz) : cx > Math.min(w.ax, w.bx) && cx < Math.max(w.ax, w.bx))) {
        const depth = r - side; // side is negative
        p.x += w.nx * depth; p.z += w.nz * depth;
        if (!best || depth > best.depth) best = { nx: w.nx, nz: w.nz, depth };
        continue;
      }
      if (d >= r) continue;
      if (d < 1e-6) { dx = w.nx; dz = w.nz; d = 1; }
      const nx = dx / d, nz = dz / d, depth = r - d;
      p.x += nx * depth; p.z += nz * depth;
      if (!best || depth > best.depth) best = { nx, nz, depth };
    }
  }
  return best;
}

/** Distance along the unit direction (dx, dz) from (x, z) to the first wall, capped at maxD. For camera collision. */
export function rayDist(x, z, dx, dz, maxD) {
  let t = maxD;
  for (const w of WALLS) {
    if (w.nx) { // vertical segment x = w.ax
      if (Math.abs(dx) < 1e-6) continue;
      const s = (w.ax - x) / dx; if (s < 0 || s >= t) continue;
      const zz = z + dz * s; if (zz >= Math.min(w.az, w.bz) && zz <= Math.max(w.az, w.bz)) t = s;
    } else {
      if (Math.abs(dz) < 1e-6) continue;
      const s = (w.az - z) / dz; if (s < 0 || s >= t) continue;
      const xx = x + dx * s; if (xx >= Math.min(w.ax, w.bx) && xx <= Math.max(w.ax, w.bx)) t = s;
    }
  }
  return t;
}

/** room the point is in (first match), or null */
export function roomAt(x, z) { return ROOMS.find((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) || null; }
/** ceiling height above a point (vault profile ignored: crown height of the room), for camera clamping */
export function ceilAt(x, z) { const r = roomAt(x, z); return r ? r.spring + 0.6 * (r.ceil - r.spring) : 2.6; }

export const BOUNDS = { x0: GX0, x1: GX1, z0: GZ0, z1: GZ1 };
export const GRID = { nx: NX, nz: NZ, x0: GX0, z0: GZ0, cell: CELL, data: grid };
