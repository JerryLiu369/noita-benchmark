// Full playtest with real keyboard / mouse input (CDP Input.*). Page hooks only read state or set up scenes.
const U = 'http://127.0.0.1:4273/index.html?test=1&seed=12345';
export default async function (t) {
  const E = (s) => t.ev(s);
  const P = async () => JSON.parse(await E('JSON.stringify({x:EMBER.player.x,y:EMBER.player.y,hp:EMBER.player.hp,onG:EMBER.player.onGround})'));
  const toScreen = async (wx, wy) => JSON.parse(await E(`(()=>{const c=EMBER.cam,r=document.getElementById('game').getBoundingClientRect(),s=r.width/424;return JSON.stringify([r.left+(${wx}-c.x)*s, r.top+(${wy}-c.y)*s])})()`));
  await t.goto(U); await t.sleep(1200);
  await E(`window.__los=(x0,y0,x1,y1)=>{const n=Math.ceil(Math.hypot(x1-x0,y1-y0));for(let k=2;k<n;k++){const m=EMBER.mat(x0+(x1-x0)*k/n,y0+(y1-y0)*k/n);if(m>0&&m<26)return false}return true}; 1`);
  const log = [];
  const L = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };
  const t0 = Date.now();
  const p0 = await P(); L('spawn', p0.x.toFixed(0), p0.y.toFixed(0), 'hp', p0.hp);
  // 1. walk / jump / cast
  await t.down('KeyD'); await t.sleep(600); await t.up('KeyD'); await t.sleep(250);
  const p1 = await P(); L('walk right dx', (p1.x - p0.x).toFixed(1));
  await t.down('KeyA'); await t.sleep(600); await t.up('KeyA'); await t.sleep(250);
  const p2 = await P(); L('walk left dx', (p2.x - p1.x).toFixed(1));
  await E(`(window.__jy=[], window.__jt=setInterval(()=>window.__jy.push(EMBER.player.y),16), 1)`);
  await t.tap('Space', 40); await t.sleep(800);
  const ys = await E('(clearInterval(window.__jt), window.__jy)'); const pj = await P();
  L('jump height', (pj.y - Math.min(...ys)).toFixed(1), 'landed', pj.onG);
  let [sx, sy] = await toScreen(pj.x + 70, pj.y - 25);
  await t.mouse('mouseMoved', sx, sy); await t.mouse('mousePressed', sx, sy); await t.sleep(350); await t.mouse('mouseReleased', sx, sy);
  L('cast', await E('JSON.stringify(EMBER.lastCast.cards)'), 'projectiles alive', await E('EMBER.projs.filter(p=>!p.dead).length'));
  await t.sleep(150); await t.shot('/tmp/eb/final_cast.png');
  L('lighting ambient', await E('JSON.stringify(EMBER.ambient())'));
  // 2. fight: two enemies spawned in the open camp, killed by real mouse aiming
  await E('EMBER.spawn("tusker", 55, -2); EMBER.spawn("bat", -45, -25); 1');
  const k0 = await E('EMBER.stats.kills');
  for (let k = 0; k < 80; k++) {
    const tg = await E(`(()=>{const p=EMBER.player,px=p.x,py=p.y-7;const es=EMBER.enemies.filter(e=>!e.dead&&e.active&&Math.abs(e.x-px)<200&&Math.abs(e.y-py)<120).map(e=>({e,x:e.x,y:e.def.burrow?e.y:e.y-e.h/2})).filter(o=>__los(px,py,o.x,o.y)).sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py));return es.length?JSON.stringify([es[0].x,es[0].y,es[0].e.type]):null})()`);
    if (!tg) { await t.mouse('mouseReleased', sx, sy); await t.sleep(150); if (await E('EMBER.stats.kills') >= k0 + 2) break; continue; }
    const [ex, ey] = JSON.parse(tg); [sx, sy] = await toScreen(ex, ey);
    await t.mouse('mouseMoved', sx, sy); await t.mouse('mousePressed', sx, sy); await t.sleep(120);
    if (await E('EMBER.stats.kills') >= k0 + 2) break;
  }
  await t.mouse('mouseReleased', sx, sy);
  L('kills after fight', await E('EMBER.stats.kills'), 'hp', (await P()).hp.toFixed(0));
  await t.shot('/tmp/eb/final_fight.png');
  // 3. edit the wand at the camp altar via drag & drop, then cast the chain
  await t.tap('Tab'); await t.sleep(250);
  const pos = async (sel) => JSON.parse(await E(`(()=>{const r=document.querySelector('${sel}').getBoundingClientRect();return JSON.stringify([r.x+r.width/2,r.y+r.height/2])})()`));
  const drag = async (a, b) => { const [x0, y0] = await pos(a), [x1, y1] = await pos(b); await t.mouse('mouseMoved', x0, y0); await t.mouse('mousePressed', x0, y0); for (let k = 1; k <= 6; k++) { await t.mouse('mouseMoved', x0 + (x1 - x0) * k / 6, y0 + (y1 - y0) * k / 6); await t.sleep(16); } await t.mouse('mouseReleased', x1, y1); await t.sleep(60); };
  const Wd = (i) => `#edWands .eslot[data-wi="0"][data-si="${i}"]`, Bg = (i) => `#edBag .eslot[data-si="${i}"]`;
  L('editor open', await E('EMBER.state'), 'editable', await E('EMBER.canEdit()'));
  await drag(Bg(0), Wd(0)); await drag(Bg(1), Wd(1)); await drag(Bg(2), Wd(2)); await drag(Bg(0), Wd(3)); await drag(Bg(1), Wd(4)); await drag(Bg(2), Wd(5));
  await t.shot('/tmp/eb/final_editor.png');
  L('wand after drag', await E('JSON.stringify(EMBER.player.wands[0].slots.map(s=>s&&s.id))'));
  await t.tap('Tab'); await t.sleep(200);
  await E('EMBER.spawn("bat", 70, -35); EMBER.spawn("bat", 95, -20); EMBER.spawn("bat", 40, -45); 1'); await t.sleep(150);
  const pc = await P(); [sx, sy] = await toScreen(pc.x + 60, pc.y - 35);
  const k1 = await E('EMBER.stats.kills');
  await t.mouse('mouseMoved', sx, sy); await t.mouse('mousePressed', sx, sy); await t.sleep(40); await t.mouse('mouseReleased', sx, sy);
  await t.sleep(20);
  L('chain cast', await E('JSON.stringify(EMBER.lastCast)'), await E('JSON.stringify(EMBER.projs.filter(p=>!p.dead&&p.owner==="player").map(p=>[p.s.id,p.fire?"fire":"",p.homing?"homing":""]))'));
  await t.sleep(200); await t.shot('/tmp/eb/final_chain.png');
  await t.sleep(1800);
  L('kills from one chain cast', (await E('EMBER.stats.kills')) - k1, 'total kills', await E('EMBER.stats.kills'));
  // 4. descend: drop into the lava layer and walk into a lava pool with the keyboard
  const spot = await E(`(()=>{const reg=EMBER.regions.find(r=>r.kind==='biome'&&r.name==='熔心炉底'); const S=(x,y)=>EMBER.mat(x,y);
    for(let y=reg.y0+40;y<reg.y1-20;y++)for(let x=30;x<EMBER.W-60;x++){ if(S(x,y)!==30||S(x,y-1)!==0) continue; let pool=true; for(let k=0;k<8;k++) if(S(x+k,y)!==30||S(x+k,y+3)!==30) pool=false; if(!pool) continue;
      for(let dx=8;dx<40;dx++) for(let fy=y-4;fy<=y+1;fy++){ const fx=x-dx; if(S(fx,fy)===0||S(fx,fy)>=26) continue;
        let ok=true; for(let yy=fy-13;yy<fy&&ok;yy++) for(let xx=fx-3;xx<=fx+3;xx++) if(S(xx,yy)!==0){ok=false;break;}
        for(let xx=fx;xx<x&&ok;xx++) for(let yy=fy-12;yy<fy-4;yy++) if(S(xx,yy)!==0&&S(xx,yy)<26){ok=false;break;}
        if(ok) return JSON.stringify([fx,fy,x+4,y]); } } return null})()`);
  L('lava edge spot', spot);
  if (spot) {
    const [lx, ly] = JSON.parse(spot);
    await E(`EMBER.teleport(${lx}, ${ly}); 1`); await t.sleep(900);
    await t.shot('/tmp/eb/final_lavalayer.png');
    L('region', await E(`document.getElementById('depthTxt').textContent`));
    await t.down('KeyD');
    let st = ''; for (let k = 0; k < 150; k++) { await t.sleep(200); st = await E('EMBER.state'); if (st === 'dead') break; if (k % 10 === 9) { await t.down('Space'); await t.sleep(120); await t.up('Space'); } if (k === 40) { L('still alive after 8s of walking (crust on the pool) -> dropping into the pool centre'); await E(`EMBER.teleport(${spot ? JSON.parse(spot)[2] : 0}, ${spot ? JSON.parse(spot)[3] - 1 : 0}); 1`); } }
    await t.up('KeyD');
    L('state', st, 'cause', await E('JSON.stringify(window.__deathCause)'));
  }
  await t.sleep(500); await t.shot('/tmp/eb/final_dead.png');
  L('death screen', JSON.stringify((await E('EMBER.deathText()')).replace(/\s+/g, ' ')));
  L('played (real seconds)', ((Date.now() - t0) / 1000).toFixed(1), 'game time', (await E('EMBER.stats.time')).toFixed(1), 'kills', await E('EMBER.stats.kills'), 'fps', (await E('EMBER.fps')).toFixed(1));
  await t.tap('KeyR'); await t.sleep(1200);
  L('after R', await E('JSON.stringify({state:EMBER.state, hp:EMBER.player.hp, seed:EMBER.seed, kills:EMBER.stats.kills})'));
  L('page errors', await E('JSON.stringify(window.__errs)'));
}
