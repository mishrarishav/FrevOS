"use strict";
const path = require("node:path"),
  { execFile } = require("node:child_process");
const { within } = require("./DiscoverySafety.cjs");
// Browsing folder names does not inherit file-content/watch exclusions.
const metadataExcluded = (value) =>
  /(^|[\\/])(?:\.git|\.ssh|\.aws|\.azure|\.gnupg|\.kube|System Volume Information|\$Recycle\.Bin)(?:[\\/]|$)/i.test(
    value,
  );
const relative = (value) =>
  typeof value === "string" &&
  value.length <= 1024 &&
  !value.includes("\\") &&
  !value.includes(":") &&
  (!value ||
    value
      .split("/")
      .every((p) => p && p !== "." && p !== ".." && ![...p].some((c) => c.charCodeAt(0) < 32)));
function command(file, args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { windowsHide: true, timeout: 30000, maxBuffer: 131072 },
      (error, stdout) => {
        if (error) reject(Error("folder-browser-unavailable"));
        else {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(Error("folder-browser-unavailable"));
          }
        }
      },
    );
    child.stdin.on("error", () => reject(Error("folder-browser-unavailable")));
    child.stdin.end(JSON.stringify(input));
  });
}
async function browse(config, job, roots, consent) {
  try {
    if (!consent) throw Error("folder-consent-required");
    const request = job.request;
    if (
      job.version !== 1 ||
      job.workspaceId !== "ws_server20" ||
      !/^fb_[a-f0-9]{32}$/.test(job.requestId) ||
      request?.deviceId !== config.deviceId ||
      Date.parse(job.expiresAt) <= Date.now() ||
      !relative(request.path) ||
      !Number.isInteger(request.page) ||
      request.page < 0 ||
      request.page > 100 ||
      (request.fingerprint !== undefined && !/^[a-f0-9]{64}$/.test(request.fingerprint))
    )
      throw Error("folder-scope-denied");
    const allowed = [config.repository, ...roots];
    if (!allowed.includes(request.root)) throw Error("folder-scope-denied");
    const folder = path.resolve(request.root, ...request.path.split("/").filter(Boolean));
    if (
      !within(request.root, folder) ||
      metadataExcluded(request.path) ||
      within(config.stateRoot, folder) ||
      within(__dirname, folder)
    )
      throw Error("folder-scope-denied");
    const agentRoot = __dirname;
    const input = {
      root: request.root,
      path: request.path,
      page: request.page,
      ...(request.fingerprint ? { fingerprint: request.fingerprint } : {}),
      agentRoot,
    };
    const value =
      process.platform === "win32"
        ? await command(
            path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
            [
              "-NoProfile",
              "-NonInteractive",
              "-ExecutionPolicy",
              "RemoteSigned",
              "-File",
              path.join(__dirname, "Browse-Folders.ps1"),
            ],
            input,
          )
        : await command("/usr/bin/python3", [path.join(__dirname, "Browse-Folders.py")], input);
    if (value.errorCode) throw Error(value.errorCode);
    if (
      !Array.isArray(value.entries) ||
      value.entries.length > 100 ||
      !/^[a-f0-9]{64}$/.test(value.fingerprint)
    )
      throw Error("folder-browser-unavailable");
    const result = {
      ...value,
      root: request.root,
      path: request.path,
      entries: value.entries.map((e) => {
        if (typeof e.name !== "string" || e.name.length > 255 || !relative(e.name) || !e.name)
          throw Error("folder-browser-unavailable");
        const selected = path.join(folder, e.name);
        return {
          name: e.name,
          path: (request.path ? request.path + "/" : "") + e.name,
          excluded:
            !!e.excluded ||
            metadataExcluded(e.name) ||
            within(agentRoot, selected) ||
            within(config.stateRoot, selected),
        };
      }),
    };
    return { ...job, status: "succeeded", result };
  } catch (e) {
    const known = [
      "folder-permission-denied",
      "folder-path-unavailable",
      "folder-scope-denied",
      "folder-changed",
      "folder-consent-required",
      "folder-request-expired",
    ];
    return {
      ...job,
      status: "failed",
      errorCode: known.includes(e.message) ? e.message : "folder-browser-unavailable",
    };
  }
}
module.exports = { browse };
