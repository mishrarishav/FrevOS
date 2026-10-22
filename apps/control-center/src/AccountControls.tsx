import type { AccountProfile, LocalAccount } from "@frevos/contracts";
import { Eye, EyeOff, KeyRound, LogOut, Users, UserRound, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { DeveloperAccess } from "./DeveloperAccess.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label>
      {label}
      <span className="password-input">
        <input
          type={visible ? "text" : "password"}
          value={value}
          minLength={autoComplete === "new-password" ? 8 : 1}
          maxLength={128}
          autoComplete={autoComplete}
          required
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="button ghost"
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </span>
    </label>
  );
}
export function AccountControls({
  api,
  workspaceId,
  onSignedOut,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  onSignedOut: () => void;
}) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileRetry, setProfileRetry] = useState(0);
  const [panel, setPanel] = useState<"account" | "users" | null>(null);
  const [users, setUsers] = useState<LocalAccount[]>([]);
  const [target, setTarget] = useState<LocalAccount | null>(null);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: profileRetry is the explicit Retry generation.
  useEffect(() => {
    const controller = new AbortController();
    setProfileLoading(true);
    void api
      .accountProfile?.(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setProfile(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setProfile(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setProfileLoading(false);
      });
    return () => controller.abort();
  }, [api, profileRetry]);
  const resetFields = () => {
    setCurrent("");
    setPassword("");
    setConfirm("");
    setTarget(null);
    setNotice("");
  };
  const close = () => {
    if (busy) return;
    resetFields();
    setPanel(null);
  };
  const openUsers = () => {
    resetFields();
    setPanel("users");
    setLoading(true);
    setLoadError(false);
    void api
      .listUsers?.(workspaceId)
      .then((items) => setUsers(items))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  const logout = async () => {
    if (busy || !api.logout) return;
    setBusy(true);
    setNotice("");
    try {
      await api.logout();
      close();
      onSignedOut();
    } catch (error) {
      if (error instanceof ApiFailure && error.kind === "unauthenticated") onSignedOut();
      else {
        setPanel("account");
        setNotice("Sign out could not be confirmed. Please retry.");
      }
    } finally {
      setBusy(false);
    }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !api.changePassword) return;
    if (password !== confirm) {
      setNotice("New passwords do not match.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await api.changePassword(
        current,
        password,
        target ? { workspaceId, userId: target.userId } : undefined,
      );
      const own = !target || target.userId === profile?.account?.userId;
      resetFields();
      if (own) {
        setPanel(null);
        onSignedOut();
      } else {
        setNotice(
          "Password reset. This user must sign in again; their existing sessions were ended.",
        );
        setUsers((await api.listUsers?.(workspaceId)) ?? []);
      }
    } catch (error) {
      setNotice(
        error instanceof ApiFailure && error.responseStatus === 403
          ? "Current administrator/account password is incorrect, or access was denied."
          : "Password change could not be confirmed. Try signing in again before retrying.",
      );
    } finally {
      setCurrent("");
      setPassword("");
      setConfirm("");
      setBusy(false);
    }
  };
  return (
    <>
      <button
        className="top-action account-trigger"
        type="button"
        aria-label="My account"
        onClick={() => {
          resetFields();
          setPanel("account");
        }}
      >
        <UserRound size={17} />
        <span>Account</span>
      </button>
      {panel ? (
        <WorkspaceDialog
          label={panel === "users" ? "User management" : "My account"}
          onClose={close}
        >
          <section className="deployment-settings account-panel">
            <header className="settings-header">
              <div>
                <p className="eyebrow">
                  DevSetu / {panel === "users" ? "Administration" : "Account"}
                </p>
                <h2>{panel === "users" ? "User management" : "My account"}</h2>
                <p>
                  {profile?.account?.displayName ??
                    profile?.account?.username ??
                    "Signed-in account"}
                </p>
              </div>
              <button
                className="button ghost"
                type="button"
                aria-label="Close account"
                onClick={close}
                disabled={busy}
              >
                <X size={18} />
              </button>
            </header>
            <div className="account-panel-scroll">
              {notice ? (
                <p className="record-notice" role="status">
                  {notice}
                </p>
              ) : null}
              {panel === "account" ? (
                <div className="account-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => void logout()}
                    disabled={busy || !api.logout}
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                  {profile?.canManageUsers && workspaceId === "ws_server20" ? (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={openUsers}
                      disabled={busy}
                    >
                      <Users size={16} /> User management
                    </button>
                  ) : null}
                </div>
              ) : null}
              {panel === "users" ? (
                <>
                  <p>
                    Manage developer accounts in this workspace. Existing passwords are hashed and
                    cannot be viewed. A reset replaces the password and ends that user's browser
                    sessions.
                  </p>
                  {loading ? (
                    <p role="status">Loading users…</p>
                  ) : loadError ? (
                    <div role="alert">
                      <p>Users could not be loaded.</p>
                      <button type="button" className="button secondary" onClick={openUsers}>
                        Retry
                      </button>
                    </div>
                  ) : (
                    <div className="account-user-table">
                      <table>
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Username</th>
                            <th>Status</th>
                            <th>Password changed</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {users.map((user) => (
                            <tr key={user.userId}>
                              <td>{user.displayName ?? user.username}</td>
                              <td>{user.username}</td>
                              <td>{user.status}</td>
                              <td>{new Date(user.passwordChangedAt).toLocaleString()}</td>
                              <td>
                                <button
                                  type="button"
                                  className="button secondary"
                                  disabled={busy || user.status !== "active"}
                                  onClick={() => {
                                    resetFields();
                                    setTarget(user);
                                  }}
                                >
                                  <KeyRound size={15} />{" "}
                                  {user.userId === profile?.account?.userId
                                    ? "Change password"
                                    : "Reset password"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!target ? <DeveloperAccess api={api} workspaceId={workspaceId} /> : null}
                </>
              ) : null}
              {(panel === "account" && profile?.account) || target ? (
                <form className="account-password-form" onSubmit={(event) => void save(event)}>
                  <h3>
                    {target ? `Reset password for ${target.username}` : "Change your password"}
                  </h3>
                  <p>
                    {target
                      ? "Confirm your own administrator password, then choose a new password for this account."
                      : "Changing your password signs you out of all browser sessions."}
                  </p>
                  <fieldset disabled={busy} className="settings-fields">
                    <PasswordInput
                      label={target ? "Your administrator password" : "Current password"}
                      value={current}
                      onChange={setCurrent}
                      autoComplete="current-password"
                    />
                    <PasswordInput
                      label="New password"
                      value={password}
                      onChange={setPassword}
                      autoComplete="new-password"
                    />
                    <PasswordInput
                      label="Confirm new password"
                      value={confirm}
                      onChange={setConfirm}
                      autoComplete="new-password"
                    />
                  </fieldset>
                  <div className="account-actions">
                    <button className="button primary" type="submit" disabled={busy}>
                      {busy ? "Saving…" : target ? "Reset password" : "Change password"}
                    </button>
                    {target ? (
                      <button
                        className="button secondary"
                        type="button"
                        disabled={busy}
                        onClick={resetFields}
                      >
                        Cancel reset
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : panel === "account" ? (
                profileLoading ? (
                  <p role="status">Loading account…</p>
                ) : profile ? (
                  <p>Password changes are managed by your identity provider for this account.</p>
                ) : (
                  <div role="alert">
                    <p>Account details could not be loaded.</p>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => setProfileRetry((n) => n + 1)}
                    >
                      Retry account
                    </button>
                  </div>
                )
              ) : null}
            </div>
          </section>
        </WorkspaceDialog>
      ) : null}
    </>
  );
}
