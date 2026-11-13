import * as THREE from 'three';
import { createBarrelMesh } from '../vehicle/truckModel.js';

// Barrel cargo: each barrel accumulates "looseness" from cornering, hard braking, impacts and bumps.
// Above wobbleAt it visibly rocks (warning), at fallAt it is thrown off and simulated as a simple
// rolling rigid body on the ground.

const GRAVITY = 9.81;
const R = 0.33; // barrel radius (lying barrel rests on the ground at y = R)

export function createCargo(ctx, truck) {
  const { scene, events, config } = ctx;
  const K = config.cargo;
  const barrels = truck.cargoSlots.map((slot, index) => {
    const mesh = createBarrelMesh(ctx);
    return {
      index, slot, mesh, state: 'onboard', loose: 0, wobbling: false,
      bias: 0.8 + Math.random() * 0.4, phase: Math.random() * 10,
      vel: new THREE.Vector3(), spin: new THREE.Vector3(), rollAxis: new THREE.Vector3(),
    };
  });
  let lost = 0;
  let controllerState = null;

  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();

  function placeOnboard(b) {
    truck.cargoRoot.add(b.mesh);
    b.mesh.position.copy(b.slot.position);
    b.mesh.rotation.copy(b.slot.rotation);
    b.mesh.visible = true;
  }

  function reset() {
    lost = 0;
    for (const b of barrels) {
      b.state = 'onboard'; b.loose = 0; b.wobbling = false;
      b.bias = 0.8 + Math.random() * 0.4;
      b.vel.set(0, 0, 0); b.spin.set(0, 0, 0);
      placeOnboard(b);
    }
  }

  function layerFactor(b) {
    if (b.slot.layer >= 1) return 1;
    const topLeft = barrels.filter((o) => o.slot.layer >= 1 && o.state === 'onboard').length;
    return topLeft <= 1 ? K.bottomLayerFactor : 0;
  }

  // Barrels on the outside of a curve are pushed harder.
  function sideFactor(b, latAcc) {
    const side = b.slot.position.x * Math.sign(latAcc); // + = outside of the turn
    return side > 0.05 ? 1.35 : side < -0.05 ? 0.7 : 1;
  }

  events.on('impact', (e) => {
    for (const b of barrels) {
      if (b.state !== 'onboard') continue;
      const lf = layerFactor(b); if (!lf) continue;
      b.loose += K.impactGain * e.strength * (0.4 + Math.random()) * lf * b.bias;
    }
  });
  events.on('bump', (e) => {
    for (const b of barrels) {
      if (b.state !== 'onboard') continue;
      const lf = layerFactor(b); if (!lf) continue;
      b.loose += K.bumpGain * e.strength * Math.random() * lf * b.bias;
    }
  });

  function drop(b, st) {
    b.state = 'falling';
    b.wobbling = false;
    lost += 1;
    // detach keeping the world transform
    b.mesh.updateWorldMatrix(true, false);
    b.mesh.getWorldPosition(tmpV);
    b.mesh.getWorldQuaternion(tmpQ);
    scene.add(b.mesh);
    b.mesh.position.copy(tmpV);
    b.mesh.quaternion.copy(tmpQ);
    // throw: truck velocity + outward push (outside of the curve) + a little hop
    const hx = Math.sin(st.yaw), hz = Math.cos(st.yaw);
    const lx = Math.cos(st.yaw), lz = -Math.sin(st.yaw); // local +X (left of the truck) in world
    const out = st.latAcc !== 0 ? Math.sign(st.latAcc) : Math.sign(b.slot.position.x || 1);
    const push = 1.6 + Math.random() * 1.6;
    b.vel.set(hx * st.speed * 0.9 + lx * out * push, 2.2 + Math.random(), hz * st.speed * 0.9 + lz * out * push);
    if (st.longAcc < -6) { b.vel.x += hx * 1.5; b.vel.z += hz * 1.5; } // hard braking flings it forward
    b.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);
    events.emit('barrel:lost', { index: b.index, lost, remaining: barrels.length - lost });
  }

  const axisTmp = new THREE.Vector3();
  const qTmp = new THREE.Quaternion();
  function simulateFallen(b, dt) {
    const m = b.mesh;
    b.vel.y -= GRAVITY * dt;
    m.position.addScaledVector(b.vel, dt);
    if (m.position.y < R) {
      m.position.y = R;
      if (b.vel.y < -1.2) {
        events.emit('barrel:land', { index: b.index, strength: Math.min(1, -b.vel.y / 6) });
        b.vel.y *= -0.32;
        b.spin.multiplyScalar(0.6);
      } else b.vel.y = 0;
      // rolling friction
      const fr = Math.max(0, 1 - 1.4 * dt);
      b.vel.x *= fr; b.vel.z *= fr;
      // settle the barrel lying on its side, rolling along its velocity
      const sp = Math.hypot(b.vel.x, b.vel.z);
      if (sp > 0.05) {
        axisTmp.set(b.vel.z, 0, -b.vel.x).normalize();
        qTmp.setFromAxisAngle(axisTmp, (sp / R) * dt);
        m.quaternion.premultiply(qTmp);
      }
      b.spin.multiplyScalar(Math.max(0, 1 - 4 * dt));
      if (sp < 0.08 && Math.abs(b.vel.y) < 0.1) b.state = 'ground';
    }
    // free tumbling in the air
    if (b.spin.lengthSq() > 1e-4) {
      axisTmp.copy(b.spin).normalize();
      qTmp.setFromAxisAngle(axisTmp, b.spin.length() * dt);
      m.quaternion.premultiply(qTmp);
    }
  }

  function update(dt, st, active) {
    controllerState = st;
    const over = Math.max(0, Math.abs(st.latAcc) - K.calmLateral);
    const decel = Math.max(0, -st.longAcc - 7);
    const t = performance.now() * 0.001;
    for (const b of barrels) {
      if (b.state === 'falling') { simulateFallen(b, dt); continue; }
      if (b.state !== 'onboard') continue;
      const lf = layerFactor(b);
      if (active && lf) {
        const add = (over * K.lateralGain * sideFactor(b, st.latAcc) + decel * K.brakeGain) * dt * lf * b.bias;
        if (add > 0) b.loose += add;
        else b.loose = Math.max(0, b.loose - K.settleRate * dt);
      }
      // visual wobble
      const w = Math.max(0, (b.loose - K.wobbleAt) / (K.fallAt - K.wobbleAt));
      if (w > 0 && !b.wobbling) { b.wobbling = true; events.emit('barrel:wobble', { index: b.index, looseness: b.loose }); }
      if (w <= 0) b.wobbling = false;
      const m = b.mesh;
      m.position.copy(b.slot.position);
      m.rotation.copy(b.slot.rotation);
      if (w > 0) {
        const amp = 0.02 + w * 0.09;
        m.position.y += Math.abs(Math.sin(t * 18 + b.phase)) * amp * 0.8;
        m.position.x += Math.sin(t * 11 + b.phase) * amp * 0.6;
        m.rotation.y += Math.sin(t * 13 + b.phase) * amp * 1.5;
      }
      if (active && b.loose >= K.fallAt) drop(b, st);
    }
  }

  reset();

  return {
    barrels, update, reset,
    get lost() { return lost; },
    get remaining() { return barrels.length - lost; },
    get warning() { return barrels.some((b) => b.state === 'onboard' && b.wobbling); },
    get maxLoose() { return barrels.reduce((m, b) => (b.state === 'onboard' ? Math.max(m, b.loose) : m), 0); },
  };
}
