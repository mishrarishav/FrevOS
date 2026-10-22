export function deploymentRequestId(prefix: "sd" | "pr" = "sd") {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}_${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}
