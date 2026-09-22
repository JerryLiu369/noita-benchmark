#!/usr/bin/env python3
"""Fetch Noita reference material from wiki + community into bench workspace refs/."""
import json, os, re, subprocess, sys

OUT = '/home/ubuntu/bench/noita-web6/refs'
os.makedirs(OUT + '/images', exist_ok=True)
ENV_PROVIDERS = 'tavily'

pages = [
    ('materials', 'https://noita.wiki.gg/wiki/Materials'),
    ('reactions', 'https://noita.wiki.gg/wiki/Table_of_Alchemical_Reactions'),
    ('enemies', 'https://noita.wiki.gg/wiki/Enemies'),
    ('wands', 'https://noita.wiki.gg/wiki/Wands'),
    ('spells', 'https://noita.wiki.gg/wiki/Spells'),
    ('biomes', 'https://noita.wiki.gg/wiki/Biomes'),
    ('golden_mountain', 'https://noita.wiki.gg/wiki/Golden_Mountain'),
    ('gems', 'https://noita.wiki.gg/wiki/Gems'),
    ('game_mechanics', 'https://noita.wiki.gg/wiki/Game_Mechanics'),
]

def search(query, n=8):
    r = subprocess.run(['agent-web-search', '--provider', ENV_PROVIDERS, '--max-results', str(n), query],
                       capture_output=True, text=True, timeout=90,
                       env={**os.environ})
    try:
        d = json.loads(r.stdout)
    except Exception:
        return {'results': [], 'err': (r.stderr or r.stdout)[:200]}
    results = []
    for pv in (d.get('providers') or {}).values():
        if isinstance(pv, dict):
            results.extend(pv.get('results') or [])
    if not results:
        results = d.get('results') or []
    return {'results': results}

def dump(path, url, d):
    with open(path, 'w') as f:
        if url:
            f.write(f'SOURCE: {url}\n\n')
        for res in d.get('results', []):
            f.write(f"--- {res.get('title')} | {res.get('url')}\n{res.get('description')}\n\n")

for name, url in pages:
    d = search(f'site:noita.wiki.gg {name}', 5)
    dump(f'{OUT}/{name}.txt', url, d)
    print(name, len(d.get('results', [])))

# extra: pixel-art / feel references from community
for name, q in [
    ('feel_notes', 'Noita game feel juice screen shake pixel art style analysis'),
    ('wand_ui', 'Noita wand editor UI slots layout how it works'),
    ('lighting', 'Noita lighting system dark caves glow fog rendering'),
]:
    d = search(q, 6)
    dump(f'{OUT}/{name}.txt', None, d)
    print(name, len(d.get('results', [])))

# screenshot images from wiki (direct file URLs on wiki.gg are hotlinkable)
img_urls = [
    'https://noita.wiki.gg/images/0/0a/Noita_Screenshot_1.png',
    'https://noita.wiki.gg/images/thumb/7/7e/Noita_Trailer_1.jpg/300px-Noita_Trailer_1.jpg',
]
manifest = []
for i, u in enumerate(img_urls):
    r = subprocess.run(['curl', '-sL', '--max-time', '20', '-o', f'{OUT}/images/img_{i}.png', '-w', '%{http_code}', u],
                       capture_output=True, text=True)
    manifest.append((u, r.stdout))
print('imgs', manifest)
