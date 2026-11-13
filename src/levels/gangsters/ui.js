// Level 3 UI: menu, countdown, HUD (police timer, barrels, shells, score + floating popups), crosshair,
// touch reload button, pause, result screens, portrait overlay. Same look as level 1 (../../ui/ui.css),
// level-specific bits in ./ui.css. All strings live in ../../ui/i18n.js (keys prefixed g3).
//
// createUI3(ctx) -> { input: { pan, panY, look, lookY }, update(dt), setHUD(hud) }
// Desktop: FPS mouse-look with pointer lock (crosshair fixed at the centre, every shot at ndc 0,0).
// Touch: drag = look, short tap or the FIRE button = shoot at the centre.
// Emits:    ui:start, ui:restart, ui:pause, ui:resume, g3:shoot {ndcX, ndcY}, g3:reload,
//           audio:volume {value}, audio:mute {muted}
// Consumes: state, countdown, score, shot, dry, barrel:stolen, barrel:recovered, finish, fail
import '../../ui/ui.css';
import './ui.css';
import { t, barrels as barrelsText, fmtTime } from '../../ui/i18n.js';
import { ICON, stamp } from '../../ui/icons.js';
import { settings, saveSettings } from '../../ui/shared.js';
import { levelSwitch } from '../../ui/ui.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const DRAG_PX = 10;          // a press that moves farther than this looks around instead of shooting
const TAP_MS = 250;          // ...and a tap must be shorter than this
const MOUSE_SENS = 0.0022;   // rad per px of locked mouse movement
const MAX_DELTA = 250;       // ignore absurd movementX/Y spikes (Chrome reports one right after locking)
const LOOK_PER_WIDTH = 1.6;  // radians of turn for a drag across the full screen width
const MAX_POPUPS = 6;

// 12-gauge paper shell: red tube, brass head (HUD)
const SHELL = `<svg viewBox="0 0 14 32" aria-hidden="true"><path class="sh-tube" d="M2.5 1.5h9v21h-9z"/><path class="sh-line" d="M2.5 5.5h9"/><path class="sh-head" d="M1.5 22.5h11v8h-11z"/><path class="sh-rim" d="M1.5 27.5h11"/></svg>`;
// round shell-in-breech icon for the touch reload button
const RELOAD = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M38 24a14 14 0 1 1-4.1-9.9" fill="none" stroke="currentColor" stroke-width="4"/><path d="M40 6v12H28z" fill="currentColor"/><rect x="20" y="16" width="8" height="14" fill="currentColor"/><rect x="18.5" y="30" width="11" height="4" fill="currentColor" opacity=".7"/></svg>`;
// crosshair: ring + four ticks + dot (cream with a dark outline so it reads on moonlit and dark areas)
const CROSS = `<svg viewBox="0 0 48 48" aria-hidden="true"><g fill="none" stroke-linecap="square"><g stroke="#111a15" stroke-width="5"><circle cx="24" cy="24" r="11"/><path d="M24 3v8M24 37v8M3 24h8M37 24h8"/></g><g stroke="#efe4c6" stroke-width="2"><circle cx="24" cy="24" r="11"/><path d="M24 3v8M24 37v8M3 24h8M37 24h8"/></g></g><circle cx="24" cy="24" r="2.2" fill="#efe4c6" stroke="#111a15" stroke-width="1"/></svg>`;

export function createUI3(ctx) {
  const { events, config, THREE } = ctx;
  const GAME = config.game || {};
  const GUN = config.shotgun || {};
  const TOTAL = GAME.barrelCount ?? 10;
  const MAX_STOLEN = GAME.maxStolen ?? 3;
  const DURATION = GAME.duration ?? 90;
  const MAX_SHELLS = GUN.shells ?? 2;

  const host = document.getElementById('ui') || document.body;
  const params = new URLSearchParams(location.search);
  const touchParam = params.get('touch'); // debug: ?touch=1 forces touch controls, ?touch=0 hides them
  let hasTouch = touchParam === '1' || (touchParam !== '0' && (!!ctx.isMobile || 'ontouchstart' in window || navigator.maxTouchPoints > 0));
  let lastPtr = hasTouch ? 'touch' : 'mouse'; // pointer type of the latest press (decides pointer lock)
  const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  const input = { pan: 0, panY: 0, look: 0, lookY: 0 };

  // ------------------------------------------------------------------------------------------
  // DOM
  // ------------------------------------------------------------------------------------------
  const titleWords = t('g3title').split(' ');
  const titleLast = titleWords.pop();
  const barrelIcons = Array.from({ length: TOTAL }, () => `<span class="ok">${ICON.barrel}</span>`).join('');
  const shellIcons = Array.from({ length: MAX_SHELLS }, () => `<span class="full">${SHELL}</span>`).join('');
  const keyHint = t('g3hintKeys').split('  ·  ').map((x) => `<span class="nb">${x}</span>`).join('<span class="sep"> · </span>');

  const root = document.createElement('div');
  root.className = 'plz g3' + (hasTouch ? ' has-touch' : '');
  root.innerHTML = `
    <svg class="defs" width="0" height="0" aria-hidden="true"><defs>
      <linearGradient id="plz-oak" x1="0" x2="1"><stop offset="0" stop-color="#7a4a22"/><stop offset=".42" stop-color="#c98d4c"/><stop offset=".6" stop-color="#b77a3d"/><stop offset="1" stop-color="#6c401c"/></linearGradient>
      <linearGradient id="g3-brass" x1="0" x2="1"><stop offset="0" stop-color="#7d5a1e"/><stop offset=".45" stop-color="#d8b062"/><stop offset="1" stop-color="#6f4f19"/></linearGradient>
    </defs></svg>
    <div class="pops"></div>
    <div class="hud">
      <div class="hud-col hud-l">
        <div class="panel p-time"><div class="lbl">${t('g3timeLabel')}</div><div class="big">${fmtTime(DURATION)}</div></div>
        <div class="panel p-barrels"><div class="barrels" aria-label="${t('g3barrelsLabel')}">${barrelIcons}</div><div class="count"></div></div>
      </div>
      <div class="panel p-score"><div class="lbl">${t('g3scoreLabel')}</div><div class="big sc">0</div></div>
      <div class="hud-col hud-r">
        <button class="panel btn-pause" type="button" aria-label="${t('pause')}">${ICON.pause}</button>
        <div class="panel p-shells" aria-label="${t('g3shellsLabel')}">
          <div class="shells">${shellIcons}</div>
          <div class="rl-bar"><div class="rl-fill"></div></div>
          <div class="rl-txt"></div>
        </div>
      </div>
      <button class="g3-reload" type="button" aria-label="${t('g3reload')}">${RELOAD}<span>${t('g3reload')}</span></button>
      <button class="g3-fire" type="button" aria-label="${t('g3fire')}"><span>${t('g3fire')}</span></button>
      <div class="lock-hint"><div class="panel">${t('g3clickToAim')}</div></div>
      <div class="top-wrap toast-wrap"></div>
      <div class="cd"><div class="cd-n"></div></div>
      <div class="flash"></div>
    </div>
    <div class="cross">${CROSS}</div>
    <div class="panel kbd-hint">${keyHint}<span class="sep"> · </span><span class="nb">${t('g3hintKeys2')}</span></div>

    <div class="scr scr-menu">
      <div class="panel menu-panel">
        <div class="col center">
          <div class="fan">${ICON.fan}</div>
          <div class="title display">${titleWords.join(' ')} <em>${titleLast}</em></div>
          <div class="sub">${t('g3subtitle')}</div>
          <button class="btn go" type="button">${t('g3start')}</button>
          ${levelSwitch(3)}
        </div>
        <div class="col">
          <p class="mission">${t('g3mission', { time: fmtTime(DURATION), max: barrelsText(MAX_STOLEN) })}</p>
          <p class="hint">${hasTouch ? t('g3hintTouch') : keyHint}</p>
        </div>
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
      <div class="panel res-panel">
        <div class="stamp">${stamp(t('g3stampTop'), t('g3stampBottom'))}</div>
        <div class="head"><div class="note-kind">${t('g3noteKind')} · ${t('g3noteWhere')}</div><h2 class="display">${t('g3winTitle')}</h2><div class="line"></div></div>
        <div class="col">
          <div class="stats">
            <div class="stat"><span>${t('g3score')}</span><b class="r-score"></b></div>
            <div class="stat"><span>${t('g3stolen')}</span><b class="r-stolen"></b></div>
          </div>
          <button class="btn again" type="button">${t('g3again')}</button>
        </div>
        <div class="card"><h3 class="display">${t('g3historyTitle')}</h3><p>${t('g3history')}</p></div>
      </div>
    </div>

    <div class="scr scr-fail">
      <div class="panel res-panel">
        <div class="stamp">${stamp(t('g3stampTop'), t('g3stampBottom'), t('g3stampFail'))}</div>
        <div class="head"><div class="note-kind">${t('g3noteKind')} · ${t('g3noteWhere')}</div><h2 class="display f-title"></h2></div>
        <div class="col">
          <div class="stats">
            <div class="stat"><span>${t('g3score')}</span><b class="f-score"></b></div>
            <div class="stat"><span>${t('g3stolen')}</span><b class="f-stolen"></b></div>
          </div>
          <button class="btn retry" type="button">${t('g3tryAgain')}</button>
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
    hud: $('.hud'), kbd: $('.kbd-hint'), pops: $('.pops'), cross: $('.cross'),
    timeBig: $('.p-time .big'),
    barrelsPanel: $('.p-barrels'), barrelList: Array.from(root.querySelectorAll('.barrels > span')), count: $('.p-barrels .count'),
    score: $('.p-score'), scoreBig: $('.p-score .sc'),
    shells: $('.p-shells'), shellList: Array.from(root.querySelectorAll('.shells > span')), rlFill: $('.rl-fill'), rlTxt: $('.rl-txt'),
    pauseBtn: $('.btn-pause'), reloadBtn: $('.g3-reload'), fireBtn: $('.g3-fire'),
    toasts: $('.toast-wrap'), cdN: $('.cd-n'), flash: $('.flash'),
    menu: $('.scr-menu'), pause: $('.scr-pause'), win: $('.scr-win'), fail: $('.scr-fail'),
    vol: $('.vol'), volVal: $('.vol-val'), snd: $('.snd'), fs: $('.fs'),
  };

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
    root.classList.toggle('live', live);
    document.documentElement.classList.toggle('g3-aim', live);
    if (!live) releaseLock();
    syncLockHint();
    el.menu.classList.toggle('on', s === 'menu');
    el.pause.classList.toggle('on', s === 'paused');
    if (s !== 'won') el.win.classList.remove('on');
    if (s !== 'lost') el.fail.classList.remove('on');
    if (!live) releaseAll();
    if (s === 'playing') { if (hintT < 0) hintT = 0; }
    else if (s !== 'paused') { hintT = -1; el.kbd.classList.remove('on'); }
    if (s === 'countdown' || s === 'menu') { resetToasts(); resetPops(); }
    if (s === 'paused') syncSettingsUI();
    blurFocus();
  }
  el.menu.classList.add('on');
  events.on('state', (e) => applyState(e.state));

  // ------------------------------------------------------------------------------------------
  // countdown, toasts, flash, score popups
  // ------------------------------------------------------------------------------------------
  let cdAnim = null;
  events.on('countdown', ({ n }) => {
    const go = n <= 0;
    el.cdN.textContent = go ? t('g3go') : String(n);
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
  let flashAnim = null;
  function flash(strength = 0.8) {
    flashAnim?.cancel();
    flashAnim = el.flash.animate([{ opacity: strength }, { opacity: 0 }], { duration: 480, easing: 'ease-out' });
  }

  events.on('barrel:stolen', (e) => {
    if (cur !== 'playing') return;
    const stolen = e.stolen ?? 0;
    flash(0.75);
    try { navigator.vibrate?.(60); } catch (err) { /* unsupported */ }
    if (stolen > MAX_STOLEN) return; // that one ends the run
    toast(t('g3toastStolen'), stolen === MAX_STOLEN ? t('g3toastLastChance') : t('g3toastStolenCount', { stolen, max: MAX_STOLEN }));
  });
  events.on('barrel:recovered', () => { if (cur === 'playing') toast(t('g3toastRecovered')); });
  events.on('shot', (e) => {
    kickCross();
    if (e.hit === 'innocent' && cur === 'playing') { flash(0.9); toast(t('g3toastInnocent'), t('g3toastInnocentSub')); }
  });
  let shakeAnim = null;
  events.on('dry', () => {
    shakeAnim?.cancel();
    shakeAnim = el.shells.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }],
      { duration: 260, easing: 'ease-out' },
    );
    el.reloadBtn.classList.add('nudge');
  });

  // floating "+100" popups at the world position of the hit
  const v3 = THREE ? new THREE.Vector3() : null;
  function resetPops() { el.pops.textContent = ''; }
  events.on('score', (e) => {
    const delta = e.delta ?? 0;
    if (!delta || cur === 'menu') return;
    const neg = delta < 0;
    el.score.classList.remove('bump'); void el.score.offsetWidth; el.score.classList.add('bump');
    let px = innerWidth / 2, py = innerHeight * 0.42;
    if (v3 && ctx.camera && Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.z)) {
      v3.set(e.x, e.y, e.z).project(ctx.camera);
      if (v3.z > 1 || v3.z < -1) return; // behind the camera
      px = (v3.x * 0.5 + 0.5) * innerWidth;
      py = (-v3.y * 0.5 + 0.5) * innerHeight;
    }
    px = clamp(px, 40, innerWidth - 40);
    py = clamp(py, 60, innerHeight - 40);
    const d = document.createElement('div');
    d.className = 'pop' + (neg ? ' neg' : '');
    d.textContent = (neg ? '−' : '+') + Math.abs(Math.round(delta));
    d.style.left = px.toFixed(0) + 'px';
    d.style.top = py.toFixed(0) + 'px';
    d.addEventListener('animationend', () => d.remove());
    el.pops.appendChild(d);
    while (el.pops.children.length > MAX_POPUPS) el.pops.firstChild.remove();
  });

  // ------------------------------------------------------------------------------------------
  // result screens
  // ------------------------------------------------------------------------------------------
  const starEls = Array.from(root.querySelectorAll('.scr-win .stamp .star'));
  events.on('finish', (e) => {
    const stars = clamp(Math.round(e.stars ?? 1), 1, 3);
    starEls.forEach((s, i) => s.classList.toggle('got', i < stars));
    $('.scr-win .line').textContent = t(stars >= 3 ? 'g3winLine1' : stars === 2 ? 'g3winLine2' : 'g3winLine3');
    $('.r-score').textContent = String(Math.round(e.score ?? lastScore ?? 0));
    $('.r-stolen').textContent = `${e.stolen ?? 0} / ${TOTAL}`;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => { if (cur === 'won') el.win.classList.add('on'); }, 900);
  });
  events.on('fail', (e) => {
    const barrels = e.reason === 'barrels' || !e.reason;
    $('.f-title').textContent = t(barrels ? 'g3failBarrels' : 'g3failOther');
    $('.f-tip').textContent = t(barrels ? 'g3tipBarrels' : 'g3tipOther');
    $('.f-score').textContent = String(Math.round(e.score ?? lastScore ?? 0));
    $('.f-stolen').textContent = `${e.stolen ?? '?'} / ${TOTAL}`;
    clearTimeout(resultTimer);
    resultTimer = setTimeout(() => { if (cur === 'lost') el.fail.classList.add('on'); }, 900);
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
  const fsIfTouch = () => { if ((hasTouch || ctx.isMobile) && !isFs()) enterFullscreen(); };

  // ------------------------------------------------------------------------------------------
  // actions
  // ------------------------------------------------------------------------------------------
  // Start / Retry / Resume are user gestures: request the pointer lock right there (desktop mouse only)
  function doStart() { if (cur !== 'menu') return; fsIfTouch(); requestLock(); events.emit('ui:start'); }
  function doRestart() { if (cur === 'paused' || cur === 'won' || cur === 'lost') { fsIfTouch(); requestLock(); events.emit('ui:restart'); } }
  function doPause() { if (cur === 'playing' || cur === 'countdown') events.emit('ui:pause'); }
  function doResume() { if (cur === 'paused') { requestLock(); events.emit('ui:resume'); } }
  function doReload() { if (cur === 'playing') { el.reloadBtn.classList.remove('nudge'); events.emit('g3:reload'); } }
  // every shot goes through the screen centre (crosshair)
  function shoot() {
    if (cur !== 'playing' || portrait) return;
    events.emit('g3:shoot', { ndcX: 0, ndcY: 0 });
  }

  // ------------------------------------------------------------------------------------------
  // pointer lock (desktop FPS mouse-look)
  // ------------------------------------------------------------------------------------------
  const canvas = ctx.renderer && ctx.renderer.domElement;
  const plSupported = !!(canvas && canvas.requestPointerLock && 'pointerLockElement' in document);
  let plErrors = 0;      // consecutive failed requests; after 2 we fall back to drag-look
  let skipDeltas = 0;    // movement events to ignore right after locking
  let lockLostAt = -1e9; // Esc both releases the lock (-> pause) and may arrive as a keydown: don't resume on it
  const isLocked = () => plSupported && document.pointerLockElement === canvas;
  const useLock = () => plSupported && plErrors < 2 && lastPtr === 'mouse' && !portrait;
  function requestLock() {
    if (!useLock() || isLocked()) return;
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {}); // the pointerlockerror event handles the failure
    } catch (e) { plErrors++; }
  }
  function releaseLock() {
    try { if (isLocked()) document.exitPointerLock(); } catch (e) { /* ignore */ }
  }
  function syncLockHint() {
    root.classList.toggle('need-lock', cur === 'playing' && useLock() && !isLocked());
  }
  if (plSupported) {
    document.addEventListener('pointerlockchange', () => {
      const locked = isLocked();
      root.classList.toggle('locked', locked);
      if (locked) { plErrors = 0; skipDeltas = 2; presses.clear(); }
      else { lockLostAt = performance.now(); if (cur === 'playing') events.emit('ui:pause'); } // Esc / alt-tab released the mouse
      syncLockHint();
    });
    // Chrome refuses a re-lock for ~1 s after the user pressed Esc: not a reason to give up on pointer lock
    document.addEventListener('pointerlockerror', () => { if (performance.now() - lockLostAt > 1500) plErrors++; syncLockHint(); });
  }
  document.addEventListener('mousemove', (e) => {
    if (!isLocked() || !canLook()) return;
    const mx = e.movementX || 0, my = e.movementY || 0;
    if (skipDeltas > 0) { skipDeltas--; if (Math.abs(mx) + Math.abs(my) > 40) return; }
    if (Math.abs(mx) > MAX_DELTA || Math.abs(my) > MAX_DELTA) return; // Chrome spike
    input.look += mx * MOUSE_SENS;
    input.lookY -= my * MOUSE_SENS; // mouse up = look up
  });

  $('.scr-menu .go').addEventListener('click', doStart);
  $('.resume').addEventListener('click', doResume);
  $('.restart').addEventListener('click', doRestart);
  $('.again').addEventListener('click', doRestart);
  $('.retry').addEventListener('click', doRestart);
  el.pauseBtn.addEventListener('click', doPause);
  el.reloadBtn.addEventListener('pointerdown', (e) => {
    if (portrait) return;
    e.preventDefault();
    el.reloadBtn.classList.add('on');
    doReload();
  });
  const reloadUp = () => el.reloadBtn.classList.remove('on');
  el.reloadBtn.addEventListener('pointerup', reloadUp);
  el.reloadBtn.addEventListener('pointercancel', reloadUp);
  el.reloadBtn.addEventListener('pointerleave', reloadUp);
  el.fireBtn.addEventListener('pointerdown', (e) => {
    if (portrait) return;
    e.preventDefault();
    el.fireBtn.classList.add('on');
    shoot();
  });
  const fireUp = () => el.fireBtn.classList.remove('on');
  el.fireBtn.addEventListener('pointerup', fireUp);
  el.fireBtn.addEventListener('pointercancel', fireUp);
  el.fireBtn.addEventListener('pointerleave', fireUp);

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
  // pointer input on the whole window (the #ui layer is pointer-events: none, so presses on the
  // game view land on the canvas).
  //  - mouse + pointer lock: a press only acquires the lock; once locked, a press shoots (centre)
  //  - touch, or a mouse without pointer lock: drag > DRAG_PX = look (yaw + pitch), short tap = shoot
  // ------------------------------------------------------------------------------------------
  const presses = new Map(); // pointerId -> { x0, y0, x, y, t0, drag }
  const UI_SEL = 'button, a, input, select, .scr.on, .portrait, .kbd-hint';
  const startedOnUI = (e) => e.target instanceof Element && !!e.target.closest(UI_SEL);
  const canLook = () => !portrait && (cur === 'playing' || cur === 'countdown');
  const lookK = () => LOOK_PER_WIDTH / Math.max(1, innerWidth);

  // remember the kind of pointer for every press, also on buttons (Start decides on pointer lock)
  addEventListener('pointerdown', (e) => {
    const p = e.pointerType === 'mouse' ? 'mouse' : 'touch';
    if (p !== lastPtr) { lastPtr = p; syncLockHint(); }
  }, true);

  function onDown(e) {
    if (!canLook() || startedOnUI(e)) return;
    if (e.pointerType === 'mouse') {
      if (e.cancelable) e.preventDefault();
      if (isLocked()) { if (e.button === 0) shoot(); return; }
      if (useLock()) { if (cur === 'playing' || cur === 'countdown') requestLock(); return; } // this click only locks
    }
    presses.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), drag: false });
  }
  function onMove(e) {
    const p = presses.get(e.pointerId);
    if (!p) return;
    if (!canLook() || isLocked()) { presses.delete(e.pointerId); return; }
    if (!p.drag) {
      const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
      if (dx * dx + dy * dy <= DRAG_PX * DRAG_PX) return;
      p.drag = true;
      p.x = p.x0; p.y = p.y0; // count the movement from the press point
    }
    const k = lookK();
    input.look += (e.clientX - p.x) * k;   // drag right = turn right
    input.lookY -= (e.clientY - p.y) * k;  // drag up = look up
    p.x = e.clientX; p.y = e.clientY;
  }
  function onUp(e) {
    const p = presses.get(e.pointerId);
    if (!p) return;
    presses.delete(e.pointerId);
    if (!p.drag && performance.now() - p.t0 < TAP_MS) shoot(); // short tap = shoot at the crosshair
  }
  function onCancel(e) { presses.delete(e.pointerId); }

  addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onCancel);
  addEventListener('contextmenu', (e) => { if (cur === 'playing' || cur === 'countdown' || (e.target instanceof Element && root.contains(e.target))) e.preventDefault(); });

  let crossAnim = null;
  function kickCross() {
    const svg = el.cross.firstElementChild;
    if (!svg || !svg.animate) return;
    crossAnim?.cancel();
    crossAnim = svg.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  function releaseAll() {
    presses.clear();
    reloadUp();
    for (const k in keys) keys[k] = false;
    input.pan = 0; input.panY = 0;
    fireUp();
  }

  // ------------------------------------------------------------------------------------------
  // keyboard
  // ------------------------------------------------------------------------------------------
  const keys = {};
  const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyR']);
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.code;
    const live = cur === 'playing' || cur === 'countdown';
    if (live && GAME_KEYS.has(k)) e.preventDefault();
    keys[k] = true;
    if (e.repeat) return;
    if (k === 'Enter' || k === 'NumpadEnter') {
      if (cur === 'menu') { e.preventDefault(); doStart(); }
      else if (cur === 'won' || cur === 'lost') { e.preventDefault(); doRestart(); }
    } else if (k === 'Escape' || k === 'KeyP') {
      if (cur === 'playing' || cur === 'countdown') doPause();
      else if (cur === 'paused' && !(k === 'Escape' && performance.now() - lockLostAt < 400)) doResume();
    } else if (k === 'KeyR') doReload();
    else if (k === 'Space' && cur === 'playing') shoot();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // ------------------------------------------------------------------------------------------
  // no zoom / scroll / long-press menus
  // ------------------------------------------------------------------------------------------
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (e.target instanceof Element && e.target.type === 'range') return;
    if (cur === 'playing' || cur === 'countdown' || (e.target instanceof Element && root.contains(e.target))) e.preventDefault();
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
    if (!canLook()) { input.pan = 0; input.panY = 0; input.look = 0; input.lookY = 0; return; }
    input.pan = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    input.panY = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
  }

  // cached HUD values: DOM is only touched when something changed
  let lastSec = -1, lastBarrels = -1, lastStolen = -1, lastTotal = -1, lastScore = null;
  let lastShells = -1, lastRlQ = -2, lastRlTxt = null;
  function setHUD(h) {
    if (h.state && h.state !== cur) applyState(h.state);
    if (!el.hud.classList.contains('on')) return;

    const duration = h.duration ?? DURATION;
    const left = Math.max(0, h.remaining ?? duration - (h.time || 0));
    const sec = Math.ceil(left - 1e-6);
    if (sec !== lastSec) { lastSec = sec; el.timeBig.textContent = fmtTime(sec); }

    const total = h.total ?? TOTAL;
    const stolen = h.stolen ?? 0;
    const onShelf = h.barrels ?? total - stolen;
    if (onShelf !== lastBarrels || stolen !== lastStolen || total !== lastTotal) {
      lastBarrels = onShelf; lastStolen = stolen; lastTotal = total;
      const max = h.maxStolen ?? MAX_STOLEN;
      const kept = total - stolen; // on the shelf + in a gangster's hands
      for (let i = 0; i < el.barrelList.length; i++) el.barrelList[i].className = i < onShelf ? 'ok' : i < kept ? 'held' : 'lost';
      el.count.textContent = t('g3stolenCount', { stolen, max });
      el.barrelsPanel.classList.toggle('hot', stolen >= max);
      el.barrelsPanel.classList.toggle('warn', kept > onShelf);
    }

    const score = Math.round(h.score || 0);
    if (score !== lastScore) { lastScore = score; el.scoreBig.textContent = String(score); el.score.classList.toggle('neg', score < 0); }

    const maxShells = h.maxShells ?? MAX_SHELLS;
    const shells = clamp(h.shells ?? maxShells, 0, maxShells);
    if (shells !== lastShells) {
      lastShells = shells;
      for (let i = 0; i < el.shellList.length; i++) el.shellList[i].className = i < shells ? 'full' : 'spent';
      el.shells.classList.toggle('empty', shells === 0);
      el.reloadBtn.classList.toggle('want', shells < maxShells);
      if (shells > 0) el.reloadBtn.classList.remove('nudge');
    }
    const rl = h.reloading ?? -1;
    const rlQ = rl < 0 ? -1 : Math.round(clamp(rl, 0, 1) * 100);
    if (rlQ !== lastRlQ) {
      lastRlQ = rlQ;
      el.shells.classList.toggle('reloading', rlQ >= 0);
      el.rlFill.style.transform = `scaleX(${rlQ < 0 ? 0 : rlQ / 100})`;
    }
    const txt = rlQ >= 0 ? t('g3reloading') : shells === 0 ? t(hasTouch ? 'g3reload' : 'g3reloadKey') : '';
    if (txt !== lastRlTxt) { lastRlTxt = txt; el.rlTxt.textContent = txt; }
  }

  onResize();
  setTimeout(onResize, 300);

  return { input, update, setHUD };
}
