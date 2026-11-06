import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWafEnvironment } from "./waf-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, ".local/waf.env");
const action = process.argv[2];
if (!["up", "down", "status", "validate"].includes(action))
  throw Error("Use up, down, status or validate");
await mkdir(dirname(file), { recursive: true });
try {
  await copyFile(join(root, "deployment/waf/waf.env.example"), file, 1);
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}
const values = parseWafEnvironment(await readFile(file, "utf8"));
const args = [
  "compose",
  "--project-name",
  "frevos-waf",
  "--env-file",
  file,
  "-f",
  join(root, "compose.waf.yaml"),
];
// The sidecar has no app/database volume and never starts/recreates the app stack.
const command =
  action === "up"
    ? ["up", "--wait", "--no-deps", "waf"]
    : action === "down"
      ? ["down"]
      : action === "status"
        ? ["ps"]
        : ["config", "--quiet"];
const result = spawnSync("docker", [...args, ...command], {
  cwd: root,
  env: { ...process.env, ...values },
  stdio: "inherit",
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (action === "up")
  console.log(
    `Local WAF: http://${values.FREVOS_WAF_BIND}:${values.FREVOS_WAF_PORT} (${values.FREVOS_WAF_MODE}). This is not a live gateway deployment.`,
  );
