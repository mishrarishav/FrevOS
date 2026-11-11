# Native server monitoring

The application authorizes monitoring through PostgreSQL-backed targets and policy. A separate native SYSTEM scheduled worker on the central Windows server performs the fixed read-only sampling program. The app can submit only an enrolled target ID, action, request ID, expiry and binding hash. It cannot supply commands, addresses, passwords, URLs or PowerShell to the worker.

`QueueCollector.mjs` exports `createNativeServerMonitoringCollector({queueRoot, workspaceId?, pollIntervalMs?, timeoutMs?})`. The returned `(target, context)` function implements the control-plane collector interface. Missing queues fail closed; this transport does not create a local database, listener, container or fallback state store.

## Operator enrollment

Keep the private root outside the application installation/data directory, for example `E:\FrevOS\operator\server-monitoring`. Use a new dedicated queue root, for example `E:\FrevOS\servix\jobs\server-monitoring`. Private programs, registry, claims and encrypted profiles are readable by SYSTEM and local Administrators only. The app identity (default LocalService SID `S-1-5-19`) can modify requests and read results, but cannot change the registry/program/profile or forge a result.

An operator-created `registry.v1.json` in the private root has this shape (example values are documentation, never product defaults):

```json
{
  "version": 1,
  "workspaceId": "ws_example",
  "targets": [{
    "id": "srv_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "workspaceId": "ws_example",
    "address": "10.0.0.20",
    "port": 5985,
    "transport": "winrm-http",
    "credentialProfile": "internal_servers_v1",
    "revision": 1,
    "enabled": true,
    "endpointHost": "server20.example.internal",
    "authentication": "Kerberos",
    "expectedComputerName": "SERVER20"
  }]
}
```

Copy exact target IDs, address, transport, port and credential-profile reference from the saved application catalog. The fingerprint is SHA256 of UTF-8 `workspaceId`, ID, address, decimal port, transport and credential profile joined by newline. These stable endpoint identity fields require matching operator enrollment. The registry's revision is enrollment metadata; application revisions fence database writes and collection leases only. Changing a name or access grant may increment the application revision without requiring registry changes or stopping monitoring of the same endpoint. The app never edits the protected registry. Only literal RFC1918 IPv4 targets are accepted. A DNS endpoint must resolve exclusively to the enrolled IPv4 address by default. Prefer Kerberos on the verified domain hostname. `Negotiate` uses the machine's existing WinRM trust configuration; it does not change TrustedHosts. HTTPS uses normal certificate validation. Basic authentication, unencrypted WinRM options and certificate bypass are absent.

For a verified multi-interface Windows server, an operator may add `approvedEndpointAddresses` to its private registry entry: an array of one to eight unique RFC1918 IPv4 addresses including the target's primary `address`. This requires `authentication: "Kerberos"`, a hostname endpoint and a valid `expectedComputerName`. Before enrollment, authenticate the server and independently verify that every approved address belongs to that same computer; DNS answers alone are not ownership proof. Every collection requires the complete resolved address set to equal the approved set, then verifies the authenticated snapshot's computer name. An added or missing A/AAAA answer is rejected before the credential is loaded. No address is auto-enrolled, no DNS record is removed, and the app cannot submit or change this policy. Updating the registry requires a reviewed new registry hash and restarting only the owned monitoring worker with that hash.

`transport: "local"` is an explicit exception only for the central worker's own computer: the enrolled expected computer name and IP must match the actual machine. This is reported as **local**, never as a successful WinRM login. No SMB remote-execution fallback is included.

## Installation and credential handling

1. Generate `manifest.v1.json` with `node deployment/server-monitoring/Build-Manifest.mjs`. Review its five exact PowerShell hashes, the registry hash, the private and queue paths, target list and worker action before submitting the native operator operation.
2. Stage only those reviewed files and registry. Invoke `Install-Worker.ps1 -Action Install` as SYSTEM with `ProtectedRoot`, `QueueRoot`, `WorkspaceId`, `RegistrySha256`, `ManifestSha256` and the app identity SID. It verifies hashes, installs protected programs/ACLs and registers its own startup task. Task arguments have no secrets. The unsigned reviewed worker uses a process-scoped execution policy; machine policy is unchanged. Existing tasks with another owner/action/hash are rejected. No customer service, firewall, IIS, database or pairing is modified.
3. Seal the existing owner credential using `Protect-Credential.ps1` as SYSTEM. Supply bounded JSON on protected stdin or an exclusively protected `incoming\credential-<32 hex>.json` file. Input is `{version:1, credentialProfile, username, password}`. Never put this payload in task arguments, a browser API or logs. The profile is encrypted with SYSTEM's DPAPI CurrentUser context and fixed purpose entropy. The input file is deliberately retained for the operator's explicit secure cleanup. Existing profiles are never overwritten or rotated by this tool.
4. Point the app's typed collector adapter at the queue root. Invoke `Install-Worker.ps1 -Action Check` using the same exact hashes. Require `health: "healthy"` with a recent heartbeat, not merely task registration. A protected `stop.requested` file stops only this monitoring worker; removing it and starting its exact owned task resumes it. Changing an installed immutable worker/task requires a separately reviewed operator update, not an untrusted app request.

The registry is read once at startup and bound to the task hash. Worker heartbeat includes version, registry hash, target count and active collection count. Four bounded runspaces execute fixed samples; expiry/cancellation stops an owned pipeline. Exact-name results and request/cancel files expire after five minutes (caps 1000/512); replay claims expire after six hours (cap 5000), with a three-minute minimum grace. These queue files are transport receipts. The application persists bounded sample history, policy and audit in the central database.

`Update-Enrollment.ps1` is a separate SYSTEM operator operation for a reviewed Common/Collector program update and an explicit registry metadata/port change. Stage it with its SHA-pinned `Update-Worker.ps1` dependency, five program files, before/after manifests, the proposed `registry.v1.json` and a hash-bound `plan.v1.json`. The plan records actor, source HEAD, old/new registry and manifest hashes, expiry (at most four hours), separated paths and explicit `targetUpdates: [{previousId,nextId}]`. It rejects changes to addresses, transport, profiles, enabled state, unlisted targets, Worker/Install/Protect programs, or task definition/security beyond the registry hash argument. Apply retains full file preimages and owner/group/DACL, preserves encrypted credential bytes/security, stops only the owned sampler, and accepts the new worker only after two advancing heartbeats. On failure it restores the old program files, registry and task argument and verifies old-worker health. This tool does not run from the application or accept a command payload; failed operations retain receipts for review and must not be retried under the same operation ID.

## Measurement behavior and limitations

CPU is the current whole-computer performance counter, or processor LoadPercentage if supported. Process CPU uses the current performance counter divided by logical core count. Cumulative `Get-Process.CPU` seconds are never treated as a percentage. Unsupported CPU/network counters are null; gaps are not invented. RAM and OS are required. Drives, top ten CPU plus top ten memory processes (deduplicated), and up to 1000 service metadata rows are bounded. Empty optional arrays mean no data reported, not proof that no services/processes exist. No command lines, environment variables, service credentials or file contents are collected.

Connection failures produce fixed typed statuses, including authentication failure, access denied, endpoint unreachable, WinRM unavailable and unsupported. Raw Windows errors, request data and credentials never become app messages. Monitoring does not start/stop services or kill processes.

## Verification

`node --test deployment/server-monitoring/QueueCollector.test.mjs` tests only temporary filesystem fixtures. `Test-Native.ps1` tests pure mocked CIM measurements and PowerShell parsers without connections or listeners. Both Windows PowerShell 5.1 and PowerShell 7 are supported. Actual server logins, SYSTEM ACL/DPAPI installation, task heartbeat and private endpoint measurements require the separately authorized central-server operator verification; pure fixture success does not claim that live verification passed.
