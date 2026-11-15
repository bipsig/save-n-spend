import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Run from apps/api: node --require ts-node/register --test ../mobile/lib/formKeys.test.ts
//
// Every create and money-moving write in a screen or sheet must pass an Idempotency-Key
// (decision 7). Reads the source, since the forms can't be rendered under node.

const ROOT = join(__dirname, "..");

/** Helpers in lib/ that create a record or move money; each takes request options last. */
const KEYED_HELPERS = [
  "createAccount", "syncAccountBalance", "createTrip", "addTripExpense", "updateTripExpense",
  "settleTrip", "closeTrip", "savePlan", "commitImport", "bulkConvertToInvestment",
  "convertToInvestment", "createCategory",
];

/** Raw `post(` calls that need no key: auth, reads sent as POST, and writes that are already
 *  idempotent on the server. */
const UNKEYED_POSTS = ["/auth/", "/recurring/dismiss", "/notifications", "/backup/restore", "/import/preview", "/reopen"];

/** Known gaps, each waiting on a file another worker owns. Remove an entry once it's fixed. */
const PENDING: Record<string, string> = {};

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });

/** The text between a call's parentheses, skipping string and template contents. */
const argsAt = (src: string, open: number): string => {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  throw new Error("unbalanced call");
};

type Call = { file: string; callee: string; args: string };

const writeCalls = (): Call[] => {
  const calls: Call[] = [];
  for (const path of [...sources(join(ROOT, "app")), ...sources(join(ROOT, "components")), join(ROOT, "store/outbox.ts")]) {
    const src = readFileSync(path, "utf8");
    const file = relative(ROOT, path);
    const re = new RegExp(`(?<![\\w.])(${[...KEYED_HELPERS, "post", "put", "patch"].join("|")})(?:<[^>()]*>)?\\(`, "g");
    for (const m of src.matchAll(re)) {
      const callee = m[1];
      const args = argsAt(src, m.index! + m[0].length - 1);
      const path0 = /^\s*[`"']([^`"']*)/.exec(args)?.[1] ?? "";
      if (callee === "post" && UNKEYED_POSTS.some((p) => path0.includes(p))) continue;
      // Edits that neither create nor move money (renames, limits) take no key.
      if ((callee === "patch" || callee === "put") && !path0.startsWith("/transactions")) continue;
      calls.push({ file, callee, args });
    }
  }
  return calls;
};

test("every create and money-moving write from a form passes an Idempotency-Key", () => {
  const calls = writeCalls();
  // The sweep found the forms: if this drops, the scan broke rather than the forms got fixed.
  assert.ok(calls.length >= 24, `only ${calls.length} write calls found`);
  const missing = calls
    .filter((c) => !/idempotencyKey/.test(c.args))
    .map((c) => `${c.file}:${c.callee}`)
    .filter((id) => !(id in PENDING));
  assert.deepEqual(missing, []);
});

test("the forms named in the brief are all covered", () => {
  const files = new Set(writeCalls().filter((c) => /idempotencyKey/.test(c.args)).map((c) => c.file));
  for (const f of [
    "app/add-transaction.tsx", "app/add-goal.tsx", "app/trip-wrapup.tsx", "app/trip-import.tsx", "app/bills.tsx",
    "components/sheets/MarkPaidSheet.tsx", "components/sheets/ContributeSheet.tsx", "components/sheets/EditBillSheet.tsx",
    "components/sheets/BudgetLimitSheet.tsx", "components/sheets/CategoryPickerSheet.tsx", "components/sheets/EditAccountSheet.tsx",
    "components/sheets/AccountPickerSheet.tsx", "components/sheets/RevalueSheet.tsx", "components/sheets/TripSheet.tsx",
    "components/sheets/TripExpenseSheet.tsx", "components/sheets/SettleSheet.tsx", "components/sheets/MatchSplitwiseSheet.tsx",
    "store/outbox.ts",
  ]) assert.ok(files.has(f), f);
});

test("a pending gap is still a gap", () => {
  // Fails once the other worker's fix lands, so the entry gets removed instead of hiding a regression.
  const calls = writeCalls();
  for (const id of Object.keys(PENDING)) {
    const matching = calls.filter((c) => `${c.file}:${c.callee}` === id);
    assert.ok(matching.length > 0 && matching.some((c) => !/idempotencyKey/.test(c.args)), `${id} now passes a key: remove it from PENDING`);
  }
});
