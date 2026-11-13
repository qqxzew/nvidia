// Central tuning constants. All units: meters, seconds, radians.
// World convention: Y up. Route runs roughly toward +Z (south). A model with yaw = 0 faces +Z.
// "Right" of a heading (sin(yaw), cos(yaw)) is (-cos(yaw), sin(yaw)) in XZ, i.e. -X when facing +Z.

export const CONFIG = {
  game: {
    timeLimit: 110,        // seconds (1:50)
    barrelCount: 10,
    maxLostBarrels: 2,     // losing a 3rd barrel = fail
    countdown: 3,
  },

  truck: {
    maxSpeed: 15.5,        // m/s (~56 km/h, arcade-fast for a 1920s truck)
    reverseMax: 4,
    accel: 4.2,
    brake: 11,
    coastDrag: 0.9,        // m/s^2 when no input
    wheelBase: 3.4,
    maxSteer: 0.55,        // front wheel angle at low speed
    highSpeedSteer: 0.2,   // front wheel angle at max speed
    steerRate: 2.6,        // how fast steering input follows the stick (1/s)
    gripLimit: 7.5,        // max lateral accel before the truck slides (m/s^2)
    halfWidth: 1.15,       // collision half extents of the truck body
    halfLength: 2.7,
  },

  cargo: {
    calmLateral: 3.5,      // m/s^2 below which barrels do not loosen from cornering
    lateralGain: 0.11,     // looseness per (m/s^2 over calm) per second
    impactGain: 0.55,      // looseness per unit of impact strength (0..1)
    bumpGain: 0.22,        // looseness per unit of bump strength
    brakeGain: 0.05,       // looseness per (m/s^2 decel over 7) per second
    settleRate: 0.08,      // looseness recovered per second when calm
    wobbleAt: 0.55,        // visual wobble + warning above this
    fallAt: 1.0,
    bottomLayerFactor: 0.45,
  },

  camera: {
    fov: 62,
    fovBoost: 8,           // extra fov at max speed
    distance: 9,
    height: 4.9,
    lookAhead: 6,
    lookHeight: 1.2,
    stiffness: 5.5,
  },

  render: {
    maxPixelRatio: 1.5,
    minPixelRatio: 0.85,
    shadowMapSize: 1024,
    shadowExtent: 45,      // half-size of the shadow camera box around the truck
    fogNear: 60,
    fogFar: 520,
  },
};
