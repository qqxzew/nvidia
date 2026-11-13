import * as THREE from 'three';

// A small flock of swifts circling the brewery chimney — only shown in the main menu film.
// One InstancedMesh; wing beat = scaling the V shape, each bird with its own phase.
const CHIMNEY = new THREE.Vector3(-76, 0, 879.5); // = svetovar.js CH (48 m)

export function createBirds(ctx) {
  const COUNT = 11;
  // V-shaped bird: two thin wings meeting at the body, ~1.1 m span, facing +X (direction of flight)
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    0.18, 0, 0, -0.12, 0, 0, 0, 0.05, 0.55, // left wing
    -0.12, 0, 0, 0.18, 0, 0, 0, 0.05, -0.55, // right wing
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a2219, side: THREE.DoubleSide, fog: true });
  const mesh = new THREE.InstancedMesh(g, mat, COUNT);
  mesh.frustumCulled = false;
  mesh.userData.dynamic = true;
  mesh.visible = false;
  ctx.scene.add(mesh);

  const birds = Array.from({ length: COUNT }, (_, i) => ({
    r: 14 + Math.random() * 24,
    h: 34 + Math.random() * 20,
    speed: (0.16 + Math.random() * 0.12) * (i % 4 === 0 ? -1 : 1),
    a: Math.random() * Math.PI * 2,
    flap: 7 + Math.random() * 4,
    ph: Math.random() * 10,
    bob: Math.random() * 10,
  }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();

  return {
    update(dt, t, on) {
      mesh.visible = on;
      if (!on) return;
      birds.forEach((b, i) => {
        b.a += b.speed * dt;
        p.set(CHIMNEY.x + Math.cos(b.a) * b.r, b.h + Math.sin(t * 0.5 + b.bob) * 2.5, CHIMNEY.z + Math.sin(b.a) * b.r);
        // heading = tangent of the circle, banked into the turn
        const sg = Math.sign(b.speed);
        const heading = Math.atan2(-Math.cos(b.a) * sg, -Math.sin(b.a) * sg); // local +X along the circle tangent
        e.set(0.35 * Math.sign(b.speed), heading, 0, 'YXZ');
        q.setFromEuler(e);
        // wing beat with glides
        const beat = Math.sin(t * b.flap + b.ph);
        const glide = Math.sin(t * 0.7 + b.ph) > 0.3 ? 0.25 : 1;
        s.set(1.6, 1 + beat * 6 * glide, 1.6);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
