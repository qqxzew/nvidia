// Level 2 UI ("Válení sudů ve sklepě"): briefing, countdown, HUD, floating analog stick, pause, result screens.
// Same visual language as level 1 (src/ui/ui.css is reused: enamel plates, paper sheets, stamp); only the
// level 2 specifics live in ui2.css. Own root element in #ui, hidden completely in state 'off'.
//
// createUI2(ctx2) -> { input: {x, y}, update(dt), setHUD(hud) }
//   input.x / input.y: -1..1, screen space, y = up on screen (forward). Stick or WASD/arrows.
// Emits on ctx2.events: ui:start, ui:restart, ui:pause, ui:resume, ui:title, audio:volume, audio:mute
// Consumes: state, countdown, barrel:delivered, rat:bite, finish, fail
import '../ui/ui.css';
import './ui2.css';
import { t, barrels as barrelsText, fmtTime } from '../ui/i18n.js';
import { ICON, stamp } from '../ui/icons.js';
import { settings, saveSettings } from '../ui/shared.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const RAT = `<svg viewBox="0 0 32 20" aria-hidden="true"><path class="rat-body" d="M2.500 14.500C2.500 10.500 6.500 7.500 12.500 7.500c3 0 5.500.8 7.500 2l9.500 2.500c1 .3 1.300 1.300.7 2L27 15.500c-1 1.200-2.600 2-4.500 2H6c-2 0-3.500-1.200-3.500-3z"/><circle class="rat-ear" cx="17.500" cy="7.500" r="3"/><path class="rat-tail" d="M2.800 14c-1.500-.2-2.300-2-1.600-4"/><circle cx="25" cy="12.600" r="1" class="rat-eye"/></svg>`;
const ARROW = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5l15 21H29v16H19V26H9z" fill="currentColor"/></svg>`;

export function createUI2(ctx2) {
  const { events } = ctx2;
  const CFG = ctx2.config || {};
  const LIMIT = CFG.timeLimit ?? 240;
  const N_BARRELS = CFG.barrels ?? CFG.barrelCount ?? 4;
  const MAX_BITES = CFG.maxBites ?? 3;

  const host = document.getElementById('ui') || document.body;
  const params = new URLSearchParams(location.search);
  const touchParam = params.get('touch');
  let hasTouch = touchParam === '1' || (touchParam !== '0' && (!!ctx2.isMobile || 'ontouchstart' in window || navigator.maxTouchPoints > 0));
  const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  const input = { x: 0, y: 0 };

  // ------------------------------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------------------------------
  const keyHint = t('l2HintKeys').split('  ·  ').map((x) => `<span class="nb">${x}</span>`).join('<span class="sep"> · </span>');
  const barrelIcons = Array.from({ length: N_BARRELS }, () => `<span class="empty">${ICON.barrel}</span>`).join('');
  const ratIcons = Array.from({ length: MAX_BITES }, () => `<span class="ok">${RAT}</span>`).join('');
  const titleWords = t('l2Title').split(' ');

  const root = document.createElement('div');
  root.className = 'plz plz2 off' + (hasTouch ? ' has-touch' : '');
  root.innerHTML = `
    <svg class="defs" width="0" height="0" aria-hidden="true"><defs>
      <linearGradient id="plz-oak" x1="0" x2="1"><stop offset="0" stop-color="#7a4a22"/><stop offset=".42" stop-color="#c98d4c"/><stop offset=".6" stop-color="#b77a3d"/><stop offset="1" stop-color="#6c401c"/></linearGradient>
    </defs></svg>

    <div class="hud">
      <div class="hud-col hud-l">
        <div class="panel p-time"><div class="lbl">${t('l2TimeLabel')}</div><div class="big">${fmtTime(LIMIT)}</div></div>
        <div class="panel p-l2">
          <div class="l2-barrels" aria-label="${t('l2BarrelsLabel')}">${barrelIcons}</div>
          <div class="l2-bites" aria-label="${t('l2BitesLabel')}">${ratIcons}</div>
        </div>
      </div>
      <div class="panel l2-guide" aria-label="${t('l2Guide')}"><div class="l2-arrow">${ARROW}</div></div>
      <div class="hud-col hud-r">
        <button class="panel btn-pause" type="button" aria-label="${t('pause')}">${ICON.pause}</button>
      </div>
      <div class="top-wrap l2-toast-wrap"></div>
      <div class="cd"><div class="cd-n"></div></div>
      <div class="flash"></div>
    </div>

    <div class="l2-ctl">
      <div class="l2-zone"></div>
      <div class="l2-ghost"><div class="l2-ring"></div><div class="l2-knob"></div></div>
      <div class="l2-stick"><div class="l2-ring"></div><div class="l2-knob"></div></div>
    </div>
    <div class="panel kbd-hint">${keyHint}</div>

    <div class="scr scr-brief">
      <div class="panel menu-panel brief-panel">
        <div class="col center">
          <div class="fan">${ICON.fan}</div>
          <div class="kicker">${t('l2Kicker')}</div>
          <div class="title display">${titleWords.slice(0, -1).join(' ')} <em>${titleWords[titleWords.length - 1]}</em></div>
          <div class="sub">${t('l2Sub')}</div>
          <button class="btn go" type="button">${t('l2Start')}</button>
          <button class="btn alt sm to-title" type="button">${t('menu')}</button>
        </div>
        <div class="col">
          <p class="story">${t('l2Story')}</p>
          <p class="mission">${t('l2Mission', { n: barrelsText(N_BARRELS), time: fmtTime(LIMIT), max: MAX_BITES })}</p>
          <p class="hint">${hasTouch ? t('l2HintTouch') : keyHint}</p>
        </div>
      </div>
    </div>

    <div class="scr scr-pause">
      <div class="panel pause-panel">
        <div class="head"><h2 class="display">${t('paused')}</h2></div>
        <div class="col">
          <button class="btn resume" type="button">${t('resume')}</button>
          <button class="btn alt restart" type="button">${t('restart')}</button>
          <button class="btn alt to-title" type="button">${t('menu')}</button>
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
      <div class="panel res-panel">
        <div class="stamp">${stamp(t('stampTop'), t('stampBottom'))}</div>
        <div class="head"><div class="note-kind">${t('noteKind')} · ${t('l2NoteRoute')}</div><h2 class="display">${t('l2WinTitle')}</h2><div class="line"></div></div>
        <div class="col">
          <div class="stats">
            <div class="stat"><span>${t('time')}</span><b class="r-time"></b></div>
            <div class="stat"><span>${t('l2Delivered')}</span><b class="r-barrels"></b></div>
            <div class="stat"><span>${t('l2Bites')}</span><b class="r-bites"></b></div>
          </div>
          <div class="btn-row"><button class="btn again" type="button">${t('l2Again')}</button><button class="btn alt to-title" type="button">${t('menu')}</button></div>
        </div>
        <div class="card"><h3 class="display">${t('l2HistoryTitle')}</h3><p>${t('l2History')}</p></div>
      </div>
    </div>

    <div class="scr scr-fail">
      <div class="panel res-panel">
        <div class="stamp">${stamp(t('stampTop'), t('stampBottom'), t('stampFail'))}</div>
        <div class="head"><div class="note-kind">${t('noteKind')} · ${t('l2NoteRoute')}</div><h2 class="display f-title"></h2></div>
        <div class="col">
          <div class="stats">
            <div class="stat"><span>${t('time')}</span><b class="f-time"></b></div>
            <div class="stat"><span>${t('l2Delivered')}</span><b class="f-barrels"></b></div>
            <div class="stat"><span>${t('l2Bites')}</span><b class="f-bites"></b></div>
          </div>
          <div class="btn-row"><button class="btn retry" type="button">${t('tryAgain')}</button><button class="btn alt to-title" type="button">${t('menu')}</button></div>
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
    hud: $('.hud'), ctl: $('.l2-ctl'), kbd: $('.kbd-hint'),
    time: $('.p-time'), timeBig: $('.p-time .big'),
    barrelList: Array.from(root.querySelectorAll('.l2-barrels > span')),
    ratList: Array.from(root.querySelectorAll('.l2-bites > span')),
    guide: $('.l2-guide'), arrow: $('.l2-arrow'),
    pauseBtn: $('.btn-pause'), toasts: $('.l2-toast-wrap'), cdN: $('.cd-n'), flash: $('.flash'),
    brief: $('.scr-brief'), pause: $('.scr-pause'), win: $('.scr-win'), fail: $('.scr-fail'),
    vol: $('.vol'), volVal: $('.vol-val'), snd: $('.snd'), fs: $('.fs'),
    zone: $('.l2-zone'), stick: $('.l2-stick'), ghost: $('.l2-ghost'),
  };
  el.knob = el.stick.querySelector('.l2-knob');
  el.ghostKnob = el.ghost.querySelector('.l2-knob');

  // ------------------------------------------------------------------------------------------
  // state -> visible screens
  // ------------------------------------------------------------------------------------------
  let cur = 'off';
  let resultTimer = 0;
  let hintT = -1;
  let stickUsed = false;

  function blurFocus() { try { document.activeElement && document.activeElement !== document.body && document.activeElement.blur(); } catch (e) { /* ignore */ } }

  function applyState(s) {
    if (s === cur) return;
    cur = s;
    clearTimeout(resultTimer);
    const live = s === 'countdown' || s === 'playing';
    root.classList.toggle('off', s === 'off');
    el.hud.classList.toggle('on', live || s === 'paused');
    el.ctl.classList.toggle('on', live);
    el.brief.classList.toggle('on', s === 'brief');
    el.pause.classList.toggle('on', s === 'paused');
    if (s !== 'won') el.win.classList.remove('on');
    if (s !== 'lost') el.fail.classList.remove('on');
    if (!live) releaseAll();
    if (s === 'playing') hintT = 0;
    else if (s !== 'paused') { hintT = -1; el.kbd.classList.remove('on'); }
    if (s === 'countdown' || s === 'brief' || s === 'off') el.toasts.textContent = '';
    if (s === 'brief' || s === 'off') stickUsed = false;
    el.ghost.classList.toggle('on', live && hasTouch && !stickUsed);
    if (s === 'paused') syncSettingsUI();
    if (s === 'countdown') { resetHud(); }
    blurFocus();
  }
  events.on('state', (e) => applyState(e.state));

  // ------------------------------------------------------------------------------------------
  // HUD (cached; DOM touched only on change)
  // ------------------------------------------------------------------------------------------
  let lastSec = -1, lastLow = null, lastDel = -1, lastBites = -1, lastGuide = undefined;
  function resetHud() { lastSec = -1; lastDel = -1; lastBites = -1; lastLow = null; }

  function setHUD(h) {
    if (h.state && h.state !== cur) applyState(h.state);
    if (!el.hud.classList.contains('on')) return;

    const limit = h.timeLimit ?? LIMIT;
    const left = Math.max(0, limit - (h.time || 0));
    const sec = Math.ceil(left - 1e-6);
    if (sec !== lastSec) { lastSec = sec; el.timeBig.textContent = fmtTime(sec); }
    const low = left < 20;
    if (low !== lastLow) { lastLow = low; el.time.classList.toggle('low', low); }

    const del = h.delivered ?? 0;
    const total = h.total ?? N_BARRELS;
    if (del !== lastDel) {
      lastDel = del;
      const grew = el.barrelList.length && del > 0;
      for (let i = 0; i < el.barrelList.length; i++) {
        const full = i < del;
        const was = el.barrelList[i].classList.contains('full');
        el.barrelList[i].className = full ? 'full' : 'empty';
        if (full && !was && grew && cur === 'playing') { el.barrelList[i].classList.add('pop'); }
      }
    }
    void total;

    const bites = h.bites ?? 0;
    const maxB = h.maxBites ?? MAX_BITES;
    if (bites !== lastBites) {
      lastBites = bites;
      for (let i = 0; i < el.ratList.length; i++) el.ratList[i].className = i < bites ? 'bit' : 'ok';
      el.guide.parentNode.querySelector('.p-l2').classList.toggle('hot', bites >= maxB - 1 && bites > 0);
    }

    const g = typeof h.guide === 'number' && isFinite(h.guide) ? h.guide : null;
    if (g !== lastGuide) {
      if ((g === null) !== (lastGuide === null || lastGuide === undefined)) el.guide.classList.toggle('on', g !== null);
      lastGuide = g;
    }
    if (g !== null) el.arrow.style.transform = `rotate(${(g * 180 / Math.PI).toFixed(1)}deg)`;
  }

  // ------------------------------------------------------------------------------------------
  // countdown, toasts, flash
  // ------------------------------------------------------------------------------------------
  let cdAnim = null;
  events.on('countdown', ({ n }) => {
    const go = n <= 0;
    el.cdN.textContent = go ? t('l2Go') : String(n);
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

  function toast(title, sub) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.innerHTML = `<b></b>${sub ? '<i></i>' : ''}`;
    d.firstChild.textContent = title;
    if (sub) d.lastChild.textContent = sub;
    d.addEventListener('animationend', () => d.remove());
    el.toasts.appendChild(d);
    while (el.toasts.children.length > 1) el.toasts.firstChild.remove();
  }
  events.on('barrel:delivered', (e) => {
    if (cur !== 'playing' && cur !== 'won') return;
    const n = e.delivered ?? 0, total = e.total ?? N_BARRELS;
    if (n >= total) return; // the finish screen follows
    toast(t('l2ToastDelivered'), t('l2ToastDeliveredSub', { n, total }));
  });
  let flashAnim = null;
  events.on('rat:bite', (e) => {
    if (cur !== 'playing') return;
    const max = e.maxBites ?? MAX_BITES;
    const n = e.bites ?? 0;
    if (n < max) toast(t('l2ToastBite'), n >= max - 1 ? t('l2ToastLast') : t('l2ToastBiteSub', { n, max }));
    flashAnim?.cancel();
    flashAnim = el.flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
    try { navigator.vibrate?.([40, 30, 40]); } catch (err) { /* unsupported */ }
  });

  // ------------------------------------------------------------------------------------------
  // result screens
  // ------------------------------------------------------------------------------------------
  const starEls = Array.from(root.querySelectorAll('.scr-win .stamp .star'));
  events.on('finish', (e) => {
    const stars = clamp(Math.round(e.stars ?? 1), 1, 3);
    starEls.forEach((s, i) => s.classList.toggle('got', i < stars));
    $('.scr-win .line').textContent = t(stars >= 3 ? 'l2WinLine1' : stars === 2 ? 'l2WinLine2' : 'l2WinLine3');
    $('.r-time').textContent = fmtTime(e.time ?? 0);
    $('.r-barrels').textContent = `${e.delivered ?? N_BARRELS} / ${N_BARRELS}`;
    $('.r-bites').textContent = `${e.bites ?? 0} / ${MAX_BITES}`;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => { if (cur === 'won') el.win.classList.add('on'); }, 700);
  });
  events.on('fail', (e) => {
    const rats = e.reason === 'rats';
    $('.f-title').textContent = t(rats ? 'l2FailRats' : 'l2FailTime');
    $('.f-tip').textContent = t(rats ? 'l2TipRats' : 'l2TipTime');
    $('.f-time').textContent = fmtTime(e.time ?? 0);
    $('.f-barrels').textContent = `${e.delivered ?? 0} / ${N_BARRELS}`;
    $('.f-bites').textContent = `${e.bites ?? 0} / ${MAX_BITES}`;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => { if (cur === 'lost') el.fail.classList.add('on'); }, 700);
  });

  // ------------------------------------------------------------------------------------------
  // fullscreen / orientation
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
      if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
      else enterFullscreen();
    } catch (e) { /* ignore */ }
  }
  const touchy = () => hasTouch || ctx2.isMobile;

  // ------------------------------------------------------------------------------------------
  // actions
  // ------------------------------------------------------------------------------------------
  function doStart() { if (cur !== 'brief') return; if (touchy()) enterFullscreen(); events.emit('ui:start'); }
  function doRestart() {
    if (cur === 'paused' || cur === 'won' || cur === 'lost') { if (touchy() && !isFs()) enterFullscreen(); events.emit('ui:restart'); }
  }
  function doPause() { if (cur === 'playing') events.emit('ui:pause'); }
  function doResume() { if (cur === 'paused') events.emit('ui:resume'); }

  $('.scr-brief .go').addEventListener('click', doStart);
  $('.resume').addEventListener('click', doResume);
  $('.restart').addEventListener('click', doRestart);
  $('.again').addEventListener('click', doRestart);
  $('.retry').addEventListener('click', doRestart);
  el.pauseBtn.addEventListener('click', doPause);
  root.querySelectorAll('.to-title').forEach((b) => b.addEventListener('click', () => events.emit('ui:title')));

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
    el.fs.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', syncSettingsUI);
    document.addEventListener('webkitfullscreenchange', syncSettingsUI);
  } else el.fs.style.display = 'none';
  syncSettingsUI();

  // ------------------------------------------------------------------------------------------
  // floating analog stick (Pointer Events). Appears where the thumb lands inside the left ~55% of the
  // screen; the knob is clamped to the ring. Only one pointer drives it; other fingers are ignored.
  // ------------------------------------------------------------------------------------------
  const stick = { id: null, bx: 0, by: 0, R: 56, x: 0, y: 0 };
  const DEAD = 0.14;

  function stickRadius() { return clamp(Math.round(innerHeight * 0.15), 44, 68); }

  function stickRelease() {
    if (stick.id !== null) { try { el.zone.releasePointerCapture(stick.id); } catch (e) { /* ignore */ } }
    stick.id = null; stick.x = 0; stick.y = 0;
    el.stick.classList.remove('on');
    el.knob.style.transform = 'translate3d(0,0,0)';
  }
  function stickMove(cx, cy) {
    let dx = cx - stick.bx, dy = cy - stick.by;
    const len = Math.hypot(dx, dy);
    if (len > stick.R) { dx *= stick.R / len; dy *= stick.R / len; }
    el.knob.style.transform = `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0)`;
    const m = Math.min(1, len / stick.R);
    if (m < DEAD) { stick.x = 0; stick.y = 0; return; }
    const k = (m - DEAD) / (1 - DEAD);
    stick.x = (dx / Math.min(len, stick.R)) * k * (m > 0 ? 1 : 0);
    stick.y = -(dy / Math.min(len, stick.R)) * k;
  }
  el.zone.addEventListener('pointerdown', (e) => {
    if (portrait || (cur !== 'playing' && cur !== 'countdown') || stick.id !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    stick.id = e.pointerId;
    try { el.zone.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    stick.R = stickRadius();
    const rect = root.getBoundingClientRect();
    const m = stick.R + 12;
    stick.bx = clamp(e.clientX - rect.left, m, Math.max(m, rect.width - m));
    stick.by = clamp(e.clientY - rect.top, m, Math.max(m, rect.height - m));
    el.stick.style.setProperty('--R', stick.R + 'px');
    el.stick.style.transform = `translate3d(${stick.bx}px,${stick.by}px,0)`;
    el.stick.classList.add('on');
    if (!stickUsed) { stickUsed = true; el.ghost.classList.remove('on'); }
    // the knob starts under the thumb (relative to the clamped base)
    stickMove(e.clientX - rect.left, e.clientY - rect.top);
  });
  el.zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stick.id) return;
    e.preventDefault();
    const rect = root.getBoundingClientRect();
    stickMove(e.clientX - rect.left, e.clientY - rect.top);
  });
  const upHandler = (e) => { if (e.pointerId === stick.id) stickRelease(); };
  el.zone.addEventListener('pointerup', upHandler);
  el.zone.addEventListener('pointercancel', upHandler);
  el.zone.addEventListener('lostpointercapture', upHandler);

  function releaseAll() {
    stickRelease();
    for (const k in keys) keys[k] = false;
    input.x = 0; input.y = 0;
  }

  // ------------------------------------------------------------------------------------------
  // keyboard
  // ------------------------------------------------------------------------------------------
  const keys = {};
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
  const onKeyDown = (e) => {
    if (cur === 'off') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.code;
    const live = cur === 'playing' || cur === 'countdown';
    if (live && GAME_KEYS.has(k)) e.preventDefault();
    keys[k] = true;
    if (e.repeat) return;
    if (k === 'Enter') {
      if (cur === 'brief') { e.preventDefault(); doStart(); }
      else if (cur === 'won' || cur === 'lost') { e.preventDefault(); doRestart(); }
    } else if (k === 'Escape' || k === 'KeyP') {
      if (cur === 'playing') doPause(); else if (cur === 'paused') doResume();
    }
  };
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // ------------------------------------------------------------------------------------------
  // no zoom / scroll / long-press menus
  // ------------------------------------------------------------------------------------------
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => { if (cur !== 'off') e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (cur !== 'off' && e.target instanceof Element && root.contains(e.target) && e.target.type !== 'range') e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchstart', () => {
    if (!hasTouch && touchParam !== '0') { hasTouch = true; root.classList.add('has-touch'); }
  }, { once: true, passive: true });

  // ------------------------------------------------------------------------------------------
  // portrait overlay
  // ------------------------------------------------------------------------------------------
  let portrait = false;
  function onResize() {
    const p = innerHeight > innerWidth && (hasTouch || innerWidth <= 700);
    if (p !== portrait) {
      portrait = p;
      root.classList.toggle('is-portrait', p);
      if (p) releaseAll();
    }
  }
  addEventListener('resize', onResize);
  addEventListener('orientationchange', () => setTimeout(onResize, 150));

  // ------------------------------------------------------------------------------------------
  // per-frame
  // ------------------------------------------------------------------------------------------
  function update(dt) {
    if (hintT >= 0 && !hasTouch) {
      hintT += dt;
      const on = hintT < 8;
      if (on !== el.kbd.classList.contains('on')) el.kbd.classList.toggle('on', on);
      if (!on) hintT = -1;
    }
    if (portrait || (cur !== 'playing' && cur !== 'countdown')) { input.x = 0; input.y = 0; return; }
    if (stick.x !== 0 || stick.y !== 0) { input.x = stick.x; input.y = stick.y; return; }
    let kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    let ky = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
    if (kx && ky) { kx *= Math.SQRT1_2; ky *= Math.SQRT1_2; }
    input.x = kx; input.y = ky;
  }

  onResize();
  setTimeout(onResize, 300);

  const api = { input, update, setHUD };
  try { window.__ui2 = Object.assign({ cur: () => cur, applyState, toast, root }, api); } catch (e) { /* ignore */ }
  return api;
}
