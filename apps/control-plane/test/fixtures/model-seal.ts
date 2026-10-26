import {
  randomBytes,
  generateKeyPairSync,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  createCipheriv,
} from "node:crypto";
import { modelSecretContext, type ModelProposal, type ModelCommitInput } from "@frevos/contracts";
export function sealModelCredential(p: ModelProposal, value: string): ModelCommitInput {
  const base: ModelCommitInput = { version: 1, proposalId: p.id, digest: p.digest, approve: true };
  if (p.input.credential === "keep") return base;
  const pair = generateKeyPairSync("x25519"),
    publicKey = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b656e032100", "hex"),
        Buffer.from(p.publicKey, "hex"),
      ]),
      format: "der",
      type: "spki",
    });
  const shared = diffieHellman({ privateKey: pair.privateKey, publicKey }),
    aad = Buffer.from(modelSecretContext(p)),
    key = Buffer.from(hkdfSync("sha256", shared, Buffer.from(p.keyId, "hex"), aad, 32)),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({ apiKey: value })),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return {
    ...base,
    sealed: {
      keyId: p.keyId,
      publicKey: (pair.publicKey.export({ format: "der", type: "spki" }) as Buffer)
        .subarray(-32)
        .toString("hex"),
      iv: iv.toString("hex"),
      ciphertext: ciphertext.toString("hex"),
    },
  };
}
