import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/bannerCopy.test.ts

fake("@/store/settings", { useSettings: { getState: () => ({ privacyMode: false, peeking: false }) } });

const copy = require("./bannerCopy") as typeof import("./bannerCopy");
// Expected figures come from the formatter itself, so these hold however it prints paise.
const { formatMoneyExact: rs } = require("./money") as typeof import("./money");
const { compose } = copy;

const open = { masked: false };
const hidden = { masked: true };
const bill = (over: Partial<Parameters<typeof copy.billNotice>[0]>) =>
  copy.billNotice({ name: "Rent", amount: 28_000_00, sip: false, days: 0, lead: 3, on: "18 Nov", ...over })!;

test("bill due today: amount in the body, title-only with privacy on", () => {
  const n = bill({ days: 0 });
  assert.equal(n.when, "today");
  assert.deepEqual(compose(n, open), { title: "Rent is due today", body: `${rs(28_000_00)} due today.` });
  assert.deepEqual(compose(n, hidden), { title: "Rent is due today" });
});

test("bill due soon keeps its date with privacy on", () => {
  const n = bill({ name: "Internet", amount: 999_00, days: 3 });
  assert.equal(n.when, "due");
  assert.deepEqual(compose(n, open), { title: "Internet due in 3 days", body: `${rs(999_00)} due on 18 Nov.` });
  assert.deepEqual(compose(n, hidden), { title: "Internet due in 3 days", body: "Due on 18 Nov." });
  assert.equal(compose(bill({ days: 1 }), hidden).title, "Rent due in 1 day");
});

test("bill overdue keeps how late it is with privacy on", () => {
  const n = bill({ name: "Credit card", amount: 12_000_00, days: -2 });
  assert.equal(n.when, "overdue");
  assert.deepEqual(compose(n, open), { title: "Credit card is overdue", body: `${rs(12_000_00)} was due 2 days ago.` });
  assert.deepEqual(compose(n, hidden), { title: "Credit card is overdue", body: "Was due 2 days ago." });
  assert.equal(compose(bill({ days: -1 }), hidden).body, "Was due 1 day ago.");
});

test("a bill outside its lead window says nothing", () => {
  assert.equal(copy.billNotice({ name: "Rent", amount: 1, sip: false, days: 4, lead: 3, on: "x" }), null);
});

test("SIP bills read as investing and are title-only with privacy on", () => {
  const cases = [
    { days: -2, title: "Index fund — SIP overdue", body: `${rs(5_000_00)} was due to invest 2 days ago.` },
    { days: 0, title: "Time to invest — Index fund", body: `${rs(5_000_00)} to invest today.` },
    { days: 2, title: "Index fund · invest in 2 days", body: `${rs(5_000_00)} to invest on 18 Nov.` },
  ];
  for (const c of cases) {
    const n = bill({ name: "Index fund", amount: 5_000_00, sip: true, days: c.days });
    assert.deepEqual(compose(n, open), { title: c.title, body: c.body });
    assert.deepEqual(compose(n, hidden), { title: c.title });
  }
});

test("goal deadline is title-only with privacy on", () => {
  const today = copy.goalDeadlineNotice("Goa trip", 0, 20_000_00);
  assert.deepEqual(compose(today, open), { title: "Goa trip is due today", body: `${rs(20_000_00)} still to go.` });
  assert.deepEqual(compose(today, hidden), { title: "Goa trip is due today" });
  assert.deepEqual(compose(copy.goalDeadlineNotice("Goa trip", 3, 1), hidden), { title: "Goa trip is due in 3 days" });
});

test("goal milestone keeps the percentage and drops the amounts", () => {
  const half = copy.goalMilestoneNotice("Emergency fund", 50, 50_000_00, 1_00_000_00);
  assert.deepEqual(compose(half, open), {
    title: "Emergency fund hit 50%",
    body: `${rs(50_000_00)} of ${rs(1_00_000_00)} saved.`,
  });
  assert.deepEqual(compose(half, hidden), { title: "Emergency fund hit 50%" });
  assert.deepEqual(compose(copy.goalMilestoneNotice("Bike", 100, 9, 9), hidden), { title: "Bike is fully funded" });
});

test("daily digest: flow, owed nudge, both, or nothing", () => {
  const owed = copy.owedLine("Ravi", 1_250_00, "1 Nov");
  assert.equal(owed, `Ravi has owed you ${rs(1_250_00)} since 1 Nov`);
  assert.equal(copy.owedLine("Ravi", -300_00, "1 Nov"), `You've owed Ravi ${rs(300_00)} since 1 Nov`);

  const flow = { income: 0, expenses: 6_350_00 };
  const both = copy.dailyNotice("14 Nov", flow, owed)!;
  assert.deepEqual(compose(both, open), { title: "14 Nov in review", body: `${copy.flowLine(0, 6_350_00)} · ${owed}` });
  assert.deepEqual(compose(both, hidden), { title: "14 Nov in review", body: "Your daily summary is ready." });

  assert.equal(compose(copy.dailyNotice("14 Nov", flow, null)!, open).body, copy.flowLine(0, 6_350_00));
  const nudgeOnly = copy.dailyNotice("14 Nov", null, owed)!;
  assert.equal(compose(nudgeOnly, open).body, owed);
  assert.equal(compose(nudgeOnly, hidden).body, "Your daily summary is ready.");

  assert.equal(copy.dailyNotice("14 Nov", null, null), null);
});

test("the flow line says what was put aside or overspent", () => {
  assert.equal(copy.flowLine(10_000_00, 4_000_00), `Spent ${rs(4_000_00)}, earned ${rs(10_000_00)} — ${rs(6_000_00)} put aside.`);
  assert.equal(copy.flowLine(1_000_00, 4_000_00), `Spent ${rs(4_000_00)}, earned ${rs(1_000_00)} — ${rs(3_000_00)} more than you earned.`);
});

test("weekly and monthly digests say only that they're ready with privacy on", () => {
  const flow = { income: 1_20_000_00, expenses: 79_640_20 };
  const week = copy.weeklyNotice("9 Nov", "15 Nov", flow);
  assert.deepEqual(compose(week, open), { title: "9 Nov–15 Nov in review", body: copy.flowLine(flow.income, flow.expenses) });
  assert.deepEqual(compose(week, hidden), { title: "9 Nov–15 Nov in review", body: "Your weekly summary is ready." });
  const month = copy.monthlyNotice("October 2026", flow);
  assert.deepEqual(compose(month, hidden), { title: "October 2026 in review", body: "Your monthly summary is ready." });
  assert.equal(compose(month, open).body, copy.flowLine(flow.income, flow.expenses));
});

test("investment and repeat-payment banners carry no amounts, so privacy leaves them alone", () => {
  for (const n of [copy.investmentNotice(1), copy.investmentNotice(3), copy.recurringNotice(["Netflix"]), copy.recurringNotice(["A", "B"])]) {
    assert.deepEqual(compose(n, hidden), compose(n, open));
  }
  assert.equal(copy.investmentNotice(1).body, "Update what your 1 investment is worth today to keep your net worth accurate.");
  assert.equal(copy.recurringNotice(["Netflix"]).title, "Netflix looks like a monthly payment");
  assert.equal(copy.recurringNotice(["A", "B"]).title, "2 payments look like they repeat");
});

test("no banner kind shows a rupee sign or an empty body with privacy on", () => {
  const all = [
    bill({ days: -3 }), bill({ days: 0 }), bill({ days: 2 }),
    bill({ sip: true, days: -3 }), bill({ sip: true, days: 0 }), bill({ sip: true, days: 2 }),
    copy.goalDeadlineNotice("G", 0, 5_00), copy.goalDeadlineNotice("G", 5, 5_00),
    copy.goalMilestoneNotice("G", 25, 1_00, 4_00), copy.goalMilestoneNotice("G", 100, 4_00, 4_00),
    copy.dailyNotice("1 Nov", { income: 1, expenses: 2 }, copy.owedLine("R", 5_00, "1 Oct"))!,
    copy.weeklyNotice("a", "b", { income: 1, expenses: 0 }),
    copy.monthlyNotice("m", { income: 0, expenses: 1 }),
    copy.investmentNotice(2), copy.recurringNotice(["X"]),
  ];
  for (const n of all) {
    const c = compose(n, hidden);
    assert.ok(!`${c.title} ${c.body ?? ""}`.includes("₹"), `${c.title} leaks an amount`);
    assert.ok(!("body" in c) || c.body!.length > 0, `${c.title} has an empty body`);
    assert.ok(compose(n, open).body!.length > 0, `${n.title} has no unmasked body`);
  }
});
