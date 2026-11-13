// Level 5 "Šílená stáčírna" (the racking hall) — central constants (owner: lead). Units: meters, seconds.
// World: Y up, X = east (screen right), Z = south (toward the camera / screen down). Floor y = 0.
// Belt paths are polylines run through makePath() from ../core/paths.js — the SAME path objects drive the barrels
// (gameplay) and the belt meshes (art), so read them via buildBelts(), never re-type the numbers.
import { makePath } from '../core/paths.js';

export const LAYOUT = {
  room: { minX: -10, maxX: 10, minZ: -6.5, maxZ: 6, ceiling: 6 },
  beltWidth: 0.8,
  beltHeight: 0.75,        // top surface of the conveyor above the floor
  barrel: { radius: 0.3, length: 0.62 },

  // the main loop ("kolotoč"), flows clockwise on screen: top edge → right, right edge → down, bottom → left, left → up
  ring: { points: [[-5, -2.6], [5, -2.6], [5, 2.6], [-5, 2.6]], radius: 1.0 },

  // switches (výhybky). Each diverts the ring into a branch at `points[0]` (a point ON the ring).
  // A spur rejoins the ring at its last point; the 'ship' branch leaves the hall (no rejoin).
  // key = keyboard key, order = processing order shown to the player.
  switches: [
    { id: 'wash', key: '1', order: 1, points: [[-3.6, -2.6], [-2.8, -4.0], [-0.8, -4.0], [0, -2.6]], station: { x: -1.8, z: -4.0 } },  // Myčka
    { id: 'fill', key: '2', order: 2, points: [[5, -1.5], [6.4, -0.8], [6.4, 0.8], [5, 1.5]], station: { x: 6.4, z: 0 } },           // Plnička
    { id: 'cap', key: '3', order: 3, points: [[0.8, -2.6], [1.6, -4.0], [3.0, -4.0], [3.8, -2.6]], station: { x: 2.3, z: -4.0 } },    // Naražeč
    { id: 'ship', key: '4', order: 4, points: [[2.0, 2.6], [1.2, 3.9], [-6.0, 3.9], [-9.4, 3.9]], station: { x: -7.0, z: 3.9 }, exit: true }, // Expedice
  ],
  branchRadius: 0.6,

  // empty dirty barrels arrive from the lager cellar lift (left wall) and merge into the ring's left edge
  entry: { points: [[-9.4, 0.9], [-6.6, 0.9], [-5, -0.4]], lift: { x: -9.2, z: 0.9 } },
};

// one colour + Czech name per station: used for the in-world enamel signs, the floating tag above each barrel
// (= the station it needs NEXT), the switch lamps and the HUD switch buttons. Keep these four colours only.
export const STATIONS = {
  wash: { name: 'Myčka', verb: 'Umýt', color: '#4f8aa3' },     // water blue
  fill: { name: 'Plnička', verb: 'Naplnit', color: '#d29a2e' }, // beer amber
  cap: { name: 'Naražeč', verb: 'Zatlouct', color: '#9a2b1c' }, // brewery red (the UI accent)
  ship: { name: 'Expedice', verb: 'Odeslat', color: '#3f7a52' }, // enamel green
};
// barrel lifecycle: dirty → (wash) clean → (fill) full → (cap) capped → (ship) dispatched
export const NEXT_STATION = { dirty: 'wash', clean: 'fill', full: 'cap', capped: 'ship' };

export const CAMERA = {
  fov: 40,
  position: [0, 15.5, 7.2],
  target: [0, 0, 0.3],
};

export const LINE = {
  // gameplay tuning (the gameplay module may add keys — keep defaults in its own file, merged with this)
  countdown: 3,
  quota: 10,               // capped barrels to dispatch for Plzeň (user: "jen pár sudů, třeba deset")
  maxStrikes: 3,           // burst (dirty barrel under the filler) or rejected (unfinished barrel at dispatch)
  speedStart: 1.3,         // belt speed m/s
  speedMax: 3.0,
  speedRamp: 0.009,        // m/s gained per second of play
  spawnStart: 6.5,         // seconds between new barrels
  spawnMin: 2.8,
  minGap: 1.0,             // min centre distance between barrels on the same belt
};

// Build the path objects once. Returns { ring, branches: {id: {path, sw, join, exit, station}}, entry: {path, join} }
// sw / join are arc lengths ON THE RING where the branch leaves / rejoins (join = null for the exit branch).
export function buildBelts(layout = LAYOUT) {
  const ring = makePath(layout.ring.points, { closed: true, radius: layout.ring.radius });
  const branches = {};
  for (const sw of layout.switches) {
    const path = makePath(sw.points, { radius: layout.branchRadius });
    const a = sw.points[0], b = sw.points[sw.points.length - 1];
    branches[sw.id] = {
      id: sw.id, key: sw.key, order: sw.order, path, exit: !!sw.exit, station: sw.station,
      sw: ring.project(a[0], a[1]).s,
      join: sw.exit ? null : ring.project(b[0], b[1]).s,
      // arc length on the branch where the station acts (closest point to the station prop)
      stationS: path.project(sw.station.x, sw.station.z).s,
    };
  }
  const entryPath = makePath(layout.entry.points, { radius: layout.branchRadius });
  const e = layout.entry.points[layout.entry.points.length - 1];
  return { ring, branches, entry: { path: entryPath, join: ring.project(e[0], e[1]).s } };
}
