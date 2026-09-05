import { z } from "zod";
import { isValidZone } from "../utils/timezone";

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  email: z.string().email("Invalid Email"),
  password: z.string().min(8, 'Password must be atleast 8 characters'),
  // The signing-up device's own zone, so the very first month the user looks at is
  // already cut where they live. Optional because it is a convenience, not a
  // credential — a client that omits it gets the schema default and can change it
  // in Settings. Never overwritten on later logins: after this moment the stored
  // preference is the user's, and a trip abroad must not silently re-cut their
  // history (see utils/userZone).
  timeZone: z.string().refine(isValidZone, "Not a recognised time zone").optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid Email"),
  password: z.string().min(8, 'Password must be atleast 8 characters')
})

// Changing a password proves ownership with the current one rather than a token,
// because the caller is already authenticated — the check is against someone who
// picked up an unlocked phone, not against a stranger with the email address.
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "Password must be atleast 8 characters"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;