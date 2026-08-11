# FrevOS Control Center

Phase 4C authenticated experience derived from the exact, approved
[UI reference](../../docs/UI_REFERENCE.md).

The application reconstructs its protected presentation state from same-origin
BFF endpoints. It loads the browser-safe session summary, enumerates only
server-authorized workspaces, and then loads the selected workspace, clients,
and projects. Every response is runtime validated before rendering. Initial
authentication failure, expiry after authentication, denial, empty membership,
unavailable service, and invalid-response states fail closed.

The browser receives only the hardened server-session cookie; it does not store
provider or session tokens and does not submit membership evidence or
permission scopes. Commands, tasks, Agent Activity, approvals, and audit entries
remain explicitly labeled planned examples and trigger no external side effect.

The deployed Control Center and BFF must share the exact HTTPS origin. This
package does not add a development proxy or weaken secure host-cookie behavior.

```sh
pnpm --filter @frevos/control-center dev
```

Running the Vite server alone will therefore show the honest unavailable state
unless an authorized same-origin integration environment fronts both runtimes.
