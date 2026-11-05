import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { CodeRepositories } from "../src/code-repositories.js";
import { GitEngine } from "../src/git-engine.js";
import { RepositoryCenter } from "../src/repository-center.js";

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
    const result = await runNativeAcceptance({
      RepositoryCenter,
      GitEngine,
      CodeRepositories,
      binary,
      onStage: (stage: string) => console.info("Native Git phase: " + stage),
    });
    expect(result.status).toBe("PASS");
    expect(result.checks).toContain("restored-refs-roles-pr-reviews");
    expect(existsSync(result.root)).toBe(false);
  },
  180000,
);
it.skipIf(!existsSync(binary))(
  "browses and shares actual hosted source through the Code workspace without elevating readers",
  async () => {
    const result = await runNativeAcceptance({
      RepositoryCenter,
      GitEngine,
      CodeRepositories,
      binary,
      codeOnly: true,
      onStage: (stage: string) => console.info("Native Code phase: " + stage),
    });
    expect(result.status).toBe("PASS");
    expect(result.checks).toContain("committed-code-browser-and-zip");
    expect(result.checks).toContain("provider-read-share-and-revoke");
    expect(result.checks).toContain("code-workspace-provider-sharing-and-browsing");
    expect(existsSync(result.root)).toBe(false);
  },
  180000,
);
