// Level 2 "Válení sudů ve sklepě" — gameplay constants (owner: gameplay). Read by ui2 / audio2 via ctx2.config.
export const CONFIG2 = {
  timeLimit: 240,          // s
  barrels: 4,
  maxBites: 3,             // the 3rd bite fails the level
  countdown: 3,            // s
  stars: {                 // 3 = time <= three.time && bites <= three.bites; 2 = ...; else 1
    three: { time: 150, bites: 0 },
    two: { time: 200, bites: 1 },
  },

  player: {
    radius: 0.3,
    walkSpeed: 3.2,        // m/s
    pushSpeed: 2.0,        // m/s while pushing a barrel
    accel: 7,              // m/s² toward the stick velocity (gentle start)
    decel: 10,             // m/s² when the stick is released
    turnRate: 9,           // rad/s facing toward the move direction (exp. approach rate)
    pushTurnRate: 3.2,     // rad/s max facing turn rate while pushing (so a yank of the stick loses the barrel)
    flinchTime: 0.8,       // s, no control
    invulnTime: 2.0,       // s after a bite
  },

  barrel: {
    radius: 0.42,          // collision circle vs walls / barrels / rats
    pushRadius: 0.4,       // circle vs the player (player r + this = contact distance)
    rollRadius: 0.33,      // visual roll: angle = distance / rollRadius
    behindCos: 0.766,      // cos 40°: contact from behind -> roll it ahead
    loseAngle: 0.96,       // rad (55°): player heading vs barrel rolling direction -> loses the barrel
    loseTime: 0.14,        // s over loseAngle before the barrel is released
    regrab: 0.55,          // s before the same barrel can be pushed again after losing it
    follow: 6,             // 1/s: how fast the barrel picks up the player's speed (inertia)
    turnRate: 0.95,        // rad/s max steering of the rolling direction while pushed (at >= turnSpeed)
    turnSpeed: 1.3,        // m/s barrel speed for full turn rate
    pivotRate: 0.22,       // rad/s steering at standstill (pushing against it while stopped)
    magnet: 4.5,           // 1/s: pulls the pusher onto the barrel's centre line (easy for tourists)
    rollFriction: 1.0,     // m/s² free rolling deceleration
    slideFriction: 5.0,    // m/s² sideways (along the axis) deceleration
    sideSlide: 0.3,        // fraction of the player's approach speed a side push slides it
    sideSwivel: 0.75,      // rad/s swivel toward the push direction at full approach speed (side push)
    maxSpeed: 3.2,
    restitution: 0.35,     // wall bounce
    barrelRestitution: 0.5,
    realign: 0.55,         // 0..1 how much the yaw re-aligns to the reflected velocity after a bounce
    bumpMin: 0.25,         // m/s normal speed below which no barrel:bump is emitted
    pinTime: 0.8,          // s pushed against a wall without moving -> it rolls out along the wall (no corner traps)
    pinKick: 1.4,          // m/s
    deliverTime: 1.3,      // s animation onto the dock
  },

  rats: {
    count: 3,
    radius: 0.13,
    walkSpeed: 0.75,
    dashSpeed: 3.4,
    fleeSpeed: 4.0,
    biteDist: 0.42,        // centre distance rat <-> player
    scareDist: 1.25,       // player closer than this: the rat usually bolts (sometimes freezes)
    crossEvery: [8, 16],   // s between "cross the player's path" dashes (per rat, only when near)
    squeakEvery: [6, 14],  // s
  },

  camera: {
    fov: 62,
    distance: 4.0,
    height: 2.6,
    lookAhead: 1.4,
    lookHeight: 0.9,
    follow: 1.6,           // 1/s yaw follow of the move direction
    stiffness: 6,          // position smoothing
    near: 0.1, far: 60,
  },

  grade: { sepia: 0.28, vignette: 0.58, grain: 0.026, contrast: 1.05, exposure: 1.08 },
};
