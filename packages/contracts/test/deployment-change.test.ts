import { expect, it } from "vitest";
import {
  DeploymentChangeSchema,
  ServixDeployRequestSchema,
  ServixRestoreRequestSchema,
} from "../src/index.js";

it("requires bounded readable change context, retains Unicode and multiline changes, and rejects control characters", () => {
  expect(
    DeploymentChangeSchema.parse({
      message: "  Fix badge\nसुधार  ",
      approvedBy: "  Owner / CHG-42  ",
    }),
  ).toEqual({ message: "Fix badge\nसुधार", approvedBy: "Owner / CHG-42" });
  for (const details of [
    { message: "  ", approvedBy: "Owner" },
    { message: "abc\0", approvedBy: "Owner" },
    { message: "abc", approvedBy: "Owner\nOther" },
    { message: "a".repeat(2001), approvedBy: "Owner" },
    { message: "abc", approvedBy: "a".repeat(161) },
    { message: "abc", approvedBy: "Owner", extra: true },
  ])
    expect(DeploymentChangeSchema.safeParse(details).success).toBe(false);
  expect(
    DeploymentChangeSchema.safeParse({ message: "a".repeat(2000), approvedBy: "a".repeat(160) })
      .success,
  ).toBe(true);
  const request = {
    version: 1,
    requestId: "sd_" + "a".repeat(32),
    confirmation: "deploy-servix-development",
  };
  expect(ServixDeployRequestSchema.safeParse(request).success).toBe(false);
  const changeDetails = { message: "Fix badge", approvedBy: "Owner" };
  expect(ServixDeployRequestSchema.safeParse({ ...request, changeDetails }).success).toBe(true);
  const restore = {
    ...request,
    confirmation: "restore-servix-development",
    expectedCurrentRequestId: request.requestId,
    restoreRequestId: "sd_" + "b".repeat(32),
    operation: "rollback",
  };
  expect(ServixRestoreRequestSchema.safeParse(restore).success).toBe(false);
  expect(ServixRestoreRequestSchema.safeParse({ ...restore, changeDetails }).success).toBe(true);
});
