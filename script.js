const ASSETS = {
  background: "assets/background.png",
  hand: "assets/hand-cut.png",
  gameOverSound: "assets/sound_67.mp3",
  character: {
    idle: "assets/character-idle.png",
    alert: "assets/character-alert.png",
    yell: "assets/character-yell.png",
    slap: "assets/character-slap.png",
  },
};

const MISS_PENALTY = -1;
const TIMEOUT_PENALTY = -1;
const SLAP_PHASE_DURATION = 1300;
const FAKE_LINES = ["66!", "76!", "68!", "57!", "67?", "..."];

const stage = document.querySelector("#stage");
const scoreEl = document.querySelector("#score");
const timerEl = document.querySelector("#timer");
const comboEl = document.querySelector("#combo");
const failGauge = document.querySelector("#failGauge");
const failGaugeSteps = [...failGauge.querySelectorAll("i")];
const character = document.querySelector("#character");
const speechBubble = document.querySelector("#speechBubble");
const slapHand = document.querySelector("#slapHand");
const slapText = document.querySelector("#slapText");
const toast = document.querySelector("#toast");
const startScreen = document.querySelector("#startScreen");
const endScreen = document.querySelector("#endScreen");
const startButton = document.querySelector("#startButton");
const restartButton = document.querySelector("#restartButton");
const menuButton = document.querySelector("#menuButton");
const finalScore = document.querySelector("#finalScore");
const bestScore = document.querySelector("#bestScore");
const gameOverSound = new Audio(ASSETS.gameOverSound);
gameOverSound.loop = true;
gameOverSound.volume = 0.75;

const state = {
  playing: false,
  score: 0,
  combo: 0,
  fails: 0,
  elapsedTime: 0,
  yelling: false,
  talking: false,
  slapping: false,
  lastPhase: null,
  samePhaseCount: 0,
  yellTimer: null,
  talkTimer: null,
  slapTimer: null,
  nextYellTimer: null,
  tickTimer: null,
  startAt: 0,
};

function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(src);
    image.onerror = reject;
    image.src = src;
  });
}

function loadAssets() {
  preloadImage(ASSETS.background)
    .then((src) => {
      stage.style.setProperty("--scene-bg", `url("${src}")`);
      stage.classList.add("has-background");
    })
    .catch(() => {});

  preloadImage(ASSETS.hand)
    .then((src) => {
      slapHand.style.setProperty("--hand-image", `url("${src}")`);
      slapHand.classList.add("has-hand-image");
    })
    .catch(() => {});

  Promise.all(Object.entries(ASSETS.character).map(([pose, src]) => preloadImage(src).then(() => [pose, src])))
    .then((frames) => {
      frames.forEach(([pose, src]) => {
        character.style.setProperty(`--character-${pose}`, `url("${src}")`);
      });
      character.classList.add("use-sprite");
    })
    .catch(() => {});
}

function setPose(pose) {
  character.classList.remove("pose-alert", "pose-yell", "pose-slap");
  if (pose) {
    character.classList.add(`pose-${pose}`);
  }
}

function updateHud() {
  scoreEl.textContent = state.score;
  comboEl.textContent = `x${state.combo}`;
  timerEl.textContent = state.elapsedTime.toFixed(1);
  failGaugeSteps.forEach((step, index) => {
    step.classList.toggle("filled", index < state.fails);
  });
  stage.classList.toggle("gauge-full", state.fails >= 3);
}

function resetTimers() {
  clearTimeout(state.yellTimer);
  clearTimeout(state.talkTimer);
  clearTimeout(state.slapTimer);
  clearTimeout(state.nextYellTimer);
  clearInterval(state.tickTimer);
  state.yellTimer = null;
  state.talkTimer = null;
  state.slapTimer = null;
  state.nextYellTimer = null;
  state.tickTimer = null;
}

function getDifficulty() {
  const pressure = Math.min(18, Math.max(0, state.score)) / 18;
  return {
    minDelay: 180 + (1 - pressure) * 260,
    maxDelay: 440 + (1 - pressure) * 520,
    yellDuration: 1180 - pressure * 570,
    talkDuration: 520 + (1 - pressure) * 360,
  };
}

function randomBetween(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickNextPhase() {
  if (state.lastPhase && state.samePhaseCount >= 2) {
    return state.lastPhase === "talk" ? "yell" : "talk";
  }

  const talkChance = state.lastPhase === "yell" ? 0.62 : 0.48;
  return Math.random() < talkChance ? "talk" : "yell";
}

function rememberPhase(phase) {
  if (state.lastPhase === phase) {
    state.samePhaseCount += 1;
  } else {
    state.lastPhase = phase;
    state.samePhaseCount = 1;
  }
}

function scheduleNextYell() {
  if (!state.playing) {
    return;
  }

  const difficulty = getDifficulty();
  const delay = randomBetween(difficulty.minDelay, difficulty.maxDelay);

  setPose("");
  state.nextYellTimer = setTimeout(() => {
    const nextPhase = pickNextPhase();
    rememberPhase(nextPhase);

    if (nextPhase === "talk") {
      startTalk();
      return;
    }

    startYell();
  }, delay);
}

function startYell() {
  if (!state.playing) {
    return;
  }

  const difficulty = getDifficulty();
  state.yelling = true;
  state.talking = false;
  state.slapping = false;
  speechBubble.textContent = "67!";
  speechBubble.setAttribute("aria-hidden", "false");
  stage.classList.add("is-yelling");
  stage.classList.remove("is-talking");
  setPose("yell");

  state.yellTimer = setTimeout(() => {
    if (!state.playing || !state.yelling) {
      return;
    }

    state.score += TIMEOUT_PENALTY;
    state.combo = 0;
    addFailure();
    if (!state.playing) {
      return;
    }
    endYell();
    showToast("Too slow -1");
    shake();
    updateHud();
    scheduleNextYell();
  }, difficulty.yellDuration);
}

function endYell() {
  state.yelling = false;
  clearTimeout(state.yellTimer);
  state.yellTimer = null;
  stage.classList.remove("is-yelling");
  if (!state.talking) {
    speechBubble.setAttribute("aria-hidden", "true");
  }
}

function startTalk() {
  if (!state.playing) {
    return;
  }

  const difficulty = getDifficulty();
  state.talking = true;
  state.yelling = false;
  state.slapping = false;
  speechBubble.textContent = randomItem(FAKE_LINES);
  speechBubble.setAttribute("aria-hidden", "false");
  stage.classList.add("is-talking");
  stage.classList.remove("is-yelling");
  setPose("alert");

  state.talkTimer = setTimeout(() => {
    endTalk();
    scheduleNextYell();
  }, difficulty.talkDuration);
}

function endTalk() {
  state.talking = false;
  clearTimeout(state.talkTimer);
  state.talkTimer = null;
  stage.classList.remove("is-talking");
  if (!state.yelling) {
    speechBubble.setAttribute("aria-hidden", "true");
  }
}

function addFailure() {
  state.fails = Math.min(3, state.fails + 1);
  updateHud();

  if (state.fails >= 3) {
    finishGame();
  }
}

function startSlapPhase(afterSlap) {
  state.slapping = true;
  setPose("slap");
  clearTimeout(state.slapTimer);
  state.slapTimer = setTimeout(() => {
    state.slapping = false;
    state.slapTimer = null;
    if (!state.playing) {
      return;
    }

    setPose("");
    afterSlap();
  }, SLAP_PHASE_DURATION);
}

function playGameOverSound() {
  gameOverSound.currentTime = 0;
  gameOverSound.play().catch(() => {});
}

function stopGameOverSound() {
  gameOverSound.pause();
  gameOverSound.currentTime = 0;
}

function startGame() {
  stopGameOverSound();
  resetTimers();
  state.playing = true;
  state.score = 0;
  state.combo = 0;
  state.fails = 0;
  state.elapsedTime = 0;
  state.yelling = false;
  state.talking = false;
  state.slapping = false;
  state.lastPhase = null;
  state.samePhaseCount = 0;
  state.startAt = performance.now();

  startScreen.classList.remove("overlay-active");
  endScreen.classList.remove("overlay-active");
  stage.classList.remove("is-yelling");
  setPose("");
  updateHud();

  state.tickTimer = setInterval(() => {
    state.elapsedTime = (performance.now() - state.startAt) / 1000;
    updateHud();
  }, 80);

  scheduleNextYell();
}

function finishGame() {
  if (!state.playing) {
    return;
  }

  state.playing = false;
  resetTimers();
  endYell();
  endTalk();
  state.slapping = false;
  setPose("");

  const storedBest = Number(localStorage.getItem("best-67-slap") || 0);
  const newBest = Math.max(storedBest, state.score);
  localStorage.setItem("best-67-slap", String(newBest));

  finalScore.textContent = state.score;
  bestScore.textContent = newBest;
  endScreen.classList.add("overlay-active");
  playGameOverSound();
}

function showMenu() {
  stopGameOverSound();
  resetTimers();
  state.playing = false;
  state.yelling = false;
  state.talking = false;
  state.slapping = false;
  endYell();
  endTalk();
  setPose("");
  endScreen.classList.remove("overlay-active");
  startScreen.classList.add("overlay-active");
  updateHud();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
}

function shake() {
  stage.classList.remove("shake");
  void stage.offsetWidth;
  stage.classList.add("shake");
}

function showSlapEffects(x, y, goodHit) {
  slapHand.style.left = `${x}px`;
  slapHand.style.top = `${y}px`;
  slapHand.classList.remove("active");
  void slapHand.offsetWidth;
  slapHand.classList.add("active");

  if (goodHit) {
    slapText.style.left = `${Math.min(stage.clientWidth - 120, x + 75)}px`;
    slapText.style.top = `${Math.max(120, y - 25)}px`;
    slapText.classList.remove("active");
    void slapText.offsetWidth;
    slapText.classList.add("active");
  }
}

function handleSlap(event) {
  if (!state.playing || state.slapping) {
    return;
  }

  const rect = stage.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  showSlapEffects(x, y, state.yelling || state.talking);

  if (state.yelling) {
    state.score += 1;
    state.combo += 1;
    endYell();
    showToast("+1");
    shake();
    updateHud();

    startSlapPhase(scheduleNextYell);
    return;
  }

  const wasTalking = state.talking;
  state.score += MISS_PENALTY;
  state.combo = 0;
  addFailure();
  if (!state.playing) {
    return;
  }
  endTalk();
  setPose(wasTalking ? "slap" : "alert");
  showToast("Wrong time -1");
  shake();
  updateHud();

  if (wasTalking) {
    startSlapPhase(scheduleNextYell);
    return;
  }

  setTimeout(() => {
    if (state.playing && !state.yelling) {
      setPose("");
    }
  }, 260);
}

function stopMenuClick(event) {
  event.stopPropagation();
}

loadAssets();
updateHud();

if (new URLSearchParams(window.location.search).get("screen") === "end") {
  state.score = 28;
  state.combo = 3;
  finalScore.textContent = "28";
  bestScore.textContent = Math.max(58, Number(localStorage.getItem("best-67-slap") || 0));
  startScreen.classList.remove("overlay-active");
  endScreen.classList.add("overlay-active");
  playGameOverSound();
  updateHud();
}

const debugPose = new URLSearchParams(window.location.search).get("pose");
if (debugPose) {
  setPose(debugPose);
}

if (new URLSearchParams(window.location.search).get("state") === "talk") {
  speechBubble.textContent = "66!";
  speechBubble.setAttribute("aria-hidden", "false");
  startScreen.classList.remove("overlay-active");
  stage.classList.add("is-talking");
  setPose("alert");
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", startGame);
menuButton.addEventListener("click", showMenu);
startScreen.addEventListener("pointerdown", stopMenuClick);
endScreen.addEventListener("pointerdown", stopMenuClick);
stage.addEventListener("pointerdown", handleSlap);

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && state.playing) {
    const rect = character.getBoundingClientRect();
    handleSlap({
      clientX: rect.left + rect.width * 0.72,
      clientY: rect.top + rect.height * 0.34,
    });
  }
});
