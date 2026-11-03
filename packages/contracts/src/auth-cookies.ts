export function authCookiePolicy(protocol: string, namespace?: string) {
  if (namespace !== undefined && !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(namespace))
    throw new Error("Invalid authentication cookie namespace");
  const scope = namespace ? `-${namespace}` : "";
  if (protocol === "https:") {
    return {
      session: `__Host-frevos${scope}-session`,
      csrf: `__Host-frevos${scope}-csrf`,
      secure: true,
    } as const;
  }
  if (protocol === "http:") {
    return {
      session: `frevos-internal${scope}-session`,
      csrf: `frevos-internal${scope}-csrf`,
      secure: false,
    } as const;
  }
  throw new Error("Unsupported authentication transport");
}

export type AuthCookiePolicy = ReturnType<typeof authCookiePolicy>;
