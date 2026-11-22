import { test } from "node:test";
import assert from "node:assert/strict";
import type { IAccount } from "@save-n-spend/types";
import { groupAccounts } from "./accountGroups";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/accountGroups.test.ts

const acc = (_id: string, type: IAccount["type"], balance = 0) => ({ _id, name: _id, type, balance }) as IAccount;
const list = [acc("HDFC", "bank", 100), acc("Kabir", "person"), acc("Ravi", "person", 500), acc("PPF", "investment", 9), acc("Isha", "person"), acc("Meera", "person", -200)];
const names = (rows: IAccount[]) => rows.map((a) => a._id);

test("one grouping for the picker, Manage accounts and Activity's filter (gaps row 166)", () => {
  const picker = groupAccounts(list, { openFirst: true });
  assert.deepEqual(picker.map((g) => [g.label, names(g.rows), g.settledFrom]), [
    ["Accounts", ["HDFC"], -1], ["Investments", ["PPF"], -1], ["People", ["Ravi", "Meera", "Kabir", "Isha"], 2],
  ]);

  const manage = groupAccounts(list, { fold: true });
  const people = manage.find((g) => g.people)!;
  assert.deepEqual([names(people.rows), people.open, people.settled], [["Ravi", "Meera"], 2, 2], "list order kept, settled folded");

  const filter = groupAccounts(list, { fold: true, openFirst: true, keep: ["Isha"] });
  assert.deepEqual(names(filter.find((g) => g.people)!.rows), ["Ravi", "Meera", "Isha"], "a picked settled person stays");
});

test("a group of only settled people keeps its heading while folded; empty groups go", () => {
  const groups = groupAccounts([acc("Kabir", "person")], { fold: true });
  assert.deepEqual(groups.map((g) => [g.label, g.rows.length, g.settled]), [["People", 0, 1]]);
  assert.deepEqual(groupAccounts([]), []);
});
