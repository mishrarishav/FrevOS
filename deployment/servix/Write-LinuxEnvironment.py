"""Permission-preserving atomic dotenv write over private stdin only."""
import fcntl
import hashlib
import json
import os
import secrets
import stat
import sys


def update(request):
    file = request["file"]
    content = request["content"].encode("utf-8")
    if not file.startswith("/") or len(content) > 65536:
        raise RuntimeError("invalid file")
    parts = file.split("/")[1:]
    if not parts or any(not p or p in (".", "..") for p in parts):
        raise RuntimeError("invalid path")
    directory = os.open("/", os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
            os.close(directory)
            directory = child
        name = parts[-1]
        original = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        temporary = ".devsetu-env-" + secrets.token_hex(16) + ".tmp"
        created = False
        try:
            fcntl.flock(original, fcntl.LOCK_EX | fcntl.LOCK_NB)
            info = os.fstat(original)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 65536:
                raise RuntimeError("unsafe original")
            before = os.read(original, 65537)
            if hashlib.sha256(before).hexdigest() != request["expectedDigest"]:
                raise RuntimeError("document changed")
            target = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
            created = True
            try:
                os.fchown(target, info.st_uid, info.st_gid)
                os.fchmod(target, stat.S_IMODE(info.st_mode))
                for attribute in os.listxattr(original):
                    value = os.getxattr(original, attribute)
                    try:
                        existing = os.getxattr(target, attribute)
                    except OSError:
                        existing = None
                    if existing != value:
                        os.setxattr(target, attribute, value)
                remaining = memoryview(content)
                while remaining:
                    remaining = remaining[os.write(target, remaining):]
                os.fsync(target)
            finally:
                os.close(target)
            current = os.stat(name, dir_fd=directory, follow_symlinks=False)
            if (current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns, current.st_ctime_ns) != (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns):
                raise RuntimeError("document changed")
            os.replace(temporary, name, src_dir_fd=directory, dst_dir_fd=directory)
            created = False
            os.fsync(directory)
        finally:
            os.close(original)
            if created:
                os.unlink(temporary, dir_fd=directory)
    finally:
        os.close(directory)


try:
    raw = sys.stdin.buffer.read(262145)
    if len(raw) > 262144:
        raise RuntimeError("request too large")
    request = json.loads(raw)
    if sorted(request) != ["content", "expectedDigest", "file"]:
        raise RuntimeError("invalid request")
    update(request)
    print("saved")
except Exception:
    sys.exit(1)
