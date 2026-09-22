#!/usr/bin/env python3
"""Pull full wiki article text via MediaWiki API + real screenshots with browser UA."""
import json, os, re, subprocess, urllib.parse, urllib.request

OUT = '/home/ubuntu/bench/noita-web6/refs'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
titles = ['Materials', 'Enemies', 'Wands', 'Spells', 'Biomes', 'Golden Mountain',
          'Gems', 'Table of Alchemical Reactions', 'Game Mechanics', 'Perks',
          'Mighty Grimoire', 'Fungal Caverns', 'The Coal Pits', 'Frozen Vault',
          'The Dim Glitter', 'Greed Deeper Gate']

def api(title):
    url = ('https://noita.wiki.gg/api.php?action=parse&page=' + urllib.parse.quote(title)
           + '&prop=wikitext&format=json&redirects=1')
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

ok, fail = [], []
for t in titles:
    try:
        d = api(t)
        wt = d['parse']['wikitext']['*']
        # trim templates noise lightly, keep text volume
        fn = OUT + '/wiki_' + re.sub(r'[^A-Za-z0-9]+', '_', t) + '.md'
        with open(fn, 'w') as f:
            f.write(f'# Noita Wiki: {t}\n# source: https://noita.wiki.gg/wiki/{urllib.parse.quote(t.replace(" ", "_"))}\n\n')
            f.write(wt[:60000])
        ok.append((t, len(wt)))
    except Exception as e:
        fail.append((t, str(e)[:80]))
print('OK:', ok)
print('FAIL:', fail)

# screenshots: list images on the main page, then download with referer
def get(url, path):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': 'https://noita.wiki.gg/'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r, open(path, 'wb') as f:
            f.write(r.read())
        return 'ok'
    except Exception as e:
        return str(e)[:60]

# find real file names via search API on the main game article
try:
    d = api('Noita')
    wt = d['parse']['wikitext']['*']
    files = re.findall(r'[\w\-\. ]+\.png|[\w\-\. ]+\.jpg', wt)
    files = [f for f in dict.fromkeys(files) if 'icon' not in f.lower()][:8]
    print('candidate files:', files)
    for i, fn in enumerate(files):
        u = 'https://noita.wiki.gg/images/' + urllib.parse.quote(fn.replace(' ', '_'))
        # most wiki images live under hashed dirs; use Special:FilePath which redirects
        u = 'https://noita.wiki.gg/Special:FilePath/' + urllib.parse.quote(fn)
        r = get(u, f'{OUT}/images/shot_{i:02d}.png')
        print(i, fn, r)
except Exception as e:
    print('main page err', e)
