// Entry point: picks the level from ?level=N (full page reload switches levels).
//   default / ?level=2 → src/main.js (level 1 + level 2 + main menu)
//   ?level=3           → level 3 "Gangsteři ve Světovaru"
//   ?level=4           → level 4 "Varna" (linked from the main menu)
//   ?level=5           → level 5 "Šílená stáčírna" (linked from the main menu)
// One loader function per level on purpose: written as an if/else chain, the production minifier merged the
// four import() calls into one ternary and kept only level 1's CSS preload list, so levels 3–5 ran unstyled.
const level = new URLSearchParams(location.search).get('level');

const LOADERS = {
  3: () => import('./levels/gangsters/main.js'),
  4: () => import('./level4/main.js'),
  5: () => import('./level5/main.js'),
};
(LOADERS[level] || (() => import('./main.js')))();
