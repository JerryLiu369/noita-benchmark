/* ==========================================================================
   余烬深渊 · EMBERDEEP
   A falling-sand wand-crafting roguelite. Pure front-end, no build, no assets.
   All art is generated in code; all names are original.
   ========================================================================== */
(() => {
'use strict';

// ---------------------------------------------------------------- constants
const VW = 424, VH = 240;          // internal render resolution
const W = 640;                      // world width (cells)
const CS = 32;                      // simulation chunk size
const SIM_MARGIN = 80;              // cells simulated outside the view
const STEP = 1 / 60;
const GRAV = 430;
const SANCT_H = 112, FINAL_H = 180;

// ---------------------------------------------------------------- rng / math
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RNG = mulberry32(1);
const rnd = () => RNG();
const rr = (a, b) => a + (b - a) * RNG();
const ri = (a, b) => Math.floor(a + (b - a + 1) * RNG());
const rpick = (arr) => arr[Math.floor(RNG() * arr.length)];
const fr = Math.random;
const frr = (a, b) => a + (b - a) * Math.random();
const fpick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
function wpick(weights, rand = rnd) {
  let tot = 0; for (const k in weights) tot += weights[k];
  let r = rand() * tot;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return k; }
  return Object.keys(weights)[0];
}
function shuffleArr(a, rand = fr) {
  for (let i = a.length - 1; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1013, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s, p) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  let x0 = xi, x1 = xi + 1, y0 = yi, y1 = yi + 1;
  if (p) { x0 = ((x0 % p) + p) % p; x1 = ((x1 % p) + p) % p; y0 = ((y0 % p) + p) % p; y1 = ((y1 % p) + p) % p; }
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct, p) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(x * f, y * f, s + o * 101, p ? p * f : 0);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function pack(r, g, b) { return ((255 << 24) | (clamp(b | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(r | 0, 0, 255)) >>> 0; }
const scalec = (a, f) => [a[0] * f, a[1] * f, a[2] * f];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cssc = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// ---------------------------------------------------------------- materials
const T_AIR = 0, T_SOLID = 1, T_POWDER = 2, T_LIQUID = 3, T_GAS = 4, T_FIRE = 5;
const MATS = [], M = Object.create(null);
function defm(key, o) { o.key = key; o.id = MATS.length; MATS.push(o); M[key] = o.id; }
// solids
defm('air',       { n: '空气', t: T_AIR });
defm('bedrock',   { n: '基岩', t: T_SOLID, dur: 255, noAcid: 1, pat: 'camo', a: '#1d1e29', b: '#15161f', edge: '#2e3040' });
defm('rock',      { n: '岩石', t: T_SOLID, dur: 10, pat: 'camo', a: '#6b5a3b', b: '#363b4d', edge: '#a38d5c' });
defm('dirt',      { n: '泥土', t: T_SOLID, dur: 6, pat: 'camo', a: '#604129', b: '#48311f', edge: '#8d6541' });
defm('darkrock',  { n: '黑岩', t: T_SOLID, dur: 11, pat: 'camo', a: '#45434c', b: '#29282f', edge: '#77747f' });
defm('coal',      { n: '煤', t: T_SOLID, dur: 8, pat: 'coal', a: '#1b1a1e', b: '#2b2a31', edge: '#4a4a55', flam: 0.02, fuel: 250, burnRate: 0.1, burnTo: 'ash' });
defm('wood',      { n: '木头', t: T_SOLID, dur: 6, pat: 'wood', a: '#72502e', b: '#5a3c22', c: '#3a2614', edge: '#94703f', flam: 0.07, fuel: 110, burnRate: 0.45, burnTo: 'air' });
defm('goldore',   { n: '金矿', t: T_SOLID, dur: 9, pat: 'ore', a: '#62553a', b: '#3a3b4a', c: '#f2c94c', edge: '#a38d5c' });
defm('ice',       { n: '冰', t: T_SOLID, dur: 7, pat: 'ice', a: '#9fd3ec', b: '#7ab5da', edge: '#e2f7ff', melt: 'water' });
defm('brick',     { n: '圣殿砖', t: T_SOLID, dur: 255, noAcid: 1, pat: 'brick', a: '#6f5d51', b: '#58483f', c: '#2a211c', edge: '#c9a14a' });
defm('metal',     { n: '钢铁', t: T_SOLID, dur: 13, pat: 'metal', a: '#5b626d', b: '#737c89', edge: '#a0a8b6' });
defm('glass',     { n: '玻璃', t: T_SOLID, dur: 9, noAcid: 1, pat: 'plain', a: '#7fb2c4', b: '#a4cddb', edge: '#e0f4fa' });
defm('moss',      { n: '苔草', t: T_SOLID, soft: 1, dur: 2, pat: 'moss', a: '#3d7a2b', b: '#5b9b35', noEdge: 1, flam: 0.25, fuel: 18, burnRate: 0.5, burnTo: 'air' });
defm('vine',      { n: '藤蔓', t: T_SOLID, soft: 1, dur: 1, pat: 'moss', a: '#2c5925', b: '#437f2e', noEdge: 1, flam: 0.3, fuel: 22, burnRate: 0.5, burnTo: 'air' });
defm('fungus',    { n: '菌毯', t: T_SOLID, soft: 1, dur: 4, pat: 'fungus', a: '#6c3f8c', b: '#3a8c7f', c: '#c4ffe9', noEdge: 1, flam: 0.04, fuel: 60, burnRate: 0.4, burnTo: 'ash', emit: [0.22, 0.12, 0.45] });
defm('mushcap',   { n: '菌盖', t: T_SOLID, dur: 4, pat: 'fungus', a: '#9b3563', b: '#7a2750', c: '#ffd8ec', noEdge: 1, flam: 0.05, fuel: 50, burnRate: 0.4, burnTo: 'ash', emit: [0.25, 0.06, 0.16] });
defm('fungrock',  { n: '菌岩', t: T_SOLID, dur: 10, pat: 'camo', a: '#40304e', b: '#23383c', edge: '#71598a' });
defm('frostrock', { n: '霜岩', t: T_SOLID, dur: 10, pat: 'camo', a: '#8ea4bb', b: '#4b5c78', edge: '#d7e7f5' });
defm('volcanic',  { n: '火山岩', t: T_SOLID, dur: 11, pat: 'camo', a: '#44241d', b: '#241719', edge: '#7e3c27' });
defm('obsidian',  { n: '玄岩', t: T_SOLID, dur: 11, pat: 'camo', a: '#241e2e', b: '#302839', edge: '#5b4b70' });
defm('crystal',   { n: '晶簇', t: T_SOLID, dur: 9, pat: 'ice', a: '#55cfc6', b: '#3a8fb0', edge: '#c2fff8', emit: [0.08, 0.4, 0.42] });
// powders
defm('sand',      { n: '沙', t: T_POWDER, dens: 60, dur: 3, a: '#caa963', b: '#b0904f' });
defm('snow',      { n: '雪', t: T_POWDER, dens: 40, dur: 2, a: '#e7eff9', b: '#cedcea', melt: 'water' });
defm('gunpowder', { n: '火药', t: T_POWDER, dens: 55, dur: 3, a: '#3d393b', b: '#57514f', flam: 0.7, fuel: 4, burnRate: 1, burnTo: 'air', boom: 1 });
defm('ash',       { n: '灰烬', t: T_POWDER, dens: 30, dur: 1, a: '#5f5b59', b: '#7b7573' });
defm('gravel',    { n: '碎石', t: T_POWDER, dens: 70, dur: 4, a: '#6b6359', b: '#4b4741' });
// liquids
defm('water',     { n: '水', t: T_LIQUID, dens: 30, disp: 5, a: '#2c6e93', b: '#3886a8', top: '#79c3e3', alpha: 0.7 });
defm('oil',       { n: '油', t: T_LIQUID, dens: 20, disp: 4, a: '#3b2d1c', b: '#4b3b25', top: '#8f7d52', alpha: 0.93, flam: 0.35, fuel: 70, burnRate: 0.6, burnTo: 'smoke' });
defm('blood',     { n: '血', t: T_LIQUID, dens: 36, disp: 3, a: '#8d1515', b: '#a51d1d', top: '#d44343', alpha: 0.9 });
defm('acid',      { n: '酸液', t: T_LIQUID, dens: 33, disp: 4, a: '#8fe02b', b: '#b3f041', top: '#e9ff92', alpha: 0.86, emit: [0.18, 0.38, 0.04], dmg: 0.55, cause: 'acid' });
defm('lava',      { n: '熔岩', t: T_LIQUID, dens: 62, disp: 2, visc: 0.45, a: '#ff7a18', b: '#ffae30', top: '#fff0a0', alpha: 1, emit: [1.0, 0.46, 0.1], dmg: 1.3, cause: 'lava' });
defm('toxic',     { n: '毒泥', t: T_LIQUID, dens: 42, disp: 2, a: '#57d52f', b: '#79ee47', top: '#c8ff8f', alpha: 0.9, emit: [0.14, 0.42, 0.05], dmg: 0.3, cause: 'toxic' });
defm('slime',     { n: '黏液', t: T_LIQUID, dens: 38, disp: 1, visc: 0.5, a: '#9e3f8d', b: '#b75aa5', top: '#e08ad0', alpha: 0.9 });
defm('tonic',     { n: '愈合药液', t: T_LIQUID, dens: 34, disp: 4, a: '#df4faf', b: '#ff6fcb', top: '#ffc1ed', alpha: 0.86, emit: [0.35, 0.08, 0.26], heal: 1 });
// gases
defm('steam',     { n: '蒸汽', t: T_GAS, dens: 5, a: '#c9d7e1', b: '#adbcc8', alpha: 0.36, life: 150, decay: 0.5 });
defm('smoke',     { n: '烟', t: T_GAS, dens: 4, a: '#3a3434', b: '#4c4545', alpha: 0.55, life: 90, decay: 0.6 });
defm('toxgas',    { n: '毒气', t: T_GAS, dens: 6, a: '#7bd44b', b: '#58b83a', alpha: 0.42, life: 230, decay: 0.12, dmg: 0.16, cause: 'toxic' });
defm('flamgas',   { n: '沼气', t: T_GAS, dens: 3, a: '#a19a62', b: '#8d8b59', alpha: 0.24, life: 255, decay: 0.03, flam: 0.9, fuel: 1, burnTo: 'fire' });
// fire
defm('fire',      { n: '火焰', t: T_FIRE, a: '#ffb030', b: '#ff6a10', life: 28, emit: [1.0, 0.55, 0.15], dmg: 0.2, cause: 'fire' });

const NM = MATS.length;
const mT = new Uint8Array(NM), mDens = new Uint8Array(NM), mDur = new Uint8Array(NM), mDisp = new Uint8Array(NM);
const mFuel = new Uint8Array(NM), mBurnTo = new Uint8Array(NM), mLife = new Uint8Array(NM), mPat = new Uint8Array(NM);
const mNoAcid = new Uint8Array(NM), mNoEdge = new Uint8Array(NM), mBoom = new Uint8Array(NM), mOpen = new Uint8Array(NM);
const mMelt = new Uint8Array(NM), mEmitOn = new Uint8Array(NM), mHeal = new Uint8Array(NM), mWalk = new Uint8Array(NM);
// soft decor (moss, vines, fungus mats): static like a solid, but bodies and projectiles pass through it
const mSoft = new Uint8Array(NM), mHard = new Uint8Array(NM);
const mFlam = new Float32Array(NM), mBurnRate = new Float32Array(NM), mVisc = new Float32Array(NM), mAlpha = new Float32Array(NM);
const mDecay = new Float32Array(NM), mDmg = new Float32Array(NM), mER = new Float32Array(NM), mEG = new Float32Array(NM), mEB = new Float32Array(NM);
const mCause = [];
const PATS = { rand: 0, camo: 1, brick: 2, wood: 3, metal: 4, ore: 5, coal: 6, ice: 7, moss: 8, fungus: 9, plain: 10 };
for (const d of MATS) {
  const m = d.id;
  mT[m] = d.t; mDens[m] = d.dens || 0;
  mDur[m] = d.dur != null ? d.dur : (d.t === T_SOLID ? 10 : 1);
  mDisp[m] = d.disp || 0; mFuel[m] = d.fuel || 0; mLife[m] = d.life || 0;
  mPat[m] = d.pat ? PATS[d.pat] : 0; mNoAcid[m] = d.noAcid ? 1 : 0; mNoEdge[m] = d.noEdge ? 1 : 0;
  mBoom[m] = d.boom ? 1 : 0; mOpen[m] = (d.t === T_AIR || d.t === T_LIQUID || d.t === T_GAS || d.t === T_FIRE) ? 1 : 0;
  mSoft[m] = d.soft ? 1 : 0; mHard[m] = d.t === T_SOLID && !d.soft ? 1 : 0;
  mWalk[m] = ((d.t === T_SOLID && !d.soft) || d.t === T_POWDER) ? 1 : 0;
  mFlam[m] = d.flam || 0; mBurnRate[m] = d.burnRate || 0.5; mVisc[m] = d.visc || 0; mAlpha[m] = d.alpha || 1;
  mDecay[m] = d.decay || 0; mDmg[m] = d.dmg || 0; mCause[m] = d.cause || null; mHeal[m] = d.heal ? 1 : 0;
  if (d.emit) { mEmitOn[m] = 1; mER[m] = d.emit[0]; mEG[m] = d.emit[1]; mEB[m] = d.emit[2]; }
}
for (const d of MATS) {
  if (d.burnTo) mBurnTo[d.id] = M[d.burnTo];
  if (d.melt) mMelt[d.id] = M[d.melt];
}
const MA = M.air, MBED = M.bedrock, MWATER = M.water, MOIL = M.oil, MBLOOD = M.blood, MACID = M.acid, MLAVA = M.lava;
const MTOXIC = M.toxic, MSLIME = M.slime, MTONIC = M.tonic, MSTEAM = M.steam, MSMOKE = M.smoke, MTOXGAS = M.toxgas;
const MFLAMGAS = M.flamgas, MFIRE = M.fire, MSNOW = M.snow, MICE = M.ice, MOBS = M.obsidian, MASH = M.ash;
const MGOLD = M.goldore, MGRAVEL = M.gravel, MSAND = M.sand, MGUN = M.gunpowder, MBRICK = M.brick, MWOOD = M.wood;

// ---------------------------------------------------------------- palettes & textures
const PAL = new Uint32Array(NM * 8), PR = new Uint8Array(NM * 8), PG = new Uint8Array(NM * 8), PB = new Uint8Array(NM * 8);
const PTOP = new Uint32Array(NM), PEDGE = new Uint32Array(NM);
(function buildPalettes() {
  for (const d of MATS) {
    const m = d.id; if (!m) continue;
    const A = hexRGB(d.a), B = hexRGB(d.b || d.a), C = d.c ? hexRGB(d.c) : A;
    const fa = d.t === T_SOLID ? [0.74, 0.9, 1.04, 1.2] : d.t === T_POWDER ? [0.8, 0.93, 1.05, 1.18] : [0.9, 0.96, 1.02, 1.08];
    const cols = [];
    for (let k = 0; k < 4; k++) cols.push(scalec(A, fa[k]));
    for (let k = 0; k < 4; k++) cols.push(scalec(B, fa[k]));
    switch (d.pat) {
      case 'brick': cols[0] = C; cols[4] = scalec(A, 1.28); break;
      case 'wood': cols[0] = C; break;
      case 'ore': cols[7] = C; cols[6] = mixc(C, [255, 250, 200], 0.4); break;
      case 'coal': cols[7] = [92, 92, 112]; break;
      case 'ice': cols[7] = [236, 250, 255]; cols[6] = [200, 236, 250]; break;
      case 'moss': cols[6] = [240, 202, 72]; cols[7] = [228, 96, 144]; break;
      case 'fungus': cols[6] = mixc(B, C, 0.5); cols[7] = C; break;
      case 'metal': cols[0] = scalec(A, 0.6); cols[7] = scalec(B, 1.45); break;
    }
    for (let k = 0; k < 8; k++) {
      const c = cols[k]; const j = m * 8 + k;
      PAL[j] = pack(c[0], c[1], c[2]); PR[j] = clamp(c[0], 0, 255); PG[j] = clamp(c[1], 0, 255); PB[j] = clamp(c[2], 0, 255);
    }
    const E = d.edge ? hexRGB(d.edge) : scalec(A, 1.35);
    PEDGE[m] = pack(...mixc(A, E, 0.55));
    PTOP[m] = pack(...(d.top ? hexRGB(d.top) : E));
  }
})();
const TOPR = new Uint8Array(NM), TOPG = new Uint8Array(NM), TOPB = new Uint8Array(NM);
for (const d of MATS) if (d.top) { const c = hexRGB(d.top); TOPR[d.id] = c[0]; TOPG[d.id] = c[1]; TOPB[d.id] = c[2]; }
const FIRECOL = [[255, 250, 210], [255, 232, 140], [255, 196, 70], [255, 150, 40], [246, 108, 26], [214, 70, 20], [160, 44, 18], [110, 30, 16]].map(c => pack(...c));
const EMBERCOL = [[255, 224, 110], [255, 170, 50], [240, 110, 30], [200, 70, 20]].map(c => pack(...c));

const TEXN = 512, TEX = new Uint8Array(TEXN * TEXN);
const BGN = 256, BGT = new Uint8Array(BGN * BGN);
(function buildTextures() {
  for (let y = 0; y < TEXN; y++) for (let x = 0; x < TEXN; x++) {
    const n1 = fbm(x / 16, y / 16, 7, 3, 32);
    const n2 = fbm(x / 4, y / 4, 13, 2, 128);
    const h = hash2(x, y, 99);
    let v = n2 > 0.54 ? 2 : 1;
    if (Math.abs(n1 - 0.5) < 0.012) v = 0;
    else if (h < 0.05) v = 3; else if (h < 0.1) v = 0;
    TEX[y * TEXN + x] = (n1 > 0.5 ? 4 : 0) | v;
  }
  for (let y = 0; y < BGN; y++) for (let x = 0; x < BGN; x++) {
    const n1 = fbm(x / 21.333, y / 21.333, 55, 3, 12);
    const h = hash2(x, y, 77);
    let v = n1 > 0.56 ? 2 : n1 > 0.44 ? 1 : 0;
    if (h < 0.035) v = 3;
    BGT[y * BGN + x] = v;
  }
})();

function shadeFor(m, x, y) {
  switch (mPat[m]) {
    case 0: return (fr() * 8) | 0;
    case 1: return TEX[((y & 511) << 9) | (x & 511)];
    case 2: {
      const row = Math.floor(y / 6), off = (row & 1) * 6;
      if (y % 6 === 0 || (x + off) % 12 === 0) return 0;
      const b = hash2(Math.floor((x + off) / 12), row, 5) < 0.5 ? 5 : 1;
      if (y % 6 === 1) return 4;
      return b + ((hash2(x, y, 6) * 2.4) | 0);
    }
    case 3: {
      const r = y & 3;
      if (r === 0) return 0;
      return (hash2((x / 5) | 0, y, 8) < 0.5 ? 1 : 2) + (((y >> 2) & 1) ? 4 : 0);
    }
    case 4: {
      const lx = x & 7, ly = y & 7;
      if (lx === 0 || ly === 0) return 0;
      if (lx === 2 && ly === 2) return 7;
      return 4 + ((hash2(x >> 3, y >> 3, 4) * 2) | 0) + (ly === 1 ? 1 : 0);
    }
    case 5: { const t = TEX[((y & 511) << 9) | (x & 511)]; return hash2(x, y, 11) < 0.2 ? 7 : (t === 7 ? 6 : t); }
    case 6: { const t = TEX[((y & 511) << 9) | (x & 511)]; return hash2(x, y, 21) < 0.05 ? 7 : (t & 5); }
    case 7: { if ((x + y) % 11 < 2) return 7; const h = hash2(x, y, 23); return h < 0.08 ? 6 : TEX[((y & 511) << 9) | (x & 511)] & 5; }
    case 8: { const h = hash2(x, y, 31); return h < 0.07 ? 7 : h < 0.11 ? 6 : (h * 6) | 0; }
    case 9: { const h = hash2(x, y, 37); return h < 0.07 ? 7 : h < 0.14 ? 6 : TEX[((y & 511) << 9) | (x & 511)] & 5; }
    default: return (hash2(x, y, 3) * 4) | 0;
  }
}

// ---------------------------------------------------------------- world storage
let H = 0, N = 0, CW = 0, CHN = 0;
let mat, shade, life, flg, awake, awakeNext, regionOf, markArr;
let clock = 1;
let camX = 0, camY = 0;
function allocWorld(h) {
  if (h !== H) {
    H = h; N = W * H; CW = W / CS; CHN = H / CS;
    mat = new Uint8Array(N); shade = new Uint8Array(N); life = new Uint8Array(N); flg = new Uint8Array(N);
    awake = new Uint8Array(CW * CHN); awakeNext = new Uint8Array(CW * CHN);
    regionOf = new Uint8Array(H); markArr = new Int32Array(N);
  } else {
    mat.fill(0); shade.fill(0); life.fill(0); flg.fill(0); awake.fill(0); awakeNext.fill(0); markArr.fill(0);
  }
}
const inW = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const matAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? MBED : mat[(y | 0) * W + (x | 0)];
function wakeXY(x, y) {
  const cx = x >> 5, cy = y >> 5, c = cy * CW + cx;
  awakeNext[c] = 1;
  const lx = x & 31, ly = y & 31;
  if (lx === 0 && cx > 0) awakeNext[c - 1] = 1; else if (lx === 31 && cx < CW - 1) awakeNext[c + 1] = 1;
  if (ly === 0 && cy > 0) awakeNext[c - CW] = 1; else if (ly === 31 && cy < CHN - 1) awakeNext[c + CW] = 1;
}
function wakeI(i) { const y = (i / W) | 0; wakeXY(i - y * W, y); }
function setI(i, m, lf) {
  mat[i] = m; life[i] = lf === undefined ? mLife[m] : lf;
  const y = (i / W) | 0, x = i - y * W;
  shade[i] = shadeFor(m, x, y);
  flg[i] = clock;
  wakeXY(x, y);
}
function setM(x, y, m, lf) { if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return; setI(y * W + x, m, lf); }
function rawSet(x, y, m) { const i = y * W + x; mat[i] = m; shade[i] = shadeFor(m, x, y); life[i] = mLife[m]; }
function swapC(i, j) {
  const a = mat[i]; mat[i] = mat[j]; mat[j] = a;
  const s = shade[i]; shade[i] = shade[j]; shade[j] = s;
  const l = life[i]; life[i] = life[j]; life[j] = l;
  flg[i] = clock; flg[j] = clock;
  wakeI(i); wakeI(j);
}
function wakeRect(x0, y0, x1, y1) {
  const cx0 = clamp(x0 >> 5, 0, CW - 1), cx1 = clamp(x1 >> 5, 0, CW - 1), cy0 = clamp(y0 >> 5, 0, CHN - 1), cy1 = clamp(y1 >> 5, 0, CHN - 1);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) awakeNext[cy * CW + cx] = 1;
}

// ---------------------------------------------------------------- cellular simulation
const NB = [0, 0, 0, 0];
let pendingBooms = [];
let simStats = { cells: 0, fire: 0 };
function simStep() {
  clock = clock >= 255 ? 1 : clock + 1;
  NB[0] = -W; NB[1] = W; NB[2] = -1; NB[3] = 1;
  const t = awake; awake = awakeNext; awakeNext = t; awakeNext.fill(0);
  const x0 = Math.max(1, camX - SIM_MARGIN), x1 = Math.min(W - 2, camX + VW + SIM_MARGIN);
  const y0 = Math.max(1, camY - SIM_MARGIN), y1 = Math.min(H - 2, camY + VH + SIM_MARGIN);
  const cx0 = x0 >> 5, cx1 = x1 >> 5, cy0 = y0 >> 5, cy1 = y1 >> 5;
  // keep chunks outside the window asleep-but-remembered
  for (let cy = 0; cy < CHN; cy++) for (let cx = 0; cx < CW; cx++) {
    const c = cy * CW + cx;
    if (awake[c] && (cx < cx0 || cx > cx1 || cy < cy0 || cy > cy1)) awakeNext[c] = 1;
  }
  let cells = 0;
  for (let y = y1; y >= y0; y--) {
    const rowC = (y >> 5) * CW;
    const ltr = ((y + clock) & 1) === 0;
    for (let k = cx0; k <= cx1; k++) {
      const cx = ltr ? k : cx1 - (k - cx0);
      if (!awake[rowC + cx]) continue;
      const xs = Math.max(x0, cx << 5), xe = Math.min(x1, (cx << 5) + 31);
      cells += xe - xs + 1;
      if (ltr) { for (let x = xs; x <= xe; x++) updCell(x, y); }
      else { for (let x = xe; x >= xs; x--) updCell(x, y); }
    }
  }
  simStats.cells = cells;
  if (pendingBooms.length) {
    const list = pendingBooms; pendingBooms = [];
    for (const b of list) explode(b.x, b.y, b.r, b.pow, b.dmg, null, { fire: true, quiet: list.length > 3 });
  }
}
function updCell(x, y) {
  const i = y * W + x;
  const m = mat[i];
  if (m === 0 || flg[i] === clock) return;
  switch (mT[m]) {
    case T_SOLID: if (life[i] && mFuel[m]) burnTick(i, m, x, y); return;
    case T_POWDER: if (life[i] && mFuel[m]) { if (burnTick(i, m, x, y)) return; } powder(i, m); return;
    case T_LIQUID: liquid(i, m, x, y); return;
    case T_GAS: gas(i, m); return;
    case T_FIRE: fireCell(i); return;
  }
}
function isWetMat(t) { return t === MWATER || t === MBLOOD || t === MSLIME || t === MTONIC; }
function ignite(n, t) {
  if (mT[t] === T_GAS) { setI(n, MFIRE, 16 + ((fr() * 10) | 0)); return; }
  if (!mFuel[t] || life[n]) return;
  life[n] = mFuel[t]; wakeI(n);
}
function burnTick(i, m, x, y) {
  wakeXY(x, y);
  const n = i + NB[(fr() * 4) | 0];
  const t = mat[n];
  if (isWetMat(t) || t === MSNOW) { life[i] = 0; if (fr() < 0.3) setI(n, MSTEAM); return false; }
  if (t === 0) { if (fr() < 0.35) setI(n, MFIRE, 8 + ((fr() * 14) | 0)); }
  else if (mFlam[t] > 0 && !life[n] && fr() < mFlam[t] * 2.2) ignite(n, t);
  else if (t === MICE && fr() < 0.05) setI(n, MWATER);
  const up = i - W;
  if (mat[up] === 0 && fr() < 0.22) setI(up, MFIRE, 6 + ((fr() * 14) | 0));
  if (mBoom[m]) { setI(i, 0); pendingBooms.push({ x, y, r: 5, pow: 6, dmg: 14 }); return true; }
  if (fr() < mBurnRate[m]) {
    if (--life[i] <= 1) {
      const to = mBurnTo[m];
      if (to === MASH) setI(i, fr() < 0.5 ? MASH : 0);
      else if (to === 0) setI(i, fr() < 0.25 ? MSMOKE : 0);
      else setI(i, to);
      return true;
    }
  }
  return false;
}
function sinkInto(t, d) {
  const tt = mT[t];
  return tt === T_AIR || tt === T_GAS || tt === T_FIRE || (tt === T_LIQUID && mDens[t] < d && fr() < 0.45);
}
function powder(i, m) {
  const d = mDens[m];
  let j = i + W, t = mat[j];
  if (sinkInto(t, d)) { swapC(i, j); return; }
  if (mT[t] === T_LIQUID && mDens[t] < d) { wakeI(i); return; }
  if (m === MSNOW) { // snow melts beside heat
    const n = i + NB[(fr() * 4) | 0]; const tn = mat[n];
    if (tn === MLAVA || tn === MFIRE) { setI(i, MWATER); return; }
  }
  const dir = fr() < 0.5 ? -1 : 1;
  j = i + W + dir; t = mat[j];
  if (mOpen[mat[i + dir]] && sinkInto(t, d)) { if (fr() < 0.85) swapC(i, j); else wakeI(i); return; }
  j = i + W - dir; t = mat[j];
  if (mOpen[mat[i - dir]] && sinkInto(t, d)) { if (fr() < 0.85) swapC(i, j); else wakeI(i); return; }
}
function liquid(i, m, x, y) {
  if (life[i] && mFuel[m]) { if (burnTick(i, m, x, y)) return; }
  if (react(i, m)) return;
  if (m === MACID) wakeXY(x, y);
  const visc = mVisc[m];
  if (visc && fr() < visc) { wakeXY(x, y); return; }
  const d = mDens[m];
  let j = i + W, t = mat[j], tt = mT[t];
  if (tt === T_AIR || tt === T_GAS || tt === T_FIRE) { swapC(i, j); return; }
  if (tt === T_LIQUID && t !== m && mDens[t] < d) { if (fr() < 0.5) swapC(i, j); else wakeXY(x, y); return; }
  const dir = fr() < 0.5 ? -1 : 1;
  j = i + W + dir; t = mat[j]; tt = mT[t];
  if (tt === T_AIR || tt === T_GAS || tt === T_FIRE) { swapC(i, j); return; }
  j = i + W - dir; t = mat[j]; tt = mT[t];
  if (tt === T_AIR || tt === T_GAS || tt === T_FIRE) { swapC(i, j); return; }
  const disp = mDisp[m];
  let k = i;
  for (let s = 1; s <= disp; s++) {
    const nj = i + dir * s, q = mat[nj], qt = mT[q];
    if (qt === T_AIR || qt === T_GAS) { k = nj; if (mat[nj + W] === 0) break; }
    else break;
  }
  if (k !== i) { swapC(i, k); return; }
  const nj = i - dir, q = mat[nj], qt = mT[q];
  if (qt === T_AIR || qt === T_GAS) { swapC(i, nj); return; }
  // lighter liquid beside a heavier one slowly trades places sideways -> helps layering
  if (qt === T_LIQUID && q !== m && mDens[q] > d && mat[i - W] !== m && fr() < 0.1) swapC(i, nj);
}
function react(i, m) {
  if (m === MLAVA) {
    for (let k = 0; k < 4; k++) {
      const n = i + NB[k], t = mat[n];
      if (t === 0 || t === MLAVA) continue;
      if (t === MWATER) { setI(i, MOBS); setI(n, MSTEAM); sfxWorld('hiss', i); return true; }
      if (t === MBLOOD || t === MSLIME || t === MTONIC) { setI(i, MOBS); setI(n, MSTEAM); return true; }
      if (t === MTOXIC) { setI(i, MOBS); setI(n, MTOXGAS); return true; }
      if (t === MSNOW || t === MICE) { setI(n, MWATER); wakeI(i); return false; }
      if (t === MACID) { setI(n, MTOXGAS); return false; }
      if (mFlam[t] > 0 && !life[n]) { ignite(n, t); wakeI(i); }
    }
    if (mat[i - W] === 0 && fr() < 0.004) setI(i - W, MFIRE, 6);
    return false;
  }
  const n = i + NB[(fr() * 4) | 0], t = mat[n];
  if (t === 0 || t === m) return false;
  if (m === MWATER) {
    if (t === MFIRE) { setI(n, MSTEAM); return false; }
    if (t === MTOXIC && fr() < 0.02) { setI(n, MWATER); return false; }
    return false;
  }
  if (m === MACID) {
    const tt = mT[t];
    if ((tt === T_SOLID || tt === T_POWDER) && !mNoAcid[t]) {
      const p = 0.22 * (1 - mDur[t] / 16);
      if (fr() < p) {
        setI(n, fr() < 0.18 ? MFLAMGAS : 0);
        if (fr() < 0.28) { setI(i, fr() < 0.35 ? MFLAMGAS : 0); return true; }
      }
    }
    return false;
  }
  if (m === MBLOOD) { if (t === MTOXIC && fr() < 0.05) { setI(i, MSLIME); setI(n, MSMOKE); return true; } return false; }
  return false;
}
function gas(i, m) {
  wakeI(i);
  if (fr() < mDecay[m]) {
    if (life[i] <= 1) { setI(i, (m === MSTEAM && fr() < 0.22) ? MWATER : 0); return; }
    life[i]--;
  }
  const r = fr();
  let j = i - W, t = mat[j];
  if (t === 0) { if (r < 0.72) { swapC(i, j); return; } }
  else if (mT[t] === T_LIQUID && r < 0.3) { swapC(i, j); return; }
  const dir = fr() < 0.5 ? -1 : 1;
  j = i - W + dir; t = mat[j];
  if (t === 0 && r < 0.85) { swapC(i, j); return; }
  j = i + dir; t = mat[j];
  if (t === 0 || (mT[t] === T_GAS && t !== m && fr() < 0.3)) swapC(i, j);
}
function fireCell(i) {
  wakeI(i);
  const lf = life[i];
  if (lf <= 1) { setI(i, fr() < 0.22 ? MSMOKE : 0); return; }
  life[i] = lf - 1;
  simStats.fire++;
  for (let k = 0; k < 2; k++) {
    const n = i + NB[(fr() * 4) | 0], t = mat[n];
    if (t === 0 || t === MFIRE) continue;
    if (isWetMat(t)) { setI(i, MSTEAM); if (fr() < 0.2) setI(n, MSTEAM); return; }
    if (t === MSNOW || t === MICE) { if (fr() < 0.08) setI(n, MWATER); continue; }
    if (mFlam[t] > 0 && !life[n] && fr() < mFlam[t]) ignite(n, t);
  }
  if (fr() < 0.55) {
    const j = i - W + ((fr() * 3) | 0) - 1;
    if (mat[j] === 0) swapC(i, j);
  }
}

// ---------------------------------------------------------------- terrain editing helpers
function freezeArea(x, y, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    const xx = (x + dx) | 0, yy = (y + dy) | 0;
    if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
    const i = yy * W + xx, m = mat[i];
    if (m === MWATER || m === MBLOOD || m === MSLIME || m === MTONIC) setI(i, MICE);
    else if (m === MLAVA) setI(i, MOBS);
    else if (m === MFIRE) setI(i, MSTEAM);
    else if (life[i] && mFuel[m]) life[i] = 0;
  }
}
function placeBlob(x, y, r, m, onlyAir = true, chance = 1) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r || fr() > chance) continue;
    const xx = (x + dx) | 0, yy = (y + dy) | 0;
    if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
    const i = yy * W + xx;
    if (onlyAir ? (mat[i] === 0 || mT[mat[i]] === T_GAS) : mDur[mat[i]] < 200) setI(i, m);
  }
}
function debrisOf(m) {
  const t = mT[m];
  if (t === T_POWDER || t === T_LIQUID) return m;
  if (m === MICE) return MSNOW;
  if (m === MWOOD || m === M.moss || m === M.vine || m === M.fungus) return 0;
  if (m === M.coal) return MASH;
  if (m === MGOLD) return MSAND;
  return MGRAVEL;
}
function digCircle(x, y, r, pow, debris = 0.08, owner = null) {
  let dug = 0;
  const r2 = r * r;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d2 = dx * dx + dy * dy; if (d2 > r2) continue;
    const xx = (x + dx) | 0, yy = (y + dy) | 0;
    if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
    const i = yy * W + xx, m = mat[i];
    if (m === 0) continue;
    const t = mT[m];
    if (t === T_GAS || t === T_FIRE || t === T_LIQUID) continue;
    if (mDur[m] > pow) continue;
    if (m === MGOLD && fr() < 0.07) spawnGold(xx, yy, 5, true);
    if (fr() < debris) { const dm = debrisOf(m); if (dm) addMatP(xx, yy, frr(-40, 40) + dx * 8, frr(-80, -10) + dy * 6, dm, PAL[m * 8 + shade[i]]); }
    setI(i, 0); dug++;
  }
  return dug;
}

// ---------------------------------------------------------------- particles
const PMAX = 6000;
const pX = new Float32Array(PMAX), pY = new Float32Array(PMAX), pVX = new Float32Array(PMAX), pVY = new Float32Array(PMAX);
const pLife = new Float32Array(PMAX), pMax = new Float32Array(PMAX), pCol = new Uint32Array(PMAX), pMat = new Uint8Array(PMAX), pFl = new Uint8Array(PMAX);
let pN = 0;
const PF_GRAV = 1, PF_DRAG = 2, PF_GLOW = 4, PF_RISE = 8, PF_COLL = 16, PF_FADE = 32;
function addP(x, y, vx, vy, lifeF, col, flags) {
  if (pN >= PMAX) return -1;
  const k = pN++;
  pX[k] = x; pY[k] = y; pVX[k] = vx; pVY[k] = vy; pLife[k] = lifeF; pMax[k] = lifeF; pCol[k] = col; pMat[k] = 0; pFl[k] = flags;
  return k;
}
function addMatP(x, y, vx, vy, m, col) {
  const k = addP(x, y, vx, vy, 240, col === undefined ? PAL[m * 8 + ((fr() * 8) | 0)] : col, PF_GRAV);
  if (k >= 0) pMat[k] = m;
}
function burst(x, y, n, col, spd = 80, lifeF = 24, flags = PF_GRAV | PF_GLOW, spread = Math.PI * 2, ang = 0) {
  const c = typeof col === 'number' ? col : pack(...col);
  for (let k = 0; k < n; k++) {
    const a = ang + (fr() - 0.5) * spread, s = spd * (0.3 + fr() * 0.9);
    addP(x, y, Math.cos(a) * s, Math.sin(a) * s, lifeF * (0.5 + fr() * 0.8), c, flags);
  }
}
function updParticles() {
  for (let k = 0; k < pN; k++) {
    pLife[k] -= 1;
    const fl = pFl[k];
    let x = pX[k], y = pY[k];
    if (pLife[k] <= 0 || x < 1 || y < 1 || x >= W - 1 || y >= H - 1) { killP(k); k--; continue; }
    if (fl & PF_GRAV) pVY[k] += GRAV * STEP * 0.8;
    if (fl & PF_RISE) pVY[k] -= 40 * STEP;
    if (fl & PF_DRAG) { pVX[k] *= 0.93; pVY[k] *= 0.93; }
    const nx = x + pVX[k] * STEP, ny = y + pVY[k] * STEP;
    if (pMat[k]) {
      // material particle: re-enter the grid when it hits something
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(nx - x), Math.abs(ny - y))));
      let landed = false;
      for (let s = 1; s <= steps; s++) {
        const sx = x + (nx - x) * s / steps, sy = y + (ny - y) * s / steps;
        const ci = (sy | 0) * W + (sx | 0);
        const t = mat[ci];
        if (t !== 0 && mT[t] !== T_GAS && mT[t] !== T_FIRE) {
          const px = (x + (nx - x) * (s - 1) / steps) | 0, py = (y + (ny - y) * (s - 1) / steps) | 0;
          depositMat(px, py, pMat[k]);
          landed = true; break;
        }
      }
      if (landed || pLife[k] <= 1) { if (!landed) depositMat(nx | 0, ny | 0, pMat[k]); killP(k); k--; continue; }
    } else if (fl & PF_COLL) {
      const t = mat[(ny | 0) * W + (nx | 0)];
      if (mWalk[t] || mT[t] === T_LIQUID) { pVX[k] *= -0.3; pVY[k] *= -0.3; continue; }
    }
    pX[k] = nx; pY[k] = ny;
  }
}
function depositMat(x, y, m) {
  for (let k = 0; k < 4; k++) {
    const yy = y - k; if (yy < 1 || x < 1 || x >= W - 1 || yy >= H - 1) return;
    const i = yy * W + x;
    if (mat[i] === 0 || mT[mat[i]] === T_GAS) { setI(i, m); return; }
  }
}
function killP(k) {
  const l = --pN;
  if (k !== l) { pX[k] = pX[l]; pY[k] = pY[l]; pVX[k] = pVX[l]; pVY[k] = pVY[l]; pLife[k] = pLife[l]; pMax[k] = pMax[l]; pCol[k] = pCol[l]; pMat[k] = pMat[l]; pFl[k] = pFl[l]; }
}

// ---------------------------------------------------------------- explosions & feedback
let shakeAmt = 0;
function addShake(a) { shakeAmt = Math.min(14, shakeAmt + a); }
let flashes = [];
function addFlash(x, y, r, col, t = 10) { if (flashes.length < 90) flashes.push({ x, y, r, col, t, max: t }); }
function explode(x, y, r, pow, dmg, owner, opts = {}) {
  x |= 0; y |= 0;
  const r2 = r * r, rr2 = (r + 2) * (r + 2);
  for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) {
    const d2 = dx * dx + dy * dy; if (d2 > rr2) continue;
    const xx = x + dx, yy = y + dy;
    if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
    const i = yy * W + xx, m = mat[i];
    if (d2 > r2) { // rim: ignite
      if (m && mFlam[m] > 0 && !life[i] && fr() < 0.5) ignite(i, m);
      continue;
    }
    if (m === 0) { if (opts.fire && fr() < 0.12) setI(i, MFIRE, 8 + ((fr() * 18) | 0)); continue; }
    const t = mT[m];
    if (t === T_LIQUID) {
      if (fr() < 0.4 && d2 < r2 * 0.6) { addMatP(xx, yy, dx * 14 + frr(-30, 30), dy * 10 - frr(40, 110), m); setI(i, 0); }
      continue;
    }
    if (t === T_GAS) { if (mFlam[m] > 0) setI(i, MFIRE, 10); continue; }
    if (t === T_FIRE) continue;
    if (mDur[m] > pow) { if (mFlam[m] > 0 && !life[i]) ignite(i, m); continue; }
    if (mBoom[m]) { setI(i, 0); if (fr() < 0.03) pendingBooms.push({ x: xx, y: yy, r: 5, pow: 6, dmg: 14 }); continue; }
    if (m === MGOLD && fr() < 0.05) spawnGold(xx, yy, 4, true);
    if (fr() < 0.1) { const dm = debrisOf(m); if (dm) addMatP(xx, yy, dx * 16 + frr(-25, 25), dy * 12 - frr(50, 130), dm, PAL[m * 8 + shade[i]]); }
    else if (fr() < 0.1) addP(xx, yy, dx * 12, dy * 12 - 40, 20 + fr() * 20, PAL[m * 8 + shade[i]], PF_GRAV);
    if (opts.fire && fr() < 0.3) setI(i, MFIRE, 8 + ((fr() * 18) | 0)); else setI(i, 0);
  }
  wakeRect(x - r - 4, y - r - 4, x + r + 4, y + r + 4);
  // visual feedback
  const sparkN = Math.min(60, 10 + r * 3);
  burst(x, y, sparkN, [255, 210, 110], 60 + r * 9, 22, PF_GRAV | PF_GLOW | PF_DRAG);
  burst(x, y, sparkN >> 1, [255, 120, 40], 40 + r * 6, 30, PF_GLOW | PF_DRAG);
  for (let k = 0; k < r; k++) addP(x + frr(-r, r), y + frr(-r, r), frr(-20, 20), frr(-40, -10), 50 + fr() * 50, pack(60, 55, 58), PF_RISE | PF_DRAG);
  addFlash(x, y, r * 5 + 20, [255, 180, 90], 12);
  addShake(Math.min(10, r * 0.4));
  if (!opts.quiet) sfx('boom', r);
  // damage entities
  const reach = r * 1.6 + 4;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = dist(x, y, e.x, e.y - e.h / 2);
    if (d > reach + e.w / 2) continue;
    const f = clamp(1 - d / (reach + e.w / 2), 0, 1);
    damageEnemy(e, dmg * (0.35 + 0.65 * f), { kind: 'explosion', owner });
    if (!e.fixed) { const a = Math.atan2(e.y - e.h / 2 - y, e.x - x); e.vx += Math.cos(a) * 160 * f; e.vy += Math.sin(a) * 160 * f - 60 * f; }
  }
  if (player && !player.dead) {
    const d = dist(x, y, player.x, player.y - 6);
    if (d < reach + 3) {
      const f = clamp(1 - d / (reach + 3), 0, 1);
      if (!hasPerk('blastward')) hurtPlayer(dmg * (0.3 + 0.7 * f) * (owner === 'player' ? 0.6 : 1), owner === 'player' ? 'selfboom' : 'explosion', opts.srcName);
      const a = Math.atan2(player.y - 6 - y, player.x - x);
      player.vx += Math.cos(a) * 180 * f; player.vy += Math.sin(a) * 180 * f - 80 * f;
    }
  }
  for (const p of pickups) {
    if (p.fixed) continue;
    const d = dist(x, y, p.x, p.y); if (d > reach * 1.5) continue;
    const f = 1 - d / (reach * 1.5), a = Math.atan2(p.y - y, p.x - x);
    p.vx += Math.cos(a) * 150 * f; p.vy += Math.sin(a) * 150 * f - 60 * f;
  }
}

// ---------------------------------------------------------------- biomes / regions
const BIOMES = [
  { key: 'mines', name: '塌陷矿坑', en: 'THE SUNKEN MINES', h: 420, base: 'rock', tier: 1, open: 0.56,
    ambient: [16, 13, 14], bg: ['#0f0c0f', '#16110f', '#1d1614', '#261c18'], drone: 55,
    enemies: { tusker: 3, bat: 2, bloat: 1.3, hexer: 1.1, worm: 0.35 } },
  { key: 'coal', name: '煤烬坑道', en: 'THE CINDER PITS', h: 420, base: 'darkrock', tier: 2, open: 0.55,
    ambient: [14, 11, 11], bg: ['#0c0a0b', '#131012', '#1a1517', '#221b1c'], drone: 49,
    enemies: { tusker: 2, bloat: 3, hexer: 2, bat: 1.4, worm: 1 } },
  { key: 'fungal', name: '菌丝洞窟', en: 'THE MYCELIUM GROTTO', h: 440, base: 'fungrock', tier: 3, open: 0.53,
    ambient: [13, 10, 20], bg: ['#0c0a12', '#120f1b', '#181426', '#1d1a2e'], drone: 62,
    enemies: { spore: 3, bat: 2, hexer: 2, worm: 1.4, bloat: 1 } },
  { key: 'snow', name: '霜蚀深谷', en: 'THE RIMEFROST HOLLOW', h: 440, base: 'frostrock', tier: 4, open: 0.54,
    ambient: [17, 21, 30], bg: ['#0d1118', '#131a24', '#1a2330', '#212c3b'], drone: 73,
    enemies: { wraith: 3, tusker: 2, bat: 2, hexer: 1.5, worm: 1 } },
  { key: 'lava', name: '熔心炉底', en: 'THE MAGMA HEARTH', h: 460, base: 'volcanic', tier: 5, open: 0.55,
    ambient: [24, 11, 8], bg: ['#130807', '#1b0c0a', '#24100c', '#2e140e'], drone: 41,
    enemies: { blob: 3, hexer: 2, bloat: 2, wraith: 1, worm: 1.5, bat: 1 } },
];
const SANCT_AMB = [40, 30, 22], SANCT_BG = ['#1a1310', '#211813', '#2a1e17', '#33251b'];
const FINAL_AMB = [30, 12, 8], FINAL_BG = ['#150807', '#1e0b09', '#280f0b', '#33130d'];
let REG = [];
let regionBG = []; // per region: Uint32Array(4) packed + components
function layoutRegions() {
  REG = []; let y = 0;
  for (let b = 0; b < BIOMES.length; b++) {
    REG.push({ kind: 'biome', bi: b, y0: y, y1: y + BIOMES[b].h }); y += BIOMES[b].h;
    REG.push({ kind: 'sanct', bi: b, k: b, y0: y, y1: y + SANCT_H }); y += SANCT_H;
  }
  REG.push({ kind: 'final', bi: 4, y0: y, y1: y + FINAL_H }); y += FINAL_H;
  const h = Math.ceil(y / CS) * CS; REG[REG.length - 1].y1 = h;
  for (const r of REG) {
    const bg = r.kind === 'biome' ? BIOMES[r.bi].bg : r.kind === 'sanct' ? SANCT_BG : FINAL_BG;
    r.amb = r.kind === 'biome' ? BIOMES[r.bi].ambient : r.kind === 'sanct' ? SANCT_AMB : FINAL_AMB;
    r.bgc = bg.map(hexRGB);
    r.bgp = new Uint32Array(r.bgc.map(c => pack(...c)));
    r.name = r.kind === 'biome' ? BIOMES[r.bi].name : r.kind === 'sanct' ? '静息圣所' : '余烬之心';
    r.en = r.kind === 'biome' ? BIOMES[r.bi].en : r.kind === 'sanct' ? 'THE QUIET SANCTUM' : 'THE HEART OF EMBERS';
    r.tier = r.kind === 'biome' ? BIOMES[r.bi].tier : r.kind === 'final' ? 6 : BIOMES[r.bi].tier;
  }
  return h;
}
const sanctEntryX = (k) => (k % 2 ? 150 : 490);
const sanctExitX = (k) => (k % 2 ? 490 : 150);
const regionAt = (y) => REG[regionOf[clamp(y | 0, 0, H - 1)]];

// ---------------------------------------------------------------- world generation
let genStamp = 1;
const CAMP = { x0: 282, x1: 358, y0: 16, y1: 62 };
function pickSolid(bi, mv, ov) {
  switch (bi) {
    case 0: if (ov > 0.8 && mv < 0.55) return MGOLD; if (mv > 0.67) return M.dirt; if (mv < 0.19) return MSAND; return M.rock;
    case 1: if (ov > 0.81) return MGOLD; if (mv > 0.64) return M.coal; if (mv < 0.17) return MGUN; if (mv < 0.3) return M.rock; return M.darkrock;
    case 2: if (ov > 0.82) return MGOLD; if (mv > 0.7) return M.dirt; if (mv < 0.18) return MSAND; return M.fungrock;
    case 3: if (ov > 0.83) return MGOLD; if (mv > 0.65) return MICE; if (mv < 0.2) return MSNOW; return M.frostrock;
    default: if (ov > 0.85) return MGOLD; if (mv > 0.68) return MOBS; if (mv < 0.17) return MGRAVEL; return M.volcanic;
  }
}
function genBiome(r) {
  const b = BIOMES[r.bi], s = (rnd() * 1e6) | 0;
  const y0 = r.y0, y1 = r.y1, hh = y1 - y0;
  const GX = (W >> 2) + 2, GY = (hh >> 2) + 3;
  const F = new Float32Array(GX * GY), MF = new Float32Array(GX * GY), OF = new Float32Array(GX * GY);
  for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
    const wx = gx * 4, wy = y0 + gy * 4, k = gy * GX + gx;
    const c = fbm(wx / 66, wy / 50, s, 4);
    const w1 = Math.abs(fbm(wx / 58, wy / 44, s + 33, 3) - 0.5);
    const w2 = Math.abs(fbm(wx / 34, wy / 84, s + 71, 3) - 0.5);
    let v = (c - b.open) * 5;
    v = Math.max(v, (0.03 - w1) * 11, (0.021 - w2) * 9);
    const ey = Math.min(wy - y0, y1 - wy); if (ey < 20) v -= (20 - ey) * 0.05;
    const ex = Math.min(wx, W - wx); if (ex < 34) v -= (34 - ex) * 0.03;
    F[k] = v; MF[k] = fbm(wx / 42, wy / 30, s + 5, 2); OF[k] = vnoise(wx / 9, wy / 9, s + 9);
  }
  for (let y = y0; y < y1; y++) {
    const fy = (y - y0) / 4, gy = fy | 0, ty = fy - gy;
    for (let x = 0; x < W; x++) {
      const gx = x >> 2, tx = (x & 3) / 4, k = gy * GX + gx;
      const a = F[k], bb = F[k + 1], c = F[k + GX], d = F[k + GX + 1];
      const v = a + (bb - a) * tx + (c - a) * ty + (a - bb - c + d) * tx * ty + (hash2(x, y, s) - 0.5) * 0.05;
      const i = y * W + x;
      life[i] = 0;
      if (v > 0) { mat[i] = 0; shade[i] = 0; continue; }
      const mv = MF[k] + (MF[k + GX + 1] - MF[k]) * (tx + ty) * 0.5, ov = OF[k] + (OF[k + 1] - OF[k]) * tx;
      const m = pickSolid(r.bi, mv, ov);
      mat[i] = m; shade[i] = shadeFor(m, x, y);
    }
  }
}
function carveCircle(cx, cy, rad, yMin, yMax) {
  const r2 = rad * rad;
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    if (dx * dx + dy * dy > r2) continue;
    const x = (cx + dx) | 0, y = (cy + dy) | 0;
    if (x < 6 || x >= W - 6 || y < yMin || y >= yMax) continue;
    const i = y * W + x;
    if (mat[i] !== MBED && mat[i] !== MBRICK) { mat[i] = 0; shade[i] = 0; life[i] = 0; }
  }
}
const descent = [];
function carveCamp() {
  for (let y = CAMP.y0; y < CAMP.y1; y++) for (let x = CAMP.x0; x < CAMP.x1; x++) {
    const cx = Math.min(x - CAMP.x0, CAMP.x1 - 1 - x), cy = y - CAMP.y0;
    if (cx < 8 && cy < 8 - cx) continue;
    const i = y * W + x; mat[i] = 0; shade[i] = 0; life[i] = 0;
  }
}
function pathWalk(pts, fn) { // same wiggle as carvePath, 2px steps
  for (let p = 0; p < pts.length - 1; p++) {
    const [ax, ay] = pts[p], [bx, by] = pts[p + 1];
    const steps = Math.ceil(dist(ax, ay, bx, by) / 2);
    for (let t = 0; t <= steps; t++) { const f = t / steps; fn(lerp(ax, bx, f) + Math.sin(f * Math.PI * 3 + p) * 10 * Math.sin(f * Math.PI), lerp(ay, by, f)); }
  }
}
// final pass: platforms, ice crusts, caps or sand that landed on a descent tunnel get cleared so a body always fits
function openDescent() {
  const clear = (x, y, yMin, yMax) => {
    if (x < 6 || x >= W - 6 || y < yMin || y >= yMax) return;
    const i = y * W + x, m = mat[i];
    if ((mHard[m] && m !== MBED && m !== MBRICK) || mT[m] === T_POWDER) { mat[i] = 0; shade[i] = 0; life[i] = 0; }
  };
  for (const { pts, yMin, yMax } of descent) {
    const rock = [M.rock, M.darkrock, M.fungrock, M.frostrock, M.volcanic][REG[regionOf[yMin]].bi];
    pathWalk(pts, (cx, cy) => {
      // tall ellipse riding just above the centerline: always leaves headroom for a standing body
      cy = Math.max(cy, yMin + 15);
      for (let dy = -15; dy <= 5; dy++) for (let dx = -7; dx <= 7; dx++) if (dx * dx / 49 + (dy + 5) * (dy + 5) / 100 <= 1) clear((cx + dx) | 0, (cy + dy) | 0, yMin, yMax);
      // loose powder hanging over the tunnel would trickle back in: pack it into rock
      for (let dy = -30; dy <= 4; dy++) for (let dx = -17; dx <= 17; dx++) {
        const x = (cx + dx) | 0, y = (cy + dy) | 0;
        if (x < 6 || x >= W - 6 || y < yMin || y >= yMax || dx * dx / 289 + (dy + 10) * (dy + 10) / 400 > 1) continue;
        if (mT[mat[y * W + x]] === T_POWDER) rawSet(x, y, rock);
      }
    });
    // straight funnels into the sanctum shafts at both ends
    const [sx, sy] = pts[0], [ex] = pts[pts.length - 1];
    for (let y = yMax - 18; y < yMax; y++) for (let x = ex - 7; x <= ex + 7; x++) clear(x, y, yMin, yMax);
    for (let y = sy; y < sy + 24; y++) for (let x = sx - 7; x <= sx + 7; x++) clear(x, y, yMin, yMax);
  }
}
function carvePath(x0, y0, x1, y1, rMin, rMax, yMin, yMax, lead = 0) {
  const pts = [[x0, y0]];
  if (lead) { pts.push([x0, y0 + lead]); y0 += lead; }
  const segs = Math.max(2, Math.round((y1 - y0) / 75));
  for (let k = 1; k < segs; k++) pts.push([ri(70, W - 70), y0 + (y1 - y0) * k / segs + ri(-15, 15)]);
  pts.push([x1, y1]);
  descent.push({ pts, yMin, yMax });
  const s = (rnd() * 1e5) | 0;
  pathWalk(pts, (x, y) => carveCircle(x, y, Math.round(rMin + (rMax - rMin) * vnoise(x / 20, y / 20, s)), yMin, yMax));
}
function isFloorCell(i) { const b = mat[i + W]; return mat[i] === 0 && (mT[b] === T_SOLID || mT[b] === T_POWDER); }
function findSpot(y0, y1, need = { w: 7, h: 12 }, opts = {}) {
  for (let tries = 0; tries < 300; tries++) {
    const x = ri(16, W - 17);
    let y = ri(y0 + 8, y1 - 8);
    if (mat[y * W + x] !== 0) continue;
    if (opts.air) {
      let ok = true;
      for (let dy = 0; dy < need.h && ok; dy++) for (let dx = -(need.w >> 1); dx <= need.w >> 1; dx++) if (mat[(y - dy) * W + x + dx] !== 0) { ok = false; break; }
      if (ok) return { x, y };
      continue;
    }
    let k = 0;
    while (k < 60 && y < y1 - 2 && mat[(y + 1) * W + x] === 0) { y++; k++; }
    if (k >= 60 || y >= y1 - 2) continue;
    const fm = mat[(y + 1) * W + x];
    if (mT[fm] !== T_SOLID && mT[fm] !== T_POWDER) continue;
    if (opts.noLiquid !== false) {
      let bad = false; for (let dy = 0; dy < 3; dy++) if (mT[mat[(y - dy) * W + x]] === T_LIQUID) bad = true;
      if (bad) continue;
    }
    let ok = true;
    for (let dy = 1; dy <= need.h && ok; dy++) for (let dx = -(need.w >> 1); dx <= need.w >> 1; dx++) {
      const m = mat[(y - dy) * W + x + dx];
      if (m !== 0 && !mNoEdge[m]) { ok = false; break; }
    }
    if (!ok) continue;
    if (opts.avoid && opts.avoid.some(p => Math.abs(p.x - x) < opts.avoidR && Math.abs(p.y - y) < opts.avoidR)) continue;
    return { x, y: y + 1 };
  }
  return null;
}
function fillBasin(x, y, liq, depth, maxCells, dir, yMin, yMax, mixWith) {
  genStamp++;
  const L = dir > 0 ? y - depth : y + depth;
  const start = y * W + x;
  if (mat[start] !== 0) return 0;
  const q = [start]; markArr[start] = genStamp;
  let h = 0;
  while (h < q.length) {
    const i = q[h++];
    if (q.length > maxCells) return 0;
    const cy = (i / W) | 0, cx = i - cy * W;
    if (cx < 6 || cx >= W - 6 || cy <= yMin + 2 || cy >= yMax - 2) return 0;
    for (let k = 0; k < 4; k++) {
      const n = k === 0 ? i - W : k === 1 ? i + W : k === 2 ? i - 1 : i + 1;
      const ny = k === 0 ? cy - 1 : k === 1 ? cy + 1 : cy;
      if (dir > 0 ? ny < L : ny > L) continue;
      if (markArr[n] === genStamp || mat[n] !== 0) continue;
      markArr[n] = genStamp; q.push(n);
    }
  }
  if (q.length < 8) return 0;
  for (const i of q) {
    const m = mixWith && fr() < 0.4 ? mixWith : liq;
    mat[i] = m; life[i] = mLife[m]; const cy = (i / W) | 0; shade[i] = shadeFor(m, i - cy * W, cy);
  }
  return q.length;
}
function placeTorch(x, y) { torches.push({ x, y, ph: fr() * 10 }); }
function platform(x, y, len, m, thick = 2, posts = true) {
  for (let k = 0; k < len; k++) for (let t = 0; t < thick; t++) {
    const xx = x + k, yy = y + t; if (xx < 6 || xx >= W - 6) continue;
    const i = yy * W + xx; if (mat[i] === 0 || mNoEdge[mat[i]]) rawSet(xx, yy, m);
  }
  if (!posts) return;
  for (let px = x + 2; px < x + len - 1; px += ri(9, 14)) {
    for (let yy = y + thick; yy < y + 60; yy++) {
      const i = yy * W + px; if (mat[i] !== 0 && !mNoEdge[mat[i]]) break;
      rawSet(px, yy, m);
    }
  }
}
function decorate(r) {
  const bi = r.bi, s = (rnd() * 1e5) | 0;
  for (let y = r.y0 + 3; y < r.y1 - 3; y++) for (let x = 6; x < W - 6; x++) {
    const i = y * W + x; if (mat[i] !== 0) continue;
    const below = mat[i + W], above = mat[i - W];
    const floor = mT[below] === T_SOLID && below !== MBED && !mNoEdge[below];
    const ceil = mT[above] === T_SOLID && above !== MBED && !mNoEdge[above];
    const h = hash2(x, y, s), cl = vnoise(x / 9, y / 9, s + 1);
    if (floor) {
      if (bi === 0 && cl > 0.35) { const n = 1 + ((h * 3.4) | 0); for (let k = 0; k < n; k++) if (mat[i - k * W] === 0) rawSet(x, y - k, M.moss); }
      else if (bi === 1 && cl > 0.4) { rawSet(x, y, MASH); if (h < 0.4 && mat[i - W] === 0) rawSet(x, y - 1, MASH); }
      else if (bi === 2 && cl > 0.2) { const n = 1 + ((h * 2.2) | 0); for (let k = 0; k < n; k++) if (mat[i - k * W] === 0) rawSet(x, y - k, M.fungus); }
      else if (bi === 3) { const n = 1 + ((cl * 4) | 0); for (let k = 0; k < n; k++) if (mat[i - k * W] === 0) rawSet(x, y - k, MSNOW); }
    } else if (ceil) {
      if (bi === 0 && h < 0.07) { const n = 2 + ((hash2(x, y, s + 4) * 10) | 0); for (let k = 0; k < n; k++) { if (mat[i + k * W] !== 0) break; rawSet(x, y + k, M.vine); } }
      else if (bi === 2 && cl > 0.45) { const n = 1 + ((h * 3) | 0); for (let k = 0; k < n; k++) { if (mat[i + k * W] !== 0) break; rawSet(x, y + k, M.fungus); } }
      else if (bi === 3 && h < 0.06) { const n = 2 + ((hash2(x, y, s + 4) * 7) | 0); for (let k = 0; k < n; k++) { if (mat[i + k * W] !== 0) break; rawSet(x, y + k, MICE); } }
      else if (bi === 1 && h < 0.02) { const n = 3 + ((hash2(x, y, s + 4) * 6) | 0); for (let k = 0; k < n; k++) { if (mat[i + k * W] !== 0) break; rawSet(x, y + k, M.vine); } }
    }
  }
}
function genSanctum(r) {
  const y0 = r.y0, y1 = r.y1, k = r.k;
  const ex = sanctEntryX(k), xx = sanctExitX(k);
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) rawSet(x, y, x < 4 || x >= W - 4 ? MBED : MBRICK);
  const rx0 = 108, rx1 = 532, ry0 = y0 + 26, ry1 = y0 + 88;
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
    // rounded arch ceiling
    const cx = Math.min(x - rx0, rx1 - 1 - x), cy = y - ry0;
    if (cx < 10 && cy < 10 - cx) continue;
    const i = y * W + x; mat[i] = 0; shade[i] = 0; life[i] = 0;
  }
  for (let y = y0; y < ry0 + 2; y++) for (let x = ex - 7; x <= ex + 7; x++) { const i = y * W + x; mat[i] = 0; shade[i] = 0; }
  for (let y = ry1 - 1; y < y1; y++) for (let x = xx - 8; x <= xx + 8; x++) { const i = y * W + x; mat[i] = 0; shade[i] = 0; }
  // gold trim along the floor
  for (let x = rx0; x < rx1; x++) if (mat[ry1 * W + x] === MBRICK) shade[ry1 * W + x] = 4;
  // layout: shop on the entry side, perks towards the exit
  const dir = xx > ex ? 1 : -1;
  const at = (f) => Math.round(ex + (xx - ex) * f);
  const fl = ry1;
  const tier = BIOMES[r.bi].tier + 1;
  const shopXs = [at(0.13), at(0.22), at(0.31), at(0.40)];
  shopXs.forEach((sx, n) => {
    if (n < 2) { const w = genWand(tier); pickups.push(mkPickup('shop', sx, fl, { item: { kind: 'wand', wand: w }, price: 60 + tier * 40 + w.cap * 15 + ri(0, 40), fixed: true })); }
    else { const sp = randSpell(tier); pickups.push(mkPickup('shop', sx, fl, { item: { kind: 'spell', id: sp }, price: Math.round(SP[sp].price * (0.8 + tier * 0.15)), fixed: true })); }
  });
  pickups.push(mkPickup('altar', at(0.52), fl, { fixed: true }));
  const perkX = [at(0.62), at(0.7), at(0.78)];
  const grp = 'pg' + k;
  const pk = randPerks(3);
  perkX.forEach((px, n) => pickups.push(mkPickup('perk', px, fl, { perk: pk[n], group: grp, fixed: true })));
  pickups.push(mkPickup('reroll', at(0.88), fl, { group: grp, fixed: true }));
  torches.push({ x: rx0 + 14, y: fl - 20, ph: 1 }, { x: rx1 - 14, y: fl - 20, ph: 2 }, { x: (rx0 + rx1) >> 1, y: ry0 + 16, ph: 3 });
  r.room = { x0: rx0, x1: rx1, y0: ry0, y1: ry1 };
}
function genFinal(r) {
  const y0 = r.y0, y1 = r.y1;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
    const m = x < 4 || x >= W - 4 ? MBED : pickSolid(4, fbm(x / 30, y / 30, 5, 2), vnoise(x / 9, y / 9, 7));
    rawSet(x, y, m);
  }
  const cx = 320, cy = y0 + 92, rx = 292, ry = 78;
  for (let y = y0 + 6; y < y1 - 6; y++) for (let x = 8; x < W - 8; x++) {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + (vnoise(x / 16, y / 16, 3) - 0.5) * 0.25;
    if (d < 1) { const i = y * W + x; mat[i] = 0; shade[i] = 0; life[i] = 0; }
  }
  const ent = sanctExitX(4);
  for (let y = y0; y < y0 + 30; y++) for (let x = ent - 8; x <= ent + 8; x++) { const i = y * W + x; mat[i] = 0; shade[i] = 0; }
  // lava lake
  const lakeTop = y0 + 138;
  for (let y = lakeTop; y < y1 - 4; y++) for (let x = 8; x < W - 8; x++) { const i = y * W + x; if (mat[i] === 0) rawSet(x, y, MLAVA); }
  // obsidian pillar + side ledges
  for (let y = y0 + 104; y < y1 - 4; y++) for (let x = cx - 14; x <= cx + 14; x++) rawSet(x, y, MBRICK);
  for (let x = cx - 16; x <= cx + 16; x++) rawSet(x, y0 + 103, MBRICK);
  for (const lx of [110, 200, 440, 530]) platform(lx - 16, y0 + 122 + ri(-6, 6), 32, M.metal, 2, false);
  platform(ent - 20, y0 + 60, 40, M.metal, 2, false);
  pickups.push(mkPickup('orb', cx, y0 + 103, { fixed: true }));
  for (const tx of [60, 170, 470, 580]) torches.push({ x: tx, y: y0 + 116, ph: tx });
  spawnEnemy('warden', cx, y0 + 60, 6);
}
function genWorld(seed) {
  RNG = mulberry32(seed);
  const h = layoutRegions();
  allocWorld(h);
  enemies = []; projs = []; pickups = []; torches = []; flashes = []; pN = 0; pendingBooms = []; floaters = [];
  REG.forEach((r, n) => { for (let y = r.y0; y < r.y1; y++) regionOf[y] = n; });
  // terrain
  for (const r of REG) if (r.kind === 'biome') genBiome(r);
  // guaranteed descent paths
  descent.length = 0;
  for (const r of REG) {
    if (r.kind !== 'biome') continue;
    const sx = r.bi === 0 ? 350 : sanctExitX(r.bi - 1);
    const sy = r.bi === 0 ? CAMP.y1 - 4 : r.y0;
    carvePath(sx, sy, sanctEntryX(r.bi), r.y1 + 2, 7, 13, r.y0, r.y1, r.bi === 0 ? 36 : 0); // camp exit drops straight down first
  }
  carveCamp();
  for (const r of REG) { if (r.kind === 'sanct') genSanctum(r); }
  genFinal(REG[REG.length - 1]);
  // borders
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x < 4 || x >= W - 4 || y < 3 || y >= H - 3) rawSet(x, y, MBED);
  }
  // decoration, pools, gas, structures
  for (const r of REG) if (r.kind === 'biome') {
    decorate(r);
    const bi = r.bi;
    const liqs = [{ water: 5, oil: 2.2, blood: 1.2 }, { oil: 4, water: 2.4, toxic: 2 }, { toxic: 3.2, water: 2.5, acid: 1.6, slime: 1.2 }, { water: 5, slime: 1, blood: 1 }, { lava: 6, water: 1, acid: 1 }][bi];
    for (let n = 0; n < 38; n++) {
      const sp = findSpot(r.y0 + 10, r.y1 - 6, { w: 1, h: 2 }); if (!sp) continue;
      const lk = wpick(liqs);
      const mix = bi === 0 && lk === 'water' && rnd() < 0.35 ? MOIL : bi === 1 && lk === 'water' && rnd() < 0.3 ? MBLOOD : 0;
      fillBasin(sp.x, sp.y - 1, M[lk], ri(4, 16), 1600, 1, r.y0, r.y1, mix);
    }
    if (bi === 3) { // ice crust on still water
      for (let y = r.y0 + 2; y < r.y1 - 2; y++) for (let x = 6; x < W - 6; x++) {
        const i = y * W + x; if (mat[i] === MWATER && mat[i - W] === 0 && hash2(x, y, 3) < 0.85) rawSet(x, y, MICE);
      }
    }
    const gasN = [2, 8, 7, 0, 3][bi], gasM = [MFLAMGAS, MFLAMGAS, MTOXGAS, 0, MSMOKE][bi];
    for (let n = 0; n < gasN * 3 && gasN; n++) {
      const x = ri(20, W - 20), y = ri(r.y0 + 10, r.y1 - 10);
      if (mat[y * W + x] !== 0) continue;
      let yy = y; while (yy > r.y0 + 4 && mat[(yy - 1) * W + x] === 0) yy--;
      if (yy <= r.y0 + 4) continue;
      fillBasin(x, yy, gasM, ri(5, 12), 900, -1, r.y0, r.y1);
    }
    genStructures(r);
    populate(r);
  }
  // keep the camp safe: nothing loose above or inside it, no enemies at the door
  for (let y = 3; y < CAMP.y1; y++) for (let x = CAMP.x0 - 14; x < CAMP.x1 + 14; x++) {
    const i = y * W + x, t = mT[mat[i]];
    if (t === T_POWDER || t === T_LIQUID || t === T_GAS) { if (x >= CAMP.x0 && x < CAMP.x1 && y >= CAMP.y0) { mat[i] = 0; life[i] = 0; } else rawSet(x, y, M.rock); }
  }
  enemies = enemies.filter(e => !(e.x > CAMP.x0 - 40 && e.x < CAMP.x1 + 40 && e.y < CAMP.y1 + 40));
  openDescent();
  // mines camp furniture (after population and structures so nothing lands inside)
  carveCamp();
  platform(CAMP.x0 + 2, CAMP.y1 - 2, 58, MWOOD, 2, false);
  for (let x = CAMP.x0; x < CAMP.x1; x++) for (let y = CAMP.y1; y < CAMP.y1 + 3; y++) if (mat[y * W + x] === 0 && x < CAMP.x0 + 60) rawSet(x, y, M.rock);
  torches.push({ x: CAMP.x0 + 6, y: CAMP.y1 - 14, ph: 0 }, { x: CAMP.x0 + 52, y: CAMP.y1 - 14, ph: 4 });
  pickups.push(mkPickup('altar', CAMP.x0 + 30, CAMP.y1 - 2, { fixed: true, camp: true }));
  pickups.push(mkPickup('potion', CAMP.x0 + 44, CAMP.y1 - 3, {}));
  awake.fill(1); awakeNext.fill(1);
  return { x: CAMP.x0 + 16, y: CAMP.y1 - 3 };
}
function genStructures(r) {
  const bi = r.bi;
  if (bi === 0 || bi === 1) {
    for (let n = 0; n < (bi ? 6 : 9); n++) {
      const sp = findSpot(r.y0 + 14, r.y1 - 10, { w: 30, h: 24 }, { air: true }); if (!sp) continue;
      platform(sp.x - 15, sp.y, ri(18, 34), MWOOD, 2, true);
      if (rnd() < 0.6) torches.push({ x: sp.x - 10, y: sp.y - 8, ph: rnd() * 9 });
    }
  }
  if (bi === 1) {
    for (let n = 0; n < 10; n++) {
      const sp = findSpot(r.y0 + 14, r.y1 - 10, { w: 9, h: 8 }); if (!sp) continue;
      for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
        const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        rawSet(sp.x - 3 + dx, sp.y - 7 + dy, edge ? MWOOD : MGUN);
      }
    }
  }
  if (bi === 2) {
    for (let n = 0; n < 11; n++) {
      const sp = findSpot(r.y0 + 20, r.y1 - 10, { w: 20, h: 30 }); if (!sp) continue;
      const hgt = ri(12, 26), cr = ri(7, 14), sx = sp.x, top = sp.y - hgt;
      for (let y = top; y < sp.y; y++) for (let dx = -1; dx <= 1; dx++) if (mat[y * W + sx + dx] === 0) rawSet(sx + dx, y, M.fungus);
      for (let dy = -cr; dy <= 1; dy++) for (let dx = -cr - 3; dx <= cr + 3; dx++) {
        if ((dx * dx) / ((cr + 3) * (cr + 3)) + (dy * dy) / (cr * cr * 0.5) > 1) continue;
        const x = sx + dx, y = top + dy; if (x < 6 || x >= W - 6) continue;
        if (mat[y * W + x] === 0) rawSet(x, y, M.mushcap);
      }
    }
    for (let n = 0; n < 14; n++) {
      const sp = findSpot(r.y0 + 10, r.y1 - 10, { w: 1, h: 1 }); if (!sp) continue;
      const cx = sp.x, cy = sp.y - 1;
      for (let k = 0; k < 4; k++) { const a = -Math.PI / 2 + rr(-0.8, 0.8), l = ri(3, 8); for (let t = 0; t < l; t++) { const x = Math.round(cx + Math.cos(a) * t), y = Math.round(cy + Math.sin(a) * t); if (mat[y * W + x] === 0) rawSet(x, y, M.crystal); } }
    }
  }
  if (bi === 3) {
    for (let n = 0; n < 7; n++) {
      const sp = findSpot(r.y0 + 14, r.y1 - 10, { w: 40, h: 18 }, { air: true }); if (!sp) continue;
      platform(sp.x - 20, sp.y, ri(26, 50), MICE, 3, false);
    }
  }
  if (bi === 4) {
    for (let n = 0; n < 7; n++) {
      const sp = findSpot(r.y0 + 20, r.y1 - 10, { w: 30, h: 22 }); if (!sp) continue;
      const w = ri(20, 36), h = ri(14, 22), x0 = sp.x - (w >> 1), y0 = sp.y - h;
      for (let y = y0; y < sp.y; y++) for (let x = x0; x < x0 + w; x++) {
        const edge = x - x0 < 2 || x0 + w - 1 - x < 2 || y - y0 < 2;
        if (!edge) continue;
        if ((y - y0 > 6 && y - y0 < 12 && (x - x0 < 2 || x0 + w - 1 - x < 2)) || hash2(x, y, 9) < 0.12) continue;
        if (mat[y * W + x] === 0) rawSet(x, y, M.metal);
      }
    }
  }
  const torchN = [16, 11, 4, 9, 4][bi];
  for (let n = 0; n < torchN; n++) { const sp = findSpot(r.y0 + 10, r.y1 - 8, { w: 3, h: 10 }); if (sp) torches.push({ x: sp.x, y: sp.y - 7, ph: rnd() * 9 }); }
}
function populate(r) {
  const b = BIOMES[r.bi], tier = b.tier;
  const avoid = [];
  const entX = r.bi === 0 ? 330 : sanctExitX(r.bi - 1), entY = r.bi === 0 ? CAMP.y1 : r.y0;
  avoid.push({ x: entX, y: entY + 20 });
  // items
  const put = (kind, n, extra) => { for (let k = 0; k < n; k++) { const sp = findSpot(r.y0 + 20, r.y1 - 10, { w: 9, h: 9 }); if (sp) pickups.push(mkPickup(kind, sp.x, sp.y - 1, extra ? extra() : {})); } };
  put('chest', 3, () => ({ tier }));
  put('potion', 3);
  put('heart', 1 + (rnd() < 0.5 ? 1 : 0));
  put('wand', r.bi === 0 ? 2 : 1, () => ({ wand: genWand(tier) }));
  put('spell', 3, () => ({ id: randSpell(tier) }));
  for (let k = 0; k < 8; k++) { const sp = findSpot(r.y0 + 20, r.y1 - 10, { w: 3, h: 3 }); if (sp) for (let g = 0; g < ri(3, 8); g++) pickups.push(mkPickup('gold', sp.x + ri(-4, 4), sp.y - 2, { v: ri(4, 10) })); }
  // enemies
  const count = 18 + r.bi * 4;
  for (let k = 0; k < count; k++) {
    const type = wpick(b.enemies);
    const def = EDEF[type];
    let sp;
    if (def.fly) sp = findSpot(r.y0 + 30, r.y1 - 10, { w: def.w + 4, h: def.h + 4 }, { air: true });
    else if (def.burrow) { const x = ri(40, W - 40), y = ri(r.y0 + 40, r.y1 - 20); sp = { x, y }; }
    else sp = findSpot(r.y0 + 30, r.y1 - 10, { w: def.w + 2, h: def.h + 2 });
    if (!sp) continue;
    if (Math.abs(sp.x - entX) < 60 && Math.abs(sp.y - entY) < 90) continue;
    spawnEnemy(type, sp.x, sp.y, tier);
  }
}

// ---------------------------------------------------------------- spells
// type: proj | trig | mod | multi.  delay / recharge are in frames (60 = 1s).
const SP = Object.create(null);
function defs(id, o) { o.id = id; SP[id] = o; }
// projectiles
defs('spark',    { n: '火花矢', type: 'proj', mana: 5, delay: 3, tier: 0, price: 60, icon: ['star', '#b04dff', '#e7a0ff', '#ffffff'], desc: '一道迅捷的紫色火花，造成少量伤害。',
  p: { spd: 340, life: 40, dmg: 7, spread: 1.5, col: [240, 120, 255], lr: 24, trail: 'spark', size: 1 } });
defs('ember',    { n: '余烬火球', type: 'proj', mana: 25, delay: 10, tier: 1, price: 110, icon: ['orb', '#a8330f', '#ff8a20', '#ffe070'], desc: '受重力下坠的火球，落地爆炸并点燃周围。',
  p: { spd: 210, life: 110, dmg: 6, grav: 0.55, spread: 3, col: [255, 140, 40], lr: 40, boom: [7, 7, 16], fireHit: 1, trail: 'fire', size: 2 } });
defs('arcane',   { n: '奥术飞弹', type: 'proj', mana: 45, delay: 20, tier: 2, price: 160, icon: ['bolt', '#3b3bd1', '#8f8fff', '#ffffff'], desc: '不断加速的奥术飞弹，命中时剧烈爆炸。',
  p: { spd: 110, life: 70, dmg: 10, accel: 1.05, maxSpd: 470, spread: 2, col: [150, 140, 255], lr: 38, boom: [9, 9, 26], trail: 'arcane', size: 2 } });
defs('burst',    { n: '跳跃碎光', type: 'proj', mana: 5, delay: 0, tier: 0, price: 70, icon: ['bounce', '#6a9a18', '#c6f04a', '#ffffff'], desc: '在墙壁间反复弹跳的光屑。',
  p: { spd: 280, life: 100, dmg: 5, bounce: 10, spread: 3, col: [200, 250, 90], lr: 20, trail: 'spark', size: 1 } });
defs('frost',    { n: '冰棱矢', type: 'proj', mana: 12, delay: 4, tier: 1, price: 90, icon: ['shard', '#2a7ab0', '#9fe0ff', '#ffffff'], desc: '寒冰之矢，冻结命中处的液体并减速敌人。',
  p: { spd: 310, life: 50, dmg: 10, spread: 1, col: [150, 220, 255], lr: 26, frostHit: 1, trail: 'frost', size: 1 } });
defs('bomb',     { n: '爆破荷包', type: 'proj', mana: 25, delay: 40, tier: 0, uses: 3, price: 90, icon: ['bomb', '#3a2d2a', '#6b5a50', '#ffcf40'], desc: '引信燃尽后猛烈爆炸，可炸穿大部分岩石。（有限次数）',
  p: { spd: 140, life: 150, dmg: 0, grav: 1, bounce: 6, bounceLoss: 0.45, spread: 2, col: [255, 200, 80], lr: 14, expireBoom: [18, 12, 60], trail: 'fuse', size: 2, noHit: 1, sprite: 'bomb' } });
defs('drill',    { n: '掘晶矢', type: 'proj', mana: 6, delay: 1, tier: 0, price: 60, icon: ['drill', '#6a5a40', '#d8c070', '#ffffff'], desc: '短程晶矢，能挖穿泥土与岩石。',
  p: { spd: 300, life: 16, dmg: 5, dig: [3, 10], spread: 0.5, col: [240, 220, 150], lr: 16, trail: 'dust', size: 1 } });
defs('lance',    { n: '电弧枪', type: 'proj', mana: 22, delay: 8, tier: 2, price: 150, icon: ['lance', '#1c6a8a', '#60e0ff', '#ffffff'], desc: '极快的电弧，贯穿多个敌人并使其麻痹。',
  p: { spd: 720, life: 26, dmg: 16, pierce: 1, stun: 1, spread: 0.5, col: [120, 230, 255], lr: 30, trail: 'arc', size: 1 } });
defs('saw',      { n: '回旋锯', type: 'proj', mana: 12, delay: 4, tier: 1, price: 100, icon: ['saw', '#707070', '#c8c8c8', '#ffffff'], desc: '缓慢旋转的锯刃，持续切割敌人与软土。',
  p: { spd: 140, life: 120, dmg: 4, drag: 0.975, bounce: 6, multiHit: 6, dig: [2, 6], spread: 2, col: [220, 220, 230], lr: 10, size: 2, sprite: 'saw' } });
defs('acidglob', { n: '蚀酸球', type: 'proj', mana: 22, delay: 8, tier: 2, price: 120, icon: ['drop', '#4a8a10', '#a8f040', '#f0ffb0'], desc: '抛出一团酸液，腐蚀接触到的一切。',
  p: { spd: 190, life: 120, dmg: 6, grav: 0.75, spread: 3, col: [170, 250, 70], lr: 22, spawnMat: ['acid', 3], trail: 'drip', size: 2 } });
defs('spring',   { n: '泉涌术', type: 'proj', mana: 12, delay: 6, tier: 0, price: 50, icon: ['drop', '#1c4a8a', '#50a0e0', '#c0f0ff'], desc: '召唤一团清水——可以浇灭火焰。',
  p: { spd: 200, life: 90, dmg: 0, grav: 0.9, spread: 3, col: [90, 170, 230], lr: 14, spawnMat: ['water', 5], trail: 'wet', size: 2 } });
defs('void',     { n: '虚空球', type: 'proj', mana: 70, delay: 30, tier: 3, uses: 3, price: 220, icon: ['orb', '#200830', '#6020a0', '#e0a0ff'], desc: '缓慢的虚空之球，吞噬沿途的地形。（有限次数）',
  p: { spd: 70, life: 90, dmg: 18, multiHit: 8, eat: [7, 13], noColl: 1, col: [170, 80, 255], lr: 40, size: 3, sprite: 'void' } });
defs('wisp',     { n: '照明灵火', type: 'proj', mana: 8, delay: 10, tier: 0, price: 40, icon: ['wisp', '#b09020', '#ffe070', '#ffffff'], desc: '缓缓飘停的灵火，长时间照亮黑暗。',
  p: { spd: 90, life: 1200, dmg: 0, drag: 0.95, col: [255, 230, 150], lr: 110, stick: 1, noHit: 1, trail: 'wisp', size: 2, bright: 1 } });
defs('blink',    { n: '瞬移矢', type: 'proj', mana: 20, delay: 20, tier: 1, price: 120, icon: ['blink', '#2a8a6a', '#60f0c0', '#ffffff'], desc: '将你传送到法术落点。',
  p: { spd: 380, life: 30, dmg: 0, col: [110, 255, 200], lr: 22, blink: 1, trail: 'spark', size: 1, noHit: 1 } });
defs('flame',    { n: '火舌', type: 'proj', mana: 3, delay: -2, tier: 1, price: 80, icon: ['flame', '#a02010', '#ff6a10', '#ffe060'], desc: '短程火焰喷流，点燃一切可燃物。',
  p: { spd: 170, life: 20, dmg: 3, drag: 0.93, spread: 9, col: [255, 150, 40], lr: 18, fireHit: 1, igniteTrail: 1, pierce: 1, trail: 'flame', size: 1 } });
// triggers
defs('tspark',   { n: '触发火花矢', type: 'trig', trig: 'hit', mana: 10, delay: 3, tier: 1, price: 120, icon: ['star', '#1f7a4a', '#60e090', '#ffffff'], desc: '触发：命中时在命中点释放下一个法术。',
  p: { spd: 330, life: 40, dmg: 5, spread: 1.5, col: [120, 255, 170], lr: 24, trail: 'spark', size: 1 } });
defs('torb',     { n: '定时奥珠', type: 'trig', trig: 'timer', timer: 18, mana: 15, delay: 5, tier: 2, price: 140, icon: ['clock', '#1f7a4a', '#80f0b0', '#ffffff'], desc: '触发：飞行片刻后释放下一个法术（自身继续前进）。',
  p: { spd: 210, life: 60, dmg: 8, spread: 1, col: [120, 255, 200], lr: 26, trail: 'arcane', size: 2 } });
defs('eorb',     { n: '终焉光球', type: 'trig', trig: 'expire', mana: 20, delay: 8, tier: 2, price: 140, icon: ['ring', '#1f7a4a', '#a0ffd0', '#ffffff'], desc: '触发：消散或命中时释放下一个法术。',
  p: { spd: 150, life: 45, dmg: 6, spread: 1, col: [170, 255, 220], lr: 30, trail: 'arcane', size: 2 } });
// modifiers
defs('homing',   { n: '寻迹符文', type: 'mod', mana: 20, delay: 0, tier: 1, price: 110, icon: ['eye', '#2f5f9e', '#80b0ff', '#ffffff'], desc: '修饰：法术会追踪附近的敌人。', mod: a => { a.homing += 1; } });
defs('mfire',    { n: '燃焰涂层', type: 'mod', mana: 10, delay: 0, tier: 0, price: 70, icon: ['flame', '#2f5f9e', '#ff8a30', '#ffe070'], desc: '修饰：法术着火，命中点燃目标与地形。', mod: a => { a.fire = true; a.dmgAdd += 2; } });
defs('speed',    { n: '疾速符文', type: 'mod', mana: 3, delay: 0, tier: 0, price: 50, icon: ['chev', '#2f5f9e', '#80d0ff', '#ffffff'], desc: '修饰：法术速度翻倍。', mod: a => { a.spdMul *= 2; } });
defs('heavy',    { n: '重击符文', type: 'mod', mana: 15, delay: 5, tier: 1, price: 90, icon: ['weight', '#2f5f9e', '#9090a0', '#ffffff'], desc: '修饰：伤害 +14，但速度降低。', mod: a => { a.dmgAdd += 14; a.spdMul *= 0.55; } });
defs('mbounce',  { n: '回弹符文', type: 'mod', mana: 2, delay: 0, tier: 0, price: 50, icon: ['bounce', '#2f5f9e', '#80c0ff', '#ffffff'], desc: '修饰：法术可额外反弹 10 次。', mod: a => { a.bounce += 10; } });
defs('mexplode', { n: '爆裂符文', type: 'mod', mana: 25, delay: 3, tier: 2, price: 130, icon: ['boom', '#2f5f9e', '#ffb040', '#fff0a0'], desc: '修饰：命中时产生爆炸。', mod: a => { a.boomR += 7; a.boomDmg += 18; } });
defs('crit',     { n: '锐眼符文', type: 'mod', mana: 5, delay: 0, tier: 1, price: 80, icon: ['cross', '#2f5f9e', '#ff6070', '#ffffff'], desc: '修饰：暴击率 +45%（暴击造成三倍伤害）。', mod: a => { a.crit += 0.45; } });
defs('pierce',   { n: '穿灵符文', type: 'mod', mana: 30, delay: 0, tier: 2, price: 120, icon: ['lance', '#2f5f9e', '#c0e0ff', '#ffffff'], desc: '修饰：法术贯穿敌人。', mod: a => { a.pierce = true; } });
defs('haste',    { n: '急咏符文', type: 'mod', mana: 5, delay: -10, recharge: -20, tier: 1, price: 90, icon: ['clock', '#2f5f9e', '#ffe060', '#ffffff'], desc: '修饰：施法延迟 -0.17 秒，充能时间 -0.33 秒。', mod: a => { } });
defs('focus',    { n: '凝神符文', type: 'mod', mana: 2, delay: 0, tier: 0, price: 50, icon: ['focus', '#2f5f9e', '#a0ffa0', '#ffffff'], desc: '修饰：大幅降低散布，伤害 +3。', mod: a => { a.spread -= 40; a.dmgAdd += 3; } });
defs('venom',    { n: '毒雾轨迹', type: 'mod', mana: 10, delay: 0, tier: 1, price: 80, icon: ['drop', '#2f5f9e', '#70e040', '#e0ffa0'], desc: '修饰：拖曳毒雾，命中使敌人中毒。', mod: a => { a.venom = true; } });
defs('mfrost',   { n: '霜缠符文', type: 'mod', mana: 10, delay: 0, tier: 1, price: 80, icon: ['shard', '#2f5f9e', '#b0f0ff', '#ffffff'], desc: '修饰：命中冻结液体并使敌人减速。', mod: a => { a.frost = true; } });
defs('glow',     { n: '辉光符文', type: 'mod', mana: 1, delay: 0, tier: 0, price: 30, icon: ['wisp', '#2f5f9e', '#fff0a0', '#ffffff'], desc: '修饰：法术发出强光，持续时间 +50%。', mod: a => { a.glow = true; a.lifeMul *= 1.5; } });
// multicasts
defs('double',   { n: '双生咏唱', type: 'multi', count: 2, spread: 0, mana: 0, delay: 0, tier: 0, price: 80, icon: ['n2', '#a47a1d', '#ffd060', '#ffffff'], desc: '同时施放接下来的 2 个法术。' });
defs('triple',   { n: '三重咏唱', type: 'multi', count: 3, spread: 0, mana: 2, delay: 0, tier: 1, price: 120, icon: ['n3', '#a47a1d', '#ffd060', '#ffffff'], desc: '同时施放接下来的 3 个法术。' });
defs('scatter',  { n: '散射咏唱', type: 'multi', count: 3, spread: 20, mana: 0, delay: 0, tier: 0, price: 90, icon: ['fan', '#a47a1d', '#ffd060', '#ffffff'], desc: '同时施放接下来的 3 个法术，散布 +20°。' });
defs('chaos',    { n: '狂乱散射', type: 'multi', count: 4, spread: 35, mana: 1, delay: 0, tier: 2, price: 140, icon: ['fan4', '#a47a1d', '#ffd060', '#ffffff'], desc: '同时施放接下来的 4 个法术，散布 +35°。' });
const SP_IDS = Object.keys(SP);
const TYPE_NAME = { proj: '投射物', trig: '触发', mod: '修饰', multi: '多重' };
function randSpell(tier, rand = rnd) {
  const pool = SP_IDS.filter(id => SP[id].tier <= tier + 0.5);
  const w = {}; for (const id of pool) w[id] = SP[id].type === 'proj' ? 1.3 : 1;
  return wpick(w, rand);
}
function mkSlot(id) { const s = SP[id]; return { id, uses: s.uses || -1 }; }

// ---------------------------------------------------------------- wands
const WAND_A = ['橡木', '骨', '铜', '晶', '黑曜', '霜', '焰', '藤', '铁', '琥珀'];
const WAND_B = ['短杖', '法杖', '权杖', '魔棒', '咒棍', '手杖'];
const WAND_HANDLE = ['#5a3c22', '#d8d0c0', '#b0703a', '#5a8aa0', '#2a2230', '#8aa8c8', '#8a3018', '#3a6a2a', '#606870', '#a07020'];
const GEMS = ['#ff4060', '#40c0ff', '#60ff90', '#ffd040', '#c060ff', '#ff8030'];
function mkWand(o) {
  const w = Object.assign({ name: '法杖', shuffle: false, spc: 1, delay: 12, recharge: 30, manaMax: 120, manaCharge: 40, cap: 4, spread: 2, slots: [] }, o);
  while (w.slots.length < w.cap) w.slots.push(null);
  w.mana = w.manaMax; w.delayT = 0; w.rechargeT = 0; w.order = null; w.pos = 0;
  if (!w.look) w.look = { handle: rpick(WAND_HANDLE), gem: rpick(GEMS), len: Math.min(13, 7 + (w.cap >> 1)) };
  return w;
}
function genWand(tier) {
  const t = tier;
  const cap = clamp(ri(2, 3) + Math.floor(t * 0.9) + ri(-1, 2), 2, 12);
  const shuffle = rnd() < 0.55 - t * 0.06;
  const spc = rnd() < 0.12 + t * 0.06 ? ri(2, 3) : 1;
  const a = ri(0, WAND_A.length - 1);
  const w = mkWand({
    name: WAND_A[a] + rpick(WAND_B), shuffle, spc,
    delay: Math.max(1, Math.round(rr(5, 24) - t * 2)), recharge: Math.max(4, Math.round(rr(16, 52) - t * 4)),
    manaMax: Math.round(rr(80, 160) + t * 70), manaCharge: Math.round(rr(25, 60) + t * 22),
    cap, spread: Math.round(rr(-2, 7) * 10) / 10,
    look: { handle: WAND_HANDLE[a], gem: rpick(GEMS), len: Math.min(13, 7 + (cap >> 1)) },
  });
  const fill = Math.max(1, Math.round(cap * rr(0.35, 0.75)));
  const main = randProj(t);
  for (let k = 0; k < fill; k++) {
    const r = rnd();
    const id = k === fill - 1 ? main : r < 0.45 ? main : r < 0.7 ? randOfType(t, 'mod') : r < 0.85 ? randOfType(t, 'multi') : randSpell(t);
    w.slots[k] = mkSlot(id);
  }
  if (!w.slots.some(s => s && (SP[s.id].type === 'proj' || SP[s.id].type === 'trig'))) w.slots[0] = mkSlot(main);
  return w;
}
function randOfType(t, type) { const pool = SP_IDS.filter(id => SP[id].type === type && SP[id].tier <= t); return pool.length ? rpick(pool) : 'spark'; }
function randProj(t) { const pool = SP_IDS.filter(id => SP[id].type === 'proj' && SP[id].tier <= t && id !== 'wisp' && id !== 'blink' && id !== 'spring'); return rpick(pool); }
function starterWands() {
  const a = mkWand({ name: '学徒短杖', shuffle: false, spc: 1, delay: 9, recharge: 20, manaMax: 130, manaCharge: 36, cap: 6, spread: 1.5,
    look: { handle: '#5a3c22', gem: '#c060ff', len: 10 } });
  a.slots[0] = mkSlot('spark'); a.slots[1] = mkSlot('spark'); a.slots[2] = mkSlot('spark'); a.slots[3] = mkSlot('burst');
  const b = mkWand({ name: '爆破短棍', shuffle: true, spc: 1, delay: 8, recharge: 30, manaMax: 90, manaCharge: 30, cap: 2, spread: 0,
    look: { handle: '#8a3018', gem: '#ffd040', len: 8 } });
  b.slots[0] = mkSlot('bomb'); b.slots[1] = mkSlot('drill');
  return [a, b];
}
function wandDeck(w) {
  w.order = [];
  for (let k = 0; k < w.slots.length; k++) if (w.slots[k]) w.order.push(k);
  if (w.shuffle) shuffleArr(w.order);
  w.pos = 0;
}
function newGroup() { return { shots: [], mods: [], spread: 0 }; }
function drawCards(ctx, g, n) {
  const w = ctx.w;
  for (let k = 0; k < n; k++) {
    let card = null, guard = 0;
    while (guard++ < 64) {
      if (ctx.used.size >= w.order.length) return;
      if (w.pos >= w.order.length) { if (ctx.wrapped) return; ctx.wrapped = true; w.pos = 0; }
      const si = w.order[w.pos++];
      if (ctx.used.has(si)) continue;
      ctx.used.add(si);
      const slot = w.slots[si]; if (!slot) continue;
      const s = SP[slot.id];
      if (slot.uses === 0) continue;
      if (s.mana > ctx.mana) { ctx.lowMana = true; continue; }
      card = slot; break;
    }
    if (!card) return;
    const s = SP[card.id];
    ctx.mana -= s.mana; ctx.delay += s.delay || 0; ctx.recharge += s.recharge || 0;
    ctx.cards.push(card.id);
    if (card.uses > 0 && !hasPerk('scrolls')) card.uses--;
    if (s.type === 'proj') g.shots.push({ s, payload: null });
    else if (s.type === 'trig') { const sub = newGroup(); g.shots.push({ s, payload: sub }); drawCards(ctx, sub, 1); }
    else if (s.type === 'mod') { g.mods.push(s); drawCards(ctx, g, 1); }
    else if (s.type === 'multi') { g.spread += s.spread; drawCards(ctx, g, s.count); }
  }
}
let lastCast = null;
function castWand(w, x, y, ang) {
  if (w.delayT > 0 || w.rechargeT > 0) return false;
  if (!w.order || w.dirty) { wandDeck(w); w.dirty = false; }
  if (!w.order.length) { w.delayT = 20; sfx('fizzle'); toast('这根法杖是空的'); return false; }
  const ctx = { w, mana: w.mana, delay: 0, recharge: 0, used: new Set(), wrapped: false, cards: [], lowMana: false };
  const root = newGroup();
  drawCards(ctx, root, w.spc);
  const qh = hasPerk('quick') ? 0.7 : 1;
  const exhausted = ctx.wrapped || w.pos >= w.order.length;
  if (exhausted) { w.pos = 0; if (w.shuffle) shuffleArr(w.order); }
  if (!root.shots.length) {
    w.delayT = 14; sfx('fizzle');
    if (ctx.lowMana) { floatText(player.x, player.y - 16, '法力不足', '#7fb0ff'); }
    if (exhausted) w.rechargeT = Math.max(0, (w.recharge + ctx.recharge) * qh);
    return false;
  }
  w.mana = ctx.mana;
  const n = fireGroup(root, x, y, ang, w.spread, 'player', null);
  w.delayT = Math.max(0, (w.delay + ctx.delay) * qh);
  if (exhausted) w.rechargeT = Math.max(0, (w.recharge + ctx.recharge) * qh);
  lastCast = { cards: ctx.cards, shots: n, t: frameNo };
  return true;
}
function aggMods(g) {
  const a = { dmgAdd: 0, spdMul: 1, spread: g.spread, bounce: 0, homing: 0, fire: false, boomR: 0, boomDmg: 0, crit: 0, pierce: false, venom: false, frost: false, glow: false, lifeMul: 1 };
  for (const s of g.mods) s.mod(a);
  if (hasPerk('hunter')) a.homing += 0.35;
  if (hasPerk('keen')) a.crit += 0.2;
  return a;
}
function fireGroup(g, x, y, ang, baseSpread, owner, src) {
  const a = aggMods(g);
  const n = g.shots.length;
  let count = 0;
  for (let k = 0; k < n; k++) {
    const sh = g.shots[k];
    const spread = Math.max(0, baseSpread + a.spread + (sh.s.p.spread || 0)) * Math.PI / 180;
    let an = ang;
    if (n > 1 && a.spread + baseSpread > 4) an += (k / (n - 1) - 0.5) * 2 * spread * 0.8 + (fr() - 0.5) * spread * 0.4;
    else an += (fr() - 0.5) * 2 * spread;
    mkProj(sh.s, x, y, an, a, owner, sh.payload, src);
    count++;
  }
  return count;
}

// ---------------------------------------------------------------- projectiles
let projs = [];
function mkProj(s, x, y, ang, a, owner, payload, src) {
  const p = s.p;
  const spd = p.spd * (a ? a.spdMul : 1);
  const o = {
    s, x, y, px: x, py: y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
    life: Math.round(p.life * (a ? a.lifeMul : 1)), age: 0,
    dmg: (p.dmg || 0) + (a && p.dmg ? a.dmgAdd : 0),
    grav: p.grav || 0, drag: p.drag || 0, accel: p.accel || 0, maxSpd: p.maxSpd || 9999,
    bounce: (p.bounce || 0) + (a ? a.bounce : 0), pierce: !!p.pierce || (a && a.pierce),
    homing: a ? a.homing : 0, fire: !!(a && a.fire), venom: !!(a && a.venom), frost: !!(a && a.frost) || !!p.frostHit,
    glow: !!(a && a.glow), crit: a ? a.crit : 0,
    boomR: (p.boom ? p.boom[0] : 0) + (a ? a.boomR : 0), boomPow: p.boom ? p.boom[1] : 8, boomDmg: (p.boom ? p.boom[2] : 0) + (a ? a.boomDmg : 0),
    owner, src: src || null, payload: payload || null, trig: s.trig || null, timer: s.timer || 0, fired: false,
    hit: null, multiT: 0, col: p.col, lr: p.lr * (a && a.glow ? 2.2 : 1) + (a && a.glow ? 30 : 0), size: p.size || 1, stuck: false, dead: false,
  };
  if (a && a.boomR && !p.boom) o.boomPow = 8;
  projs.push(o);
  if (owner === 'player') sfxCast(s);
  return o;
}
function nearestEnemy(x, y, r) {
  let best = null, bd = r;
  for (const e of enemies) {
    if (e.dead || !e.active) continue;
    const d = dist(x, y, e.x, ecy(e));
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function solidAt(x, y) { const m = matAt(x, y); return mHard[m] || mT[m] === T_POWDER; }
function updProj(p) {
  const d = p.s.p;
  p.age++;
  // triggers on timer
  if (p.trig === 'timer' && !p.fired && p.age >= p.timer) { p.fired = true; releasePayload(p); }
  if (p.homing > 0 && p.owner === 'player') {
    const t = nearestEnemy(p.x, p.y, 150 + p.homing * 40);
    if (t) {
      const want = Math.atan2(t.y - t.h / 2 - p.y, t.x - p.x), cur = Math.atan2(p.vy, p.vx);
      let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      const turn = Math.min(Math.abs(da), 0.07 * p.homing + 0.02) * Math.sign(da);
      const sp = Math.hypot(p.vx, p.vy);
      p.vx = Math.cos(cur + turn) * sp; p.vy = Math.sin(cur + turn) * sp;
    }
  }
  if (p.homeTo) { // enemy seekers
    const want = Math.atan2(player.y - 6 - p.y, player.x - p.x), cur = Math.atan2(p.vy, p.vx);
    let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    const sp = Math.hypot(p.vx, p.vy), turn = clamp(da, -p.homeTo, p.homeTo);
    p.vx = Math.cos(cur + turn) * sp; p.vy = Math.sin(cur + turn) * sp;
  }
  if (p.accel) { const sp = Math.hypot(p.vx, p.vy); if (sp < p.maxSpd) { p.vx *= p.accel; p.vy *= p.accel; } }
  if (p.drag) { p.vx *= p.drag; p.vy *= p.drag; }
  if (p.grav && !p.stuck) p.vy += GRAV * p.grav * STEP;
  p.px = p.x; p.py = p.y;
  if (!p.stuck) {
    const dx = p.vx * STEP, dy = p.vy * STEP;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const sx = dx / steps, sy = dy / steps;
    for (let k = 0; k < steps && !p.dead; k++) {
      const nx = p.x + sx, ny = p.y + sy;
      if (nx < 2 || ny < 2 || nx >= W - 2 || ny >= H - 2) { p.dead = true; break; }
      if (d.eat) { digCircle(nx, ny, d.eat[0], d.eat[1], 0.06); }
      if (d.igniteTrail && (k & 1) === 0) { const ci = (ny | 0) * W + (nx | 0); const m = mat[ci]; if (m === 0 && fr() < 0.25) setI(ci, MFIRE, 6 + ((fr() * 10) | 0)); }
      const m = mat[(ny | 0) * W + (nx | 0)], mt = mT[m];
      if (mSoft[m]) { if ((p.fire || d.fireHit) && fr() < 0.3) ignite((ny | 0) * W + (nx | 0), m); }
      else if (!d.noColl && (mt === T_SOLID || mt === T_POWDER)) {
        if (d.dig) {
          digCircle(nx, ny, d.dig[0], d.dig[1], 0.12);
          if (mat[(ny | 0) * W + (nx | 0)] !== 0 && mDur[m] > d.dig[1]) { if (!bounceProj(p, nx, ny)) { impact(p, p.x, p.y); break; } }
          p.x = nx; p.y = ny; continue;
        }
        if (d.stick) { p.stuck = true; p.vx = 0; p.vy = 0; break; }
        if (p.bounce > 0) { bounceProj(p, nx, ny); if (d.bounceLoss) { p.vx *= 1 - d.bounceLoss; p.vy *= 1 - d.bounceLoss; } break; }
        impact(p, p.x, p.y); break;
      }
      if (mt === T_LIQUID && p.fire && m === MWATER && fr() < 0.2) { p.fire = false; setI((ny | 0) * W + (nx | 0), MSTEAM); }
      if (mt === T_LIQUID && d.fireHit && !p.fire && m === MWATER) { p.dead = true; setI((ny | 0) * W + (nx | 0), MSTEAM); break; }
      p.x = nx; p.y = ny;
      // entity collisions
      if (d.noHit) continue;
      if (p.owner === 'player') {
        for (const e of enemies) {
          if (e.dead || !e.active) continue;
          if (!enemyHitTest(e, p.x, p.y, p.size)) continue;
          if (p.hit && p.hit.has(e)) continue;
          if (d.multiHit) { if (p.multiT > 0) continue; p.multiT = d.multiHit; }
          projHitEnemy(p, e);
          if (p.dead) break;
        }
      } else if (!player.dead) {
        if (Math.abs(p.x - player.x) < 3 + p.size && p.y > player.y - 12 && p.y < player.y + 1) {
          hurtPlayer(p.dmg, 'enemy', p.src);
          if (p.frost) player.slow = 90;
          if (p.venom) player.poison = Math.max(player.poison, 180);
          if (p.fire) setPlayerBurn();
          player.vx += p.vx * 0.2; player.vy += p.vy * 0.1 - 20;
          impact(p, p.x, p.y);
        }
      }
    }
  } else if (p.owner === 'player' && !d.noHit) {
    for (const e of enemies) if (!e.dead && e.active && enemyHitTest(e, p.x, p.y, p.size)) { if (p.multiT <= 0) { p.multiT = d.multiHit || 20; projHitEnemy(p, e); } }
  }
  if (p.multiT > 0) p.multiT--;
  // trails & effects
  projTrail(p, d);
  if (--p.life <= 0 && !p.dead) expire(p);
}
function bounceProj(p, nx, ny) {
  const bx = solidAt(nx, p.y), by = solidAt(p.x, ny);
  if (bx) p.vx = -p.vx * 0.9;
  if (by) p.vy = -p.vy * 0.9;
  if (!bx && !by) { p.vx = -p.vx; p.vy = -p.vy; }
  p.bounce--;
  if (p.owner === 'player' && fr() < 0.4) sfx('tick');
  burst(p.x, p.y, 3, p.col, 40, 8);
  return true;
}
function projHitEnemy(p, e) {
  let dmg = p.dmg;
  let crit = false;
  if (p.crit > 0 && fr() < p.crit) { dmg *= 3; crit = true; }
  if (dmg > 0) damageEnemy(e, dmg, { kind: 'spell', owner: p.owner, fire: p.fire || !!p.s.p.fireHit, venom: p.venom, frost: p.frost, stun: !!p.s.p.stun, crit });
  if (!e.fixed && !e.boss) { e.vx += p.vx * 0.12; e.vy += p.vy * 0.06 - 15; }
  if (p.pierce || p.s.p.multiHit) { if (!p.hit) p.hit = new Set(); if (!p.s.p.multiHit) p.hit.add(e); if (p.s.p.stun) arcFx(p.x, p.y); if (p.boomR && p.pierce) explode(p.x, p.y, p.boomR, p.boomPow, p.boomDmg, p.owner, { fire: p.fire }); return; }
  impact(p, p.x, p.y);
}
function releasePayload(p) {
  if (!p.payload || !p.payload.shots.length) return;
  const ang = Math.atan2(p.vy, p.vx);
  const bx = p.x - Math.cos(ang) * 2, by = p.y - Math.sin(ang) * 2;
  fireGroup(p.payload, bx, by, ang, 0, p.owner, p.src);
  burst(bx, by, 6, p.col, 50, 10);
}
function impact(p, x, y) {
  if (p.dead) return;
  p.dead = true;
  const d = p.s.p;
  if (p.boomR) explode(x, y, p.boomR, p.boomPow, p.boomDmg, p.owner, { fire: p.fire || !!d.fireHit, srcName: p.src });
  if (d.spawnMat) placeBlob(x - p.vx * 0.012, y - p.vy * 0.012, d.spawnMat[1], M[d.spawnMat[0]], true, 0.85);
  if (p.frost) freezeArea(x, y, 4);
  if (p.fire || d.fireHit) {
    for (let k = 0; k < 6; k++) {
      const xx = (x + frr(-3, 3)) | 0, yy = (y + frr(-3, 3)) | 0, i = yy * W + xx;
      if (!inW(xx, yy)) continue;
      const m = mat[i];
      if (m === 0) setI(i, MFIRE, 10 + ((fr() * 16) | 0)); else if (mFlam[m] > 0) ignite(i, m);
    }
  }
  if (p.venom) placeBlob(x, y, 3, MTOXGAS, true, 0.6);
  if (d.blink && p.owner === 'player') doBlink(x - p.vx * 0.01, y - p.vy * 0.01);
  if (p.trig === 'hit' || (p.trig === 'expire' && !p.fired)) { p.fired = true; releasePayload(p); }
  burst(x, y, 6 + p.size * 3, p.col, 70, 12);
  addFlash(x, y, p.lr * 0.8 + 8, p.col.map(v => v / 255), 5);
  if (p.owner === 'player' && !p.boomR) sfx('pop');
}
function expire(p) {
  const d = p.s.p;
  if (d.expireBoom) { p.dead = true; explode(p.x, p.y, d.expireBoom[0], d.expireBoom[1], d.expireBoom[2] + p.boomDmg, p.owner, { fire: p.fire }); if (p.payload) releasePayload(p); return; }
  if (d.blink && p.owner === 'player') doBlink(p.x, p.y);
  if (p.trig === 'expire' && !p.fired) { p.fired = true; releasePayload(p); }
  if (p.boomR && d.boom) explode(p.x, p.y, p.boomR, p.boomPow, p.boomDmg, p.owner, { fire: p.fire });
  p.dead = true;
  burst(p.x, p.y, 4, p.col, 30, 10);
}
function doBlink(x, y) {
  // find a free spot for the player near the target
  for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const px = (x + dx) | 0, py = (y + dy + 6) | 0;
    if (bodyFree(px, py, 5, 11)) {
      burst(player.x, player.y - 6, 18, [110, 255, 200], 90, 18);
      player.x = px; player.y = py; player.vx *= 0.3; player.vy = 0;
      burst(px, py - 6, 18, [110, 255, 200], 90, 18); sfx('blink');
      return;
    }
  }
}
function bodyFree(x, y, w, h) {
  const x0 = x - (w >> 1);
  for (let yy = y - h; yy < y; yy++) for (let xx = x0; xx < x0 + w; xx++) { if (!inW(xx, yy)) return false; const m = mat[yy * W + xx]; if (mHard[m] || mT[m] === T_POWDER) return false; }
  return true;
}
function arcFx(x, y) { for (let k = 0; k < 5; k++) addP(x, y, frr(-90, 90), frr(-90, 90), 6 + fr() * 6, pack(170, 240, 255), PF_GLOW); }
function projTrail(p, d) {
  const tr = d.trail;
  if (p.venom && fr() < 0.35) { const i = (p.y | 0) * W + (p.x | 0); if (mat[i] === 0) setI(i, MTOXGAS); }
  if (p.fire && fr() < 0.6) addP(p.x, p.y, frr(-15, 15), frr(-30, 0), 12 + fr() * 10, fpick(FIRECOL.slice(1, 5)), PF_GLOW | PF_RISE);
  if (!tr) return;
  switch (tr) {
    case 'spark': if (fr() < 0.6) addP(p.x, p.y, frr(-10, 10), frr(-10, 10), 8 + fr() * 8, pack(...p.col), PF_GLOW); break;
    case 'fire': for (let k = 0; k < 2; k++) addP(p.x, p.y, frr(-20, 20), frr(-30, 5), 12 + fr() * 14, fpick(FIRECOL.slice(1, 6)), PF_GLOW | PF_RISE); if (fr() < 0.3) addP(p.x, p.y, 0, -10, 30, pack(55, 50, 52), PF_RISE | PF_DRAG); break;
    case 'arcane': addP(p.x, p.y, frr(-8, 8), frr(-8, 8), 10 + fr() * 8, pack(...p.col), PF_GLOW | PF_DRAG); break;
    case 'frost': if (fr() < 0.5) addP(p.x, p.y, frr(-8, 8), frr(0, 15), 14, pack(200, 240, 255), PF_GLOW); break;
    case 'fuse': if (fr() < 0.7) addP(p.x, p.y - 2, frr(-30, 30), frr(-50, -10), 8, pack(255, 220, 100), PF_GLOW | PF_GRAV); break;
    case 'dust': if (fr() < 0.4) addP(p.x, p.y, frr(-10, 10), frr(-10, 10), 10, pack(200, 180, 130), 0); break;
    case 'arc': if (fr() < 0.8) addP(p.x + frr(-2, 2), p.y + frr(-2, 2), frr(-30, 30), frr(-30, 30), 5, pack(200, 250, 255), PF_GLOW); break;
    case 'drip': if (fr() < 0.4) addP(p.x, p.y, frr(-10, 10), 10, 12, pack(...p.col), PF_GLOW | PF_GRAV); break;
    case 'wet': if (fr() < 0.4) addP(p.x, p.y, frr(-10, 10), 10, 12, pack(120, 190, 240), PF_GRAV); break;
    case 'wisp': if (fr() < 0.3) addP(p.x + frr(-2, 2), p.y + frr(-2, 2), frr(-6, 6), frr(-14, -4), 30, pack(255, 230, 150), PF_GLOW); break;
    case 'flame': for (let k = 0; k < 2; k++) addP(p.x, p.y, p.vx * 0.3 + frr(-20, 20), p.vy * 0.3 + frr(-30, 10), 8 + fr() * 10, fpick(FIRECOL.slice(0, 6)), PF_GLOW | PF_RISE); break;
    case 'orb': if (fr() < 0.5) addP(p.x, p.y, frr(-6, 6), frr(-6, 6), 10, pack(...p.col), PF_GLOW); break;
    case 'spore': if (fr() < 0.4) addP(p.x, p.y, frr(-6, 6), frr(-6, 6), 16, pack(140, 220, 80), PF_DRAG); break;
  }
}
// enemy projectile defs share the projectile code
const EP = {
  hexorb:   { n: '咒弹', type: 'proj', p: { spd: 120, life: 150, dmg: 8, col: [230, 90, 255], lr: 22, trail: 'orb', size: 2 } },
  shard:    { n: '冰片', type: 'proj', p: { spd: 170, life: 90, dmg: 8, col: [170, 230, 255], lr: 18, frostHit: 1, trail: 'frost', size: 1 } },
  sporeb:   { n: '孢子', type: 'proj', p: { spd: 110, life: 120, dmg: 5, grav: 0.4, col: [150, 230, 90], lr: 14, spawnMat: ['toxgas', 3], trail: 'spore', size: 2 } },
  fireball: { n: '炉火弹', type: 'proj', p: { spd: 150, life: 140, dmg: 12, col: [255, 140, 50], lr: 30, fireHit: 1, trail: 'fire', size: 2 } },
  magma:    { n: '熔弹', type: 'proj', p: { spd: 160, life: 160, dmg: 10, grav: 0.6, col: [255, 120, 30], lr: 26, spawnMat: ['lava', 2], trail: 'fire', size: 2 } },
};
for (const k in EP) EP[k].id = k;
function enemyShot(e, def, ang, spdMul = 1, extra) {
  const p = mkProj(EP[def], e.x + Math.cos(ang) * 4, e.y - e.h * 0.6 + Math.sin(ang) * 4, ang, null, 'enemy', null, e.def.n);
  p.vx *= spdMul; p.vy *= spdMul;
  p.dmg *= e.dmgMul;
  if (EP[def].p.frostHit) p.frost = true;
  if (EP[def].p.fireHit) p.fire = true;
  if (extra) Object.assign(p, extra);
  return p;
}

// ---------------------------------------------------------------- entities: shared
let enemies = [], pickups = [], torches = [], floaters = [];
let player = null;
let frameNo = 0;
let stats = { time: 0, kills: 0, maxDepth: 0, gold: 0 };
function rectHits(x, y, w, h, powderFeetOnly) {
  const x0 = Math.floor(x) - (w >> 1), y1 = Math.floor(y), y0 = y1 - h;
  for (let yy = y0; yy < y1; yy++) {
    if (yy < 0 || yy >= H) return true;
    const row = yy * W;
    for (let xx = x0; xx < x0 + w; xx++) {
      if (xx < 0 || xx >= W) return true;
      const m = mat[row + xx], t = mT[m];
      if (mHard[m]) return true;
      if (t === T_POWDER && (!powderFeetOnly || yy >= y1 - 3)) return true;
    }
  }
  return false;
}
function moveBody(b, dt, powderSoft) {
  b.hitWall = false; b.hitCeil = false;
  const wasGround = b.onGround;
  // horizontal
  let dx = b.vx * dt;
  const sx = Math.sign(dx); let rem = Math.abs(dx);
  while (rem > 1e-4) {
    const st = Math.min(1, rem); const nx = b.x + sx * st;
    if (!rectHits(nx, b.y, b.w, b.h, powderSoft)) b.x = nx;
    else {
      let up = 0;
      if (wasGround || b.inLiquid) for (up = 1; up <= 3; up++) if (!rectHits(nx, b.y - up, b.w, b.h, powderSoft)) break;
      if (up >= 1 && up <= 3) { b.x = nx; b.y -= up; }
      else { b.vx = 0; b.hitWall = true; break; }
    }
    rem -= st;
  }
  // vertical
  let dy = b.vy * dt;
  const sy = Math.sign(dy); rem = Math.abs(dy);
  b.onGround = false;
  while (rem > 1e-4) {
    const st = Math.min(1, rem); const ny = b.y + sy * st;
    if (!rectHits(b.x, ny, b.w, b.h, false)) b.y = ny;
    else { if (sy > 0) b.onGround = true; else b.hitCeil = true; b.vy = 0; break; }
    rem -= st;
  }
  if (!b.onGround && b.vy >= 0 && rectHits(b.x, b.y + 1, b.w, 1, false)) b.onGround = true;
}
function los(x0, y0, x1, y1) {
  const n = Math.ceil(dist(x0, y0, x1, y1) / 3);
  for (let k = 1; k < n; k++) {
    const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n;
    if (mHard[matAt(x, y)]) return false;
  }
  return true;
}
function floatText(x, y, txt, col = '#fff', big = false) { floaters.push({ x, y, txt: String(txt), col, t: 50, big }); if (floaters.length > 40) floaters.shift(); }

// ---------------------------------------------------------------- perks
const PERKS = {
  thickblood: { n: '厚血契约', d: '最大生命 +50，并完全恢复。', icon: ['heart', '#8a1020', '#ff4050', '#ffc0c0'], stack: true, apply: p => { p.maxHp += 50; p.hp = p.maxHp; } },
  quick:      { n: '迅咒之手', d: '所有法杖的施法延迟与充能时间 -30%。', icon: ['clock', '#6a4a10', '#ffd060', '#ffffff'] },
  hunter:     { n: '猎迹印记', d: '你的所有法术都会轻微追踪敌人。', icon: ['eye', '#3a1060', '#c080ff', '#ffffff'] },
  emberskin:  { n: '余烬之肤', d: '免疫火焰与燃烧。', icon: ['flame', '#6a1a08', '#ff7020', '#ffe070'] },
  lungs:      { n: '清肺术', d: '免疫毒气、毒泥与中毒。', icon: ['drop', '#2a5a10', '#80e040', '#e0ffa0'] },
  gills:      { n: '水息', d: '在液体中永不溺水。', icon: ['wave', '#10406a', '#50a0e0', '#c0f0ff'] },
  blastward:  { n: '爆震护壁', d: '免疫爆炸伤害。', icon: ['boom', '#5a4010', '#ffb040', '#fff0a0'] },
  vampire:    { n: '血饮', d: '每次击杀恢复 6 点生命。', icon: ['drop', '#5a0a10', '#d02030', '#ff9090'] },
  tinker:     { n: '随处改装', d: '可以在任何地方修改法杖。', icon: ['cross', '#4a4a50', '#c0c0d0', '#ffffff'] },
  swift:      { n: '疾行', d: '移动速度 +35%。', icon: ['chev', '#10506a', '#60d0ff', '#ffffff'] },
  wings:      { n: '长翼', d: '悬浮时间翻倍。', icon: ['wing', '#4a4a6a', '#c0c8ff', '#ffffff'], apply: p => { p.flightMax *= 2; p.flight = p.flightMax; } },
  scrolls:    { n: '无尽卷轴', d: '有限次数的法术不再消耗次数。', icon: ['n3', '#5a3a10', '#e0b060', '#ffffff'] },
  secondwind: { n: '第二次呼吸', d: '死亡时以一半生命复活一次。', icon: ['heart', '#1a5a3a', '#60e0a0', '#ffffff'] },
  keen:       { n: '锐眼', d: '所有法术暴击率 +20%。', icon: ['focus', '#6a1020', '#ff6070', '#ffffff'] },
  gilded:     { n: '鎏金灵气', d: '金块吸附范围大幅提升，掉落金币 +50%。', icon: ['star', '#6a5010', '#ffd040', '#ffffff'] },
  volatile:   { n: '爆裂遗骸', d: '敌人死亡时发生爆炸。', icon: ['bomb', '#3a2020', '#a05040', '#ffcf40'] },
  glass:      { n: '琉璃之躯', d: '法术伤害翻倍，但最大生命 -40%。', icon: ['shard', '#3a5a6a', '#c0f0ff', '#ffffff'], apply: p => { p.maxHp = Math.max(20, Math.round(p.maxHp * 0.6)); p.hp = Math.min(p.hp, p.maxHp); } },
  acidhide:   { n: '蚀甲', d: '免疫酸液腐蚀。', icon: ['drop', '#3a5a08', '#b0f040', '#f0ffb0'] },
};
const PERK_IDS = Object.keys(PERKS);
function hasPerk(k) { return !!(player && player.perks[k]); }
function randPerks(n, rand = rnd) {
  const pool = PERK_IDS.filter(k => PERKS[k].stack || !hasPerk(k));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}
function givePerk(k) {
  player.perks[k] = (player.perks[k] || 0) + 1;
  if (PERKS[k].apply) PERKS[k].apply(player);
  toast(`获得天赋「${PERKS[k].n}」：${PERKS[k].d}`, '#ffd76a');
  sfx('perk'); addFlash(player.x, player.y - 6, 80, [1, 0.85, 0.4], 20);
  burst(player.x, player.y - 6, 40, [255, 220, 120], 110, 30);
}

// ---------------------------------------------------------------- player
function mkPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0, w: 5, h: 11, hp: 100, maxHp: 100, dead: false, face: 1, onGround: false, coyote: 0, jumpBuf: 0,
    flight: 3, flightMax: 3, air: 7, airMax: 7, burn: 0, wet: 0, oiled: 0, poison: 0, slow: 0, iframes: 0, hurtT: 0,
    wands: [], cur: 0, bag: new Array(16).fill(null), potions: 1, gold: 0, perks: {}, lastCause: null,
    inLiquid: 0, crush: 0, anim: 0, aim: 0, airT: 0, usedSecond: false, levT: 0, castT: 0, regionIdx: 0,
  };
}
function setPlayerBurn() {
  if (hasPerk('emberskin') || player.wet > 0) return;
  if (!player.burn) floatText(player.x, player.y - 16, '着火了！', '#ff9a40');
  player.burn = Math.max(player.burn, player.oiled > 0 ? 420 : 200);
}
function hurtPlayer(amt, cause, detail) {
  const p = player;
  if (!p || p.dead || amt <= 0 || state !== 'play') return;
  p.hp -= amt;
  p.lastCause = { cause, detail };
  p.hurtT = Math.max(p.hurtT, amt > 3 ? 12 : 4);
  if (amt >= 3) { addShake(Math.min(5, amt * 0.25)); sfx('hurt'); burst(p.x, p.y - 6, Math.min(20, amt | 0), [200, 30, 30], 70, 20, PF_GRAV); hurtFlashT = 8; }
  dmgAccum += amt;
  if (p.hp <= 0) {
    if (hasPerk('secondwind') && !p.usedSecond) {
      p.usedSecond = true; p.hp = p.maxHp * 0.5; p.burn = 0; p.poison = 0; p.air = p.airMax;
      toast('第二次呼吸！你从死亡边缘归来', '#7fffc0'); sfx('perk');
      burst(p.x, p.y - 6, 50, [120, 255, 190], 120, 30); p.iframes = 90;
      return;
    }
    killPlayer();
  }
}
function killPlayer() {
  const p = player;
  p.dead = true; p.hp = 0;
  sfx('death');
  addShake(8);
  burst(p.x, p.y - 6, 60, [180, 20, 20], 120, 40, PF_GRAV);
  for (let k = 0; k < 30; k++) addMatP(p.x + frr(-2, 2), p.y - frr(0, 10), frr(-90, 90), frr(-160, -20), MBLOOD);
  deathT = 0;
  setTimeout(() => showDeath(), 1100);
}
function causeText(c) {
  const d = c ? c.detail : null;
  switch (c && c.cause) {
    case 'fire': return ['烧死', '你在烈焰中化为了灰烬。'];
    case 'lava': return ['烧死', '你跌进了翻滚的熔岩。'];
    case 'drown': return ['溺死', `你溺毙在${d || '水'}中。`];
    case 'crush': return ['压死', `你被坍塌的${d || '沙土'}活埋压死。`];
    case 'toxic': return ['毒死', d ? `${d}的剧毒侵蚀了你。` : '剧毒侵入了你的血液。'];
    case 'acid': return ['毒死', '腐蚀性的酸液将你溶解。'];
    case 'explosion': return ['被炸死', d ? `你被${d}的爆炸吞没。` : '你被一场爆炸吞没。'];
    case 'selfboom': return ['被炸死', '你被自己的法术炸得粉碎。'];
    case 'enemy': return [`被${d || '怪物'}击杀`, `${d || '怪物'}结束了你的旅程。`];
    default: return ['死亡', '你倒在了深渊之中。'];
  }
}
function curWand() { return player.wands[player.cur] || null; }
function wandTip() {
  const w = curWand(); const len = w ? w.look.len : 6;
  return { x: player.x + Math.cos(player.aim) * (len - 1), y: player.y - 7 + Math.sin(player.aim) * (len - 1) };
}
function updPlayer() {
  const p = player;
  if (p.dead) return;
  const dt = STEP;
  // aiming
  const aw = aimWorld();
  p.aim = Math.atan2(aw.y - (p.y - 7), aw.x - p.x);
  p.face = Math.cos(p.aim) >= 0 ? 1 : -1;
  // body sampling
  let liq = 0, liqM = 0, powderOver = 0, solidOver = 0, overM = 0;
  const x0 = Math.floor(p.x) - 2, yb = Math.floor(p.y);
  for (let yy = yb - 11; yy < yb; yy++) for (let xx = x0; xx < x0 + 5; xx++) {
    const m = matAt(xx, yy), t = mT[m];
    if (t === T_LIQUID) { liq++; liqM = m; }
    else if (t === T_POWDER) { powderOver++; overM = m; }
    else if (mHard[m]) { solidOver++; overM = m; }
  }
  p.inLiquid = liq / 55;
  const headM = matAt(p.x, p.y - 10);
  // push powder up out of the body; if it cannot move we are being crushed
  let stuck = 0;
  if (powderOver) {
    for (let yy = yb - 11; yy < yb; yy++) for (let xx = x0; xx < x0 + 5; xx++) {
      const i = yy * W + xx; if (mT[mat[i]] !== T_POWDER) continue;
      let k = yb - 12; let moved = false;
      // shove it sideways out of the body first (nearest side), then up over the head
      const sd = xx < p.x ? -1 : 1;
      for (const ex of [sd < 0 ? x0 - 1 : x0 + 5, sd < 0 ? x0 + 5 : x0 - 1, sd < 0 ? x0 - 2 : x0 + 6]) {
        const j = yy * W + ex, t = mT[mat[j]];
        if (t === T_AIR || t === T_GAS) { const m = mat[i]; setI(i, 0); setI(j, m); moved = true; break; }
      }
      for (let n = 0; n < 16 && k > 1 && !moved; n++, k--) {
        const j = k * W + xx; const t = mT[mat[j]];
        if (t === T_AIR || t === T_GAS || t === T_LIQUID) { const m = mat[i]; setI(i, mat[j] && t === T_LIQUID ? mat[j] : 0); setI(j, m); moved = true; break; }
        if (t === T_SOLID) break;
      }
      if (!moved) stuck++;
    }
  }
  if (solidOver > 0) {
    let fixed = false;
    for (let up = 1; up <= 4; up++) if (!rectHits(p.x, p.y - up, p.w, p.h, false)) { p.y -= up; fixed = true; break; }
    if (!fixed) stuck += solidOver;
  }
  if (stuck >= 9) { hurtPlayer(0.4, 'crush', MATS[overM].n); p.crush = 10; if (frameNo % 20 === 0) floatText(p.x, p.y - 16, '被掩埋！', '#d8b070'); }
  else if (p.crush > 0) p.crush--;
  // input
  const mx = (keyDown('right') ? 1 : 0) - (keyDown('left') ? 1 : 0) + touchMoveX();
  const jumpHeld = keyDown('jump') || touchJumpHeld();
  const jumpPress = consumePress('jump');
  let speed = 74 * (hasPerk('swift') ? 1.35 : 1) * (p.slow > 0 ? 0.55 : 1) * (powderOver > 6 ? 0.45 : 1);
  const target = clamp(mx, -1, 1) * speed;
  p.vx += (target - p.vx) * (p.onGround ? 0.32 : 0.1);
  if (Math.abs(p.vx) < 0.5 && !mx) p.vx = 0;
  const swim = p.inLiquid > 0.35;
  p.vy += GRAV * dt * (swim ? 0.28 : 1);
  if (swim) { p.vy *= 0.93; p.vx *= 0.96; if (jumpHeld) p.vy = Math.max(p.vy - 900 * dt, -85); }
  if (p.onGround) { p.coyote = 7; p.airT = 0; p.flight = Math.min(p.flightMax, p.flight + dt * 2.2); } else { p.coyote--; p.airT += dt; }
  if (jumpPress) p.jumpBuf = 8; else if (p.jumpBuf > 0) p.jumpBuf--;
  if (p.jumpBuf > 0 && p.coyote > 0 && !swim) { p.vy = -152; p.coyote = 0; p.jumpBuf = 0; p.onGround = false; sfx('jump'); burst(p.x, p.y, 5, [150, 140, 120], 40, 10, PF_GRAV); }
  else if (jumpHeld && !p.onGround && !swim && p.flight > 0 && (p.airT > 0.16 || p.vy > -30)) {
    p.vy = Math.max(p.vy - 1000 * dt, -92); p.flight -= dt; p.levT++;
    if (fr() < 0.6) addP(p.x + frr(-2, 2), p.y, frr(-15, 15), frr(20, 50), 10, pack(170, 200, 255), PF_GLOW);
    if (p.levT % 14 === 0) sfx('lev');
  }
  p.vy = Math.min(p.vy, 330);
  moveBody(p, dt, true);
  if (p.onGround && Math.abs(p.vx) > 5) { p.anim += Math.abs(p.vx) * dt * 0.18; if ((p.anim | 0) !== ((p.anim - Math.abs(p.vx) * dt * 0.18) | 0) && fr() < 0.5) sfx('step'); } else if (p.onGround) p.anim = 0;
  if (p.hitCeil && p.vy === 0) p.vy = 10;
  // environment effects
  let envDmg = 0, envCause = null, envDetail = null, best = 0;
  const pts = [[0, -1], [-2, -2], [2, -2], [0, -6], [-2, -6], [2, -6], [0, -10], [-2, -10], [2, -10]];
  let wetHit = false, oilHit = false, fireHit = false, toxHit = false, healHit = 0;
  for (const [ox, oy] of pts) {
    const m = matAt(p.x + ox, p.y + oy);
    if (!m) continue;
    let d = mDmg[m];
    if (m === MWATER || m === MBLOOD || m === MSLIME || m === MSNOW) wetHit = true;
    if (m === MTONIC) { healHit++; wetHit = true; }
    if (m === MOIL) oilHit = true;
    if (m === MFIRE || m === MLAVA) fireHit = true;
    if ((m === MTOXIC || m === MTOXGAS) && !hasPerk('lungs')) toxHit = true;
    if ((m === MFIRE) && hasPerk('emberskin')) d = 0;
    if ((m === MTOXIC || m === MTOXGAS) && hasPerk('lungs')) d = 0;
    if (m === MACID && hasPerk('acidhide')) d = 0;
    if (d > 0) { envDmg += d; if (d > best) { best = d; envCause = mCause[m]; envDetail = MATS[m].n; } }
  }
  if (envDmg > 0) hurtPlayer(envDmg / pts.length * 1.6, envCause, envCause === 'toxic' ? MATS[M.toxic].n : envDetail);
  if (healHit) { p.hp = Math.min(p.maxHp, p.hp + healHit * 0.06); }
  if (wetHit) { p.wet = 300; if (p.burn) { p.burn = 0; sfx('hiss'); burst(p.x, p.y - 8, 10, [200, 210, 220], 40, 20, PF_RISE); } p.oiled = Math.max(0, p.oiled - 4); }
  if (oilHit) p.oiled = 600;
  if (fireHit) setPlayerBurn();
  if (toxHit) p.poison = Math.max(p.poison, 150);
  if (p.burn > 0) {
    p.burn--;
    if (!hasPerk('emberskin')) hurtPlayer(0.1, 'fire');
    if (fr() < 0.7) addP(p.x + frr(-3, 3), p.y - frr(0, 12), frr(-10, 10), frr(-50, -20), 14 + fr() * 12, fpick(FIRECOL.slice(0, 5)), PF_GLOW | PF_RISE);
    if (fr() < 0.05) { const i = (p.y - 1 | 0) * W + (p.x | 0); const m = mat[i + W]; if (mFlam[m] > 0) ignite(i + W, m); }
  }
  if (p.poison > 0) { p.poison--; if (!hasPerk('lungs')) hurtPlayer(0.05, 'toxic', p.lastCause && p.lastCause.cause === 'toxic' ? p.lastCause.detail : null); if (fr() < 0.2) addP(p.x + frr(-3, 3), p.y - frr(2, 12), 0, -15, 20, pack(120, 220, 60), PF_DRAG); }
  if (p.wet > 0) { p.wet--; if (fr() < 0.04) addP(p.x + frr(-2, 2), p.y - frr(2, 10), 0, 30, 14, pack(90, 160, 220), PF_GRAV); }
  if (p.oiled > 0) p.oiled--;
  if (p.slow > 0) p.slow--;
  if (p.iframes > 0) p.iframes--;
  if (p.hurtT > 0) p.hurtT--;
  // drowning
  if (mT[headM] === T_LIQUID && !hasPerk('gills')) {
    p.air -= dt;
    if (p.air <= 0) { p.air = 0; hurtPlayer(0.28, 'drown', MATS[headM].n); if (frameNo % 30 === 0) burst(p.x, p.y - 10, 3, [200, 230, 255], 20, 20, PF_RISE); }
  } else p.air = Math.min(p.airMax, p.air + dt * 2.5);
  // wand casting
  for (const w of p.wands) { w.mana = Math.min(w.manaMax, w.mana + w.manaCharge * dt); if (w.delayT > 0) w.delayT--; if (w.rechargeT > 0) w.rechargeT--; }
  if (fireHeld() && state === 'play') {
    const w = curWand();
    if (w) { const t = wandTip(); if (castWand(w, t.x, t.y, p.aim)) { p.castT = 6; if (!ui.castHint) ui.castHint = 1; } }
  }
  if (p.castT > 0) p.castT--;
  // wand switching, potions, interaction
  const ws = consumePress('wandNext'); if (ws) switchWand((p.cur + ws) % Math.max(1, p.wands.length));
  for (let k = 0; k < 4; k++) if (consumePress('w' + k) && p.wands[k]) switchWand(k);
  if (consumePress('potion')) drinkPotion();
  const it = nearestInteract();
  ui.interact = it;
  if (consumePress('interact') && it) interact(it);
  // region tracking
  const ri_ = regionOf[clamp(p.y | 0, 0, H - 1)];
  if (ri_ !== p.regionIdx) { p.regionIdx = ri_; enterRegion(REG[ri_]); }
  const depth = Math.max(0, Math.floor(p.y / 10));
  stats.maxDepth = Math.max(stats.maxDepth, depth);
  if (p.y > H - 10) hurtPlayer(999, 'lava');
}
function switchWand(k) { if (k === player.cur) return; player.cur = k; sfx('switch'); ui.dirty = true; }
function drinkPotion() {
  const p = player;
  if (p.potions <= 0) { toast('没有药剂了'); return; }
  if (p.hp >= p.maxHp && !p.burn && !p.poison) { toast('生命已满'); return; }
  p.potions--; p.hp = Math.min(p.maxHp, p.hp + 45); p.burn = 0; p.poison = 0; p.wet = 120;
  sfx('drink'); floatText(p.x, p.y - 16, '+45', '#ff7fd0');
  burst(p.x, p.y - 8, 20, [255, 110, 200], 60, 25, PF_GLOW | PF_RISE);
  ui.dirty = true;
}
function enterRegion(r) {
  showBanner(r.name, r.en);
  setDrone(r);
  if (r.kind === 'sanct' && !r.visited) {
    r.visited = true;
    player.hp = player.maxHp; player.burn = 0; player.poison = 0;
    for (const w of player.wands) { for (const s of w.slots) if (s && SP[s.id].uses) s.uses = SP[s.id].uses; w.mana = w.manaMax; }
    for (const s of player.bag) if (s && SP[s.id].uses) s.uses = SP[s.id].uses;
    toast('静息圣所：生命已完全恢复，有限法术已补充。在此可自由修改法杖（Tab）。', '#ffd76a');
    sfx('perk');
  }
}
function canEdit() {
  if (hasPerk('tinker')) return true;
  const r = REG[player.regionIdx];
  if (r && r.kind === 'sanct') return true;
  for (const p of pickups) if (p.kind === 'altar' && Math.abs(p.x - player.x) < 36 && Math.abs(p.y - player.y) < 30) return true;
  return false;
}

// ---------------------------------------------------------------- pickups
function mkPickup(kind, x, y, o) { return Object.assign({ kind, x, y, vx: 0, vy: 0, t: (fr() * 100) | 0, dead: false }, o || {}); }
function spawnGold(x, y, v, pop) {
  const p = mkPickup('gold', x, y, { v, despawn: 1200 });
  if (pop) { p.vx = frr(-60, 60); p.vy = frr(-130, -40); }
  pickups.push(p); return p;
}
function nearestInteract() {
  let best = null, bd = 18;
  for (const q of pickups) {
    if (q.dead) continue;
    if (!(q.kind === 'wand' || q.kind === 'perk' || q.kind === 'shop' || q.kind === 'reroll' || q.kind === 'altar' || q.kind === 'chest')) continue;
    const d = Math.abs(q.x - player.x) + Math.abs(q.y - player.y) * 0.6;
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function interactText(q) {
  switch (q.kind) {
    case 'wand': return `[E] 拾取 ${q.wand.name}`;
    case 'perk': return `[E] 获得天赋「${PERKS[q.perk].n}」— ${PERKS[q.perk].d}`;
    case 'shop': return `[E] 购买 ${q.item.kind === 'wand' ? q.item.wand.name : SP[q.item.id].n} — ${q.price} 金`;
    case 'reroll': return `[E] 重掷天赋 — ${rerollCost()} 金`;
    case 'altar': return `[E] 在石台前编辑法杖`;
    case 'chest': return `[E] 打开宝箱`;
  }
  return '';
}
let rerollN = 0;
const rerollCost = () => 200 * (1 << rerollN);
function interact(q) {
  const p = player;
  switch (q.kind) {
    case 'wand': takeWand(q.wand, q); break;
    case 'perk': {
      givePerk(q.perk);
      for (const o of pickups) if ((o.kind === 'perk' || o.kind === 'reroll') && o.group === q.group) { o.dead = true; burst(o.x, o.y - 6, 12, [255, 220, 120], 50, 20); }
      break;
    }
    case 'reroll': {
      const c = rerollCost();
      if (p.gold < c) { toast(`金币不足（需要 ${c}）`); sfx('fizzle'); break; }
      p.gold -= c; rerollN++;
      const list = pickups.filter(o => o.kind === 'perk' && o.group === q.group && !o.dead);
      const np = randPerks(list.length, fr);
      list.forEach((o, n) => { o.perk = np[n] || o.perk; burst(o.x, o.y - 8, 14, [255, 220, 120], 60, 20); });
      sfx('perk'); toast('天赋已重掷');
      break;
    }
    case 'shop': {
      if (p.gold < q.price) { toast(`金币不足（需要 ${q.price}）`); sfx('fizzle'); break; }
      if (q.item.kind === 'spell') { if (!addToBag(q.item.id)) { toast('法术背包已满'); break; } }
      else takeWand(q.item.wand, null);
      p.gold -= q.price; q.dead = true; sfx('buy'); toast('购买成功');
      break;
    }
    case 'altar': openEditor(); break;
    case 'chest': openChest(q); break;
  }
  ui.dirty = true;
}
function takeWand(w, src) {
  const p = player;
  if (p.wands.length < 4) { p.wands.push(w); p.cur = p.wands.length - 1; if (src) src.dead = true; }
  else {
    const old = p.wands[p.cur]; p.wands[p.cur] = w;
    if (src) { src.wand = old; src.vy = -80; } else pickups.push(mkPickup('wand', p.x, p.y - 4, { wand: old, vy: -80 }));
  }
  w.dirty = true;
  sfx('pick'); toast(`获得法杖：${w.name}`, '#9fd8ff');
}
function addToBag(id) {
  const k = player.bag.indexOf(null);
  if (k < 0) return false;
  player.bag[k] = mkSlot(id); ui.dirty = true; return true;
}
function openChest(c) {
  c.dead = true;
  sfx('chest'); addShake(2);
  addFlash(c.x, c.y - 4, 70, [1, 0.8, 0.35], 18);
  burst(c.x, c.y - 4, 30, [255, 210, 90], 110, 30);
  const tier = c.tier || 1;
  const n = ri(12, 22);
  for (let k = 0; k < n; k++) spawnGold(c.x + frr(-3, 3), c.y - 5, ri(3, 6) * tier, true);
  const rolls = ri(1, 2);
  for (let k = 0; k < rolls; k++) {
    const r = fr();
    let it;
    if (r < 0.3) it = mkPickup('potion', c.x, c.y - 6, {});
    else if (r < 0.66) it = mkPickup('spell', c.x, c.y - 6, { id: randSpell(tier + 1, fr) });
    else if (r < 0.82) it = mkPickup('wand', c.x, c.y - 6, { wand: genWand(tier + 1) });
    else it = mkPickup('heart', c.x, c.y - 6, {});
    it.vx = frr(-50, 50); it.vy = frr(-140, -80);
    pickups.push(it);
  }
  toast('宝箱打开了！', '#ffd76a');
}
function updPickups() {
  const p = player, dt = STEP;
  const magR = hasPerk('gilded') ? 72 : 26;
  for (const q of pickups) {
    if (q.dead) continue;
    if (Math.abs(q.y - camY - VH / 2) > VH + 120) continue;
    q.t++;
    if (!q.fixed) {
      if (q.kind === 'gold' && !p.dead) {
        const d = dist(q.x, q.y - 1, p.x, p.y - 6);
        if (d < magR) { const a = Math.atan2(p.y - 6 - q.y, p.x - q.x); q.vx += Math.cos(a) * 900 * dt; q.vy += Math.sin(a) * 900 * dt; q.vx *= 0.9; q.vy *= 0.9; q.x += q.vx * dt; q.y += q.vy * dt; if (d < 5) { q.dead = true; const v = Math.round(q.v * (hasPerk('gilded') ? 1.5 : 1)); p.gold += v; stats.gold += v; sfx('gold'); floatText(q.x, q.y - 4, '+' + v, '#ffd84a'); } continue; }
        if (q.despawn && --q.despawn <= 0) { q.dead = true; continue; }
      }
      const inLiq = mT[matAt(q.x, q.y - 1)] === T_LIQUID;
      q.vy += GRAV * dt * (inLiq ? 0.15 : 1); if (inLiq) { q.vx *= 0.9; q.vy *= 0.9; }
      q.vy = Math.min(q.vy, 260);
      let nx = q.x + q.vx * dt, ny = q.y + q.vy * dt;
      if (solidAt(nx, q.y - 1)) { q.vx = -q.vx * 0.3; nx = q.x; }
      if (q.vy > 0 && solidAt(nx, ny)) { let yy = Math.floor(q.y); while (yy < ny && !solidAt(nx, yy + 1)) yy++; ny = yy + 0.99; q.vy = 0; q.vx *= 0.75; }
      else if (q.vy < 0 && solidAt(nx, ny - 3)) { q.vy = 0; ny = q.y; }
      if (solidAt(nx, ny - 1)) ny -= 1;
      q.x = nx; q.y = ny;
    }
    if (p.dead) continue;
    const dx = Math.abs(q.x - p.x), dy = (p.y - 6) - (q.y - 3);
    const touch = dx < 7 && Math.abs(dy) < 10;
    switch (q.kind) {
      case 'potion': if (touch && q.t > 20) { if (p.potions < 6) { q.dead = true; p.potions++; sfx('pick'); toast(touchMode ? '获得愈合药剂（点「药剂」饮用）' : '获得愈合药剂（Q 饮用）', '#ff9fe0'); ui.dirty = true; } } break;
      case 'heart': if (touch && q.t > 20) { q.dead = true; p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 40); sfx('perk'); toast('心之晶：最大生命 +25', '#ff7f9f'); burst(q.x, q.y - 4, 24, [255, 90, 130], 80, 25); } break;
      case 'spell': if (touch && q.t > 20) { if (addToBag(q.id)) { q.dead = true; sfx('pick'); toast(`获得法术：${SP[q.id].n}（Tab 打开法杖编辑）`, '#9fd8ff'); } else if (q.t % 120 === 0) toast('法术背包已满'); } break;
      case 'chest': if (touch && q.t > 30 && Math.abs(p.vx) > 1) openChest(q); break;
      case 'orb': if (touch) winGame(); break;
    }
  }
  if (frameNo % 30 === 0) pickups = pickups.filter(q => !q.dead);
}

// ---------------------------------------------------------------- enemies
const EDEF = {
  tusker: { n: '锈背獠猪', hp: 40, w: 12, h: 8, spd: 34, dmg: 16, gold: [4, 9], blood: 'blood', ai: 'charger' },
  hexer:  { n: '咒术信徒', hp: 32, w: 6, h: 12, spd: 28, dmg: 6, gold: [6, 12], blood: 'blood', ai: 'caster' },
  bat:    { n: '暮翼蝠', hp: 13, w: 8, h: 6, spd: 70, dmg: 7, fly: true, gold: [2, 5], blood: 'blood', ai: 'bat' },
  bloat:  { n: '火药囊虫', hp: 16, w: 9, h: 9, spd: 24, dmg: 0, gold: [3, 7], blood: 'gunpowder', ai: 'bloat' },
  worm:   { n: '噬岩蠕虫', hp: 95, w: 8, h: 8, spd: 72, dmg: 14, burrow: true, gold: [10, 20], blood: 'blood', ai: 'worm' },
  spore:  { n: '孢雾菇', hp: 26, w: 10, h: 10, spd: 0, dmg: 5, gold: [4, 8], blood: 'slime', ai: 'spore', immuneTox: true },
  blob:   { n: '熔渣史莱姆', hp: 30, w: 10, h: 7, spd: 40, dmg: 12, gold: [5, 10], blood: 'lava', ai: 'blob', immuneFire: true },
  wraith: { n: '霜魂', hp: 28, w: 8, h: 12, spd: 38, dmg: 9, fly: true, phase: true, gold: [6, 12], blood: 'snow', ai: 'wraith' },
  warden: { n: '熔炉守卫', hp: 900, w: 22, h: 24, spd: 34, dmg: 22, fly: true, phase: true, boss: true, gold: [220, 280], blood: 'lava', ai: 'warden', immuneFire: true, immuneTox: true },
};
function spawnEnemy(type, x, y, tier) {
  const def = EDEF[type];
  const hpMul = 1 + 0.5 * (tier - 1), dmgMul = 1 + 0.3 * (tier - 1);
  const e = {
    type, def, x, y, vx: 0, vy: 0, w: def.w, h: def.h, hp: def.hp * (def.boss ? 1 : hpMul), maxHp: def.hp * (def.boss ? 1 : hpMul), dmgMul, tier,
    dir: fr() < 0.5 ? -1 : 1, state: 'idle', st: 0, t: (fr() * 100) | 0, cd: 60 + fr() * 90, flash: 0, burn: 0, poison: 0, slow: 0, stun: 0,
    onGround: false, active: false, dead: false, boss: !!def.boss, fixed: false, alert: false, seen: 0,
  };
  if (def.burrow) { e.segs = []; for (let k = 0; k < 9; k++) e.segs.push({ x, y: y + k * 4 }); e.ang = -Math.PI / 2; }
  enemies.push(e); return e;
}
const ecy = (e) => e.def.burrow ? e.y : e.y - e.h / 2;
function enemyHitTest(e, x, y, r = 1) {
  if (e.def.burrow) {
    for (const s of e.segs) if (Math.abs(s.x - x) < 4 + r && Math.abs(s.y - y) < 4 + r) return true;
    return Math.abs(e.x - x) < 5 + r && Math.abs(e.y - y) < 5 + r;
  }
  return x > e.x - e.w / 2 - r && x < e.x + e.w / 2 + r && y > e.y - e.h - r && y < e.y + r;
}
function damageEnemy(e, amt, info) {
  if (e.dead) return;
  if (info.owner === 'player' && hasPerk('glass')) amt *= 2;
  if (info.kind === 'fire' && e.def.immuneFire) return;
  e.hp -= amt; e.flash = 6; e.alert = true;
  if (info.fire && !e.def.immuneFire) { if (!e.burn) floatText(e.x, e.y - e.h - 4, '燃烧', '#ff9a40'); e.burn = 240; }
  if (info.venom && !e.def.immuneTox) e.poison = 300;
  if (info.frost) e.slow = 150;
  if (info.stun) e.stun = 30;
  if (amt >= 1) floatText(e.x + frr(-3, 3), e.y - e.h - 2, Math.round(amt), info.crit ? '#ffe04a' : '#ffffff', info.crit);
  if (amt >= 2) { sfx('hit'); const bm = M[e.def.blood]; for (let k = 0; k < Math.min(6, amt / 3); k++) addMatP(e.x, ecy(e), frr(-60, 60), frr(-90, -10), bm); burst(e.x, ecy(e), 5, PAL[bm * 8 + 2], 50, 12, PF_GRAV); }
  if (e.hp <= 0) killEnemy(e, info);
}
function killEnemy(e, info) {
  if (e.dead) return;
  e.dead = true;
  const def = e.def;
  if (!info.self && !player.dead) stats.kills++;
  sfx(e.boss ? 'bossdie' : 'edie');
  const cy = ecy(e);
  const bm = M[def.blood];
  const nb = e.boss ? 80 : 18;
  for (let k = 0; k < nb; k++) addMatP(e.x + frr(-e.w / 2, e.w / 2), cy + frr(-3, 3), frr(-100, 100), frr(-170, -20), bm);
  burst(e.x, cy, e.boss ? 90 : 26, [255, 230, 190], e.boss ? 220 : 100, 26);
  addFlash(e.x, cy, e.boss ? 200 : 40, [1, 0.8, 0.6], 12);
  if (e.def.burrow) for (const s of e.segs) { burst(s.x, s.y, 6, PAL[bm * 8 + 3], 60, 18, PF_GRAV); for (let k = 0; k < 3; k++) addMatP(s.x, s.y, frr(-60, 60), frr(-100, 0), bm); }
  let g = ri(def.gold[0], def.gold[1]) * (e.boss ? 1 : e.tier);
  if (e.burn > 0) g *= 2;
  const nn = Math.min(14, Math.ceil(g / 6));
  for (let k = 0; k < nn; k++) spawnGold(e.x, cy, Math.max(1, Math.round(g / nn)), true);
  if (!info.self && hasPerk('vampire')) { player.hp = Math.min(player.maxHp, player.hp + 6); floatText(player.x, player.y - 16, '+6', '#ff5060'); }
  if (e.type === 'bloat' && !info.self) explode(e.x, cy, 11, 8, 30 * e.dmgMul, 'enemy', { fire: true, srcName: def.n });
  else if (!info.self && hasPerk('volatile')) explode(e.x, cy, 8, 6, 16, 'player', { fire: false });
  if (e.boss) {
    addShake(14); toast('熔炉守卫倒下了——余烬之心已无人守护！', '#ffb070');
    for (let k = 0; k < 4; k++) pickups.push(mkPickup('heart', e.x + k * 6 - 9, cy, { vx: frr(-40, 40), vy: -120 }));
  }
}
function enemyEnv(e) {
  const def = e.def;
  const m1 = matAt(e.x, ecy(e)), m2 = matAt(e.x, e.y - 1);
  for (const m of [m1, m2]) {
    if (!m) continue;
    if (m === MLAVA && !def.immuneFire) { damageEnemy(e, 0.9, { kind: 'fire', owner: 'env' }); e.burn = 240; }
    else if (m === MFIRE && !def.immuneFire && !e.burn) e.burn = 200;
    else if (m === MACID) damageEnemy(e, 0.4, { kind: 'acid', owner: 'env' });
    else if ((m === MTOXIC || m === MTOXGAS) && !def.immuneTox) { e.poison = Math.max(e.poison, 120); }
    else if ((m === MWATER || m === MBLOOD || m === MSNOW) && e.burn) { e.burn = 0; burst(e.x, ecy(e), 6, [210, 210, 220], 30, 16, PF_RISE); }
  }
  if (e.burn > 0) {
    e.burn--;
    if (frameNo % 6 === 0) damageEnemy(e, 0.8, { kind: 'fire', owner: 'player' });
    if (fr() < 0.6) addP(e.x + frr(-e.w / 2, e.w / 2), ecy(e) + frr(-e.h / 2, e.h / 2), frr(-10, 10), frr(-50, -20), 14, fpick(FIRECOL.slice(0, 5)), PF_GLOW | PF_RISE);
    if (fr() < 0.03) { const i = (e.y | 0) * W + (e.x | 0); if (mat[i] === 0) setI(i, MFIRE, 12); else if (mFlam[mat[i]] > 0) ignite(i, mat[i]); }
  }
  if (e.poison > 0) { e.poison--; if (frameNo % 10 === 0) damageEnemy(e, 0.7, { kind: 'toxic', owner: 'player' }); if (fr() < 0.15) addP(e.x, ecy(e), 0, -12, 18, pack(120, 220, 60), PF_DRAG); }
}
function contactPlayer(e, dmg, kb = 120) {
  const p = player;
  if (p.dead || p.iframes > 0 || dmg <= 0) return false;
  let hit;
  if (e.def.burrow) hit = [e, ...e.segs].some(s => Math.abs(s.x - p.x) < 6 && Math.abs(s.y - (p.y - 6)) < 9);
  else hit = Math.abs(e.x - p.x) < (e.w + p.w) / 2 && e.y - e.h < p.y && e.y > p.y - p.h;
  if (!hit) return false;
  hurtPlayer(dmg * e.dmgMul, 'enemy', e.def.n);
  p.iframes = 36;
  const a = Math.atan2(p.y - 6 - ecy(e), p.x - e.x);
  p.vx += Math.cos(a) * kb; p.vy += Math.sin(a) * kb * 0.6 - 60;
  return true;
}
function updEnemy(e) {
  const def = e.def, dt = STEP, p = player;
  e.t++;
  if (e.flash > 0) e.flash--;
  if (e.cd > 0) e.cd--;
  if (e.slow > 0) e.slow--;
  enemyEnv(e);
  if (e.dead) return;
  const px = p.x, py = p.y - 6;
  const dx = px - e.x, dy = py - ecy(e), pd = Math.hypot(dx, dy);
  const alive = !p.dead;
  const slowF = e.slow > 0 ? 0.5 : 1;
  if (e.stun > 0) { e.stun--; e.vx *= 0.8; if (!def.fly) { e.vy += GRAV * dt; moveBody(e, dt, false); } if (fr() < 0.3) arcFx(e.x, ecy(e)); return; }
  const sees = alive && pd < 220 && (e.t % 8 === 0 ? (e.seen = los(e.x, ecy(e) - 2, px, py) ? 1 : 0) : e.seen);
  if (sees) e.alert = true;
  switch (def.ai) {
    case 'charger': {
      if (e.state === 'idle') {
        e.vx = e.dir * 18;
        if (e.hitWall || !solidAt(e.x + e.dir * 7, e.y + 3)) e.dir = -e.dir;
        if (sees && pd < 180) e.state = 'chase';
      } else if (e.state === 'chase') {
        e.dir = Math.sign(dx) || 1; e.vx = e.dir * def.spd * slowF;
        if (pd < 120 && Math.abs(dy) < 16 && e.cd <= 0 && sees) { e.state = 'windup'; e.st = 32; sfx('snort'); }
        if (!sees && e.t % 200 === 0) e.state = 'idle';
      } else if (e.state === 'windup') {
        e.vx = 0; e.dir = Math.sign(dx) || e.dir;
        if (fr() < 0.5) addP(e.x - e.dir * 6, e.y - 1, -e.dir * frr(20, 50), frr(-30, -5), 12, pack(150, 130, 110), PF_GRAV);
        if (--e.st <= 0) { e.state = 'charge'; e.st = 70; e.cdir = e.dir; sfx('charge'); }
      } else if (e.state === 'charge') {
        e.vx = e.cdir * 205 * slowF;
        if (fr() < 0.7) addP(e.x - e.cdir * 6, e.y - 1, -e.cdir * frr(10, 40), frr(-30, -5), 14, pack(150, 130, 110), PF_GRAV);
        if (contactPlayer(e, def.dmg, 220)) { e.state = 'recover'; e.st = 30; e.cd = 110; }
        else if (e.hitWall) { e.state = 'stun'; e.st = 80; addShake(3); sfx('thud'); digCircle(e.x + e.cdir * 8, e.y - 4, 3, 6, 0.4); burst(e.x + e.cdir * 7, e.y - 4, 12, [180, 160, 120], 70, 16, PF_GRAV); e.cd = 110; }
        else if (--e.st <= 0) { e.state = 'recover'; e.st = 30; e.cd = 110; }
      } else if (e.state === 'stun') { e.vx = 0; if (fr() < 0.15) addP(e.x + frr(-4, 4), e.y - e.h - 2, 0, -10, 20, pack(255, 240, 120), PF_GLOW); if (--e.st <= 0) e.state = 'chase'; }
      else if (e.state === 'recover') { e.vx *= 0.85; if (--e.st <= 0) e.state = 'chase'; }
      if (e.state !== 'charge') contactPlayer(e, def.dmg * 0.4, 90);
      walker(e); break;
    }
    case 'caster': {
      if (e.state === 'idle') { e.vx = Math.sin(e.t / 90) * 12; if (e.alert && alive) e.state = 'alert'; }
      else if (e.state === 'alert') {
        e.dir = Math.sign(dx) || 1;
        const want = pd < 80 ? -1 : pd > 150 ? 1 : 0;
        e.vx = e.dir * want * def.spd * slowF;
        if (e.hitWall && e.onGround) e.vy = -120;
        if (e.cd <= 0 && sees && pd < 230) { e.state = 'cast'; e.st = 40; sfx('charge2'); }
        if (!alive) e.state = 'idle';
      } else if (e.state === 'cast') {
        e.vx = 0;
        const hx = e.x + e.dir * 4, hy = e.y - 8;
        addP(hx + frr(-3, 3), hy + frr(-3, 3), frr(-20, 20), frr(-20, 20), 10, pack(230, 90, 255), PF_GLOW);
        if (--e.st <= 0) {
          const a = Math.atan2(dy, dx);
          for (let k = -2; k <= 2; k++) enemyShot(e, 'hexorb', a + k * 0.18, 1);
          e.cd = 150 + fr() * 60; e.state = 'alert'; sfx('ecast');
        }
      }
      contactPlayer(e, def.dmg, 80);
      walker(e); break;
    }
    case 'bat': {
      const spd = def.spd * slowF;
      if (e.state === 'idle') { e.vx = Math.sin(e.t / 40) * 22; e.vy = Math.sin(e.t / 9) * 26; if (sees && pd < 160) e.state = 'hunt'; }
      else if (e.state === 'hunt') {
        const tx = px + Math.sin(e.t / 30) * 34, ty = py - 26 + Math.sin(e.t / 13) * 10;
        e.vx += clamp(tx - e.x, -1, 1) * 6; e.vy += clamp(ty - ecy(e), -1, 1) * 6;
        e.vx = clamp(e.vx, -spd, spd); e.vy = clamp(e.vy, -spd, spd);
        if (e.cd <= 0 && pd < 100 && sees) { e.state = 'swoop'; e.st = 40; const a = Math.atan2(dy, dx); e.vx = Math.cos(a) * 150 * slowF; e.vy = Math.sin(a) * 150 * slowF; sfx('screech'); }
        if (!alive) e.state = 'idle';
      } else if (e.state === 'swoop') {
        if (contactPlayer(e, def.dmg, 70) || --e.st <= 0) { e.state = 'retreat'; e.st = 40; e.vx = -Math.sign(dx) * 60; e.vy = -70; e.cd = 70; }
      } else if (e.state === 'retreat') { if (--e.st <= 0) e.state = 'hunt'; }
      flyer(e, false); break;
    }
    case 'bloat': {
      if (e.state === 'fuse') {
        e.vx = 0; e.flash = (e.st >> 2) & 1 ? 3 : 0;
        if (e.st % 8 === 0) sfx('fuse');
        if (fr() < 0.5) addP(e.x + frr(-2, 2), e.y - e.h, frr(-20, 20), frr(-50, -20), 10, pack(255, 220, 110), PF_GLOW | PF_GRAV);
        if (--e.st <= 0) { e.dead = true; explode(e.x, ecy(e), 14, 9, 42 * e.dmgMul, 'enemy', { fire: true, srcName: def.n }); for (let k = 0; k < 10; k++) addMatP(e.x, ecy(e), frr(-80, 80), frr(-120, -20), MGUN); }
      } else {
        if (e.alert && alive) { e.dir = Math.sign(dx) || 1; e.vx = e.dir * def.spd * slowF; } else { e.vx = e.dir * 10; if (e.hitWall) e.dir = -e.dir; }
        if ((alive && pd < 22) || e.burn > 0) { e.state = 'fuse'; e.st = e.burn > 0 ? 20 : 54; }
      }
      walker(e); break;
    }
    case 'worm': worm(e, pd, dx, dy, alive, slowF); break;
    case 'spore': {
      e.vx = 0;
      if (alive && pd < 120 && e.cd <= 0) {
        placeBlob(e.x, e.y - e.h, 3, MTOXGAS, true, 0.7);
        burst(e.x, e.y - e.h, 14, [140, 230, 80], 50, 30, PF_DRAG);
        const a = Math.atan2(dy - 20, dx);
        for (let k = -1; k <= 1; k++) enemyShot(e, 'sporeb', a + k * 0.3, 0.8 + fr() * 0.4);
        e.cd = 170 + fr() * 60; sfx('puff');
      }
      contactPlayer(e, def.dmg, 60);
      walker(e); break;
    }
    case 'blob': {
      if (e.onGround) {
        e.vx *= 0.7;
        if (e.cd <= 0 && alive && (sees || pd < 120) && pd < 200) {
          e.dir = Math.sign(dx) || 1; e.vx = e.dir * rr(60, 95) * slowF; e.vy = -rr(150, 190); e.cd = 60 + fr() * 40; sfx('blob');
        }
        if (e.landed === false) { e.landed = true; burst(e.x, e.y, 8, [255, 140, 40], 60, 14, PF_GRAV | PF_GLOW); if (fr() < 0.3) { const i = (e.y - 1 | 0) * W + (e.x | 0); if (mat[i] === 0) setI(i, MLAVA); } }
      } else e.landed = false;
      contactPlayer(e, def.dmg, 100);
      walker(e); break;
    }
    case 'wraith': {
      const want = alive && e.alert ? 1 : 0;
      if (want) {
        const tx = px - Math.sign(dx || 1) * 90, ty = py - 30;
        e.vx += clamp(tx - e.x, -1, 1) * 3; e.vy += clamp(ty - ecy(e), -1, 1) * 3;
        const sp = def.spd * slowF; e.vx = clamp(e.vx, -sp, sp); e.vy = clamp(e.vy, -sp, sp);
        if (e.cd <= 0 && pd < 220) { const a = Math.atan2(dy, dx); for (let k = -1; k <= 1; k++) enemyShot(e, 'shard', a + k * 0.16, 1); e.cd = 140 + fr() * 60; sfx('ecast'); }
      } else { e.vx = Math.sin(e.t / 60) * 12; e.vy = Math.sin(e.t / 25) * 8; if (pd < 200 && alive) e.alert = true; }
      if (fr() < 0.3) addP(e.x + frr(-3, 3), e.y - frr(0, 4), frr(-5, 5), frr(5, 15), 20, pack(170, 220, 255), PF_GLOW);
      contactPlayer(e, def.dmg, 80);
      flyer(e, true); break;
    }
    case 'warden': warden(e, pd, dx, dy, alive); break;
  }
}
function walker(e) {
  const dt = STEP;
  const inLiq = mT[matAt(e.x, e.y - 2)] === T_LIQUID;
  e.inLiquid = inLiq;
  e.vy += GRAV * dt * (inLiq ? 0.3 : 1);
  if (inLiq) { e.vy *= 0.92; if (e.def.immuneFire && matAt(e.x, e.y - 2) === MLAVA) e.vy -= 8; }
  e.vy = Math.min(e.vy, 300);
  if (!e.onGround && e.def.ai !== 'blob' && e.state !== 'charge') e.vx *= 0.98;
  moveBody(e, dt, false);
  if (e.y > H - 4) e.dead = true;
}
function flyer(e, phase) {
  const dt = STEP;
  const nx = e.x + e.vx * dt, ny = e.y + e.vy * dt;
  if (phase) { e.x = clamp(nx, 8, W - 8); e.y = clamp(ny, 8, H - 8); return; }
  if (!rectHits(nx, e.y, e.w, e.h, false)) e.x = nx; else { e.vx = -e.vx * 0.6; }
  if (!rectHits(e.x, ny, e.w, e.h, false)) e.y = ny; else { e.vy = -e.vy * 0.6; }
}
function worm(e, pd, dx, dy, alive, slowF) {
  const dt = STEP, def = e.def;
  const inRock = solidAt(e.x, e.y);
  const spd = def.spd * slowF * (e.alert ? 1.2 : 0.6);
  if (alive && pd < 260) e.alert = true;
  let want = e.ang;
  if (e.alert && alive) want = Math.atan2(dy, dx);
  else want = e.ang + Math.sin(e.t / 50) * 0.05;
  let da = want - e.ang; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  if (inRock) {
    e.ang += clamp(da, -0.05, 0.05);
    e.vx = Math.cos(e.ang) * spd; e.vy = Math.sin(e.ang) * spd;
    if (e.t % 2 === 0) digCircle(e.x + Math.cos(e.ang) * 3, e.y + Math.sin(e.ang) * 3, 4, 11, 0.05);
    if (e.alert && e.t % 40 === 0 && pd < 200) { sfx('rumble'); addShake(1.2); }
  } else {
    e.vy += GRAV * 0.75 * dt;
    e.ang = Math.atan2(e.vy, e.vx);
    e.ang += clamp(da, -0.012, 0.012);
    const sp = Math.hypot(e.vx, e.vy);
    e.vx = Math.cos(e.ang) * sp; e.vy = Math.sin(e.ang) * sp;
  }
  e.x = clamp(e.x + e.vx * dt, 8, W - 8); e.y = clamp(e.y + e.vy * dt, 8, H - 8);
  let lx = e.x, ly = e.y;
  for (const s of e.segs) {
    const d = dist(s.x, s.y, lx, ly);
    if (d > 4) { s.x = lx + (s.x - lx) * 4 / d; s.y = ly + (s.y - ly) * 4 / d; }
    lx = s.x; ly = s.y;
  }
  contactPlayer(e, def.dmg, 140);
}
function warden(e, pd, dx, dy, alive) {
  const def = e.def;
  const r = REG[REG.length - 1];
  if (!e.alert && alive && pd < 240) { e.alert = true; showBanner('熔炉守卫', 'WARDEN OF THE FORGE'); sfx('boss'); }
  if (!e.alert) { e.vx = 0; e.vy = Math.sin(e.t / 30) * 6; flyer(e, true); return; }
  if (e.state === 'idle') { e.state = 'hover'; e.st = 100; }
  if (e.state === 'hover') {
    const tx = clamp(player.x, 40, W - 40), ty = clamp(player.y - 70, r.y0 + 30, r.y0 + 120);
    e.vx += clamp(tx - e.x, -1, 1) * 4; e.vy += clamp(ty - e.y, -1, 1) * 4;
    e.vx = clamp(e.vx, -def.spd, def.spd); e.vy = clamp(e.vy, -def.spd, def.spd);
    if (--e.st <= 0) { e.state = rpick(['ring', 'volley', 'slam', e.hp < e.maxHp * 0.6 ? 'summon' : 'volley']); e.st = e.state === 'slam' ? 45 : e.state === 'volley' ? 90 : 30; e.vx = 0; e.vy = 0; }
  } else if (e.state === 'ring') {
    if (e.st === 30) sfx('charge2');
    if (--e.st <= 0) { const n = 14; for (let k = 0; k < n; k++) enemyShot(e, 'fireball', k / n * Math.PI * 2 + e.t * 0.01, 1); sfx('ecast'); addShake(3); e.state = 'hover'; e.st = 110; }
  } else if (e.state === 'volley') {
    if (e.st % 25 === 0) { const a = Math.atan2(dy, dx); for (let k = -2; k <= 2; k++) enemyShot(e, 'magma', a + k * 0.12, 1.2); sfx('ecast'); }
    if (--e.st <= 0) { e.state = 'hover'; e.st = 100; }
  } else if (e.state === 'slam') {
    e.flash = (e.st >> 2) & 1 ? 3 : 0;
    if (--e.st <= 0) { const a = Math.atan2(dy, dx); e.vx = Math.cos(a) * 250; e.vy = Math.sin(a) * 250; e.state = 'dash'; e.st = 50; sfx('charge'); }
  } else if (e.state === 'dash') {
    if (fr() < 0.8) addP(e.x + frr(-8, 8), ecy(e) + frr(-8, 8), 0, 0, 20, fpick(FIRECOL.slice(1, 5)), PF_GLOW);
    const hitT = solidAt(e.x + Math.sign(e.vx) * 10, ecy(e)) || solidAt(e.x, e.y + 2);
    if (hitT || --e.st <= 0 || pd < 12) { explode(e.x, ecy(e) + 6, 14, 11, 30, 'enemy', { fire: true, srcName: def.n }); e.vx = 0; e.vy = 0; e.state = 'hover'; e.st = 120; }
  } else if (e.state === 'summon') {
    if (--e.st <= 0) { for (let k = 0; k < 2; k++) { const b = spawnEnemy('bloat', e.x + (k ? 14 : -14), e.y, 5); b.alert = true; b.vy = -60; burst(b.x, b.y - 4, 20, [255, 120, 40], 60, 20); } sfx('ecast'); e.state = 'hover'; e.st = 140; }
  }
  if (fr() < 0.5) addP(e.x + frr(-10, 10), e.y - frr(0, 4), frr(-10, 10), frr(10, 30), 16, fpick(FIRECOL.slice(1, 5)), PF_GLOW);
  contactPlayer(e, def.dmg, 180);
  flyer(e, true);
  e.y = Math.min(e.y, r.y0 + 150);
}
function updEnemies() {
  const cx = camX + VW / 2, cy = camY + VH / 2;
  for (const e of enemies) {
    if (e.dead) continue;
    e.active = Math.abs(e.x - cx) < VW / 2 + 110 && Math.abs(ecy(e) - cy) < VH / 2 + 110;
    if (e.active) updEnemy(e);
  }
  if (frameNo % 30 === 0) enemies = enemies.filter(e => !e.dead);
}

// ---------------------------------------------------------------- sprites (all original, drawn as text)
function spr(rows, pal, emit = '') {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const px = new Uint32Array(w * h), em = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x] || '.';
    if (ch === '.' || ch === ' ' || !pal[ch]) continue;
    px[y * w + x] = typeof pal[ch] === 'number' ? pal[ch] : pack(...hexRGB(pal[ch]));
    if (emit.indexOf(ch) >= 0) em[y * w + x] = 1;
  }
  return { w, h, px, em };
}
const PL_PAL = { k: '#120e16', C: '#4a9a8e', c: '#2d6c65', d: '#1b4442', S: '#f0b040', s: '#b0701c', e: '#fff1b0', b: '#3a2b22', g: '#c9a14a' };
const PL_TOP = ['..kkk..', '.kCCck.', 'kCCccck', 'kCckeek', 'kcckkkk'];
const PL_MID = ['kCcScdk', 'kCcgcdk', 'kCcccdk', 'kccccdk'];
function plFrame(scarf, legs, hem) { return spr([...PL_TOP, scarf, ...PL_MID.slice(0, 3), hem || PL_MID[3], ...legs], PL_PAL, 'e'); }
const SPR_PLAYER = {
  idle: [plFrame('.kSSsk.', ['.kbkbk.', '.kb.bk.']), plFrame('skSSsk.', ['.kbkbk.', '.kb.bk.'])],
  walk: [
    plFrame('skSSsk.', ['.kbkbk.', 'kb...bk'], '.kcccdk'),
    plFrame('.kSSsk.', ['..kbk..', '..kbk..']),
    plFrame('ssSSsk.', ['.kbkbk.', 'kb...bk'], 'kccccd.'),
    plFrame('.kSSsk.', ['..kbbk.', '..kbk..']),
  ],
  jump: [plFrame('ssSSsk.', ['.kbbbk.', '.......'])],
  fall: [plFrame('.kSSsk.', ['.kb.bk.', '.b...b.'], 'kcccccd')],
};
const SPR = {};
SPR.hexer = [
  spr(['..kkk..', '.kQQPk.', 'kQPPPpk', 'kPmmmpk', 'kPmkekk', 'kPmmmpk', '.kgPgk.', 'kQPPPpk', 'kQPgPpk', 'kQPPPpk', 'kPPPppk', '.kk.kk.'],
    { k: '#140a18', Q: '#8a4a9a', P: '#5a2a6a', p: '#3a1a48', m: '#e0d4b4', e: '#ff60ff', g: '#c9a14a' }, 'e'),
  spr(['..kkk..', '.kQQPk.', 'kQPPPpk', 'kPmmmpk', 'kPmkekk', 'kPmmmpk', '.kgPgk.', 'kQPPPpk', 'kQPgPpk', 'kQPPPpk', 'kPPPppk', '..kkk..'],
    { k: '#140a18', Q: '#8a4a9a', P: '#5a2a6a', p: '#3a1a48', m: '#e0d4b4', e: '#ff60ff', g: '#c9a14a' }, 'e'),
];
const TUSK_PAL = { k: '#1a0e0a', r: '#8a4020', R: '#b86030', b: '#5a2a14', w: '#f0e8d0', e: '#ff4020', h: '#d09050' };
SPR.tusker = [
  spr(['...kkkkk....', '.kkhRRRhkk..', 'krRRRrrRRrk.', 'krrrrrrrRrek', 'kbrrrrrrrrwk', 'kbbrrrrrrbwk', '.kbk..kbk.k.', '.kk....kk...'], TUSK_PAL, 'e'),
  spr(['...kkkkk....', '.kkhRRRhkk..', 'krRRRrrRRrk.', 'krrrrrrrRrek', 'kbrrrrrrrrwk', 'kbbrrrrrrbwk', '..kbkkbk..k.', '..kk..kk....'], TUSK_PAL, 'e'),
];
const BAT_PAL = { k: '#120a10', B: '#5a3a4a', b: '#3a2430', w: '#7a5a6a', e: '#ffd040' };
SPR.bat = [
  spr(['kb.......bk', 'wkbb.k.bbkw', '.wkbBBBbkw.', '...kebek...', '....kBk....', '....k.k....'], BAT_PAL, 'e'),
  spr(['....kkk....', '...kBBBk...', '.kbkebekbk.', 'kbbbkBkbbbk', 'kw..kBk..wk', 'k.........k'], BAT_PAL, 'e'),
];
const BLOAT_PAL = { k: '#16100c', G: '#5a5048', g: '#3e3630', L: '#7a7064', r: '#a04030', e: '#fff0a0', f: '#ffcf40' };
SPR.bloat = [
  spr(['....f....', '....k....', '..kkkkk..', '.kLLGGgk.', 'kLLGrGGgk', 'kLGGrGegk', 'kGGGrGGgk', '.kgGGGgk.', '.k.k.k.k.'], BLOAT_PAL, 'fe'),
  spr(['.........', '....f....', '..kkkkk..', '.kLLGGgk.', 'kLLGrGGgk', 'kLGGrGegk', 'kGGGrGGgk', '.kgGGGgk.', 'k.k.k.k..'], BLOAT_PAL, 'fe'),
];
const SPORE_PAL = { k: '#160a12', M: '#a8386a', m: '#6a2040', W: '#ffd8ec', s: '#dccbb0', S: '#a89880', e: '#b0ff60' };
SPR.spore = [
  spr(['...kkkk...', '.kkMWMMkk.', 'kMMMMMWMMk', 'kMWMMMMMmk', 'kmmmmmmmmk', '.kkkkkkkk.', '..kseSek..', '..ksssSk..', '..ksssSk..', '.kkssSSkk.'], SPORE_PAL, 'eW'),
  spr(['..........', '..kkkkkk..', '.kMWMMWMk.', 'kMMMMMMMmk', 'kmmmmmmmmk', '.kkkkkkkk.', '..kseSek..', '..ksssSk..', '..ksssSk..', '.kkssSSkk.'], SPORE_PAL, 'eW'),
];
const BLOB_PAL = { k: '#2a0e08', O: '#ff8a20', o: '#c04a10', Y: '#ffe080' };
SPR.blob = [
  spr(['...kkkk...', '.kkoOOokk.', 'koOYOOOOok', 'koOOkOkOok', 'koOOOOOOok', 'kooOOOOook', '.kkkkkkkk.'], BLOB_PAL, 'OY'),
  spr(['..........', '..kkkkkk..', '.koOYOOok.', 'koOOkOkOok', 'koOOOOOOok', 'kooOOOOook', 'kkkkkkkkkk'], BLOB_PAL, 'OY'),
];
const WR_PAL = { k: '#203050', W: '#d0ecff', w: '#8ab8e0', b: '#4a70a0', e: '#ffffff' };
SPR.wraith = [
  spr(['..kkkk..', '.kWWWwk.', 'kWWwwwbk', 'kWeWWebk', 'kWWwwwbk', 'kwWkkwbk', '.kWwwbk.', 'kWWwwbbk', 'kWwwbbk.', '.kwwbk..', '..kwbk..', '...kb...'], WR_PAL, 'e'),
  spr(['..kkkk..', '.kWWWwk.', 'kWWwwwbk', 'kWeWWebk', 'kWWwwwbk', 'kwWkkwbk', '.kWwwbk.', 'kWWwwbbk', '.kWwbbk.', '..kwwbk.', '..kwbk..', '..kb....'], WR_PAL, 'e'),
];
const WD_PAL = { k: '#1a1010', M: '#6a6470', m: '#4a4450', L: '#9a94a0', O: '#ff8a20', Y: '#ffe080', r: '#8a3018', e: '#ffd040' };
SPR.warden = [spr([
  '........kkkkkk........',
  '......kkLLLLLLkk......',
  '.....kLLMMMMMMmmk.....',
  '....kLMMMMMMMMMmmk....',
  '....kLMkkkkkkkkMmk....',
  '....kLMkeYkkYekMmk....',
  '....kLMkkkkkkkkMmk....',
  '.....kMMMrrrrMMmk.....',
  '..kkk.kmmmmmmmmk.kkk..',
  '.kLLMkkLMMMMMMmkkMMmk.',
  'kLMMMkLMOOOOOOMmkMMmmk',
  'kLMmmkLOOYYYYOOmkmMmmk',
  'kLMmmkLOYYYYYYOmkmMmmk',
  'kLMmmkLOOYYYYOOmkmMmmk',
  '.kMmkkLMOOOOOOMmkkmmk.',
  '.kkkk.kLMMMMMMmmk.kkkk',
  '.kOk..kLMrMMrMmk..kOk.',
  '.kYk..kmMMMMMMmk..kYk.',
  '..k...kkmmmmmmkk...k..',
  '........kOYYOk........',
  '.........kOOk.........',
  '..........kk..........',
  '.........OYYO.........',
  '..........YY..........'], WD_PAL, 'OYe')];
SPR.chest = spr(['.kkkkkkkk.', 'kWWWWWWWWk', 'kGGGGGGGGk', 'kWwWglWwWk', 'kkkkgGkkkk', 'kWwWWWWwWk', 'kGWWWWWWGk', 'kkkkkkkkkk'],
  { k: '#1a1008', W: '#8a5a30', w: '#5a3820', G: '#e0b040', g: '#a07820', l: '#fff0a0' }, 'l');
SPR.potion = spr(['.kck.', '..G..', '.kGk.', 'kPPGk', 'kPPPk', 'kpPPk', '.kkk.'], { k: '#1a1418', G: '#a0d0e0', P: '#ff6fcb', p: '#c03f9f', c: '#8a6a40' }, 'P');
SPR.heart = spr(['.kk.kk.', 'kRWkRRk', 'kRRRRrk', '.kRRrk.', '..krk..', '...k...'], { k: '#2a0810', R: '#ff4060', r: '#b01830', W: '#ffc0c8' }, 'RWr');
SPR.altar = spr(['kkkkkkkkkkkkkkkk', 'kLLLLLLLLLLLLLLk', 'kSRSSRSSRSSRSSsk', 'kkkkkkkkkkkkkkkk', '..kSsk....kSsk..', '..kSsk....kSsk..', '.kLSssk..kLSssk.', 'kkkkkkkkkkkkkkkk'],
  { k: '#16121a', S: '#6a6070', s: '#4a4250', L: '#8a8090', R: '#60d0ff' }, 'R');
SPR.pedestal = spr(['kkkkkkkkkk', 'kLLLLLLLLk', '.kSSSSSsk.', '..kSSSsk..', '..kSSSsk..', '.kkkkkkkk.'], { k: '#16121a', S: '#7a6a58', s: '#54483c', L: '#c9a14a' });
SPR.die = spr(['kkkkkkk', 'kWWWWWk', 'kWpWpWk', 'kWWpWWk', 'kWpWpwk', 'kwwwwwk', 'kkkkkkk'], { k: '#1a1418', W: '#f0e8d8', w: '#b8b0a0', p: '#c03030' }, 'Wwp');
SPR.orb = spr(['...kkk...', '.kkOOOkk.', '.kOYYYOk.', 'kOYWWYYOk', 'kOYWYYYOk', 'kOYYYYOOk', '.kOYYOOk.', '.kkOOOkk.', '...kkk...'],
  { k: '#3a1008', O: '#ff8a20', Y: '#ffe080', W: '#ffffff' }, 'OYW');
SPR.torch = spr(['kmk', 'kWk', '.W.', '.W.', '.W.', 'kmk'], { k: '#141014', W: '#6a4a2a', m: '#707078' });

// ---------------------------------------------------------------- icons (spells & perks), 10x10
const ICON_SHAPES = {
  star:   ['...a....', '...a....', '..aba...', 'aabbbaa.', '..aba...', '...a....', '...a....'],
  orb:    ['..aaaa..', '.abbaaa.', 'abbaaaac', 'abaaaaac', 'aaaaaaac', 'aaaaaacc', '.aaaacc.', '..cccc..'],
  bolt:   ['.......b', '......ba', '.....ba.', '...aba..', '..aba...', '.aba....', 'aa......', 'a.......'],
  bounce: ['......bb', '......bb', '.....a..', 'a...a...', '.a.a....', '..a.....'],
  shard:  ['......ab', '.....abb', '....abb.', '...abb..', '..abb...', '.aab....', 'aaa.....', 'aa......'],
  bomb:   ['......b.', '.....c.b', '....c...', '..cccc..', '.cbaacc.', '.caaacc.', '.caaacc.', '..cccc..'],
  drill:  ['bb......', 'bab.....', '.aab....', '..aab...', '...aab..', '....aac.', '.....cc.'],
  lance:  ['....bba.', '...bba..', '..bba...', '.bbbbba.', '....bba.', '...bba..', '..bba...', '.ba.....'],
  saw:    ['..a.a...', '.aaaaa..', 'aaabaaa.', '.abcba..', 'aaabaaa.', '.aaaaa..', '..a.a...'],
  drop:   ['...a....', '...a....', '..aaa...', '.aabaa..', '.abaaa..', '.aaaac..', '..aac...'],
  wisp:   ['b..a..b.', '.b.a.b..', '..bbb...', 'aabbbaa.', '..bbb...', '.b.a.b..', 'b..a..b.'],
  blink:  ['bb......', 'bb.a....', '....a...', '.....a..', '......bb', '......bb'],
  flame:  ['...b....', '..ab....', '..abb.a.', '.abbba..', '.abbbba.', 'aabbbbaa', '.aabbaa.', '..aaaa..'],
  clock:  ['..cccc..', '.cbbbbc.', 'cbbabbbc', 'cbbabbbc', 'cbbaaabc', 'cbbbbbbc', '.cbbbbc.', '..cccc..'],
  ring:   ['..aaaa..', '.abbbba.', 'ab....ba', 'ab....ba', 'ab....ba', 'ab....ba', '.abbbba.', '..aaaa..'],
  eye:    ['..aaaa..', '.abbbba.', 'abbccbba', 'abbccbba', '.abbbba.', '..aaaa..'],
  chev:   ['aa..aa..', '.aa..aa.', '..bb..bb', '..bb..bb', '.aa..aa.', 'aa..aa..'],
  weight: ['...bb...', '..b..b..', '.aaaaaa.', '.abaaaa.', 'aabaaaaa', 'aaaaaaaa', 'aaaaaaac', '.cccccc.'],
  boom:   ['a..b..a.', '.a.b.a..', '..bbb...', 'bbbabbb.', '..bbb...', '.a.b.a..', 'a..b..a.'],
  cross:  ['...a....', '...a....', '..bbb...', 'aab.baa.', '..bbb...', '...a....', '...a....'],
  focus:  ['a......a', '.a....a.', '........', '...bb...', '...bb...', '........', '.a....a.', 'a......a'],
  n2:     ['...a....', 'aaaba...', '...a....', '........', '....a...', '.aaaba..', '....a...'],
  n3:     ['...a....', 'aaaba...', '...a....', '....a...', '.aaaba..', '....a...', '...a....', 'aaaba...'],
  fan:    ['......a.', '....aa..', '..aa....', 'bbbbbbba', '..aa....', '....aa..', '......a.'],
  fan4:   ['a.....a.', '.a...a..', '..a.a...', 'bbbbbbba', '..a.a...', '.a...a..', 'a.....a.'],
  heart:  ['.aa.aa..', 'abbaaaa.', 'abaaaaa.', 'aaaaaac.', '.aaaac..', '..aac...', '...c....'],
  wave:   ['.aa...aa', 'abba.abb', 'a..aaa..', '........', '.bb...bb', 'b..bbb..'],
  wing:   ['a.......', 'aa......', 'aba.....', 'abba....', 'abbba...', '.abbba..', '..abbba.', '...aaaa.'],
};
const iconCache = new Map();
function iconSprite(icon) {
  const key = icon.join('|');
  if (iconCache.has(key)) return iconCache.get(key);
  const shape = ICON_SHAPES[icon[0]] || ICON_SHAPES.star;
  const c1 = hexRGB(icon[1]), c2 = hexRGB(icon[2]), c3 = hexRGB(icon[3] || '#ffffff');
  const bg = pack(...mixc(c1, [12, 10, 16], 0.72)), bd = pack(...mixc(c1, [255, 255, 255], 0.15));
  const w = 10, h = 10, px = new Uint32Array(w * h), em = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = (x === 0 || y === 0 || x === 9 || y === 9) ? bd : bg;
  const sw = Math.max(...shape.map(r => r.length)), sh = shape.length;
  let minx = 99, maxx = -1;
  for (const r of shape) for (let x = 0; x < r.length; x++) if (r[x] !== '.') { minx = Math.min(minx, x); maxx = Math.max(maxx, x); }
  const ox = 1 + Math.floor((8 - (maxx - minx + 1)) / 2) - minx, oy = 1 + Math.floor((8 - sh) / 2);
  const cc = { a: pack(...c2), b: pack(...c3), c: pack(...mixc(c1, c2, 0.3)) };
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const ch = shape[y][x]; if (!ch || ch === '.') continue;
    const xx = x + ox, yy = y + oy; if (xx < 1 || yy < 1 || xx > 8 || yy > 8) continue;
    px[yy * w + xx] = cc[ch]; em[yy * w + xx] = ch === 'c' ? 0 : 1;
  }
  const s = { w, h, px, em, url: null };
  iconCache.set(key, s);
  return s;
}
function sprURL(s, scale = 1) {
  const c = document.createElement('canvas'); c.width = s.w * scale; c.height = s.h * scale;
  const x = c.getContext('2d'); const id = x.createImageData(s.w, s.h);
  new Uint32Array(id.data.buffer).set(s.px);
  if (scale === 1) x.putImageData(id, 0, 0);
  else { const t = document.createElement('canvas'); t.width = s.w; t.height = s.h; t.getContext('2d').putImageData(id, 0, 0); x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, c.width, c.height); }
  return c.toDataURL();
}
function iconURL(icon) { const s = iconSprite(icon); if (!s.url) s.url = sprURL(s); return s.url; }
const spellIconURL = (id) => iconURL(SP[id].icon);
const perkIconURL = (k) => iconURL(PERKS[k].icon);
const wandURLCache = new Map();
function wandSprite(w) {
  const L = w.look, key = L.handle + L.gem + L.len;
  if (wandURLCache.has(key)) return wandURLCache.get(key);
  const len = L.len + 3, h = 7;
  const px = new Uint32Array(len * h), em = new Uint8Array(len * h);
  const hc = hexRGB(L.handle), gc = hexRGB(L.gem);
  for (let x = 0; x < len - 3; x++) {
    const y = 4 - Math.round(x * 0.2);
    px[y * len + x] = pack(...scalec(hc, x < 3 ? 0.7 : 1.1));
    px[(y + 1) * len + x] = pack(...scalec(hc, 0.6));
  }
  const gx = len - 3, gy = 4 - Math.round(gx * 0.2) - 1;
  const put = (x, y, c, e) => { if (x >= 0 && y >= 0 && x < len && y < h) { px[y * len + x] = pack(...c); em[y * len + x] = e; } };
  put(gx, gy + 1, [200, 170, 80], 0); put(gx, gy + 2, [200, 170, 80], 0);
  put(gx + 1, gy, gc, 1); put(gx + 1, gy + 1, gc, 1); put(gx + 2, gy, mixc(gc, [255, 255, 255], 0.5), 1); put(gx + 1, gy - 1, mixc(gc, [255, 255, 255], 0.3), 1); put(gx + 2, gy + 1, scalec(gc, 0.7), 1);
  const s = { w: len, h, px, em, url: null };
  s.url = sprURL(s, 1);
  wandURLCache.set(key, s);
  return s;
}

// ---------------------------------------------------------------- rendering
let cv, g, fxc, fx, imgData, buf, emData, ebuf, emCv, emX, lightCv, lx, bloomA, bloomAX, bloomB, bloomBX, vigCv;
let egA, egAX, egAData, egABuf, egB, egBX, egBData, egBBuf;
const EM = 16;
const EGW = (VW + EM * 2) >> 2, EGH = (VH + EM * 2) >> 2;
const eR = new Float32Array(EGW * EGH), eG = new Float32Array(EGW * EGH), eB = new Float32Array(EGW * EGH);
const bR = new Float32Array(EGW * EGH), bG = new Float32Array(EGW * EGH), bB = new Float32Array(EGW * EGH), eTmp = new Float32Array(EGW * EGH);
let rcx = 0, rcy = 0, shX = 0, shY = 0;
let viewScale = 2, viewOX = 0, viewOY = 0, dpr = 1;
let hurtFlashT = 0, dmgAccum = 0, deathT = 0;
const lights = [];
const PALD = new Uint32Array(NM * 8);
for (let k = 0; k < NM * 8; k++) PALD[k] = pack(PR[k] * 0.62, PG[k] * 0.62, PB[k] * 0.66);
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function initRender() {
  cv = document.getElementById('game'); cv.width = VW; cv.height = VH;
  g = cv.getContext('2d', { alpha: false });
  fxc = document.getElementById('fx'); fx = fxc.getContext('2d');
  imgData = g.createImageData(VW, VH); buf = new Uint32Array(imgData.data.buffer);
  emCv = mkCanvas(VW, VH); emX = emCv.getContext('2d'); emData = emX.createImageData(VW, VH); ebuf = new Uint32Array(emData.data.buffer);
  lightCv = mkCanvas(VW, VH); lx = lightCv.getContext('2d');
  bloomA = mkCanvas(VW >> 2, VH >> 2); bloomAX = bloomA.getContext('2d');
  bloomB = mkCanvas(VW >> 3, VH >> 3); bloomBX = bloomB.getContext('2d');
  egA = mkCanvas(EGW, EGH); egAX = egA.getContext('2d'); egAData = egAX.createImageData(EGW, EGH); egABuf = new Uint32Array(egAData.data.buffer);
  egB = mkCanvas(EGW, EGH); egBX = egB.getContext('2d'); egBData = egBX.createImageData(EGW, EGH); egBBuf = new Uint32Array(egBData.data.buffer);
  vigCv = mkCanvas(VW, VH);
  const vx = vigCv.getContext('2d');
  const gr = vx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VW * 0.62);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.62)');
  vx.fillStyle = gr; vx.fillRect(0, 0, VW, VH);
  onResize();
  window.addEventListener('resize', onResize);
}
function onResize() {
  const ww = window.innerWidth, wh = window.innerHeight;
  let s = Math.min(ww / VW, wh / VH);
  if (s >= 2) s = Math.floor(s * 2) / 2;
  viewScale = s;
  cv.style.width = Math.round(VW * s) + 'px'; cv.style.height = Math.round(VH * s) + 'px';
  viewOX = Math.round((ww - VW * s) / 2); viewOY = Math.round((wh - VH * s) / 2);
  cv.style.left = viewOX + 'px'; cv.style.top = viewOY + 'px';
  dpr = Math.min(2, window.devicePixelRatio || 1);
  fxc.width = Math.round(ww * dpr); fxc.height = Math.round(wh * dpr);
  fxc.style.width = ww + 'px'; fxc.style.height = wh + 'px';
  document.documentElement.style.setProperty('--vs', s);
}
const lightSprCache = new Map();
function lightSprite(c) {
  const r = clamp(c[0] | 0, 0, 255) >> 4, gg = clamp(c[1] | 0, 0, 255) >> 4, b = clamp(c[2] | 0, 0, 255) >> 4;
  const key = (r << 8) | (gg << 4) | b;
  let s = lightSprCache.get(key); if (s) return s;
  s = mkCanvas(64, 64);
  const x = s.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  const col = `${r * 17},${gg * 17},${b * 17}`;
  gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(0.2, `rgba(${col},0.75)`); gr.addColorStop(0.5, `rgba(${col},0.3)`); gr.addColorStop(0.78, `rgba(${col},0.08)`); gr.addColorStop(1, `rgba(${col},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  lightSprCache.set(key, s); return s;
}
function addLight(x, y, r, c, a = 1) {
  if (x + r < rcx || x - r > rcx + VW || y + r < rcy || y - r > rcy + VH || lights.length > 260) return;
  lights.push({ x, y, r, c, a });
}
function blendc(d, s, a) {
  const ia = 1 - a;
  const r = (d & 255) * ia + (s & 255) * a, gg = ((d >> 8) & 255) * ia + ((s >> 8) & 255) * a, b = ((d >>> 16) & 255) * ia + ((s >>> 16) & 255) * a;
  return (0xff000000 | (b << 16) | (gg << 8) | r) >>> 0;
}
const withA = (c, a) => ((c & 0xffffff) | ((a & 255) << 24)) >>> 0;
function emitAdd(sx, sy, r, gg, b) {
  const gx = (sx + EM) >> 2, gy = (sy + EM) >> 2;
  if (gx < 0 || gy < 0 || gx >= EGW || gy >= EGH) return;
  const gi = gy * EGW + gx; eR[gi] += r; eG[gi] += gg; eB[gi] += b;
}
function renderWorld() {
  const cx = rcx, cy = rcy, fn = frameNo;
  ebuf.fill(0); eR.fill(0); eG.fill(0); eB.fill(0);
  const bgx0 = Math.floor(cx * 0.55), bgy0 = Math.floor(cy * 0.55);
  const lavaT1 = fn >> 2, lavaT2 = fn >> 3;
  for (let sy = 0; sy < VH; sy++) {
    const wy = cy + sy;
    let o = sy * VW;
    const reg = REG[regionOf[wy]], bgp = reg.bgp, bgc = reg.bgc;
    const bgRow = ((bgy0 + sy) & 255) << 8;
    const gRow = ((sy + EM) >> 2) * EGW;
    let i = wy * W + cx;
    for (let sx = 0; sx < VW; sx++, i++, o++) {
      const m = mat[i];
      if (m === 0) { buf[o] = bgp[BGT[bgRow | ((bgx0 + sx) & 255)]]; continue; }
      const t = mT[m];
      if (t === T_SOLID) {
        if (life[i] && mFuel[m]) {
          const c = EMBERCOL[((i * 7 + (fn >> 2)) & 3)]; buf[o] = c; ebuf[o] = c;
          const gi = gRow + ((sx + EM) >> 2); eR[gi] += 0.9; eG[gi] += 0.42; eB[gi] += 0.1;
          continue;
        }
        let c;
        if (!mNoEdge[m] && mOpen[mat[i - W]]) c = PTOP[m];
        else if (!mNoEdge[m] && (mOpen[mat[i - 1]] || mOpen[mat[i + 1]] || mOpen[mat[i + W]])) c = PEDGE[m];
        else c = (mOpen[mat[i - 3 * W]] || mOpen[mat[i + 3 * W]] || mOpen[mat[i - 3]] || mOpen[mat[i + 3]]) ? PAL[m * 8 + (shade[i] & 7)] : PALD[m * 8 + (shade[i] & 7)];
        buf[o] = c;
        if (mEmitOn[m]) {
          const sh = shade[i] & 7;
          if (sh >= 6) { ebuf[o] = withA(c, 170); const gi = gRow + ((sx + EM) >> 2); eR[gi] += mER[m]; eG[gi] += mEG[m]; eB[gi] += mEB[m]; }
        } else if (m === MGOLD && (shade[i] & 7) >= 6) {
          const tw = ((i * 13 + (fn >> 3)) % 97) === 0;
          ebuf[o] = tw ? 0xffffffff : withA(c, 110);
          if (tw) { const gi = gRow + ((sx + EM) >> 2); eR[gi] += 0.5; eG[gi] += 0.45; eB[gi] += 0.2; }
        }
        continue;
      }
      if (t === T_POWDER) {
        if (life[i] && mFuel[m]) { const c = EMBERCOL[((i * 5 + (fn >> 2)) & 3)]; buf[o] = c; ebuf[o] = c; const gi = gRow + ((sx + EM) >> 2); eR[gi] += 0.9; eG[gi] += 0.42; eB[gi] += 0.1; continue; }
        const up = mat[i - W];
        buf[o] = (mOpen[up] && mT[up] !== T_LIQUID) ? PTOP[m] : PAL[m * 8 + (shade[i] & 7)];
        continue;
      }
      if (t === T_LIQUID) {
        if (life[i] && mFuel[m]) { const c = FIRECOL[2 + ((i + fn) & 3)]; buf[o] = c; ebuf[o] = c; const gi = gRow + ((sx + EM) >> 2); eR[gi] += 1; eG[gi] += 0.5; eB[gi] += 0.12; continue; }
        const up = mat[i - W];
        let r, gg, b;
        if (m === MLAVA) {
          const wx = cx + sx;
          const k = m * 8 + (TEX[(((wy + lavaT1) & 511) << 9) | ((wx + lavaT2) & 511)] & 7);
          if (up !== m && mT[up] !== T_SOLID) { r = TOPR[m]; gg = TOPG[m]; b = TOPB[m]; } else { r = PR[k]; gg = PG[k]; b = PB[k]; }
          const c = (0xff000000 | (b << 16) | (gg << 8) | r) >>> 0;
          buf[o] = c; ebuf[o] = c;
          const gi = gRow + ((sx + EM) >> 2); eR[gi] += 1; eG[gi] += 0.46; eB[gi] += 0.1;
          continue;
        }
        if (mT[up] !== T_LIQUID && mT[up] !== T_SOLID && mT[up] !== T_POWDER) { r = TOPR[m]; gg = TOPG[m]; b = TOPB[m]; }
        else { const k = m * 8 + ((shade[i] + ((((cx + sx) >> 2) + (wy >> 1) + (fn >> 4)) & 1)) & 7); r = PR[k]; gg = PG[k]; b = PB[k]; }
        const a = mAlpha[m];
        if (a < 1) { const bc = bgc[BGT[bgRow | ((bgx0 + sx) & 255)]]; const ia = 1 - a; r = r * a + bc[0] * ia; gg = gg * a + bc[1] * ia; b = b * a + bc[2] * ia; }
        const c = (0xff000000 | (b << 16) | (gg << 8) | r) >>> 0;
        buf[o] = c;
        if (mEmitOn[m]) { ebuf[o] = withA(c, 70); const gi = gRow + ((sx + EM) >> 2); eR[gi] += mER[m]; eG[gi] += mEG[m]; eB[gi] += mEB[m]; }
        continue;
      }
      if (t === T_GAS) {
        const k = m * 8 + (shade[i] & 7);
        const a = mAlpha[m] * Math.min(1, life[i] / 50);
        const bc = bgc[BGT[bgRow | ((bgx0 + sx) & 255)]], ia = 1 - a;
        const r = PR[k] * a + bc[0] * ia, gg = PG[k] * a + bc[1] * ia, b = PB[k] * a + bc[2] * ia;
        buf[o] = (0xff000000 | (b << 16) | (gg << 8) | r) >>> 0;
        if (mDmg[m] > 0) { ebuf[o] = withA(buf[o], 40); const gi = gRow + ((sx + EM) >> 2); eR[gi] += 0.03; eG[gi] += 0.1; eB[gi] += 0.01; }
        continue;
      }
      // fire
      const lf = life[i];
      let idx = 7 - (lf >> 2) + (((i * 2654435761 + fn * 40503) >>> 13) & 1);
      idx = idx < 0 ? 0 : idx > 7 ? 7 : idx;
      const c = FIRECOL[idx];
      buf[o] = c; ebuf[o] = c;
      const gi = gRow + ((sx + EM) >> 2); eR[gi] += 1; eG[gi] += 0.55; eB[gi] += 0.15;
    }
  }
  // light sources just outside the view
  for (let sy = -EM; sy < VH + EM; sy++) {
    const wy = cy + sy; if (wy < 0 || wy >= H) continue;
    const inner = sy >= 0 && sy < VH;
    for (let sx = -EM; sx < VW + EM; sx++) {
      if (inner && sx === 0) { sx = VW - 1; continue; }
      const wx = cx + sx; if (wx < 0 || wx >= W) continue;
      const i = wy * W + wx, m = mat[i];
      if (!m) continue;
      if (mEmitOn[m] && (mT[m] !== T_SOLID || (shade[i] & 7) >= 6)) emitAdd(sx, sy, mER[m], mEG[m], mEB[m]);
      else if (life[i] && mFuel[m]) emitAdd(sx, sy, 0.9, 0.42, 0.1);
    }
  }
}
function putPix(wx, wy, c, em) {
  const sx = Math.round(wx - rcx), sy = Math.round(wy - rcy);
  if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) return;
  const o = sy * VW + sx; buf[o] = c;
  if (em) ebuf[o] = em === 1 ? c : withA(c, em);
}
function blit(s, x, y, flip, white, alpha = 1) {
  const sx0 = Math.round(x - rcx), sy0 = Math.round(y - rcy);
  const w = s.w, h = s.h, px = s.px, em = s.em;
  if (sx0 + w < 0 || sy0 + h < 0 || sx0 >= VW || sy0 >= VH) return;
  for (let yy = 0; yy < h; yy++) {
    const sy = sy0 + yy; if (sy < 0 || sy >= VH) continue;
    for (let xx = 0; xx < w; xx++) {
      const sx = sx0 + xx; if (sx < 0 || sx >= VW) continue;
      const k = yy * w + (flip ? w - 1 - xx : xx);
      let c = px[k]; if (!c) continue;
      const o = sy * VW + sx;
      if (white) { buf[o] = 0xffffffff; ebuf[o] = 0xffffffff; continue; }
      if (alpha < 1) c = blendc(buf[o], c, alpha);
      buf[o] = c;
      if (em[k]) ebuf[o] = alpha < 1 ? withA(c, alpha * 255) : c;
    }
  }
}
function disc(x, y, r, c, cl, cd, em) {
  const r2 = r * r, ri_ = Math.ceil(r);
  for (let dy = -ri_; dy <= ri_; dy++) for (let dx = -ri_; dx <= ri_; dx++) {
    const d2 = dx * dx + dy * dy; if (d2 > r2) continue;
    let col = c;
    if (d2 > (r - 1.1) * (r - 1.1)) col = cd; else if (dx + dy < -r * 0.5) col = cl;
    putPix(x + dx, y + dy, col, em);
  }
}
function drawTorches() {
  const fn = frameNo;
  for (const t of torches) {
    if (t.x < rcx - 90 || t.x > rcx + VW + 90 || t.y < rcy - 90 || t.y > rcy + VH + 90) continue;
    blit(SPR.torch, t.x - 1, t.y, false, false);
    const fl = Math.sin(fn * 0.21 + t.ph * 3) * 0.5 + Math.sin(fn * 0.53 + t.ph) * 0.3;
    putPix(t.x, t.y - 1, FIRECOL[1], 1); putPix(t.x, t.y - 2, FIRECOL[2 + ((fn >> 2) & 1)], 1);
    putPix(t.x + (fl > 0 ? 1 : -1), t.y - 2, FIRECOL[4], 1); putPix(t.x, t.y - 3 - ((fn >> 3) & 1), FIRECOL[4 + ((fn >> 2) & 1)], 1);
    if (fr() < 0.08) addP(t.x + frr(-1, 1), t.y - 3, frr(-6, 6), frr(-30, -12), 14, fpick(EMBERCOL), PF_GLOW | PF_RISE);
    addLight(t.x, t.y - 2, 86 + fl * 6, [255, 150, 70], 0.95);
  }
}
function drawPickups() {
  const fn = frameNo;
  for (const q of pickups) {
    if (q.dead || q.x < rcx - 30 || q.x > rcx + VW + 30 || q.y < rcy - 30 || q.y > rcy + VH + 30) continue;
    const bob = Math.sin((q.t + q.x) / 18);
    switch (q.kind) {
      case 'gold': {
        const tw = ((q.t + (q.x | 0)) % 50) < 3;
        putPix(q.x, q.y - 1, pack(230, 180, 40), 150); putPix(q.x + 1, q.y - 1, pack(170, 120, 20), 120); putPix(q.x, q.y - 2, tw ? 0xffffffff : pack(255, 230, 120), tw ? 1 : 170);
        break;
      }
      case 'potion': blit(SPR.potion, q.x - 2, q.y - 7, false, false); addLight(q.x, q.y - 4, 22, [255, 110, 200], 0.5); break;
      case 'heart': blit(SPR.heart, q.x - 3, q.y - 7 + bob, false, false); addLight(q.x, q.y - 4, 28, [255, 60, 90], 0.6); break;
      case 'chest': blit(SPR.chest, q.x - 5, q.y - 8, false, false); addLight(q.x, q.y - 4, 22, [255, 210, 110], 0.3); break;
      case 'wand': { const s = wandSprite(q.wand); blit(s, q.x - (s.w >> 1), q.y - 7 + (q.vy === 0 ? bob : 0), false, false); addLight(q.x, q.y - 4, 20, hexRGB(q.wand.look.gem), 0.5); break; }
      case 'spell': { const s = iconSprite(SP[q.id].icon); blit(s, q.x - 5, q.y - 12 + bob, false, false); addLight(q.x, q.y - 7, 20, hexRGB(SP[q.id].icon[2]), 0.45); break; }
      case 'perk': {
        blit(SPR.pedestal, q.x - 5, q.y - 6, false, false);
        const s = iconSprite(PERKS[q.perk].icon); blit(s, q.x - 5, q.y - 20 + bob * 1.5, false, false);
        if (fr() < 0.1) addP(q.x + frr(-5, 5), q.y - 15 + bob, 0, -12, 24, pack(255, 220, 120), PF_GLOW);
        addLight(q.x, q.y - 15, 38, [255, 210, 120], 0.7); break;
      }
      case 'reroll': blit(SPR.pedestal, q.x - 5, q.y - 6, false, false); blit(SPR.die, q.x - 3, q.y - 16 + bob, false, false); addLight(q.x, q.y - 12, 20, [255, 230, 210], 0.4); break;
      case 'shop': {
        blit(SPR.pedestal, q.x - 5, q.y - 6, false, false);
        if (q.item.kind === 'wand') { const s = wandSprite(q.item.wand); blit(s, q.x - (s.w >> 1), q.y - 14 + bob, false, false); }
        else blit(iconSprite(SP[q.item.id].icon), q.x - 5, q.y - 18 + bob, false, false);
        addLight(q.x, q.y - 12, 24, [255, 220, 150], 0.4);
        break;
      }
      case 'altar': blit(SPR.altar, q.x - 8, q.y - 8, false, false); addLight(q.x, q.y - 6, 34 + Math.sin(fn / 20) * 3, [90, 200, 255], 0.55); break;
      case 'orb': {
        blit(SPR.orb, q.x - 4, q.y - 14 + bob * 2, false, false);
        if (fr() < 0.4) addP(q.x + frr(-4, 4), q.y - 10 + bob * 2, frr(-10, 10), frr(-30, -5), 30, fpick(EMBERCOL), PF_GLOW | PF_RISE);
        addLight(q.x, q.y - 10, 140, [255, 160, 70], 1); addLight(q.x, q.y - 10, 30, [255, 255, 220], 0.8); break;
      }
    }
  }
}
const WORM_C = [pack(138, 106, 88), pack(184, 148, 120), pack(58, 36, 24), pack(106, 74, 58)];
function drawEnemies() {
  for (const e of enemies) {
    if (e.dead) continue;
    const cy = ecy(e);
    if (e.x < rcx - 40 || e.x > rcx + VW + 40 || cy < rcy - 40 || cy > rcy + VH + 40) continue;
    const white = e.flash > 0 && (e.flash & 2) !== 0;
    if (e.def.burrow) {
      for (let k = e.segs.length - 1; k >= 0; k--) { const s = e.segs[k]; const r = 3.8 - k * 0.2; disc(s.x, s.y, r, white ? 0xffffffff : (k & 1 ? WORM_C[3] : WORM_C[0]), WORM_C[1], WORM_C[2], white ? 1 : 0); }
      disc(e.x, e.y, 4.4, white ? 0xffffffff : WORM_C[0], WORM_C[1], WORM_C[2], white ? 1 : 0);
      const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
      putPix(e.x + ca * 2 - sa * 2, e.y + sa * 2 + ca * 2, pack(255, 80, 40), 1); putPix(e.x + ca * 2 + sa * 2, e.y + sa * 2 - ca * 2, pack(255, 80, 40), 1);
      const jaw = (frameNo >> 3) & 1;
      for (let k = 3; k < 6; k++) { putPix(e.x + ca * k - sa * (2 + jaw), e.y + sa * k + ca * (2 + jaw), pack(230, 220, 200), 0); putPix(e.x + ca * k + sa * (2 + jaw), e.y + sa * k - ca * (2 + jaw), pack(230, 220, 200), 0); }
      continue;
    }
    const frames = SPR[e.type];
    let f = 0;
    if (e.type === 'bat') f = (e.t >> 2) & 1;
    else if (e.type === 'blob') f = e.onGround ? 1 : 0;
    else if (e.type === 'spore') f = e.cd > 150 ? 1 : 0;
    else if (Math.abs(e.vx) > 4) f = (e.t >> 3) & 1;
    const s = frames[f % frames.length];
    let face = e.dir;
    if (e.type === 'wraith' || e.type === 'hexer' || e.type === 'spore' || e.type === 'warden') face = player.x < e.x ? -1 : 1;
    else if (Math.abs(e.vx) > 2) face = e.vx < 0 ? -1 : 1;
    const bob = e.type === 'wraith' ? Math.sin(e.t / 12) * 1.5 : 0;
    blit(s, e.x - (s.w >> 1), e.y - s.h + bob, face < 0, white, e.type === 'wraith' ? 0.8 : 1);
    switch (e.type) {
      case 'wraith': addLight(e.x, cy, 34, [150, 200, 255], 0.5); break;
      case 'blob': addLight(e.x, cy, 40, [255, 120, 40], 0.8); break;
      case 'warden': addLight(e.x, cy, 110, [255, 140, 60], 0.9); break;
      case 'hexer': if (e.state === 'cast') addLight(e.x, cy, 40, [230, 90, 255], 0.8); else addLight(e.x + face * 2, e.y - 8, 12, [255, 90, 255], 0.4); break;
      case 'spore': addLight(e.x, cy, 22, [200, 120, 180], 0.35); break;
      case 'bloat': if (e.state === 'fuse') addLight(e.x, cy, 36, [255, 200, 90], 0.9); break;
      default: break;
    }
  }
}
function drawPlayer() {
  const p = player; if (!p || p.dead) return;
  let s;
  if (!p.onGround && !(p.inLiquid > 0.35)) s = p.vy < 0 ? SPR_PLAYER.jump[0] : SPR_PLAYER.fall[0];
  else if (Math.abs(p.vx) > 5) s = SPR_PLAYER.walk[(p.anim | 0) & 3];
  else s = SPR_PLAYER.idle[(frameNo >> 5) & 1];
  const white = p.hurtT > 6 && (p.hurtT & 2);
  const ghost = p.iframes > 0 && ((frameNo >> 2) & 1);
  blit(s, p.x - 3, p.y - s.h, p.face < 0, white, ghost ? 0.45 : 1);
  // wand
  const w = curWand();
  if (w) {
    const hc = hexRGB(w.look.handle), gc = hexRGB(w.look.gem);
    const ca = Math.cos(p.aim), sa = Math.sin(p.aim);
    const kick = p.castT > 0 ? p.castT * 0.4 : 0;
    const ox = p.x + p.face - ca * kick, oy = p.y - 6 - sa * kick;
    const len = w.look.len;
    for (let t = 0; t <= len; t += 0.5) {
      const x = ox + ca * t, y = oy + sa * t;
      if (t >= len - 1) putPix(x, y, pack(...gc), 1);
      else putPix(x, y, pack(...scalec(hc, t < 2 ? 0.7 : 1.15)), 0);
    }
    const tip = { x: ox + ca * len, y: oy + sa * len };
    putPix(tip.x, tip.y, pack(...mixc(gc, [255, 255, 255], 0.6)), 1);
    addLight(tip.x, tip.y, p.castT > 0 ? 34 : 16, gc, p.castT > 0 ? 0.9 : 0.55);
  }
  addLight(p.x, p.y - 6, 50, [255, 228, 196], 0.36);
  if (p.burn > 0) addLight(p.x, p.y - 6, 50, [255, 140, 50], 0.8);
}
function drawProjectiles() {
  for (const p of projs) {
    if (p.dead) continue;
    if (p.x < rcx - 20 || p.x > rcx + VW + 20 || p.y < rcy - 20 || p.y > rcy + VH + 20) continue;
    const c = pack(...p.col), hi = pack(...mixc(p.col, [255, 255, 255], 0.6));
    const sp = p.s.p.sprite;
    if (sp === 'bomb') {
      disc(p.x, p.y, 1.6, pack(60, 50, 48), pack(110, 96, 88), pack(24, 20, 20), 0);
      putPix(p.x + 1, p.y - 2, (frameNo & 2) ? 0xffffffff : pack(255, 200, 60), 1);
      addLight(p.x, p.y - 2, 18 + (frameNo & 3), [255, 200, 90], 0.8);
      continue;
    }
    if (sp === 'saw') {
      const a = frameNo * 0.6;
      disc(p.x, p.y, 2.2, pack(170, 170, 180), pack(230, 230, 240), pack(80, 80, 90), 0);
      for (let k = 0; k < 4; k++) putPix(p.x + Math.cos(a + k * 1.57) * 3, p.y + Math.sin(a + k * 1.57) * 3, pack(230, 230, 240), 120);
      addLight(p.x, p.y, 12, [220, 220, 240], 0.3);
      continue;
    }
    if (sp === 'void') {
      disc(p.x, p.y, 3.4, pack(20, 6, 30), pack(40, 12, 60), hi, 0);
      for (let k = 0; k < 6; k++) { const a = frameNo * 0.15 + k * 1.047; putPix(p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 4, c, 1); }
      addLight(p.x, p.y, p.lr, p.col, 0.9);
      continue;
    }
    // streak from previous position
    const dx = p.x - p.px, dy = p.y - p.py, n = Math.min(10, Math.ceil(Math.hypot(dx, dy)));
    for (let k = 0; k < n; k++) { const f = k / n; putPix(p.px + dx * f, p.py + dy * f, c, (80 + f * 150) | 0); }
    putPix(p.x, p.y, hi, 1);
    if (p.size >= 2) { putPix(p.x + 1, p.y, c, 1); putPix(p.x - 1, p.y, c, 1); putPix(p.x, p.y + 1, c, 1); putPix(p.x, p.y - 1, c, 1); }
    if (p.size >= 3 || p.glow) { putPix(p.x + 1, p.y + 1, c, 200); putPix(p.x - 1, p.y - 1, c, 200); putPix(p.x + 1, p.y - 1, c, 200); putPix(p.x - 1, p.y + 1, c, 200); }
    addLight(p.x, p.y, p.lr, p.col, p.s.p.bright ? 1 : 0.85);
  }
}
function drawParticles() {
  const cx = rcx, cy = rcy;
  for (let k = 0; k < pN; k++) {
    const sx = (pX[k] - cx) | 0, sy = (pY[k] - cy) | 0;
    if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
    const o = sy * VW + sx, c = pCol[k];
    if (pFl[k] & PF_GLOW) {
      const f = pLife[k] / pMax[k], a = f > 0.5 ? 255 : (f * 510) | 0;
      buf[o] = c; ebuf[o] = withA(c, a);
      if ((k & 3) === 0) emitAdd(sx, sy, (c & 255) / 900 * f, ((c >> 8) & 255) / 900 * f, ((c >>> 16) & 255) / 900 * f);
    } else if (pFl[k] & PF_RISE) {
      const f = pLife[k] / pMax[k]; buf[o] = blendc(buf[o], c, Math.min(1, f * 1.2));
    } else buf[o] = c;
  }
}
function boxBlur(a, w, h, r) {
  const t = eTmp, inv = 1 / (r * 2 + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w; let s = 0;
    for (let x = -r; x <= r; x++) s += a[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { t[row + x] = s * inv; s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += t[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { a[y * w + x] = s * inv; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; }
  }
}
function gridToImage(rA, gA, bA, out, k) {
  for (let n = 0; n < out.length; n++) {
    const r = Math.min(255, rA[n] * k), gg = Math.min(255, gA[n] * k), b = Math.min(255, bA[n] * k);
    out[n] = (0xff000000 | (b << 16) | (gg << 8) | r) >>> 0;
  }
}
function ambientAt() {
  const r = regionAt(clamp(camY + VH / 2, 0, H - 1));
  let a = r.amb;
  if (r.kind === 'biome' && r.bi === 0 && camY < 60) a = mixc([46, 38, 34], a, clamp(camY / 60, 0, 1));
  return a;
}
function buildLight() {
  const a = ambientAt();
  lx.globalCompositeOperation = 'source-over'; lx.globalAlpha = 1;
  lx.fillStyle = `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`; lx.fillRect(0, 0, VW, VH);
  lx.globalCompositeOperation = 'lighter';
  // material glow: tight + wide
  bR.set(eR); bG.set(eG); bB.set(eB);
  boxBlur(eR, EGW, EGH, 1); boxBlur(eG, EGW, EGH, 1); boxBlur(eB, EGW, EGH, 1);
  gridToImage(eR, eG, eB, egABuf, 26);
  egAX.putImageData(egAData, 0, 0);
  boxBlur(bR, EGW, EGH, 3); boxBlur(bG, EGW, EGH, 3); boxBlur(bB, EGW, EGH, 3);
  boxBlur(bR, EGW, EGH, 3); boxBlur(bG, EGW, EGH, 3); boxBlur(bB, EGW, EGH, 3);
  gridToImage(bR, bG, bB, egBBuf, 60);
  egBX.putImageData(egBData, 0, 0);
  lx.imageSmoothingEnabled = true;
  lx.drawImage(egA, -EM, -EM, EGW * 4, EGH * 4);
  lx.drawImage(egB, -EM, -EM, EGW * 4, EGH * 4);
  for (const L of lights) {
    lx.globalAlpha = clamp(L.a, 0, 1);
    lx.drawImage(lightSprite(L.c), L.x - rcx - L.r, L.y - rcy - L.r, L.r * 2, L.r * 2);
  }
  lx.globalAlpha = 1;
}
function render() {
  const sh = shakeAmt;
  shX = sh > 0.3 ? Math.round((fr() - 0.5) * sh * 1.6) : 0; shY = sh > 0.3 ? Math.round((fr() - 0.5) * sh * 1.6) : 0;
  rcx = clamp((camX | 0) + shX, 0, W - VW); rcy = clamp((camY | 0) + shY, 0, H - VH);
  lights.length = 0;
  renderWorld();
  drawTorches(); drawPickups(); drawEnemies(); drawPlayer(); drawProjectiles(); drawParticles();
  for (const f of flashes) {
    const c = f.col[0] <= 1 && f.col[1] <= 1 && f.col[2] <= 1 ? f.col.map(v => v * 255) : f.col;
    addLight(f.x, f.y, f.r, c, f.t / f.max);
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.putImageData(imgData, 0, 0);
  buildLight();
  g.globalCompositeOperation = 'multiply'; g.drawImage(lightCv, 0, 0);
  emX.putImageData(emData, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.drawImage(emCv, 0, 0);
  // bloom
  bloomAX.globalCompositeOperation = 'copy'; bloomAX.imageSmoothingEnabled = true; bloomAX.drawImage(emCv, 0, 0, VW >> 2, VH >> 2);
  bloomBX.globalCompositeOperation = 'copy'; bloomBX.imageSmoothingEnabled = true; bloomBX.drawImage(bloomA, 0, 0, VW >> 3, VH >> 3);
  g.imageSmoothingEnabled = true;
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.5; g.drawImage(bloomA, 0, 0, VW, VH);
  g.globalAlpha = 0.6; g.drawImage(bloomB, 0, 0, VW, VH);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.drawImage(vigCv, 0, 0);
  if (hurtFlashT > 0) { g.fillStyle = `rgba(220,20,20,${hurtFlashT / 8 * 0.22})`; g.fillRect(0, 0, VW, VH); }
  if (player && !player.dead && player.hp < player.maxHp * 0.3) {
    const a = (Math.sin(frameNo * 0.12) * 0.5 + 0.5) * 0.25;
    const gr = g.createRadialGradient(VW / 2, VH / 2, VH * 0.3, VW / 2, VH / 2, VW * 0.6);
    gr.addColorStop(0, 'rgba(150,0,0,0)'); gr.addColorStop(1, `rgba(150,0,0,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
  }
  // enemy health bars
  for (const e of enemies) {
    if (e.dead || e.boss || e.hp >= e.maxHp || !e.active) continue;
    const x = Math.round(e.x - rcx - 6), y = Math.round((e.def.burrow ? e.y - 8 : e.y - e.h - 4) - rcy);
    g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x - 1, y - 1, 14, 3);
    g.fillStyle = '#d83a3a'; g.fillRect(x, y, Math.max(1, Math.round(12 * e.hp / e.maxHp)), 1);
  }
  // crosshair
  if (state === 'play' && player && !player.dead && !touchMode) {
    const a = aimWorld(); const x = Math.round(a.x - rcx), y = Math.round(a.y - rcy);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(x - 3, y, 2, 1); g.fillRect(x + 2, y, 2, 1); g.fillRect(x, y - 3, 1, 2); g.fillRect(x, y + 2, 1, 2);
  }
  drawFx();
}
function drawFx() {
  const s = viewScale * dpr;
  fx.setTransform(1, 0, 0, 1, 0, 0);
  fx.clearRect(0, 0, fxc.width, fxc.height);
  fx.textAlign = 'center'; fx.textBaseline = 'middle'; fx.lineJoin = 'round';
  const toX = (x) => (viewOX + (x - rcx) * viewScale) * dpr, toY = (y) => (viewOY + (y - rcy) * viewScale) * dpr;
  for (const f of floaters) {
    const a = Math.min(1, f.t / 20);
    const size = Math.round((f.big ? 15 : 11) * dpr * Math.max(1, viewScale / 3));
    fx.font = `bold ${size}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
    fx.globalAlpha = a;
    fx.lineWidth = 3 * dpr; fx.strokeStyle = 'rgba(0,0,0,0.85)';
    fx.strokeText(f.txt, toX(f.x), toY(f.y)); fx.fillStyle = f.col; fx.fillText(f.txt, toX(f.x), toY(f.y));
  }
  fx.globalAlpha = 1;
  const fs = Math.round(10 * dpr * Math.max(1, viewScale / 3));
  fx.font = `bold ${fs}px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif`;
  for (const q of pickups) {
    if (q.dead || q.kind !== 'shop') continue;
    if (q.x < rcx - 20 || q.x > rcx + VW + 20 || q.y < rcy - 20 || q.y > rcy + VH + 20) continue;
    const ok = player && player.gold >= q.price;
    fx.lineWidth = 3 * dpr; fx.strokeStyle = 'rgba(0,0,0,0.9)';
    fx.strokeText(q.price + ' 金', toX(q.x), toY(q.y + 4)); fx.fillStyle = ok ? '#ffd84a' : '#a08870'; fx.fillText(q.price + ' 金', toX(q.x), toY(q.y + 4));
  }
  void s;
}

// ---------------------------------------------------------------- input
const $ = (id) => document.getElementById(id);
const ui = { interact: null, castHint: 0, dirty: true, moved: 0, sig: '', edSel: null, drag: null, hintT: 0 };
const keys = new Set(), presses = new Set();
const KEYMAP = {
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyW: 'jump', ArrowUp: 'jump', Space: 'jump',
  KeyS: 'down', ArrowDown: 'down', KeyE: 'interact', KeyF: 'interact', KeyQ: 'potion', KeyH: 'potion',
  Digit1: 'w0', Digit2: 'w1', Digit3: 'w2', Digit4: 'w3',
};
let mouseX = VW / 2 + 40, mouseY = VH / 2, mouseDown = false, touchMode = false, wandStep = 0;
const touch = { moveId: null, mx0: 0, my0: 0, mdx: 0, mdy: 0, aimId: null, ax0: 0, ay0: 0, aimOn: false, aimAng: 0, jumpBtn: false, upLatch: false };
const keyDown = (a) => keys.has(a);
function consumePress(a) {
  if (a === 'wandNext') {
    if (!wandStep || !player || !player.wands.length) { wandStep = 0; return 0; }
    const n = player.wands.length, s = ((wandStep % n) + n) % n; wandStep = 0; return s;
  }
  if (presses.has(a)) { presses.delete(a); return true; }
  return false;
}
const fireHeld = () => mouseDown || touch.aimOn || keys.has('fire');
function touchMoveX() { if (touch.moveId === null) return 0; const v = touch.mdx / 36; return Math.abs(v) < 0.22 ? 0 : clamp(v, -1, 1); }
const touchJumpHeld = () => touch.jumpBtn || (touch.moveId !== null && touch.mdy < -26);
function aimWorld() {
  if (touchMode && player) return { x: player.x + Math.cos(touch.aimAng) * 60, y: player.y - 7 + Math.sin(touch.aimAng) * 60 };
  return { x: camX + mouseX, y: camY + mouseY };
}
function inputReset() { keys.clear(); presses.clear(); mouseDown = false; touch.aimOn = false; touch.jumpBtn = false; touch.moveId = null; touch.aimId = null; hideSticks(); }
function initInput() {
  window.addEventListener('keydown', (e) => {
    initAudio();
    const a = KEYMAP[e.code];
    if (e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault(); if (state === 'play') openEditor(); else if (state === 'editor') closeEditor(); return; }
    if (e.code === 'Escape') { e.preventDefault(); if (state === 'editor') closeEditor(); else if (state === 'play') setPause(true); else if (state === 'pause') setPause(false); return; }
    if (e.code === 'KeyM') { toggleMute(); return; }
    if (e.code === 'KeyP' && (state === 'play' || state === 'pause')) { setPause(state === 'play'); return; }
    if (state === 'title' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); startFromTitle(); return; }
    if ((state === 'dead' || state === 'win') && (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); restartRun(); return; }
    if (!a) return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) presses.add(a);
    keys.add(a);
    touchMode = false;
  });
  window.addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) keys.delete(a); });
  window.addEventListener('blur', inputReset);
  const toLow = (e) => { mouseX = (e.clientX - viewOX) / viewScale; mouseY = (e.clientY - viewOY) / viewScale; };
  window.addEventListener('mousemove', (e) => {
    toLow(e);
    if (state === 'play') { touchMode = false; document.body.classList.remove('touch'); }
  });
  window.addEventListener('mousedown', (e) => {
    if (e.target.closest && (e.target.closest('#editor') || e.target.closest('.panel') || e.target.closest('.tbtn'))) return;
    initAudio(); toLow(e); touchMode = false; document.body.classList.remove('touch');
    if (e.button === 0 && state === 'play') mouseDown = true;
    if (e.button === 2) { e.preventDefault(); presses.add('interact'); }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; });
  window.addEventListener('contextmenu', (e) => { if (state === 'play') e.preventDefault(); });
  window.addEventListener('wheel', (e) => { if (state === 'play') { wandStep += e.deltaY > 0 ? 1 : -1; } }, { passive: true });
  initTouch();
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); initAudio(); uiAction(b.dataset.act); }));
}
function uiAction(act) {
  switch (act) {
    case 'start': startFromTitle(); break;
    case 'restart': restartRun(); break;
    case 'resume': setPause(false); break;
    case 'mute': toggleMute(); break;
    case 'closeEd': closeEditor(); break;
    case 'pause': if (state === 'play') setPause(true); break;
  }
}
function initTouch() {
  const tz = $('touch');
  // Do not unconditionally activate touch on laptops with touchscreen/touchpad
  const stickL = $('stickL'), stickR = $('stickR');
  const place = (el, x, y) => { el.style.display = 'block'; el.style.left = x + 'px'; el.style.top = y + 'px'; };
  const knob = (el, dx, dy) => { const k = el.firstElementChild; const d = Math.hypot(dx, dy), m = Math.min(1, 40 / (d || 1)); k.style.transform = `translate(${dx * m}px,${dy * m}px)`; };
  tz.addEventListener('touchstart', (e) => {
    initAudio(); touchMode = true; document.body.classList.add('touch');
    if (state !== 'play') return;
    for (const t of e.changedTouches) {
      if (t.target.closest && t.target.closest('.tbtn')) continue;
      if (t.clientX < window.innerWidth * 0.42 && touch.moveId === null) { touch.moveId = t.identifier; touch.mx0 = t.clientX; touch.my0 = t.clientY; touch.mdx = touch.mdy = 0; touch.upLatch = false; place(stickL, t.clientX, t.clientY); knob(stickL, 0, 0); }
      else if (t.clientX >= window.innerWidth * 0.42 && touch.aimId === null) { touch.aimId = t.identifier; touch.ax0 = t.clientX; touch.ay0 = t.clientY; place(stickR, t.clientX, t.clientY); knob(stickR, 0, 0); }
    }
    e.preventDefault();
  }, { passive: false });
  tz.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.moveId) {
        touch.mdx = t.clientX - touch.mx0; touch.mdy = t.clientY - touch.my0; knob(stickL, touch.mdx, touch.mdy);
        if (touch.mdy < -26 && !touch.upLatch) { presses.add('jump'); touch.upLatch = true; }
        if (touch.mdy > -14) touch.upLatch = false;
      } else if (t.identifier === touch.aimId) {
        const dx = t.clientX - touch.ax0, dy = t.clientY - touch.ay0; knob(stickR, dx, dy);
        if (Math.hypot(dx, dy) > 12) { touch.aimAng = Math.atan2(dy, dx); touch.aimOn = true; } else touch.aimOn = false;
      }
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.moveId) { touch.moveId = null; touch.mdx = touch.mdy = 0; stickL.style.display = 'none'; }
      if (t.identifier === touch.aimId) { touch.aimId = null; touch.aimOn = false; stickR.style.display = 'none'; }
    }
  };
  tz.addEventListener('touchend', end); tz.addEventListener('touchcancel', end);
  document.querySelectorAll('.tbtn').forEach(b => {
    const k = b.dataset.k;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation(); initAudio(); touchMode = true; b.classList.add('on');
      if (k === 'jump') { touch.jumpBtn = true; presses.add('jump'); }
      else if (k === 'swap') wandStep += 1;
      else if (k === 'edit') { if (state === 'play') openEditor(); else if (state === 'editor') closeEditor(); }
      else if (k === 'pause') { if (state === 'play') setPause(true); }
      else presses.add(k);
    }, { passive: false });
    const up = (e) => { e.preventDefault(); b.classList.remove('on'); if (k === 'jump') touch.jumpBtn = false; };
    b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
  });
}
function hideSticks() { const a = $('stickL'), b = $('stickR'); if (a) a.style.display = 'none'; if (b) b.style.display = 'none'; }

// ---------------------------------------------------------------- audio (all synthesized)
let AC = null, master = null, sfxBus = null, musBus = null, noiseBuf = null, muted = false, voices = 0, droneCur = null, dronePending = null;
const sfxLast = Object.create(null);
function initAudio() {
  if (AC || TEST) { if (AC && AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; return; }
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.connect(AC.destination);
  master = AC.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(comp);
  sfxBus = AC.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musBus = AC.createGain(); musBus.gain.value = 0.32; musBus.connect(master);
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  if (dronePending) { const r = dronePending; dronePending = null; setDrone(r); }
}
function toggleMute() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, AC.currentTime, 0.05); toast(muted ? '声音：关' : '声音：开'); }
function env(gn, t, vol, a, dur) {
  gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone(type, f0, f1, dur, vol, delay = 0, dest) {
  if (!AC || voices > 40) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), gn = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(gn, t, vol, Math.min(0.01, dur * 0.2), dur);
  o.connect(gn); gn.connect(dest || sfxBus); o.start(t); o.stop(t + dur + 0.02);
  voices++; o.onended = () => { voices--; gn.disconnect(); };
}
function noise(dur, vol, ftype, f0, f1, q = 1, delay = 0, dest) {
  if (!AC || voices > 40) return;
  const t = AC.currentTime + delay, s = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = ftype; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
  env(gn, t, vol, Math.min(0.008, dur * 0.2), dur);
  s.connect(f); f.connect(gn); gn.connect(dest || sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  voices++; s.onended = () => { voices--; gn.disconnect(); };
}
const SFX_GAP = { step: 0.09, gold: 0.045, hiss: 0.12, hit: 0.035, boom: 0.05, fuse: 0.1, lev: 0.1, tick: 0.03, pop: 0.03, blob: 0.1, hurt: 0.08, puff: 0.08, thud: 0.1, fizzle: 0.1, cast: 0.035 };
function sfx(name, arg) {
  if (!AC || muted) return;
  const now = AC.currentTime, gap = SFX_GAP[name] || 0.04;
  if (sfxLast[name] && now - sfxLast[name] < gap) return;
  sfxLast[name] = now;
  switch (name) {
    case 'boom': {
      const r = clamp(arg || 8, 3, 40), v = clamp(0.25 + r * 0.025, 0.25, 0.9);
      noise(0.25 + r * 0.03, v, 'lowpass', 1600, 60, 0.7);
      tone('sine', 110, 28, 0.25 + r * 0.02, v * 0.9);
      if (r > 14) noise(0.9, v * 0.4, 'lowpass', 400, 40, 0.5, 0.08);
      break;
    }
    case 'hiss': noise(0.4, 0.07, 'highpass', 2500, 5000, 0.5); break;
    case 'tick': tone('square', 1300, 1300, 0.025, 0.04); break;
    case 'pop': tone('sine', 700, 180, 0.08, 0.12); break;
    case 'blink': tone('sine', 300, 1600, 0.18, 0.14); tone('triangle', 1600, 400, 0.2, 0.06, 0.05); break;
    case 'fizzle': noise(0.12, 0.08, 'bandpass', 1400, 700, 2); tone('square', 180, 90, 0.1, 0.04); break;
    case 'perk': [523, 659, 784, 1046, 1318].forEach((f, k) => tone('triangle', f, f, 0.35, 0.1, k * 0.07)); break;
    case 'hurt': tone('square', 240, 90, 0.16, 0.1); noise(0.12, 0.12, 'bandpass', 900, 300, 1); break;
    case 'death': tone('sawtooth', 330, 35, 1.2, 0.18); noise(1.0, 0.2, 'lowpass', 1200, 80, 0.8); [392, 311, 233].forEach((f, k) => tone('triangle', f, f * 0.98, 0.5, 0.08, 0.35 + k * 0.28)); break;
    case 'jump': tone('square', 170, 340, 0.08, 0.045); break;
    case 'lev': noise(0.12, 0.03, 'bandpass', 700, 1100, 3); break;
    case 'step': noise(0.04, 0.05, 'lowpass', 500, 200, 1); break;
    case 'switch': tone('triangle', 700, 700, 0.04, 0.07); tone('triangle', 1050, 1050, 0.05, 0.06, 0.04); break;
    case 'drink': for (let k = 0; k < 4; k++) tone('sine', 280 + k * 90, 520 + k * 90, 0.07, 0.1, k * 0.07); break;
    case 'pick': tone('triangle', 880, 1320, 0.09, 0.1); tone('triangle', 1320, 1760, 0.08, 0.07, 0.06); break;
    case 'buy': tone('square', 1200, 1200, 0.06, 0.05); tone('square', 1600, 1600, 0.12, 0.05, 0.06); break;
    case 'chest': [392, 523, 659, 784].forEach((f, k) => tone('triangle', f, f, 0.25, 0.1, k * 0.06)); noise(0.2, 0.08, 'lowpass', 900, 200, 1); break;
    case 'gold': tone('sine', 1500 + fr() * 300, 2100, 0.07, 0.05); break;
    case 'hit': tone('square', 170, 60, 0.06, 0.06); noise(0.05, 0.06, 'bandpass', 1800, 600, 1); break;
    case 'edie': noise(0.25, 0.12, 'lowpass', 1400, 150, 1); tone('sawtooth', 220, 55, 0.25, 0.07); break;
    case 'bossdie': noise(2.5, 0.5, 'lowpass', 900, 30, 0.6); tone('sawtooth', 110, 20, 2.5, 0.25); [262, 330, 392, 523].forEach((f, k) => tone('triangle', f, f, 0.8, 0.08, 1 + k * 0.15)); break;
    case 'snort': noise(0.22, 0.12, 'bandpass', 380, 260, 2); break;
    case 'charge': tone('sawtooth', 110, 60, 0.45, 0.08); noise(0.4, 0.08, 'lowpass', 500, 200, 1); break;
    case 'thud': tone('sine', 90, 35, 0.25, 0.35); noise(0.15, 0.12, 'lowpass', 500, 100, 1); break;
    case 'charge2': tone('sine', 220, 880, 0.65, 0.05); tone('triangle', 330, 1320, 0.65, 0.03); break;
    case 'ecast': tone('triangle', 900, 300, 0.2, 0.08); break;
    case 'screech': tone('sawtooth', 1500, 900, 0.18, 0.035); tone('square', 1800, 1200, 0.12, 0.02); break;
    case 'fuse': noise(0.05, 0.04, 'highpass', 5000, 6000, 1); break;
    case 'puff': noise(0.3, 0.07, 'lowpass', 700, 200, 1); break;
    case 'blob': tone('sine', 220, 110, 0.12, 0.08); break;
    case 'rumble': noise(1.4, 0.25, 'lowpass', 180, 50, 0.7); break;
    case 'boss': tone('sawtooth', 55, 52, 2.2, 0.12); tone('sawtooth', 82, 78, 2.2, 0.08); noise(2, 0.15, 'lowpass', 300, 60, 1); break;
    case 'win': [392, 494, 587, 784, 988, 1175].forEach((f, k) => tone('triangle', f, f, 0.6, 0.1, k * 0.12)); break;
    case 'splash': noise(0.18, 0.06, 'bandpass', 1200, 500, 1.5); break;
    default: tone('sine', 600, 400, 0.06, 0.05);
  }
}
function sfxCast(s) {
  if (!AC || muted) return;
  const now = AC.currentTime;
  if (sfxLast.cast && now - sfxLast.cast < SFX_GAP.cast) return;
  sfxLast.cast = now;
  const tr = s.p ? s.p.trail : '';
  switch (s.id) {
    case 'bomb': tone('sine', 160, 90, 0.12, 0.15); break;
    case 'drill': noise(0.07, 0.06, 'highpass', 2500, 1500, 1); tone('square', 500, 300, 0.05, 0.03); break;
    case 'frost': tone('triangle', 1900, 1200, 0.12, 0.07); break;
    case 'lance': tone('sawtooth', 1300, 250, 0.16, 0.06); break;
    case 'saw': tone('square', 600, 900, 0.1, 0.04); break;
    case 'void': tone('sine', 120, 50, 0.4, 0.14); break;
    case 'blink': sfx('blink'); break;
    case 'spring': tone('sine', 300, 900, 0.12, 0.08); break;
    case 'acidglob': tone('sine', 400, 150, 0.12, 0.1); noise(0.08, 0.04, 'bandpass', 900, 500, 2); break;
    default:
      if (tr === 'fire') { noise(0.18, 0.09, 'bandpass', 900, 400, 1); tone('sawtooth', 260, 140, 0.14, 0.04); }
      else if (tr === 'arcane') tone('sine', 380, 900, 0.18, 0.08);
      else if (s.type === 'trig') { tone('square', 700, 1100, 0.07, 0.04); tone('sine', 1100, 1500, 0.07, 0.04, 0.03); }
      else tone('square', 950 + fr() * 80, 480, 0.06, 0.04);
  }
}
function sfxWorld(name, i) {
  const x = i % W, y = (i / W) | 0;
  if (x < camX - 40 || x > camX + VW + 40 || y < camY - 40 || y > camY + VH + 40) return;
  sfx(name);
}
function setDrone(r) {
  if (!AC) { dronePending = r; return; }
  const f = r.kind === 'sanct' ? 110 : r.kind === 'final' ? 36.7 : BIOMES[r.bi].drone;
  if (droneCur && droneCur.f === f) return;
  const t = AC.currentTime;
  if (droneCur) { const old = droneCur; old.g.gain.setTargetAtTime(0.0001, t, 0.8); setTimeout(() => { old.nodes.forEach(n => { try { n.stop(); } catch (e) { /* already stopped */ } }); old.g.disconnect(); }, 4000); }
  const g = AC.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(1, t, 1.2);
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = r.kind === 'sanct' ? 900 : 380; lp.Q.value = 4;
  lp.connect(g); g.connect(musBus);
  const nodes = [];
  const mk = (type, freq, vol, det) => { const o = AC.createOscillator(), og = AC.createGain(); o.type = type; o.frequency.value = freq; o.detune.value = det; og.gain.value = vol; o.connect(og); og.connect(lp); o.start(); nodes.push(o); };
  if (r.kind === 'sanct') { mk('sine', f, 0.14, 0); mk('sine', f * 1.5, 0.08, 4); mk('triangle', f * 2, 0.05, -5); mk('sine', f * 2.52, 0.03, 0); }
  else { mk('sawtooth', f, 0.12, -7); mk('sawtooth', f, 0.12, 7); mk('sine', f / 2, 0.22, 0); mk('triangle', f * 1.5, 0.04, 3); }
  const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.07 + fr() * 0.05; lg.gain.value = r.kind === 'sanct' ? 300 : 180; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); nodes.push(lfo);
  droneCur = { f, g, nodes };
}

// ---------------------------------------------------------------- HUD
let toastList = [];
function toast(msg, col) {
  const box = $('toasts'); if (!box) return;
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; if (col) d.style.color = col;
  box.appendChild(d); toastList.push(d);
  while (toastList.length > 4) { const o = toastList.shift(); o.remove(); }
  setTimeout(() => { d.classList.add('out'); setTimeout(() => { d.remove(); toastList = toastList.filter(x => x !== d); }, 500); }, 3400);
}
let bannerTO = 0;
function showBanner(name, en) {
  const b = $('biomeBanner'); if (!b) return;
  b.innerHTML = `<div class="bn">${name}</div><div class="be">${en || ''}</div>`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  clearTimeout(bannerTO); bannerTO = setTimeout(() => b.classList.remove('show'), 3200);
}
const hudEls = {};
function hudEl(id) { return hudEls[id] || (hudEls[id] = $(id)); }
function setBar(id, f) { const el = hudEl(id); const v = clamp(f, 0, 1).toFixed(3); if (el._v !== v) { el._v = v; el.style.transform = `scaleX(${v})`; } }
function setTxt(id, t) { const el = hudEl(id); if (el._t !== t) { el._t = t; el.textContent = t; } }
function setHTML(id, h) { const el = hudEl(id); if (el._h !== h) { el._h = h; el.innerHTML = h; } }
function slotTip(slot) {
  const s = SP[slot.id];
  return `${s.n}（${TYPE_NAME[s.type]}）法力 ${s.mana}${slot.uses >= 0 ? ' · 剩余 ' + slot.uses + ' 次' : ''}`;
}
function updHUD() {
  const p = player; if (!p) return;
  setBar('hpFill', p.hp / p.maxHp); setTxt('hpTxt', `${Math.max(0, Math.ceil(p.hp))}/${p.maxHp}`);
  const w = curWand();
  setBar('manaFill', w ? w.mana / w.manaMax : 0);
  setBar('flyFill', p.flight / p.flightMax);
  let rf = 1, rl = '';
  if (w) { if (w.rechargeT > 0) { rf = 1 - w.rechargeT / Math.max(1, (w.recharge * (hasPerk('quick') ? 0.7 : 1)) + 1); rl = 'recharge'; } else if (w.delayT > 0) { rf = 1 - w.delayT / Math.max(1, w.delay + 1); rl = 'delay'; } }
  setBar('rechargeFill', rf); hudEl('rechargeBar').dataset.st = rl;
  const airRow = hudEl('airRow'); const showAir = p.air < p.airMax - 0.05;
  if (airRow._s !== showAir) { airRow._s = showAir; airRow.style.display = showAir ? '' : 'none'; }
  if (showAir) setBar('airFill', p.air / p.airMax);
  setTxt('goldTxt', String(p.gold));
  const r = regionAt(clamp(p.y | 0, 0, H - 1));
  setTxt('depthTxt', `${r.name} · ${Math.max(0, Math.round((p.y - 60) / 10))}m`);
  setTxt('potionTxt', `×${p.potions}`);
  let st = '';
  if (p.burn > 0) st += '<span class="st fire">燃烧</span>';
  if (p.poison > 0) st += '<span class="st tox">中毒</span>';
  if (p.wet > 0) st += '<span class="st wet">湿透</span>';
  if (p.oiled > 0) st += '<span class="st oil">油污</span>';
  if (p.slow > 0) st += '<span class="st slow">迟缓</span>';
  for (const k in p.perks) st += `<img class="pk" src="${perkIconURL(k)}" title="${PERKS[k].n}：${PERKS[k].d}">${p.perks[k] > 1 ? '<b>×' + p.perks[k] + '</b>' : ''}`;
  setHTML('statusIcons', st);
  // wand + spell bars
  const sig = p.cur + '|' + p.wands.map(ww => ww.name + ':' + ww.slots.map(s => s ? s.id + s.uses : '-').join(',')).join(';');
  if (sig !== ui.sig || ui.dirty) {
    ui.sig = sig; ui.dirty = false;
    let h = '';
    p.wands.forEach((ww, k) => { h += `<div class="wslot${k === p.cur ? ' on' : ''}" data-w="${k}"><span class="wk">${k + 1}</span><img src="${wandSprite(ww).url}"></div>`; });
    for (let k = p.wands.length; k < 4; k++) h += `<div class="wslot empty"><span class="wk">${k + 1}</span></div>`;
    hudEl('wandBar').innerHTML = h;
    hudEl('wandBar').querySelectorAll('.wslot[data-w]').forEach(el => el.addEventListener('click', () => switchWand(+el.dataset.w)));
    let s = w ? `<div class="wname">${w.name}</div>` : '';
    if (w) w.slots.forEach((sl, k) => { s += `<div class="sslot" data-i="${k}">${sl ? `<img src="${spellIconURL(sl.id)}" title="${slotTip(sl)}">${sl.uses >= 0 ? `<i>${sl.uses}</i>` : ''}` : ''}</div>`; });
    hudEl('spellBar').innerHTML = s;
  }
  // next-card marker
  if (w) {
    const nxt = w.order && w.order.length && !w.dirty ? w.order[w.pos % w.order.length] : -1;
    if (hudEl('spellBar')._n !== nxt) { hudEl('spellBar')._n = nxt; hudEl('spellBar').querySelectorAll('.sslot').forEach(el => el.classList.toggle('next', +el.dataset.i === nxt)); }
  }
  // prompt
  let pr = '';
  if (ui.interact) pr = touchMode ? interactText(ui.interact).replace('[E]', '【互动】') : interactText(ui.interact);
  else if (canEdit() && regionAt(p.y | 0).kind === 'sanct') pr = touchMode ? '圣所：点击「法杖」按钮编辑法杖' : '圣所：按 Tab 编辑法杖';
  else if (!ui.castHint || ui.moved < 40) pr = touchMode ? '左摇杆移动 / 上推跳跃 · 右摇杆瞄准并施法' : 'A/D 移动 · W/空格 跳跃（按住悬浮） · 鼠标左键施法 · Tab 编辑法杖';
  setTxt('prompt', pr);
}
function interactBtnVisible() { const b = $('tInteract'); if (b) b.classList.toggle('hl', !!ui.interact); }

// ---------------------------------------------------------------- wand editor
function openEditor() {
  if (state !== 'play' || !player || player.dead) return;
  state = 'editor'; inputReset(); ui.edSel = null;
  $('editor').classList.add('show');
  buildEditor(); sfx('switch');
}
function closeEditor() {
  if (state !== 'editor') return;
  state = 'play'; inputReset(); endDrag();
  $('editor').classList.remove('show');
  for (const w of player.wands) if (w.dirty) { w.order = null; }
  ui.dirty = true;
}
const getSlot = (a) => a.src === 'b' ? player.bag[a.si] : player.wands[a.wi].slots[a.si];
function setSlot(a, v) { if (a.src === 'b') player.bag[a.si] = v; else { player.wands[a.wi].slots[a.si] = v; player.wands[a.wi].dirty = true; } }
function addrOf(el) { if (!el || !el.dataset || !el.dataset.src) return null; return { src: el.dataset.src, wi: +el.dataset.wi || 0, si: +el.dataset.si }; }
const sameAddr = (a, b) => a && b && a.src === b.src && a.wi === b.wi && a.si === b.si;
function swapSlots(a, b) {
  if (!canEdit() || sameAddr(a, b)) return false;
  const va = getSlot(a), vb = getSlot(b); setSlot(a, vb); setSlot(b, va);
  sfx('pick'); ui.dirty = true; return true;
}
function wandStats(w) {
  const q = hasPerk('quick') ? 0.7 : 1;
  const row = (k, v) => `<span><em>${k}</em>${v}</span>`;
  return row('乱序', w.shuffle ? '<b class="bad">是</b>' : '<b class="good">否</b>') + row('每次施放', w.spc) + row('施放延迟', (w.delay * q / 60).toFixed(2) + 's') +
    row('充能时间', (w.recharge * q / 60).toFixed(2) + 's') + row('法力上限', w.manaMax) + row('法力回复', w.manaCharge + '/s') + row('容量', w.cap) + row('散射', w.spread + '°');
}
function slotHTML(sl, src, wi, si) {
  const sel = ui.edSel && ui.edSel.src === src && ui.edSel.wi === wi && ui.edSel.si === si;
  return `<div class="eslot${sl ? ' full t-' + SP[sl.id].type : ''}${sel ? ' sel' : ''}" data-src="${src}" data-wi="${wi}" data-si="${si}">${sl ? `<img src="${spellIconURL(sl.id)}" draggable="false">${sl.uses >= 0 ? `<i>${sl.uses}</i>` : ''}` : ''}</div>`;
}
function buildEditor() {
  const p = player, ok = canEdit();
  $('edLock').style.display = ok ? 'none' : '';
  $('editor').classList.toggle('locked', !ok);
  let h = '';
  p.wands.forEach((w, wi) => {
    h += `<div class="ewand${wi === p.cur ? ' cur' : ''}"><div class="ewhead"><img src="${wandSprite(w).url}"><b>${w.name}</b><div class="ewstats">${wandStats(w)}</div></div><div class="eslots">`;
    w.slots.forEach((sl, si) => { h += slotHTML(sl, 'w', wi, si); });
    h += '</div></div>';
  });
  $('edWands').innerHTML = h;
  let b = '';
  p.bag.forEach((sl, si) => { b += slotHTML(sl, 'b', 0, si); });
  $('edBag').innerHTML = b;
  document.querySelectorAll('#editor .eslot').forEach(el => {
    el.addEventListener('pointerdown', edPointerDown);
    el.addEventListener('pointerenter', () => { const a = addrOf(el), s = a && getSlot(a); if (s) showInfo(s); });
  });
  if (!ui.infoShown) showInfo(null);
}
function showInfo(sl) {
  const box = $('edInfo');
  if (!sl) { box.innerHTML = '<div class="ihint">拖动法术到法杖槽位中组装法杖；点按两个槽位也可交换。<br>法杖从左到右依次施放：<b class="t-mod">修饰</b>作用于随后的投射物，<b class="t-multi">多重</b>同时抽取多张，<b class="t-trig">触发</b>命中时释放下一张法术。<br>例：散射三连 + 火焰修饰 + 追踪修饰 + 火花矢…</div>'; return; }
  ui.infoShown = true;
  const s = SP[sl.id];
  const pr = s.p || {};
  let stats = `<span>法力 <b>${s.mana}</b></span><span>延迟 <b>${((s.delay || 0) / 60).toFixed(2)}s</b></span>`;
  if (s.recharge) stats += `<span>充能 <b>${s.recharge > 0 ? '+' : ''}${(s.recharge / 60).toFixed(2)}s</b></span>`;
  if (pr.dmg) stats += `<span>伤害 <b>${pr.dmg}</b></span>`;
  if (pr.boom) stats += `<span>爆炸 <b>${pr.boom[2]}</b></span>`;
  if (pr.expireBoom) stats += `<span>爆炸 <b>${pr.expireBoom[2]}</b></span>`;
  if (pr.spd) stats += `<span>速度 <b>${pr.spd}</b></span>`;
  if (s.uses) stats += `<span>次数 <b>${sl.uses}/${s.uses}</b></span>`;
  box.innerHTML = `<div class="ititle"><img src="${spellIconURL(sl.id)}"><div><b>${s.n}</b><em class="t-${s.type}">${TYPE_NAME[s.type]}</em></div></div><div class="idesc">${s.desc}</div><div class="istats">${stats}</div>`;
}
let dragGhost = null;
function edPointerDown(e) {
  const el = e.currentTarget, a = addrOf(el), sl = getSlot(a);
  e.preventDefault();
  if (sl) showInfo(sl);
  ui.drag = { a, x0: e.clientX, y0: e.clientY, moved: false, sl, id: e.pointerId };
  window.addEventListener('pointermove', edPointerMove);
  window.addEventListener('pointerup', edPointerUp);
  window.addEventListener('pointercancel', edPointerUp);
}
function edPointerMove(e) {
  const d = ui.drag; if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6 && d.sl && canEdit()) {
    d.moved = true;
    dragGhost = document.createElement('img'); dragGhost.className = 'dragGhost'; dragGhost.src = spellIconURL(d.sl.id);
    document.body.appendChild(dragGhost);
    const src = document.querySelector(`#editor .eslot[data-src="${d.a.src}"][data-wi="${d.a.wi}"][data-si="${d.a.si}"]`); if (src) src.classList.add('dragging');
  }
  if (d.moved && dragGhost) {
    dragGhost.style.left = e.clientX + 'px'; dragGhost.style.top = e.clientY + 'px';
    document.querySelectorAll('#editor .eslot.over').forEach(x => x.classList.remove('over'));
    const t = document.elementFromPoint(e.clientX, e.clientY), tgt = t && t.closest ? t.closest('.eslot') : null;
    if (tgt) tgt.classList.add('over');
  }
}
function edPointerUp(e) {
  const d = ui.drag; if (!d) return;
  if (d.moved) {
    const t = document.elementFromPoint(e.clientX, e.clientY), tgt = t && t.closest ? t.closest('.eslot') : null;
    const b = addrOf(tgt);
    if (b) swapSlots(d.a, b);
    ui.edSel = null;
  } else if (canEdit()) {
    if (ui.edSel && !sameAddr(ui.edSel, d.a)) { swapSlots(ui.edSel, d.a); ui.edSel = null; }
    else if (ui.edSel) ui.edSel = null;
    else if (d.sl) ui.edSel = d.a;
  } else toast('只能在圣所、营地石台旁或拥有「随处改装」时修改法杖');
  endDrag();
  buildEditor();
}
function endDrag() {
  ui.drag = null;
  if (dragGhost) { dragGhost.remove(); dragGhost = null; }
  window.removeEventListener('pointermove', edPointerMove);
  window.removeEventListener('pointerup', edPointerUp);
  window.removeEventListener('pointercancel', edPointerUp);
}
function setPause(on) {
  if (on && state === 'play') { state = 'pause'; inputReset(); $('pause').classList.add('show'); if (AC) AC.suspend(); }
  else if (!on && state === 'pause') { state = 'play'; $('pause').classList.remove('show'); if (AC) AC.resume(); }
}

// ---------------------------------------------------------------- game flow
const QS = new URLSearchParams(location.search);
const TEST = QS.has('test');
let state = 'boot';
let runSeed = 0, camFX = 0, camFY = 0, lastT = 0, acc = 0, fpsSm = 60, simHalf = false, simTick = 0, simMs = 0, runCount = 0;
const errs = (window.__errs = window.__errs || []);
window.addEventListener('error', (e) => errs.push(String(e.message) + ' @' + e.lineno));
function loadBest() { try { return JSON.parse(localStorage.getItem('emberdeep.best') || '{}'); } catch (e) { return {}; } }
function saveBest(o) { try { localStorage.setItem('emberdeep.best', JSON.stringify(o)); } catch (e) { /* storage unavailable */ } }
function newRun(seed) {
  runSeed = seed >>> 0; runCount++;
  const t0 = performance.now();
  const sp = genWorld(runSeed);
  player = mkPlayer(sp.x, sp.y);
  player.wands = starterWands();
  stats = { time: 0, kills: 0, maxDepth: 0, gold: 0 };
  addToBag('scatter'); addToBag('mfire'); addToBag('homing'); addToBag('spark');
  rerollN = 0; lastCast = null; shakeAmt = 0; hurtFlashT = 0; dmgAccum = 0; deathT = 0; frameNo = 0; acc = 0;
  ui.dirty = true; ui.castHint = 0; ui.moved = 0; ui.interact = null; ui.infoShown = false;
  updCamera(true);
  for (let k = 0; k < 30; k++) simStep();
  player.regionIdx = regionOf[player.y | 0];
  enterRegion(REG[player.regionIdx]);
  window.__genMs = performance.now() - t0;
}
function updCamera(snap) {
  const p = player; if (!p) return;
  let tx = p.x - VW / 2, ty = p.y - 8 - VH / 2;
  if (state === 'play' && !p.dead) { const a = aimWorld(); tx += clamp((a.x - p.x) * 0.2, -44, 44); ty += clamp((a.y - p.y) * 0.2, -28, 28); }
  tx = clamp(tx, 0, W - VW); ty = clamp(ty, 0, H - VH);
  if (snap) { camFX = tx; camFY = ty; } else { camFX += (tx - camFX) * 0.11; camFY += (ty - camFY) * 0.14; }
  camX = Math.round(camFX); camY = Math.round(camFY);
}
function step() {
  frameNo++;
  const live = state === 'play';
  if (live || state === 'dead' || state === 'win') {
    if (live && !player.dead) updPlayer();
    updEnemies();
    for (const p of projs) if (!p.dead) updProj(p);
    if (frameNo % 15 === 0) projs = projs.filter(p => !p.dead);
    updPickups();
  }
  simTick++;
  if (!simHalf || (simTick & 1)) { const t0 = performance.now(); simStep(); simMs = simMs * 0.95 + (performance.now() - t0) * 0.05; }
  updParticles();
  for (const f of flashes) f.t--;
  if (flashes.length && frameNo % 4 === 0) flashes = flashes.filter(f => f.t > 0);
  for (const f of floaters) { f.t--; f.y -= f.big ? 0.25 : 0.4; }
  if (floaters.length && frameNo % 4 === 0) floaters = floaters.filter(f => f.t > 0);
  updCamera(false);
  shakeAmt *= 0.87; if (shakeAmt < 0.25) shakeAmt = 0;
  if (hurtFlashT > 0) hurtFlashT--;
  if (live) {
    stats.time += STEP;
    if (Math.abs(player.vx) > 5) ui.moved++;
    if (dmgAccum >= 1 && frameNo % 10 === 0) { floatText(player.x, player.y - 16, '-' + Math.round(dmgAccum), '#ff5a5a'); dmgAccum = 0; }
  }
  if (player.dead) deathT++;
}
function frame(t) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, lastT ? t - lastT : 16.7); lastT = t;
  if (dtMs > 0) fpsSm = fpsSm * 0.95 + (1000 / dtMs) * 0.05;
  if (!H || !player) return;
  const running = state === 'play' || state === 'dead' || state === 'win' || state === 'title';
  if (running) {
    acc += dtMs / 1000;
    let n = 0;
    while (acc >= STEP && n < 3) { step(); acc -= STEP; n++; }
    if (acc > STEP * 3) acc = 0;
    // adapt: halve the sand simulation rate on slow machines
    if (frameNo % 120 === 0) { if (!simHalf && simMs > 9 && fpsSm < 50) simHalf = true; else if (simHalf && simMs < 4) simHalf = false; }
    render();
  } else if (frameNo !== frame.lastRendered) { render(); frame.lastRendered = frameNo; }
  if (state !== 'title') updHUD();
  interactBtnVisible();
}
function fmtTime(s) { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function runStatsHTML() {
  return `<div class="dstats"><span><em>最深</em>${Math.max(0, Math.round((stats.maxDepth * 10 - 60) / 10))}m · ${regionAt(clamp(player.y | 0, 0, H - 1)).name}</span><span><em>用时</em>${fmtTime(stats.time)}</span><span><em>击杀</em>${stats.kills}</span><span><em>金币</em>${stats.gold}</span></div>`;
}
function recordBest(win) {
  const b = loadBest(), d = Math.max(0, Math.round((stats.maxDepth * 10 - 60) / 10));
  const nb = { depth: Math.max(b.depth || 0, d), kills: Math.max(b.kills || 0, stats.kills), runs: (b.runs || 0) + 1, wins: (b.wins || 0) + (win ? 1 : 0) };
  saveBest(nb); return nb;
}
function showDeath() {
  if (!player || !player.dead || state !== 'play') return;
  state = 'dead'; inputReset();
  if ($('editor').classList.contains('show')) $('editor').classList.remove('show');
  const [title, desc] = causeText(player.lastCause);
  const b = recordBest(false);
  window.__deathCause = { title, desc, cause: player.lastCause };
  $('dead').innerHTML = `<div class="panel"><div class="dsub">你死了</div><div class="dtitle" id="deathCause">${title}</div><div class="ddesc">${desc}</div>${runStatsHTML()}` +
    `<div class="dbest">历史最深 ${b.depth}m · 共 ${b.runs} 局${b.wins ? ' · 通关 ' + b.wins + ' 次' : ''}</div>` +
    `<button class="btn" data-act="restart">重新开始 · 新的深渊（R）</button></div>`;
  $('dead').querySelector('[data-act]').addEventListener('click', () => restartRun());
  $('dead').classList.add('show');
}
function winGame() {
  if (state !== 'play') return;
  state = 'win'; inputReset();
  sfx('win'); addShake(6);
  for (const q of pickups) if (q.kind === 'orb') q.dead = true;
  burst(player.x, player.y - 8, 120, [255, 190, 90], 160, 60, PF_GLOW);
  addFlash(player.x, player.y - 8, 220, [255, 200, 120], 90);
  const b = recordBest(true);
  $('win').innerHTML = `<div class="panel"><div class="dsub">胜利</div><div class="dtitle win">余烬之心归你所有</div><div class="ddesc">你穿过了五层深渊，击败熔炉守卫，将余烬之心带回了地表。</div>${runStatsHTML()}` +
    `<div class="dbest">通关 ${b.wins} 次 · 共 ${b.runs} 局</div><button class="btn" data-act="restart">再次下潜（R）</button></div>`;
  $('win').querySelector('[data-act]').addEventListener('click', () => restartRun());
  setTimeout(() => $('win').classList.add('show'), 1500);
}
function hideOverlays() { ['dead', 'win', 'pause', 'title', 'editor'].forEach(id => $(id).classList.remove('show')); }
function restartRun(seed) {
  hideOverlays(); inputReset();
  $('loading').classList.add('show');
  state = 'boot';
  setTimeout(() => {
    newRun(seed != null ? seed : (Math.random() * 1e9) | 0);
    $('loading').classList.remove('show');
    state = 'play';
  }, 30);
}
function startFromTitle() {
  if (state !== 'title') return;
  initAudio();
  $('title').classList.remove('show'); document.body.classList.remove('intitle');
  state = 'play'; inputReset();
  enterRegion(REG[player.regionIdx]);
}
function boot() {
  initRender();
  initInput();
  const qs = QS.get('seed');
  const seed = qs != null ? (parseInt(qs, 10) >>> 0) : (Math.random() * 1e9) | 0;
  newRun(seed);
  $('loading').classList.remove('show');
  const b = loadBest();
  if (b.runs) $('titleBest').textContent = `历史最深 ${b.depth}m · 最多击杀 ${b.kills} · 共 ${b.runs} 局${b.wins ? ' · 通关 ' + b.wins + ' 次' : ''}`;
  if (TEST) { state = 'play'; $('title').classList.remove('show'); }
  else { state = 'title'; $('title').classList.add('show'); document.body.classList.add('intitle'); }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- test / debug hooks
window.EMBER = {
  get state() { return state; }, get player() { return player; }, get enemies() { return enemies; }, get stats() { return stats; },
  get projs() { return projs; }, get lastCast() { return lastCast; }, get fps() { return fpsSm; }, get simHalf() { return simHalf; },
  get simMs() { return simMs; }, get cam() { return { x: camX, y: camY }; }, get seed() { return runSeed; }, get pickups() { return pickups; },
  get regions() { return REG.map(r => ({ kind: r.kind, name: r.name, y0: r.y0, y1: r.y1 })); }, get H() { return H; }, W,
  SP, EDEF, PERKS,
  mat(x, y) { return MATS[matAt(x | 0, y | 0)].id; },
  fill(x0, y0, w, h, name) { const m = M[name]; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setM(x, y, m); wakeRect(x0 - 2, y0 - 2, x0 + w + 2, y0 + h + 2); },
  teleport(x, y) { player.x = x; player.y = y; player.vx = player.vy = 0; updCamera(true); },
  spawn(type, dx, dy) { const r = regionAt(player.y | 0); const e = spawnEnemy(type, player.x + dx, player.y + dy, r.tier || 1); return e; },
  setWand(ids, o) {
    const w = mkWand(Object.assign({ name: '测试法杖', cap: ids.length, spc: 1, delay: 6, recharge: 10, manaMax: 800, manaCharge: 400, spread: 0 }, o || {}));
    ids.forEach((id, k) => { w.slots[k] = mkSlot(id); });
    player.wands[player.cur] = w; ui.dirty = true; return w;
  },
  aimAt(x, y) { touchMode = false; mouseX = x - camX; mouseY = y - camY; },
  press(a) { presses.add(a); }, hold(a, on) { if (on) keys.add(a); else keys.delete(a); }, fire(on) { mouseDown = !!on; },
  hurt(amt, cause, detail) { hurtPlayer(amt, cause, detail); },
  step(n) { for (let k = 0; k < n; k++) step(); },
  restart(seed) { restartRun(seed); }, openEditor, closeEditor, perk(k) { givePerk(k); },
  swap(a, b) { return swapSlots(a, b); }, canEdit,
  deathText() { return $('dead').innerText; },
  lightURL() { return lightCv.toDataURL(); }, emURL() { return emCv.toDataURL(); },
  ambient() { return ambientAt(); },
  reach() { // flood fill over cells where the 5x11 body fits by the same rule as rectHits(..., powderFeetOnly): hard cells block, powder only at the feet
    const ok = new Uint8Array(W * H), seen = new Uint8Array(W * H);
    const col = new Uint16Array(W * H), colP = new Uint16Array(W * H);
    for (let x = 0; x < W; x++) { let run = 0, runP = 0; for (let y = 0; y < H; y++) { const m = mat[y * W + x]; run = mHard[m] ? 0 : run + 1; runP = mHard[m] || mT[m] === T_POWDER ? 0 : runP + 1; col[y * W + x] = run; colP[y * W + x] = runP; } }
    for (let y = 11; y < H; y++) { let run = 0; for (let x = 0; x < W; x++) { const i = (y - 1) * W + x; run = col[i] >= 11 && colP[i] >= 3 ? run + 1 : 0; if (run >= 5) ok[i - 2] = 1; } }
    const q = new Int32Array(W * H); let h = 0, n = 0;
    let s0 = -1;
    for (let r = 0; r < 8 && s0 < 0; r++) for (let dy = -r; dy <= r && s0 < 0; dy++) for (let dx = -r; dx <= r; dx++) { const j = ((player.y | 0) - 1 + dy) * W + (player.x | 0) + dx; if (ok[j]) { s0 = j; break; } }
    if (s0 < 0) return { err: 'start blocked' };
    q[n++] = s0; seen[s0] = 1; let maxY = 0;
    while (h < n) { const i = q[h++], y = (i / W) | 0; if (y > maxY) maxY = y; for (const d of [1, -1, W, -W]) { const j = i + d; if (j > 0 && j < W * H && ok[j] && !seen[j]) { seen[j] = 1; q[n++] = j; } } }
    window.__reachOk = ok; window.__reachSeen = seen;
    if (window.__reachImg) {
      const y0 = window.__reachImg[0], y1 = window.__reachImg[1];
      const c = document.createElement('canvas'); c.width = W; c.height = y1 - y0; const cx = c.getContext('2d'); const im = cx.createImageData(W, y1 - y0);
      for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const i = y * W + x, o = ((y - y0) * W + x) * 4, m = mat[i], t = mT[m];
        let r = 0, g = 0, b = 0; if (t === T_SOLID) { r = g = b = 90; } else if (t === T_POWDER) { r = 150; g = 130; b = 60; } else if (t === T_LIQUID) { r = 40; g = 60; b = 160; }
        if (seen[i]) { r = 60; g = 220; b = 90; } else if (ok[i]) { r = 200; g = 60; b = 60; }
        im.data[o] = r; im.data[o + 1] = g; im.data[o + 2] = b; im.data[o + 3] = 255; }
      cx.putImageData(im, 0, 0); window.__reachURL = c.toDataURL();
    }
    return { maxY, H, cells: n };
  },
  get audio() { return AC ? AC.state : 'none'; }, get muted() { return muted; },
  get descent() { return descent.map(d => d.pts.map(p => p.map(Math.round))); },
};
boot();
})();
