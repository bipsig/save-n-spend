import { z } from "./z";
import { calendarDay, lenientDate as day, money, objectId, positiveMoney } from "./fields";
import { TRIP_SETTLE_DIRECTIONS } from "../constants";


const tripId = z.object({ id: objectId("Trip") });
const expenseIds = z.object({ id: objectId("Trip"), expenseId: objectId("Expense") });

/** Ledger rows the server writes itself carry these prefixes (Splitwise import, plan), and the
 *  trip pages read rows by them. A client's key must never look like one. */
const SERVER_KEY = /^(sw|plan):/;

const trip = {
    name: z.string().trim().min(1, "Give the trip a name").max(60),
    emoji: z.string().max(8).optional(),
    color: z.string().max(20).optional(),
    startDate: day,
    endDate: day,
    members: z.array(objectId("A person on the trip", "people")).max(30),
    budget: money.min(0).nullable().optional(),
};

export const createTripSchemas = { body: z.object(trip).strict() };

export const updateTripSchemas = { params: tripId, body: z.object(trip).partial().strict() };

export const tripIdSchemas = { params: tripId };

/** Create and edit check the same rules: the 2.6.0 sheet sends the whole expense both times. */
const expense = z.object({
    title: z.string().trim().min(1, "Give it a name").max(80),
    occurredAt: day,
    category: objectId("Category", "categories").nullable().optional(),
    cost: positiveMoney,
    /** null = you paid. */
    paidBy: objectId("Whoever paid", "people").nullable(),
    paidFrom: objectId("The account you paid from", "accounts").nullable().optional(),
    shares: z.array(z.object({ account: objectId("A person in the split", "people").nullable(), amount: money.min(0) }).strict()).min(1, "Pick who it's split between").max(31),
}).strict();

export const addExpenseSchemas = { params: tripId, body: expense };
export const editExpenseSchemas = { params: expenseIds, body: expense };
export const expenseIdSchemas = { params: expenseIds };

export const settleSchemas = {
    params: tripId,
    body: z.object({
        person: objectId("Person", "people"),
        account: objectId("Account", "accounts"),
        amount: positiveMoney,
        direction: z.enum(TRIP_SETTLE_DIRECTIONS),
        occurredAt: day.optional(),
        /** Makes a resend of the same settle-up land once (the transaction clientId index). */
        clientId: z.string().min(8).max(64).refine((v) => !SERVER_KEY.test(v), "This request had something the server didn't expect. Please update the app").optional(),
    }).strict(),
};

export const planSchemas = {
    params: tripId,
    body: z.object({
        /** Per person, signed: positive = they pay you, negative = you pay them. Anyone left out pays nothing. */
        entries: z.array(z.object({ account: objectId("A person in the plan", "people"), amount: money }).strict()).max(30),
    }).strict(),
};

export const closeTripSchemas = {
    params: tripId,
    body: z.object({
        /** People whose leftover balance is let go rather than kept. */
        letGo: z.array(objectId("A person to let go", "people")).max(30).default([]),
        /** The day the trip counts on (2.8.6 on); without it, the last expense day. */
        closedOn: calendarDay.optional(),
    }).strict(),
};

export const closeDateSchemas = { params: tripId, body: z.object({ closedOn: calendarDay }).strict() };

/** The 2.6.0 app sends no body. */
export const reopenTripSchemas = { params: tripId, body: z.object({}).strict() };

const csv = z.string().min(1, "The file is empty").max(2_000_000, "That file is too big");
/** A name in the file → "me", "new" or one of your people. */
const mapping = z.record(
    z.string().max(80),
    z.string().refine((v) => v === "me" || v === "new" || /^[a-f0-9]{24}$/i.test(v), {
        message: "A person in the file isn't one of your people any more. Pick another",
        params: { code: "invalid_reference" },
    }),
);

export const importPreviewSchemas = { params: tripId, body: z.object({ csv, mapping: mapping.optional() }).strict() };

export const importCommitSchemas = {
    params: tripId,
    body: z.object({
        csv,
        mapping,
        decisions: z.array(z.object({
            key: z.string().max(300),
            action: z.enum(["import", "skip", "apply"]),
            category: objectId("Category", "categories").nullable().optional(),
            title: z.string().trim().max(80).optional(),
            account: objectId("Account", "accounts").nullable().optional(),
            parts: z.array(z.object({
                title: z.string().trim().max(80),
                category: objectId("Category", "categories").nullable(),
                cost: positiveMoney,
            }).strict()).max(20).optional(),
        }).strict()).max(1000),
    }).strict(),
};
