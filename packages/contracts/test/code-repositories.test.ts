import { expect, it } from "vitest";
import {
  CodeAccessInputSchema,
  CodeQuerySchema,
  CodeRepositoryIdSchema,
} from "../src/code-repositories.js";

it("rejects filesystem traversal, alternate streams, unknown fields and unsafe Git refs", () => {
  for (const path of [
    "../private",
    "a/../b",
    "C:/Windows",
    "//server/share",
    "a\\b",
    ".git/config",
    "a\0b",
  ])
    expect(CodeQuerySchema.safeParse({ path }).success).toBe(false);
  expect(
    CodeQuerySchema.parse({ branch: "feature/example", path: "src/नमस्ते.ts", page: "2" }).page,
  ).toBe(2);
  expect(CodeQuerySchema.parse({})).toEqual({ path: "", page: 0 });
  expect(CodeQuerySchema.safeParse({ branch: "--upload-pack=other" }).success).toBe(false);
  expect(CodeQuerySchema.safeParse({ path: "src", directory: "D:\\" }).success).toBe(false);
  expect(CodeRepositoryIdSchema.safeParse("../other").success).toBe(false);
  expect(
    CodeAccessInputSchema.safeParse({
      version: 1,
      expectedRevision: 0,
      userId: "usr_test",
      allow: true,
      role: "administrator",
    }).success,
  ).toBe(false);
});
