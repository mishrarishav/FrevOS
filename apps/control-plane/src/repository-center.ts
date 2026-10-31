import { randomBytes, createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { mkdir, open, readFile, lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createRequire } from "node:module";
import {
  RepositoryHostingConfigSchema,
  HostedRepositoryBindingSchema,
  HostedRepositoryCreateSchema,
  RepositoryRecoveryActionSchema,
  RepositoryRecoveryStateSchema,
  RepositoryRecoveryResultSchema,
  RepositoryActionSchema,
  HostedRepositorySchema,
  HostedPullRequestSchema,
  RepositoryActionResultSchema,
  type RepositoryHostingConfig,
  type RepositoryAction,
  type HostedPullRequest,
} from "@frevos/contracts";
import { assertPlainPath } from "./model-secrets.js";
import { replaceDurableRecord } from "./atomic-record.js";
import { ServixDeploymentError } from "./servix-deployment.js";
import { GitEngine } from "./git-engine.js";

function fail(code: string, status = 403): never {
  throw new ServixDeploymentError("repository-" + code, status);
}
const digest = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
type BoundRepository = RepositoryHostingConfig["repositories"][number];
export interface GitCredentialBoundary {
  read(
    reference: string,
    scope: { workspaceId: string; actor: string; connectionId: string },
  ): Promise<string>;
}
export function privateGitAddress(address: string): boolean {
  if (address === "::1") return true;
  const parts = address
    .replace(/^::ffff:/, "")
    .split(".")
    .map(Number);
  return (
    /^\d+\.\d+\.\d+\.\d+$/.test(address.replace(/^::ffff:/, "")) &&
    parts.every((n) => n >= 0 && n <= 255 && Number.isInteger(n)) &&
    (parts[0] === 127 ||
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
      (parts[0] === 192 && parts[1] === 168))
  );
}
export async function validateRepositoryHosting(input: unknown, resolve = lookup) {
  const config = RepositoryHostingConfigSchema.parse(input);
  if (config.apiUrl !== config.webUrl) fail("single-private-origin-required", 400);
  for (const value of [config.apiUrl, config.webUrl]) {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(url.pathname) ||
      url.href !== value ||
      (url.protocol === "http:" && !config.allowPrivateHttp)
    )
      fail("invalid-private-origin", 400);
    const addresses = await resolve(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
    if (!addresses.length || addresses.some((a) => !privateGitAddress(a.address)))
      fail("private-origin-required", 400);
  }
  return config;
}
export async function loadRepositoryHosting(file: string) {
  await assertPlainPath(file);
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.size > 262144) fail("configuration-unavailable", 503);
    return await validateRepositoryHosting(JSON.parse(await readFile(file, "utf8")));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

// Fixed private API transport: no redirects, public DNS, caller URL, raw errors,
// query-string tokens or inherited proxy settings. Pin the checked DNS answer.
export async function giteaRequest(
  config: RepositoryHostingConfig,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  if (
    !/^\/api\/v1\/[A-Za-z0-9%._/?=&-]+$/.test(path) ||
    path.includes("..") ||
    /[\r\n]/.test(token) ||
    token.length > 4096
  )
    fail("invalid-provider-request", 400);
  const base = new URL(config.apiUrl),
    url = new URL(base.pathname.replace(/\/$/, "") + path, base.origin);
  const addresses = await lookup(base.hostname.replace(/^\[|\]$/g, ""), { all: true });
  if (!addresses.length || addresses.some((a) => !privateGitAddress(a.address)))
    fail("private-origin-required");
  const pinned = addresses[0]!,
    bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      {
        method,
        agent: false,
        headers: {
          authorization: "token " + token,
          accept: "application/json",
          ...(bytes
            ? { "content-type": "application/json", "content-length": String(bytes.length) }
            : {}),
        },
        lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family),
      },
      (response) => {
        const parts: Buffer[] = [];
        let size = 0;
        response.on("data", (part) => {
          size += part.length;
          if (size > 2097152) {
            response.destroy();
            reject(new ServixDeploymentError("repository-provider-capacity", 502));
          } else parts.push(part);
        });
        response.on("error", () =>
          reject(new ServixDeploymentError("repository-provider-unavailable", 503)),
        );
        response.on("end", () => {
          const status = response.statusCode ?? 502;
          if (status >= 300) {
            reject(
              new ServixDeploymentError(
                status === 401
                  ? "repository-account-expired"
                  : status === 404
                    ? "repository-not-found"
                    : status === 403
                      ? "repository-access-denied"
                      : "repository-provider-rejected",
                status === 401 ? 401 : status === 403 || status === 404 ? 403 : 409,
              ),
            );
            return;
          }
          try {
            resolve(size ? JSON.parse(Buffer.concat(parts).toString("utf8")) : null);
          } catch {
            reject(new ServixDeploymentError("repository-provider-invalid-response", 502));
          }
        });
      },
    );
    request.setTimeout(15000, () => request.destroy());
    request.on("error", () =>
      reject(new ServixDeploymentError("repository-provider-unavailable", 503)),
    );
    request.end(bytes);
  });
}
const ProviderUser = z.object({
  id: z.number().int().positive(),
  login: z.string(),
  is_admin: z.boolean().optional(),
});
const ProviderRepository = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  owner: ProviderUser,
  default_branch: z.string(),
  permissions: z.object({ pull: z.boolean(), push: z.boolean(), admin: z.boolean() }),
});
const ProviderBranch = z.object({
  name: z.string(),
  protected: z.boolean(),
  commit: z.object({ id: z.string() }),
});
const ProviderPull = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  user: ProviderUser,
  head: z.object({
    ref: z.string(),
    sha: z.string(),
    repo: z.object({ id: z.number().int() }).nullable(),
  }),
  base: z.object({ ref: z.string(), sha: z.string(), repo: z.object({ id: z.number().int() }) }),
  merged: z.boolean(),
  mergeable: z.boolean(),
});

export class RepositoryCenter {
  private engine: GitEngine;
  private recovering = false;
  private recovery:
    | {
        list: () => Promise<unknown[]>;
        backup: () => Promise<{ id: string; sha256: string }>;
        restoreIsolated: (id: string, sha: string) => Promise<unknown>;
        verify: (input: unknown) => Promise<unknown>;
      }
    | undefined;
  constructor(
    readonly config: RepositoryHostingConfig,
    private vault: GitCredentialBoundary,
    private root: string,
    private request = giteaRequest,
  ) {
    this.engine = new GitEngine(join(root, "transfers"));
    if (config.recovery) {
      const c = config.recovery;
      const { createNativeRecovery } = createRequire(import.meta.url)(
        "../../../deployment/servix/GitRecovery.cjs",
      );
      this.recovery = createNativeRecovery(
        { ...c, workspaceId: config.workspaceId, installationId: config.installationId },
        async () => {
          const value = await vault.read(c.keyReference, {
            workspaceId: config.workspaceId,
            actor: c.keyOwner,
            connectionId: c.keyId,
          });
          if (!/^[a-f0-9]{64}$/.test(value)) fail("recovery-key-unavailable", 503);
          return Buffer.from(value, "hex");
        },
      );
    }
  }
  private async hostingAdministrator(actor: string, workspaceId: string) {
    if (workspaceId !== this.config.workspaceId) fail("workspace-denied");
    const account = this.config.accounts.find((a) => a.userId === actor);
    if (!account) fail("admin-required");
    const token = await this.vault.read(account.credentialReference, {
      workspaceId,
      actor,
      connectionId: account.credentialId,
    });
    const user = ProviderUser.parse(await this.request(this.config, token, "GET", "/api/v1/user"));
    if (
      user.id !== account.providerUserId ||
      user.login !== account.login ||
      user.is_admin !== true
    )
      fail("admin-required");
  }
  async recoveryState(actor: string, workspaceId: string) {
    if (!this.recovery) return { configured: false, backups: [] };
    await this.hostingAdministrator(actor, workspaceId);
    return RepositoryRecoveryStateSchema.parse({
      configured: true,
      backups: await this.recovery.list(),
    });
  }
  async recover(actor: string, workspaceId: string, input: unknown) {
    const a = RepositoryRecoveryActionSchema.parse(input);
    await this.hostingAdministrator(actor, workspaceId);
    if (!this.recovery) fail("recovery-not-configured", 503);
    const file = join(this.root, a.requestId + ".json"),
      fingerprint = digest({ actor, workspaceId, a });
    await assertPlainPath(file);
    let prior: { fingerprint: string; status: string; result?: unknown } | undefined;
    try {
      prior = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail("request-conflict", 409);
      if (prior.status === "succeeded") return RepositoryRecoveryResultSchema.parse(prior.result);
      fail("request-needs-reconciliation", 409);
    }
    const record = {
      version: 1,
      actor,
      workspaceId,
      installationId: this.config.installationId,
      requestId: a.requestId,
      action: a.action,
      fingerprint,
      at: new Date().toISOString(),
    };
    if (this.recovering) fail("recovery-busy", 409);
    this.recovering = true;
    try {
      await this.save(file, { ...record, status: "started" }, true);
      let backupId: string, sha256: string;
      if (a.action === "backup") {
        const backup = await this.recovery.backup();
        backupId = backup.id;
        sha256 = backup.sha256;
      } else {
        const restored = await this.recovery.restoreIsolated(a.backupId, a.sha256);
        await this.recovery.verify(restored);
        backupId = a.backupId;
        sha256 = a.sha256;
      }
      const result = RepositoryRecoveryResultSchema.parse({
        requestId: a.requestId,
        status: a.action === "backup" ? "backed-up" : "verified-isolated",
        backupId,
        sha256,
      });
      await this.save(file, { ...record, status: "succeeded", result });
      return result;
    } catch (e) {
      await this.save(file, { ...record, status: "needs-reconciliation" });
      throw e;
    } finally {
      this.recovering = false;
    }
  }
  private async bindings() {
    const root = join(this.root, "bindings");
    await assertPlainPath(root);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const names = await readdir(root);
    if (names.length > 1000) fail("registry-capacity", 503);
    const result = [...this.config.repositories];
    for (const name of names) {
      if (!/^repo_[a-f0-9]{32}\.json$/.test(name)) fail("registry-invalid", 503);
      const file = join(root, name);
      await assertPlainPath(file);
      if ((await lstat(file)).size > 4096) fail("registry-invalid", 503);
      const binding = HostedRepositoryBindingSchema.parse(JSON.parse(await readFile(file, "utf8")));
      if (
        name !== binding.id + ".json" ||
        result.some(
          (r) => r.id === binding.id || r.providerRepositoryId === binding.providerRepositoryId,
        )
      )
        fail("registry-identity-conflict", 503);
      result.push(binding);
    }
    return result;
  }
  private async bound(actor: string, workspaceId: string, id: string) {
    if (workspaceId !== this.config.workspaceId) fail("workspace-denied");
    const account = this.config.accounts.find((a) => a.userId === actor),
      repo = (await this.bindings()).find((r) => r.id === id);
    if (!account || !repo) fail("not-found", 404);
    return { account, repo };
  }
  private async context(actor: string, workspaceId: string, id: string) {
    const { account, repo } = await this.bound(actor, workspaceId, id);
    const token = await this.vault.read(account.credentialReference, {
      workspaceId,
      actor,
      connectionId: account.credentialId,
    });
    const call = (method: string, path: string, body?: unknown) =>
      this.request(this.config, token, method, path, body);
    const user = ProviderUser.parse(await call("GET", "/api/v1/user"));
    if (user.id !== account.providerUserId || user.login !== account.login)
      fail("account-identity-changed");
    const path =
      "/api/v1/repos/" + encodeURIComponent(repo.owner) + "/" + encodeURIComponent(repo.name);
    const remote = ProviderRepository.parse(await call("GET", path));
    if (
      remote.id !== repo.providerRepositoryId ||
      remote.name !== repo.name ||
      remote.owner.login !== repo.owner ||
      remote.default_branch !== repo.defaultBranch
    )
      fail("provider-identity-changed");
    if (!remote.permissions.pull) fail("access-denied");
    return { account, repo, path, remote, call, token };
  }
  async repository(actor: string, workspaceId: string, id: string, creationRequestId?: string) {
    const c = await this.context(actor, workspaceId, id);
    let bootstrapSeed: string | undefined;
    if (creationRequestId) {
      if (c.repo.bootstrap?.createdBy !== actor || c.repo.bootstrap.requestId !== creationRequestId)
        fail("initial-publication-denied");
      const base = ProviderBranch.parse(
        await c.call("GET", c.path + "/branches/" + encodeURIComponent(c.repo.defaultBranch)),
      );
      if (base.commit.id !== c.repo.bootstrap.seedHead) fail("initial-repository-changed", 409);
      bootstrapSeed = base.commit.id;
    }
    return {
      defaultBranch: c.repo.defaultBranch,
      write: c.remote.permissions.push,
      ...(bootstrapSeed ? { bootstrapSeed } : {}),
    };
  }
  async create(actor: string, workspaceId: string, input: unknown) {
    const a = HostedRepositoryCreateSchema.parse(input);
    if (workspaceId !== this.config.workspaceId) fail("workspace-denied");
    const account = this.config.accounts.find((u) => u.userId === actor);
    if (!account) fail("account-not-linked");
    const token = await this.vault.read(account.credentialReference, {
      workspaceId,
      actor,
      connectionId: account.credentialId,
    });
    const call = (method: string, path: string, body?: unknown) =>
      this.request(this.config, token, method, path, body);
    const user = ProviderUser.parse(await call("GET", "/api/v1/user"));
    if (user.id !== account.providerUserId || user.login !== account.login)
      fail("account-identity-changed");
    await this.bindings();
    const file = join(this.root, a.requestId + ".json"),
      fingerprint = digest({ actor, workspaceId, a });
    try {
      await assertPlainPath(file);
      const prior = z
        .object({
          fingerprint: z.string(),
          repositoryId: z.string().optional(),
          status: z.string(),
        })
        .parse(JSON.parse(await readFile(file, "utf8")));
      if (prior.fingerprint !== fingerprint) fail("request-conflict", 409);
      if (prior.status === "succeeded" && prior.repositoryId)
        return this.details(actor, workspaceId, prior.repositoryId);
      fail("request-needs-reconciliation", 409);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    const record = {
      version: 1,
      actor,
      workspaceId,
      installationId: this.config.installationId,
      requestId: a.requestId,
      action: "repository.create",
      fingerprint,
      at: new Date().toISOString(),
    };
    await this.save(file, { ...record, status: "started" }, true);
    try {
      const created = ProviderRepository.parse(
        await call("POST", "/api/v1/user/repos", {
          name: a.name,
          private: true,
          auto_init: true,
          default_branch: this.config.defaultBranch,
        }),
      );
      if (
        created.owner.id !== user.id ||
        created.owner.login !== user.login ||
        created.name !== a.name ||
        created.default_branch !== this.config.defaultBranch ||
        !created.permissions.admin
      )
        fail("created-identity-mismatch");
      const path =
        "/api/v1/repos/" + encodeURIComponent(user.login) + "/" + encodeURIComponent(a.name);
      await call("POST", path + "/branch_protections", {
        rule_name: created.default_branch,
        enable_push: false,
        enable_force_push: false,
        required_approvals: 1,
        dismiss_stale_approvals: true,
        block_on_rejected_reviews: true,
        block_on_outdated_branch: true,
        block_admin_merge_override: true,
      });
      const seed = ProviderBranch.parse(
        await call("GET", path + "/branches/" + encodeURIComponent(created.default_branch)),
      );
      const binding = HostedRepositoryBindingSchema.parse({
        id: "repo_" + randomBytes(16).toString("hex"),
        providerRepositoryId: created.id,
        owner: user.login,
        name: created.name,
        defaultBranch: created.default_branch,
        bootstrap: { createdBy: actor, requestId: a.requestId, seedHead: seed.commit.id },
      });
      await this.save(join(this.root, "bindings", binding.id + ".json"), binding, true);
      await this.save(file, { ...record, repositoryId: binding.id, status: "succeeded" });
      return this.details(actor, workspaceId, binding.id);
    } catch (e) {
      await this.save(file, { ...record, status: "needs-reconciliation" });
      throw e;
    }
  }
  private async transportAccess(
    actor: string,
    workspaceId: string,
    id: string,
    branch: string,
    write: boolean,
  ) {
    const c = await this.context(actor, workspaceId, id);
    if (write) {
      if (!c.remote.permissions.push || branch === c.repo.defaultBranch) fail("write-denied");
      try {
        const b = ProviderBranch.parse(
          await c.call("GET", c.path + "/branches/" + encodeURIComponent(branch)),
        );
        if (b.protected) fail("branch-protected");
      } catch (e) {
        // Gitea deliberately conceals missing branches with 404; repository access was verified above.
        if (!(e instanceof ServixDeploymentError && e.message === "repository-not-found")) throw e;
      }
    }
    return {
      url: this.web(c.repo, ".git"),
      login: c.account.login,
      token: c.token,
      write: c.remote.permissions.push,
      defaultBranch: c.repo.defaultBranch,
    };
  }
  async publish(
    actor: string,
    workspaceId: string,
    id: string,
    branch: string,
    head: string,
    bytes: Buffer,
  ) {
    return this.engine.publish(
      () => this.transportAccess(actor, workspaceId, id, branch, true),
      branch,
      head,
      bytes,
    );
  }
  async branchHead(actor: string, workspaceId: string, id: string, branch: string) {
    const c = await this.context(actor, workspaceId, id);
    try {
      return ProviderBranch.parse(
        await c.call("GET", c.path + "/branches/" + encodeURIComponent(branch)),
      ).commit.id;
    } catch (e) {
      if (e instanceof ServixDeploymentError && e.code === "repository-not-found") return null;
      throw e;
    }
  }
  async download(actor: string, workspaceId: string, id: string, branch: string) {
    return this.engine.download(
      () => this.transportAccess(actor, workspaceId, id, branch, false),
      branch,
    );
  }
  private web(repo: BoundRepository, suffix = "") {
    return (
      this.config.webUrl +
      encodeURIComponent(repo.owner) +
      "/" +
      encodeURIComponent(repo.name) +
      suffix
    );
  }
  private pull(repo: BoundRepository, value: unknown): HostedPullRequest {
    const p = ProviderPull.parse(value);
    if (
      p.base.repo.id !== repo.providerRepositoryId ||
      p.head.repo?.id !== repo.providerRepositoryId
    )
      fail("cross-repository-pull-denied");
    return HostedPullRequestSchema.parse({
      number: p.number,
      title: p.title,
      state: p.state,
      author: p.user.login,
      authorId: p.user.id,
      head: p.head.ref,
      base: p.base.ref,
      headSha: p.head.sha,
      baseSha: p.base.sha,
      merged: p.merged,
      mergeable: p.mergeable,
      url: this.web(repo, "/pulls/" + p.number),
    });
  }
  async state(actor: string, workspaceId: string) {
    if (workspaceId !== this.config.workspaceId) fail("workspace-denied");
    if (!this.config.accounts.some((account) => account.userId === actor))
      return { configured: true, accountLinked: false, repositories: [] };
    const repositories = [];
    for (const repo of await this.bindings()) {
      try {
        repositories.push(await this.details(actor, workspaceId, repo.id, false));
      } catch (e) {
        if (!(e instanceof ServixDeploymentError && [403, 404].includes(e.statusCode))) throw e;
      }
    }
    return { configured: true, repositories };
  }
  async details(actor: string, workspaceId: string, id: string, full = true) {
    const { repo, path, remote, call } = await this.context(actor, workspaceId, id);
    const branches = full
      ? z
          .array(ProviderBranch)
          .max(100)
          .parse(await call("GET", path + "/branches?limit=100&page=1"))
      : [];
    const pulls = full
      ? z
          .array(ProviderPull)
          .max(100)
          .parse(await call("GET", path + "/pulls?state=open&limit=100&page=1"))
      : [];
    return HostedRepositorySchema.parse({
      id: repo.id,
      name: repo.owner + "/" + repo.name,
      defaultBranch: repo.defaultBranch,
      webUrl: this.web(repo),
      cloneUrl: this.web(repo, ".git"),
      sshUrl: "",
      role: remote.permissions.admin
        ? "maintainer"
        : remote.permissions.push
          ? "developer"
          : "reader",
      permissions: { read: true, write: remote.permissions.push, admin: remote.permissions.admin },
      branches: branches.map((b) => ({ name: b.name, sha: b.commit.id, protected: b.protected })),
      pullRequests: pulls.map((p) => this.pull(repo, p)),
      protectedDefault: branches.some((b) => b.name === repo.defaultBranch && b.protected),
      requiredApprovals: repo.requiredApprovals,
    });
  }
  private async save(file: string, value: unknown, create = false) {
    await assertPlainPath(file);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const temporary = create ? file : file + "." + randomBytes(12).toString("hex") + ".tmp";
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value));
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (!create) await replaceDurableRecord(temporary, file);
  }
  async action(actor: string, workspaceId: string, input: unknown) {
    const a = RepositoryActionSchema.parse(input),
      context = await this.context(actor, workspaceId, a.repositoryId);
    const { account, repo, path, remote, call } = context;
    if (!remote.permissions.push || (a.action === "pull.merge" && !remote.permissions.admin))
      fail("write-denied");
    await assertPlainPath(this.root);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const file = join(this.root, a.requestId + ".json"),
      fingerprint = digest({ actor, workspaceId, a });
    let prior: { fingerprint: string; status: string; result?: unknown } | undefined;
    try {
      prior = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail("request-conflict", 409);
      if (prior.status === "succeeded") return RepositoryActionResultSchema.parse(prior.result);
      fail("request-needs-reconciliation", 409);
    }
    const record = {
      version: 1,
      actor,
      workspaceId,
      installationId: this.config.installationId,
      repositoryId: repo.id,
      requestId: a.requestId,
      action: a.action,
      fingerprint,
      status: "started",
      at: new Date().toISOString(),
    };
    await this.save(file, record, true);
    try {
      let url: string | undefined;
      if (a.action === "branch.create") {
        if (a.name === repo.defaultBranch) fail("default-branch-protected");
        const from = ProviderBranch.parse(
          await call("GET", path + "/branches/" + encodeURIComponent(a.from)),
        );
        if (from.commit.id !== a.expectedSha) fail("source-changed", 409);
        await call("POST", path + "/branches", {
          new_branch_name: a.name,
          old_ref_name: a.expectedSha,
        });
        url = this.web(repo, "/src/branch/" + encodeURIComponent(a.name));
      } else if (a.action === "pull.create") {
        if (a.head === a.base || a.head === repo.defaultBranch) fail("invalid-pull-branches", 400);
        const head = ProviderBranch.parse(
          await call("GET", path + "/branches/" + encodeURIComponent(a.head)),
        );
        if (head.commit.id !== a.expectedHead) fail("source-changed", 409);
        const pull = this.pull(
          repo,
          await call("POST", path + "/pulls", {
            head: a.head,
            base: a.base,
            title: a.title,
            body: a.body,
          }),
        );
        url = pull.url;
      } else {
        const pull = this.pull(repo, await call("GET", path + "/pulls/" + a.number));
        if (pull.state !== "open" || pull.merged || pull.headSha !== a.expectedHead)
          fail("pull-changed", 409);
        if (a.action === "pull.review") {
          if (pull.authorId === account.providerUserId && a.verdict !== "COMMENT")
            fail("self-review-denied");
          await call("POST", path + "/pulls/" + a.number + "/reviews", {
            event: a.verdict,
            body: a.body,
            commit_id: a.expectedHead,
          });
        } else {
          if (pull.authorId === account.providerUserId) fail("self-merge-denied");
          if (
            pull.base !== repo.defaultBranch ||
            pull.baseSha !== a.expectedBase ||
            !pull.mergeable
          )
            fail("merge-not-ready", 409);
          await this.checkMergePolicy(context, a, pull);
          await call("POST", path + "/pulls/" + a.number + "/merge", {
            Do: "squash",
            head_commit_id: a.expectedHead,
            force_merge: false,
            delete_branch_after_merge: false,
          });
        }
        url = pull.url;
      }
      const result = RepositoryActionResultSchema.parse({
        requestId: a.requestId,
        action: a.action,
        status: "succeeded",
        ...(url ? { url } : {}),
      });
      await this.save(file, { ...record, status: "succeeded", result });
      return result;
    } catch (e) {
      await this.save(file, { ...record, status: "needs-reconciliation" });
      throw e;
    }
  }
  private async checkMergePolicy(
    c: Awaited<ReturnType<RepositoryCenter["context"]>>,
    a: Extract<RepositoryAction, { action: "pull.merge" }>,
    p: HostedPullRequest,
  ) {
    const { repo, path, call } = c;
    const rules = z
      .array(
        z.object({
          rule_name: z.string(),
          enable_push: z.boolean(),
          enable_force_push: z.boolean().optional(),
          required_approvals: z.number(),
          dismiss_stale_approvals: z.boolean(),
          block_on_rejected_reviews: z.boolean(),
          block_on_outdated_branch: z.boolean(),
          block_admin_merge_override: z.boolean(),
          ignore_stale_approvals: z.boolean().optional(),
          enable_status_check: z.boolean().optional(),
          status_check_contexts: z.array(z.string()).nullable().optional(),
        }),
      )
      .parse(await call("GET", path + "/branch_protections"));
    const rule = rules.find((r) => r.rule_name === repo.defaultBranch);
    if (
      !rule ||
      rule.enable_push ||
      rule.enable_force_push ||
      rule.required_approvals < repo.requiredApprovals ||
      !rule.dismiss_stale_approvals ||
      !rule.block_on_rejected_reviews ||
      !rule.block_on_outdated_branch ||
      !rule.block_admin_merge_override ||
      rule.ignore_stale_approvals ||
      (repo.requiredChecks.length > 0 &&
        (!rule.enable_status_check ||
          repo.requiredChecks.some((name) => !rule.status_check_contexts?.includes(name))))
    )
      fail("protection-not-ready", 409);
    const branch = ProviderBranch.parse(
      await call("GET", path + "/branches/" + encodeURIComponent(repo.defaultBranch)),
    );
    if (branch.commit.id !== a.expectedBase || !branch.protected) fail("base-changed", 409);
    const reviews = z
      .array(
        z.object({
          id: z.number().int().positive(),
          user: ProviderUser,
          state: z.string(),
          commit_id: z.string(),
          stale: z.boolean().optional(),
        }),
      )
      .parse(await call("GET", path + "/pulls/" + a.number + "/reviews?limit=100&page=1"));
    const latest = new Map<number, (typeof reviews)[number]>();
    for (const review of reviews.sort((a, b) => a.id - b.id)) latest.set(review.user.id, review);
    const approvals = [...latest.values()].filter(
      (r) =>
        r.state === "APPROVED" &&
        !r.stale &&
        r.commit_id === a.expectedHead &&
        r.user.id !== p.authorId,
    );
    if (
      approvals.length < repo.requiredApprovals ||
      [...latest.values()].some((r) => r.state === "REQUEST_CHANGES" && !r.stale)
    )
      fail("review-required", 409);
    if (repo.requiredChecks.length) {
      const checks = z
        .object({ statuses: z.array(z.object({ context: z.string(), status: z.string() })) })
        .parse(await call("GET", path + "/commits/" + a.expectedHead + "/status"));
      if (
        repo.requiredChecks.some(
          (name) => checks.statuses.find((s) => s.context === name)?.status !== "success",
        )
      )
        fail("checks-required", 409);
    }
  }
}
