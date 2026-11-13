// Entry point: picks the level from ?level=N (full page reload switches levels).
const level = new URLSearchParams(location.search).get('level');

if (level === '3') import('./levels/gangsters/main.js');
else import('./main.js');
