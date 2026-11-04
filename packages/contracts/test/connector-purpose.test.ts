import { expect, it } from "vitest";
import {
  ConnectorSchema,
  PairConnectorSchema,
  SystemEnrollmentStartSchema,
  SystemEnrollmentPreviewSchema,
  DiscoveryIdentityOriginSchema,
  ConnectorConnectionStatusSchema,
} from "../src/index.js";

it("accepts only canonical HTTP(S) origins as retained discovery namespaces", () => {
  for (const origin of [
    "http://private.fixture",
    "https://public.fixture",
    "https://public.fixture:8443",
    "http://10.9.69.20",
    "https://[::1]:8443",
  ])
    expect(DiscoveryIdentityOriginSchema.parse(origin)).toBe(origin);
  for (const origin of [
    "not a URL",
    "",
    "file:///fixture",
    "ftp://fixture.example",
    "https://user:password@public.fixture",
    "https://public.fixture/",
    "https://public.fixture/devsetu",
    "https://public.fixture?query=value",
    "https://public.fixture#fragment",
    "https://public.fixture:443",
    "http://private.fixture:80",
    "https://PUBLIC.fixture",
    "HTTPS://public.fixture",
    " https://public.fixture",
    "https://" + "a".repeat(2050) + ".fixture",
  ])
    expect(DiscoveryIdentityOriginSchema.safeParse(origin).success).toBe(false);
});

it("keeps connection status metadata strict, pairing-specific and free of credentials", () => {
  const status = {
    deviceId: `fc_${"a".repeat(32)}`,
    actor: "usr_fixture",
    workspaceId: "ws_fixture",
    profileId: null,
    mode: "system",
    ready: true,
  };
  expect(ConnectorConnectionStatusSchema.parse(status)).toEqual(status);
  const project = { ...status, mode: "project", profileId: "fixture-project" };
  expect(ConnectorConnectionStatusSchema.parse(project)).toEqual(project);
  const canonical = { ...project, discoveryIdentityOrigin: "http://private.fixture" };
  expect(ConnectorConnectionStatusSchema.parse(canonical)).toEqual(canonical);
  for (const patch of [
    { credential: "forbidden" },
    { credentialHash: "a".repeat(64) },
    { password: "forbidden" },
    { command: "forbidden" },
    { mode: "executor" },
    { ready: false },
    { deviceId: "unpaired" },
    { actor: "" },
    { workspaceId: "" },
    { profileId: "../outside" },
    { discoveryIdentityOrigin: "https://public.fixture/devsetu" },
  ])
    expect(ConnectorConnectionStatusSchema.safeParse({ ...status, ...patch }).success).toBe(false);
  for (const field of Object.keys(status)) {
    const incomplete = { ...status };
    Reflect.deleteProperty(incomplete, field);
    expect(ConnectorConnectionStatusSchema.safeParse(incomplete).success).toBe(false);
  }
});

it("accepts an unassigned computer and rejects every project capability in a system credential", () => {
  const id = `fc_${"a".repeat(32)}`;
  const record = {
    version: 1,
    deviceId: id,
    userId: "usr_fixture",
    workspaceId: "ws_server20",
    name: "Laptop",
    status: "active",
    createdAt: "2026-10-25T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    lastSeenAt: null,
    online: false,
  };
  const system = { ...record, mode: "system" };
  expect(ConnectorSchema.parse(system)).not.toHaveProperty("repositoryId");
  expect(
    PairConnectorSchema.parse({ version: 1, name: "Laptop", mode: "system" }),
  ).not.toHaveProperty("profileId");
  const repositoryId = `gitrepo_${"b".repeat(32)}`;
  const source = {
    version: 1,
    profileId: "fixture-project",
    repository: "D:\\fixture",
    origin: "https://example.com/team/project.git",
    repositoryId,
    remoteName: "origin",
    head: "c".repeat(40),
    branch: "feature/fixture",
    checkedAt: "2026-10-25T00:00:00.000Z",
  };
  for (const forbidden of [
    { repositoryId },
    { profileId: "fixture-project" },
    { source },
    {
      folderSelection: {
        version: 1,
        requestId: `fp_${"d".repeat(32)}`,
        deviceId: id,
        profileId: "fixture-project",
        expiresAt: record.expiresAt,
        status: "queued",
      },
    },
    { folderPicker: true },
    { folderBrowser: true },
    { changeNotes: true },
  ]) {
    expect(ConnectorSchema.safeParse({ ...system, ...forbidden }).success).toBe(false);
  }
  expect(ConnectorSchema.safeParse(record).success).toBe(false);
  expect(ConnectorSchema.parse({ ...record, repositoryId })).toMatchObject({ repositoryId });
  expect(
    ConnectorSchema.parse({
      ...system,
      folderPicker: false,
      folderBrowser: false,
      changeNotes: false,
    }),
  ).toMatchObject({ mode: "system" });
});
it("keeps passwordless proposals hash-only and browser previews free of credential material", () => {
  const input = {
    version: 1,
    deviceId: `fc_${"a".repeat(32)}`,
    name: "Computer",
    platform: "win32",
    architecture: "x64",
    fileActivity: false,
    credentialHash: "a".repeat(64),
    pollHash: "b".repeat(64),
    codeHash: "c".repeat(64),
  };
  expect(SystemEnrollmentStartSchema.parse(input)).toEqual(input);
  for (const field of [
    { password: "forbidden" },
    { credential: "forbidden" },
    { profileId: "servix-development" },
    { workspaceId: "ws_other" },
    { command: "forbidden" },
  ])
    expect(SystemEnrollmentStartSchema.safeParse({ ...input, ...field }).success).toBe(false);
  expect(
    SystemEnrollmentPreviewSchema.safeParse({
      ...input,
      enrollmentId: `ep_${"d".repeat(32)}`,
      expiresAt: "2026-10-25T12:00:00.000Z",
      status: "pending",
      digest: "e".repeat(64),
    }).success,
  ).toBe(false);
});
