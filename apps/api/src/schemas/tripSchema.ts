import z from "zod";

const id = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");
const paise = z.number().int();

export const tripSchema = z.object({
    name: z.string().trim().min(1, "Give the trip a name").max(60),
    emoji: z.string().max(8).optional(),
    color: z.string().max(20).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    members: z.array(id).max(30),
    budget: paise.min(0).nullable().optional(),
}).strict();

export const updateTripSchema = tripSchema.partial().strict();

export const tripExpenseSchema = z.object({
    title: z.string().trim().min(1, "Give it a name").max(80),
    occurredAt: z.coerce.date(),
    category: id.nullable().optional(),
    cost: paise.positive("Enter the amount"),
    /** null = you paid. */
    paidBy: id.nullable(),
    paidFrom: id.nullable().optional(),
    shares: z.array(z.object({ account: id.nullable(), amount: paise.min(0) }).strict()).min(1).max(31),
}).strict();

export const settleSchema = z.object({
    person: id,
    account: id,
    amount: paise.positive("Enter the amount"),
    direction: z.enum(["received", "paid"]),
    occurredAt: z.coerce.date().optional(),
}).strict();

export const closeTripSchema = z.object({
    /** People whose leftover balance is let go rather than kept. */
    letGo: z.array(id).max(30).default([]),
}).strict();

const csv = z.string().min(1, "The file is empty").max(2_000_000, "That file is too big");
const mapping = z.record(z.string().max(80), z.string().max(40));

export const importPreviewSchema = z.object({ csv, mapping: mapping.optional() }).strict();

export const importCommitSchema = z.object({
    csv,
    mapping,
    decisions: z.array(z.object({
        key: z.string().max(300),
        action: z.enum(["import", "skip", "apply"]),
        category: id.nullable().optional(),
        title: z.string().trim().max(80).optional(),
        account: id.nullable().optional(),
        parts: z.array(z.object({ title: z.string().trim().max(80), category: id.nullable(), cost: paise.positive() }).strict()).max(20).optional(),
    }).strict()).max(1000),
}).strict();
