// Polyline paths with filleted corners (level 5 belts, level 4 catwalk course). Owner: lead.
// Pure JS (no three.js) so node can run it.
//
// makePath(points, { closed, radius, step }) → path
//   points : [[x, z], ...] polyline corners in world meters (X right, Z toward the camera)
//   radius : corner fillet radius (clamped per corner so it always fits)
//   step   : sampling step in meters (default 0.05)
// path = { length, closed, samples: [{x, z, tx, tz, s}],
//          at(s) → {x, z, tx, tz}       // position + unit tangent at arc length s (wraps if closed, clamps otherwise)
//          project(x, z) → {s, d} }     // closest arc length and distance to the path

export function makePath(points, { closed = false, radius = 0, step = 0.05 } = {}) {
  const pts = points.map(([x, z]) => ({ x, z }));
  const n = pts.length;
  // build a dense polyline with filleted corners
  const dense = [];
  const corner = (i) => pts[(i + n) % n];
  const segCount = closed ? n : n - 1;
  const push = (x, z) => {
    const l = dense[dense.length - 1];
    if (!l || Math.hypot(l.x - x, l.z - z) > 1e-6) dense.push({ x, z });
  };
  // returns trimmed start/end for each corner fillet
  const fillet = (i) => {
    if (!closed && (i === 0 || i === n - 1)) return null;
    const p = corner(i), a = corner(i - 1), b = corner(i + 1);
    let ax = a.x - p.x, az = a.z - p.z, bx = b.x - p.x, bz = b.z - p.z;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
    ax /= la; az /= la; bx /= lb; bz /= lb;
    const cos = ax * bx + az * bz;
    const half = Math.acos(Math.max(-1, Math.min(1, cos))) / 2;   // half of the inner angle
    if (half > Math.PI / 2 - 1e-3 || radius <= 0) return null;   // straight
    const maxT = Math.min(la, lb) * 0.5;
    let t = radius / Math.tan(half);
    let r = radius;
    if (t > maxT) { t = maxT; r = t * Math.tan(half); }
    const s = { x: p.x + ax * t, z: p.z + az * t };  // on incoming segment
    const e = { x: p.x + bx * t, z: p.z + bz * t };  // on outgoing segment
    // circle centre along the bisector
    let mx = ax + bx, mz = az + bz; const ml = Math.hypot(mx, mz); mx /= ml; mz /= ml;
    const dc = r / Math.sin(half);
    const c = { x: p.x + mx * dc, z: p.z + mz * dc };
    return { s, e, c, r };
  };
  const F = pts.map((_, i) => fillet(i));
  const startOf = (i) => (F[i] ? F[i].e : pts[i]);
  for (let k = 0; k < segCount; k++) {
    const i = k, j = (k + 1) % n;
    const a = startOf(i);
    const b = F[j] ? F[j].s : pts[j];
    push(a.x, a.z); push(b.x, b.z);
    if (F[j] && (closed || j !== n - 1)) {
      const { s, e, c, r } = F[j];
      let a0 = Math.atan2(s.z - c.z, s.x - c.x), a1 = Math.atan2(e.z - c.z, e.x - c.x);
      let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const segs = Math.max(2, Math.ceil(Math.abs(d) * r / 0.08));
      for (let q = 1; q <= segs; q++) { const ang = a0 + d * q / segs; push(c.x + Math.cos(ang) * r, c.z + Math.sin(ang) * r); }
    }
  }
  if (closed) push(dense[0].x, dense[0].z);

  // cumulative lengths over the dense polyline
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z));
  const length = cum[cum.length - 1];

  function rawAt(s) {
    if (closed) { s %= length; if (s < 0) s += length; } else s = Math.max(0, Math.min(length, s));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    const a = dense[lo], b = dense[hi];
    const L = cum[hi] - cum[lo] || 1e-9, u = (s - cum[lo]) / L;
    const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
    return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u, tx, tz };
  }

  const samples = [];
  const cnt = Math.max(2, Math.ceil(length / step));
  for (let i = 0; i <= cnt; i++) { const s = (length * i) / cnt; const p = rawAt(s); samples.push({ ...p, s }); }

  function project(x, z) {
    let best = Infinity, bs = 0;
    for (let i = 1; i < dense.length; i++) {
      const a = dense[i - 1], b = dense[i];
      const vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz || 1e-9;
      const u = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / L2));
      const px = a.x + vx * u, pz = a.z + vz * u, d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bs = cum[i - 1] + Math.sqrt(L2) * u; }
    }
    return { s: bs, d: best };
  }

  return { length, closed, samples, at: rawAt, project };
}
