import { gcm } from "@noble/ciphers/aes.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { modelSecretContext, type ModelProposal, type ModelCommitInput } from "@frevos/contracts";
export function sealModelCredential(proposal: ModelProposal, apiKey: string): ModelCommitInput {
  const result: ModelCommitInput = {
    version: 1,
    proposalId: proposal.id,
    digest: proposal.digest,
    approve: true,
  };
  if (proposal.input.credential === "keep") return result;
  if (!/^[\x21-\x7e]{8,2048}$/.test(apiKey)) throw Error("Credential is invalid");
  const secret = crypto.getRandomValues(new Uint8Array(32)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(modelSecretContext(proposal)),
    shared = x25519.getSharedSecret(secret, hexToBytes(proposal.publicKey));
  const key = hkdf(sha256, shared, hexToBytes(proposal.keyId), aad, 32),
    clear = new TextEncoder().encode(JSON.stringify({ apiKey }));
  try {
    return {
      ...result,
      sealed: {
        keyId: proposal.keyId,
        publicKey: bytesToHex(x25519.getPublicKey(secret)),
        iv: bytesToHex(iv),
        ciphertext: bytesToHex(gcm(key, iv, aad).encrypt(clear)),
      },
    };
  } finally {
    secret.fill(0);
    shared.fill(0);
    key.fill(0);
    clear.fill(0);
  }
}
