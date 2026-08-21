import { describe, expect, it } from "vitest";
import {
  consumeDummyPasswordCheck,
  hashLocalPassword,
  LocalUsernameSchema,
  verifyLocalPassword,
} from "../src/passwords.js";

describe("local credential protection", () => {
  it("normalizes bounded usernames and rejects unsafe forms", () => {
    expect(LocalUsernameSchema.parse("  Personal.Admin  ")).toBe("personal.admin");
    expect(() => LocalUsernameSchema.parse("ab")).toThrow();
    expect(() => LocalUsernameSchema.parse("admin@example.com")).toThrow();
  });

  it("stores salted scrypt digests and compares them safely", async () => {
    const first = await hashLocalPassword("personal-password");
    const second = await hashLocalPassword("personal-password");
    expect(first.salt).toHaveLength(16);
    expect(first.hash).toHaveLength(64);
    expect(first.hash).not.toEqual(second.hash);
    await expect(verifyLocalPassword("personal-password", first.salt, first.hash)).resolves.toBe(
      true,
    );
    await expect(verifyLocalPassword("wrong-password", first.salt, first.hash)).resolves.toBe(
      false,
    );
    await expect(consumeDummyPasswordCheck("unknown-user-password")).resolves.toBeUndefined();
  });
});
