"use strict";
const http = require("node:http"),
  os = require("node:os");
function start(config) {
  if (
    !config ||
    Object.keys(config).sort().join() !== "expiresAt,instance,name,port" ||
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
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
    );
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
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxConnections = 16;
  const timer = setTimeout(
    () => server.close(),
    Math.max(1, Date.parse(config.expiresAt) - Date.now()),
  );
  timer.unref();
  server.on("close", () => clearTimeout(timer));
  server.listen(config.port, "127.0.0.1");
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
module.exports = { start };
