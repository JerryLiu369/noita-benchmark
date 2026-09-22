'use strict';
/* ============================================================================
 * PIXEL ALCHEMIST ——「每像素都被模拟」的魔法地牢（Noita 机制复刻 / 原创素材）
 * 纯前端：index.html + styles.css + game.js，无构建、无依赖、无后端。
 *
 * 分区：
 *   A 基础工具 · 材料表 · 群系调色板 · 世界生成
 *   B 像素物理（密度分层 / 燃烧 / 炼金反应 / 破坏）
 *   C 法杖与法术（牌库时序 · 修饰 · 触发 · 多重施法）
 *   D 实体（玩家 / 敌人 / 掉落 / 粒子 / 伤害与死因）
 *   E 渲染（视差背景 · 材质纹理 · 光照乘法 · 辉光）
 *   F 输入 / HUD / 编辑台 / 音效 / 主循环
 * ========================================================================== */

/* ---------------------------------------------------------------- A · 基础 */
const $ = id => document.getElementById(id);
const canvas = $('game');
const scene = canvas.getContext('2d', { alpha: false });
const VW = canvas.width, VH = canvas.height;          // 内部分辨率 400×225

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function makeRng(s) {
  let t = s >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), 1 | x);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = makeRng(1);
const rint = (a, b) => Math.floor(rng() * (b - a + 1)) + a;
const rflt = (a, b) => rng() * (b - a) + a;

function hash2(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const _sm = t => t * t * (3 - 2 * t);
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = _sm(xf), v = _sm(yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, oct) {
  oct = oct || 3;
  let v = 0, amp = 0.5, f = 1, sum = 0;
  for (let i = 0; i < oct; i++) { v += vnoise(x * f, y * f) * amp; sum += amp; amp *= 0.5; f *= 2; }
  return v / sum;
}
const rgb = (r, g, b) => (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
const hex = s => {
  const n = parseInt(s.slice(1), 16);
  return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255);
};

/* ------------------------------------------------------------- 世界常量 */
const W = 640, H = 4640;            // 世界尺寸（像素）
const SURF = 120, BAND = 800, HMH = 130;   // 地表高度 / 每层高度 / 圣山高度
const BANDS = 5;                    // 矿坑·煤坑·真菌·雪峰·熔岩

const ZONE = new Uint8Array(H);     // 0 地表 1..5 各层 6..9 圣山
function buildZone() {
  for (let y = 0; y < H; y++) {
    let code = 0;
    if (y >= SURF) {
      let t = y - SURF;
      code = 1;
      for (let i = 0; i < BANDS; i++) {
        if (t < BAND) { code = i + 1; break; }
        t -= BAND;
        if (i < BANDS - 1) { if (t < HMH) { code = 6 + i; break; } t -= HMH; }
        else code = 5;
      }
    }
    ZONE[y] = code;
  }
}
buildZone();
const zoneAt = y => ZONE[clamp(y | 0, 0, H - 1)];
const isHM = code => code >= 6;
const biomeOf = code => (code === 0 ? 0 : code <= 5 ? code - 1 : code - 6);
const hmTop = i => SURF + i * (BAND + HMH) + BAND;      // 第 i 座圣山顶
const bandTop = i => SURF + i * (BAND + HMH);
const shaftX = y => clamp(W / 2 + Math.sin(y * 0.013 + 1.7) * 78 + Math.sin(y * 0.0043 + 0.4) * 46, 46, W - 46);

/* --------------------------------------------------------------- 材料表 */
const M = {
  AIR: 0, ROCK: 1, SOIL: 2, SAND: 3, COAL: 4, WOOD: 5, BRICK: 6, STEEL: 7,
  SNOW: 8, ICE: 9, FUNGUS: 10, GRASS: 11, GOLD: 12, HOLY: 13, GLOW: 14,
  MUSH: 15, EMB: 16,
  WATER: 17, OIL: 18, LAVA: 19, BLOOD: 20, ACID: 21, TOXIC: 22,
  STEAM: 23, SMOKE: 24, PGAS: 25, AGAS: 26, FIRE: 27,
  // 扩展：边界与特殊固体
  UNINIT: 28, BOUNDS: 29, BEDROCK: 30, PLATFORM: 31, TORCH: 32, CHEST: 33
};
// 语义别名（复用已有材料 id）
M.STONE = M.ROCK; M.SNOW2 = M.SNOW; M.ICE2 = M.ICE;
M.POISONG = M.PGAS; M.ACIDGAS = M.AGAS; M.VOID = M.HOLY; M.SMoke = M.SMOKE;
const T_AIR = 0, T_SOLID = 1, T_POWDER = 2, T_LIQUID = 3, T_GAS = 4, T_FIRE = 5;
const MCOUNT = 34;
const rnd = () => rng();

const MNAME = new Array(MCOUNT).fill('虚空');
const MTYPE = new Uint8Array(MCOUNT);
const MDENS = new Int16Array(MCOUNT);   // 密度：液体/粉末下沉，气体为负＝上浮
const MHP = new Uint8Array(MCOUNT);     // 耐久：破坏能量逐像素消耗
const MBURN = new Float32Array(MCOUNT); // 可燃性 0..1
const MLIT = new Float32Array(MCOUNT);  // 自发光强度
const MDPS = new Float32Array(MCOUNT);  // 接触伤害 /帧 /像素
const MALPHA = new Uint8Array(MCOUNT);  // 绘制不透明度
const MPAL = [];                        // 默认 4 阶调色 [暗,基,亮,高光]

function defMat(id, name, type, dens, hp, burn, lit, dps, alpha, pal) {
  MNAME[id] = name; MTYPE[id] = type; MDENS[id] = dens; MHP[id] = hp;
  MBURN[id] = burn; MLIT[id] = lit; MDPS[id] = dps; MALPHA[id] = alpha;
  MPAL[id] = new Uint32Array(pal.map(hex));
}
defMat(M.ROCK, '岩石', T_SOLID, 0, 26, 0, 0, 0, 255, ['#2a3040', '#3a4152', '#4a5266', '#5d6579']);
defMat(M.SOIL, '泥土', T_SOLID, 0, 12, 0, 0, 0, 255, ['#33261e', '#473326', '#5b4130', '#6d4e39']);
defMat(M.SAND, '沙砾', T_POWDER, 210, 4, 0, 0, 0, 255, ['#6b5735', '#8d7444', '#a98b56', '#c2a46c']);
defMat(M.COAL, '煤块', T_SOLID, 0, 8, 0.30, 0, 0, 255, ['#17171d', '#242430', '#35353f', '#4c4c58']);
defMat(M.WOOD, '木材', T_SOLID, 0, 10, 0.55, 0, 0, 255, ['#402a1a', '#5a3a24', '#714a31', '#8a6040']);
defMat(M.BRICK, '古砖', T_SOLID, 0, 34, 0, 0, 0, 255, ['#35313f', '#464153', '#565064', '#686178']);
defMat(M.STEEL, '钢铁', T_SOLID, 0, 64, 0, 0, 0, 255, ['#333c49', '#465061', '#586274', '#6d7889']);
defMat(M.SNOW, '积雪', T_POWDER, 140, 3, 0, 0, 0, 255, ['#a8bcd0', '#c6d6e6', '#e2edf7', '#ffffff']);
defMat(M.ICE, '寒冰', T_SOLID, 0, 10, 0, 0, 0, 240, ['#4f7fa8', '#6b9dc4', '#8bb8d9', '#aed4ea']);
defMat(M.FUNGUS, '菌土', T_SOLID, 0, 6, 0.30, 0, 0, 255, ['#2e2436', '#3f3049', '#513d5c', '#644a6e']);
defMat(M.GRASS, '苔草', T_SOLID, 0, 3, 0.75, 0, 0, 255, ['#2b4426', '#3a5a31', '#4a7040', '#608c53']);
defMat(M.GOLD, '金砂', T_POWDER, 380, 6, 0, 0, 0, 255, ['#8a6a1c', '#bf9429', '#e0b33c', '#f8dc74']);
defMat(M.HOLY, '结界之壁', T_SOLID, 0, 255, 0, 0, 0, 255, ['#322c42', '#413a56', '#4f4767', '#5f5679']);
defMat(M.GLOW, '发光菌', T_SOLID, 0, 12, 0.2, 0.62, 0, 255, ['#1f5a55', '#2f8f7f', '#59d6b8', '#aaffec']);
defMat(M.MUSH, '菌伞', T_SOLID, 0, 5, 0.5, 0.10, 0, 255, ['#5c2330', '#7d3341', '#9d4653', '#bd616c']);
defMat(M.EMB, '火把炭芯', T_SOLID, 0, 10, 0, 0.95, 0, 255, ['#662607', '#b04a10', '#ef8a1e', '#ffd67a']);
defMat(M.WATER, '水', T_LIQUID, 100, 0, 0, 0, 0, 196, ['#1b4a7a', '#2b6ba3', '#3f89c8', '#6cb6e8']);
defMat(M.OIL, '石油', T_LIQUID, 78, 0, 0.92, 0, 0, 234, ['#140e0a', '#241a12', '#37281a', '#4d3923']);
defMat(M.LAVA, '熔岩', T_LIQUID, 330, 255, 0, 1.0, 0.55, 255, ['#8f2a05', '#d85a10', '#ff9b21', '#ffe9a6']);
defMat(M.BLOOD, '鲜血', T_LIQUID, 118, 0, 0, 0, 0, 214, ['#4a0d14', '#7a1620', '#9e2530', '#c8515a']);
defMat(M.ACID, '酸液', T_LIQUID, 106, 0, 0, 0, 0.32, 205, ['#4a7a12', '#78b51e', '#a4dc35', '#d9ff7e']);
defMat(M.TOXIC, '毒沼', T_LIQUID, 92, 0, 0, 0, 0.10, 212, ['#5b6114', '#8a9320', '#b2bb35', '#dce664']);
defMat(M.STEAM, '蒸汽', T_GAS, -70, 0, 0, 0.06, 0, 124, ['#6d7d89', '#93a5b1', '#b5c6d1', '#dbe8f0']);
defMat(M.SMOKE, '浓烟', T_GAS, -42, 0, 0, 0.05, 0, 150, ['#1d1f24', '#2c2f36', '#40444d', '#5a5f6a']);
defMat(M.PGAS, '毒气', T_GAS, -55, 0, 0.4, 0.12, 0.13, 142, ['#3f5211', '#63812a', '#87a83f', '#b3d167']);
defMat(M.AGAS, '酸气', T_GAS, -62, 0, 0, 0.14, 0.16, 142, ['#5d7a1e', '#86a832', '#add04f', '#d6f785']);
defMat(M.FIRE, '烈焰', T_FIRE, -34, 0, 0, 1.0, 0.42, 255, ['#c22f06', '#f07317', '#ffab30', '#fff0b4']);
defMat(M.UNINIT, '未初始化', T_AIR, 0, 255, 0, 0, 0, 255, ['#000000', '#000000', '#000000', '#000000']);
defMat(M.BOUNDS, '世界外', T_AIR, 0, 255, 0, 0, 0, 255, ['#05060a', '#05060a', '#05060a', '#05060a']);
defMat(M.BEDROCK, '基岩', T_SOLID, 0, 255, 0, 0, 0, 255, ['#14141c', '#1e1e28', '#2a2a36', '#3a3a48']);
defMat(M.PLATFORM, '木台', T_SOLID, 0, 40, 0.5, 0, 0, 255, ['#4a3320', '#63452b', '#7d5a38', '#96704a']);
defMat(M.TORCH, '火炬', T_SOLID, 0, 10, 0, 0.9, 0, 255, ['#7a3a10', '#b85a18', '#ee9430', '#ffd98a']);
defMat(M.CHEST, '宝箱', T_SOLID, 0, 44, 0, 0, 0, 255, ['#4a3018', '#6b4522', '#8f5f30', '#d8b45a']);

const AIRC = 0;
const isMovable = t => t === T_POWDER || t === T_LIQUID || t === T_GAS || t === T_FIRE;
const extinguisher = m => m === M.WATER || m === M.ICE || m === M.SNOW || m === M.STEAM;

/* ------------------------------------------------------------ 群系 / 调色 */
const BIOS = [
  { name: '矿坑', en: 'MINES · 第一层', amb: [34, 31, 40], bg: ['#1a1622', '#0a0910'],
    rock: ['#2b2831', '#3b3540', '#4b4450', '#5f5764'], soil: ['#33261d', '#463226', '#594030', '#6b4d39'],
    soilM: M.SOIL, rockM: M.ROCK, extra: M.COAL, pool: [M.WATER, M.WATER, M.OIL] },
  { name: '煤坑', en: 'COAL PITS · 第二层', amb: [24, 21, 31], bg: ['#171327', '#08060f'],
    rock: ['#262233', '#352f45', '#443c58', '#554a6d'], soil: ['#2b2119', '#3c2c20', '#4d3928', '#5f4632'],
    soilM: M.SOIL, rockM: M.ROCK, extra: M.COAL, pool: [M.OIL, M.WATER, M.ACID] },
  { name: '真菌洞窟', en: 'FUNGAL CAVERNS · 第三层', amb: [22, 19, 32], bg: ['#1b1428', '#090610'],
    rock: ['#2b2436', '#3a3046', '#493d57', '#5b4e6b'], soil: ['#312840', '#413454', '#514166', '#61507a'],
    soilM: M.FUNGUS, rockM: M.ROCK, extra: M.FUNGUS, pool: [M.WATER, M.TOXIC, M.WATER] },
  { name: '雪峰地底', en: 'SNOWY DEPTHS · 第四层', amb: [44, 56, 74], bg: ['#16222f', '#080d15'],
    rock: ['#39465a', '#4c5c74', '#617590', '#8096b4'], soil: ['#2e3a4c', '#3e4c63', '#4e5d77', '#61708c'],
    soilM: M.ROCK, rockM: M.ROCK, extra: M.ICE, pool: [M.WATER, M.WATER, M.OIL] },
  { name: '熔岩深渊', en: 'THE LABYRINTH · 第五层', amb: [34, 17, 13], bg: ['#231110', '#0b0505'],
    rock: ['#2a1d1c', '#3a2724', '#4b332d', '#604238'], soil: ['#241a1a', '#332320', '#422e28', '#553c31'],
    soilM: M.ROCK, rockM: M.ROCK, extra: M.EMB, pool: [M.LAVA, M.LAVA, M.ACID] }
];
const HM_DEF = { name: '圣山', en: 'HOLY MOUNTAIN · 安全屋', amb: [64, 56, 92], bg: ['#1d1830', '#0b0914'] };
const SURF_DEF = { name: '山麓雪原', en: 'SURFACE · 起点', amb: [206, 202, 226], bg: ['#3b3354', '#6b5570'] };

const ZONE_COUNT = 10;                       // 0 地表 / 1..5 层 / 6..9 圣山
const ZPAL = [];                             // ZPAL[code][mat] -> Uint32Array(4)
const ZAMB = [];                             // 环境光 [r,g,b]
const ZBG = [];                              // 背景渐变 [上,下]
const ZNAME = [];
function buildPalettes() {
  for (let code = 0; code < ZONE_COUNT; code++) {
    const bio = BIOS[biomeOf(code)];
    const pal = [];
    for (let m = 0; m < MCOUNT; m++) pal[m] = MPAL[m];
    if (code === 0) {                         // 地表
      pal[M.ROCK] = new Uint32Array(['#39404f', '#4a5262', '#5d6577', '#727b8e'].map(hex));
      pal[M.SOIL] = new Uint32Array(['#3b3346', '#4d4459', '#5f556b', '#73677f'].map(hex));
      pal[M.SNOW] = MPAL[M.SNOW];
      ZAMB[code] = SURF_DEF.amb.slice(); ZBG[code] = SURF_DEF.bg; ZNAME[code] = SURF_DEF;
    } else if (isHM(code)) {
      pal[M.ROCK] = new Uint32Array(['#2f2a3e', '#3e3852', '#4d4566', '#5e5579'].map(hex));
      pal[M.SOIL] = pal[M.ROCK];
      ZAMB[code] = HM_DEF.amb.slice(); ZBG[code] = HM_DEF.bg; ZNAME[code] = HM_DEF;
    } else {
      pal[M.ROCK] = new Uint32Array(bio.rock.map(hex));
      pal[M.SOIL] = new Uint32Array(bio.soil.map(hex));
      if (bio.soilM === M.FUNGUS) pal[M.FUNGUS] = new Uint32Array(['#332a44', '#443757', '#54446a', '#66527f'].map(hex));
      if (bio.rockM === M.ROCK && bio.extra === M.ICE) pal[M.ROCK] = new Uint32Array(bio.rock.map(hex));
      ZAMB[code] = bio.amb.slice(); ZBG[code] = bio.bg; ZNAME[code] = bio;
    }
    ZPAL[code] = pal;
  }
}

/* ------------------------------------------------------------ 世界数据 */
let cells = new Uint8Array(W * H);
let life = new Uint8Array(W * H);      // 火焰/气体等动态材料寿命
let seed = 1, frame = 0;

const inW = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
function getM(x, y) {
  if (x < 0 || x >= W || y < 0) return M.HOLY;
  if (y >= H) return M.HOLY;
  return cells[y * W + x];
}
function setM(x, y, m) { if (inW(x, y)) cells[y * W + x] = m; }
function setLife(x, y, v) { if (inW(x, y)) life[y * W + x] = v; }
function dig(x, y) { if (inW(x, y)) { cells[y * W + x] = AIRC; life[y * W + x] = 0; } }
function swapM(x1, y1, x2, y2) {
  if (!inW(x1, y1) || !inW(x2, y2)) return;
  const i1 = y1 * W + x1, i2 = y2 * W + x2;
  const t = cells[i1]; cells[i1] = cells[i2]; cells[i2] = t;
  const l = life[i1]; life[i1] = life[i2]; life[i2] = l;
}
const solidAt = (x, y) => MTYPE[getM(x, y)] === T_SOLID;

/* ---------------------------------------------------------- 世界生成 */
let hmRooms = [], chests = [], dropItems = [], pickupsW = [];
let spawnPt = { x: W / 2, y: 40 };

function groundLine(x) {
  return Math.round(SURF - 14 + fbm(x * 0.021 + 5.2, 3.3, 3) * 30 - 12);
}

function genWorld(sd) {
  seed = sd >>> 0;
  rng = makeRng(seed);
  cells = new Uint8Array(W * H);
  life = new Uint8Array(W * H);
  hmRooms = []; chests = []; dropItems = []; pickupsW = [];
  const ox = (seed % 9973) * 0.0137 + 3.1, oy = (seed % 7919) * 0.0211 + 7.7;

  /* 1. 基础岩层与洞穴 */
  for (let y = 0; y < H; y++) {
    const code = ZONE[y], hm = isHM(code), bi = biomeOf(code), bio = BIOS[bi];
    const rowOff = y * 0.026 + oy;
    for (let x = 0; x < W; x++) {
      let m = AIRC;
      if (y < SURF) {
        const gy = groundLine(x);
        if (y >= gy) m = y < gy + 4 ? M.SNOW : (y < gy + 16 ? M.SOIL : M.ROCK);
      } else if (hm) {
        m = M.ROCK;
      } else {
        const n = fbm(x * 0.022 + ox, rowOff, 4);
        const cav = fbm(x * 0.0092 - oy, y * 0.0113 + ox, 3);
        let solid = n < 0.55;
        if (cav > 0.715) solid = false;
        if (cav < 0.235) solid = true;
        if (solid) {
          const v1 = fbm(x * 0.058 + ox * 1.7, y * 0.061, 2);
          const v2 = fbm(x * 0.034, y * 0.047 + oy * 1.3, 2);
          const v3 = hash2(x * 3 + 11, y * 3 + 7);
          m = v1 < 0.46 ? bio.soilM : bio.rockM;
          if (bio.extra === M.COAL && v2 > 0.60) m = M.COAL;
          else if (bio.extra === M.FUNGUS && v2 > 0.66) m = M.FUNGUS;
          else if (bio.extra === M.ICE && v2 > 0.70) m = M.ICE;
          else if (bio.extra === M.EMB && v2 > 0.735) m = M.EMB;
          else if (v2 > 0.55 && v2 < 0.60 && bi >= 1) m = M.COAL;
          if (v3 > 0.9975 - bi * 0.00035) m = M.GOLD;            // 金矿脉（粉末）
        }
      }
      if (y >= H - 10 || x < 12 || x > W - 13) m = M.HOLY;       // 世界边界
      cells[y * W + x] = m;
    }
  }

  /* 2. 保证贯通的蜿蜒竖井（圣山段由房间自己开口） */
  for (let y = SURF + 6; y < H - 12; y++) {
    if (isHM(ZONE[y])) continue;
    const cx = shaftX(y), r = 9 + 7 * Math.abs(Math.sin(y * 0.021 + 2));
    for (let x = (cx - r) | 0; x <= (cx + r) | 0; x++) {
      if (x < 14 || x > W - 15) continue;
      const i = y * W + x;
      if (cells[i] !== M.HOLY) { cells[i] = AIRC; life[i] = 0; }
    }
  }

  /* 3. 雪带：裸岩顶面结霜 / 冰锥 */
  for (let y = bandTop(3); y < Math.min(H - 12, bandTop(3) + BAND); y++) {
    for (let x = 14; x < W - 15; x++) {
      const i = y * W + x;
      if (cells[i] === M.ROCK) {
        let air = false;
        for (let k = 1; k <= 3; k++) if (getM(x, y - k) === AIRC) { air = true; break; }
        if (air && hash2(x, y) > 0.35) cells[i] = hash2(x + 9, y) > 0.72 ? M.ICE : M.SNOW;
      }
    }
  }

  /* 4. 圣山房间 */
  for (let i = 0; i < 4; i++) hmRooms.push(buildHolyMountain(i));

  /* 5. 液体池塘 */
  const poolCount = [5, 6, 6, 5, 9];
  for (let bi = 0; bi < BANDS; bi++) {
    const top = bandTop(bi), bio = BIOS[bi];
    for (let p = 0; p < poolCount[bi]; p++) {
      const deep = bi === 4;
      const rx = rint(deep ? 26 : 16, deep ? 78 : 46), ry = rint(7, deep ? 24 : 17);
      const cx = rint(40 + rx, W - 40 - rx), cy = top + rint(70, BAND - 70);
      const mat = bio.pool[rint(0, bio.pool.length - 1)];
      for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
        if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) continue;
        const x = cx + dx, y = cy + dy;
        if (y < top + 8 || y > top + BAND - 8 || x < 18 || x > W - 19) continue;
        const i = y * W + x;
        if (cells[i] === M.HOLY) continue;
        cells[i] = dy > -ry * 0.55 ? mat : AIRC;
        life[i] = 0;
      }
    }
  }

  /* 6. 群系装饰：木支撑 / 火把 / 菌类 / 雪堆 */
  decorate();

  /* 7. 出生点与实体 */
  spawnPt = { x: 320, y: groundLine(320) - 12 };
  // 挖出安全出生腔，避免玩家嵌进地形
  (function () {
    var cx = spawnPt.x | 0;
    var gy = groundLine(cx);
    for (var dx = -13; dx <= 13; dx++) for (var dy = -22; dy <= 4; dy++) {
      var x = cx + dx, y = gy + dy;
      if (inW(x, y) && cells[y * W + x] !== M.HOLY) { cells[y * W + x] = AIRC; life[y * W + x] = 0; }
    }
    // 腔底铺平
    for (dx = -13; dx <= 13; dx++) {
      var x2 = cx + dx;
      if (inW(x2, gy + 4)) { cells[(gy + 4) * W + x2] = M.SOIL; }
      if (inW(x2, gy + 5)) { cells[(gy + 5) * W + x2] = M.SOIL; }
    }
    spawnPt.y = gy + 4;
  })();
  spawnEntities();
  return true;
}

function buildHolyMountain(i) {
  const y0 = hmTop(i), y1 = y0 + HMH;
  const L = 44, R = W - 44;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x;
    if (cells[idx] === M.HOLY && x > 12 && x < W - 13) cells[idx] = M.ROCK;
  }
  // 房间主体挖空
  for (let y = y0 + 14; y < y1 - 12; y++) for (let x = L; x < R; x++) cells[y * W + x] = AIRC;
  // 结界外墙
  for (let y = y0 + 8; y < y1 - 6; y++) for (let x = L - 7; x < L; x++) cells[y * W + x] = M.HOLY;
  for (let y = y0 + 8; y < y1 - 6; y++) for (let x = R; x < R + 7; x++) cells[y * W + x] = M.HOLY;
  for (let x = L - 7; x < R + 7; x++) {
    for (let y = y0 + 7; y < y0 + 14; y++) cells[y * W + x] = M.HOLY;
    for (let y = y1 - 12; y < y1 - 6; y++) cells[y * W + x] = M.HOLY;
  }
  // 砖面装饰
  for (let y = y0 + 14; y < y0 + 17; y++) for (let x = L; x < R; x++) cells[y * W + x] = M.BRICK;
  for (let y = y1 - 15; y < y1 - 12; y++) for (let x = L; x < R; x++) cells[y * W + x] = M.BRICK;
  for (let y = y0 + 17; y < y1 - 15; y++) {
    for (let x = L; x < L + 3; x++) cells[y * W + x] = M.BRICK;
    for (let x = R - 3; x < R; x++) cells[y * W + x] = M.BRICK;
  }
  // 发光符文条 & 火盆
  const ry = y1 - 18;
  for (let x = L + 8; x < R - 8; x++) if ((x % 7) < 3) cells[ry * W + x] = M.GLOW;
  for (const bx of [L + 26, R - 26]) {
    for (let y = y1 - 24; y < y1 - 15; y++) cells[y * W + bx] = M.EMB;
    cells[(y1 - 25) * W + bx] = M.FIRE; setLife(bx, y1 - 25, 255);
    cells[(y1 - 25) * W + bx - 1] = M.FIRE; setLife(bx - 1, y1 - 25, 240);
  }
  // 顶/底开口（对准竖井）
  const cxT = shaftX(y0 + 4), cxB = shaftX(y1 + 6);
  for (let y = y0; y < y0 + 14; y++) for (let x = (cxT - 11) | 0; x <= (cxT + 11) | 0; x++)
    if (x > 13 && x < W - 14) cells[y * W + x] = AIRC;
  for (let y = y1 - 12; y < y1; y++) for (let x = (cxB - 11) | 0; x <= (cxB + 11) | 0; x++)
    if (x > 13 && x < W - 14) cells[y * W + x] = AIRC;
  // 生命之泉
  const fx = L + 40;
  for (let y = y1 - 26; y < y1 - 15; y++) for (let x = fx - 5; x <= fx + 5; x++)
    if (y > y1 - 17) cells[y * W + x] = M.WATER;
  return { x0: L, x1: R, y0, y1, index: i, used: false, fountain: { x: fx, y: y1 - 19 } };
}

function decorate() {
  const put = (x, y, m) => { if (inW(x, y) && cells[y * W + x] !== M.HOLY) { cells[y * W + x] = m; life[y * W + x] = 0; } };
  const openFloor = (x, y) => getM(x, y) === AIRC && MTYPE[getM(x, y + 1)] === T_SOLID;
  // 矿坑：木质支撑梁 + 火把
  for (let k = 0; k < 26; k++) {
    const x = rint(40, W - 44), y = rint(bandTop(0) + 30, bandTop(0) + BAND - 40);
    let ceil = -1;
    for (let d = 1; d <= 70; d++) if (MTYPE[getM(x, y - d)] === T_SOLID) { ceil = d; break; }
    if (ceil < 18) continue;
    let clear = true;
    for (let d = 0; d < ceil; d++) if (getM(x, y - d) !== AIRC && d > 2) { clear = false; break; }
    if (!clear) continue;
    const h = ceil - 2;
    for (let d = 3; d < h; d++) { put(x, y - d, M.WOOD); put(x + 1, y - d, M.WOOD); }
    const bw = rint(9, 20);
    for (let b = -bw; b <= bw; b++) put(x + b, y - h + 1, M.WOOD);
    put(x + 3, y - Math.min(h - 6, 12), M.EMB);
    put(x + 3, y - Math.min(h - 6, 12) - 1, M.FIRE); setLife(x + 3, y - Math.min(h - 6, 12) - 1, 255);
  }
  // 真菌层：菌伞与发光蘑菇
  for (let k = 0; k < 150; k++) {
    const x = rint(30, W - 32), y = rint(bandTop(2) + 20, bandTop(2) + BAND - 20);
    if (!openFloor(x, y)) continue;
    const glow = rng() < 0.34;
    const r = rint(3, glow ? 5 : 8);
    for (let dx = -r; dx <= r; dx++) for (let dy = -Math.round(r * 0.7); dy <= 0; dy++)
      if (dx * dx / (r * r) + dy * dy / ((r * 0.7) * (r * 0.7)) <= 1) put(x + dx, y + dy - 1, glow ? M.GLOW : M.MUSH);
    if (glow) for (let d = 1; d <= rint(3, 7); d++) put(x, y - d, M.GLOW);
  }
  // 雪层：雪堆与冰锥
  for (let k = 0; k < 170; k++) {
    const x = rint(30, W - 32), y = rint(bandTop(3) + 20, bandTop(3) + BAND - 20);
    if (!openFloor(x, y)) continue;
    const w = rint(4, 14);
    for (let dx = -w; dx <= w; dx++) for (let d = 0; d < Math.max(1, Math.round((1 - Math.abs(dx) / w) * rint(2, 6))); d++)
      if (getM(x + dx, y + d) === AIRC) put(x + dx, y + d, M.SNOW);
  }
  for (let k = 0; k < 90; k++) {
    const x = rint(30, W - 32), y = rint(bandTop(3) + 20, bandTop(3) + BAND - 20);
    if (!(getM(x, y) === AIRC && MTYPE[getM(x, y - 1)] === T_SOLID)) continue;
    const len = rint(5, 22);
    for (let d = 0; d < len; d++) if (getM(x, y + d) === AIRC) put(x, y + d, M.ICE);
  }
  // 熔岩层：炭芯脉 & 黄金沙丘
  for (let k = 0; k < 90; k++) {
    const x = rint(30, W - 32), y = rint(bandTop(4) + 20, bandTop(4) + BAND - 30);
    if (openFloor(x, y)) {
      const w = rint(3, 12);
      for (let dx = -w; dx <= w; dx++) if (rng() < 0.8) put(x + dx, y, hash2(dx, x) > 0.5 ? M.GOLD : M.SAND);
    }
  }
  // 每层一些散落金币粉
  for (let bi = 0; bi < BANDS; bi++) {
    for (let k = 0; k < 40; k++) {
      const x = rint(30, W - 32), y = rint(bandTop(bi) + 20, bandTop(bi) + BAND - 20);
      if (!openFloor(x, y)) continue;
      const w = rint(2, 7);
      for (let dx = -w; dx <= w; dx++) if (rng() < 0.75) put(x + dx, y, M.GOLD);
    }
  }
}

// ============================ B. 像素物理模拟 ============================
var SIMX0 = 0, SIMX1 = 0, SIMY0 = 0, SIMY1 = 0;
function getLife(x, y) { if (!inW(x, y)) return 0; var i = y * W + x; return i < life.length ? life[i] : 0; }
function SOL(m) { return MTYPE[m] === T_SOLID; }          // 是否固体材料
function isLiquidM(m) { var t = MTYPE[m]; return t === T_LIQUID; }

// 破坏一个像素（带硬度/抗性），cause 用于死因
function dig(x, y, dmg, cause) {
  if (!inW(x, y)) return false;
  var m = getM(x, y);
  if (m === M.AIR) return false;
  if (m === M.BEDROCK || m === M.HOLY || m === M.UNINIT || m === M.BOUNDS) return false;
  if (MTYPE[m] === T_FIRE) { setM(x, y, M.SMOKE); setLife(x, y, 16); return true; }
  var hp = MHP[m];
  if (hp >= 250 && m !== M.CHEST) return false;
  var l = getLife(x, y);
  if (l === 0) l = hp;          // life 作为耐久池：首次受击时按 MHP 初始化
  l -= dmg;
  if (l <= 0) {
    // 溅落碎屑
    if (MDPS[m] > 0 && rnd() < 0.16) spawnChip(x, y, m);
    if (m === M.ICE || m === M.ICE2 || m === M.SNOW || m === M.SNOW2) {
      setM(x, y, M.WATER); setLife(x, y, 0);
    } else if (m === M.COAL || m === M.OIL) {
      setM(x, y, M.FIRE); setLife(x, y, 40 + (rnd() * 40 | 0));
    } else {
      setM(x, y, M.AIR); setLife(x, y, 0);
    }
    if (cause === 'player' && rnd() < 0.25) addShake(0.6);
    return true;
  }
  setLife(x, y, l);
  return false;
}

// 把某个液体/气体源整体挖出（用于生成液体池时保留 life）
function setCell(x, y, m, lf) { setM(x, y, m); setLife(x, y, lf === undefined ? MHP[m] : lf); }

var DI4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function puff(x, y, n, kind) {
  var cols = kind === 'acid' ? ['#a4dc35', '#78b51e', '#d9ff7e'] : ['#b5c6d1', '#dbe8f0', '#93a5b1'];
  for (var i = 0; i < n; i++) spawnPart(x + 0.5, y + 0.5, (rnd() - 0.5) * 0.8, -rnd() * 0.6, cols[rnd() * cols.length | 0], 18 + rnd() * 16, -0.01);
}

// ---------- 反应表 ----------
function react(x, y, m, o) {
  // 熔岩 + 水/雪/血/酸 -> 石 + 蒸汽
  if (m === M.LAVA) {
    if (o === M.WATER || o === M.SNOW || o === M.BLOOD || o === M.ACID) {
      setM(x, y, M.STEAM); setLife(x, y, 140);
      setM(px1, py1, M.STONE); setLife(px1, py1, 0);
      puff(x, y, 3, 'steam');
      if (rnd() < 0.15) sfx('hiss');
      return true;
    }
    if (o === M.OIL || o === M.TOXIC) {
      setM(px1, py1, M.FIRE); setLife(px1, py1, 60);
      setM(x, y, M.FIRE); setLife(x, y, 60);
      return true;
    }
  }
  // 酸腐蚀一切（除酸自身/气体/结界）
  if (m === M.ACID) {
    var tm = o;
    if (tm !== M.AIR && tm !== M.ACID && tm !== M.HOLY && tm !== M.BEDROCK
        && tm !== M.STEAM && tm !== M.SMOKE && tm !== M.PGAS && tm !== M.AGAS && tm !== M.FIRE) {
      if (MHP[tm] >= 250) return false;
      if (MTYPE[tm] === T_LIQUID || MTYPE[tm] === T_GAS) return false;
      setM(px1, py1, M.ACID); setLife(px1, py1, 60);
      setM(x, y, M.SMOKE); setLife(x, y, 30);
      puff(x, y, 1, 'acid');
      if (rnd() < 0.12) sfx('hiss');
      return true;
    }
  }
  // 火焰点燃可燃物（火焰沿可燃物蔓延）
  if (m === M.FIRE) {
    if (MBURN[o] > 0 && MHP[o] < 250 && rnd() < 0.5) {
      setM(px1, py1, M.FIRE); setLife(px1, py1, 30 + rnd() * 50 | 0);
      return true;
    }
    if (o === M.OIL && rnd() < 0.8) { setM(px1, py1, M.FIRE); setLife(px1, py1, 50); return true; }
  }
  // 毒气遇火燃烧消失
  if (m === M.PGAS && o === M.FIRE) { setM(x, y, M.SMOKE); setLife(x, y, 20); setM(px1, py1, M.SMOKE); setLife(px1, py1, 20); return true; }
  // 水 + 火 = 蒸汽（火焰遇水熄灭）
  if (m === M.WATER && o === M.FIRE) { setM(px1, py1, M.SMOKE); setLife(px1, py1, 16); setM(x, y, M.STEAM); setLife(x, y, 90); return true; }
  if (m === M.FIRE && (o === M.WATER || o === M.STEAM)) { setM(x, y, M.SMOKE); setLife(x, y, 14); return true; }
  return false;
}

var px1 = 0, py1 = 0;
// 邻居交互（对角优先，用于酸/火/熔岩扩散反应）
function tryReact(x, y, m) {
  var dirs = DI4;
  for (var k = 0; k < 4; k++) {
    var d = dirs[k];
    px1 = x + d[0]; py1 = y + d[1];
    var o = getM(px1, py1);
    if (o === M.UNINIT || o === M.BOUNDS || o === M.HOLY) continue;
    if (react(x, y, m, o)) return;
  }
}

// ---------- 主模拟 ----------
var simFrame = 0;
function updateMaterials() {
  simFrame++;
  var x, y, m, l, t;
  // 向上扫描，让位移在同一帧内连锁
  for (y = SIMY1 - 1; y >= SIMY0; y--) {
    var lrow = y * W;
    // 隔行错位，减少方向偏差
    var xs = ((y + simFrame) & 1);
    for (var xi = SIMX0; xi < SIMX1; xi++) {
      x = xi + xs;
      if (x >= SIMX1) continue;
      var i = lrow + x;
      if (i >= cells.length) continue;
      m = cells[i];
      if (m === M.AIR || m === M.UNINIT || m === M.BOUNDS || m === M.BEDROCK || m === M.CHEST || m === M.HOLY) continue;
      t = MTYPE[m];
      l = life[i];

      if (t === T_FIRE) { // 火焰
        if (l <= 1) { cells[i] = M.SMOKE; life[i] = 18 + (rnd() * 16 | 0); continue; }
        life[i] = l - 1;
        tryReact(x, y, m);
        if (rnd() < 0.35) {
          var ax = x + (rnd() * 3 | 0) - 1, ay = y - 1;
          if (getM(ax, ay) === M.AIR) { setM(ax, ay, M.FIRE); setLife(ax, ay, 8 + (rnd() * 22 | 0)); }
        }
        if (rnd() < 0.1) spawnEmber(x, y);
        continue;
      }
      if (m === M.LAVA) { // 熔岩：缓慢流动 + 反应 + 火光
        if (rnd() < 0.06) spawnEmber(x, y);
        tryReact(x, y, m);
        liquidMove(x, y, 0.35);
        continue;
      }
      if (t === T_LIQUID) { // 液体：水/油/血/酸/毒沼
        tryReact(x, y, m);
        liquidMove(x, y, 0.85);
        continue;
      }
      if (t === T_POWDER) { // 粉末：沙/雪/金砂
        powMove(x, y, m);
        continue;
      }
      if (t === T_GAS) { // 气体：蒸汽/浓烟/毒气
        gasMove(x, y, m, l, i);
        continue;
      }
      if (t === T_SOLID) { // 固体：燃烧/融化/生长
        solidTick(x, y, m, i);
        continue;
      }
    }
  }
}

function liquidMove(x, y, speed) {
  if (rnd() > speed) return;
  var m = getM(x, y);
  var dens = MDENS[m];
  var below = getM(x, y + 1);
  var bl = MTYPE[below];
  // 下落：空气 / 气体 / 更轻的液体
  if (below === M.AIR || bl === T_GAS || (bl === T_LIQUID && MDENS[below] < dens)) {
    swapM(x, y, x, y + 1); return;
  }
  // 被更重的液体压上去（密度分层：油浮水面、血沉水下）
  if (bl === T_LIQUID && MDENS[below] > dens) { swapM(x, y, x, y + 1); return; }
  // 左右扩散
  var dir = rnd() < 0.5 ? -1 : 1;
  var side = getM(x + dir, y);
  var sm = MTYPE[side];
  if (side === M.AIR || sm === T_GAS || (sm === T_LIQUID && MDENS[side] < dens)) { swapM(x, y, x + dir, y); return; }
  var side2 = getM(x - dir, y);
  var s2m = MTYPE[side2];
  if (side2 === M.AIR || s2m === T_GAS || (s2m === T_LIQUID && MDENS[side2] < dens)) { swapM(x, y, x - dir, y); return; }
  // 斜下（堆积坡度）
  var dg = getM(x + dir, y + 1);
  var dgm = MTYPE[dg];
  if (dg === M.AIR || dgm === T_GAS || (dgm === T_LIQUID && MDENS[dg] < dens)) { swapM(x, y, x + dir, y + 1); return; }
}

function powMove(x, y, m) {
  if (rnd() < 0.15) return;
  var below = getM(x, y + 1);
  var bm = MTYPE[below];
  if (below === M.AIR || bm === T_GAS) { swapM(x, y, x, y + 1); return; }
  if (bm === T_LIQUID) { // 沉入液体（密度够大才下沉）
    if (MDENS[m] > MDENS[below]) { swapM(x, y, x, y + 1); }
    return;
  }
  if (bm === T_POWDER || bm === T_SOLID || bm === T_FIRE) {
    if (bm === T_FIRE) return;
    // 堆积坡：滑向两侧低处
    var dir = rnd() < 0.5 ? -1 : 1;
    if (getM(x + dir, y) === M.AIR && (getM(x + dir, y + 1) !== M.AIR || MTYPE[getM(x + dir, y + 1)] !== T_POWDER)) {
      if (MTYPE[getM(x + dir, y + 1)] !== T_SOLID) { swapM(x, y, x + dir, y); return; }
    }
    if (getM(x - dir, y) === M.AIR && MTYPE[getM(x - dir, y + 1)] !== T_SOLID) { swapM(x, y, x - dir, y); return; }
    return;
  }
}

function gasMove(x, y, m, l, i) {
  if (l <= 1) { cells[i] = M.AIR; life[i] = 0; return; }
  life[i] = l - 1;
  // 上浮（穿过空气与更重的液体）
  var up = getM(x, y - 1);
  var um = MTYPE[up];
  if (up === M.AIR || um === T_LIQUID) { swapM(x, y, x, y - 1); return; }
  // 横向飘散
  var dir = rnd() < 0.5 ? -1 : 1;
  var side = getM(x + dir, y);
  var sm = MTYPE[side];
  if (side === M.AIR || sm === T_LIQUID) { swapM(x, y, x + dir, y); return; }
  // 蒸汽冷却凝结成水
  if (m === M.STEAM && l < 34 && rnd() < 0.03) { cells[i] = M.WATER; life[i] = 0; }
}

function plantTick(x, y, m, i) {
  // 草/真菌缓慢生长蔓延
  if (m === M.GRASS || m === M.FUNGUS) {
    if (rnd() < 0.002) {
      var dx = x + (rnd() * 3 | 0) - 1, dy = y + (rnd() * 3 | 0) - 1;
      if (getM(dx, dy) === M.AIR && MTYPE[getM(dx, y)] === T_SOLID) { setM(dx, dy, m); }
    }
  }
  if (MBURN[m] > 0 && rnd() < 0.004) { // 邻近火源点燃
    if (getM(x + 1, y) === M.FIRE || getM(x - 1, y) === M.FIRE || getM(x, y - 1) === M.FIRE || getM(x, y + 1) === M.FIRE) {
      cells[i] = M.FIRE; life[i] = 30 + (rnd() * 40 | 0);
    }
  }
}

function solidTick(x, y, m, i) {
  // 植被生长/引燃
  if (m === M.GRASS || m === M.FUNGUS) { plantTick(x, y, m, i); return; }
  // 可燃固体：被火点燃（火焰沿可燃物蔓延）
  if (MBURN[m] > 0) {
    if (getM(x + 1, y) === M.FIRE || getM(x - 1, y) === M.FIRE || getM(x, y - 1) === M.FIRE || getM(x, y + 1) === M.FIRE) {
      if (rnd() < 0.06) { cells[i] = M.FIRE; life[i] = 30 + (rnd() * 50 | 0); }
    }
    return;
  }
  // 冰雪融化（旁有火/熔岩）
  if (m === M.ICE || m === M.ICE2 || m === M.SNOW || m === M.SNOW2) {
    if (getM(x + 1, y) === M.FIRE || getM(x - 1, y) === M.FIRE || getM(x, y + 1) === M.LAVA) {
      if (rnd() < 0.1) { cells[i] = M.WATER; life[i] = 0; }
    }
  }
  // 煤层受热转化为火
  if (m === M.COAL) {
    if (getM(x + 1, y) === M.LAVA || getM(x - 1, y) === M.LAVA || getM(x, y + 1) === M.LAVA) { if (rnd() < 0.05) { cells[i] = M.FIRE; life[i] = 60; } }
    if (getM(x + 1, y) === M.FIRE || getM(x - 1, y) === M.FIRE) { if (rnd() < 0.03) { cells[i] = M.FIRE; life[i] = 60; } }
  }
  // 火把炭芯持续产生火焰
  if (m === M.EMB || m === M.TORCH) {
    if (getM(x, y - 1) === M.AIR && rnd() < 0.06) { setM(x, y - 1, M.FIRE); setLife(x, y - 1, 40 + (rnd() * 40 | 0)); }
  }
}
// ============================ C. 法杖与法术 ============================
// 法术定义: {id,name,desc,t:'proj'|'mod'|'tri'|'pass',dmg,speed,color,rad,life,cast,mana,cnt}
var SPELLS = [
  { id: 'spark',  name: '火花弹',   t: 'proj', dmg: 6,  speed: 3.6, color: '#ffe9a8', rad: 1.6, life: 45, cast: 0, mana: 6,  desc: '基础弹体，快速' },
  { id: 'bolt',   name: '魔法箭',   t: 'proj', dmg: 14, speed: 5.2, color: '#9ad6ff', rad: 2.2, life: 60, cast: 0, mana: 14, desc: '高穿透力单体弹' },
  { id: 'fire',   name: '火焰投射', t: 'proj', dmg: 9,  speed: 2.8, color: '#ff9440', rad: 2.4, life: 40, cast: 0, mana: 18, desc: '命中点燃，溅射火焰', fx: 'fire' },
  { id: 'bomb',   name: '爆裂法球', t: 'proj', dmg: 30, speed: 2.4, color: '#ff6a4a', rad: 3.6, life: 80, cast: 0, mana: 40, desc: '爆炸大范围', fx: 'boom' },
  { id: 'saw',    name: '锯刃轮',   t: 'proj', dmg: 7,  speed: 4.4, color: '#dfe6ef', rad: 2.6, life: 70, cast: 0, mana: 16, desc: '持续切割，多次判定', fx: 'saw' },
  { id: 'disc',   name: '回旋盘',   t: 'proj', dmg: 11, speed: 3.0, color: '#b6a8ff', rad: 3.0, life: 90, cast: 0, mana: 22, desc: '来回穿刺', fx: 'bounce' },
  { id: 'spore',  name: '孢子团',   t: 'proj', dmg: 5,  speed: 2.2, color: '#8dff9a', rad: 2.4, life: 55, cast: 0, mana: 12, desc: '低速，命中散播毒云', fx: 'poison' },
  { id: 'ice',    name: '冰晶镖',   t: 'proj', dmg: 12, speed: 4.6, color: '#a8e8ff', rad: 2.0, life: 55, cast: 0, mana: 15, desc: '命中冻结减速', fx: 'ice' },
  { id: 'homing', name: '追踪弹',   t: 'proj', dmg: 8,  speed: 3.0, color: '#ff8ad8', rad: 2.0, life: 90, cast: 0, mana: 24, desc: '缓慢追踪敌人', fx: 'home' },
  { id: 'dig',    name: '挖掘射线', t: 'proj', dmg: 3,  speed: 6.0, color: '#ffd76e', rad: 2.8, life: 30, cast: 0, mana: 20, desc: '破坏地形', fx: 'dig' },
  // 修饰
  { id: 'dmgUp',  name: '伤害强化', t: 'mod', mult: 1.9, mana: 6,  desc: '伤害 ×1.9' },
  { id: 'speedUp',name: '速度强化', t: 'mod', sp: 1.6, mana: 5,  desc: '弹速 ×1.6' },
  { id: 'big',    name: '巨型化',   t: 'mod', size: 2.1, mana: 8, desc: '弹体尺寸 ×2.1' },
  { id: 'pierce', name: '穿透',     t: 'mod', pierce: 4, mana: 12, desc: '可穿透 4 个目标' },
  { id: 'bounce', name: '弹射',     t: 'mod', bounce: 5, mana: 10, desc: '撞击弹射 5 次' },
  { id: 'explosive', name: '爆炸弹', t: 'mod', boom: 1, mana: 22, desc: '命中时爆炸' },
  { id: 'heavy',  name: '沉重化',   t: 'mod', grav: 2.4, mana: 4, desc: '重力 ×2.4（抛物线）' },
  { id: 'scatter',name: '散射',     t: 'mod', spread: 0.28, mana: 9, desc: '增加散布角' },
  // 多重施法
  { id: 'triple', name: '三重施法', t: 'tri', n: 3, mana: 14, desc: '同时施放 3 发' },
  { id: 'double', name: '二重施法', t: 'tri', n: 2, mana: 8,  desc: '同时施放 2 发' },
  { id: 'burst',  name: '五重施法', t: 'tri', n: 5, mana: 30, desc: '同时施放 5 发' },
  // 触发器（载荷 = 紧随其后的弹体）
  { id: 'trigTimer', name: '定时触发', t: 'trig', n: 3, dmg: 5, speed: 3.2, color: '#9ad6ff', rad: 2.2, life: 34, mana: 14, fx: 'trigTimer', desc: '载荷在 0.55s 后迸出 3 发' },
  { id: 'trigBoom',  name: '爆裂触发', t: 'trig', n: 4, dmg: 6, speed: 3.6, color: '#ff9ad8', rad: 2.4, life: 90, mana: 16, fx: 'trigBoom',  desc: '载荷在命中时炸出 4 发' },
];
var SPELL_BY_ID = {}; SPELLS.forEach(function (s) { SPELL_BY_ID[s.id] = s; });

function mkWand(o) {
  var w = {
    name: o.name || '无名杖',
    capacity: o.capacity || 5,
    shuffle: !!o.shuffle,
    spellsPerCast: o.spellsPerCast || 1,
    castDelay: o.castDelay || 0.16,
    recharge: o.recharge || 0.5,
    manaMax: o.manaMax || 120,
    manaCharge: o.manaCharge || 12,
    spread: o.spread || 0.05,
    slots: [],
    mana: o.manaMax || 120,
    cd: 0, rcd: 0, ptr: 0,
  };
  for (var i = 0; i < w.capacity; i++) w.slots.push(null);
  return w;
}
function wandFill(w, ids) {
  for (var i = 0; i < ids.length && i < w.slots.length; i++) w.slots[i] = SPELL_BY_ID[ids[i]];
  if (w.shuffle) w.slots.sort(function () { return rnd() - 0.5; });
}

// 生成几种预设法杖
function mkStarterWand() {
  var w = mkWand({ name: '学徒短杖', capacity: 5, castDelay: 0.17, recharge: 0.55, manaMax: 110, manaCharge: 14, spread: 0.05 });
  wandFill(w, ['spark', 'spark', 'dmgUp', 'spark', null]);
  return w;
}
function rollWand(power) {
  var names = ['紫杉短杖', '铜纹杖', '骨质法杖', '晶簇长杖', '锈铁权杖', '星尘杖'];
  var capacity = 3 + (rnd() * 5 | 0);
  var w = mkWand({
    name: names[rnd() * names.length | 0],
    capacity: capacity,
    shuffle: rnd() < 0.3,
    spellsPerCast: rnd() < 0.25 ? 2 : 1,
    castDelay: 0.1 + rnd() * 0.3,
    recharge: 0.3 + rnd() * 0.8,
    manaMax: 60 + (rnd() * 160 | 0),
    manaCharge: 6 + (rnd() * 20 | 0),
    spread: rnd() * 0.16,
  });
  var pool = SPELLS.filter(function (s) { return s.t === 'proj'; });
  var mods = SPELLS.filter(function (s) { return s.t === 'mod'; });
  var tris = SPELLS.filter(function (s) { return s.t === 'tri'; });
  var trigs = SPELLS.filter(function (s) { return s.t === 'trig'; });
  var n = 1 + (rnd() * capacity | 0);
  var ids = [];
  ids.push(pool[rnd() * pool.length | 0].id);
  for (var i = 1; i < n; i++) {
    var r = rnd();
    if (r < 0.40) ids.push(mods[rnd() * mods.length | 0].id);
    else if (r < 0.52 && power > 0) ids.push(tris[rnd() * tris.length | 0].id);
    else if (r < 0.62 && power > 0) { ids.push(trigs[rnd() * trigs.length | 0].id); ids.push(pool[rnd() * pool.length | 0].id); }
    else ids.push(pool[rnd() * pool.length | 0].id);
  }
  wandFill(w, ids);
  return w;
}

// ---------- 施法引擎（牌库时序） ----------
// 从 ptr 开始收集一段 cast：遇到 mod 累积到下一段弹体；遇到 tri 记录数量
function collectCast(w) {
  var mods = [], count = w.spellsPerCast, proj = null, trig = null, steps = 0;
  var startPtr = w.ptr;
  var used = [];
  while (steps < w.slots.length + 2) {
    if (w.shuffle && steps === 0) w.slots.sort(function () { return rnd() - 0.5; });
    var idx = w.ptr % w.slots.length;
    var s = w.slots[idx];
    w.ptr++; steps++;
    used.push(idx);
    if (!s) { if (proj || trig) break; continue; }
    if (s.t === 'mod') { mods.push(s); continue; }
    if (s.t === 'tri') { count *= s.n; mods.push(s); continue; }
    if (s.t === 'trig') { if (!trig) { trig = s; continue; } else break; }
    if (s.t === 'proj') {
      if (!proj) { proj = s; }
      else { // 第二个弹体：本轮忽略（简化为追加一发同弹体）
        break;
      }
    }
  }
  return { proj: proj, mods: mods, count: count, trig: trig, startPtr: startPtr };
}

function castWand(w, caster, angle) {
  if (w.cd > 0 || w.rcd > 0) return false;
  var cast = collectCast(w);
  if (!cast.proj) { w.rcd = w.recharge; w.mana = w.manaMax; sfx('empty'); return false; }
  var cost = cast.proj.mana;
  for (var i = 0; i < cast.mods.length; i++) if (cast.mods[i].mana) cost += cast.mods[i].mana;
  if (cast.trig) cost += cast.trig.mana;
  if (w.mana < cost) { sfx('empty'); w.cd = w.castDelay; return false; }
  w.mana -= cost;
  var dmg = cast.proj.dmg * (caster === player ? (player.dmgMul || 1) : 1), speed = cast.proj.speed, rad = cast.proj.rad, life = cast.proj.life;
  var fx = cast.proj.fx, pierce = 0, bounce = 0, grav = 0, boom = 0, spread = w.spread;
  var n = Math.min(cast.count, 12);
  for (i = 0; i < cast.mods.length; i++) {
    var m = cast.mods[i];
    if (m.mult) dmg *= m.mult;
    if (m.sp) speed *= m.sp;
    if (m.size) rad *= m.size;
    if (m.pierce) pierce += m.pierce;
    if (m.bounce) bounce += m.bounce;
    if (m.grav) grav += m.grav;
    if (m.boom) boom = 1;
    if (m.spread) spread += m.spread;
  }
  // 触发器：先发一枚载体弹，命中/计时结束时再迸出载荷（弹体 + 修饰已结算）
  var trigId = cast.trig ? cast.trig.id : null;
  for (i = 0; i < n; i++) {
    var a = angle + (rnd() - 0.5) * spread * 2 + (n > 1 ? (i - (n - 1) / 2) * 0.09 : 0);
    var prj = spawnProj(trigId || cast.proj.id, caster.x + Math.cos(angle) * 6, caster.y - 3 + Math.sin(angle) * 6, a,
      trigId ? cast.trig.speed : speed, trigId ? cast.trig.dmg : dmg, rad, trigId ? cast.trig.life : life,
      trigId ? cast.trig.fx : fx, pierce, bounce, grav, boom, caster === player ? 'p' : 'e');
    if (trigId && prj) {
      prj.pay = { sid: cast.proj.id, dmg: dmg, rad: rad, life: life, fx: fx, pierce: pierce, bounce: bounce, grav: grav, boom: boom, n: Math.min(cast.count, 6) };
      if (trigId === 'trigTimer') prj.l = 34;
    }
  }
  w.cd = w.castDelay;
  sfx('cast');
  addShake(0.8);
  if (caster === player) { player.castFlash = 3; }
  return true;
}

function updateWand(w, dt) {
  if (w.cd > 0) w.cd -= dt;
  if (w.rcd > 0) { w.rcd -= dt; if (w.rcd <= 0) { w.mana = w.manaMax; } }
  else w.mana = Math.min(w.manaMax, w.mana + w.manaCharge * dt);
}
// ============================ D. 实体 ============================
var projList = [], enemyList = [], dropList = [], partList = [], floatList = [];
var bossKilled = false;
var shakeX = 0, shakeY = 0, shakeMag = 0;
function addShake(v) { shakeMag = Math.min(6, shakeMag + v); }

// ---------- 粒子 ----------
function spawnPart(x, y, vx, vy, color, life, grav, size) {
  if (partList.length > 420) return;
  partList.push({ x: x, y: y, vx: vx, vy: vy, c: color, l: life, ml: life, g: grav === undefined ? 0.06 : grav, s: size || 1 });
}
function spawnChip(x, y, m) {
  var pal = MPAL[m] || MPAL[M.ROCK];
  var c = pal[(rnd() * pal.length) | 0] >>> 0;
  var css = 'rgb(' + (c & 255) + ',' + ((c >> 8) & 255) + ',' + ((c >> 16) & 255) + ')';
  spawnPart(x + 0.5, y + 0.5, (rnd() - 0.5) * 1.4, -rnd() * 1.2, css, 24 + rnd() * 20, 0.07);
}
function spawnEmber(x, y) {
  spawnPart(x + 0.5, y, (rnd() - 0.5) * 0.3, -0.25 - rnd() * 0.4, rnd() < 0.5 ? '#ffd06a' : '#ff7a2a', 20 + rnd() * 26, -0.004, 1);
}
function spawnBlood(x, y, n) {
  for (var i = 0; i < n; i++) spawnPart(x, y, (rnd() - 0.5) * 2.4, -rnd() * 1.8, rnd() < 0.5 ? '#8e1220' : '#5e0c16', 30 + rnd() * 26, 0.1);
}
function spawnBurst(x, y, n, colors) {
  for (var i = 0; i < n; i++) {
    var a = rnd() * Math.PI * 2, sp = 0.6 + rnd() * 2.4;
    spawnPart(x, y, Math.cos(a) * sp, Math.sin(a) * sp, colors[(rnd() * colors.length) | 0], 14 + rnd() * 22, 0.05);
  }
}
function spawnHitFlash(x, y, r) {
  hitFlashes.push({ x: x, y: y, r: r, l: 6 });
}
var hitFlashes = [];

function addFloat(x, y, txt, color) { floatList.push({ x: x, y: y, t: txt, c: color || '#fff', l: 40, ml: 40 }); }

// ---------- 弹体 ----------
function spawnProj(sid, x, y, ang, sp, dmg, rad, life, fx, pierce, bounce, grav, boom, team) {
  var pr = {
    sid: sid, x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
    dmg: dmg, r: rad, l: life, fx: fx || '', pierce: pierce, bounce: bounce,
    grav: grav, boom: boom, team: team, hitSet: [],
  };
  projList.push(pr);
  return pr;
}
// 触发器引爆：从爆点迸出载荷弹体（修饰已结算）
function detonatePayload(p, x, y) {
  var pay = p.pay; p.pay = null;
  if (!pay) return;
  var base = Math.atan2(p.vy, p.vx);
  var team = p.team;
  for (var k = 0; k < pay.n; k++) {
    var a = base + (k - (pay.n - 1) / 2) * 0.2 + (rnd() - 0.5) * 0.1;
    spawnProj(pay.sid, x, y, a, Math.hypot(p.vx, p.vy) * 0.6 + 2.4, pay.dmg, pay.rad, pay.life, pay.fx, pay.pierce, pay.bounce, pay.grav, pay.boom, team);
  }
  spawnBurst(x, y, 14, ['#9ad6ff', '#ffffff', '#cfe9ff']);
  spawnHitFlash(x, y, p.r * 3);
  addShake(1.6); sfx('hit');
}
function updateProjs(dt) {
  for (var i = projList.length - 1; i >= 0; i--) {
    var p = projList[i];
    p.l -= 1;
    if (p.grav) p.vy += p.grav * 0.03;
    if (p.fx === 'home') {
      var t = nearestEnemy(p.x, p.y, 140);
      if (t) { var a = Math.atan2(t.y - 4 - p.y, t.x - p.x); p.vx += Math.cos(a) * 0.14; p.vy += Math.sin(a) * 0.14; }
      var sp = Math.hypot(p.vx, p.vy); if (sp > 4) { p.vx *= 4 / sp; p.vy *= 4 / sp; }
    }
    var nx = p.x + p.vx, ny = p.y + p.vy;
    // 地形碰撞（沿路径采样）
    var steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy)));
    var dead = false;
    for (var s = 1; s <= steps && !dead; s++) {
      var sx = p.x + (nx - p.x) * s / steps, sy = p.y + (ny - p.y) * s / steps;
      var cx = sx | 0, cy = sy | 0;
      var tm = getM(cx, cy);
      if (SOL(tm) && tm !== M.PLATFORM) {
        if (p.fx === 'dig') { dig(cx, cy, 4); dig(cx + 1, cy, 3); dig(cx, cy + 1, 3); dig(cx - 1, cy, 3); dig(cx, cy - 1, 3); }
        else if (p.bounce > 0) { p.bounce--; p.vx = -p.vx * 0.8; p.vy = -p.vy * 0.8; p.x = sx; p.y = sy; dead = true; break; }
        else { projHit(p, sx, sy); dead = true; break; }
      } else if (isLiquidM(tm)) {
        spawnBurst(sx, sy, 3, ['#7fc4ff', '#bfe6ff']);
        if (p.fx === 'fire') { setM(cx, cy, M.STEAM); setLife(cx, cy, 60); }
        projHit(p, sx, sy); dead = true; break;
      } else if (tm === M.FIRE && p.team === 'e') { /* 穿过 */ }
    }
    if (dead) { projList.splice(i, 1); continue; }
    p.x = nx; p.y = ny;
    // 命中判定
    if (p.team === 'p') {
      for (var e = 0; e < enemyList.length; e++) {
        var en = enemyList[e];
        if (en.hp <= 0) continue;
        if (p.hitSet.indexOf(en) >= 0) continue;
        if (Math.abs(en.x - p.x) < en.w / 2 + p.r && Math.abs(en.y - en.h / 2 - p.y) < en.h / 2 + p.r) {
          hurtEnemy(en, p.dmg, p);
          p.hitSet.push(en);
          if (p.pierce > 0) p.pierce--; else { projHit(p, p.x, p.y); projList.splice(i, 1); dead = true; }
          break;
        }
      }
      if (dead) continue;
    } else {
      // 敌方弹体打玩家
      if (Math.abs(player.x - p.x) < 5 + p.r && Math.abs(player.y - 4 - p.y) < 9 + p.r) {
        hurt(p.dmg, causeName(p.sid));
        spawnBurst(p.x, p.y, 8, ['#ff5a6a', '#ffd0d6']);
        spawnHitFlash(p.x, p.y, 8);
        addShake(2.2); sfx('hurt');
        projList.splice(i, 1); continue;
      }
    }
    if (p.l <= 0) { projHit(p, p.x, p.y); projList.splice(i, 1); continue; }
    if (p.fx === 'saw' || p.fx === 'fire') { if (rnd() < 0.5) spawnPart(p.x, p.y, -p.vx * 0.1, -p.vy * 0.1, p.fx === 'fire' ? '#ff9440' : '#cfd6e0', 12, 0); }
  }
}
function causeName(sid) {
  var s = SPELL_BY_ID[sid];
  return s ? s.name : '法术';
}
function projHit(p, x, y) {
  if (p.pay) detonatePayload(p, x, y); // 触发器：命中或计时结束时迸出载荷
  spawnBurst(x, y, 10, [p.fx === 'fire' ? '#ff9440' : '#ffe9a8', '#fff3cf', '#ffb04a']);
  spawnHitFlash(x, y, p.r * 2.4);
  addShake(1.2);
  sfx('hit');
  if (p.fx === 'fire') {
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
      if (getM((x | 0) + dx, (y | 0) + dy) === M.AIR && rnd() < 0.7) { setM((x | 0) + dx, (y | 0) + dy, M.FIRE); setLife((x | 0) + dx, (y | 0) + dy, 30 + rnd() * 30 | 0); }
    }
  }
  if (p.fx === 'poison') {
    for (var i = 0; i < 6; i++) { var dx2 = (x | 0) + (rnd() * 5 | 0) - 2, dy2 = (y | 0) + (rnd() * 5 | 0) - 2; if (getM(dx2, dy2) === M.AIR) { setM(dx2, dy2, M.PGAS); setLife(dx2, dy2, 60 + rnd() * 60 | 0); } }
  }
  if (p.fx === 'ice') {
    for (i = -2; i <= 2; i++) for (var j = -2; j <= 2; j++) { var mx = (x | 0) + i, my = (y | 0) + j; if (getM(mx, my) === M.AIR && rnd() < 0.3) { setM(mx, my, M.ICE); } }
  }
  if (p.boom || p.fx === 'boom') explode(x, y, 26, p.dmg);
}
function explode(x, y, r, dmg) {
  addShake(5); sfx('boom');
  spawnBurst(x, y, 30, ['#fff2c0', '#ffb04a', '#ff6a3a', '#8a3a20']);
  spawnHitFlash(x, y, r * 1.4);
  var cx = x | 0, cy = y | 0;
  for (var i = -r; i <= r; i++) for (var j = -r; j <= r; j++) {
    var d = Math.hypot(i, j); if (d > r) continue;
    var mx = cx + i, my = cy + j;
    var m = getM(mx, my);
  if (m === M.BEDROCK || m === M.BOUNDS || m === M.AIR || m === M.HOLY) continue;
    if (MDPS[m] < 250 && MHP[m] < 250 && d < r * 0.7) dig(mx, my, 40);
    if (d < r * 0.6 && getM(mx, my) === M.AIR) { setM(mx, my, M.FIRE); setLife(mx, my, 24 + rnd() * 30 | 0); }
  }
  // 伤害玩家 & 敌人
  var dp = Math.hypot(player.x - cx, player.y - 4 - cy);
  if (dp < r + 6) hurt(Math.max(4, dmg * (1 - dp / (r + 6)) * 0.8), '被炸死');
  for (var e = 0; e < enemyList.length; e++) {
    var en = enemyList[e];
    var de = Math.hypot(en.x - cx, en.y - en.h / 2 - cy);
    if (de < r + en.w) hurtEnemy(en, dmg * (1 - de / (r + en.w)), null);
  }
}

// ---------- 敌人 ----------
var ETYPES = {
  // 近战冲锋
  charger: { name: '穴居冲锋者', w: 12, h: 14, hp: 26, dmg: 12, spd: 0.06, col: ['#7a4a34', '#5c3526', '#a86a44', '#c98a52'], eye: '#ffd76e', ai: 'charge', aggro: 110 },
  // 远程弹幕
  shooter: { name: '孢子喷吐者', w: 13, h: 15, hp: 20, dmg: 8, spd: 0.02, col: ['#4a7a4a', '#355c35', '#6aa06a', '#8fd08f'], eye: '#eaffea', ai: 'shoot', aggro: 130 },
  // 飞行
  flyer: { name: '暗翼蝠', w: 12, h: 10, hp: 14, dmg: 8, spd: 0.09, col: ['#3a3a5c', '#26263e', '#5c5c8a', '#8282b8'], eye: '#ff6a6a', ai: 'fly', aggro: 120 },
  // 自爆
  bomber: { name: '沼气囊', w: 14, h: 14, hp: 12, dmg: 34, spd: 0.045, col: ['#6a6a3a', '#4a4a26', '#9a9a52', '#c0c06a'], eye: '#ffe06a', ai: 'bomb', aggro: 100 },
  // 潜地
  burrower: { name: '岩钻虫', w: 14, h: 12, hp: 34, dmg: 16, spd: 0.05, col: ['#5c5c6a', '#3e3e4a', '#82828f', '#a8a8b8'], eye: '#ff9a4a', ai: 'burrow', aggro: 130 },
  // 远程精英
  warlock: { name: '深渊咒师', w: 13, h: 17, hp: 30, dmg: 10, spd: 0.03, col: ['#5c3a6a', '#3e2648', '#8a5aa0', '#b88ad0'], eye: '#ff6ad8', ai: 'shoot2', aggro: 150 },
};
var EKINDS = ['charger', 'charger', 'shooter', 'flyer', 'bomber', 'burrower', 'warlock'];

function spawnEnemy(kind, x, y) {
  var d = ETYPES[kind];
  enemyList.push({ kind: kind, d: d, x: x, y: y, w: d.w, h: d.h, hp: d.hp, mhp: d.hp, vx: 0, vy: 0, dir: rnd() < 0.5 ? -1 : 1, state: 0, tm: 0, anim: rnd() * 6, grounded: false, flash: 0, cd: 0, buried: 0, enraged: 0 });
}
function nearestEnemy(x, y, r) {
  var best = null, bd = r * r;
  for (var i = 0; i < enemyList.length; i++) {
    var e = enemyList[i]; if (e.hp <= 0) continue;
    var dx = e.x - x, dy = e.y - e.h / 2 - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function hurtEnemy(e, dmg, p) {
  if (e.hp <= 0) return;
  e.hp -= dmg;
  e.flash = 5;
  addFloat(e.x, e.y - e.h - 2, String(Math.round(dmg)), '#ffe08a');
  spawnBlood(e.x, e.y - e.h / 2, 4);
  spawnHitFlash(e.x, e.y - e.h / 2, e.w * 0.7);
  addShake(1.0);
  sfx('hit2');
  if (e.kind === 'charger' && p) { e.vx += Math.sign(p.vx || (e.x - p.x)) * 0; }
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  spawnBurst(e.x, e.y - e.h / 2, 20, e.d.col.concat(['#ffffff']));
  spawnBlood(e.x, e.y - e.h / 2, 10);
  addShake(2.4);
  sfx('die');
  addFloat(e.x, e.y - e.h - 6, '击杀!', '#9ad6ff');
  kills++;
  if (e.boss) { bossKilled = true; }
  // 掉落
  var r = rnd();
  if (r < 0.55) spawnDrop(e.x, e.y, 'coin', 1 + (rnd() * (3 + zoneAt(e.y)) | 0));
  else if (r < 0.7) spawnDrop(e.x, e.y, 'hp', 0);
  else if (r < 0.75) spawnDrop(e.x, e.y, 'wand', 0);
  if (e.kind === 'bomber') explode(e.x, e.y - e.h / 2, 22, e.d.dmg);
  if (e.kind === 'burrower') { for (var i = -3; i <= 3; i++) for (var j = -3; j <= 3; j++) if (rnd() < 0.5) dig(e.x | 0 + i, e.y - e.h / 2 | 0 + j, 99); }
  // 微粒掉落
  for (i = 0; i < 6; i++) if (rnd() < 0.6) spawnChip(e.x + (rnd() - 0.5) * e.w, e.y - e.h / 2, M.ROCK);
}

function updateEnemies(dt) {
  for (var i = enemyList.length - 1; i >= 0; i--) {
    var e = enemyList[i];
    if (e.hp <= 0) { enemyList.splice(i, 1); continue; }
    var d = e.d;
    var dx = player.x - e.x, dy = (player.y - 4) - (e.y - e.h / 2);
    var dist = Math.hypot(dx, dy);
    var aggro = dist < d.aggro && playerAlive;
    if (e.flash > 0) e.flash--;
    if (e.cd > 0) e.cd -= dt;
    e.anim += 0.12;
    if (e.state === 0 && aggro) e.state = 1;

    var ai = d.ai;
    if (ai === 'charge') {
      if (e.state === 1) {
        if (e.tm <= 0) { e.dir = Math.sign(dx) || 1; e.tm = 0.5; }
        e.tm -= dt;
        e.vx += e.dir * d.spd;
        if (e.tm < 0.25 && e.tm > 0) e.vx += e.dir * d.spd * 2.4;
        if (e.tm <= 0) e.tm = 0.9;
        if (e.tm > 0.7) e.vx *= 0.9;
      } else patrol(e, dt);
      e.vx = clamp(e.vx, -2.2, 2.2);
      gravity(e); moveEnemy(e, dt);
      if (dist < 10 && e.cd <= 0 && Math.abs(dy) < 14) { hurt(d.dmg, '被冲锋者撞死'); e.cd = 1.0; addShake(3); }
    } else if (ai === 'shoot') {
      patrol(e, dt);
      gravity(e); moveEnemy(e, dt);
      if (aggro && e.cd <= 0 && dist < d.aggro) {
        e.cd = 1.6 + rnd();
        var a = Math.atan2(dy, dx);
        for (var k = -1; k <= 1; k++) spawnProj('spore', e.x, e.y - e.h / 2, a + k * 0.22, 2.2, d.dmg, 2.2, 70, 'poison', 0, 0, 0.04, 0, 'e');
        sfx('eshoot');
      }
    } else if (ai === 'shoot2') {
      // 保持距离
      if (aggro) {
        if (dist < 60) e.vx -= Math.sign(dx) * d.spd * 2;
        else if (dist > 110) e.vx += Math.sign(dx) * d.spd * 1.6;
        e.vx *= 0.9;
      } else patrol(e, dt);
      gravity(e); moveEnemy(e, dt);
      if (aggro && e.cd <= 0 && dist < d.aggro) {
        e.cd = 2.2;
        var a2 = Math.atan2(dy, dx);
        for (k = 0; k < 6; k++) spawnProj('bolt', e.x, e.y - e.h / 2, a2 + (k - 2.5) * 0.16, 2.6, d.dmg, 2, 80, '', 0, 0, 0, 0, 'e');
        sfx('eshoot');
      }
    } else if (ai === 'fly') {
      if (aggro) {
        e.vx += Math.sign(dx) * d.spd * 0.6;
        e.vy += Math.sign(dy) * d.spd * 0.6;
        if (dist < 12) { if (e.cd <= 0) { hurt(d.dmg, '被暗翼蝠抓死'); e.cd = 1.2; addShake(2); } }
      } else {
        e.vx += Math.cos(e.anim * 0.5) * d.spd * 0.4;
        e.vy += Math.sin(e.anim * 1.3) * d.spd * 0.5 - 0.01;
      }
      e.vx *= 0.94; e.vy *= 0.94;
      e.vx = clamp(e.vx, -1.8, 1.8); e.vy = clamp(e.vy, -1.8, 1.8);
      // 飞行碰撞
      var nx = e.x + e.vx, ny = e.y + e.vy;
      if (solidAt(nx | 0, (e.y - e.h / 2) | 0) || solidAt(nx | 0, (e.y + e.h / 2) | 0)) e.vx = -e.vx * 0.5; else e.x = nx;
      if (solidAt((e.x) | 0, (ny - e.h / 2) | 0) || solidAt(e.x | 0, (ny + e.h / 2) | 0)) e.vy = -e.vy * 0.5; else e.y = ny;
      e.x = clamp(e.x, 2, W - 3);
      if (rnd() < 0.15) spawnPart(e.x, e.y, 0, 0.2, '#5c5c8a', 14, 0);
    } else if (ai === 'bomb') {
      if (aggro) { e.vx += Math.sign(dx) * d.spd; e.dir = Math.sign(dx) || 1; }
      else patrol(e, dt);
      gravity(e); moveEnemy(e, dt);
      if (dist < 16 && e.cd <= 0) { e.hp = 0; killEnemy(e); enemyList.splice(i, 1); continue; }
      if (e.state === 1 && rnd() < 0.02) spawnPart(e.x, e.y - e.h, 0, -0.2, '#c0c06a', 20, -0.01);
    } else if (ai === 'burrow') {
      // 潜地：在固体中穿行
      var inSolid = SOL(getM(e.x | 0, (e.y - e.h / 2) | 0));
      if (e.state === 1) {
        e.dir = Math.sign(dx) || 1;
        if (Math.abs(dy) > 20) e.vy += Math.sign(dy) * d.spd;
        e.vx += e.dir * d.spd * (inSolid ? 1.4 : 0.6);
      } else { e.vx += e.dir * d.spd * 0.5; }
      e.vx = clamp(e.vx, -1.4, 1.4); e.vy = clamp(e.vy, -1.2, 1.2);
      // 在土里挖洞
      if (inSolid) {
        var digx = (e.x + e.dir * 6) | 0, digy = (e.y - e.h / 2) | 0;
        dig(digx, digy, 6); dig(digx, digy + 1, 6);
        if (rnd() < 0.4) spawnChip(digx, digy, getM(digx, digy));
      }
      e.x += e.vx * dt * 60 * 0.4;
      // 重力（除非在土里飞行）
      if (!inSolid) { e.vy += 0.14; }
      e.y += e.vy * dt * 60 * 0.4;
      e.buried = inSolid ? 1 : 0;
      if (!inSolid) { // 出土后落回
        if (solidAt(e.x | 0, (e.y + e.h / 2 + 1) | 0)) { e.vy = 0; }
      }
      e.x = clamp(e.x, 3, W - 4);
      if (dist < 14 && e.cd <= 0) { hurt(d.dmg, '被岩钻虫刺死'); e.cd = 1.1; addShake(2.5); }
      if (aggro && e.cd <= 0 && dist < 40 && !inSolid) {
        e.cd = 2.4;
        var a3 = Math.atan2(dy, dx);
        spawnProj('spike', e.x, e.y - e.h / 2, a3, 3.2, 8, 1.8, 60, '', 0, 0, 0, 0, 'e');
        sfx('eshoot');
      }
    }

    // 与玩家接触伤害（通用兜底）
    if (playerAlive && Math.abs(e.x - player.x) < (e.w + 8) / 2 && Math.abs(e.y - e.h / 2 - (player.y - 4)) < (e.h + 16) / 2) {
      if (ai !== 'charge' && ai !== 'bomb' && ai !== 'burrow' && ai !== 'fly') {
        if (e.cd <= 0) { hurt(d.dmg, '被' + d.name + '击杀'); e.cd = 1.0; }
      } else if (e.cd <= 0 && (ai === 'fly')) { /* 已处理 */ }
    }
    // 液体环境伤害
    var lm = getM(e.x | 0, (e.y - e.h / 2) | 0);
    if (lm === M.ACID) { e.hp -= 0.5; if (e.hp <= 0) killEnemy(e); }
    if (rnd() < 0.02 && e.flash > 0) spawnBlood(e.x, e.y - e.h / 2, 1);
  }
}
function patrol(e, dt) {
  if (e.tm > 0) e.tm -= dt; else { e.tm = 1 + rnd() * 2; e.dir = rnd() < 0.5 ? -1 : 1; }
  e.vx += e.dir * e.d.spd * 0.7;
  // 前方是悬崖/墙就转向
  var fx = (e.x + e.dir * (e.w / 2 + 2)) | 0;
  var fy = (e.y + 1) | 0;
  var fdown = getM(fx, (e.y + e.h / 2 + 2) | 0);
  if (SOL(fdown) === false && MTYPE[fdown] !== 1) { e.dir *= -1; e.tm = 0.6; }
  if (SOL(getM(fx, (e.y - e.h / 2) | 0))) { e.dir *= -1; e.tm = 0.6; }
  e.vx = clamp(e.vx, -1.2, 1.2);
}
function gravity(e) { e.vy += 0.14; e.vy = Math.min(e.vy, 5); }
function moveEnemy(e, dt) {
  var s = dt * 60 * 0.4;
  // X
  var nx = e.x + e.vx * s;
  var hx = e.w / 2;
  var top = (e.y - e.h + 1) | 0, bot = (e.y - 1) | 0;
  var hitWall = false;
  for (var yy = top; yy <= bot; yy += 3) {
    var tx = e.vx > 0 ? (nx + hx) | 0 : (nx - hx) | 0;
    if (SOL(getM(tx, yy)) && getM(tx, yy) !== M.PLATFORM) { hitWall = true; break; }
  }
  if (!hitWall) e.x = nx; else e.vx = 0;
  // Y
  var ny = e.y + e.vy * s;
  e.grounded = false;
  var lft = (e.x - hx + 1) | 0, rgt = (e.x + hx - 1) | 0;
  var xx;
  if (e.vy > 0) {
    // 与玩家同约定：行 floor(e.y) 固体即站立，向下扫描防穿地
    var r0 = e.y | 0, r1 = ny | 0, floorHit = -1;
    var stp = Math.max(2, (rgt - lft) >> 1);
    for (var rr = r0; rr <= r1 && floorHit < 0; rr++) {
      for (xx = lft; xx <= rgt; xx += stp) { if (SOL(getM(xx, rr))) { floorHit = rr; break; } }
    }
    if (floorHit >= 0) { e.y = floorHit; e.vy = 0; e.grounded = true; }
    else e.y = ny;
  } else if (e.vy < 0) {
    var rTop = (ny - e.h) | 0, rOld = (e.y - e.h) | 0, solidHead = false;
    var stp2 = Math.max(2, (rgt - lft) >> 1);
    for (var rh = rTop; rh <= rOld && !solidHead; rh++) {
      for (xx = lft; xx <= rgt; xx += stp2) if (SOL(getM(xx, rh))) { solidHead = true; break; }
    }
    if (solidHead) e.vy = 0; else e.y = ny;
  } else e.y = ny;
  e.x = clamp(e.x, hx + 1, W - hx - 1);
  // 掉出世界
  if (e.y > H + 40) e.hp = 0;
}

// ---------- 掉落物 ----------
function spawnDrop(x, y, kind, val) {
  dropList.push({ x: x, y: y, vx: (rnd() - 0.5) * 1.2, vy: -rnd() * 1.6 - 0.4, kind: kind, val: val, l: 60 * 45, bob: rnd() * 6 });
}
function updateDrops(dt) {
  for (var i = dropList.length - 1; i >= 0; i--) {
    var d = dropList[i];
    d.l -= 1;
    d.bob += 0.08;
    d.vy += 0.1; d.vy = Math.min(d.vy, 4);
    // 简单物理
    var ny = d.y + d.vy;
    var nx = d.x + d.vx;
    if (SOL(getM(nx | 0, (ny) | 0))) { d.vy = -d.vy * 0.3; d.vx *= 0.7; } else d.y = ny;
    if (SOL(getM((nx) | 0, (d.y - 2) | 0))) { d.vx = -d.vx * 0.5; } else d.x = nx;
    d.vx *= 0.98;
    if (SOL(getM(d.x | 0, (d.y + 2) | 0))) { d.vy = 0; d.vx *= 0.85; }
    d.x = clamp(d.x, 2, W - 3);
    // 拾取
    if (playerAlive && Math.abs(d.x - player.x) < 10 && Math.abs(d.y - (player.y - 6)) < 12) {
      if (d.kind === 'coin') { coins += d.val; addFloat(d.x, d.y - 6, '+' + d.val, '#ffd76e'); sfx('coin'); pickMsg('金币 x' + d.val); dropList.splice(i, 1); continue; }
      if (d.kind === 'hp') { player.hp = Math.min(player.mhp, player.hp + 24); addFloat(d.x, d.y - 6, '+24', '#ff6a8a'); sfx('heal'); pickMsg('生命恢复 +24'); dropList.splice(i, 1); continue; }
      if (d.kind === 'wand') {
        var w = rollWand(zoneAt(d.y));
        player.wands.push(w);
        if (player.wands.length > 5) player.wands.shift();
        player.wi = player.wands.length - 1;
        addFloat(d.x, d.y - 8, '拾取法杖!', '#b6a8ff'); sfx('pickup'); pickMsg('获得法杖：' + w.name);
        dropList.splice(i, 1); continue;
      }
    }
    if (d.l <= 0) { dropList.splice(i, 1); continue; }
  }
}
var pickT = 0, pickTxt = '';
function pickMsg(t) { pickTxt = t; pickT = 2.4; }
// ============================ E. 玩家 / 死因 ============================
var player = null, playerAlive = true;
var coins = 0, kills = 0, runTime = 0, deathCause = '', deathDetail = '';
var elapsed = 0;
function initPlayer() {
  player = {
    x: spawnPt.x, y: spawnPt.y, vx: 0, vy: 0, w: 8, h: 16,
    hp: 100, mhp: 100, mana: 100, mmana: 100,
    grounded: false, face: 1, inWater: 0, breathe: 8, castFlash: 0, castCd: 0,
    inv: 0, wands: [mkStarterWand()], wi: 0, hurtT: 0,
    status: { burn: 0, poison: 0, wet: 0, freeze: 0 },
    perks: [], flasks: 2, flaskMax: 2,
    dmgMul: 1, speedMul: 1, lightMul: 1, freeEdit: false,
    coyote: 0, jumpBuf: 0, anim: 0, squash: 0,
  };
  playerAlive = true; coins = 0; kills = 0; runTime = 0;
  deathCause = ''; deathDetail = '';
  // 注意：敌人/掉落/宝箱由 spawnEntities（genWorld 内）生成，这里只清弹体与特效
  projList.length = 0; partList.length = 0; floatList.length = 0;
  hitFlashes.length = 0;
  spawnRoomEnemies();
}

function hurt(dmg, cause) {
  if (!playerAlive || player.inv > 0) return;
  player.hp -= dmg;
  player.inv = 0.45;
  player.hurtT = 8;
  addShake(2.5);
  spawnHitFlash(player.x, player.y - 6, 9);
  sfx('hurt');
  if (player.hp <= 0) die(cause);
}
function die(cause) {
  if (!playerAlive) return;
  playerAlive = false;
  player.hp = 0;
  deathCause = cause;
  var zone = zoneAt(player.y);
  deathDetail = '死于 ' + (ZNAME[zone] && ZNAME[zone].name ? ZNAME[zone].name : '未知之地') + ' · 深度 ' + Math.max(0, Math.round(player.y - SURF)) + 'm';
  spawnBurst(player.x, player.y - 6, 34, ['#ff5a6a', '#ffd0d6', '#ffffff']);
  spawnBlood(player.x, player.y - 6, 18);
  addShake(7);
  sfx('die');
  setTimeout(function () { showDeath(); }, 700);
}

function updatePlayer(dt) {
  if (!playerAlive) return;
  var p = player;
  runTime += dt;
  if (p.inv > 0) p.inv -= dt;
  if (p.hurtT > 0) p.hurtT--;
  if (p.castFlash > 0) p.castFlash--;

  // 环境检测
  var bodyM = getM(p.x | 0, (p.y - 6) | 0);
  var feetM = getM(p.x | 0, (p.y - 2) | 0);
  var headM = getM(p.x | 0, (p.y - 13) | 0);
  var isLiq = function (m) { var t = MTYPE[m]; return t === 1 || t === 4; };
  p.inWater = isLiq(bodyM) ? (bodyM === M.ACID ? 2 : 1) : 0;
  // 酸腐蚀
  if (bodyM === M.ACID) { hurt(14 * dt, '被酸液腐蚀而死'); p.status.wet = 40; }
  // 火焰伤害
  if (bodyM === M.FIRE || feetM === M.FIRE || headM === M.FIRE || getM(p.x | 0, (p.y - 6) | 0) === M.LAVA) {
    if (getM(p.x | 0, (p.y - 6) | 0) === M.LAVA) hurt(26 * dt, '被熔岩烧死');
    else { p.status.burn = 90; }
    if (rnd() < 0.3) spawnEmber(p.x + (rnd() - 0.5) * 6, p.y - 6 - rnd() * 8);
  }
  // 状态：燃烧
  if (p.status.burn > 0) {
    p.status.burn -= dt * 60;
    hurt(4 * dt, '被烧死');
    if (rnd() < 0.5) spawnEmber(p.x + (rnd() - 0.5) * 7, p.y - 4 - rnd() * 10);
  }
  if (p.status.poison > 0) { p.status.poison -= dt * 60; hurt(3 * dt, '被毒死'); }
  if (headM === M.PGAS) { p.status.poison = 90; }
  if (headM === M.SMOKE || headM === M.STEAM) { p.breathe -= dt * 1.5; }
  else p.breathe = Math.min(8, p.breathe + dt * 2);
  if (p.inWater === 1) {
    p.breathe -= dt;
    if (p.breathe <= 0) hurt(9 * dt, '溺死在液体中');
  }
  if (p.breathe < 0) p.breathe = 0;

  // 移动
  var left = keys['ArrowLeft'] || keys['KeyA'] || touch.left;
  var right = keys['ArrowRight'] || keys['KeyD'] || touch.right;
  var jump = keys['ArrowUp'] || keys['KeyW'] || keys['Space'] || touch.jump;
  var accel = (p.inWater ? 0.09 : 0.16) * (p.speedMul || 1);
  var maxsp = (p.inWater ? 1.4 : 2.5) * (p.speedMul || 1);
  if (left) { p.vx -= accel; p.face = -1; }
  if (right) { p.vx += accel; p.face = 1; }
  if (!left && !right) p.vx *= p.grounded ? 0.72 : 0.92;
  p.vx = clamp(p.vx, -maxsp, maxsp);

  if (p.grounded) p.coyote = 6; else if (p.coyote > 0) p.coyote--;
  if (jump) p.jumpBuf = 6; else if (p.jumpBuf > 0) p.jumpBuf--;

  if (p.jumpBuf > 0 && p.coyote > 0) {
    p.vy = p.inWater ? -2.0 : -3.4;
    p.grounded = false; p.coyote = 0; p.jumpBuf = 0;
    sfx('jump');
    for (var i = 0; i < 4; i++) spawnPart(p.x, p.y, (rnd() - 0.5) * 1.2, -rnd() * 0.6, '#b8b0a0', 14, 0.03);
  }
  // 悬浮（按住跳跃稳定上升，Noita 式飞行）
  if (jump && !p.grounded && p.inWater === 0) p.vy += (-1.15 - p.vy) * 0.2;
  if (jump && p.inWater) p.vy -= 0.12;

  p.vy += p.inWater ? 0.05 : 0.17;
  p.vy = Math.min(p.vy, p.inWater ? 1.4 : 5.5);
  if (p.inWater) { p.vx *= 0.96; p.vy *= 0.94; }

  movePlayer(p, dt);

  // 动画
  if (Math.abs(p.vx) > 0.3) p.anim += 0.18; else p.anim = 0;

  // 法杖
  var w = p.wands[p.wi];
  if (w) {
    updateWand(w, dt);
    if ((mouse.down || keys['KeyJ'] || touch.cast) && p.castCd <= 0) {
      var ang = aimAngle();
      if (castWand(w, p, ang)) p.castCd = 0.05;
    }
    if (p.castCd > 0) p.castCd -= dt;
  }
}

var pcastCd = 0;
function aimAngle() {
  // 鼠标（屏幕坐标 -> 世界）
  var wx = camX + mouse.x, wy = camY + mouse.y;
  return Math.atan2(wy - (player.y - 6), wx - player.x);
}

function movePlayer(p, dt) {
  var s = dt * 60;                  // vx/vy 单位为 px/帧（60fps 基准）
  var f = dt * 60;
  var hx = p.w / 2;
  // X 轴
  var nx = p.x + p.vx * s;
  var top = (p.y - p.h + 1) | 0, bot = (p.y - 1) | 0;
  var blocked = false;
  for (var yy = top; yy <= bot; yy += 3) {
    var tx = p.vx > 0 ? (nx + hx) | 0 : (nx - hx) | 0;
    var m = getM(tx, yy);
    if (SOL(m) && m !== M.PLATFORM) { blocked = true; break; }
  }
  if (!blocked) p.x = nx; else p.vx = 0;

  // Y 轴：站立约定 = 行 floor(p.y) 为固体（脚下行 p.y-1 为空气）
  var ny = p.y + p.vy * s;
  var lft = (p.x - hx + 1) | 0, rgt = (p.x + hx - 1) | 0;
  var xx;
  p.grounded = false;
  if (p.vy > 0) {
    // 从当前脚下所在行向下扫描到新位置，取第一个固体行作为站立面（防穿地）
    var r0 = p.y | 0, r1 = ny | 0, floorHit = -1;
    for (var rr = r0; rr <= r1 && floorHit < 0; rr++) {
      for (xx = lft; xx <= rgt; xx += 3) { var m2 = getM(xx, rr); if (SOL(m2)) { floorHit = rr; break; } }
    }
    if (floorHit >= 0) { p.y = floorHit; p.vy = 0; p.grounded = true; } else p.y = ny;
  } else if (p.vy < 0) {
    // 上升：头顶行与旧头顶行之间若有固体则阻挡（防穿顶）
    var rTop = (ny - p.h) | 0, rOld = (p.y - p.h) | 0, head = false;
    for (var rh = rTop; rh <= rOld && !head; rh++) {
      for (xx = lft; xx <= rgt; xx += 3) { var m3 = getM(xx, rh); if (SOL(m3)) { head = true; break; } }
    }
    if (head) p.vy = 0.2; else p.y = ny;
  } else p.y = ny;

  // 解卡：若玩家中心陷入固体，向最近的自由方向挤出
  (function depenetrate() {
    var cx = p.x | 0, cy = (p.y - p.h / 2) | 0;
    if (!SOL(getM(cx, cy))) { p.squash = 0; return; }
    var dirs = [[0, -1], [1, 0], [-1, 0], [0, 1]];
    for (var i = 0; i < dirs.length; i++) {
      var d = dirs[i];
      var tx = cx, ty = cy, ok = false;
      for (var step = 1; step <= 24; step++) {
        tx = cx + d[0] * step; ty = cy + d[1] * step;
        if (!inW(tx, ty)) break;
        if (!SOL(getM(tx, ty))) { ok = true; break; }
      }
      if (ok) {
        p.x = tx + (d[0] === 0 ? 0 : 0);
        if (d[1] !== 0) p.y = ty + p.h / 2;
        else p.x = tx;
        p.vx = 0; p.vy = Math.min(p.vy, 0);
        p.squash = 0;
        break;
      }
    }
  })();

  p.x = clamp(p.x, hx + 1, W - hx - 1);
  // 掉出世界
  if (p.y > H - 4) die('坠入无底深渊');
  // 头顶被夹 + 脚下为固体 → 连续多帧后判压死
  var ceiling = getM(p.x | 0, (p.y - p.h - 1) | 0);
  var floorM = getM(p.x | 0, (p.y + 1) | 0);
  if (SOL(ceiling) && SOL(floorM)) {
    p.squash = (p.squash || 0) + 1;
    if (p.squash > 60) die('被落石压死');
  } else p.squash = 0;
}

//============================ F. 渲染 ============================
var terC, terCtx, terImg, terBuf32;
var lightC, lightCtx, lightImg, lightBuf32;
var glowC, glowCtx;
var ctx = null;                       // 主上下文（= scene，boot 中赋值）
var SCALE = 3;

function setupRender() {
  terC = document.createElement('canvas'); terC.width = VW; terC.height = VH;
  terCtx = terC.getContext('2d'); terImg = terCtx.createImageData(VW, VH);
  terBuf32 = new Uint32Array(terImg.data.buffer);
  lightC = document.createElement('canvas'); lightC.width = VW; lightC.height = VH;
  lightCtx = lightC.getContext('2d'); lightImg = lightCtx.createImageData(VW, VH);
  lightBuf32 = new Uint32Array(lightImg.data.buffer);
  glowC = document.createElement('canvas'); glowC.width = VW; glowC.height = VH;
  glowCtx = glowC.getContext('2d');
}

var camX = 0, camY = 0, camTX = 0, camTY = 0;
function updateCamera(dt) {
  if (!player) return;
  camTX = clamp(player.x - VW / 2, 0, W - VW);
  camTY = clamp(player.y - VH / 2 - 6, 0, H - VH);
  camX += (camTX - camX) * Math.min(1, dt * 7);
  camY += (camTY - camY) * Math.min(1, dt * 7);
  if (shakeMag > 0) {
    camX += (rnd() - 0.5) * shakeMag;
    camY += (rnd() - 0.5) * shakeMag;
    shakeMag *= 0.86;
    if (shakeMag < 0.05) shakeMag = 0;
  }
}

function render() {
  var cx0 = Math.floor(camX), cy0 = Math.floor(camY);
  var i = 0;
  // 光照缓冲初始化
  var zone = player ? zoneAt(Math.max(SURF, player.y)) : 0;
  var amb = ZAMB[zone] || [40, 40, 55];
  // 背景渐变（先画到主 canvas）
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  var bgTop = ZBG[zone][0], bgBot = ZBG[zone][1];
  var g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, bgTop); g.addColorStop(1, bgBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // --- 视差背景（洞穴纹理） ---
  drawParallax(cx0, cy0, zone);

  // --- 地形像素到 terC ---
  for (var sy = 0; sy < VH; sy++) {
    var wy = cy0 + sy;
    for (var sx = 0; sx < VW; sx++) {
      var wx = cx0 + sx;
      var m = getM(wx, wy);
      var col;
      if (m === M.UNINIT || m === M.BOUNDS) col = 0xff000000;
      else if (m === M.AIR) col = 0;
      else col = matColor(m, wx, wy);
      terBuf32[i++] = col;
    }
  }
  terCtx.putImageData(terImg, 0, 0);

  // --- 光照缓冲 ---
  var lr = lightBuf32;
  var ar = amb[0] | 0, ag = amb[1] | 0, ab = amb[2] | 0;
  for (i = 0; i < VW * VH; i++) lr[i] = 0xff000000 | (ab << 16) | (ag << 8) | ar;

  // 主 canvas 上贴地形
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(terC, 0, 0);

  // --- 实体（在地形之上） ---
  drawDrops();
  drawEnemies();
  drawParticles();
  drawProjectiles();
  if (playerAlive) drawPlayer();

  // --- 光源写入光缓冲 ---
  addLight(player ? player.x - cx0 : 200, player ? player.y - 6 - cy0 : 112, 78 * (player ? (player.lightMul || 1) : 1), 1.0);
  // 火把 & 火 & 熔岩 & 发光物
  var x0 = cx0 - 40, x1 = cx0 + VW + 40, y0 = cy0 - 40, y1 = cy0 + VH + 40;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W - 1, x1); y1 = Math.min(H - 1, y1);
  for (var yy = y0; yy < y1; yy += 1) {
    for (var xx = x0; xx < x1; xx += 1) {
      var m2 = getM(xx, yy);
      if (m2 === M.AIR || m2 === M.UNINIT || m2 === M.BOUNDS) continue;
      if (MLIT[m2] > 0) {
        var strength = MLIT[m2] / 255;
        // 熔岩/火焰大面积发光，用稀疏采样近似
        var step = (m2 === M.LAVA) ? 3 : 1;
        if ((xx % step) || (yy % step)) continue;
        addLight(xx - cx0, yy - cy0, m2 === M.FIRE ? 22 : (m2 === M.TORCH ? 34 : 16), strength * (m2 === M.LAVA ? 0.75 : 1));
      }
    }
  }
  // 法术光
  for (i = 0; i < projList.length; i++) addLight(projList[i].x - cx0, projList[i].y - cy0, 30, 0.85);
  for (i = 0; i < partList.length; i++) { var pt = partList[i]; if (pt.c === '#ffd06a' || pt.c === '#ff7a2a') addLight(pt.x - cx0, pt.y - cy0, 12, 0.6); }
  if (hitFlashes.length) for (i = 0; i < hitFlashes.length; i++) { var hf = hitFlashes[i]; addLight(hf.x - cx0, hf.y - cy0, hf.r * 3, 1.0); }

  lightCtx.putImageData(lightImg, 0, 0);

  // --- 光照乘法合成 ---
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(lightC, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';

  // --- 辉光（additive） ---
  glowCtx.clearRect(0, 0, VW, VH);
  glowCtx.globalCompositeOperation = 'lighter';
  glowCtx.drawImage(lightC, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.28;
  ctx.drawImage(glowC, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // --- 命中闪光 ---
  for (i = hitFlashes.length - 1; i >= 0; i--) {
    var f = hitFlashes[i];
    f.l--;
    if (f.l <= 0) { hitFlashes.splice(i, 1); continue; }
    var a = f.l / 6;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,244,214,' + (a * 0.8) + ')';
    var fx = (f.x - cx0) * SCALE, fy = (f.y - cy0) * SCALE;
    var rr = f.r * (1.6 - a * 0.5) * SCALE;
    ctx.beginPath(); ctx.arc(fx, fy, rr, 0, 6.283); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // --- 漂浮文字 ---
  ctx.font = '7px monospace'; ctx.textAlign = 'center';
  for (i = floatList.length - 1; i >= 0; i--) {
    var fl = floatList[i];
    fl.l--; fl.y -= 0.35;
    if (fl.l <= 0) { floatList.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, fl.l / 14);
    ctx.fillStyle = '#000'; ctx.fillText(fl.t, (fl.x - cx0) * SCALE + 1, (fl.y - cy0) * SCALE + 1);
    ctx.fillStyle = fl.c; ctx.fillText(fl.t, (fl.x - cx0) * SCALE, (fl.y - cy0) * SCALE);
  }
  ctx.globalAlpha = 1;
}

// 预计算：A 区 MPAL 已是 packed Uint32Array（ABGR），按群系 ZPAL 取用
var PAL32 = [];
function buildPal32() {
  for (var m = 0; m < MCOUNT; m++) PAL32[m] = MPAL[m];
}
function matColor(m, wx, wy) {
  var zone = zoneAt(wy);
  var pal = (ZPAL[zone] && ZPAL[zone][m]) || PAL32[m];
  if (!pal || !pal.length) pal = PAL32[m];
  if (!pal || !pal.length) return 0xff000000;
  var n = hash2(wx, wy) * 0.6 + vnoise(wx * 0.31, wy * 0.31) * 0.4;
  var idx = (n * pal.length) | 0;
  if (idx < 0) idx = 0;
  if (idx >= pal.length) idx = pal.length - 1;
  var c = pal[idx];
  var a = MALPHA[m];
  if (a >= 255) return c | 0xff000000;
  return (c & 0x00ffffff) | (a << 24);
}

function addLight(x, y, r, s) {
  if (x < -r || y < -r || x > VW + r || y > VH + r) return;
  var x0 = Math.max(0, (x - r) | 0), x1 = Math.min(VW - 1, (x + r) | 0);
  var y0 = Math.max(0, (y - r) | 0), y1 = Math.min(VH - 1, (y + r) | 0);
  var r2 = r * r;
  for (var yy = y0; yy <= y1; yy++) {
    var dy = yy - y, row = yy * VW;
    for (var xx = x0; xx <= x1; xx++) {
      var dx = xx - x, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      var f = 1 - Math.sqrt(d2) / r;
      f = f * f * s;
      if (f <= 0.004) continue;
      var i = row + xx;
      var c = lightBuf32[i];
      var lr = c & 255, lg = (c >> 8) & 255, lb = (c >> 16) & 255;
      var nr = lr + ((255 - lr) * f) | 0;
      var ng = lg + ((255 - lg) * f) | 0;
      var nb = lb + ((255 - lb) * f) | 0;
      lightBuf32[i] = 0xff000000 | (nb << 16) | (ng << 8) | nr;
    }
  }
}
// ============================ G. 实体生成 ============================
function findOpenSpot(x0, x1, y0, y1) {
  for (var t = 0; t < 60; t++) {
    var x = rint(x0, x1), y = rint(y0, y1);
    if (!inW(x, y)) continue;
    // 向下找：空气 + 下方固体
    for (var d = 0; d < 40; d++) {
      var yy = y + d;
      if (!inW(x, yy)) break;
      if (SOL(getM(x, yy))) {
        if (yy - 1 > y0 && getM(x, yy - 1) === M.AIR && getM(x, yy - 2) === M.AIR && getM(x, yy - 3) === M.AIR) return { x: x + 0.5, y: yy };
        break;
      }
    }
  }
  return null;
}
function placeChest(x, y) {
  for (var dx = 0; dx < 3; dx++) for (var dy = -2; dy <= 0; dy++) setM(x + dx, y + dy, M.CHEST);
  chests.push({ x: x + 1, y: y - 1, opened: false });
}
function spawnEntities() {
  enemyList.length = 0; dropList.length = 0; chests.length = 0;
  // 每层敌人
  var count = [12, 15, 16, 16, 20];
  for (var bi = 0; bi < BANDS; bi++) {
    var top = bandTop(bi);
    for (var k = 0; k < count[bi]; k++) {
      var p = findOpenSpot(40, W - 44, top + 60, top + BAND - 60);
      if (!p) continue;
      var pool = bi === 0 ? ['charger', 'charger', 'flyer']
        : bi === 1 ? ['charger', 'shooter', 'flyer', 'bomber']
        : bi === 2 ? ['shooter', 'flyer', 'bomber', 'charger', 'warlock']
        : bi === 3 ? ['charger', 'flyer', 'burrower', 'shooter']
        : ['burrower', 'warlock', 'bomber', 'charger', 'shooter'];
      spawnEnemy(pool[rint(0, pool.length - 1)], p.x, p.y);
    }
    // 宝箱
    for (var c = 0; c < 3; c++) {
      var cp = findOpenSpot(50, W - 60, top + 80, top + BAND - 80);
      if (cp) placeChest(cp.x | 0, cp.y | 0);
    }
    // 散落的魔杖
    if (rnd() < 0.85) {
      var wp = findOpenSpot(60, W - 70, top + 100, top + BAND - 100);
      if (wp) dropList.push({ x: wp.x, y: wp.y - 6, vx: 0, vy: 0, kind: 'wand', val: 0, l: 60 * 120, bob: 0 });
    }
  }
  // 圣山房间：血瓶与金币
  for (var r = 0; r < hmRooms.length; r++) {
    var room = hmRooms[r];
    if (!room) continue;
    dropList.push({ x: room.x0 + 30, y: room.y1 - 40, vx: 0, vy: 0, kind: 'hp', val: 0, l: 999999, bob: 0 });
    for (var g = 0; g < 6; g++) dropList.push({ x: room.x0 + 60 + g * 14, y: room.y1 - 40, vx: 0, vy: -0.4, kind: 'coin', val: 2 + r * 3, l: 999999, bob: rnd() * 6 });
  }
  // 深渊守卫（胜利条件）
  var bp = findOpenSpot(240, W - 240, H - 220, H - 60);
  if (bp) {
    var d = ETYPES.warlock;
    enemyList.push({ kind: 'boss', boss: true, d: { name: '三眼之瞳', w: 26, h: 30, hp: 320, dmg: 18, spd: 0.04, col: d.col, eye: '#ffe06a', ai: 'shoot2', aggro: 220 },
      x: bp.x, y: bp.y, w: 26, h: 30, hp: 320, mhp: 320, vx: 0, vy: 0, dir: -1, state: 0, tm: 0, anim: 0, grounded: false, flash: 0, cd: 1.5, buried: 0, enraged: 0 });
  }
}
function spawnRoomEnemies() {
  // 出生点附近放一只小怪，方便早期战斗
  var p = findOpenSpot(clamp(spawnPt.x + 60, 40, W - 60), clamp(spawnPt.x + 130, 60, W - 40), SURF - 20, SURF + 40);
  if (p) spawnEnemy('charger', p.x, p.y);
}

// ============================ H. 绘制 ============================
function w2sx(x) { return Math.round((x - camX) * SCALE); }
function w2sy(y) { return Math.round((y - camY) * SCALE); }

function drawParallax(cx0, cy0, zone) {
  ctx.save();
  // 洞穴暗色岩层视差（两层）
  var ox = -cx0 * 0.3, oy = -cy0 * 0.35;
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#0d0f16';
  for (var i = 0; i < 14; i++) {
    var bx = ((i * 97 + (ox | 0)) % (canvas.width + 120)) - 60;
    var by = ((i * 61 + (oy | 0)) % (canvas.height + 140)) - 70;
    ctx.fillRect(bx, by, 46 + (i % 4) * 22, 14 + (i % 3) * 10);
  }
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#151926';
  var ox2 = -cx0 * 0.55, oy2 = -cy0 * 0.6;
  for (i = 0; i < 12; i++) {
    var bx2 = ((i * 71 + (ox2 | 0)) % (canvas.width + 160)) - 80;
    var by2 = ((i * 43 + (oy2 | 0)) % (canvas.height + 160)) - 80;
    ctx.beginPath();
    ctx.moveTo(bx2, by2); ctx.lineTo(bx2 + 54, by2 + 6); ctx.lineTo(bx2 + 40, by2 + 30); ctx.lineTo(bx2 - 6, by2 + 22);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawPlayer() {
  if (!player) return;
  var p = player;
  var x = w2sx(p.x), y = w2sy(p.y);
  var s = SCALE;
  ctx.save();
  if (p.inv > 0 && (frame & 2)) ctx.globalAlpha = 0.4;
  // 身体 8x16（中心在脚下）
  var bx = x - 4 * s, by = y - 16 * s;
  // 腿
  var step = Math.abs(p.vx) > 0.3 ? Math.sin(p.anim * 4) * 2 : 0;
  ctx.fillStyle = '#2c3446';
  ctx.fillRect(bx + s, by + 11 * s, 2 * s, 5 * s + Math.max(0, step) * s);
  ctx.fillRect(bx + 5 * s, by + 11 * s, 2 * s, 5 * s + Math.max(0, -step) * s);
  // 躯干（长袍）
  ctx.fillStyle = p.hurtT > 0 ? '#ff8a8a' : '#3b4664';
  ctx.fillRect(bx, by + 5 * s, 8 * s, 7 * s);
  ctx.fillStyle = '#4d5a80';
  ctx.fillRect(bx, by + 5 * s, 8 * s, 2 * s);
  // 头
  ctx.fillStyle = '#d9b48c';
  ctx.fillRect(bx + s, by + 2 * s, 6 * s, 4 * s);
  // 兜帽
  ctx.fillStyle = '#2a3350';
  ctx.fillRect(bx + s, by, 6 * s, 3 * s);
  ctx.fillRect(bx, by + 2 * s, 8 * s, 1 * s);
  // 眼睛（朝向）
  ctx.fillStyle = '#9ad6ff';
  ctx.fillRect(bx + (p.face > 0 ? 5 * s : 2 * s), by + 3 * s, s, s);
  // 法杖（指向瞄准方向）
  var ang = aimAngle();
  var wx = x + Math.cos(ang) * 11 * s, wy = (y - 8 * s) + Math.sin(ang) * 11 * s;
  ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * 3 * s, (y - 8 * s) + Math.sin(ang) * 3 * s); ctx.lineTo(wx, wy); ctx.stroke();
  // 杖头宝石光
  var w = p.wands[p.wi];
  ctx.fillStyle = w && w.mana < (w.manaMax * 0.25) ? '#ff6a6a' : '#8ad8ff';
  ctx.fillRect(wx - s, wy - s, 2 * s, 2 * s);
  // 施法闪光
  if (p.castFlash > 0) {
    ctx.globalAlpha = p.castFlash / 3;
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(wx - 2 * s, wy - 2 * s, 4 * s, 4 * s);
    ctx.globalAlpha = 1;
  }
  // 燃烧状态
  if (p.status.burn > 0) { ctx.fillStyle = 'rgba(255,140,40,.6)'; ctx.fillRect(bx - s, by, 10 * s, 16 * s); }
  ctx.restore();
}

function drawEnemies() {
  var s = SCALE;
  for (var i = 0; i < enemyList.length; i++) {
    var e = enemyList[i];
    if (e.x < camX - 40 || e.x > camX + VW + 40 || e.y < camY - 40 || e.y > camY + VH + 40) continue;
    var d = e.d;
    var x = w2sx(e.x), y = w2sy(e.y);
    var bx = x - (e.w / 2) * s, by = y - e.h * s;
    var col = d.col;
    ctx.save();
    if (e.flash > 0) { ctx.globalAlpha = 0.85; }
    if (e.buried) ctx.globalAlpha = 0.55;
    var wob = Math.sin(e.anim * 3) * s;
    if (e.kind === 'flyer') {
      // 翅膀扇动
      ctx.fillStyle = col[2];
      ctx.fillRect(bx - 4 * s, by + 2 * s + wob, 4 * s, 2 * s);
      ctx.fillRect(bx + e.w * s, by + 2 * s - wob, 4 * s, 2 * s);
      ctx.fillStyle = col[1];
      ctx.fillRect(bx, by + wob * 0.3, e.w * s, e.h * s);
      ctx.fillStyle = col[3];
      ctx.fillRect(bx + 2 * s, by + 2 * s + wob * 0.3, e.w * s - 4 * s, 3 * s);
    } else if (e.kind === 'bomber') {
      ctx.fillStyle = col[1];
      ctx.fillRect(bx, by + wob * 0.2, e.w * s, e.h * s);
      ctx.fillStyle = col[3];
      ctx.fillRect(bx + 2 * s, by + 2 * s + wob * 0.2, (e.w - 4) * s, (e.h - 6) * s);
      // 胀缩提示
      var puls = 0.5 + 0.5 * Math.sin(frame * 0.2);
      ctx.fillStyle = 'rgba(255,220,80,' + (0.3 + puls * 0.5) + ')';
      ctx.fillRect(bx + 4 * s, by + 4 * s + wob * 0.2, (e.w - 8) * s, (e.h - 8) * s);
    } else if (e.kind === 'burrower') {
      ctx.fillStyle = col[1];
      ctx.fillRect(bx, by + 3 * s, e.w * s, (e.h - 3) * s);
      ctx.fillStyle = col[3];
      for (var t = 0; t < 3; t++) ctx.fillRect(bx + (2 + t * 4) * s, by + (1 + Math.sin(e.anim * 5 + t) * 1.5) * s, 2 * s, 3 * s);
    } else {
      // 人形怪通用
      ctx.fillStyle = col[1];
      ctx.fillRect(bx + s, by + 10 * s, 2 * s, (e.h - 10) * s + Math.max(0, step2(e)) * s);
      ctx.fillRect(bx + (e.w - 3) * s, by + 10 * s, 2 * s, (e.h - 10) * s + Math.max(0, -step2(e)) * s);
      ctx.fillStyle = col[0];
      ctx.fillRect(bx, by + 4 * s, e.w * s, 7 * s);
      ctx.fillStyle = col[2];
      ctx.fillRect(bx, by + 4 * s, e.w * s, 2 * s);
      ctx.fillStyle = col[1];
      ctx.fillRect(bx + 2 * s, by, (e.w - 4) * s, 5 * s);
    }
    // 眼睛
    ctx.fillStyle = d.eye;
    var ex = e.dir > 0 ? bx + e.w * s - 4 * s : bx + 2 * s;
    ctx.fillRect(ex, by + 3 * s, 2 * s, 2 * s);
    if (e.boss) {
      ctx.fillRect(ex - 3 * s, by + 3 * s, 2 * s, 2 * s);
      ctx.fillRect(ex + 3 * s, by + 3 * s, 2 * s, 2 * s);
      // 血条
      ctx.fillStyle = '#301018'; ctx.fillRect(bx, by - 6 * s, e.w * s, 3 * s);
      ctx.fillStyle = '#ff4a5a'; ctx.fillRect(bx, by - 6 * s, e.w * s * Math.max(0, e.hp / e.mhp), 3 * s);
    }
    if (e.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,244,214,.75)';
      ctx.fillRect(bx - s, by - s, e.w * s + 2 * s, e.h * s + 2 * s);
    }
    ctx.restore();
  }
}
function step2(e) { return Math.abs(e.vx) > 0.2 ? Math.sin(e.anim * 4) * 2 : 0; }

function drawDrops() {
  var s = SCALE;
  for (var i = 0; i < dropList.length; i++) {
    var d = dropList[i];
    if (d.x < camX - 20 || d.x > camX + VW + 20 || d.y < camY - 20 || d.y > camY + VH + 20) continue;
    var x = w2sx(d.x), y = w2sy(d.y) + Math.sin(d.bob) * 2 * s;
    if (d.kind === 'coin') {
      ctx.fillStyle = '#8a6a1c'; ctx.fillRect(x - 2 * s, y - 3 * s, 4 * s, 5 * s);
      ctx.fillStyle = '#f8dc74'; ctx.fillRect(x - s, y - 2 * s, 2 * s, 3 * s);
      ctx.fillStyle = '#fff3c0'; ctx.fillRect(x - s, y - 2 * s, s, s);
    } else if (d.kind === 'hp') {
      ctx.fillStyle = '#3a0e16'; ctx.fillRect(x - 3 * s, y - 4 * s, 6 * s, 7 * s);
      ctx.fillStyle = '#c8515a'; ctx.fillRect(x - 2 * s, y - 2 * s, 4 * s, 4 * s);
      ctx.fillStyle = '#ff9aa6'; ctx.fillRect(x - 2 * s, y - 2 * s, 2 * s, s);
      ctx.fillStyle = '#9ad6ff'; ctx.fillRect(x - s, y - 6 * s, 2 * s, 2 * s);
    } else if (d.kind === 'wand') {
      ctx.strokeStyle = '#7a5a34'; ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(x - 5 * s, y + 3 * s); ctx.lineTo(x + 5 * s, y - 3 * s); ctx.stroke();
      ctx.fillStyle = '#8ad8ff'; ctx.fillRect(x + 4 * s, y - 5 * s, 3 * s, 3 * s);
      if ((frame & 16) === 0) spawnPart(d.x, d.y - 4, 0, -0.1, '#8ad8ff', 16, -0.01);
    }
  }
  // 宝箱（世界里是 M.CHEST 像素，这里加高光）
  for (i = 0; i < chests.length; i++) {
    var c = chests[i];
    if (c.opened) continue;
    if (c.x < camX - 20 || c.x > camX + VW + 20 || c.y < camY - 20 || c.y > camY + VH + 20) continue;
    var cx = w2sx(c.x), cy = w2sy(c.y);
    ctx.fillStyle = 'rgba(255,232,150,' + (0.25 + 0.2 * Math.sin(frame * 0.1 + i)) + ')';
    ctx.fillRect(cx - 6 * s, cy - 8 * s, 12 * s, 12 * s);
  }
}

function drawParticles() {
  var s = SCALE;
  for (var i = 0; i < partList.length; i++) {
    var p = partList[i];
    var a = p.l / p.ml;
    if (a > 0.9) a = 1;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.c;
    ctx.fillRect(w2sx(p.x), w2sy(p.y), Math.max(1, (p.s || 1) * s - 1), Math.max(1, (p.s || 1) * s - 1));
  }
  ctx.globalAlpha = 1;
}

function drawProjectiles() {
  var s = SCALE;
  for (var i = 0; i < projList.length; i++) {
    var p = projList[i];
    var sp = SPELL_BY_ID[p.sid];
    var col = sp ? sp.color : '#ffffff';
    var x = w2sx(p.x), y = w2sy(p.y);
    var r = Math.max(1, p.r * s);
    ctx.fillStyle = col;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x - r - s, y - r - s, (r + s) * 2, (r + s) * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // 拖尾
    if ((frame + i) % 2 === 0) spawnPart(p.x - p.vx * 0.5, p.y - p.vy * 0.5, -p.vx * 0.05, -p.vy * 0.05, col, 8, 0, 1);
  }
}

// 粒子 / 漂浮文字更新
function updateParticles(dt) {
  var f = dt * 60;
  for (var i = partList.length - 1; i >= 0; i--) {
    var p = partList[i];
    p.l -= f;
    if (p.l <= 0) { partList.splice(i, 1); continue; }
    p.vy += p.g * f;
    p.x += p.vx * f; p.y += p.vy * f;
    // 粒子落进固体就消失/变成材料堆积（血渗入地面）
    if (p.c === '#8e1220' || p.c === '#5e0c16') {
      if (SOL(getM(p.x | 0, p.y | 0))) {
        if (rnd() < 0.25) { /* 血渗入土壤 */
          if (MTYPE[getM(p.x | 0, p.y | 0)] === T_POWDER && rnd() < 0.3) setM(p.x | 0, p.y | 0, M.BLOOD);
        }
        partList.splice(i, 1); continue;
      }
      if (rnd() < 0.06 && getM(p.x | 0, p.y | 0) === M.AIR) { setM(p.x | 0, p.y | 0, M.BLOOD); setLife(p.x | 0, p.y | 0, 0); partList.splice(i, 1); continue; }
    } else if (SOL(getM(p.x | 0, p.y | 0))) { partList.splice(i, 1); continue; }
  }
}
// ============================ I. 输入 ============================
var keys = {};
var mouse = { x: 200, y: 112, down: false };
var touch = { left: false, right: false, jump: false, cast: false };
var running = false, paused = false, gameOver = false;
var uiMode = 'title'; // title | play | dead | win | wand | perk

function setupInput() {
  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    if (uiMode === 'play') {
      if (e.code === 'Digit1') switchWand(0);
      if (e.code === 'Digit2') switchWand(1);
      if (e.code === 'Digit3') switchWand(2);
      if (e.code === 'Digit4') switchWand(3);
      if (e.code === 'KeyQ') drinkFlask();
      if (e.code === 'KeyE') useNearby();
      if (e.code === 'KeyR') toggleWandPanel();
      if (e.code === 'Escape') closePanels();
    } else if (uiMode === 'wand' && e.code === 'Escape') closePanels();
    else if (uiMode === 'perk' && e.code === 'Escape') closePanels();
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });

  canvas.addEventListener('mousemove', function (e) {
    var r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width * VW;
    mouse.y = (e.clientY - r.top) / r.height * VH;
    positionCrosshair(e.clientX, e.clientY);
  });
  canvas.addEventListener('mousedown', function (e) {
    if (e.button === 0) { mouse.down = true; ensureAudio(); }
    e.preventDefault();
  });
  window.addEventListener('mouseup', function () { mouse.down = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  // 手机：画面上拖动瞄准
  canvas.addEventListener('touchstart', function (e) {
    ensureAudio();
    var t = e.touches[0], r = canvas.getBoundingClientRect();
    mouse.x = (t.clientX - r.left) / r.width * VW;
    mouse.y = (t.clientY - r.top) / r.height * VH;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    var t = e.touches[0], r = canvas.getBoundingClientRect();
    mouse.x = (t.clientX - r.left) / r.width * VW;
    mouse.y = (t.clientY - r.top) / r.height * VH;
    e.preventDefault();
  }, { passive: false });

  bindTouch('btnLeft', 'left');
  bindTouch('btnRight', 'right');
  bindTouch('btnJump', 'jump');
  bindTouch('btnCast', 'cast');
  bindPress('btnFlask', drinkFlask);
  bindPress('btnWand', function () { switchWand((player.wi + 1) % player.wands.length); });
  bindPress('btnUse', useNearby);

  document.getElementById('startBtn').addEventListener('click', startGame);
  document.getElementById('restartBtn').addEventListener('click', startGame);
  document.getElementById('winBtn').addEventListener('click', startGame);
}
function bindTouch(id, prop) {
  var el = document.getElementById(id);
  var on = function (e) { touch[prop] = true; ensureAudio(); e.preventDefault(); };
  var off = function (e) { touch[prop] = false; e.preventDefault(); };
  el.addEventListener('touchstart', on, { passive: false });
  el.addEventListener('touchend', off, { passive: false });
  el.addEventListener('touchcancel', off, { passive: false });
  el.addEventListener('mousedown', on);
  el.addEventListener('mouseup', off);
  el.addEventListener('mouseleave', off);
}
function bindPress(id, fn) {
  var el = document.getElementById(id);
  el.addEventListener('touchstart', function (e) { ensureAudio(); fn(); e.preventDefault(); }, { passive: false });
  el.addEventListener('mousedown', function (e) { ensureAudio(); fn(); e.preventDefault(); });
}
function positionCrosshair(cx, cy) {
  var el = document.getElementById('crosshair');
  if (cx === undefined) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.style.left = cx + 'px';
  el.style.top = cy + 'px';
}

function switchWand(i) {
  if (!player || i < 0 || i >= player.wands.length) return;
  player.wi = i;
  sfx('click');
  renderWandBar();
}
function drinkFlask() {
  if (!playerAlive || player.flasks <= 0 || player.hp >= player.mhp) return;
  player.flasks--;
  player.hp = Math.min(player.mhp, player.hp + 35);
  addFloat(player.x, player.y - 20, '+35', '#ff6a8a');
  sfx('heal');
  pickMsg('饮下血瓶 +35');
}
function useNearby() {
  if (!playerAlive) return;
  // 开宝箱
  for (var i = 0; i < chests.length; i++) {
    var c = chests[i];
    if (c.opened) continue;
    if (Math.abs(c.x - player.x) < 22 && Math.abs(c.y - (player.y - 8)) < 24) {
      c.opened = true;
      // 炸开箱子像素
      for (var ddx = -2; ddx <= 2; ddx++) for (var ddy = -3; ddy <= 1; ddy++) {
        if (getM(c.x + ddx, c.y + ddy) === M.CHEST) { setM(c.x + ddx, c.y + ddy, M.AIR); setLife(c.x + ddx, c.y + ddy, 0); }
      }
      var n = 3 + (rnd() * 5 | 0);
      for (var k = 0; k < n; k++) spawnDrop(c.x + (rnd() - 0.5) * 8, c.y - 6, 'coin', 2 + (rnd() * 6 | 0));
      if (rnd() < 0.5) spawnDrop(c.x, c.y - 8, 'hp', 0);
      if (rnd() < 0.3) spawnDrop(c.x, c.y - 10, 'wand', 0);
      sfx('chest');
      pickMsg('宝箱开启！');
      spawnBurst(c.x, c.y - 4, 16, ['#ffd76e', '#fff3c0', '#8f5f30']);
      return;
    }
  }
  // 圣山编辑台 / 祝福台：走过去自动触发；E 打开编辑台
  if (nearHoly()) toggleWandPanel();
}

function nearHoly() {
  if (!player) return false;
  var z = zoneAt(player.y);
  return isHM(z);
}
function toggleWandPanel() {
  if (uiMode === 'wand') { closePanels(); return; }
  if (!nearHoly() && !player.freeEdit) { pickMsg('需要回到圣山才能改杖'); return; }
  openWandPanel();
}
function closePanels() {
  document.getElementById('wandPanel').classList.add('hide');
  document.getElementById('perkPanel').classList.add('hide');
  if (uiMode === 'wand' || uiMode === 'perk') uiMode = 'play';
}

// ============================ 圣山魔杖编辑台 ============================
var editorDrag = null;
function openWandPanel() {
  uiMode = 'wand';
  var panel = document.getElementById('wandPanel');
  panel.classList.remove('hide');
  renderWandEditor();
  sfx('click');
}
function spellChip(sp, draggable) {
  var el = document.createElement('div');
  el.className = 'spell ' + (sp.t === 'proj' ? 'p' : sp.t === 'mod' ? 'm' : 't');
  el.textContent = sp.name;
  el.title = sp.desc || sp.name;
  if (draggable) {
    el.draggable = true;
    el.addEventListener('dragstart', function (e) {
      editorDrag = { from: 'pool', id: sp.id };
      e.dataTransfer.setData('text/plain', sp.id);
    });
  }
  return el;
}
function renderWandEditor() {
  var panel = document.getElementById('wandPanel');
  var w = player.wands[player.wi];
  panel.innerHTML = '';
  var head = document.createElement('div');
  head.className = 'pHead';
  head.innerHTML = '<h3>圣山 · 魔杖编辑台</h3><p>把法术拖进槽位（或点击槽位移除）。当前：' + w.name + '</p>';
  panel.appendChild(head);

  var stats = document.createElement('div');
  stats.className = 'pStats';
  stats.innerHTML = '容量 ' + w.capacity + ' · 每次施放 ' + w.spellsPerCast + ' · 间隙 ' + w.castDelay.toFixed(2) + 's · 回充 ' + w.recharge.toFixed(2) + 's · 魔力 ' + w.manaMax + ' +' + w.manaCharge + '/s · ' + (w.shuffle ? '乱序杖' : '顺序杖');
  panel.appendChild(stats);

  var wandRow = document.createElement('div');
  wandRow.className = 'slots';
  for (var i = 0; i < w.capacity; i++) {
    (function (idx) {
      var slot = document.createElement('div');
      slot.className = 'slot';
      var sp = w.slots[idx];
      if (sp) {
        var chip = spellChip(sp, false);
        slot.appendChild(chip);
      } else slot.textContent = '';
      slot.addEventListener('dragover', function (e) { e.preventDefault(); slot.classList.add('over'); });
      slot.addEventListener('dragleave', function () { slot.classList.remove('over'); });
      slot.addEventListener('drop', function (e) {
        e.preventDefault(); slot.classList.remove('over');
        var id = e.dataTransfer.getData('text/plain');
        var sp2 = SPELL_BY_ID[id];
        if (!sp2) return;
        var old = w.slots[idx];
        w.slots[idx] = sp2;
        // 从法术池移除同 id 的一个，放回旧的
        removeFromPool(id);
        if (old) poolSpells.push(old);
        sfx('click'); renderWandEditor(); renderWandBar();
      });
      slot.addEventListener('click', function () {
        if (w.slots[idx]) { poolSpells.push(w.slots[idx]); w.slots[idx] = null; sfx('click'); renderWandEditor(); renderWandBar(); }
      });
      wandRow.appendChild(slot);
    })(i);
  }
  panel.appendChild(wandRow);

  var pool = document.createElement('div');
  pool.className = 'pool';
  var title = document.createElement('div');
  title.className = 'pSub';
  title.textContent = '可用法术（拖到上方槽位）';
  pool.appendChild(title);
  var seen = {};
  for (var j = 0; j < poolSpells.length; j++) {
    var sp3 = poolSpells[j];
    var key = sp3.id;
    if (seen[key]) continue;
    seen[key] = true;
    var count = poolSpells.filter(function (q) { return q.id === key; }).length;
    var chip2 = spellChip(sp3, true);
    if (count > 1) chip2.textContent = sp3.name + ' ×' + count;
    pool.appendChild(chip2);
  }
  panel.appendChild(pool);

  var wandSwitch = document.createElement('div');
  wandSwitch.className = 'pSub';
  wandSwitch.textContent = '切换法杖：';
  panel.appendChild(wandSwitch);
  var wrow = document.createElement('div');
  wrow.className = 'slots';
  for (var q2 = 0; q2 < player.wands.length; q2++) {
    (function (qi) {
      var b = document.createElement('button');
      b.className = 'wBtn' + (qi === player.wi ? ' on' : '');
      b.textContent = player.wands[qi].name;
      b.addEventListener('click', function () { switchWand(qi); renderWandEditor(); });
      wrow.appendChild(b);
    })(q2);
  }
  panel.appendChild(wrow);

  var close = document.createElement('button');
  close.className = 'primary';
  close.textContent = '完成（Esc）';
  close.addEventListener('click', closePanels);
  panel.appendChild(close);
}
var poolSpells = [];
function removeFromPool(id) {
  for (var i = 0; i < poolSpells.length; i++) {
    if (poolSpells[i].id === id) { poolSpells.splice(i, 1); return; }
  }
}

// ============================ 祝福（3 选 1） ============================
var PERKS = [
  { id: 'hp', name: '猩红契约', desc: '最大生命 +40 并回复 40', apply: function () { player.mhp += 40; player.hp = Math.min(player.mhp, player.hp + 40); } },
  { id: 'dmg', name: '灼热意志', desc: '所有法术伤害 +25%', apply: function () { player.dmgMul = (player.dmgMul || 1) + 0.25; } },
  { id: 'mana', name: '深蓝回响', desc: '当前法杖魔力上限 +60，回复 +40%', apply: function () { var w = player.wands[player.wi]; if (w) { w.manaMax += 60; w.manaCharge = Math.round(w.manaCharge * 1.4); w.mana = w.manaMax; } } },
  { id: 'speed', name: '疾风步', desc: '移动与悬浮更强', apply: function () { player.speedMul = (player.speedMul || 1) + 0.2; } },
  { id: 'flask', name: '炼金口袋', desc: '血瓶上限 +2 并补满', apply: function () { player.flaskMax += 2; player.flasks = player.flaskMax; } },
  { id: 'edit', name: '随处改杖', desc: '离开圣山也能打开编辑台', apply: function () { player.freeEdit = true; } },
  { id: 'light', name: '萤火之护', desc: '你的光更亮更大', apply: function () { player.lightMul = (player.lightMul || 1) + 0.5; } },
];
var perkUsed = false;
function maybeOfferPerk() {
  if (perkUsed || !playerAlive) return;
  if (!nearHoly()) return;
  // 进入圣山且尚未选择 → 弹出
  openPerkPanel();
}
function openPerkPanel() {
  uiMode = 'perk';
  perkUsed = true;
  var panel = document.getElementById('perkPanel');
  panel.classList.remove('hide');
  panel.innerHTML = '';
  var head = document.createElement('div');
  head.className = 'pHead';
  head.innerHTML = '<h3>圣山祝福</h3><p>选择一项永久祝福</p>';
  panel.appendChild(head);
  var row = document.createElement('div');
  row.className = 'perks';
  var opts = PERKS.slice();
  for (var i = opts.length - 1; i > 0; i--) { var j = rnd() * (i + 1) | 0; var t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
  for (i = 0; i < 3 && i < opts.length; i++) {
    (function (perk) {
      var b = document.createElement('button');
      b.className = 'perk';
      b.innerHTML = '<b>' + perk.name + '</b><span>' + perk.desc + '</span>';
      b.addEventListener('click', function () {
        perk.apply();
        closePanels();
        sfx('perk');
        pickMsg('获得祝福：' + perk.name);
        // 回复生命 + 补魔
        player.hp = Math.min(player.mhp, player.hp + 30);
        renderHUD();
      });
      row.appendChild(b);
    })(opts[i]);
  }
  panel.appendChild(row);
}

// ============================ 音效（WebAudio 合成） ============================
var audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function tone(freq, dur, type, vol, slide) {
  if (!audioCtx) return;
  var o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), audioCtx.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  o.connect(g); g.connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + dur);
}
function noise(dur, vol, hp) {
  if (!audioCtx) return;
  var n = audioCtx.sampleRate * dur;
  var buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  var data = buf.getChannelData(0);
  for (var i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  var src = audioCtx.createBufferSource(); src.buffer = buf;
  var g = audioCtx.createGain(); g.gain.value = vol || 0.1;
  var f = audioCtx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 400;
  src.connect(f); f.connect(g); g.connect(audioCtx.destination);
  src.start();
}
var lastSfx = {};
function sfx(name) {
  if (!audioCtx) return;
  var now = performance.now();
  if (lastSfx[name] && now - lastSfx[name] < 40) return;
  lastSfx[name] = now;
  switch (name) {
    case 'cast': tone(660, 0.09, 'square', 0.05, -380); noise(0.05, 0.04, 1200); break;
    case 'hit': tone(220, 0.06, 'square', 0.06, -120); noise(0.05, 0.05, 800); break;
    case 'hit2': tone(320, 0.07, 'sawtooth', 0.06, -200); break;
    case 'hurt': tone(180, 0.16, 'sawtooth', 0.09, -100); noise(0.1, 0.07, 300); break;
    case 'jump': tone(300, 0.1, 'square', 0.04, 260); break;
    case 'coin': tone(880, 0.07, 'square', 0.05); setTimeout(function () { tone(1320, 0.09, 'square', 0.05); }, 60); break;
    case 'heal': tone(520, 0.14, 'sine', 0.07, 300); break;
    case 'pickup': tone(440, 0.1, 'square', 0.05, 300); break;
    case 'chest': tone(392, 0.1, 'square', 0.06, 200); setTimeout(function () { tone(587, 0.16, 'square', 0.06); }, 90); break;
    case 'die': tone(200, 0.5, 'sawtooth', 0.1, -160); noise(0.4, 0.08, 200); break;
    case 'boom': tone(90, 0.35, 'sawtooth', 0.12, -50); noise(0.3, 0.14, 150); break;
    case 'hiss': noise(0.25, 0.05, 2000); break;
    case 'eshoot': tone(420, 0.1, 'sawtooth', 0.05, -240); break;
    case 'empty': tone(140, 0.08, 'square', 0.04, -40); break;
    case 'click': tone(720, 0.04, 'square', 0.04); break;
    case 'perk': tone(523, 0.12, 'sine', 0.08); setTimeout(function () { tone(784, 0.2, 'sine', 0.08); }, 110); break;
    case 'zone': tone(392, 0.18, 'sine', 0.07); setTimeout(function () { tone(587, 0.26, 'sine', 0.07); }, 160); break;
  }
}

// ============================ HUD ============================
var lastBiome = -1;
function renderWandBar() {
  var bar = document.getElementById('wandBar');
  bar.innerHTML = '';
  if (!player) return;
  for (var i = 0; i < player.wands.length; i++) {
    var w = player.wands[i];
    var el = document.createElement('div');
    el.className = 'wb' + (i === player.wi ? ' on' : '');
    var spells = w.slots.filter(Boolean).map(function (s) { return s.name; }).join('·');
    el.innerHTML = '<b>' + (i + 1) + '</b> ' + w.name + '<i style="width:' + Math.round(100 * w.mana / w.manaMax) + '%"></i><small>' + (spells || '空') + '</small>';
    (function (idx) { el.addEventListener('click', function () { switchWand(idx); }); })(i);
    bar.appendChild(el);
  }
}
function renderHUD() {
  if (!player) return;
  var hpP = Math.max(0, player.hp / player.mhp);
  document.getElementById('hpFill').style.width = (hpP * 100) + '%';
  document.getElementById('hpText').textContent = Math.max(0, Math.ceil(player.hp)) + '/' + player.mhp;
  var w = player.wands[player.wi];
  var mp = w ? w.mana / w.manaMax : 0;
  document.getElementById('manaFill').style.width = (mp * 100) + '%';
  document.getElementById('manaText').textContent = w ? Math.floor(w.mana) : 0;
  document.getElementById('hoverFill').style.width = Math.max(0, player.breathe / 8 * 100) + '%';
  var z = zoneAt(player.y);
  document.getElementById('biomeName').textContent = ZNAME[z].name;
  document.getElementById('depthText').textContent = Math.max(0, Math.round(player.y - SURF)) + ' m';
  document.getElementById('goldText').textContent = coins + ' 金币';
  document.getElementById('flaskText').textContent = '血瓶 ×' + player.flasks;
  // 材料信息（准星处）
  var wx = Math.floor(camX + mouse.x), wy = Math.floor(camY + mouse.y);
  var mi = document.getElementById('matInfo');
  if (inW(wx, wy)) {
    var m = getM(wx, wy);
    var info = MNAME[m];
    if (MTYPE[m] === T_SOLID || MTYPE[m] === T_POWDER) info += ' · 密度 ' + (MDENS[m] || '—') + ' · 耐久 ' + MHP[m];
    if (MBURN[m] > 0) info += ' · 可燃';
    if (MLIT[m] > 0) info += ' · 发光';
    if (MTYPE[m] === T_LIQUID) info += ' · 密度 ' + MDENS[m];
    mi.textContent = info;
  }
  // 状态图标
  var sr = document.getElementById('statusRow');
  var st = [];
  if (player.status.burn > 0) st.push('<span class="s on burn">燃烧</span>');
  if (player.status.poison > 0) st.push('<span class="s on poison">中毒</span>');
  if (player.inWater) st.push('<span class="s on wet">浸液</span>');
  if (player.breathe < 8) st.push('<span class="s on breath">屏息 ' + Math.ceil(player.breathe) + 's</span>');
  if (st.length) sr.innerHTML = st.join('');
  else sr.innerHTML = '';
  // 生物群系横幅
  if (z !== lastBiome) {
    lastBiome = z;
    showBanner(ZNAME[z].name, ZNAME[z].en || '');
    if (frame > 30) sfx('zone');
    if (isHM(z)) setTimeout(maybeOfferPerk, 600);
  }
  // 道具提示
  var toast = document.getElementById('toast');
  if (pickT > 0) { toast.textContent = pickTxt; toast.classList.add('on'); }
  else toast.classList.remove('on');
}
function showBanner(name, sub) {
  var b = document.getElementById('biomeBanner');
  document.getElementById('bannerName').textContent = name;
  document.getElementById('bannerSub').textContent = sub;
  b.classList.add('on');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(function () { b.classList.remove('on'); }, 2600);
}

// ============================ 死亡 / 胜利 ============================
function showDeath() {
  uiMode = 'dead';
  gameOver = true;
  var el = document.getElementById('dead');
  el.classList.remove('hide');
  document.getElementById('deadCause').textContent = '死因：' + deathCause;
  document.getElementById('deadDesc').textContent = deathDetail + ' · ' + ZNAME[zoneAt(player.y)].en;
  document.getElementById('deadStats').innerHTML =
    '<div><b>' + Math.floor(runTime) + 's</b><span>存活时间</span></div>' +
    '<div><b>' + kills + '</b><span>击杀</span></div>' +
    '<div><b>' + coins + '</b><span>金币</span></div>' +
    '<div><b>' + Math.max(0, Math.round(player.y - SURF)) + 'm</b><span>深度</span></div>';
  positionCrosshair(undefined);
}
function showWin() {
  uiMode = 'win';
  gameOver = true;
  document.getElementById('win').classList.remove('hide');
  document.getElementById('winStats').innerHTML =
    '<div><b>' + Math.floor(runTime) + 's</b><span>用时</span></div>' +
    '<div><b>' + kills + '</b><span>击杀</span></div>' +
    '<div><b>' + coins + '</b><span>金币</span></div>';
  sfx('perk');
}

// ============================ 主循环 ============================
var lastT = 0;                        // frame 已在 A 区声明
function loop(t) {
  requestAnimationFrame(loop);
  if (!running) return;
  var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  frame++;

  var active = (uiMode === 'play');
  if (active && !gameOver) {
    // 玩家
    updatePlayer(dt);
    updateWandBar_if_needed();
    // 敌人与弹体
    updateEnemies(dt);
    updateProjs(dt);
    updateDrops(dt);
    // 像素物理（仅视窗区域）
    SIMX0 = Math.max(0, (camX | 0) - 40);
    SIMX1 = Math.min(W, (camX | 0) + VW + 40);
    SIMY0 = Math.max(0, (camY | 0) - 40);
    SIMY1 = Math.min(H, (camY | 0) + VH + 40);
    updateMaterials();
    updateParticles(dt);
    if (pickT > 0) pickT -= dt;
    // 胜利：击杀 boss
    if (bossKilled && uiMode === 'play') showWin();
    updateCamera(dt);
    render();
    renderHUD();
    renderWandBarLite();
  } else if (uiMode !== 'title') {
    // 面板/死亡时仍渲染世界（定格）
    if (player) { render(); }
  }
}
function updateWandBar_if_needed() { /* 魔力条逐帧刷新 */ }
var wandBarTick = 0;
function renderWandBarLite() {
  if (++wandBarTick % 15 !== 0) return;
  renderWandBar();
}

// ============================ 启动 ============================
function startGame() {
  ensureAudio();
  document.getElementById('title').classList.add('hide');
  document.getElementById('dead').classList.add('hide');
  document.getElementById('win').classList.add('hide');
  closePanels();
  gameOver = false;
  bossKilled = false;
  lastBiome = -1;
  perkUsed = false;
  var sd = (Math.random() * 0xffffffff) >>> 0;
  genWorld(sd);
  initPlayer();
  poolSpells = SPELLS.filter(function (s) { return s.t !== 'pass'; }).slice();
  // 初始池：给一部分法术，其余探索获取
  poolSpells = ['spark', 'spark', 'bolt', 'dmgUp', 'speedUp', 'triple', 'fire', 'pierce', 'trigTimer', 'trigBoom', 'bomb'].map(function (id) { return SPELL_BY_ID[id]; });
  camX = clamp(player.x - VW / 2, 0, W - VW);
  camY = clamp(player.y - VH / 2, 0, H - VH);
  uiMode = 'play';
  running = true;
  renderWandBar();
  showBanner(ZNAME[0].name, ZNAME[0].en);
  pickMsg('远征开始');
}

function boot() {
  ctx = scene;
  ctx.imageSmoothingEnabled = false;
  buildPalettes();
  buildPal32();
  setupRender();
  setupInput();
  // 先生成世界用于标题背景
  genWorld((Math.random() * 0xffffffff) >>> 0);
  initPlayer();
  poolSpells = ['spark', 'bolt', 'fire', 'dmgUp', 'speedUp', 'triple', 'pierce'].map(function (id) { return SPELL_BY_ID[id]; });
  camX = clamp(player.x - VW / 2, 0, W - VW);
  camY = clamp(player.y - VH / 2, 0, H - VH);
  render();
  requestAnimationFrame(function (t) { lastT = t; requestAnimationFrame(loop); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
