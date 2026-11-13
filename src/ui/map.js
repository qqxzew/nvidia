// Main menu → Levels: a 3D map of the Světovar site (owner: ui).
//
// The model is the real level-1 Světovar already in the scene. On top of it, one x-ray overlay shows where
// every level happens (src/core/sites.js, level-1 world coordinates from the 1912 plan + 1:250 sections):
//   · translucent boxes for LEVEL_SITES[].volumes, drawn THROUGH the buildings (depthTest off) + crisp outlines,
//   · the floor slabs of those buildings at the real heights of BUILDINGS (so you can read the storey),
//   · level 1: the end of the drive (gate → finish) as a ribbon on the ground,
//   · level 4: the catwalk course LEVEL4_ROUTE as a ribbon at the deck heights.
// Everything is merged into 2 draw calls (fill mesh + outline lines); highlighting rewrites vertex colours
// only when the highlighted level changes. Numbered DOM pins are projected from the 3D points every frame.
//
// createMap(ctx, { host, leftEdge, onOpen, onHighlight }) → { open(), close(), reset(), update(dt, rig), highlight(id), active, highlighted }
//   host        : the title root element (pins + hint live in it)
//   leftEdge()  : px of the right edge of the menu card (the map is centred in the rest of the screen)
//   onOpen(id)  : start a level (title.js openLevel)
//   onHighlight(id|null)
// main.js calls update(dt, rig) instead of rig.titleShots while `active`; update returns the grade fade 0..1.
import * as THREE from 'three';
import { BUILDINGS, LEVEL_SITES, LEVEL4_ROUTE } from '../core/sites.js';
import { makePath } from '../core/paths.js';
import { LEVELS, progress } from '../core/progress.js';
import { t } from './i18n.js';

/** one printed colour per level (pins, list badges, volumes) */
export const LEVEL_COLORS = { 1: '#d6a032', 2: '#3a78c2', 3: '#c8402a', 4: '#2f9a63', 5: '#8d58b8' };
const SLAB_COLOR = '#f4e7c4';

// camera: aerial 3/4 view from the south-east (as the aerial postcard), orbiting the middle of the sites
const FOCUS = new THREE.Vector3(-129, 5, 942);
const YAW0 = 0.62, PITCH0 = 0.6, FOV = 40;
const YAW_RANGE = 0.95, PITCH_MIN = 0.34, PITCH_MAX = 1.18, DIST_MIN = 95, DIST_MAX = 300;
const FLY = 1.7;          // s, film ↔ map
const SITE_SPAN = 180;    // m of the site that must fit across the free part of the screen

// alpha per state [normal, highlighted, dimmed (another level highlighted)]
const ALPHA = {
  vol: [0.13, 0.32, 0.045], volLine: [0.62, 1, 0.2],
  slab: [0.07, 0.24, 0.025], slabLine: [0.22, 0.75, 0.06],
  path: [0.6, 0.98, 0.2],
};

const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// --- geometry ------------------------------------------------------------------------------------
function footprint(b) {
  return b.x0 !== undefined ? b : { x0: b.x - b.halfWidth, x1: b.x + b.halfWidth, z0: b.z0, z1: b.z1 };
}
function floorsOf(b) {
  if (Array.isArray(b.floors)) return b.floors;
  if (b.floors) return Object.values(b.floors);
  if (b.height) return [0.15, b.height];
  if (b.floor !== undefined) return [b.floor, b.ceiling];
  return [];
}
/** the building (with known floor heights) whose footprint holds the centre of a volume */
function buildingOf(v) {
  const cx = (v.x0 + v.x1) / 2, cz = (v.z0 + v.z1) / 2;
  for (const k in BUILDINGS) {
    const b = BUILDINGS[k];
    if (!floorsOf(b).length) continue;
    const f = footprint(b);
    if (cx >= f.x0 && cx <= f.x1 && cz >= f.z0 && cz <= f.z1) return k;
  }
  return null;
}

function buildOverlay(route) {
  const F = { pos: [], idx: [], ranges: [] };  // triangles
  const L = { pos: [], ranges: [] };           // line segments
  const vtx = (S, x, y, z) => { S.pos.push(x, y, z); return S.pos.length / 3 - 1; };
  const begin = (S) => S.pos.length / 3;
  const range = (S, start, kind, levels, color) => S.ranges.push({ start, end: S.pos.length / 3, kind, levels, color });

  function box(v, lv) {
    let s = begin(F);
    const c = [];
    for (let i = 0; i < 8; i++) c.push(vtx(F, i & 1 ? v.x1 : v.x0, i & 2 ? v.y1 : v.y0, i & 4 ? v.z1 : v.z0));
    const quad = (a, b, cc, d) => F.idx.push(c[a], c[b], c[cc], c[a], c[cc], c[d]);
    quad(0, 1, 3, 2); quad(4, 6, 7, 5); quad(0, 4, 5, 1); quad(2, 3, 7, 6); quad(0, 2, 6, 4); quad(1, 5, 7, 3);
    range(F, s, 'vol', [lv], lv);
    s = begin(L);
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of E) {
      vtx(L, a & 1 ? v.x1 : v.x0, a & 2 ? v.y1 : v.y0, a & 4 ? v.z1 : v.z0);
      vtx(L, b & 1 ? v.x1 : v.x0, b & 2 ? v.y1 : v.y0, b & 4 ? v.z1 : v.z0);
    }
    range(L, s, 'volLine', [lv], lv);
  }

  function slabs(key, levels) {
    const f = footprint(BUILDINGS[key]);
    const s0 = begin(F), l0 = begin(L);
    for (const y of floorsOf(BUILDINGS[key])) {
      const a = vtx(F, f.x0, y, f.z0), b = vtx(F, f.x1, y, f.z0), c = vtx(F, f.x1, y, f.z1), d = vtx(F, f.x0, y, f.z1);
      F.idx.push(a, b, c, a, c, d);
      const P = [[f.x0, f.z0], [f.x1, f.z0], [f.x1, f.z1], [f.x0, f.z1]];
      for (let i = 0; i < 4; i++) { const p = P[i], q = P[(i + 1) % 4]; vtx(L, p[0], y, p[1]); vtx(L, q[0], y, q[1]); }
    }
    range(F, s0, 'slab', levels, 0);
    range(L, l0, 'slabLine', levels, 0);
  }

  /** flat ribbon along samples [{x, y, z, tx, tz}] */
  function ribbon(samples, half, lv) {
    const s = begin(F);
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      const a = vtx(F, p.x - p.tz * half, p.y, p.z + p.tx * half);
      vtx(F, p.x + p.tz * half, p.y, p.z - p.tx * half);
      if (i) F.idx.push(a - 2, a - 1, a + 1, a - 2, a + 1, a);
    }
    range(F, s, 'path', [lv], lv);
  }

  // building slabs: every building that holds a volume of some level, tagged with those levels
  const slabLevels = {};
  for (const site of LEVEL_SITES) {
    for (const v of site.volumes) {
      const k = buildingOf(v);
      if (k) (slabLevels[k] ||= new Set()).add(site.id);
    }
  }
  for (const k in slabLevels) slabs(k, [...slabLevels[k]]);
  for (const site of LEVEL_SITES) for (const v of site.volumes) box(v, site.id);

  // level 1: the last part of the drive, gate → finish, on the ground
  const l1 = LEVEL_SITES.find((s) => s.route === 'level1');
  if (l1 && route?.anchors?.gate) {
    const pts = [];
    const s0 = route.anchors.gate.s - 14, s1 = route.length;
    for (let s = s0; s <= s1 + 0.01; s += 1.5) {
      const f = route.frameAt(Math.min(s, s1));
      pts.push({ x: f.x, y: 0.35, z: f.z, tx: f.tx, tz: f.tz });
    }
    ribbon(pts, 1.3, l1.id);
  }
  // level 4: the catwalk course at its deck heights (piecewise-linear elevation knots projected onto the path)
  const l4 = LEVEL_SITES.find((s) => s.route === 'level4');
  if (l4) {
    const path = makePath(LEVEL4_ROUTE.points, { radius: LEVEL4_ROUTE.radius, step: 0.5 });
    const knots = LEVEL4_ROUTE.elevation.map((k) => ({ s: path.project(k.x, k.z).s, y: k.y })).sort((a, b) => a.s - b.s);
    const yAt = (s) => {
      if (s <= knots[0].s) return knots[0].y;
      for (let i = 1; i < knots.length; i++) {
        const a = knots[i - 1], b = knots[i];
        if (s <= b.s) return a.y + (b.y - a.y) * ((s - a.s) / Math.max(1e-6, b.s - a.s));
      }
      return knots[knots.length - 1].y;
    };
    ribbon(path.samples.map((p) => ({ x: p.x, y: yAt(p.s) + 0.12, z: p.z, tx: p.tx, tz: p.tz })), 0.75, l4.id);
  }

  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(F.pos, 3));
  fillGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array((F.pos.length / 3) * 4), 4));
  fillGeo.setIndex(F.idx);
  fillGeo.computeBoundingSphere();
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(L.pos, 3));
  lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array((L.pos.length / 3) * 4), 4));
  lineGeo.computeBoundingSphere();
  return { fillGeo, lineGeo, fillRanges: F.ranges, lineRanges: L.ranges };
}

// --- the map ---------------------------------------------------------------------------------------
export function createMap(ctx, { host, leftEdge = () => 0, onOpen = () => {}, onHighlight = () => {} } = {}) {
  const { scene, camera, renderer, route, isMobile } = ctx;

  // overlay (2 draw calls, x-ray: no depth test, drawn after the scene)
  const O = buildOverlay(route);
  const common = { vertexColors: true, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false };
  const fillMat = new THREE.MeshBasicMaterial({ ...common, side: THREE.DoubleSide });
  const lineMat = new THREE.LineBasicMaterial({ ...common });
  const fill = new THREE.Mesh(O.fillGeo, fillMat);
  const lines = new THREE.LineSegments(O.lineGeo, lineMat);
  fill.renderOrder = 990; lines.renderOrder = 991;
  const group = new THREE.Group();
  group.name = 'levelsMap';
  group.add(fill, lines);
  group.visible = false;
  group.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
  scene.add(group);

  const levelColor = {};
  for (const id in LEVEL_COLORS) levelColor[id] = new THREE.Color(LEVEL_COLORS[id]);
  const slabColor = new THREE.Color(SLAB_COLOR);

  let hi = null; // highlighted level id
  function recolor() {
    for (const [geo, ranges] of [[O.fillGeo, O.fillRanges], [O.lineGeo, O.lineRanges]]) {
      const attr = geo.getAttribute('color'), a = attr.array;
      for (const r of ranges) {
        const st = hi == null ? 0 : r.levels.includes(hi) ? 1 : 2;
        const alpha = ALPHA[r.kind][st];
        const c = r.color ? levelColor[r.color] : st === 1 ? levelColor[hi] : slabColor;
        for (let i = r.start; i < r.end; i++) { a[i * 4] = c.r; a[i * 4 + 1] = c.g; a[i * 4 + 2] = c.b; a[i * 4 + 3] = alpha; }
      }
      attr.needsUpdate = true;
    }
  }
  recolor();

  // site centres (camera eases toward the highlighted one)
  const centre = {};
  for (const s of LEVEL_SITES) {
    const c = new THREE.Vector3(s.pin.x, 0, s.pin.z);
    if (s.volumes.length) {
      c.set(0, 0, 0);
      for (const v of s.volumes) c.x += (v.x0 + v.x1) / 2, c.z += (v.z0 + v.z1) / 2;
      c.multiplyScalar(1 / s.volumes.length);
    }
    c.y = 6;
    centre[s.id] = c;
  }

  // --- DOM: pins + hint -----------------------------------------------------------------------
  const layer = document.createElement('div');
  layer.className = 'mp-layer';
  layer.innerHTML = `<div class="mp-hint">${t(isMobile ? 'mapHintTouch' : 'mapHintMouse')}</div>`;
  host.insertBefore(layer, host.querySelector('.tt-col'));
  let pins = [];
  let lastType = 'mouse';

  function buildPins() {
    for (const p of pins) p.el.remove();
    pins = LEVEL_SITES.map((site) => {
      const lv = LEVELS.find((l) => l.id === site.id);
      const open = !!lv && lv.playable && progress.isUnlocked(site.id);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `mp-pin${open ? '' : ' off'}`;
      el.style.setProperty('--lv', LEVEL_COLORS[site.id] || 'var(--red)');
      el.dataset.level = site.id;
      el.innerHTML = `<span class="mp-b"><span class="n">${site.id}</span><span class="t">`
        + `<b>${lv ? t(`${lv.key}Name`) : ''}${open ? '' : `<i class="lk">${LOCK}</i>`}</b>`
        + `<span class="w">${t(`site${site.id}`)}</span>`
        + `<span class="go">${open ? t(isMobile ? 'mapTapAgain' : 'mapClickPlay') : t('locked')}</span></span></span>`;
      el.addEventListener('pointerdown', (e) => { lastType = e.pointerType || 'mouse'; e.stopPropagation(); });
      el.addEventListener('keydown', () => { lastType = 'key'; });
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') highlight(site.id); });
      el.addEventListener('focus', () => highlight(site.id));
      el.addEventListener('click', () => {
        const touch = lastType === 'touch' || lastType === 'pen';
        if (touch && hi !== site.id) { highlight(site.id); return; }
        if (open) onOpen(site.id); else highlight(site.id);
      });
      layer.appendChild(el);
      return { id: site.id, el, p: site.pin, x: -1e4, y: -1e4, vis: true };
    });
  }

  function highlight(id = null) {
    if (id === hi) return;
    hi = id;
    recolor();
    for (const p of pins) p.el.classList.toggle('hi', p.id === hi);
    layer.classList.toggle('has-hi', hi != null);
    onHighlight(hi);
  }

  // --- camera ---------------------------------------------------------------------------------
  let mode = 'off';       // off | in | on | out
  let k = 0;              // 0 = film, 1 = map
  let yaw = YAW0, pitch = PITCH0, dist = 200, dist0 = 200;
  let yawT = YAW0, pitchT = PITCH0, distT = 200;
  let zoomK = 1, offX = 0;
  const focus = FOCUS.clone(), focusT = FOCUS.clone();
  const fromPos = new THREE.Vector3(), fromQuat = new THREE.Quaternion();
  let fromFov = FOV, fromOff = 0;
  const mPos = new THREE.Vector3(), mQuat = new THREE.Quaternion(), mtx = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  const V = new THREE.Vector3();

  function layout() {
    const w = innerWidth;
    const edge = clamp(leftEdge() || 0, 0, w * 0.6);
    offX = -edge / 2;
    const free = Math.max(0.35, (w - edge) / w);
    const aspect = w / Math.max(1, innerHeight);
    dist0 = clamp(SITE_SPAN / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * aspect * free), 130, 270);
  }
  addEventListener('resize', () => { if (mode !== 'off') layout(); });

  function open() {
    if (mode === 'on' || mode === 'in') return;
    buildPins();
    layout();
    if (mode === 'off') {
      yaw = yawT = YAW0; pitch = pitchT = PITCH0; dist = distT = dist0;
      focus.copy(FOCUS); focusT.copy(FOCUS); zoomK = 1;
      k = 0;
    }
    fromPos.copy(camera.position); fromQuat.copy(camera.quaternion);
    fromFov = camera.fov; fromOff = camera.view?.enabled ? camera.view.offsetX : 0;
    mode = 'in';
    group.visible = true;
    layer.classList.add('on');
    renderer.domElement.style.touchAction = 'none';
  }
  function close() {
    if (mode === 'off' || mode === 'out') return;
    mode = 'out';
    layer.classList.remove('on');
    highlight(null);
  }
  /** immediately back to the film (the title state was left or re-entered) */
  function reset() {
    mode = 'off'; k = 0;
    group.visible = false;
    layer.classList.remove('on');
    highlight(null);
    drags.clear();
  }

  // --- input: drag = rotate, wheel / pinch = zoom, tap = pick the nearest pin --------------------
  const cvs = renderer.domElement;
  const drags = new Map();
  let pinch0 = 0, dist0Pinch = 0, downX = 0, downY = 0, downT = 0, moved = 0;
  const interactive = () => mode === 'on' || mode === 'in';
  cvs.addEventListener('pointerdown', (e) => {
    if (!interactive()) return;
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { cvs.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (drags.size === 1) { downX = e.clientX; downY = e.clientY; downT = performance.now(); moved = 0; }
    if (drags.size === 2) {
      const [a, b] = [...drags.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; dist0Pinch = distT; moved = 99;
    }
  });
  cvs.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d || !interactive()) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    if (drags.size === 1) {
      moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
      yawT = clamp(yawT - dx * 0.0055, YAW0 - YAW_RANGE, YAW0 + YAW_RANGE);
      pitchT = clamp(pitchT + dy * 0.0045, PITCH_MIN, PITCH_MAX);
    } else if (drags.size === 2) {
      const [a, b] = [...drags.values()];
      const p = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      distT = clamp(dist0Pinch * (pinch0 / p), DIST_MIN, DIST_MAX);
    }
  });
  const up = (e) => {
    if (!drags.has(e.pointerId)) return;
    drags.delete(e.pointerId);
    if (drags.size || !interactive()) return;
    if (moved < 8 && performance.now() - downT < 450) pick(e.clientX, e.clientY);
  };
  cvs.addEventListener('pointerup', up);
  cvs.addEventListener('pointercancel', (e) => { drags.delete(e.pointerId); moved = 99; });
  cvs.addEventListener('wheel', (e) => {
    if (!interactive()) return;
    e.preventDefault();
    distT = clamp(distT * Math.exp(clamp(e.deltaY, -120, 120) * 0.0016), DIST_MIN, DIST_MAX);
  }, { passive: false });

  function pick(x, y) {
    let best = null, bd = 52;
    for (const p of pins) {
      if (!p.vis) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = p.id; }
    }
    highlight(best);
  }

  // --- per frame ------------------------------------------------------------------------------
  function mapPose(dt) {
    const a = 1 - Math.exp(-9 * dt);
    yaw += (yawT - yaw) * a; pitch += (pitchT - pitch) * a; dist += (distT - dist) * a;
    const b = 1 - Math.exp(-2.4 * dt);
    if (hi != null && centre[hi]) focusT.lerpVectors(FOCUS, centre[hi], 0.5); else focusT.copy(FOCUS);
    focus.lerp(focusT, b);
    zoomK += ((hi != null ? 0.8 : 1) - zoomK) * b;
    const r = dist * zoomK, cp = Math.cos(pitch);
    mPos.set(focus.x + Math.sin(yaw) * cp * r, focus.y + Math.sin(pitch) * r, focus.z + Math.cos(yaw) * cp * r);
    mtx.lookAt(mPos, focus, UP);
    mQuat.setFromRotationMatrix(mtx);
  }

  function update(dt, rig) {
    if (mode === 'off') return 0;
    let fade = 0;
    if (mode === 'out') {
      // the film keeps running underneath; blend from the map back to its current pose
      fade = rig.titleShots(dt);
      fromPos.copy(camera.position); fromQuat.copy(camera.quaternion);
      fromFov = camera.fov; fromOff = camera.view?.enabled ? camera.view.offsetX : 0;
      k -= dt / FLY;
    } else if (mode === 'in') k += dt / FLY;
    k = clamp(k, 0, 1);
    mapPose(dt);

    const e = ease(k);
    camera.position.lerpVectors(fromPos, mPos, e);
    if (mode !== 'on') camera.position.y += Math.sin(e * Math.PI) * 18; // rise over the roofs on the way
    camera.quaternion.slerpQuaternions(fromQuat, mQuat, e);
    camera.fov = fromFov + (FOV - fromFov) * e;
    const w = innerWidth, h = innerHeight;
    camera.setViewOffset(w, h, fromOff + (offX - fromOff) * e, 0, w, h); // also updates the projection
    camera.updateMatrixWorld();

    const op = e;
    fillMat.opacity = op; lineMat.opacity = op;

    if (mode === 'in' && k >= 1) mode = 'on';
    if (mode === 'out' && k <= 0) { mode = 'off'; group.visible = false; return fade; }

    // pins
    for (const p of pins) {
      V.set(p.p.x, p.p.y, p.p.z).project(camera);
      const vis = V.z < 1 && V.x > -1.3 && V.x < 1.3 && V.y > -1.3 && V.y < 1.3;
      if (vis !== p.vis) { p.vis = vis; p.el.style.visibility = vis ? '' : 'hidden'; }
      if (!vis) continue;
      const x = (V.x * 0.5 + 0.5) * w, y = (0.5 - V.y * 0.5) * h;
      if (Math.abs(x - p.x) > 0.3 || Math.abs(y - p.y) > 0.3) {
        p.x = x; p.y = y;
        p.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      }
    }
    return fade * (1 - e);
  }

  return {
    open, close, reset, update, highlight,
    get active() { return mode !== 'off'; },
    get highlighted() { return hi; },
  };
}
