import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveNotice } from "./archiveNotice";

const rs = (p: number) => `₹${(p / 100).toFixed(2)}`;

test("archive confirm: names the money left, the bills it pays and the SIPs it pauses", () => {
  const bills = [{ account: "a" }, { account: "a" }, { account: "b", toInvestment: "a" }, { account: "b" }];
  assert.equal(
    archiveNotice({ _id: "a", balance: 1_234_50, type: "bank" }, bills, rs),
    "₹1234.50 is still in it. It disappears from your pickers and stops counting toward your totals. 2 bills paid from it will use your default account. Its SIP is paused until you pick another holding. Transactions already recorded against it keep their history.",
  );
});

test("archive confirm: an empty account says only what disappears; debt and people read the right way round; privacy masks through the formatter", () => {
  assert.equal(archiveNotice({ _id: "a", balance: 0, type: "bank" }, [], rs), "It disappears from your pickers. Transactions already recorded against it keep their history.");
  assert.match(archiveNotice({ _id: "a", balance: 500, type: "wallet" }, [], () => "₹ ••••"), /^₹ •••• is still in it\./);
  assert.match(archiveNotice({ _id: "a", balance: -500, type: "credit_card" }, [], rs), /^₹5\.00 is still owed on it\./);
  assert.match(archiveNotice({ _id: "a", balance: 500, type: "person" }, [], rs), /^They still owe you ₹5\.00\./);
  assert.match(archiveNotice({ _id: "a", balance: -500, type: "person" }, [], rs), /^You still owe them ₹5\.00\./);
});
