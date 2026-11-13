import * as THREE from 'three';
import { getTextures, atlasRect, signRect } from './textures.js';
import {
  GeoBuilder, lin, mixCol, scaleCol, rngFactory, mat,
  makeLampGeometry, makeBroadTreeGeometry, makePoplarGeometry, makeSpruceGeometry, makeSheafGeometry,
  makePostGeometry, makeSleeperGeometry, makeAdColumnGeometry, addBench, addTrough, addTelegraphPole,
} from './props.js';

// ---------------------------------------------------------------------------------------------
// City corridor: road ribbon, curbs/sidewalks, town tenements, tram track + overhead wire, suburb villas,
// field road, railway + level crossing, street furniture.  (owner: city)
// Everything is merged per material (a few chunks along s for culling) or instanced.
// ---------------------------------------------------------------------------------------------

const BAY = 3.2;          // facade bay width
const H0 = 4.2;           // ground floor height
const HU = 3.3;           // upper storey height
const Y_ROAD = 0.02;
const Y_WALK = 0.16;
const RAIL_Y = 0.22;      // railway: top of rail head

const WALLS = [0xd9b877, 0xeadfc0, 0xb9c9a8, 0xdfa58e, 0xbdbab0, 0xa9b8be, 0xe2c4b4, 0xd8cf9a, 0xe6d3a0, 0xc9c1a6];
const VILLA_WALLS = [0xefe6c8, 0xe8d6a8, 0xd7e0c4, 0xf0d9c8, 0xe9e2d3, 0xe0dcb0];
const ROOFS = [0xb5603f, 0xa04b33, 0x8b4a38, 0x6c5a50, 0x5a5e66, 0xa8553a];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const yawOfDir = (dx, dz) => Math.atan2(-dz, dx); // yaw for GeoBuilder.box so that local +x follows (dx, dz)
function dyaw(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

export function buildCity(ctx) {
  const { scene, route, hazards } = ctx;
  const T = getTextures();
  const Z = {};
  route.zones.forEach((z) => { Z[z.id] = z; });
  const LEN = route.length;
  const NS = Math.floor(LEN);
  const R = rngFactory(1926);

  // ---------- frame cache (integer s) ----------
  const F = [];
  for (let i = 0; i <= NS + 1; i++) F.push(route.frameAt(Math.min(i, LEN)));
  const HW = F.map((_, i) => route.halfWidthAt(Math.min(i, LEN)));
  const hwAt = (s) => HW[Math.max(0, Math.min(NS, Math.round(s)))];
  const fr = (s) => F[Math.max(0, Math.min(NS, Math.round(s)))];
  const off = (s, lat) => { const f = fr(s); return [f.x + f.rx * lat, f.z + f.rz * lat]; };

  // sharp-turn windows (the two 90 degree corners)
  const corners = [];
  {
    let cur = null;
    for (let s = Z.town.s0; s < Z.town.s1; s++) {
      const k = Math.abs(dyaw(F[s - 3].yaw, F[s + 3].yaw)) / 6;
      if (k > 0.02) { if (!cur) cur = { s0: s, s1: s, turn: 0 }; cur.s1 = s; cur.turn += dyaw(F[s - 3].yaw, F[s + 3].yaw); }
      else if (cur && s - cur.s1 > 8) { corners.push(cur); cur = null; }
    }
    if (cur) corners.push(cur);
    corners.forEach((c) => { c.turn = Math.sign(c.turn); c.sMid = (c.s0 + c.s1) / 2; });
  }
  const inCorner = (s, pad = 0) => corners.some((c) => s >= c.s0 - pad && s <= c.s1 + pad);

  // ---------- materials ----------
  const roadMat = makeRoadMaterial(T);
  const stoneMat = new THREE.MeshLambertMaterial({ map: T.sidewalk, vertexColors: true });
  const facadeMat = new THREE.MeshLambertMaterial({ map: T.facade, vertexColors: true });
  const signMat = new THREE.MeshLambertMaterial({ map: T.signs });
  const propsMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const fenceMat = new THREE.MeshLambertMaterial({ map: T.fence, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const grassMat = new THREE.MeshLambertMaterial({ map: T.ground, vertexColors: true });
  const fieldMat = new THREE.MeshLambertMaterial({ map: T.field, vertexColors: true });
  const ballastMat = new THREE.MeshLambertMaterial({ map: T.macadam, vertexColors: true });
  const decalMat = new THREE.MeshLambertMaterial({ map: T.pothole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const columnMat = new THREE.MeshLambertMaterial({ map: T.poster, vertexColors: true });
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const wireMat = new THREE.LineBasicMaterial({ vertexColors: true });

  const add = (obj, { cast = false, receive = false } = {}) => { obj.castShadow = cast; obj.receiveShadow = receive; scene.add(obj); return obj; };

  // ===========================================================================================
  // ROAD RIBBON (+ side street surfaces)
  // ===========================================================================================
  const roadSamples = [];
  for (let s = 0; s < NS; s += (inCorner(s, 6) ? 1 : 2)) roadSamples.push(s);
  roadSamples.push(LEN);
  const sub0 = Z.suburb.s0, field0 = Z.field.s0, brew0 = Z.brewery.s0;
  const roadGeo = (() => {
    const pos = [], uv = [], nor = [], mix = [], idx = [];
    const addV = (x, y, z, u, v, mx, my) => { pos.push(x, y, z); nor.push(0, 1, 0); uv.push(u, v); mix.push(mx, my); return pos.length / 3 - 1; };
    roadSamples.forEach((s, i) => {
      const f = route.frameAt(s), w = route.halfWidthAt(s);
      const dirt = smooth(field0 - 40, field0 + 10, s) * (1 - smooth(brew0 - 30, brew0 - 5, s));
      const mac = smooth(sub0 - 20, sub0 + 40, s) * (1 - smooth(field0 - 40, field0 + 10, s)) * (1 - smooth(brew0 - 30, brew0 - 5, s));
      addV(f.x - f.rx * w, Y_ROAD, f.z - f.rz * w, -w, s, mac, dirt);
      addV(f.x + f.rx * w, Y_ROAD, f.z + f.rz * w, w, s, mac, dirt);
      if (i > 0) { const a = (i - 1) * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
    });
    return { pos, uv, nor, mix, idx, addV };
  })();
  const roadQuad = (p0, p1, p2, p3, y = 0.025) => { // free quad (world-uv, setts)
    const { addV, idx } = roadGeo;
    const a = addV(p0[0], y, p0[1], p0[0], p0[1], 0, 0), b = addV(p1[0], y, p1[1], p1[0], p1[1], 0, 0);
    const c = addV(p2[0], y, p2[1], p2[0], p2[1], 0, 0), d = addV(p3[0], y, p3[1], p3[0], p3[1], 0, 0);
    // make it face up whatever the input order
    const cr = (p1[0] - p0[0]) * (p3[1] - p0[1]) - (p1[1] - p0[1]) * (p3[0] - p0[0]);
    if (cr < 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };

  // ===========================================================================================
  // SIDEWALKS + CURBS
  // ===========================================================================================
  const walk = new GeoBuilder();
  const sidewalkWidth = (s, side) => {
    if (s < Z.town.s0) { return side < 0 ? 2.78 : 0; }             // square: only the east side (plaza side is built by 'landmarks')
    if (s < Z.town.s1 - 12) return side > 0 && s < Z.town.s0 + 2 ? 0 : 2.78;
    if (s < sub0 + 8) return THREE.MathUtils.lerp(2.78, 1.78, smooth(Z.town.s1 - 12, sub0 + 8, s));
    if (s < field0 - 35) return 1.78;
    if (s < field0 - 8) return 1.78 * (1 - smooth(field0 - 35, field0 - 8, s));
    return 0;
  };
  // right side starts where the square exit begins
  const sExit = route.project(route.anchors.squareExit.x, route.anchors.squareExit.z).s;
  const swRight = (s) => (s < sExit ? 0 : sidewalkWidth(Math.max(s, Z.town.s0), 1));
  const swFn = (s, side) => (side > 0 ? swRight(s) : sidewalkWidth(s, -1));

  for (const side of [-1, 1]) {
    let prev = null;
    for (const s of roadSamples) {
      const w = swFn(s, side);
      if (w < 0.05) { prev = null; continue; }
      const f = fr(s), hw = hwAt(s);
      const cur = { s, w, hw, f };
      if (prev && s - prev.s <= 3) {
        const lat = (c, k) => side * (c.hw + k);
        const P = (c, k, y) => [c.f.x + c.f.rx * lat(c, k), y, c.f.z + c.f.rz * lat(c, k)];
        const ws = [1, 1, 1];
        // sidewalk top
        walk.quad(P(prev, 0.22, Y_WALK), P(prev, 0.22 + prev.w, Y_WALK), P(cur, 0.22 + cur.w, Y_WALK), P(cur, 0.22, Y_WALK),
          [(prev.hw + 0.22) / 2, prev.s / 2, (prev.hw + 0.22 + prev.w) / 2, cur.s / 2], ws, [0, 1, 0]);
        // curb top (lighter)
        walk.quad(P(prev, 0, Y_WALK), P(prev, 0.22, Y_WALK), P(cur, 0.22, Y_WALK), P(cur, 0, Y_WALK),
          [0.1, prev.s / 2, 0.2, cur.s / 2], [1.08, 1.08, 1.08], [0, 1, 0]);
        // curb face towards the road
        walk.quad(P(prev, 0, Y_ROAD), P(cur, 0, Y_ROAD), P(cur, 0, Y_WALK), P(prev, 0, Y_WALK),
          [prev.s / 2, 0, cur.s / 2, 0.07], [0.78, 0.78, 0.78], [-side * f.rx, 0, -side * f.rz]);
        // outer face
        walk.quad(P(prev, 0.22 + prev.w, 0), P(cur, 0.22 + cur.w, 0), P(cur, 0.22 + cur.w, Y_WALK), P(prev, 0.22 + prev.w, Y_WALK),
          [prev.s / 2, 0, cur.s / 2, 0.07], [0.6, 0.6, 0.6], [side * f.rx, 0, side * f.rz]);
      }
      prev = cur;
    }
  }

  // ===========================================================================================
  // GRASS VERGES (suburb -> field), both sides
  // ===========================================================================================
  const verge = new GeoBuilder();
  for (const side of [-1, 1]) {
    for (let s = field0 - 40; s < brew0 - 25; s += 3) {
      const s1 = s + 3;
      const a = (k, ss) => { const f = fr(ss), hw = hwAt(ss); return [f.x + f.rx * side * (hw + k), 0.015, f.z + f.rz * side * (hw + k)]; };
      const fade = smooth(field0 - 40, field0 - 8, s);
      const c1 = mixCol([0.5, 0.55, 0.3], [0.30, 0.38, 0.17], 0.5 + 0.4 * Math.sin(s * 0.3));
      verge.quad(a(-0.1, s), a(1.6, s), a(1.6, s1), a(-0.1, s1), [0, s / 5, 0.4, s1 / 5], scaleCol(c1, 1), [0, 1, 0]);
      verge.quad(a(1.6, s), a(3.4, s), a(3.4, s1), a(1.6, s1), [0.4, s / 5, 0.8, s1 / 5], scaleCol(c1, 1.15), [0, 1, 0]);
      void fade;
    }
  }

  // ===========================================================================================
  // BUILDINGS (town tenements, closures, suburb villas) -> chunked facade + sign meshes
  // ===========================================================================================
  const CHUNK = 190;
  const chunks = new Map();
  const getChunk = (s) => {
    const k = Math.floor(s / CHUNK);
    if (!chunks.has(k)) chunks.set(k, { fac: new GeoBuilder(), sgn: new GeoBuilder() });
    return chunks.get(k);
  };

  const makePiece = (P, Q, ref) => {
    let ex = Q[0] - P[0], ez = Q[1] - P[1];
    const len = Math.hypot(ex, ez); ex /= len; ez /= len;
    let nx = -ez, nz = ex;
    const mx = (P[0] + Q[0]) / 2, mz = (P[1] + Q[1]) / 2;
    if ((ref[0] - mx) * nx + (ref[1] - mz) * nz < 0) { nx = -nx; nz = -nz; }
    if (ex * nz - ez * nx < 0) { const t = P; P = Q; Q = t; ex = -ex; ez = -ez; }
    return { P, Q, ex, ez, nx, nz, dx: -nx, dz: -nz, len };
  };
  const pt = (pc, t, v, w) => [pc.P[0] + pc.ex * t + pc.dx * w, v, pc.P[1] + pc.ez * t + pc.dz * w];

  const PL = atlasRect('PLASTER'), BRICK = atlasRect('BRICK'), ROOF = atlasRect('ROOF');
  const AWN = [atlasRect('AWN_A'), atlasRect('AWN_B')];

  /** local box: faces front/back/left/right/top/bottom (all with the plaster cell unless given) */
  function lbox(B, pc, t0, t1, v0, v1, w0, w1, col, rect = PL, bottomDark = 0.55) {
    const hn = [pc.nx, 0, pc.nz], hd = [pc.dx, 0, pc.dz], he = [pc.ex, 0, pc.ez], hme = [-pc.ex, 0, -pc.ez];
    B.quad(pt(pc, t0, v0, w0), pt(pc, t1, v0, w0), pt(pc, t1, v1, w0), pt(pc, t0, v1, w0), rect, col, hn);
    B.quad(pt(pc, t1, v0, w1), pt(pc, t0, v0, w1), pt(pc, t0, v1, w1), pt(pc, t1, v1, w1), rect, col, hd);
    B.quad(pt(pc, t0, v0, w1), pt(pc, t0, v0, w0), pt(pc, t0, v1, w0), pt(pc, t0, v1, w1), rect, col, hme);
    B.quad(pt(pc, t1, v0, w0), pt(pc, t1, v0, w1), pt(pc, t1, v1, w1), pt(pc, t1, v1, w0), rect, col, he);
    B.quad(pt(pc, t0, v1, w0), pt(pc, t1, v1, w0), pt(pc, t1, v1, w1), pt(pc, t0, v1, w1), rect, col, [0, 1, 0]);
    B.quad(pt(pc, t0, v0, w1), pt(pc, t1, v0, w1), pt(pc, t1, v0, w0), pt(pc, t0, v0, w0), rect, scaleCol(lin(col), bottomDark), [0, -1, 0]);
  }

  /** roof over one piece. profile = [[w, v], ...] (v relative to vBase) */
  function addRoof(B, pc, profile, vBase, roofCol, wallCol, withCaps = true) {
    for (let j = 0; j < profile.length - 1; j++) {
      const [w0, v0] = profile[j], [w1, v1] = profile[j + 1];
      let nw = -(v1 - v0), nv = (w1 - w0);
      if (nv < 0) { nw = -nw; nv = -nv; }
      const nl = Math.hypot(nw, nv); nw /= nl; nv /= nl;
      const hint = [pc.dx * nw, nv, pc.dz * nw];
      const lowFirst = v0 <= v1;
      const [wa, va] = lowFirst ? [w0, v0] : [w1, v1];
      const [wb, vb] = lowFirst ? [w1, v1] : [w0, v0];
      const segLen = Math.hypot(w1 - w0, v1 - v0);
      B.gridQuad(pt(pc, 0, vBase + va, wa), pt(pc, pc.len, vBase + va, wa), pt(pc, pc.len, vBase + vb, wb), pt(pc, 0, vBase + vb, wb),
        Math.max(1, Math.ceil(pc.len / 3)), Math.max(1, Math.ceil(segLen / 2.4)), ROOF, roofCol, hint);
    }
    if (withCaps) {
      const base = profile[0][1];
      const pivot = [(profile[0][0] + profile[profile.length - 1][0]) / 2, base];
      for (const t of [0, pc.len]) {
        const hint = t === 0 ? [-pc.ex, 0, -pc.ez] : [pc.ex, 0, pc.ez];
        const c = (p) => pt(pc, t, vBase + p[1], p[0]);
        for (let j = 0; j < profile.length - 1; j++) {
          B.tri(c(pivot), c(profile[j]), c(profile[j + 1]), PLC, PLC, PLC, lin(wallCol), hint);
        }
        // uvs inside the plaster cell
      }
    }
  }
  // plaster uv fix: tri() above uses (0.5,0.5) -> make it point into the plaster cell
  const PLC = [(PL[0] + PL[2]) / 2, (PL[1] + PL[3]) / 2];

  function addChimney(B, pc, t, vRidge, w) {
    lbox(B, pc, t - 0.4, t + 0.4, vRidge - 0.6, vRidge + 1.7, w - 0.4, w + 0.4, [0.92, 0.9, 0.88], BRICK);
    lbox(B, pc, t - 0.5, t + 0.5, vRidge + 1.7, vRidge + 1.9, w - 0.5, w + 0.5, [0.35, 0.33, 0.31], PL);
  }

  function addDormer(B, pc, t, wD, vSlopeAt, roofCol, wallCol, tanP) {
    const hw = 0.72, d = 1.9;
    const vb = vSlopeAt(wD) - 0.05;
    const h = 1.55;
    // front
    B.quad(pt(pc, t - hw, vb, wD), pt(pc, t + hw, vb, wD), pt(pc, t + hw, vb + h, wD), pt(pc, t - hw, vb + h, wD), atlasRect('U7'), wallCol, [pc.nx, 0, pc.nz]);
    // cheeks
    for (const sgn of [-1, 1]) {
      const tt = t + sgn * hw;
      B.quad(pt(pc, tt, vb - 0.5, wD), pt(pc, tt, vb - 0.5, wD + d), pt(pc, tt, vb + h, wD + d), pt(pc, tt, vb + h, wD), PL, wallCol, [sgn * pc.ex, 0, sgn * pc.ez]);
    }
    const apex = vb + h + 0.62;
    const rf = 0.14;
    for (const sgn of [-1, 1]) {
      const tt = t + sgn * (hw + rf);
      const hint = [sgn * pc.ex * 0.6, 0.8, sgn * pc.ez * 0.6];
      B.quad(pt(pc, tt, vb + h, wD - 0.12), pt(pc, tt, vb + h, wD + d), pt(pc, t, apex, wD + d), pt(pc, t, apex, wD - 0.12), ROOF, roofCol, hint);
    }
    B.tri(pt(pc, t - hw - rf, vb + h, wD - 0.05), pt(pc, t + hw + rf, vb + h, wD - 0.05), pt(pc, t, apex, wD - 0.05), PLC, PLC, PLC, lin(wallCol), [pc.nx, 0, pc.nz]);
    void tanP;
  }

  // ---------- one facade piece ----------
  function buildPiece(B, S, pc, spec, pieceIdx) {
    const nb = Math.max(1, Math.round(pc.len / BAY)), bw = pc.len / nb;
    const U = spec.floors - 1, Htop = H0 + HU * U;
    const hn = [pc.nx, 0, pc.nz];
    const wallC = lin(spec.wall), gC = mixCol(wallC, [1, 1, 1], 0.32), gDark = scaleCol(gC, 0.82);
    const trimC = mixCol(wallC, [1, 1, 1], 0.45);
    const isCorner = pc.corner;
    // ground floor
    const gate = spec.gateBay != null ? spec.gateBay % nb : -1;
    for (let i = 0; i < nb; i++) {
      const t0 = i * bw, t1 = t0 + bw;
      let cell;
      if (spec.ground === 'villa') cell = (i === Math.floor(nb / 2) ? 'G5' : 'G4');
      else if (i === gate && pieceIdx === 0 && !isCorner) cell = 'G2';
      else if (isCorner && i === Math.floor(nb / 2)) cell = 'G1';
      else if (spec.ground === 'pub') cell = 'G3';
      else cell = ((i + (spec.seed | 0)) % 3 === 1) ? 'G1' : 'G0';
      B.quad(pt(pc, t0, 0, 0), pt(pc, t1, 0, 0), pt(pc, t1, H0, 0), pt(pc, t0, H0, 0), atlasRect(cell), gDark, hn, gC);
      spec._cells = spec._cells || [];
      // awnings on shop bays
      if ((cell === 'G0' || cell === 'G1') && spec.awning && i !== gate && ((i + (spec.seed | 0)) % 2 === 0)) {
        const rect = AWN[(i + (spec.seed | 0)) % 2];
        const out = 1.35;
        B.quad(pt(pc, t0 + 0.1, 3.0, -out), pt(pc, t1 - 0.1, 3.0, -out), pt(pc, t1 - 0.1, 3.55, -0.05), pt(pc, t0 + 0.1, 3.55, -0.05), rect, [1, 1, 1], [pc.nx * 0.5, 0.85, pc.nz * 0.5]);
        B.quad(pt(pc, t0 + 0.1, 2.72, -out), pt(pc, t1 - 0.1, 2.72, -out), pt(pc, t1 - 0.1, 3.0, -out), pt(pc, t0 + 0.1, 2.72 + 0.28, -out), rect, [0.95, 0.95, 0.95], hn);
      }
    }
    // signs over shop bays (separate atlas)
    if (spec.signs && nb >= 2) {
      let j = 0;
      for (const sg of spec.signs) {
        while (j < nb - 1 && (j === gate || j + 1 === gate)) j++;
        if (j >= nb - 1) break;
        const span = nb - j >= 3 && (spec.seed + j) % 3 === 0 ? 3 : 2;
        const t0 = j * bw + 0.2, t1 = Math.min(nb, j + span) * bw - 0.2;
        if (t1 - t0 > 7.2) { /* keep sign proportions reasonable */ }
        const tm = (t0 + t1) / 2, hw2 = Math.min((t1 - t0) / 2, 3.4);
        S.quad(pt(pc, tm - hw2, H0 - 1.12, -0.09), pt(pc, tm + hw2, H0 - 1.12, -0.09), pt(pc, tm + hw2, H0 - 0.28, -0.09), pt(pc, tm - hw2, H0 - 0.28, -0.09), signRect(sg), [1, 1, 1], hn);
        j += span;
      }
    }
    // upper floors
    for (let f = 1; f <= U; f++) {
      const v0 = H0 + HU * (f - 1), v1 = v0 + HU;
      for (let i = 0; i < nb; i++) {
        const t0 = i * bw, t1 = t0 + bw;
        let cell;
        if (spec.ground === 'villa') cell = (spec.style === 1 ? 'U1' : 'U0');
        else if (i === gate && pieceIdx === 0 && !isCorner) cell = 'U6';
        else if (spec.style === 2) cell = (f >= 2 && i === Math.floor(nb / 2) && nb >= 3) ? 'U4' : 'U3';
        else if (spec.style === 1) cell = f === 1 ? 'U2' : ((i + f) % 4 === 3 && nb > 3 ? 'U6' : 'U0');
        else cell = f === 1 ? (i % 2 ? 'U1' : 'U2') : (f === U && U >= 3 ? 'U1' : 'U0');
        if (f === 1 && spec.rich && i === Math.floor(nb / 2)) cell = 'U5';
        const shade = 1 - 0.0 * f;
        B.quad(pt(pc, t0, v0, 0), pt(pc, t1, v0, 0), pt(pc, t1, v1, 0), pt(pc, t0, v1, 0), atlasRect(cell), scaleCol(wallC, shade), hn);
      }
    }
    // string course + crown cornice
    lbox(B, pc, -0.05, pc.len + 0.05, H0 - 0.1, H0 + 0.16, -0.2, 0, trimC);
    lbox(B, pc, -0.12, pc.len + 0.12, Htop - 0.08, Htop + 0.5, -0.6, 0.0, trimC);
    // balcony
    if (spec.rich && U >= 1 && nb >= 2) {
      const tc = Math.floor(nb / 2) * bw + bw / 2, hb = bw * 0.44;
      lbox(B, pc, tc - hb, tc + hb, H0 + 0.62, H0 + 0.78, -0.95, 0, trimC);
      lbox(B, pc, tc - hb, tc + hb, H0 + 0.78, H0 + 1.5, -0.95, -0.9, [0.16, 0.15, 0.15]);
      lbox(B, pc, tc - hb, tc - hb + 0.05, H0 + 0.78, H0 + 1.5, -0.95, 0, [0.16, 0.15, 0.15]);
      lbox(B, pc, tc + hb - 0.05, tc + hb, H0 + 0.78, H0 + 1.5, -0.95, 0, [0.16, 0.15, 0.15]);
    }
    // end walls + back wall (plain)
    const D = spec.depth;
    const ends = scaleCol(wallC, 0.92);
    B.quad(pt(pc, 0, 0, D), pt(pc, 0, 0, 0), pt(pc, 0, Htop + 0.5, 0), pt(pc, 0, Htop + 0.5, D), PL, ends, [-pc.ex, 0, -pc.ez]);
    B.quad(pt(pc, pc.len, 0, 0), pt(pc, pc.len, 0, D), pt(pc, pc.len, Htop + 0.5, D), pt(pc, pc.len, Htop + 0.5, 0), PL, ends, [pc.ex, 0, pc.ez]);
    B.quad(pt(pc, pc.len, 0, D), pt(pc, 0, 0, D), pt(pc, 0, Htop + 0.5, D), pt(pc, pc.len, Htop + 0.5, D), PL, ends, [pc.dx, 0, pc.dz]);

    // windows on the side walls of free-standing houses
    if (spec.sideWindows) {
      const nD = Math.max(1, Math.floor(D / 3.4)), bD = D / nD;
      for (let f = 0; f <= U; f++) {
        const v0 = f === 0 ? 0 : H0 + HU * (f - 1), v1 = f === 0 ? H0 : v0 + HU;
        const cell = atlasRect(f === 0 ? 'G4' : 'U0');
        const col = f === 0 ? gC : wallC;
        for (let i = 0; i < nD; i++) {
          const w0 = i * bD, w1 = w0 + bD;
          B.quad(pt(pc, -0.015, v0, w1), pt(pc, -0.015, v0, w0), pt(pc, -0.015, v1, w0), pt(pc, -0.015, v1, w1), cell, col, [-pc.ex, 0, -pc.ez]);
          B.quad(pt(pc, pc.len + 0.015, v0, w0), pt(pc, pc.len + 0.015, v0, w1), pt(pc, pc.len + 0.015, v1, w1), pt(pc, pc.len + 0.015, v1, w0), cell, col, [pc.ex, 0, pc.ez]);
        }
      }
    }

    // roof
    const vBase = Htop + 0.45;
    const roofCol = lin(spec.roof);
    if (spec.roofType === 'hip') {
      addHipRoof(B, pc, D, vBase, spec.pitch, roofCol);
      if (spec.dormers && pc.len > 6) addDormer(B, pc, pc.len / 2, 1.5, (w) => vBase + (w + 0.45) * Math.tan(spec.pitch), roofCol, wallC, 0);
      if (spec.chimneys) { const rise = Math.min(D, pc.len) / 2 * Math.tan(spec.pitch); addChimney(B, pc, pc.len * 0.3, vBase + rise * 0.55, D * 0.5); }
    } else {
      const tanP = Math.tan(spec.pitch), rise = (D / 2 + 0.5) * tanP;
      const profile = [[-0.5, 0], [D / 2, rise], [D + 0.5, 0]];
      addRoof(B, pc, profile, vBase, roofCol, wallC);
      const vSlope = (w) => vBase + (w + 0.5) * tanP;
      if (spec.dormers && pc.len > 5) {
        const n = Math.max(1, Math.floor(pc.len / 5.5));
        for (let i = 0; i < n; i++) addDormer(B, pc, (i + 0.5) * pc.len / n, 1.0, vSlope, roofCol, wallC, tanP);
      }
      if (spec.chimneys) {
        for (let i = 0; i < spec.chimneys; i++) addChimney(B, pc, pc.len * (0.2 + 0.6 * ((i * 0.37 + spec.seed * 0.13) % 1)), vBase + rise, D / 2 + 0.2);
      }
      if (spec.frontispiece && !isCorner && nb >= 4) {
        const tc = pc.len * (0.5 + ((spec.seed % 3) - 1) * 0.1);
        const hb = bw * 0.95, h1 = 2.7, apexH = 1.9;
        lbox(B, pc, tc - hb, tc + hb, Htop + 0.45, Htop + 0.45 + h1, -0.25, 3.2, wallC, PL);
        B.quad(pt(pc, tc - hb, Htop + 0.45, -0.26), pt(pc, tc + hb, Htop + 0.45, -0.26), pt(pc, tc + hb, Htop + 0.45 + h1, -0.26), pt(pc, tc - hb, Htop + 0.45 + h1, -0.26), atlasRect('U7'), wallC, hn);
        B.tri(pt(pc, tc - hb - 0.3, Htop + 0.45 + h1, -0.27), pt(pc, tc + hb + 0.3, Htop + 0.45 + h1, -0.27), pt(pc, tc, Htop + 0.45 + h1 + apexH, -0.27), PLC, PLC, PLC, trimC, hn);
        lbox(B, pc, tc - hb - 0.4, tc + hb + 0.4, Htop + 0.45 + h1 - 0.05, Htop + 0.45 + h1 + 0.2, -0.45, 0.0, trimC);
        for (const sg of [-1, 1]) {
          B.quad(pt(pc, tc + sg * (hb + 0.3), Htop + 0.45 + h1, -0.27), pt(pc, tc + sg * (hb + 0.3), Htop + 0.45 + h1, 3.2), pt(pc, tc, Htop + 0.45 + h1 + apexH, 3.2), pt(pc, tc, Htop + 0.45 + h1 + apexH, -0.27),
            ROOF, roofCol, [sg * pc.ex * 0.6, 0.8, sg * pc.ez * 0.6]);
        }
      }
    }
  }

  function addHipRoof(B, pc, D, vBase, pitch, roofCol) {
    const o = 0.45, len = pc.len;
    const ins = Math.min(len + 2 * o, D + 2 * o) / 2;
    const rise = ins * Math.tan(pitch);
    const tA = -o, tB = len + o, wA = -o, wB = D + o;
    const top = { t0: tA + ins, t1: tB - ins, w0: wA + ins, w1: wB - ins };
    const v = vBase;
    const nrm = (nt, nw) => { const l = Math.hypot(nt, nw, 1); return [(pc.ex * nt + pc.dx * nw) / l, 1 / l * Math.tan(pitch) * 0 + Math.sin(pitch), (pc.ez * nt + pc.dz * nw) / l]; };
    void nrm;
    const hintOf = (nt, nw) => [pc.ex * nt * 0.6 + pc.dx * nw * 0.6, 0.8, pc.ez * nt * 0.6 + pc.dz * nw * 0.6];
    const q = (a, b, c, d, nt, nw, nu, nv) => B.gridQuad(a, b, c, d, nu, nv, ROOF, roofCol, hintOf(nt, nw));
    q(pt(pc, tA, v, wA), pt(pc, tB, v, wA), pt(pc, top.t1, v + rise, top.w0), pt(pc, top.t0, v + rise, top.w0), 0, -1, Math.ceil(len / 3), 2);
    q(pt(pc, tB, v, wB), pt(pc, tA, v, wB), pt(pc, top.t0, v + rise, top.w1), pt(pc, top.t1, v + rise, top.w1), 0, 1, Math.ceil(len / 3), 2);
    q(pt(pc, tB, v, wA), pt(pc, tB, v, wB), pt(pc, top.t1, v + rise, top.w1), pt(pc, top.t1, v + rise, top.w0), 1, 0, Math.ceil(D / 3), 2);
    q(pt(pc, tA, v, wB), pt(pc, tA, v, wA), pt(pc, top.t0, v + rise, top.w0), pt(pc, top.t0, v + rise, top.w1), -1, 0, Math.ceil(D / 3), 2);
  }

  // ---------- corner turret on the knee of a convex multi-piece facade ----------
  function addTurret(B, K, nAvg, spec, Htop) {
    const rad = 1.85, cx = K[0] - nAvg[0] * 1.05, cz = K[1] - nAvg[1] * 1.05;
    const wallC = lin(spec.wall), trimC = mixCol(wallC, [1, 1, 1], 0.45), roofC = [0.2, 0.34, 0.27];
    const nSeg = 8, v0 = H0 + 0.1, v1 = Htop + 1.6;
    const ang = (i) => Math.atan2(nAvg[1], nAvg[0]) + (i / nSeg) * Math.PI * 2 + Math.PI / nSeg;
    const P = (i, v, r = rad) => [cx + Math.cos(ang(i)) * r, v, cz + Math.sin(ang(i)) * r];
    const storeys = Math.max(1, Math.round((v1 - v0) / HU));
    const sh = (v1 - v0) / storeys;
    for (let st = 0; st < storeys; st++) {
      for (let i = 0; i < nSeg; i++) {
        const a = P(i, v0 + st * sh), b = P(i + 1, v0 + st * sh), c = P(i + 1, v0 + (st + 1) * sh), d = P(i, v0 + (st + 1) * sh);
        const mid = [(a[0] + b[0]) / 2 - cx, 0, (a[2] + b[2]) / 2 - cz];
        // faces turned away from the street stay hidden anyway; orientation: a->b runs counter-clockwise seen from above
        B.quad(b, a, d, c, atlasRect(st === 0 ? 'U1' : 'U0'), wallC, mid);
      }
    }
    for (let i = 0; i < nSeg; i++) { // corbel (inverted pyramid) under the oriel
      const a = P(i, v0), b = P(i + 1, v0), tip = [cx, v0 - 1.4, cz];
      B.tri(a, b, tip, PLC, PLC, PLC, wallC, [(a[0] + b[0]) / 2 - cx, -0.5, (a[2] + b[2]) / 2 - cz]);
    }
    for (let i = 0; i < nSeg; i++) { // ring cornice + spire
      const a = P(i, v1, rad + 0.25), b = P(i + 1, v1, rad + 0.25), tip = [cx, v1 + 4.6, cz];
      B.tri(a, b, tip, [ROOF[0] + 0.05, ROOF[1] + 0.05], [ROOF[2] - 0.05, ROOF[1] + 0.05], [(ROOF[0] + ROOF[2]) / 2, ROOF[3] - 0.05], roofC, [(a[0] + b[0]) / 2 - cx, 0.8, (a[2] + b[2]) / 2 - cz]);
      const a0 = P(i, v1 - 0.25, rad + 0.25), b0 = P(i + 1, v1 - 0.25, rad + 0.25);
      B.quad(b0, a0, a, b, PL, trimC, [(a[0] + b[0]) / 2 - cx, 0, (a[2] + b[2]) / 2 - cz]);
    }
    B.box(cx, v1 + 4.5, cz, 0.12, 0.9, 0.12, 0, [0.15, 0.14, 0.13]);
  }

  // ---------- town building specs ----------
  const SIGN_SHOP = [1, 2, 3, 4, 5, 6, 7];
  function townSpec(Rn, i, floorsHint) {
    const floors = floorsHint || (Rn() < 0.22 ? 3 : Rn() < 0.6 ? 4 : 5);
    const style = Rn() < 0.4 ? 0 : (Rn() < 0.55 ? 1 : 2);
    const kind = Rn();
    const ground = kind < 0.14 ? 'pub' : 'shops';
    let signs;
    if (ground === 'pub') signs = [Rn() < 0.5 ? 0 : 5];
    else signs = [SIGN_SHOP[Math.floor(Rn() * SIGN_SHOP.length)], SIGN_SHOP[Math.floor(Rn() * SIGN_SHOP.length)]];
    return {
      floors, style, ground, signs, wall: WALLS[Math.floor(Rn() * WALLS.length)], roof: ROOFS[Math.floor(Rn() * ROOFS.length)],
      pitch: (32 + Rn() * 10) * Math.PI / 180, roofType: 'gable', depth: 12, gateBay: Math.floor(Rn() * 4),
      rich: Rn() < 0.45, awning: Rn() < 0.7, dormers: Rn() < 0.7, chimneys: 1 + (Rn() < 0.5 ? 1 : 0), frontispiece: Rn() < 0.4,
      seed: i + Math.floor(Rn() * 7),
    };
  }

  function clearanceOf(points) {
    let minC = 99;
    for (let i = 0; i < points.length - 1; i++) {
      for (let k = 0; k <= 4; k++) {
        const t = k / 4;
        const x = points[i][0] + (points[i + 1][0] - points[i][0]) * t, z = points[i][1] + (points[i + 1][1] - points[i][1]) * t;
        const p = route.project(x, z);
        const c = Math.abs(p.lateral) - route.halfWidthAt(p.s);
        if (c < minC) minC = c;
      }
    }
    return minC;
  }

  /** place a building along [i0, i1] (integer s) on `side`; facade offset = hw + gap */
  function placeBuilding(side, i0, i1, gap, spec, opts = {}) {
    const maxAng = (opts.maxAng || 0.5);
    const dy = dyaw(fr(i0).yaw, fr(i1).yaw);
    const k = Math.max(1, Math.ceil(Math.abs(dy) / maxAng));
    const sList = [i0];
    for (let j = 1; j < k; j++) {
      const target = Math.abs(dy) * j / k;
      let s = i0;
      while (s < i1 && Math.abs(dyaw(fr(i0).yaw, fr(s).yaw)) < target) s++;
      sList.push(s);
    }
    sList.push(i1);
    let shift = 0;
    const build = (sh) => sList.map((s) => off(s, side * (hwAt(s) + gap + sh)));
    let pts = build(0);
    const need = (opts.minClear || 2.2);
    const c = clearanceOf(pts);
    if (c < need) { shift = need - c; pts = build(shift); }
    const sMid = (i0 + i1) / 2, fm = fr(sMid);
    const ref = [fm.x, fm.z];
    const ch = getChunk(sMid);
    const pieces = [];
    for (let j = 0; j < pts.length - 1; j++) {
      if (Math.hypot(pts[j + 1][0] - pts[j][0], pts[j + 1][1] - pts[j][1]) < 1.2) continue;
      const pc = makePiece(pts[j], pts[j + 1], ref);
      pc.corner = k > 1 && pts.length > 2;
      pieces.push(pc);
    }
    pieces.forEach((pc, idx) => buildPiece(ch.fac, ch.sgn, pc, spec, idx));
    // turret on the convex corner (inside of the 90 degree turns)
    if (opts.turret && pieces.length >= 2) {
      const mid = Math.floor((pts.length - 1) / 2);
      const K = pts[mid];
      const pa = pieces[Math.max(0, mid - 1)], pb = pieces[Math.min(pieces.length - 1, mid)];
      let nx = pa.nx + pb.nx, nz = pa.nz + pb.nz; const l = Math.hypot(nx, nz) || 1;
      addTurret(ch.fac, K, [nx / l, nz / l], spec, H0 + HU * (spec.floors - 1));
    }
    return pieces;
  }

  // walk a side from sA to sB
  function runSide(side, sA, sB, gaps, seed) {
    const Rn = rngFactory(seed);
    let i = Math.round(sA), idx = 0, lastFloors = 0;
    const end = Math.round(sB);
    while (i < end - 3) {
      const gp = gaps.find((g) => i >= g.s0 - 1 && i < g.s1);
      if (gp) { i = gp.s1; continue; }
      let want = 10 + Rn() * 8;
      let j = i, acc = 0;
      let prevP = off(i, side * (hwAt(i) + 3));
      const gapAhead = gaps.find((g) => g.s0 > i);
      const limit = gapAhead ? Math.min(end, gapAhead.s0) : end;
      while (j < limit && acc < want) {
        j++;
        const p = off(j, side * (hwAt(j) + 3));
        acc += Math.hypot(p[0] - prevP[0], p[1] - prevP[1]); prevP = p;
      }
      if (limit - j < 7) j = limit;
      if (j - i < 4) { i = j; continue; }
      let fl = Rn() < 0.22 ? 3 : Rn() < 0.6 ? 4 : 5;
      if (fl === lastFloors) fl = fl === 4 ? (Rn() < 0.5 ? 3 : 5) : 4;
      lastFloors = fl;
      const spec = townSpec(Rn, idx++, fl);
      const inside = corners.find((c) => c.turn === -side && j >= c.s0 - 6 && i <= c.s1 + 6 && (c.sMid >= i && c.sMid <= j));
      const nearCorner = corners.some((c) => j >= c.s0 - 6 && i <= c.s1 + 6);
      if (nearCorner) { spec.floors = Math.max(4, spec.floors); spec.frontispiece = false; spec.dormers = true; }
      placeBuilding(side, i, j, 3.0, spec, { maxAng: 0.5, turret: !!inside });
      i = j;
    }
  }

  // ---------- side street gaps (avenue) ----------
  const avenueA = Math.max(...corners.map((c) => c.s1)) + 25;
  const gapsL = [{ s0: avenueA + 55, s1: avenueA + 63 }, { s0: avenueA + 170, s1: avenueA + 178 }];
  const gapsR = [{ s0: avenueA + 105, s1: avenueA + 113 }, { s0: avenueA + 215, s1: avenueA + 223 }];
  const townA = Z.town.s0, townB = Z.town.s1;
  runSide(-1, townA, townB, gapsL, 101);
  runSide(1, townA, townB, gapsR, 202);

  function sideStreet(side, g) {
    const sMid = (g.s0 + g.s1) / 2;
    const f = fr(sMid);
    const hw = hwAt(sMid);
    const a = off(g.s0, side * (hw + 3.2)), b = off(g.s1, side * (hw + 3.2));
    const dir = [side * f.rx, side * f.rz];
    const depth = 24;
    const a2 = [a[0] + dir[0] * depth, a[1] + dir[1] * depth], b2 = [b[0] + dir[0] * depth, b[1] + dir[1] * depth];
    roadQuad(a, b, b2, a2, 0.026);
    // closing building across the end of the side street
    const mid = [(a2[0] + b2[0]) / 2 + dir[0] * 0.5, (a2[1] + b2[1]) / 2 + dir[1] * 0.5];
    const along = [f.tx, f.tz];
    const P = [mid[0] - along[0] * 14, mid[1] - along[1] * 14], Q = [mid[0] + along[0] * 14, mid[1] + along[1] * 14];
    const pc = makePiece(P, Q, [f.x, f.z]);
    const spec = townSpec(rngFactory(Math.floor(sMid) * 7), 3, 4);
    spec.gateBay = 2; spec.depth = 12; spec.frontispiece = false;
    const ch = getChunk(sMid);
    buildPiece(ch.fac, ch.sgn, pc, spec, 0);
    // wedge of plain wall filling the corners next to the opening is provided by neighbours' side walls
  }
  gapsL.forEach((g) => sideStreet(-1, g));
  gapsR.forEach((g) => sideStreet(1, g));

  // ---------- suburb villas ----------
  const gardens = { fence: new GeoBuilder(), solid: new GeoBuilder() };
  const trees = { broad: [], poplar: [], spruce: [] };
  function suburb() {
    const gb = gardens.solid, fb = gardens.fence;
    for (const side of [-1, 1]) {
      const Rn = rngFactory(side > 0 ? 303 : 404);
      let i = sub0 + 4 + Math.floor(Rn() * 8);
      const end = field0 - 22;
      while (i < end - 14) {
        const roll = Rn();
        const lotLen = 24 + Math.floor(Rn() * 18);
        if (roll < 0.18) { // open meadow / orchard gap
          for (let k = 0; k < 2; k++) {
            const s = i + 5 + k * 12 + Rn() * 6;
            const p = off(s, side * (hwAt(s) + 9 + Rn() * 14));
            (Rn() < 0.7 ? trees.broad : trees.spruce).push({ x: p[0], z: p[1], s: 0.8 + Rn() * 0.5, r: Rn() * 6 });
          }
          i += lotLen; continue;
        }
        const w = 9 + Rn() * 4, setback = 6 + Rn() * 8;
        const s0 = i + 3 + Rn() * 4, s1 = s0 + w;
        const spec = {
          floors: 2, style: Rn() < 0.5 ? 0 : 1, ground: 'villa', wall: VILLA_WALLS[Math.floor(Rn() * VILLA_WALLS.length)],
          roof: ROOFS[Math.floor(Rn() * 3)], pitch: (30 + Rn() * 8) * Math.PI / 180, roofType: 'hip', depth: 8.5 + Rn() * 2,
          chimneys: 1, seed: Math.floor(Rn() * 9), rich: false, dormers: Rn() < 0.6, sideWindows: true,
        };
        const pieces = placeBuilding(side, Math.round(s0), Math.round(s1), setback, spec, { maxAng: 0.9, minClear: 5 });
        void pieces;
        // garden: fence along the sidewalk edge, hedge on the plot sides, trees behind
        const fenceLat = hwAt(s0) + 2.35;
        const f0 = off(i + 1, side * fenceLat), f1 = off(i + lotLen - 1, side * (hwAt(i + lotLen) + 2.35));
        const dx = f1[0] - f0[0], dz = f1[1] - f0[1], fl = Math.hypot(dx, dz);
        const hedge = Rn() < 0.4;
        const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        if (hedge) {
          const m = lerp(f0, f1, 0.5);
          gb.box(m[0], 0, m[1], fl, 1.15, 0.8, yawOfDir(dx, dz), [0.16, 0.30, 0.10], [0, 0, 1, 1], [0.24, 0.40, 0.14]);
        } else {
          const col = Rn() < 0.5 ? [0.85, 0.82, 0.72] : [0.30, 0.42, 0.26];
          const fc = (p, y) => [p[0], y, p[1]];
          const n = [(-dz / fl) * side * -1, 0, (dx / fl) * side * -1];
          fb.quad(fc(f0, 0), fc(f1, 0), fc(f1, 1.15), fc(f0, 1.15), [0, 0, fl / 1.6, 1], col, n);
        }
        // side hedges (plot sides), from the sidewalk to the villa
        for (const e of [f0, f1]) {
          const fo = off(0, 0);
          void fo;
          const nx = side * fr(i + (e === f0 ? 1 : lotLen - 1)).rx, nz = side * fr(i + (e === f0 ? 1 : lotLen - 1)).rz;
          const len = setback + 3;
          gb.box(e[0] + nx * len / 2, 0, e[1] + nz * len / 2, 0.5, 0.9, len, yawOfDir(nz, nx) , [0.20, 0.33, 0.12], [0, 0, 1, 1], [0.27, 0.42, 0.16]);
        }
        // garden trees / spruces
        const ts = i + 4 + Rn() * (lotLen - 8);
        const tp = off(ts, side * (hwAt(ts) + setback + 11 + Rn() * 6));
        trees.broad.push({ x: tp[0], z: tp[1], s: 0.9 + Rn() * 0.5, r: Rn() * 6 });
        if (Rn() < 0.6) { const q = off(i + 2 + Rn() * 6, side * (hwAt(i) + 3.6 + Rn() * 2)); trees.spruce.push({ x: q[0], z: q[1], s: 0.8 + Rn() * 0.5, r: 0 }); }
        i += lotLen;
      }
    }
  }
  suburb();

  // a small chapel (suburb, left) and a pub with a garden (right) - built as villas with other specs
  (function landmarksOfSuburb() {
    const s = Math.round(sub0 + 150);
    const pubSpec = { floors: 2, style: 1, ground: 'pub', signs: [9], wall: 0xe6d3a0, roof: 0x8b4a38, pitch: 0.62, roofType: 'gable', depth: 10, gateBay: 9, seed: 1, rich: false, dormers: true, chimneys: 2, awning: false, sideWindows: true };
    // find a free-ish lot: put the pub further back with a gravel garden and a few lime trees
    const gap = 5;
    placeBuilding(1, s, s + 18, gap, pubSpec, { maxAng: 0.9, minClear: 4.5 });
    for (let k = 0; k < 4; k++) {
      const p = off(s + 3 + k * 4.2, 1 * (hwAt(s) + gap - 2.2));
      trees.broad.push({ x: p[0], z: p[1], s: 0.7, r: k });
    }
  })();

  // ===========================================================================================
  // TRAM TRACK + OVERHEAD WIRE + POLES (town)
  // ===========================================================================================
  const metal = new GeoBuilder();
  const wires = { pos: [], col: [] };
  const wireSeg = (a, b, c = [0.12, 0.11, 0.1]) => { wires.pos.push(a[0], a[1], a[2], b[0], b[1], b[2]); wires.col.push(...c, ...c); };
  const trackA = Z.town.s0 - 20, trackB = Z.town.s1 + 6;
  {
    const GAUGE = 0.5; // 1 m gauge: rails at +/- 0.5
    for (let s = trackA; s < trackB; s += (inCorner(s, 4) ? 1 : 2)) {
      const s1 = Math.min(s + (inCorner(s, 4) ? 1 : 2), trackB);
      const fa = fr(s), fb = fr(s1);
      for (const lat of [-GAUGE, GAUGE]) {
        const A = (k, f) => [f.x + f.rx * (lat + k), 0.052, f.z + f.rz * (lat + k)];
        const sg = (k, f, y) => [f.x + f.rx * (lat + k), y, f.z + f.rz * (lat + k)];
        metal.quad(sg(-0.15, fa, 0.03), sg(0.15, fa, 0.03), sg(0.15, fb, 0.03), sg(-0.15, fb, 0.03), [0, 0, 1, 1], [0.10, 0.09, 0.08], [0, 1, 0]);
        metal.quad(A(-0.045, fa), A(0.045, fa), A(0.045, fb), A(-0.045, fb), [0, 0, 1, 1], [0.42, 0.41, 0.39], [0, 1, 0]);
      }
    }
  }
  const poleS = [];
  {
    let s = townA + 12;
    while (s < townB - 6) {
      if (inCorner(s, 3)) { s += 4; continue; }
      poleS.push(Math.round(s));
      s += 30;
    }
  }
  const POLE_TOP = 6.9;
  poleS.forEach((s) => {
    const hw = hwAt(s), f = fr(s);
    const ends = [];
    for (const side of [-1, 1]) {
      const p = off(s, side * (hw + 0.32));
      metal.addGeometry(new THREE.CylinderGeometry(0.1, 0.15, 7.2, 6), mat(p[0], 3.6, p[1]), 0x34383a);
      metal.addGeometry(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 6), mat(p[0], 0.12, p[1]), 0x2a2d2f);
      metal.box(p[0], 6.85, p[1], 0.18, 0.3, 0.18, 0, [0.2, 0.2, 0.2]);
      ends.push([p[0], POLE_TOP, p[1]]);
    }
    // span wire with sag and a hanger to the contact wire
    const N = 6;
    let prev = ends[0];
    for (let k = 1; k <= N; k++) {
      const t = k / N;
      const q = [ends[0][0] + (ends[1][0] - ends[0][0]) * t, POLE_TOP - 0.45 * 4 * t * (1 - t), ends[0][2] + (ends[1][2] - ends[0][2]) * t];
      wireSeg(prev, q); prev = q;
    }
    wireSeg([f.x, POLE_TOP - 0.45, f.z], [f.x, 5.6, f.z], [0.2, 0.18, 0.16]);
  });
  // contact wire along lateral 0 at 5.6 m
  {
    const stations = [townA - 6, ...poleS, townB + 2];
    for (let a = 0; a < stations.length - 1; a++) {
      const sA = stations[a], sB = stations[a + 1];
      const span = sB - sA, sag = 0.12 + span * 0.0035;
      const step = inCorner((sA + sB) / 2, 20) ? 1.5 : 3;
      let prev = null;
      for (let s = sA; s <= sB + 0.01; s += step) {
        const ss = Math.min(s, sB);
        const f = fr(ss), u = (ss - sA) / span;
        const p = [f.x, 5.6 - sag * 4 * u * (1 - u), f.z];
        if (prev) wireSeg(prev, p);
        prev = p;
      }
    }
  }

  // ===========================================================================================
  // STREET FURNITURE: lamps, trees, columns, benches, trough
  // ===========================================================================================
  const lampPts = [];
  const lampS = [];
  {
    let s = townA + 26, side = 1;
    while (s < townB - 4) {
      if (!inCorner(s, 2) && !poleS.some((p) => Math.abs(p - s) < 5)) {
        const p = off(s, side * (hwAt(s) + 0.7));
        lampPts.push([p[0], p[1]]); lampS.push(s);
      }
      s += 26; side = -side;
    }
    s = sub0 + 20; side = 1;
    while (s < field0 - 40) {
      const p = off(s, side * (hwAt(s) + 0.6));
      lampPts.push([p[0], p[1]]); lampS.push(s);
      s += 55; side = -side;
    }
    // square exit: two lamps on the left sidewalk
    for (const ss of [28, 60]) { const p = off(ss, -(hwAt(ss) + 0.7)); lampPts.push([p[0], p[1]]); }
  }
  // town trees (lindens) along the avenue
  {
    const RT = rngFactory(555);
    for (const side of [-1, 1]) {
      let s = avenueA + 8 + RT() * 10;
      while (s < townB - 12) {
        const near = poleS.some((p) => Math.abs(p - s) < 4.5) || lampS.some((p) => Math.abs(p - s) < 3.5)
          || [...gapsL, ...gapsR].some((g) => s > g.s0 - 6 && s < g.s1 + 6);
        if (!near && RT() < 0.72 && !inCorner(s, 6)) {
          const p = off(s, side * (hwAt(s) + 1.15));
          trees.broad.push({ x: p[0], z: p[1], s: 0.78 + RT() * 0.28, r: RT() * 6, shadow: true });
        }
        s += 18 + RT() * 10;
      }
    }
    // leg A/B: just a couple of trees in the square exit
    for (const ss of [Z.town.s0 + 14]) { const p = off(ss, -(hwAt(ss) + 1.15)); trees.broad.push({ x: p[0], z: p[1], s: 0.85, r: 1 }); }
  }
  const props = new GeoBuilder();
  const columns = [];
  {
    for (const [ss, side] of [[Z.town.s0 + 22, -1], [avenueA + 40, 1], [avenueA + 140, -1], [avenueA + 235, 1]]) {
      const p = off(ss, side * (hwAt(ss) + 1.3)); columns.push(p);
    }
    const benchSpots = [[Z.town.s0 + 36, -1], [avenueA + 90, 1], [avenueA + 130, 1], [avenueA + 190, -1], [avenueA + 250, -1]];
    benchSpots.forEach(([ss, side]) => {
      const f = fr(ss), p = off(ss, side * (hwAt(ss) + 1.9));
      addBench(props, p[0], p[1], Math.atan2(-side * f.rx, -side * f.rz));
    });
    const tp = off(Z.town.s0 + 30, 1 * (hwAt(Z.town.s0 + 30) + 1.5));
    addTrough(props, tp[0], tp[1], yawOfDir(fr(Z.town.s0 + 30).tx, fr(Z.town.s0 + 30).tz));
  }

  // ===========================================================================================
  // FIELD: ploughed patches, sheaves, telegraph line, posts, rails + level crossing, potholes
  // ===========================================================================================
  const fields = new GeoBuilder();
  const sheaves = [];
  const RF = rngFactory(808);
  const railZ = route.anchors.rail.z, cross = route.anchors.railCrossing;
  {
    const FIELD_COLS = [[0.62, 0.45, 0.30], [0.78, 0.68, 0.36], [0.45, 0.58, 0.28], [0.58, 0.50, 0.34], [0.84, 0.76, 0.46], [0.40, 0.52, 0.26]];
    let s = field0 - 55, n = 0;
    while (s < Z.brewery.s0 - 60) {
      const len = 34 + RF() * 34, gapLat = 2.0 + RF() * 3, wid = 38 + RF() * 40;
      const sa = s, sb = s + len;
      const pa = off(sa, -(hwAt(sa) + gapLat)), pb = off(sb, -(hwAt(sb) + gapLat));
      const pa2 = off(sa, -(hwAt(sa) + gapLat + wid)), pb2 = off(sb, -(hwAt(sb) + gapLat + wid));
      const zs = [pa[1], pb[1], pa2[1], pb2[1]];
      const crossesRail = Math.min(...zs) < railZ + 5 && Math.max(...zs) > railZ - 5;
      if (!crossesRail) {
        const col = FIELD_COLS[n % FIELD_COLS.length];
        const rot = RF() < 0.5;
        const fc = (p) => [p[0], 0.012, p[1]];
        const u = len / 7, vv = wid / 7;
        fields.quad(fc(pa), fc(pb), fc(pb2), fc(pa2), rot ? [0, 0, vv, u] : [0, 0, u, vv], col, [0, 1, 0]);
        if (col[0] > 0.76 && RF() < 1) { // harvested: rows of stooks
          const rows = 3, per = Math.floor(len / 4.2);
          for (let r = 0; r < rows; r++) for (let q = 0; q < per; q++) {
            const ss = sa + 3 + q * 4.2, lat = hwAt(ss) + gapLat + 6 + r * 6.5 + RF() * 0.6;
            const p = off(ss, -lat);
            sheaves.push([p[0], p[1], RF() * 6, 0.85 + RF() * 0.35]);
          }
        }
        n++;
      }
      s = sb + 6 + RF() * 20;
    }
  }
  // far patchwork: big fields on both sides of the suburb/field road (outside the villa gardens, away from rail + brewery)
  {
    const RG = rngFactory(1313);
    const far = [[0.60, 0.72, 0.34], [0.74, 0.66, 0.36], [0.52, 0.42, 0.28], [0.80, 0.74, 0.44], [0.44, 0.60, 0.28], [0.66, 0.58, 0.38], [0.36, 0.50, 0.24]];
    for (const side of [-1, 1]) {
      let s = sub0 + 70;
      while (s < Z.brewery.s0 - 60) {
        const len = 50 + RG() * 55;
        const sa = s, sb = Math.min(s + len, Z.brewery.s0 - 40);
        let lat = 46 + RG() * 8;
        for (let row = 0; row < 4; row++) {
          const wid = 45 + RG() * 60;
          const q = [off(sa, side * lat), off(sb, side * lat), off(sb, side * (lat + wid)), off(sa, side * (lat + wid))];
          lat += wid + 1 + RG() * 3;
          const zs = q.map((p) => p[1]), xs = q.map((p) => p[0]);
          if (Math.min(...zs) < railZ + 7 && Math.max(...zs) > railZ - 7) continue;
          if (q.some((p) => p[0] < 12 && p[1] > 700)) continue;
          if (q.some((p) => p[0] < 12 && p[0] > -320 && p[1] > 700)) continue;
          const col = far[Math.floor(RG() * far.length)].map((c) => c * (0.9 + 0.2 * RG()));
          const rot = RG() < 0.5;
          const l = Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), wv = wid;
          fields.quad([q[0][0], 0.01, q[0][1]], [q[1][0], 0.01, q[1][1]], [q[2][0], 0.01, q[2][1]], [q[3][0], 0.01, q[3][1]], rot ? [0, 0, wv / 8, l / 8] : [0, 0, l / 8, wv / 8], col, [0, 1, 0]);
          void xs;
        }
        s = sb + 4 + RG() * 25;
      }
    }
  }
  // trees / hedgerows at the field edges + a roadside tree line along the left
  for (let s = field0 + 5; s < Z.brewery.s0 - 30; s += 22 + RF() * 40) {
    if (Math.abs(s - cross.s) < 30) continue;
    const p = off(s, -(hwAt(s) + 4 + RF() * 10));
    (RF() < 0.4 ? trees.poplar : trees.broad).push({ x: p[0], z: p[1], s: 0.8 + RF() * 0.6, r: RF() * 6 });
  }
  // telegraph line along the left of the road: suburb S-bend + field
  const teleS = [];
  for (let s = sub0 + 40; s < Z.brewery.s0 - 25; s += 42) { if (Math.abs(s - cross.s) > 8) teleS.push(s); }
  {
    const prevTop = [];
    teleS.forEach((s, i) => {
      const lat = -(hwAt(s) + (s < field0 ? 2.9 : 1.6));
      const p = off(s, lat);
      const f = fr(s);
      const yaw = yawOfDir(f.rx, f.rz);
      addTelegraphPole(metal, p[0], p[1], yaw);
      const tops = [-0.55, -0.18, 0.18, 0.55].map((o, k) => [p[0] + f.rx * o * 1.3, 6.55 + (k % 2 ? 0 : 0.0), p[1] + f.rz * o * 1.3]);
      const lower = [[p[0] + f.rx * -0.5, 5.95, p[1] + f.rz * -0.5], [p[0] + f.rx * 0.5, 5.95, p[1] + f.rz * 0.5]];
      const all = [...tops, ...lower];
      if (prevTop.length) {
        const span = Math.hypot(all[0][0] - prevTop[0][0], all[0][2] - prevTop[0][2]);
        all.forEach((q, k) => {
          const a = prevTop[k];
          let last = a;
          for (let m = 1; m <= 4; m++) {
            const t = m / 4;
            const pp = [a[0] + (q[0] - a[0]) * t, a[1] + (q[1] - a[1]) * t - span * 0.012 * 4 * t * (1 - t), a[2] + (q[2] - a[2]) * t];
            wireSeg(last, pp, [0.16, 0.14, 0.12]); last = pp;
          }
        });
      }
      prevTop.length = 0; all.forEach((q) => prevTop.push(q));
      void i;
    });
  }
  // roadside white posts in the field
  const postPts = [];
  for (const side of [-1, 1]) {
    for (let s = field0 + 6; s < Z.brewery.s0 - 20; s += 9) {
      if (Math.abs(s - cross.s) < 8) continue;
      if (side > 0 && s > Z.brewery.s0 - 90) continue;
      const p = off(s, side * (hwAt(s) + 0.45));
      postPts.push(p);
    }
  }

  // ----- railway along z = railZ from x = 320 to x = -6, level crossing at the road -----
  const rails = { ballast: new GeoBuilder() };
  const RAIL_X0 = -6, RAIL_X1 = route.anchors.rail.fromX;
  const GAUGE_R = 1.435 / 2;
  const sleeperPts = [];
  {
    const xc = cross.x, hwC = hwAt(cross.s) + 0.5;
    const inRoad = (x) => x > xc - hwC - 0.2 && x < xc + hwC + 0.2;
    // ballast bed (trapezoid), interrupted at the road
    const bed = (xa, xb) => {
      const yTop = 0.06, w1 = 1.55, w2 = 2.5;
      const P = (x, z, y) => [x, y, z];
      for (const sg of [-1, 1]) {
        rails.ballast.quad(P(xa, railZ + sg * w1, yTop), P(xb, railZ + sg * w1, yTop), P(xb, railZ + sg * w1 * 0.4, yTop), P(xa, railZ + sg * w1 * 0.4, yTop), [xa / 4, 0, xb / 4, 0.4], [0.62, 0.6, 0.56], [0, 1, 0]);
        rails.ballast.quad(P(xa, railZ + sg * w2, -0.1), P(xb, railZ + sg * w2, -0.1), P(xb, railZ + sg * w1, yTop), P(xa, railZ + sg * w1, yTop), [xa / 4, 0.4, xb / 4, 0.8], [0.5, 0.48, 0.45], [0, 0.5, sg]);
      }
      // centre strip between the rails
      rails.ballast.quad(P(xa, railZ - w1 * 0.4, yTop), P(xb, railZ - w1 * 0.4, yTop), P(xb, railZ + w1 * 0.4, yTop), P(xa, railZ + w1 * 0.4, yTop), [xa / 4, 0, xb / 4, 0.3], [0.55, 0.53, 0.5], [0, 1, 0]);
    };
    bed(xc + hwC + 0.2, RAIL_X1);
    bed(RAIL_X0, xc - hwC - 0.2);
    // sleepers
    for (let x = RAIL_X0 + 0.5; x < RAIL_X1; x += 0.66) { if (!inRoad(x)) sleeperPts.push(x); }
    // rails (top 0.22) including the crossing
    for (const sg of [-1, 1]) {
      const z = railZ + sg * GAUGE_R;
      for (let x = RAIL_X0; x < RAIL_X1; x += 4) {
        const xb = Math.min(x + 4, RAIL_X1);
        const top = (xx) => [xx, RAIL_Y, 0];
        void top;
        const q = (x0, x1, y0, y1, z0, z1, col, hint) => metal.quad([x0, y0, z0], [x1, y0, z0 + (z1 - z0) * 0], [x1, y1, z1], [x0, y1, z1], [0, 0, 1, 1], col, hint);
        void q;
        const steel = [0.36, 0.35, 0.33], dark = [0.16, 0.15, 0.14];
        const hz = 0.035;
        metal.quad([x, RAIL_Y, z - hz], [xb, RAIL_Y, z - hz], [xb, RAIL_Y, z + hz], [x, RAIL_Y, z + hz], [0, 0, 1, 1], steel, [0, 1, 0]);
        metal.quad([x, 0.08, z - hz * 1.4], [xb, 0.08, z - hz * 1.4], [xb, RAIL_Y, z - hz], [x, RAIL_Y, z - hz], [0, 0, 1, 1], dark, [0, 0, -1]);
        metal.quad([xb, 0.08, z + hz * 1.4], [x, 0.08, z + hz * 1.4], [x, RAIL_Y, z + hz], [xb, RAIL_Y, z + hz], [0, 0, 1, 1], dark, [0, 0, 1]);
      }
    }
    // crossing deck + ramps (road surface rises to the rail head)
    const fx = fr(cross.s);
    const dirT = [fx.tx, fx.tz], dirR = [fx.rx, fx.rz];
    const w = hwAt(cross.s) + 0.3;
    const DECK = 0.19;
    const C = (ds, lat, y) => [cross.x + dirT[0] * ds + dirR[0] * lat, y, cross.z + dirT[1] * ds + dirR[1] * lat];
    const wood = [0.30, 0.22, 0.14], stone = [0.42, 0.38, 0.33];
    const ramp = (d0, d1, y0, y1, col) => {
      metal.quad(C(d0, -w, y0), C(d0, w, y0), C(d1, w, y1), C(d1, -w, y1), [0, 0, 1, 1], col, [0, 1, 0]);
    };
    ramp(-1.6, 1.6, DECK, DECK, wood);
    ramp(-4.4, -1.6, 0.03, DECK, stone);
    ramp(1.6, 4.4, DECK, 0.03, stone);
    // plank lines
    for (let ds = -1.4; ds < 1.5; ds += 0.4) metal.quad(C(ds, -w, DECK + 0.004), C(ds, w, DECK + 0.004), C(ds + 0.03, w, DECK + 0.004), C(ds + 0.03, -w, DECK + 0.004), [0, 0, 1, 1], [0.12, 0.09, 0.06], [0, 1, 0]);
    // side walls of the ramps (so nothing is see-through)
    for (const sg of [-1, 1]) {
      metal.quad(C(-4.4, sg * w, 0.0), C(4.4, sg * w, 0.0), C(1.6, sg * w, DECK), C(-1.6, sg * w, DECK), [0, 0, 1, 1], stone, [dirR[0] * sg, 0, dirR[1] * sg]);
    }
    // St Andrew's crosses (both sides, both directions of the road) + "POZOR VLAK!" boards
    const sgn = new GeoBuilder();
    for (const side of [-1, 1]) {
      for (const ds of [-6.5, 6.5]) {
        if (side > 0 && ds < 0) continue; // keep it light: three assemblies
        const lat = side * (hwAt(cross.s) + 1.4);
        const p = C(ds, lat, 0);
        const yaw = yawOfDir(dirR[0], dirR[1]);
        metal.box(p[0], 0, p[2], 0.12, 2.9, 0.12, yaw, [0.9, 0.9, 0.88]);
        // X cross: two slats at +-45 degrees facing the road traffic
        const face = ds < 0 ? 1 : -1; // facing towards approaching traffic
        for (const rot of [Math.PI / 4, -Math.PI / 4]) {
          const cxz = [p[0] + dirT[0] * face * 0.08, p[2] + dirT[1] * face * 0.08];
          const hx = Math.cos(rot) * 0.0, hy = Math.sin(rot);
          void hx; void hy;
          // build a slat as 4 vertices in the plane spanned by road-right and up
          const half = 0.82, wd = 0.1;
          const r = [dirR[0], dirR[1]];
          const cu = Math.cos(rot), su = Math.sin(rot);
          const centre = [cxz[0], 2.55, cxz[1]];
          const dirv = (a, b) => [centre[0] + r[0] * a * cu * 1 + 0, centre[1] + a * su + b * cu, centre[2] + r[1] * a * cu];
          const sl = [dirv(-half, -wd), dirv(half, -wd), dirv(half, wd), dirv(-half, wd)];
          const hint = [dirT[0] * -face, 0, dirT[1] * -face];
          metal.quad(sl[0], sl[1], sl[2], sl[3], [0, 0, 1, 1], [0.78, 0.12, 0.1], hint);
          metal.quad(sl[0], sl[1], sl[2], sl[3], [0, 0, 1, 1], [0.78, 0.12, 0.1], [-hint[0], 0, -hint[2]]);
        }
        // board
        const bq = (a, b) => [p[0] + dirT[0] * face * 0.1 + dirR[0] * a, b, p[2] + dirT[1] * face * 0.1 + dirR[1] * a];
        sgn.quad(bq(-1.15, 1.45), bq(1.15, 1.45), bq(1.15, 1.9), bq(-1.15, 1.9), signRect(8), [1, 1, 1], [dirT[0] * -face, 0, dirT[1] * -face]);
        metal.box(p[0] + dirT[0] * face * 0.06, 1.42, p[2] + dirT[1] * face * 0.06, 2.4, 0.06, 0.05, yaw, [0.12, 0.12, 0.12]);
      }
    }
    const sm = sgn.toMesh(signMat, { cast: false, receive: true });
    scene.add(sm);
    // keeper's house on the left, before the crossing
    const keeper = getChunk(cross.s);
    const p0 = C(-18, -(hwAt(cross.s) + 5.5), 0), p1 = C(-8, -(hwAt(cross.s) + 5.5), 0);
    const kpc = makePiece([p0[0], p0[2]], [p1[0], p1[2]], [cross.x, cross.z]);
    buildPiece(keeper.fac, keeper.sgn, kpc, {
      floors: 2, style: 0, ground: 'villa', wall: 0xe6d6a8, roof: 0x8b4a38, pitch: 0.6, roofType: 'hip', depth: 6, seed: 2, chimneys: 1, rich: false, dormers: false, sideWindows: true,
    }, 0);
  }

  // ===========================================================================================
  // HAZARDS + decals
  // ===========================================================================================
  const decals = new GeoBuilder();
  const hazardList = [];
  const hz = (s, lateral, radius, strength) => { const h = { s, lateral, radius, strength }; hazards.push(h); hazardList.push(h); };
  // worn patches in town
  hz(avenueA + 25, 2.4, 1.5, 0.35);
  hz(avenueA + 85, -2.2, 1.6, 0.4);
  hz(avenueA + 150, 1.8, 1.4, 0.35);
  hz(avenueA + 205, -1.2, 1.6, 0.45);
  hz(cross.s, 0, 4.5, 0.5); // railway crossing
  // field potholes
  [[field0 + 24, -1.9, 1.1, 0.55], [field0 + 48, 1.6, 1.3, 0.6], [field0 + 71, -0.6, 1.0, 0.5], [field0 + 96, 2.1, 1.2, 0.65],
    [field0 + 118, -2.3, 1.4, 0.7], [cross.s - 34, 0.9, 1.1, 0.55], [cross.s + 36, -1.4, 1.2, 0.6]].forEach((a) => hz(...a));
  for (const h of hazardList) {
    if (h.s === cross.s) continue;
    const f = fr(h.s);
    const cx = f.x + f.rx * h.lateral, cz = f.z + f.rz * h.lateral;
    const r = h.radius * 1.55;
    const yaw = yawOfDir(f.tx, f.tz);
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const q = (lx, lz) => [cx + lx * c + lz * sn, 0.034, cz - lx * sn + lz * c];
    decals.quad(q(-r, -r), q(r, -r), q(r, r), q(-r, r), [0, 0, 1, 1], [1, 1, 1], [0, 1, 0]);
  }

  // ===========================================================================================
  // finalize meshes
  // ===========================================================================================
  // road
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(roadGeo.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(roadGeo.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(roadGeo.uv, 2));
    g.setAttribute('aMix', new THREE.Float32BufferAttribute(roadGeo.mix, 2));
    g.setIndex(roadGeo.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, roadMat);
    m.receiveShadow = true; scene.add(m);
  }
  add(walk.toMesh(stoneMat), { receive: true });
  add(verge.toMesh(grassMat), { receive: true });
  add(fields.toMesh(fieldMat), { receive: true });
  add(rails.ballast.toMesh(ballastMat), { receive: true });
  add(metal.toMesh(propsMat), { cast: true, receive: true });
  add(props.toMesh(propsMat), { cast: true, receive: true });
  add(gardens.solid.toMesh(propsMat), { cast: true, receive: true });
  add(gardens.fence.toMesh(fenceMat), { cast: true, receive: true });
  add(decals.toMesh(decalMat));
  for (const ch of chunks.values()) {
    if (ch.fac.triCount) add(ch.fac.toMesh(facadeMat), { cast: true, receive: true });
    if (ch.sgn.triCount) add(ch.sgn.toMesh(signMat), { receive: true });
  }
  // wires
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wires.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(wires.col, 3));
    g.computeBoundingSphere();
    scene.add(new THREE.LineSegments(g, wireMat));
  }
  // ad columns
  if (columns.length) {
    const im = new THREE.InstancedMesh(makeAdColumnGeometry(), columnMat, columns.length);
    const m4 = new THREE.Matrix4();
    columns.forEach((p, i) => { m4.makeTranslation(p[0], 0, p[1]); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  }
  // lamps
  {
    const im = new THREE.InstancedMesh(makeLampGeometry(), propsMat, lampPts.length);
    const m4 = new THREE.Matrix4();
    lampPts.forEach((p, i) => { m4.makeTranslation(p[0], 0, p[1]); im.setMatrixAt(i, m4); });
    im.castShadow = true; im.receiveShadow = true; scene.add(im);
  }
  // trees (3 kinds)
  const inst = (geom, list) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geom, treeMat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    list.forEach((t, i) => {
      e.set(0, t.r, 0); q.setFromEuler(e);
      m4.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + 0.2 * ((i * 0.37) % 1)), t.s));
      im.setMatrixAt(i, m4);
      c.setRGB(0.85 + 0.25 * ((i * 0.618) % 1), 0.88 + 0.2 * ((i * 0.31) % 1), 0.8 + 0.2 * ((i * 0.77) % 1));
      im.setColorAt(i, c);
    });
    im.castShadow = true; im.receiveShadow = false;
    im.frustumCulled = true;
    scene.add(im);
  };
  inst(makeBroadTreeGeometry(), trees.broad);
  inst(makePoplarGeometry(), trees.poplar);
  inst(makeSpruceGeometry(), trees.spruce);
  // sheaves, posts, sleepers
  {
    const im = new THREE.InstancedMesh(makeSheafGeometry(), propsMat, Math.max(1, sheaves.length));
    const m4 = new THREE.Matrix4();
    sheaves.forEach((p, i) => { m4.compose(new THREE.Vector3(p[0], 0, p[1]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p[2]), new THREE.Vector3(p[3], p[3], p[3])); im.setMatrixAt(i, m4); });
    im.count = sheaves.length; im.castShadow = true; scene.add(im);
    const pm = new THREE.InstancedMesh(makePostGeometry(), propsMat, Math.max(1, postPts.length));
    postPts.forEach((p, i) => { m4.makeTranslation(p[0], 0, p[1]); pm.setMatrixAt(i, m4); });
    pm.count = postPts.length; pm.castShadow = true; scene.add(pm);
    const sl = new THREE.InstancedMesh(makeSleeperGeometry(), new THREE.MeshLambertMaterial({ color: 0x4a3a2c }), sleeperPts.length);
    sleeperPts.forEach((x, i) => { m4.makeTranslation(x, 0.1, railZ); sl.setMatrixAt(i, m4); });
    sl.receiveShadow = true; sl.castShadow = false;
    // sleepers run along z (rail direction is x): rotate by 90 degrees about Y -> geometry is 2.6 long on z already
    scene.add(sl);
  }

  return { update() {} };
}

// -----------------------------------------------------------------------------------------------
// road material: Lambert + 3-way blend of setts / macadam / dirt road by a per-vertex weight
// -----------------------------------------------------------------------------------------------
function makeRoadMaterial(T) {
  const m = new THREE.MeshLambertMaterial({ map: T.setts, color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.mapB = { value: T.macadam };
    sh.uniforms.mapC = { value: T.dirt };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aMix;\nvarying vec2 vMix;\nvarying vec2 vRUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMix = aMix; vRUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D mapB;\nuniform sampler2D mapC;\nvarying vec2 vMix;\nvarying vec2 vRUv;')
      .replace('#include <map_fragment>', `
        vec4 tA = texture2D( map, vRUv / 3.0 );
        vec4 tB = texture2D( mapB, vRUv / 4.0 );
        vec4 tC = texture2D( mapC, vec2( vRUv.x / 4.0 + 0.5, vRUv.y / 4.0 ) );
        float wB = clamp( vMix.x, 0.0, 1.0 ), wC = clamp( vMix.y, 0.0, 1.0 );
        diffuseColor *= tA * ( 1.0 - wB - wC ) + tB * wB + tC * wC;
      `);
  };
  m.customProgramCacheKey = () => 'cityRoad';
  return m;
}
