"""Optional developer regression suite; not a runtime/build dependency.
Run a static server on 4173, then: python tests/browser_smoke.py
Requires Python Playwright and a Chromium installation. Set CHROME_BINARY if needed.
All mutation fixtures are behind ?test=1 and are reported separately from real-input tests.
"""
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright

URL = os.environ.get("GAME_URL", "http://127.0.0.1:4173")
OUT = Path("test-results")
OUT.mkdir(exist_ok=True)
checks = []

def check(name, condition, detail=None):
    checks.append({"name": name, "pass": bool(condition), "detail": detail})
    print(("PASS " if condition else "FAIL ") + name, detail if detail is not None else "")
    assert condition, name

async def main():
    async with async_playwright() as p:
        opts = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
        if os.environ.get("CHROME_BINARY"):
            opts["executable_path"] = os.environ["CHROME_BINARY"]
        browser = await p.chromium.launch(**opts)
        page = await browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda err: errors.append(str(err)))
        await page.goto(URL + "/?test=1")
        await page.click("#startBtn")
        await page.wait_for_timeout(150)
        before = await page.evaluate("__ember.snapshot()")
        await page.keyboard.down("d")
        await page.wait_for_timeout(350)
        await page.keyboard.up("d")
        after = await page.evaluate("__ember.snapshot()")
        check("spawn: keyboard movement", after["player"]["x"] > before["player"]["x"] + 20)
        await page.keyboard.down("Space")
        await page.wait_for_timeout(350)
        await page.keyboard.up("Space")
        jumped = await page.evaluate("__ember.snapshot()")
        check("spawn: jump / levitation", jumped["player"]["y"] < after["player"]["y"] - 20)
        check("levitation has finite fuel", jumped["player"]["lev"] < 100)
        await page.keyboard.press("Escape")
        paused = await page.evaluate("__ember.snapshot().tick")
        await page.wait_for_timeout(250)
        check("pause freezes simulation", paused == await page.evaluate("__ember.snapshot().tick"))
        await page.click("#resumeBtn")
        await page.evaluate("__ember.start(72849103)")
        await page.keyboard.press("Escape")

        # Isolated, sealed material chamber; no editor, player, enemies or rendering shortcuts.
        density = await page.evaluate("""() => {
            const t=__ember,M=t.M; t.rect(690,40,35,45,M.ROCK); t.rect(695,45,25,35,M.AIR);
            t.rect(695,55,25,8,M.BLOOD); t.rect(695,63,25,8,M.WATER); t.rect(695,71,25,8,M.OIL);
            for(let i=0;i<180;i++)t.updateMaterials({x0:691,x1:723,y0:41,y1:83});
            let r={}; for(let m of [M.OIL,M.WATER,M.BLOOD]) {let sum=0,n=0;
              for(let y=40;y<85;y++)for(let x=690;x<725;x++)if(t.get(x,y)===m){sum+=y;n++;}
              r[m]={mean:sum/n,n}; } return r;
        }""")
        check("density: oil above water above blood", density['5']['mean'] < density['4']['mean'] < density['6']['mean'], density)
        check("density swaps conserve all liquid pixels", all(v['n'] == 200 for v in density.values()))
        reaction = await page.evaluate("""() => {
          const t=__ember,M=t.M;t.rect(690,100,45,40,M.ROCK);t.rect(695,105,35,30,M.AIR);
          t.put(710,125,M.LAVA);t.put(711,125,M.WATER);
          t.updateMaterials({x0:691,x1:733,y0:101,y1:138});
          let rock=0,steam=0;for(let y=120;y<130;y++)for(let x=705;x<715;x++){let m=t.get(x,y);if(m===M.ROCK)rock++;if(m===M.STEAM)steam++;}
          return {rock,steam};
        }""")
        check("lava + water -> rock and steam", reaction['rock'] > 0 and reaction['steam'] > 0, reaction)
        gas = await page.evaluate("""() => {let t=__ember,M=t.M;t.rect(760,40,20,40,M.ROCK);t.rect(762,42,16,36,M.AIR);t.put(770,70,M.GAS);
          for(let i=0;i<10;i++)t.updateMaterials({x0:761,x1:778,y0:41,y1:78});
          for(let y=42;y<78;y++)for(let x=762;x<778;x++)if(t.get(x,y)===M.GAS)return y; return 99; }""")
        check("poison gas rises", gas < 70, gas)
        fire = await page.evaluate("""() => {let t=__ember,M=t.M;t.rect(760,100,40,35,M.ROCK);t.rect(763,103,34,29,M.AIR);t.rect(766,122,24,3,M.WOOD);t.put(776,122,M.FIRE);
          let peak=0;for(let i=0;i<250;i++){t.updateMaterials({x0:761,x1:798,y0:101,y1:133});let n=0;for(let y=102;y<133;y++)for(let x=762;x<798;x++)if(t.get(x,y)===M.FIRE)n++;peak=Math.max(n,peak);}
          let wood=0,flame=0;for(let y=102;y<133;y++)for(let x=762;x<798;x++){if(t.get(x,y)===M.WOOD)wood++;if(t.get(x,y)===M.FIRE)flame++;}return {peak,wood,flame};}""")
        check("fire propagates along fuel", fire['peak'] > 2 and fire['wood'] < 70, fire)
        check("fire expires when fuel is exhausted", fire['flame'] == 0)
        acid = await page.evaluate("""() => {let t=__ember,M=t.M;t.rect(690,150,60,35,M.BRICK);t.rect(695,154,50,20,M.ACID);
          for(let i=0;i<25;i++)t.updateMaterials({x0:691,x1:748,y0:151,y1:183});
          let corroded=0;for(let x=695;x<745;x++)if(t.get(x,174)!==M.BRICK)corroded++;return corroded;}""")
        check("acid corrodes even durable masonry", acid > 0, acid)
        powder = await page.evaluate("""() => {let t=__ember,M=t.M;t.rect(810,50,35,45,M.ROCK);t.rect(813,53,29,38,M.AIR);t.put(825,55,M.SAND);
          for(let i=0;i<10;i++)t.updateMaterials({x0:811,x1:843,y0:51,y1:93});
          for(let y=53;y<92;y++)for(let x=813;x<842;x++)if(t.get(x,y)===M.SAND)return y;return 0;}""")
        check("powder falls under gravity", powder > 55)
        quenched = await page.evaluate("""() => {let t=__ember,M=t.M;t.rect(760,200,30,25,M.ROCK);t.rect(763,203,24,19,M.AIR);t.put(770,210,M.FIRE);t.put(771,210,M.WATER);t.updateMaterials({x0:761,x1:788,y0:201,y1:223});return t.get(770,210)!==M.FIRE;}""")
        check("water extinguishes fire", quenched)
        durability = await page.evaluate("""() => {let t=__ember,M=t.M;t.rect(690,240,30,30,M.ROCK);t.rect(735,240,30,30,M.BRICK);t.explode(705,255,12,0);t.explode(750,255,12,0);return {rock:t.get(705,255),brick:t.get(750,255)};}""")
        check("explosions respect material durability", durability['rock']==0 and durability['brick']==18, durability)
        # Deterministic reset prevents material fixtures from affecting other scenarios.
        await page.evaluate("__ember.start(72849103)")
        await page.keyboard.press('Escape')
        compiler = await page.evaluate("__ember.readGroup(['impact','fork','ember','seek','mote','lance'],0)")
        check("trigger consumes exactly the next spell group", compiler['node']['payload']['mods'] == ['fork','ember','seek'] and compiler['next'] == 5 and compiler['cost'] == 49, compiler)
        await page.click('#resumeBtn')
        result = await page.evaluate("""() => { __ember.fixture(180,185);__ember.equip(['timer','fork','mote']);let before=__ember.snapshot();__ember.cast();let paid=__ember.snapshot();__ember.step(30);let after=__ember.snapshot();return {before:before.stats,paid:paid.wands[0].mana,after:after.stats}; }""")
        check("timer releases a three-projectile payload", result['after']['triggered'] >= 1 and result['after']['projectiles'] >= 4, result)
        check("payload mana is prepaid only once", result['paid'] == 133)
        collision = await page.evaluate("""() => {let t=__ember;t.start(72849103);t.fixture(180,185);t.equip(['impact','fork','mote']);t.cast();t.step(65);return t.snapshot().stats;}""")
        check("collision trigger emits its payload on wood impact", collision['triggered'] == 1 and collision['projectiles'] == 4, collision)
        await page.evaluate('__ember.start(72849103);__ember.render()')
        lighting = await page.evaluate("""() => {let s=__ember.snapshot(),c=document.querySelector('#game').getContext('2d');let flame=c.getImageData(Math.round(90-s.cam.x),Math.round(157-s.cam.y),7,12).data;let dark=c.getImageData(630,5,1,1).data;let max=0;for(let i=0;i<flame.length;i+=4)max=Math.max(max,flame[i]);return {flame:max,dark:Math.max(...dark.slice(0,3))};}""")
        check("render: torch is bright while distant cave is dark", lighting['flame'] > 170 and lighting['flame'] > lighting['dark']*3, lighting)

        await page.evaluate("__ember.start(72849103);__ember.fixture(125,230)")
        await page.keyboard.press('e')
        await page.locator('.spell-slot[data-w="bag"][data-s="0"]').drag_to(page.locator('.spell-slot[data-w="0"][data-s="0"]'))
        slots = await page.evaluate('__ember.snapshot().wands[0].slots')
        check("real mouse drag swaps bag and wand slots", slots[0] == 'fork', slots)
        await page.screenshot(path=str(OUT / 'editor-regression.png'))
        await page.keyboard.press('e')
        await page.evaluate('__ember.fixture(400,230)')
        await page.keyboard.press('e')
        check("editing is locked away from workbenches", '仅查看' in await page.locator('#editBadge').inner_text())
        await page.keyboard.press('e')
        await page.evaluate('__ember.start(72849103);__ember.fixture(275,230)')
        await page.keyboard.press('f')
        check("pickup adds a real usable wand", len((await page.evaluate('__ember.snapshot()'))['wands']) == 3)
        await page.evaluate('__ember.fixture(170,593)')
        await page.wait_for_timeout(100)
        await page.keyboard.press('e')
        check("rest chamber has editing and a priced shop", await page.locator('#buySpell').count() == 1)
        await page.keyboard.press('e')
        await page.evaluate('__ember.fixture(290,590);__ember.step(2)')
        check("rest chamber offers three perks", await page.locator('#perkCards button').count() == 3)
        await page.locator('#perkCards button').first.click()
        check("perk selection resumes the run", (await page.evaluate('__ember.snapshot()'))['panel'] is None)

        # Every fatal cause runs through updatePlayer/updateProps, not a forced death-screen call.
        for name, setup in [
          ('烧死', "t.setPlayer({hp:3,burn:180});"),
          ('毒死', "t.setPlayer({hp:3,poison:120});"),
          ('溺死', "t.rect(100,110,60,90,M.ROCK);t.rect(110,120,40,60,M.WATER);t.fixture(130,140);t.setPlayer({hp:8,air:0});"),
          ('蚀亡', "t.rect(100,110,60,90,M.ROCK);t.rect(110,120,40,60,M.ACID);t.fixture(130,140);t.setPlayer({hp:.5});"),
        ]:
            await page.evaluate("""(setup) => {let t=__ember,M=t.M;t.start(72849103);t.fixture(180,200);new Function('t','M',setup)(t,M);t.step(65);}""", setup)
            reason = await page.locator('#deadReason').inner_text()
            check('death cause: ' + name, name in reason, reason)
        crush = await page.evaluate("""() => {let t=__ember,M=t.M;t.start(72849103);let p=t.snapshot().props.find(p=>p.type==='boulder');t.rect(p.x-18,p.y+5,36,75,M.AIR);t.rect(p.x-18,p.y+50,36,4,M.ROCK);t.fixture(p.x,p.y+40);t.setPlayer({hp:20});t.step(50);return t.snapshot().state;}""")
        check('death cause: falling boulder crush', crush == 'dead' and '压死' in await page.locator('#deadReason').inner_text())
        await page.screenshot(path=str(OUT / 'crush-regression.png'))
        old = await page.evaluate('__ember.snapshot().seed')
        await page.click('#restartBtn')
        fresh = await page.evaluate('__ember.snapshot()')
        check('restart resets seed, life, spells, gold and kills', fresh['seed'] != old and fresh['player']['hp'] == 100 and fresh['kills'] == 0 and fresh['gold'] == 0 and len(fresh['wands']) == 2)
        # Verify generated topology/colors and late-game endpoint with explicit fixtures.
        for layer in range(5):
            await page.evaluate('(b)=>{__ember.fixture(450,b*620+170);__ember.step(2)}', layer)
            await page.screenshot(path=str(OUT / f'biome-{layer}.png'))
            check(f'biome {layer+1} enters correctly', await page.locator('#layerText').inner_text() == f'0{layer+1} / 05')
        await page.evaluate("""() => {let t=__ember;t.start(72849103);t.fixture(450,3030);t.equip(['heavy','lance']);t.setPlayer({hp:1000,maxHp:1000});}""")
        # Aim through browser input at the real guardian; do not invoke damageEnemy.
        for i in range(60):
            snap = await page.evaluate('__ember.snapshot()')
            boss = next((e for e in snap['enemies'] if e['type'] == 'warden'), None)
            if boss is None:
                break
            box = await page.locator('#game').bounding_box()
            x = box['x'] + (boss['x']-snap['cam']['x'])/snap['viewport']['w']*box['width']
            y = box['y'] + (boss['y']-snap['cam']['y'])/snap['viewport']['h']*box['height']
            await page.mouse.move(x,y)
            if i == 0:
                await page.mouse.down()
            await page.evaluate('__ember.step(12)')
        await page.mouse.up()
        snap = await page.evaluate('__ember.snapshot()')
        check('guardian can be defeated using projectiles', not any(e['type']=='warden' for e in snap['enemies']))
        await page.evaluate('__ember.fixture(450,3065)')
        await page.keyboard.press('f')
        # The dropped ember may be above its resting place; inspect only its natural interaction on a second frame.
        if (await page.evaluate('__ember.snapshot().state')) != 'won':
            await page.evaluate('__ember.step(120);__ember.fixture(450,3068)')
            await page.keyboard.press('f')
        check('ember pickup leads to victory', (await page.evaluate('__ember.snapshot().state')) == 'won')

        # Mobile: real Chromium touch events, not onclick shortcuts.
        mobile = await browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, device_scale_factor=1)
        phone = await mobile.new_page()
        phone.on('pageerror', lambda err: errors.append(str(err)))
        await phone.goto(URL+'/?test=1')
        await phone.tap('#startBtn')
        cdp = await mobile.new_cdp_session(phone)
        async def touch(selector, duration=.35, offset=(0,0)):
            box=await phone.locator(selector).bounding_box()
            x=box['x']+box['width']/2+offset[0];y=box['y']+box['height']/2+offset[1]
            await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            await asyncio.sleep(duration)
            await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
        x0=await phone.evaluate('__ember.snapshot().player.x')
        await touch('#leftBtn')
        check('mobile: hold left button moves player', await phone.evaluate('__ember.snapshot().player.x') < x0-20)
        await touch('#jumpBtn')
        check('mobile: levitation touch control', await phone.evaluate('__ember.snapshot().player.lev') < 100)
        await touch('#aimPad',.7,(22,0))
        ms=await phone.evaluate('__ember.snapshot()')
        check('mobile: aiming pad fires projectiles', ms['stats']['casts'] > 0)
        await asyncio.sleep(.3)
        check('mobile: touch release stops firing', (await phone.evaluate('__ember.snapshot().stats.casts')) == ms['stats']['casts'])
        await phone.evaluate('__ember.fixture(125,230)')
        await phone.tap('#inventoryBtn')
        await phone.tap('.spell-slot[data-w="bag"][data-s="0"]')
        await phone.tap('.spell-slot[data-w="0"][data-s="0"]')
        check('mobile: tap-tap spell editing', (await phone.evaluate('__ember.snapshot().wands[0].slots[0]')) == 'fork')
        await phone.tap('[data-close="editor"]')
        await phone.screenshot(path=str(OUT/'mobile-portrait.png'))
        await phone.set_viewport_size({'width':844,'height':390})
        await phone.wait_for_timeout(150)
        await phone.screenshot(path=str(OUT/'mobile-landscape.png'))
        check('mobile: layout stays inside viewport', await phone.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        check('no uncaught browser errors', not errors, errors)
        # Production URL has no fixture/debug interface and no external network requirements.
        prod=await browser.new_page()
        external=[]
        prod.on('request',lambda r: external.append(r.url) if not r.url.startswith(URL) and not r.url.startswith('data:') else None)
        await prod.goto(URL)
        check('production does not expose test hooks', await prod.evaluate('typeof window.__ember') == 'undefined')
        check('zero external runtime requests', not external, external)
        offline = await browser.new_page()
        await offline.goto(Path('index.html').resolve().as_uri())
        await offline.click('#startBtn')
        check('file:// offline launch works', await offline.locator('#title').evaluate("e => e.classList.contains('hidden')"))
        await browser.close()
    (OUT/'regression.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
    print(f'\n{len(checks)} checks passed.')

if __name__ == '__main__':
    try:
        asyncio.run(main())
    finally:
        (OUT/'regression.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2))
