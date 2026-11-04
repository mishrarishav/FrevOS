import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  ConnectorConnectionStatusSchema,
  WorkspaceMembershipSchema,
  WorkspaceSchema,
} from "@frevos/contracts";
import { expect, it } from "vitest";
import { buildBrowserEntry } from "../src/browser-entry.js";
import { DeveloperConnectorStore } from "../src/developer-connectors.js";
import type {
  IdentitySessionRepository,
  WorkspaceEvidence,
  WorkspaceRepository,
} from "../src/repositories.js";
import { buildServer } from "../src/server.js";
import { ServixDeploymentError } from "../src/servix-deployment.js";

async function fixture(kind: "legacy-project" | "profiled-project" | "system") {
  const root = await mkdtemp(join(tmpdir(), "devsetu-connection-status-"));
  let instant = Date.now(),
    permitted = true,
    sourcePermitted = true;
  const now = () => new Date(instant);
  type Configured = NonNullable<ConstructorParameters<typeof DeveloperConnectorStore>[7]>;
  const configured: Configured = {
    authorizeSource: async () => {
      if (!sourcePermitted) throw new ServixDeploymentError("source-permission-removed", 403);
    },
    connectorProfile: async (id) =>
      id === "fixture-project"
        ? ({ profileId: id } as Awaited<ReturnType<Configured["connectorProfile"]>>)
        : undefined,
    git: async () => {
      throw Error("Git execution is outside this read-only fixture");
    },
  };
  const connectors = new DeveloperConnectorStore(
    join(root, "connectors"),
    async () => permitted,
    {
      head: async () => "a".repeat(40),
      importBundle: async () => {
        throw Error("Git is not permitted");
      },
    },
    async () => {
      throw Error("Account creation is not permitted");
    },
    now,
    undefined,
    undefined,
    configured,
    undefined,
    false,
    "http://canonical.fixture",
  );
  const device = await connectors.pair("usr_fixture", {
    version: 1,
    name: "Paired fixture",
    ...(kind === "system" ? { mode: "system" as const } : {}),
  });
  if (kind !== "system") {
    const file = join(connectors.root, device.deviceId + ".json"),
      record = JSON.parse(await readFile(file, "utf8"));
    if (kind === "legacy-project") delete record.profileId;
    else record.profileId = "fixture-project";
    await writeFile(file, JSON.stringify(record));
  }
  const workspace = WorkspaceSchema.parse({
    workspaceId: "ws_server20",
    displayName: "Fixture",
    status: "active",
    createdAt: now().toISOString(),
  });
  const membership = WorkspaceMembershipSchema.parse({
    membershipId: "wsm_fixture",
    workspaceId: workspace.workspaceId,
    userId: "usr_fixture",
    status: "active",
    grantedScopes: ["project:write"],
    createdAt: now().toISOString(),
  });
  let evidence: WorkspaceEvidence | null = { workspace, membership };
  const workspaces = {
    getEvidence: async (id: string, actor: string) => {
      expect(id).toBe("ws_server20");
      expect(actor).toBe("usr_fixture");
      return evidence;
    },
  } as unknown as WorkspaceRepository;
  const common = {
    authMode: "local" as const,
    publicOrigin: "http://127.0.0.1:34001",
    identitySessions: {} as IdentitySessionRepository,
    workspaces,
    developerConnectors: connectors,
    now,
  };
  const privateServer = await buildServer(common);
  await writeFile(join(root, "index.html"), "<!doctype html><title>Fixture</title>");
  await writeFile(
    join(root, "browser-entry.json"),
    JSON.stringify({ version: 1, basePath: "/workspace", connectorTransport: 1 }),
  );
  const publicServer = await buildBrowserEntry(
    common,
    {
      version: 1,
      publicOrigin: "https://public.fixture",
      basePath: "/workspace",
      connectorTransport: true,
      proxyHosts: ["entry-upstream"],
      listen: { host: "127.0.0.1", port: 34002 },
    },
    root,
  );
  const request = (credential = device.credential, body: Record<string, unknown> = {}) =>
    privateServer.inject({
      method: "POST",
      url: "/v1/connector/connection-status",
      headers: { authorization: "Bearer " + credential },
      payload: body,
    });
  const snapshot = async () =>
    Object.fromEntries(
      await Promise.all(
        (await readdir(connectors.root)).map(async (name) => [
          name,
          createHash("sha256")
            .update(await readFile(join(connectors.root, name)))
            .digest("hex"),
        ]),
      ),
    );
  return {
    root,
    connectors,
    device,
    privateServer,
    publicServer,
    request,
    snapshot,
    workspace,
    membership,
    setEvidence: (value: WorkspaceEvidence | null) => {
      evidence = value;
    },
    denyOwner: () => {
      permitted = false;
    },
    denySource: () => {
      sourcePermitted = false;
    },
    expire: () => {
      instant += 91 * 86400000;
    },
    close: async () => {
      await publicServer.close();
      await privateServer.close();
      connectors.close();
      if (
        dirname(resolve(root)) !== resolve(tmpdir()) ||
        !root.includes("devsetu-connection-status-")
      )
        throw Error("Fixture cleanup scope differs");
      await rm(root, { recursive: true, force: true });
    },
  };
}

it.each(["legacy-project", "profiled-project", "system"] as const)(
  "reports retained %s identity at both entries without heartbeat, jobs or credential disclosure",
  async (kind) => {
    const f = await fixture(kind);
    try {
      const before = await f.snapshot(),
        response = await f.request();
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.headers["set-cookie"]).toBeUndefined();
      const value = ConnectorConnectionStatusSchema.parse(response.json());
      expect(value).toEqual({
        deviceId: f.device.deviceId,
        actor: "usr_fixture",
        workspaceId: "ws_server20",
        profileId: kind === "profiled-project" ? "fixture-project" : null,
        mode: kind === "system" ? "system" : "project",
        ready: true,
        discoveryIdentityOrigin: "http://canonical.fixture",
      });
      expect(response.body).not.toContain(f.device.credential);
      expect(response.body).not.toContain("credentialHash");
      expect(Object.keys(value).sort()).toEqual([
        "actor",
        "deviceId",
        "discoveryIdentityOrigin",
        "mode",
        "profileId",
        "ready",
        "workspaceId",
      ]);
      const external = await f.publicServer.inject({
        method: "POST",
        url: "/workspace/v1/connector/connection-status",
        headers: { host: "127.0.0.1:34002", authorization: "Bearer " + f.device.credential },
        payload: {},
      });
      expect(external.statusCode).toBe(200);
      expect(external.json()).toEqual(value);
      expect(await f.snapshot()).toEqual(before);
      expect((await f.connectors.list("usr_fixture"))[0]?.online).toBe(false);
    } finally {
      await f.close();
    }
  },
);

it("rejects malformed/revoked/expired credentials and fresh workspace or owner authorization changes", async () => {
  const f = await fixture("legacy-project");
  try {
    const before = await f.snapshot();
    expect(
      (
        await f.privateServer.inject({
          method: "POST",
          url: "/v1/connector/connection-status",
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
    expect((await f.request("not-a-credential")).statusCode).toBe(401);
    expect((await f.request("fc_" + "f".repeat(32) + "." + "b".repeat(43))).statusCode).toBe(401);
    expect((await f.request(undefined, { command: "unsupported" })).statusCode).toBe(400);
    for (const evidence of [
      null,
      { workspace: { ...f.workspace, workspaceId: "ws_other" }, membership: f.membership },
      { workspace: { ...f.workspace, status: "archived" }, membership: f.membership },
      { workspace: f.workspace, membership: null },
      { workspace: f.workspace, membership: { ...f.membership, status: "revoked" } },
      { workspace: f.workspace, membership: { ...f.membership, userId: "usr_other" } },
    ]) {
      f.setEvidence(evidence as WorkspaceEvidence | null);
      expect((await f.request()).statusCode).toBe(403);
    }
    f.setEvidence({ workspace: f.workspace, membership: f.membership });
    expect((await f.request()).statusCode).toBe(200);
    expect(await f.snapshot()).toEqual(before);
    await f.connectors.revoke("usr_fixture", f.device.deviceId);
    const revoked = await f.snapshot();
    expect((await f.request()).statusCode).toBe(401);
    expect(await f.snapshot()).toEqual(revoked);
  } finally {
    await f.close();
  }
  const expired = await fixture("system");
  try {
    expired.expire();
    expect((await expired.request()).statusCode).toBe(401);
  } finally {
    await expired.close();
  }
  const monitoring = await fixture("system");
  try {
    monitoring.setEvidence({
      workspace: monitoring.workspace,
      membership: { ...monitoring.membership, grantedScopes: ["project:read"] },
    } as WorkspaceEvidence);
    // Retained connector permission remains the authority; the read-only status
    // adds no project-write requirement to a system-only monitoring account.
    expect((await monitoring.request()).statusCode).toBe(200);
  } finally {
    await monitoring.close();
  }
  const sourceDenied = await fixture("profiled-project");
  try {
    sourceDenied.denySource();
    expect((await sourceDenied.request()).statusCode).toBe(403);
  } finally {
    await sourceDenied.close();
  }
  const denied = await fixture("system");
  try {
    denied.denyOwner();
    expect((await denied.request()).statusCode).toBe(403);
  } finally {
    await denied.close();
  }
});
