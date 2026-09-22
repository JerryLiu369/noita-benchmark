/* ASHFALL · 灰烬竖井 — original falling-sand roguelite prototype.
   Zero backend, zero build, zero npm. Open index.html via any static server.
   Systems: density-layered liquids, fire/acid/lava reactions, darkness+lights,
   wand deck evaluation (modifier/multicast/trigger), 6 biomes + holy rooms,
   6 enemy behaviours, explicit death causes, screenshake/particles/WebAudio. */
'use strict';
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d',{alpha:false});
const VW=320,VH=180,W=320,H=1500;
// ---------- materials ----------
const MAT={AIR:0,ROCK:1,DIRT:2,SAND:3,WATER:4,OIL:5,BLOOD:6,ACID:7,LAVA:8,STONE:9,WOOD:10,COAL:11,ICE:12,SNOW:13,GOLD:14,METAL:15,BRICK:16,FIRE:17,SMOKE:18,STEAM:19,TOXICGAS:20,TOXIC:21,GUNPOWDER:22,FUNGUS:23,CRYSTAL:24,HEAL:25};
const SOLID=new Set([1,2,9,10,11,12,14,15,16,23,24]);
const LIQ=new Set([4,5,6,7,8,21,25]);
const POWDER=new Set([3,13,22]);
const GAS=new Set([18,19,20]);
const DENSITY={5:6,4:10,25:9,21:11,6:13,7:16,8:25}; // oil<floats ... lava sinks
const DUR={1:12,2:6,9:10,10:5,11:8,12:4,14:7,15:13,16:99,23:5,24:6}; // durability thresholds
const FLAM={5:3,10:2,11:3,22:4,23:2,6:0,4:0}; // flammability 0..4
const BASE_COL={0:[5,6,11],1:[66,69,85],2:[89,67,61],3:[154,117,69],4:[77,145,195],5:[139,103,63],6:[173,63,80],7:[120,210,90],8:[226,92,47],9:[108,108,117],10:[118,65,65],11:[38,34,40],12:[169,200,209],13:[212,228,239],14:[226,185,76],15:[111,116,127],16:[122,104,140],17:[244,162,59],18:[140,140,155],19:[197,218,225],20:[155,186,69],21:[120,150,55],22:[70,66,74],23:[73,108,75],24:[126,220,230],25:[110,255,170]};
// ---------- biomes / layout ----------
const BIOMES=[
 {name:'矿坑',bg:[17,23,42],rock:1,accent:'coal veins + gold'},
 {name:'煤坑',bg:[21,18,36],rock:11,accent:'oil + fire'},
 {name:'真菌洞',bg:[13,33,28],rock:23,accent:'slime + heal'},
 {name:'雪山',bg:[21,34,58],rock:12,accent:'ice + crystal'},
 {name:'熔岩湖',bg:[33,21,26],rock:9,accent:'lava lakes'},
 {name:'终焉 vault',bg:[30,24,34],rock:15,accent:'boss'}];
const LAYOUT=[{t:'surf',h:70},{t:'b',id:0,h:200},{t:'holy',id:0,h:46},{t:'b',id:1,h:200},{t:'holy',id:1,h:46},{t:'b',id:2,h:200},{t:'holy',id:2,h:46},{t:'b',id:3,h:195},{t:'holy',id:3,h:46},{t:'b',id:4,h:195},{t:'holy',id:4,h:46},{t:'b',id:5,h:214}];
const ZONE=[];(function(){let y=0;for(const L of LAYOUT){for(let i=0;i<L.h&&y<H;i++,y++)ZONE[y]=L;}})();
function zoneAt(y){y=Math.max(0,Math.min(H-1,y|0));return ZONE[y]}
function biomeIdAt(y){const z=zoneAt(y);if(z.t==='b')return z.id;if(z.t==='holy')return 'holy';return 'surf'}
// ---------- spells ----------
const SPELLS={
 spark:{name:'火花',type:'proj',cost:4,delay:6,dmg:9,speed:4.1,life:110,dig:0,desc:'廉价速射的小火花'},
 arrow:{name:'飞箭',type:'proj',cost:8,delay:14,dmg:19,speed:4.6,life:140,dig:0,desc:'均衡的魔法箭'},
 firebolt:{name:'炎爆弹',type:'proj',cost:16,delay:24,dmg:24,speed:3.1,life:150,rad:9,dig:6,fire:1,desc:'命中爆炸并点燃'},
 bomb:{name:'开山雷管',type:'proj',cost:26,delay:32,dmg:52,speed:2.4,life:200,rad:17,dig:12,grav:1,desc:'强力挖掘爆破'},
 drill:{name:'光钻',type:'proj',cost:9,delay:2,dmg:8,speed:5.0,life:46,dig:8,desc:'快速钻头,降低延迟'},
 bubble:{name:'泡泡',type:'proj',cost:11,delay:20,dmg:11,speed:2.6,life:220,dig:0,bouncy:3,desc:'缓慢弹跳的泡泡'},
 lightning:{name:'雷弧',type:'proj',cost:22,delay:32,dmg:38,speed:6.0,life:40,dig:0,chain:1,glow:1,desc:'极速链式闪电'},
 waterjet:{name:'水注',type:'proj',cost:3,delay:3,dmg:2,speed:4.6,life:60,dig:0,water:1,desc:'灭火的水流'},
 acidorb:{name:'酸蚀球',type:'proj',cost:14,delay:22,dmg:16,speed:3.4,life:130,dig:5,acid:1,desc:'留下强酸水洼'},
 homing:{name:'追踪',type:'mod',cost:6,desc:'弹体追踪 nearby 敌人'},
 firemod:{name:'火舌',type:'mod',cost:4,desc:'命中点燃 + 发光'},
 bouncy:{name:'弹跳',type:'mod',cost:3,desc:'碰墙反弹 2 次'},
 critical:{name:'暴击',type:'mod',cost:5,desc:'25% 概率双倍伤害'},
 explosive:{name:'爆裂',type:'mod',cost:8,desc:'命中附加小爆炸'},
 light:{name:'微光',type:'mod',cost:1,desc:'弹体照亮洞穴'},
 pierce:{name:'穿透',type:'mod',cost:6,desc:'穿透 3 个敌人'},
 damage:{name:'增幅',type:'mod',cost:7,desc:'伤害 +12'},
 speedy:{name:'疾速',type:'mod',cost:2,desc:'弹速 +60%'},
 double:{name:'双重',type:'multi',cost:4,extra:1,delay:4,desc:'本轮多抽 1 张'},
 triple:{name:'三重',type:'multi',cost:10,extra:2,delay:10,desc:'本轮多抽 2 张'},
 scatter:{name:'散射',type:'multi',cost:12,extra:4,delay:14,spread:1,desc:'本轮多抽 4 张并散开'},
 trigger:{name:'触发',type:'trigger',cost:8,cap:2,desc:'命中时释放后 2 张'},
 timer:{name:'定时',type:'trigger',cost:9,cap:2,timer:55,desc:'55 帧后释放后 2 张'},
 blink:{name:'闪现',type:'util',cost:20,delay:40,desc:'向瞄准方向传送'},
 healburst:{name:'治疗',type:'util',cost:30,delay:50,desc:'恢复 25 HP'},
};
const PROJ_IDS=['spark','arrow','firebolt','bomb','drill','bubble','lightning','waterjet','acidorb'];
const MOD_IDS=['homing','firemod','bouncy','critical','explosive','light','pierce','damage','speedy'];
const MULTI_IDS=['double','triple','scatter'];
const TRIG_IDS=['trigger','timer'];
function spellKind(id){return SPELLS[id]?SPELLS[id].type:'proj'}
function spellName(id){return SPELLS[id]?SPELLS[id].name:id}
// ---------- perks ----------
const PERKS={
 resist:{name:'血肉护甲',desc:'受到的伤害 -35%。'},
 power:{name:'玻璃大炮',desc:'法术伤害×2,生命上限减半。'},
 crit:{name:'暴击直觉',desc:'20% 概率法术双倍伤害。'},
 flight:{name:'长久飞行',desc:'飞行燃料回复翻倍,上限+40。'},
 gold:{name:'炼金之血',desc:'金币拾取+50%,击杀回 1 点魔力。'},
 tinker:{name:'魔杖工匠',desc:' anywhere 改杖,不限圣所。'},
 breath:{name:'鱼鳃',desc:'水中不再溺水。'},
 fireimm:{name:'火焰免疫',desc:'不再着火,熔岩伤害大减。'},
 toxicimm:{name:'毒素免疫',desc:'毒与酸伤害大减。'},
 swift:{name:'快速施法',desc:'全部魔杖延迟 -30%。'},
};
// ---------- state ----------
let seed=1,rng=Math.random,world=null,player=null,enemies=[],projectiles=[],particles=[],floatTexts=[];
let pickups=[],groundWands=[],torches=[],chests=[],lights=[];
let wands=[],inv={},currentWand=0,perkChoices=[],holyClaimed=new Set();
let gameState='title',camY=0,camX=0,shake=0,frame=0,runGold=0,runKills=0,runTime=0,runStart=0;
let editOpen=false,selected=null,lastCause='',bossRef=null,muzzle=0;
let oxygenMax=240;
const keys={};let pointer={x:160,y:60,down:false,lastAim:0};
const $=id=>document.getElementById(id);
function makeRng(s){let t=s>>>0;return()=>{t+=0x6D2B79F5;let x=t;x=Math.imul(x^x>>>15,1|x);x^=x+Math.imul(x^x>>>7,61|x);return((x^x>>>14)>>>0)/4294967296}}
function rint(a,b){return Math.floor(rng()*(b-a+1))+a}
function pick(arr){return arr[Math.floor(rng()*arr.length)]}
function clamp(v,a,b){return v<a?a:v>b?b:v}
function idx(x,y){return y*W+x}
function inside(x,y){return x>=0&&x<W&&y>=0&&y<H}
function get(x,y){x|=0;y|=0;return inside(x,y)?world.cells[idx(x,y)]:MAT.BRICK}
function setm(x,y,m){x|=0;y|=0;if(inside(x,y))world.cells[idx(x,y)]=m}
function hash2(x,y){let h=(Math.imul(x,374761393)+Math.imul(y,668265263))|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296}
// ---------- audio ----------
const SFX={ctx:null,muted:false,
 ensure(){if(this.ctx||this.muted)return null;try{this.ctx=this.ctx||new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume();return this.ctx}catch(e){return null}},
 tone(f,dur,type,vol,slide){if(this.muted)return;const ac=this.ensure();if(!ac)return;try{const o=ac.createOscillator(),g=ac.createGain();o.type=type||'square';o.frequency.setValueAtTime(f,ac.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,f+slide),ac.currentTime+dur);g.gain.setValueAtTime(vol||.05,ac.currentTime);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+dur);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+dur)}catch(e){}},
 noise(dur,vol,fc){if(this.muted)return;const ac=this.ensure();if(!ac)return;try{const len=Math.floor(ac.sampleRate*dur),buf=ac.createBuffer(1,len,ac.sampleRate),d=buf.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);const s=ac.createBufferSource();s.buffer=buf;const f=ac.createBiquadFilter();f.type='lowpass';f.frequency.value=fc||800;const g=ac.createGain();g.gain.value=vol||.12;s.connect(f);f.connect(g);g.connect(ac.destination);s.start()}catch(e){}},
 play(k,p){if(this.muted)return;switch(k){
  case 'cast':this.tone(420+(p||0)*30,.07,'square',.03);break;
  case 'drill':this.tone(900,.05,'sawtooth',.025,-400);break;
  case 'boom':this.noise(.35,.22,500);this.tone(70,.3,'sine',.12,-30);break;
  case 'smallboom':this.noise(.18,.12,900);break;
  case 'hit':this.noise(.06,.07,2400);this.tone(220,.05,'square',.02);break;
  case 'hurt':this.tone(160,.18,'sawtooth',.06,-80);break;
  case 'pickup':this.tone(660,.07,'square',.035);setTimeout(()=>this.tone(990,.09,'square',.035),60);break;
  case 'gold':this.tone(1200,.05,'square',.02);break;
  case 'splash':this.noise(.12,.06,1200);break;
  case 'tele':this.tone(300,.2,'sine',.05,600);break;
  case 'heal':this.tone(520,.12,'sine',.05,260);break;
  case 'perk':this.tone(523,.12,'square',.04);setTimeout(()=>this.tone(784,.16,'square',.04),110);break;
  case 'die':this.tone(220,.6,'sawtooth',.08,-180);break;
  case 'win':[523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.tone(f,.15,'square',.05),i*130));break;
  case 'ui':this.tone(700,.04,'square',.02);break;
  case 'acid':this.noise(.1,.05,3000);break;
 }}};
function toast(t){const el=$('toast');el.textContent=t;el.style.opacity=1;clearTimeout(toast._t);toast._t=setTimeout(()=>el.style.opacity=0,1600)}
// ---------- world gen ----------
function genWorld(){
 world={cells:new Uint8Array(W*H),holyRooms:[]};
 world.cells.fill(MAT.ROCK);
 // base rock type per row
 for(let y=0;y<H;y++){const z=zoneAt(y);let base=MAT.ROCK;
  if(z.t==='surf'){for(let x=0;x<W;x++)world.cells[idx(x,y)]=y<34?MAT.AIR:MAT.DIRT;continue}
  else if(z.t==='b'){const b=z.id;if(b===0)base=MAT.ROCK;else if(b===1)base=MAT.COAL;else if(b===2)base=MAT.FUNGUS;else if(b===3)base=MAT.ICE;else if(b===4)base=MAT.STONE;else base=MAT.METAL;
   // sprinkle
   for(let x=0;x<W;x++){const r=rng();
    if(b===0&&r<.10)base=MAT.DIRT;else if(b===0&&r>.94)base=MAT.GOLD;
    else if(b===1&&r<.5)base=MAT.ROCK;else if(b===1&&r>.93)base=MAT.WOOD;
    else if(b===2&&r<.4)base=MAT.DIRT;
    else if(b===3&&r<.45)base=MAT.SNOW;
    else if(b===4&&r<.3)base=MAT.ROCK;
    else if(b===5&&r<.4)base=MAT.ROCK;
    else base=(b===0?MAT.ROCK:b===1?MAT.COAL:b===2?MAT.FUNGUS:b===3?MAT.ICE:b===4?MAT.STONE:MAT.METAL);
    world.cells[idx(x,y)]=base;}}
  else{for(let x=0;x<W;x++)world.cells[idx(x,y)]=MAT.ROCK;}
 }
 // carve caverns per biome
 for(let y=34;y<H-8;y++){const z=zoneAt(y);if(z.t==='holy')continue;
  for(let x=0;x<W;x++){if(x<6||x>W-7){if(y>34)world.cells[idx(x,y)]=MAT.ROCK;continue}
   const n=Math.sin(x*.105+y*.035)+Math.sin(x*.021-y*.08)+Math.sin((x+y)*.013)+Math.sin(x*.31+y*.17)*.25;
   const open=z.t==='surf'?y>34&&n>-0.1:(n>0.25||(y%195>60&&n<-0.55));
   if(open)world.cells[idx(x,y)]=MAT.AIR;}}
 // main shafts
 for(let y=30;y<H-30;y++){if(zoneAt(y).t==='holy')continue;const cx=160+Math.round(Math.sin(y*.03)*22);
  for(let x=cx-3;x<=cx+3;x++)if(inside(x,y))world.cells[idx(x,y)]=MAT.AIR;
  if(rng()<.3){const sx=60+rint(0,200);for(let x=sx-2;x<=sx+2;x++)if(inside(x,y))world.cells[idx(x,y)]=MAT.AIR;}}
 // side tunnels (worms)
 for(let t=0;t<90;t++){let x=rint(20,W-20),y=rint(80,H-120);if(zoneAt(y).t==='holy')continue;const len=rint(20,70);let a=rng()*6.28;
  for(let i=0;i<len;i++){a+=(rng()-.5)*.6;x+=Math.cos(a)*1.4;y+=Math.sin(a)*1.1;for(let q=-2;q<=2;q++)for(let k=-2;k<=2;k++)if(q*q+k*k<6&&inside(x+q|0,y+k|0)&&zoneAt(y+k|0).t!=='holy')world.cells[idx(x+q|0,y+k|0)]=MAT.AIR;}}
 // holy rooms
 for(let yy=0;yy<H;yy++){if(zoneAt(yy).t==='holy'&&zoneAt(yy-1).t!=='holy'){carveHoly(yy);}}
 // surface clearing + entry
 for(let y=10;y<64;y++)for(let x=130;x<190;x++)world.cells[idx(x,y)]=MAT.AIR;
 for(let x=0;x<W;x++)for(let y=0;y<30;y++)world.cells[idx(x,y)]=MAT.AIR;
 // boss arena bottom
 carveArena();
 // props
 enemies=[];projectiles=[];particles=[];floatTexts=[];pickups=[];groundWands=[];torches=[];chests=[];bossRef=null;
 player={x:160,y:46,vx:0,vy:0,w:6,h:10,hp:100,maxHp:100,hover:100,maxHover:100,oxygen:oxygenMax,inv:0,onGround:false,dir:1,burn:0,poison:0,wet:0,dead:false,perk:{},kills:0,face:1};
 runGold=0;runKills=0;runTime=0;runStart=Date.now();
 placeLiquids();placeProps();placeEnemies();
}
function carveHoly(y0){
 const x0=56,x1=264,y1=y0+46;const room={y0,y1,x0,x1,claimed:false,id:world.holyRooms.length};
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)world.cells[idx(x,y)]=MAT.AIR;
 for(let x=x0-2;x<=x1+2;x++)for(let y=y0-2;y<=y1+2;y++){if(x<x0||x>x1||y<y0||y>y1)world.cells[idx(x,y)]=MAT.BRICK}
 for(let x=150;x<170;x++)for(let y=y0-4;y<y0+1;y++)world.cells[idx(x,y)]=MAT.AIR;
 for(let x=150;x<170;x++)for(let y=y1-1;y<y1+4;y++)world.cells[idx(x,y)]=MAT.AIR;
 for(let x=x0;x<=x1;x++){world.cells[idx(x,y1-1)]=MAT.BRICK;if(x<120||x>200)world.cells[idx(x,y1-2)]=MAT.AIR}
 // floor slab for pedestals
 for(let x=90;x<230;x++)world.cells[idx(x,y1-1)]=MAT.BRICK;
 world.holyRooms.push(room);
 // torches
 torches.push({x:x0+8,y:y0+20,flick:rng()*9});torches.push({x:x1-8,y:y0+20,flick:rng()*9});
 torches.push({x:160,y:y0+8,flick:rng()*9});
 // heal pool in middle holy
 if(room.id===2){for(let x=150;x<170;x++)for(let y=y1-4;y<y1-1;y++)world.cells[idx(x,y)]=MAT.HEAL}
}
function carveArena(){
 const y0=H-110,y1=H-14;
 for(let y=y0;y<y1;y++)for(let x=50;x<270;x++)world.cells[idx(x,y)]=MAT.AIR;
 for(let x=48;x<=272;x++)for(let y=y1;y<y1+6;y++)world.cells[idx(x,y)]=MAT.BRICK;
 for(let x=48;x<=50;x++)for(let y=y0;y<y1;y++)world.cells[idx(x,y)]=MAT.BRICK;
 for(let x=270;x<=272;x++)for(let y=y0;y<y1;y++)world.cells[idx(x,y)]=MAT.BRICK;
 // pillars
 for(const px of [100,220])for(let y=y0+30;y<y1;y++)for(let x=px-2;x<=px+2;x++)world.cells[idx(x,y)]=MAT.ROCK;
 torches.push({x:80,y:y0+20,flick:1});torches.push({x:240,y:y0+20,flick:2});torches.push({x:160,y:y0+8,flick:3});
 // lava traps at sides
 for(let x=56;x<90;x++)for(let y=y1-3;y<y1;y++)world.cells[idx(x,y)]=MAT.LAVA;
 for(let x=230;x<264;x++)for(let y=y1-3;y<y1;y++)world.cells[idx(x,y)]=MAT.LAVA;
}
function pool(x,y,mat,r){for(let q=-r;q<=r;q++)for(let k=-r;k<=r;k++)if(q*q+k*k<=r*r&&inside(x+q,y+k)&&world.cells[idx(x+q,y+k)]===MAT.AIR)world.cells[idx(x+q,y+k)]=mat}
function placeLiquids(){
 for(let b=0;b<6;b++){const y0=70+b*246;let n=4+b;
  for(let i=0;i<n;i++){const x=rint(30,290),y=rint(y0+40,y0+190);if(get(x,y)!==MAT.AIR)continue;
   let mat=MAT.WATER;const r=rng();
   if(b===0)mat=r<.5?MAT.WATER:r<.7?MAT.OIL:MAT.BLOOD;
   else if(b===1)mat=r<.45?MAT.OIL:r<.7?MAT.WATER:MAT.BLOOD;
   else if(b===2)mat=r<.4?MAT.TOXIC:r<.65?MAT.WATER:r<.8?MAT.HEAL:MAT.BLOOD;
   else if(b===3)mat=r<.6?MAT.WATER:MAT.OIL;
   else if(b===4)mat=r<.55?MAT.LAVA:r<.75?MAT.WATER:MAT.OIL;
   else mat=r<.5?MAT.WATER:MAT.BLOOD;
   pool(x,y,mat,rint(2,5));}}
 // lava lake in lava biome guaranteed
 for(let x=100;x<220;x++)for(let y=0;y<4;y++){const yy=70+4*246+150+y;if(get(x,yy)===MAT.AIR)setm(x,yy,MAT.LAVA)}
 // surface pond
 pool(110,58,MAT.WATER,4);
}
function placeProps(){
 // torches along shafts
 for(let y=120;y<H-140;y+=170){torches.push({x:140,y,flick:rng()*9});if(rng()<.5)torches.push({x:185,y,flick:rng()*9});}
 // chests + wands + hearts
 for(let b=0;b<6;b++){const y0=70+b*246;
  for(let i=0;i<3;i++){const x=rint(30,290),y=rint(y0+50,y0+190);if(get(x,y)===MAT.AIR&&get(x,y+1)!==MAT.AIR)chests.push({x,y:y+0.5,opened:false});}
  const wx=rint(40,280),wy=rint(y0+60,y0+180);
  groundWands.push({x:wx,y:wy,w:genWand(b+1),bob:rng()*9});
  if(b>=1){const hx=rint(40,280),hy=rint(y0+60,y0+180);if(get(hx,hy)===MAT.AIR)pickups.push({type:'heart',x:hx,y:hy,vx:0,vy:0});}
  for(let i=0;i<6;i++){const gx=rint(24,296),gy=rint(y0+50,y0+195);if(get(gx,gy)===MAT.AIR)pickups.push({type:'gold',x:gx,y:gy,vx:0,vy:0,val:rint(4,12+b*3)});}
  for(let i=0;i<2;i++){const sx=rint(24,296),sy=rint(y0+50,y0+195);if(get(sx,sy)===MAT.AIR)pickups.push({type:'spell',x:sx,y:sy,vx:0,vy:0,spell:randomSpellForTier(b+1)});}
 }
 // crystal clusters glow in snow/vault
 for(let i=0;i<40;i++){const x=rint(10,W-10),y=rint(70,H-120);if(get(x,y)===MAT.AIR&&SOLID.has(get(x,y+1))&&(biomeIdAt(y)===3||biomeIdAt(y)===5)&&rng()<.3){setm(x,y,MAT.CRYSTAL);torches.push({x,y,flick:rng()*9,crystal:true});}}
}
function placeEnemies(){
 const table=[['crawler','bat','spitter'],['crawler','bat','spitter','bloomer'],['crawler','spitter','bloomer','burrower'],['bat','spitter','burrower','brute'],['spitter','bloomer','brute','burrower'],['brute','spitter','bloomer','burrower']];
 for(let b=0;b<6;b++){const y0=70+b*246,n=7+b*3;
  for(let i=0;i<n;i++){const t=pick(table[b]);const x=rint(24,296),y=rint(y0+50,y0+195);if(get(x,y)!==MAT.AIR)continue;spawnEnemy(t,x,y,b);}}
 // boss
 spawnEnemy('boss',160,H-60,5);
}
function tierAt(y){const b=biomeIdAt(y);return b==='holy'||b==='surf'?1:(b+1)}
function biomeNameAt(y){const b=biomeIdAt(y);return b==='surf'?'地表':b==='holy'?'圣所':BIOMES[b].name}
function spawnEnemy(type,x,y,tier){
 tier=tier||0;const scale=1+tier*.35;
 const base={crawler:{hp:26,dmg:8},bat:{hp:14,dmg:5},spitter:{hp:34,dmg:9},bloomer:{hp:20,dmg:30},burrower:{hp:40,dmg:11},brute:{hp:120,dmg:16},boss:{hp:900,dmg:18}}[type];
 const e={type,x,y,vx:0,vy:0,hp:base.hp*scale,max:base.hp*scale,dmg:base.dmg,cool:rint(40,120),dir:rng()<.5?-1:1,phase:rng()*9,dead:false,flash:0,burn:0,fuse:-1,tier,atkCd:0};
 // settle to air
 if(get(x|0,y|0)!==MAT.AIR){for(let yy=y|0;yy>Math.max(0,y-30);yy--){if(get(x|0,yy)===MAT.AIR){e.y=yy;break}}}
 enemies.push(e);if(type==='boss')bossRef=e;return e;
}
// ---------- wands ----------
const WNAMES=['晨星','水银','矿井','裂隙','余烬','苔痕','霜语','熔喉','静电','低语'];
function genWand(tier){
 const cap=clamp(rint(2,4)+(tier>=3?rint(0,2):0)+(tier>=5?1:0),2,8);
 const w={name:pick(WNAMES)+'·'+tier+'阶',slots:[],cap,spellsPerCast:rng()<.14&&tier>=3?2:(rng()<.04?3:1),
  castDelay:Math.round((0.06+rng()*0.3)*60),recharge:Math.round((0.35+rng()*0.8)*60),
  manaMax:rint(90,170)+tier*rint(15,35),regen:rint(22,45)+tier*4,shuffle:rng()<.35,spread:rng()*6-1,speed:0.9+rng()*0.25,pos:0,castT:0,rechT:0,mana:0,timer2:0};
 w.mana=w.manaMax;
 const n=rint(1,Math.min(cap,2+tier));for(let i=0;i<n;i++)w.slots.push(randomSpellForTier(tier));
 if(rng()<.08&&tier>=2)w.always='light';
 return w;
}
function randomSpellForTier(t){
 const r=rng();let pool;
 if(t<=1)pool=['spark','spark','arrow','drill','waterjet','double','homing','light','firebolt'];
 else if(t===2)pool=['arrow','firebolt','drill','bubble','bomb','double','homing','firemod','bouncy','trigger','blink'];
 else if(t===3)pool=['firebolt','bubble','lightning','acidorb','bomb','triple','homing','critical','explosive','trigger','timer','healburst'];
 else pool=['firebolt','bomb','lightning','acidorb','bubble','scatter','triple','pierce','damage','critical','explosive','timer','trigger','speedy','blink','healburst'];
 return pick(pool);
}
function baseWands(){
 const a={name:'晨星· starter',slots:['spark','spark'],cap:3,spellsPerCast:1,castDelay:9,recharge:22,manaMax:140,regen:34,shuffle:false,spread:0,speed:1,pos:0,castT:0,rechT:0,mana:140};
 const b={name:'裂隙· starter',slots:['bomb'],cap:2,spellsPerCast:1,castDelay:5,recharge:14,manaMax:110,regen:16,shuffle:true,spread:1,speed:1,pos:0,castT:0,rechT:0,mana:110};
 return [a,b];
}
// Noita-like deck evaluation. Returns {shots:[{kind,mods,payload,timer}],mana,costDelay,wrap}
function evaluateWand(w){
 const order=w._order||w.slots;const n=order.length;
 if(!n)return{shots:[],mana:0,delay:0,wrap:true};
 let i=w.pos,remaining=w.spellsPerCast,shots=[],curMods=[],pending=null,mana=0,delay=0,draws=0,wrap=false,spreadBonus=0;
 const draw=()=>{if(i>=n){wrap=true;return null}const id=order[i++];draws++;return id};
 while(remaining>0&&draws<n*2+4){
  const id=draw();if(!id)break;const s=SPELLS[id];if(!s){remaining--;continue}
  mana+=s.cost;
  if(s.type==='mod'){curMods.push(id);delay+=1}
  else if(s.type==='multi'){remaining+=s.extra;delay+=s.delay;if(s.spread)spreadBonus=1;for(let k=0;k<s.extra;k++){/* extra draws handled by remaining */}}
  else if(s.type==='trigger'){
   if(pending){/* nested trigger: flush old as single */shots.push({trigger:pending.carrier||'spark',mods:pending.mods,payload:pending.payload,timer:pending.timer});remaining--}
   pending={type:id,mods:curMods.slice(),payload:[],cap:s.cap,timer:s.timer||0,carrier:null};curMods=[];
  }
  else{ // projectile or utility
   delay+=s.delay||8;
   if(pending){
    if(!pending.carrier){pending.carrier={proj:id,mods:curMods.slice()};curMods=[]}
    else if(pending.payload.length<pending.cap){pending.payload.push({proj:id,mods:curMods.slice()});curMods=[];if(pending.payload.length>=pending.cap){shots.push({trigger:pending.carrier,mods:pending.mods,payload:pending.payload,timer:pending.timer});pending=null;remaining--}}
    else{shots.push({trigger:pending.carrier,mods:pending.mods,payload:pending.payload,timer:pending.timer});pending=null;remaining--; // then place current as normal
     shots.push({proj:id,mods:curMods.slice()});curMods=[];remaining--;}
   }else{shots.push({proj:id,mods:curMods.slice()});curMods=[];remaining--;}
  }
 }
 if(pending){ // trigger with no payload: fires carrier alone if exists
  if(pending.carrier)shots.push({trigger:pending.carrier,mods:pending.mods,payload:pending.payload,timer:pending.timer});
  else if(pending.mods.length===0){/* fizzle */} 
 }
 return{shots,mana,delay,wrap,spreadBonus,nextPos:wrap?0:i};
}
function shuffleOrder(w){const a=w.slots.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));const t=a[i];a[i]=a[j];a[j]=t}w._order=a}
function tryCast(){
 if(gameState!=='play'||editOpen||perkChoices.length)return;
 const w=wands[currentWand];if(!w||w.castT>0||w.rechT>0)return;
 if(w.shuffle&&(!w._order||w._order.length!==w.slots.length))shuffleOrder(w);
 const ev=evaluateWand(w);
 if(!ev.shots.length){if(ev.wrap){w.pos=0;w.rechT=w.recharge;if(w.shuffle)shuffleOrder(w)}return}
 if(w.mana<ev.mana){toast('魔力不足');SFX.play('ui');w.castT=8;return}
 w.mana-=ev.mana;
 let swift=player.perk.swift?0.7:1;
 w.castT=Math.max(2,Math.round(ev.delay*swift*.55));
 if(ev.wrap){w.rechT=Math.round(w.recharge*swift);w.pos=0;if(w.shuffle)shuffleOrder(w)}else w.pos=ev.nextPos;
 const aimV=aimDir();const baseA=Math.atan2(aimV.y,aimV.x);
 ev.shots.forEach((s,k)=>{
  const off=(k-(ev.shots.length-1)/2)*(ev.spreadBonus?0.22:0.1)+(w.spread*Math.PI/180)*(rng()-.5)*2;
  if(s.trigger){spawnShot(s.trigger.proj||'spark',(s.trigger.mods||[]).concat(s.mods||[]),baseA+off,{payload:s.payload,timer:s.timer});}
  else spawnShot(s.proj,s.mods,baseA+off,null);
 });
 if(w.always&&SPELLS[w.always]){/* always-cast light: passive glow */}
 muzzle=4;SFX.play(ev.shots.length>2?'smallboom':'cast',ev.shots.length);
}
function spawnShot(projId,mods,angle,trig){
 const s=SPELLS[projId]||SPELLS.spark;const p={x:player.x+Math.cos(angle)*7,y:player.y+Math.sin(angle)*7-1,
  vx:Math.cos(angle)*s.speed,vy:Math.sin(angle)*s.speed,life:s.life||120,type:projId,dmg:s.dmg||8,
  rad:s.rad||0,bouncy:(s.bouncy||0)+(mods.includes('bouncy')?2:0),homing:mods.includes('homing'),
  fire:mods.includes('firemod')||s.fire,pierce:mods.includes('pierce')?3:0,crit:mods.includes('critical'),
  explosive:mods.includes('explosive')||!!s.rad,glow:mods.includes('light')||s.glow||s.fire||projId==='spark',
  chain:!!s.chain,water:!!s.water,acid:!!s.acid,grav:s.grav?0.06:(projId==='bubble'?-0.008:0.012),
  owner:'player',payload:trig?trig.payload||[]:[],timer:trig?trig.timer||0:-1,hits:0,angle};
 if(mods.includes('damage'))p.dmg+=12;
 if(mods.includes('speedy')){p.vx*=1.6;p.vy*=1.6}
 if(player.perk.power)p.dmg*=2;
 if(player.perk.crit&&rng()<.2)p.dmg*=2;
 p.vx*=wands[currentWand].speed;p.vy*=wands[currentWand].speed;
 projectiles.push(p);
 if(projectiles.length>220)projectiles.splice(0,projectiles.length-220);
}
// ---------- physics helpers ----------
function solidAtRect(x,y,w,h){const l=Math.floor(x-w/2),r=Math.floor(x+w/2),t=Math.floor(y-h/2),b=Math.floor(y+h/2);
 for(let yy=t;yy<=b;yy++)for(let xx=l;xx<=r;xx++)if(SOLID.has(get(xx,yy)))return true;return false}
function moveBody(o,dx,dy,w,h){if(dx){const nx=o.x+dx;if(!solidAtRect(nx,o.y,w,h))o.x=nx;else o.vx=0}
 if(dy){const ny=o.y+dy;if(!solidAtRect(o.x,ny,w,h))o.y=ny;else{o.vy=0;return false}}return true}
function aimDir(){
 let ax,ay;
 if(pointer.active&&performance.now()-pointer.lastAim<4000){ax=pointer.x-player.x;ay=(pointer.y+camY)-player.y}
 else{ // touch auto-aim: nearest enemy
  let best=null,bd=130;for(const e of enemies){if(e.dead)continue;const d=Math.hypot(e.x-player.x,(e.y-player.y));if(d<bd){bd=d;best=e}}
  if(best){ax=best.x-player.x;ay=best.y-player.y}else{ax=player.face*20;ay=-2}}
 if(Math.abs(ax)<.5&&Math.abs(ay)<.5)ax=player.face*10;
 const l=Math.hypot(ax,ay)||1;return{x:ax/l,y:ay/l};
}
// ---------- combat ----------
const CAUSES={burn:'烧死 — 被火焰吞噬',lava:'葬身熔岩 — 沉入了火湖',drown:'溺死 — 在液体中窒息',poison:'毒死 — 毒素侵蚀了身体',acid:'溶解 — 被强酸化为脓水',boom:'炸碎 — 被爆炸撕成碎片',crush:'压死 — 被岩石挤碎',melee:'被击杀',shot:'被法术击杀',suicide:'被自爆吞没',boss:'被深渊之眼注视而死',fall:'坠落 — 摔成了肉泥'};
function hurtPlayer(d,cause){
 if(player.inv>0||player.dead||gameState!=='play')return;
 if(player.perk.resist)d*=.65;
 if((cause==='burn'||cause==='lava')&&player.perk.fireimm)d*=.15;
 if((cause==='poison'||cause==='acid')&&player.perk.toxicimm)d*=.2;
 player.hp-=d;player.inv=Math.max(player.inv,18);lastCause=cause;
 if(cause==='burn'||cause==='lava')player.burn=Math.min(240,player.burn+40);
 shake=Math.min(10,shake+d*.15);
 SFX.play('hurt');
 burst(player.x,player.y-3,6,['#ff6a6a','#c54858'],1.4);
 if(player.hp<=0)die(cause);
}
function die(cause){
 if(player.dead)return;player.dead=true;gameState='dead';SFX.play('die');
 const c=CAUSES[cause]||('被击杀 — '+cause);
 $('deadReason').textContent='死因：'+c;
 const mins=Math.floor((Date.now()-runStart)/60000),secs=Math.floor((Date.now()-runStart)/1000)%60;
 $('runStats').textContent=`深入 ${Math.floor(player.y)}m · ${biomeNameAt(player.y)} · 击败 ${runKills} · 拾取 ${runGold} ⬢ · 存活 ${mins}分${secs}秒 · 种子 ${seed>>>0}`;
 $('dead').classList.remove('hide');
}
function damageEnemy(e,d,cause){
 if(e.dead)return;e.hp-=d;e.flash=4;
 floatTexts.push({x:e.x,y:e.y-8,txt:Math.round(d)+'',life:30,max:30,color:'#fff'});
 burst(e.x,e.y,4,['#c54858','#7a1f2a'],1.2);
 if(rng()<.4&&inside(e.x|0,(e.y+2)|0)&&get(e.x|0,(e.y+2)|0)===MAT.AIR)setm(e.x|0,(e.y+2)|0,MAT.BLOOD);
 SFX.play('hit');
 if(e.hp<=0)killEnemy(e,cause);
}
function killEnemy(e,cause){
 if(e.dead)return;e.dead=true;runKills++;player.kills=(player.kills||0)+1;
 const val=e.type==='boss'?200:rint(4,14)+(player.perk.gold?5:0);
 for(let i=0;i<(e.type==='boss'?10:3);i++)pickups.push({type:'gold',x:e.x+rng()*6-3,y:e.y+rng()*4-2,vx:(rng()-.5)*1.4,vy:-rng()*2,val:Math.ceil(val/3)});
 burst(e.x,e.y,e.type==='boss'?40:14,['#c54858','#f4d15f','#fff'],2.2);
 if(e.type!=='boss'&&rng()<.10)pickups.push({type:'spell',x:e.x,y:e.y,vx:0,vy:-1,spell:randomSpellForTier(Math.min(5,tierAt(e.y)))});
 if(e.type!=='boss'&&rng()<.05)pickups.push({type:'heart',x:e.x,y:e.y,vx:0,vy:-1});
 if(e.type==='boss'){shake=14;SFX.play('win');gameState='win';$('winStats').textContent=`深入 ${Math.floor(player.y)}m · 击败 ${runKills} · 拾取 ${runGold} ⬢ · 种子 ${seed>>>0}`;$('win').classList.remove('hide');burst(e.x,e.y,40,['#d978e8','#fff29c'],3)}
 else SFX.play('smallboom');
}
function explode(x,y,rad,dmg,owner,dig){
 dig=dig==null?10:dig;x|=0;y|=0;
 for(let yy=-rad;yy<=rad;yy++)for(let xx=-rad;xx<=rad;xx++){const d=Math.hypot(xx,yy);if(d>rad)continue;
  const gx=x+xx,gy=y+yy;if(!inside(gx,gy))continue;const m=get(gx,gy);
  if(m===MAT.BRICK)continue;
  if(SOLID.has(m)){const du=DUR[m]==null?8:DUR[m];if(du<=dig&&rng()<1-d/rad*.65)setm(gx,gy,MAT.AIR)}
  else if(LIQ.has(m)){if(rng()<.7)setm(gx,gy,MAT.AIR)}
  else if(m===MAT.FIRE&&rng()<.5)setm(gx,gy,MAT.SMOKE);}
 // ignite rim
 for(let i=0;i<rad;i++){const a=rng()*6.28,gx=x+Math.cos(a)*rad|0,gy=y+Math.sin(a)*rad|0;
  if(FLAM[get(gx,gy)]&&rng()<.5)setm(gx,gy,MAT.FIRE);else if(get(gx,gy)===MAT.AIR&&rng()<.2)setm(gx,gy,MAT.FIRE)}
 particles.push({x,y,life:10,max:10,kind:'flash',rad:rad*1.6});
 burst(x,y,16,['#ffc45e','#ff8149','#5a5a66'],3);
 lights.push({x,y:y-camY,r:rad*5+60,i:.95,hot:'#ff9a45',t:6});
 shake=Math.min(14,shake+rad*.35);SFX.play(rad>12?'boom':'smallboom');
 for(const e of enemies){if(e.dead)continue;const d=Math.hypot(e.x-x,e.y-y);if(d<rad+7)damageEnemy(e,dmg*(1-d/(rad+8)),'boom')}
 const pd=Math.hypot(player.x-x,player.y-y);
 if(pd<rad+6){hurtPlayer(dmg*(owner==='player'?0.45:1)*(1-pd/(rad+8)),'boom')}
}
function burst(x,y,n,cols,spd){for(let i=0;i<n;i++){if(particles.length>500)particles.shift();
 const a=rng()*6.28,s=rng()*(spd||2);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-0.6,life:rint(14,40),max:40,color:pick(cols),size:rng()<.3?2:1,grav:.05})}}
// ---------- material sim ----------
function updateMaterials(){
 const y0=clamp(Math.floor(camY)-14,1,H-2),y1=clamp(y0+VH+28,2,H-1);
 for(let y=y1;y>=y0;y--){
  const start=(frame*37+y*13)%W;
  for(let k=0;k<W;k++){const x=(start+k)%W;const m=world.cells[idx(x,y)];if(m===MAT.AIR||m===MAT.BRICK)continue;
   if(m===MAT.SAND||m===MAT.SNOW||m===MAT.GUNPOWDER){
    const below=get(x,y+1);
    if(below===MAT.AIR){setm(x,y,MAT.AIR);setm(x,y+1,m)}
    else if(LIQ.has(below)){setm(x,y,below);setm(x,y+1,m)} // powder sinks
    else{const d=rng()<.5?-1:1;
     if(get(x+d,y+1)===MAT.AIR||LIQ.has(get(x+d,y+1))){const t=get(x+d,y+1);setm(x,y,t===MAT.AIR?MAT.AIR:t);setm(x+d,y+1,m)}
     else if(get(x+d,y)===MAT.AIR){setm(x,y,MAT.AIR);setm(x+d,y,m)}}
    if(m===MAT.SNOW&&get(x,y-1)===MAT.LAVA){setm(x,y,MAT.WATER)}
   }
   else if(LIQ.has(m)){
    // lava reactions first
    if(m===MAT.LAVA){
     const nb=[[0,1],[0,-1],[1,0],[-1,0]];
     for(const o of nb){const t=get(x+o[0],y+o[1]);
      if(t===MAT.WATER||t===MAT.ICE||t===MAT.SNOW){setm(x+o[0],y+o[1],MAT.STEAM);setm(x,y,MAT.STONE);burst(x,y,4,['#c5dae1'],1);break}
      if((t===MAT.OIL||t===MAT.WOOD||t===MAT.COAL||t===MAT.FUNGUS||t===MAT.GUNPOWDER)&&rng()<.2){setm(x+o[0],y+o[1],MAT.FIRE);break}}
     if(get(x,y)===MAT.LAVA&&rng()<.004&&get(x,y-1)===MAT.AIR)setm(x,y-1,MAT.SMOKE);
    }
    if(m===MAT.ACID){
     // corrode neighbours (not brick)
     if(rng()<.25){const o=pick([[0,1],[0,-1],[1,0],[-1,0]]);const t=get(x+o[0],y+o[1]);
      if(SOLID.has(t)&&t!==MAT.BRICK&&rng()<.5){setm(x+o[0],y+o[1],MAT.AIR);if(rng()<.4)setm(x,y,MAT.SMOKE);SFX.play('acid')}
      else if(t===MAT.AIR&&rng()<.02)setm(x,y,MAT.SMOKE);}
    }
    // density layering: heavy sinks
    const dm=DENSITY[m]||10;const below=get(x,y+1);
    if(below===MAT.AIR){setm(x,y,MAT.AIR);setm(x,y+1,m)}
    else if(LIQ.has(below)&&(DENSITY[below]||10)<dm){setm(x,y,below);setm(x,y+1,m)} // swap: heavy goes down
    else{const d=rng()<.5?-1:1;
     const diag=get(x+d,y+1);
     if(diag===MAT.AIR){setm(x,y,MAT.AIR);setm(x+d,y+1,m)}
     else if(LIQ.has(diag)&&(DENSITY[diag]||10)<dm){setm(x,y,diag);setm(x+d,y+1,m)}
     else if(get(x+d,y)===MAT.AIR&&rng()<.8){setm(x,y,MAT.AIR);setm(x+d,y,m)}
     else if(get(x-d,y)===MAT.AIR&&rng()<.4){setm(x,y,MAT.AIR);setm(x-d,y,m)}}
    // water extinguishes fire neighbours
    if((m===MAT.WATER||m===MAT.BLOOD)&&rng()<.3){for(const o of [[1,0],[-1,0],[0,1],[0,-1]])if(get(x+o[0],y+o[1])===MAT.FIRE){setm(x+o[0],y+o[1],MAT.STEAM);break}}
   }
   else if(m===MAT.FIRE){
    if(rng()<.10){setm(x,y,MAT.SMOKE);continue}
    // heat ice/snow -> water
    for(const o of [[0,1],[1,0],[-1,0],[0,-1]]){const t=get(x+o[0],y+o[1]);
     if(t===MAT.ICE||t===MAT.SNOW){if(rng()<.3)setm(x+o[0],y+o[1],MAT.WATER)}
     else if(t===MAT.WATER){setm(x,y,MAT.STEAM);break}
     else if(FLAM[t]&&rng()<.06+FLAM[t]*.02){setm(x+o[0],y+o[1],MAT.FIRE)}
     else if(t===MAT.GUNPOWDER&&rng()<.4){explode(x+o[0],y+o[1],10,30,'world',8);break}}
   }
   else if(m===MAT.SMOKE||m===MAT.STEAM||m===MAT.TOXICGAS){
    if(get(x,y-1)===MAT.AIR){setm(x,y,MAT.AIR);setm(x,y-1,m)}
    else if(rng()<.3&&get(x+(rng()<.5?1:-1),y-1)===MAT.AIR){setm(x,y,MAT.AIR);setm(x+(rng()<.5?1:-1),y-1,m)}
    else if(rng()<(m===MAT.STEAM?.02:.012)){ // dissipate / condense
     if(m===MAT.STEAM&&rng()<.3)setm(x,y,MAT.WATER);else setm(x,y,MAT.AIR)}
   }
   else if(m===MAT.TOXIC){if(rng()<.003&&get(x,y-1)===MAT.AIR)setm(x,y-1,MAT.TOXICGAS)}
   else if(m===MAT.ICE){if(get(x,y+1)===MAT.LAVA||get(x,y-1)===MAT.LAVA)setm(x,y,MAT.WATER)}
   else if(m===MAT.WOOD||m===MAT.COAL||m===MAT.FUNGUS||m===MAT.OIL){}
  }
 }
}
// ---------- projectiles ----------
function updateProjectiles(){
 for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];
  if(p.homing){let best=null,bd=110;for(const e of enemies){if(e.dead)continue;const d=Math.hypot(e.x-p.x,e.y-p.y);if(d<bd){bd=d;best=e}}
   if(best){const d=bd||1;p.vx+=(best.x-p.x)/d*.12;p.vy+=(best.y-p.y)/d*.12;const n=Math.hypot(p.vx,p.vy)||1,sp=Math.min(5.4,(SPELLS[p.type]?SPELLS[p.type].speed:4)+1);p.vx=p.vx/n*sp;p.vy=p.vy/n*sp}}
  p.vy+=p.grav||0;p.x+=p.vx;p.y+=p.vy;p.life--;
  if(p.fire&&rng()<.25&&inside(p.x|0,p.y|0)&&get(p.x|0,p.y|0)===MAT.AIR)setm(p.x|0,p.y|0,MAT.FIRE);
  if(p.timer>0){p.timer--;if(p.timer<=0){releasePayload(p);projectiles.splice(i,1);continue}}
  if(p.life<=0){impactShot(p,true);projectiles.splice(i,1);continue}
  if(!inside(p.x,p.y)){projectiles.splice(i,1);continue}
  const cell=get(p.x|0,p.y|0);
  if(SOLID.has(cell)){
   if(p.bouncy>0){p.bouncy--;p.vx*=-.75;p.vy*=-.75;p.x+=p.vx*2;p.y+=p.vy*2;SFX.play('hit')}
   else{impactShot(p,false);projectiles.splice(i,1);continue}
  }
  if(p.owner==='enemy'){if(Math.hypot(player.x-p.x,player.y-p.y)<6){hurtPlayer(p.dmg,'shot');projectiles.splice(i,1);continue}}
  else{for(const e of enemies){if(e.dead)continue;const rr=e.type==='boss'?13:7;
   if(Math.hypot(e.x-p.x,e.y-p.y)<rr){
    let mult=1;if(p.crit&&rng()<.25)mult=2;else if(player.perk.crit&&rng()<.2)mult=2;
    damageEnemy(e,p.dmg*mult,'shot');
    if(p.chain){for(const o of enemies)if(o!==e&&!o.dead&&Math.hypot(o.x-e.x,o.y-e.y)<40)damageEnemy(o,p.dmg*.5,'shot');burst(e.x,e.y,8,['#b9e7ff'],2)}
    if(p.payload&&p.payload.length){releasePayload(p)}
    else if(p.explosive){explode(p.x,p.y,9,p.dmg,'player',8)}
    else if(p.type==='firebolt'){explode(p.x,p.y,7,p.dmg,'player',6)}
    else if(p.fire){setm(p.x|0,p.y|0,MAT.FIRE)}
    if(p.pierce>0){p.pierce--;p.hits++;break}
    projectiles.splice(i,1);break}}
   if(!projectiles.includes(p))continue;
  }
 }
}
function releasePayload(p){
 const a=rng()*6.28;const arr=p.payload||[];
 arr.forEach((s,k)=>{const aa=a+k*(6.28/Math.max(1,arr.length));const def=SPELLS[s.proj]||SPELLS.spark;
  projectiles.push({x:p.x,y:p.y,vx:Math.cos(aa)*def.speed,vy:Math.sin(aa)*def.speed,life:def.life||110,type:s.proj,dmg:def.dmg+(s.mods.includes('damage')?12:0),rad:def.rad||(s.mods.includes('explosive')?8:0),bouncy:(def.bouncy||0)+(s.mods.includes('bouncy')?2:0),homing:s.mods.includes('homing'),fire:s.mods.includes('firemod')||def.fire,pierce:s.mods.includes('pierce')?3:0,crit:s.mods.includes('critical'),explosive:s.mods.includes('explosive')||!!def.rad,glow:s.mods.includes('light')||def.glow,chain:def.chain,water:def.water,acid:def.acid,grav:def.grav?0.06:0.012,owner:p.owner,payload:[],timer:-1,hits:0})});
 if(arr.length)SFX.play('cast',2);
}
function impactShot(p,timeout){
 const x=p.x|0,y=p.y|0;
 if(p.payload&&p.payload.length){releasePayload(p);return}
 if(p.explosive||p.type==='bomb'){explode(x,y,p.rad||12,p.dmg,p.owner,p.type==='bomb'?12:8);return}
 if(p.type==='firebolt'){explode(x,y,7,p.dmg,p.owner,6);return}
 if(p.type==='drill'){for(let q=-3;q<=3;q++)for(let k=-3;k<=3;k++)if(q*q+k*k<12){const m=get(x+q,y+k);if(SOLID.has(m)&&(DUR[m]||8)<=8&&m!==MAT.BRICK)setm(x+q,y+k,MAT.AIR)}burst(x,y,3,['#e9f4ff'],1);return}
 if(p.water){for(let i=0;i<5;i++){const gx=x+rint(-2,2),gy=y+rint(-2,2);if(inside(gx,gy)&&get(gx,gy)===MAT.AIR)setm(gx,gy,MAT.WATER);
   if(get(gx,gy)===MAT.FIRE)setm(gx,gy,MAT.STEAM)}if(player.burn>0&&Math.hypot(player.x-x,player.y-y)<20){player.burn=0;player.wet=120}return}
 if(p.acid){for(let i=0;i<4;i++){const gx=x+rint(-1,1),gy=y+rint(-1,1);if(inside(gx,gy)&&get(gx,gy)===MAT.AIR)setm(gx,gy,MAT.ACID)}return}
 if(p.fire){if(get(x,y)===MAT.AIR)setm(x,y,MAT.FIRE);return}
 if(p.type==='lightning'){burst(x,y,10,['#b9e7ff'],2.5);return}
 burst(x,y,3,['#fff'],1);
}
// ---------- enemies ----------
const ENAME={crawler:'爬行者',bat:'洞穴蝠',spitter:'喷吐者',bloomer:'自爆孢',burrower:'潜地虫',brute:'重甲守卫',boss:'深渊之眼'};
function updateEnemies(){
 const px=player.x,py=player.y;
 for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];
  if(e.dead){enemies.splice(i,1);continue}
  const dx=px-e.x,dy=py-e.y,dist=Math.hypot(dx,dy)||1;
  if(dist>320)continue; // sleep far
  if(e.flash>0)e.flash--;
  // shared hazards: lava/acid/fire cells
  const cell=get(e.x|0,e.y|0);
  if(cell===MAT.LAVA){damageEnemy(e,2.2,'lava');e.burn=60}
  else if(cell===MAT.ACID){damageEnemy(e,1.6,'acid')}
  else if(cell===MAT.FIRE){e.burn=60}
  if(e.burn>0){e.burn--;if(frame%20===0)damageEnemy(e,e.max*.02+1,'burn');if(rng()<.3)particles.push({x:e.x,y:e.y-4,vx:0,vy:-.5,life:14,max:14,color:'#ff9a45',size:1,grav:-.02})}
  if(e.dead)continue;
  e.cool--;e.atkCd--;
  if(e.type==='crawler'){
   e.vx+=Math.sign(dx)*.02;e.vx*=.92;e.vx=clamp(e.vx,-.7,.7);e.vy+=.14;
   if(Math.abs(dx)<70&&Math.abs(dy)<26&&e.cool<=0&&e.onG){e.vy=-2.6;e.vx=Math.sign(dx)*1.2;e.cool=90}
   e.onG=!moveBody(e,0,e.vy,7,10);moveBody(e,e.vx,0,7,10);
   if(dist<8&&e.atkCd<=0){hurtPlayer(e.dmg,ENAME.crawler+'撕咬');e.atkCd=50}
  }else if(e.type==='bat'){
   e.x+=Math.sin(frame*.09+e.phase)*.5+Math.sign(dx)*.12;e.y+=Math.cos(frame*.07+e.phase)*.4+Math.sign(dy)*.08;
   if(SOLID.has(get(e.x|0,e.y|0))){e.y-=1}
   if(dist<7&&e.atkCd<=0){hurtPlayer(e.dmg,ENAME.bat+'撞击');e.atkCd=45}
  }else if(e.type==='spitter'){
   const want=70;e.vx+=(Math.sign(-dx)*(dist<want?-0.015:0.015)+Math.sin(frame*.03+e.phase)*.01);e.vy+=(Math.cos(frame*.025+e.phase)*.012+(dist>120?Math.sign(dy)*.015:Math.sign(dy)*.004));
   e.vx*=.97;e.vy*=.97;e.vx=clamp(e.vx,-.6,.6);e.vy=clamp(e.vy,-.5,.5);
   e.x+=e.vx;e.y+=e.vy;if(SOLID.has(get(e.x|0,e.y|0))){e.x-=e.vx*2;e.y-=e.vy*2}
   if(e.cool<=0&&dist<160){const a=Math.atan2(dy,dx);projectiles.push({x:e.x,y:e.y,vx:Math.cos(a)*1.9,vy:Math.sin(a)*1.9,life:130,type:'espit',dmg:e.dmg,color:'#ee7094',owner:'enemy',grav:0});e.cool=Math.max(50,110-e.tier*8);SFX.play('cast',-2)}
   if(dist<8&&e.atkCd<=0){hurtPlayer(6,ENAME.spitter+'触碰');e.atkCd=50}
  }else if(e.type==='bloomer'){
   if(e.fuse<0){e.vx+=Math.sign(dx)*.022;e.vx*=.9;e.vx=clamp(e.vx,-.8,.8);e.vy+=.13;e.onG=!moveBody(e,0,e.vy,7,9);moveBody(e,e.vx,0,7,9);
    if(dist<26){e.fuse=36;SFX.play('ui')}}
   else{e.fuse--;e.vx*=.8;if(e.fuse<=0){explode(e.x,e.y,17,e.dmg,'enemy',6);e.dead=true;runKills++;continue}}
   if(dist<7&&e.fuse<0&&e.atkCd<=0){hurtPlayer(5,ENAME.bloomer+'啃咬');e.atkCd=50}
  }else if(e.type==='burrower'){
   // swims through soft solids
   const soft=m=>m===MAT.DIRT||m===MAT.SAND||m===MAT.FUNGUS||m===MAT.SNOW||m===MAT.COAL||m===MAT.AIR||LIQ.has(m);
   const nx=e.x+Math.sign(dx)*.55,ny=e.y+Math.sin(frame*.05+e.phase)*.3+(dist<90?Math.sign(dy)*.4:0.1);
   if(soft(get(nx|0,e.y|0)))e.x=nx;if(soft(get(e.x|0,ny|0)))e.y=ny;else e.y-=0.5;
   if(rng()<.06&&SOLID.has(get(e.x|0,(e.y+5)|0)))burst(e.x,e.y+4,2,['#59433d'],1);
   if(dist<40&&e.cool<=0){e.vx=Math.sign(dx)*2.2;e.vy=-1.6;e.cool=120} // lunge
   e.x+=e.vx*.3;e.y+=e.vy*.3;e.vx*=.9;e.vy*=.9;
   if(dist<8&&e.atkCd<=0){hurtPlayer(e.dmg,ENAME.burrower+'钻咬');e.atkCd=55}
  }else if(e.type==='brute'){
   e.vx+=Math.sign(dx)*.014;e.vx*=.9;e.vx=clamp(e.vx,-.5,.5);e.vy+=.14;
   e.onG=!moveBody(e,0,e.vy,9,12);moveBody(e,e.vx,0,9,12);
   if(e.cool<=0&&dist<200&&Math.abs(dy)<60){const a=Math.atan2(dy,dx);for(let q=-1;q<=1;q++){const aa=a+q*.14;projectiles.push({x:e.x,y:e.y-2,vx:Math.cos(aa)*1.7,vy:Math.sin(aa)*1.7,life:150,type:'espit',dmg:e.dmg-4,color:'#ffb066',owner:'enemy',grav:0})}e.cool=150}
   if(dist<11&&e.atkCd<=0){hurtPlayer(e.dmg,ENAME.brute+'重击');e.atkCd=60}
  }else if(e.type==='boss'){
   e.vx+=(Math.sin(frame*.02)*.02+Math.sign(dx)*.012);e.vy+=(Math.cos(frame*.017)*.02+Math.sign(dy)*.01);
   e.vx=clamp(e.vx,-.8,.8);e.vy=clamp(e.vy,-.55,.55);e.x=clamp(e.x+e.vx,60,260);e.y+=e.vy;
   e.y=clamp(e.y,20,H-40);
   if(e.cool<=0&&dist<260){const a=Math.atan2(dy,dx);const n=e.hp<e.max*.4?5:3;
    for(let q=0;q<n;q++){const aa=a+(q-(n-1)/2)*.18;projectiles.push({x:e.x,y:e.y,vx:Math.cos(aa)*1.8,vy:Math.sin(aa)*1.8,life:200,type:'espit',dmg:e.dmg,color:'#d978e8',owner:'enemy',grav:0})}
    e.cool=e.hp<e.max*.4?50:75;SFX.play('cast',3)}
   if(frame%400===0&&enemies.length<24){spawnEnemy('bat',e.x+rng()*20-10,e.y+10,5)}
   if(dist<15&&e.atkCd<=0){hurtPlayer(e.dmg,'boss');e.atkCd=50}
  }
 }
}
// ---------- pickups / chests / wands on ground ----------
function updatePickups(){
 for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];
  p.vy=Math.min(2.4,(p.vy||0)+.07);p.x+=p.vx||0;p.y+=p.vy;
  if(SOLID.has(get(p.x|0,p.y|0))){p.vy*=-.2;p.vx*=.8;p.y-=.4}
  p.vx*=.98;
  const d=Math.hypot(p.x-player.x,p.y-player.y);
  const magnet=player.perk.gold?30:18;
  if(p.type==='gold'&&d<magnet){p.x+=(player.x-p.x)/d*1.2;p.y+=(player.y-p.y)/d*1.2}
  if(d<9){
   if(p.type==='gold'){runGold+=p.val;SFX.play('gold');floatTexts.push({x:player.x,y:player.y-12,txt:'+'+p.val,life:30,max:30,color:'#f2c85b'})}
   else if(p.type==='spell'){inv[p.spell]=(inv[p.spell]||0)+1;toast('获得法术：'+spellName(p.spell));SFX.play('pickup')}
   else if(p.type==='heart'){player.maxHp+=10;player.hp=Math.min(player.maxHp,player.hp+25);toast('生命上限 +10 并恢复');SFX.play('heal')}
   else if(p.type==='heal'){player.hp=Math.min(player.maxHp,player.hp+30);toast('饮下血瓶 +30 HP');SFX.play('heal')}
   pickups.splice(i,1);continue}
  if(p.y>H-4)pickups.splice(i,1);
 }
 // chests auto-open on touch
 for(const c of chests){if(c.opened)continue;if(Math.hypot(c.x-player.x,c.y-player.y)<11){c.opened=true;
  burst(c.x,c.y-3,14,['#f2c85b','#fff'],2);SFX.play('pickup');
  const n=rint(2,3);for(let k=0;k<n;k++){const s=randomSpellForTier(Math.min(5,tierAt(c.y)));pickups.push({type:'spell',x:c.x+rng()*8-4,y:c.y-4,vx:(rng()-.5),vy:-1.5,spell:s})}
  runGold+=rint(15,40);
  if(rng()<.3)pickups.push({type:'heal',x:c.x,y:c.y-6,vx:0,vy:-1});
  if(rng()<.25)groundWands.push({x:c.x,y:c.y-8,w:genWand(Math.min(5,tierAt(c.y))),bob:0});
  toast('开启了宝箱!');}}
 // ground wand bob
 for(const g of groundWands)g.bob+=.05;
}
// ---------- player ----------
function updatePlayer(){
 const L=keys.a||keys.ArrowLeft,R=keys.d||keys.ArrowRight,J=keys.w||keys.ArrowUp||keys[' '];
 const acc=player.perk.flight?0.19:0.15;
 if(L){player.vx-=acc;player.face=-1}
 if(R){player.vx+=acc;player.face=1}
 player.vx*=.84;player.vx=clamp(player.vx,-1.7,1.7);
 player.onGround=solidAtRect(player.x,player.y+player.h/2+1,player.w,2);
 if(J&&player.onGround){player.vy=-3.2;player.onGround=false;SFX.play('ui')}
 if(J&&!player.onGround&&player.hover>0){player.vy=Math.min(player.vy+.16-.22,.9);player.hover-=.8;
  if(rng()<.3)particles.push({x:player.x,y:player.y+6,vx:(rng()-.5),vy:.5,life:12,max:12,color:'#9ad5ff',size:1,grav:0})}
 else{player.vy+=.16;player.hover=Math.min(player.maxHover,player.hover+(player.perk.flight?.5:.24))}
 player.vy=clamp(player.vy,-4,3.4);
 moveBody(player,player.vx,0,player.w,player.h);
 const fell=!moveBody(player,0,player.vy,player.w,player.h);
 if(player.inv>0)player.inv--;
 if(player.wet>0)player.wet--;
 // environment sampling
 const cx=player.x|0,cy=player.y|0,cell=get(cx,cy),feet=get(cx,(player.y+4)|0);
 const liquid=LIQ.has(cell)?cell:(LIQ.has(feet)?feet:0);
 // oxygen
 if(liquid&&liquid!==MAT.LAVA&&!player.perk.breath){player.oxygen-=1.4;if(player.oxygen<=0){player.oxygen=0;hurtPlayer(0.55,'drown');if(frame%30===0)burst(player.x,player.y-4,2,['#9ad5ff'],1)}}
 else player.oxygen=Math.min(oxygenMax,player.oxygen+4);
 if(cell===MAT.FIRE||feet===MAT.FIRE){player.burn=Math.min(240,player.burn+6)}
 if(cell===MAT.LAVA||feet===MAT.LAVA){hurtPlayer(3.2,'lava');player.burn=200}
 else if(cell===MAT.ACID||feet===MAT.ACID){hurtPlayer(1.8,'acid');if(frame%20===0)SFX.play('acid')}
 else if(cell===MAT.TOXIC||feet===MAT.TOXIC){player.poison=Math.min(300,player.poison+4)}
 if(get(cx,cy-5)===MAT.TOXICGAS||cell===MAT.TOXICGAS)player.poison=Math.min(300,player.poison+2);
 if(cell===MAT.HEAL||feet===MAT.HEAL){if(player.hp<player.maxHp&&frame%20===0){player.hp=Math.min(player.maxHp,player.hp+1);burst(player.x,player.y-4,1,['#6effaa'],.6)}player.poison=Math.max(0,player.poison-2)}
 if((cell===MAT.WATER||feet===MAT.WATER)&&player.burn>0){player.burn=0;player.wet=120;burst(player.x,player.y,6,['#c5dae1'],1.5);SFX.play('splash')}
 if(player.burn>0&&player.wet<=0){player.burn--;const dps=player.maxHp*.02/60;player.hp-=dps;lastCause='burn';
  if(rng()<.4)particles.push({x:player.x+rng()*6-3,y:player.y-4,vx:0,vy:-.8,life:12,max:12,color:'#ff9a45',size:1,grav:-.02});
  if(player.hp<=0){die('burn');return}}
 if(player.poison>0){player.poison--;if(frame%30===0){player.hp-=player.maxHp*.008;lastCause='poison';burst(player.x,player.y-2,2,['#9bba45'],.8);if(player.hp<=0){die('poison');return}}}
 // crush: solid overlapping center after world shifts
 if(SOLID.has(cell)){ // try push out, else crush
  let freed=false;for(const o of [[0,-2],[0,2],[-2,0],[2,0],[0,-4]]){if(!SOLID.has(get(cx+o[0],cy+o[1]))){player.x+=o[0];player.y+=o[1];freed=true;break}}
  if(!freed){hurtPlayer(0.8,'crush')}
 }
 // wands mana
 for(const w of wands){w.mana=Math.min(w.manaMax,w.mana+w.regen/60);if(w.castT>0)w.castT--;if(w.rechT>0){w.rechT--;if(w.rechT<=0&&w.shuffle)shuffleOrder(w)}}
 if(muzzle>0)muzzle--;
 if(pointer.down)tryCast();
 runTime=Date.now()-runStart;
}
// ---------- camera / HUD ----------
function updateCamera(){
 const target=clamp(player.y-VH*.55,0,H-VH);
 camY+=(target-camY)*.12;camX=0;
 runDepth=Math.max(runDepth||0,Math.floor(player.y));
}
let runDepth=0;
function updateHud(){
 const hp=clamp(player.hp/player.maxHp,0,1);
 $('hpFill').style.width=(hp*100)+'%';
 const w=wands[currentWand];
 $('manaFill').style.width=w?clamp(w.mana/w.manaMax,0,1)*100+'%':'0%';
 $('flyFill').style.width=clamp(player.hover/player.maxHover,0,1)*100+'%';
 $('hpText').textContent=`${Math.ceil(Math.max(0,player.hp))}/${player.maxHp}`;
 $('manaText').textContent=w?Math.floor(w.mana)+'':'0';
 const inLiq=LIQ.has(get(player.x|0,player.y|0));
 $('breathTag').style.display=inLiq&&!player.perk.breath?'':'none';
 $('breathMeter').style.display=inLiq&&!player.perk.breath?'':'none';
 if(inLiq)$('breathFill').style.width=clamp(player.oxygen/oxygenMax,0,1)*100+'%';
 $('depth').textContent=`${Math.floor(runDepth)}m`;
 $('gold').textContent=`${runGold} 金`;
 $('kills').textContent=`${runKills} 杀`;
 const bi=biomeIdAt(player.y);
 $('biome').textContent=biomeNameAt(player.y);
 // buffs
 let bh='';
 if(player.burn>0)bh+='<span class="buff burn">着火!</span>';
 if(player.poison>0)bh+='<span class="buff poison">中毒</span>';
 if(player.wet>0)bh+='<span class="buff wet">湿润</span>';
 if(player.oxygen<oxygenMax*.5&&inLiq)bh+='<span class="buff oxy">窒息!</span>';
 if(w&&w.rechT>0)bh+='<span class="buff">充能…</span>';
 $('buffs').innerHTML=bh;
 // wand chips
 let html='';wands.forEach((wn,i)=>{html+=`<div class="wand-chip ${i===currentWand?'active':''}" data-w="${i}"><b>${i+1}·${wn.name}</b><div class="manabar"><i style="width:${clamp(wn.mana/wn.manaMax,0,1)*100}%"></i></div><div class="slotdots">${wn.slots.map(s=>{const k=spellKind(s);return `<s class="${k==='mod'?'mod':k==='trigger'||k==='multi'?'trig':'on'}" title="${spellName(s)}">${spellName(s)[0]}</s>`}).join('')}</div></div>`});
 $('wandHud').innerHTML=html;
 // boss bar
 if(bossRef&&!bossRef.dead&&player.y>H-260){$('bossbar').classList.remove('hide');$('bossFill').style.width=clamp(bossRef.hp/bossRef.max,0,1)*100+'%'}
 else $('bossbar').classList.add('hide');
 // prompt
 const g=nearestGroundWand();const c=chests.find(c=>!c.opened&&Math.hypot(c.x-player.x,c.y-player.y)<20);
 let pr='';if(g)pr='[E] 拾取魔杖：'+g.w.name;else if(c)pr='靠近开启宝箱';else if(inHoly(player.y)&&!editOpen)pr='[E] 改杖 · 选择祝福';
 const pe=$('prompt');if(pr){pe.style.display='block';pe.textContent=pr}else pe.style.display='none';
}
function inHoly(y){return zoneAt(y).t==='holy'}
function nearestGroundWand(){let best=null,bd=18;for(const g of groundWands){const d=Math.hypot(g.x-player.x,g.y-player.y);if(d<bd){bd=d;best=g}}return best}
// ---------- perks ----------
function offerPerks(hid){
 const keys0=Object.keys(PERKS).filter(k=>!player.perk[k]);
 while(keys0.length<3)keys0.push(...Object.keys(PERKS));
 const opts=[];while(opts.length<3){const k=pick(keys0);if(!opts.includes(k))opts.push(k)}
 perkChoices=opts;renderPerks();
}
function renderPerks(){
 $('perkPanel').innerHTML=`<div class="panel-title"><b>圣所 · 选择一项祝福（三选一）</b><span>点击卡片或按 1/2/3</span></div><div class="perk-grid">${perkChoices.map((k,i)=>`<button class="perk" data-perk="${i}"><b>${i+1}. ${PERKS[k].name}</b><small>${PERKS[k].desc}</small></button>`).join('')}</div>`;
 $('perkPanel').classList.remove('hide');
}
function choosePerk(i){
 const k=perkChoices[i];if(!k)return;
 player.perk[k]=true;
 if(k==='power'){player.maxHp=Math.max(25,Math.floor(player.maxHp/2));player.hp=Math.min(player.hp,player.maxHp)}
 if(k==='flight'){player.maxHover+=40;player.hover=player.maxHover}
 toast('获得祝福：'+PERKS[k].name);SFX.play('perk');
 perkChoices=[];$('perkPanel').classList.add('hide');
}
// ---------- wand panel (drag + click) ----------
function canEdit(){return player&&(player.perk.tinker||inHoly(player.y))}
function renderWands(){
 const lock=!canEdit();
 $('wandPanel').innerHTML=`<div class="panel-title"><b>魔杖编辑台 ${lock?'· 仅圣所可改（或点出“魔杖工匠”）':''}</b><span>拖拽 / 先点法术再点槽位 · 右键卸下 · E 关闭</span><span><button id="closeWand">关闭(E)</button></span></div>
 <div class="wand-grid">${wands.map((w,wi)=>`<div class="wand-card ${wi===currentWand?'active':''}" data-wcard="${wi}">
  <h3>${wi+1}. ${w.name}<span class="wbtns"><button data-act="sel" data-w="${wi}">手持</button><button data-act="drop" data-w="${wi}">丢弃</button></span></h3>
  <div class="stats"><span>施法/轮 ${w.spellsPerCast}</span><span>${w.shuffle?'洗牌':'顺序'}</span><span>延迟 ${w.castDelay}f</span><span>充能 ${w.recharge}f</span><span>魔力 ${Math.floor(w.mana)}/${w.manaMax}</span><span>回复 ${w.regen}/s</span><span>容量 ${w.slots.length}/${w.cap}</span><span>散布 ${w.spread.toFixed(0)}°</span></div>
  <div class="spell-row" data-row="${wi}">${w.slots.map((s,si)=>{const d=SPELLS[s];const cls=d?(d.type==='mod'?'mod':d.type==='proj'?'proj':d.type==='util'?'util':'trig'):'';return `<button class="spell-btn ${cls} ${selected&&selected.from==='wand'&&selected.wi===wi&&selected.si===si?'selected':''}" draggable="${!lock}" data-w="${wi}" data-s="${si}" title="${d?d.name+' · '+d.desc+' · '+d.cost+'蓝':s}">${d?d.name:s}</button>`}).join('')||'<small style="color:#666">空槽 — 把下面法术拖进来</small>'}</div>
 </div>`).join('')}</div>
 <div class="inv-title">法术背包（点击选中，再点槽位装入；点击已装法术可卸下）</div>
 <div class="inv-grid" id="invGrid">${Object.keys(inv).filter(k=>inv[k]>0).map(k=>{const d=SPELLS[k];const cls=d?(d.type==='mod'?'mod':d.type==='proj'?'proj':d.type==='util'?'util':'trig'):'';return `<button class="spell-btn ${cls} ${selected&&selected.from==='inv'&&selected.id===k?'selected':''}" draggable="${!lock}" data-inv="${k}" title="${d?d.name+' · '+d.desc+' · '+d.cost+'蓝':k} ×${inv[k]}">${d?d.name:k} ×${inv[k]}</button>`}).join('')||'<small style="color:#666">空 — 击杀、宝箱与拾取可获得法术</small>'}</div>
 <div class="inv-title">图鉴：<small style="color:#8e95a8">弹体决定投射物，修饰改变本轮，${'双重/三重/散射'}增加抽牌，触发/定时把后几张打包成命中后释放。把「触发+炎爆弹+追踪+火舌」按顺序放进同一根杖试试。</small></div>`;
 $('wandPanel').classList.remove('hide');
}
function wandSlotAction(wi,si){
 if(!canEdit()){toast('离开圣所无法改杖');return}
 const w=wands[wi];
 if(!selected){if(w.slots[si]){selected={from:'wand',wi,si};renderWands()}return}
 if(selected.from==='wand'){
  if(selected.wi===wi&&selected.si===si){selected=null;renderWands();return}
  const a=wands[selected.wi],b=w;
  const t=a.slots[selected.si];a.slots[selected.si]=b.slots[si];b.slots[si]=t;
  // remove undefined holes
  a.slots=a.slots.filter(x=>x!==undefined);b.slots=b.slots.filter(x=>x!==undefined);
  wands[selected.wi]=a;wands[wi]=b;a._order=null;b._order=null;a.pos=0;b.pos=0;selected=null;SFX.play('ui');renderWands();return}
 if(selected.from==='inv'){
  if(w.slots.length>=w.cap){toast('容量不足');return}
  inv[selected.id]--;if(inv[selected.id]<=0)delete inv[selected.id];
  w.slots.splice(Math.min(si+1,w.slots.length),0,selected.id);
  w._order=null;w.pos=0;selected=null;SFX.play('ui');renderWands();updateHud();return}
}
function invAction(id){
 if(!canEdit()){toast('离开圣所无法改杖');return}
 if(!selected){selected={from:'inv',id};renderWands();return}
 if(selected.from==='inv'&&selected.id===id){selected=null;renderWands();return}
 if(selected.from==='wand'){const w=wands[selected.wi];const s=w.slots.splice(selected.si,1)[0];if(s){inv[s]=(inv[s]||0)+1}w._order=null;w.pos=0;selected=null;SFX.play('ui');renderWands();updateHud()}
}
// ---------- render ----------
const img=ctx.createImageData(VW,VH);
const lightC=document.createElement('canvas');lightC.width=VW;lightC.height=VH;const lctx=lightC.getContext('2d');
function render(){
 if(!world||!player){ctx.fillStyle='#07080e';ctx.fillRect(0,0,VW,VH);return}
 lights=[];
 const yBase=Math.floor(camY);
 // terrain pixels
 const d=img.data;let p=0;
 const shx=Math.round((Math.random()-.5)*shake),shy=Math.round((Math.random()-.5)*shake);
 for(let sy=0;sy<VH;sy++){const wy=yBase+sy;const bi=zoneAt(clamp(wy,0,H-1));const bg=bi.t==='surf'&&wy<40?[38,40,70]:bi.t==='holy'?[30,26,44]:(BIOMES[bi.t==='b'?bi.id:0].bg);
  for(let sx=0;sx<VW;sx++){const wx=sx;const m=inside(wx,wy)?world.cells[idx(wx,wy)]:MAT.BRICK;
   let r,g,b;
   if(m===MAT.AIR){const h=hash2(wx,wy);r=bg[0]*(0.9+h*.2);g=bg[1]*(0.9+h*.2);b=bg[2]*(0.9+h*.25);
    if(h>.97){r+=6;g+=6;b+=8}}
   else{const c=BASE_COL[m];const h=hash2(wx*2+13,wy*2+7);const h2=hash2(wx>>2,wy>>2);
    let k=.8+h*.4;if(h2>.86)k+=.18;else if(h2<.12)k-=.22;
    if(LIQ.has(m)&&get(wx,wy-1)===MAT.AIR)k+=.25; // surface highlight
    if(m===MAT.FIRE)k+=.25*Math.sin(frame*.4+wx)*.5+.25;
    if(m===MAT.LAVA)k+=.15*Math.sin(frame*.3+wx*.5)*.5+.15;
    r=c[0]*k;g=c[1]*k;b=c[2]*k;
    if(m===MAT.GOLD&&(h2>.7)){r=255;g=220;b=120}
    if(m===MAT.CRYSTAL){r+=20*Math.sin(frame*.2);g+=20;b+=10}}
   d[p++]=clamp(r,0,255);d[p++]=clamp(g,0,255);d[p++]=clamp(b,0,255);d[p++]=255;}}
 ctx.putImageData(img,shx,shy);
 // torches flames
 for(const t of torches){const sy=t.y-camY;if(sy<-10||sy>VH+10)continue;
  ctx.fillStyle=t.crystal?'#7ad8ff':'#f4a23b';ctx.fillRect(t.x-1+shx,sy-3+shy,3,2);
  if(!t.crystal&&frame%6===0&&rng()<.4)particles.push({x:t.x,y:t.y-4,vx:0,vy:-.4,life:16,max:16,color:'#ff9a45',size:1,grav:-.01});}
 // chests
 for(const c of chests){const sy=c.y-camY;if(sy<-10||sy>VH+10)continue;
  ctx.fillStyle=c.opened?'#4a3b28':'#8a6a3a';ctx.fillRect(c.x-4+shx,sy-3+shy,8,5);
  ctx.fillStyle=c.opened?'#2a2118':'#f2c85b';ctx.fillRect(c.x-4+shx,sy-3+shy,8,1);}
 // pickups
 for(const q of pickups){const sy=q.y-camY;if(sy<-8||sy>VH+8)continue;
  if(q.type==='gold'){ctx.fillStyle='#e2b94c';ctx.fillRect(q.x-1+shx,sy-1+shy,3,2);ctx.fillStyle='#fff2b8';ctx.fillRect(q.x-1+shx,sy-1+shy,1,1)}
  else if(q.type==='spell'){ctx.fillStyle='#ad8aff';ctx.fillRect(q.x-2+shx,sy-2+shy,4,4);ctx.fillStyle='#fff';ctx.fillRect(q.x-1+shx,sy-1+shy,2,1)}
  else if(q.type==='heart'){ctx.fillStyle='#d95760';ctx.fillRect(q.x-2+shx,sy-2+shy,5,4);ctx.fillStyle='#fff';ctx.fillRect(q.x-1+shx,sy-1+shy,2,1)}
  else{ctx.fillStyle='#e86a72';ctx.fillRect(q.x-2+shx,sy-4+shy,4,6);ctx.fillStyle='#fff';ctx.fillRect(q.x-1+shx,sy-2+shy,2,2)}}
 // ground wands + sparkle
 for(const gw of groundWands){const sy=gw.y-camY+Math.sin(gw.bob)*1.5;if(sy<-8||sy>VH+8)continue;
  ctx.fillStyle='#c9a24a';ctx.fillRect(gw.x-5+shx,sy+shy,10,2);ctx.fillStyle='#f4e2a0';ctx.fillRect(gw.x-2+shx,sy-1+shy,4,1);
  if(frame%10<4){ctx.fillStyle='#fff2b8';ctx.fillRect(gw.x+3+shx,sy-3+shy,1,1)}}
 // projectiles
 for(const pr of projectiles){const sy=pr.y-camY;if(sy<-8||sy>VH+8)continue;
  const col=pr.color||(SPELLS[pr.type]?({spark:'#ffe780',arrow:'#82d5ff',firebolt:'#ff9345',bomb:'#f4d15f',drill:'#e9f4ff',bubble:'#d3a7ff',lightning:'#b9e7ff',waterjet:'#6fc4ff',acidorb:'#78d25a',espit:'#ee7094'}[pr.type]||'#fff'):'#fff');
  ctx.fillStyle=col;const s=pr.type==='bomb'?3:2;ctx.fillRect(pr.x-s/2+shx,sy-s/2+shy,s,s);
  if(pr.fire){ctx.fillStyle='#ffbc4c';ctx.fillRect(pr.x-2+shx,sy+shy,1,1)}}
 // enemies
 for(const e of enemies){if(e.dead)continue;const sy=e.y-camY;if(sy<-14||sy>VH+14)continue;
  ctx.save();ctx.translate(Math.round(e.x+shx),Math.round(sy+shy));
  const fl=e.flash>0;
  if(e.type==='boss'){ctx.fillStyle=fl?'#fff':'#8a2a9a';ctx.beginPath();ctx.arc(0,0,10,0,7);ctx.fill();
   ctx.fillStyle='#fff29c';ctx.fillRect(-4,-4,8,8);ctx.fillStyle='#2a0a2a';ctx.fillRect(-2,-2,4,4);
   ctx.fillStyle='#d978e8';for(let k=0;k<6;k++){const a=frame*.03+k;ctx.fillRect(Math.cos(a)*12-1,Math.sin(a)*12-1,2,2)}}
  else if(e.type==='spitter'){ctx.fillStyle=fl?'#fff':'#c45762';ctx.fillRect(-4,-4,8,8);ctx.fillStyle='#f2d56f';ctx.fillRect(e.dir>0?2:-5,-1,3,2)}
  else if(e.type==='bat'){ctx.fillStyle=fl?'#fff':'#c8698d';const w2=Math.sin(frame*.5+e.phase)*2;ctx.fillRect(-4,-2,8,4);ctx.fillRect(-7,-1+w2,3,2);ctx.fillRect(4,-1-w2,3,2)}
  else if(e.type==='crawler'){ctx.fillStyle=fl?'#fff':'#b7c6b8';ctx.fillRect(-3,-5,6,10);ctx.fillStyle='#222433';ctx.fillRect(-2,-3,4,2);ctx.fillStyle=fl?'#fff':'#8a9a8a';ctx.fillRect(-4,3,3,2);ctx.fillRect(1,3,3,2)}
  else if(e.type==='bloomer'){const urg=e.fuse>=0&&(frame%6<3);ctx.fillStyle=fl?'#fff':urg?'#fff':'#7aba45';ctx.beginPath();ctx.arc(0,0,5,0,7);ctx.fill();ctx.fillStyle='#2a4a2a';ctx.fillRect(-2,-2,4,4)}
  else if(e.type==='burrower'){ctx.fillStyle=fl?'#fff':'#a67a4a';ctx.fillRect(-6,-3,12,6);ctx.fillStyle='#5a3a2a';for(let sgm=-6;sgm<6;sgm+=3)ctx.fillRect(sgm,-3,1,6)}
  else if(e.type==='brute'){ctx.fillStyle=fl?'#fff':'#6f747f';ctx.fillRect(-5,-7,10,14);ctx.fillStyle='#3a3d47';ctx.fillRect(-5,-7,10,3);ctx.fillStyle='#ff6a5a';ctx.fillRect(-2,-2,4,2)}
  ctx.restore();
  if(e.hp<e.max){ctx.fillStyle='#151522';ctx.fillRect(e.x-7+shx,sy-11+shy,14,2);ctx.fillStyle='#df6871';ctx.fillRect(e.x-7+shx,sy-11+shy,14*clamp(e.hp/e.max,0,1),2)}}
 // player
 if(!player.dead){const sy=player.y-camY;ctx.save();ctx.translate(Math.round(player.x+shx),Math.round(sy+shy));
  if(player.inv%4<2)ctx.globalAlpha=.5;
  ctx.fillStyle='#e3b9da';ctx.fillRect(-2,-7,4,4); // head
  ctx.fillStyle=player.burn>0?'#ff8149':'#5564a4';ctx.fillRect(-3,-3,6,8); // robe
  ctx.fillStyle='#252945';ctx.fillRect(-4,5,3,3);ctx.fillRect(1,5,3,3);
  ctx.fillStyle='#f4d48b';ctx.fillRect(player.face>0?3:-5,-1,2,2); // wand hand
  if(player.burn>0){ctx.fillStyle='#ff9a45';ctx.fillRect(-3,-9,6,2)}
  ctx.restore();ctx.globalAlpha=1;}
 // particles
 for(const pt of particles){if(pt.kind==='flash')continue;const sy=pt.y-camY;if(sy<-6||sy>VH+6)continue;
  ctx.globalAlpha=clamp(pt.life/pt.max,0,1);ctx.fillStyle=pt.color;ctx.fillRect(pt.x|0+shx,sy|0+shy,pt.size||1,pt.size||1);ctx.globalAlpha=1;}
 for(const pt of particles){if(pt.kind!=='flash')continue;const sy=pt.y-camY;ctx.globalAlpha=clamp(pt.life/pt.max,0,1)*.8;
  ctx.strokeStyle='#ffc45e';ctx.beginPath();ctx.arc(pt.x+shx,sy+shy,pt.rad*(1-pt.life/pt.max+.2),0,7);ctx.stroke();ctx.globalAlpha=1;}
 // float texts
 ctx.font='6px monospace';ctx.fillStyle='#fff';for(const f of floatTexts){const sy=f.y-camY;ctx.globalAlpha=clamp(f.life/f.max,0,1);ctx.fillText(f.txt,f.x+shx,sy+shy);ctx.globalAlpha=1}
 // ---- lighting ----
 buildLights();
 const bi2=zoneAt(clamp(player.y|0,0,H-1));
 let dark=.66;
 if(player.y<44)dark=.04;
 else if(bi2.t==='holy')dark=.34;
 else if(bi2.t==='b'){dark=.60+bi2.id*.035}
 if(player.y>H-260)dark=Math.min(dark,.55);
 lctx.globalCompositeOperation='source-over';lctx.clearRect(0,0,VW,VH);
 lctx.fillStyle=`rgba(2,2,12,${dark})`;lctx.fillRect(0,0,VW,VH);
 lctx.globalCompositeOperation='destination-out';
 for(const L of lights){if(L.y<-L.r||L.y>VH+L.r)continue;
  const g=lctx.createRadialGradient(L.x,L.y,0,L.x,L.y,L.r);g.addColorStop(0,`rgba(0,0,0,${L.i})`);g.addColorStop(1,'rgba(0,0,0,0)');
  lctx.fillStyle=g;lctx.beginPath();lctx.arc(L.x,L.y,L.r,0,7);lctx.fill();}
 ctx.drawImage(lightC,shx,shy);
 // warm glow pass
 ctx.globalCompositeOperation='lighter';
 for(const L of lights){if(!L.hot)continue;if(L.y<-L.r||L.y>VH+L.r)continue;
  const g=ctx.createRadialGradient(L.x+shx,L.y+shy,0,L.x+shx,L.y+shy,L.r*.7);
  g.addColorStop(0,L.hot+'22');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(L.x+shx,L.y+shy,L.r*.7,0,7);ctx.fill();}
 ctx.globalCompositeOperation='source-over';
 if(shake>0)shake*=.88;
}
function buildLights(){
 lights.push({x:player.x,y:player.y-camY,r:muzzle>0?80:58,i:.8,hot:'#8ab4ff'});
 for(const t of torches){const sy=t.y-camY;if(sy<-80||sy>VH+80)continue;const fl=1+Math.sin(frame*.15+t.flick)*.12;
  lights.push({x:t.x,y:sy,r:(t.crystal?40:66)*fl,i:t.crystal?.7:.88,hot:t.crystal?null:'#ff9a45'});}
 // hot cells clusters (downsample)
 let hot=0;
 for(let sy=0;sy<VH&&hot<22;sy+=8){const wy=(camY|0)+sy;for(let sx=0;sx<VW&&hot<22;sx+=8){
  const m=inside(sx,wy)?world.cells[idx(sx,wy)]:0;
  if(m===MAT.LAVA||m===MAT.FIRE){lights.push({x:sx,y:sy,r:m===MAT.LAVA?44:34,i:.9,hot:m===MAT.LAVA?'#ff6a2a':'#ff9a45'});hot++}}}
 for(const pr of projectiles){if(!pr.glow&&pr.type!=='firebolt'&&pr.type!=='lightning'&&pr.type!=='bomb')continue;
  const sy=pr.y-camY;lights.push({x:pr.x,y:sy,r:pr.type==='bomb'?44:28,i:.8,hot:pr.fire||pr.type==='firebolt'?'#ff9a45':null});}
 if(player.burn>0)lights.push({x:player.x,y:player.y-camY,r:50,i:.85,hot:'#ff9a45'});
}
// ---------- particles update ----------
function updateParticles(){
 for(let i=particles.length-1;i>=0;i--){const pt=particles[i];if(pt.kind==='flash'){pt.life--;if(pt.life<=0)particles.splice(i,1);continue}
  pt.x+=pt.vx;pt.y+=pt.vy;pt.vy+=pt.grav||0;pt.vx*=.98;pt.life--;if(pt.life<=0)particles.splice(i,1)}
 for(let i=floatTexts.length-1;i>=0;i--){const f=floatTexts[i];f.y-=.4;f.life--;if(f.life<=0)floatTexts.splice(i,1)}
}
// ---------- main update ----------
function update(){
 if(gameState!=='play')return;
 if(editOpen||perkChoices.length)return; // paused in menus
 frame++;updatePlayer();if(gameState!=='play')return;
 updateMaterials();updateProjectiles();updateEnemies();updatePickups();updateParticles();updateCamera();
 const hz=world.holyRooms.findIndex(r=>player.y>=r.y0&&player.y<r.y1);
 if(hz>=0&&!holyClaimed.has(hz)){holyClaimed.add(hz);offerPerks(hz);SFX.play('perk')}
 if(bossRef&&!bossRef.dead&&player.y>H-260&&frame%60===0)toast('深渊之眼正在注视你');
 if(frame%10===0)updateHud();
}
// ---------- loop ----------
let lastT=0;
function loop(t){requestAnimationFrame(loop);update();render();
 const el=$('toast');}
// ---------- input ----------
window.addEventListener('keydown',e=>{
 keys[e.key]=true;
 if(['ArrowLeft','ArrowRight','ArrowUp',' ','a','d','w'].includes(e.key))e.preventDefault();
 if(e.key==='e'||e.key==='E'){onInteract()}
 if(e.key==='m'||e.key==='M'){SFX.muted=!SFX.muted;$('muteBtn').textContent=SFX.muted?'✕':'♪'}
 if(perkChoices.length&&['1','2','3'].includes(e.key))choosePerk(+e.key-1);
 if(editOpen&&['1','2','3','4'].includes(e.key)){currentWand=+e.key-1;renderWands();updateHud()}
 else if(!editOpen&&['1','2','3','4'].includes(e.key)){const n=+e.key-1;if(wands[n]){currentWand=n;SFX.play('ui');updateHud()}}
});
window.addEventListener('keyup',e=>keys[e.key]=false);
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer.x=clamp((e.clientX-r.left)/r.width*VW,0,VW);pointer.y=clamp((e.clientY-r.top)/r.height*VH,0,VH);pointer.active=true;pointer.lastAim=performance.now()});
canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect();pointer.x=clamp((e.clientX-r.left)/r.width*VW,0,VW);pointer.y=clamp((e.clientY-r.top)/r.height*VH,0,VH);pointer.active=true;pointer.lastAim=performance.now();if(gameState==='play'&&!editOpen&&!perkChoices.length){pointer.down=true;try{SFX.ensure()}catch(_){} }});
window.addEventListener('pointerup',()=>pointer.down=false);
canvas.addEventListener('pointerleave',()=>{if(!matchMedia('(pointer:coarse)').matches)pointer.down=false});
function onInteract(){
 if(gameState!=='play')return;
 if(perkChoices.length)return;
 const g=nearestGroundWand();
 if(g){ // pick up / swap
  if(wands.length<4){wands.push(g.w);currentWand=wands.length-1;groundWands.splice(groundWands.indexOf(g),1);toast('拾取魔杖：'+g.w.name);SFX.play('pickup')}
  else{const cur=wands[currentWand];wands[currentWand]=g.w;g.w=cur;g.bob=0;toast('换下魔杖：'+cur.name);SFX.play('pickup')}
  updateHud();return}
 if(editOpen){editOpen=false;$('wandPanel').classList.add('hide');return}
 if(canEdit()){editOpen=true;selected=null;renderWands();SFX.play('ui')}
 else toast('只有站在发光圣所内才能改杖');
}
// HUD events
document.addEventListener('click',e=>{
 const chip=e.target.closest('.wand-chip');if(chip){currentWand=+chip.dataset.w;SFX.play('ui');updateHud();return}
 const pk=e.target.closest('[data-perk]');if(pk){choosePerk(+pk.dataset.perk);return}
 const wb=e.target.closest('.wand-card button');if(wb&&editOpen){
  const act=wb.dataset.act,wi=+wb.dataset.w;
  if(act==='sel'){currentWand=wi;renderWands();updateHud()}
  if(act==='drop'){if(wands.length<=1){toast('至少保留一根魔杖');return}const[w0]=wands.splice(wi,1);groundWands.push({x:player.x+rng()*10-5,y:player.y-6,w:w0,bob:0});currentWand=clamp(currentWand,0,wands.length-1);renderWands();updateHud()}
  return}
 if(e.target.id==='closeWand'){editOpen=false;$('wandPanel').classList.add('hide');return}
 const sb=e.target.closest('.spell-btn');if(sb&&editOpen){
  if(sb.dataset.w!==undefined)wandSlotAction(+sb.dataset.w,+sb.dataset.s);
  else if(sb.dataset.inv)invAction(sb.dataset.inv);return}
});
// drag & drop for wand editing
document.addEventListener('dragstart',e=>{const b=e.target.closest&&e.target.closest('.spell-btn');if(!b)return;
 if(b.dataset.w!==undefined)e.dataTransfer.setData('text',JSON.stringify({from:'wand',wi:+b.dataset.w,si:+b.dataset.s}));
 else if(b.dataset.inv)e.dataTransfer.setData('text',JSON.stringify({from:'inv',id:b.dataset.inv}))});
document.addEventListener('dragover',e=>{if(editOpen&&e.target.closest&&e.target.closest('.spell-btn,.spell-row,#invGrid'))e.preventDefault()});
document.addEventListener('drop',e=>{if(!editOpen)return;const t=e.target.closest&&(e.target.closest('.spell-btn')||e.target.closest('.spell-row')||e.target.closest('#invGrid'));if(!t)return;e.preventDefault();
 let d;try{d=JSON.parse(e.dataTransfer.getData('text'))}catch(_){return}
 if(d.from==='inv')selected={from:'inv',id:d.id};else selected={from:'wand',wi:d.wi,si:d.si};
 if(t.dataset&&t.dataset.w!==undefined)wandSlotAction(+t.dataset.w,+(t.dataset.s||wands[+t.dataset.w].slots.length-1));
 else if(t.dataset&&t.dataset.inv)invAction(t.dataset.inv);
 else if(t.id==='invGrid'&&selected.from==='wand'){if(!canEdit())return;const w=wands[selected.wi];const s=w.slots.splice(selected.si,1)[0];if(s)inv[s]=(inv[s]||0)+1;selected=null;renderWands()}
 else if(t.dataset&&t.dataset.row!==undefined){const wi=+t.dataset.row;const w=wands[wi];if(selected.from==='inv'){if(w.slots.length>=w.cap){toast('容量不足');return}inv[selected.id]--;if(inv[selected.id]<=0)delete inv[selected.id];w.slots.push(selected.id);selected=null;renderWands()}}});
// touch
function bindHold(id,key){const b=$(id);const on=e=>{e.preventDefault();keys[key]=true};const off=e=>{e.preventDefault();keys[key]=false};
 b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointerleave',()=>keys[key]=false);b.addEventListener('pointercancel',()=>keys[key]=false)}
bindHold('leftBtn','a');bindHold('rightBtn','d');bindHold('jumpBtn','w');
$('fireBtn').addEventListener('pointerdown',e=>{e.preventDefault();pointer.down=true;try{SFX.ensure()}catch(_){}});
$('fireBtn').addEventListener('pointerup',e=>{e.preventDefault();pointer.down=false});
$('wandBtn').addEventListener('click',()=>{currentWand=(currentWand+1)%wands.length;SFX.play('ui');updateHud()});
$('editBtn').addEventListener('click',onInteract);
$('muteBtn').addEventListener('click',()=>{SFX.muted=!SFX.muted;$('muteBtn').textContent=SFX.muted?'✕':'♪'});
$('startBtn').addEventListener('click',()=>startGame());
$('restartBtn').addEventListener('click',()=>startGame());
$('winBtn').addEventListener('click',()=>startGame());
$('helpBtn').addEventListener('click',()=>$('helpText').classList.toggle('hide'));
// ---------- start ----------
function startGame(fixedSeed){
 seed=fixedSeed!=null?fixedSeed:(Date.now()^Math.floor(Math.random()*1e9));
 rng=makeRng(seed);wands=baseWands();inv={homing:1,firemod:1,trigger:1,drill:1};currentWand=0;
 runDepth=0;editOpen=false;selected=null;perkChoices=[];holyClaimed=new Set();shake=0;frame=0;lastCause='';
 $('title').classList.add('hide');$('dead').classList.add('hide');$('win').classList.add('hide');
 $('wandPanel').classList.add('hide');$('perkPanel').classList.add('hide');
 genWorld();camY=clamp(player.y-VH*.55,0,H-VH);gameState='play';
 // starter torch light near spawn
 torches.push({x:150,y:50,flick:5});torches.push({x:170,y:50,flick:6});
 updateHud();toast(`种子 ${seed>>>0} · 向下深入，前方有光也有危险`);SFX.play('perk');
}
// autotest harness (?autotest=1): synchronous logic checks, writes #testResults
function runAutoTest(){
 const R={move:false,jump:false,cast:false,trigger:false,density:false,lavastone:false,light:false,livefire:false,kill:false,death:false,cause:''};
 try{
  startGame(12345);
  // settle player onto ground
  let guard=0;while(!solidAtRect(player.x,player.y+player.h/2+1,player.w,2)&&guard++<60)player.y++;
  player.vx=0;player.vy=0;
  const x0=player.x;
  keys.d=true;for(let i=0;i<50;i++)updatePlayer();keys.d=false;
  R.move=player.x>x0+2;
  // force grounded jump check
  guard=0;while(!solidAtRect(player.x,player.y+player.h/2+1,player.w,2)&&guard++<40)player.y++;
  player.vx=0;player.vy=0;player.hover=player.maxHover;
  const yBefore=player.y;keys.w=true;updatePlayer();keys.w=false;
  R.jump=player.vy<-0.5||player.y<yBefore-0.5;
  // clear room to cast so the bolt cannot instantly hit a wall
  for(let q=-14;q<=14;q++)for(let k=-14;k<=10;k++)if(get((player.x+q)|0,(player.y+k)|0)!==MAT.BRICK)setm((player.x+q)|0,(player.y+k)|0,MAT.AIR);
  wands[0].mana=wands[0].manaMax;wands[0].castT=0;wands[0].rechT=0;
  const nProj=projectiles.length;pointer.active=false;player.face=1;tryCast();
  for(let i=0;i<5;i++)updateProjectiles();
  R.cast=projectiles.length>nProj;
  // trigger eval
  const tw={slots:['trigger','spark','arrow'],spellsPerCast:1,pos:0,castDelay:5,recharge:20,manaMax:100,mana:100,regen:10,shuffle:false,spread:0,speed:1,cap:4};
  const ev=evaluateWand(tw);R.trigger=ev.shots.length>0&&ev.shots.some(s=>s.payload&&s.payload.length>0);
  // density: heavy must end below light (oil above water -> swap)
  for(let x=96;x<=104;x++)for(let y=96;y<=106;y++)if(get(x,y)===MAT.AIR||LIQ.has(get(x,y)))setm(x,y,MAT.AIR);
  for(let x=96;x<=104;x++)setm(x,106,MAT.STONE);
  setm(100,100,MAT.OIL);setm(100,101,MAT.WATER);
  for(let i=0;i<8;i++)updateMaterials();
  {let ok=true,lastD=-1;for(let y=99;y<=105;y++){const m=get(100,y);if(LIQ.has(m)){const dd=DENSITY[m]||10;if(dd<lastD)ok=false;lastD=dd}}
   R.density=ok&&get(100,105)===MAT.WATER||get(100,104)===MAT.WATER||get(100,105)===MAT.OIL||get(100,104)===MAT.OIL;R.density=ok;}
  // lava + water -> stone (side contact on a stone floor so nothing falls away)
  for(let x=116;x<=124;x++)for(let y=116;y<=122;y++)setm(x,y,MAT.AIR);
  for(let x=116;x<=124;x++)setm(x,122,MAT.STONE);
  setm(120,121,MAT.LAVA);setm(121,121,MAT.WATER);
  for(let i=0;i<12;i++)updateMaterials();
  let found=false;for(let q=-2;q<=2;q++)for(let k=-2;k<=2;k++)if(get(120+q,121+k)===MAT.STONE)found=true;
  R.lavastone=found;
  buildLights();R.light=lights.length>3;
  // live fire: real projectile must damage & kill a real enemy
  for(let q=-30;q<=30;q++)for(let k=-16;k<=12;k++)if(get((player.x+q)|0,(player.y+k)|0)!==MAT.BRICK)setm((player.x+q)|0,(player.y+k)|0,MAT.AIR);
  projectiles.length=0;
  const foe=spawnEnemy('crawler',player.x+26,player.y,0);foe.vx=0;foe.vy=0;foe.hp=Math.min(foe.hp,24);
  wands[0].slots=['arrow'];wands[0]._order=null;wands[0].pos=0;wands[0].mana=wands[0].manaMax;player.face=1;pointer.active=false;
  let steps=0;while(!foe.dead&&steps++<400){wands[0].castT=0;wands[0].rechT=0;tryCast();updateProjectiles();}
  R.livefire=foe.dead;
  const e0=spawnEnemy('crawler',player.x+20,player.y-6,0);const k0=runKills;damageEnemy(e0,99999,'shot');R.kill=e0.dead&&runKills===k0+1;
  player.inv=0;player.hp=30;hurtPlayer(99999,'burn');R.death=gameState==='dead';R.cause=$('deadReason').textContent;
 }catch(err){R.error=String(err&&err.stack||err)}
 R.ok=R.move&&R.jump&&R.cast&&R.trigger&&R.density&&R.lavastone&&R.light&&R.livefire&&R.kill&&R.death;
 const el=$('testResults');el.style.display='block';el.textContent='AUTOTEST '+JSON.stringify(R);
 document.title='AUTOTEST '+(R.ok?'PASS':'FAIL');
 try{console.log('AUTOTEST '+JSON.stringify(R))}catch(_){}
 return R;
}
// expose for debugging / external drivers
window.GAME={get player(){return player},get enemies(){return enemies},get wands(){return wands},startGame,tryCast,evaluateWand,hurtPlayer,spawnEnemy,get,setm,MAT};
// boot
const DEMO={chaos:false};
(function(){
 const q=new URLSearchParams(location.search);
 if(q.has('autotest')){startGame(12345);runAutoTest();render()}
 else if(q.has('play')){startGame(q.get('seed')?+q.get('seed'):987654);
  if(q.has('chaos')){DEMO.chaos=true; // auto-play driver for screenshots: run right, aim right-down, hold fire
   setInterval(()=>{if(gameState!=='play'||player.dead)return;keys.d=true;pointer.active=true;pointer.x=player.x+60;pointer.y=player.y-camY+30;pointer.lastAim=performance.now();pointer.down=true;},100);}
  if(q.has('wanded')){const r=world.holyRooms[0];player.x=160;player.y=r.y0+20;camY=clamp(player.y-VH*.55,0,H-VH);editOpen=true;selected=null;renderWands();updateHud();}
  render()}
 requestAnimationFrame(loop);
})();
