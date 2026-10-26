import { z } from "zod";
import { UserIdSchema } from "./identifiers.js";
import { IsoTimestampSchema } from "./identity.js";

export const LocalAccountSchema = z
  .object({
    userId: UserIdSchema,
    username: z.string().min(3).max(64),
    displayName: z.string().nullable(),
    status: z.enum(["active", "disabled"]),
    passwordChangedAt: IsoTimestampSchema,
    lastAuthenticatedAt: IsoTimestampSchema.nullable(),
  })
  .strict();
export type LocalAccount = z.infer<typeof LocalAccountSchema>;
export const LocalAccountsSchema = z.array(LocalAccountSchema).max(1000);
export const AccountProfileSchema = z
  .object({
    account: LocalAccountSchema.nullable(),
    canManageUsers: z.boolean(),
  })
  .strict();
export type AccountProfile = z.infer<typeof AccountProfileSchema>;
export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
  })
  .strict();
export const PasswordChangedSchema = z.object({ changed: z.literal(true) }).strict();
