import { randomBytes } from "crypto";
import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";

// Imported before the app (harness.ts, childApi.ts). Without Atlas credentials in the
// environment `config/db.ts` cannot build a working Atlas address, whatever a module does.
delete process.env.DB_USERNAME;
delete process.env.DB_PASSWORD;
delete process.env.DB_NAME;
delete process.env.HOST;
delete process.env.RENDER;
process.env.NODE_ENV = "test";
process.env.DISABLE_REMINDERS = "true";
process.env.JWT_SECRET ??= `test-${randomBytes(16).toString("hex")}`;
// bcrypt's cost, down from 12: sign-up and sign-in stay real, at a few ms each.
process.env.SALT_ROUNDS ??= "4";

// The API's request logs (one JSON object per line), hidden unless TEST_LOGS=1.
if (process.env.TEST_LOGS !== "1") {
    for (const level of ["log", "warn", "error"] as const) {
        const write = console[level].bind(console);
        console[level] = (...args: unknown[]) => { if (!(typeof args[0] === "string" && args[0].startsWith('{"t":'))) write(...args); };
    }
}

/** Every push the API tried to send in this process; nothing goes to Expo. */
export const sentPushes: ExpoPushMessage[] = [];
Expo.prototype.sendPushNotificationsAsync = async (messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> => {
    sentPushes.push(...messages);
    return messages.map((_, i) => ({ status: "ok", id: `test-${sentPushes.length - messages.length + i}` }));
};
