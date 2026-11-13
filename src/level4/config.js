// Level 4 "Varna" — first-person catwalk run through the brewhouse (owner: lead). Units: meters, seconds.
// World: Y up, X = east, Z = south. The course is a polyline (src/core/paths.js) on the catwalk floor at
// course.deckAt(s) (v2; RUN.deckY is only a fallback); the runner moves forward automatically along it and only changes lane / jumps.
// Lateral offset convention: lane −1 = left, +1 = right of the running direction.
//   right vector of a path tangent (tx, tz) = (−tz, tx)   → lateral position = path point + right * offset

export const RUN = {
  countdown: 3,
  timeLimit: 42,          // seconds until the kettle boils over (v2 course ≈ 208 m; perfect bot 32.2 s = 23 % to spare, as before)
  deckY: 6.0,             // FALLBACK only: the walking surface is course.deckAt(s) (real floors + stairs, v2)
  deckWidth: 2.7,         // grating width between the railings
  laneWidth: 0.85,        // lane centres at −0.85, 0, +0.85
  eyeHeight: 1.62,
  speedStart: 5.4,        // m/s automatic forward run
  speedMax: 7.6,
  speedRamp: 0.055,       // m/s gained per second
  laneTime: 0.17,         // seconds to slide one lane
  jumpTime: 0.72,         // airtime
  jumpHeight: 1.05,
  stumbleTime: 0.9,       // after a hit: speed dips, controls stay live
  stumbleSpeed: 0.45,     // speed factor at the start of a stumble
  fallPenalty: 2.5,       // seconds lost when falling through a hole (respawn before it)
  respawnBack: 5,         // meters before the hole where the runner reappears
};

export const CAMERA = { fov: 74, fovBoost: 8, near: 0.08, far: 260 };
