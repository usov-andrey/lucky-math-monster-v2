import * as Engine from "./engine.js";
import { PHRASES, PRAISE_POOL, factTeachText, questionText, caughtText } from "./phrases.js";

const KEYS = {
  facts: "lmm2:facts",
  collection: "lmm2:collection",
  sessions: "lmm2:sessions",
  daily: "lmm2:daily",
  settings: "lmm2:settings",
};

const V1_COLLECTION_KEY = "lucky-math-6-collection";
const MAX_SESSIONS_PER_DAY = 2;
const MAX_SESSION_LOG = 14;

const MONSTERS = [
  { id: "sun", name: "Sunny", className: "monster-sun" },
  { id: "mint", name: "Minty", className: "monster-mint" },
  { id: "cloud", name: "Cloudy", className: "monster-cloud" },
  { id: "berry", name: "Berrybop", className: "monster-berry" },
  { id: "shado", name: "Shado", className: "monster-shado" },
  { id: "sparky", name: "Sparky", className: "monster-sparky" },
  { id: "coraly", name: "Coraly", className: "monster-coraly" },
  { id: "frosty", name: "Frosty", className: "monster-frosty" },
];
const LEGENDARY = { id: "aurelio", name: "Aurelio", className: "monster-legend" };
const ALL_MONSTERS = [...MONSTERS, LEGENDARY];

const els = {
  homeScreen: document.getElementById("home-screen"),
  gameScreen: document.getElementById("game-screen"),
  rewardScreen: document.getElementById("reward-screen"),
  dexScreen: document.getElementById("dex-screen"),
  parentScreen: document.getElementById("parent-screen"),

  collectedCounter: document.getElementById("collected-counter"),
  collectedCount: document.getElementById("collected-count"),
  collectedTotal: document.getElementById("collected-total"),
  startSession: document.getElementById("start-session"),
  openDex: document.getElementById("open-dex"),
  homeHint: document.getElementById("home-hint"),

  roundLabel: document.getElementById("round-label"),
  captureRing: document.getElementById("capture-ring"),
  monsterSlot: document.getElementById("monster-slot"),
  activeMonster: document.getElementById("active-monster"),
  questionText: document.getElementById("question-text"),
  playQuestion: document.getElementById("play-question"),
  answers: Array.from(document.querySelectorAll(".answer-button")),

  rewardMonster: document.getElementById("reward-monster"),
  rewardContinue: document.getElementById("reward-continue"),

  dexGrid: document.getElementById("dex-grid"),
  dexBack: document.getElementById("dex-back"),

  parentClose: document.getElementById("parent-close"),
  tableSix: document.getElementById("table-six"),
  tableSeven: document.getElementById("table-seven"),
  tableSessions: document.getElementById("table-sessions"),
  exportJson: document.getElementById("export-json"),
};

const state = {
  factStats: {},
  collection: [],
  daily: null,
  session: null,
  meta: null,
};

// --- Storage -------------------------------------------------------------

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (error) {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadDaily() {
  const daily = loadJSON(KEYS.daily, null);
  if (!daily || daily.date !== todayStr()) {
    return { date: todayStr(), sessionsCompleted: 0 };
  }
  return daily;
}

function saveDaily() {
  saveJSON(KEYS.daily, state.daily);
}

function nextSessionCount() {
  const settings = loadJSON(KEYS.settings, { sessionCounter: 0 });
  settings.sessionCounter = (settings.sessionCounter || 0) + 1;
  saveJSON(KEYS.settings, settings);
  return settings.sessionCounter;
}

function ensureMigration() {
  if (localStorage.getItem(KEYS.collection) != null) {
    return;
  }
  const v1Raw = localStorage.getItem(V1_COLLECTION_KEY);
  saveJSON(KEYS.collection, v1Raw != null ? Engine.migrateFromV1(v1Raw) : []);
}

function pushSessionSummary(summary) {
  const log = loadJSON(KEYS.sessions, []);
  log.unshift(summary);
  saveJSON(KEYS.sessions, log.slice(0, MAX_SESSION_LOG));
}

// --- Voice -----------------------------------------------------------------

function pickBestVoice(prefix) {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find(
      (voice) =>
        voice.lang.toLowerCase().startsWith(prefix.toLowerCase()) &&
        /female|samantha|zira|aria|google us english/i.test(voice.name),
    ) || voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix.toLowerCase())) || null
  );
}

function speakEnglish(text) {
  if (!text || !("speechSynthesis" in window)) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.9;
  utterance.pitch = 1.02;
  const voice = pickBestVoice("en");
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  window.speechSynthesis.speak(utterance);
}

// Plays the Thai clip if it exists; a 404/decode error falls back to English
// TTS automatically, so shipping the audio/th/ folder without the mp3 files
// recorded yet is safe.
function playAudioOrFallback(path, fallbackText) {
  if (!path) {
    speakEnglish(fallbackText);
    return;
  }
  let fellBack = false;
  const fallback = () => {
    if (!fellBack) {
      fellBack = true;
      speakEnglish(fallbackText);
    }
  };
  const audio = new Audio(path);
  audio.addEventListener("error", fallback);
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch(fallback);
  }
}

function say(key, overrideText) {
  const phrase = PHRASES[key];
  const text = overrideText || (phrase && phrase.en) || "";
  if (phrase && phrase.thAudio) {
    playAudioOrFallback(phrase.thAudio, text);
  } else {
    speakEnglish(text);
  }
}

// --- Monster helpers -------------------------------------------------------

function getMonsterMarkup(className) {
  return `
    <div class="monster ${className}">
      <div class="monster-ear monster-ear-left"></div>
      <div class="monster-ear monster-ear-right"></div>
      <div class="monster-body">
        <div class="monster-eye monster-eye-left"></div>
        <div class="monster-eye monster-eye-right"></div>
        <div class="monster-mouth"></div>
        <div class="monster-belly"></div>
      </div>
    </div>
  `;
}

function findMonster(id) {
  return ALL_MONSTERS.find((m) => m.id === id) || MONSTERS[0];
}

function setMonsterVisual(target, monsterId, shiny) {
  const monster = findMonster(monsterId);
  target.className = `monster ${monster.className}${shiny ? " is-shiny" : ""}`;
}

function pickMonsterForSession(island, collection) {
  if (island === "mix") {
    return LEGENDARY.id;
  }
  const caughtIds = new Set(collection.map((entry) => entry.id));
  const uncaught = MONSTERS.filter((m) => !caughtIds.has(m.id));
  const pool = uncaught.length > 0 ? uncaught : MONSTERS;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// --- Screens -----------------------------------------------------------------

function showScreen(name) {
  els.homeScreen.classList.toggle("is-hidden", name !== "home");
  els.gameScreen.classList.toggle("is-hidden", name !== "game");
  els.rewardScreen.classList.toggle("is-hidden", name !== "reward");
  els.dexScreen.classList.toggle("is-hidden", name !== "dex");
  els.parentScreen.classList.toggle("is-hidden", name !== "parent");
}

function renderHome() {
  els.collectedCount.textContent = String(state.collection.length);
  els.collectedTotal.textContent = String(ALL_MONSTERS.length);
  const capReached = state.daily.sessionsCompleted >= MAX_SESSIONS_PER_DAY;
  els.startSession.classList.toggle("is-hidden", capReached);
  els.homeHint.classList.toggle("is-hidden", !capReached);
}

// --- Game: silhouette reveal -------------------------------------------------

function applyReveal(revealSteps) {
  const t = Math.min(8, revealSteps) / 8;
  els.activeMonster.style.filter = `brightness(${(0.05 + t * 0.95).toFixed(3)}) saturate(${t.toFixed(3)})`;
  els.monsterSlot.style.setProperty("--glow", String((1 - t).toFixed(3)));
}

function animateRing(mode) {
  els.captureRing.classList.remove("pop", "charge", "throw-shake");
  void els.captureRing.offsetWidth;
  els.captureRing.classList.add(mode);
}

function animateDodge() {
  els.activeMonster.classList.remove("dodge");
  void els.activeMonster.offsetWidth;
  els.activeMonster.classList.add("dodge");
}

// --- Game: question flow -----------------------------------------------------

let currentChoices = [];
let forcedContinueKey = null; // set while the child must tap the highlighted correct answer
let questionStartedAt = 0;
let announcedBoss = false;

function renderQuestion() {
  const question = Engine.currentQuestion(state.session);
  if (!question) {
    finishSession();
    return;
  }

  if (question.phase === "boss" && !announcedBoss) {
    announcedBoss = true;
    say("throw");
  }

  forcedContinueKey = null;
  currentChoices = Engine.buildChoices(question);

  els.roundLabel.textContent = `${Math.min(state.session.history.length + 1, state.meta.totalQuestions)} / ${state.meta.totalQuestions}`;
  els.questionText.textContent =
    question.type === "missing" ? `? × ${question.a} = ${question.a * question.b}` : `${question.a} × ${question.b}`;

  els.answers.forEach((button, index) => {
    const choice = currentChoices[index];
    button.disabled = false;
    button.classList.remove("is-correct", "is-wrong", "is-correct-highlight");
    button.dataset.value = String(choice.value);
    button.dataset.correct = String(choice.correct);
    button.textContent = String(choice.value);
  });

  applyReveal(state.session.reveal);
  questionStartedAt = performance.now();
  window.setTimeout(() => say(null, questionText(question)), 120);
}

function lockAnswers(exceptButton) {
  els.answers.forEach((button) => {
    button.disabled = button !== exceptButton;
  });
}

function onCorrectAnswer(button, question, elapsedMs) {
  const priorReveal = state.session.reveal;
  state.session = Engine.answerCorrect(state.session, elapsedMs);
  button.classList.add("is-correct");

  if (question.phase === "boss") {
    animateRing("throw-shake");
  } else if (state.session.reveal > priorReveal && state.session.reveal < 8) {
    animateRing("pop");
  } else {
    animateRing("charge");
  }
  applyReveal(state.session.reveal);

  if (question.requeued) {
    say("recatch");
  } else if (state.session.reveal > priorReveal && state.session.reveal <= 8) {
    say("reveal_step");
  } else {
    say("praise_th", PRAISE_POOL[Math.floor(Math.random() * PRAISE_POOL.length)]);
  }

  window.setTimeout(() => {
    lockAnswers(null);
    renderQuestion();
  }, 900);
}

function onWrongAnswer(button, question) {
  state.session = Engine.answerWrong(state.session);
  button.classList.add("is-wrong");
  animateDodge();
  if (question.phase === "boss") {
    animateRing("throw-shake");
  }

  const teach = factTeachText(question.a, question.b);
  const mirror = Engine.GOLDEN_TRIO.includes(question.key) ? ` ${PHRASES.mirror_teach.en}` : "";
  say("dodge", `${PHRASES.dodge.en} ${teach}${mirror}`);

  const correctButton = els.answers.find((b) => b.dataset.correct === "true");
  lockAnswers(correctButton);
  correctButton.classList.add("is-correct-highlight");
  forcedContinueKey = question.key;
}

function onAnswerClick(button) {
  const question = Engine.currentQuestion(state.session);
  if (!question) {
    return;
  }

  if (forcedContinueKey) {
    // Forced confirmation tap after a wrong answer: just move on.
    if (button.dataset.correct !== "true") {
      return;
    }
    forcedContinueKey = null;
    lockAnswers(null);
    window.setTimeout(renderQuestion, 500);
    return;
  }

  if (button.disabled) {
    return;
  }

  const elapsedMs = performance.now() - questionStartedAt;
  const correct = button.dataset.correct === "true";
  state.factStats = Engine.updateFactOnAnswer(state.factStats, question.key, {
    correct,
    elapsedMs,
    sessionCount: state.session.sessionCount,
  });
  saveJSON(KEYS.facts, state.factStats);
  lockAnswers(button);

  if (correct) {
    onCorrectAnswer(button, question, elapsedMs);
  } else {
    onWrongAnswer(button, question);
  }
}

function startNewSession() {
  if (state.daily.sessionsCompleted >= MAX_SESSIONS_PER_DAY) {
    return;
  }
  const sessionCount = nextSessionCount();
  const plan = Engine.buildSessionPlan(state.factStats, sessionCount);
  state.session = Engine.createSession(plan.questions, sessionCount);
  state.meta = {
    sessionCount,
    island: plan.meta.island,
    focusFacts: plan.meta.focusFacts,
    monsterId: pickMonsterForSession(plan.meta.island, state.collection),
    totalQuestions: plan.questions.length,
  };
  announcedBoss = false;

  setMonsterVisual(els.activeMonster, state.meta.monsterId, false);
  applyReveal(0);
  showScreen("game");
  say("intro");
  window.setTimeout(renderQuestion, 900);
}

function finishSession() {
  const shiny = Engine.isShiny(state.session);
  const monsterId = state.meta.monsterId;

  const existing = state.collection.find((entry) => entry.id === monsterId);
  if (existing) {
    existing.shiny = existing.shiny || shiny;
  } else {
    state.collection.push({ id: monsterId, shiny, sessionCount: state.meta.sessionCount });
  }
  saveJSON(KEYS.collection, state.collection);

  pushSessionSummary({
    date: todayStr(),
    questions: state.session.history.length,
    errors: state.session.wrong,
    focusFacts: state.meta.focusFacts,
  });

  state.daily.sessionsCompleted += 1;
  saveDaily();

  const monster = findMonster(monsterId);
  setMonsterVisual(els.rewardMonster, monsterId, shiny);
  showScreen("reward");
  const closing = shiny ? "" : `${PHRASES.close.en} `;
  say("caught_th", `${caughtText(monster.name)} ${closing}${PHRASES.collection.en}`);
}

// --- Monsterdex --------------------------------------------------------------

function renderDex() {
  els.dexGrid.innerHTML = "";
  ALL_MONSTERS.forEach((monster) => {
    const entry = state.collection.find((item) => item.id === monster.id);
    const caught = Boolean(entry);
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = `dex-slot${caught ? "" : " not-caught"}${monster.id === LEGENDARY.id ? " legendary" : ""}`;
    slot.innerHTML = getMonsterMarkup(monster.className + (caught && entry.shiny ? " is-shiny" : ""));
    if (caught) {
      slot.addEventListener("click", () => speakEnglish(monster.name));
    }
    els.dexGrid.appendChild(slot);
  });

  const capReached = state.daily.sessionsCompleted >= MAX_SESSIONS_PER_DAY;
  if (capReached) {
    say("tomorrow");
  }
}

// --- Parent view ---------------------------------------------------------------

function renderFactTable(target, table) {
  const rows = Engine.tableFactsKeys(table)
    .map((key) => {
      const record = Engine.getFactRecord(state.factStats, key);
      return `<tr><td>${key}</td><td>${record.mastery}</td><td>${record.correct}/${record.attempts}</td></tr>`;
    })
    .join("");
  target.innerHTML = `<tr><th>Fact</th><th>Mastery</th><th>Correct/Attempts</th></tr>${rows}`;
}

function renderSessionsTable() {
  const log = loadJSON(KEYS.sessions, []);
  const rows = log
    .map(
      (entry) =>
        `<tr><td>${entry.date}</td><td>${entry.questions}</td><td>${entry.errors}</td><td>${(entry.focusFacts || []).join(", ")}</td></tr>`,
    )
    .join("");
  els.tableSessions.innerHTML = `<tr><th>Date</th><th>Questions</th><th>Errors</th><th>Focus facts</th></tr>${rows}`;
}

function renderParent() {
  renderFactTable(els.tableSix, 6);
  renderFactTable(els.tableSeven, 7);
  renderSessionsTable();
}

function openParent() {
  renderParent();
  showScreen("parent");
}

function exportJson() {
  const payload = {
    facts: state.factStats,
    collection: state.collection,
    sessions: loadJSON(KEYS.sessions, []),
    daily: state.daily,
    settings: loadJSON(KEYS.settings, {}),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `lucky-math-monster-v2-${todayStr()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// --- Parent-view tap trigger ---------------------------------------------------

let parentTapCount = 0;
let parentTapTimer = null;

function registerParentTap() {
  parentTapCount += 1;
  if (parentTapTimer) {
    clearTimeout(parentTapTimer);
  }
  parentTapTimer = window.setTimeout(() => {
    parentTapCount = 0;
  }, 2500);
  if (parentTapCount >= 5) {
    parentTapCount = 0;
    openParent();
  }
}

// --- Init ------------------------------------------------------------------

function init() {
  ensureMigration();
  state.factStats = loadJSON(KEYS.facts, {});
  state.collection = loadJSON(KEYS.collection, []);
  state.daily = loadDaily();

  els.startSession.addEventListener("click", startNewSession);
  els.openDex.addEventListener("click", () => {
    renderDex();
    showScreen("dex");
  });
  els.dexBack.addEventListener("click", () => {
    renderHome();
    showScreen("home");
  });
  els.rewardContinue.addEventListener("click", () => {
    renderDex();
    showScreen("dex");
  });
  els.playQuestion.addEventListener("click", () => {
    const question = Engine.currentQuestion(state.session);
    if (question) {
      say(null, questionText(question));
    }
  });
  els.answers.forEach((button) => {
    button.addEventListener("click", () => onAnswerClick(button));
  });
  els.collectedCounter.addEventListener("click", registerParentTap);
  els.parentClose.addEventListener("click", () => {
    renderHome();
    showScreen("home");
  });
  els.exportJson.addEventListener("click", exportJson);

  renderHome();
  showScreen("home");

  if (new URLSearchParams(window.location.search).get("parent") === "1") {
    openParent();
  }
}

init();
