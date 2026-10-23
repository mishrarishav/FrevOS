// Registered Node development recipe: bind HTTP/HMR listeners to this laptop.
// Outbound connections are limited to configured local services and the selected
// database. Local preview must not start customer email/integration traffic.
const net = require("node:net");
const original = net.Server.prototype.listen;
const connect = net.Socket.prototype.connect;
let endpoints;
try {
  endpoints = JSON.parse(process.env.DEVSETU_LOCAL_EGRESS || "[]");
} catch {
  endpoints = [];
}
net.Socket.prototype.connect = function (...arguments_) {
  const first = Array.isArray(arguments_[0]) ? arguments_[0][0] : arguments_[0];
  const options =
    first && typeof first === "object"
      ? first
      : { port: first, host: typeof arguments_[1] === "string" ? arguments_[1] : "localhost" };
  const host = String(options.host || "localhost")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  const port = Number(options.port);
  const local = (value) => ["localhost", "127.0.0.1", "::1"].includes(value);
  if (
    options.path ||
    !endpoints.some(
      (endpoint) =>
        Number(endpoint.port) === port &&
        (String(endpoint.host).toLowerCase() === host ||
          (local(host) && local(String(endpoint.host).toLowerCase()))),
    )
  )
    throw Object.assign(Error("Local preview external connection blocked"), {
      code: "DEVSETU_LOCAL_NETWORK_DENIED",
    });
  return connect.apply(this, arguments_);
};
net.Server.prototype.listen = function (...arguments_) {
  if (arguments_[0] && typeof arguments_[0] === "object") {
    if (arguments_[0].path) throw Error("Development listeners must use loopback TCP");
    arguments_[0] = { ...arguments_[0], host: "127.0.0.1" };
  } else {
    const port = arguments_[0];
    if (!Number.isInteger(Number(port))) throw Error("Development listeners must use loopback TCP");
    if (typeof arguments_[1] === "string") arguments_[1] = "127.0.0.1";
    else arguments_.splice(1, 0, "127.0.0.1");
  }
  return original.apply(this, arguments_);
};
