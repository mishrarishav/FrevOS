import { gcm } from "@noble/ciphers/aes.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
  type LocalDevAction,
  LocalEnvChangesSchema,
  localEnvContext,
  type LocalEnvChange,
} from "@frevos/contracts";

// getRandomValues works on the existing internal HTTP pilot too. Never fall
// back to Math.random or put replacement values in session/local storage.
export function sealEnvironment(
  request: Omit<Extract<LocalDevAction, { operation: "environment-save" }>, "sealed">,
  editor: { keyId: string; publicKey: string },
  changes: LocalEnvChange[],
): Extract<LocalDevAction, { operation: "environment-save" }> {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(localEnvContext(request, editor.keyId));
  const shared = x25519.getSharedSecret(secret, hexToBytes(editor.publicKey));
  const key = hkdf(sha256, shared, hexToBytes(editor.keyId), aad, 32);
  const clear = new TextEncoder().encode(JSON.stringify(LocalEnvChangesSchema.parse(changes)));
  try {
    if (clear.length > 65536) throw Error("environment-capacity");
    return {
      ...request,
      sealed: {
        keyId: editor.keyId,
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
