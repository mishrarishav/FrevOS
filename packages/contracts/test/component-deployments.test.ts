import { expect, it } from "vitest";
import {
  componentOrder,
  PipelineInputSchema,
  PipelineSchema,
  ExecutorSchema,
} from "../src/component-deployments.js";

const component = {
  id: "frontend",
  name: "Frontend",
  context: "frontend",
  recipe: "npm-static",
  output: "build",
  builderId: "unassigned",
  destinationId: "unassigned",
  destinationBinding: "frontend",
  dependsOn: [],
  preservedPaths: ["uploads", ".env"],
};
const input = {
  version: 1,
  profileId: "split-project",
  expectedRevision: 0,
  displayName: "Split project",
  sourceFolder: "D:\\source",
  archived: false,
  components: [component],
};
it("orders an independent frontend/API graph and rejects ambiguous or cyclic dependencies", () => {
  expect(
    componentOrder([
      { id: "api", dependsOn: [] },
      { id: "web", dependsOn: ["api"] },
      { id: "worker", dependsOn: ["api"] },
    ]),
  ).toEqual(["api", "web", "worker"]);
  expect(componentOrder([])).toEqual([]);
  expect(() => componentOrder([{ id: "api", dependsOn: ["absent"] }])).toThrow("unknown");
  expect(() =>
    componentOrder([
      { id: "api", dependsOn: ["web"] },
      { id: "web", dependsOn: ["api"] },
    ]),
  ).toThrow("cycle");
  expect(() =>
    componentOrder([
      { id: "api", dependsOn: [] },
      { id: "api", dependsOn: [] },
    ]),
  ).toThrow("duplicate");
  expect(PipelineInputSchema.parse(input).sourcePreservedPaths).toEqual([]);
  expect(
    PipelineInputSchema.safeParse({
      ...input,
      components: [{ ...component, siteUrl: "https://frontend.example/" }],
    }).success,
  ).toBe(true);
  expect(
    PipelineInputSchema.safeParse({
      ...input,
      components: [{ ...component, siteUrl: "https://user:secret@frontend.example/" }],
    }).success,
  ).toBe(false);
  expect(
    PipelineInputSchema.safeParse({
      ...input,
      components: [{ ...component, dependsOn: ["absent"] }],
    }).success,
  ).toBe(false);
  const target = "ex_" + "a".repeat(32);
  expect(
    PipelineInputSchema.safeParse({
      ...input,
      components: [
        { ...component, destinationId: target },
        { ...component, id: "second", destinationId: target },
      ],
    }).success,
  ).toBe(false);
  expect(
    PipelineInputSchema.safeParse({
      ...input,
      components: [
        { ...component, destinationId: target },
        { ...component, id: "second", destinationId: target, destinationBinding: "second" },
      ],
    }).success,
  ).toBe(true);
  for (const change of [
    { context: "../escape" },
    { output: "C:/escape" },
    { preservedPaths: ["**/data"] },
    { command: "powershell" },
  ]) {
    expect(
      PipelineInputSchema.safeParse({ ...input, components: [{ ...component, ...change }] })
        .success,
    ).toBe(false);
  }
  const { expectedRevision: _, ...fields } = input;
  const saved = {
    ...fields,
    revision: 1,
    repository: {
      id: "gitrepo_" + "b".repeat(32),
      origin: "devsetu://repositories/gitrepo_" + "b".repeat(32),
      remoteName: "devsetu",
      branch: "devsetu-dev",
    },
    updatedAt: new Date().toISOString(),
    updatedBy: "usr_owner",
  };
  expect(PipelineSchema.parse(saved).revision).toBe(1);
  expect(
    PipelineSchema.safeParse({ ...saved, components: [{ ...component, dependsOn: ["missing"] }] })
      .success,
  ).toBe(false);
});

it("accepts enrolled HTTP health origins while denying other protocols and embedded credentials", () => {
  const executor = {
    id: "ex_" + "c".repeat(32),
    name: "API server",
    profileId: input.profileId,
    role: "destination",
    userId: "usr_owner",
    status: "active",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    online: true,
    lastSeenAt: null,
    bindings: [
      {
        id: "api",
        root: "D:\\api",
        healthUrl: "http://127.0.0.1:5011/health",
        recipes: ["node-source"],
      },
    ],
  };
  expect(ExecutorSchema.safeParse(executor).success).toBe(true);
  for (const url of [
    "file:///D:/health",
    "http://name:password@host/health",
    "http://host/health?secret=value",
    "http://host/health#secret",
  ]) {
    expect(
      ExecutorSchema.safeParse({
        ...executor,
        bindings: [{ ...executor.bindings[0], healthUrl: url }],
      }).success,
    ).toBe(false);
  }
});
