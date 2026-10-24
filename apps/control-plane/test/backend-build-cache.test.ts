import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";

it.skipIf(process.platform !== "win32")(
  "checks cache availability without transferring old tarballs; build-time SRI still rejects corruption",
  async () => {
    const require = createRequire(import.meta.url);
    const cache = require(
      require.resolve("cacache", {
        paths: [join(dirname(process.execPath), "node_modules/npm")],
      }),
    );
    const { existingTarball } = require("../../../deployment/servix/Publish-GitDependencies.cjs");
    const root = await mkdtemp(join(tmpdir(), "devsetu-build-cache-"));
    try {
      const integrity = await cache.put(
        root,
        "synthetic-public-tarball",
        Buffer.from("verified fixture tarball"),
      );
      expect(await existingTarball(root, integrity.toString())).toBe(true);
      const entry = await cache.get.info(root, "synthetic-public-tarball");
      const content = await cache.get.hasContent(root, integrity.toString());
      expect(content.size).toBe(24);
      // Alter only this owned temporary cache, proving that availability is not
      // confused with the SRI verification performed by the actual npm build.
      expect(entry.integrity).toBe(integrity.toString());
      const file = resolve(entry.path);
      expect(file.startsWith(resolve(root) + "/") || file.startsWith(resolve(root) + "\\")).toBe(
        true,
      );
      await writeFile(file, "corrupted fixture");
      expect(await existingTarball(root, integrity.toString())).toBe(true);
      await expect(
        cache.get.byDigest(root, integrity.toString(), { memoize: false }),
      ).rejects.toMatchObject({ code: "EINTEGRITY" });
      await rm(file);
      expect(await existingTarball(root, integrity.toString())).toBe(false);
    } finally {
      expect(dirname(resolve(root))).toBe(resolve(tmpdir()));
      expect(basename(root).startsWith("devsetu-build-cache-")).toBe(true);
      await rm(root, { recursive: true, force: true });
    }
  },
);
