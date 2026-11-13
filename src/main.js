// Entry point / level router.
//   default            → level 1 "Jízda do Světovaru" (the main game flow)
//   ?level=4           → level 4 "Varna" (standalone, not linked from the main flow yet)
//   ?level=5           → level 5 "Šílená stáčírna" (standalone, not linked from the main flow yet)
// Each level module builds its own renderer, scene and UI when imported.
const level = new URLSearchParams(location.search).get('level');

if (level === '4') await import('./level4/main.js');
else if (level === '5') await import('./level5/main.js');
else await import('./level1.js');
