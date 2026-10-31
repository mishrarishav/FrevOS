import { useEffect, useState } from "react";
import { sha256 } from "@noble/hashes/sha2.js";
import type { JoinRequest } from "@frevos/contracts";
import type { ControlCenterApi } from "./api.js";
import { addBasePath } from "./routing.js";
import { connectorPlatform } from "./connector-platform.js";
export function suggestedJoinPlatform(agent: string): "win32" | "linux" | "android" | "unknown" {
  if (/Android/i.test(agent)) return "android";
  if (/Windows/i.test(agent)) return "win32";
  if (/Linux/i.test(agent) && !/Android/i.test(agent)) return "linux";
  return "unknown";
}
const storageKey = "devsetu:pending-join";
type Saved = { id: string; code: string; deviceId: string };
export function JoinRequestForm({ api, onClose }: { api: ControlCenterApi; onClose: () => void }) {
  const [mode, setMode] = useState<"new" | "existing">("new"),
    [username, setUsername] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [platform, setPlatform] = useState(() =>
      suggestedJoinPlatform(typeof navigator === "undefined" ? "" : navigator.userAgent),
    ),
    [fileActivity, setFileActivity] = useState(false);
  const [record, setRecord] = useState<JoinRequest | null>(null),
    [saved, setSaved] = useState<Saved | null>(() => {
      try {
        const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
        return value &&
          /^jr_[a-f0-9]{32}$/.test(value.id) &&
          /^[A-HJ-NP-Z2-9]{8}$/.test(value.code) &&
          /^fc_[a-f0-9]{32}$/.test(value.deviceId)
          ? value
          : null;
      } catch {
        return null;
      }
    });
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!saved || !api.joinStatus) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.joinStatus!(abort.signal);
        if (!abort.signal.aborted) {
          if (next.id !== saved.id || next.deviceId !== saved.deviceId) throw Error();
          setRecord(next);
          setMessage("");
        }
      } catch {
        if (!abort.signal.aborted) {
          setRecord(null);
          setMessage(
            "Request status unavailable. Your account or computer has not been granted access by this screen.",
          );
        }
      }
      if (!abort.signal.aborted) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [api, saved]);
  async function submit() {
    if (busy || !api.requestJoin || platform === "unknown") return;
    if (mode === "new" && password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
        code = [...crypto.getRandomValues(new Uint8Array(8))]
          .map((value) => alphabet[value & 31])
          .join("");
      const deviceId =
        "fc_" +
        [...crypto.getRandomValues(new Uint8Array(16))]
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("");
      const codeHash = [...sha256(new TextEncoder().encode(code))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const result = await api.requestJoin({
        version: 1,
        mode,
        username,
        password,
        displayName: name || username,
        platform,
        deviceId,
        codeHash,
        fileActivity: platform === "android" ? false : fileActivity,
      });
      const reference = { id: result.id, code, deviceId };
      sessionStorage.setItem(storageKey, JSON.stringify(reference));
      setSaved(reference);
      setRecord(result);
      setPassword("");
      setConfirm("");
    } catch (error) {
      setPassword("");
      setConfirm("");
      setMessage(
        error instanceof Error && error.message === "invalid-credentials"
          ? "Check your existing username and password."
          : "Request was not confirmed. Check connection and request status before submitting again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="local-login-form">
      <h2>Request to join</h2>
      <p>
        A workspace administrator must approve your account and this computer. You will receive User
        access only.
      </p>
      {!saved ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            Request type
            <select
              value={mode}
              disabled={busy}
              onChange={(event) => setMode(event.target.value as "new" | "existing")}
            >
              <option value="new">Create my user account and register this computer</option>
              <option value="existing">Register another computer for my existing account</option>
            </select>
          </label>
          <label>
            Username
            <input
              autoComplete="username"
              required
              maxLength={64}
              value={username}
              disabled={busy}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          {mode === "new" ? (
            <label>
              Your name
              <input
                required
                maxLength={120}
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          ) : null}
          <label>
            {mode === "new" ? "Choose your password" : "Your current password"}
            <input
              type="password"
              autoComplete={mode === "new" ? "new-password" : "current-password"}
              required
              minLength={mode === "new" ? 8 : 1}
              maxLength={128}
              value={password}
              disabled={busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {mode === "new" ? (
            <label>
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                required
                maxLength={128}
                value={confirm}
                disabled={busy}
                onChange={(event) => setConfirm(event.target.value)}
              />
            </label>
          ) : null}
          <label>
            This device
            <select
              value={platform}
              disabled={busy}
              onChange={(event) => setPlatform(event.target.value as "win32" | "linux" | "android")}
            >
              <option value="unknown">Choose operating system</option>
              <option value="win32">Windows · x64</option>
              <option value="linux">Linux · x64</option>
              <option value="android">Android · ARM64 / x64</option>
            </select>
          </label>
          <small>
            Suggested from this browser. Change it if needed. Android supports system health;
            Windows/Linux downloads are x64. macOS is not included.
          </small>
          <label>
            <input
              type="checkbox"
              checked={platform !== "android" && fileActivity}
              disabled={busy || platform === "android"}
              onChange={(event) => setFileActivity(event.target.checked)}
            />{" "}
            Request file activity monitoring as well as basic system health
          </label>
          <button
            className="button primary"
            type="submit"
            disabled={busy || platform === "unknown"}
          >
            {busy ? "Submitting request…" : "Submit request to administrator"}
          </button>
        </form>
      ) : (
        <section>
          <p role="status">Request: {record?.status ?? "Checking status"}</p>
          <p>
            {record?.username} · {record ? connectorPlatform[record.platform].name : ""}
          </p>
          {record?.status === "pending" ? (
            <p>
              Waiting for manual administrator approval. Your account and this computer cannot log
              in yet. Keep this browser tab to receive your code.
            </p>
          ) : null}
          {record?.status === "approved" && saved ? (
            <>
              <h3>Approved · connect this computer</h3>
              <p>
                Pairing code:{" "}
                <strong>
                  {saved.code.slice(0, 4)}-{saved.code.slice(4)}
                </strong>
              </p>
              <small>
                One computer only. Valid until {new Date(record.approvedUntil!).toLocaleString()}.
                Do not share this code.
              </small>
              <p>
                <a
                  className="button primary"
                  href={addBasePath(connectorPlatform[record.platform].download)}
                >
                  Download {connectorPlatform[record.platform].name} installer
                </a>
              </p>
              <p>
                {record.platform === "android"
                  ? "Install and open the APK"
                  : "Extract the download and open its installer"}
                , then enter this approval code. DevSetu address: {location.origin}. No
                administrator password is needed.
              </p>
            </>
          ) : null}
          {record?.status === "paired" ? (
            <p>
              This computer is registered. Keep its connector running and return to sign in with
              your own username and password.
            </p>
          ) : null}
          {["expired", "rejected"].includes(record?.status ?? "") ? (
            <>
              <p>
                This request cannot be used. Submit a fresh request if needed; an existing account
                password is not reset.
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  sessionStorage.removeItem(storageKey);
                  setSaved(null);
                  setRecord(null);
                }}
              >
                Start another request
              </button>
            </>
          ) : null}
        </section>
      )}
      {message ? <p role="alert">{message}</p> : null}
      <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
        Back to sign in
      </button>
    </section>
  );
}
