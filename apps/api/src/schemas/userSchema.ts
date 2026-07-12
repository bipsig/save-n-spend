import z from "zod";

export const updateMeSchema = z.object({
    pushToken: z.string().optional(),
    prefs: z.object({
        defaultAccount: z.string().nullable().optional(),
        budgetCycleDay: z.number().int().min(1).max(28).optional(),
        notifications: z.object({
            enabled: z.boolean().optional(),
            billReminderLead: z.union([z.literal(1), z.literal(3), z.literal(7)]).optional(),
            budgetAlerts: z.boolean().optional(),
            goalMilestones: z.boolean().optional(),
            weeklySummary: z.boolean().optional(),
        }).strict().optional(),
    }).strict().optional(),
}).strict();