/* =============================================================================
   PIXEL ALCHEMIST — 像素炼金术士
   一个纯前端、零后端、零构建的 Noita 风格像素物理 Roguelite。
   原创代码 / 原创像素绘制 / 原创命名；仅复刻公开可验证的系统关系。
   -----------------------------------------------------------------------------
   part 1 / 6 : 常量 · 材料表 · 噪声 · 世界生成
   ============================================================================= */
'use strict';

/* ---------------------------------------------------------------------------
 * 0. 基本常量
 * ------------------------------------------------------------------------- */
const VW = 320, VH = 180;          // 视口像素
const W = 512, H = 2240;           // 世界像素（纵向探索）
const TOP = 48;                    // 地表岩石厚度
const LAYER_H = 220;               // 单个生物群系高度
const HOLY_H = 44;                 // 圣山房间高度
const LAYER_TOTAL = LAYER_H + HOLY_H;
const NB = 8;                      // 生物群系数量
const FPS = 60;

/* 固定 60Hz 逻辑步长；渲染用 requestAnimationFrame */
const STEP_MS = 1000 / FPS;

/* ---------------------------------------------------------------------------
 * 1. 材料
 *    cat: 0 空气 / 1 固体 / 2 粉末 / 3 液体 / 4 气体 / 5 火焰
 *    dens: 液体密度（越大越沉） / flam: 可燃度 0..1 / hard: 硬度耐久
 *    dmg: 每帧每像素对玩家的伤害 / light: 自发光强度 / trans: 透光率(每格)
 * ------------------------------------------------------------------------- */
const CAT_AIR = 0, CAT_SOLID = 1, CAT_POWDER = 2, CAT_LIQ = 3, CAT_GAS = 4, CAT_FIRE = 5;

const M = {};
const MAT_DEFS = [];
function defMat(key, name, cat, opt) {
  opt = opt || {};
  const id = MAT_DEFS.length;
  M[key] = id;
  MAT_DEFS.push({
    id, key, name, cat,
    dens: opt.dens != null ? opt.dens : 1,
    flam: opt.flam || 0,
    hard: opt.hard != null ? opt.hard : 6,
    dmg: opt.dmg || 0,
    light: opt.light || 0,
    lightCol: opt.lightCol || [255, 190, 110],
    trans: opt.trans != null ? opt.trans : (cat === CAT_AIR || cat === CAT_GAS ? 0.90 : cat === CAT_LIQ ? 0.74 : 0.0),
    acid: opt.acid != null ? opt.acid : (cat === CAT_SOLID || cat === CAT_POWDER ? 1 : 0),
    melt: opt.melt || null,       // 接触岩浆/火时的转化
    cool: opt.cool || null,       // 遇冷转化
    corrodible: opt.corrodible !== false,
    colors: opt.colors,
    liquid: cat === CAT_LIQ,
    solid: cat === CAT_SOLID,
    powder: cat === CAT_POWDER,
    gas: cat === CAT_GAS,
    desc: opt.desc || ''
  });
  return id;
}

/* --- 空气与背景 --- */
defMat('AIR', '空气', CAT_AIR, { trans: 1.0, colors: [[0, 0, 0]] });

/* --- 固体 --- */
defMat('ROCK',   '岩石',     CAT_SOLID, { hard: 10, colors: [[58,58,66],[47,47,55],[70,70,79],[39,39,46]], desc: '常见的地下岩石' });
defMat('DENSE',  '致密岩',   CAT_SOLID, { hard: 15, colors: [[44,44,52],[35,35,42],[53,53,62]], desc: '难以破坏的边界岩层' });
defMat('DIRT',   '土壤',     CAT_SOLID, { hard: 8,  colors: [[74,58,44],[62,48,36],[86,67,50],[53,41,31]], desc: '普通的泥土' });
defMat('SANDSTONE','砂岩',   CAT_SOLID, { hard: 9,  colors: [[122,104,70],[104,88,58],[138,118,82]], desc: '压实的沙' });
defMat('SNOW',   '积雪',     CAT_SOLID, { hard: 4,  colors: [[216,226,234],[196,210,221],[238,244,248]], desc: '松软的雪' });
defMat('ICE',    '冰',       CAT_SOLID, { hard: 7,  colors: [[143,182,204],[169,207,224],[118,162,186]], trans: 0.55, desc: '半透明的冰' });
defMat('COAL',   '煤',       CAT_SOLID, { hard: 8,  flam: 0.35, colors: [[28,28,34],[38,38,46],[20,20,26]], desc: '可燃的煤' });
defMat('WOOD',   '木材',     CAT_SOLID, { hard: 6,  flam: 0.55, colors: [[107,74,42],[90,61,34],[125,89,54],[72,48,26]], desc: '干燥的木材，易燃' });
defMat('MOSS',   '苔藓',     CAT_SOLID, { hard: 3,  flam: 0.30, colors: [[63,107,58],[79,125,69],[51,88,47]], desc: '潮湿的苔藓' });
defMat('GRASS',  '草',       CAT_SOLID, { hard: 2,  flam: 0.45, colors: [[90,143,63],[74,122,52],[106,160,74]], desc: '干草，易燃' });
defMat('FUNGUS', '菌丝',     CAT_SOLID, { hard: 3,  flam: 0.40, colors: [[122,79,143],[154,106,176],[95,60,114]], desc: '潮湿的菌类' });
defMat('GLOWSHROOM','发光菇',CAT_SOLID, { hard: 2,  flam: 0.30, colors: [[176,111,208],[210,150,232],[140,86,176]], light: 1.35, lightCol: [176,120,255], desc: '会发光的菌菇' });
defMat('STEEL',  '钢',       CAT_SOLID, { hard: 12, colors: [[107,114,128],[125,133,146],[86,93,104],[140,148,160]], desc: '导电的金属结构' });
defMat('RUST',   '锈蚀金属', CAT_SOLID, { hard: 11, colors: [[138,90,58],[116,74,46],[154,104,68]], desc: '锈迹斑斑的金属' });
defMat('BRICK',  '砖石',     CAT_SOLID, { hard: 14, colors: [[90,74,99],[107,88,118],[74,61,82],[122,102,134]], desc: '神殿的砖墙' });
defMat('GOLD',   '金矿',     CAT_SOLID, { hard: 8,  colors: [[224,184,58],[244,208,96],[196,154,40]], light: 0.30, lightCol: [255,210,110], desc: '嵌在岩石中的金矿' });
defMat('GEM',    '魔晶',     CAT_SOLID, { hard: 10, colors: [[192,95,208],[217,143,224],[160,74,176]], light: 0.55, lightCol: [210,120,255], desc: '微微发光的晶体' });
defMat('BONE',   '骨',       CAT_SOLID, { hard: 6,  colors: [[207,198,173],[184,175,150],[224,216,194]], desc: '风化的骨骼' });
defMat('HOLY',   '圣石',     CAT_SOLID, { hard: 40, colors: [[216,200,144],[196,178,124],[236,222,172]], light: 0.18, lightCol: [255,235,180], desc: '圣山的不朽砖石' });
defMat('GLASS',  '玻璃',     CAT_SOLID, { hard: 4,  colors: [[150,190,205],[178,212,224]], trans: 0.7, desc: '易碎的玻璃' });
defMat('CONCRETE','混凝土',  CAT_SOLID, { hard: 11, colors: [[116,116,120],[98,98,103],[134,134,139]], desc: '浇筑的混凝土' });
defMat('CRYSTAL','冰晶',     CAT_SOLID, { hard: 8,  colors: [[150,200,220],[190,225,240]], trans: 0.5, desc: '冻结的晶体' });

/* --- 粉末 --- */
defMat('POW_SAND','砂',      CAT_POWDER, { dens: 1.6, hard: 4, colors: [[176,154,94],[194,171,108],[154,133,80]], desc: '会流动的沙' });
defMat('POW_SNOW','雪粒',    CAT_POWDER, { dens: 1.1, hard: 3, colors: [[226,236,244],[206,220,230]], desc: '会堆积的雪' });
defMat('POW_COAL','煤粉',    CAT_POWDER, { dens: 1.4, hard: 7, flam: 0.4, colors: [[34,34,42],[44,44,54],[24,24,30]], desc: '可燃的煤粉' });
defMat('POW_GOLD','金粉',    CAT_POWDER, { dens: 1.8, hard: 5, colors: [[232,196,72],[250,216,110]], light: 0.25, lightCol: [255,215,120], desc: '沉甸甸的金粉' });
defMat('POW_GUN', '火药',    CAT_POWDER, { dens: 1.5, hard: 5, flam: 0.95, colors: [[96,92,84],[78,74,68],[112,108,98]], desc: '极易燃易爆' });
defMat('ASH',     '灰烬',    CAT_POWDER, { dens: 0.8, hard: 2, colors: [[86,84,84],[70,68,68],[100,98,98]], desc: '燃烧后的灰' });
defMat('POW_BONE','骨粉',    CAT_POWDER, { dens: 1.3, hard: 5, colors: [[200,192,170],[178,170,148]], desc: '碎裂的骨粉' });

/* --- 液体 --- */
defMat('WATER',   '水',      CAT_LIQ, { dens: 1.00, colors: [[47,111,191],[61,130,208],[37,95,168]], trans: 0.78, desc: '能灭火、导电' });
defMat('OIL',     '油',      CAT_LIQ, { dens: 0.82, flam: 0.7, colors: [[42,35,24],[30,26,18],[56,48,31]], trans: 0.62, desc: '浮在水上，极易燃' });
defMat('BLOOD',   '血',      CAT_LIQ, { dens: 1.10, colors: [[138,31,42],[163,38,51],[110,24,34]], trans: 0.66, desc: '沉在水下' });
defMat('ACID',    '酸液',    CAT_LIQ, { dens: 1.05, dmg: 0.125, colors: [[127,191,47],[154,223,63],[95,159,31]], light: 0.30, lightCol: [150,255,80], trans: 0.72, desc: '腐蚀一切固体' });
defMat('LAVA',    '岩浆',    CAT_LIQ, { dens: 2.20, dmg: 0.075, colors: [[224,90,16],[255,138,31],[255,194,74]], light: 2.4, lightCol: [255,140,50], trans: 0.85, desc: '熔化的岩石，极热' });
defMat('TOXIC',   '毒泥',    CAT_LIQ, { dens: 1.06, dmg: 0.025, colors: [[106,143,47],[143,184,74],[95,88,42]], light: 0.25, lightCol: [170,220,90], trans: 0.74, desc: '缓慢侵蚀生命' });
defMat('SLIME',   '黏液',    CAT_LIQ, { dens: 1.20, colors: [[79,143,63],[106,176,82],[63,118,50]], trans: 0.66, desc: '黏稠的绿色液体' });
defMat('ALCOHOL', '酒精',    CAT_LIQ, { dens: 0.80, flam: 0.9, colors: [[196,214,224],[168,190,205]], trans: 0.7, desc: '极易燃的烈酒' });
defMat('MANA',    '魔液',    CAT_LIQ, { dens: 1.00, colors: [[61,120,220],[96,160,255],[40,90,180]], light: 0.8, lightCol: [110,170,255], trans: 0.8, desc: '蕴含魔力的蓝色液体' });
defMat('HEALTHIUM','命泉',   CAT_LIQ, { dens: 1.00, colors: [[220,80,140],[255,130,180],[180,60,110]], light: 0.9, lightCol: [255,130,190], trans: 0.8, desc: '接触即缓慢治愈' });
defMat('CEMENT',  '水泥',    CAT_LIQ, { dens: 1.4, colors: [[130,130,134],[112,112,116]], trans: 0.6, desc: '接触水后凝固' });

/* --- 气体 / 火焰 --- */
defMat('FIRE',    '火焰',    CAT_FIRE, { flam: 0, colors: [[255,210,74],[255,138,31],[224,58,16],[255,240,180]], light: 1.7, lightCol: [255,150,60], trans: 0.96, desc: '会蔓延也会熄灭' });
defMat('SMOKE',   '烟',      CAT_GAS, { dens: 0.05, colors: [[74,74,78],[60,60,64],[88,88,92]], trans: 0.72, desc: '上升并逐渐消散' });
defMat('STEAM',   '蒸汽',    CAT_GAS, { dens: 0.06, colors: [[196,212,222],[220,232,240],[170,190,204]], light: 0.12, lightCol: [200,220,255], trans: 0.82, desc: '上升，会冷凝成水' });
defMat('TOXIC_GAS','毒气',   CAT_GAS, { dens: 0.12, dmg: 0.025, colors: [[143,191,63],[122,168,52],[168,210,90]], light: 0.3, lightCol: [160,220,90], trans: 0.80, desc: '上升的剧毒气体' });
defMat('FLAM_GAS','可燃气体', CAT_GAS, { dens: 0.08, flam: 1.0, colors: [[216,216,154],[190,190,130],[236,236,180]], trans: 0.82, desc: '遇火即爆' });
defMat('EMBER',   '余烬',    CAT_FIRE, { colors: [[255,122,42],[255,170,80],[200,70,20]], light: 0.7, lightCol: [255,130,50], trans: 0.95, desc: '飞散的火星' });

const NMAT = MAT_DEFS.length;

/* 材料分类查询（typed 数组，便于热循环） */
const MAT_CAT = new Uint8Array(NMAT);
const MAT_DENS = new Float32Array(NMAT);
const MAT_FLAM = new Float32Array(NMAT);
const MAT_HARD = new Uint8Array(NMAT);
const MAT_DMG = new Float32Array(NMAT);
const MAT_LIGHT = new Float32Array(NMAT);
const MAT_TRANS = new Float32Array(NMAT);
const MAT_ACID = new Uint8Array(NMAT);
const MAT_CORR = new Uint8Array(NMAT);
const MAT_RGB = [];                 // 每种材料若干颜色变体（已打包 ABGR）
const MAT_LIGHT_RGB = new Float32Array(NMAT * 3);
for (let i = 0; i < NMAT; i++) {
  const d = MAT_DEFS[i];
  MAT_CAT[i] = d.cat;
  MAT_DENS[i] = d.dens;
  MAT_FLAM[i] = d.flam;
  MAT_HARD[i] = d.hard;
  MAT_DMG[i] = d.dmg;
  MAT_LIGHT[i] = d.light;
  MAT_TRANS[i] = d.trans;
  MAT_ACID[i] = d.acid;
  MAT_CORR[i] = d.corrodible ? 1 : 0;
  MAT_LIGHT_RGB[i*3] = d.lightCol[0] / 255;
  MAT_LIGHT_RGB[i*3+1] = d.lightCol[1] / 255;
  MAT_LIGHT_RGB[i*3+2] = d.lightCol[2] / 255;
  MAT_RGB.push(d.colors.map(c => pack(c[0], c[1], c[2])));
}
function pack(r, g, b) { return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; }
function matName(m) { return MAT_DEFS[m] ? MAT_DEFS[m].name : '?'; }
function matCatName(m) {
  const c = MAT_CAT[m];
  return ['空气','固体','粉末','液体','气体','火焰'][c] || '?';
}
const IS_SOLID = m => MAT_CAT[m] === CAT_SOLID;
const IS_POWDER = m => MAT_CAT[m] === CAT_POWDER;
const IS_LIQ = m => MAT_CAT[m] === CAT_LIQ;
const IS_GAS = m => MAT_CAT[m] === CAT_GAS;
const IS_FIRE = m => MAT_CAT[m] === CAT_FIRE;
const IS_FLUID = m => MAT_CAT[m] === CAT_LIQ || MAT_CAT[m] === CAT_GAS || MAT_CAT[m] === CAT_FIRE;

/* ---------------------------------------------------------------------------
 * 2. 随机与噪声
 * ------------------------------------------------------------------------- */
let seed = 12345;
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
let rng = makeRng(seed);
function ri(a, b) { return Math.floor(rng() * (b - a + 1)) + a; }
function rf(a, b) { return rng() * (b - a) + a; }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

/* 整数哈希 → [0,1) */
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/* 二维值噪声（双线性 + 平滑） */
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, s, oct) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += vnoise(x * f, y * f, s + i * 101) * amp;
    norm += amp;
    amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

/* ---------------------------------------------------------------------------
 * 3. 生物群系定义
 * ------------------------------------------------------------------------- */
const BIOMES = [
  { key:'mines',  name:'矿坑',      sub:'坍塌的矿井',     bg:[44,46,66],  amb:[0.176,0.172,0.20], rock:'ROCK',  soil:'DIRT',  accent:'POW_SAND',
    liquids:['WATER','WATER','OIL'],   hazard:null,      light:1.00, enemies:['miner','bat','gunner'],          spawn:5, desc:'潮湿的矿井，砂与水随处可见。' },
  { key:'coal',   name:'煤坑',      sub:'闷燃的煤层',     bg:[46,40,36],  amb:[0.16,0.148,0.144], rock:'ROCK',  soil:'COAL',  accent:'POW_COAL',
    liquids:['LAVA','OIL','WATER'],    hazard:'LAVA',    light:0.95, enemies:['miner','bomber','gunner','firefly'], spawn:6, desc:'煤与岩浆，空气里都是焦味。' },
  { key:'snow',   name:'雪原深处',  sub:'冻结的洞窟',     bg:[44,56,74],  amb:[0.192,0.208,0.24], rock:'ICE',   soil:'SNOW',  accent:'POW_SNOW',
    liquids:['WATER','WATER'],         hazard:'ICE',     light:1.05, enemies:['bat','gunner','wisp','miner'],    spawn:6, desc:'冰雪覆盖，寒风刺骨。' },
  { key:'hiisi',  name:'铁颚要塞',  sub:'锈蚀的机械',     bg:[50,50,55],  amb:[0.16,0.16,0.172], rock:'STEEL', soil:'RUST',  accent:'CONCRETE',
    liquids:['OIL','WATER'],           hazard:null,      light:1.0,  enemies:['gunner','miner','turret','bomber'], spawn:7, desc:'蜥人的钢铁要塞，油污满地。' },
  { key:'jungle', name:'地下丛林',  sub:'湿热的菌林',     bg:[38,54,44],  amb:[0.168,0.188,0.168], rock:'MOSS', soil:'DIRT', accent:'FUNGUS',
    liquids:['TOXIC','WATER','SLIME'], hazard:'TOXIC',   light:1.0,  enemies:['slime','worm','bat','spitter'],     spawn:7, desc:'剧毒与孢子弥漫的丛林。' },
  { key:'vault',  name:'沉金秘库',      sub:'废弃的金库',     bg:[54,44,58],  amb:[0.144,0.136,0.16], rock:'STEEL', soil:'BRICK', accent:'GEM',
    liquids:['ACID','OIL'],            hazard:'ACID',    light:0.9,  enemies:['turret','gunner','bomber','wisp'],  spawn:8, desc:'堆满黄金与酸液的危险金库。' },
  { key:'temple', name:'棱光神殿',  sub:'魔法的回廊',     bg:[56,46,70],  amb:[0.16,0.148,0.188], rock:'BRICK', soil:'HOLY',  accent:'GLOWSHROOM',
    liquids:['MANA','WATER'],          hazard:null,      light:1.0,  enemies:['caster','wisp','slime','gunner'],   spawn:8, desc:'闪烁的魔法殿堂。' },
  { key:'lab',    name:'终焉实验室',    sub:'深渊的尽头',     bg:[54,38,40],  amb:[0.128,0.12,0.128], rock:'STEEL', soil:'CONCRETE', accent:'GEM',
    liquids:['TOXIC','LAVA','MANA'],   hazard:'LAVA',    light:0.85, enemies:['caster','turret','bomber','worm','gunner'], spawn:9, desc:'终焉之核沉睡于此。' }
];
function biomeIndex(y) {
  if (y < TOP) return 0;
  return clamp(Math.floor((y - TOP) / LAYER_TOTAL), 0, NB - 1);
}
function biomeAt(y) { return BIOMES[biomeIndex(y)]; }
function layerY0(i) { return TOP + i * LAYER_TOTAL; }
function inHoly(y) {
  if (y < TOP) return -1;
  const i = Math.floor((y - TOP) / LAYER_TOTAL);
  if (i < 0 || i >= NB - 1) return -1;
  const local = (y - TOP) % LAYER_TOTAL;
  return local >= LAYER_H ? i : -1;
}

/* ---------------------------------------------------------------------------
 * 4. 世界数据
 * ------------------------------------------------------------------------- */
let world = null;
function idx(x, y) { return y * W + x; }
function inside(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }
function getM(x, y) {
  if (x < 0 || x >= W) return M.DENSE;
  if (y < 0 || y >= H) return M.DENSE;
  return world.mat[y * W + x];
}
function setM(x, y, m) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = y * W + x;
  world.mat[i] = m;
  world.life[i] = 0;
  world.aux[i] = 0;
}
function getLife(x, y) { return inside(x, y) ? world.life[y * W + x] : 0; }
function setLife(x, y, v) { if (inside(x, y)) world.life[y * W + x] = v > 255 ? 255 : v; }

/* ---------------------------------------------------------------------------
 * 5. 世界生成
 * ------------------------------------------------------------------------- */
function carveRect(x0, y0, x1, y1, m) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setM(x, y, m);
}
function carveDisc(cx, cy, r, m) {
  const r2 = r * r;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= r2) setM(x, y, m);
  }
}
function isSolidM(m) { return MAT_CAT[m] === CAT_SOLID; }

function generateWorld() {
  rng = makeRng(seed);
  const mat = new Uint8Array(W * H);
  const life = new Uint8Array(W * H);
  const aux = new Uint8Array(W * H);
  const moved = new Uint8Array(W * H);
  world = { mat, life, aux, moved, seed, holy: [], items: [], zones: new Set(), bossRoom: null };

  /* 5.1 基础填充 */
  mat.fill(M.ROCK);
  for (let y = 0; y < H; y++) {
    const bi = biomeIndex(y);
    const B = BIOMES[bi];
    const base = M[B.rock], soil = M[B.soil];
    for (let x = 0; x < W; x++) {
      const n = fbm(x * 0.09, y * 0.09, seed, 3);
      let m = n < 0.42 ? soil : base;
      /* 矿脉 */
      const g = fbm(x * 0.13 + 40, y * 0.13 + 90, seed + 7, 2);
      if (g > 0.78 && isSolidM(m)) m = M.GOLD;
      mat[y * W + x] = m;
    }
  }

  /* 5.2 挖洞穴 */
  for (let y = TOP - 4; y < H - 8; y++) {
    const bi = biomeIndex(y);
    const B = BIOMES[bi];
    const holy = inHoly(y) >= 0;
    if (holy) continue;
    /* 密度随生物群系变化 */
    const thr = [0.52, 0.50, 0.50, 0.47, 0.50, 0.46, 0.47, 0.46][bi];
    for (let x = 0; x < W; x++) {
      const c = fbm(x * 0.052, y * 0.058, seed + 11, 4);
      const room = fbm(x * 0.016, y * 0.020, seed + 23, 3);
      const open = c > thr || room > 0.62;
      if (open) mat[y * W + x] = M.AIR;
    }
  }
  /* 边界（致密岩） */
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 6; x++) mat[y * W + x] = M.DENSE;
    for (let x = W - 6; x < W; x++) mat[y * W + x] = M.DENSE;
  }
  for (let x = 0; x < W; x++) {
    mat[x] = M.DENSE;
    mat[(H - 1) * W + x] = M.DENSE;
  }
  /* 层间致密岩带（圣山除外） */
  for (let i = 1; i < NB; i++) {
    const y0 = layerY0(i);
    for (let y = y0 - 5; y < y0; y++) for (let x = 0; x < W; x++) mat[y * W + x] = M.DENSE;
  }
  /* 地表岩石 */
  for (let y = 0; y < 26; y++) for (let x = 0; x < W; x++) mat[y * W + x] = M.DENSE;

  /* 5.3 保证一条蜿蜒向下的主通道 */
  let cx = W >> 1;
  for (let y = 28; y < H - 40; y++) {
    if (inHoly(y) >= 0) continue;
    cx += Math.round((rng() - 0.5) * 3.2);
    cx = clamp(cx, 40, W - 40);
    const r = 3 + (rng() < 0.25 ? 2 : 0);
    for (let dx = -r; dx <= r; dx++) for (let dy = -2; dy <= 2; dy++) {
      if (dx * dx + dy * dy <= r * r) mat[(y + dy) * W + (cx + dx)] = M.AIR;
    }
    /* 偶尔开出横向支道 */
    if (rng() < 0.06) {
      const dir = rng() < 0.5 ? -1 : 1;
      let tx = cx;
      const len = ri(14, 40), ty = y + ri(-3, 3);
      for (let k = 0; k < len; k++) {
        tx += dir;
        if (tx < 8 || tx > W - 9) break;
        const rr = ri(1, 3);
        for (let dx = -rr; dx <= rr; dx++) for (let dy = -rr; dy <= rr; dy++)
          if (dx * dx + dy * dy <= rr * rr) mat[(ty + dy) * W + (tx + dx)] = M.AIR;
      }
    }
  }

  /* 5.4 圣山房间 */
  for (let i = 0; i < NB - 1; i++) {
    const y0 = layerY0(i) + LAYER_H;      // 圣山起始
    const y1 = y0 + HOLY_H - 1;
    const x0 = (W >> 1) - 96, x1 = (W >> 1) + 96;
    carveRect(x0, y0, x1, y1, M.AIR);
    /* 圣石墙体 */
    carveRect(x0, y0, x1, y0 + 1, M.HOLY);
    carveRect(x0, y1 - 1, x1, y1, M.HOLY);
    carveRect(x0, y0, x0 + 1, y1, M.HOLY);
    carveRect(x1 - 1, y0, x1, y1, M.HOLY);
    /* 天花板开口与地板开口（加宽，保证可通行） */
    carveRect((W >> 1) - 14, y0 - 3, (W >> 1) + 14, y0 + 2, M.AIR);
    carveRect((W >> 1) - 14, y1 - 2, (W >> 1) + 14, y1 + 3, M.AIR);
    /* 内部装饰柱 */
    for (const px of [x0 + 18, x1 - 18]) {
      carveRect(px, y1 - 9, px + 2, y1 - 2, M.HOLY);
    }
    const holy = { i, y0, y1, x0, x1, claimed: false, healTaken: false,
                   altar: { x: (W >> 1) + 52, y: y1 - 8 }, edit: { x: (W >> 1) - 52, y: y1 - 8 } };
    world.holy.push(holy);
    /* 全回复血瓶 */
    world.items.push({ type: 'heal', x: (W >> 1), y: y1 - 8, vx: 0, vy: 0, r: 6, holy: i });
    /* 祝福祭坛与编辑台基座（装饰） */
    world.items.push({ type: 'pedestal', x: (W >> 1) + 52, y: y1 - 7, vx: 0, vy: 0, r: 4, static: true });
    world.items.push({ type: 'pedestal', x: (W >> 1) - 52, y: y1 - 7, vx: 0, vy: 0, r: 4, static: true });
    /* 圣山内的火把光源 */
    for (const tx of [x0 + 24, x1 - 24, (W >> 1) - 70, (W >> 1) + 70]) {
      world.items.push({ type: 'torch', x: tx, y: y0 + 8, vx: 0, vy: 0, r: 5, static: true, holy: i });
    }
  }

  /* 5.5 底部首领房 */
  {
    const y0 = H - 150, y1 = H - 24;
    carveRect(30, y0, W - 31, y1, M.AIR);
    carveRect(30, y0, W - 31, y0 + 2, M.BRICK);
    for (let y = y0; y <= y1; y++) { carveRect(30, y, 33, y, M.BRICK); carveRect(W - 34, y, W - 31, y, M.BRICK); }
    /* 地面铺一层 */
    for (let x = 34; x < W - 34; x++) mat[(y1 + 1) * W + x] = M.BRICK;
    world.bossRoom = { y0, y1, cx: W >> 1, cy: y1 - 30 };
    /* 首领房两侧岩浆池 */
    for (let x = 40; x < 70; x++) for (let y = y1 - 2; y <= y1; y++) mat[y * W + x] = M.LAVA;
    for (let x = W - 70; x < W - 40; x++) for (let y = y1 - 2; y <= y1; y++) mat[y * W + x] = M.LAVA;
  }

  /* 5.6 出生点空腔 */
  carveRect((W >> 1) - 22, 28, (W >> 1) + 22, 46, M.AIR);
  for (let y = 46; y < 58; y++) carveDisc(W >> 1, y, 8, M.AIR);

  /* 5.7 液体池与危险液体 */
  for (let i = 0; i < NB; i++) {
    const B = BIOMES[i];
    const y0 = layerY0(i) + 8, y1 = layerY0(i) + LAYER_H - 6;
    const pools = 10 + i;
    for (let k = 0; k < pools; k++) {
      const x = ri(10, W - 11), y = ri(y0, y1);
      const liq = M[pick(B.liquids)];
      const r = ri(2, 6);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const gx = x + dx, gy = y + dy;
        if (inside(gx, gy) && mat[gy * W + gx] === M.AIR) mat[gy * W + gx] = liq;
      }
    }
    /* 岩浆/酸液/毒泥等高危液体单独成池 */
    if (B.hazard) {
      const hazardLiq = B.liquids.filter(l => l !== 'WATER');
      const hl = hazardLiq.length ? pick(hazardLiq) : B.liquids[0];
      for (let k = 0; k < 5 + i; k++) {
        const x = ri(12, W - 13), y = ri(y0 + 20, y1);
        carveDisc(x, y, ri(3, 6), M[hl]);
      }
    }
  }

  /* 5.8 道具与法杖 */
  const wandNames = ['残破的铜杖','矿工短杖','苔藓木杖','寒霜长杖','锈铁权杖','裂隙之杖','棱镜法杖','深空之杖','终焉之杖','虚无之杖'];
  let wandCount = 0;
  for (let i = 0; i < NB; i++) {
    const y0 = layerY0(i) + 10, y1 = layerY0(i) + LAYER_H - 8;
    const n = 3 + i;
    for (let k = 0; k < n; k++) {
      const spot = findAirSpot(ri(14, W - 15), ri(y0, y1), 60);
      if (!spot) continue;
      const tier = clamp(1 + Math.floor(i * 0.8) + (rng() < 0.3 ? 1 : 0), 1, 6);
      const w = makeWand(tier, wandNames[Math.min(wandCount, wandNames.length - 1)]);
      wandCount++;
      world.items.push({ type: 'wand', x: spot.x, y: spot.y, vx: 0, vy: 0, r: 6, wand: w, tier });
      world.items.push({ type: 'pedestal', x: spot.x, y: spot.y + 4, vx: 0, vy: 0, r: 4, static: true });
    }
    /* 宝箱与血瓶 */
    for (let k = 0; k < 2 + i; k++) {
      const spot = findAirSpot(ri(12, W - 13), ri(y0, y1), 60);
      if (!spot) continue;
      if (rng() < 0.5) world.items.push({ type: 'chest', x: spot.x, y: spot.y, vx: 0, vy: 0, r: 6, opened: false, tier: i + 1 });
      else world.items.push({ type: 'heart', x: spot.x, y: spot.y, vx: 0, vy: 0, r: 6, max: true });
    }
    /* 散落的金币 */
    for (let k = 0; k < 8; k++) {
      const spot = findAirSpot(ri(10, W - 11), ri(y0, y1), 40);
      if (spot) world.items.push({ type: 'gold', x: spot.x, y: spot.y, vx: 0, vy: 0, r: 5, val: ri(3, 14) });
    }
  }

  /* 5.9 危险提示：少量发光菇 */
  for (let i = 0; i < NB; i++) {
    const y0 = layerY0(i) + 10, y1 = layerY0(i) + LAYER_H - 10;
    for (let k = 0; k < 12; k++) {
      const x = ri(8, W - 9), y = ri(y0, y1);
      if (mat[y * W + x] === M.AIR && isSolidM(mat[(y + 1) * W + x])) {
        mat[y * W + x] = M.GLOWSHROOM;
      }
    }
  }
  return world;
}

/* 从 (x,y) 出发向上寻找空气点 */
function findAirSpot(x, y, maxUp) {
  for (let k = 0; k < maxUp; k++) {
    const yy = y - k;
    if (yy < 2) break;
    if (getM(x, yy) === M.AIR && getM(x, yy - 1) === M.AIR && getM(x, yy + 1) !== M.AIR) return { x, y: yy };
  }
  return null;
}
/* =============================================================================
   part 2 / 6 : 像素模拟 · 炼金反应 · 黑暗与光照
   ============================================================================= */

/* 相机（在 part 5 中真正使用，但模拟需要它的 y） */
let camX = 0, camY = 0;

/* ---------------------------------------------------------------------------
 * 2.1 网格更新辅助
 * ------------------------------------------------------------------------- */
function clearMoved() { world.moved.fill(0); }
function swapCells(i, j) {
  const mat = world.mat, life = world.life, aux = world.aux, mv = world.moved;
  const m = mat[i]; mat[i] = mat[j]; mat[j] = m;
  const l = life[i]; life[i] = life[j]; life[j] = l;
  const a = aux[i]; aux[i] = aux[j]; aux[j] = a;
  mv[i] = 1; mv[j] = 1;
}
function moveCell(i, j) {
  const mat = world.mat, life = world.life, aux = world.aux, mv = world.moved;
  mat[j] = mat[i]; life[j] = life[i]; aux[j] = aux[i];
  mat[i] = M.AIR; life[i] = 0; aux[i] = 0;
  mv[j] = 1;
}
function setFire(x, y, lifeV) {
  if (!inside(x, y)) return;
  const i = y * W + x;
  world.mat[i] = M.FIRE;
  world.life[i] = lifeV == null ? (50 + (rng() * 50) | 0) : lifeV;
  world.aux[i] = 0;
}
function setCell(x, y, m, lv) {
  if (!inside(x, y)) return;
  const i = y * W + x;
  world.mat[i] = m;
  world.life[i] = lv == null ? 0 : (lv > 255 ? 255 : lv);
  world.aux[i] = 0;
}
function isAirLike(m) { return m === M.AIR || MAT_CAT[m] === CAT_GAS || MAT_CAT[m] === CAT_FIRE; }

/* 局部爆炸：破坏可破坏固体，点燃可燃物 */
function simExplode(cx, cy, r, power) {
  power = power == null ? 1 : power;
  const r2 = r * r;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inside(x, y)) continue;
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const m = world.mat[y * W + x];
      const d = Math.sqrt(d2);
      if (m === M.HOLY || m === M.DENSE) continue;
      if (isSolidM(m) || MAT_CAT[m] === CAT_POWDER) {
        /* 硬度决定能否被炸开 */
        if (MAT_HARD[m] <= 12 * power || rng() < 0.25) {
          if (d < r * 0.55) setCell(x, y, M.AIR);
          else if (rng() < 0.35) setFire(x, y, 30 + (rng() * 40 | 0));
          else setCell(x, y, M.AIR);
        }
      } else if (MAT_CAT[m] === CAT_LIQ) {
        if (m === M.LAVA) { /* 保留 */ }
        else if (rng() < 0.6) setCell(x, y, rng() < 0.3 ? M.FIRE : M.AIR, 30);
      } else if (MAT_FLAM[m] > 0.3) {
        setFire(x, y);
      }
    }
  }
}

/* 可参与炼金反应的材料 */
const REACTIVE = new Uint8Array(NMAT);
for (const k of ['LAVA', 'ACID', 'WATER', 'TOXIC', 'CEMENT', 'POW_GUN', 'ICE', 'SNOW', 'POW_SNOW', 'ALCOHOL', 'SLIME']) REACTIVE[M[k]] = 1;

/* ---------------------------------------------------------------------------
 * 2.2 主模拟步（单次自下而上遍历，配合 moved 标记避免重复移动）
 * ------------------------------------------------------------------------- */
function simStep() {
  const mat = world.mat, life = world.life, aux = world.aux, mv = world.moved;
  const y0 = clamp(camY - 18, 1, H - 2);
  const y1 = clamp(camY + VH + 18, 1, H - 2);
  clearMoved();
  const dirFlip = (frame & 1) === 0;

  for (let y = y1; y >= y0; y--) {
    const rowOff = y * W;
    for (let k = 0; k < W; k++) {
      const x = dirFlip ? k : (W - 1 - k);
      const i = rowOff + x;
      if (mv[i]) continue;
      const m = mat[i];
      const cat = MAT_CAT[m];

      /* 火焰与气体 */
      if (cat === CAT_FIRE) { updateFire(x, y, i, m); continue; }
      if (cat === CAT_GAS) { updateGas(x, y, i, m); continue; }

      /* 炼金反应（可能改变自身材料） */
      if (REACTIVE[m]) {
        reactCell(x, y, i, m);
        if (mat[i] !== m) continue;
      }

      if (cat !== CAT_POWDER && cat !== CAT_LIQ) continue;
      const below = mat[i + W];
      const bcat = MAT_CAT[below];
      const bdens = MAT_DENS[below];

      /* --- 粉末 --- */
      if (cat === CAT_POWDER) {
        if (bcat === CAT_AIR) { moveCell(i, i + W); continue; }
        if ((bcat === CAT_LIQ || bcat === CAT_GAS) && bdens < MAT_DENS[m]) { swapCells(i, i + W); continue; }
        const d = rng() < 0.5 ? -1 : 1;
        for (let s = 0; s < 2; s++) {
          const dd = s === 0 ? d : -d;
          const nx = x + dd;
          if (nx < 0 || nx >= W) continue;
          const j = i + W + dd;
          const t = mat[j];
          const tc = MAT_CAT[t];
          if (tc === CAT_AIR || ((tc === CAT_LIQ || tc === CAT_GAS) && MAT_DENS[t] < MAT_DENS[m])) { moveCell(i, j); break; }
        }
        continue;
      }

      /* --- 液体 --- */
      const dens = MAT_DENS[m];
      if (bcat === CAT_AIR) { moveCell(i, i + W); continue; }
      if ((bcat === CAT_LIQ || bcat === CAT_GAS || bcat === CAT_FIRE) && bdens < dens) { swapCells(i, i + W); continue; }
      const d = rng() < 0.5 ? -1 : 1;
      let diag = false;
      for (let s = 0; s < 2; s++) {
        const dd = s === 0 ? d : -d;
        const nx = x + dd;
        if (nx < 0 || nx >= W) continue;
        const j = i + W + dd;
        const t = mat[j];
        const tc = MAT_CAT[t];
        if (tc === CAT_AIR) { moveCell(i, j); diag = true; break; }
        if ((tc === CAT_LIQ || tc === CAT_GAS) && MAT_DENS[t] < dens) { swapCells(i, j); diag = true; break; }
      }
      if (diag) continue;
      /* 横向摊平 */
      if (rng() < 0.5) {
        for (let s = 0; s < 2; s++) {
          const dd = s === 0 ? d : -d;
          const nx = x + dd;
          if (nx < 0 || nx >= W) continue;
          const j = i + dd;
          const t = mat[j];
          const tc = MAT_CAT[t];
          if (tc === CAT_AIR || ((tc === CAT_LIQ || tc === CAT_GAS) && MAT_DENS[t] < dens)) {
            const bj = j + W;
            if (MAT_CAT[mat[bj]] === CAT_AIR && rng() < 0.5) continue;
            if (tc === CAT_AIR) moveCell(i, j); else swapCells(i, j);
            break;
          }
        }
      }
    }
  }
}

/* ---------------------------------------------------------------------------
 * 2.3 火焰
 * ------------------------------------------------------------------------- */
function updateFire(x, y, i, m) {
  const mat = world.mat, life = world.life, aux = world.aux;
  let lv = life[i];
  if (lv > 0) lv--; else lv = 0;

  /* 与液体/冷物体接触 → 熄灭 */
  const neigh = [i - 1, i + 1, i - W, i + W];
  for (let n = 0; n < 4; n++) {
    const j = neigh[n];
    if (j < 0 || j >= W * H) continue;
    const t = mat[j];
    if (t === M.WATER) { setCell(x, y, M.STEAM, 110 + (rng() * 80 | 0)); return; }
    if (t === M.ICE || t === M.SNOW || t === M.POW_SNOW || t === M.CRYSTAL) {
      if (rng() < 0.4) setCell(j % W, (j / W) | 0, M.WATER, 0);
    }
    if (t === M.POW_GUN || t === M.FLAM_GAS) {
      /* 引燃火药 / 可燃气体 → 小爆炸 */
      const jx = j % W, jy = (j / W) | 0;
      simExplode(jx, jy, 4, 1);
      continue;
    }
    /* 蔓延到可燃邻居 */
    if (MAT_FLAM[t] > 0 && t !== M.FIRE) {
      if (rng() < MAT_FLAM[t] * 0.10) setFire(j % W, (j / W) | 0);
    }
  }

  if (lv <= 0) {
    /* 熄灭：多半变成烟，少量直接消失 */
    if (rng() < 0.55) setCell(x, y, M.SMOKE, 60 + (rng() * 70 | 0));
    else setCell(x, y, M.AIR);
    return;
  }
  life[i] = lv;

  /* 火焰轻微上升与抖动 */
  const up = mat[i - W];
  if (MAT_CAT[up] === CAT_AIR && rng() < 0.25) {
    moveCell(i, i - W);
  } else if (MAT_CAT[up] === CAT_GAS && rng() < 0.15) {
    swapCells(i, i - W);
  }
  aux[i] = 1;
}

/* ---------------------------------------------------------------------------
 * 2.4 气体
 * ------------------------------------------------------------------------- */
function updateGas(x, y, i, m) {
  const mat = world.mat, life = world.life;
  let lv = life[i];
  if (lv > 0) lv--;

  /* 蒸汽遇冷凝结 */
  if (m === M.STEAM) {
    const below = mat[i + W];
    if ((below === M.ICE || below === M.SNOW || below === M.POW_SNOW) && rng() < 0.02) { setCell(x, y, M.WATER); return; }
    if (lv <= 0 && rng() < 0.12) { setCell(x, y, M.WATER); return; }
  } else if (lv <= 0) {
    setCell(x, y, M.AIR); return;
  }
  life[i] = lv;

  /* 可燃气体遇火爆炸 */
  if (m === M.FLAM_GAS) {
    const neigh = [i - 1, i + 1, i - W, i + W];
    for (let n = 0; n < 4; n++) {
      const t = mat[neigh[n]];
      if (t === M.FIRE || t === M.LAVA || t === M.EMBER) { simExplode(x, y, 5, 1); return; }
    }
  }

  /* 上升：上方为空气或更重的流体时上浮 */
  const up = mat[i - W];
  const ucat = MAT_CAT[up];
  if (ucat === CAT_AIR) { moveCell(i, i - W); return; }
  if ((ucat === CAT_LIQ || ucat === CAT_GAS) && MAT_DENS[up] > MAT_DENS[m] && rng() < 0.8) { swapCells(i, i - W); return; }
  /* 斜向上升 */
  const d = rng() < 0.5 ? -1 : 1;
  for (let s = 0; s < 2; s++) {
    const dd = s === 0 ? d : -d;
    const nx = x + dd;
    if (nx < 0 || nx >= W || y - 1 < 0) continue;
    const j = i - W + dd;
    const t = mat[j];
    const tc = MAT_CAT[t];
    if (tc === CAT_AIR) { moveCell(i, j); return; }
    if (tc === CAT_LIQ && rng() < 0.5) { swapCells(i, j); return; }
  }
  /* 横向扩散 */
  if (rng() < 0.3) {
    for (let s = 0; s < 2; s++) {
      const dd = s === 0 ? d : -d;
      const nx = x + dd;
      if (nx < 0 || nx >= W) continue;
      const j = i + dd;
      if (MAT_CAT[mat[j]] === CAT_AIR) { moveCell(i, j); return; }
    }
  }
}

/* ---------------------------------------------------------------------------
 * 2.5 炼金反应
 * ------------------------------------------------------------------------- */
function reactCell(x, y, i, m) {
  const mat = world.mat;

  /* ---- 岩浆 ---- */
  if (m === M.LAVA) {
    const neigh = [[-1,0],[1,0],[0,-1],[0,1]];
    for (let n = 0; n < 4; n++) {
      const nx = x + neigh[n][0], ny = y + neigh[n][1];
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const j = ny * W + nx;
      const t = mat[j];
      if (t === M.WATER) { setCell(x, y, M.ROCK); setCell(nx, ny, M.STEAM, 120 + (rng() * 80 | 0)); return; }
      if (t === M.ICE || t === M.SNOW || t === M.POW_SNOW) { if (rng() < 0.5) setCell(nx, ny, M.WATER); continue; }
      if (t === M.BLOOD) { if (rng() < 0.2) { setCell(x, y, M.ROCK); setCell(nx, ny, M.STEAM, 100); return; } continue; }
      if (MAT_FLAM[t] > 0 && t !== M.FIRE && rng() < MAT_FLAM[t] * 0.4) { setFire(nx, ny); continue; }
      if (t === M.POW_GUN || t === M.FLAM_GAS) { simExplode(nx, ny, 4, 1); continue; }
    }
    /* 岩浆上方偶尔冒烟/火星 */
    if (MAT_CAT[mat[i - W]] === CAT_AIR && rng() < 0.012) setCell(x, y - 1, M.SMOKE, 50 + (rng() * 40 | 0));
    return;
  }

  /* ---- 酸液 ---- */
  if (m === M.ACID) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    const n = dirs[(rng() * 4) | 0];
    const nx = x + n[0], ny = y + n[1];
    if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
      const j = ny * W + nx;
      const t = mat[j];
      if (MAT_CORR[t] && (isSolidM(t) || MAT_CAT[t] === CAT_POWDER)) {
        const chance = 0.55 * (1 - MAT_HARD[t] / 18);
        if (chance > 0 && rng() < chance) {
          setCell(nx, ny, M.AIR);
          if (rng() < 0.10) setCell(x, y, M.ACID_GAS || M.TOXIC_GAS, 120);
          else if (rng() < 0.06) setCell(x, y, M.TOXIC_GAS, 100);
          return;
        }
      }
      if (t === M.WATER && rng() < 0.02) { setCell(x, y, M.WATER); return; }
    }
    if (MAT_CAT[mat[i - W]] === CAT_AIR && rng() < 0.01) setCell(x, y - 1, M.TOXIC_GAS, 90 + (rng() * 60 | 0));
    return;
  }

  /* ---- 水 ---- */
  if (m === M.WATER) {
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    const n = dirs[(rng() * 4) | 0];
    const nx = x + n[0], ny = y + n[1];
    if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
      const j = ny * W + nx;
      const t = mat[j];
      if (t === M.FIRE) { setCell(nx, ny, M.STEAM, 90 + (rng() * 60 | 0)); if (rng() < 0.3) setCell(x, y, M.STEAM, 70); return; }
      if (t === M.LAVA) { setCell(nx, ny, M.ROCK); setCell(x, y, M.STEAM, 120 + (rng() * 80 | 0)); return; }
      if (t === M.CEMENT) { setCell(nx, ny, M.CONCRETE); if (rng() < 0.4) setCell(x, y, M.AIR); return; }
      if (t === M.TOXIC && rng() < 0.03) { setCell(nx, ny, M.SLIME); setCell(x, y, M.SMOKE, 40); return; }
    }
    return;
  }

  /* ---- 毒泥 ---- */
  if (m === M.TOXIC) {
    if (rng() < 0.15) {
      const n = [[-1,0],[1,0],[0,-1],[0,1]][(rng() * 4) | 0];
      const nx = x + n[0], ny = y + n[1];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
        const j = ny * W + nx;
        if (mat[j] === M.WATER && rng() < 0.25) { setCell(x, y, M.WATER); return; }
        if (mat[j] === M.BLOOD && rng() < 0.25) { setCell(x, y, M.SLIME); setCell(nx, ny, M.SMOKE, 40); return; }
        if (mat[j] === M.SLIME) { setCell(x, y, M.SLIME); return; }
      }
    }
    if (MAT_CAT[mat[i - W]] === CAT_AIR && rng() < 0.006) setCell(x, y - 1, M.TOXIC_GAS, 140 + (rng() * 80 | 0));
    return;
  }

  /* ---- 水泥 ---- */
  if (m === M.CEMENT) {
    if (rng() < 0.02) {
      const n = [[-1,0],[1,0],[0,-1],[0,1]][(rng() * 4) | 0];
      const nx = x + n[0], ny = y + n[1];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && mat[ny * W + nx] === M.WATER) { setCell(x, y, M.CONCRETE); return; }
    }
    return;
  }

  /* ---- 火药 ---- */
  if (m === M.POW_GUN) {
    const neigh = [i - 1, i + 1, i - W, i + W];
    for (let n = 0; n < 4; n++) {
      const t = mat[neigh[n]];
      if (t === M.FIRE || t === M.LAVA || t === M.EMBER) { simExplode(x, y, 4, 1); return; }
    }
    return;
  }

  /* ---- 冰 / 雪 遇火（由火焰侧处理，这里补充靠近岩浆的融化） ---- */
  if (m === M.ICE || m === M.SNOW || m === M.POW_SNOW) {
    if (rng() < 0.05) {
      const n = [[-1,0],[1,0],[0,-1],[0,1]][(rng() * 4) | 0];
      const nx = x + n[0], ny = y + n[1];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && mat[ny * W + nx] === M.LAVA) setCell(x, y, M.WATER);
    }
    return;
  }

  /* ---- 酒精遇火 ---- */
  if (m === M.ALCOHOL) {
    const neigh = [i - 1, i + 1, i - W, i + W];
    for (let n = 0; n < 4; n++) {
      const t = mat[neigh[n]];
      if (t === M.FIRE || t === M.LAVA) { setFire(x, y); return; }
    }
    return;
  }

  /* ---- 黏液 ---- */
  if (m === M.SLIME) {
    if (rng() < 0.01) {
      const n = [[-1,0],[1,0],[0,-1],[0,1]][(rng() * 4) | 0];
      const nx = x + n[0], ny = y + n[1];
      if (nx >= 0 && nx < W && ny >= 0 && ny < H && mat[ny * W + nx] === M.FIRE) { setCell(x, y, M.SMOKE, 40); return; }
    }
  }
}

/* ---------------------------------------------------------------------------
 * 2.6 光照系统
 * ------------------------------------------------------------------------- */
const LW = VW >> 1, LH = VH >> 1;          // 光照缓冲分辨率 160x90
let lightR, lightG, lightB;                 // 传播光
let lightQueue;                             // 传播队列
let lightCanvas, lightCtx, lightImg, light32;
let ambient = [0.1, 0.1, 0.11];
let lightBlurTmp;

function initLight() {
  lightR = new Float32Array(LW * LH);
  lightG = new Float32Array(LW * LH);
  lightB = new Float32Array(LW * LH);
  lightBlurTmp = new Float32Array(LW * LH * 3);
  lightQueue = new Int32Array(LW * LH * 3);
  lightCanvas = document.createElement('canvas');
  lightCanvas.width = LW; lightCanvas.height = LH;
  lightCtx = lightCanvas.getContext('2d');
  lightImg = lightCtx.createImageData(LW, LH);
  light32 = new Uint32Array(lightImg.data.buffer);
}

/* 收集动态光源（玩家、法术、道具） */
const dynLights = [];
function addDynLight(x, y, r, g, b, rad) { dynLights.push({ x, y, r, g, b, rad }); }

function updateLight() {
  const B = biomeAt(player.y);
  ambient[0] = B.amb[0]; ambient[1] = B.amb[1]; ambient[2] = B.amb[2];
  /* 圣山更明亮 */
  if (inHoly(player.y) >= 0) { ambient[0] += 0.10; ambient[1] += 0.09; ambient[2] += 0.06; }

  const pr = lightR, pg = lightG, pb = lightB;
  pr.fill(0); pg.fill(0); pb.fill(0);
  const q = lightQueue;
  let head = 0, tail = 0;
  const qmax = q.length;

  /* --- 动态光源 --- */
  for (let k = 0; k < dynLights.length; k++) {
    const L = dynLights[k];
    const lx = Math.round((L.x - camX) * 0.5), ly = Math.round((L.y - camY) * 0.5);
    if (lx < 0 || lx >= LW || ly < 0 || ly >= LH) continue;
    const ii = ly * LW + lx;
    const r = L.r * L.rad, g = L.g * L.rad, b = L.b * L.rad;
    if (r + g + b > pr[ii] + pg[ii] + pb[ii]) {
      pr[ii] = r; pg[ii] = g; pb[ii] = b;
      if (tail < qmax) q[tail++] = ii;
    }
  }

  /* --- 材料自发光（每 2px 采样） --- */
  const y0 = clamp(camY, 0, H - 1), y1 = clamp(camY + VH, 0, H - 1);
  for (let ly = 0; ly < LH; ly++) {
    const wy = clamp((y0 + ly * 2) | 0, 0, H - 1);
    const ro = wy * W;
    for (let lx = 0; lx < LW; lx++) {
      const wx = clamp((camX + lx * 2) | 0, 0, W - 1);
      const m = world.mat[ro + wx];
      const ml = MAT_LIGHT[m];
      if (ml <= 0) continue;
      const ii = ly * LW + lx;
      const r = MAT_LIGHT_RGB[m * 3] * ml, g = MAT_LIGHT_RGB[m * 3 + 1] * ml, b = MAT_LIGHT_RGB[m * 3 + 2] * ml;
      if (r + g + b > pr[ii] + pg[ii] + pb[ii]) {
        pr[ii] = r; pg[ii] = g; pb[ii] = b;
        if (tail < qmax) q[tail++] = ii;
      }
    }
  }

  /* --- 传播（Dijkstra 式，遇实体阻挡产生阴影） --- */
  while (head < tail) {
    const i = q[head++];
    const x = i % LW, y = (i / LW) | 0;
    const cr = pr[i], cg = pg[i], cb = pb[i];
    const lum = cr + cg + cb;
    if (lum < 0.05) continue;
    /* 四个邻居 */
    for (let n = 0; n < 4; n++) {
      const nx = x + (n === 0 ? -1 : n === 1 ? 1 : 0);
      const ny = y + (n === 2 ? -1 : n === 3 ? 1 : 0);
      if (nx < 0 || nx >= LW || ny < 0 || ny >= LH) continue;
      const j = ny * LW + nx;
      const wx = clamp((camX + nx * 2) | 0, 0, W - 1);
      const wy = clamp((camY + ny * 2) | 0, 0, H - 1);
      const t = MAT_TRANS[world.mat[wy * W + wx]];
      if (t <= 0.02) continue;
      const nr = cr * t, ng = cg * t, nb = cb * t;
      if (nr + ng + nb > pr[j] + pg[j] + pb[j] + 0.04) {
        pr[j] = nr; pg[j] = ng; pb[j] = nb;
        if (tail < qmax) q[tail++] = j;
      }
    }
  }

  /* --- 写入光照图（gamma 0.7 提亮中间调） --- */
  const ambR = ambient[0], ambG = ambient[1], ambB = ambient[2];
  const d = light32;
  for (let i = 0; i < LW * LH; i++) {
    const r = ambR + pr[i], g = ambG + pg[i], b = ambB + pb[i];
    d[i] = pack(LIGHT_LUT[r > 1 ? 255 : (r * 255) | 0], LIGHT_LUT[g > 1 ? 255 : (g * 255) | 0], LIGHT_LUT[b > 1 ? 255 : (b * 255) | 0]);
  }
  lightCtx.putImageData(lightImg, 0, 0);
}
const LIGHT_LUT = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[i] = Math.round(255 * Math.pow(i / 255, 0.80));
  return t;
})();
/* =============================================================================
   part 3 / 6 : 法术 · 魔杖 · 施法求值引擎
   ============================================================================= */

/* ---------------------------------------------------------------------------
 * 3.1 法术定义
 * ------------------------------------------------------------------------- */
const SPELLS = {};
function defSpell(o) { SPELLS[o.id] = o; return o; }

/* ---- 弹体（projectile） ---- */
defSpell({ id:'spark', name:'火花弹', type:'proj', mana:5, uses:Infinity,
  dmg:8, dmgType:'proj', speed:4.2, life:90, radius:3, size:2, gravity:0,
  colors:['#ffe780','#ffd24a'], light:0.55, lightCol:[255,225,140], trail:null,
  castDelayAdd:0, rechargeAdd:0, spreadAdd:0, desc:'廉价而快速的入门弹体。' });

defSpell({ id:'bolt', name:'魔法箭', type:'proj', mana:8, uses:Infinity,
  dmg:20, dmgType:'proj', speed:4.6, life:110, radius:3, size:3, gravity:0,
  colors:['#82d5ff','#3d9fe0'], light:0.4, lightCol:[130,200,255],
  castDelayAdd:1, desc:'均衡可靠的魔法箭矢。' });

defSpell({ id:'firebolt', name:'炎爆弹', type:'proj', mana:16, uses:Infinity,
  dmg:22, dmgType:'fire', speed:3.0, life:120, radius:4, size:3, gravity:0.02,
  explode:13, bouncy:0.5, trail:'fire', colors:['#ff9345','#ff5a1e'],
  light:0.9, lightCol:[255,140,60], castDelayAdd:3, desc:'弹跳的爆炸火球，留下火焰轨迹。' });

defSpell({ id:'missile', name:'魔导弹', type:'proj', mana:20, uses:Infinity,
  dmg:30, dmgType:'explosion', speed:2.9, life:140, radius:4, size:3, gravity:0.01,
  explode:20, trail:'smoke', colors:['#d8b0ff','#9a5fd0'], light:0.6, lightCol:[200,140,255],
  castDelayAdd:4, rechargeAdd:4, desc:'缓慢但破坏力惊人的爆炸弹体。' });

defSpell({ id:'bouncer', name:'弹跳弹', type:'proj', mana:9, uses:Infinity,
  dmg:12, dmgType:'proj', speed:4.0, life:150, radius:3, size:3, gravity:0.01,
  bouncy:1.0, colors:['#a9f0c0','#4fbf82'], light:0.35, lightCol:[150,255,190], desc:'在墙壁间疯狂弹射。' });

defSpell({ id:'sphere', name:'能量球', type:'proj', mana:12, uses:Infinity,
  dmg:16, dmgType:'proj', speed:3.6, life:130, radius:4, size:3, gravity:0.06,
  colors:['#9ad8ff','#4f8fe0'], light:0.7, lightCol:[140,200,255], desc:'会受重力影响的能量球。' });

defSpell({ id:'spitter', name:'酸唾弹', type:'proj', mana:7, uses:Infinity,
  dmg:14, dmgType:'poison', speed:4.4, life:60, radius:3, size:2, gravity:0.02,
  trail:'poison', colors:['#9adf3f','#5f9f1f'], light:0.4, lightCol:[150,255,80], desc:'短程的剧毒弹体。' });

defSpell({ id:'bomb', name:'炸弹', type:'proj', mana:28, uses:6,
  dmg:60, dmgType:'explosion', speed:2.2, life:150, radius:5, size:4, gravity:0.10,
  explode:30, fuse:true, colors:['#f4d15f','#b08a2a'], light:0.5, lightCol:[255,200,90],
  castDelayAdd:8, rechargeAdd:10, desc:'高效挖掘，也会炸伤自己。' });

defSpell({ id:'crystal', name:'不稳定水晶', type:'proj', mana:18, uses:Infinity,
  dmg:0, dmgType:'explosion', speed:1.2, life:400, radius:5, size:4, gravity:0.12,
  explode:26, proximity:true, colors:['#c05fd0','#7a3f96'], light:0.8, lightCol:[210,120,255],
  castDelayAdd:6, desc:'敌人靠近时爆炸的水晶。' });

defSpell({ id:'drill', name:'光明钻头', type:'proj', mana:9, uses:Infinity,
  dmg:10, dmgType:'drill', speed:5.5, life:26, radius:3, size:3, gravity:0,
  dig:16, light:1.1, lightCol:[255,250,220], colors:['#e9f4ff','#9fd0ff'],
  castDelayAdd:-2, rechargeAdd:-8, desc:'极短的挖掘光束，大幅缩短冷却。' });

defSpell({ id:'chainsaw', name:'锯刃', type:'proj', mana:6, uses:Infinity,
  dmg:20, dmgType:'drill', speed:5.2, life:14, radius:4, size:4, gravity:0,
  dig:13, colors:['#d0d4dc','#8f95a0'], castDelayAdd:-4, rechargeAdd:-12, desc:'近距高速锯刃，适合挖矿。' });

defSpell({ id:'lightning', name:'闪电弹', type:'proj', mana:26, uses:8,
  dmg:42, dmgType:'electric', speed:8.0, life:70, radius:3, size:3, gravity:0,
  pierce:true, electric:1, light:1.4, lightCol:[190,230,255], colors:['#b9e7ff','#6fb8ff'],
  castDelayAdd:10, rechargeAdd:12, desc:'高速穿透的闪电，遇水更危险。' });

defSpell({ id:'iceball', name:'冰球', type:'proj', mana:12, uses:Infinity,
  dmg:12, dmgType:'ice', speed:3.8, life:110, radius:4, size:3, gravity:0.02,
  freeze:1, trail:'ice', colors:['#a9d8e8','#6fa8c0'], light:0.5, lightCol:[150,220,255], desc:'冻结命中的目标。' });

defSpell({ id:'slimeball', name:'黏液球', type:'proj', mana:8, uses:Infinity,
  dmg:10, dmgType:'poison', speed:3.2, life:120, radius:4, size:3, gravity:0.04,
  trail:'slime', poison:1, colors:['#6fbf4f','#3f8f2f'], light:0.3, lightCol:[120,220,90], desc:'留下一路黏液。' });

defSpell({ id:'boomerang', name:'回旋刃', type:'proj', mana:14, uses:Infinity,
  dmg:15, dmgType:'proj', speed:4.4, life:120, radius:3, size:3, gravity:0,
  homing:true, boomerang:true, colors:['#ffd9a0','#c08840'], light:0.4, lightCol:[255,200,140], desc:'会追踪敌人并回旋的刀刃。' });

defSpell({ id:'sawblade', name:'锯轮', type:'proj', mana:16, uses:Infinity,
  dmg:24, dmgType:'drill', speed:4.0, life:130, radius:5, size:4, gravity:0.02,
  bouncy:0.8, pierce:true, dig:12, colors:['#e0e4ea','#9aa0aa'], light:0.4, lightCol:[220,230,240], desc:'穿透并弹跳的锯轮。' });

defSpell({ id:'healbolt', name:'生命弹', type:'proj', mana:10, uses:Infinity,
  dmg:0, dmgType:'heal', speed:3.6, life:120, radius:3, size:3, gravity:0,
  heal:9, colors:['#ff9ac0','#ff5f90'], light:0.8, lightCol:[255,140,190], desc:'命中时治愈自己。' });

/* ---- 修饰（modifier） ---- */
function mod(o) { o.type = 'mod'; o.uses = Infinity; o.add = o.add || {}; defSpell(o); }
mod({ id:'m_homing', name:'追踪', mana:6, add:{ homing:true }, desc:'弹体追踪最近的敌人。' });
mod({ id:'m_damage', name:'伤害强化', mana:7, add:{ dmgAdd:10 }, desc:'增加弹体伤害。' });
mod({ id:'m_heavy', name:'重型弹头', mana:10, add:{ dmgMult:2.2, speedMult:0.65 }, castDelayAdd:2, desc:'伤害翻倍但速度大减。' });
mod({ id:'m_light', name:'轻型弹头', mana:4, add:{ speedMult:1.5, dmgMult:0.8 }, desc:'弹体更快但伤害略降。' });
mod({ id:'m_firetrail', name:'火焰轨迹', mana:4, add:{ trail:'fire' }, desc:'弹体留下火焰。' });
mod({ id:'m_acidtrail', name:'酸液轨迹', mana:5, add:{ trail:'acid' }, desc:'弹体留下腐蚀性酸液。' });
mod({ id:'m_poisontrail', name:'毒液轨迹', mana:4, add:{ trail:'poison' }, desc:'弹体留下毒液。' });
mod({ id:'m_bounce', name:'弹射', mana:4, add:{ bounce:0.85 }, desc:'弹体撞击后反弹。' });
mod({ id:'m_pierce', name:'穿透', mana:12, add:{ pierce:true }, desc:'弹体穿过敌人。' });
mod({ id:'m_explosive', name:'爆炸修饰', mana:9, add:{ explodeAdd:11 }, castDelayAdd:2, desc:'弹体命中时爆炸。' });
mod({ id:'m_crit', name:'暴击强化', mana:5, add:{ crit:30 }, desc:'提高暴击几率。' });
mod({ id:'m_speed', name:'加速', mana:4, add:{ speedMult:1.35 }, desc:'弹体飞得更快。' });
mod({ id:'m_converge', name:'收敛', mana:2, add:{ spreadAdd:-6 }, desc:'减小散射。' });
mod({ id:'m_freeze', name:'冻结', mana:6, add:{ freeze:1 }, desc:'命中时冻结目标。' });
mod({ id:'m_electric', name:'电击', mana:7, add:{ electric:1 }, desc:'命中时附加电击。' });
mod({ id:'m_lumos', name:'照明', mana:3, add:{ light:1.6 }, desc:'让弹体照亮洞穴。' });
mod({ id:'m_dig', name:'挖掘', mana:6, add:{ dig:12 }, desc:'弹体可破坏地形。' });
mod({ id:'m_life', name:'长存', mana:3, add:{ lifeMult:1.6 }, desc:'延长弹体寿命。' });
mod({ id:'m_mana', name:'补魔', mana:-30, desc:'施法时反而补充魔力。' });
mod({ id:'m_knock', name:'冲击', mana:5, add:{ knock:2.2 }, desc:'大幅击退敌人。' });

/* ---- 多重施法（multicast） ---- */
function multi(o) { o.type = 'multi'; o.uses = Infinity; defSpell(o); }
multi({ id:'mc_double', name:'双重施法', mana:6, count:2, desc:'一次施放 2 个弹体。' });
multi({ id:'mc_triple', name:'三重散射', mana:10, count:3, spreadAdd:8, desc:'一次施放 3 个弹体并增加散射。' });
multi({ id:'mc_quad', name:'四重施法', mana:16, count:4, desc:'一次施放 4 个弹体。' });
multi({ id:'mc_many', name:'多重爆发', mana:26, count:6, spreadAdd:14, castDelayAdd:4, rechargeAdd:6, desc:'一次施放 6 个弹体。' });

/* ---- 触发 / 定时（trigger / timer） ---- */
function trig(o) { o.uses = Infinity; defSpell(o); }
trig({ id:'t_spark', name:'火花·触发', type:'trig', mana:9, payload:1,
  dmg:6, dmgType:'proj', speed:4.2, life:100, radius:3, size:2, gravity:0,
  colors:['#ffe780','#ffd24a'], light:0.5, lightCol:[255,225,140],
  castDelayAdd:2, desc:'命中后释放槽位中的下一个法术。' });
trig({ id:'t_bolt', name:'魔法箭·触发', type:'trig', mana:14, payload:1,
  dmg:14, dmgType:'proj', speed:4.6, life:110, radius:3, size:3, gravity:0,
  colors:['#82d5ff','#3d9fe0'], light:0.4, lightCol:[130,200,255],
  castDelayAdd:3, desc:'命中后释放后续法术。' });
trig({ id:'t_spark_timer', name:'火花·定时', type:'timer', mana:11, payload:1, timerFrames:30,
  dmg:6, dmgType:'proj', speed:4.0, life:120, radius:3, size:2, gravity:0,
  colors:['#ffd0ff','#c060d0'], light:0.5, lightCol:[240,160,255],
  castDelayAdd:2, desc:'约 0.5 秒后释放后续法术。' });
trig({ id:'t_bolt_timer', name:'魔法箭·定时', type:'timer', mana:16, payload:1, timerFrames:45,
  dmg:14, dmgType:'proj', speed:4.2, life:140, radius:3, size:3, gravity:0,
  colors:['#a0ffe0','#3fbfa0'], light:0.4, lightCol:[150,255,220],
  castDelayAdd:3, desc:'约 0.75 秒后释放后续法术。' });

/* 法术分类查询 */
function spellById(id) { return SPELLS[id]; }
function spellName(id) { const s = SPELLS[id]; return s ? s.name : '空'; }
function spellMana(id) { const s = SPELLS[id]; return s ? s.mana : 0; }
function spellClass(id) {
  const s = SPELLS[id];
  if (!s) return 'empty';
  if (s.type === 'mod') return 'mod';
  if (s.type === 'multi') return 'multi';
  if (s.type === 'trig' || s.type === 'timer') return 'trig';
  return '';
}

/* ---------------------------------------------------------------------------
 * 3.2 魔杖生成
 * ------------------------------------------------------------------------- */
let wandUid = 1;
const WAND_TIER_POOL = [
  /* tier 1 */
  ['spark','spark','spark','bouncer','spitter','m_converge','m_light','t_spark','mc_double'],
  /* tier 2 */
  ['spark','bolt','bouncer','spitter','firebolt','m_damage','m_speed','m_bounce','t_spark','mc_double'],
  /* tier 3 */
  ['bolt','firebolt','sphere','spitter','missile','m_homing','m_firetrail','m_crit','t_bolt','mc_triple'],
  /* tier 4 */
  ['bolt','firebolt','missile','iceball','boomerang','m_explosive','m_pierce','m_freeze','t_bolt','t_bolt_timer','mc_triple'],
  /* tier 5 */
  ['missile','lightning','sawblade','boomerang','iceball','m_heavy','m_pierce','m_explosive','m_lumos','t_bolt_timer','mc_quad'],
  /* tier 6 */
  ['lightning','sawblade','bomb','missile','drill','m_heavy','m_pierce','m_electric','m_dig','m_mana','t_bolt_timer','mc_many']
];

function makeWand(tier, name) {
  tier = clamp(tier | 0, 1, 6);
  const capacity = clamp(ri(2, 3 + tier), 1, 8);
  const spellsPerCast = rng() < 0.18 ? 2 : 1;
  const castDelay = clamp(ri(3, 14) + Math.max(0, tier - 2) * 2, 2, 34);
  const recharge = clamp(ri(16, 34) + tier * 4, 10, 110);
  const manaMax = 70 + tier * 45 + ri(0, 70);
  const manaCharge = 18 + tier * 9 + ri(0, 24);
  const spread = ri(-3, 3 + tier);
  const speedMult = (0.85 + rng() * 0.4);
  const shuffle = rng() < 0.34;
  const alwaysCast = rng() < 0.10 ? pick(['m_homing','m_damage','m_firetrail','m_lumos','m_bounce','spark','bolt']) : null;
  const pool = WAND_TIER_POOL[tier - 1];
  const spells = [];
  for (let i = 0; i < capacity; i++) {
    if (i < 1 || rng() < 0.55) spells.push({ id: pick(pool), uses: undefined });
    else spells.push(null);
  }
  /* 保证至少一个弹体 */
  if (!spells.some(s => s && SPELLS[s.id] && SPELLS[s.id].type !== 'mod' && SPELLS[s.id].type !== 'multi')) {
    spells[0] = { id: pick(pool.filter(id => { const d = SPELLS[id]; return d && (d.type === 'proj' || d.type === 'trig' || d.type === 'timer'); })) };
  }
  return newWand(name || ('魔杖 T' + tier), tier, {
    capacity, spellsPerCast, castDelay, recharge, manaMax, manaCharge, spread, speedMult, shuffle, alwaysCast, spells
  });
}
function newWand(name, tier, o) {
  const w = {
    uid: wandUid++, name, tier: tier || 1,
    capacity: o.capacity, spellsPerCast: o.spellsPerCast || 1,
    castDelay: o.castDelay, recharge: o.recharge,
    manaMax: o.manaMax, mana: o.manaMax, manaCharge: o.manaCharge,
    spread: o.spread || 0, speedMult: o.speedMult || 1,
    shuffle: !!o.shuffle, alwaysCast: o.alwaysCast || null,
    spells: o.spells || [], deckIndex: 0, castTimer: 0, rechargeTimer: 0
  };
  normalizeWand(w);
  return w;
}
function normalizeWand(w) {
  while (w.spells.length < w.capacity) w.spells.push(null);
  if (w.spells.length > w.capacity) w.spells.length = w.capacity;
  for (const s of w.spells) {
    if (s && s.uses === undefined) {
      const d = SPELLS[s.id];
      s.uses = d && isFinite(d.uses) ? d.uses : -1;    // -1 表示无限
    }
  }
  if (w.deckIndex >= w.spells.length) w.deckIndex = 0;
}

/* 初始魔杖：战斗杖 + 挖掘杖 + 炸弹杖 + 空位 */
function startingWands() {
  const combat = newWand('见习火花杖', 1, {
    capacity: 3, spellsPerCast: 1, castDelay: 6, recharge: 18, manaMax: 140, mana: 140,
    manaCharge: 58, spread: 1, speedMult: 1.0, shuffle: false, alwaysCast: null,
    spells: [{ id: 'spark' }, { id: 'spark' }, null]
  });
  const util = newWand('矿工短杖', 1, {
    capacity: 3, spellsPerCast: 1, castDelay: 9, recharge: 18, manaMax: 150, mana: 150,
    manaCharge: 62, spread: 0, speedMult: 1.0, shuffle: false, alwaysCast: null,
    spells: [{ id: 'drill' }, { id: 'drill' }, { id: 'm_life' }]
  });
  const bomb = newWand('爆破杖', 1, {
    capacity: 1, spellsPerCast: 1, castDelay: 14, recharge: 40, manaMax: 90, mana: 90,
    manaCharge: 18, spread: 0, speedMult: 1.0, shuffle: true, alwaysCast: null,
    spells: [{ id: 'bomb' }]
  });
  return [combat, util, bomb, null];
}

/* ---------------------------------------------------------------------------
 * 3.3 施法求值
 * ------------------------------------------------------------------------- */
function applyMod(shot, d) {
  const a = d.add;
  if (!a) return;
  if (a.dmgAdd) shot.dmg += a.dmgAdd;
  if (a.dmgMult) shot.dmg *= a.dmgMult;
  if (a.speedMult) shot.speed *= a.speedMult;
  if (a.spreadAdd) shot.spread += a.spreadAdd;
  if (a.homing) shot.homing = true;
  if (a.bounce) shot.bouncy = Math.max(shot.bouncy, a.bounce);
  if (a.pierce) shot.pierce = true;
  if (a.explodeAdd) shot.explode = Math.max(shot.explode, a.explodeAdd);
  if (a.crit) shot.crit += a.crit;
  if (a.light) shot.light = Math.max(shot.light, a.light);
  if (a.trail) shot.trail = a.trail;
  if (a.lifeMult) shot.life = Math.round(shot.life * a.lifeMult);
  if (a.freeze) shot.freeze += a.freeze;
  if (a.poison) shot.poison += a.poison;
  if (a.electric) shot.electric += a.electric;
  if (a.dig) shot.dig = Math.max(shot.dig, a.dig);
  if (a.knock) shot.knock += a.knock;
}

function makeShot(def, mods, w) {
  const shot = {
    id: def.id, name: def.name, dmg: def.dmg || 0, dmgType: def.dmgType || 'proj',
    speed: def.speed || 3, life: def.life || 120, radius: def.radius || 3,
    gravity: def.gravity || 0, explode: def.explode || 0, size: def.size || 2,
    colors: def.colors || ['#fff'], light: def.light || 0,
    lightCol: def.lightCol || [255, 230, 170], trail: def.trail || null,
    bouncy: def.bouncy || 0, pierce: !!def.pierce, homing: !!def.homing,
    boomerang: !!def.boomerang, dig: def.dig || 0, freeze: def.freeze || 0,
    poison: def.poison || 0, electric: def.electric || 0, heal: def.heal || 0,
    crit: def.crit || 0, spread: def.spreadAdd || 0, fuse: !!def.fuse,
    proximity: !!def.proximity, knock: def.knock || 0,
    payload: null, trigger: null, timerFrames: 0,
    speedMult: w.speedMult || 1
  };
  if (mods) for (let i = 0; i < mods.length; i++) applyMod(shot, mods[i]);
  shot.spread += (w.spread || 0);
  return shot;
}

/* 从魔杖卡组中抽取载荷（触发/定时内部法术） */
function drawPayload(w, startIdx, n) {
  const deck = w.spells;
  const pending = [];
  const shots = [];
  const consumed = [];
  let idx = startIdx, mana = 0, guard = 0;
  while (shots.length < n && guard++ < 40) {
    if (idx >= deck.length) break;
    const slot = deck[idx++];
    if (!slot) continue;
    const def = SPELLS[slot.id];
    if (!def) continue;
    if (slot.uses === 0) continue;
    if (def.type === 'mod') { pending.push(def); mana += def.mana; continue; }
    if (def.type === 'multi') { n += def.count - 1; mana += def.mana; continue; }
    if (def.type === 'util') { mana += def.mana; continue; }
    const p = makeShot(def, pending, w);
    mana += def.mana;
    if (slot.uses > 0) consumed.push(slot);
    if (def.type === 'trig' || def.type === 'timer') {
      const pay = drawPayload(w, idx, def.payload || 1);
      idx = pay.idx; mana += pay.mana;
      for (const c of pay.consumed) consumed.push(c);
      p.payload = pay.shots; p.trigger = def.type; p.timerFrames = def.timerFrames || 30;
    }
    shots.push(p);
  }
  return { shots, idx, mana, consumed };
}

/* 尝试施放当前魔杖 */
function castWand(w) {
  if (!w || w.castTimer > 0 || w.rechargeTimer > 0) return false;
  if (w.spells.every(s => !s || !SPELLS[s.id] || s.uses === 0)) return false;

  const pending = [];
  const projs = [];
  const consumed = [];
  let idx = w.deckIndex;
  let need = w.spellsPerCast || 1;
  let manaCost = 0, castDelay = w.castDelay, recharge = w.recharge;
  let guard = 0, wrapped = false;
  const MAX = 80;

  /* 固有施法（Always Cast） */
  if (w.alwaysCast && SPELLS[w.alwaysCast]) {
    const ad = SPELLS[w.alwaysCast];
    if (ad.type === 'mod') pending.push(ad);
    else if (ad.type === 'proj') {
      const p = makeShot(ad, pending, w);
      projs.push(p);
    }
  }

  while (projs.length < need && guard++ < MAX) {
    if (idx >= w.spells.length) {
      if (wrapped || w.spells.length === 0) break;
      wrapped = true; idx = 0;
      continue;
    }
    const slot = w.spells[idx++];
    if (!slot) continue;
    const def = SPELLS[slot.id];
    if (!def) continue;
    if (slot.uses === 0) continue;
    if (def.type === 'mod') {
      pending.push(def); manaCost += def.mana;
      castDelay += def.castDelayAdd || 0; recharge += def.rechargeAdd || 0;
      continue;
    }
    if (def.type === 'multi') {
      need += def.count - 1; manaCost += def.mana;
      if (def.spreadAdd) pending.push({ add: { spreadAdd: def.spreadAdd } });
      castDelay += def.castDelayAdd || 0; recharge += def.rechargeAdd || 0;
      continue;
    }
    if (def.type === 'util') { manaCost += def.mana; continue; }
    /* 弹体 / 触发 / 定时 */
    const p = makeShot(def, pending, w);
    manaCost += def.mana;
    castDelay += def.castDelayAdd || 0; recharge += def.rechargeAdd || 0;
    if (slot.uses > 0) consumed.push(slot);
    if (def.type === 'trig' || def.type === 'timer') {
      const pay = drawPayload(w, idx, def.payload || 1);
      idx = pay.idx; manaCost += pay.mana;
      for (const c of pay.consumed) consumed.push(c);
      p.payload = pay.shots; p.trigger = def.type; p.timerFrames = def.timerFrames || 30;
    }
    projs.push(p);
  }

  if (!projs.length) {
    /* 卡组耗尽却没有可施放的弹体：重置并进入充能，避免死锁 */
    if (wrapped || idx >= w.spells.length) {
      w.deckIndex = 0;
      w.rechargeTimer = Math.max(1, Math.round(recharge));
      if (w.shuffle) shuffleDeck(w);
    }
    return false;
  }

  /* 法力检查 */
  if (manaCost > 0 && w.mana < manaCost) {
    if (w === activeWand()) toast('法力不足');
    return false;
  }
  w.mana = clamp(w.mana - manaCost, 0, w.manaMax);
  for (const c of consumed) if (c.uses > 0) c.uses--;
  castCount++;

  /* 生成弹体 */
  const p = player;
  const ang = Math.atan2(aimY - p.y, aimX - p.x);
  const tipX = p.x + Math.cos(ang) * 6;
  const tipY = p.y - 1 + Math.sin(ang) * 6;
  for (let i = 0; i < projs.length; i++) {
    const shot = projs[i];
    const spreadRad = (shot.spread || 0) * Math.PI / 180;
    let a = ang + (rng() - 0.5) * 2 * spreadRad;
    const spd = shot.speed * shot.speedMult * (player.perk.fasterProj ? 1.3 : 1);
    spawnProjectile(tipX, tipY, Math.cos(a) * spd, Math.sin(a) * spd, shot, 'player', w);
  }
  /* 后坐力 */
  if (projs.length && projs[0].knock) {
    p.vx -= Math.cos(ang) * 0.35;
    p.vy -= Math.sin(ang) * 0.15;
  }

  /* 计时 */
  w.castTimer = Math.max(1, Math.round(castDelay));
  if (wrapped) {
    w.rechargeTimer = Math.max(1, Math.round(recharge));
    w.deckIndex = 0;
    if (w.shuffle) shuffleDeck(w);
  } else {
    w.deckIndex = idx >= w.spells.length ? 0 : idx;
    if (idx >= w.spells.length) w.deckIndex = 0;
  }
  return true;
}

function shuffleDeck(w) {
  for (let i = w.spells.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = w.spells[i]; w.spells[i] = w.spells[j]; w.spells[j] = t;
  }
}

function tickWands() {
  for (const w of wands) {
    if (!w) continue;
    if (w.castTimer > 0) w.castTimer--;
    if (w.rechargeTimer > 0) w.rechargeTimer--;
    w.mana = Math.min(w.manaMax, w.mana + w.manaCharge / 60);
  }
}
/* =============================================================================
   part 4 / 6 : 玩家 · 敌人 · 投射物 · 粒子 · 战斗 · 状态 · 死亡
   ============================================================================= */

let player = null;
let enemies = [];
let projectiles = [];
let particles = [];
let drops = [];
let wands = [];
let currentWand = 0;
let frame = 0;
let gameState = 'title';
let aimX = 160, aimY = 90;
let kills = 0, gold = 0, runDepth = 0, runTime = 0;
let shake = 0, hitFlash = 0;
let enemyIdSeq = 1;
let castCount = 0, spawnCount = 0;

const GRAV = 0.20, TERM = 3.6, RUN_ACC = 0.28, RUN_MAX = 1.75;

/* ---------------------------------------------------------------------------
 * 4.1 几何与碰撞
 * ------------------------------------------------------------------------- */
function rectSolid(x, y, w, h) {
  const l = Math.floor(x - (w - 1) / 2), t = Math.floor(y - (h - 1) / 2);
  const r = l + w - 1, b = t + h - 1;
  for (let yy = t; yy <= b; yy++) {
    if (yy < 0 || yy >= H) return true;
    const ro = yy * W;
    for (let xx = l; xx <= r; xx++) {
      if (xx < 0 || xx >= W) return true;
      if (IS_SOLID(world.mat[ro + xx])) return true;
    }
  }
  return false;
}
function cellAt(x, y) { return inside(x | 0, y | 0) ? world.mat[(y | 0) * W + (x | 0)] : M.DENSE; }

function moveBody(o, dx, dy, w, h) {
  if (dx) {
    const nx = o.x + dx;
    if (!rectSolid(nx, o.y, w, h)) o.x = nx; else o.vx = 0;
  }
  if (dy) {
    const ny = o.y + dy;
    if (!rectSolid(o.x, ny, w, h)) o.y = ny; else { o.vy = 0; o.onGround = true; }
  }
}
function groundCheck(o, w, h) { return rectSolid(o.x, o.y + h / 2 + 1, w, Math.max(1, h * 0.3)); }

/* ---------------------------------------------------------------------------
 * 4.2 玩家
 * ------------------------------------------------------------------------- */
function makePlayer() {
  return {
    x: W >> 1, y: 40, vx: 0, vy: 0, w: 6, h: 13,
    hp: 100, maxHp: 100, lev: 100, maxLev: 100,
    dir: 1, onGround: false, inWater: false, inLava: false, headWater: false,
    inv: 0, breath: 100, stuck: 0,
    wet: 0, oil: 0, blood: 0, slime: 0, toxic: 0,
    burning: 0, poisoned: 0, frozen: 0, invisible: 0, berserk: 0, teleportitis: 0, regen: 0,
    perk: {}, kills: 0, dead: false, cause: '', lastHitBy: '',
    lastBiome: -1, spellBag: [], manaBoost: 0,
    wandIndex: 0, pickCool: 0, shield: 0, maxShield: 0, teleTimer: 0
  };
}
function activeWand() { return wands[currentWand] || null; }

const DOT_CAUSES = { '熔岩': 1, '酸液': 1, '灼烧': 1, '剧毒': 1, '窒息': 1, '辐射': 1 };
function hurtPlayer(dmg, cause) {
  const p = player;
  if (!p || p.dead) return;
  const dot = DOT_CAUSES[cause] === 1;
  if (p.inv > 0 && !dot) return;
  let d = dmg;
  if (p.perk.resist) d *= 0.62;
  if (p.perk.glass) d *= 1.0;
  /* 护盾先吸收 */
  if (p.shield > 0) {
    const abs = Math.min(p.shield, d);
    p.shield -= abs; d -= abs;
  }
  if (d <= 0) return;
  p.hp -= d;
  if (!dot) p.inv = Math.max(p.inv, 24);
  p.lastHitBy = cause;
  hitFlash = Math.min(1, hitFlash + (dot ? 0.06 : 0.5));
  if (!dot) shake = Math.max(shake, 2);
  if (p.hp <= 0) die(cause);
}
function healPlayer(n) {
  const p = player; if (!p) return;
  p.hp = Math.min(p.maxHp, p.hp + n);
}
function die(cause) {
  const p = player;
  if (p.dead) return;
  p.dead = true;
  p.hp = 0;
  gameState = 'dead';
  showDeath(cause || p.lastHitBy || '未知');
  sfx('die');
  addParticles(p.x, p.y, 26, 'blood');
  shake = 6;
}

/* 状态伤害与液体接触 */
function updateStatus() {
  const p = player;
  const c = cellAt(p.x, p.y);
  const cTop = cellAt(p.x, p.y - p.h / 2 + 1);
  p.inWater = c === M.WATER;
  p.inLava = c === M.LAVA;
  p.headWater = cTop === M.WATER;

  /* 液体沾染 */
  const stainRate = 9;
  if (c === M.WATER || cTop === M.WATER) { p.wet = Math.min(100, p.wet + stainRate); p.oil = Math.max(0, p.oil - 6); p.toxic = Math.max(0, p.toxic - 4); }
  if (c === M.OIL) { p.oil = Math.min(100, p.oil + stainRate); p.wet = Math.max(0, p.wet - 2); }
  if (c === M.BLOOD) { p.blood = Math.min(100, p.blood + stainRate); }
  if (c === M.SLIME) { p.slime = Math.min(100, p.slime + stainRate); }
  if (c === M.TOXIC || c === M.TOXIC_GAS) { p.toxic = Math.min(100, p.toxic + stainRate * 0.7); }
  if (c === M.ACID) { p.toxic = Math.min(100, p.toxic + stainRate); hurtPlayer(0.9, '酸液'); }
  if (c === M.MANA) { p.manaBoost = 240; }
  if (c === M.HEALTHIUM) { healPlayer(0.06); }
  if (c === M.ALCOHOL) { p.oil = Math.min(100, p.oil + stainRate * 0.6); }
  /* 自然衰减 */
  if (!(c === M.WATER || cTop === M.WATER)) p.wet = Math.max(0, p.wet - 0.10);
  if (c !== M.OIL) p.oil = Math.max(0, p.oil - 0.06);
  if (c !== M.BLOOD) p.blood = Math.max(0, p.blood - 0.05);
  if (c !== M.SLIME) p.slime = Math.max(0, p.slime - 0.05);
  if (!(c === M.TOXIC || c === M.TOXIC_GAS || c === M.ACID)) p.toxic = Math.max(0, p.toxic - 0.08);

  /* 火焰 / 岩浆 */
  const fireHere = c === M.FIRE || cTop === M.FIRE;
  if (fireHere || c === M.LAVA || c === M.EMBER) {
    if (p.wet > 0 && fireHere) { p.wet = Math.max(0, p.wet - 14); }
    else if (p.perk.fireImmune) { /* 免疫 */ }
    else {
      const dur = p.oil > 5 ? 160 : 90;
      p.burning = Math.max(p.burning, dur);
    }
  }
  if (c === M.LAVA && !p.perk.fireImmune) hurtPlayer(1.1, '熔岩');
  if (p.burning > 0) {
    p.burning--;
    if (p.wet > 0) { p.burning = Math.max(0, p.burning - 6); p.wet = Math.max(0, p.wet - 4); }
    if (p.perk.fireImmune) p.burning = 0;
    else hurtPlayer(p.maxHp * 0.02 / 60 + 0.02, '灼烧');
    if ((frame & 3) === 0) addParticle(p.x + (rng() - 0.5) * 5, p.y + (rng() - 0.5) * 6, 'fire');
  }
  /* 中毒 */
  if (p.poisoned > 0) {
    p.poisoned--;
    if (p.toxic > 0) p.poisoned = Math.max(p.poisoned, 60);
    if (!p.perk.toxicImmune && p.hp > p.maxHp * 0.05) hurtPlayer(p.maxHp * 0.02 / 60 + 0.01, '剧毒');
  }
  if (p.toxic > 20 && p.poisoned <= 0 && !p.perk.toxicImmune) p.poisoned = 120;
  /* 冰冻 / 减速 */
  if (p.frozen > 0) p.frozen--;
  /* 其他状态计时 */
  if (p.invisible > 0) p.invisible--;
  if (p.berserk > 0) p.berserk--;
  if (p.teleportitis > 0) { p.teleportitis--; if (p.teleportitis % 90 === 0) teleportPlayerRandom(); }
  if (p.regen > 0) { p.regen--; healPlayer(p.maxHp * 0.10 / 60); }
  if (p.manaBoost > 0) p.manaBoost--;

  /* 窒息 */
  if (p.headWater && !p.perk.breathless) {
    p.breath -= 1;
    if (p.breath < 0) { p.breath = 0; hurtPlayer(0.7, '窒息'); }
  } else {
    p.breath = Math.min(100, p.breath + 1.6);
  }

  /* 被压住 */
  if (rectSolid(p.x, p.y, p.w - 1, p.h - 1)) {
    p.stuck++;
    /* 尝试向上推 */
    for (let k = 1; k <= 3; k++) {
      if (!rectSolid(p.x, p.y - k, p.w - 1, p.h - 1)) { p.y -= k; p.stuck = 0; break; }
    }
    if (p.stuck > 20) hurtPlayer(1.2, '被压死');
  } else p.stuck = 0;

  /* 再生护盾 */
  if (p.maxShield > 0 && p.shield < p.maxShield && (frame & 3) === 0) p.shield = Math.min(p.maxShield, p.shield + 0.08);
}

function teleportPlayerRandom() {
  for (let k = 0; k < 30; k++) {
    const x = clamp(player.x + (rng() - 0.5) * 160, 8, W - 8);
    const y = clamp(player.y + (rng() - 0.5) * 120, 8, H - 8);
    if (!rectSolid(x, y, player.w, player.h)) { player.x = x; player.y = y; player.vx = player.vy = 0; addParticles(x, y, 12, 'magic'); return; }
  }
}

function updatePlayer() {
  const p = player;
  if (p.dead) return;
  p.pickCool = Math.max(0, p.pickCool - 1);
  p.manaBoost = Math.max(0, (p.manaBoost || 0) - 1);
  if (p.inv > 0) p.inv--;

  const left = keys['a'] || keys['arrowleft'];
  const right = keys['d'] || keys['arrowright'];
  const up = keys['w'] || keys['arrowup'] || keys[' '];
  const down = keys['s'] || keys['arrowdown'];

  let accel = (right ? 1 : 0) - (left ? 1 : 0);
  if (p.frozen > 0) accel = 0;
  if (accel) p.dir = accel;

  /* 浸没物理 */
  const submerged = p.inWater || p.inLava;
  const speedMul = (p.slime > 30 ? 0.75 : 1) * (p.frozen > 0 ? 0 : 1) * (p.perk.fasterMove ? 1.28 : 1) * (p.berserk > 0 ? 1.2 : 1);
  if (accel) p.vx += accel * RUN_ACC * (submerged ? 0.6 : 1);
  p.vx *= submerged ? 0.90 : (p.onGround ? 0.80 : 0.92);
  if (p.oil > 30 && p.onGround) p.vx *= 1.02;
  const vmax = RUN_MAX * speedMul * (submerged ? 0.75 : 1);
  p.vx = clamp(p.vx, -vmax, vmax);

  p.onGround = groundCheck(p, p.w, p.h);
  if (up && p.onGround && p.frozen <= 0) { p.vy = -3.35; p.onGround = false; sfx('jump'); }
  else if (up && !p.onGround && p.frozen <= 0) {
    /* 悬浮 */
    if (p.lev > 0) {
      const boost = p.perk.levitate ? 1.7 : 1;
      p.vy -= 0.155 * boost;
      if (p.vy < -1.35) p.vy = -1.35;
      p.lev = Math.max(0, p.lev - 0.95 / boost);
      if ((frame & 2) === 0) addParticle(p.x + (rng() - 0.5) * 4, p.y + 6, 'hover');
    }
  }
  if (down && !p.onGround && !submerged) p.vy += 0.05;

  /* 重力 */
  if (submerged) {
    p.vy += 0.055;
    if (up && p.frozen <= 0) p.vy -= 0.10;
    p.vy *= 0.90;
    p.vy = clamp(p.vy, -1.5, 1.2);
  } else {
    p.vy += GRAV;
    p.vy = clamp(p.vy, -TERM, TERM);
  }

  /* 悬浮燃料回复 */
  if (p.onGround) p.lev = Math.min(p.maxLev, p.lev + 1.15);
  else p.lev = Math.min(p.maxLev, p.lev + 0.18);

  const prevVy = p.vy;
  const wasGround = p.onGround;
  moveBody(p, p.vx, 0, p.w, p.h);
  moveBody(p, 0, p.vy, p.w, p.h);
  /* 落地伤害 */
  if (!wasGround && groundCheck(p, p.w, p.h) && prevVy > 3.25) {
    hurtPlayer((prevVy - 3.25) * 18, '摔落');
  }

  updateStatus();

  /* 自动施法 */
  if (pointer.down && !editMode && !perkOpen && gameState === 'play') {
    const w = activeWand();
    if (w) { if (castWand(w)) sfxCast(w); }
  }

  /* 拾取（靠近自动） */
  updatePickups();

  runDepth = Math.max(runDepth, Math.floor(p.y));
  /* 生物群系切换 */
  const bi = biomeIndex(p.y);
  if (bi !== p.lastBiome) {
    p.lastBiome = bi;
    const B = BIOMES[bi];
    banner(B.name, B.sub + ' · ' + B.desc);
    if (p.perk.healthy && runTime > 30) healPlayer(60);
    sfx('biome');
  }
  /* 进入圣山提示 */
  const hi = inHoly(p.y);
  if (hi >= 0 && !world.holy[hi].seen) {
    world.holy[hi].seen = true;
    banner('圣山 · ' + (hi + 1) + '/7', '安全之地：全回复、编辑魔杖、选择祝福');
    sfx('holy');
  }
  /* 圣山祝福：首次进入时暂停并弹出三选一 */
  if (hi >= 0 && !world.holy[hi].perkOffered) {
    world.holy[hi].perkOffered = true;
    offerPerks();
  }
}

function sfxCast(w) {
  const shot = SPELLS[w.alwaysCast] || null;
  sfx('cast');
}

/* ---------------------------------------------------------------------------
 * 4.3 投射物
 * ------------------------------------------------------------------------- */
function spawnProjectile(x, y, vx, vy, shot, owner, wand) {
  spawnCount++;
  projectiles.push({
    x, y, vx, vy, shot, owner: owner || 'player',
    life: shot.life || 120, radius: shot.radius || 3,
    hitSet: shot.pierce ? new Set() : null,
    trailT: 0, fuse: shot.fuse ? 90 : 0, fired: false,
    stuck: false, stuckT: 0, bounces: 0, dead: false,
    rot: Math.atan2(vy, vx)
  });
}
function enemyShot(x, y, vx, vy, o) {
  const shot = {
    id: o.id || 'enemy', name: o.name || '法术', dmg: o.dmg || 8, dmgType: o.dmgType || 'proj',
    speed: Math.hypot(vx, vy), life: o.life || 130, radius: o.radius || 3, gravity: o.gravity || 0,
    explode: o.explode || 0, size: o.size || 3, colors: o.colors || ['#ff7090', '#c04060'],
    light: o.light || 0.3, lightCol: o.lightCol || [255, 120, 140], trail: o.trail || null,
    bouncy: o.bouncy || 0, pierce: false, homing: !!o.homing, boomerang: false, dig: 0,
    freeze: o.freeze || 0, poison: o.poison || 0, electric: o.electric || 0, heal: 0,
    crit: 0, spread: 0, fuse: false, proximity: false, knock: 0, payload: null, trigger: null,
    timerFrames: 0, speedMult: 1
  };
  spawnProjectile(x, y, vx, vy, shot, 'enemy', null);
}

function digAt(x, y, r, power) {
  for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
    if (xx * xx + yy * yy > r * r) continue;
    const gx = x + xx, gy = y + yy;
    if (!inside(gx, gy)) continue;
    const m = world.mat[gy * W + gx];
    if (m === M.HOLY || m === M.DENSE) continue;
    if (isSolidM(m) && MAT_HARD[m] <= power) {
      setCell(gx, gy, M.AIR);
      if (rng() < 0.25) addParticle(gx, gy, 'debris');
    } else if (MAT_CAT[m] === CAT_POWDER && rng() < 0.5) {
      setCell(gx, gy, M.AIR);
    }
  }
}

function explodeAt(x, y, radius, dmg, owner, dtype) {
  simExplode(x | 0, y | 0, Math.min(34, radius), radius > 18 ? 1.4 : 1);
  const r2 = (radius + 7) * (radius + 7);
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < radius + 8) {
      const f = 1 - d / (radius + 8);
      damageEnemy(e, dmg * f * (owner === 'player' && player.perk.glass ? 1.5 : 1), dtype || 'explosion');
      if (owner === 'player' && player.perk.knock) e.vx += (e.x - x) * 0.04;
    }
  }
  const pd = Math.hypot(player.x - x, player.y - y);
  if (pd < radius + 6) {
    const f = 1 - pd / (radius + 6);
    if (!player.perk.explosionImmune) {
      hurtPlayer(dmg * f * (owner === 'player' ? 0.35 : 1), '爆炸');
    }
  }
  addParticles(x, y, Math.min(40, 10 + radius), 'boom');
  addParticles(x, y, Math.min(24, 4 + radius / 2), 'fire');
  shake = Math.max(shake, Math.min(9, radius * 0.35));
  hitFlash = Math.min(1, hitFlash + 0.4);
  sfx('boom');
}

function releasePayload(pr) {
  const p = pr.shot;
  if (!p.payload || !p.payload.length) return;
  const ang = Math.atan2(pr.vy, pr.vx);
  for (const s of p.payload) {
    const spd = (s.speed || 3) * (s.speedMult || 1) * (player.perk.fasterProj ? 1.3 : 1);
    spawnProjectile(pr.x, pr.y, Math.cos(ang) * spd, Math.sin(ang) * spd, s, pr.owner, null);
  }
  addParticles(pr.x, pr.y, 6, 'magic');
  sfx('trigger');
}

function applyHitEffects(pr, e) {
  const s = pr.shot;
  if (s.freeze) e.frozen = Math.max(e.frozen || 0, 90);
  if (s.poison) e.poisoned = Math.max(e.poisoned || 0, 150);
  if (s.electric) { e.stun = Math.max(e.stun || 0, 30); addParticles(e.x, e.y, 8, 'zap'); }
  if (s.knock) { const a = Math.atan2(pr.vy, pr.vx); e.vx += Math.cos(a) * s.knock; e.vy += Math.sin(a) * s.knock * 0.4; }
}

function updateProjectiles() {
  const P = projectiles;
  for (let i = P.length - 1; i >= 0; i--) {
    const pr = P[i];
    if (pr.dead) { P.splice(i, 1); continue; }
    const s = pr.shot;

    /* 追踪 */
    if (s.homing) {
      let best = null, bd = 200;
      if (pr.owner === 'player') {
        for (const e of enemies) { if (e.dead) continue; const d = Math.hypot(e.x - pr.x, e.y - pr.y); if (d < bd) { bd = d; best = e; } }
      } else {
        const d = Math.hypot(player.x - pr.x, player.y - pr.y);
        if (d < bd) { bd = d; best = player; }
      }
      if (best) {
        const d = Math.max(1, bd);
        const tx = (best.x - pr.x) / d, ty = (best.y - pr.y) / d;
        const sp = Math.hypot(pr.vx, pr.vy) || 1;
        let vx = pr.vx / sp + tx * 0.14, vy = pr.vy / sp + ty * 0.14;
        const n = Math.hypot(vx, vy) || 1;
        pr.vx = vx / n * sp; pr.vy = vy / n * sp;
      }
    }
    /* 回旋 */
    if (s.boomerang && pr.life < s.life * 0.55) {
      const d = Math.max(1, Math.hypot(player.x - pr.x, player.y - pr.y));
      pr.vx += (player.x - pr.x) / d * 0.22;
      pr.vy += (player.y - pr.y) / d * 0.22;
      const sp = Math.hypot(pr.vx, pr.vy) || 1, cap = s.speed * s.speedMult;
      if (sp > cap) { pr.vx = pr.vx / sp * cap; pr.vy = pr.vy / sp * cap; }
    }

    pr.vy += s.gravity;
    /* 终端速度 */
    const spd = Math.hypot(pr.vx, pr.vy);
    const cap = s.speed * s.speedMult * 2.4 + 3;
    if (spd > cap) { pr.vx = pr.vx / spd * cap; pr.vy = pr.vy / spd * cap; }

    const nx = pr.x + pr.vx, ny = pr.y + pr.vy;

    /* 轨迹 */
    pr.trailT++;
    if (s.trail && pr.trailT % 3 === 0) {
      emitTrail(pr, s.trail);
    }
    if (s.light > 0.5 && (frame & 1) === 0) addDynLight(pr.x, pr.y, s.lightCol[0] / 255, s.lightCol[1] / 255, s.lightCol[2] / 255, s.light);

    /* 地形碰撞（逐轴检测） */
    let hitSolid = false;
    if (rectSolid(nx, pr.y, 2, 2)) { hitSolid = true; }
    if (!hitSolid && rectSolid(pr.x, ny, 2, 2)) { hitSolid = true; }
    if (!hitSolid && rectSolid(nx, ny, 2, 2)) { hitSolid = true; }

    if (hitSolid) {
      /* 挖掘 */
      if (s.dig > 0) {
        digAt(nx | 0, ny | 0, s.dig >= 14 ? 5 : 2, s.dig);
        pr.life -= 3;
        addParticles(pr.x, pr.y, 3, 'debris');
        sfx('dig');
      } else if (s.bouncy > 0 && pr.bounces < 14) {
        /* 反弹：判断哪个轴被挡 */
        if (rectSolid(nx, pr.y, 2, 2)) pr.vx *= -s.bouncy;
        if (rectSolid(pr.x, ny, 2, 2)) pr.vy *= -s.bouncy;
        if (!rectSolid(nx, pr.y, 2, 2) && !rectSolid(pr.x, ny, 2, 2)) { pr.vx *= -s.bouncy; pr.vy *= -s.bouncy; }
        pr.bounces++;
        sfx('bounce');
      } else {
        impactProjectile(pr, pr.x, pr.y, 'solid');
        P.splice(i, 1);
        continue;
      }
    } else {
      pr.x = nx; pr.y = ny;
    }

    /* 接近引爆水晶 */
    if (s.proximity) {
      let boom = false;
      for (const e of enemies) {
        if (!e.dead && Math.hypot(e.x - pr.x, e.y - pr.y) < 18) { boom = true; break; }
      }
      if (boom) { impactProjectile(pr, pr.x, pr.y, 'proximity'); P.splice(i, 1); continue; }
    }

    /* 敌人碰撞 */
    if (pr.owner === 'player') {
      let removed = false;
      for (const e of enemies) {
        if (e.dead) continue;
        if (pr.hitSet && pr.hitSet.has(e.id)) continue;
        if (Math.hypot(e.x - pr.x, e.y - pr.y) < (e.size || 6) + pr.radius) {
          const crit = (s.crit + (player.perk.crit ? 20 : 0) + (player.blood > 30 ? 10 : 0)) > rng() * 100;
          let dmg = s.dmg * (crit ? 2.5 : 1) * (player.perk.glass ? 1.5 : 1) * (player.berserk > 0 ? 2 : 1);
          if (s.dmgType === 'heal') { healPlayer(s.heal || 6); dmg = 0; }
          if (dmg > 0) damageEnemy(e, dmg, s.dmgType, crit);
          applyHitEffects(pr, e);
          addParticles(pr.x, pr.y, 5, crit ? 'crit' : 'hit');
          if (s.explode > 0) { impactProjectile(pr, pr.x, pr.y, 'enemy'); removed = true; break; }
          if (pr.hitSet) { pr.hitSet.add(e.id); if (pr.shot.payload) releasePayload(pr); }
          else { impactProjectile(pr, pr.x, pr.y, 'enemy'); removed = true; break; }
        }
      }
      if (removed) { P.splice(i, 1); continue; }
    } else {
      /* 敌方弹体命中玩家 */
      if (Math.hypot(player.x - pr.x, player.y - pr.y) < 6 + pr.radius) {
        if (s.dmgType !== 'heal') hurtPlayer(s.dmg, '被法术击中');
        if (s.freeze) player.frozen = Math.max(player.frozen, 60);
        impactProjectile(pr, pr.x, pr.y, 'player');
        P.splice(i, 1);
        continue;
      }
    }

    /* 引信 */
    if (pr.fuse > 0) { pr.fuse--; if (pr.fuse <= 0) { impactProjectile(pr, pr.x, pr.y, 'fuse'); P.splice(i, 1); continue; } }

    pr.life--;
    if (pr.life <= 0) {
      if (s.trigger === 'timer' && s.payload && !pr.fired) { pr.fired = true; releasePayload(pr); }
      if (s.explode > 0) { impactProjectile(pr, pr.x, pr.y, 'expire'); P.splice(i, 1); continue; }
      P.splice(i, 1);
      continue;
    }
    if (pr.x < -20 || pr.x > W + 20 || pr.y < -20 || pr.y > H + 20) P.splice(i, 1);
  }
}

function impactProjectile(pr, x, y, how) {
  const s = pr.shot;
  pr.dead = true;
  if (s.explode > 0) {
    explodeAt(x, y, s.explode * (player.perk.glass && pr.owner === 'player' ? 1.35 : 1), s.dmg, pr.owner, s.dmgType);
  } else {
    if (s.trigger === 'hit' && s.payload && !pr.fired) { pr.fired = true; releasePayload(pr); }
    addParticles(x, y, 4, 'hit');
    sfx('hit');
  }
  /* 地面残留 */
  if (s.trail === 'fire' && rng() < 0.5) { const gx = x | 0, gy = y | 0; if (inside(gx, gy) && world.mat[gy * W + gx] === M.AIR) setFire(gx, gy); }
  if (s.poison && rng() < 0.4) { const gx = x | 0, gy = y | 0; if (inside(gx, gy) && world.mat[gy * W + gx] === M.AIR) setCell(gx, gy, M.TOXIC); }
}

function emitTrail(pr, kind) {
  const x = pr.x | 0, y = pr.y | 0;
  if (kind === 'fire') {
    for (let k = -1; k <= 1; k++) {
      const gx = (pr.x + (rng() - 0.5) * 3) | 0, gy = (pr.y + k) | 0;
      if (inside(gx, gy) && world.mat[gy * W + gx] === M.AIR) { setFire(gx, gy, 24 + (rng() * 20 | 0)); break; }
    }
    addParticle(pr.x, pr.y, 'fire');
  } else if (kind === 'acid') {
    const gx = (pr.x + (rng() - 0.5) * 2) | 0, gy = pr.y | 0;
    if (inside(gx, gy) && world.mat[gy * W + gx] === M.AIR && rng() < 0.5) setCell(gx, gy, M.ACID);
  } else if (kind === 'poison') {
    const gx = (pr.x + (rng() - 0.5) * 2) | 0, gy = pr.y | 0;
    if (inside(gx, gy) && world.mat[gy * W + gx] === M.AIR && rng() < 0.4) setCell(gx, gy, M.TOXIC);
    addParticle(pr.x, pr.y, 'poison');
  } else if (kind === 'slime') {
    const gx = pr.x | 0, gy = pr.y | 0;
    if (inside(gx, gy) && world.mat[gy * W + gx] === M.AIR && rng() < 0.35) setCell(gx, gy, M.SLIME);
  } else if (kind === 'smoke') {
    addParticle(pr.x, pr.y, 'smoke');
  } else if (kind === 'ice') {
    addParticle(pr.x, pr.y, 'ice');
  }
}

/* ---------------------------------------------------------------------------
 * 4.4 粒子
 * ------------------------------------------------------------------------- */
function addParticle(x, y, kind) {
  if (particles.length > 1400) return;
  const o = { x, y, vx: 0, vy: 0, life: 20, max: 20, kind, color: '#fff', size: 1, text: '' };
  switch (kind) {
    case 'blood': o.vx = (rng() - 0.5) * 2.2; o.vy = -rng() * 1.8; o.life = o.max = 18 + (rng() * 20 | 0); o.color = rng() < 0.5 ? '#a32633' : '#7a1822'; break;
    case 'hit': o.vx = (rng() - 0.5) * 2.5; o.vy = (rng() - 0.5) * 2.5; o.life = o.max = 8 + (rng() * 8 | 0); o.color = '#fff2c0'; break;
    case 'crit': o.vx = (rng() - 0.5) * 3; o.vy = (rng() - 0.5) * 3; o.life = o.max = 12 + (rng() * 8 | 0); o.color = '#ffd24a'; break;
    case 'boom': o.vx = (rng() - 0.5) * 5; o.vy = (rng() - 0.5) * 5; o.life = o.max = 14 + (rng() * 16 | 0); o.color = rng() < 0.5 ? '#ffc45e' : '#ff7a2a'; o.size = rng() < 0.3 ? 2 : 1; break;
    case 'fire': o.vx = (rng() - 0.5) * 1.2; o.vy = -0.4 - rng(); o.life = o.max = 14 + (rng() * 14 | 0); o.color = rng() < 0.5 ? '#ff8a1f' : '#ffd24a'; break;
    case 'smoke': o.vx = (rng() - 0.5) * 0.6; o.vy = -0.3 - rng() * 0.6; o.life = o.max = 30 + (rng() * 30 | 0); o.color = '#55555c'; break;
    case 'debris': o.vx = (rng() - 0.5) * 2; o.vy = -rng() * 2; o.life = o.max = 16 + (rng() * 16 | 0); o.color = '#6a6a72'; break;
    case 'hover': o.vx = (rng() - 0.5) * 0.6; o.vy = 0.4 + rng() * 0.6; o.life = o.max = 12 + (rng() * 10 | 0); o.color = '#bfe0ff'; break;
    case 'magic': o.vx = (rng() - 0.5) * 2; o.vy = (rng() - 0.5) * 2; o.life = o.max = 14 + (rng() * 12 | 0); o.color = '#d0a0ff'; break;
    case 'zap': o.vx = (rng() - 0.5) * 3; o.vy = (rng() - 0.5) * 3; o.life = o.max = 8 + (rng() * 6 | 0); o.color = '#bfe7ff'; break;
    case 'poison': o.vx = (rng() - 0.5) * 1.4; o.vy = -0.5 - rng() * 0.6; o.life = o.max = 16 + (rng() * 14 | 0); o.color = '#9adf3f'; break;
    case 'ice': o.vx = (rng() - 0.5) * 1.4; o.vy = (rng() - 0.5) * 1.4; o.life = o.max = 12 + (rng() * 10 | 0); o.color = '#bfe8f5'; break;
    case 'gold': o.vx = (rng() - 0.5) * 1.6; o.vy = -rng() * 2; o.life = o.max = 18 + (rng() * 16 | 0); o.color = '#ffd24a'; break;
    case 'heal': o.vx = (rng() - 0.5) * 1.2; o.vy = -0.6 - rng(); o.life = o.max = 18 + (rng() * 16 | 0); o.color = '#7ad48a'; break;
    default: o.life = o.max = 14; o.color = '#fff';
  }
  particles.push(o);
}
function addParticles(x, y, n, kind) { for (let i = 0; i < n; i++) addParticle(x + (rng() - 0.5) * 4, y + (rng() - 0.5) * 4, kind); }
function addFloatText(x, y, text, color) {
  if (particles.length > 1450) return;
  particles.push({ x, y, vx: 0, vy: -0.5, life: 40, max: 40, kind: 'text', color: color || '#fff', text, size: 1 });
}
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    if (p.kind === 'text') { p.vy *= 0.94; }
    else if (p.kind === 'boom' || p.kind === 'debris' || p.kind === 'blood' || p.kind === 'gold') { p.vy += 0.12; p.vx *= 0.97; }
    else if (p.kind === 'hit' || p.kind === 'crit' || p.kind === 'zap' || p.kind === 'magic' || p.kind === 'ice') { p.vx *= 0.9; p.vy *= 0.9; }
    p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

/* ---------------------------------------------------------------------------
 * 4.5 敌人
 * ------------------------------------------------------------------------- */
const ENEMY_DEFS = {
  miner:   { name:'矿工幽影', hp:34, size:7,  speed:0.55, dmg:9,  reach:9,  gold:[3,12],  color:'#b7c6b8', ai:'walker', faction:'hiisi' },
  gunner:  { name:'蜥人枪手', hp:44, size:7,  speed:0.35, dmg:9,  reach:8,  gold:[5,16],  color:'#c45762', ai:'gunner', faction:'hiisi', shot:{ dmg:9, speed:2.6, colors:['#ff7090','#b03050'], radius:3 } },
  bat:     { name:'洞穴蝠',   hp:20, size:5,  speed:1.0,  dmg:6,  reach:8,  gold:[2,9],   color:'#c8698d', ai:'flyer',  faction:'beast' },
  firefly: { name:'火萤',     hp:26, size:5,  speed:0.9,  dmg:7,  reach:8,  gold:[3,10],  color:'#ff9a3a', ai:'firefly',faction:'beast', light:1.0, lightCol:[255,150,60] },
  bomber:  { name:'自爆菌',   hp:24, size:6,  speed:0.8,  dmg:0,  reach:9,  gold:[3,12],  color:'#8fbf4f', ai:'bomber', faction:'fungus', explode:26 },
  worm:    { name:'掘地虫',   hp:70, size:8,  speed:0.6,  dmg:12, reach:11, gold:[6,18],  color:'#c9a06a', ai:'worm',   faction:'beast' },
  slime:   { name:'黏液怪',   hp:42, size:7,  speed:0.5,  dmg:8,  reach:9,  gold:[4,13],  color:'#6fbf4f', ai:'hopper', faction:'slime', trail:'slime' },
  turret:  { name:'炮塔',     hp:58, size:8,  speed:0,    dmg:0,  reach:8,  gold:[8,20],  color:'#8f95a0', ai:'turret', faction:'robot', shot:{ dmg:11, speed:3.2, colors:['#ffd070','#c08020'], radius:3 } },
  spitter: { name:'吐酸者',   hp:32, size:6,  speed:0.4,  dmg:0,  reach:8,  gold:[4,14],  color:'#9adf3f', ai:'spitter',faction:'slime', shot:{ dmg:8, speed:2.8, colors:['#9adf3f','#5f9f1f'], radius:3, poison:1 } },
  caster:  { name:'神殿法师', hp:48, size:7,  speed:0.4,  dmg:10, reach:8,  gold:[8,22],  color:'#c090e0', ai:'caster', faction:'mage', shot:{ dmg:12, speed:2.4, colors:['#d0a0ff','#8040c0'], radius:4, homing:true }, light:0.5, lightCol:[200,140,255] },
  wisp:    { name:'幽灵',     hp:24, size:5,  speed:1.3,  dmg:8,  reach:8,  gold:[3,11],  color:'#a0e0ff', ai:'wisp',   faction:'ghost', light:0.9, lightCol:[160,220,255] },
  boss:    { name:'终焉之核', hp:1500, size:16, speed:0.5, dmg:18, reach:16, gold:[300,500], color:'#b33fbb', ai:'boss', faction:'boss', light:1.4, lightCol:[220,120,255] }
};

function spawnEnemy(type, x, y) {
  const d = ENEMY_DEFS[type];
  if (!d) return null;
  const e = {
    id: enemyIdSeq++, type, def: d, x, y, vx: 0, vy: 0,
    hp: d.hp, maxHp: d.hp, size: d.size, dir: rng() < 0.5 ? -1 : 1,
    cool: ri(20, 90), phase: rng() * 9, onGround: false, dead: false,
    stun: 0, frozen: 0, burning: 0, poisoned: 0, hitFlash: 0, life: 0,
    faction: d.faction, spawnY: y, homeX: x, homeY: y
  };
  enemies.push(e);
  return e;
}

function damageEnemy(e, dmg, type, crit) {
  if (e.dead) return;
  if (type === 'fire' && e.def.immuneFire) return;
  if (type === 'explosion' && e.def.immuneExplosion) return;
  if (type === 'poison' && e.def.immunePoison) return;
  e.hp -= dmg;
  e.hitFlash = 6;
  if (dmg >= 1) addFloatText(e.x, e.y - e.size, Math.round(dmg) + (crit ? '!' : ''), crit ? '#ffd24a' : '#fff');
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  kills++; player.kills++;
  const g = e.def.gold;
  dropGold(e.x, e.y, ri(g[0], g[1]) * (player.perk.greed ? 2 : 1));
  addParticles(e.x, e.y, e.type === 'boss' ? 60 : 10, 'blood');
  if (player.perk.vampire) healPlayer(e.type === 'boss' ? 60 : 4);
  if (e.type === 'bomber') explodeAt(e.x, e.y, e.def.explode || 24, 30, 'enemy');
  sfx('kill');
  if (e.type === 'boss') winGame();
}

function dropGold(x, y, val) {
  drops.push({ type: 'gold', x, y, vx: (rng() - 0.5) * 1.6, vy: -1.5 - rng(), val, r: 5, life: 1200 });
}

function updateEnemies() {
  const p = player;
  /* 动态生成 */
  updateSpawns();

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    /* 只更新玩家附近的敌人 */
    const dxp = e.x - p.x, dyp = e.y - p.y;
    const dist = Math.hypot(dxp, dyp);
    if (dist > VW * 1.4) continue;

    if (e.hitFlash > 0) e.hitFlash--;
    if (e.stun > 0) e.stun--;
    if (e.frozen > 0) e.frozen--;
    if (e.burning > 0) { e.burning--; damageEnemy(e, 0.35, 'fire'); addParticle(e.x, e.y, 'fire'); }
    if (e.poisoned > 0) { e.poisoned--; damageEnemy(e, 0.25, 'poison'); }

    /* 环境伤害 */
    const c = cellAt(e.x, e.y);
    if (c === M.LAVA && !e.def.immuneFire) damageEnemy(e, 1.2, 'fire');
    else if (c === M.FIRE && !e.def.immuneFire) e.burning = Math.max(e.burning, 60);
    else if (c === M.ACID && !e.def.immuneAcid) damageEnemy(e, 0.7, 'acid');
    else if (c === M.TOXIC && !e.def.immunePoison) e.poisoned = Math.max(e.poisoned, 120);

    const AI = ENEMY_AI[e.def.ai];
    if (AI && e.stun <= 0 && e.frozen <= 0) AI(e, p, dist, dxp, dyp);

    /* 冻结时下沉 */
    if (e.frozen > 0) { e.vx *= 0.8; e.vy = Math.min(2, e.vy + 0.2); }

    /* 移动与碰撞 */
    if (e.def.ai !== 'worm' && e.def.ai !== 'flyer' && e.def.ai !== 'firefly' && e.def.ai !== 'wisp' && e.def.ai !== 'boss') {
      e.onGround = groundCheck(e, e.size, e.size);
      if (e.onGround) e.vy = Math.min(0, e.vy);
      else e.vy += GRAV;
      e.vy = clamp(e.vy, -4, TERM);
    }
    moveBody(e, e.vx, e.vy, e.size, e.size);

    /* 近战接触伤害 */
    if (e.def.dmg > 0 && dist < e.def.reach && !player.perk.meleeImmune) {
      hurtPlayer(e.def.dmg, '被' + e.def.name + '击杀');
      e.vx += (e.x - p.x) * 0.05;
    }
    /* 自爆 */
    if (e.def.ai === 'bomber' && dist < 16) {
      explodeAt(e.x, e.y, e.def.explode || 24, 34, 'enemy');
      e.dead = true; enemies.splice(i, 1);
      continue;
    }
    if (e.y > H + 40 || e.x < -40 || e.x > W + 40) { enemies.splice(i, 1); }
  }
}

/* 敌人 AI */
const ENEMY_AI = {
  walker(e, p, dist, dx, dy) {
    e.vx += Math.sign(dx) * 0.03;
    e.vx *= 0.9;
    e.vx = clamp(e.vx, -e.def.speed, e.def.speed);
    e.dir = Math.sign(dx) || e.dir;
    if (e.onGround && (Math.abs(dx) < 70) && dy < -14 && e.cool <= 0) { e.vy = -2.4; e.cool = 70; }
    e.cool--;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 12 && e.cool <= 0) { e.cool = 40; }
  },
  gunner(e, p, dist, dx, dy) {
    const want = 70;
    const dir = Math.sign(dx);
    if (dist < want - 14) e.vx -= dir * 0.05; else if (dist > want + 14) e.vx += dir * 0.05;
    e.vx *= 0.9; e.vx = clamp(e.vx, -e.def.speed * 1.4, e.def.speed * 1.4);
    e.dir = dir || e.dir;
    if (e.onGround && Math.abs(dx) > 30 && Math.abs(dy) > 18 && e.cool <= 0) { e.vy = -2.2; e.cool = 90; }
    e.cool--;
    if (e.cool <= 0 && dist < 170 && Math.abs(dy) < 90) {
      const a = Math.atan2(dy, dx);
      const s = e.def.shot;
      enemyShot(e.x, e.y - 2, Math.cos(a) * s.speed, Math.sin(a) * s.speed, s);
      e.cool = ri(50, 95);
      sfx('enemycast');
    }
  },
  flyer(e, p, dist, dx, dy) {
    e.phase += 0.09;
    e.vx += (Math.sign(dx) * 0.03) + Math.sin(e.phase * 1.7) * 0.04;
    e.vy += (Math.sign(dy) * 0.03) + Math.cos(e.phase * 1.3) * 0.04;
    const sp = Math.hypot(e.vx, e.vy) || 1, cap = e.def.speed * 1.6;
    if (sp > cap) { e.vx = e.vx / sp * cap; e.vy = e.vy / sp * cap; }
    e.dir = Math.sign(dx) || e.dir;
  },
  firefly(e, p, dist, dx, dy) {
    e.phase += 0.05;
    const want = 60;
    if (dist > want) { e.vx += Math.sign(dx) * 0.04; e.vy += Math.sign(dy) * 0.04; }
    else { e.vx += Math.sign(dx) * 0.02; e.vy -= 0.02; }
    e.vx += Math.sin(e.phase) * 0.03; e.vy += Math.cos(e.phase * 1.4) * 0.03;
    e.vx *= 0.94; e.vy *= 0.94;
    const sp = Math.hypot(e.vx, e.vy) || 1, cap = e.def.speed * 1.4;
    if (sp > cap) { e.vx = e.vx / sp * cap; e.vy = e.vy / sp * cap; }
    if (e.cool-- <= 0 && dist < 110) {
      const gx = e.x | 0, gy = (e.y + 6) | 0;
      if (inside(gx, gy) && world.mat[gy * W + gx] === M.AIR) setFire(gx, gy, 60);
      e.cool = ri(40, 80);
    }
  },
  bomber(e, p, dist, dx, dy) {
    e.vx += Math.sign(dx) * 0.06;
    e.vx = clamp(e.vx, -e.def.speed * 1.6, e.def.speed * 1.6);
    e.dir = Math.sign(dx) || e.dir;
    if (e.onGround && dy < -12 && e.cool-- <= 0) { e.vy = -2.6; e.cool = 60; }
  },
  worm(e, p, dist, dx, dy) {
    e.phase += 0.08;
    const a = Math.atan2(dy, dx) + Math.sin(e.phase) * 0.4;
    e.vx = Math.cos(a) * e.def.speed;
    e.vy = Math.sin(a) * e.def.speed;
    /* 掘穿地形 */
    if (rng() < 0.5) {
      const gx = (e.x + Math.cos(a) * 6) | 0, gy = (e.y + Math.sin(a) * 6) | 0;
      if (inside(gx, gy)) {
        const m = world.mat[gy * W + gx];
        if (isSolidM(m) && MAT_HARD[m] <= 11) { setCell(gx, gy, M.AIR); addParticle(gx, gy, 'debris'); }
      }
    }
    e.dir = Math.sign(dx) || e.dir;
  },
  hopper(e, p, dist, dx, dy) {
    e.dir = Math.sign(dx) || e.dir;
    if (e.onGround) {
      e.vx *= 0.7;
      if (e.cool-- <= 0) {
        e.vx = clamp(dx * 0.05, -1.4, 1.4);
        e.vy = -2.6;
        e.cool = ri(40, 80);
        if (e.def.trail) { const gx = e.x | 0, gy = (e.y + 6) | 0; if (inside(gx, gy) && world.mat[gy * W + gx] === M.AIR && rng() < 0.5) setCell(gx, gy, M.SLIME); }
      }
    }
  },
  turret(e, p, dist, dx, dy) {
    e.vx = 0; e.vy = 0;
    e.dir = Math.sign(dx) || e.dir;
    if (e.cool-- <= 0 && dist < 190 && Math.abs(dy) < 110) {
      const a = Math.atan2(dy, dx);
      const s = e.def.shot;
      enemyShot(e.x, e.y - 2, Math.cos(a) * s.speed, Math.sin(a) * s.speed, s);
      e.cool = ri(55, 90);
      sfx('enemycast');
    }
  },
  spitter(e, p, dist, dx, dy) {
    e.dir = Math.sign(dx) || e.dir;
    if (dist < 60) e.vx -= Math.sign(dx) * 0.04;
    else if (dist > 110) e.vx += Math.sign(dx) * 0.04;
    e.vx *= 0.9; e.vx = clamp(e.vx, -e.def.speed * 1.4, e.def.speed * 1.4);
    if (e.onGround && Math.abs(dy) > 20 && e.cool-- <= 0) { e.vy = -2.2; e.cool = 80; }
    e.cool--;
    if (e.cool <= 0 && dist < 140) {
      const a = Math.atan2(dy, dx) - 0.25;
      const s = e.def.shot;
      enemyShot(e.x, e.y - 2, Math.cos(a) * s.speed, Math.sin(a) * s.speed, s);
      e.cool = ri(70, 120);
      sfx('enemycast');
    }
  },
  caster(e, p, dist, dx, dy) {
    e.phase += 0.03;
    if (dist < 90) e.vx -= Math.sign(dx) * 0.05; else if (dist > 160) e.vx += Math.sign(dx) * 0.05;
    e.vx *= 0.9;
    e.vy += Math.sin(e.phase) * 0.02;
    e.vy *= 0.95;
    e.dir = Math.sign(dx) || e.dir;
    if (e.cool-- <= 0 && dist < 200) {
      const a = Math.atan2(dy, dx);
      const s = e.def.shot;
      for (let k = -1; k <= 1; k++) enemyShot(e.x, e.y - 2, Math.cos(a + k * 0.2) * s.speed, Math.sin(a + k * 0.2) * s.speed, s);
      e.cool = ri(90, 150);
      sfx('enemycast');
      /* 偶尔瞬移 */
      if (rng() < 0.25) {
        for (let k = 0; k < 12; k++) {
          const tx = clamp(e.x + (rng() - 0.5) * 140, 8, W - 8), ty = clamp(e.y + (rng() - 0.5) * 100, 8, H - 8);
          if (!rectSolid(tx, ty, e.size, e.size)) { addParticles(e.x, e.y, 8, 'magic'); e.x = tx; e.y = ty; addParticles(tx, ty, 8, 'magic'); break; }
        }
      }
    }
  },
  wisp(e, p, dist, dx, dy) {
    e.phase += 0.12;
    e.vx += Math.sign(dx) * 0.05 + Math.sin(e.phase) * 0.03;
    e.vy += Math.sign(dy) * 0.05 + Math.cos(e.phase) * 0.03;
    const sp = Math.hypot(e.vx, e.vy) || 1, cap = e.def.speed;
    if (sp > cap) { e.vx = e.vx / sp * cap; e.vy = e.vy / sp * cap; }
    e.dir = Math.sign(dx) || e.dir;
  },
  boss(e, p, dist, dx, dy) {
    e.phase += 0.02;
    /* 缓慢漂浮追踪 */
    const want = 90;
    if (dist > want) { e.vx += Math.sign(dx) * 0.02; e.vy += Math.sign(dy) * 0.02; }
    else { e.vx -= Math.sign(dx) * 0.01; e.vy -= Math.sign(dy) * 0.01; }
    e.vx += Math.sin(e.phase) * 0.02;
    e.vy += Math.cos(e.phase * 1.3) * 0.02;
    e.vx = clamp(e.vx, -0.9, 0.9); e.vy = clamp(e.vy, -0.7, 0.7);
    e.dir = Math.sign(dx) || e.dir;
    if (e.cool-- <= 0 && dist < 260) {
      const hpFrac = e.hp / e.maxHp;
      const pattern = rint(0, hpFrac < 0.5 ? 2 : 1);
      const a0 = Math.atan2(dy, dx);
      if (pattern === 0) {
        /* 环形弹幕 */
        const n = hpFrac < 0.5 ? 14 : 9;
        for (let k = 0; k < n; k++) {
          const a = a0 + (k - (n - 1) / 2) * 0.22;
          enemyShot(e.x, e.y, Math.cos(a) * 2.2, Math.sin(a) * 2.2, { dmg: 14, speed: 2.2, colors: ['#d978e8', '#8040a0'], radius: 4, life: 200, light: 0.5, lightCol: [220,120,255] });
        }
        e.cool = 70;
      } else if (pattern === 1) {
        /* 追踪弹 */
        for (let k = -1; k <= 1; k += 2) {
          enemyShot(e.x, e.y, Math.cos(a0 + k * 0.3) * 2.0, Math.sin(a0 + k * 0.3) * 2.0,
            { dmg: 16, speed: 2.0, colors: ['#ff8ad0', '#c03080'], radius: 5, life: 220, homing: true, light: 0.6, lightCol: [255,130,200] });
        }
        e.cool = 60;
      } else {
        /* 召唤小怪 */
        for (let k = 0; k < 3; k++) {
          const tx = clamp(e.x + (rng() - 0.5) * 80, 40, W - 40), ty = clamp(e.y + (rng() - 0.5) * 60, 20, H - 20);
          if (!rectSolid(tx, ty, 7, 7)) { spawnEnemy(rng() < 0.5 ? 'bat' : 'wisp', tx, ty); addParticles(tx, ty, 8, 'magic'); }
        }
        e.cool = 110;
      }
      sfx('enemycast');
    }
  }
};

/* 动态敌人生成：按区域触发 */
function updateSpawns() {
  const p = player;
  /* 首领：接近终焉实验室底部时唤醒 */
  if (p.y > H - 230 && !world.bossSpawned) {
    world.bossSpawned = true;
    const br = world.bossRoom || { cx: W >> 1, cy: H - 80 };
    const b = spawnEnemy('boss', br.cx, br.cy);
    if (b) {
      banner('终焉之核', '击碎它，结束这场远征');
      sfx('holy');
      shake = 6;
    }
  }
  const zoneW = 128, zoneH = 96;
  const zx = Math.floor(p.x / zoneW), zy = Math.floor(p.y / zoneH);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = (zx + dx) + ',' + (zy + dz);
      if (world.zones.has(key)) continue;
      world.zones.add(key);
      const wx = (zx + dx) * zoneW + zoneW / 2;
      const wy = (zy + dz) * zoneH + zoneH / 2;
      if (wy < TOP || wy > H - 20) continue;
      if (inHoly(wy) >= 0) continue;
      const B = biomeAt(wy);
      const distToPlayer = Math.hypot(wx - p.x, wy - p.y);
      if (distToPlayer < 70) continue;
      if (enemies.length > 34) continue;
      if (rng() < 0.45) continue;
      const n = ri(1, 2);
      for (let k = 0; k < n; k++) {
        const ex = clamp(wx + ri(-zoneW / 2, zoneW / 2), 10, W - 10);
        const ey = clamp(wy + ri(-zoneH / 2, zoneH / 2), TOP + 4, H - 12);
        const spot = findAirSpot(ex, ey, 50);
        if (spot) spawnEnemy(pick(B.enemies), spot.x, spot.y);
      }
    }
  }
}

/* ---------------------------------------------------------------------------
 * 4.6 掉落物
 * ------------------------------------------------------------------------- */
function updatePickups() {
  const p = player;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (d.static) { /* 静态道具不移动 */ }
    else {
      d.vy += 0.09;
      d.vx *= 0.99;
      const nx = d.x + d.vx, ny = d.y + d.vy;
      if (rectSolid(nx, d.y, 3, 3)) { d.vx *= -0.3; } else d.x = nx;
      if (rectSolid(d.x, ny, 3, 3)) { d.vy *= -0.2; d.vx *= 0.7; if (Math.abs(d.vy) < 0.4) d.vy = 0; } else d.y = ny;
    }
    if (d.life != null) { d.life--; if (d.life <= 0) { drops.splice(i, 1); continue; } }

    const dist = Math.hypot(d.x - p.x, d.y - p.y);
    /* 金币吸附 */
    if (d.type === 'gold' && dist < 40) {
      d.x += (p.x - d.x) * 0.18;
      d.y += (p.y - d.y) * 0.18;
    }
    if (d.type === 'gold' && dist < 9) {
      gold += d.val; sfx('gold'); addParticle(d.x, d.y, 'gold');
      drops.splice(i, 1); continue;
    }
    /* 手动拾取 */
    if ((d.type === 'wand' || d.type === 'chest' || d.type === 'heart' || d.type === 'heal') && dist < 14 && p.pickCool <= 0) {
      const autoHeal = d.type === 'heal' && !d.takenOnce && dist < 11;
      if (autoHeal || keys['f'] || pointer.pickHeld || autoPickup) {
        pickUp(d, i);
        continue;
      }
    }
  }
}
let autoPickup = false;

function pickUp(d, i) {
  const p = player;
  p.pickCool = 18;
  if (d.type === 'gold') { gold += d.val; sfx('gold'); }
  else if (d.type === 'heart') { p.maxHp += 25; healPlayer(25); toast('最大生命 +25'); sfx('perk'); addParticles(d.x, d.y, 14, 'heal'); }
  else if (d.type === 'heal') {
    if (!d.takenOnce) {
      healPlayer(p.maxHp); p.maxHp += 10;
      d.takenOnce = true;
      toast('完全回复 · 最大生命 +10'); sfx('perk'); addParticles(d.x, d.y, 20, 'heal');
    }
    return;
  }
  else if (d.type === 'chest') {
    if (!d.opened) {
      d.opened = true;
      const g = ri(20, 60) * (1 + biomeIndex(p.y)); gold += g;
      dropGold(d.x, d.y - 4, g);
      if (rng() < 0.5) { const id = randomSpellId(biomeIndex(p.y) + 1); addSpellToInventory(id); toast('宝箱：获得法术 ' + spellName(id)); }
      else toast('宝箱：+' + g + ' 金');
      sfx('perk');
      addParticles(d.x, d.y, 12, 'gold');
    }
    return;
  }
  else if (d.type === 'wand') {
    const w = d.wand;
    let slot = wands.indexOf(null);
    if (slot < 0) { slot = currentWand; const old = wands[slot]; if (old) drops.push({ type: 'wand', x: p.x + 10, y: p.y, vx: 0, vy: -1, r: 6, wand: old, tier: old.tier }); }
    wands[slot] = w; currentWand = slot;
    toast('拾取魔杖：' + w.name);
    sfx('perk');
    addParticles(d.x, d.y, 10, 'magic');
  }
  drops.splice(i, 1);
  updateHud();
}

function randomSpellId(tier) {
  tier = clamp(tier, 1, 6);
  const pool = WAND_TIER_POOL[tier - 1].filter(id => SPELLS[id] && SPELLS[id].type !== 'util');
  return pick(pool);
}
function addSpellToInventory(id) {
  /* 优先放进当前魔杖的空槽 */
  const w = activeWand();
  if (w) {
    for (let i = 0; i < w.capacity; i++) {
      if (!w.spells[i]) { w.spells[i] = { id, uses: undefined }; normalizeWand(w); return; }
    }
    /* 替换最后一个修饰/多重槽，否则扩展不了 */
  }
  /* 存入暂存（挂在玩家身上） */
  player.spellBag = player.spellBag || [];
  player.spellBag.push(id);
  if (player.spellBag.length > 12) player.spellBag.shift();
}

/* ---------------------------------------------------------------------------
 * 4.7 胜利
 * ------------------------------------------------------------------------- */
function winGame() {
  gameState = 'win';
  showWin();
  sfx('win');
  addParticles(player.x, player.y, 60, 'magic');
}
/* =============================================================================
   part 5 / 6 : 渲染（世界像素 · 实体 · 光照合成 · 准星）
   ============================================================================= */

let imgWorld = null, world32 = null;

function initRender() {
  imgWorld = ctx.createImageData(VW, VH);
  world32 = new Uint32Array(imgWorld.data.buffer);
}

/* 背景（洞穴岩壁）颜色 */
function bgColorFor(wx, wy, B) {
  const h = hash2(wx, wy, 1337);
  let r = B.bg[0], g = B.bg[1], b = B.bg[2];
  if (h < 0.42) { r = r * 0.62; g = g * 0.62; b = b * 0.62; }
  else if (h < 0.78) { r = r * 1.25; g = g * 1.25; b = b * 1.25; }
  else if (h > 0.965) { r = r * 1.9 + 6; g = g * 1.9 + 6; b = b * 1.9 + 8; }
  return pack(Math.min(255, r | 0), Math.min(255, g | 0), Math.min(255, b | 0));
}

/* 材料颜色（带贴图质感） */
function matColorFor(m, wx, wy) {
  const pal = MAT_RGB[m];
  if (!pal || pal.length === 0) return pack(0, 0, 0);
  const cat = MAT_CAT[m];
  let idx;
  if (cat === CAT_FIRE) idx = (hash2(wx, wy, 7) * 4 + (frame >> 2)) & 3;
  else if (cat === CAT_LIQ) idx = (hash2(wx + (frame >> 4), wy, 21) * pal.length) | 0;
  else if (cat === CAT_GAS) idx = (hash2(wx, wy + (frame >> 3), 31) * pal.length) | 0;
  else idx = (hash2(wx, wy, 3) * pal.length) | 0;
  return pal[idx % pal.length];
}

function renderWorld() {
  const ox = Math.round(camX), oy = Math.round(camY);
  const d = world32;
  for (let sy = 0; sy < VH; sy++) {
    const wy = oy + sy;
    const o = sy * VW;
    if (wy < 0 || wy >= H) {
      const c = pack(6, 6, 9);
      for (let sx = 0; sx < VW; sx++) d[o + sx] = c;
      continue;
    }
    const B = biomeAt(wy);
    const ro = wy * W;
    const rom = wy > 0 ? (wy - 1) * W : ro;
    for (let sx = 0; sx < VW; sx++) {
      const wx = ox + sx;
      let m;
      if (wx < 0 || wx >= W) m = M.DENSE; else m = world.mat[ro + wx];
      if (m === M.AIR) { d[o + sx] = bgColorFor(wx, wy, B); continue; }
      let c = matColorFor(m, wx, wy);
      /* 液面高光 */
      if (MAT_CAT[m] === CAT_LIQ) {
        const am = (wx < 0 || wx >= W) ? M.DENSE : world.mat[rom + wx];
        if (am === M.AIR) {
          const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
          c = pack(Math.min(255, r * 1.5 + 20) | 0, Math.min(255, g * 1.5 + 20) | 0, Math.min(255, b * 1.5 + 20) | 0);
        }
      }
      d[o + sx] = c;
    }
  }
  ctx.putImageData(imgWorld, 0, 0);
}

/* ---------------------------------------------------------------------------
 * 实体绘制
 * ------------------------------------------------------------------------- */
function px(x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }

function drawPlayerSprite(sx, sy) {
  const p = player;
  const dir = p.dir >= 0 ? 1 : -1;
  /* 斗篷 / 身体 */
  let robe = '#5564a4', robe2 = '#3d4a80', skin = '#e8c49a', hat = '#7a4f8f';
  if (p.perk.glass) robe = '#6a7ad0';
  const blink = p.inv > 0 && (frame >> 1) % 2 === 0;
  ctx.globalAlpha = blink ? 0.45 : (p.invisible > 0 ? 0.25 : 1);
  /* 腿 */
  px(sx - 3, sy + 4, 3, 3, robe2);
  px(sx + 1, sy + 4, 3, 3, robe2);
  /* 袍身 */
  px(sx - 3, sy - 3, 7, 8, robe);
  px(sx - 3, sy - 3, 7, 1, robe2);
  /* 腰带 */
  px(sx - 3, sy + 1, 7, 1, '#c9a24a');
  /* 头 */
  px(sx - 2, sy - 7, 5, 4, skin);
  /* 眼睛 */
  px(dir > 0 ? sx + 1 : sx - 2, sy - 6, 1, 1, '#20242e');
  /* 帽子 */
  px(sx - 3, sy - 8, 7, 2, hat);
  px(sx - 2, sy - 10, 5, 2, hat);
  px(sx - 1, sy - 12, 3, 2, hat);
  px(sx, sy - 14, 1, 2, '#c9a0e0');
  /* 状态染色 */
  if (p.oil > 20) { ctx.globalAlpha = Math.min(0.5, p.oil / 200); px(sx - 3, sy - 12, 7, 17, '#1e1a12'); ctx.globalAlpha = blink ? 0.45 : 1; }
  if (p.blood > 20) { ctx.globalAlpha = Math.min(0.45, p.blood / 220); px(sx - 3, sy - 12, 7, 17, '#8a1f2a'); ctx.globalAlpha = blink ? 0.45 : 1; }
  if (p.wet > 20) { ctx.globalAlpha = Math.min(0.35, p.wet / 280); px(sx - 3, sy - 12, 7, 17, '#2f6fbf'); ctx.globalAlpha = blink ? 0.45 : 1; }
  if (p.burning > 0) { px(sx - 2, sy - 15, 5, 3, (frame & 2) ? '#ff8a1f' : '#ffd24a'); }
  /* 法杖（指向准星） */
  const ang = Math.atan2(aimY - p.y, aimX - p.x);
  const wx = sx + Math.cos(ang) * 8, wy = sy - 1 + Math.sin(ang) * 8;
  px(wx - 1, wy - 1, 3, 2, '#b08a4a');
  px(wx + Math.cos(ang) * 3 - 1, wy + Math.sin(ang) * 3 - 1, 2, 2, '#7fd8ff');
  ctx.globalAlpha = 1;
}

function drawEnemySprite(e, sx, sy) {
  const d = e.def;
  let col = d.color;
  if (e.frozen > 0) col = '#a9d8e8';
  if (e.burning > 0 && (frame & 2)) col = '#ff8a1f';
  const s = e.size;
  ctx.save();
  ctx.translate(sx | 0, sy | 0);
  switch (e.type) {
    case 'bat':
      px(-s, -2, s * 2, 4, col); px(-s - 2, -1, 2, 2, col); px(s, -1, 2, 2, col);
      px(-2, -3, 1, 1, '#20242e'); px(1, -3, 1, 1, '#20242e');
      break;
    case 'firefly':
      px(-3, -3, 6, 6, col); px(-2, -5, 4, 2, '#ffd24a'); px(-1, -1, 2, 2, '#fff2b0');
      break;
    case 'gunner': case 'spitter': case 'caster':
      px(-3, -6, 6, 8, col); px(-4, -8, 8, 3, '#3a3f4a'); px(-2, -4, 4, 3, '#e8c49a');
      px(e.dir > 0 ? 3 : -5, -3, 2, 2, '#d0d4dc');
      break;
    case 'turret':
      px(-5, -3, 10, 7, col); px(-3, -6, 6, 4, '#5a606a'); px(e.dir > 0 ? 3 : -6, -5, 4, 2, '#ffd070');
      break;
    case 'slime':
      px(-4, -3, 8, 6, col); px(-3, -5, 6, 3, col); px(-2, -3, 1, 1, '#20242e'); px(1, -3, 1, 1, '#20242e');
      break;
    case 'worm':
      px(-s, -s / 2, s * 2, s, col); px(-s - 3, -2, 3, 4, '#a08050'); px(-1, -2, 2, 2, '#e8c49a');
      break;
    case 'wisp':
      ctx.globalAlpha = 0.8;
      px(-3, -4, 6, 8, col); px(-2, -5, 4, 2, '#fff');
      ctx.globalAlpha = 1;
      break;
    case 'bomber':
      px(-4, -4, 8, 7, col); px(-3, -6, 6, 3, '#cfe08a'); px(-2, -2, 1, 1, '#20242e'); px(1, -2, 1, 1, '#20242e');
      break;
    case 'boss':
      px(-s, -s, s * 2, s * 2, col);
      px(-s + 2, -s + 2, s * 2 - 4, s * 2 - 4, '#7a2f8f');
      px(-6, -4, 4, 4, '#fff29c'); px(2, -4, 4, 4, '#fff29c');
      px(-1, -1, 2, 2, '#ff4a6a'); px(-1, 5, 2, 4, '#ffd24a');
      break;
    default: /* miner */
      px(-3, -5, 6, 10, col); px(-4, -8, 8, 3, '#8f95a0'); px(-2, -4, 4, 3, '#e8c49a');
      px(e.dir > 0 ? 2 : -3, -3, 1, 1, '#ff4a4a');
      break;
  }
  /* 受击闪白 */
  if (e.hitFlash > 0) {
    ctx.globalAlpha = Math.min(0.8, e.hitFlash / 6);
    px(-s, -s, s * 2, s * 2, '#ffffff');
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  /* 血条 */
  if (e.hp < e.maxHp && e.type !== 'bat') {
    const w = Math.max(10, s * 2);
    px(sx - w / 2, sy - s - 5, w, 2, '#151522');
    px(sx - w / 2, sy - s - 5, w * (e.hp / e.maxHp), 2, e.type === 'boss' ? '#e05a9a' : '#df6871');
  }
}

function drawDrops() {
  for (const d of drops) {
    const sy = d.y - camY;
    if (sy < -12 || sy > VH + 12) continue;
    const sx = d.x - camX;
    switch (d.type) {
      case 'gold':
        px(sx - 1, sy - 2, 3, 3, '#f4ca53'); px(sx - 1, sy - 3, 2, 1, '#fff0a0');
        break;
      case 'wand':
        px(sx - 6, sy - 1, 12, 2, '#8a6a3a'); px(sx + 4, sy - 2, 3, 4, '#7fd8ff'); px(sx - 1, sy - 2, 2, 4, '#c9a24a');
        break;
      case 'chest':
        if (d.opened) { px(sx - 5, sy - 4, 10, 6, '#4a3a2a'); px(sx - 5, sy - 5, 10, 2, '#6a5a3a'); }
        else { px(sx - 5, sy - 5, 10, 7, '#7a5a2a'); px(sx - 5, sy - 6, 10, 2, '#c9a24a'); px(sx - 1, sy - 4, 2, 3, '#ffd24a'); }
        break;
      case 'heart':
        px(sx - 3, sy - 3, 6, 5, '#e0435a'); px(sx - 4, sy - 4, 2, 2, '#e0435a'); px(sx + 2, sy - 4, 2, 2, '#e0435a'); px(sx - 1, sy - 4, 2, 1, '#ff9aa4');
        break;
      case 'heal':
        if (d.takenOnce) { px(sx - 3, sy - 3, 6, 6, '#5a3040'); }
        else { px(sx - 3, sy - 3, 6, 6, '#ff5f90'); px(sx - 1, sy - 5, 2, 10, '#fff'); px(sx - 5, sy - 1, 10, 2, '#fff'); }
        break;
      case 'torch':
        px(sx - 1, sy - 2, 2, 8, '#5a3a1a');
        px(sx - 2, sy - 5, 4, 3, (frame & 2) ? '#ff8a1f' : '#ffd24a');
        break;
      case 'pedestal':
        px(sx - 4, sy - 1, 8, 4, '#5a5f6a'); px(sx - 5, sy + 3, 10, 2, '#3a3f4a');
        break;
    }
  }
}

function drawProjectiles() {
  for (const pr of projectiles) {
    const sy = pr.y - camY, sx = pr.x - camX;
    if (sy < -20 || sy > VH + 20 || sx < -20 || sx > VW + 20) continue;
    const s = pr.shot, sz = s.size || 2;
    const c1 = s.colors[0] || '#fff', c2 = s.colors[1] || c1;
    if (s.id === 'drill' || s.id === 'chainsaw') {
      const a = Math.atan2(pr.vy, pr.vx);
      px(sx - Math.cos(a) * 4, sy - Math.sin(a) * 4, 2, 2, c1);
      px(sx, sy, 2, 2, c1);
    } else if (s.id === 'sawblade') {
      px(sx - 3, sy - 3, 6, 6, c2); px(sx - 2, sy - 2, 4, 4, c1);
    } else if (s.explode > 0) {
      px(sx - sz, sy - sz, sz * 2, sz * 2, c2); px(sx - sz + 1, sy - sz + 1, sz * 2 - 2, sz * 2 - 2, c1);
      if (pr.fuse > 0 && (frame & 2)) px(sx - 1, sy - sz - 3, 2, 2, '#ff5a3a');
    } else {
      px(sx - sz, sy - sz, sz * 2, sz * 2, c2);
      px(sx - sz + 1, sy - sz + 1, Math.max(1, sz * 2 - 2), Math.max(1, sz * 2 - 2), c1);
      if (s.light > 0.7) px(sx - 1, sy - 1, 2, 2, '#fff');
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    const sy = p.y - camY, sx = p.x - camX;
    if (sy < -8 || sy > VH + 8 || sx < -8 || sx > VW + 8) continue;
    if (p.kind === 'text') {
      ctx.globalAlpha = Math.min(1, p.life / 20);
      ctx.fillStyle = p.color;
      ctx.font = '6px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, sx, sy);
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = p.kind === 'boom' || p.kind === 'smoke' ? Math.min(1, p.life / p.max) : 1;
    px(sx, sy, p.size, p.size, p.color);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
}

function drawHolyGlow() {
  for (const h of world.holy) {
    const y0 = h.y0 - camY;
    if (y0 > VH || y0 + HOLY_H < 0) continue;
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffe6a8';
    ctx.fillRect(0, y0, VW, HOLY_H);
    ctx.globalAlpha = 1;
  }
}

/* 准星 */
function drawReticle() {
  const sx = pointer.x, sy = pointer.y;
  if (!pointer.active) return;
  ctx.strokeStyle = 'rgba(255,240,190,0.85)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx - 5, sy); ctx.lineTo(sx - 2, sy);
  ctx.moveTo(sx + 2, sy); ctx.lineTo(sx + 5, sy);
  ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy - 2);
  ctx.moveTo(sx, sy + 2); ctx.lineTo(sx, sy + 5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,190,0.9)';
  ctx.fillRect(sx, sy, 1, 1);
}

function render() {
  if (!world) { ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, VW, VH); return; }
  renderWorld();
  drawHolyGlow();
  /* 实体 */
  for (const e of enemies) {
    const sy = e.y - camY, sx = e.x - camX;
    if (sy < -20 || sy > VH + 20 || sx < -24 || sx > VW + 24) continue;
    drawEnemySprite(e, sx, sy);
  }
  drawDrops();
  drawProjectiles();
  if (!player.dead) drawPlayerSprite(player.x - camX, player.y - camY);
  drawParticles();

  /* 光照合成：scene × light */
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(lightCanvas, 0, 0, LW, LH, 0, 0, VW, VH);
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = false;

  /* 命中闪光 / 受伤红屏 */
  if (hitFlash > 0.01) {
    ctx.globalAlpha = hitFlash * 0.35;
    ctx.fillStyle = '#ff6060';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 1;
  }
  /* 低血量红色暗角 */
  const hpFrac = player.hp / player.maxHp;
  if (hpFrac < 0.3) {
    ctx.globalAlpha = (0.3 - hpFrac) * 1.6;
    ctx.strokeStyle = '#c02030';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, VW - 6, VH - 6);
    ctx.globalAlpha = 1;
  }
  /* 冻结蓝屏 */
  if (player.frozen > 0) {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#a0e0ff';
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 1;
  }
  drawReticle();
}

/* 相机 */
function updateCamera() {
  const tx = clamp(player.x - VW / 2, 0, W - VW);
  const ty = clamp(player.y - VH / 2, 0, H - VH);
  camX += (tx - camX) * 0.14;
  camY += (ty - camY) * 0.14;
  if (shake > 0.1) {
    camX += (rng() - 0.5) * shake;
    camY += (rng() - 0.5) * shake;
    shake *= 0.86;
  } else shake = 0;
  camX = clamp(camX, 0, W - VW);
  camY = clamp(camY, 0, H - VH);
}
/* =============================================================================
   part 6 / 6 : UI · 输入 · 音频 · 主循环 · 启动 · 自检
   ============================================================================= */

const $ = id => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });

/* 输入状态 */
const keys = {};
const pointer = { x: 160, y: 90, down: false, active: false, pickHeld: false };
let editMode = false, perkOpen = false, paused = false, muted = false;
let usingTouch = false;
let toastTimer = 0, bannerTimer = 0;

/* ---------------------------------------------------------------------------
 * 6.1 HUD
 * ------------------------------------------------------------------------- */
function updateHud() {
  if (!player) return;
  const p = player;
  const w = activeWand();
  const hp = clamp(p.hp / p.maxHp, 0, 1);
  $('hpFill').style.width = (hp * 100) + '%';
  $('hpText').textContent = Math.ceil(Math.max(0, p.hp)) + '/' + p.maxHp;
  const mana = w ? clamp(w.mana / w.manaMax, 0, 1) : 0;
  $('manaFill').style.width = (mana * 100) + '%';
  $('manaText').textContent = w ? Math.floor(w.mana) : '—';
  const lev = clamp(p.lev / p.maxLev, 0, 1);
  $('levFill').style.width = (lev * 100) + '%';
  $('levText').textContent = Math.floor(p.lev);
  $('biome').textContent = biomeAt(p.y).name;
  $('depth').textContent = Math.floor(runDepth) + ' m';
  $('goldTag').textContent = gold + ' 金';
  $('killTag').textContent = kills + ' 击杀';

  /* 状态条 */
  const st = [];
  if (p.burning > 0) st.push(['燃烧', 'bad']);
  if (p.poisoned > 0) st.push(['中毒', 'bad']);
  if (p.frozen > 0) st.push(['冰冻', 'bad']);
  if (p.wet > 20) st.push(['潮湿', 'good']);
  if (p.oil > 20) st.push(['油腻', 'bad']);
  if (p.blood > 20) st.push(['血腥', '']);
  if (p.slime > 20) st.push(['黏液', 'bad']);
  if (p.toxic > 20) st.push(['辐射', 'bad']);
  if (p.invisible > 0) st.push(['隐身', 'good']);
  if (p.berserk > 0) st.push(['狂暴', 'good']);
  if (p.regen > 0) st.push(['再生', 'good']);
  if (p.shield > 0.5) st.push(['护盾 ' + Math.ceil(p.shield), 'good']);
  if (p.breath < 100) st.push(['氧气 ' + Math.ceil(p.breath), p.breath < 30 ? 'bad' : '']);
  if (p.perk.tinker) st.push(['随身工匠', 'good']);
  $('statStrip').innerHTML = st.map(s => `<span class="eff ${s[1]}">${s[0]}</span>`).join('');

  /* 魔杖栏 */
  let html = '';
  for (let i = 0; i < 4; i++) {
    const ww = wands[i];
    if (!ww) { html += `<div class="wand-chip"><b>${i + 1} · 空槽位</b><span class="meta">走到法杖上按 F 拾取</span></div>`; continue; }
    const dots = ww.spells.map(s => {
      if (!s || !SPELLS[s.id]) return '<s></s>';
      const cls = spellClass(s.id);
      const used = s.uses === 0 ? ' used' : '';
      return `<s class="${cls}${used}" title="${spellName(s.id)}"></s>`;
    }).join('');
    const cool = ww.rechargeTimer > 0 ? '充能中' : (ww.castTimer > 0 ? '冷却' : '就绪');
    html += `<div class="wand-chip ${i === currentWand ? 'active' : ''}"><b>${i + 1} · ${ww.name}</b>` +
      `<span class="meta">${cool} · 法力 ${Math.floor(ww.mana)}/${ww.manaMax}</span>` +
      `<span class="cool">${ww.shuffle ? '乱序' : '顺序'} · ${ww.capacity} 槽</span>` +
      `<div class="slotdots">${dots}</div></div>`;
  }
  $('wandHud').innerHTML = html;
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.style.opacity = 1;
  toastTimer = 120;
}
function banner(title, sub) {
  $('banner').querySelector('.bt').textContent = title;
  $('banner').querySelector('.bs').textContent = sub || '';
  $('banner').style.opacity = 1;
  bannerTimer = 150;
}

/* 材料检视器 */
function updateInspector() {
  const el = $('inspector');
  if (!pointer.active || gameState !== 'play') { el.style.display = 'none'; return; }
  const wx = (camX + pointer.x) | 0, wy = (camY + pointer.y) | 0;
  if (!inside(wx, wy)) { el.style.display = 'none'; return; }
  const m = world.mat[wy * W + wx];
  el.style.display = 'block';
  el.innerHTML = `${matName(m)} <small>· ${matCatName(m)}</small>`;
  const r = canvas.getBoundingClientRect();
  el.style.left = (r.left + pointer.x / VW * r.width + 12) + 'px';
  el.style.top = (r.top + pointer.y / VH * r.height + 10) + 'px';
}

/* ---------------------------------------------------------------------------
 * 6.2 祝福（Perks）
 * ------------------------------------------------------------------------- */
const PERKS = [
  { id: 'resist', name: '血肉护甲', desc: '受到的伤害降低 38%。', apply: p => p.perk.resist = true },
  { id: 'glass', name: '玻璃大炮', desc: '法术伤害与爆炸范围大幅提升，但最大生命 -35。', apply: p => { p.perk.glass = true; p.maxHp = Math.max(40, p.maxHp - 35); p.hp = Math.min(p.hp, p.maxHp); } },
  { id: 'crit', name: '暴击直觉', desc: '所有法术 +20% 暴击几率。', apply: p => p.perk.crit = true },
  { id: 'levitate', name: '长翼', desc: '悬浮上限 +60，回复更快。', apply: p => { p.perk.levitate = true; p.maxLev += 60; p.lev = p.maxLev; } },
  { id: 'fasterMove', name: '疾风', desc: '移动速度 +28%。', apply: p => p.perk.fasterMove = true },
  { id: 'fasterProj', name: '加速投射', desc: '法术弹速 +30%。', apply: p => p.perk.fasterProj = true },
  { id: 'fireImmune', name: '火焰免疫', desc: '免疫火焰与岩浆伤害。', apply: p => p.perk.fireImmune = true },
  { id: 'toxicImmune', name: '剧毒免疫', desc: '免疫中毒与毒气。', apply: p => p.perk.toxicImmune = true },
  { id: 'explosionImmune', name: '爆炸免疫', desc: '免疫爆炸伤害。', apply: p => p.perk.explosionImmune = true },
  { id: 'meleeImmune', name: '近战免疫', desc: '免疫敌人的近身攻击。', apply: p => p.perk.meleeImmune = true },
  { id: 'extraHp', name: '额外生命', desc: '最大生命 +40 并立即回复。', apply: p => { p.maxHp += 40; healPlayer(40); } },
  { id: 'tinker', name: '随身工匠', desc: '可以在任何地方按 E 编辑魔杖。', apply: p => p.perk.tinker = true },
  { id: 'vampire', name: '吸血', desc: '击杀敌人时回复生命。', apply: p => p.perk.vampire = true },
  { id: 'greed', name: '贪婪', desc: '获得的金币翻倍。', apply: p => p.perk.greed = true },
  { id: 'fasterWands', name: '连锁大师', desc: '所有魔杖的施法延迟与充能时间 -25%。', apply: p => { p.perk.fasterWands = true; for (const w of wands) if (w) { w.castDelay = Math.max(1, Math.round(w.castDelay * 0.75)); w.recharge = Math.max(2, Math.round(w.recharge * 0.75)); } } },
  { id: 'shield', name: '奥术护盾', desc: '获得可再生的 35 点护盾。', apply: p => { p.maxShield += 35; p.shield = p.maxShield; } },
  { id: 'regen', name: '再生', desc: '持续缓慢地恢复生命。', apply: p => p.perk.regen = true },
  { id: 'breathless', name: '鳃', desc: '不再会溺水窒息。', apply: p => p.perk.breathless = true },
  { id: 'healthy', name: '远行者', desc: '每进入一个新的生物群系回复 60 点生命。', apply: p => p.perk.healthy = true },
  { id: 'explorer', name: '勘探者', desc: '隔着墙壁也能看到附近的道具与法杖。', apply: p => p.perk.explorer = true },
  { id: 'noShuffle', name: '去乱序', desc: '所有魔杖变为顺序施法。', apply: p => { p.perk.noShuffle = true; for (const w of wands) if (w) w.shuffle = false; } },
  { id: 'knock', name: '冲击波', desc: '法术命中时大幅击退敌人。', apply: p => p.perk.knock = true }
];
let perkChoices = [];

function offerPerks() {
  const pool = PERKS.slice();
  perkChoices = [];
  for (let i = 0; i < 3 && pool.length; i++) {
    const k = (rng() * pool.length) | 0;
    perkChoices.push(pool.splice(k, 1)[0]);
  }
  perkOpen = true;
  renderPerks();
}
function renderPerks() {
  $('perkPanel').innerHTML =
    `<div class="panel-title"><b>圣山 · 选择一项永久祝福</b><span>点击卡片或按 1 / 2 / 3</span></div>` +
    `<div class="perk-grid">` + perkChoices.map((p, i) =>
      `<button class="perk" data-perk="${i}"><b>${i + 1}. ${p.name}</b><small>${p.desc}</small><div class="rar">永久 · 不可撤销</div></button>`
    ).join('') + `</div>`;
  $('perkPanel').classList.remove('hide');
}
function choosePerk(i) {
  const p = perkChoices[i];
  if (!p) return;
  p.apply(player);
  toast('获得祝福：' + p.name);
  perkChoices = [];
  perkOpen = false;
  $('perkPanel').classList.add('hide');
  sfx('perk');
  updateHud();
}

/* ---------------------------------------------------------------------------
 * 6.3 魔杖编辑台
 * ------------------------------------------------------------------------- */
let selectedSlot = null;
function canEdit() { return player && (inHoly(player.y) >= 0 || player.perk.tinker); }

function renderWandEditor() {
  const bag = player.spellBag || [];
  let html = `<div class="panel-title"><b>魔杖编辑台</b><span>点击两个槽位交换 · 右键清空 · E 关闭</span></div>`;
  html += `<div class="wand-grid">`;
  for (let wi = 0; wi < 4; wi++) {
    const w = wands[wi];
    if (!w) { html += `<div class="wand-card"><h3>${wi + 1} · 空槽位</h3><div class="stats"><span>无</span></div></div>`; continue; }
    html += `<div class="wand-card ${wi === currentWand ? 'active' : ''}">
      <h3>${wi + 1} · ${w.name}<em>${w.shuffle ? '乱序' : '顺序'}</em></h3>
      <div class="stats">
        <span>施法延迟 <b>${w.castDelay}</b></span><span>充能 <b>${w.recharge}</b></span>
        <span>法力 <b>${w.manaMax}</b></span><span>回魔 <b>${w.manaCharge}</b></span>
        <span>容量 <b>${w.capacity}</b></span><span>散射 <b>${w.spread}°</b></span>
        <span>多重 <b>${w.spellsPerCast}</b></span><span>固有 <b>${w.alwaysCast ? spellName(w.alwaysCast) : '—'}</b></span>
      </div>
      <div class="spell-row">`;
    for (let si = 0; si < w.capacity; si++) {
      const s = w.spells[si];
      if (!s || !SPELLS[s.id]) { html += `<button class="spell-btn empty" data-w="${wi}" data-s="${si}">空</button>`; continue; }
      const cls = spellClass(s.id);
      const sel = (selectedSlot && selectedSlot.wi === wi && selectedSlot.si === si) ? ' selected' : '';
      html += `<button class="spell-btn ${cls}${sel}" draggable="true" data-w="${wi}" data-s="${si}">${spellName(s.id)}<small>${s.uses > 0 ? s.uses + ' 次' : '∞'} · ${spellMana(s.id)}</small></button>`;
    }
    html += `</div></div>`;
  }
  html += `</div>`;
  html += `<div class="pool" id="spellPool"><b style="color:#f3d671;font-size:11px;align-self:center">暂存法术：</b>`;
  if (!bag.length) html += `<span style="color:#6b7390;font-size:11px">（空 · 打开宝箱或拾取法杖可获得法术）</span>`;
  for (let i = 0; i < bag.length; i++) html += `<button class="spell-btn ${spellClass(bag[i])}" draggable="true" data-bag="${i}">${spellName(bag[i])}</button>`;
  html += `<button class="spell-btn" id="randSpell" style="border-color:#c8ad58;color:#ffe9a8">+ 随机法术</button>`;
  html += `<button class="spell-btn" id="clearSlot" style="border-color:#7a3038;color:#ffb0b0">清空选中槽位</button>`;
  html += `</div>`;
  $('wandPanel').innerHTML = html;
  $('wandPanel').classList.remove('hide');
}
function handleWandClick(e) {
  const slotBtn = e.target.closest('.spell-btn[data-w]');
  if (slotBtn) {
    const wi = +slotBtn.dataset.w, si = +slotBtn.dataset.s;
    if (e.button === 2) { wands[wi].spells[si] = null; selectedSlot = null; renderWandEditor(); return; }
    if (!selectedSlot) { selectedSlot = { wi, si }; }
    else if (selectedSlot.wi === wi && selectedSlot.si === si) { selectedSlot = null; }
    else {
      const a = selectedSlot, b = { wi, si };
      const tmp = wands[a.wi].spells[a.si];
      wands[a.wi].spells[a.si] = wands[b.wi].spells[b.si];
      wands[b.wi].spells[b.si] = tmp;
      selectedSlot = null;
    }
    renderWandEditor(); updateHud(); sfx('ui');
    return;
  }
  const bagBtn = e.target.closest('.spell-btn[data-bag]');
  if (bagBtn) {
    const id = player.spellBag[+bagBtn.dataset.bag];
    if (id) {
      const target = selectedSlot ? wands[selectedSlot.wi] : activeWand();
      if (target) {
        const si = selectedSlot ? selectedSlot.si : target.spells.findIndex(s => !s);
        if (si >= 0) {
          target.spells[si] = { id, uses: undefined };
          normalizeWand(target);
          player.spellBag.splice(+bagBtn.dataset.bag, 1);
          selectedSlot = null;
        }
      }
    }
    renderWandEditor(); updateHud(); sfx('ui');
    return;
  }
  if (e.target.id === 'randSpell') {
    const target = selectedSlot ? wands[selectedSlot.wi] : activeWand();
    if (target) {
      const si = selectedSlot ? selectedSlot.si : target.spells.findIndex(s => !s);
      if (si >= 0) { target.spells[si] = { id: randomSpellId(clamp(target.tier, 1, 6)), uses: undefined }; normalizeWand(target); }
    }
    renderWandEditor(); updateHud(); sfx('ui');
    return;
  }
  if (e.target.id === 'clearSlot') {
    if (selectedSlot) { wands[selectedSlot.wi].spells[selectedSlot.si] = null; selectedSlot = null; }
    renderWandEditor(); updateHud(); sfx('ui');
  }
}

/* ---------------------------------------------------------------------------
 * 6.4 结算界面
 * ------------------------------------------------------------------------- */
function showDeath(cause) {
  $('deadReason').textContent = '死因：' + cause;
  $('runStats').innerHTML =
    `<b>深入</b><span>${Math.floor(runDepth)} m · ${biomeAt(player.y).name}</span>` +
    `<b>击杀</b><span>${kills}</span>` +
    `<b>金币</b><span>${gold}</span>` +
    `<b>存活</b><span>${Math.floor(runTime / 60)} 秒</span>` +
    `<b>种子</b><span>${seed >>> 0}</span>`;
  $('dead').classList.remove('hide');
}
function showWin() {
  $('winStats').innerHTML =
    `<b>击杀</b><span>${kills}</span>` +
    `<b>金币</b><span>${gold}</span>` +
    `<b>存活</b><span>${Math.floor(runTime / 60)} 秒</span>` +
    `<b>种子</b><span>${seed >>> 0}</span>`;
  $('win').classList.remove('hide');
}
function hideOverlays() {
  for (const id of ['title', 'dead', 'win', 'help', 'wandPanel', 'perkPanel']) $(id).classList.add('hide');
}

/* ---------------------------------------------------------------------------
 * 6.5 音频（WebAudio 合成，无音频文件）
 * ------------------------------------------------------------------------- */
let actx = null, master = null, ambGain = null, ambOsc = [];
function audioInit() {
  if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(actx.destination);
    startAmbient();
  } catch (e) { actx = null; }
}
function tone(freq, dur, type, vol, slide) {
  if (!actx || muted) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, actx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), actx.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.08, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0008, actx.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(actx.currentTime + dur + 0.02);
}
function noiseBurst(dur, vol, lp) {
  if (!actx || muted) return;
  const n = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, n, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = actx.createBufferSource(); src.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp || 1200;
  const g = actx.createGain(); g.gain.value = vol || 0.15;
  src.connect(f); f.connect(g); g.connect(master);
  src.start();
}
function sfx(name) {
  if (!actx || muted) return;
  switch (name) {
    case 'cast': tone(520, 0.07, 'square', 0.05, 300); break;
    case 'boom': noiseBurst(0.35, 0.22, 700); tone(70, 0.3, 'sawtooth', 0.12, 40); break;
    case 'hit': noiseBurst(0.05, 0.08, 2600); break;
    case 'kill': tone(340, 0.12, 'square', 0.07, 120); break;
    case 'hurt': tone(160, 0.12, 'sawtooth', 0.09, 80); break;
    case 'die': tone(220, 0.6, 'sawtooth', 0.12, 45); noiseBurst(0.5, 0.12, 500); break;
    case 'gold': tone(880, 0.06, 'triangle', 0.06, 1320); break;
    case 'perk': tone(523, 0.1, 'triangle', 0.08); setTimeout(() => tone(784, 0.14, 'triangle', 0.07), 70); break;
    case 'jump': tone(300, 0.05, 'square', 0.04, 480); break;
    case 'dig': noiseBurst(0.04, 0.06, 900); break;
    case 'bounce': tone(600, 0.04, 'triangle', 0.05, 900); break;
    case 'trigger': tone(700, 0.05, 'square', 0.05, 1100); break;
    case 'enemycast': tone(200, 0.08, 'sawtooth', 0.05, 140); break;
    case 'holy': tone(392, 0.3, 'triangle', 0.07); setTimeout(() => tone(523, 0.4, 'triangle', 0.06), 120); break;
    case 'biome': tone(294, 0.25, 'triangle', 0.06); setTimeout(() => tone(440, 0.3, 'triangle', 0.05), 120); break;
    case 'start': tone(262, 0.2, 'triangle', 0.07); setTimeout(() => tone(392, 0.3, 'triangle', 0.06), 130); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'triangle', 0.08), i * 140)); break;
    case 'ui': tone(440, 0.03, 'square', 0.04); break;
  }
}
function startAmbient() {
  if (!actx) return;
  ambGain = actx.createGain();
  ambGain.gain.value = 0.0;
  const filt = actx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 220;
  ambGain.connect(filt); filt.connect(master);
  const freqs = [55, 82.4, 110];
  for (const f of freqs) {
    const o = actx.createOscillator();
    o.type = 'sine'; o.frequency.value = f;
    const g = actx.createGain(); g.gain.value = 0.5 / freqs.length;
    o.connect(g); g.connect(ambGain);
    o.start();
    ambOsc.push(o);
  }
  ambGain.gain.linearRampToValueAtTime(0.06, actx.currentTime + 3);
}
function setAmbientMood(bi) {
  if (!ambOsc.length) return;
  const base = [55, 58, 49, 62, 52, 46, 60, 41][clamp(bi, 0, 7)];
  ambOsc[0].frequency.setTargetAtTime(base, actx.currentTime, 2);
  ambOsc[1].frequency.setTargetAtTime(base * 1.5, actx.currentTime, 2);
  ambOsc[2].frequency.setTargetAtTime(base * 2, actx.currentTime, 2);
}

/* ---------------------------------------------------------------------------
 * 6.6 自动瞄准（触屏）
 * ------------------------------------------------------------------------- */
function autoAim() {
  let best = null, bd = 190;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) { pointer.x = clamp(best.x - camX, 0, VW); pointer.y = clamp(best.y - camY, 0, VH); }
  else { pointer.x = player.x - camX + player.dir * 40; pointer.y = player.y - camY; }
  pointer.active = true;
}

/* ---------------------------------------------------------------------------
 * 6.7 启动 / 重置
 * ------------------------------------------------------------------------- */
function startGame(s) {
  seed = (s == null) ? ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0) : (s >>> 0);
  rng = makeRng(seed);
  generateWorld();
  player = makePlayer();
  player.x = W >> 1; player.y = 40;
  wands = startingWands();
  currentWand = 0;
  enemies = []; projectiles = []; particles = [];
  drops = world.items.slice();
  kills = 0; gold = 0; runDepth = 0; runTime = 0; frame = 0;
  shake = 0; hitFlash = 0; selectedSlot = null;
  camX = clamp(player.x - VW / 2, 0, W - VW);
  camY = clamp(player.y - VH / 2, 0, H - VH);
  dynLights.length = 0;
  gameState = 'play'; paused = false; perkOpen = false; editMode = false;
  for (const h of world.holy) { h.seen = false; h.perkOffered = false; }
  hideOverlays();
  updateHud();
  toast('种子 ' + seed);
  banner('矿坑', '向下探索 · 每一颗像素都在模拟');
  sfx('start');
  audioInit();
  if (actx && actx.state === 'suspended') actx.resume();
}

/* ---------------------------------------------------------------------------
 * 6.8 主循环
 * ------------------------------------------------------------------------- */
function tick() {
  frame++;
  if (toastTimer > 0) { toastTimer--; if (toastTimer === 0) $('toast').style.opacity = 0; }
  if (bannerTimer > 0) { bannerTimer--; if (bannerTimer === 0) $('banner').style.opacity = 0; }

  if (gameState === 'play' && !paused && !perkOpen && !editMode) {
    updateCamera();
    aimX = camX + pointer.x; aimY = camY + pointer.y;
    if (usingTouch && pointer.down) autoAim();
    dynLights.length = 0;
    addPlayerLights();
    updatePlayer();
    updateEnemies();
    updateProjectiles();
    updateParticles();
    simStep();
    updateLight();
    tickWands();
    runTime++;
    setAmbientMood(biomeIndex(player.y));
  } else {
    updateCamera();
    aimX = camX + pointer.x; aimY = camY + pointer.y;
    dynLights.length = 0;
    if (player) addPlayerLights();
    updateParticles();
    if (player) updateLight();
  }
  if (frame % 10 === 0) { updateHud(); updateInspector(); }
}

function addPlayerLights() {
  const p = player;
  addDynLight(p.x, p.y - 2, 1.0, 0.86, 0.66, p.burning > 0 ? 11.5 : 10.0);
  if (p.perk.explorer) {
    for (const d of drops) {
      if (d.type === 'wand' || d.type === 'chest' || d.type === 'heart') {
        if (Math.abs(d.x - p.x) < 150 && Math.abs(d.y - p.y) < 110) addDynLight(d.x, d.y, 0.8, 0.7, 1.0, 2.2);
      }
    }
  }
  for (const d of drops) {
    if (d.type === 'torch' && Math.abs(d.x - p.x) < 230 && Math.abs(d.y - p.y) < 160) addDynLight(d.x, d.y, 1.0, 0.8, 0.5, 8.0);
    if (d.type === 'heal' && !d.takenOnce && Math.abs(d.x - p.x) < 120 && Math.abs(d.y - p.y) < 90) addDynLight(d.x, d.y, 1.0, 0.5, 0.7, 3.5);
  }
}

let lastTs = 0, acc = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  if (!lastTs) lastTs = ts;
  let dt = ts - lastTs; lastTs = ts;
  if (dt > 200) dt = 200;
  acc += dt;
  let steps = 0;
  while (acc >= STEP_MS && steps < 5) { tick(); acc -= STEP_MS; steps++; }
  if (steps >= 5) acc = 0;
  render();
}

/* ---------------------------------------------------------------------------
 * 6.9 输入
 * ------------------------------------------------------------------------- */
window.addEventListener('keydown', e => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  keys[k] = true;
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'tab'].includes(k)) e.preventDefault();
  if (k === 'tab') { const h = $('help'); h.classList.toggle('hide'); return; }
  if (k === 'm') { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; toast(muted ? '静音' : '开启声音'); return; }
  if (k === 'escape') {
    if (editMode) { editMode = false; $('wandPanel').classList.add('hide'); }
    else if (!perkOpen && gameState === 'play') { paused = !paused; toast(paused ? '已暂停' : '继续'); }
    return;
  }
  if (perkOpen) { if (['1', '2', '3'].includes(k)) choosePerk(+k - 1); return; }
  if (gameState !== 'play') return;
  if (k === 'e') {
    if (canEdit()) { editMode = !editMode; if (editMode) renderWandEditor(); else $('wandPanel').classList.add('hide'); }
    else toast('只能在圣山内编辑魔杖（或取得「随身工匠」祝福）');
    return;
  }
  if (k >= '1' && k <= '4') { const n = +k - 1; if (wands[n]) { currentWand = n; updateHud(); sfx('ui'); } return; }
  if (k === 'q') { cycleWand(); return; }
});
window.addEventListener('keyup', e => { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()] = false; });

function cycleWand() {
  for (let i = 1; i <= 4; i++) {
    const n = (currentWand + i) % 4;
    if (wands[n]) { currentWand = n; updateHud(); sfx('ui'); return; }
  }
}

canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  pointer.x = clamp((e.clientX - r.left) / r.width * VW, 0, VW);
  pointer.y = clamp((e.clientY - r.top) / r.height * VH, 0, VH);
  pointer.active = true;
  if (e.pointerType === 'touch') usingTouch = true;
});
canvas.addEventListener('pointerdown', e => {
  audioInit();
  if (gameState !== 'play') return;
  const r = canvas.getBoundingClientRect();
  pointer.x = clamp((e.clientX - r.left) / r.width * VW, 0, VW);
  pointer.y = clamp((e.clientY - r.top) / r.height * VH, 0, VH);
  pointer.active = true;
  if (e.pointerType === 'touch') usingTouch = true;
  /* 点击拾取 */
  const wx = camX + pointer.x, wy = camY + pointer.y;
  const pi = findPickable(wx, wy);
  if (pi >= 0) { pickUp(drops[pi], pi); return; }
  pointer.down = true;
  if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
});
canvas.addEventListener('pointerup', () => { pointer.down = false; pointer.pickHeld = false; });
canvas.addEventListener('pointercancel', () => { pointer.down = false; });
canvas.addEventListener('pointerleave', () => { if (!usingTouch) pointer.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { if (gameState === 'play') { cycleWand(); e.preventDefault(); } }, { passive: false });

function findPickable(wx, wy) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    if (!(d.type === 'wand' || d.type === 'chest' || d.type === 'heart' || d.type === 'heal')) continue;
    if (Math.hypot(d.x - wx, d.y - wy) < 14) return i;
  }
  return -1;
}

/* 触屏按钮 */
function bindHold(id, on, off) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.preventDefault(); usingTouch = true; audioInit(); on(); });
  b.addEventListener('pointerup', e => { e.preventDefault(); off(); });
  b.addEventListener('pointerleave', () => off());
  b.addEventListener('pointercancel', () => off());
}
bindHold('leftBtn', () => keys['a'] = true, () => keys['a'] = false);
bindHold('rightBtn', () => keys['d'] = true, () => keys['d'] = false);
bindHold('jumpBtn', () => keys['w'] = true, () => keys['w'] = false);
$('fireBtn').addEventListener('pointerdown', e => { e.preventDefault(); usingTouch = true; audioInit(); pointer.down = true; if (!pointer.active) { pointer.active = true; } });
$('fireBtn').addEventListener('pointerup', e => { e.preventDefault(); pointer.down = false; });
$('fireBtn').addEventListener('pointercancel', () => pointer.down = false);
$('wandBtn').addEventListener('click', () => { if (gameState === 'play') cycleWand(); });
$('editBtn').addEventListener('click', () => {
  if (gameState !== 'play') return;
  if (canEdit()) { editMode = !editMode; if (editMode) renderWandEditor(); else $('wandPanel').classList.add('hide'); }
  else toast('只能在圣山内编辑魔杖');
});

/* 面板与按钮 */
$('startBtn').addEventListener('click', () => { audioInit(); startGame(); });
$('restartBtn').addEventListener('click', () => startGame());
$('winBtn').addEventListener('click', () => startGame());
$('helpBtn').addEventListener('click', () => $('help').classList.remove('hide'));
$('helpClose').addEventListener('click', () => $('help').classList.add('hide'));
$('deadHelp').addEventListener('click', () => $('help').classList.remove('hide'));
$('seedBtn').addEventListener('click', () => {
  const s = prompt('输入世界种子（数字）：', String((Math.random() * 1e9) >>> 0));
  if (s != null) { audioInit(); startGame((parseInt(s, 10) || 0) >>> 0); }
});
$('perkPanel').addEventListener('click', e => { const b = e.target.closest('[data-perk]'); if (b) choosePerk(+b.dataset.perk); });
$('wandPanel').addEventListener('click', handleWandClick);
$('wandPanel').addEventListener('contextmenu', e => { if (e.target.closest('.spell-btn[data-w]')) { e.preventDefault(); handleWandClick(e); } });

/* 魔杖编辑台：拖拽放置 */
let dragSrc = null;
$('wandPanel').addEventListener('dragstart', e => {
  const b = e.target.closest('.spell-btn');
  if (!b) return;
  if (b.dataset.w !== undefined && b.dataset.s !== undefined) dragSrc = { type: 'slot', wi: +b.dataset.w, si: +b.dataset.s };
  else if (b.dataset.bag !== undefined) dragSrc = { type: 'bag', i: +b.dataset.bag };
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
});
$('wandPanel').addEventListener('dragover', e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; });
$('wandPanel').addEventListener('drop', e => {
  e.preventDefault();
  if (!dragSrc) return;
  const slotBtn = e.target.closest('.spell-btn[data-w]');
  const pool = e.target.closest('#spellPool');
  if (slotBtn) {
    const wi = +slotBtn.dataset.w, si = +slotBtn.dataset.s;
    if (dragSrc.type === 'slot') {
      const tmp = wands[dragSrc.wi].spells[dragSrc.si];
      wands[dragSrc.wi].spells[dragSrc.si] = wands[wi].spells[si];
      wands[wi].spells[si] = tmp;
    } else {
      const id = player.spellBag[dragSrc.i];
      if (id) {
        const old = wands[wi].spells[si];
        wands[wi].spells[si] = { id, uses: undefined };
        normalizeWand(wands[wi]);
        player.spellBag.splice(dragSrc.i, 1);
        if (old && old.id) player.spellBag.push(old.id);
      }
    }
  } else if (pool) {
    if (dragSrc.type === 'slot') {
      const s = wands[dragSrc.wi].spells[dragSrc.si];
      if (s && s.id) { player.spellBag.push(s.id); wands[dragSrc.wi].spells[dragSrc.si] = null; }
    }
  }
  dragSrc = null;
  renderWandEditor(); updateHud(); sfx('ui');
});

/* ---------------------------------------------------------------------------
 * 6.10 初始化
 * ------------------------------------------------------------------------- */
function init() {
  initLight();
  initRender();
  ctx.imageSmoothingEnabled = false;
  /* 标题界面演示世界 */
  seed = 20240905;
  rng = makeRng(seed);
  generateWorld();
  player = makePlayer();
  player.x = W >> 1; player.y = 40;
  wands = startingWands();
  drops = world.items.slice();
  camX = clamp(player.x - VW / 2, 0, W - VW);
  camY = clamp(player.y - VH / 2, 0, H - VH);
  gameState = 'title';
  updateLight();
  requestAnimationFrame(loop);
}

/* ---------------------------------------------------------------------------
 * 6.11 自检 / 自动化测试接口
 * ------------------------------------------------------------------------- */
function runSelfTest() {
  const R = {};
  try {
    startGame(424242);
    R.seed = seed >>> 0;
    R.started = gameState === 'play';
    R.spawn = { x: Math.round(player.x), y: Math.round(player.y) };
    R.spawnClear = !rectSolid(player.x, player.y, player.w, player.h);
    R.hp0 = player.maxHp;

    /* 移动 */
    const x0 = player.x;
    keys['d'] = true; for (let i = 0; i < 60; i++) tick(); keys['d'] = false;
    R.movedX = +(player.x - x0).toFixed(2);
    R.canMove = Math.abs(R.movedX) > 2;

    /* 跳跃 */
    const y0 = player.y;
    keys['w'] = true; for (let i = 0; i < 8; i++) tick(); keys['w'] = false;
    R.jumped = player.y < y0 - 1;
    for (let i = 0; i < 40; i++) tick();

    /* 开辟测试场地：在玩家周围清出一间开阔石室 */
    function carveChamber(ccx, ccy, hw, hh) {
      for (let y = ccy - hh; y <= ccy + hh; y++)
        for (let x = ccx - hw; x <= ccx + hw; x++)
          if (inside(x, y)) setCell(x, y, M.AIR);
      for (let x = ccx - hw; x <= ccx + hw; x++) { setCell(x, ccy + hh + 1, M.ROCK); setCell(x, ccy - hh - 1, M.ROCK); }
      for (let y = ccy - hh; y <= ccy + hh; y++) { setCell(ccx - hw - 1, y, M.ROCK); setCell(ccx + hw + 1, y, M.ROCK); }
    }
    const ccx = clamp(player.x | 0, 46, W - 46);
    const ccy = clamp(player.y | 0, TOP + 24, H - 48);
    carveChamber(ccx, ccy, 34, 12);
    player.x = ccx; player.y = ccy; player.vx = player.vy = 0;
    camX = clamp(player.x - VW / 2, 0, W - VW);
    camY = clamp(player.y - VH / 2, 0, H - VH);
    for (let i = 0; i < 4; i++) tick();

    /* 施法（水平方向，前方开阔） */
    pointer.active = true;
    pointer.x = VW - 4;
    pointer.y = clamp(player.y - camY, 2, VH - 2);
    pointer.down = true;
    let maxPj = 0;
    for (let i = 0; i < 16; i++) { tick(); if (projectiles.length > maxPj) maxPj = projectiles.length; }
    R.maxProjectiles = maxPj;
    R.castProduced = maxPj > 0;
    R.castCount = castCount;
    R.spawnCount = spawnCount;
    R.wandMana = Math.floor(activeWand().mana);
    pointer.down = false;

    /* 击杀敌人 */
    const e = spawnEnemy('miner', ccx + 30, ccy - 4);
    const k0 = kills;
    pointer.active = true;
    let maxPj2 = 0;
    for (let i = 0; i < 700 && e && !e.dead; i++) {
      pointer.x = clamp(e.x - camX, 0, VW); pointer.y = clamp(e.y - camY, 0, VH);
      pointer.down = true;
      tick();
      if (projectiles.length > maxPj2) maxPj2 = projectiles.length;
    }
    pointer.down = false;
    R.maxProjectilesFight = maxPj2;
    R.killedEnemy = !!(e && e.dead);
    R.killsDelta = kills - k0;
    R.hpAfterFight = Math.round(player.hp);

    /* 炼金反应：密封石室中放置岩浆与水 */
    function makePocket(px, py) {
      for (let dy = -1; dy <= 3; dy++) for (let dx = -2; dx <= 2; dx++) setCell(px + dx, py + dy, M.AIR);
      for (let dx = -3; dx <= 3; dx++) setCell(px + dx, py + 4, M.ROCK);
      for (let dy = -2; dy <= 4; dy++) { setCell(px - 3, py + dy, M.ROCK); setCell(px + 3, py + dy, M.ROCK); }
      for (let dx = -3; dx <= 3; dx++) setCell(px + dx, py - 2, M.ROCK);
    }
    let reacted = false;
    const rx = ccx + 20, ry = ccy + 6;
    makePocket(rx, ry);
    setCell(rx, ry + 3, M.LAVA); setCell(rx, ry + 2, M.WATER);
    for (let i = 0; i < 40 && !reacted; i++) {
      simStep();
      for (let dx = -2; dx <= 2 && !reacted; dx++) for (let dy = -1; dy <= 3; dy++) {
        const m = getM(rx + dx, ry + dy);
        if (m === M.STEAM || m === M.ROCK) { reacted = true; break; }
      }
    }
    R.lavaWaterReaction = reacted;

    /* 液体密度：油应浮在水上（填满容器以形成分层） */
    let oilAbove = false;
    const ox = ccx - 20, oy = ccy + 6;
    makePocket(ox, oy);
    for (let dx = -2; dx <= 2; dx++) {
      setCell(ox + dx, oy + 3, M.WATER);
      setCell(ox + dx, oy + 2, M.WATER);
      setCell(ox + dx, oy + 1, M.OIL);
    }
    for (let i = 0; i < 80; i++) simStep();
    R.oilSample = { top: matName(getM(ox, oy + 1)), mid: matName(getM(ox, oy + 2)), bot: matName(getM(ox, oy + 3)) };
    if (getM(ox, oy + 1) === M.OIL && getM(ox, oy + 3) === M.WATER) oilAbove = true;
    R.oilFloatsOnWater = oilAbove;

    /* 光照：光照缓冲应有明显的亮区（玩家微光 + 发光材料） */
    for (let i = 0; i < 6; i++) tick();
    let lmax = 0, lit = 0;
    for (let i = 0; i < lightR.length; i++) { const v = lightR[i] + lightG[i] + lightB[i]; if (v > lmax) lmax = v; if (v > 0.2) lit++; }
    R.lightMax = +lmax.toFixed(3);
    R.litCells = lit;
    R.lighting = lmax > 0.3 && lit > 50;

    /* 死亡与死因 */
    const cause = '自检伤害';
    player.inv = 0; player.shield = 0; player.perk = {};
    hurtPlayer(99999, cause);
    R.died = gameState === 'dead';
    R.deathReason = $('deadReason').textContent;
    R.deathShowsCause = R.deathReason.indexOf(cause) >= 0;
    R.frame = frame;
  } catch (err) {
    R.error = String((err && err.stack) || err);
  }
  window.__SELFTEST__ = R;
  document.body.setAttribute('data-selftest', JSON.stringify(R));
  return R;
}

/* 对外测试 API */
window.NOITA = {
  start: (s) => startGame(s),
  step: (n) => { for (let i = 0; i < (n || 1); i++) tick(); },
  render,
  selfTest: runSelfTest,
  state: () => ({
    gameState, frame, seed: seed >>> 0,
    player: player ? { x: +player.x.toFixed(1), y: +player.y.toFixed(1), hp: +player.hp.toFixed(1), maxHp: player.maxHp, lev: +player.lev.toFixed(1), dead: player.dead, cause: player.lastHitBy } : null,
    enemies: enemies.length, projectiles: projectiles.length, particles: particles.length, drops: drops.length,
    kills, gold, depth: Math.floor(runDepth), biome: player ? biomeAt(player.y).name : '',
    wands: wands.map(w => w ? { name: w.name, mana: Math.floor(w.mana), slots: w.spells.map(s => s ? s.id : null), castDelay: w.castDelay, recharge: w.recharge } : null),
    holy: inHoly(player ? player.y : 0)
  }),
  key: (k, down) => { keys[k] = down; },
  pointer: (x, y, down) => { pointer.active = true; pointer.x = x; pointer.y = y; pointer.down = !!down; },
  spawnEnemy: (t, x, y) => spawnEnemy(t, x, y),
  teleport: (x, y) => { if (player) { player.x = x; player.y = y; player.vx = player.vy = 0; } },
  hurt: (d, c) => hurtPlayer(d, c),
  heal: (n) => healPlayer(n),
  giveSpell: (id) => addSpellToInventory(id),
  setWandSlot: (wi, si, id) => { if (wands[wi]) { wands[wi].spells[si] = id ? { id, uses: undefined } : null; normalizeWand(wands[wi]); } },
  choosePerk: (i) => choosePerk(i),
  perkChoices: () => perkChoices.map(p => p.name),
  worldInfo: () => ({ W, H, seed: seed >>> 0, biomeRows: BIOMES.map((b, i) => ({ name: b.name, y0: layerY0(i), y1: layerY0(i) + LAYER_H })) })
};

/* 画布分析（用于无头环境验证渲染） */
function analyzeCanvas(steps, biomeIdx) {
  startGame(20240905);
  if (biomeIdx != null && biomeIdx >= 0 && biomeIdx < NB) {
    player.x = W >> 1; player.y = layerY0(biomeIdx) + Math.floor(LAYER_H * 0.55); player.vx = player.vy = 0;
    camX = clamp(player.x - VW / 2, 0, W - VW);
    camY = clamp(player.y - VH / 2, 0, H - VH);
  }
  const n = steps || 240;
  for (let i = 0; i < n; i++) tick();
  render();
  const im = ctx.getImageData(0, 0, VW, VH);
  const d = im.data;
  let sum = 0, dark = 0, warm = 0, colorful = 0;
  const hist = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722;
    sum += lum;
    if (lum < 12) dark++;
    if (d[i] > d[i + 1] + 18 && d[i] > d[i + 2] + 18 && lum > 30) warm++;
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    if (mx - mn > 40 && lum > 25) colorful++;
    hist[Math.min(9, (lum / 256 * 10) | 0)]++;
  }
  const cnt = d.length / 4;
  const AW = 80, AH = 45, art = [];
  for (let ay = 0; ay < AH; ay++) {
    let row = '';
    for (let ax = 0; ax < AW; ax++) {
      const sx = ((ax + 0.5) / AW * VW) | 0, sy = ((ay + 0.5) / AH * VH) | 0;
      const o = (sy * VW + sx) * 4;
      const lum = d[o] * 0.2126 + d[o + 1] * 0.7152 + d[o + 2] * 0.0722;
      row += ' .:-=+*#%@'[Math.min(9, (lum / 256 * 10) | 0)];
    }
    art.push(row);
  }
  /* 材料类别图（每格 4px） */
  const CAT_CH = [' ', '#', '.', '~', '^', '*'];
  const SP = {};
  SP[M.WATER] = '~'; SP[M.LAVA] = 'L'; SP[M.OIL] = 'o'; SP[M.BLOOD] = 'b';
  SP[M.ACID] = 'a'; SP[M.TOXIC] = 't'; SP[M.SLIME] = 's'; SP[M.MANA] = 'm'; SP[M.HEALTHIUM] = 'h';
  const matArt = [];
  for (let ay = 0; ay < AH; ay++) {
    let row = '';
    for (let ax = 0; ax < AW; ax++) {
      const wx = (camX + ax * 4) | 0, wy = (camY + ay * 4) | 0;
      const m = inside(wx, wy) ? world.mat[wy * W + wx] : M.DENSE;
      row += SP[m] || CAT_CH[MAT_CAT[m]];
    }
    matArt.push(row);
  }
  return {
    avg: +(sum / cnt).toFixed(1),
    darkPct: +(dark / cnt * 100).toFixed(1),
    warmPct: +(warm / cnt * 100).toFixed(1),
    colorfulPct: +(colorful / cnt * 100).toFixed(1),
    hist, art, matArt,
    player: { x: Math.round(player.x), y: Math.round(player.y), hp: Math.round(player.hp), biome: biomeAt(player.y).name },
    enemies: enemies.length, drops: drops.length
  };
}
window.NOITA.analyze = analyzeCanvas;

/* 功能测试：逐项验证机制（无头环境下运行） */
function carveTestRoom(cx, cy, hw, hh) {
  for (let y = cy - hh; y <= cy + hh; y++)
    for (let x = cx - hw; x <= cx + hw; x++)
      if (inside(x, y)) setCell(x, y, M.AIR);
  for (let x = cx - hw; x <= cx + hw; x++) { setCell(x, cy + hh + 1, M.ROCK); setCell(x, cy - hh - 1, M.ROCK); }
  for (let y = cy - hh; y <= cy + hh; y++) { setCell(cx - hw - 1, y, M.ROCK); setCell(cx + hw + 1, y, M.ROCK); }
}
function placeAtPlayer() { player.x = clamp(player.x | 0, 46, W - 46); player.y = clamp(player.y | 0, 8, H - 48); camX = clamp(player.x - VW / 2, 0, W - VW); camY = clamp(player.y - VH / 2, 0, H - VH); }

function runFeatureTest() {
  const R = {};
  try {
    /* 性能（分解） */
    startGame(7);
    let t0 = performance.now();
    for (let i = 0; i < 80; i++) tick();
    R.msTick = +((performance.now() - t0) / 80).toFixed(3);
    t0 = performance.now();
    for (let i = 0; i < 80; i++) simStep();
    R.msSim = +((performance.now() - t0) / 80).toFixed(3);
    t0 = performance.now();
    for (let i = 0; i < 80; i++) updateLight();
    R.msLight = +((performance.now() - t0) / 80).toFixed(3);
    t0 = performance.now();
    for (let i = 0; i < 80; i++) render();
    R.msRender = +((performance.now() - t0) / 80).toFixed(3);

    /* 生物群系遍历 */
    const biomeNames = [];
    for (let i = 0; i < NB; i++) {
      startGame(7);
      const y = layerY0(i) + Math.floor(LAYER_H / 2);
      player.x = W >> 1; player.y = y; player.vx = player.vy = 0;
      camY = clamp(player.y - VH / 2, 0, H - VH);
      for (let k = 0; k < 3; k++) tick();
      biomeNames.push(biomeAt(player.y).name);
    }
    R.biomes = biomeNames;
    R.biomeCount = new Set(biomeNames).size;

    /* 圣山：祝福面板 + 编辑权限 */
    startGame(7);
    player.x = W >> 1; player.y = layerY0(0) + LAYER_H + 12; player.vx = player.vy = 0;
    camY = clamp(player.y - VH / 2, 0, H - VH);
    for (let k = 0; k < 3; k++) tick();
    R.perkPanelOpen = perkOpen;
    R.perkNames = perkChoices.map(p => p.name);
    R.canEditInHoly = canEdit();
    const perkCount0 = Object.keys(player.perk).length;
    choosePerk(0);
    R.perkApplied = Object.keys(player.perk).length > perkCount0 && !perkOpen;
    R.holyItemCount = drops.filter(d => d.type === 'heal' || d.type === 'torch').length;

    /* 魔杖编辑台：渲染 + 点击放入法术 + 交换槽位 */
    editMode = true;
    renderWandEditor();
    R.editorRendered = $('wandPanel').innerHTML.length > 200;
    player.spellBag = ['firebolt'];
    renderWandEditor();
    const bagBtn = $('wandPanel').querySelector('.spell-btn[data-bag]');
    if (bagBtn) bagBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    R.bagAdded = activeWand().spells.some(s => s && s.id === 'firebolt') && player.spellBag.length === 0;
    const slotBtns = $('wandPanel').querySelectorAll('.spell-btn[data-w]');
    if (slotBtns.length >= 2) {
      slotBtns[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      slotBtns[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      R.editorSwapOk = true;
    }
    editMode = false;

    /* 魔杖连锁：多重 + 追踪 + 火焰轨迹 + 火花 */
    startGame(7);
    placeAtPlayer();
    carveTestRoom(player.x | 0, player.y | 0, 40, 14);
    const w = activeWand();
    w.capacity = 6; w.spellsPerCast = 1; w.shuffle = false;
    w.spells = [{ id: 'mc_triple' }, { id: 'm_homing' }, { id: 'm_firetrail' }, { id: 'spark' }, { id: 'spark' }, { id: 'spark' }];
    normalizeWand(w);
    pointer.active = true; pointer.x = VW - 2; pointer.y = clamp(player.y - camY, 2, VH - 2);
    pointer.down = true; tick();
    R.chainProjectiles = projectiles.length;
    R.chainHoming = projectiles.some(p => p.shot.homing);
    R.chainFireTrail = projectiles.some(p => p.shot.trail === 'fire');
    pointer.down = false;

    /* 触发法术：命中后释放载荷 */
    startGame(7);
    placeAtPlayer();
    carveTestRoom(player.x | 0, player.y | 0, 40, 14);
    const w2 = activeWand();
    w2.capacity = 2; w2.spellsPerCast = 1; w2.shuffle = false;
    w2.spells = [{ id: 't_spark' }, { id: 'firebolt' }];
    normalizeWand(w2);
    const sc0 = spawnCount;
    pointer.active = true; pointer.x = VW - 2; pointer.y = clamp(player.y - camY, 2, VH - 2);
    pointer.down = true;
    for (let i = 0; i < 20; i++) tick();
    pointer.down = false;
    R.triggerSpawned = spawnCount - sc0;

    /* 状态伤害：火焰 / 岩浆 / 酸液 / 中毒 */
    startGame(7); placeAtPlayer(); carveTestRoom(player.x | 0, player.y | 0, 30, 12);
    player.hp = 100; const hpFire0 = player.hp;
    for (let i = 0; i < 40; i++) { setFire(player.x | 0, player.y | 0, 60); tick(); }
    R.fireHurts = player.hp < hpFire0 - 1;
    R.burningStatus = player.burning > 0;
    player.burning = 0; player.hp = 100;
    const hpLava0 = player.hp;
    for (let i = 0; i < 40; i++) { setCell(player.x | 0, player.y | 0, M.LAVA); tick(); }
    R.lavaHurts = player.hp < hpLava0 - 1;
    R.lavaCause = player.lastHitBy;
    setCell(player.x | 0, player.y | 0, M.AIR); player.hp = 100; player.inv = 0;
    const hpAcid0 = player.hp;
    for (let i = 0; i < 20; i++) { setCell(player.x | 0, player.y | 0, M.ACID); tick(); }
    R.acidHurts = player.hp < hpAcid0 - 1;
    setCell(player.x | 0, player.y | 0, M.AIR);

    /* 溺水死亡 */
    startGame(7);
    placeAtPlayer();
    carveTestRoom(player.x | 0, player.y | 0, 26, 12);
    player.perk = {}; player.hp = 100; player.breath = 6;
    const px = player.x | 0, py = player.y | 0;
    /* 用整间石室的水把玩家完全淹没 */
    for (let y = py - 12; y <= py + 12; y++) for (let x = px - 26; x <= px + 26; x++) setCell(x, y, M.WATER);
    player.x = px; player.y = py;
    let drown = false;
    const snap = [];
    for (let i = 0; i < 700 && gameState === 'play'; i++) {
      tick();
      if (i === 20 || i === 120 || i === 300) snap.push({ i, hw: player.headWater, breath: Math.round(player.breath), hp: Math.round(player.hp), y: Math.round(player.y), c: matName(cellAt(player.x, player.y)) });
    }
    drown = gameState === 'dead' && /窒息/.test(player.lastHitBy);
    R.drownDeath = drown;
    R.drownCause = player.lastHitBy;
    R.drownBreath = Math.round(player.breath);
    R.drownSnap = snap;

    /* 敌人种类与 AI 运行 */
    startGame(7);
    placeAtPlayer(); carveTestRoom(player.x | 0, player.y | 0, 60, 20);
    const types = ['miner', 'gunner', 'bat', 'bomber', 'worm', 'slime', 'turret', 'spitter', 'caster', 'wisp'];
    const spawned = [];
    for (const t of types) { const e = spawnEnemy(t, player.x + 20 + spawned.length * 3, player.y - 4); if (e) spawned.push(t); }
    const alive0 = enemies.length;
    for (let i = 0; i < 120; i++) tick();
    R.enemyTypesSpawned = spawned.length;
    R.enemiesRanWithoutError = true;
    R.enemiesRemaining = enemies.length;

    /* 首领与通关 */
    startGame(7);
    player.x = W >> 1; player.y = H - 160; player.vx = player.vy = 0;
    camX = clamp(player.x - VW / 2, 0, W - VW); camY = clamp(player.y - VH / 2, 0, H - VH);
    for (let i = 0; i < 6; i++) tick();
    const boss = enemies.find(e => e.type === 'boss');
    R.bossSpawned = !!boss;
    if (boss) { boss.hp = 1; damageEnemy(boss, 9999, 'proj'); }
    R.winTriggered = gameState === 'win';
    R.winPanelShown = !$('win').classList.contains('hide');

    /* 材料数量 */
    R.materialCount = NMAT;
    R.spellCount = Object.keys(SPELLS).length;
    R.perkCount = PERKS.length;
    R.biomeDefs = BIOMES.length;

    /* 挖掘测试：在实心岩石中向下钻探 */
    startGame(7);
    placeAtPlayer();
    {
      const px = player.x | 0, py = player.y | 0;
      for (let y = py - 10; y < py + 8; y++) for (let x = px - 6; x <= px + 6; x++) setCell(x, y, M.AIR);
      for (let y = py + 8; y < py + 70; y++) for (let x = px - 6; x <= px + 6; x++) setCell(x, y, M.ROCK);
      currentWand = 1;
      const y0 = player.y;
      const sc0 = spawnCount, cc0 = castCount;
      let pjMax = 0;
      for (let i = 0; i < 260 && gameState === 'play'; i++) {
        pointer.active = true;
        pointer.x = clamp(player.x - camX, 1, VW - 1);
        pointer.y = clamp(player.y - camY + 50, 1, VH - 1);
        pointer.down = true;
        tick();
        if (projectiles.length > pjMax) pjMax = projectiles.length;
      }
      R.digDepth = Math.round(player.y - y0);
      R.digSpawn = spawnCount - sc0;
      R.digCasts = castCount - cc0;
      R.digPjMax = pjMax;
      R.digFloor = matName(getM(px, py + 8));
      R.digAt10 = matName(getM(px, py + 10));
      R.digWand = wands[1] ? wands[1].spells.map(s => s && s.id) : null;
    }

    /* 出生点原地向下挖掘（真实地形，不预先清理） */
    startGame(777);
    currentWand = 1;
    {
      const sy0 = player.y;
      for (let i = 0; i < 500 && gameState === 'play'; i++) {
        pointer.active = true;
        pointer.x = clamp(player.x - camX, 1, VW - 1);
        pointer.y = clamp(player.y - camY + 50, 1, VH - 1);
        pointer.down = true;
        tick();
      }
      R.spawnDigDepth = Math.round(player.y - sy0);
      R.spawnBelow = [56, 62, 70, 80, 100, 140, 200].map(yy => matName(getM(player.x | 0, yy)));
      R.spawnX = Math.round(player.x);
    }
    startGame(7);
    {
      const sx = player.x | 0, sy = player.y | 0;
      const seen = new Uint8Array(W * H);
      const q = new Int32Array(W * H);
      let head = 0, tail = 0, maxY = sy, cells = 0;
      seen[sy * W + sx] = 1; q[tail++] = sy * W + sx;
      while (head < tail) {
        const i = q[head++]; cells++;
        const y = (i / W) | 0, x = i - y * W;
        if (y > maxY) maxY = y;
        if (x > 0) { const j = i - 1; if (!seen[j] && MAT_CAT[world.mat[j]] !== CAT_SOLID) { seen[j] = 1; q[tail++] = j; } }
        if (x < W - 1) { const j = i + 1; if (!seen[j] && MAT_CAT[world.mat[j]] !== CAT_SOLID) { seen[j] = 1; q[tail++] = j; } }
        if (y > 0) { const j = i - W; if (!seen[j] && MAT_CAT[world.mat[j]] !== CAT_SOLID) { seen[j] = 1; q[tail++] = j; } }
        if (y < H - 1) { const j = i + W; if (!seen[j] && MAT_CAT[world.mat[j]] !== CAT_SOLID) { seen[j] = 1; q[tail++] = j; } }
      }
      R.reachableDepth = maxY;
      R.reachableCells = cells;
      R.reachBiome = biomeAt(maxY).name;
      R.reachHoly = inHoly(maxY) >= 0 || maxY > layerY0(1);
    }
  } catch (err) {
    R.error = String((err && err.stack) || err);
  }
  window.__FEATURE__ = R;
  document.body.setAttribute('data-feature', JSON.stringify(R));
  return R;
}
window.NOITA.featureTest = runFeatureTest;

/* 独立性能测试（单次世界，避免多次生成造成的 GC 干扰） */
function runPerf(biomeIdx) {
  const R = {};
  try {
    startGame(7);
    biomeIdx = (biomeIdx == null || isNaN(biomeIdx)) ? 1 : biomeIdx;
    player.x = W >> 1; player.y = layerY0(biomeIdx) + 110; player.vx = player.vy = 0;
    camX = clamp(player.x - VW / 2, 0, W - VW); camY = clamp(player.y - VH / 2, 0, H - VH);
    for (let k = 0; k < 500; k++) {
      const x = ri(10, W - 11), y = ri(camY | 0, (camY | 0) + VH);
      if (!inside(x, y)) continue;
      if (k % 3 === 0) setCell(x, y, M.LAVA);
      else if (k % 3 === 1) setFire(x, y, 250);
      else setCell(x, y, M.WATER);
    }
    for (let i = 0; i < 60; i++) tick();          // 预热
    let t0 = performance.now();
    for (let i = 0; i < 120; i++) tick();
    R.msTick = +((performance.now() - t0) / 120).toFixed(3);
    t0 = performance.now();
    for (let i = 0; i < 120; i++) simStep();
    R.msSim = +((performance.now() - t0) / 120).toFixed(3);
    t0 = performance.now();
    for (let i = 0; i < 120; i++) updateLight();
    R.msLight = +((performance.now() - t0) / 120).toFixed(3);
    t0 = performance.now();
    for (let i = 0; i < 120; i++) render();
    R.msRender = +((performance.now() - t0) / 120).toFixed(3);
    let fireN = 0, liqN = 0;
    for (let i = 0; i < world.mat.length; i++) { const m = world.mat[i]; if (m === M.FIRE) fireN++; if (MAT_CAT[m] === CAT_LIQ) liqN++; }
    R.fire = fireN; R.liquid = liqN;
    R.biome = biomeAt(player.y).name;
    R.player = { x: Math.round(player.x), y: Math.round(player.y), hp: Math.round(player.hp) };
  } catch (err) { R.error = String((err && err.stack) || err); }
  window.__PERF__ = R;
  document.body.setAttribute('data-perf', JSON.stringify(R));
  return R;
}
window.NOITA.perf = runPerf;

/* 自动游玩：机器人（有敌人时战斗，无敌人时挖掘下降）验证端到端可玩性 */
function botPlay(seedV, ticks) {
  const R = { seed: seedV };
  startGame(seedV);
  const biomesSeen = new Set();
  let maxDepth = 0, damageTaken = 0;
  const startHp = player.hp;
  const log = [];
  let fightTimer = 0, lastKills = 0;
  for (let i = 0; i < ticks && gameState === 'play'; i++) {
    if (perkOpen) { choosePerk(0); }
    /* 找最近敌人 */
    let best = null, bd = 150;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (kills !== lastKills) { lastKills = kills; fightTimer = 0; } else fightTimer++;
    const danger = cellAt(player.x, player.y) === M.LAVA || cellAt(player.x, player.y) === M.ACID ||
      cellAt(player.x, player.y) === M.FIRE || cellAt(player.x, player.y + 6) === M.LAVA;
    if (best && bd < 80 && fightTimer < 200) {
      /* 战斗：换战斗杖，瞄准敌人 */
      if (currentWand !== 0 && wands[0]) currentWand = 0;
      pointer.active = true;
      pointer.x = clamp(best.x - camX, 1, VW - 1);
      pointer.y = clamp(best.y - camY, 1, VH - 1);
      pointer.down = true;
      keys['a'] = best.x < player.x - 6;
      keys['d'] = best.x > player.x + 6;
      keys['w'] = (best.y < player.y - 20 && i % 40 < 6);
      keys['s'] = false;
    } else {
      /* 垂直向下挖掘，并朝下方空气一侧微调以通过蜿蜒竖井 */
      if (currentWand !== 1 && wands[1]) currentWand = 1;
      pointer.active = true;
      pointer.x = clamp(player.x - camX, 1, VW - 1);
      pointer.y = clamp(player.y - camY + 50, 1, VH - 1);
      pointer.down = true;
      const bx = player.x | 0, by = player.y | 0;
      const airL = !IS_SOLID(getM(bx - 5, by + 11)) && !IS_SOLID(getM(bx - 3, by + 9));
      const airR = !IS_SOLID(getM(bx + 5, by + 11)) && !IS_SOLID(getM(bx + 3, by + 9));
      keys['a'] = airL && !airR;
      keys['d'] = airR && !airL;
      keys['w'] = danger || (i % 240 < 4);
      keys['s'] = !danger;
    }
    const hp0 = player.hp;
    tick();
    if (player.hp < hp0) damageTaken += hp0 - player.hp;
    if (player.y > maxDepth) maxDepth = player.y;
    biomesSeen.add(biomeAt(player.y).name);
    if (i % 500 === 0) log.push({ i, x: Math.round(player.x), y: Math.round(player.y), wand: currentWand, casts: castCount, spawns: spawnCount, mana: wands[1] ? Math.floor(wands[1].mana) : -1 });
  }
  R.ticks = ticks;
  R.maxDepth = Math.round(maxDepth);
  R.biomesSeen = [...biomesSeen];
  R.kills = kills;
  R.gold = gold;
  R.dead = gameState === 'dead';
  R.win = gameState === 'win';
  R.cause = player.lastHitBy;
  R.hp = Math.round(player.hp);
  R.damageTaken = Math.round(damageTaken);
  R.log = log;
  return R;
}

function runPlaytest(ticks) {
  const R = { runs: [] };
  try {
    ticks = ticks || 1200;
    for (const s of [777, 20240905, 123456]) R.runs.push(botPlay(s, ticks));
    R.bestDepth = Math.max(...R.runs.map(r => r.maxDepth));
    R.totalKills = R.runs.reduce((a, r) => a + r.kills, 0);
    R.biomesSeen = [...new Set(R.runs.flatMap(r => r.biomesSeen))];
    R.deaths = R.runs.filter(r => r.dead).map(r => r.cause);
  } catch (err) {
    R.error = String((err && err.stack) || err);
  }
  window.__PLAYTEST__ = R;
  document.body.setAttribute('data-playtest', JSON.stringify(R));
  return R;
}
window.NOITA.playtest = runPlaytest;

/* 页面就绪后启动 */
init();
if (/[?&]selftest=1/.test(location.search)) {
  setTimeout(() => { runSelfTest(); }, 0);
} else if (/[?&]play=1/.test(location.search)) {
  const m = location.search.match(/[?&]seed=(\d+)/);
  setTimeout(() => { startGame(m ? (parseInt(m[1], 10) >>> 0) : 20240905); }, 0);
} else if (/[?&]analyze=1/.test(location.search)) {
  setTimeout(() => {
    const m = location.search.match(/[?&]steps=(\d+)/);
    const b = location.search.match(/[?&]biome=(\d+)/);
    const res = analyzeCanvas(m ? parseInt(m[1], 10) : 240, b ? parseInt(b[1], 10) : null);
    window.__ANALYZE__ = res;
    document.body.setAttribute('data-analyze', JSON.stringify(res));
  }, 0);
} else if (/[?&]feature=1/.test(location.search)) {
  setTimeout(() => { runFeatureTest(); }, 0);
} else if (/[?&]playtest=1/.test(location.search)) {
  setTimeout(() => {
    const m = location.search.match(/[?&]ticks=(\d+)/);
    runPlaytest(m ? parseInt(m[1], 10) : 1200);
  }, 0);
} else if (/[?&]perf=1/.test(location.search)) {
  setTimeout(() => {
    const b = location.search.match(/[?&]biome=(\d+)/);
    runPerf(b ? parseInt(b[1], 10) : 1);
  }, 0);
}
