import test from "node:test";
import assert from "node:assert/strict";
import {
  TABLES,
  EASY_B,
  HARD_CORE,
  ISLAND6_FOCUS_KEYS,
  factKey,
  tableFactsKeys,
  createFactRecord,
  getMastery,
  updateFactOnAnswer,
  selectIsland,
  buildSession,
  buildSessionPlan,
  validateOrdering,
  checkFocusSpacing,
  createSession,
  currentQuestion,
  hasReachedSessionCap,
  answerCorrect,
  answerWrong,
  isShiny,
  migrateFromV1,
} from "../engine.js";

// Deterministic PRNG so repeated test runs are reproducible.
function mulberry32(seed) {
  let a = seed;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function masteredFactStats(keys, level = 2) {
  const stats = {};
  keys.forEach((key) => {
    stats[key] = { ...createFactRecord(), mastery: level, attempts: 10, correct: 10 };
  });
  return stats;
}

function allKeys() {
  const set = new Set();
  TABLES.forEach((table) => tableFactsKeys(table).forEach((key) => set.add(key)));
  return [...set];
}

// 1 & 2 & 8: structural invariants across many random fact states / seeds.
test("buildSession: length, phase split, ordering rules, missing-type gating", () => {
  for (let seed = 0; seed < 60; seed += 1) {
    const rng = mulberry32(seed * 97 + 1);
    // Seed a random-ish fact state: mastery-2 for a random subset of facts.
    const keys = allKeys();
    const factStats = masteredFactStats(
      keys.filter(() => rng() < 0.5),
      2,
    );

    const plan = buildSessionPlan(factStats, seed, rng);
    const { questions, meta } = plan;

    assert.ok(questions.length >= 15 && questions.length <= 17, `length ${questions.length}`);

    const warmup = questions.filter((q) => q.phase === "warmup");
    const hunt = questions.filter((q) => q.phase === "hunt");
    const boss = questions.filter((q) => q.phase === "boss");
    assert.equal(warmup.length, 3);
    assert.ok(hunt.length >= 9 && hunt.length <= 11, `hunt length ${hunt.length}`);
    assert.equal(boss.length, 3);
    assert.equal(warmup.length + hunt.length + boss.length, questions.length);

    const orderingErrors = validateOrdering(questions);
    assert.deepEqual(orderingErrors, [], orderingErrors.join("; "));

    const spacingErrors = checkFocusSpacing(questions, meta.focusFacts);
    assert.deepEqual(spacingErrors, [], spacingErrors.join("; "));

    // #8: `missing` type only ever appears for facts already at mastery >= 2.
    questions.forEach((q) => {
      if (q.type === "missing") {
        assert.ok(getMastery(factStats, q.key) >= 2, `missing used for low-mastery ${q.key}`);
      }
    });
  }
});

// 3: 2-4 focus facts, each exactly twice in hunt, spaced >= 3.
test("buildSession: 2-4 focus facts, each exactly twice, spaced >= 3 apart", () => {
  const rng = mulberry32(12345);
  const factStats = {};
  const plan = buildSessionPlan(factStats, 1, rng);
  assert.ok(plan.meta.focusFacts.length >= 2 && plan.meta.focusFacts.length <= 4);

  const hunt = plan.questions.filter((q) => q.phase === "hunt");
  plan.meta.focusFacts.forEach((key) => {
    const indices = [];
    hunt.forEach((q, idx) => {
      if (q.key === key) indices.push(idx);
    });
    assert.equal(indices.length, 2, `${key} should appear exactly twice in hunt`);
    assert.ok(indices[1] - indices[0] >= 3, `${key} spacing ${indices[1] - indices[0]}`);
  });
});

// 4: >= 60% of hunt items have mastery >= 2, given a seeded fact state with
// only two weak facts and everything else in the island core mastered.
test("buildSession: >= 60% of hunt items are mastery >= 2 for a mostly-mastered state", () => {
  const weakKeys = ["6x6", "6x9"];
  const factStats = masteredFactStats(tableFactsKeys(6).filter((k) => !weakKeys.includes(k)), 2);
  const rng = mulberry32(555);
  const plan = buildSessionPlan(factStats, 1, rng);

  assert.equal(plan.meta.island, "island6");
  assert.equal(plan.meta.focusFacts.length, 2);
  assert.deepEqual(new Set(plan.meta.focusFacts), new Set(weakKeys));

  const hunt = plan.questions.filter((q) => q.phase === "hunt");
  const knownCount = hunt.filter((q) => getMastery(factStats, q.key) >= 2).length;
  assert.ok(knownCount / hunt.length >= 0.6, `known ratio ${knownCount}/${hunt.length}`);
});

// 5: requeue-on-error inserts at distance 2-3; reveal counter never decreases.
test("answerWrong: requeues at distance 2-3; reveal never decreases", () => {
  const questions = buildSession({}, 1, mulberry32(9));
  let session = createSession(questions, 1);

  const lowRng = () => 0; // distance = 2
  const highRng = () => 0.99; // distance = 3

  const before = currentQuestion(session);
  const after = answerWrong(session, lowRng);
  assert.equal(after.queue[2].key, before.key);
  assert.equal(after.queue[2].requeued, true);

  session = createSession(questions, 1);
  const before2 = currentQuestion(session);
  const after2 = answerWrong(session, highRng);
  assert.equal(after2.queue[3].key, before2.key);

  // Reveal never regresses across a mixed sequence of right/wrong answers.
  let s = createSession(questions, 1);
  let lastReveal = 0;
  for (let i = 0; i < 20 && currentQuestion(s); i += 1) {
    const goWrong = i % 3 === 0;
    s = goWrong ? answerWrong(s, mulberry32(i)) : answerCorrect(s, 1200);
    assert.ok(s.reveal >= lastReveal, "reveal decreased");
    lastReveal = s.reveal;
  }
});

// 6: mastery transitions, incl. two-session requirement for level 2 and
// demotion on wrongStreak >= 2.
test("mastery ladder: seen -> known (needs 2 sessions) -> fast -> demotion", () => {
  let stats = {};
  const key = "6x7";

  // First attempt: 0 -> 1 (seen).
  stats = updateFactOnAnswer(stats, key, { correct: true, sessionCount: 1 });
  assert.equal(getMastery(stats, key), 1);

  // Three correct in a row, all within session 1: streak spans only 1
  // session, so it must NOT yet reach mastery 2.
  stats = updateFactOnAnswer(stats, key, { correct: true, sessionCount: 1 });
  stats = updateFactOnAnswer(stats, key, { correct: true, sessionCount: 1 });
  assert.ok(getMastery(stats, key) < 2, "should not promote within a single session");

  // A correct answer in a second session completes the 2-session span.
  stats = updateFactOnAnswer(stats, key, { correct: true, sessionCount: 2 });
  assert.equal(getMastery(stats, key), 2);

  // Three fast (<5s) correct answers while at mastery 2 -> level 3.
  stats = updateFactOnAnswer(stats, key, { correct: true, elapsedMs: 1000, sessionCount: 2 });
  stats = updateFactOnAnswer(stats, key, { correct: true, elapsedMs: 1500, sessionCount: 3 });
  stats = updateFactOnAnswer(stats, key, { correct: true, elapsedMs: 900, sessionCount: 3 });
  assert.equal(getMastery(stats, key), 3);

  // Two wrong answers in a row demote by one level (never below 1).
  stats = updateFactOnAnswer(stats, key, { correct: false, sessionCount: 4 });
  stats = updateFactOnAnswer(stats, key, { correct: false, sessionCount: 4 });
  assert.equal(getMastery(stats, key), 2);

  let floorStats = { [key]: { ...createFactRecord(), mastery: 1, attempts: 1 } };
  floorStats = updateFactOnAnswer(floorStats, key, { correct: false, sessionCount: 1 });
  floorStats = updateFactOnAnswer(floorStats, key, { correct: false, sessionCount: 1 });
  assert.equal(getMastery(floorStats, key), 1, "mastery should never drop below 1");
});

// 7: island selection.
test("selectIsland: fresh -> island6; x6 mastered -> island7; both -> mix", () => {
  assert.equal(selectIsland({}), "island6");

  const island7Stats = masteredFactStats(ISLAND6_FOCUS_KEYS, 2);
  assert.equal(selectIsland(island7Stats), "island7");

  const mixStats = masteredFactStats([...ISLAND6_FOCUS_KEYS, "7x7"], 2);
  assert.equal(selectIsland(mixStats), "mix");
});

// 9: shiny awarded iff wrong-answer count <= 1 (with rule 6.5 exclusion).
test("isShiny: true for 0-1 countable wrongs; repeated errors on one fact don't stack", () => {
  const questions = buildSession({}, 1, mulberry32(3));
  let session = createSession(questions, 1);
  assert.equal(isShiny(session), true);

  session = answerWrong(session, () => 0.5); // 1st wrong overall -> countable
  assert.equal(isShiny(session), true);
  assert.equal(session.countableWrong, 1);

  const wrongKey = currentQuestion(createSession(questions, 1)).key;
  // Force two more wrongs on the SAME fact as the first wrong (rule 6.5):
  // only the first of them should have counted, so shiny stays true.
  let s2 = createSession(questions, 1);
  s2 = answerWrong(s2, () => 0.5);
  // Re-answer the same fact wrong again (simulate it being requeued and
  // missed a second time) by manually invoking answerWrong on a session
  // whose current question is that same key.
  s2 = { ...s2, queue: [{ key: wrongKey, a: 6, b: 7, type: "product", phase: "hunt" }, ...s2.queue] };
  s2 = answerWrong(s2, () => 0.5);
  assert.equal(s2.countableWrong, 1, "second wrong on same fact must not add to countable total");
  assert.equal(isShiny(s2), true);

  // A second wrong on a DIFFERENT fact does count, and breaks shiny.
  let s3 = createSession(questions, 1);
  s3 = answerWrong(s3, () => 0.5);
  const otherKey = currentQuestion(s3).key;
  s3 = { ...s3, queue: [{ key: otherKey + "-x", a: 7, b: 9, type: "product", phase: "hunt" }, ...s3.queue] };
  // Give it a genuinely distinct fact key.
  s3.queue[0] = { key: "7x9", a: 7, b: 9, type: "product", phase: "hunt" };
  s3 = answerWrong(s3, () => 0.5);
  assert.equal(s3.countableWrong, 2);
  assert.equal(isShiny(s3), false);
});

test("hasReachedSessionCap: session still ends at the planned total", () => {
  const questions = buildSession({}, 1, mulberry32(21));
  const plannedTotal = questions.length;
  let session = createSession(questions, 1);

  assert.equal(hasReachedSessionCap(session, plannedTotal), false);

  session = answerWrong(session, () => 0);
  assert.equal(hasReachedSessionCap(session, plannedTotal), false);

  session = answerCorrect(session, 1000);
  assert.equal(hasReachedSessionCap(session, plannedTotal), false);

  session = { ...session, history: Array.from({ length: plannedTotal }, () => ({ correct: true })) };
  assert.equal(hasReachedSessionCap(session, plannedTotal), true);
});

// 10: storage migration from v1 keys.
test("migrateFromV1: imports v1 collection ids as caught, non-shiny", () => {
  const v1Raw = JSON.stringify(["sun", "mint"]);
  const migrated = migrateFromV1(v1Raw);
  assert.deepEqual(migrated, [
    { id: "sun", shiny: false, sessionCount: 0 },
    { id: "mint", shiny: false, sessionCount: 0 },
  ]);

  assert.deepEqual(migrateFromV1("not json"), []);
  assert.deepEqual(migrateFromV1(undefined), []);
});
