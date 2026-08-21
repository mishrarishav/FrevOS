import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rawBasePath: unknown = Reflect.get(process.env, "FREVOS_BASE_PATH");
if (rawBasePath !== undefined && typeof rawBasePath !== "string") {
  throw new Error("FREVOS_BASE_PATH must be a string");
}
const configuredBasePath = rawBasePath ?? "";
if (!/^$|^\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(configuredBasePath)) {
  throw new Error("FREVOS_BASE_PATH must be empty or one normalized URL path segment");
}

export default defineConfig({
  base: configuredBasePath === "" ? "/" : `${configuredBasePath}/`,
  plugins: [react()],
  build: {
    sourcemap: false,
  },
  test: {
    coverage: {
      include: ["src/api.ts", "src/experience.ts", "src/routing.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
});
