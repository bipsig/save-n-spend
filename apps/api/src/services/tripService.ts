import mongoose, { ClientSession } from "mongoose";
import Account from "../models/Account";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import Trip, { type ITrip } from "../models/Trip";
import TripExpense, { type ITripExpense } from "../models/TripExpense";
import { AppError } from "../utils/AppError";
import { applyEffects } from "./transactionService";
import { dayKeyInZone } from "../utils/timezone";
import {
    memberBalances, myShareOf, planLedger, planLetGo, planSettlement, validateTripExpense,
    type LedgerRow, type TripExpenseIn,
} from "./tripLedger";
import type {
    ITrip as TripDTO, ITripExpense as TripExpenseDTO, TripDetailPayload, TripEntry, TripListItem, TripsPayload, TripTotals,
} from "@save-n-spend/types";

// Trips on top of the ordinary ledger. A trip expense is written as the transactions
// tripLedger plans, all tagged with the trip (and the expense that made them), inside one
// transaction — so creating, editing or deleting one can never leave its parts disagreeing.

type Oid = mongoose.Types.ObjectId;
const oid = (id: string | Oid) => new mongoose.Types.ObjectId(String(id));

/** Accounts money can come out of or go into for a trip: yours, not a person or a holding. */
const OWN_TYPES = ["bank", "cash", "wallet", "credit_card"];

const loadTrip = async (userId: string, tripId: string): Promise<ITrip> => {
    if (!mongoose.isValidObjectId(tripId)) throw AppError.badRequest("Invalid trip id");
    const trip = await Trip.findOne({ _id: tripId, userId });
    if (!trip) throw AppError.notFound("Trip not found");
    return trip;
};

const requireOpen = (trip: ITrip) => {
    if (trip.status === "closed") throw AppError.badRequest("This trip is closed — reopen it to make changes");
};

const requireOwnAccount = async (userId: string, accountId: string, session?: ClientSession) => {
    const acct = await Account.findOne({ _id: accountId, userId, isArchived: false, type: { $in: OWN_TYPES } }).session(session ?? null);
    if (!acct) throw AppError.badRequest("Pick one of your own accounts");
    return acct;
};

/** Every member must be one of the user's live person accounts. */
const requirePeople = async (userId: string, ids: string[]) => {
    const unique = [...new Set(ids)];
    const found = await Account.countDocuments({ _id: { $in: unique }, userId, type: "person", isArchived: false });
    if (found !== unique.length) throw AppError.badRequest("Everyone on a trip must be one of your people");
    return unique.map(oid);
};

// ---- Writing the ledger ------------------------------------------------------------------

const writeRows = async (
    userId: string, tripId: Oid, tripExpenseId: Oid | null, rows: LedgerRow[], session: ClientSession,
) => {
    for (const row of rows) {
        const [txn] = await Transaction.create([{
            userId,
            type: row.type,
            amount: row.amount,
            account: row.account,
            ...(row.toAccount ? { toAccount: row.toAccount } : {}),
            ...(row.type === "expense" ? { category: row.category ?? null, title: row.title } : {}),
            ...(row.note ? { note: row.note } : {}),
            ...(row.clientId ? { clientId: row.clientId } : {}),
            occurredAt: row.occurredAt,
            tripId,
            tripExpenseId,
        }], { session });
        await applyEffects(txn, "add", session);
    }
};

const removeRowsOf = async (tripExpenseId: Oid, session: ClientSession) => {
    const rows = await Transaction.find({ tripExpenseId }).session(session);
    for (const row of rows) {
        await applyEffects(row, "revert", session);
        await row.deleteOne({ session });
    }
};

export type TripExpenseBody = {
    title: string;
    occurredAt: Date;
    category?: string | null;
    cost: number;
    paidBy: string | null;
    paidFrom?: string | null;
    shares: { account: string | null; amount: number }[];
};

const checkExpense = async (userId: string, trip: ITrip, body: TripExpenseBody): Promise<TripExpenseIn> => {
    const input: TripExpenseIn = {
        title: body.title.trim(),
        occurredAt: body.occurredAt,
        category: body.category ?? null,
        cost: body.cost,
        paidBy: body.paidBy,
        paidFrom: body.paidBy === null ? body.paidFrom ?? null : null,
        shares: body.shares,
    };
    const problem = validateTripExpense(input, trip.members.map(String));
    if (problem) throw AppError.badRequest(problem);
    if (input.paidFrom) await requireOwnAccount(userId, input.paidFrom);
    if (input.category) {
        const cat = await Category.findOne({ _id: input.category, userId, kind: "expense" }).select("_id").lean();
        if (!cat) throw AppError.badRequest("Category not found");
    }
    return input;
};

const inTransaction = async <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> => {
    const session = await mongoose.startSession();
    try {
        let out: T | undefined;
        await session.withTransaction(async () => { out = await fn(session); });
        return out as T;
    }
    finally {
        session.endSession();
    }
};

export const addTripExpense = async (
    userId: string, tripId: string, body: TripExpenseBody, extra: { source?: "manual" | "splitwise"; importKey?: string | null } = {},
) => {
    const trip = await loadTrip(userId, tripId);
    requireOpen(trip);
    const input = await checkExpense(userId, trip, body);
    return inTransaction(async (session) => {
        const [doc] = await TripExpense.create([{
            userId, tripId: trip._id, ...input,
            source: extra.source ?? "manual", importKey: extra.importKey ?? null,
        }], { session });
        await writeRows(userId, trip._id as Oid, doc._id as Oid, planLedger(input), session);
        return doc;
    });
};

export const updateTripExpense = async (userId: string, tripId: string, expenseId: string, body: TripExpenseBody) => {
    const trip = await loadTrip(userId, tripId);
    requireOpen(trip);
    const input = await checkExpense(userId, trip, body);
    return inTransaction(async (session) => {
        const doc = await TripExpense.findOne({ _id: expenseId, userId, tripId: trip._id }).session(session);
        if (!doc) throw AppError.notFound("Expense not found");
        await removeRowsOf(doc._id as Oid, session);
        doc.set(input);
        await doc.save({ session });
        await writeRows(userId, trip._id as Oid, doc._id as Oid, planLedger(input), session);
        return doc;
    });
};

export const deleteTripExpense = async (userId: string, tripId: string, expenseId: string) => {
    const trip = await loadTrip(userId, tripId);
    requireOpen(trip);
    await inTransaction(async (session) => {
        const doc = await TripExpense.findOne({ _id: expenseId, userId, tripId: trip._id }).session(session);
        if (!doc) throw AppError.notFound("Expense not found");
        await removeRowsOf(doc._id as Oid, session);
        await doc.deleteOne({ session });
    });
};

// ---- Trips ---------------------------------------------------------------------------------

export type TripBody = {
    name: string;
    emoji?: string;
    color?: string;
    startDate: Date;
    endDate: Date;
    members: string[];
    budget?: number | null;
};

export const createTrip = async (userId: string, body: TripBody) => {
    if (body.endDate < body.startDate) throw AppError.badRequest("The trip can't end before it starts");
    const members = await requirePeople(userId, body.members);
    return Trip.create({ userId, ...body, members, budget: body.budget ?? null });
};

export const updateTrip = async (userId: string, tripId: string, body: Partial<TripBody>) => {
    const trip = await loadTrip(userId, tripId);
    const start = body.startDate ?? trip.startDate;
    const end = body.endDate ?? trip.endDate;
    if (end < start) throw AppError.badRequest("The trip can't end before it starts");
    if (body.members) {
        const members = await requirePeople(userId, body.members);
        // Someone with anything on the trip can't be dropped — their shares would dangle.
        const kept = new Set(members.map(String));
        const dropped = trip.members.map(String).filter((m) => !kept.has(m));
        if (dropped.length) {
            const involved = await TripExpense.countDocuments({
                tripId: trip._id,
                $or: [{ paidBy: { $in: dropped } }, { "shares.account": { $in: dropped } }],
            });
            const settled = await Transaction.countDocuments({ tripId: trip._id, $or: [{ account: { $in: dropped } }, { toAccount: { $in: dropped } }] });
            if (involved || settled) throw AppError.badRequest("Someone you're removing is already in this trip's expenses");
        }
        trip.members = members;
    }
    const { members: _members, ...rest } = body;
    trip.set(rest);
    await trip.save();
    return trip;
};

/** Deletes a trip and undoes everything on it: every expense's transactions and every
 *  settle-up are reversed and removed, so balances end as if the trip was never logged. */
export const deleteTrip = async (userId: string, tripId: string) => {
    const trip = await loadTrip(userId, tripId);
    await inTransaction(async (session) => {
        const rows = await Transaction.find({ userId, tripId: trip._id }).session(session);
        for (const row of rows) {
            await applyEffects(row, "revert", session);
            await row.deleteOne({ session });
        }
        await TripExpense.deleteMany({ userId, tripId: trip._id }, { session });
        await trip.deleteOne({ session });
    });
};

export const settleUp = async (
    userId: string, tripId: string,
    body: { person: string; account: string; amount: number; direction: "received" | "paid"; occurredAt?: Date },
    clientId?: string,
) => {
    const trip = await loadTrip(userId, tripId);
    if (!trip.members.map(String).includes(body.person)) throw AppError.badRequest("They aren't on this trip");
    await requireOwnAccount(userId, body.account);
    const person = await Account.findById(body.person).select("name").lean();
    const note = body.direction === "received" ? `${person?.name ?? "They"} paid you back` : `You paid ${person?.name ?? "them"} back`;
    const row = { ...planSettlement(body.person, body.account, body.amount, body.direction, body.occurredAt ?? new Date(), note), ...(clientId ? { clientId } : {}) };
    await inTransaction((session) => writeRows(userId, trip._id as Oid, null, [row], session));
};

/** Closes a trip. Balances in `letGo` are cleared (see planLetGo); the rest stay on each
 *  person's account, to be settled whenever. Always allowed. */
export const closeTrip = async (userId: string, tripId: string, letGo: string[]) => {
    const trip = await loadTrip(userId, tripId);
    requireOpen(trip);
    const txns = await Transaction.find({ userId, tripId: trip._id }).select("type amount account toAccount").lean();
    const balances = memberBalances(txns.map((t) => ({ type: t.type, amount: t.amount, account: String(t.account), toAccount: t.toAccount ? String(t.toAccount) : null })), trip.members.map(String));
    const people = await Account.find({ _id: { $in: letGo } }).select("name").lean();
    const nameOf = new Map(people.map((p) => [String(p._id), p.name]));
    await inTransaction(async (session) => {
        const rows: LedgerRow[] = [];
        for (const person of letGo) {
            const row = planLetGo(person, nameOf.get(person) ?? "them", balances.get(person) ?? 0, new Date());
            if (row) rows.push(row);
        }
        await writeRows(userId, trip._id as Oid, null, rows, session);
        trip.status = "closed";
        trip.closedAt = new Date();
        await trip.save({ session });
    });
};

export const reopenTrip = async (userId: string, tripId: string) => {
    const trip = await loadTrip(userId, tripId);
    trip.status = "active";
    trip.closedAt = null;
    await trip.save();
};

// ---- Reading -------------------------------------------------------------------------------

const toTripDTO = (t: ITrip | (ITrip & { createdAt?: Date })): TripDTO => ({
    _id: String(t._id),
    name: t.name,
    emoji: t.emoji,
    color: t.color,
    startDate: new Date(t.startDate).toISOString(),
    endDate: new Date(t.endDate).toISOString(),
    members: t.members.map(String),
    budget: t.budget ?? null,
    status: t.status,
    closedAt: t.closedAt ? new Date(t.closedAt).toISOString() : null,
    createdAt: new Date((t as unknown as { createdAt: Date }).createdAt ?? Date.now()).toISOString(),
});

type LeanTxn = { _id: Oid; type: string; amount: number; account: Oid; toAccount?: Oid | null; category?: Oid | null; title?: string | null; note?: string | null; occurredAt: Date; tripId?: Oid | null; tripExpenseId?: Oid | null };

const totalsFor = (trip: ITrip, txns: LeanTxn[], expenses: ITripExpense[]): { totals: TripTotals; balances: Map<string, number> } => {
    const balances = memberBalances(txns.map((t) => ({ type: t.type, amount: t.amount, account: String(t.account), toAccount: t.toAccount ? String(t.toAccount) : null })), trip.members.map(String));
    const totals: TripTotals = {
        myShare: txns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
        paid: expenses.filter((e) => e.paidBy === null).reduce((s, e) => s + e.cost, 0),
        wholeTrip: expenses.reduce((s, e) => s + e.cost, 0),
        balance: [...balances.values()].reduce((s, b) => s + b, 0),
    };
    return { totals, balances };
};

export const listTrips = async (userId: string): Promise<TripsPayload> => {
    const uid = oid(userId);
    const [trips, txns, expenses] = await Promise.all([
        Trip.find({ userId: uid }).sort({ startDate: -1 }).lean(),
        Transaction.find({ userId: uid, tripId: { $ne: null } }).select("type amount account toAccount tripId").lean(),
        TripExpense.find({ userId: uid }).select("tripId cost paidBy").lean(),
    ]);
    const txnsBy = new Map<string, LeanTxn[]>();
    for (const t of txns as LeanTxn[]) {
        const k = String(t.tripId);
        (txnsBy.get(k) ?? txnsBy.set(k, []).get(k)!).push(t);
    }
    const expBy = new Map<string, ITripExpense[]>();
    for (const e of expenses as unknown as ITripExpense[]) {
        const k = String(e.tripId);
        (expBy.get(k) ?? expBy.set(k, []).get(k)!).push(e);
    }

    // What's still unsettled, per trip: each person's balance counted on its own — a trip's net
    // figure would let "owed ₹500" and "owe ₹500" cancel to nothing.
    const openBy = new Map<string, number>();
    const items: TripListItem[] = trips.map((trip) => {
        const { totals, balances } = totalsFor(trip as unknown as ITrip, txnsBy.get(String(trip._id)) ?? [], expBy.get(String(trip._id)) ?? []);
        openBy.set(String(trip._id), [...balances.values()].reduce((s, b) => s + Math.abs(b), 0));
        return { ...toTripDTO(trip as unknown as ITrip), totals, openBalances: [...balances.values()].filter((b) => b !== 0).length };
    });

    // Active first, then newest first.
    items.sort((a, b) => (a.status === b.status ? b.startDate.localeCompare(a.startDate) : a.status === "active" ? -1 : 1));

    const years = new Map<number, { myShare: number; trips: number }>();
    for (const t of items) {
        const y = new Date(t.startDate).getUTCFullYear();
        const cur = years.get(y) ?? { myShare: 0, trips: 0 };
        cur.myShare += t.totals.myShare;
        cur.trips += 1;
        years.set(y, cur);
    }
    const open = [...openBy.values()].reduce((s, v) => s + v, 0);
    return {
        trips: items,
        allTime: {
            myShare: items.reduce((s, t) => s + t.totals.myShare, 0),
            trips: items.length,
            open,
            openTrips: items.filter((t) => t.openBalances > 0).length,
        },
        byYear: [...years].map(([year, v]) => ({ year, ...v })).sort((a, b) => b.year - a.year),
    };
};

export const getTripDetail = async (userId: string, tripId: string, zone: string): Promise<TripDetailPayload> => {
    const trip = await loadTrip(userId, tripId);
    const [txns, expenses, people] = await Promise.all([
        Transaction.find({ userId, tripId: trip._id }).lean() as unknown as Promise<LeanTxn[]>,
        TripExpense.find({ userId, tripId: trip._id }).sort({ occurredAt: -1 }).lean(),
        Account.find({ _id: { $in: trip.members } }).select("name").lean(),
    ]);
    const { totals, balances } = totalsFor(trip, txns, expenses as unknown as ITripExpense[]);
    const nameOf = new Map(people.map((p) => [String(p._id), p.name]));

    const myExpenses = txns.filter((t) => t.type === "expense");
    const byCat = new Map<string, number>();
    const byDay = new Map<string, number>();
    for (const t of myExpenses) {
        const c = t.category ? String(t.category) : "";
        byCat.set(c, (byCat.get(c) ?? 0) + t.amount);
        const d = dayKeyInZone(new Date(t.occurredAt), zone);
        byDay.set(d, (byDay.get(d) ?? 0) + t.amount);
    }

    const entries: TripEntry[] = [
        ...expenses.map((e) => ({
            kind: "expense" as const,
            id: String(e._id),
            occurredAt: new Date(e.occurredAt).toISOString(),
            title: e.title,
            category: e.category ? String(e.category) : null,
            amount: myShareOf(e.shares.map((s) => ({ account: s.account ? String(s.account) : null, amount: s.amount }))),
            cost: e.cost,
            paidBy: e.paidBy ? String(e.paidBy) : null,
        })),
        // Anything on the trip that isn't an expense's own transaction: settle-ups and let-gos.
        ...txns.filter((t) => !t.tripExpenseId).map((t) => {
            if (t.type === "transfer") {
                const received = trip.members.map(String).includes(String(t.account));
                const person = received ? String(t.account) : String(t.toAccount);
                return {
                    kind: "settlement" as const,
                    id: String(t._id),
                    occurredAt: new Date(t.occurredAt).toISOString(),
                    title: t.note ?? "Settle-up",
                    category: null,
                    amount: t.amount,
                    person,
                    direction: received ? "received" as const : "paid" as const,
                    account: received ? String(t.toAccount) : String(t.account),
                };
            }
            return {
                kind: "letGo" as const,
                id: String(t._id),
                occurredAt: new Date(t.occurredAt).toISOString(),
                title: t.title ?? t.note ?? "Let go",
                category: null,
                amount: t.amount,
                person: String(t.account),
            };
        }),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    return {
        trip: toTripDTO(trip),
        totals,
        members: trip.members.map((m) => ({ account: String(m), name: nameOf.get(String(m)) ?? "Someone", balance: balances.get(String(m)) ?? 0 })),
        byCategory: [...byCat].map(([category, total]) => ({ category: category || null, total })).sort((a, b) => b.total - a.total),
        byDay: [...byDay].map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date)),
        entries,
        expenses: expenses.map((e) => ({
            _id: String(e._id),
            tripId: String(e.tripId),
            title: e.title,
            occurredAt: new Date(e.occurredAt).toISOString(),
            category: e.category ? String(e.category) : null,
            cost: e.cost,
            paidBy: e.paidBy ? String(e.paidBy) : null,
            paidFrom: e.paidFrom ? String(e.paidFrom) : null,
            shares: e.shares.map((s) => ({ account: s.account ? String(s.account) : null, amount: s.amount })),
            source: e.source,
            createdAt: new Date((e as unknown as { createdAt: Date }).createdAt).toISOString(),
        })) as TripExpenseDTO[],
    };
};
