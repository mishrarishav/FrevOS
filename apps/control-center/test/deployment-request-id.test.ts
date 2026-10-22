import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { deploymentRequestId } from "../src/deployment-request-id.js";
afterEach(() => vi.unstubAllGlobals());
it("creates unpredictable request IDs with the crypto method available on internal HTTP", () => {
  const httpCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  expect(httpCrypto).not.toHaveProperty("randomUUID");
  vi.stubGlobal("crypto", httpCrypto);
  const first = deploymentRequestId();
  expect(first).toMatch(/^sd_[a-f0-9]{32}$/);
  expect(deploymentRequestId()).not.toBe(first);
  expect(deploymentRequestId()).toMatch(/^sd_[a-f0-9]{32}$/);
  expect(deploymentRequestId("pr")).toMatch(/^pr_[a-f0-9]{32}$/);
});
