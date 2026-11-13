// Story progress, persisted in localStorage. Levels unlock as the player reaches them in story mode.
const KEY = 'plzen1926.progress.v1';

export const LEVELS = [
  { id: 1, key: 'level1', playable: true },
  { id: 2, key: 'level2', playable: false }, // in preparation
];

function load() {
  try { return { started: false, reached: 0, best: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { started: false, reached: 0, best: {} }; }
}

let data = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ } }

export const progress = {
  get started() { return data.started; },
  /** highest level id the player has reached in story mode (0 = none) */
  get reached() { return data.reached; },
  best(id) { return data.best[id] || null; },
  isUnlocked(id) { return data.started && id <= Math.max(1, data.reached); },
  /** the level "Pokračovat" should open */
  nextLevel() {
    const next = LEVELS.find((l) => l.playable && l.id > data.reached) || LEVELS.filter((l) => l.playable).pop();
    return next.id;
  },
  newGame() { data = { started: true, reached: 1, best: data.best }; save(); },
  complete(id, { stars = 1, time = 0 } = {}) {
    const b = data.best[id];
    if (!b || stars > b.stars || (stars === b.stars && time < b.time)) data.best[id] = { stars, time: Math.round(time * 10) / 10 };
    data.started = true;
    data.reached = Math.max(data.reached, id + 1);
    save();
  },
};
