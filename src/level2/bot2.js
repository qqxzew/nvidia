// Level 2 debug bot (?l2bot=1, owner: gameplay): plays the level with the real controls (writes the stick input).
// Barrel route = a clearance-weighted distance field to the TARGET on the layout grid (keeps barrels in the middle
// of the gallery); the cellarman walks to a point behind the barrel with a grid path that treats barrels as
// obstacles, then pushes, steering the barrel along the field (heading clamped so he never loses it).

const SQ2 = Math.SQRT2;
const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; else if (a < -Math.PI) a += TAU; return a; };

export function createBot2(ctx2) {
  const { layout, config } = ctx2;
  const { nx: NX, nz: NZ, x0: X0, z0: Z0, cell: CS } = layout.GRID;
  const N = NX * NZ;
  const cx = (i) => X0 + (i + 0.5) * CS, cz = (j) => Z0 + (j + 0.5) * CS;
  const idxOf = (x, z) => { const i = Math.floor((x - X0) / CS), j = Math.floor((z - Z0) / CS); return i < 0 || j < 0 || i >= NX || j >= NZ ? -1 : j * NX + i; };
  const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

  const walkMask = new Uint8Array(N), barrelMask = new Uint8Array(N), clr = new Float32Array(N);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    walkMask[j * NX + i] = layout.fits(cx(i), cz(j), 0.3) ? 1 : 0;
    barrelMask[j * NX + i] = layout.fits(cx(i), cz(j), 0.45) ? 1 : 0;
  }
  // clearance (m) to the nearest solid cell, brute-force BFS
  {
    const q = new Int32Array(N); let h = 0, t = 0;
    clr.fill(1e9);
    for (let k = 0; k < N; k++) if (!layout.GRID.data[k]) { clr[k] = 0; q[t++] = k; }
    while (h < t) {
      const k = q[h++], i = k % NX, j = (k - i) / NX;
      for (const [di, dj] of NB.slice(0, 4)) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue;
        const kk = jj * NX + ii; if (clr[kk] > clr[k] + CS) { clr[kk] = clr[k] + CS; q[t++] = kk; }
      }
    }
  }

  // --- Dijkstra with a binary heap ------------------------------------------------------------------
  const heapK = new Int32Array(N * 8), heapV = new Float32Array(N * 8);
  function dijkstra(out, seeds, pass, costMul) {
    out.fill(Infinity);
    let n = 0;
    const push = (k, v) => { let c = n++; heapK[c] = k; heapV[c] = v; while (c > 0) { const p = (c - 1) >> 1; if (heapV[p] <= heapV[c]) break; [heapK[p], heapK[c]] = [heapK[c], heapK[p]]; [heapV[p], heapV[c]] = [heapV[c], heapV[p]]; c = p; } };
    const pop = () => { const k = heapK[0]; n--; heapK[0] = heapK[n]; heapV[0] = heapV[n]; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < n && heapV[l] < heapV[m]) m = l; if (r < n && heapV[r] < heapV[m]) m = r; if (m === c) break; [heapK[m], heapK[c]] = [heapK[c], heapK[m]]; [heapV[m], heapV[c]] = [heapV[c], heapV[m]]; c = m; } return k; };
    for (const k of seeds) { out[k] = 0; push(k, 0); }
    while (n > 0) {
      const v0 = heapV[0], k = pop();
      if (v0 > out[k]) continue;
      const i = k % NX, j = (k - i) / NX;
      for (const [di, dj, w] of NB) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue;
        const kk = jj * NX + ii; if (!pass(kk)) continue;
        if (di && dj && (!pass(j * NX + ii) || !pass(jj * NX + i))) continue; // no corner cutting
        const nv = out[k] + w * CS * (costMul ? costMul(kk) : 1);
        if (nv < out[kk]) { out[kk] = nv; push(kk, nv); }
      }
    }
  }

  // barrel field: to the TARGET centre region, prefers >= 1.5 m clearance
  const T = layout.TARGET;
  const bField = new Float32Array(N);
  {
    const seeds = [];
    for (let k = 0; k < N; k++) { const i = k % NX, j = (k - i) / NX; const x = cx(i), z = cz(j); if (x > T.x0 + 0.6 && x < T.x1 - 0.6 && z > T.z0 + 0.6 && z < T.z1 - 0.3 && barrelMask[k]) seeds.push(k); }
    dijkstra(bField, seeds, (k) => barrelMask[k], (k) => 1 + 1.6 * Math.max(0, 1.6 - clr[k]) / 1.6);
  }
  // follow a field downhill from (x, z) for `steps` cells -> out point
  function downhill(field, x, z, steps, out) {
    let k = idxOf(x, z);
    if (k < 0 || !isFinite(field[k])) { // off the field: best finite neighbour within 2 cells
      let best = Infinity, bk = -1; const i0 = Math.floor((x - X0) / CS), j0 = Math.floor((z - Z0) / CS);
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
        const ii = i0 + di, jj = j0 + dj; if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue;
        const kk = jj * NX + ii; const v = field[kk] + Math.hypot(di, dj) * CS; if (v < best) { best = v; bk = kk; }
      }
      if (bk < 0) { out.x = x; out.z = z; return Infinity; }
      k = bk;
    }
    const v0 = field[k];
    for (let s = 0; s < steps; s++) {
      const i = k % NX, j = (k - i) / NX; let bk = k, bv = field[k];
      for (const [di, dj] of NB) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) continue; const kk = jj * NX + ii; if (field[kk] < bv) { bv = field[kk]; bk = kk; } }
      if (bk === k) break; k = bk;
    }
    const i = k % NX; out.x = cx(i); out.z = cz((k - i) / NX);
    return v0;
  }

  // --- player navigation ----------------------------------------------------------------------------
  const pField = new Float32Array(N);
  const blocked = new Uint8Array(N);
  let navGoal = { x: 0, z: 0 }, navT = 0;
  function planNav(gx, gz, barrels) {
    blocked.fill(0);
    for (const b of barrels) {
      if (b.delivered) continue;
      const R = 0.74, i0 = Math.floor((b.x - R - X0) / CS), i1 = Math.floor((b.x + R - X0) / CS), j0 = Math.floor((b.z - R - Z0) / CS), j1 = Math.floor((b.z + R - Z0) / CS);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { if (i < 0 || j < 0 || i >= NX || j >= NZ) continue; if (Math.hypot(cx(i) - b.x, cz(j) - b.z) < R) blocked[j * NX + i] = 1; }
    }
    const g = idxOf(gx, gz);
    dijkstra(pField, g >= 0 ? [g] : [], (k) => walkMask[k] && !blocked[k], null);
    navGoal.x = gx; navGoal.z = gz;
  }

  // --- the bot --------------------------------------------------------------------------------------
  const bot = { phase: 'pick', target: null, t: 0, stuck: 0, lastField: Infinity, pushT: 0, log: [] };
  const L = { x: 0, z: 0 }, W = { x: 0, z: 0 };
  function setStick(input, dx, dz, view, mag = 1) {
    const l = Math.hypot(dx, dz);
    if (l < 1e-4) { input.x = 0; input.y = 0; return; }
    dx /= l; dz /= l;
    const vy = view.inputYaw, fx = Math.sin(vy), fz = Math.cos(vy), rx = -Math.cos(vy), rz = Math.sin(vy);
    input.y = (dx * fx + dz * fz) * mag; input.x = (dx * rx + dz * rz) * mag;
  }

  function drive(dt, P, barrels, view, input) {
    bot.t += dt; navT -= dt;
    // target: the undelivered barrel nearest to the TARGET along the barrel field
    let b = bot.target;
    if (!b || b.delivered) {
      b = null; let best = Infinity;
      for (const c of barrels) { if (c.delivered) continue; const k = idxOf(c.x, c.z); const v = k >= 0 && isFinite(bField[k]) ? bField[k] : 999; if (v < best) { best = v; b = c; } }
      bot.target = b; bot.phase = 'approach'; bot.stuck = 0; bot.lastField = Infinity;
      if (!b) { input.x = 0; input.y = 0; return; }
    }
    // where the barrel should go next (3 m look-ahead along the field)
    const fv = downhill(bField, b.x, b.z, 6, L);
    let dx = L.x - b.x, dz = L.z - b.z, dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const rx = Math.sin(b.yaw), rz = Math.cos(b.yaw);
    const sg = rx * dx + rz * dz >= 0 ? 1 : -1, fx = sg * rx, fz = sg * rz; // barrel forward closest to the wanted direction
    const align = fx * dx + fz * dz;
    // push from behind along its rolling direction when it roughly points the right way, else from the side
    const ux = align > 0.6 ? fx : dx, uz = align > 0.6 ? fz : dz;
    const px = b.x - ux * 0.7, pz = b.z - uz * 0.7;       // contact point
    const ax = b.x - ux * 1.15, az = b.z - uz * 1.15;     // approach point (outside the nav block ring)

    // progress watchdog: if the barrel does not get closer for a while, re-approach (and try the other side)
    if (fv < bot.lastField - 0.3) { bot.lastField = fv; bot.stuck = 0; } else bot.stuck += dt;

    const toB = Math.hypot(b.x - P.x, b.z - P.z);
    const behindDot = ((b.x - P.x) * ux + (b.z - P.z) * uz) / (toB || 1);
    if (bot.phase === 'push') {
      bot.pushT += dt;
      const lostContact = toB > 1.25 || behindDot < 0.6 || (bot.pushT > 0.6 && !P.push && Math.abs(b.v) < 0.25 && align > 0.6);
      if (lostContact || bot.stuck > 5) { bot.phase = 'approach'; navT = 0; if (bot.stuck > 5) bot.stuck = 0, bot.lastField = Infinity; }
      else {
        // heading: rotate the barrel's forward toward the wanted direction by <= 38°
        const fa = Math.atan2(ux, uz);
        let want = Math.atan2(dx, dz);
        const d = Math.max(-0.66, Math.min(0.66, wrap(want - fa)));
        const h = fa + d;
        // aim slightly at the barrel centre so the contact stays square
        const cxp = b.x - P.x, czp = b.z - P.z;
        const hx = Math.sin(h) * 0.85 + (cxp / (toB || 1)) * 0.15, hz = Math.cos(h) * 0.85 + (czp / (toB || 1)) * 0.15;
        setStick(input, hx, hz, view, 1);
        return;
      }
    }
    // approach: walk to the approach point (grid path around barrels), then straight in
    bot.pushT = 0;
    const dA = Math.hypot(ax - P.x, az - P.z);
    if (dA < 0.3 || (behindDot > 0.92 && toB < 1.3)) {
      // final step in: walk at the contact point / barrel centre
      setStick(input, b.x - P.x, b.z - P.z, view, 0.8);
      if (toB < 0.85) bot.phase = 'push';
      return;
    }
    if (navT <= 0 || Math.hypot(navGoal.x - ax, navGoal.z - az) > 0.4) { planNav(ax, az, barrels); navT = 0.3; }
    if (dA < 1.0) { setStick(input, ax - P.x, az - P.z, view, Math.max(0.5, dA)); return; }
    const v = downhill(pField, P.x, P.z, 3, W);
    if (!isFinite(v)) { setStick(input, ax - P.x, az - P.z, view, 1); return; }
    setStick(input, W.x - P.x, W.z - P.z, view, 1);
  }

  return { drive, bot, bField, idxOf };
}
