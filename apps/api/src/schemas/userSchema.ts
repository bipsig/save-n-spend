import z from "zod";
import { isValidZone } from "../utils/timezone";

export const updateMeSchema = z.object({
    // The display name, edited from Settings → Edit profile. Email is not
    // editable: it is the login identity and the unique index, so changing it
    // would need a verification flow we don't have yet.
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(60).optional(),
    // Nullable so signing out can detach this device: leaving a stale token on the
    // account would keep pushing this user's reminders to a phone somebody else is
    // now signed in on.
    pushToken: z.string().nullable().optional(),
    prefs: z.object({
        defaultAccount: z.string().nullable().optional(),
        // Checked against the runtime's zone database, not a hard-coded list: an
        // unrecognised name here would silently poison every date bucket the user
        // sees, so it has to be refused at the edge rather than normalised away.
        timeZone: z.string().refine(isValidZone, "Not a recognised time zone").optional(),
        notifications: z.object({
            enabled: z.boolean().optional(),
            billReminderLead: z.union([z.literal(1), z.literal(3), z.literal(7)]).optional(),
            budgetAlerts: z.boolean().optional(),
            goalMilestones: z.boolean().optional(),
            weeklySummary: z.boolean().optional(),
        }).strict().optional(),
    }).strict().optional(),
}).strict();
