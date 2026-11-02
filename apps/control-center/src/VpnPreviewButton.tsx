import { useState } from "react";
import { ApiFailure, type ControlCenterApi } from "./api.js";
import { deploymentRequestId } from "./deployment-request-id.js";

export function VpnPreviewButton({
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
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const open = async () => {
    if (!api.previewOpen) return;
    const name = "devsetu-preview-" + deploymentRequestId("ld"),
      tab = window.open("about:blank", name);
    if (!tab) {
      setNotice("Allow the preview tab, then try again.");
      return;
    }
    tab.opener = null;
    setBusy(true);
    setNotice("");
    try {
      const result = await api.previewOpen(workspaceId, { deviceId, serviceId });
      const action = new URL(result.action);
      if (action.hostname === location.hostname) throw Error();
      const form = document.createElement("form"),
        field = document.createElement("input");
      form.method = "POST";
      form.action = action.href;
      form.target = name;
      form.hidden = true;
      field.type = "hidden";
      field.name = "ticket";
      field.value = result.ticket;
      form.append(field);
      document.body.append(form);
      form.submit();
      form.remove();
      setNotice(
        "VPN preview opened. Close its access here when finished; it also expires automatically.",
      );
    } catch (error) {
      tab.close();
      setNotice(
        error instanceof ApiFailure && error.responseStatus === 503
          ? "Check the connector and running service. Ask your administrator to verify its private preview address."
          : error instanceof ApiFailure && error.responseStatus === 409
            ? "Preview access is already open. Close it here before opening a new session."
            : "Preview could not open. Check the connector update, running service and VPN connection.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => void open()}
      >
        Open VPN preview
      </button>
      {api.previewClose ? (
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.previewClose!(workspaceId, { deviceId, serviceId });
              setNotice("VPN preview access closed.");
            } catch {
              setNotice("Preview access could not be closed. Retry while connected.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Close VPN preview
        </button>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}
