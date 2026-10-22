import { UserPlus } from "lucide-react";
import { useState } from "react";
import type { ControlCenterApi } from "./api.js";

export function DeveloperAccess({
  api,
  workspaceId,
}: {
  api: ControlCenterApi;
  workspaceId: string;
}) {
  const [open, setOpen] = useState(false),
    [username, setUsername] = useState(""),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <section className="settings-developer-access">
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          setOpen(!open);
          setCode("");
          setNotice("");
        }}
      >
        <UserPlus size={15} />
        {open ? "Close invitation" : "Add developer"}
      </button>
      {open ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setNotice("");
            void api
              .inviteDeveloper?.(workspaceId, username, name)
              .then((result) => setCode(result.code))
              .catch(() => setNotice("Invitation could not be created."))
              .finally(() => setBusy(false));
          }}
        >
          <p>
            Create an invitation code for a developer. They choose their password during connector
            setup.
          </p>
          <label>
            Developer username
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[a-z0-9][a-z0-9._-]{2,63}"
              autoComplete="off"
            />
          </label>
          <label>
            Developer name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </label>
          <button type="submit" className="button secondary" disabled={busy}>
            Create invitation
          </button>
          {code ? (
            <p>
              Expires in 24 hours. <code>{code}</code>{" "}
              <button type="button" className="button ghost" onClick={() => setCode("")}>
                Hide code
              </button>
            </p>
          ) : null}
          {notice ? <p role="status">{notice}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
