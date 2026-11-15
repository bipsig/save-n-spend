import { z } from "./z";
import { objectId, timeZone } from "./fields";

const notifications = z.object({
    enabled: z.boolean().optional(),
    billReminderLead: z.union([z.literal(1), z.literal(3), z.literal(7)]).optional(),
    budgetAlerts: z.boolean().optional(),
    goalMilestones: z.boolean().optional(),
    dailySummary: z.boolean().optional(),
    weeklySummary: z.boolean().optional(),
    monthlySummary: z.boolean().optional(),
    investmentReminder: z.boolean().optional(),
    investmentReminderDay: z.number().int().min(1).max(28).optional(),
}).strict();

export const updateMeSchemas = {
    body: z.object({
        // The display name, edited from Settings → Edit profile. Email is not
        // editable: it is the login identity and the unique index, so changing it
        // would need a verification flow we don't have yet.
        name: z.string().trim().min(2, "Name needs at least 2 characters").max(60, "Name can be at most 60 characters").optional(),
        // Nullable so signing out can detach this device: leaving a stale token on the
        // account would keep pushing this user's reminders to a phone somebody else is
        // now signed in on.
        pushToken: z.string().nullable().optional(),
        prefs: z.object({
            defaultAccount: objectId("The default account", "accounts").nullable().optional(),
            // Checked against the runtime's zone database, not a hard-coded list: an
            // unrecognised name here would silently poison every date bucket the user
            // sees, so it has to be refused at the edge rather than normalised away.
            timeZone: timeZone.optional(),
            notifications: notifications.optional(),
        }).strict().optional(),
    }).strict(),
};

export type NotificationPrefsPatch = z.infer<typeof notifications>;
