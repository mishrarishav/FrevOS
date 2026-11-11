import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ReviewCheckEndpoint,
  type ReviewCheckPolicy,
  ReviewLinkChecker,
} from "../src/review-link-checker.js";

let server: Server;
let origin: string;
let paths: string[];
let headers: Record<string, string | string[] | undefined>[];
let policy: ReviewCheckPolicy;
let checker: ReviewLinkChecker;
const endpoint = (url: string, expectedText = "Application ready"): ReviewCheckEndpoint => ({
  id: "endpoint_fixture",
  label: "Fixture app",
  url,
  expectedText,
  expectedStatuses: [200],
});

beforeEach(async () => {
  paths = [];
  headers = [];
  server = createServer((request, response) => {
    paths.push(request.url ?? "");
    headers.push(request.headers);
    response.setHeader("content-type", "text/html;charset=utf-8");
    if (request.url === "/http-404") response.writeHead(404).end("Not found");
    else if (request.url === "/soft-404")
      response.end("<html><title>404 - Not Found</title><h1>Not Found</h1></html>");
    else if (request.url === "/iis-soft-404")
      response.end(
        "<title>404 - File or directory not found.</title><footer>Application ready</footer>",
      );
    else if (request.url === "/branded-soft-404")
      response.end("<title>Fixture app</title><nav>Application ready</nav><h1>Page not found</h1>");
    else if (request.url === "/signin")
      response.end('<title>Sign in</title><form><input type="password"/>Please log in</form>');
    else if (request.url === "/restricted") response.writeHead(403).end("Forbidden");
    else if (request.url === "/wrong")
      response.end("<title>Different product</title>Another application");
    else if (request.url === "/script-only")
      response.end(
        '<title>Client application</title><div id="root"></div><script>Application ready</script>',
      );
    else if (request.url === "/article")
      response.end(
        "<title>Understanding 404 not found</title>Application ready. This article discusses error codes.",
      );
    else if (request.url === "/large") response.end("x".repeat(4096));
    else if (request.url === "/large-page")
      response.end("<title>Large fixture</title><h1>Application ready</h1>" + "x".repeat(4096));
    else if (request.url === "/large-404")
      response.writeHead(404).end("<title>Missing fixture</title>" + "x".repeat(4096));
    else if (request.url === "/large-soft-404")
      response.end("<title>404 Not Found</title>" + "x".repeat(4096));
    else if (request.url === "/large-login")
      response.end(
        '<title>Sign in</title><input type="password"/>Please log in' + "x".repeat(4096),
      );
    else if (request.url === "/slow") {
      /* The deadline must close this socket. */
    } else if (request.url === "/redirect") response.writeHead(302, { location: "/ready" }).end();
    else if (request.url === "/escape")
      response.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
    else if (request.url === "/loop") response.writeHead(302, { location: "/loop" }).end();
    else if (request.url === "/anonymous") {
      if (request.headers.cookie?.includes("support=fixture-cookie"))
        response.end("<title>Fixture</title>Application ready");
      else
        response
          .writeHead(302, {
            location: "/anonymous",
            "set-cookie": "support=fixture-cookie; Path=/; HttpOnly",
          })
          .end();
    } else if (request.url === "/cookie-cross")
      response
        .writeHead(302, {
          location: origin.replace("review-fixture.invalid", "other-fixture.invalid") + "/ready",
          "set-cookie": "support=private-value; Path=/",
        })
        .end();
    else if (request.url === "/cookie-rules")
      response
        .writeHead(302, {
          location: "/ready",
          "set-cookie": [
            "secureOnly=hidden; Secure; Path=/",
            "foreign=hidden; Domain=other.invalid; Path=/",
            "scoped=hidden; Path=/different",
            "deleted=hidden; Path=/; Max-Age=0",
            "expired=hidden; Path=/; Expires=Wed, 21 Oct 2015 07:28:00 GMT",
            "visible=fixture; Path=/ready",
          ],
        })
        .end();
    else if (request.url === "/cookie-limit")
      response
        .writeHead(302, {
          location: "/ready",
          "set-cookie": Array.from({ length: 17 }, (_, index) => `cookie${index}=fixture; Path=/`),
        })
        .end();
    else if (request.url === "/gzip")
      response.setHeader("content-encoding", "gzip").end("not inspected");
    else
      response.end(
        "<html><title>Fixture</title><h1>Application ready</h1><script>Never execute this</script></html>",
      );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://review-fixture.invalid:${(server.address() as AddressInfo).port}`;
  policy = {
    allowedOrigins: [origin],
    allowedPathPrefixes: ["/"],
    allowPrivate: false,
    timeoutMs: 1500,
    maxBytes: 16 * 1024,
    maxRedirects: 3,
  };
  checker = new ReviewLinkChecker(async () => [{ address: "127.0.0.1", family: 4 }], true);
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("bounded application link checks", () => {
  it("uses a real DNS-pinned GET and verifies the intended text without forwarding cookies/authentication", async () => {
    const result = await checker.check(endpoint(origin + "/ready"), policy);
    expect(result).toMatchObject({
      status: "healthy",
      httpStatus: 200,
      finalUrl: origin + "/ready",
      title: "Fixture",
    });
    expect(result.checkedAt).toMatch(/Z$/);
    expect(headers).toHaveLength(1);
    expect(headers[0]?.["cookie"]).toBeUndefined();
    expect(headers[0]?.["authorization"]).toBeUndefined();
    expect(headers[0]?.["referer"]).toBeUndefined();
    expect(headers[0]?.["accept-encoding"]).toBe("identity");
  });

  it("separates HTTP failures, soft404, wrong application, authentication and unchecked identity", async () => {
    for (const [path, status] of [
      ["/http-404", "http-error"],
      ["/soft-404", "soft-404"],
      ["/iis-soft-404", "soft-404"],
      ["/branded-soft-404", "soft-404"],
      ["/signin", "auth-required"],
      ["/restricted", "auth-required"],
      ["/wrong", "wrong-page"],
      ["/script-only", "unknown"],
      ["/article", "healthy"],
    ])
      expect((await checker.check(endpoint(origin + path), policy)).status).toBe(status);
    expect((await checker.check(endpoint(origin + "/ready", ""), policy)).status).toBe("unknown");
  });

  it("revalidates policy and DNS on every redirect, blocks metadata and caps redirect loops", async () => {
    expect((await checker.check(endpoint(origin + "/redirect"), policy)).status).toBe("healthy");
    expect(paths).toEqual(["/redirect", "/ready"]);
    paths.length = 0;
    expect((await checker.check(endpoint(origin + "/escape"), policy)).status).toBe("blocked");
    expect(paths).toEqual(["/escape"]);
    expect((await checker.check(endpoint(origin + "/loop"), policy)).status).toBe("redirect");
    let resolution = 0;
    const rebound = new ReviewLinkChecker(
      async () => [{ address: resolution++ === 0 ? "127.0.0.1" : "169.254.169.254", family: 4 }],
      true,
    );
    expect((await rebound.check(endpoint(origin + "/redirect"), policy)).status).toBe("blocked");
  });

  it("keeps observed metadata from capped prefixes without marking a partial successful page healthy", async () => {
    const capped = { ...policy, maxBytes: 1024 };
    expect(await checker.check(endpoint(origin + "/large-page"), capped)).toMatchObject({
      status: "unknown",
      httpStatus: 200,
      title: "Large fixture",
      finalUrl: origin + "/large-page",
    });
    expect(await checker.check(endpoint(origin + "/large-404"), capped)).toMatchObject({
      status: "http-error",
      httpStatus: 404,
      title: "Missing fixture",
    });
    expect(await checker.check(endpoint(origin + "/large-soft-404"), capped)).toMatchObject({
      status: "soft-404",
      httpStatus: 200,
      title: "404 Not Found",
    });
    expect(await checker.check(endpoint(origin + "/large-login"), capped)).toMatchObject({
      status: "auth-required",
      httpStatus: 200,
      title: "Sign in",
    });
  });

  it("does not attribute the preceding HTTP302 to a blocked or unresolvable redirect destination", async () => {
    const blocked = await checker.check(endpoint(origin + "/escape"), policy);
    expect(blocked).toMatchObject({
      status: "blocked",
      httpStatus: null,
      finalUrl: "http://169.254.169.254/latest/meta-data/",
    });
    let resolutions = 0;
    const failing = new ReviewLinkChecker(async () => {
      if (resolutions++ === 0) return [{ address: "127.0.0.1", family: 4 }];
      throw Object.assign(Error("fixtureDNS"), { code: "ENOTFOUND" });
    }, true);
    const unreachable = await failing.check(endpoint(origin + "/redirect"), policy);
    expect(unreachable).toMatchObject({
      status: "unreachable",
      httpStatus: null,
      finalUrl: origin + "/ready",
    });
  });

  it("uses an opt-in ephemeral anonymous cookie jar for same-origin redirects without forwarding portal cookies", async () => {
    expect((await checker.check(endpoint(origin + "/anonymous"), policy)).status).toBe("redirect");
    paths.length = 0;
    headers.length = 0;
    const enabled = { ...policy, allowSessionCookies: true };
    const first = await checker.check(endpoint(origin + "/anonymous"), enabled);
    expect(first.status).toBe("healthy");
    expect(paths).toEqual(["/anonymous", "/anonymous"]);
    expect(headers[0]?.["cookie"]).toBeUndefined();
    expect(headers[1]?.["cookie"]).toBe("support=fixture-cookie");
    expect(JSON.stringify(first)).not.toContain("fixture-cookie");
    paths.length = 0;
    headers.length = 0;
    expect((await checker.check(endpoint(origin + "/anonymous"), enabled)).status).toBe("healthy");
    expect(headers[0]?.["cookie"]).toBeUndefined();
    expect(paths).toEqual(["/anonymous", "/anonymous"]);
  });

  it("restricts response cookies to their initial exact origin, valid scope and bounded jar", async () => {
    const otherOrigin = origin.replace("review-fixture.invalid", "other-fixture.invalid");
    const enabled = { ...policy, allowSessionCookies: true, allowedOrigins: [origin, otherOrigin] };
    expect((await checker.check(endpoint(origin + "/cookie-cross"), enabled)).status).toBe(
      "healthy",
    );
    expect(headers[1]?.["cookie"]).toBeUndefined();
    headers.length = 0;
    expect((await checker.check(endpoint(origin + "/cookie-rules"), enabled)).status).toBe(
      "healthy",
    );
    expect(headers[1]?.["cookie"]).toBe("visible=fixture");
    expect((await checker.check(endpoint(origin + "/cookie-limit"), enabled)).status).toBe(
      "unknown",
    );
  });

  it("never contacts unapproved origins, reserved/mixed DNS, private networks without opt-in or credential URLs", async () => {
    const inputs = [
      endpoint("http://other.invalid/"),
      endpoint(origin.replace("http://", "http://user:password@") + "/"),
      endpoint(origin + "/?api_key=should-not-travel"),
      endpoint(origin + "/?session=should-not-travel"),
    ];
    for (const input of inputs) expect((await checker.check(input, policy)).status).toBe("blocked");
    for (const addresses of [
      [{ address: "169.254.169.254", family: 4 }],
      [{ address: "10.0.0.5", family: 4 }],
      [{ address: "::ffff:127.0.0.1", family: 6 }],
      [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    ])
      expect(
        (await new ReviewLinkChecker(async () => addresses).check(endpoint(origin), policy)).status,
      ).toBe("blocked");
    expect(
      (
        await new ReviewLinkChecker(async () => [{ address: "127.0.0.1", family: 4 }]).check(
          endpoint(origin),
          { ...policy, allowPrivate: true },
        )
      ).status,
    ).toBe("blocked");
    expect(paths).toEqual([]);
  });

  it("enforces path boundaries, size limits, total timeout and refuses compressed inspection", async () => {
    expect(
      (
        await checker.check(endpoint(origin + "/ready"), {
          ...policy,
          allowedPathPrefixes: ["/app"],
        })
      ).status,
    ).toBe("blocked");
    expect(
      (
        await checker.check(endpoint(origin + "/app-escape"), {
          ...policy,
          allowedPathPrefixes: ["/app"],
        })
      ).status,
    ).toBe("blocked");
    expect(
      (await checker.check(endpoint(origin + "/large"), { ...policy, maxBytes: 1024 })).status,
    ).toBe("unknown");
    const slow = await checker.check(endpoint(origin + "/slow"), { ...policy, timeoutMs: 100 });
    expect(slow.status).toBe("unreachable");
    expect(slow.elapsedMs).toBeLessThan(1500);
    expect((await checker.check(endpoint(origin + "/gzip"), policy)).status).toBe("unknown");
  });

  it("redacts a non-credential query from the persisted final URL", async () => {
    const result = await checker.check(endpoint(origin + "/ready?filter=internal"), policy);
    expect(result.status).toBe("healthy");
    expect(result.finalUrl).toBe(origin + "/ready");
    expect(JSON.stringify(result)).not.toContain("filter=");
  });
});
