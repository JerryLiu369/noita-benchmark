/* EMBER BELOW / 余烬之下
 * Original Canvas 2D art, fixed-step physics and procedural audio. No assets or dependencies.
 * Coordinates are simulation pixels. A material moves at most once per simulation tick.
 */
'use strict';
(() => {
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d', {alpha:false});
let VW = 640, VH = 360;
const W = 900, BAND = 620, H = BAND * 5 + 40;
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const rngFrom = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hash = (x,y) => {let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^n>>>13,1274126177);return (n^n>>>16)>>>0;};
const M={AIR:0,ROCK:1,SOIL:2,SAND:3,WATER:4,OIL:5,BLOOD:6,ACID:7,LAVA:8,WOOD:9,COAL:10,FIRE:11,SMOKE:12,STEAM:13,GAS:14,ICE:15,SNOW:16,GOLD:17,BRICK:18,MOSS:19};
const materials=[
 ['空气','#0b1313',0,0,0],['岩层','#535348',0,10,14],['泥土','#776044',0,5,5],['沙砾','#ba9c60',3,2,2],
 ['水','#397d9c',1,0,0],['油','#76622c',.8,0,0],['血','#972f40',1.2,0,0],['蚀液','#a3c455',1.3,0,0],['岩浆','#f17b28',2,0,0],
 ['木材','#977045',0,4,4],['煤','#3e4140',0,4,4],['火焰','#ffc45a',0,0,0],['烟','#62645b',0,0,0],['蒸汽','#a0b9b4',0,0,0],['毒气','#718b43',0,0,0],
 ['冰','#77999e',0,6,7],['雪','#b5c8c2',2.5,2,2],['金矿','#c6a04d',0,7,9],['刻印石','#79725c',0,14,28],['苔藓','#6d7941',0,2,2]
].map(([name,color,density,durability,hardness],id)=>({id,name,color,density,durability,hardness}));
const liquid = m => m>=M.WATER && m<=M.LAVA;
const gas = m => m>=M.SMOKE && m<=M.GAS;
const powder = m => m===M.SAND || m===M.SNOW;
const solid = m => materials[m].durability>0;
const fuel = m => m===M.OIL||m===M.WOOD||m===M.COAL||m===M.MOSS;
const biomes=[
 {name:'遗火矿井',en:'THE FORSAKEN MINES',color:'#555747',bg:'#101c1c',note:'木梁深处，仍有微弱的火光。'},
 {name:'黑烛煤脉',en:'THE CINDER SEAMS',color:'#504b41',bg:'#191815',note:'小心火星。这里的黑暗也会燃烧。'},
 {name:'孢光菌庭',en:'THE SPORE GARDENS',color:'#515a52',bg:'#1b1925',note:'不要呼吸那些美丽的光。'},
 {name:'苍白霜窟',en:'THE PALE HOLLOW',color:'#677d80',bg:'#101d2a',note:'冰封的寂静之下，有什么在移动。'},
 {name:'赤渊熔心',en:'THE MOLTEN HEART',color:'#695247',bg:'#211419',note:'你带来的火，与深渊的火。'}
];
const biomeIndex=y=>clamp(Math.floor(y/BAND),0,4);
let seed=0,rng=rngFrom(1),cells,age,stamp,texture,palettes,bg;
let player,wands=[],enemies=[],shots=[],particles=[],drops=[],props=[],torches=[],benches=[],sanctuaries=[],floats=[];
let state='title',panel=null,returnPanel=null,tick=0,simTick=0,selectedWand=0,storage=[],kills=0,gold=0,deepest=0,elapsed=0,shake=0,flash=0,bannerTime=0,lastBiome=0;
let cam={x:0,y:0},input={left:false,right:false,jump:false,fire:false},pointer={x:390,y:180,active:false,angle:0},touchAim=false;
let selectedSlot=null,canEdit=false,toastTimer=0,muted=false,ac=null,stats={casts:0,reactions:0,damage:0,triggered:0,projectiles:0};
const rand=(a,b)=>a+rng()*(b-a),ri=(a,b)=>Math.floor(rand(a,b+1));
const inside=(x,y)=>x>=2&&x<W-2&&y>=2&&y<H-2;
function get(x,y){x=Math.floor(x);y=Math.floor(y);return inside(x,y)?cells[y*W+x]:M.BRICK;}
function put(x,y,m){x=Math.floor(x);y=Math.floor(y);if(!inside(x,y))return;let i=y*W+x;cells[i]=m;age[i]=m===M.FIRE?ri(35,105):gas(m)?ri(100,220):0;if(stamp)stamp[i]=simTick;}
function rect(x,y,w,h,m){for(let yy=Math.max(2,y|0);yy<Math.min(H-2,y+h);yy++)for(let xx=Math.max(2,x|0);xx<Math.min(W-2,x+w);xx++)put(xx,yy,m);}
function ellipse(cx,cy,rx,ry,m){for(let y=Math.max(2,cy-ry|0);y<Math.min(H-2,cy+ry);y++)for(let x=Math.max(2,cx-rx|0);x<Math.min(W-2,cx+rx);x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<1)put(x,y,m);}
function pour(x,y,m,n=30){for(let k=0;k<n;k++){let xx=x+ri(-6,6),yy=y+ri(-5,5);if(get(xx,yy)===M.AIR||gas(get(xx,yy)))put(xx,yy,m);}}
function pool(x,y,w,h,m){rect(x-4,y-3,w+8,h+7,M.ROCK);rect(x,y-4,w,h+4,M.AIR);rect(x,y+4,w,h-4,m);}
function generateWorld(){
 rng=rngFrom(seed);cells=new Uint8Array(W*H);age=new Uint8Array(W*H);stamp=new Uint32Array(W*H);texture=new Uint8Array(W*H);simTick=1;
 enemies=[];shots=[];particles=[];drops=[];props=[];torches=[];benches=[];sanctuaries=[];floats=[];
 const phase=rand(0,8);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let i=y*W+x,n=hash(x,y),large=hash(x>>3,y>>3)%19;
  texture[i]=clamp((n%5)+large%4+((Math.sin(x*.05+y*.09)+1)*1.5|0),0,11);
  let b=biomeIndex(y),v=Math.sin(x*.037+y*.041+phase)+Math.sin(x*.079-y*.031)+Math.sin(x*.012+y*.026);
  cells[i]=b===3?(v>.9?M.ICE:M.ROCK):v>.9?(b===1?M.COAL:M.SOIL):M.ROCK;
  if(v>2.1&&n%8<5)cells[i]=M.GOLD;
 }
 // Connected descending passages; random side chambers preserve navigability for every seed.
 for(let b=0;b<5;b++){
  let y0=b*BAND;
  for(let y=y0+50;y<y0+562;y+=5){let x=450+220*Math.sin((y-y0)*.01+b*.7);ellipse(x,y,47+Math.sin(y*.12)*7,34,M.AIR);}
  for(let row=0;row<3;row++){
   let yy=y0+165+row*147;
   for(let x=65;x<840;x+=13)ellipse(x,yy+Math.sin(x*.017+b)*15,ri(35,49),ri(33,48),M.AIR);
   for(let c=0;c<3;c++){
    let x=145+c*275+ri(-22,22),y=yy+ri(-4,10);
    ellipse(x,y,ri(80,108),ri(35,49),M.AIR);
    rect(x-45,y+37,90,5,b===3?M.ICE:M.WOOD);
    if(b<2){rect(x-46,y-24,4,61,M.WOOD);rect(x-50,y-27,100,4,M.WOOD);}
    torches.push({x:x-37,y:y-13,type:b===2?'spore':b===3?'ice':'torch'});
    drops.push({type:(row+c)%3===0?'chest':(row+c)%3===1?'heal':'wand',x:x+25,y:y+28,vy:0,tier:b});
    if(c!==1&&row>0)pool(x+ri(-25,5),y+39,ri(33,53),ri(16,29),b===4?M.LAVA:b===2?M.ACID:b===1?M.OIL:M.WATER);
    // Loose powder deposits become a hazard when their supporting shelf is removed.
    ellipse(x-29,y+44,14,6,b===3?M.SNOW:M.SAND);
    let kinds=['rush','shooter','wing','bomber','burrow'];
    spawnEnemy(kinds[(row*3+c+b)%5],x+ri(-12,16),y+20,b);
    if(b>1)spawnEnemy(kinds[(c+b)%5],x-25,y-12,b);
    if(c===1&&row===1)props.push({type:'boulder',x:x+20,y:y+18,vy:0,r:9,fall:0});
    else if(c===2)props.push({type:'barrel',x:x-15,y:y+27,vy:0,r:6,hp:10});
   }
  }
  // A safe horizontal rest chamber, reachable by the natural shaft.
  if(b<4){let y=y0+553;rect(85,y-8,745,70,M.BRICK);rect(92,y,731,49,M.AIR);
   for(let yy=y-48;yy<y+6;yy+=4)ellipse(450+220*Math.sin((yy-y0)*.01+b*.7),yy,46,24,M.AIR);
   rect(730,y+37,45,82,M.AIR);rect(695,y+76,95,15,M.AIR);
   let s={x:290,y:y+40,y0:y,used:false,perk:false,shopBought:false,tier:b};sanctuaries.push(s);benches.push({x:170,y:y+40,sanctuary:s});
   torches.push({x:115,y:y+22,type:'candle'},{x:390,y:y+22,type:'candle'},{x:690,y:y+22,type:'candle'});
   s.entrance=450+220*Math.sin(5.45+b*.7);torches.push({x:s.entrance-25,y:y-22,type:'candle'});
   for(let yy=y+55;yy<y+133;yy+=4)ellipse(749-(yy-y-55)*1.4,yy,30,20,M.AIR);
  }
 }
 // Designed first room: a safe teaching ledge, workbench, water and a visible first opponent.
 ellipse(305,160,284,87,M.AIR);rect(65,135,540,100,M.AIR);rect(62,240,540,16,M.ROCK);
 rect(78,118,5,122,M.WOOD);rect(74,115,320,6,M.WOOD);rect(352,121,5,89,M.WOOD);
 rect(118,241,160,3,M.MOSS);rect(372,239,55,3,M.MOSS);
 pool(470,240,91,40,M.WATER);rect(470,230,91,18,M.AIR);
 for(let y=253;y<354;y+=5)ellipse(610-(y-253)*.7,y,40,26,M.AIR);
 enemies=enemies.filter(e=>e.y>305);drops=drops.filter(d=>d.y>310);props=props.filter(p=>p.y>300);torches=torches.filter(t=>t.y>310);
 torches.push({x:93,y:167,type:'torch'},{x:341,y:160,type:'torch'},{x:569,y:193,type:'torch'},{x:620,y:300,type:'torch'});
 benches.unshift({x:125,y:232,sanctuary:null});drops.unshift({type:'wand',x:275,y:231,vy:0,tier:0},{type:'chest',x:662,y:320,vy:0,tier:0});
 spawnEnemy('rush',422,231,0);spawnEnemy('shooter',702,319,0);props.push({type:'barrel',x:600,y:236,vy:0,r:6,hp:10});
 // The last chamber and the ember guardian.
 ellipse(450,H-125,210,90,M.AIR);rect(265,H-61,370,9,M.BRICK);pool(280,H-46,340,25,M.LAVA);
 for(let y=H-280;y<H-125;y+=5)ellipse(450,y,40,25,M.AIR);
 spawnEnemy('warden',450,H-98,4);torches.push({x:295,y:H-102,type:'torch'},{x:605,y:H-102,type:'torch'});
 // Craggy silhouettes: small rock teeth and moss break up the carved ellipse outlines.
 for(let y=35;y<H-55;y+=4)for(let x=20;x<W-20;x+=4){let n=hash(x,y);if(n%9!==0||get(x,y)!==M.AIR)continue;
  if(solid(get(x,y-3))&&n%2===0){let len=3+n%10;for(let k=0;k<len;k++){if(get(x,y+k)===M.AIR)put(x,y+k,biomeIndex(y)===3?M.ICE:M.ROCK);if(k<len/2&&get(x+1,y+k)===M.AIR)put(x+1,y+k,M.ROCK);}}
  if(solid(get(x,y+2))&&!liquid(get(x,y))&&y%620<540&&!(y>228&&y<243&&x<450))put(x,y,biomeIndex(y)===3?M.SNOW:M.MOSS);
 }
 makePalette();makeBackground();
}
function makePalette(){palettes=[];for(let b=0;b<5;b++) {let list=[];for(let m of materials){let hex=(m.id===M.ROCK?biomes[b].color:m.color).slice(1),base=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));let colors=[];for(let t=0;t<16;t++){let f=.56+t*.06;colors.push(base.map(v=>clamp(Math.round(v*f),0,255)));}list.push(colors);}palettes.push(list);}}
function makeBackground(){
 bg=document.createElement('canvas');bg.width=W;bg.height=H;let c=bg.getContext('2d');
 for(let b=0;b<5;b++){
  let y0=b*BAND;c.fillStyle=biomes[b].bg;c.fillRect(0,y0,W,BAND);
  for(let i=0;i<70;i++){let x=ri(0,W),y=y0+ri(0,BAND),r=ri(15,75);c.fillStyle=i%2?'#0a12134d':'#30413a16';c.beginPath();c.moveTo(x-r,y);c.lineTo(x,y+ri(30,100));c.lineTo(x+r,y);c.fill();}
  for(let row=0;row<3;row++){
   let y=y0+180+row*147;
   if(b<2){for(let x=75;x<W;x+=145){c.fillStyle='#2a2c2270';c.fillRect(x,y-49,7,107);c.fillRect(x-10,y-48,151,5);c.fillStyle='#101a19';c.fillRect(x+2,y-43,2,91);c.strokeStyle='#45473633';c.lineWidth=1;c.beginPath();c.moveTo(x,y-24);c.quadraticCurveTo(x+70,y+8,x+145,y-24);c.stroke();}}
   else if(b===2){for(let x=50;x<W;x+=83){let hh=ri(20,65);c.fillStyle='#40514b44';c.fillRect(x,y-hh,3,hh+30);c.fillStyle='#65477544';c.fillRect(x-12,y-hh,26,5);c.fillRect(x-8,y-hh-4,18,4);}}
   else {for(let x=80;x<W;x+=150){c.fillStyle='#33424d44';c.fillRect(x,y-55,18,100);c.fillRect(x-5,y-57,28,5);c.fillRect(x-5,y+44,28,5);}}
  }
 }
 // Background moss, roots and stratified stone scratches never obstruct movement.
 for(let y=20;y<H-10;y+=3)for(let x=12;x<W-12;x+=3){let n=hash(x,y);if(get(x,y)===M.AIR&&solid(get(x,y-2))&&n%7===0){let b=biomeIndex(y);c.fillStyle=b===3?'#75918c66':b===2?'#72629077':'#72814577';let len=4+n%22;for(let k=0;k<len;k++){let xx=x+Math.sin(k*.25)*2;c.fillRect(xx|0,y+k,1,1);if(k%4===0)c.fillRect(xx-2|0,y+k,3,1);}}
  if(n%5===0&&solid(get(x,y))){c.fillStyle='#52604933';c.fillRect(x,y,2+n%13,1);}}
 for(let s of sanctuaries){let y=s.y0;c.fillStyle='#343d2c';c.fillRect(92,y,731,49);for(let x=95;x<823;x+=32){c.fillStyle='#181f19';c.fillRect(x,y+2,30,45);c.strokeStyle='#61634444';c.strokeRect(x+4,y+7,21,29);}c.fillStyle='#8c85503a';c.fillRect(93,y+44,730,5);}
}

// SPELL LANGUAGE: modifiers are consumed left-to-right; triggers recursively consume one payload group.
const SPELLS={
 mote:{name:'星屑',kind:'projectile',cost:5,damage:15,speed:5.8,life:85,color:'#c1ddaf',icon:0,desc:'轻快的直线弹体。可靠、低耗蓝。'},
 lance:{name:'青棘',kind:'projectile',cost:12,damage:30,speed:7,life:70,color:'#88d2d1',icon:1,desc:'高速长矛，可贯穿泥土。'},
 cinder:{name:'炽核',kind:'projectile',cost:22,damage:34,speed:3.6,life:90,radius:16,color:'#ffb262',icon:2,desc:'燃烧的爆裂核心。会伤及施法者。'},
 bomb:{name:'崩岩种',kind:'projectile',cost:32,damage:66,speed:2.8,life:85,radius:31,color:'#d7c16d',icon:3,desc:'抛物线炸弹，延时引爆、破坏岩层。小心自伤。'},
 bore:{name:'蚀光针',kind:'projectile',cost:4,damage:7,speed:5,life:15,color:'#e5e4aa',icon:4,desc:'短程连续钻掘，穿透岩石但不能破坏刻印石。'},
 tide:{name:'潮珠',kind:'projectile',cost:7,damage:5,speed:4,life:55,color:'#75b5db',icon:5,desc:'释放水滴。熄灭火焰、冷却岩浆。'},
 rime:{name:'霜棱',kind:'projectile',cost:14,damage:20,speed:4.8,life:80,color:'#b8e6ef',icon:6,desc:'冻结命中的敌人，将附近的水结成冰。'},
 venom:{name:'蚀露',kind:'projectile',cost:18,damage:13,speed:3.5,life:70,color:'#b3d875',icon:7,desc:'碎裂后留下蚀液。能够腐蚀所有内部地形。'},
 fork:{name:'三岔',kind:'mod',cost:12,icon:8,color:'#ddbb75',desc:'将下一弹体分为三枚，展开约 22°。'},
 ember:{name:'烬尾',kind:'mod',cost:7,icon:9,color:'#e99f69',desc:'下一弹体留下真实火焰，可以引燃油与木材。'},
 seek:{name:'寻踪',kind:'mod',cost:15,icon:10,color:'#c79acf',desc:'下一弹体在近距离弯向敌人。'},
 rebound:{name:'回响',kind:'mod',cost:5,icon:11,color:'#a4c780',desc:'下一弹体碰到地形可反弹三次。'},
 heavy:{name:'重刻',kind:'mod',cost:10,icon:12,color:'#d39283',desc:'下一弹体伤害 +75%，速度降低 25%。'},
 impact:{name:'碰撞印',kind:'trigger',cost:10,damage:8,speed:4.5,life:105,icon:13,color:'#c3a3db',desc:'发射载体，碰到敌人或地形时释放下一组法术。'},
 timer:{name:'时砂印',kind:'trigger',cost:10,damage:8,speed:3.5,life:100,icon:14,color:'#d8b9e0',desc:'发射载体，在 0.45 秒后或提前碰撞时释放下一组法术。'}
};
function newWand(name,slots,tier=0,type=0){return {name,slots:[...slots,...Array(Math.max(0,8-slots.length)).fill(null)],manaMax:160+tier*35,mana:160+tier*35,regen:38+tier*7,delay:type===1?6:13,recharge:type===1?10:25,shuffle:type===3,spread:type===3?.12:.02,cool:0,cursor:0,deck:null,type,tier};}
function setupWands(){wands=[newWand('苔火枝',['mote','mote']),newWand('凿夜者',['bore'],0,1)];storage=['fork','ember','seek','impact','timer','cinder','bomb','tide','lance','rime','venom','rebound','heavy',null,null,null];selectedWand=0;}
function readGroup(deck,start,level=0){let mods=[],cost=0,i=start;while(i<deck.length){let id=deck[i++],s=SPELLS[id];if(!s)continue;cost+=s.cost;if(s.kind==='mod'){mods.push(id);continue;}let node={id,mods,payload:null};if(s.kind==='trigger'&&level<4){let payload=readGroup(deck,i,level+1);node.payload=payload.node;i=payload.next;cost+=payload.cost;}return {node,cost,next:i};}return {node:null,cost,next:i};}
function resetDeck(w){w.deck=w.slots.filter(Boolean);if(w.shuffle){for(let i=w.deck.length-1;i>0;i--){let j=ri(0,i);[w.deck[i],w.deck[j]]=[w.deck[j],w.deck[i]];}}w.cursor=0;}
function aimAngle(){if(touchAim)return pointer.angle;if(pointer.active)return Math.atan2(pointer.y+cam.y-player.y,pointer.x+cam.x-player.x);return player.dir>0?0:Math.PI;}
function cast(){let w=wands[selectedWand];if(!w||w.cool>0)return;if(!w.deck||w.cursor>=w.deck.length)resetDeck(w);let result=readGroup(w.deck,w.cursor);if(!result.node){w.cool=15;return;}if(w.mana<result.cost){w.cool=8;return;}w.mana-=result.cost;w.cursor=result.next;w.cool=w.cursor>=w.deck.length?Math.max(w.delay,w.recharge):w.delay;let a=aimAngle()+rand(-w.spread,w.spread);emitNode(result.node,player.x+Math.cos(a)*8,player.y-2+Math.sin(a)*8,a);player.vx-=Math.cos(a)*.12;stats.casts++;sound(result.node.id==='bore'?'drill':'cast');}
function emitNode(node,x,y,a){if(!node||shots.length>220)return;let s=SPELLS[node.id],n=node.mods.includes('fork')?3:1;
 for(let i=0;i<n;i++){let angle=a+(i-(n-1)/2)*.19,sp=s.speed*(node.mods.includes('heavy')?.75:1),damage=(s.damage||0)*(node.mods.includes('heavy')?1.75:1)*(player.power||1);
 stats.projectiles++;shots.push({x,y,ox:x,oy:y,vx:Math.cos(angle)*sp,vy:Math.sin(angle)*sp,life:s.life,initial:s.life,id:node.id,color:s.color,damage,owner:'player',radius:s.radius||0,mods:node.mods,payload:node.payload,bounces:node.mods.includes('rebound')?3:0,released:false});}
 burst(x,y,s.color,5,1.2);
}
function release(p){if(!p.payload||p.released)return;p.released=true;stats.triggered++;emitNode(p.payload,p.ox,p.oy,Math.atan2(p.vy,p.vx));sound('trigger');}

function bodyBlocked(x,y,w=7,h=13){for(let yy=Math.floor(y-h/2);yy<=Math.floor(y+h/2);yy++)for(let xx=Math.floor(x-w/2);xx<=Math.floor(x+w/2);xx++)if(solid(get(xx,yy)))return true;return false;}
function moveBody(o,dx,dy,w=7,h=13){let steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))));for(let k=0;k<steps;k++){
 let sx=dx/steps,sy=dy/steps;
 if(!bodyBlocked(o.x+sx,o.y,w,h))o.x+=sx;else if(sx&&o.ground&&!bodyBlocked(o.x+sx,o.y-3,w,h)){o.x+=sx;o.y-=3;}else o.vx=0;
 if(!bodyBlocked(o.x,o.y+sy,w,h))o.y+=sy;else {if(sy>0)o.ground=true;o.vy=0;}
 }}
function dig(x,y,r,durability,energy){for(let yy=Math.floor(y-r);yy<=y+r;yy++)for(let xx=Math.floor(x-r);xx<=x+r;xx++){
 let d=Math.hypot(xx-x,yy-y),m=get(xx,yy),mat=materials[m];if(d>r||!solid(m)||mat.durability>durability||energy*(1-d/r)<mat.hardness)continue;
 if(m===M.GOLD&&rng()<.035)drops.push({type:'gold',x:xx,y:yy,vy:-1,value:3});
 put(xx,yy,M.AIR);if(rng()<.025)particle(xx,yy,mat.color,rand(-1,1),rand(-2,0),25,true);
 }}
function burst(x,y,color,n,speed=2){for(let i=0;i<n;i++){let a=rand(0,Math.PI*2),v=rand(.3,speed);particle(x,y,color,Math.cos(a)*v,Math.sin(a)*v,ri(12,40),true);}}
function particle(x,y,color,vx,vy,life=25,gravity=false){if(particles.length<1400)particles.push({x,y,color,vx,vy,life,max:life,gravity});}
function floatText(x,y,text,color='#e6d491'){floats.push({x,y,text,color,life:55});}
function explode(x,y,r,damage,cause='炸死：爆炸冲击',owner='player'){
 dig(x,y,r,11,r*2.7);shake=Math.max(shake,r/8);flash=3;burst(x,y,'#ffb952',Math.round(r*2.3),r*.13);burst(x,y,'#eee0ab',20,r*.11);sound('boom');
 for(let i=0;i<r*2;i++){let xx=x+rand(-r*.6,r*.6),yy=y+rand(-r*.6,r*.6);if(get(xx,yy)===M.AIR)put(xx,yy,rng()<.5?M.FIRE:M.SMOKE);}
 if(dist(player,{x,y})<r+6)hurt(damage*(1-dist(player,{x,y})/(r+10)),cause);
 for(let e of enemies)if(!e.dead&&dist(e,{x,y})<r+e.r)damageEnemy(e,damage*(1-dist(e,{x,y})/(r+e.r+8)),owner);
 for(let p of props)if(!p.dead&&p.type==='barrel'&&dist(p,{x,y})<r+8)p.fuse=1;
}
function hurt(n,cause){if(state!=='play'||panel||n<=0)return;if(player.inv>0&&n>=4)return;let d=n*(player.armor||1);player.hp-=d;stats.damage+=d;if(n>=4){player.inv=25;shake=Math.max(shake,2);sound('hurt');burst(player.x,player.y,'#b35c50',10,2);}
 if(player.hp<=0){player.hp=0;endRun(false,cause);} }
function damageEnemy(e,n,owner='player'){if(e.dead)return;e.hp-=n;e.hit=7;if(n>=2){burst(e.x,e.y,'#b8534d',8,2);if(rng()<.45)pour(e.x,e.y,M.BLOOD,3);floatText(e.x,e.y-e.r-5,Math.ceil(n));sound('hit');}
 if(e.hp<=0){e.dead=true;kills++;shake=Math.max(shake,1.5);burst(e.x,e.y,e.type==='warden'?'#ffd595':'#b45b50',30,3);pour(e.x,e.y,M.BLOOD,35);for(let i=0;i<3;i++)drops.push({type:'gold',x:e.x+rand(-5,5),y:e.y,vy:rand(-2,-.5),value:5+e.tier*3});
 if(e.type==='warden'){drops.push({type:'ember',x:e.x,y:e.y,vy:0});toast('熔心守卫已崩解 · 按 F 取回余烬');}
 }}
function spawnEnemy(type,x,y,tier=0){let hp=type==='warden'?380:({rush:36,shooter:34,wing:23,bomber:24,burrow:55}[type]+tier*12);enemies.push({type,x,y,vx:0,vy:0,ground:false,hp,max:hp,r:type==='warden'?18:6,tier,cool:ri(40,110),phase:rand(0,6),hit:0,freeze:0,dead:false});}
function updatePlayer(){
 player.inv=Math.max(0,player.inv-1);player.ground=bodyBlocked(player.x,player.y+1);let wet=false,oil=false,acid=false,hot=false,poison=false,buried=0;
 for(let oy=-5;oy<=5;oy+=5)for(let ox=-2;ox<=2;ox+=2){let m=get(player.x+ox,player.y+oy);if(m===M.WATER||m===M.BLOOD)wet=true;if(m===M.OIL)oil=true;if(m===M.ACID)acid=true;if(m===M.LAVA||m===M.FIRE)hot=true;if(m===M.GAS)poison=true;if(powder(m))buried++;}
 if(wet){player.wet=180;player.burn=0;if(get(player.x,player.y)===M.WATER)player.flask=clamp(player.flask+.4,0,100);}else player.wet=Math.max(0,player.wet-1);
 if(oil)player.oily=240;else player.oily=Math.max(0,player.oily-1);
 if(hot&&!player.wet)player.burn=player.oily?420:210;
 if(player.burn>0){player.burn--;if(tick%30===0)hurt(player.fireproof?0:3,'烧死：衣袍被火焰吞噬');if(tick%3===0)particle(player.x+rand(-3,3),player.y,'#f1a247',rand(-.3,.3),-rand(.4,1),20);}
 if(acid)hurt(.6,'蚀亡：酸液腐蚀');if(get(player.x,player.y)===M.LAVA)hurt(.8,'烧死：坠入岩浆');
 if(poison)player.poison=120;else player.poison=Math.max(0,player.poison-1);if(player.poison&&tick%30===0)hurt(3,'毒死：吸入剧毒孢雾');
 const submerged=liquid(get(player.x,player.y-5));player.air=clamp(player.air+(submerged?-1:5),0,420);if(player.air===0&&tick%30===0)hurt(8,'溺死：肺中的空气耗尽');
 if(buried>=7&&tick%25===0)hurt(6,'压死：被流沙掩埋');
 let dir=Number(input.right)-Number(input.left);if(dir)player.dir=dir;player.vx+=(dir*2.05-player.vx)*(dir?.18:.25);
 if(input.jump&&player.ground){player.vy=-3.6;player.ground=false;sound('jump');}
 if(input.jump&&player.lev>0){player.vy-=.28;player.lev=Math.max(0,player.lev-(player.longFlight?.32:.52));if(tick%3===0)particle(player.x+rand(-3,3),player.y+7,'#c2ba89',rand(-.3,.3),rand(.4,1),22);}
 else if(player.ground)player.lev=clamp(player.lev+1.4,0,100);
 player.vy=clamp(player.vy+(submerged?.075:.17),-2.7,4);if(submerged){player.vx*=.83;player.vy*=.93;}
 moveBody(player,player.vx,player.vy);player.x=clamp(player.x,8,W-8);
 for(let w of wands){w.mana=Math.min(w.manaMax,w.mana+w.regen/60);w.cool=Math.max(0,w.cool-1);}
 if(input.fire)cast();
 for(let s of sanctuaries)if(player.y>s.y0&&player.y<s.y0+48){if(!s.used){s.used=true;player.hp=player.maxHp;player.burn=player.poison=0;player.flask=100;wands.forEach(w=>w.mana=w.manaMax);toast('烛息回廊 · 生命已恢复，可在刻印台编排法杖');}if(!s.perk&&Math.abs(player.x-s.x)<28){s.perk=true;offerPerks();}}
 let b=biomeIndex(player.y);if(b!==lastBiome){lastBiome=b;showBiome();}deepest=Math.max(deepest,Math.floor((player.y-220)*.5));
}

// Falling sand automaton. Density swaps conserve matter; visited stamps prevent scan-order acceleration.
function updateMaterials(bounds){simTick++;let box=bounds||{x0:clamp(Math.floor(cam.x)-45,2,W-3),x1:clamp(Math.ceil(cam.x+VW)+45,2,W-3),y0:clamp(Math.floor(cam.y)-40,2,H-3),y1:clamp(Math.ceil(cam.y+VH)+60,2,H-3)};
 function swap(i,j){let m=cells[i],a=age[i];cells[i]=cells[j];age[i]=age[j];cells[j]=m;age[j]=a;stamp[i]=stamp[j]=simTick;}
 function canFall(m,n){return n===M.AIR||gas(n)||n===M.FIRE||(liquid(n)&&materials[m].density>materials[n].density);}
 const rev=simTick%2;
 for(let y=box.y1;y>=box.y0;y--)for(let k=box.x0;k<=box.x1;k++){
  let x=rev?box.x1-(k-box.x0):k,i=y*W+x,m=cells[i];if(stamp[i]===simTick||m===0||solid(m)&&!powder(m))continue;
  let d=rng()<.5?-1:1;
  // Reactions sample all four neighbors, not just the pixel below.
  if(m===M.LAVA||m===M.FIRE||m===M.ACID){
   for(let off of [-1,1,-W,W]){let j=i+off,n=cells[j];
    if(m===M.LAVA&&(n===M.WATER||n===M.BLOOD)){cells[i]=M.ROCK;cells[j]=M.STEAM;age[j]=160;stamp[j]=simTick;stats.reactions++;break;}
    if(m===M.FIRE&&(n===M.WATER||n===M.BLOOD)){cells[i]=M.SMOKE;age[i]=60;if(rng()<.2){cells[j]=M.STEAM;age[j]=150;}stats.reactions++;break;}
    if((m===M.FIRE||m===M.LAVA)&&fuel(n)&&rng()<.13){cells[j]=M.FIRE;age[j]=ri(55,150);stamp[j]=simTick;stats.reactions++;}
    if((m===M.FIRE||m===M.LAVA)&&(n===M.ICE||n===M.SNOW)&&rng()<.3){cells[j]=M.WATER;stamp[j]=simTick;}
    if(m===M.ACID&&n!==M.AIR&&n!==M.ACID&&!gas(n)&&rng()<.12){cells[j]=M.GAS;age[j]=150;stamp[j]=simTick;stats.reactions++;if(rng()<.1){cells[i]=M.GAS;age[i]=110;break;}}
   }
   if(cells[i]!==m)continue;
  }
  if(powder(m)||liquid(m)){
   if(m===M.LAVA&&simTick%3!==0)continue;
   if(canFall(m,cells[i+W])){swap(i,i+W);continue;}
   if(canFall(m,cells[i+W+d])){swap(i,i+W+d);continue;}
   if(canFall(m,cells[i+W-d])){swap(i,i+W-d);continue;}
   if(liquid(m))for(let side of [d,-d]){let j=i+side;if(cells[j]===0||gas(cells[j])){swap(i,j);break;}}
  }else if(gas(m)||m===M.FIRE){
   if(age[i]>0)age[i]--;if(age[i]===0){cells[i]=m===M.FIRE?M.SMOKE:m===M.STEAM&&solid(cells[i-W])?M.WATER:M.AIR;age[i]=80;continue;}
   // A burning cell remains attached to nearby fuel; free embers may rise.
   // Otherwise a one-pixel flame could leave wood before igniting its neighbors.
   if(m===M.FIRE&&([-1,1,-W,W].some(off=>fuel(cells[i+off]))||rng()<.67))continue;
   if(cells[i-W]===0||liquid(cells[i-W]))swap(i,i-W);else if(cells[i-W+d]===0)swap(i,i-W+d);else if(cells[i+d]===0)swap(i,i+d);
  }
 }
}
function updateShots(){
 const count=shots.length;
 for(let pi=count-1;pi>=0;pi--){let p=shots[pi];if(!p)continue;p.life--;p.ox=p.x;p.oy=p.y;
  if(p.mods?.includes('seek')){let nearest=null,nd=150;for(let e of enemies){let d=dist(p,e);if(!e.dead&&d<nd){nearest=e;nd=d;}}if(nearest){let sp=Math.hypot(p.vx,p.vy),a=Math.atan2(nearest.y-p.y,nearest.x-p.x);p.vx=p.vx*.92+Math.cos(a)*sp*.08;p.vy=p.vy*.92+Math.sin(a)*sp*.08;}}
  if(p.id==='bomb')p.vy+=.08;if(p.id==='tide'||p.id==='venom')p.vy+=.025;
  if(p.id==='timer'&&p.initial-p.life>=27)release(p);
  let steps=Math.ceil(Math.max(Math.abs(p.vx),Math.abs(p.vy))),dead=false;
  for(let s=0;s<steps;s++){
   let nx=p.x+p.vx/steps,ny=p.y+p.vy/steps,m=get(nx,ny);
   if(p.id==='bore')dig(nx,ny,5,11,50);
   if(p.id==='lance'&&materials[m].durability<=5&&solid(m))dig(nx,ny,3,5,30);
   if(solid(get(nx,ny))){
    if(p.id==='bomb'&&p.life>1){if(solid(get(nx,p.y)))p.vx*=-.55;else p.vy*=-.55;p.life=Math.min(p.life,32);break;}
    if(p.bounces>0){if(solid(get(nx,p.y)))p.vx*=-1;else p.vy*=-1;p.bounces--;break;}
    dead=true;break;
   }
   p.x=nx;p.y=ny;
   if(p.owner==='enemy'){if(dist(player,p)<7){hurt(p.damage,'被击杀：'+(p.source||'深渊弹幕'));dead=true;break;}}
   else {for(let e of enemies)if(!e.dead&&dist(e,p)<e.r+2){damageEnemy(e,p.damage);e.vx+=p.vx*.12;if(p.id==='rime')e.freeze=180;dead=true;break;}}
   for(let prop of props)if(!prop.dead&&prop.type==='barrel'&&dist(prop,p)<8){prop.fuse=1;dead=true;}
   if(dead)break;
  }
  if(p.mods?.includes('ember')&&tick%2===0)pour(p.x,p.y,M.FIRE,2);
  if(p.id==='tide'&&tick%3===0)pour(p.x,p.y,M.WATER,5);
  particle(p.x,p.y,p.color,-p.vx*.07,-p.vy*.07,ri(6,15));
  if(dead||p.life<=0||!inside(p.x,p.y)){
   release(p);burst(p.x,p.y,p.color,9,1.7);
   if(p.radius)explode(p.x,p.y,p.radius,p.damage,'炸死：自己的'+SPELLS[p.id].name,p.owner);
   if(p.id==='venom')pour(p.x,p.y,M.ACID,50);
   if(p.id==='tide')pour(p.x,p.y,M.WATER,50);
   if(p.id==='rime')for(let y=-8;y<=8;y++)for(let x=-8;x<=8;x++)if(get(p.x+x,p.y+y)===M.WATER)put(p.x+x,p.y+y,M.ICE);
   shots.splice(pi,1);
  }
 }
}
function enemyShot(e,a,spread=0){shots.push({x:e.x,y:e.y-2,ox:e.x,oy:e.y,vx:Math.cos(a+spread)*2.5,vy:Math.sin(a+spread)*2.5,life:135,initial:135,id:'enemy',owner:'enemy',color:e.type==='warden'?'#f6a357':'#e19b78',damage:10+e.tier*3,source:e.type==='warden'?'熔心守卫':'灰烬哨兵',mods:[]});}
function updateEnemies(){for(let e of enemies){if(e.dead||Math.abs(e.y-player.y)>VH*.8+100)continue;e.hit=Math.max(0,e.hit-1);if(e.freeze>0){e.freeze--;if(tick%3!==0)continue;}e.cool--;e.phase+=.04;
 let dx=player.x-e.x,dy=player.y-e.y,d=Math.hypot(dx,dy),active=d<240&&!sanctuaries.some(s=>player.y>s.y0&&player.y<s.y0+50);
 if(e.type==='wing'){if(active){e.vx+=(dx/d*1.5-e.vx)*.04;e.vy+=(dy/d*1.5+Math.sin(e.phase)*.6-e.vy)*.04;}else{e.vx=Math.sin(e.phase)*.3;e.vy=Math.cos(e.phase)*.3;}moveBody(e,e.vx,e.vy,9,7);}
 else if(e.type==='burrow'){if(active){let a=Math.atan2(dy,dx);e.vx=Math.cos(a)*.85;e.vy=Math.sin(a)*.85;dig(e.x+e.vx,e.y+e.vy,8,10,80);e.x+=e.vx;e.y+=e.vy;if(tick%8===0)burst(e.x,e.y,'#8f7c5b',3,1);}}
 else if(e.type==='warden'){e.vy=Math.sin(e.phase)*.35;e.y+=e.vy;e.x+=Math.sin(e.phase*.6)*.3;if(active&&e.cool<=0){for(let i=-3;i<=3;i++)enemyShot(e,Math.atan2(dy,dx),i*.18);e.cool=75;shake=2;}}
 else {e.ground=bodyBlocked(e.x,e.y+1,10,12);let speed=e.type==='rush'?1.2:e.type==='bomber'?1.45:.45;e.vx=active?Math.sign(dx)*(e.type==='shooter'&&d<110?-speed:speed):Math.sin(e.phase*.2)*.25;
  if(e.ground&&active&&bodyBlocked(e.x+Math.sign(dx)*5,e.y,10,12))e.vy=-2.7;e.vy=clamp(e.vy+.17,-3,3.5);moveBody(e,e.vx,e.vy,10,12);
  if(e.type==='shooter'&&active&&e.cool<0){let a=Math.atan2(dy,dx);for(let i=-1;i<=1;i++)enemyShot(e,a,i*.13);e.cool=100-e.tier*8;burst(e.x,e.y,'#de9a66',7,1.5);sound('enemy');}
  if(e.type==='bomber'&&d<32&&!e.fuse)e.fuse=48;if(e.fuse){e.fuse--;if(e.fuse===0){e.dead=true;explode(e.x,e.y,27,50,'炸死：爆囊兽自爆','environment');}}
 }
 if(d<e.r+5&&e.cool<30){hurt(e.type==='burrow'?15:9+e.tier*2,'被击杀：'+({rush:'石牙兽',wing:'灯蛾',burrow:'掘骨蠕虫',shooter:'灰烬哨兵',bomber:'爆囊兽',warden:'熔心守卫'}[e.type]));e.cool=55;player.vx=Math.sign(dx)*2;}
 let m=get(e.x,e.y);if((m===M.LAVA||m===M.ACID||m===M.FIRE)&&tick%15===0)damageEnemy(e,5,'environment');
 }}
function updateProps(){for(let p of props){if(p.dead||Math.abs(p.y-player.y)>VH+50)continue;let supported=solid(get(p.x,p.y+p.r+1));if(!supported){p.vy=Math.min(4,p.vy+.16);p.y+=p.vy;p.fall+=p.vy;}else{p.vy=0;p.fall=0;}
 if(p.type==='boulder'&&p.vy>1&&dist(p,player)<p.r+6)hurt(30,'压死：落下的巨石');
 if(p.type==='barrel'){if(get(p.x,p.y)===M.FIRE||get(p.x,p.y)===M.LAVA)p.fuse=1;if(p.fuse){p.fuse--;if(p.fuse<=0){p.dead=true;pour(p.x,p.y,M.OIL,40);explode(p.x,p.y,29,58,'炸死：燃油桶连锁爆炸');}}}
 }}
function updateDrops(){for(let d of drops){if(d.taken||Math.abs(d.y-player.y)>VH+100)continue;d.vy=Math.min(3,(d.vy||0)+.13);if(!solid(get(d.x,d.y+5)))d.y+=d.vy;else d.vy=0;
 let distance=dist(d,player);if(d.type==='gold'&&distance<28){d.x+=(player.x-d.x)*.13;d.y+=(player.y-d.y)*.13;}if(d.type==='gold'&&distance<9){d.taken=true;gold+=d.value;sound('coin');floatText(player.x,player.y-12,'+'+d.value,'#e5c47c');}if(d.type==='heal'&&distance<12&&player.hp<player.maxHp){d.taken=true;player.hp=Math.min(player.maxHp,player.hp+30);floatText(player.x,player.y-12,'+30 生命','#b5cd93');sound('heal');}}
}
function nearby(){let list=[...drops.filter(d=>!d.taken&&!['gold','heal'].includes(d.type)),...benches.map(b=>({...b,type:'bench'}))];return list.filter(d=>dist(d,player)<28).sort((a,b)=>dist(a,player)-dist(b,player))[0];}
function interact(){if(state!=='play'||panel)return;let d=nearby();if(!d){toast('靠近法杖、宝箱或刻印台，按 F 交互');return;}
 if(d.type==='bench'){openEditor();return;}if(d.type==='ember'){d.taken=true;endRun(true);return;}
 if(d.type==='chest'){d.taken=true;gold+=20+d.tier*10;let id=Object.keys(SPELLS)[ri(0,14)],empty=storage.indexOf(null);if(empty>=0)storage[empty]=id;else storage.push(id);drops.push({type:'heal',x:d.x+8,y:d.y-8,vy:-1});burst(d.x,d.y,'#e6c679',32,2);toast('宝箱：金币 +'+(20+d.tier*10)+' · '+SPELLS[id].name);sound('heal');return;}
 if(d.type==='wand'){d.taken=true;let recipes=[['fork','mote'],['impact','ember','cinder'],['seek','lance'],['timer','fork','rime'],['heavy','venom']];let names=['枝分杖','余烬织者','青灯','时砂','枯月'];let r=d.tier===0?0:ri(0,4),w=d.wand||newWand(names[r],recipes[r],d.tier+1,r===4?3:2);
 if(wands.length<4){wands.push(w);selectedWand=wands.length-1;}else{let old=wands[selectedWand];wands[selectedWand]=w;drops.push({type:'wand',x:player.x-18,y:player.y,vy:0,tier:old.tier,wand:old});}toast('拾取法杖：'+w.name+' · E 查看编排');sound('heal');renderHotbar();}
}
function waterFlask(){if(state!=='play'||panel)return;if(player.flask<10){toast('水瓶已空 · 站在水中补满');return;}player.flask-=10;player.burn=0;player.wet=180;pour(player.x,player.y-7,M.WATER,65);burst(player.x,player.y,'#8bc5d1',12,2);sound('water');}

// All illustrations below are drawn at native pixel resolution, never copied from reference art.
const sprites={
 player:['....hhh....','...hhhhl...','...hdddl...','...hdkd....','....ddd....','...gggrr...','..ggggrrr..','..gggag.r..','..gggag....','..gggag....','..gggggg...','.gggggggg..','.ggggggg...','..bb.bb....','..bb.bb....'],
 rush:['..a......a...','..aa....aa...','...aaaaaa....','..abbbbaaa...','.abbbbbbbaa..','aabbdabbdaa..','aabbbbbbbbaa.','.aabbbbbbaa..','..aawwwwbaa..','..aaa..aaaa..','.aa......aa..'],
 shooter:['...aaaa....','..abbbba...','..abddbba..','...beeba...','...abbaa...','..ccacca...','.ccccccaa..','.accccaaa..','..cccc.....','..b..b.....','.bb..bb....'],
 wing:['a.........a','aa.......aa','abaa...aaba','abbba.abbba','.abbbbbba..','..abddba...','...abba....','....aa.....'],
 bomber:['....dd.....','...abba....','..abbbaa...','.abbbbbba..','abbddbbbba.','abbddbbbba.','abbbbbbbba.','.abbbbbba..','..aaaaaaa..','..aa..aa...'],
 burrow:['...aaa.....','..abbba....','.abbdbba...','abbwwwbba..','abbbbbbba..','.aabbbaa...','..abbbaa...','...abba....','..abbbaa...','...abba....','....aa.....']
};
function drawSprite(pattern,x,y,palette,flip=false,white=false){ctx.save();ctx.translate(Math.round(x),Math.round(y));if(flip)ctx.scale(-1,1);let w=pattern[0].length,h=pattern.length;for(let yy=0;yy<h;yy++)for(let xx=0;xx<pattern[yy].length;xx++){let c=pattern[yy][xx];if(c!=='.'){ctx.fillStyle=white?'#fff7d5':palette[c]||'#7e8260';ctx.fillRect(xx-(w/2|0),yy-(h/2|0),1,1);}}ctx.restore();}
const playerColors={h:'#d9d4b5',l:'#a4aa91',d:'#d4ae83',k:'#282d24',g:'#597859',a:'#b6a96d',r:'#bc5e49',b:'#292e27'};
function drawEnemy(e){let x=e.x-cam.x,y=e.y-cam.y;if(y<-30||y>VH+30||x<-30||x>VW+30)return;
 if(e.type==='warden'){
  let t=tick*.025;for(let i=0;i<6;i++){let a=i*Math.PI/3+t,xx=x+Math.cos(a)*22,yy=y+Math.sin(a)*18;ctx.fillStyle=e.hit?'#fff4c5':'#626a56';ctx.fillRect(xx-4|0,yy-5|0,8,11);ctx.fillStyle='#c89f53';ctx.fillRect(xx-1|0,yy-3|0,2,5);}
  ctx.fillStyle=e.hit?'#fff4c5':'#595e4c';ctx.fillRect(x-12|0,y-13|0,24,26);ctx.fillStyle='#2b332b';ctx.fillRect(x-9|0,y-9|0,18,18);ctx.fillStyle='#d9b561';ctx.fillRect(x-5|0,y-4|0,10,8);ctx.fillStyle='#fff1b5';ctx.fillRect(x-2|0,y-6|0,4,12);
 }else {let pal=e.type==='rush'?{a:'#4a5143',b:'#9b9b79',d:'#edbd70',w:'#dcc7a0'}:e.type==='shooter'?{a:'#392d25',b:'#b69768',c:'#7b5141',d:'#d7b887',e:'#342f28'}:e.type==='wing'?{a:'#453444',b:'#897387',d:'#f1cc90'}:e.type==='bomber'?{a:'#515d31',b:e.fuse&&e.fuse%8<4?'#dfa258':'#a2a264',d:'#efc373'}:{a:'#51433a',b:'#988277',d:'#dea672',w:'#d4c3a0'};
  let bob=e.type==='wing'?Math.sin(e.phase*3)*2:0;drawSprite(sprites[e.type],x,y+bob,pal,e.vx<0,e.hit>0);if(e.freeze){ctx.fillStyle='#b4ebed99';ctx.fillRect(x-6,y-6,12,12);}
 }
 if(e.hp<e.max){ctx.fillStyle='#202719';ctx.fillRect(x-9|0,y-e.r-7|0,18,2);ctx.fillStyle='#bc7d62';ctx.fillRect(x-9|0,y-e.r-7|0,18*e.hp/e.max,1);}
}
let terrain=document.createElement('canvas'),tc=terrain.getContext('2d'),pixels,mask=document.createElement('canvas'),lc=mask.getContext('2d');
function resize(){let r=$('stage').getBoundingClientRect(),aspect=r.width/r.height;VW=aspect<1?360:640;VH=clamp(Math.round(VW/aspect),240,720);canvas.width=terrain.width=mask.width=VW;canvas.height=terrain.height=mask.height=VH;pixels=tc.createImageData(VW,VH);ctx.imageSmoothingEnabled=false;tc.imageSmoothingEnabled=false;if(player){cam.x=clamp(player.x-VW*.38,0,W-VW);cam.y=clamp(player.y-VH*.58,0,H-VH);}}
function light(x,y,r,strength=1,color=null){if(x+r<0||x-r>VW||y+r<0||y-r>VH)return;let g=lc.createRadialGradient(x,y,2,x,y,r);g.addColorStop(0,'rgba(0,0,0,'+strength+')');g.addColorStop(.3,'rgba(0,0,0,'+(strength*.76)+')');g.addColorStop(1,'rgba(0,0,0,0)');lc.fillStyle=g;lc.fillRect(x-r,y-r,r*2,r*2);
 if(color){ctx.save();ctx.globalCompositeOperation='screen';let glow=ctx.createRadialGradient(x,y,0,x,y,r*.8);glow.addColorStop(0,color+'24');glow.addColorStop(1,color+'00');ctx.fillStyle=glow;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();}}
function drawBench(b){let x=b.x-cam.x,y=b.y-cam.y;if(y<-20||y>VH+20)return;
 ctx.fillStyle='#7d7d59';ctx.fillRect(x-13,y+2,26,4);ctx.fillStyle='#484c39';ctx.fillRect(x-10,y+6,5,6);ctx.fillRect(x+5,y+6,5,6);ctx.fillStyle='#bcba81';ctx.fillRect(x-8,y,16,2);ctx.fillStyle='#779482';ctx.fillRect(x-4,y-5,9,5);ctx.fillStyle='#d4d4a4';ctx.fillRect(x,y-5,1,5);ctx.fillStyle='#cab97c';ctx.fillRect(x-12,y-2,2,4);
 for(let i=0;i<3;i++){let a=tick*.02+i*2;ctx.fillStyle='#b9c797';ctx.fillRect(x+Math.cos(a)*8|0,y-13+Math.sin(a)*4|0,1,1);}
}
function drawDrop(d){let x=d.x-cam.x,y=d.y-cam.y;if(d.taken||x<-20||x>VW+20||y<-20||y>VH+20)return;
 if(d.type==='gold'){ctx.fillStyle='#86662f';ctx.fillRect(x-2|0,y-2|0,5,4);ctx.fillStyle='#e4be66';ctx.fillRect(x-2|0,y-2|0,3,3);ctx.fillStyle='#fff1b6';ctx.fillRect(x-1|0,y-2|0,1,1);}
 else if(d.type==='heal'){ctx.fillStyle='#c0c8aa';ctx.fillRect(x-2|0,y-5|0,4,2);ctx.fillStyle='#79794f';ctx.fillRect(x-1|0,y-6|0,2,1);ctx.fillStyle='#874b46';ctx.fillRect(x-3|0,y-2|0,6,7);ctx.fillStyle='#de8a6c';ctx.fillRect(x-2|0,y|0,2,3);}
 else if(d.type==='chest'){ctx.fillStyle='#342b20';ctx.fillRect(x-9,y-5,18,12);ctx.fillStyle='#99744a';ctx.fillRect(x-8,y-6,16,5);ctx.fillRect(x-8,y,16,6);ctx.fillStyle='#c0a36a';ctx.fillRect(x-6,y-6,2,12);ctx.fillRect(x+4,y-6,2,12);ctx.fillStyle='#e3c582';ctx.fillRect(x-1,y-1,3,3);}
 else if(d.type==='wand'){let yy=y+Math.sin(tick*.035)*2;drawWand(ctx,x,yy,d.wand?.type||2,-.3);ctx.fillStyle='#bdb06c';ctx.fillRect(x-12,y+9,24,3);ctx.fillStyle='#58583d';ctx.fillRect(x-8,y+12,16,3);for(let i=0;i<3;i++){let a=tick*.016+i*2;ctx.fillStyle='#e3c685';ctx.fillRect(x+Math.cos(a)*15|0,yy-5+Math.sin(a)*7|0,1,1);}}
 else if(d.type==='ember'){ctx.fillStyle='#ffcf76';ctx.fillRect(x-3,y-6,6,12);ctx.fillRect(x-6,y-3,12,6);ctx.fillStyle='#fff1bd';ctx.fillRect(x-2,y-3,4,6);}
}
function drawWand(c,x,y,type=0,a=0){c.save();c.translate(Math.round(x),Math.round(y));c.rotate(a);c.fillStyle=['#958454','#827773','#bfa069','#9b88ae'][type%4];c.fillRect(-7,-1,15,2);c.fillStyle='#d8c791';c.fillRect(-6,-1,3,1);c.fillStyle=['#cee3a5','#e6e5b9','#9fcdca','#cbb2e5'][type%4];c.fillRect(5,-2,4,4);c.fillStyle='#faf1c3';c.fillRect(7,-1,2,2);if(type===2){c.fillStyle='#957b50';c.fillRect(2,-4,4,1);c.fillRect(2,3,4,1);}c.restore();}
function render(){if(!cells)return;ctx.save();ctx.clearRect(0,0,VW,VH);let sx=shake?(hash(tick,2)%100/100-.5)*shake:0,sy=shake?(hash(tick,6)%100/100-.5)*shake:0;ctx.translate(Math.round(sx),Math.round(sy));
 let cx=Math.floor(cam.x),cy=Math.floor(cam.y);ctx.drawImage(bg,cx,cy,VW,VH,0,0,VW,VH);
 // Misty shafts give the background scale, but do not reveal unlit foreground.
 ctx.fillStyle='#88957505';for(let j=0;j<3;j++)ctx.fillRect((j*197-cx*.2+900)%900-80,0,24,VH);
 let data=pixels.data,lights=[];
 for(let y=0;y<VH;y++){let wy=y+cy,b=biomeIndex(wy),base=wy*W+cx;for(let x=0;x<VW;x++){
  let i=base+x,m=cells[i]||0,k=(y*VW+x)*4;data[k+3]=0;if(!m)continue;let t=texture[i];
  if(solid(m)&&!solid(cells[i-W]||0))t=14;
  if(m===M.WOOD)t=((cx+x)%4===0)?3:8+texture[i]%4;
  if(m===M.BRICK&&((wy%8===0)||((x+cx+(wy/8|0)*11)%24===0)))t=2;
  if(liquid(m)){t=7+(hash(x+cx,wy+(tick/10|0))%4);if(!liquid(cells[i-W]))t=14;}
  if(m===M.FIRE)t=8+hash(x+cx,wy+tick)%8;
  let color=palettes[b][m][t];data[k]=color[0];data[k+1]=color[1];data[k+2]=color[2];data[k+3]=gas(m)?130:255;
  if((m===M.FIRE||m===M.LAVA)&&x%12===0&&wy%8===0&&lights.length<48)lights.push({x,y,r:m===M.LAVA?62:40});
 }}
 tc.putImageData(pixels,0,0);ctx.drawImage(terrain,0,0);
 for(let s of sanctuaries){let y=s.y0-cam.y;if(y>-65&&y<VH){ctx.fillStyle='#a19862';ctx.font='6px monospace';ctx.textAlign='center';ctx.fillText('C A N D L E   R E S T',450-cam.x,y+16);if(!s.perk){ctx.fillStyle='#ccd69e';let yy=y+31+Math.sin(tick*.03)*2;ctx.fillRect(s.x-cam.x-3,yy,6,6);ctx.fillRect(s.x-cam.x-1,yy-2,2,10);}ctx.textAlign='left';}}
 for(let s of sanctuaries){let x=s.entrance-cam.x,y=s.y0-cam.y-22;if(y>-20&&y<VH){ctx.fillStyle='#bbb786';ctx.font='6px monospace';ctx.textAlign='center';ctx.fillText('REST',x,y-5);ctx.fillRect(x,y,1,7);ctx.fillRect(x-2,y+4,5,1);ctx.fillRect(x-1,y+5,3,1);ctx.textAlign='left';}}
 for(let b of benches)drawBench(b);
 for(let p of props){if(p.dead)continue;let x=p.x-cam.x,y=p.y-cam.y;if(y<-20||y>VH+20)continue;if(p.type==='barrel'){ctx.fillStyle='#695139';ctx.fillRect(x-5,y-7,10,14);ctx.fillStyle='#968665';ctx.fillRect(x-5,y-5,10,2);ctx.fillRect(x-5,y+3,10,2);ctx.fillStyle='#bb794c';ctx.fillRect(x-1,y-1,2,3);}else{ctx.fillStyle='#777b69';ctx.fillRect(x-7,y-8,14,16);ctx.fillRect(x-9,y-4,18,8);ctx.fillStyle='#90917b';ctx.fillRect(x-5,y-6,9,2);ctx.fillStyle='#545a4a';ctx.fillRect(x+4,y-3,3,9);}}
 for(let d of drops)drawDrop(d);for(let e of enemies)if(!e.dead)drawEnemy(e);
 if(state!=='dead'){
  let x=player.x-cam.x,y=player.y-cam.y,bob=player.ground&&Math.abs(player.vx)>.5?Math.sin(tick*.4):0;
  ctx.globalAlpha=player.inv&&tick%6<3?.6:1;drawSprite(sprites.player,x,y+bob,playerColors,player.dir<0);ctx.globalAlpha=1;
  let a=aimAngle();drawWand(ctx,x+Math.cos(a)*6,y-1+Math.sin(a)*4,wands[selectedWand]?.type,a);
 }
 for(let t of torches){let x=t.x-cam.x,y=t.y-cam.y;if(x<-10||x>VW+10||y<-20||y>VH+20)continue;
  if(t.type==='spore'){ctx.fillStyle='#827986';ctx.fillRect(x,y-3,2,12);ctx.fillStyle='#b695bd';ctx.fillRect(x-5,y-6,12,4);ctx.fillStyle='#e6b6cf';ctx.fillRect(x-3,y-7,7,2);}
  else if(t.type==='ice'){ctx.fillStyle='#8eb6bc';ctx.fillRect(x-1,y-6,3,12);ctx.fillRect(x-4,y-2,3,7);ctx.fillStyle='#d8e8d8';ctx.fillRect(x,y-5,1,9);}
  else{ctx.fillStyle='#7e5f3d';ctx.fillRect(x-1,y,3,10);ctx.fillStyle='#c79855';ctx.fillRect(x-2,y-2,4,3);ctx.fillStyle='#e79536';ctx.fillRect(x-2,y-7,4,6);ctx.fillStyle='#f4cc76';ctx.fillRect(x-1,y-7-(tick%9<4?2:0),2,6);ctx.fillStyle='#fff0a9';ctx.fillRect(x,y-5,1,3);}
 }
 for(let p of shots){ctx.fillStyle=p.color;ctx.fillRect(p.x-cam.x-1|0,p.y-cam.y-1|0,p.id==='bomb'?4:3,p.id==='bomb'?4:2);if(p.id==='lance'){ctx.strokeStyle=p.color;ctx.beginPath();ctx.moveTo(p.x-cam.x,p.y-cam.y);ctx.lineTo(p.x-cam.x-p.vx,p.y-cam.y-p.vy);ctx.stroke();}}
 for(let p of particles){ctx.globalAlpha=Math.min(1,p.life/10);ctx.fillStyle=p.color;ctx.fillRect(p.x-cam.x|0,p.y-cam.y|0,1,1);}ctx.globalAlpha=1;
 // A dark mask is carved out only around emissive objects (the held wand is a weak light source).
 lc.globalCompositeOperation='source-over';lc.clearRect(0,0,VW,VH);lc.fillStyle='rgba(0,5,7,.88)';lc.fillRect(0,0,VW,VH);lc.globalCompositeOperation='destination-out';
 light(player.x-cam.x,player.y-cam.y,110,.86,'#c6d29b');
 for(let t of torches)light(t.x-cam.x,t.y-cam.y-5,(t.type==='candle'?110:125)+Math.sin(tick*.065+t.x)*5,.96,t.type==='spore'?'#c598d8':t.type==='ice'?'#72a8c2':'#f5b354');
 for(let b of benches)light(b.x-cam.x,b.y-cam.y,48,.55,'#b5c694');
 for(let p of shots)light(p.x-cam.x,p.y-cam.y,p.id==='bomb'?45:55,.88,p.color);
 for(let l of lights)light(l.x,l.y,l.r,.67,'#ff9a44');
 for(let d of drops)if(!d.taken&&['wand','ember'].includes(d.type))light(d.x-cam.x,d.y-cam.y,d.type==='ember'?100:42,.6,'#dbbc7a');
 ctx.drawImage(mask,0,0);
 // Quiet drifting dust is decorative; interacting sparks above belong to the simulation.
 for(let i=0;i<40;i++){let xx=(hash(i,1)%VW+Math.sin(tick*.002+i)*20+VW)%VW,yy=(hash(i,2)%VH+tick*.03*(i%2?1:-1)+VH*10)%VH;ctx.fillStyle=i%5===0?'#a9b98b50':'#a5b09120';ctx.fillRect(xx|0,yy|0,1,1);}
 for(let f of floats){ctx.font='6px monospace';ctx.textAlign='center';ctx.fillStyle=f.color;ctx.globalAlpha=Math.min(1,f.life/15);ctx.fillText(f.text,f.x-cam.x,f.y-cam.y);ctx.globalAlpha=1;ctx.textAlign='left';}
 if(flash>0){ctx.fillStyle='#f0c37a0a';ctx.fillRect(0,0,VW,VH);}
 if(state==='play'&&!panel&&pointer.active&&!touchAim){let x=pointer.x|0,y=pointer.y|0;ctx.fillStyle='#e3d5a6aa';ctx.fillRect(x-5,y,3,1);ctx.fillRect(x+3,y,3,1);ctx.fillRect(x,y-5,1,3);ctx.fillRect(x,y+3,1,3);}
 ctx.restore();
}

function spellIcon(canvas,id){let c=canvas.getContext('2d');c.clearRect(0,0,16,16);if(!id)return;let s=SPELLS[id];c.fillStyle=s.color;c.strokeStyle=s.color;c.lineWidth=1;
 const line=(x,y,xx,yy)=>{c.beginPath();c.moveTo(x+.5,y+.5);c.lineTo(xx+.5,yy+.5);c.stroke();};
 switch(s.icon){
 case 0: c.fillRect(7,2,2,12);c.fillRect(2,7,12,2);c.fillRect(5,5,6,6);c.clearRect(6,6,4,4);break;
 case 1:line(3,13,12,3);line(7,3,12,3);line(12,3,12,8);break;
 case 2:for(let i=0;i<4;i++)c.fillRect(4+i,8-i*2,7-i*2,6+i);break;
 case 3:c.fillRect(4,6,8,7);c.fillRect(6,4,4,2);line(8,4,12,1);c.fillRect(12,1,2,2);break;
 case 4:line(2,13,13,2);line(2,10,10,2);line(6,14,14,6);break;
 case 5:for(let i=0;i<5;i++)c.fillRect(7-i,3+i*2,2+i*2,3);break;
 case 6:line(8,1,8,15);line(2,4,14,12);line(2,12,14,4);break;
 case 7:c.fillRect(4,9,8,5);c.fillRect(6,7,4,2);c.fillRect(3,3,2,3);c.fillRect(10,1,2,4);break;
 case 8:line(3,8,13,2);line(3,8,13,8);line(3,8,13,14);c.fillRect(11,1,3,3);c.fillRect(11,7,3,3);c.fillRect(11,12,3,3);break;
 case 9:line(2,13,12,3);c.fillRect(2,7,2,4);c.fillRect(6,10,2,4);c.fillRect(9,6,4,2);break;
 case 10:c.strokeRect(4.5,4.5,7,7);line(8,1,8,5);line(8,11,8,15);line(1,8,5,8);line(11,8,15,8);break;
 case 11:line(2,12,8,4);line(8,4,13,9);line(13,9,13,4);line(13,9,8,9);break;
 case 12:c.fillRect(3,4,10,8);line(8,2,8,14);break;
 case 13:c.strokeRect(2.5,2.5,11,11);line(5,8,11,8);line(8,5,11,8);line(8,11,11,8);break;
 case 14:line(3,2,13,2);line(3,14,13,14);line(4,3,12,13);line(12,3,4,13);break;
 }
 c.fillStyle='#fff3c4';c.fillRect(7,7,2,2);
}
function renderHotbar(){let el=$('wandHud');el.innerHTML='';for(let i=0;i<4;i++){let w=wands[i],b=document.createElement('button');b.className='wand-chip'+(i===selectedWand?' active':'')+(!w?' empty':'');b.title=w?`${i+1} · ${w.name}`:'空法杖位';b.setAttribute('aria-label',b.title);b.dataset.wand=i;b.innerHTML=`<small>${i+1}</small>`;if(w){let c=document.createElement('canvas');c.width=42;c.height=24;drawWand(c.getContext('2d'),22,12,w.type,-.28);b.append(c);let meter=document.createElement('div');meter.className='wand-charge';meter.innerHTML='<i></i>';b.append(meter);}else b.innerHTML+='<span>·</span>';el.append(b);}}
function updateHud(){let w=wands[selectedWand];$('hpFill').style.width=clamp(player.hp/player.maxHp*100,0,100)+'%';$('hpText').textContent=`${Math.ceil(player.hp)} / ${player.maxHp}`;$('manaFill').style.width=w.mana/w.manaMax*100+'%';$('manaText').textContent=`${Math.floor(w.mana)} / ${w.manaMax}`;$('levFill').style.width=player.lev+'%';$('levText').textContent=Math.ceil(player.lev)+'%';$('goldText').textContent=gold;$('flaskText').textContent=Math.floor(player.flask)+'%';$('depthText').textContent=String(Math.max(0,Math.floor((player.y-220)*.5))).padStart(3,'0')+' m';$('biomeName').textContent=biomes[biomeIndex(player.y)].name;$('layerText').textContent=`0${biomeIndex(player.y)+1} / 05`;
 let statuses=[];if(player.wet)statuses.push('♧ 潮湿');if(player.burn)statuses.push('♨ 燃烧 · Q 泼水');if(player.poison)statuses.push('☠ 中毒');if(player.oily)statuses.push('◒ 油污');if(player.air<360)statuses.push('◌ 氧气 '+Math.ceil(player.air/4.2)+'%');$('statuses').textContent=statuses.join('　');
 let m=get(pointer.x+cam.x,pointer.y+cam.y);$('materialText').textContent=materials[m].name;$('materialSwatch').style.background=materials[m].color;$('coordsText').textContent=`${Math.floor(pointer.x+cam.x)}, ${Math.floor(pointer.y+cam.y)}`;
 let nearbyItem=state==='play'&&!panel?nearby():null;$('interaction').style.display=nearbyItem?'block':'none';if(nearbyItem)$('interaction').textContent='[ F ] '+({wand:'拾取法杖'+(wands.length===4?'（替换当前）':''),chest:'打开宝箱',bench:'使用刻印台 · 编排法杖',ember:'取回余烬 · 结束远征'}[nearbyItem.type]);
 $('wandHud').querySelectorAll('.wand-chip').forEach((b,i)=>{b.classList.toggle('active',i===selectedWand);let fill=b.querySelector('i');if(fill)fill.style.width=wands[i].mana/wands[i].manaMax*100+'%';});
}
function slotArray(ref){return ref.w==='bag'?storage:wands[+ref.w].slots;}
function moveSlot(from,to){if(!canEdit){toast('需要靠近刻印台才能修改法术');return;}if(!from||!to)return;let a=slotArray(from),b=slotArray(to);[a[from.s],b[to.s]]=[b[to.s],a[from.s]];wands.forEach(w=>{w.deck=null;w.cursor=0;});selectedSlot=null;renderEditor();sound('ui');}
function spellButton(id,w,s){let b=document.createElement('button');b.className='spell-slot '+(id?SPELLS[id].kind:'empty');b.dataset.w=w;b.dataset.s=s;b.draggable=false;b.setAttribute('aria-label',id?SPELLS[id].name:`空槽 ${s+1}`);if(selectedSlot&&String(selectedSlot.w)===String(w)&&selectedSlot.s===s)b.classList.add('selected');if(id){let c=document.createElement('canvas');c.width=c.height=16;spellIcon(c,id);b.append(c);let small=document.createElement('small');small.textContent=SPELLS[id].cost;b.append(small);b.title=SPELLS[id].name+' · '+SPELLS[id].desc;}
 return b;}
function renderEditor(){let currentBench=benches.find(b=>dist(b,player)<45);canEdit=!!currentBench||!!player.tinker;$('editBadge').textContent=canEdit?' / 可编辑':' / 仅查看';$('editorHint').textContent=canEdit?'按顺序编排，修饰在弹体之前。触发携带下一组。空槽自动跳过。':'离刻印台太远。可查看与切换法杖，靠近刻印台后才能修改。';let cards=$('wandCards');cards.innerHTML='';
 wands.forEach((w,wi)=>{let card=document.createElement('div');card.className='wand-card'+(wi===selectedWand?' active':'');card.innerHTML=`<div class="wand-card-head"><span>0${wi+1} / ${w.name}</span><button data-equip="${wi}">${wi===selectedWand?'已装备':'装备'}</button></div><div class="wand-stats"><span>乱序 ${w.shuffle?'是':'否'}</span><span>间隔 ${(w.delay/60).toFixed(2)}s</span><span>充能 ${(w.recharge/60).toFixed(2)}s</span><span>魔力 ${w.manaMax}</span><span>回蓝 ${w.regen}/s</span><span>容量 ${w.slots.length}</span></div>`;let row=document.createElement('div');row.className='spell-row';w.slots.forEach((s,i)=>row.append(spellButton(s,wi,i)));card.append(row);cards.append(card);});
 let bag=$('spellStorage');bag.innerHTML='';storage.forEach((s,i)=>bag.append(spellButton(s,'bag',i)));
 let w=wands[selectedWand],deck=w.slots.filter(Boolean),groups=[],i=0;while(i<deck.length){let g=readGroup(deck,i);if(g.node)groups.push(g);i=g.next;}
 const describe=n=>[...n.mods,n.id].map(id=>SPELLS[id].name).join(' → ')+(n.payload?' ⟶ [ '+describe(n.payload)+' ]':'');
 $('chainPreview').textContent='施法预览：'+(groups.map((g,i)=>`${i+1}. ${describe(g.node)}（${g.cost} 魔力）`).join('  /  ')||'没有弹体，无法施法。')+(w.shuffle?' · 乱序法杖会在充能后洗牌。':'');
 let shop=$('shopArea');shop.innerHTML='';if(currentBench?.sanctuary){let s=currentBench.sanctuary,price=35+s.tier*15;shop.innerHTML=`<button id="buySpell" ${s.shopBought?'disabled':''}>${s.shopBought?'本层法术已售出':'◆ '+price+' · 购买寻踪法术'}</button><span style="font-size:10px;color:#8c987c;align-self:center">当前金币 ${gold}</span>`;$('buySpell').onclick=()=>{if(gold<price){toast('金币不足');return;}gold-=price;s.shopBought=true;let n=storage.indexOf(null);if(n>=0)storage[n]='seek';else storage.push('seek');renderEditor();sound('coin');};}
}
function openEditor(){if(state!=='play')return;if(panel==='editor'){closePanel();return;}if(panel)return;selectedSlot=null;setPanel('editor');renderEditor();}
function setPanel(id){panel=id;document.querySelectorAll('.overlay').forEach(e=>e.classList.add('hidden'));$(id).classList.remove('hidden');document.body.classList.add('modal');clearInput();}
function closePanel(){if(panel==='help'&&returnPanel){let back=returnPanel;returnPanel=null;setPanel(back);return;}if(panel==='title'){return;}if(['ending','perks'].includes(panel))return;document.querySelectorAll('.overlay').forEach(e=>e.classList.add('hidden'));panel=null;document.body.classList.remove('modal');clearInput();}
function help(){if(panel==='help'){closePanel();return;}returnPanel=panel;setPanel('help');}
function togglePause(){if(panel==='help'){closePanel();return;}if(state!=='play')return;if(panel){closePanel();return;}setPanel('pause');}
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=180;}
function showBiome(){let b=biomes[biomeIndex(player.y)];$('bannerName').textContent=b.name;$('biomeBanner').querySelector('small').textContent=b.en;$('biomeBanner').querySelector('span').textContent=b.note;$('biomeBanner').classList.add('visible');bannerTime=200;$('footerText').textContent=b.note;}
function offerPerks(){setPanel('perks');let defs=[
 {name:'石纹皮肤',icon:'◇',desc:'所有伤害降低 25%。可重复叠加。',apply:()=>player.armor*=.75},
 {name:'长风之息',icon:'≋',desc:'悬浮消耗降低；补满燃料。',apply:()=>{player.longFlight=true;player.lev=100;}},
 {name:'不熄余火',icon:'♨',desc:'免疫衣袍燃烧。岩浆与爆炸仍会伤害你。',apply:()=>{player.fireproof=true;player.burn=0;}},
 {name:'行走刻印',icon:'✧',desc:'可以在任何地方编辑法杖。',apply:()=>player.tinker=true},
 {name:'生长年轮',icon:'✚',desc:'最大生命 +35，并恢复所有生命。',apply:()=>{player.maxHp+=35;player.hp=player.maxHp;}},
 {name:'锐光',icon:'↗',desc:'所有弹体伤害提升 25%。',apply:()=>player.power*=1.25}
 ];for(let i=defs.length-1;i>0;i--){let j=ri(0,i);[defs[i],defs[j]]=[defs[j],defs[i]];}let el=$('perkCards');el.innerHTML='';defs.slice(0,3).forEach(p=>{let b=document.createElement('button');b.innerHTML=`<span>${p.icon}</span><b>${p.name}</b><small>${p.desc}</small>`;b.onclick=()=>{p.apply();panel=null;$('perks').classList.add('hidden');document.body.classList.remove('modal');toast('获得天赋：'+p.name);sound('heal');};el.append(b);});}
function endRun(won,cause=''){state=won?'won':'dead';setPanel('ending');$('endRune').textContent=won?'◇':'⌁';$('endEyebrow').textContent=won?'YOU CARRIED THE LIGHT HOME':'THE MOUNTAIN REMEMBERS';$('endTitle').textContent=won?'你带回了最后的火':'你已化为余烬';$('deadReason').textContent=won?'熔心已沉寂。黑暗曾吞下你，而你取回了光。':'死因 · '+cause;$('runStats').innerHTML=`<div><b>${deepest} m</b><span>最深抵达</span></div><div><b>${kills}</b><span>击败敌人</span></div><div><b>${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')}</b><span>本局存活</span></div>`;sound(won?'heal':'death');updateHud();try{let best=+localStorage.getItem('ember-best')||0;localStorage.setItem('ember-best',Math.max(best,deepest));}catch{} }
function startRun(newSeed){seed=typeof newSeed==='number'?newSeed:crypto.getRandomValues(new Uint32Array(1))[0];tick=simTick=kills=gold=deepest=elapsed=shake=flash=0;stats={casts:0,reactions:0,damage:0,triggered:0,projectiles:0};toastTimer=0;$('toast').classList.remove('visible');selectedSlot=null;returnPanel=null;setupWands();generateWorld();player={x:180,y:230,vx:0,vy:0,dir:1,hp:100,maxHp:100,lev:100,air:420,flask:100,wet:0,burn:0,oily:0,poison:0,inv:0,ground:false,armor:1,power:1};state='play';panel=null;lastBiome=0;document.querySelectorAll('.overlay').forEach(e=>e.classList.add('hidden'));document.body.classList.remove('modal');clearInput();resize();renderHotbar();updateHud();showBiome();$('seedText').textContent='SEED '+String(seed).padStart(10,'0');sound('start');}

// Soft, synthesized effects only. AudioContext is created from a user gesture.
function unlockAudio(){if(!ac)try{ac=new (window.AudioContext||window.webkitAudioContext)();}catch{}if(ac?.state==='suspended')ac.resume().catch(()=>{});}
function sound(kind){if(muted||!ac||ac.state!=='running')return;let now=ac.currentTime,config={cast:[580,180,.08,.025,'triangle'],drill:[170,70,.055,.013,'sawtooth'],boom:[90,24,.4,.09,'sawtooth'],hit:[230,80,.055,.025,'square'],hurt:[100,38,.14,.035,'sawtooth'],coin:[1100,1700,.13,.025,'sine'],heal:[430,860,.4,.035,'sine'],start:[220,440,.6,.03,'triangle'],death:[120,30,.8,.05,'sawtooth'],jump:[180,380,.12,.015,'sine'],ui:[640,500,.06,.02,'sine'],enemy:[180,100,.12,.015,'square'],water:[600,120,.18,.02,'sine'],trigger:[900,300,.15,.02,'sine']}[kind]||[300,200,.1,.02,'sine'];let [from,to,duration,vol,type]=config,o=ac.createOscillator(),g=ac.createGain();o.type=type;o.frequency.setValueAtTime(from,now);o.frequency.exponentialRampToValueAtTime(to,now+duration);g.gain.setValueAtTime(vol,now);g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g);g.connect(ac.destination);o.start(now);o.stop(now+duration);o.onended=()=>{o.disconnect();g.disconnect();};}
function toggleSound(){muted=!muted;$('soundState').textContent=muted?'关':'开';$('soundBtn').setAttribute('aria-pressed',String(!muted));if(!muted){unlockAudio();sound('ui');}}
function clearInput(){input.left=input.right=input.jump=input.fire=false;touchAim=false;}
function update(){if(state!=='play'||panel)return;tick++;elapsed+=1/60;updatePlayer();if(state!=='play'||panel)return;if(tick%2===0)updateMaterials();updateShots();updateEnemies();updateProps();updateDrops();
 for(let p of particles){p.x+=p.vx;p.y+=p.vy;if(p.gravity)p.vy+=.035;p.life--;}particles=particles.filter(p=>p.life>0);for(let f of floats){f.y-=.18;f.life--;}floats=floats.filter(f=>f.life>0);
 shake*=.86;if(shake<.1)shake=0;flash=Math.max(0,flash-1);let targetX=clamp(player.x-VW*.45+Math.cos(aimAngle())*25,0,W-VW),targetY=clamp(player.y-VH*.54,0,H-VH);cam.x+=(targetX-cam.x)*.08;cam.y+=(targetY-cam.y)*.08;
 if(bannerTime>0&&!--bannerTime)$('biomeBanner').classList.remove('visible');if(tick%6===0)updateHud();
}
let previous=0,acc=0,uiFrame=0;
function loop(now){let delta=Math.min(.05,(now-previous)/1000||0);previous=now;acc+=delta;while(acc>=1/60){update();acc-=1/60;if(toastTimer>0&&!--toastTimer)$('toast').classList.remove('visible');}render();uiFrame++;requestAnimationFrame(loop);}
function selectWand(i){if(wands[i]){selectedWand=i;renderHotbar();sound('ui');}}
function pointerPosition(e){let r=canvas.getBoundingClientRect();pointer.x=clamp((e.clientX-r.left)/r.width*VW,0,VW);pointer.y=clamp((e.clientY-r.top)/r.height*VH,0,VH);pointer.active=true;}
window.addEventListener('keydown',e=>{let k=e.key.toLowerCase();if(!panel&&[' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(['a','arrowleft'].includes(k))input.left=true;if(['d','arrowright'].includes(k))input.right=true;if(['w',' ','arrowup'].includes(k))input.jump=true;if(e.repeat)return;unlockAudio();if(k==='escape'){togglePause();return;}if(k==='h'){help();return;}if(k==='m'){toggleSound();return;}if(state!=='play')return;if(k==='e'){openEditor();return;}if(panel)return;if(k==='f')interact();if(k==='q')waterFlask();if(/^[1-4]$/.test(k))selectWand(+k-1);});
window.addEventListener('keyup',e=>{let k=e.key.toLowerCase();if(['a','arrowleft'].includes(k))input.left=false;if(['d','arrowright'].includes(k))input.right=false;if(['w',' ','arrowup'].includes(k))input.jump=false;});
window.addEventListener('blur',()=>{clearInput();if(state==='play'&&!panel)setPanel('pause');});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(state==='play'&&!panel)setPanel('pause');}});
canvas.addEventListener('pointermove',pointerPosition);canvas.addEventListener('pointerdown',e=>{e.preventDefault();if(state!=='play'||panel)return;unlockAudio();pointerPosition(e);input.fire=true;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointerup',()=>input.fire=false);canvas.addEventListener('pointercancel',()=>input.fire=false);canvas.addEventListener('lostpointercapture',()=>input.fire=false);canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();if(state==='play'&&!panel)selectWand((selectedWand+(e.deltaY>0?1:wands.length-1))%wands.length);},{passive:false});
$('wandHud').onclick=e=>{let b=e.target.closest('[data-wand]');if(b&&!panel)selectWand(+b.dataset.wand);};$('inventoryBtn').onclick=openEditor;$('waterBtn').onclick=waterFlask;
$('startBtn').onclick=()=>{unlockAudio();startRun();};$('restartBtn').onclick=()=>startRun();$('pauseBtn').onclick=togglePause;$('resumeBtn').onclick=closePanel;$('helpBtn').onclick=help;$('titleHelp').onclick=help;$('pauseHelp').onclick=help;$('soundBtn').onclick=toggleSound;
$('fullBtn').onclick=()=>{if(document.fullscreenElement){document.exitFullscreen?.().catch(()=>{});}else document.documentElement.requestFullscreen?.().catch(()=>toast('当前浏览器不允许全屏'));};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=closePanel);
for(let [id,key] of [['leftBtn','left'],['rightBtn','right'],['jumpBtn','jump']]){let b=$(id);b.onpointerdown=e=>{e.preventDefault();unlockAudio();input[key]=true;b.setPointerCapture(e.pointerId);};b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>input[key]=false;}
$('interactBtn').onclick=interact;$('cycleBtn').onclick=()=>selectWand((selectedWand+1)%wands.length);
function padAim(e){let r=$('aimPad').getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);if(Math.hypot(dx,dy)>6)pointer.angle=Math.atan2(dy,dx);touchAim=true;pointer.active=false;}
$('aimPad').onpointerdown=e=>{e.preventDefault();unlockAudio();pointer.angle=player.dir>0?0:Math.PI;padAim(e);input.fire=true;$('aimPad').setPointerCapture(e.pointerId);};$('aimPad').onpointermove=e=>{if(input.fire&&touchAim)padAim(e);};$('aimPad').onpointerup=$('aimPad').onpointercancel=$('aimPad').onlostpointercapture=()=>{input.fire=false;touchAim=false;};
// Pointer-based drag/drop works with mouse and touch. Click-click is the keyboard-accessible fallback.
let drag=null,ghost=null,suppressClick=false;
$('editor').addEventListener('pointerdown',e=>{let b=e.target.closest('.spell-slot');if(!b||!canEdit)return;let ref={w:b.dataset.w,s:+b.dataset.s};if(!slotArray(ref)[ref.s])return;drag={ref,x:e.clientX,y:e.clientY,moved:false,pointer:e.pointerId,button:b};});
window.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.pointer)return;if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6){drag.moved=true;ghost=drag.button.cloneNode(true);ghost.classList.add('slot-ghost');let c=ghost.querySelector('canvas');if(c)spellIcon(c,slotArray(drag.ref)[drag.ref.s]);document.body.append(ghost);}if(ghost){ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';document.querySelectorAll('.drop-target').forEach(b=>b.classList.remove('drop-target'));document.elementFromPoint(e.clientX,e.clientY)?.closest('.spell-slot')?.classList.add('drop-target');}});
window.addEventListener('pointerup',e=>{if(!drag)return;if(drag.moved){let target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.spell-slot');if(target)moveSlot(drag.ref,{w:target.dataset.w,s:+target.dataset.s});suppressClick=true;setTimeout(()=>suppressClick=false,0);}ghost?.remove();ghost=null;drag=null;document.querySelectorAll('.drop-target').forEach(b=>b.classList.remove('drop-target'));});
window.addEventListener('pointercancel',()=>{ghost?.remove();ghost=null;drag=null;});
$('editor').addEventListener('click',e=>{if(suppressClick)return;let equip=e.target.closest('[data-equip]');if(equip){selectWand(+equip.dataset.equip);renderEditor();return;}let b=e.target.closest('.spell-slot');if(!b)return;let ref={w:b.dataset.w,s:+b.dataset.s};showSpellInfo(ref);if(!canEdit)return;if(selectedSlot){moveSlot(selectedSlot,ref);}else if(slotArray(ref)[ref.s]){selectedSlot=ref;renderEditor();showSpellInfo(ref);}});
function showSpellInfo(ref){let id=slotArray(ref)[ref.s];if(id){let s=SPELLS[id];$('spellInfo').textContent=`${s.name} / ${{projectile:'弹体',mod:'修饰',trigger:'触发'}[s.kind]} · 魔力 ${s.cost}${s.damage?' · 伤害 '+s.damage:''} — ${s.desc}`;}}
$('editor').addEventListener('pointerover',e=>{let b=e.target.closest('.spell-slot');if(b)showSpellInfo({w:b.dataset.w,s:+b.dataset.s});});$('editor').addEventListener('focusin',e=>{let b=e.target.closest('.spell-slot');if(b)showSpellInfo({w:b.dataset.w,s:+b.dataset.s});});
window.addEventListener('resize',resize);
// Only explicitly requested test mode exposes instrumentation; normal gameplay has no debug controls.
if(new URLSearchParams(location.search).has('test'))window.__ember={
 snapshot:()=>({state,panel,seed,tick,player:{...player},kills,gold,deepest,elapsed,stats:{...stats},cam:{...cam},viewport:{w:VW,h:VH},enemies:enemies.filter(e=>!e.dead).map(e=>({...e})),shots:shots.map(p=>({...p})),wands:JSON.parse(JSON.stringify(wands)),storage:[...storage],sanctuaries:JSON.parse(JSON.stringify(sanctuaries)),props:JSON.parse(JSON.stringify(props))}),
 start:startRun,step:n=>{for(let i=0;i<n;i++)update();updateHud();},get,put,rect,updateMaterials,M,readGroup,damageEnemy,spawnEnemy,explode,
 fixture:(x,y)=>{player.x=x;player.y=y;player.vx=player.vy=0;cam.x=clamp(x-VW*.45,0,W-VW);cam.y=clamp(y-VH*.54,0,H-VH);},
 setPlayer:patch=>Object.assign(player,patch),equip:(slots)=>{wands[selectedWand].slots=[...slots,...Array(Math.max(0,8-slots.length)).fill(null)];wands[selectedWand].deck=null;wands[selectedWand].mana=wands[selectedWand].manaMax;},cast,counts:()=>({materials:cells.reduce((a,m)=>(a[m]=(a[m]||0)+1,a),{}),enemies:enemies.length}),render
};
startRun(72849103);state='title';setPanel('title');$('biomeBanner').classList.remove('visible');requestAnimationFrame(loop);
})();
