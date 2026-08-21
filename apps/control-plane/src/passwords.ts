import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const LocalUsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/);

export const NewLocalPasswordSchema = z.string().min(8).max(128);

const LoginPasswordSchema = z.string().min(1).max(128);
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const DUMMY_SALT = Buffer.from("9f67054bc14d4f91a0c569974676bf51", "hex");

export interface PasswordDigest {
  readonly salt: Buffer;
  readonly hash: Buffer;
}

function derive(password: string, salt: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashLocalPassword(password: string): Promise<PasswordDigest> {
  const parsed = NewLocalPasswordSchema.parse(password);
  const salt = randomBytes(16);
  return { salt, hash: await derive(parsed, salt) };
}

export async function verifyLocalPassword(
  password: string,
  salt: Uint8Array,
  expectedHash: Uint8Array,
): Promise<boolean> {
  const parsed = LoginPasswordSchema.safeParse(password);
  const candidate = await derive(parsed.success ? parsed.data : "invalid-local-password", salt);
  const expected = Buffer.from(expectedHash);
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

export async function consumeDummyPasswordCheck(password: string): Promise<void> {
  await derive(
    LoginPasswordSchema.safeParse(password).success ? password : "invalid-local-password",
    DUMMY_SALT,
  );
}
