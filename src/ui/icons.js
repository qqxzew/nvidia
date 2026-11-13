// Inline SVG icons (no emoji, no external files). All use currentColor unless noted.

export const ICON = {
  // upright beer barrel with hoops (HUD)
  barrel: `<svg viewBox="0 0 20 24" aria-hidden="true"><path class="b-body" d="M4 1.5h12c1.6 3 2.4 6.5 2.4 10.5S17.6 19.500 16 22.500H4C2.400 19.500 1.600 16 1.600 12S2.400 4.500 4 1.500z"/><path class="b-hoop" d="M3.300 5.500h13.400M2.100 9.200h15.800M2.100 14.800h15.800M3.300 18.500h13.400"/><path class="b-x" d="M2 2l16 20M18 2L2 22"/></svg>`,

  chevL: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M31 8L13 24l18 16z" fill="currentColor"/></svg>`,
  chevR: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M17 8l18 16-18 16z" fill="currentColor"/></svg>`,
  pedalUp: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 32L24 14l16 18" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="miter"/></svg>`,
  pedalDown: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="14" width="30" height="20" fill="currentColor"/></svg>`,

  pause: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="12" y="10" width="8" height="28" fill="currentColor"/><rect x="28" y="10" width="8" height="28" fill="currentColor"/></svg>`,

  // bulb horn
  horn: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 20h8l16-9v26l-16-9H5z" fill="currentColor"/><path d="M34 17c3 4.500 3 9.500 0 14M39 12c5.500 7 5.500 17 0 24" fill="none" stroke="currentColor" stroke-width="3.500" stroke-linecap="square"/></svg>`,

  soundOn: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 18h8l12-9v30l-12-9H6z" fill="currentColor"/><path d="M32 17c3 4.500 3 9.500 0 14M37 12c5 7 5 17 0 24" fill="none" stroke="currentColor" stroke-width="3.500" stroke-linecap="square"/></svg>`,
  soundOff: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 18h8l12-9v30l-12-9H6z" fill="currentColor"/><path d="M33 17l11 14M44 17L33 31" fill="none" stroke="currentColor" stroke-width="3.500" stroke-linecap="square"/></svg>`,
  fullscreen: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 17V7h10M31 7h10v10M41 31v10H31M17 41H7V31" fill="none" stroke="currentColor" stroke-width="4"/></svg>`,

  star: `<svg viewBox="0 0 48 46" aria-hidden="true"><path class="star-shape" d="M24 3l5.800 13.300 14.400 1.300-10.900 9.500 3.200 14.100L24 33.800 11.500 41.200l3.200-14.100L3.800 17.600l14.400-1.300z"/></svg>`,

  // Art-Deco fan ornament (half sunburst) used above titles
  fan: `<svg viewBox="0 0 120 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2"><path d="M60 38L10 38M60 38L110 38"/><path d="M60 38L14 26M60 38L24 14M60 38L38 6M60 38L60 2M60 38L82 6M60 38L96 14M60 38L106 26" stroke-width="1.600"/><path d="M40 38a20 20 0 0 1 40 0"/></g><circle cx="60" cy="38" r="4" fill="currentColor"/></svg>`,
  // rule - diamond - rule
  rule: `<svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path d="M0 6h86M114 6h86" stroke="currentColor" stroke-width="1.500" fill="none"/><path d="M100 0l6 6-6 6-6-6z" fill="currentColor"/><path d="M0 2.500h70M130 2.500h70M0 9.500h70M130 9.500h70" stroke="currentColor" stroke-width=".8" fill="none" opacity=".7"/></svg>`,

  // little truck silhouette (progress marker)
  truck: `<svg viewBox="0 0 40 24" aria-hidden="true"><path d="M1 20V9h6l3-5h8v16z" fill="currentColor"/><rect x="19" y="5" width="19" height="15" fill="currentColor"/><rect x="21" y="1" width="15" height="4" fill="currentColor" opacity=".7"/><circle cx="9" cy="20" r="4" class="t-wheel"/><circle cx="30" cy="20" r="4" class="t-wheel"/></svg>`,

  phone: `<svg viewBox="0 0 64 96" aria-hidden="true"><rect x="8" y="4" width="48" height="88" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><rect x="14" y="14" width="36" height="60" fill="currentColor" opacity=".25"/><circle cx="32" cy="83" r="3.500" fill="currentColor"/></svg>`,
};

// Speedometer face: 0..60 km/h over -120..+120 degrees. Static, built once.
export function dialFace() {
  const cx = 50, cy = 50;
  const pt = (deg, r) => {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  let ticks = '';
  for (let v = 0; v <= 60; v += 5) {
    const deg = -120 + (v / 60) * 240;
    const major = v % 10 === 0;
    const [x1, y1] = pt(deg, major ? 33 : 37);
    const [x2, y2] = pt(deg, 42);
    ticks += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#2b1b0e" stroke-width="${major ? 2.2 : 1.2}"/>`;
  }
  let nums = '';
  for (let v = 0; v <= 60; v += 20) {
    const deg = -120 + (v / 60) * 240;
    const [x, y] = pt(deg, 26);
    nums += `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${v}</text>`;
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="48" fill="#2b1b0e"/>
    <circle cx="50" cy="50" r="45" fill="#f1e6c8"/>
    <circle cx="50" cy="50" r="43.500" fill="none" stroke="#b8892b" stroke-width="1.200"/>
    ${ticks}
    <g font-family="'Alegreya Sans', Georgia, serif" font-weight="800" font-size="12" fill="#2b1b0e">${nums}</g>
  </svg>`;
}

export const NEEDLE = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M48.500 56L50 12l1.500 44z" fill="#9a2b1c"/><circle cx="50" cy="50" r="5" fill="#2b1b0e"/><circle cx="50" cy="50" r="1.800" fill="#b8892b"/></svg>`;
