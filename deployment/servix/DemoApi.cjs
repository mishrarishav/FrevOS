"use strict";
const http = require("node:http"),
  os = require("node:os"),
  protocol = require("./SoftwareProtocol.cjs");
function requestAllowed(req, config) {
  const local = String(req.socket.localAddress).replace(/^::ffff:/, ""),
    remote = String(req.socket.remoteAddress).replace(/^::ffff:/, ""),
    authority = String(req.headers.host ?? "").toLowerCase();
  const privateSocket = config.listen && local === config.listen.address;
  if (privateSocket) {
    if (
      authority !== config.listen.address + ":" + config.port ||
      (remote !== config.listen.address && !config.listen.allowedClients.includes(remote))
    )
      return false;
  } else if (
    local !== "127.0.0.1" ||
    remote !== "127.0.0.1" ||
    !["localhost:" + config.port, "127.0.0.1:" + config.port].includes(authority)
  )
    return false;
  return (
    req.method !== "POST" || !req.headers.origin || req.headers.origin === "http://" + authority
  );
}
function start(config) {
  if (
    !config ||
    Object.keys(config).sort().join() !==
      (config.listen === undefined
        ? "expiresAt,instance,name,port"
        : "expiresAt,instance,listen,name,port") ||
    (config.listen !== undefined &&
      (!protocol.validListen(config.listen) ||
        !protocol
          .privateInterfaces(os.networkInterfaces())
          .some((row) => row.address === config.listen.address))) ||
    !/^sw_[a-f0-9]{32}$/.test(config.instance) ||
    typeof config.name !== "string" ||
    config.name.length > 180 ||
    [...config.name].some((c) => c.charCodeAt(0) < 32) ||
    !Number.isInteger(config.port) ||
    config.port < 1024 ||
    config.port > 65535 ||
    !Number.isFinite(Date.parse(config.expiresAt)) ||
    Date.parse(config.expiresAt) <= Date.now() ||
    Date.parse(config.expiresAt) > Date.now() + 1800000
  )
    throw Error("demo-config-denied");
  const handle = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
    );
    if (!requestAllowed(req, config)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "demo-network-denied" }));
      return;
    }
    if (req.url === "/" && req.method === "GET") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        '<!doctype html><meta charset="utf-8"><title>DevSetu private demo API</title><style>body{font:18px system-ui;max-width:800px;margin:50px auto;padding:20px;background:#101820;color:#e7f6fa}button{padding:12px}pre{white-space:pre-wrap;word-break:break-word}</style><h1>DevSetu private demo API</h1><p>This temporary API runs on the paired source computer.</p><button id="test">Test POST request and response</button><pre id="result">Loading source…</pre><script>async function call(method){const r=await fetch("/api/echo",{method,headers:{"content-type":"application/json"},...(method==="POST"?{body:JSON.stringify({nonce:"demo-"+Date.now()+"-"+Math.random().toString(16).slice(2)})}:{})});document.getElementById("result").textContent=JSON.stringify(await r.json(),null,2)}document.getElementById("test").onclick=()=>call("POST");call("GET")</script>',
      );
      return;
    }
    if (!["/health", "/api/echo"].includes(req.url) || !["GET", "POST"].includes(req.method)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const chunks = [];
    let bytes = 0;
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 65536) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(chunk);
      }
    } catch {
      res.destroy();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        status: "ok",
        instance: config.instance,
        machine: os.hostname(),
        service: config.name,
        method: req.method,
        received: Buffer.concat(chunks).toString("utf8"),
      }),
    );
  };
  const server = http.createServer(handle),
    network = config.listen ? http.createServer(handle) : undefined;
  for (const listener of [server, network].filter(Boolean)) {
    listener.requestTimeout = 15000;
    listener.headersTimeout = 10000;
    listener.maxConnections = 16;
  }
  let closing = false;
  const close = server.close.bind(server);
  server.close = (callback) => {
    closing = true;
    if (network?.listening) network.close();
    return close(callback);
  };
  const timer = setTimeout(
    () => server.close(),
    Math.max(1, Date.parse(config.expiresAt) - Date.now()),
  );
  timer.unref();
  server.on("close", () => {
    clearTimeout(timer);
    if (network?.listening) network.close();
  });
  server.once("error", () => {
    if (network?.listening) network.close();
  });
  if (network) {
    network.once("error", (error) => {
      server.emit("error", error);
    });
    network.once("listening", () => {
      if (closing) network.close();
      else server.listen(config.port, "127.0.0.1");
    });
    network.listen(config.port, config.listen.address);
  } else server.listen(config.port, "127.0.0.1");
  return server;
}
if (require.main === module) {
  let server;
  process.once("message", (config) => {
    try {
      server = start(config);
      server.on("close", () => process.exit(0));
      server.once("listening", () => process.send?.({ ready: true }));
      server.once("error", () => process.exit(1));
    } catch {
      process.exit(1);
    }
  });
  process.on("message", (message) => {
    if (message?.operation === "stop") server?.close(() => process.exit(0));
  });
  process.on("disconnect", () => {
    server?.close();
    process.exit(0);
  });
  setTimeout(() => {
    if (!server) process.exit(1);
  }, 10000).unref();
}
module.exports = { start, requestAllowed };
