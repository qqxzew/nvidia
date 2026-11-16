// Main menu over the Světovar film (cameraRig.titleShots), styled like a 1920s Světovar advertisement:
// a red label with heavy grotesque lettering (as on the brewery wagons) and solid printed plates as buttons. Language = three flags (direct switch), settings = quiet
// icons in the bottom-right corner.
// Views: main · levels (+ the 3D site map, src/ui/map.js) · about · prologue.  Emits: ui:menu (open level 1 briefing), ui:level {id} (open level 2), audio:volume, audio:mute.
// Level 3 opens as its own page (?level=3).
import './title.css';
import { t, getLang, setLang, LANGS, langName, fmtTime } from './i18n.js';
import { ICON } from './icons.js';
import { settings, saveSettings } from './shared.js';
import { progress, LEVELS } from '../core/progress.js';
import { createMap, LEVEL_COLORS } from './map.js';

const FLAGS = {
  cs: '<svg viewBox="0 0 30 20" aria-hidden="true"><path fill="#fff" d="M0 0h30v10H0z"/><path fill="#d7141a" d="M0 10h30v10H0z"/><path fill="#11457e" d="M0 0l15 10L0 20z"/></svg>',
  en: '<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><clipPath id="plz-uk"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath><path fill="#012169" d="M0 0h60v30H0z"/><path d="M0 0l60 30M60 0L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30M60 0L0 30" clip-path="url(#plz-uk)" stroke="#c8102e" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#c8102e" stroke-width="6"/></svg>',
  de: '<svg viewBox="0 0 30 20" aria-hidden="true"><path fill="#000" d="M0 0h30v7H0z"/><path fill="#dd0000" d="M0 7h30v6H0z"/><path fill="#ffce00" d="M0 13h30v7H0z"/></svg>',
};
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const STAR = '<svg viewBox="0 0 48 46" aria-hidden="true"><path d="M24 3l5.8 13.3 14.4 1.3-10.9 9.5 3.2 14.1L24 33.8 11.5 41.2l3.2-14.1L3.8 17.6l14.4-1.3z"/></svg>';

// The team (photos: public/team/*.png, transparent rounded corners). `links` are shown under the role.
// Bundled through Vite (hashed files in dist/assets) so they never depend on public/ file permissions of the host.
const PHOTOS = import.meta.glob('../assets/team/*.png', { eager: true, query: '?url', import: 'default' });
const photoUrl = (f) => PHOTOS['../assets/team/' + f];
const TEAM = [
  { name: 'Tomáš Krůta', photo: 'tomas-kruta.png', role: 'teamRole1', links: [{ label: 'tomaskruta.dev', url: 'https://tomaskruta.dev' }] },
  { name: 'Andrii Fedorov', photo: 'andrii-fedorov.png', role: 'teamRole2', links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/fedorov-andrii' }] },
  { name: 'Oleksii Logosha', photo: 'oleksii-logosha.png', role: 'teamRole3', links: [] },
  { name: 'Adam Hojer', photo: 'adam-hojer.png', role: 'teamRole4', links: [
    { label: 'adamhojer.cz', url: 'https://adamhojer.cz' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/adam-hojer/' },
  ] },
];
const memberHtml = (m) => `<li class="tt-member">
  <img src="${photoUrl(m.photo)}" alt="${m.name}" loading="lazy" decoding="async" draggable="false">
  <b>${m.name}</b><span class="role">${t(m.role)}</span>
  ${m.links.length ? `<span class="links">${m.links.map((l) => `<a href="${l.url}" target="_blank" rel="noopener noreferrer">${l.label}</a>`).join('')}</span>` : ''}
</li>`;

export function createTitle(ctx) {
  const { events } = ctx;
  const host = document.getElementById('ui') || document.body;
  const lang = getLang();
  const canFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

  const root = document.createElement('div');
  root.className = 'plz plz-title';
  root.innerHTML = `
    <div class="tt-flags" role="radiogroup" aria-label="${t('language')}">
      ${LANGS.map((l) => `<button type="button" role="radio" data-lang="${l}" aria-checked="${l === lang}" aria-label="${langName(l)}" class="${l === lang ? 'cur' : ''}">${FLAGS[l]}</button>`).join('')}
    </div>

    <div class="tt-col">
      <h1 class="tt-logo"><span class="small">${t('titleSmall')}</span><span class="big">${t('titleBig')}</span></h1>

      <nav class="tt-view v-main">
        <button class="tt-item primary tt-new" type="button">${t('newGame')}</button>
        <button class="tt-item tt-cont" type="button"><span>${t('continueGame')}</span><span class="meta"></span></button>
        <div class="tt-row">
          <button class="tt-item tt-levels" type="button">${t('levels')}</button>
          <button class="tt-item tt-about" type="button">${t('about')}</button>
        </div>
      </nav>

      <div class="tt-view v-levels">
        <div class="tt-panel">
          <div class="tt-head">${t('levels')}</div>
          <p class="tt-note tt-locked-note">${t('levelsLocked')}</p>
          <ol class="tt-list"></ol>
        </div>
        <button class="tt-back" type="button">${t('back')}</button>
      </div>

      <div class="tt-view v-about">
        <div class="tt-panel">
          <div class="tt-head">${t('about')}</div>
          <p class="tt-text">${t('aboutText')}</p>
          <p class="tt-made">${t('aboutMeta')}</p>
          <div class="tt-head tt-team-head">${t('teamTitle')}</div>
          <ul class="tt-team">${TEAM.map(memberHtml).join('')}</ul>
          <img class="tt-group" src="${photoUrl('group.png')}" alt="" draggable="false">
        </div>
        <button class="tt-back" type="button">${t('back')}</button>
      </div>

      <div class="tt-view v-prologue">
        <div class="tt-panel">
          <div class="tt-head">${t('prologue')}</div>
          <blockquote class="tt-quote"><p>${t('prologue1')}</p><p>${t('prologue2')}</p><footer>${t('prologueBy')}</footer></blockquote>
        </div>
        <button class="tt-item primary tt-go" type="button">${t('prologueGo')}</button>
      </div>
    </div>

    <div class="tt-bar">
      <button class="tt-ico tt-snd" type="button"></button>
      <input class="tt-vol" type="range" min="0" max="100" step="5" aria-label="${t('volume')}">
      <button class="tt-ico tt-fs" type="button" aria-label="${t('fullscreenOn')}">${ICON.fullscreen}</button>
    </div>`;
  host.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const views = { main: $('.v-main'), levels: $('.v-levels'), about: $('.v-about'), prologue: $('.v-prologue') };
  function show(name) {
    for (const k in views) views[k].classList.toggle('on', k === name);
    root.classList.toggle('sub', name !== 'main');
    root.classList.toggle('about', name === 'about'); // the About card is wider: it holds the team
    // Levels view = the 3D map of the site: the camera leaves the film and flies over the brewery
    if (name === 'levels') map.open(); else map.close();
  }

  // --- story / levels ------------------------------------------------------------------------
  function render() {
    const cont = $('.tt-cont');
    cont.disabled = !progress.started;
    cont.querySelector('.meta').textContent = progress.started ? t('continueMeta', { n: progress.nextLevel() }) : '';

    $('.tt-locked-note').style.display = progress.started ? 'none' : '';
    $('.tt-list').innerHTML = LEVELS.map((l) => {
      const open = progress.isUnlocked(l.id) && l.playable;
      const best = progress.best(l.id);
      let right = '';
      if (open && best) right = `<span class="stars">${[0, 1, 2].map((i) => `<i class="${i < best.stars ? 'got' : ''}">${STAR}</i>`).join('')}</span><span class="meta">${t('best', { time: fmtTime(best.time) })}</span>`;
      else if (!open) right = `<span class="lock">${LOCK}</span>`;
      const desc = !l.playable || progress.isUnlocked(l.id) ? t(`${l.key}Desc`) : t('locked');
      return `<li><button type="button" class="tt-level${open ? '' : ' off'}${map.highlighted === l.id ? ' hi' : ''}" data-level="${l.id}" style="--lv:${LEVEL_COLORS[l.id] || 'var(--red)'}" ${open ? '' : 'disabled'}>
        <span class="num">${l.id}</span>
        <span class="txt"><b>${t(`${l.key}Name`)}</b><span>${desc}</span></span>
        <span class="right">${right}</span></button></li>`;
    }).join('');
  }

  // level 1 -> its briefing screen (ui:menu); level 2 -> main.js opens the cellar scene;
  // other levels are separate pages: ?level=N (src/boot.js)
  function openLevel(id = 1) {
    if (id === 1) { events.emit('ui:menu'); return; }
    if (id === 2) { events.emit('ui:level', { id: 2 }); return; }
    root.classList.add('leaving');
    setTimeout(() => { location.href = `${location.pathname}?level=${id}`; }, 180);
  }
  $('.tt-new').addEventListener('click', () => { progress.newGame(); render(); show('prologue'); });
  $('.tt-cont').addEventListener('click', () => { if (progress.started) openLevel(progress.nextLevel()); });
  $('.tt-levels').addEventListener('click', () => { render(); show('levels'); });
  $('.tt-about').addEventListener('click', () => show('about'));
  root.querySelectorAll('.tt-back').forEach((b) => b.addEventListener('click', () => show('main')));
  $('.tt-go').addEventListener('click', () => openLevel(1));
  // list ↔ map: hover / focus highlights the level on the map; on touch the first tap highlights, the second opens
  let listPointer = 'mouse';
  const list = $('.tt-list');
  list.addEventListener('pointerdown', (e) => { listPointer = e.pointerType || 'mouse'; });
  list.addEventListener('keydown', () => { listPointer = 'key'; });
  list.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.tt-level');
    if (b && e.pointerType === 'mouse') map.highlight(Number(b.dataset.level));
  });
  list.addEventListener('focusin', (e) => {
    const b = e.target.closest('.tt-level');
    if (b) map.highlight(Number(b.dataset.level));
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.tt-level');
    if (!b || b.disabled) return;
    const id = Number(b.dataset.level);
    if ((listPointer === 'touch' || listPointer === 'pen') && map.highlighted !== id) { map.highlight(id); return; }
    openLevel(id);
  });

  const map = createMap(ctx, {
    host: root,
    leftEdge: () => $('.tt-col').getBoundingClientRect().right,
    onOpen: (id) => openLevel(id),
    onHighlight: (id) => root.querySelectorAll('.tt-level').forEach((b) => b.classList.toggle('hi', Number(b.dataset.level) === id)),
  });

  // --- language: tap a flag ------------------------------------------------------------------
  root.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    const l = b.dataset.lang;
    if (l === getLang()) return;
    setLang(l);
    root.classList.add('leaving');
    setTimeout(() => location.reload(), 180); // every static string is rebuilt from scratch
  }));

  // --- settings (bottom-right) ------------------------------------------------------------
  const vol = $('.tt-vol'), snd = $('.tt-snd'), fs = $('.tt-fs');
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function sync() {
    const v = Math.round(settings.volume * 100);
    vol.value = String(v);
    vol.style.setProperty('--v', v + '%');
    snd.innerHTML = settings.muted ? ICON.soundOff : ICON.soundOn;
    snd.setAttribute('aria-label', t(settings.muted ? 'soundOff' : 'soundOn'));
    snd.classList.toggle('muted', settings.muted);
    fs.setAttribute('aria-label', t(isFs() ? 'fullscreenOff' : 'fullscreenOn'));
  }
  vol.addEventListener('input', () => {
    settings.volume = Math.min(1, Math.max(0, Number(vol.value) / 100));
    if (settings.volume > 0 && settings.muted) { settings.muted = false; events.emit('audio:mute', { muted: false }); }
    saveSettings(); sync();
    events.emit('audio:volume', { value: settings.volume });
  });
  snd.addEventListener('click', () => {
    settings.muted = !settings.muted;
    saveSettings(); sync();
    events.emit('audio:mute', { muted: settings.muted });
  });
  if (canFullscreen) {
    fs.addEventListener('click', () => {
      try {
        if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
        else {
          const d = document.documentElement;
          const p = (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d);
          p?.then?.(() => { try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch { /* unsupported */ } }, () => {});
        }
      } catch { /* unsupported */ }
    });
    document.addEventListener('fullscreenchange', sync);
  } else fs.style.display = 'none';

  function setShot() { /* shot captions removed by design */ }

  // --- visibility ------------------------------------------------------------------------------
  events.on('state', (e) => {
    const on = e.state === 'title';
    if (!on || !root.classList.contains('on')) map.reset(); // leaving / re-entering the menu: no fly-back
    if (on && !root.classList.contains('on')) {
      render(); sync(); show('main');
      root.classList.add('intro');
      setTimeout(() => root.classList.remove('intro'), 1800);
    }
    root.classList.toggle('on', on);
  });

  render(); sync(); show('main');
  return { show, render, setShot, map };
}
