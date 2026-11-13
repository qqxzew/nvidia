// Debug autopilot (?autopilot=1[&alat=4.5]): pure-pursuit steering + curvature-based speed profile.
// Used for full-route test drives, perf measurement and screenshots. Not part of the game.
export function createAutopilot(ctx, aLat = 4.5) {
  const { route, config } = ctx;
  const T = config.truck;
  function curvatureSpeed(s) {
    let vmax = T.maxSpeed;
    for (let d = 0; d <= 45; d += 5) {
      const a = route.frameAt(Math.min(route.length, s + d)), b = route.frameAt(Math.min(route.length, s + d + 6));
      let da = Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz);
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const k = Math.abs(da) / 6 + 1e-6;
      const vCorner = Math.sqrt(aLat / k);
      vmax = Math.min(vmax, Math.sqrt(vCorner * vCorner + 12 * Math.max(0, d - 3)));
    }
    return vmax;
  }
  return {
    drive(st, input) {
      const look = 7 + Math.max(0, st.speed) * 0.5;
      // aim slightly right of center to keep clear of the oncoming tram
      const tgt = route.pointAt(Math.min(route.length, st.s + look), route.zoneAt(st.s) === 'town' ? 3.0 : 0);
      const dx = tgt.x - st.x, dz = tgt.z - st.z;
      const hx = Math.sin(st.yaw), hz = Math.cos(st.yaw);
      const alpha = Math.atan2(hx * dz - hz * dx, hx * dx + hz * dz);
      const want = Math.atan((2 * T.wheelBase * Math.sin(alpha)) / look);
      const sf = Math.min(1, Math.abs(st.speed) / T.maxSpeed);
      const maxW = T.maxSteer + (T.highSpeedSteer - T.maxSteer) * sf;
      input.steer = Math.max(-1, Math.min(1, want / maxW));
      let vmax = curvatureSpeed(st.s);
      // stop for anything in front (train, tram, cart)
      for (const c of ctx.dynamicColliders) {
        const rx = c.x - st.x, rz = c.z - st.z;
        const ahead = rx * hx + rz * hz, side = Math.abs(rx * hz - rz * hx);
        if (ahead > 0 && ahead < 22 && side < c.r + 1.3) vmax = Math.min(vmax, Math.max(0, (ahead - 7) * 0.6));
      }
      input.throttle = st.speed < vmax - 0.3 ? 1 : 0;
      input.brake = st.speed > vmax + 0.8 ? 0.7 : 0;
    },
  };
}
