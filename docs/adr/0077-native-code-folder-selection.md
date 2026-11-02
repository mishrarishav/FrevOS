# ADR 0077: Native Code folder selection

Status: Accepted for the owner's explicit native-folder request, 2026-10-31.

The owner requires Choose folder to open the operating system's actual folder
dialog on the selected paired laptop, rather than only the web folder browser.
This bounded extension stays on codex/central-git-collaboration at the existing
e5b1122 base and its uncommitted ADR 0076 changes. Phase 4 stays open.

Use an expiring owner/workspace/device-bound picker job, claimed once by the
authenticated interactive connector. Windows uses the existing compiled GUI
helper with the operating system's Common Item Dialog in folder-selection mode;
Linux desktop uses an existing fixed zenity/kdialog executable. The Windows
helper requires the unlocked interactive Default desktop and never switches
desktops, elevates or changes desktop permissions.
No browser-upload directory handle is treated as an absolute connector path.
No caller shell, executable, prompt, arbitrary command or credential is accepted.
The connector validates the selected existing local directory; the server accepts
selection proof only from that job's current paired owner. Selection does not
initialize Git, change configuration, create a repository, or publish files.

Cancel/expiry/offline/non-interactive desktops are explicit outcomes. Completed,
claimed or uncertain requests never automatically reopen the dialog. Old
connectors must advertise the native capability before native selection is shown
as available. The existing authenticated web folder browser remains an explicit
fallback, not a simulated native chooser.

Existing pinned system runtimes use the full system updater, which accepts the
verified legacy 12-file preimage and the current 14-file package. It preserves
the device, account, credential, monitoring state and file permissions while
rewrapping the same configuration with the new manifest digest. Failed startup
restores the original runtime, manifest and encrypted configuration, removing
only verified additions. Sidecar-only updates refuse system mode. No live
secret rotation, re-enrollment or connector update is performed by this task.

This supersedes only ADR 0076's web-only selection experience. Authorization,
protected files, source publication, approvals and separate live rollout gates
remain intact. Native acceptance must show the actual OS dialog and completion
or cancellation. Local UI fixtures must not claim pairing or successful pushes.
