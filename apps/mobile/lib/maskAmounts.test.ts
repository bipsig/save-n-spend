import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/maskAmounts.test.ts

fake("@/store/settings", { useSettings: { getState: () => ({ privacyMode: false, peeking: false }) } });

const { AMOUNT_HIDDEN, maskAmounts, splitAmounts } = require("./maskAmounts") as typeof import("./maskAmounts");
const { MASKED_MONEY: M } = require("./money") as typeof import("./money");

test("whole-rupee server sentences (before 2.8.4)", () => {
  assert.equal(maskAmounts("₹4,200 of ₹5,000 spent"), `${M} of ${M} spent`);
  assert.equal(maskAmounts("In ₹0 · out ₹6,350"), `In ${M} · out ${M}`);
  assert.equal(maskAmounts("₹999 due today"), `${M} due today`);
  assert.equal(maskAmounts("₹33,910 saved this period"), `${M} saved this period`);
  assert.equal(
    maskAmounts("₹4,200 of ₹5,000 spent with 15 days left — about ₹280 a day in it."),
    `${M} of ${M} spent with 15 days left — about ${M} a day in it.`,
  );
});

test("exact-paise, one-decimal server sentences (2.8.4)", () => {
  assert.equal(maskAmounts("₹33,909.80 saved this period"), `${M} saved this period`);
  assert.equal(maskAmounts("Down 6.0% from last time."), "Down 6.0% from last time.");
  assert.equal(
    maskAmounts("Keeping 15.0% of what comes in. The usual target is 20.0% — about ₹24,000.00 a month at your income."),
    `Keeping 15.0% of what comes in. The usual target is 20.0% — about ${M} a month at your income.`,
  );
  assert.equal(maskAmounts("₹4,200.50 of ₹5,000.00 spent"), `${M} of ${M} spent`);
});

test("Indian grouping, lakhs and crores", () => {
  assert.equal(maskAmounts("₹1,00,000.00 saved"), `${M} saved`);
  assert.equal(maskAmounts("₹12,34,56,789 net worth"), `${M} net worth`);
  assert.equal(maskAmounts("about ₹2.4L"), `about ${M}`);
  assert.equal(maskAmounts("₹1.2 lakh on hand, ₹3 crores later, ₹5Cr, ₹12k"), `${M} on hand, ${M} later, ${M}, ${M}`);
});

test("signs go with the figure", () => {
  assert.equal(maskAmounts("+₹17,600.00 this period"), `${M} this period`);
  assert.equal(maskAmounts("Net −₹450.25 today"), `Net ${M} today`);
  assert.equal(maskAmounts("Net -₹450 today"), `Net ${M} today`);
  assert.equal(maskAmounts("(−₹450)"), `(${M})`);
  // A hyphen joined to a word is a hyphen, not a minus.
  assert.equal(maskAmounts("pre-₹500 era"), `pre-${M} era`);
});

test("ranges", () => {
  assert.equal(maskAmounts("₹4,200 of ₹5,000"), `${M} of ${M}`);
  assert.equal(maskAmounts("₹4,200–₹5,000 a month"), `${M}–${M} a month`);
  assert.equal(maskAmounts("₹4,200–5,000 a month"), `${M} a month`);
  assert.equal(maskAmounts("₹4,200-5,000.50 a month"), `${M} a month`);
});

test("punctuation next to a figure stays", () => {
  assert.equal(maskAmounts("Rent, ₹28,000."), `Rent, ${M}.`);
  assert.equal(maskAmounts("₹28,000, then ₹1,000"), `${M}, then ${M}`);
  assert.equal(maskAmounts("₹500: done"), `${M}: done`);
  assert.equal(maskAmounts("₹ 500 with a space"), `${M} with a space`);
  assert.equal(maskAmounts("₹\u00A0500 with a no-break space"), `${M} with a no-break space`);
});

test("words, percentages and other numbers stay", () => {
  for (const s of ["Up 4% from last time.", "3 bills due in 2 days", "Your daily summary is ready.", "", "₹", "₹ •••• already", "Rs 500 isn't ours"]) {
    assert.equal(maskAmounts(s), s);
  }
  // Masking twice changes nothing.
  const once = maskAmounts("₹4,200 of ₹5,000 spent");
  assert.equal(maskAmounts(once), once);
});

test("VoiceOver reads 'amount hidden' in each figure's place", () => {
  assert.equal(maskAmounts("₹4,200 of ₹5,000 spent", AMOUNT_HIDDEN), "amount hidden of amount hidden spent");
});

test("splitting gives the sentence back unchanged", () => {
  for (const s of ["₹4,200 of ₹5,000 spent", "Biggest expense of the period: Rent, ₹28,000.00", "+₹1 and −₹2", "no figures"]) {
    assert.equal(splitAmounts(s).map((p) => p.text).join(""), s);
  }
  assert.deepEqual(splitAmounts("Rent, ₹28,000."), [
    { text: "Rent, ", amount: false },
    { text: "₹28,000", amount: true },
    { text: ".", amount: false },
  ]);
  assert.deepEqual(splitAmounts("₹1"), [{ text: "₹1", amount: true }]);
});
