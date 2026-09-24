// Long real-input session: title screen -> autopilot plays with CDP keyboard/mouse only (no teleports, no spawns).
// Page hooks are used only to READ state (player, enemies, cells, tunnel route) for the bot's decisions.
const SEED = process.env.SEED || '31337';
const DUR = +(process.env.DUR || 240);
const U = `http://127.0.0.1:4273/index.html?seed=${SEED}`;
export default async function (t) {
  const E = (s) => t.ev(s);
  const log = [];
  const L = (...a) => { const s = a.join(' '); log.push(s); console.log(s); };
  await t.goto(U); await t.sleep(1500);
  L('title shown', await E(`document.getElementById('title').classList.contains('show')`), 'state', await E('EMBER.state'));
  await t.shot('/tmp/eb/play_title.png');
  const btn = JSON.parse(await E(`JSON.stringify((r=>[r.left+r.width/2,r.top+r.height/2])(document.querySelector('[data-act=start]').getBoundingClientRect()))`));
  await t.mouse('mouseMoved', btn[0], btn[1]); await t.mouse('mousePressed', btn[0], btn[1]); await t.sleep(60); await t.mouse('mouseReleased', btn[0], btn[1]);
  await t.sleep(400);
  L('after click: state', await E('EMBER.state'), 'audio', await E('EMBER.audio'));
  // helpers in page (read-only)
  await E(`(()=>{
    window.__los=(x0,y0,x1,y1)=>{const n=Math.ceil(Math.hypot(x1-x0,y1-y0));for(let k=3;k<n;k++){const m=EMBER.mat(x0+(x1-x0)*k/n,y0+(y1-y0)*k/n);if(m>0&&m<26)return false}return true};
    window.__mkRoute=()=>{const R=[];EMBER.descent.forEach(pts=>{for(let p=0;p<pts.length-1;p++){const[ax,ay]=pts[p],[bx,by]=pts[p+1];const st=Math.ceil(Math.hypot(bx-ax,by-ay)/5);for(let s=0;s<=st;s++){const f=s/st;R.push([ax+(bx-ax)*f+Math.sin(f*Math.PI*3+p)*10*Math.sin(f*Math.PI),ay+(by-ay)*f])}}});window.__route=R;window.__ri=0;return R.length};
    window.__snap=()=>{const p=EMBER.player,R=window.__route;let best=window.__ri;for(let k=window.__ri;k<Math.min(R.length,window.__ri+60);k++){if(Math.hypot(R[k][0]-p.x,R[k][1]-(p.y-6))<16)best=k}window.__ri=best;
      const tg=R[Math.min(best+4,R.length-1)];const px=p.x,py=p.y-7;
      const es=EMBER.enemies.filter(e=>!e.dead&&e.active&&Math.abs(e.x-px)<170&&Math.abs(e.y-py)<110).map(e=>({x:e.x,y:e.def.burrow?e.y:e.y-e.h/2,t:e.type})).filter(o=>__los(px,py,o.x,o.y)).sort((a,b)=>Math.hypot(a.x-px,a.y-py)-Math.hypot(b.x-px,b.y-py));
      const c=EMBER.cam,r=document.getElementById('game').getBoundingClientRect(),s=r.width/424;
      const scr=(wx,wy)=>[r.left+(wx-c.x)*s,r.top+(wy-c.y)*s];
      return JSON.stringify({st:EMBER.state,x:p.x,y:p.y,hp:p.hp,hpMax:p.hpMax||p.maxHp||100,pot:p.potions,ri:best,rn:R.length,tx:tg[0],ty:tg[1],en:es.length?{t:es[0].t,s:scr(es[0].x,es[0].y)}:null,tgs:scr(tg[0],tg[1]),kills:EMBER.stats.kills,depth:document.getElementById('depthTxt').textContent,fps:EMBER.fps})};
    return __mkRoute()})()`);
  const held = new Set();
  const hold = async (code, on) => { if (on && !held.has(code)) { held.add(code); await t.down(code); } else if (!on && held.has(code)) { held.delete(code); await t.up(code); } };
  let mouseOn = false, mx = 640, my = 360;
  const aim = async (x, y, fire) => { mx = x; my = y; await t.mouse('mouseMoved', x, y); if (fire && !mouseOn) { await t.mouse('mousePressed', x, y); mouseOn = true; } else if (!fire && mouseOn) { await t.mouse('mouseReleased', x, y); mouseOn = false; } };
  const t0 = Date.now();
  let deaths = [], totalKills = 0, runKills = 0, lastRi = 0, lastProg = Date.now(), lastPot = 0, lastLog = 0, digUntil = 0, wiggle = 1, maxDepthTxt = '', maxY = 0, firstDeathShot = false, shots = 0;
  while ((Date.now() - t0) / 1000 < DUR) {
    await t.sleep(90);
    const s = JSON.parse(await E('__snap()'));
    if (s.st === 'dead') {
      for (const c of [...held]) await hold(c, false); await aim(mx, my, false);
      await t.sleep(1200);
      const dc = JSON.parse(await E('JSON.stringify(window.__deathCause)'));
      const txt = (await E('EMBER.deathText()')).replace(/\s+/g, ' ');
      totalKills += s.kills; runKills = 0;
      deaths.push({ at: ((Date.now() - t0) / 1000).toFixed(0) + 's', title: dc.title, desc: dc.desc, depth: s.depth });
      L(`[${((Date.now() - t0) / 1000).toFixed(0)}s] DEATH`, dc.title, '|', txt.slice(0, 80));
      if (!firstDeathShot) { await t.shot('/tmp/eb/play_death.png'); firstDeathShot = true; }
      await t.tap('KeyR'); await t.sleep(1500);
      L('  restarted: state', await E('EMBER.state'), 'hp', await E('EMBER.player.hp'), 'kills', await E('EMBER.stats.kills'), 'route', await E('__mkRoute()'));
      lastRi = 0; lastProg = Date.now(); maxY = 0;
      continue;
    }
    if (s.st !== 'play') { await t.sleep(200); continue; }
    runKills = s.kills;
    if (s.y > maxY) { maxY = s.y; maxDepthTxt = s.depth; }
    if (s.ri > lastRi) { lastRi = s.ri; lastProg = Date.now(); }
    const stuckMs = Date.now() - lastProg;
    // potion
    if (s.hp < s.hpMax * 0.35 && s.pot > 0 && Date.now() - lastPot > 3000) { await t.tap('KeyQ'); lastPot = Date.now(); L(`[${((Date.now() - t0) / 1000).toFixed(0)}s] drink potion hp`, s.hp.toFixed(0)); }
    // movement along the tunnel route
    let dx = s.tx - s.x;
    if (stuckMs > 2500) dx = wiggle * 20;
    if (stuckMs > 2500 && Date.now() % 2000 < 100) wiggle = -wiggle;
    await hold('KeyD', dx > 3); await hold('KeyA', dx < -3);
    await hold('Space', s.ty < s.y - 10 || (stuckMs > 1500 && (Date.now() % 900) < 450));
    // dig when stuck for a while: switch to the blasting wand and fire toward the route target
    if (stuckMs > 5000 && Date.now() > digUntil) { digUntil = Date.now() + 1400; await t.tap('Digit2'); L(`[${((Date.now() - t0) / 1000).toFixed(0)}s] stuck ${(stuckMs / 1000).toFixed(1)}s at`, s.x.toFixed(0), s.y.toFixed(0), '-> dig'); }
    if (Date.now() < digUntil) { await aim(s.tgs[0], s.tgs[1], true); continue; }
    if (digUntil && Date.now() >= digUntil) { digUntil = 0; await aim(mx, my, false); await t.tap('Digit1'); lastProg = Date.now() - 1500; }
    // combat
    if (s.en) await aim(s.en.s[0], s.en.s[1], true); else await aim(s.tgs[0], s.tgs[1] - 20, false);
    if (Date.now() - lastLog > 15000) {
      lastLog = Date.now();
      L(`[${((Date.now() - t0) / 1000).toFixed(0)}s] pos ${s.x.toFixed(0)},${s.y.toFixed(0)} | ${s.depth} | hp ${s.hp.toFixed(0)} | kills(run) ${s.kills} | route ${s.ri}/${s.rn} | fps ${s.fps.toFixed(0)}`);
      if (shots < 6) { await t.shot(`/tmp/eb/play_${shots}.png`); shots++; }
    }
  }
  for (const c of [...held]) await hold(c, false); await aim(mx, my, false);
  const fin = JSON.parse(await E('__snap()'));
  totalKills += fin.st === 'dead' ? 0 : fin.kills;
  const real = (Date.now() - t0) / 1000;
  L('==== SUMMARY');
  L('real seconds played', real.toFixed(0), '| total kills', totalKills, '| deaths', deaths.length, '| current run depth', fin.depth, '| deepest this run', maxDepthTxt);
  deaths.forEach((d, k) => L(`  death ${k + 1} @${d.at}: ${d.title} — ${d.desc} (${d.depth})`));
  L('page errors', await E('JSON.stringify(window.__errs)'));
  (await import('node:fs')).writeFileSync('/tmp/eb/play_log.txt', log.join('\n') + '\n');
}
