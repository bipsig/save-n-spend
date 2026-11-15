/**
 * Replay and race runner: the idempotency audit's T1–T20 and D1–D2, sent one after another and
 * in parallel, against a local dev API as a fresh throwaway user.
 *
 *   npm run guard:replay --workspace=apps/api                 starts its own dev API from this tree
 *   ... -- --label baseline                                   names the result file
 *   ... -- --only T4,D1                                       a subset
 *
 * Each test states the effect it must have (one row, balances unchanged by the extra sends, …)
 * and the release meant to make it pass: R1 (race and stale-read fixes), R2 (Idempotency-Key,
 * which the tests already send as a header; servers before R2 ignore it), or "safe" (passes
 * today and must keep passing). Balances are checked read-only in the dev database.
 * Writes .audit/guards/replay/<label>.json. Exit 1 only if a "safe" test regressed.
 */
import path from "path";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { GUARDS_OUT, parseArgs, stamp, startApi, str, throwawayUser, writeJson, type Reply } from "./lib";
import { openReadOnly } from "../checkInvariants";
import { effectsOf } from "../invariants/rules";

type Release = "R1" | "R2" | "safe";
type Outcome = { id: string; title: string; release: Release; statuses: number[]; effect: string; pass: boolean; error?: string };

const main = async () => {
    const { args } = parseArgs();
    const label = str(args, "label", stamp())!;
    const only = str(args, "only")?.split(",");
    const api = await startApi({ apiDir: str(args, "api-dir") });
    const ro = await openReadOnly("save-n-spend-dev");
    const outcomes: Outcome[] = [];
    try {
        const u = await throwawayUser(api.base, "w0-replay");
        const send = u.send;
        const me = (await send("GET", "/auth/me")).json.data;
        const userId = new ObjectId(String(me._id));
        console.log(`Replay run "${label}" against ${api.base} as ${u.email}`);

        const cats = (await send("GET", "/categories")).json.data as { _id: string; kind: string; parent?: string | null }[];
        const cat = cats.find((c) => c.kind === "expense" && !c.parent)!._id;
        const acc = async (name: string, startingBalance = 1_000_000, type = "bank", extra: Record<string, unknown> = {}) => {
            const r = await send("POST", "/accounts", { name, type, startingBalance, ...extra });
            if (r.status !== 201) throw new Error(`setup account ${name}: ${r.status} ${r.json?.message}`);
            return r.json.data._id as string;
        };
        const expense = async (account: string, amount: number, title: string, extra: Record<string, unknown> = {}) => {
            const r = await send("POST", "/transactions", { type: "expense", amount, account, category: cat, title, occurredAt: new Date().toISOString(), ...extra });
            if (r.status !== 201) throw new Error(`setup expense: ${r.status} ${r.json?.message}`);
            return r.json.data._id as string;
        };
        const keyed = (key: string) => ({ headers: { "Idempotency-Key": key } });
        const par = <T>(n: number, fn: (i: number) => Promise<T>) => Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
        const statuses = (rs: Reply[]) => rs.map((r) => r.status);
        const count = (c: Parameters<typeof ro.col>[0], q: Record<string, unknown>) => ro.col(c).count({ userId, ...q });
        const balance = async (id: string) => (await ro.col("accounts").find<{ balance: number }>({ _id: new ObjectId(id) }))[0].balance;
        /** Balance minus (starting balance + its rows), per account. 0 means it adds up. */
        const drift = async (...ids: string[]): Promise<number[]> => {
            const oids = ids.map((i) => new ObjectId(i));
            const accounts = await ro.col("accounts").find<{ _id: ObjectId; balance: number; startingBalance?: number }>({ _id: { $in: oids } });
            const txns = await ro.col("transactions").find<Parameters<typeof effectsOf>[0]>({ $or: [{ account: { $in: oids } }, { toAccount: { $in: oids } }] });
            const sums = new Map<string, number>();
            for (const t of txns) for (const [a, d] of effectsOf(t)) sums.set(a, (sums.get(a) ?? 0) + d);
            return ids.map((id) => { const a = accounts.find((x) => String(x._id) === id)!; return a.balance - ((a.startingBalance ?? 0) + (sums.get(id) ?? 0)); });
        };
        const rs = (p: number) => `₹${(p / 100).toLocaleString("en-IN")}`;

        const test = async (id: string, title: string, release: Release, body: () => Promise<{ statuses: number[]; effect: string; pass: boolean }>) => {
            if (only && !only.includes(id)) return;
            try {
                const r = await body();
                outcomes.push({ id, title, release, ...r });
                console.log(`  ${r.pass ? "pass" : "FAIL"}  ${id.padEnd(4)} [${release}] ${title}: ${r.statuses.join(", ")} → ${r.effect}`);
            }
            catch (e) {
                outcomes.push({ id, title, release, statuses: [], effect: "", pass: false, error: (e as Error).message });
                console.log(`  ERR   ${id} ${title}: ${(e as Error).message}`);
            }
        };

        await test("T1", "create, same clientId, one after the other", "safe", async () => {
            const bank = await acc("T1 bank");
            const body = { type: "expense", amount: 10_000, account: bank, category: cat, title: "T1", occurredAt: new Date().toISOString(), clientId: `t1-${randomUUID()}` };
            const a = await send("POST", "/transactions", body); const b = await send("POST", "/transactions", body);
            const rows = await count("transactions", { clientId: body.clientId });
            const [d] = await drift(bank);
            return { statuses: [a.status, b.status], effect: `${rows} row, bank drift ${rs(d)}`, pass: rows === 1 && d === 0 && [200, 201, 409].includes(b.status) };
        });
        await test("T2", "create, same clientId, ×3 at once", "safe", async () => {
            const bank = await acc("T2 bank");
            const body = { type: "expense", amount: 10_000, account: bank, category: cat, title: "T2", occurredAt: new Date().toISOString(), clientId: `t2-${randomUUID()}` };
            const r = await par(3, () => send("POST", "/transactions", body));
            const rows = await count("transactions", { clientId: body.clientId });
            const [d] = await drift(bank);
            return { statuses: statuses(r), effect: `${rows} row, bank drift ${rs(d)}`, pass: rows === 1 && d === 0 };
        });
        await test("T3", "create, no clientId, same Idempotency-Key, ×2 at once", "R2", async () => {
            const bank = await acc("T3 bank");
            const key = randomUUID();
            const body = { type: "expense", amount: 10_000, account: bank, category: cat, title: "T3", occurredAt: new Date().toISOString() };
            const r = await par(2, () => send("POST", "/transactions", body, keyed(key)));
            const rows = await count("transactions", { account: new ObjectId(bank), title: "T3" });
            return { statuses: statuses(r), effect: `${rows} rows`, pass: rows === 1 };
        });
        await test("T3b", "split create, same clientId, ×2 at once", "safe", async () => {
            const bank = await acc("T3b bank"); const friend = await acc("T3b friend", 0, "person");
            const body = { type: "expense", amount: 10_000, account: bank, category: cat, title: "T3b", occurredAt: new Date().toISOString(), owedBy: [{ account: friend, amount: 5_000 }], clientId: `t3b-${randomUUID()}` };
            const r = await par(2, () => send("POST", "/transactions", body));
            const expenses = await count("transactions", { account: new ObjectId(bank), type: "expense" });
            const transfers = await count("transactions", { toAccount: new ObjectId(friend) });
            const d = await drift(bank, friend);
            return { statuses: statuses(r), effect: `${expenses} expense, ${transfers} transfer, drift ${d.map(rs).join("/")}`, pass: expenses === 1 && transfers === 1 && d.every((x) => x === 0) };
        });
        await test("T4", "edit one ₹100 row to ₹200 and ₹300 at once", "R1", async () => {
            const bank = await acc("T4 bank");
            const t = await expense(bank, 10_000, "T4");
            const r = await Promise.all([20_000, 30_000].map((amount) => send("PATCH", `/transactions/${t}`, { amount })));
            const [d] = await drift(bank);
            return { statuses: statuses(r), effect: `bank drift ${rs(d)}`, pass: d === 0 };
        });
        await test("T4b", "move an expense to another bank while 6 entries land there; 8 rounds", "R1", async () => {
            const one = await acc("T4b bank one", 10_000_000); const two = await acc("T4b bank two", 10_000_000);
            const all: number[] = [];
            for (let round = 0; round < 8; round += 1) {
                const t = await expense(one, 1_000, `T4b ${round}`);
                const r = await Promise.all([
                    send("PATCH", `/transactions/${t}`, { account: two, amount: 1_500 }),
                    ...Array.from({ length: 6 }, (_, i) => send("POST", "/transactions", { type: "expense", amount: 100, account: two, category: cat, title: `T4b noise ${round}.${i}`, occurredAt: new Date().toISOString() })),
                ]);
                all.push(...statuses(r));
            }
            const d = await drift(one, two);
            return { statuses: [...new Set(all)], effect: `drift bank one ${rs(d[0])}, bank two ${rs(d[1])}`, pass: d.every((x) => x === 0) };
        });
        await test("T5", "convert one ₹500 expense to an investment ×2 at once", "R1", async () => {
            const bank = await acc("T5 bank"); const fund = await acc("T5 fund", 0, "investment");
            const t = await expense(bank, 50_000, "T5");
            const r = await par(2, () => send("POST", `/transactions/${t}/convert-to-investment`, { toAccount: fund }));
            const after = await balance(fund);
            const [d] = await drift(bank);
            return { statuses: statuses(r), effect: `fund ${rs(after)} (want ₹500), bank drift ${rs(d)}`, pass: after === 50_000 && d === 0 };
        });
        await test("T5b", "convert the same expense again, alone", "safe", async () => {
            const bank = await acc("T5b bank"); const fund = await acc("T5b fund", 0, "investment");
            const t = await expense(bank, 50_000, "T5b");
            const a = await send("POST", `/transactions/${t}/convert-to-investment`, { toAccount: fund });
            const b = await send("POST", `/transactions/${t}/convert-to-investment`, { toAccount: fund });
            const after = await balance(fund);
            return { statuses: [a.status, b.status], effect: `fund ${rs(after)}`, pass: after === 50_000 && b.status >= 400 && b.status < 500 };
        });
        await test("T6", "bulk convert 2 × ₹200, ×2 at once", "R1", async () => {
            const bank = await acc("T6 bank"); const fund = await acc("T6 fund", 0, "investment");
            const ids = [await expense(bank, 20_000, "T6 a"), await expense(bank, 20_000, "T6 b")];
            const r = await par(2, () => send("POST", "/transactions/convert-to-investment", { transactionIds: ids, toAccount: fund }));
            const after = await balance(fund);
            return { statuses: statuses(r), effect: `fund ${rs(after)} (want ₹400)`, pass: after === 40_000 };
        });
        await test("T7", "sync a balance to ₹50,000 ×2 at once", "R1", async () => {
            const bank = await acc("T7 bank", 1_000_000);
            const r = await par(2, () => send("PATCH", `/accounts/${bank}/balance`, { balance: 5_000_000 }));
            const after = await balance(bank); const [d] = await drift(bank);
            return { statuses: statuses(r), effect: `balance ${rs(after)}, drift ${rs(d)}`, pass: after === 5_000_000 && d === 0 };
        });
        await test("T7b", "sync a balance to ₹50,000 twice, one after the other", "safe", async () => {
            const bank = await acc("T7b bank", 1_000_000);
            const a = await send("PATCH", `/accounts/${bank}/balance`, { balance: 5_000_000 }); const b = await send("PATCH", `/accounts/${bank}/balance`, { balance: 5_000_000 });
            const after = await balance(bank); const [d] = await drift(bank);
            return { statuses: [a.status, b.status], effect: `balance ${rs(after)}, drift ${rs(d)}`, pass: after === 5_000_000 && d === 0 };
        });

        // Trips
        const tripDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString();
        const trip = async (name: string, members: string[]) => {
            const r = await send("POST", "/trips", { name, emoji: "🧳", color: "teal", startDate: tripDay(-2), endDate: tripDay(2), members, budget: null });
            if (r.status !== 201) throw new Error(`setup trip: ${r.status} ${r.json?.message}`);
            return r.json.data._id as string;
        };
        await test("T8", "add a ₹3,000 trip expense twice (same Idempotency-Key)", "R2", async () => {
            const bank = await acc("T8 bank"); const friend = await acc("T8 friend", 0, "person"); const t = await trip("T8", [friend]);
            const key = randomUUID();
            const body = { title: "T8 villa", occurredAt: new Date().toISOString(), category: null, cost: 300_000, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: 150_000 }, { account: friend, amount: 150_000 }] };
            const a = await send("POST", `/trips/${t}/expenses`, body, keyed(key)); const b = await send("POST", `/trips/${t}/expenses`, body, keyed(key));
            const n = await count("tripexpenses", { tripId: new ObjectId(t) });
            return { statuses: [a.status, b.status], effect: `${n} expenses`, pass: n === 1 };
        });
        await test("T9", "settle ₹500 twice (same Idempotency-Key)", "R2", async () => {
            const bank = await acc("T9 bank"); const friend = await acc("T9 friend", 0, "person"); const t = await trip("T9", [friend]);
            const key = randomUUID();
            const body = { person: friend, account: bank, amount: 50_000, direction: "received" };
            const a = await send("POST", `/trips/${t}/settle`, body, keyed(key)); const b = await send("POST", `/trips/${t}/settle`, body, keyed(key));
            const n = await count("transactions", { tripId: new ObjectId(t) });
            return { statuses: [a.status, b.status], effect: `${n} settle-ups`, pass: n === 1 };
        });
        await test("T9b", "settle with a clientId in the body", "R1", async () => {
            const bank = await acc("T9b bank"); const friend = await acc("T9b friend", 0, "person"); const t = await trip("T9b", [friend]);
            const r = await send("POST", `/trips/${t}/settle`, { person: friend, account: bank, amount: 50_000, direction: "received", clientId: `t9b-${randomUUID()}` });
            return { statuses: [r.status], effect: r.status < 300 ? "accepted" : `refused: ${r.json?.message}`, pass: r.status === 200 };
        });
        await test("T10", "close a trip letting a friend go, ×2 at once", "R1", async () => {
            const bank = await acc("T10 bank"); const asha = await acc("T10 Asha", 0, "person"); const t = await trip("T10", [asha]);
            await send("POST", `/trips/${t}/expenses`, { title: "T10 dinner", occurredAt: new Date().toISOString(), category: null, cost: 400_000, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: 200_000 }, { account: asha, amount: 200_000 }] });
            const r = await par(2, () => send("POST", `/trips/${t}/close`, { letGo: [asha] }));
            const after = await balance(asha);
            const letGos = await count("transactions", { tripId: new ObjectId(t), tripExpenseId: null, account: new ObjectId(asha) });
            return { statuses: statuses(r), effect: `Asha ${rs(after)} (want ₹0), ${letGos} let-go rows`, pass: after === 0 && letGos === 1 };
        });
        await test("T11", "reopen a closed trip ×2 at once", "safe", async () => {
            const friend = await acc("T11 friend", 0, "person"); const t = await trip("T11", [friend]);
            await send("POST", `/trips/${t}/close`, { letGo: [] });
            const r = await par(2, () => send("POST", `/trips/${t}/reopen`));
            const status = (await ro.col("trips").find<{ status: string }>({ _id: new ObjectId(t) }))[0].status;
            return { statuses: statuses(r), effect: `trip ${status}`, pass: status === "active" && r.every((x) => x.status === 200) };
        });
        await test("T11c", "create a trip ×2 at once (same Idempotency-Key)", "R2", async () => {
            const friend = await acc("T11c friend", 0, "person");
            const key = randomUUID();
            const body = { name: "T11c twice", emoji: "🧳", color: "teal", startDate: tripDay(-1), endDate: tripDay(1), members: [friend], budget: null };
            const r = await par(2, () => send("POST", "/trips", body, keyed(key)));
            const n = await count("trips", { name: "T11c twice" });
            return { statuses: statuses(r), effect: `${n} trips`, pass: n === 1 };
        });

        // Goals
        const goal = async (name: string) => (await send("POST", "/goals", { name, target: 10_000_000, icon: "star", color: "blue" })).json.data._id as string;
        const goalState = async (id: string) => {
            const g = (await ro.col("goals").find<{ saved: number; target: number }>({ _id: new ObjectId(id) }))[0];
            const logs = await ro.col("goalcontributionlogs").find<{ amount: number }>({ goalId: new ObjectId(id) });
            return { saved: g.saved, logged: Math.min(g.target, logs.reduce((s, l) => s + l.amount, 0)) };
        };
        await test("T12", "contribute ₹1,000 ×5 at once", "R1", async () => {
            const g = await goal("T12");
            const r = await par(5, () => send("POST", `/goals/${g}/contribute`, { amount: 100_000 }));
            const s = await goalState(g);
            return { statuses: statuses(r), effect: `saved ${rs(s.saved)}, log ${rs(s.logged)}`, pass: s.saved === s.logged && s.saved === 500_000 };
        });
        await test("T12b", "contribute ₹1,000 twice (same Idempotency-Key)", "R2", async () => {
            const g = await goal("T12b"); const key = randomUUID();
            const a = await send("POST", `/goals/${g}/contribute`, { amount: 100_000 }, keyed(key)); const b = await send("POST", `/goals/${g}/contribute`, { amount: 100_000 }, keyed(key));
            const s = await goalState(g);
            return { statuses: [a.status, b.status], effect: `saved ${rs(s.saved)}`, pass: s.saved === 100_000 && s.logged === 100_000 };
        });

        // Bills
        const bill = async (name: string, dueOffsetDays: number, recurring: boolean, account: string) => {
            const r = await send("POST", "/bills", { name, amount: 2_000_000, dueDate: new Date(Date.now() + dueOffsetDays * 86_400_000).toISOString(), recurring, ...(recurring ? { frequency: "monthly" } : {}), reminderDays: 0, category: cat, toInvestment: null, account });
            if (r.status !== 201) throw new Error(`setup bill: ${r.status} ${r.json?.message}`);
            return r.json.data._id as string;
        };
        const payments = (bank: string) => count("transactions", { account: new ObjectId(bank), type: "expense" });
        const dueOf = async (id: string) => new Date((await ro.col("bills").find<{ dueDate: Date }>({ _id: new ObjectId(id) }))[0].dueDate);
        await test("T13", "pay a monthly bill 3 months behind, twice (same Idempotency-Key)", "R2", async () => {
            const bank = await acc("T13 bank", 10_000_000); const b = await bill("T13 rent", -90, true, bank); const key = randomUUID();
            const a = await send("POST", `/bills/${b}/pay`, { account: bank }, keyed(key)); const c = await send("POST", `/bills/${b}/pay`, { account: bank }, keyed(key));
            const n = await payments(bank);
            return { statuses: [a.status, c.status], effect: `${n} payments`, pass: n === 1 };
        });
        await test("T13b", "pay a current monthly bill ×3 at once", "safe", async () => {
            const bank = await acc("T13b bank", 10_000_000); const b = await bill("T13b rent", 3, true, bank);
            const r = await par(3, () => send("POST", `/bills/${b}/pay`, { account: bank }));
            const n = await payments(bank);
            return { statuses: statuses(r), effect: `${n} payments`, pass: n === 1 };
        });
        await test("T13c", "pay and skip the same overdue bill at once", "R1", async () => {
            const bank = await acc("T13c bank", 10_000_000); const b = await bill("T13c rent", -10, true, bank);
            const before = await dueOf(b);
            const r = await Promise.all([send("POST", `/bills/${b}/pay`, { account: bank }), send("POST", `/bills/${b}/skip`)]);
            const after = await dueOf(b); const n = await payments(bank);
            const months = (after.getUTCFullYear() - before.getUTCFullYear()) * 12 + after.getUTCMonth() - before.getUTCMonth();
            const succeeded = r.filter((x) => x.status === 200).length;
            return { statuses: statuses(r), effect: `due date moved ${months} month(s), ${n} payments, ${succeeded} answered 200`, pass: months === succeeded && n <= 1 && (n === 1) === (r[0].status === 200) };
        });
        await test("T13d", "pay a one-off bill twice", "safe", async () => {
            const bank = await acc("T13d bank", 10_000_000); const b = await bill("T13d repair", 2, false, bank);
            const a = await send("POST", `/bills/${b}/pay`, { account: bank }); const c = await send("POST", `/bills/${b}/pay`, { account: bank });
            const n = await payments(bank);
            return { statuses: [a.status, c.status], effect: `${n} payments`, pass: n === 1 };
        });
        await test("T13e", "create a bill ×2 at once (same Idempotency-Key)", "R2", async () => {
            const bank = await acc("T13e bank"); const key = randomUUID();
            const body = { name: "T13e Netflix", amount: 64_900, dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString(), recurring: true, frequency: "monthly", reminderDays: 3, category: cat, toInvestment: null, account: bank };
            const r = await par(2, () => send("POST", "/bills", body, keyed(key)));
            const n = await count("bills", { name: "T13e Netflix" });
            return { statuses: statuses(r), effect: `${n} bills`, pass: n === 1 };
        });

        await test("T14", "three different notification switches at once", "R1", async () => {
            const r = await Promise.all([{ budgetAlerts: false }, { goalMilestones: false }, { weeklySummary: true }].map((n) => send("PATCH", "/users/me", { prefs: { notifications: n } })));
            const user = (await ro.col("users").find<{ prefs: { notifications: Record<string, unknown> } }>({ _id: userId }))[0];
            const n = user.prefs.notifications;
            const kept = [n.budgetAlerts === false, n.goalMilestones === false, n.weeklySummary === true].filter(Boolean).length;
            return { statuses: statuses(r), effect: `${kept} of 3 switches stored`, pass: kept === 3 };
        });
        await test("T15", "create the same category ×2 at once", "R1", async () => {
            const r = await par(2, () => send("POST", "/categories", { name: "T15 Pets", kind: "expense", icon: "paw", color: "amber" }));
            const n = await count("categories", { name: "T15 Pets", isArchived: false });
            return { statuses: statuses(r), effect: `${n} live categories`, pass: n === 1 };
        });
        await test("T16", "create the same budget twice", "safe", async () => {
            const month = new Date().toISOString().slice(0, 7);
            const body = { category: cat, month, limit: 100_000 };
            const a = await send("POST", "/budgets", body); const b = await send("POST", "/budgets", body);
            const n = await count("budgets", { category: new ObjectId(cat), month });
            return { statuses: [a.status, b.status], effect: `${n} budget`, pass: n === 1 };
        });
        await test("T17", "create an account ×2 at once (same Idempotency-Key)", "R2", async () => {
            const key = randomUUID();
            const r = await par(2, () => send("POST", "/accounts", { name: "T17 Wallet", type: "wallet", startingBalance: 0 }, keyed(key)));
            const n = await count("accounts", { name: "T17 Wallet" });
            return { statuses: statuses(r), effect: `${n} accounts`, pass: n === 1 };
        });
        await test("T18", "create a goal ×2 at once (same Idempotency-Key)", "R2", async () => {
            const key = randomUUID();
            const r = await par(2, () => send("POST", "/goals", { name: "T18 Trip fund", target: 100_000, icon: "plane", color: "teal" }, keyed(key)));
            const n = await count("goals", { name: "T18 Trip fund" });
            return { statuses: statuses(r), effect: `${n} goals`, pass: n === 1 };
        });
        await test("T19", "archive a parent category twice", "safe", async () => {
            const parent = (await send("POST", "/categories", { name: "T19 Parent", kind: "expense", icon: "star", color: "blue" })).json.data._id as string;
            await send("POST", "/categories", { name: "T19 Child", kind: "expense", icon: "star", color: "blue", parent });
            const a = await send("DELETE", `/categories/${parent}`); const b = await send("DELETE", `/categories/${parent}`);
            const liveChildren = await count("categories", { parent: new ObjectId(parent), isArchived: false });
            return { statuses: [a.status, b.status], effect: `${liveChildren} live children left`, pass: a.status === 200 && b.status === 404 && liveChildren === 0 };
        });
        await test("D1", "delete one ₹400 expense ×3 at once", "R1", async () => {
            const bank = await acc("D1 bank", 1_000_000);
            const t = await expense(bank, 40_000, "D1");
            const r = await par(3, () => send("DELETE", `/transactions/${t}`));
            const after = await balance(bank); const [d] = await drift(bank);
            return { statuses: statuses(r), effect: `bank ${rs(after)} (want ₹10,000), drift ${rs(d)}`, pass: after === 1_000_000 && d === 0 };
        });
        await test("D2", "redeem ₹700 ×2 at once from a ₹1,000 holding", "R1", async () => {
            const bank = await acc("D2 bank"); const fund = await acc("D2 fund", 100_000, "investment");
            const r = await par(2, () => send("POST", "/transactions", { type: "transfer", amount: 70_000, account: fund, toAccount: bank, occurredAt: new Date().toISOString() }));
            const after = await balance(fund);
            return { statuses: statuses(r), effect: `holding ${rs(after)}`, pass: after >= 0 };
        });
        await test("D2b", "redeem ₹700 from a ₹300 holding, alone", "safe", async () => {
            const bank = await acc("D2b bank"); const fund = await acc("D2b fund", 30_000, "investment");
            const r = await send("POST", "/transactions", { type: "transfer", amount: 70_000, account: fund, toAccount: bank, occurredAt: new Date().toISOString() });
            const after = await balance(fund);
            return { statuses: [r.status], effect: `holding ${rs(after)}`, pass: after === 30_000 && r.status >= 400 && r.status < 500 };
        });
        // Idempotency-Key itself (R2): replays answer with the stored reply, a reused key with a
        // different body is refused, and a key never writes twice.
        const k = (id: string) => ({ type: "expense", amount: 10_000, category: cat, title: id, occurredAt: new Date().toISOString() });
        await test("K1", "same Idempotency-Key twice: one write, the same reply", "R2", async () => {
            const bank = await acc("K1 bank"); const key = randomUUID(); const body = { ...k("K1"), account: bank };
            const a = await send("POST", "/transactions", body, keyed(key)); const b = await send("POST", "/transactions", body, keyed(key));
            const rows = await count("transactions", { account: new ObjectId(bank), title: "K1" }); const [d] = await drift(bank);
            const same = a.text === b.text && b.headers.get("idempotent-replayed") === "true";
            return { statuses: [a.status, b.status], effect: `${rows} row, same reply: ${same}, drift ${rs(d)}`, pass: a.status === 201 && rows === 1 && same && d === 0 };
        });
        await test("K2", "same Idempotency-Key, different body: 422, nothing more written", "R2", async () => {
            const bank = await acc("K2 bank"); const key = randomUUID();
            const a = await send("POST", "/transactions", { ...k("K2"), account: bank }, keyed(key));
            const b = await send("POST", "/transactions", { ...k("K2"), account: bank, amount: 20_000 }, keyed(key));
            const c = await send("PATCH", `/accounts/${bank}/balance`, { balance: 1 }, keyed(key));
            const rows = await count("transactions", { account: new ObjectId(bank) }); const [d] = await drift(bank);
            return { statuses: [a.status, b.status, c.status], effect: `${b.json?.code}, other route ${c.json?.code}, ${rows} row`, pass: b.status === 422 && b.json?.code === "idempotency_mismatch" && c.status === 422 && rows === 1 && d === 0 };
        });
        await test("K3", "same Idempotency-Key ×3 at once: one write; the rest 409 with Retry-After or the replay", "R2", async () => {
            const bank = await acc("K3 bank"); const key = randomUUID(); const body = { ...k("K3"), account: bank };
            const r = await par(3, () => send("POST", "/transactions", body, keyed(key)));
            const rows = await count("transactions", { account: new ObjectId(bank), title: "K3" }); const [d] = await drift(bank);
            const busyOk = r.filter((x) => x.status === 409).every((x) => x.json?.code === "idempotency_in_progress" && Number(x.headers.get("retry-after")) >= 1);
            return { statuses: statuses(r), effect: `${rows} row, drift ${rs(d)}`, pass: rows === 1 && d === 0 && busyOk && r.every((x) => [201, 409].includes(x.status)) };
        });
        await test("K4", "no Idempotency-Key and no clientId, sent twice: two rows, as before", "safe", async () => {
            const bank = await acc("K4 bank"); const body = { ...k("K4"), account: bank };
            const a = await send("POST", "/transactions", body); const b = await send("POST", "/transactions", body);
            const rows = await count("transactions", { account: new ObjectId(bank), title: "K4" });
            return { statuses: [a.status, b.status], effect: `${rows} rows`, pass: a.status === 201 && b.status === 201 && rows === 2 };
        });
        await test("K5", "a malformed Idempotency-Key: 400 invalid_input, nothing written", "R2", async () => {
            const bank = await acc("K5 bank");
            const r = await send("POST", "/transactions", { ...k("K5"), account: bank }, keyed("no spaces allowed"));
            const rows = await count("transactions", { account: new ObjectId(bank) });
            return { statuses: [r.status], effect: `${r.json?.code}, ${rows} rows`, pass: r.status === 400 && r.json?.code === "invalid_input" && rows === 0 };
        });

        // Last: restore replaces everything this user has.
        await test("T20", "restore your own backup ×2 at once, then once more", "safe", async () => {
            const backup = (await send("GET", "/backup")).json.data;
            const rows = async () => (await Promise.all((["accounts", "transactions", "categories", "bills", "goals", "budgets", "trips", "tripexpenses"] as const).map((c) => count(c, {})))).join("/");
            const before = await rows();
            const r = await par(2, () => send("POST", "/backup/restore", { ...backup, confirm: true }));
            const mid = await rows();
            const c = await send("POST", "/backup/restore", { ...backup, confirm: true });
            const after = await rows();
            return { statuses: [...statuses(r), c.status], effect: `rows ${before} → ${mid} → ${after}`, pass: before === mid && mid === after && [...r, c].every((x) => x.status === 200) };
        });

        void u;
    }
    finally {
        await api.stop();
        await ro.close();
    }

    const out = path.join(GUARDS_OUT, "replay", `${label}.json`);
    writeJson(out, { label, ranAt: new Date().toISOString(), apiDir: str(args, "api-dir") ?? "this tree", outcomes });
    const by = (rel: Release) => outcomes.filter((o) => o.release === rel);
    const line = (rel: Release) => `${rel}: ${by(rel).filter((o) => o.pass).length}/${by(rel).length} pass`;
    console.log(`\n${line("safe")} · ${line("R1")} · ${line("R2")}. Saved ${path.relative(process.cwd(), out)}`);
    if (by("safe").some((o) => !o.pass)) process.exit(1);
};

main().catch((e) => { console.error(`replay: ${(e as Error).message}`); process.exit(2); });
