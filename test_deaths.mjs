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
  await new Promise(r => setTimeout(r, 1200));

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', { expression: code, returnByValue: true });
    return res?.result?.value;
  }

  const deathCauses = [
    '被烈火焚为灰烬',
    '在深水中溺亡',
    '被崩塌落石压死',
    '被强酸腐蚀融化',
    '剧毒腐蚀身亡',
    '被自己的法术爆炸炸飞',
    '被席西神射手击杀',
    '被深渊巨蠕虫碾压'
  ];

  console.log('Testing diverse death causes and respawn flow:');
  for (const cause of deathCauses) {
    await evaluate('startGame()');
    await evaluate(`killPlayer("${cause}")`);
    const reason = await evaluate('document.getElementById("deadReason").textContent');
    const isVisible = await evaluate('!document.getElementById("dead").classList.contains("hide")');
    console.log(`- Cause: "${reason}" (Modal Visible: ${isVisible})`);
    if (!reason.includes(cause) || !isVisible) {
      throw new Error(`Death cause mismatch for ${cause}`);
    }
    // Test restart button
    await evaluate('document.getElementById("restartBtn").click()');
    const stateAfterRestart = await evaluate('gameState');
    if (stateAfterRestart !== 'play') {
      throw new Error('Restart button failed to reset gameState to play');
    }
  }

  console.log('\nAll 8 Death Causes and Respawn Flow verified successfully!');
  ws.close();
  chrome.kill();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
