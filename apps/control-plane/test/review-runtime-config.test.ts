import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const base = {
  DATABASE_URL: "postgresql://frevos_runtime:fixture@database.internal/frevos",
  FREVOS_PUBLIC_ORIGIN: "https://platform.example.test",
  FREVOS_AUTH_MODE: "local",
};

describe("central Reviews runtime configuration", () => {
  it("disables background monitoring explicitly without enrolling other workspaces", () => {
    const config = loadConfig({ ...base, DEVSETU_REVIEWS_MONITORING_ENABLED: "false" });
    expect(config.reviewMonitoringEnabled).toBe(false);
    expect(config.reviewWorkspaceIds).toEqual([]);
  });

  it("accepts an explicit bounded worker workspace list and rejects duplicates", () => {
    expect(
      loadConfig({ ...base, DEVSETU_REVIEWS_WORKSPACES: '["ws_team_one","ws_team_two"]' })
        .reviewWorkspaceIds,
    ).toEqual(["ws_team_one", "ws_team_two"]);
    expect(() =>
      loadConfig({ ...base, DEVSETU_REVIEWS_WORKSPACES: '["ws_team_one","ws_team_one"]' }),
    ).toThrow(/Duplicate/);
    expect(() =>
      loadConfig({ ...base, DEVSETU_REVIEWS_WORKSPACES: '["foreign-invalid"]' }),
    ).toThrow();
  });

  it("rejects ambiguous background switches rather than treating strings as truthy", () => {
    expect(() => loadConfig({ ...base, DEVSETU_REVIEWS_MONITORING_ENABLED: "0" })).toThrow();
    expect(() => loadConfig({ ...base, DEVSETU_REVIEWS_MONITORING_ENABLED: "FALSE" })).toThrow();
  });
});
