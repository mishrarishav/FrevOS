import { describe, expect, it } from "vitest";
import { ReviewLinkPolicySchema, ReviewRegisterConfigSchema } from "../src/index.js";

const legacyPolicy = {
  allowedOrigins: ["https://application.example.invalid"],
  allowedPathPrefixes: ["/"],
  allowPrivate: false,
  timeoutMs: 5000,
  maxBytes: 65536,
  maxRedirects: 3,
};

describe("Review link policy compatibility", () => {
  it("reads an existing anonymous policy without silently enabling session-cookie handling", () => {
    const parsed = ReviewLinkPolicySchema.parse(legacyPolicy);
    expect(parsed).toEqual(legacyPolicy);
    expect(Object.hasOwn(parsed, "allowSessionCookies")).toBe(false);
    expect(parsed.allowSessionCookies).toBeUndefined();
    expect(ReviewLinkPolicySchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(legacyPolicy);
  });

  it.each([false, true])("retains the explicit boolean session-cookie choice %s", (choice) => {
    const config = ReviewRegisterConfigSchema.parse({
      name: "Application reviews",
      description: "",
      fields: [],
      managementOptions: ["Internal", "Partner"],
      lifecycleOptions: ["Active"],
      requirementOptions: ["Required"],
      decisionOptions: ["Review"],
      linkPolicy: { ...legacyPolicy, allowSessionCookies: choice },
    });
    expect(config.linkPolicy.allowSessionCookies).toBe(choice);
    expect(ReviewRegisterConfigSchema.parse(JSON.parse(JSON.stringify(config)))).toEqual(config);
  });

  it.each(["true", "false", 1, 0, null, {}])(
    "rejects a non-boolean session-cookie policy choice",
    (choice) => {
      expect(() =>
        ReviewLinkPolicySchema.parse({ ...legacyPolicy, allowSessionCookies: choice }),
      ).toThrow();
    },
  );

  it("permits a bounded 128-origin policy and rejects a 129th destination", () => {
    const allowedOrigins = Array.from(
      { length: 128 },
      (_, index) => `https://app${index}.example.invalid`,
    );
    const parsed = ReviewLinkPolicySchema.parse({ ...legacyPolicy, allowedOrigins });
    expect(parsed.allowedOrigins).toHaveLength(128);
    expect(() =>
      ReviewLinkPolicySchema.parse({
        ...legacyPolicy,
        allowedOrigins: [...allowedOrigins, "http://additional.example.invalid"],
      }),
    ).toThrow();
  });
});
