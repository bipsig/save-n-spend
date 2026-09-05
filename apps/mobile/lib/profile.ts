import type { IUser, IUserPrefs, INotificationPrefs } from "@save-n-spend/types";
import { del, patch, post } from "@/lib/api";
import { deviceZone } from "@/lib/zone";
import { useSession } from "@/store/session";

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

export const changePassword = (currentPassword: string, newPassword: string): Promise<null> =>
  post<null>("/auth/change-password", { currentPassword, newPassword });

// Irreversible on the server: it deletes the user and every transaction, budget,
// bill, goal, account, and category they own. Signing out afterwards is what
// returns the app to the login screen — the token it held is now for a user that
// no longer exists.
export const deleteAccount = async (): Promise<void> => {
  await del<null>("/users/me");
  await useSession.getState().signOut();
};

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
    weeklySummary: false,
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
