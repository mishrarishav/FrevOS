import { createServer, request as httpRequest } from "node:http";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
const clients = createRequire(import.meta.url)("../../../deployment/servix/Connector.cjs");
it("keeps a configured HTTPS entry prefix and rejects ambiguous server addresses", () => {
  const enrollment = createRequire(import.meta.url)(
    "../../../deployment/servix/SystemEnrollment.cjs",
  );
  expect(enrollment.serverOrigin("https://edge.fixture/workspace/")).toBe(
    "https://edge.fixture/workspace",
  );
  expect(
    clients.serverRequestUrl("https://edge.fixture/workspace", "/v1/connector/heartbeat").href,
  ).toBe("https://edge.fixture/workspace/v1/connector/heartbeat");
  expect(enrollment.csrfCookieName("https://edge.fixture/workspace")).toBe(
    "__Host-frevos-workspace-csrf",
  );
  for (const address of [
    "https://user:password@edge.fixture/workspace",
    "https://edge.fixture/workspace/other",
    "https://edge.fixture/workspace/../",
    "https://edge.fixture/%77orkspace",
    "https://edge.fixture/workspace?x=1",
    "https://edge.fixture/workspace#proof",
    "https://edge.fixture\\workspace",
  ])
    expect(() => clients.serverEndpoint(address)).toThrow();
  expect(() =>
    clients.serverRequestUrl("https://edge.fixture/workspace", "//outside.invalid"),
  ).toThrow();
});
it.skipIf(process.platform !== "win32")(
  "retains the same DPAPI identity, runtime and consent when a local user verifies a new HTTPS transport",
  async () => {
    const script = fileURLToPath(
      new URL("../../../deployment/servix/Test-SystemConnectorTransport.ps1", import.meta.url),
    );
    const result = await promisify(execFile)(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", script],
      {
        windowsHide: true,
        timeout: 35000,
        env: Object.fromEntries(
          Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "psmodulepath"),
        ),
      },
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "PASS",
      checks: 8,
      failedConsentRestored: true,
      failedStartRestored: true,
      stoppedTaskRestored: true,
      disabledTaskRetained: true,
      failureProofRetained: true,
      pairingPreserved: true,
      protectedBackup: true,
      unrecognizedEndpointDenied: true,
      staleIntentDenied: true,
    });
  },
  40000,
);
it.each(["", "/workspace"])(
  "keeps prefixed %s project enrollment compatible with paired login in Node and native PowerShell without transferring the device credential",
  async (prefix) => {
    const challengeId = "dl_" + "a".repeat(64),
      completion = { version: 1, challengeId, proof: "b".repeat(64) };
    let port = 0,
      completed = 0;
    const server = createServer(async (request, response) => {
      expect(
        request.headers.origin === undefined ||
          request.headers.origin === "http://" + request.headers.host,
      ).toBe(true);
      let input = "";
      for await (const chunk of request) input += chunk;
      if (request.url === prefix + "/auth/login") {
        response.writeHead(202, {
          "set-cookie": "pending=synthetic-browser-binding; HttpOnly; SameSite=Strict; Path=/",
          "content-type": "application/json",
        });
        response.end(
          JSON.stringify({
            status: "device-verification-required",
            challengeId,
            ports: [port],
            expiresAt: new Date(Date.now() + 120000).toISOString(),
          }),
        );
      } else if (
        request.url === prefix + "/auth/device-login/complete" &&
        request.headers.cookie?.includes("pending=synthetic-browser-binding") &&
        Object.keys(JSON.parse(input)).sort().join() === "challengeId,proof,version" &&
        JSON.parse(input).version === completion.version &&
        JSON.parse(input).challengeId === completion.challengeId &&
        JSON.parse(input).proof === completion.proof
      ) {
        completed++;
        response.writeHead(204);
        response.end();
      } else {
        response.writeHead(403);
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw Error("fixture-address");
    const authority = "http://127.0.0.1:" + address.port;
    const origin = authority + prefix;
    const local = await clients.startDeviceLoginProof(origin, async (body: unknown) => {
      expect(body).toEqual({ version: 1, challengeId });
      return completion;
    });
    port = local.port;
    try {
      const confirmation = await fetch(`http://127.0.0.1:${port}/device-login/start`);
      expect(confirmation.headers.get("content-security-policy")).toContain(
        `${origin}/auth/device-login/receive`,
      );
      const foreign = await fetch(`http://127.0.0.1:${port}/device-login`, {
        method: "POST",
        headers: { origin: "https://unbound.fixture", "content-type": "application/json" },
        body: JSON.stringify({ version: 1, challengeId }),
      });
      expect(foreign.status).toBe(403);
      const wrongHost = await new Promise<number>((resolve, reject) => {
        const request = httpRequest(
          `http://127.0.0.1:${port}/device-login`,
          {
            method: "POST",
            headers: {
              host: "unbound.fixture",
              origin: authority,
              "content-type": "application/json",
            },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode!);
          },
        );
        request.on("error", reject);
        request.end(JSON.stringify({ version: 1, challengeId }));
      });
      expect(wrongHost).toBe(403);
      expect(completed).toBe(0);
      const response = await clients.completeDeviceLogin(
        origin,
        await fetch(origin + "/auth/login"),
      );
      expect(response.status).toBe(204);
      expect(completed).toBe(1);
      expect(
        await clients.completeDeviceLogin(origin, new Response(null, { status: 401 })),
      ).toMatchObject({ status: 401 });
      await expect(
        clients.completeDeviceLogin(
          origin,
          Response.json(
            {
              status: "device-verification-required",
              challengeId,
              ports: ["https://foreign.invalid"],
            },
            { status: 202 },
          ),
        ),
      ).rejects.toThrow("invalid-device-login-challenge");
      if (process.platform === "win32") {
        const module = fileURLToPath(
          new URL("../../../deployment/servix/PairedLogin.psm1", import.meta.url),
        ).replaceAll("'", "''");
        const result = await promisify(execFile)(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "RemoteSigned",
            "-Command",
            `$ErrorActionPreference='Stop';Import-Module '${module}' -Force;$session=New-Object Microsoft.PowerShell.Commands.WebRequestSession;$login=Invoke-WebRequest '${origin}/auth/login' -UseBasicParsing -WebSession $session;Complete-DevSetuPairedLogin -Server '${origin}' -Response $login -Session $session;Write-Output 'PASS: paired project login'`,
          ],
          {
            windowsHide: true,
            timeout: 15000,
            env: Object.fromEntries(
              Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "psmodulepath"),
            ),
          },
        );
        expect(result.stdout).toContain("PASS: paired project login");
        expect(completed).toBe(2);
      }
    } finally {
      await local.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
