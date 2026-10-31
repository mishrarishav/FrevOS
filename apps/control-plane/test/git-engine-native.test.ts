import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { RepositoryCenter } from "../src/repository-center.js";
import { GitEngine } from "../src/git-engine.js";
const binary =
  process.env["DEVSETU_TEST_GITEA"] ??
  fileURLToPath(
    new URL(
      "../../../.local/gitea/gitea-28.2.0-native" + (process.platform === "win32" ? ".exe" : ""),
      import.meta.url,
    ),
  );
const { runNativeAcceptance } = createRequire(import.meta.url)(
  "../../../scripts/test-private-git.cjs",
);
it.skipIf(!existsSync(binary))(
  "uses the pinned native engine for real Git/PR/RBAC and encrypted full recovery including metadata",
  async () => {
    const result = await runNativeAcceptance({ RepositoryCenter, GitEngine, binary });
    expect(result.status).toBe("PASS");
    expect(result.checks).toContain("restored-refs-roles-pr-reviews");
    expect(existsSync(result.root)).toBe(false);
  },
  180000,
);
