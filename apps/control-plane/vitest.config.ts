import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      RYUK_CONTAINER_IMAGE:
        "testcontainers/ryuk:0.14.0@sha256:7c1a8a9a47c780ed0f983770a662f80deb115d95cce3e2daa3d12115b8cd28f0",
    },
    hookTimeout: 120_000,
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/bootstrap-local-user.ts", "src/main.ts", "src/migrate.ts"],
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 95,
        statements: 95,
      },
    },
  },
});
