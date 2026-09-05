import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import User from "../models/User";

// The transport half of notifications: handing a message to Expo's push service and
// dealing with what comes back. Everything about WHEN to notify lives in
// notificationService; this file only knows how to deliver.
//
// Kept deliberately quiet about failures. A push is a courtesy — if Expo is down, or a
// token has gone stale, the notification is still in the user's in-app feed and the
// request that triggered it must still succeed. So nothing here throws to its caller.

// An access token is only required once push security is switched on in the Expo
// project; without one the SDK sends unauthenticated, which works for a project that
// hasn't enabled it. Read from the environment either way so enabling it later is a
// deploy-time change, not a code change.
const expo = new Expo({
    accessToken: process.env.EXPO_ACCESS_TOKEN,
    useFcmV1: true,
});

export const isValidPushToken = (token?: string | null): boolean =>
    !!token && Expo.isExpoPushToken(token);

/**
 * A token Expo has told us is dead is worse than no token: every later send wastes a
 * request and the receipt log fills with the same error. So it is cleared at the
 * source, and the next app launch registers a fresh one.
 */
const forgetToken = async (token: string): Promise<void> => {
    try {
        await User.updateMany({ pushToken: token }, { $unset: { pushToken: 1 } });
    }
    catch (err) {
        console.error("[push] failed to clear a dead token", err);
    }
};

export type PushPayload = {
    token: string;
    title: string;
    body: string;
    /** Travels with the push and is read by the tap handler to route the user. */
    data?: Record<string, unknown>;
    /** Drives the app icon badge; the count the client should show after this arrives. */
    badge?: number;
};

/**
 * Sends one notification. Returns whether Expo accepted it — not whether the phone
 * showed it, which only the receipts endpoint knows and no caller here waits for.
 */
export const sendPush = async (payload: PushPayload): Promise<boolean> => {
    if (!isValidPushToken(payload.token)) {
        // Not an error worth logging loudly: a user who has never granted permission
        // simply has no token, and that is a normal state.
        return false;
    }

    const message: ExpoPushMessage = {
        to: payload.token,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        badge: payload.badge,
        sound: "default",
        // Money nudges are worth waking the screen for, and iOS throttles anything
        // lower into a delivery window that can be hours wide.
        priority: "high",
        channelId: "default",
    };

    try {
        const [ticket] = await expo.sendPushNotificationsAsync([message]) as ExpoPushTicket[];

        if (ticket?.status === "error") {
            const code = ticket.details?.error;
            console.warn(`[push] rejected: ${ticket.message}`);
            if (code === "DeviceNotRegistered") {
                await forgetToken(payload.token);
            }
            return false;
        }
        return true;
    }
    catch (err) {
        console.error("[push] send failed", err);
        return false;
    }
};
