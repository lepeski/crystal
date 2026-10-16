"""Builds crystalmath-pack.zip: every plugin's resource pack in one, so players download one pack and the game
reloads once on join instead of once per plugin.

usage: python tools/merge_packs.py <out.zip> <pack.zip> [<pack.zip> ...]

The packs live in separate namespaces, so files are simply combined. A path two packs both carry is allowed only
when the bytes are identical; anything else stops the build (decide by hand, e.g. merge the JSON). pack.mcmeta is
written fresh; pack.png comes from the first pack that has one. Entries are sorted with fixed timestamps, so the
same inputs always give the same zip and the same sha1.

Rebuild whenever any plugin's pack changes, publish it, then put its sha1 in the server's server.properties.
"""
import hashlib
import json
import sys
import zipfile

FIXED_TIME = (2026, 1, 1, 0, 0, 0)
META = {"pack": {"description": "CrystalMath - casino, hemp, radios, birds, chef and discs",
                 "min_format": 84, "max_format": 999}}

out, sources = sys.argv[1], sys.argv[2:]
files = {}
owner = {}
for source in sources:
    with zipfile.ZipFile(source) as z:
        for name in z.namelist():
            if name.endswith('/') or name == 'pack.mcmeta':
                continue
            data = z.read(name)
            if name in files:
                if name == 'pack.png' or files[name] == data:
                    continue
                sys.exit(f"CONFLICT: {name} differs between {owner[name]} and {source}")
            files[name] = data
            owner[name] = source
files['pack.mcmeta'] = (json.dumps(META, indent=2) + '\n').encode()

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for name in sorted(files):
        info = zipfile.ZipInfo(name, FIXED_TIME)
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, files[name])

data = open(out, 'rb').read()
print(f"{out}: {len(files)} files, {len(data)} bytes, sha1 {hashlib.sha1(data).hexdigest()}")
