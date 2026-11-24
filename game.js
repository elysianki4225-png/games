(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const arenaShell = document.getElementById('arenaShell');
  if (!canvas || !arenaShell || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const roster = document.getElementById('roster');
  const matchState = document.getElementById('matchState');
  const overlay = document.getElementById('arenaOverlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayMessage = document.getElementById('overlayMessage');
  const collisionToast = document.getElementById('collisionToast');
  const pauseButton = document.getElementById('pauseButton');
  const restartButton = document.getElementById('restartButton');
  const collisionCount = document.getElementById('collisionCount');
  const wallCount = document.getElementById('wallCount');
  const blockCount = document.getElementById('blockCount');
  const eventFeed = document.getElementById('eventFeed');

  const BORDER = 7;
  const COLORS = [
    { id: 'blue', name: '泡泡', color: '#4e9fff', light: '#bfe2ff', dark: '#2877d1', glow: 'rgba(78, 159, 255, 0.34)', face: 'smile', idle: '开心漂浮' },
    { id: 'mint', name: '豆豆', color: '#35ce98', light: '#b8ffe0', dark: '#1c9d6e', glow: 'rgba(53, 206, 152, 0.31)', face: 'goofy', idle: '吐舌发呆' },
    { id: 'coral', name: '烈烈', color: '#ff687d', light: '#ffd2d8', dark: '#d3425a', glow: 'rgba(255, 104, 125, 0.31)', face: 'sassy', idle: '酷酷巡视' },
    { id: 'sun', name: '团子', color: '#ffbe45', light: '#fff0bb', dark: '#dd8a22', glow: 'rgba(255, 190, 69, 0.34)', face: 'sleepy', idle: '困困打盹' },
    { id: 'violet', name: '露露', color: '#a47dff', light: '#e2d4ff', dark: '#7652d2', glow: 'rgba(164, 125, 255, 0.34)', face: 'starry', idle: '星星眼' },
    { id: 'aqua', name: '薄荷', color: '#39cbd1', light: '#c4fbfa', dark: '#20969f', glow: 'rgba(57, 203, 209, 0.32)', face: 'wink', idle: '偷偷眨眼' },
  ];

  let world = null;
  let match = null;
  let animationFrame = 0;
  let previousTime = 0;
  let lastHudTime = 0;
  let toastTimer = 0;
  let resizeFrame = 0;
  let resizeObserver = null;

  function isPhoneLayout() {
    return (window.innerWidth || document.documentElement.clientWidth) <= 700;
  }

  function measureWorld(width, height) {
    const phone = isPhoneLayout();
    const cell = Math.min(
      width / (phone ? 9.2 : 22),
      height / (phone ? 13.3 : 14),
      phone ? 52 : 58,
    );
    return {
      width,
      height,
      cell,
      blockSize: Math.max(19, cell * 0.88),
      border: Math.max(BORDER, Math.min(9, cell * 0.16)),
      columns: Math.ceil(width / cell),
      rows: Math.ceil(height / cell),
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    };
  }

  function applyCanvasSize() {
    const width = arenaShell.clientWidth;
    const height = arenaShell.clientHeight;
    if (width < 80 || height < 120) return;

    const oldWorld = world;
    const nextWorld = measureWorld(width, height);
    const pixelWidth = Math.round(width * nextWorld.dpr);
    const pixelHeight = Math.round(height * nextWorld.dpr);
    const backingChanged = canvas.width !== pixelWidth || canvas.height !== pixelHeight;
    if (backingChanged) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(nextWorld.dpr, 0, 0, nextWorld.dpr, 0, 0);

    world = nextWorld;
    if (!match || !oldWorld) return;

    const scaleX = nextWorld.width / oldWorld.width;
    const scaleY = nextWorld.height / oldWorld.height;
    match.fighters.forEach((fighter) => {
      fighter.x *= scaleX;
      fighter.y *= scaleY;
      fighter.size = nextWorld.blockSize;
      keepInside(fighter, false);
    });
    for (let pass = 0; pass < 3; pass += 1) resolveBlockCollisions(false);
    render(performance.now());
  }

  function makeFighter(config, index) {
    const placements = [
      [0.16, 0.18],
      [0.5, 0.25],
      [0.84, 0.18],
      [0.17, 0.77],
      [0.5, 0.82],
      [0.83, 0.76],
    ];
    const [px, py] = placements[index];
    const size = world.blockSize;
    const safe = world.border + size / 2 + 3;
    const areaWidth = Math.max(1, world.width - safe * 2);
    const areaHeight = Math.max(1, world.height - safe * 2);
    const angle = Math.random() * Math.PI * 2;
    const speed = world.cell * (1.55 + Math.random() * 0.65);

    return {
      ...config,
      x: safe + areaWidth * px,
      y: safe + areaHeight * py,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      angle,
      faceMood: 'idle',
      moodUntil: 0,
      lastBumpAt: -Infinity,
      blinkIn: 1.4 + Math.random() * 4.5,
      blinkLeft: 0,
      animationSeed: Math.random() * Math.PI * 2,
    };
  }

  function createRoster() {
    roster.replaceChildren();
    match.fighters.forEach((fighter) => {
      const chip = document.createElement('div');
      chip.className = 'roster-chip';
      chip.dataset.character = fighter.id;
      chip.style.setProperty('--character-color', fighter.color);
      chip.setAttribute('aria-label', `${fighter.name}，${fighter.idle}`);

      const swatch = document.createElement('span');
      swatch.className = 'roster-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      copy.className = 'roster-copy';
      const name = document.createElement('strong');
      name.textContent = fighter.name;
      const mood = document.createElement('small');
      mood.textContent = fighter.idle;
      copy.append(name, mood);
      chip.append(swatch, copy);
      roster.append(chip);
    });
  }

  function resetEventFeed() {
    eventFeed.replaceChildren();
    const entry = document.createElement('li');
    entry.className = 'empty-event';
    const dot = document.createElement('span');
    const text = document.createElement('span');
    text.textContent = '等待第一声“砰！”';
    entry.append(dot, text);
    eventFeed.append(entry);
  }

  function startMatch() {
    applyCanvasSize();
    if (!world) return;
    match = {
      fighters: COLORS.map(makeFighter),
      pairCooldowns: new Map(),
      effects: [],
      collisions: 0,
      wallHits: 0,
      blockHits: 0,
      paused: false,
      lastToastAt: 0,
      lastEventAt: 0,
    };
    pauseButton.disabled = false;
    pauseButton.querySelector('span').textContent = '暂停';
    pauseButton.setAttribute('aria-label', '暂停弹跳');
    matchState.className = 'match-state';
    matchState.querySelector('span').textContent = '正在玩耍';
    overlay.hidden = true;
    collisionToast.hidden = true;
    window.clearTimeout(toastTimer);
    createRoster();
    resetEventFeed();
    syncHud();
    render(performance.now());
  }

  function setMood(fighter, mood, duration = 720) {
    const now = performance.now();
    let nextMood = mood;
    if (mood === 'bump' && now - fighter.lastBumpAt < 850) nextMood = 'dizzy';
    fighter.lastBumpAt = now;
    fighter.faceMood = nextMood;
    fighter.moodUntil = now + (nextMood === 'dizzy' ? 1000 : duration);
  }

  function moodLabel(fighter, now) {
    if (fighter.faceMood !== 'idle' && now < fighter.moodUntil) {
      if (fighter.faceMood === 'wall') return '撞墙惊讶';
      if (fighter.faceMood === 'bump') return '碰到伙伴';
      if (fighter.faceMood === 'dizzy') return '晕乎乎';
    }
    return fighter.idle;
  }

  function syncHud() {
    if (!match) return;
    const now = performance.now();
    match.fighters.forEach((fighter) => {
      const chip = roster.querySelector(`[data-character="${fighter.id}"]`);
      if (!chip) return;
      const label = moodLabel(fighter, now);
      const moodElement = chip.querySelector('small');
      if (moodElement.textContent !== label) moodElement.textContent = label;
      chip.classList.toggle('is-reacting', fighter.faceMood !== 'idle' && now < fighter.moodUntil);
      chip.setAttribute('aria-label', `${fighter.name}，${label}`);
    });
    collisionCount.textContent = String(match.collisions);
    wallCount.textContent = String(match.wallHits);
    blockCount.textContent = String(match.blockHits);
  }

  function nearestWallBounds(fighter) {
    const half = fighter.size / 2;
    return {
      minX: world.border + half,
      maxX: world.width - world.border - half,
      minY: world.border + half,
      maxY: world.height - world.border - half,
    };
  }

  function keepInside(fighter, countHit) {
    const bounds = nearestWallBounds(fighter);
    let hit = false;
    let hitX = false;
    let hitY = false;

    if (fighter.x < bounds.minX) {
      fighter.x = bounds.minX;
      if (fighter.vx < 0) { fighter.vx = Math.abs(fighter.vx); hit = true; hitX = true; }
    } else if (fighter.x > bounds.maxX) {
      fighter.x = bounds.maxX;
      if (fighter.vx > 0) { fighter.vx = -Math.abs(fighter.vx); hit = true; hitX = true; }
    }
    if (fighter.y < bounds.minY) {
      fighter.y = bounds.minY;
      if (fighter.vy < 0) { fighter.vy = Math.abs(fighter.vy); hit = true; hitY = true; }
    } else if (fighter.y > bounds.maxY) {
      fighter.y = bounds.maxY;
      if (fighter.vy > 0) { fighter.vy = -Math.abs(fighter.vy); hit = true; hitY = true; }
    }

    if (hit && countHit) registerWallCollision(fighter, hitX, hitY);
  }

  function updateWalls(fighter) {
    keepInside(fighter, true);
  }

  function pairNormal(a, b, overlapX, overlapY) {
    if (overlapX < overlapY) {
      if (Math.abs(b.x - a.x) < 0.001) return (b.vx - a.vx <= 0 ? 1 : -1);
      return b.x > a.x ? 1 : -1;
    }
    if (Math.abs(b.y - a.y) < 0.001) return (b.vy - a.vy <= 0 ? 1 : -1);
    return b.y > a.y ? 1 : -1;
  }

  function resolveBlockCollisions(countHit) {
    if (!match || !world) return;
    for (let firstIndex = 0; firstIndex < match.fighters.length; firstIndex += 1) {
      const first = match.fighters[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < match.fighters.length; secondIndex += 1) {
        const second = match.fighters[secondIndex];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const overlapX = (first.size + second.size) / 2 - Math.abs(dx);
        const overlapY = (first.size + second.size) / 2 - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        const axis = overlapX < overlapY ? 'x' : 'y';
        const sign = pairNormal(first, second, overlapX, overlapY);
        const overlap = (axis === 'x' ? overlapX : overlapY) + 0.15;
        if (axis === 'x') {
          first.x -= sign * overlap * 0.5;
          second.x += sign * overlap * 0.5;
        } else {
          first.y -= sign * overlap * 0.5;
          second.y += sign * overlap * 0.5;
        }

        const relativeSpeed = axis === 'x'
          ? (second.vx - first.vx) * sign
          : (second.vy - first.vy) * sign;
        const pairKey = `${first.id}:${second.id}`;
        const canCount = countHit && (match.pairCooldowns.get(pairKey) || 0) <= 0;
        if (relativeSpeed < 0) {
          if (axis === 'x') [first.vx, second.vx] = [second.vx, first.vx];
          else [first.vy, second.vy] = [second.vy, first.vy];
          if (canCount) registerBlockCollision(first, second, pairKey);
        }

        keepInside(first, countHit);
        keepInside(second, countHit);
      }
    }
  }

  function addEvent(text, color) {
    const now = performance.now();
    if (now - match.lastEventAt < 210) return;
    match.lastEventAt = now;

    if (eventFeed.firstElementChild?.classList.contains('empty-event')) {
      eventFeed.replaceChildren();
    }
    const item = document.createElement('li');
    item.style.setProperty('--event-color', color);
    const dot = document.createElement('span');
    const message = document.createElement('span');
    message.textContent = text;
    item.append(dot, message);
    eventFeed.prepend(item);
    while (eventFeed.children.length > 4) eventFeed.lastElementChild.remove();
  }

  function showToast(message) {
    const now = performance.now();
    if (now - match.lastToastAt < 480) return;
    match.lastToastAt = now;
    collisionToast.textContent = message;
    collisionToast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      collisionToast.hidden = true;
    }, 850);
  }

  function addBurst(x, y, colors, amount = 8) {
    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 24 + Math.random() * 100;
      const life = 0.24 + Math.random() * 0.35;
      match.effects.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 3.5,
        life,
        maxLife: life,
      });
    }
  }

  function registerWallCollision(fighter, hitX, hitY) {
    match.collisions += 1;
    match.wallHits += 1;
    setMood(fighter, 'wall', 670);
    const x = hitX ? Math.max(world.border + 4, Math.min(world.width - world.border - 4, fighter.x)) : fighter.x;
    const y = hitY ? Math.max(world.border + 4, Math.min(world.height - world.border - 4, fighter.y)) : fighter.y;
    addBurst(x, y, [fighter.color, fighter.light, '#ffffff'], 7);
    addEvent(`${fighter.name} 撞到墙，弹回来啦`, fighter.color);
    showToast(`${fighter.name}：哎呀！撞墙啦`);
    syncHud();
  }

  function registerBlockCollision(first, second, pairKey) {
    match.pairCooldowns.set(pairKey, 0.25);
    match.collisions += 1;
    match.blockHits += 1;
    setMood(first, 'bump', 760);
    setMood(second, 'bump', 760);
    addBurst((first.x + second.x) / 2, (first.y + second.y) / 2, [first.color, second.color, '#ffffff'], 11);
    addEvent(`${first.name} 和 ${second.name} 砰地弹开了`, first.color);
    showToast(`BOING！${first.name} × ${second.name}`);
    syncHud();
  }

  function updateEffects(dt) {
    const remaining = [];
    match.effects.forEach((effect) => {
      effect.x += effect.vx * dt;
      effect.y += effect.vy * dt;
      effect.vx *= 0.96;
      effect.vy *= 0.96;
      effect.life -= dt;
      if (effect.life > 0) remaining.push(effect);
    });
    match.effects = remaining;
  }

  function update(dt) {
    if (!match || match.paused) return;
    match.pairCooldowns.forEach((timeLeft, key) => {
      if (timeLeft <= dt) match.pairCooldowns.delete(key);
      else match.pairCooldowns.set(key, timeLeft - dt);
    });

    const now = performance.now();
    match.fighters.forEach((fighter) => {
      fighter.x += fighter.vx * dt;
      fighter.y += fighter.vy * dt;
      fighter.angle = Math.atan2(fighter.vy, fighter.vx);
      updateWalls(fighter);

      if (fighter.faceMood !== 'idle' && now >= fighter.moodUntil) fighter.faceMood = 'idle';
      fighter.blinkIn -= dt;
      fighter.blinkLeft = Math.max(0, fighter.blinkLeft - dt);
      if (fighter.blinkIn <= 0) {
        fighter.blinkLeft = 0.13;
        fighter.blinkIn = 2.1 + Math.random() * 4.7;
      }
    });

    resolveBlockCollisions(true);
    resolveBlockCollisions(true);
    updateEffects(dt);

    if (now - lastHudTime > 120) {
      syncHud();
      lastHudTime = now;
    }
  }

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawStar(x, y, outer, inner, points = 4) {
    ctx.beginPath();
    for (let index = 0; index < points * 2; index += 1) {
      const radius = index % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + (index * Math.PI) / points;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawArena() {
    ctx.clearRect(0, 0, world.width, world.height);
    ctx.fillStyle = '#10182b';
    ctx.fillRect(0, 0, world.width, world.height);

    const glow = ctx.createLinearGradient(0, 0, world.width, world.height);
    glow.addColorStop(0, 'rgba(75, 112, 176, 0.22)');
    glow.addColorStop(0.48, 'rgba(31, 42, 71, 0.02)');
    glow.addColorStop(1, 'rgba(111, 78, 155, 0.19)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, world.width, world.height);

    const cell = world.cell;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(186, 207, 248, 0.115)';
    ctx.lineWidth = 1;
    for (let x = world.border; x <= world.width - world.border; x += cell) {
      ctx.moveTo(Math.round(x) + 0.5, world.border);
      ctx.lineTo(Math.round(x) + 0.5, world.height - world.border);
    }
    for (let y = world.border; y <= world.height - world.border; y += cell) {
      ctx.moveTo(world.border, Math.round(y) + 0.5);
      ctx.lineTo(world.width - world.border, Math.round(y) + 0.5);
    }
    ctx.stroke();

    // This luminous rectangular frame is the real, solid movement boundary.
    ctx.save();
    ctx.shadowColor = 'rgba(219, 232, 255, 0.92)';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(243, 248, 255, 0.98)';
    ctx.lineWidth = 3;
    ctx.strokeRect(world.border / 2, world.border / 2, world.width - world.border, world.height - world.border);
    ctx.restore();

    ctx.strokeStyle = 'rgba(157, 184, 232, 0.32)';
    ctx.lineWidth = 1;
    ctx.strokeRect(world.border + 5.5, world.border + 5.5, world.width - (world.border + 5.5) * 2, world.height - (world.border + 5.5) * 2);

    const mark = Math.min(13, world.cell * 0.32);
    ctx.fillStyle = 'rgba(245, 249, 255, 0.92)';
    ctx.fillRect(world.border + 1, world.border + 1, mark, 2);
    ctx.fillRect(world.border + 1, world.border + 1, 2, mark);
    ctx.fillRect(world.width - world.border - mark - 1, world.border + 1, mark, 2);
    ctx.fillRect(world.width - world.border - 3, world.border + 1, 2, mark);
    ctx.fillRect(world.border + 1, world.height - world.border - 3, mark, 2);
    ctx.fillRect(world.border + 1, world.height - world.border - mark - 1, 2, mark);
    ctx.fillRect(world.width - world.border - mark - 1, world.height - world.border - 3, mark, 2);
    ctx.fillRect(world.width - world.border - 3, world.height - world.border - mark - 1, 2, mark);
  }

  function drawBackgroundAura(fighter, time) {
    const pulse = 1 + Math.sin(time * 0.0028 + fighter.animationSeed) * 0.06;
    const radius = fighter.size * 1.65 * pulse;
    const aura = ctx.createRadialGradient(fighter.x, fighter.y, fighter.size * 0.15, fighter.x, fighter.y, radius);
    aura.addColorStop(0, fighter.glow);
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(fighter.x, fighter.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEye(x, y, width, height, pupilX = 0, pupilY = 0) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#24314b';
    ctx.beginPath();
    ctx.arc(x + pupilX, y + pupilY, Math.max(1.35, width * 0.23), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(x + pupilX - width * 0.06, y + pupilY - height * 0.08, Math.max(0.65, width * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSmile(size, crooked = false) {
    ctx.strokeStyle = '#26324b';
    ctx.lineWidth = Math.max(1.35, size * 0.045);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (crooked) {
      ctx.moveTo(-size * 0.16, size * 0.2);
      ctx.quadraticCurveTo(-size * 0.03, size * 0.28, size * 0.03, size * 0.2);
      ctx.quadraticCurveTo(size * 0.13, size * 0.12, size * 0.19, size * 0.16);
    } else {
      ctx.moveTo(-size * 0.16, size * 0.15);
      ctx.quadraticCurveTo(0, size * 0.31, size * 0.16, size * 0.15);
    }
    ctx.stroke();
  }

  function drawSurprisedFace(size, lookX, lookY) {
    const eyeY = -size * 0.12;
    const eyeDX = size * 0.17;
    const eyeW = size * 0.2;
    const eyeH = size * 0.24;
    drawEye(-eyeDX, eyeY, eyeW, eyeH, lookX * 1.8, lookY * 1.8);
    drawEye(eyeDX, eyeY, eyeW, eyeH, lookX * 1.8, lookY * 1.8);
    ctx.fillStyle = '#26324b';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.2, size * 0.08, size * 0.105, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb0a6';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.23, size * 0.035, size * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBumpedFace(size) {
    ctx.strokeStyle = '#28344c';
    ctx.lineWidth = Math.max(1.5, size * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-size * 0.28, -size * 0.1);
    ctx.lineTo(-size * 0.12, -size * 0.1);
    ctx.moveTo(size * 0.12, -size * 0.1);
    ctx.lineTo(size * 0.28, -size * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-size * 0.17, size * 0.18);
    ctx.lineTo(-size * 0.06, size * 0.12);
    ctx.lineTo(size * 0.02, size * 0.2);
    ctx.lineTo(size * 0.1, size * 0.13);
    ctx.lineTo(size * 0.18, size * 0.17);
    ctx.stroke();
  }

  function drawDizzyFace(size, time) {
    const eyeY = -size * 0.12;
    const eyeDX = size * 0.18;
    const radius = size * 0.1;
    [-eyeDX, eyeDX].forEach((x, index) => {
      ctx.strokeStyle = '#29334c';
      ctx.lineWidth = Math.max(1.1, size * 0.04);
      ctx.beginPath();
      ctx.arc(x, eyeY, radius, time * 0.006 + index, time * 0.006 + index + Math.PI * 1.45);
      ctx.stroke();
      ctx.fillStyle = '#fff1ab';
      drawStar(x + (index ? 1 : -1) * size * 0.17, eyeY - size * 0.2, size * 0.055, size * 0.025, 4);
    });
    ctx.fillStyle = '#34405a';
    ctx.beginPath();
    ctx.ellipse(size * 0.02, size * 0.2, size * 0.11, size * 0.075, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff879d';
    roundedRect(size * 0.03, size * 0.21, size * 0.105, size * 0.07, size * 0.035);
    ctx.fill();
  }

  function drawPersonalityFace(fighter, size, lookX, lookY, time) {
    const eyeY = -size * 0.12;
    const eyeDX = size * 0.17;
    const eyeW = size * 0.17;
    const eyeH = size * 0.22;
    const pupilX = lookX * size * 0.035;
    const pupilY = lookY * size * 0.035;

    if (fighter.face === 'wink') {
      ctx.strokeStyle = '#25324b';
      ctx.lineWidth = Math.max(1.5, size * 0.055);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-eyeDX - eyeW * 0.45, eyeY);
      ctx.quadraticCurveTo(-eyeDX, eyeY - size * 0.07, -eyeDX + eyeW * 0.48, eyeY + size * 0.02);
      ctx.stroke();
      drawEye(eyeDX, eyeY, eyeW, eyeH, pupilX, pupilY);
      drawSmile(size);
      return;
    }

    if (fighter.face === 'sleepy') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.ellipse(-eyeDX, eyeY, eyeW * 0.55, eyeH * 0.45, 0, Math.PI, Math.PI * 2);
      ctx.ellipse(eyeDX, eyeY, eyeW * 0.55, eyeH * 0.45, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#35415a';
      ctx.lineWidth = Math.max(1.2, size * 0.04);
      ctx.beginPath();
      ctx.moveTo(-size * 0.12, size * 0.19);
      ctx.lineTo(size * 0.12, size * 0.19);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.font = `700 ${Math.max(5, size * 0.17)}px system-ui`;
      ctx.fillText('z', size * 0.22, -size * 0.23);
      return;
    }

    if (fighter.face === 'sassy') {
      ctx.strokeStyle = '#29354d';
      ctx.lineWidth = Math.max(1.1, size * 0.04);
      ctx.beginPath();
      ctx.moveTo(-eyeDX - eyeW * 0.45, eyeY - size * 0.12);
      ctx.lineTo(-eyeDX + eyeW * 0.4, eyeY - size * 0.06);
      ctx.moveTo(eyeDX - eyeW * 0.4, eyeY - size * 0.06);
      ctx.lineTo(eyeDX + eyeW * 0.45, eyeY - size * 0.12);
      ctx.stroke();
      drawEye(-eyeDX, eyeY + size * 0.04, eyeW, eyeH * 0.85, pupilX, pupilY);
      drawEye(eyeDX, eyeY + size * 0.04, eyeW, eyeH * 0.85, pupilX, pupilY);
      drawSmile(size, true);
      return;
    }

    if (fighter.face === 'starry') {
      ctx.fillStyle = '#fff7ce';
      drawStar(-eyeDX, eyeY, size * 0.105, size * 0.05, 5);
      drawStar(eyeDX, eyeY, size * 0.105, size * 0.05, 5);
      ctx.fillStyle = '#ffffff';
      drawStar(-eyeDX - size * 0.12, eyeY - size * 0.14, size * 0.04, size * 0.02, 4);
      drawSmile(size);
      return;
    }

    if (fighter.face === 'goofy') {
      drawEye(-eyeDX - size * 0.015, eyeY, eyeW * 0.85, eyeH * 1.1, pupilX, pupilY);
      drawEye(eyeDX + size * 0.018, eyeY - size * 0.025, eyeW * 1.1, eyeH * 0.9, pupilX, pupilY);
      ctx.fillStyle = '#26324b';
      ctx.beginPath();
      ctx.ellipse(size * 0.035, size * 0.19, size * 0.115, size * 0.08, -0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff829d';
      roundedRect(size * 0.04, size * 0.2, size * 0.09, size * 0.085, size * 0.035);
      ctx.fill();
      return;
    }

    if (fighter.blinkLeft > 0) {
      ctx.strokeStyle = '#24314b';
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-eyeDX - eyeW * 0.45, eyeY);
      ctx.lineTo(-eyeDX + eyeW * 0.45, eyeY);
      ctx.moveTo(eyeDX - eyeW * 0.45, eyeY);
      ctx.lineTo(eyeDX + eyeW * 0.45, eyeY);
      ctx.stroke();
    } else {
      drawEye(-eyeDX, eyeY, eyeW, eyeH, pupilX, pupilY);
      drawEye(eyeDX, eyeY, eyeW, eyeH, pupilX, pupilY);
    }
    drawSmile(size);
    if (fighter.face === 'goofy') {
      ctx.fillStyle = '#ff829d';
      roundedRect(size * 0.04, size * 0.2, size * 0.08, size * 0.07, size * 0.03);
      ctx.fill();
    }
  }

  function drawFighter(fighter, time) {
    const size = fighter.size;
    const half = size / 2;
    const bob = Math.sin(time * 0.004 + fighter.animationSeed) * Math.min(1.6, size * 0.04);
    const visualY = fighter.y + bob;
    const lookX = Math.cos(fighter.angle);
    const lookY = Math.sin(fighter.angle);
    const mood = fighter.faceMood !== 'idle' && performance.now() < fighter.moodUntil
      ? fighter.faceMood
      : 'idle';

    drawBackgroundAura(fighter, time);

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#030817';
    roundedRect(fighter.x - half * 0.84, visualY + half * 0.61, size * 1.68, size * 0.28, size * 0.1);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(fighter.x, visualY);
    ctx.shadowColor = fighter.glow;
    ctx.shadowBlur = size * 0.65;
    const body = ctx.createLinearGradient(-half, -half, half, half);
    body.addColorStop(0, fighter.light);
    body.addColorStop(0.25, fighter.color);
    body.addColorStop(1, fighter.dark);
    ctx.fillStyle = body;
    roundedRect(-half, -half, size, size, size * 0.12);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.lineWidth = Math.max(1.8, size * 0.065);
    ctx.strokeStyle = 'rgba(255,255,255,.97)';
    roundedRect(-half + ctx.lineWidth / 2, -half + ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth, size * 0.1);
    ctx.stroke();

    ctx.globalAlpha = 0.33;
    ctx.fillStyle = '#ffffff';
    roundedRect(-half + size * 0.14, -half + size * 0.11, size * 0.33, Math.max(2, size * 0.075), size * 0.035);
    ctx.fill();
    ctx.globalAlpha = 1;

    if (mood === 'wall') drawSurprisedFace(size, lookX, lookY);
    else if (mood === 'bump') drawBumpedFace(size);
    else if (mood === 'dizzy') drawDizzyFace(size, time);
    else drawPersonalityFace(fighter, size, lookX, lookY, time);

    if (mood === 'wall') {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.font = `800 ${Math.max(7, size * 0.2)}px system-ui`;
      ctx.fillText('!', half * 0.68, -half * 0.57);
    } else if (mood === 'bump') {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.font = `800 ${Math.max(6, size * 0.16)}px system-ui`;
      ctx.fillText('✦', half * 0.7, -half * 0.55);
    }
    ctx.restore();
  }

  function drawEffects() {
    match.effects.forEach((effect) => {
      const alpha = Math.max(0, Math.min(1, effect.life / effect.maxLife));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = effect.color;
      roundedRect(effect.x - effect.size / 2, effect.y - effect.size / 2, effect.size, effect.size, effect.size * 0.18);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function render(time) {
    if (!world || !match) return;
    drawArena();
    drawEffects();
    match.fighters.forEach((fighter) => drawFighter(fighter, time));
  }

  function frame(time) {
    if (!match) return;
    const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.033) : 0;
    previousTime = time;
    update(dt);
    render(time);
    animationFrame = window.requestAnimationFrame(frame);
  }

  function setPaused(paused) {
    if (!match) return;
    match.paused = paused;
    if (paused) {
      matchState.className = 'match-state is-paused';
      matchState.querySelector('span').textContent = '休息一下';
      pauseButton.querySelector('span').textContent = '继续';
      pauseButton.setAttribute('aria-label', '继续弹跳');
      overlayTitle.textContent = '休息一下';
      overlayMessage.textContent = '点继续，看方块们接着玩。';
      overlay.hidden = false;
    } else {
      matchState.className = 'match-state';
      matchState.querySelector('span').textContent = '正在玩耍';
      pauseButton.querySelector('span').textContent = '暂停';
      pauseButton.setAttribute('aria-label', '暂停弹跳');
      overlay.hidden = true;
      previousTime = performance.now();
    }
  }

  pauseButton.addEventListener('click', () => setPaused(!match?.paused));
  restartButton.addEventListener('click', startMatch);

  function requestResize() {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      applyCanvasSize();
    });
  }

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(requestResize);
    resizeObserver.observe(arenaShell);
  } else {
    window.addEventListener('resize', requestResize);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && match && !match.paused) setPaused(true);
  });
  window.addEventListener('pagehide', () => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    if (resizeObserver) resizeObserver.disconnect();
  });

  applyCanvasSize();
  startMatch();
  previousTime = performance.now();
  animationFrame = window.requestAnimationFrame(frame);
})();
