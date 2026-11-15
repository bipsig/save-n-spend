import { test } from "node:test";
import assert from "node:assert/strict";
import { profileUpdate } from "./userController";

// PATCH /users/me as an update document. Each switch is its own dotted path, so three
// switches flipped at once (the idempotency audit's T14) can't overwrite each other.

test("each notification switch is its own dotted $set, never the whole object", () => {
    assert.deepEqual(profileUpdate({ prefs: { notifications: { budgetAlerts: false } } }), { $set: { "prefs.notifications.budgetAlerts": false } });
    assert.deepEqual(
        profileUpdate({ prefs: { notifications: { weeklySummary: true, billReminderLead: 7 } } }),
        { $set: { "prefs.notifications.weeklySummary": true, "prefs.notifications.billReminderLead": 7 } },
    );
});

test("other fields map one to one; a null push token is unset, not stored", () => {
    assert.deepEqual(profileUpdate({ name: "Sagnik" }), { $set: { name: "Sagnik" } });
    assert.deepEqual(profileUpdate({ pushToken: "ExponentPushToken[a]" }), { $set: { pushToken: "ExponentPushToken[a]" } });
    assert.deepEqual(profileUpdate({ pushToken: null }), { $unset: { pushToken: 1 } });
    assert.deepEqual(profileUpdate({ prefs: { defaultAccount: null, timeZone: "Asia/Kolkata" } }), { $set: { "prefs.defaultAccount": null, "prefs.timeZone": "Asia/Kolkata" } });
});

test("an empty body changes nothing", () => {
    assert.deepEqual(profileUpdate({}), {});
    assert.deepEqual(profileUpdate({ prefs: {} }), {});
});
