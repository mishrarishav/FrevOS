import { describe, expect, it } from "vitest";
import { databaseRoleFromConnectionString } from "../src/database.js";

describe("database deployment configuration", () => {
  it("derives a validated PostgreSQL login role without returning credentials", () => {
    expect(
      databaseRoleFromConnectionString(
        "postgresql://frevos_runtime_uat:do-not-log@database.internal/frevos_uat",
      ),
    ).toBe("frevos_runtime_uat");
    expect(
      databaseRoleFromConnectionString(
        "postgres://frevos%5Fruntime:do-not-log@database.internal/frevos_uat",
      ),
    ).toBe("frevos_runtime");
  });

  it.each([
    "https://frevos_runtime:secret@example.test/database",
    "postgresql://x:secret@example.test/database",
    "postgresql://Uppercase:secret@example.test/database",
    "postgresql://bad%2Frole:secret@example.test/database",
    "postgresql://bad%ZZrole:secret@example.test/database",
  ])("rejects an unsafe database connection role in %s", (connectionString) => {
    expect(() => databaseRoleFromConnectionString(connectionString)).toThrow(
      /PostgreSQL|invalid role name/,
    );
  });
});
