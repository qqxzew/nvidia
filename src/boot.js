// Entry point: picks the level from ?level=N (full page reload switches levels).
//   default / ?level=2 → src/main.js (level 1 + level 2 + main menu)
//   ?level=3           → level 3 "Gangsteři ve Světovaru"
//   ?level=4           → level 4 "Varna" (standalone, not linked from the main menu yet)
//   ?level=5           → level 5 "Šílená stáčírna" (standalone, not linked from the main menu yet)
const level = new URLSearchParams(location.search).get('level');

if (level === '3') import('./levels/gangsters/main.js');
else if (level === '4') import('./level4/main.js');
else if (level === '5') import('./level5/main.js');
else import('./main.js');
