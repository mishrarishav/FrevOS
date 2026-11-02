// A fixed HTTP transport for already-owned development services. No remote host,
// port, command, credential or filesystem path is accepted from the caller.
const http = require("node:http");
const blocked =
  /^(?:connection|keep-alive|proxy-.*|te|trailer|transfer-encoding|upgrade|host|content-length|forwarded|x-forwarded-.*|sec-.*|x-devsetu-.*)$/i;
async function forward(job, runtime) {
  try {
    if (
      !job ||
      job.version !== 1 ||
      !/^prv_[a-f0-9]{32}$/.test(job.id) ||
      !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(job.method) ||
      typeof job.path !== "string" ||
      !job.path.startsWith("/") ||
      job.path.startsWith("//") ||
      /[\0\r\n\\#]/.test(job.path) ||
      job.path.length > 8192 ||
      !Number.isInteger(job.timeoutMs) ||
      job.timeoutMs < 100 ||
      job.timeoutMs > 30000 ||
      !Number.isInteger(job.maxResponseBytes) ||
      job.maxResponseBytes < 1024 ||
      job.maxResponseBytes > 16777216 ||
      typeof job.body !== "string" ||
      job.body.length > 2796204 ||
      !Array.isArray(job.headers) ||
      job.headers.length > 100
    )
      throw Error();
    const target = await runtime.previewTarget(job);
    if (!Number.isInteger(target.port) || target.port < 1024 || target.port > 65535) throw Error();
    const localOrigin = "http://localhost:" + target.port;
    const publicOrigin = new URL(job.origin).origin;
    const headers = { host: "localhost:" + target.port, "accept-encoding": "identity" };
    for (const pair of job.headers) {
      if (
        !Array.isArray(pair) ||
        pair.length !== 2 ||
        typeof pair[0] !== "string" ||
        typeof pair[1] !== "string" ||
        !/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(pair[0]) ||
        /[\0\r\n]/.test(pair[1]) ||
        pair[1].length > 8192
      )
        throw Error();
      const key = pair[0].toLowerCase();
      if (blocked.test(key) || key === "accept-encoding") continue;
      let value = pair[1];
      if (key === "origin") {
        if (value !== publicOrigin) throw Error();
        value = localOrigin;
      }
      if (key === "referer") {
        const url = new URL(value);
        if (url.origin !== publicOrigin) continue;
        value = localOrigin + url.pathname + url.search;
      }
      headers[key] = value;
    }
    const body = Buffer.from(job.body, "base64");
    if (["GET", "HEAD"].includes(job.method) && body.length) throw Error();
    if (body.length) headers["content-length"] = String(body.length);
    return await new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve({ id: job.id, ...value });
        }
      };
      const request = http.request(
        {
          host: "127.0.0.1",
          port: target.port,
          path: job.path,
          method: job.method,
          headers,
          agent: false,
        },
        (response) => {
          const contentType = response.headers["content-type"] || "";
          if (String(contentType).toLowerCase().startsWith("text/event-stream")) {
            finish({ ok: false, error: "unsupported-stream" });
            response.destroy();
            return;
          }
          const parts = [];
          let length = 0;
          response.on("data", (part) => {
            length += part.length;
            if (length > job.maxResponseBytes) {
              finish({ ok: false, error: "response-too-large" });
              response.destroy();
            } else parts.push(part);
          });
          response.on("error", () => finish({ ok: false, error: "upstream-failed" }));
          response.on("aborted", () => finish({ ok: false, error: "upstream-failed" }));
          response.on("end", () => {
            try {
              const result = [];
              const nominated = new Set(
                String(response.headers.connection ?? "")
                  .toLowerCase()
                  .split(",")
                  .map((v) => v.trim()),
              );
              for (let i = 0; i < response.rawHeaders.length; i += 2) {
                const key = response.rawHeaders[i],
                  value = response.rawHeaders[i + 1];
                if (blocked.test(key) || nominated.has(key.toLowerCase())) continue;
                let output = value;
                if (key.toLowerCase() === "location") {
                  const url = new URL(value, localOrigin);
                  if (
                    url.origin === localOrigin ||
                    url.origin === "http://127.0.0.1:" + target.port
                  )
                    output = publicOrigin + url.pathname + url.search + url.hash;
                }
                result.push([key, output]);
              }
              if (result.length > 100) throw Error();
              finish({
                ok: true,
                status: response.statusCode,
                headers: result,
                body: Buffer.concat(parts).toString("base64"),
              });
            } catch {
              finish({ ok: false, error: "upstream-failed" });
            }
          });
        },
      );
      const timer = setTimeout(() => {
        finish({ ok: false, error: "upstream-failed" });
        request.destroy();
      }, job.timeoutMs);
      request.on("error", () => finish({ ok: false, error: "upstream-failed" }));
      request.end(body);
    });
  } catch {
    return { id: job?.id, ok: false, error: "target-unavailable" };
  }
}
function start(runtime, api) {
  let stopped = false;
  const run = (async () => {
    while (!stopped) {
      if (!runtime.planRecord?.plan.services.some((service) => service.preview)) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }
      try {
        const { jobs } = await api("/v1/connector/preview/claim", {});
        if (!Array.isArray(jobs) || jobs.length > 8) throw Error();
        await Promise.all(
          jobs.map(async (job) => {
            if (stopped) return;
            const result = await forward(job, runtime);
            // Lost completion is not replayed; in particular POST is never retried.
            if (!stopped) await api("/v1/connector/preview/complete", result);
          }),
        );
      } catch {
        if (!stopped) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  })();
  run.catch(() => {});
  return {
    stop: () => {
      stopped = true;
    },
  };
}
module.exports = { forward, start };
