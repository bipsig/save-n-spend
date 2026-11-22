import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/backup.test.ts

const reads: { path: string; opts?: { cache?: boolean } }[] = [];
let answer: () => Promise<unknown> = async () => ({ version: 1 });
const shared: string[] = [];

fake("@/lib/api", {
  get: async (path: string, opts?: { cache?: boolean }) => {
    reads.push({ path, opts });
    return answer();
  },
  post: async () => null,
});
fake("@/lib/export", { dayStamp: () => "2026-11-22" });
fake("expo-document-picker", {});
fake("expo-file-system/legacy", { cacheDirectory: "file:///cache/", EncodingType: { UTF8: "utf8" }, writeAsStringAsync: async () => {} });
fake("expo-sharing", { isAvailableAsync: async () => true, shareAsync: async (uri: string) => { shared.push(uri); } });

const backup = require("./backup") as typeof import("./backup");

test("a backup is read from the server only, never the saved copy (gaps row 8)", async () => {
  await backup.exportBackup();
  assert.deepEqual(reads, [{ path: "/backup", opts: { cache: false } }]);
  assert.deepEqual(shared, ["file:///cache/save-n-spend-backup-2026-11-22.json"]);
});

test("no answer makes no file", async () => {
  shared.length = 0;
  answer = async () => { throw new Error("You're offline"); };
  await assert.rejects(backup.exportBackup(), /offline/);
  assert.deepEqual(shared, []);
});
