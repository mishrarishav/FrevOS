// Official pinned test engine only; no service/account/live configuration changes.
import { mkdir, readFile, writeFile, rename, chmod } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
export const testEnginePins = {
  win32: {
    asset: "gitea-28.2.0-windows-4.0-amd64.exe",
    hash: "d13471c433903d8c6c8b4cc7dd2783cff8b8ffb66d4698a76c2c0213ac378d53",
    file: "gitea-28.2.0-native.exe",
  },
  linux: {
    asset: "gitea-28.2.0-linux-amd64",
    hash: "15681fc615d56611c274f52803fef4d6d5316b620f93b677dd4b831a74e50b9f",
    file: "gitea-28.2.0-native",
  },
};
export async function prepareTestEngine() {
  const pin = testEnginePins[process.platform];
  if (!pin || process.arch !== "x64") throw Error("test-engine-platform-unsupported");
  const root = fileURLToPath(new URL("../.local/gitea/", import.meta.url));
  await mkdir(root, { recursive: true });
  const file = join(root, pin.file);
  const valid = (bytes) => createHash("sha256").update(bytes).digest("hex") === pin.hash;
  try {
    if (valid(await readFile(file))) return file;
    throw Error("test-engine-existing-identity");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const response = await fetch("https://dl.gitea.com/gitea/28.2.0/" + pin.asset, {
    redirect: "error",
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok || Number(response.headers.get("content-length")) > 160000000)
    throw Error("test-engine-download-failed");
  const parts = [];
  let length = 0;
  for await (const part of response.body) {
    length += part.length;
    if (length > 160000000) throw Error("test-engine-download-capacity");
    parts.push(part);
  }
  const bytes = Buffer.concat(parts);
  if (!valid(bytes)) throw Error("test-engine-download-identity");
  const temporary = file + ".verified";
  await writeFile(temporary, bytes, { flag: "wx", mode: 0o700 });
  await rename(temporary, file);
  if (process.platform !== "win32") await chmod(file, 0o700);
  return file;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await prepareTestEngine();
  console.log("Pinned isolated Git test engine verified.");
}
