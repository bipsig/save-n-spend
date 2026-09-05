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
// Everything here degrades to nothing. Push is a courtesy on top of the in-app feed —
// a simulator can't get a token, a user can refuse permission, and the project may not
// be linked to EAS yet. In all three cases the app works exactly as it did, and the bell
// still shows everything the server has sent.

/**
 * How a notification behaves while the app is in the FOREGROUND.
 *
 * Shown rather than swallowed: the alerts this app sends are about money moving, and a
 * budget being blown is worth interrupting whatever screen you're on. The badge is not
 * set from here — it is set from the unread count, which is the number that stays true
 * after the user reads something in-app.
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
// requires it to exist before the first notification, or the OS files it under a
// default channel the user can't tune.
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
 * Asks for permission if it hasn't been decided, then hands the account this device's
 * push token. Safe to call on every launch: the token is stable, and re-sending it is
 * how a reinstall or an OS-issued new token gets picked up.
 *
 * Returns the token, or null for every ordinary reason there might not be one.
 */
export const registerForPush = async (): Promise<string | null> => {
  try {
    if (Platform.OS === "android") {
      await ensureAndroidChannel();
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;

    // Only ask when the OS still allows it. Once someone has said no, the system
    // dialog never appears again, and asking would silently resolve to denied.
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

    // The account, not the device, owns the token: it is what the server's reminder job
    // reads, and it has to survive the app being closed.
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
 * Detaches this device on sign-out.
 *
 * Must run BEFORE the session is cleared, since it is an authenticated request. Leaving
 * the token behind would push the previous user's bill reminders to a phone somebody
 * else is now signed in on.
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

/**
 * Wires the two things a notification can do to a running app: arrive, and be tapped.
 *
 * Mounted once, at the root, for the whole authenticated session — a listener attached
 * per screen would miss everything that arrives while another screen is up.
 */
export const useNotificationBridge = (enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) return;

    // Arriving: the feed is what the bell counts, so it has to be re-read. The banner is
    // the OS's business; this is only about the badge and the list agreeing with it.
    const received = Notifications.addNotificationReceivedListener(() => {
      void useNotifications.getState().load();
    });

    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      void useNotifications.getState().load();
      openFromLink(response.notification.request.content.data);
    });

    // A notification that launched the app from cold start has already been "responded
    // to" before this listener existed, so it is read back explicitly.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromLink(response.notification.request.content.data);
    });

    return () => {
      received.remove();
      tapped.remove();
    };
  }, [enabled]);

  // The icon badge follows the unread count rather than the number of pushes delivered,
  // so reading a notification in-app clears the badge too.
  const unread = useNotifications((s) => s.unread);
  useEffect(() => {
    if (!enabled) return;
    void Notifications.setBadgeCountAsync(unread);
  }, [enabled, unread]);
};
