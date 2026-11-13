# Backlog — level 1

## From the user's own test drive (2026-11-13)
- [x] Pedestrians and the horse cart don't move smoothly: they jerk / step.
      Likely cause (lead): `route.frameAt(s)` / `pointAt` snap to the 1 m samples instead of interpolating,
      so slow movers (horse 2.5 m/s, walkers ~1.4 m/s) jump in 1 m steps. FIXED: route.frameAt now interpolates;
      measured per-frame steps: cart max/mean 1.06, 35 walkers max/mean <= 1.14.
- [ ] Road shape: "ideally the road is not straight, it should bend in an arc to the right". Not urgent — clarify which stretch.

## Open from integration
- [ ] Test on a real mid-range phone (fps, touch feel). Only checked in desktop Chromium at 844×390.
- [ ] Listen to and tune the audio (procedural; levels never heard).
- [ ] Fact-check the history card (Světovar 1913–1933, today TechTower) — `src/ui/i18n.js`, key `history`.

# Backlog — level 2 "Válení sudů ve sklepě"
- [ ] Test on a real phone: fps (15 draw calls / 62k tris on q=low), touch stick feel, cellar build time
      (~0.5 s desktop, guessed 1.5–2 s on a mid-range phone; a "Scházíme do sklepa…" plate covers it).
- [ ] Listen to the procedural cellar audio (never heard by ear).
- [ ] Tune difficulty with real players: bot finishes in ~101 s, limit 4:00, 3★ ≤ 2:30 & 0 bites.
      An idle player collects ~2 bites in 4 min (rats cross the player's path every 8–16 s).
- [ ] Camera at the very back of a bay (start of a push) is still close (~2 m); acceptable, could be nicer.
- [ ] Fact-check the lager-cellar history card (`src/ui/i18n.js`, `l2History*`).
