import { expect, it } from "vitest";
import {
  CheckoutPathSchema,
  DeploymentSettingsInputSchema,
  PreservedPathSchema,
  RepositoryOriginSchema,
  SERVIX_REPOSITORY,
  matchesDeploymentRepository,
} from "../src/deployment-settings.js";

it("accepts literal attachment paths and denies traversal, globs, absolute paths and Windows aliases", () => {
  expect(PreservedPathSchema.parse("backend\\attachment")).toBe("backend/attachment");
  expect(PreservedPathSchema.parse("frontend/user content")).toBe("frontend/user content");
  for (const p of [
    "../",
    "backend/../src",
    "C:/attachment",
    "/attachment",
    "backend//attachment",
    "**/assets",
    "backend/NUL.txt",
    "backend/attachments.",
    "backend/x:stream",
  ])
    expect(PreservedPathSchema.safeParse(p).success, p).toBe(false);
  for (const p of [
    "C:\\",
    "\\\\server\\share",
    "D:\\foo\\..\\app",
    "D:\\foo.\\app",
    "D:\\foo\\\\app",
  ])
    expect(CheckoutPathSchema.safeParse(p).success).toBe(false);
});
it("excludes credentials and shell fields from project settings", () => {
  expect(RepositoryOriginSchema.safeParse(SERVIX_REPOSITORY.origin).success).toBe(true);
  expect(RepositoryOriginSchema.safeParse("//other-server/share/repo.git").success).toBe(false);
  const profile = { profileId: "servix-development", repositoryOrigin: SERVIX_REPOSITORY.origin };
  const probe = {
    version: 1 as const,
    profileId: profile.profileId,
    repository: "D:\\ServixDev",
    origin: SERVIX_REPOSITORY.origin,
    repositoryId: SERVIX_REPOSITORY.id,
    remoteName: "frevos" as const,
    head: "a".repeat(40),
    branch: "feature/dev",
    checkedAt: new Date().toISOString(),
  };
  expect(matchesDeploymentRepository(profile, probe)).toBe(true);
  for (const changed of [
    { origin: "https://github.com/old/project.git" },
    { repositoryId: "gitrepo_" + "b".repeat(32) },
    { remoteName: "origin" as const },
    { profileId: "other-project" },
  ])
    expect(matchesDeploymentRepository(profile, { ...probe, ...changed })).toBe(false);
  expect(matchesDeploymentRepository(profile, undefined)).toBe(false);
  for (const u of [
    "https://user:pass@example.com/repo.git",
    "https://example.com/repo.git?token=x",
    "https://example.com/repo.git#token",
    "file:///repo.git",
    "ssh://user:secret@host/repo",
    "https://example.com\\@evil/repo",
  ])
    expect(RepositoryOriginSchema.safeParse(u).success, u).toBe(false);
  expect(RepositoryOriginSchema.safeParse("https://example.com/team/repo.git").success).toBe(true);
  expect(RepositoryOriginSchema.safeParse("git@example.com:team/repo.git").success).toBe(true);
  expect(
    DeploymentSettingsInputSchema.safeParse({
      version: 1,
      password: "not-allowed",
      command: "run-anything",
    }).success,
  ).toBe(false);
});
