"""Build the offline single-file game:  CHOI GAME.html  (+ data/*.js side files for big optional assets)."""
import re, json, base64, os, sys
SRC = '/home/claude/work'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/build'
ORDER = ['Effects', 'Bridge', 'Arena', 'House', 'AudioManager', 'UIManager', 'Player', 'Weapon', 'Enemy', 'WaveManager', 'main']
three_imports = []
parts = []
for name in ORDER:
    s = open(f'{SRC}/js/{name}.js', encoding='utf8').read()
    lines = []
    exports = []
    for ln in s.split('\n'):
        m = re.match(r"^import .* from '(three[^']*)';\s*$", ln)
        if m:
            if ln not in three_imports: three_imports.append(ln)
            continue
        if re.match(r"^import .* from '\./[A-Za-z]+\.js';\s*$", ln):
            continue
        m = re.match(r'^export (async function|function|class|const|let) ([A-Za-z_$][\w$]*)', ln)
        if m:
            exports.append(m.group(2))
            ln = ln[len('export '):]
        lines.append(ln)
    body = '\n'.join(lines)
    assert 'export ' not in re.sub(r'//.*', '', body).split('\n')[0]
    if name == 'main':
        parts.append(f'// ===== {name}.js =====\n{{\n{body}\n}}\n')
    else:
        parts.append(f'// ===== {name}.js =====\nconst {{ {", ".join(exports)} }} = (() => {{\n{body}\nreturn {{ {", ".join(exports)} }};\n}})();\n')
game_src = '\n'.join(three_imports) + '\n\n' + '\n'.join(parts)
assert '</script' not in game_src

# core assets embedded in the page (reuse the ones already in the previous build)
old = open('/mnt/user-data/uploads/SPEC-OPS-SURVIVAL/CHOI GAME.html', encoding='utf8').read().split('\n')[341]
EMB = json.loads(old[old.index('{'):old.rindex('}') + 1])
EMB.pop('assets/models/ak47.glb', None)          # replaced by the textured AK rig (side file)
EMB['assets/effects/explosion/freesound_community-hq-explosion-6288.mp3'] = 'data:audio/mpeg;base64,' + base64.b64encode(
    open('/mnt/user-data/uploads/SPEC-OPS-SURVIVAL/_source/assets/effects/explosion/freesound_community-hq-explosion-6288.mp3', 'rb').read()).decode()

def data_url(path, mime='model/gltf-binary'):
    return f'data:{mime};base64,' + base64.b64encode(open(path, 'rb').read()).decode()

# side files (loaded on demand with <script src>)
os.makedirs(f'{OUT}/data', exist_ok=True)
SIDE = {}
side_assets = [
    ('assets/models/guns/web/ak47.glb', '/home/claude/web/guns/ak47c.glb', 'gun_ak47.js'),
    ('assets/models/guns/web/usp45.glb', '/home/claude/web/guns/usp45.glb', 'gun_usp45.js'),
    ('assets/models/guns/web/m9.glb', '/home/claude/web/guns/m9.glb', 'gun_m9.js'),
    ('assets/models/guns/web/mp9.glb', '/home/claude/web/guns/mp9.glb', 'gun_mp9.js'),
    ('assets/models/guns/web/ump45.glb', '/home/claude/web/guns/ump45.glb', 'gun_ump45.js'),
    ('assets/models/guns/web/saps12.glb', '/home/claude/web/guns/saps12.glb', 'gun_saps12.js'),
    ('assets/models/guns/web/m4a1.glb', '/home/claude/web/guns/m4a1.glb', 'gun_m4a1.js'),
    ('assets/models/guns/web/m4cqb.glb', '/home/claude/web/guns/m4cqb.glb', 'gun_m4cqb.js'),
    ('assets/models/maps/web/ghost_city.glb', '/home/claude/web/maps/ghost_city.glb', 'map_ghost_city.js'),
]
for url, path, js in side_assets:
    with open(f'{OUT}/data/{js}', 'w') as f:
        f.write('window.__EMBED = window.__EMBED || {};\nwindow.__EMBED[' + json.dumps(url) + '] = "' + data_url(path) + '";\n')
    SIDE[url] = 'data/' + js

html = open(f'{SRC}/index.html', encoding='utf8').read()
html = html.replace("var MODE = 'server';", "var MODE = 'inline';")
html = html.replace('<link rel="stylesheet" href="style.css" />', '<style>\n' + open(f'{SRC}/style.css', encoding='utf8').read() + '\n</style>')
boot = html.index('  <!-- Bootloader')
inject = ('  <script>window.__EMBED = ' + json.dumps(EMB) + ';</script>\n'
          '  <script>window.__SIDECAR = ' + json.dumps(SIDE) + ';</script>\n'
          '  <script type="text/plain" id="game-src">\n' + game_src + '\n</script>\n')
html = html[:boot] + inject + html[boot:]
open(f'{OUT}/CHOI GAME.html', 'w', encoding='utf8').write(html)
print('html', round(os.path.getsize(f'{OUT}/CHOI GAME.html') / 1e6, 1), 'MB; side', {k: round(os.path.getsize(f'{OUT}/' + v) / 1e6, 1) for k, v in SIDE.items()})
