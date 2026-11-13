// Minimal event bus shared by all modules.
//
// Event catalogue (payloads):
//   'state'         { state: 'menu'|'countdown'|'playing'|'paused'|'won'|'lost', prev }
//   'countdown'     { n: 3|2|1|0 }
//   'impact'        { strength: 0..1, x, z, kind: 'wall'|'obstacle'|'tram'|'cart'|'pedestrian' }
//   'bump'          { strength: 0..1 }                       // cobbles, potholes, rails
//   'barrel:wobble' { index, looseness }                     // fired when a barrel starts wobbling
//   'barrel:lost'   { index, lost, remaining }               // a barrel fell off
//   'barrel:land'   { index, strength }                      // a fallen barrel hit the ground
//   'horn'          {}                                       // player honked
//   'zone'          { id: 'square'|'town'|'suburb'|'field'|'brewery' }
//   'finish'        { time, lost, stars, remaining }
//   'tram:bell'     { distance }                             // traffic -> audio
//   'train:whistle' { distance }                             // traffic -> audio
//   UI -> game:     'ui:start' 'ui:restart' 'ui:pause' 'ui:resume' 'ui:menu' 'horn'
//   'fail'          { reason: 'time'|'barrels' }

export function createEvents() {
  const map = new Map();
  return {
    on(name, fn) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(fn);
      return () => map.get(name)?.delete(fn);
    },
    emit(name, payload = {}) {
      const set = map.get(name);
      if (set) for (const fn of [...set]) fn(payload);
    },
  };
}
