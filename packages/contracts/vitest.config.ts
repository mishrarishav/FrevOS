import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep Windows CI memory bounded on the enrolled laptop builder.
    ...(process.platform === "win32" ? { maxWorkers: 1 } : {}),
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
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
