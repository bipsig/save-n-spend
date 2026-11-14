// Restore keeps each `_id` and rewrites only `userId`, so a reference to a document outside
// the backup would point at another user's data once inserted. This lists every reference
// that names nothing in the same backup; the restore then refuses any of them that names a
// document someone else owns.

type Doc = Record<string, unknown>;

export type BackupDocs = {
    preferences: { defaultAccount?: string | null };
    accounts: Doc[];
    categories: Doc[];
    transactions: Doc[];
    budgets: Doc[];
    bills: Doc[];
    goals: Doc[];
    trips?: Doc[];
    tripExpenses?: Doc[];
};

export type Target = "accounts" | "categories" | "trips" | "tripExpenses";
type Source = "transactions" | "bills" | "budgets" | "categories" | "trips" | "tripExpenses";

/** [collection, dotted path (arrays are walked at any step), collection it must name] */
export const REFERENCES: [Source, string, Target][] = [
    ["transactions", "account", "accounts"],
    ["transactions", "toAccount", "accounts"],
    ["transactions", "category", "categories"],
    ["transactions", "tripId", "trips"],
    ["transactions", "tripExpenseId", "tripExpenses"],
    ["bills", "account", "accounts"],
    ["bills", "toInvestment", "accounts"],
    ["bills", "category", "categories"],
    ["budgets", "category", "categories"],
    ["categories", "parent", "categories"],
    ["trips", "members", "accounts"],
    ["trips", "plan.entries.account", "accounts"],
    ["tripExpenses", "tripId", "trips"],
    ["tripExpenses", "category", "categories"],
    ["tripExpenses", "paidBy", "accounts"],
    ["tripExpenses", "paidFrom", "accounts"],
    ["tripExpenses", "shares.account", "accounts"],
];

export type Reference = { collection: string; field: string; id: string; target: Target };

const valuesAt = (value: unknown, steps: string[]): unknown[] => {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value.flatMap((v) => valuesAt(v, steps));
    if (steps.length === 0) return [value];
    if (typeof value !== "object") return [];
    return valuesAt((value as Doc)[steps[0]], steps.slice(1));
};

const key = (id: unknown) => String(id).toLowerCase();

/** Every reference that names nothing in the backup, in a fixed order; empty when all resolve. */
export const unresolvedReferences = (backup: BackupDocs): Reference[] => {
    const docsOf = (name: Source | Target): Doc[] => backup[name] ?? [];
    const ids: Record<Target, Set<string>> = {
        accounts: new Set(docsOf("accounts").map((d) => key(d._id))),
        categories: new Set(docsOf("categories").map((d) => key(d._id))),
        trips: new Set(docsOf("trips").map((d) => key(d._id))),
        tripExpenses: new Set(docsOf("tripExpenses").map((d) => key(d._id))),
    };

    const out: Reference[] = [];
    const defaultAccount = backup.preferences.defaultAccount;
    if (defaultAccount && !ids.accounts.has(key(defaultAccount))) {
        out.push({ collection: "preferences", field: "defaultAccount", id: String(defaultAccount), target: "accounts" });
    }
    for (const [collection, field, target] of REFERENCES) {
        const steps = field.split(".");
        for (const doc of docsOf(collection)) {
            for (const id of valuesAt(doc, steps)) {
                if (!ids[target].has(key(id))) out.push({ collection, field, id: String(id), target });
            }
        }
    }
    return out;
};
