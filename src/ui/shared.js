// State shared between the UI and the audio module (both are created by main.js).
//  - input    : the live control values (steer -1..1, throttle 0..1, brake 0..1). ui.js owns/writes them,
//               audio.js reads input.throttle to make the engine rev.
//  - settings : persisted user settings. ui.js changes them, audio.js applies them.
//               Changes are also announced as events 'audio:volume' {value} and 'audio:mute' {muted}.

const KEY = 'plzen1926.settings.v1';

export const input = { steer: 0, throttle: 0, brake: 0 };

export const settings = { volume: 0.8, muted: false };

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (typeof o.volume === 'number') settings.volume = Math.min(1, Math.max(0, o.volume));
    if (typeof o.muted === 'boolean') settings.muted = o.muted;
  } catch (e) { /* storage blocked or corrupt: keep defaults */ }
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
}

loadSettings();
