/* 烬隙 / ASHFALL
 * 原创纯前端像素炼金地牢。无外部依赖、无构建步骤、无网络素材。
 * 核心：逐像素材料 CA、密度/反应/温度、径向照明、顺序法杖结算、程序生成纵向世界。
 */
'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  ctx.imageSmoothingEnabled = false;

  const VW = canvas.width || 480;
  const VH = canvas.height || 270;
  const WW = 480;
  const ZONE_H = 600;
  const WORLD_H = 3840;
  const CELL_COUNT = WW * WORLD_H;
  const STEP = 1 / 60;
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sign = v => v < 0 ? -1 : v > 0 ? 1 : 0;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const idx = (x, y) => y * WW + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < WW && y < WORLD_H;

  function makeRng(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  let seed = 0;
  let rng = makeRng(1);
  const rand = (a = 0, b = 1) => a + rng() * (b - a);
  const randInt = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function hash2(x, y, salt = 0) {
    let h = Math.imul((x | 0) ^ 0x45d9f3b, 0x27d4eb2d) ^ Math.imul((y | 0) ^ salt, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return (h ^ (h >>> 15)) >>> 0;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 材料定义：固体 / 粉末 / 液体 / 气体 / 火焰
  // ────────────────────────────────────────────────────────────────────────────
  const M = {};
  const materials = [];

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixColor(a, b, t) {
    return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t))];
  }
  function makePalette(hex) {
    const c = rgb(hex);
    return [mixColor(c, [0, 0, 0], .48), mixColor(c, [0, 0, 0], .18), c, mixColor(c, [255, 255, 255], .18)];
  }
  function addMaterial(key, name, kind, color, options = {}) {
    const id = materials.length;
    M[key] = id;
    materials.push({
      id, key, name, kind, color,
      colors: makePalette(color),
      density: options.density ?? (kind === 'liquid' ? 1000 : kind === 'gas' ? 10 : 1500),
      hardness: options.hardness ?? (kind === 'static' ? 4 : 1),
      durability: options.durability ?? (kind === 'static' ? 8 : 2),
      corrodible: options.corrodible ?? true,
      burn: options.burn ?? 0,
      light: options.light || null,
      meltTo: options.meltTo ?? -1,
      freezeTo: options.freezeTo ?? -1,
      emissive: options.emissive ?? false,
      sticky: options.sticky ?? false,
      description: options.description || ''
    });
  }

  addMaterial('AIR', '空气', 'gas', '#050608', { density: 1, hardness: 0, durability: 0, corrodible: false });
  addMaterial('ROCK', '岩层', 'static', '#464a52', { hardness: 7, durability: 10 });
  addMaterial('HARD_ROCK', '致密岩', 'static', '#30333a', { hardness: 11, durability: 14 });
  addMaterial('DIRT', '矿土', 'static', '#5a4435', { hardness: 3, durability: 7 });
  addMaterial('SOIL', '菌土', 'powder', '#40362d', { hardness: 1, durability: 4 });
  addMaterial('SAND', '流砂', 'powder', '#a67e4e', { hardness: 1, durability: 4 });
  addMaterial('ASH', '余烬灰', 'powder', '#68615a', { hardness: 1, durability: 3 });
  addMaterial('COAL', '黑煤', 'powder', '#24252a', { hardness: 2, durability: 7, burn: .16 });
  addMaterial('GUNPOWDER', '火药砂', 'powder', '#4b4542', { hardness: 1, durability: 4, burn: .55 });
  addMaterial('GOLD_DUST', '金砂', 'powder', '#d7ad3f', { hardness: 1, durability: 3 });
  addMaterial('STEEL_DUST', '钢屑', 'powder', '#707780', { hardness: 3, durability: 8 });
  addMaterial('WOOD', '古木', 'static', '#69462f', { hardness: 2, durability: 5, burn: .78 });
  addMaterial('PLANK', '支架木板', 'static', '#8a5c36', { hardness: 2, durability: 5, burn: .72 });
  addMaterial('ROOT', '纠缠根须', 'static', '#4f5330', { hardness: 2, durability: 5, burn: .36 });
  addMaterial('BRICK', '旧砖', 'static', '#665044', { hardness: 5, durability: 11 });
  addMaterial('STEEL', '锈蚀钢', 'static', '#626a70', { hardness: 8, durability: 12, corrodible: false });
  addMaterial('COPPER', '赤铜块', 'static', '#a45b3f', { hardness: 6, durability: 10, corrodible: false });
  addMaterial('GLASS', '旧玻璃', 'static', '#789a9b', { hardness: 2, durability: 4 });
  addMaterial('ICE', '蓝冰', 'static', '#75b9d2', { hardness: 2, durability: 5, corrodible: false });
  addMaterial('SNOW', '积雪', 'powder', '#c8dce4', { hardness: 1, durability: 2 });
  addMaterial('MUD', '湿泥', 'powder', '#44372c', { hardness: 1, durability: 3, sticky: true });
  addMaterial('FUNGI', '菌肉', 'static', '#687147', { hardness: 1, durability: 4, burn: .28 });
  addMaterial('GLOW_CAP', '荧菌', 'static', '#63a957', { hardness: 1, durability: 4, light: [90, 255, 120], emissive: true, burn: .3 });
  addMaterial('OBSIDIAN', '黑曜石', 'static', '#242230', { hardness: 14, durability: 22, corrodible: false });
  addMaterial('HOLY_BRICK', '静室砖', 'static', '#5e5267', { hardness: 6, durability: 12, corrodible: false, light: [135, 95, 180] });

  addMaterial('WATER', '水', 'liquid', '#2e7898', { density: 1000, hardness: 0, durability: 1, corrodible: false });
  addMaterial('BRINE', '浓卤', 'liquid', '#416f75', { density: 1120, hardness: 0, durability: 1, corrodible: false });
  addMaterial('OIL', '黑油', 'liquid', '#51402d', { density: 720, hardness: 0, durability: 2, burn: .9 });
  addMaterial('BLOOD', '血', 'liquid', '#8f2633', { density: 1250, hardness: 0, durability: 1, corrodible: false });
  addMaterial('ACID', '强酸', 'liquid', '#7fbd35', { density: 1080, hardness: 0, durability: 1, corrodible: false, light: [80, 210, 40] });
  addMaterial('LAVA', '熔岩', 'liquid', '#ee541f', { density: 1800, hardness: 0, durability: 1, corrodible: false, light: [255, 80, 12], emissive: true });
  addMaterial('MOLTEN_METAL', '熔融金属', 'liquid', '#d9792b', { density: 2050, hardness: 0, durability: 1, corrodible: false, light: [255, 145, 24], emissive: true });
  addMaterial('ALCOHOL', '烈酒', 'liquid', '#a47c45', { density: 680, hardness: 0, durability: 1, corrodible: false, burn: 1 });
  addMaterial('MAGIC', '奥能液', 'liquid', '#814fc2', { density: 980, hardness: 0, durability: 1, corrodible: false, light: [145, 55, 220] });
  addMaterial('TOXIC', '腐毒', 'liquid', '#668a29', { density: 1150, hardness: 0, durability: 1, corrodible: false, light: [85, 150, 30] });
  addMaterial('SLIME', '活性黏液', 'liquid', '#659c5b', { density: 1040, hardness: 0, durability: 1, corrodible: false, sticky: true });
  addMaterial('TAR', '焦油', 'liquid', '#2e292b', { density: 1320, hardness: 0, durability: 2, burn: .48 });

  addMaterial('FIRE', '火', 'fire', '#ff7a22', { density: 2, hardness: 0, durability: 1, corrodible: false, light: [255, 92, 18], emissive: true });
  addMaterial('STEAM', '蒸汽', 'gas', '#aabfc4', { density: 5, hardness: 0, durability: 1, corrodible: false, light: [85, 115, 125] });
  addMaterial('SMOKE', '烟', 'gas', '#55545a', { density: 7, hardness: 0, durability: 1, corrodible: false });
  addMaterial('TOXIC_GAS', '毒气', 'gas', '#73913a', { density: 8, hardness: 0, durability: 1, corrodible: false, light: [70, 120, 25] });
  addMaterial('METHANE', '可燃气', 'gas', '#71855a', { density: 4, hardness: 0, durability: 1, corrodible: false });
  addMaterial('FUNGUS_GAS', '孢子云', 'gas', '#829a58', { density: 6, hardness: 0, durability: 1, corrodible: false });
  addMaterial('FROST_GAS', '霜雾', 'gas', '#8cc8d9', { density: 9, hardness: 0, durability: 1, corrodible: false, light: [80, 175, 210] });
  addMaterial('ACID_GAS', '酸雾', 'gas', '#7aaa45', { density: 6, hardness: 0, durability: 1, corrodible: false, light: [80, 175, 40] });
  addMaterial('HEAL_GAS', '愈合雾', 'gas', '#63cfa1', { density: 11, hardness: 0, durability: 1, corrodible: false, light: [60, 235, 145] });

  const SOLID = new Set();
  const BLOCKS_BODY = new Set();
  const POWDERS = new Set();
  const LIQUIDS = new Set();
  const GASES = new Set();
  for (const m of materials) {
    if (m.kind === 'static') { SOLID.add(m.id); BLOCKS_BODY.add(m.id); }
    if (m.kind === 'powder') { POWDERS.add(m.id); BLOCKS_BODY.add(m.id); }
    if (m.kind === 'liquid') LIQUIDS.add(m.id);
    if (m.kind === 'gas' || m.kind === 'fire') GASES.add(m.id);
  }

  function materialName(id) { return materials[id]?.name || '未知物质'; }
  function materialKind(id) {
    const kind = materials[id]?.kind || 'static';
    return { static: '固体', powder: '粉末', liquid: '液体', gas: '气体', fire: '火焰' }[kind];
  }
  function defaultLife(id) {
    if (id === M.FIRE) return 120;
    if (id === M.STEAM) return 240;
    if (id === M.SMOKE) return 210;
    if (id === M.TOXIC_GAS || id === M.FUNGUS_GAS || id === M.ACID_GAS) return 420;
    if (id === M.METHANE || id === M.FROST_GAS) return 260;
    if (id === M.HEAL_GAS) return 180;
    return 0;
  }
  function defaultTemp(id) {
    if (id === M.LAVA || id === M.MOLTEN_METAL) return 120;
    if (id === M.FIRE) return 70;
    if (id === M.STEAM) return 45;
    if (id === M.SNOW || id === M.ICE || id === M.FROST_GAS) return -45;
    return 0;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 原创法术：弹体、修饰、触发器
  // ────────────────────────────────────────────────────────────────────────────
  const PROJECTILES = {
    spark: {
      name: '电磁火花', icon: '✦', mana: 5, delay: 7, damage: 12, speed: 5.7, life: 82,
      color: '#b9f4ff', light: [105, 225, 255], radius: 1, pierce: 0, trail: M.SMOKE,
      effect: '廉价高速电火花，命中时短暂连锁。'
    },
    ember: {
      name: '炽焰弹', icon: '✹', mana: 18, delay: 20, damage: 31, speed: 3.9, life: 105,
      color: '#ff8a35', light: [255, 90, 18], radius: 3, explosion: 8, trail: M.FIRE,
      effect: '爆开并点燃附近可燃物。'
    },
    venom: {
      name: '孢子弹', icon: '♣', mana: 12, delay: 13, damage: 15, speed: 4.4, life: 88,
      color: '#a6d755', light: [90, 180, 35], radius: 2, trail: M.TOXIC, poison: 180,
      effect: '留下腐毒，并使目标中毒。'
    },
    drill: {
      name: '破岩钻', icon: '↟', mana: 9, delay: 3, damage: 10, speed: 6.6, life: 100,
      color: '#d9eef0', light: [95, 180, 200], radius: 1, pierce: 8, dig: 17, trail: M.STEEL_DUST,
      effect: '高速贯穿，可钻开大多数岩层。'
    },
    frost: {
      name: '霜针', icon: '❄', mana: 11, delay: 11, damage: 19, speed: 5.5, life: 100,
      color: '#9de9ff', light: [75, 185, 235], radius: 1, pierce: 2, trail: M.FROST_GAS, freeze: 80,
      effect: '命中冻结敌人并喷出霜雾。'
    },
    bolt: {
      name: '秘银矢', icon: '➤', mana: 8, delay: 8, damage: 24, speed: 6.1, life: 100,
      color: '#d5c5ff', light: [130, 95, 230], radius: 1, pierce: 3, trail: M.MAGIC,
      effect: '稳定的魔法穿透箭。'
    },
    brine: {
      name: '水压弹', icon: '≈', mana: 7, delay: 7, damage: 17, speed: 4.8, life: 92,
      color: '#7ed6ec', light: [50, 160, 210], radius: 2, pierce: 1, trail: M.WATER, knock: 1.4,
      effect: '击退敌人并在岩面留下水。'
    },
    arc: {
      name: '雷弧', icon: 'ϟ', mana: 22, delay: 27, damage: 36, speed: 8.2, life: 78,
      color: '#c5f8ff', light: [120, 225, 255], radius: 1, pierce: 0, trail: M.SMOKE, chain: 3,
      effect: '高速雷弧，命中后在目标间跳跃。'
    },
    boulder: {
      name: '重岩弹', icon: '◆', mana: 20, delay: 18, damage: 46, speed: 3.5, life: 120,
      color: '#c69b69', light: [120, 70, 25], radius: 3, explosion: 11, dig: 13, trail: M.SAND, knock: 2.2,
      effect: '缓慢沉重，撞击后猛烈爆炸。'
    },
    acid: {
      name: '腐蚀囊', icon: '♧', mana: 14, delay: 13, damage: 12, speed: 3.8, life: 96,
      color: '#b4e24b', light: [105, 220, 35], radius: 2, trail: M.ACID, acidBlob: true,
      effect: '破裂后释放会吞噬材质的强酸。'
    }
  };

  const MODIFIERS = {
    scatter: { name: '三向散射', icon: '⋔', mana: 9, delay: 5, color: '#ffc95c', effect: '每枚当前弹体额外复制为三向散射。' },
    homing: { name: '追猎', icon: '⌾', mana: 12, delay: 7, color: '#d78cff', effect: '弹体缓慢追踪最近的敌人。' },
    fire_trail: { name: '燃迹', icon: '♨', mana: 6, delay: 3, color: '#ff7548', effect: '弹体沿途留下火焰并点燃可燃物。' },
    pierce: { name: '穿刺', icon: '⇶', mana: 10, delay: 5, color: '#d6e2e5', effect: '弹体可额外贯穿 5 个目标。' },
    burst: { name: '爆裂', icon: '✸', mana: 14, delay: 8, color: '#ff9a48', effect: '命中时把爆炸半径和伤害提高约 60%。' },
    power: { name: '增幅', icon: '◆', mana: 13, delay: 7, color: '#ff4f67', effect: '伤害提高 70%，但施法延迟增加。' },
    light: { name: '照明', icon: '☼', mana: 5, delay: 2, color: '#f4e08b', effect: '弹体成为移动光源。' },
    swift: { name: '疾速', icon: '»', mana: 8, delay: 0, color: '#69e7c0', effect: '弹速提高 55%。' }
  };

  const TRIGGERS = {
    trigger_hit: { name: '碰撞引信', icon: '⌁', mana: 8, delay: 0, color: '#8de0ff', effect: '把其后的法术装入载荷；弹体命中时释放。' },
    trigger_timer: { name: '延时引信', icon: '◴', mana: 11, delay: 0, color: '#c493ff', effect: '把其后的法术装入载荷；寿命结束时释放。' }
  };
  const SPELL_DEFS = { ...PROJECTILES, ...MODIFIERS, ...TRIGGERS };
  function spellName(id) { return SPELL_DEFS[id]?.name || id; }
  function spellIcon(id) { return SPELL_DEFS[id]?.icon || '◇'; }
  function spellColor(id) { return SPELL_DEFS[id]?.color || '#b8c0d0'; }
  function spellType(id) { return PROJECTILES[id] ? '弹体' : MODIFIERS[id] ? '修饰' : '触发'; }

  // ────────────────────────────────────────────────────────────────────────────
  // 世界、角色与全局运行状态
  // ────────────────────────────────────────────────────────────────────────────
  const BIOMES = [
    { name: '锈蚀矿坑', code: 'IRON MINES', base: '#44484e', accent: '#c68a55', pools: [M.WATER, M.BLOOD], danger: 0 },
    { name: '焦煤深渊', code: 'EMBER COAL', base: '#332f35', accent: '#ef6b3b', pools: [M.OIL, M.WATER], danger: 1 },
    { name: '孢影菌窟', code: 'SPORE HOLLOW', base: '#334439', accent: '#8ec85a', pools: [M.TOXIC, M.SLIME], danger: 2 },
    { name: '霜锁圣库', code: 'FROZEN VAULT', base: '#465966', accent: '#a5e6f2', pools: [M.WATER, M.BRINE], danger: 3 },
    { name: '熔骨熔炉', code: 'MOLTEN CALDERA', base: '#3d3137', accent: '#ff6d27', pools: [M.LAVA, M.MOLTEN_METAL], danger: 4 },
    { name: '虚光铸渊', code: 'UMBRA FOUNDRY', base: '#292735', accent: '#ad6ed1', pools: [M.ACID, M.LAVA], danger: 5 }
  ];

  let world = null;
  let player = null;
  let enemies = [];
  let projectiles = [];
  let particles = [];
  let pickups = [];
  let boulders = [];
  let torches = [];
  let props = [];
  let lightnings = [];
  let wands = [];
  let spellBag = {};
  let currentWand = 0;
  let holyClaimed = new Set();
  let holyVisited = new Set();
  let perkChoices = [];
  let editorOpen = false;
  let pickupOpen = false;
  let helpOpen = false;
  let gameState = 'title';
  let simFrame = 0;
  let lastTime = 0;
  let accumulator = 0;
  let cameraY = 0;
  let cameraX = 0;
  let runGold = 0;
  let runKills = 0;
  let maxDepth = 0;
  let runSeconds = 0;
  let runSeed = 0;
  let toastTimer = 0;
  let flash = 0;
  let shake = 0;
  let hitStop = 0;
  let hudTimer = 0;
  let logs = [];
  let selectedBagSpell = null;
  let selectedWandSlot = null;
  let dragPayload = null;
  let pendingWandPickup = null;
  let lastBiome = -1;
  let muted = false;
  let fps = 60;
  let frameSamples = [];

  const keys = Object.create(null);
  const pressed = new Set();
  const pointer = { x: VW * .64, y: VH * .52, down: false, active: false, inside: false };
  const worldCanvas = document.createElement('canvas');
  worldCanvas.width = VW; worldCanvas.height = VH;
  const worldCtx = worldCanvas.getContext('2d', { alpha: false });
  const imageData = worldCtx.createImageData(VW, VH);
  const pixels = imageData.data;
  const lightCanvas = document.createElement('canvas');
  lightCanvas.width = VW; lightCanvas.height = VH;
  const lightCtx = lightCanvas.getContext('2d');
  let renderCount = 0;
  const vignetteGradient = ctx.createRadialGradient(VW / 2, VH / 2, VH * .25, VW / 2, VH / 2, VW * .7);
  vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)'); vignetteGradient.addColorStop(1, 'rgba(0,0,0,.44)');

  function get(x, y) {
    x |= 0; y |= 0;
    return inside(x, y) ? world.cells[idx(x, y)] : M.AIR;
  }
  function getAtIndex(i) { return world ? world.cells[i] : M.AIR; }
  function setCell(x, y, material, life = -1, temp = -1) {
    x |= 0; y |= 0;
    if (!inside(x, y)) return;
    const i = idx(x, y);
    world.cells[i] = material;
    world.life[i] = life >= 0 ? life : defaultLife(material);
    world.temp[i] = temp >= 0 ? temp : defaultTemp(material);
  }
  function swapCells(i, j) {
    const c = world.cells;
    [c[i], c[j]] = [c[j], c[i]];
    [world.life[i], world.life[j]] = [world.life[j], world.life[i]];
    [world.temp[i], world.temp[j]] = [world.temp[j], world.temp[i]];
  }
  function biomeAt(y) { return BIOMES[clamp(Math.floor(y / ZONE_H), 0, BIOMES.length - 1)]; }
  function biomeIndexAt(y) { return clamp(Math.floor(y / ZONE_H), 0, BIOMES.length - 1); }
  function inHoly(y) { return world?.holy.some(h => y >= h.y0 && y < h.y1) || false; }
  function depthMeters(y = player?.y || 0) { return Math.max(0, Math.floor(y * .2)); }

  // ────────────────────────────────────────────────────────────────────────────
  // 程序生成
  // ────────────────────────────────────────────────────────────────────────────
  function carveDisc(cx, cy, radius, material = M.AIR) {
    const r = Math.ceil(radius);
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (!inside(x, y)) continue;
        const dx = (x - cx) / Math.max(1, radius * .9);
        const dy = (y - cy) / Math.max(1, radius * 1.18);
        if (dx * dx + dy * dy <= 1.08 && (dx * dx + dy * dy < .88 || rand() < .78)) setCell(x, y, material);
      }
    }
  }
  function carveEllipse(cx, cy, rx, ry, material = M.AIR) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy < 1 && rand() > .07) setCell(x, y, material);
      }
    }
  }
  function carveLine(x0, y0, x1, y1, radius) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      carveDisc(lerp(x0, x1, t), lerp(y0, y1, t), radius * (.78 + .22 * Math.sin(t * Math.PI)));
    }
  }
  function baseMaterialFor(zone, x, y) {
    const h = hash2(x, y, 71 + zone * 97) / 4294967296;
    if (x < 6 || x >= WW - 6 || y < 3 || y >= WORLD_H - 5) return M.HARD_ROCK;
    switch (zone) {
      case 0: return h < .22 ? M.DIRT : h < .34 ? M.GOLD_DUST : M.ROCK;
      case 1: return h < .32 ? M.COAL : h < .43 ? M.DIRT : h < .49 ? M.STEEL : M.ROCK;
      case 2: return h < .28 ? M.SOIL : h < .38 ? M.FUNGI : h < .46 ? M.ROOT : M.ROCK;
      case 3: return h < .28 ? M.SNOW : h < .45 ? M.ICE : h < .58 ? M.STEEL : M.ROCK;
      case 4: return h < .24 ? M.OBSIDIAN : h < .38 ? M.HARD_ROCK : h < .50 ? M.COPPER : M.ROCK;
      default: return h < .27 ? M.OBSIDIAN : h < .43 ? M.STEEL : h < .55 ? M.BRICK : M.HARD_ROCK;
    }
  }
  function fillPool(material) {
    for (let attempt = 0; attempt < 250; attempt++) {
      const z = randInt(0, BIOMES.length - 1);
      const cy = randInt(z * ZONE_H + 45, (z + 1) * ZONE_H - 45);
      const cx = randInt(35, WW - 36);
      if (get(cx, cy) !== M.AIR || get(cx, cy + 1) === M.AIR) continue;
      const rx = randInt(9, 25), ry = randInt(4, 10);
      let changed = 0;
      for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (get(x, y) === M.AIR && dx * dx + dy * dy < 1) { setCell(x, y, material); changed++; }
      }
      if (changed > 20) return;
    }
  }
  function makeHolyRoom(zone) {
    const y0 = zone * ZONE_H + 505;
    const y1 = zone * ZONE_H + 592;
    for (let y = y0; y <= y1; y++) for (let x = 28; x <= WW - 28; x++) {
      const wall = x < 38 || x > WW - 39 || y < y0 + 8 || y > y1 - 7;
      setCell(x, y, wall ? M.BRICK : M.AIR);
    }
    for (let x = 43; x <= WW - 44; x += 17) for (let y = y0 + 13; y < y1 - 12; y += 3) setCell(x, y, M.HOLY_BRICK);
    for (let x = 48; x <= WW - 49; x += 31) {
      setCell(x, y0 + 12, M.GLOW_CAP);
      setCell(x, y1 - 12, M.GLOW_CAP);
    }
    carveLine(225, y1 - 13, 255, y1 - 13, 5);
    const room = { zone, y0, y1, cx: WW / 2, altarY: y1 - 19, claimed: false };
    world.holy.push(room);
    props.push({ type: 'altar', x: room.cx, y: room.altarY, room });
  }
  function decorateWorld() {
    for (let y = 18; y < WORLD_H - 30; y++) {
      const zone = biomeIndexAt(y);
      for (let x = 8; x < WW - 8; x++) {
        const m = get(x, y);
        if (!SOLID.has(m) || m === M.HOLY_BRICK) continue;
        const n = hash2(x, y, 400 + zone) / 4294967296;
        if (zone === 0 && n < .006) setCell(x, y, M.GOLD_DUST);
        if (zone === 1 && n < .025) setCell(x, y, M.COAL);
        if (zone === 1 && n < .006) setCell(x, y, M.STEEL);
        if (zone === 2 && n < .018) setCell(x, y, M.FUNGI);
        if (zone === 2 && n < .004) setCell(x, y, M.GLOW_CAP);
        if (zone === 3 && n < .012) setCell(x, y, M.STEEL);
        if (zone === 4 && n < .018) setCell(x, y, M.COPPER);
        if (zone === 5 && n < .014) setCell(x, y, M.STEEL);
      }
    }
    // 真菌群落贴附在菌窟洞壁与洞顶。
    for (let y = 2 * ZONE_H + 40; y < 3 * ZONE_H; y++) {
      for (let x = 10; x < WW - 10; x++) {
        if (get(x, y) !== M.AIR) continue;
        let adjacentSolid = false;
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) if (SOLID.has(get(x + dx, y + dy))) adjacentSolid = true;
        if (adjacentSolid && hash2(x, y, 1003) / 4294967296 < .035) setCell(x, y, hash2(x, y, 4) % 5 === 0 ? M.GLOW_CAP : M.FUNGI);
      }
    }
  }
  function findOpenSpot(y0, y1, preferredX = null) {
    for (let n = 0; n < 1000; n++) {
      const x = preferredX === null ? randInt(22, WW - 23) : clamp(preferredX + randInt(-45, 45), 22, WW - 23);
      const y = randInt(Math.max(20, y0), Math.min(WORLD_H - 25, y1));
      if (get(x, y) !== M.AIR || get(x, y - 1) !== M.AIR) continue;
      let solidCount = 0;
      for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) if (SOLID.has(get(xx, yy))) solidCount++;
      if (solidCount >= 2 && solidCount <= 5) return { x, y };
    }
    return { x: WW / 2, y: clamp((y0 + y1) / 2, 25, WORLD_H - 30) };
  }

  function generateWorld() {
    world = {
      cells: new Uint8Array(CELL_COUNT),
      life: new Uint16Array(CELL_COUNT),
      temp: new Int8Array(CELL_COUNT),
      moved: new Uint32Array(CELL_COUNT),
      holy: [],
      path: [],
      materialCounts: new Uint32Array(materials.length)
    };

    for (let y = 0; y < WORLD_H; y++) {
      const zone = biomeIndexAt(y);
      for (let x = 0; x < WW; x++) setCell(x, y, baseMaterialFor(zone, x, y));
    }

    // 一条始终连通的蜿蜒主隧道；侧洞与大厅从主隧道向外生长。
    let pathX = WW / 2;
    for (let y = 14; y < WORLD_H - 80; y += 4) {
      const target = WW / 2 + Math.sin(y * .016) * 105 + Math.sin(y * .047) * 28;
      pathX = lerp(pathX, target, .23) + randInt(-1, 1);
      pathX = clamp(pathX, 42, WW - 43);
      const radius = 3.2 + rand() * 2.8;
      carveDisc(pathX, y, radius);
      if (y % 26 < 4) world.path.push({ x: pathX, y });
      if (y % 94 < 5) {
        const side = rand() < .5 ? -1 : 1;
        const roomX = clamp(pathX + side * randInt(42, 105), 28, WW - 29);
        const roomY = clamp(y + randInt(-18, 28), 35, WORLD_H - 50);
        carveLine(pathX, y, roomX, roomY, 3.2);
        carveEllipse(roomX, roomY, randInt(18, 38), randInt(9, 18));
      }
    }

    for (let z = 0; z < BIOMES.length; z++) {
      const y0 = z * ZONE_H + 35;
      const y1 = (z + 1) * ZONE_H - 30;
      for (let n = 0; n < 18; n++) {
        const cx = randInt(25, WW - 26), cy = randInt(y0, y1);
        carveEllipse(cx, cy, randInt(9, 25), randInt(5, 13));
      }
    }

    // 出生房间。
    carveEllipse(240, 96, 92, 35);
    for (let x = 142; x <= 338; x++) setCell(x, 131, M.BRICK);
    for (let x = 180; x < 210; x++) setCell(x, 132, M.WOOD);
    props.push({ type: 'workshop', x: 286, y: 126 });
    for (let n = 0; n < 3; n++) torches.push({ x: 190 + n * 50, y: 116, phase: rand() * TAU });

    for (let z = 0; z < BIOMES.length - 1; z++) makeHolyRoom(z);
    decorateWorld();

    for (let n = 0; n < 16; n++) fillPool(pick(BIOMES[n % BIOMES.length].pools));
    for (let n = 0; n < 8; n++) fillPool(n % 3 === 0 ? M.WATER : M.OIL);

    // 熔岩湖：保证深层不是一片普通岩石。
    for (let attempt = 0; attempt < 150; attempt++) {
      const cy = randInt(4 * ZONE_H + 80, 5 * ZONE_H - 70);
      const cx = randInt(45, WW - 46);
      if (get(cx, cy) !== M.AIR || get(cx, cy + 2) === M.AIR) continue;
      carveEllipse(cx, cy, randInt(15, 31), 5);
      for (let y = cy - 7; y <= cy + 7; y++) for (let x = cx - 33; x <= cx + 33; x++) {
        if (get(x, y) === M.AIR && hash2(x, y, 88) / 4294967296 < .72) setCell(x, y, M.LAVA);
      }
      break;
    }

    // 终层首领大厅。
    carveEllipse(240, 3690, 165, 74);
    for (let x = 74; x <= 407; x++) setCell(x, 3756, M.OBSIDIAN);
    for (let y = 3628; y < 3756; y++) { setCell(73, y, M.HARD_ROCK); setCell(408, y, M.HARD_ROCK); }

    // 再次刻出出生净空，防止随机矿脉、液池或粗粝洞缘把角色卡死。
    // 角色碰撞盒附近使用确定性矩形净空，出生后左右至少各可走 25 格。
    carveEllipse(240, 96, 94, 36);
    for (let y = 106; y <= 130; y++) for (let x = 190; x <= 290; x++) setCell(x, y, M.AIR);
    for (let x = 142; x <= 338; x++) setCell(x, 131, M.BRICK);
    for (let x = 180; x < 210; x++) setCell(x, 132, M.WOOD);

    world.path.forEach((p, i) => {
      if (i % 2 === 0 && get(p.x, p.y) === M.AIR && !inHoly(p.y)) torches.push({ x: p.x, y: p.y, phase: rand() * TAU });
    });
    world.holy.forEach(h => {
      torches.push({ x: 70, y: h.y0 + 22, phase: 0 });
      torches.push({ x: 410, y: h.y0 + 22, phase: 2 });
    });

    // 首房保底敌人，方便出生即可验证战斗。
    const firstEnemy = findOpenSpot(75, 120, 310);
    spawnEnemy('stalker', firstEnemy.x, firstEnemy.y);

    for (let z = 0; z < BIOMES.length; z++) {
      const count = 8 + z * 2;
      for (let n = 0; n < count; n++) {
        const p = findOpenSpot(z * ZONE_H + 35, (z + 1) * ZONE_H - 25);
        const type = z < 1 ? pick(['stalker', 'spitter', 'wisp', 'bomber', 'mole']) : pick(['stalker', 'spitter', 'wisp', 'bomber', 'mole', 'mole']);
        spawnEnemy(type, p.x, p.y);
      }
      for (let n = 0; n < 4; n++) {
        const p = findOpenSpot(z * ZONE_H + 40, (z + 1) * ZONE_H - 40);
        const roll = rand();
        if (roll < .3) spawnPickup('gold', p.x, p.y, { value: randInt(8, 20) });
        else if (roll < .52) spawnPickup('health', p.x, p.y, { value: 30 });
        else if (roll < .78) spawnPickup('spell', p.x, p.y, { spell: pick(Object.keys(PROJECTILES)) });
        else spawnPickup('wand', p.x, p.y, { wand: makeRandomWand(z + 1) });
      }
      const chest = findOpenSpot(z * ZONE_H + 70, (z + 1) * ZONE_H - 50);
      spawnPickup('chest', chest.x, chest.y, { hp: 28, tier: z + 1 });
      if (z >= 2) {
        for (let n = 0; n < 3 + z; n++) {
          const p = findOpenSpot(z * ZONE_H + 30, (z + 1) * ZONE_H - 30);
          boulders.push({ x: p.x, y: p.y, vx: randInt(-1, 1) * .25, vy: 0, r: randInt(3, 6), dead: false });
        }
      }
    }
    spawnEnemy('boss', 240, 3668);

    countWorldMaterials();
    for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WW; x++) {
      const m = get(x, y);
      if (BLOCKS_BODY.has(m) && get(x, y - 1) === M.AIR && hash2(x, y, 812) % 17 === 0) setCell(x, y, m);
    }
  }

  function countWorldMaterials() {
    world.materialCounts.fill(0);
    for (let i = 0; i < world.cells.length; i++) world.materialCounts[world.cells[i]]++;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 魔杖与顺序法术链
  // ────────────────────────────────────────────────────────────────────────────
  function makeWand(name, slots, options = {}) {
    const wand = {
      name,
      slots: slots.slice(),
      capacity: options.capacity ?? Math.max(6, slots.length + 1),
      manaMax: options.manaMax ?? 180,
      mana: options.manaMax ?? 180,
      regen: options.regen ?? 34,
      castDelay: options.castDelay ?? 11,
      recharge: options.recharge ?? 18,
      spread: options.spread ?? 2,
      speed: options.speed ?? 1,
      shuffle: options.shuffle ?? false,
      delayLeft: 0,
      rechargeLeft: 0
    };
    wand.mana = wand.manaMax;
    return wand;
  }
  function setupWands() {
    wands = [
      makeWand('灰烬短杖', ['spark', 'homing', 'fire_trail', 'light'], { capacity: 6, manaMax: 210, regen: 42, castDelay: 8, recharge: 12 }),
      makeWand('裂岩脉冲', ['drill', 'power', 'trigger_hit', 'spark'], { capacity: 6, manaMax: 230, regen: 35, castDelay: 12, recharge: 18 }),
      makeWand('三焰枝', ['ember', 'scatter', 'burst', 'fire_trail'], { capacity: 7, manaMax: 280, regen: 48, castDelay: 15, recharge: 24 }),
      makeWand('霜针编枝', ['frost', 'scatter', 'pierce', 'swift'], { capacity: 7, manaMax: 260, regen: 45, castDelay: 10, recharge: 20, shuffle: true })
    ];
    spellBag = {
      spark: 3, ember: 2, venom: 2, drill: 2, frost: 2, bolt: 2, brine: 1, arc: 1, boulder: 1, acid: 1,
      scatter: 2, homing: 2, fire_trail: 2, pierce: 2, burst: 2, power: 2, light: 1, swift: 1,
      trigger_hit: 1, trigger_timer: 1
    };
    currentWand = 0;
  }
  function makeRandomWand(tier = 1) {
    const prefixes = ['裂隙', '苔井', '铜齿', '霜纹', '余烬', '静默', '渊底'];
    const projectileIds = Object.keys(PROJECTILES);
    const modifierIds = Object.keys(MODIFIERS);
    const triggerIds = Object.keys(TRIGGERS);
    const cap = clamp(3 + Math.floor(tier / 2) + randInt(0, 2), 4, 8);
    const slots = [];
    slots.push(pick(projectileIds));
    for (let i = 1; i < cap; i++) {
      if (i === 2 && rand() < .42) slots.push(pick(triggerIds));
      else if (rand() < .5) slots.push(pick(modifierIds));
      else slots.push(pick(projectileIds));
    }
    return makeWand(`${pick(prefixes)}·${randInt(11, 99)}`, slots, {
      capacity: cap,
      manaMax: 150 + tier * 28,
      regen: 26 + tier * 5,
      castDelay: 8 + randInt(0, 8),
      recharge: 14 + randInt(0, 16),
      spread: randInt(0, 6),
      shuffle: rand() < .28
    });
  }
  function wandOrder(wand) {
    const slots = wand.slots.slice();
    return wand.shuffle ? shuffle(slots) : slots;
  }
  function updateWands() {
    for (const w of wands) {
      w.mana = Math.min(w.manaMax, w.mana + w.regen * STEP);
      w.delayLeft = Math.max(0, w.delayLeft - STEP);
      w.rechargeLeft = Math.max(0, w.rechargeLeft - STEP);
    }
  }
  function applyModifier(mods, id) {
    switch (id) {
      case 'scatter': mods.count += 2; mods.spread += .15; break;
      case 'homing': mods.homing = Math.max(mods.homing, .12); break;
      case 'fire_trail': mods.fireTrail = true; break;
      case 'pierce': mods.pierce += 5; break;
      case 'burst': mods.explosion *= 1.6; mods.explosionDamage *= 1.25; break;
      case 'power': mods.damage *= 1.7; break;
      case 'light': mods.light = Math.max(mods.light, 9); break;
      case 'swift': mods.speed *= 1.55; break;
    }
  }
  function emptyMods() {
    return { damage: 1, speed: 1, count: 1, spread: 0, pierce: 0, homing: 0, fireTrail: false, explosion: 1, explosionDamage: 1, light: 0 };
  }
  function cloneDesc(desc) {
    return { ...desc, mods: { ...desc.mods }, payload: desc.payload ? desc.payload.map(cloneDesc) : [] };
  }
  function applyModsToShot(shot, mods) {
    const def = shot.def;
    shot.mods = { ...mods };
    shot.damage = def.damage * mods.damage;
    shot.speed = def.speed * mods.speed;
    shot.count = mods.count;
    shot.spread = mods.spread;
    shot.pierce = (def.pierce || 0) + mods.pierce;
    shot.explosion = (def.explosion || 0) * mods.explosion;
    shot.explosionDamage = def.damage * mods.explosionDamage;
    shot.light = Math.max(def.light ? 5 : 0, mods.light);
    shot.fireTrail = def.trail === M.FIRE || mods.fireTrail;
  }
  function evaluateSequence(slots, start, inherited, depth = 0) {
    const shots = [];
    const mods = { ...inherited };
    let mana = 0;
    let extraDelay = 0;
    let extraRecharge = 0;
    let i = start;
    while (i < slots.length && depth < 5) {
      const id = slots[i];
      if (TRIGGERS[id]) {
        mana += TRIGGERS[id].mana;
        const sub = evaluateSequence(slots, i + 1, mods, depth + 1);
        const payload = sub.shots.length ? sub.shots : shots.slice(0, 1).map(cloneDesc);
        for (const shot of shots) {
          shot.trigger = id;
          shot.payload = payload.map(cloneDesc);
          if (id === 'trigger_timer') {
            shot.speed *= .32;
            shot.life = Math.max(shot.def.life, 150);
            shot.pierce = Math.max(shot.pierce, 64);
            shot.timerShell = true;
          }
        }
        mana += sub.mana;
        extraDelay += sub.extraDelay;
        extraRecharge += sub.extraRecharge;
        i = sub.next > i ? sub.next : i + 1;
        break;
      }
      if (MODIFIERS[id]) {
        mana += MODIFIERS[id].mana;
        extraDelay += MODIFIERS[id].delay * STEP;
        applyModifier(mods, id);
        for (const shot of shots) applyModsToShot(shot, mods);
        i++;
        continue;
      }
      const def = PROJECTILES[id];
      if (def) {
        mana += def.mana;
        extraDelay += def.delay * STEP;
        const shot = { id, def, mods: {}, trigger: null, payload: [] };
        applyModsToShot(shot, mods);
        shots.push(shot);
      }
      i++;
    }
    return { shots, next: i, mana, extraDelay, extraRecharge };
  }
  function buildCast(wand) {
    return evaluateSequence(wandOrder(wand), 0, emptyMods(), 0);
  }
  function castWand() {
    if (gameState !== 'play' || editorOpen || pickupOpen || helpOpen || !player) return;
    const wand = wands[currentWand];
    if (!wand || wand.delayLeft > 0 || wand.rechargeLeft > 0) return;
    const cast = buildCast(wand);
    if (!cast.shots.length) {
      toast(wand.slots.length ? '这根杖没有可发射的弹体' : '空魔杖：去工作台装填法术', '#d2b7ff');
      return;
    }
    if (cast.mana > wand.mana) {
      toast(`魔力不足：需要 ${cast.mana}`, '#78d8ff');
      return;
    }
    wand.mana -= cast.mana;
    wand.delayLeft = Math.max(STEP, wand.castDelay * STEP + cast.extraDelay);
    wand.rechargeLeft = Math.max(STEP, wand.recharge * STEP + cast.extraRecharge);
    const aim = getAim();
    const baseAngle = Math.atan2(aim.y, aim.x);
    for (const desc of cast.shots) spawnDescProjectiles(desc, baseAngle, 'player');
    player.vx -= Math.cos(baseAngle) * .18;
    player.vy -= Math.sin(baseAngle) * .18;
    wand.flash = 8;
    sound('cast', descColor(cast.shots[0]));
  }
  function descColor(desc) { return desc?.def?.color || (desc?.mods?.fireTrail ? '#ff9a43' : '#aeeeff'); }
  function spawnDescProjectiles(desc, angle, owner = 'player', ox = null, oy = null) {
    const count = clamp(desc.count || 1, 1, 11);
    const spread = (desc.spread || 0) + wands[currentWand]?.spread * Math.PI / 180;
    for (let n = 0; n < count; n++) {
      const a = angle + (n - (count - 1) / 2) * spread;
      spawnProjectile(desc, a, owner, ox, oy);
    }
  }
  function spawnProjectile(desc, angle, owner = 'player', ox = null, oy = null) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const muzzle = owner === 'player' ? 4.5 : 9;
    const startX = ox ?? (player.x + dx * muzzle);
    const startY = oy ?? (player.y - 1 + dy * muzzle);
    const life = desc.life || desc.def.life;
    projectiles.push({
      desc, id: desc.id, owner,
      x: startX, y: startY, px: startX, py: startY,
      vx: dx * desc.speed, vy: dy * desc.speed,
      life, maxLife: life,
      color: desc.fireTrail ? '#ff9a42' : desc.def.color,
      radius: desc.def.radius || 1,
      damage: desc.damage,
      pierce: desc.pierce,
      homing: desc.mods.homing,
      fireTrail: desc.fireTrail || desc.def.trail === M.FIRE,
      explosion: desc.explosion,
      explosionDamage: desc.explosionDamage,
      light: desc.light,
      dig: desc.timerShell ? 9999 : desc.def.dig || 0,
      trigger: desc.trigger,
      payload: desc.payload || [],
      triggered: false,
      hitIds: new Set(),
      trailTimer: 0
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 像素材料模拟
  // ────────────────────────────────────────────────────────────────────────────
  function canDisplace(source, target) {
    if (source === M.AIR || target === M.AIR) return true;
    const a = materials[source], b = materials[target];
    if (!a || !b) return false;
    if (target === M.STEAM || target === M.FIRE) return false;
    if (a.kind === 'powder') return b.kind === 'powder' || b.kind === 'liquid' || b.kind === 'gas';
    if (a.kind === 'liquid') {
      if (b.kind === 'powder' || b.kind === 'gas') return true;
      if (b.kind === 'liquid') return a.density > b.density + 1;
      return false;
    }
    if (a.kind === 'gas') {
      if (b.kind === 'gas') return a.density > b.density;
      return false;
    }
    return false;
  }
  function moveCell(x, y, dx, dy, material) {
    const nx = x + dx, ny = y + dy;
    if (!inside(nx, ny)) return false;
    const a = idx(x, y), b = idx(nx, ny);
    if (world.moved[b] === simFrame) return false;
    const target = world.cells[b];
    if (!canDisplace(material, target)) return false;
    swapCells(a, b);
    world.moved[a] = simFrame;
    world.moved[b] = simFrame;
    return true;
  }
  function ignite(x, y, life = 110) {
    const m = get(x, y);
    const d = materials[m];
    if (!d || d.corrodible === false && m !== M.OIL && m !== M.ALCOHOL) return false;
    if (m === M.AIR || m === M.LAVA) return false;
    if (d.burn <= 0 && m !== M.OIL && m !== M.ALCOHOL && m !== M.METHANE) return false;
    setCell(x, y, M.FIRE, life);
    return true;
  }
  function smallMaterialBlast(x, y, radius) {
    for (let yy = Math.max(0, y - radius); yy <= Math.min(WORLD_H - 1, y + radius); yy++) {
      for (let xx = Math.max(0, x - radius); xx <= Math.min(WW - 1, x + radius); xx++) {
        const dd = Math.hypot(xx - x, yy - y);
        if (dd > radius) continue;
        const m = get(xx, yy);
        if (m === M.AIR) continue;
        if (dd < radius * .7 || materials[m].durability <= 7) setCell(xx, yy, M.SMOKE, randInt(30, 90));
      }
    }
    addExplosionParticles(x, y, radius, '#ffbf55');
  }
  function reactCell(x, y, m, i) {
    const life = world.life[i];
    const neighbors = [[x, y - 1], [x + 1, y], [x - 1, y], [x, y + 1]];
    if (m === M.FIRE) {
      if (life <= 0) { setCell(x, y, M.SMOKE, 120); return; }
      for (const [nx, ny] of neighbors) {
        if (!inside(nx, ny)) continue;
        const nm = get(nx, ny);
        if (nm === M.WATER || nm === M.BRINE) {
          setCell(x, y, M.SMOKE, 90);
          setCell(nx, ny, M.STEAM, 220);
          break;
        }
        if (nm === M.SNOW || nm === M.ICE) {
          setCell(nx, ny, M.WATER);
          setCell(x, y, M.SMOKE, 80);
          break;
        }
        if (materials[nm]?.burn > 0 && rand() < .055) ignite(nx, ny);
        if (nm === M.METHANE && rand() < .035) {
          setCell(nx, ny, M.FIRE, 90);
          smallMaterialBlast(x, y, 5);
        }
      }
      return;
    }
    if (m === M.LAVA || m === M.MOLTEN_METAL) {
      for (const [nx, ny] of neighbors) {
        if (!inside(nx, ny)) continue;
        const nm = get(nx, ny);
        if (nm === M.WATER || nm === M.BRINE) {
          setCell(x, y, M.OBSIDIAN);
          setCell(nx, ny, M.STEAM, 260);
          addReactionBurst(x, y, 6, '#ffd36c');
          break;
        }
        if (nm === M.SNOW) { setCell(nx, ny, M.WATER); setCell(x, y, M.OBSIDIAN); }
        else if (nm === M.ICE) { setCell(nx, ny, M.WATER); }
        else if (materials[nm]?.burn > 0 && rand() < .12) ignite(nx, ny);
      }
      return;
    }
    if (m === M.ACID) {
      if (get(x, y - 1) === M.AIR && rand() < .05) setCell(x, y - 1, M.ACID_GAS, randInt(100, 300));
      for (const [nx, ny] of neighbors) {
        if (!inside(nx, ny)) continue;
        const nm = get(nx, ny);
        if (nm === M.AIR || nm === M.ACID || nm === M.ACID_GAS) continue;
        const d = materials[nm];
        const chance = d.kind === 'static' ? (d.durability > 12 ? .004 : .022) : .15;
        if (rand() < chance) setCell(nx, ny, rand() < .12 ? M.ACID_GAS : M.AIR, 90);
      }
      return;
    }
    if (m === M.TOXIC && get(x, y - 1) === M.AIR && rand() < .025) setCell(x, y - 1, M.TOXIC_GAS, randInt(180, 480));
    if (m === M.STEAM && (life <= 0 || rand() < .0025)) { setCell(x, y, M.WATER); return; }
    if (m === M.SMOKE && life <= 0) { setCell(x, y, M.AIR); return; }
    if ((m === M.TOXIC_GAS || m === M.FUNGUS_GAS || m === M.ACID_GAS || m === M.FROST_GAS || m === M.HEAL_GAS) && life <= 0) { setCell(x, y, M.AIR); return; }
    if (m === M.METHANE && life <= 0) setCell(x, y, M.AIR);
    if ((m === M.ICE || m === M.SNOW) && (get(x, y - 1) === M.LAVA || get(x, y + 1) === M.LAVA)) setCell(x, y, M.WATER);
    if (m === M.GLOW_CAP && get(x, y - 1) === M.AIR && rand() < .0018) setCell(x, y - 1, M.FUNGI);
  }
  function updateMaterials() {
    const y0 = clamp(Math.floor(cameraY) - 18, 0, WORLD_H - 1);
    const y1 = clamp(y0 + VH + 36, 1, WORLD_H - 1);
    const leftToRight = (simFrame & 1) === 0;
    for (let y = y1; y >= y0; y--) {
      for (let k = 0; k < WW; k++) {
        const x = leftToRight ? k : WW - 1 - k;
        const i = idx(x, y);
        const m = world.cells[i];
        if (m === M.AIR || world.moved[i] === simFrame) continue;
        const d = materials[m];
        if (m === M.FIRE || d.kind === 'gas') {
          world.life[i] = world.life[i] > 0 ? world.life[i] - 1 : defaultLife(m);
          reactCell(x, y, m, i);
          if (world.cells[i] !== m || m === M.FIRE) continue;
          if (m !== M.FIRE) {
            if (moveCell(x, y, 0, -1, m)) continue;
            const dir = (hash2(x, y, simFrame) & 1) ? 1 : -1;
            if (moveCell(x, y, dir, -1, m) || moveCell(x, y, -dir, -1, m)) continue;
            if (moveCell(x, y, dir, 0, m) || moveCell(x, y, -dir, 0, m)) continue;
          }
          continue;
        }
        if (d.kind === 'powder') {
          reactCell(x, y, m, i);
          if (moveCell(x, y, 0, 1, m)) continue;
          const dir = (hash2(x, y, simFrame) & 1) ? 1 : -1;
          if (moveCell(x, y, dir, 1, m) || moveCell(x, y, -dir, 1, m)) continue;
          if (moveCell(x, y, dir, 0, m) || moveCell(x, y, -dir, 0, m)) continue;
          continue;
        }
        if (d.kind === 'liquid') {
          reactCell(x, y, m, i);
          if (world.cells[i] !== m) continue;
          const above = inside(x, y - 1) ? world.cells[idx(x, y - 1)] : M.AIR;
          if (LIQUIDS.has(above) && materials[above].density > materials[m].density && moveCell(x, y - 1, 0, 1, above)) continue;
          if (moveCell(x, y, 0, 1, m)) continue;
          const first = (hash2(x, y, simFrame) & 1) ? 1 : -1;
          const second = -first;
          // 每次只移动一格，不能用跨距 moveCell 穿过薄墙。
          const movedSide = moveCell(x, y, first, 0, m) || moveCell(x, y, second, 0, m);
          if (!movedSide && rand() < .045) moveCell(x, y, 0, -1, m);
          continue;
        }
        // 固体只在边缘发生少量侵蚀，避免地形自行消失。
        if (get(x, y - 1) === M.ACID && rand() < .035) setCell(x, y, M.ACID_GAS, 80);
      }
    }
    if (simFrame % 4 === 0) {
      for (const burst of reactionBursts.splice(0)) addReactionBurst(burst.x, burst.y, burst.radius, burst.color);
    }
  }
  const reactionBursts = [];
  function addReactionBurst(x, y, radius, color) { reactionBursts.push({ x, y, radius, color }); }

  // ────────────────────────────────────────────────────────────────────────────
  // 角色刚体、玩家与精确死因
  // ────────────────────────────────────────────────────────────────────────────
  function bodyMaterialAt(x, y, w, h) {
    return get(Math.floor(x), Math.floor(y - h * .35));
  }
  function bodyCollides(x, y, w, h) {
    const left = Math.floor(x - w / 2), right = Math.ceil(x + w / 2);
    const top = Math.floor(y - h / 2), bottom = Math.ceil(y + h / 2);
    for (let yy = top; yy <= bottom; yy++) for (let xx = left; xx <= right; xx++) {
      if (!inside(xx, yy) || BLOCKS_BODY.has(get(xx, yy))) return true;
    }
    return false;
  }
  function moveBody(body, dx, dy, w = body.w, h = body.h) {
    const result = { hitX: false, hitY: false, impactSpeed: 0 };
    if (dx) {
      const nx = body.x + dx;
      if (!bodyCollides(nx, body.y, w, h)) body.x = nx;
      else { result.hitX = true; body.vx = 0; }
    }
    if (dy) {
      const ny = body.y + dy;
      if (!bodyCollides(body.x, ny, w, h)) body.y = ny;
      else {
        result.hitY = true;
        result.impactSpeed = Math.abs(dy);
        body.vy = 0;
      }
    }
    body.x = clamp(body.x, w / 2 + 1, WW - w / 2 - 1);
    body.y = clamp(body.y, 3, WORLD_H - h / 2 - 1);
    return result;
  }
  function resetPlayer() {
    player = {
      x: 240, y: 122.4, vx: 0, vy: 0, w: 6, h: 13,
      hp: 100, maxHp: 100, breath: 360, maxBreath: 360, hover: 100, maxHover: 100,
      onGround: false, coyote: 0, jumpBuffer: 0, dir: 1, inv: 0, grace: 90,
      wet: 0, oiled: 0, burning: 0, poison: 0, stun: 0, freeze: 0, slow: 0,
      hazardTick: 0, lastGroundVy: 0, kills: 0, dead: false,
      perks: Object.create(null), damageMult: 1, lastDamage: '未知灾变', fireResist: false, toxicResist: false
    };
  }
  function damagePlayer(amount, reason, source = reason, bypass = false, knock = null) {
    if (!player || player.dead || gameState !== 'play') return;
    if (!bypass && (player.inv > 0 || player.grace > 0)) return;
    if (!bypass) player.inv = player.perks.ironStomach ? 10 : 22;
    player.lastDamage = reason;
    player.hp -= amount;
    flash = Math.max(flash, .18);
    shake = Math.max(shake, 2.5);
    sound('hurt');
    if (knock) { player.vx += knock.x; player.vy += knock.y; }
    if (player.hp <= 0) die(reason, source);
  }
  function die(reason, source = reason) {
    if (!player || player.dead) return;
    player.dead = true;
    player.hp = 0;
    gameState = 'dead';
    pointer.down = false;
    $('deathCause').textContent = reason;
    $('deathStats').textContent = `种子 ${runSeed} · 生存 ${formatTime(runSeconds)} · 深入 ${depthMeters(maxDepth)} m · 击败 ${runKills} 个生物 · 携带 ${runGold} 金砂`;
    $('death').classList.remove('hidden', 'hide');
    log(`死因：${source}`, '#ff6b67');
    sound('death');
    addBurst(player.x, player.y, 30, '#d66c73', 2.5);
  }
  function healPlayer(amount) {
    if (!player) return;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + amount);
    if (player.hp > before) addTextParticle(player.x, player.y - 10, `+${Math.round(player.hp - before)}`, '#75efac');
  }
  function updatePlayer() {
    const left = !!(keys.a || keys.ArrowLeft), right = !!(keys.d || keys.ArrowRight);
    const jumpHeld = !!(keys.w || keys.ArrowUp || keys[' ']);
    const jumpPressed = pressed.has('w') || pressed.has('ArrowUp') || pressed.has(' ');
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (player.stun <= 0 && player.freeze <= 0) {
      const foot = get(Math.floor(player.x), Math.floor(player.y + player.h / 2 + 1));
      const slick = foot === M.OIL || foot === M.SLIME || foot === M.WATER || foot === M.BLOOD;
      const accel = (player.perks.swift ? .24 : .18) * (player.slow > 0 ? .55 : 1) * (slick ? .78 : 1);
      player.vx += dir * accel;
      player.vx *= slick ? .91 : .79;
      if (!dir) player.vx *= .88;
      player.vx = clamp(player.vx, -2.25, 2.25);
      if (dir) player.dir = dir;
    } else {
      player.vx *= .8;
    }

    const submerged = samplePlayerMaterials();
    const waterGravity = submerged.water > 2 ? -.035 : submerged.lava > 0 ? .10 : 0;
    player.vy += (.19 + waterGravity) * (player.perks.lowGravity ? .84 : 1);
    if (submerged.water > 1) player.vy -= .11;
    player.vy = clamp(player.vy, -5.2, 5.3);

    if (jumpPressed) player.jumpBuffer = 7;
    player.jumpBuffer = Math.max(0, player.jumpBuffer - 1);
    if ((player.onGround || player.coyote > 0) && player.jumpBuffer > 0 && player.stun <= 0 && player.freeze <= 0) {
      player.vy = submerged.water > 2 ? -2.1 : -3.85;
      player.onGround = false;
      player.coyote = 0;
      player.jumpBuffer = 0;
      sound('jump');
    }
    if (jumpHeld && !player.onGround && player.hover > 0 && player.vy > -0.35 && player.stun <= 0 && player.freeze <= 0) {
      player.vy = Math.min(player.vy, -.28);
      player.hover = Math.max(0, player.hover - (player.perks.strongHover ? .28 : .48));
    } else {
      player.hover = Math.min(player.maxHover, player.hover + (player.onGround ? 2.4 : (player.perks.strongHover ? .34 : .19)));
    }

    const result = moveBody(player, player.vx, 0);
    const fallingIntoFloor = player.vy > 0;
    const vertical = moveBody(player, 0, player.vy);
    const wasGround = player.onGround;
    player.onGround = vertical.hitY && fallingIntoFloor;
    if (player.onGround) {
      player.coyote = 5;
      if (!wasGround && player.lastGroundVy > 4.7) {
        const impact = (player.lastGroundVy - 4.7) * 12;
        if (impact > 0) {
          shake = Math.max(shake, 3);
          sound('land');
          if (impact > 46) {
            player.hp -= impact;
            if (player.hp <= 0) die('被落石压死', '高速坠落后被坚硬地面撞击');
          } else damagePlayer(impact, '被落石压死', '高速坠落冲击', true);
        }
      }
    } else player.coyote = Math.max(0, player.coyote - 1);
    if (!vertical.hitY) player.lastGroundVy = player.vy;
    if (result.hitX) player.vx = 0;

    player.inv = Math.max(0, player.inv - 1);
    player.grace = Math.max(0, player.grace - 1);
    player.stun = Math.max(0, player.stun - 1);
    player.freeze = Math.max(0, player.freeze - 1);
    player.slow = Math.max(0, player.slow - 1);

    // 呼吸与溺水：有水才消耗肺中空气；碰水灭火。
    const head = get(Math.floor(player.x), Math.floor(player.y - player.h * .38));
    if (head === M.WATER || head === M.BRINE || submerged.water >= 3) {
      player.breath = Math.max(0, player.breath - 1);
      if (player.breath === 0) {
        player.hazardTick++;
        if (player.hazardTick % 18 === 0) {
          player.hp -= 4;
          sound('drown');
          if (player.hp <= 0) die('溺死', '肺中空气耗尽，溺水窒息');
        }
      }
    } else {
      player.breath = Math.min(player.maxBreath, player.breath + 2.2);
      player.hazardTick = 0;
    }
    if (submerged.water > 0) {
      player.wet = Math.min(240, player.wet + 2);
      if (player.burning > 0) { player.burning = 0; addTextParticle(player.x, player.y - 8, '熄灭', '#8edcff'); }
    } else player.wet = Math.max(0, player.wet - 1);
    if (submerged.oil > 0) player.oiled = Math.min(300, player.oiled + 3);
    else player.oiled = Math.max(0, player.oiled - 1);

    if (submerged.fire > 0 || submerged.lava > 0) {
      if (!player.fireResist) player.burning = Math.max(player.burning, submerged.lava > 0 ? 180 : 110);
      player.hp -= submerged.lava > 0 ? 2.1 : .7;
      if (player.hp <= 0) die('烧死', submerged.lava > 0 ? '浸入熔岩，身体被高温吞没' : '身上的火焰无法扑灭');
    }
    if (player.burning > 0 && !player.fireResist) {
      player.burning--;
      if (player.burning % 9 === 0) {
        player.hp -= 1.6;
        if (player.hp <= 0) die('烧死', '持续燃烧导致生命耗尽');
      }
    } else if (player.fireResist) player.burning = 0;

    if (submerged.acid > 0 && !player.toxicResist) {
      player.hp -= 2.7;
      if (player.hp <= 0) die('酸蚀而死', '强酸穿透了血肉与护具');
    }
    if ((submerged.toxic > 0 || submerged.toxicGas > 0) && !player.toxicResist) {
      player.poison = Math.max(player.poison, 200);
      player.hazardTick++;
      if (player.hazardTick % 42 === 0) {
        player.hp -= 2;
        if (player.hp <= 0) die('毒死', '腐蚀性毒液持续侵蚀内脏');
      }
    }
    if (player.poison > 0 && !player.toxicResist) {
      player.poison--;
      if (player.poison % 38 === 0) {
        player.hp -= 1.6;
        if (player.hp <= 0) die('毒死', '毒素在体内扩散并摧毁生命');
      }
    } else if (player.toxicResist) player.poison = 0;
    if (submerged.frost > 0) { player.slow = 60; player.freeze = Math.max(player.freeze, 35); }

    if ((pressed.has('f') || pointer.rightDown) && kick()) sound('kick');
    if (pointer.down) castWand();
  }
  function samplePlayerMaterials() {
    const count = { water: 0, oil: 0, fire: 0, lava: 0, acid: 0, toxic: 0, toxicGas: 0, frost: 0, blood: 0 };
    const left = Math.floor(player.x - player.w / 2), right = Math.floor(player.x + player.w / 2);
    const top = Math.floor(player.y - player.h / 2), bottom = Math.floor(player.y + player.h / 2);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const m = get(x, y);
      if (m === M.WATER || m === M.BRINE) count.water++;
      else if (m === M.OIL || m === M.ALCOHOL) count.oil++;
      else if (m === M.FIRE) count.fire++;
      else if (m === M.LAVA || m === M.MOLTEN_METAL) count.lava++;
      else if (m === M.ACID) count.acid++;
      else if (m === M.TOXIC || m === M.SLIME) count.toxic++;
      else if (m === M.TOXIC_GAS) count.toxicGas++;
      else if (m === M.ICE || m === M.SNOW || m === M.FROST_GAS) count.frost++;
      else if (m === M.BLOOD) count.blood++;
    }
    return count;
  }
  function kick() {
    if (!player) return false;
    const aim = getAim(), len = Math.hypot(aim.x, aim.y) || 1;
    const dx = aim.x / len, dy = aim.y / len;
    for (const e of enemies) {
      if (e.dead) continue;
      const rx = e.x - player.x, ry = e.y - player.y;
      const along = rx * dx + ry * dy;
      const side = Math.abs(rx * dy - ry * dx);
      if (along > 1 && along < 19 && side < 8) {
        damageEnemy(e, player.perks.strongKick ? 24 : 7, 'melee', '踢击', { knock: { x: dx * 4.5, y: dy * 4.5 - 1.2 } });
        return true;
      }
    }
    return false;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 敌人：近战冲锋、远程弹幕、飞行、自爆、潜地
  // ────────────────────────────────────────────────────────────────────────────
  const ENEMY_DEFS = {
    stalker: { name: '灰烬掠夺者', hp: 52, speed: 1.05, w: 9, h: 13, damage: 12, color: '#8ba778' },
    spitter: { name: '孢喉术士', hp: 43, speed: .55, w: 9, h: 12, damage: 11, color: '#b45c76' },
    wisp: { name: '冰蓝浮魂', hp: 25, speed: 1.1, w: 8, h: 9, damage: 9, color: '#69cbe7' },
    bomber: { name: '猩红爆囊', hp: 32, speed: .72, w: 10, h: 11, damage: 31, color: '#d8574d' },
    mole: { name: '岩须潜猎者', hp: 62, speed: .72, w: 12, h: 9, damage: 16, color: '#9a6e4b' },
    boss: { name: '深渊熔核', hp: 980, speed: .64, w: 28, h: 28, damage: 25, color: '#b5529f' }
  };

  function spawnEnemy(type, x, y) {
    const def = ENEMY_DEFS[type];
    if (!def) return null;
    const depthScale = 1 + biomeIndexAt(y) * .18;
    const enemy = {
      type, x, y, vx: 0, vy: 0, w: def.w, h: def.h,
      hp: def.hp * depthScale, maxHp: def.hp * depthScale,
      dir: rng() < .5 ? -1 : 1, cool: randInt(24, 110), phase: rand() * TAU,
      flash: 0, dead: false, attackCd: 0, poison: 0, freeze: 0, fuse: -1, burrowed: true,
      seed: randInt(0, 9999), phaseIndex: 0
    };
    if (type !== 'wisp' && type !== 'boss' && bodyCollides(x, y, enemy.w, enemy.h)) {
      const open = findOpenSpot(y - 12, y + 12, x);
      enemy.x = open.x; enemy.y = open.y;
    }
    enemies.push(enemy);
    return enemy;
  }
  function damageEnemy(enemy, amount, type = 'projectile', source = '法术', options = {}) {
    if (!enemy || enemy.dead) return;
    let damage = amount * player.damageMult;
    if (player.perkCrit && rand() < .22) damage *= 2;
    if (type === 'fire' && enemy.type === 'mole') damage *= 1.7;
    if (type === 'ice') enemy.freeze = Math.max(enemy.freeze, options.freeze || 70);
    if (type === 'poison') enemy.poison = Math.max(enemy.poison, options.poison || 180);
    if (type === 'explosion' && enemy.type === 'boss') damage *= .88;
    enemy.hp -= damage;
    enemy.flash = 7;
    if (options.knock) { enemy.vx += options.knock.x; enemy.vy += options.knock.y; }
    addBurst(enemy.x, enemy.y, options.big ? 18 : 7, type === 'poison' ? '#a4d95a' : type === 'fire' ? '#ff9b4b' : '#d8c4ff', options.big ? 1.8 : .7);
    sound('hit');
    if (enemy.type === 'bomber' && enemy.fuse < 0 && options.detonate !== false) enemy.fuse = randInt(20, 40);
    if (enemy.hp <= 0) killEnemy(enemy, type, source);
  }
  function killEnemy(enemy, type = 'projectile', source = '法术') {
    if (!enemy || enemy.dead) return;
    enemy.dead = true;
    runKills++;
    player.kills = runKills;
    addBurst(enemy.x, enemy.y, enemy.type === 'boss' ? 55 : 18, '#c84550', enemy.type === 'boss' ? 3 : 1.3);
    for (let n = 0; n < (enemy.type === 'boss' ? 40 : 8); n++) spawnParticle(enemy.x, enemy.y, rand(-1, 1), rand(-1.5, .4), '#a82f3d', randInt(18, 38), 1);
    for (let n = 0; n < 6; n++) {
      const x = Math.floor(enemy.x + rand(-enemy.w / 2, enemy.w / 2));
      const y = Math.floor(enemy.y + rand(-enemy.h / 2, enemy.h / 2));
      if (get(x, y) === M.AIR) setCell(x, y, M.BLOOD);
    }
    if (player.perks.greed) {
      for (let n = 0; n < 6; n++) spawnPickup('gold', enemy.x + rand(-4, 4), enemy.y, { value: randInt(1, 5) });
    } else {
      spawnPickup('gold', enemy.x, enemy.y, { value: enemy.type === 'boss' ? 180 : randInt(3, 13) });
    }
    if (enemy.type === 'boss') {
      explode(enemy.x, enemy.y, 24, 80, 'player', 'explosion', { terrain: false });
      winGame();
    }
    log(`${ENEMY_DEFS[enemy.type].name} 被${source}消灭`, '#f0d985');
  }
  function updateEnemies() {
    for (const e of enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - 1);
      e.attackCd = Math.max(0, e.attackCd - 1);
      e.freeze = Math.max(0, e.freeze - 1);
      if (e.poison > 0) {
        e.poison--;
        if (e.poison % 24 === 0) damageEnemy(e, 1.4, 'poison', '毒液', { detonate: false });
      }
      if (Math.abs(e.y - (player?.y || 0)) > VH + 140 || e.x < -30 || e.x > WW + 30) continue;
      const dx = player.x - e.x, dy = player.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      if (e.freeze > 0) { e.vx *= .8; moveBody(e, e.vx, e.vy); continue; }

      if (e.type === 'stalker') {
        e.vx += nx * .085;
        e.vx *= .86;
        e.vx = clamp(e.vx, -1.45, 1.45);
        e.vy += .19;
        if (bodyCollides(e.x + e.vx, e.y, e.w, e.h) && e.vy > 0) e.vy = -2.4;
        moveBody(e, e.vx, e.vy);
      } else if (e.type === 'spitter') {
        e.vy += .18;
        const desired = dist < 65 ? -nx * .45 : dist > 100 ? nx * .35 : 0;
        e.vx = lerp(e.vx, desired + Math.sin(simFrame * .035 + e.phase) * .22, .08);
        moveBody(e, e.vx, e.vy);
        e.cool--;
        if (e.cool <= 0 && dist < 165) {
          const shots = e.y > 4 * ZONE_H ? 3 : 1;
          for (let n = 0; n < shots; n++) fireEnemyShot(e, nx, ny, (n - (shots - 1) / 2) * .17);
          e.cool = randInt(80, 145) - biomeIndexAt(e.y) * 4;
        }
      } else if (e.type === 'wisp') {
        e.x += (nx * .62 + Math.cos(simFrame * .075 + e.phase) * .58) * .72;
        e.y += (ny * .48 + Math.sin(simFrame * .063 + e.phase) * .42) * .72;
        e.x = clamp(e.x, 10, WW - 10); e.y = clamp(e.y, 10, WORLD_H - 10);
      } else if (e.type === 'bomber') {
        e.vx = lerp(e.vx, nx * .75, .07); e.vy += .18;
        moveBody(e, e.vx, e.vy);
        if (dist < 34 || e.fuse >= 0) {
          if (e.fuse < 0) { e.fuse = 34; toast('爆囊正在尖鸣！', '#ff8a6e'); }
          e.fuse--;
          e.flash = (e.fuse % 4 < 2) ? 2 : 0;
          if (e.fuse <= 0) {
            explode(e.x, e.y, 12, ENEMY_DEFS.bomber.damage, 'enemy', 'explosion');
            e.dead = true;
            continue;
          }
        }
      } else if (e.type === 'mole') {
        e.cool--;
        if (e.burrowed) {
          e.x += nx * .72; e.y += ny * .58;
          const bx = Math.floor(e.x), by = Math.floor(e.y);
          if (rand() < .5) {
            const target = get(bx, by);
            if (BLOCKS_BODY.has(target) && materials[target].durability <= 15) setCell(bx, by, rand() < .2 ? M.DIRT : M.AIR);
          }
          if (e.cool <= 0 || dist < 18) { e.burrowed = false; e.vy = -1.3; addBurst(e.x, e.y, 10, '#745039', .8); }
        } else {
          e.vx = lerp(e.vx, nx * 1.1, .12); e.vy += .2;
          moveBody(e, e.vx, e.vy);
        }
      } else if (e.type === 'boss') {
        updateBoss(e, dist, nx, ny);
      }

      const contactR = Math.max(e.w, e.h) * .55 + 4;
      if (dist < contactR && e.attackCd <= 0) {
        damagePlayer(ENEMY_DEFS[e.type].damage, `被${ENEMY_DEFS[e.type].name}击杀`, `遭到${ENEMY_DEFS[e.type].name}近身攻击`, false, { x: nx * 2.2, y: -1.4 });
        e.attackCd = 48;
      }
      const hazard = get(Math.floor(e.x), Math.floor(e.y));
      if (hazard === M.FIRE || hazard === M.LAVA) {
        damageEnemy(e, 1.1, 'fire', '环境火焰', { detonate: e.type !== 'bomber' });
      } else if (hazard === M.ACID) damageEnemy(e, 1.5, 'poison', '强酸', { detonate: e.type !== 'bomber' });
    }
    enemies = enemies.filter(e => !e.dead);
  }
  function updateBoss(boss, dist, nx, ny) {
    boss.vy += .12;
    boss.vx = lerp(boss.vx, Math.sin(simFrame * .022) * .55, .035);
    moveBody(boss, boss.vx, boss.vy);
    boss.cool--;
    if (boss.cool > 0) return;
    const phase = boss.hp < boss.maxHp * .33 ? 2 : boss.hp < boss.maxHp * .66 ? 1 : 0;
    if (phase !== boss.phaseIndex) {
      boss.phaseIndex = phase;
      boss.flash = 30;
      explode(boss.x, boss.y, 10, 0, 'enemy', 'explosion', { terrain: false });
      toast(phase === 1 ? '熔核外壳裂开了' : '终层：熔核过载', '#ff7b54');
    }
    if (phase >= 1 && dist < 180) {
      const count = phase === 2 ? 18 : 12;
      for (let n = 0; n < count; n++) {
        const a = n / count * TAU + simFrame * .01;
        fireEnemyShot(boss, Math.cos(a), Math.sin(a), 0, '#ff72c6', 2.15, 8, true);
      }
    } else {
      for (let n = -1; n <= 1; n++) fireEnemyShot(boss, nx, ny, n * .15, '#ff72c6', 2.4, 12);
    }
    boss.cool = phase === 2 ? 42 : phase === 1 ? 58 : 78;
  }
  function fireEnemyShot(enemy, dx, dy, angleOffset = 0, color = '#ff7597', speed = 2.25, damage = 10, piercing = false) {
    const angle = Math.atan2(dy, dx) + angleOffset;
    projectiles.push({
      desc: { id: 'enemy_bolt', def: { color, light: [255, 70, 120], radius: 1, life: 145 }, fireTrail: false, mods: {}, payload: [] },
      id: 'enemy_bolt', owner: 'enemy', x: enemy.x + dx * 6, y: enemy.y + dy * 6,
      px: enemy.x, py: enemy.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: 145, maxLife: 145, color, radius: 1, damage, pierce: piercing ? 3 : 0,
      homing: 0, fireTrail: false, explosion: 0, explosionDamage: 0, light: 8, dig: 0,
      trigger: null, payload: [], triggered: false, hitIds: new Set(), trailTimer: 0
    });
    sound('spit');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 投射物命中、反应与爆炸
  // ────────────────────────────────────────────────────────────────────────────
  function updateProjectiles() {
    for (let pi = projectiles.length - 1; pi >= 0; pi--) {
      const p = projectiles[pi];
      p.px = p.x; p.py = p.y;
      if (p.homing > 0 && p.owner === 'player') {
        let target = null, best = 125;
        for (const e of enemies) {
          if (e.dead || p.hitIds.has(e)) continue;
          const d = distance(p, e);
          if (d < best) { best = d; target = e; }
        }
        if (target) {
          const a = Math.atan2(target.y - p.y, target.x - p.x);
          const speed = Math.hypot(p.vx, p.vy);
          p.vx = lerp(p.vx, Math.cos(a) * speed, p.homing);
          p.vy = lerp(p.vy, Math.sin(a) * speed, p.homing);
        }
      }
      if (p.id === 'boulder') p.vy += .055;
      else if (!p.fireTrail && p.id !== 'arc') p.vy += .008;
      p.x += p.vx; p.y += p.vy; p.life--; p.trailTimer--;
      p.trailTimer ||= 0;

      if (p.fireTrail && p.trailTimer <= 0 && inside(Math.floor(p.x), Math.floor(p.y))) {
        p.trailTimer = p.id === 'ember' ? 1 : 2;
        if (get(Math.floor(p.x), Math.floor(p.y)) === M.AIR) setCell(Math.floor(p.x), Math.floor(p.y), M.FIRE, 70 + randInt(0, 45));
      } else if (p.desc.def.trail && p.trailTimer <= 0) {
        p.trailTimer = 3;
        const tx = Math.floor(p.x), ty = Math.floor(p.y);
        if (get(tx, ty) === M.AIR) setCell(tx, ty, p.desc.def.trail, defaultLife(p.desc.def.trail));
      }

      let remove = false;
      if (p.life <= 0) {
        if (p.trigger === 'trigger_timer' && !p.triggered) releasePayload(p, p.vx, p.vy);
        if (p.id === 'ember' || p.explosion > 0) explode(p.x, p.y, p.explosion || 3, p.explosionDamage || p.damage, p.owner, 'explosion');
        remove = true;
      }
      if (p.x < 3 || p.x > WW - 3 || p.y < 3 || p.y > WORLD_H - 3) remove = true;
      if (!remove && inside(Math.floor(p.x), Math.floor(p.y))) {
        const material = get(Math.floor(p.x), Math.floor(p.y));
        if (BLOCKS_BODY.has(material)) {
          const d = materials[material];
          if (p.dig > 0 && d.durability <= p.dig) {
            setCell(Math.floor(p.x), Math.floor(p.y), material === M.ROCK || material === M.HARD_ROCK ? M.SAND : M.AIR);
            p.dig -= d.durability;
            p.damage *= .96;
            if (p.trigger === 'trigger_hit' && !p.triggered) releasePayload(p, p.vx, p.vy);
            if (p.dig > 0) remove = false;
            else remove = true;
          } else if (p.trigger === 'trigger_hit' && !p.triggered) {
            releasePayload(p, p.vx, p.vy);
            projectileImpact(p);
            remove = true;
          } else {
            projectileImpact(p);
            remove = true;
          }
        }
      }

      if (!remove) {
        if (p.owner === 'player') {
          for (const e of enemies) {
            if (e.dead || p.hitIds.has(e)) continue;
            const hitR = Math.max(e.w, e.h) * .45 + p.radius;
            if (Math.hypot(p.x - e.x, p.y - e.y) < hitR) {
              p.hitIds.add(e);
              const type = p.id === 'ember' || p.fireTrail ? 'fire' : p.id === 'frost' ? 'ice' : p.id === 'venom' ? 'poison' : p.explosion ? 'explosion' : 'projectile';
              damageEnemy(e, p.damage, type, p.id === 'ember' ? '炽焰弹' : SPELL_DEFS[p.id]?.name || '法术', { knock: p.id === 'boulder' || p.id === 'brine' ? { x: p.vx * .38, y: p.vy * .38 - .7 } : null, freeze: p.desc.def.freeze });
              if (p.id === 'arc') chainLightning(p.x, p.y, e, 3, p.damage * .62);
              if (p.trigger === 'trigger_hit' && !p.triggered) releasePayload(p, p.vx, p.vy);
              if (p.pierce > 0) {
                p.pierce--;
                remove = false;
              } else {
                projectileImpact(p);
                remove = true;
              }
              break;
            }
          }
        } else if (Math.hypot(p.x - player.x, p.y - player.y) < 5 + p.radius) {
          damagePlayer(p.damage, `被${p.id === 'enemy_bolt' ? '深渊弹幕' : '敌方法术'}击杀`, '被远程法术命中');
          if (p.explosion) explode(p.x, p.y, p.explosion, p.explosionDamage || p.damage, p.owner, 'explosion');
          remove = true;
        }
      }
      if (remove) projectiles.splice(pi, 1);
    }
  }
  function releasePayload(p, vx, vy) {
    if (p.triggered) return;
    p.triggered = true;
    const angle = Math.atan2(vy, vx);
    for (const desc of p.payload) spawnDescProjectiles(desc, angle, p.owner, p.x, p.y);
    addBurst(p.x, p.y, 12, '#c6f3ff', .6);
    sound('trigger');
  }
  function projectileImpact(p) {
    if (p.trigger === 'trigger_hit' && !p.triggered) releasePayload(p, p.vx, p.vy);
    if (p.explosion || p.id === 'ember' || p.id === 'boulder') {
      explode(p.x, p.y, p.explosion || 7, p.explosionDamage || p.damage, p.owner, 'explosion');
      return;
    }
    if (p.id === 'acid' || p.id === 'venom') {
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
        if (get(Math.floor(p.x) + x, Math.floor(p.y) + y) === M.AIR) setCell(Math.floor(p.x) + x, Math.floor(p.y) + y, p.id === 'acid' ? M.ACID : M.TOXIC);
      }
    } else if (p.id === 'brine') {
      for (let n = 0; n < 5; n++) {
        const x = Math.floor(p.x + rand(-2, 2)), y = Math.floor(p.y + rand(-2, 2));
        if (get(x, y) === M.AIR) setCell(x, y, M.WATER);
      }
    } else if (p.id === 'frost') {
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
        const mx = Math.floor(p.x) + x, my = Math.floor(p.y) + y;
        if (get(mx, my) === M.WATER) setCell(mx, my, M.ICE);
        else if (get(mx, my) === M.AIR && Math.hypot(x, y) <= 1.5) setCell(mx, my, M.FROST_GAS, 140);
      }
    } else if (p.id === 'drill') {
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
        const mx = Math.floor(p.x) + x, my = Math.floor(p.y) + y;
        const m = get(mx, my);
        if (BLOCKS_BODY.has(m) && materials[m].durability <= p.dig + 5) setCell(mx, my, M.AIR);
      }
    }
    addBurst(p.x, p.y, 7, p.color, .55);
  }
  function chainLightning(x, y, first, jumps, damage) {
    const hit = new Set([first]);
    let from = first;
    lightnings.push({ x1: x, y1: y, x2: from.x, y2: from.y, life: 10, max: 10, color: '#bdf7ff' });
    for (let n = 0; n < jumps - 1; n++) {
      let next = null, best = 48;
      for (const e of enemies) {
        if (e.dead || hit.has(e)) continue;
        const d = distance(from, e);
        if (d < best) { best = d; next = e; }
      }
      if (!next) break;
      hit.add(next);
      lightnings.push({ x1: from.x, y1: from.y, x2: next.x, y2: next.y, life: 10, max: 10, color: '#bdf7ff' });
      damageEnemy(next, damage, 'electric', '雷弧连锁');
      from = next;
    }
    sound('electric');
  }
  function explode(x, y, radius, damage, owner = 'player', element = 'explosion', options = {}) {
    radius = Math.max(2, radius);
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let yy = Math.max(0, cy - Math.ceil(radius)); yy <= Math.min(WORLD_H - 1, cy + Math.ceil(radius)); yy++) {
      for (let xx = Math.max(0, cx - Math.ceil(radius)); xx <= Math.min(WW - 1, cx + Math.ceil(radius)); xx++) {
        const dd = Math.hypot(xx - x, yy - y);
        if (dd > radius) continue;
        const m = get(xx, yy);
        if (m === M.AIR) {
          if (element === 'fire' && dd < radius * .85 && rand() < .28) setCell(xx, yy, M.FIRE, randInt(60, 120));
          continue;
        }
        const def = materials[m];
        if (def.kind === 'static' || def.kind === 'powder') {
          const threshold = 7 + radius * .75;
          if (def.durability <= threshold && rand() < clamp(1.15 - dd / radius, .22, 1)) {
            if (def.burn > .45 && element === 'fire') setCell(xx, yy, M.FIRE, randInt(80, 150));
            else setCell(xx, yy, def.kind === 'powder' ? M.AIR : (m === M.ICE ? M.WATER : M.AIR));
          }
        } else if (m === M.WATER || m === M.BRINE) {
          if (element === 'fire' && dd < radius) setCell(xx, yy, M.STEAM, 200);
        } else if (m === M.OIL && element === 'fire' && dd < radius) setCell(xx, yy, M.FIRE, 120);
      }
    }
    for (const e of enemies) {
      if (e.dead) continue;
      const d = distance({ x, y }, e);
      if (d < radius + Math.max(e.w, e.h) * .4) {
        const falloff = clamp(1 - d / (radius + 8), .2, 1);
        damageEnemy(e, damage * falloff, element, '爆炸', { knock: { x: (e.x - x) / (d || 1) * 2.4 * falloff, y: (e.y - y) / (d || 1) * 2.4 * falloff - .6 }, detonate: false, big: true });
      }
    }
    if (owner === 'enemy') {
      const d = Math.hypot(player.x - x, player.y - y);
      if (d < radius + 5) damagePlayer(damage * clamp(1 - d / (radius + 8), .2, 1), '被爆炸击杀', '被敌人的爆炸命中', false, { x: (player.x - x) / (d || 1) * 3, y: -1.2 });
    } else {
      const d = Math.hypot(player.x - x, player.y - y);
      if (d < 7) damagePlayer(damage * .28, '被自己的法术炸死', '爆炸的近距离反冲', false, { x: (player.x - x) / (d || 1) * 2, y: -1 });
    }
    addExplosionParticles(x, y, radius, element === 'fire' ? '#ffb14c' : '#d5b6ff');
    shake = Math.max(shake, Math.min(11, radius * .58));
    sound('explosion');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 掉落物、宝箱与拾取
  // ────────────────────────────────────────────────────────────────────────────
  function spawnPickup(type, x, y, options = {}) {
    pickups.push({
      type, x, y, vx: options.vx ?? rand(-.35, .35), vy: options.vy ?? -rand(.2, .9),
      w: type === 'chest' ? 10 : 4, h: type === 'chest' ? 8 : 4,
      value: options.value || 1, spell: options.spell, wand: options.wand, hp: options.hp || 1,
      maxHp: options.hp || 1, tier: options.tier || 1, phase: rand() * TAU, ignore: 0, dead: false
    });
  }
  function updatePickups() {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.ignore = Math.max(0, p.ignore - 1);
      p.phase += .04;
      if (p.type === 'gold' || p.type === 'health' || p.type === 'spell' || p.type === 'wand') p.vy += .14;
      if (p.type === 'chest') p.vy += .12;
      const d = distance(p, player);
      if (d < 68 && (player.perks.magnet || p.type === 'wand')) {
        p.vx += (player.x - p.x) * .025;
        p.vy += (player.y - p.y) * .025;
      }
      const result = moveBody(p, p.vx, p.vy, p.w, p.h);
      if (result.hitX) p.vx *= -.45;
      if (result.hitY) p.vy *= -.28;
      p.vx *= result.hitX ? .75 : .975;
      p.vy *= result.hitY ? .78 : .995;
      if (d < 8 + Math.max(p.w, p.h) * .2) {
        if (p.type === 'chest' && p.hp <= 0) continue;
        if (p.type === 'gold') { runGold += p.value; toast(`+${p.value} 金砂`, '#f0ca5c'); sound('coin'); pickups.splice(i, 1); continue; }
        if (p.type === 'health') { healPlayer(p.value); toast(`恢复 ${p.value} 生命`, '#ef7278'); sound('pickup'); pickups.splice(i, 1); continue; }
        if (p.type === 'spell') { addSpellToBag(p.spell, 1); toast(`拾取法术：${spellName(p.spell)}`, spellColor(p.spell)); sound('pickup'); pickups.splice(i, 1); continue; }
        if (p.type === 'wand' && p.ignore <= 0) { openWandPickup(p); return; }
      }
    }
  }
  function addSpellToBag(id, count = 1) { spellBag[id] = (spellBag[id] || 0) + count; }
  function damagePickup(p, amount) {
    if (p.type !== 'chest' || p.dead) return;
    p.hp -= amount; p.flash = 5;
    if (p.hp <= 0) {
      p.dead = true;
      openChest(p);
      const index = pickups.indexOf(p);
      if (index >= 0) pickups.splice(index, 1);
    }
  }
  function openChest(chest) {
    addBurst(chest.x, chest.y, 28, '#e6b95c', 1.8);
    spawnPickup('gold', chest.x - 4, chest.y - 3, { value: randInt(15, 28) + chest.tier * 8, vx: -.7, vy: -1.5 });
    if (rand() < .68) spawnPickup('health', chest.x + 4, chest.y - 3, { value: randInt(22, 42), vx: .7, vy: -1.5 });
    if (rand() < .75) spawnPickup('spell', chest.x, chest.y - 7, { spell: pick(Object.keys(SPELL_DEFS)), vx: 0, vy: -2 });
    if (rand() < .34 + chest.tier * .05) spawnPickup('wand', chest.x + 7, chest.y - 4, { wand: makeRandomWand(chest.tier + 1), vx: .2, vy: -1.2 });
    sound('chest');
    toast('宝箱打开了：炼金产物散落一地', '#f2d274');
  }
  function openWandPickup(p) {
    if (pickupOpen || gameState !== 'play') return;
    pendingWandPickup = p;
    pickupOpen = true;
    p.ignore = 180;
    const w = p.wand;
    $('pickupPanel').innerHTML = `
      <div class="panel-heading"><div><span class="eyebrow">FOUND WAND</span><h2>${w.name}</h2></div><button class="icon-close" data-pickup-action="leave" aria-label="关闭">×</button></div>
      <div class="pickup-wand-preview"><div class="wand-silhouette"></div><div><b>容量 ${w.capacity}</b><small>魔力 ${w.manaMax} · 回复 ${w.regen}/s · ${w.shuffle ? '洗牌' : '顺序'}</small></div></div>
      <div class="spell-chain compact">${w.slots.map(id => `<span style="--spell:${spellColor(id)}"><i>${spellIcon(id)}</i>${spellName(id)}</span>`).join('<b>→</b>')}</div>
      <p class="muted">装备会替换当前魔杖；也可以拆走法术，把杖身留在地上。</p>
      <div class="button-row"><button class="primary-button" data-pickup-action="equip">装备此杖</button><button class="secondary-button" data-pickup-action="take">拆取法术</button><button class="text-button" data-pickup-action="leave">离开</button></div>`;
    $('pickupPanel').classList.remove('hidden', 'hide');
    sound('pickup');
  }
  function closeWandPickup() {
    pickupOpen = false;
    pendingWandPickup = null;
    $('pickupPanel').classList.add('hidden', 'hide');
  }
  function handlePickupAction(action) {
    const p = pendingWandPickup;
    if (!p) return;
    if (action === 'equip') {
      const old = wands[currentWand];
      old.slots.forEach(id => addSpellToBag(id, 1));
      wands[currentWand] = p.wand;
      toast(`已装备 ${p.wand.name}`, '#e8d99b');
    } else if (action === 'take') {
      p.wand.slots.forEach(id => addSpellToBag(id, 2));
      toast('已拆取杖内法术', '#a6d6ff');
    }
    const i = pickups.indexOf(p);
    if (action !== 'leave' && i >= 0) pickups.splice(i, 1);
    closeWandPickup();
    sound('pickup');
  }
  function updateBoulders() {
    for (const b of boulders) {
      if (Math.abs(b.y - player.y) > VH + 100) continue;
      b.vy = Math.min(6, b.vy + .19);
      const oldY = b.y;
      const result = moveBody(b, b.vx, b.vy, b.r * 2, b.r * 2);
      if (result.hitY) { b.vy = 0; b.vx *= .92; if (b.vy === 0 && oldY - b.y < .2) b.vx += rand(-.3, .3); }
      if (result.hitX) b.vx *= -.55;
      if (distance(b, player) < b.r + 5) {
        const force = clamp(Math.abs(b.vy) * 9, 18, 60);
        damagePlayer(force, '被坠岩压死', '高速坠落的巨石砸中身体', true, { x: sign(player.x - b.x) * 3.4, y: -1.4 });
        explode(b.x, b.y, 8, 8, 'neutral', 'explosion');
        b.dead = true;
      }
    }
    boulders = boulders.filter(b => !b.dead);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 粒子、浮字、震屏与合成音频
  // ────────────────────────────────────────────────────────────────────────────
  function spawnParticle(x, y, vx, vy, color, life = 30, size = 1, gravity = .05) {
    if (particles.length > 700) particles.shift();
    particles.push({ x, y, vx, vy, color, life, max: life, size, gravity, kind: 'pixel' });
  }
  function addBurst(x, y, count, color, speed = 1) {
    for (let n = 0; n < count; n++) {
      const a = rand(0, TAU), s = rand(.25, 1) * speed;
      spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, color, randInt(18, 44), randInt(1, 2), .035);
    }
  }
  function addExplosionParticles(x, y, radius, color) {
    addBurst(x, y, Math.min(42, 12 + radius * 2), color, radius * .18);
    for (let n = 0; n < 10; n++) {
      const a = n / 10 * TAU;
      particles.push({ x, y, vx: Math.cos(a) * radius * .3, vy: Math.sin(a) * radius * .3, color, life: 18, max: 18, size: 1, gravity: 0, kind: 'ring', radius: 1, maxRadius: radius });
    }
  }
  function addTextParticle(x, y, text, color) {
    particles.push({ x, y, vx: 0, vy: -.35, color, life: 70, max: 70, size: 1, gravity: 0, kind: 'text', text });
  }
  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life--;
      if (p.kind === 'pixel') {
        p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.vx *= .985;
      } else if (p.kind === 'text') p.y += p.vy;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = lightnings.length - 1; i >= 0; i--) if (--lightnings[i].life <= 0) lightnings.splice(i, 1);
  }

  let audioContext = null;
  let noiseBuffer = null;
  function ensureAudio() {
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      audioContext = new AudioCtor();
      noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) { last = (last + (Math.random() * 2 - 1) * .22) * .82; data[i] = last; }
    }
    if (audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }
  function tone(freq, duration, type = 'square', gain = .025, slide = 0) {
    if (muted) return;
    const ac = ensureAudio(); if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, ac.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(25, freq + slide), ac.currentTime + duration);
    g.gain.setValueAtTime(gain, ac.currentTime); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + duration);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + duration);
  }
  function noise(duration, gain = .035, cutoff = 1000) {
    if (muted) return;
    const ac = ensureAudio(); if (!ac || !noiseBuffer) return;
    const source = ac.createBufferSource(), filter = ac.createBiquadFilter(), g = ac.createGain();
    source.buffer = noiseBuffer; filter.type = 'lowpass'; filter.frequency.value = cutoff;
    g.gain.setValueAtTime(gain, ac.currentTime); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + duration);
    source.connect(filter); filter.connect(g); g.connect(ac.destination); source.start(); source.stop(ac.currentTime + duration);
  }
  function sound(kind, color = null) {
    if (muted) return;
    switch (kind) {
      case 'cast': tone(520, .07, 'square', .018, 190); break;
      case 'hit': tone(105, .045, 'square', .017, -35); break;
      case 'explosion': noise(.32, .065, 520); tone(72, .28, 'sawtooth', .038, -28); break;
      case 'hurt': tone(120, .12, 'sawtooth', .03, -55); break;
      case 'jump': tone(210, .08, 'square', .014, 80); break;
      case 'land': noise(.07, .025, 240); break;
      case 'kick': tone(90, .08, 'square', .025, 45); break;
      case 'spit': tone(310, .08, 'triangle', .012, -80); break;
      case 'trigger': tone(760, .12, 'sine', .022, 360); break;
      case 'electric': tone(900, .13, 'sawtooth', .017, -600); noise(.1, .012, 3200); break;
      case 'coin': tone(880, .08, 'square', .018, 250); break;
      case 'pickup': tone(520, .13, 'triangle', .022, 360); break;
      case 'chest': tone(260, .2, 'triangle', .025, 520); break;
      case 'drown': noise(.18, .025, 480); break;
      case 'death': tone(120, .5, 'sawtooth', .04, -80); noise(.4, .02, 300); break;
      case 'win': [330, 440, 660].forEach((f, i) => setTimeout(() => tone(f, .35, 'triangle', .03, f * .25), i * 130)); break;
      default: tone(240, .08, 'square', .018);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 进度、圣所祝福与胜利
  // ────────────────────────────────────────────────────────────────────────────
  const PERKS = [
    { id: 'ironStomach', name: '炉铸内衬', desc: '受伤后的无敌时间更长。', apply: () => { player.perks.ironStomach = true; } },
    { id: 'fireResist', name: '烬肤', desc: '免疫火焰与熔岩直接伤害。', apply: () => { player.fireResist = true; } },
    { id: 'toxicResist', name: '净血器官', desc: '免疫毒液与毒雾。', apply: () => { player.toxicResist = true; } },
    { id: 'homing', name: '猎手直觉', desc: '所有玩家法术获得轻微追踪。', apply: () => { player.perks.homing = true; } },
    { id: 'swift', name: '风灌靴', desc: '移动速度与加速度提高。', apply: () => { player.perks.swift = true; } },
    { id: 'strongHover', name: '长翼羽', desc: '悬浮燃料消耗减半。', apply: () => { player.perks.strongHover = true; } },
    { id: 'tinker', name: '远行工匠', desc: '随处按 E 打开魔杖编辑台。', apply: () => { player.perks.tinker = true; } },
    { id: 'strongKick', name: '铁底靴', desc: '踢击伤害提高，并可击退敌人。', apply: () => { player.perks.strongKick = true; } },
    { id: 'glass', name: '过载术式', desc: '伤害 +60%，最大生命减半。', apply: () => { player.damageMult = 1.6; player.maxHp = 50; player.hp = Math.min(player.hp, 50); } },
    { id: 'greed', name: '拾荒者的眼睛', desc: '远处金砂会被轻微吸引。', apply: () => { player.perks.magnet = true; } },
    { id: 'lowGravity', name: '轻羽誓约', desc: '重力略微降低，跳跃手感更飘。', apply: () => { player.perks.lowGravity = true; } },
    { id: 'crit', name: '血色专注', desc: '22% 概率造成双倍法术伤害。', apply: () => { player.perks.crit = true; } }
  ];
  function offerPerks(room) {
    if (room.claimed || perkChoices.length) return;
    const pool = shuffle(PERKS.filter(p => !player.perks[p.id])).slice(0, 3);
    if (pool.length < 3) return;
    perkChoices = pool;
    renderPerks();
  }
  function renderPerks() {
    $('perkPanel').innerHTML = `
      <div class="panel-heading"><div><span class="eyebrow">SANCTUM ALTAR</span><h2>铭刻一项祝福</h2></div><span class="key-hint">1 / 2 / 3</span></div>
      <div class="perk-grid">${perkChoices.map((p, i) => `<button class="perk-card" data-perk="${i}"><span>${i + 1}</span><b>${p.name}</b><small>${p.desc}</small></button>`).join('')}</div>`;
    $('perkPanel').classList.remove('hidden', 'hide');
    sound('pickup');
  }
  function choosePerk(index) {
    const perk = perkChoices[index];
    if (!perk) return;
    perk.apply();
    player.perks[perk.id] = true;
    const room = world.holy.find(r => !r.claimed && player.y >= r.y0 && player.y < r.y1);
    if (room) room.claimed = true;
    holyClaimed.add(index);
    perkChoices = [];
    $('perkPanel').classList.add('hidden', 'hide');
    toast(`获得祝福：${perk.name}`, '#bfe36d');
    log(`圣所祝福：${perk.name}`, '#bfe36d');
    sound('perk');
  }
  function winGame() {
    if (gameState === 'victory') return;
    gameState = 'victory';
    $('victory').classList.remove('hidden', 'hide');
    $('death').classList.add('hidden', 'hide');
    sound('win');
  }
  function updateProgress() {
    maxDepth = Math.max(maxDepth, player.y);
    const zone = biomeIndexAt(player.y);
    if (zone !== lastBiome) {
      if (lastBiome >= 0) log(`进入：${BIOMES[zone].name}`, BIOMES[zone].accent);
      toast(zone > lastBiome ? `深入 ${BIOMES[zone].name}` : `返回 ${BIOMES[zone].name}`, BIOMES[zone].accent, 150);
      lastBiome = zone;
    }
    for (const h of world.holy) {
      if (player.y >= h.y0 && player.y < h.y1 && !holyVisited.has(h)) {
        holyVisited.add(h);
        player.hp = player.maxHp;
        player.breath = player.maxBreath;
        wands.forEach(w => w.mana = w.manaMax);
        log('静室：生命与全部魔杖已补满', '#9ce2ba');
        toast('静室已恢复你的HP与魔力', '#9ce2ba', 160);
      }
      if (Math.abs(player.x - h.cx) < 28 && Math.abs(player.y - h.altarY) < 13) offerPerks(h);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 输入、暂停、帮助与移动端
  // ────────────────────────────────────────────────────────────────────────────
  function getAim() {
    let ax, ay;
    if (pointer.active) {
      ax = pointer.x - player.x;
      ay = pointer.y + cameraY - player.y;
    } else ax = player.dir * 10, ay = 0;
    if (Math.hypot(ax, ay) < .1) { ax = player.dir; ay = 0; }
    return { x: ax, y: ay };
  }
  function switchWand(index) {
    if (index < 0 || index >= wands.length) return;
    currentWand = index;
    pointer.active = false;
    toast(`装备：${wands[index].name}`, '#d7ca94');
    updateHud();
  }
  function canEditWands() {
    if (!player) return false;
    if (player.perks.tinker) return true;
    if (inHoly(player.y)) return true;
    return props.some(p => p.type === 'workshop' && Math.hypot(p.x - player.x, p.y - player.y) < 42);
  }
  function openEditor() {
    if (gameState !== 'play' || !canEditWands()) {
      toast('靠近出生房间工作台或任意静室后才能编辑', '#b9c4d6');
      return;
    }
    editorOpen = true;
    selectedBagSpell = null; selectedWandSlot = null;
    renderEditor();
    $('wandEditor').classList.remove('hidden', 'hide');
    sound('pickup');
  }
  function closeEditor() {
    editorOpen = false; selectedBagSpell = null; selectedWandSlot = null;
    $('wandEditor').classList.add('hidden', 'hide');
  }
  function togglePause() {
    if (gameState === 'play' && !editorOpen && !pickupOpen) {
      gameState = 'paused';
      helpOpen = true;
      $('helpPanel').classList.remove('hidden', 'hide');
    } else if (gameState === 'paused' && helpOpen) {
      helpOpen = false; gameState = 'play';
      $('helpPanel').classList.add('hidden', 'hide');
    }
  }

  function bindHoldButton(id, key) {
    const el = $(id);
    if (!el) return;
    const down = e => {
      e.preventDefault();
      try { el.setPointerCapture?.(e.pointerId); } catch (_) { /* 合成/已释放指针无需捕获 */ }
      keys[key] = true;
      if (key === ' ') {
        pressed.add(' ');
        if (player && gameState === 'play' && (player.onGround || player.coyote > 0)) player.jumpBuffer = 7;
      }
    };
    const up = e => { e.preventDefault(); keys[key] = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  function setupInput() {
    window.addEventListener('keydown', e => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!pressed.has(key)) pressed.add(key);
      keys[key] = true;
      if (gameState === 'play' && player && ['w', 'W', 'ArrowUp', ' '].includes(key) && (player.onGround || player.coyote > 0)) player.jumpBuffer = 7;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'w', 'a', 'd', 's'].includes(key)) e.preventDefault();
      if (key === 'escape') {
        if (editorOpen) closeEditor();
        else if (pickupOpen) closeWandPickup();
        else if (perkChoices.length) { /* 祝福必须选择 */ }
        else togglePause();
      }
      if (gameState !== 'play') return;
      if (perkChoices.length && ['1', '2', '3'].includes(key)) {
        choosePerk(+key - 1);
        return;
      }
      if (key === 'e') { if (editorOpen) closeEditor(); else openEditor(); }
      if (key === 'q') switchWand((currentWand + 1) % wands.length);
      if (['1', '2', '3', '4'].includes(key)) switchWand(+key - 1);
      if (key === 'm') toggleAudio();
    });
    window.addEventListener('keyup', e => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys[key] = false;
    });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; pointer.down = false; });

    const setPointer = e => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = clamp((e.clientX - rect.left) / rect.width * VW, 0, VW);
      pointer.y = clamp((e.clientY - rect.top) / rect.height * VH, 0, VH);
      pointer.active = true; pointer.inside = true;
    };
    canvas.addEventListener('pointermove', setPointer);
    canvas.addEventListener('pointerdown', e => {
      if (gameState !== 'play' || editorOpen || pickupOpen) return;
      setPointer(e);
      try { canvas.setPointerCapture?.(e.pointerId); } catch (_) { /* 某些触屏在 down 后立即取消捕获 */ }
      if (e.button === 2) pointer.rightDown = true;
      else { pointer.down = true; ensureAudio(); }
    });
    const release = e => { if (e?.button === 2 || e?.type !== 'pointerup') pointer.rightDown = false; pointer.down = false; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', () => { pointer.down = false; pointer.rightDown = false; });
    canvas.addEventListener('pointerleave', () => { pointer.inside = false; if (matchMedia('(pointer: coarse)').matches) pointer.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    bindHoldButton('touchLeft', 'a');
    bindHoldButton('touchRight', 'd');
    bindHoldButton('touchJump', ' ');
    $('touchFire')?.addEventListener('pointerdown', e => { e.preventDefault(); pointer.down = true; pointer.active = false; });
    $('touchFire')?.addEventListener('pointerup', () => { pointer.down = false; });
    $('touchKick')?.addEventListener('pointerdown', e => { e.preventDefault(); keys.f = true; pressed.add('f'); });
    $('touchEdit')?.addEventListener('click', () => editorOpen ? closeEditor() : openEditor());
    $('touchWand')?.addEventListener('click', () => switchWand((currentWand + 1) % Math.max(1, wands.length)));

    $('startBtn')?.addEventListener('click', startGame);
    $('restartBtn')?.addEventListener('click', startGame);
    $('restartVictoryBtn')?.addEventListener('click', startGame);
    $('closeEditor')?.addEventListener('click', closeEditor);
    $('helpBtn')?.addEventListener('click', togglePause);
    $('closeHelp')?.addEventListener('click', togglePause);
    $('audioBtn')?.addEventListener('click', toggleAudio);
    $('wandBar')?.addEventListener('click', e => { const slot = e.target.closest('[data-wand-index]'); if (slot) switchWand(+slot.dataset.wandIndex); });

    $('perkPanel')?.addEventListener('click', e => { const b = e.target.closest('[data-perk]'); if (b) choosePerk(+b.dataset.perk); });
    $('pickupPanel')?.addEventListener('click', e => { const b = e.target.closest('[data-pickup-action]'); if (b) handlePickupAction(b.dataset.pickupAction); });
    $('wandEditor')?.addEventListener('click', handleEditorClick);
    $('wandEditor')?.addEventListener('dragstart', e => {
      const token = e.target.closest('[data-drag-spell]');
      if (!token) return;
      dragPayload = {
        source: token.dataset.dragSource,
        id: token.dataset.dragSpell,
        wi: token.dataset.wi === undefined ? -1 : +token.dataset.wi,
        si: token.dataset.si === undefined ? -1 : +token.dataset.si
      };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify(dragPayload));
    });
    $('wandEditor')?.addEventListener('dragover', e => { if (e.target.closest('[data-slot]')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
    $('wandEditor')?.addEventListener('drop', e => {
      const slot = e.target.closest('[data-slot]');
      if (!slot || !dragPayload) return;
      e.preventDefault();
      moveSpellToSlot(dragPayload, currentWand, +slot.dataset.slot);
      dragPayload = null;
      renderEditor();
    });
  }
  function handleEditorClick(e) {
    const tab = e.target.closest('[data-wand-tab]');
    if (tab) { currentWand = +tab.dataset.wandTab; selectedWandSlot = null; selectedBagSpell = null; renderEditor(); return; }
    const palette = e.target.closest('[data-palette-spell]');
    if (palette) {
      const id = palette.dataset.paletteSpell;
      selectedBagSpell = selectedBagSpell === id ? null : id;
      selectedWandSlot = null; renderEditor(); return;
    }
    const remove = e.target.closest('[data-remove-slot]');
    if (remove) {
      const si = +remove.dataset.removeSlot;
      addSpellToBag(wands[currentWand].slots[si], 1);
      wands[currentWand].slots.splice(si, 1);
      renderEditor(); return;
    }
    const slot = e.target.closest('[data-slot]');
    if (slot) {
      const si = +slot.dataset.slot;
      if (selectedBagSpell) {
        if (wands[currentWand].slots[si]) addSpellToBag(wands[currentWand].slots[si], 1);
        wands[currentWand].slots[si] = selectedBagSpell;
        addSpellToBag(selectedBagSpell, -1);
        selectedBagSpell = null; selectedWandSlot = null;
      } else if (selectedWandSlot === null) {
        selectedWandSlot = si;
      } else if (selectedWandSlot === si) {
        selectedWandSlot = null;
      } else {
        [wands[currentWand].slots[selectedWandSlot], wands[currentWand].slots[si]] = [wands[currentWand].slots[si], wands[currentWand].slots[selectedWandSlot]];
        selectedWandSlot = null;
      }
      renderEditor(); return;
    }
    if (e.target.closest('[data-toggle-shuffle]')) { wands[currentWand].shuffle = !wands[currentWand].shuffle; renderEditor(); return; }
    if (e.target.closest('[data-clear-wand]')) { wands[currentWand].slots.splice(0); selectedWandSlot = null; renderEditor(); }
  }
  function moveSpellToSlot(source, wi, targetSlot) {
    const wand = wands[wi];
    if (!wand || targetSlot < 0 || targetSlot >= wand.capacity) return;
    if (source.source === 'bag') {
      if ((spellBag[source.id] || 0) <= 0) return;
      if (wand.slots[targetSlot]) addSpellToBag(wand.slots[targetSlot], 1);
      wand.slots[targetSlot] = source.id;
      addSpellToBag(source.id, -1);
    } else {
      if (source.wi < 0 || source.si < 0) return;
      if (source.wi === wi && source.si === targetSlot) return;
      const fromWand = wands[source.wi];
      const displaced = wand.slots[targetSlot];
      wand.slots[targetSlot] = fromWand.slots[source.si];
      fromWand.slots[source.si] = displaced || '';
    }
  }
  function toggleAudio() {
    muted = !muted;
    if (!muted) ensureAudio();
    const b = $('audioBtn');
    if (b) b.textContent = muted ? '声音：关' : '声音：开';
    toast(muted ? '声音已关闭' : '声音已开启', '#c8d1df');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 编辑台 UI
  // ────────────────────────────────────────────────────────────────────────────
  function spellCard(id, source = 'bag', wi = -1, si = -1) {
    const dragAttrs = source === 'bag'
      ? `draggable="true" data-drag-source="bag" data-drag-spell="${id}"`
      : `draggable="true" data-drag-source="wand" data-drag-spell="${id}" data-wi="${wi}" data-si="${si}"`;
    return `<span class="spell-token" style="--spell:${spellColor(id)}" ${dragAttrs}><i>${spellIcon(id)}</i><b>${spellName(id)}</b><small>${spellType(id)}</small></span>`;
  }
  function renderEditor() {
    if (!editorOpen) return;
    const wand = wands[currentWand];
    const groups = [
      ['弹体 · 决定命中前的样子', Object.keys(PROJECTILES).filter(id => (spellBag[id] || 0) > 0)],
      ['修饰 · 改变当前弹体', Object.keys(MODIFIERS).filter(id => (spellBag[id] || 0) > 0)],
      ['触发 · 把后续法术装入载荷', Object.keys(TRIGGERS).filter(id => (spellBag[id] || 0) > 0)]
    ];
    $('wandEditor').innerHTML = `
      <div class="editor-shell">
        <header class="panel-heading editor-heading">
          <div><span class="eyebrow">WAND WORKBENCH</span><h2>魔杖编枝台</h2><p>拖入槽位；也可用“点选法术 → 点槽位”。顺序从左向右结算，触发器之后是命中载荷。</p></div>
          <button id="closeEditor" class="icon-close" aria-label="关闭">×</button>
        </header>
        <div class="editor-tabs">${wands.map((w, i) => `<button class="wand-tab ${i === currentWand ? 'active' : ''}" data-wand-tab="${i}"><span>${i + 1}</span><b>${w.name}</b><small>${w.mana | 0}/${w.manaMax}</small></button>`).join('')}</div>
        <div class="editor-grid">
          <aside class="spell-palette">
            <div class="section-label"><span>法术行囊</span><small>点选或拖拽</small></div>
            ${groups.map(([name, ids]) => `<section><h3>${name}</h3><div class="palette-grid">${ids.length ? ids.map(id => `<button class="palette-card ${selectedBagSpell === id ? 'selected' : ''}" data-palette-spell="${id}"><i style="color:${spellColor(id)}">${spellIcon(id)}</i><span><b>${spellName(id)}</b><small>×${spellBag[id]} · ${SPELL_DEFS[id].mana} 魔力</small></span></button>`).join('') : '<p class="empty-note">此分类暂无可用法术</p>'}</div></section>`).join('')}
          </aside>
          <main class="wand-work-area">
            <div class="wand-title-row"><div><span class="eyebrow">ACTIVE WAND</span><h3>${wand.name}</h3></div><div class="button-row tiny"><button class="text-button ${wand.shuffle ? 'active' : ''}" data-toggle-shuffle>${wand.shuffle ? '洗牌：是' : '顺序：否'}</button><button class="text-button danger" data-clear-wand>清空</button></div></div>
            <div class="wand-stats">${[['施法延迟', `${(wand.castDelay * STEP).toFixed(2)}s`], ['整轮充能', `${(wand.recharge * STEP).toFixed(2)}s`], ['魔力', `${Math.floor(wand.mana)}/${wand.manaMax}`], ['回复', `${wand.regen}/s`], ['容量', `${wand.slots.length}/${wand.capacity}`], ['散布', `${wand.spread}°`]].map(([a, b]) => `<span><small>${a}</small><b>${b}</b></span>`).join('')}</div>
            <div class="wand-slots">${Array.from({ length: wand.capacity }, (_, i) => {
              const id = wand.slots[i];
              const selected = selectedWandSlot === i;
              return `<button class="wand-slot ${id ? 'filled' : 'empty'} ${selected ? 'selected' : ''}" data-slot="${i}" style="--slot:${id ? spellColor(id) : '#505765'}">${id ? `<i>${spellIcon(id)}</i><b>${spellName(id)}</b><small>${spellType(id)}</small><em data-remove-slot="${i}" title="拆下">×</em>` : `<i>＋</i><b>空槽</b><small>拖入法术</small>`}</button>`;
            }).join('')}</div>
            <div class="chain-preview"><span class="section-label">结算预览</span><div class="spell-chain">${wand.slots.length ? wand.slots.map((id, i) => `${i ? '<b>→</b>' : ''}${spellCard(id, 'wand', currentWand, i)}`).join('') : '<p class="empty-note">从左侧拖入一个弹体开始。</p>'}</div></div>
            <div class="editor-note"><b>链式示例</b><p>“炽焰弹 → 散射 → 爆裂”会同时强化整组弹体；“破岩钻 → 碰撞引信 → 火花”会在钻头命中时额外释放火花。魔力按整条链预先扣除。</p></div>
          </main>
        </div>
      </div>`;
    $('closeEditor')?.addEventListener('click', closeEditor);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HUD 与上下文提示
  // ────────────────────────────────────────────────────────────────────────────
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function log(text, color = '#d6dbe6') {
    logs.unshift({ text, color, life: 360 });
    logs = logs.slice(0, 4);
    if ($('messageLog')) $('messageLog').innerHTML = logs.map(l => `<span style="--log:${l.color}">${l.text}</span>`).join('');
  }
  function toast(text, color = '#ead383', duration = 105) {
    toastTimer = duration;
    let el = document.querySelector('.transient-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'transient-toast';
      document.getElementById('hud')?.appendChild(el);
    }
    el.textContent = text;
    el.style.setProperty('--toast', color);
    el.classList.add('show');
  }
  function tickToast() {
    if (toastTimer > 0 && --toastTimer <= 0) document.querySelector('.transient-toast')?.classList.remove('show');
    for (const l of logs) l.life--;
    logs = logs.filter(l => l.life > 0);
  }
  function updateHud() {
    if (!player || !wands.length) return;
    const hp = clamp(player.hp / player.maxHp, 0, 1);
    const mana = clamp(wands[currentWand].mana / wands[currentWand].manaMax, 0, 1);
    const breath = clamp(player.breath / player.maxBreath, 0, 1);
    if ($('healthFill')) $('healthFill').style.width = `${hp * 100}%`;
    if ($('healthText')) $('healthText').textContent = `${Math.max(0, Math.ceil(player.hp))} / ${player.maxHp}`;
    if ($('manaFill')) $('manaFill').style.width = `${mana * 100}%`;
    if ($('manaText')) $('manaText').textContent = `${Math.floor(wands[currentWand].mana)} / ${wands[currentWand].manaMax}`;
    if ($('breathFill')) $('breathFill').style.width = `${breath * 100}%`;
    if ($('breathWrap')) $('breathWrap').classList.toggle('critical', breath < .25);
    if ($('zone')) $('zone').textContent = BIOMES[biomeIndexAt(player.y)].name;
    if ($('depth')) $('depth').textContent = `${depthMeters(maxDepth)} m`;
    if ($('gold')) $('gold').textContent = `${runGold} 金砂`;
    if ($('seedTag')) $('seedTag').textContent = `种子 ${runSeed}`;
    if ($('fps')) $('fps').textContent = `${Math.round(fps)} FPS`;

    const statuses = [];
    if (player.burning > 0) statuses.push(['燃烧', '#ff754a']);
    if (player.poison > 0) statuses.push(['中毒', '#a6d64f']);
    if (player.wet > 0) statuses.push(['湿润', '#67c7e6']);
    if (player.oiled > 0) statuses.push(['油污', '#b58a45']);
    if (player.freeze > 0) statuses.push(['冻结', '#9be6ff']);
    if (player.stun > 0) statuses.push(['麻痹', '#ffe26b']);
    Object.keys(player.perks).forEach(id => statuses.push([PERKS.find(p => p.id === id)?.name || id, '#b8d873']));
    if ($('statusStrip')) $('statusStrip').innerHTML = statuses.map(([name, color]) => `<span style="--status:${color}">${name}</span>`).join('');

    if ($('wandBar')) {
      $('wandBar').innerHTML = wands.map((w, i) => {
        const ratio = clamp(w.mana / w.manaMax, 0, 1);
        return `<button class="wand-quick ${i === currentWand ? 'active' : ''}" data-wand-index="${i}"><span class="quick-key">${i + 1}</span><span class="quick-copy"><b>${w.name}</b><small>${w.slots.length}/${w.capacity} 槽 · ${w.shuffle ? '洗牌' : '顺序'}</small><i><em style="width:${ratio * 100}%"></em></i></span><span class="quick-mana">${Math.floor(w.mana)}</span></button>`;
      }).join('');
    }

    if ($('bossHud')) {
      const boss = enemies.find(e => e.type === 'boss' && !e.dead);
      if (boss && Math.abs(boss.y - player.y) < VH * 1.5) {
        $('bossHud').classList.remove('hidden', 'hide');
        $('bossHud').innerHTML = `<span>${ENEMY_DEFS.boss.name}</span><i><em style="width:${clamp(boss.hp / boss.maxHp, 0, 1) * 100}%"></em></i>`;
      } else $('bossHud').classList.add('hidden', 'hide');
    }
    updateHoverCard();
    updateContext();
  }
  function updateHoverCard() {
    const card = $('hoverCard');
    if (!card) return;
    if (!pointer.inside || gameState !== 'play') { card.classList.add('hidden', 'hide'); return; }
    const x = Math.floor(pointer.x + cameraX), y = Math.floor(pointer.y + cameraY);
    const m = get(x, y), d = materials[m];
    card.classList.remove('hidden', 'hide');
    if ($('hoverName')) $('hoverName').textContent = d.name;
    if ($('hoverMeta')) $('hoverMeta').textContent = `${materialKind(m)} · 密度 ${d.density} · 硬度 ${d.hardness} · 耐久 ${d.durability}`;
  }
  function updateContext() {
    const el = $('contextPrompt');
    if (!el) return;
    let text = '';
    if (canEditWands()) text = 'E / 工作台：编辑魔杖';
    else if (inHoly(player.y)) text = '静室：补给已满 · 寻找中央祭坛';
    else if (player.hover < player.maxHover * .25) text = '悬浮燃料耗尽 · 落地恢复';
    if (editorOpen) text = '拖放或点选装填 · E / Esc 关闭';
    el.textContent = text;
    el.classList.toggle('visible', !!text);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 渲染：材质纹理、光照、原创像素角色、粒子
  // ────────────────────────────────────────────────────────────────────────────
  function materialPixel(m, x, y, i) {
    const d = materials[m];
    if (!d) return;
    let color = d.colors[hash2(x, y, m * 13) & 3];
    if (m === M.BRICK || m === M.HOLY_BRICK) {
      const row = Math.floor(y / 4);
      if (y % 4 === 0 || (x + (row & 1) * 2) % 8 === 0) color = mixColor(color, [0, 0, 0], .48);
    } else if (m === M.WOOD || m === M.PLANK || m === M.ROOT) {
      if ((x + Math.floor(y / 5) * 3) % 9 === 0) color = mixColor(color, [0, 0, 0], .34);
    } else if (m === M.STEEL || m === M.COPPER) {
      if ((x * 3 + y) % 17 === 0) color = mixColor(color, [255, 255, 255], .3);
    } else if (m === M.WATER || m === M.BRINE) {
      if ((x + Math.floor(y / 2)) % 13 === 0) color = mixColor(color, [180, 230, 255], .23);
    } else if (m === M.LAVA || m === M.MOLTEN_METAL) {
      if (hash2(x, y, 91) % 7 === 0) color = mixColor(color, [255, 245, 145], .58);
      if (hash2(x, y, 92) % 11 === 0) color = mixColor(color, [80, 12, 0], .46);
    } else if (m === M.ICE || m === M.FROST_GAS) {
      if ((x + y * 2) % 7 === 0) color = mixColor(color, [220, 250, 255], .34);
    } else if (m === M.FIRE) {
      color = mixColor(color, hash2(x, y, simFrame >> 2) % 3 === 0 ? [255, 245, 155] : [125, 18, 4], .45);
    }
    if (BLOCKS_BODY.has(m)) {
      const above = inside(x, y - 1) ? world.cells[idx(x, y - 1)] : M.AIR;
      if (above === M.AIR && !d.emissive) color = mixColor(color, [190, 180, 145], .17);
    }
    const surface = player ? clamp(.72 - Math.max(0, y - 20) * .0024, .18, .72) : .42;
    const emitBoost = d.emissive ? .9 : 0;
    const brightness = clamp(surface + emitBoost, 0, 1.08);
    pixels[i] = clamp(color[0] * brightness, 0, 255);
    pixels[i + 1] = clamp(color[1] * brightness, 0, 255);
    pixels[i + 2] = clamp(color[2] * brightness, 0, 255);
    pixels[i + 3] = 255;
  }
  function drawWorld() {
    if (!world) return;
    if (renderCount <= 2 || renderCount % 2 === 0 || shake > .1) {
      const y0 = Math.floor(cameraY);
      for (let sy = 0; sy < VH; sy++) {
        const wy = y0 + sy;
        const b = biomeAt(wy);
        const bg = rgb(b.base);
        for (let x = 0; x < VW; x++) {
          const p = (sy * VW + x) * 4;
          const m = get(x, wy);
          if (m === M.AIR) {
            const n = hash2(x, wy, 88) / 4294967296;
            const sky = clamp(1 - wy / 155, .12, 1);
            const bg2 = mixColor([3, 4, 7], bg, .12 + sky * .22);
            const dust = n > .986 ? 18 : 0;
            pixels[p] = bg2[0] + dust; pixels[p + 1] = bg2[1] + dust; pixels[p + 2] = bg2[2] + dust; pixels[p + 3] = 255;
          } else materialPixel(m, x, wy, p);
        }
      }
      worldCtx.putImageData(imageData, 0, 0);
    }
    ctx.drawImage(worldCanvas, 0, 0);
  }
  function screenRect(x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function drawTorches() {
    for (const t of torches) {
      const sy = t.y - cameraY;
      if (sy < -20 || sy > VH + 20) continue;
      const flicker = Math.sin(simFrame * .18 + t.phase) * 1.2;
      screenRect(t.x - 1, sy - 1, 3, 8, '#2d2524');
      screenRect(t.x, sy - 5 + flicker, 2, 7, '#6e3f28');
      screenRect(t.x - 1, sy - 9 + flicker, 4, 6, '#e44e22');
      screenRect(t.x, sy - 11 + flicker, 2, 4, '#ffd26b');
    }
  }
  function drawProps() {
    for (const prop of props) {
      const sy = prop.y - cameraY;
      if (sy < -35 || sy > VH + 35) continue;
      if (prop.type === 'workshop') {
        screenRect(prop.x - 10, sy - 4, 21, 5, '#4e2e27');
        screenRect(prop.x - 11, sy - 6, 23, 3, '#7a4b32');
        screenRect(prop.x - 7, sy + 1, 3, 5, '#2a2020');
        screenRect(prop.x + 6, sy + 1, 3, 5, '#2a2020');
        screenRect(prop.x - 3, sy - 10, 7, 4, '#423b52');
        screenRect(prop.x - 2, sy - 9, 5, 2, '#b083d2');
        screenRect(prop.x - 1, sy - 8, 3, 1, '#f0c76a');
      } else if (prop.type === 'altar') {
        screenRect(prop.x - 11, sy + 1, 23, 5, '#413443');
        screenRect(prop.x - 8, sy - 4, 17, 6, '#625069');
        screenRect(prop.x - 3, sy - 9, 7, 5, '#9b6bc4');
        screenRect(prop.x - 1, sy - 8, 3, 3, '#d7e981');
      }
    }
  }
  function drawBoulders() {
    for (const b of boulders) {
      const sy = b.y - cameraY;
      if (sy < -20 || sy > VH + 20) continue;
      ctx.fillStyle = '#4c3a31';
      ctx.beginPath(); ctx.arc(Math.round(b.x), Math.round(sy), Math.round(b.r), 0, TAU); ctx.fill();
      ctx.fillStyle = '#725344';
      ctx.fillRect(Math.round(b.x - b.r * .55), Math.round(sy - b.r * .45), Math.max(1, b.r * .65), 2);
      ctx.fillStyle = '#241e1e';
      ctx.fillRect(Math.round(b.x - 2), Math.round(sy - 1), 2, 2);
    }
  }
  function drawPickups() {
    for (const p of pickups) {
      const sy = p.y - cameraY;
      if (sy < -16 || sy > VH + 16) continue;
      if (p.type === 'gold') {
        const bob = Math.sin(p.phase) * 1;
        screenRect(p.x - 2, sy - 2 + bob, 4, 3, '#d7a93a');
        screenRect(p.x - 1, sy - 3 + bob, 2, 1, '#ffe486');
      } else if (p.type === 'health') {
        screenRect(p.x - 2, sy - 4, 5, 7, '#63383d');
        screenRect(p.x - 1, sy - 5, 3, 2, '#c2c9c6');
        screenRect(p.x - 1, sy - 3, 3, 5, '#b52e40');
        screenRect(p.x, sy - 2, 1, 3, '#ffd0bd');
      } else if (p.type === 'spell') {
        screenRect(p.x - 2, sy - 3, 5, 6, '#25253a');
        screenRect(p.x - 1, sy - 2, 3, 3, spellColor(p.spell));
      } else if (p.type === 'wand') {
        const bob = Math.sin(p.phase) * 1;
        ctx.save(); ctx.translate(Math.round(p.x), Math.round(sy + bob)); ctx.rotate(-.3 + Math.sin(p.phase * .5) * .08);
        screenRect(-4, -1, 11, 2, '#5e3e2c'); screenRect(6, -1, 2, 2, p.wand?.shuffle ? '#bf82e3' : '#e0c56d'); ctx.restore();
      } else if (p.type === 'chest') {
        const col = p.hp > 0 ? '#8d5c2f' : '#b3854b';
        screenRect(p.x - 6, sy - 3, 13, 7, col);
        screenRect(p.x - 6, sy - 6, 13, 4, '#5a3627');
        screenRect(p.x - 1, sy - 2, 3, 5, '#d5b557');
        screenRect(p.x - 6, sy - 3, 13, 1, '#d0924d');
      }
    }
  }
  function drawEnemy(e) {
    const sy = e.y - cameraY;
    if (sy < -35 || sy > VH + 35) return;
    const x = Math.round(e.x), y = Math.round(sy);
    ctx.save(); ctx.translate(x, y);
    if (e.flash > 0 && e.flash % 2 === 0) ctx.globalAlpha = .8;
    if (e.burrowed && e.type === 'mole') ctx.translate(0, 3);
    const d = ENEMY_DEFS[e.type];
    if (e.type === 'stalker') {
      screenRect(-3, -2, 6, 6, '#1a1a1c'); screenRect(-4, 2, 3, 4, '#3c342e'); screenRect(2, 2, 3, 4, '#3c342e');
      screenRect(-4, -8, 8, 8, e.flash > 0 ? '#f4e5c5' : d.color); screenRect(-2, -11, 5, 4, '#7c4a3d');
      screenRect(-1, -14, 2, 5, '#40302c'); screenRect(-3, -9, 2, 2, '#f5d87b'); screenRect(2, -9, 2, 2, '#f5d87b');
      screenRect(-1, -6, 3, 1, '#212024');
      if (e.fuse >= 0) { ctx.globalAlpha = .35 + Math.sin(simFrame * .4) * .2; ctx.fillStyle = '#ff5c4f'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); }
    } else if (e.type === 'spitter') {
      screenRect(-3, 2, 3, 5, '#3c2a35'); screenRect(1, 2, 3, 5, '#3c2a35');
      screenRect(-4, -7, 8, 10, e.flash > 0 ? '#ffe3e3' : d.color); screenRect(-5, -11, 10, 5, '#7d3155');
      screenRect(-2, -4, 2, 2, '#ffd76a'); screenRect(1, -4, 2, 2, '#ffd76a');
      screenRect(5, -2, 4, 2, '#c99355');
    } else if (e.type === 'wisp') {
      ctx.fillStyle = e.flash > 0 ? '#fff' : d.color; ctx.beginPath(); ctx.arc(0, -1, 5, 0, TAU); ctx.fill();
      screenRect(-7, -2, 4, 2, '#8ed9eb'); screenRect(4, -2, 4, 2, '#8ed9eb');
      screenRect(-2, 2, 2, 4, '#b579cc'); screenRect(1, 2, 2, 4, '#b579cc');
      screenRect(-2, -3, 2, 2, '#f5ffff'); screenRect(1, -3, 2, 2, '#f5ffff');
    } else if (e.type === 'bomber') {
      ctx.fillStyle = e.flash > 0 ? '#fff0c0' : d.color; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
      screenRect(-1, -10, 2, 5, '#6e392c'); screenRect(-3, -11, 6, 2, '#f0a04e');
      screenRect(-3, -2, 2, 2, '#31131a'); screenRect(2, 1, 2, 2, '#31131a');
    } else if (e.type === 'mole') {
      screenRect(-7, -1, 14, 6, e.flash > 0 ? '#fff' : d.color);
      for (let i = -5; i <= 4; i += 3) screenRect(i, 2, 2, 3, '#4b342a');
      screenRect(6, -3, 5, 4, '#c39772'); screenRect(9, -2, 2, 2, '#211516');
      if (e.burrowed) { ctx.globalAlpha = .5; screenRect(-10, 3, 20, 2, '#5c4030'); }
    } else if (e.type === 'boss') {
      const pulse = 1 + Math.sin(simFrame * .08) * .07;
      ctx.scale(pulse, pulse);
      screenRect(-12, 9, 9, 13, '#4a284c'); screenRect(5, 9, 9, 13, '#4a284c');
      ctx.fillStyle = e.flash > 0 ? '#fff0ff' : d.color; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
      screenRect(-11, -8, 22, 4, '#74366f');
      screenRect(-8, -5, 6, 6, '#ffd55f'); screenRect(3, -5, 6, 6, '#ffd55f');
      screenRect(-5, -3, 3, 3, '#281122'); screenRect(3, -3, 3, 3, '#281122');
      for (let n = 0; n < 6; n++) screenRect(-9 + n * 3, 9 + (n % 2) * 3, 2, 6, '#e5679c');
    }
    ctx.restore();
    if (e.hp < e.maxHp && e.type !== 'boss') {
      screenRect(x - 7, y - e.h / 2 - 5, 14, 1, '#21151a');
      screenRect(x - 7, y - e.h / 2 - 5, 14 * clamp(e.hp / e.maxHp, 0, 1), 1, '#d85864');
    }
  }
  function drawProjectiles() {
    for (const p of projectiles) {
      const sy = p.y - cameraY;
      if (sy < -12 || sy > VH + 12) continue;
      const x = p.x, py = p.py - cameraY;
      ctx.globalAlpha = p.owner === 'player' ? .38 : .28;
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.radius);
      ctx.beginPath(); ctx.moveTo(Math.round(x), Math.round(sy)); ctx.lineTo(Math.round(py === sy ? x : x - p.vx * 2), Math.round(py === sy ? sy : sy - p.vy * 2)); ctx.stroke(); ctx.globalAlpha = 1;
      if (p.id === 'boulder') {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(Math.round(x), Math.round(sy), 3, 0, TAU); ctx.fill();
        screenRect(x - 1, sy - 1, 2, 2, '#5a3c2e');
      } else if (p.id === 'drill') {
        screenRect(x - 1, sy - 3, 3, 6, '#d8e4e5'); screenRect(x, sy - 1, 4, 2, '#8ca6a8');
      } else if (p.id === 'frost') {
        screenRect(x - 1, sy - 3, 2, 6, p.color); screenRect(x - 3, sy - 1, 6, 2, p.color);
      } else if (p.id === 'arc') {
        screenRect(x - 4, sy, 8, 1, p.color); screenRect(x, sy - 4, 1, 8, p.color); screenRect(x - 1, sy - 1, 2, 2, '#fff');
      } else {
        screenRect(x - p.radius, sy - p.radius, p.radius * 2 + 1, p.radius * 2 + 1, p.color);
        screenRect(x, sy, 1, 1, '#fff7d2');
      }
    }
  }
  function drawPlayer() {
    if (!player || player.dead) return;
    const x = Math.round(player.x), y = Math.round(player.y - cameraY);
    if (player.inv > 0 && player.inv % 4 < 2) ctx.globalAlpha = .45;
    screenRect(x - 4, y + 4, 3, 4, '#25222a'); screenRect(x + 1, y + 4, 3, 4, '#25222a');
    screenRect(x - 4, y - 4, 8, 9, player.flash > 0 ? '#fff' : '#67538d');
    screenRect(x - 5, y - 2, 2, 7, '#4a3b6b'); screenRect(x + 3, y - 2, 2, 7, '#8066a3');
    screenRect(x - 3, y - 10, 6, 7, '#c0a6a4'); screenRect(x - 4, y - 9, 8, 3, '#342c3d');
    screenRect(x - 2, y - 13, 4, 5, '#44374b'); screenRect(x - 4, y - 11, 8, 2, '#5a4662');
    screenRect(x + player.dir, y - 7, 1, 1, '#8ee7ff');
    const aim = getAim(), angle = Math.atan2(aim.y, aim.x);
    ctx.save(); ctx.translate(x, y - 2); ctx.rotate(angle);
    screenRect(3, -1, 9, 2, '#7c5437'); screenRect(11, -1, 3, 2, wands[currentWand]?.shuffle ? '#b984e1' : '#e1c56a');
    if (wands[currentWand]?.flash > 0) screenRect(14, -2, 3, 4, '#fff2b5');
    ctx.restore();
    if (player.burning > 0) { screenRect(x - 3, y - 15 + Math.sin(simFrame * .3), 2, 4, '#ff6a2f'); screenRect(x + 1, y - 14 - Math.sin(simFrame * .4), 2, 4, '#ffc35a'); }
    ctx.globalAlpha = 1;
  }
  function drawParticles() {
    for (const p of particles) {
      const sy = p.y - cameraY;
      if (sy < -20 || sy > VH + 20) continue;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'ring') {
        const t = 1 - p.life / p.max;
        ctx.strokeStyle = p.color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, sy, lerp(1, p.maxRadius, t), 0, TAU); ctx.stroke();
      } else if (p.kind === 'text') {
        ctx.fillStyle = p.color; ctx.font = '7px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(p.text, Math.round(p.x), Math.round(sy));
      } else {
        screenRect(p.x, sy, p.size, p.size, p.color);
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawLightnings() {
    for (const l of lightnings) {
      const y1 = l.y1 - cameraY, y2 = l.y2 - cameraY;
      ctx.globalAlpha = l.life / l.max; ctx.strokeStyle = l.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(l.x1), Math.round(y1));
      const segs = 4;
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const jitterX = (hash2(t, l.x1, l.y1 + simFrame) / 4294967296 - .5) * 6;
        const jitterY = (hash2(t, l.y1, l.x2 + simFrame) / 4294967296 - .5) * 6;
        ctx.lineTo(Math.round(lerp(l.x1, l.x2, t) + jitterX), Math.round(lerp(y1, y2, t) + jitterY));
      }
      ctx.lineTo(Math.round(l.x2), Math.round(y2)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function radialLight(context, x, y, radius, color, alpha = 1) {
    if (radius <= 0) return;
    const g = context.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${alpha})`);
    g.addColorStop(.28, `rgba(${color[0]},${color[1]},${color[2]},${alpha * .62})`);
    g.addColorStop(.62, `rgba(${color[0]},${color[1]},${color[2]},${alpha * .22})`);
    g.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
    context.fillStyle = g; context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  function drawLighting() {
    if (renderCount % 3 === 0 || shake > .1 || projectiles.length || particles.some(p => p.kind === 'ring')) {
      lightCtx.clearRect(0, 0, VW, VH);
      radialLight(lightCtx, player.x, player.y - cameraY - 1, 34, [105, 132, 170], .20);
      for (const t of torches) {
        const sy = t.y - cameraY;
        if (sy < -80 || sy > VH + 80) continue;
        const flicker = .84 + Math.sin(simFrame * .21 + t.phase) * .12;
        radialLight(lightCtx, t.x + .5, sy - 7, 86, [255, 104, 30], .30 * flicker);
      }
      for (const p of pickups) if (p.type === 'wand') radialLight(lightCtx, p.x, p.y - cameraY, 26, [255, 210, 95], .32);
      for (const p of projectiles) if (p.light) radialLight(lightCtx, p.x, p.y - cameraY, p.light * 3.6, p.color === '#ff8a35' ? [255, 105, 25] : [95, 190, 235], .52);
      const y0 = Math.floor(cameraY), y1 = y0 + VH;
      let budget = 38;
      for (let y = y0; y <= y1 && budget > 0; y += 2) {
        for (let x = 0; x < WW && budget > 0; x += 2) {
          const m = get(x, y), d = materials[m];
          if (!d?.light) continue;
          if (m === M.FIRE && hash2(x, y, simFrame >> 1) % 7 !== 0) continue;
          if (m === M.LAVA && hash2(x, y, 91) % 5 !== 0) continue;
          const sy = y - cameraY;
          const range = m === M.LAVA ? 47 : m === M.FIRE ? 24 : m === M.GLOW_CAP ? 39 : 21;
          radialLight(lightCtx, x + .5, sy + .5, range, d.light, m === M.FIRE ? .30 : .22);
          budget--;
        }
      }
      for (const p of particles) if (p.kind === 'ring' && p.life > 2) radialLight(lightCtx, p.x, p.y - cameraY, p.maxRadius * (1 - p.life / p.max) * 1.2, p.color === '#ffb14c' ? [255, 120, 35] : [180, 100, 255], .34);
    }
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.drawImage(lightCanvas, 0, 0); ctx.restore();
  }
  function drawAim() {
    if (!pointer.active || !pointer.inside || editorOpen || pickupOpen) return;
    const x = Math.round(pointer.x), y = Math.round(pointer.y);
    ctx.globalAlpha = .45; ctx.strokeStyle = '#d5c58c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x - 2, y); ctx.moveTo(x + 2, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y - 2); ctx.moveTo(x, y + 2); ctx.lineTo(x, y + 5); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawScene() {
    renderCount++;
    ctx.save();
    if (shake > .1) {
      const shakeX = (hash2(simFrame, Math.round(shake * 100), 1) / 4294967296 - .5) * shake * 2;
      const shakeY = (hash2(simFrame, Math.round(shake * 100), 2) / 4294967296 - .5) * shake * 2;
      ctx.translate(Math.round(shakeX), Math.round(shakeY));
    }
    drawWorld();
    drawTorches();
    drawProps();
    drawBoulders();
    for (const e of enemies) drawEnemy(e);
    drawPickups();
    drawProjectiles();
    drawPlayer();
    drawLighting();
    drawParticles();
    drawLightnings();
    drawAim();
    ctx.restore();

    ctx.fillStyle = vignetteGradient; ctx.fillRect(0, 0, VW, VH);
    if (flash > 0) { ctx.fillStyle = `rgba(255,235,220,${clamp(flash, 0, .4)})`; ctx.fillRect(0, 0, VW, VH); }
  }
  function drawTitleBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#080b13'); g.addColorStop(.58, '#15121a'); g.addColorStop(1, '#070609');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    for (let n = 0; n < 100; n++) {
      const x = hash2(n, 11, 77) % VW, y = hash2(n, 22, 78) % VH;
      ctx.fillStyle = `rgba(185,164,214,${.08 + (n % 4) * .025})`; ctx.fillRect(x, y, 1, 1);
    }
    const t = performance.now() * .0008;
    for (let n = 0; n < 7; n++) {
      const x = (n * 81 + 31) % VW;
      const y = VH - ((n * 47 + t * (20 + n * 4)) % (VH + 40));
      radialLight(ctx, x, y, 34, [255, 87 + n * 8, 32], .45);
    }
  }
  function draw() {
    if (!world || gameState === 'title') { drawTitleBackground(); return; }
    drawScene();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 主循环、启动与调试接口
  // ────────────────────────────────────────────────────────────────────────────
  function update() {
    if (gameState !== 'play' || editorOpen || pickupOpen || perkChoices.length) return;
    simFrame++;
    runSeconds += STEP;
    if (hitStop > 0) { hitStop -= STEP; return; }
    updateWands();
    updateMaterials();
    updatePlayer();
    updateProjectiles();
    updateEnemies();
    updatePickups();
    updateBoulders();
    updateParticles();
    updateProgress();
    const targetY = player.y - VH * .53;
    cameraY = lerp(cameraY, clamp(targetY, 0, WORLD_H - VH), .09);
    cameraX = 0;
    flash = Math.max(0, flash - .035);
    shake *= .84;
    if (shake < .05) shake = 0;
    for (const w of wands) if (w.flash > 0) w.flash--;
    hudTimer--;
    if (hudTimer <= 0) { hudTimer = 8; updateHud(); }
  }
  function loop(now) {
    if (!lastTime) lastTime = now;
    const elapsed = Math.min(.05, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += elapsed;
    while (accumulator >= STEP) { update(); accumulator -= STEP; }
    draw();
    tickToast();
    frameSamples.push(elapsed);
    if (frameSamples.length > 45) frameSamples.shift();
    const avg = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length;
    fps = avg > 0 ? 1 / avg : 60;
    pressed.clear();
    requestAnimationFrame(loop);
  }
  function startGame(userGesture = true) {
    if (userGesture) ensureAudio();
    else muted = true;
    runSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    seed = runSeed;
    rng = makeRng(seed);
    simFrame = 1;
    runGold = 0; runKills = 0; maxDepth = 0; runSeconds = 0; cameraY = 0; cameraX = 0;
    enemies = []; projectiles = []; particles = []; pickups = []; boulders = []; torches = []; props = []; lightnings = [];
    holyClaimed = new Set(); holyVisited = new Set(); perkChoices = []; logs = [];
    editorOpen = pickupOpen = helpOpen = false; lastBiome = -1; flash = 0; shake = 0; hitStop = 0;
    selectedBagSpell = null; selectedWandSlot = null; dragPayload = null; pendingWandPickup = null;
    pointer.down = false; pointer.rightDown = false; pointer.active = false;
    for (const key in keys) keys[key] = false;
    pressed.clear();
    ['title', 'death', 'victory', 'wandEditor', 'perkPanel', 'pickupPanel', 'helpPanel', 'bossHud', 'bootError'].forEach(id => $(id)?.classList.add('hidden', 'hide'));
    generateWorld();
    resetPlayer();
    setupWands();
    gameState = 'play';
    updateHud();
    log(`远征开始 · 种子 ${runSeed}`, '#e2cc82');
    toast('靠近右侧工作台可编辑法杖', '#d9d09a', 170);
    sound('pickup');
  }

  function debugState() {
    if (!world || !player) return { state: gameState, world: false };
    return {
      state: gameState, seed: runSeed, frame: simFrame, seconds: runSeconds, cameraY,
      player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, hp: player.hp, breath: player.breath, onGround: player.onGround, coyote: player.coyote, jumpBuffer: player.jumpBuffer, stun: player.stun, freeze: player.freeze, dead: player.dead },
      zone: biomeIndexAt(player.y), depth: depthMeters(maxDepth), gold: runGold, kills: runKills,
      currentWand, wandSlots: wands.map(w => w.slots.slice()),
      enemies: enemies.filter(e => !e.dead).length,
      enemyTypes: [...new Set(enemies.filter(e => !e.dead).map(e => e.type))],
      debugEnemies: enemies.filter(e => !e.dead && e.debugMarker).map(e => ({ type: e.type, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, burrowed: e.burrowed, fuse: e.fuse })),
      nearestEnemy: enemies.filter(e => !e.dead).map(e => ({ type: e.type, x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp })).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0] || null,
      projectiles: projectiles.length, particles: particles.length,
      projectileDetails: projectiles.map(p => ({ id: p.id, owner: p.owner, x: p.x, y: p.y, trigger: p.trigger, payload: p.payload.map(d => d.id) })),
      materials: materials.length, materialCount: world.materialCounts.length, editorOpen, gameState,
      inputKeys: Object.keys(keys).filter(k => keys[k])
    };
  }
  function debugSpawnEnemy(type = 'stalker', dx = 18) {
    if (!player) return null;
    const e = spawnEnemy(type, player.x + dx, player.y - 2);
    if (e) { e.hp = 32; e.maxHp = 32; e.debugMarker = true; }
    return e ? { type: e.type, x: e.x, y: e.y, hp: e.hp } : null;
  }
  function debugCell(x, y) {
    if (!inside(x | 0, y | 0)) return null;
    const m = get(x | 0, y | 0), i = idx(x | 0, y | 0);
    return { id: m, name: materialName(m), kind: materialKind(m), life: world.life[i], temp: world.temp[i] };
  }
  window.__ASHFALL_DEBUG__ = {
    version: '1.0.0',
    start: () => startGame(false),
    state: debugState,
    step(n = 1) { for (let i = 0; i < n; i++) update(); draw(); return debugState(); },
    benchmark(n = 120) { const t0 = performance.now(); for (let i = 0; i < n; i++) update(); const t1 = performance.now(); for (let i = 0; i < n; i++) draw(); const t2 = performance.now(); return { updateMs: t1 - t0, drawMs: t2 - t1, updateEach: (t1 - t0) / n, drawEach: (t2 - t1) / n }; },
    cell: debugCell,
    setCell(x, y, nameOrId, life, temp) {
      const id = typeof nameOrId === 'string' ? M[nameOrId.toUpperCase()] : nameOrId;
      if (id === undefined) return false;
      setCell(x | 0, y | 0, id, life, temp); return true;
    },
    material: nameOrId => materials[typeof nameOrId === 'string' ? M[nameOrId.toUpperCase()] : nameOrId],
    spawnEnemy: debugSpawnEnemy,
    teleport(x, y) { if (!player) return false; player.x = clamp(+x, 5, WW - 5); player.y = clamp(+y, 5, WORLD_H - 5); player.vx = player.vy = 0; cameraY = clamp(player.y - VH * .53, 0, WORLD_H - VH); return true; },
    cast() { castWand(); draw(); return projectiles.length; },
    inspectCast(index = currentWand) {
      const wand = wands[index | 0];
      if (!wand) return null;
      const cast = buildCast(wand);
      const summarize = shot => ({
        id: shot.id, damage: shot.damage, speed: shot.speed, count: shot.count, spread: shot.spread,
        pierce: shot.pierce, explosion: shot.explosion, explosionDamage: shot.explosionDamage,
        light: shot.light, fireTrail: shot.fireTrail, trigger: shot.trigger, life: shot.life || shot.def.life,
        timerShell: !!shot.timerShell, payload: shot.payload.map(summarize), mods: { ...shot.mods }
      });
      return { name: wand.name, slots: wand.slots.slice(), mana: cast.mana, extraDelay: cast.extraDelay, shots: cast.shots.map(summarize) };
    },
    setPlayerStat(name, value) { if (player && name in player) { player[name] = value; return true; } return false; },
    hurt(amount, reason = '测试伤害') { damagePlayer(+amount || 10, reason, reason, true); draw(); return player.hp; },
    die(reason = '测试压碎') { die(reason, reason); draw(); return gameState; },
    killPlayer() { if (player) { player.hp = 0; die('压死', '测试岩块重击'); } draw(); return gameState; },
    killEnemies() { for (const e of enemies) if (!e.dead) damageEnemy(e, 99999, 'debug', '测试'); draw(); return runKills; },
    clearEnemies() { enemies = []; projectiles = []; lightnings = []; draw(); return true; },
    openEditor, closeEditor, togglePause,
    physicsProbe() {
      if (!world) return null;
      for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WW; x++) setCell(x, y, M.AIR);
      cameraY = 145;
      // 密闭小管：油应浮在血/水上方，血应沉到管底。
      for (let y = 149; y <= 176; y++) { setCell(239, y, M.HARD_ROCK); setCell(241, y, M.HARD_ROCK); }
      setCell(240, 149, M.HARD_ROCK); setCell(240, 176, M.HARD_ROCK);
      setCell(240, 174, M.WATER); setCell(240, 173, M.OIL); setCell(240, 172, M.BLOOD);
      // 熔岩与水接触后，熔岩格应凝成黑曜石并留下蒸汽。
      for (let y = 167; y <= 176; y++) { setCell(247, y, M.HARD_ROCK); setCell(253, y, M.HARD_ROCK); }
      for (let x = 248; x <= 252; x++) { setCell(x, 166, M.HARD_ROCK); setCell(x, 176, M.HARD_ROCK); }
      setCell(249, 174, M.LAVA); setCell(250, 174, M.WATER);

      // 酸蚀：由下方酸滴持续接近上方泥土。
      for (let y = 158; y <= 176; y++) { setCell(258, y, M.HARD_ROCK); setCell(268, y, M.HARD_ROCK); }
      for (let x = 259; x <= 267; x++) { setCell(x, 157, M.HARD_ROCK); setCell(x, 176, M.HARD_ROCK); }
      for (let x = 262; x <= 264; x++) setCell(x, 174, M.DIRT);
      setCell(263, 173, M.ACID);
      // 蔓延火：木梁上放一枚火种；水压在火上方时应立刻灭火。
      for (let x = 208; x <= 222; x++) setCell(x, 174, M.HARD_ROCK);
      for (let x = 210; x <= 218; x++) setCell(x, 172, M.WOOD);
      setCell(214, 171, M.FIRE, 150);
      setCell(220, 172, M.FIRE, 150); setCell(220, 171, M.WATER);
      // 毒气上升。
      setCell(230, 173, M.TOXIC_GAS, 600);
      const gasStartY = 173;
      for (let i = 0; i < 2; i++) { simFrame++; updateMaterials(); }
      let earlyStone = false, earlySteam = false;
      for (let y = 150; y < 176; y++) for (let x = 248; x <= 252; x++) {
        if (get(x, y) === M.OBSIDIAN) earlyStone = true;
        if (get(x, y) === M.STEAM) earlySteam = true;
      }
      for (let i = 2; i < 120; i++) { simFrame++; updateMaterials(); }
      let yOil = 9999, yBlood = -1, yWater = -1;
      for (let y = 150; y < 176; y++) {
        for (let x = 236; x <= 244; x++) {
          const m = get(x, y);
          if (m === M.OIL) yOil = Math.min(yOil, y);
          if (m === M.BLOOD) yBlood = Math.max(yBlood, y);
          if (m === M.WATER) yWater = Math.max(yWater, y);
        }
      }
      const oilAboveWater = yOil >= 0 && yWater >= 0 && yOil < yWater;
      const bloodSank = yBlood >= 0 && yWater >= 0 && yBlood > yWater;
      let stone = false, steam = false;
      for (let y = 167; y < 176; y++) for (let x = 248; x <= 252; x++) {
        if (get(x, y) === M.OBSIDIAN) stone = true;
        if (get(x, y) === M.STEAM) steam = true;
      }
      const coords = { oil: [], water: [], blood: [], lava: [], stone: [], steam: [] };
      for (let y = 0; y < WORLD_H; y++) for (let x = 0; x < WW; x++) {
        const m = get(x, y);
        if (m === M.OIL) coords.oil.push([x, y]);
        if (m === M.WATER) coords.water.push([x, y]);
        if (m === M.BLOOD) coords.blood.push([x, y]);
        if (m === M.LAVA) coords.lava.push([x, y]);
        if (m === M.OBSIDIAN) coords.stone.push([x, y]);
        if (m === M.STEAM) coords.steam.push([x, y]);
      }
      countWorldMaterials();
      const countRegion = (x0, y0, x1, y1, id) => {
        let n = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (get(x, y) === id) n++;
        return n;
      };
      const dirtAfter = countRegion(258, 157, 268, 175, M.DIRT);
      const woodAfter = countRegion(205, 168, 222, 175, M.WOOD);
      let gasEndY = -1;
      for (let y = 100; y < 176; y++) if (get(230, y) === M.TOXIC_GAS) { gasEndY = y; break; }
      const acidCorroded = dirtAfter < 12;
      const fireSpread = woodAfter < 9;
      const waterExtinguished = countRegion(219, 168, 222, 175, M.FIRE) === 0;
      const toxicGasRose = gasEndY >= 0 && gasEndY < gasStartY;
      const lavaWaterSteamStone = earlyStone && earlySteam;
      const result = {
        oilAboveWater, bloodSank, lavaWaterSteamStone, acidCorroded, fireSpread, waterExtinguished, toxicGasRose,
        yOil, yWater, yBlood, stone, steam, coords,
        remaining: {
          oil: world.materialCounts[M.OIL], water: world.materialCounts[M.WATER], blood: world.materialCounts[M.BLOOD],
          lava: world.materialCounts[M.LAVA], stone: world.materialCounts[M.OBSIDIAN], steam: world.materialCounts[M.STEAM]
        }
      };
      startGame(false);
      return result;
    }
  };

  setupInput();
  window.addEventListener('error', e => {
    const box = $('bootError');
    if (!box) return;
    box.textContent = `运行错误：${e.message}`;
    box.classList.remove('hidden', 'hide');
  });
  if ($('helpPanel')) {
    $('helpPanel').innerHTML = `<div class="help-card"><div class="panel-heading"><div><span class="eyebrow">FIELD MANUAL</span><h2>生存手册</h2></div><button id="closeHelp" class="icon-close">×</button></div><div class="help-grid"><section><b>移动</b><p><kbd>A</kbd><kbd>D</kbd> 行走，<kbd>W</kbd>/<kbd>Space</kbd> 跳跃；空中按住可消耗悬浮燃料。</p></section><section><b>战斗</b><p>鼠标瞄准并按住左键施法；<kbd>F</kbd>/右键踢击；<kbd>1</kbd>–<kbd>4</kbd> 或 <kbd>Q</kbd> 换杖。</p></section><section><b>法杖</b><p>靠近工作台或静室按 <kbd>E</kbd>。拖拽法术，触发器之后放“载荷法术”。</p></section><section><b>物质</b><p>油比水轻，血比水重；水灭火，熔岩遇水成石并产生蒸汽，酸会持续吞噬路径。</p></section></div><button class="primary-button" id="resumeHelp">继续远征</button></div>`;
    $('closeHelp')?.addEventListener('click', togglePause);
    $('resumeHelp')?.addEventListener('click', togglePause);
  }
  updateHud();
  requestAnimationFrame(loop);
})();
