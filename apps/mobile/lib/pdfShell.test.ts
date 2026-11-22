import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/pdfShell.test.ts

const session = { user: { prefs: { timeZone: "Asia/Kolkata" } } };
fake("@/store/session", { useSession: { getState: () => session } });

const shell = require("./pdfShell") as typeof import("./pdfShell");

test("every PDF prints dates, signs and amount colours one way (gaps row 163)", () => {
  // 21 Nov, 00:30 in India is still the 20th in UTC: the account's day.
  assert.equal(shell.pdfDate("2026-11-20T19:00:00Z"), "21 Nov 2026");
  assert.equal(shell.pdfDay("2026-11-21"), "21 Nov 2026");
  assert.deepEqual([1, 0, -1].map(shell.amountTone), ["pos", "", "neg"]);
  const html = shell.pdfDocument({ section: "Transactions", rangeLabel: "November 2026", meta: "", body: "" });
  for (const rule of [".amt.pos", ".amt.neg", ".amt.out", ".legend", ".dot"]) assert.ok(html.includes(rule), rule);
  assert.equal(shell.PDF_CHART.width, 540);
});
