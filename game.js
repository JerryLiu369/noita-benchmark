/* ============================================================================
   PIXEL ALCHEMIST — an original, Noita-inspired falling-sand roguelite.
   Pure frontend, no server, no build step, no external assets.
   Every pixel is simulated: solids, powders, liquids (density-layered), gases,
   fire (spreads + burns out), and alchemical reactions. Wands are containers
   you assemble from projectile spells, modifiers and triggers.
   Original code, art and naming; only the *systems* are inspired by Noita.
   ============================================================================ */
(() => {
'use strict';

// ------------------------------- constants ---------------------------------
const VW = 480, VH = 270;              // viewport / render resolution (16:9)
const W = 480, H = 3200;               // world size (scrolls vertically only)
const GRAV = 0.16, MAXFALL = 3.4;

// material categories
const AIR=0, SOLID=1, POWDER=2, LIQ=3, GAS=4, CFIRE=5;

// ------------------------------- materials ---------------------------------
// Each material: {name, cat, dens, hard, flamm, pal, light, emiss, acid, dmg}
//  cat    : category
//  dens   : density (liquids sink below lighter ones; powders fall through non-solids)
//  hard   : destruction hardness (0 easy .. 3 very hard). Explosions/drills respect it.
//  flamm  : 0..1 chance an adjacent fire ignites this
//  pal    : [ [r,g,b], ... ] grain shades (length is power of two)
//  light  : [r,g,b,intensity] emitted illumination (0 if none)
//  emiss  : [r,g,b,intensity] additive glow colour (fire/lava/glowstone/magic)
//  acid   : true if acid can corrode it
//  dmg    : hp/second to a creature touching it
function pal(hex, n, jit){
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  const out=[]; const half=(n-1)/2;
  for(let i=0;i<n;i++){ const f=half?(i-half)/half:0; const k=1+f*jit;
    out.push([ Math.max(0,Math.min(255,r*k))|0, Math.max(0,Math.min(255,g*k))|0, Math.max(0,Math.min(255,b*k))|0 ]);
  }
  return out;
}
const M = [
  /*0*/ {name:'空气',   cat:AIR,   dens:0,   hard:0, pal:pal('#0a0c14',1)},
  /*1*/ {name:'岩石',   cat:SOLID, dens:9,   hard:1, pal:pal('#565b6b',6,16), acid:true},
  /*2*/ {name:'泥土',   cat:SOLID, dens:9,   hard:0, pal:pal('#6b4f3a',6,18), acid:true},
  /*3*/ {name:'砂砾',   cat:POWDER, dens:8,  hard:0, pal:pal('#b08b4e',6,16), acid:true},
  /*4*/ {name:'水',     cat:LIQ,   dens:1.0, hard:0, pal:pal('#3f7fb5',4,14)},
  /*5*/ {name:'油',     cat:LIQ,   dens:0.8, hard:0, pal:pal('#7a5326',4,16), flamm:0.5},
  /*6*/ {name:'熔岩',   cat:LIQ,   dens:2.6, hard:0, pal:pal('#e4591f',5,18), light:[1.0,0.42,0.08,0.95], emiss:[1.0,0.45,0.10,0.55], dmg:9},
  /*7*/ {name:'木材',   cat:SOLID, dens:9,   hard:0, pal:pal('#7a5533',5,16), flamm:0.55, acid:true},
  /*8*/ {name:'冰',     cat:SOLID, dens:9,   hard:0, pal:pal('#a9cfe0',5,12), acid:true},
  /*9*/ {name:'雪',     cat:POWDER, dens:7,  hard:0, pal:pal('#dcecf5',6,10), acid:true},
  /*10*/{name:'煤矿',   cat:SOLID, dens:9,   hard:0, pal:pal('#2f323c',6,16), flamm:0.7, acid:true},
  /*11*/{name:'金砂',   cat:POWDER, dens:8,  hard:0, pal:pal('#e8bf4a',6,14)},
  /*12*/{name:'钢铁',   cat:SOLID, dens:9,   hard:3, pal:pal('#7d838f',5,12)},
  /*13*/{name:'石砖',   cat:SOLID, dens:9,   hard:3, pal:pal('#8a7f63',6,14), acid:true},
  /*14*/{name:'玻璃',   cat:SOLID, dens:9,   hard:1, pal:pal('#9fb6bd',4,12)},
  /*15*/{name:'荧光石', cat:SOLID, dens:9,   hard:3, pal:pal('#3a5a52',5,14), light:[0.35,0.9,0.6,0.7], emiss:[0.4,0.95,0.65,0.4]},
  /*16*/{name:'血液',   cat:LIQ,   dens:1.05,hard:0, pal:pal('#a3323f',4,16)},
  /*17*/{name:'毒液',   cat:LIQ,   dens:1.15,hard:0, pal:pal('#7fa62e',4,16), dmg:2.4},
  /*18*/{name:'强酸',   cat:LIQ,   dens:1.4, hard:0, pal:pal('#b6e24a',4,18), light:[0.6,1.0,0.2,0.35], emiss:[0.7,1.0,0.25,0.3], dmg:9},
  /*19*/{name:'软泥',   cat:LIQ,   dens:1.25,hard:0, pal:pal('#5fa13c',4,16)},
  /*20*/{name:'火焰',   cat:CFIRE,dens:0,   hard:0, pal:pal('#ffcf5a',5,20), light:[1.0,0.5,0.14,0.9], emiss:[1.0,0.6,0.15,0.75], dmg:5},
  /*21*/{name:'烟雾',   cat:GAS,   dens:0,   hard:0, pal:pal('#6a6a76',3,10)},
  /*22*/{name:'蒸汽',   cat:GAS,   dens:0,   hard:0, pal:pal('#cdd8dd',3,10)},
  /*23*/{name:'毒气',   cat:GAS,   dens:0,   hard:0, pal:pal('#9fbb3a',3,12), light:[0.5,0.8,0.2,0.25], dmg:2.2},
  /*24*/{name:'可燃气', cat:GAS,   dens:0,   hard:0, pal:pal('#c98a3a',3,14), flamm:0.9},
  /*25*/{name:'毒雾',   cat:GAS,   dens:0,   hard:0, pal:pal('#c2a83a',3,12), dmg:2.0},
  /*26*/{name:'火药',   cat:POWDER, dens:8,  hard:0, pal:pal('#4a4038',5,14), flamm:1.0},
  /*27*/{name:'菌丝',   cat:SOLID, dens:9,   hard:0, pal:pal('#7a5a86',5,16), flamm:0.6, acid:true},
  /*28*/{name:'愈疗液', cat:LIQ,   dens:1.1, hard:0, pal:pal('#e36ba0',4,14), light:[0.9,0.4,0.7,0.5], emiss:[0.95,0.5,0.75,0.4]},
  /*29*/{name:'传送液', cat:LIQ,   dens:1.1, hard:0, pal:pal('#4fd6e0',4,14), light:[0.3,0.8,1.0,0.55], emiss:[0.4,0.9,1.0,0.4]},
  /*30*/{name:'变形液', cat:LIQ,   dens:1.1, hard:0, pal:pal('#c77ae0',4,14), light:[0.8,0.4,1.0,0.5], emiss:[0.85,0.5,1.0,0.4]},
  /*31*/{name:'狂怒液', cat:LIQ,   dens:1.1, hard:0, pal:pal('#e04a3a',4,14), light:[1.0,0.3,0.2,0.5], emiss:[1.0,0.35,0.25,0.4]},
  /*32*/{name:'魔力液', cat:LIQ,   dens:1.1, hard:0, pal:pal('#4f8fe0',4,14), light:[0.3,0.5,1.0,0.55], emiss:[0.4,0.6,1.0,0.4]},
  /*33*/{name:'疾风液', cat:LIQ,   dens:1.1, hard:0, pal:pal('#63e08a',4,14), light:[0.4,1.0,0.5,0.5], emiss:[0.5,1.0,0.6,0.4]},
  /*34*/{name:'漂浮液', cat:LIQ,   dens:1.1, hard:0, pal:pal('#e0d24f',4,14), light:[0.9,0.9,0.4,0.5], emiss:[0.95,0.95,0.5,0.4]},
  /*35*/{name:'苔藓',   cat:SOLID, dens:9,   hard:0, pal:pal('#4c7a45',5,16), flamm:0.5, acid:true},
];
// id helpers
const ROCK=1,DIRT=2,SAND=3,WATER=4,OIL=5,LAVA=6,WOOD=7,ICE=8,SNOW=9,COAL=10,GOLD=11,STEEL=12,BRICK=13,GLASS=14,GLOW=15,BLOOD=16,POISON=17,ACID=18,SLIME=19,FIRE=20,SMOKE=21,STEAM=22,PGAS=23,FLAM=24,TOXIC=25,GUN=26,FUNGUS=27,HEAL=28,TELE=29,POLY=30,BERSERK=31,MANA=32,ACCEL=33,LEVI=34,MOSS=35;

// precompute categories & rgb palettes
const MCAT = new Uint8Array(M.length);
const MATRGB = [];      // flat [r,g,b,...] per material
for(let i=0;i<M.length;i++){
  MCAT[i]=M[i].cat;
  const p=M[i].pal, flat=new Uint16Array(p.length*3);
  for(let s=0;s<p.length;s++){ flat[s*3]=p[s][0]; flat[s*3+1]=p[s][1]; flat[s*3+2]=p[s][2]; }
  MATRGB.push(flat);
}

// ------------------------------- rng / noise -------------------------------
let rngState = 1;
function rng(){ // mulberry32
  rngState |= 0; rngState = (rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rint(a,b){ return Math.floor(rng()*(b-a+1))+a; }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
let noiseSeed = 12345;
function hash2(x,y){
  let h = Math.imul(x,374761393) + Math.imul(y,668265263) + noiseSeed;
  h = Math.imul(h ^ (h>>>13), 1274126177);
  return ((h ^ (h>>>16)) >>> 0) / 4294967296;
}
function vnoise(x,y){
  const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
  const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  const a=hash2(xi,yi), b=hash2(xi+1,yi), c=hash2(xi,yi+1), d=hash2(xi+1,yi+1);
  return a + (b-a)*u + (c-a)*v + (a-b-c+d)*u*v;
}
function cave(x,y){
  let n=0,amp=1,norm=0;
  n+=vnoise(x*0.013, y*0.021)*amp; norm+=amp; amp*=0.55;
  n+=vnoise(x*0.033+50, y*0.05+50)*amp; norm+=amp; amp*=0.55;
  n+=vnoise(x*0.08+120, y*0.11+120)*amp; norm+=amp;
  return n/norm;
}

// ------------------------------- world state -------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', {alpha:false});
const img = ctx.createImageData(VW, VH);
const px = img.data;

let cells = new Uint8Array(W*H);   // material id
let vari  = new Uint8Array(W*H);   // grain variation (moves with the cell)
let meta  = new Uint8Array(W*H);   // transient state (fire life, gas life, flow dir)

// lighting buffers (viewport only)
const lR=new Float32Array(VW*VH), lG=new Float32Array(VW*VH), lB=new Float32Array(VW*VH);
const tR=new Float32Array(VW*VH), tG=new Float32Array(VW*VH), tB=new Float32Array(VW*VH);

const idx=(x,y)=>y*W+x;
function inside(x,y){ return x>=0&&x<W&&y>=0&&y<H; }
function get(x,y){ x|=0;y|=0; return (x>=0&&x<W&&y>=0&&y<H)?cells[y*W+x]:ROCK; }
function put(x,y,m){ if(!inside(x,y))return; const i=y*W+x; cells[i]=m; vari[i]=(Math.random()*255)|0; meta[i]=0; }
function swp(i,j){
  let c=cells[i];cells[i]=cells[j];cells[j]=c;
  let v=vari[i];vari[i]=vari[j];vari[j]=v;
  let m=meta[i];meta[i]=meta[j];meta[j]=m;
}
function isSolid(m){ return MCAT[m]===SOLID; }
function solidAt(x,y){ return isSolid(get(x,y)); }

// ------------------------------- biomes ------------------------------------
const BIOMES = [
  {name:'矿坑 MINES',        y0:90,   y1:600,  bg:'#0d1018', rock:ROCK,   dirt:DIRT, top:'#4c7a45'},
  {name:'煤坑 COAL PITS',    y0:680,  y1:1190, bg:'#120e12', rock:ROCK,   dirt:DIRT, top:'#3a2f28'},
  {name:'真菌洞穴 FUNGAL',   y0:1270, y1:1780, bg:'#0f0a16', rock:ROCK,   dirt:FUNGUS, top:'#8a5a96'},
  {name:'雪渊 SNOWY DEPTHS', y0:1860, y1:2370, bg:'#0a1220', rock:ROCK,   dirt:ICE,  top:'#cfe2ee'},
  {name:'熔岩实验室 LAVA',   y0:2450, y1:2960, bg:'#170d0a', rock:ROCK,   dirt:BRICK, top:'#5a3a2a'},
];
const HM_Y = [ [600,680],[1190,1270],[1780,1860],[2370,2450] ]; // holy mountains
function biomeAt(y){
  for(const b of BIOMES){ if(y>=b.y0&&y<b.y1) return b; }
  if(y<90) return BIOMES[0];
  return BIOMES[BIOMES.length-1];
}
function inHoly(y){ for(const h of HM_Y){ if(y>=h[0]&&y<h[1]) return h; } return null; }

// ------------------------------- game state --------------------------------
let G;
function newState(){
  return {
    mode:'title', frame:0, seed:0,
    camY:0, shake:0, shakeX:0, shakeY:0,
    player:null, enemies:[], projectiles:[], particles:[], pickups:[], chests:[], wands:[], dropped:[],
    cur:0, gold:0, depth:0, kills:0,
    holy:[], holySeen:new Set(), editMode:false, editorSel:null,
    perkChoices:[], pendingExplosions:[], breath:1, deathCause:'', floaters:[],
    perk:{}, playTime:0, paused:false,
  };
}

// ------------------------------- player ------------------------------------
function makePlayer(){
  return { x:W/2, y:44, vx:0, vy:0, w:5, h:11, hp:100, maxHp:100,
    mana:0, maxMana:0, hover:100, maxHover:100, inv:0, onGround:false, dir:1,
    burning:0, poison:0, toxic:0, berserk:0, haste:0, wet:0, oily:0, regen:0,
    dead:false, kickCd:0, anim:0, aimX:1, aimY:0 };
}

// ------------------------------- world generation --------------------------
function generateWorld(){
  cells.fill(AIR); vari.fill(0); meta.fill(0);
  noiseSeed = (G.seed*2654435761)>>>0;
  const border = 8;
  for(let y=0;y<H;y++){
    const b = biomeAt(y);
    const holy = inHoly(y);
    for(let x=0;x<W;x++){
      const edge = x<border || x>=W-border || y<6 || y>=H-8;
      if(holy){ // holy mountain chamber
        const t=y-holy[0];
        if(t<5||t>=(holy[1]-holy[0])-5 || x<border+2 || x>=W-border-2){ cells[idx(x,y)]=BRICK; }
        else cells[idx(x,y)]=AIR;
        continue;
      }
      if(edge){ cells[idx(x,y)]= (y>=H-8)?STEEL:ROCK; continue; }
      // cave density
      let d = cave(x,y);
      // open more in the middle vertically of each band, near-solid at band tops/bottoms
      const mid = (b.y0+b.y1)/2;
      const vfall = 1 - Math.min(1, Math.abs(y-mid)/((b.y1-b.y0)/2));
      const solid = d < 0.52 - vfall*0.10;
      if(solid){
        let m = ROCK;
        const top = y - b.y0;
        // surface cap
        if(top<4){ m = (b.top==='#cfe2ee')?SNOW:b.dirt; }
        else {
          const r=rng();
          if(b.name.includes('LAVA')){
            m = r<0.30?BRICK:(r<0.42?STEEL:ROCK);
          } else if(b.name.includes('SNOWY')){
            m = r<0.42?ICE:(r<0.55?SNOW:ROCK);
          } else if(b.name.includes('FUNGAL')){
            m = r<0.40?FUNGUS:(r<0.6?b.dirt:ROCK);
          } else if(b.name.includes('COAL')){
            m = r<0.34?COAL:(r<0.55?b.dirt:ROCK);
          } else {
            m = r<0.4?b.dirt:(r<0.5?SAND:ROCK);
          }
        }
        cells[idx(x,y)] = m;
        vari[idx(x,y)] = (Math.random()*255)|0;
      }
    }
  }
  // ore veins, lava pools, wooden supports, glowstone lamps per band
  for(const b of BIOMES){
    const lava = b.name.includes('LAVA');
    for(let k=0;k<70;k++){
      const x=rint(border+6,W-border-7), y=rint(b.y0+8,b.y1-8);
      if(lava && rng()<0.5 && solidAt(x,y+1)===false && get(x,y)===AIR){ paintPool(x,y,LAVA,rint(10,26)); }
      else if(get(x,y)===ROCK && rng()<0.5){ vein(x,y, rng()<0.5?COAL:GOLD, rint(4,12)); }
      else if(rng()<0.3 && get(x,y)===AIR && solidAt(x,y+1)){ // wooden platform
        const len=rint(6,16); for(let i=0;i<len;i++){ const xx=x+i; if(get(xx,y)===AIR){ put(xx,y,WOOD);} }
      }
    }
    for(let k=0;k<10;k++){ // glowstone lamps embedded in ceiling
      const x=rint(border+10,W-border-11), y=rint(b.y0+14,b.y1-12);
      if(solidAt(x,y)&&solidAt(x,y-1)===false) put(x,y-1,GLOW);
    }
  }
  // guaranteed vertical shafts so the run is always completable
  for(let y=20;y<H-10;y++){
    if(inHoly(y)) continue;
    const cx = W/2 + Math.round(Math.sin(y*0.01)*40);
    for(let x=cx-2;x<=cx+2;x++) if(inside(x,y)&&!inHoly(y)) cells[idx(x,y)]=AIR;
  }
  // starting clearing
  for(let y=14;y<70;y++) for(let x=W/2-30;x<W/2+30;x++) if(inside(x,y)) cells[idx(x,y)]=AIR;
  // carve holy mountain rooms' content
  G.holy=[];
  HM_Y.forEach((h,i)=>{
    const room={y0:h[0],y1:h[1],claimed:false,benchX:60+i*8,altarX:W-70};
    G.holy.push(room);
    const y0=h[0], y1=h[1];
    // floor & ceiling planks
    for(let x=border+2;x<W-border-2;x++){ put(x,y0+4,WOOD); put(x,y1-6,WOOD); }
    // glowstone lamps
    for(let lx=40; lx<W-40; lx+=90){ put(lx, y0+6, GLOW); }
    // wand-edit bench (steel + glow)
    for(let yy=y1-12; yy<y1-6; yy++) for(let xx=room.benchX-4; xx<room.benchX+4; xx++) put(xx,yy,STEEL);
    put(room.benchX, y1-13, GLOW);
    // a chest and a spell on the bench area
    G.chests.push({x:W/2, y:y1-16, opened:false});
    G.pickups.push({type:'spell', x:W/2+40, y:y1-16, vx:0, vy:0, spell:randomSpell()});
    G.pickups.push({type:'heart', x:W/2-40, y:y1-16, vx:0, vy:0});
  });
  // populate pickups & enemies per band
  for(const b of BIOMES){
    for(let k=0;k<26;k++){
      const x=rint(border+10,W-border-11), y=rint(b.y0+12,b.y1-12);
      if(get(x,y)===AIR){
        const r=rng();
        if(r<0.5) G.pickups.push({type:'gold', x, y, vx:0, vy:0, val:rint(4,20)});
        else if(r<0.75) G.pickups.push({type:'spell', x, y, vx:0, vy:0, spell:randomSpell()});
        else G.pickups.push({type:'heart', x, y, vx:0, vy:0});
      }
    }
    // wand pedestals (glowstone + floating wand)
    for(let k=0;k<2;k++){
      const x=rint(border+16,W-border-17), y=rint(b.y0+20,b.y1-16);
      if(get(x,y)===AIR && solidAt(x,y+1)){
        put(x,y+1,GLOW);
        G.dropped.push(makeWandDrop(x,y-3));
      }
    }
    spawnBiomeEnemies(b);
  }
  // boss arena
  const by0=2960;
  for(let y=by0;y<H-10;y++) for(let x=border;x<W-border;x++){
    const t=y-by0; if(t<4||t>110) cells[idx(x,y)]=BRICK; else cells[idx(x,y)]=AIR;
  }
  for(let x=border+2;x<W-border-2;x++){ put(x,by0+108,BRICK); }
  for(let lx=40; lx<W-40; lx+=70) put(lx,by0+8,GLOW);
  spawnEnemy('boss', W/2, by0+40);
}
function paintPool(x,y,m,r){
  for(let yy=-r;yy<=r;yy++) for(let xx=-r;xx<=r;xx++){
    if(xx*xx+yy*yy<=r*r && inside(x+xx,y+yy) && get(x+xx,y+yy)===AIR) put(x+xx,y+yy,m);
  }
}
function vein(x,y,m,len){
  let cx=x,cy=y;
  for(let i=0;i<len;i++){
    if(inside(cx,cy)&&get(cx,cy)===ROCK) put(cx,cy,m);
    cx+=rint(-1,1); cy+=rint(-1,1);
  }
}

// ------------------------------- enemies -----------------------------------
const ENEMY_DEF = {
  walker:{hp:30, w:6,h:11, color:'#b9c6b8', name:'幽影'},
  shooter:{hp:38,w:7,h:10, color:'#c4576a', name:'毒术师'},
  flyer:{hp:20, w:8,h:6,  color:'#c8698d', name:'夜蜓'},
  bomber:{hp:24,w:8,h:8,  color:'#d98a3a', name:'自爆虫'},
  worm:{hp:46,  w:7,h:7,  color:'#8a6fae', name:'潜地者'},
  slime:{hp:22,  w:8,h:7,  color:'#5fa13c', name:'软泥'},
  boss:{hp:900, w:22,h:22,color:'#b33fbb', name:'终焉之眼'},
};
function spawnEnemy(type,x,y){
  const d=ENEMY_DEF[type];
  let yy=y; while(yy>6 && !(get(x,yy)===AIR)) yy--;
  const e={ type, x, y:yy, vx:0, vy:0, w:d.w, h:d.h, hp:d.hp, max:d.hp,
    cool:rint(20,90), dir:rng()<0.5?-1:1, phase:rng()*9, flash:0, fuse:-1, dead:false, t:0 };
  G.enemies.push(e); return e;
}
function spawnBiomeEnemies(b){
  const types = b.name.includes('MINES') ? ['walker','flyer','slime']
    : b.name.includes('COAL') ? ['walker','shooter','bomber']
    : b.name.includes('FUNGAL') ? ['shooter','worm','slime','flyer']
    : b.name.includes('SNOWY') ? ['flyer','worm','shooter']
    : ['worm','bomber','shooter','flyer'];
  const n = 10 + Math.floor((b.y1-b.y0)/60);
  for(let i=0;i<n;i++){
    const x=rint(20,W-21), y=rint(b.y0+14,b.y1-14);
    if(get(x,y)===AIR) spawnEnemy(types[rint(0,types.length-1)], x, y);
  }
}

// ------------------------------- spells & wands ----------------------------
const SPELLS = {
  spark:   {name:'火花弹',   cost:4,  delay:0.06, kind:'bolt',     dmg:9,  speed:3.6, life:150, color:'#ffe27a', light:[1,0.8,0.3,0.5]},
  arrow:   {name:'魔法箭',   cost:9,  delay:0.10, kind:'bolt',     dmg:20, speed:4.4, life:170, color:'#8fd8ff', light:[0.4,0.8,1,0.55]},
  fireball:{name:'炎爆弹',   cost:20, delay:0.16, kind:'explosive',dmg:22, speed:3.0, life:150, color:'#ff8a3a', rad:13, light:[1,0.45,0.1,0.8]},
  bomb:    {name:'爆破桶',   cost:30, delay:0.22, kind:'bomb',     dmg:10, speed:2.2, life:200, color:'#f2d15f', rad:22, dig:true, grav:0.06, light:[1,0.8,0.2,0.5]},
  orb:     {name:'能量法球', cost:26, delay:0.20, kind:'explosive',dmg:34, speed:1.8, life:220, color:'#c9a6ff', rad:16, grav:0.02, light:[0.8,0.5,1,0.9]},
  drill:   {name:'光明钻头', cost:11, delay:0.02, kind:'drill',    dmg:6,  speed:5.0, life:90,  color:'#eaf6ff', rad:4, light:[0.8,0.9,1,0.7]},
  lightning:{name:'链式闪电',cost:24, delay:0.24, kind:'lightning',dmg:30, speed:6.2, life:80,  color:'#bfe9ff', chain:3, light:[0.7,0.9,1,1.0]},
  saw:     {name:'旋齿锯轮', cost:26, delay:0.20, kind:'saw',      dmg:16, speed:3.4, life:260, color:'#dfe6ee', pierce:true, spin:true, light:[0.7,0.8,0.9,0.5]},
  scatter: {name:'散射火花', cost:15, delay:0.18, kind:'bolt',     dmg:8,  speed:3.4, life:120, color:'#e7b6ff', count:3, spread:0.22, light:[0.8,0.6,1,0.4]},
  water:   {name:'水流术',   cost:3,  delay:0.04, kind:'material', dmg:0,  speed:4.2, life:70,  color:'#6fc4ff', mat:WATER, matAmt:4},
  acid:    {name:'强酸泼溅', cost:16, delay:0.16, kind:'material', dmg:0,  speed:3.6, life:90,  color:'#c6f06a', mat:ACID, matAmt:3},
  oil:     {name:'油滴术',   cost:7,  delay:0.08, kind:'material', dmg:0,  speed:3.8, life:90,  color:'#a8762f', mat:OIL, matAmt:4},
  heal:    {name:'愈疗之光', cost:12, delay:0.14, kind:'heal',     dmg:14, speed:4.0, life:140, color:'#9df0b6', light:[0.4,1,0.6,0.7]},
  teleport:{name:'传送闪现', cost:16, delay:0.30, kind:'teleport', dmg:0,  speed:5.2, life:70,  color:'#b9a6ff', dist:70},
};
const MODS = {
  multi:   {name:'多重施法', cost:12, color:'#ffcf6b'},
  homing:  {name:'追踪',     cost:6,  color:'#dc8cff'},
  explosive:{name:'爆裂强化',cost:9,  color:'#ff9a55'},
  fire:    {name:'烈焰轨迹', cost:4,  color:'#ff7a3a'},
  bounce:  {name:'弹射',     cost:4,  color:'#83e9b2'},
  damage:  {name:'伤害加成', cost:10, color:'#ff6b7a'},
  speed:   {name:'疾速',     cost:6,  color:'#8fd8ff'},
  light:   {name:'光明',     cost:5,  color:'#fff0a4'},
  pierce:  {name:'穿透',     cost:12, color:'#c9d4e6'},
  crit:    {name:'暴击',     cost:8,  color:'#ffe98a'},
  spreadUp:{name:'扩散',     cost:4,  color:'#e0a6ff'},
  spreadDown:{name:'聚能',   cost:6,  color:'#a6e0ff'},
  recharge:{name:'蓄能加速', cost:14, color:'#7af0c0'},
  mana:    {name:'节能',     cost:5,  color:'#8de6ff'},
};
const TRIGGERS = { trigger:{name:'触发', cost:8, color:'#ff8ad0'}, timer:{name:'定时', cost:8, color:'#8affd0'} };
const ALL_SPELL_IDS = Object.keys(SPELLS);
const ALL_MOD_IDS = Object.keys(MODS);

function randomSpell(){ return ALL_SPELL_IDS[rint(0,ALL_SPELL_IDS.length-1)]; }
function randomMod(){ return ALL_MOD_IDS[rint(0,ALL_MOD_IDS.length-1)]; }
function spellLabel(id){ return SPELLS[id]?.name || MODS[id]?.name || TRIGGERS[id]?.name || id; }

function makeWand(name, opts){
  opts=opts||{};
  const w = {
    name, slots: opts.slots||[], capacity: opts.capacity||rint(3,7),
    spellsCast: opts.spellsCast||1, castDelay: opts.castDelay!=null?opts.castDelay:+(0.05+rng()*0.2).toFixed(2),
    recharge: opts.recharge!=null?opts.recharge:+(0.2+rng()*0.4).toFixed(2),
    manaMax: opts.manaMax||rint(90,180), mana:0, regen: opts.regen||rint(22,46),
    spread: opts.spread!=null?opts.spread:+((rng()*10-4)).toFixed(1),
    speedMult: opts.speedMult||+(0.85+rng()*0.35).toFixed(2),
    shuffle: !!opts.shuffle, timer:0, castCd:0, drawIdx:0, tier:opts.tier||1,
  };
  w.mana = w.manaMax;
  return w;
}
function starterWands(){
  const a = makeWand('晨星法杖', {slots:[{id:'spark'},{id:'spark'}], capacity:4, manaMax:120, regen:34});
  const b = makeWand('掘地短杖', {slots:[{id:'bomb'}], capacity:2, manaMax:90, regen:18, recharge:0.5});
  return [a,b];
}
function makeWandDrop(x,y){
  const tier = 1+Math.floor(rng()*3);
  const slots=[];
  const nSlots=rint(1,4);
  for(let i=0;i<nSlots;i++) slots.push(rng()<0.7?{id:randomSpell()}:{id:randomMod()});
  return { wand: makeWand(randomWandName(), {slots, capacity:rint(3,6)+tier, tier, manaMax:rint(90,150)+tier*30, regen:rint(24,48)}),
    x, y, vx:0, vy:0, t:0 };
}
function randomWandName(){
  const A=['古旧','微光','符文','荆棘','霜纹','赤铁','低语','星辉','幽深','熔核'];
  const B=['木杖','短杖','长杖','法杖','手杖','节杖'];
  return A[rint(0,A.length-1)]+B[rint(0,B.length-1)];
}

// ------------------------------- wand casting ------------------------------
function castWand(w, fromX, fromY, aimDX, aimDY, owner){
  if(w.timer>0) return 0;
  // build a cast plan by walking slots
  const casts=[];                 // {spec, mods, payload:[{spec,mods}]}
  let mods = newShot();
  let pendingTrig=null;           // 'trigger'|'timer'
  let multiNext=0;                // multicast count for next projectile
  const totalMana = estimateMana(w);
  if(owner==='player'){ if(w.mana < totalMana) return 0; }
  function newShot(){ return {dmg:1, speed:1, spread:0, rad:0, homing:false, bounce:false, explosive:false, fire:false, light:0, pierce:false, crit:0, trail:null}; }
  for(let i=0;i<w.slots.length;i++){
    const slot=w.slots[i]; if(!slot) continue;
    const id=slot.id;
    if(SPELLS[id]){
      const spec=SPELLS[id];
      const count = Math.max(1, (spec.count||1) + (multiNext||0));
      multiNext=0;
      const cast = {spec, mods, count, payload:[], trigger:pendingTrig};
      casts.push(cast);
      pendingTrig=null;
    } else if(TRIGGERS[id]){
      pendingTrig=id;
    } else if(MODS[id]){
      const m=MODS[id];
      switch(id){
        case 'multi': multiNext+=2; break;
        case 'homing': mods.homing=true; break;
        case 'explosive': mods.explosive=true; mods.rad+=6; break;
        case 'fire': mods.fire=true; break;
        case 'bounce': mods.bounce=true; break;
        case 'damage': mods.dmg*=1.5; break;
        case 'speed': mods.speed*=1.4; break;
        case 'light': mods.light+=0.9; break;
        case 'pierce': mods.pierce=true; break;
        case 'crit': mods.crit+=0.25; break;
        case 'spreadUp': mods.spread+=8; break;
        case 'spreadDown': mods.spread-=6; break;
        case 'mana': break;
      }
    }
  }
  if(casts.length===0) return 0;
  // apply modifiers & spawn
  const wSpread = w.spread;
  const speedMul = w.speedMult;
  for(const cast of casts){
    const spec=cast.spec, md=cast.mods;
    const baseAng = Math.atan2(aimDY, aimDX);
    for(let c=0;c<cast.count;c++){
      const specSpread = (spec.spread||0)*Math.PI/180;
      let ang = baseAng;
      if(cast.count>1) ang += (c-(cast.count-1)/2)*specSpread;
      ang += ((md.spread + wSpread) * (rng()*2-1)) * Math.PI/180;
      const sp = spec.speed * md.speed * speedMul;
      spawnProjectile(fromX, fromY, Math.cos(ang)*sp, Math.sin(ang)*sp, spec, md, owner, cast);
    }
  }
  // mana + timers (player) — timers are in frames (60fps)
  if(owner==='player'){
    w.mana -= totalMana;
    w.castCd = w.castDelay * 60 * Math.max(1, casts.length);
    // recharge: shortened by 'recharge' modifier count
    let red=0; for(const s of w.slots) if(s && s.id==='recharge') red++;
    w.timer = Math.max(3, (w.recharge - red*0.08) * 60);
    // multicast count toward spellsCast handled implicitly
    sfx('cast');
  }
  return casts.length;
}
function estimateMana(w){
  let sum=0;
  for(const s of w.slots){ if(!s) continue; const c = SPELLS[s.id]?.cost ?? MODS[s.id]?.cost ?? TRIGGERS[s.id]?.cost ?? 0; sum+=c; }
  return Math.max(1, sum);
}
function spawnProjectile(x,y,vx,vy,spec,md,owner,cast){
  const p={
    x, y, vx, vy, life:spec.life, spec, kind:spec.kind, owner,
    dmg: spec.dmg * md.dmg * (owner==='player' && G.perk.berserkActive?2:1),
    speed: Math.hypot(vx,vy), rad: (spec.rad||0) + md.rad,
    color: spec.color, grav: spec.grav||(spec.kind==='bolt'?0.014:0.03),
    homing: md.homing, bounce: md.bounce, explosive: md.explosive||spec.kind==='explosive'||spec.kind==='bomb',
    fire: md.fire, light: (spec.light?spec.light[3]:0)+md.light, lightCol: spec.light||[1,1,1,0],
    pierce: md.pierce||spec.pierce, crit: md.crit, trail: md.fire?FIRE:(spec.mat||0),
    mat: spec.mat||0, matAmt: spec.matAmt||0, dig: spec.dig||false, chain: spec.chain||0,
    heal: spec.kind==='heal', teleport: spec.kind==='teleport', dist: spec.dist||0,
    spin: spec.spin||false, payload: cast?cast.payload:[], trigger: cast?cast.trigger:null,
    timer: cast&&cast.trigger==='timer'?40:0, hitSet: owner==='player'?null:null, owner0:owner,
  };
  G.projectiles.push(p); return p;
}

// ------------------------------- explosions & damage -----------------------
function explode(x,y,radius,power,opts){
  opts=opts||{};
  x|=0; y|=0;
  const dig = opts.dig!==undefined?opts.dig:true;
  const matDrop = opts.matDrop||0;
  const r2=radius*radius;
  for(let yy=-radius;yy<=radius;yy++){
    for(let xx=-radius;xx<=radius;xx++){
      const d2=xx*xx+yy*yy; if(d2>r2) continue;
      const gx=x+xx, gy=y+yy; if(!inside(gx,gy)) continue;
      const i=gy*W+gx, m=cells[i];
      if(m===AIR||m===STEEL&&radius<20) continue;
      const falloff = 1 - Math.sqrt(d2)/radius;
      const e = power*falloff;
      const hard = M[m].hard;
      const cat=MCAT[m];
      if(cat===GAS){ if(m===FLAM||e>0.5){ cells[i]=(rng()<0.5)?FIRE:AIR; } continue; }
      if(cat===LIQ){ cells[i] = (m===LAVA)?FIRE:(e>0.3?STEAM:AIR); continue; }
      if(cat===CFIRE) continue;
      if(dig && e > hard*1.2 + 0.3){ // destroy
        if(m===LAVA){ cells[i]=FIRE; }
        else if(cat===SOLID && M[m].flamm>0 && rng()<0.4){ cells[i]=FIRE; }
        else { cells[i]= (matDrop&&rng()<0.3)?matDrop:AIR; }
      }
    }
  }
  // damage creatures
  for(const e of G.enemies){
    if(e.dead) continue;
    const d=Math.hypot(e.x-x,e.y-y);
    if(d<radius+e.w){ damageEnemy(e, power*3*(1-d/(radius+e.w)), 'explosion'); }
  }
  const pd=Math.hypot(G.player.x-x, G.player.y-y);
  if(pd<radius+6){ hurtPlayer(power*2.4*(1-pd/(radius+6)), 'explosion'); }
  // fx
  for(let i=0;i<Math.min(40,radius*2);i++){
    const a=rng()*Math.PI*2, sp=rng()*radius*0.18;
    G.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:rint(14,30),max:30,color:'#ffcf6a',size:1});
  }
  G.particles.push({x,y,life:16,max:16,kind:'flash',rad:radius,color:'#ffd98a'});
  addShake(Math.min(9, radius*0.4+power*0.2));
  sfx('boom');
}
function damageEnemy(e,dmg,src){
  if(e.dead) return;
  let d=dmg;
  const crit = (src==='spell'||src==='explosion') && rng()< (G.perk.crit||0);
  if(crit) d*=3;
  e.hp-=d; e.flash=6;
  if(e.hp<=0) killEnemy(e, src);
  else { G.particles.push({x:e.x,y:e.y-4,vx:0,vy:-0.4,life:10,max:10,kind:'txt',txt:Math.round(d),color:crit?'#ffe98a':'#ffffff'}); sfx('hit'); }
}
function killEnemy(e, src){
  if(e.dead) return;
  e.dead=true; G.kills++;
  const def=ENEMY_DEF[e.type];
  const trick = (src==='explosion'||src==='fire'||src==='drown'||src==='crush'||src==='acid');
  const n = (e.type==='boss')?400:rint(3,16)*(trick?2:1);
  G.pickups.push({type:'gold', x:e.x, y:e.y, vx:rng()-0.5, vy:-1.6, val:n});
  for(let i=0;i<10;i++) G.particles.push({x:e.x+rint(-4,4),y:e.y+rint(-4,4),vx:rng()-0.5,vy:rng()-1,life:rint(16,34),max:34,color:def.color,size:1});
  G.particles.push({x:e.x,y:e.y,life:12,max:12,kind:'flash',rad:e.w,color:'#ffffff'});
  addShake(3);
  sfx('kill');
  if(e.type==='boss'){ winGame(); }
}
function hurtPlayer(dmg, src, causeOverride){
  const pl=G.player;
  if(pl.dead||pl.inv>0) return;
  let d=dmg;
  if(G.perk.resist) d*=0.5;
  pl.hp-=d; pl.inv = src==='material'?6:22;
  if(src==='spell'||src==='explosion'||src==='melee'){ addShake(Math.min(6,d*0.4+2)); }
  G.particles.push({x:pl.x,y:pl.y-6,vx:0,vy:-0.4,life:10,max:10,kind:'txt',txt:'-'+Math.round(d),color:'#ff7a86'});
  if(pl.hp<=0){ die(causeOverride || causeFrom(src)); }
}
function causeFrom(src){
  switch(src){
    case 'fire': case 'lava': return '烧死';
    case 'drown': return '溺死';
    case 'crush': return '压死';
    case 'poison': return '毒死';
    case 'toxic': return '毒死';
    case 'acid': return '被强酸腐蚀';
    case 'explosion': return '被爆炸撕碎';
    case 'melee': return '被敌人近战击杀';
    case 'spell': return '被敌方法术击中';
    default: return '力竭而亡';
  }
}

// ------------------------------- death / win -------------------------------
function die(cause){
  const pl=G.player; if(pl.dead) return;
  pl.dead=true; G.deathCause=cause; G.mode='dead';
  for(let i=0;i<30;i++) G.particles.push({x:pl.x,y:pl.y,vx:rng()-0.5,vy:rng()-1.2,life:rint(30,60),max:60,color:'#e3b9da',size:1});
  showDeath(cause);
  sfx('dead');
}
function winGame(){
  G.mode='win'; showWin(); sfx('win');
}

// ------------------------------- particles / shake -------------------------
function addShake(v){ G.shake=Math.min(14, G.shake+v); }

// ------------------------------- lighting ----------------------------------
const AMB=0.16;
function addLight(x,y,r,g,b,inten,radius){
  const cx=x|0, cy=(y|0)-Math.floor(G.camY);
  const rad=radius|0;
  const x0=Math.max(0,cx-rad), x1=Math.min(VW-1,cx+rad);
  const y0=Math.max(0,cy-rad), y1=Math.min(VH-1,cy+rad);
  const inv=1/(rad*rad+1);
  for(let yy=y0;yy<=y1;yy++){
    const dy=yy-cy, row=yy*VW;
    for(let xx=x0;xx<=x1;xx++){
      const dx=xx-cx; const d2=dx*dx+dy*dy; if(d2>rad*rad) continue;
      const f=(1-d2*inv); const v=inten*f*f;
      const i=row+xx; lR[i]+=r*v; lG[i]+=g*v; lB[i]+=b*v;
    }
  }
}
function computeLighting(){
  lR.fill(0); lG.fill(0); lB.fill(0);
  const camY=Math.floor(G.camY);
  // emitters from world cells (fire, lava, glowstone, magic liquids, glowing gas)
  for(let sy=0;sy<VH;sy++){
    const wy=sy+camY; if(wy<0||wy>=H) continue;
    const row=wy*W, orow=sy*VW;
    for(let x=0;x<W;x++){
      const m=cells[row+x]; const lt=M[m].light;
      if(lt){ const i=orow+x; lR[i]+=lt[0]*lt[3]; lG[i]+=lt[1]*lt[3]; lB[i]+=lt[2]*lt[3]; }
    }
  }
  // dynamic point lights
  const pl=G.player;
  if(pl) addLight(pl.x, pl.y+2, 0.55,0.55,0.65, 0.42, 34); // faint personal glow so it's playable
  for(const p of G.projectiles){
    if(p.light>0){ const c=p.lightCol; addLight(p.x,p.y, c[0],c[1],c[2], p.light, 20); }
  }
  for(const p of G.particles){ if(p.kind==='flash'){ addLight(p.x,p.y,1,0.85,0.5,(p.life/p.max)*1.4, p.rad*1.3); } }
  for(const d of G.dropped){ if(d.wand) addLight(d.x,d.y, 1,0.85,0.4, 0.5, 14); } // gold sparkle
  for(const c of G.chests){ if(!c.opened) addLight(c.x,c.y, 1,0.8,0.35, 0.4, 12); }
  // blur (separable box, radius 7)
  blurH(lR,tR); blurV(tR,lR);
  blurH(lG,tG); blurV(tG,lG);
  blurH(lB,tB); blurV(tB,lB);
}
function blurH(src,dst){
  const R=7, inv=1/(R*2+1);
  for(let y=0;y<VH;y++){
    const row=y*VW; let sum=0;
    for(let k=-R;k<=R;k++){ const x=clamp(k,0,VW-1); sum+=src[row+x]; }
    for(let x=0;x<VW;x++){
      dst[row+x]=sum*inv;
      const add=clamp(x+R+1,0,VW-1), sub=clamp(x-R,0,VW-1);
      sum+=src[row+add]-src[row+sub];
    }
  }
}
function blurV(src,dst){
  const R=7, inv=1/(R*2+1);
  for(let x=0;x<VW;x++){
    let sum=0;
    for(let k=-R;k<=R;k++){ const y=clamp(k,0,VH-1); sum+=src[y*VW+x]; }
    for(let y=0;y<VH;y++){
      dst[y*VW+x]=sum*inv;
      const add=clamp(y+R+1,0,VH-1)*VW+x, sub=clamp(y-R,0,VH-1)*VW+x;
      sum+=src[add]-src[sub];
    }
  }
}

// ------------------------------- material simulation -----------------------
function simMaterials(){
  const camY=Math.floor(G.camY);
  const y0=Math.max(1, camY-10), y1=Math.min(H-2, camY+VH+12);
  G.pendingExplosions.length=0;
  const f=G.frame;
  for(let y=y1;y>=y0;y--){
    const flip = ((y + f) & 1)===0;
    for(let k=0;k<W;k++){
      const x = flip ? k : (W-1-k);
      const i=y*W+x;
      const m=cells[i];
      if(m===AIR) continue;
      const cat=MCAT[m];
      if(cat===SOLID) continue;
      const below = (y+1<H)? i+W : -1;
      const above = (y-1>=0)? i-W : -1;

      if(cat===POWDER){
        if(below>=0){ const bm=cells[below]; const bc=MCAT[bm];
          if(bc===AIR||bc===GAS||bc===LIQ){ swp(i,below); continue; } }
        // diagonal
        const dir = (hash2(x,y)>0.5)?1:-1;
        for(let s=0;s<2;s++){
          const d = s===0?dir:-dir; const nx=x+d;
          if(nx<0||nx>=W) continue; const di=below + d;
          if(di<0||di>=cells.length) continue; const dm=cells[di]; const dc=MCAT[dm];
          if(dc===AIR||dc===GAS||dc===LIQ){ swp(i,di); break; }
        }
        if(m===GUN){ checkIgnite(x,y); }
        continue;
      }

      if(cat===LIQ){
        if(m===LAVA){ if(reactLava(x,y)) continue; }
        if(m===ACID){ reactAcid(x,y); }
        if(m===BLOOD){ if(reactBlood(x,y)) continue; }
        if(m===OIL||m===POISON||m===SLIME){ if(reactLiquidFire(x,y,m)) continue; }
        if(m===POISON && rng()<0.004){ // poison off-gasses
          if(above>=0 && cells[above]===AIR){ cells[above]=PGAS; vari[above]=vari[i]; meta[above]=200; }
        }
        // movement
        if(below>=0){ const bm=cells[below]; const bc=MCAT[bm];
          if(bc===AIR||bc===GAS){ swp(i,below); continue; }
          if(bc===LIQ && M[bm].dens < M[m].dens){ swp(i,below); continue; } }
        const dir = (meta[i]&1)?1:-1;
        let moved=false;
        for(let s=0;s<2 && !moved;s++){
          const d = s===0?dir:-dir; const nx=x+d;
          if(nx<0||nx>=W) continue;
          const ni = y*W+nx; const nm=cells[ni]; const nc=MCAT[nm];
          if(nc===AIR||nc===GAS || (nc===LIQ && M[nm].dens<M[m].dens && rng()<0.3)){
            swp(i,ni); moved=true;
            // try to flow further (spread)
            const ni2=(y)*W + (nx+d);
            if(nx+d>=0&&nx+d<W){ const nm2=cells[ni2]; if(MCAT[nm2]===AIR){ swp(ni,ni2); } }
          }
        }
        if(!moved){ meta[i]^=1; }
        continue;
      }

      if(cat===GAS){
        let life=meta[i];
        if(above>=0){ const am=cells[above]; const ac=MCAT[am];
          if(ac===AIR){ swp(i,above); }
          else { const dir=(hash2(x+7,y)>0.5)?1:-1;
            const nx=x+dir; if(nx>=0&&nx<W){ const ni=(y)*W+nx; if(cells[ni]===AIR) swp(i,ni); } }
        }
        if(m===FLAM){ if(checkIgnite(x,y)) continue; }
        life--; meta[i]=life;
        if(life<=0){
          if(m===STEAM && cells[i]===STEAM){ cells[i]= (above>=0 && MCAT[cells[above]]===SOLID && rng()<0.25)?WATER:AIR; }
          else cells[i]=AIR;
        }
        continue;
      }

      if(cat===CFIRE){
        // spread & reactions
        for(let d=0;d<4;d++){
          const nx=x+(d===0?-1:d===1?1:0), ny=y+(d===2?-1:d===3?1:0);
          if(nx<0||nx>=W||ny<0||ny>=H) continue;
          const ni=ny*W+nx, nm=cells[ni];
          if(nm===WATER){ cells[i]=STEAM; vari[i]=vari[i]; meta[i]=120; cells[ni]=STEAM; meta[ni]=120; break; }
          if(nm===ICE||nm===SNOW){ cells[ni]= rng()<0.5?WATER:STEAM; }
          else { const fd=M[nm].flamm;
            if(fd>0 && rng()<fd*0.25){ cells[ni]=FIRE; meta[ni]=rint(40,90); vari[ni]=vari[ni]; }
          }
        }
        let life=meta[i]; life--; meta[i]=life;
        if(life<=0){ cells[i]= rng()<0.5?SMOKE:AIR; if(cells[i]===SMOKE) meta[i]=rint(40,90); }
        continue;
      }
    }
  }
  // process gunpowder chain explosions
  if(G.pendingExplosions.length){
    for(const e of G.pendingExplosions){ explode(e.x,e.y, 16, 1.2, {dig:true}); }
  }
}
function checkIgnite(x,y){
  // gunpowder / flammable gas adjacent to fire/lava -> explode/ignite
  for(let d=0;d<4;d++){
    const nx=x+(d===0?-1:d===1?1:0), ny=y+(d===2?-1:d===3?1:0);
    if(nx<0||nx>=W||ny<0||ny>=H) continue;
    const nm=get(nx,ny);
    if(nm===FIRE||nm===LAVA){
      const here=get(x,y);
      if(here===GUN){ G.pendingExplosions.push({x,y}); put(x,y,AIR); return true; }
      if(here===FLAM){ put(x,y,FIRE); meta[idx(x,y)]=rint(30,60); return true; }
    }
  }
  return false;
}
function reactLava(x,y){
  let reacted=false;
  for(let d=0;d<4;d++){
    const nx=x+(d===0?-1:d===1?1:0), ny=y+(d===2?-1:d===3?1:0);
    if(nx<0||nx>=W||ny<0||ny>=H) continue;
    const nm=get(nx,ny); const i=y*W+x;
    if(nm===WATER||nm===ICE||nm===SNOW){
      if(rng()<0.5){ cells[i]=ROCK; vari[i]=(Math.random()*255)|0; }
      put(nx,ny,STEAM); meta[ny*W+nx]=120; reacted=true;
    } else if(nm===SAND){ put(nx,ny,GLASS); reacted=true; }
    else if(M[nm].flamm>0 && rng()<0.3){ put(nx,ny,FIRE); meta[ny*W+nx]=rint(30,70); reacted=true; }
    else if(nm===OIL && rng()<0.4){ put(nx,ny,FIRE); meta[ny*W+nx]=rint(30,70); reacted=true; }
  }
  return reacted;
}
function reactAcid(x,y){
  for(let d=0;d<4;d++){
    const nx=x+(d===0?-1:d===1?1:0), ny=y+(d===2?-1:d===3?1:0);
    if(nx<0||nx>=W||ny<0||ny>=H) continue;
    const nm=get(nx,ny);
    if(M[nm].acid && rng()<0.06){ put(nx,ny, rng()<0.15?SMOKE:AIR); }
  }
}
function reactBlood(x,y){
  for(let d=0;d<4;d++){
    const nx=x+(d===0?-1:d===1?1:0), ny=y+(d===2?-1:d===3?1:0);
    if(nx<0||nx>=W||ny<0||ny>=H) continue;
    const nm=get(nx,ny);
    if(nm===POISON||nm===PGAS){ const i=y*W+x; cells[i]=SLIME; put(nx,ny,AIR); return true; }
  }
  return false;
}
function reactLiquidFire(x,y,m){
  // oil/slime/poison ignite from adjacent fire/lava
  for(let d=0;d<4;d++){
    const nx=x+(d===0?-1:d===1?1:0), ny=y+(d===2?-1:d===3?1:0);
    if(nx<0||nx>=W||ny<0||ny>=H) continue;
    const nm=get(nx,ny);
    if((nm===FIRE||nm===LAVA) && M[m].flamm>0 && rng()<0.15){ put(x,y,FIRE); meta[idx(x,y)]=rint(30,60); return true; }
  }
  return false;
}

// ------------------------------- physics / collision -----------------------
function solidRect(x,y,w,h){
  const l=Math.floor(x-w/2), r=Math.floor(x+w/2), t=Math.floor(y-h/2), b=Math.floor(y+h/2);
  for(let yy=t;yy<=b;yy++) for(let xx=l;xx<=r;xx++) if(isSolid(get(xx,yy))) return true;
  return false;
}
function moveBody(o,dx,dy){
  let hitX=false,hitY=false;
  if(dx){ const nx=o.x+dx; if(!solidRect(nx,o.y,o.w,o.h)) o.x=nx; else { hitX=true; o.vx=0; } }
  if(dy){ const ny=o.y+dy; if(!solidRect(o.x,ny,o.w,o.h)) o.y=ny; else { hitY=true; if(dy>0) o.vy=0; } }
  return {hitX,hitY};
}

// ------------------------------- player update -----------------------------
const keys={};
let pointer={x:VW/2,y:VH/2,down:false,active:false};
let touchAim=null;
function updatePlayer(){
  const pl=G.player;
  if(pl.dead) return;
  pl.anim++;
  const left=keys['a']||keys['ArrowLeft']||keys.__left;
  const right=keys['d']||keys['ArrowRight']||keys.__right;
  const jump=keys['w']||keys['ArrowUp']||keys[' ']||keys.__jump;
  let accel=(right?1:0)-(left?1:0);
  const speedMul = (G.perk.haste?1.35:1);
  if(accel){ pl.vx += accel*0.16*speedMul; pl.dir=accel; }
  if(G.perk.oily&&pl.oily>0) pl.vx*=0.94; else pl.vx*=0.80;
  pl.vx=clamp(pl.vx,-1.6,1.6);
  pl.onGround = solidRect(pl.x, pl.y+pl.h/2+1, pl.w, 2);
  if(jump && pl.onGround){ pl.vy=-3.2; pl.onGround=false; sfx('jump'); }
  const hovering = jump && !pl.onGround;
  if(hovering && pl.hover>0){ pl.vy=Math.min(pl.vy, 0.25); pl.hover -= (G.perk.levitate?0.5:0.75); }
  else { pl.vy += GRAV; pl.hover=Math.min(pl.maxHover, pl.hover+(G.perk.levitate?0.5:0.26)); }
  pl.vy=clamp(pl.vy,-4.2,MAXFALL);
  moveBody(pl, pl.vx, 0);
  const vy=moveBody(pl, 0, pl.vy);
  // in liquid: swim
  const inLiq = MCAT[get(pl.x, pl.y)]===LIQ;
  if(inLiq){ pl.vy*=0.86; if(jump) pl.vy-=0.12; }
  if(pl.inv>0) pl.inv--;
  if(pl.kickCd>0) pl.kickCd--;
  // status timers
  if(pl.burning>0){ pl.burning--; if(pl.wet>0){pl.burning=Math.max(0,pl.burning-3);} }
  if(pl.poison>0) pl.poison--;
  if(pl.toxic>0) pl.toxic--;
  if(pl.berserk>0) pl.berserk--;
  if(pl.haste>0) pl.haste--;
  if(pl.regen>0){ pl.hp=Math.min(pl.maxHp, pl.hp+pl.maxHp*0.0012); pl.regen--; }
  if(pl.wet>0) pl.wet--;
  if(pl.oily>0) pl.oily--;
  // wand mana recharge + timers
  for(const w of G.wands){
    w.mana=Math.min(w.manaMax, w.mana + w.regen/60 * (G.perk.manaregen?2:1));
    if(w.timer>0) w.timer--;
    if(w.castCd>0) w.castCd--;
  }
  // aim
  if(pointer.active){ pl.aimX=pointer.x; pl.aimY=pointer.y; }
  else if(touchAim){ pl.aimX=touchAim.x; pl.aimY=touchAim.y; }
  const adx=pl.aimX-pl.x, ady=(pl.aimY+Math.floor(G.camY))-pl.y;
  pl.dir = adx>=0?1:-1;
  // cast
  const w=G.wands[G.cur];
  if(pointer.down && w && w.castCd<=0 && w.timer<=0){
    const len=Math.hypot(adx,ady)||1;
    castWand(w, pl.x+ (adx/len)*5, pl.y-1, adx/len, ady/len, 'player');
  }
  // material effects
  materialEffects(pl);
  // breath / drowning
  const head = get(pl.x, pl.y-pl.h/2+1);
  const submerged = MCAT[head]===LIQ;
  if(submerged){ G.breath -= 0.008; if(G.breath<=0){ G.breath=0; hurtPlayer(9,'drown','溺死'); G.breath=0.5; } }
  else G.breath=Math.min(1, G.breath+0.02);
  // crush: buried in solids
  let solidCount=0, total=0;
  const l=Math.floor(pl.x-pl.w/2), r=Math.floor(pl.x+pl.w/2), t=Math.floor(pl.y-pl.h/2), b=Math.floor(pl.y+pl.h/2);
  for(let yy=t;yy<=b;yy++) for(let xx=l;xx<=r;xx++){ total++; const cm=MCAT[get(xx,yy)]; if(cm===SOLID||cm===POWDER) solidCount++; }
  if(total>0 && solidCount/total>0.6){ hurtPlayer(4,'crush','压死'); }
}
function materialEffects(o){
  const l=Math.floor(o.x-o.w/2), r=Math.floor(o.x+o.w/2), t=Math.floor(o.y-o.h/2), b=Math.floor(o.y+o.h/2);
  let acid=0,lava=0,fire=0,poison=0,toxic=0,water=0,oil=0,magic=0,magicId=0;
  for(let yy=t;yy<=b;yy++) for(let xx=l;xx<=r;xx++){
    const m=get(xx,yy);
    if(m===ACID)acid++; else if(m===LAVA)lava++; else if(m===FIRE)fire++;
    else if(m===POISON)poison++; else if(m===PGAS||m===TOXIC)toxic++;
    else if(m===WATER)water++; else if(m===OIL)oil++;
    else if(m>=HEAL&&m<=LEVI){ magic++; magicId=m; }
  }
  const isPl=(o===G.player);
  if(acid) hurtPlayer(acid*0.6, 'acid','被强酸腐蚀');
  if(lava) hurtPlayer(lava*0.5, 'lava','烧死');
  if(fire && isPl){ if(o.wet<=0) o.burning=Math.max(o.burning, 90); }
  if(poison && isPl){ o.poison=Math.max(o.poison,120); }
  if(toxic && isPl){ o.toxic=Math.max(o.toxic,120); }
  if(water>2 && isPl){ o.wet=Math.max(o.wet,60); }
  if(oil>2 && isPl){ o.oily=Math.max(o.oily,120); }
  if(magic>2 && isPl) applyMagicStain(magicId);
  // burning / poison damage over time
  if(isPl){
    if(o.burning>0 && G.frame%20===0) hurtPlayer(o.maxHp*0.02, 'fire','烧死');
    if(o.poison>0 && G.frame%40===0) hurtPlayer(o.maxHp*0.02, 'poison','毒死');
    if(o.toxic>0 && G.frame%40===0) hurtPlayer(o.maxHp*0.02, 'toxic','毒死');
  }
}
function applyMagicStain(id){
  const pl=G.player;
  switch(id){
    case HEAL: pl.hp=Math.min(pl.maxHp, pl.hp+1.5); break;
    case MANA: for(const w of G.wands) w.mana=Math.min(w.manaMax,w.mana+3); break;
    case ACCEL: pl.haste=Math.max(pl.haste,180); break;
    case BERSERK: pl.berserk=Math.max(pl.berserk,240); break;
    case LEVI: pl.hover=pl.maxHover; break;
    case TELE: if(G.frame%50===0) teleportPlayerRandom(); break;
    case POLY: if(G.frame%80===0 && pl.polyCd===undefined){ pl.polyCd=200; toast('你变成了绵羊！（暂时）'); } break;
  }
  if(pl.polyCd>0){ pl.polyCd--; }
}

// ------------------------------- enemies update ----------------------------
function updateEnemies(){
  const pl=G.player;
  for(let i=G.enemies.length-1;i>=0;i--){
    const e=G.enemies[i];
    if(e.dead){ G.enemies.splice(i,1); continue; }
    if(e.flash>0) e.flash--;
    e.t++;
    const dx=pl.x-e.x, dy=pl.y-e.y, dist=Math.hypot(dx,dy)||1;
    const aggro = dist<170;
    if(e.type==='walker'){
      e.vy+=GRAV;
      if(aggro){ e.vx += Math.sign(dx)*0.05; e.dir=Math.sign(dx)||e.dir; }
      e.vx*=0.86;
      // hop toward player
      if(aggro && e.t%50===0 && Math.abs(dx)<70 && Math.abs(dy)<40 && solidRect(e.x,e.y+e.h/2+1,e.w,2)) e.vy=-2.6;
      moveBody(e,e.vx,e.vy);
      if(dist<8 && pl.inv<=0) hurtPlayer(7,'melee','被敌人近战击杀');
    } else if(e.type==='shooter'){
      e.vy+=GRAV*0.5;
      if(aggro){ e.vx += (dx>0?0.03:-0.03); e.dir=Math.sign(dx)||e.dir;
        if(Math.abs(dx)<70) e.vx*=-0.4; // keep distance
      }
      e.vx*=0.9; moveBody(e,e.vx,e.vy);
      e.cool--; if(aggro && e.cool<=0 && dist<160){
        const a=Math.atan2(dy,dx);
        for(let q=-1;q<=1;q++){ const aa=a+q*0.12; shootEnemy(e, aa, 2.4, 9, '#ff6f8a'); }
        e.cool=rint(70,120);
      }
    } else if(e.type==='flyer'){
      if(aggro){ const a=Math.atan2(dy,dx)+Math.sin(e.t*0.1+e.phase)*0.5;
        e.vx += Math.cos(a)*0.09; e.vy += Math.sin(a)*0.09; e.dir=Math.sign(dx)||e.dir; }
      e.vx*=0.96; e.vy*=0.96; e.vx=clamp(e.vx,-1.4,1.4); e.vy=clamp(e.vy,-1.4,1.4);
      e.x+=e.vx; e.y+=e.vy;
      if(dist<8 && pl.inv<=0) hurtPlayer(6,'melee','被敌人近战击杀');
    } else if(e.type==='bomber'){
      e.vy+=GRAV;
      if(aggro){ e.vx+=Math.sign(dx)*0.04; e.dir=Math.sign(dx)||e.dir; }
      e.vx*=0.9; moveBody(e,e.vx,e.vy);
      if(dist<18){ if(e.fuse<0){ e.fuse=45; } }
      if(e.fuse>0){ e.fuse--; if(e.fuse===0){ explode(e.x,e.y,18,1.1,{dig:true}); damageEnemy(e, 999,'explosion'); } }
    } else if(e.type==='worm'){
      // dig toward player through soft terrain
      const a=Math.atan2(dy,dx);
      const sp=0.9;
      const nx=e.x+Math.cos(a)*sp, ny=e.y+Math.sin(a)*sp;
      // chew through soft solids
      const gx=Math.floor(nx), gy=Math.floor(ny);
      const gm=get(gx,gy);
      if(MCAT[gm]===SOLID && M[gm].hard<2){ put(gx,gy,AIR); }
      if(!solidRect(nx,ny,e.w,e.h)){ e.x=nx; e.y=ny; }
      if(dist<9 && pl.inv<=0) hurtPlayer(8,'melee','被敌人近战击杀');
    } else if(e.type==='slime'){
      e.vy+=GRAV;
      if(aggro){ e.vx+=Math.sign(dx)*0.03; }
      e.vx*=0.88; moveBody(e,e.vx,e.vy);
      if(Math.abs(dx)<10 && Math.abs(dy)<12){ if(e.t%30===0){ const a=Math.atan2(dy,dx); shootEnemy(e,a,2.2,6,'#7fc24a'); } }
      if(dist<8 && pl.inv<=0) hurtPlayer(5,'melee','被敌人近战击杀');
    } else if(e.type==='boss'){
      // floats, fires patterned volleys
      const homeY = 2960+50;
      e.y += (homeY + Math.sin(e.t*0.02)*20 - e.y)*0.02;
      e.x += Math.sin(e.t*0.015)*0.6;
      e.cool--;
      if(e.cool<=0){
        const burst = 5 + Math.floor((1-e.hp/e.max)*8);
        const base=Math.atan2(dy,dx);
        for(let q=0;q<burst;q++){ shootEnemy(e, base + (q-(burst-1)/2)*0.14, 2.6, 13, '#e07ae0'); }
        // ring burst occasionally
        if(e.t%240<2){ for(let q=0;q<12;q++) shootEnemy(e, q*Math.PI/6, 2.0, 10, '#c86ad8'); }
        e.cool=Math.max(28, 70-Math.floor((1-e.hp/e.max)*40));
      }
      if(dist<20 && pl.inv<=0) hurtPlayer(14,'melee','被终焉之眼灼烧');
    }
    // keep in bounds
    e.x=clamp(e.x,10,W-10); e.y=clamp(e.y,8,H-12);
  }
}
function shootEnemy(e, ang, speed, dmg, color){
  G.projectiles.push({ x:e.x, y:e.y, vx:Math.cos(ang)*speed, vy:Math.sin(ang)*speed,
    life:220, spec:{life:220}, kind:'bolt', owner:'enemy', dmg, speed, rad:2, color, grav:0.02,
    homing:false,bounce:false,explosive:false,fire:false,light:0.4,lightCol:[1,0.4,0.5,0],
    pierce:false,crit:0,trail:0,mat:0,matAmt:0,dig:false,chain:0,heal:false,teleport:false,
    dist:0,spin:false,payload:[],trigger:null,timer:0 });
}

// ------------------------------- projectiles update ------------------------
function updateProjectiles(){
  const pl=G.player;
  for(let i=G.projectiles.length-1;i>=0;i--){
    const p=G.projectiles[i];
    p.life--;
    // homing
    if(p.homing){
      let tgt=null, bd=1e9;
      if(p.owner==='player'){ for(const e of G.enemies){ if(e.dead)continue; const d=Math.hypot(e.x-p.x,e.y-p.y); if(d<bd&&d<130){bd=d;tgt=e;} } }
      else { const d=Math.hypot(pl.x-p.x,pl.y-p.y); if(d<130){tgt=pl;} }
      if(tgt){ const a=Math.atan2(tgt.y-p.y,tgt.x-p.x); const sp=Math.hypot(p.vx,p.vy)||p.speed;
        p.vx += (Math.cos(a)*sp-p.vx)*0.08; p.vy += (Math.sin(a)*sp-p.vy)*0.08; }
    }
    if(p.spin) { /* visual only */ }
    p.vy += p.grav;
    p.x += p.vx; p.y += p.vy;
    // material trail
    if(p.trail && G.frame%(p.trail===FIRE?2:3)===0){
      const tx=p.x|0, ty=p.y|0;
      if(inside(tx,ty) && get(tx,ty)===AIR){ put(tx,ty,p.trail); if(p.trail===FIRE) meta[ty*W+tx]=rint(20,50); }
    }
    if(p.mat && G.frame%2===0){
      for(let k=0;k<p.matAmt;k++){ const tx=(p.x+rint(-1,1))|0, ty=(p.y+rint(-1,1))|0; if(inside(tx,ty)&&get(tx,ty)===AIR) put(tx,ty,p.mat); }
    }
    // timer trigger
    if(p.trigger==='timer'){ p.timer--; if(p.timer<=0){ releasePayload(p); G.projectiles.splice(i,1); continue; } }
    // out of bounds
    if(p.x<2||p.x>W-2||p.y<2||p.y>H-2||p.life<=0){
      if(p.explosive) explode(p.x|0,p.y|0,p.rad||10,1.0,{dig:true});
      else releasePayload(p);
      G.projectiles.splice(i,1); continue;
    }
    // terrain collision
    if(isSolid(get(p.x,p.y)) || MCAT[get(p.x,p.y)]===LIQ){
      if(p.bounce && p.life>15){ // bounce
        const sx=Math.sign(p.vx)||1, sy=Math.sign(p.vy)||1;
        if(isSolid(get(p.x+sx,p.y))) p.vx*=-0.8; if(isSolid(get(p.x,p.y+sy))) p.vy*=-0.8;
        p.x-=p.vx*0.5; p.y-=p.vy*0.5;
      } else {
        impactProjectile(p, p.x|0, p.y|0);
        G.projectiles.splice(i,1); continue;
      }
    }
    // entity collision
    if(p.owner==='enemy'){
      if(Math.abs(p.x-pl.x)<pl.w/2+1 && Math.abs(p.y-pl.y)<pl.h/2+1){
        hurtPlayer(p.dmg, 'spell','被敌方法术击中'); impactFx(p); G.projectiles.splice(i,1); continue;
      }
    } else {
      for(const e of G.enemies){
        if(e.dead) continue;
        if(Math.abs(p.x-e.x)<e.w/2+1 && Math.abs(p.y-e.y)<e.h/2+1){
          let dmg=p.dmg;
          if(p.crit && rng()<p.crit) dmg*=3;
          if(p.heal){ damageEnemy(e, -dmg, 'spell'); }  // heals enemies
          else damageEnemy(e, dmg, 'spell');
          if(p.chain){ // chain lightning
            let src=e, hit=new Set([e]);
            for(let c=0;c<p.chain;c++){ let best=null,bd=44; for(const o of G.enemies){ if(o.dead||hit.has(o))continue; const d=Math.hypot(o.x-src.x,o.y-src.y); if(d<bd){bd=d;best=o;} } if(!best)break; hit.add(best); damageEnemy(best,dmg*0.5,'spell'); src=best; }
          }
          if(p.pierce){ if(!p.hitSet) p.hitSet=new Set(); if(p.hitSet.has(e)){ continue; } p.hitSet.add(e); if(p.payload.length||p.trigger) releasePayload(p); continue; }
          impactProjectile(p, p.x|0, p.y|0);
          G.projectiles.splice(i,1); break;
        }
      }
      // friendly fire: player's own explosive/heal can hit self
      if(p.explosive && Math.abs(p.x-pl.x)<3 && Math.abs(p.y-pl.y)<4 && p.life<p.spec.life-6){ /* let explosion handle */ }
    }
  }
}
function impactFx(p){ for(let k=0;k<4;k++) G.particles.push({x:p.x,y:p.y,vx:rng()-0.5,vy:rng()-0.5,life:8,max:8,color:p.color,size:1}); }
function impactProjectile(p,x,y){
  if(p.teleport){
    // teleport the caster toward impact point
    const caster = p.owner==='player'?G.player:null;
    if(caster){ const a=Math.atan2(p.y-caster.y,p.x-caster.x); const d=Math.min(p.dist, Math.hypot(p.x-caster.x,p.y-caster.y));
      let tx=caster.x+Math.cos(a)*d, ty=caster.y+Math.sin(a)*d;
      // step until blocked
      for(let s=d;s>0;s-=2){ const cx=caster.x+Math.cos(a)*s, cy=caster.y+Math.sin(a)*s; if(!solidRect(cx,cy,caster.w,caster.h)){tx=cx;ty=cy;} else break; }
      for(let k=0;k<12;k++) G.particles.push({x:caster.x,y:caster.y,vx:rng()-0.5,vy:rng()-0.5,life:14,max:14,color:'#b9a6ff',size:1});
      caster.x=tx; caster.y=ty;
      for(let k=0;k<12;k++) G.particles.push({x:tx,y:ty,vx:rng()-0.5,vy:rng()-0.5,life:14,max:14,color:'#b9a6ff',size:1});
      sfx('tele');
    }
    return;
  }
  if(p.heal){
    // heal player if own projectile loops back (rare) — heal hit enemies already handled
    if(p.owner==='enemy'){ /* noop */ }
    return;
  }
  if(p.kind==='drill'){
    // dig soft terrain in a small radius
    for(let yy=-p.rad;yy<=p.rad;yy++) for(let xx=-p.rad;xx<=p.rad;xx++){
      const gx=x+xx,gy=y+yy; if(!inside(gx,gy))continue; const gm=get(gx,gy);
      if(MCAT[gm]===SOLID && M[gm].hard<2) put(gx,gy,AIR);
      else if(MCAT[gm]===LIQ) put(gx,gy, gm===LAVA?AIR:STEAM);
    }
    impactFx(p); return;
  }
  if(p.explosive){ explode(x,y,p.rad||10, (p.spec.dmg||10)*0.12+0.8, {dig:!!p.spec.dig||p.kind==='bomb'}); releasePayload(p); return; }
  if(p.fire){ for(let k=0;k<3;k++){ const gx=x+rint(-1,1),gy=y+rint(-1,1); if(inside(gx,gy)&&get(gx,gy)===AIR){put(gx,gy,FIRE); meta[gy*W+gx]=rint(20,45);} } }
  releasePayload(p);
  impactFx(p);
}
function releasePayload(p){
  if(!p.payload||!p.payload.length) return;
  for(const pay of p.payload){
    const spec=pay.spec; if(!spec) continue;
    const a=rng()*Math.PI*2;
    for(let c=0;c<(pay.count||1);c++){
      const aa=a+(c-(pay.count-1)/2)*0.2;
      spawnProjectile(p.x,p.y,Math.cos(aa)*(spec.speed||3),Math.sin(aa)*(spec.speed||3),spec,pay.mods||newShotMods(),p.owner,null);
    }
  }
}
function newShotMods(){ return {dmg:1,speed:1,spread:0,rad:0,homing:false,bounce:false,explosive:false,fire:false,light:0,pierce:false,crit:0}; }

// ------------------------------- pickups / chests --------------------------
function updatePickups(){
  const pl=G.player;
  for(let i=G.pickups.length-1;i>=0;i--){
    const p=G.pickups[i];
    p.vy += 0.06; p.x+=p.vx; p.y+=p.vy; p.vx*=0.98;
    if(MCAT[get(p.x,p.y+2)]===SOLID){ p.vy*=-0.2; p.y-=1; p.vx*=0.7; }
    if(Math.abs(p.x-pl.x)<7 && Math.abs(p.y-pl.y)<8){
      if(p.type==='gold'){ G.gold+=p.val; toast(`+${p.val} 金币`); sfx('coin'); }
      else if(p.type==='heart'){ pl.hp=Math.min(pl.maxHp, pl.hp+25); toast('+25 生命'); sfx('heal'); }
      else if(p.type==='spell'){ addSpellToInventory(p.spell); toast(`拾取法术：${spellLabel(p.spell)}`); sfx('spell'); }
      G.pickups.splice(i,1);
    }
  }
  for(const c of G.chests){
    if(c.opened) continue;
    if(Math.abs(c.x-pl.x)<8 && Math.abs(c.y-pl.y)<10){
      c.opened=true;
      const rolls=rint(2,4);
      for(let k=0;k<rolls;k++){
        const r=rng();
        if(r<0.5) G.pickups.push({type:'gold',x:c.x+rint(-6,6),y:c.y-6,vx:rng()-0.5,vy:-1.5,val:rint(10,40)});
        else if(r<0.8) G.pickups.push({type:'spell',x:c.x+rint(-6,6),y:c.y-6,vx:rng()-0.5,vy:-1.5,spell:randomSpell()});
        else G.pickups.push({type:'heart',x:c.x+rint(-6,6),y:c.y-6,vx:rng()-0.5,vy:-1.5});
      }
      toast('打开宝箱！'); sfx('chest'); addShake(2);
    }
  }
  for(let i=G.dropped.length-1;i>=0;i--){
    const d=G.dropped[i]; d.t++;
    d.vy+=0.05; d.y+=d.vy; d.x+=d.vx;
    if(MCAT[get(d.x,d.y+3)]===SOLID){ d.vy=0; d.y=Math.floor(d.y); }
    if(Math.abs(d.x-pl.x)<8 && Math.abs(d.y-pl.y)<9){
      if(G.wands.length<4){ G.wands.push(d.wand); toast(`获得魔杖：${d.wand.name}`); }
      else { G.dropped.push({wand:G.wands[G.cur], x:pl.x, y:pl.y-4, vx:0,vy:-1, t:0}); G.wands[G.cur]=d.wand; toast(`替换魔杖：${d.wand.name}`); }
      sfx('spell'); G.dropped.splice(i,1);
    }
  }
}
let inventory=[]; // collected spells to place into wands
function addSpellToInventory(id){ inventory.push(id); if(inventory.length>12) inventory.shift(); }

// ------------------------------- particles ---------------------------------
function updateParticles(){
  for(let i=G.particles.length-1;i>=0;i--){
    const p=G.particles[i];
    p.life--;
    if(p.kind==='txt'){ p.y+=p.vy; }
    else if(p.kind==='flash'){ /* stays */ }
    else { p.x+=p.vx; p.y+=p.vy; p.vy+=0.05; p.vx*=0.96; }
    if(p.life<=0) G.particles.splice(i,1);
  }
}

// ------------------------------- holy mountain / perks ---------------------
function checkHoly(){
  const pl=G.player;
  for(let k=0;k<G.holy.length;k++){
    const h=G.holy[k];
    if(pl.y>=h.y0 && pl.y<h.y1 && !G.holySeen.has(k)){
      G.holySeen.add(k);
      if(!h.claimed && pl.x>h.altarX-24){ h.claimed=true; offerPerks(); }
    }
  }
}
const PERK_DEFS=[
  {name:'血肉护甲', desc:'受到的所有伤害降低 40%。', apply:()=>{G.perk.resist=true;}},
  {name:'玻璃大炮', desc:'法术伤害翻倍，但最大生命减半。', apply:()=>{G.perk.power=true; G.player.maxHp=Math.max(20,Math.floor(G.player.maxHp/2)); G.player.hp=Math.min(G.player.hp,G.player.maxHp);}},
  {name:'暴击直觉', desc:'法术有 25% 概率造成三倍伤害。', apply:()=>{G.perk.crit=0.25;}},
  {name:'长久飞行', desc:'悬浮燃料回复与上限大幅提升。', apply:()=>{G.perk.levitate=true; G.player.maxHover=160; G.player.hover=160;}},
  {name:'魔力涌动', desc:'所有魔杖回蓝速度翻倍。', apply:()=>{G.perk.manaregen=true;}},
  {name:'炼金之血', desc:'靠近熔岩/魔法液时获得增益，死亡敌人额外掉金。', apply:()=>{G.perk.alchemy=true;}},
  {name:'魔杖工匠', desc:'可在任何地方编辑魔杖。', apply:()=>{G.perk.tinker=true;}},
  {name:'狂怒之血', desc:'触碰狂怒液永久提升近战与法术（本局）。', apply:()=>{G.perk.berserkActive=true;}},
  {name:'迅捷步伐', desc:'移动速度提升 35%。', apply:()=>{G.perk.haste=true;}},
];
function offerPerks(){
  const pool=PERK_DEFS.slice();
  G.perkChoices=[];
  for(let i=0;i<3 && pool.length;i++){ G.perkChoices.push(pool.splice(rint(0,pool.length-1),1)[0]); }
  renderPerks();
  G.mode='perk';
}
function choosePerk(i){
  const p=G.perkChoices[i]; if(!p) return;
  p.apply(); toast(`获得祝福：${p.name}`); sfx('perk');
  G.perkChoices=[]; G.mode='play';
  document.getElementById('perkPanel').classList.add('hide');
}

// ------------------------------- rendering ---------------------------------
const offscreen = document.createElement('canvas'); offscreen.width=VW; offscreen.height=VH;
// (we render straight into main canvas ImageData)
function render(){
  computeLighting();
  const camY=Math.floor(G.camY);
  const b=biomeAt(camY+VH/2);
  const bgR=parseInt(b.bg.slice(1,3),16), bgG=parseInt(b.bg.slice(3,5),16), bgB=parseInt(b.bg.slice(5,7),16);
  for(let sy=0;sy<VH;sy++){
    const wy=sy+camY; const inb = wy>=0&&wy<H;
    const row = inb? wy*W : -1; const orow=sy*VW;
    for(let x=0;x<VW;x++){
      const o=(orow+x)*4;
      const lr=lR[orow+x], lg=lG[orow+x], lb=lB[orow+x];
      const fr=AMB+lr, fg=AMB+lg, fb=AMB+lb;
      if(!inb){ px[o]=bgR*fr; px[o+1]=bgG*fg; px[o+2]=bgB*fb; px[o+3]=255; continue; }
      const m=cells[row+x];
      if(m===AIR){ px[o]=bgR*fr; px[o+1]=bgG*fg; px[o+2]=bgB*fb; px[o+3]=255; continue; }
      const rgb=MATRGB[m]; const v=vari[row+x];
      const n=rgb.length/3; const s=(v & (n-1))*3;
      let r=rgb[s]*fr, g=rgb[s+1]*fg, bl=rgb[s+2]*fb;
      const em=M[m].emiss;
      if(em){ r+=em[0]*em[3]*255*0.5; g+=em[1]*em[3]*255*0.5; bl+=em[2]*em[3]*255*0.5; }
      px[o]= r>255?255:r; px[o+1]= g>255?255:g; px[o+2]= bl>255?255:bl; px[o+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  // ---- vector overlay (entities, fx) in device pixels ----
  const ox=G.shakeX, oy=G.shakeY;
  ctx.save(); ctx.translate(ox,oy);
  // pickups
  for(const p of G.pickups){ const sy=p.y-camY; if(sy<-6||sy>VH+6)continue;
    if(p.type==='gold'){ ctx.fillStyle='#f4ca53'; ctx.fillRect(p.x-2,sy-2,4,4); ctx.fillStyle='#fff6c0'; ctx.fillRect(p.x-1,sy-3,1,1); }
    else if(p.type==='heart'){ ctx.fillStyle='#e05a6b'; ctx.fillRect(p.x-2,sy-2,4,3); ctx.fillRect(p.x-1,sy-3,2,5); }
    else { ctx.fillStyle='#a98aff'; ctx.fillRect(p.x-2,sy-2,4,4); ctx.fillStyle='#e6dcff'; ctx.fillRect(p.x-1,sy-1,2,2); }
  }
  // dropped wands (gold sparkle)
  for(const d of G.dropped){ const sy=d.y-camY; if(sy<-8||sy>VH+8)continue;
    ctx.fillStyle='#8a6a2a'; ctx.fillRect(d.x-1,sy-3,2,7); ctx.fillStyle='#f2c85b'; ctx.fillRect(d.x-2,sy-5,4,2);
    if((d.t>>3)&1){ ctx.fillStyle='#fff2a0'; ctx.fillRect(d.x-3,sy-7,1,1); ctx.fillRect(d.x+3,sy-6,1,1); }
  }
  // chests
  for(const c of G.chests){ const sy=c.y-camY; if(sy<-8||sy>VH+8)continue;
    ctx.fillStyle=c.opened?'#5a4326':'#7a5533'; ctx.fillRect(c.x-5,sy-4,10,8);
    ctx.fillStyle='#f2c85b'; ctx.fillRect(c.x-5,sy-2,10,1);
  }
  // projectiles with glow
  for(const p of G.projectiles){ const sy=p.y-camY; if(sy<-10||sy>VH+10)continue;
    if(p.light>0){ const g=ctx.createRadialGradient(p.x,sy,0,p.x,sy,10); const c=p.lightCol;
      g.addColorStop(0,`rgba(${(c[0]*255)|0},${(c[1]*255)|0},${(c[2]*255)|0},${Math.min(0.9,p.light)})`); g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(p.x,sy,10,0,6.283); ctx.fill(); }
    ctx.fillStyle=p.color; const sz=p.kind==='lightning'?2:2; ctx.fillRect(p.x-sz,sy-sz,sz*2,sz*2);
    ctx.fillStyle='#fff'; ctx.fillRect(p.x-1,sy-1,2,2);
  }
  // enemies
  for(const e of G.enemies){ const sy=e.y-camY; if(sy<-14||sy>VH+14)continue; drawEnemy(e,sy); }
  // particles
  for(const p of G.particles){ const sy=p.y-camY; if(sy<-8||sy>VH+8)continue;
    if(p.kind==='flash'){ const a=p.life/p.max; ctx.globalAlpha=a; ctx.strokeStyle=p.color; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(p.x,sy,p.rad*(1.1-a),0,6.283); ctx.stroke(); ctx.globalAlpha=1; }
    else if(p.kind==='txt'){ ctx.globalAlpha=Math.min(1,p.life/8); ctx.fillStyle=p.color; ctx.font='7px monospace'; ctx.textAlign='center'; ctx.fillText(p.txt,p.x,sy); ctx.globalAlpha=1; }
    else { ctx.globalAlpha=Math.min(1,p.life/p.max+0.2); ctx.fillStyle=p.color; ctx.fillRect(p.x|0,sy|0,1,1); ctx.globalAlpha=1; }
  }
  // player
  if(G.player && !G.player.dead) drawPlayer(G.player, G.player.y-camY);
  // crosshair
  if(pointer.active){ ctx.strokeStyle='#ffffff88'; ctx.lineWidth=1; const cx=pointer.x, cy=pointer.y;
    ctx.beginPath(); ctx.moveTo(cx-4,cy); ctx.lineTo(cx+4,cy); ctx.moveTo(cx,cy-4); ctx.lineTo(cx,cy+4); ctx.stroke(); }
  ctx.restore();
}
function drawPlayer(pl, sy){
  const x=Math.round(pl.x);
  ctx.save(); ctx.translate(x, Math.round(sy));
  if(pl.inv>0 && (pl.inv>>1)&1) ctx.globalAlpha=0.5;
  if(pl.burning>0){ ctx.fillStyle='#ff8a3a'; ctx.globalAlpha*=0.8; ctx.fillRect(-4,-8,8,12); ctx.globalAlpha=pl.inv>0?0.5:1; }
  // robe
  ctx.fillStyle=pl.polyCd>0?'#e8e8f0':'#6a5aa8'; ctx.fillRect(-3,-4,6,8);
  // head
  ctx.fillStyle='#e9c9a8'; ctx.fillRect(-2,-8,4,4);
  // hat
  ctx.fillStyle='#8a5aa8'; ctx.fillRect(-3,-10,6,2); ctx.fillRect(-1,-12,2,2);
  // eyes
  ctx.fillStyle='#222'; ctx.fillRect(pl.dir>0?0:-1,-7,1,1);
  // wand arm
  ctx.fillStyle='#c9a24a'; ctx.fillRect(pl.dir>0?2:-4,-3,2,2);
  ctx.restore();
}
function drawEnemy(e, sy){
  const x=Math.round(e.x), y=Math.round(sy);
  ctx.save(); ctx.translate(x,y);
  const flash = e.flash>0;
  const col = flash?'#ffffff':ENEMY_DEF[e.type].color;
  if(e.type==='walker'){
    ctx.fillStyle=col; ctx.fillRect(-3,-6,6,11); ctx.fillStyle=flash?'#fff':'#20222e'; ctx.fillRect(-2,-4,4,3);
    ctx.fillStyle='#e04a3a'; ctx.fillRect(e.dir>0?1:-2,-5,1,1);
  } else if(e.type==='shooter'){
    ctx.fillStyle=col; ctx.fillRect(-3,-5,6,10); ctx.fillStyle=flash?'#fff':'#f2d56f'; ctx.fillRect(e.dir>0?2:-4,-2,3,2);
    ctx.fillStyle='#5af0a0'; ctx.fillRect(-2,-8,4,3);
  } else if(e.type==='flyer'){
    ctx.fillStyle=col; ctx.fillRect(-3,-3,6,5); const f=(e.t>>2)&1;
    ctx.fillRect(-6,-2+f,3,2); ctx.fillRect(3,-2+(1-f),3,2);
    ctx.fillStyle='#ffe08a'; ctx.fillRect(e.dir>0?1:-2,-2,1,1);
  } else if(e.type==='bomber'){
    const blink = e.fuse>0 && ((e.fuse>>2)&1);
    ctx.fillStyle=blink?'#fff':col; ctx.fillRect(-4,-4,8,8);
    ctx.fillStyle='#3a2a1a'; ctx.fillRect(-2,-2,4,4);
    ctx.fillStyle=blink?'#f00':'#ffcf5a'; ctx.fillRect(-1,-1,2,2);
  } else if(e.type==='worm'){
    ctx.fillStyle=col; for(let s=0;s<4;s++){ const a=e.t*0.2+s; ctx.fillRect(Math.cos(a)*3-1, Math.sin(a)*2-1, 3,3); }
    ctx.fillStyle='#ffe08a'; ctx.fillRect(e.dir>0?2:-3,-1,1,1);
  } else if(e.type==='slime'){
    ctx.fillStyle=col; ctx.fillRect(-4,-3,8,6); ctx.fillRect(-3,-5,6,2);
    ctx.fillStyle='#cfa'; ctx.fillRect(-2,-4,1,1); ctx.fillRect(1,-4,1,1);
  } else if(e.type==='boss'){
    // three-eye
    ctx.fillStyle=flash?'#fff':'#5a2a5a'; ctx.beginPath(); ctx.arc(0,0,11,0,6.283); ctx.fill();
    ctx.fillStyle=flash?'#fff':'#8a3a8a'; ctx.beginPath(); ctx.arc(0,0,8,0,6.283); ctx.fill();
    const eyes=[[-4,-2],[4,-2],[0,4]];
    for(const ey of eyes){ ctx.fillStyle='#fff29c'; ctx.beginPath(); ctx.arc(ey[0],ey[1],2.4,0,6.283); ctx.fill();
      ctx.fillStyle='#3a0a2a'; ctx.beginPath(); ctx.arc(ey[0]+Math.sign(pl_dx(e))*0.6,ey[1],1.1,0,6.283); ctx.fill(); }
  }
  ctx.restore();
  if(e.hp<e.max){ const w=e.w+4; ctx.fillStyle='#151522'; ctx.fillRect(x-w/2,y-e.h/2-5,w,2); ctx.fillStyle='#df6871'; ctx.fillRect(x-w/2,y-e.h/2-5,w*(e.hp/e.max),2); }
}
function pl_dx(e){ return (G.player.x-e.x)>=0?1:-1; }

// ------------------------------- HUD / UI ----------------------------------
const $=id=>document.getElementById(id);
function updateHud(){
  const pl=G.player, w=G.wands[G.cur];
  $('hpFill').style.width = clamp(pl.hp/pl.maxHp,0,1)*100+'%';
  $('manaFill').style.width = w?clamp(w.mana/w.manaMax,0,1)*100+'%':'0%';
  $('hoverFill').style.width = clamp(pl.hover/pl.maxHover,0,1)*100+'%';
  $('breathFill').style.width = clamp(G.breath,0,1)*100+'%';
  $('hpText').textContent = `${Math.ceil(Math.max(0,pl.hp))}/${pl.maxHp}`;
  $('manaText').textContent = w?`${Math.floor(w.mana)}/${w.manaMax}`:'-';
  $('depth').textContent = `${Math.floor(pl.y)}m`;
  $('gold').textContent = `${G.gold} 金币`;
  $('biome').textContent = biomeAt(pl.y).name;
  // status icons
  const st=[]; if(pl.burning>0)st.push('🔥燃烧'); if(pl.wet>0)st.push('💧潮湿'); if(pl.oily>0)st.push('🛢油污');
  if(pl.poison>0)st.push('☠中毒'); if(pl.toxic>0)st.push('☢毒素'); if(pl.haste>0)st.push('⚡迅捷'); if(pl.berserk>0)st.push('😡狂怒');
  $('status').textContent = st.join(' ');
  // wand chips
  let html='';
  G.wands.forEach((wd,i)=>{
    html+=`<div class="wand-chip ${i===G.cur?'active':''}"><b>${i+1}·${wd.name}</b><span>${wd.timer>0?'充能中':'就绪'} ${Math.floor(wd.mana)}/${wd.manaMax}</span><div class="slotdots">${wd.slots.map(s=>s?`<s class="on" title="${spellLabel(s.id)}"></s>`:`<s style="background:#2a3040"></s>`).join('')}</div></div>`;
  });
  $('wandHud').innerHTML=html;
}
let toastTimer=0;
function toast(t){ const el=$('toast'); el.textContent=t; el.style.opacity=1; toastTimer=100; }

function showDeath(cause){
  $('deadReason').textContent = `死因：${cause}`;
  $('runStats').textContent = `深入 ${Math.floor(G.player.y)}m · 击杀 ${G.kills} · 金币 ${G.gold} · 存活 ${(G.playTime/60).toFixed(0)}s`;
  $('dead').classList.remove('hide');
}
function showWin(){
  $('winStats').textContent = `击败终焉之眼 · 金币 ${G.gold} · 击杀 ${G.kills} · 用时 ${(G.playTime/60).toFixed(0)}s`;
  $('win').classList.remove('hide');
}

// ------------------------------- wand editor UI ----------------------------
function renderWands(){
  if(G.mode!=='edit' && G.mode!=='play') return;
  const canEdit = G.editMode;
  let palette='';
  const group=(title,ids)=>`<div class="pal-group"><h4>${title}</h4><div class="pal-row">${ids.map(id=>`<button class="pal-spell ${G.editorSel&&G.editorSel.id===id&&G.editorSel.from==='palette'?'sel':''}" data-id="${id}" draggable="true"><span class="dot" style="background:${(SPELLS[id]||MODS[id]||TRIGGERS[id]).color}"></span>${spellLabel(id)}<i>${(SPELLS[id]?.cost??MODS[id]?.cost??TRIGGERS[id]?.cost??0)}</i></button>`).join('')}</div></div>`;
  palette = group('弹体 PROJECTILE', ALL_SPELL_IDS) + group('修饰 MODIFIER', ALL_MOD_IDS) + group('触发 TRIGGER', Object.keys(TRIGGERS));
  const inv = inventory.length? `<div class="pal-group"><h4>背包 SPELLS</h4><div class="pal-row">${inventory.map((id,k)=>`<button class="pal-spell" data-id="${id}" data-inv="${k}" draggable="true"><span class="dot" style="background:${(SPELLS[id]||MODS[id]).color}"></span>${spellLabel(id)}</button>`).join('')}</div></div>`:'';
  let wandsHtml='';
  G.wands.forEach((w,wi)=>{
    const slots=[];
    for(let si=0;si<w.capacity;si++){
      const s=w.slots[si];
      slots.push(`<div class="wslot ${s?'filled':''} ${G.editorSel&&G.editorSel.from==='slot'&&G.editorSel.wi===wi&&G.editorSel.si===si?'sel':''}" data-wi="${wi}" data-si="${si}">${s?`<span class="dot" style="background:${(SPELLS[s.id]||MODS[s.id]||TRIGGERS[s.id]).color}"></span>${spellLabel(s.id)}`:'+'}</div>`);
    }
    wandsHtml+=`<div class="wand-card ${wi===G.cur?'active':''}"><h3>${wi+1}. ${w.name} <small>${w.shuffle?'🔀':''}</small></h3>
      <div class="stats"><span>槽位 ${w.slots.length}/${w.capacity}</span><span>连发 ${w.spellsCast}</span><span>充能 ${w.recharge}s</span><span>施法延迟 ${w.castDelay}s</span><span>魔力 ${Math.floor(w.mana)}/${w.manaMax}</span><span>回蓝 ${w.regen}/s</span><span>散射 ${w.spread}°</span><span>速度 ×${w.speedMult}</span></div>
      <div class="slots">${slots.join('')}</div></div>`;
  });
  $('wandPanel').innerHTML=`<div class="panel-title"><b>⚒ 魔杖编辑台</b><span>点击法术再点击槽位放入 · 点击槽位取出 · E 关闭</span></div>
    <div class="editor"><div class="palette">${palette}${inv}</div><div class="wand-list">${wandsHtml}</div></div>
    ${canEdit?'':'<p class="warn">只能在圣山或拥有「魔杖工匠」祝福时编辑。</p>'}`;
  $('wandPanel').classList.remove('hide');
}
function editorClick(e){
  const pal=e.target.closest('.pal-spell');
  const slot=e.target.closest('.wslot');
  if(pal){
    const id=pal.dataset.id;
    if(G.editorSel && G.editorSel.from==='slot'){
      // place held slot spell into inventory-ish: swap — put selected pal into that slot
      placeIntoSlot(G.editorSel.wi,G.editorSel.si,id); G.editorSel=null;
    } else {
      G.editorSel = (G.editorSel&&G.editorSel.from==='palette'&&G.editorSel.id===id)?null:{from:'palette',id};
    }
    renderWands(); return;
  }
  if(slot){
    const wi=+slot.dataset.wi, si=+slot.dataset.si, w=G.wands[wi];
    if(G.editorSel && G.editorSel.from==='palette'){
      placeIntoSlot(wi,si,G.editorSel.id); G.editorSel=null;
    } else if(G.editorSel && G.editorSel.from==='slot'){
      // swap the held slot's spell with the clicked slot
      const a=G.editorSel, aw=G.wands[a.wi];
      const tmp=aw.slots[a.si]; aw.slots[a.si]=w.slots[si]; w.slots[si]=tmp;
      G.editorSel=null;
    } else if(w.slots[si]){
      // pick the spell up out of the slot (keep positions stable)
      G.editorSel={from:'slot',wi,si}; w.slots[si]=undefined;
    }
    renderWands(); return;
  }
}
function placeIntoSlot(wi,si,id){
  const w=G.wands[wi];
  if(!w) return;
  // count non-empty
  const filled=w.slots.filter(Boolean).length;
  if(!w.slots[si] && filled>=w.capacity){ toast('槽位已满'); return; }
  w.slots[si]={id};
  sfx('spell');
}
function renderPerks(){
  $('perkPanel').innerHTML=`<div class="panel-title"><b>⛰ 圣山祭坛 · 选择一项祝福</b><span>点击卡片或按 1 / 2 / 3</span></div>
    <div class="perk-grid">${G.perkChoices.map((p,i)=>`<button class="perk" data-perk="${i}"><b>${i+1}. ${p.name}</b><small>${p.desc}</small></button>`).join('')}</div>`;
  $('perkPanel').classList.remove('hide');
}

// ------------------------------- audio -------------------------------------
let actx=null, master=null, muted=false;
function initAudio(){ if(actx) return; try{ actx=new (window.AudioContext||window.webkitAudioContext)(); master=actx.createGain(); master.gain.value=0.25; master.connect(actx.destination);}catch(e){} }
function sfx(kind){
  if(muted||!actx) return;
  const t=actx.currentTime;
  const o=actx.createOscillator(), g=actx.createGain();
  let f=400, dur=0.08, type='square', vol=0.3, slide=0;
  switch(kind){
    case 'cast': f=520; type='square'; dur=0.06; vol=0.18; slide=-120; break;
    case 'hit': f=180; type='sawtooth'; dur=0.05; vol=0.2; break;
    case 'kill': f=90; type='sawtooth'; dur=0.16; vol=0.28; slide=-40; break;
    case 'boom': f=70; type='sawtooth'; dur=0.4; vol=0.5; slide=-30; break;
    case 'coin': f=880; type='square'; dur=0.07; vol=0.2; slide=200; break;
    case 'heal': f=660; type='sine'; dur=0.16; vol=0.25; slide=180; break;
    case 'spell': f=740; type='triangle'; dur=0.1; vol=0.2; slide=140; break;
    case 'perk': f=520; type='triangle'; dur=0.3; vol=0.3; slide=260; break;
    case 'jump': f=300; type='square'; dur=0.05; vol=0.12; slide=160; break;
    case 'dead': f=120; type='sawtooth'; dur=0.7; vol=0.4; slide=-80; break;
    case 'win': f=440; type='triangle'; dur=0.6; vol=0.4; slide=440; break;
    case 'tele': f=900; type='sine'; dur=0.14; vol=0.22; slide=-500; break;
    case 'chest': f=300; type='square'; dur=0.12; vol=0.25; slide=180; break;
  }
  o.type=type; o.frequency.setValueAtTime(f,t);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide), t+dur);
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.02);
  // noise burst for boom
  if(kind==='boom'||kind==='kill'){ const len=actx.sampleRate*0.2; const buf=actx.createBuffer(1,len,actx.sampleRate); const d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
    const src=actx.createBufferSource(); src.buffer=buf; const ng=actx.createGain(); ng.gain.value=kind==='boom'?0.4:0.15; src.connect(ng); ng.connect(master); src.start(t); }
}

// ------------------------------- input -------------------------------------
function bindInput(){
  window.addEventListener('keydown', e=>{
    const k=e.key.length===1?e.key.toLowerCase():e.key;
    keys[k]=true;
    if(['a','d','w',' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
    initAudio();
    if(G.mode==='perk' && ['1','2','3'].includes(e.key)) choosePerk(+e.key-1);
    if(k==='e'){ tryToggleEdit(); }
    if(k==='m'){ muted=!muted; toast(muted?'静音':'开启声音'); }
    if(k>='1'&&k<='4'){ const n=+k-1; if(n<G.wands.length){ G.cur=n; updateHud(); } }
    if(k==='f'||e.button===2){ kick(); }
    if(k==='p' && G.mode==='play'){ G.paused=!G.paused; toast(G.paused?'暂停':'继续'); }
  });
  window.addEventListener('keyup', e=>{ keys[e.key.length===1?e.key.toLowerCase():e.key]=false; });
  canvas.addEventListener('pointermove', e=>{ const r=canvas.getBoundingClientRect(); pointer.x=clamp((e.clientX-r.left)/r.width*VW,0,VW); pointer.y=clamp((e.clientY-r.top)/r.height*VH,0,VH); pointer.active=true; });
  canvas.addEventListener('pointerdown', e=>{ initAudio(); pointer.down=true; pointer.active=true; canvas.setPointerCapture(e.pointerId); });
  window.addEventListener('pointerup', ()=>{ pointer.down=false; });
  canvas.addEventListener('contextmenu', e=>{ e.preventDefault(); kick(); });
  // touch buttons
  const tb=(id,on,off)=>{ const b=$(id); b.addEventListener('pointerdown',e=>{e.preventDefault();initAudio();on();}); b.addEventListener('pointerup',e=>{e.preventDefault();off&&off();}); b.addEventListener('pointerleave',()=>off&&off()); };
  tb('leftBtn',()=>keys.__left=true,()=>keys.__left=false);
  tb('rightBtn',()=>keys.__right=true,()=>keys.__right=false);
  tb('jumpBtn',()=>keys.__jump=true,()=>keys.__jump=false);
  tb('fireBtn',()=>{ pointer.down=true; },()=>pointer.down=false);
  $('wandBtn').addEventListener('click',()=>{ G.cur=(G.cur+1)%G.wands.length; updateHud(); });
  $('editBtn')&&$('editBtn').addEventListener('click',()=>{ tryToggleEdit(true); });
  // UI buttons
  $('startBtn').addEventListener('click',()=>startGame());
  $('restartBtn').addEventListener('click',()=>startGame());
  $('winBtn').addEventListener('click',()=>startGame());
  $('perkPanel').addEventListener('click',e=>{ const b=e.target.closest('[data-perk]'); if(b) choosePerk(+b.dataset.perk); });
  $('wandPanel').addEventListener('click',editorClick);
}
function tryToggleEdit(force){
  if(G.mode!=='play') return;
  const pl=G.player; const nearBench = G.holy.some(h=> pl.y>=h.y0&&pl.y<h.y1);
  if(G.perk.tinker || nearBench || force){
    G.editMode=!G.editMode;
    if(G.editMode){ G.mode='edit'; renderWands(); }
    else { G.mode='play'; $('wandPanel').classList.add('hide'); G.editorSel=null; }
  } else toast('需要在圣山或「魔杖工匠」祝福才能编辑');
}
function kick(){
  if(G.mode!=='play') return; const pl=G.player; if(pl.kickCd>0) return; pl.kickCd=24;
  const kx=pl.x+pl.dir*8, ky=pl.y;
  for(const e of G.enemies){ if(Math.hypot(e.x-kx,e.y-ky)<9){ damageEnemy(e, 6, 'melee'); e.vx+=pl.dir*1.5; e.vy-=0.5; } }
  for(let i=0;i<5;i++) G.particles.push({x:kx,y:ky,vx:pl.dir*(0.5+i*0.2),vy:rng()-0.5,life:8,max:8,color:'#fff',size:1});
  sfx('hit');
}
function teleportPlayerRandom(){
  const pl=G.player; for(let i=0;i<40;i++){ const x=rint(20,W-21),y=rint(20,H-40); if(!solidRect(x,y,pl.w,pl.h)&&MCAT[get(x,y)]!==LIQ){ pl.x=x;pl.y=y; break; } }
}

// ------------------------------- game flow ---------------------------------
function startGame(seed){
  initAudio();
  G = newState();
  G.seed = (seed!=null?seed:(Date.now()^Math.floor(Math.random()*1e9)))>>>0;
  rngState = G.seed|1; noiseSeed=G.seed;
  inventory=[]; 
  generateWorld();
  G.player = makePlayer();
  G.player.x=W/2; G.player.y=48;
  G.wands = starterWands();
  G.wands[0].mana=G.wands[0].manaMax; G.wands[1].mana=G.wands[1].manaMax;
  G.mode='play';
  ['title','dead','win','wandPanel','perkPanel'].forEach(id=>$(id).classList.add('hide'));
  canvas.style.transform='';
  updateHud();
  toast(`种子 ${G.seed} · 向下探索`);
  computeLighting();
}

// ------------------------------- main loop ---------------------------------
function update(){
  if(!G || G.mode==='title') return;
  if(G.paused) return;
  G.frame++;
  if(G.mode==='play'||G.mode==='edit'){ G.playTime++; }
  // camera follows player
  const targetCam = clamp(G.player.y - VH*0.5, 0, H-VH);
  G.camY += (targetCam-G.camY)*0.18;
  if(Math.abs(targetCam-G.camY)<0.3) G.camY=targetCam;
  // shake
  if(G.shake>0){ G.shake*=0.86; if(G.shake<0.3)G.shake=0; G.shakeX=(Math.random()*2-1)*G.shake; G.shakeY=(Math.random()*2-1)*G.shake; }
  else { G.shakeX=0; G.shakeY=0; }
  canvas.style.transform = (G.shakeX||G.shakeY)?`translate(${G.shakeX.toFixed(1)}px,${G.shakeY.toFixed(1)}px)`:'';
  if(G.mode!=='play'){ return; }
  updatePlayer();
  simMaterials();
  updateEnemies();
  updateProjectiles();
  updatePickups();
  updateParticles();
  checkHoly();
  G.depth=Math.max(G.depth, Math.floor(G.player.y));
  if(G.frame%6===0) updateHud();
  if(toastTimer>0){ toastTimer--; if(!toastTimer) $('toast').style.opacity=0; }
}
let rafId=0;
function loop(){
  update();
  if(G && G.mode!=='title') render();
  else if(!G){ ctx.fillStyle='#05060b'; ctx.fillRect(0,0,VW,VH); }
  rafId=requestAnimationFrame(loop);
}

// ------------------------------- boot --------------------------------------
bindInput();
// initial title backdrop
ctx.fillStyle='#05060b'; ctx.fillRect(0,0,VW,VH);
loop();

// ------------------------------- test hooks (headless) ---------------------
// Exposed so an automated harness can drive update()/render() deterministically
// without relying on requestAnimationFrame (which is throttled in headless).
window.__PA = {
  start: startGame,
  update, render,
  get state(){ return G; },
  get player(){ return G&&G.player; },
  get enemies(){ return G&&G.enemies; },
  get projectiles(){ return G&&G.projectiles; },
  get wands(){ return G&&G.wands; },
  get inventory(){ return inventory; },
  get camY(){ return G?G.camY:0; },
  setCell(x,y,m){ put(x,y,m); },
  cellAt(x,y){ return get(x,y); },
  setKey(k,v){ keys[k]=v; },
  setPointer(x,y,down){ pointer.x=x;pointer.y=y;pointer.down=down;pointer.active=true; },
  lightSample(){ // average brightness near player after a render
    if(!G) return 0; const d=ctx.getImageData(0,0,VW,VH).data; let s=0,n=0;
    const cx=G.player.x|0, cy=(G.player.y-Math.floor(G.camY))|0;
    for(let y=Math.max(0,cy-30);y<Math.min(VH,cy+30);y++) for(let x=Math.max(0,cx-40);x<Math.min(VW,cx+40);x++){ const o=(y*VW+x)*4; s+=d[o]+d[o+1]+d[o+2]; n++; }
    return n?s/n/3:0;
  },
  lightAt(wx,wy){ // brightness (0..255) at a world point from the last render
    if(!G) return 0; const sx=wx|0, sy=(wy-Math.floor(G.camY))|0;
    if(sx<0||sx>=VW||sy<0||sy>=VH) return 0; const o=(sy*VW+sx)*4;
    const d=ctx.getImageData(sx,sy,1,1).data; return (d[0]+d[1]+d[2])/3;
  },
  forceDie(cause){ die(cause||'测试'); },
  hurt(d,src){ hurtPlayer(d,src); },
  // editor / perk / perf hooks for testing
  openEditor(){ G.editMode=true; G.mode='edit'; renderWands(); },
  closeEditor(){ G.editMode=false; G.mode='play'; G.editorSel=null; $('wandPanel').classList.add('hide'); },
  placeSpell(wi,si,id){ placeIntoSlot(wi,si,id); },
  slots(){ return G.wands.map(w=>w.slots.slice(0,w.capacity)); },
  givePerk(i){ choosePerk(i); },
  offerPerksNow(){ offerPerks(); },
  perf(n){ const t=performance.now(); for(let i=0;i<n;i++){ update(); render(); } return performance.now()-t; },
};

})();
