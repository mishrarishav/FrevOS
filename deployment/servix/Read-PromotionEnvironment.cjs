"use strict";
// Private execution boundary. Its output stays in the authenticated PSRP/backup
// pipe; callers must never forward it to browser state, diagnostics or logs.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { createRequire } = require("node:module");
function read(root, expected) {
  if (!path.isAbsolute(root) || !/^[a-f0-9]{64}$/.test(expected || ""))
    throw Error("environment-binding-scope");
  const environment = path.join(root, "backend/.env");
  for (let at = environment; ; at = path.dirname(at)) {
    if (fs.lstatSync(at).isSymbolicLink()) throw Error("environment-binding-link");
    if (path.dirname(at) === at) break;
  }
  const stat = fs.statSync(environment);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw Error("environment-binding-budget");
  const bytes = fs.readFileSync(environment);
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== expected)
    throw Error("environment-binding-drift");
  const requireAtTarget = createRequire(path.join(root, "backend/package.json")),
    value = requireAtTarget("dotenv").parse(bytes),
    port = Number(value.DB_PORT || 3306);
  if (
    !value.DB_HOST ||
    !value.DB_NAME ||
    !value.DB_USER ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw Error("environment-binding-shape");
  return {
    host: value.DB_HOST,
    port,
    database: value.DB_NAME,
    user: value.DB_USER,
    password: value.DB_PASSWORD || "",
  };
}
module.exports = { read };
if (require.main === module) {
  try {
    process.stdout.write(
      JSON.stringify(read(process.argv[2], process.argv[3])).replace(
        /[\u007f-\uffff]/g,
        (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
      ),
    );
  } catch {
    process.stderr.write("Private environment binding unavailable\n");
    process.exitCode = 1;
  }
}
