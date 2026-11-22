import { Request, Response } from "express";
import mongoose from "mongoose";
import type { Valid } from "../middleware/validate";
import {
    bulkConvertToInvestmentRequest, convertToInvestmentRequest, createTransactionRequest, listTransactionsRequest,
    transactionIdRequest, transactionSummaryRequest, updateTransactionRequest,
} from "../schemas/transactionSchema";
import Account from "../models/Account";
import { AppError } from "../utils/AppError";
import Transaction, { type ITransaction } from "../models/Transaction";
import { applyEffects, changes, editedFields, requireLiveAccounts, resplit } from "../services/transactionService";
import { requireCategory } from "../services/ownership";
import { checkBudgetAlerts } from "../services/budgetAlertService";
import * as reply from "../utils/response";
import { picksTrips, resolveTransactionFilter, summaryTotals, TRIPS_CATEGORY, type SummaryGroup, type TransactionFilters } from "../services/transactionFilter";
import { entryStages } from "../services/tripEntries";
import { resolveZone } from "../utils/userZone";
import type { PipelineStage } from "mongoose";
import { inTransaction } from "../utils/inTransaction";
import { conflict, notFound } from "../utils/messages";
import { toDTO, toDTOs } from "../utils/dto";
import { pageOf, paginate } from "../utils/paginate";

const TRIP_ROW = conflict("This is part of a trip expense", "Change it from the trip");
const SPLIT_ROW = conflict("This expense is part of a split", "Remove it from the split first");
const SPLIT_MEMBER = conflict("This is part of a split", "Change the date or account on the expense itself");
const ONLY_EXPENSE = conflict("Only an expense can be converted to an investment");
const JUST_CHANGED = conflict("This entry was just changed", "Reload it and try again");

const missing = () => AppError.notFound(notFound("transaction"));

/** The filter half of "only if nobody changed it since I read it". */
const unchangedSince = (row: ITransaction) => ({ updatedAt: (row as unknown as { updatedAt?: Date }).updatedAt ?? null });

const isDuplicateKey = (e: unknown): boolean => (e as { code?: number } | null)?.code === 11000;

// POST /transactions never answers 409. The 2.6.0 app's outbox drops a queued item on ANY 409
// from here as "already saved", so a 409 for another reason would lose a transaction. A
// `clientId` already saved answers 200 with the saved row; every other refusal is a 400.
export const createTransaction = async (req: Request, res: Response): Promise<void> => {
    const { body } = req.valid as Valid<typeof createTransactionRequest>;
    const userId = req.user!.userId;

    // A replay of a send that already landed (the outbox after a lost response). Looked up
    // before any reference check: the first send was accepted, so the answer must not change
    // because, say, its account was archived since.
    const saved = async () => (body.clientId ? Transaction.findOne({ userId, clientId: body.clientId }) : null);
    const earlier = await saved();
    if (earlier) {
        reply.ok(res, toDTO(earlier), "Transaction already saved");
        return;
    }

    // A split expense: `amount` is the user's own share, and each `owedBy` row becomes a
    // transfer into that person's account for what they owe. `owedBy` comes off the body
    // here because it is not a Transaction field — the transfers below are its storage.
    const owedBy = body.type === "expense" ? body.owedBy : undefined;
    const { owedBy: _split, ...fields } = body as typeof body & { owedBy?: unknown };
    if (owedBy) {
        // The set also carries the source, so paying yourself back is caught with the duplicates.
        const people = owedBy.map((row) => row.account.toLowerCase());
        if (new Set([...people, body.account.toLowerCase()]).size !== people.length + 1) {
            throw AppError.badRequest("Each person can be in the split only once");
        }
    }

    // Resolved once, because the budget alert below has to be told which month this
    // spend belongs to and must not re-read the clock to find out.
    const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();

    let created: ITransaction;
    try {
        created = await inTransaction(async (session) => {
            const accounts = await requireLiveAccounts(userId, [
                { path: "account", id: body.account, label: "Account", things: "accounts" },
                ...(body.type === "transfer" ? [{ path: "toAccount", id: body.toAccount, label: "The account it goes to", things: "accounts" }] : []),
                ...(owedBy ?? []).map((row, i) => ({ path: `owedBy.${i}.account`, id: row.account, label: "A person in the split", things: "people", types: ["person"] })),
            ], session);
            if (body.type === "expense" || body.type === "income") await requireCategory(userId, body.category, { kind: body.type, live: true, session });

            // Redeeming (a transfer OUT of a holding) can't take it below zero — a negative
            // holding is meaningless. Banks may overdraw (a pending deposit, a corrected balance).
            const source = accounts.get(body.account.toLowerCase())!;
            const noOverdraw = body.type === "transfer" && source.type === "investment" ? [String(source._id)] : [];
            const splitGroupId = owedBy ? new mongoose.Types.ObjectId() : null;

            const [transaction] = await Transaction.create([{ userId, ...fields, occurredAt, splitGroupId }], { session });
            await applyEffects(transaction, "add", session, { noOverdraw });

            // One transfer per person owed, in the same group and at the same instant, so
            // the whole split stands or falls as one write and reads as one event.
            for (const row of owedBy ?? []) {
                const [transfer] = await Transaction.create([{
                    userId,
                    type: "transfer",
                    amount: row.amount,
                    account: body.account,
                    toAccount: row.account,
                    note: body.type === "expense" ? body.title : undefined,
                    occurredAt,
                    splitGroupId,
                }], { session });
                await applyEffects(transfer, "add", session);
            }
            return transaction;
        });
    }
    catch (e) {
        // Two sends of one `clientId` at once: the second hits the unique index once the first
        // commits. The row is there; answer with it.
        if (isDuplicateKey(e) && body.clientId) {
            const first = await saved();
            if (first) {
                reply.ok(res, toDTO(first), "Transaction already saved");
                return;
            }
            // Never a 409 here (see above): a 500 makes the outbox try again later.
            throw new Error(`clientId ${body.clientId} hit the unique index but no row was found`);
        }
        throw e;
    }

    // After the commit and before the response: only a committed expense can have
    // crossed a budget, and the check never throws (see budgetAlertService).
    if (body.type === "expense") {
        await checkBudgetAlerts(userId, body.category, occurredAt);
    }

    reply.created(res, toDTO(created), "Transaction created");
}

export const filterTransactions = async (req: Request, res: Response): Promise<void> => {
    const { page, limit, ...filters } = (req.valid as Valid<typeof listTransactionsRequest>).query;

    if (filters.trips === "entries") {
        reply.ok(res, await entriesPage(req, filters, page, limit), "Transactions fetched");
        return;
    }
    const found = await paginate(Transaction, await resolveTransactionFilter(req, filters), { page, limit, sort: { occurredAt: -1 } });

    reply.ok(res, { ...found, items: toDTOs(found.items) }, "Transactions fetched");
}

/** The filter as `aggregate` needs it (cast as `find` would), with the Trips category added
 *  back when it was picked. */
const entriesMatch = async (req: Request, filters: TransactionFilters) => {
    const match = Transaction.find().cast(Transaction, await resolveTransactionFilter(req, filters)) as Record<string, unknown>;
    if (picksTrips(filters)) {
        const picked = (match.category as { $in?: unknown[] } | undefined)?.$in ?? [];
        match.category = { $in: [...picked, TRIPS_CATEGORY] };
    }
    return match;
};

/** `trips=entries`: everyday rows and one row per closed trip, newest first, paged on the
 *  server. Everyday rows come back exactly as the other lists send them; a trip row is
 *  `kind: "trip"` with its share, close day and dates, and `_id` "trip-<id>". */
const entriesPage = async (req: Request, filters: TransactionFilters, page: number, limit: number) => {
    const zone = await resolveZone(req);
    const [found] = await Transaction.aggregate<{ items: Record<string, unknown>[]; total: { n: number }[] }>([
        ...entryStages(await entriesMatch(req, filters), zone, filters.search),
        { $sort: { occurredAt: -1, _id: 1 } },
        { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { kind: 1, amount: 1, title: 1, emoji: 1, occurredAt: 1, closedOn: 1, startDate: 1, endDate: 1, tripId: 1, insideMatches: 1 } }], total: [{ $count: "n" }] } },
    ]);
    const rows = found?.items ?? [];
    const ids = rows.filter((r) => r.kind !== "trip").map((r) => r._id);
    const docs = new Map((await Transaction.find({ _id: { $in: ids } })).map((d) => [String(d._id), d]));
    const items = rows.flatMap((r) => {
        if (r.kind === "trip") {
            return [{
                _id: `trip-${String(r.tripId)}`,
                kind: "trip",
                tripId: String(r.tripId),
                type: "expense",
                amount: r.amount,
                title: r.title,
                emoji: r.emoji ?? null,
                category: TRIPS_CATEGORY,
                account: null,
                occurredAt: r.occurredAt,
                closedOn: r.closedOn,
                startDate: r.startDate,
                endDate: r.endDate,
                ...(filters.search ? { insideMatches: r.insideMatches ?? 0 } : {}),
            }];
        }
        const doc = docs.get(String(r._id));
        return doc ? [toDTO(doc)] : [];
    });
    return pageOf(items, page, limit, found?.total[0]?.n ?? 0);
};

// The list's own filter, so the card sits on exactly the rows beneath it. `trips` is applied
// after the sums rather than in the match: the trip line and savings count the trip rows the
// same filters pick. Transfers and adjustments never add to any figure.
export const getTransactionSummary = async (req: Request, res: Response): Promise<void> => {
    const { trips, ...filters } = (req.valid as Valid<typeof transactionSummaryRequest>).query;

    // `aggregate` doesn't cast the way `find` does; this casts the filter exactly as the list's query would.
    // Under `trips=entries` the rows are the list's: everyday rows and each closed trip once.
    const flows = { type: { $in: ["income", "expense"] } };
    const source = trips === "entries"
        ? [...entryStages(await entriesMatch(req, { ...filters, trips }), await resolveZone(req), filters.search), { $match: flows }]
        : [{ $match: { $and: [Transaction.find().cast(Transaction, await resolveTransactionFilter(req, filters)), flows] } }];
    const sums = await Transaction.aggregate<SummaryGroup>([
        ...source,
        { $group: { _id: { type: "$type", trip: { $gt: ["$tripId", null] } }, total: { $sum: "$amount" } } }
    ] as PipelineStage[]);

    reply.ok(res, summaryTotals(sums, trips), "Transaction summary fetched");
}

// The last 12 months only — title vocabulary drifts (old jobs, old shops), and bounding the
// match keeps this cheap on the same {userId, occurredAt} index every other aggregation here
// already relies on, rather than scanning a growing lifetime of rows for a feature that's
// only ever surfacing the recent handful anyway.
const TITLE_SUGGESTION_MONTHS = 12;
const TITLE_SUGGESTION_LIMIT = 150;

export const getTitleSuggestions = async (req: Request, res: Response): Promise<void> => {
    const since = new Date();
    since.setMonth(since.getMonth() - TITLE_SUGGESTION_MONTHS);

    const rows = await Transaction.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(req.user!.userId),
                type: { $in: ["expense", "income"] },
                title: { $type: "string", $ne: "" },
                // A trip's share is a one-off ("AirBnB"), and repeating it from Quick Log
                // would make an everyday expense out of it. Matches a missing field too.
                tripId: null,
                occurredAt: { $gte: since }
            }
        },
        // Newest first, so `$first` below keeps the way the title was spelled most
        // recently — a simpler stand-in for "most common casing" that needs no second
        // grouping pass, and the one a user is more likely to expect repeated anyway.
        { $sort: { occurredAt: -1 } },
        {
            $group: {
                _id: {
                    type: "$type",
                    key: { $toLower: { $trim: { input: "$title" } } },
                    category: "$category"
                },
                title: { $first: "$title" },
                // So a "quick log" chip can prefill and repeat a habitual transaction without
                // a second round trip to resolve which one — same `$first` after the newest-
                // first sort above, so this is the single most recent transaction in the bucket.
                lastAmount: { $first: "$amount" },
                lastTransactionId: { $first: "$_id" },
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } },
        { $limit: TITLE_SUGGESTION_LIMIT }
    ]);

    const suggestions = rows.map((row) => ({
        title: row.title as string,
        type: row._id.type as "expense" | "income",
        category: row._id.category ? (row._id.category as mongoose.Types.ObjectId).toString() : null,
        count: row.count as number,
        lastAmount: row.lastAmount as number,
        lastTransactionId: (row.lastTransactionId as mongoose.Types.ObjectId).toString()
    }));

    reply.ok(res, suggestions, "Title suggestions fetched");
}

export const getTransaction = async (req: Request, res: Response): Promise<void> => {
    const { id } = (req.valid as Valid<typeof transactionIdRequest>).params;

    const transaction = await Transaction.findOne({ _id: id, userId: req.user?.userId });
    if (!transaction) throw missing();

    reply.ok(res, toDTO(transaction), "Transaction fetched");
}

// Everything is read inside the one transaction and every write is conditional on the
// `updatedAt` read there, so two edits at once (or an edit racing other entries on the same
// account) can't revert from a stale copy: the loser is retried from fresh state by MongoDB, or
// answered 409 if the row changed under it. A split expense takes its owed transfers with it
// (gaps row 30, decided as "re-split").
export const updateTransaction = async (req: Request, res: Response): Promise<void> => {
    const { params: { id }, body: patch } = req.valid as Valid<typeof updateTransactionRequest>;
    const userId = req.user!.userId;

    const updated = await inTransaction(async (session) => {
        const row = await Transaction.findOne({ _id: id, userId }).session(session);
        if (!row) throw missing();
        // Part of a trip expense (a share, or what a friend owes on it): changing it here would
        // leave the rest of that expense disagreeing. The trip rewrites all of them together.
        if (row.tripExpenseId) throw AppError.conflict(TRIP_ROW);

        const set = editedFields(row, patch);
        const splitExpense = row.type === "expense" && !!row.splitGroupId;
        if (row.type === "transfer" && row.splitGroupId && (changes(row, set, "account") || changes(row, set, "occurredAt"))) {
            throw AppError.conflict(SPLIT_MEMBER);
        }

        // Only a reference the edit changes is checked: the app sends the category back on
        // every save, and a row filed under a category archived since must stay editable.
        const nextAccount = String(set.account ?? row.account);
        const refs = [
            ...(changes(row, set, "account") ? [{ path: "account", id: nextAccount, label: "Account", things: "accounts" }] : []),
            ...(changes(row, set, "toAccount") ? [{ path: "toAccount", id: String(set.toAccount), label: "The account it goes to", things: "accounts" }] : []),
        ];
        if (refs.length) await requireLiveAccounts(userId, refs, session);
        if (changes(row, set, "category")) {
            await requireCategory(userId, String(set.category), { kind: row.type === "income" ? "income" : "expense", live: true, session });
        }

        let noOverdraw: string[] = [];
        if (row.type === "transfer") {
            const source = await Account.findOne({ _id: nextAccount, userId }).select("type").session(session);
            if (source?.type === "investment") noOverdraw = [String(source._id)];
        }

        const group = splitExpense
            ? await Transaction.find({ userId, splitGroupId: row.splitGroupId, _id: { $ne: row._id }, type: "transfer" }).session(session)
            : [];
        const { share, transfers: groupSets } = resplit(row, set, group);
        if (share !== undefined) set.amount = share;

        await applyEffects(row, "revert", session);
        for (const t of group) await applyEffects(t, "revert", session);

        const saved = await Transaction.findOneAndUpdate(
            { _id: row._id, userId, ...unchangedSince(row) },
            { $set: set },
            { session, new: true, runValidators: true },
        );
        if (!saved) throw AppError.conflict(JUST_CHANGED);
        await applyEffects(saved, "add", session, { noOverdraw });

        for (const [i, t] of group.entries()) {
            const next = Object.keys(groupSets[i]).length
                ? await Transaction.findOneAndUpdate({ _id: t._id, userId, ...unchangedSince(t) }, { $set: groupSets[i] }, { session, new: true, runValidators: true })
                : t;
            if (!next) throw AppError.conflict(JUST_CHANGED);
            await applyEffects(next, "add", session);
        }
        return saved;
    });

    // An edit moves money as surely as a new entry does — raising an amount, or moving
    // one into a different category, can be what crosses the limit.
    if (updated.type === "expense") {
        await checkBudgetAlerts(userId, updated.category, updated.occurredAt);
    }

    reply.ok(res, toDTO(updated), "Transaction updated");
}

// Backward-compat: reclassify an old expense (a SIP logged as spending) as an investment
// contribution. It becomes a transfer into the chosen investment account — the money the
// expense removed from the source stays removed there, but now lands in the investment, so
// net worth rises by that amount and it leaves the spending charts. See docs/architecture
// and the Investments plan.
export const convertToInvestment = async (req: Request, res: Response): Promise<void> => {
    const { params: { id }, body: { toAccount } } = req.valid as Valid<typeof convertToInvestmentRequest>;
    const userId = req.user!.userId;

    const converted = await inTransaction(async (session) => {
        const row = await Transaction.findOne({ _id: id, userId }).session(session);
        if (!row) throw missing();
        if (row.tripExpenseId) throw AppError.conflict(TRIP_ROW);
        if (row.type !== "expense") throw AppError.conflict(ONLY_EXPENSE);
        // A split expense's amount is only the user's own share, and its sibling transfers
        // reference this group — converting it would orphan them.
        if (row.splitGroupId) throw AppError.conflict(SPLIT_ROW);

        const investment = await Account.findOne({ _id: toAccount, userId, type: "investment", isArchived: false }).session(session);
        if (!investment) throw AppError.invalidReference("toAccount", "The investment", "holdings");
        if (String(investment._id) === String(row.account)) throw AppError.badRequest("Pick two different accounts");

        // The claim: only one request can turn this expense into a transfer.
        const claimed = await Transaction.findOneAndUpdate(
            { _id: row._id, userId, type: "expense", ...unchangedSince(row) },
            { $set: { type: "transfer", toAccount: investment._id, category: null } },
            { session, new: true },
        );
        if (!claimed) throw AppError.conflict(ONLY_EXPENSE);
        // Net effect on the source account is zero; the investment gains the amount.
        await applyEffects(row, "revert", session);
        await applyEffects(claimed, "add", session);
        return claimed;
    });

    reply.ok(res, toDTO(converted), "Transaction converted");
}

// The batch form of convertToInvestment, for "move the past payments too" after a SIP is set
// up from a recurring suggestion. Only plain expenses owned by the caller are touched — split
// members and anything already converted are skipped rather than failing the whole batch —
// and all of it lands in one transaction, so it's all or nothing.
export const bulkConvertToInvestment = async (req: Request, res: Response): Promise<void> => {
    const { transactionIds, toAccount } = (req.valid as Valid<typeof bulkConvertToInvestmentRequest>).body;
    const userId = req.user!.userId;

    const converted = await inTransaction(async (session) => {
        const investment = await Account.findOne({ _id: toAccount, userId, type: "investment", isArchived: false }).session(session);
        if (!investment) throw AppError.invalidReference("toAccount", "The investment", "holdings");

        const found = await Transaction.find({
            _id: { $in: transactionIds },
            userId,
            type: "expense",
            splitGroupId: null,
            tripExpenseId: null,
            account: { $ne: investment._id },
        }).session(session);
        // A row whose account no longer exists (older data) is skipped too: there is no source
        // balance to move it out of.
        const live = new Set((await Account.find({ _id: { $in: found.map((t) => t.account) }, userId }).select("_id").session(session).lean()).map((a) => String(a._id)));

        let count = 0;
        for (const row of found.filter((t) => live.has(String(t.account)))) {
            const claimed = await Transaction.findOneAndUpdate(
                { _id: row._id, userId, type: "expense", ...unchangedSince(row) },
                { $set: { type: "transfer", toAccount: investment._id, category: null } },
                { session, new: true },
            );
            if (!claimed) continue;
            await applyEffects(row, "revert", session);
            await applyEffects(claimed, "add", session);
            count += 1;
        }
        return count;
    });

    reply.ok(res, { converted }, "Transactions converted");
}

export const deleteTransaction = async (req: Request, res: Response) : Promise<void> => {
    const { id } = (req.valid as Valid<typeof transactionIdRequest>).params;
    const userId = req.user!.userId;

    await inTransaction(async (session) => {
        const row = await Transaction.findOne({ _id: id, userId }).session(session);
        if (!row) throw missing();
        if (row.tripExpenseId) throw AppError.conflict(TRIP_ROW);

        // Deleting a split's expense takes the whole group with it: transfers left
        // behind would keep claiming the person owes money for a purchase that no
        // longer exists. Deleting one of the transfers alone is still allowed — that
        // is how a person is taken off a split after the fact.
        const ids = row.type === "expense" && row.splitGroupId
            ? (await Transaction.find({ userId, splitGroupId: row.splitGroupId }).select("_id").session(session)).map((t) => t._id)
            : [row._id];

        // Each balance goes back only for a row this request actually deleted.
        let deleted = 0;
        for (const rowId of ids) {
            const gone = await Transaction.findOneAndDelete({ _id: rowId, userId }, { session });
            if (!gone) continue;
            await applyEffects(gone, "revert", session);
            deleted += 1;
        }
        if (deleted === 0) throw missing();
    });

    reply.ok(res, null, "Transaction deleted");
}
