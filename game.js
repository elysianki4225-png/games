(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const arenaShell = document.getElementById('arenaShell');
  const canvasFallback = document.getElementById('canvasFallback');
  const fallbackMessage = document.getElementById('canvasFallbackMessage');
  if (!canvas || !arenaShell || !canvas.getContext) return;

  let ctx;
  try {
    ctx = canvas.getContext('2d');
  } catch (error) {
    if (fallbackMessage) fallbackMessage.textContent = '浏览器暂不支持画布，碰碰方块在上面等你';
    return;
  }
  if (!ctx) {
    if (fallbackMessage) fallbackMessage.textContent = '浏览器暂不支持画布，碰碰方块在上面等你';
    return;
  }

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
  const obstacleHitCount = document.getElementById('obstacleHitCount');
  const eventFeed = document.getElementById('eventFeed');
  const blockCountRange = document.getElementById('blockCountRange');
  const blockCountNumber = document.getElementById('blockCountNumber');
  const blockCountOutput = document.getElementById('blockCountOutput');
  const obstacleCountRange = document.getElementById('obstacleCountRange');
  const obstacleCountNumber = document.getElementById('obstacleCountNumber');
  const obstacleCountOutput = document.getElementById('obstacleCountOutput');
  const applySettingsButton = document.getElementById('applySettingsButton');
  const defaultSettingsButton = document.getElementById('defaultSettingsButton');

  const DEFAULT_MATCH_CONFIG = Object.freeze({
    blockCount: 8,
    obstacleCount: 4,
    itemsEnabled: false,
  });
  const MATCH_LIMITS = Object.freeze({
    blockCount: Object.freeze({ min: 1, max: 48 }),
    obstacleCount: Object.freeze({ min: 0, max: 12 }),
  });
  const BORDER = 7;
  const NAMES = ['泡泡', '豆豆', '烈烈', '团子', '露露', '薄荷', '咕噜', '柚子', '跳跳', '米粒', '布丁', '云朵'];
  const PERSONALITIES = ['smile', 'goofy', 'sassy', 'sleepy', 'starry', 'wink'];
  const PERSONALITY_LABELS = {
    smile: '开心漂浮',
    goofy: '吐舌发呆',
    sassy: '酷酷巡视',
    sleepy: '困困打盹',
    starry: '星星眼',
    wink: '偷偷眨眼',
  };

  // Future item-system contract only. Items are deliberately not implemented or enabled yet.
  const ITEM_SYSTEM_API = {
    id: 'items',
    enabled: false,
    initialize(_context) {},
    update(_deltaTime, _context) {},
    render(_context) {},
    onCollision(_event, _context) {},
    dispose() {},
  };

  let world = null;
  let match = null;
  let activeConfig = DEFAULT_MATCH_CONFIG;
  let animationFrame = 0;
  let previousTime = 0;
  let lastHudTime = 0;
  let toastTimer = 0;
  let resizeFrame = 0;
  let resizeObserver = null;
  let hasRendered = false;
  let renderFailed = false;

  const requestFrame = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (callback) => window.setTimeout(() => callback(performance.now()), 16);
  const cancelFrame = typeof window.cancelAnimationFrame === 'function'
    ? window.cancelAnimationFrame.bind(window)
    : window.clearTimeout.bind(window);

  function clampInteger(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
  }

  function normalizeMatchConfig(overrides = {}, base = activeConfig || DEFAULT_MATCH_CONFIG) {
    const input = overrides && typeof overrides === 'object' ? overrides : {};
    const defaults = base && typeof base === 'object' ? base : DEFAULT_MATCH_CONFIG;
    return Object.freeze({
      blockCount: clampInteger(input.blockCount, MATCH_LIMITS.blockCount.min, MATCH_LIMITS.blockCount.max, defaults.blockCount),
      obstacleCount: clampInteger(input.obstacleCount, MATCH_LIMITS.obstacleCount.min, MATCH_LIMITS.obstacleCount.max, defaults.obstacleCount),
      // Reserving the property now keeps future saved match configs forward-compatible.
      itemsEnabled: false,
    });
  }

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
      baseBlockSize: Math.max(18, cell * 0.88),
      border: Math.max(BORDER, Math.min(9, cell * 0.16)),
      columns: Math.ceil(width / cell),
      rows: Math.ceil(height / cell),
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    };
  }

  function applyCanvasSize() {
    const width = arenaShell.clientWidth;
    const height = arenaShell.clientHeight;
    if (width < 80 || height < 120) return false;

    const oldWorld = world;
    const nextWorld = measureWorld(width, height);
    const pixelWidth = Math.max(1, Math.round(width * nextWorld.dpr));
    const pixelHeight = Math.max(1, Math.round(height * nextWorld.dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    if (typeof ctx.setTransform === 'function') ctx.setTransform(nextWorld.dpr, 0, 0, nextWorld.dpr, 0, 0);
    else ctx.scale(nextWorld.dpr, nextWorld.dpr);

    world = nextWorld;
    if (!match || !oldWorld) return true;

    const scaleX = nextWorld.width / oldWorld.width;
    const scaleY = nextWorld.height / oldWorld.height;
    match.fighters.forEach((fighter) => {
      fighter.x *= scaleX;
      fighter.y *= scaleY;
      fighter.size = blockSizeForCount(match.config.blockCount);
      keepInside(fighter, false);
    });
    match.obstacles = createObstacles(match.config.obstacleCount);
    for (let pass = 0; pass < 3; pass += 1) {
      match.fighters.forEach((fighter) => resolveObstacleCollisions(fighter, false));
      resolveBlockCollisions(false);
    }
    render(performance.now());
    return true;
  }

  function blockSizeForCount(count) {
    const densityScale = Math.max(0.54, 1 - Math.max(0, count - 12) * 0.011);
    return Math.max(14, world.baseBlockSize * densityScale);
  }

  function hslColor(hue, saturation, lightness, alpha = null) {
    const hueText = Number(hue.toFixed(2));
    if (alpha === null) return `hsl(${hueText} ${saturation}% ${lightness}%)`;
    return `hsla(${hueText} ${saturation}% ${lightness}% / ${alpha})`;
  }

  function createUniqueColors(count, randomStart = Math.random() * 360) {
    const safeCount = clampInteger(count, 1, MATCH_LIMITS.blockCount.max, DEFAULT_MATCH_CONFIG.blockCount);
    const hueStep = 360 / safeCount;
    const result = [];
    const usedHueKeys = new Set();

    for (let index = 0; index < safeCount; index += 1) {
      let hue = ((randomStart + index * hueStep) % 360 + 360) % 360;
      // Rounding collisions are unlikely at the supported counts, but keep the uniqueness invariant explicit.
      while (usedHueKeys.has(hue.toFixed(2))) hue = (hue + 0.19) % 360;
      usedHueKeys.add(hue.toFixed(2));
      const saturation = 77 + (index % 3) * 6;
      const lightness = 55 + (index % 4) * 3;
      result.push({
        color: hslColor(hue, saturation, lightness),
        light: hslColor(hue, saturation, Math.min(88, lightness + 25)),
        dark: hslColor(hue, saturation, Math.max(28, lightness - 25)),
        glow: hslColor(hue, saturation, lightness, 0.36),
        hue,
      });
    }
    return result;
  }

  function createObstacles(count) {
    const safeCount = clampInteger(count, 0, MATCH_LIMITS.obstacleCount.max, 0);
    if (!world || safeCount <= 0) return [];
    const columns = Math.max(1, Math.ceil(Math.sqrt(safeCount * (world.width / world.height))));
    const rows = Math.ceil(safeCount / columns);
    const marginX = world.width * 0.1;
    const marginY = world.height * 0.11;
    const spacingX = (world.width - marginX * 2) / (columns + 1);
    const spacingY = (world.height - marginY * 2) / (rows + 1);
    const obstacleWidth = Math.max(18, Math.min(world.cell * 1.28, spacingX * 0.58));
    const obstacleHeight = Math.max(12, Math.min(world.cell * 0.72, spacingY * 0.44));
    const obstacles = [];

    for (let index = 0; index < safeCount; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      obstacles.push({
        id: `obstacle-${index + 1}`,
        x: marginX + spacingX * (column + 1),
        y: marginY + spacingY * (row + 1),
        width: obstacleWidth,
        height: obstacleHeight,
        accent: index % 2 === 0 ? '#a9c2e8' : '#c3b4e8',
      });
    }
    return obstacles;
  }

  function obstacleOverlaps(x, y, size, obstacle, padding = 0) {
    const halfBlock = size / 2 + padding;
    return Math.abs(x - obstacle.x) < halfBlock + obstacle.width / 2
      && Math.abs(y - obstacle.y) < halfBlock + obstacle.height / 2;
  }

  function spawnPosition(size, placed) {
    const safe = world.border + size / 2 + 3;
    const minX = safe;
    const maxX = world.width - safe;
    const minY = safe;
    const maxY = world.height - safe;

    for (let attempt = 0; attempt < 1400; attempt += 1) {
      const x = minX + Math.random() * Math.max(1, maxX - minX);
      const y = minY + Math.random() * Math.max(1, maxY - minY);
      const touchesObstacle = match.obstacles.some((obstacle) => obstacleOverlaps(x, y, size, obstacle, 5));
      const touchesBlock = placed.some((other) => Math.abs(x - other.x) < (size + other.size) * 0.62
        && Math.abs(y - other.y) < (size + other.size) * 0.62);
      if (!touchesObstacle && !touchesBlock) return { x, y };
    }

    // Dense custom matches still start safely inside the field; physics separates any close neighbors.
    const columns = Math.max(1, Math.ceil(Math.sqrt(placed.length + 1)));
    const rows = Math.ceil((placed.length + 1) / columns);
    const slot = placed.length;
    return {
      x: minX + (maxX - minX) * ((slot % columns) + 0.5) / columns,
      y: minY + (maxY - minY) * (Math.floor(slot / columns) + 0.5) / rows,
    };
  }

  function createFighter(appearance, index, count, placed) {
    const size = blockSizeForCount(count);
    const position = spawnPosition(size, placed);
    const angle = Math.random() * Math.PI * 2;
    const speed = world.cell * (1.45 + Math.random() * 0.72);
    const name = NAMES[index] || `方块 ${String(index + 1).padStart(2, '0')}`;
    return {
      id: `block-${index + 1}`,
      name,
      color: appearance.color,
      light: appearance.light,
      dark: appearance.dark,
      glow: appearance.glow,
      hue: appearance.hue,
      personality: PERSONALITIES[index % PERSONALITIES.length],
      idle: PERSONALITY_LABELS[PERSONALITIES[index % PERSONALITIES.length]],
      x: position.x,
      y: position.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      angle,
      faceMood: 'idle',
      moodUntil: 0,
      lastBumpAt: -Infinity,
      blinkIn: 1.2 + Math.random() * 4.6,
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

  function startMatch(overrides = null) {
    if (overrides && typeof overrides === 'object') {
      activeConfig = normalizeMatchConfig(overrides, activeConfig);
    } else if (!activeConfig) {
      activeConfig = DEFAULT_MATCH_CONFIG;
    }
    applyCanvasSize();
    if (!world) {
      if (fallbackMessage) fallbackMessage.textContent = '竞技场还在调整大小，请稍等一下';
      return null;
    }

    const matchConfig = normalizeMatchConfig(activeConfig, DEFAULT_MATCH_CONFIG);
    activeConfig = matchConfig;
    match = {
      id: `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      config: matchConfig,
      fighters: [],
      obstacles: createObstacles(matchConfig.obstacleCount),
      pairCooldowns: new Map(),
      obstacleCooldowns: new Map(),
      effects: [],
      collisions: 0,
      wallHits: 0,
      blockHits: 0,
      obstacleHits: 0,
      paused: false,
      lastToastAt: -Infinity,
      lastEventAt: -Infinity,
    };

    const appearances = createUniqueColors(matchConfig.blockCount);
    appearances.forEach((appearance, index) => {
      const fighter = createFighter(appearance, index, matchConfig.blockCount, match.fighters);
      match.fighters.push(fighter);
    });

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
    ITEM_SYSTEM_API.initialize({ config: match.config, matchId: match.id });
    hasRendered = false;
    renderFailed = false;
    if (canvasFallback) canvasFallback.hidden = false;
    if (fallbackMessage) fallbackMessage.textContent = '碰碰场正在加载…';
    render(performance.now());
    return getMatchSnapshot();
  }

  function setMood(fighter, mood, duration = 720) {
    const now = performance.now();
    let nextMood = mood;
    if (mood === 'bump' && now - fighter.lastBumpAt < 900) nextMood = 'dizzy';
    fighter.lastBumpAt = now;
    fighter.faceMood = nextMood;
    fighter.moodUntil = now + (nextMood === 'dizzy' ? 1050 : duration);
  }

  function moodLabel(fighter, now) {
    if (fighter.faceMood !== 'idle' && now < fighter.moodUntil) {
      if (fighter.faceMood === 'wall') return '撞墙惊讶';
      if (fighter.faceMood === 'bump') return '碰到伙伴';
      if (fighter.faceMood === 'obstacle') return '撞到障碍';
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
    obstacleHitCount.textContent = String(match.obstacleHits);
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

  function registerWallCollision(fighter, hitX, hitY) {
    match.collisions += 1;
    match.wallHits += 1;
    setMood(fighter, 'wall', 680);
    const x = hitX ? Math.max(world.border + 4, Math.min(world.width - world.border - 4, fighter.x)) : fighter.x;
    const y = hitY ? Math.max(world.border + 4, Math.min(world.height - world.border - 4, fighter.y)) : fighter.y;
    addBurst(x, y, [fighter.color, fighter.light, '#ffffff'], 7);
    addEvent(`${fighter.name} 撞到边界，弹回来啦`, fighter.color);
    showToast(`${fighter.name}：哎呀！撞墙啦`);
    ITEM_SYSTEM_API.onCollision({ type: 'wall', block: fighter.id, axes: { x: hitX, y: hitY } }, match);
  }

  function obstacleOverlaps(x, y, size, obstacle, padding = 0) {
    const halfBlock = size / 2 + padding;
    return Math.abs(x - obstacle.x) < halfBlock + obstacle.width / 2
      && Math.abs(y - obstacle.y) < halfBlock + obstacle.height / 2;
  }

  function obstacleNormal(fighter, obstacle, overlapX, overlapY) {
    const dx = fighter.x - obstacle.x;
    const dy = fighter.y - obstacle.y;
    if (overlapX < overlapY) {
      if (Math.abs(dx) > 0.001) return { axis: 'x', sign: Math.sign(dx) };
      return { axis: 'x', sign: fighter.vx > 0 ? -1 : 1 };
    }
    if (Math.abs(dy) > 0.001) return { axis: 'y', sign: Math.sign(dy) };
    return { axis: 'y', sign: fighter.vy > 0 ? -1 : 1 };
  }

  function resolveObstacleCollision(fighter, obstacle, countHit) {
    const overlapX = fighter.size / 2 + obstacle.width / 2 - Math.abs(fighter.x - obstacle.x);
    const overlapY = fighter.size / 2 + obstacle.height / 2 - Math.abs(fighter.y - obstacle.y);
    if (overlapX <= 0 || overlapY <= 0) return false;

    const normal = obstacleNormal(fighter, obstacle, overlapX, overlapY);
    const incoming = normal.axis === 'x' ? fighter.vx * normal.sign < 0 : fighter.vy * normal.sign < 0;
    const overlap = (normal.axis === 'x' ? overlapX : overlapY) + 0.15;
    if (normal.axis === 'x') {
      fighter.x += normal.sign * overlap;
      if (incoming) fighter.vx = -fighter.vx;
    } else {
      fighter.y += normal.sign * overlap;
      if (incoming) fighter.vy = -fighter.vy;
    }

    const cooldownKey = `${fighter.id}:${obstacle.id}`;
    if (countHit && incoming && (match.obstacleCooldowns.get(cooldownKey) || 0) <= 0) {
      registerObstacleCollision(fighter, obstacle, cooldownKey);
    }
    keepInside(fighter, countHit);
    return true;
  }

  function resolveObstacleCollisions(fighter, countHit) {
    if (!match.obstacles.length) return;
    match.obstacles.forEach((obstacle) => resolveObstacleCollision(fighter, obstacle, countHit));
  }

  function registerObstacleCollision(fighter, obstacle, cooldownKey) {
    match.obstacleCooldowns.set(cooldownKey, 0.32);
    match.collisions += 1;
    match.obstacleHits += 1;
    setMood(fighter, 'obstacle', 760);
    addBurst(fighter.x, fighter.y, [fighter.color, obstacle.accent, '#ffffff'], 9);
    addEvent(`${fighter.name} 碰到障碍，弹开啦`, fighter.color);
    showToast(`${fighter.name}：“咚！”`);
    ITEM_SYSTEM_API.onCollision({ type: 'obstacle', block: fighter.id, obstacle: obstacle.id }, match);
  }

  function blockNormal(first, second, overlapX, overlapY) {
    if (overlapX < overlapY) {
      if (Math.abs(second.x - first.x) > 0.001) return { axis: 'x', sign: second.x > first.x ? 1 : -1 };
      return { axis: 'x', sign: second.vx - first.vx <= 0 ? 1 : -1 };
    }
    if (Math.abs(second.y - first.y) > 0.001) return { axis: 'y', sign: second.y > first.y ? 1 : -1 };
    return { axis: 'y', sign: second.vy - first.vy <= 0 ? 1 : -1 };
  }

  function resolveBlockCollisions(countHit) {
    if (!match || !world) return;
    const fighters = match.fighters;
    for (let firstIndex = 0; firstIndex < fighters.length; firstIndex += 1) {
      const first = fighters[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < fighters.length; secondIndex += 1) {
        const second = fighters[secondIndex];
        const overlapX = (first.size + second.size) / 2 - Math.abs(second.x - first.x);
        const overlapY = (first.size + second.size) / 2 - Math.abs(second.y - first.y);
        if (overlapX <= 0 || overlapY <= 0) continue;

        const normal = blockNormal(first, second, overlapX, overlapY);
        const overlap = (normal.axis === 'x' ? overlapX : overlapY) + 0.15;
        if (normal.axis === 'x') {
          first.x -= normal.sign * overlap * 0.5;
          second.x += normal.sign * overlap * 0.5;
        } else {
          first.y -= normal.sign * overlap * 0.5;
          second.y += normal.sign * overlap * 0.5;
        }

        const relativeSpeed = normal.axis === 'x'
          ? (second.vx - first.vx) * normal.sign
          : (second.vy - first.vy) * normal.sign;
        const pairKey = `${first.id}:${second.id}`;
        const canCount = countHit && (match.pairCooldowns.get(pairKey) || 0) <= 0;
        if (relativeSpeed < 0) {
          // Equal-mass square blocks exchange their velocity on the impact axis.
          if (normal.axis === 'x') [first.vx, second.vx] = [second.vx, first.vx];
          else [first.vy, second.vy] = [second.vy, first.vy];
          if (canCount) registerBlockCollision(first, second, pairKey);
        }
        keepInside(first, countHit);
        keepInside(second, countHit);
      }
    }
  }

  function registerBlockCollision(first, second, pairKey) {
    match.pairCooldowns.set(pairKey, 0.28);
    match.collisions += 1;
    match.blockHits += 1;
    setMood(first, 'bump', 760);
    setMood(second, 'bump', 760);
    addBurst((first.x + second.x) / 2, (first.y + second.y) / 2, [first.color, second.color, '#ffffff'], 11);
    addEvent(`${first.name} 和 ${second.name} 砰地弹开了`, first.color);
    showToast(`BOING！${first.name} × ${second.name}`);
    ITEM_SYSTEM_API.onCollision({ type: 'block', first: first.id, second: second.id }, match);
  }

  function addEvent(text, color) {
    const now = performance.now();
    if (now - match.lastEventAt < 190) return;
    match.lastEventAt = now;
    if (eventFeed.firstElementChild?.classList.contains('empty-event')) eventFeed.replaceChildren();

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
    if (now - match.lastToastAt < 420) return;
    match.lastToastAt = now;
    collisionToast.textContent = message;
    collisionToast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      collisionToast.hidden = true;
    }, 820);
  }

  function addBurst(x, y, colors, amount = 8) {
    if (!match) return;
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

  function decrementCooldowns(map, dt) {
    map.forEach((timeLeft, key) => {
      if (timeLeft <= dt) map.delete(key);
      else map.set(key, timeLeft - dt);
    });
  }

  function update(dt) {
    if (!match || match.paused) return;
    decrementCooldowns(match.pairCooldowns, dt);
    decrementCooldowns(match.obstacleCooldowns, dt);
    const now = performance.now();

    match.fighters.forEach((fighter) => {
      fighter.x += fighter.vx * dt;
      fighter.y += fighter.vy * dt;
      fighter.angle = Math.atan2(fighter.vy, fighter.vx);
      updateWalls(fighter);
      resolveObstacleCollisions(fighter, true);

      if (fighter.faceMood !== 'idle' && now >= fighter.moodUntil) fighter.faceMood = 'idle';
      fighter.blinkIn -= dt;
      fighter.blinkLeft = Math.max(0, fighter.blinkLeft - dt);
      if (fighter.blinkIn <= 0) {
        fighter.blinkLeft = 0.13;
        fighter.blinkIn = 2.1 + Math.random() * 4.7;
      }
    });

    for (let pass = 0; pass < 2; pass += 1) {
      resolveBlockCollisions(true);
      match.fighters.forEach((fighter) => {
        resolveObstacleCollisions(fighter, true);
        keepInside(fighter, true);
      });
    }
    updateEffects(dt);
    ITEM_SYSTEM_API.update(dt, match);

    if (now - lastHudTime > 110) {
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

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(186, 207, 248, 0.115)';
    ctx.lineWidth = 1;
    for (let x = world.border; x <= world.width - world.border; x += world.cell) {
      ctx.moveTo(Math.round(x) + 0.5, world.border);
      ctx.lineTo(Math.round(x) + 0.5, world.height - world.border);
    }
    for (let y = world.border; y <= world.height - world.border; y += world.cell) {
      ctx.moveTo(world.border, Math.round(y) + 0.5);
      ctx.lineTo(world.width - world.border, Math.round(y) + 0.5);
    }
    ctx.stroke();

    // The bright frame is both a visible arena border and the actual solid boundary.
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

  function drawObstacles(time) {
    if (!match.obstacles.length) return;
    match.obstacles.forEach((obstacle, index) => {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
      ctx.shadowBlur = 11;
      ctx.shadowOffsetY = 5;
      const surface = ctx.createLinearGradient(obstacle.x, obstacle.y - obstacle.height / 2, obstacle.x, obstacle.y + obstacle.height / 2);
      surface.addColorStop(0, '#677b9c');
      surface.addColorStop(1, '#354662');
      ctx.fillStyle = surface;
      roundedRect(obstacle.x - obstacle.width / 2, obstacle.y - obstacle.height / 2, obstacle.width, obstacle.height, obstacle.height * 0.38);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(229, 239, 255, 0.8)';
      roundedRect(obstacle.x - obstacle.width / 2 + 0.5, obstacle.y - obstacle.height / 2 + 0.5, obstacle.width - 1, obstacle.height - 1, obstacle.height * 0.35);
      ctx.stroke();
      ctx.fillStyle = obstacle.accent;
      ctx.globalAlpha = 0.7 + Math.sin(time * 0.003 + index) * 0.09;
      roundedRect(obstacle.x - obstacle.width * 0.22, obstacle.y - obstacle.height * 0.11, obstacle.width * 0.44, Math.max(2, obstacle.height * 0.11), obstacle.height * 0.055);
      ctx.fill();
      ctx.restore();
    });
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

  function drawPersonalityFace(fighter, size, lookX, lookY) {
    const eyeY = -size * 0.12;
    const eyeDX = size * 0.17;
    const eyeW = size * 0.17;
    const eyeH = size * 0.22;
    const pupilX = lookX * size * 0.035;
    const pupilY = lookY * size * 0.035;

    if (fighter.personality === 'wink') {
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

    if (fighter.personality === 'sleepy') {
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

    if (fighter.personality === 'sassy') {
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

    if (fighter.personality === 'starry') {
      ctx.fillStyle = '#fff7ce';
      drawStar(-eyeDX, eyeY, size * 0.105, size * 0.05, 5);
      drawStar(eyeDX, eyeY, size * 0.105, size * 0.05, 5);
      ctx.fillStyle = '#ffffff';
      drawStar(-eyeDX - size * 0.12, eyeY - size * 0.14, size * 0.04, size * 0.02, 4);
      drawSmile(size);
      return;
    }

    if (fighter.personality === 'goofy') {
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
    else if (mood === 'bump' || mood === 'obstacle') drawBumpedFace(size);
    else if (mood === 'dizzy') drawDizzyFace(size, time);
    else drawPersonalityFace(fighter, size, lookX, lookY);

    if (mood === 'wall' || mood === 'obstacle') {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = `800 ${Math.max(7, size * 0.2)}px system-ui`;
      ctx.fillText(mood === 'wall' ? '!' : '✦', half * 0.68, -half * 0.57);
    } else if (mood === 'bump') {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
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
    if (!world || !match || renderFailed) return;
    try {
      drawArena();
      drawObstacles(time);
      drawEffects();
      match.fighters.forEach((fighter) => drawFighter(fighter, time));
      ITEM_SYSTEM_API.render(match);
      hasRendered = true;
      if (canvasFallback) canvasFallback.hidden = true;
    } catch (error) {
      renderFailed = true;
      if (canvasFallback) canvasFallback.hidden = false;
      if (fallbackMessage) fallbackMessage.textContent = '画布显示遇到问题，方块们先在这里等一等';
      console.error('Block Bounce canvas rendering failed:', error);
    }
  }

  function frame(time) {
    if (!match) {
      applyCanvasSize();
      if (world) startMatch(activeConfig);
      if (!match) {
        animationFrame = requestFrame(frame);
        return;
      }
    }
    const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.033) : 0;
    previousTime = time;
    update(dt);
    render(time);
    animationFrame = requestFrame(frame);
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

  function addFormInputSync(range, number, output, min, max) {
    const fromRange = () => {
      number.value = range.value;
      output.value = range.value;
      output.textContent = range.value;
    };
    const fromNumber = () => {
      if (number.value === '') return;
      const value = clampInteger(number.value, min, max, Number(range.value));
      number.value = String(value);
      range.value = String(value);
      output.value = String(value);
      output.textContent = String(value);
    };
    range.addEventListener('input', fromRange);
    number.addEventListener('input', fromNumber);
    number.addEventListener('change', fromNumber);
  }

  function readFormConfig() {
    return normalizeMatchConfig({
      blockCount: blockCountNumber.value,
      obstacleCount: obstacleCountNumber.value,
    }, activeConfig);
  }

  function writeFormConfig(config) {
    blockCountRange.value = String(config.blockCount);
    blockCountNumber.value = String(config.blockCount);
    blockCountOutput.value = String(config.blockCount);
    blockCountOutput.textContent = String(config.blockCount);
    obstacleCountRange.value = String(config.obstacleCount);
    obstacleCountNumber.value = String(config.obstacleCount);
    obstacleCountOutput.value = String(config.obstacleCount);
    obstacleCountOutput.textContent = String(config.obstacleCount);
  }

  addFormInputSync(blockCountRange, blockCountNumber, blockCountOutput, MATCH_LIMITS.blockCount.min, MATCH_LIMITS.blockCount.max);
  addFormInputSync(obstacleCountRange, obstacleCountNumber, obstacleCountOutput, MATCH_LIMITS.obstacleCount.min, MATCH_LIMITS.obstacleCount.max);
  applySettingsButton.addEventListener('click', () => startMatch(readFormConfig()));
  defaultSettingsButton.addEventListener('click', () => {
    writeFormConfig(DEFAULT_MATCH_CONFIG);
    startMatch(DEFAULT_MATCH_CONFIG);
  });
  pauseButton.addEventListener('click', () => setPaused(!match?.paused));
  restartButton.addEventListener('click', () => startMatch());

  function getMatchSnapshot() {
    if (!match) return null;
    return {
      id: match.id,
      config: { ...match.config },
      counters: {
        collisions: match.collisions,
        wallHits: match.wallHits,
        blockHits: match.blockHits,
        obstacleHits: match.obstacleHits,
      },
      blocks: match.fighters.map((fighter) => ({
        id: fighter.id,
        name: fighter.name,
        color: fighter.color,
        x: fighter.x,
        y: fighter.y,
        face: fighter.faceMood,
      })),
      obstacles: match.obstacles.map((obstacle) => ({ ...obstacle })),
      paused: match.paused,
    };
  }

  const obstacleSystemAPI = Object.freeze({
    id: 'obstacles',
    create: createObstacles,
    getCurrent: () => (match ? match.obstacles.map((obstacle) => ({ ...obstacle })) : []),
  });

  window.BlockBounce = Object.freeze({
    version: '0.3.0',
    defaults: DEFAULT_MATCH_CONFIG,
    limits: MATCH_LIMITS,
    normalizeConfig: normalizeMatchConfig,
    createUniqueColors,
    startMatch: (config) => startMatch(config || null),
    getConfig: () => ({ ...activeConfig }),
    getSnapshot: getMatchSnapshot,
    systems: {
      obstacles: obstacleSystemAPI,
      items: ITEM_SYSTEM_API,
    },
  });

  function requestResize() {
    if (resizeFrame) cancelFrame(resizeFrame);
    resizeFrame = requestFrame(() => {
      resizeFrame = 0;
      applyCanvasSize();
    });
  }

  if (typeof window.ResizeObserver === 'function') {
    resizeObserver = new window.ResizeObserver(requestResize);
    resizeObserver.observe(arenaShell);
  } else {
    window.addEventListener('resize', requestResize);
  }

  window.addEventListener('error', () => {
    if (!hasRendered && canvasFallback && fallbackMessage) {
      canvasFallback.hidden = false;
      fallbackMessage.textContent = '方块们先在这里等一等，点“再来一局”重试';
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && match && !match.paused) setPaused(true);
  });
  window.addEventListener('pagehide', () => {
    if (animationFrame) cancelFrame(animationFrame);
    if (resizeObserver) resizeObserver.disconnect();
  });

  writeFormConfig(DEFAULT_MATCH_CONFIG);
  applyCanvasSize();
  startMatch(DEFAULT_MATCH_CONFIG);
  previousTime = performance.now();
  animationFrame = requestFrame(frame);
})();
