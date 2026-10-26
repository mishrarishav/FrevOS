import { expect, it } from "vitest";
import {
  ConnectorSchema,
  PairConnectorSchema,
  SystemEnrollmentStartSchema,
  SystemEnrollmentPreviewSchema,
} from "../src/index.js";

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
