// Level 4 "Varna" UI (first-person catwalk run): menu (mission + three hazard rows + controls), countdown, a minimal
// HUD on the top edge only (pressure gauge = time left, slim course progress bar with section ticks + runner marker,
// hits), hit flash + shake, hole fall fade + penalty slip, short section tag, touch controls (◀ ▶ bottom left, big red
// jump bottom right, swipes anywhere), pause, result / fail papers, portrait overlay.
// The centre of the screen stays free during play: the first-person view needs it.
// Plain DOM + CSS rendered into #ui. Shared look from ../ui/ui.css, level parts in ui4.css, strings in i18n.js.
//
// Public API (used by src/level4/main.js):  createUI4(ctx) -> { input, update(dt), setHUD(hud) }
//   input = { left, right, jump }   press counts since the last frame (main.js resets them to 0 every frame)
// Emits:    ui:start, ui:restart, ui:pause, ui:resume, audio:volume {value}, audio:mute {muted}
// Consumes: state, countdown, run:hit, run:hole, run:respawn, run:section, finish, fail
import '../ui/ui.css';
import './ui4.css';
import { ICON, NEEDLE, stamp } from '../ui/icons.js';
import { settings, saveSettings } from '../ui/shared.js';
import { t, fmtNum } from './i18n.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const LOW_S = 15;   // needle enters the red zone, audio heartbeat starts
const CRIT_S = 10;  // gauge pulses red + one warning slip

// level icons (currentColor, 24×24)
const I4 = {
  steam: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18c-2.2-2.6 2.2-4.4 0-7s2.2-4.4 0-7M12 18c-2.2-2.6 2.2-4.4 0-7s2.2-4.4 0-7M17 18c-2.2-2.6 2.2-4.4 0-7s2.2-4.4 0-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="3" y="19.5" width="18" height="3" rx="1" fill="currentColor"/></svg>`,
  drip: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="2" width="22" height="4.5" rx="1" fill="currentColor"/><rect x="10" y="6" width="4" height="2" fill="currentColor"/><path d="M12 10.5l3.6 6.1a3.8 3.8 0 1 1-7.2 0z" fill="currentColor"/></svg>`,
  hole: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M0.5 8h7.5v9H0.5zM16 8h7.5v9H16z" fill="currentColor"/><path d="M3 8v9M5.5 8v9M18.5 8v9M21 8v9" stroke="#1d2a23" stroke-width="1.1"/><path d="M12 6.5v8" stroke="currentColor" stroke-width="2.2"/><path d="M8.8 13.5L12 19l3.2-5.5z" fill="currentColor"/></svg>`,
  pipe: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="0.5" y="10" width="23" height="6" rx="1" fill="currentColor"/><rect x="4.5" y="8" width="2.6" height="10" rx=".6" fill="currentColor"/><rect x="16.9" y="8" width="2.6" height="10" rx=".6" fill="currentColor"/><path d="M8 6.5c1.5-2 2.5-2 4-4M14 6.5c1.5-2 2.5-2 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/></svg>`,
  sack: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0.5v3" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 4.5h7l-1.6 2.8c3.4 1.8 5.6 5.6 5.6 9.4 0 3.4-2.2 5.8-5.6 5.8H10c-3.4 0-5.6-2.4-5.6-5.8 0-3.8 2.2-7.6 5.6-9.4z" fill="currentColor"/><path d="M9.5 8h5" stroke="#efe4c6" stroke-width="1.4" opacity=".7"/></svg>`,
  valve: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9.2" stroke-width="2.6"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" stroke-width="1.7"/></g><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>`,
  runner: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="15.2" cy="3.6" r="2.5" fill="currentColor"/><path d="M13.9 6.9l-4.6 1.2-2.6 3.8 1.7 1 2-2.8 1.8-.4-1.9 5.4-4.2 3.5 1.4 1.5 4.6-3.8 1.6 2.4-.4 5h2l.5-5.8-2.2-3.4 1.2-3.6 1.4 2 3.7.6.3-1.9-2.8-.5-2.1-3.5c-.4-.7-1.2-.9-1.9-.7z" fill="currentColor"/></svg>`,
  burst: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1l2.2 6 5.6-3-2.4 6 5.6 2-5.6 2 2.4 6-5.6-3L12 23l-2.2-6-5.6 3 2.4-6L1 12l5.6-2-2.4-6 5.6 3z" fill="currentColor"/></svg>`,
  swipe: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h13M12.5 4.5L16 8l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 14.5v-2.2a1.3 1.3 0 0 1 2.6 0v4.2l3.6.7a2 2 0 0 1 1.6 2.3l-.6 3H11l-3.2-4.2a1.2 1.2 0 0 1 1.8-1.6l.4.4z" fill="currentColor"/></svg>`,
};

// manometer face: 0..6 atm over -120..+120 degrees, red zone for the last LOW_S seconds. Static, built once.
function gaugeFace(redFrac) {
  const cx = 50, cy = 50, MAX = 6;
  const ang = (f) => -120 + f * 240;
  const pt = (deg, r) => { const a = (deg - 90) * Math.PI / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  let ticks = '';
  for (let v = 0; v <= MAX + 1e-6; v += 0.5) {
    const major = Math.abs(v - Math.round(v)) < 1e-6;
    const [x1, y1] = pt(ang(v / MAX), major ? 32 : 37);
    const [x2, y2] = pt(ang(v / MAX), 42);
    ticks += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#2b1b0e" stroke-width="${major ? 2.4 : 1.2}"/>`;
  }
  let nums = '';
  for (let v = 0; v <= MAX; v += 2) {
    const [x, y] = pt(ang(v / MAX), 23);
    nums += `<text x="${x.toFixed(1)}" y="${(y + 4.5).toFixed(1)}" text-anchor="middle">${v}</text>`;
  }
  const [ax, ay] = pt(ang(redFrac), 39.5), [bx, by] = pt(ang(1), 39.5);
  const large = (1 - redFrac) * 240 > 180 ? 1 : 0;
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="48" fill="#1d2a23"/>
    <circle cx="50" cy="50" r="45" fill="#efe4c6"/>
    <path d="M${ax.toFixed(1)} ${ay.toFixed(1)}A39.5 39.5 0 ${large} 1 ${bx.toFixed(1)} ${by.toFixed(1)}" fill="none" stroke="#9a2b1c" stroke-width="7" opacity=".85"/>
    ${ticks}
    <g font-family="'Alegreya Sans', Georgia, serif" font-weight="500" font-size="13" fill="#2b1b0e">${nums}</g>
    <text x="50" y="78" text-anchor="middle" font-family="'Alegreya Sans', Georgia, serif" font-weight="500" font-size="10" fill="rgba(43,27,14,.6)">${t('atm')}</text>
  </svg>`;
}

// race clock "m:ss,d"
function fmtTenths(sec) {
  sec = Math.max(0, sec || 0);
  const d = Math.floor(sec * 10 + 1e-6);
  const m = Math.floor(d / 600), s = Math.floor(d / 10) % 60, ds = d % 10;
  return `${m}:${s < 10 ? '0' : ''}${s},${ds}`;
}
// time left on the gauge: whole seconds, rounded up ("0:07" until it really hits zero)
function fmtLeft(sec) {
  const s = Math.max(0, Math.ceil(sec - 1e-6));
  return `${Math.floor(s / 60)}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
}

export function createUI4(ctx) {
  const { events } = ctx;
  const RUN = ctx.run || {};
  const course = ctx.course || {};
  const host = document.getElementById('ui') || document.body;
  const params = new URLSearchParams(location.search);
  const touchParam = params.get('touch'); // debug: ?touch=1 forces the touch controls (and mouse swipes), ?touch=0 hides them

  let hasTouch = touchParam === '1' || (touchParam !== '0' && (!!ctx.isMobile || 'ontouchstart' in window || navigator.maxTouchPoints > 0));
  const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  const TL = RUN.timeLimit ?? 70;
  const PENALTY = RUN.fallPenalty ?? 2.5;
  const S0 = course.start ?? 0;
  const S1 = course.finish ?? (course.length || 1);
  const span = Math.max(1, S1 - S0);
  const ticks = (course.sections || []).slice(1)
    .map((s) => clamp((s.from - S0) / span, 0, 1))
    .filter((f) => f > 0.01 && f < 0.99);

  const input = { left: 0, right: 0, jump: 0 };

  // ------------------------------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------------------------------
  const titleWords = t('title').split(' ');
  const titleLast = titleWords.pop();
  const hintHtml = (s) => s.split('  ·  ').map((x) => `<span class="nb">${x}</span>`).join('<span class="sep"> · </span>');
  const keyHint = hintHtml(t('hintKeys'));
  const touchHint = hintHtml(t('hintTouch'));
  const tickHtml = ticks.map((f) => `<i class="prog-tick" style="left:${(f * 100).toFixed(2)}%"></i>`).join('');

  const root = document.createElement('div');
  root.className = 'plz plz4' + (hasTouch ? ' has-touch' : '');
  root.innerHTML = `
    <div class="hud">
      <div class="fall"></div>
      <div class="flash"></div>
      <div class="hud-top">
        <div class="hud-col hud-l">
          <div class="panel p-gauge" aria-label="${t('pressure')}">
            <div class="dial gauge">${gaugeFace((TL - LOW_S) / TL)}<div class="needle">${NEEDLE}</div></div>
            <div class="g-time"><span class="big">${fmtLeft(TL)}</span></div>
          </div>
        </div>
        <div class="panel p-prog" aria-label="${t('progressLabel')}">
          <div class="prog-track">
            <div class="prog-bar"><div class="prog-fill"></div></div>
            ${tickHtml}
            <div class="prog-man">${I4.runner}</div>
          </div>
          <div class="prog-valve">${I4.valve}</div>
          <div class="sec-tag"></div>
        </div>
        <div class="hud-col hud-r">
          <div class="row">
            <div class="panel p-hits" aria-label="${t('hitsLabel')}" title="${t('hitsLabel')}"><i>${I4.burst}</i><b class="hits">0</b></div>
            <button class="panel btn-pause" type="button" aria-label="${t('pause')}">${ICON.pause}</button>
          </div>
        </div>
      </div>
      <div class="top-wrap toast-wrap"></div>
      <div class="cd"><div class="cd-n"></div></div>
    </div>

    <div class="ctl">
      <div class="grp grp-l">
        <div class="pad pad-left" role="button" aria-label="${t('btnLeft')}">${ICON.chevL}</div>
        <div class="pad pad-right" role="button" aria-label="${t('btnRight')}">${ICON.chevR}</div>
      </div>
      <div class="grp grp-r">
        <div class="pad pad-jump" role="button" aria-label="${t('btnJump')}">${ICON.pedalUp}<span>${t('btnJump')}</span></div>
      </div>
    </div>
    <div class="panel kbd-hint">${keyHint}</div>

    <div class="scr scr-menu">
      <div class="panel menu-panel menu4">
        <div class="col center">
          <div class="fan">${ICON.fan}</div>
          <div class="title display">${titleWords.join(' ')} <em>${titleLast}</em></div>
          <div class="sub">${t('subtitle')}</div>
          <button class="btn go" type="button">${t('start')}</button>
        </div>
        <div class="col">
          <div class="goal display">${t('goal')}</div>
          <p class="mission">${t('mission')}</p>
          <ul class="hz">
            <li><span class="hz-i">${I4.steam}${I4.drip}</span><span><b>${t('hz_dodge')}</b> – ${t('hz_dodgeDo')}</span></li>
            <li><span class="hz-i">${I4.hole}${I4.pipe}</span><span><b>${t('hz_jump')}</b> – ${t('hz_jumpDo')}</span></li>
            <li><span class="hz-i">${I4.sack}</span><span><b>${t('hz_sack')}</b> – ${t('hz_sackDo')}</span></li>
          </ul>
        </div>
        <p class="hint">${hasTouch ? touchHint : keyHint}</p>
      </div>
    </div>

    <div class="scr scr-pause">
      <div class="panel pause-panel">
        <div class="head"><h2 class="display">${t('paused')}</h2></div>
        <div class="col">
          <button class="btn resume" type="button">${t('resume')}</button>
          <button class="btn alt restart" type="button">${t('restart')}</button>
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
      <div class="panel res-panel res4">
        <div class="stamp">${stamp(t('stampTop'), t('stampBottom'))}</div>
        <div class="head"><div class="note-kind">${t('noteKind')} · ${t('noteWhere')}</div><h2 class="display">${t('winTitle')}</h2><div class="line"></div></div>
        <div class="col">
          <div class="stats">
            <div class="stat"><span>${t('rTime')}</span><b class="r-time"></b></div>
            <div class="stat"><span>${t('rLeft')}</span><b class="r-left"></b></div>
            <div class="stat"><span>${t('rHits')}</span><b class="r-hits"></b></div>
            <div class="stat"><span>${t('rFalls')}</span><b class="r-falls"></b></div>
          </div>
          <button class="btn again" type="button">${t('again')}</button>
        </div>
        <div class="card"><h3 class="display">${t('historyTitle')}</h3><p>${t('history')}</p></div>
      </div>
    </div>

    <div class="scr scr-fail">
      <div class="panel res-panel res4">
        <div class="stamp">${stamp(t('stampTop'), t('stampBottom'), t('stampFail'))}</div>
        <div class="head"><div class="note-kind">${t('noteKind')} · ${t('noteWhere')}</div><h2 class="display">${t('failTitle')}</h2><div class="line">${t('failLine')}</div></div>
        <div class="col">
          <div class="stats">
            <div class="stat"><span>${t('rProgress')}</span><b class="f-prog"></b></div>
            <div class="stat"><span>${t('rHits')}</span><b class="f-hits"></b></div>
            <div class="stat"><span>${t('rFalls')}</span><b class="f-falls"></b></div>
          </div>
          <button class="btn retry" type="button">${t('tryAgain')}</button>
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
  const el = {
    hud: $('.hud'), top: $('.hud-top'), ctl: $('.ctl'), kbd: $('.kbd-hint'),
    gauge: $('.p-gauge'), needle: $('.gauge .needle'), timeBig: $('.g-time .big'),
    progTrack: $('.prog-track'), progFill: $('.prog-fill'), man: $('.prog-man'), secTag: $('.sec-tag'),
    hitsPanel: $('.p-hits'), hits: $('.p-hits .hits'), pauseBtn: $('.btn-pause'),
    toasts: $('.toast-wrap'), cdN: $('.cd-n'), flash: $('.flash'), fall: $('.fall'),
    menu: $('.scr-menu'), pause: $('.scr-pause'), win: $('.scr-win'), fail: $('.scr-fail'),
    menuHint: $('.menu4 .hint'),
    vol: $('.vol'), volVal: $('.vol-val'), snd: $('.snd'), fs: $('.fs'),
  };
  const pad = { left: $('.pad-left'), right: $('.pad-right'), jump: $('.pad-jump') };

  // ------------------------------------------------------------------------------------------
  // game state -> visible screens
  // ------------------------------------------------------------------------------------------
  let cur = 'menu';
  let resultTimer = 0;
  let shownResult = null;
  let hintT = -1;
  let secT = 0;
  let fallT = 0;          // > 0 while the hole-fall fade is up (safety timeout)
  let warned = false;     // the last-10-s slip was shown this run
  let lastHud = {};

  function blurFocus() { try { document.activeElement && document.activeElement !== document.body && document.activeElement.blur(); } catch (e) { /* ignore */ } }

  function resetRunUI() {
    resetToasts();
    shownResult = null;
    warned = false;
    secT = 0; el.secTag.classList.remove('on');
    setFall(false);
    lastLeft = -1; lastLowCls = null; lastCrit = null; lastHits = -1; lastProgQ = -1; lastNeedle = -999;
  }

  function applyState(s) {
    if (s === cur) return;
    const prev = cur;
    cur = s;
    clearTimeout(resultTimer);
    const live = s === 'countdown' || s === 'playing';
    el.hud.classList.toggle('on', live || s === 'paused');
    el.ctl.classList.toggle('on', live);
    el.menu.classList.toggle('on', s === 'menu');
    el.pause.classList.toggle('on', s === 'paused');
    if (s !== 'won') el.win.classList.remove('on');
    if (s !== 'lost') el.fail.classList.remove('on');
    if (!live) releasePads();
    if (s === 'playing' && prev === 'countdown') hintT = 0;
    else if (s !== 'paused' && s !== 'playing') { hintT = -1; el.kbd.classList.remove('on'); }
    if (s === 'countdown' || s === 'menu') resetRunUI();
    if (s === 'won' || s === 'lost') {
      setFall(false);
      secT = 0; el.secTag.classList.remove('on');
      resultTimer = setTimeout(() => { if (cur === 'won') el.win.classList.add('on'); else if (cur === 'lost') el.fail.classList.add('on'); }, 900);
    }
    if (s === 'paused') syncSettingsUI();
    blurFocus();
  }
  el.menu.classList.add('on');
  events.on('state', (e) => applyState(e.state));

  // ------------------------------------------------------------------------------------------
  // countdown, toasts, flash, fall fade, section tag
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
  const buzz = (ms) => { try { navigator.vibrate?.(ms); } catch (err) { /* unsupported */ } };

  let flashAnim = null, shakeAnim = null;
  function hitFx(strength) {
    flashAnim?.cancel();
    flashAnim = el.flash.animate([{ opacity: clamp(strength, 0, 1) }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
    shakeAnim?.cancel();
    shakeAnim = el.top.animate([
      { transform: 'translate(0,0)' }, { transform: 'translate(-5px,2px)' }, { transform: 'translate(4px,-2px)' },
      { transform: 'translate(-3px,1px)' }, { transform: 'translate(2px,0)' }, { transform: 'translate(0,0)' },
    ], { duration: 320, easing: 'linear' });
    el.hitsPanel.classList.add('hot');
    clearTimeout(hitFx.tm);
    hitFx.tm = setTimeout(() => el.hitsPanel.classList.remove('hot'), 700);
  }
  function setFall(on) {
    fallT = on ? 3 : 0;
    el.fall.classList.toggle('on', on);
  }

  events.on('run:hit', (e) => {
    if (cur !== 'playing') return;
    hitFx(e && (e.kind === 'steam' || e.kind === 'drip') ? 0.8 : 1);
    el.hits.animate([{ transform: 'scale(1.6)' }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.7,.2,1)' });
    buzz(45);
  });
  events.on('run:hole', () => {
    if (cur !== 'playing') return;
    setFall(true);
    toast(t('toastFall'), t('penalty', { n: fmtNum(PENALTY) }), 'drop');
    buzz([40, 40, 80]);
  });
  events.on('run:respawn', () => setFall(false));
  events.on('run:section', (e) => {
    if ((cur !== 'playing' && cur !== 'countdown') || !e || !e.name) return;
    el.secTag.textContent = e.name;
    el.secTag.classList.remove('on');
    void el.secTag.offsetWidth; // restart the slide-in
    el.secTag.classList.add('on');
    secT = 1.6;
  });

  // ------------------------------------------------------------------------------------------
  // result papers
  // ------------------------------------------------------------------------------------------
  const starEls = Array.from(root.querySelectorAll('.scr-win .stamp .star'));
  function showWin(e) {
    shownResult = e;
    const hits = e.hits ?? lastHud.hits ?? 0, falls = e.falls ?? lastHud.falls ?? 0;
    const stars = clamp(Math.round(e.stars ?? 1), 1, 3);
    starEls.forEach((s, i) => s.classList.toggle('got', i < stars));
    $('.scr-win .line').textContent = t(stars >= 3 ? 'winLine1' : stars === 2 ? 'winLine2' : 'winLine3');
    $('.r-time').textContent = fmtTenths(e.time ?? lastHud.time ?? 0);
    $('.r-left').textContent = `${fmtNum(e.remaining ?? lastHud.remaining ?? 0)} s`;
    $('.r-hits').textContent = `${hits}×`;
    $('.r-falls').textContent = `${falls}×`;
  }
  function showFail(e) {
    shownResult = e;
    const hits = e.hits ?? lastHud.hits ?? 0, falls = e.falls ?? lastHud.falls ?? 0;
    const p = clamp(e.progress ?? lastHud.progress ?? 0, 0, 1);
    $('.f-prog').textContent = `${Math.floor(p * 100)} %`;
    $('.f-hits').textContent = `${hits}×`;
    $('.f-falls').textContent = `${falls}×`;
    // the tip goes after whatever cost the most time (a fall costs ~penalty + run-up, a hit ~0.5 s)
    const fallCost = falls * (PENALTY + 1), hitCost = hits * 0.5;
    $('.f-tip').textContent = t(falls && fallCost >= hitCost ? 'tipFalls' : hits >= 2 ? 'tipHits' : 'tipTime');
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
  const live = () => !portrait && cur === 'playing';

  $('.scr-menu .go').addEventListener('click', doStart);
  $('.resume').addEventListener('click', doResume);
  $('.restart').addEventListener('click', doRestart);
  $('.again').addEventListener('click', doRestart);
  $('.retry').addEventListener('click', doRestart);
  el.pauseBtn.addEventListener('click', doPause);

  // one press = one lane step / one jump
  function act(kind) {
    if (!live()) return false;
    input[kind]++;
    return true;
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
  // touch pads: act on pointerdown (no tap delay); each pad lights while held. Multi-touch safe.
  // ------------------------------------------------------------------------------------------
  const held = { left: new Set(), right: new Set(), jump: new Set() };
  function renderPad(k) { pad[k].classList.toggle('on', held[k].size > 0); }
  for (const k of Object.keys(pad)) {
    const p = pad[k];
    p.addEventListener('pointerdown', (e) => {
      if (!live() && cur !== 'countdown') return;
      e.preventDefault();
      e.stopPropagation();
      try { p.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      held[k].add(e.pointerId);
      renderPad(k);
      if (act(k)) buzz(6);
    });
    const up = (e) => { if (held[k].delete(e.pointerId)) renderPad(k); };
    p.addEventListener('pointerup', up);
    p.addEventListener('pointercancel', up);
    p.addEventListener('lostpointercapture', up);
  }
  function releasePads() {
    for (const k in held) { held[k].clear(); renderPad(k); }
    swipes.clear();
  }

  // ------------------------------------------------------------------------------------------
  // swipes anywhere outside the buttons: left / right = lane, up = jump. One action per stroke, fired as soon as
  // the finger has travelled far enough (not on release) so it feels instant.
  // ------------------------------------------------------------------------------------------
  const swipes = new Map(); // pointerId -> { x, y, done }
  const mouseSwipes = () => touchParam === '1';
  addEventListener('pointerdown', (e) => {
    if (!live() || (e.pointerType === 'mouse' && !mouseSwipes())) return;
    const tg = e.target;
    if (tg instanceof Element && tg.closest('.pad, button, input, .scr')) return;
    swipes.set(e.pointerId, { x: e.clientX, y: e.clientY, done: false });
  }, { passive: true });
  addEventListener('pointermove', (e) => {
    const s = swipes.get(e.pointerId);
    if (!s || s.done) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    const th = Math.max(24, Math.min(innerWidth, innerHeight) * 0.06);
    if (dx * dx + dy * dy < th * th) return;
    s.done = true;
    let kind = null;
    if (Math.abs(dx) >= Math.abs(dy)) kind = dx < 0 ? 'left' : 'right';
    else if (dy < 0) kind = 'jump';
    if (kind && act(kind)) {
      buzz(6);
      const p = pad[kind];
      p.animate([{ transform: 'translateY(2px)', backgroundColor: kind === 'jump' ? '#75200f' : '#111a15' }, { transform: 'none' }], { duration: 180 });
    }
  }, { passive: true });
  const endSwipe = (e) => swipes.delete(e.pointerId);
  addEventListener('pointerup', endSwipe, { passive: true });
  addEventListener('pointercancel', endSwipe, { passive: true });

  // ------------------------------------------------------------------------------------------
  // keyboard: key repeat never repeats a lane change or a jump
  // ------------------------------------------------------------------------------------------
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump' };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.code;
    const g = KEYMAP[k];
    if (g && (cur === 'playing' || cur === 'countdown')) e.preventDefault();
    if (e.repeat) return;
    if (g) { act(g); return; }
    if (k === 'Enter' || k === 'NumpadEnter') {
      if (cur === 'menu') { e.preventDefault(); doStart(); }
      else if (cur === 'won' || cur === 'lost') { e.preventDefault(); doRestart(); }
      return;
    }
    if (k === 'Escape' || k === 'KeyP') {
      if (cur === 'playing') doPause(); else if (cur === 'paused') doResume();
    }
  });
  addEventListener('blur', releasePads);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releasePads(); });

  // ------------------------------------------------------------------------------------------
  // no zoom / scroll / long-press menus
  // ------------------------------------------------------------------------------------------
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  ctx.renderer?.domElement?.addEventListener('contextmenu', (e) => e.preventDefault());
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.target instanceof Element && e.target.type !== 'range') e.preventDefault(); }, { passive: false });
  window.addEventListener('touchstart', () => {
    if (!hasTouch && touchParam !== '0') { hasTouch = true; root.classList.add('has-touch'); el.menuHint.innerHTML = touchHint; }
  }, { once: true, passive: true });

  // ------------------------------------------------------------------------------------------
  // portrait overlay
  // ------------------------------------------------------------------------------------------
  let portrait = false;
  let trackW = 0;
  function onResize() {
    const p = innerHeight > innerWidth && (hasTouch || innerWidth <= 700);
    if (p !== portrait) {
      portrait = p;
      root.classList.toggle('is-portrait', p);
      if (p) releasePads();
    }
    trackW = el.progTrack.clientWidth;
    lastProgQ = -1;
  }
  addEventListener('resize', onResize);
  addEventListener('orientationchange', () => setTimeout(onResize, 150));

  // ------------------------------------------------------------------------------------------
  // per-frame
  // ------------------------------------------------------------------------------------------
  let clock = 0;
  function update(dt) {
    clock += dt;
    if (hintT >= 0 && !hasTouch) {
      if (cur === 'playing') hintT += dt;
      const on = hintT < 6;
      if (on !== el.kbd.classList.contains('on')) el.kbd.classList.toggle('on', on);
      if (!on) hintT = -1;
    }
    if (secT > 0 && cur !== 'paused') { secT -= dt; if (secT <= 0) el.secTag.classList.remove('on'); }
    if (fallT > 0 && cur !== 'paused') { fallT -= dt; if (fallT <= 0) setFall(false); }
  }

  // ------------------------------------------------------------------------------------------
  // HUD (DOM touched only when a value changed)
  // ------------------------------------------------------------------------------------------
  let lastLeft = -1, lastLowCls = null, lastCrit = null, lastHits = -1, lastProgQ = -1, lastNeedle = -999;
  function setHUD(h) {
    lastHud = h;
    if (h.state && h.state !== cur) applyState(h.state);
    if (h.result && h.result !== shownResult) {
      if (cur === 'won') showWin(h.result); else if (cur === 'lost') showFail(h.result);
    }
    if (!el.hud.classList.contains('on')) return;

    // pressure gauge: the needle climbs with the race clock into the red zone; time left under it
    const limit = h.timeLimit ?? TL;
    const rem = clamp(h.remaining ?? limit - (h.time ?? 0), 0, limit);
    const f = clamp(1 - rem / limit, 0, 1);
    // in the red zone the needle trembles (only while the clock runs)
    const tremble = rem < LOW_S && cur === 'playing' ? Math.sin(clock * 38) * (1.2 + (1 - rem / LOW_S) * 2.4) : 0;
    const ang = Math.round((-120 + f * 240 + tremble) * 4) / 4;
    if (ang !== lastNeedle) { lastNeedle = ang; el.needle.style.transform = `rotate(${ang}deg)`; }
    const sec = Math.ceil(rem - 1e-6);
    if (sec !== lastLeft) { lastLeft = sec; el.timeBig.textContent = fmtLeft(rem); }
    const low = rem < LOW_S;
    if (low !== lastLowCls) { lastLowCls = low; el.gauge.classList.toggle('low', low); }
    const crit = rem <= CRIT_S && rem > 0 && (cur === 'playing' || cur === 'paused');
    if (crit !== lastCrit) { lastCrit = crit; el.gauge.classList.toggle('crit', crit); }
    if (crit && !warned && cur === 'playing') { warned = true; toast(t('toastLast'), t('toastLastSub'), 'warn'); }

    // course progress: fill + runner marker
    const pq = Math.round(clamp(h.progress ?? 0, 0, 1) * 800);
    if (pq !== lastProgQ) {
      if (!trackW) trackW = el.progTrack.clientWidth;
      lastProgQ = pq;
      const p = pq / 800;
      el.progFill.style.transform = `scaleX(${p})`;
      el.man.style.transform = `translate3d(${(p * trackW).toFixed(1)}px,0,0)`;
    }

    // hits
    const hits = h.hits ?? 0;
    if (hits !== lastHits) { lastHits = hits; el.hits.textContent = String(hits); }
  }

  onResize();
  setTimeout(onResize, 300); // fonts / layout settle

  return { input, update, setHUD };
}
