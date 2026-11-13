// Level 5 "Šílená stáčírna" UI: menu (goal + visual recipe + two rules), countdown, a minimal HUD (time,
// dispatched barrels vs quota, strikes), click/tap on the 3D switches (screen-space pick of the signal disks,
// then raycast onto the belt plane), keys 1–4, mistake toasts, pause, result / fail papers, portrait overlay.
// The user asked to drop the bottom switch cards, the speed dial and the centre coach/banner lines (2026-11-13);
// the old code paths for them still run against detached stand-ins (`off()`), the `btn` map stays empty.
// Plain DOM + CSS rendered into #ui. Shared look from ../ui/ui.css, level parts in ui5.css, strings in i18n.js.
//
// Public API (used by src/level5/main.js):  createUI5(ctx) -> { update(dt), setHUD(hud) }
// Emits:    ui:start, ui:restart, ui:pause, ui:resume, ui:switch {id}, audio:volume {value}, audio:mute {muted}
// Consumes: state, countdown, line:switch, line:burst, line:reject, line:ship, line:strike, line:speed, finish, fail
import '../ui/ui.css';
import './ui5.css';
import { ICON, NEEDLE, stamp } from '../ui/icons.js';
import { fmtTime, barrels as barrelsText, t as tMain } from '../ui/i18n.js';
import { settings, saveSettings } from '../ui/shared.js';
import { NEXT_STATION } from './config.js';
import { t } from './i18n.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mod = (a, n) => ((a % n) + n) % n;
const APPROACH_S = 3;   // "barrel coming" dot: seconds before it reaches the switch
const DANGER_S = 2.4;   // switch ON + a barrel it would ruin arriving within this many seconds
const PICK_R = 1.2;     // 3D pick radius around a switch / its branch (m)

// station icons (currentColor, 24×24)
const I5 = {
  wash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 1.5h4v3h5.5v3.2h-15V4.5H10z" fill="currentColor"/><g fill="currentColor"><path d="M6.5 10l1.6 3.3a1.8 1.8 0 1 1-3.2 0z"/><path d="M12 11.5l1.6 3.3a1.8 1.8 0 1 1-3.2 0z"/><path d="M17.5 10l1.6 3.3a1.8 1.8 0 1 1-3.2 0z"/><path d="M9 17l1.4 2.9a1.6 1.6 0 1 1-2.8 0z"/><path d="M15 17l1.4 2.9a1.6 1.6 0 1 1-2.8 0z"/></g></svg>`,
  fill: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1.5 3.5h11a5.5 5.5 0 0 1 5.5 5.5v2.5h-4.2V9a1.3 1.3 0 0 0-1.3-1.3h-11z" fill="currentColor"/><rect x="12.6" y="11.5" width="6.6" height="1.8" fill="currentColor"/><path d="M15.9 14.6l2.9 5a3.3 3.3 0 1 1-5.8 0z" fill="currentColor"/></svg>`,
  cap: `<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-40 12 12)" fill="currentColor"><rect x="5" y="1.5" width="14" height="8" rx="2"/><rect x="5" y="3.2" width="1.6" height="4.6" fill-opacity=".5"/><rect x="10.6" y="9.5" width="2.8" height="13" rx="1"/></g></svg>`,
  ship: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 5.5h12.5v10.5H1z" fill="currentColor"/><path d="M14.5 8.5h4.6l3.9 4.3v3.2h-8.5z" fill="currentColor"/><circle cx="5.5" cy="19" r="2.6" fill="currentColor"/><circle cx="18" cy="19" r="2.6" fill="currentColor"/></svg>`,
  // switch state arrows: OFF = straight on, ON = turning off (the other way stays faint)
  straight: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 17a4.5 4.5 0 0 0 4.5-4.5V8" fill="none" stroke="currentColor" stroke-width="2.2" opacity=".3"/><path d="M2 17h15" fill="none" stroke="currentColor" stroke-width="2.8"/><path d="M16 11.5l7 5.5-7 5.5z" fill="currentColor"/></svg>`,
  turn: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 17h11" fill="none" stroke="currentColor" stroke-width="2.2" opacity=".3"/><path d="M2 17h9a4.5 4.5 0 0 0 4.5-4.5V8" fill="none" stroke="currentColor" stroke-width="2.8"/><path d="M10 9l5.5-7.5L21 9z" fill="currentColor"/></svg>`,
  // rules
  burst: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.2 6 5.6-3-2.4 6 5.6 2-5.6 2 2.4 6-5.6-3L12 23l-2.2-6-5.6 3 2.4-6L1 12l5.6-2-2.4-6 5.6 3z" fill="currentColor"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M6.5 12h11" stroke="#efe4c6" stroke-width="3.2"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h11l7 9-7 9H3z" fill="currentColor"/><circle cx="8" cy="12" r="2.2" fill="#efe4c6"/></svg>`,
  arrow: `<svg viewBox="0 0 24 12" aria-hidden="true"><path d="M1 6h17" stroke="currentColor" stroke-width="2"/><path d="M16 1l7 5-7 5z" fill="currentColor"/></svg>`,
  // a cracked barrel (strike slot)
  crack: `<svg viewBox="0 0 20 24" aria-hidden="true"><path class="k-body" d="M4 1.5h12c1.6 3 2.4 6.5 2.4 10.5S17.6 19.5 16 22.5H4C2.4 19.5 1.6 16 1.6 12S2.4 4.5 4 1.5z"/><path class="k-crack" d="M11 1.5l-3 6 4 3-4 5 3 3-2 4"/></svg>`,
  up: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l7-7 7 7M5 20l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>`,
};

// belt-speed dial face: lo..hi m/s over -120..+120 degrees, red zone near the top speed. Static, built once.
function beltDial(lo, hi, redFrom) {
  const cx = 50, cy = 50;
  const ang = (v) => -120 + ((v - lo) / (hi - lo)) * 240;
  const pt = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  let ticks = '';
  for (let v = lo; v <= hi + 1e-6; v += 0.25) {
    const major = Math.abs(v * 2 - Math.round(v * 2)) < 1e-6;
    const [x1, y1] = pt(ang(v), major ? 33 : 37);
    const [x2, y2] = pt(ang(v), 42);
    ticks += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#2b1b0e" stroke-width="${major ? 2.2 : 1.2}"/>`;
  }
  let nums = '';
  for (let v = Math.ceil(lo); v <= hi + 1e-6; v += 1) {
    const [x, y] = pt(ang(v), 25);
    nums += `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${v}</text>`;
  }
  const [ax, ay] = pt(ang(redFrom), 40), [bx, by] = pt(ang(hi), 40);
  const large = ang(hi) - ang(redFrom) > 180 ? 1 : 0;
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="48" fill="#1d2a23"/>
    <circle cx="50" cy="50" r="45" fill="#efe4c6"/>
    <path d="M${ax.toFixed(1)} ${ay.toFixed(1)}A40 40 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)}" fill="none" stroke="#9a2b1c" stroke-width="5" opacity=".8" data-large="${large}"/>
    ${ticks}
    <g font-family="'Alegreya Sans', Georgia, serif" font-weight="500" font-size="12" fill="#2b1b0e">${nums}</g>
  </svg>`;
}

// readable text colour on a station colour (cream on dark, ink on light)
function fgFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#efe4c6';
  const n = parseInt(m[1], 16);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.26 ? '#2b1b0e' : '#efe4c6';
}

export function createUI5(ctx) {
  const { events, stations: ST, belts, layout } = ctx;
  const LINE = ctx.lineCfg || {};
  const THREE = ctx.THREE;
  const host = document.getElementById('ui') || document.body;
  const params = new URLSearchParams(location.search);
  const touchParam = params.get('touch'); // debug: ?touch=1 forces the touch hints, ?touch=0 the keyboard ones

  let hasTouch = touchParam === '1' || (touchParam !== '0' && (!!ctx.isMobile || 'ontouchstart' in window || navigator.maxTouchPoints > 0));
  const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  // switches in processing order (1..4) with their keys
  const SW = Object.values(belts.branches).sort((a, b) => a.order - b.order).map((b) => b.id);
  const KEY = {}; // '1' -> 'wash'
  for (const id of SW) KEY[belts.branches[id].key] = id;
  const QUOTA = LINE.quota ?? 12;
  const MAXS = LINE.maxStrikes ?? 3;
  const SPD_LO = Math.floor(LINE.speedStart ?? 1);
  const SPD_HI = Math.max(SPD_LO + 1, Math.ceil(LINE.speedMax ?? 3));

  // ------------------------------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------------------------------
  const titleWords = t('title').split(' ');
  const titleLast = titleWords.pop();
  const keyHint = t('hintKeys').split('  ·  ').map((x) => `<span class="nb">${x}</span>`).join('<span class="sep"> · </span>');
  const strikeSlots = Array.from({ length: MAXS }, () => `<span>${I5.crack}</span>`).join('');
  const colorVars = (id) => `--c:${ST[id].color};--fg:${fgFor(ST[id].color)}`;

  const chips = SW.map((id, i) => `
      ${i ? `<i class="rc-arr">${I5.arrow}</i>` : ''}
      <div class="rc" style="${colorVars(id)}"><b class="rc-n">${belts.branches[id].key}</b><span class="rc-i">${I5[id]}</span><span class="rc-t"><span class="rc-name">${ST[id].name}</span><span class="rc-verb">${ST[id].verb.toLowerCase()}</span></span></div>`).join('');

  const cons = SW.map((id) => `<li style="${colorVars(id)}"><i class="ci">${I5[id]}</i><span>${t('con_' + id)}</span></li>`).join('');


  const root = document.createElement('div');
  root.className = 'plz plz5' + (hasTouch ? ' has-touch' : '');
  root.innerHTML = `
    <svg class="defs" width="0" height="0" aria-hidden="true"><defs>
      <linearGradient id="plz-oak" x1="0" x2="1"><stop offset="0" stop-color="#7a4a22"/><stop offset=".42" stop-color="#c98d4c"/><stop offset=".6" stop-color="#b77a3d"/><stop offset="1" stop-color="#6c401c"/></linearGradient>
    </defs></svg>
    <div class="hud">
      <div class="hud-col hud-l">
        <div class="panel p-time"><div class="lbl">${t('timeLabel')}</div><div class="big">0:00</div></div>
        <div class="panel p-barrels"><div class="barrels" aria-label="${t('shippedLabel')}"></div><div class="count"></div></div>
      </div>
      <div class="hud-col hud-r">
        <div class="row">
          <div class="panel p-strikes" aria-label="${t('strikesLabel')}"><div class="lbl">${t('strikesLabel')}</div><div class="slots">${strikeSlots}</div></div>
          <button class="panel btn-pause" type="button" aria-label="${t('pause')}">${ICON.pause}</button>
        </div>
      </div>
      <div class="mid">
        <div class="toast-wrap"></div>
      </div>
      <div class="cd"><div class="cd-n"></div></div>
      <div class="tap"></div>
      <div class="flash"></div>
    </div>

    <div class="scr scr-menu">
      <div class="panel menu-panel menu5">
        <div class="col center">
          <div class="fan">${ICON.fan}</div>
          <div class="title display">${titleWords.join(' ')} <em>${titleLast}</em></div>
          <div class="sub">${t('subtitle')}</div>
          <button class="btn go" type="button">${t('start')}</button>
          <button class="btn alt sm to-title" type="button">${tMain('menu')}</button>
        </div>
        <div class="col">
          <div class="goal display">${t('goal', { n: barrelsText(QUOTA) })}</div>
          <p class="mission">${t('intro')}</p>
          <p class="rule"><i class="ri">${I5.tag}</i><span>${t('rule')}</span></p>
          <ul class="cons">${cons}</ul>
        </div>
        <div class="recipe">${chips}</div>
        <p class="hint">${hasTouch ? t('hintTouch') : keyHint}</p>
      </div>
    </div>

    <div class="scr scr-pause">
      <div class="panel pause-panel">
        <div class="head"><h2 class="display">${t('paused')}</h2></div>
        <div class="col">
          <button class="btn resume" type="button">${t('resume')}</button>
          <button class="btn alt restart" type="button">${t('restart')}</button>
          <button class="btn alt to-title" type="button">${tMain('menu')}</button>
        </div>
        <div class="col">
          <div class="setting"><div class="setting-head"><span>${t('volume')}</span><span class="val vol-val"></span></div>
            <input class="vol" type="range" min="0" max="100" step="5" aria-label="${t('volume')}"></div>
          <button class="btn alt sm snd" type="button"></button>
          <button class="btn alt sm fs" type="button"></button>
        </div>
      </div>
    </div>

    <div class="scr scr-win">
      <div class="panel res-panel res5">
        <div class="stamp">${stamp(t('stampTop'), t('stampBottom'))}</div>
        <div class="head"><div class="note-kind">${t('noteKind')} · ${t('noteWhere')}</div><h2 class="display">${t('winTitle')}</h2><div class="line"></div></div>
        <div class="col">
          <div class="stats">
            <div class="stat"><span>${t('rShipped')}</span><b class="r-ship"></b></div>
            <div class="stat"><span>${t('rBurst')}</span><b class="r-burst"></b></div>
            <div class="stat"><span>${t('rReject')}</span><b class="r-rej"></b></div>
            <div class="stat"><span>${t('rSpill')}</span><b class="r-spill"></b></div>
            <div class="stat"><span>${t('time')}</span><b class="r-time"></b></div>
          </div>
          <div class="btn-row"><button class="btn again" type="button">${t('again')}</button><button class="btn alt to-title" type="button">${tMain('menu')}</button></div>
        </div>
        <div class="card"><h3 class="display">${t('historyTitle')}</h3><p>${t('history')}</p></div>
      </div>
    </div>

    <div class="scr scr-fail">
      <div class="panel res-panel res5">
        <div class="stamp">${stamp(t('stampTop'), t('stampBottom'), t('stampFail'))}</div>
        <div class="head"><div class="note-kind">${t('noteKind')} · ${t('noteWhere')}</div><h2 class="display f-title"></h2><div class="line f-line"></div></div>
        <div class="col">
          <div class="stats">
            <div class="stat"><span>${t('rShipped')}</span><b class="f-ship"></b></div>
            <div class="stat"><span>${t('rBurst')}</span><b class="f-burst"></b></div>
            <div class="stat"><span>${t('rReject')}</span><b class="f-rej"></b></div>
            <div class="stat"><span>${t('rSpill')}</span><b class="f-spill"></b></div>
            <div class="stat"><span>${t('time')}</span><b class="f-time"></b></div>
          </div>
          <div class="btn-row"><button class="btn retry" type="button">${t('tryAgain')}</button><button class="btn alt to-title" type="button">${tMain('menu')}</button></div>
        </div>
        <div class="card"><p class="f-tip"></p></div>
      </div>
    </div>

    <div class="portrait">
      <div class="fan">${ICON.fan}</div>
      <div class="ph">${ICON.phone}</div>
      <h2>${t('rotate')}</h2>
      <p>${t('rotateSub')}</p>
    </div>`;
  host.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const off = () => document.createElement('div');
  const el = {
    hud: $('.hud'), timeBig: $('.p-time .big'),
    barrelsPanel: $('.p-barrels'), barrelGrid: $('.barrels'), barrelList: [], count: $('.p-barrels .count'), goal: $('.menu5 .goal'),
    strikes: $('.p-strikes'), slots: Array.from(root.querySelectorAll('.p-strikes .slots > span')),
    pauseBtn: $('.btn-pause'), mid: $('.mid'), toasts: $('.toast-wrap'),
    // removed on the user's request (speed dial, banner, coach line): detached stand-ins keep old code paths silent
    needle: off(), spd: off(), spdTag: off(), banner: off(), coach: off(),
    cdN: $('.cd-n'), flash: $('.flash'), tap: $('.tap'),
    menu: $('.scr-menu'), pause: $('.scr-pause'), win: $('.scr-win'), fail: $('.scr-fail'),
    vol: $('.vol'), volVal: $('.vol-val'), snd: $('.snd'), fs: $('.fs'),
  };
  const btn = {};
  for (const b of root.querySelectorAll('.sw')) {
    const id = b.dataset.id;
    btn[id] = { el: b, stl: b.querySelector('.sw-stl'), dots: Array.from(b.querySelectorAll('.sw-dots i')), on: null, near: -1, danger: null };
  }

  // ------------------------------------------------------------------------------------------
  // game state -> visible screens
  // ------------------------------------------------------------------------------------------
  let cur = 'menu';
  let resultTimer = 0;
  let shownResult = null;
  const tally = { burst: 0, reject: 0, cap: 0, spill: 0 };
  let liftQ = 0, liftMax = 5;
  const bState = Object.create(null); // barrel id -> last known state (for the reject toast)

  function blurFocus() { try { document.activeElement && document.activeElement !== document.body && document.activeElement.blur(); } catch (e) { /* ignore */ } }

  function applyState(s) {
    if (s === cur) return;
    cur = s;
    clearTimeout(resultTimer);
    const live = s === 'countdown' || s === 'playing';
    el.hud.classList.toggle('on', live || s === 'paused');
    el.menu.classList.toggle('on', s === 'menu');
    el.pause.classList.toggle('on', s === 'paused');
    if (s !== 'won') el.win.classList.remove('on');
    if (s !== 'lost') el.fail.classList.remove('on');
    if (!live) setHover(null);
    if (s === 'countdown' || s === 'menu') {
      resetToasts();
      tally.burst = tally.reject = tally.cap = tally.spill = 0;
      liftQ = 0;
      for (const k in bState) delete bState[k];
      shownResult = null;
      lastSec = -1; lastShipped = -1; lastStrikes = -1; lastSpd = -1; bannerT = 0; bannerKey = '';
      el.banner.classList.remove('on');
      el.spdTag.classList.remove('on');
    }
    if (s === 'won' || s === 'lost') {
      el.coach.classList.remove('on');
      bannerT = 0; bannerKey = ''; el.banner.classList.remove('on');
      resultTimer = setTimeout(() => { if (cur === 'won') el.win.classList.add('on'); else if (cur === 'lost') el.fail.classList.add('on'); }, 900);
    }
    if (s === 'paused') syncSettingsUI();
    blurFocus();
  }
  el.menu.classList.add('on');
  events.on('state', (e) => applyState(e.state));

  // ------------------------------------------------------------------------------------------
  // countdown, toasts, banner, flash
  // ------------------------------------------------------------------------------------------
  let cdAnim = null;
  events.on('countdown', ({ n }) => {
    const go = n <= 0;
    el.cdN.textContent = go ? t('go') : String(n);
    el.cdN.classList.toggle('go', go);
    cdAnim?.cancel();
    cdAnim = el.cdN.animate(
      [
        { opacity: 0, transform: 'scale(1.6)', easing: 'cubic-bezier(.2,.8,.2,1)' },
        { opacity: 1, transform: 'scale(1)', offset: 0.16 },
        { opacity: 1, transform: 'scale(1)', offset: 0.66 },
        { opacity: 0, transform: 'scale(.9)' },
      ],
      { duration: go ? 900 : 950, easing: 'linear', fill: 'both' },
    );
  });

  function resetToasts() { el.toasts.textContent = ''; }
  function toast(title, sub, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast' + (kind ? ' ' + kind : '');
    d.innerHTML = `<b></b>${sub ? '<i></i>' : ''}`;
    d.firstChild.textContent = title;
    if (sub) d.lastChild.textContent = sub;
    d.addEventListener('animationend', () => d.remove());
    el.toasts.appendChild(d);
    while (el.toasts.children.length > 1) el.toasts.firstChild.remove();
  }
  // banner: a timed message (last strike) wins over the standing lift warning
  let bannerT = 0, bannerMsg = '', bannerKey = '';
  function banner(text, sec = 3) { bannerMsg = text; bannerT = sec; syncBanner(); }
  function syncBanner() {
    const lift = cur === 'playing' && liftQ >= 3 ? t('liftWarn', { q: liftQ, m: liftMax }) : '';
    const txt = bannerT > 0 && cur === 'playing' ? bannerMsg : lift;
    if (txt === bannerKey) return;
    bannerKey = txt;
    if (txt) el.banner.textContent = txt;
    el.banner.classList.toggle('on', !!txt);
    el.banner.classList.toggle('lift', !!txt && txt === lift);
  }
  let flashAnim = null;
  function flash(strength) {
    flashAnim?.cancel();
    flashAnim = el.flash.animate([{ opacity: clamp(strength, 0, 1) }, { opacity: 0 }], { duration: 560, easing: 'ease-out' });
  }
  const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch (err) { /* unsupported */ } };

  events.on('line:burst', () => {
    tally.burst++;
    if (cur !== 'playing') return;
    toast(t('toastBurst'), t('toastBurstSub'));
    flash(0.95);
    buzz([50, 40, 70]);
  });
  events.on('line:reject', (e) => {
    const atCap = e && e.where === 'cap';
    if (atCap) tally.cap++; else tally.reject++;
    if (cur !== 'playing') return;
    if (atCap) toast(t('toastCapEmpty'), t('toastCapEmptySub'));
    else {
      const st = e && bState[e.id];
      const need = st && st !== 'capped' ? NEXT_STATION[st] : null;
      toast(t('toastReject'), need ? t('need_' + need) : t('toastRejectSub'));
    }
    flash(0.8);
    buzz(60);
  });
  events.on('line:spill', () => {
    tally.spill++;
    if (cur !== 'playing') return;
    toast(t('toastSpill'), t('toastSpillSub'), 'meh');
    flash(0.4);
  });
  events.on('line:lift', (e) => {
    if (typeof e?.max === 'number') liftMax = e.max;
    liftQ = e?.queue ?? 0;
    syncBanner();
  });
  events.on('line:strike', (e) => {
    if (cur !== 'playing') return;
    const max = e.max ?? MAXS;
    if ((e.strikes ?? 0) === max - 1 && max > 1) banner(t('lastStrike'), 3.2);
    const s = el.slots[(e.strikes ?? 1) - 1];
    s?.animate([{ transform: 'scale(1.7) rotate(-14deg)' }, { transform: 'scale(1) rotate(0)' }], { duration: 420, easing: 'cubic-bezier(.2,.7,.2,1)' });
  });
  events.on('line:ship', (e) => {
    if (cur !== 'playing') return;
    const i = (e.shipped ?? 1) - 1;
    const b = el.barrelList[i];
    b?.animate([{ transform: 'translateY(-6px) scale(1.5)' }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' });
    if ((e.quota ?? QUOTA) - (e.shipped ?? 0) === 1) toast(t('almost'), '', 'ok');
  });
  let spdTagTimer = 0;
  events.on('line:speed', () => {
    if (cur !== 'playing') return;
    el.spdTag.classList.add('on');
    clearTimeout(spdTagTimer);
    spdTagTimer = setTimeout(() => el.spdTag.classList.remove('on'), 2200);
  });
  events.on('line:switch', (e) => { if (e && btn[e.id]) press(e.id); });

  // ------------------------------------------------------------------------------------------
  // result papers
  // ------------------------------------------------------------------------------------------
  const starEls = Array.from(root.querySelectorAll('.scr-win .stamp .star'));
  function fill(prefix, e) {
    $(`.${prefix}-ship`).textContent = `${e.shipped ?? 0} / ${e.quota ?? (builtQuota > 0 ? builtQuota : QUOTA)}`;
    $(`.${prefix}-burst`).textContent = `${tally.burst}×`;
    $(`.${prefix}-rej`).textContent = `${tally.reject + tally.cap}×`;
    $(`.${prefix}-spill`).textContent = `${tally.spill}×`;
    $(`.${prefix}-time`).textContent = fmtTime(e.time ?? 0);
  }
  function showWin(e) {
    shownResult = e;
    const stars = clamp(Math.round(e.stars ?? (3 - (e.strikes ?? 0))), 1, 3);
    starEls.forEach((s, i) => s.classList.toggle('got', i < stars));
    $('.scr-win .line').textContent = t(stars >= 3 ? 'winLine1' : stars === 2 ? 'winLine2' : 'winLine3');
    fill('r', e);
  }
  function showFail(e) {
    shownResult = e;
    const jam = e.reason === 'jam';
    $('.f-title').textContent = t(jam ? 'failJam' : 'failTitle');
    $('.f-line').textContent = t(jam ? 'failJamLine' : 'failLine');
    const worst = tally.burst >= tally.reject && tally.burst >= tally.cap ? 'tipBurst' : tally.cap > tally.reject ? 'tipCap' : 'tipReject';
    $('.f-tip').textContent = t(jam ? 'tipJam' : worst);
    fill('f', e);
  }
  events.on('finish', (e) => { showWin(e || {}); });
  events.on('fail', (e) => { showFail(e || {}); });

  // ------------------------------------------------------------------------------------------
  // fullscreen / orientation (never throws; iOS Safari simply lacks them)
  // ------------------------------------------------------------------------------------------
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function lockLandscape() {
    try { const r = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); r && r.catch && r.catch(() => {}); } catch (e) { /* unsupported */ }
  }
  function enterFullscreen() {
    try {
      if (isFs()) { lockLandscape(); return; }
      const d = document.documentElement;
      const fn = d.requestFullscreen || d.webkitRequestFullscreen;
      if (fn) { const p = fn.call(d); if (p && p.then) p.then(lockLandscape, () => {}); }
      lockLandscape();
    } catch (e) { /* unsupported */ }
  }
  function toggleFullscreen() {
    try {
      if (isFs()) { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {}); }
      else enterFullscreen();
    } catch (e) { /* ignore */ }
  }
  function fullscreenIfTouch() { if ((hasTouch || ctx.isMobile) && !isFs()) enterFullscreen(); }

  // ------------------------------------------------------------------------------------------
  // actions
  // ------------------------------------------------------------------------------------------
  function doStart() { if (cur !== 'menu') return; fullscreenIfTouch(); events.emit('ui:start'); }
  function doRestart() { if (cur === 'paused' || cur === 'won' || cur === 'lost') { fullscreenIfTouch(); events.emit('ui:restart'); } }
  function doPause() { if (cur === 'playing') events.emit('ui:pause'); }
  function doResume() { if (cur === 'paused') events.emit('ui:resume'); }
  const live = () => !portrait && (cur === 'playing' || cur === 'countdown');
  function doSwitch(id) {
    if (!live() || !SW.includes(id)) return false;
    events.emit('ui:switch', { id });
    return true;
  }

  $('.scr-menu .go').addEventListener('click', doStart);
  $('.resume').addEventListener('click', doResume);
  $('.restart').addEventListener('click', doRestart);
  $('.again').addEventListener('click', doRestart);
  $('.retry').addEventListener('click', doRestart);
  // back to the main menu (it lives on the level-1 page, which opens on the title screen without params)
  root.querySelectorAll('.to-title').forEach((b) => b.addEventListener('click', () => {
    try { document.exitPointerLock?.(); } catch { /* ignore */ }
    location.href = location.pathname;
  }));
  el.pauseBtn.addEventListener('click', doPause);

  // switch buttons: act on pointerdown (no 300 ms wait, no focus ring); keyboard activation via click
  const pressAnim = {};
  function press(id) {
    if (!btn[id]) return;
    const b = btn[id].el;
    pressAnim[id]?.cancel();
    pressAnim[id] = b.animate([{ transform: 'translateY(3px) scale(.96)' }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  // settings
  function syncSettingsUI() {
    const v = Math.round(settings.volume * 100);
    el.vol.value = String(v);
    el.vol.style.setProperty('--v', v + '%');
    el.volVal.textContent = v + ' %';
    el.snd.innerHTML = (settings.muted ? ICON.soundOff : ICON.soundOn) + `<span>${t(settings.muted ? 'soundOff' : 'soundOn')}</span>`;
    el.fs.innerHTML = ICON.fullscreen + `<span>${t(isFs() ? 'fullscreenOff' : 'fullscreenOn')}</span>`;
  }
  el.vol.addEventListener('input', () => {
    settings.volume = clamp(Number(el.vol.value) / 100, 0, 1);
    if (settings.volume > 0 && settings.muted) { settings.muted = false; events.emit('audio:mute', { muted: false }); }
    saveSettings();
    syncSettingsUI();
    events.emit('audio:volume', { value: settings.volume });
  });
  el.snd.addEventListener('click', () => {
    settings.muted = !settings.muted;
    saveSettings();
    syncSettingsUI();
    events.emit('audio:mute', { muted: settings.muted });
  });
  if (canFullscreen) {
    el.fs.addEventListener('click', () => { toggleFullscreen(); });
    document.addEventListener('fullscreenchange', syncSettingsUI);
    document.addEventListener('webkitfullscreenchange', syncSettingsUI);
  } else el.fs.style.display = 'none';
  syncSettingsUI();

  // ------------------------------------------------------------------------------------------
  // 3D picking: pointer ray -> belt plane -> nearest switch point / branch within PICK_R
  // ------------------------------------------------------------------------------------------
  const canvas = ctx.renderer?.domElement;
  const ray = THREE ? new THREE.Raycaster() : null;
  const plane = THREE ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -(layout.beltHeight ?? 0.75)) : null;
  const ndc = THREE ? new THREE.Vector2() : null;
  const hitP = THREE ? new THREE.Vector3() : null;
  function pickAt(cx, cy) {
    if (!ray || !canvas || !ctx.camera) return null;
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, ctx.camera);
    // 1) screen space: the visible signal disk (from hall.js) or the switch point on the belt — what players aim at
    const px = cx - r.left, py = cy - r.top;
    const scr = (v) => { v.project(ctx.camera); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height]; };
    const tol = Math.max(28, Math.min(r.width, r.height) * 0.075);
    let best = null, bd = tol;
    for (const id of SW) {
      const p0 = belts.branches[id].path.at(0);
      const cands = [new THREE.Vector3(p0.x, layout.beltHeight ?? 0.75, p0.z)];
      if (ctx.switchDiscs?.[id]) cands.push(ctx.switchDiscs[id].clone());
      for (const v of cands) { const [sx, sy] = scr(v); const d = Math.hypot(px - sx, py - sy); if (d < bd) { bd = d; best = id; } }
    }
    if (best) return { id: best, x: cx, y: cy };
    // 2) world space: anywhere on a branch, except its rejoin tail (that sits next to the following switch)
    if (!ray.ray.intersectPlane(plane, hitP)) return null;
    bd = PICK_R;
    for (const id of SW) {
      const b = belts.branches[id];
      const pr = b.path.project(hitP.x, hitP.z);
      if (!b.exit && pr.s > b.path.length - 1.6) continue;
      if (pr.d < bd) { bd = pr.d; best = id; }
    }
    return best ? { id: best, x: cx, y: cy } : null;
  }
  let hoverId = null;
  function setHover(id) {
    if (id === hoverId) return;
    if (hoverId && btn[hoverId]) btn[hoverId].el.classList.remove('hover');
    hoverId = id;
    if (id && btn[id]) btn[id].el.classList.add('hover');
    if (canvas) canvas.style.cursor = id ? 'pointer' : '';
  }
  let tapAnim = null;
  function tapRing(x, y, id) {
    el.tap.style.left = x + 'px';
    el.tap.style.top = y + 'px';
    el.tap.style.setProperty('--c', ST[id].color);
    tapAnim?.cancel();
    tapAnim = el.tap.animate([{ opacity: 0.95, transform: 'translate(-50%,-50%) scale(.4)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.25)' }], { duration: 380, easing: 'ease-out' });
  }
  if (canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!live() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const p = pickAt(e.clientX, e.clientY);
      if (!p) return;
      e.preventDefault();
      if (doSwitch(p.id)) { tapRing(e.clientX, e.clientY, p.id); buzz(8); }
    });
    let hoverQ = null;
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      if (!hoverQ) requestAnimationFrame(() => { const q = hoverQ; hoverQ = null; setHover(live() && q ? pickAt(q.x, q.y)?.id ?? null : null); });
      hoverQ = { x: e.clientX, y: e.clientY };
    }, { passive: true });
    canvas.addEventListener('pointerleave', () => setHover(null));
  }

  // ------------------------------------------------------------------------------------------
  // keyboard
  // ------------------------------------------------------------------------------------------
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.code;
    if (e.repeat) return;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(k);
    if (m && KEY[m[1]]) {
      if (live()) { e.preventDefault(); doSwitch(KEY[m[1]]); }
      return;
    }
    if (k === 'Enter' || k === 'NumpadEnter') {
      if (cur === 'menu') { e.preventDefault(); doStart(); return; }
      if (cur === 'won' || cur === 'lost') { e.preventDefault(); doRestart(); return; }
    }
    if (k === 'Escape' || k === 'KeyP') {
      if (cur === 'playing') doPause(); else if (cur === 'paused') doResume();
    }
  });

  // ------------------------------------------------------------------------------------------
  // no zoom / scroll / long-press menus
  // ------------------------------------------------------------------------------------------
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas?.addEventListener('contextmenu', (e) => e.preventDefault());
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.target instanceof Element && e.target.type !== 'range') e.preventDefault(); }, { passive: false });
  window.addEventListener('touchstart', () => {
    if (!hasTouch && touchParam !== '0') { hasTouch = true; root.classList.add('has-touch'); $('.scr-menu .hint').textContent = t('hintTouch'); }
  }, { once: true, passive: true });

  // ------------------------------------------------------------------------------------------
  // portrait overlay + where the empty middle of the loop is on screen (toasts / coach go there)
  // ------------------------------------------------------------------------------------------
  let portrait = false;
  let layoutKey = '';
  function onResize() {
    const p = innerHeight > innerWidth && (hasTouch || innerWidth <= 700);
    if (p !== portrait) {
      portrait = p;
      root.classList.toggle('is-portrait', p);
      if (p) setHover(null);
    }
  }
  addEventListener('resize', onResize);
  addEventListener('orientationchange', () => setTimeout(onResize, 150));
  const v3 = THREE ? new THREE.Vector3() : null;
  function placeMid() {
    // main.js refits the camera on resize (after us), so this runs from update() whenever the projection changed
    const cam = ctx.camera;
    if (!cam || !v3) return;
    const pm = cam.projectionMatrix.elements;
    const key = innerWidth + 'x' + innerHeight + ':' + pm[0].toFixed(4) + ':' + pm[5].toFixed(4);
    if (key === layoutKey) return;
    layoutKey = key;
    cam.updateMatrixWorld();
    const pts = layout.ring.points;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const inset = (layout.beltWidth ?? 0.8) * 0.5 + (layout.barrel?.radius ?? 0.3) + 0.25;
    const proj = (x, z) => { v3.set(x, layout.beltHeight ?? 0.75, z).project(cam); return [(v3.x + 1) / 2 * innerWidth, (1 - v3.y) / 2 * innerHeight]; };
    const [l, top] = proj(minX + inset, minZ + inset + 0.6); // barrels + tags stand up toward the camera
    const [r] = proj(maxX - inset, minZ + inset + 0.6);
    const [, bot] = proj(minX + inset, maxZ - inset);
    const s = root.style;
    // keep to the middle 70 %: the switch lamps sit just inside the loop's corners
    const w = Math.max(200, (r - l) * 0.7);
    s.setProperty('--mid-l', Math.round((l + r) / 2 - w / 2) + 'px');
    s.setProperty('--mid-w', Math.round(w) + 'px');
    s.setProperty('--mid-t', Math.round(top) + 'px');
    s.setProperty('--mid-h', Math.max(96, Math.round(bot - top)) + 'px');
  }

  // ------------------------------------------------------------------------------------------
  // per-frame
  // ------------------------------------------------------------------------------------------
  function update(dt) {
    placeMid();
    nearAcc += dt;
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) syncBanner(); }
  }

  // which switch each barrel reaches next, and in how many metres (along the ring, branches rejoin first)
  const ring = belts.ring, L = ring.length;
  function distToSwitch(b, sw) {
    if (b.belt === 'ring') return mod(sw - b.s, L);
    if (b.belt === 'entry') return (belts.entry.path.length - b.s) + mod(sw - belts.entry.join, L);
    const br = belts.branches[b.belt];
    if (!br || br.exit || br.join == null) return Infinity;
    return (br.path.length - b.s) + mod(sw - br.join, L);
  }
  // walk the switches in the order the barrel meets them; an ON switch diverts it, so later ones don't count
  const swOrder = SW.map((id) => ({ id, s: belts.branches[id].sw, d: 0 }));
  const EFFECT = { wash: { dirty: 'clean' }, fill: { clean: 'full' }, cap: { full: 'capped' } };
  // what each station would ruin: spill (wash), burst (fill), empty barrel capped (cap), unfinished shipped (ship)
  const HARM = { wash: (s) => s === 'full' || s === 'capped', fill: (s) => s === 'dirty', cap: (s) => s === 'dirty' || s === 'clean', ship: (s) => s !== 'capped' };
  const near = {}, danger = {};
  let nearAcc = 1;
  function computeNear(h) {
    for (const id of SW) { near[id] = 0; danger[id] = false; }
    const barrels = h.barrels || [];
    const speed = Math.max(0.3, h.speed || LINE.speedStart || 1.3);
    const sws = h.switches || {};
    for (const b of barrels) {
      const br = belts.branches[b.belt];
      if (b.belt !== 'ring' && b.belt !== 'entry' && !(br && !br.exit)) continue;
      // a barrel still before its station on a branch will come back changed
      let state = b.state;
      if (br && b.s < br.stationS && EFFECT[b.belt]?.[state]) state = EFFECT[b.belt][state];
      if (br && b.belt === 'fill' && b.s < br.stationS && state === 'dirty') continue; // about to burst anyway
      const need = NEXT_STATION[state];
      for (const o of swOrder) o.d = distToSwitch(b, o.s);
      swOrder.sort((a, c) => a.d - c.d);
      for (const o of swOrder) {
        const tArr = o.d / speed;
        if (tArr > APPROACH_S) break;
        if (need === o.id) near[o.id]++;
        if (sws[o.id]) {
          if (tArr <= DANGER_S && HARM[o.id]?.(state)) danger[o.id] = true;
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------
  // HUD (DOM touched only when a value changed)
  // ------------------------------------------------------------------------------------------
  let lastSec = -1, lastShipped = -1, lastQuota = -1, lastStrikes = -1, lastSpd = -1, lastCoach = null;

  // the quota barrels: one row up to 12, two rows above that (24 = 2 x 12)
  let builtQuota = -1;
  function buildBarrels(q) {
    builtQuota = q;
    const cols = q > 12 ? Math.ceil(q / 2) : q;
    el.barrelGrid.style.gridTemplateColumns = `repeat(${cols}, var(--bw))`;
    el.barrelGrid.innerHTML = Array.from({ length: q }, () => `<span class="todo">${ICON.barrel}</span>`).join('');
    el.barrelList = Array.from(el.barrelGrid.children);
    el.goal.textContent = t('goal', { n: barrelsText(q) });
    lastShipped = -1;
  }
  buildBarrels(QUOTA);

  function setHUD(h) {
    if (h.state && h.state !== cur) applyState(h.state);
    if (h.result && h.result !== shownResult) {
      if (cur === 'won') showWin(h.result); else if (cur === 'lost') showFail(h.result);
    }
    if (h.barrels) for (const b of h.barrels) bState[b.id] = b.state;
    if (typeof h.quota === 'number' && h.quota !== builtQuota) buildBarrels(h.quota);
    if (typeof h.liftMax === 'number') liftMax = h.liftMax;
    if (typeof h.liftQueue === 'number' && h.liftQueue !== liftQ && cur === 'playing') { liftQ = h.liftQueue; syncBanner(); }
    if (!el.hud.classList.contains('on')) return;

    // time (elapsed)
    const sec = Math.floor(h.time ?? 0);
    if (sec !== lastSec) { lastSec = sec; el.timeBig.textContent = fmtTime(sec); }

    // dispatched barrels vs quota
    const shipped = h.shipped ?? 0, quota = h.quota ?? QUOTA;
    if (shipped !== lastShipped || quota !== lastQuota) {
      lastShipped = shipped; lastQuota = quota;
      for (let i = 0; i < el.barrelList.length; i++) el.barrelList[i].className = i < shipped ? 'ok' : 'todo';
      el.count.textContent = t('shipped', { n: shipped, q: quota });
    }

    // strikes
    const strikes = h.strikes ?? 0, maxS = h.maxStrikes ?? MAXS;
    if (strikes !== lastStrikes) {
      lastStrikes = strikes;
      for (let i = 0; i < el.slots.length; i++) el.slots[i].className = i < strikes ? 'hit' : '';
      el.strikes.classList.toggle('hot', strikes >= maxS - 1 && strikes > 0);
    }

  }

  onResize();
  setTimeout(onResize, 300); // fonts / layout settle

  return { update, setHUD };
}
