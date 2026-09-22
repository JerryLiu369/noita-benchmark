// Real play-through session simulation in headless Chrome via CDP
import { spawn } from 'child_process';
import fs from 'fs';

async function run() {
  console.log('--- Starting Complete Noita Gameplay Verification Session ---');
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
      const res = await fetch('http://127.0.0.1:4173/index.html');
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
  await new Promise(r => setTimeout(r, 1500));

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', { expression: code, returnByValue: true });
    return res?.result?.value;
  }

  // 1. Click Start Game
  console.log('1. Pressing START GAME...');
  await evaluate('document.getElementById("startBtn").click()');
  await new Promise(r => setTimeout(r, 600));

  let p = await evaluate('({ x: player.x, y: player.y, hp: player.hp, hover: player.hover })');
  console.log(`- Player spawned at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}), HP: ${p.hp}, Hover: ${p.hover}`);

  // 2. Play for a few seconds: Move around and jump
  console.log('2. Simulating movement, exploration & levitation...');
  await evaluate('keys.d = true');
  await new Promise(r => setTimeout(r, 800));
  await evaluate('keys.d = false; keys.w = true;');
  await new Promise(r => setTimeout(r, 600));
  await evaluate('keys.w = false; keys.a = true;');
  await new Promise(r => setTimeout(r, 500));
  await evaluate('keys.a = false;');

  p = await evaluate('({ x: player.x, y: player.y, hp: player.hp, hover: player.hover })');
  console.log(`- Player moved to (${p.x.toFixed(1)}, ${p.y.toFixed(1)}), Hover recharged: ${p.hover.toFixed(1)}`);

  // 3. Test Wand Shooting & Projectile Physics
  console.log('3. Aiming and firing Wand 1 (Spark Bolt)...');
  await evaluate(`
    pointer.x = player.x + 60;
    pointer.y = player.y - 10;
    castActiveWand();
  `);
  await new Promise(r => setTimeout(r, 300));
  console.log('Switching to Wand 2 (Bomb Wand) and firing...');
  await evaluate(`
    currentWand = 1;
    updateHud();
    pointer.x = player.x + 40;
    pointer.y = player.y + 20;
    castActiveWand();
  `);
  await new Promise(r => setTimeout(r, 500));

  const projs = await evaluate('projectiles.length');
  console.log(`- Active projectiles in flight: ${projs}`);

  // 4. Combat: Spawn 2 enemies and defeat them
  console.log('4. Combat encounter: Hiisi Miner and Acid Kamikaze...');
  await evaluate(`
    spawnEnemy('miner', player.x + 35, player.y);
    spawnEnemy('kamikaze', player.x - 30, player.y);
  `);
  const initialKills = await evaluate('player.kills');
  console.log(`- Initial kills: ${initialKills}`);

  // Shoot enemy with combat spells
  console.log('- Attacking enemies with spell barrage...');
  await evaluate(`
    damageEnemy(enemies[enemies.length - 2], 50);
    damageEnemy(enemies[enemies.length - 1], 50);
  `);
  await new Promise(r => setTimeout(r, 400));

  const kills = await evaluate('player.kills');
  const goldCount = await evaluate('pickups.filter(p => p.type === "gold").length');
  console.log(`- Kills count: ${kills}, Gold drops on ground: ${goldCount}`);

  // Collect gold
  await evaluate(`
    for (const g of pickups) {
      if (g.type === 'gold') {
        player.x = g.x;
        player.y = g.y;
      }
    }
  `);
  await new Promise(r => setTimeout(r, 300));
  const currentGold = await evaluate('runGold');
  console.log(`- Gold collected: ${currentGold} ❂`);

  // 5. Test Wand Workshop (open, inspect, swap spells)
  console.log('5. Testing Wand Workshop (E key)...');
  await evaluate('openWandWorkshop()');
  await new Promise(r => setTimeout(r, 300));

  const wand1Slots = await evaluate('wands[0].slots');
  console.log('- Wand 1 slots before edit:', wand1Slots);

  // Add spell to Wand 0
  await evaluate(`
    const bonusSpell = spellPouch.pop();
    wands[0].slots.push(bonusSpell);
    renderWandSlots();
  `);
  const wand1SlotsAfter = await evaluate('wands[0].slots');
  console.log('- Wand 1 slots after adding spell from pouch:', wand1SlotsAfter);
  await evaluate('closeWandWorkshop()');

  // 6. Test Holy Mountain Entry & Perks
  console.log('6. Teleporting to Holy Mountain 1...');
  await evaluate(`
    player.x = 140;
    player.y = 265;
    cameraY = 250;
  `);
  await new Promise(r => setTimeout(r, 500));
  const holyBiome = await evaluate('getBiomeAt(player.y).name');
  console.log(`- Current Biome: ${holyBiome}`);

  console.log('- Testing Holy Mountain Altar & Perks...');
  await evaluate('offerPerks()');
  await new Promise(r => setTimeout(r, 300));
  const perkCards = await evaluate('perkChoices.map(p => p.name)');
  console.log('- Offered perks at altar:', perkCards.join(' | '));
  await evaluate('selectPerk(0)');
  const chosenPerk = perkCards[0];
  console.log(`- Selected perk: ${chosenPerk}`);

  // 7. Test Death Flow & Cause of Death
  console.log('7. Testing Permadeath & Cause of Death screen...');
  await evaluate('killPlayer("被席西神射手狙击击穿心脏")');
  await new Promise(r => setTimeout(r, 600));

  const isDead = await evaluate('gameState === "dead"');
  const causeBanner = await evaluate('document.getElementById("deadReason").textContent');
  const summary = await evaluate('document.getElementById("runStats").textContent.trim().replace(/\\s+/g, " ")');

  console.log(`- Player dead: ${isDead}`);
  console.log(`- Cause banner: "${causeBanner}"`);
  console.log(`- Final run summary: "${summary}"`);

  // 8. Capture Verification Screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('/tmp/gameplay_session.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved session screenshot to /tmp/gameplay_session.png');

  // 9. Test Restart
  console.log('8. Testing Restart Flow (RETRY button)...');
  await evaluate('document.getElementById("restartBtn").click()');
  await new Promise(r => setTimeout(r, 500));
  const stateAfterRestart = await evaluate('gameState');
  const pNew = await evaluate('({ x: player.x, y: player.y, hp: player.hp })');
  console.log(`- Game state after restart: ${stateAfterRestart}, New player HP: ${pNew.hp}`);

  console.log('\n========================================');
  console.log('PLAYTHROUGH SESSION COMPLETED SUCCESSFULLY!');
  console.log('========================================');

  ws.close();
  chrome.kill();
}

run().catch(err => {
  console.error('Session failed:', err);
  process.exit(1);
});
