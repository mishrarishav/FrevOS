"use strict";
const path = require("node:path");
const sensitive =
  /(^|[\\/])(?:\.git|\.ssh|\.aws|\.azure|\.gnupg|\.kube|\.npm|\.nuget|\.local|\.config|\.cache|AppData|node_modules|vendor|coverage|dist|build|obj|bin|System Volume Information|\$Recycle\.Bin|Windows|ProgramData)(?:[\\/]|$)|(?:^|[\\/])(?:\.env[^\\/]*|\.npmrc|\.netrc|\.git-credentials|[^\\/]*(?:credential|secret|password|private[-_]?key|token|id_rsa|id_ed25519)[^\\/]*|appsettings[^\\/]*\.json|web\.config)(?:$|[\\/])|\.(?:pem|key|pfx|p12|kdbx|sqlite|db|bak|log)$/i;
const pseudoPath = (file) => /^\/(?:proc|sys|dev|run)(?:\/|$)/.test(file);
function excluded(file) {
  return (
    pseudoPath(file) ||
    sensitive.test(file) ||
    [...file].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
function redact(text) {
  if (typeof text !== "string" || text.includes("\0")) return "[content unavailable]";
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) return "[sensitive content omitted]";
  return text
    .slice(0, 8192)
    .split(/\r?\n/)
    .map((line) => {
      if (
        /password|passwd|\bpwd\b|secret|token|credential|authorization|api[_-]?key|connectionstring|client[_-]?secret|private[_-]?key|identified\s+by|(?:Bearer|Basic)\s+[A-Za-z0-9+/=_-]+|[a-z]+:\/\/[^\s/]+:[^\s/]+@|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\b(?:gh[pousr]_|github_pat_|sk-)[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[A-Za-z0-9+/=_-]{40,}/i.test(
          line,
        )
      )
        return "[sensitive line omitted]";
      return line;
    })
    .join("\n");
}
function safeEvent(event) {
  if (
    excluded(event.path) ||
    (event.root?.startsWith("/") && pseudoPath(path.posix.join(event.root, event.path)))
  )
    return null;
  return {
    ...event,
    ...(event.content
      ? {
          content: {
            ...event.content,
            before: redact(event.content.before),
            after: redact(event.content.after),
          },
        }
      : {}),
  };
}
function within(root, file) {
  const relative = path.relative(root, file);
  return (
    relative === "" ||
    (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))
  );
}
const defaultActivitySettings = {
  version: 1,
  noiseFolders: [
    "Temp",
    "tmp",
    "cache",
    "caches",
    ".codex/vendor_imports",
    ".codex/tmp",
    ".vscode/extensions",
  ],
  summarySeconds: 30,
  noiseRetentionDays: 2,
  noisePercent: 20,
};
function activityCategory(event, settings = defaultActivitySettings) {
  if (event.kind === "gap") return "work";
  const normalize = (s) => s.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  let file = normalize(event.root + "/" + event.path);
  const windows = /^[a-z]:/i.test(file);
  if (windows) file = file.toLowerCase();
  return settings.noiseFolders.some((folder) => {
    const rule = windows ? folder.toLowerCase() : folder;
    return ("/" + file + "/").includes("/" + rule + "/");
  }) || /\.(?:tmp|temp|swp|swo)$/i.test(event.path)
    ? "noise"
    : "work";
}
// Independent count AND byte reservations prevent a cache storm evicting Work.
// Keep original identities/order: acknowledgements still refer to raw events.
function retainActivity(events, policy, settings = defaultActivitySettings, now = Date.now()) {
  const fraction = settings.noisePercent / 100;
  const limits = {
    noise: Math.floor(policy.maxEvents * fraction),
    work: policy.maxEvents - Math.floor(policy.maxEvents * fraction),
  };
  const budgets = {
    noise: Math.floor(999_996 * fraction),
    work: 999_996 - Math.floor(999_996 * fraction),
  };
  const counts = { noise: 0, work: 0 },
    bytes = { noise: 0, work: 0 };
  const kept = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i],
      category = activityCategory(e, settings);
    const days =
      category === "noise"
        ? Math.min(policy.retentionDays, settings.noiseRetentionDays)
        : policy.retentionDays;
    if (Date.parse(e.at) < now - days * 86400000) continue;
    const size = Buffer.byteLength(JSON.stringify(e)) + 1;
    if (counts[category] >= limits[category] || bytes[category] + size > budgets[category])
      continue;
    counts[category]++;
    bytes[category] += size;
    kept.push(e);
  }
  return kept.reverse();
}
function summarizeActivity(events, settings = defaultActivitySettings) {
  const rows = [],
    latest = new Map();
  for (const e of [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const category = activityCategory(e, settings);
    const key = JSON.stringify([e.bootId, e.root, e.path, e.kind, e.source, e.attribution]);
    const prior = latest.get(key);
    if (
      !e.content &&
      prior &&
      !prior.content &&
      Date.parse(e.at) - Date.parse(prior.firstAt) < settings.summarySeconds * 1000
    ) {
      prior.count++;
      prior.at = e.at;
      continue;
    }
    const row = { ...e, category, count: 1, firstAt: e.at };
    rows.push(row);
    latest.set(key, row);
  }
  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
module.exports = {
  excluded,
  redact,
  safeEvent,
  within,
  pseudoPath,
  defaultActivitySettings,
  activityCategory,
  retainActivity,
  summarizeActivity,
};
