import { describe, expect, it } from "vitest";
import {
  ConnectGithubRepositoryRequestSchema,
  GithubConnectionSchema,
  GithubDiscoveryCompletionSchema,
  GithubDiscoveryOperationSchema,
  GithubDiscoveryResultSchema,
} from "../src/index.js";

const repository = {
  providerRepositoryId: "1326088905",
  owner: "mishrarishav",
  name: "FrevOS",
  url: "https://github.com/mishrarishav/FrevOS",
  defaultBranch: "main",
  visibility: "public",
  archived: false,
} as const;

const discovery = {
  provider: "github",
  account: { providerAccountId: "12345678", login: "mishrarishav" },
  repositories: [repository],
} as const;

describe("GitHub onboarding contracts", () => {
  it("accepts a verified account and canonical bounded repository catalog", () => {
    expect(GithubDiscoveryResultSchema.parse(discovery)).toEqual(discovery);
    expect(() =>
      GithubDiscoveryResultSchema.parse({
        ...discovery,
        repositories: [{ ...repository, url: "https://github.com/another/repository" }],
      }),
    ).toThrow();
  });

  it("keeps discovery completion and operation evidence strict", () => {
    expect(
      GithubDiscoveryCompletionSchema.parse({ status: "succeeded", result: discovery }),
    ).toMatchObject({ status: "succeeded" });
    expect(() =>
      GithubDiscoveryCompletionSchema.parse({ status: "failed", result: { message: "failed" } }),
    ).toThrow();
    expect(
      GithubDiscoveryOperationSchema.parse({
        operationId: "op_github_discovery_01",
        workspaceId: "ws_uat_demo",
        agentId: "svc_trackgrn_windows_agent",
        requestedBy: "usr_windows_admin",
        action: "github.account.discover",
        status: "queued",
        result: null,
        errorCode: null,
        createdAt: "2026-08-23T10:00:00.000Z",
        claimedAt: null,
        completedAt: null,
      }),
    ).toMatchObject({ status: "queued" });
  });

  it("binds project creation to one discovered connection and repository", () => {
    expect(
      ConnectGithubRepositoryRequestSchema.parse({
        connectionId: "ghc_personal_github",
        providerRepositoryId: repository.providerRepositoryId,
        displayName: "FrevOS",
      }),
    ).toMatchObject({ displayName: "FrevOS" });
  });

  it("returns a browser-safe connection without provider credentials", () => {
    const connection = GithubConnectionSchema.parse({
      connectionId: "ghc_personal_github",
      workspaceId: "ws_uat_demo",
      provider: "github",
      providerAccountId: discovery.account.providerAccountId,
      login: discovery.account.login,
      agentId: "svc_trackgrn_windows_agent",
      status: "active",
      repositories: discovery.repositories,
      verifiedAt: "2026-08-23T10:00:00.000Z",
      createdAt: "2026-08-23T10:00:00.000Z",
    });
    expect(JSON.stringify(connection).toLowerCase()).not.toContain("token");
    expect(JSON.stringify(connection).toLowerCase()).not.toContain("password");
  });
});
