"use strict";
const { createHash } = require("node:crypto");
const sha = (b) => createHash("sha256").update(b).digest("hex");
function privateAddress(value) {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}$/.test(value)
  )
    return false;
  const p = value.split(".").map(Number);
  return (
    p.every((n) => n <= 255) &&
    (p[0] === 10 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168))
  );
}
function validListen(value) {
  return (
    !!value &&
    Object.keys(value).sort().join() === "address,allowedClients" &&
    privateAddress(value.address) &&
    Array.isArray(value.allowedClients) &&
    value.allowedClients.length >= 1 &&
    value.allowedClients.length <= 16 &&
    new Set(value.allowedClients).size === value.allowedClients.length &&
    value.allowedClients.every(privateAddress)
  );
}
function privateInterfaces(interfaces) {
  const found = new Map();
  for (const [name, addresses] of Object.entries(interfaces)) {
    if (
      typeof name !== "string" ||
      !name ||
      name.length > 180 ||
      [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
    )
      continue;
    for (const entry of addresses ?? [])
      if (!entry.internal && privateAddress(entry.address))
        found.set(entry.address, { name, address: entry.address });
  }
  return [...found.values()].sort((a, b) => a.address.localeCompare(b.address)).slice(0, 64);
}
function binding(j) {
  return JSON.stringify([
    1,
    "software.job.v1",
    j.workspaceId,
    j.actor,
    j.request,
    j.package ?? null,
    j.createdAt,
    j.expiresAt,
  ]);
}
function validateJob(j, identity, now = Date.now()) {
  const fail = () => {
    throw Error("software-job-denied");
  };
  if (
    !j ||
    j.version !== 1 ||
    j.workspaceId !== identity.workspaceId ||
    j.status !== "working" ||
    !/^usr_[A-Za-z0-9_-]+$/.test(j.actor) ||
    !j.request ||
    j.request.version !== 1 ||
    !/^sw_[a-f0-9]{32}$/.test(j.request.requestId) ||
    j.request.deviceId !== identity.deviceId ||
    !["inventory", "install", "stop-demo"].includes(j.request.operation) ||
    !Number.isFinite(Date.parse(j.createdAt)) ||
    !Number.isFinite(Date.parse(j.expiresAt)) ||
    Date.parse(j.createdAt) > now ||
    Date.parse(j.expiresAt) <= now ||
    Date.parse(j.expiresAt) - Date.parse(j.createdAt) > 3600000 ||
    j.digest !== sha(binding(j))
  )
    fail();
  const r = j.request;
  if (
    r.operation === "inventory" &&
    Object.keys(r).sort().join() !== "deviceId,operation,requestId,version"
  )
    fail();
  if (
    r.operation === "stop-demo" &&
    (!/^[a-z][a-z0-9-]{0,59}$/.test(r.serviceId) ||
      Object.keys(r).sort().join() !== "deviceId,operation,requestId,serviceId,version")
  )
    fail();
  if (r.operation === "install") {
    const p = j.package,
      a = j.approval;
    if (
      !p ||
      !a ||
      !p.enabled ||
      p.id !== r.packageId ||
      r.packageDigest !== sha(JSON.stringify(p)) ||
      !["windows-msi", "linux-deb", "linux-rpm", "demo-api"].includes(p.recipe) ||
      !["win32", "linux"].includes(p.platform) ||
      Object.values({ name: p.name, version: p.version, publisher: p.publisher }).some(
        (v) =>
          typeof v !== "string" ||
          !v ||
          v.length > 180 ||
          [...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
      )
    )
      fail();
    const artifact = p.recipe === "demo-api" ? p.programSha256 : p.asset?.sha256;
    if (
      !/^[a-f0-9]{64}$/.test(artifact) ||
      a.version !== 1 ||
      a.action !== "software.install.v1" ||
      a.workspaceId !== j.workspaceId ||
      !/^usr_[A-Za-z0-9_-]+$/.test(a.actor) ||
      a.target !== identity.deviceId ||
      a.correlationId !== r.requestId ||
      a.artifactSha256 !== artifact ||
      a.digest !== j.digest ||
      [a.issuedAt, a.expiresAt, a.consumedAt].some((t) => !Number.isFinite(Date.parse(t))) ||
      Date.parse(a.issuedAt) < Date.parse(j.createdAt) ||
      Date.parse(a.issuedAt) > Date.parse(a.consumedAt) ||
      Date.parse(a.consumedAt) > now ||
      Date.parse(a.expiresAt) <= now ||
      Date.parse(a.expiresAt) - Date.parse(a.issuedAt) > 600000
    )
      fail();
    const keys =
      p.recipe === "demo-api"
        ? "enabled,id,name,platform,programSha256,publisher,recipe,version"
        : "asset,enabled,id,name,platform,publisher,recipe,version";
    if (Object.keys(p).sort().join() !== keys) fail();
    if (p.recipe === "demo-api") {
      const keys =
        r.listen === undefined
          ? "deviceId,lifetimeSeconds,operation,packageDigest,packageId,port,requestId,version"
          : "deviceId,lifetimeSeconds,listen,operation,packageDigest,packageId,port,requestId,version";
      if (
        Object.keys(r).sort().join() !== keys ||
        (r.listen !== undefined && !validListen(r.listen)) ||
        !Number.isInteger(r.port) ||
        r.port < 1024 ||
        r.port > 65535 ||
        !Number.isInteger(r.lifetimeSeconds) ||
        r.lifetimeSeconds < 60 ||
        r.lifetimeSeconds > 1800
      )
        fail();
    } else {
      if (
        Object.keys(r).sort().join() !==
          "deviceId,operation,packageDigest,packageId,requestId,version" ||
        (p.recipe === "windows-msi" && p.platform !== "win32") ||
        (p.recipe !== "windows-msi" && p.platform !== "linux")
      )
        fail();
      const asset = p.asset,
        u = new URL(asset.url);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        !Number.isInteger(asset.bytes) ||
        asset.bytes < 1 ||
        asset.bytes > 262144000 ||
        Object.keys(asset).some(
          (k) => !["url", "sha256", "bytes", "signerThumbprint"].includes(k),
        ) ||
        (asset.signerThumbprint !== undefined &&
          !/^[a-fA-F0-9]{40,64}$/.test(asset.signerThumbprint))
      )
        fail();
    }
  }
  return j;
}
module.exports = { sha, binding, validateJob, privateAddress, validListen, privateInterfaces };
