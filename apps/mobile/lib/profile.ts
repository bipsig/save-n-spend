import type { IUser, IUserPrefs, INotificationPrefs } from "@save-n-spend/types";
import { del, patch, post } from "@/lib/api";
import { deviceZone } from "@/lib/zone";
import { useSession } from "@/store/session";
import { usePendingDeletes } from "@/store/pendingDeletes";
import { detachPush } from "@/lib/push";

// The account-level half of Settings. Every write returns the whole updated user,
// which goes straight back into the session store — so a preference changed here
// is immediately visible to `useDefaultAccount()` and anything else reading
// `session.user`, without a refetch.

type ProfilePatch = { name?: string };

// Only the leaves Settings can change. `defaultAccount` is nullable because
// "no default" is a real state; the server validates that the id is the user's.
type PrefsPatch = {
  defaultAccount?: string | null;
  timeZone?: string;
  notifications?: Partial<INotificationPrefs>;
};

const applyUser = (user: IUser): IUser => {
  useSession.getState().setUser(user);
  return user;
};

export const updateProfile = async (body: ProfilePatch): Promise<IUser> =>
  applyUser(await patch<IUser>("/users/me", body));

export const updatePrefs = async (prefs: PrefsPatch): Promise<IUser> =>
  applyUser(await patch<IUser>("/users/me", { prefs }));

// Since 2.8.6 a password change ends every other login and answers with a fresh token for
// this phone, kept like a sign-in's. An older API answers null; the current token stays.
export const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
  const data = await post<{ accessToken?: string } | null>("/auth/change-password", { currentPassword, newPassword });
  if (data?.accessToken) await useSession.getState().signIn(data.accessToken);
};

/**
 * The one way out (gaps row 105), for More, Settings and account deletion, in this order while
 * the token still works: send any delete still in its undo window (a confirmed delete must not
 * quietly come back), detach push (a token left on the account keeps pushing this user's
 * reminders to whoever signs in next), deactivate when deleting, then sign out. A failed
 * flush or detach never blocks the sign-out; a failed deactivation does, so the sheet says so.
 *
 * Deleting deactivates rather than erases: signing in again with the same credentials
 * restores everything (see `userController.deleteMe` on the API).
 */
export const logOut = async ({ deleteAccount = false }: { deleteAccount?: boolean } = {}): Promise<void> => {
  await usePendingDeletes.getState().flushAll().catch(() => {});
  await detachPush().catch(() => {});
  if (deleteAccount) await del<null>("/users/me");
  await useSession.getState().signOut();
};

export const deleteAccount = (): Promise<void> => logOut({ deleteAccount: true });

// The prefs a screen can rely on before the user document has loaded. `timeZone`
// comes off the device rather than repeating the schema's Asia/Kolkata: for the one
// frame before the user arrives, the phone's own zone is the better guess, and it's
// also what a brand-new account is registered with.
export const FALLBACK_PREFS: IUserPrefs = {
  defaultAccount: null,
  timeZone: deviceZone(),
  notifications: {
    enabled: true,
    billReminderLead: 3,
    budgetAlerts: true,
    goalMilestones: true,
    // Mirrors the schema defaults on the server (models/User.ts): the two frequent
    // digests are opt-in, the monthly one is not. A mismatch here would show the wrong
    // switch position for the one frame before the user document lands.
    dailySummary: false,
    weeklySummary: false,
    monthlySummary: true,
    investmentReminder: false,
    investmentReminderDay: 1,
  },
};

// Up to two initials from a display name, e.g. "Sagnik Das" -> "SD". Tolerates an
// empty name (the brief frame during logout, before the gate swaps to Login).
export const initialsOf = (name?: string): string =>
  (name ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
