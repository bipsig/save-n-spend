import { before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { useTestApi, type TestUser } from "../harness";
import { dayIn, monthIn } from "../../scripts/guards/lib";
import { portfolioTrend, type HoldingRecords } from "../../src/services/investmentHistoryMath";
import { annualReturnOf, holdingFlows, type Flow } from "../../src/services/investmentMath";
import { REDEEM_TOO_MUCH } from "../../src/services/transactionService";
import { MALFORMED, MISSING, balanceOf, daysAgo, failed, keyed, par, replayed, retriedAfterFailure, rowsOn, signedOut, statuses, type Row } from "./moneyChecks";

// /investments over HTTP, plus investing, redeeming and value updates through /transactions and
// /accounts. The figures are checked by hand and against investmentHistoryMath / investmentMath
// run on the rows the API stored.

const api = useTestApi();
const ZONE = "Asia/Kolkata";
let other: TestUser;
let theirFund: string;

before(async () => {
    await api.ready();
    other = await api.user("t3-inv-other");
    theirFund = await other.account("Their fund", { type: "investment", startingBalance: 1_00_000 });
});

/** The 15th, noon in Delhi, `n` months before this one. */
const monthsBack = (n: number) => {
    const [y, m] = dayIn(ZONE).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 - n, 15, 6, 30)).toISOString();
};
const holding = async (u: TestUser, body: Record<string, unknown>) => {
    const r = await u.send("POST", "/accounts", { type: "investment", ...body });
    assert.equal(r.status, 201, r.text);
    return r.json.data._id as string;
};
const post = async (u: TestUser, body: Record<string, unknown>) => {
    const r = await u.send("POST", "/transactions", body);
    assert.equal(r.status, 201, r.text);
    return r.json.data as { _id: string };
};
const sync = async (u: TestUser, id: string, balance: number) => {
    const r = await u.send("PATCH", `/accounts/${id}/balance`, { balance });
    assert.equal(r.status, 200, r.text);
};
const close = (actual: number | null, expected: number | null, label: string) => {
    assert.ok(actual !== null && expected !== null && Math.abs(actual - expected) < 1e-6, `${label}: ${actual} vs ${expected}`);
};

type Acc = { _id: ObjectId; name: string; icon?: string; color?: string; startingBalance: number; balance: number; createdAt: Date; order: number; investedSince: Date | null; investedHow: "sip" | "lump" | null };

/** What the service reads, straight from the database, for the reference maths. */
const recordsOf = async (userId: string) => {
    const accounts = (await api.ro.col("accounts").find<Acc>({ userId: new ObjectId(userId), type: "investment", isArchived: false }))
        .sort((a, b) => a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime());
    const txns = await api.ro.col("transactions").find<Row>({ userId: new ObjectId(userId) });
    return accounts.map((a) => {
        const id = String(a._id);
        const flows = txns.filter((t) => t.type === "transfer" && (String(t.toAccount) === id || String(t.account) === id))
            .map((t) => ({ at: t.occurredAt, amount: String(t.toAccount) === id ? t.amount : -t.amount }));
        const updates = txns.filter((t) => String(t.account) === id && t.type.endsWith("Adjustment"))
            .map((t) => ({ at: t.occurredAt, amount: t.type === "positiveAdjustment" ? t.amount : -t.amount }));
        const record: HoldingRecords = { id, name: a.name, icon: a.icon, color: a.color, startingBalance: a.startingBalance, balance: a.balance, createdAt: a.createdAt, flows, updates };
        const flowsIn = flows.filter((f) => f.amount > 0).map((f): Flow => ({ amount: f.amount, at: f.at }));
        const flowsOut = flows.filter((f) => f.amount < 0).map((f): Flow => ({ amount: -f.amount, at: f.at }));
        const cash = holdingFlows({ startingBalance: a.startingBalance, investedSince: a.investedSince, investedHow: a.investedHow, createdAt: a.createdAt, contributions: flowsIn, redemptions: flowsOut, current: a.balance, now: new Date() });
        return { record, cash };
    });
};

test("no holdings: an empty hub, trend and report", async () => {
    const u = await api.user("t3-inv-empty");
    const hub = await u.send("GET", "/investments");
    assert.deepEqual([hub.status, hub.json.message], [200, "Investments fetched"]);
    assert.deepEqual(hub.json.data, {
        holdings: [], allocation: [], thisMonth: { contributed: 0, portfolioChange: 0, income: 0 },
        totals: { invested: 0, current: 0, gain: 0, annualReturn: null, annualReturnStatus: "unavailable" },
    });
    const trend = await u.send("GET", "/investments/trend");
    assert.deepEqual([trend.json.message, trend.json.data], ["Investment trend fetched", { points: [], growth: [], holdings: [] }]);
    const report = await u.send("GET", "/investments/report");
    assert.equal(report.json.message, "Investment report fetched");
    assert.deepEqual({ ...report.json.data, asOf: undefined }, { asOf: undefined, holdings: [], totals: hub.json.data.totals, allocation: [], trend: { points: [], growth: [], holdings: [] }, ledger: [] });
    assert.ok(Math.abs(Date.parse(report.json.data.asOf) - Date.now()) < 10_000);
    for (const p of ["/investments", "/investments/trend", "/investments/report"]) await signedOut(api, "GET", p);
});

test("seeded portfolio: hub, trend, report and history, by hand and against the maths", async () => {
    const u = await api.user("t3-inv-seed");
    const bank = await u.account("Salary bank", { startingBalance: 1_00_00_000 });
    // ₹1,00,000 in, worth ₹1,10,000 when added: an opening gain of ₹10,000.
    const icici = await holding(u, { name: "ICICI Pru", startingBalance: 1_00_00_000, currentValue: 1_10_00_000, investmentKind: "Mutual fund", investedSince: daysAgo(183), investedHow: "lump" });
    const ppf = await holding(u, { name: "PPF", startingBalance: 50_00_000, investmentKind: "PPF", investedSince: daysAgo(400), investedHow: "lump" });
    const gold = await holding(u, { name: "Gold", startingBalance: 20_00_000, investmentKind: "Mutual fund" });
    // Three months back: ₹20,000 in. Two back: up ₹5,000. Last month: ₹10,000 out. Now: down ₹2,000.
    await post(u, { type: "transfer", amount: 20_00_000, account: bank, toAccount: icici, occurredAt: monthsBack(3) });
    await post(u, { type: "positiveAdjustment", amount: 5_00_000, account: icici, title: "Value update", occurredAt: monthsBack(2) });
    await post(u, { type: "transfer", amount: 10_00_000, account: icici, toAccount: bank, occurredAt: monthsBack(1) });
    await post(u, { type: "transfer", amount: 1_00_000, account: bank, toAccount: ppf });
    await post(u, { type: "income", amount: 50_00_000, account: bank, category: await u.category("income"), title: "Salary" });
    await sync(u, icici, 1_23_00_000);
    await sync(u, ppf, 55_00_000);

    // ---- The hub
    const hub = (await u.send("GET", "/investments")).json.data;
    const pick = (h: Record<string, unknown>) => [h.accountId, h.name, h.kind, h.invested, h.current, h.gain, h.investedHow];
    assert.deepEqual(hub.holdings.map(pick), [
        [icici, "ICICI Pru", "Mutual fund", 1_10_00_000, 1_23_00_000, 13_00_000, "lump"],
        [ppf, "PPF", "PPF", 51_00_000, 55_00_000, 4_00_000, "lump"],
        [gold, "Gold", "Mutual fund", 20_00_000, 20_00_000, 0, null],
    ]);
    assert.deepEqual([hub.totals.invested, hub.totals.current, hub.totals.gain], [1_81_00_000, 1_98_00_000, 17_00_000]);
    assert.deepEqual([hub.totals.annualReturn, hub.totals.annualReturnStatus], [null, "noStartDate"], "Gold has value and no start date");
    assert.deepEqual(hub.allocation, [{ kind: "Mutual fund", current: 1_43_00_000 }, { kind: "PPF", current: 55_00_000 }]);
    assert.deepEqual(hub.thisMonth, { contributed: 1_00_000, portfolioChange: 4_00_000 - 2_00_000, income: 50_00_000 });
    const [hi, hp, hg] = hub.holdings;
    assert.deepEqual([hg.annualReturn, hg.annualReturnStatus, hg.lastUpdatedAt, hg.investedSince], [null, "noStartDate", null, null]);
    const lastSync = (await rowsOn(api, icici)).filter((t) => t.type === "negativeAdjustment")[0].occurredAt.toISOString();
    assert.equal(hi.lastUpdatedAt, lastSync);
    const ref = await recordsOf(u.id);
    for (const [h, i] of [[hi, 0], [hp, 1]] as const) {
        const want = annualReturnOf(ref[i].cash, new Date());
        assert.equal(h.annualReturnStatus, "ok");
        close(h.annualReturn, want.annualReturn, h.name);
    }

    // ---- The trend, by hand for ICICI
    const trend = (await u.send("GET", "/investments/trend")).json.data;
    const t1 = trend.holdings[0];
    assert.equal(t1.id, icici);
    assert.deepEqual(t1.points.map((p: Record<string, unknown>) => [p.month, p.invested, p.value, p.upd, p.contrib, p.partial ?? false]), [
        [monthIn(ZONE, -3), 1_20_00_000, 1_30_00_000, true, 20_00_000, false],
        [monthIn(ZONE, -2), 1_20_00_000, 1_35_00_000, true, 0, false],
        [monthIn(ZONE, -1), 1_10_00_000, 1_25_00_000, false, -10_00_000, false],
        [monthIn(ZONE, 0), 1_10_00_000, 1_23_00_000, true, 0, true],
    ]);
    assert.deepEqual(t1.growth.map((g: Record<string, unknown>) => [g.growth, g.upd, g.cover, g.opening ?? false]), [[null, true, 1, true], [5_00_000, true, 1, false], [0, false, 0, false], [-2_00_000, true, 2, false]]);
    close(t1.growth[1].pct, (5_00_000 / 1_30_00_000) * 100, "growth pct");
    close(t1.growth[3].pct, -1.6, "loss pct");
    assert.deepEqual(t1.updates.map((x: Record<string, unknown>) => [x.value, x.change]), [[1_23_00_000, -2_00_000], [1_35_00_000, 5_00_000]]);
    assert.deepEqual([t1.monthsSinceUpdate, t1.startedAt, t1.lastUpdatedAt], [0, monthsBack(3), lastSync]);
    assert.match(t1.points[0].label, /’\d\d$/);
    // The portfolio: ICICI alone until this month, then all three.
    assert.deepEqual(trend.points.map((p: Record<string, unknown>) => [p.value, p.invested, p.updated, p.existing]), [
        [1_30_00_000, 1_20_00_000, 1, 1], [1_35_00_000, 1_20_00_000, 1, 1], [1_25_00_000, 1_10_00_000, 0, 1], [1_98_00_000, 1_81_00_000, 3, 3],
    ]);
    assert.deepEqual(trend.growth.map((g: Record<string, unknown>) => g.growth), [null, 5_00_000, 0, -2_00_000], "new holdings bring an opening value, not growth");
    // And exactly what investmentHistoryMath makes of the stored rows.
    assert.deepEqual(trend, JSON.parse(JSON.stringify(portfolioTrend(ref.map((r) => r.record), ZONE, new Date()))));

    // ---- The report: the hub's figures, the same trend, every entry oldest first
    const report = (await u.send("GET", "/investments/report")).json.data;
    // annualReturn is worked out at each request's own "now", so it is compared to the hub's within a tolerance.
    const fixed = (hs: Record<string, unknown>[]) => hs.map((h) => ({ ...h, annualReturn: h.annualReturn === null ? null : "number" }));
    assert.deepEqual([fixed(report.holdings), report.totals, report.allocation, report.trend], [fixed(hub.holdings), hub.totals, hub.allocation, trend]);
    for (const [i, h] of hub.holdings.entries()) if (h.annualReturn !== null) close(report.holdings[i].annualReturn, h.annualReturn, h.name);
    const ats = report.ledger.map((e: { at: string }) => e.at);
    assert.deepEqual(ats, [...ats].sort());
    const of = (id: string) => report.ledger.filter((e: { holdingId: string }) => e.holdingId === id).map((e: Record<string, unknown>) => [e.kind, e.amount, e.valueAfter]);
    assert.deepEqual(of(icici), [["in", 20_00_000, 1_30_00_000], ["update", 5_00_000, 1_35_00_000], ["out", -10_00_000, 1_25_00_000], ["added", 1_25_00_000, 1_25_00_000], ["update", -2_00_000, 1_23_00_000]]);
    assert.deepEqual(of(ppf), [["added", 50_00_000, 50_00_000], ["in", 1_00_000, 51_00_000], ["update", 4_00_000, 55_00_000]]);
    assert.deepEqual(of(gold), [["added", 20_00_000, 20_00_000]]);

    // ---- One holding's raw rows, value updates included, newest first
    const hist = await u.send("GET", `/investments/${icici}/history`);
    assert.deepEqual([hist.status, hist.json.message], [200, "Investment history fetched"]);
    assert.deepEqual(hist.json.data.map((t: Record<string, unknown>) => [t.type, t.amount]), [["negativeAdjustment", 2_00_000], ["transfer", 10_00_000], ["positiveAdjustment", 5_00_000], ["transfer", 20_00_000]]);
    assert.ok(hist.json.data.every((t: Record<string, unknown>) => t.userId === undefined));
    assert.deepEqual((await u.send("GET", `/investments/${gold}/history`)).json.data, []);

    // Archived: gone from the hub, the trend and the report; its own history still answers.
    assert.equal((await u.send("DELETE", `/accounts/${gold}`)).status, 200);
    assert.deepEqual((await u.send("GET", "/investments")).json.data.holdings.map((h: { accountId: string }) => h.accountId), [icici, ppf]);
    assert.deepEqual((await u.send("GET", "/investments/trend")).json.data.holdings.length, 2);
    assert.equal((await u.send("GET", `/investments/${gold}/history`)).status, 200);
    // Another user sees none of it.
    assert.deepEqual((await other.send("GET", "/investments")).json.data.holdings.map((h: { accountId: string }) => h.accountId), [theirFund]);
});

test("history: only a holding of mine; malformed, missing, a bank or another user's is 404", async () => {
    const u = await api.user("t3-inv-hist");
    const fund = await holding(u, { name: "Fund", startingBalance: 0 });
    const bank = await u.account("Bank");
    for (const id of [bank, theirFund, MISSING, MALFORMED]) failed(await u.send("GET", `/investments/${id}/history`), 404, "not_found", { message: "That holding doesn't exist any more" });
    // Every row, newest first (gaps row 131: it stopped at 200). Rows written straight to the database: 205 requests would say nothing more.
    const rows = Array.from({ length: 205 }, (_, i) => ({ userId: new ObjectId(u.id), type: "positiveAdjustment", amount: 1, account: new ObjectId(fund), title: `u${i}`, occurredAt: new Date(Date.now() - i * 60_000), createdAt: new Date(), updatedAt: new Date() }));
    await api.db().collection("transactions").insertMany(rows);
    await api.db().collection("accounts").updateOne({ _id: new ObjectId(fund) }, { $inc: { balance: 205 } });
    const r = await u.send("GET", `/investments/${fund}/history`);
    assert.equal(r.json.data.length, 205);
    assert.deepEqual([r.json.data[0].title, r.json.data[204].title], ["u0", "u204"]);
    await signedOut(api, "GET", `/investments/${fund}/history`);
});

test("yearly return: SIP spread, too early, a heavy loss, nothing to annualise", async () => {
    const u = await api.user("t3-inv-xirr");
    const sip = await holding(u, { name: "SIP", startingBalance: 12_00_000, currentValue: 13_00_000, investedSince: daysAgo(365), investedHow: "sip" });
    const fresh = await holding(u, { name: "Fresh", startingBalance: 1_00_000, currentValue: 1_10_000, investedSince: daysAgo(10), investedHow: "lump" });
    const crash = await holding(u, { name: "Crash", startingBalance: 10_00_000, currentValue: 10_000, investedSince: daysAgo(365), investedHow: "lump" });
    const wiped = await holding(u, { name: "Wiped", startingBalance: 10_00_000, currentValue: 1, investedSince: daysAgo(365), investedHow: "lump" });
    const empty = await holding(u, { name: "Empty", startingBalance: 0 });
    const hub = (await u.send("GET", "/investments")).json.data;
    const by = (id: string) => hub.holdings.find((h: { accountId: string }) => h.accountId === id);
    const ref = await recordsOf(u.id);
    const refOf = (id: string) => ref.find((r) => r.record.id === id)!.cash;
    const instalments = refOf(sip)!.filter((f) => f.amount < 0);
    const [since, created] = [new Date(daysAgo(365)), new Date()];
    assert.equal(instalments.length, Math.max(1, (created.getUTCFullYear() - since.getUTCFullYear()) * 12 + created.getUTCMonth() - since.getUTCMonth()), "the opening amount spread monthly");
    assert.ok(instalments.length >= 11);
    assert.equal(instalments.reduce((s, f) => s - f.amount, 0), 12_00_000);
    for (const id of [sip, crash]) {
        assert.equal(by(id).annualReturnStatus, "ok", by(id).name);
        close(by(id).annualReturn, annualReturnOf(refOf(id), new Date()).annualReturn, by(id).name);
    }
    close(by(crash).annualReturn, -0.99, "a 99% loss over a year");
    assert.deepEqual([by(fresh).annualReturn, by(fresh).annualReturnStatus], [null, "tooEarly"]);
    assert.deepEqual([by(wiped).annualReturn, by(wiped).annualReturnStatus], [null, "unavailable"], "below what the solver brackets");
    assert.deepEqual([by(empty).annualReturn, by(empty).annualReturnStatus], [null, "unavailable"]);
    const all = annualReturnOf(ref.flatMap((r) => r.cash ?? []), new Date());
    assert.equal(hub.totals.annualReturnStatus, all.annualReturnStatus);
    if (all.annualReturn !== null) close(hub.totals.annualReturn, all.annualReturn, "portfolio");
});

test("invest, redeem and value updates move exactly the balances; redeeming more than it's worth is refused", async () => {
    const u = await api.user("t3-inv-move");
    const bank = await u.account("Bank", { startingBalance: 5_00_000 });
    const fund = await holding(u, { name: "Fund", startingBalance: 0 });
    await post(u, { type: "transfer", amount: 1_00_000, account: bank, toAccount: fund });
    await post(u, { type: "positiveAdjustment", amount: 20_000, account: fund });
    await sync(u, fund, 1_10_000);
    await post(u, { type: "transfer", amount: 30_000, account: fund, toAccount: bank });
    assert.deepEqual([await balanceOf(api, bank), await balanceOf(api, fund)], [5_00_000 - 1_00_000 + 30_000, 80_000]);
    const before = (await rowsOn(api, fund)).length;
    failed(await u.send("POST", "/transactions", { type: "transfer", amount: 80_001, account: fund, toAccount: bank }), 400, "invalid_input", { message: REDEEM_TOO_MUCH });
    assert.equal((await rowsOn(api, fund)).length, before, "the row written before the check is rolled back");
    const all = await post(u, { type: "transfer", amount: 80_000, account: fund, toAccount: bank });
    assert.equal(await balanceOf(api, fund), 0);
    failed(await u.send("POST", "/transactions", { type: "transfer", amount: 1, account: fund, toAccount: bank }), 400, "invalid_input", { message: REDEEM_TOO_MUCH });
    // An edit can't redeem more either; nor can moving a transfer's source onto the holding.
    failed(await u.send("PATCH", `/transactions/${all._id}`, { amount: 80_001 }), 400, "invalid_input", { message: REDEEM_TOO_MUCH });
    const t = await post(u, { type: "transfer", amount: 1_000, account: bank, toAccount: await u.account("Wallet", { type: "wallet", startingBalance: 0 }) });
    failed(await u.send("PATCH", `/transactions/${t._id}`, { account: fund }), 400, "invalid_input", { message: REDEEM_TOO_MUCH });
    // Dropping a redemption is allowed and puts the value back.
    assert.equal((await u.send("DELETE", `/transactions/${all._id}`)).status, 200);
    assert.deepEqual([await balanceOf(api, bank), await balanceOf(api, fund)], [4_30_000 + 80_000 - 80_000 - 1_000, 80_000]);
    failed(await u.send("POST", "/transactions", { type: "transfer", amount: 1, account: bank, toAccount: theirFund }), 400, "invalid_reference", { path: "toAccount" });
    assert.equal(await balanceOf(api, theirFund), 1_00_000);
});

test("redeem twice at once: never below zero, even when each alone would fit", async () => {
    const u = await api.user("t3-inv-race");
    const bank = await u.account("Bank", { startingBalance: 0 });
    const fund = await holding(u, { name: "Fund", startingBalance: 1_00_000 });
    const r = await par(2, () => u.send("POST", "/transactions", { type: "transfer", amount: 60_000, account: fund, toAccount: bank }));
    assert.deepEqual(statuses(r), [201, 400]);
    failed(r.find((x) => x.status === 400)!, 400, "invalid_input", { message: REDEEM_TOO_MUCH });
    const r3 = await par(3, () => u.send("POST", "/transactions", { type: "transfer", amount: 15_000, account: fund, toAccount: bank }));
    assert.deepEqual(statuses(r3), [201, 201, 400]);
    assert.deepEqual([await balanceOf(api, fund), await balanceOf(api, bank)], [10_000, 90_000]);
    // A redemption and a value update at once both land: the update raises what can come out.
    const [up, out] = await Promise.all([u.send("PATCH", `/accounts/${fund}/balance`, { balance: 50_000 }), u.send("POST", "/transactions", { type: "transfer", amount: 10_000, account: fund, toAccount: bank })]);
    assert.equal(out.status, 201, out.text);
    assert.ok(up.status === 200 || up.status === 409);
    assert.ok((await balanceOf(api, fund)) >= 0);
});

test("basis: total invested restates the opening amount, never the value; refusals", async () => {
    const u = await api.user("t3-inv-basis");
    const bank = await u.account("Bank", { startingBalance: 10_00_000 });
    const fund = await holding(u, { name: "Fund", startingBalance: 1_00_000, currentValue: 1_50_000 });
    await post(u, { type: "transfer", amount: 50_000, account: bank, toAccount: fund });
    await post(u, { type: "transfer", amount: 20_000, account: fund, toAccount: bank });
    const since = daysAgo(200);
    const r = await u.send("PATCH", `/investments/${fund}/basis`, { invested: 2_00_000, investedSince: since, investedHow: "sip" });
    assert.deepEqual([r.status, r.json.message, r.json.data.startingBalance, r.json.data.balance, r.json.data.investedHow, r.json.data.investedSince], [200, "Holding updated", 2_00_000 - 30_000, 1_80_000, "sip", since]);
    const h = (await u.send("GET", "/investments")).json.data.holdings[0];
    assert.deepEqual([h.invested, h.current, h.gain], [2_00_000, 1_80_000, -20_000]);
    const cleared = await u.send("PATCH", `/investments/${fund}/basis`, { investedSince: null, investedHow: null });
    assert.deepEqual([cleared.json.data.investedSince, cleared.json.data.investedHow, cleared.json.data.startingBalance], [null, null, 1_70_000]);
    assert.equal((await u.send("PATCH", `/investments/${fund}/basis`, { invested: 30_000 })).json.data.startingBalance, 0, "exactly what was added here");

    failed(await u.send("PATCH", `/investments/${fund}/basis`, { invested: 29_999 }), 400, "invalid_input", { message: "Invested can't be less than what's already been added here" });
    for (const [body, path] of [[{ invested: -1 }, "invested"], [{ invested: 1.5 }, "invested"], [{ investedSince: daysAgo(-1) }, "investedSince"], [{ investedHow: "weekly" }, "investedHow"], [{ currentValue: 1 }, ""], [{ startingBalance: 1 }, ""]] as const) {
        failed(await u.send("PATCH", `/investments/${fund}/basis`, body), 400, "invalid_input", { path });
    }
    const archived = await holding(u, { name: "Old", startingBalance: 0 });
    await u.send("DELETE", `/accounts/${archived}`);
    for (const id of [bank, archived, theirFund, MISSING, MALFORMED]) failed(await u.send("PATCH", `/investments/${id}/basis`, { invested: 1 }), 404, "not_found", { message: "That holding doesn't exist any more" });
    assert.deepEqual([(await api.ro.col("accounts").find<Acc>({ _id: new ObjectId(theirFund) }))[0].startingBalance, await balanceOf(api, fund)], [1_00_000, 1_80_000]);
    await signedOut(api, "PATCH", `/investments/${fund}/basis`, { invested: 1 });
});

test("delete a holding, undo: every transfer reversed, its bills and default cleared", async () => {
    const u = await api.user("t3-inv-undo");
    const bank = await u.account("Bank", { startingBalance: 10_00_000 });
    const fund = await holding(u, { name: "Doomed", startingBalance: 1_00_000 });
    const cat = await u.category("expense");
    await post(u, { type: "transfer", amount: 40_000, account: bank, toAccount: fund });
    await post(u, { type: "transfer", amount: 15_000, account: fund, toAccount: bank });
    await sync(u, fund, 2_00_000);
    const sipBill = await u.send("POST", "/bills", { name: "SIP", amount: 5_000, dueDate: daysAgo(-5), recurring: true, frequency: "monthly", reminderDays: 0, category: cat, toInvestment: fund, account: bank });
    const paidFrom = await u.send("POST", "/bills", { name: "Paid from it", amount: 1_000, dueDate: daysAgo(-5), recurring: false, reminderDays: 0, category: cat, toInvestment: null, account: fund });
    assert.deepEqual([sipBill.status, paidFrom.status], [201, 201], paidFrom.text);
    assert.equal((await u.send("PATCH", "/users/me", { prefs: { defaultAccount: fund } })).status, 200);

    failed(await u.send("DELETE", `/investments/${fund}`), 400, "invalid_input", { path: "mode" });
    failed(await u.send("DELETE", `/investments/${fund}?mode=later`), 400, "invalid_input", { path: "mode" });
    for (const id of [bank, theirFund, MISSING, MALFORMED]) failed(await u.send("DELETE", `/investments/${id}?mode=undo`), 404, "not_found");
    const r = await u.send("DELETE", `/investments/${fund}?mode=undo&extra=dropped`);
    assert.deepEqual([r.status, r.json.message, r.json.data], [200, "Holding deleted", { removedTransactions: 3, removedBills: 1 }]);
    assert.deepEqual([await balanceOf(api, bank), await api.ro.col("accounts").count({ _id: new ObjectId(fund) }), (await rowsOn(api, fund)).length], [10_00_000, 0, 0]);
    const bills = await api.ro.col("bills").find<{ name: string; account?: ObjectId }>({ userId: new ObjectId(u.id) });
    assert.deepEqual(bills.map((b) => [b.name, b.account ?? null]), [["Paid from it", null]]);
    assert.equal((await api.ro.col("users").find<{ prefs: { defaultAccount: unknown } }>({ _id: new ObjectId(u.id) }))[0].prefs.defaultAccount, null);
    failed(await u.send("DELETE", `/investments/${fund}?mode=undo`), 404, "not_found");
    assert.equal(await balanceOf(api, theirFund), 1_00_000);
    await signedOut(api, "DELETE", `/investments/${fund}?mode=undo`);
});

test("delete a holding, keep: the other side's balance stays; an archived holding is refused; all or nothing", async () => {
    const u = await api.user("t3-inv-keep");
    const bank = await u.account("Bank", { startingBalance: 10_00_000 });
    const fund = await holding(u, { name: "Kept", startingBalance: 0 });
    await post(u, { type: "transfer", amount: 40_000, account: bank, toAccount: fund });
    await post(u, { type: "transfer", amount: 15_000, account: fund, toAccount: bank });
    await post(u, { type: "positiveAdjustment", amount: 5_000, account: fund });
    assert.equal(await balanceOf(api, bank), 9_75_000);

    // A database rule no route can set refuses the rewritten row, after the first transfer was
    // already unwound inside the transaction: nothing of it may stay.
    try {
        await api.db().command({ collMod: "transactions", validator: { $nor: [{ note: "Redeemed from Kept (deleted)" }] }, validationLevel: "strict", validationAction: "error" });
        failed(await u.send("DELETE", `/investments/${fund}?mode=keep`), 500, "internal");
    }
    finally {
        await api.db().command({ collMod: "transactions", validator: {}, validationLevel: "off" });
    }
    assert.deepEqual([await balanceOf(api, bank), await balanceOf(api, fund), (await rowsOn(api, fund)).length], [9_75_000, 30_000, 3]);

    // Archived, it is refused like re-base (gaps row 168), and nothing moves.
    const old = await holding(u, { name: "Old", startingBalance: 0 });
    await post(u, { type: "transfer", amount: 1_000, account: bank, toAccount: old });
    assert.equal((await u.send("DELETE", `/accounts/${old}`)).status, 200);
    failed(await u.send("DELETE", `/investments/${old}?mode=keep`), 404, "not_found", { message: "That holding doesn't exist any more" });
    assert.deepEqual([await balanceOf(api, bank), await balanceOf(api, old)], [9_74_000, 1_000]);

    const r = await u.send("DELETE", `/investments/${fund}?mode=keep`);
    assert.deepEqual([r.status, r.json.data], [200, { removedTransactions: 1, removedBills: 0 }]);
    assert.equal(await balanceOf(api, bank), 9_74_000);
    const left = (await rowsOn(api, bank)).filter((t) => t.toAccount === null || t.toAccount === undefined).map((t) => [t.type, t.amount, t.note]).sort();
    assert.deepEqual(left, [["negativeAdjustment", 40_000, "Moved into Kept (deleted)"], ["positiveAdjustment", 15_000, "Redeemed from Kept (deleted)"]]);
});

test("delete a holding while money moves into it: the bank ends where it started", async () => {
    const u = await api.user("t3-inv-delrace");
    const bank = await u.account("Bank", { startingBalance: 1_00_000 });
    const fund = await holding(u, { name: "Racing", startingBalance: 0 });
    await post(u, { type: "transfer", amount: 10_000, account: bank, toAccount: fund });
    const [del, add] = await Promise.all([
        u.send("DELETE", `/investments/${fund}?mode=undo`),
        u.send("POST", "/transactions", { type: "transfer", amount: 5_000, account: bank, toAccount: fund }),
    ]);
    assert.equal(del.status, 200, del.text);
    if (add.status !== 201) failed(add, 400, "invalid_reference", { path: "toAccount" });
    assert.equal(await balanceOf(api, bank), 1_00_000);
    assert.equal((await rowsOn(api, fund)).length, 0);
});

test("Idempotency-Key on basis and delete; a refused redemption retried with the same key after a value update", async () => {
    const u = await api.user("t3-inv-keys");
    const bank = await u.account("Bank", { startingBalance: 1_00_000 });
    const fund = await holding(u, { name: "Keyed", startingBalance: 10_000 });
    assert.deepEqual([await balanceOf(api, fund), await balanceOf(api, bank)], [10_000, 1_00_000]);
    await replayed(api, u.send, "PATCH", `/investments/${fund}/basis`, { invested: 20_000 }, { body: { invested: 30_000 } });
    assert.equal((await api.ro.col("accounts").find<Acc>({ _id: new ObjectId(fund) }))[0].startingBalance, 20_000);

    // The same body, the same key: refused while the holding is worth too little, saved once it isn't.
    const key = randomUUID();
    const redeem = { type: "transfer", amount: 15_000, account: fund, toAccount: bank };
    failed(await u.send("POST", "/transactions", redeem, keyed(key)), 400, "invalid_input", { message: REDEEM_TOO_MUCH });
    await sync(u, fund, 20_000);
    const ok = await u.send("POST", "/transactions", redeem, keyed(key));
    assert.equal(ok.status, 201, ok.text);
    const again = await u.send("POST", "/transactions", redeem, keyed(key));
    assert.deepEqual([again.status, again.text, again.headers.get("idempotent-replayed")], [201, ok.text, "true"]);
    assert.deepEqual([await balanceOf(api, fund), await balanceOf(api, bank)], [5_000, 1_15_000]);

    await retriedAfterFailure(api, u.send, "PATCH", `/investments/${MISSING}/basis`, { body: { invested: 1 }, status: 404, code: "not_found" }, { path: `/investments/${fund}/basis`, body: { invested: 15_000 } });
    const gone = await holding(u, { name: "Gone", startingBalance: 0 });
    await post(u, { type: "transfer", amount: 3_000, account: bank, toAccount: gone });
    await retriedAfterFailure(api, u.send, "DELETE", `/investments/${MISSING}?mode=undo`, { status: 404, code: "not_found" }, { path: `/investments/${gone}?mode=undo` });
    const last = await holding(u, { name: "Last", startingBalance: 0 });
    await replayed(api, u.send, "DELETE", `/investments/${last}?mode=undo`, undefined, { path: `/investments/${last}?mode=keep` });
    assert.deepEqual([await balanceOf(api, bank), await api.ro.col("accounts").count({ _id: { $in: [new ObjectId(gone), new ObjectId(last)] } })], [1_15_000, 0]);
});
