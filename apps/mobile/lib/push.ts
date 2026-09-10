import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import type { NotificationLink } from "@save-n-spend/types";
import { patch } from "@/lib/api";
import { routeFor } from "@/lib/notifications";
import { useNotifications } from "@/store/notifications";

// The device half of notifications: permission, the token the server pushes to, and what
// happens when one arrives or is tapped.
//
// Everything here degrades to nothing — a simulator can't get a token, a user can refuse
// permission, the project may not be linked to EAS. In all three the bell still shows
// everything the server has sent.

/**
 * Foreground behaviour: shown rather than swallowed, since these alerts are about money
 * moving. The badge is set from the unread count instead, which stays true after the user
 * reads something in-app.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// The server sends every push on this channel id (see the API's pushService). Android
// needs it to exist before the first notification, or the OS files it under a channel the
// user can't tune.
const ensureAndroidChannel = async (): Promise<void> => {
  await Notifications.setNotificationChannelAsync("default", {
    name: "Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#9B8CFF",
  });
};

// Written by `eas init`. Absent until the project is linked, and `getExpoPushTokenAsync`
// cannot work without it — so it is checked rather than left to throw.
const projectId = (): string | undefined =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;

/**
 * Asks for permission if undecided, then hands the account this device's push token. Safe
 * on every launch: re-sending is how a reinstall or an OS-issued new token gets picked up.
 * Returns null for every ordinary reason there might not be one.
 */
export const registerForPush = async (): Promise<string | null> => {
  try {
    if (Platform.OS === "android") {
      await ensureAndroidChannel();
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;

    // Once someone has said no the system dialog never appears again, and asking would
    // silently resolve to denied.
    if (!granted && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }

    if (!granted) return null;

    const id = projectId();
    if (!id) {
      console.warn("[push] no EAS project id — run `eas init` to enable push notifications");
      return null;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });

    // The account owns the token, not the device — the reminder job reads it while the
    // app is closed.
    await patch("/users/me", { pushToken: token });
    return token;
  }
  catch (err) {
    // A simulator lands here every time — it has no APNs registration to hand out.
    console.warn("[push] registration skipped", err);
    return null;
  }
};

/**
 * Detaches this device on sign-out. Must run BEFORE the session is cleared, since it is an
 * authenticated request — and leaving the token behind would push the previous user's
 * reminders to a phone somebody else is signed in on.
 */
export const detachPush = async (): Promise<void> => {
  try {
    await patch("/users/me", { pushToken: null });
    await Notifications.setBadgeCountAsync(0);
  }
  catch {
    // Signing out must not be blockable by a network failure.
  }
};

const linkOf = (data: unknown): NotificationLink | undefined => {
  const link = (data as { link?: NotificationLink } | undefined)?.link;
  return link?.screen ? link : undefined;
};

const openFromLink = (data: unknown): void => {
  const route = routeFor(linkOf(data));
  if (route) router.push(route);
};

/** Arrive, and be tapped. Mounted once at the root for the whole session — a per-screen
 *  listener would miss everything arriving while another screen is up. */
export const useNotificationBridge = (enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) return;

    // The banner is the OS's business; re-reading the feed is what keeps the bell's count
    // and the list agreeing with it.
    const received = Notifications.addNotificationReceivedListener(() => {
      void useNotifications.getState().load();
    });

    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      void useNotifications.getState().load();
      openFromLink(response.notification.request.content.data);
    });

    // One that launched the app from cold start was responded to before this listener
    // existed, so read it back explicitly.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromLink(response.notification.request.content.data);
    });

    return () => {
      received.remove();
      tapped.remove();
    };
  }, [enabled]);

  // The badge follows the unread count, not the pushes delivered, so reading in-app
  // clears it too.
  const unread = useNotifications((s) => s.unread);
  useEffect(() => {
    if (!enabled) return;
    void Notifications.setBadgeCountAsync(unread);
  }, [enabled, unread]);
};
