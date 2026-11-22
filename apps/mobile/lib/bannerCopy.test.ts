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
  assert.equal(compose(bill({ days: 1 }), hidden).title, "Rent due tomorrow");
});

test("bill overdue keeps how late it is with privacy on", () => {
  const n = bill({ name: "Credit card", amount: 12_000_00, days: -2 });
  assert.equal(n.when, "overdue");
  assert.deepEqual(compose(n, open), { title: "Credit card is overdue", body: `${rs(12_000_00)}, overdue by 2 days.` });
  assert.deepEqual(compose(n, hidden), { title: "Credit card is overdue", body: "Overdue by 2 days." });
  assert.equal(compose(bill({ days: -1 }), hidden).body, "Overdue by 1 day.");
});

test("a bill outside its lead window says nothing", () => {
  assert.equal(copy.billNotice({ name: "Rent", amount: 1, sip: false, days: 4, lead: 3, on: "x" }), null);
});

test("SIP bills read as investing and keep their date or days late with privacy on", () => {
  const cases = [
    { days: -2, title: "Index fund — SIP overdue", body: `${rs(5_000_00)} to invest, overdue by 2 days.`, hidden: "To invest, overdue by 2 days." },
    { days: -1, title: "Index fund — SIP overdue", body: `${rs(5_000_00)} to invest, overdue by 1 day.`, hidden: "To invest, overdue by 1 day." },
    { days: 0, title: "Time to invest — Index fund", body: `${rs(5_000_00)} to invest today.`, hidden: "To invest today." },
    { days: 2, title: "Index fund · due in 2 days", body: `${rs(5_000_00)} to invest on 18 Nov.`, hidden: "To invest on 18 Nov." },
  ];
  for (const c of cases) {
    const n = bill({ name: "Index fund", amount: 5_000_00, sip: true, days: c.days });
    assert.deepEqual(compose(n, open), { title: c.title, body: c.body });
    assert.deepEqual(compose(n, hidden), { title: c.title, body: c.hidden });
  }
});

test("goal deadline is title-only with privacy on", () => {
  const today = copy.goalDeadlineNotice("Goa trip", 0, 20_000_00);
  assert.deepEqual(compose(today, open), { title: "Goa trip is due today", body: `${rs(20_000_00)} still to go.` });
  assert.deepEqual(compose(today, hidden), { title: "Goa trip is due today" });
  assert.deepEqual(compose(copy.goalDeadlineNotice("Goa trip", 3, 1), hidden), { title: "Goa trip is due in 3 days" });
  assert.deepEqual(compose(copy.goalDeadlineNotice("Goa trip", 1, 1), hidden), { title: "Goa trip is due tomorrow" });
});

test("banners say when a bill is due in the bell's words (gaps row 153)", async () => {
  const { duePhrase } = await import("../../api/src/utils/duePhrase");
  for (const d of [-3, -1, 1, 2]) {
    const n = bill({ name: "Rent", amount: 100, days: d, lead: 5 });
    assert.ok(compose(n, open).title.includes(duePhrase(d)) || compose(n, open).body!.includes(duePhrase(d)), `days ${d}`);
  }
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

test("the flow line counts each closed trip as one expense, with no trips clause", () => {
  // November so far with Udupi closed 12 Nov: ₹1,15,731.77 spent, Trips included.
  assert.equal(
    copy.flowLine(0, 1_15_731_77),
    `Spent ${rs(1_15_731_77)}, earned ${rs(0)} — ${rs(1_15_731_77)} more than you earned.`,
  );
  assert.equal(copy.flowLine(1_20_000_00, 86_090_20), `Spent ${rs(86_090_20)}, earned ${rs(1_20_000_00)} — ${rs(33_909_80)} put aside.`);
});

test("digests carry the flow line with privacy off and only 'ready' with it on", () => {
  const flow = { income: 1_20_000_00, expenses: 86_090_20 };
  const line = copy.flowLine(flow.income, flow.expenses);
  assert.equal(line.includes("on trips"), false);
  const day = copy.dailyNotice("14 Nov", flow, null)!;
  const week = copy.weeklyNotice("9 Nov", "15 Nov", flow);
  const month = copy.monthlyNotice("October 2026", flow);
  assert.deepEqual([compose(day, open).body, compose(week, open).body, compose(month, open).body], [line, line, line]);
  assert.deepEqual(
    [compose(day, hidden).body, compose(week, hidden).body, compose(month, hidden).body],
    ["Your daily summary is ready.", "Your weekly summary is ready.", "Your monthly summary is ready."],
  );
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
