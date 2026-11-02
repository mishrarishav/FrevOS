import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, readdir, lstat } from "node:fs/promises";
import { join, posix, win32 } from "node:path";
import { z } from "zod";
import {
  GitFolderSelectSchema,
  GitFolderConnectSchema,
  GitFolderBindingSchema,
  GitDesktopActionSchema,
  GitDesktopJobSchema,
  GitDesktopSnapshotSchema,
  GitDesktopStateSchema,
  GitDesktopJobIdSchema,
  GitFolderIdSchema,
  GitFolderPickInputSchema,
  GitFolderPickerSchema,
  GitFolderPickerIdSchema,
  GitFolderPickResultSchema,
  GitRelativeFileSchema,
  type GitFolderPicker,
  type GitFolderBinding,
  type GitDesktopJob,
  type GitDesktopSnapshot,
} from "@frevos/contracts";
import { assertPlainPath } from "./model-secrets.js";
import { replaceDurableRecord } from "./atomic-record.js";
import { ServixDeploymentError } from "./servix-deployment.js";
type Device = {
  deviceId: string;
  userId: string;
  workspaceId: string;
  name: string;
  online: boolean;
  status: string;
  workspaceAuthorized?: boolean;
  platform?: string | undefined;
};
export interface GitDesktopDevices {
  discoveryDevices(actor: string): Promise<Device[]>;
  checkCredential(credential: string): Promise<{
    deviceId: string;
    userId: string;
    workspaceId: string;
    profileId?: string | null | undefined;
  }>;
}
type FolderProof = {
  actor: string;
  workspaceId: string;
  status: string;
  request: { deviceId: string; root: string; path: string };
  result?: { root: string; path: string } | undefined;
};
export interface GitDesktopPublisher {
  branchHead(
    actor: string,
    workspaceId: string,
    id: string,
    branch: string,
  ): Promise<string | null>;
  repository(
    actor: string,
    workspaceId: string,
    id: string,
    creationRequestId?: string,
  ): Promise<{ defaultBranch: string; write: boolean; bootstrapSeed?: string }>;
  publish(
    actor: string,
    workspaceId: string,
    id: string,
    branch: string,
    head: string,
    bundle: Buffer,
  ): Promise<void>;
  download(
    actor: string,
    workspaceId: string,
    id: string,
    branch: string,
  ): Promise<{ head: string; bytes: Buffer }>;
}
function fail(code: string, status = 403): never {
  throw new ServixDeploymentError("git-desktop-" + code, status);
}
const Claim = z
  .object({
    version: z.literal(1),
    capability: z.literal(1),
    gitReady: z.boolean(),
    picker: z.literal(1).optional(),
  })
  .strict();
const Completion = z.discriminatedUnion("status", [
  z.object({ status: z.literal("succeeded"), snapshot: GitDesktopSnapshotSchema }).strict(),
  z
    .object({
      status: z.literal("failed"),
      errorCode: z.string().regex(/^git-desktop-[a-z-]{1,70}$/),
    })
    .strict(),
]);
export class GitDesktop {
  private tail: Promise<unknown> = Promise.resolve();
  private observations = new Map<
    string,
    { gitReady: boolean; at: number; nativePicker?: boolean }
  >();
  constructor(
    private root: string,
    private devices: GitDesktopDevices,
    private folders: (actor: string, id: string) => Promise<FolderProof>,
    private publisher: GitDesktopPublisher | undefined,
    private now = () => new Date(),
  ) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work);
    this.tail = next.catch(() => {});
    return next;
  }
  private async names() {
    await assertPlainPath(this.root);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const names = await readdir(this.root);
    if (names.length > 10000) fail("storage-capacity", 503);
    return names;
  }
  private async read(name: string) {
    await assertPlainPath(join(this.root, name));
    try {
      const bytes = await readFile(join(this.root, name), "utf8");
      if (bytes.length > 524288) fail("record-capacity", 503);
      return JSON.parse(bytes);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  private async save(name: string, value: unknown, create = false) {
    const bytes = JSON.stringify(value);
    if (Buffer.byteLength(bytes) > 524288) fail("record-capacity", 503);
    await this.names();
    const file = join(this.root, name),
      temporary = create ? file : file + "." + randomBytes(12).toString("hex") + ".tmp";
    const h = await open(temporary, "wx", 0o600);
    try {
      await h.writeFile(bytes);
      await h.sync();
    } finally {
      await h.close();
    }
    if (!create) await replaceDurableRecord(temporary, file);
  }
  private async device(actor: string, workspaceId: string, id: string) {
    const d = (await this.devices.discoveryDevices(actor)).find(
      (v) =>
        v.deviceId === id &&
        v.userId === actor &&
        v.workspaceId === workspaceId &&
        v.status === "active" &&
        v.online &&
        v.workspaceAuthorized !== false &&
        v.platform !== "android",
    );
    if (!d) fail("device-denied");
    return d;
  }
  private async binding(actor: string, workspaceId: string, id: string) {
    GitFolderIdSchema.parse(id);
    const raw = await this.read(id + ".json");
    if (!raw) fail("folder-not-found", 404);
    const binding = GitFolderBindingSchema.parse(raw);
    if (binding.userId !== actor || binding.workspaceId !== workspaceId)
      fail("folder-not-found", 404);
    await this.device(actor, workspaceId, binding.deviceId);
    return binding;
  }
  private async jobs() {
    const jobs: GitDesktopJob[] = [];
    let total = 0;
    for (const name of await this.names())
      if (/^gjob_[a-f0-9]{32}\.json$/.test(name)) {
        await assertPlainPath(join(this.root, name));
        total += (await lstat(join(this.root, name))).size;
        if (total > 16777216) fail("job-store-capacity", 503);
        jobs.push(GitDesktopJobSchema.parse(await this.read(name)));
      }
    return jobs;
  }
  async state(actor: string, workspaceId: string) {
    const devices = (await this.devices.discoveryDevices(actor)).filter(
      (d) =>
        d.userId === actor &&
        d.workspaceId === workspaceId &&
        d.status === "active" &&
        d.workspaceAuthorized !== false &&
        d.platform !== "android",
    );
    const ids = new Set(devices.map((d) => d.deviceId)),
      folders = [];
    for (const name of await this.names())
      if (/^gfolder_[a-f0-9]{32}\.json$/.test(name)) {
        const b = GitFolderBindingSchema.parse(await this.read(name));
        if (b.userId !== actor || b.workspaceId !== workspaceId || !ids.has(b.deviceId)) continue;
        const observed = await this.read(b.id + ".snapshot.json");
        folders.push({
          ...b,
          ...(observed ? { snapshot: GitDesktopSnapshotSchema.parse(observed) } : {}),
        });
      }
    const jobs = (await this.jobs())
      .filter((j) => j.actor === actor && j.workspaceId === workspaceId && ids.has(j.deviceId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
    return GitDesktopStateSchema.parse({
      devices: devices.map((d) => {
        const o = this.observations.get(d.deviceId),
          capable = !!o && this.now().getTime() - o.at < 30000;
        return {
          deviceId: d.deviceId,
          name: d.name,
          online: d.online,
          capable,
          gitReady: capable && o.gitReady,
          nativePicker: capable && o.nativePicker === true,
        };
      }),
      folders,
      jobs,
    });
  }
  async select(actor: string, workspaceId: string, input: unknown) {
    return this.serial(async () => {
      const selection = GitFolderSelectSchema.parse(input);
      await this.device(actor, workspaceId, selection.deviceId);
      const o = this.observations.get(selection.deviceId);
      if (!o || this.now().getTime() - o.at >= 30000) fail("connector-update-required", 409);
      const native = selection.browseRequestId.startsWith("gpick_")
        ? await this.picker(actor, workspaceId, selection.browseRequestId)
        : undefined;
      if (native && Date.parse(native.expiresAt) <= this.now().getTime())
        fail("folder-proof-denied");
      const proof = native
        ? {
            actor: native.actor,
            workspaceId: native.workspaceId,
            status: native.status === "selected" ? "succeeded" : native.status,
            request: { deviceId: native.deviceId, root: selection.root, path: selection.path },
            result: native.result?.status === "selected" ? native.result : undefined,
          }
        : await this.folders(actor, selection.browseRequestId);
      if (
        proof.status !== "succeeded" ||
        proof.actor !== actor ||
        proof.workspaceId !== workspaceId ||
        proof.request.deviceId !== selection.deviceId ||
        proof.result?.root !== selection.root ||
        proof.result.path !== selection.path
      )
        fail("folder-proof-denied");
      const paths = selection.root.startsWith("/") ? posix : win32,
        root = paths.resolve(selection.root, selection.path.split("/").join(paths.sep));
      const relative = paths.relative(selection.root, root);
      if (
        paths.parse(root).root === root ||
        relative === ".." ||
        relative.startsWith(".." + paths.sep) ||
        paths.isAbsolute(relative)
      )
        fail("choose-project-folder", 400);
      const repository = selection.repositoryId
        ? await this.publisher?.repository(actor, workspaceId, selection.repositoryId)
        : undefined;
      if (selection.repositoryId && !repository) fail("hosting-not-configured", 503);
      const binding = GitFolderBindingSchema.parse({
        version: 1,
        id: "gfolder_" + randomBytes(16).toString("hex"),
        workspaceId,
        userId: actor,
        deviceId: selection.deviceId,
        root,
        repositoryId: selection.repositoryId ?? null,
        branch: selection.branch ?? "work/" + actor.replace(/^usr_/, ""),
        createdAt: this.now().toISOString(),
      });
      const existing = (await this.state(actor, workspaceId)).folders.find(
        (b) =>
          b.deviceId === binding.deviceId &&
          (paths === win32
            ? b.root.toLowerCase() === binding.root.toLowerCase()
            : b.root === binding.root),
      );
      if (existing) {
        if (
          selection.repositoryId &&
          existing.repositoryId &&
          selection.repositoryId !== existing.repositoryId
        )
          fail("repository-binding-exists", 409);
        if (selection.repositoryId && !existing.repositoryId) {
          if (
            (await this.jobs()).some(
              (j) =>
                j.binding.id === existing.id &&
                ["queued", "claimed", "needs-reconciliation"].includes(j.status),
            )
          )
            fail("folder-busy", 409);
          await this.save(existing.id + ".json", {
            ...(await this.binding(actor, workspaceId, existing.id)),
            repositoryId: selection.repositoryId,
          });
        }
        return this.queue(actor, workspaceId, {
          version: 1,
          folderId: existing.id,
          action: "status",
        });
      }
      if ((await this.state(actor, workspaceId)).folders.length >= 64) fail("folder-capacity", 503);
      await this.save(binding.id + ".json", binding, true);
      return this.queue(
        actor,
        workspaceId,
        { version: 1, folderId: binding.id, action: "status" },
        true,
      );
    });
  }
  async action(actor: string, workspaceId: string, input: unknown) {
    return this.serial(() => this.queue(actor, workspaceId, input));
  }
  private async pickers() {
    const result: GitFolderPicker[] = [];
    for (const name of await this.names())
      if (/^gpick_[a-f0-9]{32}\.json$/.test(name))
        result.push(GitFolderPickerSchema.parse(await this.read(name)));
    return result;
  }
  async picker(actor: string, workspaceId: string, id: string) {
    GitFolderPickerIdSchema.parse(id);
    const raw = await this.read(id + ".json");
    if (!raw) fail("picker-not-found", 404);
    const record = GitFolderPickerSchema.parse(raw);
    if (record.actor !== actor || record.workspaceId !== workspaceId) fail("picker-not-found", 404);
    await this.device(actor, workspaceId, record.deviceId);
    if (
      Date.parse(record.expiresAt) <= this.now().getTime() &&
      ["queued", "claimed"].includes(record.status)
    )
      return {
        ...record,
        status: "failed" as const,
        result: { status: "failed" as const, errorCode: "git-desktop-picker-expired" },
      };
    return record;
  }
  async pick(actor: string, workspaceId: string, input: unknown) {
    return this.serial(async () => {
      const value = GitFolderPickInputSchema.parse(input);
      await this.device(actor, workspaceId, value.deviceId);
      const observation = this.observations.get(value.deviceId);
      if (!observation?.nativePicker || this.now().getTime() - observation.at >= 30000)
        fail("native-picker-update-required", 409);
      const records = await this.pickers();
      const prior = records.find((r) => r.requestId === value.requestId);
      if (prior) {
        if (
          prior.actor !== actor ||
          prior.workspaceId !== workspaceId ||
          prior.deviceId !== value.deviceId
        )
          fail("picker-scope-denied");
        return this.picker(actor, workspaceId, prior.requestId);
      }
      const pending = records.find(
        (r) =>
          r.actor === actor &&
          r.workspaceId === workspaceId &&
          r.deviceId === value.deviceId &&
          ["queued", "claimed"].includes(r.status) &&
          Date.parse(r.expiresAt) > this.now().getTime(),
      );
      if (pending) return pending;
      const job = GitFolderPickerSchema.parse({
        ...value,
        actor,
        workspaceId,
        status: "queued",
        createdAt: this.now().toISOString(),
        expiresAt: new Date(this.now().getTime() + 90000).toISOString(),
      });
      await this.save(job.requestId + ".json", job, true);
      return job;
    });
  }
  async completePicker(credential: string, id: string, input: unknown) {
    return this.serial(async () => {
      const d = await this.devices.checkCredential(credential);
      const job = await this.picker(d.userId, d.workspaceId, id);
      if (
        job.deviceId !== d.deviceId ||
        job.status !== "claimed" ||
        Date.parse(job.expiresAt) <= this.now().getTime()
      )
        fail("picker-scope-denied");
      const result = GitFolderPickResultSchema.parse(input);
      if (result.status === "selected") {
        GitRelativeFileSchema.parse(result.path);
        const paths = result.root.startsWith("/") ? posix : win32;
        if (
          paths.parse(result.root).root !== result.root ||
          (paths === win32 && !/^[a-z]:\\$/i.test(result.root))
        )
          fail("picker-path-denied");
      }
      const record = GitFolderPickerSchema.parse({ ...job, status: result.status, result });
      await this.save(id + ".json", record);
      // A human can spend longer than the claim freshness window in the dialog.
      // Authenticated completion confirms capability; recheck Git on the next claim.
      this.observations.set(d.deviceId, {
        at: this.now().getTime(),
        nativePicker: true,
        gitReady: false,
      });
      return { completed: true };
    });
  }
  async connect(actor: string, workspaceId: string, input: unknown) {
    return this.serial(async () => {
      const a = GitFolderConnectSchema.parse(input),
        b = await this.binding(actor, workspaceId, a.folderId);
      if (!this.publisher) fail("hosting-not-configured", 503);
      const repository = await this.publisher.repository(
        actor,
        workspaceId,
        a.repositoryId,
        a.creationRequestId,
      );
      if (b.repositoryId && b.repositoryId !== a.repositoryId)
        fail("repository-binding-exists", 409);
      const raw = await this.read(b.id + ".snapshot.json");
      if (!raw || GitDesktopSnapshotSchema.parse(raw).fingerprint !== a.expectedFingerprint)
        fail("files-changed-refresh", 409);
      if (
        (await this.jobs()).some(
          (j) =>
            j.binding.id === b.id &&
            ["queued", "claimed", "needs-reconciliation"].includes(j.status),
        )
      )
        fail("folder-busy", 409);
      await this.save(b.id + ".json", {
        ...b,
        repositoryId: a.repositoryId,
        ...(repository.bootstrapSeed ? { bootstrapSeed: repository.bootstrapSeed } : {}),
      });
      return this.queue(actor, workspaceId, { version: 1, folderId: b.id, action: "status" });
    });
  }
  private async queue(
    actor: string,
    workspaceId: string,
    input: unknown,
    select = false,
  ): Promise<GitDesktopJob> {
    const a = GitDesktopActionSchema.parse(input),
      binding = await this.binding(actor, workspaceId, a.folderId),
      o = this.observations.get(binding.deviceId);
    if (!o || this.now().getTime() - o.at >= 30000) fail("connector-update-required", 409);
    const priorJobs = await this.jobs();
    for (const j of priorJobs)
      if (
        j.binding.id === binding.id &&
        j.status === "claimed" &&
        Date.parse(j.expiresAt) <= this.now().getTime()
      ) {
        j.status = "needs-reconciliation";
        j.errorCode = "git-desktop-operation-unconfirmed";
        await this.save(j.id + ".json", j);
      }
    if (a.action === "reconcile") {
      const snapshot = GitDesktopSnapshotSchema.parse(
        await this.read(binding.id + ".snapshot.json"),
      );
      if (snapshot.fingerprint !== a.expectedFingerprint) fail("files-changed-refresh", 409);
      const unresolved = priorJobs.filter(
        (j) => j.binding.id === binding.id && j.status === "needs-reconciliation",
      );
      if (!unresolved.length) fail("no-recovery-required", 409);
      for (const j of unresolved) {
        if (
          !priorJobs.some(
            (s) =>
              s.binding.id === binding.id &&
              s.action === "status" &&
              s.status === "succeeded" &&
              s.createdAt > j.createdAt &&
              (s.observedFingerprint ?? s.snapshot?.fingerprint) === snapshot.fingerprint,
          )
        )
          fail("refresh-before-recovery", 409);
        let confirmed = false;
        if (j.sourceHead) {
          if (!this.publisher || !binding.repositoryId) fail("hosting-not-configured", 503);
          const remote = await this.publisher.branchHead(
            actor,
            workspaceId,
            binding.repositoryId,
            j.branch,
          );
          confirmed = remote === j.sourceHead && snapshot.head === j.sourceHead;
        }
        await this.save(j.id + ".json", {
          ...j,
          status: confirmed ? "succeeded" : "failed",
          ...(confirmed
            ? { snapshot, errorCode: undefined }
            : { errorCode: "git-desktop-local-state-reviewed" }),
        });
      }
      return this.queue(actor, workspaceId, { version: 1, folderId: binding.id, action: "status" });
    }
    let defaultBranch = "main";
    if (a.action !== "status" && !o.gitReady) fail("git-required", 409);
    if (a.action !== "status" && (a.action !== "switch-branch" || binding.repositoryId)) {
      if (!this.publisher || !binding.repositoryId) fail("choose-central-repository", 409);
      const repo = await this.publisher.repository(actor, workspaceId, binding.repositoryId);
      if (!repo.write && ["commit-push", "push"].includes(a.action)) fail("write-denied");
      defaultBranch = repo.defaultBranch;
    }
    for (const j of priorJobs)
      if (
        j.binding.id === binding.id &&
        ["queued", "claimed", "needs-reconciliation"].includes(j.status)
      ) {
        if (j.status === "queued" && Date.parse(j.expiresAt) <= this.now().getTime()) {
          await this.save(j.id + ".json", {
            ...j,
            status: "failed",
            errorCode: "git-desktop-request-expired",
          });
          continue;
        }
        if (a.action !== "status" || j.status !== "needs-reconciliation") fail("folder-busy", 409);
      }
    const snapshot = await this.read(binding.id + ".snapshot.json");
    if (
      a.action !== "status" &&
      (!snapshot || a.expectedFingerprint !== GitDesktopSnapshotSchema.parse(snapshot).fingerprint)
    )
      fail("files-changed-refresh", 409);
    const remoteHead =
      a.action === "switch-branch" && binding.repositoryId && this.publisher
        ? await this.publisher.branchHead(
            actor,
            workspaceId,
            binding.repositoryId,
            a.branch ?? binding.branch,
          )
        : null;
    const job = GitDesktopJobSchema.parse({
      version: 1,
      id: "gjob_" + randomBytes(16).toString("hex"),
      workspaceId,
      actor,
      deviceId: binding.deviceId,
      binding,
      action: select ? "select" : a.action,
      branch: a.branch ?? binding.branch,
      defaultBranch,
      createdAt: this.now().toISOString(),
      expiresAt: new Date(this.now().getTime() + 300000).toISOString(),
      status: "queued",
      ...(a.expectedFingerprint ? { expectedFingerprint: a.expectedFingerprint } : {}),
      ...(a.message ? { message: a.message } : {}),
      ...(a.files ? { files: a.files } : {}),
      ...(remoteHead ? { remoteHead } : {}),
    });
    await this.save(job.id + ".json", job, true);
    return job;
  }
  async claim(credential: string, input: unknown) {
    return this.serial(async () => {
      const c = Claim.parse(input),
        device = await this.devices.checkCredential(credential);
      await this.device(device.userId, device.workspaceId, device.deviceId);
      this.observations.set(device.deviceId, {
        at: this.now().getTime(),
        gitReady: c.gitReady,
        nativePicker: c.picker === 1,
      });
      const pickers = c.picker
        ? (await this.pickers())
            .filter(
              (p) =>
                p.actor === device.userId &&
                p.workspaceId === device.workspaceId &&
                p.deviceId === device.deviceId &&
                p.status === "queued" &&
                Date.parse(p.expiresAt) > this.now().getTime(),
            )
            .slice(0, 1)
        : [];
      for (const p of pickers) {
        p.status = "claimed";
        await this.save(p.requestId + ".json", p);
      }
      const jobs = (await this.jobs())
        .filter(
          (j) =>
            j.deviceId === device.deviceId &&
            j.actor === device.userId &&
            j.workspaceId === device.workspaceId &&
            j.status === "queued" &&
            Date.parse(j.expiresAt) > this.now().getTime(),
        )
        .slice(0, 1);
      for (const j of jobs) {
        j.status = "claimed";
        await this.save(j.id + ".json", j);
      }
      return { jobs, ...(c.picker ? { pickers } : {}) };
    });
  }
  private async claimed(credential: string, id: string) {
    GitDesktopJobIdSchema.parse(id);
    const d = await this.devices.checkCredential(credential);
    const raw = await this.read(id + ".json");
    if (!raw) fail("job-not-found", 404);
    const j = GitDesktopJobSchema.parse(raw);
    if (
      j.actor !== d.userId ||
      j.workspaceId !== d.workspaceId ||
      j.deviceId !== d.deviceId ||
      j.status !== "claimed" ||
      Date.parse(j.expiresAt) <= this.now().getTime()
    )
      fail("job-denied");
    await this.device(j.actor, j.workspaceId, j.deviceId);
    return j;
  }
  async authorizeJob(credential: string, id: string) {
    await this.claimed(credential, id);
  }
  async identity(credential: string) {
    const d = await this.devices.checkCredential(credential);
    await this.device(d.userId, d.workspaceId, d.deviceId);
    return { deviceId: d.deviceId, workspaceId: d.workspaceId, profileId: d.profileId ?? null };
  }
  async publish(credential: string, id: string, head: string, bundle: Buffer) {
    return this.serial(async () => {
      const j = await this.claimed(credential, id);
      if (
        !["commit-push", "push"].includes(j.action) ||
        !j.binding.repositoryId ||
        !/^[a-f0-9]{40}$/.test(head) ||
        !Buffer.isBuffer(bundle) ||
        !bundle.length ||
        bundle.length > 67108864 ||
        !this.publisher
      )
        fail("publish-denied");
      j.sourceHead = head;
      await this.save(j.id + ".json", j);
      try {
        await this.publisher.publish(
          j.actor,
          j.workspaceId,
          j.binding.repositoryId,
          j.branch,
          head,
          bundle,
        );
        await this.save(
          j.id + ".publication.json",
          {
            workspaceId: j.workspaceId,
            actor: j.actor,
            deviceId: j.deviceId,
            branch: j.branch,
            head,
            confirmedAt: this.now().toISOString(),
          },
          true,
        );
        return { published: true };
      } catch (e) {
        await this.save(j.id + ".json", {
          ...j,
          status: "needs-reconciliation",
          errorCode: "git-desktop-publication-unconfirmed",
        });
        throw e;
      }
    });
  }
  async download(credential: string, id: string) {
    const j = await this.claimed(credential, id);
    if (
      ![
        "pull",
        "clone",
        "commit-push",
        ...(j.binding.bootstrapSeed ? ["push"] : []),
        ...(j.remoteHead ? ["switch-branch"] : []),
      ].includes(j.action) ||
      !this.publisher ||
      !j.binding.repositoryId
    )
      fail("pull-denied");
    const value = await this.publisher.download(
      j.actor,
      j.workspaceId,
      j.binding.repositoryId,
      ["commit-push", "push"].includes(j.action) ? j.defaultBranch : j.branch,
    );
    if (value.bytes.length > 67108864) fail("bundle-capacity", 413);
    return { head: value.head, bundle: value.bytes.toString("base64") };
  }
  async complete(credential: string, id: string, input: unknown) {
    return this.serial(async () => {
      const result = Completion.parse(input),
        j = await this.claimed(credential, id);
      if (result.status === "succeeded") {
        if (result.snapshot.folderId !== j.binding.id || result.snapshot.root !== j.binding.root)
          fail("snapshot-scope-denied");
        if (!["status", "select"].includes(j.action) && result.snapshot.branch !== j.branch)
          fail("snapshot-scope-denied");
        if (["commit-push", "push"].includes(j.action)) {
          const publication = await this.read(j.id + ".publication.json");
          if (
            !publication ||
            publication.head !== result.snapshot.head ||
            publication.actor !== j.actor ||
            publication.workspaceId !== j.workspaceId
          )
            fail("publication-proof-required");
        }
        const updated = GitDesktopJobSchema.parse({
          ...j,
          status: "succeeded",
          snapshot: undefined,
          observedFingerprint: result.snapshot.fingerprint,
          files: undefined,
          message: undefined,
        });
        await this.save(j.binding.id + ".snapshot.json", result.snapshot);
        if (
          result.snapshot.branch &&
          j.binding.branch !== result.snapshot.branch &&
          result.snapshot.branch !== j.defaultBranch
        )
          await this.save(j.binding.id + ".json", { ...j.binding, branch: result.snapshot.branch });
        if (["commit-push", "push"].includes(j.action) && j.binding.bootstrapSeed)
          await this.save(j.binding.id + ".json", {
            ...j.binding,
            bootstrapSeed: undefined,
            branch: result.snapshot.branch ?? j.binding.branch,
          });
        await this.save(j.id + ".json", updated);
      } else
        await this.save(
          j.id + ".json",
          GitDesktopJobSchema.parse({
            ...j,
            status: "failed",
            errorCode: result.errorCode,
            files: undefined,
            message: undefined,
          }),
        );
      return { completed: true };
    });
  }
}
