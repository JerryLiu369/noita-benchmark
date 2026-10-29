'use strict';
/* EMBERWELL — original falling-sand action roguelite.
   Mechanics inspired by publicly documented Noita systems.
   No third-party assets, no build step, no network. */
(function (global) {
  const VW = 384, VH = 216, W = 384, H = 2100;
  const SURF = 72, BH = 352, HH = 68;
  const NMAT = 40;
  const T_AIR = 0, T_STATIC = 1, T_POWDER = 2, T_LIQUID = 3, T_GAS = 4, T_FIRE = 5;

  const AIR = 0, ROCK = 1, DIRT = 2, SAND = 3, WATER = 4, OIL = 5, LAVA = 6, WOOD = 7,
    ICE = 8, MOSS = 9, BLOOD = 10, STEAM = 11, FIRE = 12, SMOKE = 13, GOLD = 14,
    SNOW = 15, TOXIC = 16, STONE = 17, METAL = 18, BRICK = 19, ACID = 20, COAL = 21,
    FUNGUS = 22, GUNP = 23, PGAS = 24, SLIME = 25, ASH = 26, EMBER = 27, SANDST = 28,
    SNOWROCK = 29, VINE = 30, GLASS = 31, FGAS = 32, RUST = 33, CRYSTAL = 34, MUD = 35,
    WOODP = 36, DENSE = 37, GRASS = 38, BONE = 39;

  const TYPE = new Uint8Array(NMAT);
  const DEN = new Float32Array(NMAT);
  const HARD = new Uint8Array(NMAT);
  const FLAM = new Uint8Array(NMAT);
  const CORR = new Uint8Array(NMAT);
  const EMIT = new Uint8Array(NMAT);
  const CR = new Uint8Array(NMAT), CG = new Uint8Array(NMAT), CB = new Uint8Array(NMAT), CV = new Uint8Array(NMAT);
  const ER = new Uint8Array(NMAT), EG = new Uint8Array(NMAT), EB = new Uint8Array(NMAT);
  const MNAME = new Array(NMAT);

  function mat(id, o) {
    TYPE[id] = o.t; DEN[id] = o.d || 0; HARD[id] = o.h || 0; FLAM[id] = o.f || 0; CORR[id] = o.c || 0;
    EMIT[id] = o.e || 0; CR[id] = o.r; CG[id] = o.g; CB[id] = o.b; CV[id] = o.v || 6;
    ER[id] = o.er || 255; EG[id] = o.eg || 180; EB[id] = o.eb || 80;
    MNAME[id] = o.n;
  }
  mat(AIR,      { t: T_AIR,    d: 0,    h: 0,  r: 8,   g: 9,   b: 14,  v: 0, n: '空气' });
  mat(ROCK,     { t: T_STATIC, d: 5,    h: 10, r: 78,  g: 74,  b: 70,  v: 10, n: '岩石' });
  mat(DIRT,     { t: T_STATIC, d: 4,    h: 6,  r: 98,  g: 72,  b: 52,  v: 12, n: '土壤' });
  mat(SAND,     { t: T_POWDER, d: 1.8,  h: 4,  r: 196, g: 162, b: 92,  v: 14, n: '沙' });
  mat(WATER,    { t: T_LIQUID, d: 1.0,  h: 0,  r: 58,  g: 122, b: 186, v: 10, n: '水' });
  mat(OIL,      { t: T_LIQUID, d: 0.80, h: 0,  f: 90, r: 92,  g: 64,  b: 28,  v: 8, n: '油' });
  mat(LAVA,     { t: T_LIQUID, d: 2.60, h: 0,  e: 200, r: 255, g: 92,  b: 28,  v: 18, er: 255, eg: 120, eb: 20, n: '熔岩' });
  mat(WOOD,     { t: T_STATIC, d: 3,    h: 6,  f: 80, r: 118, g: 78,  b: 46,  v: 10, n: '木' });
  mat(ICE,      { t: T_STATIC, d: 3,    h: 8,  r: 170, g: 210, b: 230, v: 10, n: '冰' });
  mat(MOSS,     { t: T_STATIC, d: 2,    h: 4,  f: 50, r: 62,  g: 108, b: 52,  v: 10, n: '苔' });
  mat(BLOOD,    { t: T_LIQUID, d: 1.05, h: 0,  r: 168, g: 36,  b: 48,  v: 10, n: '血' });
  mat(STEAM,    { t: T_GAS,    d: 0.30, h: 0,  e: 12, r: 198, g: 214, b: 222, v: 8, n: '蒸汽' });
  mat(FIRE,     { t: T_FIRE,   d: 0.15, h: 0,  e: 220, r: 255, g: 150, b: 40,  v: 24, er: 255, eg: 160, eb: 40, n: '火' });
  mat(SMOKE,    { t: T_GAS,    d: 0.20, h: 0,  r: 86,  g: 86,  b: 96,  v: 10, n: '烟' });
  mat(GOLD,     { t: T_POWDER, d: 3.00, h: 4,  e: 40, r: 232, g: 188, b: 64,  v: 12, er: 255, eg: 210, eb: 80, n: '金沙' });
  mat(SNOW,     { t: T_POWDER, d: 0.90, h: 3,  r: 226, g: 236, b: 244, v: 8, n: '雪' });
  mat(TOXIC,    { t: T_LIQUID, d: 1.15, h: 0,  r: 132, g: 186, b: 42,  v: 10, n: '毒泥' });
  mat(STONE,    { t: T_STATIC, d: 5,    h: 10, r: 96,  g: 96,  b: 100, v: 8, n: '凝岩' });
  mat(METAL,    { t: T_STATIC, d: 7,    h: 12, r: 118, g: 124, b: 132, v: 8, n: '钢铁' });
  mat(BRICK,    { t: T_STATIC, d: 8,    h: 14, r: 92,  g: 86,  b: 78,  v: 8, n: '圣砖' });
  mat(ACID,     { t: T_LIQUID, d: 1.40, h: 0,  e: 30, r: 150, g: 230, b: 60,  v: 12, er: 160, eg: 255, eb: 80, n: '强酸' });
  mat(COAL,     { t: T_STATIC, d: 4,    h: 8,  f: 70, r: 32,  g: 30,  b: 34,  v: 8, n: '煤' });
  mat(FUNGUS,   { t: T_STATIC, d: 2,    h: 5,  f: 55, e: 90, r: 186, g: 72,  b: 168, v: 14, er: 220, eg: 80, eb: 210, n: '菌肉' });
  mat(GUNP,     { t: T_POWDER, d: 1.30, h: 3,  f: 100, r: 58,  g: 52,  b: 46,  v: 8, n: '火药' });
  mat(PGAS,     { t: T_GAS,    d: 0.25, h: 0,  r: 96,  g: 160, b: 48,  v: 10, n: '毒气' });
  mat(SLIME,    { t: T_LIQUID, d: 1.20, h: 0,  r: 72,  g: 168, b: 96,  v: 10, n: '粘液' });
  mat(ASH,      { t: T_POWDER, d: 0.70, h: 2,  r: 120, g: 118, b: 116, v: 8, n: '灰' });
  mat(EMBER,    { t: T_POWDER, d: 0.50, h: 1,  e: 160, f: 20, r: 255, g: 110, b: 30, v: 16, er: 255, eg: 140, eb: 30, n: '余烬' });
  mat(SANDST,   { t: T_STATIC, d: 5,    h: 9,  r: 164, g: 132, b: 84,  v: 10, n: '砂岩' });
  mat(SNOWROCK, { t: T_STATIC, d: 5,    h: 10, r: 132, g: 154, b: 168, v: 8, n: '冻岩' });
  mat(VINE,     { t: T_STATIC, d: 2,    h: 3,  f: 75, r: 48,  g: 96,  b: 44,  v: 8, n: '藤' });
  mat(GLASS,    { t: T_STATIC, d: 3,    h: 5,  e: 20, r: 168, g: 196, b: 204, v: 6, n: '玻璃' });
  mat(FGAS,     { t: T_GAS,    d: 0.12, h: 0,  f: 100, e: 40, r: 180, g: 90, b: 40, v: 10, er: 255, eg: 140, eb: 40, n: '燃汽' });
  mat(RUST,     { t: T_STATIC, d: 6,    h: 11, r: 140, g: 78,  b: 48,  v: 8, n: '锈铁' });
  mat(CRYSTAL,  { t: T_STATIC, d: 5,    h: 11, e: 110, r: 90,  g: 210, b: 230, v: 10, er: 80, eg: 230, eb: 255, n: '晶簇' });
  mat(MUD,      { t: T_POWDER, d: 1.60, h: 4,  r: 86,  g: 64,  b: 42,  v: 10, n: '泥' });
  mat(WOODP,    { t: T_POWDER, d: 1.10, h: 3,  f: 85, r: 130, g: 88,  b: 52,  v: 8, n: '木屑' });
  mat(DENSE,    { t: T_STATIC, d: 9,    h: 15, r: 36,  g: 38,  b: 44,  v: 4, n: '极密岩' });
  mat(GRASS,    { t: T_STATIC, d: 2,    h: 2,  f: 70, r: 72,  g: 128, b: 48,  v: 10, n: '草' });
  mat(BONE,     { t: T_POWDER, d: 1.50, h: 4,  r: 214, g: 206, b: 180, v: 8, n: '骨粉' });

  const BIOMES = [
    { name: '矿坑', en: 'MINES',      bg: [11, 13, 20], amb: 16, tint: [1, 0.95, 0.85] },
    { name: '煤坑', en: 'COAL PITS',  bg: [9, 9, 14],   amb: 11, tint: [0.75, 0.72, 0.78] },
    { name: '菌窟', en: 'FUNGAL',     bg: [16, 8, 18],  amb: 13, tint: [1.05, 0.8, 1.15] },
    { name: '冻岩', en: 'FROST',      bg: [10, 16, 28], amb: 18, tint: [0.85, 1.05, 1.2] },
    { name: '熔湖', en: 'EMBERLAKE',  bg: [18, 8, 8],   amb: 9,  tint: [1.15, 0.8, 0.7] }
  ];

  const SPELLS = {
    spark:   { id: 'spark',   name: '星火',   kind: 'proj',  mana: 5,  delay: 3,  rec: 0,  dmg: 9,  spd: 4.4, spr: 3,  col: [255, 230, 110], light: 1.0, glyph: '星' },
    bolt:    { id: 'bolt',    name: '秘矢',   kind: 'proj',  mana: 12, delay: 9,  rec: 0,  dmg: 20, spd: 5.2, spr: 1,  col: [120, 210, 255], light: 0.8, glyph: '矢' },
    fireball:{ id: 'fireball',name: '炎珠',   kind: 'proj',  mana: 22, delay: 16, rec: 6,  dmg: 26, spd: 2.7, spr: 5,  col: [255, 130, 40],  light: 1.4, expl: 11, fire: 1, glyph: '炎' },
    disc:    { id: 'disc',    name: '刃盘',   kind: 'proj',  mana: 16, delay: 11, rec: 0,  dmg: 18, spd: 3.6, spr: 6,  col: [210, 220, 230], bounce: 1, pierce: 3, glyph: '刃' },
    drill:   { id: 'drill',   name: '光钻',   kind: 'proj',  mana: 8,  delay: 0,  rec: -10,dmg: 7,  spd: 6.2, spr: 0,  col: [230, 245, 255], light: 1.1, drill: 7, glyph: '钻' },
    bubble:  { id: 'bubble',  name: '泡弹',   kind: 'proj',  mana: 6,  delay: 5,  rec: 0,  dmg: 8,  spd: 2.3, spr: 10, col: [170, 230, 255], bounce: 1, glyph: '泡' },
    ice:     { id: 'ice',     name: '霜刺',   kind: 'proj',  mana: 14, delay: 10, rec: 0,  dmg: 15, spd: 4.1, spr: 2,  col: [180, 230, 255], freeze: 1, glyph: '霜' },
    acidb:   { id: 'acidb',   name: '酸滴',   kind: 'proj',  mana: 12, delay: 9,  rec: 0,  dmg: 11, spd: 3.1, spr: 4,  col: [160, 255, 70],  acid: 1, glyph: '酸' },
    bomb:    { id: 'bomb',    name: '爆弹',   kind: 'proj',  mana: 35, delay: 18, rec: 36, dmg: 48, spd: 1.9, spr: 2,  col: [255, 214, 70],  expl: 17, glyph: '爆' },
    spark_t: { id: 'spark_t', name: '星火·触', kind: 'proj', mana: 10, delay: 5,  rec: 0,  dmg: 6,  spd: 4.0, spr: 2,  col: [255, 200, 80],  light: 1.0, trigger: 'hit', draws: 1, glyph: '触' },
    bolt_t:  { id: 'bolt_t',  name: '延时矢', kind: 'proj',  mana: 16, delay: 9,  rec: 0,  dmg: 10, spd: 3.5, spr: 1,  col: [190, 150, 255], light: 0.9, trigger: 'timer', timer: 26, draws: 1, glyph: '延' },
    triple:  { id: 'triple',  name: '三重',   kind: 'multi', mana: 9,  delay: 5,  rec: 3,  count: 3, sprAdd: 14, glyph: '三' },
    dual:    { id: 'dual',    name: '双重',   kind: 'multi', mana: 4,  delay: 2,  rec: 1,  count: 2, sprAdd: 8, glyph: '双' },
    homing:  { id: 'homing',  name: '追踪',   kind: 'mod',   mana: 16, delay: 0,  rec: 0,  homing: 0.14, glyph: '追' },
    flame:   { id: 'flame',   name: '火轨',   kind: 'mod',   mana: 5,  delay: 0,  rec: 0,  fire: 1, glyph: '轨' },
    bounce:  { id: 'bounce',  name: '弹射',   kind: 'mod',   mana: 3,  delay: 0,  rec: 0,  bounce: 1, glyph: '弹' },
    dmgplus: { id: 'dmgplus', name: '强伤',   kind: 'mod',   mana: 12, delay: 4,  rec: 0,  dmgMul: 1.7, glyph: '伤' },
    light:   { id: 'light',   name: '光辉',   kind: 'mod',   mana: 3,  delay: 0,  rec: 0,  lightAdd: 1.6, glyph: '光' },
    speed:   { id: 'speed',   name: '加速',   kind: 'mod',   mana: 3,  delay: -3, rec: 0,  spdMul: 1.55, glyph: '速' },
    explmod: { id: 'explmod', name: '爆化',   kind: 'mod',   mana: 10, delay: 5,  rec: 3,  expl: 8, glyph: '炸' }
  };
  const PROJ_IDS = ['spark', 'bolt', 'fireball', 'disc', 'drill', 'bubble', 'ice', 'acidb', 'bomb'];
  const MOD_IDS = ['homing', 'flame', 'bounce', 'dmgplus', 'light', 'speed', 'explmod'];
  const TRIG_IDS = ['spark_t', 'bolt_t'];
  const MULTI_IDS = ['triple', 'dual'];

  const PERKS = [
    { id: 'steel',  name: '钢骨',   desc: '受到的伤害降低 50%。', apply: p => { p.perk.resist = true; } },
    { id: 'glass',  name: '玻璃炮', desc: '法术伤害翻倍，但最大生命减半。', apply: p => { p.perk.power = true; p.maxHp = Math.floor(p.maxHp * 0.5); p.hp = Math.min(p.hp, p.maxHp); } },
    { id: 'crit',   name: '暴击眼', desc: '25% 几率造成双倍法术伤害。', apply: p => { p.perk.crit = true; } },
    { id: 'breath', name: '长息',   desc: '悬浮回复速度翻倍。', apply: p => { p.perk.flight = true; } },
    { id: 'tinker', name: '随处工匠', desc: '在任何地方都能编辑法杖。', apply: p => { p.perk.tinker = true; } },
    { id: 'gold',   name: '噬金',   desc: '拾取金币 +50%，敌人多掉金。', apply: p => { p.perk.gold = true; } },
    { id: 'fireimm',name: '烬肤',   desc: '火焰与熔岩无法点燃你。', apply: p => { p.perk.fireImm = true; } },
    { id: 'toximm', name: '净血',   desc: '免疫毒泥、毒气与强酸持续伤害。', apply: p => { p.perk.toxImm = true; } },
    { id: 'vamp',   name: '血偿',   desc: '击杀回复 8 点生命。', apply: p => { p.perk.vamp = true; } },
    { id: 'lamp',   name: '井灯',   desc: '提灯光照范围显著增大。', apply: p => { p.perk.lamp = true; } }
  ];

  const ENEMY_DEF = {
    tusk:      { name: '岩齿', hp: 28, w: 7, h: 9,  dmg: 8,  kind: 'melee' },
    ashgun:    { name: '烬炮', hp: 36, w: 7, h: 9,  dmg: 10, kind: 'ranged' },
    nighthook: { name: '夜翼', hp: 18, w: 8, h: 6,  dmg: 6,  kind: 'fly' },
    burstling: { name: '爆胞', hp: 22, w: 6, h: 6,  dmg: 28, kind: 'boom' },
    borewyrm:  { name: '钻蠕', hp: 54, w: 9, h: 7,  dmg: 12, kind: 'burrow' },
    wellseye:  { name: '井瞳', hp: 720,w: 16,h: 16, dmg: 16, kind: 'boss' }
  };

  let canvas, ctx, img, pix, light, lR, lG, lB;
  let cells, life, stampA, stamp;
  let seed = 1, rng = Math.random, frame = 0, acc = 0, lastT = 0, fps = 60, fpsC = 0, fpsT = 0;
  let gameState = 'title', editMode = false, paused = false;
  let player, enemies, projectiles, particles, pickups, wands, worldLights, holy, flasks;
  let curWand = 0, inv = [], perkChoices = [], holySeen, run;
  let camY = 0, shakeMag = 0, flash = 0, kickCD = 0, toastT = 0, hudDirty = true;
  let keys = Object.create(null);
  let pointer = { x: VW / 2, y: VH / 2, down: false, active: false };
  let selectedSlot = null, heldSpell = null;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function $(id) {
    if (typeof document === 'undefined') return fakeEl(id);
    return document.getElementById(id);
  }
  const fakeStore = Object.create(null);
  function fakeEl(id) {
    if (!fakeStore[id]) {
      fakeStore[id] = {
        id, style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
        innerHTML: '', textContent: '', className: '',
        addEventListener() {}, getBoundingClientRect() { return { left: 0, top: 0, width: VW, height: VH }; }
      };
    }
    return fakeStore[id];
  }

  function makeRng(s) {
    let t = s >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let x = t;
      x = Math.imul(x ^ x >>> 15, 1 | x);
      x ^= x + Math.imul(x ^ x >>> 7, 61 | x);
      return ((x ^ x >>> 14) >>> 0) / 4294967296;
    };
  }
  function rint(a, b) { return (rng() * (b - a + 1) | 0) + a; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function phash(x, y) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + (seed | 0);
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return (n ^ n >>> 16) >>> 0;
  }
  function h2(x, y) { return phash(x, y) / 4294967296; }
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y) { return n2(x, y) * 0.55 + n2(x * 2.1, y * 2.1) * 0.3 + n2(x * 4.3, y * 4.3) * 0.15; }

  function ix(x, y) { return y * W + x; }
  function inside(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function g(x, y) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return DENSE;
    return cells[y * W + x];
  }
  function s(x, y, m, lf) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    cells[i] = m;
    life[i] = lf == null ? 0 : lf;
  }
  function swapc(i, j) {
    const t = cells[i]; cells[i] = cells[j]; cells[j] = t;
    const u = life[i]; life[i] = life[j]; life[j] = u;
    stampA[j] = stamp;
  }
  function isSolid(m) { const t = TYPE[m]; return t === T_STATIC || t === T_POWDER; }
  function isLiq(m) { return TYPE[m] === T_LIQUID; }
  function isGas(m) { return TYPE[m] === T_GAS; }

  function biomeAt(y) {
    if (y < SURF) return -1;
    const t = y - SURF;
    const span = BH + HH;
    const i = Math.min(4, t / span | 0);
    const o = t % span;
    if (i < 4 && o >= BH) return 10 + i;
    return Math.min(4, i);
  }
  function biomeObj(y) {
    const b = biomeAt(y);
    if (b < 0) return { name: '井口', en: 'MOUTH', bg: [8, 10, 22], amb: 48, tint: [1, 1, 1] };
    if (b >= 10) return { name: '圣所', en: 'SANCTUM', bg: [16, 16, 22], amb: 52, tint: [1, 1, 1] };
    return BIOMES[b];
  }
  function inHoly(y) { return biomeAt(y) >= 10; }

  function fillDisk(cx, cy, r, m, lf) {
    const r2 = r * r;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++)
      if (x * x + y * y <= r2) s(cx + x, cy + y, m, lf);
  }
  function fillRect(x0, y0, x1, y1, m) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s(x, y, m);
  }
  function carve(x0, y0, x1, y1) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const m = g(x, y);
      if (m !== DENSE && m !== BRICK) s(x, y, AIR);
    }
  }

  function solidMatFor(b, x, y) {
    const n = n2(x * 0.11, y * 0.09);
    if (b === 0) {
      if (n > 0.72) return COAL;
      if (n2(x * 0.2, y * 0.2) > 0.84) return GOLD;
      if (n < 0.38) return DIRT;
      if (n2(x * 0.07, y * 0.13) > 0.78) return MOSS;
      return ROCK;
    }
    if (b === 1) {
      if (n > 0.55) return COAL;
      if (n2(x * 0.16, y * 0.16) > 0.8) return OIL;
      if (n < 0.28) return DIRT;
      return ROCK;
    }
    if (b === 2) {
      if (n > 0.7) return FUNGUS;
      if (n2(x * 0.18, y * 0.1) > 0.82) return CRYSTAL;
      if (n < 0.35) return DIRT;
      if (n2(x * 0.09, y * 0.2) > 0.76) return SLIME;
      return ROCK;
    }
    if (b === 3) {
      if (n > 0.6) return SNOWROCK;
      if (n < 0.32) return ICE;
      if (n2(x * 0.14, y * 0.14) > 0.7) return SNOW;
      return ROCK;
    }
    if (n > 0.7) return LAVA;
    if (n < 0.3) return STONE;
    if (n2(x * 0.1, y * 0.1) > 0.8) return METAL;
    return ROCK;
  }

  function generateWorld(sd) {
    seed = sd >>> 0;
    rng = makeRng(seed);
    cells = new Uint8Array(W * H);
    life = new Uint8Array(W * H);
    stampA = new Uint8Array(W * H);
    cells.fill(AIR);
    worldLights = [];
    holy = [];
    enemies = [];
    projectiles = [];
    particles = [];
    pickups = [];
    flasks = [];
    holySeen = new Set();

    for (let y = 0; y < H; y++) {
      const b = biomeAt(y);
      for (let x = 0; x < W; x++) {
        if (x < 4 || x > W - 5 || y > H - 6) { s(x, y, DENSE); continue; }
        if (y < 18) continue;
        if (b >= 10) { s(x, y, BRICK); continue; }
        if (b < 0) {
          const ground = SURF - 8 + Math.sin(x * 0.04) * 4 + n2(x * 0.08, 2) * 6;
          if (y > ground) s(x, y, y > ground + 5 ? ROCK : (rng() < 0.3 ? GRASS : DIRT));
          continue;
        }
        const nx = x * 0.028, ny = y * 0.02;
        const cave = fbm(nx, ny) + Math.sin(x * 0.09 + y * 0.017) * 0.12 + Math.sin((x + y) * 0.011) * 0.08;
        const edge = (x < 14 ? (14 - x) / 14 : x > W - 15 ? (x - (W - 15)) / 14 : 0);
        let solid = cave < 0.46 + edge * 0.35;
        const shaft = Math.abs(x - (W * 0.5 + Math.sin(y * 0.03) * 28)) < 10 + n2(y * 0.02, 4) * 8;
        if (shaft && y % (BH + HH) < BH - 8) solid = false;
        if (y % 47 < 3 && Math.abs(x - W / 2) < 40) solid = false;
        if (solid) s(x, y, solidMatFor(b, x, y));
        else if (rng() < 0.012) {
          if (b === 0) s(x, y, rng() < 0.5 ? WATER : SAND);
          else if (b === 1) s(x, y, rng() < 0.55 ? OIL : GUNP);
          else if (b === 2) s(x, y, rng() < 0.5 ? TOXIC : SLIME);
          else if (b === 3) s(x, y, rng() < 0.6 ? WATER : SNOW);
          else s(x, y, rng() < 0.7 ? LAVA : ASH);
        }
      }
    }

    for (let i = 0; i < 5; i++) {
      const y0 = SURF + i * (BH + HH);
      const y1 = y0 + BH;
      for (let k = 0; k < 7; k++) {
        const cx = rint(30, W - 30), cy = rint(y0 + 20, y1 - 20), r = rint(8, 18);
        carve(cx - r, cy - r, cx + r, cy + r);
        if (i === 0 && rng() < 0.5) fillDisk(cx, cy + r - 2, r * 0.6, WATER);
        if (i === 1 && rng() < 0.5) fillDisk(cx, cy + r - 2, r * 0.5, OIL);
        if (i === 2 && rng() < 0.45) fillDisk(cx, cy + r - 2, r * 0.5, TOXIC);
        if (i === 3 && rng() < 0.5) fillDisk(cx, cy + r - 2, r * 0.55, WATER);
        if (i === 4 && rng() < 0.6) fillDisk(cx, cy + r - 2, r * 0.7, LAVA);
      }
      if (i === 0) {
        for (let bx = 40; bx < W - 40; bx += 28) {
          const by = y0 + rint(30, BH - 40);
          for (let yy = 0; yy < 22; yy++) s(bx, by + yy, WOOD);
          for (let xx = -6; xx <= 6; xx++) s(bx + xx, by, WOOD);
        }
      }
      if (i === 2) {
        for (let k = 0; k < 18; k++) {
          const mx = rint(20, W - 20), my = rint(y0 + 10, y1 - 10);
          if (g(mx, my + 1) !== AIR && g(mx, my) === AIR) {
            s(mx, my, FUNGUS); s(mx, my - 1, FUNGUS);
            if (rng() < 0.5) s(mx, my - 2, CRYSTAL);
            worldLights.push({ x: mx, y: my - 1, r: 28, i: 140, cr: 200, cg: 70, cb: 210 });
          }
        }
      }
      for (let t = 0; t < 10; t++) {
        const tx = rint(16, W - 16), ty = rint(y0 + 12, y1 - 12);
        if (g(tx, ty) === AIR && isSolid(g(tx, ty + 1))) {
          s(tx, ty, WOOD); s(tx, ty - 1, FIRE, 80);
          worldLights.push({ x: tx, y: ty - 1, r: 42, i: 190, cr: 255, cg: 160, cb: 50 });
        }
      }
    }

    for (let i = 0; i < 4; i++) {
      const y0 = SURF + (i + 1) * BH + i * HH;
      const y1 = y0 + HH;
      holy.push({ y0, y1, claimed: false, i });
      fillRect(0, y0, W - 1, y1, BRICK);
      carve(28, y0 + 6, W - 29, y1 - 3);
      for (let x = 28; x < W - 28; x++) {
        s(x, y0 + 5, BRICK);
        s(x, y1 - 2, BRICK);
        if ((x + i * 3) % 7 === 0) s(x, y0 + 4, GOLD);
      }
      fillRect(36, y1 - 10, 70, y1 - 3, WATER);
      fillRect(W - 71, y1 - 10, W - 37, y1 - 3, WATER);
      fillRect(W / 2 - 16, y1 - 8, W / 2 + 16, y1 - 4, BRICK);
      worldLights.push({ x: 50, y: y0 + 14, r: 50, i: 160, cr: 140, cg: 200, cb: 255 });
      worldLights.push({ x: W - 50, y: y0 + 14, r: 50, i: 160, cr: 140, cg: 200, cb: 255 });
      worldLights.push({ x: W / 2, y: y0 + 16, r: 46, i: 180, cr: 255, cg: 210, cb: 120 });
      pickups.push({ type: 'heart', x: W / 2 - 22, y: y0 + 20, vx: 0, vy: 0, val: 0 });
    }

    carve(W / 2 - 28, 16, W / 2 + 28, SURF + 36);
    for (let x = W / 2 - 30; x < W / 2 + 30; x++) s(x, SURF + 36, DIRT);
    for (let y = 20; y < SURF; y++) s(W / 2, y, AIR);

    const by = SURF + 4 * (BH + HH) + 40;
    carve(40, H - 90, W - 40, H - 12);
    fillRect(50, H - 18, W - 50, H - 8, LAVA);
    spawnEnemy('wellseye', W / 2, H - 70);

    for (let i = 0; i < 5; i++) {
      const y0 = SURF + i * (BH + HH) + 40;
      const y1 = y0 + BH - 50;
      const n = 5 + i * 3;
      for (let k = 0; k < n; k++) {
        const x = rint(24, W - 24), y = rint(y0, y1);
        if (g(x, y) !== AIR) continue;
        const roll = rng();
        let type = 'tusk';
        if (roll < 0.18) type = 'burstling';
        else if (roll < 0.4) type = 'nighthook';
        else if (roll < 0.62) type = 'ashgun';
        else if (roll < 0.74 && i >= 1) type = 'borewyrm';
        spawnEnemy(type, x, y);
      }
      for (let k = 0; k < 5; k++) {
        const x = rint(24, W - 24), y = rint(y0, y1);
        if (g(x, y) !== AIR) continue;
        const t = rng();
        if (t < 0.45) pickups.push({ type: 'gold', x, y, vx: 0, vy: 0, val: rint(4, 16) });
        else if (t < 0.65) pickups.push({ type: 'heart', x, y, vx: 0, vy: 0, val: 25 });
        else if (t < 0.82) pickups.push({ type: 'spell', x, y, vx: 0, vy: 0, spell: randomSpell(i) });
        else if (t < 0.93) pickups.push({ type: 'flask', x, y, vx: 0, vy: 0, mat: [WATER, OIL, ACID, BLOOD, TOXIC][rint(0, 4)] });
        else pickups.push({ type: 'chest', x, y, vx: 0, vy: 0, val: rint(12, 40) });
      }
      if (rng() < 0.85) {
        const x = rint(40, W - 40), y = rint(y0 + 20, y1 - 20);
        if (g(x, y) === AIR) pickups.push({ type: 'wand', x, y, vx: 0, vy: 0, wand: randomWand(i + 1) });
      }
    }

    spawnEnemy('tusk', W / 2 + 18, SURF + 28);

    player = {
      x: W / 2, y: SURF + 30, vx: 0, vy: 0, w: 6, h: 10,
      hp: 100, maxHp: 100, hover: 100, maxHover: 100,
      inv: 0, dir: 1, wet: 0, burning: 0, poison: 0, toxic: 0, oiled: 0, air: 90,
      dead: false, perk: {}, kills: 0, onGround: false, flash: 0
    };
    run = { gold: 0, depth: 0, kills: 0, frames: 0, casts: 0, seed, t0: Date.now(), cause: null };
    camY = 0;
    frame = 0;
    shakeMag = 0;
  }

  function randomSpell(tier) {
    const pool = PROJ_IDS.concat(MOD_IDS);
    if (tier > 0) pool.push.apply(pool, TRIG_IDS.concat(MULTI_IDS));
    return pool[rint(0, pool.length - 1)];
  }
  function randomWand(tier) {
    const cap = 3 + Math.min(4, tier);
    const slots = [];
    const n = rint(1, cap);
    for (let i = 0; i < n; i++) slots.push(randomSpell(tier));
    while (slots.length < cap) slots.push(null);
    return makeWand(['棘杖', '余烬', '霜骨', '井灯', '裂隙', '夜歌'][rint(0, 5)], slots, {
      castDelay: 8 + rint(0, 10), recharge: 18 + rint(0, 24),
      manaMax: 90 + tier * 30 + rint(0, 40), regen: 18 + tier * 6,
      shuffle: rng() < 0.3, spellsPerCast: rng() < 0.15 ? 2 : 1, spread: rint(0, 8)
    });
  }
  function makeWand(name, slots, st) {
    st = st || {};
    const manaMax = st.manaMax || 120;
    return {
      name, slots: slots.slice(),
      castDelay: st.castDelay || 10, recharge: st.recharge || 28,
      mana: manaMax, manaMax, regen: st.regen || 22,
      shuffle: !!st.shuffle, spellsPerCast: st.spellsPerCast || 1,
      spread: st.spread || 0, speed: st.speed || 1,
      delayT: 0, rechT: 0, cursor: 0, wrapped: false
    };
  }
  function setupWands() {
    wands = [
      makeWand('晨星', ['spark', 'spark', 'flame', null], { castDelay: 8, recharge: 22, manaMax: 130, regen: 28 }),
      makeWand('矿镐', ['bomb', null], { castDelay: 6, recharge: 8, manaMax: 90, regen: 12, shuffle: true }),
      makeWand('空槽', [null, null, null], { castDelay: 12, recharge: 30, manaMax: 110, regen: 20 }),
      makeWand('空槽', [null, null, null, null], { castDelay: 14, recharge: 36, manaMax: 150, regen: 24 })
    ];
    inv = ['homing', 'triple'];
    curWand = 0;
  }
  function spawnEnemy(type, x, y) {
    const d = ENEMY_DEF[type];
    if (!d) return;
    const e = {
      type, name: d.name, x, y, vx: 0, vy: 0, w: d.w, h: d.h,
      hp: d.hp, max: d.hp, dmg: d.dmg, kind: d.kind,
      cool: rint(20, 80), dir: rng() < 0.5 ? -1 : 1, phase: rng() * 12,
      dead: false, flash: 0, fuse: 0, segs: []
    };
    if (type === 'borewyrm') {
      for (let i = 0; i < 6; i++) e.segs.push({ x: x - i * 4, y });
    }
    let yy = y;
    if (g(x, y) !== AIR) {
      for (let k = 0; k < 40 && g(x, yy) !== AIR; k++) yy--;
      e.y = yy;
    }
    enemies.push(e);
  }

  function canOcc(x, y, m) {
    if (!inside(x, y)) return false;
    const n = g(x, y);
    if (n === AIR) return true;
    if (n === DENSE || n === BRICK) return false;
    const tm = TYPE[m], tn = TYPE[n];
    if (tm === T_LIQUID || tm === T_POWDER) {
      if (tn === T_GAS || tn === T_FIRE) return true;
      if (tn === T_LIQUID && DEN[m] > DEN[n] + 0.04) return true;
    }
    if (tm === T_GAS && (tn === T_FIRE || (tn === T_GAS && DEN[m] < DEN[n] - 0.02))) return true;
    return false;
  }
  function tryMove(x, y, nx, ny) {
    if (!canOcc(nx, ny, g(x, y))) return false;
    const i = ix(x, y), j = ix(nx, ny);
    if (stampA[j] === stamp) return false;
    swapc(i, j);
    return true;
  }

  function reactAt(x, y, m) {
    for (let k = 0; k < 4; k++) {
      const nx = x + N4[k][0], ny = y + N4[k][1];
      const n = g(nx, ny);
      if (m === LAVA) {
        if (n === WATER || n === TOXIC) { s(x, y, STONE); s(nx, ny, STEAM, 50); return true; }
        if (n === BLOOD) { s(x, y, STONE); s(nx, ny, STEAM, 40); return true; }
        if (n === OIL || n === SLIME) { s(nx, ny, FIRE, 40); return false; }
        if (FLAM[n] > 40 && rng() < 0.08) { s(nx, ny, FIRE, 30); return false; }
        if (n === ICE || n === SNOW) { s(nx, ny, STEAM, 40); return false; }
      }
      if (m === FIRE) {
        if (n === WATER || n === BLOOD) { s(x, y, STEAM, 40); return true; }
        if (n === ICE) { s(nx, ny, WATER); return false; }
        if (n === SNOW) { s(nx, ny, STEAM, 30); return false; }
        if (n === GUNP) { explode(nx, ny, 12, 28, 14000); return true; }
        if (FLAM[n] > 0 && rng() < FLAM[n] / 900) {
          s(nx, ny, FIRE, 20 + (FLAM[n] >> 2));
          if (n === OIL) s(x, y + (rng() < 0.5 ? 0 : -1), FGAS, 30);
        }
        if (n === WOOD || n === WOODP || n === COAL || n === MOSS || n === VINE || n === GRASS || n === FUNGUS) {
          if (rng() < 0.06) s(nx, ny, FIRE, 28);
        }
      }
      if (m === ACID) {
        if (n !== DENSE && n !== BRICK && n !== AIR && n !== ACID && n !== PGAS) {
          const rate = TYPE[n] === T_STATIC ? (HARD[n] >= 12 ? 0.05 : 0.55) : (TYPE[n] === T_POWDER ? 0.45 : 0.12);
          if (rng() < rate) s(nx, ny, rng() < 0.35 ? PGAS : AIR, 18);
        }
        if (n === METAL && rng() < 0.08) s(nx, ny, RUST);
      }
      if (m === WATER) {
        if (n === TOXIC && rng() < 0.08) s(nx, ny, WATER);
        if (n === FIRE) s(nx, ny, STEAM, 35);
        if (n === LAVA) { s(nx, ny, STONE); s(x, y, STEAM, 50); return true; }
      }
      if (m === BLOOD && n === PGAS && rng() < 0.1) { s(nx, ny, SLIME); }
    }
    return false;
  }

  function updateMaterials() {
    if (!cells) return;
    stamp = (stamp + 1) & 255; if (stamp === 0) stamp = 1;
    const y0 = clamp((camY | 0) - 24, 1, H - 2);
    const y1 = clamp((camY | 0) + VH + 28, 2, H - 2);

    for (let y = y1; y >= y0; y--) {
      const ltr = ((y + frame) & 1) === 0;
      for (let k = 0; k < W; k++) {
        const x = ltr ? k : W - 1 - k;
        const i = y * W + x;
        if (stampA[i] === stamp) continue;
        const m = cells[i];
        if (m === AIR || m === DENSE || m === BRICK) continue;
        const t = TYPE[m];
        if (t === T_GAS) continue;
        if (reactAt(x, y, m)) continue;
        if (t === T_FIRE) {
          let lf = life[i] || 18;
          lf--;
          if (g(x, y + 1) === WATER || g(x, y - 1) === WATER || g(x + 1, y) === WATER || g(x - 1, y) === WATER) {
            s(x, y, STEAM, 40); continue;
          }
          if (lf <= 0) { s(x, y, rng() < 0.65 ? SMOKE : ASH, 40); continue; }
          life[i] = lf;
          if (rng() < 0.12 && g(x, y - 1) === AIR) s(x, y - 1, SMOKE, 24);
          if (rng() < 0.04 && g(x, y + 1) === AIR) s(x, y + 1, EMBER, 12);
          if (rng() < 0.3) tryMove(x, y, x + (rng() < 0.5 ? -1 : 1), y - 1);
          continue;
        }
        if (t === T_POWDER) {
          if (tryMove(x, y, x, y + 1)) continue;
          const d = rng() < 0.5 ? -1 : 1;
          if (tryMove(x, y, x + d, y + 1)) continue;
          if (tryMove(x, y, x - d, y + 1)) continue;
          continue;
        }
        if (t === T_LIQUID) {
          if (tryMove(x, y, x, y + 1)) continue;
          const d = rng() < 0.5 ? -1 : 1;
          if (tryMove(x, y, x + d, y + 1)) continue;
          if (tryMove(x, y, x - d, y + 1)) continue;
          if (tryMove(x, y, x + d, y)) continue;
          if (tryMove(x, y, x - d, y)) continue;
          continue;
        }
        if (m === ICE && rng() < 0.002) {
          if (g(x, y + 1) === LAVA || g(x, y - 1) === FIRE) s(x, y, WATER);
        }
      }
    }
    for (let y = y0; y <= y1; y++) {
      const ltr = ((y + frame) & 1) === 0;
      for (let k = 0; k < W; k++) {
        const x = ltr ? k : W - 1 - k;
        const i = y * W + x;
        if (stampA[i] === stamp) continue;
        const m = cells[i];
        if (TYPE[m] !== T_GAS) continue;
        let lf = life[i];
        if (lf > 0) {
          lf--;
          life[i] = lf;
          if (lf === 0) {
            if (m === STEAM && rng() < 0.45) s(x, y, WATER);
            else s(x, y, AIR);
            continue;
          }
        } else if (rng() < 0.01) { s(x, y, m === STEAM ? WATER : AIR); continue; }
        if (m === FGAS && (g(x, y + 1) === FIRE || g(x, y - 1) === FIRE) && rng() < 0.2) {
          s(x, y, FIRE, 16); continue;
        }
        if (tryMove(x, y, x, y - 1)) continue;
        const d = rng() < 0.5 ? -1 : 1;
        if (tryMove(x, y, x + d, y - 1)) continue;
        if (tryMove(x, y, x - d, y - 1)) continue;
        if (tryMove(x, y, x + d, y)) continue;
        if (tryMove(x, y, x - d, y)) continue;
      }
    }
  }

  function explode(x, y, rad, dmg, energy) {
    x = x | 0; y = y | 0;
    shakeMag = Math.max(shakeMag, Math.min(12, rad * 0.45));
    sfx('boom');
    energy = energy || rad * 9000;
    const rays = 20;
    for (let a = 0; a < rays; a++) {
      let e = energy;
      const ang = a * Math.PI * 2 / rays + rng() * 0.1;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (let t = 0; t <= rad; t++) {
        const gx = (x + dx * t) | 0, gy = (y + dy * t) | 0;
        const m = g(gx, gy);
        if (m === DENSE) break;
        e -= HARD[m] * 700 + 180;
        if (m === BRICK) e -= 8000;
        if (e <= 0) break;
        if (m !== AIR && m !== BRICK && m !== DENSE) {
          if (FLAM[m] > 40 && rng() < 0.35) s(gx, gy, FIRE, 18);
          else if (m === WATER) s(gx, gy, STEAM, 30);
          else s(gx, gy, t < rad * 0.35 && rng() < 0.2 ? FIRE : AIR, 12);
        } else if (m === AIR && t < 3 && rng() < 0.3) s(gx, gy, FIRE, 10);
      }
    }
    particles.push({ x, y, vx: 0, vy: 0, life: 14, max: 14, kind: 'boom', rad, r: 255, g: 180, b: 60 });
    for (let i = 0; i < 10; i++) particles.push({
      x, y, vx: (rng() - 0.5) * 4, vy: (rng() - 0.5) * 4 - 1, life: 12 + rint(0, 10), max: 22,
      kind: 'spark', r: 255, g: 160 + rint(0, 60), b: 40
    });
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < rad + 8) hurtEnemy(e, dmg * (1 - d / (rad + 8)), 'explode');
    }
    if (player && !player.dead) {
      const d = Math.hypot(player.x - x, player.y - y);
      if (d < rad + 6) hurt(10 + dmg * 0.15 * (1 - d / (rad + 6)), 'explode', '炸死 · 冲击波撕碎了身体');
    }
  }

  function solidAtRect(x, y, w, h) {
    const l = Math.floor(x - w / 2), r = Math.floor(x + w / 2);
    const t = Math.floor(y - h / 2), b = Math.floor(y + h / 2);
    for (let yy = t; yy <= b; yy++) for (let xx = l; xx <= r; xx++) if (isSolid(g(xx, yy))) return true;
    return false;
  }
  function moveBody(o, dx, dy, w, h) {
    if (dx) {
      const nx = o.x + dx;
      if (!solidAtRect(nx, o.y, w, h)) o.x = nx; else o.vx *= -0.1;
    }
    if (dy) {
      const ny = o.y + dy;
      if (!solidAtRect(o.x, ny, w, h)) o.y = ny; else {
        if (dy > 0) o.onGround = true;
        o.vy = 0;
      }
    }
    o.x = clamp(o.x, 6, W - 6);
    o.y = clamp(o.y, 8, H - 8);
  }

  function aimVec() {
    let ax, ay;
    if (pointer.active) {
      ax = pointer.x - player.x;
      ay = pointer.y + camY - player.y;
    } else {
      ax = player.dir * 16; ay = 0;
    }
    const len = Math.hypot(ax, ay) || 1;
    return { x: ax / len, y: ay / len };
  }

  function cloneShot(s) {
    return {
      dmgMul: s.dmgMul, spdMul: s.spdMul, spread: s.spread, homing: s.homing, bounce: s.bounce,
      fire: s.fire, expl: s.expl, light: s.light, pierce: s.pierce, drill: s.drill,
      freeze: s.freeze, acid: s.acid, delay: s.delay, rech: s.rech
    };
  }
  function baseShot(w) {
    return {
      dmgMul: player.perk.power ? 2 : 1, spdMul: w.speed || 1, spread: w.spread || 0,
      homing: 0, bounce: 0, fire: 0, expl: 0, light: 1, pierce: 0, drill: 0,
      freeze: 0, acid: 0, delay: 0, rech: 0
    };
  }
  function drawOne(w) {
    let guard = 0;
    const n = w.slots.length;
    if (!n) return null;
    while (guard++ < n + 2) {
      if (w.cursor >= n) { w.wrapped = true; w.cursor = 0; }
      const id = w.slots[w.cursor++];
      if (id) return SPELLS[id] || null;
    }
    return null;
  }
  function applyMod(shot, sp) {
    if (sp.homing) shot.homing += sp.homing;
    if (sp.fire) shot.fire = 1;
    if (sp.bounce) shot.bounce = 1;
    if (sp.dmgMul) shot.dmgMul *= sp.dmgMul;
    if (sp.spdMul) shot.spdMul *= sp.spdMul;
    if (sp.lightAdd) shot.light += sp.lightAdd;
    if (sp.expl) shot.expl += sp.expl;
    if (sp.spr) shot.spread += sp.spr;
  }
  function collectTemplates(w, shot, out, budget) {
    if (budget.n-- <= 0) return;
    const sp = drawOne(w);
    if (!sp) return;
    if (w.mana < (sp.mana || 0)) return;
    w.mana -= sp.mana || 0;
    shot.delay += sp.delay || 0;
    shot.rech += sp.rec || 0;
    if (sp.kind === 'mod') {
      applyMod(shot, sp);
      collectTemplates(w, shot, out, budget);
      return;
    }
    if (sp.kind === 'multi') {
      for (let i = 0; i < sp.count; i++) collectTemplates(w, cloneShot(shot), out, budget);
      return;
    }
    if (sp.kind === 'proj') out.push({ sp, shot: cloneShot(shot) });
  }
  function spawnFromTemplate(tpl, x, y, dir, extraSpr) {
    const sp = tpl.sp, shot = tpl.shot;
    const spr = ((shot.spread || 0) + (sp.spr || 0) + (extraSpr || 0)) * Math.PI / 180;
    const a = (rng() - 0.5) * 2 * spr;
    const c = Math.cos(a), q = Math.sin(a);
    const dx = dir.x * c - dir.y * q, dy = dir.x * q + dir.y * c;
    const spd = (sp.spd || 3) * (shot.spdMul || 1);
    const p = {
      x, y, vx: dx * spd, vy: dy * spd,
      life: sp.drill ? 18 : 90 + (sp.expl ? 20 : 0),
      dmg: (sp.dmg || 8) * (shot.dmgMul || 1),
      col: sp.col, owner: 'player',
      homing: shot.homing, bounce: shot.bounce || sp.bounce || 0,
      fire: shot.fire || sp.fire || 0, expl: (shot.expl || 0) + (sp.expl || 0),
      light: (shot.light || 1) + (sp.light || 0),
      pierce: sp.pierce || 0, drill: sp.drill || shot.drill || 0,
      freeze: sp.freeze || 0, acid: sp.acid || 0,
      trigger: sp.trigger || null, timer: sp.timer || 0,
      payload: tpl.payload || null, hit: 0
    };
    if (player.perk.crit && rng() < 0.25) p.dmg *= 2;
    projectiles.push(p);
  }
  function evalDraw(w, shot, dir, ox, oy) {
    const sp = drawOne(w);
    if (!sp) return 0;
    if (w.mana < (sp.mana || 0)) return 0;
    w.mana -= sp.mana || 0;
    shot.delay += sp.delay || 0;
    shot.rech += sp.rec || 0;
    if (sp.kind === 'mod') {
      applyMod(shot, sp);
      return evalDraw(w, shot, dir, ox, oy);
    }
    if (sp.kind === 'multi') {
      let n = 0;
      for (let i = 0; i < sp.count; i++) {
        const ang = (i - (sp.count - 1) / 2) * (sp.sprAdd || 10) * Math.PI / 180;
        const c = Math.cos(ang), q = Math.sin(ang);
        const nd = { x: dir.x * c - dir.y * q, y: dir.x * q + dir.y * c };
        n += evalDraw(w, cloneShot(shot), nd, ox, oy);
      }
      return n;
    }
    if (sp.kind === 'proj') {
      let payload = null;
      if (sp.trigger) {
        payload = [];
        const budget = { n: 12 };
        for (let i = 0; i < (sp.draws || 1); i++) collectTemplates(w, cloneShot(shot), payload, budget);
      }
      spawnFromTemplate({ sp, shot: cloneShot(shot), payload }, ox, oy, dir, 0);
      return 1;
    }
    return 0;
  }
  function tryCast() {
    if (gameState !== 'play' || editMode || perkChoices.length || player.dead) return;
    const w = wands[curWand];
    if (!w || w.delayT > 0 || w.rechT > 0) return;
    const dir = aimVec();
    const shot = baseShot(w);
    w.wrapped = false;
    let produced = 0;
    for (let n = 0; n < (w.spellsPerCast || 1); n++) {
      produced += evalDraw(w, shot, dir, player.x + dir.x * 8, player.y + dir.y * 6);
    }
    if (!produced && w.mana < 3) { toast('魔力不足'); return; }
    run.casts++;
    w.delayT = Math.max(2, (w.castDelay + shot.delay) | 0);
    if (w.wrapped || w.cursor >= w.slots.length) {
      w.rechT = Math.max(0, (w.recharge + shot.rech) | 0);
      w.cursor = 0; w.wrapped = false;
      if (w.shuffle) {
        const filled = w.slots.filter(Boolean);
        for (let i = filled.length - 1; i > 0; i--) {
          const j = rint(0, i); const t = filled[i]; filled[i] = filled[j]; filled[j] = t;
        }
        let fi = 0;
        w.slots = w.slots.map(s => s ? filled[fi++] : null);
      }
    }
    sfx('cast');
  }

  function impactProj(p, x, y) {
    if (p.flask) {
      for (let i = 0; i < 22; i++) {
        const ax = (x + rint(-4, 4)) | 0, ay = (y + rint(-3, 4)) | 0;
        const n = g(ax, ay);
        if (n === AIR || TYPE[n] === T_GAS || TYPE[n] === T_FIRE) s(ax, ay, p.flask);
      }
      sfx('kick');
      return;
    }
    if (p.payload && p.payload.length) {
      const dir = { x: p.vx, y: p.vy };
      const len = Math.hypot(dir.x, dir.y) || 1;
      dir.x /= len; dir.y /= len;
      for (const tpl of p.payload) spawnFromTemplate(tpl, x, y, dir, 6);
    }
    if (p.expl) explode(x, y, p.expl, p.dmg, p.expl * 9000);
    else if (p.drill) {
      const r = 3;
      for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
        if (xx * xx + yy * yy > r * r) continue;
        const m = g(x + xx, y + yy);
        if (m !== BRICK && m !== DENSE && HARD[m] <= 10) s(x + xx, y + yy, AIR);
      }
    } else if (p.fire) {
      s(x, y, FIRE, 24);
      for (let i = 0; i < 4; i++) {
        const ax = x + rint(-2, 2), ay = y + rint(-2, 2);
        if (g(ax, ay) === AIR || FLAM[g(ax, ay)]) s(ax, ay, FIRE, 16);
      }
    } else if (p.acid) {
      for (let i = 0; i < 5; i++) {
        const ax = x + rint(-2, 2), ay = y + rint(-2, 2);
        if (g(ax, ay) !== DENSE && g(ax, ay) !== BRICK) s(ax, ay, ACID);
      }
    } else if (p.freeze) {
      const m = g(x, y);
      if (m === WATER) s(x, y, ICE);
      else if (g(x, y) === AIR) s(x, y, ICE);
    } else {
      const m = g(x, y);
      if (m !== BRICK && m !== DENSE && HARD[m] <= 8) s(x, y, AIR);
    }
    particles.push({ x, y, vx: 0, vy: 0, life: 6, max: 6, kind: 'hit', r: p.col[0], g: p.col[1], b: p.col[2] });
  }

  function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (p.homing) {
        let best = null, bd = 90;
        const list = p.owner === 'player' ? enemies : [player];
        for (const e of list) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const d = Math.hypot(best.x - p.x, best.y - p.y) || 1;
          p.vx += (best.x - p.x) / d * p.homing * 4;
          p.vy += (best.y - p.y) / d * p.homing * 4;
          const n = Math.hypot(p.vx, p.vy) || 1;
          const spd = Math.min(6.5, n);
          p.vx = p.vx / n * spd; p.vy = p.vy / n * spd;
        }
      }
      p.x += p.vx; p.y += p.vy;
      if (!p.drill) p.vy += 0.018;
      p.life--;
      if (p.fire && frame % 2 === 0) {
        const fx = p.x | 0, fy = p.y | 0;
        if (g(fx, fy) === AIR) s(fx, fy, FIRE, 8);
      }
      if (p.trigger === 'timer') {
        p.timer--;
        if (p.timer <= 0) {
          impactProj(p, p.x, p.y);
          projectiles.splice(i, 1);
          continue;
        }
      }
      const hitMat = isSolid(g(p.x, p.y));
      if (hitMat) {
        if (p.bounce && p.life > 8) {
          p.vx *= -0.75; p.vy *= -0.75; p.x += p.vx; p.y += p.vy; p.bounce--;
        } else if (p.drill) {
          impactProj(p, p.x, p.y);
          if (p.life <= 0) { projectiles.splice(i, 1); continue; }
        } else {
          impactProj(p, p.x, p.y);
          projectiles.splice(i, 1);
          continue;
        }
      }
      if (p.owner === 'enemy' && player && !player.dead && Math.hypot(player.x - p.x, player.y - p.y) < 6) {
        hurt(p.dmg, 'kill', '被击杀 · 敌方弹幕击中要害');
        impactProj(p, p.x, p.y);
        projectiles.splice(i, 1);
        continue;
      }
      if (p.owner === 'player') {
        let killed = false;
        for (const e of enemies) {
          if (e.dead) continue;
          const rad = e.type === 'wellseye' ? 12 : 6;
          if (Math.hypot(e.x - p.x, e.y - p.y) < rad) {
            hurtEnemy(e, p.dmg, 'proj');
            e.flash = 5;
            if (p.payload) impactProj(p, e.x, e.y);
            else if (p.expl) impactProj(p, e.x, e.y);
            else {
              particles.push({ x: e.x, y: e.y, vx: (rng() - 0.5) * 2, vy: -1, life: 10, max: 10, kind: 'blood', r: 180, g: 30, b: 40 });
              sfx('hit');
            }
            if (p.pierce) { p.pierce--; p.dmg *= 0.85; }
            else { projectiles.splice(i, 1); killed = true; }
            break;
          }
        }
        if (killed) continue;
      }
      if (p.life <= 0 || p.x < 1 || p.x > W - 2 || p.y < 1 || p.y > H - 2) {
        if (p.payload) impactProj(p, p.x, p.y);
        projectiles.splice(i, 1);
      }
    }
  }

  function hurtEnemy(e, d) {
    if (e.dead) return;
    e.hp -= d;
    e.flash = 4;
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    player.kills++;
    run.kills++;
    sfx('kill');
    const n = e.type === 'wellseye' ? 180 : rint(3, 14) * (player.perk.gold ? 1.5 : 1);
    pickups.push({ type: 'gold', x: e.x, y: e.y, vx: rng() - 0.5, vy: -1.4, val: n | 0 });
    for (let i = 0; i < 8; i++) {
      const bx = e.x + rint(-3, 3), by = e.y + rint(-2, 4);
      if (g(bx, by) === AIR) s(bx, by, BLOOD);
      particles.push({ x: bx, y: by, vx: (rng() - 0.5) * 2, vy: -rng() * 2, life: 16, max: 16, kind: 'blood', r: 170, g: 28, b: 40 });
    }
    if (player.perk.vamp) player.hp = Math.min(player.maxHp, player.hp + 8);
    if (e.type === 'burstling') explode(e.x, e.y, 14, 22, 12000);
    if (e.type === 'wellseye') {
      gameState = 'win';
      const el = $('win'); if (el) el.classList.remove('hide');
      const ws = $('winStats');
      if (ws) ws.textContent = `深入 ${run.depth | 0}m · 击杀 ${run.kills} · 金币 ${run.gold} · 用时 ${((Date.now() - run.t0) / 1000 | 0)}s`;
      sfx('win');
    }
  }

  function hurt(d, code, msg) {
    if (!player || player.dead) return;
    if (player.perk.fireImm && (code === 'burn' || code === 'lava')) return;
    if (player.perk.toxImm && (code === 'poison' || code === 'toxic' || code === 'acid')) return;
    if (player.perk.resist) d *= 0.5;
    const dot = code === 'burn' || code === 'poison' || code === 'toxic' || code === 'drown' || code === 'acid';
    if (!dot && player.inv > 0) return;
    player.hp -= d;
    run.cause = { code, msg };
    if (!dot) {
      player.inv = 26;
      player.flash = 6;
      flash = 5;
      shakeMag = Math.max(shakeMag, 3.5);
      sfx('hurt');
      for (let i = 0; i < 5; i++) particles.push({
        x: player.x, y: player.y, vx: (rng() - 0.5) * 2, vy: -rng() * 2,
        life: 12, max: 12, kind: 'blood', r: 200, g: 40, b: 50
      });
    }
    if (player.hp < 0.05) die(code, msg);
  }
  function die(code, msg) {
    if (player.dead) return;
    player.dead = true;
    player.hp = 0;
    gameState = 'dead';
    run.cause = { code, msg };
    const map = {
      burn: '烧死', drown: '溺死', crush: '压死', poison: '毒死', toxic: '毒死',
      acid: '溶蚀', lava: '烧死', explode: '炸死', kill: '被击杀'
    };
    const title = map[code] || '死亡';
    const dr = $('deadReason'); if (dr) dr.textContent = title;
    const cs = $('cause'); if (cs) cs.textContent = msg || title;
    const rs = $('runStats');
    if (rs) rs.textContent = `深入 ${run.depth | 0}m · 击杀 ${run.kills} · 金币 ${run.gold} · 种子 ${run.seed >>> 0}`;
    const dead = $('dead'); if (dead) dead.classList.remove('hide');
    sfx('dead');
  }

  function updateEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) { enemies.splice(i, 1); continue; }
      if (e.flash) e.flash--;
      if (Math.abs(e.y - player.y) > VH + 80) continue;
      e.cool--;
      const dx = player.x - e.x, dy = player.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const kind = e.kind;
      if (kind === 'melee') {
        e.vx += Math.sign(dx) * 0.05;
        e.vx *= 0.86;
        e.vx = clamp(e.vx, -0.85, 0.85);
        e.vy += 0.16;
        const grounded = solidAtRect(e.x, e.y + e.h / 2 + 1, e.w, 2);
        if (grounded && Math.abs(dx) < 70 && e.cool <= 0 && Math.abs(dy) < 24) { e.vy = -2.2; e.cool = 70; }
        moveBody(e, e.vx, e.vy, e.w, e.h);
        if (dist < 9) hurt(e.dmg, 'kill', `被击杀 · ${e.name} 撕咬了你`);
      } else if (kind === 'ranged') {
        e.vx += Math.sin(frame * 0.03 + e.phase) * 0.02 + Math.sign(dx) * 0.01;
        e.vy += 0.12;
        e.vx *= 0.9;
        moveBody(e, e.vx, e.vy, e.w, e.h);
        if (e.cool <= 0 && dist < 160 && dist > 20) {
          const a = Math.atan2(dy, dx);
          projectiles.push({
            x: e.x, y: e.y, vx: Math.cos(a) * 2.1, vy: Math.sin(a) * 2.1,
            life: 110, dmg: e.dmg, col: [238, 90, 110], owner: 'enemy',
            homing: 0, bounce: 0, fire: 0, expl: 0, light: 0.6, pierce: 0, drill: 0, payload: null
          });
          e.cool = 55 + rint(0, 30);
        }
        if (dist < 8) hurt(e.dmg * 0.6, 'kill', `被击杀 · ${e.name} 的近战`);
      } else if (kind === 'fly') {
        e.x += Math.sin(frame * 0.07 + e.phase) * 0.55 + Math.sign(dx) * 0.12;
        e.y += Math.cos(frame * 0.06 + e.phase) * 0.4 + Math.sign(dy) * 0.08;
        e.x = clamp(e.x, 8, W - 8);
        if (dist < 8) hurt(e.dmg, 'kill', `被击杀 · ${e.name} 扑击了你`);
      } else if (kind === 'boom') {
        e.vx += Math.sign(dx) * 0.07;
        e.vx *= 0.88;
        e.vy += 0.14;
        moveBody(e, e.vx, e.vy, e.w, e.h);
        if (dist < 28) e.fuse++; else e.fuse = Math.max(0, e.fuse - 1);
        if (e.fuse > 40 || dist < 10) {
          explode(e.x, e.y, 16, e.dmg, 15000);
          e.dead = true;
        }
      } else if (kind === 'burrow') {
        const ang = Math.atan2(dy, dx);
        e.vx = Math.cos(ang) * 0.55;
        e.vy = Math.sin(ang) * 0.55;
        e.x += e.vx; e.y += e.vy;
        for (let q = -2; q <= 2; q++) for (let k = -2; k <= 2; k++) {
          const m = g(e.x + q, e.y + k);
          if (m !== DENSE && m !== BRICK && HARD[m] <= 10) s(e.x + q, e.y + k, AIR);
        }
        if (e.segs) {
          let px = e.x, py = e.y;
          for (const sg of e.segs) {
            const ndx = px - sg.x, ndy = py - sg.y, nd = Math.hypot(ndx, ndy) || 1;
            if (nd > 5) { sg.x += ndx / nd * (nd - 5); sg.y += ndy / nd * (nd - 5); }
            px = sg.x; py = sg.y;
          }
        }
        if (dist < 10) hurt(e.dmg, 'kill', `被击杀 · ${e.name} 钻穿了你`);
      } else if (kind === 'boss') {
        e.vx += Math.sin(frame * 0.02) * 0.02 + Math.sign(dx) * 0.012;
        e.vy += Math.cos(frame * 0.018) * 0.015 + Math.sign(dy) * 0.01;
        e.vx = clamp(e.vx, -0.7, 0.7); e.vy = clamp(e.vy, -0.5, 0.5);
        e.x = clamp(e.x + e.vx, 24, W - 24);
        e.y = clamp(e.y + e.vy, H - 120, H - 24);
        if (e.cool <= 0 && dist < 260) {
          const a = Math.atan2(dy, dx);
          const n = e.hp < e.max * 0.4 ? 5 : 3;
          for (let q = -(n - 1) / 2; q <= (n - 1) / 2; q++) {
            const aa = a + q * 0.18;
            projectiles.push({
              x: e.x, y: e.y, vx: Math.cos(aa) * 1.9, vy: Math.sin(aa) * 1.9,
              life: 160, dmg: e.dmg, col: [210, 80, 230], owner: 'enemy',
              homing: e.hp < e.max * 0.5 ? 0.04 : 0, bounce: 0, fire: 0, expl: 0, light: 1.1, payload: null
            });
          }
          if (e.hp < e.max * 0.35 && rng() < 0.3) {
            for (let k = 0; k < 6; k++) s(e.x + rint(-20, 20), e.y + 8, LAVA);
          }
          e.cool = 40;
        }
        if (dist < 16) hurt(e.dmg, 'kill', '被击杀 · 井瞳的注视灼烧了你');
      }
    }
  }

  function updatePickups() {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.vy += 0.07; p.x += p.vx; p.y += p.vy;
      if (isSolid(g(p.x, p.y + 3))) { p.vy = 0; p.vx *= 0.6; p.y -= 0.4; }
      if (Math.hypot(p.x - player.x, p.y - player.y) < 11) {
        if (p.type === 'gold') {
          const v = (p.val | 0) * (player.perk.gold ? 1.5 : 1) | 0;
          run.gold += v; toast(`+${v} 金`); sfx('gold');
        } else if (p.type === 'heart') {
          if (p.val) { player.maxHp += 25; player.hp = Math.min(player.maxHp, player.hp + 25); toast('最大生命 +25'); }
          else { player.hp = player.maxHp; toast('生命已满'); }
          sfx('perk');
        } else if (p.type === 'spell') {
          if (inv.length < 16) inv.push(p.spell);
          else {
            const w = wands[curWand];
            const emp = w.slots.findIndex(s => !s);
            if (emp >= 0) w.slots[emp] = p.spell;
            else inv.push(p.spell);
          }
          toast('获得法术：' + (SPELLS[p.spell] ? SPELLS[p.spell].name : p.spell));
          sfx('perk');
        } else if (p.type === 'flask') {
          flasks.push({ mat: p.mat, n: 40 });
          toast('拾取烧瓶：' + MNAME[p.mat]);
        } else if (p.type === 'chest') {
          run.gold += p.val | 0;
          if (rng() < 0.7) pickups.push({ type: 'spell', x: p.x, y: p.y - 6, vx: rng() - 0.5, vy: -1.5, spell: randomSpell(2) });
          toast('打开宝箱');
          sfx('gold');
        } else if (p.type === 'wand') {
          let slot = wands.findIndex(w => w.slots.every(s => !s));
          if (slot < 0) slot = 3;
          wands[slot] = p.wand;
          toast('获得法杖：' + p.wand.name);
          sfx('perk');
        }
        pickups.splice(i, 1);
      }
    }
  }

  function kick() {
    if (kickCD > 0 || player.dead) return;
    kickCD = 18;
    const a = aimVec();
    const kx = player.x + a.x * 10, ky = player.y + a.y * 7;
    sfx('kick');
    shakeMag = Math.max(shakeMag, 2);
    for (const e of enemies) {
      if (e.dead) continue;
      if (Math.hypot(e.x - kx, e.y - ky) < 13) {
        e.vx += a.x * 2.6; e.vy += a.y * 1.8 - 1.2;
        hurtEnemy(e, 5);
      }
    }
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const m = g(kx + dx, ky + dy);
      if (TYPE[m] === T_POWDER || TYPE[m] === T_LIQUID) {
        const tx = (kx + dx + Math.sign(a.x) * 2) | 0, ty = (ky + dy - 1) | 0;
        if (g(tx, ty) === AIR) { s(tx, ty, m); s(kx + dx, ky + dy, AIR); }
      }
    }
    particles.push({ x: kx, y: ky, vx: 0, vy: 0, life: 6, max: 6, kind: 'hit', r: 255, g: 255, b: 220 });
  }

  function throwFlask() {
    if (!flasks.length) return;
    const f = flasks.pop();
    const a = aimVec();
    projectiles.push({
      x: player.x + a.x * 8, y: player.y + a.y * 6,
      vx: a.x * 3.2, vy: a.y * 3.2 - 0.4, life: 80, dmg: 4,
      col: [CR[f.mat], CG[f.mat], CB[f.mat]], owner: 'player',
      flask: f.mat, bounce: 1, light: 0.3, payload: null
    });
  }

  function updatePlayer() {
    if (!player || player.dead) return;
    const left = keys.a || keys.A || keys.ArrowLeft;
    const right = keys.d || keys.D || keys.ArrowRight;
    const jump = keys.w || keys.W || keys.ArrowUp || keys[' '] || keys.Space;
    const accel = (right ? 1 : 0) - (left ? 1 : 0);
    if (player.oiled) player.vx += accel * 0.08; else player.vx += accel * 0.16;
    if (accel) player.dir = accel;
    player.vx *= player.oiled ? 0.92 : 0.8;
    player.vx = clamp(player.vx, -1.55, 1.55);
    player.onGround = solidAtRect(player.x, player.y + player.h / 2 + 1, player.w, 2);
    if (jump && player.onGround) { player.vy = -3.15; player.onGround = false; sfx('jump'); }
    const hovering = jump && !player.onGround && player.hover > 0;
    if (hovering) {
      player.vy = Math.min(player.vy, 0.18);
      player.hover -= 0.72;
    } else {
      player.vy += 0.165;
      player.hover = Math.min(player.maxHover, player.hover + (player.perk.flight ? 0.5 : 0.24));
    }
    player.vy = clamp(player.vy, -4.2, 3.4);
    const inLiq = isLiq(g(player.x, player.y)) || isLiq(g(player.x, player.y + 3));
    if (inLiq) { player.vx *= 0.92; player.vy *= 0.9; player.vy -= 0.04; }
    moveBody(player, player.vx, 0, player.w, player.h);
    moveBody(player, 0, player.vy, player.w, player.h);

    if (player.inv > 0) player.inv--;
    if (player.flash) player.flash--;
    if (kickCD > 0) kickCD--;

    const head = g(player.x, player.y - 5);
    const body = g(player.x, player.y);
    const feet = g(player.x, player.y + 4);
    const around = [head, body, feet, g(player.x - 2, player.y), g(player.x + 2, player.y)];

    let wet = false, oil = false, onFire = false, tox = false, ac = false, lav = false, cr = false;
    for (const m of around) {
      if (m === WATER || m === BLOOD || m === SLIME) wet = true;
      if (m === OIL) oil = true;
      if (m === FIRE || m === EMBER) onFire = true;
      if (m === TOXIC || m === PGAS) tox = true;
      if (m === ACID) ac = true;
      if (m === LAVA) lav = true;
      if (TYPE[m] === T_STATIC && HARD[m] >= 10) cr = true;
    }
    if (wet) { player.wet = 50; player.burning = 0; player.oiled = Math.max(0, player.oiled - 3); }
    else if (player.wet > 0) player.wet--;
    if (oil) player.oiled = 90;
    else if (player.oiled > 0) player.oiled--;
    if (onFire || lav) {
      if (player.wet <= 0) player.burning = Math.max(player.burning, lav ? 90 : 50);
    }
    if (player.burning > 0) {
      player.burning--;
      hurt(player.maxHp * 0.02 / 60, lav ? 'lava' : 'burn', lav ? '烧死 · 熔岩将你化为灰烬' : '烧死 · 火焰吞噬了你的血肉');
    }
    if (tox) {
      player.toxic = 80;
      hurt(player.maxHp * 0.015 / 60, 'toxic', '毒死 · 毒泥侵蚀了脏器');
    } else if (player.toxic > 0) player.toxic--;
    if (ac) hurt(0.35, 'acid', '溶蚀 · 强酸溶解了身体');
    if (TYPE[head] === T_STATIC && HARD[head] >= 8) hurt(8, 'crush', '压死 · 沉重的固体将你碾碎');

    if (TYPE[head] === T_LIQUID || TYPE[head] === T_STATIC) {
      player.air--;
      if (player.air <= 0) hurt(1.2, 'drown', '溺死 · 肺叶灌满了液体');
    } else player.air = Math.min(90, player.air + 3);

    if (g(player.x, player.y) === GOLD || g(player.x, player.y + 3) === GOLD) {
      for (let dy = -4; dy <= 5; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (g(player.x + dx, player.y + dy) === GOLD) {
          s(player.x + dx, player.y + dy, AIR);
          run.gold += player.perk.gold ? 2 : 1;
        }
      }
    }

    for (const w of wands) {
      w.mana = Math.min(w.manaMax, w.mana + w.regen / 60);
      if (w.delayT > 0) w.delayT--;
      if (w.rechT > 0) w.rechT--;
    }
    if (pointer.down) tryCast();

    const hidx = holy.findIndex(h => player.y >= h.y0 && player.y < h.y1);
    if (hidx >= 0 && !holySeen.has(hidx)) {
      holySeen.add(hidx);
      player.hp = player.maxHp;
      offerPerks();
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life--;
      p.x += p.vx || 0; p.y += p.vy || 0;
      if (p.kind !== 'boom' && p.kind !== 'hit') p.vy += 0.08;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function offerPerks() {
    const pool = PERKS.slice();
    perkChoices = [];
    for (let i = 0; i < 3; i++) {
      const j = rint(0, pool.length - 1);
      perkChoices.push(pool.splice(j, 1)[0]);
    }
    renderPerks();
  }
  function renderPerks() {
    const el = $('perkPanel');
    if (!el) return;
    el.innerHTML = `<div class="panel-title"><b>圣所 · 选择一项永久祝福</b><span>点击卡片或按 1 / 2 / 3</span></div>
      <div class="perk-grid">${perkChoices.map((p, i) => `<button class="perk" data-perk="${i}"><b>${i + 1}. ${p.name}</b><small>${p.desc}</small></button>`).join('')}</div>`;
    el.classList.remove('hide');
  }
  function choosePerk(i) {
    const p = perkChoices[i];
    if (!p) return;
    p.apply(player);
    toast('获得祝福：' + p.name);
    perkChoices = [];
    const el = $('perkPanel'); if (el) el.classList.add('hide');
    sfx('perk');
  }

  function spellName(id) { return SPELLS[id] ? SPELLS[id].name : (id || '空'); }
  function spellKindClass(id) {
    const s = SPELLS[id];
    if (!s) return '';
    if (s.kind === 'mod') return 'mod';
    if (s.trigger) return 'trig';
    if (s.kind === 'multi') return 'multi';
    return 'on';
  }
  function renderWands() {
    const el = $('wandPanel');
    if (!el) return;
    const can = player.perk.tinker || inHoly(player.y);
    el.innerHTML = `<div class="panel-title"><b>法杖编辑台</b><span>${can ? '点击法术拾取/放入槽位 · E 关闭' : '只能在圣所改杖'}</span></div>
      <div class="wand-grid">${wands.map((w, wi) => `<div class="wand-card ${wi === curWand ? 'active' : ''}">
        <h3>${wi + 1}. ${w.name}${w.shuffle ? ' · 乱序' : ''}</h3>
        <div class="stats"><span>延迟 ${w.castDelay}</span><span>充能 ${w.recharge}</span>
        <span>魔力 ${w.manaMax}</span><span>回复 ${w.regen}/s</span></div>
        <div class="spell-row">${w.slots.map((s, si) => `<button class="spell-btn ${s ? '' : 'empty'}" data-w="${wi}" data-s="${si}">${s ? spellName(s) : '·'}</button>`).join('')}</div>
      </div>`).join('')}</div>
      <div class="inv-title">法术袋</div>
      <div class="spell-row" id="invRow">${inv.map((s, i) => `<button class="spell-btn" data-inv="${i}">${spellName(s)}</button>`).join('')}
        <button class="spell-btn empty" data-inv="-1">放下</button></div>`;
    el.classList.remove('hide');
  }
  function handleWandClick(e) {
    if (!(player.perk.tinker || inHoly(player.y))) { toast('只能在圣所改杖'); return; }
    const b = e.target.closest('.spell-btn');
    if (!b) return;
    if (b.dataset.inv !== undefined) {
      const ii = +b.dataset.inv;
      if (heldSpell) {
        if (ii === -1) { inv.push(heldSpell.id); heldSpell = null; }
        else {
          const tmp = inv[ii];
          if (tmp) { inv[ii] = heldSpell.id; heldSpell = { id: tmp }; }
          else { inv[ii] = heldSpell.id; heldSpell = null; }
        }
      } else if (ii >= 0 && inv[ii]) {
        heldSpell = { id: inv[ii] };
        inv.splice(ii, 1);
      }
      renderWands();
      return;
    }
    const wi = +b.dataset.w, si = +b.dataset.s;
    const slot = wands[wi].slots;
    if (heldSpell) {
      const tmp = slot[si];
      slot[si] = heldSpell.id;
      heldSpell = tmp ? { id: tmp } : null;
    } else if (slot[si]) {
      heldSpell = { id: slot[si] };
      slot[si] = null;
    }
    renderWands();
  }

  function updateHud() {
    if (!player) return;
    const w = wands[curWand];
    const hp = clamp(player.hp / player.maxHp, 0, 1);
    const ma = w ? clamp(w.mana / w.manaMax, 0, 1) : 0;
    const ho = clamp(player.hover / player.maxHover, 0, 1);
    const a = $('hpFill'); if (a) a.style.width = (hp * 100) + '%';
    const b = $('manaFill'); if (b) b.style.width = (ma * 100) + '%';
    const c = $('hoverFill'); if (c) c.style.width = (ho * 100) + '%';
    const ht = $('hpText'); if (ht) ht.textContent = `${Math.ceil(Math.max(0, player.hp))}/${player.maxHp}`;
    const mt = $('manaText'); if (mt) mt.textContent = w ? Math.floor(w.mana) : 0;
    const dp = $('depth'); if (dp) dp.textContent = `${run.depth | 0}m`;
    const gd = $('gold'); if (gd) gd.textContent = `${run.gold} ✦`;
    const bm = $('biome'); if (bm) bm.textContent = biomeObj(player.y).en;
    const st = $('statuses');
    if (st) {
      let h = '';
      if (player.burning > 0) h += '<span class="status">燃烧</span>';
      if (player.wet > 0) h += '<span class="status">潮湿</span>';
      if (player.oiled > 0) h += '<span class="status">油污</span>';
      if (player.toxic > 0) h += '<span class="status">毒污</span>';
      if (player.air < 40) h += '<span class="status">窒息</span>';
      st.innerHTML = h;
    }
    let html = '';
    wands.forEach((ww, i) => {
      html += `<div class="wand-chip ${i === curWand ? 'active' : ''}"><b>${i + 1} · ${ww.name}</b>
        <span>${ww.rechT > 0 ? '充能' : ww.delayT > 0 ? '延迟' : '就绪'} · ${Math.floor(ww.mana)}/${ww.manaMax}</span>
        <div class="slotdots">${ww.slots.map(s => `<s class="${s ? spellKindClass(s) : ''}"></s>`).join('')}</div></div>`;
    });
    const wh = $('wandHud'); if (wh) wh.innerHTML = html;
    const sr = $('spellRow');
    if (sr && w) {
      sr.innerHTML = w.slots.map((s, i) => `<div class="sp ${i === w.cursor - 1 ? 'cur' : ''}">${s && SPELLS[s] ? SPELLS[s].glyph : ''}</div>`).join('');
    }
  }
  function toast(text) {
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.style.opacity = 1;
    toastT = 90;
  }

  function stampLight(sx, sy, rad, intens, cr, cg, cb) {
    const r = rad | 0;
    const x0 = clamp((sx - r) | 0, 0, VW - 1), x1 = clamp((sx + r) | 0, 0, VW - 1);
    const y0 = clamp((sy - r) | 0, 0, VH - 1), y1 = clamp((sy + r) | 0, 0, VH - 1);
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      const dy = y - sy, dy2 = dy * dy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - sx, d2 = dx * dx + dy2;
        if (d2 > r2) continue;
        const fall = 1 - d2 / r2;
        const v = intens * fall * fall;
        const i = y * VW + x;
        if (v > light[i]) {
          light[i] = v > 255 ? 255 : v;
          lR[i] = cr; lG[i] = cg; lB[i] = cb;
        }
      }
    }
  }
  function stampPlayerLight() {
    const px = player.x, py = player.y - camY;
    const R = player.perk.lamp ? 96 : 72;
    const rays = 28;
    for (let a = 0; a < rays; a++) {
      const ang = a * Math.PI * 2 / rays;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      let atten = 1;
      for (let t = 0; t < R; t += 2) {
        const x = px + dx * t, y = player.y + dy * t;
        const sx = x, sy = y - camY;
        if (sx < -2 || sy < -2 || sx >= VW + 2 || sy >= VH + 2) break;
        const fall = 1 - t / R;
        const v = 230 * fall * fall * atten;
        const ix0 = sx | 0, iy0 = sy | 0;
        for (let oy = 0; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) {
          const xx = ix0 + ox, yy = iy0 + oy;
          if (xx < 0 || yy < 0 || xx >= VW || yy >= VH) continue;
          const i = yy * VW + xx;
          if (v > light[i]) { light[i] = v > 255 ? 255 : v; lR[i] = 255; lG[i] = 214; lB[i] = 150; }
        }
        const m = g(x, y);
        if (TYPE[m] === T_STATIC && m !== GLASS && m !== ICE && m !== CRYSTAL) {
          atten *= 0.55;
          if (atten < 0.05) break;
        }
      }
    }
  }

  function drawSprite(px, py, rows, pal, flip) {
    const ox = (px | 0), oy = (py | 0);
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row.charCodeAt(flip ? row.length - 1 - x : x);
        if (ch === 46) continue;
        const ci = ch - 48;
        const c = pal[ci];
        if (!c) continue;
        const sx = ox + x - (row.length >> 1);
        const sy = oy + y - (rows.length >> 1);
        if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
        const i = (sy * VW + sx) * 4;
        pix[i] = c[0]; pix[i + 1] = c[1]; pix[i + 2] = c[2]; pix[i + 3] = 255;
      }
    }
  }

  const SPR_PL = ['..111..', '.11111.', '.11111.', '..111..', '.23332.', '2333332', '.33333.', '.3...3.', '.3...3.', '.4...4.'];
  const PAL_PL = { 1: [232, 186, 168], 2: [90, 70, 140], 3: [120, 96, 176], 4: [40, 36, 52] };
  const SPR_TUSK = ['..11..', '.1111.', '211112', '.1111.', '.2..2.'];
  const PAL_TUSK = { 1: [186, 196, 176], 2: [40, 42, 48] };
  const SPR_GUN = ['..11..', '.1111.', '111113', '.1111.', '.2..2.'];
  const PAL_GUN = { 1: [196, 72, 78], 2: [40, 30, 32], 3: [240, 200, 90] };
  const SPR_FLY = ['.1...1.', '11.1.11', '.11111.', '..111..'];
  const PAL_FLY = { 1: [200, 96, 140] };
  const SPR_BOOM = ['.111.', '12221', '12221', '.111.'];
  const PAL_BOOM = { 1: [80, 160, 70], 2: [220, 80, 60] };
  const SPR_BOSS = ['...111...', '.1133311.', '133141331', '.1133311.', '...111...'];
  const PAL_BOSS = { 1: [160, 48, 170], 2: [40, 16, 48], 3: [220, 90, 230], 4: [255, 240, 140] };

  function draw() {
    if (!ctx || !pix) return;
    if (!cells) {
      pix.fill(0);
      for (let i = 3; i < pix.length; i += 4) pix[i] = 255;
      if (ctx.putImageData) ctx.putImageData(img, 0, 0);
      return;
    }
    const cam = camY + ((rng() - 0.5) * shakeMag);
    const y0 = cam | 0;
    const bmid = biomeObj(y0 + VH * 0.5);
    const amb = bmid.amb;
    light.fill(amb);
    lR.fill(40); lG.fill(50); lB.fill(70);

    if (player && !player.dead) stampPlayerLight();
    for (const L of worldLights) {
      const sy = L.y - cam;
      if (sy < -L.r || sy > VH + L.r) continue;
      stampLight(L.x, sy, L.r, L.i, L.cr, L.cg, L.cb);
    }
    const scanY0 = 0, scanY1 = VH;
    for (let sy = scanY0; sy < scanY1; sy += 3) {
      const wy = y0 + sy;
      if (wy < 0 || wy >= H) continue;
      const row = wy * W;
      for (let sx = 0; sx < VW; sx += 3) {
        const m = cells[row + sx];
        if (!EMIT[m]) continue;
        stampLight(sx, sy, m === LAVA ? 22 : m === FIRE ? 16 : m === FUNGUS || m === CRYSTAL ? 14 : 10,
          EMIT[m], ER[m], EG[m], EB[m]);
      }
    }
    for (const p of projectiles) {
      const sy = p.y - cam;
      if (p.light) stampLight(p.x, sy, 12 + p.light * 8, 160 * (p.light || 1), p.col[0], p.col[1], p.col[2]);
    }

    const bg = bmid.bg;
    for (let sy = 0; sy < VH; sy++) {
      const wy = y0 + sy;
      const row = wy * W;
      let di = sy * VW * 4;
      const li0 = sy * VW;
      const sky = wy < SURF - 4;
      for (let sx = 0; sx < VW; sx++) {
        let r, gch, b;
        if (wy < 0 || wy >= H) { r = 4; gch = 5; b = 8; }
        else {
          const m = cells[row + sx];
          if (m === AIR) {
            if (sky) {
              const k = clamp(1 - wy / SURF, 0, 1);
              r = 12 + k * 40; gch = 10 + k * 18; b = 28 + k * 50;
              if (((phash(sx, wy) & 255) > 252)) { r = 220; gch = 220; b = 200; }
            } else { r = bg[0]; gch = bg[1]; b = bg[2]; }
          } else {
            const h = (phash(sx, wy + ((TYPE[m] === T_LIQUID || m === FIRE) ? (frame >> 2) : 0)) & 7) - 3;
            r = CR[m] + h * (CV[m] >> 1);
            gch = CG[m] + h * (CV[m] >> 1);
            b = CB[m] + ((h * CV[m]) >> 2);
            if (m === ROCK || m === DIRT) {
              const t = bmid.tint;
              r *= t[0]; gch *= t[1]; b *= t[2];
            }
            if (m === LAVA) {
              const hot = cells[row - W + sx] === AIR ? 40 : 0;
              r = 255; gch = 80 + hot + (h * 6); b = 20;
            }
            if (m === FIRE) { r = 255; gch = 120 + (h + 3) * 12; b = 30; }
            if (m === BRICK && ((sx + wy) & 7) === 0) { r += 18; gch += 12; }
          }
        }
        const li = li0 + sx;
        const L = light[li];
        const lr = lR[li], lg = lG[li], lb = lB[li];
        const f = L / 255;
        const warm = 0.04 + f;
        r = r * warm * (0.55 + lr / 420);
        gch = gch * warm * (0.5 + lg / 460);
        b = b * warm * (0.62 + lb / 520);
        if (L < 18 && !sky) { r *= 0.45; gch *= 0.5; b = Math.max(b * 0.7, 6); }
        const vx = sx / VW - 0.5, vy = sy / VH - 0.5;
        const vig = 1 - (vx * vx + vy * vy) * 0.7;
        r *= vig; gch *= vig; b *= vig;
        pix[di] = r < 0 ? 0 : r > 255 ? 255 : r;
        pix[di + 1] = gch < 0 ? 0 : gch > 255 ? 255 : gch;
        pix[di + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        pix[di + 3] = 255;
        di += 4;
      }
    }

    function pset(x, y, r, gch, b, a) {
      x = x | 0; y = y | 0;
      if (x < 0 || y < 0 || x >= VW || y >= VH) return;
      const i = (y * VW + x) * 4;
      const ia = (a == null ? 1 : a);
      pix[i] = pix[i] * (1 - ia) + r * ia;
      pix[i + 1] = pix[i + 1] * (1 - ia) + gch * ia;
      pix[i + 2] = pix[i + 2] * (1 - ia) + b * ia;
    }

    for (const p of pickups) {
      const sy = p.y - cam;
      const col = p.type === 'gold' ? [244, 202, 83] : p.type === 'heart' ? [255, 90, 110] : p.type === 'wand' ? [180, 220, 255] : p.type === 'flask' ? [140, 200, 255] : p.type === 'chest' ? [196, 140, 60] : [180, 140, 255];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        if (Math.abs(dx) + Math.abs(dy) < 4) pset(p.x + dx, sy + dy, col[0], col[1], col[2], 0.9);
    }
    for (const p of projectiles) {
      const sy = p.y - cam;
      const c = p.col || [255, 255, 200];
      pset(p.x, sy, c[0], c[1], c[2], 1);
      pset(p.x + 1, sy, c[0], c[1], c[2], 0.8);
      pset(p.x, sy + 1, c[0], c[1], c[2], 0.7);
      pset(p.x - 1, sy, c[0], c[1], c[2], 0.5);
    }
    for (const p of particles) {
      const sy = p.y - cam;
      const a = p.life / (p.max || 10);
      if (p.kind === 'boom') {
        const rad = (p.rad || 8) * (1 - a);
        for (let t = 0; t < 12; t++) {
          const ang = t * Math.PI / 6;
          pset(p.x + Math.cos(ang) * rad, sy + Math.sin(ang) * rad, p.r, p.g, p.b, a);
        }
      } else pset(p.x, sy, p.r, p.g, p.b, a);
    }
    for (const e of enemies) {
      const sy = e.y - cam;
      if (sy < -16 || sy > VH + 16) continue;
      const flashE = e.flash > 0;
      if (e.kind === 'boss') drawSprite(e.x, sy, SPR_BOSS, flashE ? { 1: [255, 255, 255], 3: [255, 255, 255], 4: [255, 255, 200] } : PAL_BOSS, false);
      else if (e.kind === 'ranged') drawSprite(e.x, sy, SPR_GUN, flashE ? { 1: [255, 255, 255], 3: [255, 255, 200] } : PAL_GUN, e.x < player.x);
      else if (e.kind === 'fly') drawSprite(e.x, sy, SPR_FLY, flashE ? { 1: [255, 255, 255] } : PAL_FLY, false);
      else if (e.kind === 'boom') drawSprite(e.x, sy, SPR_BOOM, e.fuse > 20 ? { 1: [255, 80, 40], 2: [255, 220, 80] } : PAL_BOOM, false);
      else if (e.kind === 'burrow') {
        pset(e.x, sy, 160, 120, 80, 1);
        if (e.segs) for (const sg of e.segs) pset(sg.x, sg.y - cam, 130, 100, 70, 1);
      } else drawSprite(e.x, sy, SPR_TUSK, flashE ? { 1: [255, 255, 255] } : PAL_TUSK, e.vx > 0);
      if (e.hp < e.max) {
        const bw = e.kind === 'boss' ? 20 : 10;
        for (let k = 0; k < bw; k++) pset(e.x - bw / 2 + k, sy - e.h / 2 - 4, 20, 20, 24, 1);
        const hw = bw * clamp(e.hp / e.max, 0, 1);
        for (let k = 0; k < hw; k++) pset(e.x - bw / 2 + k, sy - e.h / 2 - 4, 220, 70, 80, 1);
      }
    }
    if (player && !player.dead) {
      const sy = player.y - cam;
      const pal = player.flash || player.inv % 4 < 2 && player.inv > 0
        ? { 1: [255, 255, 255], 2: [255, 255, 255], 3: [255, 255, 255], 4: [255, 255, 255] }
        : PAL_PL;
      if (!(player.inv > 0 && frame % 4 < 2)) drawSprite(player.x, sy, SPR_PL, pal, player.dir < 0);
      const a = aimVec();
      for (let t = 3; t < 9; t++) pset(player.x + a.x * t + player.dir * 2, sy + a.y * t, 200, 180, 90, 0.7);
      if (player.burning > 0) {
        pset(player.x, sy - 6, 255, 160, 40, 0.8);
        pset(player.x + 1, sy - 7, 255, 200, 60, 0.6);
      }
    }
    if (flash > 0) {
      const a = flash / 8;
      for (let i = 0; i < pix.length; i += 4) {
        pix[i] = pix[i] + (255 - pix[i]) * a;
        pix[i + 1] = pix[i + 1] + (255 - pix[i + 1]) * a * 0.8;
        pix[i + 2] = pix[i + 2] + (220 - pix[i + 2]) * a * 0.5;
      }
    }
    if (ctx.putImageData) ctx.putImageData(img, 0, 0);

    const mx = pointer.x | 0, my = pointer.y | 0;
    const mat = g(mx, (my + cam) | 0);
    const tag = $('matTag');
    if (tag) tag.textContent = gameState === 'play' ? MNAME[mat] || '' : '';
  }

  function update() {
    if (gameState !== 'play') return;
    if (perkChoices.length) return;
    frame++;
    run.frames++;
    if (keys['1']) { curWand = 0; keys['1'] = false; }
    if (keys['2']) { curWand = 1; keys['2'] = false; }
    if (keys['3']) { curWand = 2; keys['3'] = false; }
    if (keys['4']) { curWand = 3; keys['4'] = false; }
    updatePlayer();
    updateMaterials();
    updateProjectiles();
    updateEnemies();
    updatePickups();
    updateParticles();
    camY += (player.y - VH * 0.55 - camY) * 0.14;
    camY = clamp(camY, 0, H - VH);
    run.depth = Math.max(run.depth, player.y | 0);
    shakeMag *= 0.84;
    if (flash > 0) flash--;
    if (toastT > 0) { toastT--; if (!toastT) { const t = $('toast'); if (t) t.style.opacity = 0; } }
    if (frame % 8 === 0) updateHud();
  }

  let ac = null;
  function ensureAC() {
    if (ac) return ac;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try { ac = new AC(); } catch (e) { ac = null; }
    return ac;
  }
  function sfx(kind) {
    try {
      const a = ensureAC(); if (!a) return;
      if (a.state === 'suspended') a.resume();
      const t = a.currentTime;
      if (kind === 'boom') {
        const n = a.sampleRate * 0.22 | 0;
        const buf = a.createBuffer(1, n, a.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 1.4);
        const src = a.createBufferSource(); src.buffer = buf;
        const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
        const g = a.createGain(); g.gain.value = 0.18;
        src.connect(f); f.connect(g); g.connect(a.destination); src.start();
        return;
      }
      const o = a.createOscillator(), g = a.createGain();
      const map = { cast: [620, 0.05, 'square'], hit: [180, 0.04, 'sawtooth'], hurt: [120, 0.08, 'sawtooth'],
        gold: [880, 0.06, 'square'], perk: [520, 0.1, 'triangle'], jump: [300, 0.04, 'sine'],
        kick: [90, 0.06, 'square'], dead: [70, 0.4, 'sine'], win: [660, 0.3, 'triangle'], kill: [240, 0.07, 'square'] };
      const m = map[kind] || [400, 0.05, 'square'];
      o.type = m[2]; o.frequency.value = m[0];
      if (kind === 'cast') o.frequency.exponentialRampToValueAtTime(180, t + 0.07);
      if (kind === 'gold') o.frequency.exponentialRampToValueAtTime(1400, t + 0.05);
      g.gain.value = 0.04; g.gain.exponentialRampToValueAtTime(0.001, t + m[1] + 0.02);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + m[1] + 0.03);
    } catch (err) { /* ignore */ }
  }

  function startGame(sd) {
    seed = (sd == null ? (Date.now() ^ (Math.random() * 1e9 | 0)) : sd) >>> 0;
    setupWands();
    generateWorld(seed);
    gameState = 'play';
    editMode = false;
    perkChoices = [];
    pointer.down = false;
    pointer.active = true;
    pointer.x = VW * 0.7;
    pointer.y = VH * 0.45;
    const ids = ['title', 'dead', 'win', 'pause', 'wandPanel', 'perkPanel'];
    for (const id of ids) { const el = $(id); if (el) el.classList.add('hide'); }
    const hud = $('hud'); if (hud) hud.classList.remove('hide');
    updateHud();
    toast('种子 ' + (seed >>> 0));
    sfx('perk');
  }
  function toggleEdit() {
    if (gameState !== 'play' || perkChoices.length) return;
    if (!(player.perk.tinker || inHoly(player.y))) { toast('在圣所按 E 改杖'); return; }
    editMode = !editMode;
    if (editMode) renderWands();
    else { const el = $('wandPanel'); if (el) el.classList.add('hide'); heldSpell = null; }
  }

  function loop(now) {
    if (!lastT) lastT = now;
    let dt = now - lastT; lastT = now;
    if (dt > 50) dt = 50;
    acc += dt;
    fpsC++; fpsT += dt;
    if (fpsT >= 500) { fps = fpsC * 1000 / fpsT; fpsC = 0; fpsT = 0; const el = $('fps'); if (el) el.textContent = fps.toFixed(0) + ' fps'; }
    while (acc >= 16.666) { update(); acc -= 16.666; }
    draw();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);
  }

  function bind() {
    const c = $('game');
    if (!c) return;
    canvas = c;
    ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      img = ctx.createImageData(VW, VH);
      pix = img.data;
    } else {
      img = { width: VW, height: VH, data: new Uint8ClampedArray(VW * VH * 4) };
      pix = img.data;
      ctx = { putImageData() {}, createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; } };
    }
    light = new Uint8Array(VW * VH);
    lR = new Uint8Array(VW * VH);
    lG = new Uint8Array(VW * VH);
    lB = new Uint8Array(VW * VH);

    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', e => {
      keys[e.key] = true;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'e' || e.key === 'E') toggleEdit();
      if (e.key === 'f' || e.key === 'F') kick();
      if (e.key === 'g' || e.key === 'G') throwFlask();
      if (e.key === 'Escape') {
        if (editMode) { editMode = false; const el = $('wandPanel'); if (el) el.classList.add('hide'); return; }
        if (gameState === 'play' && !perkChoices.length) {
          paused = !paused;
          if (paused) { gameState = 'pause'; const p = $('pause'); if (p) p.classList.remove('hide'); }
        } else if (gameState === 'pause') {
          paused = false; gameState = 'play'; const p = $('pause'); if (p) p.classList.add('hide');
        }
      }
      if (perkChoices.length && ['1', '2', '3'].includes(e.key)) choosePerk(+e.key - 1);
    });
    window.addEventListener('keyup', e => { keys[e.key] = false; });
    const mapPtr = e => {
      const r = canvas.getBoundingClientRect();
      pointer.x = clamp((e.clientX - r.left) / r.width * VW, 0, VW - 1);
      pointer.y = clamp((e.clientY - r.top) / r.height * VH, 0, VH - 1);
      pointer.active = true;
    };
    canvas.addEventListener('pointermove', mapPtr);
    canvas.addEventListener('pointerdown', e => {
      mapPtr(e);
      if (e.button === 2) { kick(); return; }
      if (gameState === 'play') pointer.down = true;
      ensureAC();
    });
    canvas.addEventListener('pointerup', () => { pointer.down = false; });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    const holdKey = (btn, key) => {
      if (!btn) return;
      btn.addEventListener('pointerdown', e => { e.preventDefault(); keys[key] = true; });
      btn.addEventListener('pointerup', e => { e.preventDefault(); keys[key] = false; });
      btn.addEventListener('pointerleave', () => { keys[key] = false; });
    };
    holdKey($('jumpBtn'), 'w');
    const fb = $('fireBtn');
    if (fb) {
      fb.addEventListener('pointerdown', e => { e.preventDefault(); pointer.down = true; });
      fb.addEventListener('pointerup', () => { pointer.down = false; });
    }
    const wb = $('wandBtn'); if (wb) wb.addEventListener('click', () => { curWand = (curWand + 1) % wands.length; updateHud(); });
    const kb = $('kickBtn'); if (kb) kb.addEventListener('pointerdown', e => { e.preventDefault(); kick(); });
    const eb = $('editBtn'); if (eb) eb.addEventListener('click', toggleEdit);

    const stick = $('stick'), knob = $('knob');
    if (stick) {
      const setStick = (cx, cy) => {
        const r = stick.getBoundingClientRect();
        const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
        const len = Math.hypot(dx, dy) || 1;
        const m = Math.min(1, len / (r.width * 0.4));
        const nx = dx / len * m, ny = dy / len * m;
        if (knob) { knob.style.left = (33 + nx * 28) + 'px'; knob.style.top = (33 + ny * 28) + 'px'; }
        keys.a = nx < -0.3; keys.d = nx > 0.3;
        if (ny < -0.45) keys.w = true;
      };
      const endStick = () => {
        keys.a = keys.d = false;
        if (knob) { knob.style.left = '33px'; knob.style.top = '33px'; }
      };
      stick.addEventListener('pointerdown', e => { e.preventDefault(); stick.setPointerCapture(e.pointerId); setStick(e.clientX, e.clientY); });
      stick.addEventListener('pointermove', e => { if (e.buttons) setStick(e.clientX, e.clientY); });
      stick.addEventListener('pointerup', endStick);
      stick.addEventListener('pointercancel', endStick);
    }

    const sb = $('startBtn'); if (sb) sb.addEventListener('click', () => startGame());
    const rb = $('restartBtn'); if (rb) rb.addEventListener('click', () => startGame());
    const winb = $('winBtn'); if (winb) winb.addEventListener('click', () => startGame());
    const res = $('resumeBtn'); if (res) res.addEventListener('click', () => { paused = false; gameState = 'play'; const p = $('pause'); if (p) p.classList.add('hide'); });
    const gu = $('giveUpBtn'); if (gu) gu.addEventListener('click', () => { const p = $('pause'); if (p) p.classList.add('hide'); die('kill', '放弃 · 你放下了法杖'); });
    const pp = $('perkPanel'); if (pp) pp.addEventListener('click', e => { const b = e.target.closest('[data-perk]'); if (b) choosePerk(+b.dataset.perk); });
    const wp = $('wandPanel'); if (wp) wp.addEventListener('click', handleWandClick);
  }

  const API = {
    VW, VH, W, H,
    MAT: { AIR, ROCK, DIRT, SAND, WATER, OIL, LAVA, WOOD, ICE, MOSS, BLOOD, STEAM, FIRE, SMOKE, GOLD, SNOW, TOXIC, STONE, METAL, BRICK, ACID, COAL, FUNGUS, GUNP, PGAS, SLIME, ASH, EMBER, SANDST, SNOWROCK, VINE, GLASS, FGAS, RUST, CRYSTAL, MUD, WOODP, DENSE, GRASS, BONE },
    TYPE, DEN, HARD, MNAME, SPELLS, ENEMY_DEF,
    start: startGame,
    tick: function (n) { n = n || 1; for (let i = 0; i < n; i++) update(); },
    draw,
    getState() {
      return {
        gameState, frame,
        player: player ? { x: player.x, y: player.y, hp: player.hp, maxHp: player.maxHp, dead: player.dead, vx: player.vx, vy: player.vy, onGround: player.onGround, hover: player.hover } : null,
        run: run ? { gold: run.gold, depth: run.depth, kills: run.kills, frames: run.frames, casts: run.casts, seed: run.seed, cause: run.cause } : null,
        enemyCount: enemies ? enemies.length : 0,
        projectileCount: projectiles ? projectiles.length : 0,
        camY, editMode
      };
    },
    getPlayer() { return player; },
    getEnemies() { return enemies; },
    getWands() { return wands; },
    getInv() { return inv; },
    getMat: g,
    setMat: s,
    getCells() { return cells; },
    lightAt(x, y) { return light ? light[(y | 0) * VW + (x | 0)] : 0; },
    setKey(k, v) { keys[k] = v; },
    setPointer(x, y, down) { pointer.x = x; pointer.y = y; pointer.down = !!down; pointer.active = true; },
    cast: tryCast,
    kick,
    spawnEnemy,
    hurt, die,
    explode,
    updateMaterials,
    choosePerk,
    offerPerks,
    biomeAt, inHoly,
    simStamp() { return stamp; }
  };
  global.EMBERWELL = API;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
  function boot() {
    bind();
    if (global.__EW_NO_AUTOSTART) return;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(loop);
  }
})(typeof window !== 'undefined' ? window : globalThis);
