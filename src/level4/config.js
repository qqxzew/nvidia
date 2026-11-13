// Level 4 "Varna" — first-person catwalk run through the brewhouse (owner: lead). Units: meters, seconds.
// World: Y up, X = east, Z = south. The course is a polyline (src/core/paths.js) on the catwalk floor at
// RUN.deckY; the runner moves forward automatically along it and only changes lane / jumps.
// Lateral offset convention: lane −1 = left, +1 = right of the running direction.
//   right vector of a path tangent (tx, tz) = (−tz, tx)   → lateral position = path point + right * offset

export const RUN = {
  countdown: 3,
  timeLimit: 62,          // seconds until the kettle boils over (the race against the clock)
  deckY: 6.0,             // catwalk walking surface above the hall floor (vats stand on the floor below)
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
