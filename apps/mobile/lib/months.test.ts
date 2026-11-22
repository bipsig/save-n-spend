import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { MONTHS, shortDay } from "./format/months";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/months.test.ts

test("the month table says Sep", () => {
  assert.equal(MONTHS[8], "Sep");
  assert.equal(shortDay(new Date(Date.UTC(2026, 8, 11))), "11 Sep");
  assert.equal(shortDay(new Date(Date.UTC(2026, 0, 1))), "1 Jan");
});

test("no date label goes through Intl, which prints Sept (gaps row 59)", () => {
  const root = join(__dirname, "..");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) files.push(path);
    }
  };
  for (const dir of ["app", "components", "lib", "store"]) walk(join(root, dir));
  const offenders = files.filter((f) => /month: "(short|long)"|toLocaleDateString\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders.map((f) => f.slice(root.length + 1)), []);
});
