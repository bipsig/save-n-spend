import { test } from "node:test";
import assert from "node:assert/strict";
import { fake, memoryFileSystem, relaunch } from "../test/node";
import { EPOCH_FILE, RESPONSE_EPOCH } from "./cacheEpoch";
import type { OutboxItem } from "./outbox";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/offlineCache.test.ts
//
// The real lib/offlineCache.ts and lib/outbox.ts on an in-memory disk. A "launch" is a fresh
// copy of the modules over the same disk.

const DIR = "file:///doc/offline-cache/";
const MARKER = `${DIR}${EPOCH_FILE}`;

const launch = (fs: ReturnType<typeof memoryFileSystem>) => {
  fake("expo-file-system/legacy", fs.api);
  relaunch();
  return {
    cache: require("./offlineCache") as typeof import("./offlineCache"),
    outbox: require("./outbox") as typeof import("./outbox"),
  };
};

const legacyItem: OutboxItem = {
  clientId: "old-1", payload: { type: "expense", amount: 1200, clientId: "old-1" }, createdAt: 1, status: "queued",
};

/** A disk as 2.6.0 left it: cached responses, the signed-in user and a queue, no marker. */
const oldAppDisk = async () => {
  const fs = memoryFileSystem();
  const { cache, outbox } = launch(fs);
  await cache.write("/auth/me", { _id: "u1" });
  await cache.write("/categories", [{ _id: "c1" }]);
  await cache.write("/transactions?page=1", { docs: [] });
  await outbox.writeOutbox("u1", [legacyItem]);
  fs.files.delete(MARKER);
  return fs;
};

test("the first launch of the new app clears old responses once and keeps the user and the queue", async () => {
  const fs = await oldAppDisk();
  const { cache, outbox } = launch(fs);
  assert.equal(await cache.read("/categories"), null);
  assert.equal(await cache.read("/transactions?page=1"), null);
  assert.deepEqual((await cache.read("/auth/me"))?.data, { _id: "u1" });
  assert.deepEqual(await outbox.readOutbox("u1"), [legacyItem]);
  assert.deepEqual(JSON.parse(fs.files.get(MARKER)!), { epoch: RESPONSE_EPOCH });
});

test("later launches don't clear again", async () => {
  const fs = await oldAppDisk();
  const first = launch(fs);
  await first.cache.read("/auth/me");
  await first.cache.write("/categories", [{ _id: "c2" }]);

  for (let i = 0; i < 3; i++) {
    const { cache } = launch(fs);
    assert.deepEqual((await cache.read("/categories"))?.data, [{ _id: "c2" }]);
  }
});

test("a clear that fails leaves the marker unwritten, so the next launch tries again", async () => {
  const fs = await oldAppDisk();
  const stuck = [...fs.files.keys()].find((f) => fs.files.get(f)!.includes("/categories"))!;
  fs.failing.add(stuck);
  const first = launch(fs);
  await first.cache.read("/auth/me");
  assert.equal(fs.files.has(MARKER), false);

  fs.failing.clear();
  const second = launch(fs);
  assert.equal(await second.cache.read("/categories"), null);
  assert.equal(fs.files.has(MARKER), true);
});

test("sign-out's clear keeps the queue and the marker", async () => {
  const fs = await oldAppDisk();
  const { cache, outbox } = launch(fs);
  await cache.write("/accounts", []);
  await cache.clearAll();
  assert.equal(await cache.read("/auth/me"), null);
  assert.equal(await cache.read("/accounts"), null);
  assert.deepEqual(await outbox.readOutbox("u1"), [legacyItem]);
  assert.equal(fs.files.has(MARKER), true);

  // So signing in again on the same launch, or the next one, doesn't redo the upgrade.
  await cache.write("/accounts", [{ _id: "a1" }]);
  assert.deepEqual((await launch(fs).cache.read("/accounts"))?.data, [{ _id: "a1" }]);
});

test("an entry with another shape version or path reads as a miss", async () => {
  const fs = memoryFileSystem();
  const { cache } = launch(fs);
  await cache.write("/bills", ["b"]);
  const file = [...fs.files.keys()].find((f) => fs.files.get(f)!.includes("\"/bills\""))!;
  const entry = JSON.parse(fs.files.get(file)!);
  fs.files.set(file, JSON.stringify({ ...entry, v: 0 }));
  assert.equal(await cache.read("/bills"), null);
  fs.files.set(file, JSON.stringify({ ...entry, path: "/other" }));
  assert.equal(await cache.read("/bills"), null);
  fs.files.set(file, "{broken");
  assert.equal(await cache.read("/bills"), null);
});

test("prune drops old and unreadable entries only", async () => {
  const fs = memoryFileSystem();
  const { cache, outbox } = launch(fs);
  await cache.write("/old", 1);
  await cache.write("/new", 2);
  await outbox.writeOutbox("u1", [legacyItem]);
  const oldFile = [...fs.files.keys()].find((f) => fs.files.get(f)!.includes("\"/old\""))!;
  fs.files.set(oldFile, JSON.stringify({ ...JSON.parse(fs.files.get(oldFile)!), fetchedAt: Date.now() - 10_000 }));
  fs.files.set(`${DIR}junk.json`, "not json");
  await cache.prune(5_000);
  assert.equal(await cache.read("/old"), null);
  assert.equal((await cache.read("/new"))?.data, 2);
  assert.equal(fs.files.has(`${DIR}junk.json`), false);
  assert.deepEqual(await outbox.readOutbox("u1"), [legacyItem]);
});

test("a 2.6.0 queue file loads as it is; a missing or broken one is empty", async () => {
  const fs = memoryFileSystem();
  const { outbox } = launch(fs);
  fs.files.set(`${DIR}outbox.u1.json`, JSON.stringify([legacyItem]));
  assert.deepEqual(await outbox.readOutbox("u1"), [legacyItem]);
  assert.deepEqual(await outbox.readOutbox("u2"), []);
  fs.files.set(`${DIR}outbox.u3.json`, "[{");
  assert.deepEqual(await outbox.readOutbox("u3"), []);

  // Written back with the key the first send gave it; 2.6.0 ignores the extra fields.
  await outbox.writeOutbox("u1", [{ ...legacyItem, idempotencyKey: "k1" }]);
  assert.equal((await launch(fs).outbox.readOutbox("u1"))[0].idempotencyKey, "k1");
});
