import * as THREE from 'three';

// The drivable route: náměstí Republiky (square) -> town street -> suburb (Bory) -> field road along
// the brewery fence -> through the gate into the Světovar yard.
// Coordinates are meters. X = east, Z = south, Y = up. Driving direction is mostly +Z, ending toward -X.

const CONTROL = [
  // zone tag = zone that STARTS at this control point
  { x: 30, z: -48, zone: 'square' },
  { x: 30, z: -10 },
  { x: 30, z: 25 },
  { x: 27, z: 62, zone: 'town' },
  { x: 26, z: 118 },
  // 90° corner: turn LEFT (east) into a side street
  { x: 30, z: 138 },
  { x: 46, z: 148 },
  { x: 90, z: 151 },
  // 90° corner: turn RIGHT (south) onto the long avenue toward Bory
  { x: 112, z: 156 },
  { x: 122, z: 172 },
  { x: 124, z: 230 },
  { x: 122, z: 330 },
  { x: 112, z: 400 },
  { x: 100, z: 455, zone: 'suburb' },
  // S-bend through the villa quarter
  { x: 70, z: 520 },
  { x: 78, z: 575 },
  { x: 50, z: 640 },
  { x: 28, z: 700 },
  { x: 22, z: 730, zone: 'field' },
  { x: 8, z: 800 },
  { x: 6, z: 880 },
  { x: 4, z: 912 },
  { x: -4, z: 936, zone: 'brewery' },
  { x: -25, z: 948 },
  { x: -55, z: 952 },
  { x: -82, z: 950 },
];

// Drivable half-width of the road per zone (curb to curb / 2). Outside this the truck hits the curb/wall.
export const ZONE_HALF_WIDTH = {
  square: 7,
  town: 6,
  suburb: 5,
  field: 4.5,
  brewery: 9,
};

const STEP = 1; // sample spacing in meters

export function createRoute() {
  const pts = CONTROL.map((p) => new THREE.Vector3(p.x, 0, p.z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const length = curve.getLength();
  const n = Math.ceil(length / STEP) + 1;

  const px = new Float32Array(n), pz = new Float32Array(n);
  const tx = new Float32Array(n), tz = new Float32Array(n);
  const ss = new Float32Array(n);
  const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const s = Math.min(i * STEP, length);
    const u = s / length;
    curve.getPointAt(u, tmpP);
    curve.getTangentAt(u, tmpT);
    const tl = Math.hypot(tmpT.x, tmpT.z) || 1;
    px[i] = tmpP.x; pz[i] = tmpP.z; tx[i] = tmpT.x / tl; tz[i] = tmpT.z / tl; ss[i] = s;
  }

  // Zone boundaries at the arc length nearest to each tagged control point.
  const zones = [];
  CONTROL.forEach((c) => {
    if (!c.zone) return;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = (px[i] - c.x) ** 2 + (pz[i] - c.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    zones.push({ id: c.zone, s0: ss[best], s1: length });
  });
  for (let i = 0; i < zones.length - 1; i++) zones[i].s1 = zones[i + 1].s0;
  zones[0].s0 = 0;

  function idx(s) { return Math.max(0, Math.min(n - 1, Math.round(s / STEP))); }

  function zoneAt(s) {
    for (const z of zones) if (s >= z.s0 && s < z.s1) return z.id;
    return zones[zones.length - 1].id;
  }

  // Half-width with a smooth 20 m blend between zones.
  function halfWidthAt(s) {
    const BLEND = 20;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (s >= z.s0 && s < z.s1) {
        const w = ZONE_HALF_WIDTH[z.id];
        const next = zones[i + 1];
        if (next && s > z.s1 - BLEND) {
          const t = (s - (z.s1 - BLEND)) / BLEND;
          return THREE.MathUtils.lerp(w, ZONE_HALF_WIDTH[next.id], THREE.MathUtils.smoothstep(t, 0, 1));
        }
        return w;
      }
    }
    return ZONE_HALF_WIDTH[zones[zones.length - 1].id];
  }

  /** Frame at arc length s: position, unit forward (tx,tz), unit right (rx,rz), yaw (0 = facing +Z). */
  // Linearly interpolated between the 1 m samples — snapping to samples made slow movers
  // (horse carts, pedestrians) visibly jump in 1 m steps.
  function frameAt(s) {
    const u = Math.max(0, Math.min(n - 1, s / STEP));
    const i0 = Math.min(n - 2, Math.floor(u));
    const t = u - i0, i1 = i0 + 1;
    let fx = tx[i0] + (tx[i1] - tx[i0]) * t;
    let fz = tz[i0] + (tz[i1] - tz[i0]) * t;
    const l = Math.hypot(fx, fz) || 1;
    fx /= l; fz /= l;
    return {
      s: ss[i0] + (ss[i1] - ss[i0]) * t,
      x: px[i0] + (px[i1] - px[i0]) * t,
      z: pz[i0] + (pz[i1] - pz[i0]) * t,
      tx: fx, tz: fz, rx: -fz, rz: fx, yaw: Math.atan2(fx, fz),
    };
  }

  /** World point at arc length s offset sideways by `lateral` meters (positive = right of driving direction). */
  function pointAt(s, lateral = 0, y = 0, target = new THREE.Vector3()) {
    const f = frameAt(s);
    return target.set(f.x + f.rx * lateral, y, f.z + f.rz * lateral);
  }

  /** Project a world XZ point onto the route. hint = previous index for O(1) local search. */
  function project(x, z, hint = -1) {
    let lo = 0, hi = n - 1;
    if (hint >= 0) { lo = Math.max(0, hint - 40); hi = Math.min(n - 1, hint + 40); }
    let best = lo, bd = Infinity;
    for (let i = lo; i <= hi; i++) {
      const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    const dx = x - px[best], dz = z - pz[best];
    const along = dx * tx[best] + dz * tz[best];
    const lateral = dx * -tz[best] + dz * tx[best];
    const s = THREE.MathUtils.clamp(ss[best] + along, 0, length);
    return { s, lateral, index: best };
  }

  const startFrame = frameAt(4);
  const endFrame = frameAt(length - 2);

  // Named anchor points other modules build around.
  const anchors = {
    start: { x: startFrame.x, z: startFrame.z, yaw: startFrame.yaw },
    // Náměstí Republiky: open square, cathedral of St. Bartholomew in the middle (long axis east-west).
    square: { minX: -80, maxX: 44, minZ: -64, maxZ: 52, cathedral: { x: -18, z: -4, yaw: Math.PI / 2 } },
    // The exit street leaves the square's south edge here.
    squareExit: { x: 27, z: 52, width: 18 },
    // Railway line along constant Z, crossing the field road and running west into the brewery
    // (the upper track of the 1912 plan, north of the brewhouse row).
    rail: { z: 870, fromX: 320, toX: -276 },
    railCrossing: { s: project(6, 870).s, x: 6, z: 870 },
    // Brewery perimeter fence runs along X = fenceX next to the field road (right-hand side) from the NE
    // corner to the SE corner, where the diagonal street of the 1912 plan begins …
    fence: { x: -6, fromZ: 790, toZ: 973.4 },
    // … with the main gate where the route crosses it.
    gate: (() => { const p = project(-6, 941); const f = frameAt(p.s); return { s: p.s, x: f.x, z: f.z, yaw: f.yaw }; })(),
    // Světovar complex footprint (west of the fence; the south-east corner is cut by the diagonal street).
    brewery: { minX: -284, maxX: -6, minZ: 790, maxZ: 1062 },
    finish: { s: length - 6, x: frameAt(length - 6).x, z: frameAt(length - 6).z, yaw: endFrame.yaw, radius: 7 },
  };

  return {
    curve, length, zones, anchors, step: STEP, count: n,
    samples: { px, pz, tx, tz, s: ss },
    zoneAt, halfWidthAt, frameAt, pointAt, project,
  };
}
