/**
 * Read-only invariant check (I1–I7, I14, I15 from .audit/idempotency-audit.md).
 *
 *   npm run check:invariants --workspace=apps/api                       dev database, every user
 *   ... -- --user someone@example.test                                  one user (exit 1 if it has problems)
 *   ... -- --json .audit/guards/invariants/dev.json                     also save the result
 *   ... -- --db save-n-spend-prod --prod-readonly                       prod, read-only (ask Sagnik first)
 *
 * Only `find` and `countDocuments` are ever called. Document counts are taken before and after
 * and must match. Prints problems per user; exits 1 when a user that isn't on the ignore list
 * (or the --user given) has any.
 */
import path from "path";
import dotenv from "dotenv";
import { MongoClient, type Db } from "mongodb";
import { buildUri } from "../src/config/db";
import { checkUser, type Problem, type UserData } from "./invariants/rules";
import { writeJson } from "./guards/lib";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const DEV_DB = "save-n-spend-dev";
export const PROD_DB = "save-n-spend-prod";
/** Corrupted on purpose: the idempotency audit's user, and the replay guard's throwaway users
 *  (its race tests leave drift until R1 lands). Listed, never counted. */
export const KNOWN_CORRUPT = ["idem-audit@example.test"];
const isKnownCorrupt = (email: string) => KNOWN_CORRUPT.includes(email) || /^w0-replay-.*@example\.test$/.test(email);

const COLLECTIONS = ["users", "accounts", "transactions", "categories", "goals", "goalcontributionlogs", "bills", "budgets", "trips", "tripexpenses"] as const;

/** The only two operations this script can run. */
const readOnly = (db: Db) => (name: (typeof COLLECTIONS)[number]) => {
    const c = db.collection(name);
    return {
        find: <T>(q: Record<string, unknown> = {}) => c.find(q).toArray() as unknown as Promise<T[]>,
        count: (q: Record<string, unknown> = {}) => c.countDocuments(q),
    };
};

export const pickDb = (args: { db?: string; prodReadonly?: boolean }): string => {
    const db = args.db ?? DEV_DB;
    if (db === DEV_DB) return db;
    if (db === PROD_DB && args.prodReadonly) return db;
    if (db === PROD_DB) throw new Error("Refusing prod without --prod-readonly (and Sagnik's go-ahead)");
    throw new Error(`Refusing unknown database "${db}"`);
};

export type UserReport = { email: string; userId: string; ignored: boolean; problems: Problem[] };

/** A read-only handle for other guards (the replay runner checks balances through it). */
export const openReadOnly = async (dbName: string) => {
    const client = new MongoClient(buildUri(), { readPreference: "primary", appName: "guard-readonly" });
    await client.connect();
    return { col: readOnly(client.db(pickDb({ db: dbName }))), close: () => client.close() };
};

export const runInvariants = async ({ db: dbName, emails, userIds }: { db: string; emails?: string[]; userIds?: string[] }) => {
    const client = new MongoClient(buildUri(), { readPreference: "secondaryPreferred", appName: "checkInvariants" });
    await client.connect();
    try {
        const col = readOnly(client.db(dbName));
        const fingerprint = async () => Object.fromEntries(await Promise.all(COLLECTIONS.map(async (n) => [n, await col(n).count()])));
        const before = await fingerprint();

        type U = UserData["user"] & { _id: { toString(): string } };
        let users = await col("users").find<U>({});
        if (emails?.length) users = users.filter((u) => emails.includes(u.email));
        if (userIds?.length) users = users.filter((u) => userIds.includes(String(u._id)));
        const ids = users.map((u) => u._id);
        const byUser = { userId: { $in: ids } };
        const [accounts, transactions, categories, goals, goalLogs, bills, budgets, trips, tripExpenses] = await Promise.all([
            col("accounts").find<UserData["accounts"][number]>(byUser), col("transactions").find<UserData["transactions"][number]>(byUser),
            col("categories").find<UserData["categories"][number]>(byUser), col("goals").find<UserData["goals"][number]>(byUser),
            col("goalcontributionlogs").find<UserData["goalLogs"][number] & { userId: unknown }>(byUser), col("bills").find<UserData["bills"][number]>(byUser),
            col("budgets").find<UserData["budgets"][number]>(byUser), col("trips").find<UserData["trips"][number]>(byUser),
            col("tripexpenses").find<UserData["tripExpenses"][number]>(byUser),
        ]);
        const of = <T extends { userId: unknown }>(rows: T[], id: string) => rows.filter((r) => String(r.userId) === id);
        const reports: UserReport[] = users.map((user) => {
            const id = String(user._id);
            return {
                email: user.email, userId: id, ignored: isKnownCorrupt(user.email),
                problems: checkUser({
                    user, accounts: of(accounts, id), transactions: of(transactions, id), categories: of(categories, id), goals: of(goals, id),
                    goalLogs: of(goalLogs, id), bills: of(bills, id), budgets: of(budgets, id), trips: of(trips, id), tripExpenses: of(tripExpenses, id),
                }),
            };
        });
        const after = await fingerprint();
        return { db: dbName, checkedAt: new Date().toISOString(), users: reports.length, unchanged: JSON.stringify(before) === JSON.stringify(after), counts: after, reports };
    }
    finally {
        await client.close();
    }
};

const main = async () => {
    const argv = process.argv.slice(2);
    const val = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
    const db = pickDb({ db: val("db"), prodReadonly: argv.includes("--prod-readonly") });
    const only = val("user")?.split(",");
    const result = await runInvariants({ db, emails: only });

    console.log(`Invariants on ${result.db}: ${result.users} users checked, documents unchanged: ${result.unchanged}`);
    for (const r of result.reports) {
        if (!r.problems.length) continue;
        console.log(`\n${r.email}${r.ignored ? " (known corrupt on purpose; ignored)" : ""}: ${r.problems.length} problems`);
        for (const p of r.problems.slice(0, 40)) console.log(`  ${p.invariant}  ${p.what}`);
        if (r.problems.length > 40) console.log(`  … and ${r.problems.length - 40} more`);
    }
    const counted = result.reports.filter((r) => !r.ignored && r.problems.length);
    console.log(`\n${counted.length ? `${counted.length} users with problems` : "0 problems"}${result.reports.some((r) => r.ignored && r.problems.length) ? " (ignored users not counted)" : ""}`);
    const out = val("json");
    if (out) writeJson(path.resolve(process.cwd(), out), result);
    if (!result.unchanged) { console.error("Document counts changed while checking (someone else wrote meanwhile?)"); process.exit(3); }
    process.exit(counted.length ? 1 : 0);
};

if (require.main === module) main().catch((e) => { console.error(`checkInvariants: ${(e as Error).message.replace(/mongodb:\/\/[^@]+@/, "mongodb://***@")}`); process.exit(2); });
