# SPEC — Lucky Monster Math v2 ("Who's That Monster?")

Tables ×6 and ×7 · silhouette-reveal capture · adaptive-lite engine

## 0. Context

v1 lives in repo `lucky-math-monster-6` (static site: `index.html`, `app.js`,
`styles.css`, no build step, deployed to GitHub Pages at
https://usov-andrey.github.io/lucky-math-monster-6/). v2 is an evolution of
that code, same stack. Study v1 first; reuse its TTS voice-picking
(`pickBestVoice`), CSS-drawn monster style, 3-button answer layout, and
localStorage patterns.

Player: girl, 10, reads poorly, speaks English + Thai (native), loves Pokemon
and Roblox. Therefore: ZERO required reading. Every instruction, question,
praise and monster name is SPOKEN. On-screen text = digits and single icons
only.

Core loop (5 minutes): a hidden monster appears as a black silhouette →
warmup questions → each correct answer reveals a piece of the monster
("Who's that Pokemon?" mechanic) → 3 boss questions = the throw → the monster
is always caught → collection screen → "tomorrow someone new will be here".

## 1. Hard constraints

- Vanilla HTML/CSS/JS. No framework, no bundler, no backend, no network calls
  at runtime (optional local audio files shipped with the page are fine).
- Works offline after first load. localStorage only. No PII, no analytics.
- Answer buttons: exactly 3, min height 64px. One dominant action per screen.
- Session: 15–17 questions max, ~5 minutes. Hard cap 2 sessions per calendar
  day (3rd+ "Start" hidden until tomorrow).
- The monster is ALWAYS caught at the end. There is no fail state anywhere.
- Split code: `engine.js` (pure functions, no DOM — importable from Node for
  tests) + `app.js` (DOM/audio glue). Keep `index.html` single-page.

## 2. Fact model

- Facts: `a × b` where `a ∈ {6,7}`, `b ∈ 2..10`. Canonical key = smaller
  factor first: `7×6` and `6×7` are BOTH stored as `"6x7"` (commutativity is a
  feature, teach it by voice: "Seven times six is the same as six times
  seven!").
- HARD CORE set: `6x6 6x7 6x8 6x9 7x7 7x8 7x9` (the golden trio inside it:
  `6x7 7x8`). EASY set: b ∈ {2,3,4,5,10}.
- Per-fact record (localStorage `lmm2:facts`):

  ```json
  { "6x7": { "attempts": 0, "correct": 0, "streak": 0, "wrongStreak": 0,
             "lastSession": 0, "mastery": 0 } }
  ```

- Mastery ladder (recompute after each answer):
  - 0 new → 1 seen (answered at least once)
  - 2 known: streak ≥ 3 spanning at least 2 different sessions
  - 3 fast: 3 correct answers each under 5s while at mastery 2
  - wrongStreak ≥ 2 ⇒ drop one level (never below 1).

## 3. Island / day progression (auto, no calendar)

Session template is chosen automatically from stored mastery, not by date:

- **Island 6** (like v1): while fewer than 4 of {6x6, 6x7, 6x8, 6x9} have
  mastery ≥ 2. Focus facts drawn from ×6 core.
- **Island 7**: focus facts from ×7 core; 30% of filler questions are ×6
  review (prefer lowest-mastery ×6 facts). Entered when the Island 6
  condition is met.
- **Mix (legendary)**: when ≥ 5 of HARD CORE reach mastery ≥ 2 — boss session
  of interleaved ×6/×7, awards the legendary monster.

## 4. Session generator (pure function in engine.js)

`buildSession(factStats, sessionCount) -> Question[]` with phases:

1. **warmup** — 3 questions: easy set or mastery ≥ 2, guaranteed success.
2. **hunt** — 9–11 questions: pick 2–4 FOCUS facts (lowest mastery in current
   island core); each focus fact appears exactly 2 times, spaced ≥ 3 apart;
   the rest are known fillers (90/10 feel: ≥ 60% of hunt items mastery ≥ 2).
3. **boss ("throw")** — 3 questions: focus facts + one golden-trio fact.

Ordering rules (a validator function must enforce):

- never the same fact twice in a row;
- max 2 consecutive questions sharing a `b` factor or an `a` table;
- first question of the session is always easy;
- total 15–17 items.

Question types: `product` ("6 × 4", voice "What is six times four?") and
`missing` ("? × 6 = 24") — `missing` ONLY for facts with mastery ≥ 2.
DROP v1's `compare` type entirely (it required reading the word "Same").

## 5. Capture = silhouette reveal ("Who's that monster?")

- Today's monster starts as a black silhouette (CSS `filter: brightness(0)` on
  the existing CSS-monster markup + a soft glow).
- Reveal has 8 steps. Each correct answer advances the reveal by 1 step
  (interpolate the filter toward none / remove a shadow overlay per step).
  Reveal progress NEVER goes backward.
- Once fully revealed (8 correct), remaining correct answers pulse the capture
  ring (charging the throw).
- Boss phase = the throw: the ring shakes on each boss answer; after the boss
  phase the monster is caught regardless of score.
- REPLACE v1's three progress bars with the silhouette itself as the only
  progress indicator. Keep a tiny "n / 17" round counter for the parent's
  eyes.

## 6. Error flow (no-fail loop)

On a wrong answer:

1. Neutral dodge animation (monster hops aside). Voice: "Almost! It dodged!"
2. The correct button pulses highlighted; all others disable. Voice speaks the
   full fact: "Six times seven is forty-two."
3. Child MUST tap the highlighted button to continue (guaranteed success tap).
4. The fact is re-queued 2–3 positions later. When answered right this time,
   use the stronger praise: "Gotcha! It couldn't escape this time!"
5. If the same fact is wrong twice in a session: insert 2 easy questions
   before retrying it, and don't count further errors on it toward shiny
   loss.

No penalty sounds, no streak-reset visuals, the reveal never regresses.

## 7. Rewards

- **Monsterdex screen**: grid of ~10 monsters; caught = full color (tap →
  name spoken), not-yet = silhouettes (visible = tomorrow's motivation).
  Legendary slot visually distinct.
- **Shiny**: session finished with ≤ 1 wrong answer ⇒ shiny variant
  (CSS `hue-rotate` palette + sparkle animation), stored per collection
  entry: `{ id, shiny, sessionCount }`.
- Monster roster: reuse the 3 v1 monsters (Sunny, Minty, Cloudy) + create
  ≥ 5 new ones in the same CSS style + 1 legendary. Names are English,
  Pokemon-flavored, always spoken, never required to be read.
- End of session: reward screen → auto to Monsterdex. Voice: "Tomorrow
  night… someone new will be here." Offer at most one extra hunt per day.

## 8. Voice system

- `phrases.js`: `PHRASES = { key: { en: "...", thAudio: "audio/th/<key>.mp3"? } }`.
  `say(key)` plays the Thai mp3 if the file exists AND the key is a
  warm-moment key, else falls back to en-US TTS (keep v1's `pickBestVoice`,
  rate 0.9).
- Auto-speak the question on render; keep the 🔊 replay button (icon only, no
  word "Play").
- Required phrase keys (en):
  - `intro` — "Someone's hiding! Let's catch it!"
  - `reveal_step` — "Yes! One more piece!"
  - `dodge` — "Almost! It dodged!"
  - `fact_teach` — "\<a> times \<b> is \<product>"
  - `recatch` — "Gotcha! It couldn't escape this time!"
  - `close` — "You're so close!"
  - `throw` — "Throw time! Three last questions!"
  - `caught` — "You caught it! It's \<Name>!"
  - `collection` — "It's in your collection now."
  - `tomorrow` — "Tomorrow night… someone new will be here."
  - `mirror_teach` — "Seven times six is the same as six times seven!"
  - praise pool — ["Yes!", "Great!", "Nice!", "Awesome!"]
- Thai warm-moment keys (play mp3 if present, else fall through to English):
  - `praise_th` — เก่งมาก! ("well done!")
  - `caught_th` — จับได้แล้ว! ("caught it!")
  - `dodge_th` — เกือบแล้ว! ("almost!")
  - `tomorrow_th` — พรุ่งนี้เจอกันนะ ("see you tomorrow")

  Ship the `audio/th/` folder structure and graceful fallback even if the mp3
  files are absent (they will be recorded later).
- Math facts are spoken in ENGLISH ONLY, identical wording every time.

## 9. Parent view (hidden)

Open via `?parent=1` or 5 taps on the collection counter. Shows: accuracy and
mastery per fact (two small tables for ×6/×7), last 14 session summaries
(date, questions, errors, focus facts), "Export JSON" button (downloads the
whole `lmm2:` state). Plain text is fine here — it's for the adult.

## 10. Storage

Namespace all keys `lmm2:` (`facts`, `collection`, `sessions`, `daily`,
`settings`). One-time migration: if v1 `lucky-math-6-collection` exists,
import its monster ids as caught (non-shiny).

## 11. Acceptance tests (must be written and pass)

`test/engine.test.mjs`, run with `node --test`, importing `engine.js`
directly:

1. `buildSession` length 15–17; phases 3 / 9–11 / 3.
2. Never the same fact twice in a row; ≤ 2 consecutive same-table or same-`b`.
3. 2–4 focus facts per session, each exactly twice, spacing ≥ 3.
4. ≥ 60% of hunt items have mastery ≥ 2 (given a seeded fact state).
5. Requeue-on-error inserts at distance 2–3; reveal counter never decreases.
6. Mastery transitions, incl. the two-session requirement for level 2 and
   demotion on wrongStreak ≥ 2.
7. Island selection: fresh state → Island 6; seeded ×6-mastered → Island 7;
   seeded both → Mix.
8. `missing` type is never generated for facts with mastery < 2.
9. Shiny awarded iff wrong-answer count ≤ 1 (with the rule 6.5 exclusion).
10. Storage migration from v1 keys.

Manual playtest checklist (put in README): sound works on iPad Safari after
the first tap, 64px touch targets, full session ≤ 6 min, no readable-text
dependency for the child anywhere in the child-facing flow.

## 12. Out of scope (do NOT build)

Accounts, server, analytics SDKs, chat, ads, timers that can fail the child,
full Thai localization, difficulty settings UI, more than 2 tables.

## 13. Suggested build order

1. Extract & write `engine.js` (facts, mastery, generator, validator) +
   tests.
2. Silhouette reveal + new monsters CSS + shiny.
3. Error flow rework + phrase system (`phrases.js`, Thai fallback).
4. Monsterdex + reward flow + daily cap.
5. Parent view + migration + README playtest checklist.
