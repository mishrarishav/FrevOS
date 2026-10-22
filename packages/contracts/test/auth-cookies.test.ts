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
});
