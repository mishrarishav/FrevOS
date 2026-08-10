import { z } from "zod";
import { IdentityIdSchema, SessionIdSchema, UserIdSchema } from "./identifiers.js";

export const IsoTimestampSchema = z.iso.datetime({ offset: true }).brand<"IsoTimestamp">();
export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;

export const IdentityIssuerSchema = z
  .url()
  .max(2048)
  .superRefine((value, context) => {
    const authorityStart = value.indexOf("://") + 3;
    const pathStart = value.indexOf("/", authorityStart);
    const authority = value.slice(authorityStart, pathStart === -1 ? value.length : pathStart);

    if (!value.toLowerCase().startsWith("https://")) {
      context.addIssue({
        code: "custom",
        message: "Identity issuer must use HTTPS",
      });
    }

    if (authority.includes("@")) {
      context.addIssue({
        code: "custom",
        message: "Identity issuer must not contain user information",
      });
    }

    if (value.includes("?") || value.includes("#")) {
      context.addIssue({
        code: "custom",
        message: "Identity issuer must not contain a query or fragment",
      });
    }
  })
  .brand<"IdentityIssuer">();
export type IdentityIssuer = z.infer<typeof IdentityIssuerSchema>;

export const IdentitySubjectSchema = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      Array.from(value).every((character) => {
        const codeUnit = character.charCodeAt(0);
        return codeUnit > 0x1f && codeUnit !== 0x7f;
      }),
    "Identity subject must not contain control characters",
  )
  .brand<"IdentitySubject">();
export type IdentitySubject = z.infer<typeof IdentitySubjectSchema>;

export const ExternalIdentitySchema = z
  .object({
    identityId: IdentityIdSchema,
    userId: UserIdSchema,
    issuer: IdentityIssuerSchema,
    subject: IdentitySubjectSchema,
    linkedAt: IsoTimestampSchema,
    lastAuthenticatedAt: IsoTimestampSchema,
  })
  .strict()
  .refine((identity) => Date.parse(identity.lastAuthenticatedAt) >= Date.parse(identity.linkedAt), {
    message: "Last authentication cannot precede identity linkage",
    path: ["lastAuthenticatedAt"],
  });
export type ExternalIdentity = z.infer<typeof ExternalIdentitySchema>;

export const SessionStatusSchema = z.enum(["active", "revoked"]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionContextSchema = z
  .object({
    sessionId: SessionIdSchema,
    userId: UserIdSchema,
    identityId: IdentityIdSchema,
    status: SessionStatusSchema,
    authenticatedAt: IsoTimestampSchema,
    expiresAt: IsoTimestampSchema,
  })
  .strict()
  .refine((session) => Date.parse(session.expiresAt) > Date.parse(session.authenticatedAt), {
    message: "Session expiration must be after authentication",
    path: ["expiresAt"],
  });
export type SessionContext = z.infer<typeof SessionContextSchema>;
