(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext('2d');
  const healthList = document.getElementById('healthList');
  const matchState = document.getElementById('matchState');
  const overlay = document.getElementById('arenaOverlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayMessage = document.getElementById('overlayMessage');
  const pauseButton = document.getElementById('pauseButton');
  const restartButton = document.getElementById('restartButton');
  const eliminationCount = document.getElementById('eliminationCount');
  const arenaSize = document.getElementById('arenaSize');
  const playerAlive = document.getElementById('playerAlive');
  const toast = document.getElementById('toast');

  const CELL = 36;
  const BORDER = 5;
  const MAX_HP = 8;
  const PLAYER_SPEED = 165;
  const BULLET_SPEED = 285;
  const palette = [
    { id: 'blue', name: '蓝色玩家', color: '#43b9ff', dark: '#167ac2', light: '#b6e8ff', glow: 'rgba(67, 185, 255, 0.34)', player: true },
    { id: 'green', name: '绿色方块', color: '#31d389', dark: '#168852', light: '#a5ffd2', glow: 'rgba(49, 211, 137, 0.31)' },
    { id: 'red', name: '红色方块', color: '#ff5a55', dark: '#b42f39', light: '#ffc1af', glow: 'rgba(255, 90, 85, 0.32)' },
    { id: 'yellow', name: '黄色方块', color: '#ffd044', dark: '#ae7922', light: '#fff0a6', glow: 'rgba(255, 208, 68, 0.32)' },
  ];

  const directions = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const keyToDirection = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
  };
  const heldDirections = new Set();

  let world = null;
  let match = null;
  let frameHandle = 0;
  let previousFrameTime = 0;
  let lastHudUpdate = 0;
  let resizeTimer = 0;
  let toastTimer = 0;
  let swipeDirection = null;
  let swipeUntil = 0;
  let pointerStart = null;

  function getArenaSpec() {
    const width = window.innerWidth || document.documentElement.clientWidth;
    if (width <= 560) return { columns: 12, rows: 12 };
    if (width <= 1040) return { columns: 18, rows: 14 };
    return { columns: 26, rows: 16 };
  }

  function createFighter(team, index, width, height) {
    const spawnPoints = [
      { x: 0.19, y: 0.22 },
      { x: 0.79, y: 0.78 },
      { x: 0.2, y: 0.78 },
      { x: 0.8, y: 0.22 },
    ];
    const spawn = spawnPoints[index];
    const size = CELL * 0.68;
    const angle = Math.random() * Math.PI * 2;
    return {
      ...team,
      x: Math.max(BORDER + size, Math.min(width - BORDER - size, width * spawn.x)),
      y: Math.max(BORDER + size, Math.min(height - BORDER - size, height * spawn.y)),
      size,
      hp: MAX_HP,
      alive: true,
      angle,
      wanderAngle: angle,
      wanderTimer: 0.3 + Math.random() * 1.2,
      fireCooldown: 0.2 + Math.random() * 0.7,
      hitFlash: 0,
      speed: 57 + Math.random() * 23,
    };
  }

  function startMatch() {
    const spec = getArenaSpec();
    const width = spec.columns * CELL;
    const height = spec.rows * CELL;
    canvas.width = width;
    canvas.height = height;
    ctx.imageSmoothingEnabled = false;

    world = { ...spec, width, height };
    match = {
      fighters: palette.map((team, index) => createFighter(team, index, width, height)),
      bullets: [],
      particles: [],
      eliminations: 0,
      paused: false,
      gameOver: false,
      outcome: '',
      elapsed: 0,
    };

    heldDirections.clear();
    swipeDirection = null;
    swipeUntil = 0;
    overlay.hidden = true;
    pauseButton.querySelector('span').textContent = '暂停';
    pauseButton.setAttribute('aria-label', '暂停游戏');
    matchState.className = 'match-state';
    matchState.querySelector('span').textContent = '进行中';
    arenaSize.textContent = `${spec.columns} × ${spec.rows}`;
    eliminationCount.textContent = '0';
    buildHealthRows();
    syncHud();
    hideToast();
  }

  function buildHealthRows() {
    healthList.replaceChildren();
    match.fighters.forEach((fighter) => {
      const row = document.createElement('div');
      row.className = 'health-row';
      row.dataset.player = fighter.id;
      row.style.setProperty('--player-color', fighter.color);

      const swatch = document.createElement('span');
      swatch.className = 'health-swatch';
      swatch.setAttribute('aria-hidden', 'true');

      const name = document.createElement('span');
      name.className = 'health-name';
      name.textContent = fighter.name;

      const hearts = document.createElement('span');
      hearts.className = 'health-hearts';
      hearts.setAttribute('aria-label', `${fighter.name}生命值`);
      for (let heartIndex = 0; heartIndex < MAX_HP; heartIndex += 1) {
        const heart = document.createElement('span');
        heart.className = 'heart';
        heart.textContent = '♥';
        heart.setAttribute('aria-hidden', 'true');
        hearts.append(heart);
      }

      row.append(swatch, name, hearts);
      healthList.append(row);
    });
  }

  function syncHud() {
    if (!match) return;
    match.fighters.forEach((fighter) => {
      const row = healthList.querySelector(`[data-player="${fighter.id}"]`);
      if (!row) return;
      row.classList.toggle('is-eliminated', !fighter.alive);
      const hearts = row.querySelectorAll('.heart');
      hearts.forEach((heart, index) => {
        heart.classList.toggle('is-empty', index >= fighter.hp);
      });
      row.querySelector('.health-hearts')?.setAttribute(
        'aria-label',
        `${fighter.name}：${fighter.hp} / ${MAX_HP} 格生命${fighter.alive ? '' : '，已淘汰'}`,
      );
    });

    const blue = match.fighters[0];
    playerAlive.textContent = blue.alive ? '存活' : '已淘汰';
    playerAlive.classList.toggle('is-down', !blue.alive);
    eliminationCount.textContent = String(match.eliminations);
  }

  function setMatchState(label, stateClass) {
    matchState.className = `match-state${stateClass ? ` ${stateClass}` : ''}`;
    matchState.querySelector('span').textContent = label;
  }

  function showOverlay(title, message) {
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    overlay.hidden = false;
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 1300);
  }

  function hideToast() {
    window.clearTimeout(toastTimer);
    toast.hidden = true;
  }

  function togglePause() {
    if (!match || match.gameOver) return;
    match.paused = !match.paused;
    if (match.paused) {
      setMatchState('已暂停', 'is-paused');
      pauseButton.querySelector('span').textContent = '继续';
      pauseButton.setAttribute('aria-label', '继续游戏');
      showOverlay('已暂停', '点击“继续”或按 P 键回到竞技场。');
      heldDirections.clear();
    } else {
      setMatchState('进行中', '');
      pauseButton.querySelector('span').textContent = '暂停';
      pauseButton.setAttribute('aria-label', '暂停游戏');
      hideOverlay();
    }
  }

  function nearestOpponent(fighter) {
    let closest = null;
    let closestDistance = Infinity;
    for (const candidate of match.fighters) {
      if (!candidate.alive || candidate.id === fighter.id) continue;
      const dx = candidate.x - fighter.x;
      const dy = candidate.y - fighter.y;
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = candidate;
      }
    }
    return closest;
  }

  function overlapsFighter(fighter, x, y) {
    const halfSize = fighter.size * 0.5;
    return match.fighters.some((other) => {
      if (!other.alive || other.id === fighter.id) return false;
      const otherHalf = other.size * 0.5;
      const gap = 1.25;
      return Math.abs(x - other.x) < halfSize + otherHalf - gap
        && Math.abs(y - other.y) < halfSize + otherHalf - gap;
    });
  }

  function canOccupy(fighter, x, y) {
    const halfSize = fighter.size * 0.5;
    const minX = BORDER + halfSize;
    const maxX = world.width - BORDER - halfSize;
    const minY = BORDER + halfSize;
    const maxY = world.height - BORDER - halfSize;
    if (x < minX || x > maxX || y < minY || y > maxY) return false;
    return !overlapsFighter(fighter, x, y);
  }

  function moveFighter(fighter, dx, dy) {
    let moved = false;
    if (dx !== 0 && canOccupy(fighter, fighter.x + dx, fighter.y)) {
      fighter.x += dx;
      moved = true;
    }
    if (dy !== 0 && canOccupy(fighter, fighter.x, fighter.y + dy)) {
      fighter.y += dy;
      moved = true;
    }
    return moved;
  }

  function readMovement() {
    let x = 0;
    let y = 0;
    heldDirections.forEach((direction) => {
      const vector = directions[direction];
      if (!vector) return;
      x += vector.x;
      y += vector.y;
    });
    if (swipeDirection && performance.now() < swipeUntil) {
      const vector = directions[swipeDirection];
      x += vector.x;
      y += vector.y;
    } else if (swipeDirection) {
      swipeDirection = null;
    }
    const length = Math.hypot(x, y);
    if (length > 0) {
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  function updatePlayer(dt) {
    const player = match.fighters[0];
    if (!player.alive) return;
    const input = readMovement();
    if (input.x || input.y) {
      player.angle = Math.atan2(input.y, input.x);
      moveFighter(player, input.x * PLAYER_SPEED * dt, input.y * PLAYER_SPEED * dt);
    }
  }

  function updateBots(dt) {
    for (let index = 1; index < match.fighters.length; index += 1) {
      const fighter = match.fighters[index];
      if (!fighter.alive) continue;

      fighter.wanderTimer -= dt;
      if (fighter.wanderTimer <= 0) {
        const target = nearestOpponent(fighter);
        const randomAngle = Math.random() * Math.PI * 2;
        if (target && Math.random() < 0.62) {
          const towardTarget = Math.atan2(target.y - fighter.y, target.x - fighter.x);
          fighter.wanderAngle = towardTarget + (Math.random() - 0.5) * 2.1;
        } else {
          fighter.wanderAngle = randomAngle;
        }
        fighter.wanderTimer = 0.75 + Math.random() * 1.5;
      }

      const dx = Math.cos(fighter.wanderAngle) * fighter.speed * dt;
      const dy = Math.sin(fighter.wanderAngle) * fighter.speed * dt;
      if (!moveFighter(fighter, dx, dy)) {
        fighter.wanderAngle += Math.PI * (0.4 + Math.random() * 0.7);
        fighter.wanderTimer = 0.15 + Math.random() * 0.35;
      }

      const target = nearestOpponent(fighter);
      if (target) fighter.angle = Math.atan2(target.y - fighter.y, target.x - fighter.x);
    }
  }

  function fireAtNearest(fighter, dt) {
    if (!fighter.alive) return;
    fighter.fireCooldown -= dt;
    if (fighter.fireCooldown > 0) return;

    const target = nearestOpponent(fighter);
    if (!target) return;
    const angle = Math.atan2(target.y - fighter.y, target.x - fighter.x);
    fighter.angle = angle;
    const startDistance = fighter.size * 0.54;
    match.bullets.push({
      x: fighter.x + Math.cos(angle) * startDistance,
      y: fighter.y + Math.sin(angle) * startDistance,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      radius: 3.1,
      ownerId: fighter.id,
      color: fighter.color,
      glow: fighter.glow,
      life: 2.5,
    });
    fighter.fireCooldown = fighter.player ? 0.8 : 0.95 + Math.random() * 0.5;
  }

  function spawnBurst(x, y, color, count = 9) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 34 + Math.random() * 115;
      match.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 0.22 + Math.random() * 0.34,
        maxLife: 0.56,
        size: 1.8 + Math.random() * 3.3,
      });
    }
  }

  function finishMatch() {
    const blue = match.fighters[0];
    const opponentsAlive = match.fighters.slice(1).some((fighter) => fighter.alive);
    if (!blue.alive) {
      match.gameOver = true;
      match.outcome = 'defeat';
      setMatchState('已淘汰', 'is-over');
      pauseButton.disabled = true;
      showOverlay('方块被淘汰了', '点击“重新开局”再试一次。');
    } else if (!opponentsAlive) {
      match.gameOver = true;
      match.outcome = 'victory';
      setMatchState('胜利', '');
      pauseButton.disabled = true;
      showOverlay('你赢下了这局！', '竞技场暂时清空，重新开局再来一场。');
    }
  }

  function damageFighter(fighter, bullet) {
    fighter.hp = Math.max(0, fighter.hp - 1);
    fighter.hitFlash = 0.2;
    spawnBurst(fighter.x, fighter.y, fighter.color, 7);
    syncHud();
    const row = healthList.querySelector(`[data-player="${fighter.id}"]`);
    if (row) {
      row.classList.remove('is-hit');
      void row.offsetWidth;
      row.classList.add('is-hit');
      window.setTimeout(() => row.classList.remove('is-hit'), 300);
    }
    if (fighter.player) showToast('被弹丸击中！注意躲避');

    if (fighter.hp <= 0 && fighter.alive) {
      fighter.alive = false;
      match.eliminations += 1;
      spawnBurst(fighter.x, fighter.y, fighter.color, 18);
      syncHud();
      if (!fighter.player && bullet.ownerId === 'blue') showToast(`${fighter.name} 被淘汰了`);
      finishMatch();
    }
  }

  function updateBullets(dt) {
    const survivors = [];
    for (const bullet of match.bullets) {
      const previousX = bullet.x;
      const previousY = bullet.y;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;

      const hit = match.fighters.find((fighter) => {
        if (!fighter.alive || fighter.id === bullet.ownerId) return false;
        const half = fighter.size * 0.5 + bullet.radius;
        return Math.abs(bullet.x - fighter.x) < half && Math.abs(bullet.y - fighter.y) < half;
      });
      if (hit) {
        damageFighter(hit, bullet);
        continue;
      }

      const insideArena = bullet.x > BORDER && bullet.x < world.width - BORDER
        && bullet.y > BORDER && bullet.y < world.height - BORDER;
      if (!insideArena || bullet.life <= 0) continue;
      bullet.previousX = previousX;
      bullet.previousY = previousY;
      survivors.push(bullet);
    }
    match.bullets = survivors;
  }

  function updateParticles(dt) {
    const remaining = [];
    for (const particle of match.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
      particle.life -= dt;
      if (particle.life > 0) remaining.push(particle);
    }
    match.particles = remaining;
  }

  function update(dt) {
    match.elapsed += dt;
    updatePlayer(dt);
    updateBots(dt);
    match.fighters.forEach((fighter) => {
      fighter.hitFlash = Math.max(0, fighter.hitFlash - dt);
      fireAtNearest(fighter, dt);
    });
    updateBullets(dt);
    updateParticles(dt);
    if (performance.now() - lastHudUpdate > 160) {
      syncHud();
      lastHudUpdate = performance.now();
    }
  }

  function drawArena() {
    ctx.fillStyle = '#090c17';
    ctx.fillRect(0, 0, world.width, world.height);

    const cellGlow = ctx.createLinearGradient(0, 0, world.width, world.height);
    cellGlow.addColorStop(0, 'rgba(49, 68, 105, 0.12)');
    cellGlow.addColorStop(0.55, 'rgba(20, 25, 43, 0.02)');
    cellGlow.addColorStop(1, 'rgba(66, 43, 92, 0.10)');
    ctx.fillStyle = cellGlow;
    ctx.fillRect(0, 0, world.width, world.height);

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(162, 181, 222, 0.105)';
    ctx.lineWidth = 1;
    for (let column = 0; column <= world.columns; column += 1) {
      const x = column * CELL + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, world.height);
    }
    for (let row = 0; row <= world.rows; row += 1) {
      const y = row * CELL + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(world.width, y);
    }
    ctx.stroke();

    // The bright rectangular frame is also the actual movement boundary.
    ctx.save();
    ctx.shadowColor = 'rgba(230, 238, 255, 0.9)';
    ctx.shadowBlur = 13;
    ctx.strokeStyle = 'rgba(242, 246, 255, 0.94)';
    ctx.lineWidth = 3;
    ctx.strokeRect(BORDER / 2, BORDER / 2, world.width - BORDER, world.height - BORDER);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.lineWidth = 1;
    ctx.strokeRect(BORDER + 4.5, BORDER + 4.5, world.width - (BORDER + 4.5) * 2, world.height - (BORDER + 4.5) * 2);
    ctx.restore();

    // Small corner marks make the rectangular arena edge easy to read.
    const mark = Math.min(12, CELL * 0.33);
    ctx.fillStyle = 'rgba(238, 244, 255, 0.92)';
    ctx.fillRect(BORDER + 1, BORDER + 1, mark, 2);
    ctx.fillRect(BORDER + 1, BORDER + 1, 2, mark);
    ctx.fillRect(world.width - BORDER - mark - 1, BORDER + 1, mark, 2);
    ctx.fillRect(world.width - BORDER - 3, BORDER + 1, 2, mark);
    ctx.fillRect(BORDER + 1, world.height - BORDER - 3, mark, 2);
    ctx.fillRect(BORDER + 1, world.height - BORDER - mark - 1, 2, mark);
    ctx.fillRect(world.width - BORDER - mark - 1, world.height - BORDER - 3, mark, 2);
    ctx.fillRect(world.width - BORDER - 3, world.height - BORDER - mark - 1, 2, mark);
  }

  function drawBullet(bullet) {
    const fromX = bullet.previousX ?? bullet.x - bullet.vx * 0.035;
    const fromY = bullet.previousY ?? bullet.y - bullet.vy * 0.035;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = bullet.glow;
    ctx.lineWidth = bullet.radius * 3.5;
    ctx.shadowColor = bullet.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.strokeStyle = bullet.color;
    ctx.lineWidth = bullet.radius * 1.15;
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.fillStyle = '#fff8e8';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFighter(fighter, time) {
    if (!fighter.alive) return;
    const size = fighter.size;
    const half = size / 2;
    const bob = Math.sin(time * 0.008 + fighter.x * 0.015) * 0.65;
    const aimX = Math.cos(fighter.angle);
    const aimY = Math.sin(fighter.angle);

    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = '#000';
    ctx.fillRect(fighter.x - half * 0.68, fighter.y + half * 0.57, size * 1.36, size * 0.22);
    ctx.restore();

    // A tiny blocky blaster follows the fighter's facing direction.
    ctx.save();
    ctx.translate(fighter.x, fighter.y + bob);
    ctx.rotate(fighter.angle);
    ctx.fillStyle = '#222a38';
    ctx.fillRect(size * 0.14, -size * 0.16, size * 0.72, size * 0.32);
    ctx.fillStyle = '#7d899b';
    ctx.fillRect(size * 0.49, -size * 0.105, size * 0.4, size * 0.21);
    ctx.fillStyle = fighter.light;
    ctx.fillRect(size * 0.77, -size * 0.065, size * 0.18, size * 0.13);
    ctx.restore();

    ctx.save();
    ctx.translate(fighter.x, fighter.y + bob);
    ctx.shadowColor = fighter.glow;
    ctx.shadowBlur = 22;
    ctx.fillStyle = fighter.color;
    ctx.fillRect(-half, -half, size, size);
    ctx.shadowBlur = 0;

    ctx.lineWidth = Math.max(1.6, size * 0.075);
    ctx.strokeStyle = '#f4f7ff';
    ctx.strokeRect(-half + ctx.lineWidth / 2, -half + ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);

    // Tiny square highlights keep each character readable as a little block person.
    ctx.fillStyle = fighter.light;
    ctx.globalAlpha = 0.66;
    ctx.fillRect(-half + 3, -half + 3, size * 0.28, Math.max(2, size * 0.07));
    ctx.globalAlpha = 1;
    ctx.fillStyle = fighter.dark;
    ctx.fillRect(-half + 2, half - size * 0.2, size - 4, size * 0.17);

    const eyeWidth = Math.max(3, size * 0.19);
    const eyeHeight = Math.max(4, size * 0.23);
    const eyeY = -size * 0.14;
    const eyeGap = size * 0.12;
    const eyeLeft = -eyeGap / 2 - eyeWidth;
    const eyeRight = eyeGap / 2;
    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(eyeLeft, eyeY, eyeWidth, eyeHeight);
    ctx.fillRect(eyeRight, eyeY, eyeWidth, eyeHeight);
    ctx.fillStyle = '#101522';
    const pupilShiftX = Math.max(-1.2, Math.min(1.2, aimX * 1.4));
    const pupilShiftY = Math.max(-1, Math.min(1, aimY * 1.1));
    const pupilSize = Math.max(2, size * 0.09);
    ctx.fillRect(eyeLeft + eyeWidth * 0.53 + pupilShiftX, eyeY + eyeHeight * 0.42 + pupilShiftY, pupilSize, pupilSize);
    ctx.fillRect(eyeRight + eyeWidth * 0.53 + pupilShiftX, eyeY + eyeHeight * 0.42 + pupilShiftY, pupilSize, pupilSize);
    ctx.fillStyle = '#19202b';
    ctx.fillRect(-size * 0.09, size * 0.2, size * 0.18, Math.max(1.5, size * 0.06));

    if (fighter.hitFlash > 0) {
      ctx.globalAlpha = Math.min(0.72, fighter.hitFlash * 3.5);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-half, -half, size, size);
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const particle of match.particles) {
      const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
  }

  function render(time) {
    if (!world || !match) return;
    drawArena();
    match.bullets.forEach(drawBullet);
    drawParticles();
    match.fighters.forEach((fighter) => drawFighter(fighter, time));
  }

  function frame(time) {
    if (!match) return;
    const dt = previousFrameTime ? Math.min((time - previousFrameTime) / 1000, 0.04) : 0;
    previousFrameTime = time;
    if (!match.paused && !match.gameOver) update(dt);
    render(time);
    frameHandle = window.requestAnimationFrame(frame);
  }

  function setDirection(direction, isPressed) {
    if (!directions[direction]) return;
    if (isPressed) heldDirections.add(direction);
    else heldDirections.delete(direction);
  }

  window.addEventListener('keydown', (event) => {
    const direction = keyToDirection[event.key];
    if (direction) {
      event.preventDefault();
      if (!event.repeat) setDirection(direction, true);
      return;
    }
    if ((event.key === 'p' || event.key === 'P' || event.key === 'Escape') && !event.repeat) {
      event.preventDefault();
      togglePause();
    }
  });

  window.addEventListener('keyup', (event) => {
    const direction = keyToDirection[event.key];
    if (direction) setDirection(direction, false);
  });

  window.addEventListener('blur', () => heldDirections.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && match && !match.paused && !match.gameOver) togglePause();
  });

  document.querySelectorAll('.mobile-controls [data-direction]').forEach((button) => {
    const direction = button.dataset.direction;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.classList.add('is-pressed');
      setDirection(direction, true);
      try {
        button.setPointerCapture(event.pointerId);
      } catch (_) {
        // Pointer capture is not required for keyboard or older touch browsers.
      }
    });
    const release = (event) => {
      if (event) event.preventDefault();
      button.classList.remove('is-pressed');
      setDirection(direction, false);
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('click', (event) => {
      // Enter/Space activation is a brief directional press for accessibility.
      if (event.detail === 0) {
        swipeDirection = direction;
        swipeUntil = performance.now() + 260;
      }
    });
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (_) {
      // The swipe control still works on browsers without pointer capture.
    }
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 18) return;
    swipeDirection = Math.abs(deltaX) > Math.abs(deltaY)
      ? (deltaX > 0 ? 'right' : 'left')
      : (deltaY > 0 ? 'down' : 'up');
    swipeUntil = performance.now() + 270;
  });

  canvas.addEventListener('pointercancel', () => { pointerStart = null; });
  pauseButton.addEventListener('click', togglePause);
  restartButton.addEventListener('click', () => {
    pauseButton.disabled = false;
    startMatch();
  });

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const spec = getArenaSpec();
      if (!world || spec.columns !== world.columns || spec.rows !== world.rows) {
        pauseButton.disabled = false;
        startMatch();
      }
    }, 180);
  });

  startMatch();
  previousFrameTime = performance.now();
  frameHandle = window.requestAnimationFrame(frame);

  window.addEventListener('pagehide', () => {
    if (frameHandle) window.cancelAnimationFrame(frameHandle);
  });
})();
