import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authCookiePolicy,
  ReviewMonitoringSummarySchema,
  type ReviewRegisterConfig,
  ReviewStateSchema,
} from "@frevos/contracts";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { strToU8, zipSync } from "fflate";
import { Pool } from "pg";
import { expect, it } from "vitest";
import { prepareApplicationLoginRole, runMigrations } from "../src/database.js";
import { IdentitySessionRepository, WorkspaceRepository } from "../src/repositories.js";
import { reviewAuthority } from "../src/review-authority.js";
import { ReviewLinkChecker } from "../src/review-link-checker.js";
import { ReviewRegisters } from "../src/review-registers.js";
import { parseReviewWorkbook } from "../src/review-workbook.js";
import { buildServer } from "../src/server.js";

it("runs authenticated review import, actual HTTP page checks and role revocation against PostgreSQL and durable state", async () => {
  const container = await new PostgreSqlContainer(
    "postgres:18.4-alpine3.23@sha256:996d0920e4ff9df1fc19dacb904492f3c1ec0ec1cc338f0ad7123be7731c5f5e",
  ).start();
  const migrator = new Pool({ connectionString: container.getConnectionUri() });
  const root = await mkdtemp(join(tmpdir(), "devsetu-reviews-"));
  let excludedRequests = 0;
  const fixture = createServer((request, response) => {
    if (request.url === "/excluded") excludedRequests++;
    expect(request.headers.cookie).toBeUndefined();
    expect(request.headers.authorization).toBeUndefined();
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      request.url === "/missing"
        ? "<title>404 Not Found</title><h1>Not Found</h1>"
        : "<title>Local review fixture</title><h1>Expected review application</h1>",
    );
  });
  let pool: Pool | undefined;
  let server: Awaited<ReturnType<typeof buildServer>> | undefined;
  try {
    await runMigrations(migrator);
    const runtimePassword = randomBytes(24).toString("hex");
    await migrator.query(
      `CREATE ROLE review_runtime LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await prepareApplicationLoginRole(migrator, "review_runtime");
    const runtimeUrl = new URL(container.getConnectionUri());
    runtimeUrl.username = "review_runtime";
    runtimeUrl.password = runtimePassword;
    pool = new Pool({ connectionString: runtimeUrl.toString() });
    const identities = new IdentitySessionRepository(pool);
    const workspaces = new WorkspaceRepository(pool);
    const ws = "ws_reviews";
    await workspaces.createWorkspace({ workspaceId: ws, displayName: "Local review workspace" });
    await workspaces.createWorkspace({ workspaceId: "ws_other", displayName: "Other workspace" });
    const accounts = ["admin", "reviewer", "viewer", "unshared"];
    const password = randomBytes(24).toString("base64url");
    for (const name of accounts) {
      await identities.provisionLocalCredential({
        username: `review.${name}`,
        password,
        displayName: name,
        userId: `usr_${name}`,
      });
      await workspaces.createMembership({
        workspaceId: ws,
        userId: `usr_${name}`,
        grantedScopes: [
          "workspace:read",
          "project:read",
          ...(name === "admin" ? ["reviews:admin"] : []),
        ],
      });
    }
    await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
    const address = fixture.address();
    if (!address || typeof address === "string") throw Error("No local fixture port");
    const target = `http://127.0.0.1:${address.port}`;
    const checker = new ReviewLinkChecker(undefined, true);
    const authority = reviewAuthority(workspaces, {});
    const reviews = new ReviewRegisters(
      root,
      authority,
      async () => accounts.map((name) => ({ userId: `usr_${name}`, name })),
      {
        parseWorkbook: parseReviewWorkbook,
        checkLink: (endpoint, policy) => checker.check(endpoint, policy),
      },
    );
    const origin = "http://127.0.0.1:57971";
    server = await buildServer({
      publicOrigin: origin,
      basePath: "/devsetu",
      authMode: "local",
      identitySessions: identities,
      workspaces,
      reviews,
    });
    const cookies = authCookiePolicy("http:");
    const login = async (name: string) => {
      const response = await server!.inject({
        method: "POST",
        url: "/devsetu/auth/login",
        headers: { origin },
        payload: { username: `review.${name}`, password },
      });
      expect(response.statusCode).toBe(204);
      const token = response.cookies.find((c) => c.name === cookies.session)!;
      const csrf = response.cookies.find((c) => c.name === cookies.csrf)!;
      return {
        origin,
        cookie: `${cookies.session}=${token.value}; ${cookies.csrf}=${csrf.value}`,
        "x-csrf-token": csrf.value,
      };
    };
    const admin = await login("admin"),
      reviewer = await login("reviewer"),
      viewer = await login("viewer"),
      unshared = await login("unshared");
    const endpoint = `/devsetu/v1/workspaces/${ws}/reviews`;
    const command = (action: string, input: unknown, headers = admin) =>
      server!.inject({
        method: "POST",
        url: `${endpoint}/${action}`,
        headers: { ...headers, "content-type": "application/json" },
        payload: JSON.stringify(input),
      });
    expect((await server.inject({ method: "GET", url: endpoint })).statusCode).toBe(401);
    expect(
      (
        await server.inject({
          method: "POST",
          url: `${endpoint}/save-register`,
          headers: { cookie: admin.cookie },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    const config: ReviewRegisterConfig = {
      name: "Configurable review register",
      description: "",
      fields: [
        {
          key: "reviewRemarks",
          label: "Review remarks",
          type: "multiline",
          options: [],
          required: false,
        },
      ],
      managementOptions: ["Internal", "Vendor"],
      lifecycleOptions: ["Active", "Retired"],
      requirementOptions: ["Required", "Not required"],
      decisionOptions: ["Follow up", "Retain"],
      linkPolicy: {
        allowedOrigins: [target],
        allowedPathPrefixes: ["/"],
        allowPrivate: false,
        timeoutMs: 3000,
        maxBytes: 4096,
        maxRedirects: 1,
      },
    };
    const created = await command("save-register", { version: 1, expectedRevision: 0, config });
    expect(created.statusCode).toBe(200);
    let state = ReviewStateSchema.parse(created.json());
    const registerId = state.register.id;
    for (const [name, role] of [
      ["reviewer", "reviewer"],
      ["viewer", "viewer"],
    ] as const) {
      const response = await command("grant", {
        version: 1,
        registerId,
        expectedRevision: state.register.revision,
        userId: `usr_${name}`,
        role,
      });
      expect(response.statusCode).toBe(200);
      state = ReviewStateSchema.parse(response.json());
    }
    expect(
      (await server.inject({ method: "GET", url: `${endpoint}/${registerId}`, headers: unshared }))
        .statusCode,
    ).toBe(404);
    expect(
      (await server.inject({ method: "GET", url: endpoint, headers: unshared })).json().registers,
    ).toEqual([]);
    const read = await server.inject({
      method: "GET",
      url: `${endpoint}/${registerId}`,
      headers: viewer,
    });
    expect(read.headers["cache-control"]).toBe("no-store");
    expect(read.json().register.grants).toEqual([]);
    expect(
      (await command("save-register", { version: 1, expectedRevision: 0, config }, reviewer))
        .statusCode,
    ).toBe(403);
    const workbook = zipSync({
      "[Content_Types].xml": strToU8(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
      ),
      "xl/workbook.xml": strToU8(
        '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Applications" sheetId="1" r:id="rId1"/></sheets></workbook>',
      ),
      "xl/_rels/workbook.xml.rels": strToU8(
        '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
      "xl/worksheets/sheet1.xml": strToU8(
        `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Link</t></is></c><c r="C1" t="inlineStr"><is><t>Owner</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Local application</t></is></c><c r="B2" t="inlineStr"><is><t>${target}/</t></is></c><c r="C2" t="inlineStr"><is><t>Business owner</t></is></c></row></sheetData></worksheet>`,
      ),
    });
    const upload = {
      version: 1,
      registerId,
      fileName: "applications.xlsx",
      contentBase64: Buffer.from(workbook).toString("base64"),
    };
    expect((await command("workbook", upload, viewer)).statusCode).toBe(403);
    expect((await command("workbook", upload, reviewer)).json().sheets[0].name).toBe(
      "Applications",
    );
    const preview = await command(
      "preview-import",
      {
        ...upload,
        expectedRevision: state.register.revision,
        sheet: "Applications",
        headerRow: 1,
        mapping: { title: "A", url: "B", businessOwner: "C" },
        defaultScheme: "https",
      },
      reviewer,
    );
    expect(preview.statusCode).toBe(200);
    const commit = {
      version: 1,
      registerId,
      previewId: preview.json().id,
      expectedRevision: state.register.revision,
      resolutions: [],
    };
    const imported = await command("commit-import", commit, reviewer);
    expect(imported.statusCode).toBe(200);
    state = ReviewStateSchema.parse(imported.json());
    expect(state.records[0]!.businessOwner).toBe("Business owner");
    expect(state.records[0]!.technicalAssignee).toBe("");
    expect(state.records[0]!.provenance[0]!.cells["businessOwner"]).toBe("C2");
    expect((await command("commit-import", commit, reviewer)).statusCode).toBe(409);
    const record = state.records[0]!;
    const checkInput = {
      version: 1,
      registerId,
      recordId: record.id,
      endpointId: record.endpoints[0]!.id,
      expectedRevision: record.revision,
    };
    expect((await command("check-link", checkInput, viewer)).statusCode).toBe(403);
    const changed = await command(
      "save-record",
      {
        version: 1,
        registerId,
        id: record.id,
        expectedRevision: record.revision,
        record: {
          title: record.title,
          description: record.description,
          department: record.department,
          management: record.management,
          businessOwner: record.businessOwner,
          spoc: record.spoc,
          technicalAssignee: record.technicalAssignee,
          lifecycle: record.lifecycle,
          requirement: record.requirement,
          recordedAccess: "Previously available",
          fields: record.fields,
          endpoints: [{ ...record.endpoints[0]!, expectedText: "Expected review application" }],
        },
      },
      reviewer,
    );
    expect(changed.statusCode).toBe(200);
    state = ReviewStateSchema.parse(changed.json());
    const checked = await command(
      "check-link",
      { ...checkInput, expectedRevision: state.records[0]!.revision },
      reviewer,
    );
    expect(checked.statusCode).toBe(200);
    state = ReviewStateSchema.parse(checked.json());
    expect(state.records[0]!.checks[0]!.status).toBe("healthy");
    expect(state.records[0]!.checks[0]!.by).toBe("usr_reviewer");
    const reviewed = await command(
      "add-review",
      {
        version: 1,
        registerId,
        recordId: record.id,
        expectedRevision: state.records[0]!.revision,
        decision: "Follow up",
        note: "Evidence checked",
        nextAction: "Confirm maintainer",
        dueDate: "2026-12-01",
      },
      reviewer,
    );
    expect(reviewed.statusCode).toBe(200);
    state = ReviewStateSchema.parse(reviewed.json());
    expect(state.records[0]!.reviews[0]!.by).toBe("usr_reviewer");
    const source = state.records[0]!;
    const excluded = await command("save-record", {
      version: 1,
      registerId,
      expectedRevision: 0,
      record: {
        title: "Excluded inaccessible application",
        description: "Must not be probed by the monitor",
        department: source.department,
        management: source.management,
        businessOwner: source.businessOwner,
        spoc: source.spoc,
        technicalAssignee: source.technicalAssignee,
        lifecycle: source.lifecycle,
        requirement: source.requirement,
        recordedAccess: "Not available",
        fields: source.fields,
        endpoints: [
          { ...source.endpoints[0]!, id: `ep_${"b".repeat(32)}`, url: `${target}/excluded` },
        ],
      },
    });
    expect(excluded.statusCode).toBe(200);
    state = ReviewStateSchema.parse(excluded.json());
    const scheduleInput = {
      version: 1,
      registerId,
      expectedRevision: state.register.revision,
      schedule: {
        enabled: false,
        weekdays: [1, 3, 5],
        time: "09:15",
        timeZone: "Asia/Kolkata",
        accessibleValues: ["Previously available"],
        sslWarningDays: [15, 10],
      },
    };
    expect((await command("save-schedule", scheduleInput, viewer)).statusCode).toBe(403);
    expect((await command("save-schedule", scheduleInput, reviewer)).statusCode).toBe(403);
    const scheduled = await command("save-schedule", scheduleInput);
    expect(scheduled.statusCode).toBe(200);
    state = ReviewStateSchema.parse(scheduled.json());
    const runInput = { version: 1, registerId, expectedRevision: state.register.revision };
    expect((await command("run-monitor", runInput, viewer)).statusCode).toBe(403);
    expect((await command("run-monitor", runInput, reviewer)).statusCode).toBe(403);
    const claimed = await command("run-monitor", runInput);
    expect(claimed.statusCode).toBe(200);
    await reviews.tickMonitoring();
    const summary = await server.inject({
      method: "GET",
      url: `${endpoint}/monitoring`,
      headers: admin,
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.headers["cache-control"]).toBe("no-store");
    const aggregate = ReviewMonitoringSummarySchema.parse(summary.json());
    const completedRun = aggregate.registers[0]!.monitoring.runs.at(-1)!;
    expect(completedRun.status).toBe("completed");
    expect(completedRun.eligibleRecords).toBe(1);
    expect(completedRun.skippedRecords).toBe(1);
    expect(completedRun.items).toHaveLength(0);
    expect(completedRun.summary).toEqual({ endpoints: 1, completed: 1, issues: 0 });
    const reportDetail = ReviewStateSchema.parse((await server.inject({
      method: "GET", url: `${endpoint}/${registerId}`, headers: admin,
    })).json());
    expect(reportDetail.monitoring?.runs[0]?.items).toHaveLength(1);
    expect(reportDetail.monitoring?.runs[0]?.items[0]?.result?.status).toBe("healthy");
    expect(excludedRequests).toBe(0);
    const sharedSummary = await server.inject({
      method: "GET",
      url: `${endpoint}/monitoring`,
      headers: viewer,
    });
    expect(ReviewMonitoringSummarySchema.parse(sharedSummary.json()).registers).toHaveLength(1);
    const privateSummary = await server.inject({
      method: "GET",
      url: `${endpoint}/monitoring`,
      headers: unshared,
    });
    expect(ReviewMonitoringSummarySchema.parse(privateSummary.json()).registers).toEqual([]);
    expect((await server.inject({ method: "GET", url: `${endpoint}/monitoring` })).statusCode).toBe(
      401,
    );
    const snapshot = await readFile(join(root, `${ws}.json`));
    expect(
      (await new ReviewRegisters(root, authority).state("usr_admin", ws, registerId)).records[0]!
        .checks[0]!.status,
    ).toBe("healthy");
    expect(
      (
        await server.inject({
          method: "GET",
          url: `/devsetu/v1/workspaces/ws_other/reviews/${registerId}`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(404);
    await migrator.query(
      "UPDATE frevos.workspace_memberships SET status='revoked' WHERE workspace_id=$1 AND user_id=$2",
      [ws, "usr_reviewer"],
    );
    expect(
      (
        await command(
          "check-link",
          { ...checkInput, expectedRevision: state.records[0]!.revision },
          reviewer,
        )
      ).statusCode,
    ).toBe(403);
    expect(await readFile(join(root, `${ws}.json`))).toEqual(snapshot);
  } finally {
    await server?.close();
    await new Promise<void>((resolve) => fixture.close(() => resolve()));
    await pool?.end();
    await migrator.end();
    await container.stop();
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);
