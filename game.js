/* Ember Deep. Original pixel art and simulation; no external runtime dependencies. */
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d', { alpha: false });
const terrainCanvas = document.createElement('canvas'), terrainCtx = terrainCanvas.getContext('2d');
const lightCanvas = document.createElement('canvas'), lightCtx = lightCanvas.getContext('2d');
const W = 480, LAYER = 400, H = LAYER * 5 + 60, STEP = 1000 / 30;
let VW = 480, VH = 270, terrainImage;
const M = { AIR:0, ROCK:1, DIRT:2, SAND:3, WATER:4, OIL:5, BLOOD:6, ACID:7, LAVA:8, WOOD:9, COAL:10, MOSS:11, ICE:12, SNOW:13, STONE:14, METAL:15, GOLD:16, FIRE:17, SMOKE:18, STEAM:19, GAS:20, BRICK:21 };
const materials = [
  ['空气',0,0,0,'#0a1010'], ['岩石',0,5,4,'#555963'], ['泥土',0,1,1,'#655e42'],
  ['砂砾',3,1,1,'#b3a374'], ['水',2,0,0,'#367d92'], ['油',1,0,0,'#826c33'],
  ['血液',3,0,0,'#913d4c'], ['酸液',2.5,0,0,'#9ccc44'], ['熔岩',4,0,0,'#ed6830'],
  ['木材',0,2,1,'#85663d'], ['煤',0,2,2,'#333b3c'], ['苔藓',0,1,1,'#78804b'],
  ['冰',0,3,2,'#88b7c1'], ['积雪',2,1,1,'#c3dad9'], ['玄武岩',0,7,6,'#686c66'],
  ['金属',0,10,9,'#7a8b8a'], ['金矿',0,4,3,'#d6b75e'], ['火焰',0,0,0,'#ffb54c'],
  ['烟',0,0,0,'#4c524b'], ['蒸汽',0,0,0,'#afcbc4'], ['毒气',0,0,0,'#77994c'],
  ['遗迹石砖',0,20,15,'#768379']
].map(([name,density,durability,hardness,color]) => ({name,density,durability,hardness,color}));
const liquids = new Set([M.WATER,M.OIL,M.BLOOD,M.ACID,M.LAVA]);
const gases = new Set([M.SMOKE,M.STEAM,M.GAS]);
const powders = new Set([M.SAND,M.SNOW]);
const flammable = new Set([M.WOOD,M.OIL,M.COAL,M.MOSS]);
const solid = m => materials[m].durability > 0;
const biomes = [
  {name:'锈脉矿坑',en:'RUSTVEIN',rock:[71,74,78],soil:[111,94,55],rim:[126,136,65],bg:[13,20,19]},
  {name:'余火煤层',en:'CINDER SEAM',rock:[53,56,57],soil:[90,82,62],rim:[142,104,56],bg:[18,17,17]},
  {name:'荧孢深林',en:'SPORE GROTTO',rock:[56,67,72],soil:[78,73,69],rim:[97,143,72],bg:[15,23,26]},
  {name:'霜裂冰窟',en:'RIME DESCENT',rock:[79,106,119],soil:[98,132,137],rim:[157,205,209],bg:[12,23,29]},
  {name:'赤核熔炉',en:'REDCORE',rock:[79,65,68],soil:[105,81,67],rim:[168,117,71],bg:[24,15,20]}
];
const spells = {
  spark:{name:'辉针',kind:'projectile',glyph:'↗',color:'#b4eafd',mana:5,damage:12,speed:6,life:44,delay:0,desc:'迅捷的直线魔法弹。'},
  arrow:{name:'碎晶矢',kind:'projectile',glyph:'➶',color:'#e8d9a7',mana:9,damage:22,speed:7,life:45,delay:2,desc:'高伤害晶矢，穿透松软材料。'},
  ember:{name:'烬火球',kind:'projectile',glyph:'✹',color:'#ff9a52',mana:17,damage:20,speed:4,life:48,delay:3,desc:'爆裂并点燃周围的可燃物。'},
  bomb:{name:'裂岩珠',kind:'projectile',glyph:'●',color:'#e4b362',mana:24,damage:44,speed:3,life:48,delay:8,desc:'受重力影响。大范围爆炸能伤及施法者。'},
  drill:{name:'凿光束',kind:'projectile',glyph:'≋',color:'#d8f699',mana:14,damage:13,speed:4,life:22,delay:1,desc:'持续消耗能量，切开岩层。'},
  water:{name:'涌泉弹',kind:'projectile',glyph:'≈',color:'#75d9e7',mana:10,damage:5,speed:4,life:36,delay:1,desc:'释放清水，灭火并冷却熔岩。'},
  frost:{name:'霜棘',kind:'projectile',glyph:'❄',color:'#cbf5ee',mana:13,damage:17,speed:5,life:42,delay:2,desc:'冻结水面，减缓敌人移动。'},
  scatter:{name:'三重散射',kind:'modifier',glyph:'⋔',color:'#deb3ee',mana:12,desc:'将下一个弹体复制为三束，扩散角 18°。'},
  flame:{name:'引燃',kind:'modifier',glyph:'♨',color:'#f8a774',mana:7,desc:'下一个弹体沿途留下火焰并点燃目标。'},
  homing:{name:'寻踪',kind:'modifier',glyph:'◎',color:'#a6de8a',mana:12,desc:'下一个弹体转向附近的敌人。'},
  bounce:{name:'折返',kind:'modifier',glyph:'↱',color:'#96d5ca',mana:5,desc:'下一个弹体最多在岩壁反弹两次。'},
  power:{name:'增幅',kind:'modifier',glyph:'✧',color:'#eada8a',mana:9,desc:'下一个弹体伤害增加 70%。'},
  impact:{name:'碰撞引信',kind:'trigger',glyph:'⊙',color:'#e5adce',mana:12,damage:8,speed:5,life:60,delay:1,desc:'发射载体，碰撞时释放后续法术。载荷魔力预付。'},
  timer:{name:'定时引信',kind:'trigger',glyph:'◷',color:'#c3b7f0',mana:12,damage:8,speed:4,life:65,delay:1,desc:'载体飞行 0.6 秒或碰撞时，释放后续法术。'}
};
const projectileIds = Object.keys(spells).filter(id => spells[id].kind === 'projectile');
const allSpellIds = Object.keys(spells);
const perkDefs = [
  {id:'armor',name:'石肤',glyph:'◇',desc:'所有伤害降低 25%。',apply:p=>p.armor*=.75},
  {id:'health',name:'心火',glyph:'♥',desc:'最大生命增加 35，并恢复生命。',apply:p=>{p.maxHp+=35;p.hp=p.maxHp;}},
  {id:'flight',name:'轻羽',glyph:'↑',desc:'悬浮储量增加 50%。',apply:p=>{p.maxFuel*=1.5;p.fuel=p.maxFuel;}},
  {id:'mana',name:'灵泉',glyph:'◆',desc:'全部魔杖的魔力恢复提高 40%。',apply:p=>p.manaRegen*=1.4},
  {id:'tinker',name:'流浪工匠',glyph:'⚒',desc:'可以在洞穴中打开法杖编辑台。',apply:p=>p.tinker=true},
  {id:'power',name:'灼心',glyph:'✧',desc:'弹体伤害提高 30%。',apply:p=>p.power*=1.3}
];
let seed, rng, world, age, moved, player, enemies, projectiles, particles, pickups, debris, decorations, lights, sanctuaries;
let wands, storage, selectedWand, state = 'play', tick = 0, elapsedTicks = 0, kills = 0, gold = 0, maxDepth = 0;
let camera = {x:0,y:0}, shake = 0, nearby = null, activeSanctuary = null, selectedCell = null, drag = null;
let toastUntil = 0, soundOn = false, shakeOn = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let aim = {x:220,y:100,down:false,angle:0,touch:false}, keys = {}, lastHud = '', currentMaterial = '';
let audioContext, audioMaster, lastSound = 0;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const rand = (a,b) => a + rng() * (b-a);
const int = (a,b) => Math.floor(rand(a,b+1));
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const biomeIndex = y => clamp(Math.floor(y/LAYER),0,4);
function randomGenerator(s) { let t=s>>>0; return ()=>{t+=0x6D2B79F5;let n=t;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return ((n^n>>>14)>>>0)/4294967296;}; }
function hash(x,y,s=0) { let n=Math.imul(x^seed,374761393)+Math.imul(y^s,668265263);n=Math.imul(n^n>>>13,1274126177);return ((n^n>>>16)>>>0)/4294967295; }
function get(x,y) { x=Math.floor(x);y=Math.floor(y);return x<0||x>=W||y<0||y>=H?M.BRICK:world[y*W+x]; }
function put(x,y,m,life=0) { x=Math.floor(x);y=Math.floor(y);if(x<1||x>=W-1||y<1||y>=H-1)return;let i=y*W+x;world[i]=m;age[i]=life;moved[i]=tick; }
function rect(x,y,w,h,m) { for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)put(xx,yy,m); }
function ellipse(cx,cy,rx,ry,m,rough=false) {
  for(let y=Math.floor(cy-ry-3);y<=cy+ry+3;y++)for(let x=Math.floor(cx-rx-3);x<=cx+rx+3;x++) {
    const edge=rough ? (hash(x>>2,y>>2,3)-.5)*.22 : 0;
    if(((x-cx)/rx)**2+((y-cy)/ry)**2<1+edge)put(x,y,m);
  }
}
function tunnel(a,b,r=24) {const n=Math.ceil(dist(a,b)/8);for(let i=0;i<=n;i++)ellipse(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,r,r*.85,M.AIR,true);}
function makeWand(name,slots,capacity=6,options={}) {
  return {name,slots:[...slots,...Array(Math.max(0,capacity-slots.length)).fill(null)],capacity,mana:options.mana||120,maxMana:options.mana||120,regen:options.regen||38,castDelay:options.delay||8,recharge:options.recharge||22,cooldown:0,cursor:0,color:options.color||'#88c4b3'};
}
function addEnemy(type,x,y,level) {
  const hp={charger:32,shooter:28,wing:20,bomber:22,burrower:45,core:280}[type]*(1+level*.28);
  const e={type,x,y,vx:0,vy:0,w:type==='core'?24:10,h:type==='core'?22:12,hp,maxHp:hp,level,cooldown:45+int(0,45),mode:'idle',phase:rand(0,6),flash:0,slow:0,burning:0,dead:false,homeY:y,dir:-1};enemies.push(e);return e;
}
function pool(x,y,w,h,m) {rect(x-3,y-2,w+6,h+5,M.STONE);rect(x,y-5,w,h+5,M.AIR);rect(x,y,w,h,m);}
function generateWorld() {
  world=new Uint8Array(W*H);age=new Uint16Array(W*H);moved=new Uint32Array(W*H);world.fill(M.ROCK);
  enemies=[];projectiles=[];particles=[];pickups=[];debris=[];decorations=[];lights=[];sanctuaries=[];
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++) {
    const b=biomeIndex(y),n=hash(x>>3,y>>3,11),f=hash(x>>1,y>>1,19);
    world[y*W+x]=n>.62?M.DIRT:(b===1&&n<.23?M.COAL:b===3&&n<.3?M.ICE:M.ROCK);
    if(n>.94&&f>.64)world[y*W+x]=M.GOLD;
  }
  for(let b=0;b<5;b++) {
    const base=b*LAYER;
    const route=[{x:110,y:base+70},{x:255+int(-25,25),y:base+145},{x:175+int(-25,25),y:base+228},{x:310,y:base+300},{x:300,y:base+354}];
    if(b)tunnel({x:389,y:base-14},route[0],26);
    route.forEach((p,i)=>{ellipse(p.x,p.y,i===0?105:80,48,M.AIR,true);if(i)tunnel(route[i-1],p,28);});
    for(let j=0;j<7;j++) {
      const p={x:int(52,430),y:base+int(80,306)};
      ellipse(p.x,p.y,int(24,57),int(16,30),M.AIR,true);
      const nearest=route.reduce((a,c)=>dist(p,c)<dist(p,a)?c:a,route[0]);tunnel(p,nearest,14);
    }
    // Shelves leave alternating open shafts and short flights between cave chambers.
    rect(34,base+112,172,8,b===3?M.ICE:M.DIRT);
    rect(34,base+112,172,2,b===3?M.SNOW:M.MOSS);
    rect(245,base+182,126,5,b===3?M.ICE:M.WOOD);
    rect(92,base+269,125,6,b===3?M.ICE:M.DIRT);
    rect(100,base+269,105,2,b===3?M.SNOW:M.MOSS);
    rect(68,base+89,139,23,M.AIR);
    rect(309,base+153,31,29,M.AIR);
    ellipse(250,base+217,14,13,M.AIR);
    ellipse(345,base+277,14,13,M.AIR);
    rect(89,base+248,15,8,b===3?M.SNOW:M.SAND);
    for(const p of [{x:62,y:base+89},{x:272,y:base+165},{x:157,y:base+252},{x:327,y:base+302}]) {
      decorations.push({...p,type:'torch'});lights.push({...p,r:64,color:b===3?'#89d6ed':'#ffb950',power:.94});
    }
    for(const p of [{x:45,y:base+47,w:151,h:63},{x:240,y:base+128,w:134,h:53}])decorations.push({...p,type:b<2?'timber':b===2?'roots':b===3?'icicles':'arch'});
    pool(305,base+108,45,15,b===4?M.LAVA:b===2?M.ACID:M.WATER);
    if(b===0)rect(306,base+105,43,3,M.OIL);
    pool(38,base+236,31,16,b===1?M.OIL:b===3?M.WATER:b===4?M.LAVA:M.WATER);
    if(b===1){rect(357,base+176,10,5,M.COAL);for(let x=357;x<367;x++)put(x,base+175,M.FIRE,80);}
    if(b===2)for(let j=0;j<12;j++)decorations.push({type:'fungus',x:80+j*27,y:base+245+int(-14,25),size:int(8,17),color:j%2?'#b7649e':'#61cdd1'});
    if(b===3)rect(236,base+180,142,2,M.SNOW);
    ellipse(356,base+200,19,16,M.AIR);
    rect(347,base+210,19,3,M.WOOD);
    debris.push({x:356,y:base+203,vy:0,r:6,falling:false,dead:false});
    pickups.push({type:'chest',x:134,y:base+103,opened:false,level:b});
    pickups.push({type:'flask',x:279,y:base+174,vy:0});
    pickups.push({type:'wand',x:167,y:base+261,vy:0,wand:makeWand(['棘木枝','铜骨杖','荧孢枝','寒晶杖','炉心杖'][b],b===0?['impact','scatter','spark']:['homing',projectileIds[(b+2)%7],projectileIds[b]],6+b%3,{mana:155+b*22,regen:42+b*6,delay:9,color:['#c5c28b','#d4a076','#85c5b8','#9cdce0','#e49e75'][b]})});
    addEnemy('charger',185,base+103,b);
    addEnemy('shooter',324,base+172,b);
    addEnemy('wing',250,base+217,b);
    addEnemy('bomber',345,base+277,b);
    if(b>0)addEnemy('burrower',80,base+290,b);
    if(b>1)addEnemy('shooter',150,base+256,b);
    const sy=base+338;
    rect(40,sy-8,404,65,M.BRICK);rect(49,sy,386,49,M.AIR);
    tunnel({x:300,y:base+300},{x:300,y:sy+17},22);
    rect(380,sy+37,34,55,M.AIR);
    rect(95,sy+38,220,9,M.BRICK);
    const shop=['scatter','flame','homing','impact','timer'].map((id,i)=>({id,cost:25+i*5+b*4,sold:false}));
    sanctuaries.push({x:49,y:sy,w:386,h:49,level:b,visited:false,perk:false,shop,choices:[perkDefs[b%6],perkDefs[(b+2)%6],perkDefs[(b+4)%6]]});
    for(let x=90;x<410;x+=100)lights.push({x,y:sy+16,r:66,color:'#8ad4b7',power:.97});
    decorations.push({type:'sanctuary',x:49,y:sy,w:386,h:49});
  }
  // Carve the walkable route last so decorative shelves cannot seal a level.
  for(let b=0;b<5;b++) {
    const base=b*LAYER;
    const path=[{x:196,y:base+94},{x:233,y:base+94},{x:233,y:base+145},{x:224,y:base+193},{x:249,y:base+236},{x:255,y:base+281},{x:300,y:base+309},{x:300,y:base+358}];
    for(let i=1;i<path.length;i++)tunnel(path[i-1],path[i],17);
    if(b<4) {
      const exit=[{x:397,y:base+374},{x:397,y:base+405},{x:305,y:base+435},{x:196,y:base+463},{x:196,y:base+494}];
      for(let i=1;i<exit.length;i++)tunnel(exit[i-1],exit[i],19);
    }
  }
  for(const d of decorations)if(d.type==='fungus') {
    const base=biomeIndex(d.y)*LAYER;let floor=Math.floor(d.y);
    while(solid(get(d.x,floor))&&floor>base+170)floor--;
    while(!solid(get(d.x,floor))&&floor<base+329)floor++;
    d.y=floor;
  }
  decorations=decorations.filter(d=>d.type!=='fungus'||solid(get(d.x,d.y)));
  // A predictable, clear entry gives every seed room to walk, jump and aim.
  rect(68,48,142,63,M.AIR);rect(72,112,134,2,M.MOSS);
  tunnel({x:389,y:1985},{x:280,y:2020},22);ellipse(250,2023,143,30,M.AIR);
  rect(125,2047,245,6,M.BRICK);lights.push({x:245,y:2020,r:130,color:'#f87a65',power:.97});
  addEnemy('core',310,2028,4);
  player={x:105,y:103,vx:0,vy:0,w:7,h:14,dir:1,hp:100,maxHp:100,fuel:100,maxFuel:100,breath:240,wet:0,oily:0,burning:0,poison:0,inv:0,armor:1,manaRegen:1,power:1,tinker:false,perks:[],onGround:false,dead:false};
}

function exchange(i,j) {
  const m=world[i],a=age[i];world[i]=world[j];age[i]=age[j];world[j]=m;age[j]=a;moved[i]=moved[j]=tick;
}
function flowInto(i,j,gas=false,lateral=false) {
  if(j<W||j>=W*(H-1)||j%W<1||j%W>W-2)return false;
  const a=world[i],b=world[j];
  const can=gas ? b===M.AIR || (a===M.STEAM&&b===M.SMOKE) : b===M.AIR||gases.has(b)||b===M.FIRE||(!lateral&&liquids.has(b)&&materials[a].density>materials[b].density);
  if(can){exchange(i,j);return true;}return false;
}
function reactCell(x,y) {
  const i=y*W+x,m=world[i];
  if(![M.WATER,M.ACID,M.LAVA,M.FIRE].includes(m))return false;
  const neighbors=[i-1,i+1,i-W,i+W];
  for(const j of neighbors) {
    const n=world[j];
    if((m===M.WATER&&n===M.LAVA)||(m===M.LAVA&&n===M.WATER)) {
      const hot=m===M.LAVA?i:j,wet=m===M.WATER?i:j;
      world[hot]=M.STONE;world[wet]=M.STEAM;age[wet]=80;age[hot]=0;moved[hot]=moved[wet]=tick;
      return true;
    }
    if((m===M.FIRE&&[M.WATER,M.BLOOD].includes(n))||(m===M.WATER&&n===M.FIRE)) {
      const fire=m===M.FIRE?i:j;world[fire]=M.STEAM;age[fire]=55;moved[fire]=tick;return true;
    }
    if(m===M.ACID&&n!==M.AIR&&n!==M.ACID&&!gases.has(n)&&n!==M.FIRE&&rng()<.12) {
      // Outer boundary stays sealed; every interior solid, including masonry, corrodes.
      if(j%W>1&&j%W<W-2&&j>W&&j<W*(H-1)) {
        world[j]=M.GAS;age[j]=int(50,120);moved[j]=tick;
        if(rng()<.6){world[i]=M.GAS;age[i]=75;moved[i]=tick;}
        return true;
      }
    }
    if((m===M.FIRE||m===M.LAVA)&&flammable.has(n)&&rng()<.10) {
      world[j]=M.FIRE;age[j]=n===M.COAL?150:n===M.OIL?110:80;moved[j]=tick;
    }
    if((m===M.FIRE||m===M.LAVA)&&[M.ICE,M.SNOW].includes(n)&&rng()<.25){world[j]=M.WATER;moved[j]=tick;}
  }
  return false;
}
function simulateMaterials(y0=Math.max(2,Math.floor(camera.y)-70),y1=Math.min(H-2,Math.ceil(camera.y+VH)+80)) {
  for(let y=y1;y>=y0;y--) {
    const direction=tick%2?1:-1;
    for(let k=1;k<W-1;k++) {
      const x=direction>0?k:W-1-k,i=y*W+x,m=world[i];
      if(m===M.AIR||moved[i]===tick)continue;
      if(solid(m)&&!powders.has(m))continue;
      if(reactCell(x,y))continue;
      if(m===M.FIRE) {
        if(!age[i])age[i]=int(18,45);
        if(--age[i]===0){world[i]=rng()<.6?M.SMOKE:M.AIR;age[i]=50;continue;}
        if(get(x,y-1)===M.AIR&&rng()<.15)put(x,y-1,M.SMOKE,int(20,70));
        if(rng()<.18&&flowInto(i,i-W,true))continue;
      } else if(gases.has(m)) {
        if(!age[i])age[i]=int(40,100);
        if(--age[i]===0){world[i]=m===M.STEAM&&rng()<.40?M.WATER:M.AIR;continue;}
        if(flowInto(i,i-W,true)||flowInto(i,i-W+direction,true)||flowInto(i,i-W-direction,true))continue;
        if(rng()<.5)flowInto(i,i+direction,true);
      } else if(liquids.has(m)||powders.has(m)) {
        if(m===M.LAVA&&tick%2)continue;
        if(flowInto(i,i+W)||flowInto(i,i+W+direction)||flowInto(i,i+W-direction))continue;
        if(liquids.has(m)) {
          if(flowInto(i,i+direction,false,true))continue;
          flowInto(i,i-direction,false,true);
        }
      }
    }
  }
}
function blocked(x,y,w,h) {
  for(let yy=Math.floor(y-h/2);yy<=Math.floor(y+h/2);yy++)for(let xx=Math.floor(x-w/2);xx<=Math.floor(x+w/2);xx++)if(solid(get(xx,yy)))return true;
  return false;
}
function moveBody(body,dx,dy,stepUp=false) {
  const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))));
  for(let i=0;i<steps;i++) {
    const sx=dx/steps,sy=dy/steps;
    if(!blocked(body.x+sx,body.y,body.w,body.h))body.x+=sx;
    else if(stepUp&&!blocked(body.x+sx,body.y-2,body.w,body.h)){body.x+=sx;body.y-=2;}
    else body.vx=0;
    if(!blocked(body.x,body.y+sy,body.w,body.h))body.y+=sy;
    else {body.vy=0;if(sy>0)body.onGround=true;}
  }
}
function clearLine(x0,y0,x1,y1) {
  const steps=Math.ceil(Math.hypot(x1-x0,y1-y0)/3);
  for(let i=1;i<steps;i++)if(solid(get(x0+(x1-x0)*i/steps,y0+(y1-y0)*i/steps)))return false;
  return true;
}
function dig(cx,cy,r,power,energy=100) {
  let removed=0;
  const cells=[];
  for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++) {
    const d=Math.hypot(x-cx,y-cy);if(d<=r)cells.push({x,y,d});
  }
  cells.sort((a,b)=>a.d-b.d);
  for(const c of cells) {
    const m=get(c.x,c.y),def=materials[m];
    if(!solid(m)||def.durability>power||energy<def.hardness||c.x<2||c.x>W-3||c.y<2||c.y>H-3)continue;
    energy-=def.hardness;put(c.x,c.y,M.AIR);removed++;
    if(m===M.GOLD&&rng()<.22)pickups.push({type:'gold',x:c.x,y:c.y,vy:-1,value:3});
    if(rng()<.12)particle(c.x,c.y,rand(-1,1),rand(-1.4,.4),materials[m].color,16);
  }
  return removed;
}
function particle(x,y,vx,vy,color,life=18,size=1,glow=false) {
  if(particles.length>800)return;
  particles.push({x,y,vx,vy,color,life,maxLife:life,size,glow});
}
function burst(x,y,color,count=18,speed=2) {
  for(let i=0;i<count;i++){const a=rand(0,Math.PI*2),v=rand(.2,speed);particle(x,y,Math.cos(a)*v,Math.sin(a)*v,color,int(8,23),rng()<.12?2:1,true);}
}
function hurt(amount,cause,detail,continuous=false) {
  if(player.dead||state!=='play'||(!continuous&&player.inv>0))return;
  player.hp-=amount*player.armor;
  if(!continuous){player.inv=16;shake=Math.max(shake,3);burst(player.x,player.y,'#de7c72',9,1.7);sound('hurt');}
  if(player.hp<=0)finishRun(false,cause,detail);
}
function damageEnemy(e,amount,owner='player',effect='') {
  if(e.dead)return;e.hp-=amount;e.flash=4;
  if(effect==='flame')e.burning=90;
  if(effect==='frost')e.slow=75;
  if(owner==='player')e.lastPlayerHit=tick;
  burst(e.x,e.y,e.type==='core'?'#ebaa64':'#e9ceb0',8,1.7);shake=Math.max(shake,1.8);sound('hit');
  if(e.hp>0)return;
  e.dead=true;
  if(owner==='player'||e.lastPlayerHit&&tick-e.lastPlayerHit<90)kills++;
  for(let i=0;i<5;i++)pickups.push({type:'gold',x:e.x+rand(-4,4),y:e.y,vy:rand(-1.5,-.3),value:4+e.level*2});
  for(let i=0;i<15;i++)if(get(e.x+int(-5,5),e.y+int(-5,5))===M.AIR)put(e.x+int(-4,4),e.y+int(-4,4),M.BLOOD);
  burst(e.x,e.y,'#c67e87',28,3);
  if(e.type==='core')finishRun(true,'','赤核守卫已经熄灭。');
}
function explode(x,y,r,damage,owner='player',fire=false) {
  dig(x,y,r,10,r*r*4);burst(x,y,'#ffda81',65,4.4);burst(x,y,'#ed8954',25,2.5);shake=Math.max(shake,7);sound('boom');
  particles.push({x,y,vx:0,vy:0,color:'#ffd18a',life:9,maxLife:9,size:r,ring:true,glow:true});
  for(const e of enemies)if(!e.dead&&dist(e,{x,y})<r+10)damageEnemy(e,damage*(1-dist(e,{x,y})/(r+14)),owner,fire?'flame':'');
  if(dist(player,{x,y})<r+8)hurt(damage*(1-dist(player,{x,y})/(r+12)),'被击杀',owner==='player'?'自己的裂岩爆炸。':'爆囊的自爆。');
  for(let i=0;i<r*2;i++){const px=x+rand(-r,r),py=y+rand(-r,r);if(get(px,py)===M.AIR)put(px,py,fire?M.FIRE:M.SMOKE,int(20,65));}
}

// One draw reads modifiers then one projectile. A trigger recursively draws its payload.
function readCast(slots,start=0,depth=0) {
  let cursor=start,mana=0,delay=0,mods={scatter:1,flame:false,homing:false,bounce:0,power:1};
  while(cursor<slots.length) {
    const id=slots[cursor++];if(!id)continue;const s=spells[id];mana+=s.mana;delay+=s.delay||0;
    if(s.kind==='modifier') {
      if(id==='scatter')mods.scatter=Math.min(9,mods.scatter*3);
      else if(id==='power')mods.power*=1.7;
      else if(id==='bounce')mods.bounce+=2;
      else mods[id]=true;
      continue;
    }
    let payload=null;
    if(s.kind==='trigger'&&depth<8){const nested=readCast(slots,cursor,depth+1);payload=nested.node;cursor=nested.next;mana+=nested.mana;}
    return {node:{id,mods,payload},next:cursor,mana,delay};
  }
  return {node:null,next:cursor,mana:0,delay:0};
}
function spawnCast(node,x,y,angle,owner='player') {
  if(!node||projectiles.length>200)return;
  const s=spells[node.id],count=node.mods.scatter;
  for(let i=0;i<count;i++) {
    const a=angle+(i-(count-1)/2)*.16;
    projectiles.push({x,y,px:x,py:y,vx:Math.cos(a)*s.speed,vy:Math.sin(a)*s.speed,id:node.id,mods:{...node.mods},payload:node.payload,triggered:false,life:s.life,age:0,damage:s.damage*node.mods.power*(owner==='player'?player.power:1),color:s.color,owner,energy:node.id==='drill'?130:12,dead:false});
  }
}
function cast() {
  const w=wands[selectedWand];if(!w||w.cooldown>0||state!=='play')return;
  const parsed=readCast(w.slots,w.cursor);
  if(!parsed.node){w.cursor=0;w.cooldown=w.recharge;return;}
  if(w.mana<parsed.mana){w.cooldown=5;if(tick%30<6)toast('魔力不足');return;}
  w.mana-=parsed.mana;
  const a=aim.touch?aim.angle:Math.atan2(aim.y+camera.y-player.y,aim.x+camera.x-player.x);
  aim.angle=a;player.dir=Math.cos(a)>=0?1:-1;
  spawnCast(parsed.node,player.x+Math.cos(a)*2,player.y-1+Math.sin(a)*2,a);
  const remaining=w.slots.slice(parsed.next).some(Boolean);
  w.cursor=remaining?parsed.next:0;w.cooldown=remaining?w.castDelay+parsed.delay:Math.max(w.castDelay+parsed.delay,w.recharge);
  burst(player.x+Math.cos(a)*7,player.y+Math.sin(a)*7,spells[parsed.node.id].color,5,1.4);sound('cast');
}
function releasePayload(p) {
  if(p.triggered||!p.payload)return;p.triggered=true;
  const a=Math.atan2(p.vy,p.vx);
  spawnCast(p.payload,p.px,p.py,a,p.owner);burst(p.px,p.py,'#e7b9de',15,2);
}
function impact(p,x,y) {
  releasePayload(p);
  if(p.id==='bomb'||p.id==='ember')explode(x,y,p.id==='bomb'?22:12,p.damage,p.owner,p.id==='ember');
  else if(p.id==='water') {
    for(let yy=-6;yy<=6;yy++)for(let xx=-7;xx<=7;xx++)if(!solid(get(x+xx,y+yy)))put(x+xx,y+yy,M.WATER);
    burst(x,y,'#8adfe9',22,2);
  } else if(p.id==='frost') {
    for(let yy=-8;yy<=8;yy++)for(let xx=-8;xx<=8;xx++)if(get(x+xx,y+yy)===M.WATER)put(x+xx,y+yy,M.ICE);
    burst(x,y,p.color,18,2);
  } else {dig(x,y,p.id==='arrow'?3:2,p.id==='arrow'?4:1,12);burst(x,y,p.color,12,2);}
  if(p.mods.flame)for(let i=0;i<12;i++){const px=x+int(-4,4),py=y+int(-4,4);if(!solid(get(px,py))||flammable.has(get(px,py)))put(px,py,M.FIRE,65);}
}
function updateProjectiles() {
  const existing=[...projectiles];
  for(const p of existing) {
    if(p.dead)continue;p.age++;p.life--;
    if(p.id==='timer'&&p.age>=18)releasePayload(p);
    if(p.mods.homing&&p.owner==='player') {
      const target=enemies.filter(e=>!e.dead&&dist(e,p)<100&&clearLine(p.x,p.y,e.x,e.y)).sort((a,b)=>dist(a,p)-dist(b,p))[0];
      if(target){const a=Math.atan2(target.y-p.y,target.x-p.x),speed=Math.hypot(p.vx,p.vy);p.vx=p.vx*.87+Math.cos(a)*speed*.13;p.vy=p.vy*.87+Math.sin(a)*speed*.13;}
    }
    if(p.id==='bomb')p.vy+=.15;
    const steps=Math.max(1,Math.ceil(Math.hypot(p.vx,p.vy)));
    for(let i=0;i<steps&&!p.dead;i++) {
      p.px=p.x;p.py=p.y;p.x+=p.vx/steps;p.y+=p.vy/steps;
      if(solid(get(p.x,p.y))) {
        if(p.id==='drill'&&p.energy>0) {
          const def=materials[get(p.x,p.y)];if(def.durability<=8&&p.energy>=def.hardness){p.energy-=Math.max(1,dig(p.x,p.y,3,8,p.energy))*2;continue;}
        }
        if(p.mods.bounce>0){const hitX=solid(get(p.x,p.py));p.x=p.px;p.y=p.py;if(hitX)p.vx*=-1;else p.vy*=-1;p.mods.bounce--;burst(p.x,p.y,p.color,6,1);break;}
        impact(p,p.x,p.y);p.dead=true;break;
      }
      if(p.owner==='enemy'&&Math.abs(p.x-player.x)<5&&Math.abs(p.y-player.y)<8) {hurt(p.damage,'被击杀',p.detail||'被守井者的弹幕命中。');burst(p.x,p.y,p.color,10,2);p.dead=true;break;}
      if(p.owner==='player') {
        const e=enemies.find(e=>!e.dead&&Math.abs(e.x-p.x)<e.w/2+1&&Math.abs(e.y-p.y)<e.h/2+1);
        if(e){damageEnemy(e,p.damage,p.owner,p.mods.flame||p.id==='ember'?'flame':p.id==='frost'?'frost':'');impact(p,p.x,p.y);p.dead=true;break;}
      }
    }
    if(!p.dead&&(p.life<=0||p.x<2||p.x>W-2||p.y<2||p.y>H-2)){impact(p,p.x,p.y);p.dead=true;}
    if(!p.dead){particle(p.x,p.y,-p.vx*.05,-p.vy*.05,p.color,7,1,true);if(p.mods.flame&&get(p.px,p.py)===M.AIR)put(p.px,p.py,M.FIRE,22);}
  }
  projectiles=projectiles.filter(p=>!p.dead);
}

function sanctuaryAt(x,y) {return sanctuaries.find(s=>x>s.x&&x<s.x+s.w&&y>s.y&&y<s.y+s.h);}
function enemyShot(e,a,speed=2.5) {
  projectiles.push({x:e.x,y:e.y,px:e.x,py:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,id:'enemy',mods:{},payload:null,life:100,age:0,damage:9+e.level*2,color:'#f2949e',owner:'enemy',detail:e.type==='core'?'被赤核守卫的弹幕命中。':'被守井者的弹幕命中。',dead:false});
}
function updateEnemies() {
  for(const e of enemies) {
    if(e.dead||Math.abs(e.y-player.y)>VH+80)continue;
    if(e.flash>0)e.flash--;if(e.slow>0)e.slow--;if(e.cooldown>0)e.cooldown--;
    if(e.burning>0){e.burning--;if(tick%15===0)damageEnemy(e,3,e.lastPlayerHit?'player':'environment');}
    const m=get(e.x,e.y);
    if([M.ACID,M.LAVA,M.FIRE].includes(m)&&tick%15===0)damageEnemy(e,5,'environment');
    if(e.dead)continue;
    const dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy),visible=d<180&&clearLine(e.x,e.y,player.x,player.y)&&!activeSanctuary;
    const speed=e.slow>0?.45:1;
    e.dir=Math.sign(dx)||e.dir;
    if(e.type==='charger') {
      if(visible&&d<125&&Math.abs(dy)<30&&e.cooldown<=0&&e.mode==='idle'){e.mode='windup';e.cooldown=15;e.chargeDir=e.dir;}
      if(e.mode==='windup'&&e.cooldown<=0){e.mode='charge';e.cooldown=22;e.vx=e.chargeDir*2.5;e.vy=-1.5;sound('charge');}
      if(e.mode==='charge'&&e.cooldown<=0){e.mode='idle';e.cooldown=45;}
      if(e.mode==='idle')e.vx=visible?e.dir*.48:Math.sin(tick*.02+e.phase)*.15;
      if(e.mode==='windup')e.vx*=.6;
      e.vy=Math.min(4,e.vy+.23);moveBody(e,e.vx*speed,e.vy,true);
      if(d<12)hurt(e.mode==='charge'?16:7,'被击杀','被角甲冲锋撞倒。');
    } else if(e.type==='shooter') {
      e.vy=Math.min(4,e.vy+.2);moveBody(e,0,e.vy);
      if(visible&&e.cooldown<=0){const a=Math.atan2(dy,dx);for(let j=-1;j<=1;j++)enemyShot(e,a+j*.16);e.cooldown=75-Math.min(e.level*5,20);burst(e.x,e.y,'#f59fa8',6,1);}
    } else if(e.type==='wing') {
      const a=visible?Math.atan2(dy,dx):Math.atan2(e.homeY+Math.sin(tick*.05+e.phase)*15-e.y,Math.cos(tick*.03+e.phase)*14);
      e.vx=e.vx*.92+Math.cos(a)*.09;e.vy=e.vy*.92+Math.sin(a)*.09;
      moveBody(e,e.vx*speed,e.vy*speed);
      if(d<10)hurt(7+e.level,'被击杀','被夜翼撞伤。');
    } else if(e.type==='bomber') {
      if(e.mode==='fuse') {
        e.vx*=.8;
        if(e.cooldown<=0){e.dead=true;explode(e.x,e.y,23,55,'enemy',true);continue;}
      } else if(visible) {
        e.vx=e.vx*.92+dx/Math.max(1,d)*.08;e.vy=e.vy*.92+dy/Math.max(1,d)*.08;
        if(d<28){e.mode='fuse';e.cooldown=27;sound('charge');}
      } else {e.vx*=.95;e.vy*=.95;}
      moveBody(e,e.vx*speed,e.vy*speed);
    } else if(e.type==='burrower') {
      if(activeSanctuary)continue;
      if(e.cooldown<=0){e.mode=e.mode==='dive'?'rest':'dive';e.cooldown=e.mode==='dive'?60:50;e.vx=dx/Math.max(1,d)*1.25;e.vy=dy/Math.max(1,d)*1.25;}
      if(e.mode==='dive'&&d<185) {
        const nx=clamp(e.x+e.vx*speed,10,W-10),ny=clamp(e.y+e.vy*speed,e.level*LAYER+20,e.level*LAYER+326);
        dig(nx,ny,6,7,28);e.x=nx;e.y=ny;
        if(tick%4===0)burst(e.x,e.y,'#a49b87',3,.8);
      }
      if(d<12)hurt(12+e.level,'被击杀','被钻脊从岩层中击中。');
    } else if(e.type==='core') {
      e.x=310+Math.sin(tick*.024)*38;e.y=e.homeY+Math.sin(tick*.035)*8;
      if(d<230&&e.cooldown<=0){for(let j=0;j<12;j++)enemyShot(e,j*Math.PI/6+tick*.02,1.8);e.cooldown=40;shake=Math.max(shake,2);}
      if(d<22)hurt(24,'被击杀','触碰了赤核守卫。');
    }
    // Sanctuary thresholds are a real safe zone for resting and editing.
    if(sanctuaryAt(e.x,e.y)){e.y=e.level*LAYER+320;e.vy=-1;}
  }
}
function updateDebris() {
  for(const b of debris) {
    if(b.dead||Math.abs(b.y-player.y)>VH+60)continue;
    const supported=solid(get(b.x-b.r+1,b.y+b.r+1))||solid(get(b.x,b.y+b.r+1))||solid(get(b.x+b.r-1,b.y+b.r+1));
    if(!supported)b.falling=true;
    if(!b.falling)continue;
    b.vy=Math.min(6,b.vy+.26);
    for(let i=0;i<Math.ceil(b.vy);i++) {
      if(dist(player,b)<b.r+7&&b.vy>1.2)hurt(b.vy*12,'压死','被失去支撑的落石压住。');
      for(const e of enemies)if(!e.dead&&dist(e,b)<b.r+7&&b.vy>1.2)damageEnemy(e,b.vy*12,'environment');
      if(solid(get(b.x,b.y+b.r+1))){if(b.vy>2)burst(b.x,b.y,'#b3b9a5',14,2);b.vy=0;b.falling=false;break;}
      b.y+=b.vy/Math.ceil(b.vy);
    }
  }
}
function updatePlayer() {
  const p=player,left=keys.a||keys.arrowleft,right=keys.d||keys.arrowright,jump=keys.w||keys.arrowup||keys[' '];
  const axis=(right?1:0)-(left?1:0);
  p.onGround=blocked(p.x,p.y+1,p.w,p.h);
  p.vx=(p.vx+axis*.3)*.78;p.vx=clamp(p.vx,-1.6,1.6);if(axis)p.dir=axis;
  if(jump&&!p.jumpWasHeld&&p.onGround){p.vy=-3.4;burst(p.x,p.y+7,'#a7a382',7,.8);sound('jump');}
  if(jump&&!p.onGround&&p.fuel>0){p.vy=Math.max(-2.3,p.vy-.19);p.fuel=Math.max(0,p.fuel-1.15);if(tick%2===0)particle(p.x+rand(-2,2),p.y+7,rand(-.4,.4),rand(.4,1.4),'#deb976',15,1,true);}
  else {p.vy=Math.min(4.3,p.vy+.23);p.fuel=Math.min(p.maxFuel,p.fuel+(p.onGround?2.2:.2));}
  p.jumpWasHeld=jump;
  const bodyM=get(p.x,p.y),headM=get(p.x,p.y-6),feetM=get(p.x,p.y+6);
  if(liquids.has(bodyM)){p.vx*=.82;p.vy*=.86;if(jump)p.vy-=.18;}
  moveBody(p,p.vx,p.vy,true);
  p.x=clamp(p.x,6,W-7);p.y=clamp(p.y,9,H-10);
  if(p.inv>0)p.inv--;
  for(const status of ['wet','oily','burning','poison'])if(p[status]>0)p[status]--;
  const contact=[bodyM,feetM,headM];
  if(contact.includes(M.WATER)||contact.includes(M.BLOOD)){p.wet=180;p.burning=0;p.poison=Math.max(0,p.poison-8);p.oily=Math.max(0,p.oily-10);}
  if(contact.includes(M.OIL))p.oily=240;
  if((contact.includes(M.FIRE)||contact.includes(M.LAVA))&&p.wet<=0)p.burning=p.oily>0?300:150;
  if(contact.includes(M.LAVA))hurt(16/30,'烧死','被熔岩吞没。',true);
  if(contact.includes(M.ACID)){p.poison=150;hurt(7/30,'毒死','酸液腐蚀了身体。',true);}
  if(contact.includes(M.GAS)){p.poison=180;hurt(3/30,'毒死','吸入了腐蚀反应产生的毒气。',true);}
  if(p.burning>0){hurt(p.maxHp*.02/30*(p.oily>0?1.8:1),'烧死',p.oily>0?'油污使火焰越烧越烈。':'身上的火焰未被扑灭。',true);if(tick%3===0)particle(p.x+rand(-3,3),p.y+rand(-5,5),rand(-.2,.2),-.8,'#ffa34e',14,1,true);}
  if(p.poison>0)hurt(2/30,'毒死','毒素仍在持续侵蚀。',true);
  if(liquids.has(headM)){p.breath=Math.max(0,p.breath-1);if(!p.breath)hurt(9/30,'溺死','在液体中耗尽了空气。',true);}
  else p.breath=Math.min(240,p.breath+6);
  for(const w of wands)if(w){w.mana=Math.min(w.maxMana,w.mana+w.regen*p.manaRegen/30);if(w.cooldown>0)w.cooldown--;}
  if(aim.down&&!activeSanctuary)cast();
}
function addToStorage(id) {const i=storage.indexOf(null);if(i<0)return false;storage[i]=id;return true;}
function updatePickups() {
  for(const p of pickups) {
    if(p.taken||p.opened||Math.abs(p.y-player.y)>VH+60)continue;
    if(p.type!=='chest') {
      p.vy=Math.min(3,(p.vy||0)+.15);
      if(!solid(get(p.x,p.y+4+p.vy)))p.y+=p.vy;else p.vy=0;
    }
    const d=dist(player,p);
    if(p.type==='gold'&&d<24){p.x+=(player.x-p.x)*.18;p.y+=(player.y-p.y)*.18;if(d<9){gold+=p.value;p.taken=true;sound('gold');}}
    if(p.type==='flask'&&d<11&&player.hp<player.maxHp){player.hp=Math.min(player.maxHp,player.hp+30);p.taken=true;burst(p.x,p.y,'#e78991',20,1.5);toast('生命 +30');sound('perk');}
  }
  pickups=pickups.filter(p=>!p.taken);
}
function updateInteraction() {
  activeSanctuary=sanctuaryAt(player.x,player.y)||null;
  nearby=pickups.find(p=>!p.taken&&!p.opened&&['chest','wand','spell'].includes(p.type)&&dist(player,p)<20)||null;
  let text='';
  if(nearby)text=nearby.type==='chest'?'开启宝箱':nearby.type==='wand'?`拾取 ${nearby.wand.name}`:`拾取 ${spells[nearby.spell].name}`;
  else if(activeSanctuary||player.tinker)text='法杖编辑台';
  $('interactBtn').textContent=text;$('interactBtn').classList.toggle('hide',!text);
  if(activeSanctuary&&!activeSanctuary.visited) {
    activeSanctuary.visited=true;player.hp=player.maxHp;player.burning=player.poison=player.oily=0;player.fuel=player.maxFuel;player.breath=240;
    for(const w of wands)if(w){w.mana=w.maxMana;w.cooldown=0;}
    projectiles=projectiles.filter(p=>p.owner!=='enemy');offerPerks(activeSanctuary);sound('perk');
  }
}
function interact() {
  if(state!=='play')return;
  if(nearby?.type==='chest') {
    const p=nearby;p.opened=true;gold+=30+p.level*10;
    const id=p.level===0?'flame':allSpellIds[int(0,allSpellIds.length-1)];
    if(!addToStorage(id))pickups.push({type:'spell',spell:id,x:p.x+10,y:p.y,vy:-1});
    pickups.push({type:'flask',x:p.x-9,y:p.y-7,vy:-1.3});burst(p.x,p.y,'#ead381',35,2.4);toast(`+${30+p.level*10} G · ${spells[id].name}`);sound('perk');nearby=null;
  } else if(nearby?.type==='spell') {
    if(addToStorage(nearby.spell)){toast(`获得 ${spells[nearby.spell].name}`);nearby.taken=true;}else toast('法术储物格已满');
  } else if(nearby?.type==='wand') {
    const empty=wands.indexOf(null);
    if(empty>=0){wands[empty]=nearby.wand;nearby.taken=true;selectedWand=empty;toast(`获得 ${nearby.wand.name}`);lastHud='';}
    else openPickup(nearby);
  } else if(activeSanctuary||player.tinker)openEditor();
}
function clearInput() {keys={};aim.down=false;drag=null;$('dragGhost').classList.add('hide');document.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));$('fireBtn').querySelector('i').style.transform='';}
function showPanel(id,nextState) {
  clearInput();state=nextState;document.querySelectorAll('.overlay').forEach(el=>el.classList.add('hide'));$(id).classList.remove('hide');$('spellTooltip').classList.add('hide');
  requestAnimationFrame(()=>$(id).querySelector('button')?.focus({preventScroll:true}));
}
function closePanels() {document.querySelectorAll('.overlay').forEach(el=>el.classList.add('hide'));$('spellTooltip').classList.add('hide');clearInput();state='play';lastHud='';canvas.focus({preventScroll:true});}
function offerPerks(s) {
  if(s.perk)return;
  $('perkPanel').innerHTML=`<div class="dialog"><div class="panel-header"><div><span class="eyebrow">WAYSTATION ${s.level+1} / 生命与魔力已恢复</span><h2 id="perkTitle">静火驿站</h2></div></div><div class="perk-grid">${s.choices.map((p,i)=>`<button class="perk-option" data-perk="${i}"><span class="glyph">${p.glyph}</span><b>${p.name}</b><small>${p.desc}</small></button>`).join('')}</div></div>`;
  showPanel('perkPanel','perk');
}
function choosePerk(i) {
  if(state!=='perk'||!activeSanctuary||activeSanctuary.perk)return;
  const perk=activeSanctuary.choices[i];if(!perk)return;
  perk.apply(player);player.perks.push(perk.id);activeSanctuary.perk=true;toast(`获得 ${perk.name}`);closePanels();openEditor();
}
function spellCell(id,group,index) {
  const s=id?spells[id]:null;
  return `<button class="spell-cell ${s?'':'empty'}" data-group="${group}" data-index="${index}" data-spell="${id||''}" style="--spell-color:${s?.color||'#66796a'}" aria-label="${s?s.name:'空槽位'} ${index+1}"><span class="slot-index">${index+1}</span>${s?s.glyph:''}${s?`<span class="cost">${s.mana}</span>`:''}</button>`;
}
function renderEditor() {
  const s=activeSanctuary;
  $('wandPanel').innerHTML=`<div class="dialog editor"><div class="panel-header"><div><span class="eyebrow">${s?`静火驿站 ${s.level+1}`:'流浪工匠'} / ${gold} G</span><h2 id="editorTitle">法杖编辑台</h2></div><button class="icon-button" data-close title="关闭" aria-label="关闭">×</button></div>${wands.map((w,i)=>w?`<div class="editor-row"><div class="wand-info"><canvas data-wand-art="${i}" width="48" height="18"></canvas><h3>${i+1} · ${w.name}</h3><div class="stats"><span>容量 ${w.capacity} · 顺序施法</span><span>间隔 ${(w.castDelay/30).toFixed(2)}s · 充能 ${(w.recharge/30).toFixed(2)}s</span><span>魔力 ${w.maxMana} · 回复 ${Math.round(w.regen*player.manaRegen)}/s</span></div></div><div class="spell-row">${w.slots.map((id,j)=>spellCell(id,i,j)).join('')}</div></div>`:'').join('')}<div class="editor-section"><div class="section-heading"><h3>法术储物格</h3><span>${storage.filter(Boolean).length} / ${storage.length}</span></div><div class="storage-grid">${storage.map((id,i)=>spellCell(id,'storage',i)).join('')}</div></div>${s?`<div class="editor-section"><div class="section-heading"><h3>驿站藏品</h3><span>${gold} G</span></div><div class="shop-grid">${s.shop.map((item,i)=>`<button class="shop-item" data-buy="${i}" style="--spell-color:${spells[item.id].color}" ${item.sold||gold<item.cost?'disabled':''}><span class="glyph">${spells[item.id].glyph}</span><span><strong>${spells[item.id].name}</strong><small>${item.sold?'已售出':item.cost+' G'}</small></span></button>`).join('')}</div></div>`:''}<div class="editor-footer"><span>${player.perks.map(id=>perkDefs.find(p=>p.id===id).name).join(' · ')}</span><button class="command primary" data-close>继续深入</button></div></div>`;
  drawWandIcons();selectedCell=null;
}
function openEditor() {if(!activeSanctuary&&!player.tinker)return;renderEditor();showPanel('wandPanel','editor');}
function cellLocation(el) {return {group:el.dataset.group,index:Number(el.dataset.index)};}
function cellArray(loc) {return loc.group==='storage'?storage:wands[Number(loc.group)].slots;}
function swapCells(a,b) {
  const aa=cellArray(a),bb=cellArray(b);[aa[a.index],bb[b.index]]=[bb[b.index],aa[a.index]];
  for(const w of wands)if(w){w.cursor=0;w.cooldown=w.recharge;}
  renderEditor();lastHud='';sound('gold');
}
function buySpell(i) {
  const item=activeSanctuary?.shop[i];if(!item||item.sold||gold<item.cost)return;
  if(!addToStorage(item.id)){toast('法术储物格已满');return;}
  gold-=item.cost;item.sold=true;renderEditor();sound('gold');
}
let pendingPickup=null;
function openPickup(p) {
  pendingPickup=p;
  $('pickupPanel').innerHTML=`<div class="dialog narrow"><span class="eyebrow">${p.wand.capacity} 槽 · ${p.wand.maxMana} 魔力</span><h2 id="pickupTitle">${p.wand.name}</h2><div class="pickup-options">${wands.map((w,i)=>`<button class="pickup-option" data-replace="${i}"><span>${i+1} · ${w.name}</span><span>替换 ↓</span></button>`).join('')}</div><button class="command" data-close>保留现有魔杖</button></div>`;
  showPanel('pickupPanel','pickup');
}
function replaceWand(i) {if(!pendingPickup)return;const previous=wands[i];wands[i]=pendingPickup.wand;pendingPickup.wand=previous;selectedWand=i;pendingPickup=null;closePanels();}
function pause() {if(state==='pause'){closePanels();return;}if(state!=='play')return;$('pauseStats').textContent=`${biomes[biomeIndex(player.y)].name} · ${Math.floor(maxDepth)} m · 种子 ${seed}`;showPanel('pausePanel','pause');}
function finishRun(win,cause,detail) {
  if(player.dead)return;player.dead=!win;state=win?'won':'dead';
  $('resultTitle').textContent=win?'深井复明':'余烬熄灭';$('deadReason').textContent=win?'赤核已破，远征完成':`死因：${cause}`;$('deathDetail').textContent=detail;
  const seconds=Math.floor(elapsedTicks/30),duration=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  $('runStats').innerHTML=`<div><b>${Math.floor(maxDepth)}</b><span>最深 / m</span></div><div><b>${kills}</b><span>击杀</span></div><div><b>${duration}</b><span>生存时间</span></div>`;
  showPanel('resultPanel',win?'won':'dead');sound(win?'perk':'death');updateHud();
}

const rgb = color => [parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16)];
materials.forEach(m=>m.rgb=rgb(m.color));
const spritePalette={h:'#b6cbbb',s:'#ecd8a3',d:'#374a48',c:'#4b9794',m:'#945264',b:'#263439',w:'#e9c888',o:'#c98155',r:'#b65760',e:'#f6dfa0',g:'#799579',k:'#353c3a',a:'#a6a17c',v:'#885975',t:'#657c74',i:'#b8d9d0'};
const sprites={
  player:['     hh     ','    hhhh    ','    hhhd    ','   hhhhhh   ','     ssd    ','    dss     ','   mcccc    ','  mmcccsc   ','  mmcccdww  ','  mmmccc    ','   mmccc    ','   mmccd    ','    cccd    ','    b bb    ','   bb bb    '],
  charger:['  a      a  ','  aa    aa  ','   aaaaaa   ','  akkakka   ',' aaeeeeaaa  ',' aakkkkaaa  ','  aaooaaa   ','  aoookaa   ','  kkkkkk    ','  kk  kk    ',' kk    kk   '],
  shooter:['    ttt     ','   ttttt    ','  tteett    ','   tddt     ','  rrrrtt    ',' rrrrtttt   ',' rrrrtteww  ','  rrtttt    ','   ttttt    ','   bb bb    ','   bb bb    '],
  wing:['vv        vv',' vvv    vvv ','  vvv  vvv  ','   vvssvv   ','   veeeev   ','    vvvv    ','    v  v    '],
  bomber:['    oo     ','   oeoo    ','  ookkoo   ',' ooorrooo  ',' oorrrroo  ',' ooorrooo  ','  ookkoo   ','   oooo    ','   k  k    '],
  burrower:['  ia  aa   ',' iaiaaaaa  ','iaakkkkaaai',' aaeeeeaaa ','iaakkkkaaai','  aaaaaai  ','   aa  a   ']
};
function drawSprite(name,x,y,dir=1,flash=false) {
  const art=sprites[name];if(!art)return;
  ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(dir,1);
  for(let row=0;row<art.length;row++)for(let col=0;col<art[row].length;col++) {
    const key=art[row][col];if(key===' ')continue;
    ctx.fillStyle=flash?'#fff6d5':spritePalette[key];ctx.fillRect(col-Math.floor(art[0].length/2),row-Math.floor(art.length/2),1,1);
  }
  ctx.restore();
}
function wandArt(context,w,x,y,angle=-.22) {
  context.save();context.translate(x,y);context.rotate(angle);
  context.fillStyle='#302e25';context.fillRect(-15,-1,30,4);
  context.fillStyle='#a18b62';context.fillRect(-14,0,22,2);
  context.fillStyle='#d5b783';context.fillRect(-9,0,4,1);context.fillRect(-2,-1,2,4);
  context.fillStyle=w.color;context.fillRect(6,-2,9,5);context.fillRect(13,-1,3,3);
  context.fillStyle='#e0f1ce';context.fillRect(10,-2,2,2);context.restore();
}
function drawWandIcons() {document.querySelectorAll('[data-wand-art]').forEach(c=>{const w=wands[Number(c.dataset.wandArt)];if(w){const cctx=c.getContext('2d');cctx.clearRect(0,0,c.width,c.height);wandArt(cctx,w,c.width/2,c.height/2);}});}
function drawTerrain() {
  const pixels=terrainImage.data,cx=Math.floor(camera.x),cy=Math.floor(camera.y);
  for(let py=0;py<VH;py++) {
    const y=cy+py,b=biomes[biomeIndex(y)];
    for(let px=0;px<VW;px++) {
      const x=cx+px,m=get(x,y),i=(py*VW+px)*4;
      if(m===M.AIR){pixels[i+3]=0;continue;}
      let color=materials[m].rgb,shade=1,alpha=255;
      const n=hash(x>>1,y>>1,7),grain=hash(x,y,12),patch=hash(x>>3,y>>3,4);
      if([M.ROCK,M.DIRT,M.COAL].includes(m)) {
        color=m===M.DIRT?b.soil:m===M.COAL?materials[m].rgb:b.rock;
        shade=.65+n*.43+(grain>.89?.27:0)+(patch-.5)*.3;
        if(hash((x+((y>>2)%3))>>2,y>>2,25)<.19)shade*=.63;
        if(!solid(get(x,y-1))) {color=b.rim;shade=.65+grain*.45;}
        else if(!solid(get(x,y-2))&&grain>.3){color=b.soil;shade=1;}
        else if(!solid(get(x-1,y))||!solid(get(x+1,y)))shade*=.68;
      } else if(m===M.BRICK) {
        const seam=y%8===0||(x+(Math.floor(y/8)%2)*8)%16===0;
        shade=seam?.48:y%8===1?1.04:.75+grain*.12;
      } else if(m===M.WOOD) {
        shade=y%3===0?.56:.9+grain*.2;if((x+Math.floor(y/4)*7)%19===0)shade=.45;
      } else if(m===M.MOSS)shade=.58+grain*.55;
      else if(m===M.ICE){shade=.7+patch*.35+(grain>.94?.3:0);if((x+y)%13===0)shade=1.25;}
      else if(m===M.GOLD){shade=.8+grain*.5;if(grain>.92)color=[247,227,159];}
      else if(m===M.FIRE){color=(x+y+tick)%3===0?[255,239,143]:(x+tick)%2?[255,166,58]:[239,91,42];}
      else if(m===M.LAVA){shade=.85+Math.sin(x*.2+y*.3+tick*.16)*.17;if(get(x,y-1)!==m)color=[255,196,74];}
      else if(liquids.has(m)){shade=.72+((x+tick/2+(y%3)*6)%25<8?.16:0);alpha=220;if(get(x,y-1)!==m){shade=1.4;alpha=240;}}
      else if(gases.has(m)){shade=.75+grain*.35;alpha=m===M.GAS?80:65;}
      else shade=.75+grain*.4;
      pixels[i]=clamp(color[0]*shade,0,255);pixels[i+1]=clamp(color[1]*shade,0,255);pixels[i+2]=clamp(color[2]*shade,0,255);pixels[i+3]=alpha;
    }
  }
  terrainCtx.putImageData(terrainImage,0,0);ctx.drawImage(terrainCanvas,0,0);
}
function drawBackground() {
  const b=biomes[biomeIndex(camera.y+VH/2)];ctx.fillStyle=`rgb(${b.bg.join(',')})`;ctx.fillRect(0,0,VW,VH);
  // Coarse, displaced stone silhouettes sit behind the material grid.
  const ox=Math.floor(camera.x*.3),oy=Math.floor(camera.y*.3);
  for(let y=-20;y<VH+24;y+=12)for(let x=-24;x<VW+24;x+=18) {
    const n=hash(Math.floor((x+ox)/18),Math.floor((y+oy)/12),72);
    ctx.fillStyle=n>.6?'#192321':'#101916';ctx.globalAlpha=.35;
    ctx.fillRect(x-ox%18+(Math.floor((y+oy)/12)%2)*7,y-oy%12,n>.7?23:15,n>.5?9:6);
  }
  ctx.globalAlpha=1;
  for(const d of decorations) {
    const x=Math.round(d.x-camera.x),y=Math.round(d.y-camera.y);if(y>VH+25||y+(d.h||30)<-25)continue;
    if(d.type==='timber') {
      ctx.fillStyle='#302c20';ctx.fillRect(x,y,d.w,5);ctx.fillRect(x+3,y,6,d.h);ctx.fillRect(x+d.w-10,y,6,d.h);
      ctx.fillStyle='#52402a';ctx.fillRect(x,y, d.w,1);ctx.fillRect(x+4,y,1,d.h);ctx.fillRect(x+d.w-9,y,1,d.h);
      ctx.strokeStyle='#423822';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+8,y+25);ctx.lineTo(x+29,y+5);ctx.moveTo(x+d.w-8,y+25);ctx.lineTo(x+d.w-29,y+5);ctx.stroke();
      ctx.strokeStyle='#4b4a32';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+22,y+5);ctx.quadraticCurveTo(x+d.w/2,y+35,x+d.w-25,y+5);ctx.stroke();
      for(let j=10;j<d.h;j+=13){ctx.fillStyle='#584632';ctx.fillRect(x+3,y+j,6,2);ctx.fillRect(x+d.w-10,y+j,6,2);}
    } else if(d.type==='roots') {
      for(let j=0;j<12;j++){ctx.fillStyle=j%2?'#395c40':'#41432c';ctx.fillRect(x+j*11,y,1,12+hash(j,d.y)*d.h);}
    } else if(d.type==='icicles') {
      for(let j=0;j<12;j++){const h=4+hash(j,d.y)*25;ctx.fillStyle='#3e6875';ctx.fillRect(x+j*11,y,3,h);ctx.fillStyle='#78a3af';ctx.fillRect(x+j*11,y,1,h+3);}
    } else if(d.type==='arch') {
      ctx.strokeStyle='#49413b';ctx.lineWidth=5;ctx.strokeRect(x,y,d.w,d.h);ctx.lineWidth=1;
      for(let j=12;j<d.w;j+=18){ctx.fillStyle='#615248';ctx.fillRect(x+j,y,1,5);}
    } else if(d.type==='sanctuary') {
      ctx.fillStyle='#192a25';ctx.fillRect(x,y,d.w,d.h);
      for(let bx=0;bx<d.w;bx+=24)for(let by=0;by<d.h;by+=12){ctx.strokeStyle='#2c3d31';ctx.strokeRect(x+bx+(by%24?8:0),y+by,23,11);}
      for(let j=24;j<d.w;j+=70){ctx.fillStyle='#465144';ctx.fillRect(x+j,y,5,d.h);ctx.fillStyle='#6b7358';ctx.fillRect(x+j-2,y,9,3);}
      ctx.fillStyle='#7a8b64';ctx.fillRect(x+82,y+28,44,5);ctx.fillRect(x+88,y+33,4,10);ctx.fillRect(x+116,y+33,4,10);
      ctx.fillStyle='#c8c58b';ctx.fillRect(x+96,y+25,12,3);ctx.fillStyle='#63b49c';ctx.fillRect(x+100,y+22,5,3);
      ctx.fillStyle='#b3bda0';ctx.font='5px monospace';ctx.fillText('WAYSTATION',x+180,y+15);
      for(let j=0;j<4;j++){ctx.fillStyle='#bea365';ctx.fillRect(x+181+j*24,y+32,15,2);ctx.fillStyle=['#dea267','#86c6b8','#be9ec1','#c4dca0'][j];ctx.fillRect(x+187+j*24,y+25,2,7);}
      ctx.fillStyle='#bfcb9f';ctx.fillRect(x+d.w-32,y+d.h-10,1,5);ctx.fillRect(x+d.w-35,y+d.h-7,7,1);
    }
  }
}
function drawDecorations() {
  for(const d of decorations) {
    const x=Math.round(d.x-camera.x),y=Math.round(d.y-camera.y);if(y<-40||y>VH+40)continue;
    if(d.type==='torch') {
      ctx.fillStyle='#806546';ctx.fillRect(x-1,y,2,8);ctx.fillStyle='#c69b57';ctx.fillRect(x-2,y,4,2);
      ctx.fillStyle=biomeIndex(d.y)===3?'#68c8dd':'#ef873b';ctx.fillRect(x-2,y-5,4,6);ctx.fillRect(x+(tick%3)-1,y-8,2,5);
      ctx.fillStyle=biomeIndex(d.y)===3?'#c7f5ee':'#ffdd8a';ctx.fillRect(x-1,y-4,2,4);
      if(state==='play'&&tick%5===0&&hash(d.x,tick)>.5)particle(d.x,d.y-6,rand(-.3,.3),-.5,'#f4c078',20,1,true);
    } else if(d.type==='fungus') {
      ctx.fillStyle='#447d82';ctx.fillRect(x,y-d.size,2,d.size);ctx.fillStyle=d.color;
      ctx.fillRect(x-5,y-d.size,12,4);ctx.fillRect(x-3,y-d.size-3,8,3);ctx.fillStyle='#b0ded1';ctx.fillRect(x-2,y-d.size-2,2,2);ctx.fillRect(x+3,y-d.size+1,2,1);
    }
  }
  const start=Math.max(10,Math.floor(camera.y/12)*12);
  for(let y=start;y<camera.y+VH;y+=12)for(let x=10;x<W-10;x+=13) {
    if(!solid(get(x,y))||get(x,y-1)!==M.AIR)continue;
    const sx=x-camera.x,sy=y-camera.y,n=hash(x,y,51),b=biomeIndex(y);
    if(n>.65){ctx.fillStyle=b===3?'#a4ced2':b===2?'#b96d9c':'#697347';ctx.fillRect(sx,sy-3,1,3);ctx.fillRect(sx+2,sy-2,1,2);}
  }
}
function drawEntities() {
  for(const p of pickups) {
    if(p.taken)continue;const x=Math.round(p.x-camera.x),y=Math.round(p.y-camera.y);if(y<-15||y>VH+15)continue;
    if(p.type==='chest') {
      ctx.fillStyle='#3e3423';ctx.fillRect(x-7,y-3,14,9);ctx.fillStyle='#9d7644';ctx.fillRect(x-6,y-3,12,7);ctx.fillStyle='#d2af68';ctx.fillRect(x-7,y-3,14,1);ctx.fillRect(x-5,y-4,1,9);ctx.fillRect(x+4,y-4,1,9);
      ctx.fillStyle='#352d21';ctx.fillRect(x-6,y,12,1);ctx.fillStyle='#e6c87b';ctx.fillRect(x-1,y,2,3);
      if(p.opened){ctx.fillStyle='#171b13';ctx.fillRect(x-5,y-3,10,3);ctx.fillStyle='#b99b58';ctx.fillRect(x-7,y-6,14,2);}
    } else if(p.type==='wand'){wandArt(ctx,p.wand,x,y+Math.sin(tick*.09)*1.5,-.6);}
    else if(p.type==='flask'){ctx.fillStyle='#c9ded1';ctx.fillRect(x-2,y-5,4,2);ctx.fillRect(x-3,y-2,6,7);ctx.fillStyle='#bf5f74';ctx.fillRect(x-2,y,4,4);ctx.fillStyle='#e9d6ba';ctx.fillRect(x-1,y-1,1,3);ctx.fillStyle='#928565';ctx.fillRect(x-2,y-6,4,1);}
    else if(p.type==='spell'){ctx.fillStyle=spells[p.spell].color;ctx.fillRect(x-3,y-4,6,8);ctx.fillStyle='#1a3429';ctx.fillRect(x-1,y-2,2,4);}
    else {ctx.fillStyle='#ac8238';ctx.fillRect(x-2,y-2,4,4);ctx.fillStyle='#efd788';ctx.fillRect(x-1,y-2,2,3);ctx.fillStyle='#fff0b4';ctx.fillRect(x-1,y-2,1,1);}
  }
  for(const b of debris) {
    const x=Math.round(b.x-camera.x),y=Math.round(b.y-camera.y);if(y<-12||y>VH+12)continue;
    ctx.fillStyle='#3e4646';ctx.fillRect(x-6,y-4,12,9);ctx.fillRect(x-4,y-6,8,12);ctx.fillStyle='#747d72';ctx.fillRect(x-4,y-5,7,2);ctx.fillRect(x-5,y-3,2,4);ctx.fillStyle='#929a83';ctx.fillRect(x-3,y-4,3,1);
  }
  for(const e of enemies) {
    if(e.dead)continue;const x=e.x-camera.x,y=e.y-camera.y;if(y<-20||y>VH+20)continue;
    if(e.type==='core') {
      ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.rotate(tick*.025);ctx.strokeStyle=e.flash?'#fffbd0':'#c5896d';ctx.lineWidth=3;ctx.strokeRect(-11,-11,22,22);ctx.strokeStyle='#71696b';ctx.lineWidth=1;ctx.strokeRect(-15,-15,30,30);ctx.restore();
      ctx.fillStyle=e.flash?'#fffbd0':'#f1b26d';ctx.fillRect(x-5,y-5,10,10);ctx.fillStyle='#953e55';ctx.fillRect(x-2,y-2,4,4);
    } else drawSprite(e.type,x,y+(e.type==='wing'?Math.sin(tick*.5)*2:0),e.dir,e.flash>0||(e.mode==='fuse'&&tick%6<3));
    if(e.hp<e.maxHp){ctx.fillStyle='#242c21';ctx.fillRect(x-7,y-e.h/2-4,14,2);ctx.fillStyle='#d88077';ctx.fillRect(x-7,y-e.h/2-4,14*e.hp/e.maxHp,1);}
    if(e.mode==='windup'){ctx.fillStyle='#f0bf68';ctx.fillRect(x-1,y-12,2,4);ctx.fillRect(x-1,y-7,2,1);}
  }
  if(!player.dead) {
    const x=player.x-camera.x,y=player.y-camera.y;
    ctx.globalAlpha=player.inv>0&&tick%4<2?.5:1;drawSprite('player',x,y,player.dir);ctx.globalAlpha=1;
    const a=aim.touch?aim.angle:Math.atan2(aim.y-y,aim.x-x);
    ctx.save();ctx.translate(Math.round(x),Math.round(y-1));ctx.rotate(a);ctx.fillStyle='#bcb48b';ctx.fillRect(4,0,8,2);ctx.fillStyle=wands[selectedWand]?.color||'#8acbbb';ctx.fillRect(10,-1,3,3);ctx.restore();
  }
  for(const p of projectiles) {
    const x=p.x-camera.x,y=p.y-camera.y;ctx.fillStyle=p.color;
    if(p.id==='bomb'){ctx.fillRect(x-3,y-3,6,6);ctx.fillStyle='#34291e';ctx.fillRect(x-1,y-1,2,2);}
    else {ctx.fillRect(Math.round(x)-1,Math.round(y)-1,p.id==='ember'?4:2,p.id==='ember'?4:2);ctx.strokeStyle=p.color;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-p.vx*1.3,y-p.vy*1.3);ctx.stroke();}
  }
  for(const p of particles) {
    const x=p.x-camera.x,y=p.y-camera.y;if(y<-25||y>VH+25)continue;ctx.globalAlpha=p.life/p.maxLife;
    if(p.ring){ctx.strokeStyle=p.color;ctx.beginPath();ctx.arc(x,y,p.size*(1-p.life/p.maxLife),0,Math.PI*2);ctx.stroke();}
    else {ctx.fillStyle=p.color;ctx.fillRect(Math.round(x),Math.round(y),p.size,p.size);}
  }
  ctx.globalAlpha=1;
}
function sceneLights() {
  const list=lights.filter(l=>l.y>camera.y-l.r&&l.y<camera.y+VH+l.r).map(l=>({...l,power:l.power,r:l.r*(.97+Math.sin(tick*.21+l.x)*.025)}));
  if(!player.dead) {
    const a=aim.touch?aim.angle:Math.atan2(aim.y+camera.y-player.y,aim.x+camera.x-player.x);
    list.push({x:player.x+Math.cos(a)*12,y:player.y-1+Math.sin(a)*12,r:49,power:.73,color:wands[selectedWand].color});
  }
  for(const p of projectiles)list.push({x:p.x,y:p.y,r:p.id==='bomb'?24:38,power:.85,color:p.color});
  for(const d of decorations)if(d.type==='fungus'&&Math.abs(d.y-player.y)<VH)list.push({x:d.x,y:d.y-d.size,r:29,power:.6,color:d.color});
  for(let y=Math.max(2,Math.floor(camera.y));y<Math.min(H-2,camera.y+VH);y+=7)for(let x=3;x<W-3;x+=7) {
    const m=get(x,y);if(m===M.FIRE||m===M.LAVA)list.push({x,y,r:m===M.FIRE?24:30,power:.65,color:m===M.FIRE?'#fbb459':'#fb8748'});
  }
  for(const p of particles)if(p.ring)list.push({x:p.x,y:p.y,r:p.size*3,power:p.life/p.maxLife,color:p.color});
  return list.slice(0,120);
}
function drawLighting() {
  const sources=sceneLights();
  // Erase holes only in an alpha mask; the opaque scene below is never erased.
  lightCtx.globalCompositeOperation='source-over';lightCtx.clearRect(0,0,VW,VH);lightCtx.fillStyle='rgba(1,5,5,.87)';lightCtx.fillRect(0,0,VW,VH);
  lightCtx.globalCompositeOperation='destination-out';
  for(const l of sources) {
    const x=l.x-camera.x,y=l.y-camera.y,g=lightCtx.createRadialGradient(x,y,0,x,y,l.r);
    g.addColorStop(0,`rgba(0,0,0,${l.power})`);g.addColorStop(.28,`rgba(0,0,0,${l.power*.84})`);g.addColorStop(.68,`rgba(0,0,0,${l.power*.32})`);g.addColorStop(1,'rgba(0,0,0,0)');
    lightCtx.fillStyle=g;lightCtx.fillRect(x-l.r,y-l.r,l.r*2,l.r*2);
  }
  ctx.drawImage(lightCanvas,0,0);ctx.globalCompositeOperation='screen';
  for(const l of sources) {
    const x=l.x-camera.x,y=l.y-camera.y,r=l.r*.7,g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,l.color+'27');g.addColorStop(.35,l.color+'12');g.addColorStop(1,l.color+'00');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  ctx.globalCompositeOperation='source-over';
}
function render() {
  if(!world)return;
  ctx.save();const sx=shakeOn&&shake>.3?Math.sin(tick*13)*shake:0,sy=shakeOn&&shake>.3?Math.cos(tick*17)*shake*.6:0;
  ctx.translate(Math.round(sx),Math.round(sy));drawBackground();drawTerrain();drawDecorations();drawEntities();drawLighting();ctx.restore();
  if(state==='play'&&!aim.touch){ctx.strokeStyle='#d3e1c78c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(aim.x-4,aim.y);ctx.lineTo(aim.x-2,aim.y);ctx.moveTo(aim.x+2,aim.y);ctx.lineTo(aim.x+4,aim.y);ctx.moveTo(aim.x,aim.y-4);ctx.lineTo(aim.x,aim.y-2);ctx.moveTo(aim.x,aim.y+2);ctx.lineTo(aim.x,aim.y+4);ctx.stroke();}
}

function updateHud() {
  const w=wands[selectedWand];
  $('hpFill').style.width=`${clamp(player.hp/player.maxHp,0,1)*100}%`;$('hpText').textContent=`${Math.ceil(Math.max(0,player.hp))} / ${player.maxHp}`;
  $('manaFill').style.width=`${w.mana/w.maxMana*100}%`;$('manaText').textContent=`${Math.floor(w.mana)} / ${w.maxMana}`;
  $('hoverFill').style.width=`${player.fuel/player.maxFuel*100}%`;$('hoverText').textContent=`${Math.round(player.fuel/player.maxFuel*100)}%`;
  $('biome').textContent=activeSanctuary?'静火驿站':biomes[biomeIndex(player.y)].name;$('depth').textContent=`${String(Math.floor(Math.max(0,player.y-100))).padStart(3,'0')} m`;
  $('gold').textContent=`${gold} G`;$('kills').textContent=`${kills} 击杀`;
  $('statuses').textContent=[player.burning>0?'燃烧':'',player.poison>0?'中毒':'',player.wet>0?'湿润':'',player.oily>0?'油污':'',player.breath<240?`空气 ${Math.ceil(player.breath/240*100)}%`:''].filter(Boolean).join(' · ');
  const signature=JSON.stringify([selectedWand,wands.map(w=>w?[w.name,w.slots]:null),w.cursor]);
  if(signature!==lastHud) {
    lastHud=signature;
    $('wandHud').innerHTML=wands.map((item,i)=>`<button class="wand-slot ${i===selectedWand?'active':''} ${item?'':'empty'}" data-select-wand="${i}" title="${item?item.name:'空魔杖位'}" aria-label="${i+1} ${item?item.name:'空魔杖位'}" aria-pressed="${i===selectedWand}"><span class="number">${i+1}</span>${item?`<canvas width="48" height="24" data-wand-art="${i}"></canvas>`:''}</button>`).join('');
    $('castHud').innerHTML=`<span class="cast-name">${w.name}</span><div class="cast-spells">${w.slots.filter(Boolean).map((id,i)=>`<span class="mini-spell ${i===w.cursor?'current':''}" style="--spell-color:${spells[id].color}" title="${spells[id].name}">${spells[id].glyph}</span>`).join('')}</div>`;drawWandIcons();
  }
  const m=get(aim.x+camera.x,aim.y+camera.y);currentMaterial=materials[m].name;$('materialLabel').textContent=m===M.AIR?'':currentMaterial;
}
function toast(message) {$('toast').textContent=message;$('toast').classList.add('visible');toastUntil=performance.now()+2400;}
function unlockAudio() {
  if(!soundOn)return;
  try {audioContext??=new (window.AudioContext||window.webkitAudioContext)();if(!audioMaster){audioMaster=audioContext.createGain();audioMaster.gain.value=.1;audioMaster.connect(audioContext.destination);}if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch{soundOn=false;}
}
function setSound(on) {
  soundOn=on;$('soundSetting').checked=on;$('soundBtn').setAttribute('aria-pressed',String(on));$('soundBtn').title=on?'关闭音效':'开启音效';$('soundBtn').setAttribute('aria-label',on?'关闭音效':'开启音效');
  if(audioMaster)audioMaster.gain.value=on?.1:0;if(on)unlockAudio();
}
function sound(kind) {
  if(!soundOn||!audioContext||audioContext.state!=='running')return;
  const now=audioContext.currentTime;if(now-lastSound<.025)return;lastSound=now;
  const f={cast:520,hit:170,hurt:105,boom:75,jump:220,gold:880,perk:660,charge:140,death:65}[kind]||300;
  const duration=kind==='boom'?.4:kind==='perk'?.3:.12;
  const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type=['boom','hurt','death'].includes(kind)?'sawtooth':'triangle';
  oscillator.frequency.setValueAtTime(f,now);oscillator.frequency.exponentialRampToValueAtTime(kind==='gold'||kind==='perk'?f*1.5:Math.max(25,f*.35),now+duration);
  gain.gain.setValueAtTime(kind==='boom'?.6:.28,now);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
  oscillator.connect(gain);gain.connect(audioMaster);oscillator.start(now);oscillator.stop(now+duration);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}
function resize() {
  const ratio=innerWidth/innerHeight;VW=ratio<1?240:480;VH=Math.round(VW/ratio);
  for(const c of [canvas,terrainCanvas,lightCanvas]){c.width=VW;c.height=VH;}
  terrainImage=terrainCtx.createImageData(VW,VH);ctx.imageSmoothingEnabled=false;
  if(player){camera.x=clamp(player.x-VW*.45,0,Math.max(0,W-VW));camera.y=clamp(player.y-VH*.4,0,H-VH);render();}
}
function update() {
  if(state!=='play')return;
  tick++;elapsedTicks++;activeSanctuary=sanctuaryAt(player.x,player.y)||null;
  updatePlayer();if(state!=='play')return;
  simulateMaterials();updateProjectiles();if(state!=='play')return;
  updateEnemies();if(state!=='play')return;
  updateDebris();if(state!=='play')return;
  updatePickups();updateInteraction();
  for(const p of particles){p.life--;p.x+=p.vx;p.y+=p.vy;if(!p.glow)p.vy+=.05;else p.vy*=.97;}
  particles=particles.filter(p=>p.life>0);shake*=.72;
  camera.x+= (clamp(player.x-VW*.45,0,Math.max(0,W-VW))-camera.x)*.16;
  camera.y+= (clamp(player.y-VH*.42,0,Math.max(0,H-VH))-camera.y)*.13;
  maxDepth=Math.max(maxDepth,player.y-100);if(tick%3===0)updateHud();
}
function startGame() {
  const given=new URLSearchParams(location.search).get('seed');
  seed=given!==null&&/^\d+$/.test(given)?Number(given)>>>0:crypto.getRandomValues(new Uint32Array(1))[0];rng=randomGenerator(seed);
  tick=0;elapsedTicks=0;kills=0;gold=0;maxDepth=0;selectedWand=0;shake=0;activeSanctuary=null;nearby=null;selectedCell=null;pendingPickup=null;lastHud='';
  wands=[makeWand('青铜微光',['spark','spark'],5,{delay:7,recharge:15,regen:40}),makeWand('掘井枝',['drill','bomb'],5,{delay:12,recharge:28,mana:160,regen:32,color:'#dfb67e'}),null,null];
  storage=['scatter','homing','timer','water','bounce','frost',null,null,null,null,null,null];
  generateWorld();clearInput();camera={x:clamp(player.x-VW*.45,0,W-VW),y:0};aim={x:player.x+80-camera.x,y:player.y,down:false,angle:0,touch:matchMedia('(pointer:coarse)').matches};
  closePanels();resize();updateHud();toast('锈脉矿坑');
}
function selectWand(index) {if(state!=='play'||!wands[index])return;selectedWand=index;lastHud='';updateHud();}
function cycleWand(direction) {for(let i=1;i<=4;i++){const next=(selectedWand+i*direction+8)%4;if(wands[next]){selectWand(next);break;}}}
function tooltip(cell,x,y) {
  const id=cell.dataset.spell;if(!id){$('spellTooltip').classList.add('hide');return;}
  const s=spells[id];$('spellTooltip').innerHTML=`<b>${s.glyph} ${s.name}</b><span>${{projectile:'弹体',modifier:'修饰',trigger:'触发'}[s.kind]} · ${s.mana} 魔力${s.damage?' · '+s.damage+' 伤害':''}</span><br>${s.desc}`;
  $('spellTooltip').classList.remove('hide');$('spellTooltip').style.left=`${clamp(x+14,8,innerWidth-230)}px`;$('spellTooltip').style.top=`${clamp(y+14,8,innerHeight-140)}px`;
}
function handleCellTap(cell) {
  const loc=cellLocation(cell);
  if(selectedCell){if(selectedCell.group!==loc.group||selectedCell.index!==loc.index)swapCells(selectedCell,loc);else {selectedCell=null;cell.classList.remove('selected');}}
  else if(cellArray(loc)[loc.index]){selectedCell=loc;cell.classList.add('selected');}
}
$('wandPanel').addEventListener('pointerdown',e=>{
  const cell=e.target.closest('.spell-cell');if(!cell)return;e.preventDefault();
  const loc=cellLocation(cell);drag={loc,x:e.clientX,y:e.clientY,moving:false,id:e.pointerId,cell};cell.setPointerCapture(e.pointerId);tooltip(cell,e.clientX,e.clientY);
});
document.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const id=cellArray(drag.loc)[drag.loc.index];
  if(id&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moving=true;
  if(drag.moving){$('spellTooltip').classList.add('hide');const ghost=$('dragGhost');ghost.classList.remove('hide');ghost.textContent=spells[id].glyph;ghost.style.setProperty('--spell-color',spells[id].color);ghost.style.left=`${e.clientX}px`;ghost.style.top=`${e.clientY}px`;}
});
document.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.spell-cell');
  if(drag.moving){if(target)swapCells(drag.loc,cellLocation(target));}
  else if(target)handleCellTap(target);
  drag=null;$('dragGhost').classList.add('hide');
});
document.addEventListener('pointercancel',()=>{drag=null;$('dragGhost').classList.add('hide');$('spellTooltip').classList.add('hide');});
$('wandPanel').addEventListener('pointerover',e=>{const cell=e.target.closest('.spell-cell');if(cell&&!drag&&e.pointerType!=='touch')tooltip(cell,e.clientX,e.clientY);});
$('wandPanel').addEventListener('pointerout',e=>{if(e.target.closest('.spell-cell'))$('spellTooltip').classList.add('hide');});
$('wandPanel').addEventListener('focusin',e=>{const cell=e.target.closest('.spell-cell');if(cell){const r=cell.getBoundingClientRect();tooltip(cell,r.left,r.bottom);}});
$('wandPanel').addEventListener('click',e=>{if(e.target.closest('[data-close]'))closePanels();const buy=e.target.closest('[data-buy]');if(buy)buySpell(Number(buy.dataset.buy));const cell=e.target.closest('.spell-cell');if(cell&&e.detail===0)handleCellTap(cell);});
$('perkPanel').addEventListener('click',e=>{const b=e.target.closest('[data-perk]');if(b)choosePerk(Number(b.dataset.perk));});
$('pickupPanel').addEventListener('click',e=>{if(e.target.closest('[data-close]'))closePanels();const b=e.target.closest('[data-replace]');if(b)replaceWand(Number(b.dataset.replace));});
$('wandHud').addEventListener('click',e=>{const b=e.target.closest('[data-select-wand]');if(b)selectWand(Number(b.dataset.selectWand));});
window.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();
  if([' ','arrowleft','arrowright','arrowup','arrowdown','tab'].includes(key)&&!(key==='tab'&&state==='play'))e.preventDefault();
  if(key==='tab'&&state!=='play') {
    const focusable=[...document.querySelector('.overlay:not(.hide)').querySelectorAll('button:not(:disabled),input')];const index=focusable.indexOf(document.activeElement);focusable[(index+(e.shiftKey?-1:1)+focusable.length)%focusable.length]?.focus();return;
  }
  unlockAudio();
  if(key==='escape'){if(state==='editor'||state==='pickup')closePanels();else pause();return;}
  if(state==='perk'&&['1','2','3'].includes(key)){choosePerk(Number(key)-1);return;}
  if(key==='e'&&!e.repeat){if(state==='editor')closePanels();else interact();return;}
  if(state!=='play')return;
  keys[key]=true;if(['1','2','3','4'].includes(key))selectWand(Number(key)-1);
});
window.addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
function pointerPosition(e) {const r=canvas.getBoundingClientRect();aim.x=(e.clientX-r.left)/r.width*VW;aim.y=(e.clientY-r.top)/r.height*VH;}
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||aim.canvasPointer===e.pointerId){pointerPosition(e);aim.touch=false;}});
canvas.addEventListener('pointerdown',e=>{if(state!=='play'||e.button>0)return;e.preventDefault();unlockAudio();pointerPosition(e);aim.touch=false;aim.down=true;aim.canvasPointer=e.pointerId;canvas.setPointerCapture(e.pointerId);});
function releaseCanvas(e) {if(aim.canvasPointer===e.pointerId){aim.down=false;aim.canvasPointer=null;}}
canvas.addEventListener('pointerup',releaseCanvas);canvas.addEventListener('pointercancel',releaseCanvas);canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();cycleWand(e.deltaY>0?1:-1);},{passive:false});
for(const [id,key] of [['leftBtn','a'],['rightBtn','d'],['jumpBtn','w']]) {
  const b=$(id);let activePointer=null;
  b.addEventListener('pointerdown',e=>{if(state!=='play')return;e.preventDefault();unlockAudio();activePointer=e.pointerId;b.setPointerCapture(e.pointerId);keys[key]=true;b.classList.add('held');});
  const release=e=>{if(e.pointerId===activePointer){keys[key]=false;activePointer=null;b.classList.remove('held');}};
  b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
}
let firePointer=null,fireOrigin=null;
$('fireBtn').addEventListener('pointerdown',e=>{if(state!=='play')return;e.preventDefault();unlockAudio();firePointer=e.pointerId;fireOrigin={x:e.clientX,y:e.clientY};aim.touch=true;aim.down=true;aim.angle=player.dir>0?0:Math.PI;$('fireBtn').setPointerCapture(e.pointerId);$('fireBtn').classList.add('held');});
$('fireBtn').addEventListener('pointermove',e=>{if(e.pointerId!==firePointer)return;const dx=e.clientX-fireOrigin.x,dy=e.clientY-fireOrigin.y,d=Math.hypot(dx,dy);if(d>5)aim.angle=Math.atan2(dy,dx);const scale=Math.min(1,25/Math.max(1,d));$('fireBtn').querySelector('i').style.transform=`translate(${dx*scale}px,${dy*scale}px)`;});
function releaseFire(e) {if(e.pointerId!==firePointer)return;firePointer=null;aim.down=false;$('fireBtn').classList.remove('held');$('fireBtn').querySelector('i').style.transform='';}
$('fireBtn').addEventListener('pointerup',releaseFire);$('fireBtn').addEventListener('pointercancel',releaseFire);$('fireBtn').addEventListener('lostpointercapture',releaseFire);
$('interactBtn').addEventListener('click',interact);$('pauseBtn').addEventListener('click',pause);$('resumeBtn').addEventListener('click',closePanels);
for(const id of ['restartBtn','newRunBtn'])$(id).addEventListener('click',startGame);
$('soundBtn').addEventListener('click',()=>setSound(!soundOn));$('soundSetting').addEventListener('change',e=>setSound(e.target.checked));
$('shakeSetting').checked=shakeOn;$('shakeSetting').addEventListener('change',e=>shakeOn=e.target.checked);
window.addEventListener('blur',()=>{clearInput();if(state==='play')pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(state==='play')pause();}});
window.addEventListener('resize',resize);
let previous=0,accumulator=0;
function loop(now) {
  accumulator+=Math.min(100,now-previous);previous=now;
  if(accumulator>=STEP){while(accumulator>=STEP){update();accumulator-=STEP;}render();}
  if(toastUntil&&now>toastUntil){$('toast').classList.remove('visible');toastUntil=0;}
  requestAnimationFrame(loop);
}
resize();startGame();requestAnimationFrame(loop);
