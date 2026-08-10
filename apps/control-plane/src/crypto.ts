import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";

const OidcTransactionSchema = z
  .object({
    state: z.string().min(32).max(256),
    nonce: z.string().min(32).max(256),
    codeVerifier: z.string().min(43).max(128),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type OidcTransaction = z.infer<typeof OidcTransactionSchema>;

const TOKEN_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const TRANSACTION_VERSION = "v1";

export function randomOpaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

export function randomIdentifier(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString("hex")}`;
}

export function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function hashesMatch(rawValue: string, expectedHash: Uint8Array): boolean {
  const actualHash = sha256(rawValue);
  const expected = Buffer.from(expectedHash);
  return actualHash.length === expected.length && timingSafeEqual(actualHash, expected);
}

export function decodeEncryptionKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) {
    throw new Error("OIDC transaction encryption key must decode to exactly 32 bytes");
  }
  return key;
}

export class OidcTransactionCodec {
  readonly #key: Buffer;
  readonly #maxAgeMs: number;

  constructor(key: Uint8Array, maxAgeMs = 10 * 60 * 1000) {
    if (key.length !== 32) {
      throw new Error("OIDC transaction encryption key must contain exactly 32 bytes");
    }
    this.#key = Buffer.from(key);
    this.#maxAgeMs = maxAgeMs;
  }

  seal(transaction: OidcTransaction): string {
    const parsed = OidcTransactionSchema.parse(transaction);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(TRANSACTION_VERSION));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(parsed), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      TRANSACTION_VERSION,
      iv.toString("base64url"),
      ciphertext.toString("base64url"),
      tag.toString("base64url"),
    ].join(".");
  }

  open(value: string, now = new Date()): OidcTransaction {
    const [version, encodedIv, encodedCiphertext, encodedTag, unexpected] = value.split(".");
    if (
      version !== TRANSACTION_VERSION ||
      encodedIv === undefined ||
      encodedCiphertext === undefined ||
      encodedTag === undefined ||
      unexpected !== undefined
    ) {
      throw new Error("OIDC transaction cookie has an invalid format");
    }

    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new Error("OIDC transaction cookie has an invalid format");
    }

    try {
      const decipher = createDecipheriv("aes-256-gcm", this.#key, iv);
      decipher.setAAD(Buffer.from(TRANSACTION_VERSION));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, "base64url")),
        decipher.final(),
      ]).toString("utf8");
      const transaction = OidcTransactionSchema.parse(JSON.parse(plaintext));
      const ageMs = now.getTime() - Date.parse(transaction.createdAt);
      if (ageMs < 0 || ageMs > this.#maxAgeMs) {
        throw new Error("OIDC transaction cookie has expired");
      }
      return transaction;
    } catch (error) {
      if (error instanceof Error && error.message === "OIDC transaction cookie has expired") {
        throw error;
      }
      throw new Error("OIDC transaction cookie could not be authenticated");
    }
  }
}
