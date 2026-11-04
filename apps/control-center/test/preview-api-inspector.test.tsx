import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PreviewApiResponse } from "../src/PreviewApiInspector.js";
import { createControlCenterApi } from "../src/api.js";

it("displays laptop HTML as escaped text with no executable elements or cookie forwarding", () => {
  const html = renderToStaticMarkup(
    <PreviewApiResponse
      result={{
        status: 200,
        contentType: "text/html",
        encoding: "utf8",
        bytes: 80,
        body: '<script>globalThis.compromised=true</script><img src=x onerror="alert(1)">',
      }}
    />,
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
  expect(html).toContain("HTTP 200");
});
it("uses the configured entry prefix, CSRF cookie and abort signal for one API inspection", async () => {
  vi.stubEnv("VITE_FREVOS_COOKIE_NAMESPACE", "workspace");
  try {
    const result = {
        status: 200,
        contentType: "application/json",
        encoding: "utf8",
        body: '{"ok":true}',
        bytes: 11,
      },
      fetcher = vi.fn(async () => Response.json(result)),
      controller = new AbortController();
    const api = createControlCenterApi(fetcher, "/workspace", () => "fixture-csrf");
    expect(
      await api.previewInspect!(
        "ws_fixture",
        { deviceId: "fc_" + "a".repeat(32), serviceId: "api", method: "GET", path: "/health" },
        controller.signal,
      ),
    ).toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/workspace/v1/workspaces/ws_fixture/local-development/preview/inspect",
      expect.objectContaining({
        method: "POST",
        signal: controller.signal,
        headers: expect.objectContaining({ "x-csrf-token": "fixture-csrf" }),
      }),
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
