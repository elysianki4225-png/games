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
  const aliveCount = document.getElementById('aliveCount');
  const itemStatus = document.getElementById('itemStatus');
  const eventFeed = document.getElementById('eventFeed');
  const blockCountRange = document.getElementById('blockCountRange');
  const blockCountNumber = document.getElementById('blockCountNumber');
  const blockCountOutput = document.getElementById('blockCountOutput');
  const blockHealthRange = document.getElementById('blockHealthRange');
  const blockHealthNumber = document.getElementById('blockHealthNumber');
  const blockHealthOutput = document.getElementById('blockHealthOutput');
  const moveSpeedRange = document.getElementById('moveSpeedRange');
  const moveSpeedNumber = document.getElementById('moveSpeedNumber');
  const moveSpeedOutput = document.getElementById('moveSpeedOutput');
  const obstacleCountRange = document.getElementById('obstacleCountRange');
  const obstacleCountNumber = document.getElementById('obstacleCountNumber');
  const obstacleCountOutput = document.getElementById('obstacleCountOutput');
  const applySettingsButton = document.getElementById('applySettingsButton');
  const defaultSettingsButton = document.getElementById('defaultSettingsButton');
  const mapTypeSelect = document.getElementById('mapTypeSelect');
  const mapDescription = document.getElementById('mapDescription');
  const obstacleControl = document.querySelector('.obstacle-control');
  const collisionAccelerationToggle = document.getElementById('collisionAccelerationToggle');

  // Per-60fps-tick surface drag; the ice map's very low value preserves long slides.
  const MAP_DEFINITIONS = Object.freeze({
    empty: {
      label: '空白竞技场', status: '空白场 · 玩耍', description: '纯网格空场，没有障碍物，适合观察弹跳。',
      base: '#10182b', glowA: 'rgba(75, 112, 176, 0.22)', glowB: 'rgba(111, 78, 155, 0.19)',
      grid: 'rgba(186, 207, 248, 0.115)', borderGlow: 'rgba(219, 232, 255, 0.92)',
      friction: 0.00025, obstacleKinds: [], defaultObstacleCount: 0, radiationPits: 0,
    },
    forest: {
      label: '森林', status: '森林 · 弹跳中', description: '林地里分布着树木和岩石，它们会挡住方块并让它们弹开。',
      base: '#10251f', glowA: 'rgba(57, 138, 93, 0.26)', glowB: 'rgba(33, 89, 63, 0.2)',
      grid: 'rgba(173, 235, 190, 0.12)', borderGlow: 'rgba(203, 255, 215, 0.9)',
      friction: 0.00045, obstacleKinds: ['tree', 'rock'], defaultObstacleCount: 4, radiationPits: 0,
    },
    desert: {
      label: '沙漠', status: '沙漠 · 弹跳中', description: '暖色沙地，仙人掌可以撞坏；接触时每秒最多扣 2 HP。',
      base: '#352516', glowA: 'rgba(222, 156, 62, 0.22)', glowB: 'rgba(154, 89, 34, 0.2)',
      grid: 'rgba(255, 223, 162, 0.13)', borderGlow: 'rgba(255, 236, 198, 0.94)',
      friction: 0.00035, obstacleKinds: ['cactus'], defaultObstacleCount: 4, radiationPits: 0,
    },
    ice: {
      label: '冰原', status: '冰原 · 滑行中', description: '整片海面都是冰，摩擦很小，碰撞后会滑得更远。',
      base: '#102a3a', glowA: 'rgba(76, 185, 228, 0.24)', glowB: 'rgba(88, 134, 203, 0.18)',
      grid: 'rgba(206, 244, 255, 0.16)', borderGlow: 'rgba(221, 250, 255, 0.98)',
      friction: 0.000025, obstacleKinds: [], defaultObstacleCount: 0, radiationPits: 0,
    },
    nuclear: {
      label: '核辐射区', status: '辐射区 · 弹跳中', description: '树木与荧光辐射坑；坑内每秒扣 2 HP，移速减半。',
      base: '#14251b', glowA: 'rgba(150, 211, 64, 0.22)', glowB: 'rgba(60, 122, 47, 0.19)',
      grid: 'rgba(210, 255, 131, 0.14)', borderGlow: 'rgba(231, 255, 180, 0.92)',
      friction: 0.00045, obstacleKinds: ['tree'], defaultObstacleCount: 4, radiationPits: 5,
    },
  });

  const DEFAULT_MATCH_CONFIG = Object.freeze({
    blockCount: 8,
    blockHealth: 1000,
    obstacleCount: 0,
    mapType: 'empty',
    collisionAcceleration: false,
    speedMultiplier: 1.0,
    itemsEnabled: true,
  });
  const MATCH_LIMITS = Object.freeze({
    blockCount: Object.freeze({ min: 1, max: 48 }),
    blockHealth: Object.freeze({ min: 1, max: 10000 }),
    obstacleCount: Object.freeze({ min: 0, max: 12 }),
    speedMultiplier: Object.freeze({ min: 0.5, max: 3, step: 0.1 }),
  });
  const ITEM_RULES = Object.freeze({
    maxOnField: 2,
    globalUseCooldown: 6,
    knifeDamage: 5,
    pistolDamage: 10,
    shotgunPelletDamage: 10,
    sniperDamage: 20,
    shieldHealth: 50,
    laserDamagePerFrame: 2,
    laserDuration: 2,
    laserWidthCells: 0.28,
    laserAimCellsPerSecond: 30,
    zombieCount: 3,
    zombieHealth: 50,
    zombieHealthDrain: 1,
    zombieHealthDrainInterval: 1,
    zombieContactDamage: 5,
    zombieContactInterval: 1,
    priestHealth: 50,
    priestAttackCount: 10,
    priestAttackInterval: 2,
    priestDamage: 10,
    lightningEffectDuration: 0.34,
    adrenalineDuration: 5,
    adrenalineSpeedMultiplier: 1.75,
    adrenalineDamageReduction: 0.5,
    iceShooterDuration: 3,
    iceShotInterval: 0.5,
    iceDamage: 10,
    iceSlowFactor: 0.5,
    iceSlowDuration: 2,
    icePeaCellsPerSecond: 12,
    refillInterval: 6,
    c4Damage: 20,
    c4RadiusCells: 2,
    c4FuseSeconds: 5,
    flamethrowerDamagePerSecond: 2,
    flamethrowerDuration: 5,
    flamethrowerRangeCells: 3.6,
    flamethrowerHalfAngle: 0.34,
    shotgunPellets: 3,
    mediumBulletCellsPerSecond: 7,
    sniperBulletCellsPerSecond: 18,
    projectileLifetime: 5,
  });
  const ITEM_DEFINITIONS = Object.freeze({
    knife: Object.freeze({ name: '刀', shortName: '刀', icon: '⚔', color: '#ff7184', group: 'contact' }),
    pistol: Object.freeze({ name: '手枪', shortName: '手枪', icon: '●', color: '#6ec7ff', group: 'ranged' }),
    shotgun: Object.freeze({ name: '霰弹枪', shortName: '霰弹', icon: '✹', color: '#ffd166', group: 'ranged' }),
    sniper: Object.freeze({ name: '狙击枪', shortName: '狙击', icon: '◎', color: '#b69aff', group: 'ranged' }),
    flamethrower: Object.freeze({ name: '喷火器', shortName: '喷火', icon: '♨', color: '#ff895f', group: 'ranged' }),
    c4: Object.freeze({ name: 'C4', shortName: 'C4', icon: 'C4', color: '#67d6a9', group: 'contact' }),
    shield: Object.freeze({ name: '盾牌', shortName: '盾', icon: '⬟', color: '#69d4ff', group: 'passive' }),
    laser: Object.freeze({ name: '激光枪', shortName: '激光', icon: '⚡', color: '#bd8bff', group: 'ranged' }),
    wand: Object.freeze({ name: '召唤法杖', shortName: '法杖', icon: '✦', color: '#a789ff', group: 'ranged' }),
    holyStaff: Object.freeze({ name: '神圣法杖', shortName: '圣杖', icon: '✛', color: '#f4d477', group: 'ranged' }),
    adrenaline: Object.freeze({ name: '肾上腺素', shortName: '肾上腺素', icon: '⚡', color: '#ff745e', group: 'ranged' }),
    iceShooter: Object.freeze({ name: '寒冰射手', shortName: '寒冰', icon: '❄', color: '#7de5ff', group: 'ranged' }),
  });
  const ITEM_TYPES = Object.keys(ITEM_DEFINITIONS);
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

  const ITEM_SYSTEM_API = {
    id: 'items',
    enabled: true,
    initialize: initializeItemSystem,
    update: updateItemSystem,
    render: renderItemSystem,
    onCollision: handleItemCollision,
    dispose: disposeItemSystem,
    getCurrent: getItemSystemSnapshot,
  };

  let world = null;
  let match = null;
  let activeConfig = DEFAULT_MATCH_CONFIG;
  let formMapType = DEFAULT_MATCH_CONFIG.mapType;
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

  function clampDecimal(value, min, max, fallback, precision = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const factor = 10 ** precision;
    return Math.round(Math.max(min, Math.min(max, parsed)) * factor) / factor;
  }

  function normalizeMatchConfig(overrides = {}, base = activeConfig || DEFAULT_MATCH_CONFIG) {
    const input = overrides && typeof overrides === 'object' ? overrides : {};
    const defaults = base && typeof base === 'object' ? base : DEFAULT_MATCH_CONFIG;
    const fallbackMapType = Object.hasOwn(MAP_DEFINITIONS, defaults.mapType) ? defaults.mapType : DEFAULT_MATCH_CONFIG.mapType;
    const mapType = Object.hasOwn(MAP_DEFINITIONS, input.mapType) ? input.mapType : fallbackMapType;
    const map = MAP_DEFINITIONS[mapType];
    let obstacleFallback = defaults.obstacleCount;
    if (input.mapType !== undefined && mapType !== defaults.mapType && input.obstacleCount === undefined) {
      obstacleFallback = map.defaultObstacleCount;
    }
    const obstacleCount = map.obstacleKinds.length
      ? clampInteger(input.obstacleCount, MATCH_LIMITS.obstacleCount.min, MATCH_LIMITS.obstacleCount.max, obstacleFallback)
      : 0;
    const fallbackBlockHealth = clampInteger(
      defaults.blockHealth,
      MATCH_LIMITS.blockHealth.min,
      MATCH_LIMITS.blockHealth.max,
      DEFAULT_MATCH_CONFIG.blockHealth,
    );
    const fallbackSpeedMultiplier = clampDecimal(
      defaults.speedMultiplier,
      MATCH_LIMITS.speedMultiplier.min,
      MATCH_LIMITS.speedMultiplier.max,
      DEFAULT_MATCH_CONFIG.speedMultiplier,
    );
    return Object.freeze({
      blockCount: clampInteger(input.blockCount, MATCH_LIMITS.blockCount.min, MATCH_LIMITS.blockCount.max, defaults.blockCount),
      blockHealth: clampInteger(input.blockHealth, MATCH_LIMITS.blockHealth.min, MATCH_LIMITS.blockHealth.max, fallbackBlockHealth),
      obstacleCount,
      mapType,
      collisionAcceleration: typeof input.collisionAcceleration === 'boolean'
        ? input.collisionAcceleration
        : Boolean(defaults.collisionAcceleration),
      speedMultiplier: clampDecimal(
        input.speedMultiplier,
        MATCH_LIMITS.speedMultiplier.min,
        MATCH_LIMITS.speedMultiplier.max,
        fallbackSpeedMultiplier,
      ),
      itemsEnabled: true,
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
    rebuildObstaclesForResize();
    match.radiationPits = createRadiationPits(match.config.mapType);
    for (let pass = 0; pass < 3; pass += 1) {
      match.fighters.forEach((fighter) => {
        if (!fighter.eliminated) resolveObstacleCollisions(fighter, false);
      });
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

  function createObstacles(count, mapType = activeConfig.mapType) {
    const safeCount = clampInteger(count, 0, MATCH_LIMITS.obstacleCount.max, 0);
    const map = Object.hasOwn(MAP_DEFINITIONS, mapType) ? MAP_DEFINITIONS[mapType] : MAP_DEFINITIONS.empty;
    if (!world || safeCount <= 0 || map.obstacleKinds.length === 0) return [];
    const columns = Math.max(1, Math.ceil(Math.sqrt(safeCount * (world.width / world.height))));
    const rows = Math.ceil(safeCount / columns);
    const marginX = world.width * 0.1;
    const marginY = world.height * 0.11;
    const spacingX = (world.width - marginX * 2) / (columns + 1);
    const spacingY = (world.height - marginY * 2) / (rows + 1);
    const obstacles = [];

    for (let index = 0; index < safeCount; index += 1) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const kind = map.obstacleKinds[index % map.obstacleKinds.length];
      const durability = { tree: 100, rock: 1000, cactus: 100 }[kind] || 100;
      const sizeByKind = {
        tree: { width: world.cell * 0.96, height: world.cell * 0.94 },
        rock: { width: world.cell * 0.92, height: world.cell * 0.68 },
        cactus: { width: world.cell * 0.62, height: world.cell * 1.18 },
      }[kind] || { width: world.cell, height: world.cell * 0.75 };
      obstacles.push({
        id: `obstacle-${index + 1}`,
        kind,
        x: marginX + spacingX * (column + 1),
        y: marginY + spacingY * (row + 1),
        width: Math.max(15, Math.min(sizeByKind.width, spacingX * 0.58)),
        height: Math.max(13, Math.min(sizeByKind.height, spacingY * 0.45)),
        accent: mapType === 'nuclear' ? '#a9e658' : (kind === 'cactus' ? '#87d57a' : '#a9c2e8'),
        health: durability,
        maxHealth: durability,
        variant: index % 3,
      });
    }
    return obstacles;
  }

  function rebuildObstaclesForResize() {
    if (!match) return;
    const previousById = new Map(match.obstacles.map((obstacle) => [obstacle.id, obstacle]));
    match.obstacles = createObstacles(match.config.obstacleCount, match.config.mapType)
      .filter((obstacle) => !match.destroyedObstacleIds.has(obstacle.id))
      .map((obstacle) => {
        const previous = previousById.get(obstacle.id);
        if (previous) obstacle.health = previous.health;
        return obstacle;
      });
  }

  function createRadiationPits(mapType = activeConfig.mapType) {
    if (!world || mapType !== 'nuclear') return [];
    const points = [
      [0.22, 0.27], [0.5, 0.22], [0.78, 0.3], [0.31, 0.57],
      [0.69, 0.58], [0.48, 0.82], [0.82, 0.8],
    ];
    return points.slice(0, MAP_DEFINITIONS.nuclear.radiationPits).map(([px, py], index) => ({
      id: `radiation-pit-${index + 1}`,
      x: world.width * px,
      y: world.height * py,
      width: world.cell * 2.05,
      height: world.cell * 1.38,
      phase: index * 1.17,
    }));
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
      const touchesRadiation = match.radiationPits.some((pit) => obstacleOverlaps(x, y, size, pit, 0));
      const touchesBlock = placed.some((other) => Math.abs(x - other.x) < (size + other.size) * 0.62
        && Math.abs(y - other.y) < (size + other.size) * 0.62);
      if (!touchesObstacle && !touchesRadiation && !touchesBlock) return { x, y };
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
    const speed = world.cell * (1.45 + Math.random() * 0.72) * match.config.speedMultiplier;
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
      previousX: position.x,
      previousY: position.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      maxHealth: match.config.blockHealth,
      health: match.config.blockHealth,
      eliminated: false,
      radiationTimers: new Map(),
      heldItems: [],
      shield: null,
      isZombie: false,
      isPriest: false,
      summonerId: null,
      zombieHealthDrainRemaining: 0,
      zombieContactCooldown: 0,
      priestAttacksRemaining: 0,
      priestAttackCooldown: 0,
      adrenalineRemaining: 0,
      slowRemaining: 0,
      slowFactor: 1,
      damageNumber: null,
      lastDamage: 0,
      angle,
      faceMood: 'idle',
      moodUntil: 0,
      lastBumpAt: -Infinity,
      blinkIn: 1.2 + Math.random() * 4.6,
      blinkLeft: 0,
      animationSeed: Math.random() * Math.PI * 2,
    };
  }

  function createZombie(summoner, index) {
    const hue = summoner.hue;
    const appearance = {
      color: hslColor(hue, 82, 28),
      light: hslColor(hue, 78, 41),
      dark: hslColor(hue, 86, 16),
      glow: hslColor(hue, 90, 39, 0.32),
      hue,
    };
    const zombie = createFighter(appearance, match.fighters.length, match.config.blockCount, match.fighters);
    const spawnAngle = summoner.angle + index * Math.PI * 2 / ITEM_RULES.zombieCount;
    const bounds = nearestWallBounds(zombie);
    const distance = summoner.size * 0.9;
    zombie.id = `zombie-${match.nextZombieId++}`;
    zombie.name = `${summoner.name} 僵尸${index + 1}`;
    zombie.isZombie = true;
    zombie.summonerId = summoner.id;
    zombie.idle = '随机游荡';
    zombie.maxHealth = ITEM_RULES.zombieHealth;
    zombie.health = ITEM_RULES.zombieHealth;
    zombie.zombieHealthDrainRemaining = ITEM_RULES.zombieHealthDrainInterval;
    zombie.x = Math.max(bounds.minX, Math.min(bounds.maxX, summoner.x + Math.cos(spawnAngle) * distance));
    zombie.y = Math.max(bounds.minY, Math.min(bounds.maxY, summoner.y + Math.sin(spawnAngle) * distance));
    zombie.previousX = zombie.x;
    zombie.previousY = zombie.y;
    return zombie;
  }

  function createPriest(summoner) {
    const hue = summoner.hue;
    const appearance = {
      color: hslColor(hue, 54, 88),
      light: hslColor(hue, 48, 96),
      dark: hslColor(hue, 48, 73),
      glow: hslColor(hue, 75, 86, 0.4),
      hue,
    };
    const priest = createFighter(appearance, match.fighters.length, match.config.blockCount, match.fighters);
    const spawnAngle = summoner.angle + Math.PI / 2;
    const bounds = nearestWallBounds(priest);
    const distance = summoner.size * 0.95;
    priest.id = `priest-${match.nextPriestId++}`;
    priest.name = `${summoner.name} 神父`;
    priest.isPriest = true;
    priest.summonerId = summoner.id;
    priest.idle = '圣光守护';
    priest.maxHealth = ITEM_RULES.priestHealth;
    priest.health = ITEM_RULES.priestHealth;
    priest.priestAttacksRemaining = ITEM_RULES.priestAttackCount;
    priest.priestAttackCooldown = ITEM_RULES.priestAttackInterval;
    priest.x = Math.max(bounds.minX, Math.min(bounds.maxX, summoner.x + Math.cos(spawnAngle) * distance));
    priest.y = Math.max(bounds.minY, Math.min(bounds.maxY, summoner.y + Math.sin(spawnAngle) * distance));
    priest.previousX = priest.x;
    priest.previousY = priest.y;
    return priest;
  }

  function createRosterChip(fighter) {
    const chip = document.createElement('div');
    chip.className = 'roster-chip';
    chip.dataset.character = fighter.id;
    chip.style.setProperty('--character-color', fighter.color);
    chip.classList.toggle('is-zombie', Boolean(fighter.isZombie));
    chip.classList.toggle('is-priest', Boolean(fighter.isPriest));
    chip.setAttribute('aria-label', `${fighter.name}，${fighter.idle}，${fighter.health} HP`);

    const swatch = document.createElement('span');
    swatch.className = 'roster-swatch';
    swatch.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    copy.className = 'roster-copy';
    const name = document.createElement('strong');
    name.textContent = fighter.name;
    const mood = document.createElement('small');
    mood.className = 'roster-mood';
    mood.textContent = fighter.idle;
    const healthRow = document.createElement('span');
    healthRow.className = 'roster-health-row';
    const healthValue = document.createElement('small');
    healthValue.className = 'roster-health-value';
    healthValue.textContent = `${fighter.health} HP`;
    const healthTrack = document.createElement('span');
    healthTrack.className = 'roster-health-track';
    const healthFill = document.createElement('i');
    healthFill.className = 'roster-health-fill';
    healthTrack.append(healthFill);
    healthRow.append(healthValue, healthTrack);
    const heldItems = document.createElement('small');
    heldItems.className = 'roster-items';
    heldItems.textContent = '手持 —';
    const shieldStatus = document.createElement('small');
    shieldStatus.className = 'roster-shield';
    shieldStatus.textContent = '护盾 —';
    copy.append(name, mood, healthRow, heldItems, shieldStatus);
    chip.append(swatch, copy);
    roster.append(chip);
    return chip;
  }

  function createRoster() {
    roster.replaceChildren();
    match.fighters.forEach(createRosterChip);
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
      obstacles: createObstacles(matchConfig.obstacleCount, matchConfig.mapType),
      radiationPits: createRadiationPits(matchConfig.mapType),
      destroyedObstacleIds: new Set(),
      pairCooldowns: new Map(),
      obstacleCooldowns: new Map(),
      cactusDamageCooldowns: new Map(),
      effects: [],
      collisions: 0,
      wallHits: 0,
      blockHits: 0,
      obstacleHits: 0,
      obstaclesDestroyed: 0,
      eliminations: 0,
      items: [],
      projectiles: [],
      flames: [],
      lasers: [],
      iceShooters: [],
      c4Charges: [],
      itemEffects: [],
      hostilityScores: new Map(),
      simulationTime: 0,
      nextItemId: 1,
      nextZombieId: 1,
      nextPriestId: 1,
      nextIceShooterId: 1,
      itemSpawnCooldown: 0,
      itemUseReadyAt: 0,
      itemUses: 0,
      projectileHits: 0,
      laserHits: 0,
      c4Detonations: 0,
      paused: false,
      ended: false,
      lastToastAt: -Infinity,
      lastEventAt: -Infinity,
    };

    const appearances = createUniqueColors(matchConfig.blockCount);
    appearances.forEach((appearance, index) => {
      const fighter = createFighter(appearance, index, matchConfig.blockCount, match.fighters);
      match.fighters.push(fighter);
    });

    writeFormConfig(matchConfig);
    pauseButton.disabled = false;
    pauseButton.querySelector('span').textContent = '暂停';
    pauseButton.setAttribute('aria-label', '暂停弹跳');
    matchState.className = 'match-state';
    matchState.querySelector('span').textContent = MAP_DEFINITIONS[matchConfig.mapType].status;
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
    if (fighter.eliminated) return '淘汰';
    if (fighter.faceMood !== 'idle' && now < fighter.moodUntil) {
      if (fighter.faceMood === 'wall') return '撞墙惊讶';
      if (fighter.faceMood === 'hurt') return '受伤啦';
      if (fighter.faceMood === 'bump') return '碰到伙伴';
      if (fighter.faceMood === 'obstacle') return '撞到障碍';
      if (fighter.faceMood === 'dizzy') return '晕乎乎';
    }
    if (fighter.slowRemaining > 0) return '冰冻减速';
    if (fighter.adrenalineRemaining > 0) return '肾上腺素';
    return fighter.idle;
  }

  function syncHud() {
    if (!match) return;
    const now = performance.now();
    match.fighters.forEach((fighter) => {
      const chip = roster.querySelector(`[data-character="${fighter.id}"]`);
      if (!chip) return;
      const label = moodLabel(fighter, now);
      const moodElement = chip.querySelector('.roster-mood');
      const healthValue = chip.querySelector('.roster-health-value');
      const healthFill = chip.querySelector('.roster-health-fill');
      const heldItemsElement = chip.querySelector('.roster-items');
      const shieldStatusElement = chip.querySelector('.roster-shield');
      const heldItemNames = fighter.heldItems.map((item) => ITEM_DEFINITIONS[item.type]?.shortName || item.type);
      const heldItemsLabel = heldItemNames.length ? heldItemNames.join('、') : '—';
      const shieldHealth = fighter.shield ? Math.ceil(fighter.shield.health) : 0;
      const ratio = fighter.maxHealth > 0 ? Math.max(0, fighter.health / fighter.maxHealth) : 0;
      if (moodElement && moodElement.textContent !== label) moodElement.textContent = label;
      if (healthValue) healthValue.textContent = `${Math.ceil(fighter.health)} HP`;
      if (healthFill) healthFill.style.width = `${ratio * 100}%`;
      if (heldItemsElement) heldItemsElement.textContent = `手持 ${heldItemsLabel}`;
      if (shieldStatusElement) shieldStatusElement.textContent = fighter.shield
        ? `护盾 ${shieldHealth}/${fighter.shield.maxHealth} HP`
        : '护盾 —';
      chip.classList.toggle('has-shield', Boolean(fighter.shield));
      chip.classList.toggle('is-zombie', fighter.isZombie);
      chip.classList.toggle('is-priest', fighter.isPriest);
      chip.classList.toggle('is-slowed', fighter.slowRemaining > 0);
      chip.classList.toggle('has-adrenaline', fighter.adrenalineRemaining > 0);
      chip.classList.toggle('is-reacting', fighter.faceMood !== 'idle' && now < fighter.moodUntil);
      chip.classList.toggle('is-critical', !fighter.eliminated && ratio <= 0.25);
      chip.classList.toggle('is-eliminated', fighter.eliminated);
      const roleLabel = fighter.isZombie
        ? `僵尸，召唤者 ${fighter.summonerId || '未知'}`
        : (fighter.isPriest ? `神父，召唤者 ${fighter.summonerId || '未知'}` : '方块');
      const effectLabels = [
        fighter.adrenalineRemaining > 0 ? `肾上腺素 ${fighter.adrenalineRemaining.toFixed(1)} 秒` : '',
        fighter.slowRemaining > 0 ? `减速 ${fighter.slowRemaining.toFixed(1)} 秒` : '',
        fighter.isZombie ? `每秒流失 ${ITEM_RULES.zombieHealthDrain} HP，碰撞 ${ITEM_RULES.zombieContactDamage} HP` : '',
        fighter.isPriest ? `神雷剩余 ${fighter.priestAttacksRemaining} 次` : '',
      ].filter(Boolean).join('，');
      chip.setAttribute('aria-label', `${fighter.name}，${roleLabel}，${label}，${Math.ceil(fighter.health)} / ${fighter.maxHealth} HP，手持道具 ${heldItemsLabel}，${fighter.shield ? `护盾 ${shieldHealth} / ${fighter.shield.maxHealth} HP` : '无护盾'}${effectLabels ? `，${effectLabels}` : ''}`);
    });
    const livingCount = match.fighters.filter((fighter) => !fighter.eliminated).length;
    const livingPlayerCount = match.fighters.filter((fighter) => !fighter.eliminated && !fighter.isZombie && !fighter.isPriest).length;
    aliveCount.textContent = String(livingCount);
    if (!match.paused && !match.ended && livingPlayerCount === 1) {
      const survivor = match.fighters.find((fighter) => !fighter.eliminated && !fighter.isZombie && !fighter.isPriest);
      matchState.querySelector('span').textContent = survivor ? `${survivor.name} · 最后一位` : '对局结束';
    } else if (!match.paused && !match.ended) {
      matchState.querySelector('span').textContent = MAP_DEFINITIONS[match.config.mapType].status;
    }
    collisionCount.textContent = String(match.collisions);
    wallCount.textContent = String(match.wallHits);
    blockCount.textContent = String(match.blockHits);
    obstacleHitCount.textContent = String(match.obstacleHits);
    syncItemHud();
  }

  function heldItemCount() {
    return match ? match.fighters.reduce((total, fighter) => total + fighter.heldItems.length, 0) : 0;
  }

  function totalItemCount() {
    return match ? match.items.length + heldItemCount() : 0;
  }

  function itemCooldownRemaining() {
    return match ? Math.max(0, match.itemUseReadyAt - match.simulationTime) : 0;
  }

  function syncItemHud() {
    if (!itemStatus || !match) return;
    const cooldown = itemCooldownRemaining();
    const cooldownText = cooldown > 0.04 ? `全局冷却 ${Math.ceil(cooldown)} 秒` : '自动使用就绪';
    const statusText = `普通道具 ${totalItemCount()}/${ITEM_RULES.maxOnField} · ${cooldownText}`;
    if (itemStatus.textContent !== statusText) itemStatus.textContent = statusText;
    itemStatus.classList.toggle('is-cooling', cooldown > 0.04);
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

  function boostAfterCollision(fighter, collisionType) {
    if (!match.config.collisionAcceleration) return;
    const factor = collisionType === 'block' ? 1.085 : (collisionType === 'obstacle' ? 1.065 : 1.045);
    const speed = Math.hypot(fighter.vx, fighter.vy);
    if (speed <= 0) return;
    const maximum = world.cell * (match.config.blockCount > 24 ? 4.8 : 5.5) * match.config.speedMultiplier;
    const scale = Math.min(factor, maximum / speed);
    fighter.vx *= scale;
    fighter.vy *= scale;
  }

  function registerWallCollision(fighter, hitX, hitY) {
    match.collisions += 1;
    match.wallHits += 1;
    setMood(fighter, 'wall', 680);
    boostAfterCollision(fighter, 'wall');
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
    if (fighter.eliminated || obstacle.destroyed) return false;
    const overlapX = fighter.size / 2 + obstacle.width / 2 - Math.abs(fighter.x - obstacle.x);
    const overlapY = fighter.size / 2 + obstacle.height / 2 - Math.abs(fighter.y - obstacle.y);
    if (overlapX <= 0 || overlapY <= 0) return false;

    const normal = obstacleNormal(fighter, obstacle, overlapX, overlapY);
    const impactSpeed = Math.abs(normal.axis === 'x' ? fighter.vx : fighter.vy);
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
      registerObstacleCollision(fighter, obstacle, cooldownKey, impactSpeed);
    }
    keepInside(fighter, countHit);
    return true;
  }

  function resolveObstacleCollisions(fighter, countHit) {
    if (fighter.eliminated || !match.obstacles.length) return;
    match.obstacles.forEach((obstacle) => resolveObstacleCollision(fighter, obstacle, countHit));
  }

  function obstacleName(kind) {
    return ({ tree: '树木', rock: '石头', cactus: '仙人掌' })[kind] || '障碍物';
  }

  function damageObstacle(obstacle, impactSpeed) {
    const damage = Math.max(1, Math.round((impactSpeed / Math.max(1, world.cell)) * 10));
    obstacle.health = Math.max(0, obstacle.health - damage);
    const destroyed = obstacle.health <= 0;
    if (destroyed) {
      obstacle.destroyed = true;
      match.destroyedObstacleIds.add(obstacle.id);
      match.obstaclesDestroyed += 1;
      addBurst(obstacle.x, obstacle.y, [obstacle.accent, '#c8ff72', '#ffffff'], 15);
    }
    return { damage, destroyed };
  }

  function recordHostility(victim, attacker, amount = 1) {
    if (!match || !victim || !attacker || victim.id === attacker.id || amount <= 0) return;
    const key = `${victim.id}:${attacker.id}`;
    const previous = match.hostilityScores.get(key);
    const age = previous ? Math.max(0, match.simulationTime - previous.time) : 0;
    const score = previous ? previous.score * Math.exp(-age / 8) : 0;
    match.hostilityScores.set(key, { score: score + amount, time: match.simulationTime });
  }

  function hostilityToward(victim, attacker) {
    if (!match || !victim || !attacker) return 0;
    const entry = match.hostilityScores.get(`${victim.id}:${attacker.id}`);
    if (!entry) return 0;
    return entry.score * Math.exp(-Math.max(0, match.simulationTime - entry.time) / 8);
  }

  function formatHealthAmount(value) {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function applyDamage(fighter, amount, source, announce = true, attackerId = null) {
    if (!fighter || fighter.eliminated || amount <= 0) return 0;
    const attacker = attackerId ? match.fighters.find((item) => item.id === attackerId) : null;
    if (attacker && areSummonAllies(attacker, fighter)) return 0;
    const baseDamage = Math.max(1, Math.round(amount));
    const ignoresMitigation = source === 'zombieDecay';
    const damage = !ignoresMitigation && fighter.adrenalineRemaining > 0
      ? baseDamage * (1 - ITEM_RULES.adrenalineDamageReduction)
      : baseDamage;
    if (attacker) recordHostility(fighter, attacker, Math.max(1, damage / 5));

    let healthDamage = damage;
    let shieldDamage = 0;
    let shieldBroken = false;
    if (!ignoresMitigation && fighter.shield && fighter.shield.health > 0) {
      shieldDamage = Math.min(fighter.shield.health, healthDamage);
      fighter.shield.health = Math.max(0, fighter.shield.health - shieldDamage);
      healthDamage -= shieldDamage;
      if (fighter.shield.health <= 0) {
        fighter.shield = null;
        shieldBroken = true;
      }
    }

    fighter.lastDamage = healthDamage;
    fighter.damageNumber = {
      amount: damage,
      source,
      shielded: shieldDamage > 0,
      shieldDamage,
      healthDamage,
      remaining: 0.82,
      maxRemaining: 0.82,
    };
    if (healthDamage > 0) fighter.health = Math.max(0, fighter.health - healthDamage);
    setMood(fighter, 'hurt', 700);
    addBurst(
      fighter.x,
      fighter.y,
      shieldDamage > 0 ? ['#69d4ff', fighter.color, '#ffffff'] : [fighter.color, '#ff8190', '#ffffff'],
      source === 'laser' ? 1 : 4,
    );

    const sourceLabel = ({
      radiation: '辐射坑', cactus: '仙人掌', knife: '刀', pistol: '手枪',
      shotgun: '霰弹枪', sniper: '狙击枪', flamethrower: '喷火器', c4: 'C4 爆炸', laser: '激光',
      zombie: '僵尸', zombieDecay: '僵尸生命流失', iceShooter: '寒冰射手', holyLightning: '神圣雷击',
    })[source] || '对手';
    if (announce && shieldDamage > 0) {
      const healthText = healthDamage > 0 ? `，生命 -${formatHealthAmount(healthDamage)} HP` : '，生命未受伤';
      const brokenText = shieldBroken ? '，护盾破裂' : '';
      addEvent(`${fighter.name} 的护盾挡下${sourceLabel} ${formatHealthAmount(shieldDamage)} 伤害${healthText}${brokenText}`, ITEM_DEFINITIONS.shield.color);
    } else if (announce && healthDamage > 0) {
      addEvent(`${fighter.name} 受到${sourceLabel}伤害 -${formatHealthAmount(healthDamage)} HP`, '#ff8292');
    }

    if (fighter.health <= 0) {
      eliminateFighter(fighter, source);
      return healthDamage;
    }
    return healthDamage;
  }

  function eliminateFighter(fighter, source) {
    if (fighter.eliminated) return;
    fighter.health = 0;
    fighter.eliminated = true;
    fighter.shield = null;
    fighter.damageNumber = null;
    fighter.adrenalineRemaining = 0;
    fighter.slowRemaining = 0;
    fighter.slowFactor = 1;
    fighter.zombieHealthDrainRemaining = 0;
    fighter.zombieContactCooldown = 0;
    fighter.priestAttackCooldown = 0;
    fighter.priestAttacksRemaining = 0;
    dropHeldItems(fighter);
    fighter.faceMood = 'idle';
    match.eliminations += 1;
    addBurst(fighter.x, fighter.y, [fighter.color, '#ffffff', '#ff7184'], 18);
    const eliminationText = source === 'priestFinished'
      ? `${fighter.name} 完成十次雷击后消散`
      : `${fighter.name} 血量耗尽，淘汰出局`;
    addEvent(eliminationText, fighter.color);
    if (!fighter.isZombie) {
      match.fighters.filter((item) => item.isZombie && item.summonerId === fighter.id && !item.eliminated)
        .forEach((zombie) => {
          zombie.health = 0;
          zombie.eliminated = true;
          zombie.shield = null;
          zombie.damageNumber = null;
          zombie.adrenalineRemaining = 0;
          zombie.slowRemaining = 0;
          zombie.slowFactor = 1;
          zombie.zombieHealthDrainRemaining = 0;
          zombie.zombieContactCooldown = 0;
          zombie.faceMood = 'idle';
          dropHeldItems(zombie);
          match.eliminations += 1;
          addBurst(zombie.x, zombie.y, [zombie.color, '#caeef8', '#ffffff'], 10);
          addEvent(`${zombie.name} 随召唤者倒下而消散`, zombie.color);
        });
    }
    const livingCount = match.fighters.filter((item) => !item.eliminated).length;
    if (livingCount === 0) {
      match.ended = true;
      match.paused = true;
      matchState.className = 'match-state is-paused';
      matchState.querySelector('span').textContent = '本局结束';
      overlayTitle.textContent = '全员淘汰';
      overlayMessage.textContent = source === 'radiation'
        ? '最后一位方块也倒在了辐射坑里。'
        : '所有方块都耗尽血量了。';
      overlay.hidden = false;
      pauseButton.disabled = true;
    }
    syncHud();
  }

  function registerObstacleCollision(fighter, obstacle, cooldownKey, impactSpeed) {
    match.obstacleCooldowns.set(cooldownKey, 0.32);
    match.collisions += 1;
    match.obstacleHits += 1;
    boostAfterCollision(fighter, 'obstacle');
    setMood(fighter, 'obstacle', 760);
    const impact = damageObstacle(obstacle, impactSpeed);
    let cactusDamage = 0;
    if (obstacle.kind === 'cactus' && (match.cactusDamageCooldowns.get(cooldownKey) || 0) <= 0) {
      match.cactusDamageCooldowns.set(cooldownKey, 1);
      cactusDamage = applyDamage(fighter, 2, 'cactus', false);
    }
    addBurst(fighter.x, fighter.y, [fighter.color, obstacle.accent, '#ffffff'], 9);
    const label = obstacleName(obstacle.kind);
    const eventText = impact.destroyed
      ? `${fighter.name} 撞碎了${label}（${impact.damage} 伤害）`
      : `${fighter.name} 撞到${label}，耐久 ${obstacle.health}/${obstacle.maxHealth}`;
    addEvent(cactusDamage > 0 ? `${eventText}，仙人掌 -${cactusDamage} HP` : eventText, fighter.color);
    showToast(impact.destroyed ? `${label}被撞碎了！` : `${fighter.name}：“咚！”`);
    ITEM_SYSTEM_API.onCollision({
      type: 'obstacle', block: fighter.id, obstacle: obstacle.id,
      damage: impact.damage, destroyed: impact.destroyed,
    }, match);
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
      if (first.eliminated) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < fighters.length; secondIndex += 1) {
        const second = fighters[secondIndex];
        if (second.eliminated) continue;
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
          if (canCount) {
            registerBlockCollision(first, second, pairKey);
            boostAfterCollision(first, 'block');
            boostAfterCollision(second, 'block');
          }
        }
        keepInside(first, countHit);
        keepInside(second, countHit);
      }
    }
  }

  function applyZombieContactDamage(zombie, target) {
    if (!zombie?.isZombie || zombie.eliminated || !target || target.eliminated
      || zombie.zombieContactCooldown > 0 || areSummonAllies(zombie, target)) return false;
    applyDamage(target, ITEM_RULES.zombieContactDamage, 'zombie', true, zombie.id);
    zombie.zombieContactCooldown = ITEM_RULES.zombieContactInterval;
    return true;
  }

  function registerBlockCollision(first, second, pairKey) {
    match.pairCooldowns.set(pairKey, 0.28);
    recordHostility(first, second, 1);
    recordHostility(second, first, 1);
    applyZombieContactDamage(first, second);
    applyZombieContactDamage(second, first);
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

  function initializeItemSystem() {
    if (!match || !world) return;
    match.items = [];
    match.projectiles = [];
    match.flames = [];
    match.lasers = [];
    match.iceShooters = [];
    match.c4Charges = [];
    match.itemEffects = [];
    match.itemUseReadyAt = match.simulationTime;
    match.itemSpawnCooldown = ITEM_RULES.refillInterval;
    for (let index = 0; index < ITEM_RULES.maxOnField; index += 1) spawnItemPickup();
    syncItemHud();
  }

  function disposeItemSystem() {
    if (!match) return;
    match.items = [];
    match.projectiles = [];
    match.flames = [];
    match.lasers = [];
    match.iceShooters = [];
    match.c4Charges = [];
    match.itemEffects = [];
  }

  function getItemSystemSnapshot() {
    if (!match) return null;
    return {
      enabled: ITEM_SYSTEM_API.enabled,
      maxOnField: ITEM_RULES.maxOnField,
      count: totalItemCount(),
      globalCooldown: Number(itemCooldownRemaining().toFixed(3)),
      ground: match.items.map((item) => ({ id: item.id, type: item.type, x: item.x, y: item.y })),
      held: match.fighters.flatMap((fighter) => fighter.heldItems.map((item) => ({
        id: item.id, type: item.type, block: fighter.id,
      }))),
      shields: match.fighters.filter((fighter) => fighter.shield).map((fighter) => ({
        block: fighter.id,
        health: fighter.shield.health,
        maxHealth: fighter.shield.maxHealth,
      })),
      projectiles: match.projectiles.length,
      flames: match.flames.length,
      lasers: match.lasers.map((laser) => ({
        owner: laser.ownerId,
        target: laser.targetId,
        remaining: Number(laser.remaining.toFixed(3)),
        angle: Number(laser.angle.toFixed(4)),
      })),
      zombies: match.fighters.filter((fighter) => fighter.isZombie && !fighter.eliminated).map((fighter) => ({
        id: fighter.id,
        summoner: fighter.summonerId,
        health: fighter.health,
        healthDrainRemaining: Number(fighter.zombieHealthDrainRemaining.toFixed(3)),
        contactCooldown: Number(fighter.zombieContactCooldown.toFixed(3)),
        heldItems: fighter.heldItems.map((item) => item.type),
        color: fighter.color,
      })),
      priests: match.fighters.filter((fighter) => fighter.isPriest && !fighter.eliminated).map((fighter) => ({
        id: fighter.id,
        summoner: fighter.summonerId,
        health: fighter.health,
        attacksRemaining: fighter.priestAttacksRemaining,
        attackCooldown: Number(fighter.priestAttackCooldown.toFixed(3)),
        color: fighter.color,
      })),
      iceShooters: match.iceShooters.map((iceShooter) => ({
        id: iceShooter.id,
        owner: iceShooter.ownerId,
        target: iceShooter.targetId,
        x: iceShooter.x,
        y: iceShooter.y,
        remaining: Number(iceShooter.remaining.toFixed(3)),
        shotCooldown: Number(iceShooter.shotCooldown.toFixed(3)),
      })),
      attachedC4: match.c4Charges.length,
    };
  }

  function spawnItemPickup(type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)]) {
    if (!match || !world || totalItemCount() >= ITEM_RULES.maxOnField) return false;
    const safeType = Object.hasOwn(ITEM_DEFINITIONS, type) ? type : ITEM_TYPES[0];
    const radius = Math.max(10, world.cell * 0.31);
    const margin = world.border + radius + 8;
    const minX = margin;
    const maxX = world.width - margin;
    const minY = margin;
    const maxY = world.height - margin;
    let position = null;

    for (let attempt = 0; attempt < 700; attempt += 1) {
      const x = minX + Math.random() * Math.max(1, maxX - minX);
      const y = minY + Math.random() * Math.max(1, maxY - minY);
      const overlapsBlock = match.fighters.some((fighter) => !fighter.eliminated
        && Math.hypot(fighter.x - x, fighter.y - y) < fighter.size / 2 + radius + world.cell * 0.24);
      const overlapsObstacle = match.obstacles.some((obstacle) => obstacleOverlaps(x, y, radius * 2, obstacle, 7));
      const overlapsPit = match.radiationPits.some((pit) => obstacleOverlaps(x, y, radius * 2, pit, 5));
      const overlapsPickup = match.items.some((item) => Math.hypot(item.x - x, item.y - y) < item.radius + radius + 10);
      if (!overlapsBlock && !overlapsObstacle && !overlapsPit && !overlapsPickup) {
        position = { x, y };
        break;
      }
    }
    if (!position) return false;

    const definition = ITEM_DEFINITIONS[safeType];
    match.items.push({
      id: `item-${match.nextItemId++}`,
      type: safeType,
      x: position.x,
      y: position.y,
      radius,
      phase: Math.random() * Math.PI * 2,
      bornAt: match.simulationTime,
    });
    addEvent(`场上出现了${definition.name}`, definition.color);
    return true;
  }

  function pickupItems() {
    if (!match.items.length) return false;
    let changed = false;
    const remaining = [];
    match.items.forEach((pickup) => {
      const collector = match.fighters.find((fighter) => !fighter.eliminated && !fighter.isPriest
        && Math.hypot(fighter.x - pickup.x, fighter.y - pickup.y) <= fighter.size / 2 + pickup.radius);
      if (!collector) {
        remaining.push(pickup);
        return;
      }
      const definition = ITEM_DEFINITIONS[pickup.type];
      if (pickup.type === 'shield') {
        const maxHealth = ITEM_RULES.shieldHealth;
        const currentHealth = collector.shield?.health || 0;
        collector.shield = { health: Math.min(maxHealth, currentHealth + maxHealth), maxHealth };
        addEvent(`${collector.name} 获得独立护盾（${collector.shield.health}/${maxHealth} HP）`, definition.color);
      } else {
        collector.heldItems.push({
          id: pickup.id,
          type: pickup.type,
          acquiredAt: match.simulationTime,
        });
        addEvent(`${collector.name} 拾起${definition.name}，准备自动使用`, definition.color);
      }
      showToast(`${collector.name} 拾起${definition.name}`);
      changed = true;
    });
    if (changed) match.items = remaining;
    return changed;
  }

  function dropHeldItems(fighter) {
    if (!match || !fighter?.heldItems.length) return;
    const dropped = fighter.heldItems.splice(0);
    dropped.forEach((item, index) => {
      const radius = Math.max(10, world.cell * 0.31);
      const angle = (index / Math.max(1, dropped.length)) * Math.PI * 2;
      match.items.push({
        id: item.id,
        type: item.type,
        x: Math.max(world.border + radius, Math.min(world.width - world.border - radius, fighter.x + Math.cos(angle) * radius * 1.7)),
        y: Math.max(world.border + radius, Math.min(world.height - world.border - radius, fighter.y + Math.sin(angle) * radius * 1.7)),
        radius,
        phase: Math.random() * Math.PI * 2,
        bornAt: match.simulationTime,
      });
    });
    syncItemHud();
  }

  function areSummonAllies(first, second) {
    if (!first || !second) return false;
    return first.id === second.id
      || first.summonerId === second.id
      || second.summonerId === first.id
      || Boolean(first.summonerId && first.summonerId === second.summonerId);
  }

  function pickHostileTarget(shooter) {
    if (!match || !shooter || shooter.eliminated) return null;
    const candidates = match.fighters.filter((fighter) => !fighter.eliminated && !areSummonAllies(shooter, fighter));
    if (!candidates.length) return null;
    const scored = candidates.map((fighter) => ({
      fighter,
      hostility: hostilityToward(shooter, fighter),
      distance: Math.hypot(fighter.x - shooter.x, fighter.y - shooter.y),
    }));
    const maxHostility = Math.max(...scored.map((entry) => entry.hostility));
    if (maxHostility > 0.04) {
      scored.sort((first, second) => second.hostility - first.hostility || first.distance - second.distance);
      return scored[0].fighter;
    }
    scored.sort((first, second) => first.distance - second.distance);
    return scored[0].fighter;
  }

  function pickMostThreateningTarget(summoner, priest) {
    if (!match || !priest || priest.eliminated) return null;
    const candidates = match.fighters.filter((fighter) => !fighter.eliminated && !areSummonAllies(priest, fighter));
    if (!candidates.length) return null;
    const reference = summoner || priest;
    const scored = candidates.map((fighter) => ({
      fighter,
      hostility: hostilityToward(summoner, fighter),
      distance: Math.hypot(fighter.x - reference.x, fighter.y - reference.y),
    }));
    const maxHostility = Math.max(...scored.map((entry) => entry.hostility));
    if (maxHostility > 0.04) {
      scored.sort((first, second) => second.hostility - first.hostility || first.distance - second.distance);
    } else {
      scored.sort((first, second) => first.distance - second.distance);
    }
    return scored[0].fighter;
  }

  function reflectCoordinate(position, velocity, seconds, minimum, maximum) {
    const span = maximum - minimum;
    if (span <= 0) return (minimum + maximum) / 2;
    const period = span * 2;
    const offset = ((position - minimum + velocity * seconds) % period + period) % period;
    return minimum + (offset <= span ? offset : period - offset);
  }

  function solveInterceptTime(shooter, target, projectileSpeed) {
    const rx = target.x - shooter.x;
    const ry = target.y - shooter.y;
    const vx = target.vx;
    const vy = target.vy;
    const a = vx * vx + vy * vy - projectileSpeed * projectileSpeed;
    const b = 2 * (rx * vx + ry * vy);
    const c = rx * rx + ry * ry;
    const candidates = [];
    if (Math.abs(a) < 1e-8) {
      if (Math.abs(b) > 1e-8) candidates.push(-c / b);
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        candidates.push((-b - root) / (2 * a), (-b + root) / (2 * a));
      }
    }
    const positive = candidates.filter((time) => Number.isFinite(time) && time > 0);
    return positive.length ? Math.min(...positive) : Math.sqrt(c) / Math.max(1, projectileSpeed);
  }

  function predictInterceptPoint(shooter, target, projectileSpeed) {
    const maxPredictionTime = ITEM_RULES.projectileLifetime;
    let time = Math.min(maxPredictionTime, solveInterceptTime(shooter, target, projectileSpeed));
    const bounds = nearestWallBounds(target);
    let predicted = { x: target.x, y: target.y };
    for (let iteration = 0; iteration < 4; iteration += 1) {
      predicted = {
        x: reflectCoordinate(target.x, target.vx, time, bounds.minX, bounds.maxX),
        y: reflectCoordinate(target.y, target.vy, time, bounds.minY, bounds.maxY),
      };
      time = Math.min(maxPredictionTime, Math.hypot(predicted.x - shooter.x, predicted.y - shooter.y) / Math.max(1, projectileSpeed));
    }
    return predicted;
  }

  function useCooldownReady() {
    return itemCooldownRemaining() <= 0.001;
  }

  function fireProjectile(owner, type, target, angle, damage, speed, origin = null) {
    if (!target || target.eliminated || owner.eliminated) return false;
    const definition = ITEM_DEFINITIONS[type];
    const originX = Number.isFinite(origin?.x) ? origin.x : owner.x;
    const originY = Number.isFinite(origin?.y) ? origin.y : owner.y;
    const nose = origin ? 0 : owner.size * 0.52 + 4;
    match.projectiles.push({
      id: `shot-${match.nextItemId++}`,
      type,
      ownerId: owner.id,
      targetId: target.id,
      x: originX + Math.cos(angle) * nose,
      y: originY + Math.sin(angle) * nose,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: Math.max(2.2, world.cell * (type === 'sniper' ? 0.075 : (type === 'iceShooter' ? 0.09 : 0.06))),
      damage,
      life: ITEM_RULES.projectileLifetime,
      color: definition.color,
    });
    return true;
  }

  function startFlamethrower(owner, target) {
    if (!owner || !target) return false;
    const aimPoint = predictInterceptPoint(owner, target, world.cell * 12);
    match.flames.push({
      id: `flame-${match.nextItemId++}`,
      ownerId: owner.id,
      targetId: target.id,
      angle: Math.atan2(aimPoint.y - owner.y, aimPoint.x - owner.x),
      remaining: ITEM_RULES.flamethrowerDuration,
      damageTimers: new Map(),
    });
    return true;
  }

  function startLaser(owner, target) {
    if (!owner || owner.eliminated || !target || target.eliminated) return false;
    const aimPoint = predictInterceptPoint(
      owner,
      target,
      world.cell * ITEM_RULES.laserAimCellsPerSecond,
    );
    match.lasers.push({
      id: `laser-${match.nextItemId++}`,
      ownerId: owner.id,
      targetId: target.id,
      angle: Math.atan2(aimPoint.y - owner.y, aimPoint.x - owner.x),
      remaining: ITEM_RULES.laserDuration,
    });
    return true;
  }

  function summonZombies(owner) {
    if (!owner || owner.eliminated || owner.isZombie) return false;
    const summoned = [];
    for (let index = 0; index < ITEM_RULES.zombieCount; index += 1) {
      const zombie = createZombie(owner, index);
      match.fighters.push(zombie);
      createRosterChip(zombie);
      summoned.push(zombie);
    }
    syncHud();
    summoned.forEach((zombie) => addBurst(zombie.x, zombie.y, [zombie.color, '#ff354e', '#d9f7ff'], 7));
    addEvent(`${owner.name} 召唤了 3 个 50 HP 红眼僵尸`, ITEM_DEFINITIONS.wand.color);
    showToast(`${owner.name}：僵尸听我号令！`);
    return true;
  }

  function summonPriest(owner) {
    if (!owner || owner.eliminated || owner.isZombie || owner.isPriest) return false;
    const priest = createPriest(owner);
    match.fighters.push(priest);
    createRosterChip(priest);
    syncHud();
    addBurst(priest.x, priest.y, ['#fff7cf', priest.color, '#ffffff'], 14);
    addEvent(`${owner.name} 召唤了 50 HP 神父方块`, ITEM_DEFINITIONS.holyStaff.color);
    showToast(`${owner.name} 召来神父守护！`);
    return true;
  }

  function activateAdrenaline(owner) {
    if (!owner || owner.eliminated) return false;
    owner.adrenalineRemaining = ITEM_RULES.adrenalineDuration;
    addBurst(owner.x, owner.y, ['#ff604e', '#ffd166', '#ffffff'], 12);
    addEvent(`${owner.name} 注射肾上腺素：速度 +75%，减伤 50%（5 秒）`, ITEM_DEFINITIONS.adrenaline.color);
    showToast(`${owner.name} 肾上腺素爆发！`);
    return true;
  }

  function deployIceShooter(owner) {
    if (!owner || owner.eliminated) return false;
    const size = Math.max(12, world.cell * 0.25);
    const sideAngle = owner.angle + Math.PI / 2;
    const offset = owner.size * 0.82;
    const x = Math.max(world.border + size, Math.min(world.width - world.border - size, owner.x + Math.cos(sideAngle) * offset));
    const y = Math.max(world.border + size, Math.min(world.height - world.border - size, owner.y + Math.sin(sideAngle) * offset));
    match.iceShooters.push({
      id: `ice-shooter-${match.nextIceShooterId++}`,
      name: `${owner.name} 的寒冰射手`,
      ownerId: owner.id,
      x,
      y,
      targetId: null,
      remaining: ITEM_RULES.iceShooterDuration,
      shotCooldown: ITEM_RULES.iceShotInterval,
      phase: Math.random() * Math.PI * 2,
    });
    addBurst(x, y, ['#7de5ff', '#d7fbff', '#ffffff'], 10);
    addEvent(`${owner.name} 放下寒冰射手（3 秒）`, ITEM_DEFINITIONS.iceShooter.color);
    showToast(`${owner.name} 部署了寒冰射手`);
    return true;
  }

  function plantC4(owner, target) {
    if (!owner || !target || owner.id === target.id || target.eliminated) return false;
    match.c4Charges.push({
      id: `c4-${match.nextItemId++}`,
      ownerId: owner.id,
      targetId: target.id,
      x: target.x,
      y: target.y,
      remaining: ITEM_RULES.c4FuseSeconds,
    });
    recordHostility(target, owner, 4);
    addEvent(`${owner.name} 把 C4 安装在 ${target.name} 身上（5 秒）`, ITEM_DEFINITIONS.c4.color);
    showToast(`${target.name} 身上贴着 C4！`);
    addBurst(target.x, target.y, [ITEM_DEFINITIONS.c4.color, '#ffffff'], 8);
    return true;
  }

  function activateHeldItem(owner, item, target = null) {
    if (!match || !owner || owner.eliminated || !item || !useCooldownReady()) return false;
    const definition = ITEM_DEFINITIONS[item.type];
    if (!definition) return false;
    let used = false;

    if (item.type === 'knife') {
      if (!target || target.eliminated || target.id === owner.id) return false;
      const damage = applyDamage(target, ITEM_RULES.knifeDamage, 'knife', true, owner.id);
      addBurst(target.x, target.y, [owner.color, definition.color, '#ffffff'], 7);
      addEvent(`${owner.name} 用刀碰中 ${target.name}（-${damage} HP）`, definition.color);
      showToast(`${owner.name} 的刀命中！`);
      used = true;
    } else if (item.type === 'c4') {
      used = plantC4(owner, target);
    } else if (item.type === 'flamethrower') {
      const enemy = pickHostileTarget(owner);
      if (!enemy) return false;
      used = startFlamethrower(owner, enemy);
      if (used) {
        addEvent(`${owner.name} 启动喷火器（5 秒）`, definition.color);
        showToast(`${owner.name} 开始喷火！`);
      }
    } else if (item.type === 'laser') {
      const enemy = pickHostileTarget(owner);
      if (!enemy) return false;
      used = startLaser(owner, enemy);
      if (used) {
        addEvent(`${owner.name} 发射穿透激光，自动锁定 ${enemy.name}（2 秒）`, owner.color);
        showToast(`${owner.name} 的激光开始扫射！`);
      }
    } else if (item.type === 'wand') {
      used = summonZombies(owner);
    } else if (item.type === 'holyStaff') {
      used = summonPriest(owner);
    } else if (item.type === 'adrenaline') {
      used = activateAdrenaline(owner);
    } else if (item.type === 'iceShooter') {
      used = deployIceShooter(owner);
    } else {
      const enemy = pickHostileTarget(owner);
      if (!enemy) return false;
      const speed = world.cell * (item.type === 'sniper'
        ? ITEM_RULES.sniperBulletCellsPerSecond
        : ITEM_RULES.mediumBulletCellsPerSecond);
      const aimPoint = predictInterceptPoint(owner, enemy, speed);
      const baseAngle = Math.atan2(aimPoint.y - owner.y, aimPoint.x - owner.x);
      if (item.type === 'shotgun') {
        const spread = Array.from({ length: ITEM_RULES.shotgunPellets }, (_value, index) => (
          (index - (ITEM_RULES.shotgunPellets - 1) / 2) * 0.2
        ));
        spread.forEach((offset) => fireProjectile(owner, item.type, enemy, baseAngle + offset, ITEM_RULES.shotgunPelletDamage, speed));
        addEvent(`${owner.name} 自动发射霰弹，预判瞄准 ${enemy.name}`, definition.color);
      } else {
        const damage = item.type === 'sniper' ? ITEM_RULES.sniperDamage : ITEM_RULES.pistolDamage;
        used = fireProjectile(owner, item.type, enemy, baseAngle, damage, speed);
        if (used) addEvent(`${owner.name} 自动瞄准 ${enemy.name} 发射${definition.name}`, definition.color);
      }
      if (item.type === 'shotgun') used = true;
    }

    if (!used) return false;
    const heldIndex = owner.heldItems.indexOf(item);
    if (heldIndex >= 0) owner.heldItems.splice(heldIndex, 1);
    match.itemUseReadyAt = match.simulationTime + ITEM_RULES.globalUseCooldown;
    match.itemUses += 1;
    syncItemHud();
    return true;
  }

  function tryAutoUseRangedItems() {
    if (!match || !useCooldownReady()) return false;
    const candidates = [];
    match.fighters.forEach((fighter) => {
      if (fighter.eliminated) return;
      fighter.heldItems.forEach((item) => {
        if (ITEM_DEFINITIONS[item.type]?.group === 'ranged') candidates.push({ fighter, item });
      });
    });
    candidates.sort((first, second) => first.item.acquiredAt - second.item.acquiredAt);
    for (const candidate of candidates) {
      if (activateHeldItem(candidate.fighter, candidate.item)) return true;
    }
    return false;
  }

  function handleItemCollision(event) {
    if (!match || !event || event.type !== 'block') return;
    const first = match.fighters.find((fighter) => fighter.id === event.first);
    const second = match.fighters.find((fighter) => fighter.id === event.second);
    if (!first || !second || !useCooldownReady()) return;
    const contactPairs = [[first, second], [second, first]];
    for (const [owner, target] of contactPairs) {
      if (owner.eliminated || target.eliminated) continue;
      const heldItem = owner.heldItems
        .filter((item) => ITEM_DEFINITIONS[item.type]?.group === 'contact')
        .sort((a, b) => a.acquiredAt - b.acquiredAt)[0];
      if (heldItem && activateHeldItem(owner, heldItem, target)) return;
      if (!useCooldownReady()) return;
    }
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

  function pointSegmentDistanceSquared(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 1e-8) return (px - x1) ** 2 + (py - y1) ** 2;
    const amount = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
    const nearestX = x1 + amount * dx;
    const nearestY = y1 + amount * dy;
    return (px - nearestX) ** 2 + (py - nearestY) ** 2;
  }

  function applySlow(fighter, duration, factor = 0.5) {
    if (!fighter || fighter.eliminated) return false;
    fighter.slowRemaining = Math.max(fighter.slowRemaining || 0, duration);
    fighter.slowFactor = Math.min(fighter.slowFactor || 1, factor);
    addBurst(fighter.x, fighter.y, ['#7de5ff', '#d7fbff', '#ffffff'], 4);
    return true;
  }

  function updateProjectiles(dt) {
    const remaining = [];
    match.projectiles.forEach((projectile) => {
      const owner = match.fighters.find((fighter) => fighter.id === projectile.ownerId);
      const travelTime = Math.min(dt, projectile.life);
      const previousX = projectile.x;
      const previousY = projectile.y;
      projectile.x += projectile.vx * travelTime;
      projectile.y += projectile.vy * travelTime;
      projectile.life -= dt;
      let hitTarget = null;
      for (const fighter of match.fighters) {
        if (fighter.eliminated || fighter.id === projectile.ownerId || (owner && areSummonAllies(owner, fighter))) continue;
        const hitRadius = fighter.size / 2 + projectile.radius;
        const targetStartX = Number.isFinite(fighter.previousX) ? fighter.previousX : fighter.x;
        const targetStartY = Number.isFinite(fighter.previousY) ? fighter.previousY : fighter.y;
        const relativeDistance = pointSegmentDistanceSquared(
          0, 0,
          targetStartX - previousX, targetStartY - previousY,
          fighter.x - projectile.x, fighter.y - projectile.y,
        );
        if (relativeDistance <= hitRadius * hitRadius) {
          hitTarget = fighter;
          break;
        }
      }
      if (hitTarget) {
        const damage = applyDamage(hitTarget, projectile.damage, projectile.type, true, projectile.ownerId);
        match.projectileHits += 1;
        addBurst(projectile.x, projectile.y, [projectile.color, hitTarget.color, '#ffffff'], 7);
        if (projectile.type === 'iceShooter' && !hitTarget.eliminated) {
          applySlow(hitTarget, ITEM_RULES.iceSlowDuration, ITEM_RULES.iceSlowFactor);
          addEvent(`${hitTarget.name} 被冰豌豆命中（-${formatHealthAmount(damage)} HP，减速 50%）`, projectile.color);
        } else {
          addEvent(`${hitTarget.name} 被${ITEM_DEFINITIONS[projectile.type].name}命中（-${formatHealthAmount(damage)} HP）`, projectile.color);
        }
        return;
      }
      const inBounds = projectile.x >= world.border - 24 && projectile.x <= world.width - world.border + 24
        && projectile.y >= world.border - 24 && projectile.y <= world.height - world.border + 24;
      if (projectile.life > 0 && inBounds) remaining.push(projectile);
    });
    match.projectiles = remaining;
  }

  function updateIceShooters(dt) {
    const remaining = [];
    match.iceShooters.forEach((iceShooter) => {
      const owner = match.fighters.find((fighter) => fighter.id === iceShooter.ownerId);
      if (!owner || owner.eliminated) return;
      const activeStep = Math.min(dt, iceShooter.remaining);
      iceShooter.shotCooldown -= activeStep;
      while (iceShooter.shotCooldown <= 1e-6 && iceShooter.remaining > 1e-6) {
        const target = pickHostileTarget(owner);
        if (target) {
          const speed = world.cell * ITEM_RULES.icePeaCellsPerSecond;
          const aimPoint = predictInterceptPoint(iceShooter, target, speed);
          iceShooter.targetId = target.id;
          const angle = Math.atan2(aimPoint.y - iceShooter.y, aimPoint.x - iceShooter.x);
          fireProjectile(owner, 'iceShooter', target, angle, ITEM_RULES.iceDamage, speed, iceShooter);
          addEvent(`${iceShooter.name || '寒冰射手'} 预判 ${target.name} 发射冰豌豆`, ITEM_DEFINITIONS.iceShooter.color);
        }
        iceShooter.shotCooldown += ITEM_RULES.iceShotInterval;
      }
      iceShooter.remaining = Math.max(0, iceShooter.remaining - dt);
      if (iceShooter.remaining > 1e-6) remaining.push(iceShooter);
      else addEvent(`${owner.name} 的寒冰射手消失了`, ITEM_DEFINITIONS.iceShooter.color);
    });
    match.iceShooters = remaining;
  }

  function laserBeamSegment(owner, angle) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const muzzleOffset = owner.size * 0.54 + 3;
    const x1 = owner.x + dx * muzzleOffset;
    const y1 = owner.y + dy * muzzleOffset;
    const candidates = [];
    if (dx > 1e-8) candidates.push((world.width - world.border - x1) / dx);
    else if (dx < -1e-8) candidates.push((world.border - x1) / dx);
    if (dy > 1e-8) candidates.push((world.height - world.border - y1) / dy);
    else if (dy < -1e-8) candidates.push((world.border - y1) / dy);
    const validDistances = candidates.filter((candidate) => Number.isFinite(candidate) && candidate >= 0);
    const distance = validDistances.length ? Math.min(...validDistances) : 0;
    return { x1, y1, x2: x1 + dx * distance, y2: y1 + dy * distance };
  }

  // updateItemSystem runs once per requestAnimationFrame; keep laser damage per update frame,
  // independent of dt, so it follows the display's available frame rate.
  function updateLasers(dt) {
    const remaining = [];
    match.lasers.forEach((laser) => {
      const owner = match.fighters.find((fighter) => fighter.id === laser.ownerId);
      if (!owner || owner.eliminated) return;
      const target = pickHostileTarget(owner);
      if (target) {
        const aimPoint = predictInterceptPoint(
          owner,
          target,
          world.cell * ITEM_RULES.laserAimCellsPerSecond,
        );
        laser.targetId = target.id;
        laser.angle = Math.atan2(aimPoint.y - owner.y, aimPoint.x - owner.x);
      }
      const segment = laserBeamSegment(owner, laser.angle);
      const beamRadius = world.cell * ITEM_RULES.laserWidthCells / 2;
      match.fighters.forEach((fighter) => {
        if (fighter.eliminated || areSummonAllies(owner, fighter)) return;
        const hitRadius = fighter.size / 2 + beamRadius;
        if (pointSegmentDistanceSquared(fighter.x, fighter.y, segment.x1, segment.y1, segment.x2, segment.y2)
          > hitRadius * hitRadius) return;
        applyDamage(fighter, ITEM_RULES.laserDamagePerFrame, 'laser', true, owner.id);
        match.laserHits += 1;
      });
      laser.remaining = Math.max(0, laser.remaining - dt);
      if (laser.remaining > 1e-6) remaining.push(laser);
      else addEvent(`${owner.name} 的激光熄灭`, owner.color);
    });
    match.lasers = remaining;
  }

  function flameContainsTarget(flame, owner, target) {
    const dx = target.x - owner.x;
    const dy = target.y - owner.y;
    const distance = Math.hypot(dx, dy);
    const reach = world.cell * ITEM_RULES.flamethrowerRangeCells + target.size / 2;
    if (distance > reach || distance < 1) return false;
    const direction = Math.atan2(dy, dx);
    const difference = Math.atan2(Math.sin(direction - flame.angle), Math.cos(direction - flame.angle));
    const targetAllowance = Math.asin(Math.min(1, target.size / 2 / distance));
    return Math.abs(difference) <= ITEM_RULES.flamethrowerHalfAngle + targetAllowance;
  }

  function updateFlames(dt) {
    const remaining = [];
    match.flames.forEach((flame) => {
      const owner = match.fighters.find((fighter) => fighter.id === flame.ownerId);
      if (!owner || owner.eliminated) return;
      const step = Math.min(dt, flame.remaining);
      const preferredTarget = pickHostileTarget(owner);
      if (preferredTarget) {
        const aimPoint = predictInterceptPoint(owner, preferredTarget, world.cell * 12);
        flame.angle = Math.atan2(aimPoint.y - owner.y, aimPoint.x - owner.x);
        flame.targetId = preferredTarget.id;
      }
      const insideTargets = new Set();
      match.fighters.forEach((target) => {
        if (target.eliminated || target.id === owner.id || !flameContainsTarget(flame, owner, target)) return;
        insideTargets.add(target.id);
        let accumulated = (flame.damageTimers.get(target.id) || 0) + step;
        while (accumulated >= 1 && !target.eliminated) {
          applyDamage(target, ITEM_RULES.flamethrowerDamagePerSecond, 'flamethrower', true, owner.id);
          accumulated -= 1;
        }
        flame.damageTimers.set(target.id, accumulated);
      });
      flame.damageTimers.forEach((_time, targetId) => {
        if (!insideTargets.has(targetId)) flame.damageTimers.delete(targetId);
      });
      flame.remaining = Math.max(0, flame.remaining - dt);
      if (flame.remaining > 1e-6) remaining.push(flame);
      else addEvent(`${owner.name} 的喷火器燃料耗尽`, ITEM_DEFINITIONS.flamethrower.color);
    });
    match.flames = remaining;
  }

  function explodeC4(charge) {
    const owner = match.fighters.find((fighter) => fighter.id === charge.ownerId);
    const ownerName = owner ? owner.name : '方块';
    const radius = world.cell * ITEM_RULES.c4RadiusCells;
    const colors = [ITEM_DEFINITIONS.c4.color, '#ffe27a', '#ffffff'];
    match.c4Detonations += 1;
    match.itemEffects.push({ type: 'explosion', x: charge.x, y: charge.y, radius, life: 0.62, maxLife: 0.62 });
    addBurst(charge.x, charge.y, colors, 22);
    let hitCount = 0;
    match.fighters.forEach((fighter) => {
      if (fighter.eliminated || fighter.id === charge.ownerId) return;
      if (Math.hypot(fighter.x - charge.x, fighter.y - charge.y) > radius + fighter.size / 2) return;
      applyDamage(fighter, ITEM_RULES.c4Damage, 'c4', true, charge.ownerId);
      hitCount += 1;
    });
    addEvent(`${ownerName} 安装的 C4 爆炸${hitCount ? `，波及 ${hitCount} 个方块` : ''}（安装者免疫）`, ITEM_DEFINITIONS.c4.color);
    showToast('C4 爆炸！安装者免疫');
  }

  function updateC4Charges(dt) {
    const remaining = [];
    match.c4Charges.forEach((charge) => {
      const target = match.fighters.find((fighter) => fighter.id === charge.targetId);
      if (target) {
        charge.x = target.x;
        charge.y = target.y;
      }
      charge.remaining = Math.max(0, charge.remaining - dt);
      if (charge.remaining <= 1e-6) explodeC4(charge);
      else remaining.push(charge);
    });
    match.c4Charges = remaining;
  }

  function updateItemEffects(dt) {
    match.itemEffects = match.itemEffects.filter((effect) => {
      effect.life -= dt;
      return effect.life > 0;
    });
  }

  function updateItemSystem(dt) {
    if (!match || !ITEM_SYSTEM_API.enabled) return;
    match.itemSpawnCooldown = Math.max(0, match.itemSpawnCooldown - dt);
    updateProjectiles(dt);
    updateIceShooters(dt);
    updateLasers(dt);
    updateFlames(dt);
    updateC4Charges(dt);
    updateItemEffects(dt);
    if (match.ended) {
      syncItemHud();
      return;
    }
    pickupItems();
    tryAutoUseRangedItems();
    if (totalItemCount() < ITEM_RULES.maxOnField && match.itemSpawnCooldown <= 0) {
      if (spawnItemPickup()) match.itemSpawnCooldown = ITEM_RULES.refillInterval;
      else match.itemSpawnCooldown = 1.2;
    }
    syncItemHud();
  }

  function drawItemModel(type, color, radius, time) {
    const scale = radius / 14;
    const dark = '#24334b';
    const metal = '#dcecff';
    ctx.save();
    ctx.scale(scale, scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5;

    if (type === 'knife') {
      ctx.save();
      ctx.rotate(-0.55);
      ctx.fillStyle = '#b84d53';
      roundedRect(-13, -2.6, 9, 5.2, 1.5);
      ctx.fill();
      ctx.strokeStyle = '#ffe1bd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-4, -4.4);
      ctx.lineTo(-4, 4.4);
      ctx.stroke();
      const blade = ctx.createLinearGradient(0, -4, 0, 4);
      blade.addColorStop(0, '#ffffff');
      blade.addColorStop(1, '#9fb8d2');
      ctx.fillStyle = blade;
      ctx.strokeStyle = dark;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-3, -3.4);
      ctx.lineTo(9, -3.4);
      ctx.lineTo(14, 0);
      ctx.lineTo(9, 3.4);
      ctx.lineTo(-3, 3.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (type === 'pistol') {
      ctx.fillStyle = dark;
      ctx.strokeStyle = '#f5f8ff';
      ctx.beginPath();
      ctx.moveTo(-13, -5);
      ctx.lineTo(5, -5);
      ctx.lineTo(11, -3);
      ctx.lineTo(12, 0);
      ctx.lineTo(3, 2);
      ctx.lineTo(0, 10);
      ctx.lineTo(-6, 10);
      ctx.lineTo(-8, 2);
      ctx.lineTo(-13, 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = metal;
      roundedRect(-10, -4, 17, 3, 1);
      ctx.fill();
      ctx.fillStyle = color;
      roundedRect(-6.5, 3, 4, 5, 1);
      ctx.fill();
      ctx.strokeStyle = '#9eb2cc';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-1, 2);
      ctx.quadraticCurveTo(3, 6, -1, 7);
      ctx.stroke();
    } else if (type === 'shotgun') {
      ctx.fillStyle = '#a56845';
      ctx.strokeStyle = '#f5e7d4';
      ctx.beginPath();
      ctx.moveTo(-14, -4);
      ctx.lineTo(-7, -4);
      ctx.lineTo(-5, -2);
      ctx.lineTo(3, -2);
      ctx.lineTo(3, 3);
      ctx.lineTo(-4, 3);
      ctx.lineTo(-7, 8);
      ctx.lineTo(-12, 8);
      ctx.lineTo(-11, 2);
      ctx.lineTo(-14, 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = dark;
      roundedRect(-3, -4, 11, 8, 2);
      ctx.fill();
      ctx.strokeStyle = metal;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(6, -2.5);
      ctx.lineTo(14, -2.5);
      ctx.moveTo(6, 2.5);
      ctx.lineTo(14, 2.5);
      ctx.stroke();
      ctx.fillStyle = color;
      roundedRect(-1, 3, 6, 2, 1);
      ctx.fill();
    } else if (type === 'sniper') {
      ctx.fillStyle = '#9a6e54';
      ctx.strokeStyle = '#f5e7d4';
      ctx.beginPath();
      ctx.moveTo(-14, -4);
      ctx.lineTo(-6, -4);
      ctx.lineTo(-4, -2);
      ctx.lineTo(3, -2);
      ctx.lineTo(3, 3);
      ctx.lineTo(-4, 3);
      ctx.lineTo(-7, 8);
      ctx.lineTo(-12, 8);
      ctx.lineTo(-11, 2);
      ctx.lineTo(-14, 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = dark;
      roundedRect(-4, -3, 11, 6, 2);
      ctx.fill();
      ctx.strokeStyle = metal;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(14, 0);
      ctx.stroke();
      ctx.fillStyle = color;
      roundedRect(-1, -8, 7, 3.5, 1.5);
      ctx.fill();
      ctx.strokeStyle = '#e7d7ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(1, -4.5);
      ctx.lineTo(1, -2.8);
      ctx.moveTo(5, -4.5);
      ctx.lineTo(5, -2.8);
      ctx.stroke();
    } else if (type === 'flamethrower') {
      ctx.fillStyle = '#38485d';
      ctx.strokeStyle = '#ffe7d5';
      roundedRect(-4, -5, 15, 10, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#d27c47';
      roundedRect(-12, -9, 6, 18, 3);
      ctx.fill();
      ctx.strokeStyle = '#ffcb67';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(9, -2);
      ctx.lineTo(14, -2);
      ctx.lineTo(14, 2);
      ctx.lineTo(9, 2);
      ctx.stroke();
      ctx.fillStyle = '#ff7a45';
      ctx.beginPath();
      ctx.moveTo(14, -4);
      ctx.quadraticCurveTo(19, 0, 14, 4);
      ctx.quadraticCurveTo(16, 0, 14, -4);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(-9, 0, 1.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'c4') {
      ctx.fillStyle = dark;
      ctx.strokeStyle = '#e6fff3';
      roundedRect(-12, -9, 24, 18, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#bc4e55';
      roundedRect(-9, -6, 18, 12, 2.5);
      ctx.fill();
      ctx.fillStyle = '#ffed9e';
      roundedRect(-5, -3.7, 10, 4.5, 1);
      ctx.fill();
      ctx.fillStyle = '#29354b';
      ctx.font = '900 5px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('C4', 0, -1.3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(-7, -8);
      ctx.quadraticCurveTo(-9, -13, -3, -12);
      ctx.moveTo(7, -8);
      ctx.quadraticCurveTo(10, -13, 4, -12);
      ctx.stroke();
    } else if (type === 'shield') {
      const shield = ctx.createLinearGradient(0, -12, 0, 12);
      shield.addColorStop(0, '#b9f0ff');
      shield.addColorStop(0.52, color);
      shield.addColorStop(1, '#3485ad');
      ctx.fillStyle = shield;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(-11, -10);
      ctx.lineTo(11, -10);
      ctx.lineTo(10, 2);
      ctx.quadraticCurveTo(8, 8, 0, 13);
      ctx.quadraticCurveTo(-8, 8, -10, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.88)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(0, 8);
      ctx.moveTo(-7, -1);
      ctx.lineTo(7, -1);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      drawStar(0, -1, 3, 1.4, 4);
    } else if (type === 'laser') {
      ctx.fillStyle = dark;
      ctx.strokeStyle = '#f2eaff';
      ctx.beginPath();
      ctx.moveTo(-13, -5);
      ctx.lineTo(2, -5);
      ctx.lineTo(8, -3);
      ctx.lineTo(13, -3);
      ctx.lineTo(14, 2);
      ctx.lineTo(5, 2);
      ctx.lineTo(2, 5);
      ctx.lineTo(-3, 5);
      ctx.lineTo(-6, 10);
      ctx.lineTo(-11, 10);
      ctx.lineTo(-9, 2);
      ctx.lineTo(-13, 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      roundedRect(1, -3.4, 7, 3, 1.3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(12, -0.5, 1.5 + Math.sin(time * 0.02) * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d6bcff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-2, -5);
      ctx.lineTo(1, -8);
      ctx.lineTo(5, -5);
      ctx.stroke();
    } else if (type === 'wand') {
      ctx.save();
      ctx.rotate(-0.6);
      ctx.strokeStyle = '#6c4f8d';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.lineTo(0, -8);
      ctx.stroke();
      ctx.strokeStyle = '#e5c98c';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-1, 7);
      ctx.lineTo(-1, -5);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, -10, 4.6 + Math.sin(time * 0.02) * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      drawStar(0, -10, 2.2, 1, 4);
      ctx.restore();
    } else if (type === 'holyStaff') {
      ctx.save();
      ctx.rotate(-0.42);
      ctx.strokeStyle = '#8c7340';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.lineTo(0, -8);
      ctx.stroke();
      ctx.strokeStyle = '#fff1b4';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-1, 8);
      ctx.lineTo(-1, -7);
      ctx.stroke();
      ctx.strokeStyle = '#fff8d8';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(0, -5);
      ctx.moveTo(-4, -10);
      ctx.lineTo(4, -10);
      ctx.stroke();
      ctx.fillStyle = '#fff4bb';
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(0, -10, 5 + Math.sin(time * 0.02) * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fffdfa';
      drawStar(0, -10, 2.5, 1, 4);
      ctx.restore();
    } else if (type === 'adrenaline') {
      ctx.save();
      ctx.rotate(-0.25);
      ctx.fillStyle = dark;
      ctx.strokeStyle = '#fff0e8';
      roundedRect(-9, -4.2, 17, 8.4, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      roundedRect(-5, -2.5, 10, 5, 1.3);
      ctx.fill();
      ctx.fillStyle = '#ffd3c6';
      ctx.fillRect(-12, -2.3, 3, 4.6);
      ctx.strokeStyle = '#e9f8ff';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(14, 0);
      ctx.stroke();
      ctx.fillStyle = '#ffede2';
      ctx.beginPath();
      ctx.moveTo(14, -1.2);
      ctx.lineTo(17, 0);
      ctx.lineTo(14, 1.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (type === 'iceShooter') {
      ctx.fillStyle = '#3d996d';
      ctx.strokeStyle = '#caffdf';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-5, 8);
      ctx.quadraticCurveTo(-13, 5, -14, 0);
      ctx.quadraticCurveTo(-6, 0, -3, 5);
      ctx.moveTo(-3, 9);
      ctx.quadraticCurveTo(5, 4, 10, 7);
      ctx.quadraticCurveTo(4, 12, -3, 9);
      ctx.stroke();
      ctx.fillStyle = '#a8f2ff';
      ctx.strokeStyle = '#efffff';
      ctx.beginPath();
      ctx.arc(1, -2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#55bdda';
      roundedRect(5, -5, 10, 6, 2.5);
      ctx.fill();
      ctx.strokeStyle = '#d9fbff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(12, -2);
      ctx.lineTo(16, -2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      drawStar(-1, -3, 2.3, 0.9, 6);
    }

    ctx.restore();
  }

  function renderItemSystem(_context, time = performance.now()) {
    if (!match || !world || !ITEM_SYSTEM_API.enabled) return;
    match.items.forEach((item) => {
      const definition = ITEM_DEFINITIONS[item.type];
      const pulse = 1 + Math.sin(time * 0.005 + item.phase) * 0.1;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = definition.color;
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.radius * 1.85 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowColor = definition.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(20, 29, 48, 0.97)';
      ctx.beginPath();
      ctx.arc(item.x, item.y, item.radius * 1.16 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = definition.color;
      ctx.stroke();
      ctx.save();
      ctx.translate(item.x, item.y);
      drawItemModel(item.type, definition.color, item.radius, time);
      ctx.restore();
      ctx.font = `800 ${Math.max(7, world.cell * 0.16)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(8, 14, 26, 0.84)';
      ctx.fillText(definition.name, item.x, item.y + item.radius * 1.16 + 9);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(definition.name, item.x, item.y + item.radius * 1.16 + 8);
      ctx.restore();
    });

    match.flames.forEach((flame) => {
      const owner = match.fighters.find((fighter) => fighter.id === flame.ownerId);
      if (!owner || owner.eliminated) return;
      const length = world.cell * ITEM_RULES.flamethrowerRangeCells;
      const width = Math.max(6, world.cell * 0.17);
      const pulse = 1 + Math.sin(time * 0.035 + flame.angle) * 0.08;
      ctx.save();
      ctx.translate(owner.x, owner.y);
      ctx.rotate(flame.angle);
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#ff512f';
      ctx.beginPath();
      ctx.moveTo(owner.size * 0.42, -width);
      ctx.lineTo(length * pulse, -length * 0.26 * pulse);
      ctx.quadraticCurveTo(length * 0.78, 0, length * pulse, length * 0.26 * pulse);
      ctx.lineTo(owner.size * 0.42, width);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(owner.size * 0.46, -width * 0.38);
      ctx.lineTo(length * 0.78 * pulse, 0);
      ctx.lineTo(owner.size * 0.46, width * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });

    match.iceShooters.forEach((iceShooter) => {
      const definition = ITEM_DEFINITIONS.iceShooter;
      const size = Math.max(12, world.cell * 0.25);
      const progress = Math.max(0, Math.min(1, iceShooter.remaining / ITEM_RULES.iceShooterDuration));
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = definition.color;
      ctx.beginPath();
      ctx.ellipse(iceShooter.x, iceShooter.y + size * 0.26, size * 0.82, size * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.88;
      ctx.strokeStyle = 'rgba(230, 251, 255, 0.8)';
      ctx.lineWidth = Math.max(1.5, world.cell * 0.035);
      ctx.beginPath();
      ctx.arc(iceShooter.x, iceShooter.y, size * 0.82, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
      ctx.save();
      ctx.translate(iceShooter.x, iceShooter.y);
      drawItemModel('iceShooter', definition.color, size, time + iceShooter.phase * 40);
      ctx.restore();
      ctx.restore();
    });

    match.projectiles.forEach((projectile) => {
      ctx.save();
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = Math.max(2, projectile.radius * 1.6);
      ctx.lineCap = 'round';
      ctx.shadowColor = projectile.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(projectile.x - projectile.vx * 0.025, projectile.y - projectile.vy * 0.025);
      ctx.lineTo(projectile.x, projectile.y);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, Math.max(1.6, projectile.radius * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    match.lasers.forEach((laser) => {
      const owner = match.fighters.find((fighter) => fighter.id === laser.ownerId);
      if (!owner || owner.eliminated) return;
      const segment = laserBeamSegment(owner, laser.angle);
      const width = Math.max(9, world.cell * ITEM_RULES.laserWidthCells);
      const pulse = 0.86 + Math.sin(time * 0.035 + laser.angle) * 0.08;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = owner.color;
      ctx.shadowColor = owner.color;
      ctx.shadowBlur = width * 1.8;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = width * 2.35 * pulse;
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
      ctx.globalAlpha = 0.88;
      ctx.shadowBlur = width * 0.7;
      ctx.lineWidth = width * pulse;
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
      ctx.globalAlpha = 0.92;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowBlur = width * 0.5;
      ctx.lineWidth = Math.max(2, width * 0.19);
      ctx.beginPath();
      ctx.moveTo(segment.x1, segment.y1);
      ctx.lineTo(segment.x2, segment.y2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = owner.color;
      ctx.shadowColor = owner.color;
      ctx.shadowBlur = width * 1.5;
      ctx.beginPath();
      ctx.arc(segment.x2, segment.y2, Math.max(4, width * 0.42), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    match.c4Charges.forEach((charge) => {
      const target = match.fighters.find((fighter) => fighter.id === charge.targetId);
      const offset = target ? target.size * 0.22 : 8;
      ctx.save();
      ctx.fillStyle = '#13231d';
      ctx.strokeStyle = ITEM_DEFINITIONS.c4.color;
      ctx.lineWidth = 2;
      roundedRect(charge.x + offset, charge.y - offset - 5, 19, 13, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 8px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`C${Math.max(1, Math.ceil(charge.remaining))}`, charge.x + offset + 9.5, charge.y - offset + 1.5);
      ctx.restore();
    });

    match.itemEffects.forEach((effect) => {
      if (effect.type === 'lightning') {
        const dx = effect.x2 - effect.x1;
        const dy = effect.y2 - effect.y1;
        const length = Math.hypot(dx, dy);
        const offset = Math.min(world.cell * 0.18, length * 0.045);
        const alpha = Math.max(0, Math.min(1, effect.life / effect.maxLife));
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#fff09a';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = '#ffd950';
        ctx.lineWidth = Math.max(3, world.cell * 0.09);
        ctx.beginPath();
        for (let index = 0; index <= 8; index += 1) {
          const amount = index / 8;
          const jitter = index === 0 || index === 8
            ? 0
            : Math.sin(time * 0.08 + effect.seed + index * 17) * offset;
          const x = effect.x1 + dx * amount + (-dy / Math.max(1, length)) * jitter;
          const y = effect.y1 + dy * amount + (dx / Math.max(1, length)) * jitter;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.4, world.cell * 0.035);
        ctx.stroke();
        ctx.fillStyle = '#fff8c7';
        ctx.beginPath();
        ctx.arc(effect.x2, effect.y2, Math.max(4, world.cell * 0.13), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }

      const progress = 1 - effect.life / effect.maxLife;
      const radius = effect.radius * Math.max(0.15, progress);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = Math.max(2, world.cell * 0.08);
      ctx.shadowColor = '#ff9f43';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });
  }

  function decrementCooldowns(map, dt) {
    map.forEach((timeLeft, key) => {
      if (timeLeft <= dt) map.delete(key);
      else map.set(key, timeLeft - dt);
    });
  }

  function isInsideRadiationPit(fighter, pit) {
    return obstacleOverlaps(fighter.x, fighter.y, fighter.size, pit);
  }

  function isInRadiationSlowZone(fighter) {
    return match.radiationPits.some((pit) => isInsideRadiationPit(fighter, pit));
  }

  function updateRadiationDamage(fighter, dt) {
    const activePitIds = new Set();
    for (const pit of match.radiationPits) {
      if (!isInsideRadiationPit(fighter, pit)) continue;
      activePitIds.add(pit.id);
      let timeLeft = fighter.radiationTimers.get(pit.id);
      if (timeLeft === undefined) {
        fighter.radiationTimers.set(pit.id, 1);
        continue;
      }
      timeLeft -= dt;
      if (timeLeft <= 0) {
        applyDamage(fighter, 2, 'radiation');
        fighter.radiationTimers.set(pit.id, 1);
        if (fighter.eliminated) break;
      } else {
        fighter.radiationTimers.set(pit.id, timeLeft);
      }
    }
    fighter.radiationTimers.forEach((_timeLeft, pitId) => {
      if (!activePitIds.has(pitId)) fighter.radiationTimers.delete(pitId);
    });
  }

  function updatePriests(dt) {
    if (!match || match.ended) return;
    match.fighters.filter((fighter) => fighter.isPriest && !fighter.eliminated).forEach((priest) => {
      priest.priestAttackCooldown = Math.max(0, priest.priestAttackCooldown - dt);
      if (priest.priestAttackCooldown > 1e-6) return;
      if (priest.priestAttacksRemaining <= 0) {
        eliminateFighter(priest, 'priestFinished');
        return;
      }
      const summoner = match.fighters.find((fighter) => fighter.id === priest.summonerId) || null;
      const target = pickMostThreateningTarget(summoner, priest);
      if (!target) {
        priest.priestAttackCooldown = 0.2;
        return;
      }

      match.itemEffects.push({
        type: 'lightning',
        x1: priest.x,
        y1: priest.y,
        x2: target.x,
        y2: target.y,
        life: ITEM_RULES.lightningEffectDuration,
        maxLife: ITEM_RULES.lightningEffectDuration,
        seed: Math.random() * Math.PI * 2,
      });
      applyDamage(target, ITEM_RULES.priestDamage, 'holyLightning', true, priest.id);
      priest.priestAttacksRemaining -= 1;
      addEvent(`${priest.name} 对 ${target.name} 施展必中神雷（-${ITEM_RULES.priestDamage} HP）`, ITEM_DEFINITIONS.holyStaff.color);
      showToast(`${target.name} 被神圣雷击命中！`);
      if (priest.priestAttacksRemaining <= 0) eliminateFighter(priest, 'priestFinished');
      else priest.priestAttackCooldown = ITEM_RULES.priestAttackInterval;
    });
  }

  function update(dt) {
    if (!match) return;
    if (match.paused) {
      if (match.ended) {
        updateEffects(dt);
        updateItemEffects(dt);
      }
      return;
    }
    match.simulationTime += dt;
    decrementCooldowns(match.pairCooldowns, dt);
    decrementCooldowns(match.obstacleCooldowns, dt);
    decrementCooldowns(match.cactusDamageCooldowns, dt);
    const now = performance.now();

    match.fighters.forEach((fighter) => {
      if (fighter.eliminated) return;
      fighter.previousX = fighter.x;
      fighter.previousY = fighter.y;
      if (fighter.damageNumber) {
        fighter.damageNumber.remaining = Math.max(0, fighter.damageNumber.remaining - dt);
        if (fighter.damageNumber.remaining <= 0) fighter.damageNumber = null;
      }
      if (fighter.isZombie) {
        fighter.zombieContactCooldown = Math.max(0, fighter.zombieContactCooldown - dt);
        fighter.zombieHealthDrainRemaining = Math.max(0, fighter.zombieHealthDrainRemaining - dt);
        while (fighter.zombieHealthDrainRemaining <= 1e-6 && !fighter.eliminated) {
          applyDamage(fighter, ITEM_RULES.zombieHealthDrain, 'zombieDecay', false);
          if (!fighter.eliminated) fighter.zombieHealthDrainRemaining += ITEM_RULES.zombieHealthDrainInterval;
        }
        if (fighter.eliminated) return;
      }
      const adrenalineScale = fighter.adrenalineRemaining > 0 ? ITEM_RULES.adrenalineSpeedMultiplier : 1;
      const slowScale = fighter.slowRemaining > 0 ? fighter.slowFactor : 1;
      const radiationScale = isInRadiationSlowZone(fighter) ? 0.5 : 1;
      const movementScale = adrenalineScale * slowScale * radiationScale;
      fighter.x += fighter.vx * dt * movementScale;
      fighter.y += fighter.vy * dt * movementScale;
      const friction = MAP_DEFINITIONS[match.config.mapType].friction;
      const drag = Math.pow(1 - friction, dt * 60);
      fighter.vx *= drag;
      fighter.vy *= drag;
      fighter.angle = Math.atan2(fighter.vy, fighter.vx);
      updateWalls(fighter);
      resolveObstacleCollisions(fighter, true);
      updateRadiationDamage(fighter, dt);
      if (fighter.eliminated) return;
      fighter.adrenalineRemaining = Math.max(0, fighter.adrenalineRemaining - dt);
      fighter.slowRemaining = Math.max(0, fighter.slowRemaining - dt);
      if (fighter.slowRemaining <= 1e-6) {
        fighter.slowRemaining = 0;
        fighter.slowFactor = 1;
      }

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
        if (fighter.eliminated) return;
        resolveObstacleCollisions(fighter, true);
        keepInside(fighter, true);
      });
    }
    match.obstacles = match.obstacles.filter((obstacle) => !obstacle.destroyed);
    updatePriests(dt);
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
    const map = MAP_DEFINITIONS[match.config.mapType] || MAP_DEFINITIONS.empty;
    ctx.clearRect(0, 0, world.width, world.height);
    ctx.fillStyle = map.base;
    ctx.fillRect(0, 0, world.width, world.height);

    const glow = ctx.createLinearGradient(0, 0, world.width, world.height);
    glow.addColorStop(0, map.glowA);
    glow.addColorStop(0.48, 'rgba(31, 42, 71, 0.02)');
    glow.addColorStop(1, map.glowB);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, world.width, world.height);

    ctx.beginPath();
    ctx.strokeStyle = map.grid;
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
    ctx.shadowColor = map.borderGlow;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = map.borderGlow;
    ctx.lineWidth = 3;
    ctx.strokeRect(world.border / 2, world.border / 2, world.width - world.border, world.height - world.border);
    ctx.restore();

    ctx.strokeStyle = map.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(world.border + 5.5, world.border + 5.5, world.width - (world.border + 5.5) * 2, world.height - (world.border + 5.5) * 2);

    if (match.config.mapType === 'ice') drawIceSurface();
    if (match.config.mapType === 'nuclear') drawRadiationPits(performance.now());

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

  function drawIceSurface() {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = 'rgba(202, 246, 255, 0.35)';
    ctx.lineWidth = 2;
    const facets = [
      [0.08, 0.2, 0.28, 0.12], [0.42, 0.16, 0.54, 0.26], [0.72, 0.25, 0.91, 0.16],
      [0.13, 0.66, 0.31, 0.74], [0.53, 0.54, 0.7, 0.66], [0.72, 0.83, 0.9, 0.74],
    ];
    facets.forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(world.width * x1, world.height * y1);
      ctx.lineTo(world.width * x2, world.height * y2);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawRadiationPits(time) {
    match.radiationPits.forEach((pit) => {
      const pulse = 0.72 + Math.sin(time * 0.002 + pit.phase) * 0.1;
      ctx.save();
      ctx.translate(pit.x, pit.y);
      ctx.rotate(-0.12);
      ctx.globalAlpha = pulse;
      ctx.shadowColor = '#b8ff49';
      ctx.shadowBlur = 22;
      ctx.fillStyle = 'rgba(137, 204, 50, 0.29)';
      roundedRect(-pit.width / 2, -pit.height / 2, pit.width, pit.height, pit.height * 0.42);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(201, 255, 117, 0.92)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(226, 255, 170, 0.52)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, pit.width * 0.34, pit.height * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(235, 255, 190, 0.88)';
      ctx.font = `${Math.max(10, world.cell * 0.42)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☢', 0, 1);
      ctx.restore();
    });
  }

  function drawTree(obstacle, time) {
    const { x, y, width, height } = obstacle;
    const sway = Math.sin(time * 0.0014 + obstacle.variant) * width * 0.035;
    ctx.fillStyle = '#69462f';
    roundedRect(x - width * 0.12, y - height * 0.08, width * 0.24, height * 0.47, width * 0.07);
    ctx.fill();
    const foliage = match.config.mapType === 'nuclear'
      ? ['#88c84c', '#65ad43', '#a1dc50']
      : ['#42a879', '#2f8c68', '#70bc79'];
    [[-0.23, -0.1], [0.2, -0.12], [0, -0.32]].forEach(([offset, vertical], index) => {
      ctx.fillStyle = foliage[(index + obstacle.variant) % foliage.length];
      ctx.beginPath();
      ctx.arc(x + offset * width + (index === 1 ? sway : 0), y + vertical * height, width * (index === 2 ? 0.29 : 0.34), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = 'rgba(226, 255, 214, 0.68)';
    ctx.lineWidth = Math.max(1, width * 0.025);
    ctx.beginPath();
    ctx.arc(x, y - height * 0.26, width * 0.3, Math.PI * 1.04, Math.PI * 1.82);
    ctx.stroke();
  }

  function drawRock(obstacle) {
    const { x, y, width, height } = obstacle;
    ctx.beginPath();
    ctx.moveTo(x - width * 0.5, y + height * 0.25);
    ctx.lineTo(x - width * 0.38, y - height * 0.21);
    ctx.lineTo(x - width * 0.11, y - height * 0.49);
    ctx.lineTo(x + width * 0.27, y - height * 0.37);
    ctx.lineTo(x + width * 0.5, y + height * 0.2);
    ctx.lineTo(x + width * 0.22, y + height * 0.48);
    ctx.lineTo(x - width * 0.3, y + height * 0.43);
    ctx.closePath();
    const stone = ctx.createLinearGradient(x, y - height / 2, x, y + height / 2);
    stone.addColorStop(0, '#b1ad98');
    stone.addColorStop(1, '#625f59');
    ctx.fillStyle = stone;
    ctx.fill();
    ctx.strokeStyle = 'rgba(242, 233, 210, 0.76)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawCactus(obstacle, time) {
    const { x, y, width, height } = obstacle;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#4b3825';
    ctx.lineWidth = width * 0.22;
    ctx.beginPath();
    ctx.moveTo(x, y + height * 0.44);
    ctx.lineTo(x + Math.sin(time * 0.001 + obstacle.variant) * width * 0.025, y - height * 0.42);
    ctx.moveTo(x - width * 0.25, y + height * 0.15);
    ctx.lineTo(x - width * 0.25, y - height * 0.1);
    ctx.lineTo(x - width * 0.08, y - height * 0.1);
    ctx.moveTo(x + width * 0.25, y + height * 0.1);
    ctx.lineTo(x + width * 0.25, y - height * 0.13);
    ctx.lineTo(x + width * 0.08, y - height * 0.13);
    ctx.stroke();
    ctx.strokeStyle = '#74bf68';
    ctx.lineWidth = width * 0.14;
    ctx.stroke();
    ctx.fillStyle = 'rgba(225, 255, 194, 0.8)';
    for (let index = 0; index < 5; index += 1) {
      const spikeY = y - height * 0.3 + index * height * 0.14;
      ctx.fillRect(x - width * 0.035, spikeY, width * 0.07, Math.max(1, width * 0.07));
    }
    ctx.restore();
  }

  function drawObstacleShadow(obstacle) {
    ctx.save();
    ctx.fillStyle = 'rgba(17, 27, 36, 0.35)';
    ctx.beginPath();
    ctx.ellipse(obstacle.x + 2, obstacle.y + obstacle.height * 0.34, obstacle.width * 0.48, obstacle.height * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawObstacleHealthBar(obstacle) {
    const ratio = obstacle.maxHealth > 0 ? Math.max(0, obstacle.health / obstacle.maxHealth) : 0;
    const barWidth = Math.max(30, obstacle.width * 1.22);
    const barHeight = Math.max(3, world.cell * 0.065);
    const barX = obstacle.x - barWidth / 2;
    const barY = obstacle.y - obstacle.height / 2 - barHeight - 5;
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.font = `700 ${Math.max(6, world.cell * 0.14)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText(`${Math.ceil(obstacle.health)}/${obstacle.maxHealth}`, obstacle.x, barY - 1);
    ctx.fillStyle = 'rgba(10, 18, 27, 0.8)';
    roundedRect(barX, barY, barWidth, barHeight, barHeight / 2);
    ctx.fill();
    ctx.fillStyle = ratio > 0.5 ? '#78dc8b' : (ratio > 0.25 ? '#ffd166' : '#ff7184');
    if (ratio > 0) {
      roundedRect(barX, barY, Math.max(barHeight, barWidth * ratio), barHeight, barHeight / 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawObstacles(time) {
    if (!match.obstacles.length) return;
    match.obstacles.forEach((obstacle, index) => {
      if (obstacle.destroyed) return;
      ctx.save();
      drawObstacleShadow(obstacle);
      if (obstacle.kind === 'tree') drawTree(obstacle, time);
      else if (obstacle.kind === 'rock') drawRock(obstacle);
      else if (obstacle.kind === 'cactus') drawCactus(obstacle, time);
      ctx.globalAlpha = 0.2 + Math.sin(time * 0.003 + index) * 0.06;
      ctx.fillStyle = obstacle.accent;
      ctx.beginPath();
      ctx.ellipse(obstacle.x, obstacle.y + obstacle.height * 0.44, obstacle.width * 0.37, obstacle.height * 0.065, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawObstacleHealthBar(obstacle);
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

  function drawShieldIndicator(fighter, visualY) {
    if (!fighter.shield || fighter.shield.health <= 0) return;
    const ratio = Math.max(0, Math.min(1, fighter.shield.health / fighter.shield.maxHealth));
    const radius = fighter.size * 0.78;
    const lineWidth = Math.max(1.7, fighter.size * 0.045);
    ctx.save();
    ctx.translate(fighter.x, visualY);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.setLineDash([fighter.size * 0.14, fighter.size * 0.09]);
    ctx.strokeStyle = 'rgba(105, 212, 255, 0.42)';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.65 + ratio * 0.35;
    ctx.strokeStyle = ITEM_DEFINITIONS.shield.color;
    ctx.shadowColor = ITEM_DEFINITIONS.shield.color;
    ctx.shadowBlur = fighter.size * 0.16;
    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
    ctx.restore();
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

  function drawZombieFace(size) {
    const eyeY = -size * 0.12;
    const eyeDX = size * 0.18;
    const eyeWidth = size * 0.22;
    const eyeHeight = size * 0.19;

    [-eyeDX, eyeDX].forEach((eyeX, index) => {
      ctx.fillStyle = '#310e1a';
      ctx.beginPath();
      ctx.moveTo(eyeX - eyeWidth * 0.56, eyeY + eyeHeight * 0.16);
      ctx.quadraticCurveTo(eyeX, eyeY - eyeHeight * 0.72, eyeX + eyeWidth * 0.56, eyeY - eyeHeight * 0.06);
      ctx.quadraticCurveTo(eyeX + eyeWidth * 0.05, eyeY + eyeHeight * 0.68, eyeX - eyeWidth * 0.56, eyeY + eyeHeight * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.shadowColor = '#ff1738';
      ctx.shadowBlur = Math.max(3, size * 0.13);
      ctx.fillStyle = index ? '#ff273e' : '#ff1738';
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, eyeWidth * 0.33, eyeHeight * 0.39, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#260914';
      ctx.beginPath();
      ctx.ellipse(eyeX, eyeY, Math.max(0.8, size * 0.027), eyeHeight * 0.33, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#35111e';
      ctx.lineWidth = Math.max(1.1, size * 0.055);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(eyeX - eyeWidth * 0.62, eyeY - eyeHeight * 0.48 + index * size * 0.035);
      ctx.lineTo(eyeX + eyeWidth * 0.48, eyeY - eyeHeight * 0.22 - index * size * 0.035);
      ctx.stroke();
    });

    ctx.fillStyle = '#2b111a';
    ctx.beginPath();
    ctx.ellipse(0, size * 0.2, size * 0.145, size * 0.085, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4d9d7';
    ctx.beginPath();
    ctx.moveTo(-size * 0.1, size * 0.15);
    ctx.lineTo(-size * 0.035, size * 0.15);
    ctx.lineTo(-size * 0.065, size * 0.23);
    ctx.closePath();
    ctx.moveTo(size * 0.035, size * 0.15);
    ctx.lineTo(size * 0.1, size * 0.15);
    ctx.lineTo(size * 0.067, size * 0.23);
    ctx.closePath();
    ctx.fill();
  }

  function drawPriestAdornment(size, time) {
    ctx.save();
    ctx.strokeStyle = '#fff0a2';
    ctx.lineWidth = Math.max(1.2, size * 0.045);
    ctx.shadowColor = '#ffe989';
    ctx.shadowBlur = size * 0.12;
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.49, size * 0.2, size * (0.07 + Math.sin(time * 0.004) * 0.006), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fff8d6';
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.43);
    ctx.lineTo(0, -size * 0.33);
    ctx.moveTo(-size * 0.045, -size * 0.38);
    ctx.lineTo(size * 0.045, -size * 0.38);
    ctx.stroke();
    ctx.restore();
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

  function drawFighterHealthBar(fighter, size) {
    if (fighter.health >= fighter.maxHealth) return;
    const ratio = Math.max(0, Math.min(1, fighter.health / fighter.maxHealth));
    const width = size * 0.82;
    const height = Math.max(2, size * 0.065);
    const x = -width / 2;
    const y = size / 2 + size * 0.11;
    ctx.fillStyle = 'rgba(10, 18, 27, 0.82)';
    roundedRect(x, y, width, height, height / 2);
    ctx.fill();
    if (ratio > 0) {
      ctx.fillStyle = ratio > 0.5 ? '#78dc8b' : (ratio > 0.25 ? '#ffd166' : '#ff7184');
      roundedRect(x, y, Math.max(height, width * ratio), height, height / 2);
      ctx.fill();
    }
  }

  function drawDamageNumber(fighter, size) {
    const indicator = fighter.damageNumber;
    if (!indicator || indicator.remaining <= 0) return;
    const progress = 1 - indicator.remaining / indicator.maxRemaining;
    const alpha = Math.max(0, Math.min(1, indicator.remaining / (indicator.maxRemaining * 0.42)));
    const rise = size * 0.42 * progress;
    const label = `−${formatHealthAmount(indicator.amount)}`;
    const color = indicator.shielded && indicator.healthDamage <= 0 ? '#69d4ff' : '#ff6579';

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.max(9, size * 0.24)}px system-ui`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.075);
    ctx.strokeStyle = 'rgba(9, 15, 28, 0.92)';
    ctx.strokeText(label, 0, -size * 0.76 - rise);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.max(3, size * 0.12);
    ctx.fillText(label, 0, -size * 0.76 - rise);
    ctx.restore();
  }

  function drawHeldItemModels(fighter, time) {
    const heldCount = fighter.heldItems.length;
    const itemRadius = Math.max(6, Math.min(9.5, fighter.size * 0.2));
    const half = fighter.size / 2;

    const drawHeldModel = (type, angle) => {
      const definition = ITEM_DEFINITIONS[type];
      if (!definition) return;
      const reach = half + itemRadius * 0.88;
      const handX = reach - itemRadius * 0.55;

      ctx.save();
      ctx.rotate(angle);
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(2, fighter.size * 0.085);
      ctx.strokeStyle = fighter.dark;
      ctx.beginPath();
      ctx.moveTo(half * 0.72, 0);
      ctx.lineTo(handX, 0);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, fighter.size * 0.035);
      ctx.strokeStyle = fighter.light;
      ctx.beginPath();
      ctx.moveTo(half * 0.74, -fighter.size * 0.012);
      ctx.lineTo(handX, -fighter.size * 0.012);
      ctx.stroke();
      ctx.fillStyle = '#fff0ca';
      ctx.strokeStyle = 'rgba(33, 45, 64, 0.86)';
      ctx.lineWidth = Math.max(0.8, fighter.size * 0.025);
      ctx.beginPath();
      ctx.arc(handX, 0, Math.max(1.6, itemRadius * 0.23), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.rotate(angle);
      ctx.translate(reach, 0);
      drawItemModel(type, definition.color, itemRadius, time);
      ctx.restore();
    };

    fighter.heldItems.forEach((item, index) => {
      const spread = (index - (heldCount - 1) / 2) * 0.68;
      drawHeldModel(item.type, fighter.angle + spread);
    });
    if (fighter.shield && fighter.shield.health > 0) {
      drawHeldModel('shield', fighter.angle + Math.PI * 0.8);
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
    drawShieldIndicator(fighter, visualY);
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

    if (fighter.isZombie) drawZombieFace(size);
    else if (mood === 'wall' || mood === 'hurt') drawSurprisedFace(size, lookX, lookY);
    else if (mood === 'bump' || mood === 'obstacle') drawBumpedFace(size);
    else if (mood === 'dizzy') drawDizzyFace(size, time);
    else drawPersonalityFace(fighter, size, lookX, lookY);
    if (fighter.isPriest) drawPriestAdornment(size, time);

    if (mood === 'wall' || mood === 'obstacle') {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = `800 ${Math.max(7, size * 0.2)}px system-ui`;
      ctx.fillText(mood === 'wall' ? '!' : '✦', half * 0.68, -half * 0.57);
    } else if (mood === 'bump') {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = `800 ${Math.max(6, size * 0.16)}px system-ui`;
      ctx.fillText('✦', half * 0.7, -half * 0.55);
    }
    drawFighterHealthBar(fighter, size);
    drawHeldItemModels(fighter, time);
    drawDamageNumber(fighter, size);
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
      match.fighters.forEach((fighter) => {
        if (!fighter.eliminated) drawFighter(fighter, time);
      });
      ITEM_SYSTEM_API.render(match, time);
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
      matchState.querySelector('span').textContent = MAP_DEFINITIONS[match.config.mapType].status;
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

  function addDecimalInputSync(range, number, output, min, max, precision = 1) {
    const factor = 10 ** precision;
    const format = (value) => Number(value).toFixed(precision);
    const sync = (rawValue, fromNumber = false, commitNumber = false) => {
      const fallback = Number(range.value) || min;
      const parsed = Number(rawValue);
      const value = Number.isFinite(parsed)
        ? Math.round(Math.max(min, Math.min(max, parsed)) * factor) / factor
        : fallback;
      range.value = String(value);
      if (!fromNumber || commitNumber) number.value = format(value);
      output.value = format(value);
      output.textContent = format(value);
    };
    range.addEventListener('input', () => sync(range.value));
    number.addEventListener('input', () => {
      if (number.value !== '') sync(number.value, true);
    });
    number.addEventListener('change', () => {
      if (number.value !== '') sync(number.value, true, true);
    });
  }

  function readFormConfig() {
    return normalizeMatchConfig({
      blockCount: blockCountNumber.value,
      blockHealth: blockHealthNumber.value,
      obstacleCount: obstacleCountNumber.value,
      mapType: mapTypeSelect.value,
      collisionAcceleration: collisionAccelerationToggle.checked,
      speedMultiplier: moveSpeedNumber.value,
    }, activeConfig);
  }

  function writeFormConfig(config) {
    blockCountRange.value = String(config.blockCount);
    blockCountNumber.value = String(config.blockCount);
    blockCountOutput.value = String(config.blockCount);
    blockCountOutput.textContent = String(config.blockCount);
    blockHealthRange.value = String(config.blockHealth);
    blockHealthNumber.value = String(config.blockHealth);
    blockHealthOutput.value = String(config.blockHealth);
    blockHealthOutput.textContent = String(config.blockHealth);
    moveSpeedRange.value = String(config.speedMultiplier);
    moveSpeedNumber.value = config.speedMultiplier.toFixed(1);
    moveSpeedOutput.value = config.speedMultiplier.toFixed(1);
    moveSpeedOutput.textContent = config.speedMultiplier.toFixed(1);
    obstacleCountRange.value = String(config.obstacleCount);
    obstacleCountNumber.value = String(config.obstacleCount);
    obstacleCountOutput.value = String(config.obstacleCount);
    obstacleCountOutput.textContent = String(config.obstacleCount);
    mapTypeSelect.value = config.mapType;
    formMapType = config.mapType;
    collisionAccelerationToggle.checked = config.collisionAcceleration;
    mapDescription.textContent = MAP_DEFINITIONS[config.mapType].description;
    obstacleControl.hidden = !MAP_DEFINITIONS[config.mapType].obstacleKinds.length;
  }

  mapTypeSelect.addEventListener('change', () => {
    const nextMap = MAP_DEFINITIONS[mapTypeSelect.value] || MAP_DEFINITIONS.empty;
    const previousMap = MAP_DEFINITIONS[formMapType] || MAP_DEFINITIONS.empty;
    const currentCount = Number(obstacleCountNumber.value);
    const nextCount = nextMap.obstacleKinds.length
      ? (previousMap.obstacleKinds.length === 0 ? nextMap.defaultObstacleCount : currentCount)
      : 0;
    obstacleCountRange.value = String(nextCount);
    obstacleCountNumber.value = String(nextCount);
    obstacleCountOutput.value = String(nextCount);
    obstacleCountOutput.textContent = String(nextCount);
    mapDescription.textContent = nextMap.description;
    obstacleControl.hidden = !nextMap.obstacleKinds.length;
    formMapType = mapTypeSelect.value;
  });

  addFormInputSync(blockCountRange, blockCountNumber, blockCountOutput, MATCH_LIMITS.blockCount.min, MATCH_LIMITS.blockCount.max);
  addFormInputSync(blockHealthRange, blockHealthNumber, blockHealthOutput, MATCH_LIMITS.blockHealth.min, MATCH_LIMITS.blockHealth.max);
  addDecimalInputSync(
    moveSpeedRange,
    moveSpeedNumber,
    moveSpeedOutput,
    MATCH_LIMITS.speedMultiplier.min,
    MATCH_LIMITS.speedMultiplier.max,
    1,
  );
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
      aliveCount: match.fighters.filter((fighter) => !fighter.eliminated).length,
      counters: {
        collisions: match.collisions,
        wallHits: match.wallHits,
        blockHits: match.blockHits,
        obstacleHits: match.obstacleHits,
        obstaclesDestroyed: match.obstaclesDestroyed,
        eliminations: match.eliminations,
        itemUses: match.itemUses,
        projectileHits: match.projectileHits,
        laserHits: match.laserHits,
        c4Detonations: match.c4Detonations,
      },
      items: getItemSystemSnapshot(),
      blocks: match.fighters.map((fighter) => ({
        id: fighter.id,
        name: fighter.name,
        color: fighter.color,
        x: fighter.x,
        y: fighter.y,
        face: fighter.faceMood,
        health: fighter.health,
        maxHealth: fighter.maxHealth,
        shield: fighter.shield ? { ...fighter.shield } : null,
        eliminated: fighter.eliminated,
        isZombie: fighter.isZombie,
        isPriest: fighter.isPriest,
        summonerId: fighter.summonerId,
        zombieHealthDrainRemaining: Number(fighter.zombieHealthDrainRemaining.toFixed(3)),
        zombieContactCooldown: Number(fighter.zombieContactCooldown.toFixed(3)),
        priestAttacksRemaining: fighter.priestAttacksRemaining,
        priestAttackCooldown: Number(fighter.priestAttackCooldown.toFixed(3)),
        adrenalineRemaining: Number(fighter.adrenalineRemaining.toFixed(3)),
        slowRemaining: Number(fighter.slowRemaining.toFixed(3)),
        damageNumber: fighter.damageNumber ? { ...fighter.damageNumber } : null,
        heldItems: fighter.heldItems.map((item) => item.type),
      })),
      obstacles: match.obstacles.map((obstacle) => ({ ...obstacle })),
      radiationPits: match.radiationPits.map((pit) => ({ ...pit })),
      platforms: match.radiationPits.map((pit) => ({ ...pit })),
      paused: match.paused,
    };
  }

  const obstacleSystemAPI = Object.freeze({
    id: 'obstacles',
    create: createObstacles,
    getCurrent: () => (match ? match.obstacles.map((obstacle) => ({ ...obstacle })) : []),
  });

  window.BlockBounce = Object.freeze({
    version: '0.7.0',
    defaults: DEFAULT_MATCH_CONFIG,
    limits: MATCH_LIMITS,
    itemRules: ITEM_RULES,
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
