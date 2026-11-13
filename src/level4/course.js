// Level 4 "Varna" — the catwalk course: path + hazards (initial version by the lead; owner from now: gameplay).
// Pure data + a builder, no three.js. Both the runner simulation (runner.js) and the 3D factory (factory.js)
// read THIS list at runtime, so editing it here changes gameplay and visuals together.
//
// Hazard types (s = arc length along the course, lanes ⊂ {−1, 0, 1}, −1 = left of the running direction):
//   hole  { s, len, lanes }                         missing grating CENTRED at s (s − len/2 … s + len/2, see holeSpan): jump over it
//                                                   or be in another lane; falling = respawn + time penalty
//   steam { s, lanes, period, on, phase }           jet from the vat below, ~1.2 m long; active while ((t + phase) mod period) < on
//                                                   (t = race clock in seconds since GO) — dodge to a free lane or time it
//   drip  { s, lanes, period, phase }               a drop of hot wort / condensate falls from a ceiling pipe: the drop leaves the pipe
//                                                   at ((t + phase) mod period) = 0, falls DRIP_FALL s, the hit window is the next 0.3 s
//   fall  { s, lanes, trigger }                     a hop sack / crate falls from the hoist when the runner is `trigger` m before it
//                                                   (falls in FALL_TIME s), then lies there as a 0.55 m block: dodge or jump over it
//   pipe  { s, lanes, height }                      low pipe across the catwalk at shin height: jump
import { makePath } from '../core/paths.js';

export const DRIP_FALL = 0.55;
export const FALL_TIME = 0.8;
export const BLOCK_HEIGHT = 0.55;
export const STEAM_LEN = 1.2;

export const COURSE = {
  // XZ corners of the catwalk centre line; fillet radius at the corners (the runner turns automatically)
  points: [[0, 0], [0, -75], [32, -75], [32, -160], [-12, -160], [-12, -262]],
  radius: 3.5,
  start: 2,               // runner starts here (s)
  finish: 322,            // the steam valve platform: crossing s = finish wins
  // named stretches (art themes each one; UI may show the name). Corners at s ≈ 74, 105, 188, 231.
  sections: [
    { id: 'mash', from: 0, to: 74, name: 'Rmutovací kádě' },
    { id: 'lauter', from: 74, to: 105, name: 'Scezovací káď' },
    { id: 'kettles', from: 105, to: 188, name: 'Mladinové pánve' },
    { id: 'hops', from: 188, to: 231, name: 'Chmelový sklad' },
    { id: 'cool', from: 231, to: 332, name: 'Chladicí štok' },
  ],
  // Layout rules (checked by scripts/level4-sim.mjs): nothing within ±5 m of a corner fillet centre (≈ 74.3, 104.8,
  // 188.3, 230.8) · steam / drips never cover all three lanes at once (there is always a lane to dodge into) · jump-only
  // obstacles (hole / pipe / sack) sharing a lane are ≥ 6 m apart edge to edge (a stumbling runner can land and jump
  // again) · the respawn spot respawnBack m before each hole has a clear lane · every hazard has an answer that the
  // perfect bot finds with 0 hits. Rhythm: ~1 decision per 1.2 s early, ~0.85 s in the final sprint.
  hazards: [
    // A — over the mash tuns: one new thing at a time
    { type: 'hole', s: 15, len: 1.6, lanes: [0] },                              // first gap right in your lane: hop or step aside
    { type: 'pipe', s: 24, lanes: [-1, 0, 1], height: 0.45 },                   // jump
    { type: 'steam', s: 32, lanes: [0], period: 3.0, on: 1.5, phase: 0 },       // first jet: step aside
    { type: 'hole', s: 40, len: 1.8, lanes: [-1] },                             // …and the left side has a gap
    { type: 'steam', s: 48, lanes: [0, 1], period: 2.8, on: 1.4, phase: 1.0 },  // go left
    { type: 'hole', s: 56, len: 2.0, lanes: [-1, 0] },                          // go right or jump
    { type: 'pipe', s: 64, lanes: [-1, 0, 1], height: 0.45 },
    // B — lauter tun: drips and the first falling sack
    { type: 'drip', s: 83, lanes: [0], period: 1.5, phase: 0 },
    { type: 'drip', s: 88, lanes: [1], period: 1.5, phase: 0.75 },
    { type: 'fall', s: 95, lanes: [-1], trigger: 14 },
    // C — over the copper kettles: steam weaves
    { type: 'steam', s: 114, lanes: [-1, 0], period: 2.6, on: 1.2, phase: 0.4 },
    { type: 'hole', s: 122, len: 2.0, lanes: [1] },
    { type: 'fall', s: 127, lanes: [0], trigger: 15 },
    { type: 'steam', s: 133, lanes: [0, 1], period: 2.6, on: 1.2, phase: 1.2 },
    { type: 'pipe', s: 140, lanes: [-1, 0, 1], height: 0.45 },
    { type: 'drip', s: 146, lanes: [-1], period: 1.4, phase: 0.3 },
    { type: 'hole', s: 152, len: 2.0, lanes: [-1, 0] },
    { type: 'steam', s: 158, lanes: [-1, 1], period: 2.4, on: 1.2, phase: 0 },  // only the middle is clear
    { type: 'fall', s: 164, lanes: [0], trigger: 14 },                          // …and a sack drops into it
    { type: 'hole', s: 172, len: 2.2, lanes: [0, 1] },
    { type: 'drip', s: 178, lanes: [0], period: 1.3, phase: 0.5 },
    // D — hop store: a drip gate and a gap across the whole deck
    { type: 'pipe', s: 197, lanes: [-1, 0, 1], height: 0.45 },
    { type: 'drip', s: 203, lanes: [-1], period: 1.2, phase: 0 },
    { type: 'drip', s: 203, lanes: [1], period: 1.2, phase: 0.6 },              // the gate: keep to the middle
    { type: 'hole', s: 210, len: 2.0, lanes: [-1, 0, 1] },                      // must jump
    { type: 'steam', s: 217, lanes: [0], period: 2.2, on: 1.1, phase: 0.7 },
    { type: 'fall', s: 222, lanes: [-1], trigger: 13 },
    // E — cooling floor: the final sprint
    { type: 'fall', s: 241, lanes: [0], trigger: 16 },
    { type: 'hole', s: 249, len: 2.2, lanes: [0, 1] },
    { type: 'steam', s: 255, lanes: [-1, 0], period: 2.2, on: 1.1, phase: 0.2 },
    { type: 'pipe', s: 261, lanes: [-1, 0, 1], height: 0.45 },
    { type: 'drip', s: 267, lanes: [1], period: 1.1, phase: 0 },
    { type: 'hole', s: 273, len: 2.2, lanes: [-1] },
    { type: 'steam', s: 273, lanes: [1], period: 2.0, on: 1.0, phase: 0.5 },    // middle, or jump the gap on the left
    { type: 'fall', s: 281, lanes: [0], trigger: 15 },
    { type: 'hole', s: 289, len: 2.2, lanes: [-1, 0, 1] },
    { type: 'steam', s: 296, lanes: [0, 1], period: 2.0, on: 1.0, phase: 0.4 },
    { type: 'drip', s: 302, lanes: [-1], period: 1.0, phase: 0.2 },
    { type: 'pipe', s: 307, lanes: [-1, 0, 1], height: 0.45 },
    { type: 'hole', s: 315, len: 2.0, lanes: [-1, 1] },                         // last one: the middle plank holds
  ],
};

// --- shared timing helpers: the simulation AND the visuals/audio must use these so what you see is what hits you
const mod = (a, n) => ((a % n) + n) % n;
/** steam jet strength 0..1 at race time t (eases in/out over 0.15 s at the edges of the `on` window) */
export function steamLevel(h, t) {
  const u = mod(t + h.phase, h.period);
  if (u >= h.on) { const pre = h.period - u; return pre < 0.35 ? 0.25 * (1 - pre / 0.35) : 0; } // a hiss/puff warns just before
  return Math.min(1, u / 0.15, (h.on - u) / 0.15 + 0.2);
}
/** the steam jet hurts while active */
export const steamActive = (h, t) => mod(t + h.phase, h.period) < h.on;
/** drip: { y01: 0 at the pipe → 1 at the deck (null while the next drop is forming), forming: 0..1 swelling, active: hit window } */
export function dripState(h, t) {
  const u = mod(t + h.phase, h.period);
  if (u < DRIP_FALL) return { y01: (u / DRIP_FALL) ** 2, forming: 0, active: false };
  if (u < DRIP_FALL + 0.3) return { y01: 1, forming: 0, active: true, splash: (u - DRIP_FALL) / 0.3 };
  return { y01: null, forming: (u - DRIP_FALL - 0.3) / Math.max(0.01, h.period - DRIP_FALL - 0.3), active: false };
}
/** hole extent along the course: the gap is centred at h.s */
export const holeSpan = (h) => ({ s0: h.s - h.len / 2, s1: h.s + h.len / 2 });
/** falling sack: k = 0..1 fall progress since its trigger time (null = not triggered yet); landed when k ≥ 1 */
export function fallProgress(triggerTime, t) {
  if (triggerTime == null) return null;
  return Math.min(1, Math.max(0, (t - triggerTime) / FALL_TIME));
}

// → { path, length, start, finish, sections, hazards (each with a stable `id`), laneOffset(lane) }
export function buildCourse(course = COURSE, laneWidth = 0.85) {
  const path = makePath(course.points, { radius: course.radius });
  const hazards = course.hazards.map((h, i) => ({ id: i, ...h })).sort((a, b) => a.s - b.s);
  return {
    path, length: path.length, start: course.start, finish: course.finish, sections: course.sections, hazards,
    laneOffset: (lane) => lane * laneWidth,
  };
}
