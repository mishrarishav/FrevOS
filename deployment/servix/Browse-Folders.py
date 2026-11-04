import sys, os, json, hashlib, errno, datetime, re

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
        created = value.get('create')
        if created is not None:
            name = created.get('name', '')
            if (set(created) != {'kind', 'name'} or created['kind'] not in ('file', 'directory')
                or not isinstance(name, str) or not 1 <= len(name) <= 255
                or re.search(r'[\\/:*?"<>|\x00-\x1f\x7f]', name) or name.endswith(('.', ' '))
                or re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)', name, re.I)
                or page != 0 or 'fingerprint' in value):
                raise ValueError('folder-scope-denied')
            if created['kind'] == 'directory':
                os.mkdir(name, mode=0o700, dir_fd=current)
            else:
                file = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=current)
                os.close(file)
            before = os.fstat(current)
        names, scanned, truncated = [], 0, False
        with os.scandir(current) as entries:
            for entry in entries:
                if scanned >= 10000:
                    truncated = True
                    break
                scanned += 1
                try:
                    linked = entry.is_symlink()
                    directory = entry.is_dir(follow_symlinks=False)
                    if directory or value.get('includeFiles'):
                        name = entry.name
                        if any(ord(c) < 32 or ord(c) == 127 for c in name) or '\\' in name or ':' in name:
                            truncated = True
                            continue
                        info = entry.stat(follow_symlinks=False)
                        metadata = {'name': name, 'excluded': linked or info.st_dev != device}
                        if value.get('includeFiles'):
                            metadata['kind'] = 'link' if linked else 'directory' if directory else 'file'
                            if not linked:
                                metadata['modifiedAt'] = datetime.datetime.fromtimestamp(info.st_mtime, datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
                                if not directory:
                                    metadata['size'] = info.st_size
                        names.append(metadata)
                except OSError:
                    truncated = True
        after = os.fstat(current)
        if before.st_mtime_ns != after.st_mtime_ns:
            raise ValueError('folder-changed')
        names.sort(key=lambda entry: (entry.get('kind', 'directory') != 'directory', entry['name'].casefold(), entry['name']))
        fingerprint = hashlib.sha256(json.dumps([after.st_dev, after.st_ino, after.st_mtime_ns, names], separators=(',', ':')).encode()).hexdigest()
        if value.get('fingerprint', fingerprint) != fingerprint:
            raise ValueError('folder-changed')
        offset = page * 100
        result = {'fingerprint': fingerprint, 'entries': names[offset:offset+100], 'nextPage': page+1 if offset+100 < len(names) else None, 'truncated': truncated, 'scannedEntries': scanned}
        if created is not None:
            result['created'] = created
        return result
    finally:
        for handle in reversed(handles):
            os.close(handle)

try:
    result = run()
except (PermissionError,):
    result = {'errorCode': 'folder-permission-denied'}
except FileExistsError:
    result = {'errorCode': 'folder-already-exists'}
except OSError as error:
    result = {'errorCode': 'folder-scope-denied' if error.errno in (errno.ELOOP, errno.ENOTDIR) else 'folder-path-unavailable'}
except ValueError as error:
    result = {'errorCode': str(error) if str(error).startswith('folder-') else 'folder-browser-unavailable'}
except Exception:
    result = {'errorCode': 'folder-browser-unavailable'}
sys.stdout.write(json.dumps(result, separators=(',', ':')))
