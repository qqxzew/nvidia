// Level 4 "Varna" — the catwalk course: path + hazards (initial version by the lead; owner from now: gameplay).
// Pure data + a builder, no three.js. Both the runner simulation (runner.js) and the 3D factory (factory.js)
// read THIS list at runtime, so editing it here changes gameplay and visuals together.
//
// v2: the course follows the REAL route through the Světovar buildings (src/core/sites.js LEVEL4_ROUTE), in level-4
// local coordinates (local = world − L4_ORIGIN, toL4): Varna 2nd-floor gallery → clock tower → covered bridge →
// cellar tower → stairs up → cooling floor ("chladicí štok") → main valve. ≈ 208 m. The walking surface is not
// constant any more: course.deckAt(s) (8.2 m … stairs at s ≈ 99.5 → 108.5 … 13.6 m), course.stairs.
//
// Hazard types (s = arc length along the course, lanes ⊂ {−1, 0, 1}, −1 = left of the running direction):
//   hole  { s, len, lanes }                         missing grating CENTRED at s (s − len/2 … s + len/2, see holeSpan): jump over it
//                                                   or be in another lane; falling = respawn + time penalty
//   steam { s, lanes, period, on, phase }           jet from the vessel below, ~1.2 m long; active while ((t + phase) mod period) < on
//                                                   (t = race clock in seconds since GO) — dodge to a free lane or time it
//   drip  { s, lanes, period, phase }               a drop of hot wort / condensate falls from a ceiling pipe: the drop leaves the pipe
//                                                   at ((t + phase) mod period) = 0, falls DRIP_FALL s, the hit window is the next 0.3 s
//   fall  { s, lanes, trigger }                     a hop sack / crate falls from the hoist when the runner is `trigger` m before it
//                                                   (falls in FALL_TIME s), then lies there as a 0.55 m block: dodge or jump over it
//   pipe  { s, lanes, height }                      low pipe / beam across the catwalk at shin height: jump
// All heights (block, pipe, jump) are relative to the local walking surface deckAt(s).
import { makePath } from '../core/paths.js';
import { LEVEL4_ROUTE, toL4 } from '../core/sites.js';

export const DRIP_FALL = 0.55;
export const FALL_TIME = 0.8;
export const BLOCK_HEIGHT = 0.55;
export const STEAM_LEN = 1.2;

export const COURSE = {
  // XZ corners of the catwalk centre line (local); fillet radius at the corners (the runner turns automatically)
  points: LEVEL4_ROUTE.points.map(toL4),
  radius: LEVEL4_ROUTE.radius,
  start: 2,               // runner starts here (s)
  finishBack: 6,          // the steam valve platform: crossing s = length − finishBack wins (course.finish)
  // walking-surface knots { x, z (local), y } → projected onto the path → deckAt(s), stairs
  elevation: LEVEL4_ROUTE.elevation.map(({ x, z, y }) => { const [lx, lz] = toL4([x, z]); return { x: lx, z: lz, y }; }),
  // named stretches, each begins where its `at` point (local) projects onto the path; to = next.from, last → length
  sections: LEVEL4_ROUTE.sections.map(({ id, at, name }) => ({ id, name, at: toL4(at) })),
  // Geometry (buildCourse(COURSE)): length 208.4, corner fillet centres at s ≈ 14.0, 20.3, 33.8, 40.5, 55.2, 96.5,
  // 134.3, 146.2, 172.1, 184.0 · stairs 99.5 → 108.5 · sections varna 0 · tower 50.3 · bridge 57.6 · cellarTower 78.4
  // · cool 102.9 · finish 204.4. Many legs are short, so the hazards sit on the longer straights only: the Varna legs
  // (s ≈ 25–29, 45–50), the 41 m clock tower → bridge → cellar tower straight (60–91), the 38 m leg into the cooling
  // floor after the stairs (114–129) and the cooling-floor legs (151–167, 189–200) plus single hazards at 140 / 178.
  // Layout rules (checked by scripts/level4-sim.mjs): nothing within ±5 m of a corner fillet centre · nothing on the
  // stairs or within 5 m of either stair end · nothing within 8 m of the start or 4 m of the finish · steam / drips
  // never cover all three lanes at once (there is always a lane to dodge into) · jump-only obstacles (hole / pipe /
  // sack) sharing a lane are ≥ 6 m apart edge to edge (a stumbling runner can land and jump again) · the respawn spot
  // respawnBack m before each hole has a clear lane · every hazard has an answer that the perfect bot finds with 0 hits.
  // Rhythm: ~1 decision per 1.2 s early, ~0.85 s in the final sprint (on the straights; the corners and the stairs
  // are the breathers). The clock tower and the stairs are calm.
  hazards: [
    // varna — gallery above the open kettle hall: grating holes, drips from the vapour stacks, steam from the hoods
    { type: 'hole', s: 27, len: 1.6, lanes: [0] },                              // first gap right in your lane: hop or step aside…
    { type: 'drip', s: 27, lanes: [-1], period: 1.6, phase: 0 },                // …the left side drips (go right, or jump the gap)
    { type: 'steam', s: 46.5, lanes: [0], period: 3.0, on: 1.5, phase: 0 },     // first jet from a kettle hood: step aside
    { type: 'drip', s: 49.5, lanes: [1], period: 1.5, phase: 0.75 },            // …the right side drips: left is the clean way
    // tower — calm
    // bridge — narrow covered bridge over the yard tracks: a low beam, rotten planks, a falling crate
    { type: 'pipe', s: 62, lanes: [-1, 0, 1], height: 0.45 },                   // low roof beam: jump
    { type: 'hole', s: 69.5, len: 1.8, lanes: [-1, 0] },                        // rotten planks: go right or jump
    { type: 'fall', s: 76, lanes: [1], trigger: 14 },                           // …and a crate drops on the right
    // cellarTower — sacks / crates from the hoist shaft
    { type: 'fall', s: 82, lanes: [0], trigger: 14 },
    { type: 'fall', s: 88.5, lanes: [-1], trigger: 14 },
    { type: 'fall', s: 88.5, lanes: [1], trigger: 14 },                         // the middle stays clear…
    { type: 'fall', s: 91, lanes: [0], trigger: 14 },                           // …until the third one: jump
    // stairs (99.5 → 108.5): nothing
    // cool — the final sprint between the coolers: steam from the cooling pans, condensation, holes, pipes, crates
    { type: 'steam', s: 115, lanes: [0], period: 2.4, on: 1.2, phase: 0.4 },
    { type: 'hole', s: 122, len: 2.0, lanes: [-1, 0] },                         // go right or jump
    { type: 'drip', s: 127.5, lanes: [0, 1], period: 1.2, phase: 0 },           // …and then the right drips: weave back left
    { type: 'pipe', s: 140.3, lanes: [-1, 0, 1], height: 0.45 },                // between the two cooler corners
    { type: 'fall', s: 152.5, lanes: [0], trigger: 15 },
    { type: 'steam', s: 158, lanes: [0, 1], period: 2.2, on: 1.2, phase: 0 },   // a cooling pan vents: keep left
    { type: 'hole', s: 164, len: 2.2, lanes: [-1, 0, 1] },                      // must jump
    { type: 'steam', s: 178, lanes: [-1, 0], period: 2.0, on: 1.2, phase: 0.5 },  // …and the next one: go right
    { type: 'hole', s: 190.5, len: 2.0, lanes: [-1, 0] },
    { type: 'drip', s: 195.5, lanes: [0], period: 1.0, phase: 0.2 },            // condensation over the middle
    { type: 'pipe', s: 198, lanes: [-1, 0, 1], height: 0.45 },                  // last one, right before the valve
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

// → { path, points, radius, length, start, finish, sections [{id, name, from, to}], hazards (each with a stable `id`),
//     corners (s of each corner fillet centre), deckAt(s), stairs [{s0, s1, y0, y1}], laneOffset(lane) }
// A course may give `finish` directly (else length − finishBack), sections with `from`/`to` directly (else `at`
// points projected onto the path), and `elevation` knots {x, z, y} (else a constant deck at course.deckY ?? 0).
export function buildCourse(course = COURSE, laneWidth = 0.85) {
  const path = makePath(course.points, { radius: course.radius });
  const length = path.length;
  const hazards = course.hazards.map((h, i) => ({ id: i, ...h })).sort((a, b) => a.s - b.s);
  const proj = ([x, z]) => path.project(x, z).s;

  // walking surface: piecewise linear between the knots (sorted by s), flat beyond the first / last one
  const knots = (course.elevation || []).map((k) => ({ s: proj([k.x, k.z]), y: k.y })).sort((a, b) => a.s - b.s);
  const flatY = course.deckY ?? 0;
  function deckAt(s) {
    if (!knots.length) return flatY;
    if (s <= knots[0].s) return knots[0].y;
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1], b = knots[i];
      if (s <= b.s) return b.s - a.s < 1e-9 ? b.y : a.y + (b.y - a.y) * (s - a.s) / (b.s - a.s);
    }
    return knots[knots.length - 1].y;
  }
  const stairs = [];
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1], b = knots[i];
    if (Math.abs(b.y - a.y) > 1e-6) stairs.push({ s0: a.s, s1: b.s, y0: a.y, y1: b.y });
  }

  const secs = (course.sections || []).map((q) => ({ ...q, from: q.from ?? proj(q.at) })).sort((a, b) => a.from - b.from);
  const sections = secs.map((q, i) => ({ id: q.id, name: q.name, from: q.from, to: q.to ?? (i + 1 < secs.length ? secs[i + 1].from : length) }));

  const corners = course.points.slice(1, -1).map(proj);

  return {
    path, points: course.points, radius: course.radius, length, start: course.start,
    finish: course.finish ?? length - (course.finishBack ?? 4),
    sections, hazards, corners, deckAt, stairs,
    laneOffset: (lane) => lane * laneWidth,
  };
}
