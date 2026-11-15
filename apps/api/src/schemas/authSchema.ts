import { z } from "./z";
import { timeZone } from "./fields";

// Sign-up keeps its own 2-character name rule (NAME_MIN is 1 for people, bills and trips).
// `.min()` runs before `.trim()`, as it always has, so the same names pass as before.
const registerBody = z.object({
  name: z.string().min(2, "Name needs at least 2 characters").trim(),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password needs at least 8 characters"),
  // The signing-up device's own zone, so the very first month the user looks at is
  // already cut where they live. Optional because it is a convenience, not a
  // credential — a client that omits it gets the schema default and can change it
  // in Settings. Never overwritten on later logins: after this moment the stored
  // preference is the user's, and a trip abroad must not silently re-cut their
  // history (see utils/userZone).
  timeZone: timeZone.optional(),
});

// No length rule on the password here: a wrong password of any length is the same 401, so
// sign-in never reveals the password policy.
const loginBody = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

// Changing a password proves ownership with the current one rather than a token,
// because the caller is already authenticated — the check is against someone who
// picked up an unlocked phone, not against a stranger with the email address.
const changePasswordBody = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "Password needs at least 8 characters"),
});

export const registerSchemas = { body: registerBody };
export const loginSchemas = { body: loginBody };
export const changePasswordSchemas = { body: changePasswordBody };

export type RegisterInput = z.infer<typeof registerBody>;
export type LoginInput = z.infer<typeof loginBody>;
export type ChangePasswordInput = z.infer<typeof changePasswordBody>;
