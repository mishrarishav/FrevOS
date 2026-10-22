import { randomUUID } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import { type LocalAccount, LocalAccountSchema, type SessionContext } from "@frevos/contracts";
import type { QueryResultRow } from "pg";
import { type DatabasePool, withApplicationTransaction } from "./database.js";
import { hashLocalPassword } from "./passwords.js";
import type { IdentitySessionRepository } from "./repositories.js";

interface AccountRow extends QueryResultRow {
  user_id: string;
  username: string;
  display_name: string | null;
  status: "active" | "disabled";
  password_changed_at: Date;
  last_authenticated_at: Date | null;
}
const fields = `credential.user_id, credential.username, app_user.display_name, credential.status,
  credential.password_changed_at, credential.last_authenticated_at`;
const from = `FROM frevos.local_credentials credential JOIN frevos.users app_user ON app_user.user_id=credential.user_id`;
function account(row: AccountRow): LocalAccount {
  return LocalAccountSchema.parse({
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    status: row.status,
    passwordChangedAt: row.password_changed_at.toISOString(),
    lastAuthenticatedAt: row.last_authenticated_at?.toISOString() ?? null,
  });
}
export class AccountActionError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(code);
  }
}
// Local credentials own hashing/lockouts. This service exposes only safe metadata
// and scoped credential replacement; it never returns or persists input passwords.
export class LocalAccounts {
  constructor(
    private readonly pool: DatabasePool,
    private readonly identities: IdentitySessionRepository,
    private readonly auditRoot: string,
  ) {}
  async profile(session: SessionContext): Promise<LocalAccount | null> {
    return withApplicationTransaction(this.pool, undefined, async (client) => {
      const rows = await client.query<AccountRow>(
        `SELECT ${fields} ${from} WHERE credential.identity_id=$1 AND credential.user_id=$2`,
        [session.identityId, session.userId],
      );
      return rows.rows[0] ? account(rows.rows[0]) : null;
    });
  }
  async list(workspaceId: string): Promise<LocalAccount[]> {
    return withApplicationTransaction(this.pool, workspaceId, async (client) => {
      const rows = await client.query<AccountRow>(
        `SELECT ${fields} ${from} JOIN frevos.workspace_memberships member ON member.user_id=credential.user_id WHERE member.workspace_id=$1 AND member.status='active' ORDER BY credential.username LIMIT 1001`,
        [workspaceId],
      );
      if (rows.rows.length > 1000) throw new AccountActionError(409, "account-list-capacity");
      return rows.rows.map(account);
    });
  }
  private async audit(record: Record<string, unknown>) {
    await mkdir(this.auditRoot, { recursive: true });
    const file = await open(join(this.auditRoot, "password-actions.jsonl"), "a", 0o600);
    try {
      await file.writeFile(JSON.stringify(record) + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async change(
    session: SessionContext,
    currentPassword: string,
    newPassword: string,
    targetUserId: string,
    workspaceId?: string,
    now = new Date(),
  ): Promise<void> {
    const self = targetUserId === session.userId;
    if (!self && (session.userId !== "usr_windows_admin" || workspaceId !== "ws_server20"))
      throw new AccountActionError(403, "account-action-denied");
    const actor = await this.profile(session);
    if (!actor) throw new AccountActionError(409, "external-identity-password-managed-by-provider");
    const actorVersion = await withApplicationTransaction(this.pool, undefined, async (client) => {
      const rows = await client.query<{ password_hash: Buffer }>(
        "SELECT password_hash FROM frevos.local_credentials WHERE identity_id=$1 AND user_id=$2",
        [session.identityId, session.userId],
      );
      return rows.rows[0]?.password_hash;
    });
    const authenticated = await this.identities.authenticateLocalCredential({
      username: actor.username,
      password: currentPassword,
      now,
    });
    if (!authenticated || authenticated.identity.identityId !== session.identityId)
      throw new AccountActionError(403, "current-password-invalid");
    const digest = await hashLocalPassword(newPassword);
    const operationId = randomUUID();
    const event = {
      operationId,
      actor: session.userId,
      sessionId: session.sessionId,
      workspace: workspaceId ?? "self-account",
      target: targetUserId,
      action: self ? "password-change" : "password-reset",
      utc: now.toISOString(),
      expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    };
    // The authenticated, CSRF-bound form submission and successful current-
    // password check authorize this target once, for at most one minute.
    await this.audit({ ...event, status: "approved" });
    const result = await withApplicationTransaction(this.pool, workspaceId, async (client) => {
      const live = await client.query(
        `SELECT session_id FROM frevos.sessions WHERE session_id=$1 AND user_id=$2 AND identity_id=$3 AND status='active' AND expires_at>$4 AND idle_expires_at>$4 FOR UPDATE`,
        [session.sessionId, session.userId, session.identityId, now],
      );
      if (!live.rows.length) return "session-expired";
      // Password replacement and concurrent password/session changes serialize.
      const actorCredential = await client.query(
        `SELECT identity_id FROM frevos.local_credentials WHERE identity_id=$1 AND password_hash=$2 AND status='active' FOR UPDATE`,
        [session.identityId, actorVersion],
      );
      if (!actorCredential.rows.length) return "credential-changed";
      const target = await client.query(
        `SELECT credential.identity_id FROM frevos.local_credentials credential WHERE credential.user_id=$1 AND credential.status='active' ${self ? "AND credential.identity_id=$2" : "AND EXISTS(SELECT 1 FROM frevos.workspace_memberships member WHERE member.user_id=credential.user_id AND member.workspace_id=$2 AND member.status='active')"} FOR UPDATE`,
        [targetUserId, self ? session.identityId : workspaceId],
      );
      if (target.rows.length !== 1) return "account-not-found";
      if (Date.now() > Date.parse(event.expiresAt)) return "approval-expired";
      await client.query(
        `UPDATE frevos.local_credentials SET password_salt=$2,password_hash=$3,password_changed_at=$4,failed_attempts=0,locked_until=NULL WHERE identity_id=$1`,
        [target.rows[0].identity_id, digest.salt, digest.hash, now],
      );
      await client.query(
        `UPDATE frevos.sessions SET status='revoked',revoked_at=$2 WHERE user_id=$1 AND status='active'`,
        [targetUserId, now],
      );
      return "changed";
    });
    await this.audit({ ...event, status: result });
    if (result !== "changed")
      throw new AccountActionError(result === "account-not-found" ? 404 : 409, result);
  }
}
