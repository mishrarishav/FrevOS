import json, os, pathlib, subprocess, sys, tempfile

assert sys.platform == 'linux' and os.getuid() != 0
root = pathlib.Path(tempfile.mkdtemp(prefix='devsetu-explorer-'))
project, outside = root / 'project', root / 'outside'
project.mkdir()
outside.mkdir()
(project / 'release.zip').write_bytes(bytes([80, 75, 3, 4]))
(project / 'existing.txt').write_text('retain original')
(project / 'linked').symlink_to(outside)

def browse(**options):
    request = {'root': str(project), 'path': '', 'page': 0, 'includeFiles': True, **options}
    process = subprocess.run([sys.executable, '/source/deployment/servix/Browse-Folders.py'], input=json.dumps(request), text=True, capture_output=True, check=True, timeout=10)
    return json.loads(process.stdout)

listed = browse()
assert 'errorCode' not in listed, listed
assert next(entry for entry in listed['entries'] if entry['name'] == 'release.zip')['size'] == 4
assert next(entry for entry in listed['entries'] if entry['name'] == 'linked')['excluded'] is True
assert browse(create={'kind': 'directory', 'name': 'New folder'})['created']['name'] == 'New folder'
assert browse(path='New folder', create={'kind': 'file', 'name': 'notes.txt'})['created']['name'] == 'notes.txt'
assert (project / 'New folder/notes.txt').stat().st_size == 0
assert browse(create={'kind': 'file', 'name': 'existing.txt'})['errorCode'] == 'folder-already-exists'
assert (project / 'existing.txt').read_text() == 'retain original'
assert browse(path='linked', create={'kind': 'file', 'name': 'escape.txt'})['errorCode'] == 'folder-scope-denied'
assert not (outside / 'escape.txt').exists()
for name in ['../outside', 'name:stream', 'NUL', 'new.']:
    assert browse(create={'kind': 'file', 'name': name})['errorCode'] == 'folder-scope-denied'
print(json.dumps({'status': 'PASS', 'metadata': True, 'exclusiveCreation': True, 'noLinkTraversal': True}))
