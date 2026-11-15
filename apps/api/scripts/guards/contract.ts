/**
 * Old-app contract test.
 *
 * Replays every request the 2.6.0 app (commit 01efb7c, on the phones) and the current tree send
 * (they are the same set; see the note written into inventory.md) — method, path, query and the
 * exact body fields, read from apps/mobile: each sheet, form, hook, store, the outbox, push
 * register/detach and backup restore — against a local dev API, as a new throwaway @example.test
 * user, and checks
 * that each one still succeeds with the same meaning (status, the fields the app reads, and
 * the balances it moves).
 *
 *   npm run guard:contract --workspace=apps/api            starts its own dev API from this tree
 *   ... -- --api-dir /path/to/other/checkout/apps/api        runs another checkout's API
 *   ... -- --label before                                   names the result file
 *
 * Writes .audit/guards/contract/<label>.json and .audit/guards/contract/inventory.md, exits 1
 * on any failure. Never touches any user but the one it creates.
 */
import fs from "fs";
import path from "path";
import { GUARDS_OUT, THROWAWAY_PASSWORD, client, dayIn, monthIn, parseArgs, stamp, startApi, str, writeJson, type Reply, type Send } from "./lib";

type Result = {
    n: number; source: string; method: string; path: string; query: string; bodyFields: string[];
    status: number; expected: number[]; ok: boolean; problem: string | null; message: string | null;
    /** The agreed R2 difference this request shows the 2.6.0 app, if any. */
    agreed?: string;
};

/** R2 (B5): every paged list answers `{items, page, limit, hasNextPage, total}`. Since 2.8.1 the
 *  old `docs` and `totalDocs` are gone too: both phones run 2.8, which reads `items` and `total`. */
const PAGE_SHAPE_AGREED = "page shape: docs/totalDocs/totalPages/pagingCounter/hasPrevPage/prevPage/nextPage gone (2.8.0+ reads items/total; no phone runs 2.6.0)";
const PAGE_FIELDS = ["items", "page", "limit", "hasNextPage", "total"];
const isPagedRead = (method: string, p: string): boolean =>
    method === "GET" && /^\/(transactions|highlights\/history|notifications)(\?|$)/.test(p);
const pageShapeProblem = (data: unknown): string | undefined => {
    const d = data as Record<string, unknown> | null;
    if (!d || typeof d !== "object") return "no page";
    const missing = PAGE_FIELDS.filter((k) => !(k in d));
    if (missing.length) return `page lacks ${missing.join(", ")}`;
    if (!Array.isArray(d.items) || typeof d.total !== "number" || d.total < (d.items as unknown[]).length) return "page fields of the wrong kind";
    return undefined;
};
/** The lists whose 2.6.0 reader used `docs` and `totalDocs`. */
const readsOldPage = (p: string) => /^\/(transactions|highlights)/.test(p);

const ZONE = "Asia/Kolkata";
const clientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const now = () => new Date().toISOString();
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** Dotted body field names, arrays collapsed to `[]`, so the inventory shows the exact shape. */
const fieldsOf = (body: unknown, prefix = ""): string[] => {
    if (body === undefined) return [];
    if (Array.isArray(body)) return body.length && typeof body[0] === "object" && body[0] !== null ? fieldsOf(body[0], `${prefix}[].`) : [prefix.replace(/\.$/, "") + "[]"];
    if (typeof body !== "object" || body === null) return [prefix.replace(/\.$/, "")];
    const out: string[] = [];
    for (const [k, v] of Object.entries(body)) {
        if (v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length && !/^(mapping|preferences)$/.test(k)) out.push(...fieldsOf(v, `${prefix}${k}.`));
        else if (Array.isArray(v) && v.length && typeof v[0] === "object" && v[0] !== null) out.push(...fieldsOf(v, `${prefix}${k}`));
        else out.push(`${prefix}${k}${Array.isArray(v) ? "[]" : ""}`);
    }
    return out;
};

const main = async () => {
    const { args } = parseArgs();
    const label = str(args, "label", stamp())!;
    const api = await startApi({ apiDir: str(args, "api-dir") });
    const results: Result[] = [];
    let token: string | null = null;
    const send: Send = client(api.base, () => token);
    const email = `w0-contract-${Date.now().toString(36)}@example.test`;
    let password = THROWAWAY_PASSWORD;

    /** One request the app sends. `check` returns a problem, or nothing when the meaning holds. */
    const step = async (
        source: string, method: string, p: string, body?: unknown,
        { expect = [200], check }: { expect?: number[]; check?: (r: Reply) => string | void | Promise<string | void> } = {},
    ): Promise<Reply> => {
        const r = await send(method, p, body);
        let problem: string | null = null;
        const paged = isPagedRead(method, p);
        if (!expect.includes(r.status)) problem = `status ${r.status}, expected ${expect.join("/")}`;
        else if (r.status < 300 && (r.json?.success !== true || !("data" in r.json))) problem = "success envelope without success/data";
        else if (paged && r.status < 300 && pageShapeProblem(r.json.data)) problem = pageShapeProblem(r.json.data)!;
        else if (check) {
            try { problem = (await check(r)) || null; }
            catch (e) { problem = `check threw: ${(e as Error).message}`; }
        }
        const [pathOnly, query = ""] = p.split("?");
        results.push({
            n: results.length + 1, source, method, path: pathOnly.replace(/[a-f0-9]{24}/g, ":id"), query: query.replace(/[a-f0-9]{24}/g, ":id"),
            // A backup body is the picked file itself: list its top-level keys only.
            bodyFields: (body as { version?: unknown } | undefined)?.version === 1 ? Object.keys(body as object) : fieldsOf(body), status: r.status, expected: expect, ok: problem === null, problem,
            message: r.status >= 400 ? r.json?.message ?? r.text.slice(0, 120) : null,
            ...(paged && readsOldPage(p) ? { agreed: PAGE_SHAPE_AGREED } : {}),
        });
        if (problem) console.log(`  ✗ ${method} ${p} — ${problem}${r.status >= 400 ? ` (${r.json?.message ?? ""})` : ""}`);
        return r;
    };
    const data = (r: Reply) => r.json?.data;
    const balances = async (): Promise<Map<string, number>> => {
        const r = await send("GET", "/accounts");
        return new Map((r.json.data as { _id: string; balance: number }[]).map((a) => [a._id, a.balance]));
    };
    /** Runs a write and checks how each named account's balance moved. */
    const moves = async (expected: Record<string, number>, write: () => Promise<Reply>): Promise<Reply> => {
        const before = await balances();
        const r = await write();
        if (r.status >= 300) return r;
        const after = await balances();
        const wrong = Object.entries(expected).filter(([id, d]) => (after.get(id) ?? 0) - (before.get(id) ?? 0) !== d)
            .map(([id, d]) => `${id.slice(-4)} moved ${(after.get(id) ?? 0) - (before.get(id) ?? 0)}, expected ${d}`);
        const last = results[results.length - 1];
        if (wrong.length && last.ok) { last.ok = false; last.problem = `balances: ${wrong.join("; ")}`; console.log(`  ✗ ${last.method} ${last.path} — ${last.problem}`); }
        return r;
    };
    const eq = (a: unknown, b: unknown, what: string) => (a === b ? undefined : `${what} is ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

    try {
        console.log(`Contract run "${label}" against ${api.base} as ${email}`);

        // ---- Sign-up, sign-in, session (app/(auth)/register.tsx, login.tsx, app/_layout.tsx) ----
        await step("app/(auth)/register.tsx", "POST", "/auth/register", { name: "Guard Runner", email, password, timeZone: ZONE },
            { expect: [201], check: (r) => eq(data(r).email, email, "email") });
        const login = await step("app/(auth)/login.tsx", "POST", "/auth/login", { email, password },
            { check: (r) => (typeof data(r).accessToken === "string" ? undefined : "no accessToken") });
        token = data(login)?.accessToken ?? null;
        if (!token) throw new Error("cannot sign in; stopping");
        await step("app/(auth)/login.tsx, app/_layout.tsx boot", "GET", "/auth/me", undefined, { check: (r) => eq(data(r).email, email, "email") });
        await step("lib/push.ts registerForPush", "PATCH", "/users/me", { pushToken: "ExponentPushToken[w0-contract-guard]" });
        {
            // store/wake.ts and store/connectivity.ts: a raw GET outside /api, reachability only.
            const res = await fetch(`${api.base}/health`);
            const body = await res.json().catch(() => null) as { ok?: boolean } | null;
            const problem = res.status === 200 && body?.ok === true ? null : `status ${res.status}, body ${JSON.stringify(body)}`;
            results.push({ n: results.length + 1, source: "store/wake.ts, store/connectivity.ts", method: "GET", path: "/health (outside /api/v1)", query: "", bodyFields: [], status: res.status, expected: [200], ok: !problem, problem, message: null });
        }

        // ---- Stores loaded at boot ----
        const cats = data(await step("store/categories.ts", "GET", "/categories", undefined, { check: (r) => (Array.isArray(data(r)) && data(r).length > 0 ? undefined : "no default categories") })) as { _id: string; kind: string; parent?: string | null; name: string }[];
        const accounts0 = data(await step("store/accounts.ts", "GET", "/accounts")) as { _id: string; type: string; name: string }[];
        await step("store/titleSuggestions.ts", "GET", "/transactions/title-suggestions");
        const cash = accounts0.find((a) => a.type === "cash")!._id;
        const topExpense = cats.filter((c) => c.kind === "expense" && !c.parent);
        const expenseCat = topExpense[0]._id;
        const expenseCat2 = topExpense[1]._id;
        const incomeCat = cats.find((c) => c.kind === "income")!._id;

        // ---- Accounts (components/sheets/EditAccountSheet.tsx, TripSheet, AccountPickerSheet) ----
        const createAcc = async (source: string, body: Record<string, unknown>, balance: number) =>
            data(await step(source, "POST", "/accounts", body, { expect: [201], check: (r) => eq(data(r).balance, balance, "balance") }))._id as string;
        const bank = await createAcc("EditAccountSheet create (bank)", { name: "Guard Bank", type: "bank", startingBalance: 5_000_000, icon: "bank", color: "blue" }, 5_000_000);
        const bank2 = await createAcc("EditAccountSheet create (bank)", { name: "Guard Bank Two", type: "bank", startingBalance: 1_000_000, icon: "bank", color: "teal" }, 1_000_000);
        const p1 = await createAcc("TripSheet add person", { name: "Asha Guard", type: "person", startingBalance: 0 }, 0);
        const p2 = await createAcc("AccountPickerSheet new person", { name: "Ravi Guard", type: "person", startingBalance: 0 }, 0);
        const fund = await createAcc("EditAccountSheet create (investment)", {
            name: "Guard Fund", type: "investment", startingBalance: 100_000, icon: "investments", color: "violet", investmentKind: "Mutual Fund",
            currentValue: 120_000, investedSince: daysAgo(200), investedHow: "sip",
        }, 120_000);
        const fund2 = await createAcc("EditAccountSheet create (investment, no opening)", { name: "Guard Fund Two", type: "investment", startingBalance: 0, icon: "investments", color: "violet", investmentKind: "Other" }, 0);
        const fund3 = await createAcc("EditAccountSheet create (investment, lump)", { name: "Guard Fund Three", type: "investment", startingBalance: 50_000, icon: "investments", color: "amber", investmentKind: "Stocks", investedSince: daysAgo(30), investedHow: "lump" }, 50_000);
        const wallet = await createAcc("EditAccountSheet create (wallet)", { name: "Guard Wallet", type: "wallet", startingBalance: 2_000, icon: "wallet", color: "rose" }, 2_000);

        await step("EditAccountSheet edit (non-investment)", "PATCH", `/accounts/${bank2}`, { name: "Guard Bank 2", type: "bank", icon: "bank", color: "teal" },
            { check: (r) => eq(data(r).name, "Guard Bank 2", "name") });
        await step("EditAccountSheet edit (investment)", "PATCH", `/accounts/${fund}`, { name: "Guard Fund", type: "investment", icon: "investments", color: "violet", investmentKind: "SIP" },
            { check: (r) => eq(data(r).investmentKind, "SIP", "investmentKind") });
        await step("EditAccountSheet basis (invested)", "PATCH", `/investments/${fund}/basis`, { invested: 110_000 });
        await step("EditAccountSheet basis (since + how)", "PATCH", `/investments/${fund}/basis`, { investedSince: daysAgo(250), investedHow: "sip" });
        await step("EditAccountSheet basis (all three)", "PATCH", `/investments/${fund3}/basis`, { invested: 50_000, investedSince: daysAgo(40), investedHow: "lump" });
        await moves({ [bank2]: 200_000 }, () => step("EditAccountSheet balance sync", "PATCH", `/accounts/${bank2}/balance`, { balance: 1_200_000 },
            { check: (r) => eq(data(r).balance, 1_200_000, "balance") }));
        await moves({ [bank2]: -100_000 }, () => step("EditAccountSheet balance sync with note", "PATCH", `/accounts/${bank2}/balance`, { balance: 1_100_000, note: "Matched to the bank app" },
            { check: (r) => eq(data(r).balance, 1_100_000, "balance") }));
        await moves({ [fund]: 10_000 }, () => step("RevalueSheet", "PATCH", `/accounts/${fund}/balance`, { balance: 130_000 }));
        const live = (data(await send("GET", "/accounts")) as { _id: string }[]).map((a) => a._id);
        await step("lib/accounts.ts reorderAccounts", "PATCH", "/accounts/reorder", { ids: [...live].reverse() }, { check: (r) => eq(data(r).reordered, live.length, "reordered") });
        await step("manage-accounts archive", "DELETE", `/accounts/${wallet}`, undefined, { check: (r) => eq(data(r), null, "data") });

        // ---- Profile and settings (lib/profile.ts, app/settings.tsx, manage-accounts) ----
        await step("EditProfileSheet", "PATCH", "/users/me", { name: "Guard Runner Two" }, { check: (r) => eq(data(r).name, "Guard Runner Two", "name") });
        await step("settings default account", "PATCH", "/users/me", { prefs: { defaultAccount: bank } }, { check: (r) => eq(String(data(r).prefs.defaultAccount), bank, "defaultAccount") });
        await step("settings time zone", "PATCH", "/users/me", { prefs: { timeZone: ZONE } }, { check: (r) => eq(data(r).prefs.timeZone, ZONE, "timeZone") });
        await step("settings switch", "PATCH", "/users/me", { prefs: { notifications: { dailySummary: true } } }, { check: (r) => eq(data(r).prefs.notifications.dailySummary, true, "dailySummary") });
        await step("settings switch", "PATCH", "/users/me", { prefs: { notifications: { enabled: true } } });
        await step("settings bill lead", "PATCH", "/users/me", { prefs: { notifications: { billReminderLead: 3 } } });
        await step("settings investment day", "PATCH", "/users/me", { prefs: { notifications: { investmentReminderDay: 5 } } });

        // ---- Categories (CategoryPickerSheet, EditCategorySheet, manage-categories) ----
        const newCat = data(await step("CategoryPickerSheet create", "POST", "/categories", { name: "Guard Pets", kind: "expense", icon: "paw", color: "amber" },
            { expect: [201], check: (r) => eq(data(r).kind, "expense", "kind") }))._id as string;
        await step("CategoryPickerSheet create sub-category", "POST", "/categories", { name: "Guard Vet", kind: "expense", icon: "paw", color: "amber", parent: newCat },
            { expect: [201], check: (r) => eq(String(data(r).parent), newCat, "parent") });
        const editCat = data(await step("EditCategorySheet create (top level)", "POST", "/categories", { name: "Guard Hobbies", kind: "expense", icon: "star", color: "blue" }, { expect: [201] }))._id as string;
        const childCat = data(await step("EditCategorySheet create (child)", "POST", "/categories", { name: "Guard Paints", kind: "expense", icon: "star", color: "blue", parent: editCat }, { expect: [201] }))._id as string;
        await step("EditCategorySheet create (income)", "POST", "/categories", { name: "Guard Side Gig", kind: "income", icon: "star", color: "green" }, { expect: [201] });
        await step("EditCategorySheet edit", "PATCH", `/categories/${editCat}`, { name: "Guard Crafts", icon: "star", color: "rose" }, { check: (r) => eq(data(r).name, "Guard Crafts", "name") });
        const siblings = (data(await send("GET", "/categories")) as typeof cats).filter((c) => c.kind === "expense" && !c.parent).map((c) => c._id);
        await step("manage-categories reorder", "PATCH", "/categories/reorder", { ids: [...siblings].reverse() }, { check: (r) => eq(data(r).reordered, siblings.length, "reordered") });

        // ---- Budgets (BudgetLimitSheet, lib/budgets.ts) -------------------------------------------
        const month = monthIn(ZONE);
        const budget = data(await step("BudgetLimitSheet create", "POST", "/budgets", { category: expenseCat, month, limit: 100 }, { expect: [201], check: (r) => eq(data(r).limit, 100, "limit") }))._id as string;
        const budget2 = data(await step("BudgetLimitSheet create", "POST", "/budgets", { category: expenseCat2, month, limit: 50_000 }, { expect: [201] }))._id as string;
        await step("BudgetLimitSheet edit", "PATCH", `/budgets/${budget2}`, { limit: 60_000 }, { check: (r) => eq(data(r).limit, 60_000, "limit") });

        // ---- Transactions (app/add-transaction.tsx, store/outbox.ts) --------------------------------
        const firstId = clientId();
        const first = { type: "expense", amount: 25_000, account: bank, category: expenseCat, title: "Guard groceries", occurredAt: now(), clientId: firstId };
        const t1 = data(await moves({ [bank]: -25_000 }, () => step("add-transaction expense", "POST", "/transactions", first, { expect: [201], check: (r) => eq(data(r).amount, 25_000, "amount") })))._id as string;
        await moves({ [bank]: 0 }, () => step("store/outbox.ts replay (same clientId)", "POST", "/transactions", first, { expect: [409, 200, 201] }));
        await moves({ [bank]: -1_500 }, () => step("add-transaction expense with note + location", "POST", "/transactions",
            { type: "expense", amount: 1_500, account: bank, category: expenseCat2, title: "Guard chai", occurredAt: now(), clientId: clientId(), note: "with Asha", location: "Kochi" }, { expect: [201] }));
        await moves({ [bank]: 300_000 }, () => step("add-transaction income", "POST", "/transactions",
            { type: "income", amount: 300_000, account: bank, category: incomeCat, title: "Guard salary", occurredAt: now(), clientId: clientId() }, { expect: [201] }));
        const tTransfer = data(await moves({ [bank]: -10_000, [cash]: 10_000 }, () => step("add-transaction transfer", "POST", "/transactions",
            { type: "transfer", amount: 10_000, account: bank, toAccount: cash, occurredAt: now(), clientId: clientId() }, { expect: [201] })))._id as string;
        await moves({ [bank]: -5_000, [cash]: 5_000 }, () => step("add-transaction transfer with note", "POST", "/transactions",
            { type: "transfer", amount: 5_000, account: bank, toAccount: cash, occurredAt: now(), clientId: clientId(), note: "ATM" }, { expect: [201] }));
        await moves({ [bank]: -20_000, [fund2]: 20_000 }, () => step("add-transaction invest", "POST", "/transactions",
            { type: "transfer", amount: 20_000, account: bank, toAccount: fund2, occurredAt: now(), clientId: clientId() }, { expect: [201] }));
        await moves({ [fund]: -5_000, [bank]: 5_000 }, () => step("add-transaction redeem", "POST", "/transactions",
            { type: "transfer", amount: 5_000, account: fund, toAccount: bank, occurredAt: now(), clientId: clientId() }, { expect: [201] }));
        await moves({ [bank]: -90_000, [p1]: 30_000, [p2]: 30_000 }, () => step("add-transaction split", "POST", "/transactions",
            { type: "expense", amount: 30_000, account: bank, category: expenseCat2, title: "Guard dinner", occurredAt: now(), owedBy: [{ account: p1, amount: 30_000 }, { account: p2, amount: 30_000 }], clientId: clientId() },
            { expect: [201], check: (r) => eq(data(r).amount, 30_000, "own share") }));
        await step("add-transaction edit load", "GET", `/transactions/${t1}`, undefined, { check: (r) => eq(data(r)._id, t1, "_id") });
        await moves({ [bank]: -5_000 }, () => step("add-transaction edit (expense)", "PATCH", `/transactions/${t1}`,
            { title: "Guard groceries big", amount: 30_000, category: expenseCat, occurredAt: now(), note: "edited" }, { check: (r) => eq(data(r).amount, 30_000, "amount") }));
        await moves({ [bank]: -2_000, [cash]: 2_000 }, () => step("add-transaction edit (transfer)", "PATCH", `/transactions/${tTransfer}`,
            { amount: 12_000, occurredAt: now() }, { check: (r) => eq(data(r).amount, 12_000, "amount") }));
        const conv = data(await step("setup: expense to convert", "POST", "/transactions", { type: "expense", amount: 7_000, account: bank, category: expenseCat2, title: "Guard SIP paid", occurredAt: now(), clientId: clientId() }, { expect: [201] }))._id as string;
        await moves({ [bank]: 0, [fund]: 7_000 }, () => step("TransactionDetailSheet convert", "POST", `/transactions/${conv}/convert-to-investment`, { toAccount: fund },
            { check: (r) => eq(data(r).type, "transfer", "type") }));
        const b1 = data(await send("POST", "/transactions", { type: "expense", amount: 4_000, account: bank, category: expenseCat2, title: "Guard SIP old", occurredAt: daysAgo(31), clientId: clientId() }))._id as string;
        const b2 = data(await send("POST", "/transactions", { type: "expense", amount: 4_000, account: bank, category: expenseCat2, title: "Guard SIP old", occurredAt: daysAgo(61), clientId: clientId() }))._id as string;
        await moves({ [bank]: 0, [fund]: 8_000 }, () => step("bills.tsx move past payments", "POST", "/transactions/convert-to-investment", { transactionIds: [b1, b2], toAccount: fund },
            { check: (r) => eq(data(r).converted, 2, "converted") }));
        const doomed = data(await send("POST", "/transactions", { type: "expense", amount: 900, account: bank, category: expenseCat2, title: "Guard oops", occurredAt: now(), clientId: clientId() }))._id as string;
        await moves({ [bank]: 900 }, () => step("TransactionDetailSheet delete", "DELETE", `/transactions/${doomed}`, undefined, { check: (r) => eq(data(r), null, "data") }));
        await step("add-transaction repeat load", "GET", `/transactions/${conv}`);

        // ---- Bills (EditBillSheet, MarkPaidSheet, bills.tsx) ----------------------------------------
        const due = new Date(Date.now() + 5 * 86_400_000).toISOString();
        const billBody = (over: Record<string, unknown>) => ({ name: "Guard Rent", amount: 150_000, dueDate: due, recurring: true, frequency: "monthly", reminderDays: 3, category: expenseCat, toInvestment: null, ...over });
        const rent = data(await step("EditBillSheet create (monthly)", "POST", "/bills", billBody({}), { expect: [201], check: (r) => eq(data(r).name, "Guard Rent", "name") }))._id as string;
        const oneOff = data(await step("EditBillSheet create (one-off)", "POST", "/bills", { name: "Guard Repair", amount: 20_000, dueDate: due, recurring: false, reminderDays: 0, category: expenseCat, toInvestment: null }, { expect: [201] }))._id as string;
        const sip = data(await step("EditBillSheet create (SIP)", "POST", "/bills", billBody({ name: "Guard SIP", amount: 5_000, toInvestment: fund, category: null }), { expect: [201] }))._id as string;
        const yearly = data(await step("EditBillSheet create (from suggestion, yearly)", "POST", "/bills", billBody({ name: "Guard Insurance", amount: 80_000, frequency: "yearly", account: bank2 }), { expect: [201] }))._id as string;
        await step("EditBillSheet edit", "PATCH", `/bills/${rent}`, billBody({ amount: 160_000 }), { check: (r) => eq(data(r).amount, 160_000, "amount") });
        await step("EditBillSheet edit (SIP → bill)", "PATCH", `/bills/${sip}`, billBody({ name: "Guard SIP", amount: 5_000, category: expenseCat2, toInvestment: null }));
        await step("EditBillSheet edit (bill → SIP)", "PATCH", `/bills/${sip}`, billBody({ name: "Guard SIP", amount: 5_000, toInvestment: fund, category: null }));
        await moves({ [bank2]: -160_000 }, () => step("MarkPaidSheet pay (picked account)", "POST", `/bills/${rent}/pay`, { account: bank2 }));
        await moves({ [bank]: -20_000 }, () => step("MarkPaidSheet pay (default account, no body)", "POST", `/bills/${oneOff}/pay`, undefined,
            { check: (r) => eq(data(r).status, "paid", "status") }));
        await moves({ [bank]: -5_000, [fund]: 5_000 }, () => step("MarkPaidSheet pay SIP (no body)", "POST", `/bills/${sip}/pay`));
        await moves({ [bank2]: 0 }, () => step("MarkPaidSheet skip", "POST", `/bills/${yearly}/skip`, undefined,
            { check: (r) => (new Date(data(r).dueDate).getTime() > new Date(due).getTime() ? undefined : "due date did not move") }));
        await step("bills.tsx dismiss suggestion", "POST", "/recurring/dismiss", { key: "guard|expense|guard-key" });
        await step("bills.tsx delete", "DELETE", `/bills/${yearly}`, undefined, { check: (r) => eq(data(r), null, "data") });

        // ---- Goals (app/add-goal.tsx, ContributeSheet, goals.tsx) -----------------------------------
        const goal = data(await step("add-goal create (no deadline)", "POST", "/goals", { name: "Guard Laptop", target: 100_000, icon: "laptop", color: "blue" }, { expect: [201] }))._id as string;
        const goal2 = data(await step("add-goal create (deadline)", "POST", "/goals", { name: "Guard Trip Fund", target: 500_000, icon: "plane", color: "teal", deadline: new Date(Date.now() + 90 * 86_400_000).toISOString() }, { expect: [201] }))._id as string;
        await step("add-goal edit (deadline cleared)", "PATCH", `/goals/${goal2}`, { name: "Guard Trip Fund", target: 600_000, icon: "plane", color: "teal", deadline: null }, { check: (r) => eq(data(r).deadline ?? null, null, "deadline") });
        await step("add-goal edit (deadline set)", "PATCH", `/goals/${goal}`, { name: "Guard Laptop", target: 100_000, icon: "laptop", color: "blue", deadline: new Date(Date.now() + 30 * 86_400_000).toISOString() });
        await step("ContributeSheet", "POST", `/goals/${goal}/contribute`, { amount: 60_000 }, { check: (r) => eq(data(r).saved, 60_000, "saved") });

        // ---- Notifications (store/notifications.ts) -------------------------------------------------
        const feed = data(await step("store/notifications.ts first page", "GET", "/notifications?page=1&limit=20", undefined,
            { check: (r) => (Array.isArray(data(r).items) && typeof data(r).unread === "number" && "hasNextPage" in data(r) ? undefined : "feed shape") }));
        if (feed?.items?.length) {
            await step("store/notifications.ts mark read", "PATCH", `/notifications/${feed.items[0]._id}/read`, undefined,
                { check: (r) => (data(r).notification?.readAt ? undefined : "readAt not set") });
        }
        else console.log("  · no notification was generated, so mark-read was not exercised");
        await step("store/notifications.ts next page", "GET", "/notifications?page=2&limit=20");
        await step("store/notifications.ts read all", "POST", "/notifications/read-all", undefined, { check: (r) => eq(data(r).unread, 0, "unread") });

        // ---- Trips (TripSheet, TripExpenseSheet, SettleSheet, MatchSplitwise, wrap-up, import) -----
        const tripDay = (offset: number) => { const d = new Date(Date.now() + offset * 86_400_000); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString(); };
        const tripDraft = { name: "Guard Goa", emoji: "🏖", color: "teal", startDate: tripDay(-3), endDate: tripDay(2), members: [p1, p2], budget: null };
        const trip = data(await step("TripSheet create", "POST", "/trips", tripDraft, { expect: [201] }))._id as string;
        await step("TripSheet edit", "PATCH", `/trips/${trip}`, { ...tripDraft, name: "Guard Goa Trip", budget: 2_000_000 }, { check: (r) => eq(data(r).name, "Guard Goa Trip", "name") });
        const exp = { title: "Guard villa", occurredAt: now(), category: expenseCat, cost: 90_000, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: 30_000 }, { account: p1, amount: 30_000 }, { account: p2, amount: 30_000 }] };
        await moves({ [bank]: -90_000, [p1]: 30_000, [p2]: 30_000 }, () => step("TripExpenseSheet add (you paid)", "POST", `/trips/${trip}/expenses`, exp, { expect: [201] }));
        const e2 = data(await step("TripExpenseSheet add (they paid)", "POST", `/trips/${trip}/expenses`,
            { title: "Guard scooter", occurredAt: now(), category: null, cost: 6_000, paidBy: p1, paidFrom: null, shares: [{ account: null, amount: 3_000 }, { account: p1, amount: 3_000 }] }, { expect: [201] }))._id as string;
        await step("TripExpenseSheet edit", "PATCH", `/trips/${trip}/expenses/${e2}`,
            { title: "Guard scooter", occurredAt: now(), category: expenseCat2, cost: 8_000, paidBy: p1, paidFrom: null, shares: [{ account: null, amount: 4_000 }, { account: p1, amount: 4_000 }] });
        const e3 = data(await send("POST", `/trips/${trip}/expenses`, { title: "Guard snack", occurredAt: now(), category: null, cost: 600, paidBy: null, paidFrom: bank, shares: [{ account: null, amount: 300 }, { account: p2, amount: 300 }] }))._id as string;
        await step("TripExpenseSheet delete", "DELETE", `/trips/${trip}/expenses/${e3}`);
        await moves({ [bank]: 10_000, [p1]: -10_000 }, () => step("SettleSheet (received)", "POST", `/trips/${trip}/settle`, { person: p1, account: bank, amount: 10_000, direction: "received" }));
        const detail = data(await step("trip-detail", "GET", `/trips/${trip}`, undefined, { check: (r) => eq(data(r).members.length, 2, "members") }));
        const entries = (detail.members as { account: string; exact: number }[]).filter((m) => m.exact !== 0).map((m) => ({ account: m.account, amount: m.exact }));
        await step("MatchSplitwiseSheet save", "PUT", `/trips/${trip}/plan`, { entries });
        await step("MatchSplitwiseSheet clear", "DELETE", `/trips/${trip}/plan`);
        await step("trip-wrapup close", "POST", `/trips/${trip}/close`, { letGo: [p2] });
        await step("trip-detail reopen", "POST", `/trips/${trip}/reopen`);
        await step("trip-wrapup close (keep all)", "POST", `/trips/${trip}/close`, { letGo: [] });
        await step("trip-detail reopen", "POST", `/trips/${trip}/reopen`);
        await step("store/tripNames.ts, trips.tsx", "GET", "/trips", undefined, { check: (r) => (Array.isArray(data(r).trips) ? undefined : "no trips list") });

        const trip2 = data(await send("POST", "/trips", { ...tripDraft, name: "Guard Kerala", members: [p1] }))._id as string;
        const csv = [
            "Date,Description,Category,Cost,Currency,Guard Me,Asha Guard,New Friend", "",
            `${dayIn(ZONE, -2)},Guard houseboat,General,3000.00,INR,2000.00,-1000.00,-1000.00`,
            `${dayIn(ZONE, -1)},Guard lunch,Dining out,900.00,INR,-300.00,600.00,-300.00`,
            `${dayIn(ZONE, -1)},Payment,Payment,500.00,INR,-500.00,500.00,0.00`, "",
            `${dayIn(ZONE, 0)},Total balance, , ,INR,1200.00,-900.00,-1300.00`,
        ].join("\n");
        const pre1 = data(await step("trip-import preview (pick names)", "POST", `/trips/${trip2}/import/preview`, { csv }));
        const mapping = { "Guard Me": "me", "Asha Guard": p1, "New Friend": "new" };
        if (pre1?.needsMapping !== true) console.log("  · preview did not ask for names; continuing with a mapping anyway");
        const pre2 = data(await step("trip-import preview (mapped)", "POST", `/trips/${trip2}/import/preview`, { csv, mapping },
            { check: (r) => (Array.isArray(data(r).rows) && data(r).rows.length > 0 ? undefined : "no rows") }));
        const decisions = ((pre2?.rows ?? []) as { key: string; status: string; suggestedCategory: string | null }[]).map((r) =>
            r.status === "skipped" || r.status === "alreadyIn" ? { key: r.key, action: "skip" }
                : r.status === "matchesYours" ? { key: r.key, action: "apply" }
                    : { key: r.key, action: "import", category: r.suggestedCategory, account: bank });
        await step("trip-import approve", "POST", `/trips/${trip2}/import/commit`, { csv, mapping, decisions },
            { check: (r) => (data(r).added + data(r).applied > 0 ? undefined : "nothing imported") });
        await step("TripSheet delete", "DELETE", `/trips/${trip2}`);

        // ---- Every read the screens make (hooks in lib/, stores, screens) ---------------------------
        const start = `${month}-01`, today = dayIn(ZONE);
        const reads: [string, string][] = [
            ["lib/dashboard.ts useDashboardSummary", "/dashboard/summary"],
            ["lib/dashboard.ts useDashboardSummary(since)", `/dashboard/summary?since=${encodeURIComponent(daysAgo(2))}`],
            ["lib/dashboard.ts useDashboardInsights", "/dashboard/insights"],
            ["lib/health.ts", "/dashboard/health"],
            ["lib/transactions.ts useTransactions", "/transactions?trips=exclude"],
            ["lib/transactions.ts useTransactionFeed", `/transactions?page=1&limit=20&trips=exclude`],
            ["lib/transactions.ts useTransactionFeed (filters)", `/transactions?page=1&limit=20&startDate=${start}&endDate=${today}&category=${expenseCat},${expenseCat2}&account=${bank}&type=expense&search=guard&trips=exclude`],
            ["lib/transactions.ts useTripMatches", `/transactions?search=guard&startDate=${start}&endDate=${today}&trips=only&limit=50`],
            ["lib/transactions.ts countTransactionsIn", `/transactions?category=${expenseCat}&limit=1`],
            ["lib/export.ts fetchAllInRange", `/transactions?page=1&limit=100&trips=exclude&startDate=${start}&endDate=${today}`],
            ["lib/export.ts fetchAllInRange (all time)", `/transactions?page=1&limit=100&trips=exclude`],
            ["lib/transactions.ts useTransactionSummary", `/transactions/summary?startDate=${start}&endDate=${today}&trips=exclude`],
            ["lib/localNotifications.ts daily", `/transactions/summary?startDate=${dayIn(ZONE, -1)}&endDate=${dayIn(ZONE, -1)}`],
            ["lib/budgets.ts useBudgets", "/budgets"],
            ["lib/budgets.ts useBudgets(month)", `/budgets?month=${monthIn(ZONE, -1)}`],
            ["lib/bills.ts, localNotifications", "/bills"],
            ["lib/goals.ts", "/goals"],
            ["lib/insights.ts", "/insights?period=month&offset=0"],
            ["lib/insights.ts", "/insights?period=day&offset=0"],
            ["lib/insights.ts", "/insights?period=week&offset=-1"],
            ["lib/insightsExport.ts", "/insights?period=year&offset=0"],
            ["lib/insights.ts category detail", `/insights/category/${expenseCat}?period=month&offset=0`],
            ["lib/reviews.ts", "/reviews?period=month&offset=-1"],
            ["lib/reviews.ts", "/reviews?period=week&offset=-1"],
            ["lib/highlights.ts", "/highlights"],
            ["lib/highlightHistory.ts", "/highlights/history?page=1&limit=20"],
            ["lib/investments.ts", "/investments"],
            ["lib/investments.ts useInvestmentTrend", "/investments/trend"],
            ["lib/investmentsExport.ts", "/investments/report"],
            ["app/investment-detail.tsx", `/investments/${fund}/history`],
            ["lib/recurring.ts", "/recurring"],
            ["lib/cashFlow.ts", "/cash-flow"],
            ["app/trip-detail.tsx", `/trips/${trip}`],
            ["app/diagnostics.tsx", "/diagnostics/requests"],
        ];
        for (const [source, p] of reads) await step(source, "GET", p);

        // ---- Deletes and archives that end things ----------------------------------------------------
        await step("BudgetLimitSheet remove", "DELETE", `/budgets/${budget}`, undefined, { check: (r) => eq(data(r), null, "data") });
        await step("goals.tsx delete", "DELETE", `/goals/${goal2}`);
        await step("manage-categories archive (with child)", "DELETE", `/categories/${editCat}`, undefined, { check: (r) => eq(data(r).archivedChildren, 1, "archivedChildren") });
        void childCat;
        await moves({ [bank]: 0 }, () => step("DeleteInvestmentSheet keep", "DELETE", `/investments/${fund3}?mode=keep`, undefined, { check: (r) => (typeof data(r).removedTransactions === "number" ? undefined : "no count") }));
        await moves({ [bank]: 20_000 }, () => step("DeleteInvestmentSheet undo", "DELETE", `/investments/${fund2}?mode=undo`));
        await step("TripSheet delete", "DELETE", `/trips/${trip}`);
        await step("manage-accounts delete default", "PATCH", "/users/me", { prefs: { defaultAccount: null } }, { check: (r) => eq(data(r).prefs.defaultAccount ?? null, null, "defaultAccount") });

        // ---- Backup and restore (lib/backup.ts) ----------------------------------------------------
        const backup = data(await step("settings export backup", "GET", "/backup", undefined, { check: (r) => eq(data(r).version, 1, "version") }));
        const before = await balances();
        await step("settings restore backup", "POST", "/backup/restore", { ...backup, confirm: true },
            { check: (r) => eq(data(r).counts.accounts, backup.accounts.length, "restored accounts") });
        const after = await balances();
        const drifted = [...before].filter(([id, b]) => after.get(id) !== b);
        if (drifted.length) { const last = results[results.length - 1]; last.ok = false; last.problem = `restore changed ${drifted.length} balances`; }

        // ---- Crash report, password, sign-out, close account (lib/errorReporting.ts, profile, push) --
        await step("lib/errorReporting.ts", "POST", "/diagnostics/client-errors",
            { message: "Guard: test report", stack: "Error: Guard\n    at guard (contract.ts)", screen: "/settings", requestId: "W0GRD2", appVersion: "2.6.0" },
            { check: (r) => (typeof data(r).requestId === "string" ? undefined : "no requestId") });
        const newPassword = "guard-pass-5678";
        await step("ChangePasswordSheet", "POST", "/auth/change-password", { currentPassword: password, newPassword });
        password = newPassword;
        await step("app/(auth)/login.tsx (new password)", "POST", "/auth/login", { email, password }, { check: (r) => (typeof data(r).accessToken === "string" ? undefined : "no accessToken") });
        await step("lib/push.ts detachPush", "PATCH", "/users/me", { pushToken: null });
        await step("settings delete account", "DELETE", "/users/me", undefined, { check: (r) => eq(data(r), null, "data") });
        await step("app/_layout.tsx boot after closing", "GET", "/auth/me", undefined, { expect: [401] });
        const back = await step("app/(auth)/login.tsx (reopens the account)", "POST", "/auth/login", { email, password });
        token = data(back)?.accessToken ?? token;
        await step("app/_layout.tsx boot", "GET", "/auth/me", undefined, { check: (r) => eq(data(r).email, email, "email") });
    }
    finally {
        await api.stop();
    }

    const failed = results.filter((r) => !r.ok);
    const agreed = results.filter((r) => r.agreed);
    const out = path.join(GUARDS_OUT, "contract", `${label}.json`);
    writeJson(out, { label, ranAt: new Date().toISOString(), apiDir: str(args, "api-dir") ?? "this tree", user: email, total: results.length, failed: failed.length, results });

    const rows = results.map((r) => `| ${r.n} | ${r.source} | ${r.method} | \`${r.path}\` | ${r.query ? `\`${r.query}\`` : ""} | ${r.bodyFields.length ? r.bodyFields.map((f) => `\`${f}\``).join(", ") : "none"} | ${r.expected.join("/")} |`);
    fs.writeFileSync(path.join(GUARDS_OUT, "contract", "inventory.md"), [
        "# Requests the 2.6.0 and 2.7.x apps send (generated by scripts/guards/contract.ts)", "",
        "Every request below is replayed by the contract test. Body fields are exact (arrays shown as `field[]`); a `backup` body is the file the app picked, sent as-is, plus `confirm`.", "",
        "Read from apps/mobile at 2.6.0 (`01efb7c`, the version on the phones) and at the current tree. They send the same requests: `lib/api.ts`, `store/outbox.ts`, `lib/errorReporting.ts`, `lib/push.ts`, `lib/backup.ts` and every sheet and hook that builds a body are unchanged between them; 01efb7c..207518b added the local What's new screens, What's new deep-link params on Insights and Investments, a Settings row and App Lock changes, none of which send a request.", "",
        "| # | Where in the app | Method | Path | Query | Body fields | Expected |", "|---|---|---|---|---|---|---|", ...rows, "",
        `Agreed difference for the 2.6.0 app (R2): ${PAGE_SHAPE_AGREED}, on requests ${agreed.map((r) => `#${r.n}`).join(", ") || "none"}.`, "",
    ].join("\n"));

    console.log(`\n${results.length - failed.length}/${results.length} requests kept their meaning; ${agreed.length} show the agreed ${PAGE_SHAPE_AGREED}. Saved ${path.relative(process.cwd(), out)}`);
    if (failed.length) {
        for (const f of failed) console.log(`  FAIL #${f.n} ${f.method} ${f.path}${f.query ? `?${f.query}` : ""}: ${f.problem}${f.message ? ` (${f.message})` : ""}`);
        process.exit(1);
    }
};

main().catch((e) => { console.error(`contract: ${(e as Error).message}`); process.exit(2); });
