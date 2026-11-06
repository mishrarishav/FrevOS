import { createRequire } from "node:module";
import { ServiceInventorySchema } from "@frevos/contracts";
import { expect, it } from "vitest";

const native = createRequire(import.meta.url)("../../../deployment/servix/SoftwareNative.cjs");
it("reads the real Windows service catalogue and current SCM rights without sending binary paths/accounts", async () => {
  if (process.platform !== "win32") return;
  const snapshot = await native.serviceInventory();
  expect(ServiceInventorySchema.safeParse(snapshot).success).toBe(true);
  expect(snapshot.status).toBe("ready");
  expect(snapshot.items.length).toBeGreaterThan(0);
  const json = JSON.stringify(snapshot);
  expect(json).not.toContain('"PathName"');
  expect(json).not.toContain('"StartName"');
  const rpc = snapshot.items.find((s: { name: string }) => s.name === "RpcSs");
  expect(rpc?.protected).toBe(true);
  expect(rpc?.canStop).toBe(false);
  expect(
    snapshot.items
      .filter((s: { startupType: string }) => s.startupType === "Disabled")
      .every((s: { canStart: boolean }) => !s.canStart),
  ).toBe(true);
}, 60000);
function linuxFixture() {
  let active = false,
    changed = false,
    dependent = false,
    denied = false,
    unreadable = false,
    reload = false,
    authorized = 0;
  const mutations: string[][] = [];
  const run = async (file: string, args: string[]) => {
    expect(file).toBe("/usr/bin/systemctl");
    expect(args).toContain("--no-ask-password");
    if (args.includes("--user")) throw Error("no-user-manager");
    if (args.includes("list-unit-files") || args.includes("list-units"))
      return {
        output:
          "fixture-api.service enabled\nfixture-alias.service alias\nsshd.service enabled\nfixture\\x2dexample.service enabled\n",
      };
    if (args.includes("--property=RequiredBy,BoundBy,ConsistsOf,PropagatesStopTo"))
      return { output: dependent ? "RequiredBy=dependent.service\n" : "RequiredBy=\n" };
    if (args.includes("--property=ActiveState")) return { output: "ActiveState=active\n" };
    if (args.includes("start") || args.includes("stop")) {
      if (denied) throw Error("os-permission-denied");
      mutations.push(args);
      active = args.includes("start");
      return { output: "" };
    }
    return {
      output: args
        .slice(args.indexOf("--") + 1)
        .map(
          (name) =>
            `Id=${name === "fixture-alias.service" ? "fixture-api.service" : name}\nDescription=Fixture service\nActiveState=${active ? "active" : "inactive"}\nUnitFileState=enabled\nFragmentPath=/fixture/unit.service\nDropInPaths=/fixture/override.conf\nNeedDaemonReload=${reload ? "yes" : "no"}\nExecStart=fixture-private-command; pid=${active ? 123 : 0}; start_time=${active ? "today" : "never"}\nUser=fixture-user\nGroup=fixture-group\nType=simple\nCanStart=yes\nCanStop=yes\nRefuseManualStart=no\nRefuseManualStop=no`,
        )
        .join("\n\n"),
    };
  };
  const options = {
    platform: "linux",
    run,
    readServiceDefinition: async (file: string) => {
      if (unreadable) throw Error("EACCES");
      return {
        path: file,
        bytes: Buffer.from(
          file.endsWith(".conf") && changed ? "changed private definition" : "private definition",
        ),
      };
    },
    beforeExecute: async () => {
      authorized++;
    },
  };
  return {
    options,
    mutations,
    get authorized() {
      return authorized;
    },
    setChanged: () => {
      changed = true;
    },
    setDependent: () => {
      dependent = true;
    },
    setDenied: () => {
      denied = true;
    },
    setUnreadable: () => {
      unreadable = true;
    },
    setReload: () => {
      reload = true;
    },
  };
}
it("keeps Linux system/user scope distinct, hashes private definitions and executes only fixed reauthorized service actions", async () => {
  const f = linuxFixture(),
    snapshot = await native.serviceInventory(f.options);
  expect(snapshot.status).toBe("partial");
  expect(ServiceInventorySchema.safeParse(snapshot).success).toBe(true);
  expect(JSON.stringify(snapshot)).not.toContain("fixture-private-command");
  expect(JSON.stringify(snapshot)).not.toContain("fixture-user");
  expect(JSON.stringify(snapshot)).not.toContain("private definition");
  expect(snapshot.items).toHaveLength(3);
  expect(
    snapshot.items.filter((s: { name: string }) => s.name === "fixture-api.service"),
  ).toHaveLength(1);
  const escaped = snapshot.items.find(
    (s: { name: string }) => s.name === "fixture\\x2dexample.service",
  );
  expect(escaped).toMatchObject({ protected: true, canStart: false, canStop: false });
  expect(snapshot.items.find((s: { name: string }) => s.name === "sshd.service").protected).toBe(
    true,
  );
  const service = snapshot.items.find((s: { name: string }) => s.name === "fixture-api.service");
  expect(await native.serviceAction(service, "start-service", f.options)).toEqual({
    result: "service-started",
  });
  expect(await native.serviceAction(service, "stop-service", f.options)).toEqual({
    result: "service-stopped",
  });
  expect(f.authorized).toBe(2);
  expect(f.mutations.map((a) => a.slice(-3))).toEqual([
    ["start", "--", "fixture-api.service"],
    ["stop", "--", "fixture-api.service"],
  ]);
  f.setChanged();
  expect(await native.serviceAction(service, "start-service", f.options)).toEqual({
    result: "service-changed",
  });
  expect(f.mutations).toHaveLength(2);
});
it("retains read-only Linux metadata when definition files cannot be pinned or daemon reload is pending", async () => {
  const f = linuxFixture();
  f.setUnreadable();
  const snapshot = await native.serviceInventory(f.options);
  expect(ServiceInventorySchema.safeParse(snapshot).success).toBe(true);
  expect(snapshot.status).toBe("partial");
  expect(snapshot.items).toHaveLength(3);
  expect(snapshot.items.every((s: { protected: boolean }) => s.protected)).toBe(true);
  const pending = linuxFixture();
  pending.setReload();
  const reloading = await native.serviceInventory(pending.options);
  expect(reloading.items).toHaveLength(3);
  expect(
    reloading.items.every(
      (s: { canStart: boolean; canStop: boolean }) => !s.canStart && !s.canStop,
    ),
  ).toBe(true);
});
it("refuses Linux dependent stops, native denial, malformed names and revocation before mutation", async () => {
  const f = linuxFixture(),
    snapshot = await native.serviceInventory(f.options),
    service = snapshot.items.find((s: { name: string }) => s.name === "fixture-api.service");
  f.setDependent();
  expect(await native.serviceAction(service, "stop-service", f.options)).toEqual({
    result: "dependents-running",
  });
  expect(f.mutations).toHaveLength(0);
  f.setDenied();
  expect(await native.serviceAction(service, "start-service", f.options)).toEqual({
    result: "os-permission-denied",
  });
  await expect(
    native.serviceAction({ ...service, name: "--now" }, "start-service", f.options),
  ).rejects.toThrow("service-scope-denied");
  await expect(
    native.serviceAction({ ...service, name: "a.service; touch x" }, "start-service", f.options),
  ).rejects.toThrow("service-scope-denied");
  await expect(
    native.serviceAction({ ...service, protected: true }, "start-service", f.options),
  ).rejects.toThrow("service-scope-denied");
  await expect(
    native.serviceAction(service, "start-service", {
      ...f.options,
      beforeExecute: async () => {
        throw Error("revoked");
      },
    }),
  ).rejects.toThrow("revoked");
  expect(f.mutations).toHaveLength(0);
});
it("stops reading uncached Linux definitions at the aggregate scan budget", async () => {
  let reads = 0;
  const snapshot = await native.serviceInventory({
    platform: "linux",
    run: async (_file: string, args: string[]) => {
      if (args.includes("--user")) throw Error("no-user-manager");
      if (args.includes("list-units")) return { output: "" };
      if (args.includes("list-unit-files"))
        return {
          output: Array.from({ length: 100 }, (_, i) => `unit${i}.service enabled`).join("\n"),
        };
      return {
        output: args
          .slice(args.indexOf("--") + 1)
          .map(
            (name) =>
              `Id=${name}\nFragmentPath=/fixture/${name}\nNeedDaemonReload=no\nCanStart=yes\nCanStop=yes`,
          )
          .join("\n\n"),
      };
    },
    readServiceDefinition: async (file: string, remaining: number) => {
      expect(remaining).toBeGreaterThanOrEqual(262144);
      reads++;
      return { path: file, bytes: Buffer.alloc(262144) };
    },
  });
  expect(reads).toBe(64);
  expect(snapshot.status).toBe("partial");
  expect(snapshot.items).toHaveLength(100);
  expect(snapshot.items.filter((s: { protected: boolean }) => s.protected)).toHaveLength(36);
});
