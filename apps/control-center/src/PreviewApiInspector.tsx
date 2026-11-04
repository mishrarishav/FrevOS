import { useEffect, useRef, useState } from "react";
import type { PreviewInspect, PreviewInspectResult } from "@frevos/contracts";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { WorkspaceDialog } from "./WorkspaceDialog.js";
import "./PreviewApiInspector.css";

export function PreviewApiResponse({ result }: { result: PreviewInspectResult }) {
  return (
    <section aria-label="API response">
      <h3>Response · HTTP {result.status}</h3>
      <p>
        {result.contentType} · {result.bytes.toLocaleString()} bytes
        {result.encoding === "base64" ? " · Binary content shown as Base64" : ""}
      </p>
      <pre>{result.body}</pre>
    </section>
  );
}

export function PreviewApiInspector({
  api,
  workspaceId,
  deviceId,
  serviceId,
}: {
  api: ControlCenterApi;
  workspaceId: string;
  deviceId: string;
  serviceId: string;
}) {
  const [opened, setOpened] = useState(false),
    [method, setMethod] = useState<PreviewInspect["method"]>("GET"),
    [path, setPath] = useState("/"),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [result, setResult] = useState<PreviewInspectResult | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const close = () => {
    active.current?.abort();
    setOpened(false);
  };
  const send = async () => {
    if (!api.previewInspect || busy) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setNotice("");
    setResult(null);
    try {
      const response = await api.previewInspect(
        workspaceId,
        {
          deviceId,
          serviceId,
          method,
          path,
          body: ["GET", "HEAD"].includes(method) ? "" : body,
          contentType: "application/json",
        },
        controller.signal,
      );
      if (!controller.signal.aborted) setResult(response);
    } catch (error) {
      setNotice(
        controller.signal.aborted
          ? "Request cancelled. A request already received by the application may have completed."
          : error instanceof ApiFailure && error.responseStatus === 503
            ? "Check that the connected computer is online, this service is running and its API access is configured."
            : error instanceof ApiFailure && error.responseStatus === 403
              ? "You do not have access to this connected service."
              : "No response received. Check the connection and running service. This request was not retried.",
      );
    } finally {
      if (active.current === controller) active.current = null;
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className="button secondary"
        disabled={!api.previewInspect}
        onClick={() => setOpened(true)}
      >
        API request / response
      </button>
      {opened ? (
        <WorkspaceDialog label="Connected service API" onClose={close}>
          <section className="preview-api-inspector">
            <header>
              <div>
                <h2>Connected service API</h2>
                <p>{serviceId} · Request runs on its paired computer.</p>
              </div>
              <button type="button" className="button secondary" onClick={close}>
                Close
              </button>
            </header>
            <p>
              Send a request through DevSetu. The response is displayed as text or JSON. HTML and
              scripts are never executed here.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              <div className="preview-api-address">
                <label>
                  Method
                  <select
                    value={method}
                    disabled={busy}
                    onChange={(event) => setMethod(event.target.value as PreviewInspect["method"])}
                  >
                    {["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Service path
                  <input
                    value={path}
                    disabled={busy}
                    required
                    maxLength={8192}
                    placeholder="/api/health"
                    onChange={(event) => setPath(event.target.value)}
                  />
                </label>
              </div>
              <label>
                JSON request body
                <textarea
                  value={body}
                  disabled={busy || ["GET", "HEAD"].includes(method)}
                  maxLength={65536}
                  rows={5}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
              <div className="preview-api-actions">
                <button type="submit" className="button primary" disabled={busy}>
                  {busy ? "Waiting for paired computer…" : "Send once"}
                </button>
                {busy ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => active.current?.abort()}
                  >
                    Cancel request
                  </button>
                ) : null}
              </div>
            </form>
            {notice ? <p role="status">{notice}</p> : null}
            {result ? <PreviewApiResponse result={result} /> : null}
            <p className="preview-api-note">
              This only reaches the selected, configured service. Requests are bounded and sent
              once; closing this window does not undo application changes.
            </p>
          </section>
        </WorkspaceDialog>
      ) : null}
    </>
  );
}
