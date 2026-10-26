import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  type DeploymentConnectionTest,
  DeploymentProfileIdSchema,
  type DeploymentSettings,
  DeploymentSettingsInputSchema,
  DeploymentSettingsSchema,
  SERVIX_REPOSITORY,
  matchesDeploymentRepository,
} from "@frevos/contracts";
import type { DeveloperConnectorStore } from "./developer-connectors.js";
import { ServixDeploymentError } from "./servix-deployment.js";

export const defaultDeploymentSettings: DeploymentSettings = DeploymentSettingsSchema.parse({
  version: 1,
  profileId: "servix-development",
  revision: 1,
  displayName: "Servix development",
  repositoryOrigin: SERVIX_REPOSITORY.origin,
  sourceFolder: "D:\\servixDev",
  destination: {
    host: "10.9.69.21",
    root: "D:\\servixDev",
    siteUrl: "http://10.9.69.21:82/",
    credentialProfile: "server21-development",
  },
  preservedPaths: ["backend/uploads", "backend/database", "backend/.env", "backend/.env.prd"],
  runner: "servix-development",
  updatedAt: "2026-10-21T00:00:00.000Z",
  updatedBy: "usr_windows_admin",
});
export const repositoryOrigins = (profile: DeploymentSettings) =>
  profile.profileId === "servix-development"
    ? [SERVIX_REPOSITORY.origin]
    : [profile.repositoryOrigin];

// Managed by the sealed server20 release workflow, never the customer-app runner.
export const platformDeploymentSettings: DeploymentSettings = DeploymentSettingsSchema.parse({
  version: 1,
  profileId: "devsetu-platform",
  revision: 1,
  displayName: "DevSetu",
  repositoryOrigin: "https://github.com/mishrarishav/FrevOS",
  sourceFolder: "D:\\FREVOS\\.local\\worktrees\\servix-dashboard",
  destination: {
    host: "10.9.69.20",
    root: "E:\\FrevOS",
    siteUrl: "http://10.9.69.20/",
    credentialProfile: "not-connected",
  },
  preservedPaths: ["config", "postgres-data", "state", "servix", "git", "backups"],
  runner: "devsetu-platform",
  updatedAt: "2026-10-22T00:00:00.000Z",
  updatedBy: "usr_windows_admin",
});

export class DeploymentSettingsStore {
  private chain: Promise<unknown> = Promise.resolve();
  constructor(
    readonly root: string,
    private readonly allowed: (actor: string) => Promise<boolean>,
    private readonly now = () => new Date(),
  ) {}
  private async permission(actor: string, write = false) {
    if (!(await this.allowed(actor)) || (write && actor !== "usr_windows_admin"))
      throw new ServixDeploymentError("settings-access-denied", 403);
  }
  private async directory() {
    await mkdir(this.root, { recursive: true });
    if ((await lstat(this.root)).isSymbolicLink())
      throw new ServixDeploymentError("settings-storage-unavailable", 503);
  }
  async profile(id: string): Promise<DeploymentSettings> {
    DeploymentProfileIdSchema.parse(id);
    await this.directory();
    const file = join(this.root, id + ".json");
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        if (id === "servix-development") return structuredClone(defaultDeploymentSettings);
        if (id === "devsetu-platform") return structuredClone(platformDeploymentSettings);
        throw new ServixDeploymentError("settings-profile-not-found", 404);
      }
      throw error;
    }
    if (id === "devsetu-platform")
      throw new ServixDeploymentError("managed-profile-storage-conflict", 503);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 32768)
      throw new ServixDeploymentError("settings-storage-unavailable", 503);
    const profile = DeploymentSettingsSchema.parse(JSON.parse(await readFile(file, "utf8")));
    if (profile.profileId !== id)
      throw new ServixDeploymentError("settings-profile-identity-mismatch", 503);
    return profile;
  }
  async list(actor: string) {
    await this.permission(actor);
    await this.directory();
    const names = (await readdir(this.root)).filter((name) =>
      /^[a-z][a-z0-9-]{2,63}\.json$/.test(name),
    );
    if (names.length > 100) throw new ServixDeploymentError("settings-capacity", 503);
    const ids = new Set([
      "servix-development",
      "devsetu-platform",
      ...names.map((n) => n.slice(0, -5)),
    ]);
    if (ids.size > 100) throw new ServixDeploymentError("settings-capacity", 503);
    return Promise.all([...ids].sort().map((id) => this.profile(id)));
  }
  async save(actor: string, input: unknown) {
    const next = this.chain.then(async () => {
      await this.permission(actor, true);
      const request = DeploymentSettingsInputSchema.parse(input);
      if (request.profileId === "devsetu-platform")
        throw new ServixDeploymentError("managed-platform-profile-is-read-only", 403);
      let previous: DeploymentSettings | undefined;
      try {
        previous = await this.profile(request.profileId);
      } catch (e) {
        if (!(e instanceof ServixDeploymentError) || e.statusCode !== 404) throw e;
      }
      if ((previous?.revision ?? 0) !== request.expectedRevision)
        throw new ServixDeploymentError("settings-revision-conflict");
      if (!previous && (await this.list(actor)).length >= 100)
        throw new ServixDeploymentError("settings-capacity");
      if (
        request.profileId === "servix-development" &&
        (request.repositoryOrigin !== defaultDeploymentSettings.repositoryOrigin ||
          JSON.stringify(request.destination) !==
            JSON.stringify(defaultDeploymentSettings.destination))
      )
        throw new ServixDeploymentError("approved-servix-destination-is-fixed");
      // Windows credential profiles are opaque registry references, not authority
      // to reuse server21 credentials against a caller-selected host or folder.
      if (
        request.profileId !== "servix-development" &&
        request.destination.credentialProfile !== "not-connected"
      )
        throw new ServixDeploymentError("destination-profile-not-approved");
      if (
        request.profileId === "servix-development" &&
        request.preservedPaths.some((p) =>
          [
            "frontend",
            "backend",
            "backend/src",
            "querysafe",
            "querysafe/src",
            "frontend/index.html",
            "frontend/web.config",
          ].includes(p.toLowerCase()),
        )
      )
        throw new ServixDeploymentError("preservation-overlaps-required-code");
      const { expectedRevision: _, ...fields } = request;
      const profile = DeploymentSettingsSchema.parse({
        ...fields,
        revision: (previous?.revision ?? 0) + 1,
        updatedAt: this.now().toISOString(),
        updatedBy: actor,
        runner: previous?.runner ?? "not-connected",
      });
      await this.directory();
      const write = async (file: string, data: unknown) => {
        const handle = await open(file, "wx", 0o600);
        try {
          await handle.writeFile(JSON.stringify(data));
          await handle.sync();
        } finally {
          await handle.close();
        }
      };
      const history = join(this.root, "history");
      await mkdir(history, { recursive: true });
      if ((await lstat(history)).isSymbolicLink())
        throw new ServixDeploymentError("settings-storage-unavailable", 503);
      // Never overwrite an earlier revision; a failed current-pointer write is retryable.
      if (previous)
        await write(
          join(history, `${previous.profileId}-${previous.revision}-${randomUUID()}.json`),
          previous,
        );
      await write(
        join(history, `${profile.profileId}-${profile.revision}-${randomUUID()}.json`),
        profile,
      );
      const file = join(this.root, profile.profileId + ".json"),
        tmp = file + "." + randomUUID() + ".tmp";
      await write(tmp, profile);
      await rename(tmp, file);
      return profile;
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
  async test(
    actor: string,
    id: string,
    deviceId: string | undefined,
    connectors: DeveloperConnectorStore,
    destination: () => Promise<boolean>,
  ): Promise<DeploymentConnectionTest> {
    await this.permission(actor);
    const profile = await this.profile(id);
    if (profile.runner === "devsetu-platform")
      throw new ServixDeploymentError("platform-update-use-maintenance", 409);
    const devices = (await connectors.list(actor)).filter(
      (d) => (d.profileId ?? "servix-development") === id,
    );
    const device = devices.find((d) => d.deviceId === deviceId);
    const probe = device ? await connectors.diagnostics(actor, device.deviceId) : undefined;
    const originMatches = matchesDeploymentRepository(profile, probe);
    const sourceReady =
      !!device?.online && originMatches && !!probe && !["main", "master"].includes(probe.branch);
    const supported = !profile.archived && profile.runner === "servix-development";
    const targetHealthy = supported && (await destination().catch(() => false));
    const checks: DeploymentConnectionTest["checks"] = [
      {
        name: "Connector",
        status: device?.online ? "passed" : "failed",
        message: device?.online
          ? `${device.name} is online`
          : "Install/connect the project connector and select your device",
      },
      {
        name: "Source folder",
        status: sourceReady ? "passed" : "failed",
        message: sourceReady
          ? `${probe?.repository} / ${probe?.branch} / ${probe?.head.slice(0, 12)}`
          : "A fresh repository check must verify the device's Git folder, project repository binding and development branch. Re-run the latest installer if diagnostics are unavailable.",
      },
      {
        name: "Destination",
        status: targetHealthy ? "passed" : supported ? "failed" : "pending",
        message: targetHealthy
          ? "Approved server21 development runner and hosted health are reachable"
          : profile.archived
            ? "Project is archived. Restore it from Projects before deploying."
            : supported
              ? "Approved destination health or runner is unavailable"
              : "Configuration saved. An approved destination adapter must be connected before deployment.",
      },
      {
        name: "Preservation",
        status: "passed",
        message: `Mandatory protections plus ${profile.preservedPaths.length} saved literal paths; no files changed by this test`,
      },
    ];
    return {
      profileId: id,
      revision: profile.revision,
      checkedAt: this.now().toISOString(),
      checks,
      ready: sourceReady && targetHealthy,
    };
  }
}
