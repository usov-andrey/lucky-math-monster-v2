// Voice phrase data. No DOM/Audio here — app.js does playback + fallback.

export const PHRASES = {
  intro: { en: "Someone's hiding! Let's catch it!" },
  reveal_step: { en: "Yes! One more piece!" },
  dodge: { en: "Almost! It dodged!", thAudio: "audio/th/dodge_th.mp3" },
  recatch: { en: "Gotcha! It couldn't escape this time!" },
  close: { en: "You're so close!" },
  throw: { en: "Throw time! Three last questions!" },
  collection: { en: "It's in your collection now." },
  tomorrow: { en: "Tomorrow night… someone new will be here.", thAudio: "audio/th/tomorrow_th.mp3" },
  mirror_teach: { en: "Seven times six is the same as six times seven!" },
  praise_th: { en: "Yes!", thAudio: "audio/th/praise_th.mp3" },
  caught_th: { en: "You caught it!", thAudio: "audio/th/caught_th.mp3" },
};

export const PRAISE_POOL = ["Yes!", "Great!", "Nice!", "Awesome!"];

export function factTeachText(a, b) {
  return `${a} times ${b} is ${a * b}.`;
}

export function questionText(question) {
  if (question.type === "missing") {
    return `What number times ${question.a} is ${question.a * question.b}?`;
  }
  return `What is ${question.a} times ${question.b}?`;
}

export function caughtText(name) {
  return `You caught it! It's ${name}!`;
}
