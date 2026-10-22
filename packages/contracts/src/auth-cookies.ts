export function authCookiePolicy(protocol: string) {
  if (protocol === "https:") {
    return {
      session: "__Host-frevos-session",
      csrf: "__Host-frevos-csrf",
      secure: true,
    } as const;
  }
  if (protocol === "http:") {
    return {
      session: "frevos-internal-session",
      csrf: "frevos-internal-csrf",
      secure: false,
    } as const;
  }
  throw new Error("Unsupported authentication transport");
}

export type AuthCookiePolicy = ReturnType<typeof authCookiePolicy>;
