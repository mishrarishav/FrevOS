import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { createControlCenterApi } from "../src/api.js";
import { DeviceVerificationRequired } from "../src/api.js";
import { JoinRequestForm, suggestedJoinPlatform } from "../src/JoinRequestForm.js";

it("uses the server-selected connector page on HTTP without background local requests or security overrides", async () => {
  const challenge = {
      status: "device-verification-required",
      challengeId: "dl_" + "a".repeat(64),
      ports: [55123],
      expiresAt: "2026-10-28T10:00:00.000Z",
      method: "connector-page",
      devices: [{ port: 55123, name: "Fixture laptop" }],
    },
    calls: string[] = [];
  const api = createControlCenterApi(async (url) => {
    calls.push(String(url));
    return Response.json(challenge, { status: 202 });
  });
  try {
    await api.login?.("user", "synthetic-password");
    throw Error("Must require local confirmation");
  } catch (error) {
    expect(error).toBeInstanceOf(DeviceVerificationRequired);
    expect((error as DeviceVerificationRequired).challenge).toEqual(challenge);
  }
  expect(calls).toEqual(["/auth/login"]);
});

it("retains requester-only join status and exact CSRF-protected admin decisions without credential-bearing URLs", async () => {
  const record = {
    version: 1,
    id: "jr_" + "a".repeat(32),
    mode: "new",
    username: "synthetic.user",
    displayName: "Synthetic",
    platform: "win32",
    deviceId: "fc_" + "b".repeat(32),
    fileActivity: false,
    ownerUserId: "usr_fixture",
    status: "pending",
    createdAt: "2026-10-28T00:00:00Z",
    expiresAt: "2026-10-29T00:00:00Z",
    digest: "a".repeat(64),
  };
  const input = {
    version: 1,
    mode: "new",
    username: record.username,
    displayName: record.displayName,
    platform: record.platform,
    deviceId: record.deviceId,
    fileActivity: false,
    password: "synthetic-password",
    codeHash: "b".repeat(64),
  };
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), ...(init ? { init } : {}) });
      if (String(url).endsWith("/enrollment-owners")) return Response.json([]);
      return Response.json(String(url).endsWith("/join-requests") ? [record] : record);
    },
    "",
    () => "synthetic-csrf",
  );
  expect(await api.requestJoin?.(input)).toEqual(record);
  expect(await api.joinStatus?.()).toEqual(record);
  expect(await api.joinRequests?.("ws_fixture")).toEqual([record]);
  expect(await api.systemPairingOwners?.("ws_fixture")).toEqual([]);
  await api.decideJoin?.("ws_fixture", {
    version: 1,
    requestId: record.id,
    digest: record.digest,
    decision: "approve",
    confirmation: "reviewed-user-and-system-request",
  });
  expect(calls[0]?.url).toBe("/auth/join/request");
  expect(calls[1]?.init?.credentials).toBe("same-origin");
  expect(calls[4]?.init?.headers).toMatchObject({ "x-csrf-token": "synthetic-csrf" });
  expect(calls.every((call) => !call.url.includes(input.password))).toBe(true);
  for (const status of [401, 503]) {
    const failure = createControlCenterApi(async () => new Response(null, { status }));
    await expect(failure.requestJoin?.(input)).rejects.toMatchObject({
      kind: status === 401 ? "invalid-credentials" : "unavailable",
    });
  }
});

it("handles browser security, denied local access and incomplete device verification without issuing a session", async () => {
  const challenge = {
      status: "device-verification-required",
      challengeId: "dl_" + "a".repeat(64),
      ports: [55123],
      expiresAt: "2026-10-28T10:00:00.000Z",
    },
    proof = { version: 1, challengeId: challenge.challengeId, proof: "b".repeat(64) };
  try {
    vi.stubGlobal("window", { isSecureContext: false });
    const insecure = createControlCenterApi(async () => Response.json(challenge, { status: 202 }));
    await expect(insecure.login?.("user", "synthetic-password")).rejects.toMatchObject({
      kind: "paired-system-secure-origin-required",
    });
    vi.stubGlobal("window", { isSecureContext: true });
    for (const failure of ["local-denied", "incomplete", "abort"]) {
      const controller = new AbortController();
      const api = createControlCenterApi(async (url) => {
        if (String(url).endsWith("/auth/login")) return Response.json(challenge, { status: 202 });
        if (failure === "abort") {
          controller.abort();
          throw Error("cancelled");
        }
        if (String(url).startsWith("http:"))
          return failure === "local-denied"
            ? new Response(null, { status: 403 })
            : Response.json(proof);
        return new Response(null, { status: 403 });
      });
      await expect(
        api.login?.("user", "synthetic-password", controller.signal),
      ).rejects.toMatchObject({
        kind: failure === "abort" ? "unavailable" : "paired-system-required",
      });
    }
  } finally {
    vi.unstubAllGlobals();
  }
  for (const response of [
    Response.json({ error: "forbidden" }, { status: 403 }),
    Response.json({}, { status: 403 }),
    new Response("not-json", { status: 403 }),
  ]) {
    const denied = createControlCenterApi(async () => response);
    await expect(denied.login?.("user", "synthetic-password")).rejects.toMatchObject({
      kind: "denied",
    });
  }
});

it("uses only validated loopback ports, no browser credentials, and a separate same-origin completion", async () => {
  const challengeId = "dl_" + "a".repeat(64),
    proof = { version: 1, challengeId, proof: "b".repeat(64) };
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createControlCenterApi(
    async (url, init) => {
      calls.push({ url: String(url), ...(init ? { init } : {}) });
      if (String(url).endsWith("/auth/login"))
        return Response.json(
          {
            status: "device-verification-required",
            challengeId,
            ports: [55123, 55124],
            expiresAt: "2026-10-28T10:00:00.000Z",
          },
          { status: 202 },
        );
      if (String(url).includes(":55123/")) throw Error("Another computer is offline");
      if (String(url).includes(":55124/")) return Response.json(proof);
      return new Response(null, { status: 204 });
    },
    "/frevos",
    () => "synthetic-csrf",
  );
  await api.login!("synthetic.user", "synthetic-password");
  expect(calls.map((call) => call.url)).toEqual([
    "/frevos/auth/login",
    "http://127.0.0.1:55123/device-login",
    "http://127.0.0.1:55124/device-login",
    "/frevos/auth/device-login/complete",
  ]);
  for (const call of calls.slice(1, 3)) {
    expect(call.init).toMatchObject({ mode: "cors", credentials: "omit", redirect: "error" });
    expect(JSON.parse(String(call.init?.body))).toEqual({ version: 1, challengeId });
    expect(call.init?.signal).toBeDefined();
    expect(String(call.init?.body)).not.toContain("password");
  }
  expect(calls[3]?.init?.credentials).toBe("same-origin");
  expect(JSON.parse(String(calls[3]?.init?.body))).toEqual(proof);
});

it("fails closed for wrong-device proof, malformed ports and unpaired accounts", async () => {
  for (const malformed of [false, true]) {
    const calls: string[] = [];
    const api = createControlCenterApi(async (url) => {
      calls.push(String(url));
      if (String(url).endsWith("/auth/login"))
        return Response.json(
          {
            status: "device-verification-required",
            challengeId: "dl_" + "a".repeat(64),
            ports: malformed ? ["https://foreign.invalid"] : [55123],
            expiresAt: "2026-10-28T10:00:00.000Z",
          },
          { status: 202 },
        );
      return Response.json({
        version: 1,
        challengeId: "dl_" + "c".repeat(64),
        proof: "b".repeat(64),
      });
    });
    await expect(api.login!("user", "synthetic-password")).rejects.toBeDefined();
    expect(calls.some((url) => url.includes("/complete"))).toBe(false);
    expect(calls.some((url) => url.includes("foreign.invalid"))).toBe(false);
    if (malformed) expect(calls).toHaveLength(1);
  }
  const denied = createControlCenterApi(async () =>
    Response.json({ error: "paired-system-required" }, { status: 403 }),
  );
  await expect(denied.login!("user", "synthetic-password")).rejects.toMatchObject({
    kind: "paired-system-required",
  });
});

it("suggests supported desktop OS, keeps both request types and never asks for an administrator password", () => {
  expect(suggestedJoinPlatform("Mozilla Windows NT 10.0 Win64 x64")).toBe("win32");
  expect(suggestedJoinPlatform("Mozilla X11 Linux x86_64")).toBe("linux");
  expect(suggestedJoinPlatform("Linux Android")).toBe("android");
  expect(suggestedJoinPlatform("Macintosh")).toBe("unknown");
  const html = renderToStaticMarkup(
    <JoinRequestForm api={createControlCenterApi()} onClose={() => {}} />,
  );
  expect(html).toContain("Create my user account and register this computer");
  expect(html).toContain("Register another computer for my existing account");
  expect(html).toContain("Submit request to administrator");
  expect(html).not.toContain("Administrator password");
});
