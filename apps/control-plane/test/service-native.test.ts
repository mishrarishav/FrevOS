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
}, 60000);
function linuxFixture() {
  let active = false,
    changed = false,
    dependent = false,
    denied = false,
    authorized = 0;
  const mutations: string[][] = [];
  const run = async (file: string, args: string[]) => {
    expect(file).toBe("/usr/bin/systemctl");
    expect(args).toContain("--no-ask-password");
    if (args.includes("--user")) throw Error("no-user-manager");
    if (args.includes("list-unit-files") || args.includes("list-units"))
      return { output: "fixture-api.service enabled\nsshd.service enabled\n" };
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
            `Id=${name}\nDescription=Fixture service\nActiveState=${active ? "active" : "inactive"}\nUnitFileState=enabled\nFragmentPath=/fixture/unit\nExecStart=${changed ? "changed" : "fixture-private-command"}\nUser=fixture-user\nCanStart=yes\nCanStop=yes\nRefuseManualStart=no\nRefuseManualStop=no`,
        )
        .join("\n\n"),
    };
  };
  const options = {
    platform: "linux",
    run,
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
  };
}
it("keeps Linux system/user scope distinct, hashes private definitions and executes only fixed reauthorized service actions", async () => {
  const f = linuxFixture(),
    snapshot = await native.serviceInventory(f.options);
  expect(snapshot.status).toBe("partial");
  expect(ServiceInventorySchema.safeParse(snapshot).success).toBe(true);
  expect(JSON.stringify(snapshot)).not.toContain("fixture-private-command");
  expect(JSON.stringify(snapshot)).not.toContain("fixture-user");
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
