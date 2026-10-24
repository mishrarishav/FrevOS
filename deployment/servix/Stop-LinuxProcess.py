"""Fixed pidfd termination adapter. No shell, paths, environment or commands."""
import os
import signal
import sys
import time


def birth(pid):
    with open(f"/proc/{pid}/stat", encoding="utf-8") as stream:
        text = stream.read(8192)
    return text[text.rfind(")") + 2:].split()[19]


def terminate(pid, expected, uid, depth=0):
    if depth > 32:
        raise RuntimeError("process tree exceeds scope")
    handle = os.pidfd_open(pid)
    stopped = False
    killed = False
    try:
        if os.stat(f"/proc/{pid}").st_uid != uid or birth(pid) != expected:
            raise RuntimeError("identity changed")
        # Children are collected before signalling their parent. Every signal
        # independently binds uid and birth through a pidfd.
        signal.pidfd_send_signal(handle, signal.SIGSTOP)
        stopped = True
        for _ in range(100):
            with open(f"/proc/{pid}/stat", encoding="utf-8") as stream:
                state = stream.read(8192)
            if state[state.rfind(")") + 2:].split()[0] in ("T", "t"):
                break
            time.sleep(0.001)
        else:
            raise RuntimeError("process did not stop")
        children = []
        with open(f"/proc/{pid}/task/{pid}/children", encoding="ascii") as stream:
            for child in stream.read(65536).split()[:256]:
                try:
                    children.append((int(child), birth(int(child))))
                except (FileNotFoundError, ProcessLookupError):
                    pass
        for child, created in children:
            try:
                terminate(child, created, uid, depth + 1)
            except (FileNotFoundError, ProcessLookupError):
                pass
        signal.pidfd_send_signal(handle, signal.SIGKILL)
        killed = True
    finally:
        if stopped and not killed:
            try:
                signal.pidfd_send_signal(handle, signal.SIGCONT)
            except ProcessLookupError:
                pass
        os.close(handle)


try:
    if len(sys.argv) != 4 or not all(value.isdecimal() for value in sys.argv[1:]):
        raise RuntimeError("invalid identity")
    target, ticks, owner = sys.argv[1:]
    if int(target) <= 1 or int(owner) != os.getuid():
        raise RuntimeError("invalid owner")
    terminate(int(target), ticks, int(owner))
except Exception:
    # Raw process errors and command lines must not enter application logs.
    sys.exit(1)
