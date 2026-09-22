'use strict';
/* ============================================================================
   PIXEL ALCHEMIST —— 像素炼金地牢
   原创 falling-sand 像素物理 + 法杖组装 roguelite。纯前端、零依赖、无构建。
   设计蓝本：refs/ 材料密度分层 / 炼金反应 / 法杖时序 / 生物群系 / 状态效果。
   ========================================================================== */

/* ================= 基础常量与工具 ================= */
const cv = document.getElementById('game');
const ctx = cv.getContext('2d', { alpha: false });
const VW = 480, VH = 270;                 // 视口（世界像素）
const WW = 896, WH = 2680;                // 世界尺寸
const imgData = ctx.createImageData(VW, VH);
const imgBuf = new Uint32Array(imgData.data.buffer);

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function makeRng(s) { let t = s >>> 0; return () => { t = (t + 0x6D2B79F5) | 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; }; }
let seed = 1, rng = makeRng(1);
const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
const rf = (a, b) => a + rng() * (b - a);
const pick = arr => arr[Math.floor(rng() * arr.length)];
function hash2(x, y) { let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/* ================= 材料表 =================
   cat: 类别 | dens: 密度（液体分层/粉末下沉）| dur: 耐久阈值（挖掘/爆破上限）
   hp:  硬度（单像素耐挖能量）| flam: 可燃度 | visc: 液体黏度（扩散步长）
   dmg: 每帧接触伤害（对照 wiki 数值）| stat: 附加状态 | tex: 贴图质感   */
const CAT = { AIR: 0, SOLID: 1, POWDER: 2, LIQUID: 3, GAS: 4, FIRE: 5 };
const M = {
  AIR: 0, ROCK: 1, DIRT: 2, SAND: 3, GRAVEL: 4, COAL: 5, WOOD: 6, MOSS: 7, FUNGUS: 8, GLOWCAP: 9,
  ICE: 10, SNOW: 11, METAL: 12, BRICK: 13, GOLDORE: 14, GOLD: 15,
  WATER: 16, OIL: 17, BLOOD: 18, TOXIC: 19, ACID: 20, LAVA: 21, BOOZE: 22, SLIME: 23,
  STEAM: 24, SMOKE: 25, TOXGAS: 26, FLAMGAS: 27, FROST: 28, FIRE: 29
};
const MAT = [
  { n: '空气', cat: CAT.AIR, dens: 0, opaque: 0, tex: 0, c0: [8, 9, 14], c1: [8, 9, 14], jit: 0 },
  { n: '岩石', cat: CAT.SOLID, dens: 3, dur: 10, hp: 90, opaque: 1, tex: 0, c0: [52, 50, 46], c1: [86, 82, 68], jit: 12 },
  { n: '泥土', cat: CAT.SOLID, dens: 2.4, dur: 6, hp: 34, flam: .05, opaque: 1, tex: 0, c0: [58, 45, 33], c1: [86, 66, 45], jit: 12 },
  { n: '细砂', cat: CAT.POWDER, dens: 2.6, dur: 4, hp: 14, opaque: 1, tex: 2, c0: [138, 116, 74], c1: [176, 150, 95], jit: 14 },
  { n: '碎石', cat: CAT.POWDER, dens: 3.1, dur: 7, hp: 26, opaque: 1, tex: 1, c0: [78, 74, 68], c1: [116, 110, 98], jit: 14, crush: 1 },
  { n: '煤层', cat: CAT.SOLID, dens: 2.2, dur: 8, hp: 22, flam: .55, opaque: 1, tex: 1, c0: [30, 28, 34], c1: [58, 54, 64], jit: 12 },
  { n: '木材', cat: CAT.SOLID, dens: 2, dur: 7, hp: 26, flam: .9, opaque: 1, tex: 3, c0: [92, 62, 36], c1: [124, 88, 50], jit: 10 },
  { n: '苔藓', cat: CAT.SOLID, dens: 1.6, dur: 3, hp: 8, flam: .5, opaque: 1, tex: 0, c0: [54, 78, 46], c1: [82, 110, 62], jit: 14 },
  { n: '菌块', cat: CAT.SOLID, dens: 1.5, dur: 4, hp: 10, flam: .6, opaque: 1, tex: 0, c0: [92, 74, 122], c1: [132, 108, 168], jit: 16 },
  { n: '荧光菇', cat: CAT.SOLID, dens: 1.4, dur: 4, hp: 10, flam: .7, opaque: 1, tex: 9, c0: [42, 150, 108], c1: [96, 235, 160], jit: 18, light: [80, 255, 160, 24] },
  { n: '寒冰', cat: CAT.SOLID, dens: 2.2, dur: 5, hp: 24, opaque: 1, tex: 0, c0: [128, 172, 198], c1: [186, 224, 244], jit: 10 },
  { n: '积雪', cat: CAT.POWDER, dens: 1.2, dur: 2, hp: 5, opaque: 1, tex: 2, c0: [196, 212, 230], c1: [238, 246, 255], jit: 8 },
  { n: '钢架', cat: CAT.SOLID, dens: 4, dur: 13, hp: 200, opaque: 1, tex: 1, c0: [78, 84, 96], c1: [116, 124, 138], jit: 10 },
  { n: '圣山砖石', cat: CAT.SOLID, dens: 4, dur: 15, hp: 400, opaque: 1, tex: 4, c0: [64, 58, 84], c1: [96, 88, 120], jit: 8 },
  { n: '金矿石', cat: CAT.SOLID, dens: 3.4, dur: 9, hp: 60, opaque: 1, tex: 8, c0: [70, 62, 48], c1: [226, 186, 74], jit: 12 },
  { n: '金沙', cat: CAT.POWDER, dens: 3.6, dur: 3, hp: 4, opaque: 1, tex: 2, c0: [214, 172, 62], c1: [248, 220, 112], jit: 16 },
  { n: '水', cat: CAT.LIQUID, dens: 1.0, dur: 0, visc: 3, opaque: .5, tex: 5, c0: [38, 84, 112], c1: [58, 118, 150], jit: 10, stat: 'wet' },
  { n: '油脂', cat: CAT.LIQUID, dens: .8, dur: 0, visc: 2, flam: 1, opaque: .5, tex: 5, c0: [52, 38, 22], c1: [84, 62, 32], jit: 12, stat: 'oily' },
  { n: '血液', cat: CAT.LIQUID, dens: 1.1, dur: 0, visc: 2, opaque: .5, tex: 5, c0: [112, 28, 36], c1: [152, 44, 52], jit: 12, stat: 'bloody' },
  { n: '毒泥', cat: CAT.LIQUID, dens: 1.18, dur: 0, visc: 2, opaque: .5, tex: 5, c0: [84, 112, 30], c1: [124, 158, 52], jit: 12, dmg: .025, stat: 'toxic' },
  { n: '酸液', cat: CAT.LIQUID, dens: 1.3, dur: 12, visc: 3, opaque: .5, tex: 5, c0: [128, 182, 34], c1: [176, 226, 62], jit: 14, dmg: .125, light: [150, 240, 60, 8] },
  { n: '熔岩', cat: CAT.LIQUID, dens: 2.6, dur: 0, visc: 1, opaque: .6, tex: 7, c0: [226, 84, 22], c1: [255, 176, 60], jit: 18, dmg: .075, stat: 'burn', light: [255, 110, 30, 36] },
  { n: '烈酒', cat: CAT.LIQUID, dens: .9, dur: 0, visc: 3, flam: 1, opaque: .5, tex: 5, c0: [128, 96, 38], c1: [168, 132, 58], jit: 12, stat: 'oily' },
  { n: '黏液', cat: CAT.LIQUID, dens: 1.25, dur: 0, visc: 1, opaque: .6, tex: 5, c0: [62, 92, 52], c1: [96, 132, 74], jit: 12, stat: 'slimy' },
  { n: '蒸汽', cat: CAT.GAS, dens: .3, visc: 3, opaque: .18, tex: 6, c0: [128, 148, 162], c1: [176, 196, 210], jit: 12 },
  { n: '烟尘', cat: CAT.GAS, dens: .38, visc: 3, opaque: .22, tex: 6, c0: [48, 46, 54], c1: [86, 82, 94], jit: 12 },
  { n: '毒气', cat: CAT.GAS, dens: .45, visc: 3, opaque: .2, tex: 6, c0: [96, 128, 52], c1: [136, 176, 74], jit: 14, dmg: .025, stat: 'toxic', light: [110, 180, 60, 7] },
  { n: '可燃气', cat: CAT.GAS, dens: .34, visc: 3, flam: 1, opaque: .16, tex: 6, c0: [110, 82, 46], c1: [150, 112, 64], jit: 12 },
  { n: '冰雾', cat: CAT.GAS, dens: .5, visc: 3, opaque: .2, tex: 6, c0: [168, 208, 232], c1: [214, 240, 255], jit: 12, dmg: .015, stat: 'chill', light: [150, 210, 255, 8] },
  { n: '火焰', cat: CAT.FIRE, dens: .1, visc: 2, opaque: 0, tex: 7, c0: [255, 128, 30], c1: [255, 226, 120], jit: 20, dmg: .03, stat: 'burn', light: [255, 150, 60, 22] }
];
const isSolid = m => MAT[m].cat === CAT.SOLID;
const isPowder = m => MAT[m].cat === CAT.POWDER;
const isLiquid = m => MAT[m].cat === CAT.LIQUID;
const isGas = m => MAT[m].cat === CAT.GAS;
const isFire = m => MAT[m].cat === CAT.FIRE;
const isAir = m => m === M.AIR;
const blocksMove = m => MAT[m].cat === CAT.SOLID || MAT[m].cat === CAT.POWDER;
const canDisplace = m => isAir(m) || isGas(m) || isFire(m);   // 可被液体/粉末置换
const FLAM_SOLID = [M.WOOD, M.COAL, M.MOSS, M.FUNGUS, M.GLOWCAP, M.DIRT];
const CORRODIBLE = new Set([M.ROCK, M.DIRT, M.SAND, M.GRAVEL, M.COAL, M.WOOD, M.MOSS, M.FUNGUS, M.GLOWCAP, M.ICE, M.SNOW, M.GOLDORE, M.GOLD]);

/* ================= 生物群系 ================= */
const BIOME_BANDS = [];      // 生成时填充：{y0,y1,name,...}
const BIOMES = [
  {
    key: 'mines', name: '矿坑深巷', amb: [82, 76, 92],
    solids: [[M.ROCK, .44], [M.DIRT, .3], [M.COAL, .1], [M.GRAVEL, .08], [M.SAND, .08]],
    liquid: [[M.WATER, .72], [M.OIL, .18], [M.BLOOD, .1]],
    foes: ['nibbler', 'marksman', 'wisp', 'firebug'], dens: .52, props: 'mines'
  },
  {
    key: 'coal', name: '煤屑矿坑', amb: [74, 68, 84],
    solids: [[M.ROCK, .38], [M.COAL, .32], [M.DIRT, .14], [M.GRAVEL, .1], [M.SAND, .06]],
    liquid: [[M.OIL, .5], [M.WATER, .3], [M.BOOZE, .2]],
    foes: ['nibbler', 'marksman', 'firebug', 'sporeback'], dens: .55, props: 'coal'
  },
  {
    key: 'fungal', name: '荧光真菌窟', amb: [66, 78, 84],
    solids: [[M.ROCK, .3], [M.FUNGUS, .26], [M.DIRT, .18], [M.GLOWCAP, .12], [M.MOSS, .14]],
    liquid: [[M.WATER, .38], [M.TOXIC, .34], [M.SLIME, .28]],
    foes: ['sporeback', 'wisp', 'nibbler', 'digger'], dens: .5, props: 'fungal'
  },
  {
    key: 'snow', name: '霜雪冰窟', amb: [92, 102, 122],
    solids: [[M.ROCK, .34], [M.ICE, .26], [M.SNOW, .24], [M.GRAVEL, .1], [M.DIRT, .06]],
    liquid: [[M.WATER, .6], [M.BLOOD, .2], [M.SLIME, .2]],
    foes: ['marksman', 'wisp', 'digger', 'nibbler'], dens: .5, props: 'snow'
  },
  {
    key: 'volc', name: '熔岩深渊', amb: [92, 68, 66],
    solids: [[M.ROCK, .5], [M.COAL, .14], [M.GRAVEL, .16], [M.DIRT, .1], [M.GOLDORE, .1]],
    liquid: [[M.LAVA, .68], [M.OIL, .17], [M.BLOOD, .15]],
    foes: ['firebug', 'marksman', 'digger', 'sporeback', 'wisp'], dens: .5, props: 'volc'
  }
];

/* ================= 法术表 =================
   type: proj 弹体 | mod 修饰 | multi 多重 | trig 触发/定时 | util 工具            */
const SPELLS = {
  /* ---- 弹体 ---- */
  spark: { name: '星火弹', ic: '✦', type: 'proj', cost: 5, delay: 4, tier: 1, dmg: 8, speed: 4.4, life: 130, size: 2, color: '#ffe780', light: [255, 220, 130, 12], gravity: .012, sfx: 'pew' },
  arrow: { name: '铁羽箭', ic: '➤', type: 'proj', cost: 9, delay: 7, tier: 2, dmg: 17, speed: 6.2, life: 120, size: 2, color: '#9fe4ff', light: [140, 210, 255, 12], gravity: .005, dig: 5, sfx: 'pew' },
  fireorb: { name: '炎爆珠', ic: '≈', type: 'proj', cost: 18, delay: 14, tier: 3, dmg: 20, speed: 3.4, life: 140, size: 3, color: '#ff9345', light: [255, 140, 60, 20], explode: 11, fire: 1, gravity: .03, sfx: 'boom' },
  bomb: { name: '裂地雷', ic: '◍', type: 'proj', cost: 26, delay: 22, uses: 6, tier: 4, dmg: 42, speed: 2.6, life: 150, size: 3, color: '#f4d15f', light: [255, 210, 110, 14], explode: 22, blastDur: 11, gravity: .05, sfx: 'boom' },
  slimeglob: { name: '黏液弹', ic: '●', type: 'proj', cost: 8, delay: 9, tier: 2, dmg: 7, speed: 3.8, life: 120, size: 3, color: '#8fd86a', light: [130, 230, 100, 10], puddle: M.SLIME, gravity: .07, sfx: 'splat' },
  disc: { name: '刃环', ic: '◉', type: 'proj', cost: 13, delay: 8, tier: 3, dmg: 15, speed: 5.4, life: 60, size: 3, color: '#d3a7ff', light: [210, 160, 255, 12], pierce: 2, spin: 1, gravity: 0, sfx: 'slice' },
  iceshard: { name: '冰晶刺', ic: '✻', type: 'proj', cost: 11, delay: 8, tier: 2, dmg: 13, speed: 5, life: 110, size: 2, color: '#bfeaff', light: [180, 235, 255, 12], chill: 1, dig: 4, gravity: .01, sfx: 'pew' },
  thunder: { name: '玄雷', ic: '※', type: 'proj', cost: 24, delay: 24, tier: 4, dmg: 28, speed: 5.6, life: 70, size: 2, color: '#b9e7ff', light: [180, 235, 255, 22], chain: 2, stun: 1, gravity: 0, sfx: 'zap' },
  lance: { name: '穿日钻', ic: '✷', type: 'proj', cost: 12, delay: 2, tier: 3, dmg: 9, speed: 9, life: 16, size: 2, color: '#e9f4ff', light: [235, 245, 255, 16], dig: 11, pierce: 9, gravity: 0, beam: 1, sfx: 'drill' },

  /* ---- 触发 / 定时 ---- */
  spark_trig: { name: '星火弹·触发', ic: '✦+', type: 'trig', cost: 7, delay: 5, tier: 2, dmg: 8, speed: 4.2, life: 130, size: 2, color: '#ffcf80', light: [255, 210, 130, 12], payload: 3, gravity: .012, sfx: 'pew' },
  arrow_trig: { name: '铁羽箭·触发', ic: '➤+', type: 'trig', cost: 12, delay: 8, tier: 3, dmg: 16, speed: 5.8, life: 120, size: 2, color: '#8fd8ff', light: [140, 210, 255, 12], payload: 4, dig: 5, gravity: .005, sfx: 'pew' },
  timer_orb: { name: '定时珠', ic: '◷', type: 'trig', cost: 14, delay: 10, tier: 3, dmg: 12, speed: 3.4, life: 200, size: 3, color: '#d8b2ff', light: [215, 175, 255, 14], payload: 3, timer: 46, gravity: .02, sfx: 'pew' },

  /* ---- 修饰 ---- */
  homing: { name: '追踪', ic: '⊕', type: 'mod', cost: 6, delay: 2, tier: 3, mod: 'homing', desc: '弹体追踪最近的敌人' },
  heavy: { name: '重击', ic: '▼', type: 'mod', cost: 8, delay: 4, tier: 2, mod: 'heavy', desc: '伤害×2.2，弹速×0.6' },
  haste: { name: '急速', ic: '※', type: 'mod', cost: 5, delay: -4, tier: 2, mod: 'haste', desc: '弹速×1.6，施法延迟-4' },
  firetrail: { name: '火焰尾迹', ic: '≈', type: 'mod', cost: 4, delay: 1, tier: 2, mod: 'firetrail', desc: '沿途留下火焰' },
  bounce: { name: '弹射', ic: '◌', type: 'mod', cost: 4, delay: 0, tier: 1, mod: 'bounce', desc: '撞墙弹跳两次' },
  crit: { name: '暴击', ic: '×', type: 'mod', cost: 6, delay: 2, tier: 3, mod: 'crit', desc: '+40% 暴击（4 倍伤害）' },
  blast: { name: '爆化', ic: '✸', type: 'mod', cost: 10, delay: 6, tier: 4, mod: 'blast', desc: '命中引发半径 9 的爆炸' },
  saver: { name: '节能', ic: '▤', type: 'mod', cost: -3, delay: 0, tier: 1, mod: 'saver', desc: '本次施法耗蓝-40%' },
  pierce: { name: '贯穿', ic: '†', type: 'mod', cost: 7, delay: 3, tier: 3, mod: 'pierce', desc: '穿透敌人继续飞行' },

  /* ---- 多重 ---- */
  double: { name: '双重施法', ic: '×2', type: 'multi', cost: 6, delay: 2, tier: 2, n: 2, fan: 6, desc: '一次施放 2 个法术' },
  triple: { name: '三重施法', ic: '×3', type: 'multi', cost: 11, delay: 5, tier: 3, n: 3, fan: 12, desc: '一次施放 3 个法术' },
  fan5: { name: '扇形五重', ic: '×5', type: 'multi', cost: 18, delay: 10, tier: 4, n: 5, fan: 34, desc: '扇形施放 5 个法术' },

  /* ---- 工具 ---- */
  blink: { name: '短距传送', ic: '◉', type: 'util', cost: 16, delay: 12, uses: 8, tier: 3, act: 'blink', desc: '朝准星方向瞬移' },
  mend: { name: '治愈微光', ic: '+', type: 'util', cost: 20, delay: 10, uses: 5, tier: 3, act: 'mend', desc: '回复 25 点生命' },
  waterjet: { name: '引水术', ic: '▽', type: 'util', cost: 3, delay: 3, tier: 1, act: 'water', desc: '喷出一股清水' }
};
const SPELL_IDS = Object.keys(SPELLS);
const SPELL_TIERS = id => SPELLS[id].tier || 1;
const TYPE_LABEL = { proj: '弹体', mod: '修饰', multi: '多重', trig: '触发', util: '工具' };
const TYPE_CLASS = { proj: 't-proj', mod: 't-mod', multi: 't-multi', trig: 't-trig', util: 't-util' };

/* ================= 法杖 ================= */
const WAND_NAMES = ['灰枝', '铜节', '萤石', '霜骨', '烬铁', '幽纹', '雷枢', '锈环', '玉髓', '星屑', '缠丝', '裂晶'];
const WAND_BODY = [['#7a5330', '#a97b48'], ['#5d6470', '#8e97a6'], ['#5c4a6e', '#8672a2'], ['#6e5a3a', '#a08553'], ['#42505c', '#6d808f']];
function rollWand(tier, name) {
  const body = pick(WAND_BODY);
  return {
    name: name || (pick(WAND_NAMES) + '·' + pick(['杖', '杖芯', '短杖', '法杖'])),
    tier,
    castDelay: Math.max(2, 14 - tier * 2 + ri(0, 6)),
    recharge: Math.max(8, 56 - tier * 7 + ri(0, 16)),
    manaMax: 40 + tier * 26 + ri(0, 26),
    manaCharge: 8 + tier * 5 + ri(0, 6),
    capacity: Math.min(9, 2 + tier + ri(0, 2)),
    perCast: rng() < .22 + tier * .04 ? ri(2, 3) : 1,
    spread: Math.max(0, (6 - tier) + ri(-2, 3)),
    shuffle: rng() < .3 && tier < 4,
    always: null,
    deck: [],
    body, mana: 0, castTimer: 0, rechargeTimer: 0, index: 0
  };
}
function spellRollFor(tier) {
  const pool = SPELL_IDS.filter(id => Math.abs((SPELLS[id].tier || 1) - tier) <= 1);
  return pick(pool);
}
function fillWand(w, n) {
  w.deck = [];
  for (let i = 0; i < w.capacity; i++) {
    if (i < n) {
      const id = spellRollFor(w.tier);
      const uses = SPELLS[id].uses ? SPELLS[id].uses : -1;
      w.deck.push({ id, uses });
    } else w.deck.push(null);
  }
  if (w.shuffle) shuffleDeck(w);
  w.mana = w.manaMax;
  return w;
}
function shuffleDeck(w) { const cards = w.deck.filter(Boolean); cards.sort(() => rng() - .5); w.deck = cards.concat(new Array(w.capacity - cards.length).fill(null)); }

/* ================= 敌人 ================= */
const FOES = {
  nibbler: { name: '啃噬鼠', hp: 26, w: 10, h: 7, behavior: 'charge', dmg: 7, speed: .9, gold: [4, 12], color: '#a5794b' },
  marksman: { name: '火枪地精', hp: 40, w: 9, h: 12, behavior: 'shoot', dmg: 8, speed: .5, gold: [8, 20], color: '#7f9a58' },
  wisp: { name: '幽火妖', hp: 22, w: 10, h: 9, behavior: 'fly', dmg: 6, speed: 1.1, gold: [5, 14], color: '#8fd4e8' },
  firebug: { name: '爆燃甲虫', hp: 18, w: 8, h: 8, behavior: 'bomb', dmg: 22, speed: 1.15, gold: [3, 9], color: '#e08a3c' },
  digger: { name: '掘土虫', hp: 55, w: 12, h: 8, behavior: 'burrow', dmg: 10, speed: .8, gold: [10, 26], color: '#b08a6a' },
  sporeback: { name: '孢子蟾', hp: 34, w: 12, h: 10, behavior: 'lob', dmg: 9, speed: .35, gold: [7, 18], color: '#9a7ab8' },
  embereye: { name: '熔渊之瞳', hp: 1500, w: 34, h: 34, behavior: 'boss', dmg: 18, speed: .8, gold: [400, 600], color: '#e8663c' }
};

/* ================= 祝福（圣山三选一） ================= */
const PERKS = [
  { id: 'armor', name: '血肉护甲', desc: '受到的所有伤害降低 40%。' },
  { id: 'glass', name: '玻璃大炮', desc: '法术伤害与爆炸范围×1.8，但最大生命减半。' },
  { id: 'crit', name: '暴击直觉', desc: '法术暴击率 +30%。' },
  { id: 'flight', name: '长空之息', desc: '悬浮燃料上限×2，回复速度×1.6。' },
  { id: 'tinker', name: '魔杖工匠', desc: '在任何地方都能打开魔杖工坊。' },
  { id: 'fireproof', name: '不燃之躯', desc: '免疫燃烧与熔岩的持续灼烧。' },
  { id: 'toxproof', name: '铜肠铁胃', desc: '免疫毒泥与毒气的侵蚀。' },
  { id: 'vigor', name: '丰饶之血', desc: '最大生命 +50，并立刻回满。' },
  { id: 'magnet', name: '聚金术', desc: '大范围吸附金沙，拾取金币 +50%。' },
  { id: 'swift', name: '迅捷咒', desc: '移动速度 +30%，施法延迟 -2。' },
  { id: 'mana', name: '涌泉之心', desc: '所有魔杖魔力回复速度 +80%。' },
  { id: 'bloodmage', name: '血怒', desc: '生命低于 50% 时法术伤害×1.6。' }
];

/* ================= 死亡原因 ================= */
const DEATHS = {
  burn: ['烧死', '你在火焰中被活活烧成焦炭。'],
  drown: ['溺死', '你在液体里挣扎到最后一口气。'],
  crush: ['压死', '塌落的碎石把你压在了下面。'],
  poison: ['毒死', '毒性一点点啃光了你的内脏。'],
  killed: ['被击杀', '地牢里的东西比你更饥饿。'],
  explosion: ['炸死', '你低估了爆炸半径。'],
  lava: ['熔岩吞没', '熔岩把你连同法杖一起吞了下去。'],
  acid: ['腐蚀而死', '酸液连骨头都没有留下。'],
  freeze: ['冻死', '你的体温被冰雾抽干。']
};

/* ================= 世界存储 ================= */
let cells = null, aux = null, moved = null;
const idx = (x, y) => y * WW + x;
const inW = (x, y) => x >= 0 && x < WW && y >= 0 && y < WH;
const get = (x, y) => inW(x, y) ? cells[idx(x | 0, y | 0)] : M.ROCK;
const setM = (x, y, m, a) => { if (inW(x, y)) { const i = idx(x | 0, y | 0); cells[i] = m; aux[i] = a === undefined ? 0 : a; } };
const getAux = (x, y) => inW(x, y) ? aux[idx(x | 0, y | 0)] : 0;
const setAux = (x, y, a) => { if (inW(x, y)) aux[idx(x | 0, y | 0)] = a; };

let props = [], foes = [], projs = [], parts = [], drops = [], lights = [];
let holyRooms = [], bossSpawn = null, startSpot = { x: WW / 2, y: 60 };

function biomeIndexAt(y) {
  for (let i = 0; i < BIOME_BANDS.length; i++) if (y < BIOME_BANDS[i].y1) return i;
  return BIOMES.length - 1;
}
const biomeAt = y => BIOMES[clamp(biomeIndexAt(y), 0, BIOMES.length - 1)];
function inHoly(y) { return holyRooms.some(h => y >= h.y0 && y < h.y1); }

/* ---- 值噪声 ---- */
function noiseLayer(scale, salt) {
  const gw = Math.ceil(WW / scale) + 2, gh = Math.ceil(WH / scale) + 2;
  const g = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = hash2(i + salt * 131, j + salt * 977);
  return (x, y) => {
    const fx = x / scale, fy = y / scale;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  };
}
function blob(cx, cy, r, mat, keep) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y) * (0.75 + hash2(cx + x, cy + y) * .5);
    if (d <= r) { const gx = cx + x, gy = cy + y; if (!inW(gx, gy)) continue; const cur = get(gx, gy); if (!keep || keep(cur)) setM(gx, gy, mat); }
  }
}

/* ================= 世界生成 ================= */
const BAND_H = 400, HOLY_H = 80, SURF_H = 120, ARENA_H = 160;
function generateWorld(seedIn) {
  seed = seedIn >>> 0; rng = makeRng(seed);
  cells = new Uint8Array(WW * WH); aux = new Uint8Array(WW * WH); moved = new Uint8Array(WW * WH);
  props = []; foes = []; projs = []; parts = []; drops = []; lights = []; holyRooms = [];
  BIOME_BANDS.length = 0;

  // —— 分带：地表 → 5 层洞窟（各带圣山）→ 首领熔岩厅 ——
  let y = SURF_H;
  for (let i = 0; i < BIOMES.length; i++) {
    BIOME_BANDS.push({ y0: y, y1: y + BAND_H, b: BIOMES[i], index: i });
    y += BAND_H;
    holyRooms.push({ y0: y, y1: y + HOLY_H, healed: false, index: i });
    y += HOLY_H;
  }
  BIOME_BANDS.push({ y0: y, y1: y + ARENA_H, b: BIOMES[BIOMES.length - 1], index: -1, arena: true });
  y += ARENA_H;

  const n1 = noiseLayer(30, 1), n2 = noiseLayer(11, 2), n3 = noiseLayer(5, 3);

  // —— 洞窟主体 ——
  for (let yy = 0; yy < WH; yy++) {
    const band = bandInfoAt(yy);
    const isArena = band && band.arena;
    for (let xx = 0; xx < WW; xx++) {
      if (xx < 7 || xx > WW - 8 || yy < 8 || yy > WH - 9) { setM(xx, yy, M.BRICK); continue; }
      if (yy < SURF_H) { setM(xx, yy, M.AIR); continue; }
      if (inHoly(yy)) continue;                       // 圣山区域稍后统一雕刻
      const v = 0.58 * n1(xx, yy) + 0.3 * n2(xx, yy) + 0.12 * n3(xx, yy);
      const dens = isArena ? .46 : (band ? band.b.dens : .5);
      let solid = v > dens;
      if (isArena && yy > y - 34) solid = true;        // 首领厅地板
      if (solid) {
        const b = band ? band.b : BIOMES[0];
        setM(xx, yy, weighted(b.solids));
      } else setM(xx, yy, M.AIR);
    }
  }

  // —— 主竖井：从营地洞口正下方出发，保证可以一路向下 ——
  const ph = rng() * 9, ph2 = rng() * 9;
  const shaftX = yy => {
    const t = yy - SURF_H;
    const ramp = clamp((t - 150) / 260, 0, 1);   // 前 150 行垂直正对营地洞口，越深越蜿蜒
    return WW / 2 + (115 * Math.sin(t * .0062 + ph) + 55 * Math.sin(t * .0171 + ph2)) * ramp;
  };
  const carveShaft = () => {
    for (let yy = SURF_H - 8; yy < y - ARENA_H; yy++) {
      if (inHoly(yy)) continue;
      const t = yy - SURF_H;
      const cx = shaftX(yy);
      const w = 11 + 4 * Math.sin(t * .021 + ph) + hash2(3, yy) * 5;
      for (let xx = Math.floor(cx - w); xx <= cx + w; xx++) if (xx > 8 && xx < WW - 9) setM(xx, yy, M.AIR);
    }
  };
  carveShaft();

  // —— 圣山：整层砖石 + 中央房间（入口/出口对齐主竖井） ——
  for (const h of holyRooms) {
    const cx = WW / 2;
    for (let yy = h.y0; yy < h.y1; yy++) for (let xx = 0; xx < WW; xx++) setM(xx, yy, M.BRICK);
    const inY0 = h.y0 + 10, inY1 = h.y0 + 56, inX0 = cx - 130, inX1 = cx + 130;
    for (let yy = inY0; yy <= inY1; yy++) for (let xx = inX0; xx <= inX1; xx++) setM(xx, yy, M.AIR);
    // 入口：竖井从哪里来，洞就开在哪里；出口：竖井往哪里去，口就留在哪里
    const exIn = Math.round(clamp(shaftX(h.y0), inX0 + 18, inX1 - 18));
    for (let yy = h.y0; yy <= inY0; yy++) for (let xx = exIn - 11; xx < exIn + 11; xx++) setM(xx, yy, M.AIR);
    const exOut = Math.round(clamp(shaftX(h.y1), inX0 + 18, inX1 - 18));
    for (let yy = inY1; yy < h.y1; yy++) for (let xx = exOut - 11; xx < exOut + 11; xx++) setM(xx, yy, M.AIR);
    // 装饰：石柱与地板台阶
    for (let yy = inY0; yy <= inY1; yy++) { setM(inX0 - 6, yy, M.BRICK); setM(inX1 + 6, yy, M.BRICK); }
    const floorY = inY1;
    props.push({ type: 'torch', x: inX0 + 14, y: inY0 + 8 });
    props.push({ type: 'torch', x: inX1 - 14, y: inY0 + 8 });
    props.push({ type: 'torch', x: cx, y: inY0 + 6 });
    props.push({ type: 'shrine', x: cx - 84, y: floorY, room: h });
    props.push({ type: 'table', x: cx - 4, y: floorY, room: h });
    props.push({ type: 'altar', x: cx + 82, y: floorY, room: h });
    props.push({ type: 'sign', x: cx + 34, y: floorY, text: '圣山：疗伤 · 祝福 · 魔杖工坊' });
    h.cx = cx; h.floorY = floorY; h.gate = { x: exOut, y: h.y1 - 4 };
  }

  // —— 玩家出生地表营地 ——
  const sx = WW / 2, sy = 66;
  for (let yy = 30; yy < SURF_H - 6; yy++) for (let xx = sx - 60; xx < sx + 60; xx++) if (inW(xx, yy)) setM(xx, yy, M.AIR);
  for (let xx = sx - 70; xx < sx + 70; xx++) { setM(xx, SURF_H - 6, M.DIRT); setM(xx, SURF_H - 5, M.DIRT); }
  for (let xx = sx - 24; xx < sx + 24; xx++) setM(xx, SURF_H - 6, M.AIR);   // 通往竖井的洞口
  for (let xx = sx - 60; xx < sx - 52; xx++) for (let yy = 34; yy < SURF_H - 6; yy++) setM(xx, yy, M.WOOD);
  for (let xx = sx + 52; xx < sx + 60; xx++) for (let yy = 34; yy < SURF_H - 6; yy++) setM(xx, yy, M.WOOD);
  props.push({ type: 'torch', x: sx - 40, y: 52 });
  props.push({ type: 'torch', x: sx + 40, y: 52 });
  props.push({ type: 'sign', x: sx, y: SURF_H - 6, text: '↓ 向下：矿坑深巷。死亡会写明死因，然后一切重来。' });
  startSpot = { x: sx - 44, y: sy };       // 出生点在竖井洞口旁的实地，避免直接坠落

  // —— 矿脉 / 煤脉 / 菌群 / 积雪 / 熔岩流 ——
  for (const band of BIOME_BANDS) {
    const b = band.b, n = band.arena ? 26 : 44;
    for (let k = 0; k < n; k++) {
      const x = ri(16, WW - 16), yy = ri(band.y0 + 12, band.y1 - 12);
      if (inHoly(yy) || get(x, yy) !== (b.key === 'fungal' ? M.AIR : M.ROCK)) {
        if (!(b.key === 'fungal')) continue;
      }
      if (b.key === 'mines') { if (rng() < .5) blob(x, yy, ri(2, 5), M.GOLDORE, c => c === M.ROCK || c === M.DIRT); else blob(x, yy, ri(3, 6), M.GRAVEL, c => isSolid(c) && c !== M.WOOD); }
      else if (b.key === 'coal') blob(x, yy, ri(3, 7), rng() < .2 ? M.GOLDORE : M.COAL, c => c === M.ROCK);
      else if (b.key === 'fungal') { if (get(x, yy) === M.AIR) { blob(x, yy, ri(2, 4), M.FUNGUS, c => c === M.AIR); if (rng() < .45) blob(x, yy, 1, M.GLOWCAP); } }
      else if (b.key === 'snow') { if (get(x, yy) === M.AIR) blob(x, yy, ri(3, 8), M.SNOW, c => c === M.AIR); else blob(x, yy, ri(2, 5), M.ICE, c => c === M.ROCK); }
      else { if (rng() < .6) blob(x, yy, ri(2, 5), M.GOLDORE, c => c === M.ROCK); else blob(x, yy, ri(2, 6), M.GRAVEL, c => isSolid(c)); }
    }
  }

  // —— 液体池（含密度分层演示：水上浮油、水下沉血） ——
  for (const band of BIOME_BANDS) {
    const b = band.b;
    const pools = band.arena ? 6 : 18;
    for (let k = 0; k < pools; k++) {
      const x = ri(30, WW - 30), yy = ri(band.y0 + 40, band.y1 - 20);
      if (inHoly(yy)) continue;
      let ground = -1;
      for (let s = 0; s < 40; s++) if (blocksMove(get(x, yy + s))) { ground = yy + s; break; }
      if (ground < 0) continue;
      const w = ri(7, 17), depth = ri(3, 7);
      for (let dy = -depth; dy < 0; dy++) for (let dx = -w; dx <= w; dx++) {
        const span = w - Math.abs(dy + depth) * (w / depth) * .5;
        if (Math.abs(dx) <= span) setM(x + dx, ground + dy, M.AIR);
      }
      const liq = weighted(b.liquid);
      for (let dy = -2; dy < 0; dy++) for (let dx = -w; dx <= w; dx++) if (get(x + dx, ground + dy) === M.AIR) setM(x + dx, ground + dy, liq);
      // 分层演示：随机在上层加一层油 / 下层加血
      if (liq === M.WATER && rng() < .5) {
        for (let dx = -w; dx <= w; dx++) if (get(x + dx, ground - 3) === M.AIR && rng() < .8) setM(x + dx, ground - 3, M.OIL);
      }
      if ((liq === M.WATER || liq === M.OIL) && rng() < .35) {
        for (let dx = -w; dx <= w; dx++) if (get(x + dx, ground - 1) === M.WATER && rng() < .8) setM(x + dx, ground - 1, M.BLOOD);
      }
      if (b.key === 'coal' && rng() < .5) {
        for (let dy = -8; dy < -4; dy++) for (let dx = -w + 2; dx < w - 2; dx++) if (get(x + dx, ground + dy) === M.AIR) setM(x + dx, ground + dy, M.FLAMGAS);
      }
    }
    // 天花板碎石（压死风险）与砂层（避开主竖井，防止落砂堵死下降通道）
    for (let k = 0; k < 22; k++) {
      const x = ri(20, WW - 20), yy = ri(band.y0 + 16, band.y1 - 16);
      if (inHoly(yy) || !isSolid(get(x, yy))) continue;
      if (Math.abs(x - shaftX(yy)) < 34) continue;
      let ceilY = -1;
      for (let s = 1; s < 26; s++) if (canDisplace(get(x, yy - s))) ceilY = yy - s; else break;
      if (ceilY > 0) blob(x, ceilY + 2, ri(2, 5), rng() < .6 ? M.GRAVEL : M.SAND, c => canDisplace(c));
    }
    // 熔岩瀑布 / 火把 / 木梁
    if (b.key === 'volc') {
      for (let k = 0; k < 7; k++) {
        const x = ri(40, WW - 40), yy = ri(band.y0 + 20, band.y1 - 60);
        for (let s = 0; s < ri(20, 70); s++) for (let dx = -1; dx <= 1; dx++) if (canDisplace(get(x + dx, yy + s))) setM(x + dx, yy + s, M.LAVA);
      }
    }
    if (b.key === 'mines' || b.key === 'coal') {
      for (let k = 0; k < 26; k++) {     // 木梁与木柱
        const x = ri(30, WW - 60), yy = ri(band.y0 + 16, band.y1 - 16);
        if (inHoly(yy)) continue;
        if (rng() < .5) for (let dx = 0; dx < ri(18, 46); dx++) if (canDisplace(get(x + dx, yy))) setM(x + dx, yy, M.WOOD);
        else for (let dy = 0; dy < ri(10, 26); dy++) if (canDisplace(get(x, yy + dy))) setM(x, yy + dy, M.WOOD);
      }
      for (let k = 0; k < 16; k++) {     // 洞穴火把
        const x = ri(30, WW - 30), yy = ri(band.y0 + 16, band.y1 - 16);
        if (inHoly(yy) || !canDisplace(get(x, yy)) || !isSolid(get(x, yy + 1))) continue;
        props.push({ type: 'torch', x, y: yy });
      }
    }
  }

  // —— 宝箱 / 法杖台 / 血瓶 / 敌人 ——
  carveShaft();        // 再挖一遍主路，防止矿脉/砂堆/补给把下降通道堵死
  // 早期遭遇：主路头两屏就放怪与补给，避免开局长时间无事发生
  for (let k = 0; k < 5; k++) {
    const yy = ri(SURF_H + 30, SURF_H + 150);
    const sxp = Math.round(shaftX(yy) + (rng() < .5 ? -1 : 1) * ri(24, 46));
    if (canDisplace(get(sxp, yy)) && blocksMove(get(sxp, yy + 1))) {
      if (k < 3) spawnFoe(pick(BIOMES[0].foes), sxp, yy);
      else props.push({ type: k === 3 ? 'chest' : 'flask', x: sxp, y: yy });
    }
  }
  for (const band of BIOME_BANDS) {
    const b = band.b;
    const tierBase = band.arena ? 5 : (band.index < 0 ? 5 : band.index + 1);
    const items = band.arena ? 3 : 5;
    for (let k = 0; k < items; k++) {
      const spot = findCaveSpot(band);
      if (!spot) continue;
      const r = rng();
      if (r < .34) props.push({ type: 'chest', x: spot.x, y: spot.y });
      else if (r < .62) props.push({ type: 'stand', x: spot.x, y: spot.y, wand: makeDropWand(clamp(tierBase + (rng() < .3 ? 1 : 0), 1, 5)) });
      else props.push({ type: 'flask', x: spot.x, y: spot.y });
    }
    const nFoes = band.arena ? 5 : 7 + (band.index < 0 ? 3 : band.index * 3);
    for (let k = 0; k < nFoes; k++) {
      const spot = findCaveSpot(band);
      if (!spot) continue;
      spawnFoe(pick(b.foes), spot.x, spot.y);
    }
  }
  bossSpawn = { x: WW / 2, y: y - ARENA_H / 2 };
  spawnFoe('embereye', bossSpawn.x, bossSpawn.y);
}

function bandInfoAt(y) {
  if (y < SURF_H) return { b: BIOMES[0], y0: 0, y1: SURF_H, index: -2 };
  for (const band of BIOME_BANDS) if (y >= band.y0 && y < band.y1) return band;
  return null;
}
function weighted(list) { let r = rng(); for (const [m, w] of list) { if (r < w) return m; r -= w; } return list[0][0]; }
function findCaveSpot(band) {
  for (let t = 0; t < 60; t++) {
    const x = ri(24, WW - 24), yy = ri(band.y0 + 24, band.y1 - 16);
    if (inHoly(yy)) continue;
    if (!canDisplace(get(x, yy)) || !canDisplace(get(x, yy - 1))) continue;
    if (!blocksMove(get(x, yy + 1))) continue;
    for (let dy = -3; dy <= 1; dy++) for (let dx = -3; dx <= 3; dx++) {   // 扩出小巢穴净空
      const m = get(x + dx, yy + dy);
      if (m !== M.BRICK && blocksMove(m)) setM(x + dx, yy + dy, M.AIR);
    }
    return { x, y: yy };
  }
  return null;
}
function makeDropWand(tier) {
  const w = rollWand(tier);
  const spellN = clamp(1 + tier, 1, w.capacity);
  return fillWand(w, spellN);
}

/* ================= 像素模拟 ================= */
let simStats = { cells: 0 };
function movePx(x, y, nx, ny, m, a) {
  const j = idx(nx, ny);
  cells[j] = m; aux[j] = a === undefined ? 0 : a; moved[j] = 1;
  cells[idx(x, y)] = M.AIR; aux[idx(x, y)] = 0;
}
function swapPx(x, y, nx, ny) {
  const i = idx(x, y), j = idx(nx, ny);
  const m = cells[i], a = aux[i];
  cells[i] = cells[j]; aux[i] = aux[j];
  cells[j] = m; aux[j] = a; moved[j] = 1; moved[i] = 1;
}
function setFire(x, y, life) { setM(x, y, M.FIRE, life || ri(28, 58)); }

function simulate() {
  const camYI = Math.floor(camY), camXI = Math.floor(camX);
  const y0 = clamp(camYI - 32, 1, WH - 2), y1 = clamp(camYI + VH + 40, 1, WH - 2);
  const x0 = clamp(camXI - 20, 1, WW - 2), x1 = clamp(camXI + VW + 20, 1, WW - 2);
  for (let y = y0; y <= y1; y++) { const row = y * WW; for (let x = x0; x <= x1; x++) moved[row + x] = 0; }
  let n = 0;
  for (let y = y1; y >= y0; y--) {
    const dir = ((frame + y) & 1) ? 1 : -1;
    for (let k = 0; k <= x1 - x0; k++) {
      const x = dir > 0 ? x0 + k : x1 - k;
      const i = idx(x, y);
      if (moved[i]) continue;
      const m = cells[i];
      if (m === M.AIR) continue;
      n++;
      const p = MAT[m];
      switch (p.cat) {
        case CAT.POWDER: stepPowder(x, y, i, m, p); break;
        case CAT.LIQUID: stepLiquid(x, y, i, m, p); break;
        case CAT.GAS: stepGas(x, y, i, m, p); break;
        case CAT.FIRE: stepFire(x, y, i, m, p); break;
        case CAT.SOLID: stepSolid(x, y, i, m, p); break;
      }
    }
  }
  simStats.cells = n;
}

/* ---- 粉末：下落 / 沉入轻液体 / 休止角 ---- */
function stepPowder(x, y, i, m, p) {
  const sp = aux[i] < 18 ? aux[i] + 1 : 18;
  const dn = get(x, y + 1);
  if (canDisplace(dn)) {
    let fall = 1 + (sp > 8 ? 1 : 0) + (sp > 14 ? 1 : 0);
    let ty = y + 1;
    while (fall-- > 1 && canDisplace(get(x, ty + 1))) ty++;
    movePx(x, y, x, ty, m, sp);
    if (m === M.SNOW || m === M.SAND) meltCheck(x, ty, m);
    return;
  }
  if ((isLiquid(dn) || isGas(dn)) && (MAT[dn].dens || 1) < (p.dens || 2)) { aux[i] = 0; swapPx(x, y, x, y + 1); return; }
  aux[i] = 0;
  const d = rng() < .5 ? 1 : -1;
  for (const dd of [d, -d]) {
    const a = get(x + dd, y + 1), b = get(x + dd, y);
    if (canDisplace(a) && canDisplace(b)) { movePx(x, y, x + dd, y + 1, m, 0); return; }
    if ((isLiquid(a) || isGas(a)) && (MAT[a].dens || 1) < (p.dens || 2) && canDisplace(b)) { swapPx(x, y, x + dd, y + 1); return; }
  }
  if (m === M.SNOW || m === M.SAND) meltCheck(x, y, m);
}
function meltCheck(x, y, m) {   // 雪/砂遇火成水
  if (((x * 3 + y * 5 + frame) & 7) !== 0) return;
  for (const [dx, dy] of HOT_N) if (get(x + dx, y + dy) === M.FIRE || get(x + dx, y + dy) === M.LAVA) {
    if (m === M.SNOW) { setM(x, y, M.WATER); } else { setAux(x, y, 0); }
    return;
  }
}
const HOT_N = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/* ---- 液体：下落 / 斜流 / 横向摊开 + 密度分层 ---- */
function stepLiquid(x, y, i, m, p) {
  const dn = get(x, y + 1);
  if (canDisplace(dn)) { movePx(x, y, x, y + 1, m, 0); return; }
  if (isLiquid(dn) && (MAT[dn].dens || 1) < (p.dens || 1)) { swapPx(x, y, x, y + 1); return; }
  const d = ((x + y + frame) & 1) ? 1 : -1;
  for (const dd of [d, -d]) {
    const a = get(x + dd, y + 1), b = get(x + dd, y);
    if (canDisplace(a) && canDisplace(b)) { movePx(x, y, x + dd, y + 1, m, 0); return; }
    if (isLiquid(a) && (MAT[a].dens || 1) < (p.dens || 1) && canDisplace(b)) { swapPx(x, y, x + dd, y + 1); return; }
  }
  const spread = p.visc || 2;
  if (rng() < .55) {
    const dd = rng() < .5 ? 1 : -1;
    for (let s = 1; s <= spread; s++) {
      const nx = x + dd * s, b = get(nx, y);
      if (canDisplace(b)) { movePx(x, y, nx, y, m, 0); return; }
      if (isLiquid(b) && (MAT[b].dens || 1) < (p.dens || 1)) { swapPx(x, y, nx, y); return; }
      if (!isLiquid(b) && !canDisplace(b)) break;
    }
  }
  liquidChem(x, y, i, m, p);
}

/* ---- 气体：上升 / 扩散 / 消散或凝结 ---- */
function stepGas(x, y, i, m, p) {
  const up = get(x, y - 1);
  if (canDisplace(up)) { movePx(x, y, x, y - 1, m, aux[i]); }
  else if (rng() < .6) {
    const d = rng() < .5 ? 1 : -1;
    if (canDisplace(get(x + d, y - 1)) && canDisplace(get(x + d, y))) movePx(x, y, x + d, y - 1, m, aux[i]);
    else if (canDisplace(get(x + d, y))) movePx(x, y, x + d, y, m, aux[i]);
    else if (canDisplace(get(x - d, y))) movePx(x, y, x - d, y, m, aux[i]);
  }
  // 生命周期
  let a = aux[i];
  if (m === M.STEAM) {
    a = a > 0 ? a - 1 : 150;
    if (a === 0) { setM(x, y, M.WATER); return; }
    if (((x + y + frame) & 7) === 0) for (const [dx, dy] of N8) if (get(x + dx, y + dy) === M.ICE || get(x + dx, y + dy) === M.SNOW) { setM(x, y, M.WATER); return; }
  } else if (m === M.SMOKE) {
    a = a > 0 ? a - 1 : 60;
    if (a === 0) { setM(x, y, M.AIR); return; }
  } else if (m === M.TOXGAS) {
    a = a > 0 ? a - 1 : 260;
    if (a === 0) { setM(x, y, M.AIR); return; }
  } else if (m === M.FLAMGAS) {
    a = a > 0 ? a - 1 : 400; if (a === 0) { setM(x, y, M.AIR); return; }
  } else if (m === M.FROST) {
    a = a > 0 ? a - 1 : 140; if (a === 0) { setM(x, y, M.AIR); return; }
  }
  aux[i] = a;
  if (((x * 5 + y * 3 + frame) & 3) === 0) gasChem(x, y, i, m, p);
}

/* ---- 火焰：升腾 / 点燃可燃物 / 被水浇灭 ---- */
function stepFire(x, y, i, m, p) {
  // 1) 灭火与蒸腾
  for (const [dx, dy] of N8) {
    const n = get(x + dx, y + dy);
    if (n === M.WATER || n === M.SLIME || n === M.TOXIC) {
      if (n === M.WATER) setM(x + dx, y + dy, rng() < .6 ? M.STEAM : M.WATER);
      setM(x, y, rng() < .3 ? M.SMOKE : M.AIR);
      return;
    }
    if (n === M.ICE || n === M.SNOW) { setM(x + dx, y + dy, M.WATER); setM(x, y, M.SMOKE); return; }
    if (n === M.FLAMGAS) { setFire(x + dx, y + dy, ri(40, 70)); if (rng() < .04) explode(x + dx, y + dy, 6, 30, 10, 'explosion', 5); return; }
    const pn = MAT[n];
    if (pn.flam) {
      if (pn.cat === CAT.LIQUID) { if (rng() < .5) setFire(x + dx, y + dy, ri(35, 65)); }
      else if (pn.cat === CAT.GAS) setFire(x + dx, y + dy, ri(30, 60));
      else {   // 固体：受热累积后燃烧
        const j = idx(x + dx, y + dy);
        aux[j] = Math.min(250, aux[j] + 3);
        if (aux[j] > 26 + hash2(x + dx, y + dy) * 30) {
          if (rng() < .35) setM(x + dx, y + dy, M.SMOKE, 40); else setFire(x + dx, y + dy, ri(30, 60));
        }
      }
    }
  }
  // 2) 生命
  let a = aux[i];
  a--;
  if (a <= 0) { setM(x, y, rng() < .55 ? M.SMOKE : M.AIR, 40); return; }
  aux[i] = a;
  // 3) 升腾
  if (rng() < .7) {
    const d = rng() < .5 ? 1 : -1;
    if (canDisplace(get(x, y - 1))) movePx(x, y, x, y - 1, M.FIRE, a);
    else if (canDisplace(get(x + d, y - 1))) movePx(x, y, x + d, y - 1, M.FIRE, a);
    else if (canDisplace(get(x + d, y))) movePx(x, y, x + d, y, M.FIRE, a);
  }
}

/* ---- 固体：受热 / 冰融 / 酸蚀（抽样） ---- */
function stepSolid(x, y, i, m, p) {
  if (((x * 7 + y * 11 + frame) & 3) !== 0) return;
  if (m === M.ICE || m === M.SNOW) {
    for (const [dx, dy] of N8) {
      const n = get(x + dx, y + dy);
      if (n === M.FIRE || n === M.LAVA) { setM(x, y, M.WATER); return; }
      if (n === M.FLAMGAS && rng() < .2) setM(x + dx, y + dy, M.FIRE, 50);
    }
    return;
  }
  if (p.flam) {  // 可燃固体：靠近火焰/熔岩蓄热
    for (const [dx, dy] of HOT_N) {
      const n = get(x + dx, y + dy);
      if (n === M.FIRE || n === M.LAVA) {
        aux[i] = Math.min(250, aux[i] + 2);
        if (aux[i] > 30 + hash2(x, y) * 34) setFire(x, y, ri(30, 60));
        return;
      }
    }
    if (aux[i] > 0) aux[i]--;
  }
}

/* ================= 炼金反应 ================= */
function liquidChem(x, y, i, m, p) {
  if (((x * 5 + y * 3 + frame) & 3) !== 0) return;    // 抽样 1/4
  for (const [dx, dy] of HOT_N) {
    const n = get(x + dx, y + dy);
    if (n === m || n === M.AIR) continue;
    switch (m) {
      case M.LAVA:
        if (n === M.WATER || n === M.BLOOD || n === M.SLIME) {   // 熔岩遇水/血 → 成石 + 蒸汽
          if (rng() < .75) { setM(x, y, M.ROCK); setM(x + dx, y + dy, M.STEAM, 120); splat(x + dx, y + dy, M.STEAM, 3); return; }
        }
        if (n === M.BOOZE || n === M.OIL) { if (rng() < .6) { setFire(x + dx, y + dy, 50); } return; }
        if (n === M.ICE || n === M.SNOW) { setM(x + dx, y + dy, M.WATER); if (rng() < .4) setM(x, y, M.ROCK); return; }
        if (n === M.ACID) { setM(x + dx, y + dy, M.TOXGAS, 120); return; }
        if (MAT[n].flam && rng() < .5) setFire(x + dx, y + dy, 50);
        if (n === M.SAND || n === M.GRAVEL) { if (rng() < .25) { setM(x + dx, y + dy, M.ROCK); setM(x, y, M.LAVA); } return; }
        return;
      case M.ACID:
        if (n === M.WATER) { if (rng() < .08) { setM(x, y, M.WATER); } return; }
        if (n === M.METAL) { if (rng() < .01) { setM(x + dx, y + dy, M.AIR); setM(x, y, M.TOXGAS, 100); } return; }
        if (n === M.BRICK) return;
        if (CORRODIBLE.has(n)) {
          if (rng() < .22) {
            setM(x + dx, y + dy, rng() < .25 ? M.TOXGAS : M.AIR, 100);
            if (rng() < .45) { if (rng() < .25) setM(x, y, M.TOXGAS, 90); else setM(x, y, M.AIR); }
          }
          return;
        }
        return;
      case M.WATER:
        if (n === M.TOXIC) { if (rng() < .1) setM(x + dx, y + dy, M.WATER); return; }    // 净化毒泥
        if (n === M.FROST) { if (rng() < .1) { setM(x, y, M.ICE); setM(x + dx, y + dy, M.AIR); } return; }
        return;
      case M.TOXIC:
        if (n === M.WATER) { if (rng() < .05) setM(x, y, M.WATER); return; }
        return;
      case M.OIL: case M.BOOZE:
        if (n === M.FIRE || n === M.LAVA) { setFire(x, y, ri(35, 65)); return; }
        return;
    }
  }
}
function gasChem(x, y, i, m, p) {
  for (const [dx, dy] of N8) {
    const n = get(x + dx, y + dy);
    if (m === M.FLAMGAS && (n === M.FIRE || n === M.LAVA)) { setFire(x, y, 55); return; }
    if (m === M.STEAM && (n === M.ICE) && rng() < .1) { setM(x, y, M.WATER); return; }
    if (m === M.FROST && n === M.WATER && rng() < .12) { setM(x + dx, y + dy, M.ICE); return; }
    if (m === M.TOXGAS && n === M.WATER && rng() < .05) { setM(x, y, M.AIR); return; }
  }
}
function splat(x, y, mat, n, spread) {
  for (let k = 0; k < n; k++) {
    const dx = ri(-(spread || 3), spread || 3), dy = ri(-(spread || 3), spread || 3);
    if (canDisplace(get(x + dx, y + dy))) setM(x + dx, y + dy, mat, mat === M.FIRE ? ri(25, 55) : 0);
  }
}

/* ================= 破坏：挖掘 / 爆炸（耐久·硬度·射线能量） ================= */
function destroyCell(x, y, blastDur, debris) {
  const m = get(x, y);
  const p = MAT[m];
  if (m === M.AIR || m === M.BRICK) return false;
  if ((p.dur || 99) > blastDur) return false;
  if (m === M.GOLDORE) { setM(x, y, rng() < .7 ? M.GOLD : M.AIR); return true; }
  if (debris && p.cat === CAT.SOLID && rng() < .22) { setM(x, y, M.GRAVEL, 10); return true; }
  if (p.cat === CAT.LIQUID) { setM(x, y, rng() < .4 ? M.SMOKE : M.AIR, 40); return true; }
  setM(x, y, M.AIR);
  return true;
}
function dig(x, y, rad, power, debris) {
  for (let yy = -rad; yy <= rad; yy++) for (let xx = -rad; xx <= rad; xx++) {
    if (xx * xx + yy * yy > rad * rad) continue;
    const m = get(x + xx, y + yy), p = MAT[m];
    if (m === M.AIR) continue;
    if ((p.dur || 99) <= power) destroyCell(x + xx, y + yy, power, debris);
  }
}
function explode(cx, cy, rad, energy, dmg, src, blastDur) {
  cx = Math.round(cx); cy = Math.round(cy);
  const dur = blastDur || 10;
  for (let a = 0; a < 10; a++) {          // 10 条射线消耗硬度（wiki: ray energy）
    const ang = a / 10 * Math.PI * 2 + rng() * .3;
    let e = energy;
    for (let r = 0; r < rad && e > 0; r++) {
      const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * r);
      const m = get(x, y), p = MAT[m];
      if (m === M.AIR) continue;
      if ((p.dur || 99) > dur) { e -= p.hp * .5; continue; }
      e -= p.hp * .18;
      if (destroyCell(x, y, dur, true) && rng() < .3) setFire(x, y, ri(20, 45));
    }
  }
  for (let yy = -rad; yy <= rad; yy++) for (let xx = -rad; xx <= rad; xx++) {   // 内圈清空 + 点燃
    const d = Math.hypot(xx, yy);
    if (d > rad * .55) continue;
    const x = cx + xx, y = cy + yy;
    if (destroyCell(x, y, dur, false) && rng() < .18) setFire(x, y, ri(20, 45));
  }
  addLight(cx, cy, [255, 190, 110], rad * 3.2, 8);
  burst(cx, cy, rad * 2.2, '#ffb45e', 'spark');
  burst(cx, cy, rad, '#5c564e', 'dust');
  shake(rad * .55 + 4);
  flash(.16);
  sfx('boom');
  hitstop(4);
  for (const e of foes) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - cx, e.y - cy);
    if (d < rad + e.w * .5) hurtFoe(e, dmg * (1 - d / (rad + e.w * .5 + 1)), src);
  }
  if (!G.player.dead) {
    const d = Math.hypot(G.player.x - cx, G.player.y - cy);
    if (d < rad + 4) hurtPlayer(dmg * .8 * (1 - d / (rad + 5)) + 2, src === 'player' ? 'explosion' : (src === 'foe' ? 'explosion' : src));
  }
}

/* ================= 全局状态 ================= */
let frame = 0, camX = 0, camY = 0, shakeAmt = 0, flashAmt = 0, hitstopT = 0, toastT = 0;
const G = {
  state: 'title', gold: 0, kills: 0, depth: 0, seed: 0, potions: 1, perkList: [],
  player: { x: 0, y: 0, dead: true }, wands: [], pouch: [], current: 0, deathCause: '',
  timeStart: 0, timeEnd: 0, tinker: false
};
function shake(a) { shakeAmt = Math.min(26, shakeAmt + a); }
function flash(a) { flashAmt = Math.min(.8, flashAmt + a); }
function hitstop(n) { hitstopT = Math.max(hitstopT, n); }
function addLight(x, y, col, r, life) { if (lights.length < 60) lights.push({ x, y, col, r, life: life || 1, max: life || 1, temp: true }); }

/* ================= 背景纹理（远景岩壁） ================= */
const BG_N = 256, bgTex = new Float32Array(BG_N * BG_N);
for (let j = 0; j < BG_N; j++) for (let i = 0; i < BG_N; i++) {
  bgTex[j * BG_N + i] = .55 * hash2(i >> 3, j >> 3) + .3 * hash2(i >> 1, j >> 1) + .15 * hash2(i, j);
}
const bgSample = (x, y) => bgTex[((y & (BG_N - 1)) * BG_N + (x & (BG_N - 1)))];

/* ================= 材料像素渲染（贴图质感，不用纯色块） ================= */
function packCol(r, g, b) { return (255 << 24) | (b << 16) | (g << 8) | r; }
// 静态材料（固体/粉末）像素颜色只依赖 (材质,x,y) → 缓存；液体/气体/火焰每帧动画
const cacheCol = new Uint32Array(WW * WH), cacheMat = new Uint8Array(WW * WH).fill(255);
const DYN_TEX = { 5: 1, 6: 1, 7: 1 };
function matPixel(m, x, y, bgR, bgG, bgB, out) {
  const p = MAT[m];
  let h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const ha = (h ^ (h >>> 16)) >>> 0;
  const h2 = (Math.imul(ha ^ (ha >>> 7), 2246822519) >>> 0) / 4294967296;
  const h3 = ((ha >>> 10) & 1023) / 1024;
  const h4 = (ha & 255) / 256;
  let t = .5;
  switch (p.tex) {
    case 0: t = clamp(h2 * .62 + h4 * .38, 0, 1); break;                             // 岩纹
    case 1: t = clamp(h2 * .5 + (h4 > .9 ? .5 : (h4 < .1 ? -.4 : 0)), 0, 1); break;  // 斑点
    case 2: t = clamp(h4 * 1.1 - .05, 0, 1); break;                                  // 颗粒
    case 3: t = clamp(.5 + .45 * Math.sin(y * 1.6 + h2 * 9) + (h4 > .93 ? .3 : 0), 0, 1); break; // 木纹
    case 4: t = ((y % 9 === 0) || ((x + ((y / 9 | 0) & 1) * 7) % 14 === 0)) ? 0 : clamp(h2 * .5 + .3, 0, 1); break; // 砖缝
    case 5: t = clamp(h2 * .45 + .25 + (h4 > .94 ? .3 : 0), 0, 1); break;            // 液面
    case 6: t = clamp(h2 * .7 + .15, 0, 1); break;                                   // 气雾
    case 7: t = clamp(.35 + .6 * hash2(x + ((frame * 3) & 63), y * 2 + (frame >> 1)), 0, 1); break; // 火焰
    case 8: t = hash2(x >> 1, y >> 1) > .74 ? 1 : clamp(h2 * .4, 0, 1); break;       // 矿脉
    case 9: t = clamp(.45 + .5 * h2, 0, 1); break;                                   // 菌盖
    default: t = h2;
  }
  let rr = p.c0[0] + (p.c1[0] - p.c0[0]) * t;
  let gg = p.c0[1] + (p.c1[1] - p.c0[1]) * t;
  let bb = p.c0[2] + (p.c1[2] - p.c0[2]) * t;
  const jit = (p.jit || 0) * (h3 - .5);
  rr += jit; gg += jit; bb += jit;
  if (p.tex === 5) {           // 液面高光
    if (!isLiquid(get(x, y - 1)) && !isGas(get(x, y - 1))) { rr += 34; gg += 34; bb += 34; }
  }
  if (p.tex === 7 && m === M.FIRE) {           // 火焰按寿命渐暗
    const a = getAux(x, y) / 60;
    rr *= (.55 + .45 * a); gg *= (.35 + .6 * a); bb *= (.2 + .8 * a);
  }
  if (p.cat === CAT.GAS) {      // 气体与背景轻混
    const w = .5 + .32 * h4;
    rr = bgR * (1 - w) + rr * w; gg = bgG * (1 - w) + gg * w; bb = bgB * (1 - w) + bb * w;
  }
  out[0] = clamp(rr, 0, 255) | 0; out[1] = clamp(gg, 0, 255) | 0; out[2] = clamp(bb, 0, 255) | 0;
}
const pxTmp = [0, 0, 0];
function renderMaterials() {
  const y0 = Math.floor(camY), x0 = Math.floor(camX);
  const amb = biomeAt(camY + VH / 2).amb;
  for (let sy = 0; sy < VH; sy++) {
    const wy = y0 + sy;
    const rowBase = sy * VW;
    const wrow = wy * WW;
    for (let sx = 0; sx < VW; sx++) {
      const wx = x0 + sx;
      // 远景岩壁
      const bv = bgSample(((wx + camX * .55) * .5) | 0, ((wy + camY * .3) * .5) | 0);
      let br = amb[0] * (0.35 + bv * 0.75), bg = amb[1] * (0.35 + bv * 0.75), bb = amb[2] * (0.35 + bv * 0.75);
      const wi = wrow + wx;
      const m = (wx >= 0 && wx < WW && wy >= 0 && wy < WH) ? cells[wi] : M.ROCK;
      if (m !== M.AIR) {
        if (DYN_TEX[MAT[m].tex]) {
          matPixel(m, wx, wy, br, bg, bb, pxTmp);
          br = pxTmp[0]; bg = pxTmp[1]; bb = pxTmp[2];
        } else {
          let packed;
          if (cacheMat[wi] === m) packed = cacheCol[wi];
          else {
            matPixel(m, wx, wy, br, bg, bb, pxTmp);
            packed = packCol(pxTmp[0], pxTmp[1], pxTmp[2]);
            cacheCol[wi] = packed; cacheMat[wi] = m;
          }
          imgBuf[rowBase + sx] = packed;
          continue;
        }
      } else {
        br = clamp(br + 4, 0, 70); bg = clamp(bg + 4, 0, 70); bb = clamp(bb + 5, 0, 84);
      }
      imgBuf[rowBase + sx] = packCol(br | 0, bg | 0, bb | 0);
    }
  }
}

/* ================= 光照：径向渐变 + 遮挡射线 ================= */
const lightCv2 = document.createElement('canvas');   // 全分辨率光照缓冲（1:1 合成，避免放大开销）
lightCv2.width = VW; lightCv2.height = VH;
const lctx = lightCv2.getContext('2d');
const glowCache = new Map();
function glowSprite(col) {
  const key = col.join(',');
  let cv2 = glowCache.get(key);
  if (!cv2) {
    cv2 = document.createElement('canvas');
    cv2.width = 64; cv2.height = 64;
    const g = cv2.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},.95)`);
    gr.addColorStop(.35, `rgba(${col[0] * .6 | 0},${col[1] * .6 | 0},${col[2] * .6 | 0},.5)`);
    gr.addColorStop(.7, `rgba(${col[0] * .3 | 0},${col[1] * .3 | 0},${col[2] * .3 | 0},.18)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    glowCache.set(key, cv2);
  }
  return cv2;
}
function collectLights() {
  // 每帧光源（材料/实体）都重新收集；只保留尚未熄灭的临时光源（爆炸闪光等）
  lights = lights.filter(L => L.temp && --L.life > 0);
  for (const L of lights) if (L.temp) L.r *= .96;
  const cx0 = Math.floor(camX), cy0 = Math.floor(camY);
  let scan = 0;
  const cluster = [];
  for (let sy = 0; sy < VH; sy += 3) {
    const wy = cy0 + sy;
    if (wy < 0 || wy >= WH) continue;
    for (let sx = 0; sx < VW; sx += 3) {
      const wx = cx0 + sx;
      if (wx < 0 || wx >= WW) continue;
      const m = cells[idx(wx, wy)];
      const L = MAT[m].light;
      if (!L) continue;
      let near = false;                       // 合并邻近自发光（熔岩湖/火焰堆不叠成白斑）
      for (const q of cluster) { const dx = q.x - wx, dy = q.y - wy; if (dx * dx + dy * dy < 576) { near = true; break; } }
      if (near) continue;
      cluster.push({ x: wx, y: wy });
      const fl = m === M.FIRE ? (0.75 + hash2(wx, frame >> 1) * .5) : (0.88 + hash2(wx + frame, wy) * .3);
      lights.push({ x: wx, y: wy, col: [L[0], L[1], L[2]], r: L[3] * fl * 1.3, life: 1, max: 1 });
      if (++scan > 12) return;
    }
  }
}
function shadowFan(lx, ly, r) {
  const segs = 24, pts = [];
  for (let s = 0; s < segs; s++) {
    const a = (s / segs) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    let d = 3;
    while (d < r) {
      const m = get(lx + ca * d, ly + sa * d);
      if ((MAT[m].opaque || 0) >= 1) break;
      d += 3;
    }
    const dd = Math.min(d, r);
    pts.push([lx + ca * dd - camX, ly + sa * dd - camY]);   // 转回光照画布坐标
  }
  return pts;
}
function renderLight() {
  const amb = biomeAt(camY + VH / 2).amb;
  lctx.globalCompositeOperation = 'source-over';
  lctx.fillStyle = `rgb(${amb[0] | 0},${amb[1] | 0},${amb[2] | 0})`;
  lctx.fillRect(0, 0, VW, VH);
  lctx.globalCompositeOperation = 'lighter';
  const bigLights = [];
  for (const L of lights) {
    const sx = L.x - camX, sy = L.y - camY, r = Math.max(2, L.r);
    if (sx < -r || sx > VW + r || sy < -r || sy > VH + r) continue;
    const fade = L.temp ? clamp(L.life / L.max, 0, 1) : 1;
    const spr = glowSprite(L.col);
    if (L.shadow && bigLights.length < 7) { bigLights.push({ sx, sy, r, spr, fade }); continue; }
    lctx.globalAlpha = 1 * fade;
    lctx.drawImage(spr, sx - r, sy - r, r * 2, r * 2);
  }
  lctx.globalAlpha = 1;
  for (const L of bigLights) {          // 带遮挡的主光源
    const pts = shadowFan(L.sx + camX, L.sy + camY, L.r);
    lctx.save();
    lctx.beginPath();
    pts.forEach((p, i) => i ? lctx.lineTo(p[0], p[1]) : lctx.moveTo(p[0], p[1]));
    lctx.closePath(); lctx.clip();
    lctx.globalAlpha = 1 * L.fade;
    lctx.drawImage(L.spr, L.sx - L.r, L.sy - L.r, L.r * 2, L.r * 2);
    lctx.restore();
  }
  lctx.globalAlpha = 1;
  lctx.globalCompositeOperation = 'source-over';
  // 场景 × 光照
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(lightCv2, 0, 0);
  // 泛光（径向光晕）：只给大光源叠加一次柔和光斑
  ctx.globalCompositeOperation = 'lighter';
  for (const L of lights) {
    if (L.r < 16) continue;
    const sx = L.x - camX, sy = L.y - camY;
    if (sx < -L.r || sx > VW + L.r || sy < -L.r || sy > VH + L.r) continue;
    ctx.globalAlpha = .18 * (L.temp ? clamp(L.life / L.max, 0, 1) : 1);
    ctx.drawImage(glowSprite(L.col), sx - L.r, sy - L.r, L.r * 2, L.r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/* ================= 像素小人 / 道具美术（原创） ================= */
function drawSprite(rows, pal, x, y, flip) {
  const w = rows[0].length;
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < w; i++) {
      const c = row[i];
      if (c === '.' || c === ' ') continue;
      const col = pal[c];
      if (!col) continue;
      ctx.fillStyle = col;
      const px = flip ? x + (w - 1 - i) : x + i;
      ctx.fillRect(px, y + j, 1, 1);
    }
  }
}
const SPR = {
  player: {
    rows: [
      '...vvv...',
      '..vvvvv..',
      '.vvvvvvv.',
      '..ssss...',
      '..ses....',
      '.rrrrrr..',
      'rrrrrrrr.',
      'rrrrrrrrr',
      '.rrrrrrr.',
      '.rrrrrr..',
      '..rr.rr..',
      '..kk.kk..',
      '..kk.kk..'],
    pal: { v: '#7a4f9e', s: '#e8c39a', e: '#2b2233', r: '#9a5fb0', k: '#4a3a5c' }
  },
  nibbler: {
    rows: [
      'f.........',
      'ff...ff...',
      'ffffffffff',
      '.fffff.fff',
      '..ff...f..',
      '..f.f.f...',
      '...f.f....'],
    pal: { f: '#a5794b' }
  },
  marksman: {
    rows: [
      '...ggg....',
      '..ggggg...',
      '..sesg....',
      '..gggggggg',
      '.gggggggg.',
      'g.gggg.g..',
      '..gggg....',
      '..gg.gg...',
      '..bb.bb...'],
    pal: { g: '#7f9a58', s: '#c8b072', e: '#20242c', b: '#3c3a44' }
  },
  wisp: {
    rows: [
      '..cccc..',
      '.cwwwwc.',
      'cwcwwcwc',
      '.cwwwwc.',
      '..cccc..',
      '...c.c..',
      '..c...c.',
      '...c.c..'],
    pal: { c: '#8fd4e8', w: '#e8fbff' }
  },
  firebug: {
    rows: [
      '..oo..',
      '.oooo.',
      'owwwo.',
      'owwwo.',
      '.oooo.',
      '..o.o.'],
    pal: { o: '#e08a3c', w: '#ffe08a' }
  },
  digger: {
    rows: [
      '....bbbb....',
      '.bbbbbbbbbb.',
      'bbbbobbbobbb',
      '.bbbbbbbbbb.',
      '....bbbb....'],
    pal: { b: '#b08a6a', o: '#33221a' }
  },
  sporeback: {
    rows: [
      '...mmmmm...',
      '..mmmmmmm..',
      '.mmmmmmmmm.',
      '..ppppppp..',
      '..ppoeopp..',
      '.ppppppppp.',
      '..ppp.ppp..',
      '..pp..pp...'],
    pal: { m: '#b06a8a', p: '#9a7ab8', o: '#f0e0a0', e: '#2b2233' }
  }
};

/* ---- 实体光源 ---- */
function collectEntityLights() {
  const P = G.player;
  if (P && !P.dead) {
    lights.push({ x: P.x, y: P.y - 3, col: [152, 162, 200], r: 64 + hash2(frame, 3) * 4, life: 1, max: 1, shadow: true });
    if (P.fire > 0) lights.push({ x: P.x, y: P.y - 4, col: [255, 150, 60], r: 22, life: 1, max: 1 });
  }
  for (const p of props) {
    if (p.type === 'torch') {
      const fl = .8 + hash2(p.x + frame, p.y) * .4;
      lights.push({ x: p.x, y: p.y - 3, col: [255, 158, 70], r: 52 * fl, life: 1, max: 1, shadow: true });
    } else if (p.type === 'shrine' && p.room && !p.room.healed) {
      lights.push({ x: p.x, y: p.y - 12, col: [110, 200, 235], r: 34, life: 1, max: 1 });
    } else if (p.type === 'altar') {
      lights.push({ x: p.x, y: p.y - 14, col: [245, 205, 120], r: 36, life: 1, max: 1 });
    }
  }
  for (const q of projs) if (q.light) lights.push({ x: q.x, y: q.y, col: q.light, r: q.lrad || 14, life: 1, max: 1 });
  for (const d of drops) if (d.type === 'gold') lights.push({ x: d.x, y: d.y, col: [255, 210, 110], r: 12, life: 1, max: 1 });
  for (const e of foes) if (e.glow) lights.push({ x: e.x, y: e.y, col: e.glow, r: e.glowR || 18, life: 1, max: 1 });
}

/* ---- 道具 ---- */
function drawProps() {
  for (const p of props) {
    const sx = Math.round(p.x - camX), sy = Math.round(p.y - camY);
    if (sx < -30 || sx > VW + 30 || sy < -40 || sy > VH + 40) continue;
    if (p.type === 'torch') {
      ctx.fillStyle = '#3d3a44'; ctx.fillRect(sx - 1, sy - 4, 2, 5);
      ctx.fillStyle = '#6b5a3a'; ctx.fillRect(sx - 1, sy - 5, 2, 2);
      const fl = hash2(p.x + frame, p.y);
      ctx.fillStyle = '#ff9a2a'; ctx.fillRect(sx - 1, sy - 8, 2, 3);
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(sx - (fl > .5 ? 0 : 1), sy - 9 - (fl > .6 ? 1 : 0), 1, 2);
    } else if (p.type === 'chest') {
      ctx.fillStyle = '#6b4a2c'; ctx.fillRect(sx - 5, sy - 7, 10, 7);
      ctx.fillStyle = '#8a6238'; ctx.fillRect(sx - 5, sy - 7, 10, 2);
      ctx.fillStyle = '#c9a24a'; ctx.fillRect(sx - 1, sy - 5, 2, 3);
      ctx.fillStyle = '#3a2c1c'; ctx.fillRect(sx - 5, sy - 4, 10, 1);
    } else if (p.type === 'stand') {
      ctx.fillStyle = '#4a4658'; ctx.fillRect(sx - 3, sy - 4, 6, 4);
      ctx.fillStyle = '#5c5470'; ctx.fillRect(sx - 4, sy - 5, 8, 2);
      const w = p.wand;
      ctx.fillStyle = w.body[0]; ctx.fillRect(sx - 4, sy - 10, 8, 2);
      ctx.fillStyle = w.body[1]; ctx.fillRect(sx + 3, sy - 11, 2, 4);
      ctx.fillStyle = '#8fd8ff'; ctx.fillRect(sx + 3, sy - 12, 1, 1);
    } else if (p.type === 'flask') {
      ctx.fillStyle = '#c9d8e8'; ctx.fillRect(sx - 1, sy - 8, 3, 2);
      ctx.fillStyle = '#8a2a3a'; ctx.fillRect(sx - 3, sy - 6, 6, 6);
      ctx.fillStyle = '#c04a58'; ctx.fillRect(sx - 3, sy - 4, 6, 4);
      ctx.fillStyle = '#e8f0ff'; ctx.fillRect(sx - 2, sy - 5, 1, 2);
    } else if (p.type === 'shrine') {
      ctx.fillStyle = '#5a5470'; ctx.fillRect(sx - 6, sy - 14, 12, 14);
      ctx.fillStyle = '#6e678a'; ctx.fillRect(sx - 5, sy - 13, 10, 3);
      ctx.fillStyle = p.room && p.room.healed ? '#4a4460' : '#7ad8ff';
      ctx.fillRect(sx - 2, sy - 10, 4, 4);
    } else if (p.type === 'table') {
      ctx.fillStyle = '#6b4a2c'; ctx.fillRect(sx - 12, sy - 8, 24, 3);
      ctx.fillStyle = '#4a3320'; ctx.fillRect(sx - 11, sy - 5, 3, 5); ctx.fillRect(sx + 8, sy - 5, 3, 5);
      ctx.fillStyle = '#d8d0b8'; ctx.fillRect(sx - 8, sy - 10, 6, 3); ctx.fillRect(sx + 1, sy - 11, 5, 4);
    } else if (p.type === 'altar') {
      ctx.fillStyle = '#4a4460'; ctx.fillRect(sx - 7, sy - 8, 14, 8);
      ctx.fillStyle = '#5c5474'; ctx.fillRect(sx - 8, sy - 9, 16, 2);
      if (!p.used) {
        for (let i = -1; i <= 1; i++) {
          const fy = sy - 14 - Math.sin(frame * .05 + i) * 1.5;
          ctx.fillStyle = '#f0c458'; ctx.fillRect(sx + i * 5 - 1, fy - 2, 3, 3);
          ctx.fillStyle = '#fff0a8'; ctx.fillRect(sx + i * 5 - 1, fy - 2, 1, 1);
        }
      }
    } else if (p.type === 'sign') {
      ctx.fillStyle = '#5c4326'; ctx.fillRect(sx - 1, sy - 5, 2, 5);
      ctx.fillStyle = '#7a5a34'; ctx.fillRect(sx - 5, sy - 9, 10, 5);
    }
  }
}

/* ---- 掉落物 ---- */
function drawDrops() {
  for (const d of drops) {
    const sx = Math.round(d.x - camX), sy = Math.round(d.y - camY);
    if (sx < -10 || sx > VW + 10 || sy < -10 || sy > VH + 10) continue;
    if (d.type === 'gold') {
      ctx.fillStyle = '#e8c451'; ctx.fillRect(sx - 2, sy - 2, 4, 3);
      ctx.fillStyle = '#fff2a8'; ctx.fillRect(sx - 1, sy - 2, 1, 1);
    } else if (d.type === 'spell') {
      const s = SPELLS[d.spell];
      ctx.fillStyle = '#2a3050'; ctx.fillRect(sx - 3, sy - 4, 6, 7);
      ctx.fillStyle = '#cfd8ee'; ctx.fillRect(sx - 3, sy - 4, 6, 1);
      ctx.fillStyle = s.type === 'mod' ? '#b48ce0' : (s.type === 'trig' ? '#f0a35c' : '#8fd8ff');
      ctx.fillRect(sx - 1, sy - 2, 2, 2);
    } else if (d.type === 'potion') {
      ctx.fillStyle = '#8a2a3a'; ctx.fillRect(sx - 2, sy - 3, 5, 5);
      ctx.fillStyle = '#e8f0ff'; ctx.fillRect(sx - 1, sy - 5, 2, 2);
    }
  }
}

/* ---- 敌人 ---- */
function drawFoes() {
  for (const e of foes) {
    if (e.dead) continue;
    const sx = Math.round(e.x - camX), sy = Math.round(e.y - camY);
    if (sx < -60 || sx > VW + 60 || sy < -60 || sy > VH + 60) continue;
    ctx.save();
    if (e.flash > 0) ctx.globalAlpha = .55 + .45 * Math.sin(frame * 2);
    if (e.type === 'embereye') {
      const R = 16 + Math.sin(frame * .06) * 1.5;
      ctx.fillStyle = '#3a1414'; ctx.beginPath(); ctx.arc(sx, sy, R + 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = e.phase === 2 ? '#ff5a3c' : '#c8462a';
      ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(sx, sy, R * .55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0a12'; ctx.beginPath(); ctx.arc(sx + (G.player.x - e.x) * .03, sy + (G.player.y - e.y) * .03, R * .28, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2 + frame * .01;
        ctx.fillStyle = '#7a2418';
        ctx.fillRect(sx + Math.cos(a) * (R + 4) - 1, sy + Math.sin(a) * (R + 4) - 1, 3, 3);
      }
    } else {
      const sp = SPR[e.type];
      const w = sp.rows[0].length, h = sp.rows.length;
      drawSprite(sp.rows, e.flash > 0 ? whitePal(sp.pal) : sp.pal, sx - (w >> 1), sy - (h >> 1), e.dir < 0);
    }
    ctx.restore();
    if (e.hp < e.max && e.type !== 'embereye') {
      ctx.fillStyle = '#120a10'; ctx.fillRect(sx - 7, sy - (e.h >> 1) - 3, 14, 2);
      ctx.fillStyle = '#df6871'; ctx.fillRect(sx - 7, sy - (e.h >> 1) - 3, 14 * clamp(e.hp / e.max, 0, 1), 1);
    }
  }
}
let whiteCache = null;
function whitePal(pal) {
  if (!whiteCache) { whiteCache = {}; for (const k in pal) whiteCache[k] = '#ffffff'; }
  return whiteCache;
}

/* ---- 玩家 ---- */
function drawPlayer() {
  const P = G.player;
  if (P.dead) return;
  const sx = Math.round(P.x - camX), sy = Math.round(P.y - camY);
  ctx.save();
  if (P.inv > 0 && (frame % 4) < 2) ctx.globalAlpha = .45;
  const sp = SPR.player;
  drawSprite(sp.rows, P.flash > 0 ? whitePal(sp.pal) : sp.pal, sx - 4, sy - 6, P.dir < 0);
  // 手持法杖
  const a = P.aimAng;
  const wx = sx + Math.cos(a) * 5, wy = sy - 2 + Math.sin(a) * 5;
  const w = G.wands[G.current];
  ctx.fillStyle = w ? w.body[0] : '#6b4a2c';
  for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(wx + Math.cos(a) * i), Math.round(wy + Math.sin(a) * i), 1, 1);
  ctx.fillStyle = w ? w.body[1] : '#a97b48';
  ctx.fillRect(Math.round(wx + Math.cos(a) * 5), Math.round(wy + Math.sin(a) * 5), 2, 2);
  ctx.restore();
}

/* ---- 弹体 ---- */
function drawProjs() {
  for (const q of projs) {
    const sx = Math.round(q.x - camX), sy = Math.round(q.y - camY);
    if (sx < -40 || sx > VW + 40 || sy < -40 || sy > VH + 40) continue;
    ctx.fillStyle = q.color;
    const s = q.size || 2;
    if (q.beam) {
      const len = 8 + (q.dig || 0);
      ctx.fillRect(sx - (Math.abs(q.vx) > Math.abs(q.vy) ? len : s), sy - (Math.abs(q.vy) >= Math.abs(q.vx) ? len : s), Math.abs(q.vx) > Math.abs(q.vy) ? len * 2 : s * 2, Math.abs(q.vy) >= Math.abs(q.vx) ? len * 2 : s * 2);
    } else if (q.spin) {
      const a = frame * .8;
      for (let i = 0; i < 4; i++) {
        const aa = a + i * Math.PI / 2;
        ctx.fillRect(sx + Math.cos(aa) * 3 - 1, sy + Math.sin(aa) * 3 - 1, 2, 2);
      }
    } else {
      ctx.fillRect(sx - s, sy - s, s * 2 + 1, s * 2 + 1);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx, sy, 1, 1);
  }
}

/* ---- 粒子 ---- */
function drawParts() {
  for (const p of parts) {
    const sx = Math.round(p.x - camX), sy = Math.round(p.y - camY);
    if (sx < -6 || sx > VW + 6 || sy < -6 || sy > VH + 6) continue;
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    if (p.kind === 'ring') {
      ctx.globalAlpha *= .6;
      ctx.strokeStyle = p.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx, sy, (1 - p.life / p.max) * p.size + 1, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillRect(sx, sy, p.size || 1, p.size || 1);
    }
    ctx.globalAlpha = 1;
  }
}
function burst(x, y, n, color, kind) {
  for (let i = 0; i < n && parts.length < 400; i++) {
    const a = rng() * Math.PI * 2, sp = rf(.3, 2.6);
    parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'spark' ? 1 : 0),
      life: ri(14, 40), max: 40, color, kind: kind || 'spark', size: rng() < .3 ? 2 : 1,
      grav: kind === 'gore' ? .16 : (kind === 'dust' ? .05 : .03)
    });
  }
}

/* ================= 组合渲染 ================= */
function render() {
  renderMaterials();
  ctx.putImageData(imgData, 0, 0);
  collectLights();
  collectEntityLights();
  drawProps();
  drawDrops();
  drawFoes();
  drawProjs();
  drawPlayer();
  drawParts();
  renderLight();
  // 前景：准星 / 暗角 / 受伤边缘 / 入水罩
  const P = G.player;
  const mx = Math.round(pointer.x), my = Math.round(pointer.y);
  ctx.strokeStyle = 'rgba(240,235,210,.8)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(mx - 5, my); ctx.lineTo(mx - 2, my); ctx.moveTo(mx + 2, my); ctx.lineTo(mx + 5, my);
  ctx.moveTo(mx, my - 5); ctx.lineTo(mx, my - 2); ctx.moveTo(mx, my + 2); ctx.lineTo(mx, my + 5); ctx.stroke();
  if (P && !P.dead) {
    const head = get(Math.round(P.x), Math.round(P.y - 5));
    if (isLiquid(head)) {
      ctx.fillStyle = 'rgba(30,70,110,.32)'; ctx.fillRect(0, 0, VW, VH);
    }
    if (P.hp < P.maxHp * .3) {
      ctx.fillStyle = `rgba(150,20,20,${(0.22 + 0.12 * Math.sin(frame * .1)) * (1 - P.hp / (P.maxHp * .3))})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (P.fire > 0) {
      ctx.fillStyle = `rgba(255,120,30,${.1 + .06 * Math.sin(frame * .4)})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    if (P.chill > 0) { ctx.fillStyle = 'rgba(120,180,230,.14)'; ctx.fillRect(0, 0, VW, VH); }
    if (P.blind > 0) {
      const gr = ctx.createRadialGradient(mx, my, 12, mx, my, 70);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.96)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, VH);
    }
  }
  // 暗角
  const vg = ctx.createRadialGradient(VW / 2, VH / 2, VH * .42, VW / 2, VH / 2, VH * .95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
  if (flashAmt > 0) {
    ctx.fillStyle = `rgba(255,240,220,${flashAmt})`;
    ctx.fillRect(0, 0, VW, VH);
  }
}

/* ================= 物理与伤害辅助 ================= */
function solidRect(x, y, w, h) {
  const l = Math.floor(x - w / 2), r = Math.floor(x + w / 2), t = Math.floor(y - h / 2), b = Math.floor(y + h / 2);
  for (let yy = t; yy <= b; yy++) for (let xx = l; xx <= r; xx++) if (blocksMove(get(xx, yy))) return true;
  return false;
}
function moveBody(o, dx, dy, w, h) {
  if (dx) { const nx = o.x + dx; if (!solidRect(nx, o.y, w, h)) o.x = nx; else o.vx = 0; }
  if (dy) { const ny = o.y + dy; if (!solidRect(o.x, ny, w, h)) o.y = ny; else o.vy = 0; }
}
function moveBodyStep(o, dx, dy, w, h) {   // 带 1-2px 自动跨步：不被一粒砂卡住
  if (dx) {
    const nx = o.x + dx;
    if (!solidRect(nx, o.y, w, h)) o.x = nx;
    else if (!solidRect(nx, o.y - 1, w, h)) { o.x = nx; o.y -= 1; }
    else if (!solidRect(nx, o.y - 2, w, h)) { o.x = nx; o.y -= 2; }
    else o.vx = 0;
  }
  if (dy) { const ny = o.y + dy; if (!solidRect(o.x, ny, w, h)) o.y = ny; else o.vy = 0; }
}
function sampleMat(x, y, w, h) {   // 取实体覆盖格里“最危险”的材料
  const l = Math.floor(x - w / 2), r = Math.floor(x + w / 2), t = Math.floor(y - h / 2), b = Math.floor(y + h / 2);
  let worst = M.AIR, wd = -1;
  for (let yy = t; yy <= b; yy++) for (let xx = l; xx <= r; xx++) {
    const m = get(xx, yy), p = MAT[m];
    const sc = (p.dmg || 0) * 10 + (m === M.FIRE ? 3 : 0) + (p.cat === CAT.LIQUID ? .3 : 0);
    if (sc > wd) { wd = sc; worst = m; }
  }
  return worst;
}

/* ================= 玩家 ================= */
function newPlayer() {
  return {
    x: startSpot.x, y: startSpot.y, vx: 0, vy: 0, w: 7, h: 11,
    hp: 100, maxHp: 100, lev: 100, maxLev: 100,
    aimAng: 0, dir: 1, inv: 0, flash: 0, jumpCd: 0,
    fire: 0, breath: 320, wet: 0, oily: 0, bloody: 0, toxic: 0, slimy: 0, chill: 0, poison: 0, blind: 0,
    onGround: false, dead: false, lastCause: '', lastBy: '', buriedT: 0
  };
}
function updatePlayer() {
  const P = G.player;
  if (P.dead) return;
  const inp = G.input;
  let mv = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (P.slimy > 0) mv *= .8;
  if (P.chill > 0) mv *= .6;
  const spd = G.perks.swift ? 2.1 : 1.6;
  if (mv) { P.vx += mv * .28 * (P.oily > 0 ? 1.35 : 1); P.dir = mv > 0 ? 1 : -1; }
  P.vx *= P.onGround ? (P.oily > 0 ? .88 : .78) : .92;
  P.vx = clamp(P.vx, -spd, spd);
  P.vy = clamp(P.vy + .17, -6, 3.6);

  P.onGround = solidRect(P.x, P.y + P.h / 2 + 1, P.w - 2, 2);
  if (inp.jump && P.onGround && P.jumpCd <= 0) { P.vy = -3.3; P.jumpCd = 8; }
  P.jumpCd = (P.jumpCd || 0) - 1;
  const wantLev = inp.jump && !P.onGround;
  const levMax = G.perks.flight ? 200 : 100;
  P.maxLev = levMax;
  if (wantLev && P.lev > 0) {
    P.vy = Math.min(P.vy, G.perks.flight ? .1 : .22);
    P.lev -= .8;
  } else {
    P.lev = Math.min(levMax, P.lev + (G.perks.flight ? .5 : .28));
  }
  if (P.lev <= 0 && wantLev) P.vy = Math.min(P.vy, 1.2);
  moveBodyStep(P, P.vx, 0, P.w, P.h);
  moveBody(P, 0, P.vy, P.w, P.h);

  // 瞄准
  P.aimAng = Math.atan2(pointer.wy - (P.y - 2), pointer.wx - P.x);
  if (Math.abs(pointer.wx - P.x) > 6) P.dir = pointer.wx > P.x ? 1 : -1;

  // —— 材料接触 ——
  const m = sampleMat(P.x, P.y, P.w, P.h);
  const mp = MAT[m];
  if (mp.dmg) {
    if (m === M.ACID) envDamage(mp.dmg, 'acid');
    else if (m === M.TOXIC || m === M.TOXGAS) { if (!G.perks.toxproof) { P.toxic = Math.max(P.toxic, 260); envDamage(mp.dmg, 'poison'); } }
    else if (m === M.LAVA) { envDamage(mp.dmg, 'lava'); if (!G.perks.fireproof) P.fire = Math.max(P.fire, 90); }
    else if (m === M.FIRE) { if (P.wet > 0) { P.wet -= 2; if (rng() < .3) setM(Math.round(P.x), Math.round(P.y), M.STEAM, 60); } else if (!G.perks.fireproof) { P.fire = Math.max(P.fire, 70); envDamage(mp.dmg, 'burn'); } }
    else if (m === M.FROST) { P.chill = Math.max(P.chill, 180); envDamage(mp.dmg, 'freeze'); }
    else envDamage(mp.dmg, m === M.TOXGAS ? 'poison' : 'killed');
  }
  if (mp.stat === 'wet') P.wet = 300;
  if (mp.stat === 'oily') P.oily = 320;
  if (mp.stat === 'bloody') P.bloody = 260;
  if (mp.stat === 'slimy') P.slimy = 260;
  if (mp.stat === 'burn' && !G.perks.fireproof && P.wet <= 0) P.fire = Math.max(P.fire, 80);

  // —— 灼烧 / 溺水 / 中毒 / 冰冻 ——
  if (P.fire > 0) {
    P.fire--;
    if (P.wet > 0) { P.fire = 0; P.wet -= 40; if (rng() < .4) splat(P.x, P.y, M.STEAM, 2, 2); }
    else { P.hp -= P.maxHp * .00055; if (rng() < .3) splat(P.x, P.y - 6, M.FIRE, 1, 2); if (P.hp <= 0) die('burn'); }
  }
  const head = get(Math.round(P.x), Math.round(P.y - 5));
  const headP = MAT[head];
  if (isLiquid(head) && (headP.dmg !== 0 || head === M.WATER || head === M.BLOOD || head === M.OIL || head === M.SLIME)) {
    P.breath = Math.max(0, P.breath - 1.4);
    P.wet = 200;
    if (P.breath <= 0) { P.hp -= .55; if (P.hp <= 0) die('drown'); }
  } else P.breath = Math.min(320, P.breath + 6);
  if (P.toxic > 0) { P.toxic--; P.hp -= P.maxHp * .00045; if (P.hp <= 0) die('poison'); }
  if (P.chill > 0) P.chill--;
  for (const s of ['wet', 'oily', 'bloody', 'slimy']) if (P[s] > 0) P[s]--;

  // —— 埋压（压死） ——
  let cover = 0, total = 0;
  for (let yy = -5; yy <= 5; yy += 2) for (let xx = -3; xx <= 3; xx += 2) { total++; if (blocksMove(get(Math.round(P.x + xx), Math.round(P.y + yy)))) cover++; }
  if (cover > total * .55) {
    P.buriedT++;
    P.vy = Math.max(P.vy, 0);
    if (P.buriedT > 40) { P.hp -= .5; if (P.hp <= 0) die('crush'); }
  } else P.buriedT = Math.max(0, P.buriedT - 2);

  // —— 拾取金沙 ——
  for (let yy = -6; yy <= 6; yy++) for (let xx = -4; xx <= 4; xx++) {
    const gx = Math.round(P.x + xx), gy = Math.round(P.y + yy);
    if (get(gx, gy) === M.GOLD) {
      setM(gx, gy, M.AIR);
      const v = Math.round((G.perks.magnet ? 3 : 2) * rf(1, 2.4));
      G.gold += v; sfx('coin');
    }
  }

  // —— 掉落物吸附 ——
  const magR = G.perks.magnet ? 120 : 22;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    const dist = Math.hypot(d.x - P.x, d.y - P.y);
    if (dist < magR) { d.vx += (P.x - d.x) / (dist + 1) * .5; d.vy += (P.y - d.y) / (dist + 1) * .5; }
    if (dist < 9) { collectDrop(d); drops.splice(i, 1); }
  }

  // —— 魔杖充能 ——
  for (const w of G.wands) {
    if (!w) continue;
    w.mana = Math.min(w.manaMax, w.mana + w.manaCharge / 60 * (G.perks.mana ? 1.8 : 1));
    if (w.castTimer > 0) w.castTimer--;
    else if (w.rechargeTimer > 0) w.rechargeTimer--;
  }
  if (P.inv > 0) P.inv--;
  if (P.flash > 0) P.flash--;
  G.depth = Math.max(G.depth, Math.round(P.y));
}

function hurtPlayer(dmg, cause, by) {
  const P = G.player;
  if (P.dead || P.inv > 0 || dmg <= 0) return;
  if (P.wet > 0 && cause === 'burn') return;
  let d = dmg;
  if (G.perks.armor) d *= .6;
  if (G.perks.glass) d *= 1.1;
  if (P.bloody > 0) d *= .95;
  P.hp -= d;
  P.lastCause = cause; P.lastBy = by || '';
  P.inv = 26; P.flash = 6;
  shake(Math.min(7, 1 + d * .12));
  sfx('hurt');
  if (P.hp <= 0) die(cause, by);
}
function envDamage(d, cause) {   // 材料/状态伤害：无视无敌帧（对照 wiki 每帧每像素伤害）
  const P = G.player;
  if (P.dead || d <= 0) return;
  P.hp -= d * (G.perks.armor ? .6 : 1);
  P.lastCause = cause;
  if (P.hp <= 0) die(cause);
}
function die(cause, by) {
  const P = G.player;
  if (P.dead) return;
  P.dead = true; G.state = 'dead';
  G.timeEnd = performance.now();
  burst(P.x, P.y, 26, '#c54858', 'gore');
  splat(P.x, P.y, M.BLOOD, 14, 5);
  shake(14); flash(.25); sfx('death');
  const info = DEATHS[cause] || DEATHS.killed;
  G.deathCause = info[0];
  $('deathCause').textContent = '死因：' + info[0];
  $('deathDetail').textContent = (by ? info[1] + '（凶手：' + by + '）' : info[1]);
  $('runStats').textContent = `深入 ${Math.floor(G.depth / 8)}m · 击败 ${G.kills} 只生物 · 收集 ${G.gold} 金币 · 存活 ${Math.round((G.timeEnd - G.timeStart) / 1000)} 秒 · 种子 ${G.seed}`;
  $('dead').classList.remove('hide');
}

function collectDrop(d) {
  if (d.type === 'gold') { G.gold += Math.round(d.val * (G.perks.magnet ? 1.5 : 1)); sfx('coin'); }
  else if (d.type === 'spell') { G.pouch.push({ id: d.spell, uses: SPELLS[d.spell].uses || -1 }); toast(`获得法术：${SPELLS[d.spell].name}（进圣山拖进槽位）`); sfx('pickup'); }
  else if (d.type === 'potion') { G.potions++; toast('获得血瓶（Q 饮用）'); sfx('pickup'); }
}

/* ================= 敌人 ================= */
function spawnFoe(type, x, y) {
  const d = FOES[type];
  foes.push({
    type, x, y, vx: 0, vy: 0, w: d.w, h: d.h, hp: d.hp, max: d.hp, dmg: d.dmg,
    behavior: d.behavior, speed: d.speed, gold: d.gold, name: d.name,
    dir: rng() < .5 ? -1 : 1, cool: ri(40, 140), phase: 0, flash: 0, dead: false, born: frame,
    glow: type === 'wisp' ? [140, 230, 255] : (type === 'firebug' ? [255, 140, 50] : (type === 'embereye' ? [255, 110, 40] : null)),
    glowR: type === 'embereye' ? 60 : 18
  });
}
function hurtFoe(e, dmg, src) {
  if (e.dead) return;
  let d = dmg;
  if (G.perks.glass) d *= 1.8;
  if (G.perks.bloodmage && G.player.hp < G.player.maxHp * .5) d *= 1.6;
  e.hp -= d; e.flash = 7;
  burst(e.x, e.y, 3, '#ffd0a0', 'spark');
  if (e.hp <= 0) killFoe(e, src || 'player');
}
function killFoe(e, src) {
  if (e.dead) return;
  e.dead = true;
  const credited = src === 'player';
  if (credited) G.kills++;
  const goreMat = e.type === 'firebug' ? M.FIRE : (e.type === 'sporeback' ? M.SLIME : (e.type === 'wisp' ? M.SMOKE : M.BLOOD));
  splat(e.x, e.y, goreMat, 10, 4);
  if (e.type === 'firebug') explode(e.x, e.y, 9, 60, 20, 'foe', 6);
  burst(e.x, e.y, 12, '#ffd0a0', 'gore');
  if (src === 'env') return;                 // 自爆/环境击杀不掉战利品
  const n = e.type === 'embereye' ? 40 : ri(2, 5);
  for (let i = 0; i < n; i++) drops.push({ type: 'gold', x: e.x + rf(-3, 3), y: e.y + rf(-3, 3), vx: rf(-1.4, 1.4), vy: rf(-2.4, -.4), val: ri(e.gold[0], e.gold[1]) / n });
  if (rng() < (e.type === 'embereye' ? 1 : .16)) drops.push({ type: 'spell', x: e.x, y: e.y, vx: rf(-.6, .6), vy: -1.6, spell: spellRollFor(ri(1, 4)) });
  if (rng() < .07 && G.potions < 3) drops.push({ type: 'potion', x: e.x, y: e.y, vx: rf(-.6, .6), vy: -1.4 });
  sfx(e.type === 'embereye' ? 'boom' : 'kill');
  if (e.type === 'embereye') winGame();
}
function winGame() {
  G.state = 'win'; G.timeEnd = performance.now();
  $('winStats').textContent = `深入 ${Math.floor(G.depth / 8)}m · 击败 ${G.kills} 只生物 · ${G.gold} 金币 · 用时 ${Math.round((G.timeEnd - G.timeStart) / 1000)} 秒`;
  $('win').classList.remove('hide');
  $('bossBar').classList.add('hide');
}
function updateFoes() {
  const P = G.player;
  for (let i = foes.length - 1; i >= 0; i--) {
    const e = foes[i];
    if (e.dead) { foes.splice(i, 1); continue; }
    if (e.flash > 0) e.flash--;
    const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1;
    if (dist > 760) continue;                      // 休眠
    e.cool--;
    const sg = Math.sign(dx) || 1;
    const grounded = solidRect(e.x, e.y + e.h / 2 + 1, e.w - 1, 2);

    switch (e.behavior) {
      case 'charge': {
        e.vx += sg * .06 * e.speed * (Math.abs(dx) < 70 ? 2.2 : 1);
        e.vx = clamp(e.vx, -1.6 * e.speed, 1.6 * e.speed);
        e.vy = clamp(e.vy + .18, -5, 3.2);
        if (grounded && Math.abs(dx) < 46 && Math.abs(dy) < 16 && e.cool <= 0) { e.vy = -2.6; e.cool = 60; }
        e.dir = sg;
        moveBodyStep(e, e.vx, 0, e.w, e.h); moveBody(e, 0, e.vy, e.w, e.h);
        break;
      }
      case 'shoot': {
        if (Math.abs(dx) < 88) e.vx -= sg * .05; else if (Math.abs(dx) > 150) e.vx += sg * .05;
        e.vx = clamp(e.vx * .9, -1.1, 1.1); e.vy = clamp(e.vy + .18, -5, 3.2);
        if (grounded && Math.abs(dy) > 18 && e.cool % 40 === 0) e.vy = -2.4;
        e.dir = sg;
        moveBodyStep(e, e.vx, 0, e.w, e.h); moveBody(e, 0, e.vy, e.w, e.h);
        if (e.cool <= 0 && dist < 260) {
          const base = Math.atan2(dy, dx);
          for (let k = 0; k < 3; k++) {
            spawnProj({ owner: 'foe', x: e.x + sg * 5, y: e.y - 2, ang: base + (k - 1) * .13 + rf(-.05, .05), speed: 2.6, dmg: e.dmg, life: 150, color: '#ff9a6a', size: 2, light: [255, 140, 80], lrad: 12, from: e.name });
          }
          e.cool = 110; e.phase = 1; sfx('pew');
        }
        break;
      }
      case 'fly': {
        e.phase += .05;
        const tx = P.x + Math.sin(e.phase) * 34, ty = P.y - 10 + Math.cos(e.phase * .8) * 22;
        e.vx += (tx - e.x) * .0022 * e.speed + Math.sin(e.phase * 2.3) * .03;
        e.vy += (ty - e.y) * .0026 * e.speed + Math.cos(e.phase * 1.7) * .03;
        e.vx = clamp(e.vx * .985, -1.8, 1.8); e.vy = clamp(e.vy * .985, -1.8, 1.8);
        e.dir = sg;
        moveBody(e, e.vx, e.vy, e.w, e.h);
        break;
      }
      case 'bomb': {
        e.vx += sg * .07 * e.speed; e.vy += (dy > 0 ? .05 : -.05) * e.speed;
        e.vx = clamp(e.vx * .97, -2.2, 2.2); e.vy = clamp(e.vy * .97, -2, 2);
        e.dir = sg;
        const hitWall = solidRect(e.x + e.vx * 2, e.y + e.vy * 2, e.w, e.h);
        moveBody(e, e.vx, e.vy, e.w, e.h);
        if (frame - e.born > 40 && (hitWall || dist < 14)) killFoe(e, dist < 16 ? 'player' : 'env');
        break;
      }
      case 'burrow': {
        if (e.phase < 1) e.phase = Math.min(1, e.phase + .004);
        const front = Math.round(e.x + sg * (e.w / 2 + 1)), fy = Math.round(e.y);
        const fm = get(front, fy);
        if (isSolid(fm) && (MAT[fm].dur || 99) <= 7 && get(front, fy) !== M.BRICK) {
          destroyCell(front, fy, 7, false);
          if (rng() < .25) splat(front, fy, M.GRAVEL, 1, 1);
        }
        e.vx += sg * .05 * e.speed;
        e.vx = clamp(e.vx, -1.2 * e.speed, 1.2 * e.speed);
        if (!solidRect(e.x, e.y + e.h / 2 + 2, e.w, 2)) e.vy = clamp(e.vy + .12, -4, 2.4);
        else e.vy = Math.sin(frame * .05 + e.x) * .35;
        e.dir = sg;
        moveBodyStep(e, e.vx, 0, e.w, e.h); moveBody(e, 0, e.vy, e.w, e.h);
        break;
      }
      case 'lob': {
        e.vx *= .8; e.vy = clamp(e.vy + .18, -5, 3.2);
        if (grounded && e.cool <= 0 && dist < 300) { e.vy = -1.8; e.cool = 150; }
        e.dir = sg;
        moveBody(e, e.vx, 0, e.w, e.h); moveBody(e, 0, e.vy, e.w, e.h);
        if (e.cool === 90 && dist < 300) {
          const tt = Math.max(20, dist / 3);
          spawnProj({
            owner: 'foe', x: e.x, y: e.y - 4, ang: Math.atan2(dy - tt * tt * .05, dx), speed: clamp(dist / tt, 1.4, 3.6),
            dmg: e.dmg, life: 220, color: '#9ad86a', size: 3, light: [140, 230, 100], lrad: 12,
            gravity: .05, puddle: M.SLIME, puddleR: 3, from: e.name
          });
          sfx('splat');
        }
        break;
      }
      case 'boss': {
        e.phase = e.hp < e.max * .33 ? 3 : (e.hp < e.max * .66 ? 2 : 1);
        const hoverY = e.homeY !== undefined ? e.homeY : (e.homeY = e.y);
        const tx = P.x + Math.sin(frame * .008) * 60, ty = hoverY - 30 + Math.cos(frame * .011) * 16;
        e.vx += (tx - e.x) * .0016 * e.speed; e.vy += (ty - e.y) * .002 * e.speed;
        e.vx = clamp(e.vx * .97, -1.6, 1.6); e.vy = clamp(e.vy * .97, -1.3, 1.3);
        e.dir = sg;
        moveBody(e, e.vx, e.vy, e.w, e.h);
        if (e.cool <= 0) {
          const base = Math.atan2(dy, dx);
          if (e.phase === 1) {
            for (let k = -1; k <= 1; k++) spawnProj({ owner: 'foe', x: e.x, y: e.y, ang: base + k * .18, speed: 3, dmg: e.dmg, life: 200, color: '#ff8a4a', size: 3, light: [255, 130, 60], lrad: 18, fireTrail: true, from: e.name });
            e.cool = 70;
          } else if (e.phase === 2) {
            for (let k = 0; k < 12; k++) spawnProj({ owner: 'foe', x: e.x, y: e.y, ang: k / 12 * Math.PI * 2 + frame * .02, speed: 2.3, dmg: e.dmg * .7, life: 190, color: '#ff5a3c', size: 2, light: [255, 110, 50], lrad: 14, from: e.name });
            if (rng() < .5) spawnFoe('firebug', e.x + rf(-24, 24), e.y - 24);
            e.cool = 95;
          } else {
            for (let k = 0; k < 16; k++) {
              const a = Math.PI * .25 + k / 16 * Math.PI * .5;
              spawnProj({ owner: 'foe', x: e.x, y: e.y, ang: a, speed: 3.4, dmg: e.dmg * .8, life: 220, color: '#ffd24a', size: 3, light: [255, 190, 80], lrad: 20, explode: 7, fire: 1, from: e.name });
            }
            spawnFoe('firebug', e.x + rf(-30, 30), e.y - 30);
            e.cool = 110;
          }
          sfx('zap');
        }
        break;
      }
    }

    // 环境伤害（火焰/熔岩/酸）
    const em = sampleMat(e.x, e.y, e.w, e.h);
    const ep = MAT[em];
    if (ep.dmg && em !== M.TOXIC && em !== M.TOXGAS) hurtFoe(e, ep.dmg * 2, 'env');
    if (em === M.FIRE && rng() < .1) splat(e.x, e.y, M.FIRE, 1, 2);

    // 接触伤害
    if (Math.hypot(P.x - e.x, P.y - e.y) < (e.w + e.h) / 2 + 3) {
      hurtPlayer(e.dmg, e.type === 'embereye' ? 'lava' : 'killed', e.name);
      if (e.behavior === 'bomb') killFoe(e);
    }
    if (e.type === 'embereye') $('bossFill').style.width = clamp(e.hp / e.max, 0, 1) * 100 + '%';
  }
}

/* ================= 弹体 ================= */
function spawnProj(o) {
  const ang = o.ang + (o.spread ? rf(-o.spread, o.spread) : 0);
  projs.push({
    x: o.x, y: o.y, vx: Math.cos(ang) * o.speed, vy: Math.sin(ang) * o.speed,
    dmg: o.dmg, owner: o.owner, life: o.life || 120, color: o.color, size: o.size || 2,
    light: o.light, lrad: o.lrad, gravity: o.gravity || 0, explode: o.explode || 0, fire: o.fire || 0,
    dig: o.dig || 0, pierce: o.pierce || 0, bounce: o.bounce || 0, homing: o.homing || 0,
    chain: o.chain || 0, chill: o.chill || 0, stun: o.stun || 0, beam: o.beam || 0, spin: o.spin || 0,
    fireTrail: o.fireTrail || 0, puddle: o.puddle || 0, puddleR: o.puddleR || 2,
    payload: o.payload || null, timer: o.timer || 0, from: o.from || '', crit: o.crit || 0, hitIds: 0
  });
}
function releasePayload(q, x, y, ang) {
  if (!q.payload || !q.payload.length) return;
  fireCards(q.payload, x, y, ang, q.owner, q.mods || []);
  sfx('trig');
}
function updateProjs() {
  const P = G.player;
  for (let i = projs.length - 1; i >= 0; i--) {
    const q = projs[i];
    q.life--;
    if (q.timer > 0) { q.timer--; if (q.timer === 0) { releasePayload(q, q.x, q.y, Math.atan2(q.vy, q.vx)); projs.splice(i, 1); continue; } }
    if (q.homing) {
      const tgt = q.owner === 'player' ? nearestFoe(q.x, q.y) : (P.dead ? null : P);
      if (tgt) {
        const d = Math.hypot(tgt.x - q.x, tgt.y - q.y) || 1;
        q.vx += (tgt.x - q.x) / d * .12; q.vy += (tgt.y - q.y) / d * .12;
        const sp = Math.hypot(q.vx, q.vy) || 1, cap = 5;
        q.vx = q.vx / sp * Math.min(sp, cap); q.vy = q.vy / sp * Math.min(sp, cap);
      }
    }
    q.vy += q.gravity;
    q.x += q.vx; q.y += q.vy;
    if (q.fireTrail && rng() < .8) { if (canDisplace(get(Math.round(q.x), Math.round(q.y)))) setFire(Math.round(q.x), Math.round(q.y), ri(20, 40)); }
    if (q.puddle && rng() < .5) {
      const gx = Math.round(q.x), gy = Math.round(q.y);
      if (canDisplace(get(gx, gy))) setM(gx, gy, q.puddle);
    }
    // 撞地形
    const gm = get(Math.round(q.x), Math.round(q.y));
    if (blocksMove(gm)) {
      const gx = Math.round(q.x), gy = Math.round(q.y);
      if (q.bounce > 0) {
        q.bounce--;
        if (Math.abs(q.vx) > Math.abs(q.vy)) q.vx *= -.85; else q.vy *= -.85;
        q.x += q.vx; q.y += q.vy; q.life -= 10;
      } else {
        impactProj(q, gx, gy);
        projs.splice(i, 1); continue;
      }
    }
    // 命中
    if (q.owner === 'player') {
      let hitFoe = null;
      for (const e of foes) {
        if (e.dead) continue;
        if (Math.abs(e.x - q.x) < e.w / 2 + q.size && Math.abs(e.y - q.y) < e.h / 2 + q.size) { hitFoe = e; break; }
      }
      if (hitFoe) {
        const crit = rng() < (q.crit || 0) + (G.player.bloody > 0 ? .1 : 0) + (G.perks.crit ? .3 : 0);
        hurtFoe(hitFoe, q.dmg * (crit ? 4 : 1), 'player');
        burst(q.x, q.y, crit ? 12 : 5, crit ? '#fff0a4' : q.color, 'spark');
        if (crit) { flash(.12); shake(3); }
        sfx('hit'); hitstop(2);
        if (q.chain > 0) {
          let left = q.chain, last = hitFoe;
          const used = new Set([hitFoe]);
          while (left-- > 0) {
            const nx = nearestFoeEx(last.x, last.y, used);
            if (!nx) break;
            used.add(nx);
            lightningFx(last.x, last.y, nx.x, nx.y);
            hurtFoe(nx, q.dmg * .6, 'player');
            last = nx;
          }
        }
        if (q.pierce > 0) { q.pierce--; q.dmg *= .8; }
        else {
          impactProj(q, Math.round(q.x), Math.round(q.y), hitFoe);
          projs.splice(i, 1); continue;
        }
      }
    } else if (!P.dead && Math.abs(P.x - q.x) < P.w / 2 + q.size && Math.abs(P.y - q.y) < P.h / 2 + q.size) {
      hurtPlayer(q.dmg, 'killed', q.from);
      burst(q.x, q.y, 6, q.color, 'spark');
      impactProj(q, Math.round(q.x), Math.round(q.y));
      projs.splice(i, 1); continue;
    }
    if (q.life <= 0) {
      if (q.timer <= 0 && q.payload) releasePayload(q, q.x, q.y, Math.atan2(q.vy, q.vx));
      else impactProj(q, Math.round(q.x), Math.round(q.y));
      projs.splice(i, 1);
    }
  }
}
function impactProj(q, gx, gy, foeHit) {
  if (q.explode) explode(gx, gy, q.explode, q.explode * 7, q.dmg + (foeHit ? 0 : q.dmg * .5), q.owner === 'player' ? 'player' : 'foe', q.dig || 6);
  else if (q.dig) { dig(gx, gy, 2 + (q.beam ? 1 : 0), q.dig, true); burst(gx, gy, 4, '#bfae90', 'dust'); }
  if (q.puddle) splat(gx, gy, q.puddle, q.puddleR * 2, q.puddleR);
  if (q.fire) splat(gx, gy, M.FIRE, 4, 3);
  if (!q.explode) burst(gx, gy, 5, q.color, 'spark');
  if (q.payload) releasePayload(q, gx, gy, Math.atan2(q.vy, q.vx));
  sfx('impact');
}
function nearestFoe(x, y) { return nearestFoeEx(x, y, null); }
function nearestFoeEx(x, y, used) {
  let best = null, bd = 1e9;
  for (const e of foes) {
    if (e.dead || (used && used.has(e))) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd && d < 260) { bd = d; best = e; }
  }
  return best;
}
function lightningFx(x1, y1, x2, y2) {
  for (let t = 0; t <= 1; t += .12) {
    parts.push({ x: lerp(x1, x2, t) + rf(-2, 2), y: lerp(y1, y2, t) + rf(-2, 2), vx: 0, vy: 0, life: 8, max: 8, color: '#b9e7ff', kind: 'spark', size: 1, grav: 0 });
  }
  addLight((x1 + x2) / 2, (y1 + y2) / 2, [180, 230, 255], 40, 6);
}

/* ================= 掉落物 & 粒子 ================= */
function updateDrops() {
  for (const d of drops) {
    d.vy = clamp((d.vy || 0) + .06, -3, 2.4);
    d.x += d.vx; d.y += d.vy;
    if (solidRect(d.x, d.y + 1, 3, 2)) { d.vy *= -.3; d.vx *= .6; d.y -= .5; }
    d.vx *= .98;
    if (d.y > WH - 4) d.y = WH - 4;
  }
}
function updateParts() {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.vy += p.grav;
    p.x += p.vx; p.y += p.vy;
    if (p.kind !== 'ring' && blocksMove(get(Math.round(p.x), Math.round(p.y)))) { p.vy *= -.3; p.vx *= .5; p.y -= .4; }
    if (--p.life <= 0) parts.splice(i, 1);
  }
}

/* ================= 道具交互 ================= */
function nearestProp() {
  const P = G.player;
  let best = null, bd = 20;
  for (const p of props) {
    if (p.opened && (p.type === 'chest' || p.type === 'flask')) continue;
    if (p.type === 'torch') continue;
    const d = Math.hypot(p.x - P.x, p.y - (P.y + 4));
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function interact() {
  if (G.state !== 'play') return;
  const p = nearestProp();
  const P = G.player;
  if (p) {
    if (p.type === 'chest') {
      p.opened = true;
      const n = ri(2, 4);
      for (let i = 0; i < n; i++) drops.push({ type: 'gold', x: p.x + rf(-3, 3), y: p.y - 4, vx: rf(-1.2, 1.2), vy: rf(-2.6, -1), val: ri(8, 26) + G.depth / 60 });
      if (rng() < .8) drops.push({ type: 'spell', x: p.x, y: p.y - 6, vx: rf(-.5, .5), vy: -1.6, spell: spellRollFor(ri(1, 4)) });
      if (rng() < .35 && G.potions < 3) drops.push({ type: 'potion', x: p.x + 3, y: p.y - 6, vx: .5, vy: -1.4 });
      sfx('chest'); toast('宝箱开启'); burst(p.x, p.y - 5, 12, '#f0c458', 'spark');
    } else if (p.type === 'stand') {
      const cur = G.wands[G.current];
      G.wands[G.current] = p.wand; p.wand = cur;
      toast(`换上法杖：${G.wands[G.current].name}`);
      sfx('pickup'); openEditor();
    } else if (p.type === 'flask') {
      p.opened = true;
      G.potions = Math.min(4, G.potions + 1);
      toast('拾取血瓶（Q 饮用）'); sfx('pickup');
    } else if (p.type === 'shrine') {
      if (p.room && !p.room.healed) {
        p.room.healed = true;
        P.hp = P.maxHp;
        for (const w of G.wands) { w.mana = w.manaMax; w.deck.forEach(c => { if (c && SPELLS[c.id].uses) c.uses = SPELLS[c.id].uses; }); }
        toast('圣泉治愈了你，并唤醒了法杖');
        sfx('perk'); burst(p.x, p.y - 10, 18, '#7ad8ff', 'spark');
      } else toast('圣泉已经沉寂');
    } else if (p.type === 'altar') {
      if (!p.used) { offerPerks(p); }
    } else if (p.type === 'table') {
      openEditor();
    } else if (p.type === 'sign') {
      toast(p.text, 200);
    }
    return;
  }
  // 空处按 E：圣山内打开魔杖工坊 / 魔杖工匠随时打开
  if (G.perks.tinker || inHoly(Math.round(P.y))) openEditor();
  else toast('附近没有可交互的东西');
}
function drinkPotion() {
  const P = G.player;
  if (G.potions <= 0) { toast('没有血瓶了'); return; }
  G.potions--;
  P.hp = Math.min(P.maxHp, P.hp + 45);
  P.fire = 0; P.toxic = 0; P.poison = 0;
  burst(P.x, P.y, 14, '#e0575f', 'spark');
  toast('饮下血瓶：回复 45 生命并清除灼烧/中毒');
  sfx('drink');
}

/* ================= 魔杖施法引擎（牌库模型） =================
   修饰累积 → 多重扩容 → 弹体消耗一次施放 → 触发弹体吞掉后续牌做载荷
   牌库抽空或绕回 → 进入 recharge；castDelay 决定两发间隔。               */
const pointer = { x: VW / 2, y: VH / 2, wx: 0, wy: 0, down: false, touch: false };
G.input = { left: false, right: false, jump: false, fire: false };

function applyMod(st, def) {
  st.mods.push(def);
  st.delay += def.delay || 0;
  if (def.mod === 'saver') st.costMul = (st.costMul || 1) * .6;
  st.cost += Math.max(0, def.cost) * (st.costMul || 1);
}
function capturePayload(w, cap) {
  const cards = [];
  for (let i = 0; i < cap; i++) {
    if (w.index >= w.capacity) w.index = 0;
    const card = w.deck[w.index++];
    if (!card || card.uses === 0) continue;
    cards.push(card);
    const d = SPELLS[card.id];
    if (d.type === 'proj' || d.type === 'trig' || d.type === 'util') break;
  }
  return cards;
}
function gatherCast(w) {
  const st = { pending: w.perCast, fan: 0, mods: [], delay: 0, cost: 0, shots: [], wrapped: false, costMul: 1, fired: 0 };
  let draws = 0; const safety = w.capacity * 2 + 6;
  while (st.pending > 0 && draws < safety) {
    if (w.index >= w.capacity) { w.index = 0; st.wrapped = true; }
    const card = w.deck[w.index++]; draws++;
    if (!card || card.uses === 0) continue;
    const def = SPELLS[card.id];
    if (w.mana < st.cost + def.cost * st.costMul) continue;      // 魔力不足：跳过该牌
    if (def.type === 'mod') { applyMod(st, def); continue; }
    if (def.type === 'multi') {
      st.pending += def.n - 1;
      st.fan = Math.max(st.fan, def.fan || 0);
      st.cost += def.cost * st.costMul; st.delay += def.delay || 0;
      continue;
    }
    if (def.type === 'util') {
      doUtil(def, w);
      st.pending--; st.fired++;
      st.cost += def.cost * st.costMul; st.delay += def.delay || 0;
      if (card.uses > 0) card.uses--;
      continue;
    }
    let payload = null;
    if (def.type === 'trig') payload = capturePayload(w, def.payload || 3);
    st.shots.push({ def, mods: st.mods.slice(), payload, card });
    st.pending--; st.fired++;
    st.cost += def.cost * st.costMul; st.delay += def.delay || 0;
    if (card.uses > 0) card.uses--;
  }
  return st;
}
function castWand(w) {
  const P = G.player;
  if (!w || P.dead) return false;
  if (w.castTimer > 0 || w.rechargeTimer > 0) return false;
  if (w.deck.every(c => !c || c.uses === 0)) return false;
  const ox = P.x + Math.cos(P.aimAng) * 6, oy = P.y - 2 + Math.sin(P.aimAng) * 6;
  // 常驻法术：每次都触发，不耗蓝
  if (w.always) fireCards([w.always], ox, oy, P.aimAng, 'player', [], 0);
  const st = gatherCast(w);
  if (!st.shots.length) return false;
  w.mana = Math.max(0, w.mana - st.cost);
  spawnShots(st, ox, oy, P.aimAng, 'player');
  w.castTimer = Math.max(1, w.castDelay + st.delay - (G.perks.swift ? 2 : 0));
  if (st.wrapped) w.rechargeTimer = w.recharge;
  P.vx -= Math.cos(P.aimAng) * .35 * st.fired;
  P.vy -= Math.sin(P.aimAng) * .18 * st.fired;
  shake(Math.min(4, .6 + st.fired * .5));
  sfx('cast');
  return true;
}
function fireCards(cards, x, y, ang, owner, extraMods) {
  const st = { mods: (extraMods || []).slice(), fan: 0, shots: [], pending: 1, cost: 0, delay: 0, fired: 0 };
  let pending = 1;
  for (const card of cards) {
    if (pending <= 0) break;
    const def = SPELLS[card.id];
    if (def.type === 'mod') { st.mods.push(def); continue; }
    if (def.type === 'multi') { pending += def.n - 1; st.fan = Math.max(st.fan, def.fan || 0); continue; }
    if (def.type === 'util') { doUtil(def, null); }
    else st.shots.push({ def, mods: st.mods.slice(), payload: def.type === 'trig' ? [] : null });
    pending--; st.fired++;
  }
  spawnShots(st, x, y, ang, owner);
}
function spawnShots(st, ox, oy, ang, owner) {
  const n = st.shots.length;
  st.shots.forEach((s, i) => {
    const def = s.def;
    let dmg = def.dmg || 0, speed = def.speed || 3, size = def.size || 2, explode = def.explode || 0;
    let dig = def.dig || 0, pierce = def.pierce || 0, bounce = 0, homing = 0, fireTrail = def.fire ? 1 : 0;
    let crit = 0, chain = def.chain || 0, chill = def.chill || 0, stun = def.stun || 0;
    let puddle = def.puddle || 0, fire = def.fire || 0, gravity = def.gravity || 0, life = def.life || 120;
    let costHint = 0;
    for (const md of s.mods) {
      switch (md.mod) {
        case 'homing': homing = 1; break;
        case 'heavy': dmg *= 2.2; speed *= .6; break;
        case 'haste': speed *= 1.6; life *= 1.1; break;
        case 'firetrail': fireTrail = 1; break;
        case 'bounce': bounce += 2; break;
        case 'crit': crit += .4; break;
        case 'blast': explode += 9; dmg += 5; break;
        case 'pierce': pierce += 3; break;
        case 'saver': costHint = 1; break;
      }
    }
    if (owner === 'player') { dmg *= (G.perks.glass ? 1.8 : 1) * (G.perks.bloodmage && G.player.hp < G.player.maxHp * .5 ? 1.6 : 1); }
    const fanRad = (st.fan || 0) * Math.PI / 180;
    const off = n > 1 ? (i - (n - 1) / 2) * fanRad : 0;
    const spread = (s.mods.some(m => m.mod === 'crit') ? .02 : 0);
    spawnProj({
      owner, x: ox, y: oy, ang: ang + off, spread: spread + (def.beam ? 0 : .01),
      speed, dmg, life, size, color: def.color, light: def.light ? def.light.slice(0, 3) : null, lrad: def.light ? def.light[3] : 0,
      gravity, explode, fire, dig, pierce, bounce, homing, chain, chill, stun, beam: def.beam || 0, spin: def.spin || 0,
      fireTrail, puddle, crit, payload: s.payload && s.payload.length ? s.payload : null, timer: def.timer || 0,
      from: owner === 'player' ? '' : '敌方咒术'
    });
    if (def.beam) addLight(ox, oy, [235, 245, 255], 26, 5);
    if (def.explode) sfx('boom'); else sfx(def.sfx || 'pew');
  });
}
function doUtil(def, w) {
  const P = G.player;
  if (def.act === 'blink') {
    const nx = clamp(P.x + Math.cos(P.aimAng) * 62, 12, WW - 12);
    const ny = clamp(P.y + Math.sin(P.aimAng) * 62, 12, WH - 12);
    burst(P.x, P.y, 12, '#b28dff', 'spark');
    if (!solidRect(nx, ny, P.w, P.h)) { P.x = nx; P.y = ny; }
    burst(P.x, P.y, 12, '#b28dff', 'spark');
    sfx('trig');
  } else if (def.act === 'mend') {
    P.hp = Math.min(P.maxHp, P.hp + 25);
    burst(P.x, P.y, 14, '#8affa8', 'spark');
    sfx('perk');
  } else if (def.act === 'water') {
    const gx = Math.round(P.x + Math.cos(P.aimAng) * 10), gy = Math.round(P.y + Math.sin(P.aimAng) * 10);
    splat(gx, gy, M.WATER, 8, 4);
    sfx('splat');
  }
}

/* ================= 魔杖工坊（拖拽编辑） ================= */
let editing = false, dragState = null, selCard = null;
function openEditor() {
  if (G.state !== 'play') return;
  editing = true; renderEditor();
  $('editor').classList.remove('hide');
  sfx('chest');
}
function closeEditor() { editing = false; selCard = null; $('editor').classList.add('hide'); }
function spellCardHTML(card, src, wi, si) {
  const def = SPELLS[card.id];
  const uses = card.uses > 0 ? `<span class="uses">${card.uses}</span>` : '';
  return `<div class="spell ${TYPE_CLASS[def.type]}" data-src="${src}" data-w="${wi}" data-s="${si}">
    <span class="ic">${def.ic}</span><span>${def.name}</span>
    <span class="mp">${def.cost} 蓝 · ${TYPE_LABEL[def.type]}</span>${uses}</div>`;
}
function renderEditor() {
  const wandHTML = G.wands.map((w, wi) => {
    if (!w) return `<div class="wand-card" style="opacity:.45"><h3><span>${wi + 1}. 空位</span></h3><div class="stats"><span>捡到法杖后会放进这里</span></div></div>`;
    const slots = [];
    for (let si = 0; si < w.capacity; si++) {
      const c = w.deck[si];
      slots.push(c
        ? spellCardHTML(c, 'slot', wi, si)
        : `<div class="slot" data-slot="${wi}:${si}"><span style="opacity:.35">空槽</span></div>`);
    }
    return `<div class="wand-card ${wi === G.current ? 'active' : ''}">
      <h3><span>${wi + 1}. ${w.name}</span><em>${w.shuffle ? '混乱序' : '顺序序'} · T${w.tier}</em></h3>
      <div class="stats">
        <span>施法延迟 <b>${w.castDelay}</b></span><span>充能 <b>${w.recharge}</b></span><span>魔力 <b>${w.manaMax}</b></span>
        <span>回蓝 <b>${w.manaCharge}/s</b></span><span>容量 <b>${w.capacity}</b></span><span>多重 <b>${w.perCast}</b></span>
        <span>散布 <b>${w.spread}°</b></span><span>状态 <b>${w.mana >= w.manaMax * .3 ? '可用' : '缺蓝'}</b></span><span></span>
      </div>
      <div class="slots">${slots.join('')}</div>
      <div class="always">常驻法术：<b>${w.always ? SPELLS[w.always.id].name : '无'}</b>${w.always ? '（每次施法自动追加）' : ''}</div>
    </div>`;
  }).join('');
  const pouchHTML = G.pouch.length
    ? G.pouch.map((c, i) => spellCardHTML(c, 'pouch', -1, i)).join('')
    : '<div style="color:#67708c;font-size:11px;padding:12px">法术袋是空的。开宝箱、捡怪物掉落的法术卡，把它们拖进槽位。</div>';
  $('editor').innerHTML = `
    <div class="panel-title"><b>魔杖工坊 · 把法术拖进槽位（触屏可拖）</b><span>点击卡片再点槽位也可以 · E 关闭</span></div>
    <div class="ed-wrap">
      <div class="ed-wands">${wandHTML}</div>
      <div class="pouch" data-pouch="1"><h3>法术袋 <span>修饰只影响同一连锁里的弹体；触发弹体吞掉后面的牌作为载荷</span></h3><div class="pouch-grid">${pouchHTML}</div></div>
      <div class="ed-foot">
        <button class="ghost" id="edShuffle">洗牌（仅混乱序魔杖）</button>
        <button class="ghost" id="edAlways">把选中的法术设为常驻</button>
        <button class="ghost" id="edClear">清除常驻</button>
        <span>提示：三重施法 + 火焰尾迹 + 炎爆珠 = 一发三颗燃烧弹；星火弹·触发 后面跟爆化 = 命中才炸</span>
      </div>
    </div>`;
}
function cardAt(src, wi, si) {
  if (src === 'pouch') return G.pouch[si];
  return G.wands[wi].deck[si];
}
function setCardAt(src, wi, si, card) {
  if (src === 'pouch') G.pouch[si] = card;
  else G.wands[wi].deck[si] = card;
}
function removeCard(src, wi, si) {
  if (src === 'pouch') G.pouch.splice(si, 1);
  else G.wands[wi].deck[si] = null;
}
function dropDrag(target) {
  if (!dragState) return;
  const from = dragState;
  const card = cardAt(from.src, from.wi, from.si);
  if (!card) { dragState = null; return; }
  if (target && target.kind === 'slot') {
    const other = cardAt('slot', target.wi, target.si);
    removeCard(from.src, from.wi, from.si);
    setCardAt('slot', target.wi, target.si, card);
    if (other) {
      if (from.src === 'pouch') G.pouch.push(other);
      else setCardAt('slot', from.wi, from.si, other);
    }
    sfx('pickup');
  } else if (target && target.kind === 'pouch') {
    if (from.src === 'slot') {
      removeCard('slot', from.wi, from.si);
      G.pouch.push(card);
      sfx('pickup');
    }
  } else if (from.src === 'slot') {
    removeCard('slot', from.wi, from.si);
    G.pouch.push(card);
  }
  dragState = null; selCard = null;
  renderEditor();
}
function targetFromPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const slot = el.closest('.slot[data-slot]');
  if (slot) { const [wi, si] = slot.dataset.slot.split(':').map(Number); return { kind: 'slot', wi, si }; }
  const filled = el.closest('.spell[data-src="slot"]');
  if (filled) return { kind: 'slot', wi: +filled.dataset.w, si: +filled.dataset.s };
  if (el.closest('.pouch')) return { kind: 'pouch' };
  return null;
}
function makeGhost(card, x, y) {
  const g = document.createElement('div');
  g.className = 'drag-ghost';
  g.innerHTML = spellCardHTML(card, 'ghost', -1, -1);
  g.style.left = x + 'px'; g.style.top = y + 'px';
  document.body.appendChild(g);
  return g;
}
let ghostEl = null, dragMoved = false;
document.addEventListener('pointerdown', e => {
  if (!editing) return;
  const el = e.target.closest('.spell[data-src]');
  if (el) {
    const src = el.dataset.src, wi = +el.dataset.w, si = +el.dataset.s;
    const cd = cardAt(src, wi, si);
    if (!cd) return;
    if (selCard) {    // 已选中一张：在目标卡上放下（交换）
      dragState = { src: selCard.src, wi: selCard.wi, si: selCard.si };
      selCard = null;
      dropDrag({ kind: src === 'pouch' ? 'pouch' : 'slot', wi, si });
      return;
    }
    dragState = { src, wi, si };
    dragMoved = false;
    ghostEl = makeGhost(cd, e.clientX, e.clientY);
    e.preventDefault();
    return;
  }
  if (selCard && (e.target.closest('.slot[data-slot]') || e.target.closest('.pouch'))) {
    dragState = { src: selCard.src, wi: selCard.wi, si: selCard.si };
    const t = targetFromPoint(e.clientX, e.clientY);
    selCard = null;
    dropDrag(t);
    return;
  }
  if (selCard) { selCard = null; renderEditor(); }
});
document.addEventListener('pointermove', e => {
  if (dragState && ghostEl) {
    dragMoved = true;
    ghostEl.style.left = e.clientX + 'px'; ghostEl.style.top = e.clientY + 'px';
    const t = targetFromPoint(e.clientX, e.clientY);
    document.querySelectorAll('.slot,.pouch').forEach(n => n.classList.remove('drop'));
    if (t && t.kind === 'slot') {
      const n = document.querySelector(`.slot[data-slot="${t.wi}:${t.si}"]`) || document.querySelector(`.spell[data-src="slot"][data-w="${t.wi}"][data-s="${t.si}"]`);
      if (n) n.classList.add('drop');
    } else if (t && t.kind === 'pouch') {
      const n = document.querySelector('.pouch'); if (n) n.classList.add('drop');
    }
  }
});
document.addEventListener('pointerup', e => {
  if (!dragState) return;
  const t = targetFromPoint(e.clientX, e.clientY);
  const from = dragState;
  const sameSpot = t && ((t.kind === 'slot' && from.src === 'slot' && t.wi === from.wi && t.si === from.si) || (t.kind === 'pouch' && from.src === 'pouch'));
  if (ghostEl) { ghostEl.remove(); ghostEl = null; }
  if (!dragMoved && sameSpot) {   // 轻点 = 选中，等第二次点击放置
    dragState = null;
    selCard = from;
    renderEditor();
    const n = document.querySelector(`.spell[data-src="${from.src}"][data-w="${from.wi}"][data-s="${from.si}"]`);
    if (n) n.classList.add('sel');
    return;
  }
  dropDrag(t);
});
$('editor').addEventListener('click', e => {
  if (e.target.id === 'edShuffle') {
    const w = G.wands[G.current];
    if (w.shuffle) { shuffleDeck(w); renderEditor(); toast('已洗牌'); } else toast('这把魔杖是顺序序，不会洗牌');
  } else if (e.target.id === 'edAlways') {
    const el = document.querySelector('.spell.sel');
    if (!selCard) { toast('先点选一个法术卡'); return; }
    const c = cardAt(selCard.src, selCard.wi, selCard.si);
    const w = G.wands[selCard.wi >= 0 ? selCard.wi : G.current];
    if (c && w) { w.always = { id: c.id, uses: -1 }; toast(`常驻法术：${SPELLS[c.id].name}`); renderEditor(); }
  } else if (e.target.id === 'edClear') {
    G.wands.forEach(w => w.always = null); renderEditor();
  }
});
function selectCardForTest(src, wi, si) { selCard = { src, wi, si }; }

/* ================= 祝福三选一 ================= */
let perkPick = null;
function offerPerks(prop) {
  const pool = PERKS.filter(p => !G.perks[p.id]);
  const list = [];
  while (list.length < 3 && pool.length) list.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  while (list.length < 3) list.push(pick(PERKS));
  perkPick = { prop, list };
  $('perkPanel').innerHTML = `<div class="panel-title"><b>圣山祭坛 · 选择一项祝福</b><span>点击卡片或按 1 / 2 / 3</span></div>
    <div class="perk-grid">${list.map((p, i) => `<button class="perk" data-perk="${i}"><b>${i + 1}. ${p.name}</b><small>${p.desc}</small></button>`).join('')}</div>`;
  $('perkPanel').classList.remove('hide');
  sfx('perk');
}
function choosePerk(i) {
  if (!perkPick) return;
  const p = perkPick.list[i];
  if (!p) return;
  G.perks[p.id] = true;
  if (p.id === 'vigor') { G.player.maxHp += 50; G.player.hp = G.player.maxHp; }
  if (p.id === 'glass') { G.player.maxHp = Math.round(G.player.maxHp / 2); G.player.hp = Math.min(G.player.hp, G.player.maxHp); }
  if (perkPick.prop) perkPick.prop.used = true;
  toast('获得祝福：' + p.name);
  sfx('perk');
  perkPick = null;
  $('perkPanel').classList.add('hide');
}

/* ================= HUD ================= */
G.perks = G.perks || {}; G.wands = G.wands || []; G.pouch = G.pouch || [];
function toast(text, frames) {
  const el = $('toast');
  el.textContent = text; el.style.opacity = 1;
  toastT = frames || 110;
}
function tickToast() { if (toastT > 0) { if (--toastT === 0) $('toast').style.opacity = 0; } }
const STATUS_ICONS = [['fire', '火', '#ff9a4a'], ['wet', '湿', '#7ec6f5'], ['oily', '油', '#c8a25a'], ['toxic', '毒', '#9ad86a'], ['slimy', '黏', '#8fbb72'], ['chill', '冻', '#bfeaff'], ['bloody', '血', '#e0575f']];
function updateHud() {
  const P = G.player, w = G.wands[G.current] || G.wands.find(Boolean);
  if (!P || !w) return;
  $('hpFill').style.width = clamp(P.hp / P.maxHp, 0, 1) * 100 + '%';
  $('hpText').textContent = `${Math.max(0, Math.ceil(P.hp))}/${P.maxHp}`;
  $('manaFill').style.width = clamp(w.mana / w.manaMax, 0, 1) * 100 + '%';
  $('manaText').textContent = Math.floor(w.mana);
  $('levFill').style.width = clamp(P.lev / P.maxLev, 0, 1) * 100 + '%';
  $('gold').textContent = `${Math.floor(G.gold)} 金币`;
  $('flasks').textContent = `血瓶 ×${G.potions}`;
  $('depth').textContent = `${Math.floor(G.depth / 8)}m`;
  $('biome').textContent = biomeAt(P.y).name;
  let st = '';
  for (const [k, ic, col] of STATUS_ICONS) {
    const v = k === 'fire' ? P.fire : P[k];
    if (v > 0) st += `<span style="color:${col}" title="${k}">${ic}</span>`;
  }
  if (P.breath < 300) st += `<span style="color:#9adcff">气${Math.ceil(P.breath / 60)}</span>`;
  $('statusIcons').innerHTML = st;
  $('wandHud').innerHTML = G.wands.map((ww, i) => {
    if (!ww) return `<div class="wand-chip" style="opacity:.4"><b>${i + 1} · 空</b><span>——</span></div>`;
    const dots = ww.deck.map(c => c ? `<s class="${TYPE_CLASS[SPELLS[c.id].type].slice(2)}" title="${SPELLS[c.id].name}"></s>` : '<s></s>').join('');
    return `<div class="wand-chip ${i === G.current ? 'active' : ''}">
      <b>${i + 1} · ${ww.name}</b>
      <span>${ww.castTimer > 0 ? '施法冷却' : (ww.rechargeTimer > 0 ? '充能中 ' + Math.ceil(ww.rechargeTimer / 60) + 's' : '就绪')} · ${Math.floor(ww.mana)}/${ww.manaMax}</span>
      <div class="slotdots">${dots}</div>
      <div class="bar"><i style="width:${clamp(ww.mana / ww.manaMax, 0, 1) * 100}%"></i></div>
    </div>`;
  }).join('');
  // 材料提示（光标处）
  const mm = get(Math.round(pointer.wx), Math.round(pointer.wy));
  const tip = $('matTip');
  if (mm !== undefined) {
    const mp = MAT[mm];
    let extra = mp.flam ? ' · 可燃' : '';
    if (mp.dmg) extra += ' · 危险';
    tip.textContent = mp.n + extra;
    tip.style.display = 'block';
    tip.style.left = clamp(pointer.x / VW * cv.clientWidth + 14, 0, cv.clientWidth - 90) + 'px';
    tip.style.top = clamp(pointer.y / VH * cv.clientHeight + 10, 0, cv.clientHeight - 24) + 'px';
  }
  // 交互提示
  const np = nearestProp();
  if (np) {
    const label = { chest: '打开宝箱', stand: '拾取/交换法杖', flask: '拾取血瓶', shrine: '饮用圣泉', altar: '选择祝福', table: '打开魔杖工坊', sign: '阅读' }[np.type];
    if (label) toast('按 E：' + label, 30);
  }
  const boss = foes.find(e => e.type === 'embereye' && !e.dead);
  if (boss && Math.hypot(boss.x - P.x, boss.y - P.y) < 420) {
    $('bossBar').classList.remove('hide');
    $('bossFill').style.width = clamp(boss.hp / boss.max, 0, 1) * 100 + '%';
  } else $('bossBar').classList.add('hide');
}

/* ================= 音频（WebAudio 合成，无音频文件） ================= */
let audio = null, muted = false;
function ac() {
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  return audio;
}
function tone(f0, f1, dur, type, gain, delay) {
  const a = ac(); if (!a || muted) return;
  const o = a.createOscillator(), g = a.createGain();
  const t0 = a.currentTime + (delay || 0);
  o.type = type || 'square';
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(gain || .03, t0);
  g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t0); o.stop(t0 + dur + .02);
}
function noise(dur, gain, freq, delay) {
  const a = ac(); if (!a || muted) return;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
  const g = a.createGain(); g.gain.value = gain || .05;
  src.connect(f); f.connect(g); g.connect(a.destination);
  src.start(a.currentTime + (delay || 0));
}
function sfx(name) {
  if (muted) return;
  switch (name) {
    case 'cast': tone(520, 300, .07, 'square', .022); break;
    case 'pew': tone(880, 420, .06, 'triangle', .025); break;
    case 'hit': noise(.05, .03, 2600); tone(300, 140, .05, 'square', .015); break;
    case 'impact': noise(.03, .018, 1800); break;
    case 'boom': noise(.32, .09, 700); tone(110, 38, .3, 'sawtooth', .05); break;
    case 'hurt': tone(300, 110, .14, 'sawtooth', .035); break;
    case 'kill': noise(.12, .04, 900); tone(220, 80, .1, 'sawtooth', .02); break;
    case 'coin': tone(880, 1400, .07, 'sine', .03); break;
    case 'pickup': tone(620, 940, .08, 'sine', .03); break;
    case 'chest': [523, 659, 784].forEach((f, i) => tone(f, f * 1.01, .1, 'triangle', .03, i * .07)); break;
    case 'perk': [523, 659, 784, 1046].forEach((f, i) => tone(f, f, .16, 'sine', .028, i * .08)); break;
    case 'death': tone(220, 40, .9, 'sawtooth', .05); noise(.6, .04, 400); break;
    case 'zap': tone(1300, 180, .09, 'square', .03); break;
    case 'drill': tone(260, 200, .08, 'sawtooth', .018); break;
    case 'splat': noise(.09, .04, 500); break;
    case 'trig': tone(1200, 800, .05, 'sine', .03); break;
    case 'drink': noise(.18, .035, 320); tone(180, 90, .12, 'sine', .02, .05); break;
    case 'win': [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, f, .22, 'triangle', .03, i * .12)); break;
  }
}

/* ================= 输入 ================= */
const keyMap = { a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', w: 'jump', ' ': 'jump', arrowup: 'jump' };
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (keyMap[k]) { G.input[keyMap[k]] = true; e.preventDefault(); }
  if (perkPick && ['1', '2', '3'].includes(k)) { choosePerk(+k - 1); return; }
  if (k === 'e') { if (editing) closeEditor(); else interact(); }
  if (k === 'escape') { if (editing) closeEditor(); }
  if (k === 'q') drinkPotion();
  if (k === 'm') { muted = !muted; toast(muted ? '已静音' : '声音开启'); }
  if (['1', '2', '3', '4'].includes(k) && !perkPick && !editing) { G.current = +k - 1; sfx('pickup'); }
});
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (keyMap[k]) G.input[keyMap[k]] = false; });
window.addEventListener('blur', () => { G.input.left = G.input.right = G.input.jump = G.input.fire = false; pointer.down = false; });

function canvasPos(e) {
  const r = cv.getBoundingClientRect();
  return { x: clamp((e.clientX - r.left) / r.width * VW, 0, VW), y: clamp((e.clientY - r.top) / r.height * VH, 0, VH) };
}
cv.addEventListener('pointermove', e => {
  if (editing) return;
  const p = canvasPos(e);
  pointer.x = p.x; pointer.y = p.y;
  pointer.wx = pointer.x + camX; pointer.wy = pointer.y + camY;
  if (pointer.touch && e.pointerType === 'touch') pointer.down = true;
});
cv.addEventListener('pointerdown', e => {
  ac();
  if (editing || G.state !== 'play') return;
  const p = canvasPos(e);
  pointer.x = p.x; pointer.y = p.y;
  pointer.wx = pointer.x + camX; pointer.wy = pointer.y + camY;
  pointer.touch = e.pointerType === 'touch';
  pointer.down = true;
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener('pointerup', () => { pointer.down = false; });
cv.addEventListener('pointercancel', () => { pointer.down = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());

/* 触屏按钮 */
function bindBtn(id, key) {
  const b = $(id);
  if (!b) return;
  const on = e => { e.preventDefault(); ac(); G.input[key] = true; b.classList.add('on'); };
  const off = e => { e.preventDefault(); G.input[key] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on);
  b.addEventListener('pointerup', off);
  b.addEventListener('pointerleave', off);
  b.addEventListener('pointercancel', off);
}
bindBtn('tLeft', 'left'); bindBtn('tRight', 'right'); bindBtn('tUp', 'jump');
bindBtn('tFire', 'fire');
$('tUse').addEventListener('pointerdown', e => { e.preventDefault(); interact(); });
$('tDrink').addEventListener('pointerdown', e => { e.preventDefault(); drinkPotion(); });
$('tWand').addEventListener('pointerdown', e => { e.preventDefault(); G.current = (G.current + 1) % G.wands.length; sfx('pickup'); });

$('startBtn').addEventListener('click', () => { ac(); startRun(); });
$('restartBtn').addEventListener('click', () => { ac(); startRun(); });
$('winBtn').addEventListener('click', () => { ac(); startRun(); });
$('perkPanel').addEventListener('click', e => {
  const b = e.target.closest('[data-perk]');
  if (b) choosePerk(+b.dataset.perk);
});

/* ================= 主循环 ================= */
let lastStep = 0, fps = 60, fpsAcc = 0, fpsN = 0, lastBiome = -1;
function step() {
  frame++;
  pointer.wx = pointer.x + camX; pointer.wy = pointer.y + camY;
  updatePlayer();
  if ((pointer.down || G.input.fire) && !editing && !perkPick) castWand(G.wands[G.current]);
  simulate();
  updateFoes(); updateProjs(); updateParts(); updateDrops();
  // 镜头
  const P = G.player;
  const tx = clamp(P.x - VW / 2 + Math.cos(P.aimAng) * 14, 0, WW - VW);
  const ty = clamp(P.y - VH / 2 + Math.sin(P.aimAng) * 8, 0, WH - VH);
  camX = lerp(camX, tx, .12); camY = lerp(camY, ty, .12);
  shakeAmt *= .88; flashAmt *= .9;
  const bi = biomeIndexAt(P.y);
  if (bi !== lastBiome) {
    lastBiome = bi;
    const h = holyRooms.findIndex(r => P.y >= r.y0 && P.y < r.y1);
    if (h >= 0) toast('圣山 · 疝伤之泉 · 祝福祭坛 · 魔杖工坊（按 E）', 180);
    else if (P.y > SURF_H) toast('进入 ' + biomeAt(P.y).name, 150);
  }
  if (frame % 5 === 0) updateHud();
}
function loop(ts) {
  requestAnimationFrame(loop);
  if (G.state === 'play' && !editing && !perkPick) {
    if (hitstopT > 0) hitstopT--;
    else if (ts - lastStep > 14) { step(); }
  } else if (G.state === 'title') {
    // 标题界面：活的背景（缓慢运镜 + 像素模拟）
    frame++;
    if (frame % 2 === 0) simulate();
    camX = clamp(WW / 2 - VW / 2 + Math.sin(frame * .003) * 80, 0, WW - VW);
    camY = 180 + (Math.sin(frame * .0016) + 1) * 120;
    shakeAmt *= .9; flashAmt *= .9;
  } else {
    frame++; shakeAmt *= .9; flashAmt *= .9; updateParts();
  }
  const shx = (Math.random() - .5) * shakeAmt, shy = (Math.random() - .5) * shakeAmt;
  camX += shx; camY += shy;
  render();
  camX -= shx; camY -= shy;
  tickToast();
  fpsAcc += ts - (loop.last || ts); fpsN++; loop.last = ts;
  if (fpsAcc > 500) { fps = Math.round(1000 / (fpsAcc / fpsN)); fpsAcc = 0; fpsN = 0; }
  lastStep = ts;
}

/* ================= 开局 ================= */
function card(id) { return { id, uses: SPELLS[id].uses || -1 }; }
function startRun() {
  const urlSeed = new URLSearchParams(location.search).get('seed');
  const s = urlSeed ? (parseInt(urlSeed, 10) >>> 0) : ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  generateWorld(s);
  G.state = 'play'; G.gold = 0; G.kills = 0; G.depth = 0; G.potions = 1;
  G.perks = {}; G.deathCause = ''; G.seed = s;
  G.timeStart = performance.now(); G.timeEnd = 0;
  G.player = newPlayer();
  // 起始双杖（Noita 式：战斗 + 工具）
  const combat = rollWand(1, '旅人法杖');
  combat.castDelay = 12; combat.recharge = 40; combat.manaMax = 90; combat.manaCharge = 15;
  combat.capacity = 3; combat.perCast = 1; combat.spread = 3; combat.shuffle = false;
  combat.deck = [card('spark'), card('spark'), null];
  const tool = rollWand(1, '矿工法杖');
  tool.castDelay = 5; tool.recharge = 26; tool.manaMax = 70; tool.manaCharge = 12;
  tool.capacity = 2; tool.perCast = 1; tool.spread = 1; tool.shuffle = false;
  tool.deck = [card('lance'), card('waterjet')];
  G.wands = [combat, tool];
  while (G.wands.length < 4) G.wands.push(null);
  G.wands.forEach(w => { if (w) w.mana = w.manaMax; });   // 出生时魔力全满
  G.current = 0;
  G.pouch = [card('firetrail'), card('double'), card('arrow')];
  camX = clamp(G.player.x - VW / 2, 0, WW - VW);
  camY = clamp(G.player.y - VH / 2, 0, WH - VH);
  lastBiome = -1;
  $('title').classList.add('hide'); $('dead').classList.add('hide'); $('win').classList.add('hide');
  $('perkPanel').classList.add('hide'); closeEditor();
  updateHud();
  toast(`种子 ${s} · 向下探索：矿坑深巷 → 煤屑矿坑 → 荧光真菌窟 → 霜雪冰窟 → 熔岩深渊`, 220);
  sfx('chest');
}

/* ================= 测试钩子（无头浏览器验证用） ================= */
window.__game = {
  snapshot() {
    const P = G.player;
    return {
      state: G.state, seed: G.seed, x: Math.round(P.x), y: Math.round(P.y), hp: Math.round(P.hp),
      kills: G.kills, gold: Math.floor(G.gold), depth: Math.floor(G.depth / 8), cause: G.deathCause,
      foes: foes.filter(f => !f.dead).length, projs: projs.length, parts: parts.length,
      fps, frame, gold: Math.floor(G.gold), biome: biomeAt(P.y).name,
      cam: [Math.round(camX), Math.round(camY)], fx: +flashAmt.toFixed(2), sh: +shakeAmt.toFixed(2), hitstop: hitstopT,
      fire: P.fire > 0, dead: P.dead, wands: G.wands.filter(Boolean).map(w => ({ name: w.name, mana: Math.round(w.mana), cards: w.deck.filter(Boolean).map(c => c.id) })),
      pouch: G.pouch.map(c => c.id), editing, perks: Object.keys(G.perks)
    };
  },
  start: startRun,
  cast: () => castWand(G.wands[G.current]),
  hurt: (d, c) => hurtPlayer(d, c || 'killed', '测试'),
  setHp: v => { G.player.hp = v; },
  setStatus: (k, v) => { G.player[k] = v; },
  placeNearFoe(type) {
    const e = foes.find(f => !f.dead && f.type !== 'embereye' && (!type || f.type === type));
    if (!e) return null;
    for (let r = 16; r <= 40; r += 4) {
      for (const s of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const x = e.x + s[0] * r, y = e.y + s[1] * r;
        if (canDisplace(get(x, y)) && canDisplace(get(x + 1, y)) && canDisplace(get(x, y - 1))) {
          G.player.x = x; G.player.y = y; G.player.vx = G.player.vy = 0;
          return { x: Math.round(e.x), y: Math.round(e.y), type: e.type };
        }
      }
    }
    G.player.x = e.x; G.player.y = e.y - 16;
    return { x: Math.round(e.x), y: Math.round(e.y), type: e.type };
  },
  killAll: () => foes.slice().forEach(e => { if (e.type !== 'embereye') killFoe(e); }),
  hurtNearest: (d) => { const e = nearestFoe(G.player.x, G.player.y); if (e) hurtFoe(e, d, 'player'); return !!e; },
  teleport: (x, y) => { G.player.x = x; G.player.y = y; },
  openEditor, drinkPotion, interact,
  giveSpell: id => { G.pouch.push(card(id)); },
  foeList: () => foes.filter(f => !f.dead).map(f => ({ type: f.type, x: Math.round(f.x), y: Math.round(f.y), hp: Math.round(f.hp) })),
  spawnFoeAt: (type, dx, dy) => { const P = G.player; spawnFoe(type, P.x + (dx || 12), P.y + (dy || 0)); return foes.length; },
  wandSlots: () => G.wands.filter(Boolean).map(w => w.deck.map(c => c ? c.id : null)),
  lightAt: (x, y) => Array.from(lctx.getImageData(x | 0, y | 0, 1, 1).data),
  screenAt: (x, y) => Array.from(ctx.getImageData(x | 0, y | 0, 1, 1).data),
  lightCount: () => lights.length,
  digProbe: (x, y, rad, pow) => {
    const count = () => { let n = 0; for (let yy = -rad; yy <= rad; yy++) for (let xx = -rad; xx <= rad; xx++) if (!isAir(get(x + xx, y + yy))) n++; return n; };
    const before = count();
    dig(x, y, rad, pow, true);
    return { before, after: count() };
  },
  fireProbe: (ang, speed) => { spawnProj({ owner: 'player', x: G.player.x, y: G.player.y, ang, speed, dmg: 5, life: 40, color: '#fff', size: 2, dig: 11, beam: 1 }); return projs.length; },
  projList: () => projs.map(p => ({ x: Math.round(p.x), y: Math.round(p.y), dig: p.dig, life: p.life, beam: p.beam })),
  lightList: () => lights.map(L => ({ x: Math.round(L.x), y: Math.round(L.y), r: Math.round(L.r), s: !!L.shadow, t: !!L.temp })),
  bench: () => {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) simulate();
    const t1 = performance.now();
    for (let i = 0; i < 10; i++) render();
    const t2 = performance.now();
    return { simMs: +((t1 - t0) / 10).toFixed(2), renderMs: +((t2 - t1) / 10).toFixed(2), simCells: simStats.cells };
  },
  matAt: (x, y) => MAT[get(x, y)].n,
  setMat: (x, y, m) => setM(x, y, M[m]),
  simCount: () => simStats.cells
};

/* ================= 启动 ================= */
generateWorld((Date.now() ^ 0x9e3779b9) >>> 0);
G.player = newPlayer();
G.wands = [rollWand(1, '旅人法杖'), rollWand(1, '矿工法杖')];
G.wands.forEach(w => fillWand(w, 2));
G.state = 'title';
$('seedHint').textContent = '提示：可以加 ?seed=12345 固定种子复现同一局。';
requestAnimationFrame(loop);
