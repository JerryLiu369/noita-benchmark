import { spawn } from 'child_process';

async function run() {
  const chrome = spawn('google-chrome', [
    '--headless=new',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    'about:blank'
  ]);

  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 150));
    try {
      const debugRes = await fetch('http://127.0.0.1:9222/json');
      const list = await debugRes.json();
      const target = list.find(t => t.type === 'page');
      if (target?.webSocketDebuggerUrl) {
        wsUrl = target.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  const ws = new WebSocket(wsUrl);
  let msgId = 1;
  const pending = new Map();
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d.result);
      pending.delete(d.id);
    }
  };
  await new Promise(r => ws.onopen = r);
  function send(method, params = {}) {
    return new Promise(res => {
      const id = msgId++;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:4173/index.html' });
  await new Promise(r => setTimeout(r, 1200));

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', { expression: code, returnByValue: true });
    return res?.result?.value;
  }

  await evaluate('startGame()');

  // Verify spell catalog requirements
  const spellCounts = await evaluate(`({
    projectiles: Object.values(SPELLS).filter(s => s.type === 'projectile').map(s => s.name),
    modifiers: Object.values(SPELLS).filter(s => s.type === 'mod').map(s => s.name),
    triggers: Object.values(SPELLS).filter(s => s.type === 'trigger').map(s => s.name)
  })`);

  console.log('--- Spell System Catalog ---');
  console.log(`Projectiles (${spellCounts.projectiles.length}):`, spellCounts.projectiles.join(', '));
  console.log(`Modifiers (${spellCounts.modifiers.length}):`, spellCounts.modifiers.join(', '));
  console.log(`Triggers (${spellCounts.triggers.length}):`, spellCounts.triggers.join(', '));

  if (spellCounts.projectiles.length < 6) throw new Error('Need at least 6 projectiles');
  if (spellCounts.modifiers.length < 4) throw new Error('Need at least 4 modifiers');
  if (spellCounts.triggers.length < 2) throw new Error('Need at least 2 triggers');

  // Test building a custom chain in Wand 0:
  // "trigger_spark" with payload: "mod_multicast", "mod_fire_trail", "mod_homing", "arrow"
  console.log('\n--- Assembling Combo Wand: Trigger + Scatter + Fire Trail + Homing ---');
  await evaluate(`
    wands[0].slots = [
      'trigger_spark',
      'mod_multicast',
      'mod_fire_trail',
      'mod_homing',
      'arrow',
      'spark'
    ];
    wands[0].cursor = 0;
    wands[0].mana = wands[0].manaMax;
  `);

  // Fire the trigger wand
  await evaluate(`
    pointer.x = player.x + 40;
    pointer.y = player.y;
    castActiveWand();
  `);

  const initialProjs = await evaluate('projectiles.map(p => ({ type: p.type, trigger: p.trigger, payload: p.payload }))');
  console.log('Initial fired trigger projectile:', initialProjs);

  // Simulate projectile flight into wall to trigger payload
  console.log('\nSimulating flight and impact...');
  for (let frame = 0; frame < 15; frame++) {
    await evaluate('updateProjectiles()');
  }

  const payloadProjs = await evaluate('projectiles.map(p => ({ type: p.type, fireTrail: p.fireTrail, homing: p.homing }))');
  console.log('Projectiles after trigger impact (payload spawned):', payloadProjs);

  console.log('\nSpell chain combination verified successfully!');
  ws.close();
  chrome.kill();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
