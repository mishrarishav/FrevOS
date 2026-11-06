import { isIP } from "node:net";

const integer = (value, min, max) => /^\d+$/.test(value) && +value >= min && +value <= max;
export function parseWafEnvironment(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    const key = line.slice(0, at);
    if (at < 1 || key in values || !/^FREVOS_WAF_[A-Z_]+$/.test(key))
      throw Error("Invalid WAF configuration key");
    values[key] = line.slice(at + 1).trim();
  }
  const tests = {
    IMAGE: (v) => /^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/.test(v),
    NETWORK: (v) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(v),
    BIND: (v) => isIP(v) === 4,
    PORT: (v) => integer(v, 1024, 65535),
    UPSTREAM: (v) => {
      if (!/^https?:\/\/[a-zA-Z0-9.-]+:[0-9]+$/.test(v)) return false;
      const u = new URL(v);
      return !!u.port && integer(u.port, 1, 65535);
    },
    BASE_PATH: (v) => v === "" || /^(?:\/[a-zA-Z0-9_-]+){1,8}$/.test(v),
    MODE: (v) => ["On", "Off", "DetectionOnly"].includes(v),
    PARANOIA: (v) => integer(v, 1, 4),
    INBOUND_SCORE: (v) => integer(v, 1, 100),
    BODY_LIMIT: (v) => integer(v, 1024, 536870912),
    NOFILES_LIMIT: (v) => integer(v, 1024, 33554432),
    TRANSPORT_LIMIT: (v) => integer(v, 1048576, 536870912),
    TRUSTED_PROXIES: (v) => {
      const cidrs = v.split(" ");
      return (
        cidrs.length <= 16 &&
        cidrs.every((cidr) => {
          const [ip, bits, extra] = cidr.split("/");
          const family = isIP(ip);
          return !extra && !!family && integer(bits ?? "", 1, family === 4 ? 32 : 128);
        })
      );
    },
  };
  if (Object.keys(values).length !== Object.keys(tests).length)
    throw Error("Incomplete WAF configuration");
  for (const [name, check] of Object.entries(tests)) {
    if (!check(values[`FREVOS_WAF_${name}`] ?? "")) throw Error(`Invalid WAF setting: ${name}`);
  }
  if (
    +values.FREVOS_WAF_NOFILES_LIMIT > +values.FREVOS_WAF_BODY_LIMIT ||
    +values.FREVOS_WAF_BODY_LIMIT > +values.FREVOS_WAF_TRANSPORT_LIMIT
  )
    throw Error("WAF body limits conflict");
  return values;
}
