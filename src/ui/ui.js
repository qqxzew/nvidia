// UI: start screen, countdown, HUD, touch controls, pause menu, result screens, portrait overlay.
// Plain DOM + CSS rendered into #ui. See ui.css for the look. All strings live in i18n.js.
//
// Public API (used by main.js):  createUI(ctx) -> { input, update(dt), setHUD(hud) }
// Emits:    ui:start, ui:restart, ui:pause, ui:resume, horn, audio:volume {value}, audio:mute {muted}
// Consumes: state, countdown, barrel:lost, impact, finish, fail
import './ui.css';
import { t, barrels as barrelsText, fmtTime } from './i18n.js';
import { ICON, dialFace, NEEDLE, stamp } from './icons.js';
import { input, settings, saveSettings } from './shared.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createUI(ctx) {
  const { events, config } = ctx;
  const GAME = config.game;
  const host = document.getElementById('ui') || document.body;
  const params = new URLSearchParams(location.search);
  const touchParam = params.get('touch'); // debug: ?touch=1 forces touch controls, ?touch=0 hides them

  let hasTouch = touchParam === '1' || (touchParam !== '0' && (!!ctx.isMobile || 'ontouchstart' in window || navigator.maxTouchPoints > 0));
  const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  // ------------------------------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------------------------------
  const titleWords = t('title').split(' ');
  const titleLast = titleWords.pop();
  const barrelIcons = Array.from({ length: GAME.barrelCount }, () => `<span class="ok">${ICON.barrel}</span>`).join('');

  const keyHint = t('hintKeys').split('  ·  ').map((x) => `<span class="nb">${x}</span>`).join('<span class="sep"> · </span>');

  const root = document.createElement('div');
  root.className = 'plz' + (hasTouch ? ' has-touch' : '');
  root.innerHTML = `
    <svg class="defs" width="0" height="0" aria-hidden="true"><defs>
      <linearGradient id="plz-oak" x1="0" x2="1"><stop offset="0" stop-color="#7a4a22"/><stop offset=".42" stop-color="#c98d4c"/><stop offset=".6" stop-color="#b77a3d"/><stop offset="1" stop-color="#6c401c"/></linearGradient>
    </defs></svg>
    <div class="hud">
      <div class="hud-col hud-l">
        <div class="panel p-time"><div class="lbl">${t('timeLabel')}</div><div class="big">${fmtTime(GAME.timeLimit)}</div></div>
        <div class="panel p-barrels"><div class="barrels" aria-label="${t('barrelsLabel')}">${barrelIcons}</div><div class="count"></div></div>
      </div>
      <div class="panel p-route">
        <div class="route-labels"><span>${t('routeFrom')}</span><span>${t('routeTo')}</span></div>
        <div class="route-track"><div class="route-bar"><div class="route-fill"></div></div><div class="route-truck">${ICON.truck}</div></div>
      </div>
      <div class="hud-col hud-r">
        <button class="panel btn-pause" type="button" aria-label="${t('pause')}">${ICON.pause}</button>
        <div class="dial">${dialFace()}<div class="needle">${NEEDLE}</div><div class="dial-read"><span class="spd">0</span><span class="u">${t('kmh')}</span></div></div>
      </div>
      <div class="top-wrap warn-wrap"><div class="banner">${t('warning')}</div></div>
      <div class="top-wrap toast-wrap"></div>
      <div class="cd"><div class="cd-n"></div></div>
      <div class="flash"></div>
    </div>

    <div class="ctl">
      <div class="grp grp-l">
        <div class="pad pad-left" aria-label="${t('left')}">${ICON.chevL}</div>
        <div class="pad pad-right" aria-label="${t('right')}">${ICON.chevR}</div>
      </div>
      <button class="horn" type="button" aria-label="${t('horn')}">${ICON.horn}</button>
      <div class="grp grp-r">
        <div class="pad pad-brake">${ICON.pedalDown}<span>${t('brake')}</span></div>
        <div class="pad pad-gas">${ICON.pedalUp}<span>${t('gas')}</span></div>
      </div>
    </div>
    <div class="panel kbd-hint">${keyHint}</div>

    <div class="scr scr-menu">
      <div class="panel menu-panel">
        <div class="col center">
          <div class="fan">${ICON.fan}</div>
          <div class="title display">${titleWords.join(' ')} <em>${titleLast}</em></div>
          <div class="sub">${t('subtitle')}</div>
          <button class="btn go" type="button">${t('start')}</button>
          <button class="btn alt sm to-title" type="button">${t('menu')}</button>
        </div>
        <div class="col">
          <p class="mission">${t('mission', { n: barrelsText(GAME.barrelCount), time: fmtTime(GAME.timeLimit), max: barrelsText(GAME.maxLostBarrels) })}</p>
          <p class="hint">${hasTouch ? t('hintTouch') : keyHint}</p>
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
        <div class="head"><div class="note-kind">${t('noteKind')} · ${t('noteRoute')}</div><h2 class="display">${t('winTitle')}</h2><div class="line"></div></div>
        <div class="col">
          <div class="stats">
            <div class="stat"><span>${t('time')}</span><b class="r-time"></b></div>
            <div class="stat"><span>${t('delivered')}</span><b class="r-barrels"></b></div>
          </div>
          <div class="btn-row"><button class="btn again" type="button">${t('again')}</button><button class="btn alt to-title" type="button">${t('menu')}</button></div>
        </div>
        <div class="card"><h3 class="display">${t('historyTitle')}</h3><p>${t('history')}</p></div>
      </div>
    </div>

    <div class="scr scr-fail">
      <div class="panel res-panel">
        <div class="stamp">${stamp(t('stampTop'), t('stampBottom'), t('stampFail'))}</div>
        <div class="head"><div class="note-kind">${t('noteKind')} · ${t('noteRoute')}</div><h2 class="display f-title"></h2></div>
        <div class="col">
          <div class="stats">
            <div class="stat"><span>${t('time')}</span><b class="f-time"></b></div>
            <div class="stat"><span>${t('lostLabel')}</span><b class="f-lost"></b></div>
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
    hud: $('.hud'), ctl: $('.ctl'), kbd: $('.kbd-hint'),
    time: $('.p-time'), timeBig: $('.p-time .big'),
    barrelsPanel: $('.p-barrels'), barrelList: Array.from(root.querySelectorAll('.barrels > span')), count: $('.p-barrels .count'),
    routeTrack: $('.route-track'), routeFill: $('.route-fill'), truck: $('.route-truck'),
    pauseBtn: $('.btn-pause'), spd: $('.spd'),
    banner: $('.banner'), toasts: $('.toast-wrap'), cdN: $('.cd-n'), flash: $('.flash'),
    menu: $('.scr-menu'), pause: $('.scr-pause'), win: $('.scr-win'), fail: $('.scr-fail'),
    vol: $('.vol'), volVal: $('.vol-val'), snd: $('.snd'), fs: $('.fs'),
  };
  el.needle = $('.dial .needle');

  // ------------------------------------------------------------------------------------------
  // game state -> visible screens
  // ------------------------------------------------------------------------------------------
  let cur = 'menu';
  let resultTimer = 0;
  let hintT = -1;

  function blurFocus() { try { document.activeElement && document.activeElement !== document.body && document.activeElement.blur(); } catch (e) { /* ignore */ } }

  function applyState(s) {
    if (s === cur) return;
    cur = s;
    clearTimeout(resultTimer);
    const live = s === 'countdown' || s === 'playing';
    el.hud.classList.toggle('on', live || s === 'paused');
    el.ctl.classList.toggle('on', live);
    el.menu.classList.toggle('on', s === 'menu');
    el.pause.classList.toggle('on', s === 'paused');
    if (s !== 'won') el.win.classList.remove('on');
    if (s !== 'lost') el.fail.classList.remove('on');
    if (!live) releaseAll();
    if (s === 'playing') hintT = 0;
    else if (s !== 'paused') { hintT = -1; el.kbd.classList.remove('on'); }
    if (s === 'countdown' || s === 'menu') resetToasts();
    if (s === 'paused') syncSettingsUI();
    blurFocus();
  }
  // initial

  events.on('state', (e) => applyState(e.state));

  // ------------------------------------------------------------------------------------------
  // countdown, toasts, flash
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
  events.on('barrel:lost', (e) => {
    if (cur !== 'playing') return;
    const max = GAME.maxLostBarrels;
    if (e.lost > max) return; // that one ends the run
    toast(t('toastLost'), e.lost === max ? t('toastLastChance') : t('toastLostCount', { lost: e.lost, max }));
  });

  let flashAnim = null;
  events.on('impact', (e) => {
    const s = e.strength || 0;
    if (s <= 0.3) return;
    flashAnim?.cancel();
    flashAnim = el.flash.animate([{ opacity: clamp(0.35 + s * 0.65, 0, 1) }, { opacity: 0 }], { duration: 420, easing: 'ease-out' });
    try { navigator.vibrate?.(40); } catch (err) { /* unsupported */ }
  });

  // ------------------------------------------------------------------------------------------
  // result screens
  // ------------------------------------------------------------------------------------------
  const starEls = Array.from(root.querySelectorAll('.scr-win .stamp .star'));
  events.on('finish', (e) => {
    const stars = clamp(Math.round(e.stars ?? 1), 1, 3);
    const remaining = e.remaining ?? GAME.barrelCount - (e.lost || 0);
    starEls.forEach((s, i) => s.classList.toggle('got', i < stars));
    $('.scr-win .line').textContent = t(stars >= 3 ? 'winLine1' : stars === 2 ? 'winLine2' : 'winLine3');
    $('.r-time').textContent = fmtTime(e.time);
    $('.r-barrels').textContent = `${remaining} / ${GAME.barrelCount}`;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => { if (cur === 'won') el.win.classList.add('on'); }, 700);
  });
  events.on('fail', (e) => {
    $('.f-title').textContent = t(e.reason === 'time' ? 'failTime' : 'failBarrels');
    $('.f-tip').textContent = t(e.reason === 'time' ? 'tipTime' : 'tipBarrels');
    $('.f-time').textContent = fmtTime(e.time ?? 0);
    $('.f-lost').textContent = `${e.lost ?? '?'}`;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => { if (cur === 'lost') el.fail.classList.add('on'); }, 700);
  });

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
      if (fn) {
        const p = fn.call(d);
        if (p && p.then) p.then(lockLandscape, () => {});
      }
      lockLandscape();
    } catch (e) { /* unsupported */ }
  }
  function toggleFullscreen() {
    try {
      if (isFs()) { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {}); }
      else enterFullscreen();
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------------------------------
  // actions
  // ------------------------------------------------------------------------------------------
  function doStart() {
    if (cur !== 'menu') return;
    // desktop: do not force fullscreen on the player (toggle is in the pause menu)
    if (hasTouch || ctx.isMobile) enterFullscreen();
    events.emit('ui:start');
  }
  function doRestart() { if (cur === 'paused' || cur === 'won' || cur === 'lost') { enterFullscreen_ifTouch(); events.emit('ui:restart'); } }
  function enterFullscreen_ifTouch() { if ((hasTouch || ctx.isMobile) && !isFs()) enterFullscreen(); }
  function doPause() { if (cur === 'playing') events.emit('ui:pause'); }
  function doResume() { if (cur === 'paused') events.emit('ui:resume'); }
  function doHorn() { if (cur === 'playing' || cur === 'countdown') events.emit('horn'); }

  $('.scr-menu .go').addEventListener('click', doStart);
  $('.resume').addEventListener('click', doResume);
  $('.restart').addEventListener('click', doRestart);
  $('.again').addEventListener('click', doRestart);
  $('.retry').addEventListener('click', doRestart);
  el.pauseBtn.addEventListener('click', doPause);
  root.querySelectorAll('.to-title').forEach((b) => b.addEventListener('click', () => events.emit('ui:title')));

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
  // touch controls (Pointer Events, multi-touch). Each group captures the pointer and re-evaluates
  // which pad is under the finger on every move, so sliding from left to right switches without lifting.
  // ------------------------------------------------------------------------------------------
  const pad = {
    left: $('.pad-left'), right: $('.pad-right'), brake: $('.pad-brake'), gas: $('.pad-gas'),
  };
  const pressed = { left: false, right: false, brake: false, gas: false };
  const padState = { steer: 0, throttle: 0, brake: 0 };

  function renderPads() {
    for (const k in pressed) pad[k].classList.toggle('on', pressed[k]);
    padState.steer = (pressed.right ? 1 : 0) - (pressed.left ? 1 : 0);
    padState.throttle = pressed.gas ? 1 : 0;
    padState.brake = pressed.brake ? 1 : 0;
  }

  function makeGroup(groupEl, pick) {
    const active = new Map(); // pointerId -> pad key
    function recompute() {
      const next = new Set(active.values());
      let changed = false;
      for (const k of Object.keys(pressed)) {
        // only keys that belong to this group are touched
        if (groupKeys.has(k) && pressed[k] !== next.has(k)) { pressed[k] = next.has(k); changed = true; }
      }
      if (changed) renderPads();
    }
    const groupKeys = new Set();
    function onDown(e) {
      if (portrait || (cur !== 'playing' && cur !== 'countdown')) return;
      e.preventDefault();
      try { groupEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      active.set(e.pointerId, pick(e.clientX, e.clientY));
      recompute();
    }
    function onMove(e) {
      if (!active.has(e.pointerId)) return;
      e.preventDefault();
      const k = pick(e.clientX, e.clientY);
      if (active.get(e.pointerId) !== k) { active.set(e.pointerId, k); recompute(); }
    }
    function onUp(e) {
      if (!active.has(e.pointerId)) return;
      active.delete(e.pointerId);
      recompute();
    }
    function onLeave(e) {
      // with pointer capture this does not fire during a drag; this is the fallback when capture failed
      let captured = false;
      try { captured = groupEl.hasPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (!captured) onUp(e);
    }
    groupEl.addEventListener('pointerdown', onDown);
    groupEl.addEventListener('pointermove', onMove);
    groupEl.addEventListener('pointerup', onUp);
    groupEl.addEventListener('pointercancel', onUp);
    groupEl.addEventListener('lostpointercapture', onUp);
    groupEl.addEventListener('pointerleave', onLeave);
    return { clear() { active.clear(); recompute(); }, keys: groupKeys };
  }

  const steerGrp = makeGroup($('.grp-l'), (x) => {
    const r = $('.grp-l').getBoundingClientRect();
    return x < r.left + r.width / 2 ? 'left' : 'right';
  });
  steerGrp.keys.add('left'); steerGrp.keys.add('right');
  const pedalGrp = makeGroup($('.grp-r'), (x) => {
    const g = pad.gas.getBoundingClientRect();
    return x < g.left - 6 ? 'brake' : 'gas';
  });
  pedalGrp.keys.add('brake'); pedalGrp.keys.add('gas');

  // horn: its own button
  const hornBtn = $('.horn');
  hornBtn.addEventListener('pointerdown', (e) => {
    if (portrait) return;
    e.preventDefault();
    try { hornBtn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    hornBtn.classList.add('on');
    doHorn();
  });
  const hornUp = () => hornBtn.classList.remove('on');
  hornBtn.addEventListener('pointerup', hornUp);
  hornBtn.addEventListener('pointercancel', hornUp);
  hornBtn.addEventListener('lostpointercapture', hornUp);

  function releaseAll() {
    steerGrp.clear(); pedalGrp.clear();
    hornUp();
    for (const k in keys) keys[k] = false;
  }

  // ------------------------------------------------------------------------------------------
  // keyboard (desktop fallback)
  // ------------------------------------------------------------------------------------------
  const keys = {};
  const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.code;
    const live = cur === 'playing' || cur === 'countdown';
    if (live && GAME_KEYS.has(k)) e.preventDefault();
    keys[k] = true;
    if (e.repeat) return;
    if (k === 'Enter') {
      if (cur === 'menu') { e.preventDefault(); doStart(); }
      else if (cur === 'won' || cur === 'lost') { e.preventDefault(); doRestart(); }
    } else if (k === 'Escape' || k === 'KeyP') {
      if (cur === 'playing') doPause(); else if (cur === 'paused') doResume();
    } else if (k === 'KeyH') doHorn();
    else if (k === 'Space' && !live) { /* let buttons handle space natively */ }
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // ------------------------------------------------------------------------------------------
  // no zoom / scroll / long-press menus
  // ------------------------------------------------------------------------------------------
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.target instanceof Element && root.contains(e.target) && e.target.type !== 'range') e.preventDefault(); }, { passive: false });
  // a touch event on a device that did not look like one: reveal the controls
  window.addEventListener('touchstart', () => {
    if (!hasTouch && touchParam !== '0') { hasTouch = true; root.classList.add('has-touch'); }
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
      if (p) releaseAll();
    }
    trackW = el.routeTrack.clientWidth;
    lastProgQ = -1;
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
    if (portrait || (cur !== 'playing' && cur !== 'countdown')) {
      input.steer = 0; input.throttle = 0; input.brake = 0;
      return;
    }
    const ks = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    input.steer = clamp(padState.steer + ks, -1, 1);
    input.throttle = padState.throttle || keys.ArrowUp || keys.KeyW ? 1 : 0;
    input.brake = padState.brake || keys.ArrowDown || keys.KeyS || keys.Space ? 1 : 0;
  }

  // cached HUD values: DOM is only touched when something changed
  let lastSec = -1, lastLow = null, lastLost = -1, lastTotal = -1, lastWarn = null, lastSpeed = -1, lastProgQ = -1, lastBanner = null;
  function setHUD(h) {
    if (h.state && h.state !== cur) applyState(h.state);
    if (!el.hud.classList.contains('on')) return;

    const limit = h.timeLimit ?? GAME.timeLimit;
    const left = Math.max(0, limit - h.time);
    const sec = Math.ceil(left - 1e-6);
    if (sec !== lastSec) { lastSec = sec; el.timeBig.textContent = fmtTime(sec); }
    const low = left < 15;
    if (low !== lastLow) { lastLow = low; el.time.classList.toggle('low', low); }

    const total = h.total ?? GAME.barrelCount;
    const lost = h.lost ?? 0;
    if (lost !== lastLost || total !== lastTotal) {
      lastLost = lost; lastTotal = total;
      const max = h.maxLost ?? GAME.maxLostBarrels;
      for (let i = 0; i < el.barrelList.length; i++) el.barrelList[i].className = i >= total - lost ? 'lost' : 'ok';
      el.count.textContent = t('lostCount', { lost, max });
      el.barrelsPanel.classList.toggle('hot', lost >= max);
    }

    const warn = !!h.warning && cur === 'playing';
    if (warn !== lastWarn) {
      lastWarn = warn;
      el.barrelsPanel.classList.toggle('warn', warn);
    }
    if (warn !== lastBanner) { lastBanner = warn; el.banner.classList.toggle('on', warn); }

    const spd = Math.round(h.speedKmh || 0);
    if (spd !== lastSpeed) {
      lastSpeed = spd;
      el.spd.textContent = spd;
      el.needle.style.transform = `rotate(${-120 + clamp(spd / 60, 0, 1) * 240}deg)`;
    }

    const pq = Math.round(clamp(h.progress || 0, 0, 1) * 600);
    if (pq !== lastProgQ) {
      if (!trackW) trackW = el.routeTrack.clientWidth;
      lastProgQ = pq;
      const p = pq / 600;
      el.routeFill.style.transform = `scaleX(${p})`;
      el.truck.style.transform = `translate3d(${(p * (trackW - 30)).toFixed(1)}px,0,0)`;
    }
  }

  onResize();
  setTimeout(onResize, 300); // fonts / layout settle

  return { input, update, setHUD };
}
