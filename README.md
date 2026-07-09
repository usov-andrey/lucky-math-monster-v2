# Lucky Monster Math v2 — "Who's That Monster?"

Silhouette-reveal monster-catching game for practicing the ×6 and ×7 tables.
Zero reading required — every instruction, question, and piece of praise is
spoken; on-screen text is digits and icons only. See
[SPEC-lucky-math-monster-v2.md](SPEC-lucky-math-monster-v2.md) for the full
design.

This is a separate, standalone evolution of `lucky-math-monster-6` (v1) —
both folders are independent static sites and can run side by side; v2 does
not modify or depend on v1 (it only reads v1's `lucky-math-6-collection`
localStorage key once, to migrate a player's caught monsters).

## Run locally

`app.js` imports `engine.js` and `phrases.js` as native ES modules, which
browsers block from `file://` (CORS). Serve the folder over HTTP instead,
e.g. from this directory:

```
python -m http.server 8080
```

then open `http://localhost:8080/`.

## Run the engine tests

```
node --test test/engine.test.mjs
```

## Deploy

Standalone static site intended for GitHub Pages, same as v1 — no build
step.

During active testing, bump the `?v=...` suffixes in
[index.html](/D:/Google%20Drive/Personal/lucky-math-monster-v2/index.html) to
force browsers to fetch fresh `styles.css`, `app.js`, `engine.js`, and
`phrases.js` instead of using cached copies.

## Manual playtest checklist

Run through this on the actual target device (iPad Safari) before calling a
change done:

- [ ] First tap after a fresh page load produces sound (iOS Safari requires
      a user gesture before `speechSynthesis`/`Audio` will play).
- [ ] Every answer button is at least 64px tall and easy to hit with a
      child's finger.
- [ ] A full session (warmup + hunt + boss) takes about 5 minutes, and never
      more than ~6.
- [ ] Nothing in the child-facing flow (home, game, reward, Monsterdex)
      requires reading a word — only digits, `×`, `?`, and icons appear;
      every instruction/question/praise/monster name is spoken instead.
- [ ] A wrong answer never feels like failure: the monster dodges, the
      correct answer is taught out loud and highlighted, and the reveal
      never goes backward.
- [ ] The monster is always caught at the end of a session, regardless of
      score.
- [ ] After 2 completed sessions in one calendar day, the Start button
      disappears until the next day.
- [ ] Missing `audio/th/*.mp3` files fall back to English TTS silently (no
      visible error, no dead silence).
- [ ] `?parent=1` (or 5 taps on the collected counter) opens the parent view
      with per-fact mastery and recent sessions.
