import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createReadStream, createWriteStream } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";

const run = promisify(execFile),
  require = createRequire(import.meta.url);
const { sourceFiles } = require("./Setup-Linux.cjs");
const source = dirname(fileURLToPath(import.meta.url));
const version = "24.19.0",
  runtimeDigest = "14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647";
function header(name, size, mode, directory = false) {
  const h = Buffer.alloc(512),
    oct = (offset, length, value) =>
      h.write(value.toString(8).padStart(length - 1, "0") + "\0", offset, length, "ascii");
  if (Buffer.byteLength(name) > 100) {
    const split = name.lastIndexOf("/", name.length - 2);
    if (
      split < 0 ||
      Buffer.byteLength(name.slice(0, split)) > 155 ||
      Buffer.byteLength(name.slice(split + 1)) > 100
    )
      throw Error("tar-name-capacity");
    h.write(name.slice(0, split), 345, 155);
    name = name.slice(split + 1);
  }
  h.write(name, 0, 100);
  oct(100, 8, mode);
  oct(108, 8, 0);
  oct(116, 8, 0);
  oct(124, 12, size);
  oct(136, 12, 0);
  h.fill(32, 148, 156);
  h.write(directory ? "5" : "0", 156);
  h.write("ustar\0", 257);
  h.write("00", 263);
  h.write("devsetu", 265);
  h.write("devsetu", 297);
  const sum = h.reduce((n, v) => n + v, 0);
  h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return h;
}
async function build(output) {
  output = resolve(output);
  const parent = dirname(output);
  await mkdir(parent, { recursive: true });
  try {
    await lstat(output);
    throw Error("linux-download-already-exists");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const staging = await mkdtemp(join(parent, "prepare-linux-")),
    archive = join(staging, `node-v${version}-linux-x64.tar.xz`);
  try {
    const response = await fetch(
      `https://nodejs.org/dist/v${version}/node-v${version}-linux-x64.tar.xz`,
      { redirect: "error", signal: AbortSignal.timeout(300000) },
    );
    if (!response.ok || !response.body) throw Error("linux-runtime-download-unavailable");
    const stream = await open(archive, "wx", 0o600),
      hash = createHash("sha256");
    let size = 0;
    try {
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 150_000_000) throw Error("runtime-capacity");
        hash.update(chunk);
        await stream.write(chunk);
      }
      await stream.sync();
    } finally {
      await stream.close();
    }
    if (hash.digest("hex") !== runtimeDigest) throw Error("linux-runtime-integrity");
    const tar =
        process.platform === "win32"
          ? join(process.env.WINDIR, "System32/tar.exe")
          : "/usr/bin/tar",
      folder = `node-v${version}-linux-x64`;
    const verbose = (
      await run(tar, ["-tvf", archive], { windowsHide: true, timeout: 30000, maxBuffer: 2_000_000 })
    ).stdout;
    const links = verbose
      .split(/\r?\n/)
      .filter((line) => line.startsWith("l"))
      .map((line) => line.match(/ ([^ ]+) -> /)?.[1]);
    if (links.some((link) => !link || !link.startsWith(folder + "/")))
      throw Error("linux-runtime-link-index");
    const args = [
      "-xf",
      archive,
      "-C",
      staging,
      ...links.map((link) => "--exclude=" + link),
      "--exclude=" + folder + "/include",
      "--exclude=" + folder + "/share",
    ];
    await run(tar, args, { windowsHide: true, timeout: 120000, maxBuffer: 4096 });
    const runtime = join(staging, folder);
    const zipped = createGzip({ level: 6 }),
      target = createWriteStream(output, { flags: "wx" });
    zipped.pipe(target);
    const write = async (bytes) => {
      if (!zipped.write(bytes)) await once(zipped, "drain");
    };
    const add = async (file, name, mode) => {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) throw Error("linux-package-entry-invalid");
      await write(header(name, info.size, mode));
      for await (const chunk of createReadStream(file)) await write(chunk);
      if (info.size % 512) await write(Buffer.alloc(512 - (info.size % 512)));
    };
    for (const file of [...sourceFiles, "Setup-Linux.cjs", "install.sh"].sort())
      await add(join(source, file), file, file.endsWith(".sh") ? 0o755 : 0o644);
    const walk = async (directory) => {
      for (const name of (await readdir(directory)).sort()) {
        const file = join(directory, name),
          info = await lstat(file),
          entry = "runtime/" + relative(runtime, file).replaceAll("\\", "/");
        if (info.isSymbolicLink()) throw Error("linux-package-unexpected-link");
        if (info.isDirectory()) {
          await write(header(entry + "/", 0, 0o755, true));
          await walk(file);
        } else await add(file, entry, entry === "runtime/bin/node" ? 0o755 : 0o644);
      }
    };
    await write(header("runtime/", 0, 0o755, true));
    await walk(runtime);
    await write(Buffer.alloc(1024));
    zipped.end();
    await once(target, "close");
    return {
      output,
      runtimeVersion: version,
      runtimeArchiveSha256: runtimeDigest,
      sha256: createHash("sha256")
        .update(await readFile(output))
        .digest("hex"),
      bytes: (await stat(output)).size,
    };
  } finally {
    if (dirname(staging) === parent && staging.startsWith(join(parent, "prepare-linux-")))
      await rm(staging, { recursive: true, force: true });
  }
}
if (process.argv[2] !== "--output" || process.argv.length !== 4)
  throw Error("Use --output with a new Linux x64 archive path");
process.stdout.write(JSON.stringify(await build(process.argv[3])) + "\n");
