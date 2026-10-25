import {
  generateKeyPairSync,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  createDecipheriv,
} from "node:crypto";
import { expect, it } from "vitest";
import { ModelProposalSchema, modelSecretContext } from "@frevos/contracts";
import { sealModelCredential } from "../src/model-seal.js";
it("interoperates with Node's independent X25519/AES-GCM boundary, binds scope and keeps credentials out of request metadata", () => {
  const pair = generateKeyPairSync("x25519"),
    p = ModelProposalSchema.parse({
      version: 1,
      id: "mp_" + "a".repeat(32),
      actor: "usr_fixture",
      workspaceId: "ws_fixture",
      target: "mc_" + "b".repeat(32),
      digest: "c".repeat(64),
      expiresAt: "2026-10-26T00:05:00Z",
      keyId: "d".repeat(64),
      publicKey: (pair.publicKey.export({ format: "der", type: "spki" }) as Buffer)
        .subarray(-32)
        .toString("hex"),
      input: {
        version: 1,
        expectedRevision: 0,
        name: "Fixture",
        endpoint: "https://model.example/chat",
        model: "",
        protocol: "chat-completions",
        authentication: "bearer",
        allowWorkspaceSummary: false,
        credential: "replace",
      },
    });
  const value = "SYNTHETIC_BROWSER_KEY",
    request = sealModelCredential(p, value),
    s = request.sealed!;
  expect(JSON.stringify(request)).not.toContain(value);
  const pub = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b656e032100", "hex"),
        Buffer.from(s.publicKey, "hex"),
      ]),
      format: "der",
      type: "spki",
    }),
    shared = diffieHellman({ privateKey: pair.privateKey, publicKey: pub }),
    aad = Buffer.from(modelSecretContext(p)),
    key = Buffer.from(hkdfSync("sha256", shared, Buffer.from(p.keyId, "hex"), aad, 32));
  const bytes = Buffer.from(s.ciphertext, "hex"),
    cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(s.iv, "hex"));
  cipher.setAAD(aad);
  cipher.setAuthTag(bytes.subarray(-16));
  expect(
    JSON.parse(Buffer.concat([cipher.update(bytes.subarray(0, -16)), cipher.final()]).toString()),
  ).toEqual({ apiKey: value });
  expect(
    sealModelCredential({ ...p, input: { ...p.input, credential: "keep" } }, ""),
  ).not.toHaveProperty("sealed");
  expect(() => sealModelCredential(p, "bad\nkey")).toThrow();
});
