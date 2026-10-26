import { randomBytes } from "node:crypto";
import { mkdir, lstat, readFile, readdir, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  ProjectFolderSearchInputSchema,
  ProjectFolderSearchJobSchema,
  type ProjectFolderSearchJob,
} from "@frevos/contracts";
import { assertPlainPath } from "./model-secrets.js";
import { replaceDurableRecord } from "./atomic-record.js";
import { ServixDeploymentError } from "./servix-deployment.js";
export class ProjectFolderSearch {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    readonly root: string,
    private readonly credential: (value: string) => Promise<{ deviceId: string; userId: string }>,
    private readonly scope: (
      actor: string,
      input: ProjectFolderSearchJob["request"],
    ) => Promise<{ query: string; roots: string[] }>,
    private readonly now = () => new Date(),
  ) {}
  private serial<T>(fn: () => Promise<T>) {
    const r = this.chain.then(fn);
    this.chain = r.catch(() => undefined);
    return r;
  }
  private fail(code = "folder-search-scope-denied", status = 403) {
    return new ServixDeploymentError(code, status);
  }
  private async directory() {
    await assertPlainPath(this.root);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
  }
  private async read(name: string) {
    await this.directory();
    const file = join(this.root, name);
    await assertPlainPath(file);
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.size > 65536)
        throw this.fail("folder-search-storage-unavailable", 503);
      const job = ProjectFolderSearchJobSchema.parse(JSON.parse(await readFile(file, "utf8")));
      if (job.id + ".json" !== name) throw this.fail();
      return job;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  private async save(job: ProjectFolderSearchJob, fresh = false) {
    await this.directory();
    const file = join(this.root, job.id + ".json");
    await assertPlainPath(file);
    const temp = fresh ? file : file + "." + randomBytes(8).toString("hex") + ".tmp",
      h = await open(temp, "wx", 0o600);
    try {
      await h.writeFile(JSON.stringify(ProjectFolderSearchJobSchema.parse(job)));
      await h.sync();
    } finally {
      await h.close();
    }
    if (!fresh) await replaceDurableRecord(temp, file);
  }
  private async records() {
    await this.directory();
    const names = (await readdir(this.root)).filter((n) => /^fd_[a-f0-9]{32}\.json$/.test(n));
    if (names.length > 200) throw this.fail("folder-search-capacity", 503);
    const jobs: ProjectFolderSearchJob[] = [];
    for (const name of names) {
      const j = await this.read(name);
      if (!j) continue;
      if (Date.parse(j.createdAt) < this.now().getTime() - 86400000)
        await unlink(join(this.root, name));
      else jobs.push(j);
    }
    return jobs;
  }
  async request(actor: string, input: unknown) {
    return this.serial(async () => {
      const body = ProjectFolderSearchInputSchema.parse(input),
        scope = await this.scope(actor, body),
        jobs = await this.records();
      if (
        jobs.length >= 200 ||
        jobs.some(
          (j) =>
            j.actor === actor &&
            j.request.deviceId === body.deviceId &&
            ["queued", "working"].includes(j.status) &&
            Date.parse(j.expiresAt) > this.now().getTime(),
        )
      )
        throw this.fail("folder-search-busy", 409);
      const job = ProjectFolderSearchJobSchema.parse({
        version: 1,
        id: "fd_" + randomBytes(16).toString("hex"),
        actor,
        workspaceId: "ws_server20",
        request: body,
        query: scope.query,
        roots: scope.roots,
        createdAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + 120000).toISOString(),
        status: "queued",
      });
      await this.save(job, true);
      return job;
    });
  }
  async get(actor: string, id: string) {
    if (!/^fd_[a-f0-9]{32}$/.test(id)) throw this.fail("folder-search-not-found", 404);
    const j = await this.read(id + ".json");
    if (!j || j.actor !== actor) throw this.fail("folder-search-not-found", 404);
    await this.scope(actor, j.request);
    return Date.parse(j.expiresAt) <= this.now().getTime() &&
      ["queued", "working"].includes(j.status)
      ? { ...j, status: "expired" as const }
      : j;
  }
  async claim(credential: string) {
    return this.serial(async () => {
      const d = await this.credential(credential);
      for (const j of await this.records())
        if (
          j.actor === d.userId &&
          j.request.deviceId === d.deviceId &&
          j.status === "queued" &&
          Date.parse(j.expiresAt) > this.now().getTime()
        ) {
          const scope = await this.scope(j.actor, j.request);
          if (scope.query !== j.query || JSON.stringify(scope.roots) !== JSON.stringify(j.roots))
            continue;
          j.status = "working";
          await this.save(j);
          return j;
        }
      return null;
    });
  }
  async complete(credential: string, input: unknown) {
    return this.serial(async () => {
      const d = await this.credential(credential),
        result = ProjectFolderSearchJobSchema.parse(input),
        job = await this.read(result.id + ".json");
      if (
        !job ||
        job.actor !== d.userId ||
        job.request.deviceId !== d.deviceId ||
        job.status !== "working" ||
        Date.parse(job.expiresAt) <= this.now().getTime() ||
        !["succeeded", "failed"].includes(result.status) ||
        result.completedAt ||
        JSON.stringify({ ...result, status: job.status, result: undefined }) !==
          JSON.stringify({ ...job, result: undefined })
      )
        throw this.fail();
      const scope = await this.scope(job.actor, job.request);
      if (
        scope.query !== job.query ||
        JSON.stringify(scope.roots) !== JSON.stringify(job.roots) ||
        (result.status === "succeeded" && !result.result) ||
        result.result?.matches.some((m) => !job.roots.includes(m.root))
      )
        throw this.fail();
      result.completedAt = this.now().toISOString();
      await this.save(result);
      return { accepted: true };
    });
  }
}
