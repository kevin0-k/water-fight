const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const stageEl = document.querySelector("#stage");
const speedEl = document.querySelector("#speed");
const ammoEl = document.querySelector("#ammo");
const scoreEl = document.querySelector("#score");
const startBtn = document.querySelector("#startBtn");
const aimStick = document.querySelector("#aimStick");
const aimKnob = document.querySelector("#aimKnob");
const fireBtn = document.querySelector("#fireBtn");
const playerNameInput = document.querySelector("#playerName");
const leaderboardEl = document.querySelector("#leaderboard");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const leaderboardKey = "water-fight-leaderboard";
const maxAmmo = 100;
const reloadDuration = 1;
const joystick = {
  active: false,
  pointerId: null,
  dx: 0,
  dy: -1,
};

function loadImage(src) {
  const image = new Image();
  image.src = src;
  image.addEventListener("load", draw);
  return image;
}

const images = {
  stage: loadImage("./assets/stage.png"),
  stage2: loadImage("./assets/stage-2.png"),
  stage3: loadImage("./assets/stage-3.png"),
  waterGun: loadImage("./assets/water-gun.png"),
  hanwoo: loadImage("./assets/hanwoo.png"),
  mushroom: loadImage("./assets/mushroom.png"),
  enemy1: loadImage("./assets/enemy-1.png"),
  enemy2: loadImage("./assets/enemy-2.png"),
};

const enemySprites = {};
let audioContext = null;
let masterGain = null;
let bgmTimer = null;
let bgmStep = 0;

const bgmSections = [
  {
    bass: [130.81, 130.81, 196.0, 174.61],
    chord: [261.63, 329.63, 392.0],
    melody: [523.25, null, 659.25, 783.99, null, 659.25, 587.33, null, 523.25, 587.33, 659.25, null, 783.99, 880.0, null, 783.99],
    counter: [null, 392.0, null, 440.0, 493.88, null, 392.0, null, null, 493.88, null, 523.25, null, 587.33, 523.25, null],
  },
  {
    bass: [146.83, 146.83, 220.0, 196.0],
    chord: [293.66, 369.99, 440.0],
    melody: [587.33, 659.25, null, 880.0, 783.99, null, 659.25, 587.33, null, 739.99, 880.0, 987.77, null, 880.0, 739.99, null],
    counter: [369.99, null, 440.0, null, null, 493.88, null, 440.0, 369.99, null, 554.37, null, 587.33, null, 493.88, null],
  },
  {
    bass: [164.81, 196.0, 246.94, 220.0],
    chord: [329.63, 392.0, 493.88],
    melody: [659.25, null, 783.99, 987.77, 880.0, null, 783.99, 659.25, 587.33, null, 659.25, 783.99, 987.77, null, 1046.5, 987.77],
    counter: [null, 493.88, 587.33, null, 659.25, null, 587.33, null, 493.88, 523.25, null, 659.25, null, 739.99, null, 659.25],
  },
  {
    bass: [174.61, 146.83, 196.0, 130.81],
    chord: [349.23, 440.0, 523.25],
    melody: [698.46, 783.99, 880.0, null, 1046.5, 987.77, null, 783.99, 880.0, null, 783.99, 698.46, 659.25, 587.33, null, 523.25],
    counter: [440.0, null, 523.25, 587.33, null, 659.25, 587.33, null, 523.25, null, 440.0, null, 392.0, 440.0, null, 523.25],
  },
];

const bgmFills = [
  [783.99, 880.0, 987.77, 1174.66],
  [659.25, 739.99, 880.0, 987.77],
  [987.77, 880.0, 783.99, 659.25],
  [1046.5, 987.77, 880.0, 1174.66],
];

function ensureAudio() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.28;
    masterGain.connect(audioContext.destination);
  }
  if (audioContext.state === "suspended") audioContext.resume();
  return true;
}

function playTone(frequency, duration, options = {}) {
  if (!ensureAudio()) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = options.type || "square";
  oscillator.frequency.setValueAtTime(frequency, now);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, now + duration);
  }
  gain.gain.setValueAtTime(options.volume || 0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playNoise(duration = 0.08, volume = 0.08, options = {}) {
  if (!ensureAudio()) return;
  const sampleCount = Math.floor(audioContext.sampleRate * duration);
  const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  filter.type = options.filterType || "bandpass";
  filter.frequency.value = options.frequency || 1800;
  filter.Q.value = options.q || 1.4;
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  source.start();
}

function playBgmChord(notes, step) {
  notes.forEach((note, index) => {
    window.setTimeout(() => {
      const octaveLift = step % 32 >= 16 && index === notes.length - 1 ? 2 : 1;
      playTone(note * octaveLift, 0.16, { type: "triangle", volume: 0.026 });
    }, index * 26);
  });
}

function playBgmDrums(step) {
  if (step % 16 === 0 || step % 16 === 6 || step % 16 === 10) {
    playTone(92, 0.1, { type: "sine", endFrequency: 45, volume: 0.085 });
  }
  if (step % 16 === 4 || step % 16 === 12) {
    playNoise(0.07, 0.045, { frequency: 900, q: 0.9 });
  }
  if (step % 2 === 1) {
    playNoise(0.025, 0.018, { frequency: 5200, q: 2.2 });
  }
  if (step % 16 === 15) {
    playNoise(0.045, 0.026, { frequency: 6400, q: 2.8 });
  }
}

function playShotSound() {
  playTone(760, 0.09, { endFrequency: 280, volume: 0.12 });
  playNoise(0.06, 0.055);
}

function playEnemyDownSound() {
  playTone(440, 0.08, { endFrequency: 220, volume: 0.13 });
  window.setTimeout(() => playTone(659.25, 0.1, { endFrequency: 329.63, volume: 0.11 }), 55);
  playNoise(0.1, 0.07);
}

function playStageSound() {
  [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
    window.setTimeout(() => playTone(note, 0.14, { volume: 0.1 }), index * 90);
  });
}

function stopBgm() {
  if (bgmTimer) window.clearInterval(bgmTimer);
  bgmTimer = null;
}

function startBgm() {
  if (!ensureAudio()) return;
  stopBgm();
  const tick = () => {
    if (!state.running) return;
    const sectionIndex = Math.floor(bgmStep / 32) % bgmSections.length;
    const section = bgmSections[sectionIndex];
    const phraseStep = bgmStep % 16;
    const barStep = bgmStep % 32;
    const stageLift = state.stage === 3 && bgmStep % 32 >= 16 ? 1.12246 : 1;
    const melody = section.melody[phraseStep];
    const counter = section.counter[phraseStep];

    playBgmDrums(bgmStep);

    if (bgmStep % 4 === 0) {
      const bass = section.bass[Math.floor(barStep / 8) % section.bass.length];
      playTone(bass, 0.22, { type: "triangle", volume: 0.055 });
    }

    if (bgmStep % 8 === 0) {
      playBgmChord(section.chord, bgmStep);
    }

    if (melody) {
      const variation = bgmStep % 64 >= 48 ? 1.05946 : 1;
      const octaveJump = bgmStep % 32 === 14 || bgmStep % 32 === 30 ? 2 : 1;
      playTone(melody * variation * stageLift * octaveJump, 0.105, { volume: 0.039 });
    }

    if (counter && (bgmStep % 2 === 1 || state.stage >= 2)) {
      playTone(counter * (state.stage === 3 ? 1.05946 : 1), 0.075, { type: "triangle", volume: 0.021 });
    }

    if (bgmStep % 32 === 28) {
      const fill = bgmFills[(Math.floor(bgmStep / 32) + state.stage) % bgmFills.length];
      fill.forEach((note, index) => {
        window.setTimeout(() => playTone(note, 0.055, { volume: 0.03 }), index * 34);
      });
    }

    bgmStep += 1;
  };
  tick();
  const interval = Math.max(82, 116 - (state.stage - 1) * 8);
  bgmTimer = window.setInterval(tick, interval);
}

function createOutlinedEnemySprite(image, width = 70, height = 97, outline = 3) {
  const sprite = document.createElement("canvas");
  const spriteCtx = sprite.getContext("2d");
  const padding = outline + 1;
  const offsets = [
    [-outline, 0],
    [outline, 0],
    [0, -outline],
    [0, outline],
    [-outline, -outline],
    [outline, -outline],
    [-outline, outline],
    [outline, outline],
  ];

  sprite.width = width + padding * 2;
  sprite.height = height + padding * 2;
  spriteCtx.imageSmoothingEnabled = true;

  for (const [offsetX, offsetY] of offsets) {
    spriteCtx.drawImage(image, padding + offsetX, padding + offsetY, width, height);
  }

  spriteCtx.globalCompositeOperation = "source-in";
  spriteCtx.fillStyle = "#ff274c";
  spriteCtx.fillRect(0, 0, sprite.width, sprite.height);
  spriteCtx.globalCompositeOperation = "destination-out";
  spriteCtx.drawImage(image, padding, padding, width, height);
  spriteCtx.globalCompositeOperation = "source-over";
  spriteCtx.drawImage(image, padding, padding, width, height);
  return sprite;
}

for (const type of ["enemy1", "enemy2"]) {
  const prepareSprite = () => {
    enemySprites[type] = createOutlinedEnemySprite(images[type]);
  };
  images[type].addEventListener("load", prepareSprite);
  if (images[type].complete && images[type].naturalWidth) prepareSprite();
}

const state = {
  running: false,
  gameOver: false,
  recorded: false,
  playerName: "",
  health: 3,
  stage: 1,
  score: 0,
  ammo: maxAmmo,
  reloading: false,
  reloadTimer: 0,
  angle: -Math.PI / 2,
  enemies: [],
  bonuses: [],
  shots: [],
  particles: [],
  enemyTimer: 0,
  bonusTimer: 4,
  stageTransition: 0,
  stageBannerTimer: 0,
  lastTime: 0,
};

const player = {
  x: W / 2,
  y: H - 24,
  barrel: 180,
  gunWidth: 97,
  gunHeight: 152,
};

function resetGame() {
  const name = playerNameInput.value.trim();
  if (!name) {
    playerNameInput.focus();
    playerNameInput.placeholder = "이름을 먼저 적어주세요";
    return;
  }

  state.running = true;
  state.gameOver = false;
  state.recorded = false;
  state.playerName = name.slice(0, 12);
  state.health = 3;
  state.stage = 1;
  state.score = 0;
  state.ammo = maxAmmo;
  state.reloading = false;
  state.reloadTimer = 0;
  state.angle = -Math.PI / 2;
  state.enemies = [];
  state.bonuses = [];
  state.shots = [];
  state.particles = [];
  state.enemyTimer = 0;
  state.bonusTimer = 3;
  state.stageTransition = 0;
  state.stageBannerTimer = 0;
  bgmStep = 0;
  startBtn.textContent = "다시 시작";
  updateHud();
  startBgm();
}

function updateHud() {
  stageEl.textContent = String(state.stage).padStart(2, "0");
  speedEl.textContent = `${getSpeedMultiplier().toFixed(1)}x`;
  ammoEl.textContent = state.reloading ? "장전" : String(state.ammo).padStart(3, "0");
  scoreEl.textContent = String(state.score).padStart(6, "0");
  fireBtn.textContent = state.reloading ? "장전중" : "발사";
  fireBtn.disabled = state.reloading;
}

function getSpeedMultiplier() {
  return 1 + (state.stage - 1) * 0.32;
}

function clampAngle() {
  const min = -Math.PI + 0.35;
  const max = -0.35;
  state.angle = Math.max(min, Math.min(max, state.angle));
}

function rotateAim(direction, amount = 0.055) {
  if (!state.running) return;
  state.angle += direction * amount;
  clampAngle();
}

function setAimFromJoystick(dx, dy) {
  if (!state.running) return;
  const length = Math.hypot(dx, dy);
  if (length < 0.12) return;
  state.angle = Math.atan2(dy, dx);
  clampAngle();
}

function moveJoystickKnob(dx, dy) {
  if (!aimKnob) return;
  const radius = 34;
  const length = Math.hypot(dx, dy) || 1;
  const limited = Math.min(1, length);
  const x = (dx / length) * limited * radius;
  const y = (dy / length) * limited * radius;
  aimKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
}

function resetJoystick() {
  joystick.active = false;
  joystick.pointerId = null;
  joystick.dx = 0;
  joystick.dy = -1;
  moveJoystickKnob(0, 0);
}

function updateJoystick(event) {
  if (!aimStick) return;
  const rect = aimStick.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const maxRadius = rect.width / 2;
  const rawDx = (event.clientX - centerX) / maxRadius;
  const rawDy = (event.clientY - centerY) / maxRadius;
  const length = Math.hypot(rawDx, rawDy) || 1;
  const limited = Math.min(1, length);
  const dx = (rawDx / length) * limited;
  const dy = Math.min(-0.08, (rawDy / length) * limited);
  joystick.dx = dx;
  joystick.dy = dy;
  moveJoystickKnob(dx, dy);
  setAimFromJoystick(dx, dy);
  aimStick.setAttribute("aria-valuenow", String(Math.round((state.angle + Math.PI / 2) * (180 / Math.PI))));
}

function getNozzleTip() {
  return {
    x: player.x + Math.cos(state.angle) * player.barrel,
    y: player.y + Math.sin(state.angle) * player.barrel,
  };
}

function startReload() {
  if (state.reloading) return;
  state.reloading = true;
  state.reloadTimer = reloadDuration;
  updateHud();
}

function fire() {
  if (!state.running || state.reloading || state.ammo <= 0) return;
  state.ammo -= 1;
  playShotSound();
  const tip = getNozzleTip();
  state.shots.push({
    x: tip.x,
    y: tip.y,
    vx: Math.cos(state.angle) * 760,
    vy: Math.sin(state.angle) * 760,
    life: 0.85,
  });
  splash(tip.x, tip.y, "#e7fbff", 6);
  if (state.ammo <= 0) startReload();
  updateHud();
}

function spawnEnemy() {
  const lanes = 8;
  const lane = Math.floor(Math.random() * lanes);
  const x = 70 + lane * ((W - 140) / (lanes - 1));
  const type = Math.random() > 0.5 ? "enemy1" : "enemy2";
  state.enemies.push({
    type,
    x,
    y: -64,
    w: 70,
    h: 97,
    speed: (54 + Math.random() * 28) * getSpeedMultiplier(),
    sway: Math.random() * Math.PI * 2,
  });
}

function spawnBonus() {
  const type = Math.random() > 0.5 ? "hanwoo" : "mushroom";
  const fromLeft = Math.random() > 0.5;
  state.bonuses.push({
    type,
    x: fromLeft ? -42 : W + 42,
    y: 110 + Math.random() * 260,
    r: 27,
    vx: (fromLeft ? 1 : -1) * (260 + Math.random() * 90),
    wobble: Math.random() * Math.PI,
  });
}

function splash(x, y, color, count = 12) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 130;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.45 + Math.random() * 0.28,
      color,
    });
  }
}

function update(dt) {
  if (!state.running) return;

  if (state.reloading) {
    state.reloadTimer -= dt;
    if (state.reloadTimer <= 0) {
      state.reloading = false;
      state.reloadTimer = 0;
      state.ammo = maxAmmo;
      updateHud();
    }
  }

  if (keys.has("ArrowLeft")) rotateAim(-1, 0.065);
  if (keys.has("ArrowRight")) rotateAim(1, 0.065);

  state.enemyTimer -= dt;
  const spawnDelay = Math.max(0.48, 1.08 - state.stage * 0.14);
  if (state.enemyTimer <= 0) {
    spawnEnemy();
    state.enemyTimer = spawnDelay;
  }

  state.bonusTimer -= dt;
  if (state.bonusTimer <= 0) {
    spawnBonus();
    state.bonusTimer = 6.2 + Math.random() * 3.4;
  }

  state.shots.forEach((shot) => {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
  });

  state.enemies.forEach((enemy) => {
    enemy.sway += dt * (4.2 + state.stage * 0.35);
    enemy.y += enemy.speed * dt;
    enemy.x += Math.sin(enemy.sway) * 12 * dt;
  });

  state.bonuses.forEach((bonus) => {
    bonus.x += bonus.vx * dt;
    bonus.wobble += dt * 7;
    bonus.y += Math.sin(bonus.wobble) * 22 * dt;
  });

  state.particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 180 * dt;
    p.life -= dt;
  });

  handleCollisions();

  state.shots = state.shots.filter((shot) => shot.life > 0 && shot.x > -30 && shot.x < W + 30 && shot.y > -40);
  state.particles = state.particles.filter((p) => p.life > 0);
  state.bonuses = state.bonuses.filter((bonus) => bonus.x > -90 && bonus.x < W + 90);

  for (const enemy of state.enemies) {
    if (enemy.y + enemy.h / 2 >= player.y + 10) {
      state.health -= 1;
      splash(enemy.x, player.y - 10, "#ff5c7a", 18);
      enemy.hitBase = true;
    }
  }
  state.enemies = state.enemies.filter((enemy) => !enemy.hitBase);

  if (state.health <= 0) {
    state.health = 0;
    state.running = false;
    state.gameOver = true;
    stopBgm();
    recordScore();
  }

  const nextStage = state.score >= 2000 ? 3 : state.score >= 1000 ? 2 : 1;
  if (nextStage > state.stage) {
    state.stage = nextStage;
    state.stageTransition = 0;
    state.stageBannerTimer = 2.2;
    playStageSound();
    startBgm();
  }
  if (state.stage >= 2) {
    state.stageTransition = Math.min(1, state.stageTransition + dt / 1.5);
  }
  state.stageBannerTimer = Math.max(0, state.stageBannerTimer - dt);
  updateHud();
}

function handleCollisions() {
  for (const shot of state.shots) {
    if (shot.used) continue;

    for (const enemy of state.enemies) {
      if (enemy.hit) continue;
      if (
        shot.x > enemy.x - enemy.w / 2 &&
        shot.x < enemy.x + enemy.w / 2 &&
        shot.y > enemy.y - enemy.h / 2 &&
        shot.y < enemy.y + enemy.h / 2
      ) {
        enemy.hit = true;
        shot.used = true;
        state.score += 20;
        playEnemyDownSound();
        splash(enemy.x, enemy.y, "#29d6ff", 18);
        break;
      }
    }

    if (shot.used) continue;
    for (const bonus of state.bonuses) {
      if (bonus.hit) continue;
      const dx = shot.x - bonus.x;
      const dy = shot.y - bonus.y;
      if (Math.hypot(dx, dy) < bonus.r + 8) {
        bonus.hit = true;
        shot.used = true;
        state.health = Math.min(9, state.health + 1);
        state.score += 45;
        splash(bonus.x, bonus.y, bonus.type === "hanwoo" ? "#ffd35a" : "#49e38b", 24);
        break;
      }
    }
  }

  state.enemies = state.enemies.filter((enemy) => !enemy.hit);
  state.bonuses = state.bonuses.filter((bonus) => !bonus.hit);
  state.shots = state.shots.filter((shot) => !shot.used);
}

function drawCoveredImage(image, x, y, width, height) {
  if (!image.complete || !image.naturalWidth) return false;
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sw = width / scale;
  const sh = height / scale;
  const sx = (image.naturalWidth - sw) / 2;
  const sy = (image.naturalHeight - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  return true;
}

function drawPixelBackground() {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const previousStageImage = state.stage === 3 ? images.stage2 : images.stage;
  const currentStageImage = state.stage === 3 ? images.stage3 : images.stage2;
  const hasStage = drawCoveredImage(previousStageImage, 0, 0, W, H);
  if (state.stage >= 2 && state.stageTransition > 0 && currentStageImage.complete && currentStageImage.naturalWidth) {
    ctx.globalAlpha = state.stageTransition;
    drawCoveredImage(currentStageImage, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (!hasStage) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#82eaff");
    sky.addColorStop(0.58, "#23aada");
    sky.addColorStop(1, "#0c5789");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = "rgba(8, 17, 31, 0.16)";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#0c1b2e";
  ctx.fillRect(0, 0, W, 8);
  ctx.fillRect(0, H - 8, W, 8);
  ctx.fillRect(0, 0, 8, H);
  ctx.fillRect(W - 8, 0, 8, H);
}

function drawStageBanner() {
  if (state.stageBannerTimer <= 0) return;

  const fade = Math.min(1, state.stageBannerTimer, (2.2 - state.stageBannerTimer) * 3);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = "rgba(5, 11, 24, 0.84)";
  ctx.fillRect(W / 2 - 190, H / 2 - 66, 380, 132);
  ctx.strokeStyle = "#55e8f2";
  ctx.lineWidth = 4;
  ctx.strokeRect(W / 2 - 184, H / 2 - 60, 368, 120);
  ctx.fillStyle = "#fff05a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 50px monospace";
  ctx.fillText(`STAGE ${state.stage}`, W / 2, H / 2 - 8);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 18px monospace";
  ctx.fillText(state.stage === 3 ? "SODEUNGSEOM SUNSET" : "WOODLAND MODE", W / 2, H / 2 + 35);
  ctx.restore();
}

function drawPlayerFallback(tip) {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(state.angle);
  ctx.fillStyle = "#ffd35a";
  ctx.fillRect(0, -12, player.barrel, 24);
  ctx.fillStyle = "#ff5c7a";
  ctx.fillRect(22, -22, 26, 44);
  ctx.fillStyle = "#08111f";
  ctx.fillRect(player.barrel - 8, -16, 12, 32);
  ctx.restore();

  ctx.fillStyle = "#e7fbff";
  ctx.fillRect(tip.x - 4, tip.y - 4, 8, 8);
}

function drawPlayer() {
  const tip = getNozzleTip();

  ctx.save();
  ctx.translate(player.x, player.y + 9);
  ctx.fillStyle = "rgba(4, 12, 24, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 70, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (!images.waterGun.complete || !images.waterGun.naturalWidth) {
    drawPlayerFallback(tip);
    return;
  }

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(state.angle + Math.PI / 2);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    images.waterGun,
    -player.gunWidth / 2,
    -player.gunHeight + 18,
    player.gunWidth,
    player.gunHeight,
  );
  ctx.restore();

  ctx.fillStyle = "#e7fbff";
  ctx.fillRect(tip.x - 4, tip.y - 4, 8, 8);
}

function drawEnemy(enemy) {
  const image = enemy.type === "enemy1" ? images.enemy1 : images.enemy2;
  const sprite = enemySprites[enemy.type];
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.imageSmoothingEnabled = true;
  if (sprite) {
    ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  } else if (image.complete && image.naturalWidth) {
    ctx.drawImage(image, -enemy.w / 2, -enemy.h / 2, enemy.w, enemy.h);
  } else {
    ctx.fillStyle = "#08111f";
    ctx.fillRect(-25, -10, 50, 58);
    ctx.fillStyle = "#ff5c7a";
    ctx.fillRect(-21, 0, 42, 42);
    ctx.fillStyle = "#ffd9a7";
    ctx.fillRect(-16, -30, 32, 30);
  }
  ctx.restore();
}

function drawBonus(bonus) {
  const image = bonus.type === "hanwoo" ? images.hanwoo : images.mushroom;
  const size = bonus.type === "hanwoo" ? 62 : 58;
  ctx.save();
  ctx.translate(bonus.x, bonus.y);
  ctx.rotate(Math.sin(bonus.wobble) * 0.08);
  ctx.imageSmoothingEnabled = true;
  if (image.complete && image.naturalWidth) {
    ctx.drawImage(image, -size / 2, -size / 2, size, size);
  } else if (bonus.type === "hanwoo") {
    ctx.fillStyle = "#ffd35a";
    ctx.fillRect(-24, -16, 48, 32);
  } else {
    ctx.fillStyle = "#49e38b";
    ctx.fillRect(-8, -6, 16, 28);
    ctx.fillStyle = "#f7f0d1";
    ctx.fillRect(-26, -26, 52, 24);
  }
  ctx.restore();
}

function drawShot(shot) {
  ctx.fillStyle = "#e7fbff";
  ctx.fillRect(shot.x - 7, shot.y - 7, 14, 14);
  ctx.fillStyle = "#29d6ff";
  ctx.fillRect(shot.x - 4, shot.y - 4, 8, 8);
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
  }
  ctx.globalAlpha = 1;
}

function drawPixelHeart(x, y, scale = 4) {
  const pixels = [
    "01100110",
    "11111111",
    "11111111",
    "01111110",
    "00111100",
    "00011000",
  ];

  ctx.fillStyle = "#08111f";
  for (let row = 0; row < pixels.length; row += 1) {
    for (let col = 0; col < pixels[row].length; col += 1) {
      if (pixels[row][col] === "1") {
        ctx.fillRect(x + col * scale - 2, y + row * scale - 2, scale + 4, scale + 4);
      }
    }
  }

  ctx.fillStyle = "#ff3f62";
  for (let row = 0; row < pixels.length; row += 1) {
    for (let col = 0; col < pixels[row].length; col += 1) {
      if (pixels[row][col] === "1") {
        ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
      }
    }
  }

  ctx.fillStyle = "#ffb2c0";
  ctx.fillRect(x + scale, y + scale, scale, scale);
}

function drawGameHud() {
  const heartsPerRow = 5;
  const heartWidth = 38;
  const rows = Math.max(1, Math.ceil(state.health / heartsPerRow));
  const panelWidth = 228;
  const panelHeight = 36 + rows * 31;
  const speedPanelWidth = 154;
  const speedPanelHeight = 74;
  const speedPanelX = W - speedPanelWidth - 20;
  const ammoPanelY = 104;
  const reloadProgress = state.reloading ? 1 - state.reloadTimer / reloadDuration : state.ammo / maxAmmo;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgba(6, 15, 35, 0.82)";
  ctx.fillRect(20, 20, panelWidth, panelHeight);
  ctx.strokeStyle = "#08111f";
  ctx.lineWidth = 6;
  ctx.strokeRect(20, 20, panelWidth, panelHeight);
  ctx.strokeStyle = "#55e8f2";
  ctx.lineWidth = 2;
  ctx.strokeRect(25, 25, panelWidth - 10, panelHeight - 10);

  ctx.fillStyle = "#fff05a";
  ctx.font = "900 20px monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("LIFE", 34, 31);

  for (let index = 0; index < state.health; index += 1) {
    const col = index % heartsPerRow;
    const row = Math.floor(index / heartsPerRow);
    drawPixelHeart(34 + col * heartWidth, 59 + row * 31, 4);
  }

  ctx.fillStyle = "rgba(6, 15, 35, 0.82)";
  ctx.fillRect(speedPanelX, 20, speedPanelWidth, speedPanelHeight);
  ctx.strokeStyle = "#08111f";
  ctx.lineWidth = 6;
  ctx.strokeRect(speedPanelX, 20, speedPanelWidth, speedPanelHeight);
  ctx.strokeStyle = "#fff05a";
  ctx.lineWidth = 2;
  ctx.strokeRect(speedPanelX + 5, 25, speedPanelWidth - 10, speedPanelHeight - 10);

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#55e8f2";
  ctx.font = "900 16px monospace";
  ctx.fillText("SPEED", speedPanelX + speedPanelWidth / 2, 31);
  ctx.fillStyle = "#fff05a";
  ctx.font = "900 28px monospace";
  ctx.fillText(`${getSpeedMultiplier().toFixed(1)}x`, speedPanelX + speedPanelWidth / 2, 52);

  ctx.fillStyle = "rgba(6, 15, 35, 0.82)";
  ctx.fillRect(speedPanelX, ammoPanelY, speedPanelWidth, speedPanelHeight);
  ctx.strokeStyle = "#08111f";
  ctx.lineWidth = 6;
  ctx.strokeRect(speedPanelX, ammoPanelY, speedPanelWidth, speedPanelHeight);
  ctx.strokeStyle = state.reloading ? "#ff5c7a" : "#8dff8d";
  ctx.lineWidth = 2;
  ctx.strokeRect(speedPanelX + 5, ammoPanelY + 5, speedPanelWidth - 10, speedPanelHeight - 10);

  ctx.fillStyle = state.reloading ? "#ffb2c0" : "#8dff8d";
  ctx.font = "900 16px monospace";
  ctx.fillText(state.reloading ? "RELOAD" : "AMMO", speedPanelX + speedPanelWidth / 2, ammoPanelY + 11);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 25px monospace";
  ctx.fillText(state.reloading ? `${Math.ceil(state.reloadTimer * 10) / 10}s` : `${state.ammo}/${maxAmmo}`, speedPanelX + speedPanelWidth / 2, ammoPanelY + 31);

  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.fillRect(speedPanelX + 18, ammoPanelY + 58, speedPanelWidth - 36, 7);
  ctx.fillStyle = state.reloading ? "#ff5c7a" : "#8dff8d";
  ctx.fillRect(speedPanelX + 18, ammoPanelY + 58, (speedPanelWidth - 36) * Math.max(0, Math.min(1, reloadProgress)), 7);
  ctx.restore();
}

function drawOverlay() {
  if (state.running) return;
  ctx.fillStyle = "rgba(8, 17, 31, 0.66)";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd35a";
  ctx.font = "900 42px system-ui, sans-serif";
  ctx.fillText(state.gameOver ? "물싸움 종료!" : "물싸움 준비!", W / 2, H / 2 - 34);
  ctx.fillStyle = "#e7fbff";
  ctx.font = "700 23px system-ui, sans-serif";
  ctx.fillText(
    state.gameOver ? `${state.playerName} 점수 ${state.score}점` : "이름을 적고 게임 시작을 눌러주세요",
    W / 2,
    H / 2 + 8,
  );
}

function readLeaderboard() {
  try {
    const parsed = JSON.parse(localStorage.getItem(leaderboardKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLeaderboard(entries) {
  localStorage.setItem(leaderboardKey, JSON.stringify(entries));
}

function recordScore() {
  if (state.recorded) return;
  state.recorded = true;
  const entries = readLeaderboard();
  entries.push({
    name: state.playerName || "플레이어",
    score: state.score,
    stage: state.stage,
  });
  entries.sort((a, b) => b.score - a.score);
  writeLeaderboard(entries.slice(0, 9));
  renderLeaderboard();
}

function renderLeaderboard() {
  const entries = readLeaderboard();
  const seeded = entries.length
    ? entries
    : [
        { name: "진서", score: 2340, stage: 3 },
        { name: "물총왕", score: 1480, stage: 2 },
        { name: "장흥러", score: 760, stage: 1 },
      ];

  leaderboardEl.innerHTML = seeded
    .slice(0, 9)
    .map(
      (entry, index) => `
        <li>
          <span class="leaderboard-rank">${index + 1}</span>
          <span class="leaderboard-name">${entry.name}</span>
          <span class="leaderboard-score">${entry.score}점</span>
        </li>
      `,
    )
    .join("");
}

function draw() {
  drawPixelBackground();
  state.bonuses.forEach(drawBonus);
  state.enemies.forEach(drawEnemy);
  state.shots.forEach(drawShot);
  drawParticles();
  drawPlayer();
  drawGameHud();
  drawStageBanner();
  drawOverlay();
}

function loop(time) {
  const dt = Math.min(0.033, (time - state.lastTime) / 1000 || 0);
  state.lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === "Space" && !event.repeat) fire();
});

document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

canvas.addEventListener("pointerdown", fire);
startBtn.addEventListener("click", resetGame);
aimStick.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  joystick.active = true;
  joystick.pointerId = event.pointerId;
  aimStick.setPointerCapture(event.pointerId);
  updateJoystick(event);
});
aimStick.addEventListener("pointermove", (event) => {
  if (!joystick.active || event.pointerId !== joystick.pointerId) return;
  event.preventDefault();
  updateJoystick(event);
});
aimStick.addEventListener("pointerup", (event) => {
  if (event.pointerId !== joystick.pointerId) return;
  aimStick.releasePointerCapture(event.pointerId);
  resetJoystick();
});
aimStick.addEventListener("pointercancel", resetJoystick);
fireBtn.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  fire();
});

renderLeaderboard();
updateHud();
draw();
requestAnimationFrame(loop);
