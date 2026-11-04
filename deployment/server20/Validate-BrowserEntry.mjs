import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [release, profileFile] = process.argv.slice(2);
if (!release || !profileFile || process.argv.length !== 4)
  throw Error("browser-entry-validation-input");
const { loadBrowserEntry } = await import(
  pathToFileURL(join(release, "apps/control-plane/dist/browser-entry.js")).href
);
const profile = await loadBrowserEntry(profileFile);
if (!profile) throw Error("browser-entry-profile-required");
const metadata = JSON.parse(
  await readFile(join(release, "apps/control-center/dist-browser/browser-entry.json"), "utf8"),
);
if (
  metadata.version !== 1 ||
  metadata.basePath !== profile.basePath ||
  (profile.connectorTransport && metadata.connectorTransport !== 1)
)
  throw Error("browser-entry-assets-mismatch");
process.stdout.write(JSON.stringify(profile));
