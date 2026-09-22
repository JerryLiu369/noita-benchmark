/* =========================================================================
   PIXEL ALCHEMIST - High Fidelity Noita-Inspired Falling-Sand Roguelite
   Pure Front-End (Zero External Assets, Zero Build Tools, 100% Vanilla JS)
   ========================================================================= */

// --- Global Setup & Dimensions ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const VW = 320, VH = 180; // Viewport pixel resolution
const W = 320, H = 2240;   // World dimensions (8 Biomes + Holy Mountains)

// Offscreen buffer for direct pixel simulation blitting
const worldImgData = ctx.createImageData(VW, VH);
const worldBuf32 = new Uint32Array(worldImgData.data.buffer);

// Offscreen canvas for Dynamic Darkness & Radial Lighting
const lightCanvas = document.createElement('canvas');
lightCanvas.width = VW;
lightCanvas.height = VH;
const lightCtx = lightCanvas.getContext('2d');

// --- Material Definitions ---
const MAT = {
  AIR: 0,
  // Solids
  ROCK: 1,
  DIRT: 2,
  WOOD: 3,
  COAL: 4,
  TEMPLE: 5,
  ICE: 6,
  STEEL: 7,
  GOLD_ORE: 8,
  MOSS: 9,
  LAVAROCK: 10,
  // Powders
  SAND: 11,
  SNOW: 12,
  GUNPOWDER: 13,
  GOLD_DUST: 14,
  // Liquids (Densities: Oil=1, Water=2, Toxic=2.5, Blood=3, Acid=4, Lava=5)
  OIL: 15,
  WATER: 16,
  TOXIC: 17,
  BLOOD: 18,
  ACID: 19,
  LAVA: 20,
  // Gases & Fire
  FIRE: 21,
  SMOKE: 22,
  STEAM: 23,
  ACID_GAS: 24,
};

const SOLID_SET = new Set([
  MAT.ROCK, MAT.DIRT, MAT.WOOD, MAT.COAL, MAT.TEMPLE,
  MAT.ICE, MAT.STEEL, MAT.GOLD_ORE, MAT.MOSS, MAT.LAVAROCK
]);

const POWDER_SET = new Set([
  MAT.SAND, MAT.SNOW, MAT.GUNPOWDER, MAT.GOLD_DUST
]);

const LIQUID_SET = new Set([
  MAT.OIL, MAT.WATER, MAT.TOXIC, MAT.BLOOD, MAT.ACID, MAT.LAVA
]);

const GAS_SET = new Set([
  MAT.SMOKE, MAT.STEAM, MAT.ACID_GAS
]);

// Liquid Densities for Realistic Layering
const LIQUID_DENSITY = {
  [MAT.OIL]: 1.0,
  [MAT.WATER]: 2.0,
  [MAT.TOXIC]: 2.5,
  [MAT.BLOOD]: 3.0,
  [MAT.ACID]: 4.0,
  [MAT.LAVA]: 5.0,
};

// Material Hardness/Durability for destruction thresholds
const MAT_DURABILITY = {
  [MAT.AIR]: 0,
  [MAT.DIRT]: 4,
  [MAT.SAND]: 4,
  [MAT.SNOW]: 2,
  [MAT.WOOD]: 5,
  [MAT.MOSS]: 3,
  [MAT.COAL]: 6,
  [MAT.GOLD_ORE]: 7,
  [MAT.ROCK]: 10,
  [MAT.LAVAROCK]: 11,
  [MAT.STEEL]: 15,
  [MAT.TEMPLE]: 14,
};

// --- Biomes Definition ---
const BIOMES = [
  { name: '矿坑 (MINES)', bg: '#080a14', rock: '#383b4c', dirt: '#594436', depth: [0, 250] },
  { name: '煤坑 (COAL PITS)', bg: '#0d0c18', rock: '#2f2f3e', dirt: '#48382c', depth: [290, 540] },
  { name: '真菌洞穴 (FUNGAL CAVERNS)', bg: '#0a1614', rock: '#284038', dirt: '#3e4d30', depth: [580, 830] },
  { name: '雪山深渊 (SNOWY DEPTHS)', bg: '#0e1728', rock: '#42586c', dirt: '#304254', depth: [870, 1120] },
  { name: '席西基地 (HIISI BASE)', bg: '#12161c', rock: '#3c444e', dirt: '#403830', depth: [1160, 1410] },
  { name: '地下丛林 (JUNGLE)', bg: '#081712', rock: '#254432', dirt: '#384828', depth: [1450, 1700] },
  { name: '远古避难所 (THE VAULT)', bg: '#18121a', rock: '#483644', dirt: '#403038', depth: [1740, 1990] },
  { name: '终焉实验室 (THE LABORATORY)', bg: '#1c0e12', rock: '#543834', dirt: '#4a2824', depth: [2030, 2240] }
];

function getBiomeAt(y) {
  for (let i = 0; i < BIOMES.length; i++) {
    if (y >= BIOMES[i].depth[0] && y < BIOMES[i].depth[1] + 40) return BIOMES[i];
  }
  return BIOMES[BIOMES.length - 1];
}

// --- Procedural Textures & Palettes ---
// 32-bit colors (ABGR format for little-endian Uint32Array)
function packABGR(r, g, b, a = 255) {
  return ((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff);
}

// Seeded hash for consistent granular per-pixel texture
function hash2D(x, y) {
  let h = Math.imul(x ^ 0x27d4eb2d, y ^ 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return (h ^ (h >>> 13)) >>> 0;
}

// Texture Palettes per material
const PALETTES = {
  [MAT.ROCK]: [
    packABGR(56, 59, 76), packABGR(68, 71, 90),
    packABGR(46, 48, 62), packABGR(80, 85, 106)
  ],
  [MAT.DIRT]: [
    packABGR(92, 68, 52), packABGR(106, 78, 60),
    packABGR(75, 55, 42), packABGR(120, 90, 70)
  ],
  [MAT.WOOD]: [
    packABGR(110, 76, 52), packABGR(92, 63, 41),
    packABGR(125, 88, 60), packABGR(80, 54, 35)
  ],
  [MAT.COAL]: [
    packABGR(32, 34, 40), packABGR(42, 45, 54),
    packABGR(22, 24, 28), packABGR(52, 56, 66)
  ],
  [MAT.TEMPLE]: [
    packABGR(78, 60, 96), packABGR(92, 72, 112),
    packABGR(46, 35, 58), packABGR(210, 175, 55) // gold leaf inlay accent
  ],
  [MAT.ICE]: [
    packABGR(165, 205, 222), packABGR(185, 225, 240),
    packABGR(140, 180, 200), packABGR(215, 240, 250)
  ],
  [MAT.STEEL]: [
    packABGR(82, 88, 102), packABGR(98, 106, 122),
    packABGR(66, 71, 82), packABGR(130, 90, 65) // rust specks
  ],
  [MAT.GOLD_ORE]: [
    packABGR(255, 215, 0), packABGR(230, 185, 0),
    packABGR(62, 54, 38), packABGR(255, 240, 120)
  ],
  [MAT.MOSS]: [
    packABGR(55, 95, 52), packABGR(70, 120, 65),
    packABGR(42, 75, 40), packABGR(85, 145, 78)
  ],
  [MAT.LAVAROCK]: [
    packABGR(45, 28, 25), packABGR(58, 35, 30),
    packABGR(35, 22, 20), packABGR(120, 45, 20)
  ],
  [MAT.SAND]: [
    packABGR(217, 179, 96), packABGR(201, 163, 80),
    packABGR(235, 208, 126), packABGR(185, 150, 70)
  ],
  [MAT.SNOW]: [
    packABGR(232, 240, 248), packABGR(215, 228, 240),
    packABGR(248, 252, 255), packABGR(190, 210, 230)
  ],
  [MAT.GUNPOWDER]: [
    packABGR(35, 36, 40), packABGR(45, 47, 52),
    packABGR(25, 26, 30), packABGR(65, 62, 45) // sulfur specks
  ],
  [MAT.GOLD_DUST]: [
    packABGR(255, 208, 51), packABGR(255, 226, 102),
    packABGR(230, 184, 0), packABGR(255, 245, 170)
  ],
  [MAT.OIL]: [
    packABGR(60, 44, 30), packABGR(75, 55, 38),
    packABGR(45, 32, 22), packABGR(90, 60, 70) // iridescent violet film
  ],
  [MAT.WATER]: [
    packABGR(58, 142, 196, 210), packABGR(75, 165, 225, 220),
    packABGR(45, 120, 175, 200), packABGR(110, 195, 245, 230)
  ],
  [MAT.TOXIC]: [
    packABGR(106, 179, 39, 230), packABGR(126, 204, 48, 235),
    packABGR(88, 150, 30, 220), packABGR(155, 232, 66, 240)
  ],
  [MAT.BLOOD]: [
    packABGR(142, 27, 39, 240), packABGR(163, 34, 48, 245),
    packABGR(110, 18, 28, 235), packABGR(180, 45, 60, 250)
  ],
  [MAT.ACID]: [
    packABGR(167, 245, 42, 240), packABGR(194, 255, 71, 245),
    packABGR(140, 215, 28, 235), packABGR(233, 255, 148, 255)
  ],
  [MAT.LAVA]: [
    packABGR(255, 119, 0), packABGR(255, 170, 0),
    packABGR(255, 51, 0), packABGR(80, 24, 8) // cooled crust flake
  ],
  [MAT.FIRE]: [
    packABGR(255, 243, 128), packABGR(255, 168, 38),
    packABGR(230, 62, 21), packABGR(255, 210, 80)
  ],
  [MAT.SMOKE]: [
    packABGR(88, 90, 99, 170), packABGR(69, 71, 79, 150),
    packABGR(110, 112, 120, 180), packABGR(50, 52, 58, 140)
  ],
  [MAT.STEAM]: [
    packABGR(216, 230, 236, 160), packABGR(237, 245, 248, 180),
    packABGR(195, 215, 225, 150), packABGR(245, 250, 252, 190)
  ],
  [MAT.ACID_GAS]: [
    packABGR(130, 217, 54, 150), packABGR(155, 235, 78, 170),
    packABGR(108, 188, 40, 140), packABGR(180, 245, 110, 180)
  ]
};

// --- Game State Variables ---
let seed = 0;
let rng = () => 0;
let world = null;
let player = null;
let enemies = [];
let projectiles = [];
let particles = [];
let pickups = [];
let worldProps = []; // chests, barrels, torches, pedestals
let wands = [];
let currentWand = 0;
let activeWorkshopWand = 0;
let spellPouch = [];
let perkChoices = [];
let holyMountainList = [];
let holyVisited = new Set();
let godsAngered = false;
let stevariSpawned = false;
let stevari = null;
let boss = null;
let gameState = 'title'; // 'title', 'play', 'dead', 'win'
let cameraY = 0;
let frame = 0;
let toastTimer = 0;
let toastDanger = false;
let screenShake = 0;
let runStartTime = 0;
let runGold = 0;
let runDepth = 0;
let editMode = false;
let selectedSlot = null; // for wand workshop swapping { type: 'wand'|'pouch', wi: number, si: number }

const keys = {};
const pointer = { x: 160, y: 90, down: false, active: false };

const $ = id => document.getElementById(id);

// --- Math & PRNG ---
function makeRng(s) {
  let t = s >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), 1 | x);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function rint(a, b) {
  return Math.floor(rng() * (b - a + 1)) + a;
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function idx(x, y) {
  return (y | 0) * W + (x | 0);
}

function inside(x, y) {
  return x >= 0 && x < W && y >= 0 && y < H;
}

function getm(x, y) {
  return inside(x, y) ? world.cells[idx(x, y)] : MAT.ROCK;
}

function setm(x, y, m, metaVal = 0) {
  if (inside(x, y)) {
    const i = idx(x, y);
    // Track temple damage during gameplay (only after world generation and when player is alive)
    if (gameState === 'play' && player && world.cells[i] === MAT.TEMPLE && m !== MAT.TEMPLE) {
      world.templeDamage++;
      if (world.templeDamage > 24 && !godsAngered) {
        angerTheGods();
      }
    }
    world.cells[i] = m;
    world.meta[i] = metaVal;
  }
}

// --- Procedural World Generation ---
function generateWorld() {
  world = {
    w: W,
    h: H,
    cells: new Uint8Array(W * H),
    meta: new Uint8Array(W * H),
    templeDamage: 0
  };
  world.cells.fill(MAT.AIR);

  holyMountainList = [
    { y0: 250, y1: 290, index: 0, claimed: false },
    { y0: 540, y1: 580, index: 1, claimed: false },
    { y0: 830, y1: 870, index: 2, claimed: false },
    { y0: 1120, y1: 1160, index: 3, claimed: false },
    { y0: 1410, y1: 1450, index: 4, claimed: false },
    { y0: 1700, y1: 1740, index: 5, claimed: false },
    { y0: 1990, y1: 2030, index: 6, claimed: false }
  ];

  worldProps = [];
  enemies = [];
  projectiles = [];
  particles = [];
  pickups = [];
  holyVisited.clear();
  godsAngered = false;
  stevariSpawned = false;
  stevari = null;
  boss = null;
  runGold = 0;
  runDepth = 0;
  runStartTime = Date.now();

  // 1. Fill base terrain using cellular noise & stratum
  for (let y = 0; y < H; y++) {
    const isHoly = holyMountainList.some(h => y >= h.y0 && y < h.y1);
    const biome = getBiomeAt(y);
    const band = Math.floor(y / 280);

    for (let x = 0; x < W; x++) {
      if (y < 24) continue; // surface sky

      // Border walls
      const isBorder = x < 6 || x > W - 7 || y >= H - 12;
      
      // Multiscale organic cavern density
      const n1 = Math.sin(x * 0.085 + y * 0.038) + Math.sin(x * 0.024 - y * 0.065);
      const n2 = Math.sin((x + y) * 0.018) + Math.cos(x * 0.045 - y * 0.032);
      const cavern = n1 * 0.6 + n2 * 0.4;
      
      let isSolid = isBorder || cavern < -0.15;

      if (isHoly) {
        // Encase holy mountain in temple brick with a spacious corridor
        isSolid = true;
      }

      if (isSolid) {
        let m = MAT.ROCK;
        if (band === 0) {
          m = rng() < 0.45 ? MAT.DIRT : MAT.ROCK;
          if (rng() < 0.04) m = MAT.GOLD_ORE;
          if (rng() < 0.06) m = MAT.WOOD;
        } else if (band === 1) { // Coal Pits
          m = rng() < 0.35 ? MAT.COAL : (rng() < 0.4 ? MAT.DIRT : MAT.ROCK);
          if (rng() < 0.05) m = MAT.GUNPOWDER;
        } else if (band === 2) { // Fungal Caverns
          m = rng() < 0.45 ? MAT.MOSS : (rng() < 0.3 ? MAT.DIRT : MAT.ROCK);
        } else if (band === 3) { // Snowy Depths
          m = rng() < 0.45 ? MAT.SNOW : (rng() < 0.35 ? MAT.ICE : MAT.ROCK);
        } else if (band === 4) { // Hiisi Base
          m = rng() < 0.4 ? MAT.STEEL : (rng() < 0.3 ? MAT.DIRT : MAT.ROCK);
        } else if (band === 5) { // Jungle
          m = rng() < 0.5 ? MAT.MOSS : (rng() < 0.25 ? MAT.WOOD : MAT.ROCK);
        } else if (band === 6) { // Vault
          m = rng() < 0.45 ? MAT.STEEL : MAT.ROCK;
        } else { // Laboratory
          m = rng() < 0.4 ? MAT.LAVAROCK : MAT.ROCK;
        }
        setm(x, y, m);
      } else {
        // Naturally generated liquids and powders in open pockets
        if (!isHoly && cavern > 0.45 && rng() < 0.08) {
          if (band === 0) setm(x, y, rng() < 0.7 ? MAT.WATER : MAT.OIL);
          else if (band === 1) setm(x, y, rng() < 0.6 ? MAT.OIL : MAT.COAL);
          else if (band === 2) setm(x, y, rng() < 0.5 ? MAT.TOXIC : MAT.WATER);
          else if (band === 3) setm(x, y, rng() < 0.6 ? MAT.SNOW : MAT.WATER);
          else if (band === 4) setm(x, y, rng() < 0.5 ? MAT.GUNPOWDER : MAT.OIL);
          else if (band === 5) setm(x, y, rng() < 0.4 ? MAT.ACID : MAT.WATER);
          else if (band === 6) setm(x, y, rng() < 0.5 ? MAT.ACID : MAT.TOXIC);
          else setm(x, y, MAT.LAVA);
        }
      }
    }
  }

  // 2. Carve vertical exploration shafts so player never gets blocked
  for (let band = 0; band < 8; band++) {
    const yStart = band * 280 + 35;
    const yEnd = (band + 1) * 280 - 45;
    let cx = rint(130, 190);
    for (let y = yStart; y < yEnd; y++) {
      cx += rint(-2, 2);
      cx = clamp(cx, 40, W - 40);
      const rad = rint(7, 13);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.hypot(dx, dy * 2) < rad) {
            setm(cx + dx, y + dy, MAT.AIR);
          }
        }
      }
    }
  }

  // 3. Build Sacred Holy Mountain Sanctuaries
  for (const h of holyMountainList) {
    // Fill entire slice with temple brickwork
    for (let y = h.y0; y < h.y1; y++) {
      for (let x = 12; x < W - 12; x++) {
        setm(x, y, MAT.TEMPLE);
      }
    }
    // Hollow out the sanctuary chamber
    for (let y = h.y0 + 6; y < h.y1 - 4; y++) {
      for (let x = 24; x < W - 24; x++) {
        setm(x, y, MAT.AIR);
      }
    }
    // Entrance tunnel from above
    for (let y = h.y0 - 15; y <= h.y0 + 6; y++) {
      for (let x = 148; x <= 172; x++) {
        setm(x, y, MAT.AIR);
      }
    }
    // Exit drop down to next biome
    for (let y = h.y1 - 4; y <= h.y1 + 18; y++) {
      for (let x = 250; x <= 275; x++) {
        setm(x, y, MAT.AIR);
      }
    }
    // Place temple props:
    // Left: Full Heal Heart
    worldProps.push({
      type: 'heart',
      x: 55,
      y: h.y1 - 8,
      w: 10,
      h: 10,
      used: false
    });
    // Spell refresher
    worldProps.push({
      type: 'refresher',
      x: 85,
      y: h.y1 - 8,
      w: 8,
      h: 8,
      used: false
    });
    // Center: Perk Altar
    worldProps.push({
      type: 'altar',
      x: 140,
      y: h.y1 - 6,
      w: 38,
      h: 12,
      holyIndex: h.index
    });
    // Right: Wand shop pedestal
    worldProps.push({
      type: 'shop_wand',
      x: 205,
      y: h.y1 - 8,
      wand: generateRandomWand(h.index + 1),
      cost: 40 + h.index * 30,
      bought: false
    });
    // Torches
    worldProps.push({ type: 'torch', x: 35, y: h.y0 + 12, id: h.index * 10 });
    worldProps.push({ type: 'torch', x: 160, y: h.y0 + 12, id: h.index * 10 + 1 });
    worldProps.push({ type: 'torch', x: 285, y: h.y0 + 12, id: h.index * 10 + 2 });
  }

  // 4. Starting area clearing
  for (let y = 14; y < 65; y++) {
    for (let x = 120; x < 200; x++) {
      setm(x, y, MAT.AIR);
    }
  }
  // Starting floor
  for (let x = 110; x < 210; x++) {
    setm(x, 65, MAT.DIRT);
  }

  // 5. Place Dungeon Props, Chests, Barrels, and Torches
  for (let band = 0; band < 8; band++) {
    const y0 = band * 280 + 50;
    const y1 = (band + 1) * 280 - 60;
    // Torches on walls
    for (let i = 0; i < 5; i++) {
      const tx = rint(30, W - 30);
      const ty = rint(y0, y1);
      if (getm(tx, ty) === MAT.AIR && SOLID_SET.has(getm(tx - 1, ty))) {
        worldProps.push({ type: 'torch', x: tx, y: ty, id: band * 20 + i });
      }
    }
    // Explosive / Acid Barrels
    for (let i = 0; i < 4; i++) {
      const bx = rint(30, W - 30);
      const by = rint(y0, y1);
      if (getm(bx, by) === MAT.AIR && SOLID_SET.has(getm(bx, by + 1))) {
        worldProps.push({
          type: rng() < 0.65 ? 'barrel_explosive' : 'barrel_acid',
          x: bx,
          y: by - 3,
          vx: 0,
          vy: 0,
          hp: 12,
          exploded: false
        });
      }
    }
    // Treasure Chests
    for (let i = 0; i < 2; i++) {
      const cx = rint(25, W - 25);
      const cy = rint(y0, y1);
      if (getm(cx, cy) === MAT.AIR && SOLID_SET.has(getm(cx, cy + 1))) {
        worldProps.push({
          type: 'chest',
          x: cx,
          y: cy - 2,
          opened: false
        });
      }
    }
    // Random dropped wands on pedestals
    if (rng() < 0.85) {
      const wx = rint(30, W - 30);
      const wy = rint(y0, y1);
      if (getm(wx, wy) === MAT.AIR && SOLID_SET.has(getm(wx, wy + 1))) {
        worldProps.push({
          type: 'wand_pedestal',
          x: wx,
          y: wy - 2,
          wand: generateRandomWand(band)
        });
      }
    }
  }

  // 6. Spawn Enemies across Biomes
  for (let band = 0; band < 8; band++) {
    const y0 = band * 280 + 70;
    const y1 = (band + 1) * 280 - 70;
    const count = 7 + band * 2;
    for (let i = 0; i < count; i++) {
      const ex = rint(25, W - 25);
      const ey = rint(y0, y1);
      if (getm(ex, ey) === MAT.AIR) {
        // Diverse enemy distribution
        let type = 'miner';
        const roll = rng();
        if (band === 0) {
          type = roll < 0.45 ? 'miner' : (roll < 0.8 ? 'bat' : 'kamikaze');
        } else if (band === 1) { // Coal Pits
          type = roll < 0.35 ? 'miner' : (roll < 0.65 ? 'sniper' : 'kamikaze');
        } else if (band === 2) { // Fungal
          type = roll < 0.4 ? 'kamikaze' : (roll < 0.7 ? 'bat' : 'miner');
        } else if (band === 3) { // Snowy Depths
          type = roll < 0.45 ? 'sniper' : (roll < 0.75 ? 'miner' : 'bat');
        } else if (band === 4) { // Hiisi Base
          type = roll < 0.5 ? 'sniper' : (roll < 0.8 ? 'miner' : 'kamikaze');
        } else if (band === 5) { // Jungle
          type = roll < 0.35 ? 'worm' : (roll < 0.65 ? 'kamikaze' : 'bat');
        } else if (band === 6) { // Vault
          type = roll < 0.4 ? 'sniper' : (roll < 0.7 ? 'kamikaze' : 'worm');
        } else { // Laboratory
          type = roll < 0.35 ? 'kamikaze' : (roll < 0.7 ? 'sniper' : 'worm');
        }
        spawnEnemy(type, ex, ey);
      }
    }
  }

  // 7. Laboratory Boss Arena (Kolmisilmä / 深渊主宰)
  const bossY = H - 110;
  for (let y = bossY - 35; y < H - 14; y++) {
    for (let x = 20; x < W - 20; x++) {
      setm(x, y, MAT.AIR);
    }
  }
  // Temple walls & floor for boss arena
  for (let x = 14; x < W - 14; x++) {
    setm(x, H - 14, MAT.TEMPLE);
    setm(x, bossY - 36, MAT.TEMPLE);
  }
  // Bottom lava moat
  for (let x = 30; x < W - 30; x++) {
    setm(x, H - 16, MAT.LAVA);
    setm(x, H - 15, MAT.LAVA);
  }
  // Spawn Boss
  boss = spawnEnemy('boss', 160, bossY);

  // 8. Initialize Player
  player = {
    x: 160,
    y: 50,
    vx: 0,
    vy: 0,
    w: 6,
    h: 10,
    hp: 100,
    maxHp: 100,
    hover: 100,
    maxHover: 100,
    oxygen: 100,
    maxOxygen: 100,
    inv: 0,
    hitFlash: 0,
    onGround: false,
    inLiquid: false,
    submerged: false,
    dir: 1,
    aimAngle: 0,
    // Status effects
    fire: 0,
    wet: 0,
    bloody: 0,
    poison: 0,
    dead: false,
    perks: {},
    kills: 0
  };
}

// --- Spells & Modifiers System ---
const SPELLS = {
  // 8 Projectiles (弹体)
  spark: {
    id: 'spark',
    name: '火花弹',
    type: 'projectile',
    icon: '✦',
    cost: 5,
    delay: 0.06,
    dmg: 12,
    speed: 4.8,
    color: '#ffe570',
    desc: '轻巧迅速的基础魔法弹，击中目标时迸射火花。'
  },
  bouncy: {
    id: 'bouncy',
    name: '弹跳弹',
    type: 'projectile',
    icon: '⦿',
    cost: 8,
    delay: 0.10,
    dmg: 14,
    speed: 5.2,
    bouncy: true,
    color: '#7ef59b',
    desc: '拥有极高弹性的高能光弹，在地形表面反复弹射。'
  },
  arrow: {
    id: 'arrow',
    name: '魔法箭',
    type: 'projectile',
    icon: '➤',
    cost: 12,
    delay: 0.16,
    dmg: 24,
    speed: 5.6,
    piercing: true,
    color: '#82d5ff',
    desc: '蕴含穿刺动能的光耀飞矢，留下一道锐利光轨。'
  },
  fireball: {
    id: 'fireball',
    name: '烈焰球',
    type: 'projectile',
    icon: '✹',
    cost: 22,
    delay: 0.28,
    dmg: 35,
    speed: 3.2,
    rad: 12,
    explosive: true,
    fire: true,
    color: '#ff8438',
    desc: '引燃一切可燃物的爆裂火球，命中时引发烈焰爆炸。'
  },
  bomb: {
    id: 'bomb',
    name: '不稳定炸弹',
    type: 'projectile',
    icon: '💣',
    cost: 32,
    delay: 0.40,
    dmg: 75,
    speed: 2.2,
    gravity: 0.08,
    rad: 20,
    explosive: true,
    color: '#ffd054',
    desc: '受重力影响的强力爆破物，能大幅破坏岩层与地形。'
  },
  drill: {
    id: 'drill',
    name: '光明钻头',
    type: 'projectile',
    icon: '⚡',
    cost: 9,
    delay: -0.12, // reduce delay
    dmg: 9,
    speed: 6.5,
    drill: true,
    color: '#e6f7ff',
    desc: '瞬间瓦解任何岩石的近距高频激光，同时大幅降低施法延迟。'
  },
  energy_orb: {
    id: 'energy_orb',
    name: '能量巨球',
    type: 'projectile',
    icon: '⬤',
    cost: 18,
    delay: 0.20,
    dmg: 28,
    speed: 2.8,
    carve: true,
    color: '#d488ff',
    desc: '穿透性重型光球，能一路溶蚀软质地形并造成重创。'
  },
  black_hole: {
    id: 'black_hole',
    name: '小型黑洞',
    type: 'projectile',
    icon: '🕳️',
    cost: 45,
    delay: 0.50,
    dmg: 45,
    speed: 1.1,
    blackHole: true,
    color: '#1a1024',
    desc: '缓慢向前蠕动的引力奇点，贪婪吞噬途经的一切物质。'
  },

  // 3 Triggers (触发弹体)
  trigger_spark: {
    id: 'trigger_spark',
    name: '火花弹-带触发',
    type: 'trigger',
    icon: '✦⇥',
    cost: 10,
    delay: 0.08,
    dmg: 10,
    speed: 4.6,
    trigger: true,
    color: '#ffd34d',
    desc: '高速火花弹；在命中地形或敌人的一瞬间，释放后置法术！'
  },
  timer_arrow: {
    id: 'timer_arrow',
    name: '魔法箭-带定时',
    type: 'trigger',
    icon: '➤⏱',
    cost: 16,
    delay: 0.18,
    dmg: 20,
    speed: 5.0,
    timerTrigger: 16, // ticks
    color: '#6ad7f7',
    desc: '飞行0.26秒或命中目标时，在所处坐标引爆后续法术连锁。'
  },
  trigger_teleport: {
    id: 'trigger_teleport',
    name: '传送弹-带触发',
    type: 'trigger',
    icon: '🌀⇥',
    cost: 25,
    delay: 0.35,
    dmg: 0,
    speed: 4.4,
    teleport: true,
    trigger: true,
    color: '#bf7eff',
    desc: '将施法者瞬间折跃至落点，并在目的地施放后续法术。'
  },

  // 7 Modifiers (修饰符)
  mod_multicast: {
    id: 'mod_multicast',
    name: '三重散射',
    type: 'mod',
    icon: '⑂',
    cost: 12,
    delay: 0.08,
    multicast: 3,
    color: '#ffc866',
    desc: '将后续法术以散射扇形同时发射 3 枚。'
  },
  mod_homing: {
    id: 'mod_homing',
    name: '追踪修饰',
    type: 'mod',
    icon: '🎯',
    cost: 8,
    delay: 0.04,
    homing: true,
    color: '#dc85ff',
    desc: '赋予弹体主动转向并追踪附近敌人的引导演算。'
  },
  mod_fire_trail: {
    id: 'mod_fire_trail',
    name: '火焰轨迹',
    type: 'mod',
    icon: '🔥',
    cost: 6,
    delay: 0.02,
    fireTrail: true,
    color: '#ff7338',
    desc: '使弹体在飞行途中不断沿途倾泻真实燃烧的火焰像素。'
  },
  mod_damage: {
    id: 'mod_damage',
    name: '重击修饰',
    type: 'mod',
    icon: '💥',
    cost: 8,
    delay: 0.06,
    damageAdd: 18,
    color: '#ff5454',
    desc: '极大提升弹体杀伤力与打击冲击波（+18伤害）。'
  },
  mod_bounce: {
    id: 'mod_bounce',
    name: '弹跳修饰',
    type: 'mod',
    icon: '⤹',
    cost: 4,
    delay: 0.0,
    bouncy: true,
    color: '#7be3a4',
    desc: '让任何原本触墙即毁的弹体获得反弹物理属性。'
  },
  mod_explosion: {
    id: 'mod_explosion',
    name: '爆炸修饰',
    type: 'mod',
    icon: '💣',
    cost: 14,
    delay: 0.12,
    explosive: true,
    rad: 10,
    color: '#ffa64d',
    desc: '使任何弹体在终点爆发额外的范围爆炸与碎岩冲击。'
  },
  mod_recharge: {
    id: 'mod_recharge',
    name: '减耗加速',
    type: 'mod',
    icon: '⚡',
    cost: -3,
    delay: -0.12,
    rechargeMod: -0.18,
    color: '#8af0ff',
    desc: '缩短魔杖的充能等待与施法间隔，使射速大幅提升。'
  }
};

function getSpell(id) {
  return SPELLS[id] || SPELLS.spark;
}

// --- Wand Factory ---
function createWand({
  name,
  spriteId = 0,
  shuffle = false,
  spellsPerCast = 1,
  castDelay = 0.15,
  recharge = 0.45,
  manaMax = 160,
  manaCharge = 50,
  capacity = 5,
  spread = 0.0,
  slots = []
}) {
  return {
    name,
    spriteId,
    shuffle,
    spellsPerCast,
    castDelay,
    recharge,
    manaMax,
    manaCharge,
    capacity,
    spread,
    slots: [...slots],
    mana: manaMax,
    castTimer: 0,
    rechargeTimer: 0,
    cursor: 0
  };
}

function generateRandomWand(tier = 1) {
  const names = ['红莲幼苗', '迅捷刺针', '学者秘杖', '雷铸铁杖', '混沌碎晶', '远古重锤', '晶簇之眼'];
  const name = names[rint(0, names.length - 1)];
  const shuffle = rng() < 0.4;
  const capacity = clamp(rint(3 + tier, 5 + tier * 2), 4, 8);
  const manaMax = rint(140 + tier * 40, 240 + tier * 60);
  const manaCharge = rint(35 + tier * 15, 65 + tier * 25);
  const castDelay = clamp(0.22 - tier * 0.025 + rng() * 0.1, 0.04, 0.4);
  const recharge = clamp(0.60 - tier * 0.05 + rng() * 0.2, 0.15, 1.1);

  // Pick starter spells for this wand
  const pool = [
    'spark', 'bouncy', 'arrow', 'fireball', 'bomb', 'drill', 'energy_orb',
    'trigger_spark', 'timer_arrow',
    'mod_multicast', 'mod_homing', 'mod_fire_trail', 'mod_damage', 'mod_bounce', 'mod_recharge'
  ];
  const numSpells = rint(2, Math.min(capacity, 4));
  const slots = [];
  for (let i = 0; i < numSpells; i++) {
    slots.push(pool[rint(0, pool.length - 1)]);
  }

  return createWand({
    name,
    spriteId: rint(0, 3),
    shuffle,
    spellsPerCast: 1,
    castDelay,
    recharge,
    manaMax,
    manaCharge,
    capacity,
    spread: 0.02,
    slots
  });
}

function setupInitialWands() {
  wands = [
    // Wand 1: Starter combat wand (Fast spark bolt)
    createWand({
      name: '学徒火花杖',
      spriteId: 0,
      shuffle: false,
      spellsPerCast: 1,
      castDelay: 0.10,
      recharge: 0.35,
      manaMax: 150,
      manaCharge: 55,
      capacity: 4,
      slots: ['spark', 'spark']
    }),
    // Wand 2: Bomb wand for digging
    createWand({
      name: '矿工爆破手杖',
      spriteId: 1,
      shuffle: false,
      spellsPerCast: 1,
      castDelay: 0.35,
      recharge: 0.65,
      manaMax: 180,
      manaCharge: 35,
      capacity: 3,
      slots: ['bomb']
    }),
    // Wand 3: Trigger & Combo Wand
    createWand({
      name: '奥术连锁之刺',
      spriteId: 2,
      shuffle: false,
      spellsPerCast: 1,
      castDelay: 0.12,
      recharge: 0.45,
      manaMax: 220,
      manaCharge: 60,
      capacity: 6,
      slots: ['trigger_spark', 'mod_homing', 'arrow']
    }),
    // Wand 4: Utility / High Velocity
    createWand({
      name: '晶耀共鸣棱镜',
      spriteId: 3,
      shuffle: false,
      spellsPerCast: 1,
      castDelay: 0.08,
      recharge: 0.30,
      manaMax: 200,
      manaCharge: 70,
      capacity: 5,
      slots: ['drill', 'bouncy']
    })
  ];

  spellPouch = [
    'fireball',
    'mod_multicast',
    'mod_fire_trail',
    'timer_arrow',
    'energy_orb',
    'mod_damage',
    'trigger_spark'
  ];
}

// --- Cellular Automata Engine (像素物理模拟) ---
function updateCellularAutomata() {
  const y0 = clamp(Math.floor(cameraY) - 16, 0, H - 1);
  const y1 = clamp(Math.floor(cameraY) + VH + 20, 1, H - 2);

  // Alternate horizontal sweep direction each frame to remove directional bias
  const leftToRight = (frame % 2 === 0);

  for (let y = y1; y >= y0; y--) {
    const xStart = leftToRight ? 1 : W - 2;
    const xEnd = leftToRight ? W - 1 : 0;
    const xStep = leftToRight ? 1 : -1;

    for (let x = xStart; x !== xEnd; x += xStep) {
      const i = idx(x, y);
      const m = world.cells[i];
      if (m === MAT.AIR) continue;

      // 1. POWDERS (Sand, Snow, Gunpowder, Gold Dust)
      if (POWDER_SET.has(m)) {
        const below = getm(x, y + 1);
        if (below === MAT.AIR || LIQUID_SET.has(below)) {
          // Fall down and sink into liquid
          setm(x, y, below);
          setm(x, y + 1, m);
        } else {
          // Slide down slope
          const dir = rng() < 0.5 ? -1 : 1;
          const diag1 = getm(x + dir, y + 1);
          const diag2 = getm(x - dir, y + 1);
          if (diag1 === MAT.AIR || LIQUID_SET.has(diag1)) {
            setm(x, y, diag1);
            setm(x + dir, y + 1, m);
          } else if (diag2 === MAT.AIR || LIQUID_SET.has(diag2)) {
            setm(x, y, diag2);
            setm(x - dir, y + 1, m);
          }
        }
        continue;
      }

      // 2. LIQUIDS (Oil, Water, Toxic, Blood, Acid, Lava)
      if (LIQUID_SET.has(m)) {
        const curDensity = LIQUID_DENSITY[m] || 1.0;

        // --- Instant Contact Reactions ---
        // Lava + Water / Blood -> Lava turns to solid LAVAROCK, liquid turns to rising STEAM!
        if (m === MAT.LAVA) {
          let reacted = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nm = getm(x + dx, y + dy);
              if (nm === MAT.WATER || nm === MAT.BLOOD) {
                setm(x, y, MAT.LAVAROCK);
                setm(x + dx, y + dy, MAT.STEAM);
                sfx.steamHiss();
                reacted = true;
                break;
              }
            }
            if (reacted) break;
          }
          if (reacted) continue;
        }

        // Water purifying Toxic Sludge
        if (m === MAT.WATER) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (getm(x + dx, y + dy) === MAT.TOXIC && rng() < 0.15) {
                setm(x + dx, y + dy, MAT.WATER);
              }
            }
          }
        }

        // Reactions for Acid (Acid vigorously corrodes all solid materials!)
        if (m === MAT.ACID) {
          let dissolved = false;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nm = getm(x + dx, y + dy);
              if (SOLID_SET.has(nm)) {
                if (rng() < 0.35) {
                  setm(x + dx, y + dy, MAT.AIR);
                  setm(x, y, MAT.ACID_GAS);
                  if (rng() < 0.12) sfx.acidSizzle();
                  dissolved = true;
                  break;
                }
              }
            }
            if (dissolved) break;
          }
          if (dissolved) continue;
        }

        // --- Liquid Gravity & Density Displacement ---
        const below = getm(x, y + 1);
        const belowDensity = LIQUID_DENSITY[below] || 0;

        // Fall into Air or sink below lighter liquid
        if (below === MAT.AIR || (LIQUID_SET.has(below) && belowDensity < curDensity)) {
          setm(x, y, below);
          setm(x, y + 1, m);
          continue;
        }

        // Diagonal & Lateral Flow (with density sorting)
        const dir = rng() < 0.5 ? -1 : 1;
        const diag1 = getm(x + dir, y + 1);
        const diag1Dens = LIQUID_DENSITY[diag1] || 0;
        if (diag1 === MAT.AIR || (LIQUID_SET.has(diag1) && diag1Dens < curDensity)) {
          setm(x, y, diag1);
          setm(x + dir, y + 1, m);
          continue;
        }

        const diag2 = getm(x - dir, y + 1);
        const diag2Dens = LIQUID_DENSITY[diag2] || 0;
        if (diag2 === MAT.AIR || (LIQUID_SET.has(diag2) && diag2Dens < curDensity)) {
          setm(x, y, diag2);
          setm(x - dir, y + 1, m);
          continue;
        }

        // Lateral spread on flat surface
        const lat1 = getm(x + dir, y);
        const lat1Dens = LIQUID_DENSITY[lat1] || 0;
        if (lat1 === MAT.AIR || (LIQUID_SET.has(lat1) && lat1Dens < curDensity)) {
          setm(x, y, lat1);
          setm(x + dir, y, m);
          continue;
        }
        const lat2 = getm(x - dir, y);
        const lat2Dens = LIQUID_DENSITY[lat2] || 0;
        if (lat2 === MAT.AIR || (LIQUID_SET.has(lat2) && lat2Dens < curDensity)) {
          setm(x, y, lat2);
          setm(x - dir, y, m);
          continue;
        }
        continue;
      }

      // 3. GASES (Smoke, Steam, Acid Gas) - Inverse Gravity
      if (GAS_SET.has(m)) {
        if (rng() < 0.02) {
          // Gradual dissipation
          setm(x, y, m === MAT.STEAM && rng() < 0.3 ? MAT.WATER : MAT.AIR);
          continue;
        }
        const above = getm(x, y - 1);
        if (above === MAT.AIR) {
          setm(x, y, MAT.AIR);
          setm(x, y - 1, m);
        } else {
          const dir = rng() < 0.5 ? -1 : 1;
          if (getm(x + dir, y - 1) === MAT.AIR) {
            setm(x, y, MAT.AIR);
            setm(x + dir, y - 1, m);
          } else if (getm(x + dir, y) === MAT.AIR) {
            setm(x, y, MAT.AIR);
            setm(x + dir, y, m);
          }
        }
        continue;
      }

      // 4. FIRE (Spreads to Wood, Oil, Coal, Gunpowder; doused by Water)
      if (m === MAT.FIRE) {
        let age = world.meta[i] + 1;
        world.meta[i] = age;

        // Fire lifetime & smoke generation
        if (age > 18 || rng() < 0.08) {
          setm(x, y, rng() < 0.7 ? MAT.SMOKE : MAT.AIR);
          continue;
        }

        // Spread to adjacent burnable materials
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nm = getm(x + dx, y + dy);
            if (nm === MAT.WATER || nm === MAT.BLOOD) {
              setm(x, y, MAT.AIR);
              setm(x + dx, y + dy, MAT.STEAM);
              break;
            } else if (nm === MAT.WOOD || nm === MAT.MOSS) {
              if (rng() < 0.12) setm(x + dx, y + dy, MAT.FIRE);
            } else if (nm === MAT.COAL) {
              if (rng() < 0.08) setm(x + dx, y + dy, MAT.FIRE);
            } else if (nm === MAT.OIL) {
              setm(x + dx, y + dy, MAT.FIRE); // Oil catches fire vigorously
            } else if (nm === MAT.GUNPOWDER) {
              // Detonate gunpowder in chain reaction!
              setm(x + dx, y + dy, MAT.FIRE);
              explode(x + dx, y + dy, 15, 45, 'gunpowder');
            }
          }
        }
      }
    }
  }
}

// --- Pixel Blitting & Background Rendering ---
function renderWorldBuffer() {
  const camY = Math.floor(cameraY);
  const currentBiome = getBiomeAt(camY + VH * 0.5);

  for (let sy = 0; sy < VH; sy++) {
    const wy = camY + sy;
    for (let sx = 0; sx < VW; sx++) {
      const wx = sx;
      const bufIdx = sy * VW + sx;
      const m = getm(wx, wy);

      if (m === MAT.AIR) {
        // Atmospheric background cave wall with parallax depth
        const bgHash = hash2D(wx, wy);
        const depthNoise = Math.sin(wx * 0.04 + wy * 0.02) * Math.cos(wx * 0.02 - wy * 0.04);
        if (depthNoise > 0.35) {
          worldBuf32[bufIdx] = packABGR(18, 20, 32); // deep cave pillar
        } else if (depthNoise > 0.05) {
          worldBuf32[bufIdx] = (bgHash % 12 === 0) ? packABGR(15, 17, 28) : packABGR(10, 12, 20);
        } else {
          worldBuf32[bufIdx] = packABGR(5, 7, 13); // dark void background
        }
      } else {
        // Granular textured material pixel
        const pal = PALETTES[m];
        if (pal) {
          const h = hash2D(wx, wy);
          let col = pal[h % pal.length];
          // Top edge highlight if air is above
          if (SOLID_SET.has(m) && getm(wx, wy - 1) === MAT.AIR) {
            col = pal[pal.length - 1];
          }
          // Animated surface waves for water
          if (m === MAT.WATER && ((wx + wy + (frame >> 2)) % 7 === 0)) {
            col = pal[3];
          }
          // Lava heat pulsing
          if (m === MAT.LAVA && ((wx + (frame >> 3)) % 5 === 0)) {
            col = pal[1];
          }
          worldBuf32[bufIdx] = col;
        } else {
          worldBuf32[bufIdx] = packABGR(120, 120, 120);
        }
      }
    }
  }

  ctx.putImageData(worldImgData, 0, 0);
}

// --- Dynamic Darkness & Radial Lighting Engine ---
function renderLightingPass() {
  const camY = Math.floor(cameraY);
  const activeBiome = getBiomeAt(camY + VH * 0.5);
  const isInsideHoly = holyMountainList.some(h => camY + VH * 0.5 >= h.y0 && camY + VH * 0.5 < h.y1);

  // 1. Fill darkness mask
  lightCtx.globalCompositeOperation = 'source-over';
  if (isInsideHoly) {
    // Holy Mountain: peaceful purple sacred ambiance
    lightCtx.fillStyle = 'rgba(16, 12, 28, 0.72)';
  } else if (camY > 2000) {
    // Laboratory / Lava: sinister fiery ambient
    lightCtx.fillStyle = 'rgba(25, 8, 6, 0.82)';
  } else {
    // True Noita pitch black caves!
    lightCtx.fillStyle = 'rgba(4, 6, 12, 0.95)';
  }
  lightCtx.fillRect(0, 0, VW, VH);

  // 2. Cut holes into darkness using radial gradients (destination-out)
  lightCtx.globalCompositeOperation = 'destination-out';

  function punchLight(x, y, radius, innerRatio = 0.15, maxAlpha = 1.0) {
    const sy = y - camY;
    if (sy < -radius || sy > VH + radius) return;
    const g = lightCtx.createRadialGradient(x, sy, radius * innerRatio, x, sy, radius);
    g.addColorStop(0, `rgba(0,0,0,${maxAlpha})`);
    g.addColorStop(0.6, `rgba(0,0,0,${maxAlpha * 0.6})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = g;
    lightCtx.beginPath();
    lightCtx.arc(x, sy, radius, 0, Math.PI * 2);
    lightCtx.fill();
  }

  // Player Lantern Light Aura (warm radial glow)
  if (!player.dead) {
    const pRadius = 58 + Math.sin(frame * 0.1) * 2;
    punchLight(player.x, player.y, pRadius, 0.18, 0.98);
  }

  // Torches & Braziers
  for (const p of worldProps) {
    if (p.type === 'torch') {
      const flicker = Math.sin(frame * 0.25 + p.id) * 3;
      punchLight(p.x, p.y, 48 + flicker, 0.2, 0.95);
    } else if (p.type === 'altar') {
      punchLight(p.x + 19, p.y + 6, 65, 0.2, 0.85);
    }
  }

  // Projectiles Glowing Light
  for (const p of projectiles) {
    let rad = 32;
    if (p.type === 'fireball' || p.explosive) rad = 52;
    else if (p.drill) rad = 28;
    else if (p.type === 'bomb') rad = 42;
    punchLight(p.x, p.y, rad, 0.25, 0.95);
  }

  // Dynamic Explosions & Flashes
  for (const pt of particles) {
    if (pt.kind === 'flash' || pt.kind === 'boom') {
      const rad = (pt.rad || 20) * 2.5;
      const alpha = pt.life / pt.max;
      punchLight(pt.x, pt.y, rad, 0.1, alpha);
    }
  }

  // Boss Radiant Aura
  if (boss && !boss.dead) {
    punchLight(boss.x, boss.y, 90, 0.3, 0.95);
  }

  // 3. Blit darkness mask over main canvas
  ctx.drawImage(lightCanvas, 0, 0);

  // 4. Bloom / Lighter composite pass for glowing cores
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of worldProps) {
    if (p.type === 'torch') {
      const sy = p.y - camY;
      ctx.fillStyle = 'rgba(255, 170, 50, 0.25)';
      ctx.beginPath();
      ctx.arc(p.x, sy, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const p of projectiles) {
    const sy = p.y - camY;
    ctx.fillStyle = p.color ? `${p.color}44` : 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(p.x, sy, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- Player Physics, Jetpack & Status Effects ---
function solidAtRect(x, y, w, h) {
  const left = Math.floor(x - w * 0.5);
  const right = Math.floor(x + w * 0.5);
  const top = Math.floor(y - h * 0.5);
  const bottom = Math.floor(y + h * 0.5);

  for (let yy = top; yy <= bottom; yy++) {
    for (let xx = left; xx <= right; xx++) {
      if (SOLID_SET.has(getm(xx, yy))) return true;
    }
  }
  return false;
}

function moveEntity(ent, dx, dy, w, h) {
  let moved = false;
  // Horizontal movement
  if (dx !== 0) {
    const nextX = ent.x + dx;
    if (!solidAtRect(nextX, ent.y, w, h)) {
      ent.x = nextX;
      moved = true;
    } else {
      // Step up 1 pixel for slopes/stairs
      if (!solidAtRect(nextX, ent.y - 1.5, w, h)) {
        ent.x = nextX;
        ent.y -= 1.5;
        moved = true;
      } else {
        ent.vx = 0;
      }
    }
  }
  // Vertical movement
  if (dy !== 0) {
    const nextY = ent.y + dy;
    if (!solidAtRect(ent.x, nextY, w, h)) {
      ent.y = nextY;
      moved = true;
    } else {
      ent.vy = 0;
    }
  }
  return moved;
}

function updatePlayer() {
  if (player.dead) return;

  const left = keys.a || keys.ArrowLeft;
  const right = keys.d || keys.ArrowRight;
  const jump = keys.w || keys.ArrowUp || keys[' '];
  const crouch = keys.s || keys.ArrowDown;

  // Horizontal acceleration
  const accel = (right ? 1 : 0) - (left ? 1 : 0);
  if (accel !== 0) {
    player.vx += accel * 0.18;
    player.dir = accel;
  }
  player.vx *= 0.82;
  player.vx = clamp(player.vx, -1.8, 1.8);

  // Ground check
  player.onGround = solidAtRect(player.x, player.y + player.h * 0.5 + 1.2, player.w, 2);

  // Check liquid submergence & physics
  const curMat = getm(player.x, player.y);
  player.inLiquid = LIQUID_SET.has(curMat);
  const headMat = getm(player.x, player.y - 4);
  player.submerged = LIQUID_SET.has(headMat);

  // Liquid buoyancy & swimming
  if (player.inLiquid) {
    player.vx *= 0.75;
    player.vy *= 0.7;
    // Extinguish fire in water / blood
    if (curMat === MAT.WATER || curMat === MAT.BLOOD) {
      if (player.fire > 0) {
        player.fire = 0;
        sfx.steamHiss();
      }
      player.wet = 180;
      if (curMat === MAT.BLOOD) player.bloody = 120;
    }
    // Toxic sludge poisoning
    if (curMat === MAT.TOXIC && !player.perks.toxicImmunity) {
      player.poison = Math.max(player.poison, 120);
    }
    // Acid burns immediately!
    if (curMat === MAT.ACID && !player.perks.toxicImmunity) {
      damagePlayer(1.5, '被强酸腐蚀融化');
    }
    // Lava incinerates!
    if (curMat === MAT.LAVA && !player.perks.fireImmunity) {
      damagePlayer(4.0, '被熔岩焚为灰烬');
      player.fire = 240;
    }
  }

  // Drowning Mechanics (Oxygen depletion)
  if (player.submerged) {
    player.oxygen = Math.max(0, player.oxygen - 0.45);
    $('breathWrapper').style.display = 'flex';
    if (player.oxygen <= 0) {
      damagePlayer(1.2, '在深水中溺亡');
    }
  } else {
    player.oxygen = Math.min(player.maxOxygen, player.oxygen + 1.2);
    if (player.oxygen >= player.maxOxygen) {
      $('breathWrapper').style.display = 'none';
    }
  }

  // Jump & Levitation (Jetpack)
  if (jump) {
    if (player.onGround) {
      player.vy = -3.4;
      player.onGround = false;
      sfx.jump();
    } else if (player.hover > 0) {
      // Levitate upward with magical thrust
      player.vy -= 0.28;
      player.hover -= 0.65;
      // Emit jetpack magical sparks from player robe
      if (frame % 2 === 0) {
        particles.push({
          x: player.x + rint(-2, 2),
          y: player.y + 5,
          vx: rint(-1, 1) * 0.4,
          vy: rint(1, 3) * 0.6,
          life: 14,
          max: 14,
          color: '#52b7ff',
          kind: 'spark'
        });
      }
    }
  } else {
    // Regenerate hover fuel when not flying
    const regen = player.perks.flight ? 0.7 : (player.onGround ? 0.55 : 0.2);
    player.hover = Math.min(player.maxHover, player.hover + regen);
  }

  // Gravity
  const grav = player.inLiquid ? 0.06 : 0.18;
  player.vy += grav;
  player.vy = clamp(player.vy, -4.2, player.inLiquid ? 1.5 : 4.0);

  // Execute motion with collision
  moveEntity(player, player.vx, 0, player.w, player.h);
  moveEntity(player, 0, player.vy, player.w, player.h);

  // Status effect timers
  if (player.fire > 0) {
    player.fire--;
    if (frame % 20 === 0 && !player.perks.fireImmunity) {
      damagePlayer(2.0, '被烈火焚为灰烬');
    }
    // Spawn fire particles on player
    if (frame % 3 === 0) {
      particles.push({
        x: player.x + rint(-3, 3),
        y: player.y + rint(-4, 4),
        vx: 0,
        vy: -0.8,
        life: 12,
        max: 12,
        color: '#ff6224',
        kind: 'spark'
      });
    }
  }

  if (player.poison > 0) {
    player.poison--;
    if (frame % 30 === 0 && !player.perks.toxicImmunity) {
      damagePlayer(1.5, '剧毒腐蚀身亡');
    }
  }

  if (player.wet > 0) player.wet--;
  if (player.bloody > 0) player.bloody--;
  if (player.inv > 0) player.inv--;
  if (player.hitFlash > 0) player.hitFlash--;

  // Wand cooldowns & mana regeneration
  for (const w of wands) {
    w.mana = Math.min(w.manaMax, w.mana + (w.manaCharge / 60));
    if (w.castTimer > 0) w.castTimer--;
    if (w.rechargeTimer > 0) w.rechargeTimer--;
  }

  // Aiming direction & mouse firing
  const aim = getAimVector();
  player.aimAngle = Math.atan2(aim.dy, aim.dx);

  if (pointer.down) {
    castActiveWand();
  }
}

function getAimVector() {
  let dx = pointer.x - player.x;
  let dy = (pointer.y + cameraY) - player.y;
  const len = Math.hypot(dx, dy) || 1;
  return { dx: dx / len, dy: dy / len, len };
}

function damagePlayer(dmg, reason) {
  if (player.dead || player.inv > 0) return;

  const mult = player.perks.shield ? 0.6 : 1.0;
  const finalDmg = Math.max(1, Math.round(dmg * mult));

  player.hp -= finalDmg;
  player.inv = 22;
  player.hitFlash = 3;
  addScreenShake(3);
  sfx.playerHurt();

  // Floating damage text
  particles.push({
    x: player.x,
    y: player.y - 8,
    text: `-${finalDmg}`,
    color: '#ff4444',
    life: 30,
    max: 30,
    kind: 'text'
  });

  if (player.hp <= 0) {
    killPlayer(reason);
  }
}

function killPlayer(reason = '死亡是学习的一部分') {
  if (player.dead) return;
  player.dead = true;
  gameState = 'dead';
  addScreenShake(12);
  sfx.playerDead();

  // Eject gore
  for (let i = 0; i < 20; i++) {
    particles.push({
      x: player.x + rint(-4, 4),
      y: player.y + rint(-4, 4),
      vx: rint(-2, 2) * 0.8,
      vy: rint(-3, 1) * 0.8,
      life: 40,
      max: 40,
      color: '#c42535',
      kind: 'blood'
    });
  }

  // Format death screen
  const timeSec = Math.floor((Date.now() - runStartTime) / 1000);
  const min = Math.floor(timeSec / 60);
  const sec = timeSec % 60;
  $('deadReason').textContent = `死因：${reason}`;
  $('runStats').innerHTML = `
    <div>✦ 深入深度：<b>${Math.floor(runDepth)}m</b> (${getBiomeAt(player.y).name})</div>
    <div>✦ 击杀生物：<b>${player.kills}</b> 个</div>
    <div>✦ 积累黄金：<b>${runGold} ❂</b></div>
    <div>✦ 存活时间：<b>${min}分 ${sec}秒</b></div>
    <div>✦ 最终魔杖：<b>${wands[currentWand].name}</b> (${wands[currentWand].slots.length} 张法术)</div>
  `;
  $('dead').classList.remove('hide');
}

// --- Wand & Spell Interpreter (法杖组装与连锁发射) ---
function castActiveWand() {
  if (gameState !== 'play' || editMode || perkChoices.length) return;
  const w = wands[currentWand];

  // Check cooldown & recharge
  if (w.castTimer > 0 || w.rechargeTimer > 0) return;
  if (!w.slots.length) return;

  const aim = getAimVector();

  // Cast Evaluation State
  const castState = {
    multicast: 1,
    damageAdd: 0,
    speedMult: 1.0,
    homing: false,
    fireTrail: false,
    bouncy: false,
    explosive: false,
    radAdd: 0,
    drill: false,
    castDelayAdd: 0,
    rechargeMod: 0
  };

  let spellsFired = 0;
  let totalManaUsed = 0;

  // Evaluate slots from cursor or 0
  while (w.cursor < w.slots.length && spellsFired < castState.multicast) {
    const spellId = w.slots[w.cursor];
    const s = getSpell(spellId);
    w.cursor++;

    // Check mana
    if (w.mana < s.cost) {
      showToast('魔力不足', true);
      sfx.manaEmpty();
      break;
    }
    w.mana -= s.cost;
    totalManaUsed += s.cost;
    castState.castDelayAdd += (s.delay || 0) * 60;

    if (s.type === 'mod') {
      // Apply modifier
      if (s.multicast) castState.multicast = Math.max(castState.multicast, s.multicast);
      if (s.damageAdd) castState.damageAdd += s.damageAdd;
      if (s.homing) castState.homing = true;
      if (s.fireTrail) castState.fireTrail = true;
      if (s.bouncy) castState.bouncy = true;
      if (s.explosive) { castState.explosive = true; castState.radAdd += 4; }
      if (s.rechargeMod) castState.rechargeMod += s.rechargeMod * 60;
    } else if (s.type === 'trigger') {
      // Trigger spell: gathers modifiers and target projectiles into payload
      const payload = [];
      let neededProjectiles = 1;
      while (w.cursor < w.slots.length && neededProjectiles > 0) {
        const nextId = w.slots[w.cursor];
        const nextSpell = getSpell(nextId);
        payload.push(nextId);
        w.cursor++;
        if (nextSpell.type === 'mod') {
          if (nextSpell.multicast) {
            neededProjectiles = Math.max(neededProjectiles, nextSpell.multicast);
          }
        } else {
          neededProjectiles--;
        }
      }
      fireProjectile(s, aim.dx, aim.dy, castState, payload);
      spellsFired++;
    } else {
      // Standard projectile
      fireProjectile(s, aim.dx, aim.dy, castState, null);
      spellsFired++;
    }
  }

  // Handle End of Deck / Recharge
  if (w.cursor >= w.slots.length) {
    w.cursor = 0;
    w.rechargeTimer = Math.max(4, Math.round((w.recharge + castState.rechargeMod / 60) * 60));
  }

  w.castTimer = Math.max(3, Math.round((w.castDelay * 60) + castState.castDelayAdd));
  addScreenShake(1.5);
}

function fireProjectile(s, dx, dy, mods = {}, payload = null, originX = null, originY = null) {
  const startX = originX !== null ? originX : player.x + dx * 8;
  const startY = originY !== null ? originY : player.y + dy * 8;

  const spd = (s.speed || 4.5) * (mods.speedMult || 1.0);
  const dmg = (s.dmg + (mods.damageAdd || 0)) * (player.perks.glassCannon ? 2.5 : 1.0);
  const rad = ((s.rad || 6) + (mods.radAdd || 0)) * (player.perks.glassCannon ? 1.8 : 1.0);

  const p = {
    x: startX,
    y: startY,
    vx: dx * spd,
    vy: dy * spd,
    life: s.type === 'trigger' ? 140 : 160,
    maxLife: 160,
    dmg,
    rad,
    color: s.color || '#ffe066',
    spellId: s.id,
    type: s.id,
    bouncy: s.bouncy || mods.bouncy,
    bounceCount: 0,
    piercing: s.piercing,
    drill: s.drill || mods.drill,
    carve: s.carve,
    blackHole: s.blackHole,
    explosive: s.explosive || mods.explosive,
    fire: s.fire,
    fireTrail: mods.fireTrail,
    homing: mods.homing,
    trigger: s.trigger,
    timerTrigger: s.timerTrigger,
    teleport: s.teleport,
    payload: payload ? [...payload] : null,
    owner: 'player'
  };

  projectiles.push(p);
  sfx.cast(s.id);
}

function executeTriggerPayload(payload, x, y, dx, dy) {
  if (!payload || !payload.length) return;
  const subState = {
    multicast: 1,
    damageAdd: 0,
    speedMult: 1.0,
    fireTrail: false,
    homing: false,
    bouncy: false,
    explosive: false
  };

  const projsToFire = [];
  for (const pid of payload) {
    const s = getSpell(pid);
    if (s.type === 'mod') {
      if (s.multicast) subState.multicast = Math.max(subState.multicast, s.multicast);
      if (s.homing) subState.homing = true;
      if (s.fireTrail) subState.fireTrail = true;
      if (s.damageAdd) subState.damageAdd += s.damageAdd;
      if (s.bouncy) subState.bouncy = true;
      if (s.explosive) subState.explosive = true;
    } else {
      projsToFire.push(s);
    }
  }

  // Fallback to spark if only modifiers were in payload
  if (!projsToFire.length) projsToFire.push(getSpell('spark'));

  const totalCount = Math.max(projsToFire.length, subState.multicast);
  for (let k = 0; k < totalCount; k++) {
    const s = projsToFire[k % projsToFire.length];
    const spreadAngle = (k - (totalCount - 1) / 2) * 0.22 + (rng() - 0.5) * 0.08;
    const cos = Math.cos(spreadAngle), sin = Math.sin(spreadAngle);
    const ndx = dx * cos - dy * sin;
    const ndy = dx * sin + dy * cos;
    fireProjectile(s, ndx, ndy, subState, null, x, y);
  }
}

// --- Projectiles, Explosions & Impact Physics ---
function updateProjectiles() {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life--;

    // Homing Steering Logic
    if (p.homing && p.owner === 'player') {
      let nearest = null, minDist = 130;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < minDist) {
          minDist = d;
          nearest = e;
        }
      }
      if (nearest) {
        const edx = (nearest.x - p.x) / minDist;
        const edy = (nearest.y - p.y) / minDist;
        p.vx += edx * 0.35;
        p.vy += edy * 0.35;
        const curSpd = Math.hypot(p.vx, p.vy) || 1;
        p.vx = (p.vx / curSpd) * 4.8;
        p.vy = (p.vy / curSpd) * 4.8;
      }
    }

    // Fire Trail Modifier: continuously sheds burning fire pixels!
    if (p.fireTrail && frame % 2 === 0) {
      if (getm(p.x, p.y) === MAT.AIR) {
        setm(p.x, p.y, MAT.FIRE);
      }
    }

    // Black Hole: eats all material in radius!
    if (p.blackHole) {
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          if (dx * dx + dy * dy <= 64) {
            setm(p.x + dx, p.y + dy, MAT.AIR);
          }
        }
      }
    }

    // Luminous Drill: disintegrates rock in high frequency laser line
    if (p.drill) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (SOLID_SET.has(getm(p.x + dx, p.y + dy))) {
            setm(p.x + dx, p.y + dy, MAT.AIR);
          }
        }
      }
    }

    // Position integration
    p.x += p.vx;
    p.y += p.vy;

    // Timer Trigger expiration
    if (p.timerTrigger) {
      p.timerTrigger--;
      if (p.timerTrigger <= 0) {
        executeTriggerPayload(p.payload, p.x, p.y, p.vx, p.vy);
        projectiles.splice(i, 1);
        continue;
      }
    }

    // Terrain Collision
    const hitMat = getm(p.x, p.y);
    if (SOLID_SET.has(hitMat)) {
      if (p.bouncy && p.bounceCount < 4) {
        p.bounceCount++;
        p.vx = -p.vx * 0.85;
        p.vy = -p.vy * 0.85;
        p.x += p.vx * 2;
        p.y += p.vy * 2;
        sfx.bounce();
      } else {
        // Impact!
        onProjectileImpact(p, p.x, p.y);
        projectiles.splice(i, 1);
        continue;
      }
    }

    // Player collision with enemy projectile
    if (p.owner === 'enemy') {
      if (Math.hypot(player.x - p.x, player.y - p.y) < 7) {
        damagePlayer(p.dmg, p.enemyName ? `被 ${p.enemyName} 击杀` : '被敌方法术击杀');
        projectiles.splice(i, 1);
        continue;
      }
    }

    // Enemy collision with player projectile
    if (p.owner === 'player') {
      let hitEnemy = false;
      for (const e of enemies) {
        if (e.dead) continue;
        const rad = e.type === 'boss' ? 16 : 8;
        if (Math.hypot(e.x - p.x, e.y - p.y) < rad) {
          damageEnemy(e, p.dmg);
          hitEnemy = true;
          if (!p.piercing) break;
        }
      }
      if (hitEnemy && !p.piercing) {
        onProjectileImpact(p, p.x, p.y);
        projectiles.splice(i, 1);
        continue;
      }
    }

    // Expired or out of world
    if (p.life <= 0 || p.x < 2 || p.x > W - 2 || p.y < 2 || p.y > H - 2) {
      projectiles.splice(i, 1);
    }
  }
}

function onProjectileImpact(p, x, y) {
  // Execute Trigger Payload
  if (p.trigger && p.payload) {
    executeTriggerPayload(p.payload, x, y, p.vx, p.vy);
  }

  // Teleportation Bolt
  if (p.teleport) {
    player.x = clamp(x, 14, W - 14);
    player.y = clamp(y, 14, H - 14);
    player.vx = 0;
    player.vy = 0;
    sfx.teleport();
    for (let k = 0; k < 12; k++) {
      particles.push({
        x: player.x + rint(-4, 4),
        y: player.y + rint(-6, 6),
        vx: rint(-1, 1),
        vy: rint(-1, 1),
        life: 18,
        max: 18,
        color: '#b278ff',
        kind: 'spark'
      });
    }
  }

  // Explosions
  if (p.explosive) {
    explode(x, y, p.rad || 12, p.dmg, p.type);
  } else {
    // Small spark particle puff
    for (let k = 0; k < 4; k++) {
      particles.push({
        x,
        y,
        vx: rint(-2, 2) * 0.7,
        vy: rint(-2, 2) * 0.7,
        life: 14,
        max: 14,
        color: p.color || '#fff',
        kind: 'spark'
      });
    }
  }
}

function explode(cx, cy, rad, dmg, source = 'generic') {
  addScreenShake(rad * 0.45);
  sfx.explosion(rad);

  const irad = Math.round(rad);
  // Annihilate terrain pixels in explosion radius
  for (let dy = -irad; dy <= irad; dy++) {
    for (let dx = -irad; dx <= irad; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= rad) {
        const gx = Math.round(cx + dx);
        const gy = Math.round(cy + dy);
        if (inside(gx, gy)) {
          const m = getm(gx, gy);
          // Check material durability against explosion strength
          const dura = MAT_DURABILITY[m] || 5;
          if (dura <= (rad > 16 ? 12 : 8)) {
            setm(gx, gy, d < rad * 0.4 ? MAT.AIR : (rng() < 0.25 ? MAT.FIRE : MAT.AIR));
          }
        }
      }
    }
  }

  // Expanding light flash & shockwave particle
  particles.push({
    x: cx,
    y: cy,
    rad: rad * 1.5,
    life: 14,
    max: 14,
    kind: 'boom'
  });

  // Damage enemies in blast radius
  for (const e of enemies) {
    if (e.dead) continue;
    const dist = Math.hypot(e.x - cx, e.y - cy);
    if (dist < rad + 10) {
      const falloff = 1 - (dist / (rad + 10));
      damageEnemy(e, dmg * falloff);
    }
  }

  // Damage player if in blast radius
  const pDist = Math.hypot(player.x - cx, player.y - cy);
  if (pDist < rad + 8) {
    const falloff = 1 - (pDist / (rad + 8));
    damagePlayer(dmg * falloff * 0.65, '被自己的法术爆炸炸飞');
  }

  // Detonate explosive barrels in blast radius
  for (const prop of worldProps) {
    if ((prop.type === 'barrel_explosive' || prop.type === 'barrel_acid') && !prop.exploded) {
      if (Math.hypot(prop.x - cx, prop.y - cy) < rad + 12) {
        detonateBarrel(prop);
      }
    }
  }
}

// --- Enemies & AI Archetypes (5+ Distinct Behaviors) ---
function spawnEnemy(type, x, y) {
  let hp = 30, maxHp = 30;
  if (type === 'miner') { hp = 35; maxHp = 35; }
  else if (type === 'sniper') { hp = 45; maxHp = 45; }
  else if (type === 'bat') { hp = 20; maxHp = 20; }
  else if (type === 'kamikaze') { hp = 25; maxHp = 25; }
  else if (type === 'worm') { hp = 140; maxHp = 140; }
  else if (type === 'stevari') { hp = 300; maxHp = 300; }
  else if (type === 'boss') { hp = 1200; maxHp = 1200; }

  const e = {
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    w: type === 'boss' ? 24 : (type === 'worm' ? 14 : 8),
    h: type === 'boss' ? 24 : (type === 'worm' ? 14 : 10),
    hp,
    maxHp,
    cool: rint(20, 80),
    laserAim: 0,
    dir: rng() < 0.5 ? -1 : 1,
    phase: rng() * 10,
    hitFlash: 0,
    dead: false,
    // Worm multi-segment body
    segments: type === 'worm' ? Array.from({ length: 8 }, () => ({ x, y })) : null
  };

  enemies.push(e);
  return e;
}

function damageEnemy(e, dmg) {
  if (e.dead) return;

  // Critical instinct bonus
  const isCrit = player.perks.crit && rng() < 0.25;
  const finalDmg = Math.round(dmg * (isCrit ? 2.5 : 1.0));

  e.hp -= finalDmg;
  e.hitFlash = 3;
  sfx.hit();

  // Floating damage number
  particles.push({
    x: e.x + rint(-4, 4),
    y: e.y - 6,
    text: isCrit ? `${finalDmg} 暴击!` : `${finalDmg}`,
    color: isCrit ? '#ff385c' : '#ffea54',
    life: 26,
    max: 26,
    kind: 'text'
  });

  // Splatter blood into cellular simulation!
  if (e.type !== 'boss' && e.type !== 'stevari') {
    for (let k = 0; k < 3; k++) {
      const bx = Math.round(e.x + rint(-2, 2));
      const by = Math.round(e.y + rint(-2, 2));
      if (inside(bx, by) && getm(bx, by) === MAT.AIR) {
        setm(bx, by, e.type === 'kamikaze' ? MAT.ACID : MAT.BLOOD);
      }
    }
  }

  if (e.hp <= 0) {
    killEnemy(e);
  }
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  player.kills++;
  sfx.enemyDeath();

  // Drop Gold
  const goldVal = e.type === 'boss' ? 300 : (e.type === 'stevari' ? 120 : (e.type === 'worm' ? 60 : rint(8, 25)));
  for (let k = 0; k < Math.min(6, Math.ceil(goldVal / 10)); k++) {
    pickups.push({
      type: 'gold',
      x: e.x + rint(-4, 4),
      y: e.y + rint(-4, 4),
      vx: (rng() - 0.5) * 2,
      vy: -rint(1, 3),
      val: Math.round(goldVal / Math.min(6, Math.ceil(goldVal / 10)))
    });
  }

  // Kamikaze suicide explosion on death
  if (e.type === 'kamikaze') {
    explode(e.x, e.y, 14, 35, 'acid_kamikaze');
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (getm(e.x + dx, e.y + dy) === MAT.AIR) {
          setm(e.x + dx, e.y + dy, MAT.ACID);
        }
      }
    }
  }

  // Boss defeat -> Trigger Victory!
  if (e.type === 'boss') {
    for (let k = 0; k < 30; k++) {
      particles.push({
        x: e.x + rint(-16, 16),
        y: e.y + rint(-16, 16),
        rad: 25,
        life: 40,
        max: 40,
        kind: 'boom'
      });
    }
    sfx.victory();
    setTimeout(() => {
      gameState = 'win';
      const timeSec = Math.floor((Date.now() - runStartTime) / 1000);
      $('winStats').innerHTML = `
        <div>✦ 远征时间：<b>${Math.floor(timeSec / 60)}分 ${timeSec % 60}秒</b></div>
        <div>✦ 击败生物：<b>${player.kills}</b> 个</div>
        <div>✦ 最终财富：<b>${runGold} ❂</b></div>
      `;
      $('win').classList.remove('hide');
    }, 1200);
  }
}

function updateEnemies() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) {
      enemies.splice(i, 1);
      continue;
    }

    if (e.hitFlash > 0) e.hitFlash--;
    e.cool--;

    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;

    // AI Type 1: 席西矿工 (Hiisi Miner - 近战冲锋跳跃)
    if (e.type === 'miner') {
      if (dist < 140) {
        e.vx += Math.sign(dx) * 0.16;
        e.dir = Math.sign(dx);
        // Jump over obstacles
        if (solidAtRect(e.x + e.dir * 4, e.y, e.w, e.h) && solidAtRect(e.x, e.y + 6, e.w, 2)) {
          e.vy = -3.2;
        }
      }
      e.vx *= 0.85;
      e.vy += 0.18;
      moveEntity(e, e.vx, 0, e.w, e.h);
      moveEntity(e, 0, e.vy, e.w, e.h);

      if (dist < 8) {
        damagePlayer(12, '被席西矿工斩击');
      }
    }

    // AI Type 2: 席西神射手 (Hiisi Sniper - 远程激光瞄准)
    else if (e.type === 'sniper') {
      if (dist < 180) {
        // Keep comfortable distance
        if (dist < 90) e.vx -= Math.sign(dx) * 0.12;
        else if (dist > 130) e.vx += Math.sign(dx) * 0.12;

        e.laserAim++;
        if (e.laserAim > 75 && e.cool <= 0) {
          // Fire sniper bullet!
          e.cool = 90;
          e.laserAim = 0;
          const bulletAngle = Math.atan2(dy, dx);
          projectiles.push({
            x: e.x,
            y: e.y,
            vx: Math.cos(bulletAngle) * 5.2,
            vy: Math.sin(bulletAngle) * 5.2,
            life: 140,
            dmg: 22,
            color: '#ff4262',
            owner: 'enemy',
            enemyName: '席西神射手'
          });
          sfx.cast('arrow');
        }
      } else {
        e.laserAim = 0;
      }
      e.vx *= 0.85;
      e.vy += 0.18;
      moveEntity(e, e.vx, 0, e.w, e.h);
      moveEntity(e, 0, e.vy, e.w, e.h);
    }

    // AI Type 3: 剧毒飞蝠 (Bat - 飞行与俯冲吐息)
    else if (e.type === 'bat') {
      e.x += Math.sin(frame * 0.08 + e.phase) * 0.8;
      e.y += Math.cos(frame * 0.06 + e.phase) * 0.6;
      if (dist < 120) {
        e.x += Math.sign(dx) * 0.4;
        e.y += Math.sign(dy) * 0.3;
        if (e.cool <= 0) {
          e.cool = 70;
          projectiles.push({
            x: e.x,
            y: e.y + 4,
            vx: (rng() - 0.5) * 1.2,
            vy: 2.2,
            life: 90,
            dmg: 10,
            color: '#7be329',
            owner: 'enemy',
            enemyName: '剧毒飞蝠'
          });
        }
      }
      if (dist < 8) {
        damagePlayer(8, '被剧毒飞蝠撞击');
      }
    }

    // AI Type 4: 强酸自爆虫 (Acid Kamikaze - 快速追杀自爆)
    else if (e.type === 'kamikaze') {
      if (dist < 160) {
        e.vx += Math.sign(dx) * 0.22;
        e.dir = Math.sign(dx);
        if (solidAtRect(e.x + e.dir * 4, e.y, e.w, e.h) && solidAtRect(e.x, e.y + 5, e.w, 2)) {
          e.vy = -3.4;
        }
      }
      e.vx *= 0.88;
      e.vy += 0.18;
      moveEntity(e, e.vx, 0, e.w, e.h);
      moveEntity(e, 0, e.vy, e.w, e.h);

      if (dist < 12) {
        killEnemy(e);
      }
    }

    // AI Type 5: 深渊巨蠕虫 (Giant Cave Worm - 实时潜地钻碎岩石)
    else if (e.type === 'worm') {
      // Steer head toward player
      const wormSpd = 1.8;
      e.vx += (dx / dist) * 0.08;
      e.vy += (dy / dist) * 0.08;
      const curV = Math.hypot(e.vx, e.vy) || 1;
      e.vx = (e.vx / curV) * wormSpd;
      e.vy = (e.vy / curV) * wormSpd;
      e.x += e.vx;
      e.y += e.vy;

      // Real-time terrain excavation! Destroys solid cells in head radius
      for (let wy = -6; wy <= 6; wy++) {
        for (let wx = -6; wx <= 6; wx++) {
          if (wx * wx + wy * wy <= 36) {
            const rx = Math.round(e.x + wx);
            const ry = Math.round(e.y + wy);
            if (inside(rx, ry) && SOLID_SET.has(getm(rx, ry))) {
              setm(rx, ry, MAT.AIR);
            }
          }
        }
      }

      // Earth rumbling screen shake when worm is close
      if (dist < 100) {
        addScreenShake(0.8);
      }

      // Follower segments chain
      let prevX = e.x, prevY = e.y;
      for (let s = 0; s < e.segments.length; s++) {
        const seg = e.segments[s];
        const sdx = prevX - seg.x;
        const sdy = prevY - seg.y;
        const sdist = Math.hypot(sdx, sdy) || 1;
        if (sdist > 6) {
          seg.x += (sdx / sdist) * (sdist - 6);
          seg.y += (sdy / sdist) * (sdist - 6);
        }
        prevX = seg.x;
        prevY = seg.y;
      }

      if (dist < 14) {
        damagePlayer(25, '被深渊巨蠕虫碾压');
      }
    }

    // AI Type 6: 圣山守卫 (Stevari - 骨骸法师)
    else if (e.type === 'stevari') {
      // Float towards player
      e.x += Math.sign(dx) * 0.6;
      e.y += (Math.sin(frame * 0.05) * 0.4) + Math.sign(dy) * 0.4;
      if (e.cool <= 0 && dist < 200) {
        e.cool = 65;
        const a = Math.atan2(dy, dx);
        projectiles.push({
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 3.2,
          vy: Math.sin(a) * 3.2,
          life: 160,
          dmg: 28,
          rad: 14,
          explosive: true,
          color: '#d488ff',
          owner: 'enemy',
          enemyName: '圣山守卫 (Stevari)'
        });
        sfx.cast('energy_orb');
      }
      if (dist < 12) {
        damagePlayer(15, '圣山守护者能量震波');
      }
    }

    // AI Type 7: 终焉之眼 (Kolmisilmä / Final Boss)
    else if (e.type === 'boss') {
      e.vx += (Math.sign(dx) * 0.05 + Math.sin(frame * 0.03) * 0.04);
      e.vy += (Math.sign(dy) * 0.05 + Math.cos(frame * 0.025) * 0.04);
      e.vx = clamp(e.vx, -0.9, 0.9);
      e.vy = clamp(e.vy, -0.6, 0.6);
      e.x = clamp(e.x + e.vx, 30, W - 30);
      e.y = clamp(e.y + e.vy, H - 140, H - 30);

      // Multi-phase attack barrage
      if (e.cool <= 0 && dist < 260) {
        e.cool = 48;
        const baseA = Math.atan2(dy, dx);
        for (let q = -1; q <= 1; q++) {
          const ba = baseA + q * 0.22;
          projectiles.push({
            x: e.x,
            y: e.y,
            vx: Math.cos(ba) * 2.6,
            vy: Math.sin(ba) * 2.6,
            life: 160,
            dmg: 20,
            rad: 12,
            explosive: true,
            color: '#f74fa8',
            owner: 'enemy',
            enemyName: '终焉之眼'
          });
        }
        sfx.cast('fireball');
      }
      if (dist < 20) {
        damagePlayer(30, '被终焉之眼直接吞噬');
      }
    }
  }
}

function angerTheGods() {
  godsAngered = true;
  addScreenShake(8);
  showToast('✦ 你激怒了神明... ✦', true);
  sfx.godsAngered();

  // Spawn Stevari in Holy Mountain
  if (!stevariSpawned) {
    stevariSpawned = true;
    stevari = spawnEnemy('stevari', clamp(player.x + 60, 40, W - 40), player.y - 20);
  }
}

// --- Interactive Props & Pickups ---
function detonateBarrel(barrel) {
  barrel.exploded = true;
  if (barrel.type === 'barrel_explosive') {
    explode(barrel.x, barrel.y, 22, 60, 'barrel');
  } else {
    // Acid barrel flood!
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        if (dx * dx + dy * dy <= 25) {
          const rx = Math.round(barrel.x + dx);
          const ry = Math.round(barrel.y + dy);
          if (inside(rx, ry) && getm(rx, ry) === MAT.AIR) {
            setm(rx, ry, MAT.ACID);
          }
        }
      }
    }
    sfx.explosion(14);
  }
}

function updatePropsAndPickups() {
  // 1. Pickups (Gold nuggets & items)
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.vy += 0.12;
    p.x += p.vx;
    p.y += p.vy;

    // Bounce on solid ground
    if (SOLID_SET.has(getm(p.x, p.y))) {
      p.vy = -p.vy * 0.35;
      p.vx *= 0.75;
      p.y -= 0.5;
    }

    // Gold Magnet perk: pull gold across screen
    if (player.perks.magnet && p.type === 'gold') {
      const gdx = player.x - p.x;
      const gdy = player.y - p.y;
      const gdist = Math.hypot(gdx, gdy);
      if (gdist < 120) {
        p.vx += (gdx / gdist) * 0.45;
        p.vy += (gdy / gdist) * 0.45;
      }
    }

    // Collection by player
    if (Math.hypot(player.x - p.x, player.y - p.y) < 12) {
      if (p.type === 'gold') {
        runGold += p.val;
        sfx.gold();
        particles.push({
          x: p.x,
          y: p.y - 4,
          text: `+${p.val} ❂`,
          color: '#ffe566',
          life: 20,
          max: 20,
          kind: 'text'
        });
      }
      pickups.splice(i, 1);
    }
  }

  // 2. World Props & Holy Mountain Altar Check
  for (const prop of worldProps) {
    if (prop.type === 'heart' && !prop.used) {
      if (Math.hypot(player.x - prop.x, player.y - prop.y) < 14) {
        prop.used = true;
        player.maxHp += 10;
        player.hp = player.maxHp;
        showToast('✦ 全生命值恢复！生命上限 +10 ✦');
        sfx.perk();
      }
    } else if (prop.type === 'refresher' && !prop.used) {
      if (Math.hypot(player.x - prop.x, player.y - prop.y) < 14) {
        prop.used = true;
        for (const w of wands) w.mana = w.manaMax;
        showToast('✦ 魔力充能完毕 ✦');
        sfx.perk();
      }
    } else if (prop.type === 'altar') {
      if (!holyVisited.has(prop.holyIndex) && Math.hypot(player.x - (prop.x + 19), player.y - prop.y) < 26) {
        holyVisited.add(prop.holyIndex);
        offerPerks();
      }
    } else if (prop.type === 'shop_wand' && !prop.bought) {
      if (Math.hypot(player.x - prop.x, player.y - prop.y) < 16) {
        if (keys.f || keys.F) {
          keys.f = false; keys.F = false;
          if (runGold >= prop.cost) {
            runGold -= prop.cost;
            prop.bought = true;
            wands[currentWand] = prop.wand;
            showToast(`购买魔杖：${prop.wand.name}`);
            sfx.gold();
            updateHud();
          } else {
            showToast('黄金不足！', true);
          }
        }
      }
    } else if (prop.type === 'chest' && !prop.opened) {
      if (Math.hypot(player.x - prop.x, player.y - prop.y) < 16) {
        if (keys.f || keys.F) {
          keys.f = false; keys.F = false;
          prop.opened = true;
          // Eject rewards
          for (let k = 0; k < 4; k++) {
            pickups.push({
              type: 'gold',
              x: prop.x + rint(-2, 2),
              y: prop.y - 4,
              vx: (rng() - 0.5) * 2,
              vy: -rint(1, 3),
              val: rint(15, 30)
            });
          }
          spellPouch.push(getRandomSpellId());
          showToast('开启宝箱：获得金币与新法术！');
          sfx.gold();
        }
      }
    }
  }
}

function getRandomSpellId() {
  const ids = Object.keys(SPELLS);
  return ids[rint(0, ids.length - 1)];
}

// --- Screen Shake & Floating Particles ---
function addScreenShake(amt) {
  screenShake = Math.min(10, screenShake + amt);
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life--;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    if (p.vx !== undefined) p.x += p.vx;
    if (p.vy !== undefined) p.y += p.vy;
  }
}

function renderParticles() {
  const camY = Math.floor(cameraY);
  for (const p of particles) {
    const sy = p.y - camY;
    if (sy < -20 || sy > VH + 20) continue;

    if (p.kind === 'spark' || p.kind === 'blood') {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x | 0, sy | 0, 2, 2);
    } else if (p.kind === 'boom') {
      const progress = 1 - (p.life / p.max);
      const curRad = p.rad * progress;
      ctx.save();
      ctx.globalAlpha = p.life / p.max;
      ctx.strokeStyle = '#ffb338';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, sy, curRad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'text') {
      ctx.save();
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = p.color;
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 3;
      ctx.fillText(p.text, p.x - 10, sy);
      ctx.restore();
    }
  }
}

// --- Render Entities, Enemies, Player & Props ---
function renderEntities() {
  const camY = Math.floor(cameraY);

  // 1. World Props (Torches, Altars, Hearts, Barrels, Chests)
  for (const p of worldProps) {
    const sy = p.y - camY;
    if (sy < -20 || sy > VH + 20) continue;

    if (p.type === 'torch') {
      ctx.fillStyle = '#6b4f35';
      ctx.fillRect(p.x - 1, sy, 2, 6);
      ctx.fillStyle = '#ffaa33';
      ctx.fillRect(p.x - 2, sy - 3, 4, 4);
    } else if (p.type === 'heart' && !p.used) {
      ctx.fillStyle = '#ff3355';
      ctx.fillRect(p.x - 4, sy - 4, 8, 8);
      ctx.fillStyle = '#ff8899';
      ctx.fillRect(p.x - 2, sy - 5, 4, 2);
    } else if (p.type === 'refresher' && !p.used) {
      ctx.fillStyle = '#44bbee';
      ctx.fillRect(p.x - 3, sy - 3, 6, 6);
    } else if (p.type === 'altar') {
      ctx.fillStyle = '#4a3d60';
      ctx.fillRect(p.x, sy, p.w, p.h);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(p.x + 4, sy + 2, p.w - 8, 2);
    } else if (p.type === 'shop_wand' && !p.bought) {
      ctx.fillStyle = '#554466';
      ctx.fillRect(p.x - 6, sy + 2, 12, 4);
      ctx.fillStyle = '#f5cf62';
      ctx.fillRect(p.x - 2, sy - 4, 4, 6);
    } else if (p.type === 'chest') {
      ctx.fillStyle = p.opened ? '#523a28' : '#7d5738';
      ctx.fillRect(p.x - 5, sy - 4, 10, 8);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(p.x - 1, sy - 2, 2, 3);
    } else if ((p.type === 'barrel_explosive' || p.type === 'barrel_acid') && !p.exploded) {
      ctx.fillStyle = p.type === 'barrel_explosive' ? '#c4332b' : '#3db83b';
      ctx.fillRect(p.x - 4, sy - 6, 8, 10);
      ctx.fillStyle = '#f5cf62';
      ctx.fillRect(p.x - 4, sy - 2, 8, 2);
    }
  }

  // 2. Pickups (Gold nuggets)
  for (const p of pickups) {
    const sy = p.y - camY;
    if (sy < -10 || sy > VH + 10) continue;
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(p.x - 1.5, sy - 1.5, 3, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(p.x - 0.5, sy - 2, 1, 1);
  }

  // 3. Enemies
  for (const e of enemies) {
    const sy = e.y - camY;
    if (sy < -30 || sy > VH + 30) continue;

    ctx.save();
    ctx.translate(Math.round(e.x), Math.round(sy));

    // Hit flash overlay
    if (e.hitFlash > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-e.w * 0.5, -e.h * 0.5, e.w, e.h);
      ctx.restore();
      continue;
    }

    if (e.type === 'miner') {
      // Goblin miner
      ctx.fillStyle = '#447d48';
      ctx.fillRect(-3, -5, 6, 10);
      ctx.fillStyle = '#223824';
      ctx.fillRect(-2, -6, 4, 3); // hood
      ctx.fillStyle = '#ffea54';
      ctx.fillRect(e.dir > 0 ? 0 : -2, -4, 2, 2); // eye
      // Pickaxe
      ctx.fillStyle = '#8b6f47';
      ctx.fillRect(e.dir > 0 ? 2 : -4, -1, 3, 6);
    } else if (e.type === 'sniper') {
      // Hiisi rifleman
      ctx.fillStyle = '#3a4a60';
      ctx.fillRect(-3, -5, 6, 10);
      ctx.fillStyle = '#88a0b8';
      ctx.fillRect(e.dir > 0 ? 1 : -7, -2, 6, 2); // rifle
      ctx.fillStyle = '#4de0e8';
      ctx.fillRect(e.dir > 0 ? 0 : -2, -4, 2, 2); // visor

      // Red laser aim telegraph!
      if (e.laserAim > 20) {
        ctx.strokeStyle = `rgba(255, 40, 40, ${Math.min(1.0, e.laserAim / 75)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -1);
        ctx.lineTo(player.x - e.x, (player.y - camY) - sy);
        ctx.stroke();
      }
    } else if (e.type === 'bat') {
      // Wing flapping animation
      const wingY = Math.sin(frame * 0.3) * 3;
      ctx.fillStyle = '#4a2542';
      ctx.fillRect(-3, -2, 6, 4);
      ctx.fillStyle = '#7a3b68';
      ctx.fillRect(-7, -2 + wingY, 4, 3);
      ctx.fillRect(3, -2 + wingY, 4, 3);
      ctx.fillStyle = '#ff2b55';
      ctx.fillRect(-1, -1, 2, 1);
    } else if (e.type === 'kamikaze') {
      // Bulbous acid crawler
      ctx.fillStyle = '#72cf2b';
      ctx.beginPath();
      ctx.arc(0, -1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff3344';
      ctx.fillRect(-1, -2, 2, 2);
    } else if (e.type === 'worm') {
      // Segmented giant worm
      ctx.fillStyle = '#8a402e';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(-2, -3, 4, 3); // teeth/eyes
      if (e.segments) {
        for (let s = 0; s < e.segments.length; s++) {
          const seg = e.segments[s];
          const segSY = seg.y - camY;
          ctx.fillStyle = s % 2 === 0 ? '#7a3525' : '#9c4834';
          ctx.beginPath();
          ctx.arc(seg.x - e.x, segSY - sy, 5 - (s * 0.35), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (e.type === 'stevari') {
      // Sacred Bone Mage with energy shield
      ctx.fillStyle = '#e8ded0';
      ctx.fillRect(-4, -7, 8, 14);
      ctx.fillStyle = '#8833cc';
      ctx.fillRect(-3, -9, 6, 4); // cowl
      ctx.fillStyle = '#00f7ff';
      ctx.fillRect(-1, -5, 2, 2);
      // Ethereal shield
      ctx.strokeStyle = '#a652ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'boss') {
      // Massive Kolmisilmä Boss
      ctx.fillStyle = '#5c1e54';
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fill();
      // Three Fiery Eyes
      ctx.fillStyle = '#ffea33';
      ctx.fillRect(-6, -4, 4, 4);
      ctx.fillRect(2, -4, 4, 4);
      ctx.fillRect(-2, 3, 4, 4);
      // Rotating shields
      for (let s = 0; s < 3; s++) {
        const sa = frame * 0.04 + (s * (Math.PI * 2 / 3));
        const sx = Math.cos(sa) * 22;
        const sy2 = Math.sin(sa) * 22;
        ctx.fillStyle = '#d44fff';
        ctx.fillRect(sx - 3, sy2 - 3, 6, 6);
      }
    }

    ctx.restore();

    // Health bar above enemy
    if (e.hp < e.maxHp) {
      const barW = e.type === 'boss' ? 32 : 12;
      ctx.fillStyle = '#141724';
      ctx.fillRect(e.x - barW * 0.5, sy - (e.h * 0.5 + 4), barW, 2);
      ctx.fillStyle = '#e04855';
      ctx.fillRect(e.x - barW * 0.5, sy - (e.h * 0.5 + 4), barW * (e.hp / e.maxHp), 2);
    }
  }

  // 4. Projectiles
  for (const p of projectiles) {
    const sy = p.y - camY;
    if (sy < -10 || sy > VH + 10) continue;
    ctx.fillStyle = p.color || '#fff';
    ctx.fillRect(p.x - 1, sy - 1, 3, 3);
  }

  // 5. Player Character Sprite
  if (!player.dead) {
    const sy = player.y - camY;
    ctx.save();
    ctx.translate(Math.round(player.x), Math.round(sy));

    if (player.inv > 0 && player.inv % 4 < 2) {
      ctx.globalAlpha = 0.5;
    }

    if (player.hitFlash > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-3, -5, 6, 10);
    } else {
      // Robe body
      ctx.fillStyle = '#4a578c';
      ctx.fillRect(-3, -3, 6, 8);
      // Robe flutter
      if (player.vx !== 0) {
        ctx.fillRect(-player.dir * 4, 3, 2, 2);
      }
      // Hood
      ctx.fillStyle = '#2d3761';
      ctx.fillRect(-3, -6, 6, 4);
      // Glowing Eyes under hood
      ctx.fillStyle = '#6ef0ff';
      ctx.fillRect(player.dir > 0 ? 0 : -2, -4, 2, 1);

      // Rotating Wand in hand
      const wandLen = 7;
      const wx = Math.cos(player.aimAngle) * wandLen;
      const wy = Math.sin(player.aimAngle) * wandLen;
      ctx.strokeStyle = '#cfa756';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(player.dir > 0 ? 1 : -1, 0);
      ctx.lineTo(wx, wy);
      ctx.stroke();
    }

    ctx.restore();
  }
}

// --- Perks System (永久天赋) ---
const PERK_DEFS = [
  {
    name: '火焰免疫 (Fire Immunity)',
    desc: '彻底免疫火焰与炽热熔岩的灼烧伤害。',
    icon: '🔥',
    apply: () => { player.perks.fireImmunity = true; }
  },
  {
    name: '剧毒免疫 (Toxic Immunity)',
    desc: '彻底免疫剧毒泥浆与强酸的腐蚀伤害。',
    icon: '🧪',
    apply: () => { player.perks.toxicImmunity = true; }
  },
  {
    name: '随处编辑魔杖 (Tinker Everywhere)',
    desc: '即使离开圣山，也能在任何地方随时按 E 组装魔杖！',
    icon: '⚙️',
    apply: () => { player.perks.tinkerEverywhere = true; }
  },
  {
    name: '玻璃大炮 (Glass Cannon)',
    desc: '所有法术伤害与爆炸范围提升 250%，但生命上限固定为 50。',
    icon: '💥',
    apply: () => {
      player.perks.glassCannon = true;
      player.maxHp = 50;
      player.hp = Math.min(player.hp, 50);
    }
  },
  {
    name: '强效悬浮 (Strong Levitation)',
    desc: '悬浮能量上限增加 100%，且充能回复速度翻倍。',
    icon: '🪶',
    apply: () => {
      player.perks.flight = true;
      player.maxHover = 200;
      player.hover = 200;
    }
  },
  {
    name: '暴击直觉 (Critical Strike)',
    desc: '法术击中敌人时有 25% 概率造成 2.5 倍暴击伤害！',
    icon: '🎯',
    apply: () => { player.perks.crit = true; }
  },
  {
    name: '黄金磁铁 (Gold Magnet)',
    desc: '散落在地面上的黄金碎屑会被你隔空强力吸引。',
    icon: '🧲',
    apply: () => { player.perks.magnet = true; }
  },
  {
    name: '力场护盾 (Energy Shield)',
    desc: '降低受到的所有伤害 40%。',
    icon: '🛡️',
    apply: () => { player.perks.shield = true; }
  }
];

function offerPerks() {
  const pool = [...PERK_DEFS];
  perkChoices = [];
  while (perkChoices.length < 3 && pool.length) {
    const idx = rint(0, pool.length - 1);
    perkChoices.push(pool.splice(idx, 1)[0]);
  }
  renderPerkUI();
}

function renderPerkUI() {
  $('perkGrid').innerHTML = perkChoices.map((p, i) => `
    <button class="perk" data-perk="${i}">
      <div class="perk-icon">${p.icon}</div>
      <b>${i + 1}. ${p.name}</b>
      <small>${p.desc}</small>
    </button>
  `).join('');
  $('perkPanel').classList.remove('hide');
  sfx.perk();
}

function selectPerk(idx) {
  const p = perkChoices[idx];
  if (!p) return;
  p.apply();
  showToast(`获得天赋：${p.name}`);
  perkChoices = [];
  $('perkPanel').classList.add('hide');
  sfx.perk();
  updateHud();
}

// --- Wand & Spell Workshop Modal UI (魔杖组装台) ---
function openWandWorkshop() {
  editMode = true;
  activeWorkshopWand = currentWand;
  selectedSlot = null;
  renderWorkshopTabs();
  renderActiveWandSpecs();
  renderWandSlots();
  renderPouchSlots();
  $('wandPanel').classList.remove('hide');
}

function closeWandWorkshop() {
  editMode = false;
  selectedSlot = null;
  $('wandPanel').classList.add('hide');
  updateHud();
}

function renderWorkshopTabs() {
  $('wandTabs').innerHTML = wands.map((w, i) => `
    <div class="wand-tab ${i === activeWorkshopWand ? 'active' : ''}" data-tab="${i}">
      <div class="wand-tab-title">
        <span>${i + 1}. ${w.name}</span>
        <span>${w.slots.length}/${w.capacity}</span>
      </div>
      <div class="wand-tab-sub">
        ${w.shuffle ? '乱序: 是' : '顺序: 否'} · 蓝 ${Math.floor(w.mana)}/${w.manaMax}
      </div>
    </div>
  `).join('');
}

function renderActiveWandSpecs() {
  const w = wands[activeWorkshopWand];
  $('wandSpecs').innerHTML = `
    <div class="spec-item"><span>乱序 (Shuffle):</span><b>${w.shuffle ? '是 (YES)' : '否 (NO)'}</b></div>
    <div class="spec-item"><span>施法数 (Spells/Cast):</span><b>${w.spellsPerCast}</b></div>
    <div class="spec-item"><span>施法延迟 (Cast Delay):</span><b>${w.castDelay.toFixed(2)}s</b></div>
    <div class="spec-item"><span>充能时间 (Recharge):</span><b>${w.recharge.toFixed(2)}s</b></div>
    <div class="spec-item"><span>魔力上限 (Mana Max):</span><b>${w.manaMax}</b></div>
    <div class="spec-item"><span>回复速度 (Mana Chg):</span><b>${w.manaCharge}/s</b></div>
    <div class="spec-item"><span>卡槽容量 (Capacity):</span><b>${w.capacity}</b></div>
  `;
}

function renderWandSlots() {
  const w = wands[activeWorkshopWand];
  let html = '';
  for (let i = 0; i < w.capacity; i++) {
    const spellId = w.slots[i];
    const isSelected = selectedSlot && selectedSlot.type === 'wand' && selectedSlot.wi === activeWorkshopWand && selectedSlot.si === i;
    if (spellId) {
      const s = getSpell(spellId);
      html += `
        <div class="spell-slot-cell occupied ${isSelected ? 'selected' : ''}" data-type="${s.type}" data-w="${activeWorkshopWand}" data-s="${i}">
          <div class="spell-card-inner">
            <span class="spell-icon">${s.icon}</span>
            <span class="spell-name">${s.name}</span>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="spell-slot-cell empty ${isSelected ? 'selected' : ''}" data-w="${activeWorkshopWand}" data-s="${i}">
          <span style="color:#333c56;font-size:10px;">${i + 1}</span>
        </div>
      `;
    }
  }
  $('wandSlotsGrid').innerHTML = html;
}

function renderPouchSlots() {
  $('pouchGrid').innerHTML = spellPouch.map((spellId, i) => {
    const s = getSpell(spellId);
    const isSelected = selectedSlot && selectedSlot.type === 'pouch' && selectedSlot.si === i;
    return `
      <div class="spell-slot-cell occupied ${isSelected ? 'selected' : ''}" data-type="${s.type}" data-pouch="${i}">
        <div class="spell-card-inner">
          <span class="spell-icon">${s.icon}</span>
          <span class="spell-name">${s.name}</span>
        </div>
      </div>
    `;
  }).join('');
}

function inspectSpell(s) {
  $('inspectTitle').textContent = `${s.name} 【${s.type === 'projectile' ? '弹体' : (s.type === 'trigger' ? '触发' : '修饰')}】`;
  $('inspectDesc').textContent = s.desc;
  $('inspectStats').innerHTML = `
    <span>耗蓝: <b>${s.cost}</b></span>
    ${s.dmg ? `<span>基础伤害: <b>${s.dmg}</b></span>` : ''}
    ${s.speed ? `<span>弹速: <b>${s.speed}</b></span>` : ''}
    <span>延迟修正: <b>${s.delay > 0 ? '+' : ''}${s.delay.toFixed(2)}s</b></span>
  `;
}

// Click and Swap handler for wand workshop
function handleWorkshopClick(e) {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    activeWorkshopWand = +tab.dataset.tab;
    selectedSlot = null;
    renderWorkshopTabs();
    renderActiveWandSpecs();
    renderWandSlots();
    return;
  }

  const slot = e.target.closest('.spell-slot-cell');
  if (slot) {
    if (slot.dataset.w !== undefined) {
      // Wand slot clicked
      const wi = +slot.dataset.w;
      const si = +slot.dataset.s;
      const targetSpell = wands[wi].slots[si];
      if (targetSpell) inspectSpell(getSpell(targetSpell));

      if (!selectedSlot) {
        // First selection
        if (targetSpell) {
          selectedSlot = { type: 'wand', wi, si };
          renderWandSlots();
          renderPouchSlots();
        }
      } else {
        // Second selection -> Perform Swap/Move
        if (selectedSlot.type === 'wand') {
          // Wand to Wand
          const temp = wands[selectedSlot.wi].slots[selectedSlot.si];
          wands[selectedSlot.wi].slots[selectedSlot.si] = wands[wi].slots[si];
          wands[wi].slots[si] = temp;
          // Clean up undefined slots
          wands[selectedSlot.wi].slots = wands[selectedSlot.wi].slots.filter(Boolean);
          wands[wi].slots = wands[wi].slots.filter(Boolean);
        } else if (selectedSlot.type === 'pouch') {
          // Pouch to Wand
          const pouchSpell = spellPouch[selectedSlot.si];
          const oldWandSpell = wands[wi].slots[si];
          if (oldWandSpell) {
            spellPouch[selectedSlot.si] = oldWandSpell;
            wands[wi].slots[si] = pouchSpell;
          } else {
            spellPouch.splice(selectedSlot.si, 1);
            wands[wi].slots[si] = pouchSpell;
          }
        }
        selectedSlot = null;
        renderWandSlots();
        renderPouchSlots();
        sfx.cardSwap();
      }
    } else if (slot.dataset.pouch !== undefined) {
      // Pouch slot clicked
      const pi = +slot.dataset.pouch;
      const pSpell = spellPouch[pi];
      if (pSpell) inspectSpell(getSpell(pSpell));

      if (!selectedSlot) {
        selectedSlot = { type: 'pouch', si: pi };
        renderWandSlots();
        renderPouchSlots();
      } else {
        if (selectedSlot.type === 'wand') {
          // Wand to Pouch swap
          const wandSpell = wands[selectedSlot.wi].slots[selectedSlot.si];
          wands[selectedSlot.wi].slots.splice(selectedSlot.si, 1);
          spellPouch.push(wandSpell);
        } else if (selectedSlot.type === 'pouch') {
          // Pouch to Pouch
          const temp = spellPouch[selectedSlot.si];
          spellPouch[selectedSlot.si] = spellPouch[pi];
          spellPouch[pi] = temp;
        }
        selectedSlot = null;
        renderWandSlots();
        renderPouchSlots();
        sfx.cardSwap();
      }
    }
  }

  if (e.target.id === 'addSpellBtn') {
    spellPouch.push(getRandomSpellId());
    renderPouchSlots();
    sfx.cardSwap();
  }
}

// --- HUD & Toast Notifications ---
function updateHud() {
  if (!player) return;

  const curWand = wands[currentWand];
  const hpPct = clamp(player.hp / player.maxHp, 0, 1);
  const manaPct = clamp(curWand.mana / curWand.manaMax, 0, 1);
  const hoverPct = clamp(player.hover / player.maxHover, 0, 1);
  const oxyPct = clamp(player.oxygen / player.maxOxygen, 0, 1);

  $('hpFill').style.width = `${hpPct * 100}%`;
  $('hpText').textContent = `${Math.max(0, Math.ceil(player.hp))}/${player.maxHp}`;
  $('manaFill').style.width = `${manaPct * 100}%`;
  $('manaText').textContent = `${Math.floor(curWand.mana)}`;
  $('hoverFill').style.width = `${hoverPct * 100}%`;
  $('breathFill').style.width = `${oxyPct * 100}%`;

  const biome = getBiomeAt(player.y);
  $('biome').textContent = biome.name;
  runDepth = Math.max(runDepth, player.y);
  $('depth').textContent = `${Math.floor(runDepth)}m`;
  $('gold').textContent = `${runGold} ❂`;

  // Status effect badges
  let statusHtml = '';
  if (player.fire > 0) statusHtml += '<span class="status-badge fire">燃！</span>';
  if (player.wet > 0) statusHtml += '<span class="status-badge wet">湿润</span>';
  if (player.bloody > 0) statusHtml += '<span class="status-badge blood">染血</span>';
  if (player.poison > 0) statusHtml += '<span class="status-badge poison">中毒</span>';
  $('statusCluster').innerHTML = statusHtml;

  // Wand Chips
  $('wandHud').innerHTML = wands.map((w, i) => `
    <div class="wand-chip ${i === currentWand ? 'active' : ''}" data-wand="${i}">
      <div class="wand-chip-header">
        <b>${i + 1} · ${w.name}</b>
      </div>
      <div class="wand-chip-stats">
        <span>${w.rechargeTimer > 0 ? '充能中...' : '就绪'}</span>
        <span>${Math.floor(w.mana)}/${w.manaMax}</span>
      </div>
      <div class="slotdots">
        ${w.slots.map(id => {
          const s = getSpell(id);
          const cls = s.type === 'trigger' ? 'trigger' : (s.type === 'mod' ? 'mod' : 'on');
          return `<s class="${cls}" title="${s.name}"></s>`;
        }).join('')}
      </div>
    </div>
  `).join('');
}

function showToast(text, danger = false) {
  const el = $('toast');
  el.textContent = text;
  el.className = danger ? 'danger' : '';
  el.style.opacity = '1';
  toastTimer = 110;
}

function tickToast() {
  if (toastTimer > 0) {
    toastTimer--;
    if (toastTimer <= 0) $('toast').style.opacity = '0';
  }
}

// --- Procedural Sound Synthesizer (Web Audio API) ---
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

const sfx = {
  cast(type) {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'spark') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
        gain.gain.setValueAtTime(0.04, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.start(t);
        osc.stop(t + 0.08);
      } else if (type === 'arrow') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(300, t + 0.12);
        gain.gain.setValueAtTime(0.03, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t);
        osc.stop(t + 0.12);
      } else if (type === 'fireball') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(350, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.2);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
      } else if (type === 'drill') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(450, t);
        gain.gain.setValueAtTime(0.02, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.start(t);
        osc.stop(t + 0.05);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.1);
        gain.gain.setValueAtTime(0.03, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
      }
    } catch (e) {}
  },

  explosion(rad = 14) {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(90 + rad * 2, t);
      osc.frequency.exponentialRampToValueAtTime(20, t + 0.35);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    } catch (e) {}
  },

  hit() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.06);
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } catch (e) {}
  },

  playerHurt() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(50, t + 0.14);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    } catch (e) {}
  },

  playerDead() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.linearRampToValueAtTime(30, t + 0.8);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.8);
    } catch (e) {}
  },

  enemyDeath() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.1);
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    } catch (e) {}
  },

  gold() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987, t); // B5
      osc.frequency.setValueAtTime(1318, t + 0.05); // E6
      gain.gain.setValueAtTime(0.03, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    } catch (e) {}
  },

  perk() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, t); // C5
      osc.frequency.setValueAtTime(659, t + 0.08); // E5
      osc.frequency.setValueAtTime(784, t + 0.16); // G5
      osc.frequency.setValueAtTime(1046, t + 0.24); // C6
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    } catch (e) {}
  },

  godsAngered() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(65, t);
      osc.frequency.setValueAtTime(58, t + 0.3);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 1.2);
    } catch (e) {}
  },

  steamHiss() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1400, t);
      gain.gain.setValueAtTime(0.015, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch (e) {}
  },

  acidSizzle() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(950, t);
      gain.gain.setValueAtTime(0.015, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    } catch (e) {}
  },

  jump() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.08);
      gain.gain.setValueAtTime(0.02, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.08);
    } catch (e) {}
  },

  teleport() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.linearRampToValueAtTime(900, t + 0.15);
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (e) {}
  },

  bounce() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      gain.gain.setValueAtTime(0.02, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    } catch (e) {}
  },

  manaEmpty() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t);
      gain.gain.setValueAtTime(0.02, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    } catch (e) {}
  },

  cardSwap() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, t);
      gain.gain.setValueAtTime(0.02, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.03);
    } catch (e) {}
  },

  victory() {
    if (!audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const notes = [523, 659, 784, 1046, 1318];
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        gain.gain.setValueAtTime(0.04, t + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.5);
      });
    } catch (e) {}
  }
};

// --- Game Master Loop & Camera ---
function startGame() {
  initAudio();
  seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  rng = makeRng(seed);

  setupInitialWands();
  generateWorld();

  gameState = 'play';
  $('title').classList.add('hide');
  $('dead').classList.add('hide');
  $('win').classList.add('hide');
  $('wandPanel').classList.add('hide');
  $('perkPanel').classList.add('hide');

  updateHud();
  showToast(`远征开始 · 世界种子 ${seed}`);
}

function updateGame() {
  if (gameState !== 'play') return;
  frame++;

  // Camera tracking smoothly with screen shake
  const targetCamY = clamp(player.y - VH * 0.5, 0, H - VH);
  cameraY += (targetCamY - cameraY) * 0.1;

  // Screen shake decay
  if (screenShake > 0) {
    const shakeOffsetX = (rng() - 0.5) * screenShake * 1.5;
    const shakeOffsetY = (rng() - 0.5) * screenShake * 1.5;
    canvas.style.transform = `translate(${shakeOffsetX.toFixed(1)}px, ${shakeOffsetY.toFixed(1)}px)`;
    screenShake *= 0.88;
    if (screenShake < 0.1) {
      screenShake = 0;
      canvas.style.transform = 'none';
    }
  }

  updatePlayer();
  updateCellularAutomata();
  updateProjectiles();
  updateEnemies();
  updatePropsAndPickups();
  updateParticles();

  if (frame % 4 === 0) {
    updateHud();
  }
}

function renderGame() {
  if (!world) {
    ctx.fillStyle = '#05060b';
    ctx.fillRect(0, 0, VW, VH);
    return;
  }

  // 1. Blit simulated material pixels & background
  renderWorldBuffer();

  // 2. Render interactive props, particles & entities
  renderEntities();
  renderParticles();

  // 3. Render Dynamic Darkness & Radial Lighting
  renderLightingPass();
}

function gameLoop() {
  updateGame();
  renderGame();
  tickToast();
  requestAnimationFrame(gameLoop);
}

// --- Event Listeners & Controls ---
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'd', 'w', 's'].includes(e.key)) {
    e.preventDefault();
  }

  // Quick switch wands 1 - 4
  if (e.key === '1') { currentWand = 0; updateHud(); }
  if (e.key === '2') { currentWand = 1; updateHud(); }
  if (e.key === '3') { currentWand = 2; updateHud(); }
  if (e.key === '4') { currentWand = 3; updateHud(); }

  // Perk Altar selection keys 1, 2, 3
  if (perkChoices.length && ['1', '2', '3'].includes(e.key)) {
    selectPerk(+e.key - 1);
  }

  // Kick action (V key)
  if (e.key === 'v' || e.key === 'V') {
    for (const prop of worldProps) {
      if ((prop.type === 'barrel_explosive' || prop.type === 'barrel_acid') && !prop.exploded) {
        if (Math.hypot(prop.x - player.x, prop.y - player.y) < 18) {
          prop.x += player.dir * 14;
          sfx.hit();
        }
      }
    }
  }

  // Open Wand Workshop (E key)
  if (e.key === 'e' || e.key === 'E') {
    if (gameState === 'play') {
      const isInsideHoly = holyMountainList.some(h => player.y >= h.y0 && player.y < h.y1);
      if (isInsideHoly || player.perks.tinkerEverywhere) {
        if (editMode) closeWandWorkshop();
        else openWandWorkshop();
      } else {
        showToast('只有在圣山中（或拥有天赋）才能组装魔杖！', true);
      }
    }
  }

  if (e.key === 'Escape') {
    if (editMode) closeWandWorkshop();
  }
});

window.addEventListener('keyup', e => {
  keys[e.key] = false;
});

// Canvas Mouse Pointer
canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  pointer.x = clamp((e.clientX - r.left) / r.width * VW, 0, VW);
  pointer.y = clamp((e.clientY - r.top) / r.height * VH, 0, VH);
  pointer.active = true;
});

canvas.addEventListener('pointerdown', e => {
  initAudio();
  if (gameState === 'play') {
    pointer.down = true;
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener('pointerup', () => { pointer.down = false; });
canvas.addEventListener('pointerleave', () => {
  if (!matchMedia('(pointer:coarse)').matches) pointer.down = false;
});

// Mobile Touch Virtual Controls
const touchBtns = [
  { id: 'leftBtn', key: 'a' },
  { id: 'rightBtn', key: 'd' },
  { id: 'jumpBtn', key: 'w' },
  { id: 'downBtn', key: 's' }
];

touchBtns.forEach(({ id, key }) => {
  const b = $(id);
  if (!b) return;
  b.addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); keys[key] = true; });
  b.addEventListener('pointerup', e => { e.preventDefault(); keys[key] = false; });
  b.addEventListener('pointerleave', () => { keys[key] = false; });
});

$('fireBtn')?.addEventListener('pointerdown', e => {
  e.preventDefault();
  initAudio();
  pointer.down = true;
});
$('fireBtn')?.addEventListener('pointerup', () => { pointer.down = false; });

$('wandBtn')?.addEventListener('click', () => {
  initAudio();
  currentWand = (currentWand + 1) % wands.length;
  updateHud();
});

$('editBtn')?.addEventListener('click', () => {
  initAudio();
  const isInsideHoly = holyMountainList.some(h => player.y >= h.y0 && player.y < h.y1);
  if (isInsideHoly || player.perks.tinkerEverywhere) {
    if (editMode) closeWandWorkshop();
    else openWandWorkshop();
  } else {
    showToast('只有在圣山中（或拥有天赋）才能组装魔杖！', true);
  }
});

$('kickBtn')?.addEventListener('click', () => {
  initAudio();
  for (const prop of worldProps) {
    if ((prop.type === 'barrel_explosive' || prop.type === 'barrel_acid') && !prop.exploded) {
      if (Math.hypot(prop.x - player.x, prop.y - player.y) < 20) {
        prop.x += player.dir * 14;
        sfx.hit();
      }
    }
  }
});

// HUD & Modal Controls
$('wandHud').addEventListener('click', e => {
  const chip = e.target.closest('[data-wand]');
  if (chip) {
    initAudio();
    currentWand = +chip.dataset.wand;
    updateHud();
  }
});

$('startBtn').addEventListener('click', startGame);
$('restartBtn').addEventListener('click', startGame);
$('winBtn').addEventListener('click', startGame);

$('closeWandBtn').addEventListener('click', closeWandWorkshop);
$('wandPanel').addEventListener('click', handleWorkshopClick);
$('perkGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-perk]');
  if (b) selectPerk(+b.dataset.perk);
});

// Start loop
gameLoop();
