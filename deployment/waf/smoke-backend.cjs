"use strict";
// Disposable, synthetic upstream for the local WAF transport test. It has no
// DevSetu credentials, enrollment, database, filesystem writes or OS controls.
const http = require("node:http"),
  crypto = require("node:crypto");
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex"),
  zip = Buffer.from("504b0506000000000000000000000000000000000000", "hex");
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://smoke.invalid");
  if (!url.pathname.startsWith("/devsetu/")) {
    response.writeHead(404).end();
    return;
  }
  if (url.pathname === "/devsetu/denied") {
    response.writeHead(401, { "cache-control": "no-store" }).end("unauthorized");
    return;
  }
  if (url.pathname === "/devsetu/download.zip") {
    response.writeHead(200, {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="smoke.zip"',
      "content-length": zip.length,
    });
    response.end(zip);
    return;
  }
  if (url.pathname === "/devsetu/sse") {
    response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    response.write("data: first\n\n");
    setTimeout(() => response.end("data: second\n\n"), 25);
    return;
  }
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 536870912) throw Error("capacity");
      hash.update(chunk);
    }
  } catch {
    response.writeHead(413).end();
    return;
  }
  const headers = { "content-type": "application/json", "cache-control": "no-store" };
  if (url.pathname === "/devsetu/login") {
    headers["set-cookie"] = "DevSetuSmokeSession=fake; Path=/devsetu; HttpOnly; SameSite=Lax";
  }
  response.writeHead(200, headers);
  response.end(
    JSON.stringify({
      path: url.pathname,
      method: request.method,
      bytes,
      sha256: hash.digest("hex"),
      origin: request.headers.origin || "",
      host: request.headers.host || "",
      cookieSha256: digest(request.headers.cookie || ""),
      authorizationSha256: digest(request.headers.authorization || ""),
      forwardedFor: request.headers["x-forwarded-for"] || "",
    }),
  );
});
server.on("upgrade", (request, socket, head) => {
  if (request.url !== "/devsetu/ws" || head.length || !request.headers["sec-websocket-key"]) {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write(
    `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  let pending = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    if (pending.length > 1024) return socket.destroy();
    if (pending.length < 2) return;
    const length = pending[1] & 127;
    if ((pending[0] & 15) === 8) return socket.end(Buffer.from([136, 0]));
    if (length >= 126 || !(pending[1] & 128)) return socket.destroy();
    if (pending.length < length + 6) return;
    const mask = pending.subarray(2, 6),
      payload = Buffer.from(pending.subarray(6, length + 6));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    socket.write(Buffer.concat([Buffer.from([129, payload.length]), payload]));
    pending = pending.subarray(length + 6);
  });
  socket.on("error", () => {});
});
server.listen(8080, "0.0.0.0");
