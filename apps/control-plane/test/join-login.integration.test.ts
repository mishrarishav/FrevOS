import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authCookiePolicy } from "@frevos/contracts";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { prepareApplicationLoginRole, runMigrations } from "../src/database.js";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import { DeviceLogins } from "../src/device-logins.js";
import { DiscoveryAccessPolicySchema, isDiscoveryAdministrator } from "../src/discovery-access.js";
import { JoinRequests } from "../src/join-requests.js";
import { LocalAccounts } from "../src/local-accounts.js";
import { IdentitySessionRepository, WorkspaceRepository } from "../src/repositories.js";
import { buildServer } from "../src/server.js";
import { SystemDiscovery } from "../src/system-discovery.js";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
it("approves new/existing user requests manually, redeems only the reviewed computer, and requires device proof for non-admin browser sessions", async () => {
  const container = await new PostgreSqlContainer(
    "postgres:18.4-alpine3.23@sha256:996d0920e4ff9df1fc19dacb904492f3c1ec0ec1cc338f0ad7123be7731c5f5e",
  ).start();
  const database = new Pool({ connectionString: container.getConnectionUri() });
  const root = await mkdtemp(join(tmpdir(), "join-login-"));
  let pool: Pool | undefined,
    server: Awaited<ReturnType<typeof buildServer>> | undefined,
    connectors: DeveloperConnectorStore | undefined;
  try {
    await runMigrations(database);
    await database.query(
      "CREATE ROLE join_login_fixture LOGIN PASSWORD 'synthetic-only-password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
    );
    await prepareApplicationLoginRole(database, "join_login_fixture");
    const url = new URL(container.getConnectionUri());
    url.username = "join_login_fixture";
    url.password = "synthetic-only-password";
    pool = new Pool({ connectionString: url.toString(), max: 4 });
    const identities = new IdentitySessionRepository(pool),
      workspaces = new WorkspaceRepository(pool),
      workspaceId = "ws_server20";
    await workspaces.createWorkspace({ workspaceId, displayName: "Join fixture" });
    const admin = await identities.provisionLocalCredential({
      username: "ops.admin",
      password: "synthetic-admin-password",
      displayName: "Ops",
      userId: "usr_ops",
      requireNew: true,
      developerWorkspaceId: workspaceId,
    });
    const alice = await identities.provisionLocalCredential({
      username: "alice.user",
      password: "synthetic-alice-password",
      displayName: "Alice",
      userId: "usr_alice",
      requireNew: true,
      developerWorkspaceId: workspaceId,
    });
    const policy = DiscoveryAccessPolicySchema.parse({
      version: 1,
      workspaceId,
      administrators: [admin.userId],
    });
    const administrator = async (actor: string) =>
      isDiscoveryAdministrator(policy, actor, await workspaces.getEvidence(workspaceId, actor));
    const allowed = async (actor: string) => {
      const evidence = await workspaces.getEvidence(workspaceId, actor);
      return (
        evidence?.workspace.status === "active" &&
        evidence.membership?.status === "active" &&
        evidence.membership.grantedScopes.some((scope) => scope === "project:write")
      );
    };
    let timestamp = Date.now() + 1000;
    const now = () => new Date(timestamp);
    connectors = new DeveloperConnectorStore(
      join(root, "connectors"),
      allowed,
      { head: async () => "a".repeat(40), importBundle: async () => {} },
      async () => {},
      now,
      undefined,
      undefined,
      undefined,
      administrator,
      true,
    );
    const discovery = new SystemDiscovery(
      join(root, "discovery"),
      connectors,
      async () => ({ projects: [], clients: [] }),
      now,
    );
    const devices = new DeviceLogins(
      join(root, "bindings"),
      workspaceId,
      connectors,
      administrator,
      now,
      (principal) => identities.localCredentialVersion(principal),
      "connector-page",
    );
    const joins = new JoinRequests(
      join(root, "joins"),
      workspaceId,
      identities,
      connectors,
      discovery,
      administrator,
      now,
    );
    const origin = "http://devsetu.fixture";
    const { session: SESSION_COOKIE, csrf: CSRF_COOKIE } = authCookiePolicy("http:");
    server = await buildServer({
      publicOrigin: origin,
      authMode: "local",
      identitySessions: identities,
      workspaces,
      developerConnectors: connectors,
      systemDiscovery: discovery,
      deviceLogins: devices,
      joinRequests: joins,
      localAccounts: new LocalAccounts(pool, identities, join(root, "account-audit")),
      now,
    });
    const login = (username: string, password: string) =>
      server!.inject({
        method: "POST",
        url: "/auth/login",
        headers: { origin },
        payload: { username, password },
      });
    const adminLogin = await login("ops.admin", "synthetic-admin-password");
    expect(adminLogin.statusCode).toBe(204);
    const headers = (response: { cookies: { name: string; value: string }[] }) => ({
      origin,
      cookie: response.cookies
        .filter((cookie) => cookie.value)
        .map((cookie) => cookie.name + "=" + cookie.value)
        .join("; "),
      "x-csrf-token": response.cookies.find((cookie) => cookie.name === CSRF_COOKIE)?.value ?? "",
    });
    const adminHeaders = headers(adminLogin),
      inbox = "/v1/workspaces/ws_server20/connectors/join-requests";
    expect((await login("alice.user", "wrong")).statusCode).toBe(401);
    expect((await login("alice.user", "synthetic-alice-password")).statusCode).toBe(403);
    expect((await server.inject({ method: "GET", url: inbox })).statusCode).toBe(401);
    const deviceId = "fc_" + "c".repeat(32),
      code = "ABCDEFGH",
      input = {
        version: 1,
        mode: "new",
        username: "new.user",
        password: "synthetic-new-password",
        displayName: "New User",
        platform: "win32",
        deviceId,
        codeHash: hash(code),
        fileActivity: false,
      };
    expect(
      (await server.inject({ method: "POST", url: "/auth/join/request", payload: input }))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/auth/join/request",
          headers: { origin },
          payload: { ...input, role: "admin" },
        })
      ).statusCode,
    ).toBe(400);
    const requested = await server.inject({
      method: "POST",
      url: "/auth/join/request",
      headers: { origin },
      payload: input,
    });
    expect(requested.statusCode).toBe(200);
    const request = requested.json(),
      requesterHeaders = headers(requested);
    expect(request.status).toBe("pending");
    for (const secret of [input.password, code, "credentialReference", "codeHash", "requesterHash"])
      expect(JSON.stringify(request)).not.toContain(secret);
    expect(
      (
        await server.inject({ method: "GET", url: "/auth/join/status", headers: requesterHeaders })
      ).json().id,
    ).toBe(request.id);
    expect((await server.inject({ method: "GET", url: "/auth/join/status" })).statusCode).toBe(401);
    expect(
      await identities.authenticateLocalCredential({
        username: input.username,
        password: input.password,
        now: now(),
      }),
    ).toBeNull();
    expect(
      (await server.inject({ method: "GET", url: inbox, headers: adminHeaders })).json(),
    ).toHaveLength(1);
    const decision = {
      version: 1,
      requestId: request.id,
      digest: request.digest,
      decision: "approve",
      confirmation: "reviewed-user-and-system-request",
    };
    expect(
      (
        await server.inject({
          method: "POST",
          url: inbox + "/decision",
          headers: { ...adminHeaders, "x-csrf-token": "invalid" },
          payload: decision,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: inbox + "/decision",
          headers: adminHeaders,
          payload: { ...decision, digest: "0".repeat(64) },
        })
      ).statusCode,
    ).toBe(409);
    const codeRequest = (action: string, body: unknown) =>
      server!.inject({
        method: "POST",
        url: "/v1/connector/join/" + action,
        headers: { "content-type": "application/json" },
        payload: JSON.stringify(body),
      });
    expect((await codeRequest("prepare", { version: 1, code })).statusCode).toBe(403);
    const approved = await server.inject({
      method: "POST",
      url: inbox + "/decision",
      headers: adminHeaders,
      payload: decision,
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe("approved");
    expect(
      (
        await server.inject({
          method: "POST",
          url: inbox + "/decision",
          headers: adminHeaders,
          payload: decision,
        })
      ).statusCode,
    ).toBe(409);
    const newPrincipal = await identities.authenticateLocalCredential({
      username: input.username,
      password: input.password,
      now: now(),
    });
    expect(newPrincipal?.userId).toBe(request.ownerUserId);
    expect(
      (await workspaces.getEvidence(workspaceId, request.ownerUserId))?.membership?.grantedScopes,
    ).not.toContain("discovery:admin");
    expect((await login(input.username, input.password)).statusCode).toBe(403);
    expect((await codeRequest("prepare", { version: 1, code })).json()).toMatchObject({
      deviceId,
      platform: "win32",
      ownerUsername: input.username,
    });
    const credential = deviceId + "." + "c".repeat(43),
      poll = deviceId + "." + "p".repeat(43);
    const redeem = {
      version: 1,
      code,
      deviceId,
      platform: "win32",
      architecture: "x64",
      name: "New user laptop",
      fileActivity: false,
      credentialHash: hash(credential),
      pollHash: hash(poll),
    };
    expect((await codeRequest("redeem", { ...redeem, platform: "linux" })).statusCode).toBe(403);
    expect((await codeRequest("redeem", redeem)).json()).toMatchObject({
      status: "paired",
      ownerUserId: request.ownerUserId,
    });
    expect((await codeRequest("redeem", redeem)).statusCode).toBe(200);
    expect(
      (await codeRequest("redeem", { ...redeem, credentialHash: "f".repeat(64) })).statusCode,
    ).toBe(409);
    expect(
      (
        await server.inject({ method: "GET", url: "/auth/join/status", headers: requesterHeaders })
      ).json().status,
    ).toBe("paired");
    const heartbeat = () =>
      server!.inject({
        method: "POST",
        url: "/v1/connector/heartbeat",
        headers: { authorization: "Bearer " + credential },
        payload: { loginProofPort: 55123 },
      });
    expect((await login(input.username, input.password)).statusCode).toBe(403);
    expect((await heartbeat()).statusCode).toBe(200);
    const challenge = await login(input.username, input.password);
    expect(challenge.statusCode).toBe(202);
    expect(challenge.cookies.some((cookie) => cookie.name === SESSION_COOKIE)).toBe(false);
    const proof = await server.inject({
      method: "POST",
      url: "/v1/connector/login-proof",
      headers: { authorization: "Bearer " + credential },
      payload: { version: 1, challengeId: challenge.json().challengeId },
    });
    expect(proof.statusCode).toBe(200);
    const complete = (body: { [key: string]: unknown }, auth = headers(challenge)) =>
      server!.inject({
        method: "POST",
        url: "/auth/device-login/complete",
        headers: auth,
        payload: body,
      });
    expect(
      (await complete(proof.json(), { origin, cookie: "", "x-csrf-token": "" })).statusCode,
    ).toBe(403);
    expect((await complete({ ...proof.json(), role: "admin" })).statusCode).toBe(400);
    const signedIn = await complete(proof.json());
    expect(signedIn.statusCode).toBe(204);
    const userHeaders = headers(signedIn);
    const pageLogin = await login(input.username, input.password),
      pageId = pageLogin.json().challengeId;
    const pageProof = await server.inject({
      method: "POST",
      url: "/v1/connector/login-proof",
      headers: { authorization: "Bearer " + credential },
      payload: { version: 1, challengeId: pageId },
    });
    const form = new URLSearchParams({
      version: "1",
      challengeId: pageId,
      proof: pageProof.json().proof,
    }).toString();
    const receive = await server.inject({
      method: "POST",
      url: "/auth/device-login/receive",
      headers: {
        origin: "http://127.0.0.1:55123",
        "content-type": "application/x-www-form-urlencoded",
      },
      payload: form,
    });
    expect(receive.statusCode).toBe(303);
    expect(receive.cookies.some((cookie) => cookie.name === SESSION_COOKIE)).toBe(false);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/auth/device-login/finish",
          headers: headers(receive),
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/auth/device-login/finish",
          headers: headers(pageLogin),
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    const pageHeaders = {
      ...headers(pageLogin),
      cookie: headers(pageLogin).cookie + "; " + headers(receive).cookie,
    };
    const returnPage = await server.inject({
      method: "GET",
      url: "/auth/device-login/return",
      headers: pageHeaders,
    });
    expect(returnPage.statusCode).toBe(200);
    expect(returnPage.headers["content-security-policy"]).toContain("script-src 'nonce-");
    expect(returnPage.body).not.toContain(pageProof.json().proof);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/auth/device-login/finish",
          headers: pageHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/auth/device-login/finish",
          headers: pageHeaders,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect((await complete(proof.json())).statusCode).toBe(403);
    expect(
      (await server.inject({ method: "GET", url: "/v1/session", headers: userHeaders })).statusCode,
    ).toBe(200);
    const own = await server.inject({
      method: "GET",
      url: "/v1/workspaces/ws_server20/discovery",
      headers: userHeaders,
    });
    expect(own.json().access).toMatchObject({
      role: "user",
      canPair: false,
      canManagePlans: false,
    });
    expect(own.json().systems.map((system: { deviceId: string }) => system.deviceId)).toEqual([
      deviceId,
    ]);
    expect(
      (await server.inject({ method: "GET", url: inbox, headers: userHeaders })).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/workspaces/ws_server20/connectors/enrollments/lookup",
          headers: userHeaders,
          payload: { code },
        })
      ).statusCode,
    ).toBe(403);
    const saved = JSON.parse(
      await readFile(join(root, "joins", request.id + ".approved.json"), "utf8"),
    );
    expect(saved.singleUse).toBe(true);
    expect(Date.parse(saved.consumedAt)).toBeLessThanOrEqual(Date.parse(saved.expiresAt));
    expect(saved).not.toHaveProperty("password");
    const existingCode = "BCDEFGHJ",
      secondId = "fc_" + "d".repeat(32);
    const existing = await server.inject({
      method: "POST",
      url: "/auth/join/request",
      headers: { origin },
      payload: {
        ...input,
        mode: "existing",
        username: "alice.user",
        password: "synthetic-alice-password",
        deviceId: secondId,
        codeHash: hash(existingCode),
      },
    });
    expect(existing.statusCode).toBe(200);
    expect(existing.json().ownerUserId).toBe(alice.userId);
    expect(
      (
        await server.inject({
          method: "POST",
          url: inbox + "/decision",
          headers: adminHeaders,
          payload: { ...decision, requestId: existing.json().id, digest: existing.json().digest },
        })
      ).statusCode,
    ).toBe(200);
    const secondCredential = secondId + "." + "d".repeat(43);
    expect(
      (
        await codeRequest("redeem", {
          ...redeem,
          code: existingCode,
          deviceId: secondId,
          credentialHash: hash(secondCredential),
          pollHash: hash(secondId + "." + "q".repeat(43)),
        })
      ).statusCode,
    ).toBe(200);
    expect(
      await identities.authenticateLocalCredential({
        username: "alice.user",
        password: "synthetic-alice-password",
        now: now(),
      }),
    ).not.toBeNull();
    const all = await server.inject({
      method: "GET",
      url: "/v1/workspaces/ws_server20/discovery",
      headers: adminHeaders,
    });
    expect(all.json().access.role).toBe("admin");
    expect(all.json().systems).toHaveLength(2);
    const another = await login(input.username, input.password);
    expect(another.statusCode).toBe(202);
    const anotherProof = await server.inject({
      method: "POST",
      url: "/v1/connector/login-proof",
      headers: { authorization: "Bearer " + credential },
      payload: { version: 1, challengeId: another.json().challengeId },
    });
    await identities.provisionLocalCredential({
      username: input.username,
      password: "synthetic-changed-password",
      displayName: input.displayName,
      now: now(),
    });
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/auth/device-login/complete",
          headers: headers(another),
          payload: anotherProof.json(),
        })
      ).statusCode,
    ).toBe(401);
    await connectors.revoke(request.ownerUserId, deviceId);
    expect(
      (await server.inject({ method: "GET", url: "/v1/session", headers: userHeaders })).statusCode,
    ).toBe(401);
    expect((await login("ops.admin", "synthetic-admin-password")).statusCode).toBe(204);
    const consentCode = "FGHJKLMN",
      consentId = "fc_" + "2".repeat(32);
    const consent = await joins.request({
      ...input,
      username: "consent.user",
      deviceId: consentId,
      codeHash: hash(consentCode),
      fileActivity: true,
    });
    await joins.decide(admin.userId, {
      ...decision,
      requestId: consent.record.id,
      digest: consent.record.digest,
    });
    const interruptedFile = join(root, "joins", consent.record.id + ".json");
    const interruptedRecord = JSON.parse(await readFile(interruptedFile, "utf8"));
    await writeFile(interruptedFile, JSON.stringify({ ...interruptedRecord, status: "approving" }));
    await joins.decide(admin.userId, {
      ...decision,
      requestId: consent.record.id,
      digest: consent.record.digest,
    });
    expect(
      await identities.authenticateLocalCredential({
        username: "consent.user",
        password: input.password,
        now: now(),
      }),
    ).toMatchObject({ userId: consent.record.ownerUserId });
    const consentBody = {
      ...redeem,
      code: consentCode,
      deviceId: consentId,
      fileActivity: true,
      credentialHash: hash(consentId + "." + "s".repeat(43)),
      pollHash: hash(consentId + "." + "t".repeat(43)),
    };
    await joins.redeem(consentBody);
    await joins.redeem(consentBody);
    expect(
      (await discovery.state(consent.record.ownerUserId)).systems[0]?.policy?.policy.enabled,
    ).toBe(true);
    await expect(joins.prepare({ version: 1, code: consentCode })).rejects.toMatchObject({
      code: "join-code-consumed",
    });
    const auditFile = join(root, "joins", consent.record.id + ".approved.json"),
      auditBytes = await readFile(auditFile);
    await writeFile(
      auditFile,
      JSON.stringify({ ...JSON.parse(auditBytes.toString()), workspaceId: "ws_foreign" }),
    );
    await expect(joins.redeem(consentBody)).rejects.toMatchObject({
      code: "join-approval-invalid",
    });
    await writeFile(auditFile, auditBytes);
    const androidId = "fc_" + "8".repeat(32),
      androidCode = "KLMNPQRS";
    const androidRequest = {
      ...input,
      username: "android.user",
      platform: "android",
      deviceId: androidId,
      codeHash: hash(androidCode),
    };
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/auth/join/request",
          headers: { origin },
          payload: { ...androidRequest, fileActivity: true },
        })
      ).statusCode,
    ).toBe(400);
    const androidPending = await server.inject({
      method: "POST",
      url: "/auth/join/request",
      headers: { origin },
      payload: androidRequest,
    });
    expect(androidPending.statusCode).toBe(200);
    expect((await codeRequest("prepare", { version: 1, code: androidCode })).statusCode).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: inbox + "/decision",
          headers: adminHeaders,
          payload: {
            ...decision,
            requestId: androidPending.json().id,
            digest: androidPending.json().digest,
          },
        })
      ).statusCode,
    ).toBe(200);
    expect((await codeRequest("prepare", { version: 1, code: androidCode })).json()).toMatchObject({
      deviceId: androidId,
      platform: "android",
      fileActivity: false,
    });
    const androidCredential = androidId + "." + "a".repeat(43);
    const androidRedeem = {
      ...redeem,
      code: androidCode,
      deviceId: androidId,
      platform: "android",
      architecture: "arm64",
      name: "Android fixture",
      credentialHash: hash(androidCredential),
      pollHash: hash(androidId + "." + "b".repeat(43)),
    };
    expect((await codeRequest("redeem", { ...androidRedeem, platform: "win32" })).statusCode).toBe(
      403,
    );
    expect((await codeRequest("redeem", { ...androidRedeem, fileActivity: true })).statusCode).toBe(
      403,
    );
    expect((await codeRequest("redeem", androidRedeem)).statusCode).toBe(200);
    expect(await connectors.checkCredential(androidCredential)).toMatchObject({
      platform: "android",
      userId: androidPending.json().ownerUserId,
    });
    expect((await discovery.state(androidPending.json().ownerUserId)).systems).toHaveLength(1);
    expect(
      (
        await server.inject({
          method: "POST",
          url: "/v1/connector/heartbeat",
          headers: { authorization: "Bearer " + androidCredential },
          payload: { loginProofPort: 55124 },
        })
      ).statusCode,
    ).toBe(200);
    expect((await login("android.user", input.password)).statusCode).toBe(202);
    const collision = await joins.request({
      ...input,
      username: input.username,
      deviceId: "fc_" + "3".repeat(32),
      codeHash: hash("GHJKLMNP"),
    });
    await expect(
      joins.decide(admin.userId, {
        ...decision,
        requestId: collision.record.id,
        digest: collision.record.digest,
      }),
    ).rejects.toMatchObject({ code: "join-username-already-exists" });
    const altered = await joins.request({
      ...input,
      username: "altered.verifier",
      deviceId: "fc_" + "4".repeat(32),
      codeHash: hash("HJKLMNPQ"),
    });
    await writeFile(
      join(root, "joins", altered.record.id + ".credential.json"),
      JSON.stringify({ salt: "a".repeat(32), hash: "b".repeat(128) }),
    );
    await expect(
      joins.decide(admin.userId, {
        ...decision,
        requestId: altered.record.id,
        digest: altered.record.digest,
      }),
    ).rejects.toMatchObject({ code: "join-credential-changed" });
    await expect(joins.status(consent.record.id + "." + "z".repeat(43))).rejects.toMatchObject({
      statusCode: 401,
    });
    const linkedRoot = join(root, "linked-join");
    await symlink(
      join(root, "joins"),
      linkedRoot,
      process.platform === "win32" ? "junction" : "dir",
    );
    const unsafeJoins = new JoinRequests(
      linkedRoot,
      workspaceId,
      identities,
      connectors,
      discovery,
      administrator,
      now,
    );
    await expect(unsafeJoins.list(admin.userId)).rejects.toMatchObject({
      code: "join-storage-unavailable",
    });
    joins.rate("synthetic-rate-client", 1);
    expect(() => joins.rate("synthetic-rate-client", 1)).toThrow("join-rate-limited");
    const reject = await joins.request({
      ...input,
      username: "rejected.user",
      codeHash: hash("CDEFGHJK"),
      deviceId: "fc_" + "e".repeat(32),
    });
    await joins.decide(admin.userId, {
      ...decision,
      requestId: reject.record.id,
      digest: reject.record.digest,
      decision: "reject",
    });
    expect((await joins.status(reject.requester)).status).toBe("rejected");
    await expect(joins.prepare({ version: 1, code: "CDEFGHJK" })).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(
      await identities.authenticateLocalCredential({
        username: "rejected.user",
        password: input.password,
        now: now(),
      }),
    ).toBeNull();
    await expect(joins.status("jr_" + "f".repeat(32) + "." + "q".repeat(43))).rejects.toMatchObject(
      { statusCode: 401 },
    );
    const changedAccount = await joins.request({
      ...input,
      mode: "existing",
      username: "alice.user",
      password: "synthetic-alice-password",
      codeHash: hash("DEFGHJKL"),
      deviceId: "fc_" + "f".repeat(32),
    });
    await identities.provisionLocalCredential({
      username: "alice.user",
      password: "synthetic-rotated-alice-password",
      displayName: "Alice",
      now: now(),
    });
    await expect(
      joins.decide(admin.userId, {
        ...decision,
        requestId: changedAccount.record.id,
        digest: changedAccount.record.digest,
      }),
    ).rejects.toMatchObject({ code: "join-account-changed" });
    const revoked = await joins.request({
      ...input,
      username: "revoked.approver",
      codeHash: hash("EFGHJKLM"),
      deviceId: "fc_" + "1".repeat(32),
    });
    await joins.decide(admin.userId, {
      ...decision,
      requestId: revoked.record.id,
      digest: revoked.record.digest,
    });
    policy.administrators.splice(0);
    await expect(joins.prepare({ version: 1, code: "EFGHJKLM" })).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(joins.list(admin.userId)).rejects.toMatchObject({ statusCode: 403 });
    policy.administrators.push(admin.userId);
    const registeredId = "fc_" + "5".repeat(32),
      registeredCredential = registeredId + "." + "r".repeat(43);
    const startRegistration = await server.inject({
      method: "POST",
      url: "/v1/connector/enrollment/start",
      headers: { origin },
      payload: {
        version: 1,
        deviceId: registeredId,
        name: "Administrator assigned computer",
        platform: "win32",
        architecture: "x64",
        fileActivity: false,
        credentialHash: hash(registeredCredential),
        pollHash: hash(registeredId + "." + "s".repeat(43)),
        codeHash: hash("JKLMNPQR"),
      },
    });
    expect(startRegistration.statusCode).toBe(200);
    const enrollments = "/v1/workspaces/ws_server20/connectors/enrollments";
    const lookup = await server.inject({
      method: "POST",
      url: enrollments + "/lookup",
      headers: adminHeaders,
      payload: { code: "JKLMNPQR" },
    });
    expect(lookup.statusCode).toBe(200);
    const assigned = {
      version: 1,
      digest: lookup.json().digest,
      decision: "approve",
      ownerUserId: alice.userId,
    };
    const decideUrl = enrollments + "/" + lookup.json().enrollmentId + "/decision";
    expect(
      (
        await server.inject({
          method: "POST",
          url: decideUrl,
          headers: adminHeaders,
          payload: { ...assigned, ownerUserId: "usr_unknown" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await server.inject({
          method: "POST",
          url: decideUrl,
          headers: adminHeaders,
          payload: assigned,
        })
      ).statusCode,
    ).toBe(200);
    expect(await connectors.checkCredential(registeredCredential)).toMatchObject({
      userId: alice.userId,
    });
    const owners = await server.inject({
      method: "GET",
      url: "/v1/workspaces/ws_server20/connectors/enrollment-owners",
      headers: adminHeaders,
    });
    expect(owners.statusCode).toBe(200);
    expect(owners.json().some((owner: { userId: string }) => owner.userId === alice.userId)).toBe(
      true,
    );
    timestamp += 900001;
    expect(() => joins.rate("synthetic-rate-client", 1)).not.toThrow();
    expect((await codeRequest("prepare", { version: 1, code })).statusCode).toBe(403);
  } finally {
    await server?.close();
    connectors?.close();
    await pool?.end();
    await database.end();
    await container.stop();
    await rm(root, { recursive: true, force: true });
  }
}, 120000);
