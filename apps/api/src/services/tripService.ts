import mongoose, { type ClientSession } from "mongoose";
import Account from "../models/Account";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import Trip, { type ITrip } from "../models/Trip";
import TripExpense, { type ITripExpense } from "../models/TripExpense";
import { AppError } from "../utils/AppError";
import { inTransaction } from "../utils/inTransaction";
import { MESSAGES, conflict, notFound } from "../utils/messages";
import { applyEffects, getEffectOf, type Movable } from "./transactionService";
import { dayKeyInZone } from "../utils/timezone";
import {
    expensesSignature, isReroute, memberBalances, myShareOf, planLedger, planLetGo, planReroute, planSettlement,
    validatePlan, validateTripExpense, PLAN_PREFIX,
    type LedgerRow, type PlanEntry, type TripExpenseIn,
} from "./tripLedger";
import type {
    ITrip as TripDTO, ITripExpense as TripExpenseDTO, TripDetailPayload, TripPlan, TripEntry, TripListItem, TripsPayload, TripTotals,
} from "@save-n-spend/types";

// Trips on top of the ordinary ledger. A trip expense is written as the transactions
// tripLedger plans, all tagged with the trip (and the expense that made them), inside one
// transaction — so creating, editing or deleting one can never leave its parts disagreeing.
//
// Every write to a trip runs in one transaction that first writes the trip document itself
// (claimTrip, or the close claim). Two writes to one trip at once therefore conflict, and
// MongoDB's retry runs the loser again on fresh data: it sees the trip the winner closed, or
// the member the winner removed, or the expense the winner added (invariants I3 and I4).

type Oid = mongoose.Types.ObjectId;
const oid = (id: string | Oid) => new mongoose.Types.ObjectId(String(id));

/** Accounts money can come out of or go into for a trip: yours, not a person or a holding. */
const OWN_TYPES = ["bank", "cash", "wallet", "credit_card"];

export const TRIP_CLOSED = conflict("This trip is closed", "Reopen it to make changes");
const ALREADY_CLOSED = conflict("This trip is already closed");
const MEMBER_IN_USE = conflict("Someone you're removing is already in this trip's expenses");
const ON_TRIP = "people on this trip";

const tripNotFound = () => AppError.notFound(notFound("trip"));

/** A rule the request alone breaks (400 `invalid_input`). */
export const invalidInput = (path: string, message: string) =>
    new AppError(400, message, { code: "invalid_input", issues: [{ path, message }] });

/** Where a problem sits in the request; the Splitwise import maps these onto its decisions. */
export type At = (path: string) => string;
const here: At = (p) => p;

export const loadTrip = async (userId: string, tripId: string, session: ClientSession | null = null): Promise<ITrip> => {
    const trip = await Trip.findOne({ _id: tripId, userId }).session(session);
    if (!trip) throw tripNotFound();
    return trip;
};

/** Reads the trip inside the transaction and writes to it (see the note at the top). */
export const claimTrip = async (userId: string, tripId: string, session: ClientSession): Promise<ITrip> => {
    const trip = await Trip.findOneAndUpdate({ _id: tripId, userId }, { $set: { updatedAt: new Date() } }, { session, new: true });
    if (!trip) throw tripNotFound();
    return trip;
};

export const requireOpen = (trip: ITrip) => {
    if (trip.status === "closed") throw AppError.conflict(TRIP_CLOSED);
};

const requireOwnAccount = async (userId: string, accountId: string, path: string, label: string, session: ClientSession) => {
    const acct = await Account.findOne({ _id: accountId, userId, isArchived: false, type: { $in: OWN_TYPES } }).session(session);
    if (!acct) throw AppError.invalidReference(path, label, "accounts");
    return acct;
};

/** Every member must be one of the user's live person accounts. */
const requirePeople = async (userId: string, ids: string[], session: ClientSession | null) => {
    const wanted = ids.map((id) => id.toLowerCase());
    const found = await Account.find({ _id: { $in: wanted }, userId, type: "person", isArchived: false }).select("_id").session(session).lean();
    const ok = new Set(found.map((a) => String(a._id)));
    const bad = wanted.findIndex((id) => !ok.has(id));
    if (bad >= 0) throw AppError.invalidReference(`members.${bad}`, "A person on the trip", "people");
    return [...new Set(wanted)].map(oid);
};

// ---- Writing the ledger ------------------------------------------------------------------

/** One planned ledger row as the Transaction it is stored as. */
export const rowDoc = (userId: string, tripId: Oid, tripExpenseId: Oid | null, row: LedgerRow) => ({
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
});

const writeRows = async (
    userId: string, tripId: Oid, tripExpenseId: Oid | null, rows: LedgerRow[], session: ClientSession,
) => {
    for (const row of rows) {
        const [txn] = await Transaction.create([rowDoc(userId, tripId, tripExpenseId, row)], { session });
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

/** Where each of tripLedger's sentences points in the body. */
const LEDGER_PATH: Record<string, string> = {
    "Enter the amount": "cost",
    "Pick the account you paid from": "paidFrom",
};

/** What a bulk write already read once in its session: your own accounts money can move
 *  through, your expense categories, and your people's names. */
export type KnownRefs = { ownAccounts: Set<string>; categories: Set<string>; names: Map<string, string> };

export const loadKnownRefs = async (userId: string, session: ClientSession): Promise<KnownRefs> => {
    const own = await Account.find({ userId, isArchived: false, type: { $in: OWN_TYPES } }).select("_id").session(session).lean();
    const cats = await Category.find({ userId, kind: "expense" }).select("_id").session(session).lean();
    const people = await Account.find({ userId, type: "person" }).select("name").session(session).lean();
    return {
        ownAccounts: new Set(own.map((a) => String(a._id))),
        categories: new Set(cats.map((c) => String(c._id))),
        names: new Map(people.map((p) => [String(p._id), p.name])),
    };
};

/** References first (each with its path), then the ledger's rules. Read in the session, or
 *  from `known` when given. */
export const checkExpense = async (
    userId: string, trip: ITrip, body: TripExpenseBody, session: ClientSession, at: At = here, known?: KnownRefs,
): Promise<TripExpenseIn> => {
    const lower = (id: string | null | undefined) => (id ? id.toLowerCase() : null);
    const input: TripExpenseIn = {
        title: body.title.trim(),
        occurredAt: body.occurredAt,
        category: body.category ?? null,
        cost: body.cost,
        paidBy: lower(body.paidBy),
        paidFrom: body.paidBy === null ? body.paidFrom ?? null : null,
        shares: body.shares.map((s) => ({ account: lower(s.account), amount: s.amount })),
    };
    const members = new Set(trip.members.map(String));
    if (input.paidBy !== null && !members.has(input.paidBy)) throw AppError.invalidReference(at("paidBy"), "Whoever paid", ON_TRIP);
    for (const [i, s] of input.shares.entries()) {
        if (s.account !== null && !members.has(s.account)) throw AppError.invalidReference(at(`shares.${i}.account`), "A person in the split", ON_TRIP);
    }
    const problem = validateTripExpense(input, [...members]);
    if (problem) throw invalidInput(at(LEDGER_PATH[problem] ?? "shares"), problem);
    if (input.paidFrom) {
        if (!known) await requireOwnAccount(userId, input.paidFrom, at("paidFrom"), "The account you paid from", session);
        else if (!known.ownAccounts.has(input.paidFrom.toLowerCase())) throw AppError.invalidReference(at("paidFrom"), "The account you paid from", "accounts");
    }
    // Archived categories stay allowed, as before R1: an expense filed under one stays editable.
    const categoryOk = !input.category
        || (known ? known.categories.has(String(input.category).toLowerCase()) : await Category.exists({ _id: input.category, userId, kind: "expense" }).session(session));
    if (!categoryOk) throw AppError.invalidReference(at("category"), "Category", "categories");
    return input;
};

export const insertExpense = async (
    session: ClientSession, userId: string, trip: ITrip, input: TripExpenseIn,
    extra: { source?: "manual" | "splitwise"; importKey?: string | null } = {},
) => {
    const [doc] = await TripExpense.create([{
        userId, tripId: trip._id, ...input,
        source: extra.source ?? "manual", importKey: extra.importKey ?? null,
    }], { session });
    await writeRows(userId, trip._id as Oid, doc._id as Oid, planLedger(input), session);
    return doc;
};

/**
 * What `insertExpense` and `settleIn` write, for many at once, in a few round trips: every
 * expense in one insert, every row in one insert, and one balance update per account. Each
 * account an effect lands on must be the user's, as `applyEffects` requires.
 */
export const insertInBulk = async (
    session: ClientSession, userId: string, trip: ITrip,
    expenses: { input: TripExpenseIn; importKey: string }[], settlements: LedgerRow[],
) => {
    const docs = expenses.map(({ input, importKey }) => ({ _id: new mongoose.Types.ObjectId(), userId, tripId: trip._id, ...input, source: "splitwise" as const, importKey }));
    const rows = [
        ...docs.flatMap((doc, i) => planLedger(expenses[i].input).map((row) => rowDoc(userId, trip._id as Oid, doc._id, row))),
        ...settlements.map((row) => rowDoc(userId, trip._id as Oid, null, row)),
    ];
    if (docs.length) await TripExpense.insertMany(docs, { session });
    if (!rows.length) return;
    await Transaction.insertMany(rows, { session });

    const deltas = new Map<string, number>();
    for (const row of rows) {
        for (const { account, delta } of getEffectOf(row as unknown as Movable)) deltas.set(String(account).toLowerCase(), (deltas.get(String(account).toLowerCase()) ?? 0) + delta);
    }
    const ids = [...deltas.keys()];
    if ((await Account.countDocuments({ _id: { $in: ids }, userId }).session(session)) !== ids.length) {
        throw AppError.invalidReference("account", "The account", "accounts");
    }
    const changed = ids.filter((id) => deltas.get(id) !== 0);
    if (changed.length) {
        await Account.bulkWrite(changed.map((id) => ({ updateOne: { filter: { _id: id, userId }, update: { $inc: { balance: deltas.get(id)! } } } })), { session });
    }
};

const findExpense = async (userId: string, trip: ITrip, expenseId: string, session: ClientSession) => {
    const doc = await TripExpense.findOne({ _id: expenseId, userId, tripId: trip._id }).session(session);
    if (!doc) throw AppError.notFound(notFound("expense"));
    return doc;
};

/** Rewrites an expense and its transactions. */
export const replaceExpense = async (session: ClientSession, userId: string, trip: ITrip, doc: ITripExpense, input: TripExpenseIn) => {
    await removeRowsOf(doc._id as Oid, session);
    doc.set(input);
    await doc.save({ session });
    await writeRows(userId, trip._id as Oid, doc._id as Oid, planLedger(input), session);
    return doc;
};

export const addTripExpense = (userId: string, tripId: string, body: TripExpenseBody) =>
    inTransaction(async (session) => {
        const trip = await claimTrip(userId, tripId, session);
        requireOpen(trip);
        return insertExpense(session, userId, trip, await checkExpense(userId, trip, body, session));
    });

export const updateTripExpense = (userId: string, tripId: string, expenseId: string, body: TripExpenseBody) =>
    inTransaction(async (session) => {
        const trip = await claimTrip(userId, tripId, session);
        requireOpen(trip);
        const doc = await findExpense(userId, trip, expenseId, session);
        return replaceExpense(session, userId, trip, doc, await checkExpense(userId, trip, body, session));
    });

export const deleteTripExpense = (userId: string, tripId: string, expenseId: string) =>
    inTransaction(async (session) => {
        const trip = await claimTrip(userId, tripId, session);
        requireOpen(trip);
        const doc = await findExpense(userId, trip, expenseId, session);
        await removeRowsOf(doc._id as Oid, session);
        await doc.deleteOne({ session });
    });

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

const END_BEFORE_START = "The trip can't end before it starts";

export const createTrip = async (userId: string, body: TripBody) => {
    if (body.endDate < body.startDate) throw invalidInput("endDate", END_BEFORE_START);
    const members = await requirePeople(userId, body.members, null);
    const trip = await Trip.create({ userId, ...body, members, budget: body.budget ?? null });
    return trip;
};

/** Allowed on a closed trip, as before (gaps row 190 is a decision still open). */
export const updateTrip = (userId: string, tripId: string, body: Partial<TripBody>) =>
    inTransaction(async (session) => {
        const trip = await loadTrip(userId, tripId, session);
        const start = body.startDate ?? trip.startDate;
        const end = body.endDate ?? trip.endDate;
        if (end < start) throw invalidInput(body.endDate ? "endDate" : "startDate", END_BEFORE_START);
        if (body.members) {
            const members = await requirePeople(userId, body.members, session);
            // Someone with anything on the trip can't be dropped — their shares would dangle.
            const kept = new Set(members.map(String));
            const dropped = trip.members.map(String).filter((m) => !kept.has(m));
            if (dropped.length) {
                const involved = await TripExpense.countDocuments({
                    tripId: trip._id,
                    $or: [{ paidBy: { $in: dropped } }, { "shares.account": { $in: dropped } }],
                }).session(session);
                const settled = await Transaction.countDocuments({ tripId: trip._id, $or: [{ account: { $in: dropped } }, { toAccount: { $in: dropped } }] }).session(session);
                if (involved || settled) throw AppError.conflict(MEMBER_IN_USE);
            }
            trip.members = members;
        }
        const { members: _members, ...rest } = body;
        trip.set(rest);
        await trip.save({ session });
        return trip;
    });

/** Deletes a trip and undoes everything on it: every expense's transactions and every
 *  settle-up are reversed and removed, so balances end as if the trip was never logged. */
export const deleteTrip = (userId: string, tripId: string) =>
    inTransaction(async (session) => {
        const trip = await loadTrip(userId, tripId, session);
        const rows = await Transaction.find({ userId, tripId: trip._id }).session(session);
        for (const row of rows) {
            await applyEffects(row, "revert", session);
            await row.deleteOne({ session });
        }
        await TripExpense.deleteMany({ userId, tripId: trip._id }, { session });
        await trip.deleteOne({ session });
    });

export type SettleBody = { person: string; account: string; amount: number; direction: "received" | "paid"; occurredAt?: Date };

/** The settle-up's row, after its checks. Reads in the session, or from `known` when given. */
export const settlementRow = async (
    session: ClientSession, userId: string, trip: ITrip, body: SettleBody, clientId?: string, at: At = here, known?: KnownRefs,
): Promise<LedgerRow> => {
    const person = body.person.toLowerCase();
    if (!trip.members.map(String).includes(person)) throw AppError.invalidReference(at("person"), "Person", ON_TRIP);
    let name: string | undefined;
    if (known) {
        if (!known.ownAccounts.has(body.account.toLowerCase())) throw AppError.invalidReference(at("account"), "Account", "accounts");
        name = known.names.get(person);
    }
    else {
        await requireOwnAccount(userId, body.account, at("account"), "Account", session);
        name = (await Account.findOne({ _id: person, userId }).select("name").session(session).lean())?.name;
    }
    const note = body.direction === "received" ? `${name ?? "They"} paid you back` : `You paid ${name ?? "them"} back`;
    return { ...planSettlement(person, body.account, body.amount, body.direction, body.occurredAt ?? new Date(), note), ...(clientId ? { clientId } : {}) };
};

/** A settle-up on a trip already claimed in this session. Allowed on a closed trip. */
export const settleIn = async (session: ClientSession, userId: string, trip: ITrip, body: SettleBody, clientId?: string, at: At = here) => {
    await writeRows(userId, trip._id as Oid, null, [await settlementRow(session, userId, trip, body, clientId, at)], session);
};

const isDuplicateKey = (e: unknown): boolean => (e as { code?: number } | null)?.code === 11000;

/** "saved", or "replayed" when a settle-up with this `clientId` is already on this trip. */
export const settleUp = async (userId: string, tripId: string, body: SettleBody & { clientId?: string }): Promise<"saved" | "replayed"> => {
    const { clientId, ...settle } = body;
    const earlier = async (session: ClientSession | null) => {
        if (!clientId) return "none" as const;
        const row = await Transaction.findOne({ userId, clientId }).select("tripId tripExpenseId").session(session).lean();
        if (!row) return "none" as const;
        return String(row.tripId) === tripId.toLowerCase() && !row.tripExpenseId ? "same" as const : "other" as const;
    };
    const duplicate = () => new AppError(409, MESSAGES.duplicateGeneric, { code: "duplicate" });
    try {
        return await inTransaction(async (session) => {
            const trip = await claimTrip(userId, tripId, session);
            const seen = await earlier(session);
            if (seen === "same") return "replayed" as const;
            if (seen === "other") throw duplicate();
            await settleIn(session, userId, trip, settle, clientId);
            return "saved" as const;
        });
    }
    catch (e) {
        // Two sends of one clientId at once: the second meets the first's row on the index.
        if (isDuplicateKey(e) && clientId) {
            const seen = await earlier(null);
            if (seen === "same") return "replayed";
            throw duplicate();
        }
        throw e;
    }
};

/** Closes a trip. Balances in `letGo` are cleared (see planLetGo); the rest stay on each
 *  person's account, to be settled whenever. The claim (status active → closed) and the
 *  balances it lets go are one transaction, so a second close lets nobody go twice. */
export const closeTrip = (userId: string, tripId: string, letGo: string[]) =>
    inTransaction(async (session) => {
        const now = new Date();
        const trip = await Trip.findOneAndUpdate({ _id: tripId, userId, status: "active" }, { $set: { status: "closed", closedAt: now } }, { session, new: true });
        if (!trip) {
            if (await Trip.exists({ _id: tripId, userId }).session(session)) throw AppError.conflict(ALREADY_CLOSED);
            throw tripNotFound();
        }
        const members = trip.members.map(String);
        const people = [...new Set(letGo.map((p) => p.toLowerCase()))];
        const stranger = letGo.findIndex((p) => !members.includes(p.toLowerCase()));
        if (stranger >= 0) throw AppError.invalidReference(`letGo.${stranger}`, "A person to let go", ON_TRIP);

        const txns = await Transaction.find({ userId, tripId: trip._id }).select("type amount account toAccount").session(session).lean();
        const balances = memberBalances(txns.map((t) => ({ type: t.type, amount: t.amount, account: String(t.account), toAccount: t.toAccount ? String(t.toAccount) : null })), members);
        const named = await Account.find({ _id: { $in: people }, userId }).select("name").session(session).lean();
        const nameOf = new Map(named.map((p) => [String(p._id), p.name]));
        const rows: LedgerRow[] = [];
        for (const person of people) {
            const row = planLetGo(person, nameOf.get(person) ?? "them", balances.get(person) ?? 0, now);
            if (row) rows.push(row);
        }
        await writeRows(userId, trip._id as Oid, null, rows, session);
    });

/** Reopening an active trip is a no-op that answers like the first reopen. */
export const reopenTrip = async (userId: string, tripId: string) => {
    const trip = await Trip.findOneAndUpdate({ _id: tripId, userId }, { $set: { status: "active", closedAt: null } });
    if (!trip) throw tripNotFound();
};

// ---- Matching Splitwise's simplified debts ---------------------------------------------------

const toTxn = (t: { type: string; amount: number; account: unknown; toAccount?: unknown }) =>
    ({ type: t.type, amount: t.amount, account: String(t.account), toAccount: t.toAccount ? String(t.toAccount) : null });

const signatureOf = (expenses: { _id: unknown; cost: number; paidBy?: unknown; shares: { account?: unknown; amount: number }[] }[]) =>
    expensesSignature(expenses.map((e) => ({
        id: String(e._id),
        cost: e.cost,
        paidBy: e.paidBy ? String(e.paidBy) : null,
        shares: e.shares.map((s) => ({ account: s.account ? String(s.account) : null, amount: s.amount })),
    })));

/** Takes a plan's adjustments back out, leaving every balance as the exact ledger has it. */
const removeReroutes = async (userId: string, tripId: Oid, session: ClientSession) => {
    const rows = await Transaction.find({ userId, tripId, clientId: { $regex: `^${PLAN_PREFIX}` } }).session(session);
    for (const row of rows) {
        await applyEffects(row, "revert", session);
        await row.deleteOne({ session });
    }
};

/** Saves what each person actually pays you. Replaces any earlier plan rather than adding to
 *  it, and is allowed on a closed trip — balances stay open to be settled after closing. The
 *  trip, its rows and its expenses are read inside the transaction it writes in. */
export const savePlan = (userId: string, tripId: string, entries: PlanEntry[]) =>
    inTransaction(async (session) => {
        const trip = await claimTrip(userId, tripId, session);
        const members = trip.members.map(String);
        const plan = entries.map((e) => ({ account: e.account.toLowerCase(), amount: e.amount }));
        const stranger = plan.findIndex((e) => !members.includes(e.account));
        if (stranger >= 0) throw AppError.invalidReference(`entries.${stranger}.account`, "A person in the plan", ON_TRIP);
        const txns = await Transaction.find({ userId, tripId: trip._id }).session(session).lean();
        const expenses = await TripExpense.find({ userId, tripId: trip._id }).session(session).lean();
        // Without any earlier plan's adjustments: the plan is measured against the ledger itself.
        const exact = memberBalances(txns.filter((t) => !isReroute(t)).map(toTxn), members);
        const problem = validatePlan(plan, members, exact);
        if (problem) throw invalidInput("entries", problem);

        await removeReroutes(userId, trip._id as Oid, session);
        await writeRows(userId, trip._id as Oid, null, planReroute(String(trip._id), plan, exact, new Date()), session);
        trip.plan = {
            savedAt: new Date(),
            entries: plan.map((e) => ({ account: oid(e.account), amount: e.amount })),
            signature: signatureOf(expenses),
        };
        await trip.save({ session });
    });

/** Back to the exact amounts. */
export const clearPlan = (userId: string, tripId: string) =>
    inTransaction(async (session) => {
        const trip = await claimTrip(userId, tripId, session);
        await removeReroutes(userId, trip._id as Oid, session);
        await Trip.updateOne({ _id: trip._id }, { $unset: { plan: 1 } }, { session });
    });

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

type LeanTxn = { _id: Oid; clientId?: string | null; type: string; amount: number; account: Oid; toAccount?: Oid | null; category?: Oid | null; title?: string | null; note?: string | null; occurredAt: Date; tripId?: Oid | null; tripExpenseId?: Oid | null };

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
        Account.find({ _id: { $in: trip.members }, userId }).select("name").lean(),
    ]);
    const { totals, balances } = totalsFor(trip, txns, expenses as unknown as ITripExpense[]);
    const nameOf = new Map(people.map((p) => [String(p._id), p.name]));
    // A plan's adjustments are bookkeeping, not events on the trip: they show as each person's
    // routed amount, not as journal entries.
    const exactBalances = memberBalances(txns.filter((t) => !isReroute(t)).map(toTxn), trip.members.map(String));
    const plan: TripPlan | null = trip.plan
        ? {
            savedAt: new Date(trip.plan.savedAt).toISOString(),
            stale: trip.plan.signature !== signatureOf(expenses),
            entries: trip.plan.entries.map((e) => ({ account: String(e.account), amount: e.amount })),
        }
        : null;

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
        ...txns.filter((t) => !t.tripExpenseId && !isReroute(t)).map((t) => {
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
        members: trip.members.map((m) => {
            const balance = balances.get(String(m)) ?? 0;
            const exact = exactBalances.get(String(m)) ?? 0;
            return { account: String(m), name: nameOf.get(String(m)) ?? "Someone", balance, exact, routed: balance - exact };
        }),
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
        plan,
    };
};
