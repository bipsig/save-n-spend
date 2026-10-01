// Reading a Splitwise group export. Pure, so it's tested against a real file.
//
// The format (one row per expense, a column per person):
//
//   Date,Description,Category,Cost,Currency,<Person A>,<Person B>,…
//   2025-12-07,Munnar Stay,General,11877.00,INR,9501.60,-2375.40,…
//   …
//   2026-09-27,Total balance, , ,INR,1952.00,3642.40,…
//
// Each person's number is that row's effect on their balance: positive = they paid more than
// their share (the payer), negative = their share (they owe it). So for you, on one row:
//   negative → your share is that amount, paid by whoever is positive
//   positive → you paid; your share is cost − that amount
//   all zero → it touches nobody's balance (someone's own expense logged in the group)
// "Payment" rows are settle-ups: the payer's column is positive, the receiver's negative.

export type SplitwiseTable = {
    people: string[];
    rows: SplitwiseRow[];
    /** The "Total balance" line, per person, in paise — used to check the result. */
    totals: Record<string, number> | null;
};

export type SplitwiseRow = {
    /** 1-based line in the file, for messages. */
    line: number;
    date: string;
    description: string;
    category: string;
    /** Paise. */
    cost: number;
    currency: string;
    /** Per person, paise. */
    effects: Record<string, number>;
};

/** Rupees with up to two decimals → integer paise. */
const toPaise = (value: string): number => Math.round(Number(value.trim() || "0") * 100);

/** Splits one CSV line, honouring quotes ("Dinner, drinks" stays one field). */
const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') quoted = false;
            else cur += ch;
        }
        else if (ch === '"') quoted = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
    }
    out.push(cur);
    return out;
};

export class SplitwiseFormatError extends Error {}

const REQUIRED = ["date", "description", "category", "cost", "currency"];

export const parseSplitwiseCsv = (text: string): SplitwiseTable => {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/);
    const headerAt = lines.findIndex((l) => l.trim().length > 0);
    if (headerAt < 0) throw new SplitwiseFormatError("The file is empty");
    const header = splitLine(lines[headerAt]).map((h) => h.trim());
    const lower = header.map((h) => h.toLowerCase());
    if (!REQUIRED.every((r, i) => lower[i] === r)) {
        throw new SplitwiseFormatError("This doesn't look like a Splitwise export — it should start with Date, Description, Category, Cost, Currency");
    }
    const people = header.slice(5).filter(Boolean);
    if (people.length < 2) throw new SplitwiseFormatError("No people found in the file");

    const rows: SplitwiseRow[] = [];
    let totals: Record<string, number> | null = null;
    for (let i = headerAt + 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cells = splitLine(lines[i]);
        const effects: Record<string, number> = {};
        people.forEach((p, j) => { effects[p] = toPaise(cells[5 + j] ?? "0"); });
        const description = (cells[1] ?? "").trim();
        if (description.toLowerCase() === "total balance") {
            totals = effects;
            continue;
        }
        const cost = toPaise(cells[3] ?? "0");
        if (!/^\d{4}-\d{2}-\d{2}/.test((cells[0] ?? "").trim()) || !(cost > 0)) {
            throw new SplitwiseFormatError(`Line ${i + 1} couldn't be read`);
        }
        rows.push({
            line: i + 1,
            date: cells[0].trim().slice(0, 10),
            description,
            category: (cells[2] ?? "").trim(),
            cost,
            currency: (cells[4] ?? "").trim(),
            effects,
        });
    }
    return { people, rows, totals };
};

export type RowKind =
    /** A friend paid; your share is spending, charged to them. */
    | "friendPaid"
    /** You paid; your share is spending and the others owe you theirs. */
    | "youPaid"
    /** Someone paid you back (received), or you paid someone (paid). */
    | "settlement"
    /** A payment between two other people. */
    | "othersPayment"
    /** An expense you're not part of. */
    | "notYours"
    /** Moves nobody's balance — someone's own expense logged in the group. */
    | "noEffect"
    /** More than one payer, or anything else this can't read with confidence. */
    | "unclear";

export type ClassifiedRow = SplitwiseRow & {
    kind: RowKind;
    /** Your share (spending), paise. 0 for rows that aren't spending. */
    myShare: number;
    /** Who paid (a person name from the file), for friendPaid/youPaid (you) and settlements. */
    payer: string | null;
    /** Everyone's share, from their effect: payer's share is cost − their positive effect. */
    shares: Record<string, number>;
    /** Settlements: who you settled with, and which way the money went. */
    counterparty?: string;
    direction?: "received" | "paid";
};

const EPS = 1; // paise — rounding in the export

/** What one row means for `me` (a name from the file's header). */
export const classifyRow = (row: SplitwiseRow, me: string): ClassifiedRow => {
    const mine = row.effects[me] ?? 0;
    const others = Object.entries(row.effects).filter(([p]) => p !== me);
    const positives = Object.entries(row.effects).filter(([, v]) => v > EPS);
    const base = { ...row, myShare: 0, payer: null as string | null, shares: {} as Record<string, number> };

    if (row.category.toLowerCase() === "payment") {
        if (Math.abs(mine) <= EPS) return { ...base, kind: "othersPayment" };
        const other = others.find(([, v]) => Math.abs(v) > EPS)?.[0];
        // The payer's column is positive: if yours is negative, they paid you.
        return { ...base, kind: "settlement", counterparty: other, direction: mine < 0 ? "received" : "paid", payer: mine < 0 ? other ?? null : me };
    }

    if (Object.values(row.effects).every((v) => Math.abs(v) <= EPS)) return { ...base, kind: "noEffect" };
    if (positives.length !== 1) return { ...base, kind: "unclear" };

    const [payer, payerEffect] = positives[0];
    const shares: Record<string, number> = {};
    for (const [p, v] of Object.entries(row.effects)) {
        shares[p] = p === payer ? row.cost - payerEffect : Math.max(0, -v);
    }
    if (payer === me) return { ...base, kind: "youPaid", payer, shares, myShare: shares[me] };
    if (Math.abs(mine) <= EPS) return { ...base, kind: "notYours", payer, shares };
    return { ...base, kind: "friendPaid", payer, shares, myShare: shares[me] };
};

/** A stable fingerprint of a row, so importing the same file again skips what's already in. */
export const rowKey = (row: SplitwiseRow): string =>
    [row.date, row.description.toLowerCase(), row.cost, row.category.toLowerCase()].join("|");

/** Your net balance from the classified rows — should equal the file's own total for you. */
export const netBalance = (rows: ClassifiedRow[], me: string): number =>
    rows.reduce((sum, r) => sum + (r.kind === "notYours" || r.kind === "othersPayment" ? 0 : r.effects[me] ?? 0), 0);

// Categories: Splitwise's own are mostly "General", so the description is the better guide.
const HINTS: [RegExp, string][] = [
    [/\b(stay|hotel|hostel|zostel|resort|room|airbnb|homestay|lodge)\b/i, "stay"],
    [/\b(food|dinner|lunch|breakfast|cafe|café|snacks?|restaurant|dominos|pizza|swiggy|zomato|meal|drinks?|bar|popcorn|chai|coffee)\b/i, "food"],
    [/\b(cab|taxi|uber|ola|auto|bus|train|flight|fuel|petrol|scooty|scooter|bike|car|rent a|toll|parking|ferry|boat)\b/i, "transport"],
    [/\b(ticket|entry|movie|trek|tour|park|museum|show|activity|fee)\b/i, "activities"],
    [/\b(shopping|souvenir|clothes|gift)\b/i, "shopping"],
];

/** A coarse hint from the description ("stay", "food", …), or null. The caller maps it onto
 *  the user's own categories. */
export const categoryHint = (description: string, splitwiseCategory: string): string | null => {
    for (const [re, hint] of HINTS) if (re.test(description)) return hint;
    const c = splitwiseCategory.toLowerCase();
    if (/hotel|rent/.test(c)) return "stay";
    if (/dining|groceries|food/.test(c)) return "food";
    if (/taxi|transport|car|bus|fuel|parking/.test(c)) return "transport";
    if (/movies|entertainment|games|sports/.test(c)) return "activities";
    return null;
};
