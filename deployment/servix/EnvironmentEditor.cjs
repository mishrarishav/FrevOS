// Values are resolved only here, at the enrolled source connector.
const fs = require("node:fs/promises"),
  path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const fail = (code) => {
  throw Error("local-development-" + code);
};
const keyPattern = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const referencePattern = /^\.env(?:\.[A-Za-z0-9_-]+)?$/;
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
function visible(key, value) {
  if (["DB_HOST", "PGHOST", "HOST"].includes(key))
    return /^[A-Za-z0-9_.:\[\]-]{1,253}$/.test(value);
  if (["DB_NAME", "PGDATABASE"].includes(key)) return /^[A-Za-z0-9_.-]{1,128}$/.test(value);
  if (["PORT", "DB_PORT", "PGPORT"].includes(key))
    return /^\d{1,5}$/.test(value) && Number(value) > 0 && Number(value) < 65536;
  if (key === "NODE_ENV") return ["development", "production", "test"].includes(value);
  return (
    /^(?:MAIL_ENABLED|ENABLE_EMAIL_LISTENER|LOCAL_MAIL_DISABLED|LOCAL_OUTGOING_MAIL_DISABLED|LOCAL_MAIL_LISTENER_DISABLED|AUTO_CLOSE_RESOLVED_ENABLED|AUTO_RESOLVE_PENDING_USER_ENABLED)$/.test(
      key,
    ) && /^(?:true|false|0|1)$/.test(value)
  );
}
function context(request, keyId) {
  return JSON.stringify([
    "local-environment-v1",
    "ws_server20",
    request.requestId,
    request.deviceId,
    request.profileId,
    request.expectedRevision,
    request.fingerprint,
    request.serviceId,
    request.reference,
    request.documentRevision,
    keyId,
  ]);
}
// Keep unchanged source lines byte-for-byte. Reject multiline/duplicate syntax
// rather than silently damaging an unfamiliar dotenv document.
function document(text) {
  if (Buffer.byteLength(text) > 65536 || text.includes("\0")) fail("environment-capacity");
  const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
  const source = text.slice(bom.length);
  const lines = source.match(/[^\r\n]*(?:\r\n|\n|$)/g).filter(Boolean);
  const rows = [],
    keys = new Set();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].replace(/\r?\n$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]{0,127})(\s*=\s*)(.*)$/);
    if (!match || keys.has(match[2])) fail("environment-syntax-unsupported");
    const raw = match[4].trim();
    let value,
      comment = "";
    if (raw.startsWith('"') || raw.startsWith("'")) {
      const quote = raw[0];
      let end = -1;
      for (let at = 1; at < raw.length; at++) {
        if (quote === '"' && raw[at] === "\\") {
          at++;
          continue;
        }
        if (raw[at] === quote) {
          end = at;
          break;
        }
      }
      if (end < 0 || !/^\s*(?:#.*)?$/.test(raw.slice(end + 1)))
        fail("environment-syntax-unsupported");
      value = raw.slice(1, end);
      if (quote === '"')
        value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"');
      comment = raw.slice(end + 1);
    } else {
      const at = raw.indexOf("#");
      value = (at < 0 ? raw : raw.slice(0, at)).trimEnd();
      if (at >= 0) comment = " " + raw.slice(at);
    }
    keys.add(match[2]);
    rows.push({ key: match[2], value, index, prefix: match[1] + match[2] + match[3], comment });
  }
  if (rows.length > 512) fail("environment-capacity");
  return { bom, lines, rows, newline: source.includes("\r\n") ? "\r\n" : "\n" };
}
function patch(text, changes) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 512)
    fail("invalid-environment-changes");
  const doc = document(text),
    seen = new Set();
  const existing = new Map(doc.rows.map((row) => [row.key, row]));
  let count = existing.size;
  for (const change of changes) {
    if (!change || !keyPattern.test(change.key) || seen.has(change.key))
      fail("invalid-environment-changes");
    seen.add(change.key);
    const row = existing.get(change.key);
    if (change.operation === "delete") {
      if (Object.keys(change).sort().join() !== "key,operation" || !row)
        fail("invalid-environment-changes");
      // Retain a trailing inline comment as its own comment line.
      doc.lines[row.index] = row.comment.trim() ? row.comment.trimStart() + doc.newline : "";
      count--;
    } else if (change.operation === "set") {
      if (
        Object.keys(change).sort().join() !== "key,operation,value" ||
        typeof change.value !== "string" ||
        change.value.length > 8192 ||
        /[\0\r\n]/.test(change.value)
      )
        fail("invalid-environment-changes");
      // Dotenv has no portable escaping for both quote styles or literal
      // backslash-n. Fail closed instead of changing the application's value.
      const value = change.value;
      let encoded;
      if (!value.includes("'")) encoded = "'" + value + "'";
      else if (!value.includes('"') && !/\\[nr]/.test(value) && !value.endsWith("\\"))
        encoded = '"' + value + '"';
      else fail("environment-value-unsupported");
      if (row) {
        const ending = doc.lines[row.index].endsWith("\r\n")
          ? "\r\n"
          : doc.lines[row.index].endsWith("\n")
            ? "\n"
            : "";
        doc.lines[row.index] = row.prefix + encoded + row.comment + ending;
      } else {
        if (doc.lines.length && !doc.lines.at(-1).endsWith("\n")) doc.lines.push(doc.newline);
        doc.lines.push(change.key + "=" + encoded + doc.newline);
        count++;
      }
    } else fail("invalid-environment-changes");
  }
  const result = doc.bom + doc.lines.join("");
  if (count > 512 || Buffer.byteLength(result) > 65536) fail("environment-capacity");
  const verified = new Map(document(result).rows.map((r) => [r.key, r.value]));
  for (const change of changes)
    if (
      change.operation === "set"
        ? verified.get(change.key) !== change.value
        : verified.has(change.key)
    )
      fail("environment-value-unsupported");
  return result;
}
async function write(file, expectedDigest, content) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      path.join(process.env.WINDIR, "System32/WindowsPowerShell/v1.0/powershell.exe"),
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        path.join(__dirname, "Write-LocalEnvironment.ps1"),
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    );
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(Error("local-development-environment-save-unconfirmed"));
    }, 20000);
    child.stdout.on("data", (bytes) => {
      if (output.length < 256) output += bytes;
    });
    child.once("error", () => {
      clearTimeout(timer);
      reject(Error("local-development-environment-save-failed"));
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 && output.trim() === "saved") resolve();
      else reject(Error("local-development-environment-save-failed"));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ file, expectedDigest, content }));
  });
}
class EnvironmentEditor {
  constructor(credential) {
    this.credential = credential;
    this.keys = crypto.generateKeyPairSync("x25519");
    this.publicKey = this.keys.publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
      .toString("hex");
    this.keyId = hash(this.publicKey);
  }
  metadata() {
    return { keyId: this.keyId, publicKey: this.publicKey };
  }
  revision(serviceId, reference, bytes) {
    return crypto
      .createHmac("sha256", this.credential)
      .update(serviceId + "/" + reference)
      .update(bytes)
      .digest("hex");
  }
  async read(file, serviceId, reference) {
    if (!referencePattern.test(reference)) fail("environment-unavailable");
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 65536)
      fail("environment-file-unavailable");
    const bytes = await fs.readFile(file);
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) fail("environment-syntax-unsupported");
    const doc = document(text);
    return {
      serviceId,
      reference,
      revision: this.revision(serviceId, reference, bytes),
      rows: doc.rows.map(({ key, value }) =>
        visible(key, value) ? { key, masked: false, value } : { key, masked: true },
      ),
    };
  }
  async save(file, request) {
    if (request.approved !== true || request.sealed?.keyId !== this.keyId)
      fail("environment-key-changed");
    const current = await this.read(file, request.serviceId, request.reference);
    if (current.revision !== request.documentRevision) fail("environment-document-changed");
    const aad = Buffer.from(context(request, this.keyId));
    let changes;
    try {
      const peer = crypto.createPublicKey({
        format: "der",
        type: "spki",
        key: Buffer.concat([
          Buffer.from("302a300506032b656e032100", "hex"),
          Buffer.from(request.sealed.publicKey, "hex"),
        ]),
      });
      const shared = crypto.diffieHellman({ privateKey: this.keys.privateKey, publicKey: peer });
      const key = Buffer.from(
        crypto.hkdfSync("sha256", shared, Buffer.from(this.keyId, "hex"), aad, 32),
      );
      shared.fill(0);
      const cipher = Buffer.from(request.sealed.ciphertext, "hex");
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(request.sealed.iv, "hex"),
      );
      decipher.setAAD(aad);
      decipher.setAuthTag(cipher.subarray(-16));
      const clear = Buffer.concat([decipher.update(cipher.subarray(0, -16)), decipher.final()]);
      try {
        if (clear.length > 65536) throw Error();
        changes = JSON.parse(clear.toString("utf8"));
      } finally {
        clear.fill(0);
        key.fill(0);
      }
    } catch {
      fail("environment-sealed-request-invalid");
    }
    const before = await fs.readFile(file);
    if (this.revision(request.serviceId, request.reference, before) !== request.documentRevision)
      fail("environment-document-changed");
    const updated = patch(before.toString("utf8"), changes);
    await write(file, hash(before), updated);
  }
}
module.exports = { EnvironmentEditor, document, patch, context, visible };
