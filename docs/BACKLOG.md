# Backlog

## Level 3 "Gangsteři ve Světovaru" (added 2026-11-13)
- [ ] Play it for real (only tested by a scripted bot in a throttled tab): difficulty, timings, aim feel on touch.
- [ ] Gangsters read too dark against the moonlit windows — add a rim light / lighter coat tints.
- [ ] Listen to and tune the procedural audio.
- [ ] Fact-check the level-3 history card (`src/ui/i18n.js`, keys `g3*`).
- [ ] Task in the AFFiNE design doc ("EpicTower") is unfinished for level 3 — confirm the guard/salt-shotgun design with the team.

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
