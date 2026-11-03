import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [basePath, ...extra] = process.argv.slice(2);
if (
  extra.length ||
  (basePath?.length ?? 0) > 65 ||
  !/^\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(basePath ?? "")
)
  throw Error("Supply one normalized browser entry path, for example /workspace");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ui = join(root, "apps", "control-center");
const require = createRequire(join(ui, "package.json"));
const vite = join(dirname(require.resolve("vite/package.json")), "bin", "vite.js");
const result = spawnSync(process.execPath, [vite, "build", "--outDir", "dist-browser"], {
  cwd: ui,
  env: {
    ...process.env,
    FREVOS_BASE_PATH: basePath,
    VITE_FREVOS_AUTH_MODE: "local",
    VITE_DEVSETU_BROWSER_ENTRY: "true",
    VITE_FREVOS_COOKIE_NAMESPACE: basePath.slice(1),
  },
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
await writeFile(
  join(ui, "dist-browser", "browser-entry.json"),
  JSON.stringify({ version: 1, basePath }),
);
