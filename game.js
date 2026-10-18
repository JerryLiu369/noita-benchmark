/* ============================================================================
   深岩秘术 / DEEPROCK ARCANA
   A zero-backend, original pixel-simulation roguelite built for the browser.
   Everything below is hand-written: materials, cellular automaton, lighting,
   wand compiler, creatures, audio synthesis and UI. No assets, no packages.
   ========================================================================== */
'use strict';

/* ---------------------------------------------------------------------------
   0. CONSTANTS
   ------------------------------------------------------------------------- */
const VW = 480, VH = 270, W = 720, H = 2960;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

const SURFACE_Y = 84;
const HOLY_BANDS = [
  { y0: 510, y1: 582, n: 1 },
  { y0: 968, y1: 1040, n: 2 },
  { y0: 1414, y1: 1486, n: 3 },
  { y0: 1860, y1: 1932, n: 4 },
  { y0: 2306, y1: 2378, n: 5 }
];
const BIOMES = [
  { key: 'woods', name: '苔语林', en: 'MOSSVEIL WOODS', sub: '潮湿的树根与旧石阶', y0: 0, y1: 108,
    rock: ['#42382c', '#4a3e30', '#362e25'], accent: '#7e9450', dark: 0.06, hazard: 'mild' },
  { key: 'mines', name: '旧铜矿坑', en: 'THE OLD COPPER MINE', sub: '木梁、铜脉与积水的竖井', y0: 108, y1: 510,
    rock: ['#4a3a2a', '#55422f', '#3c2f23'], accent: '#c08a45', dark: 0.7, hazard: 'water' },
  { key: 'coal', name: '焦煤深坑', en: 'CINDER PITS', sub: '煤层自燃，空气灼热', y0: 582, y1: 968,
    rock: ['#2c292b', '#353033', '#232022'], accent: '#c56536', dark: 0.78, hazard: 'fire' },
  { key: 'fungal', name: '菌光洞窟', en: 'GLOWCAP HOLLOW', sub: '发光的孢子与紫色的湿土', y0: 1040, y1: 1414,
    rock: ['#3d3043', '#49384f', '#302634'], accent: '#bd72c7', dark: 0.74, hazard: 'toxic' },
  { key: 'snow', name: '霜喉裂谷', en: 'FROSTTHROAT RIFT', sub: '冰层下传来风的低鸣', y0: 1486, y1: 1860,
    rock: ['#3a4652', '#46545f', '#2e3944'], accent: '#a5d7e8', dark: 0.72, hazard: 'cold' },
  { key: 'foundry', name: '锈铁堡垒', en: 'RUSTHOLD', sub: '废弃的机械仍在缓慢运转', y0: 1932, y1: 2306,
    rock: ['#3e3832', '#4a4238', '#332e2a'], accent: '#d1844f', dark: 0.78, hazard: 'fire' },
  { key: 'ember', name: '熔心祭坛', en: 'THE EMBER HEART', sub: '岩层在这里融化', y0: 2378, y1: 2760,
    rock: ['#2b2230', '#352738', '#211a26'], accent: '#f0713f', dark: 0.8, hazard: 'lava' },
  { key: 'boss', name: '熔心之底', en: 'THE HEART BELOW', sub: '某种巨大的东西正在呼吸', y0: 2760, y1: 2960,
    rock: ['#241c2b', '#2d2133', '#1b1521'], accent: '#f8a45c', dark: 0.84, hazard: 'boss' }
];

/* ---------------------------------------------------------------------------
   1. MATERIALS
   category: 0 air, 1 solid, 2 powder, 3 liquid, 4 gas, 5 fire
   ------------------------------------------------------------------------- */
const M = {
  AIR: 0, ROCK: 1, DIRT: 2, SAND: 3, COAL: 4, GOLD: 5, WOOD: 6, BRICK: 7,
  STEEL: 8, RUST: 9, SNOW: 10, ICE: 11, FROST: 12, MOSS: 13, FUNGUS: 14,
  GLOWCAP: 15, OBSIDIAN: 16, DENSE: 17, HOLY: 18, CRYSTAL: 19, ASH: 20,
  GUNPOWDER: 21, GOLDPOWDER: 22, BONE: 23,
  WATER: 30, OIL: 31, BLOOD: 32, ACID: 33, LAVA: 34, TOXIC: 35,
  STEAM: 40, SMOKE: 41, POISON: 42, FIRE: 43
};

function defMat(id, key, name, cat, o) {
  return Object.assign({
    id, key, name, cat, density: 1, flam: 0, burn: 0, hard: 8, acidRes: 0,
    glow: 0, cols: ['#555'], melt: 0, dmg: null, spread: 0
  }, o);
}
const MATS = [];
MATS[M.AIR] = defMat(M.AIR, 'air', '空气', 0, { cols: ['#000000'] });
MATS[M.ROCK] = defMat(M.ROCK, 'rock', '岩', 1, { hard: 12, acidRes: .1, cols: ['#40362b', '#473b2f', '#372f26', '#4d4033', '#2f2821'] });
MATS[M.DIRT] = defMat(M.DIRT, 'dirt', '土', 1, { hard: 9, acidRes: .02, cols: ['#54402e', '#5c4733', '#493726', '#634c36', '#403124'] });
MATS[M.SAND] = defMat(M.SAND, 'sand', '砂', 2, { hard: 4, density: 1500, cols: ['#8b7449', '#947c50', '#806a42', '#9c8558', '#75603b'] });
MATS[M.COAL] = defMat(M.COAL, 'coal', '煤', 1, { hard: 8, flam: .18, burn: 240, cols: ['#28262a', '#302d31', '#201f22', '#373338', '#181719'] });
MATS[M.GOLD] = defMat(M.GOLD, 'gold', '金矿', 1, { hard: 10, acidRes: .2, glow: .08, cols: ['#5a482c', '#665232', '#4d3d24', '#b08a3d', '#8a6c31'] });
MATS[M.WOOD] = defMat(M.WOOD, 'wood', '木', 1, { hard: 7, flam: .52, burn: 74, cols: ['#6b4a2b', '#755230', '#5c3f24', '#7f5a35', '#4f361f'] });
MATS[M.BRICK] = defMat(M.BRICK, 'brick', '砖', 1, { hard: 14, acidRes: .25, cols: ['#5a4b3e', '#625245', '#514337', '#6a5948', '#473a30'] });
MATS[M.STEEL] = defMat(M.STEEL, 'steel', '钢', 1, { hard: 15, acidRes: .72, cols: ['#596067', '#636a71', '#4e555c', '#6d747b', '#444a50'] });
MATS[M.RUST] = defMat(M.RUST, 'rust', '锈铁', 1, { hard: 11, acidRes: .35, cols: ['#6b4632', '#754e37', '#5d3d2c', '#805841', '#503426'] });
MATS[M.SNOW] = defMat(M.SNOW, 'snow', '雪', 2, { hard: 2, density: 420, melt: 1, cols: ['#c5d2da', '#d0dce2', '#b8c7d1', '#dae4e9', '#aabac5'] });
MATS[M.ICE] = defMat(M.ICE, 'ice', '冰', 1, { hard: 5, acidRes: .05, cols: ['#8ab7cb', '#96c3d4', '#7ba8bd', '#a6d0de', '#6d97ac'] });
MATS[M.FROST] = defMat(M.FROST, 'frost', '冻岩', 1, { hard: 12, acidRes: .12, cols: ['#4a5a66', '#52636f', '#414f5a', '#5b6c77', '#384550'] });
MATS[M.MOSS] = defMat(M.MOSS, 'moss', '苔', 1, { hard: 5, flam: .3, burn: 36, cols: ['#4c6339', '#556d40', '#435932', '#5f7747', '#394c2c'] });
MATS[M.FUNGUS] = defMat(M.FUNGUS, 'fungus', '菌肉', 1, { hard: 7, flam: .26, burn: 50, cols: ['#60496a', '#6b5276', '#553f5f', '#755b80', '#493650'] });
MATS[M.GLOWCAP] = defMat(M.GLOWCAP, 'glowcap', '荧光菇', 1, { hard: 5, flam: .15, glow: 1, cols: ['#b56fd0', '#c887dd', '#a35ec0', '#dda5ea', '#8d4ba9'] });
MATS[M.OBSIDIAN] = defMat(M.OBSIDIAN, 'obsidian', '黑曜岩', 1, { hard: 17, acidRes: .55, cols: ['#262130', '#2f2839', '#1f1b28', '#373041', '#18141f'] });
MATS[M.DENSE] = defMat(M.DENSE, 'dense', '密岩', 1, { hard: 22, acidRes: .85, cols: ['#302c31', '#373238', '#29252a', '#3e383f', '#211e23'] });
MATS[M.HOLY] = defMat(M.HOLY, 'holy', '圣砖', 1, { hard: 999, acidRes: 1, glow: .12, cols: ['#8a7650', '#957f57', '#7e6b48', '#a38c60', '#6e5d3f'] });
MATS[M.CRYSTAL] = defMat(M.CRYSTAL, 'crystal', '晶簇', 1, { hard: 11, glow: .9, acidRes: .4, cols: ['#78c7d3', '#8fdde6', '#64b1c0', '#acecf2', '#4f99aa'] });
MATS[M.ASH] = defMat(M.ASH, 'ash', '灰', 2, { hard: 2, density: 700, cols: ['#5a5651', '#635e58', '#504c48', '#6d6760', '#46423f'] });
MATS[M.GUNPOWDER] = defMat(M.GUNPOWDER, 'gunpowder', '火药', 2, { hard: 3, density: 980, flam: .95, burn: 10, cols: ['#3b3733', '#45403b', '#332f2c', '#4e4842', '#2a2724'] });
MATS[M.GOLDPOWDER] = defMat(M.GOLDPOWDER, 'goldpowder', '金砂', 2, { hard: 2, density: 1900, glow: .15, cols: ['#b38c3e', '#c39a45', '#a17d36', '#d1a94e', '#8e6d2e'] });
MATS[M.BONE] = defMat(M.BONE, 'bone', '骨', 1, { hard: 6, cols: ['#a89d82', '#b5aa8e', '#998f77', '#c1b69a', '#8b826c'] });
MATS[M.WATER] = defMat(M.WATER, 'water', '水', 3, { density: 1000, dmg: 'drown', cols: ['#356d8c', '#3b7899', '#2f637f', '#4384a5', '#29576f'], acidRes: .2 });
MATS[M.OIL] = defMat(M.OIL, 'oil', '油', 3, { density: 760, flam: .8, burn: 42, cols: ['#2b241e', '#332a22', '#251f1a', '#3b3026', '#1e1915'] });
MATS[M.BLOOD] = defMat(M.BLOOD, 'blood', '血', 3, { density: 1060, cols: ['#6f1e27', '#7c242d', '#631a22', '#892d35', '#55151d'] });
MATS[M.ACID] = defMat(M.ACID, 'acid', '酸液', 3, { density: 1180, dmg: 'acid', glow: .25, cols: ['#79a83a', '#86b742', '#6b9932', '#93c74c', '#5e872b'] });
MATS[M.LAVA] = defMat(M.LAVA, 'lava', '熔岩', 3, { density: 1500, dmg: 'lava', glow: 1, cols: ['#d85f22', '#ea7328', '#c44f1b', '#f58a38', '#a83f14'] });
MATS[M.TOXIC] = defMat(M.TOXIC, 'toxic', '毒泥', 3, { density: 1140, dmg: 'toxic', glow: .18, cols: ['#637d2c', '#6e8a33', '#587128', '#7b9a3d', '#4b6122'] });
MATS[M.STEAM] = defMat(M.STEAM, 'steam', '蒸汽', 4, { cols: ['#aebfc7', '#bccbd1', '#9fb2bb', '#cad7dc', '#8ea3ad'] });
MATS[M.SMOKE] = defMat(M.SMOKE, 'smoke', '烟', 4, { cols: ['#514c4c', '#5c5656', '#464243', '#676060', '#3d393a'] });
MATS[M.POISON] = defMat(M.POISON, 'poison', '毒气', 4, { dmg: 'poison', cols: ['#71883e', '#7d9546', '#657a37', '#8aa24f', '#586b2f'] });
MATS[M.FIRE] = defMat(M.FIRE, 'fire', '火', 5, { flam: 0, glow: 1, cols: ['#ffb33e', '#ff8b29', '#ffd15d', '#f4661e', '#ffe28a'] });
const MAT_COUNT = 44;
const SOLID_CAT = new Uint8Array(MAT_COUNT);
const POWDER_CAT = new Uint8Array(MAT_COUNT);
const LIQUID_CAT = new Uint8Array(MAT_COUNT);
const GAS_CAT = new Uint8Array(MAT_COUNT);
const MAT_COLS = [];
const MAT_DENS = new Float32Array(MAT_COUNT);
const MAT_HARD = new Float32Array(MAT_COUNT);
const MAT_FLAM = new Float32Array(MAT_COUNT);
const MAT_BURN = new Float32Array(MAT_COUNT);
const MAT_GLOW = new Float32Array(MAT_COUNT);
const MAT_ACID = new Float32Array(MAT_COUNT);
for (let i = 0; i < MATS.length; i++) {
  const m = MATS[i]; if (!m) continue;
  if (m.cat === 1) SOLID_CAT[i] = 1;
  if (m.cat === 2) { POWDER_CAT[i] = 1; SOLID_CAT[i] = 1; }
  if (m.cat === 3) LIQUID_CAT[i] = 1;
  if (m.cat === 4) GAS_CAT[i] = 1;
  MAT_COLS[i] = m.cols.map(hexToRgb);
  MAT_DENS[i] = m.density; MAT_HARD[i] = m.hard;
  MAT_FLAM[i] = m.flam; MAT_BURN[i] = m.burn;
  MAT_GLOW[i] = m.glow; MAT_ACID[i] = m.acidRes;
}

/* ---------------------------------------------------------------------------
   2. SPELLS / MODIFIERS / PERKS
   ------------------------------------------------------------------------- */
const SPELLS = {
  spark: {
    id: 'spark', name: '火花弹', en: 'SPARK BOLT', glyph: '✦', color: '#ffe58a', type: 'proj',
    cost: 4, delay: 3, dmg: 9, speed: 5.4, life: 76, radius: 2, glow: .75, spread: .02,
    desc: '廉价而明亮的魔法火花，会短暂照亮洞穴。'
  },
  arcane: {
    id: 'arcane', name: '秘法箭', en: 'ARCANE ARROW', glyph: '➤', color: '#a4dcff', type: 'proj',
    cost: 8, delay: 6, dmg: 19, speed: 7.2, life: 58, radius: 2, glow: .5, spread: .01,
    desc: '笔直、迅捷、可靠的奥术箭矢。'
  },
  fireball: {
    id: 'fireball', name: '炎团', en: 'EMBER ORB', glyph: '❂', color: '#ff9a4d', type: 'proj',
    cost: 18, delay: 18, dmg: 28, speed: 3.7, gravity: .02, life: 120, radius: 3, glow: 1, spread: .03,
    explode: 14, element: 'fire', desc: '命中后炸开，点燃木头、油与煤。'
  },
  spore: {
    id: 'spore', name: '孢囊弹', en: 'SPORE POD', glyph: '✹', color: '#b9dd6a', type: 'proj',
    cost: 7, delay: 7, dmg: 10, speed: 4.1, gravity: .13, life: 95, radius: 2, glow: .3, spread: .04,
    explode: 7, element: 'toxic', desc: '沿抛物线飞出，破裂后留下一团毒气。'
  },
  frost: {
    id: 'frost', name: '霜锥', en: 'FROST SHARD', glyph: '❅', color: '#a8e6ff', type: 'proj',
    cost: 9, delay: 7, dmg: 15, speed: 7.8, life: 54, radius: 2, glow: .6, spread: .02,
    element: 'ice', desc: '冻结命中的生物，也会冻住水面。'
  },
  lightning: {
    id: 'lightning', name: '雷弧', en: 'ARC BOLT', glyph: '⚡', color: '#d8f4ff', type: 'proj',
    cost: 22, delay: 16, dmg: 33, speed: 12, life: 32, radius: 2, glow: 1, spread: .01,
    chain: 3, element: 'electric', desc: '速度极快，在邻近敌人之间跳跃。'
  },
  drill: {
    id: 'drill', name: '光钻', en: 'LUMEN DRILL', glyph: '✧', color: '#f2fbff', type: 'proj',
    cost: 10, delay: 5, dmg: 7, speed: 0, life: 13, radius: 2, glow: 1, beam: 64, dig: 11,
    desc: '短程光束，能切开大部分岩层。'
  },
  bomb: {
    id: 'bomb', name: '不稳定炸药', en: 'UNSTABLE CHARGE', glyph: '●', color: '#e8c46b', type: 'proj',
    cost: 25, delay: 32, dmg: 58, speed: 2.7, gravity: .16, life: 150, radius: 3, glow: .35,
    explode: 27, element: 'explosion', fuse: 105, desc: '扔出一枚会滚动的炸药，爆炸能挖开岩层。'
  },
  acidball: {
    id: 'acidball', name: '酸液球', en: 'ACID ORB', glyph: '◉', color: '#b7e05f', type: 'proj',
    cost: 13, delay: 11, dmg: 12, speed: 4.5, gravity: .05, life: 100, radius: 2, glow: .5,
    explode: 9, element: 'acid', desc: '破裂时溅出腐蚀性酸液。'
  },
  waterjet: {
    id: 'waterjet', name: '泉涌', en: 'SPRING BOLT', glyph: '◌', color: '#7fc7e8', type: 'proj',
    cost: 3, delay: 4, dmg: 1, speed: 5.5, gravity: .04, life: 50, radius: 2, glow: .2,
    element: 'water', desc: '喷出水流，可以灭火、导电，也能把人浇湿。'
  },
  spark_trigger: {
    id: 'spark_trigger', name: '火花·触发', en: 'SPARK WITH TRIGGER', glyph: '✦↯', color: '#ffe58a', type: 'trigger',
    cost: 10, delay: 5, dmg: 7, speed: 5.2, life: 76, radius: 2, glow: .75, spread: .02,
    trigger: 'hit', payload: 1, desc: '命中地形或敌人时，施放下一枚法术。'
  },
  arcane_timer: {
    id: 'arcane_timer', name: '秘法箭·延时', en: 'ARCANE ARROW WITH TIMER', glyph: '➤⏱', color: '#a4dcff', type: 'trigger',
    cost: 14, delay: 8, dmg: 13, speed: 6.2, life: 80, radius: 2, glow: .5, spread: .01,
    trigger: 'timer', timer: 34, payload: 1, desc: '飞行片刻后，在原地施放下一枚法术。'
  },
  homing: {
    id: 'homing', name: '追踪', en: 'HOMING', glyph: '◈', color: '#dc92ff', type: 'mod',
    cost: 6, delay: 1, desc: '投射物缓慢转向最近的敌人。'
  },
  heavy: {
    id: 'heavy', name: '重型弹', en: 'HEAVY SHOT', glyph: '✚', color: '#ffb36b', type: 'mod',
    cost: 6, delay: 4, desc: '伤害 +70%，速度 -20%，爆炸范围略微增加。'
  },
  haste: {
    id: 'haste', name: '疾速', en: 'HASTE', glyph: '»', color: '#8ff0d0', type: 'mod',
    cost: 3, delay: 0, desc: '速度 +55%，伤害 -12%。'
  },
  firetrail: {
    id: 'firetrail', name: '火焰尾迹', en: 'FIRE TRAIL', glyph: '≈', color: '#ff8a45', type: 'mod',
    cost: 5, delay: 2, desc: '飞行途中留下燃烧的尾迹。'
  },
  explosive: {
    id: 'explosive', name: '爆裂增幅', en: 'EXPLOSIVE', glyph: '✸', color: '#ff9955', type: 'mod',
    cost: 9, delay: 3, desc: '命中时产生额外爆炸，并增强挖掘力。'
  },
  bounce: {
    id: 'bounce', name: '弹射', en: 'BOUNCE', glyph: '↺', color: '#86e9b2', type: 'mod',
    cost: 4, delay: 1, desc: '撞到地形后反弹，最多三次。'
  },
  pierce: {
    id: 'pierce', name: '穿透', en: 'PIERCING', glyph: '⇢', color: '#f2e08a', type: 'mod',
    cost: 8, delay: 2, desc: '穿过敌人而不会消失，可反复命中。'
  },
  scatter: {
    id: 'scatter', name: '散射', en: 'SCATTER', glyph: '⋔', color: '#ffcf7a', type: 'mod',
    cost: 7, delay: 2, desc: '额外发射两枚带角度的投射物。'
  },
  multicast: {
    id: 'multicast', name: '三重施法', en: 'TRIPLE CAST', glyph: '⋮', color: '#c9a8ff', type: 'mod',
    cost: 9, delay: 3, desc: '本次施法额外带出两枚法术。'
  },
  efficiency: {
    id: 'efficiency', name: '节能', en: 'MANA SAVER', glyph: '◇', color: '#8de6ff', type: 'mod',
    cost: -3, delay: 0, desc: '整次施法的法力消耗降低 35%。'
  },
  longlife: {
    id: 'longlife', name: '延寿', en: 'LONG LIFE', glyph: '∞', color: '#b8d9c4', type: 'mod',
    cost: 3, delay: 0, desc: '投射物寿命 +70%。'
  }
};

const PERK_DEFS = [
  { id: 'stone', name: '石肤', glyph: '▣', color: '#b9b4a4', desc: '受到的所有伤害降低 25%。' },
  { id: 'glass', name: '玻璃之怒', glyph: '◆', color: '#ffc46b', desc: '法术伤害 +65%，但最大生命 -25%。' },
  { id: 'fireblood', name: '焰血', glyph: '✹', color: '#ff7b45', desc: '免疫燃烧状态，熔岩伤害减半。' },
  { id: 'toxicblood', name: '毒血', glyph: '☣', color: '#b9df6d', desc: '免疫毒素与毒气，酸液伤害减半。' },
  { id: 'feather', name: '羽落', glyph: '❧', color: '#b7e4e9', desc: '完全免疫坠落伤害，下落更慢。' },
  { id: 'tinker', name: '游方匠', glyph: '⚒', color: '#e7c478', desc: '可以在任何地方编辑魔杖。' },
  { id: 'greed', name: '贪欲', glyph: '◈', color: '#f4cf58', desc: '拾取的金币翻倍。' },
  { id: 'crit', name: '血契', glyph: '✦', color: '#ef7f8a', desc: '暴击率 +18%，暴击造成三倍伤害。' },
  { id: 'levitation', name: '浮空核', glyph: '⌁', color: '#d8c470', desc: '悬浮燃料上限 +80%，回复更快。' },
  { id: 'regen', name: '再生', glyph: '✚', color: '#7fdb98', desc: '每秒缓慢恢复生命。' },
  { id: 'blast', name: '爆免', glyph: '✷', color: '#ffae7a', desc: '受到的爆炸伤害降低 70%。' },
  { id: 'magnet', name: '磁吸', glyph: '◎', color: '#eadb93', desc: '金币与掉落物的吸附范围大幅增加。' },
  { id: 'vampire', name: '食髓', glyph: '♨', color: '#c95a68', desc: '每次击杀恢复 3 点生命。' },
  { id: 'swift', name: '疾行', glyph: '⇉', color: '#9fe3d0', desc: '移动速度 +18%。' },
  { id: 'ward', name: '残响护盾', glyph: '❖', color: '#9fc7ff', desc: '每层圣所获得一次抵挡致命伤的机会。' }
];

/* Wand names */
const WAND_NAMES = ['学徒短杖', '掘进短杖', '铜环杖', '灰烬枝', '裂纹长杖', '矿工节杖', '苔纹杖', '焦木杖', '锈钉杖', '霜骨杖'];
const WAND_ADJ = ['轻巧的', '滚烫的', '潮湿的', '不祥的', '虫蛀的', '镶铜的', '歪斜的', '沉重的'];

/* ---------------------------------------------------------------------------
   3. GLOBAL STATE
   ------------------------------------------------------------------------- */
let seed = 1, rng = Math.random, frame = 0, gameState = 'title';
let world, player, enemies = [], projectiles = [], particles = [], pickups = [], beams = [];
let wands = [], currentWand = 0, inventory = [], perksOwned = [], perkChoices = [];
let camX = 0, camY = 0, camShake = 0, shakeX = 0, shakeY = 0;
let run = { gold: 0, kills: 0, depth: 0, time: 0, start: 0, cause: '', detail: '', boss: false };
let pointer = { x: 240, y: 135, wx: 360, wy: 150, down: false, active: false, world: false };
let keys = {}, editMode = false, editorState = null, toastTimer = 0, bannerTimer = 0;
let interactTarget = null, lastFrameTime = 0, accumulator = 0, slowFrames = 0;
let muted = false, bestRun = null, mapSeen = false, bossSpawned = false;
let transition = 0, transitionDir = 0, pendingTeleport = null;
let ambientTimer = 0, audioEngine = null;
const $ = id => document.getElementById(id);
const UI = {};

/* ---------------------------------------------------------------------------
   4. SMALL UTILITIES
   ------------------------------------------------------------------------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rint(a, b) { return Math.floor(rng() * (b - a + 1)) + a; }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
function dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }
function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
function fmtTime(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbStr(c, a = 1) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function makeRng(s) {
  let t = s >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), 1 | x);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, s) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, s, oct = 3) {
  let val = 0, amp = .5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) { val += vnoise(x * f, y * f, s + i * 17) * amp; tot += amp; amp *= .5; f *= 2.03; }
  return val / tot;
}
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function hexA(hex, a) { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

/* ---------------------------------------------------------------------------
   5. WORLD ACCESS
   ------------------------------------------------------------------------- */
function idx(x, y) { return y * W + x; }
function inside(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }
function get(x, y) {
  x |= 0; y |= 0;
  if (x < 0 || x >= W || y < 0 || y >= H) return M.DENSE;
  return world.cells[y * W + x];
}
function getBg(x, y) {
  x |= 0; y |= 0;
  if (x < 0 || x >= W || y < 0 || y >= H) return 0;
  return world.bg[y * W + x];
}
function setm(x, y, m, keepLife) {
  x |= 0; y |= 0;
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = y * W + x;
  world.cells[i] = m;
  if (!keepLife) world.life[i] = m === M.FIRE ? 90 : 0;
}
function isBlocking(m) { return SOLID_CAT[m] === 1; }
function isLiquid(m) { return LIQUID_CAT[m] === 1; }
function isGas(m) { return GAS_CAT[m] === 1; }
function isFree(m) { return m === M.AIR || GAS_CAT[m] === 1; }
function solidAtRect(cx, cy, w, h) {
  const l = Math.floor(cx - w / 2), r = Math.floor(cx + w / 2 - .001);
  const t = Math.floor(cy - h / 2), b = Math.floor(cy + h / 2 - .001);
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) {
    const m = get(x, y);
    if (SOLID_CAT[m] === 1) return true;
  }
  return false;
}
function solidCountAtRect(cx, cy, w, h) {
  const l = Math.floor(cx - w / 2), r = Math.floor(cx + w / 2 - .001);
  const t = Math.floor(cy - h / 2), b = Math.floor(cy + h / 2 - .001);
  let n = 0;
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) if (SOLID_CAT[get(x, y)] === 1) n++;
  return n;
}
function liquidAt(cx, cy, w, h) {
  const l = Math.floor(cx - w / 2), r = Math.floor(cx + w / 2 - .001);
  const t = Math.floor(cy - h / 2), b = Math.floor(cy + h / 2 - .001);
  let found = 0, deep = 0;
  for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) {
    const m = get(x, y);
    if (LIQUID_CAT[m] === 1) { found++; if (m !== M.WATER) deep++; }
  }
  return { count: found, total: (r - l + 1) * (b - t + 1), other: deep };
}
function biomeAt(y) {
  for (const b of BIOMES) if (y >= b.y0 && y < b.y1) return b;
  return BIOMES[BIOMES.length - 1];
}
function holyRoomAt(y, x) {
  for (const h of world.holy) {
    if (y >= h.y0 && y <= h.y1 && x >= h.x0 && x <= h.x1) return h;
  }
  return null;
}
function currentZone() {
  if (!player) return BIOMES[0];
  const h = holyRoomAt(player.y, player.x);
  if (h) return h;
  return biomeAt(player.y);
}
function zoneName() {
  const z = currentZone();
  if (z.holy) return z.holy ? '灰烬圣所' : z.name;
  return z.name;
}

/* ---------------------------------------------------------------------------
   6. WORLD GENERATION
   ------------------------------------------------------------------------- */
function generateWorld(sd) {
  rng = makeRng(sd);
  const cells = new Uint8Array(W * H);
  const bg = new Uint8Array(W * H);
  const life = new Uint8Array(W * H);
  const holyRooms = [];
  const torches = [];
  const total = W * H;
  const wseed = (sd ^ 0x9e3779b9) >>> 0;

  // Base: everything below the undulating surface is solid mountain.
  for (let x = 0; x < W; x++) {
    const edge = x < 7 || x >= W - 7;
    const hill = Math.sin(x * .021) * 5 + Math.sin(x * .053 + 2) * 2.2 + Math.sin(x * .008 + 1) * 5;
    const surf = Math.round(SURFACE_Y + hill);
    for (let y = 0; y < H; y++) {
      const i = y * W + x;
      if (y < surf) { cells[i] = M.AIR; bg[i] = 0; continue; }
      bg[i] = 1;
      if (edge) { cells[i] = M.DENSE; continue; }
      // cave shape from two noise fields + occasional broad rooms
      const n1 = fbm(x * .022, y * .028, wseed, 3);
      const n2 = fbm(x * .061, y * .072, wseed + 71, 2);
      let cave = n1 * .72 + n2 * .28;
      let threshold = .545;
      if (y < surf + 9) threshold = .86;
      // large caverns
      const cavern = fbm(x * .007 + 8, y * .011, wseed + 201, 2);
      if (cavern > .615) threshold += .055;
      const solid = cave < threshold;
      if (!solid) { cells[i] = M.AIR; continue; }
      const b = biomeAt(y);
      cells[i] = solidMaterial(b, x, y, surf, wseed);
    }
    // surface skin
    for (let y = surf; y < Math.min(H, surf + 13); y++) {
      const i = y * W + x;
      if (cells[i] !== M.AIR) {
        if (y === surf) cells[i] = M.MOSS;
        else if (y < surf + 6) cells[i] = M.DIRT;
      }
    }
  }

  // Dense separators around the holy bands
  for (const band of HOLY_BANDS) {
    for (let y = band.y0; y < band.y1; y++) {
      for (let x = 0; x < W; x++) {
        cells[y * W + x] = M.DENSE;
        bg[y * W + x] = 1;
      }
    }
  }

  // Main winding route through every biome (guarantees traversal).
  const route = [];
  for (let bi = 1; bi < BIOMES.length; bi++) {
    const b = BIOMES[bi];
    let px = W / 2 + Math.sin(bi * 2.1) * 90;
    let drift = rng() * 2 - 1;
    for (let y = b.y0 + 3; y < b.y1 - 2; y += 2) {
      drift = clamp(drift + (rng() - .5) * .22, -1.1, 1.1);
      px += drift + Math.sin(y * .016 + bi) * .5;
      px = clamp(px, 90, W - 90);
      const width = 15 + Math.sin(y * .031 + bi) * 4 + (fbm(y * .01, bi, wseed + 13) > .6 ? 9 : 0);
      carveEllipse(cells, px, y, width, 4.2);
      route.push({ x: px, y, b: bi });
      // broken ledges alternating sides so falls are survivable
      if ((y % 26) === 0) {
        const side = (Math.floor(y / 26) % 2) ? -1 : 1;
        const lx = Math.round(px + side * (width * .62));
        for (let k = 0; k < 9; k++) {
          const xx = lx + k * side;
          if (xx > 8 && xx < W - 8) {
            cells[Math.floor(y) * W + xx] = b.key === 'foundry' ? M.BRICK : (b.key === 'snow' ? M.ICE : M.WOOD);
            cells[(Math.floor(y) - 1) * W + xx] = M.AIR;
          }
        }
      }
    }
  }

  // Boss arena at the very bottom
  {
    const by = BIOMES[7].y0;
    const cx = W / 2, y0 = by + 34, y1 = Math.min(H - 16, by + 168);
    for (let y = y0; y <= y1; y++) for (let x = cx - 142; x <= cx + 142; x++) {
      const edge = x <= cx - 142 || x >= cx + 142 || y === y1;
      cells[y * W + x] = edge ? M.HOLY : M.AIR;
      bg[y * W + x] = 2;
    }
    // pillars
    for (const px of [cx - 92, cx + 92]) {
      for (let y = y1 - 48; y < y1; y++) { cells[y * W + px] = M.OBSIDIAN; cells[y * W + px + 1] = M.OBSIDIAN; }
    }
    // entry shaft from the ember biome
    for (let y = by - 26; y < y0; y++) for (let x = cx - 13; x <= cx + 13; x++) { cells[y * W + x] = M.AIR; bg[y * W + x] = 2; }
    torches.push({ x: cx - 112, y: y1 - 12, holy: true }, { x: cx + 112, y: y1 - 12, holy: true });
  }

  // Holy chambers + shafts
  for (const band of HOLY_BANDS) {
    const cx = W / 2 + ((band.n % 2) ? 0 : 22);
    const x0 = Math.round(cx - 118), x1 = Math.round(cx + 118);
    const y0 = band.y0 + 7, y1 = band.y0 + 64;
    // shaft from above
    const sx = x0 + 34;
    for (let y = band.y0 - 46; y < y0; y++) {
      for (let x = sx - 11; x <= sx + 11; x++) { cells[y * W + x] = M.AIR; bg[y * W + x] = 2; }
    }
    // shaft to below
    const ex = x1 - 34;
    for (let y = y1; y < band.y1 + 40; y++) {
      for (let x = ex - 11; x <= ex + 11; x++) { cells[y * W + x] = M.AIR; bg[y * W + x] = 2; }
    }
    // chamber interior
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      const floor = y >= y1 - 3;
      cells[y * W + x] = edge || floor ? M.HOLY : M.AIR;
      bg[y * W + x] = 2;
    }
    // decorative pillars
    for (const px of [x0 + 46, x1 - 46]) {
      for (let y = y1 - 18; y <= y1 - 4; y++) { cells[y * W + px] = M.HOLY; cells[y * W + px + 1] = M.HOLY; }
    }
    // ceiling arch detail
    for (let x = x0 + 10; x <= x1 - 10; x += 8) cells[(y0) * W + x] = M.HOLY;
    // punch the entry shaft through the ceiling and the exit shaft through the floor
    for (let y = y0; y < y0 + 7; y++) for (let x = sx - 10; x <= sx + 10; x++) { cells[y * W + x] = M.AIR; bg[y * W + x] = 2; }
    for (let y = y1 - 4; y <= y1 + 2; y++) for (let x = ex - 6; x <= ex + 6; x++) { cells[y * W + x] = M.AIR; bg[y * W + x] = 2; }
    holyRooms.push({
      n: band.n, x0, x1, y0, y1, sx, ex, cx,
      holy: true, name: '灰烬圣所', en: 'ASHEN SANCTUM',
      altar: { x: x0 + 22, y: y1 - 5 },
      portal: { x: ex + 18, y: y1 - 6 },
      shop: [{ x: cx - 30, y: y1 - 5 }, { x: cx, y: y1 - 5 }, { x: cx + 30, y: y1 - 5 }],
      visited: false, blessing: false, seed: sd + band.n * 713
    });
    // torches
    torches.push({ x: x0 + 14, y: y1 - 14, holy: true });
    torches.push({ x: x1 - 14, y: y1 - 14, holy: true });
  }

  // Clear starting glade, flatten a ledge, and cut the entrance shaft beside it
  const startX = W / 2;
  const startSurf = SURFACE_Y + Math.round(Math.sin(startX * .021) * 5 + Math.sin(startX * .053 + 2) * 2.2 + Math.sin(startX * .008 + 1) * 5);
  const shaftX0 = startX + 20, shaftX1 = shaftX0 + 24;
  // flat ground under the spawn ledge
  for (let x = startX - 40; x <= startX + 52; x++) {
    for (let y = startSurf; y < startSurf + 12; y++) {
      if (!inside(x, y)) continue;
      cells[y * W + x] = y === startSurf ? M.MOSS : (y < startSurf + 7 ? M.DIRT : M.ROCK);
      bg[y * W + x] = 1;
    }
  }
  // clear the air above the ledge
  for (let y = startSurf - 34; y < startSurf; y++) {
    for (let x = startX - 42; x <= startX + 54; x++) {
      if (!inside(x, y)) continue;
      cells[y * W + x] = M.AIR;
    }
  }
  // entrance shaft down to the first route
  for (let y = startSurf; y < BIOMES[1].y0 + 38; y++) {
    for (let x = shaftX0; x <= shaftX1; x++) { cells[y * W + x] = M.AIR; bg[y * W + x] = 1; }
    if ((y - startSurf) % 30 === 0 && y > startSurf) {
      for (let x = shaftX0; x <= shaftX1; x++) {
        if (x < shaftX0 + 5 || x > shaftX1 - 5) cells[y * W + x] = M.WOOD;
      }
    }
  }
  // wooden head-frame and support posts around the shaft
  for (let y = startSurf - 26; y < startSurf - 14; y++) {
    cells[y * W + shaftX0 - 4] = M.WOOD; cells[y * W + shaftX1 + 4] = M.WOOD;
  }
  for (let x = shaftX0 - 4; x <= shaftX1 + 4; x++) cells[(startSurf - 26) * W + x] = M.WOOD;
  for (let x = shaftX0 - 4; x <= shaftX0 + 1; x++) cells[(startSurf - 1) * W + x] = M.WOOD;
  cells[(startSurf - 2) * W + startX - 18] = M.WOOD;
  cells[(startSurf - 3) * W + startX - 18] = M.WOOD;
  torches.push({ x: startX - 16, y: startSurf - 4, holy: false });
  torches.push({ x: shaftX1 + 12, y: startSurf - 4, holy: false });

  // --- connectivity pass -------------------------------------------------
  const tunnel = (xa, xb, y, half) => {
    const x0 = Math.max(8, Math.min(xa, xb)), x1 = Math.min(W - 8, Math.max(xa, xb));
    for (let yy = Math.round(y) - half; yy <= Math.round(y) + half; yy++) {
      for (let xx = Math.floor(x0); xx <= Math.ceil(x1); xx++) {
        if (inside(xx, yy)) cells[yy * W + xx] = M.AIR;
      }
    }
  };
  const nearestRoute = (yy, y0, y1) => {
    let best = null, bd = 1e9;
    for (const r of route) {
      if (r.y < y0 || r.y > y1) continue;
      const d = Math.abs(r.y - yy);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  };
  // starting shaft -> mines route
  {
    const y = BIOMES[1].y0 + 34;
    const r = nearestRoute(y, BIOMES[1].y0, BIOMES[1].y0 + 150);
    if (r) tunnel(startX + 32, r.x, y, 9);
  }
  // each holy mountain shaft -> route above/below
  for (const h of holyRooms) {
    const yA = Math.max(BIOMES[1].y0 + 6, h.y0 - 42);
    const rA = nearestRoute(yA, yA - 110, yA + 80);
    if (rA) tunnel(rA.x, h.sx, yA, 9);
    const yB = Math.min(H - 30, h.y1 + 42);
    const rB = nearestRoute(yB, yB - 100, yB + 100);
    if (rB) tunnel(h.ex, rB.x, yB, 9);
  }
  // ember route -> boss shaft
  {
    const y = BIOMES[7].y0 - 24;
    const r = nearestRoute(y, BIOMES[6].y0 + 20, BIOMES[7].y0 - 2);
    if (r) tunnel(r.x, W / 2, y, 9);
  }
  // vertical access from the tunnel level down to the room floor where needed
  for (const h of holyRooms) {
    for (let y = h.y0 - 44; y < h.y0; y++) for (let x = h.sx - 8; x <= h.sx + 8; x++) cells[y * W + x] = M.AIR;
    for (let y = h.y1; y < h.y1 + 46; y++) for (let x = h.ex - 8; x <= h.ex + 8; x++) cells[y * W + x] = M.AIR;
  }

  // surface trees
  for (let i = 0; i < 22; i++) {
    const tx = rint(28, W - 28);
    if (Math.abs(tx - startX) < 48) continue;
    const ts = SURFACE_Y + Math.round(Math.sin(tx * .021) * 5 + Math.sin(tx * .053 + 2) * 2.2 + Math.sin(tx * .008 + 1) * 5);
    const th = rint(18, 40);
    for (let y = ts - th; y < ts; y++) {
      cells[y * W + tx] = M.WOOD;
      if (y > ts - th + 4 && rng() < .4) { cells[y * W + tx - 1] = M.WOOD; cells[y * W + tx + 1] = M.AIR; }
    }
    const cy = ts - th + 2;
    for (let y = cy - 4; y <= cy + 5; y++) for (let x = tx - 9; x <= tx + 9; x++) {
      const d = dist(x, y, tx, cy) / (7 + hash2(x, y, sd) * 3);
      if (d < 1 && inside(x, y) && cells[y * W + x] === M.AIR) cells[y * W + x] = M.MOSS;
    }
  }

  // Pools & liquid pockets
  const poolPlan = [
    { y: 240, mat: M.WATER, rx: 40, ry: 13 }, { y: 360, mat: M.OIL, rx: 26, ry: 9 },
    { y: 640, mat: M.LAVA, rx: 34, ry: 10 }, { y: 760, mat: M.WATER, rx: 30, ry: 10 },
    { y: 900, mat: M.LAVA, rx: 42, ry: 12 }, { y: 1120, mat: M.TOXIC, rx: 34, ry: 11 },
    { y: 1260, mat: M.WATER, rx: 38, ry: 12 }, { y: 1600, mat: M.WATER, rx: 42, ry: 11 },
    { y: 1740, mat: M.ICE, rx: 28, ry: 8 }, { y: 2010, mat: M.OIL, rx: 30, ry: 10 },
    { y: 2180, mat: M.LAVA, rx: 30, ry: 9 }, { y: 2480, mat: M.LAVA, rx: 50, ry: 14 },
    { y: 2600, mat: M.LAVA, rx: 44, ry: 12 }, { y: 2670, mat: M.WATER, rx: 26, ry: 9 },
    { y: 1290, mat: M.ACID, rx: 22, ry: 8 }, { y: 2220, mat: M.ACID, rx: 20, ry: 7 },
    { y: 880, mat: M.ACID, rx: 18, ry: 6 }
  ];
  for (const p of poolPlan) {
    const cx = rint(100, W - 100);
    carveEllipse(cells, cx, p.y, p.rx, p.ry + 4);
    // seal basin floor
    for (let x = cx - p.rx - 2; x <= cx + p.rx + 2; x++) {
      cells[(p.y + p.ry + 4) * W + clamp(x, 0, W - 1)] = biomeAt(p.y).key === 'snow' ? M.FROST : M.ROCK;
    }
    for (let y = p.y - 1; y < p.y + p.ry; y++) for (let x = cx - p.rx; x <= cx + p.rx; x++) {
      const d = dist(x, y, cx, p.y + p.ry * .5) / (p.rx * .96);
      if (d < 1 && cells[y * W + x] === M.AIR) cells[y * W + x] = p.mat;
    }
  }

  // Glowcap clusters and hanging decorations
  for (let i = 0; i < 110; i++) {
    const x = rint(20, W - 20), y = rint(BIOMES[3].y0 + 10, BIOMES[3].y1 - 10);
    if (cells[y * W + x] === M.AIR && cells[(y + 1) * W + x] !== M.AIR && cells[(y + 1) * W + x] !== M.AIR) {
      const n = rint(2, 5);
      for (let k = 0; k < n; k++) {
        const xx = clamp(x + rint(-2, 2), 0, W - 1), yy = y - rint(0, 2);
        if (cells[yy * W + xx] === M.AIR) cells[yy * W + xx] = M.GLOWCAP;
      }
    }
  }
  // powder piles: gunpowder in the mines, coal pits and foundry
  for (let i = 0; i < 46; i++) {
    const b = rng() < .4 ? BIOMES[1] : rng() < .5 ? BIOMES[2] : BIOMES[5];
    const x = rint(30, W - 30), y = rint(b.y0 + 14, b.y1 - 14);
    if (cells[y * W + x] !== M.AIR) continue;
    const w = rint(2, 5), h = rint(1, 3);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if (inside(x + xx, y + yy) && cells[(y + yy) * W + x + xx] === M.AIR) cells[(y + yy) * W + x + xx] = M.GUNPOWDER;
    }
  }
  // crystals in snow / ember
  for (let i = 0; i < 80; i++) {
    const b = rng() < .5 ? BIOMES[4] : BIOMES[6];
    const x = rint(20, W - 20), y = rint(b.y0 + 10, b.y1 - 10);
    if (cells[y * W + x] === M.AIR && cells[(y + 1) * W + x] !== M.AIR) {
      for (let k = 0; k < rint(1, 4); k++) cells[(y - k) * W + clamp(x + (k % 2), 0, W - 1)] = M.CRYSTAL;
    }
  }

  // Torches in caves (also lights)
  const torchSpots = [];
  for (let y = 130; y < H - 80; y += 34) {
    for (let x = 24; x < W - 24; x += 46) {
      if (rng() > .22) continue;
      const xx = clamp(x + rint(-14, 14), 8, W - 9);
      for (let yy = y; yy < y + 30; yy++) {
        if (cells[yy * W + xx] === M.AIR && cells[(yy + 1) * W + xx] !== M.AIR && cells[(yy + 1) * W + xx] !== M.AIR) {
          const insideHoly = holyRooms.some(h => xx >= h.x0 && xx <= h.x1 && yy >= h.y0 && yy <= h.y1);
          if (!insideHoly) { torchSpots.push({ x: xx, y: yy, holy: false }); }
          break;
        }
      }
    }
  }
  torches.push(...torchSpots);

  world = {
    w: W, h: H, cells, bg, life, holy: holyRooms, torches,
    startX, startSurf, seed: sd, surface: SURFACE_Y
  };

  world.route = route;
  world.workbench = { x: startX - 26, y: startSurf - 4 };
  // Place entities and loot
  spawnWorldEntities(route, wseed);
  return world;
}

function carveEllipse(cells, cx, cy, rx, ry) {
  const x0 = Math.max(1, Math.floor(cx - rx)), x1 = Math.min(W - 2, Math.ceil(cx + rx));
  const y0 = Math.max(1, Math.floor(cy - ry)), y1 = Math.min(H - 2, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / ry;
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx + dy * dy <= 1) cells[y * W + x] = M.AIR;
    }
  }
}

function solidMaterial(b, x, y, surf, s) {
  const vein = fbm(x * .085, y * .085, s + 31, 3);
  const patch = fbm(x * .035, y * .04, s + 91, 2);
  const depth = y - surf;
  switch (b.key) {
    case 'woods':
      if (depth < 16) return M.DIRT;
      return patch > .58 ? M.DIRT : M.ROCK;
    case 'mines':
      if (vein > .71) return M.GOLD;
      if (vein < .245) return M.COAL;
      if (patch > .62) return M.DIRT;
      if (patch < .34) return M.SAND;
      return M.ROCK;
    case 'coal':
      if (vein < .36) return M.COAL;
      if (vein > .78) return M.GOLD;
      if (patch > .68) return M.ROCK;
      if (patch < .3) return M.ASH;
      return M.COAL;
    case 'fungal':
      if (vein > .76) return M.CRYSTAL;
      if (vein < .27) return M.FUNGUS;
      if (patch > .63) return M.MOSS;
      return M.FUNGUS;
    case 'snow':
      if (depth < 22) return M.SNOW;
      if (vein > .74) return M.CRYSTAL;
      if (patch > .55) return M.SNOW;
      if (patch < .3) return M.ICE;
      return M.FROST;
    case 'foundry':
      if (vein > .8) return M.STEEL;
      if (vein < .25) return M.RUST;
      if (patch > .6) return M.BRICK;
      return M.RUST;
    case 'ember':
      if (vein > .8) return M.GOLD;
      if (vein > .64) return M.CRYSTAL;
      if (patch > .57) return M.DENSE;
      return M.OBSIDIAN;
    case 'boss':
      if (patch > .62) return M.DENSE;
      return M.OBSIDIAN;
    default:
      return M.ROCK;
  }
}

function spawnWorldEntities(route, s) {
  enemies = []; projectiles = []; particles = []; pickups = []; beams = [];
  // loot per biome
  for (let bi = 1; bi < BIOMES.length; bi++) {
    const b = BIOMES[bi];
    const nChests = b.key === 'boss' ? 0 : rint(2, 4);
    for (let i = 0; i < nChests; i++) {
      const p = findFloor(b.y0 + 12, b.y1 - 14);
      if (p) pickups.push({ type: 'chest', x: p.x, y: p.y, w: 12, h: 8, opened: false, bob: rng() * 6 });
    }
    if (b.key !== 'boss') {
      const p = findFloor(b.y0 + 20, b.y1 - 20);
      if (p) pickups.push({ type: 'wand', x: p.x, y: p.y - 3, w: 9, h: 12, wand: makeRandomWand(bi, b.y0), taken: false });
      for (let i = 0; i < 2; i++) {
        const q = findFloor(b.y0 + 16, b.y1 - 16);
        if (q) pickups.push({ type: 'spell', x: q.x, y: q.y - 3, w: 8, h: 8, spellId: randomSpellId(bi), taken: false });
      }
      for (let i = 0; i < 2; i++) {
        const q = findFloor(b.y0 + 16, b.y1 - 16);
        if (q) pickups.push({ type: 'heart', x: q.x, y: q.y - 2, w: 8, h: 8, taken: false });
      }
    }
    // enemies
    if (b.key !== 'boss') {
      const count = 8 + bi * 3;
      const types = biomeEnemyPool(b.key);
      for (let i = 0; i < count; i++) {
        const p = findFloor(b.y0 + 10, b.y1 - 10);
        if (!p) continue;
        if (Math.abs(p.x - W / 2) < 40 && bi < 2) continue;
        spawnEnemy(pick(types), p.x, p.y - 8, bi);
      }
    }
  }
  // boss
  const bossY = BIOMES[7].y0 + 92;
  spawnEnemy('boss', W / 2, bossY, 8);
  // surface critters / starting supplies
  pickups.push({ type: 'heart', x: world.startX + 26, y: world.startSurf - 6, w: 8, h: 8, taken: false });
  pickups.push({ type: 'gold', x: world.startX - 22, y: world.startSurf - 5, w: 5, h: 5, vx: 0, vy: 0, value: 12, taken: false });
}

function findFloor(y0, y1) {
  for (let tries = 0; tries < 90; tries++) {
    const x = rint(24, W - 24), y = rint(y0, y1);
    if (get(x, y) !== M.AIR) continue;
    if (get(x, y - 1) !== M.AIR) continue;
    if (isBlocking(get(x, y + 1))) {
      // need headroom
      if (get(x, y - 2) === M.AIR && get(x + 1, y) === M.AIR) return { x, y };
    }
  }
  return null;
}

function biomeEnemyPool(key) {
  switch (key) {
    case 'mines': return ['crag', 'crag', 'spitter', 'burrower'];
    case 'coal': return ['crag', 'bomber', 'spitter', 'bomber', 'burrower'];
    case 'fungal': return ['spitter', 'flyer', 'burrower', 'spitter', 'bomber'];
    case 'snow': return ['wraith', 'flyer', 'crag', 'wraith', 'spitter'];
    case 'foundry': return ['sentinel', 'bomber', 'spitter', 'sentinel', 'crag'];
    case 'ember': return ['wraith', 'bomber', 'sentinel', 'flyer', 'wraith'];
    default: return ['crag'];
  }
}

/* ---------------------------------------------------------------------------
   7. WANDS / SPELL BOOK
   ------------------------------------------------------------------------- */
let uidCounter = 1;
function newSpell(id) { return { uid: uidCounter++, id }; }
function makeWand(name, stats, spellIds) {
  const w = {
    uid: uidCounter++, name, tier: 1,
    capacity: stats.capacity || 5,
    castDelay: stats.castDelay ?? 8,
    recharge: stats.recharge ?? 30,
    manaMax: stats.manaMax ?? 100,
    mana: stats.manaMax ?? 100,
    manaRegen: stats.manaRegen ?? 30,
    spellsPerCast: stats.spellsPerCast || 1,
    spread: stats.spread ?? .03,
    shuffle: !!stats.shuffle,
    alwaysCast: stats.alwaysCast || null,
    timer: 0, rechargeTimer: 0, cursor: 0, shots: 0
  };
  w.slots = new Array(w.capacity).fill(null);
  (spellIds || []).forEach((id, i) => { if (i < w.capacity && id) w.slots[i] = newSpell(id); });
  return w;
}
function makeStartingWands() {
  wands = [
    makeWand('学徒短杖', { capacity: 5, castDelay: 7, recharge: 26, manaMax: 100, manaRegen: 36, spread: .025 }, ['spark', 'spark', 'firetrail']),
    makeWand('掘进短杖', { capacity: 6, castDelay: 5, recharge: 34, manaMax: 120, manaRegen: 30, spread: .02 }, ['drill', 'waterjet'])
  ];
  inventory = ['spark', 'arcane', 'firetrail', 'homing'].map(newSpell);
  currentWand = 0;
}
function makeRandomWand(bi, y) {
  const cap = clamp(3 + Math.floor(bi * .8) + rint(0, 3), 3, 8);
  const w = makeWand(pick(WAND_ADJ) + pick(WAND_NAMES), {
    capacity: cap,
    castDelay: rint(5, 11),
    recharge: rint(18, 48),
    manaMax: rint(80, 150) + bi * 18,
    manaRegen: rint(22, 42),
    spellsPerCast: rng() < .18 ? 2 : 1,
    spread: rng() * .07,
    shuffle: rng() < .18
  }, []);
  w.tier = bi + 1;
  const pool = spellPoolForTier(bi);
  const n = clamp(2 + Math.floor(bi * .7) + rint(0, 2), 2, cap);
  const used = {};
  for (let i = 0; i < n; i++) {
    let id = pick(pool);
    if (used[id] && rng() < .8) id = pick(pool);
    used[id] = true;
    w.slots[i] = newSpell(id);
  }
  if (rng() < .3) {
    const free = w.slots.findIndex(s => !s);
    if (free >= 0) w.slots[free] = newSpell(pick(['homing', 'heavy', 'firetrail', 'bounce', 'explosive', 'pierce']));
  }
  return w;
}
function spellPoolForTier(tier) {
  const base = ['spark', 'arcane', 'fireball', 'spore', 'frost', 'drill', 'waterjet', 'acidball'];
  if (tier >= 2) base.push('spark_trigger', 'arcane_timer', 'bounce', 'heavy');
  if (tier >= 3) base.push('lightning', 'bomb', 'homing', 'scatter', 'explosive');
  if (tier >= 4) base.push('multicast', 'pierce', 'longlife', 'efficiency');
  return base;
}
function randomSpellId(bi) { return pick(spellPoolForTier(clamp(bi, 1, 6))); }

function spellDef(entryOrId) {
  const id = typeof entryOrId === 'string' ? entryOrId : entryOrId && entryOrId.id;
  return SPELLS[id];
}
function wandMana(w) { return w.mana; }

function addSpellToInventory(id) {
  inventory.push(newSpell(id));
}
function totalSpellsInWand(w) { return w.slots.filter(Boolean).length; }

/* ---------------------------------------------------------------------------
   8. PLAYER / RUN RESET
   ------------------------------------------------------------------------- */
function resetRun(sd) {
  seed = sd >>> 0;
  rng = makeRng(seed);
  frame = 0; run = { gold: 0, kills: 0, depth: 0, time: 0, start: performance.now(), cause: '', detail: '', boss: false };
  enemies = []; projectiles = []; particles = []; pickups = []; beams = [];
  perksOwned = []; perkChoices = []; bossSpawned = false;
  generateWorld(seed);
  makeStartingWands();
  player = {
    x: world.startX - 6, y: world.startSurf - 12, vx: 0, vy: 0, w: 6, h: 12,
    hp: 100, maxHp: 100, mana: 100, maxMana: 100,
    lev: 100, maxLev: 100, levLock: 0, onGround: false, coyote: 0,
    dir: 1, inv: 0, flash: 0, dead: false,
    wet: 0, oil: 0, blood: 0, toxic: 0, poison: 0, burning: 0, frozen: 0, regen: 0,
    drown: 0, acidTick: 0, lavaTick: 0, crush: 0,
    perks: {}, kills: 0, aim: 0, walk: 0, castFlash: 0, lastDamage: null,
    oxygen: 100, airborne: 0, hitStop: 0, shield: 0, teleportCd: 0
  };
  // grant initial perk shield count (none until ward chosen)
  for (const h of world.holy) h.visited = false;
  camX = clamp(player.x - VW / 2, 0, W - VW);
  camY = clamp(player.y - VH * .52, 0, H - VH);
  pointer.x = VW / 2; pointer.y = VH / 2;
  pointer.wx = player.x + 30; pointer.wy = player.y;
  gameState = 'play';
  transition = 0; transitionDir = 0; pendingTeleport = null; holyPending = null; bossWinTimer = 0;
  flashes = []; pendingExplosions = []; beams = []; damageFlash = 0; lastBiomeKey = 'woods';
  camShake = 0; shakeX = 0; shakeY = 0;
  interactTarget = null; keys = {}; pointer.down = false; touchState.left = touchState.right = touchState.jump = false;
  player.jumpWas = false;
  UI.title.classList.add('hide'); UI.dead.classList.add('hide'); UI.win.classList.add('hide');
  $('hud').style.opacity = 1;
  UI.pause.classList.add('hide'); UI.perks.classList.add('hide'); UI.editor.classList.add('hide');
  editMode = false;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  updateHud();
  showBanner('苔语林', 'MOSSVEIL WOODS · 向下');
  toast('向右进入矿井。旧工作台可编排魔杖（E）。');
  audioInit();
  audioAmbient(true);
}

function startGame() {
  const sd = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  resetRun(sd);
}

/* ---------------------------------------------------------------------------
   9. MATERIAL SIMULATION
   The simulation is a bottom-up cellular automaton over the visible slice.
   Solids never move; powders fall; liquids seek their density level; gases
   rise; fire consumes fuel and leaves smoke/ash behind.
   ------------------------------------------------------------------------- */
let flashes = [];
let pendingExplosions = [];
let reactBudget = 0;

function ignite(x, y, life) {
  if (!inside(x, y)) return;
  const m = get(x, y);
  if (m === M.WATER || m === M.ICE || m === M.ACID) return;
  setm(x, y, M.FIRE);
  world.life[idx(x, y)] = (life || 55) + rint(0, 35);
}

function swapCells(x1, y1, x2, y2) {
  const a = idx(x1, y1), b = idx(x2, y2);
  const m = world.cells[a], l = world.life[a];
  world.cells[a] = world.cells[b]; world.life[a] = world.life[b];
  world.cells[b] = m; world.life[b] = l;
}

function pointInPlayer(x, y, pad) {
  if (!player) return false;
  const px = player.x, py = player.y, pw = player.w / 2 + (pad || 0), ph = player.h / 2 + (pad || 0);
  return x >= px - pw && x <= px + pw && y >= py - ph && y <= py + ph;
}

function destroyCell(x, y, power, cause) {
  const m = get(x, y);
  if (m === M.AIR || m === M.HOLY) return false;
  if (MAT_HARD[m] > power) return false;
  if (m === M.GOLD) {
    if (rng() < .55) pickups.push({ type: 'gold', x: x + rng() - .5, y: y, w: 4, h: 4, vx: (rng() - .5) * 1.2, vy: -1 - rng(), value: rint(3, 9), taken: false });
  }
  if (m === M.GLOWCAP || m === M.CRYSTAL) {
    for (let i = 0; i < 3; i++) addParticle(x, y, 'spark', getMatColor(m), (rng() - .5) * 2, -rng() * 2, 20);
  }
  setm(x, y, M.AIR);
  if (rng() < .12) setm(x, y, M.SMOKE, true), world.life[idx(x, y)] = 50;
  if (cause !== 'dig' && rng() < .22) addParticle(x, y, 'debris', getMatColor(m), (rng() - .5) * 2.4, -rng() * 2.2, 30);
  return true;
}

function getMatColor(m) {
  const cols = MAT_COLS[m] || MAT_COLS[M.ROCK];
  return rgbStr(cols[Math.floor(rng() * cols.length)]);
}

function addParticle(x, y, kind, color, vx, vy, life, size) {
  if (particles.length > 1500) return;
  particles.push({ x, y, vx, vy, kind, color, life, max: life, size: size || 1 });
}

function simulateMaterials() {
  const x0 = clamp(Math.floor(camX) - 3, 1, W - 3);
  const x1 = clamp(Math.ceil(camX + VW) + 3, 2, W - 2);
  const y0 = clamp(Math.floor(camY) - 3, 1, H - 3);
  const y1 = clamp(Math.ceil(camY + VH) + 3, 2, H - 2);
  reactBudget = 900;
  for (let y = y1; y >= y0; y--) {
    const ltr = ((y + frame) & 1) === 0;
    const count = x1 - x0;
    for (let k = 0; k < count; k++) {
      const x = ltr ? x0 + k : x1 - k;
      const i = y * W + x;
      const m = world.cells[i];
      if (m === M.AIR) continue;
      const cat = MATS[m] && MATS[m].cat;
      if (cat === 5) simFire(x, y, i);
      else if (cat === 3) simLiquid(x, y, i, m, ltr);
      else if (cat === 2) simPowder(x, y, i, m);
      else if (cat === 4) simGas(x, y, i, m);
      else if (cat === 1) simSolid(x, y, i, m);
    }
  }
  // delayed chain explosions
  for (let i = pendingExplosions.length - 1; i >= 0; i--) {
    const e = pendingExplosions[i];
    e.delay--;
    if (e.delay <= 0) {
      pendingExplosions.splice(i, 1);
      explodeAt(e.x, e.y, e.radius, e.dmg, 'chain', e.power);
    }
  }
}

function simSolid(x, y, i, m) {
  // ice melts near heat
  if (m === M.ICE || m === M.FROST) {
    let heat = 0;
    if (get(x - 1, y) === M.FIRE || get(x + 1, y) === M.FIRE || get(x, y - 1) === M.FIRE || get(x, y + 1) === M.FIRE) heat = 2;
    if (get(x, y + 1) === M.LAVA || get(x - 1, y) === M.LAVA || get(x + 1, y) === M.LAVA) heat = 3;
    if (heat && rng() < (m === M.ICE ? .06 : .02) * heat) {
      setm(x, y, m === M.ICE ? M.WATER : M.WATER);
      return;
    }
  }
  // gold ore sparkle is rendered; no physics
  // wood and coal can be ignited by adjacent fire in simFire
}

function simFire(x, y, i) {
  let life = world.life[i];
  // water and ice smother fire
  const n4 = [get(x - 1, y), get(x + 1, y), get(x, y - 1), get(x, y + 1)];
  for (const n of n4) {
    if (n === M.WATER || n === M.ICE || n === M.ACID) {
      if (rng() < .55) {
        setm(x, y, M.STEAM, true); world.life[i] = rint(80, 150);
        if (rng() < .12 && n === M.WATER) setm(x + (n === get(x, y - 1) ? 0 : 0), y - (n === get(x, y - 1) ? 1 : 0), M.STEAM, true);
        return;
      }
    }
  }
  if (life <= 0) {
    if (rng() < .42) { setm(x, y, M.SMOKE, true); world.life[i] = rint(55, 130); }
    else if (!pointInPlayer(x, y, 1)) setm(x, y, M.ASH);
    else setm(x, y, M.AIR);
    return;
  }
  world.life[i] = life - 1;
  if (rng() < .11) {
    // fuel neighbours
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let d = 0; d < 8; d++) {
      const nx = x + dirs[d][0], ny = y + dirs[d][1];
      const nm = get(nx, ny);
      if (nm === M.AIR || nm === M.FIRE || nm === M.SMOKE || nm === M.STEAM) continue;
      const flam = MAT_FLAM[nm];
      if (flam > 0 && rng() < flam * .34) {
        if (nm === M.GUNPOWDER) {
          if (pendingExplosions.length < 16) pendingExplosions.push({ x: nx, y: ny, radius: 8, dmg: 22, power: 9, delay: rint(1, 3) });
          setm(nx, ny, M.FIRE, true); world.life[idx(nx, ny)] = 20;
        } else {
          const burn = MAT_BURN[nm] || 45;
          setm(nx, ny, M.FIRE, true);
          world.life[idx(nx, ny)] = burn;
        }
      }
      if (nm === M.WATER) {
        setm(x, y, M.STEAM, true); world.life[i] = 90;
        return;
      }
    }
    // flames release embers and smoke
    if (rng() < .06) addParticle(x, y - 1, 'ember', rng() < .5 ? '#ffb347' : '#ffd879', (rng() - .5) * .8, -rng() * 1.3 - .3, rint(14, 30));
    if (rng() < .018) { const ty = y - 1; if (get(x, ty) === M.AIR) { setm(x, ty, M.SMOKE, true); world.life[idx(x, ty)] = rint(60, 130); } }
  }
  // rising flame
  if (rng() < .16) {
    const ax = x + (rng() < .5 ? -1 : 1), ay = y - 1;
    if (get(ax, ay) === M.AIR) { setm(ax, ay, M.FIRE, true); world.life[idx(ax, ay)] = Math.min(life, rint(20, 55)); }
  }
}

function simLiquid(x, y, i, m, ltr) {
  // lava / water conversion
  if (m === M.LAVA) {
    const below = get(x, y + 1);
    if (below === M.WATER || below === M.ICE || below === M.SNOW) {
      setm(x, y, M.ROCK, true);
      setm(x, y + 1, M.STEAM, true); world.life[idx(x, y + 1)] = rint(100, 180);
      return;
    }
    if (below === M.BLOOD) {
      if (rng() < .3) { setm(x, y, M.OBSIDIAN, true); setm(x, y + 1, M.STEAM, true); world.life[idx(x, y + 1)] = 90; return; }
    }
    if (below === M.TOXIC) {
      if (rng() < .12) { setm(x, y, M.OBSIDIAN, true); setm(x, y + 1, M.POISON, true); }
    }
    if (rng() < .012) {
      const ax = x + (rng() < .5 ? -1 : 1), ay = y - 1;
      if (get(ax, ay) === M.AIR) ignite(ax, ay, 30);
    }
    // lava ignites adjacent fuels
    if (rng() < .15) {
      const dirs = [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]];
      for (const d of dirs) {
        const nm = get(x + d[0], y + d[1]);
        if (MAT_FLAM[nm] > 0 && rng() < MAT_FLAM[nm] * .5) {
          setm(x + d[0], y + d[1], M.FIRE, true);
          world.life[idx(x + d[0], y + d[1])] = MAT_BURN[nm] || 55;
          break;
        }
      }
    }
  }
  if (m === M.WATER) {
    // fire above is quenched by splash
    if (get(x, y - 1) === M.FIRE && rng() < .5) { setm(x, y - 1, M.STEAM, true); world.life[idx(x, y - 1)] = 90; }
    if (get(x, y + 1) === M.FIRE) { setm(x, y + 1, M.STEAM, true); world.life[idx(x, y + 1)] = 90; }
    // water meeting lava from above: water flashes to steam, lava crusts to stone
    if (get(x, y + 1) === M.LAVA) {
      if (rng() < .65) {
        setm(x, y, M.STEAM, true); world.life[i] = rint(90, 150);
        setm(x, y + 1, M.ROCK, true);
        addParticle(x, y, 'spark', '#ffcf8a', rnd(-.4, .4), -rnd(.4, 1.2), 18);
        return;
      }
    }
  }
  if (m === M.ACID) {
    // eat through soft solids and powders
    const dirs = [[0, 1], [-1, 0], [1, 0], [0, -1]];
    for (const d of dirs) {
      const nx = x + d[0], ny = y + d[1], nm = get(nx, ny);
      if ((SOLID_CAT[nm] === 1 || POWDER_CAT[nm] === 1) && nm !== M.HOLY && rng() < .028 * (1 - MAT_ACID[nm])) {
        if (destroyCell(nx, ny, 20, 'acid')) {
          if (rng() < .55) { setm(x, y, M.AIR); return; }
          break;
        }
      }
      if (nm === M.WATER && rng() < .002) { setm(x, y, M.WATER); return; }
    }
  }
  if (m === M.OIL && get(x, y - 1) === M.FIRE && rng() < .3) {
    setm(x, y, M.FIRE, true); world.life[i] = 55; return;
  }
  if (m === M.TOXIC) {
    if (get(x, y - 1) === M.FIRE && rng() < .05) { setm(x, y - 1, M.POISON, true); }
  }

  const belowM = get(x, y + 1);
  // density layering: heavier sinks, lighter rises
  if (LIQUID_CAT[belowM] === 1 && belowM !== m) {
    if (MAT_DENS[m] > MAT_DENS[belowM] && rng() < .75) { swapCells(x, y, x, y + 1); return; }
  }
  if (LIQUID_CAT[get(x, y - 1)] === 1 && get(x, y - 1) !== m) {
    const up = get(x, y - 1);
    if (MAT_DENS[up] > MAT_DENS[m] && rng() < .5) { swapCells(x, y, x, y - 1); return; }
  }
  if (isFree(belowM) || (GAS_CAT[belowM] === 1)) { swapCells(x, y, x, y + 1); return; }
  if (POWDER_CAT[belowM] === 1 && MAT_DENS[m] > 1300 && rng() < .25) { swapCells(x, y, x, y + 1); return; }
  const dir = rng() < .5 ? -1 : 1;
  // diagonal down
  if (isFree(get(x + dir, y + 1)) && isFree(get(x + dir, y))) {
    if (rng() < .62) { swapCells(x, y, x + dir, y + 1); return; }
  }
  // horizontal flow
  if (isFree(get(x + dir, y))) {
    if (rng() < (m === M.LAVA ? .16 : .42)) { swapCells(x, y, x + dir, y); return; }
  }
  if (isFree(get(x - dir, y))) {
    if (rng() < .18) { swapCells(x, y, x - dir, y); }
  }
}

function simPowder(x, y, i, m) {
  // snow melts near heat
  if (m === M.SNOW) {
    if (get(x, y + 1) === M.LAVA || get(x - 1, y) === M.LAVA || get(x + 1, y) === M.LAVA ||
      get(x, y - 1) === M.FIRE || get(x - 1, y) === M.FIRE || get(x + 1, y) === M.FIRE) {
      if (rng() < .25) { setm(x, y, M.WATER); return; }
    }
  }
  if (m === M.GUNPOWDER) {
    if (get(x, y - 1) === M.FIRE || get(x + 1, y) === M.FIRE || get(x - 1, y) === M.FIRE ||
      get(x, y + 1) === M.LAVA) {
      if (rng() < .5) {
        setm(x, y, M.FIRE, true); world.life[i] = 8;
        if (pendingExplosions.length < 16) pendingExplosions.push({ x, y, radius: 16, dmg: 32, power: 12, delay: rint(2, 5) });
        return;
      }
    }
  }
  const below = get(x, y + 1), below2 = get(x, y + 2);
  if (isFree(below)) { swapCells(x, y, x, y + 1); return; }
  if (LIQUID_CAT[below] === 1 && MAT_DENS[m] > MAT_DENS[below] && rng() < .4) { swapCells(x, y, x, y + 1); return; }
  if (POWDER_CAT[below] === 1 && MAT_DENS[m] > MAT_DENS[below] + 200 && rng() < .3) { swapCells(x, y, x, y + 1); return; }
  const dir = rng() < .5 ? -1 : 1;
  if (isFree(get(x + dir, y + 1)) && isFree(get(x + dir, y))) {
    if (rng() < .72) { swapCells(x, y, x + dir, y + 1); return; }
  }
  if (isFree(get(x + dir, y)) && isFree(get(x + dir, y + 1)) && rng() < .12) {
    swapCells(x, y, x + dir, y + 1);
  }
}

function simGas(x, y, i, m) {
  let life = world.life[i];
  if (life > 0) {
    life--;
    world.life[i] = life;
    if (life === 0) {
      if (m === M.STEAM) setm(x, y, rng() < .5 ? M.WATER : M.AIR);
      else if (m === M.SMOKE) setm(x, y, M.AIR);
      else setm(x, y, M.AIR);
      return;
    }
  }
  // condensation on ceilings
  if (m === M.STEAM && get(x, y - 1) !== M.AIR && rng() < .010) { setm(x, y, M.WATER); return; }
  const up = get(x, y - 1);
  if (isFree(up)) { swapCells(x, y, x, y - 1); return; }
  if (LIQUID_CAT[up] === 1 && rng() < .55) { swapCells(x, y, x, y - 1); return; }
  const dir = rng() < .5 ? -1 : 1;
  if (isFree(get(x + dir, y - 1))) { if (rng() < .6) swapCells(x, y, x + dir, y - 1); return; }
  if (isFree(get(x + dir, y))) { if (rng() < .3) swapCells(x, y, x + dir, y); return; }
  // poison gas is heavier than air at low concentration: gentle drift
  if (isFree(get(x - dir, y))) { if (rng() < .12) swapCells(x, y, x - dir, y); }
}

/* ---------------------------------------------------------------------------
   10. EXPLOSIONS / DIGGING
   ------------------------------------------------------------------------- */
function explodeAt(x, y, radius, dmg, source, power) {
  x = Math.round(x); y = Math.round(y);
  radius = Math.max(2, radius); power = power || 12;
  if (source !== 'chain') {
    addFlash(x, y, radius * 1.9, '#ffb35c');
    camShake = Math.min(16, camShake + radius * .38);
    sfxExplosion(radius);
  }
  for (let yy = -radius; yy <= radius; yy++) {
    for (let xx = -radius; xx <= radius; xx++) {
      const dd = Math.sqrt(xx * xx + yy * yy);
      if (dd > radius) continue;
      const gx = x + xx, gy = y + yy;
      if (!inside(gx, gy)) continue;
      const m = get(gx, gy);
      if (m === M.HOLY) continue;
      if (m === M.AIR) {
        if (rng() < .06 && dd < radius * .7) ignite(gx, gy, rint(16, 40));
        continue;
      }
      if (SOLID_CAT[m] === 1 || POWDER_CAT[m] === 1) {
        if (MAT_HARD[m] <= power && dd <= radius) destroyCell(gx, gy, power, 'boom');
      } else if (LIQUID_CAT[m] === 1) {
        if (m === M.LAVA) continue;
        setm(gx, gy, rng() < .5 ? M.STEAM : M.SMOKE, true);
        world.life[idx(gx, gy)] = rint(60, 160);
      }
    }
  }
  // fire ring just outside the blast
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, rr = radius * (.65 + rng() * .5);
    const fx = Math.round(x + Math.cos(a) * rr), fy = Math.round(y + Math.sin(a) * rr);
    if (inside(fx, fy) && get(fx, fy) === M.AIR && rng() < .42) ignite(fx, fy, rint(10, 32));
  }
  // particles
  for (let i = 0; i < Math.min(90, radius * 3); i++) {
    const a = rng() * Math.PI * 2, sp = rng() * radius * .35 + .6;
    addParticle(x, y, rng() < .55 ? 'ember' : 'debris', rng() < .5 ? '#ffb45f' : '#e0cfaa',
      Math.cos(a) * sp, Math.sin(a) * sp - .3, rint(16, 45), rnd(1, 3));
  }
  // damage entities
  for (const e of enemies) {
    if (e.dead) continue;
    const d = dist(e.x, e.y, x, y);
    if (d < radius + e.r) {
      const falloff = 1 - d / (radius + e.r) * .72;
      hurtEnemy(e, dmg * falloff, source === 'player' ? 'player' : 'blast', '爆炸');
      if (e.type === 'bomber' && e.fuse <= 0) e.fuse = rint(8, 20);
    }
  }
  if (!player.dead) {
    const d = dist(player.x, player.y, x, y);
    if (d < radius + 7) {
      let mult = (1 - d / (radius + 7) * .7) * (source === 'player' ? .48 : .8);
      if (player.perks.blast) mult *= .3;
      hurtPlayer(Math.max(2, dmg * mult), 'explosion', source === 'player' ? '你的法术炸到了自己' : '爆炸');
    }
  }
}

function addFlash(x, y, radius, color) {
  flashes.push({ x, y, radius, color, life: 14, max: 14 });
}

/* ---------------------------------------------------------------------------
   11. DEBUG HOOKS
   ------------------------------------------------------------------------- */
function rnd(a, b) { return a + rng() * (b - a); }

/* ---------------------------------------------------------------------------
   12. PLAYER
   ------------------------------------------------------------------------- */
function aimWorld() {
  if (pointer.active) return { x: pointer.wx, y: pointer.wy };
  // touch / keyboard fallback: snap to nearest visible enemy, else facing
  let best = null, bd = 260 * 260;
  for (const e of enemies) {
    if (e.dead || e.x < camX - 20 || e.x > camX + VW + 20 || e.y < camY - 20 || e.y > camY + VH + 20) continue;
    const d = dist2(e.x, e.y, player.x, player.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) return { x: best.x, y: best.y };
  return { x: player.x + player.dir * 90, y: player.y - 2 };
}

function moveBody(o, dx, dy, w, h, bounce) {
  let hitX = false, hitY = false;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 1.6));
  for (let s = 0; s < steps; s++) {
    if (dx !== 0) {
      const nx = o.x + dx / steps;
      if (!solidAtRect(nx, o.y, w, h)) o.x = nx;
      else {
        // small step-up over one-pixel lips
        if (o.onGround) {
          let up = 0;
          for (let k = 1; k <= 4; k++) { if (!solidAtRect(nx, o.y - k, w, h)) { up = k; break; } }
          if (up && !solidAtRect(nx, o.y - up, w, h)) { o.y -= up; o.x = nx; }
          else { hitX = true; o.vx = 0; }
        } else { hitX = true; o.vx = 0; }
      }
    }
    if (dy !== 0) {
      const ny = o.y + dy / steps;
      if (!solidAtRect(o.x, ny, w, h)) o.y = ny;
      else { hitY = true; o.vy = 0; }
    }
  }
  return { hitX, hitY };
}

function updatePlayer() {
  const p = player;
  if (p.dead) return;
  if (p.frozen > 0) {
    p.frozen--;
    p.vx *= .85; p.vy = Math.min(p.vy + .17, 5);
    moveBody(p, p.vx, p.vy, p.w, p.h);
    p.onGround = solidAtRect(p.x, p.y + p.h / 2 + 1, p.w, 2);
    p.inv = Math.max(0, p.inv - 1);
    checkEnvironment();
    return;
  }

  const left = keys.a || keys.ArrowLeft || touchState.left;
  const right = keys.d || keys.ArrowRight || touchState.right;
  const jumpDown = keys.w || keys.ArrowUp || keys[' '] || touchState.jump;
  let ax = (right ? 1 : 0) - (left ? 1 : 0);
  if (ax) p.dir = ax;
  const liquid = liquidAt(p.x, p.y + 2, p.w, p.h - 2);
  const submerged = liquid.count > 4;
  const oiled = p.oil > 0;

  // stains alter traction
  let speedCap = 1.92, accel = p.onGround ? .34 : .22;
  if (p.perks.swift) { speedCap *= 1.18; accel *= 1.08; }
  if (oiled) { speedCap *= 1.08; accel *= .8; }
  if (p.toxic > 40) { speedCap *= .86; }
  if (p.wet > 0) speedCap *= .96;
  if (submerged) { speedCap *= .55; accel *= .6; }

  if (ax) p.vx += ax * accel;
  else p.vx *= p.onGround ? .72 : .94;
  p.vx = clamp(p.vx, -speedCap, speedCap);
  if (p.vx > -.06 && p.vx < .06) p.vx = 0;

  // jump / levitation
  if (jumpDown && !p.jumpWas && (p.onGround || p.coyote > 0)) {
    p.vy = submerged ? -2.3 : -3.55;
    p.onGround = false; p.coyote = 0;
    sfxJump();
    for (let i = 0; i < 4; i++) addParticle(p.x + rnd(-3, 3), p.y + 6, 'dust', '#9b8e73', rnd(-.5, .5), rnd(-.4, .2), 18);
  }
  p.jumpWas = jumpDown;
  if (jumpDown && !p.onGround) {
    if (p.lev > 0) {
      const lift = submerged ? .10 : .29;
      p.vy = Math.max(p.vy - lift, submerged ? -1.45 : -2.05);
      p.lev = Math.max(0, p.lev - (p.perks.levitation ? .62 : .86));
      if (frame % 3 === 0) addParticle(p.x + rnd(-2, 2), p.y + 6, 'spark', '#e7d48a', rnd(-.3, .3), rnd(.3, 1), 10);
    }
  }

  // gravity / buoyancy
  let grav = .175, term = 5.3;
  if (p.perks.feather) { grav *= .66; term = 3.4; }
  if (submerged) { grav = .035; term = 1.25; p.vy *= .94; }
  p.vy = Math.min(p.vy + grav, term);
  p.onGround = solidAtRect(p.x, p.y + p.h / 2 + 1, p.w, 2);
  if (p.onGround) {
    p.coyote = 6;
    p.lev = Math.min(p.maxLev, p.lev + (p.perks.levitation ? 1.15 : .78));
    p.airborne = 0;
  } else {
    p.coyote = Math.max(0, p.coyote - 1);
    p.airborne++;
    p.lev = Math.min(p.maxLev, p.lev + .10);
  }

  const preVy = p.vy;
  const res = moveBody(p, p.vx, p.vy, p.w, p.h);
  const landed = !p.onGround && solidAtRect(p.x, p.y + p.h / 2 + 1, p.w, 2);
  if (landed && preVy > 4.25 && p.airborne > 10) {
    let dmg = (preVy - 4.1) * 11;
    if (!p.perks.feather) hurtPlayer(dmg, 'fall', `从 ${Math.round(p.airborne)} 帧的高处坠落`, true);
  }
  p.onGround = solidAtRect(p.x, p.y + p.h / 2 + 1, p.w, 2);
  if (p.onGround) p.airborne = 0;

  if (p.onGround && Math.abs(p.vx) > .35 && frame % 9 === 0) {
    addParticle(p.x - p.dir * 2, p.y + 6, 'dust', rng() < .5 ? '#9b8e73' : '#b0a183', -p.vx * .18, -.12, 12);
  }
  if (submerged && frame % 14 === 0) addParticle(p.x + rnd(-3, 3), p.y - 4, 'bubble', '#b8dbe8', rnd(-.2, .2), rnd(-1.1, -.4), 22);
  // world bounds
  p.x = clamp(p.x, 8, W - 8);
  if (p.y > H - 10) { p.y = H - 10; p.vy = Math.min(p.vy, 0); }
  if (p.y < 8) { p.y = 8; p.vy = Math.max(p.vy, 0); }

  // timers
  if (p.inv > 0) p.inv--;
  if (p.castFlash > 0) p.castFlash--;
  if (p.wet > 0) p.wet--;
  if (p.oil > 0) p.oil--;
  if (p.blood > 0) p.blood--;
  if (p.toxic > 0) p.toxic--;
  if (p.poison > 0) p.poison--;
  if (p.regen > 0) p.regen--;
  p.walk += Math.abs(p.vx) * .22;

  // burning / poison / regen
  if (p.burning > 0) {
    if (p.perks.fireblood) p.burning = 0;
    else {
      p.burning--;
      if (p.wet > 0) { p.burning = 0; p.wet = 0; }
      else {
        if (frame % 20 === 0) hurtPlayer(Math.max(1.5, p.maxHp * .02), 'fire', '火焰正在吞噬你', true);
        if (frame % 4 === 0) addParticle(p.x + rnd(-3, 3), p.y + rnd(-6, 4), 'ember', rng() < .5 ? '#ffae4a' : '#ffd77a', rnd(-.4, .4), rnd(-1.5, -.4), 24);
        if (frame % 30 === 0 && p.oil > 0) p.burning = Math.max(p.burning, 120);
      }
    }
  }
  if (p.poison > 0 && frame % 32 === 0) {
    hurtPlayer(1.6 + Math.min(5, p.maxHp * .012), 'poison', '毒素在你的血管里蔓延', true);
  }
  if (p.regen > 0 || p.perks.regen) {
    if (frame % 45 === 0) p.hp = Math.min(p.maxHp, p.hp + (p.perks.regen ? 1.5 : 2));
  }
  // weather / ambient effects
  if (p.perks.levitation) p.maxLev = 180;
  else p.maxLev = 100;

  checkEnvironment();
  updateWandTimers();
  detectInteraction();
  checkHolyEntrance();
  run.depth = Math.max(run.depth, Math.max(0, player.y - world.startSurf));

  // aim & cast
  const aim = aimWorld();
  p.aim = Math.atan2(aim.y - (p.y - 1), aim.x - p.x);
  if (pointer.down && !editMode) castCurrentWand();
}

function checkEnvironment() {
  const p = player;
  if (p.dead) return;
  const headM = get(p.x, p.y - p.h / 2 + 1);
  const bodyM = get(p.x, p.y);
  const feetM = get(p.x, p.y + p.h / 2 - 1);
  const midM = get(p.x, p.y + 1);

  // burning from contact
  const inFire = headM === M.FIRE || bodyM === M.FIRE || feetM === M.FIRE;
  if (inFire) p.frozen = 0;
  if (inFire && !p.perks.fireblood) {
    if (!p.wet || p.oil > 0) p.burning = Math.max(p.burning, p.oil > 0 ? 190 : 115);
    else { p.wet = Math.max(0, p.wet - 18); }
  }
  const anyLiquid = [headM, bodyM, feetM, midM];
  for (const m of anyLiquid) {
    if (m === M.WATER) {
      p.wet = Math.max(p.wet, 260); p.burning = 0;
      p.oil = Math.max(0, p.oil - 6); p.blood = Math.max(0, p.blood - 2);
    } else if (m === M.OIL) {
      p.oil = Math.max(p.oil, 280); p.wet = 0;
      if (p.burning <= 0) p.burning = 1;
    } else if (m === M.BLOOD) {
      p.blood = Math.max(p.blood, 280);
    } else if (m === M.TOXIC) {
      p.toxic = Math.max(p.toxic, 300);
      if (p.perks.toxicblood) p.poison = 0;
      else p.poison = Math.max(p.poison, 190);
      p.wet = Math.max(p.wet, 120);
    } else if (m === M.ACID) {
      p.toxic = Math.max(p.toxic, 240);
      if (frame % 18 === 0) hurtPlayer(p.perks.toxicblood ? 3 : 7, 'acid', '酸液正在溶解你的身体', true);
      if (frame % 6 === 0) addParticle(p.x + rnd(-3, 3), p.y + rnd(-5, 4), 'bubble', '#a8d55c', rnd(-.4, .4), rnd(-1, -.2), 24);
    } else if (m === M.LAVA) {
      if (frame % 12 === 0) hurtPlayer(p.perks.fireblood ? 18 : 48, 'lava', '熔岩吞没了你', true);
      p.burning = Math.max(p.burning, 120);
    }
  }
  if (bodyM === M.FIRE && p.perks.fireblood) p.burning = 0;
  // crush: only substantial burial hurts. A one-pixel wall clip should not kill.
  const overlap = solidCountAtRect(p.x, p.y, p.w - 1, p.h - 1);
  if (overlap > 0) {
    if (overlap >= 4) p.crush++;
    else p.crush = Math.max(0, p.crush - 2);
    if (p.crush > 8) {
      if (frame % 9 === 0) hurtPlayer(11, 'crush', '坠落的岩层把你压住了', true);
      if (frame % 4 === 0) addParticle(p.x + rnd(-4, 4), p.y - 4, 'dust', '#a08c6c', rnd(-.4, .4), rnd(-.6, 0), 18);
    }
    // slide out into the nearest free pocket (never through solid)
    if (!solidAtRect(p.x, p.y - .9, p.w - 1, p.h - 1)) p.y -= .9;
    else if (!solidAtRect(p.x - .9, p.y, p.w - 1, p.h - 1)) p.x -= .9;
    else if (!solidAtRect(p.x + .9, p.y, p.w - 1, p.h - 1)) p.x += .9;
  } else p.crush = 0;

  // suffocation / drowning (head under any liquid)
  const headLiquid = isLiquid(headM) && headM !== M.LAVA;
  if (headLiquid) {
    p.oxygen = Math.max(0, p.oxygen - (bodyM === M.WATER ? .8 : 1.25));
    if (p.oxygen < 30 && !p.drownWarn) { p.drownWarn = true; toast('氧气将尽 —— 快浮上水面'); }
    if (p.oxygen > 60) p.drownWarn = false;
    if (frame % 8 === 0) addParticle(p.x + rnd(-2, 2), p.y - 7, 'bubble', '#b8dbe8', rnd(-.2, .2), rnd(-1.2, -.5), 26);
    if (p.oxygen <= 0 && frame % 14 === 0) hurtPlayer(4.5, 'drown', '你在液体里耗尽了最后一口气', true);
  } else {
    p.oxygen = Math.min(100, p.oxygen + 4.5);
  }
  // poison gas
  if (get(p.x, p.y - 3) === M.POISON || get(p.x, p.y) === M.POISON) {
    if (!p.perks.toxicblood) p.poison = Math.max(p.poison, 160);
  }
  // rain / snow ambience (visual only)
  if (world && player.y < 120) {
    // surface breeze: nothing mechanical
  }
}

function updateWandTimers() {
  for (const w of wands) {
    if (w.timer > 0) w.timer--;
    if (w.rechargeTimer > 0) w.rechargeTimer--;
    w.mana = Math.min(w.manaMax, w.mana + w.manaRegen / 60);
  }
}

function hurtPlayer(amount, cause, detail, ignoreInv) {
  const p = player;
  if (!p || p.dead) return;
  if (window.DBG && window.DBG._god) return;
  if (!ignoreInv && p.inv > 0) return;
  if (cause === 'fire' && p.perks.fireblood) return;
  if ((cause === 'poison' || cause === 'toxic') && p.perks.toxicblood) return;
  if (cause === 'explosion' && p.perks.blast) amount *= .3;
  if (p.perks.stone) amount *= .75;
  if (cause === 'lava' && p.perks.fireblood) amount *= .5;
  if (cause === 'acid' && p.perks.toxicblood) amount *= .5;
  if (cause === 'fall' && p.perks.feather) return;
  amount = Math.max(1, amount);

  if (p.hp - amount <= 0 && p.shield > 0) {
    p.shield--;
    p.hp = 1; p.inv = 80; p.flash = 16;
    toast('残响护盾碎裂，你被从死亡边缘拉了回来');
    addFlash(p.x, p.y, 34, '#9fc7ff');
    sfxShield();
    return;
  }
  p.hp -= amount;
  p.lastDamage = { cause, detail: detail || '', t: frame };
  if (!ignoreInv) p.inv = 28;
  p.flash = 5;
  camShake = Math.min(13, camShake + Math.min(6, amount * .12));
  damageFlash = Math.min(1, .25 + amount / 45);
  sfxHurt(cause);
  if (p.hp <= 0) diePlayer(cause, detail);
}

const DEATH_TEXT = {
  fire: '烧死', lava: '熔岩焚身', drown: '溺死', acid: '酸蚀而死', toxic: '毒死',
  poison: '毒死', explosion: '被炸死', crush: '被压死', fall: '摔死',
  melee: '被击杀', projectile: '被法术击杀', electric: '被电死', freeze: '冻死'
};
function diePlayer(cause, detail) {
  const p = player;
  if (p.dead) return;
  // Dominant hazard wins the autopsy: burning bodies are not "crushed" by their own ash.
  if (cause === 'crush' && p.burning > 0) { cause = 'fire'; detail = '火焰先一步吞没了你'; }
  if (cause === 'crush' && p.oxygen <= 0) { cause = 'drown'; detail = '你在液体里耗尽了最后一口气'; }
  p.hp = 0; p.dead = true;
  gameState = 'dead';
  pointer.down = false;
  run.cause = DEATH_TEXT[cause] || '被深渊吞噬';
  run.detail = detail || '';
  const bestDepth = Math.max(0, Math.round(p.y - world.startSurf));
  run.depth = Math.max(run.depth, bestDepth);
  saveBest();
  $('deadCause').innerHTML = `死因：<b>${escapeHtml(run.cause)}</b>`;
  $('deadHint').textContent = run.detail ? `「${run.detail}」` : '岩层不会解释，但它会记住。';
  $('stDepth').textContent = run.depth + 'm';
  $('stKills').textContent = run.kills;
  $('stGold').textContent = run.gold;
  $('stTime').textContent = fmtTime(run.time);
  UI.dead.classList.remove('hide');
  sfxDeath();
  audioAmbient(false);
  // freeze the scene in a death vignette
  for (let i = 0; i < 34; i++) {
    addParticle(p.x + rnd(-5, 5), p.y + rnd(-7, 7), 'blood', rng() < .5 ? '#8e2b35' : '#b84a52', rnd(-2, 2), rnd(-3, .4), rint(30, 80), rnd(1, 2));
  }
  addFlash(p.x, p.y, 26, '#b8494f');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function saveBest() {
  try {
    const prev = JSON.parse(localStorage.getItem('deeprock_best') || 'null');
    const cur = { depth: Math.round(run.depth), kills: run.kills, gold: run.gold, time: Math.round(run.time || ((performance.now() - run.start) / 1000)) };
    if (!prev || cur.depth > prev.depth || (cur.depth === prev.depth && cur.kills > prev.kills)) {
      localStorage.setItem('deeprock_best', JSON.stringify(cur));
      bestRun = cur;
    } else bestRun = prev;
  } catch (e) { bestRun = null; }
}

/* ---------------------------------------------------------------------------
   13. WAND CASTING
   ------------------------------------------------------------------------- */
function readFromWand(w, maxCount, depth) {
  const cap = w.capacity;
  let count = Math.max(1, maxCount);
  const out = [];
  let mods = [];
  let guard = 0;
  while (out.length < count && guard++ < cap * 3 + 10) {
    if (w.cursor >= cap) { w.cursor = 0; w.wrapped = true; break; }
    const entry = w.slots[w.cursor++];
    if (!entry) continue;
    const sp = SPELLS[entry.id];
    if (!sp) continue;
    if (sp.type === 'mod') {
      mods.push(entry.id);
      if (sp.id === 'multicast') count += 2;
      if (sp.id === 'scatter') count += 2;
      continue;
    }
    const item = { id: entry.id, mods: mods.slice() };
    mods = [];
    if (sp.trigger && depth < 3) {
      item.payload = readFromWand(w, sp.payload || 1, depth + 1);
    }
    out.push(item);
  }
  return out;
}

function castCurrentWand() {
  const w = wands[currentWand];
  if (!w || w.timer > 0 || w.rechargeTimer > 0) return;
  if (w.cursor >= w.capacity) { w.cursor = 0; w.wrapped = false; }
  const before = w.cursor;
  w.wrapped = false;
  // shuffle wands start at a random occupied slot
  if (w.shuffle) {
    const occupied = [];
    w.slots.forEach((s, i) => { if (s) occupied.push(i); });
    if (occupied.length) w.cursor = pick(occupied);
  }
  let group = readFromWand(w, w.spellsPerCast || 1, 0);
  if (w.cursor >= w.capacity) w.wrapped = true;
  if (!group.length) {
    w.timer = 8;
    return;
  }
  // always-cast rider
  if (w.alwaysCast) group.push({ id: w.alwaysCast, mods: [] });

  let cost = 0;
  for (const it of group) {
    const sp = SPELLS[it.id]; if (!sp) continue;
    cost += sp.cost;
    for (const m of it.mods) cost += SPELLS[m] ? SPELLS[m].cost : 0;
  }
  let eff = false;
  for (const it of group) if (it.mods.includes('efficiency')) eff = true;
  if (eff) cost *= .65;
  cost = Math.max(1, Math.round(cost));
  if (w.mana < cost) {
    toast('法力不足 · 等待魔杖回充');
    sfxEmpty();
    w.timer = 12;
    return;
  }
  w.mana -= cost;
  w.shots++;
  const aim = aimWorld();
  let angle = Math.atan2(aim.y - (player.y - 1), aim.x - player.x);
  let maxDelay = 0;
  for (const it of group) { const sp = SPELLS[it.id]; if (sp) maxDelay = Math.max(maxDelay, sp.delay || 0); }
  const groupDelay = group.reduce((n, it) => { const sp = SPELLS[it.id]; return n + (sp ? (sp.delay || 0) : 0); }, 0) / Math.max(1, group.length);
  w.timer = Math.max(2, Math.round((w.castDelay + groupDelay * .65) * .9));

  const mx = player.x + Math.cos(angle) * 9;
  const my = player.y - 1 + Math.sin(angle) * 9;
  spawnGroup(group, mx, my, angle, 'player', w);
  player.castFlash = 7;
  const kick = .08 + group.length * .035;
  player.vx -= Math.cos(angle) * kick;
  player.vy -= Math.sin(angle) * kick * .6;
  camShake = Math.min(5, camShake + .55);
  sfxCast(group[0] ? group[0].id : 'spark');
  if (w.wrapped) {
    w.rechargeTimer = w.recharge;
    w.cursor = 0;
    w.wrapped = false;
  }
  // muzzle light
  addFlash(mx, my, 12 + group.length * 2, SPELLS[group[0].id] ? SPELLS[group[0].id].color : '#ffe58a');
}

function spawnGroup(group, x, y, baseAngle, owner, wand) {
  for (const item of group) {
    const sp = SPELLS[item.id];
    if (!sp) continue;
    const mods = item.mods || [];
    if (sp.beam) {
      beams.push({
        x, y, angle: baseAngle, len: sp.beam, life: sp.life || 12, maxLife: sp.life || 12,
        dmg: sp.dmg, dig: sp.dig, owner, color: sp.color, width: 2
      });
      continue;
    }
    const copies = mods.includes('scatter') ? 3 : 1;
    const spreadBase = (sp.spread || 0) + (wand ? wand.spread : 0);
    for (let c = 0; c < copies; c++) {
      let a = baseAngle;
      if (copies > 1) a += (c - (copies - 1) / 2) * .16;
      a += (rng() - .5) * spreadBase * 2;
      spawnProjectile(item, sp, x, y, a, owner);
    }
    // muzzle sparks
    for (let i = 0; i < 3; i++) addParticle(x, y, 'spark', sp.color, Math.cos(baseAngle + rnd(-.4, .4)) * rnd(.5, 1.6), Math.sin(baseAngle + rnd(-.4, .4)) * rnd(.5, 1.6), 10);
  }
}

function spawnProjectile(item, sp, x, y, angle, owner) {
  const mods = item.mods || [];
  let speed = sp.speed || 4;
  let dmg = sp.dmg || 0;
  let radius = sp.radius || 2;
  let explode = sp.explode || 0;
  let life = sp.life || 70;
  if (mods.includes('heavy')) { dmg *= 1.7; speed *= .8; radius += 1; explode += 2; }
  if (mods.includes('haste')) { speed *= 1.55; dmg *= .88; }
  if (mods.includes('explosive')) { explode = Math.max(9, explode + 8); dmg *= 1.14; }
  if (mods.includes('longlife')) life = Math.round(life * 1.7);
  if (owner === 'player' && player.perks.glass) dmg *= 1.65;
  const p = {
    id: sp.id, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    dmg, radius, speed, life, maxLife: life, color: sp.color, glow: sp.glow || 0,
    gravity: sp.gravity || 0, owner, mods, angle, age: 0,
    homing: mods.includes('homing') || sp.homing || false,
    trail: mods.includes('firetrail'),
    bounce: mods.includes('bounce') ? 3 : 0,
    pierce: mods.includes('pierce') ? 999 : 0,
    explode, element: sp.element || null, dig: sp.dig || 0,
    trigger: sp.trigger || null, triggerTimer: sp.trigger === 'timer' ? (sp.timer || 32) : 0,
    payload: item.payload || null, fuse: sp.fuse || 0,
    hitSet: {}, hitTick: 0, chain: sp.chain || 0, dead: false,
    light: sp.glow || .2
  };
  projectiles.push(p);
  return p;
}

function spawnPayload(payload, x, y, angle, owner) {
  if (!payload || !payload.length) return;
  // payloads are cast inside triggers; limited depth is handled when compiled
  for (const item of payload) {
    const sp = SPELLS[item.id]; if (!sp) continue;
    if (sp.beam) {
      beams.push({ x, y, angle, len: sp.beam, life: sp.life, maxLife: sp.life, dmg: sp.dmg, dig: sp.dig, owner, color: sp.color, width: 2 });
    } else {
      const copies = (item.mods || []).includes('scatter') ? 3 : 1;
      for (let c = 0; c < copies; c++) {
        let a = angle + (copies > 1 ? (c - 1) * .17 : 0) + rnd(-.06, .06);
        spawnProjectile(item, sp, x, y, a, owner);
      }
    }
  }
  addFlash(x, y, 18, '#ffd98a');
}

function spawnEnemyProjectile(e, angle, speed, dmg, color, opts) {
  opts = opts || {};
  const p = {
    id: opts.id || 'enemy', x: e.x + Math.cos(angle) * (e.r + 2), y: e.y - 2 + Math.sin(angle) * (e.r + 2),
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    dmg, radius: opts.radius || 2, speed, life: opts.life || 150, maxLife: opts.life || 150,
    color, glow: opts.glow || .5, gravity: opts.gravity || 0, owner: 'enemy',
    mods: [], age: 0, homing: !!opts.homing, trail: false, bounce: 0, pierce: 0,
    explode: 0, element: opts.element || null, trigger: null, payload: null, fuse: 0,
    hitSet: {}, hitTick: 0, chain: 0, dead: false, light: .3, enemyType: e.type
  };
  projectiles.push(p);
  return p;
}

/* ---------------------------------------------------------------------------
   14. PROJECTILES / BEAMS
   --------------------------------------------------------------------------- */
function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (p.dead) { projectiles.splice(i, 1); continue; }
    p.age++;
    if (p.trigger === 'timer') {
      p.triggerTimer--;
      if (p.triggerTimer <= 0) { detonateProjectile(p, null, 'timer'); continue; }
    }
    if (p.fuse > 0) {
      p.fuse--;
      if (p.fuse <= 0) { detonateProjectile(p, null, 'fuse'); continue; }
    }
    if (p.homing) {
      let best = null, bd = 210 * 210;
      if (p.owner === 'player') {
        for (const e of enemies) if (!e.dead) { const d = dist2(e.x, e.y, p.x, p.y); if (d < bd) { bd = d; best = e; } }
      } else if (!player.dead) {
        const d = dist2(player.x, player.y, p.x, p.y); if (d < bd) { bd = d; best = player; }
      }
      if (best) {
        const d = Math.sqrt(dist2(best.x, best.y, p.x, p.y)) || 1;
        const turn = p.owner === 'player' ? .18 : .07;
        p.vx += (best.x - p.x) / d * turn;
        p.vy += (best.y - p.y) / d * turn;
        const sp = Math.hypot(p.vx, p.vy);
        const maxSp = Math.max(p.speed * 1.6, 3.6);
        if (sp > maxSp) { p.vx = p.vx / sp * maxSp; p.vy = p.vy / sp * maxSp; }
      }
    }
    if (p.trail && p.age % 2 === 0) {
      const tx = Math.round(p.x - p.vx * .5), ty = Math.round(p.y - p.vy * .5);
      if (inside(tx, ty) && get(tx, ty) === M.AIR && rng() < .55) ignite(tx, ty, 16);
      addParticle(p.x, p.y, 'ember', '#ff9c42', rnd(-.4, .4), rnd(-.4, .2), 18);
    }
    p.vy += p.gravity;
    // substepped movement to avoid tunneling
    const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy) / 1.5));
    let consumed = false;
    for (let s = 0; s < steps && !consumed; s++) {
      p.x += p.vx / steps;
      p.y += p.vy / steps;
      if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) { p.dead = true; break; }
      const m = get(p.x, p.y);
      if (isBlocking(m) && m !== M.SNOW) {
        if (p.bounce > 0) {
          p.bounce--;
          // crude normal: reflect both axes, nudge out
          p.vx *= -.86; p.vy *= -.86;
          p.x -= p.vx * .3; p.y -= p.vy * .3 - 1;
          camShake = Math.min(4, camShake + .4);
          for (let k = 0; k < 3; k++) addParticle(p.x, p.y, 'spark', p.color, rnd(-1, 1), rnd(-1, .2), 12);
          if (p.bounce === 0 && p.explode) { detonateProjectile(p, null, 'bounce'); consumed = true; }
          break;
        } else {
          detonateProjectile(p, { x: p.x, y: p.y }, 'hit'); consumed = true; break;
        }
      }
      if (p.owner === 'player') {
        for (const e of enemies) {
          if (e.dead) continue;
          if (dist2(e.x, e.y, p.x, p.y) < (e.r + p.radius) * (e.r + p.radius)) {
            if (p.pierce > 0) {
              const last = p.hitSet[e.uid] || -99;
              if (frame - last > 8) {
                p.hitSet[e.uid] = frame;
                hurtEnemy(e, p.dmg * .72, 'player', p.element);
                applyElementToEnemy(e, p.element);
                p.hitTick = 5;
              }
              break;
            } else {
              hurtEnemy(e, p.dmg, 'player', p.element);
              applyElementToEnemy(e, p.element);
              if (p.element === 'electric' && p.chain) chainLightning(p, e);
              p.dead = true;
              detonateProjectile(p, { x: p.x, y: p.y }, 'enemy');
              consumed = true; break;
            }
          }
        }
      } else {
        if (!player.dead && dist2(player.x, player.y, p.x, p.y) < (6 + p.radius) * (6 + p.radius)) {
          hurtPlayer(p.dmg, p.element === 'ice' ? 'freeze' : 'projectile', `被${enemyLabel(p.enemyType)}的远程法术击中`, false);
          if (p.element === 'ice') player.frozen = Math.max(player.frozen, 55);
          if (p.element === 'fire') player.burning = Math.max(player.burning, 90);
          if (p.element === 'toxic') player.poison = Math.max(player.poison, 120);
          p.dead = true;
          detonateProjectile(p, { x: p.x, y: p.y }, 'playerhit');
          consumed = true; break;
        }
      }
    }
    if (consumed) continue;
    // acid / water trail on the ground
    if (p.element === 'water' && p.age % 3 === 0) {
      const tx = Math.round(p.x), ty = Math.round(p.y + 1);
      if (inside(tx, ty) && (get(tx, ty) === M.AIR || get(tx, ty) === M.FIRE)) setm(tx, ty, M.WATER);
    }
    if (p.element === 'acid' && p.age % 4 === 0) {
      const tx = Math.round(p.x + rnd(-2, 2)), ty = Math.round(p.y + rnd(-1, 2));
      if (inside(tx, ty) && get(tx, ty) === M.AIR) setm(tx, ty, M.ACID);
    }
    p.life--;
    if (p.life <= 0) detonateProjectile(p, { x: p.x, y: p.y }, 'expire');
  }
  // beams
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.life--;
    updateBeam(b);
    if (b.life <= 0) beams.splice(i, 1);
  }
  // flashes
  for (let i = flashes.length - 1; i >= 0; i--) {
    flashes[i].life--;
    if (flashes[i].life <= 0) flashes.splice(i, 1);
  }
}

function updateBeam(b) {
  const steps = Math.ceil(b.len / 2);
  let endX = b.x, endY = b.y;
  for (let s = 0; s < steps; s++) {
    const x = Math.round(b.x + Math.cos(b.angle) * s * 2);
    const y = Math.round(b.y + Math.sin(b.angle) * s * 2);
    if (!inside(x, y)) break;
    endX = x; endY = y;
    const m = get(x, y);
    if (isBlocking(m)) {
      if (m !== M.HOLY && b.dig) destroyCell(x, y, b.dig, 'dig');
      else if (m === M.HOLY) break;
      if (rng() < .5) break;
    }
    if (b.owner === 'player') {
      for (const e of enemies) {
        if (!e.dead && dist2(e.x, e.y, x, y) < (e.r + 3) * (e.r + 3)) {
          if (frame % 3 === 0) hurtEnemy(e, b.dmg, 'player', 'dig');
        }
      }
    } else if (!player.dead && dist2(player.x, player.y, x, y) < 30) {
      if (frame % 4 === 0) hurtPlayer(b.dmg * .5, 'projectile', '被光束灼烧', false);
    }
  }
  b.endX = endX; b.endY = endY;
  if (frame % 2 === 0) addParticle(endX, endY, 'spark', b.color, rnd(-1, 1), rnd(-1, 1), 12);
  addFlash(endX, endY, 12, b.color);
}

function detonateProjectile(p, at, why) {
  if (p.dead && why !== 'enemy') { /* still allow expire */ }
  const x = at ? at.x : p.x, y = at ? at.y : p.y;
  const sp = SPELLS[p.id] || {};
  if (p.explode > 0) {
    explodeAt(x, y, p.explode, p.dmg * .85, p.owner === 'player' ? 'player' : 'enemy', p.explode > 18 ? 15 : 11);
  } else {
    // small impact effects
    for (let i = 0; i < 8; i++) addParticle(x, y, 'spark', p.color, rnd(-1.6, 1.6), rnd(-1.6, 1.2), rint(10, 24));
    if (p.element === 'fire') {
      for (let i = 0; i < 3; i++) { const tx = Math.round(x + rnd(-2, 2)), ty = Math.round(y + rnd(-2, 2)); if (inside(tx, ty) && get(tx, ty) === M.AIR) ignite(tx, ty, 30); }
    }
    if (p.element === 'toxic') {
      for (let i = 0; i < 8; i++) { const tx = Math.round(x + rnd(-3, 3)), ty = Math.round(y + rnd(-3, 3)); if (inside(tx, ty) && get(tx, ty) === M.AIR) { setm(tx, ty, M.POISON, true); world.life[idx(tx, ty)] = rint(80, 180); } }
    }
    if (p.element === 'water') {
      for (let i = 0; i < 7; i++) { const tx = Math.round(x + rnd(-2, 2)), ty = Math.round(y + rnd(-2, 2)); if (inside(tx, ty) && get(tx, ty) === M.AIR) setm(tx, ty, M.WATER); }
    }
    if (p.element === 'acid') {
      for (let i = 0; i < 6; i++) { const tx = Math.round(x + rnd(-2, 2)), ty = Math.round(y + rnd(-2, 2)); if (inside(tx, ty) && get(tx, ty) === M.AIR) setm(tx, ty, M.ACID); }
    }
    if (p.element === 'ice') {
      for (let i = 0; i < 4; i++) { const tx = Math.round(x + rnd(-2, 2)), ty = Math.round(y + rnd(-2, 2)); if (inside(tx, ty) && get(tx, ty) === M.WATER) setm(tx, ty, M.ICE); }
    }
    addFlash(x, y, 10, p.color);
  }
  // trigger payload
  if (p.payload && (p.trigger === 'hit' ? (why === 'hit' || why === 'enemy') : true)) {
    const angle = Math.atan2(p.vy, p.vx);
    spawnPayload(p.payload, x, y, angle, p.owner);
  }
  if (p.owner === 'player' && (why === 'enemy' || why === 'hit')) {
    camShake = Math.min(6, camShake + .5);
    sfxImpact(p.element || 'hit');
  }
  p.dead = true;
}

function chainLightning(p, from) {
  let cur = from, hits = 0;
  const hit = new Set([from.uid]);
  while (hits < p.chain) {
    let best = null, bd = 110 * 110;
    for (const e of enemies) {
      if (e.dead || hit.has(e.uid)) continue;
      const d = dist2(e.x, e.y, cur.x, cur.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    hit.add(best.uid);
    hurtEnemy(best, p.dmg * .55, 'player', 'electric');
    // visual arc
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      addParticle(lerp(cur.x, best.x, t) + rnd(-3, 3), lerp(cur.y, best.y, t) + rnd(-3, 3), 'arc', '#d9f7ff', 0, 0, 12);
    }
    cur = best; hits++;
  }
}

function applyElementToEnemy(e, el) {
  if (!el) return;
  if (el === 'fire') e.burning = Math.max(e.burning || 0, 120);
  if (el === 'ice') e.frozen = Math.max(e.frozen || 0, 85);
  if (el === 'toxic') e.poison = Math.max(e.poison || 0, 140);
  if (el === 'acid') e.acid = Math.max(e.acid || 0, 100);
  if (el === 'water') e.wet = Math.max(e.wet || 0, 180);
}


/* ---------------------------------------------------------------------------
   15. CREATURES
   ------------------------------------------------------------------------- */
const ENEMY_DEFS = {
  crag: { name: '岩背獠', hp: 34, r: 5, w: 9, h: 9, speed: .86, touch: 9, gold: [4, 11], desc: '会冲刺撕咬的岩皮兽' },
  spitter: { name: '孢囊行者', hp: 27, r: 5, w: 9, h: 11, speed: .42, touch: 4, gold: [5, 13], desc: '抛射孢子的菌人' },
  flyer: { name: '幽浮眼', hp: 20, r: 5, w: 9, h: 7, speed: .95, touch: 5, gold: [5, 12], desc: '漂浮并俯冲的眼球' },
  bomber: { name: '爆晶甲虫', hp: 19, r: 4, w: 7, h: 7, speed: .9, touch: 6, gold: [6, 14], desc: '靠近后自爆的晶虫' },
  burrower: { name: '沙喉虫', hp: 40, r: 5, w: 11, h: 8, speed: .7, touch: 11, gold: [7, 16], desc: '在岩层中潜行、从脚下钻出' },
  wraith: { name: '霜缚幽魂', hp: 31, r: 6, w: 9, h: 13, speed: .62, touch: 6, gold: [8, 18], desc: '短距传送并发射冰锥' },
  sentinel: { name: '锈铁卫兵', hp: 66, r: 6, w: 10, h: 13, speed: .32, touch: 8, gold: [10, 22], desc: '装甲厚重，三连射' },
  boss: { name: '熔心巨眼', hp: 1250, r: 21, w: 34, h: 32, speed: .5, touch: 18, gold: [300, 400], desc: '地底的心脏' }
};
let enemyUid = 1;

function spawnEnemy(type, x, y, bi) {
  const d = ENEMY_DEFS[type];
  if (!d) return null;
  const e = {
    uid: enemyUid++, type, name: d.name, x, y, vx: 0, vy: 0, w: d.w, h: d.h, r: d.r,
    hp: d.hp * (type === 'boss' ? 1 : (1 + bi * .13)),
    maxHp: d.hp * (type === 'boss' ? 1 : (1 + bi * .13)),
    speed: d.speed, touch: d.touch, dir: rng() < .5 ? -1 : 1,
    onGround: false, dead: false, flash: 0, burn: 0, burning: 0, frozen: 0, poison: 0, wet: 0, acid: 0,
    cd: rint(30, 100), touchCd: 0, state: 'idle', timer: 0, phase: rng() * 8,
    bi: bi || 1, hidden: type === 'burrower', fuse: 0, summonCd: 300, attackMode: 0,
    hitCd: 0, anim: rng() * 10
  };
  if (type === 'burrower') { e.hidden = true; e.y = Math.min(H - 20, y + 20); }
  if (isBlocking(get(e.x, e.y))) {
    for (let yy = e.y; yy > e.y - 60; yy--) if (get(e.x, yy) === M.AIR) { e.y = yy; break; }
  }
  enemies.push(e);
  return e;
}

function enemyLabel(type) { return (ENEMY_DEFS[type] && ENEMY_DEFS[type].name) || '未知生物'; }

function hurtEnemy(e, dmg, source, element) {
  if (!e || e.dead) return;
  if (e.hitCd > frame - 1 && source === 'player' && dmg < 20) return;
  let crit = false;
  if (source === 'player') {
    const chance = .02 + (player.blood > 0 ? .06 : 0) + (player.perks.crit ? .18 : 0);
    if (rng() < chance) { crit = true; dmg *= 3; }
  }
  if (e.type === 'sentinel' && element !== 'explosion' && element !== 'electric') dmg *= .72;
  if (e.frozen > 0) dmg *= 1.35;
  e.hp -= dmg;
  e.flash = 4;
  e.hitCd = frame;
  for (let i = 0; i < (crit ? 8 : 4); i++) {
    addParticle(e.x + rnd(-e.r, e.r), e.y + rnd(-e.r, e.r), crit ? 'crit' : 'hit',
      crit ? '#fff3b0' : (getMatColor(e.type === 'bomber' ? M.CRYSTAL : M.BLOOD)), rnd(-1.3, 1.3), rnd(-1.5, .5), rint(10, 22));
  }
  if (source === 'player') {
    camShake = Math.min(9, camShake + (crit ? 2.2 : .55));
    if (crit) { addFlash(e.x, e.y, 18, '#ffe9a0'); sfxCrit(); }
    else sfxHit();
  }
  if (e.hp <= 0) killEnemy(e, element, source === 'player');
}

function killEnemy(e, element, byPlayer) {
  if (e.dead) return;
  e.dead = true;
  if (byPlayer !== false) { player.kills++; run.kills++; }
  if (byPlayer !== false && player.perks.vampire) player.hp = Math.min(player.maxHp, player.hp + 3);
  const d = ENEMY_DEFS[e.type];
  const n = rint(d.gold[0], d.gold[1]);
  if (e.type === 'boss') {
    for (let i = 0; i < 30; i++) {
      pickups.push({ type: 'gold', x: e.x + rnd(-30, 30), y: e.y + rnd(-20, 20), w: 5, h: 5, vx: rnd(-2, 2), vy: rnd(-3, -.3), value: rint(8, 20), taken: false });
    }
    addFlash(e.x, e.y, 170, '#ffb060');
    camShake = 18;
    sfxBossDeath();
    run.boss = true;
    bossWinTimer = 100;
    showBanner('熔心已熄', 'THE EMBER HEART IS SILENT');
  } else {
    pickups.push({ type: 'gold', x: e.x, y: e.y, w: 4, h: 4, vx: rnd(-1, 1), vy: -1.4, value: n, taken: false });
    if (rng() < .08) pickups.push({ type: 'spell', x: e.x, y: e.y - 2, w: 8, h: 8, spellId: randomSpellId(e.bi), taken: false });
    if (rng() < .055) pickups.push({ type: 'heart', x: e.x, y: e.y - 2, w: 8, h: 8, taken: false });
    sfxKill();
  }
  const gore = e.type === 'boss' ? 26 : 6;
  for (let i = 0; i < gore; i++) {
    const gx = Math.round(e.x + rnd(-e.r - 2, e.r + 2)), gy = Math.round(e.y + rnd(-e.r - 2, e.r + 2));
    if (inside(gx, gy) && get(gx, gy) === M.AIR && rng() < .55) setm(gx, gy, M.BLOOD);
  }
  for (let i = 0; i < (e.type === 'boss' ? 40 : 12); i++) {
    addParticle(e.x + rnd(-e.r, e.r), e.y + rnd(-e.r, e.r), 'blood',
      rng() < .55 ? '#8e2b35' : (e.type === 'bomber' ? '#8fdde6' : '#6b222a'), rnd(-2.4, 2.4), rnd(-3, .6), rint(20, 55), rnd(1, 2));
  }
}

function updateEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { if (e.type !== 'boss' || e.deathGone) enemies.splice(i, 1); else { e.deathGone = true; } continue; }
    if (e.hitCd > 0) e.hitCd--;
    if (e.flash > 0) e.flash--;
    if (e.touchCd > 0) e.touchCd--;
    e.anim += .1;
    if (e.burning > 0) {
      e.burning--;
      if (frame % 24 === 0) hurtEnemy(e, Math.max(1, e.maxHp * .02), 'env', 'fire');
      if (frame % 4 === 0) addParticle(e.x + rnd(-3, 3), e.y + rnd(-4, 3), 'ember', '#ff9f45', rnd(-.3, .3), rnd(-1.5, -.3), 18);
    }
    if (e.poison > 0) {
      e.poison--;
      if (frame % 36 === 0) hurtEnemy(e, 1.5, 'env', 'toxic');
    }
    if (e.acid > 0) {
      e.acid--;
      if (frame % 20 === 0) hurtEnemy(e, 3, 'env', 'acid');
    }
    if (e.frozen > 0) {
      e.frozen--;
      e.vx *= .7;
      if (e.burning > 0) e.frozen = 0;
    }
    // environment contact
    const em = get(e.x, e.y);
    if (em === M.WATER) { e.wet = 200; e.burning = 0; }
    if (em === M.LAVA) { if (frame % 18 === 0) hurtEnemy(e, 24, 'env', 'lava'); e.burning = 120; }
    if (em === M.ACID && frame % 24 === 0) hurtEnemy(e, 10, 'env', 'acid');
    if (em === M.FIRE && !e.burning) e.burning = 90;
    if ((em === M.POISON || get(e.x, e.y - 3) === M.POISON) && !e.poison) e.poison = 100;

    if (e.type === 'boss') updateBoss(e);
    else if (e.frozen <= 0) updateEnemyAI(e);

    // contact damage
    if (!e.hidden && e.touchCd <= 0 && Math.abs(e.x - player.x) < (e.w / 2 + 5) && Math.abs(e.y - player.y) < (e.h / 2 + 7)) {
      hurtPlayer(e.touch, 'melee', `被${e.name}撕开`, false);
      e.touchCd = 38;
      player.vx += sign(player.x - e.x) * .8;
      player.vy -= .6;
    }
    // despawn if very far away and never seen? keep world alive but cap
  }
  if (enemies.length > 90) {
    // remove far away ordinary enemies first
    enemies.sort((a, b) => (dist2(a.x, a.y, player.x, player.y) - dist2(b.x, b.y, player.x, player.y)));
    while (enemies.length > 90) {
      const idx = enemies.findIndex(e => e.type !== 'boss' && dist2(e.x, e.y, player.x, player.y) > 480 * 480);
      if (idx < 0) break;
      enemies.splice(idx, 1);
    }
  }
}

function updateEnemyAI(e) {
  const dx = player.x - e.x, dy = player.y - e.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const distP = Math.hypot(dx, dy) || 1;
  e.dir = dx < 0 ? -1 : 1;
  e.onGround = solidAtRect(e.x, e.y + e.h / 2 + 1, e.w, 2);

  switch (e.type) {
    case 'crag': {
      e.vx += sign(dx) * .028;
      e.vx *= .88;
      e.vx = clamp(e.vx, -e.speed, e.speed);
      e.vy = Math.min(e.vy + .2, 5.2);
      // hop over walls, leap at player
      if (e.onGround && (e.vx * e.dir < .05 || (distP < 55 && e.cd <= 0 && dy < 10))) {
        e.vy = -3.3;
        e.cd = rint(45, 90);
      }
      if (distP < 70 && e.cd <= 0 && e.onGround) { e.vy = -2.5; e.vx = e.dir * 1.7; e.cd = 70; }
      moveBody(e, e.vx, e.vy, e.w, e.h);
      break;
    }
    case 'spitter': {
      const want = distP < 75 ? -1 : distP > 150 ? 1 : 0;
      e.vx += want * sign(dx) * .026;
      e.vx *= .9; e.vx = clamp(e.vx, -e.speed, e.speed);
      e.vy = Math.min(e.vy + .2, 5.2);
      if (e.onGround && (e.vx * e.dir < .02 || e.cd < 0)) { e.vy = -2.6; e.cd = rint(70, 120); }
      moveBody(e, e.vx, e.vy, e.w, e.h);
      e.cd--;
      if (e.cd <= 0 && distP < 235 && !e.blockedSight) {
        const lead = Math.atan2(dy - 14, dx);
        const p = spawnEnemyProjectile(e, lead - .12, 3.6, 8, '#b9dd6a', { gravity: .075, radius: 3, life: 140, element: 'toxic', glow: .4 });
        p.vy -= 1.05;
        e.cd = rint(90, 145);
        sfxEnemyShoot();
      }
      break;
    }
    case 'flyer': {
      const targetY = player.y - 44 + Math.sin(frame * .03 + e.phase) * 20;
      e.vx += sign(dx) * .035;
      e.vy += sign(targetY - e.y) * .025;
      e.vx *= .95; e.vy *= .95;
      e.vx = clamp(e.vx, -e.speed, e.speed);
      e.vy = clamp(e.vy, -e.speed, e.speed);
      if (distP < 110 && e.cd <= 0) { e.vx = sign(dx) * 2.1; e.vy = Math.max(-1.8, dy * .04); e.cd = 100; }
      moveBody(e, e.vx, e.vy, e.w, e.h);
      if (solidAtRect(e.x, e.y, e.w, e.h)) e.y -= 1.2;
      e.cd--;
      break;
    }
    case 'bomber': {
      e.vx += sign(dx) * .04;
      e.vx *= .9; e.vx = clamp(e.vx, -e.speed, e.speed);
      e.vy = Math.min(e.vy + .2, 5.2);
      if (e.onGround && (Math.abs(e.vx) < .1 || e.cd < -40)) { e.vy = -3; e.cd = rint(50, 100); }
      moveBody(e, e.vx, e.vy, e.w, e.h);
      e.cd--;
      if (distP < 42 && e.fuse <= 0) e.fuse = 46;
      if (e.fuse > 0) {
        e.fuse--;
        if (e.fuse % 8 === 0) addParticle(e.x + rnd(-4, 4), e.y + rnd(-4, 4), 'spark', '#9fe9f2', 0, 0, 10);
        if (e.fuse <= 0) {
          explodeAt(e.x, e.y, 22, 34, 'enemy', 13);
          e.dead = true;
          for (let i = 0; i < 18; i++) addParticle(e.x, e.y, 'shard', '#8fdde6', rnd(-2.6, 2.6), rnd(-2.6, 1), 32, 2);
        }
      }
      break;
    }
    case 'burrower': {
      if (e.hidden) {
        // moves through the mountain toward the player
        const spd = .62;
        e.x += sign(dx) * spd;
        e.y += sign(dy) * spd * .7;
        e.x = clamp(e.x, 12, W - 12); e.y = clamp(e.y, 140, H - 20);
        if (frame % 8 === 0) {
          const m = get(e.x, e.y);
          if (isBlocking(m) && m !== M.HOLY && m !== M.DENSE) setm(e.x, e.y, M.AIR);
          addParticle(e.x, e.y, 'dust', getMatColor(M.SAND), rnd(-.5, .5), rnd(-.4, .2), 20);
          if (m === M.AIR) e.y += .8;
        }
        if (distP < 58 && dy < 20) {
          e.hidden = false;
          e.y -= 4;
          e.vy = -4.2;
          e.timer = 60;
          addFlash(e.x, e.y, 18, '#b59a68');
          camShake = Math.min(6, camShake + 2);
        }
      } else {
        e.vx += sign(dx) * .035;
        e.vx *= .9; e.vx = clamp(e.vx, -e.speed, e.speed);
        e.vy = Math.min(e.vy + .2, 5.2);
        if (e.onGround && Math.abs(e.vx) < .2) e.vy = -3.1;
        moveBody(e, e.vx, e.vy, e.w, e.h);
        e.timer--;
        if (e.timer <= 0 && distP > 90) { e.hidden = true; e.timer = 0; }
      }
      break;
    }
    case 'wraith': {
      const targetY = player.y - 55 + Math.sin(frame * .04 + e.phase) * 16;
      e.vx += sign(dx) * .022;
      e.vy += sign(targetY - e.y) * .018;
      e.vx *= .955; e.vy *= .955;
      e.vx = clamp(e.vx, -.85, .85); e.vy = clamp(e.vy, -.75, .75);
      moveBody(e, e.vx, e.vy, e.w, e.h);
      e.cd--;
      if (e.cd <= 0) {
        const a = Math.atan2(dy, dx);
        spawnEnemyProjectile(e, a, 3.3, 9, '#a8e6ff', { homing: true, element: 'ice', radius: 2, life: 150, glow: .7 });
        e.cd = rint(95, 150);
        sfxEnemyShoot();
      }
      if (distP < 55 && e.timer <= 0) {
        // blink away
        for (let tries = 0; tries < 12; tries++) {
          const nx = clamp(e.x + rnd(-70, 70), 20, W - 20), ny = clamp(e.y + rnd(-50, 20), 150, H - 20);
          if (get(nx, ny) === M.AIR) {
            for (let k = 0; k < 8; k++) addParticle(e.x, e.y, 'shard', '#a8e6ff', rnd(-1, 1), rnd(-1, 1), 20);
            e.x = nx; e.y = ny; e.timer = 90;
            break;
          }
        }
      }
      e.timer--;
      break;
    }
    case 'sentinel': {
      e.vx += sign(dx) * .014;
      e.vx *= .9; e.vx = clamp(e.vx, -e.speed, e.speed);
      e.vy = Math.min(e.vy + .2, 5.2);
      moveBody(e, e.vx, e.vy, e.w, e.h);
      e.cd--;
      if (e.cd <= 0 && distP < 260 && ady < 90) {
        const a = Math.atan2(dy, dx);
        for (let k = -1; k <= 1; k++) spawnEnemyProjectile(e, a + k * .08, 3.2, 7, '#ffbb72', { radius: 2, life: 150, glow: .5 });
        e.cd = rint(120, 180);
        sfxEnemyShoot();
      }
      break;
    }
  }
  e.y = clamp(e.y, 10, H - 10);
}

function updateBoss(e) {
  const dx = player.x - e.x, dy = player.y - e.y;
  const distP = Math.hypot(dx, dy) || 1;
  const targetY = BIOMES[7].y0 + 100 + Math.sin(frame * .012) * 26;
  const targetX = W / 2 + Math.sin(frame * .007) * 90;
  e.vx += sign(targetX - e.x) * .007 + Math.sin(frame * .017 + e.phase) * .004;
  e.vy += sign(targetY - e.y) * .008;
  e.vx *= .975; e.vy *= .975;
  e.x += e.vx; e.y += e.vy;
  e.x = clamp(e.x, 300, 420);
  e.y = clamp(e.y, BIOMES[7].y0 + 60, BIOMES[7].y0 + 150);
  e.cd--;
  e.summonCd--;
  const hpRatio = e.hp / e.maxHp;
  e.attackMode = (e.attackMode + 1) % 600;
  if (e.cd <= 0) {
    if (hpRatio > .55) {
      // radial ring
      const n = 14 + Math.floor((1 - hpRatio) * 10);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + frame * .01;
        spawnEnemyProjectile(e, a, 1.9, 13, '#ff9b62', { radius: 3, life: 220, glow: .8, element: 'fire' });
      }
      addFlash(e.x, e.y, 55, '#ff8d4d');
      camShake = Math.min(9, camShake + 3);
      sfxBossCast();
      e.cd = 135;
    } else {
      // homing meteors + ring
      for (let i = 0; i < 4; i++) {
        const a = Math.atan2(dy, dx) + (i - 1.5) * .22;
        spawnEnemyProjectile(e, a, 2.2, 16, '#ffc06a', { homing: true, radius: 4, life: 260, glow: 1, element: 'fire' });
      }
      if (frame % 2 === 0) addFlash(e.x, e.y, 40, '#ff6a36');
      sfxBossCast();
      e.cd = 95;
    }
  }
  if (e.summonCd <= 0 && hpRatio < .7) {
    for (let i = 0; i < 2; i++) spawnEnemy('flyer', e.x + rnd(-40, 40), e.y + rnd(-20, 20), 8);
    e.summonCd = 520;
    showBanner('熔心在召唤', 'MINIONS OF THE HEART');
  }
  // sweeping beam in enrage
  if (hpRatio < .4 && frame % 280 === 0) {
    const a = Math.atan2(dy, dx);
    beams.push({ x: e.x, y: e.y, angle: a, len: 230, life: 42, maxLife: 42, dmg: 14, dig: 0, owner: 'enemy', color: '#ff7a42', width: 3, sweep: .012 });
  }
  for (const b of beams) if (b.owner === 'enemy' && b.sweep) b.angle += b.sweep;
}

/* ---------------------------------------------------------------------------
   16. PICKUPS / INTERACTION / LOOT
   ------------------------------------------------------------------------- */
function updatePickups() {
  const magnetR = player.perks.magnet ? 90 : 34;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    if (p.taken) { pickups.splice(i, 1); continue; }
    if (p.type === 'gold') {
      const d = dist(p.x, p.y, player.x, player.y);
      if (d < magnetR) {
        const sp = .25 + (1 - d / magnetR) * .4;
        p.x += (player.x - p.x) / (d || 1) * sp * 2;
        p.y += (player.y - p.y) / (d || 1) * sp * 2;
      } else {
        p.vy = (p.vy || 0) + .11;
        p.vx = (p.vx || 0) * .985;
        if (p.vx) p.x += p.vx; if (p.vy) p.y += p.vy;
        if (isBlocking(get(p.x, p.y + 2))) { p.vy *= -.25; p.vx *= .7; p.y -= .6; }
        if (p.y > H - 4) p.y = H - 4;
      }
      if (d < 9) {
        p.taken = true;
        let v = p.value || 1;
        if (player.perks.greed) v *= 2;
        run.gold += v;
        sfxCoin();
        for (let k = 0; k < 3; k++) addParticle(p.x, p.y, 'spark', '#ffd968', rnd(-.6, .6), rnd(-1, 0), 16);
      }
    } else if (p.type === 'heart') {
      if (dist(p.x, p.y, player.x, player.y) < 16) {
        p.taken = true;
        player.hp = Math.min(player.maxHp, player.hp + 22);
        toast('+22 生命');
        sfxHeal();
        for (let k = 0; k < 12; k++) addParticle(p.x, p.y, 'spark', '#e6a2ab', rnd(-1, 1), rnd(-1.4, -.2), 24);
      }
    } else {
      p.bob = (p.bob || 0) + .05;
    }
  }
}

function detectInteraction() {
  interactTarget = null;
  if (player.dead || gameState !== 'play') { UI.prompt.classList.remove('show'); return; }
  let best = null, bd = 26 * 26;
  const consider = (t, x, y, label, data) => {
    const d = dist2(player.x, player.y, x, y);
    if (d < bd) { bd = d; best = { t, x, y, label, data }; }
  };
  for (const p of pickups) {
    if (p.type === 'gold' || p.type === 'heart' || p.taken) continue;
    if (p.type === 'chest') consider('chest', p.x, p.y, p.opened ? '空宝箱' : '打开宝箱', p);
    if (p.type === 'wand') consider('wand', p.x, p.y, '拾取法杖 · ' + p.wand.name, p);
    if (p.type === 'spell') consider('spell', p.x, p.y, '拾取法术 · ' + (SPELLS[p.spellId] ? SPELLS[p.spellId].name : '?'), p);
  }
  if (world.workbench && dist2(player.x, player.y, world.workbench.x, world.workbench.y) < 30 * 30)
    consider('workbench', world.workbench.x, world.workbench.y, '旧工作台 · 编排魔杖', null);
  for (const room of world.holy) {
    if (Math.abs(player.y - room.y0) > 140) continue;
    if (dist2(player.x, player.y, room.altar.x, room.altar.y) < 30 * 30) consider('altar', room.altar.x, room.altar.y, '魔杖编辑台 · 整理法术顺序', room);
    if (dist2(player.x, player.y, room.portal.x, room.portal.y) < 28 * 28) {
      const label = room.blessing ? '步入下行传送门' : '传送门被祝福封印 —— 先选择祝福';
      consider('portal', room.portal.x, room.portal.y, label, room);
    }
    if (room.shopItems) {
      room.shopItems.forEach((it, si) => {
        if (!it) return;
        const ped = room.shop[si];
        if (dist2(player.x, player.y, ped.x, ped.y) < 28 * 28) consider('shop', ped.x, ped.y, `购买 ${it.name} · ${it.cost} ◈`, { room, item: it, index: si });
      });
    }
  }
  interactTarget = best;
  if (best) {
    UI.promptText.textContent = best.label;
    UI.prompt.classList.add('show');
  } else UI.prompt.classList.remove('show');
}

function interact() {
  const t = interactTarget;
  if (!t) {
    // maybe auto-open editor with R; E does nothing
    return;
  }
  if (t.t === 'chest') openChest(t.data);
  else if (t.t === 'wand') takeWand(t.data);
  else if (t.t === 'spell') takeSpell(t.data);
  else if (t.t === 'altar') openEditor(t.data);
  else if (t.t === 'workbench') openEditor(null, true);
  else if (t.t === 'portal') usePortal(t.data);
  else if (t.t === 'shop') buyShop(t.data);
}

function openChest(p) {
  if (p.opened) { toast('宝箱已经空了'); return; }
  p.opened = true;
  sfxChest();
  addFlash(p.x, p.y, 20, '#ffd76e');
  for (let i = 0; i < rint(4, 7); i++) {
    pickups.push({ type: 'gold', x: p.x + rnd(-5, 5), y: p.y - 4, w: 4, h: 4, vx: rnd(-1.3, 1.3), vy: rnd(-2.4, -1), value: rint(6, 18), taken: false });
  }
  const r = rng();
  if (r < .28) {
    pickups.push({ type: 'wand', x: p.x + rnd(-6, 6), y: p.y - 3, w: 9, h: 12, wand: makeRandomWand(clamp(Math.floor((p.y - 100) / 340), 1, 7), p.y), taken: false });
  } else if (r < .78) {
    pickups.push({ type: 'spell', x: p.x + rnd(-5, 5), y: p.y - 3, w: 8, h: 8, spellId: randomSpellId(clamp(Math.floor((p.y - 100) / 340), 1, 7)), taken: false });
  } else {
    pickups.push({ type: 'heart', x: p.x + rnd(-4, 4), y: p.y - 3, w: 8, h: 8, taken: false });
  }
  toast('宝箱开了');
}

function takeWand(p) {
  if (p.taken) return;
  if (wands.length < 4) {
    wands.push(p.wand);
    currentWand = wands.length - 1;
    p.taken = true;
    toast(`获得法杖：${p.wand.name}`);
  } else {
    const old = wands[currentWand];
    wands[currentWand] = p.wand;
    p.wand = old;
    p.wand.name = old.name;
    p.wand.mana = old.mana;
    toast(`替换为 ${p.wand.name}，旧杖留在原地`);
  }
  sfxWand();
  addFlash(p.x, p.y, 18, '#d8b25e');
}

function takeSpell(p) {
  if (p.taken) return;
  p.taken = true;
  addSpellToInventory(p.spellId);
  const sp = SPELLS[p.spellId];
  toast(`获得法术：${sp ? sp.name : p.spellId}`);
  sfxSpell();
  addFlash(p.x, p.y, 16, sp ? sp.color : '#fff');
}

function buyShop(data) {
  const { room, item, index } = data;
  if (run.gold < item.cost) { toast('金币不足'); sfxEmpty(); return; }
  run.gold -= item.cost;
  room.shopItems[index] = null;
  if (item.kind === 'heal') {
    player.hp = Math.min(player.maxHp, player.hp + 45);
    toast('温热血瓶 · +45 生命');
    sfxHeal();
  } else if (item.kind === 'spell') {
    addSpellToInventory(item.spellId);
    toast('获得法术：' + SPELLS[item.spellId].name);
    sfxSpell();
  } else if (item.kind === 'wand') {
    if (wands.length < 4) { wands.push(item.wand); currentWand = wands.length - 1; }
    else { const old = wands[currentWand]; wands[currentWand] = item.wand; pickups.push({ type: 'wand', x: room.altar.x, y: room.altar.y, w: 9, h: 12, wand: old, taken: false }); }
    toast('获得法杖：' + item.wand.name);
    sfxWand();
  }
}

function ensureShop(room) {
  if (room.shopItems) return;
  const tier = clamp(room.n + 1, 1, 6);
  room.shopItems = [
    { kind: 'heal', name: '温热血瓶', cost: 40, glyph: '♥', color: '#d36972' },
    { kind: 'spell', name: SPELLS[randomSpellId(tier)] ? '未知法术卷轴' : '法术卷轴', cost: 70, spellId: randomSpellId(tier), glyph: '✧', color: '#a4dcff' },
    { kind: 'wand', name: '封印法杖', cost: 130, wand: makeRandomWand(tier + 1, room.y0), glyph: '⚚', color: '#e7c478' }
  ];
  room.shopItems[1].name = '法术卷轴 · ' + (SPELLS[room.shopItems[1].spellId] ? SPELLS[room.shopItems[1].spellId].name : '未知');
  room.shopItems[2].name = '法杖 · ' + room.shopItems[2].wand.name;
}

/* ---------------------------------------------------------------------------
   17. HOLY MOUNTAIN / PERKS / PORTALS / WIN
   ------------------------------------------------------------------------- */
let holyPending = null, bossWinTimer = 0, perkRoom = null;

function checkHolyEntrance() {
  for (const room of world.holy) {
    if (player.x > room.x0 && player.x < room.x1 && player.y > room.y0 && player.y < room.y1) {
      ensureShop(room);
      if (!room.visited) {
        room.visited = true;
        player.hp = player.maxHp;
        player.mana = player.manaMax;
        for (const w of wands) { w.mana = w.manaMax; w.timer = 0; w.rechargeTimer = 0; }
        showBanner('灰烬圣所', 'ASHEN SANCTUM · 伤口愈合，法力充盈');
        toast('圣所的空气温暖而安全。选择一项祝福。');
        holyPending = { room, timer: 45 };
        sfxHoly();
        addFlash(room.cx, room.y0 + 30, 100, '#e8d28a');
      }
      return;
    }
  }
}

function updateFlow() {
  if (holyPending) {
    holyPending.timer--;
    if (holyPending.timer <= 0) {
      const room = holyPending.room;
      holyPending = null;
      offerPerks(room);
    }
  }
  if (bossWinTimer > 0) {
    bossWinTimer--;
    if (bossWinTimer === 0) winGame();
  }
  if (transitionDir !== 0) {
    transition += transitionDir * .045;
    if (transitionDir > 0 && transition >= 1) {
      transition = 1;
      if (pendingTeleport) {
        const tp = pendingTeleport;
        pendingTeleport = null;
        player.x = tp.x; player.y = tp.y; player.vx = 0; player.vy = 0;
        camX = clamp(player.x - VW / 2, 0, W - VW);
        camY = clamp(player.y - VH * .52, 0, H - VH);
        for (let y = Math.floor(player.y) - 12; y < player.y + 10; y++)
          for (let x = Math.floor(player.x) - 10; x < player.x + 10; x++)
            if (inside(x, y)) setm(x, y, M.AIR);
        lastBiomeKey = biomeAt(player.y).key;
        showBanner(tp.name, tp.sub);
        updateHud();
      }
      transitionDir = -1;
    } else if (transitionDir < 0 && transition <= 0) { transition = 0; transitionDir = 0; }
  }
}

function offerPerks(room) {
  perkRoom = room;
  const pool = shuffled(PERK_DEFS.filter(p => !perksOwned.includes(p.id)));
  perkChoices = pool.slice(0, 3);
  if (!perkChoices.length) { room.blessing = true; return; }
  gameState = 'perk';
  pointer.down = false;
  renderPerks(room);
  sfxPerk();
}

function choosePerk(index) {
  const p = perkChoices[index];
  if (!p) return;
  applyPerk(p.id);
  perksOwned.push(p.id);
  const room = perkRoom || world.holy.find(r => r.visited && !r.blessing);
  if (room) room.blessing = true;
  perkRoom = null;
  toast(`获得祝福：${p.name}`);
  perkChoices = [];
  UI.perks.classList.add('hide');
  gameState = 'play';
  updateHud();
  sfxPerk();
}

function applyPerk(id) {
  const p = player;
  p.perks[id] = true;
  switch (id) {
    case 'glass':
      p.maxHp = Math.max(20, Math.round(p.maxHp * .75)); p.hp = Math.min(p.hp, p.maxHp);
      break;
    case 'levitation':
      p.maxLev = 180; p.lev = 180;
      break;
    case 'ward':
      p.shield += 1;
      break;
    case 'regen':
      p.hp = Math.min(p.maxHp, p.hp + 10);
      break;
  }
}

function usePortal(room) {
  if (!room.blessing) { toast('传送门被祝福封印 —— 先选择祝福'); sfxEmpty(); return; }
  const targetBiomeIndex = clamp(room.n + 1, 1, BIOMES.length - 1);
  const b = BIOMES[targetBiomeIndex];
  let targetY = b.y0 + 90;
  let tx = W / 2;
  if (world.route && world.route.length) {
    let best = null, bd = 1e9;
    for (const r of world.route) {
      if (r.y < b.y0 + 40 || r.y > b.y1 - 30) continue;
      const d = Math.abs(r.y - targetY);
      if (d < bd) { bd = d; best = r; }
    }
    if (best) { tx = best.x; targetY = best.y; }
  }
  tx = clamp(tx, 30, W - 30);
  pendingTeleport = { x: tx, y: targetY, name: b.name, sub: b.en };
  transitionDir = 1;
  sfxPortal();
  addFlash(room.portal.x, room.portal.y, 60, '#b9e7ff');
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2;
    addParticle(room.portal.x + Math.cos(a) * 8, room.portal.y - 7 + Math.sin(a) * 12,
      'spark', i % 2 ? '#b9e7ff' : '#e7f5ff', Math.cos(a) * .9, -Math.abs(Math.sin(a)) * .9 - .2, rint(20, 45));
  }
  run.depth = Math.max(run.depth, targetY - world.startSurf);
}

function winGame() {
  if (gameState === 'win') return;
  gameState = 'win';
  pointer.down = false;
  saveBest();
  $('wDepth').textContent = Math.round(run.depth) + 'm';
  $('wKills').textContent = run.kills;
  $('wGold').textContent = run.gold;
  $('wTime').textContent = fmtTime(run.time);
  UI.win.classList.remove('hide');
  audioAmbient(false);
  sfxWin();
}


/* ---------------------------------------------------------------------------
   18. RENDERING — PALETTE / SKY / TERRAIN
   ------------------------------------------------------------------------- */
const BIOME_RGB = BIOMES.map(b => b.rock.map(hexToRgb));
const PACK = [];
const PACK_LIGHT = [];
const PACK_DARK = [];
function packRGB(r, g, b, a = 255) { return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0; }
function shadeRGB(c, f) {
  let r = (c & 255) * f, g = ((c >> 8) & 255) * f, b = ((c >> 16) & 255) * f;
  return packRGB(clamp(r, 0, 255) | 0, clamp(g, 0, 255) | 0, clamp(b, 0, 255) | 0);
}
function mixRGB(a, b, t) {
  const r = (a & 255) * (1 - t) + (b & 255) * t;
  const g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t;
  const bb = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t;
  return packRGB(r | 0, g | 0, bb | 0);
}
for (let m = 0; m < MAT_COUNT; m++) {
  const cols = MAT_COLS[m];
  if (!cols) continue;
  PACK[m] = cols.map(c => packRGB(c[0], c[1], c[2]));
  PACK_LIGHT[m] = cols.map(c => shadeRGB(packRGB(c[0], c[1], c[2]), 1.24));
  PACK_DARK[m] = cols.map(c => shadeRGB(packRGB(c[0], c[1], c[2]), .72));
}
const terrainCanvas = document.createElement('canvas');
terrainCanvas.width = VW; terrainCanvas.height = VH;
const tctx = terrainCanvas.getContext('2d');
const terrainImage = tctx.createImageData(VW, VH);
const tbuf = new Uint32Array(terrainImage.data.buffer);
const skyCanvas = document.createElement('canvas');
skyCanvas.width = VW; skyCanvas.height = VH;
const sctx = skyCanvas.getContext('2d');

function drawSky() {
  const wyTop = Math.floor(camY);
  if (wyTop > 260) { sctx.fillStyle = '#04050a'; sctx.fillRect(0, 0, VW, VH); ctx.drawImage(skyCanvas, 0, 0); return; }
  const g = sctx.createLinearGradient(0, 0, 0, VH);
  const surfScreen = world.startSurf - camY;
  g.addColorStop(0, '#0d1320');
  g.addColorStop(clamp(surfScreen / VH * .9, .01, .98), '#27303c');
  g.addColorStop(1, '#4a3d30');
  sctx.fillStyle = g; sctx.fillRect(0, 0, VW, VH);
  // pale sun low on the horizon
  const sunX = 330 - camX * .08, sunY = surfScreen - 70;
  if (sunY > -80 && sunY < VH + 80) {
    const sg = sctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 90);
    sg.addColorStop(0, 'rgba(255,226,172,.75)');
    sg.addColorStop(.2, 'rgba(224,173,108,.24)');
    sg.addColorStop(1, 'rgba(180,120,70,0)');
    sctx.fillStyle = sg; sctx.fillRect(0, 0, VW, VH);
  }
  // stars
  for (let i = 0; i < 70; i++) {
    const x = (hash2(i, 1, seed) * W * 1.6 - camX * .12) % VW;
    const y = hash2(i, 2, seed) * Math.max(40, surfScreen - 50);
    if (y > surfScreen - 40) continue;
    const a = .18 + hash2(i, 3, seed) * .5;
    sctx.fillStyle = `rgba(214,224,240,${a})`;
    sctx.fillRect((x + VW) % VW, y, 1, 1);
  }
  // distant ridges (three parallax layers)
  for (let layer = 0; layer < 3; layer++) {
    const par = .07 + layer * .06;
    const baseY = surfScreen - 28 + layer * 14;
    sctx.beginPath();
    sctx.moveTo(0, VH);
    for (let x = 0; x <= VW; x += 8) {
      const wx = camX * par + x * .7;
      const h = Math.sin(wx * .014 + layer * 3) * (18 - layer * 4) + Math.sin(wx * .037 + layer) * (8 - layer * 2);
      sctx.lineTo(x, baseY - h);
    }
    sctx.lineTo(VW, VH); sctx.closePath();
    sctx.fillStyle = ['#1a202a', '#20242a', '#272823'][layer];
    sctx.fill();
  }
  // low mist
  const mg = sctx.createLinearGradient(0, surfScreen - 18, 0, surfScreen + 30);
  mg.addColorStop(0, 'rgba(160,168,165,0)');
  mg.addColorStop(.7, 'rgba(160,168,165,.10)');
  mg.addColorStop(1, 'rgba(160,168,165,0)');
  sctx.fillStyle = mg; sctx.fillRect(0, surfScreen - 18, VW, 50);
  ctx.drawImage(skyCanvas, 0, 0);
}

function backPixel(wx, wy, bgType) {
  const b = biomeAt(wy);
  const brgb = BIOME_RGB[clamp(BIOMES.indexOf(b), 0, BIOME_RGB.length - 1)];
  let base = brgb[(hash2(wx >> 1, wy >> 1, seed + 5) * 3) | 0];
  if (bgType === 2) base = [72, 60, 44];
  const h = hash2(wx, wy, seed + 11);
  let f = bgType === 2 ? .24 : .22;
  f += h * .035;
  // strata bands
  if (((wy + Math.floor(Math.sin(wx * .04) * 5)) % 11) === 0) f *= .72;
  if (((wx + Math.floor(Math.sin(wy * .02) * 7)) % 23) === 0) f *= .82;
  if (h > .985) f *= 1.7;
  // deeper is darker
  f *= clamp(1 - (wy - 100) / 5200, .6, 1);
  const br = (base[0] * f) | 0, bg = (base[1] * f) | 0, bb = (base[2] * f) | 0;
  if (bgType === 2) {
    // holy brick pattern in the background
    const row = (wy / 8) | 0;
    const bx = (wx + (row % 2) * 8) % 16;
    if (wy % 8 === 0 || bx === 0) return packRGB(br * .58 | 0, bg * .58 | 0, bb * .55 | 0);
  }
  return packRGB(br, bg, bb);
}

function renderTerrain() {
  const ox = Math.floor(camX + shakeX), oy = Math.floor(camY + shakeY);
  const cells = world.cells, bgs = world.bg;
  const wseed = world.seed;
  const t = frame;
  for (let sy = 0; sy < VH; sy++) {
    const wy = oy + sy;
    const row = wy * W;
    let di = sy * VW;
    for (let sx = 0; sx < VW; sx++, di++) {
      const wx = ox + sx;
      if (wx < 0 || wx >= W || wy < 0 || wy >= H) { tbuf[di] = packRGB(4, 5, 8); continue; }
      const m = cells[row + wx];
      if (m === M.AIR) {
        const bg = bgs[row + wx];
        tbuf[di] = bg ? backPixel(wx, wy, bg) : 0;
        continue;
      }
      const h = hash2(wx, wy, wseed + 7);
      const v = (h * MAT_COLS[m].length) | 0;
      let c = PACK[m][v];
      const cat = MATS[m].cat;
      // texture per material
      if (m === M.BRICK || m === M.HOLY) {
        const row2 = (wy / 6) | 0;
        const bx = (wx + (row2 % 2) * 6) % 12;
        if (wy % 6 === 0 || bx === 0) c = shadeRGB(c, .58);
        else if (h > .82) c = shadeRGB(c, 1.1);
      } else if (m === M.WOOD) {
        if (wy % 4 === 0) c = shadeRGB(c, .78);
        else if ((wx * 13 + wy * 7) % 41 === 0) c = shadeRGB(c, 1.16);
      } else if (m === M.STEEL || m === M.RUST) {
        if ((wx + wy * 2) % 17 === 0) c = shadeRGB(c, 1.16);
        if (wx % 16 === 0 && wy % 16 === 0) c = shadeRGB(c, 1.4);
        if (wy % 5 === 0) c = shadeRGB(c, .9);
      } else if (m === M.GOLD) {
        if (h > .64) c = packRGB(198, 158, 74);
        else if (h < .12) c = packRGB(38, 32, 24);
      } else if (m === M.ICE) {
        c = mixRGB(c, backPixel(wx, wy, bgs[row + wx] || 1), .28);
        if ((wx + wy * 2) % 19 === 0) c = shadeRGB(c, 1.18);
      } else if (m === M.SNOW) {
        if (h > .86) c = packRGB(224, 234, 240);
      } else if (m === M.FUNGUS) {
        if (h > .9) c = packRGB(128, 92, 140);
        if ((wx * 3 + wy) % 29 === 0) c = packRGB(88, 62, 98);
      } else if (m === M.GLOWCAP) {
        c = packRGB(186 + (v % 3) * 12, 108 + (v % 3) * 14, 212);
        if ((t >> 4) % 2 && h > .5) c = packRGB(224, 154, 238);
      } else if (m === M.CRYSTAL) {
        c = packRGB(110 + (v % 3) * 14, 196 + (v % 3) * 12, 210);
        if ((wx + wy + (t >> 3)) % 13 === 0) c = packRGB(212, 248, 252);
      } else if (m === M.COAL) {
        if (h > .93) c = packRGB(70, 52, 44);
      } else if (m === M.ROCK || m === M.FROST || m === M.OBSIDIAN || m === M.DENSE) {
        if (h > .965) c = shadeRGB(c, 1.32);
        else if (h < .03) c = shadeRGB(c, .62);
        if ((wx * 3 + wy * 5) % 71 === 0) c = shadeRGB(c, .72);
      } else if (m === M.DIRT) {
        if (h > .93) c = shadeRGB(c, 1.2);
      }
      // fire animated
      if (m === M.FIRE) {
        const life = world.life[row + wx];
        const fv = ((t * .22 + h * 7 + wy * .7) | 0) % 5;
        const cols = PACK[M.FIRE];
        c = cols[fv];
        if (life < 20 && (t >> 1) % 2) c = packRGB(128, 54, 24);
        if (h > .78) c = packRGB(255, 226, 138);
      } else if (m === M.LAVA) {
        const fv = ((t * .12 + wx * .3 + h * 7) | 0) % 5;
        c = PACK[M.LAVA][fv];
        if ((wx + (t >> 2)) % 23 === 0) c = packRGB(255, 212, 116);
      } else if (m === M.WATER || m === M.ACID || m === M.TOXIC || m === M.OIL || m === M.BLOOD) {
        const above = (wy > 0) ? cells[row - W + wx] : M.DENSE;
        const surf = above !== m && MATS[above].cat !== 3;
        if (surf) c = shadeRGB(c, 1.32);
        else if (((wy + (t >> 3) + Math.floor(Math.sin(wx * .17) * 3)) % 9) === 0) c = shadeRGB(c, 1.13);
        if (m === M.ACID && h > .965) c = packRGB(208, 235, 125);
      } else if (m === M.STEAM || m === M.SMOKE || m === M.POISON) {
        const bgc = backPixel(wx, wy, bgs[row + wx] || 1);
        c = mixRGB(c, bgc, m === M.STEAM ? .58 : .45);
        if (h > .8) c = mixRGB(c, packRGB(230, 240, 244), .25);
      }
      // edge lighting for solids / powders
      if (cat === 1 || cat === 2) {
        const above = wy > 0 ? cells[row - W + wx] : M.AIR;
        const below = wy < H - 1 ? cells[row + W + wx] : M.DENSE;
        if (!SOLID_CAT[above] && MATS[above]) c = shadeRGB(c, 1.24);
        else if (!SOLID_CAT[below] && MATS[below]) c = shadeRGB(c, .74);
      }
      tbuf[di] = c;
    }
  }
  tctx.putImageData(terrainImage, 0, 0);
  ctx.drawImage(terrainCanvas, 0, 0);
}

/* ---------------------------------------------------------------------------
   19. WORLD ENTITIES / PARTICLES
   ------------------------------------------------------------------------- */
function drawPixel(x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

function drawWorldEntities() {
  const ox = camX + shakeX, oy = camY + shakeY;
  const vis = (x, y, pad = 40) => x > ox - pad && x < ox + VW + pad && y > oy - pad && y < oy + VH + pad;
  // torches (world + holy)
  for (let i = 0; i < world.torches.length; i++) {
    const t = world.torches[i];
    if (!vis(t.x, t.y, 30)) continue;
    const x = Math.round(t.x - ox), y = Math.round(t.y - oy);
    drawPixel(x - 1, y - 2, 3, 9, '#4b3522');
    drawPixel(x - 2, y + 5, 5, 2, '#2b1d14');
    drawPixel(x - 2, y - 4, 5, 2, '#6b4a2b');
    const fl = Math.sin(frame * .31 + i * 2.1) * 1.2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,190,90,.55)';
    ctx.beginPath(); ctx.ellipse(x, y - 6 + fl * .2, 3.4, 5 + fl, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,235,160,.6)';
    ctx.beginPath(); ctx.ellipse(x, y - 5 + fl * .1, 1.7, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // starting workbench
  if (world.workbench && vis(world.workbench.x, world.workbench.y, 30)) {
    const bx = Math.round(world.workbench.x - ox), by = Math.round(world.workbench.y - oy);
    drawPixel(bx - 9, by - 2, 18, 3, '#5a3f25');
    drawPixel(bx - 8, by + 1, 2, 6, '#3b2918');
    drawPixel(bx + 6, by + 1, 2, 6, '#3b2918');
    drawPixel(bx - 5, by - 5, 2, 3, '#d8b25e');
    drawPixel(bx - 2, by - 7, 1, 4, '#a3814a');
    drawPixel(bx + 3, by - 4, 4, 1, '#6b4c2c');
    drawPixel(bx + 6, by - 5, 1, 1, '#ffe9a0');
    ctx.globalAlpha = .08 + Math.sin(frame * .05) * .03;
    ctx.fillStyle = '#e7c478';
    ctx.beginPath(); ctx.arc(bx, by - 3, 13, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // holy room furniture
  for (const room of world.holy) {
    if (!vis(room.cx, room.y0 + 26, 200)) continue;
    const ax = Math.round(room.altar.x - ox), ay = Math.round(room.altar.y - oy);
    // altar
    drawPixel(ax - 9, ay - 2, 18, 4, '#4a4031');
    drawPixel(ax - 7, ay - 6, 14, 4, '#6b5a40');
    drawPixel(ax - 5, ay - 9, 10, 3, '#8c7551');
    drawPixel(ax - 2, ay - 12, 4, 4, '#c8a45a');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(240,206,120,.22)';
    ctx.beginPath(); ctx.arc(ax, ay - 8, 13 + Math.sin(frame * .07) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // statue
    const sx = Math.round(room.cx - ox), sy = Math.round(room.y1 - 8 - oy);
    drawPixel(sx - 12, sy - 3, 25, 5, '#4f4636');
    drawPixel(sx - 8, sy - 15, 16, 12, '#6a5d45');
    drawPixel(sx - 5, sy - 21, 10, 7, '#7b6e51');
    drawPixel(sx - 3, sy - 19, 2, 2, '#1c1a16');
    drawPixel(sx + 2, sy - 19, 2, 2, '#1c1a16');
    drawPixel(sx - 10, sy - 23, 7, 2, '#8d7c58');
    drawPixel(sx + 4, sy - 23, 7, 2, '#8d7c58');
    drawPixel(sx - 1, sy - 26, 2, 6, '#9c8a62');
    // portal
    const px = Math.round(room.portal.x - ox), py = Math.round(room.portal.y - oy);
    drawPixel(px - 11, py + 4, 22, 3, '#51452f');
    drawPixel(px - 13, py + 2, 3, 5, '#6f5d3b');
    drawPixel(px + 10, py + 2, 3, 5, '#6f5d3b');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pr = 10 + Math.sin(frame * .08) * 1.5;
    const pg = ctx.createRadialGradient(px, py - 7, 1, px, py - 7, pr + 5);
    pg.addColorStop(0, 'rgba(220,246,255,.65)');
    pg.addColorStop(.4, 'rgba(120,200,240,.35)');
    pg.addColorStop(1, 'rgba(60,130,190,0)');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.ellipse(px, py - 7, pr, pr * 1.25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(180,230,255,.55)';
    ctx.beginPath(); ctx.ellipse(px, py - 7, 7, 13, 0, 0, Math.PI * 2); ctx.stroke();
    // hanging braziers / banners
    for (let k = 0; k < 2; k++) {
      const bx = Math.round((k ? room.x0 + 70 : room.x1 - 70) - ox);
      drawPixel(bx - 5, room.y0 - oy + 4, 11, 3, '#7b6742');
      drawPixel(bx - 3, room.y0 - oy + 7, 7, 18, '#4b2b39');
      drawPixel(bx - 1, room.y0 - oy + 10, 3, 12, '#8a5a45');
    }
  }
  // pickups
  for (const p of pickups) {
    if (p.taken || !vis(p.x, p.y)) continue;
    const x = Math.round(p.x - ox), y = Math.round(p.y - oy);
    if (p.type === 'gold') {
      const bob = Math.sin((frame + p.x) * .08) * 1;
      drawPixel(x - 1, y - 1 + bob, 3, 2, '#a77d2d');
      drawPixel(x - 1, y - 2 + bob, 2, 1, '#f3d36a');
      drawPixel(x, y - 2 + bob, 1, 1, '#fff2b0');
      if (frame % 30 < 3) drawPixel(x + 1, y - 4 + bob, 1, 1, '#fff6cf');
    } else if (p.type === 'heart') {
      const bob = Math.sin(frame * .05 + p.x) * 1;
      // small blood-red flask
      drawPixel(x - 1, y - 5 + bob, 2, 2, '#c9b58b');
      drawPixel(x - 2, y - 4 + bob, 4, 1, '#8b6f45');
      drawPixel(x - 3, y - 3 + bob, 6, 5, '#7d222c');
      drawPixel(x - 4, y - 2 + bob, 8, 3, '#a5343d');
      drawPixel(x - 3, y + 2 + bob, 6, 2, '#691c24');
      drawPixel(x - 2, y - 2 + bob, 2, 3, '#d66a72');
      drawPixel(x + 1, y - 1 + bob, 1, 2, '#f0a0a4');
      drawPixel(x - 2, y + 4 + bob, 4, 1, '#3a1014');
    } else if (p.type === 'chest') {
      const bob = p.opened ? 0 : Math.sin(frame * .03 + p.bob) * .6;
      drawPixel(x - 7, y - 5 + bob, 14, 8, '#4a3320');
      drawPixel(x - 7, y - 6 + bob, 14, 2, '#6e4c2b');
      drawPixel(x - 7, y - 1 + bob, 14, 1, '#2b1d12');
      drawPixel(x - 7, y + 1 + bob, 14, 2, '#3a2718');
      drawPixel(x - 1, y - 3 + bob, 2, 3, p.opened ? '#8a6a2c' : '#d2a94e');
      if (!p.opened) { drawPixel(x - 7, y - 6 + bob, 14, 1, '#8a6638'); drawPixel(x - 8, y - 5 + bob, 1, 7, '#332316'); drawPixel(x + 7, y - 5 + bob, 1, 7, '#332316'); }
      else { drawPixel(x - 6, y - 9 + bob, 12, 3, '#5e4226'); drawPixel(x - 6, y - 10 + bob, 12, 1, '#87633c'); }
    } else if (p.type === 'wand') {
      const bob = Math.sin(frame * .04 + p.x) * 1.2;
      ctx.save();
      ctx.translate(x, y + bob);
      ctx.rotate(-.45);
      drawPixel(-8, -1, 15, 2, '#6b4c2c');
      drawPixel(-9, -2, 3, 4, '#c6a45b');
      drawPixel(6, -2, 4, 1, '#d8b25e');
      drawPixel(9, -3, 1, 1, '#fff2b0');
      ctx.restore();
      if (!p.taken) {
        ctx.globalAlpha = .12 + Math.sin(frame * .08) * .04;
        ctx.fillStyle = '#e7c478';
        ctx.beginPath(); ctx.arc(x, y + bob, 12, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (p.type === 'spell') {
      const bob = Math.sin(frame * .05 + p.x) * 1.4;
      ctx.globalAlpha = .16;
      ctx.fillStyle = SPELLS[p.spellId] ? SPELLS[p.spellId].color : '#fff';
      ctx.beginPath(); ctx.arc(x, y + bob, 10, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      drawPixel(x - 3, y - 3 + bob, 6, 6, '#251d2b');
      drawPixel(x - 2, y - 2 + bob, 4, 4, SPELLS[p.spellId] ? SPELLS[p.spellId].color : '#fff');
      drawPixel(x - 1, y - 4 + bob, 2, 1, '#fff');
    }
  }
  // shop items
  for (const room of world.holy) {
    if (!room.shopItems) continue;
    room.shopItems.forEach((it, i) => {
      if (!it) return;
      const ped = room.shop[i];
      if (!vis(ped.x, ped.y)) return;
      const x = Math.round(ped.x - ox), y = Math.round(ped.y - oy);
      // pedestal
      drawPixel(x - 6, y + 4, 12, 4, '#4a4031');
      drawPixel(x - 5, y + 3, 10, 2, '#6b5a40');
      const bob = Math.sin(frame * .045 + i) * 1.5;
      ctx.globalAlpha = .16;
      ctx.fillStyle = it.color;
      ctx.beginPath(); ctx.arc(x, y - 2 + bob, 12, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = it.color;
      ctx.font = '13px serif'; ctx.textAlign = 'center';
      ctx.fillText(it.glyph, x, y + bob);
      ctx.font = '8px ui-monospace'; ctx.fillStyle = '#f0d687';
      ctx.fillText(it.cost + '◈', x, y - 9 + bob);
    });
  }
  // enemies
  for (const e of enemies) {
    if (e.dead || !vis(e.x, e.y, 50)) continue;
    drawEnemy(e, e.x - ox, e.y - oy);
  }
  // player
  if (player && !player.dead) drawPlayer(player.x - ox, player.y - oy);
  else if (player && player.dead && transition < .9) drawPlayer(player.x - ox, player.y - oy, true);
  // interaction outline
  if (interactTarget) {
    const x = interactTarget.x - ox, y = interactTarget.y - oy;
    const pulse = .5 + Math.sin(frame * .1) * .5;
    ctx.strokeStyle = `rgba(240,214,135,${.35 + pulse * .45})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x - 10), Math.round(y - 10), 20, 20);
  }
}

function drawEnemy(e, x, y) {
  x = Math.round(x); y = Math.round(y);
  const flip = e.dir < 0;
  ctx.save();
  if (e.hidden) {
    // moving mound / dust
    ctx.globalAlpha = .55;
    for (let i = 0; i < 4; i++) drawPixel(x + Math.sin(frame * .1 + i) * 5 - 2, y + i * 1.2, 4, 1, '#6b5236');
    ctx.globalAlpha = 1;
    ctx.restore(); return;
  }
  // shadow
  if (e.type !== 'flyer' && e.type !== 'wraith' && e.type !== 'boss') {
    ctx.globalAlpha = .25; drawPixel(x - e.w / 2, y + e.h / 2 + 1, e.w, 2, '#000'); ctx.globalAlpha = 1;
  }
  if (e.flash > 0) { ctx.globalAlpha = .8; }
  switch (e.type) {
    case 'crag': {
      const leg = Math.sin(frame * .35 + e.anim) > 0 ? 1 : -1;
      drawPixel(x - 5, y - 2, 10, 5, '#5a4430');
      drawPixel(x - 5, y - 4, 4, 2, '#4a3727');
      drawPixel(x + 1, y - 4, 4, 2, '#4a3727');
      drawPixel(x - 4, y - 6, 2, 2, '#6e5439');
      drawPixel(x + 1, y - 7, 2, 3, '#7b6042');
      drawPixel(x + 3, y - 5, 2, 2, '#5c4631');
      drawPixel(x - 6, y + 3, 2, 3 + leg, '#3b2b20');
      drawPixel(x + 4, y + 3, 2, 3 - leg, '#3b2b20');
      drawPixel(flip ? x - 5 : x + 3, y - 4, 2, 1, '#ff9c45');
      drawPixel(flip ? x - 4 : x + 4, y - 4, 1, 1, '#ffe0a0');
      drawPixel(flip ? x - 7 : x + 4, y - 2, 3, 1, '#8a6a45');
      break;
    }
    case 'spitter': {
      drawPixel(x - 3, y - 1, 6, 8, '#8e8a67');
      drawPixel(x - 4, y + 6, 8, 1, '#6d6a50');
      drawPixel(x - 6, y - 6, 12, 5, '#6f4c7a');
      drawPixel(x - 5, y - 7, 10, 2, '#8a6197');
      drawPixel(x - 7, y - 4, 2, 2, '#5c3f68');
      drawPixel(x + 5, y - 4, 2, 2, '#5c3f68');
      drawPixel(x - 2, y - 5, 1, 1, '#b9dd6a');
      drawPixel(x + 2, y - 6, 1, 1, '#b9dd6a');
      drawPixel(flip ? x - 2 : x + 1, y + 1, 1, 1, '#f0e8bb');
      drawPixel(x - 4, y + 2, 8, 1, '#6f6b50');
      break;
    }
    case 'flyer': {
      const bob = Math.sin(frame * .07 + e.phase) * 1.5;
      drawPixel(x - 4, y - 4 + bob, 8, 8, '#6e3e52');
      drawPixel(x - 3, y - 5 + bob, 6, 1, '#8c5268');
      drawPixel(x - 1, y - 2 + bob, 3, 4, '#e8dcc0');
      drawPixel(x, y - 1 + bob, 1, 2, '#7d272d');
      drawPixel(x - 4, y + 4 + bob, 2, 2, '#592f40');
      drawPixel(x + 2, y + 4 + bob, 2, 2, '#592f40');
      drawPixel(x - 6, y + 2 + bob, 2, 1, '#8c5268');
      drawPixel(x + 4, y + 2 + bob, 2, 1, '#8c5268');
      break;
    }
    case 'bomber': {
      const glow = e.fuse > 0 ? (e.fuse % 8 < 4 ? '#c9fbff' : '#63b9c4') : '#8fdde6';
      drawPixel(x - 4, y - 2, 8, 5, '#3d5a5c');
      drawPixel(x - 3, y - 4, 6, 3, glow);
      drawPixel(x - 2, y - 5, 4, 1, '#bff8ff');
      drawPixel(x - 5, y - 1, 1, 3, '#7fb9b3');
      drawPixel(x + 4, y - 1, 1, 3, '#7fb9b3');
      drawPixel(x - 4, y + 3, 2, 2, '#2a3b3c');
      drawPixel(x + 2, y + 3, 2, 2, '#2a3b3c');
      drawPixel(x - 1, y + 1, 2, 1, '#d9ffff');
      break;
    }
    case 'burrower': {
      const w = Math.sin(frame * .25) * 1;
      drawPixel(x - 6, y - 2, 12, 4, '#7a5c3a');
      for (let i = 0; i < 4; i++) drawPixel(x - 5 + i * 3, y - 3, 2, 1, '#a27a4a');
      drawPixel(x + 4, y - 3, 3, 3, '#4b3423');
      drawPixel(x + 6, y - 1 + (w > 0 ? 1 : 0), 1, 1, '#ffd27a');
      drawPixel(x - 5, y + 2, 10, 1, '#57412a');
      break;
    }
    case 'wraith': {
      const bob = Math.sin(frame * .05 + e.phase) * 2;
      ctx.globalAlpha = (e.flash > 0 ? .9 : .72) + Math.sin(frame * .07) * .12;
      drawPixel(x - 4, y - 8 + bob, 8, 8, '#3f5e6c');
      drawPixel(x - 3, y - 9 + bob, 6, 1, '#6c98a8');
      drawPixel(x - 2, y - 3 + bob, 1, 1, '#c9f6ff');
      drawPixel(x + 1, y - 3 + bob, 1, 1, '#c9f6ff');
      drawPixel(x - 4, y + bob, 8, 4, '#36505c');
      for (let i = 0; i < 3; i++) drawPixel(x - 4 + i * 3, y + 4 + bob + Math.sin(frame * .1 + i) * 1, 2, 3, '#2b414c');
      ctx.globalAlpha = 1;
      break;
    }
    case 'sentinel': {
      drawPixel(x - 4, y - 7, 8, 6, '#5d5c59');
      drawPixel(x - 5, y - 6, 1, 4, '#7a7770');
      drawPixel(x - 3, y - 6, 6, 2, '#2a2b2b');
      drawPixel(x - 2, y - 6, 4, 1, '#ffb055');
      drawPixel(x - 4, y - 1, 8, 8, '#6e4c36');
      drawPixel(x - 5, y, 1, 5, '#4e3728');
      drawPixel(x + 4, y, 1, 5, '#4e3728');
      drawPixel(x - 4, y + 7, 3, 2, '#38312c');
      drawPixel(x + 1, y + 7, 3, 2, '#38312c');
      drawPixel(flip ? x - 8 : x + 5, y - 2, 4, 2, '#7d7a73');
      drawPixel(flip ? x - 9 : x + 8, y - 2, 2, 2, '#d8a35c');
      break;
    }
    case 'boss': {
      const r = 20 + Math.sin(frame * .05) * 1.5;
      ctx.save();
      ctx.translate(x, y);
      // outer rotating shards
      for (let i = 0; i < 8; i++) {
        const a = frame * .01 + i / 8 * Math.PI * 2;
        const rr = r + 7 + Math.sin(frame * .04 + i) * 3;
        drawPixel(Math.cos(a) * rr - 1, Math.sin(a) * rr - 1, 3, 3, i % 2 ? '#c06a45' : '#8a4b3b');
      }
      ctx.fillStyle = '#3b1d25';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b2c2c';
      ctx.beginPath(); ctx.arc(0, -1, r - 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d98c50';
      ctx.beginPath(); ctx.arc(0, -1, r - 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe3a0';
      ctx.beginPath(); ctx.arc(0, -1, r - 15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#241016';
      ctx.beginPath(); ctx.arc(0, -2, Math.max(2, r - 19), 0, Math.PI * 2); ctx.fill();
      drawPixel(-2 + Math.sin(frame * .03) * 2, -4, 2, 2, '#fff8d0');
      // tendrils
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * .55 + i * .22 + Math.sin(frame * .03 + i) * .1;
        for (let k = 0; k < 4; k++) {
          drawPixel(Math.cos(a) * (r + k * 3), Math.sin(a) * (r + k * 3) + k, 2, 2, '#5a2630');
        }
      }
      ctx.restore();
      break;
    }
  }
  if (e.flash > 0) {
    ctx.globalAlpha = .6;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - e.r, y - e.r, e.r * 2, e.r * 2);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // health bar
  if (e.type !== 'boss' && e.hp < e.maxHp) {
    const w = Math.max(10, e.w);
    drawPixel(x - w / 2, y - e.h / 2 - 6, w, 2, '#1a1114');
    drawPixel(x - w / 2, y - e.h / 2 - 6, w * clamp(e.hp / e.maxHp, 0, 1), 1, '#c4555d');
  }
  if (e.hidden) {
    ctx.globalAlpha = .3;
    ctx.fillStyle = '#d8c49a'; ctx.font = '8px ui-monospace'; ctx.textAlign = 'center';
    ctx.fillText('!', x, y - 10);
    ctx.globalAlpha = 1;
  }
}

function drawPlayer(x, y, dead) {
  x = Math.round(x); y = Math.round(y);
  const p = player;
  if (!dead && p.inv > 0 && p.inv % 6 < 3) return;
  ctx.save();
  if (dead) ctx.globalAlpha = .55;
  // shadow
  if (p.onGround && !dead) { ctx.globalAlpha = .28; drawPixel(x - 4, y + 6, 9, 2, '#000'); ctx.globalAlpha = 1; }
  if (p.wet > 0) ctx.globalAlpha = .92;
  const bob = p.onGround ? Math.sin(p.walk) * .7 : 0;
  const leg = p.onGround ? Math.sin(p.walk) * 1.2 : 0.5;
  // cape
  drawPixel(x - 4, y - 5 + bob, 3, 10, '#3c3157');
  drawPixel(x - 5, y - 3 + bob, 2, 7, '#332a4b');
  // robe
  drawPixel(x - 3, y - 5 + bob, 7, 10, '#5c4a83');
  drawPixel(x - 4, y + 1 + bob, 9, 4, '#4a3b6b');
  drawPixel(x - 3, y + 4 + bob, 7, 1, '#2f2747');
  drawPixel(x - 2, y - 4 + bob, 5, 2, '#6c5897');
  // belt
  drawPixel(x - 3, y + 1 + bob, 7, 1, '#a98748');
  drawPixel(x, y + 1 + bob, 2, 2, '#d8b25e');
  // arms
  const aiming = p.aim;
  const armDir = Math.cos(aiming) > 0 ? 1 : -1;
  drawPixel(x + armDir * 3 - 1, y - 2 + bob, 3, 2, '#6c5897');
  // head
  drawPixel(x - 2, y - 9 + bob, 5, 4, '#e3c7a4');
  drawPixel(x - 2, y - 9 + bob, 5, 1, '#caa986');
  // eyes glow
  drawPixel(x - 1, y - 8 + bob, 1, 1, p.burning > 0 ? '#ffb04a' : '#bde9ff');
  drawPixel(x + 1, y - 8 + bob, 1, 1, p.burning > 0 ? '#ffb04a' : '#bde9ff');
  // hat
  drawPixel(x - 5, y - 11 + bob, 11, 2, '#302546');
  drawPixel(x - 4, y - 12 + bob, 9, 1, '#3d3059');
  drawPixel(x - 3, y - 14 + bob, 6, 2, '#4a3a6b');
  drawPixel(x - 2, y - 16 + bob, 4, 2, '#574574');
  drawPixel(x - 1, y - 17 + bob, 2, 1, '#68538a');
  drawPixel(x + 1, y - 15 + bob, 1, 2, '#8e79b5');
  // legs
  drawPixel(x - 3, y + 5 + bob, 2, 2 + leg, '#3c3157');
  drawPixel(x + 1, y + 5 + bob, 2, 2 - leg, '#3c3157');
  drawPixel(x - 3, y + 7 + bob + leg, 2, 1, '#6b5433');
  drawPixel(x + 1, y + 7 + bob - leg, 2, 1, '#6b5433');
  // wand arm & wand
  const wx = x + Math.cos(aiming) * 10, wy = y - 1 + Math.sin(aiming) * 10;
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    drawPixel(lerp(x + armDir * 2, wx, t), lerp(y - 1 + bob, wy, t), 1, 1, i < steps * .55 ? '#6c5897' : '#a3814a');
  }
  drawPixel(wx - 1, wy - 1, 3, 2, '#d8b25e');
  if (p.castFlash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,232,160,' + (p.castFlash / 7 * .8) + ')';
    ctx.beginPath(); ctx.arc(wx, wy, 7 + p.castFlash, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  // burning aura
  if (p.burning > 0) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = frame * .2 + i * 1.7;
      ctx.fillStyle = i % 2 ? 'rgba(255,120,40,.35)' : 'rgba(255,210,90,.28)';
      ctx.beginPath(); ctx.arc(x + Math.sin(a) * 4, y - 4 + Math.cos(a * 1.3) * 6, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (p.frozen > 0) {
    ctx.globalAlpha = .35; drawPixel(x - 5, y - 10, 11, 18, '#a8e6ff'); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawProjectiles() {
  const ox = camX + shakeX, oy = camY + shakeY;
  for (const p of projectiles) {
    if (p.dead) continue;
    const x = p.x - ox, y = p.y - oy;
    if (x < -40 || x > VW + 40 || y < -40 || y > VH + 40) continue;
    // trail
    if (p.modList) { }
    ctx.globalAlpha = .28;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(x, y, p.radius + 5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(x - p.radius), Math.round(y - p.radius), p.radius * 2, p.radius * 2);
    ctx.fillStyle = '#fff8d8';
    ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
    if (p.fuse > 0 && p.fuse < 40 && (frame >> 2) % 2) {
      ctx.strokeStyle = '#ff6b4a'; ctx.strokeRect(Math.round(x - 4), Math.round(y - 4), 8, 8);
    }
  }
  // beams
  for (const b of beams) {
    const x1 = b.x - ox, y1 = b.y - oy;
    const x2 = (b.endX || b.x) - ox, y2 = (b.endY || b.y) - oy;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = .32; ctx.lineWidth = b.width + 5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.globalAlpha = .95; ctx.lineWidth = b.width;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life--;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx; p.y += p.vy;
    switch (p.kind) {
      case 'ember': p.vy -= .025; p.vx *= .99; break;
      case 'blood': case 'debris': case 'shard':
        p.vy += .13; p.vx *= .99;
        if (isBlocking(get(p.x, p.y + 1))) { p.vy *= -.28; p.vx *= .6; p.y -= .5; }
        break;
      case 'bubble': p.vy -= .04; p.vx *= .97; break;
      case 'spark': p.vx *= .94; p.vy *= .94; break;
      case 'dust': p.vx *= .97; p.vy *= .97; break;
      case 'hit': case 'crit': p.vx *= .86; p.vy *= .86; break;
      case 'arc': break;
      case 'ambient': break;
    }
  }
  // ambient biome particles
  ambientTimer--;
  if (ambientTimer <= 0 && gameState === 'play') {
    ambientTimer = 3;
    const b = biomeAt(player.y);
    const x = camX + rng() * VW, y = camY + rng() * VH;
    if (b.key === 'snow' && rng() < .8) addParticle(x, y, 'ambient', 'rgba(220,236,248,.8)', rnd(-.25, .1), rnd(.25, .8), rint(70, 160));
    else if (b.key === 'coal' && rng() < .5) addParticle(x, y + 20, 'ambient', '#ffb45c', rnd(-.15, .15), rnd(-.6, -.2), rint(40, 100));
    else if (b.key === 'ember' && rng() < .8) addParticle(x, y + 20, 'ambient', rng() < .5 ? '#ff9a4a' : '#ffd07a', rnd(-.15, .15), rnd(-.7, -.25), rint(40, 110));
    else if (b.key === 'fungal' && rng() < .5) addParticle(x, y, 'ambient', '#d79bea', rnd(-.15, .15), rnd(-.15, .25), rint(80, 180));
    else if (b.key === 'woods' && rng() < .3) addParticle(x, y, 'ambient', '#e5e28c', rnd(-.2, .2), rnd(-.2, .1), rint(80, 180));
    else if (rng() < .3) addParticle(x, y, 'ambient', 'rgba(190,190,180,.35)', rnd(-.1, .1), rnd(-.08, .08), rint(60, 140));
  }
}

function drawParticles(emissivePass) {
  const ox = camX + shakeX, oy = camY + shakeY;
  for (const p of particles) {
    const isGlow = p.kind === 'ember' || p.kind === 'spark' || p.kind === 'arc' || p.kind === 'crit' || p.kind === 'hit';
    if (emissivePass !== isGlow) continue;
    const x = p.x - ox, y = p.y - oy;
    if (x < -10 || x > VW + 10 || y < -10 || y > VH + 10) continue;
    const a = p.life / p.max;
    ctx.globalAlpha = clamp(a, 0, 1) * (emissivePass ? .9 : .8);
    if (emissivePass) ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = p.color;
    const s = p.size || 1;
    ctx.fillRect(Math.round(x), Math.round(y), s, s);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
}

/* ---------------------------------------------------------------------------
   20. LIGHTING
   --------------------------------------------------------------------------- */
const lightCanvas = document.createElement('canvas');
lightCanvas.width = VW / 2; lightCanvas.height = VH / 2;
const lctx = lightCanvas.getContext('2d');
lctx.imageSmoothingEnabled = true;

function collectLights() {
  const ox = camX + shakeX, oy = camY + shakeY;
  const lights = [];
  // player lantern
  if (!player.dead) {
    lights.push({ x: player.x, y: player.y - 2, r: 142 + Math.sin(frame * .17) * 4, color: '#ffd9a4', a: .96, occlude: true });
    // wand tip
    if (player.castFlash > 0) {
      const wx = player.x + Math.cos(player.aim) * 10, wy = player.y - 1 + Math.sin(player.aim) * 10;
      lights.push({ x: wx, y: wy, r: 40, color: '#ffe4a8', a: .9, occlude: false });
    }
  }
  // torches
  for (let i = 0; i < world.torches.length; i++) {
    const t = world.torches[i];
    if (Math.abs(t.x - player.x) > 340 || Math.abs(t.y - player.y) > 260) continue;
    const flick = .82 + Math.sin(frame * .19 + i * 2.3) * .09 + hash2(i, frame, seed) * .08;
    lights.push({ x: t.x, y: t.y - 3, r: (t.holy ? 104 : 88) * flick, color: t.holy ? '#ffe6a8' : '#ffc377', a: .84, occlude: true });
  }
  // projectiles / flashes
  for (const p of projectiles) if (p.glow > .15) lights.push({ x: p.x, y: p.y, r: 20 + p.glow * 26, color: p.color, a: .5 + p.glow * .2, occlude: false });
  for (const f of flashes) lights.push({ x: f.x, y: f.y, r: f.radius * (1.4 - f.life / f.max * .5), color: f.color, a: f.life / f.max * .9, occlude: false });
  for (const b of beams) if (b.endX) lights.push({ x: b.endX, y: b.endY, r: 44, color: b.color, a: .8, occlude: false });
  // emissive cells (bucketed)
  const buckets = {};
  const bx0 = Math.floor(player.x / 22) - 11, bx1 = bx0 + 22;
  const by0 = Math.floor(player.y / 22) - 8, by1 = by0 + 16;
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const wx = bx * 22 + 11, wy = by * 22 + 11;
      if (!inside(wx, wy)) continue;
      const m = get(wx, wy);
      if (m === M.LAVA || m === M.FIRE || m === M.GLOWCAP || m === M.CRYSTAL) {
        // verify density of emitters around this bucket
        let n = 0;
        for (let yy = -8; yy <= 8; yy += 4) for (let xx = -8; xx <= 8; xx += 4) {
          const mm = get(wx + xx, wy + yy);
          if (mm === m) n++;
        }
        if (n >= 1) {
          const color = m === M.LAVA || m === M.FIRE ? '#ff8a3c' : m === M.GLOWCAP ? '#d181e8' : '#8fe5ef';
          lights.push({ x: wx, y: wy, r: 24 + Math.min(54, n * 7), color, a: .4 + Math.min(.3, n * .04), occlude: false });
          if (lights.length > 90) break;
        }
      }
    }
    if (lights.length > 90) break;
  }
  return lights;
}

function drawEmissiveGlows() {
  const ox = camX + shakeX, oy = camY + shakeY;
  const vis = (x, y, pad = 30) => x > ox - pad && x < ox + VW + pad && y > oy - pad && y < oy + VH + pad;
  ctx.globalCompositeOperation = 'lighter';
  const eye = (x, y, col, size) => {
    const r = size || 2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    const c = hexToRgb(col);
    g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},.85)`);
    g.addColorStop(.35, `rgba(${c[0]},${c[1]},${c[2]},.24)`);
    g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  };
  for (const e of enemies) {
    if (e.dead || !vis(e.x, e.y, 40)) continue;
    const x = e.x - ox, y = e.y - oy;
    if (e.type === 'crag') eye(x + (e.dir < 0 ? -3 : 3), y - 4, '#ff9a45', 1.4);
    else if (e.type === 'flyer') eye(x, y - 1, '#ff6d74', 1.6);
    else if (e.type === 'wraith') { eye(x - 1, y - 3, '#c9f6ff', 1.2); eye(x + 2, y - 3, '#c9f6ff', 1.2); }
    else if (e.type === 'sentinel') eye(x + (e.dir < 0 ? -3 : 3), y - 5, '#ffb055', 1.3);
    else if (e.type === 'boss') eye(x, y - 2, '#ffe6a0', 5);
    else if (e.type === 'spitter') eye(x + (e.dir < 0 ? -2 : 2), y + 1, '#e7f0b0', 1);
  }
  if (player && !player.dead && vis(player.x, player.y, 20)) {
    const x = player.x - ox, y = player.y - oy;
    eye(x - 1, y - 8, '#bde9ff', 1.1);
    eye(x + 1, y - 8, '#bde9ff', 1.1);
  }
  for (const p of pickups) {
    if (p.taken || !vis(p.x, p.y, 20)) continue;
    if (p.type === 'spell') eye(p.x - ox, p.y - oy - 2, SPELLS[p.spellId] ? SPELLS[p.spellId].color : '#fff', 1.8);
    else if (p.type === 'wand') eye(p.x - ox, p.y - oy, '#e7c478', 1.5);
    else if (p.type === 'heart') eye(p.x - ox, p.y - oy, '#e0616c', 1.2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawLighting() {
  const ox = camX + shakeX, oy = camY + shakeY;
  const b = currentZone();
  let dark = 0.9;
  if (player.y < world.startSurf + 18) dark = .08;
  else if (b.holy) dark = .24;
  else dark = (b.dark || .8);
  if (b.key === 'boss') dark = .62;
  // holy rooms are glowing
  if (holyRoomAt(player.y, player.x)) dark = Math.min(dark, .22);
  dark = clamp(dark, .04, .94);

  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, VW / 2, VH / 2);
  lctx.fillStyle = `rgba(3,5,11,${dark})`;
  lctx.fillRect(0, 0, VW / 2, VH / 2);

  const lights = collectLights();
  lctx.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const sx = (l.x - ox) / 2, sy = (l.y - oy) / 2;
    const rr = l.r / 2;
    if (sx < -rr || sx > VW / 2 + rr || sy < -rr || sy > VH / 2 + rr) continue;
    lctx.save();
    if (l.occlude) {
      // raycast visibility polygon
      lctx.beginPath();
      const rays = 72;
      for (let i = 0; i <= rays; i++) {
        const a = i / rays * Math.PI * 2;
        let d = l.r;
        for (let k = 4; k < l.r; k += 3) {
          const wx = l.x + Math.cos(a) * k, wy = l.y + Math.sin(a) * k;
          if (isBlocking(get(wx, wy)) && get(wx, wy) !== M.SNOW) { d = k; break; }
        }
        const px = sx + Math.cos(a) * d / 2, py = sy + Math.sin(a) * d / 2;
        if (i === 0) lctx.moveTo(px, py); else lctx.lineTo(px, py);
      }
      lctx.closePath();
      lctx.clip();
    }
    const grad = lctx.createRadialGradient(sx, sy, 1, sx, sy, rr);
    grad.addColorStop(0, `rgba(255,255,255,${l.a})`);
    grad.addColorStop(.42, `rgba(255,255,255,${l.a * .72})`);
    grad.addColorStop(.78, `rgba(255,255,255,${l.a * .28})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    lctx.fillStyle = grad;
    lctx.beginPath(); lctx.arc(sx, sy, rr, 0, Math.PI * 2); lctx.fill();
    lctx.restore();
  }
  lctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lightCanvas, 0, 0, VW, VH);
  ctx.imageSmoothingEnabled = false;

  // coloured bloom on top (screen-ish)
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const sx = l.x - ox, sy = l.y - oy, rr = l.r * .62;
    if (sx < -rr || sx > VW + rr || sy < -rr || sy > VH + rr) continue;
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, rr);
    const col = hexToRgb(l.color);
    grad.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${.11 * l.a})`);
    grad.addColorStop(.55, `rgba(${col[0]},${col[1]},${col[2]},${.035 * l.a})`);
    grad.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/* ---------------------------------------------------------------------------
   21. MASTER DRAW
   --------------------------------------------------------------------------- */
let damageFlash = 0;
function draw() {
  if (!world) { ctx.fillStyle = '#05060b'; ctx.fillRect(0, 0, VW, VH); return; }
  shakeX = camShake > .2 ? (rng() - .5) * camShake : 0;
  shakeY = camShake > .2 ? (rng() - .5) * camShake : 0;
  camShake *= .86;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  drawSky();
  renderTerrain();
  drawWorldEntities();
  drawProjectiles();
  drawParticles(false);
  drawLighting();
  drawEmissiveGlows();
  drawParticles(true);
  // flashes bloom
  const ox = camX + shakeX, oy = camY + shakeY;
  ctx.globalCompositeOperation = 'lighter';
  for (const f of flashes) {
    const a = f.life / f.max;
    const rr = f.radius * (1.5 - a * .5);
    const g = ctx.createRadialGradient(f.x - ox, f.y - oy, 0, f.x - ox, f.y - oy, rr);
    const c = hexToRgb(f.color);
    g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a * .28})`);
    g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    ctx.fillStyle = g; ctx.fillRect(f.x - ox - rr, f.y - oy - rr, rr * 2, rr * 2);
    if (f.radius > 12 && a > .25) {
      ctx.globalAlpha = a * .5;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(f.x - ox, f.y - oy, f.radius * (1.1 - a * .55), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  // damage vignette handled in DOM, plus in-canvas red tint
  if (damageFlash > 0) {
    ctx.fillStyle = `rgba(110,12,20,${damageFlash * .3})`;
    ctx.fillRect(0, 0, VW, VH);
    damageFlash *= .9;
    if (damageFlash < .01) damageFlash = 0;
  }
  // transition fade
  if (transition > 0) {
    ctx.fillStyle = `rgba(2,3,6,${clamp(transition, 0, 1)})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  // low health edge
  if (player && !player.dead && player.hp / player.maxHp < .25) {
    const a = .08 + Math.sin(frame * .15) * .05;
    const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * .3, VW / 2, VH / 2, VH * .75);
    g.addColorStop(0, 'rgba(120,10,20,0)');
    g.addColorStop(1, `rgba(120,10,20,${a + .1})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  }
}

/* ---------------------------------------------------------------------------
   22. HUD / BANNER / TOAST
   --------------------------------------------------------------------------- */
function updateHud() {
  if (!player || !wands.length) return;
  const w = wands[currentWand];
  const hp = clamp(player.hp / player.maxHp, 0, 1);
  const mana = clamp(w.mana / w.manaMax, 0, 1);
  const lev = clamp(player.lev / Math.max(1, player.maxLev), 0, 1);
  UI.hpFill.style.width = (hp * 100) + '%';
  UI.manaFill.style.width = (mana * 100) + '%';
  UI.levFill.style.width = (lev * 100) + '%';
  UI.hpText.textContent = `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}`;
  UI.manaText.textContent = `${Math.floor(w.mana)} / ${w.manaMax}`;
  UI.levText.textContent = lev > .02 ? 'LEV' : '—';
  const z = currentZone();
  UI.biomeName.textContent = z.holy ? '灰烬圣所' : z.name;
  UI.biomeSub.textContent = z.holy ? 'ASHEN SANCTUM' : (z.en || '');
  UI.goldText.textContent = run.gold + ' ◈';
  UI.killText.textContent = '击杀 ' + run.kills;
  UI.depthText.textContent = Math.round(run.depth) + ' m';
  if (pointer.active && pointer.wx >= 0 && pointer.wx < W && pointer.wy >= 0 && pointer.wy < H) {
    const mm = get(pointer.wx, pointer.wy);
    UI.materialChip.textContent = (MATS[mm] ? MATS[mm].name : '?') + ' · ' + (MATS[mm] ? MATS[mm].key.toUpperCase() : '?');
  } else UI.materialChip.textContent = '——';
  UI.seedChip.textContent = 'seed ' + (seed >>> 0).toString(16).toUpperCase().slice(-6);
  // status icons
  let st = '';
  if (player.burning > 0) st += '<span class="status burn" title="燃烧">火</span>';
  if (player.wet > 0) st += '<span class="status wet" title="潮湿">水</span>';
  if (player.oil > 0) st += '<span class="status oil" title="油污">油</span>';
  if (player.poison > 0) st += '<span class="status poison" title="中毒">毒</span>';
  if (player.blood > 0) st += '<span class="status blood" title="浴血">血</span>';
  if (player.frozen > 0) st += '<span class="status freeze" title="冻结">冰</span>';
  if (player.regen > 0 || player.perks.regen) st += '<span class="status regen" title="再生">愈</span>';
  if (player.shield > 0) st += '<span class="status regen" title="残响护盾">盾</span>';
  if (player.oxygen < 99) st += `<span class="status wet" title="氧气">气${Math.round(player.oxygen)}</span>`;
  UI.statusRow.innerHTML = st;
  UI.perkRow.innerHTML = perksOwned.map(id => {
    const d = PERK_DEFS.find(p => p.id === id);
    if (!d) return '';
    return `<span class="perkMini" style="color:${d.color}" title="${escapeHtml(d.name)}：${escapeHtml(d.desc)}">${d.glyph}</span>`;
  }).join('');
  // wands
  let html = '';
  wands.forEach((ww, i) => {
    const active = i === currentWand;
    const dots = ww.slots.map(s => {
      if (!s) return '<i class="slotDot"></i>';
      const sp = SPELLS[s.id];
      const t = sp ? sp.type : 'proj';
      return `<i class="slotDot ${t === 'mod' ? 'mod' : t === 'trigger' ? 'trig' : 'proj'}${ww.timer > 0 ? ' cool' : ''}"></i>`;
    }).join('');
    html += `<div class="wandChip ${active ? 'active' : ''}" data-wand="${i}" title="${escapeHtml(ww.name)} · 容量 ${ww.capacity}">
      <b>${i + 1} · ${escapeHtml(ww.name)}</b>
      <div class="meta"><span>${ww.timer > 0 ? '冷却' : '就绪'}</span><span>${Math.floor(ww.mana)}/${ww.manaMax}</span></div>
      <div class="slotRow">${dots}</div></div>`;
  });
  UI.wandHud.innerHTML = html;
  // boss bar
  const boss = enemies.find(e => e.type === 'boss' && !e.dead);
  if (boss && dist2(boss.x, boss.y, player.x, player.y) < 380 * 380) {
    UI.bossBar.classList.add('on');
    UI.bossFill.style.width = clamp(boss.hp / boss.maxHp, 0, 1) * 100 + '%';
  } else UI.bossBar.classList.remove('on');
}

function showBanner(title, sub) {
  UI.bannerTitle.textContent = title;
  UI.bannerSub.textContent = sub || '';
  UI.banner.classList.add('show');
  bannerTimer = 210;
}
function tickBanner() {
  if (bannerTimer > 0) { bannerTimer--; if (bannerTimer === 0) UI.banner.classList.remove('show'); }
}
let toastTimeout = 0;
function toast(text) {
  UI.toast.textContent = text;
  UI.toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => UI.toast.classList.remove('show'), 1800);
}


/* ---------------------------------------------------------------------------
   23. WAND EDITOR UI
   ------------------------------------------------------------------------- */
function spellIcon(id) {
  const sp = SPELLS[id];
  if (!sp) return '<span class="glyph">?</span>';
  return `<span class="glyph" style="color:${sp.color}">${sp.glyph}</span>`;
}
function openEditor(room, force) {
  if (gameState !== 'play') return;
  const inHoly = room || force || holyRoomAt(player.y, player.x);
  if (!inHoly && !player.perks.tinker) {
    toast('只能在灰烬圣所中编辑魔杖（或取得「游方匠」祝福）');
    sfxEmpty();
    return;
  }
  editMode = true;
  gameState = 'edit';
  pointer.down = false;
  editorState = { wand: currentWand, selected: null, selectedKind: null };
  renderEditor();
  UI.editor.classList.remove('hide');
  sfxOpen();
}
function closeEditor() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  editMode = false;
  editorState = null;
  gameState = 'play';
  UI.editor.classList.add('hide');
  updateHud();
}
function renderEditor() {
  if (!editorState) return;
  const wi = editorState.wand;
  const w = wands[wi];
  if (!w) return;
  const tabs = wands.map((ww, i) => `<button class="wandTab ${i === wi ? 'active' : ''}" data-tab="${i}">
    <b>${i + 1} · ${escapeHtml(ww.name)}</b><span>${ww.slots.filter(Boolean).length}/${ww.capacity} 槽 · 法力 ${ww.manaMax}</span></button>`).join('');
  const slots = w.slots.map((s, i) => {
    if (!s) return `<div class="spellSlot empty" data-slot="${i}"><span class="glyph">·</span><span class="nm">空槽</span></div>`;
    const sp = SPELLS[s.id];
    const sel = editorState.selectedKind === 'slot' && editorState.selected === i ? 'sel' : '';
    return `<div class="spellSlot ${sel}" draggable="true" data-slot="${i}" data-uid="${s.uid}" title="${escapeHtml(sp.desc)}">
      <span class="ty">${sp.type === 'mod' ? 'MOD' : sp.type === 'trigger' ? 'TRG' : 'PRJ'}</span>
      ${spellIcon(s.id)}<span class="nm">${escapeHtml(sp.name)}</span></div>`;
  }).join('');
  const lib = inventory.length ? inventory.map((s, i) => {
    const sp = SPELLS[s.id];
    return `<div class="libSpell ${editorState.selectedKind === 'lib' && editorState.selected === i ? 'sel' : ''}" draggable="true" data-lib="${i}" title="${escapeHtml(sp.desc)}">
      ${spellIcon(s.id)}<span class="nm">${escapeHtml(sp.name)}</span><span class="cost">${sp.cost >= 0 ? sp.cost : sp.cost}</span></div>`;
  }).join('') : '<small style="color:#6e675c">所有已知法术都已装入魔杖。探索宝箱与敌人掉落来获得更多。</small>';
  UI.editor.innerHTML = `
    <div class="panelTitle"><h3>魔杖编排台</h3><span>拖动法术，或点选后点击目标槽位 · 右键点击槽位可卸下</span><button class="closeX" id="editorClose">关闭 R</button></div>
    <div class="editorTop">
      <div>
        <div class="wandTabs">${tabs}</div>
        <div class="wandStats">
          <div><span>容量</span><b>${w.capacity}</b></div>
          <div><span>每次施法</span><b>${w.spellsPerCast}</b></div>
          <div><span>施法延迟</span><b>${(w.castDelay / 60).toFixed(2)}s</b></div>
          <div><span>充能</span><b>${(w.recharge / 60).toFixed(2)}s</b></div>
          <div><span>最大法力</span><b>${w.manaMax}</b></div>
          <div><span>法力回复</span><b>${w.manaRegen}/s</b></div>
          <div><span>散射</span><b>${(w.spread * 100).toFixed(0)}°</b></div>
          <div><span>乱序</span><b>${w.shuffle ? '是' : '否'}</b></div>
          <div><span>始终施放</span><b>${w.alwaysCast ? SPELLS[w.alwaysCast].name : '—'}</b></div>
          <div><span>阶级</span><b>${w.tier}</b></div>
        </div>
        <div class="slotHint">顺序规则：修饰法术作用于其后的投射物；<br/>触发法术会吞下后面的一枚法术，命中时再释放。</div>
      </div>
      <div>
        <div class="slotsBox" id="slotBox">${slots}</div>
        <div class="slotHint">左键选择 / 拖动 · 右键卸下 · 关闭后立即生效</div>
      </div>
    </div>
    <div class="library"><h4><span>法术书 · 未装配</span><span>${inventory.length} 枚</span></h4><div class="libraryGrid" id="libBox">${lib}</div></div>
    <div class="editorFoot"><small>提示：把「追踪」放在「炎团」前，再把「散射」放在最前，就能得到一片会追人的火雨。<br/>「火花·触发」会在命中后释放后面的法术，适合把昂贵法术安全地送到远处。</small><button class="btn" id="editorDone">完成编排</button></div>`;
  document.getElementById('editorClose').onclick = closeEditor;
  document.getElementById('editorDone').onclick = closeEditor;
  // tabs
  UI.editor.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => {
    editorState.wand = +el.dataset.tab; currentWand = editorState.wand; editorState.selected = null; editorState.selectedKind = null; renderEditor();
  });
  // slot click
  UI.editor.querySelectorAll('[data-slot]').forEach(el => {
    el.onclick = (ev) => {
      ev.preventDefault();
      const si = +el.dataset.slot;
      if (editorState.selectedKind === 'lib') {
        moveLibToSlot(editorState.selected, si);
      } else if (editorState.selectedKind === 'slot' && editorState.selected !== null) {
        if (editorState.selected === si) { editorState.selected = null; editorState.selectedKind = null; renderEditor(); return; }
        swapSlots(editorState.selected, si);
      } else if (w.slots[si]) {
        editorState.selected = si; editorState.selectedKind = 'slot'; renderEditor();
      }
    };
    el.oncontextmenu = (ev) => { ev.preventDefault(); const si = +el.dataset.slot; unequipSlot(si); };
    el.ondragstart = (ev) => {
      const si = +el.dataset.slot; if (!w.slots[si]) { ev.preventDefault(); return; }
      ev.dataTransfer.setData('text/plain', 'slot:' + si);
    };
    el.ondragover = (ev) => { ev.preventDefault(); el.classList.add('sel'); };
    el.ondragleave = () => el.classList.remove('sel');
    el.ondrop = (ev) => {
      ev.preventDefault();
      const data = ev.dataTransfer.getData('text/plain');
      if (data.startsWith('slot:')) { editorState.selectedKind = 'slot'; editorState.selected = +data.slice(5); swapSlots(+data.slice(5), +el.dataset.slot); }
      if (data.startsWith('lib:')) moveLibToSlot(+data.slice(4), +el.dataset.slot);
    };
  });
  // library click
  UI.editor.querySelectorAll('[data-lib]').forEach(el => {
    el.onclick = (ev) => {
      ev.preventDefault();
      const li = +el.dataset.lib;
      if (editorState.selectedKind === 'slot') {
        // let user click a slot; keep selection
        editorState.selectedKind = 'lib'; editorState.selected = li;
      } else editorState.selectedKind = 'lib', editorState.selected = li;
      renderEditor();
    };
    el.ondragstart = (ev) => ev.dataTransfer.setData('text/plain', 'lib:' + el.dataset.lib);
    el.ondragover = (ev) => ev.preventDefault();
    el.ondrop = (ev) => { ev.preventDefault(); const si = +el.dataset.slot; };
  });
}

function moveLibToSlot(li, si) {
  const w = wands[editorState.wand];
  const entry = inventory[li];
  if (!entry || !w) return;
  const old = w.slots[si];
  w.slots[si] = entry;
  inventory.splice(li, 1);
  if (old) inventory.push(old);
  editorState.selected = null; editorState.selectedKind = null;
  updateHud(); renderEditor(); sfxClick();
}
function swapSlots(a, b) {
  const w = wands[editorState.wand];
  if (!w) return;
  [w.slots[a], w.slots[b]] = [w.slots[b], w.slots[a]];
  editorState.selected = null; editorState.selectedKind = null;
  updateHud(); renderEditor(); sfxClick();
}
function unequipSlot(si) {
  const w = wands[editorState.wand];
  const s = w.slots[si];
  if (!s) return;
  inventory.push(s); w.slots[si] = null;
  editorState.selected = null; editorState.selectedKind = null;
  updateHud(); renderEditor(); sfxClick();
}

function renderPerks(room) {
  UI.perks.innerHTML = `<div class="card">
    <h1 class="logo" style="font-size:clamp(22px,4vw,38px);letter-spacing:.2em">灰烬圣所</h1>
    <h2>CHOOSE A BLESSING</h2>
    <p class="lede">石壁吞下了你的伤痛。选择一项祝福，带走它。</p>
    <div class="perkGrid">${perkChoices.map((p, i) => `
      <button class="perkCard" data-perk="${i}">
        <span class="key">${i + 1}</span>
        <span class="pi" style="color:${p.color}">${p.glyph}</span>
        <b>${escapeHtml(p.name)}</b>
        <small>${escapeHtml(p.desc)}</small>
      </button>`).join('')}</div>
    <p style="margin-top:16px"><small>祝福不会重复。按 1 / 2 / 3 或点击卡片。</small></p>
  </div>`;
  UI.perks.classList.remove('hide');
  UI.perks.querySelectorAll('[data-perk]').forEach(el => {
    el.onclick = () => choosePerk(+el.dataset.perk);
  });
}

/* ---------------------------------------------------------------------------
   24. AUDIO SYNTHESIS
   --------------------------------------------------------------------------- */
let lastSfx = 0, sfxBudget = 0;
function audioInit() {
  if (audioEngine) { if (audioEngine.ctx.state === 'suspended') audioEngine.ctx.resume(); return; }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctxA = new Ctx();
    const master = ctxA.createGain();
    master.gain.value = muted ? 0 : .6;
    const comp = ctxA.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ctxA.destination);
    const ambGain = ctxA.createGain(); ambGain.gain.value = .0;
    ambGain.connect(master);
    // drone
    const osc1 = ctxA.createOscillator(), osc2 = ctxA.createOscillator(), osc3 = ctxA.createOscillator();
    osc1.type = 'sine'; osc1.frequency.value = 55;
    osc2.type = 'sine'; osc2.frequency.value = 82.5;
    osc3.type = 'triangle'; osc3.frequency.value = 27.5;
    const g1 = ctxA.createGain(); g1.gain.value = .028;
    const g2 = ctxA.createGain(); g2.gain.value = .016;
    const g3 = ctxA.createGain(); g3.gain.value = .022;
    const lp = ctxA.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    osc1.connect(g1); osc2.connect(g2); osc3.connect(g3);
    g1.connect(lp); g2.connect(lp); g3.connect(lp); lp.connect(ambGain);
    osc1.start(); osc2.start(); osc3.start();
    // slow LFO on drone filter
    const lfo = ctxA.createOscillator(), lfoGain = ctxA.createGain();
    lfo.frequency.value = .055; lfoGain.gain.value = 90;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency); lfo.start();
    audioEngine = { ctx: ctxA, master, ambGain };
  } catch (e) { audioEngine = null; }
}
function audioAmbient(on) {
  if (!audioEngine) return;
  const g = audioEngine.ambGain.gain;
  const t = audioEngine.ctx.currentTime;
  g.cancelScheduledValues(t);
  g.linearRampToValueAtTime(on ? .9 : .28, t + 1.4);
}
function blip(freq, dur, type, vol, slide, delay) {
  if (!audioEngine || muted) return;
  const { ctx: a, master } = audioEngine;
  if (a.state === 'suspended') return;
  const t0 = a.currentTime + (delay || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol || .03, t0 + .008);
  g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + .02);
}
function noiseBurst(dur, freq, vol, q, delay) {
  if (!audioEngine || muted) return;
  const { ctx: a, master } = audioEngine;
  if (a.state === 'suspended') return;
  const t0 = a.currentTime + (delay || 0);
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t0);
  f.Q.value = q || 1;
  const g = a.createGain(); g.gain.setValueAtTime(vol || .04, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t0);
}
const CAST_SOUND = {
  spark: [620, .09, 'square', .022, 900], arcane: [480, .12, 'triangle', .026, 720],
  fireball: [180, .22, 'sawtooth', .03, 90], spore: [300, .13, 'triangle', .022, 180],
  frost: [880, .1, 'sine', .02, 1200], lightning: [1200, .08, 'sawtooth', .025, 200],
  drill: [140, .06, 'sawtooth', .02, 90], bomb: [110, .16, 'square', .028, 60],
  acidball: [240, .12, 'sawtooth', .02, 140], waterjet: [420, .07, 'sine', .012, 600],
  spark_trigger: [620, .09, 'square', .022, 900], arcane_timer: [480, .12, 'triangle', .026, 720]
};
function sfxCast(id) {
  const s = CAST_SOUND[id] || CAST_SOUND.spark;
  blip(s[0], s[1], s[2], s[3], s[4]);
  noiseBurst(.05, 2200, .012, 1);
}
function sfxExplosion(r) {
  noiseBurst(.32 + Math.min(.4, r * .012), 500, .09, .7);
  blip(90, .35, 'sine', .06, 35);
  blip(160, .18, 'sawtooth', .025, 60);
}
function sfxHit() { blip(220, .04, 'square', .015, 140); noiseBurst(.035, 3200, .018, 1); }
function sfxImpact(el) {
  if (el === 'water') { noiseBurst(.09, 1800, .014, 1); blip(520, .06, 'sine', .008, 300); }
  else if (el === 'ice') { blip(1300, .07, 'triangle', .012, 900); noiseBurst(.06, 5000, .012, 2); }
  else if (el === 'electric') { noiseBurst(.08, 6000, .018, 3); blip(1600, .05, 'sawtooth', .01, 400); }
  else if (el === 'fire') { noiseBurst(.1, 1200, .018, .8); blip(160, .1, 'sawtooth', .012, 70); }
  else if (el === 'acid' || el === 'toxic') { noiseBurst(.1, 900, .014, 1); blip(280, .09, 'sawtooth', .01, 140); }
  else sfxHit();
}
function sfxCrit() { blip(940, .09, 'square', .03, 1400); noiseBurst(.05, 4200, .03, 2); }
function sfxKill() { noiseBurst(.12, 900, .03, .8); blip(150, .12, 'sawtooth', .02, 70); }
function sfxHurt(cause) {
  if (cause === 'fire' || cause === 'lava') noiseBurst(.18, 1400, .035, .6);
  else noiseBurst(.12, 800, .028, .7);
  blip(190, .15, 'sawtooth', .018, 80);
}
function sfxJump() { blip(300, .05, 'triangle', .01, 420); }
function sfxCoin() { blip(1180, .05, 'sine', .016, 1500); blip(1620, .06, 'sine', .012, 1900, .035); }
function sfxHeal() { blip(520, .12, 'sine', .02, 780); blip(780, .16, 'sine', .016, 1040, .08); }
function sfxWand() { blip(320, .12, 'triangle', .025, 640); blip(640, .14, 'sine', .018, 900, .08); }
function sfxSpell() { blip(660, .08, 'triangle', .02, 990); blip(990, .1, 'sine', .014, 1320, .06); }
function sfxChest() { noiseBurst(.16, 700, .03, 1); blip(260, .08, 'square', .02, 340); }
function sfxEmpty() { blip(120, .06, 'square', .014, 90); }
function sfxOpen() { blip(440, .08, 'sine', .018, 660); }
function sfxClick() { blip(700, .025, 'square', .008, 900); }
function sfxHoly() { [440, 554, 659, 880].forEach((f, i) => blip(f, .5, 'sine', .018, f, i * .12)); noiseBurst(.6, 900, .012, .6); }
function sfxPerk() { [523, 659, 784, 1046].forEach((f, i) => blip(f, .35, 'triangle', .016, f, i * .07)); }
function sfxPortal() { blip(180, .5, 'sine', .04, 900); noiseBurst(.5, 1800, .025, .8); }
function sfxEnemyShoot() { blip(210, .07, 'sawtooth', .012, 150); }
function sfxBossCast() { blip(70, .4, 'sawtooth', .04, 45); noiseBurst(.25, 500, .04, .6); }
function sfxBossDeath() { noiseBurst(1.2, 380, .12, .6); blip(60, 1.4, 'sine', .09, 24); }
function sfxDeath() { blip(220, .5, 'sawtooth', .035, 55); noiseBurst(.6, 400, .04, .7); }
function sfxShield() { blip(880, .3, 'sine', .03, 220); noiseBurst(.2, 2500, .03, 1); }
function sfxWin() { [262, 330, 392, 523, 659].forEach((f, i) => blip(f, .8, 'sine', .02, f, i * .14)); }

/* ---------------------------------------------------------------------------
   25. INPUT
   ------------------------------------------------------------------------- */
const touchState = { left: false, right: false, jump: false, joyId: null };

function setupInput() {
  window.addEventListener('keydown', e => {
    if (e.repeat && !['a', 'd', 'w', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp'].includes(e.key)) return;
    const k = e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'd', 'w', 's'].includes(k)) e.preventDefault();
    keys[k] = true;
    audioInit();
    if (gameState === 'title' && (k === 'Enter' || k === ' ')) { startGame(); return; }
    if (gameState === 'perk') {
      if (['1', '2', '3'].includes(k)) choosePerk(+k - 1);
      return;
    }
    if (gameState === 'edit') {
      if (k === 'Escape' || k === 'r' || k === 'R') closeEditor();
      return;
    }
    if (gameState === 'pause') {
      if (k === 'Escape') togglePause();
      return;
    }
    if (k === 'Escape') { togglePause(); return; }
    if (k === 'm' || k === 'M') { toggleMute(); return; }
    if (gameState !== 'play') return;
    if (k >= '1' && k <= '4') {
      const idx = +k - 1;
      if (wands[idx]) { currentWand = idx; updateHud(); sfxClick(); }
      return;
    }
    if (k === 'e' || k === 'E') { interact(); return; }
    if (k === 'r' || k === 'R') {
      const atBench = world.workbench && dist2(player.x, player.y, world.workbench.x, world.workbench.y) < 40 * 40;
      if (holyRoomAt(player.y, player.x) || player.perks.tinker || atBench) openEditor(null, atBench);
      else toast('圣所之外，魔杖拒绝被重新编排');
      return;
    }
    if (k === 'q' || k === 'Q') { cycleWand(); return; }
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden && gameState === 'play') togglePause(); });
  window.addEventListener('blur', () => {
    keys = {}; pointer.down = false; touchState.left = touchState.right = touchState.jump = false;
    if (gameState === 'play') togglePause();
  });

  // pointer aim
  function updatePointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.x = clamp((e.clientX - r.left) / r.width * VW, 0, VW);
    pointer.y = clamp((e.clientY - r.top) / r.height * VH, 0, VH);
    pointer.active = true;
  }
  canvas.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons) updatePointer(e); });
  canvas.addEventListener('pointerdown', e => {
    audioInit();
    if (e.pointerType !== 'mouse') updatePointer(e);
    else updatePointer(e);
    if (gameState === 'play') {
      pointer.down = true;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    }
    e.preventDefault();
  });
  window.addEventListener('pointerup', e => {
    if (e.pointerType === 'mouse' || e.pointerId === undefined) pointer.down = false;
    else pointer.down = false;
  });
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') pointer.down = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('pointerup', () => { pointer.down = false; });

  // wand chips
  UI.wandHud.addEventListener('click', e => {
    const c = e.target.closest('[data-wand]');
    if (c && gameState === 'play') { currentWand = +c.dataset.wand; updateHud(); sfxClick(); }
  });

  // mobile joystick
  const joy = $('joyBase'), knob = $('joyKnob');
  let joyId = null;
  function joyMove(e) {
    if (e.pointerId !== joyId) return;
    const r = joy.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
    touchState.left = dx < -.25; touchState.right = dx > .25;
    touchState.jump = dy < -.48;
    const mx = clamp(dx, -1, 1) * 30, my = clamp(dy, -1, 1) * 30;
    knob.style.transform = `translate(${mx}px,${my}px)`;
    e.preventDefault();
  }
  joy.addEventListener('pointerdown', e => {
    joyId = e.pointerId; touchState.joyId = joyId; joy.setPointerCapture && joy.setPointerCapture(e.pointerId);
    joyMove(e); audioInit(); e.preventDefault();
  });
  joy.addEventListener('pointermove', joyMove);
  const joyEnd = e => {
    if (e.pointerId !== joyId) return;
    joyId = null; touchState.left = touchState.right = touchState.jump = false;
    knob.style.transform = 'translate(0,0)';
  };
  joy.addEventListener('pointerup', joyEnd);
  joy.addEventListener('pointercancel', joyEnd);
  joy.addEventListener('lostpointercapture', joyEnd);

  const btnJump = $('btnJump');
  btnJump.addEventListener('pointerdown', e => { touchState.jump = true; audioInit(); e.preventDefault(); });
  btnJump.addEventListener('pointerup', e => { touchState.jump = false; e.preventDefault(); });
  btnJump.addEventListener('pointercancel', () => touchState.jump = false);
  btnJump.addEventListener('pointerleave', () => touchState.jump = false);

  const btnFire = $('btnFire');
  btnFire.addEventListener('pointerdown', e => { pointer.down = true; audioInit(); e.preventDefault(); });
  btnFire.addEventListener('pointerup', e => { pointer.down = false; e.preventDefault(); });
  btnFire.addEventListener('pointercancel', () => pointer.down = false);
  btnFire.addEventListener('pointerleave', () => pointer.down = false);
  $('btnAct').addEventListener('pointerdown', e => { interact(); e.preventDefault(); });
  $('btnWand').addEventListener('pointerdown', e => { cycleWand(); e.preventDefault(); });
  $('btnPause').addEventListener('pointerdown', e => { e.preventDefault(); if (gameState === 'play') togglePause(); });

  // buttons
  $('startBtn').onclick = () => startGame();
  $('restartBtn').onclick = () => startGame();
  $('winBtn').onclick = () => startGame();
  $('resumeBtn').onclick = () => togglePause();
  $('muteBtn').onclick = () => toggleMute();
  $('pauseRestart').onclick = () => { UI.pause.classList.add('hide'); startGame(); };
  window.addEventListener('resize', () => { /* CSS handles scaling */ });
}

function cycleWand() {
  if (!wands.length) return;
  currentWand = (currentWand + 1) % wands.length;
  updateHud(); sfxClick();
}
function togglePause() {
  if (gameState === 'play') {
    gameState = 'pause';
    pointer.down = false;
    keys = {};
    UI.pause.classList.remove('hide');
    sfxOpen();
  } else if (gameState === 'pause') {
    gameState = 'play';
    UI.pause.classList.add('hide');
  }
}
function toggleMute() {
  muted = !muted;
  if (audioEngine) {
    audioEngine.master.gain.cancelScheduledValues(audioEngine.ctx.currentTime);
    audioEngine.master.gain.linearRampToValueAtTime(muted ? 0 : .6, audioEngine.ctx.currentTime + .1);
  }
  $('muteBtn').textContent = muted ? '取消静音' : '静音';
  toast(muted ? '静音' : '声音开启');
}

/* ---------------------------------------------------------------------------
   26. GAME LOOP / INIT
   --------------------------------------------------------------------------- */
function update() {
  if (gameState !== 'play') return;
  frame++;
  run.time += 1 / 60;
  // pointer world coordinates
  pointer.wx = camX + pointer.x;
  pointer.wy = camY + pointer.y;
  updatePlayer();
  if (player.dead) return;
  simulateMaterials();
  updateProjectiles();
  updateEnemies();
  updatePickups();
  updateParticles();
  updateFlow();
  // camera follow, slight aim lead
  const aim = aimWorld();
  const leadX = clamp((aim.x - player.x) * .12, -46, 46);
  const targetX = clamp(player.x - VW / 2 + leadX, 0, W - VW);
  const targetY = clamp(player.y - VH * .52, 0, H - VH);
  camX = lerp(camX, targetX, .12);
  camY = lerp(camY, targetY, .12);
  // biome banner
  const b = biomeAt(player.y);
  if (b.key !== lastBiomeKey && !holyRoomAt(player.y, player.x)) {
    lastBiomeKey = b.key;
    showBanner(b.name, b.en);
  }
  // ambient particles are spawned in draw -> updateParticles
  if (frame % 6 === 0) updateHud();
  tickBanner();
  if (frame % 120 === 0) {
    // keep particles from growing unbounded
    if (particles.length > 1200) particles.splice(0, particles.length - 1200);
  }
  // low-hp slow heartbeat cue
  if (player.hp / player.maxHp < .25 && frame % 120 === 0) sfxHurt('low');
}
let lastBiomeKey = 'woods';

function loop(ts) {
  const dt = Math.min(48, ts - lastFrameTime || 16.6);
  lastFrameTime = ts;
  if (gameState === 'play') {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= 16.666 && steps < 2) {
      update();
      accumulator -= 16.666;
      steps++;
      if (gameState !== 'play') break;
    }
    if (steps === 0 && accumulator > 0) { /* wait */ }
  } else {
    accumulator = 0;
    tickBanner();
    if (gameState === 'dead' || gameState === 'title') updateParticles();
    if (gameState === 'title') {
      // gentle title camera drift
      camX = clamp(player ? player.x - VW / 2 + Math.sin(ts * .00012) * 22 : 0, 0, W - VW);
      camY = clamp(player ? player.y - VH * .58 : 0, 0, H - VH);
    }
  }
  draw();
  requestAnimationFrame(loop);
}

function init() {
  // cache UI
  UI.title = $('title'); UI.dead = $('dead'); UI.win = $('win'); UI.pause = $('pause');
  UI.editor = $('editor'); UI.perks = $('perks');
  UI.hpFill = $('hpFill'); UI.manaFill = $('manaFill'); UI.levFill = $('levFill');
  UI.hpText = $('hpText'); UI.manaText = $('manaText'); UI.levText = $('levText');
  UI.statusRow = $('statusRow'); UI.perkRow = $('perkRow'); UI.biomeName = $('biomeName'); UI.biomeSub = $('biomeSub');
  UI.goldText = $('goldText'); UI.depthText = $('depthText'); UI.seedChip = $('seedChip');
  UI.killText = $('killText'); UI.materialChip = $('materialChip');
  UI.wandHud = $('wandHud'); UI.prompt = $('interactPrompt'); UI.promptText = $('promptText');
  UI.toast = $('toast'); UI.banner = $('banner'); UI.bannerTitle = $('bannerTitle'); UI.bannerSub = $('bannerSub');
  UI.bossBar = $('bossBar'); UI.bossFill = $('bossFill');
  // best run
  try {
    bestRun = JSON.parse(localStorage.getItem('deeprock_best') || 'null');
  } catch (e) { bestRun = null; }
  $('bestLine').textContent = bestRun
    ? `最深 ${bestRun.depth}m · 击杀 ${bestRun.kills} · 金币 ${bestRun.gold}`
    : '尚无远征记录';
  // title backdrop world
  seed = (Date.now() ^ 0x51ed270b) >>> 0;
  generateWorld(seed);
  makeStartingWands();
  player = {
    x: W / 2 - 6, y: world.startSurf - 12, vx: 0, vy: 0, w: 6, h: 12,
    hp: 100, maxHp: 100, mana: 100, maxMana: 100, lev: 100, maxLev: 100,
    onGround: true, coyote: 0, dir: 1, inv: 0, dead: false, walk: 0, aim: .4,
    wet: 0, oil: 0, blood: 0, toxic: 0, poison: 0, burning: 0, frozen: 0, regen: 0,
    drown: 0, acidTick: 0, lavaTick: 0, crush: 0, oxygen: 100, airborne: 0,
    perks: {}, kills: 0, castFlash: 0, shield: 0, lastDamage: null, jumpWas: false
  };
  run = { gold: 0, kills: 0, depth: 0, time: 0, start: performance.now(), cause: '', detail: '', boss: false };
  camX = clamp(player.x - VW / 2, 0, W - VW);
  camY = clamp(player.y - VH * .58, 0, H - VH);
  lastBiomeKey = 'woods';
  gameState = 'title';
  $('hud').style.opacity = .18;
  setupInput();
  updateHud();
  requestAnimationFrame(loop);
}

/* ---------------------------------------------------------------------------
   27. DEBUG / TEST API (used by automated verification)
   --------------------------------------------------------------------------- */
window.DBG = {
  start: (s) => { if (s !== undefined) { resetRun(s >>> 0); } else startGame(); },
  get state() { return gameState; },
  get frame() { return frame; },
  get seed() { return seed; },
  get player() { return player; },
  get run() { return run; },
  get enemies() { return enemies; },
  get wands() { return wands; },
  get inventory() { return inventory; },
  get pickups() { return pickups; },
  get particles() { return particles; },
  get world() { return world; },
  get cam() { return { x: camX, y: camY }; },
  cell: (x, y) => get(x, y),
  set: (x, y, m) => setm(x, y, m),
  step: (n) => { for (let i = 0; i < (n || 1); i++) simulateMaterials(); },
  ign: (x, y) => ignite(x, y, 60),
  biome: (y) => biomeAt(y).name,
  teleport: (x, y) => {
    for (let yy = Math.floor(y) - 16; yy < y + 12; yy++) for (let xx = Math.floor(x) - 12; xx < x + 12; xx++) if (inside(xx, yy)) setm(xx, yy, M.AIR);
    for (let xx = Math.floor(x) - 12; xx < x + 12; xx++) if (inside(xx, Math.floor(y) + 8)) setm(xx, Math.floor(y) + 8, M.ROCK);
    player.x = x; player.y = y; player.vx = 0; player.vy = 0; player.hp = Math.max(player.hp, player.maxHp * .5);
    camX = clamp(x - VW / 2, 0, W - VW); camY = clamp(y - VH * .52, 0, H - VH);
  },
  teleportY: (y) => { player.x = W / 2; player.y = y; player.vx = 0; player.vy = 0; },
  spawn: (type, dx, dy, bi) => spawnEnemy(type, player.x + (dx || 30), player.y + (dy || 0), bi || 2),
  hurt: (n, cause) => hurtPlayer(n || 5, cause || 'fire', '测试伤害', true),
  explode: (x, y, r) => explodeAt(x, y, r || 12, 30, 'player', 14),
  give: (id) => { addSpellToInventory(id); },
  giveWand: (bi) => { const w = makeRandomWand(bi || 3, player.y); if (wands.length < 4) wands.push(w); else wands[currentWand] = w; return w; },
  setWand: (i, ids) => { const w = makeWand('测试杖', { capacity: ids.length, castDelay: 4, recharge: 10, manaMax: 999, manaRegen: 200 }, ids); wands[i] = w; currentWand = i; return w; },
  aimAt: (x, y) => { pointer.active = true; pointer.wx = x; pointer.wy = y; pointer.x = x - camX; pointer.y = y - camY; },
  fire: (on) => { pointer.down = !!on; },
  interact: () => interact(),
  openEditor: () => openEditor(null),
  choosePerk: (i) => choosePerk(i),
  killAll: () => { for (const e of enemies) if (!e.dead) killEnemy(e, 'fire', true); },
  lightInfo: () => {
    // sample screen luminance from canvas
    const d = ctx.getImageData(0, 0, VW, VH).data;
    let sum = 0, lit = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) {
      const l = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114);
      sum += l; if (l > 40) lit++; n++;
    }
    return { avg: sum / n, lit: lit / n, n };
  },
  loot: () => pickups.length,
  god: (on) => { window.DBG._god = !!on; }
};
window.addEventListener('load', init);
