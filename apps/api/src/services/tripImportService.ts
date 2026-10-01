import mongoose from "mongoose";
import Account from "../models/Account";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import Trip from "../models/Trip";
import TripExpense from "../models/TripExpense";
import User from "../models/User";
import { AppError } from "../utils/AppError";
import { SplitwiseFormatError, categoryHint, classifyRow, netBalance, parseSplitwiseCsv, rowKey, type ClassifiedRow } from "./splitwiseCsv";
import { addTripExpense, settleUp, updateTripExpense } from "./tripService";

// Importing a Splitwise group export into a live trip. Two steps, nothing saved in the first:
//
//   preview — reads the file, lines names up with your people, and sorts every row into what it
//             means for you (see ReviewRow.status), with a suggested category.
//   commit  — applies only what you approved, as ordinary trip expenses and settle-ups, each
//             marked with the row's fingerprint so importing the file again adds only new rows.

/** A name in the file → "me", one of your person accounts, or "new" (create them). */
export type NameMapping = Record<string, string>;

export type ReviewStatus =
    | "ready"          // a friend paid; your share becomes spending, charged to them
    | "matchesYours"   // you paid, and it lines up with what you logged yourself — apply the split
    | "pickAccount"    // you paid, nothing of yours matches — which account did it come from?
    | "lump"           // a friend paid a lump ("Munnar expense") — keep as one, or break it down
    | "settlement"     // someone paid you back, or you paid them — which account?
    | "isThisYours"    // touches nobody's balance; off unless you say it's yours
    | "alreadyIn"      // imported before
    | "skipped";       // you're not in it, or it's between others

export type ReviewRow = {
    key: string;
    line: number;
    date: string;
    title: string;
    splitwiseCategory: string;
    cost: number;
    status: ReviewStatus;
    /** Your share (spending), paise. */
    myShare: number;
    /** Who paid: "me" or a person account id (or a name still to be created). */
    payer: string | null;
    suggestedCategory: string | null;
    /** matchesYours: the trip expenses of yours this row's split would apply to. */
    matches?: { id: string; title: string; cost: number }[];
    /** settlement */
    direction?: "received" | "paid";
    counterparty?: string | null;
    reason?: string;
};

export type Preview =
    | { needsMapping: true; people: string[]; suggested: NameMapping }
    | { needsMapping: false; rows: ReviewRow[]; myShare: number; balance: number; fileBalance: number | null; matchesFile: boolean };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Best guess at who's who: you by your account name, friends by their person account's name. */
const suggestMapping = (people: string[], myName: string, persons: { _id: string; name: string }[]): NameMapping => {
    const out: NameMapping = {};
    const me = norm(myName);
    const first = (s: string) => norm(s.split(/\s+/)[0] ?? s);
    for (const p of people) {
        if (norm(p) === me || (first(p) && first(p) === first(myName))) { out[p] = "me"; continue; }
        const hit = persons.find((a) => norm(a.name) === norm(p)) ?? persons.find((a) => first(a.name) === first(p));
        out[p] = hit ? hit._id : "new";
    }
    return out;
};

/** Maps a coarse hint ("stay", "food", …) onto one of the user's own expense categories. */
const categoryFinder = (cats: { _id: mongoose.Types.ObjectId; name: string }[], history: Map<string, string>) => {
    const byWords: Record<string, RegExp> = {
        stay: /stay|hotel|accommodation|lodging|rent|travel/i,
        food: /food|dining|restaurant|eat|meal|cafe/i,
        transport: /transport|cab|taxi|travel|fuel|commute/i,
        activities: /entertainment|activit|movie|event|fun|leisure/i,
        shopping: /shopping/i,
    };
    return (title: string, splitwiseCategory: string): string | null => {
        const seen = history.get(title.trim().toLowerCase());
        if (seen) return seen;
        const hint = categoryHint(title, splitwiseCategory);
        if (!hint) return null;
        return String(cats.find((c) => byWords[hint].test(c.name))?._id ?? "") || null;
    };
};

const readFile = (csv: string) => {
    try {
        return parseSplitwiseCsv(csv);
    }
    catch (err) {
        if (err instanceof SplitwiseFormatError) throw AppError.badRequest(err.message);
        throw err;
    }
};

export const previewImport = async (userId: string, tripId: string, csv: string, mapping?: NameMapping): Promise<Preview> => {
    const trip = await Trip.findOne({ _id: tripId, userId });
    if (!trip) throw AppError.notFound("Trip not found");
    if (trip.status === "closed") throw AppError.badRequest("This trip is closed — reopen it to import");
    const table = readFile(csv);

    if (!mapping) {
        const [user, persons] = await Promise.all([
            User.findById(userId).select("name").lean(),
            Account.find({ userId, type: "person", isArchived: false }).select("name").lean(),
        ]);
        return {
            needsMapping: true,
            people: table.people,
            suggested: suggestMapping(table.people, user?.name ?? "", persons.map((p) => ({ _id: String(p._id), name: p.name }))),
        };
    }

    const me = Object.entries(mapping).find(([, v]) => v === "me")?.[0];
    if (!me) throw AppError.badRequest("Pick which name is you");

    const [expenses, cats, recent, importedSettlements, persons] = await Promise.all([
        TripExpense.find({ userId, tripId: trip._id }).lean(),
        Category.find({ userId, kind: "expense", isArchived: false }).select("name").lean(),
        Transaction.find({ userId, type: "expense", category: { $ne: null } }).sort({ occurredAt: -1 }).limit(400).select("title category").lean(),
        Transaction.find({ userId, tripId: trip._id, clientId: { $regex: `^sw:${tripId}:` } }).select("clientId").lean(),
        Account.find({ userId, type: "person" }).select("name").lean(),
    ]);
    // A settle-up reads as "Priya paid you", in your names — Splitwise's own description is in
    // the file's ("Friend C paid You M.").
    const personName = new Map(persons.map((p) => [String(p._id), p.name]));
    const settlementTitle = (fileName: string | null | undefined, direction: "received" | "paid" | undefined) => {
        const name = (fileName && personName.get(mapping[fileName] ?? "")) ?? fileName ?? "Someone";
        return direction === "paid" ? `You paid ${name}` : `${name} paid you`;
    };
    const history = new Map<string, string>();
    for (const t of recent) if (t.title && !history.has(t.title.trim().toLowerCase())) history.set(t.title.trim().toLowerCase(), String(t.category));
    const findCategory = categoryFinder(cats, history);
    const importedKeys = new Set([
        ...expenses.map((e) => e.importKey).filter(Boolean) as string[],
        ...importedSettlements.map((t) => (t.clientId ?? "").replace(`sw:${tripId}:`, "")),
    ]);
    // Your own unsplit entries — what a "you paid" row can be applied to.
    const mine = expenses.filter((e) => e.source === "manual" && e.paidBy === null && e.shares.every((s) => s.account === null));
    const used = new Set<string>();

    const classified = table.rows.map((r) => classifyRow(r, me));
    const rows: ReviewRow[] = classified.map((r: ClassifiedRow) => {
        const key = rowKey(r);
        const base = {
            key, line: r.line, date: r.date, title: r.description, splitwiseCategory: r.category, cost: r.cost,
            myShare: r.myShare,
            payer: r.payer ? (mapping[r.payer] ?? r.payer) : null,
            suggestedCategory: findCategory(r.description, r.category),
        };
        if (importedKeys.has(key)) return { ...base, status: "alreadyIn" as const };
        switch (r.kind) {
            case "notYours": return { ...base, status: "skipped" as const, reason: "You're not in this one" };
            case "othersPayment": return { ...base, status: "skipped" as const, reason: "A payment between others" };
            case "unclear": return { ...base, status: "skipped" as const, reason: "More than one person paid — add it by hand" };
            case "noEffect": return { ...base, status: "isThisYours" as const };
            case "settlement": return { ...base, title: settlementTitle(r.counterparty, r.direction), status: "settlement" as const, direction: r.direction, counterparty: r.counterparty ? mapping[r.counterparty] ?? null : null };
            case "youPaid": {
                // One entry of yours for the same amount, else all your unsplit entries if they
                // add up to it (a lump you logged in detail).
                const single = mine.find((e) => !used.has(String(e._id)) && Math.abs(e.cost - r.cost) <= 100);
                if (single) {
                    used.add(String(single._id));
                    return { ...base, status: "matchesYours" as const, matches: [{ id: String(single._id), title: single.title, cost: single.cost }] };
                }
                const rest = mine.filter((e) => !used.has(String(e._id)));
                const sum = rest.reduce((s, e) => s + e.cost, 0);
                if (rest.length > 1 && Math.abs(sum - r.cost) <= 100) {
                    rest.forEach((e) => used.add(String(e._id)));
                    return { ...base, status: "matchesYours" as const, matches: rest.map((e) => ({ id: String(e._id), title: e.title, cost: e.cost })) };
                }
                return { ...base, status: "pickAccount" as const };
            }
            default: {
                // A friend paid. A vague title with no category guess reads as a lump.
                const vague = /\b(expense|expenses|misc|other|stuff|everything|group)\b/i.test(r.description);
                return { ...base, status: (vague && !base.suggestedCategory ? "lump" : "ready") as ReviewStatus };
            }
        }
    });

    const counted = classified.filter((r) => !importedKeys.has(rowKey(r)));
    const fileBalance = table.totals?.[me] ?? null;
    const balance = netBalance(classified, me);
    return {
        needsMapping: false,
        rows,
        myShare: counted.reduce((s, r) => s + r.myShare, 0),
        balance,
        fileBalance,
        matchesFile: fileBalance === null || Math.abs(balance - fileBalance) <= 100,
    };
};

export type Decision = {
    key: string;
    /** import it, skip it, or (matchesYours) apply its split to your own entries. */
    action: "import" | "skip" | "apply";
    category?: string | null;
    title?: string;
    /** pickAccount / isThisYours: where you paid from. settlement: where it went or came from. */
    account?: string | null;
    /** lump: its parts. Shares are split in the row's own proportions. */
    parts?: { title: string; category: string | null; cost: number }[];
};

/** Splits `amount` in the same proportions as `ratios` (keys → weights), to the paisa. */
const proportional = (amount: number, ratios: [string, number][]): Map<string, number> => {
    const total = ratios.reduce((s, [, w]) => s + w, 0);
    const out = new Map<string, number>();
    let assigned = 0;
    ratios.forEach(([k, w], i) => {
        const v = i === ratios.length - 1 ? amount - assigned : Math.floor((amount * w) / total);
        out.set(k, v);
        assigned += v;
    });
    return out;
};

export const commitImport = async (
    userId: string, tripId: string, csv: string, mapping: NameMapping, decisions: Decision[],
): Promise<{ added: number; applied: number; settled: number }> => {
    const trip = await Trip.findOne({ _id: tripId, userId });
    if (!trip) throw AppError.notFound("Trip not found");
    if (trip.status === "closed") throw AppError.badRequest("This trip is closed — reopen it to import");
    const table = readFile(csv);
    const me = Object.entries(mapping).find(([, v]) => v === "me")?.[0];
    if (!me) throw AppError.badRequest("Pick which name is you");

    // Names mapped to "new" become person accounts, and everyone mapped joins the trip.
    const resolved: Record<string, string | null> = {};
    for (const [name, target] of Object.entries(mapping)) {
        if (target === "me") { resolved[name] = null; continue; }
        if (target === "new") {
            const created = await Account.create({ userId, name, type: "person", balance: 0, startingBalance: 0, icon: "person", color: "info" });
            resolved[name] = String(created._id);
        }
        else resolved[name] = target;
    }
    const memberSet = new Set(trip.members.map(String));
    let joined = false;
    for (const acc of Object.values(resolved)) {
        if (acc && !memberSet.has(acc)) { memberSet.add(acc); joined = true; }
    }
    if (joined) {
        trip.members = [...memberSet].map((m) => new mongoose.Types.ObjectId(m));
        await trip.save();
    }

    const byKey = new Map(table.rows.map((r) => [rowKey(r), classifyRow(r, me)]));
    const sharesOf = (r: ClassifiedRow) => Object.entries(r.shares).filter(([, v]) => v > 0);
    let added = 0; let applied = 0; let settled = 0;

    for (const d of decisions) {
        if (d.action === "skip") continue;
        const r = byKey.get(d.key);
        if (!r) continue;
        const title = (d.title ?? r.description).trim() || r.description;
        const occurredAt = new Date(`${r.date}T12:00:00Z`);

        if (r.kind === "settlement") {
            const person = r.counterparty ? resolved[r.counterparty] : null;
            if (!person || !d.account) continue;
            // Fingerprinted (settle-ups aren't trip expenses, so they carry it as clientId).
            await settleUp(userId, tripId, { person, account: d.account, amount: r.cost, direction: r.direction ?? "received", occurredAt }, `sw:${tripId}:${d.key}`);
            settled++;
            continue;
        }

        if (r.kind === "noEffect") {
            if (!d.account) continue;
            await addTripExpense(userId, tripId, { title, occurredAt, category: d.category ?? null, cost: r.cost, paidBy: null, paidFrom: d.account, shares: [{ account: null, amount: r.cost }] }, { source: "splitwise", importKey: d.key });
            added++;
            continue;
        }

        if (d.action === "apply" && r.kind === "youPaid") {
            // Your own entries keep their detail; they take on this row's split.
            const ids = (await previewMatches(userId, tripId, r.cost));
            const ratios = sharesOf(r).map(([name, v]) => [resolved[name] ?? "me", v] as [string, number]);
            for (const e of ids) {
                const parts = proportional(e.cost, ratios);
                await updateTripExpense(userId, tripId, String(e._id), {
                    title: e.title, occurredAt: e.occurredAt, category: e.category ? String(e.category) : null,
                    cost: e.cost, paidBy: null, paidFrom: e.paidFrom ? String(e.paidFrom) : null,
                    shares: [...parts].map(([k, amount]) => ({ account: k === "me" ? null : k, amount })),
                });
                await TripExpense.updateOne({ _id: e._id }, { $set: { importKey: d.key } });
                applied++;
            }
            continue;
        }

        if (r.kind !== "friendPaid" && r.kind !== "youPaid") continue;
        const paidBy = r.kind === "friendPaid" ? resolved[r.payer as string] : null;
        if (r.kind === "youPaid" && !d.account) continue;
        const pieces = d.parts?.length ? d.parts : [{ title, category: d.category ?? null, cost: r.cost }];
        const ratios = sharesOf(r).map(([name, v]) => [name, v] as [string, number]);
        for (const piece of pieces) {
            const split = proportional(piece.cost, ratios);
            await addTripExpense(userId, tripId, {
                title: piece.title || title,
                occurredAt,
                category: piece.category,
                cost: piece.cost,
                paidBy: paidBy ?? null,
                paidFrom: r.kind === "youPaid" ? d.account ?? null : null,
                shares: [...split].map(([name, amount]) => ({ account: resolved[name] ?? null, amount })),
            }, { source: "splitwise", importKey: d.key });
            added++;
        }
    }
    return { added, applied, settled };
};

/** The same "your entries" match the preview offered, re-derived at commit time. */
const previewMatches = async (userId: string, tripId: string, cost: number) => {
    const mine = await TripExpense.find({ userId, tripId, source: "manual", paidBy: null, importKey: null }).lean();
    const unsplit = mine.filter((e) => e.shares.every((s) => s.account === null));
    const single = unsplit.find((e) => Math.abs(e.cost - cost) <= 100);
    if (single) return [single];
    const sum = unsplit.reduce((s, e) => s + e.cost, 0);
    return unsplit.length > 1 && Math.abs(sum - cost) <= 100 ? unsplit : [];
};
