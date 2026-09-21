/* ============================================================================
 * EMBERDEEP · 烬渊 — an original Noita-inspired falling-sand roguelite.
 * Pure frontend, zero build: one canvas, one ImageData pipeline, one loop.
 * Every pixel is simulated: density layering, burning, melting, dissolving,
 * explosions with ray energy, and darkness that only light can push back.
 * All art, names and numbers are original approximations of the systems
 * described in refs/ research; no Noita assets are used or copied.
 * ==========================================================================*/
'use strict';

/* ---------------------------------------------------------------- core --- */
const VW = 480, VH = 270;                       // internal render resolution
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
const img = ctx.createImageData(VW, VH);
const buf = new Uint32Array(img.data.buffer);    // ABGR little-endian
const $ = id => document.getElementById(id);

// world grid ------------------------------------------------------------
const W = 512;
const BANDS = [
  { t: 'sky',    y0: 0,    y1: 148 },
  { t: 'biome',  b: 0,     y0: 148,  y1: 476  },  // 矿坑
  { t: 'sanct',  i: 0,     y0: 476,  y1: 566  },
  { t: 'biome',  b: 1,     y0: 566,  y1: 894  },  // 煤坑
  { t: 'sanct',  i: 1,     y0: 894,  y1: 984  },
  { t: 'biome',  b: 2,     y0: 984,  y1: 1312 },  // 菌窟
  { t: 'sanct',  i: 2,     y0: 1312, y1: 1402 },
  { t: 'biome',  b: 3,     y0: 1402, y1: 1730 },  // 冰渊
  { t: 'sanct',  i: 3,     y0: 1730, y1: 1820 },
  { t: 'biome',  b: 4,     y0: 1820, y1: 2246 },  // 熔火之心(含Boss)
];
const H = 2256;
const cells = new Uint8Array(W * H);            // material id
const aux   = new Uint8Array(W * H);            // fire life / gas life / tnt fuse
const seedN = new Uint8Array(W * H);            // static per-cell texture noise
const bandAt = y => { for (let i = 0; i < BANDS.length; i++) if (y >= BANDS[i].y0 && y < BANDS[i].y1) return BANDS[i]; return BANDS[BANDS.length - 1]; };

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
let _h = 0x9e3779b9;
function hashXY(x, y) {                          // stable cheap 0..255 texture noise
  let h = (x * 374761393 + y * 668265263 + _h) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return (h ^ (h >>> 16)) >>> 0 & 255;
}
function makeRng(s) {                             // mulberry32 — worldgen only
  let t = s >>> 0;
  return () => { t += 0x6d2b79f5; let x = t;
    x = Math.imul(x ^ x >>> 15, 1 | x);
    x ^= x + Math.imul(x ^ x >>> 7, 61 | x);
    return ((x ^ x >>> 14) >>> 0) / 4294967296; };
}
let rng = makeRng(1);
const rint = (a, b) => Math.floor(rng() * (b - a + 1)) + a;   // worldgen ints
const rf   = (a, b) => a + rng() * (b - a);                    // worldgen float
const mrnd = Math.random;                                       // gameplay rng
const mri  = (a, b) => (mrnd() * (b - a + 1) | 0) + a;
const pick = arr => arr[mrnd() * arr.length | 0];

// value noise for terrain (worldgen) ------------------------------
const noiseCache = new Map();
function noiseGrid(size) {
  if (noiseCache.has(size)) return noiseCache.get(size);
  const gw = Math.ceil(W / size) + 2, gh = Math.ceil(H / size) + 2;
  const g = new Float32Array(gw * gh);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  const out = { g, gw, gh, size };
  out.at = (x, y) => {
    const fx = x / out.size, fy = y / out.size;
    let x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = out.g[y0 * out.gw + x0], b = out.g[y0 * out.gw + x0 + 1];
    const c = out.g[(y0 + 1) * out.gw + x0], d = out.g[(y0 + 1) * out.gw + x0 + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  };
  noiseCache.set(size, out);
  return out;
}
function fbm(x, y, oct) {
  let v = 0, amp = 1, tot = 0, sz = 96;
  for (let i = 0; i < oct; i++) { v += noiseGrid(sz).at(x, y) * amp; tot += amp; amp *= .5; sz = Math.max(8, sz >> 1); }
  return v / tot;
}

/* ------------------------------------------------------------ materials -- */
// class: 0 solid | 1 powder | 2 liquid | 3 gas | 4 fire-energy
const MAT = { AIR:0, ROCK:1, DIRT:2, SAND:3, STONE:4, WOOD:5, COAL:6, GOLD:7, METAL:8,
  BED:9, SACRED:10, GLASS:11, ICE:12, SNOW:13, FUNG:14, MUSH:15, TOXD:16, LAMP:17, TNT:18,
  WATER:19, OIL:20, LAVA:21, BLOOD:22, SLIME:23, ACID:24, SLUDGE:25,
  PGAS:26, FIRE:27, SMOKE:28, STEAM:29, FGAS:30, ASH:31, GUNP:32 };
const NMAT = 33;
const M = name => MAT[name];
// per-material definition tables (index by material id)
const M_NAME = new Array(NMAT).fill('');
const M_CLS  = new Uint8Array(NMAT);
const M_DEN  = new Float32Array(NMAT);   // liquid/powder density (×100 vs water=100)
const M_HP   = new Uint16Array(NMAT);    // hardness: energy consumed when dug
const M_BURN = new Uint8Array(NMAT);     // flammability: 0 no,1 slow,2 normal,3 fast,4 instant
const M_RES  = new Uint8Array(NMAT);     // 1 = acid-proof / reaction-proof core
const M_EMBER= new Uint8Array(NMAT);     // 1 = glowing lava-like (emits fire above)
const M_LIGHT= new Uint8Array(NMAT);     // index into LIGHTS
const M_SLIP = new Uint8Array(NMAT);     // slippery surface (ice)
const M_DMG  = new Float32Array(NMAT);   // hp/sec damage on standing contact (liquids/gases)
const M_TOX  = new Uint8Array(NMAT);     // 1 poisons entities standing in it
const M_FREEZ= new Uint8Array(NMAT);     // 1 freezes (frost contact)

function def(id, o) {
  M_NAME[id] = o.n; M_CLS[id] = o.c; M_DEN[id] = o.d || 0; M_HP[id] = o.hp || 0;
  M_BURN[id] = o.b || 0; M_RES[id] = o.r ? 1 : 0; M_EMBER[id] = o.e ? 1 : 0;
  M_LIGHT[id] = o.l != null ? o.l : 0; M_SLIP[id] = o.sl ? 1 : 0; M_DMG[id] = o.dm || 0;
  M_TOX[id] = o.tox ? 1 : 0; M_FREEZ[id] = o.frz ? 1 : 0;
}
def(MAT.AIR,   { n:'空气',   c:0, hp:1 });
def(MAT.ROCK,  { n:'岩石',   c:0, hp:52, r:0 });
def(MAT.DIRT,  { n:'泥土',   c:0, hp:26 });
def(MAT.SAND,  { n:'砂砾',   c:1, d:190, hp:14 });
def(MAT.STONE, { n:'石砖',   c:0, hp:78, r:1 });
def(MAT.WOOD,  { n:'木材',   c:0, hp:30, b:2 });
def(MAT.COAL,  { n:'煤',     c:0, hp:20, b:2 });
def(MAT.GOLD,  { n:'金矿',   c:0, hp:110, r:1 });
def(MAT.METAL, { n:'金属',   c:0, hp:170, r:1 });
def(MAT.BED,   { n:'基岩',   c:0, hp:65535, r:1 });
def(MAT.SACRED,{ n:'圣山岩', c:0, hp:300, r:1 });
def(MAT.GLASS, { n:'玻璃',   c:0, hp:9,  r:1 });
def(MAT.ICE,   { n:'冰',     c:0, hp:16 });
def(MAT.SNOW,  { n:'雪',     c:1, d:22,  hp:5 });
def(MAT.FUNG,  { n:'菌毯',   c:0, hp:13, b:2 });
def(MAT.MUSH,  { n:'发光蕈', c:0, hp:10, b:3, l:4 });
def(MAT.TOXD,  { n:'毒泥',   c:0, hp:17, b:1 });
def(MAT.LAMP,  { n:'灯柱',   c:0, hp:26, l:5 });
def(MAT.TNT,   { n:'不稳定晶', c:0, hp:8, b:4 });
def(MAT.WATER, { n:'水',     c:2, d:100, hp:2, frz:1 });
def(MAT.OIL,   { n:'油',     c:2, d:79,  hp:2, b:3 });
def(MAT.LAVA,  { n:'熔岩',   c:2, d:135, hp:6, e:1, l:3, dm:60 });
def(MAT.BLOOD, { n:'血',     c:2, d:106, hp:2, b:1, dm:1 });
def(MAT.SLIME, { n:'菌浆',   c:2, d:92,  hp:2, b:2, tox:1, dm:3 });
def(MAT.ACID,  { n:'酸液',   c:2, d:112, hp:2, l:6, dm:12 });
def(MAT.SLUDGE,{ n:'浊水',   c:2, d:103, hp:2 });
def(MAT.PGAS,  { n:'毒气',   c:3, hp:1, dm:9, tox:1 });
def(MAT.FIRE,  { n:'火',     c:4, hp:1, b:0, e:1, l:2 });
def(MAT.SMOKE, { n:'烟',     c:3, hp:1 });
def(MAT.STEAM, { n:'蒸汽',   c:3, hp:1 });
def(MAT.FGAS,  { n:'可燃气', c:3, hp:1, b:4 });
def(MAT.ASH,   { n:'灰烬',   c:1, d:55,  hp:2 });
def(MAT.GUNP,  { n:'火药',   c:1, d:150, hp:3, b:4 });

const LIQ  = new Uint8Array(NMAT), POW = new Uint8Array(NMAT), GAS = new Uint8Array(NMAT), SOLID = new Uint8Array(NMAT);
for (let m = 1; m < NMAT; m++) { const c = M_CLS[m]; if (c === 2) LIQ[m] = 1; else if (c === 1) POW[m] = 1; else if (c === 3) GAS[m] = 1; else if (c === 0) SOLID[m] = 1; }
const blocksMove = m => SOLID[m] === 1;                 // static solids stop flow/projectiles
const penetrable = m => !SOLID[m];                       // gases/liquids/fire don't block motion

// light emitter kinds: id -> {col rgb, radius, intensity}
const LIGHTS = [
  { r:0, g:0, b:0, rad:0, i:0 },
  { r:0, g:0, b:0, rad:0, i:0 },
  { r:255, g:150, b: 44, rad:14, i:0.85, flick:1 },   // fire
  { r:255, g:100, b: 26, rad:26, i:1.05, flick:1 },   // lava
  { r:120, g:255, b:190, rad:16, i:0.7 },              // glowshroom
  { r:255, g:205, b:120, rad:30, i:0.95 },             // lamp post
  { r:190, g:255, b:110, rad:10, i:0.5, flick:1 },     // acid glow
];

/* --------------------------------------------------------------- palette -- */
// 4 mottled shades per material + surface highlight, as [r,g,b]
const PAL = new Uint32Array(NMAT * 8);                 // [m*8 + 0..5 shades, 6=surface, 7=rim]
function rgb(r, g, b) { return (255 << 24) | (b << 16) | (g << 8) | r; }
(function buildPalette() {
  const P = {
    AIR:[[5,6,11],[8,9,16],[4,5,9],[10,12,20],[6,8,14]], ROCK:[[64,66,76],[74,77,88],[52,54,64],[83,84,98],[70,72,84]],
    DIRT:[[86,64,48],[100,74,54],[70,52,40],[112,86,62],[92,70,52]],
    SAND:[[158,128,80],[176,146,92],[140,112,68],[190,160,104],[166,136,86]],
    STONE:[[102,104,112],[118,120,128],[88,90,100],[130,132,140],[110,112,120]],
    WOOD:[[114,78,50],[132,92,58],[94,64,42],[144,104,66],[120,84,54]],
    COAL:[[44,42,52],[58,55,66],[34,32,42],[66,62,76],[48,46,56]],
    GOLD:[[186,146,52],[222,182,80],[150,112,36],[244,214,120],[196,156,60]],
    METAL:[[112,118,130],[130,138,150],[92,98,110],[148,156,168],[118,124,136]],
    BED:[[26,24,32],[32,30,38],[20,19,26],[36,34,44],[28,26,34]],
    SACRED:[[152,142,120],[172,162,138],[128,118,100],[190,182,158],[158,148,126]],
    GLASS:[[120,160,180],[140,180,200],[100,140,164],[160,200,216],[128,168,188]],
    ICE:[[128,168,196],[150,190,214],[106,148,180],[176,212,232],[138,178,204]],
    SNOW:[[208,218,228],[226,234,242],[190,202,216],[238,244,250],[214,224,234]],
    FUNG:[[64,88,56],[78,106,66],[52,72,46],[92,122,76],[70,94,60]],
    MUSH:[[86,190,158],[110,222,182],[62,158,132],[150,246,210],[96,202,170]],
    TOXD:[[92,112,56],[108,130,66],[74,92,46],[124,146,80],[100,120,60]],
    LAMP:[[120,96,66],[136,110,76],[100,80,56],[150,122,86],[126,102,72]],
    TNT:[[176,84,96],[198,102,112],[150,66,80],[220,130,138],[184,92,102]],
    WATER:[[36,86,128],[44,102,148],[30,72,110],[56,122,168],[40,92,136]],
    OIL:[[96,72,44],[112,86,52],[80,60,36],[126,98,62],[102,78,48]],
    LAVA:[[236,110,30],[255,140,44],[196,76,18],[255,180,70],[228,104,28]],
    BLOOD:[[158,38,52],[180,48,62],[130,28,42],[200,70,80],[166,42,56]],
    SLIME:[[96,168,74],[116,190,88],[76,142,58],[138,210,106],[106,178,80]],
    ACID:[[140,208,74],[162,228,92],[118,180,60],[188,244,120],[150,216,82]],
    SLUDGE:[[70,84,72],[82,98,84],[58,70,60],[96,112,96],[76,90,78]],
    PGAS:[[86,140,72],[100,158,84],[72,120,62],[116,176,100],[92,148,76]],
    FIRE:[[255,214,110],[255,168,56],[255,120,34],[255,236,170],[255,190,70]],
    SMOKE:[[92,92,104],[106,106,118],[78,78,90],[120,120,132],[98,98,110]],
    STEAM:[[168,186,196],[186,202,212],[150,168,180],[204,220,228],[176,194,204]],
    FGAS:[[150,190,110],[162,204,122],[138,176,98],[176,218,138],[156,196,116]],
    ASH:[[88,82,80],[100,94,90],[74,70,68],[112,106,100],[92,86,84]],
    GUNP:[[184,170,120],[204,188,136],[160,148,102],[222,206,156],[192,178,126]],
  };
  for (const k in P) {
    const id = MAT[k]; const arr = P[k];
    for (let i = 0; i < 5; i++) PAL[id * 8 + i] = rgb(arr[i][0], arr[i][1], arr[i][2]);
    const base = arr[0];
    PAL[id * 8 + 5] = PAL[id * 8 + 4];
    const s = base.map(c => Math.min(255, c * 1.55 + 26) | 0);
    const r = base.map(c => Math.max(0, c * 0.55) | 0);
    PAL[id * 8 + 6] = rgb(s[0], s[1], s[2]);   // surface highlight (liquid top)
    PAL[id * 8 + 7] = rgb(r[0], r[1], r[2]);    // rim / bottom shade
  }
})();

/* --------------------------------------------------------------- helpers -- */
// DYN[m]: material participates in the per-frame sim pass. Rows keep a count of
// dynamic cells so static strata cost one integer test per row and nothing else.
const DYN = new Uint8Array(NMAT);
for (let m = 0; m < NMAT; m++) DYN[m] = (M_CLS[m] >= 1) ? 1 : 0;
const rowActive = new Int32Array(H + 2);
const idx = (x, y) => y * W + x;
const inB = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
function get(x, y) { return inB(x, y) ? cells[idx(x, y)] : MAT.BED; }
// every world mutation routes through these so rowActive stays exact:
function setM(x, y, m) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = y * W + x, old = cells[i];
  if (old === m && aux[i] === 0) return;
  cells[i] = m; aux[i] = 0;
  if (old && DYN[old]) rowActive[y]--; if (DYN[m]) rowActive[y]++;
}
function setML(x, y, m, life) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = y * W + x, old = cells[i];
  cells[i] = m; aux[i] = life | 0;
  if (old && DYN[old]) rowActive[y]--; if (DYN[m]) rowActive[y]++;
}
function swapCells(i, j) {
  const ci = cells[i], cj = cells[j];
  const ai = aux[i], aj = aux[j];
  cells[i] = cj; cells[j] = ci; aux[i] = aj; aux[j] = ai;
  const yi = (i / W) | 0, yj = (j / W) | 0;
  if (DYN[cj] && !DYN[ci]) rowActive[yi]++; else if (!DYN[cj] && DYN[ci]) rowActive[yi]--;
  if (DYN[ci] && !DYN[cj]) rowActive[yj]++; else if (!DYN[ci] && DYN[cj]) rowActive[yj]--;
}

/* ------------------------------------------------------------------ audio -- */
const AU = { ac: null, master: null, nb: null, ambG: null, ambSrc: null, on: true };
function audioInit() {
  if (AU.ac) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    AU.ac = new AC();
    AU.master = AU.ac.createGain(); AU.master.gain.value = .6; AU.master.connect(AU.ac.destination);
    const n = AU.ac.sampleRate * 2, b = AU.ac.createBuffer(1, n, AU.ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
    AU.nb = b;
    const src = AU.ac.createBufferSource(); src.buffer = b; src.loop = true;
    const lp = AU.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 90;
    const g = AU.ac.createGain(); g.gain.value = 0;
    src.connect(lp); lp.connect(g); g.connect(AU.master); src.start();
    AU.ambSrc = src; AU.ambG = g;
  } catch (e) { AU.on = false; }
}
function tone(f0, f1, dur, type, vol, delay = 0) {
  if (!AU.on || !AU.ac) return;
  const t = AU.ac.currentTime + delay;
  const o = AU.ac.createOscillator(), g = AU.ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + dur + .02);
}
function noiseHit(dur, cut, vol, q = 1) {
  if (!AU.on || !AU.nb) return;
  const t = AU.ac.currentTime;
  const s = AU.ac.createBufferSource(); s.buffer = AU.nb; s.playbackRate.value = 1 + Math.random() * .5;
  const f = AU.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = cut; f.Q.value = q;
  const g = AU.ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(AU.master); s.start(t, Math.random()); s.stop(t + dur + .02);
}
const SFX = {
  castBolt:  () => { tone(880, 420, .09, 'square', .05); noiseHit(.05, 2600, .04); },
  castFire:  () => { tone(300, 90, .14, 'sawtooth', .05); noiseHit(.12, 900, .06, .8); },
  castBomb:  () => { tone(220, 140, .1, 'triangle', .06); },
  castDrill: () => { tone(140, 190, .18, 'square', .04); noiseHit(.18, 700, .05, 2); },
  castFrost: () => { tone(1400, 2200, .1, 'sine', .05); noiseHit(.08, 4200, .05, 3); },
  castAcid:  () => { tone(210, 90, .16, 'sawtooth', .05); noiseHit(.14, 500, .07, .6); },
  hitFlesh:  () => { noiseHit(.06, 420, .12, .7); tone(140, 60, .07, 'triangle', .1); },
  hitStone:  () => { noiseHit(.045, 1800, .08, 2); },
  hitMetal:  () => { tone(2100, 1400, .05, 'square', .045); noiseHit(.04, 3200, .05, 4); },
  boom:      s => { const v = clamp(s / 40, .12, .9); noiseHit(.5 * v + .18, 240, .34 * v, .5); tone(110, 28, .5 * v + .12, 'sine', .32 * v); tone(46, 20, .8, 'triangle', .2 * v); },
  hurt:      () => { tone(220, 80, .18, 'sawtooth', .12); noiseHit(.1, 300, .14, .6); },
  burnHurt:  () => { noiseHit(.2, 650, .08, .8); tone(140, 90, .2, 'sawtooth', .06); },
  die:       () => { tone(180, 40, 1.6, 'sawtooth', .14); tone(90, 30, 2.2, 'sine', .12); noiseHit(1.2, 160, .1, .5); },
  pickup:    () => { tone(660, 990, .07, 'square', .05); },
  coin:      () => { tone(1900, 2400, .05, 'sine', .05); tone(2400, 3100, .06, 'sine', .045, .05); },
  heal:      () => { tone(520, 780, .12, 'triangle', .07); tone(780, 1040, .14, 'triangle', .06, .1); },
  open:      () => { noiseHit(.22, 500, .08, 1); tone(160, 260, .12, 'triangle', .05); },
  bench:     () => { tone(1200, 1600, .04, 'square', .04); },
  freeze:    () => { noiseHit(.12, 5200, .05, 5); tone(2200, 3400, .08, 'sine', .04); },
  splash:    () => { noiseHit(.1, 900, .05, .8); },
  click:     () => { tone(900, 700, .03, 'square', .03); },
  err:       () => { tone(160, 120, .08, 'square', .05); },
  perk:      () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, .16, 'triangle', .07, i * .09)); },
  win:       () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, .3, 'triangle', .08, i * .13)); },
  trigger:   () => { tone(500, 900, .06, 'square', .05); },
  blink:     () => { tone(240, 1900, .12, 'sine', .06); noiseHit(.08, 3000, .04, 2); },
};

/* ----------------------------------------------------------------- input -- */
const keys = Object.create(null);
const pointer = { x: VW / 2, y: VH / 2, down: false, has: false };
let aimX = VW / 2, aimY = VH / 2;             // world-space aim (updated each frame from screen space)
const input = { left: false, right: false, jump: false, jumpEdge: false, use: false, useEdge: false, fire: false };
function bindKey(e, down) {
  const k = e.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'a', 'd', 'w', 's'].includes(k)) e.preventDefault?.();
  if (down && keys[k]) return;
  keys[k] = down;
  if (down && k === '1') hudSelectWand(0);
  if (down && k === '2') hudSelectWand(1);
  if (down && k === '3') hudSelectWand(2);
  if (down && k === '4') hudSelectWand(3);
  if (down && k === 'q') hudSelectWand(G.curWand - 1);
  if (down && (k === 'e')) tryInteractEdge();
  if (down && (k === 'tab')) { e.preventDefault?.(); tryBenchEdge(); }
  input.left = keys['a'] || keys['arrowleft'];
  input.right = keys['d'] || keys['arrowright'];
  if (down && (k === 'w' || k === ' ' || k === 'arrowup')) input.jumpEdge = true;
  input.jump = keys['w'] || keys[' '] || keys['arrowup'];
}
window.addEventListener('keydown', e => bindKey(e, true));
window.addEventListener('keyup', e => bindKey(e, false));
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: clamp((e.clientX - r.left) / r.width * VW, 0, VW - 1), y: clamp((e.clientY - r.top) / r.height * VH, 0, VH - 1) };
}
canvas.addEventListener('pointermove', e => { const p = canvasPoint(e); pointer.x = p.x; pointer.y = p.y; pointer.has = true; });
canvas.addEventListener('pointerdown', e => {
  audioInit();
  if (G.state !== 'play') return;
  const p = canvasPoint(e); pointer.x = p.x; pointer.y = p.y; pointer.has = true;
  pointer.down = true; input.fire = true;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
});
window.addEventListener('pointerup', () => { pointer.down = false; if (!touch.on) input.fire = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); hudSelectWand(G.curWand + (e.deltaY > 0 ? 1 : -1)); }, { passive: false });

const touch = { on: false, moveId: -1 };
function bindTouchBtn(id, set) {
  const b = $(id); if (!b) return;
  b.addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); touch.on = true; set(true, e); });
  b.addEventListener('pointerup', e => { e.preventDefault(); set(false, e); });
  b.addEventListener('pointercancel', () => set(false));
  b.addEventListener('pointerleave', () => set(false));
}
bindTouchBtn('tLeft', d => input.left = d);
bindTouchBtn('tRight', d => input.right = d);
bindTouchBtn('tJump', (d, e) => { input.jump = d; if (d) input.jumpEdge = true; });
bindTouchBtn('tFire', d => { touch.on = d; input.fire = d; });
bindTouchBtn('tWand', d => { if (d) hudSelectWand(G.curWand + 1); });
bindTouchBtn('tUse', d => { if (d) tryInteractEdge(); });

/* ========================================================================== *
 *  GLOBAL STATE
 * ========================================================================== */
const G = {
  state: 'title',            // title | play | dead | win | panel
  seed: 0, frame: 0, t: 0,
  camX: 0, camY: 0, shake: 0, flash: 0, slow: 0,
  kills: 0, gold: 0, maxDepth: 0, timeSec: 0,
  bossDown: false, curWand: 0,
  holyIdx: -1, sanctSeen: new Set(),
  perkRerolls: 0, deathReason: '', deathDetail: '',
  simMs: 0, fps: 0, _fpsAcc: 0, _fpsN: 0, _fpsT: 0,
};
let player = null;
const enemies = [];
const projectiles = [];
const pickups = [];
const parts = [];            // pooled particles {x,y,vx,vy,life,max,col,kind}
const fxQueue = [];          // deferred explosions
let partsHead = 0;
const MAX_PARTS = 900;
for (let i = 0; i < MAX_PARTS; i++) parts.push({ live: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, c: 0xffffff, g: 0, glow: 0, kind: 0 });

function recountRows() {
  rowActive.fill(0);
  for (let y = 0; y < H; y++) {
    let n = 0; const base = y * W;
    for (let x = 0; x < W; x++) if (DYN[cells[base + x]]) n++;
    rowActive[y] = n;
  }
}

/* ========================================================================== *
 *  PIXEL SIMULATION
 * ========================================================================== */
const FLOW = new Uint8Array(NMAT);   // max horizontal flow steps for liquids
FLOW[MAT.WATER] = 4; FLOW[MAT.SLUDGE] = 3; FLOW[MAT.BLOOD] = 3; FLOW[MAT.OIL] = 3;
FLOW[MAT.ACID] = 4; FLOW[MAT.SLIME] = 1; FLOW[MAT.LAVA] = 1;
const QUENCH = new Uint8Array(NMAT); // puts out fire, makes steam
QUENCH[MAT.WATER] = 1; QUENCH[MAT.SLUDGE] = 1; QUENCH[MAT.ICE] = 1; QUENCH[MAT.SNOW] = 1;
const ACID_EAT = { [MAT.WOOD]: 6, [MAT.FUNG]: 6, [MAT.MUSH]: 6, [MAT.COAL]: 5, [MAT.DIRT]: 5, [MAT.TOXD]: 5, [MAT.SAND]: 4, [MAT.ASH]: 4, [MAT.SNOW]: 5, [MAT.ICE]: 5, [MAT.GUNP]: 8, [MAT.ROCK]: 2, [MAT.METAL]: 1, [MAT.GOLD]: 1, [MAT.SACRED]: 0, [MAT.STONE]: 1, [MAT.TNT]: 7, [MAT.LAMP]: 5 };

function spawnPart(x, y, vx, vy, life, col, opts = {}) {
  let best = null;
  for (let n = 0; n < MAX_PARTS; n++) {
    const p = parts[(partsHead + n) % MAX_PARTS];
    if (!p.live) { best = p; partsHead = (partsHead + n + 1) % MAX_PARTS; break; }
  }
  if (!best) { best = parts[partsHead]; partsHead = (partsHead + 1) % MAX_PARTS; }
  best.live = true; best.x = x; best.y = y; best.vx = vx; best.vy = vy;
  best.life = best.max = life; best.c = col;
  best.g = opts.g != null ? opts.g : .06; best.glow = opts.glow ? 1 : 0; best.kind = opts.kind || 0;
}
function sparkBurst(x, y, n, col, spd, glow = 1, grav = .06) {
  for (let i = 0; i < n; i++) {
    const a = mrnd() * Math.PI * 2, s = spd * (.3 + mrnd() * .7);
    spawnPart(x, y, Math.cos(a) * s, Math.sin(a) * s - .3, 14 + mrnd() * 26, col, { g: grav, glow });
  }
}

function igniteAt(x, y) {
  const m = get(x, y);
  if (m === MAT.TNT) { const i = idx(x, y); if (aux[i] < 20) aux[i] = 26 + mri(0, 20); return; }
  if (m === MAT.GUNP) { fxQueue.push({ x: x + .5, y: y + .5, r: 15, e: 260, d: 24, fire: 1, depth: 0 }); setM(x, y, MAT.AIR); return; }
  if (m === MAT.FGAS) { setML(x, y, MAT.FIRE, 60 + mri(0, 40)); return; }
  if (M_BURN[m] > 0 && m !== MAT.FIRE) {
    setML(x, y, MAT.FIRE, 50 + mri(0, 70));
    if (m === MAT.WOOD && mrnd() < .22) { /* keeps burning as fire replaces it */ }
  }
}
function placeFire(x, y, life) {
  const m = get(x, y);
  if (m === MAT.AIR || GAS[m]) { setML(x, y, MAT.FIRE, life || 40 + mri(0, 40)); return true; }
  if (M_BURN[m] > 0) { igniteAt(x, y); return true; }
  return false;
}

/* -------- explosions: ray-energy carving, exactly the Noita model -------- */
function explode(wx, wy, rad, energy, dmg, opts = {}) {
  const queue = [{ x: wx, y: wy, r: rad, e: energy, d: dmg, fire: opts.fire !== 0 ? 1 : 0, depth: 0, big: opts.big }];
  const doOne = ev => {
    G.shake = Math.min(26, G.shake + ev.r * (ev.big ? .7 : .38));
    G.flash = Math.min(1, G.flash + ev.r / 70);
    SFX.boom(ev.r);
    const cx = ev.x | 0, cy = ev.y | 0;
    const nRays = 12;
    for (let k = 0; k < nRays; k++) {
      const a = (k / nRays) * Math.PI * 2 + mrnd() * .5;
      const dx = Math.cos(a), dy = Math.sin(a);
      let e = ev.e, x = cx, y = cy;
      for (let s = 0; s < ev.r; s++) {
        x = (cx + dx * s) | 0; y = (cy + dy * s) | 0;
        if (!inB(x, y)) break;
        const i = idx(x, y), m = cells[i];
        if (m === MAT.BED || m === MAT.SACRED) { e -= 300; if (e < 0) break; continue; }
        if (SOLID[m]) {
          e -= M_HP[m];
          if (e < 0) break;
          cells[i] = MAT.AIR; aux[i] = 0; if (DYN[m]) rowActive[y]--;
          if ((m === MAT.ROCK || m === MAT.STONE) && mrnd() < .16) { const ri = idx(x, y - 1); if (cells[ri] === MAT.AIR) { cells[ri] = MAT.SAND; rowActive[y - 1]++; } }
          if (m === MAT.TNT) { aux[i] = 8 + mri(0, 8); }         // chain, tiny fuse
          if (m === MAT.GLASS && mrnd() < .5) continue;
        } else if (m === MAT.GUNP) {
          cells[i] = MAT.AIR; rowActive[y]--;
          queue.push({ x: x + .5, y: y + .5, r: 16, e: 240, d: 20, fire: 1, depth: ev.depth + 1 });
        } else if (LIQ[m]) {
          if (m === MAT.OIL && ev.fire && mrnd() < .5) { cells[i] = MAT.FIRE; aux[i] = 70; rowActive[y]++; }
          else if (QUENCH[m] && mrnd() < .4) { cells[i] = MAT.STEAM; aux[i] = 90; rowActive[y]++; }
        } else if (m === MAT.FGAS) {
          if (ev.fire && queue.length < 26) { cells[i] = MAT.FIRE; aux[i] = 60; }
        } else if (m === MAT.FIRE) { /* fire passes */ }
        else if (ev.fire && M_BURN[cells[i]] && mrnd() < .12) igniteAt(x, y);
        if (ev.fire && mrnd() < .22) placeFire(x, y + (dy > 0 ? -1 : -2), 34 + mri(0, 30));
      }
    }
    // visual/audio/particle feedback
    for (let n = 0; n < Math.min(34, ev.r); n++) {
      const a = mrnd() * Math.PI * 2, d = mrnd() * ev.r * .8;
      spawnPart(ev.x + Math.cos(a) * d, ev.y + Math.sin(a) * d, Math.cos(a) * .8, Math.sin(a) * .8 - .2, 16 + mri(0, 20), 0xffc45e, { glow: 1 });
    }
    for (let n = 0; n < Math.min(12, ev.r / 2 | 0); n++)
      spawnPart(ev.x + (mrnd() - .5) * ev.r, ev.y + (mrnd() - .5) * ev.r, (mrnd() - .5) * .5, -.4 - mrnd() * .4, 30 + mri(0, 40), 0x8c8c9b, { g: -.004 });
    // entity damage with falloff
    const hit = e2 => {
      const d = Math.hypot(e2.x - ev.x, e2.y - ev.y);
      if (d < ev.r * .9) hurtEntity(e2, Math.max(1, ev.d * (1 - d / (ev.r * .95))), 'explosion', '爆炸');
    };
    enemies.forEach(hit);
    if (G.bossDown === false && bossEnt) hit(bossEnt);
    hit(player);
    // chests & props
    pickups.forEach(p => { if (p.kind === 'chest' && Math.hypot(p.x - ev.x, p.y - ev.y) < ev.r * .9) breakChest(p, true); });
  };
  while (queue.length) {
    const ev = queue.pop();
    if (ev.depth > 8) continue;
    doOne(ev);
  }
}

/* carve a straight dig line (drills/bullets); returns hit info */
function digRay(px, py, nx, ny, energy) {
  const x = px | 0, y = py | 0;
  if (!inB(x, y)) return { stop: true, consumed: 0 };
  const i = idx(x, y), m = cells[i];
  if (SOLID[m]) {
    if (m === MAT.BED || m === MAT.SACRED) return { stop: true, cell: i, m, consumed: 1e9 };
    const cost = M_HP[m] * .8;
    if (energy <= cost) return { stop: true, cell: i, m, consumed: cost };
    cells[i] = MAT.AIR; aux[i] = 0; if (DYN[m]) rowActive[y]--;
    if ((m === MAT.ROCK || m === MAT.DIRT) && mrnd() < .12) { const ri = idx(x, y - 1); if (get(x, y - 1) === MAT.AIR) { cells[ri] = MAT.SAND; rowActive[y - 1]++; } }
    if (m === MAT.GLASS) sparkBurst(x + .5, y + .5, 4, 0xbfe6f2, .6, 1, .1);
    if (m === MAT.TNT) aux[i] = 10;
    if (m === MAT.METAL || m === MAT.GOLD) sparkBurst(x + .5, y + .5, 2, 0xd9c68a, .5, 1, .08);
    return { stop: false, broke: true, m, consumed: cost };
  }
  return { stop: false, m, consumed: 0 };
}

/* ============================ main sim pass ============================== */
function simStep() {
  const f = G.frame;
  const top = clamp((G.camY | 0) - 42, 0, H - 2);
  const bot = clamp((G.camY | 0) + VH + 42, 0, H);
  const bottomUp = (f & 1) === 0;
  let budgetCells = 42000;
  for (let ry = 0; ry < VH + 88 && budgetCells > 0; ry++) {
    const y = bottomUp ? bot - 1 - ry : top + ry;
    if (y < 1 || y >= H - 1) continue;
    if (rowActive[y] === 0) continue;
    const rowBase = y * W;
    const ltr = ((y + (bottomUp ? 0 : 1) + (f >> 1)) & 1) === 0;
    for (let rx = 0; rx < W; rx++) {
      const x = ltr ? rx : W - 1 - rx;
      const i = rowBase + x;
      const m = cells[i];
      if (!DYN[m]) continue;
      budgetCells--;
      stepCell(x, y, i, m, f);
    }
  }
}

function stepCell(x, y, i, m, f) {
  const cls = M_CLS[m];
  if (cls === 4) { stepFire(x, y, i, f); return; }
  if (cls === 2) { stepLiquid(x, y, i, m, f); return; }
  if (cls === 1) { stepPowder(x, y, i, m, f); return; }
  stepGas(x, y, i, m, f);
}

/* ------------------------------- fire ------------------------------------ */
function stepFire(x, y, i, f) {
  if (aux[i] > 0) aux[i]--;
  // 4-neighbour scan: quenching, melting, spreading — one shared loop
  const r = mrnd();
  for (let k = 0; k < 4; k++) {
    const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
    if (!inB(nx, ny)) continue;
    const j = idx(nx, ny), nm = cells[j];
    if (QUENCH[nm]) {                      // water/sludge kills this flame → steam
      cells[i] = MAT.STEAM; aux[i] = 70 + mri(0, 40);
      return;
    }
    if (nm === MAT.SNOW) { cells[j] = MAT.WATER; continue; }
    if (nm === MAT.ICE && mrnd() < .4) { cells[j] = MAT.WATER; continue; }
    const b = M_BURN[nm];
    if (!b) continue;
    if (b === 4) { igniteAt(nx, ny); continue; }
    if (mrnd() < (b === 3 ? .10 : b === 2 ? .055 : b === 1 ? .004 : .004)) igniteAt(nx, ny);
  }
  // fire on top of a flammable liquid (oil) consumes it
  const below = y + 1 < H ? cells[i + W] : MAT.BED;
  if (below === MAT.OIL) { if (mrnd() < .02) { cells[i + W] = MAT.AIR; rowActive[y + 1]--; aux[i] = 255; } }
  // fire licks upward & sideways into free space above flames
  if (y > 0 && aux[i] > 30 && mrnd() < .06 && cells[i - W] === MAT.AIR) {
    // only near fuels, else flames die naturally: check any flammable within 1
    let nearFuel = false;
    for (let dy2 = 0; dy2 <= 1 && !nearFuel; dy2++)
      for (let dx2 = -1; dx2 <= 1 && !nearFuel; dx2++) {
        const nm = get(x + dx2, y + dy2);
        if (M_BURN[nm] > 0) nearFuel = true;
      }
    if (nearFuel) setML(x, y - 1, MAT.FIRE, 24 + mri(0, 18));
  }
  // burn out → smoke / ash / air
  if (aux[i] <= 0) {
    const r2 = mrnd();
    if (r2 < .3) { cells[i] = MAT.SMOKE; aux[i] = 140 + mri(0, 90); }
    else if (r2 < .5 && y + 1 < H && SOLID[cells[i + W]]) { cells[i] = MAT.ASH; aux[i] = 0; }
    else { cells[i] = MAT.AIR; aux[i] = 0; rowActive[y]--; }
  } else if (mrnd() < .04) {
    spawnPart(x + mrnd(), y + mrnd(), (mrnd() - .5) * .2, -.3 - mrnd() * .4, 10 + mri(0, 14), mrnd() < .5 ? 0xff9b3f : 0xffd36b, { g: -.008, glow: 1 });
  }
}

/* ------------------------------ liquids ---------------------------------- */
function stepLiquid(x, y, i, m, f) {
  const den = M_DEN[m];
  const lava = m === MAT.LAVA, acid = m === MAT.ACID;
  // --- reactions with immediate neighbours
  const n4 = [y > 0 ? i - W : -1, y + 1 < H ? i + W : -1, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1];
  const ny4 = [y - 1, y + 1, y, y];
  const nx4 = [x, x, x - 1, x + 1];
  for (let k = 0; k < 4; k++) {
    const j = n4[k]; if (j < 0) continue;
    const nm = cells[j];
    if (lava) {
      if (nm === MAT.WATER || nm === MAT.SLUDGE || nm === MAT.ICE || nm === MAT.SNOW) {
        cells[j] = MAT.STEAM; aux[j] = 110 + mri(0, 60);   // liquid→gas: both dynamic, count unchanged
        cells[i] = (nm === MAT.ICE || nm === MAT.SNOW) ? MAT.STONE : MAT.ROCK;
        aux[i] = 0; rowActive[y]--;                          // lava was dynamic, rock is not
        sparkBurst(x + .5, y + .5, 3, 0xfff2c4, .5, 1, .02);
        if (mrnd() < .35) SFX.splash();
        return;
      }
      if (nm === MAT.BLOOD && mrnd() < .02) { cells[j] = MAT.STEAM; aux[j] = 90; cells[i] = MAT.ROCK; rowActive[y]--; return; }
      if (nm === MAT.PGAS && mrnd() < .03) { cells[j] = MAT.SMOKE; aux[j] = 90; }
    }
    if (acid && nm !== MAT.ACID && !M_RES[nm] && (SOLID[nm] || nm === MAT.FUNG || nm === MAT.TOXD)) {
      const p = (ACID_EAT[nm] || 1) * .006;
      if (mrnd() < p) {
        if (nm === MAT.TNT) { aux[j] = 14; }
        else { cells[j] = MAT.AIR; rowActive[ny4[k]]--; if (mrnd() < .18) setML(nx4[k], ny4[k], MAT.PGAS, 200 + mri(0, 90)); }
        if (mrnd() < .3) { cells[i] = MAT.AIR; aux[i] = 0; rowActive[y]--; return; }
      }
      continue;
    }
    if ((nm === MAT.FIRE || nm === MAT.LAVA) && M_BURN[m] > 0) { igniteAt(x, y + (nm === MAT.FIRE ? -1 : 0) * (mrnd() < .8 ? -1 : 1)); }
    if (m === MAT.SLIME && nm === MAT.WATER && mrnd() < .008) { cells[i] = MAT.SLUDGE; return; }
  }
  // lava ignites flammables above / around
  if (lava && mrnd() < .05) {
    const tx = x + mri(-1, 1), ty = y - 1;
    if (inB(tx, ty) && M_BURN[cells[idx(tx, ty)]] === 4) igniteAt(tx, ty);
    else if (inB(tx, ty) && cells[idx(tx, ty)] === MAT.AIR && mrnd() < .06) setML(tx, ty, MAT.FIRE, 30 + mri(0, 30));
    const sx = x + (mrnd() < .5 ? 1 : -1);
    if (inB(sx, y - 1) && M_BURN[cells[idx(sx, y - 1)]] > 0 && mrnd() < .2) igniteAt(sx, y - 1);
  }
  // --- motion
  const bd = y + 1 < H ? i + W : -1;
  let bm = bd >= 0 ? cells[bd] : MAT.BED;
  if (bm === MAT.AIR || GAS[bm]) { if (mrnd() < .86 || bm !== MAT.AIR) { swapCells(i, bd); return; } }
  else if (LIQ[bm] && M_DEN[bm] < den) { swapCells(i, bd); return; }
  else if (bm === MAT.FIRE && QUENCH[m]) { cells[bd] = MAT.STEAM; aux[bd] = 90; }
  // diagonals down
  const dir = ((x + y + f) & 1) ? 1 : -1;
  for (let s = 0; s < 2; s++) {
    const d = s === 0 ? dir : -dir, nx = x + d;
    if (nx < 0 || nx >= W || y + 1 >= H) continue;
    const j = idx(nx, y + 1), jm = cells[j];
    if (jm === MAT.AIR || GAS[jm]) { swapCells(i, j); return; }
    if (LIQ[jm] && M_DEN[jm] < den) { swapCells(i, j); return; }
  }
  // flat flow
  maybeFlowSide(x, y, i, m, dir, f);
}
function maybeFlowSide(x, y, i, m, dir, f) {
  const steps = FLOW[m];
  if (!steps) return;
  let best = -1;
  const canFall = nx => { const j = idx(nx, y + 1); return y + 1 < H && cells[j] === MAT.AIR; };
  for (let s = 0; s < 2; s++) {
    const d = s === 0 ? dir : -dir;
    for (let k = 1; k <= steps; k++) {
      const nx = x + d * k;
      if (nx < 0 || nx >= W) break;
      const j = idx(nx, y), jm = cells[j];
      if (jm !== MAT.AIR && !GAS[jm]) break;
      best = j;
      if (canFall(nx)) { best = idx(nx, y); break; }
    }
  }
  if (best >= 0 && mrnd() < .9) { const cur = idx(x, y); if (cells[cur] === m) swapCells(cur, best); }
}

/* ------------------------------ powders ----------------------------------- */
function stepPowder(x, y, i, m, f) {
  const den = M_DEN[m];
  if (m === MAT.SNOW && y > 0 && mrnd() < .004 && cells[idx(x, y - 1)] === MAT.FIRE) { cells[i] = MAT.WATER; rowActive[y]++; return; }
  if (m === MAT.SNOW && y + 1 < H) {
    const bm = cells[idx(x, y + 1)];
    if (bm === MAT.LAVA) { cells[i] = MAT.WATER; rowActive[y]++; return; }
  }
  const bd = y + 1 < H ? i + W : -1;
  const bm = bd >= 0 ? cells[bd] : MAT.BED;
  if (bm === MAT.AIR || GAS[bm]) { swapCells(i, bd); return; }
  if (LIQ[bm] && M_DEN[bm] < den && mrnd() < .8) { swapCells(i, bd); return; }
  const dir = ((x * 7 + y + f) & 3) < 2 ? 1 : -1;
  for (let s = 0; s < 2; s++) {
    const d = s === 0 ? dir : -dir, nx = x + d;
    if (nx < 0 || nx >= W || y + 1 >= H) continue;
    const j = idx(nx, y + 1), jm = cells[j];
    if (jm === MAT.AIR || (GAS[jm] && mrnd() < .5)) { swapCells(i, j); return; }
  }
  if (m === MAT.GUNP && y > 0 && cells[idx(x, y - 1)] === MAT.FIRE) { explode(x + .5, y + .5, 15, 260, 22, { fire: 1 }); }
  if (m === MAT.GUNP) { for (let k = 0; k < 2; k++) { const j2 = y * W + x + (k ? 1 : -1); if (cells[j2] === MAT.FIRE) { explode(x + .5, y + .5, 15, 260, 22, { fire: 1 }); break; } } }
}

/* -------------------------------- gases ----------------------------------- */
function stepGas(x, y, i, m, f) {
  if (aux[i] > 0) { aux[i]--; if (aux[i] === 0 && m !== MAT.PGAS) { cells[i] = MAT.AIR; rowActive[y]--; return; } }
  if (m === MAT.PGAS) {
    if (aux[i] > 300) aux[i] = 300;
    if (aux[i] <= 0 && mrnd() < .01) { cells[i] = MAT.AIR; rowActive[y]--; return; }
  }
  if (m === MAT.FGAS) {
    const nbs = [i - 1, i + 1, i - W, i + W];
    for (const j of nbs) if (cells[j] === MAT.FIRE || cells[j] === MAT.LAVA) { igniteAt(x, y); return; }
  }
  if (m === MAT.STEAM && y > 0 && SOLID[cells[idx(x, y - 1)]] && mrnd() < .02) { cells[i] = MAT.WATER; rowActive[y]++; return; }
  const up = y > 1 ? i - W : -1;
  const um = up >= 0 ? cells[up] : MAT.BED;
  if (um === MAT.AIR) { if (mrnd() < .8) { swapCells(i, up); return; } }
  const dir = ((x + y * 3 + f) & 1) ? 1 : -1;
  const nu = y > 1, d1 = x + dir;
  if (nu && d1 >= 0 && d1 < W && cells[idx(d1, y - 1)] === MAT.AIR && mrnd() < .55) { swapCells(i, idx(d1, y - 1)); return; }
  if (x + dir >= 0 && x + dir < W) {
    const j = y * W + x + dir;
    if (cells[j] === MAT.AIR && mrnd() < .5) { swapCells(i, j); return; }
  }
  if (m === MAT.SMOKE && mrnd() < .006) { cells[i] = MAT.AIR; rowActive[y]--; }
}

/* --------------------------- ambient world ticks -------------------------- */
// sparse sampling of the visible band: seeping toxins, ice growth, snowmelt.
function ambientWorldTick() {
  const top = clamp((G.camY | 0) - 4, 1, H - 3), bot = clamp((G.camY | 0) + VH + 4, 2, H - 1);
  for (let n = 0; n < 110; n++) {
    const x = mri(1, W - 2), y = mri(top, bot - 1);
    const i = idx(x, y), m = cells[i];
    if (m === MAT.TOXD && cells[i - W] === MAT.AIR && mrnd() < .2) {
      const j = i - W; cells[j] = MAT.PGAS; aux[j] = 240 + mri(0, 60); rowActive[y - 1]++;
    } else if (m === MAT.WATER) {
      const near = cells[i - 1] === MAT.ICE || cells[i + 1] === MAT.ICE || cells[i - W] === MAT.ICE;
      if (near && mrnd() < .05) { cells[i] = MAT.ICE; rowActive[y]--; }
      else if (cells[i + W] === MAT.LAVA || cells[i - W] === MAT.FIRE) { if (mrnd() < .12) { cells[i] = MAT.STEAM; aux[i] = 110; } }
    } else if (m === MAT.ICE) {
      if (cells[i - W] === MAT.LAVA || cells[i + W] === MAT.LAVA || cells[i - W] === MAT.FIRE || cells[i - 1] === MAT.ACID) { if (mrnd() < .15) { cells[i] = MAT.WATER; rowActive[y]++; } }
    } else if (m === MAT.SNOW) {
      if (cells[i + W] === MAT.LAVA && mrnd() < .25) { cells[i] = MAT.WATER; }
      else if (cells[i - 1] === MAT.WATER && mrnd() < .02) { cells[i] = MAT.WATER; }
    } else if (m === MAT.TNT && aux[i] > 0) {
      if (--aux[i] === 0) { explode(x + .5, y + .5, 26, 900, 60, { fire: 1, big: 1 }); sparkBurst(x, y, 8, 0xff9a4d, 1.2, 1); }
    } else if (m === MAT.FUNG && cells[i - W] === MAT.AIR && mrnd() < .004) {
      const j = i - W; cells[j] = MAT.PGAS; aux[j] = 150; rowActive[y - 1]++;
    } else if (m === MAT.BLOOD && cells[i - W] === MAT.FIRE) {
      cells[i - W] = MAT.SMOKE; aux[i - W] = 120;
    }
  }
}

/* ========================================================================== *
 *  BIOMES & WORLD GENERATION
 * ========================================================================== */
const BIOMES = [
  { key:'mines',  name:'矿坑',       rock:MAT.ROCK, amb:[26,30,44],    ambient:.105, liquid:MAT.WATER, liquidP:.05,  poolSize:.6,
    floor:MAT.DIRT, extra:'supports', enemies:{grub:.45, bat:.2, sniper:.25, boomer:.1}, tier:1, goldP:.010, coalP:.045, toxP:.004, fgasP:.01 },
  { key:'coal',   name:'煤坑',       rock:MAT.COAL, amb:[38,28,26],    ambient:.095, liquid:MAT.OIL,  liquidP:.07,  poolSize:.8,
    floor:MAT.DIRT, extra:'rail',     enemies:{grub:.3, bat:.15, sniper:.2, boomer:.25, worm:.1},  tier:2, goldP:.012, coalP:.12, toxP:.006, fgasP:.05 },
  { key:'fungal', name:'菌窟',       rock:MAT.FUNG, amb:[22,40,36],    ambient:.11,  liquid:MAT.SLIME,liquidP:.07,  poolSize:.7,
    floor:MAT.TOXD, extra:'shrooms',  enemies:{slimer:.3, bat:.2, spitter:.25, worm:.1, sniper:.15}, tier:3, goldP:.008, coalP:.03, toxP:.05,  fgasP:.02 },
  { key:'frost',  name:'冰渊',       rock:MAT.ICE,  amb:[40,58,86],    ambient:.115, liquid:MAT.WATER,liquidP:.06,  poolSize:.7,
    floor:MAT.SNOW, extra:'vault',    enemies:{sniper:.3, grub:.2, bat:.15, spitter:.15, boomer:.2},  tier:4, goldP:.010, coalP:.02, toxP:.01,  fgasP:.005 },
  { key:'magma',  name:'熔火之心',   rock:MAT.STONE,amb:[52,30,26],    ambient:.10, liquid:MAT.LAVA, liquidP:.11,  poolSize:1,
    floor:MAT.STONE,extra:'tntcaches',enemies:{sniper:.22, boomer:.2, grub:.18, spitter:.2, worm:.2}, tier:5, goldP:.016, coalP:.02, toxP:.01,  fgasP:.03 },
];
const BIOME_NAMES = BIOMES.map(b => b.name);
const BIOME_AMBIENT = BIOMES.map(b => b.ambient);

let worldSpawns = [];         // {x,y,band,type}
let sancts = [];              // {y0,y1, bench, fountain, altar, used}
let bossEnt = null;
let fountainPool = [];        // {x,y,r}
const lateCarves = [];        // shafts carved after all terrain fill so they survive

function carveRect(x0, y0, x1, y1, m) {
  x0 = clamp(x0 | 0, 0, W - 1); x1 = clamp(x1 | 0, 0, W - 1); y0 = clamp(y0 | 0, 0, H - 1); y1 = clamp(y1 | 0, 0, H - 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells[y * W + x] = m;
}
function rectFrame(x0, y0, x1, y1, m, th = 1) {
  for (let t = 0; t < th; t++) {
    carveRect(x0 - t, y0 - t, x1 + t, y0 - t, m); carveRect(x0 - t, y1 + t, x1 + t, y1 + t, m);
    carveRect(x0 - t, y0 - t, x0 - t, y1 + t, m); carveRect(x1 + t, y0 - t, x1 + t, y1 + t, m);
  }
}
const inBand = (y, band) => y >= band.y0 + 3 && y < band.y1 - 3;

function generateWorld() {
  noiseCache.clear(); rng = makeRng(G.seed);
  _h = (G.seed & 255) | 0;
  cells.fill(MAT.BED); aux.fill(0); seedN.fill(0);
  for (let i = 0; i < W * H; i++) seedN[i] = (hashXY(i % W, (i / W) | 0) & 63);
  worldSpawns = []; sancts = []; fountainPool = []; bossEnt = null;
  enemies.length = 0; projectiles.length = 0; pickups.length = 0;
  parts.forEach(p => p.live = false);

  /* ---- surface hub: the snowy peak & its sanctuary mouth ---- */
  const sky = BANDS[0];
  const heights = new Int16Array(W);
  G.surfH = heights;
  for (let x = 0; x < W; x++) {
    const hill = Math.max(0, 66 - Math.abs(x - W / 2) * .42) + fbm(x, 90, 3) * 26 - 8;
    heights[x] = clamp(Math.round(sky.y1 - hill), 40, sky.y1 - 4);
  }
  for (let x = 0; x < W; x++) {
    const hy = heights[x];
    for (let y = hy; y < H; y++) {
      let m;
      if (y < hy + 3) m = MAT.SNOW;
      else if (y < hy + 9) m = MAT.DIRT;
      else m = MAT.ROCK;
      cells[idx(x, y)] = m;
    }
  }
  // cavern room inside the peak: sanctuary 0 doubles as the start hub
  const hub = { x0: W / 2 - 84 | 0, x1: W / 2 + 84 | 0, y0: heights[W / 2 | 0] + 6, y1: heights[W / 2 | 0] + 46 };
  carveRect(hub.x0 + 1, hub.y0, hub.x1 - 1, hub.y1 - 1, MAT.AIR);
  rectFrame(hub.x0, hub.y0 - 1, hub.x1, hub.y1, MAT.SACRED, 2);
  // snow decor on roofline, entrance shaft from surface to hub ceiling
  carveRect(W / 2 - 4, heights[W / 2 | 0] - 1, W / 2 + 3, hub.y0 + 1, MAT.AIR);
  for (let y = hub.y0 - 8; y < hub.y1 - 4; y++) { cells[idx(W / 2 - 5, y)] = MAT.WOOD; cells[idx(W / 2 + 4, y)] = MAT.WOOD; }
  // a few trees
  for (let n = 0; n < 7; n++) {
    const tx = mri(40, W - 42); if (Math.abs(tx - W / 2) < 30) continue;
    const ty = heights[tx] - 1, hgt = mri(8, 14);
    for (let t = 1; t <= hgt; t++) cells[idx(tx, ty - t)] = MAT.WOOD;
    for (let dx2 = -3; dx2 <= 3; dx2++) for (let dy2 = -6; dy2 <= -2; dy2++)
      if (Math.abs(dx2) + Math.abs(dy2 + 4) < 5 && inB(tx + dx2, ty - hgt + dy2)) { const j = idx(tx + dx2, ty - hgt + dy2); if (cells[j] === MAT.AIR) cells[j] = mrnd() < .5 ? MAT.SNOW : MAT.FUNG; }
  }
  // torches in the hub + campfire
  for (const lx of [hub.x0 + 10, hub.x0 + 40, hub.x1 - 10, hub.x1 - 40]) { cells[idx(lx, hub.y1 - 8)] = MAT.LAMP; }
  const cf = W / 2 | 0;
  cells[idx(cf - 1, hub.y1 - 2)] = MAT.WOOD; cells[idx(cf, hub.y1 - 2)] = MAT.WOOD; cells[idx(cf + 1, hub.y1 - 2)] = MAT.WOOD;
  for (let dx2 = -1; dx2 <= 1; dx2++) setGenFire(cf + dx2, hub.y1 - 3, 255);
  // drop shaft to mines (deliberately off-centre: the hub floor must be safe to spawn on)
  const b0 = BANDS[1];
  const shaftX = W / 2 + 46;
  lateCarves.push([shaftX - 3, hub.y1 - 1, shaftX + 2, b0.y0 + 34]);

  /* ---- sanctuaries between biomes ---- */
  for (let i = 0; i < 4; i++) {
    const s = BANDS[2 + i * 2];
    const x0 = W / 2 - 120 | 0, x1 = W / 2 + 120 | 0;
    const y0 = s.y0 + 10, y1 = s.y1 - 8;
    carveRect(x0 + 1, y0, x1 - 1, y1 - 1, MAT.AIR);
    rectFrame(x0, y0 - 1, x1, y1, MAT.SACRED, 2);
    // floor detail, pillars & lamps
    for (let px = x0 + 26; px < x1 - 20; px += 48) {
      for (let py = y0 + 12; py < y1 - 2; py++) { cells[idx(px, py)] = MAT.STONE; cells[idx(px + 1, py)] = mrnd() < .5 ? MAT.STONE : MAT.SACRED; }
      cells[idx(px, y0 + 6)] = MAT.LAMP;
    }
    const fx = x0 + 34, fy = y1 - 3;
    for (let dx2 = -5; dx2 <= 5; dx2++) for (let dy2 = 0; dy2 <= 2; dy2++) cells[idx(fx + dx2, fy - dy2)] = MAT.AIR;
    for (let dx2 = -5; dx2 <= 5; dx2++) cells[idx(fx + dx2, fy + 1)] = MAT.SACRED;
    for (let dx2 = -4; dx2 <= 4; dx2++) { cells[idx(fx + dx2, fy)] = MAT.WATER; }
    cells[idx(fx, fy - 3)] = MAT.LAMP; cells[idx(fx - 6, fy - 1)] = MAT.LAMP; cells[idx(fx + 6, fy - 1)] = MAT.LAMP;
    fountainPool.push({ x: fx, y: fy, r: 7 });
    const bx = x1 - 46;
    for (let dx2 = -4; dx2 <= 4; dx2++) cells[idx(bx + dx2, fy)] = MAT.STONE, cells[idx(bx + dx2, fy - 1)] = MAT.AIR;
    const ax = (x0 + x1) >> 1;
    for (let dx2 = -6; dx2 <= 6; dx2++) cells[idx(ax + dx2, fy)] = MAT.STONE;
    sancts.push({ idx: i, y0: s.y0, y1: s.y1, cx: ax, fy, bench: { x: bx, y: fy - 2 }, fountain: { x: fx, y: fy - 1 }, altar: { x: ax, y: fy - 1 }, isHub: false, perkTaken: false });
    // connecting shafts: from biome above, down to next biome
    lateCarves.push([ax - 4, s.y0 - 10, ax + 3, y0 + 2]);
    lateCarves.push([ax - 4, y1 - 1, ax + 3, s.y1 + 12]);
  }
  // hub sanctuary record (the peak interior)
  sancts.unshift({ idx: -1, y0: hub.y0, y1: hub.y1, cx: W / 2 - 18, fy: hub.y1 - 1, bench: { x: W / 2 + 52, y: hub.y1 - 2 }, fountain: { x: W / 2 - 56, y: hub.y1 - 2 }, altar: { x: W / 2 - 20, y: hub.y1 - 2 }, isHub: true, perkTaken: true });
  for (let dx2 = -3; dx2 <= 3; dx2++) cells[idx(W / 2 - 56 + dx2, hub.y1 - 1)] = MAT.WATER;
  for (let dx2 = -3; dx2 <= 3; dx2++) cells[idx(W / 2 - 56 + dx2, hub.y1)] = MAT.SACRED;
  cells[idx(W / 2 - 56, hub.y1 - 3)] = MAT.LAMP;
  fountainPool.push({ x: W / 2 - 56, y: hub.y1 - 1, r: 5 });
  for (let dx2 = -4; dx2 <= 4; dx2++) cells[idx(W / 2 + 52 + dx2, hub.y1 - 1)] = MAT.STONE;
  sancts[0].bench.x = W / 2 + 52; sancts[0].bench.y = hub.y1 - 2;

  /* ---- biome bands ---- */
  for (let bi = 0; bi < 5; bi++) {
    const band = BANDS[1 + bi * 2], B = BIOMES[bi];
    const y0 = band.y0, y1 = band.y1, hh = y1 - y0;
    // caves via fBm
    for (let y = y0; y < y1; y++) {
      const edge = Math.min(y - y0, y1 - y) / 26;
      for (let x = 0; x < W; x++) {
        const n = fbm(x * 1.06, y * 1.06, 3);
        const n2 = noiseGrid(26).at(x * 1.3, y * 1.3) * .34;
        if (n + n2 > .60 - clamp(edge, 0, 1) * .06) cells[idx(x, y)] = MAT.AIR;
        else if (n + n2 > .555 - clamp(edge, 0, 1) * .05) cells[idx(x, y)] = B.floor === MAT.SNOW && y > y0 + hh * .3 ? MAT.SNOW : B.rock;
        else cells[idx(x, y)] = B.rock;
      }
    }
    // veins: coal/gold/tox blobs in rock
    for (let n = 0; n < 90; n++) {
      const vx = mri(4, W - 5), vy = mri(y0 + 4, y1 - 5), r = 2 + mri(0, 4);
      let mat = MAT.COAL; const q = rng();
      if (q > .82) mat = MAT.GOLD; else if (q > .7) mat = MAT.METAL; else if (q > .55 && B.key !== 'frost') mat = MAT.TOXD;
      for (let dy2 = -r; dy2 <= r; dy2++) for (let dx2 = -r; dx2 <= r; dx2++) {
        if (dx2 * dx2 + dy2 * dy2 > r * r) continue;
        const j = idx(vx + dx2, vy + dy2);
        if (inB(vx + dx2, vy + dy2) && cells[j] === B.rock && mrnd() < .8) cells[j] = mat;
      }
    }
    // rooms + corridors
    const rooms = [];
    const roomN = 7;
    for (let n = 0; n < roomN; n++) {
      const rw = mri(34, 72), rh = mri(20, 44);
      const rx = mri(12, W - 12 - rw), ry = mri(y0 + 18, y1 - 18 - rh);
      carveRect(rx, ry, rx + rw, ry + rh, MAT.AIR);
      rectFrame(rx, ry, rx + rw, ry + rh, rng() < .6 ? MAT.STONE : B.rock, 1);
      rooms.push({ x: rx + rw / 2 | 0, y: ry + rh / 2 | 0, x0: rx, y0: ry, x1: rx + rw, y1: ry + rh });
    }
    for (let n = 0; n < roomN; n++) {
      const a = rooms[n], b = rooms[(n + 1) % roomN];
      carveCorridor(a.x, a.y, b.x, b.y, 3 + mri(0, 2));
    }
    for (let n = 0; n < 3; n++) { const a = pick(rooms), b = pick(rooms); carveCorridor(a.x, a.y, b.x, b.y, 2 + mri(0, 2)); }
    // liquids settle in pits: scan columns bottom-up
    for (let x = 1; x < W - 1; x++) {
      let level = -1;
      for (let y = y1 - 3; y > y0 + 3; y--) {
        const m = cells[idx(x, y)];
        if (m !== MAT.AIR) {
          if (level >= 0) {
            const h = level - y;                       // cave height this column sees
            if (h > 5 && h < 110 && rng() < B.poolSize) {
              const lm = rng() < .72 ? B.liquid : MAT.WATER;
              for (let yy = level; yy > y && yy > level - h * .3; yy--) setLiquidQuiet(x, yy, lm);
            }
            level = -1;
          }
        } else level = y;
      }
    }
    biomeDecor(bi, y0, y1);
    // exit down toward the next sanctuary (or boss arena)
    lateCarves.push([W / 2 - 4, y1 - 6, W / 2 + 3, y1 + 12]);
    // spawn points for enemies: floor spots
    for (let n = 0; n < 46; n++) {
      const sx = mri(10, W - 11), sy = mri(y0 + 8, y1 - 10);
      if (get(sx, sy) === MAT.AIR && get(sx, sy + 1) !== MAT.AIR && get(sx, sy - 1) === MAT.AIR && !nearHub(sx, sy))
        worldSpawns.push({ x: sx, y: sy - 1, band: bi, type: weightedEnemy(B.enemies) });
    }
    // chests & wands & gold & potions
    for (const rm of rooms) {
      if (mrnd() < .75) spawnPickupInRoom('chest', rm);
      if (mrnd() < .5) spawnPickupInRoom('gold', rm);
      if (mrnd() < .4) spawnPickupInRoom('heart', rm);
      if (mrnd() < .45) spawnPickupInRoom('spell', rm);
      if (mrnd() < .5 && bi > 0) spawnPickupInRoom('wand', rm);
    }
    // loose gold dust & nuggets in rock pockets
    for (let n = 0; n < 40; n++) {
      const gx = mri(2, W - 3), gy = mri(y0 + 6, y1 - 7);
      if (get(gx, gy) === MAT.AIR && get(gx, gy + 1) !== MAT.AIR) pickups.push(makeGold(gx, gy, 1 + bi));
    }
    if (bi === 4) generateBossArena(band);
  }
  // final bedrock shell
  for (let x = 0; x < W; x++) { for (let y = 0; y < 3; y++) cells[y * W + x] = MAT.BED; for (let y = H - 3; y < H; y++) cells[y * W + x] = MAT.BED; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < 2; x++) cells[y * W + x] = MAT.BED; for (let x = W - 2; x < W; x++) cells[y * W + x] = MAT.BED; }
  // late shafts + wood supports
  for (const [x0, y0, x1, y1] of lateCarves) {
    carveRect(x0, y0, x1, y1, MAT.AIR);
    for (let y = Math.max(0, y0 | 0); y <= Math.min(H - 1, y1 | 0); y += 2) {
      if (get(x0 - 2 | 0, y) === MAT.AIR && get(x0 - 2 | 0, y + 1) === MAT.AIR) cells[idx(x0 - 2, y)] = MAT.WOOD;
      if (get(x1 + 2 | 0, y) === MAT.AIR && get(x1 + 2 | 0, y + 1) === MAT.AIR) cells[idx(x1 + 2, y)] = MAT.WOOD;
    }
  }
  recountRows();
}
function setGenFire(x, y, life) { const i = idx(x, y); cells[i] = MAT.FIRE; aux[i] = life; }
function setLiquidQuiet(x, y, m) { const i = idx(x, y); if (cells[i] === MAT.AIR) cells[i] = m; }
function nearHub(x, y) { const s = sancts[0]; return s && Math.abs(y - (s.y0 + s.y1) / 2) < 60 && Math.abs(x - s.cx) < 100; }
function carveCorridor(x0, y0, x1, y1, w) {
  let x = x0, y = y0;
  const step = () => { carveRect(x - (w >> 1), y - (w >> 1), x + (w >> 1), y + (w >> 1), MAT.AIR); };
  while (x !== x1 || y !== y1) {
    step();
    if (x !== x1 && (mrnd() < .55 || y === y1)) x += Math.sign(x1 - x);
    if (y !== y1) y += Math.sign(y1 - y);
  }
  step();
}
function weightedEnemy(tbl) {
  let sum = 0; for (const k in tbl) sum += tbl[k];
  let r = rng() * sum;
  for (const k in tbl) { r -= tbl[k]; if (r <= 0) return k; }
  return 'grub';
}
function spawnPickupInRoom(kind, rm) {
  const x = rm.x0 + 4 + mri(0, Math.max(1, rm.x1 - rm.x0 - 8)), y = rm.y1 - 2;
  pickups.push(makePickup(kind, x, y));
}
function biomeDecor(bi, y0, y1) {
  const B = BIOMES[bi];
  if (B.extra === 'supports' || B.extra === 'rail') {
    for (let n = 0; n < (B.extra === 'rail' ? 60 : 42); n++) {
      const px = mri(6, W - 7), py0 = mri(y0 + 6, y1 - 30), h = mri(6, 20);
      if (get(px, py0) !== MAT.AIR) continue;
      for (let t = 0; t < h; t++) { if (get(px, py0 - t) !== MAT.AIR) break; setQuiet(px, py0 - t, MAT.WOOD); }
      setQuiet(px - 1, py0 - h, MAT.WOOD); setQuiet(px + 1, py0 - h, MAT.WOOD);
      if (B.extra === 'rail' && mrnd() < .6) { for (let dx2 = -2; dx2 <= 2; dx2++) setQuiet(px + dx2, py0 + 1, MAT.METAL); }
      if (B.extra === 'rail' && mrnd() < .35) for (let dx2 = -8; dx2 <= 8; dx2++) setQuiet(px + dx2, py0, MAT.METAL);
    }
    if (B.extra === 'rail') for (let n = 0; n < 26; n++) {   // oil barrels: wood shell + oil inside
      const px = mri(8, W - 9), py = mri(y0 + 8, y1 - 8);
      if (get(px, py) !== MAT.AIR || get(px, py + 1) === MAT.AIR) continue;
      for (let dx2 = -1; dx2 <= 1; dx2++) for (let dy2 = -3; dy2 <= 0; dy2++) setQuiet(px + dx2, py + dy2, (Math.abs(dx2) === 1 || dy2 === -3) ? MAT.WOOD : MAT.OIL);
    }
  }
  if (B.extra === 'shrooms') {
    for (let n = 0; n < 90; n++) {
      const px = mri(4, W - 5), py = mri(y0 + 6, y1 - 4);
      if (get(px, py) !== MAT.AIR || get(px, py + 1) === MAT.AIR) continue;
      const h = mri(3, 9);
      for (let t = 1; t <= h; t++) setQuiet(px, py - t + 1, MAT.WOOD);
      const cap = mrnd() < .7 ? MAT.MUSH : MAT.FUNG;
      for (let dx2 = -2; dx2 <= 2; dx2++) for (let dy2 = -1; dy2 <= 0; dy2++) if (get(px + dx2, py - h + dy2) === MAT.AIR) setQuiet(px + dx2, py - h + dy2, cap);
    }
    for (let n = 0; n < 40; n++) { const px = mri(6, W - 7), py = mri(y0 + 6, y1 - 8);
      for (let t = 0; t < mri(4, 14); t++) if (get(px, py - t) === MAT.AIR) setQuiet(px, py - t, MAT.FUNG); else break; }
  }
  if (B.extra === 'vault') {
    for (let n = 0; n < 34; n++) {
      const px = mri(6, W - 7), py = mri(y0 + 6, y1 - 10);
      if (get(px, py) !== MAT.AIR) continue;
      for (let t = 0; t < mri(3, 8); t++) { setQuiet(px + t, py + 1, MAT.METAL); }
    }
    for (let n = 0; n < 60; n++) { const px = mri(3, W - 4), py = mri(y0 + 5, y1 - 6);
      if (get(px, py) === MAT.AIR && get(px, py + 1) !== MAT.AIR) setQuiet(px, py, MAT.SNOW); }
  }
  if (B.extra === 'tntcaches') {
    for (let n = 0; n < 18; n++) {
      const px = mri(8, W - 9), py = mri(y0 + 6, y1 - 8);
      if (get(px, py) !== MAT.AIR || get(px, py + 1) === MAT.AIR) continue;
      for (let dx2 = 0; dx2 < 2; dx2++) for (let dy2 = -2; dy2 <= 0; dy2++) setQuiet(px + dx2, py + dy2, MAT.TNT);
      if (mrnd() < .5) for (let dx2 = -1; dx2 <= 2; dx2++) setQuiet(px + dx2, py + 1, MAT.GUNP);
    }
    for (let n = 0; n < 40; n++) { const px = mri(4, W - 5), py = mri(y0 + 6, y1 - 4);
      if (get(px, py) !== MAT.AIR) continue;
      for (let t = 0; t < mri(4, 10); t++) if (get(px, py - t) === MAT.AIR) setQuiet(px, py - t, MAT.LAVA);
    }
  }
  // flammable gas pockets near ceilings of coal/magma
  if (B.fgasP > .01) for (let n = 0; n < 26; n++) {
    const px = mri(8, W - 9);
    let py = mri(y0 + 5, y0 + (y1 - y0) * .4 | 0);
    for (let t = 0; t < 6; t++) { if (get(px, py) !== MAT.AIR) break; py++; }
    for (let dx2 = -6; dx2 <= 6; dx2++) for (let dy2 = -3; dy2 <= 0; dy2++) if (get(px + dx2, py + dy2) === MAT.AIR) setQuiet(px + dx2, py + dy2, MAT.FGAS);
  }
}
function setQuiet(x, y, m) { if (inB(x, y)) { const i = idx(x, y); cells[i] = m; } }

function generateBossArena(band) {
  const cx = W / 2 | 0, ay1 = band.y1 - 14, ay0 = ay1 - 92;
  carveRect(cx - 130, ay0, cx + 130, ay1, MAT.AIR);
  rectFrame(cx - 131, ay0 - 1, cx + 131, ay1 + 1, MAT.STONE, 3);
  rectFrame(cx - 134, ay0 - 4, cx + 134, ay1 + 4, MAT.ROCK, 4);
  for (let x = cx - 128; x <= cx + 128; x++) for (let y = ay1 - 6; y <= ay1 - 1; y++) cells[idx(x, y)] = MAT.LAVA;
  for (let x = cx - 128; x <= cx + 128; x++) { cells[idx(x, ay1 - 7)] = mrnd() < .1 ? MAT.STONE : MAT.AIR; }
  // pillars
  for (const px of [cx - 78, cx + 78]) { for (let y = ay0 + 10; y < ay1 - 8; y++) { cells[idx(px, y)] = MAT.STONE; cells[idx(px + 1, y)] = MAT.STONE; } }
  for (const px of [cx - 40, cx + 40]) { for (let y = ay0 + 22; y < ay0 + 40; y++) cells[idx(px, y)] = MAT.METAL; }
  // entrance shaft from above the band
  carveRect(cx - 4, band.y0 + 6, cx + 3, ay0 + 2, MAT.STONE);
  carveRect(cx - 3, band.y0 + 6, cx + 2, ay0 + 2, MAT.AIR);
  for (const lx of [cx - 110, cx - 46, cx + 46, cx + 110]) { cells[idx(lx, ay0 + 4)] = MAT.LAMP; }
  pickups.push(makePickup('wand', cx - 60, ay1 - 10));   // a deep-tier wand above the arena
  pickups.push(makePickup('chest', cx + 90, ay1 - 9));
  bossEnt = makeBoss(cx, ay0 + 34);
}

/* ========================================================================== *
 *  SPELLS · WANDS · CASTING · PROJECTILES
 * ========================================================================== */
// kind: p=projectile m=modifier t=trigger u=utility
const SPELLS = {
  ember:  { n:'烬火星',   e:'Ember Bolt',   k:'p', mana:9,  dmg:7,  spd:4.2,  life:70,  r:2,  grav:.012, dig:8,   fire:1, col:rgb(255,168,74),  sfx:'castFire',  light:{r:255,g:150,b:60,rad:12}, blurb:'小型火焰弹，命中处会引燃易燃物。' },
  arc:    { n:'奥术弹',   e:'Arc Bolt',     k:'p', mana:10, dmg:13, spd:6.8,  life:60,  r:2,  grav:0,    dig:5,   pierce:2, col:rgb(150,220,255), sfx:'castBolt', light:{r:140,g:210,b:255,rad:14}, blurb:'高速穿刺弹，擅长精准点杀。' },
  blast:  { n:'爆裂弹',   e:'Blast Orb',    k:'p', mana:22, dmg:26, spd:3.4,  life:70,  r:3,  grav:.03,  dig:260, expl:{r:26,e:560,fire:1}, col:rgb(255,120,60), sfx:'castBomb', blurb:'落点爆炸，挖掘地形并点燃四周。' },
  glob:   { n:'毒菌球',   e:'Sludge Glob',  k:'p', mana:13, dmg:7,  spd:3.2,  life:80,  r:3,  grav:.09,  dig:2,   liquid:{m:MAT.SLIME,n:26}, poison:1, col:rgb(140,220,96), sfx:'castAcid', blurb:'爆开成菌浆水花，毒化接触者。' },
  frost:  { n:'冰锥术',   e:'Frost Dart',   k:'p', mana:9,  dmg:8,  spd:5.2,  life:60,  r:2,  grav:.02,  dig:3,   freeze:1, col:rgb(168,224,244), sfx:'castFrost', light:{r:150,g:210,b:255,rad:10}, blurb:'冻结水体成冰，减速击中的敌人。' },
  drill:  { n:'掘进钻',   e:'Drill Auger',  k:'p', mana:20, dmg:4,  spd:2.6,  life:150, r:3,  grav:0,    dig:1600, pierce:999, drill:1, col:rgb(210,214,232), sfx:'castDrill', light:{r:190,g:210,b:255,rad:8}, blurb:'贯穿岩层的高速钻头，挖掘利器。' },
  oilvial:{ n:'掷油囊',   e:'Oil Flask',    k:'p', mana:12, dmg:2,  spd:3.4,  life:90,  r:3,  grav:.14,  dig:1,   liquid:{m:MAT.OIL,n:34}, col:rgb(180,140,84), sfx:'castBomb', blurb:'砸地泼油；油遇火即成一片火海。' },
  jet:    { n:'水箭术',   e:'Water Jet',    k:'p', mana:6,  dmg:4,  spd:5,    life:36,  r:2,  grav:.05,  dig:2,   liquid:{m:MAT.WATER,n:10}, quench:1, col:rgb(96,170,230), sfx:'castBolt', blurb:'喷出流动的水，熄灭火焰、推动液体。' },
  bomb:   { n:'火药桶',   e:'Canister Bomb',k:'p', mana:24, dmg:8,  spd:3,    life:85,  r:3,  grav:.17,  dig:3,   fuse:82, bounce:2, expl:{r:36,e:1700,fire:1}, col:rgb(210,170,120), sfx:'castBomb', blurb:'翻滚的炸弹，引信烧尽时天崩地裂。' },
  wisp:   { n:'追光灵弹', e:'Wisp Shot',    k:'p', mana:5,  dmg:5,  spd:3.6,  life:110, r:2,  grav:0,    dig:2,   homing:1, autoaim:1, light:1, light2:1, col:rgb(190,255,200), sfx:'castBolt', blurb:'自动追踪敌人的小灵弹，自带微光。' },
  split:  { n:'散射',     e:'Split Shot',   k:'m', mana:8,  count:1, spread:11, blurb:'弹体数量 +1，散布增大。' },
  big:    { n:'巨化',     e:'Big Shot',     k:'m', mana:11, dmgMul:1.55, spdMul:.72, rAdd:2, blurb:'更大更疼，但更慢。' },
  light:  { n:'轻灵化',   e:'Light Shot',   k:'m', mana:4,  dmgMul:.6, spdMul:1.55, blurb:'更快更省，但伤害降低。' },
  heavy:  { n:'沉重化',   e:'Heavy Shot',   k:'m', mana:10, dmgMul:1.5, spdMul:.5, pierceAdd:2, digMul:2, blurb:'沉重一击：高伤高挖掘，穿透+2。' },
  homing: { n:'追踪',     e:'Homing',       k:'m', mana:8,  homing:1, blurb:'弹体会弯向最近的敌人。' },
  bnc:    { n:'弹跳',     e:'Bounce',       k:'m', mana:6,  bounceAdd:2, blurb:'可反弹两次，配触发器做诡雷。' },
  trail:  { n:'燃烬轨迹', e:'Burn Trail',   k:'m', mana:7,  burnTrail:1, blurb:'飞行途中沿途留下火焰。' },
  glow:   { n:'辉光',     e:'Light',        k:'m', mana:2,  lightMod:1, blurb:'照亮弹体周围的黑暗。' },
  war:    { n:'扩爆',     e:'Warhead',      k:'m', mana:14, explMul:1.45, blurb:'爆炸半径与能量大幅提升。' },
  pierce: { n:'穿甲',     e:'Piercing',     k:'m', mana:9,  pierceAdd:4, digMul:2, blurb:'穿透更多敌人，并更易击穿地形。' },
  trig:   { n:'触发器',   e:'Trigger',      k:'t', mana:0, t:'hit',  blurb:'包裹其后所有法术；命中时一起释放。' },
  timer:  { n:'定时引信', e:'Timer',        k:'t', mana:0, t:'time', blurb:'包裹其后法术；延迟后释放。' },
  blink:  { n:'位移闪光', e:'Blink',        k:'u', mana:16, u:'blink', col:rgb(200,230,255), blurb:'沿瞄准方向闪现至首个可站立处。' },
  lamp:   { n:'照明光球', e:'Lamp Orb',     k:'u', mana:8,  u:'lamp', col:rgb(255,230,150), blurb:'射出一枚长期发光的光球。' },
  freeze: { n:'寒霜新星', e:'Frost Nova',   k:'u', mana:18, u:'nova', col:rgb(170,225,255), blurb:'以自身为中心冻结液体并减速敌人。' },
};
const SPELL_IDS = Object.keys(SPELLS);
function spellGroupColor(k) { return k === 'p' ? 'sp-proj' : k === 'm' ? 'sp-mod' : k === 't' ? 'sp-trig' : 'sp-util'; }

function tierPool(tier) {
  const all = ['ember', 'arc', 'jet', 'frost', 'wisp', 'glob', 'oilvial', 'blast', 'drill', 'bomb',
    'split', 'big', 'light', 'heavy', 'homing', 'bnc', 'trail', 'glow', 'war', 'pierce', 'trig', 'timer', 'blink', 'lamp', 'freeze'];
  if (tier <= 1) return all.filter((s, i) => SPELLS[s].k !== 't' && i % 5 !== 4);
  return all;
}
const WAND_NAMES = ['锈木杖', '炭纹杖', '菌丝缠杖', '霜骨杖', '熔心遗杖', '旧矿灯杖', '拾荒者之枝', '低语灰木', '铜箍工杖', '余烬短杖', '裂隙行者', '钟乳棱杖'];
function makeWand(tier, opts = {}) {
  const cap = clamp(rint(4, 6) + Math.floor(tier / 2), 4, 8 + tier);
  const manaMax = rint(60, 90) + tier * 26;
  const w = {
    name: opts.name || pick(WAND_NAMES), tier,
    cap, slots: [], ptr: 0,
    castDelay: rint(10, 16) + tier * 2,
    recharge: rint(46, 84) - tier * 3,
    manaMax, mana: manaMax, manaRegen: rint(20, 34) + tier * 3,
    spread: rint(1, 6), spdMul: rf(.85, 1.15),
    cd: 0, rech: 0,
  };
  const pool = tierPool(tier);
  const n = clamp(w.cap - rint(0, 1), 3, w.cap);
  for (let s = 0; s < n; s++) w.slots.push(pool[rint(0, pool.length - 1)]);
  if (opts.slots) { w.slots = opts.slots.slice(0, opts.cap || w.cap); w.cap = Math.max(w.cap, w.slots.length); }
  if (opts.castDelay) w.castDelay = opts.castDelay;
  if (opts.recharge) w.recharge = opts.recharge;
  if (opts.manaMax) { w.manaMax = opts.manaMax; w.mana = opts.manaMax; }
  return w;
}
const gWands = [];
function curWand() { return gWands[G.curWand]; }

/* --------------------------- the firing cycle ---------------------------- */
// Cast semantics, modelled on the wand-deck research:
//  · modifiers accumulate into a pending "shot state" until the next projectile;
//  · a trigger swallows all following slots as payload, fired on impact/time;
//  · after the deck wraps (pointer hits the end), the wand recharges;
//  · cast delay = wand delay + per-spell delay; mana is charged for the group.
function castOnce() {
  const w = curWand();
  if (!w || !w.slots.length) return;
  if (w.rech > 0 || w.cd > 0) return;
  if (!input.fire) return;
  const slots = w.slots;
  const L = slots.length;
  let i = w.ptr;
  const mods = { count: 1, spread: w.spread, dmgMul: 1, spdMul: w.spdMul, rAdd: 0, pierce: 0, digMul: 1, homing: 0, bounce: 0, burnTrail: 0, light: 0, explMul: 1 };
  const payload = [];
  let trigType = null;
  const queue = [];
  let guard = 0;
  while (guard++ < L + 6) {
    const id = slots[i];
    const sp = SPELLS[id];
    if (!sp) { i++; if (i >= L) { i = L; break; } continue; }
    if (sp.k === 'm') { queue.push(id); i++; if (i >= L) break; continue; }
    if (sp.k === 't') {
      trigType = sp.t; i++;
      let pg = 0;
      while (i < L && pg++ < 16) { const pid = slots[i]; const ps = SPELLS[pid]; if (!ps || ps.k === 't') break; payload.push(pid); i++; }
      if (!payload.length) trigType = null;
      continue;
    }
    if (sp.k === 'p' || sp.k === 'u') { queue.push(id); i++; break; }
    i++; if (i >= L) break;
  }
  const wrapped = i >= L;
  w.ptr = wrapped ? 0 : i;
  let cost = 0, delay = 0;
  for (const cid of [...queue, ...payload]) { const cs = SPELLS[cid]; if (!cs) continue; cost += cs.mana || 0; if (cs.k === 'p') delay += 3; if (cs.k === 'u') delay += 6; }
  if (w.mana < cost) { if (w.mana < 8 && (!w.errCd || G.frame > w.errCd)) { SFX.err(); w.errCd = G.frame + 100; } if (wrapped) maybeRecharge(w, false); return; }
  for (const q of queue) {
    const s = SPELLS[q]; if (!s || s.k !== 'm') continue;
    if (s.count) { mods.count += s.count; mods.spread += s.spread || 0; }
    if (s.dmgMul) mods.dmgMul *= s.dmgMul;
    if (s.spdMul) mods.spdMul *= s.spdMul;
    if (s.rAdd) mods.rAdd += s.rAdd;
    if (s.pierceAdd) mods.pierce += s.pierceAdd;
    if (s.digMul) mods.digMul *= s.digMul;
    if (s.homing) mods.homing = 1;
    if (s.bounceAdd) mods.bounce += s.bounceAdd;
    if (s.burnTrail) mods.burnTrail = 1;
    if (s.lightMod) mods.light = 1;
    if (s.explMul) mods.explMul *= s.explMul;
  }
  if (player.perk.boomheart) { mods.explMul *= 1.3; mods.dmgMul *= 1.05; }
  const mainSlot = queue.find(q => SPELLS[q] && (SPELLS[q].k === 'p' || SPELLS[q].k === 'u'));
  const mainId = mainSlot != null ? queue[queue.indexOf(mainSlot)] : null;
  if (mainId != null) {
    const sp = SPELLS[mainId];
    const px = player.x + Math.cos(player.aimA) * 4.5, py = player.y - 6 + Math.sin(player.aimA) * 4.5;
    if (sp.k === 'u') castUtility(sp, px, py);
    else for (let c = 0; c < mods.count; c++) {
      const spread = (mods.spread * Math.PI / 180);
      const a = player.aimA + (mods.count > 1 ? (c / (mods.count - 1) - .5) * spread * 2.4 : (mrnd() - .5) * spread);
      spawnProjectile(mainId, px, py, a, mods, trigType, payload.slice());
    }
    G.castFlash = 4;
  }
  w.mana -= cost;
  w.cd = w.castDelay + delay;
  if (wrapped) maybeRecharge(w, true);
}
function maybeRecharge(w, didCast) {
  if (w.ptr === 0) w.rech = Math.max(10, w.rech + (w.recharge > 0 ? (didCast ? w.recharge : w.recharge * .5) : 0));
}

function castUtility(sp, px, py) {
  void px; void py;
  if (sp.u === 'blink') {
    let bx = player.x, by = player.y, ok = 0;
    const a = player.aimA, ca = Math.cos(a), sa = Math.sin(a);
    for (let s = 2; s < 30; s++) {
      const nx = player.x + ca * s, ny = player.y - 4 + sa * s;
      if (solidAt(nx, ny) || solidAt(nx, ny + 3)) break;
      if (!solidAt(nx, ny) && !solidAt(nx, ny - 3)) { bx = nx; by = ny + 3; ok = 1; }
    }
    if (ok) { sparkBurst(player.x, player.y - 3, 10, 0xbfd8ff, 1.4, 1, 0); sparkBurst(bx, by - 3, 10, 0xbfd8ff, 1.4, 1, 0); SFX.blink(); player.x = bx; player.y = by; }
    return;
  }
  if (sp.u === 'lamp') {
    spawnProjectile('wisp', player.x, player.y - 6, player.aimA, { count: 1, spread: 0, dmgMul: .4, spdMul: .5, rAdd: 1, pierce: 0, digMul: 1, homing: 0, bounce: 0, burnTrail: 0, light: 1, explMul: 1 }, null, [], { lamp: 1, lifeOverride: 60 * 22 });
    return;
  }
  if (sp.u === 'nova') {
    SFX.freeze();
    for (let k = 0; k < 130; k++) {
      const a = mrnd() * Math.PI * 2, d = mrnd() * 17;
      const x = (player.x + Math.cos(a) * d) | 0, y = (player.y - 4 + Math.sin(a) * d) | 0;
      if (get(x, y) === MAT.WATER) setM(x, y, MAT.ICE);
      else if (get(x, y) === MAT.FIRE) setM(x, y, MAT.SMOKE);
      else if (get(x, y) === MAT.AIR && mrnd() < .2) spawnPart(x + .5, y + .5, Math.cos(a) * .6, Math.sin(a) * .6, 20, 0xaee2ff, { g: .02, glow: 1 });
    }
    enemies.forEach(e => { if (Math.hypot(e.x - player.x, e.y - player.y) < 24) { e.slow = Math.max(e.slow || 0, 240); hurtEntity(e, 4, 'ice', '寒霜新星'); } });
    if (bossEnt && !bossEnt.dead && Math.hypot(bossEnt.x - player.x, bossEnt.y - player.y) < 34) { bossEnt.slow = 180; hurtEntity(bossEnt, 6, 'ice', '寒霜新星'); }
  }
}

function spawnProjectile(id, x, y, ang, mods, trigType, payload, over = {}) {
  const sp = SPELLS[id];
  const life = over.lifeOverride || sp.life * (.85 + mrnd() * .3);
  const p = {
    id, x, y,
    vx: Math.cos(ang) * sp.spd * (mods ? mods.spdMul : 1) * (over.spdOverride || 1),
    vy: Math.sin(ang) * sp.spd * (mods ? mods.spdMul : 1) * (over.spdOverride || 1),
    grav: sp.grav || 0, dmg: (sp.dmg || 1) * (mods ? mods.dmgMul : 1),
    r: (sp.r || 2) + (mods ? mods.rAdd : 0),
    life, maxLife: life,
    dig: (sp.dig || 0) * (mods ? mods.digMul : 1),
    pierce: (sp.pierce || 0) + (mods ? mods.pierce : 0),
    homing: (sp.homing || 0) || (mods ? mods.homing : 0),
    bounce: (sp.bounce || 0) + (mods ? mods.bounce : 0),
    fire: sp.fire || 0, freeze: sp.freeze || 0, quench: sp.quench || 0, poison: sp.poison || 0,
    liquid: sp.liquid || null,
    expl: sp.expl ? { r: sp.expl.r * (mods ? mods.explMul : 1), e: sp.expl.e * (mods ? mods.explMul : 1), fire: sp.expl.fire } : null,
    fuse: sp.fuse || 0,
    drill: sp.drill || 0,
    trail: mods ? mods.burnTrail : 0,
    light: (mods && mods.light) || sp.light ? 1 : 0,
    lightDef: sp.light || null,
    col: sp.col || rgb(255, 255, 255),
    trig: trigType, payload: payload || [],
    hits: [], tick: 0, owner: 'player',
    lamp: over.lamp || 0,
    auto: sp.autoaim || 0,
  };
  if (p.trig === 'time' && (!p.fuse || p.fuse <= 0)) p.fuse = 46;
  if (p.auto) {
    let best = null, bd = 90 * 90;
    const tgt = enemies.concat(bossEnt && !bossEnt.dead ? [bossEnt] : []);
    for (const e2 of tgt) { const d = (e2.x - x) * (e2.x - x) + (e2.y - y) * (e2.y - y); if (d < bd) { bd = d; best = e2; } }
    if (best) { const a2 = Math.atan2(best.y - y, best.x - x); const s0 = Math.hypot(p.vx, p.vy); p.vx = Math.cos(a2) * s0; p.vy = Math.sin(a2) * s0; }
  }
  projectiles.push(p);
  if (SFX[sp.sfx]) SFX[sp.sfx]();
  return p;
}

function updateProjectiles() {
  for (let n = projectiles.length - 1; n >= 0; n--) {
    const p = projectiles[n];
    p.tick++;
    if (p.lamp) { lampTick(p, n); continue; }
    if (p.life-- <= 0) { endProjectile(p, n, true); continue; }
    if (p.fuse > 0 && --p.fuse <= 0) { endProjectile(p, n, true); continue; }
    if (p.homing) {
      let best = null, bd = 64 * 64;
      const tgt = enemies.concat(bossEnt && !bossEnt.dead ? [bossEnt] : []);
      for (const e2 of tgt) { const dx = e2.x - p.x, dy = e2.y - p.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = e2; } }
      if (best) {
        const want = Math.atan2(best.y - p.y, best.x - p.x), cur = Math.atan2(p.vy, p.vx);
        let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        const spd = Math.hypot(p.vx, p.vy), na = cur + clamp(da, -.09, .09);
        p.vx = Math.cos(na) * spd; p.vy = Math.sin(na) * spd;
      }
    }
    p.vy += p.grav;
    const spd = Math.hypot(p.vx, p.vy), steps = Math.max(1, Math.ceil(spd / 1.05));
    let dead = false;
    for (let s = 0; s < steps && !dead; s++) {
      p.x += p.vx / steps; p.y += p.vy / steps;
      const cx = p.x | 0, cy = p.y | 0;
      if (!inB(cx, cy)) { endProjectile(p, n, false); dead = true; break; }
      const m = get(cx, cy);
      if (p.trail && s === 0 && mrnd() < .6) placeFire(cx, cy - 1, 20 + mri(0, 16));
      else if (p.fire && !p.trail && mrnd() < .14) placeFire(cx, cy, 14);
      if (SOLID[m]) {
        if (p.drill) sparkBurst(p.x, p.y, 2, 0xdfe6ff, .4, 1, .04);
        if (p.dig > 0) {
          const res = digRay(p.x, p.y, p.vx, p.vy, p.dig);
          p.dig = Math.max(0, p.dig - res.consumed);
          if (res.stop) { onProjectileHitSolid(p, n, cx, cy, m); dead = true; break; }
          if (res.m === MAT.GLASS) SFX.hitStone();
          continue;
        }
        if (p.bounce > 0) {
          p.bounce--;
          const mx = get((p.x + Math.sign(p.vx)) | 0, cy), my = get(cx, (p.y + Math.sign(p.vy)) | 0);
          if (SOLID[mx]) p.vx = -p.vx;
          if (SOLID[my]) p.vy = -p.vy;
          if (!SOLID[mx] && !SOLID[my]) p.vy = -Math.abs(p.vy) * .8 - .4;
          p.x += p.vx * .03; p.y += p.vy * .03;
          sparkBurst(p.x, p.y, 3, 0xfff0c0, .5, 1, .05);
          SFX.hitStone();
          break;
        }
        onProjectileHitSolid(p, n, cx, cy, m); dead = true; break;
      } else if (LIQ[m]) {
        p.vx *= .92; p.vy *= .92; p.vy -= .05 * (M_DEN[m] / 100 - 1);
        if (QUENCH[m] && (p.fire || p.trail)) { endProjectile(p, n, false); sparkBurst(p.x, p.y, 6, 0xdbeef5, .8, 1, 0); SFX.splash(); dead = true; break; }
        if (m === MAT.ACID || m === MAT.LAVA) p.life -= 2;
      }
      if (p.owner === 'enemy' && !player.dead) {
        if (Math.abs(p.x - player.x) < 4 + p.r && Math.abs(p.y - (player.y - 5.5)) < 6 + p.r) {
          hurtPlayer(p.dmg, p.fire ? 'fire' : 'projectile', p.bossBolt ? '巨眼的灼弹' : '敌方法术');
          if (p.fire) player.burn = Math.max(player.burn, 90);
          endProjectile(p, n, false); dead = true; break;
        }
      } else if (p.owner === 'player' || p.owner === 'enemy') {
        let hitEnt = null;
        for (const e2 of enemies) {
          if (e2.dead) continue;
          if (Math.abs(e2.x - p.x) < e2.w / 2 + p.r + 1 && Math.abs(e2.y - p.y) < e2.h / 2 + p.r + 1) { hitEnt = e2; break; }
        }
        if (!hitEnt && bossEnt && !bossEnt.dead && Math.abs(bossEnt.x - p.x) < bossEnt.r + p.r && Math.abs(bossEnt.y - p.y) < bossEnt.r + p.r) hitEnt = bossEnt;
        if (hitEnt) {
          if (p.drill || !p.hits.includes(hitEnt.id)) {
            p.hits.push(hitEnt.id);
            if (p.hits.length > 40) p.hits.shift();
            hurtEntity(hitEnt, p.dmg, p.fire ? 'fire' : p.freeze ? 'ice' : p.poison ? 'poison' : 'projectile', SPELLS[p.id] ? SPELLS[p.id].n : '敌方法术');
            if (p.fire) hitEnt.burn = Math.max(hitEnt.burn || 0, 90 + mri(0, 60));
            if (p.freeze) hitEnt.slow = Math.max(hitEnt.slow || 0, 240);
            if (p.poison) hitEnt.poison = Math.max(hitEnt.poison || 0, 240);
          }
          if (p.owner === 'player' || p.owner === 'enemy') p.pierce--;
          if (p.pierce < 0) { onProjectileHitSolid(p, n, p.x | 0, p.y | 0, 0, hitEnt); dead = true; break; }
        }
      }
    }
  }
}
function onProjectileHitSolid(p, idxN, cx, cy, m, ent) {
  p.hitSolid = 1;
  if (p.fire) placeFire(cx, cy - 1, 30);
  if (p.expl) { endProjectile(p, idxN, true); return; }
  if (p.liquid) { spillLiquid(p); endProjectile(p, idxN, false); return; }
  if (p.freeze) {
    for (let k = 0; k < 26; k++) {
      const fx = cx + mri(-4, 4), fy = cy + mri(-3, 2);
      if (get(fx, fy) === MAT.WATER) setM(fx, fy, MAT.ICE);
      else if (get(fx, fy) === MAT.FIRE) setM(fx, fy, MAT.SMOKE);
      else if (get(fx, fy) === MAT.AIR && mrnd() < .4) setM(fx, fy, MAT.SNOW);
    }
    SFX.freeze();
  }
  if (p.trig && p.payload.length) { firePayload(p, p.x, p.y); endProjectile(p, idxN, false); return; }
  sparkBurst(p.x, p.y, 4, ent ? 0xffb0b8 : 0xd9c9a0, .7, 1, .08);
  if (ent) SFX.hitFlesh(); else SFX.hitStone();
  endProjectile(p, idxN, false);
}
function spillLiquid(p) {
  const liq = p.liquid;
  for (let k = 0; k < liq.n; k++) {
    const fx = (p.x + (mrnd() - .5) * 7) | 0, fy = (p.y + (mrnd() - .5) * 7) | 0;
    if (get(fx, fy) === MAT.AIR) setM(fx, fy, liq.m);
  }
  if (liq.m === MAT.SLIME || liq.m === MAT.OIL) sparkBurst(p.x, p.y, 8, liq.m === MAT.OIL ? 0xd8a75c : 0x9fe07a, .9, 0, .12);
}
function firePayload(p, x, y) {
  const mods = { count: 1, spread: 12, dmgMul: 1, spdMul: 1, rAdd: 0, pierce: 0, digMul: 1, homing: 0, bounce: 0, burnTrail: 0, light: 0, explMul: 1 };
  let fired = 0;
  const payloadProj = [];
  for (const sid of p.payload) {
    const sp = SPELLS[sid]; if (!sp) continue;
    if (sp.k === 'm') {
      if (sp.count) { mods.count += sp.count; mods.spread += sp.spread || 0; }
      if (sp.dmgMul) mods.dmgMul *= sp.dmgMul;
      if (sp.homing) mods.homing = 1;
      if (sp.pierceAdd) mods.pierce += sp.pierceAdd;
      if (sp.explMul) mods.explMul *= sp.explMul;
      if (sp.burnTrail) mods.burnTrail = 1;
      if (sp.rAdd) mods.rAdd += sp.rAdd;
      if (sp.spdMul) mods.spdMul *= sp.spdMul;
      if (sp.digMul) mods.digMul *= sp.digMul;
      if (sp.bounceAdd) mods.bounce += sp.bounceAdd;
    } else if (sp.k === 'p') payloadProj.push(sid);
  }
  for (const sid of payloadProj) {
    for (let c = 0; c < mods.count; c++) {
      const a = mrnd() * Math.PI * 2;
      spawnProjectile(sid, x, y, a + fired * .9, mods, null, [], {});
      fired++;
    }
  }
  if (fired) SFX.trigger();
}
function endProjectile(p, n, doExpl) {
  if (doExpl) {
    if (p.expl) fxQueue.push({ x: p.x, y: p.y, r: p.expl.r, e: p.expl.e, d: p.dmg + 18, fire: p.expl.fire, depth: 0, big: p.expl.r > 30 });
    else if (p.trig && p.payload.length) firePayload(p, p.x, p.y);
    else if (p.liquid) spillLiquid(p);
    sparkBurst(p.x, p.y, 5, p.col >>> 0, .8, 1, .05);
  }
  const k = projectiles.indexOf(p);
  const kn = (n >= 0 && projectiles[n] === p) ? n : k;
  if (kn >= 0) projectiles.splice(kn, 1);
}
function lampTick(p, n) {
  p.life--;
  p.vx *= .8; p.vy = Math.min(3, p.vy + .12);
  const nx = p.x + p.vx, ny = p.y + p.vy;
  if (!solidAt(nx, p.y)) p.x = nx; else p.vx = 0;
  if (!solidAt(p.x, ny)) p.y = ny; else { p.stuck = 1; p.vy = 0; }
  if (p.life <= 0) { sparkBurst(p.x, p.y, 4, 0xffe9a0, .5, 1, .04); projectiles.splice(n, 1); return; }
  if (p.tick % 40 === 0) spawnPart(p.x, p.y, 0, -.2, 26, 0xffe07a, { g: -.01, glow: 1 });
}

function solidAt(x, y) { const m = get(x | 0, y | 0); return SOLID[m] === 1; }

/* ========================================================================== *
 *  ENTITIES: damage plumbing, enemies, boss
 * ========================================================================== */
let entId = 1;
function hurtEntity(e, dmg, type, cause) {
  if (!e || e.dead) return;
  if (e === player) { hurtPlayer(dmg, type, cause); return; }
  dmg *= (e.resist || 1);
  if (type === 'fire' && e.fireImmune) dmg = 0;
  if (dmg <= 0) { spawnPart(e.x, e.y, 0, -.4, 12, 0xaee2ff, { glow: 1 }); return; }
  e.hp -= dmg; e.flash = 5;
  G.hitstop = Math.min(4, (G.hitstop || 0) + 1);
  if (type !== 'melee') { const a = Math.atan2(e.y - (type === 'explosion' ? e.y - .01 : (player ? player.y : e.y)), e.x - (player ? player.x : e.x)); e.vx += Math.cos(a) * (dmg > 14 ? 1.3 : .35); }
  // blood pixels: gore belongs to the simulation, not to sprites
  const bx = e.x | 0, by = e.y | 0;
  for (let k = 0; k < Math.min(9, dmg | 0); k++) {
    const fx = bx + mri(-2, 2), fy = by + mri(-2, 2);
    if (get(fx, fy) === MAT.AIR) setM(fx, fy, MAT.BLOOD);
    spawnPart(e.x + (mrnd() - .5) * 4, e.y + (mrnd() - .5) * 4, (mrnd() - .5) * 1.6, -mrnd() * 1.8, 20 + mri(0, 16), 0xc5485a, { g: .12 });
  }
  SFX.hitFlesh();
  if (e.hp <= 0) { if (e.type === 'boss') bossDeath(); else killEnemy(e, cause); }
}
function killEnemy(e, cause) {
  if (e.dead) return;
  e.dead = true;
  SFX.hitFlesh(); sparkBurst(e.x, e.y, 10, 0xffb0b8, 1.3, 0, .12);
  const bx = e.x | 0, by = e.y | 0;
  for (let k = 0; k < 22; k++) {
    const fx = bx + mri(-3, 3), fy = by + mri(-3, 3);
    if (get(fx, fy) === MAT.AIR) setM(fx, fy, MAT.BLOOD);
  }
  if (e.burn > 0) for (let k = 0; k < 4; k++) placeFire(bx + mri(-2, 2), by + mri(-2, 0), 60);
  if (e.type === 'boomer') { fxQueue.push({ x: e.x, y: e.y, r: 18, e: 240, d: 16, fire: 1, depth: 0 }); }
  const n = e.goldN || mri(1, 3);
  for (let k = 0; k < n; k++) pickups.push(makeGold(e.x + (mrnd() - .5) * 4, e.y - 2, 1 + (e.tier || 0)));
  if (mrnd() < .09) pickups.push(makePickup('heart', e.x, e.y - 2));
  if (mrnd() < .10) pickups.push(makePickup('spell', e.x, e.y - 2));
  if (player.perk.alchemy) for (let k = 0; k < 2; k++) pickups.push(makeGold(e.x, e.y, 2));
  if (player.perk.bloodecho) player.hp = Math.min(player.maxHp, player.hp + 4);
  G.kills++;
}

/* ------------------------------- enemy kinds ------------------------------ */
const ETYPE = {
  grub:   { n:'岩脊兽',   w:7, h:8,  hp:30, spd:1.05, dmg:10, gold:3, color:0x9fb0a4 },
  bat:    { n:'蝠灵',     w:8, h:6,  hp:13, spd:1.5,  dmg:7,  gold:2, color:0xc8698d, fly:1 },
  sniper: { n:'游荡枪手', w:7, h:10, hp:21, spd:.6,   dmg:8,  gold:4, color:0xc45762, shoot:1 },
  boomer: { n:'燃爆虫',   w:8, h:7,  hp:11, spd:1.15, dmg:0,  gold:2, color:0xe08a3c, boom:1 },
  worm:   { n:'掘地蠕虫', w:11,h:8,  hp:44, spd:1.25, dmg:14, gold:5, color:0xb56bd0, dig:1 },
  spitter:{ n:'吐酸菌妖', w:8, h:9,  hp:24, spd:.7,   dmg:8,  gold:4, color:0x7fbf6a, spit:1 },
  slimer: { n:'腐毒胶母', w:12, h:9,  hp:38, spd:.85, dmg:9,  gold:4, color:0x8ed06a },
};
function spawnEnemy(type, x, y, tier) {
  const d = ETYPE[type];
  const e = {
    id: entId++, type, x, y, vx: 0, vy: 0, w: d.w, h: d.h,
    hp: Math.round(d.hp * (1 + tier * .16)), max: Math.round(d.hp * (1 + tier * .16)),
    spd: d.spd, dmg: d.dmg + (tier * 2), goldN: d.gold + mri(0, 1),
    dead: false, flash: 0, burn: 0, slow: 0, poison: 0, dir: mrnd() < .5 ? 1 : -1,
    fly: !!d.fly, tier, anim: mri(0, 99), ai: 0, rest: 0, onGround: false,
    fireImmune: type === 'boomer' ? 0 : 0,
  };
  enemies.push(e);
  return e;
}
function enemyMove(e, gravity = true) {
  const drag = 1;
  if (gravity && !e.fly) {
    e.vy += .24; if (e.vy > 6) e.vy = 6;
    // buoyancy in liquids
    const m = get(e.x | 0, (e.y + e.h / 2) | 0);
    if (LIQ[m]) { e.vy -= .3 * (100 / M_DEN[m]) * .5; e.vx *= .8; if (e.vy > 1.2) e.vy = 1.2; }
  }
  if (e.slow > 0) { e.slow--; }
  const sm = e.slow > 0 ? .45 : 1;
  // X
  let nx = e.x + e.vx * sm * drag;
  if (!boxSolid(e, nx, e.y)) e.x = nx; else { e.vx *= -.2; e.blocked = 6; }
  // Y
  let ny = e.y + e.vy * sm;
  if (!boxSolid(e, e.x, ny)) { e.y = ny; e.onGround = false; }
  else {
    if (e.vy > 0) {
      e.onGround = true;
      const m = get(e.x | 0, (e.y + e.h / 2 + .5) | 0);
      if (M_SLIP[m]) e.vx *= .995; else e.vx *= .62;
    }
    e.vy = 0;
  }
  e.vx *= .92;
}
function boxSolid(e, x, y) {
  const hw = e.w / 2, hh = e.h / 2;
  for (const dx2 of [-hw, hw]) for (const dy2 of [-hh, hh, 0]) if (solidAt(x + dx2, y + dy2)) return true;
  return solidAt(x, y);
}
function losClear(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.min(48, d | 0);
  for (let i = 1; i < n; i++) { const t = i / n; if (solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false; }
  return true;
}
function enemyShoot(e, tx, ty, opts = {}) {
  const a = Math.atan2(ty - e.y, tx - e.x);
  const spd = opts.spd || 3.2;
  projectiles.push({
    id: 'ebolt', x: e.x + Math.cos(a) * 4, y: e.y - 1 + Math.sin(a) * 4,
    vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, grav: opts.grav || 0,
    dmg: opts.dmg || 8, r: 2, life: opts.life || 130, maxLife: 130, dig: opts.dig || 0,
    pierce: -1, homing: 0, bounce: 0, fire: opts.fire || 0, freeze: 0, quench: 0, poison: 0,
    liquid: opts.liquid || null, expl: opts.expl || null, fuse: 0, drill: 0, trail: 0, light: 1,
    lightDef: opts.lightDef || { r: 255, g: 190, b: 110, rad: 10 }, col: opts.col || rgb(255, 200, 120),
    trig: null, payload: [], hits: [], tick: 0, owner: 'enemy', hitsPlayer: true,
  });
  tone(320, 200, .08, 'square', .035);
}
function updateEnemies() {
  const px = player.x, py = player.y;
  for (let n = enemies.length - 1; n >= 0; n--) {
    const e = enemies[n];
    if (e.dead || Math.abs(e.y - G.camY - VH / 2) > VH * 1.5) { if (e.dead) enemies.splice(n, 1); continue; }
    e.anim++;
    if (e.hitCd > 0) e.hitCd--;
    if (e.flash > 0) e.flash--;
    // status effects riding on the sim
    const cx = e.x | 0, cy = e.y | 0;
    const midM = get(cx, cy), footM = get(cx, (e.y + e.h / 2) | 0);
    if (midM === MAT.FIRE || footM === MAT.FIRE) e.burn = Math.max(e.burn, 60);
    if (midM === MAT.LAVA) { e.burn = Math.max(e.burn, 240); hurtEntity(e, 1.4, 'fire', '熔岩'); }
    if (midM === MAT.ACID) hurtEntity(e, .8, 'acid', '酸液');
    if (midM === MAT.PGAS || footM === MAT.PGAS) e.poison = Math.max(e.poison || 0, 90);
    if (e.burn > 0 && (e.anim % 20) === 0) { hurtEntity(e, e.max * .02, 'fire', '烈焰灼烧'); placeFire(cx, cy - 1, 20); spawnPart(e.x, e.y - 2, (mrnd() - .5) * .4, -.6, 16, 0xffa23e, { glow: 1, g: -.02 }); }
    if (e.poison > 0 && (e.anim % 26) === 0) hurtEntity(e, 1.2, 'poison', '毒雾');
    if (e.burn > 0) e.burn--;
    if (e.poison > 0) e.poison--;
    if (e.rest > 0) { e.rest--; enemyMove(e, !e.fly); continue; }
    const dxp = px - e.x, dyp = py - e.y, dist = Math.hypot(dxp, dyp);
    const see = dist < 128 && losClear(e.x, e.y, px, py);
    switch (e.type) {
      case 'grub': {
        if (see) {
          e.dir = dxp > 0 ? 1 : -1;
          e.vx += e.dir * .16 * (e.spd);
          if (e.blocked > 0 && e.onGround) { e.vy = -3.4; e.blocked = 0; }
        } else {
          if (e.onGround && e.anim % 130 === 0) e.dir = mrnd() < .5 ? 1 : -1;
          e.vx += e.dir * .07;
        }
        if (Math.abs(dxp) < 8 && Math.abs(dyp) < 9) contactDamage(e, 1);
        break;
      }
      case 'bat': {
        e.vy = Math.sin(e.anim * .14) * .8;
        if (see || dist < 70) {
          e.vx += Math.sign(dxp) * .11;
          if (dyp > 6) e.vy += .14; else if (dyp < -4) e.vy -= .12;
          if (e.swoop > 0) { e.swoop--; e.vx *= 1.02; e.vy += Math.sign(dyp) * .2; }
          else if (dist < 44 && e.anim % 90 === 0) e.swoop = 26;
        } else {
          e.vx += Math.cos(e.anim * .045) * .08 + Math.sign(e.dir) * .02;
        }
        e.vx = clamp(e.vx, -2.6, 2.6); e.vy = clamp(e.vy, -2, 2);
        if (Math.abs(dxp) < 7 && Math.abs(dyp) < 7) contactDamage(e, 1);
        break;
      }
      case 'sniper': {
        if (see) {
          e.dir = dxp > 0 ? 1 : -1;
          e.aimAng = Math.atan2(dyp - 2, dxp);
          if (!e.cool || e.cool <= 0) {
            const lead = dist / 3.2 * .028;
            enemyShoot(e, px + player.vx * lead * 14, py + player.vy * lead * 8 - 1, { dmg: e.dmg, col: rgb(255, 210, 130), lightDef: { r: 255, g: 200, b: 120, rad: 8 } });
            e.cool = 74 + mri(0, 26);
            if (mrnd() < .25) e.vx -= e.dir * 1.4;
          }
        } else if (e.onGround && e.anim % 160 === 0) e.vx += (mrnd() - .5) * 2;
        if (e.cool > 0) e.cool--;
        enemyMove(e);
        continue;
      }
      case 'boomer': {
        if (see) { e.dir = dxp > 0 ? 1 : -1; e.vx += e.dir * .17; }
        if (dist < 20) {
          e.fuse = (e.fuse || 34) - 1;
          if (e.fuse <= 0) {
            fxQueue.push({ x: e.x, y: e.y, r: 22, e: 420, d: 30 + e.tier * 3, fire: 1, depth: 0 });
            e.hp = -1; killEnemy(e, '燃爆虫的自爆'); enemies.splice(n, 1);
            continue;
          }
          e.flash = 2;
        } else if (e.fuse) e.fuse = Math.min(34, e.fuse + 1);
        break;
      }
      case 'worm': {
        e.digT = (e.digT || 0) + 1;
        if (e.digMode == null) e.digMode = 1;
        if (e.digMode) {
          // burrow: eat terrain, home to player
          const a = Math.atan2(dyp, dxp);
          e.vx += Math.cos(a) * .22; e.vy += Math.sin(a) * .2;
          e.vx = clamp(e.vx, -1.7, 1.7); e.vy = clamp(e.vy, -1.7, 1.7);
          e.x = clamp(e.x + e.vx, 3, W - 4); e.y = clamp(e.y + e.vy, 3, H - 4);
          const hw2 = e.w / 2;
          for (let s2 = -1; s2 <= 1; s2++) {
            const txx = (e.x + e.vx * 2) | 0, tyy = (e.y + e.vy * 2 + s2 * 3) | 0;
            const mm = get(txx, tyy);
            if (SOLID[mm] && mm !== MAT.BED && mm !== MAT.SACRED && mrnd() < .8) {
              setM(txx, tyy, MAT.AIR);
              if (mrnd() < .18) spawnPart(txx + .5, tyy + .5, (mrnd() - .5) * .6, -.4, 18, 0x8a7a62, { g: .12 });
              if (mrnd() < .06) { const j = idx(txx, tyy - 1); if (cells[j] === MAT.AIR) { cells[j] = MAT.DIRT; rowActive[tyy - 1]++; } }
            }
          }
          if (dist < 16 || (e.digT > 240 && !see)) { e.digMode = 0; e.digT = 0; e.vy = -2.6; sparkBurst(e.x, e.y, 8, 0xa39278, 1, 0, .1); }
          void hw2;
        } else {
          if (see) { e.vx += Math.sign(dxp) * .12; if (e.onGround && dyp < -8) e.vy = -3.2; }
          else if (e.digT > 190) { e.digMode = 1; e.digT = 0; }
          enemyMove(e);
          if (Math.abs(dxp) < 9 && Math.abs(dyp) < 9 && (e.hitCd || 0) <= 0) contactDamage(e, 1.2);
        }
        if (e.hitCd > 0) e.hitCd--;
        continue;
      }
      case 'spitter': {
        if (see) {
          e.dir = dxp > 0 ? 1 : -1;
          if (dist < 40) e.vx -= e.dir * .09; else if (e.onGround && e.anim % 100 === 0) e.vx += e.dir * .5;
          if (!e.cool || e.cool <= 0) {
            enemyShoot(e, px, py, { spd: 2.4, grav: .1, dmg: 6, liquid: { m: MAT.ACID, n: 10 }, col: rgb(170, 230, 100), lightDef: { r: 160, g: 230, b: 90, rad: 8 }, dmgMul: 1 });
            e.cool = 96 + mri(0, 40);
          }
        }
        if (e.cool > 0) e.cool--;
        break;
      }
    }
    enemyMove(e, !e.fly);
  }
  // spawner
  maybeSpawnEnemies();
}
function contactDamage(e, mult = 1) {
  if ((e.hitCd || 0) > 0) return;
  e.hitCd = 46;
  hurtPlayer(e.dmg * mult, 'melee', ETYPE[e.type].n + '的撕咬');
  e.vx = -Math.sign(player.x - e.x) * .8;
}
function maybeSpawnEnemies() {
  if (enemies.length > 26) return;
  for (let i = 0; i < worldSpawns.length; i++) {
    const sp = worldSpawns[i];
    const d = Math.abs(sp.y - player.y);
    if (d < 96 || d > 240) continue;
    if (sp.cd > 0) { sp.cd--; continue; }
    if (mrnd() < .06) {
      if (!ETYPE[sp.type]) { worldSpawns.splice(i--, 1); continue; }   // unknown type — drop the spot, never crash
      // verify the landing is air and there is still a floor (unless it flies)
      if (!(get(sp.x, sp.y) === MAT.AIR && (ETYPE[sp.type].fly || get(sp.x, sp.y + 1) !== MAT.AIR))) { sp.cd = 90; continue; }
      spawnEnemy(sp.type, sp.x + .5, sp.y, BIOMES[sp.band].tier);
      sp.cd = 60 * 9;
    }
  }
}

/* --------------------------------- boss ---------------------------------- */
function makeBoss(x, y) {
  const e = {
    id: entId++, type: 'boss', name: '熔渊巨眼', x, y, vx: 0, vy: 0,
    w: 36, h: 30, r: 16, hp: 460, max: 460, dead: false, flash: 0, burn: 0, slow: 0,
    phase: 0, ai: 0, cool: 90, anim: 0, tier: 5, goldN: 0, onGround: false, lidClose: 0,
  };
  return e;
}
function updateBoss() {
  const b = bossEnt;
  if (!b || b.dead) return;
  b.anim++;
  if (b.flash > 0) b.flash--;
  if (b.slow > 0) b.slow--;
  const rage = b.hp < b.max * .45;
  const px = player.x, py = player.y;
  const dx = px - b.x, dy = py - b.y, dist = Math.hypot(dx, dy);
  // drift toward player, keep altitude
  b.vx += Math.sign(dx) * .012 * (rage ? 1.5 : 1);
  b.vy += (Math.sign(dy - 26) * .014 + Math.sin(b.anim * .03) * .012);
  b.vx = clamp(b.vx, -1.1, 1.1); b.vy = clamp(b.vy, -.8, .8);
  if (!boxSolid(b, b.x + b.vx, b.y)) b.x += b.vx; else b.vx *= -.5;
  if (!boxSolid(b, b.x, b.y + b.vy)) b.y += b.vy; else b.vy *= -.5;
  if (b.anim % 7 === 0) spawnPart(b.x + (mrnd() - .5) * 22, b.y + 10 + mrnd() * 5, (mrnd() - .5) * .3, .3 + mrnd() * .4, 34, 0xff8a3e, { glow: 1, g: .01 });
  if ((b.anim % 4) === 0 && b.lidClose > 0) b.lidClose--;
  b.cool--;
  if (b.cool > 0) return;
  b.phase = (b.phase + 1) % 4;
  const sp = rage ? 1.4 : 1;
  if (b.phase === 0) { // radial barrage
    const n = rage ? 10 : 8;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2 + b.anim * .02;
      projectiles.push({
        id: 'bbolt', x: b.x + Math.cos(a) * 14, y: b.y + Math.sin(a) * 10,
        vx: Math.cos(a) * 2.4 * sp, vy: Math.sin(a) * 2.4 * sp - .6, grav: .02,
        dmg: 9, r: 2, life: 160, maxLife: 160, dig: 3, pierce: -1, homing: 0, bounce: 0, fire: 1, bossBolt: 1,
        light: 1, lightDef: { r: 255, g: 120, b: 40, rad: 12 }, col: rgb(255, 140, 60),
        hits: [], tick: 0, owner: 'enemy', hitsPlayer: true, liquid: null, expl: null, fuse: 0, drill: 0, trail: 0, trig: null, payload: [], freeze: 0, quench: 0, poison: 0,
      });
    }
    tone(90, 60, .3, 'sawtooth', .1);
    b.cool = 110 / sp;
  } else if (b.phase === 1) { // summon
    for (let k = 0; k < 2 + (rage ? 1 : 0); k++) spawnEnemy('bat', b.x + (mrnd() - .5) * 30, b.y + 12, 5);
    sparkBurst(b.x, b.y + 8, 14, 0xd88bff, 1.2, 1, .02);
    b.cool = 150;
  } else if (b.phase === 2) { // gaze beam: charge then fire a burning line
    b.beamAng = Math.atan2(dy, dx);
    b.beamCharging = 34; b.beamT = rage ? 52 : 40;
    b.cool = 210;
    tone(700, 1400, .5, 'sine', .05);
  } else { // tracked triple bolts
    for (let k = -1; k <= 1; k++) {
      const a = Math.atan2(dy, dx) + k * .22;
      enemyShoot(b, b.x + Math.cos(a) * 40, b.y + Math.sin(a) * 40, { spd: 3.4 * sp, dmg: 12, fire: 1, dig: 4, col: rgb(255, 170, 80), lightDef: { r: 255, g: 160, b: 70, rad: 12 } });
    }
    b.cool = 96 / sp;
  }
  if (b.beamCharging > 0) void 0;
}
function bossBeamTick() {
  const b = bossEnt;
  if (!b || b.dead) return false;
  if (b.beamCharging > 0) { b.beamCharging--; return false; }
  if (b.beamT > 0) {
    b.beamT--;
    const a = b.beamAng + Math.sin(b.beamT * .05) * .5;
    const ca = Math.cos(a), sa = Math.sin(a);
    let x = b.x, y = b.y;
    for (let s = 0; s < 110; s++) {
      x = b.x + ca * s; y = b.y + sa * s;
      const cx2 = x | 0, cy2 = y | 0;
      const m = get(cx2, cy2);
      if (SOLID[m]) { digRay(x, y, -ca, -sa, 8); if (m !== MAT.BED && m !== MAT.SACRED && mrnd() < .5) igniteAt(cx2, cy2); break; }
      if (mrnd() < .5) placeFire(cx2, cy2, 18);
      if (Math.abs(player.x - x) < 4 && Math.abs(player.y - 1 - y) < 5) hurtPlayer(1.4, 'fire', '巨眼的灼视');
    }
    spawnPart(b.x + ca * 30, b.y + sa * 30, (mrnd() - .5) * 2, (mrnd() - .5) * 2, 12, 0xffc98a, { glow: 1, g: 0 });
    return true;
  }
  return false;
}

/* ========================================================================== *
 *  PLAYER · PICKUPS · INTERACTION · PERKS
 * ========================================================================== */
function makePlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0, w: 6, h: 11,
    hp: 100, maxHp: 100, dead: false, inv: 0, face: 1, aimA: 0,
    anim: 0, onGround: false, coyote: 0, jbuf: 0,
    burn: 0, wet: 0, oil: 0, poison: 0, chill: 0, crush: 0, drown: 0,
    lastCause: '未知的厄运', lastDetail: '', bleedTimer: 0,
    perk: {}, inLiquid: 0, headLiquid: false, hoverT: 0,
  };
}
function playerBoxSolid(x, y, inflate = 0) {
  const hw = player.w / 2 + inflate, hh = player.h;
  for (const dy2 of [-hh + .5, -hh / 2, -.5]) {
    if (solidAt(x - hw, y + dy2) || solidAt(x + hw, y + dy2)) return true;
  }
  return solidAt(x, y - hh / 2) || solidAt(x, y - hh + .5);
}
function hurtPlayer(dmg, type, detail) {
  const p = player;
  if (!p || p.dead) return;
  if (p.inv > 0 && type === 'melee') return;
  if (p.perk.crystal) dmg *= .75;
  if (type === 'fire' && p.perk.fireward) dmg *= .45;
  dmg = Math.max(dmg, .4);
  p.hp -= dmg;
  p.lastCause = type;
  p.lastDetail = detail || p.lastDetail;
  if (dmg >= 3) {
    p.inv = Math.max(p.inv, 18);
    G.shake = Math.min(18, G.shake + dmg * .5);
    hurtFlashOn();
    SFX.hurt();
  }
  for (let k = 0; k < Math.min(8, dmg | 0) + 2; k++)
    spawnPart(p.x + (mrnd() - .5) * 4, p.y - 6 + (mrnd() - .5) * 6, (mrnd() - .5) * 1.5, -mrnd() * 1.6, 18 + mri(0, 14), 0xd05064, { g: .13 });
  const bi = p.y | 0, bx = p.x | 0;
  for (let k = 0; k < Math.min(6, dmg | 0); k++) { const fx = bx + mri(-2, 2), fy = bi - mri(0, 8); if (get(fx, fy) === MAT.AIR) setM(fx, fy, MAT.BLOOD); }
  if (p.hp <= 0) die();
}
const CAUSE_TEXT = {
  fire: '烈焰灼烧', burn: '烈焰焚身', lava: '熔岩', water: '溺水', acid: '酸液溶解', poison: '中毒',
  melee: '被撕碎', explosion: '爆炸', crush: '被掩埋压垮', fall: '摔落', ice: '冻毙', steam: '蒸汽',
  boss: '巨眼的注视', enemy: '敌手', falldeath: '坠落',
};
function die() {
  if (player.dead) return;
  player.dead = true; player.hp = 0;
  const t = player.lastCause;
  let reason;
  switch (t) {
    case 'burn': case 'fire': reason = '你被火焰吞噬，化为余烬。'; break;
    case 'lava': reason = '你坠入熔岩，瞬间汽化。'; break;
    case 'water': reason = '你沉在水底，无法呼吸。'; break;
    case 'acid': reason = '酸液蚀穿了你——连骨头也没有剩下。'; break;
    case 'poison': reason = '毒雾与菌毒在你的血脉里蔓延。'; break;
    case 'crush': reason = '塌落的砂土将你活埋，压成齑粉。'; break;
    case 'fall': reason = '大地接住了你，接得太用力了。'; break;
    case 'ice': reason = '寒冷冻结了你的心脉。'; break;
    case 'explosion': reason = '爆炸的闪光之后，再无之后。'; break;
    case 'melee': reason = '你在獠牙与利爪之间没能逃出半步。'; break;
    default: reason = '烬渊收下了你的性命。';
  }
  G.deathReason = reason;
  G.deathDetail = player.lastDetail || '';
  G.deathReasonKey = t;
  nearInteract = null;
  SFX.die();
  const bx = player.x | 0, by = player.y | 0;
  for (let k = 0; k < 40; k++) {
    const fx = bx + mri(-4, 4), fy = by - mri(0, 10);
    if (get(fx, fy) === MAT.AIR) setM(fx, fy, mrnd() < .7 ? MAT.BLOOD : MAT.AIR);
    if (mrnd() < .5) spawnPart(player.x, player.y - 5, (mrnd() - .5) * 3, -mrnd() * 2.6, 30 + mri(0, 30), mrnd() < .5 ? 0xd05064 : 0xe9b2d8, { g: .12 });
  }
  showDeath();
}
function updatePlayer() {
  const p = player;
  if (p.dead) { p.vy = Math.min(6.4, p.vy + .24); p.y += p.vy; const fy = p.y | 0; if (solidAt(p.x, fy + 1)) { p.y = fy; p.vy = 0; } return; }
  p.anim++;
  if (p.inv > 0) p.inv--;
  if (p.bleedTimer > 0 && p.bleedTimer-- % 3 === 0) spawnPart(p.x, p.y - 6, (mrnd() - .5), -.4, 24, 0xc23a4e, { g: .12 });
  if (p.hp < p.maxHp * .3 && p.anim % 4 === 0) p.bleedTimer = Math.max(p.bleedTimer, 2);
  else p.bleedTimer = 0;
  // aim
  const wx = G.camX + pointer.x, wy = G.camY + pointer.y;
  p.aimA = Math.atan2(wy - (p.y - 5), wx - p.x);
  if (Math.abs(wx - p.x) > 3) p.face = wx > p.x ? 1 : -1;
  // liquid state
  const headM = get(p.x | 0, (p.y - 9) | 0), bodyM = get(p.x | 0, (p.y - 4) | 0), feetM = get(p.x | 0, p.y | 0);
  p.headLiquid = LIQ[headM] === 1;
  p.inLiquid = (LIQ[bodyM] || LIQ[feetM]) ? 1 : 0;
  // ---- movement
  const slipM = M_SLIP[get(p.x | 0, p.y + 1)] === 1;
  const accel = p.onGround ? (p.oil > 0 || slipM ? .24 : .55) : .3;
  const tmax = 1.7 * (p.chill > 0 ? .55 : 1);
  if (input.left) p.vx -= accel;
  if (input.right) p.vx += accel;
  if (!input.left && !input.right) p.vx *= p.onGround ? (p.oil > 0 || slipM ? .99 : .7) : .96;
  p.vx = clamp(p.vx, -tmax, tmax);
  const grav = p.inLiquid ? .085 : .21;
  p.vy += grav;
  if (p.inLiquid) p.vy *= .94;
  if (p.vy > 6.4) p.vy = 6.4;
  // jump & float (Noita-style hover)
  if (input.jumpEdge) { p.jbuf = 8; input.jumpEdge = false; }
  if (p.jbuf > 0) p.jbuf--;
  if (p.coyote > 0) p.coyote--;
  if (p.jbuf > 0 && (p.onGround || p.coyote > 0)) {
    p.vy = p.inLiquid ? -2.4 : -4.0; p.onGround = false; p.coyote = 0; p.jbuf = 0; p.hoverT = 0;
    tone(300, 420, .06, 'square', .025);
  } else if (input.jump && !p.onGround) {
    const cap = p.inLiquid ? -1.6 : (p.perk.feather ? -1.7 : -1.05);
    const pull = p.inLiquid ? .1 : (p.perk.feather ? .13 : .085);
    if (p.vy > cap) { p.vy -= pull; if (p.hoverT++ % 8 === 0 && !p.inLiquid) spawnPart(p.x, p.y + 1, (mrnd() - .5) * .4, .3, 10, 0x9fb8d8, { g: 0 }); }
    else p.vy = clamp(p.vy + .04, cap - .2, cap + .5);
  }
  // buoyancy
  if (p.inLiquid) { const d = M_DEN[LIQ[bodyM] ? bodyM : feetM] || 100; p.vy -= .06 * (100 / d); }
  // fall damage
  const wasFalling = p.vy;
  // collide X
  let nx = p.x + p.vx;
  if (playerBoxSolid(nx, p.y)) {
    // step up 1px for ledges
    if (!playerBoxSolid(nx, p.y - 2) && (p.onGround || p.inLiquid)) { p.y -= 1.6; p.x = nx; }
    else { nx = p.x + Math.sign(p.vx) * .2; p.x = playerBoxSolid(nx, p.y) ? p.x : nx; p.vx = 0; }
  } else p.x = nx;
  // collide Y
  let ny = p.y + p.vy;
  if (playerBoxSolid(p.x, ny)) {
    if (p.vy > 0) {
      if (wasFalling > 5.6 && !p.inLiquid) { hurtPlayer((wasFalling - 5.6) * 26, 'fall', '从高处坠落'); }
      if (!p.inLiquid && wasFalling > 2.2) { for (let k = 0; k < 3; k++) spawnPart(p.x + (mrnd() - .5) * 6, p.y, (mrnd() - .5) * .8, -.3, 12, 0x9c9078, { g: .1 }); if (mrnd() < .3) SFX.hitStone(); }
      p.onGround = true; p.coyote = 6; p.hoverT = 0;
    }
    p.vy = 0;
  } else { if (p.onGround && p.vy >= 0) p.coyote = 5; p.onGround = false; }
  p.y = ny;
  p.x = clamp(p.x, 3, W - 3);
  if (p.y > H - 4) { hurtPlayer(999, 'crush', '坠入地底深处'); }
  if (p.y < 2) { p.y = 2; p.vy = Math.max(0, p.vy); }

  // ---- status & world interactions
  const inM = bodyM || feetM;
  if (p.wet > 0) p.wet--; if (p.oil > 0) p.oil--; if (p.chill > 0) p.chill--;
  if (p.inLiquid) {
    if (QUENCH[inM] || inM === MAT.WATER) { if (p.burn > 0) { p.burn = 0; spawnPart(p.x, p.y - 5, 0, -.6, 20, 0xdbeef5, { glow: 1 }); } p.wet = Math.min(300, p.wet + 6); }
    if (inM === MAT.OIL) p.oil = Math.min(300, p.oil + 10);
    if (inM === MAT.BLOOD && p.hp < p.maxHp && p.anim % 30 === 0) p.hp = Math.min(p.maxHp, p.hp + 1); // blood remembers the alchemist
  }
  // burning
  if ((headM === MAT.FIRE || bodyM === MAT.FIRE || feetM === MAT.FIRE)) {
    if (p.wet <= 0 && (p.oil > 0 || mrnd() < .2)) p.burn = Math.max(p.burn, p.oil > 0 ? 300 : 120);
  }
  if (p.burn > 0) {
    p.burn--;
    if (p.anim % 24 === 0) { hurtPlayer(p.maxHp * .02, 'burn', '被火焰烧穿'); }
    if (p.anim % 3 === 0) spawnPart(p.x + (mrnd() - .5) * 6, p.y - mri(0, 10), (mrnd() - .5) * .4, -.7, 16, mrnd() < .5 ? 0xff9b3f : 0xffd36b, { g: -.015, glow: 1 });
    if (p.burn % 60 === 5 && mrnd() < .5) SFX.burnHurt();
  }
  // lava / acid / toxic contact
  for (const mm of [headM, bodyM, feetM]) {
    if (mm === MAT.LAVA) { hurtPlayer(1.4, 'lava', '浸没在熔岩里'); p.burn = Math.max(p.burn, 260); }
    else if (mm === MAT.ACID) { hurtPlayer(0.45, 'acid', '被酸液侵蚀'); }
    else if (mm === MAT.PGAS) { hurtPlayer(0.14, 'poison', '吸入毒气'); p.poison = Math.max(p.poison, 120); }
    else if (mm === MAT.FGAS && p.burn > 0) { setM(p.x | 0, (p.y - 5) | 0, MAT.FIRE); }
    else if (mm === MAT.SLIME) { p.chill = Math.max(p.chill, 60); p.poison = Math.max(p.poison, 60); }
    else if (mm === MAT.FIRE) { /* handled above */ }
    else if (mm === MAT.STEAM && mrnd() < .06) hurtPlayer(1, 'steam', '被灼热的蒸汽烫伤');
  }
  if (p.poison > 0 && p.anim % 30 === 0) hurtPlayer(1.3, 'poison', p.lastDetail || '毒发');
  if (p.poison > 0) p.poison--;
  // drowning: only touching a gas cell refills the lungs — head packed into wet clay still drowns
  const headGas = headM === MAT.AIR || GAS[headM] === 1 || headM === MAT.STEAM || headM === MAT.SMOKE;
  if (!headGas && (p.inLiquid || p.headLiquid || SOLID[headM])) {
    p.drown++;
    if (p.drown === 240) toast('快浮出水面！');
    if (p.drown > 240 && p.drown % 20 === 0) { hurtPlayer(4, 'water', '溺毙于水中'); spawnPart(p.x + (mrnd() - .5) * 5, p.y - 10, 0, -.5, 14, 0xcfe8f5, { g: -.02 }); }
  } else p.drown = Math.max(0, p.drown - (headGas ? 9 : 3));
  // crushing by falling powder
  let pow = 0;
  for (let yy = -10; yy <= 0; yy += 3) for (let xx = -2; xx <= 2; xx += 4) if (POW[get((p.x | 0) + xx, (p.y | 0) + yy)]) pow++;
  if (pow >= 3) { p.crush++; if (p.crush % 18 === 0) hurtPlayer(2.2, 'crush', '被塌落的土石压住'); }
  else p.crush = 0;
  // ambient world audio light-up: standing in water flicks splash
  if (p.inLiquid && p.anim % 22 === 0 && Math.abs(p.vx) > .4 && mrnd() < .4) spawnPart(p.x, p.y, 0, -.35, 10, 0xbcd8ea, { g: .1 });
  // sanctuaries / perks / interaction zones
  sanctTick();
}

/* ---------------------------------- pickups ------------------------------- */
function makeGold(x, y, val) {
  return { kind: 'gold', x: x + (mrnd() - .5) * 2, y: y - 2, vx: (mrnd() - .5) * 1.4, vy: -1 - mrnd() * 1.6, val: 1 + (val || 0) * 2, life: 60 * 90, t: 0, r: 1.6 };
}
function makePickup(kind, x, y) {
  const o = { kind, x, y, vx: (mrnd() - .5) * .8, vy: -1.2, r: 3.4, t: mri(0, 30), data: null, open: false, hp: 14 };
  if (kind === 'chest') { o.w = 9; o.h = 7; o.vy = 0; o.vx = 0; o.r = 6; }
  if (kind === 'spell') o.data = pickSpellId();
  if (kind === 'wand') o.data = makeWand(1 + (bandIndexForY(y) >= 0 ? BIOMES[bandIndexForY(y)].tier : 1));
  return o;
}
function pickSpellId() {
  const pool = ['ember', 'arc', 'blast', 'glob', 'frost', 'drill', 'oilvial', 'jet', 'bomb', 'wisp', 'split', 'big', 'light', 'heavy', 'homing', 'bnc', 'trail', 'glow', 'war', 'pierce', 'trig', 'timer', 'blink', 'lamp', 'freeze'];
  return pool[mri(0, pool.length - 1)];
}
function bandIndexForY(y) {
  for (let bi = 0; bi < 5; bi++) { const b = BANDS[1 + bi * 2]; if (y >= b.y0 && y < b.y1) return bi; }
  return -1;
}
function updatePickups() {
  const p = player;
  for (let n = pickups.length - 1; n >= 0; n--) {
    const o = pickups[n];
    o.t++;
    if (o.kind === 'chest') continue;
    if (o.kind === 'gold') {
      o.vy = Math.min(o.vy + .2, 5); o.vx *= .96;
      const nx = o.x + o.vx, ny = o.y + o.vy;
      if (!solidAt(nx, o.y)) o.x = nx; else o.vx *= -.4;
      if (!solidAt(o.x, ny)) o.y = ny; else { if (o.vy > 0) o.vy = -o.vy * .25; else o.vy = 0; }
      const lm = get(o.x | 0, o.y | 0);
      if (LIQ[lm]) { o.vy -= .18; o.vx *= .8; }
      if (solidAt(o.x, o.y + 1)) o.vy = Math.min(o.vy, 0), o.y = (o.y | 0);
      const d = Math.hypot(p.x - o.x, p.y - 5 - o.y);
      if (d < 22) { o.vx += (p.x - o.x) / d * .5; o.vy += (p.y - 5 - o.y) / d * .5; }
      if (d < 6 && !p.dead) {
        G.gold += o.val; pickups.splice(n, 1); SFX.coin();
        player.perk.lucky && (G.gold += mri(0, 2));
        continue;
      }
      if (o.t > o.life) { pickups.splice(n, 1); continue; }
    } else {
      o.vy = Math.min(o.vy + .18, 4.5); o.vx *= .94;
      const lm = get(o.x | 0, o.y | 0);
      if (LIQ[lm]) o.vy -= .2;
      const ny = o.y + o.vy;
      if (!solidAt(o.x, ny + 1)) o.y = ny; else { o.vy = -o.vy * .2; if (Math.abs(o.vy) < .3) o.vy = 0; }
      const nx = o.x + o.vx;
      if (!solidAt(nx, o.y)) o.x = nx; else o.vx = 0;
      const d = Math.hypot(p.x - o.x, p.y - 5 - o.y);
      if (d < 7 && !p.dead) { collectItem(o, n); continue; }
    }
  }
}
function collectItem(o, n) {
  if (o.kind === 'heart') { player.hp = Math.min(player.maxHp, player.hp + 25); SFX.heal(); toast('✚ 恢复 25 点生命'); }
  else if (o.kind === 'gold') { G.gold += o.val; SFX.coin(); }
  else if (o.kind === 'spell') { addSpellToWand(o.data); }
  else if (o.kind === 'wand') { takeWand(o.data); }
  pickups.splice(n, 1);
}
function addSpellToWand(id) {
  const w = curWand();
  if (!SPELLS[id]) { toast('不明法术消散了'); return; }
  if (w.slots.length < w.cap) { w.slots.push(id); toast(`获得法术【${SPELLS[id].n}】→ 已装入 ${w.name}`); SFX.pickup(); }
  else {
    // replace the most expensive weak spell, or reject
    toast(`【${SPELLS[id].n}】无处可放 —— 杖满 (${w.cap} 槽)`); SFX.err();
  }
  renderWandHud();
}
function takeWand(w) {
  if (gWands.length < 4) { gWands.push(w); G.curWand = gWands.length - 1; toast(`拾取法杖【${w.name}】`); }
  else { const old = gWands[G.curWand].name; gWands[G.curWand] = w; toast(`换下【${old}】，装备【${w.name}】`); }
  SFX.pickup(); renderWandHud();
}
function breakChest(o, byForce) {
  if (o.open) return;
  o.open = true;
  SFX.open();
  sparkBurst(o.x, o.y - 4, 12, 0xd8b36a, 1.4, 0, .1);
  const nG = 8 + mri(0, 14);
  for (let k = 0; k < nG; k++) pickups.push(makeGold(o.x, o.y - 4, 1 + bandIndexForY(o.y) > 0 ? 1 : 0));
  const roll = mrnd();
  if (roll < .42) pickups.push(makePickup('spell', o.x - 4, o.y - 6));
  if (roll < .62) pickups.push(makePickup('wand', o.x + 4, o.y - 6));
  if (roll > .8) pickups.push(makePickup('heart', o.x, o.y - 6));
  if (byForce) toast('宝箱被炸开了，钱币四散！');
}

/* ------------------------------- interaction ------------------------------ */
let nearInteract = null;
function findInteract() {
  nearInteract = null;
  const p = player, bx = p.x, by = p.y - 5;
  for (const o of pickups) {
    if (o.kind === 'chest' && !o.open && Math.abs(o.x - bx) < 14 && Math.abs(o.y - by) < 16) { nearInteract = { t: 'chest', o }; return; }
  }
  for (const s of sancts) {
    if (Math.abs(bx - s.bench.x) < 15 && Math.abs(by - s.bench.y) < 16) { nearInteract = { t: 'bench', s }; return; }
    if (!s.perkTaken && s.altar && !s.isHub && Math.abs(bx - s.altar.x) < 16 && Math.abs(by - s.altar.y) < 16) { nearInteract = { t: 'altar', s }; return; }
  }
}
function sanctTick() {
  const p = player;
  for (const f of fountainPool) {
    if (Math.abs(p.x - f.x) < f.r + 4 && Math.abs(p.y - f.y) < 10) {
      if (p.hp < p.maxHp && G.frame % 12 === 0) { p.hp = Math.min(p.maxHp, p.hp + 2); SFX.heal && G.frame % 36 === 0 && SFX.heal(); }
      if (p.burn > 0) p.burn = 0;
      if (G.frame % 10 === 0) spawnPart(f.x + (mrnd() - .5) * 8, f.y - 2, 0, -.5, 16, 0xd7ecf5, { glow: 1, g: -.02 });
    }
  }
}
function tryInteractEdge() {
  if (G.state === 'panel') { closePanels(); return; }
  if (G.state !== 'play') return;
  findInteract();
  if (!nearInteract) { return; }
  const it = nearInteract;
  if (it.t === 'chest') breakChest(it.o);
  else if (it.t === 'bench') openBench();
  else if (it.t === 'altar') openPerks(it.s);
}
function tryBenchEdge() {
  if (G.state === 'panel') { closePanels(); return; }
  if (G.state !== 'play') return;
  if (player.perk.tinker) openBench();
}

/* ---------------------------------- perks --------------------------------- */
const PERKS = [
  { id: 'feather',  n:'轻羽浮升',   d:'悬浮上升更快，上限更高。', apply: () => { player.perk.feather = 1; } },
  { id: 'bloodecho',n:'血之回响',   d:'击杀敌人时恢复 4 点生命。', apply: () => { player.perk.bloodecho = 1; hookKillHeal(); } },
  { id: 'crystal',  n:'水晶皮肤',   d:'受到的所有伤害降低 25%。', apply: () => { player.perk.crystal = 1; } },
  { id: 'fireward', n:'灼心亲和',   d:'火焰伤害降低 55%，燃烧更久不致命。', apply: () => { player.perk.fireward = 1; } },
  { id: 'deepmana', n:'深囊扩容',   d:'所有法杖魔力上限 +25，回复 +6/秒。', apply: () => { player.perk.deepmana = 1; gWands.forEach(w => { w.manaMax += 25; w.mana += 25; w.manaRegen += 6; }); } },
  { id: 'tinker',   n:'匠手无界',   d:'随时随地按 Tab 打开法杖编辑。', apply: () => { player.perk.tinker = 1; } },
  { id: 'boomheart',n:'爆燃之心',   d:'你的爆炸范围与威力 +30%。', apply: () => { player.perk.boomheart = 1; } },
  { id: 'alchemy',  n:'炼金血液',   d:'敌人死亡时额外掉落金币与血雾。', apply: () => { player.perk.alchemy = 1; } },
  { id: 'lucky',    n:'拾荒好运',   d:'金币价值 +25%，宝箱更慷慨。', apply: () => { player.perk.lucky = 1; } },
];
let healHooked = false;
function hookKillHeal() { if (healHooked) return; healHooked = true; const orig = killEnemy; /* healing applied inline in hurt path */ }

/* ========================================================================== *
 *  RENDERING — terrain pixels, emissive light field, entities, composite
 * ========================================================================== */
const LW = VW >> 1, LH = VH >> 1;
const lr = new Float32Array(LW * LH), lg = new Float32Array(LW * LH), lb = new Float32Array(LW * LH);
const lr2 = new Float32Array(LW * LH), lg2 = new Float32Array(LW * LH), lb2 = new Float32Array(LW * LH);
const fxLights = [];   // transient {x,y,r,life,max,c:[r,g,b],i}

function addLight(wx, wy, rad, cr, cg, cb, inten = 1) {
  const x0 = wx - G.camX, y0 = wy - G.camY;
  if (x0 < -rad - 4 || x0 > VW + rad + 4 || y0 < -rad - 4 || y0 > VH + rad + 4) return;
  const lx0 = Math.max(0, (x0 - rad) >> 1), lx1 = Math.min(LW - 1, (x0 + rad) >> 1);
  const ly0 = Math.max(0, (y0 - rad) >> 1), ly1 = Math.min(LH - 1, (y0 + rad) >> 1);
  const r2 = rad * rad;
  for (let ly = ly0; ly <= ly1; ly++) {
    const dy = (ly * 2 - y0);
    for (let lx = lx0; lx <= lx1; lx++) {
      const dx = (lx * 2 - x0);
      const d2 = dx * dx + dy * dy;
      const v = Math.max(0, 1 - d2 / (r2 * 1.35)) * inten;
      if (v <= 0) continue;
      const j = ly * LW + lx;
      lr[j] += cr * v; lg[j] += cg * v; lb[j] += cb * v;
    }
  }
}
function blurLight() {
  for (let pass = 0; pass < 2; pass++) {
    // horizontal
    for (let y = 0; y < LH; y++) {
      const base = y * LW;
      let pr = lr[base], pg = lg[base], pb = lb[base];
      for (let x = 0; x < LW; x++) {
        const j = base + x, nx = x < LW - 1 ? j + 1 : j;
        const nlr = (pr + lr[j] * 2 + lr[nx]) * .25, nlg = (pg + lg[j] * 2 + lg[nx]) * .25, nlb = (pb + lb[j] * 2 + lb[nx]) * .25;
        lr2[j] = nlr; lg2[j] = nlg; lb2[j] = nlb;
        pr = lr[j]; pg = lg[j]; pb = lb[j];
      }
    }
    lr.set(lr2); lg.set(lg2); lb.set(lb2);            // whole buffer at once — NOT per row
    // vertical
    for (let x = 0; x < LW; x++) {
      let pu = lr[x], pug = lg[x], pub = lb[x];
      for (let y = 0; y < LH; y++) {
        const j = y * LW + x, ny = y < LH - 1 ? j + LW : j;
        lr2[j] = (pu + lr[j] * 2 + lr[ny]) * .25; lg2[j] = (pug + lg[j] * 2 + lg[ny]) * .25; lb2[j] = (pub + lb[j] * 2 + lb[ny]) * .25;
        pu = lr[j]; pug = lg[j]; pub = lb[j];
      }
    }
    lr.set(lr2); lg.set(lg2); lb.set(lb2);
  }
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function ambientAt(wy) {
  const b = bandAt(wy);
  if (b.t === 'sky') return null;                       // special sky gradient
  if (b.t === 'sanct') return [.60, .48, .40, 30, 24, 18];
  const B = BIOMES[b.b];
  const a = B.ambient, t = B.amb;                       // tinted cave haze, the band's own hue
  const k = a * 1.5 / ((t[0] + t[1] + t[2]) / 3);
  return [t[0] * k, t[1] * k, t[2] * k, t[0], t[1], t[2]];
}
function draw() {
  // ---- camera (with damage shake) ----
  const tgtX = clamp(player.x - VW / 2, 0, W - VW);
  const tgtY = clamp(player.y - VH * .52, 0, H - VH);
  G.camX += (tgtX - G.camX) * .22; G.camY += (tgtY - G.camY) * .3;
  let shx = 0, shy = 0;
  if (G.shake > .2) { shx = (mrnd() - .5) * G.shake * .8; shy = (mrnd() - .5) * G.shake * .8; G.shake *= .86; } else G.shake = 0;
  const cx0 = (G.camX + shx) | 0, cy0 = (G.camY + shy) | 0;
  const f = G.frame;
  lr.fill(0); lg.fill(0); lb.fill(0);
  const surfH = G.surfH;
  let emitBudget = 320;
  /* ---- pass 1: terrain colors into buf + ambient light rows + emissive splats ---- */
  for (let sy = 0; sy < VH; sy++) {
    const wy = cy0 + sy;
    const amb = ambientAt(wy);
    const bufRow = sy * VW;
    const isTop = (sy & 1) === 0;
    const lj = (sy >> 1) * LW;
    if (isTop) {                                   // seed this light row pair with the band ambient
      const ar = amb ? amb[0] : 1, ag = amb ? amb[1] : 1, ab = amb ? amb[2] : 1;
      for (let lx = 0; lx < LW; lx++) { lr[lj + lx] = ar; lg[lj + lx] = ag; lb[lj + lx] = ab; const j2 = lj + LW + lx; if (j2 < LW * LH) { lr[j2] = ar; lg[j2] = ag; lb[j2] = ab; } }
    }
    for (let sx = 0; sx < VW; sx++) {
      const wx = cx0 + sx;
      const inW = wx >= 0 && wx < W && wy >= 0 && wy < H;
      const i = inW ? wy * W + wx : -1;
      const m = i >= 0 ? cells[i] : MAT.BED;
      if (m === MAT.AIR) {
        if (!amb) {
          // dusk sky: purple zenith → ember horizon, faint stars (Noita mountaintop mood)
          const hs = surfH ? surfH[wx] : 100;
          const t = clamp((sy - hs + 6) / (VH - hs + 8), 0, 1);
          let r = (14 + t * 96) | 0, g2 = (10 + t * 30) | 0, b2 = (26 + t * 66) | 0;
          if (t > .55) { const k = (t - .55) / .45; r = (r + k * 120) | 0; g2 = (g2 + k * 38) | 0; b2 = (b2 + k * 6) | 0; }
          const hh = hashXY(wx, wy);
          if (inW && wy < hs - 30 && hh < 3 && t < .62 && ((wx * 7 + wy * 13 + (f >> 3)) & 63) !== 0) {
            const br = hh === 0 ? 200 : hh === 1 ? 132 : 84;
            r = br; g2 = br + 6; b2 = 200;
          }
          buf[bufRow + sx] = (255 << 24) | ((clamp(b2, 0, 255) << 16) | (clamp(g2, 0, 255) << 8) | clamp(r, 0, 255));
        } else buf[bufRow + sx] = (255 << 24) | (amb[5] << 16) | (amb[4] << 8) | amb[3];
        continue;
      }
      const n = i >= 0 ? seedN[i] : 7;
      let c;
      if (m === MAT.FIRE || M_EMBER[m]) c = PAL[m * 8 + ((n + (f >> 1)) & 3)];
      else if (m === MAT.TNT && aux[i] > 0 && ((f >> 1) & 1)) c = (255 << 24) | 0xffffff;
      else {
        c = PAL[m * 8 + (n & 3)];
        if (LIQ[m] && get(wx, wy - 1) === MAT.AIR) c = PAL[m * 8 + 6];
        else if (SOLID[m] && get(wx, wy - 1) === MAT.AIR) c = PAL[m * 8 + 5];
      }
      buf[bufRow + sx] = c;
      const em = M_LIGHT[m];
      if (em && emitBudget > 0 && i >= 0) {
        emitBudget--;
        const L = LIGHTS[em];
        const flick = L.flick ? .75 + .45 * Math.sin(f * .3 + n) : 1;
        const rad = L.rad;
        const lx0 = Math.max(0, (sx - rad) >> 1), lx1 = Math.min(LW - 1, (sx + rad) >> 1);
        const ly0 = Math.max(0, (sy - rad) >> 1), ly1 = Math.min(LH - 1, (sy + rad) >> 1);
        for (let ly = ly0; ly <= ly1; ly++) {
          const dy = ly * 2 - sy;
          const jr = ly * LW;
          for (let lx = lx0; lx <= lx1; lx++) {
            const dx = lx * 2 - sx;
            const d2 = dx * dx + dy * dy;
            const v = Math.max(0, 1 - d2 / (rad * rad * 1.4)) * L.i * flick * .55;
            if (v <= 0) continue;
            const j = jr + lx;
            lr[j] += L.r / 255 * v; lg[j] += L.g / 255 * v; lb[j] += L.b / 255 * v;
          }
        }
      }
    }
  }
  /* ---- pass 2: entity lights, sprites ---- */
  for (const L of fxLights) addLight(L.x, L.y, L.r * (1 - L.life / L.max * .4), L.c[0] / 255, L.c[1] / 255, L.c[2] / 255, L.i * (L.life / L.max));
  if (!player.dead) addLight(player.x, player.y - 6, 30, 1, .82, .62, .34);
  if (player.burn > 0) addLight(player.x, player.y - 5, 26, 1, .5, .15, .9);
  for (const e of enemies) { if (e.burn > 0) addLight(e.x, e.y - 2, 18, 1, .55, .18, .8); }
  for (const p of projectiles) {
    if (p.light && p.lightDef) addLight(p.x, p.y, p.lightDef.rad, p.lightDef.r / 255, p.lightDef.g / 255, p.lightDef.b / 255, 1);
    else if (p.fire) addLight(p.x, p.y, 10, 1, .6, .2, .8);
  }
  if (bossEnt && !bossEnt.dead) {
    addLight(bossEnt.x, bossEnt.y, 44, 1, .45, .2, .5);
    if (bossEnt.beamCharging > 0) addLight(bossEnt.x, bossEnt.y, 30 + (34 - bossEnt.beamCharging), 1, .3, .1, .8);
  }
  drawSprites(cx0, cy0);
  blurLight();
  /* ---- pass 3: composite darkness with ordered dither (Noita's crushed blacks) ---- */
  const flashAdd = G.flash;
  for (let sy = 0; sy < VH; sy++) {
    const row = sy * VW, lrow = (sy >> 1) * LW;
    const bayerRow = (sy & 3) << 2;
    for (let sx = 0; sx < VW; sx++) {
      const j = lrow + (sx >> 1);
      let Lr = lr[j] * 1.30, Lg = lg[j] * 1.30, Lb = lb[j] * 1.32;
      if (flashAdd > 0) { Lr += flashAdd * .85; Lg += flashAdd * .78; Lb += flashAdd * .55; }
      const dith = (BAYER[bayerRow | (sx & 3)] / 15 - .5) * .05;
      const v = buf[row + sx];
      let r = (v & 255) * (Lr + dith), g2 = ((v >>> 8) & 255) * (Lg + dith), b2 = ((v >>> 16) & 255) * (Lb + dith);
      if (r > 255) r = 255; if (g2 > 255) g2 = 255; if (b2 > 255) b2 = 255;
      if (r < 0) r = 0; if (g2 < 0) g2 = 0; if (b2 < 0) b2 = 0;
      buf[row + sx] = (255 << 24) | (b2 << 16) | (g2 << 8) | r;
    }
  }
  drawGlow(cx0, cy0);
  if (G.flash > 0) G.flash = Math.max(0, G.flash * .8);
  ctx.putImageData(img, 0, 0);
  for (let n = fxLights.length - 1; n >= 0; n--) { if (--fxLights[n].life <= 0) fxLights.splice(n, 1); }
}
function addFxLight(x, y, r, c, i, life) { fxLights.push({ x, y, r, c, i, life, max: life }); }
function drawGlow(cx0, cy0) {
  // additive pass for glowing particles & beams & projectiles — they shine in the dark
  for (const p of parts) {
    if (!p.live || !p.glow) continue;
    const x = (p.x - cx0) | 0, y = (p.y - cy0) | 0;
    if (x < 0 || y < 0 || x >= VW || y >= VH) continue;
    const t = p.life / p.max;
    const v = buf[y * VW + x];
    const pr2 = ((p.c >> 16) & 255) * t * .95, pg2 = ((p.c >> 8) & 255) * t * .95, pb2 = (p.c & 255) * t * .95;
    let r = ((v & 255) + pr2) | 0, g2 = (((v >>> 8) & 255) + pg2) | 0, b2 = (((v >>> 16) & 255) + pb2) | 0;
    if (r > 255) r = 255; if (g2 > 255) g2 = 255; if (b2 > 255) b2 = 255;
    buf[y * VW + x] = (255 << 24) | (b2 << 16) | (g2 << 8) | r;
  }
  for (const p of projectiles) {
    const x = (p.x - cx0) | 0, y = (p.y - cy0) | 0;
    if (x < 0 || y < 0 || x >= VW || y >= VH) continue;
    const c = p.col;   // ABGR, matches buffer byte order
    if (p.owner !== 'enemy' && !p.light && !p.fire) { buf[y * VW + x] = c; continue; }
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const xx = x + ox, yy = y + oy;
      if (xx < 0 || yy < 0 || xx >= VW || yy >= VH) continue;
      const w2 = (ox === 0 && oy === 0) ? 1 : .35;
      const v = buf[yy * VW + xx];
      let r = (v & 255) + (c & 255) * w2 | 0, g2 = ((v >>> 8) & 255) + ((c >>> 8) & 255) * w2 | 0, b2 = ((v >>> 16) & 255) + ((c >>> 16) & 255) * w2 | 0;
      if (r > 255) r = 255; if (g2 > 255) g2 = 255; if (b2 > 255) b2 = 255;
      if (r < 0) r = 0; if (g2 < 0) g2 = 0; if (b2 < 0) b2 = 0;
      buf[yy * VW + xx] = (255 << 24) | (b2 << 16) | (g2 << 8) | r;
    }
  }
  // boss beam
  const b = bossEnt;
  if (b && !b.dead && b.beamT > 0) {
    const a = b.beamAng + Math.sin(b.beamT * .05) * .5;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let s = 0; s < 130; s++) {
      const x = ((b.x + ca * s) - cx0) | 0, y = ((b.y + sa * s) - cy0) | 0;
      if (x < 0 || y < 0 || x >= VW || y >= VH) continue;
      const w2 = 1 - s / 150;
      const v = buf[y * VW + x];
      let r = (v & 255) + 255 * w2 | 0, g2 = ((v >>> 8) & 255) + (140 * w2) | 0, b2 = ((v >>> 16) & 255) + (60 * w2) | 0;
      if (r > 255) r = 255; if (g2 > 255) g2 = 255; if (b2 > 255) b2 = 255;
      if (r < 0) r = 0; if (g2 < 0) g2 = 0; if (b2 < 0) b2 = 0;
      buf[y * VW + x] = (255 << 24) | (b2 << 16) | (g2 << 8) | r;
    }
  }
  // crosshair
  const p2 = player;
  if (G.state === 'play' && !p2.dead) {
    const ax = (G.camX + pointer.x) | 0, ay = (G.camY + pointer.y) | 0;
    const a2x = (ax - cx0) | 0, a2y = (ay - cy0) | 0;
    const col = (255 << 24) | (255 << 16) | (255 << 8) | 255;
    if (a2x >= 0 && a2x < VW && a2y >= 0 && a2y < VH) {
      for (const [ox, oy] of [[-3, 0], [-2, 0], [2, 0], [3, 0], [0, -3], [0, -2], [0, 2], [0, 3]]) {
        const xx = a2x + ox, yy = a2y + oy;
        if (xx >= 0 && xx < VW && yy >= 0 && yy < VH) buf[yy * VW + xx] = col;
      }
    }
  }
}

/* ------------------------------- sprites ---------------------------------- */
function px(sx, sy, c) {          // sprite colors are given as 0xRRGGBB
  if (sx < -2 || sy < -2 || sx >= VW || sy >= VH) return;
  const r = (c >> 16) & 255, g2 = (c >> 8) & 255, b2 = c & 255;
  buf[sy * VW + sx] = (255 << 24) | (b2 << 16) | (g2 << 8) | r;
}
function rect(sx, sy, w2, h2, c) { for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) px(sx + x, sy + y, c); }
function drawSprites(cx0, cy0) {
  // pickups
  for (const o of pickups) {
    const x = (o.x - cx0) | 0, y = (o.y - cy0) | 0;
    if (x < -8 || y < -8 || x > VW + 8 || y > VH + 8) continue;
    const bob = Math.sin((o.t + G.frame) * .12) * 1.2 | 0;
    if (o.kind === 'gold') { px(x, y, 0xffd860); px(x + 1, y, 0xe8a83c); px(x, y + 1, 0xc88a28); px(x + 1, y + 1, 0xfff0a0); }
    else if (o.kind === 'heart') { rect(x - 1, y - 2 + bob, 2, 1, 0xff6b74); rect(x, y - 1 + bob, 2, 1, 0xff6b74); rect(x - 1, y + bob, 3, 1, 0xd94a58); rect(x, y + 1 + bob, 1, 1, 0x8f2e3a); }
    else if (o.kind === 'spell') { rect(x - 2, y - 3 + bob, 4, 5, 0xd9cba2); rect(x - 1, y - 2 + bob, 2, 3, 0x2b2f45); px(x, y - 1 + bob, 0x7ad8ff); }
    else if (o.kind === 'wand') { rect(x - 3, y + bob, 6, 1, 0x8a6a42); px(x + 3, y - 1 + bob, 0x9fe3ff); px(x + 3, y + bob, 0xd9f4ff); }
    else if (o.kind === 'chest') {
      if (o.open) { rect(x - 4, y - 1, 9, 5, 0x4a3520); rect(x - 4, y - 4, 9, 2, 0x6b4c2a); }
      else { rect(x - 4, y - 6, 9, 6, 0x6b4c2a); rect(x - 4, y - 3, 9, 1, 0xd9a845); rect(x - 1, y - 4, 2, 3, 0xf0d080); rect(x - 4, y - 6, 9, 1, 0x8a6337); }
    }
  }
  // enemies
  for (const e of enemies) drawEnemy(e, cx0, cy0);
  if (bossEnt && !bossEnt.dead) drawBoss(cx0, cy0);
  // non-glow particles (lit like the world)
  for (const p of parts) {
    if (!p.live || p.glow) continue;
    px((p.x - cx0) | 0, (p.y - cy0) | 0, p.c);
  }
  // player
  if (!player.dead) drawPlayer(cx0, cy0);
}
function shadeFlash(c, on) { return on ? 0xffffff : c; }
function drawPlayer(cx0, cy0) {
  const p = player;
  const sx = (p.x - cx0 - 3) | 0, sy = (p.y - cy0 - 11) | 0;
  const fl = p.inv > 0 && (G.frame & 3) === 0;
  const walk = (Math.abs(p.vx) > .3 && p.onGround) ? Math.floor(p.anim / 6) & 1 : 0;
  const robe = shadeFlash(0x6f5b96, fl), robe2 = shadeFlash(0x59487c, fl), skin = shadeFlash(0xe8c6a8, fl);
  const hat = shadeFlash(0x3f3560, fl), trim = shadeFlash(0xd9b84e, fl);
  rect(sx + 1, sy, 4, 2, hat); rect(sx, sy + 1, 6, 1, hat);
  rect(sx + 1, sy + 3, 4, 2, skin);
  rect(sx + 2, sy + 3, 1, 1, fl ? 0xff6b6b : 0x2b2f45);   // eyes
  rect(sx + 4, sy + 3, 1, 1, fl ? 0xff6b6b : 0x2b2f45);
  rect(sx + 1, sy + 5, 4, 5, robe);
  rect(sx + 1, sy + 5, 4, 1, robe2);
  px(sx + 1, sy + 9, robe2); px(sx + 4, sy + 9, robe2);
  // legs
  if (walk) { px(sx + 1, sy + 10, 0x2b2445); px(sx + 4, sy + 10, 0x2b2445); }
  else if (p.onGround) { px(sx + 2, sy + 10, 0x2b2445); px(sx + 3, sy + 10, 0x2b2445); }
  else { px(sx + 1, sy + 10, 0x2b2445); px(sx + 4, sy + 9, 0x2b2445); }
  // wand arm along aim
  const a = p.aimA, ca = Math.cos(a), sa = Math.sin(a);
  const hx = (p.x + ca * 5 - cx0) | 0, hy = (p.y - 6 + sa * 5 - cy0) | 0;
  rect(hx - (ca < 0 ? 2 : 0), hy - (sa < 0 ? 1 : 0), 2, 1, 0x7a5b3a);
  px(hx + (ca > 0 ? 1 : -1), hy + (sa > 0 ? 0 : -0), 0xbfe8ff);
  const w = curWand();
  if (w && w.cd > 0 && w.cd > w.castDelay - 4) px(hx + (ca > 0 ? 1 : -1), hy, 0xffffff);
  if (p.burn > 0 && (G.frame & 1) === 0) px(sx + 2 + (G.frame % 3), sy + 1 + (G.frame % 4), 0xffa63f);
}
function drawEnemy(e, cx0, cy0) {
  const sx = (e.x - cx0 - e.w / 2) | 0, sy = (e.y - cy0 - e.h / 2) | 0;
  const fl = e.flash > 0;
  const dir = e.dir >= 0 ? 1 : -1;
  const T = ETYPE[e.type];
  if (!T) return;
  const base = shadeFlash(T.color, fl);
  const dark = shadeFlash(0x24283a, fl);
  switch (e.type) {
    case 'grub': {
      rect(sx, sy + 1, 7, 6, base);
      rect(sx + 1, sy, 5, 1, 0x7f9084 === 0 ? base : shadeFlash(0x7f9084, fl));      // spine ridge
      px(sx + (dir > 0 ? 5 : 1), sy + 3, dark); px(sx + (dir > 0 ? 5 : 1), sy + 4, 0xff8b5e); // eye
      const wob = Math.floor(e.anim / 8) & 1;
      px(sx + 1, sy + 7 + wob, dark); px(sx + 5, sy + 7 - wob, dark);
      break;
    }
    case 'bat': {
      const flap = Math.floor(e.anim / 5) % 3;
      rect(sx + 2, sy + 1, 4, 3, base);
      if (flap === 0) { rect(sx, sy, 2, 1, base); rect(sx + 6, sy, 2, 1, base); }
      else if (flap === 1) { rect(sx, sy + 1, 2, 1, base); rect(sx + 6, sy + 1, 2, 1, base); }
      else { rect(sx, sy + 2, 2, 1, base); rect(sx + 6, sy + 2, 2, 1, base); }
      px(sx + 3, sy + 2, 0xffe27a);
      break;
    }
    case 'sniper': {
      rect(sx + 1, sy, 5, 3, base);                 // head/hood
      rect(sx, sy + 3, 7, 5, shadeFlash(0x8a3f4a, fl));
      px(sx + (dir > 0 ? 4 : 2), sy + 1, 0x2b2f45);
      rect(sx + (dir > 0 ? 6 : -2), sy + 4, 2, 1, 0x454b63); // gun
      if (e.cool > 68) rect(sx + (dir > 0 ? 8 : -4), sy + 4, 1, 1, 0xffe08a);
      break;
    }
    case 'boomer': {
      const pulse = e.fuse && e.fuse < 20 ? (G.frame >> 1) % 2 : 0;
      rect(sx, sy, 8, 6, pulse ? 0xffd27a : base);
      rect(sx + 1, sy + 1, 6, 1, pulse ? 0xff7a3c : 0xb35c22);
      px(sx + 2, sy + 3, dark); px(sx + 5, sy + 3, dark);
      break;
    }
    case 'slimer': {
      const squish = e.onGround ? ((e.anim % 40 < 6) ? 2 : 0) : -1;      // squash on landing, stretch in air
      rect(sx, sy + 2 + squish, 12 - squish * 2, 7 - squish, base);
      rect(sx + 1, sy + 1 + squish, 10 - squish * 2, 2, 0xb8e88e);
      px(sx + 3, sy + 4 + squish, dark); px(sx + 8, sy + 4 + squish, dark);
      px(sx + (e.anim % 26 >> 3) + 2, sy + (e.anim >> 2 & 1) ? sy + 6 : sy + 6, 0xd8ff9a);
      break;
    }
    case 'worm': {
      const seg = Math.floor(e.anim / 6) & 1;
      rect(sx, sy + 1 + seg, 11, 6, base);
      rect(sx + (e.vx >= 0 ? 8 : 0), sy + seg, 3, 3, 0xf0d0e0);
      px(sx + (e.vx >= 0 ? 9 : 1), sy + 1 + seg, 0x5a2660);
      break;
    }
    case 'spitter': {
      const puff = (e.cool && e.cool > 84) ? 1 : 0;
      rect(sx + 1, sy + 2, 6, 6 - puff, base);
      rect(sx + 2, sy, 4, 3, 0xa7d88a);
      px(sx + 3, sy + 1, dark); px(sx + 4, sy + 1, dark);
      if (puff) { px(sx + (dir > 0 ? 7 : 0), sy + 2, 0xd8ff9a); }
      break;
    }
  }
  if (e.burn > 0) { const fx2 = (G.frame >> 1) % 3; px(sx + 2 + fx2, sy - 1 - (fx2 & 1), 0xffa63f); px(sx + 4, sy - 2, 0xffd36b); }
  if (e.slow > 0) { px(sx + 1, sy - 1, 0xaee2ff); px(sx + 5, sy - 2, 0xaee2ff); }
}
function drawBoss(cx0, cy0) {
  const b = bossEnt, sx = (b.x - cx0) | 0, sy = (b.y - cy0) | 0;
  const fl = b.flash > 0;
  const body = fl ? 0xffffff : 0x742a4a;
  const lid = fl ? 0xffffff : 0x4a1c30;
  // fleshy orb with a molten iris
  for (let y = -14; y <= 14; y++) for (let x = -16; x <= 16; x++) {
    const d2 = x * x / (16 * 16) + y * y / (14 * 14);
    if (d2 > 1) continue;
    const wob = Math.sin(b.anim * .06 + x * .3) * 1.5 | 0;
    if (Math.abs(x) < 8 && Math.abs(y + wob) < 6) {
      // eye
      const isBeam = b.beamT > 0 || b.beamCharging > 0;
      if (isBeam && ((G.frame >> 1) & 1) && Math.abs(x) < 6) px(sx + x, sy + y + wob, 0xffe8a0);
      else px(sx + x, sy + y + wob, 0xf6e3b2);
      if (Math.abs(x) < 4 && Math.abs(y + wob) < 4) px(sx + x, sy + y + wob, isBeam ? 0xff9a3c : 0xd97428);
      if (Math.abs(x) < 2 && Math.abs(y + wob) < 2) px(sx + x, sy + y + wob, 0x2a0f16);
    } else px(sx + x, sy + y + wob, body);
  }
  // veins
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + b.anim * .01;
    px(sx + Math.cos(a) * 13, sy + Math.sin(a) * 11, 0xa13b58);
  }
  // hp pip bar (subtle, noita-ish floating)
  if (b.hp < b.max) {
    const bw = 40;
    for (let x = 0; x < bw; x++) {
      const on = x / bw < b.hp / b.max;
      px(sx - bw / 2 + x, sy - 20, on ? 0xff6b74 : 0x3c2430);
    }
  }
}

/* ========================================================================== *
 *  UI — HUD, toast, bench editor, perk altar, overlays
 * ========================================================================== */
let toastT = 0, toastQ = '';
function toast(msg) { const el = $('toast'); if (!el) return; el.textContent = msg; el.style.opacity = 1; toastT = 170; }
function tickToast() { if (toastT > 0 && --toastT === 0) { const el = $('toast'); if (el) el.style.opacity = 0; } }
function hurtFlashOn() { const el = $('hurtFlash'); if (!el) return; el.classList.add('on'); clearTimeout(hurtFlashOn._t); hurtFlashOn._t = setTimeout(() => el.classList.remove('on'), 130); }

function hudSelectWand(i) {
  if (!gWands.length) return;
  G.curWand = ((i % gWands.length) + gWands.length) % gWands.length;
  renderWandHud(); SFX.click();
}
function renderHearts() {
  const el = $('hearts'); if (!el || !player) return;
  let html = '';
  for (let k = 0; k < 10; k++) {
    const v = clamp(player.hp - k * 10, 0, 10);
    html += `<span class="heart${v >= 10 ? '' : v > 0 ? ' half' : ' empty'}"></span>`;
  }
  el.innerHTML = html;
}
function renderWandHud() {
  const el = $('wandHud'); if (!el) return;
  let html = '';
  gWands.forEach((w, i) => {
    const manaPct = clamp(w.mana / w.manaMax, 0, 1) * 100;
    const stateTxt = w.rech > 0 ? '充能' : w.cd > 0 ? '施放' : '就绪';
    const barCls = w.rech > 0 ? '' : w.cd > 0 ? 'cast' : '';
    const barW = w.rech > 0 ? (100 - w.rech / Math.max(1, w.recharge) * 100) : w.cd > 0 ? (100 - w.cd / Math.max(1, w.castDelay) * 100) : 100;
    html += `<div class="wchip${i === G.curWand ? ' active' : ''}"><b>${i + 1}·${w.name}</b>
      <div class="wslots">${w.slots.map(s => { const sp = SPELLS[s]; return `<i class="${sp ? 'wslot ' + spellGroupColor(sp.k) : ''}" title="${sp ? sp.n : '?'}"></i>`; }).join('')}</div>
      <div class="wbar"><u class="${barCls}" style="width:${clamp(barW, 0, 100)}%"></u></div>
      <small>${Math.floor(w.mana)}/${w.manaMax} · ${stateTxt}</small></div>`;
  });
  el.innerHTML = html;
}
function renderStatusIcons() {
  const el = $('statusIcons'); if (!el || !player) return;
  const p = player, ic = [];
  if (p.burn > 0) ic.push(['#ff9b3f', `燃烧 ${Math.ceil(p.burn / 60)}s`]);
  if (p.poison > 0) ic.push(['#9fd86a', '中毒']);
  if (p.wet > 0) ic.push(['#6db8e8', '湿润·抗火']);
  if (p.oil > 0) ic.push(['#d8b36a', '油渍·易燃']);
  if (p.chill > 0) ic.push(['#aee2ff', '迟滞']);
  if (p.drown > 60) ic.push(['#e8f2ff', `窒息 ${Math.max(0, Math.ceil((240 - p.drown) / 60))}s`]);
  if (p.crush > 0) ic.push(['#c9a87f', '被掩埋!']);
  el.innerHTML = ic.map(([c, t]) => `<span class="st"><i class="dot" style="background:${c}"></i>${t}</span>`).join('');
}
function updateHud() {
  if (!player) return;
  renderHearts();
  $('hpText').textContent = Math.max(0, Math.ceil(player.hp));
  $('goldText').textContent = G.gold;
  $('depthTag').textContent = Math.max(0, Math.floor((player.y - 148) / 8)) + 'm';
  const b = bandAt(player.y);
  $('biomeTag').textContent = b.t === 'sky' ? '圣山之巅' : b.t === 'sanct' ? '圣所' : BIOMES[b.b].name;
  $('fpsTag').textContent = G.fps + ' fps';
  $('seedTag').textContent = 'seed ' + (G.seed >>> 0);
  renderWandHud();
  renderStatusIcons();
  const tip = $('interactTip');
  if (tip) { if (nearInteract && G.state === 'play' && !player.dead) {
    tip.classList.remove('hide');
    tip.innerHTML = nearInteract.t === 'chest' ? '按 <span class="kbd">E</span> 撬开宝箱' : nearInteract.t === 'bench' ? '按 <span class="kbd">E</span> 打开法杖编辑台' : '按 <span class="kbd">E</span> 领取祝福';
  } else tip.classList.add('hide'); }
}

/* ------------------------------ bench editor ------------------------------ */
let benchSel = null;   // {wi, si}
function openBench() {
  if (G.state !== 'play') return;
  G.state = 'panel'; $('app').classList.add('editing');
  renderBench();
  $('benchPanel').classList.remove('hide');
  SFX.bench();
}
function closePanels() {
  $('benchPanel').classList.add('hide');
  $('perkPanel').classList.add('hide');
  $('chestPanel').classList.add('hide');
  $('app').classList.remove('editing');
  benchSel = null;
  if (G.state === 'panel') G.state = 'play';
}
function renderBench() {
  const body = $('benchBody'); if (!body) return;
  let html = '';
  gWands.forEach((w, wi) => {
    const nSlot = Math.max(w.cap, w.slots.length);
    html += `<div class="bench-wand${wi === G.curWand ? ' cur' : ''}" data-wi="${wi}"><h3>${wi + 1} · ${w.name}<em>tier ${w.tier}</em>${wi === G.curWand ? '<em style="color:#ffd970">手持</em>' : ''}<em><button class="ghostbtn" data-use="${wi}" style="padding:1px 8px;font-size:10px">手持</button></em></h3>
      <div class="bstats"><span>容量 <b>${w.slots.length}/${w.cap}</b></span><span>施法间隔 <b>${(w.castDelay / 60).toFixed(2)}s</b></span><span>充能 <b>${(w.recharge / 60).toFixed(2)}s</b></span><span>魔力 <b>${Math.floor(w.mana)}/${w.manaMax}</b></span><span>回蓝 <b>${w.manaRegen}/s</b></span><span>散布 <b>${w.spread}°</b></span></div>
      <div class="slots">`;
    for (let si = 0; si < nSlot; si++) {
      const id = w.slots[si]; const sp = SPELLS[id];
      if (sp) {
        const cls = sp.k === 'p' ? 'p' : sp.k === 'm' ? 'm' : sp.k === 't' ? 't' : 'u';
        const sel = benchSel && benchSel.wi === wi && benchSel.si === si ? ' sel' : '';
        html += `<div class="slot${sel}" draggable="false" data-w="${wi}" data-s="${si}"><i class="stype ${cls}"></i><span class="sname">${sp.n}</span><span class="mana">${sp.mana}</span></div>`;
      } else html += `<div class="slot empty-slot" data-w="${wi}" data-s="${si}">空</div>`;
    }
    html += `<div class="slot trash" data-trash="${wi}">舍弃</div></div>
      <div class="spell-tip" data-tip="${wi}">点选一枚法术再点另一枚可交换；点到空槽是移动；拖到「舍弃」销毁。</div></div>`;
  });
  body.innerHTML = html;
}
function benchTip(wi, id) {
  const tip = document.querySelector(`.spell-tip[data-tip="${wi}"]`); if (!tip) return;
  const sp = SPELLS[id];
  tip.innerHTML = sp ? `<b>${sp.n}</b> · ${sp.e || ''} · 耗蓝 ${sp.mana}${sp.dmg ? ' · 伤害 ' + sp.dmg : ''}${sp.blurb ? ' — ' + sp.blurb : ''}` : '';
}
function benchSlotAt(target) { const el = target.closest ? target.closest('.slot') : null; return el; }
function benchSwap(wi, si, wi2, si2) {
  const a = gWands[wi], b = gWands[wi2];
  const ta = a.slots[si];
  if (a === b) {
    a.slots.splice(si, 1);
    const s = a.slots.splice(si2, 1); if (s.length) a.slots.splice(si, 0, s[0]); else a.slots.splice(Math.min(si, a.slots.length), 0, ta);
  } else {
    const tb = b.slots[si2];
    if (tb !== undefined) { a.slots[si] = tb; b.slots[si2] = ta; }
    else { a.slots.splice(si, 1); if (ta) b.slots[si2] = ta; }
  }
  for (const wd of gWands) {
    wd.slots = wd.slots.filter(x => !!x);
    if (wd.slots.length > wd.cap) {
      const overflow = wd.slots.splice(wd.cap);
      for (const o of overflow) {
        const dst = gWands.find(x2 => x2 !== wd && x2.slots.length < x2.cap);
        if (dst) dst.slots.push(o);
      }
    }
  }
}
function benchClick(e) {
  const useBtn = e.target.closest ? e.target.closest('[data-use]') : null;
  if (useBtn) { G.curWand = +useBtn.dataset.use; renderWandHud(); renderBench(); SFX.click(); return; }
  const el = benchSlotAt(e.target); if (!el) return;
  SFX.click();
  const drag = benchDrag; benchDrag = null;
  if (el.dataset.trash != null) {
    if (benchSel) { const w = gWands[benchSel.wi]; const id = w.slots.splice(benchSel.si, 1)[0]; void id; benchSel = null; renderBench(); renderWandHud(); }
    else if (drag && drag.src) { const w = gWands[drag.src.wi]; w.slots.splice(drag.src.si, 1); renderBench(); renderWandHud(); }
    return;
  }
  const wi = +el.dataset.w, si = +el.dataset.s;
  const idHere = gWands[wi].slots[si];
  if (drag && drag.src) {   // drag & drop finished
    const from = drag.src;
    if (from.wi !== wi || from.si !== si) benchSwap(from.wi, from.si, wi, si);
    benchSel = null; renderBench(); renderWandHud(); return;
  }
  if (idHere === undefined && !benchSel) { return; }
  if (!benchSel) {
    if (idHere === undefined) return;
    benchSel = { wi, si };
    benchTip(wi, idHere);
    renderBench();
    return;
  }
  if (benchSel.wi === wi && benchSel.si === si) { benchSel = null; renderBench(); return; }
  benchSwap(benchSel.wi, benchSel.si, wi, si);
  benchSel = null;
  renderBench(); renderWandHud();
}
let benchDrag = null;
function benchPointerDown(e) {
  const el = benchSlotAt(e.target); if (!el || el.dataset.trash != null) return;
  if (gWands[+el.dataset.w].slots[+el.dataset.s] === undefined) return;
  benchDrag = { src: { wi: +el.dataset.w, si: +el.dataset.s }, moved: false };
}
function benchPointerUp(e) {
  if (!benchDrag) return;
  const el = benchSlotAt(e.target);
  const src = benchDrag.src; benchDrag = null;
  if (!el) return;
  if (el.dataset.trash != null) {
    const w = gWands[src.wi]; w.slots.splice(src.si, 1); renderBench(); renderWandHud(); SFX.click(); return;
  }
  if (el.dataset.w == null) return;
  const wi = +el.dataset.w, si = +el.dataset.s;
  if (wi === src.wi && si === src.si) return;
  benchSwap(src.wi, src.si, wi, si);
  benchSel = null;
  renderBench(); renderWandHud(); SFX.click();
}
/* -------------------------------- perks ----------------------------------- */
let perkOffer = [], perkSanct = null;
function openPerks(s) {
  G.state = 'panel';
  perkSanct = s;
  rollPerks();
  $('perkPanel').classList.remove('hide');
}
function rollPerks() {
  const pool = PERKS.slice();
  perkOffer = [];
  while (perkOffer.length < 3 && pool.length) {
    const i = mri(0, pool.length - 1);
    perkOffer.push(pool.splice(i, 1)[0]);
  }
  while (perkOffer.length < 3) perkOffer.push(pick(PERKS));
  const cost = perkRerollCost();
  $('perkBody').innerHTML = perkOffer.map((p, i) => `<button class="perk" data-perk="${i}"><b>${i + 1}. ${p.n}</b><small>${p.d}</small></button>`).join('');
  $('rerollBtn').textContent = '⟳ 重掷祝福 ' + cost + ' 金';
  $('rerollCost').textContent = G.gold >= cost ? '金币充足' : '金币不足';
}
function perkRerollCost() { return 60 * Math.pow(2, G.perkRerolls); }
function choosePerk(i) {
  const p = perkOffer[i]; if (!p) return;
  p.apply();
  if (perkSanct) perkSanct.perkTaken = true;
  perkOffer = [];
  $('perkPanel').classList.add('hide');
  G.state = 'play';
  SFX.perk();
  toast(`✦ 祝福生效：${p.n} —— ${p.d}`);
  renderWandHud();
}

/* ------------------------------ death / win -------------------------------- */
function showDeath() {
  G.state = 'dead';
  $('deadReason').textContent = `死因：${G.deathDetail || ''}${G.deathDetail ? ' — ' : ''}${G.deathReason}`;
  const mins = (G.timeSec / 60) | 0, secs = (G.timeSec % 60) | 0;
  $('runStats').innerHTML = `本次远征：存活 <b>${mins}分${secs}秒</b> · 最深 <b>${Math.floor(G.maxDepth / 8)}m</b> · 击杀 <b>${G.kills}</b> · 敛财 <b>${G.gold}</b> 金`;
  const tips = {
    fire: '提示：火怕水。路过水池时先把身上的火熄灭，或随身带一发「水箭术」。',
    water: '提示：潜入液体前确认头顶有气室；水面破口处短暂露头就能续气。',
    acid: '提示：酸液会蚕食大部分岩层——但玻璃与圣山岩对它免疫。',
    crush: '提示：炸开砂层顶部会引发塌方，站在砂堆下方等于自掘坟墓。',
    lava: '提示：熔岩遇水成石。把水箭打向熔岩流，给自己铺一条路。',
    poison: '提示：毒气比空气轻，贴着地面走或掩口鼻快速穿过。',
    fall: '提示：长按跳跃可悬浮减速；落入液体里也不会摔死。',
    explosion: '提示：火药桶与不稳定晶会连锁引爆——先拆掉你脚下的引信。',
    melee: '提示：法杖有施法间隔，贴身时切到散射杖或闪现拉开距离。',
  };
  $('deathTip').textContent = tips[G.deathReasonKey] || '提示：黑暗不是装饰，光才是。带一支照明杖再往下走。';
  $('dead').classList.remove('hide');
}
function showWin() {
  if (G.state === 'win') return;
  G.state = 'win';
  const mins = (G.timeSec / 60) | 0, secs = (G.timeSec % 60) | 0;
  $('winStats').innerHTML = `存活 <b>${mins}分${secs}秒</b> · 最深 <b>${Math.floor(G.maxDepth / 8)}m</b> · 击杀 <b>${G.kills}</b> · 敛财 <b>${G.gold}</b> 金`;
  $('win').classList.remove('hide');
  SFX.win();
}

/* ========================================================================== *
 *  PARTICLES · MAIN LOOP · STATE MACHINE · BOOT
 * ========================================================================== */
function updateParts() {
  for (const p of parts) {
    if (!p.live) continue;
    p.life--;
    if (p.life <= 0) { p.live = false; continue; }
    p.vy += p.g;
    const nx = p.x + p.vx, ny = p.y + p.vy;
    if (!solidAt(nx, p.y)) p.x = nx; else p.vx *= -.35;
    if (!solidAt(p.x, ny)) p.y = ny; else { p.vy = p.g > 0 ? -p.vy * .22 : 0; p.vx *= .8; if (Math.abs(p.vy) < .05) p.vy = 0; }
    const m = get(p.x | 0, p.y | 0);
    if (LIQ[m]) { p.vx *= .8; p.vy = p.vy * .6 - .02; if (p.kind === 0 && m === MAT.WATER && p.g > 0) p.life = Math.min(p.life, 6); }
  }
}
function processFx() {
  let n = 0;
  while (fxQueue.length && n++ < 6) {
    const e = fxQueue.shift();
    explode(e.x, e.y, e.r, e.e, e.d, { fire: e.fire, big: e.big });
  }
}
function updateWands() {
  for (const w of gWands) {
    if (w.rech > 0) w.rech--;
    else if (w.cd > 0) w.cd--;
    if (w.mana < w.manaMax) w.mana = Math.min(w.manaMax, w.mana + w.manaRegen / 60);
  }
}
function bossDeath() {
  const b = bossEnt;
  if (!b || b.dead) return;
  b.dead = true;
  G.kills++;
  addFxLight(b.x, b.y, 90, [255, 170, 80], 1.6, 60);
  for (let k = 0; k < 14; k++) fxQueue.push({ x: b.x + (mrnd() - .5) * 40, y: b.y + (mrnd() - .5) * 30, r: 12 + mrnd() * 18, e: 500, d: 0, fire: 1, depth: 1 });
  G.shake = 24; G.flash = 1;
  toast('巨眼闭合了。熔火之心安静下来。');
  SFX.die();
  G.bossDown = true; G.winDelay = 120;
}

let lastBand = null;
function tickWorld() {
  G.frame++;
  if (G.state === 'panel') return;
  G.timeSec += 1 / 60;
  if (G.hitstop > 0) { G.hitstop--; draw(); return; }
  const alive = G.state === 'play' && !player.dead;
  if (alive) {
    updatePlayer();
    findInteract();
    updateWands();
    if (input.fire) castOnce();
  } else if (G.state === 'dead' || G.state === 'win') { updateWands(); }
  simStep();
  for (let q = 0; q < 3; q++) {                     // rolling row-count repair
    const ry = mri(0, H - 1); let cnt = 0; const base = ry * W;
    for (let x = 0; x < W; x++) if (DYN[cells[base + x]]) cnt++;
    rowActive[ry] = cnt;
  }
  processFx();
  updateProjectiles();
  if (alive || G.state === 'dead') { updateEnemies(); }
  if (G.state === 'play') {
    updateBoss();
    const beaming = bossBeamTick();
    if (beaming && bossEnt) addFxLight(bossEnt.x, bossEnt.y, 60, [255, 140, 60], .8, 4);
  }
  updatePickups();
  updateParts();
  ambientWorldTick();
  G.maxDepth = Math.max(G.maxDepth, player.y);
  // band announcements
  const bnd = bandAt(player.y);
  const key = bnd.t + (bnd.b != null ? bnd.b : bnd.i);
  if (key !== lastBand) {
    lastBand = key;
    if (bnd.t === 'biome') { const B = BIOMES[bnd.b]; toast(`▼ 步入「${B.name}」—— ${bnd.b === 4 ? '热浪翻涌，小心脚下' : bnd.b === 3 ? '寒气刺骨，水面正在结冰' : bnd.b === 2 ? '孢子在光里浮动' : bnd.b === 1 ? '头顶有可燃气体，别乱点火' : '矿坑的黑暗比想象中有深度'}`); }
    else if (bnd.t === 'sanct' && bnd.i !== undefined) toast('⛪ 圣所 — 泉水疗愈、石台祝佑、编辑台在右侧');
  }
  if (G.bossDown && (G.state === 'play' || (G.state === 'dead' && player && player.hp <= 0 && bossEnt && bossEnt.dead && G.winDelay > 0)) && --G.winDelay <= 0) showWin();
  if (G.frame % 6 === 0) updateHud();
  // ambient rumble follows danger depth
  if (AU.on && AU.ambG && AU.ac) {
    const bi = bandIndexForY(player.y);
    const lavaNear = (() => { const m = get(player.x | 0, (player.y + 3) | 0); return m === MAT.LAVA; })();
    const want = bi < 0 ? .01 : bi >= 3 ? .05 : .02;
    AU.ambG.gain.value += ((want + (lavaNear ? .06 : 0)) - AU.ambG.gain.value) * .05;
  }
  if (G.state === 'dead' && !G._deadT) G._deadT = G.frame;
}

/* -------------------------------- new game --------------------------------- */
function hashCodeStr(str) { let h = 2166136261; for (let c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function newGame(seedStr) {
  audioInit();
  if (AU.ac && AU.ac.state === 'suspended') AU.ac.resume();
  const sIn = seedStr || ($('seedInput') && $('seedInput').value) || null;
  G.seed = sIn ? hashCodeStr(sIn) : (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  G.state = 'play'; G.frame = 0; G.kills = 0; G.gold = 0; G.maxDepth = 0; G.timeSec = 0;
  G.bossDown = false; G.curWand = 0; G.perkRerolls = 0; G.deathReason = ''; G.deathDetail = ''; G.hitstop = 0;
  G.sanctSeen = new Set(); lastBand = null; G._deadT = 0;
  // full reset — stale entities must never leak across runs (roguelite restart!)
  enemies.length = 0; projectiles.length = 0; pickups.length = 0;
  for (const p of parts) p.live = false; partsHead = 0;      // pool stays pre-filled
  fxQueue.length = 0;
  bossEnt = null; G.shake = 0; G.flash = 0; G.hitstop = 0; G.winDelay = 120;
  player = makePlayer(W / 2, 100);
  player.perk = {};
  gWands.length = 0;
  rng = makeRng(G.seed);
  gWands.push(makeWand(1, { name: '学徒火杖', slots: ['ember', 'arc', 'split', 'ember'], cap: 4, castDelay: 11, recharge: 52, manaMax: 86 }));
  gWands.push(makeWand(1, { name: '矿工钻杖', slots: ['drill', 'jet', 'blink'], cap: 4, castDelay: 7, recharge: 74, manaMax: 104 }));
  generateWorld();
  const hub = sancts[0];
  player.x = hub.cx; player.y = hub.fy;
  player.hp = player.maxHp = 100;
  G.camX = clamp(player.x - VW / 2, 0, W - VW); G.camY = clamp(player.y - VH / 2, 0, H - VH);
  $('title').classList.add('hide'); $('dead').classList.add('hide'); $('win').classList.add('hide');
  closePanels();
  renderWandHud(); updateHud();
  toast(`种子 ${G.seed >>> 0} — 向下吧，炼金术士`);
  tone(200, 400, .12, 'triangle', .05);
}
function showDeathWrap() { /* used by die() */ }

/* --------------------------------- loop ------------------------------------ */
let last = performance.now(), acc = 0;
function frameLoop(now) {
  requestAnimationFrame(frameLoop);
  let dt = now - last; last = now;
  if (dt > 240) dt = 240;
  G._fpsAcc = (G._fpsAcc || 0) + dt; G._fpsN = (G._fpsN || 0) + 1;
  if (G._fpsAcc > 500) { G.fps = Math.round(1000 / (G._fpsAcc / G._fpsN)); G._fpsAcc = 0; G._fpsN = 0; }
  const t0 = performance.now();
  acc += dt;
  let steps = 0;
  while (acc >= 1000 / 60 && steps < 3) { acc -= 1000 / 60; if (G.state !== 'title') tickWorld(); steps++; }
  if (G.state === 'title' && !worldReady) { /* idle render on title */ }
  draw();
  tickToast();
  G.simMs = G.simMs * .9 + (performance.now() - t0) * .1;
}
let worldReady = false;
window.addEventListener('keydown', e => { if (e.key === 'Escape' && G.state === 'panel') closePanels(); });
document.addEventListener('visibilitychange', () => { last = performance.now(); });

/* boot wiring */
(function boot() {
  // placeholder world so the title screen has a pretty backdrop
  rng = makeRng(12345);
  // full reset — stale entities must never leak across runs (roguelite restart!)
  enemies.length = 0; projectiles.length = 0; pickups.length = 0;
  for (const p of parts) p.live = false; partsHead = 0;      // pool stays pre-filled
  fxQueue.length = 0;
  bossEnt = null; G.shake = 0; G.flash = 0; G.hitstop = 0; G.winDelay = 120;
  player = makePlayer(W / 2, 100);
  player.perk = {};
  gWands.length = 0;
  const demoSeed = Date.now() >>> 0;
  G.seed = demoSeed;
  generateWorld();
  worldReady = true;
  const hub = sancts[0];
  player.x = hub.cx; player.y = hub.fy;
  G.camX = clamp(player.x - VW / 2, 0, W - VW); G.camY = clamp(player.y - VH / 2, 0, H - VH);
  $('startBtn').addEventListener('click', () => newGame());
  $('restartBtn').addEventListener('click', () => newGame());
  $('winBtn').addEventListener('click', () => newGame());
  $('benchClose').addEventListener('click', closePanels);
  $('benchBody').addEventListener('click', benchClick);
  $('benchBody').addEventListener('pointerdown', benchPointerDown);
  window.addEventListener('pointerup', e => { if (G.state === 'panel') benchPointerUp(e); });
  $('perkBody').addEventListener('click', e => { const b = e.target.closest('[data-perk]'); if (b) choosePerk(+b.dataset.perk); });
  $('rerollBtn').addEventListener('click', () => {
    const cost = perkRerollCost();
    if (G.gold >= cost) { G.gold -= cost; G.perkRerolls++; rollPerks(); SFX.bench(); } else { SFX.err(); toast('金币不足'); }
  });
  window.addEventListener('error', ev => {
    console.error('[emberdeep]', ev.message);
    const el = $('toast');
    if (el) { el.textContent = '内部错误: ' + ev.message; el.style.opacity = 1; }
  });
  requestAnimationFrame(frameLoop);
})();

/* ------------------------------ test hooks -------------------------------- */
window.__TEST = {
  G, MAT, get, cells, aux, SPELLS, BIOMES, M_NAME, enemies, projectiles, pickups, sancts, parts,
  api: {
    render(n = 1) { for (let i = 0; i < n; i++) { tickWorld(); draw(); } },
    draw() { draw(); },
    setCell(x, y, m) { setM(x | 0, y | 0, m); },
    getCell(x, y) { return get(x | 0, y | 0); },
    snapBuf() { return buf.slice(0); },
    lightBuf() { return { lr: Array.from(lr.slice(0, LW * 2)), LW, LH, camY: G.camY }; },
    palOf(m, i) { return PAL[m * 8 + i]; },
    sharedBuf() { return img.data.buffer ? new Uint32Array(img.data.buffer) : buf; },
    countIn(x0, y0, x1, y1, m) { let n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (get(x, y) === m) n++; return n; },
    camTo(y) { G.camY = clamp(y - VH / 2, 0, H - VH); G.camX = clamp(player.x - VW / 2, 0, W - VW); },
    setBandCam() { G.camY = clamp(player.y - VH / 2, 0, H - VH); G.camX = clamp(player.x - VW / 2, 0, W - VW); },
    player() { return { x: player.x, y: player.y, vx: player.vx, vy: player.vy, hp: player.hp, onGround: player.onGround, burn: player.burn, drown: player.drown, crush: player.crush }; },
    addSpellToCurWand(id) { gWands[G.curWand].slots.push(id); if (gWands[G.curWand].slots.length > gWands[G.curWand].cap) gWands[G.curWand].cap = gWands[G.curWand].slots.length; renderWandHud(); },
    pf(x, y, life) { return placeFire(x | 0, y | 0, life || 120); },
    bossInfo() { return bossEnt ? { hp: bossEnt.hp, x: bossEnt.x, y: bossEnt.y, dead: !!bossEnt.dead } : null; },
    killBoss() { if (bossEnt && !bossEnt.dead) hurtEntity(bossEnt, 100000, 'explosion', '法杖试炼'); },
    openBenchNow() { openBench(); },
    openPerksNow() { openPerks(sancts[1]); },
    countMaterial(m) { let n = 0; for (let i = 0; i < cells.length; i += 7) if (cells[i] === m) n++; return n * 7; },
    press(k) { bindKey({ key: k, preventDefault() {} }, true); setTimeout(() => bindKey({ key: k, preventDefault() {} }, false), 350); },
    hold(k, d) { bindKey({ key: k, preventDefault() {} }, d); },
    setPointer(x, y) { pointer.x = x; pointer.y = y; pointer.has = true; },
    fire(b) { input.fire = b; },
    start(seed) { newGame(seed); },
    step(n) { for (let i = 0; i < n; i++) tickWorld(); },
    teleport(x, y) { player.x = x; player.y = y; },
    spawn(type, x, y) { return !!spawnEnemy(type, x, y, 2); },
    hurtSelf(d, t, c) { hurtPlayer(d, t, c); },
    setHp(v) { player.hp = v; },
    killNearby(r = 90) { for (const e of enemies.slice()) if (!e.dead && Math.hypot(e.x - player.x, e.y - player.y) < r) hurtEntity(e, 999, 'projectile', '测试法术'); },
    explodeAt(x, y, r = 22, e2 = 500, d = 30) { explode(x, y, r, e2, d, { fire: 1 }); },
    materialAtPlayer() { return M_NAME[get(player.x | 0, (player.y - 5) | 0)]; },
    castWand() { input.fire = true; for (let i = 0; i < 140; i++) { tickWorld(); if (projectiles.length) break; } input.fire = false; },
    benchOpen() { openBench(); },
    bench() { return $('benchPanel').classList.contains('hide') ? 'closed' : 'open'; },
    snapshot() {
      return {
        state: G.state, frame: G.frame, fps: G.fps, simMs: +G.simMs.toFixed(2),
        hp: +player.hp.toFixed(1), maxHp: player.maxHp, mana: gWands.length ? Math.floor(curWand().mana) : 0,
        kills: G.kills, gold: G.gold, depthM: Math.floor(G.maxDepth / 8),
        enemies: enemies.filter(e => !e.dead).length, parts: parts.filter(p => p.live).length,
        proj: projectiles.length, pickups: pickups.length,
        deathReason: G.deathReason, deathDetail: G.deathDetail,
        px: +player.x.toFixed(1), py: +player.y.toFixed(1),
        wand: gWands.length ? curWand().name : '-', slots: gWands.length ? curWand().slots.join(',') : '',
        burn: player.burn, drown: player.drown, crush: player.crush, poison: player.poison,
        boss: bossEnt ? { hp: bossEnt.hp, dead: bossEnt.dead } : null,
      };
    },
  },
};
