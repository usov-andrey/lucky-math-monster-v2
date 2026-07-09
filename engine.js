// Pure game logic for Lucky Monster Math v2. No DOM access — importable from
// Node for tests (test/engine.test.mjs) and from the browser via app.js.

export const TABLES = [6, 7];
export const B_MIN = 2;
export const B_MAX = 10;
export const EASY_B = [2, 3, 4, 5, 10];
export const HARD_CORE = ["6x6", "6x7", "6x8", "6x9", "7x7", "7x8", "7x9"];
export const GOLDEN_TRIO = ["6x7", "7x8"];
export const ISLAND6_FOCUS_KEYS = ["6x6", "6x7", "6x8", "6x9"];

export function factKey(a, b) {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return `${lo}x${hi}`;
}

export function factProduct(key) {
  const [a, b] = key.split("x").map(Number);
  return a * b;
}

export function tableFactsKeys(table) {
  const keys = [];
  for (let b = B_MIN; b <= B_MAX; b += 1) {
    keys.push(factKey(table, b));
  }
  return keys;
}

function corePool(tables) {
  const set = new Set();
  tables.forEach((table) => tableFactsKeys(table).forEach((key) => set.add(key)));
  return [...set];
}

function shuffleWithRng(list, rng) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// --- Fact records / mastery ---------------------------------------------

export function createFactRecord() {
  return {
    attempts: 0,
    correct: 0,
    streak: 0,
    wrongStreak: 0,
    lastSession: 0,
    mastery: 0,
    streakSessionIds: [],
    fastStreak: 0,
  };
}

export function getFactRecord(factStats, key) {
  return factStats[key] ? { ...createFactRecord(), ...factStats[key] } : createFactRecord();
}

export function getMastery(factStats, key) {
  return getFactRecord(factStats, key).mastery || 0;
}

export function getAttempts(factStats, key) {
  return getFactRecord(factStats, key).attempts || 0;
}

function computeMasteryLevel(prev, next) {
  let mastery = prev.mastery || 0;

  if (next.wrongStreak >= 2) {
    mastery = Math.max(1, mastery - 1);
  }
  if (mastery < 1 && next.attempts >= 1) {
    mastery = 1;
  }
  if (mastery < 2 && next.streak >= 3 && (next.streakSessionIds || []).length >= 2) {
    mastery = 2;
  }
  // Fast-answer streak only counts once a fact is already "known" (level 2).
  if (mastery === 2 && (next.fastStreak || 0) >= 3) {
    mastery = 3;
  }
  return mastery;
}

export function updateFactOnAnswer(factStats, key, { correct, elapsedMs, sessionCount }) {
  const prev = getFactRecord(factStats, key);
  const next = { ...prev };
  next.attempts = prev.attempts + 1;

  if (correct) {
    next.correct = prev.correct + 1;
    next.streak = prev.streak + 1;
    next.wrongStreak = 0;
    const sessions = new Set(prev.streakSessionIds || []);
    sessions.add(sessionCount);
    next.streakSessionIds = [...sessions];
    next.lastSession = sessionCount;
    if (prev.mastery >= 2 && typeof elapsedMs === "number" && elapsedMs < 5000) {
      next.fastStreak = (prev.fastStreak || 0) + 1;
    } else {
      next.fastStreak = 0;
    }
  } else {
    next.streak = 0;
    next.streakSessionIds = [];
    next.wrongStreak = (prev.wrongStreak || 0) + 1;
    next.fastStreak = 0;
    next.lastSession = sessionCount;
  }

  next.mastery = computeMasteryLevel(prev, next);

  return { ...factStats, [key]: next };
}

// --- Island / day progression --------------------------------------------

export function selectIsland(factStats) {
  const sixMastered = ISLAND6_FOCUS_KEYS.filter((key) => getMastery(factStats, key) >= 2).length;
  if (sixMastered < 4) {
    return "island6";
  }
  const hardCoreMastered = HARD_CORE.filter((key) => getMastery(factStats, key) >= 2).length;
  if (hardCoreMastered >= 5) {
    return "mix";
  }
  return "island7";
}

// --- Session generator -----------------------------------------------------

function pickFocusCount(pool, factStats) {
  const weakCount = pool.filter((key) => getMastery(factStats, key) < 2).length;
  if (weakCount >= 4) {
    return 4;
  }
  if (weakCount === 3) {
    return 3;
  }
  return 2;
}

function pickFocusFacts(pool, factStats, count, rng) {
  const sorted = shuffleWithRng(pool, rng).sort((keyA, keyB) => {
    const masteryDiff = getMastery(factStats, keyA) - getMastery(factStats, keyB);
    if (masteryDiff !== 0) {
      return masteryDiff;
    }
    return getAttempts(factStats, keyA) - getAttempts(factStats, keyB);
  });
  return sorted.slice(0, Math.min(count, sorted.length));
}

function pickHuntLength(focusCount, rng) {
  // +2 (not just *2) reserves room for the 2-filler buffer that
  // buildHuntSequence uses to guarantee >= 3 spacing between a focus fact's
  // two occurrences regardless of how each occurrence block gets shuffled.
  const min = Math.max(9, focusCount * 2 + 2);
  const max = 11;
  if (min >= max) {
    return max;
  }
  const range = max - min + 1;
  return min + Math.floor(rng() * range);
}

// Places two occurrences of every focus fact with a guaranteed >= 3 index
// gap: [prefix fillers] [1st occurrence of each focus fact] [2-filler
// buffer] [2nd occurrence of each focus fact] [suffix fillers]. Whatever
// order each occurrence block is shuffled in, the buffer alone guarantees
// the minimum gap (worst case: last-in-first-block, first-in-second-block
// = focusCount + 2 - (focusCount - 1) = 3).
function buildHuntSequence(focusFacts, fillers, rng) {
  const firstBlock = shuffleWithRng(focusFacts, rng);
  const secondBlock = shuffleWithRng(focusFacts, rng);
  const buffer = fillers.slice(0, 2);
  const extra = shuffleWithRng(fillers.slice(2), rng);
  const half = Math.floor(extra.length / 2);
  const prefix = extra.slice(0, half);
  const suffix = extra.slice(half);
  return [...prefix, ...firstBlock, ...buffer, ...secondBlock, ...suffix];
}

function pickFillers(fillerCount, pool, focusFacts, factStats, rng) {
  if (fillerCount <= 0) {
    return [];
  }
  const candidates = pool.filter((key) => !focusFacts.includes(key));
  const known = shuffleWithRng(candidates.filter((key) => getMastery(factStats, key) >= 2), rng);
  const unknown = shuffleWithRng(candidates.filter((key) => getMastery(factStats, key) < 2), rng);
  const ordered = [...known, ...unknown];
  if (ordered.length === 0) {
    return [];
  }
  const result = [];
  let index = 0;
  while (result.length < fillerCount) {
    result.push(ordered[index % ordered.length]);
    index += 1;
  }
  return result;
}

function pickIsland7Fillers(fillerCount, pool, focusFacts, factStats, rng) {
  if (fillerCount <= 0) {
    return [];
  }
  const reviewCount = Math.round(fillerCount * 0.3);
  const mainCount = fillerCount - reviewCount;
  const mainFillers = pickFillers(mainCount, pool, focusFacts, factStats, rng);

  const sixKeys = tableFactsKeys(6).filter((key) => !focusFacts.includes(key));
  const sixSorted = [...sixKeys].sort(
    (keyA, keyB) => getMastery(factStats, keyA) - getMastery(factStats, keyB),
  );
  const reviewFillers = [];
  let index = 0;
  while (reviewFillers.length < reviewCount && sixSorted.length > 0) {
    reviewFillers.push(sixSorted[index % sixSorted.length]);
    index += 1;
  }
  return [...mainFillers, ...reviewFillers];
}

function pickWarmupFacts(factStats, tables, rng) {
  const easyPool = [];
  tables.forEach((table) => EASY_B.forEach((b) => easyPool.push(factKey(table, b))));
  const uniqueEasy = [...new Set(easyPool)];
  const knownPool = corePool(tables).filter((key) => getMastery(factStats, key) >= 2);
  const combined = [...new Set([...uniqueEasy, ...knownPool])];
  const shuffled = shuffleWithRng(combined, rng);

  const first = uniqueEasy[Math.floor(rng() * uniqueEasy.length)] || shuffled[0];
  const rest = shuffled.filter((key) => key !== first).slice(0, 2);
  while (rest.length < 2) {
    rest.push(first);
  }
  return [first, ...rest];
}

function pickBossFacts(focusFacts, pool, factStats, rng) {
  const chosen = [];
  const focusSorted = [...focusFacts].sort(
    (keyA, keyB) => getMastery(factStats, keyA) - getMastery(factStats, keyB),
  );
  focusSorted.forEach((key) => {
    if (chosen.length < 2) {
      chosen.push(key);
    }
  });

  const hasGolden = chosen.some((key) => GOLDEN_TRIO.includes(key));
  if (!hasGolden) {
    const goldenSorted = [...GOLDEN_TRIO].sort(
      (keyA, keyB) => getMastery(factStats, keyA) - getMastery(factStats, keyB),
    );
    const golden = goldenSorted.find((key) => !chosen.includes(key)) || goldenSorted[0];
    chosen.push(golden);
  }

  const extras = shuffleWithRng(
    pool.filter((key) => !chosen.includes(key)),
    rng,
  );
  let index = 0;
  while (chosen.length < 3 && index < extras.length) {
    chosen.push(extras[index]);
    index += 1;
  }
  while (chosen.length < 3) {
    chosen.push(focusSorted[0] || GOLDEN_TRIO[0]);
  }
  return chosen.slice(0, 3);
}

function factDisplay(key, contextTables, rng) {
  const [lo, hi] = key.split("x").map(Number);
  const options = [];
  if (contextTables.includes(lo)) {
    options.push({ a: lo, b: hi });
  }
  if (hi !== lo && contextTables.includes(hi)) {
    options.push({ a: hi, b: lo });
  }
  if (options.length === 0) {
    if (TABLES.includes(lo)) {
      options.push({ a: lo, b: hi });
    } else {
      options.push({ a: hi, b: lo });
    }
  }
  return options[Math.floor(rng() * options.length)];
}

function makeQuestion(key, phase, factStats, tables, rng) {
  const { a, b } = factDisplay(key, tables, rng);
  const mastery = getMastery(factStats, key);
  const canBeMissing = mastery >= 2;
  const type = canBeMissing && rng() < 0.35 ? "missing" : "product";
  return { key, a, b, type, phase };
}

function tryBuildSession(factStats, rng) {
  const island = selectIsland(factStats);
  const tables = island === "mix" ? [6, 7] : island === "island7" ? [7] : [6];
  const pool = corePool(tables);

  const focusCount = pickFocusCount(pool, factStats);
  const focusFacts = pickFocusFacts(pool, factStats, focusCount, rng);

  const huntLength = pickHuntLength(focusFacts.length, rng);
  const fillerCount = Math.max(0, huntLength - focusFacts.length * 2);

  const fillers =
    island === "island7"
      ? pickIsland7Fillers(fillerCount, pool, focusFacts, factStats, rng)
      : pickFillers(fillerCount, pool, focusFacts, factStats, rng);

  const warmupFacts = pickWarmupFacts(factStats, tables, rng);
  const bossFacts = pickBossFacts(focusFacts, pool, factStats, rng);

  const warmupQs = warmupFacts.map((key) => makeQuestion(key, "warmup", factStats, tables, rng));
  const huntKeys = buildHuntSequence(focusFacts, fillers, rng);
  const huntQs = huntKeys.map((key) => makeQuestion(key, "hunt", factStats, tables, rng));
  const bossQs = bossFacts.map((key) => makeQuestion(key, "boss", factStats, tables, rng));

  return {
    questions: [...warmupQs, ...huntQs, ...bossQs],
    meta: { island, focusFacts, huntLength },
  };
}

export function validateOrdering(questions) {
  const errors = [];
  if (questions.length < 15 || questions.length > 17) {
    errors.push(`invalid session length ${questions.length}`);
  }
  for (let i = 1; i < questions.length; i += 1) {
    if (questions[i].key === questions[i - 1].key) {
      errors.push(`repeated fact at index ${i}`);
    }
  }
  // Island 6 is single-table by design (all a=6), and Island 7 carries only
  // a sparse x6-review garnish — neither has enough of the minority table to
  // ever satisfy a strict "no 3-in-a-row" rule. The rule only has real teeth
  // (and is only checked) once a session is genuinely two-table, i.e. Mix.
  const tableCounts = {};
  questions.forEach((q) => {
    tableCounts[q.a] = (tableCounts[q.a] || 0) + 1;
  });
  const shares = Object.values(tableCounts).map((count) => count / questions.length);
  const genuinelyMixed = shares.length > 1 && Math.min(...shares) >= 0.25;

  for (let i = 2; i < questions.length; i += 1) {
    const trio = [questions[i - 2], questions[i - 1], questions[i]];
    if (genuinelyMixed && trio.every((q) => q.a === trio[0].a)) {
      errors.push(`3 consecutive same table at index ${i}`);
    }
    if (trio.every((q) => q.b === trio[0].b)) {
      errors.push(`3 consecutive same b at index ${i}`);
    }
  }
  if (questions.length > 0 && !EASY_B.includes(questions[0].b)) {
    errors.push("first question is not easy");
  }
  return errors;
}

export function checkFocusSpacing(questions, focusFacts) {
  const errors = [];
  const huntQuestions = questions.filter((q) => q.phase === "hunt");
  const uniqueFocus = [...new Set(focusFacts)];
  uniqueFocus.forEach((key) => {
    const indices = [];
    huntQuestions.forEach((q, idx) => {
      if (q.key === key) {
        indices.push(idx);
      }
    });
    if (indices.length !== 2) {
      errors.push(`focus fact ${key} does not appear exactly twice in hunt (found ${indices.length})`);
      return;
    }
    if (indices[1] - indices[0] < 3) {
      errors.push(`focus fact ${key} spaced too close (${indices[1] - indices[0]})`);
    }
  });
  return errors;
}

export function buildSessionPlan(factStats, sessionCount, rng = Math.random) {
  let lastCandidate = null;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const candidate = tryBuildSession(factStats, rng);
    const errors = validateOrdering(candidate.questions);
    const spacingErrors = checkFocusSpacing(candidate.questions, candidate.meta.focusFacts);
    if (errors.length === 0 && spacingErrors.length === 0) {
      return candidate;
    }
    lastCandidate = candidate;
  }
  return lastCandidate;
}

export function buildSession(factStats, sessionCount, rng = Math.random) {
  return buildSessionPlan(factStats, sessionCount, rng).questions;
}

// --- Question helpers --------------------------------------------------

export function computeAnswer(question) {
  return question.type === "missing" ? question.b : question.a * question.b;
}

export function buildChoices(question, rng = Math.random) {
  const correct = computeAnswer(question);
  const pool = new Set([correct]);
  const deltas = [1, 2, 3, -1, -2, -3];
  let guard = 0;
  while (pool.size < 3 && guard < 50) {
    guard += 1;
    const delta = deltas[Math.floor(rng() * deltas.length)];
    if (question.type === "missing") {
      pool.add(clamp(question.b + delta, B_MIN, B_MAX));
    } else {
      pool.add(question.a * clamp(question.b + delta, B_MIN, B_MAX));
    }
  }
  const values = shuffleWithRng([...pool], rng);
  return values.map((value) => ({ value, correct: value === correct }));
}

// --- Session runtime (queue, reveal, requeue-on-error, shiny) ------------

function makeEasyFillerQuestion(rng) {
  const table = rng() < 0.5 ? 6 : 7;
  const b = EASY_B[Math.floor(rng() * EASY_B.length)];
  return { key: factKey(table, b), a: table, b, type: "product", phase: "hunt", filler: true };
}

export function createSession(questions, sessionCount) {
  return {
    sessionCount,
    queue: questions.slice(),
    correct: 0,
    wrong: 0,
    reveal: 0,
    wrongCounts: {},
    countableWrong: 0,
    history: [],
    finished: false,
  };
}

export function currentQuestion(session) {
  return session.queue[0] || null;
}

export function hasReachedSessionCap(session, plannedTotal) {
  return session.history.length >= plannedTotal;
}

export function answerCorrect(session, elapsedMs) {
  const question = currentQuestion(session);
  const queue = session.queue.slice(1);
  return {
    ...session,
    queue,
    correct: session.correct + 1,
    reveal: Math.min(8, session.reveal + 1),
    history: [...session.history, { key: question.key, correct: true, elapsedMs }],
    finished: queue.length === 0,
  };
}

export function answerWrong(session, rng = Math.random) {
  const question = currentQuestion(session);
  const key = question.key;
  const priorWrongCount = session.wrongCounts[key] || 0;
  const newWrongCount = priorWrongCount + 1;
  const wrongCounts = { ...session.wrongCounts, [key]: newWrongCount };

  const distance = 2 + Math.floor(rng() * 2);
  let remainder = session.queue.slice(1);
  const insertAt = Math.min(remainder.length, distance);
  const requeued = { ...question, requeued: true };

  if (newWrongCount >= 2) {
    // Rule 6.5: give two easy warm-ups before a fact's second retry, and stop
    // counting its errors toward the shiny threshold from here on.
    const easyInserts = [makeEasyFillerQuestion(rng), makeEasyFillerQuestion(rng)];
    remainder = [
      ...remainder.slice(0, insertAt),
      ...easyInserts,
      requeued,
      ...remainder.slice(insertAt),
    ];
  } else {
    remainder = [...remainder.slice(0, insertAt), requeued, ...remainder.slice(insertAt)];
  }

  const countableWrong = newWrongCount === 1 ? session.countableWrong + 1 : session.countableWrong;

  return {
    ...session,
    queue: remainder,
    wrong: session.wrong + 1,
    wrongCounts,
    countableWrong,
    history: [...session.history, { key, correct: false }],
    finished: false,
  };
}

export function isShiny(session) {
  return session.countableWrong <= 1;
}

// --- Storage migration (v1 -> v2) ---------------------------------------

export function migrateFromV1(v1CollectionRaw) {
  let ids;
  try {
    ids = JSON.parse(v1CollectionRaw);
  } catch (error) {
    ids = [];
  }
  if (!Array.isArray(ids)) {
    ids = [];
  }
  return ids.map((id) => ({ id, shiny: false, sessionCount: 0 }));
}
