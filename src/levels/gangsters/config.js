// Level 3 "Gangsteři ve Světovaru" — tuning constants. Units: meters, seconds, radians.
// See docs/LEVEL3.md for the contract between modules.

export const CONFIG3 = {
  game: {
    duration: 95,          // seconds until the police arrive (= win)
    barrelCount: 10,
    maxStolen: 3,          // a 4th stolen barrel = fail
    countdown: 3,
  },

  shotgun: {
    shells: 2,
    reload: 1.3,           // seconds for a full reload (both barrels)
    cooldown: 0.22,        // minimum time between shots
    spreadPx: 26,          // extra hit tolerance around the aim point, in CSS pixels (salt spreads)
  },

  gangsters: {
    rise: 0.9,
    smash: 1.6,
    climb: 1.7,
    escape: 1.6,
    speedUpMin: 0.55,      // stage durations scale by lerp(1, speedUpMin, difficulty)
    spawnInterval: [2.4, 0.9],
    maxActive: [1, 4],
    innocentChance: 0.12,
    toughChance: 0.15,
  },

  score: {
    gangster: 100,
    early: 50,             // bonus for a hit before the glass is smashed
    recovered: 150,        // hit while escaping with a barrel
    innocent: -200,
    perBarrelLeft: 50,     // end-of-level bonus per barrel still in the hall
  },

  camera: {
    fov: 70,
    yawLimit: 1.75,        // the side windows are almost sideways from the player now
    pitchMin: -0.55,
    pitchMax: 0.5,
    panSpeed: 1.9,         // rad/s at full keyboard pan
    pitch: -0.04,          // initial pitch
  },

  render: {
    maxPixelRatio: 1.5,
    minPixelRatio: 0.85,
    shadowMapSize: 1024,
  },
};
