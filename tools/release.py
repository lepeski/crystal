"""Builds a CrystalMath modpack release from the committed packs.

usage: python tools/release.py <dir with the current packs> <out dir> <main version> <lite version>
                               [--swap overrides/mods/x.jar=path/to/new.jar ...]
                               [--add overrides/mods/new.jar=path/to/new.jar ...]
                               [--swap-where-present overrides/config/x.properties=path/to/x.properties ...]

--swap replaces a file the packs already have (and fails if one doesn't); --add puts in a new one;
--swap-where-present replaces it only in the packs that have it (a config for a mod the lite pack leaves out).

Every pack gets servers.dat with the server in it (on auto-updates only when the player has none yet).

Writes into <out dir>:
  CrystalMath-26.1.2.mrpack, -lite.mrpack, -curseforge.zip   the packs, bumped, with jars swapped and
                                                             overrides/config/crystalmath-pack.json added
  pack/ and pack-lite/                                       the same packs as packwiz trees, for auto-updates
  pack-version.json                                          the latest versions (the server's update notice reads it)
  CrystalMath-Prism.zip, CrystalMath-Lite-Prism.zip           Prism Launcher instances that update themselves

Always run it on packs extracted from git (see the modpack-rebuild note), never on a scratch copy.
"""
import hashlib
import json
import os
import sys
import zipfile

SITE = 'https://lepeski.github.io/crystal/'
BOOTSTRAP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'packwiz-installer-bootstrap.jar')

src, out, main_version, lite_version = sys.argv[1:5]
swaps = {}
adds = {}
optional_swaps = {}
target = swaps
for arg in sys.argv[5:]:
    if arg == '--swap':
        target = swaps
        continue
    if arg == '--swap-where-present':
        target = optional_swaps
        continue
    if arg == '--add':
        target = adds
        continue
    entry, path = arg.split('=', 1)
    target[entry] = open(path, 'rb').read()

PACKS = {
    'CrystalMath-26.1.2.mrpack': ('main', 'modrinth.index.json', 'versionId', main_version),
    'CrystalMath-26.1.2-lite.mrpack': ('lite', 'modrinth.index.json', 'versionId', lite_version),
    'CrystalMath-26.1.2-curseforge.zip': ('curseforge', 'manifest.json', 'version', main_version),
}

os.makedirs(out)


def version_file(pack, version):
    return json.dumps({'pack': pack, 'version': version}, indent=2).encode()


SERVER_NAME = 'CrystalMath'
SERVER_ADDRESS = '185.141.216.149'


def servers_dat():
    """The multiplayer list with our server already in it (uncompressed NBT, as Minecraft writes servers.dat).
    acceptTextures = 1 is the list's "Server Resource Packs: Enabled", so joining doesn't stop to ask."""
    import struct

    def name(tag, n):
        b = n.encode()
        return bytes([tag]) + struct.pack('>H', len(b)) + b

    def string(n, v):
        b = v.encode()
        return name(8, n) + struct.pack('>H', len(b)) + b

    server = string('ip', SERVER_ADDRESS) + string('name', SERVER_NAME) + name(1, 'acceptTextures') + b'\x01' \
        + name(1, 'hidden') + b'\x00' + b'\x00'
    return name(10, '') + name(9, 'servers') + bytes([10]) + struct.pack('>i', 1) + server + b'\x00'


def toml_str(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


# ---------------------------------------------------------------- the packs
for name, (pack, meta, key, version) in PACKS.items():
    zin = zipfile.ZipFile(os.path.join(src, name))
    with zipfile.ZipFile(os.path.join(out, name), 'w', zipfile.ZIP_DEFLATED) as zout:
        swapped = 0
        missing = set(swaps) - set(zin.namelist())
        if missing:
            raise SystemExit(name + ' has no ' + ', '.join(sorted(missing)) + ' to swap (use --add for new files)')
        for info in zin.infolist():
            data = zin.read(info.filename)
            if info.filename in ('overrides/config/crystalmath-pack.json', 'overrides/servers.dat'):
                continue
            if info.filename in swaps:
                data = swaps[info.filename]
                swapped += 1
            elif info.filename in optional_swaps:
                data = optional_swaps[info.filename]
                swapped += 1
            elif info.filename == meta:
                d = json.loads(data)
                d[key] = version
                data = json.dumps(d, indent=2).encode()
            zout.writestr(info, data)
        for entry, data in adds.items():
            if entry in zin.namelist():
                raise SystemExit(name + ' already has ' + entry + ' (use --swap to replace it)')
            zout.writestr(entry, data)
        zout.writestr('overrides/config/crystalmath-pack.json', version_file(pack, version))
        # A fresh install opens with the server already in the multiplayer list.
        zout.writestr('overrides/servers.dat', servers_dat())
    z = zipfile.ZipFile(os.path.join(out, name))
    print(name, version, 'swapped', swapped, 'files', len(z.namelist()), '(was', len(zin.namelist()), ') size',
          os.path.getsize(os.path.join(out, name)))


# ---------------------------------------------------------------- packwiz trees
def packwiz(mrpack, folder, pack, version, title):
    z = zipfile.ZipFile(os.path.join(out, mrpack))
    index = json.loads(z.read('modrinth.index.json'))
    root = os.path.join(out, folder)
    entries = []

    def put(rel, data, metafile=False):
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'wb').write(data)
        entries.append((rel, hashlib.sha256(data).hexdigest(), metafile))

    for f in index['files']:
        if f.get('env', {}).get('client') == 'unsupported':
            continue
        base = os.path.basename(f['path'])
        meta = '\n'.join([
            'name = ' + toml_str(base),
            'filename = ' + toml_str(base),
            'side = "client"',
            '',
            '[download]',
            'url = ' + toml_str(f['downloads'][0]),
            'hash-format = "sha1"',
            'hash = ' + toml_str(f['hashes']['sha1']),
            '',
        ]).encode()
        put(os.path.dirname(f['path']) + '/' + base + '.pw.toml', meta, metafile=True)
    for n in z.namelist():
        if n.startswith('overrides/') and not n.endswith('/'):
            put(n[len('overrides/'):], z.read(n))
    lines = ['hash-format = "sha256"', '']
    for rel, digest, metafile in sorted(entries):
        lines += ['[[files]]', 'file = ' + toml_str(rel), 'hash = ' + toml_str(digest)]
        if metafile:
            lines.append('metafile = true')
        if rel == 'servers.dat':
            # Put there once; never overwrite a list the player has added their own servers to.
            lines.append('preserve = true')
        lines.append('')
    index_data = '\n'.join(lines).encode()
    open(os.path.join(root, 'index.toml'), 'wb').write(index_data)
    deps = index['dependencies']
    pack_toml = '\n'.join([
        'name = ' + toml_str(title),
        'author = "CrystalMath"',
        'version = ' + toml_str(version),
        'pack-format = "packwiz:1.1.0"',
        '',
        '[index]',
        'file = "index.toml"',
        'hash-format = "sha256"',
        'hash = ' + toml_str(hashlib.sha256(index_data).hexdigest()),
        '',
        '[versions]',
        'minecraft = ' + toml_str(deps['minecraft']),
        'fabric = ' + toml_str(deps['fabric-loader']),
        '',
    ])
    open(os.path.join(root, 'pack.toml'), 'w', newline='\n').write(pack_toml)
    print(folder, len(entries), 'entries')
    return deps


deps_main = packwiz('CrystalMath-26.1.2.mrpack', 'pack', 'main', main_version, 'CrystalMath')
deps_lite = packwiz('CrystalMath-26.1.2-lite.mrpack', 'pack-lite', 'lite', lite_version, 'CrystalMath Lite')

open(os.path.join(out, 'pack-version.json'), 'w', newline='\n').write(json.dumps(
    {'main': main_version, 'lite': lite_version, 'curseforge': main_version, 'site': SITE}, indent=2) + '\n')


# ---------------------------------------------------------------- Prism instances
def prism(zip_name, title, folder, deps, memory):
    cfg = '\n'.join([
        'InstanceType=OneSix',
        'name=' + title,
        'iconKey=default',
        'OverrideCommands=true',
        'PreLaunchCommand="$INST_JAVA" -jar packwiz-installer-bootstrap.jar ' + SITE + folder + '/pack.toml',
        'OverrideMemory=true',
        'MinMemAlloc=1024',
        'MaxMemAlloc=' + str(memory),
        '',
    ])
    mmc = {'formatVersion': 1, 'components': [
        {'uid': 'net.minecraft', 'version': deps['minecraft'], 'important': True},
        {'uid': 'net.fabricmc.fabric-loader', 'version': deps['fabric-loader']},
    ]}
    with zipfile.ZipFile(os.path.join(out, zip_name), 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('instance.cfg', cfg)
        z.writestr('mmc-pack.json', json.dumps(mmc, indent=2))
        z.write(BOOTSTRAP, '.minecraft/packwiz-installer-bootstrap.jar')
    print(zip_name, os.path.getsize(os.path.join(out, zip_name)))


prism('CrystalMath-Prism.zip', 'CrystalMath', 'pack', deps_main, 6144)
prism('CrystalMath-Lite-Prism.zip', 'CrystalMath Lite', 'pack-lite', deps_lite, 4096)
