import { z } from "./z";

// The same sentence schemas/errorMap gives any other fault in the file.
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "That doesn't look like a Save n Spend backup file");

// Loose, not per-field: every document keeps whatever it was exported with, and
// Mongoose's own model schema is the real validator once insertMany runs inside the
// restore transaction. This only has to reject garbage before that transaction opens.
const backupDoc = z.looseObject({ _id: objectId });

export const backupPayloadSchema = z.object({
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    preferences: z.looseObject({
        currency: z.string(),
        timeZone: z.string(),
        notifications: z.looseObject({}),
        defaultAccount: objectId.nullable().optional(),
    }),
    accounts: z.array(backupDoc),
    categories: z.array(backupDoc),
    transactions: z.array(backupDoc),
    budgets: z.array(backupDoc),
    bills: z.array(backupDoc),
    goals: z.array(backupDoc),
    // Added with trips; absent from older backups, which still restore.
    trips: z.array(backupDoc).optional(),
    tripExpenses: z.array(backupDoc).optional(),
});

// The server-side half of the destructive-action guard — a defense-in-depth check
// against an accidental or retried POST, alongside the client's own hold-to-confirm.
// The top level is strict (every backup ever exported has exactly these keys); the
// documents and preferences inside stay loose.
export const restoreSchemas = {
    body: backupPayloadSchema.extend({ confirm: z.literal(true) }).strict(),
};

export type BackupPayload = z.infer<typeof backupPayloadSchema>;
