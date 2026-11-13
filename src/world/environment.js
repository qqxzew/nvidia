import * as THREE from 'three';
import { getTextures } from './textures.js';
import { GeoBuilder, rngFactory, mat, lin, mixCol, scaleCol } from './props.js';

// Sky dome (gradient + sun glow), drifting cumulus, ground, rolling hills ring, castle Radyně on a hill (SW),
// faint Plzeň skyline with Škoda chimneys (NE).  (owner: city)
// Fog colour = horizon haze colour. Hills / skyline do their own atmospheric perspective (fog is far shorter than they are).

const HAZE = 0xe9d4b4;

function ihash(x, y) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = ihash(ix, iy), b = ihash(ix + 1, iy), c = ihash(ix, iy + 1), d = ihash(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.03; } return s / 0.9375; }

export function buildEnvironment(ctx) {
  const { scene, sunDir } = ctx;
  const T = getTextures();
  const haze = new THREE.Color(HAZE);
  const hazeL = [haze.r, haze.g, haze.b];

  if (scene.fog) scene.fog.color.copy(haze);
  scene.background = haze.clone();

  // ------------------------------------------------------------------ sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x2f64b8) },
      uMid: { value: new THREE.Color(0x6fa6e2) },
      uLow: { value: new THREE.Color(0xf6c995) },
      uHaze: { value: haze.clone() },
      uSunDir: { value: sunDir.clone().normalize() },
      uSun: { value: new THREE.Color(0xffe2a8) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uLow, uHaze, uSunDir, uSun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHaze, uLow, smoothstep(0.0, 0.05, h));
        col = mix(col, uMid, smoothstep(0.03, 0.30, h));
        col = mix(col, uTop, smoothstep(0.22, 0.85, h));
        float sd = max(dot(d, uSunDir), 0.0);
        // warm peach glow, concentrated around the sun azimuth near the horizon
        vec3 sunFlat = normalize(vec3(uSunDir.x, 0.0, uSunDir.z));
        float az = max(dot(normalize(vec3(d.x, 0.0001, d.z)), sunFlat), 0.0);
        col += vec3(0.20, 0.10, 0.02) * pow(az, 5.0) * (1.0 - smoothstep(0.0, 0.55, h));
        col += uSun * (pow(sd, 5.0) * 0.28 + pow(sd, 40.0) * 0.55);
        col += uSun * 3.0 * smoothstep(0.99935, 0.99975, sd);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 20), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -100;
  sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.updateMatrix(); sky.matrixWorld.copy(sky.matrix); };
  scene.add(sky);

  // ------------------------------------------------------------------ clouds (soft cumulus billboards on a dome, drifting)
  {
    const R = rngFactory(42);
    const cb = new GeoBuilder();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 16; i++) {
      const az = R() * Math.PI * 2, el = (6 + Math.pow(R(), 1.4) * 38) * Math.PI / 180;
      const d = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
      const c = d.clone().multiplyScalar(1750);
      const right = new THREE.Vector3().crossVectors(up, d).normalize();
      const up2 = new THREE.Vector3().crossVectors(d, right).normalize();
      const w = 520 + R() * 620, h = w * 0.5;
      const P = (a, b) => c.clone().addScaledVector(right, a * w / 2).addScaledVector(up2, b * h / 2).toArray();
      cb.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), [0, 0, 1, 1], [1, 1, 1], d.clone().negate().toArray());
    }
    const cm = new THREE.Mesh(cb.toGeometry(), new THREE.MeshBasicMaterial({ map: T.cloud, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, vertexColors: true }));
    cm.frustumCulled = false; cm.renderOrder = -90;
    cm.onBeforeRender = (r, s, cam) => {
      cm.position.copy(cam.position);
      cm.rotation.y = performance.now() * 0.001 * 0.0035;
      cm.updateMatrix(); cm.matrixWorld.copy(cm.matrix);
    };
    scene.add(cm);
  }

  // ------------------------------------------------------------------ ground
  {
    const SIZE = 5200, N = 64;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, N, N);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    const col = new Float32Array(p.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const n = fbm(x * 0.0032 + 7.1, z * 0.0032 + 3.3, 4), m = fbm(x * 0.013 + 1.7, z * 0.013 + 9.4, 3);
      // patchwork: green meadows, golden stubble, brown ploughland
      const k = Math.min(1, Math.max(0, (n - 0.3) / 0.45));
      tmp.setRGB(0.80 + 0.28 * k + 0.1 * m, 0.92 + 0.02 * k - 0.1 * (1 - k) * m, 0.62 + 0.1 * k - 0.04 * m);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      uv.setXY(i, x / 22, z / 22);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: T.ground, vertexColors: true }));
    ground.position.set(0, -0.03, 450);
    ground.receiveShadow = true;
    scene.add(ground);
  }

  // ------------------------------------------------------------------ hills ring (own haze, fog:false)
  const C = { x: 20, z: 480 };
  const castleAt = { x: -820, z: 1640 };
  const hillH = (x, z) => {
    const dx = x - C.x, dz = z - C.z;
    const r = Math.hypot(dx, dz), th = Math.atan2(dz, dx);
    const cx = Math.cos(th), sy = Math.sin(th);
    const ang = (k, o) => vnoise(cx * k + o, sy * k + o * 0.7);
    const R0 = 1180 + 240 * ang(1.7, 3.1), H0 = 30 + 105 * Math.pow(ang(2.3, 8.2), 1.5);
    const R1 = 1850 + 200 * ang(1.3, 5.3), H1 = 55 + 130 * Math.pow(ang(1.9, 1.7), 1.3);
    const b0 = Math.exp(-Math.pow((r - R0) / 330, 2)), b1 = Math.exp(-Math.pow((r - R1) / 380, 2));
    const roll = fbm(x * 0.004, z * 0.004, 3);
    let h = H0 * b0 * (0.7 + 0.6 * roll) + H1 * b1 * (0.7 + 0.6 * roll);
    // wide foothills
    h += 14 * Math.exp(-Math.pow((r - 800) / 260, 2)) * ang(3.1, 9.9) * ang(1.1, 2.2);
    const dc = Math.hypot(x - castleAt.x, z - castleAt.z);
    h += 128 * Math.exp(-Math.pow(dc / 210, 2));
    return h;
  };
  const hillGeo = (() => {
    const NA = 200, rs = [];
    for (let r = 560; r <= 2500; r += (r < 1000 ? 70 : 90)) rs.push(r);
    const pos = [], col = [], idx = [];
    const tmpC = new THREE.Color();
    const forest = new THREE.Color(0x3c5632), meadow = new THREE.Color(0x6f9348), gold = new THREE.Color(0xb9a862), plough = new THREE.Color(0x9a7a56);
    for (let j = 0; j < rs.length; j++) {
      for (let i = 0; i <= NA; i++) {
        const th = (i / NA) * Math.PI * 2;
        const x = C.x + Math.cos(th) * rs[j], z = C.z + Math.sin(th) * rs[j];
        const h = hillH(x, z);
        pos.push(x, h - 0.5, z);
      }
    }
    const W = NA + 1;
    const normals = new Float32Array(pos.length);
    for (let j = 0; j < rs.length - 1; j++) for (let i = 0; i < NA; i++) {
      const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nor = g.attributes.normal;
    const sd = sunDir.clone().normalize();
    for (let k = 0; k < pos.length / 3; k++) {
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const n = fbm(x * 0.0048 + 2.2, z * 0.0048 + 8.8, 3), n2 = fbm(x * 0.018, z * 0.018, 2);
      if (n > 0.62) tmpC.copy(forest); else if (n > 0.42) tmpC.copy(meadow); else if (n > 0.3) tmpC.copy(gold); else tmpC.copy(plough);
      tmpC.lerp(meadow, 0.25).multiplyScalar(0.82 + 0.3 * n2 + 0.0 * Math.sin(x * 0.05));
      const lit = nor.getX(k) * sd.x + nor.getY(k) * sd.y + nor.getZ(k) * sd.z;
      tmpC.multiplyScalar(0.78 + 0.34 * Math.max(0, lit));
      const d = Math.hypot(x - C.x, z - C.z);
      const f = THREE.MathUtils.clamp(0.30 + (d - 600) / 1900 * 0.62, 0.3, 0.92);
      const low = THREE.MathUtils.clamp(1 - y / 40, 0, 1); // foot of the hills melts into the haze
      tmpC.lerp(haze, Math.min(1, f + low * 0.55 * (1 - f * 0.4)));
      col.push(tmpC.r, tmpC.g, tmpC.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeBoundingSphere();
    void normals;
    return g;
  })();
  scene.add(Object.assign(new THREE.Mesh(hillGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), { frustumCulled: false, renderOrder: -20 }));

  // ------------------------------------------------------------------ castle Radyně on its hill (silhouette)
  {
    const b = new GeoBuilder();
    const y0 = hillH(castleAt.x, castleAt.z);
    const tint = (hex, f) => { const c = new THREE.Color(hex); c.lerp(haze, f); return [c.r, c.g, c.b]; };
    const stone = tint(0x6f6a62, 0.48), stoneL = tint(0x8a8274, 0.45), roof = tint(0x4c3e38, 0.5);
    const S = 1.5; // enlarged for readability at ~1.7 km
    const X = castleAt.x, Z = castleAt.z;
    const yawFace = Math.atan2(C.x - X, C.z - Z);
    const place = (lx, lz) => [X + (lx * Math.cos(yawFace) + lz * Math.sin(yawFace)) * S, Z + (-lx * Math.sin(yawFace) + lz * Math.cos(yawFace)) * S];
    // curtain wall with a gate
    for (const [lx, w, h] of [[-13, 18, 11], [8, 24, 9], [-4, 7, 7]]) {
      const p = place(lx, 0);
      b.box(p[0], y0, p[1], w * S, h * S, 3 * S, yawFace, stone, [0, 0, 1, 1], stoneL);
      for (let k = 0; k < w; k += 3) { const q = place(lx - w / 2 + k + 1, 0); b.box(q[0], y0 + h * S, q[1], 1.4 * S, 1.4 * S, 3 * S, yawFace, stone); }
    }
    // tall round tower + smaller square tower + ruined gable
    const t1 = place(-21, 0);
    b.addGeometry(new THREE.CylinderGeometry(4.8 * S, 5.4 * S, 31 * S, 10), mat(t1[0], y0 + 15.5 * S, t1[1]), (v) => mixCol(stoneL, stone, THREE.MathUtils.clamp((v.y - y0) / (31 * S), 0, 1)));
    b.addGeometry(new THREE.ConeGeometry(5.6 * S, 8 * S, 10), mat(t1[0], y0 + 35 * S, t1[1]), roof);
    const t2 = place(17, 0);
    b.box(t2[0], y0, t2[1], 8 * S, 22 * S, 8 * S, yawFace, stone, [0, 0, 1, 1], stoneL);
    b.addGeometry(new THREE.ConeGeometry(6.2 * S, 7 * S, 4), mat(t2[0], y0 + 25.5 * S, t2[1], yawFace + Math.PI / 4), roof);
    const t3 = place(2, -2);
    b.box(t3[0], y0 + 9 * S, t3[1], 10 * S, 6 * S, 3 * S, yawFace, stone);
    scene.add(Object.assign(b.toMesh(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), { frustumCulled: false, renderOrder: -19 }));
  }

  // ------------------------------------------------------------------ city skyline, north-east (faint) + works chimneys
  {
    const R = rngFactory(77), b = new GeoBuilder();
    const base = new THREE.Color(0x9b8f84), roofC = new THREE.Color(0x8a6a5c), darkC = new THREE.Color(0x5d554f);
    const col = (c, f, k = 1) => { const t = c.clone().multiplyScalar(k).lerp(haze, f); return [t.r, t.g, t.b]; };
    const CX = 170, CZ = 280;
    for (let i = 0; i < 90; i++) {
      const a = (-78 + R() * 100) * Math.PI / 180, r = 880 + R() * 160;
      const x = CX + Math.cos(a) * r, z = CZ + Math.sin(a) * r;
      const w = 18 + R() * 30, d = 14 + R() * 20, h = 9 + R() * 14;
      const f = 0.62 + R() * 0.12, yaw = a + (R() - 0.5) * 0.3;
      b.box(x, 0, z, w, h, d, yaw, col(base, f, 0.9 + R() * 0.2), [0, 0, 1, 1], col(base, f, 1.0));
      b.addGeometry(new THREE.ConeGeometry(Math.max(w, d) * 0.62, 6 + R() * 4, 4), mat(x, h + 2.5, z, yaw + Math.PI / 4, 1, 1, d / w), col(roofC, f));
    }
    // church towers
    for (const [a, r, h] of [[-52, 930, 55], [-30, 905, 48], [-8, 960, 62], [-66, 960, 44], [10, 940, 50]]) {
      const ar = a * Math.PI / 180, x = CX + Math.cos(ar) * r, z = CZ + Math.sin(ar) * r;
      b.box(x, 0, z, 8, h * 0.62, 8, 0, col(base, 0.55, 0.95));
      b.addGeometry(new THREE.ConeGeometry(5.2, h * 0.5, 8), mat(x, h * 0.62 + h * 0.25, z), col(darkC, 0.55));
    }
    // Škoda works chimneys
    for (const [a, r, h] of [[-44, 985, 95], [-40, 1000, 78], [-36, 992, 110], [-18, 1010, 85], [-3, 990, 70]]) {
      const ar = a * Math.PI / 180, x = CX + Math.cos(ar) * r, z = CZ + Math.sin(ar) * r;
      b.addGeometry(new THREE.CylinderGeometry(1.8, 3.2, h, 8), mat(x, h / 2, z), (v) => col(darkC, 0.6 - 0.15 * (v.y / h)));
      b.box(x + 30, 0, z, 70, 14, 28, 0, col(base, 0.6, 0.85));
    }
    scene.add(Object.assign(b.toMesh(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })), { frustumCulled: false, renderOrder: -18 }));
  }

  return { update() {} };
}
