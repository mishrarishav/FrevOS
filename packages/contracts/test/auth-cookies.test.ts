import { describe, expect, it } from "vitest";
import { authCookiePolicy } from "../src/auth-cookies.js";

describe("authentication transport cookies", () => {
  it("keeps HTTP and HTTPS cookies separate", () => {
    expect(authCookiePolicy("https:")).toEqual({
      session: "__Host-frevos-session",
      csrf: "__Host-frevos-csrf",
      secure: true,
    });
    expect(authCookiePolicy("http:")).toEqual({
      session: "frevos-internal-session",
      csrf: "frevos-internal-csrf",
      secure: false,
    });
  });
  it("rejects unrelated protocols", () => {
    expect(() => authCookiePolicy("file:")).toThrow("Unsupported authentication transport");
  });
  it("separates application cookies on a shared gateway without changing legacy cookies", () => {
    expect(authCookiePolicy("https:", "workspace")).toEqual({
      session: "__Host-frevos-workspace-session",
      csrf: "__Host-frevos-workspace-csrf",
      secure: true,
    });
    expect(authCookiePolicy("http:", "workspace").csrf).toBe("frevos-internal-workspace-csrf");
    for (const namespace of ["", "A", "../app", "app;secure", "a".repeat(65)])
      expect(() => authCookiePolicy("https:", namespace)).toThrow(
        "Invalid authentication cookie namespace",
      );
  });
});
