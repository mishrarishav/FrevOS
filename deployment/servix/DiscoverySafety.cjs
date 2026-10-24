"use strict";
const path = require("node:path");
const sensitive =
  /(^|[\\/])(?:\.git|\.ssh|\.aws|\.azure|\.gnupg|\.kube|\.npm|\.nuget|\.local|\.config|\.cache|AppData|node_modules|vendor|coverage|dist|build|obj|bin|proc|sys|dev|run|System Volume Information|\$Recycle\.Bin|Windows|ProgramData)(?:[\\/]|$)|(?:^|[\\/])(?:\.env[^\\/]*|\.npmrc|\.netrc|\.git-credentials|[^\\/]*(?:credential|secret|password|private[-_]?key|token|id_rsa|id_ed25519)[^\\/]*|appsettings[^\\/]*\.json|web\.config)(?:$|[\\/])|\.(?:pem|key|pfx|p12|kdbx|sqlite|db|bak|log)$/i;
function excluded(file) {
  return (
    sensitive.test(file) || [...file].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
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
  if (excluded(event.path)) return null;
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
module.exports = { excluded, redact, safeEvent, within };
