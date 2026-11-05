import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type CodeAccessInput,
  CodeAccessInputSchema,
  CodeAccessSchema,
  CodeBlobSchema,
  CodeCatalogSchema,
  CodeHistorySchema,
  CodeQuerySchema,
  type CodeRepository,
  CodeRepositoryIdSchema,
  CodeTreeSchema,
  UserIdSchema,
} from "@frevos/contracts";
import { z } from "zod";
import { replaceDurableRecord } from "./atomic-record.js";
import { CodeGit } from "./code-git.js";
import { assertPlainPath } from "./model-secrets.js";
import type { RepositoryCenter } from "./repository-center.js";
import { ServixDeploymentError } from "./servix-deployment.js";

export type CentralCodeSource = {
  id: string;
  name: string;
  defaultBranch: string;
  directory: string;
  executable: string;
  identityKey: "frevos.repositoryId" | "devsetu.repositoryId";
  ownerId?: string;
  protectedPaths: string[];
};
export type CodeMember = { userId: string; name: string; administrator: boolean };
const Policy = z
  .object({
    version: z.literal(1),
    repositoryId: CodeRepositoryIdSchema,
    revision: z.number().int().nonnegative(),
    sourceIdentity: z.string().regex(/^[a-f0-9]{64}$/),
    readers: z.array(UserIdSchema).max(1000),
  })
  .strict();
type Source = {
  id: string;
  name: string;
  defaultBranch: string;
  ownerId: string | null;
  provider: "central" | "hosted";
  cloneUrl: string | null;
  canManageAccess: boolean;
  role: CodeRepository["role"];
  bare?: CentralCodeSource;
};
function fail(code: string, status = 403): never {
  throw new ServixDeploymentError("code-" + code, status);
}
const digest = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

export class CodeRepositories {
  private chain: Promise<unknown> = Promise.resolve();
  private downloading = false;
  constructor(
    readonly root: string,
    readonly workspaceId: string,
    private sources: () => Promise<CentralCodeSource[]>,
    private member: (actor: string) => Promise<{ active: boolean; administrator: boolean }>,
    private users: () => Promise<CodeMember[]>,
    private hosted?: RepositoryCenter,
  ) {}
  private async actor(actor: string, ws: string) {
    if (ws !== this.workspaceId) fail("not-found", 404);
    UserIdSchema.parse(actor);
    const user = await this.member(actor);
    if (!user.active) fail("access-denied");
    return user;
  }
  private identity(source: Source) {
    return digest(
      source.bare
        ? {
            id: source.id,
            directory: source.bare.directory,
            identityKey: source.bare.identityKey,
            owner: source.ownerId,
          }
        : {
            id: source.id,
            installation: this.hosted!.config.installationId,
            owner: source.ownerId,
          },
    );
  }
  private async policy(source: Source) {
    const file = join(this.root, "access", source.id + ".json");
    await assertPlainPath(file);
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.size > 131072) fail("access-unavailable", 503);
      const value = Policy.parse(JSON.parse(await readFile(file, "utf8")));
      if (
        value.repositoryId !== source.id ||
        value.sourceIdentity !== this.identity(source) ||
        new Set(value.readers).size !== value.readers.length
      )
        fail("access-identity-changed", 503);
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return Policy.parse({
      version: 1,
      repositoryId: source.id,
      revision: 0,
      sourceIdentity: this.identity(source),
      readers: [],
    });
  }
  private async central(actor: string, ws: string, id: string) {
    CodeRepositoryIdSchema.parse(id);
    const user = await this.actor(actor, ws),
      rows = await this.sources();
    if (rows.length > 1000 || new Set(rows.map((r) => r.id)).size !== rows.length)
      fail("registry-conflict", 503);
    const bare = rows.find((r) => r.id === id);
    if (!bare) fail("not-found", 404);
    const source: Source = {
      id: bare.id,
      name: bare.name,
      defaultBranch: bare.defaultBranch,
      ownerId: bare.ownerId ?? null,
      provider: "central",
      cloneUrl: null,
      canManageAccess: user.administrator || bare.ownerId === actor,
      role: user.administrator ? "administrator" : bare.ownerId === actor ? "owner" : "reader",
      bare,
    };
    const policy = await this.policy(source);
    if (!source.canManageAccess && !policy.readers.some((id) => id === actor))
      fail("not-found", 404);
    return source;
  }
  private async source(actor: string, ws: string, id: string): Promise<Source> {
    CodeRepositoryIdSchema.parse(id);
    await this.actor(actor, ws);
    if (id.startsWith("gitrepo_")) return this.central(actor, ws, id);
    if (!this.hosted) fail("not-found", 404);
    const value = await this.hosted.codeSource(actor, ws, id);
    const member = await this.actor(actor, ws);
    return {
      ...value,
      provider: "hosted",
      role: member.administrator ? "administrator" : value.role,
    };
  }
  async authorize(actor: string, ws: string, id: string, write = false) {
    const source = await this.source(actor, ws, id);
    if (write && !source.canManageAccess) fail("publication-denied");
  }
  private async read<T>(
    actor: string,
    ws: string,
    source: Source,
    branch: string | undefined,
    work: (git: CodeGit, branch: string) => Promise<T>,
  ) {
    if (source.bare) {
      const git = new CodeGit(
        source.bare.directory,
        source.bare.executable,
        source.bare.protectedPaths,
      );
      await git.verify(source.bare.identityKey, source.id);
      return work(git, branch ?? source.defaultBranch);
    }
    return this.hosted!.readCode(actor, ws, source.id, branch ?? source.defaultBranch, work);
  }
  async catalog(actor: string, ws: string) {
    const member = await this.actor(actor, ws),
      repositories: CodeRepository[] = [];
    const bare = await this.sources();
    if (bare.length > 1000 || new Set(bare.map((s) => s.id)).size !== bare.length)
      fail("registry-conflict", 503);
    const available: Source[] = [];
    for (const row of bare) {
      try {
        available.push(await this.central(actor, ws, row.id));
      } catch (e) {
        if (!(e instanceof ServixDeploymentError && e.statusCode === 404)) throw e;
      }
    }
    if (this.hosted) {
      for (const row of (await this.hosted.state(actor, ws)).repositories)
        available.push(await this.source(actor, ws, row.id));
    }
    for (const source of available) {
      let status: CodeRepository["status"] = "unavailable",
        head: CodeRepository["head"] = null;
      try {
        if (source.provider === "hosted") {
          head = await this.hosted!.codeSummary(actor, ws, source.id);
          status = "ready";
        } else
          head = await this.read(actor, ws, source, undefined, async (git, branch) => {
            let sha: string;
            try {
              sha = await git.resolve(branch);
            } catch (error) {
              if (
                error instanceof ServixDeploymentError &&
                error.statusCode === 404 &&
                !(await git.branches()).length
              ) {
                status = "empty";
                return null;
              }
              throw error;
            }
            const latest = (await git.history(sha)).commits[0] ?? null;
            status = "ready";
            return latest;
          });
      } catch {
        status = "unavailable";
        head = null;
        /* An authorized registration remains visible with an honest unavailable state. */
      }
      await this.source(actor, ws, source.id);
      repositories.push({ ...source, bare: undefined, status, head } as CodeRepository);
    }
    return CodeCatalogSchema.parse({
      workspaceId: ws,
      administrator: member.administrator,
      repositories: repositories.map(
        ({
          id,
          name,
          defaultBranch,
          ownerId,
          provider,
          role,
          canManageAccess,
          cloneUrl,
          status,
          head,
        }) => ({
          id,
          name,
          defaultBranch,
          ownerId,
          provider,
          role,
          canManageAccess,
          cloneUrl,
          status,
          head,
        }),
      ),
    });
  }
  private async query(actor: string, ws: string, id: string, input: unknown) {
    const query = CodeQuerySchema.parse(input),
      source = await this.source(actor, ws, id);
    return { source, query };
  }
  async tree(actor: string, ws: string, id: string, input: unknown) {
    const { source, query } = await this.query(actor, ws, id, input);
    const value = await this.read(actor, ws, source, query.branch, async (git, branch) => {
      const head = await git.resolve(branch);
      if (query.head && query.head !== head) fail("branch-changed", 409);
      const entries = await git.entries(head, query.path);
      const readmeFile = entries.find(
        (e) =>
          e.kind === "file" &&
          !e.protected &&
          /^readme(?:\.(?:md|markdown|txt|rst))?$/i.test(e.name),
      );
      const readme =
        readmeFile && readmeFile.bytes! <= 131072 ? await git.blob(head, readmeFile.path) : null;
      return CodeTreeSchema.parse({
        repositoryId: id,
        branch,
        head,
        path: query.path,
        branches:
          source.provider === "hosted"
            ? await this.hosted!.codeBranches(actor, ws, id)
            : await git.branches(),
        entries: entries.slice(query.page * 100, (query.page + 1) * 100),
        total: entries.length,
        page: query.page,
        pageSize: 100,
        latest: (await git.history(head, query.path)).commits[0] ?? null,
        readme: readme?.text ? { path: readmeFile!.path, text: readme.text } : null,
      });
    });
    await this.source(actor, ws, id);
    return value;
  }
  async blob(actor: string, ws: string, id: string, input: unknown) {
    const { source, query } = await this.query(actor, ws, id, input);
    const value = await this.read(actor, ws, source, query.branch, async (git, branch) => {
      const head = await git.resolve(branch);
      if (query.head && query.head !== head) fail("branch-changed", 409);
      return CodeBlobSchema.parse({
        repositoryId: id,
        path: query.path,
        head,
        ...(await git.blob(head, query.path)),
      });
    });
    await this.source(actor, ws, id);
    return value;
  }
  async history(actor: string, ws: string, id: string, input: unknown) {
    const { source, query } = await this.query(actor, ws, id, input);
    const value = await this.read(actor, ws, source, query.branch, async (git, branch) => {
      const head = await git.resolve(branch);
      if (query.head && query.head !== head) fail("branch-changed", 409);
      return CodeHistorySchema.parse(await git.history(head, query.path, query.page));
    });
    await this.source(actor, ws, id);
    return value;
  }
  async archive(actor: string, ws: string, id: string, input: unknown) {
    const { source, query } = await this.query(actor, ws, id, input);
    if (this.downloading) fail("download-busy", 409);
    this.downloading = true;
    try {
      const result = await this.read(actor, ws, source, query.branch, async (git, branch) => {
        const head = await git.resolve(branch);
        if (query.head && query.head !== head) fail("branch-changed", 409);
        return { ...(await git.archive(head, source.name)), head };
      });
      await this.source(actor, ws, id);
      await this.audit({
        action: "archive",
        actor,
        repositoryId: id,
        head: result.head,
        bytes: result.bytes.length,
        excludedPaths: result.excludedPaths,
      });
      return result;
    } finally {
      this.downloading = false;
    }
  }
  async access(actor: string, ws: string, id: string) {
    const source = await this.source(actor, ws, id);
    if (!source.canManageAccess) fail("access-management-denied");
    if (source.bare)
      await new CodeGit(source.bare.directory, source.bare.executable).verify(
        source.bare.identityKey,
        source.id,
      );
    const policy = await this.policy(source),
      users = await this.users();
    const providerAccess = new Map<string, { access: boolean; requiresAccountLink: boolean }>();
    if (source.provider === "hosted") {
      // Bound parallel provider calls; never label an unavailable permission check as "No access".
      for (let start = 0; start < users.length; start += 4)
        await Promise.all(
          users.slice(start, start + 4).map(async (u) => {
            providerAccess.set(u.userId, await this.hosted!.codeMemberAccess(u.userId, ws, id));
          }),
        );
    }
    return CodeAccessSchema.parse({
      repositoryId: id,
      revision: policy.revision,
      ownerId: source.ownerId,
      users: users.map((u) => ({
        userId: u.userId,
        name: u.name,
        access:
          u.administrator ||
          u.userId === source.ownerId ||
          (source.provider === "hosted"
            ? providerAccess.get(u.userId)!.access
            : policy.readers.some((id) => id === u.userId)),
        inherited:
          u.administrator ||
          u.userId === source.ownerId ||
          (source.provider === "hosted" &&
            providerAccess.get(u.userId)!.access &&
            !policy.readers.some((reader) => reader === u.userId)),
        requiresAccountLink: providerAccess.get(u.userId)?.requiresAccountLink ?? false,
      })),
    });
  }
  async share(actor: string, ws: string, id: string, input: unknown) {
    const next = this.chain.then(async () => {
      const request = CodeAccessInputSchema.parse(input),
        source = await this.source(actor, ws, id);
      if (!source.canManageAccess) fail("access-management-denied");
      if (source.bare)
        await new CodeGit(source.bare.directory, source.bare.executable).verify(
          source.bare.identityKey,
          source.id,
        );
      const policy = await this.policy(source),
        users = await this.users(),
        target = users.find((u) => u.userId === request.userId);
      if (!target) fail("active-workspace-member-required", 400);
      if (target.administrator || source.ownerId === request.userId) fail("inherited-access", 409);
      if (policy.revision !== request.expectedRevision) fail("access-revision-conflict", 409);
      await this.audit({
        action: request.allow ? "grant-started" : "revoke-started",
        actor,
        repositoryId: id,
        target: request.userId,
        revision: policy.revision,
      });
      if (source.provider === "hosted")
        await this.hosted!.shareCode(actor, ws, id, request.userId, request.allow);
      const readers = new Set(policy.readers);
      if (request.allow) readers.add(request.userId);
      else readers.delete(request.userId);
      await this.save(
        id,
        Policy.parse({ ...policy, revision: policy.revision + 1, readers: [...readers].sort() }),
      );
      await this.audit({
        action: request.allow ? "grant" : "revoke",
        actor,
        repositoryId: id,
        target: request.userId,
        revision: policy.revision + 1,
      });
      return this.access(actor, ws, id);
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
  private async audit(value: Record<string, unknown>) {
    const directory = join(this.root, "audit");
    await assertPlainPath(directory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if ((await readdir(directory)).length >= 10000) fail("audit-capacity", 409);
    const file = await open(join(directory, randomUUID() + ".json"), "wx", 0o600);
    try {
      await file.writeFile(
        JSON.stringify({ workspaceId: this.workspaceId, at: new Date().toISOString(), ...value }),
      );
      await file.sync();
    } finally {
      await file.close();
    }
  }
  private async save(id: string, value: unknown) {
    const directory = join(this.root, "access");
    await assertPlainPath(directory);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const target = join(directory, id + ".json");
    await assertPlainPath(target);
    const temporary = target + "." + randomUUID() + ".tmp",
      file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    await replaceDurableRecord(temporary, target);
  }
}
