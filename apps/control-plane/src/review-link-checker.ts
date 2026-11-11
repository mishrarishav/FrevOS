import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { performance } from "node:perf_hooks";
import { checkServerIdentity, TLSSocket, type PeerCertificate } from "node:tls";
import { publicModelAddress } from "./model-gateway.js";

export type ReviewCheckEndpoint = {
  id: string;
  label: string;
  url: string;
  expectedText: string;
  expectedStatuses: number[];
};
export type ReviewCheckPolicy = {
  allowedOrigins: string[];
  allowedPathPrefixes?: string[];
  allowPrivate: boolean;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  allowSessionCookies?: boolean | undefined;
};
export type ReviewLinkCheck = {
  status:
    | "healthy"
    | "http-error"
    | "soft-404"
    | "wrong-page"
    | "auth-required"
    | "redirect"
    | "unreachable"
    | "tls-error"
    | "blocked"
    | "unknown";
  httpStatus: number | null;
  finalUrl: string | null;
  message: string;
  title: string | null;
  elapsedMs: number;
  checkedAt: string;
  tls?: ReviewTlsObservation[] | undefined;
};
export type ReviewTlsObservation = {
  url: string;
  hostname: string;
  port: number;
  verification: "verified" | "failed" | "unavailable";
  validFrom: string | null;
  validTo: string | null;
  subject: string | null;
  issuer: string | null;
  fingerprint256: string | null;
  errorCode: string | null;
  observedAt: string;
};
type Address = { address: string; family: number };
type Inspection = "complete" | "truncated" | "encoded";
type AnonymousCookie = {
  name: string;
  value: string;
  path: string;
  secure: boolean;
  expires: number | null;
};
class AnonymousSession {
  private readonly cookies = new Map<string, AnonymousCookie>();
  constructor(private readonly origin: string) {}
  private expire() {
    for (const [key, cookie] of this.cookies)
      if (cookie.expires !== null && cookie.expires <= Date.now()) this.cookies.delete(key);
  }
  header(url: URL): string {
    if (url.origin !== this.origin) return "";
    this.expire();
    return [...this.cookies.values()]
      .filter(
        (cookie) =>
          (!cookie.secure || url.protocol === "https:") &&
          (url.pathname === cookie.path ||
            url.pathname.startsWith(cookie.path.endsWith("/") ? cookie.path : cookie.path + "/")),
      )
      .sort((a, b) => b.path.length - a.path.length)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
  }
  receive(url: URL, headers: string[]) {
    if (url.origin !== this.origin) return;
    if (headers.reduce((total, value) => total + value.length, 0) > 8192)
      throw new CheckFailure(
        "unknown",
        "The response exceeded the bounded anonymous session-cookie limit.",
      );
    this.expire();
    for (const header of headers) {
      if (header.length > 4096) continue;
      const pieces = header.split(";"),
        pair = pieces.shift() ?? "",
        separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim(),
        value = pair.slice(separator + 1).trim();
      if (
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
        !/^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/.test(value)
      )
        continue;
      let path = url.pathname.slice(0, url.pathname.lastIndexOf("/")) || "/",
        secure = false,
        expires: number | null = null,
        domainValid = true,
        hasDomain = false;
      let maxAge: number | undefined;
      for (const piece of pieces) {
        const split = piece.indexOf("="),
          key = (split < 0 ? piece : piece.slice(0, split)).trim().toLowerCase(),
          attribute = split < 0 ? "" : piece.slice(split + 1).trim();
        if (key === "secure") secure = true;
        else if (key === "domain") {
          hasDomain = true;
          domainValid = attribute.replace(/^\./, "").toLowerCase() === url.hostname.toLowerCase();
        } else if (
          key === "path" &&
          attribute.startsWith("/") &&
          /^[\x21-\x3a\x3c-\x7e]+$/.test(attribute)
        )
          path = attribute;
        else if (key === "max-age" && /^-?\d{1,10}$/.test(attribute)) maxAge = Number(attribute);
        else if (key === "expires") {
          const stamp = Date.parse(attribute);
          if (Number.isFinite(stamp)) expires = stamp;
        }
      }
      if (!domainValid || (secure && url.protocol !== "https:")) continue;
      if (name.startsWith("__Secure-") && !secure) continue;
      if (name.startsWith("__Host-") && (!secure || hasDomain || path !== "/")) continue;
      if (maxAge !== undefined) expires = maxAge <= 0 ? 0 : Date.now() + maxAge * 1000;
      const identity = name + "\n" + path;
      if (expires !== null && expires <= Date.now()) this.cookies.delete(identity);
      else this.cookies.set(identity, { name, value, path, secure, expires });
      if (
        this.cookies.size > 16 ||
        [...this.cookies.values()].reduce(
          (total, cookie) =>
            total + cookie.name.length + cookie.value.length + cookie.path.length + 4,
          0,
        ) > 8192
      )
        throw new CheckFailure(
          "unknown",
          "The response exceeded the bounded anonymous session-cookie limit.",
        );
    }
  }
}
const privateAddresses = new BlockList();
privateAddresses.addSubnet("10.0.0.0", 8, "ipv4");
privateAddresses.addSubnet("172.16.0.0", 12, "ipv4");
privateAddresses.addSubnet("192.168.0.0", 16, "ipv4");
privateAddresses.addSubnet("fc00::", 7, "ipv6");
const loopback = new BlockList();
loopback.addSubnet("127.0.0.0", 8, "ipv4");
loopback.addAddress("::1", "ipv6");
class CheckFailure extends Error {
  constructor(
    readonly status: ReviewLinkCheck["status"],
    message: string,
  ) {
    super(message);
  }
}
const safeUrl = (url: URL) => url.origin + url.pathname;
const certificateText = (value: unknown): string | null => {
  const text =
    typeof value === "string"
      ? value
          .replace(/[\r\n\t]/g, " ")
          .trim()
          .slice(0, 500)
      : "";
  return text || null;
};
function certificateName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const fields = value as Record<string, unknown>;
  return certificateText(
    ["CN", "O", "OU", "C"]
      .flatMap((key) => {
        const text = certificateText(fields[key]);
        return text ? [`${key}=${text}`] : [];
      })
      .join(", "),
  );
}
function certificateDate(value: unknown): string | null {
  const date = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(date) ? new Date(date).toISOString() : null;
}
function certificateFields(
  observation: ReviewTlsObservation,
  certificate: PeerCertificate | undefined,
) {
  if (!certificate?.fingerprint256) return;
  observation.validFrom = certificateDate(certificate.valid_from);
  observation.validTo = certificateDate(certificate.valid_to);
  observation.subject = certificateName(certificate.subject);
  observation.issuer = certificateName(certificate.issuer);
  observation.fingerprint256 = certificate.fingerprint256.slice(0, 200);
}
function tlsFailure(observation: ReviewTlsObservation | undefined, error: unknown) {
  if (!observation || observation.verification === "verified") return;
  const code = (error as NodeJS.ErrnoException)?.code;
  observation.errorCode =
    typeof code === "string" ? code.slice(0, 240) : "TLS_OBSERVATION_UNAVAILABLE";
  if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|^EPROTO$/.test(observation.errorCode))
    observation.verification = "failed";
}
function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d{1,6}|#x[\da-f]{1,6});/gi, (entity) => {
    const names: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
      "&nbsp;": " ",
    };
    const named = names[entity.toLowerCase()];
    if (named) return named;
    const n =
      entity[2]?.toLowerCase() === "x"
        ? Number.parseInt(entity.slice(3, -1), 16)
        : Number.parseInt(entity.slice(2, -1), 10);
    return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
  });
}
function inertText(html: string): string {
  const lower = html.toLowerCase();
  const pieces: string[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const open = html.indexOf("<", cursor);
    if (open < 0) {
      pieces.push(html.slice(cursor));
      break;
    }
    pieces.push(html.slice(cursor, open), " ");
    if (lower.startsWith("<!--", open)) {
      const end = lower.indexOf("-->", open + 4);
      cursor = end < 0 ? html.length : end + 3;
      continue;
    }
    const close = html.indexOf(">", open + 1);
    if (close < 0) break;
    const tag = /^\s*(script|style)(?:\s|\/|$)/.exec(
      lower.slice(open + 1, Math.min(close, open + 40)),
    )?.[1];
    if (tag) {
      const end = lower.indexOf(`</${tag}`, close + 1);
      if (end < 0) break;
      const endTag = lower.indexOf(">", end + 2);
      cursor = endTag < 0 ? html.length : endTag + 1;
    } else cursor = close + 1;
  }
  return decodeEntities(pieces.join("")).replace(/\s+/g, " ").trim();
}
function tagText(html: string, tag: "title" | "h1"): string {
  const lower = html.toLowerCase();
  const opening = lower.indexOf(`<${tag}`);
  if (opening < 0) return "";
  const start = lower.indexOf(">", opening + tag.length + 1);
  const end = lower.indexOf(`</${tag}`, start + 1);
  return start < 0 || end < 0 ? "" : inertText(html.slice(start + 1, end));
}
function classify(
  statusCode: number,
  body: string,
  type: string,
  endpoint: ReviewCheckEndpoint,
  inspection: Inspection = "complete",
): Pick<ReviewLinkCheck, "status" | "message" | "title"> {
  const title = type.includes("html") ? tagText(body, "title").slice(0, 180) || null : null;
  const text = type.includes("html") ? inertText(body) : body;
  const heading = type.includes("html") ? tagText(body, "h1").slice(0, 180) : "";
  if (statusCode === 401 || statusCode === 403)
    return {
      status: "auth-required",
      message:
        "Access is restricted or authentication is required; this does not establish application health.",
      title,
    };
  if (statusCode >= 400 || !endpoint.expectedStatuses.includes(statusCode))
    return {
      status: "http-error",
      message: `The endpoint returned HTTP ${statusCode}, outside its expected statuses.`,
      title,
    };
  if (inspection === "encoded")
    return {
      status: "unknown",
      message: "The server ignored identity encoding; compressed content was not inspected.",
      title,
    };
  if (!/^(?:text\/(?:html|plain)|application\/(?:json|xhtml\+xml))(?:;|$)/i.test(type))
    return {
      status: "unknown",
      message: "The response content type is not supported for page identity inspection.",
      title,
    };
  if (
    [title ?? "", heading].some((value) =>
      /^\s*(?:(?:http\s*(?:error)?|error)\s*)?(?:404|410|500|502|503)\b|^\s*(?:internal server error|application error|page not found|file or directory not found)\s*$/i.test(
        value,
      ),
    ) ||
    /^\s*(?:(?:http\s*)?404\s*(?:[-:|–]\s*)?)?(?:page\s+|file\s+|resource\s+)?not\s+found(?:\s*[-|:].*)?\s*$/i.test(
      title ?? "",
    ) ||
    /^\s*404\s*[-:|–]?\s*(?:page\s+)?not\s+found\b/i.test(text.slice(0, 250)) ||
    /^\s*(?:server error in ['"/]|runtime error\s*$|HTTP Error 404\b)/i.test(title ?? "")
  )
    return {
      status: "soft-404",
      message:
        "HTTP succeeded, but the returned page resembles an error/not-found page. Verify its configured identity.",
      title,
    };
  if (
    /\btype\s*=\s*["']?password\b/i.test(body) &&
    /\b(?:log\s*in|sign\s*in|authenticate)\b/i.test(text + " " + (title ?? ""))
  )
    return {
      status: "auth-required",
      message: "A sign-in form was returned; the authenticated application was not checked.",
      title,
    };
  if (inspection === "truncated")
    return {
      status: "unknown",
      message:
        "The endpoint responded, but only a bounded prefix was inspected because the response exceeded the configured size limit. Application health is not confirmed.",
      title,
    };
  if (!endpoint.expectedText.trim())
    return {
      status: "unknown",
      message:
        "The endpoint responded. Configure expected page text to verify that this is the intended application.",
      title,
    };
  if (
    !decodeEntities(text)
      .toLocaleLowerCase()
      .includes(endpoint.expectedText.trim().toLocaleLowerCase())
  ) {
    if (type.includes("html") && body.toLowerCase().includes("<script") && text.length < 120)
      return {
        status: "unknown",
        message:
          "Expected text was not present in the server response. This may be a client-rendered application; verify it in a browser.",
        title,
      };
    return {
      status: "wrong-page",
      message: "The expected application text was not present in the returned page.",
      title,
    };
  }
  return {
    status: "healthy",
    message: "The expected HTTP status and application text matched.",
    title,
  };
}

/** Each request is a fresh GET with a DNS-pinned socket; no workspace cookies or credentials are forwarded. */
export class ReviewLinkChecker {
  constructor(
    private readonly resolver: (host: string) => Promise<Address[]> = (host) =>
      lookup(host, { all: true, verbatim: true }),
    private readonly localFixtureMode = false,
    private readonly fixtureTrust?: { ca: string | Buffer },
  ) {
    if (fixtureTrust && !localFixtureMode) throw Error("review-tls-fixture-trust-denied");
  }

  async check(endpoint: ReviewCheckEndpoint, policy: ReviewCheckPolicy): Promise<ReviewLinkCheck> {
    const started = performance.now();
    const checkedAt = new Date().toISOString();
    let finalUrl: string | null = null;
    let httpStatus: number | null = null;
    const tls: ReviewTlsObservation[] = [];
    let activeTls: ReviewTlsObservation | undefined;
    const result = (
      status: ReviewLinkCheck["status"],
      message: string,
      title: string | null = null,
    ): ReviewLinkCheck => ({
      status,
      httpStatus,
      finalUrl,
      message,
      title,
      elapsedMs: Math.round(performance.now() - started),
      checkedAt,
      tls: tls.map((observation) => ({ ...observation })),
    });
    const timeoutMs = Math.min(15000, Math.max(100, policy.timeoutMs));
    const maxBytes = Math.min(256 * 1024, Math.max(1024, policy.maxBytes));
    const maxRedirects = Math.min(5, Math.max(0, policy.maxRedirects));
    const deadline = performance.now() + timeoutMs;
    try {
      if (
        ![timeoutMs, maxBytes, maxRedirects].every(Number.isFinite) ||
        !policy.allowedOrigins.length ||
        policy.allowedOrigins.length > 128
      )
        throw new CheckFailure("blocked", "The link check policy is invalid.");
      const allowed = new Set(
        policy.allowedOrigins.map((origin) => {
          let parsed: URL;
          try {
            parsed = new URL(origin);
          } catch {
            throw new CheckFailure("blocked", "Only exact HTTP(S) origins are permitted.");
          }
          if (
            parsed.origin !== origin ||
            parsed.username ||
            parsed.password ||
            !["http:", "https:"].includes(parsed.protocol)
          )
            throw new CheckFailure("blocked", "Only exact HTTP(S) origins are permitted.");
          return parsed.origin;
        }),
      );
      const prefixes = policy.allowedPathPrefixes ?? ["/"];
      if (
        !prefixes.length ||
        prefixes.length > 32 ||
        prefixes.some(
          (prefix) =>
            !prefix.startsWith("/") ||
            prefix.includes("?") ||
            prefix.includes("#") ||
            /%|\\|\.\./.test(prefix),
        )
      )
        throw new CheckFailure("blocked", "The allowed path policy is invalid.");
      let current: URL;
      try {
        current = new URL(endpoint.url);
      } catch {
        throw new CheckFailure("blocked", "The endpoint URL is invalid.");
      }
      // This jar starts empty for each explicit check; it has no browser/portal cookies.
      const session =
        policy.allowSessionCookies === true ? new AnonymousSession(current.origin) : null;
      const visited = new Set<string>();
      for (let hop = 0; ; hop++) {
        finalUrl = safeUrl(current);
        activeTls = undefined;
        // This describes only the current destination, never a previous hop's 302.
        httpStatus = null;
        if (
          current.href.length > 2048 ||
          current.username ||
          current.password ||
          current.hash ||
          !["http:", "https:"].includes(current.protocol) ||
          !allowed.has(current.origin) ||
          /%2f|%5c/i.test(current.pathname) ||
          !prefixes.some(
            (prefix) =>
              prefix === "/" ||
              current.pathname === prefix.replace(/\/$/, "") ||
              current.pathname.startsWith(prefix.replace(/\/$/, "") + "/"),
          ) ||
          [...current.searchParams.keys()].some((key) =>
            /(?:token|password|passwd|secret|api.?key|session|authorization)/i.test(key),
          )
        )
          throw new CheckFailure(
            "blocked",
            "The destination is outside the configured origin/path policy or contains credential material.",
          );
        const cookieHeader = session?.header(current) ?? "";
        const visitKey =
          current.href + "|" + createHash("sha256").update(cookieHeader).digest("hex");
        if (visited.has(visitKey))
          throw new CheckFailure("redirect", "The endpoint entered a redirect loop.");
        visited.add(visitKey);
        const remaining = deadline - performance.now();
        if (remaining <= 0)
          throw new CheckFailure("unreachable", "The link check exceeded its total deadline.");
        const host = current.hostname.replace(/^\[|\]$/g, "");
        if (host.length > 253)
          throw new CheckFailure(
            "blocked",
            "The destination hostname exceeds the supported DNS limit.",
          );
        if (current.protocol === "https:") {
          activeTls = tls.find((observation) => observation.url === safeUrl(current));
          const freshObservation: ReviewTlsObservation = {
            url: safeUrl(current),
            hostname: host,
            port: Number(current.port || 443),
            verification: "unavailable",
            validFrom: null,
            validTo: null,
            subject: null,
            issuer: null,
            fingerprint256: null,
            errorCode: null,
            observedAt: new Date().toISOString(),
          };
          if (!activeTls) {
            activeTls = freshObservation;
            tls.push(activeTls);
          } else Object.assign(activeTls, freshObservation);
        }
        const resolved = isIP(host)
          ? [{ address: host, family: isIP(host) }]
          : await this.withDeadline(this.resolver(host), remaining);
        if (
          !resolved.length ||
          resolved.length > 32 ||
          resolved.some(({ address, family }) => {
            if (
              ![4, 6].includes(family) ||
              isIP(address) !== family ||
              ["168.63.129.16", "169.254.169.254"].includes(address)
            )
              return true;
            if (publicModelAddress(address)) return false;
            if (
              policy.allowPrivate &&
              privateAddresses.check(address, family === 4 ? "ipv4" : "ipv6")
            )
              return false;
            return !(
              this.localFixtureMode && loopback.check(address, family === 4 ? "ipv4" : "ipv6")
            );
          })
        )
          throw new CheckFailure(
            "blocked",
            "DNS returned a private or reserved address that is not permitted by this check policy.",
          );
        const pinned = resolved[0];
        if (!pinned) throw new CheckFailure("blocked", "DNS returned no approved address.");
        const response = await this.get(
          current,
          pinned,
          Math.max(1, deadline - performance.now()),
          maxBytes,
          (status) => {
            httpStatus = status;
          },
          cookieHeader,
          activeTls,
        );
        httpStatus = response.status;
        session?.receive(current, response.setCookies);
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.location)
            throw new CheckFailure("redirect", "The endpoint redirected without a destination.");
          if (hop >= maxRedirects)
            throw new CheckFailure(
              "redirect",
              "The endpoint exceeded the configured redirect limit.",
            );
          const next = new URL(response.location, current);
          if (current.protocol === "https:" && next.protocol !== "https:")
            throw new CheckFailure("blocked", "A redirect attempted to downgrade HTTPS.");
          current = next;
          continue;
        }
        const classified = classify(
          response.status,
          response.body,
          response.contentType,
          endpoint,
          response.inspection,
        );
        return result(classified.status, classified.message, classified.title);
      }
    } catch (error) {
      tlsFailure(activeTls, error);
      if (error instanceof CheckFailure) return result(error.status, error.message);
      const code = (error as NodeJS.ErrnoException)?.code ?? "";
      if (
        /CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code) ||
        (activeTls && code === "EPROTO")
      )
        return result(
          "tls-error",
          "TLS certificate validation failed. Certificate verification remains enabled.",
        );
      return result(
        "unreachable",
        "The configured endpoint could not be reached or did not return a complete bounded response.",
      );
    }
  }

  private async withDeadline<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new CheckFailure("unreachable", "DNS lookup exceeded the link-check deadline."),
              ),
            milliseconds,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async get(
    url: URL,
    pinned: Address,
    timeoutMs: number,
    maxBytes: number,
    receivedHeaders: (status: number) => void,
    cookieHeader: string,
    observation: ReviewTlsObservation | undefined,
  ): Promise<{
    status: number;
    body: string;
    contentType: string;
    location: string | undefined;
    inspection: Inspection;
    setCookies: string[];
  }> {
    return new Promise((resolve, reject) => {
      const factory = url.protocol === "https:" ? httpsRequest : httpRequest;
      const request = factory(
        url,
        {
          method: "GET",
          agent: false,
          family: pinned.family,
          rejectUnauthorized: true,
          ...(url.protocol === "https:"
            ? {
                ...(this.fixtureTrust ? { ca: this.fixtureTrust.ca } : {}),
                checkServerIdentity: (host: string, certificate: PeerCertificate) => {
                  if (observation) certificateFields(observation, certificate);
                  return checkServerIdentity(host, certificate);
                },
              }
            : {}),
          lookup: ((
            _hostname: string,
            options: { all?: boolean },
            callback: (...args: unknown[]) => void,
          ) =>
            options.all
              ? callback(null, [pinned])
              : callback(null, pinned.address, pinned.family)) as never,
          headers: {
            accept: "text/html,application/json,text/plain;q=0.9",
            "accept-encoding": "identity",
            "user-agent": "DevSetu-Application-Review/1",
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          receivedHeaders(status);
          const chunks: Buffer[] = [];
          let received = 0;
          let settled = false;
          const finish = (inspection: Inspection) => {
            if (settled) return;
            settled = true;
            resolve({
              status,
              body: Buffer.concat(chunks, received).toString("utf8"),
              contentType: response.headers["content-type"] ?? "",
              location: response.headers.location,
              inspection,
              setCookies: response.headers["set-cookie"] ?? [],
            });
          };
          const encoding = response.headers["content-encoding"];
          if (encoding && encoding !== "identity") {
            finish("encoded");
            response.destroy();
            return;
          }
          response.on("data", (chunk: Buffer) => {
            if (settled) return;
            const prefix = chunk.subarray(0, maxBytes - received);
            chunks.push(prefix);
            received += prefix.length;
            if (prefix.length < chunk.length) {
              finish("truncated");
              response.destroy();
            }
          });
          response.once("error", reject);
          response.once("aborted", () =>
            reject(new CheckFailure("unreachable", "The response was interrupted.")),
          );
          response.once("end", () => finish("complete"));
        },
      );
      const timer = setTimeout(
        () =>
          request.destroy(
            new CheckFailure("unreachable", "The link check exceeded its total deadline."),
          ),
        timeoutMs,
      );
      const observePeer = (socket: unknown) => {
        if (!observation || !(socket instanceof TLSSocket)) return;
        try {
          certificateFields(observation, socket.getPeerCertificate());
        } catch {
          /* The failed socket may already have destroyed its peer-certificate handle. */
        }
      };
      request.once("socket", (socket) => {
        if (!(socket instanceof TLSSocket) || !observation) return;
        socket.once("secureConnect", () => {
          observePeer(socket);
          observation.verification = socket.authorized ? "verified" : "failed";
          observation.errorCode = socket.authorized
            ? null
            : String(socket.authorizationError || "TLS_AUTHORIZATION_FAILED").slice(0, 240);
          observation.observedAt = new Date().toISOString();
        });
        socket.once("error", (error) => {
          observePeer(socket);
          tlsFailure(observation, error);
        });
      });
      request.once("error", (error) => {
        observePeer(request.socket);
        tlsFailure(observation, error);
        reject(error);
      });
      request.once("close", () => clearTimeout(timer));
      request.end();
    });
  }
}

export function checkReviewLink(
  endpoint: ReviewCheckEndpoint,
  policy: ReviewCheckPolicy,
): Promise<ReviewLinkCheck> {
  return new ReviewLinkChecker().check(endpoint, policy);
}
