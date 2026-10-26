import sys, os, json, hashlib, errno

def run():
    value = json.loads(sys.stdin.buffer.read(8193))
    root, relative, page = value['root'], value['path'], value['page']
    if not os.path.isabs(root) or '\\' in relative or ':' in relative or any(p in ('.', '..', '') for p in relative.split('/')) and relative or not isinstance(page, int) or not 0 <= page <= 100:
        raise ValueError('folder-scope-denied')
    handles = []
    try:
        current = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        handles.append(current)
        for name in root.strip('/').split('/') if root != '/' else []:
            current = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
            handles.append(current)
        device = os.fstat(current).st_dev
        for name in relative.split('/') if relative else []:
            current = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
            handles.append(current)
            if os.fstat(current).st_dev != device:
                raise ValueError('folder-scope-denied')
        before = os.fstat(current)
        names, scanned, truncated = [], 0, False
        with os.scandir(current) as entries:
            for entry in entries:
                if scanned >= 10000:
                    truncated = True
                    break
                scanned += 1
                try:
                    if entry.is_symlink():
                        continue
                    if entry.is_dir(follow_symlinks=False):
                        name = entry.name
                        if any(ord(c) < 32 or ord(c) == 127 for c in name) or '\\' in name or ':' in name:
                            truncated = True
                            continue
                        names.append({'name': name, 'excluded': entry.stat(follow_symlinks=False).st_dev != device})
                except OSError:
                    truncated = True
        after = os.fstat(current)
        if before.st_mtime_ns != after.st_mtime_ns:
            raise ValueError('folder-changed')
        names.sort(key=lambda entry: entry['name'])
        fingerprint = hashlib.sha256(json.dumps([after.st_dev, after.st_ino, after.st_mtime_ns, names], separators=(',', ':')).encode()).hexdigest()
        if value.get('fingerprint', fingerprint) != fingerprint:
            raise ValueError('folder-changed')
        offset = page * 100
        return {'fingerprint': fingerprint, 'entries': names[offset:offset+100], 'nextPage': page+1 if offset+100 < len(names) else None, 'truncated': truncated, 'scannedEntries': scanned}
    finally:
        for handle in reversed(handles):
            os.close(handle)

try:
    result = run()
except (PermissionError,):
    result = {'errorCode': 'folder-permission-denied'}
except OSError as error:
    result = {'errorCode': 'folder-scope-denied' if error.errno in (errno.ELOOP, errno.ENOTDIR) else 'folder-path-unavailable'}
except ValueError as error:
    result = {'errorCode': str(error) if str(error).startswith('folder-') else 'folder-browser-unavailable'}
except Exception:
    result = {'errorCode': 'folder-browser-unavailable'}
sys.stdout.write(json.dumps(result, separators=(',', ':')))
