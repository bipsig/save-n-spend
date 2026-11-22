import { test } from "node:test";
import assert from "node:assert/strict";
import { fake, memoryFileSystem, relaunch } from "../test/node";
import { EPOCH_FILE, RESPONSE_EPOCH } from "./cacheEpoch";
import type { OutboxItem } from "./outbox";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/offlineCache.test.ts
//
// The real lib/offlineCache.ts and lib/outbox.ts on an in-memory disk. A "launch" is a fresh
// copy of the modules over the same disk. Copies are saved per user (gaps row 179).

const DIR = "file:///doc/offline-cache/";
const MARKER = `${DIR}${EPOCH_FILE}`;
const U1 = "65a1b2c3d4e5f60718293a41";
const U2 = "65a1b2c3d4e5f60718293a42";

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

/** The file name 2.8.5 gave a path (FNV-1a of the path alone). */
const legacyName = (path: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${DIR}${(hash >>> 0).toString(36)}.json`;
};
const legacyEntry = (path: string, data: unknown, fetchedAt = Date.now()) => JSON.stringify({ v: 1, path, fetchedAt, data });

/** A disk as 2.8.5 left it: unowned responses and a queue, at the current epoch. */
const oldAppDisk = (epoch: number | null = RESPONSE_EPOCH) => {
  const fs = memoryFileSystem();
  fs.files.set(legacyName("/auth/me"), legacyEntry("/auth/me", { _id: U1 }));
  fs.files.set(legacyName("/categories"), legacyEntry("/categories", [{ _id: "c1" }]));
  fs.files.set(legacyName("/transactions?page=1"), legacyEntry("/transactions?page=1", { items: [] }));
  fs.files.set(`${DIR}outbox.${U1}.json`, JSON.stringify([legacyItem]));
  if (epoch !== null) fs.files.set(MARKER, JSON.stringify({ epoch }));
  return fs;
};

test("one user's saved copy is never served to another, or to no one", async () => {
  const { cache } = launch(memoryFileSystem());
  await cache.write("/accounts", [{ _id: "a1" }], U1);
  assert.deepEqual((await cache.read("/accounts", U1))?.data, [{ _id: "a1" }]);
  assert.equal(await cache.read("/accounts", U2), null);
  assert.equal(await cache.read("/accounts", null), null);
  await cache.write("/accounts", [{ _id: "b1" }], U2);
  assert.deepEqual((await cache.read("/accounts", U1))?.data, [{ _id: "a1" }]);
  assert.deepEqual((await cache.read("/accounts", U2))?.data, [{ _id: "b1" }]);
  await cache.write("/accounts", [{ _id: "x" }], null);
  assert.deepEqual((await cache.read("/accounts", U1))?.data, [{ _id: "a1" }]);
});

test("copies saved before 2.8.6 are misses for everyone, except a /auth/me whose own id is the user's", async () => {
  const { cache } = launch(oldAppDisk());
  assert.equal(await cache.read("/categories", U1), null);
  assert.equal(await cache.read("/transactions?page=1", U1), null);
  // The saved session proves whose it is, so an offline first launch of 2.8.6 stays signed in.
  assert.deepEqual((await cache.read("/auth/me", U1))?.data, { _id: U1 });
  assert.equal(await cache.read("/auth/me", U2), null);
});

test("prune deletes the unowned copies at once, old owned ones by age, and keeps the queue", async () => {
  const fs = oldAppDisk();
  const { cache, outbox } = launch(fs);
  await cache.write("/old", 1, U1);
  await cache.write("/new", 2, U1);
  const oldFile = [...fs.files.keys()].find((f) => fs.files.get(f)!.includes("\"/old\""))!;
  fs.files.set(oldFile, JSON.stringify({ ...JSON.parse(fs.files.get(oldFile)!), fetchedAt: Date.now() - 10_000 }));
  fs.files.set(`${DIR}junk.json`, "not json");
  await cache.prune(5_000);
  assert.equal(fs.files.has(legacyName("/categories")), false);
  assert.equal(fs.files.has(legacyName("/transactions?page=1")), false);
  assert.equal(fs.files.has(legacyName("/auth/me")), true);
  assert.equal(await cache.read("/old", U1), null);
  assert.equal((await cache.read("/new", U1))?.data, 2);
  assert.equal(fs.files.has(`${DIR}junk.json`), false);
  assert.deepEqual(await outbox.readOutbox(U1), [legacyItem]);
});

test("the first launch at a new epoch clears old responses once and keeps the signed-in user and the queue", async () => {
  const fs = oldAppDisk(null);
  const { cache, outbox } = launch(fs);
  assert.equal(await cache.read("/categories", U1), null);
  assert.deepEqual((await cache.read("/auth/me", U1))?.data, { _id: U1 });
  assert.equal(fs.files.has(legacyName("/categories")), false);
  assert.deepEqual(await outbox.readOutbox(U1), [legacyItem]);
  assert.deepEqual(JSON.parse(fs.files.get(MARKER)!), { epoch: RESPONSE_EPOCH });

  // Later launches don't clear again.
  await cache.write("/categories", [{ _id: "c2" }], U1);
  for (let i = 0; i < 3; i++) assert.deepEqual((await launch(fs).cache.read("/categories", U1))?.data, [{ _id: "c2" }]);
});

test("a clear that fails leaves the marker unwritten, so the next launch tries again", async () => {
  const fs = oldAppDisk(null);
  fs.failing.add(legacyName("/categories"));
  const first = launch(fs);
  await first.cache.read("/auth/me", U1);
  assert.equal(fs.files.has(MARKER), false);

  fs.failing.clear();
  const second = launch(fs);
  await second.cache.read("/categories", U1);
  assert.equal(fs.files.has(MARKER), true);
  assert.equal(fs.files.has(legacyName("/categories")), false);
});

test("sign-out's clear keeps the queue and the marker", async () => {
  const fs = oldAppDisk();
  const { cache, outbox } = launch(fs);
  await cache.write("/accounts", [], U1);
  await cache.clearAll();
  assert.equal(await cache.read("/auth/me", U1), null);
  assert.equal(await cache.read("/accounts", U1), null);
  assert.deepEqual(await outbox.readOutbox(U1), [legacyItem]);
  assert.equal(fs.files.has(MARKER), true);

  await cache.write("/accounts", [{ _id: "a1" }], U2);
  assert.deepEqual((await launch(fs).cache.read("/accounts", U2))?.data, [{ _id: "a1" }]);
});

test("an entry with another shape version, path or owner reads as a miss", async () => {
  const fs = memoryFileSystem();
  const { cache } = launch(fs);
  await cache.write("/bills", ["b"], U1);
  const file = [...fs.files.keys()].find((f) => fs.files.get(f)!.includes("\"/bills\""))!;
  const entry = JSON.parse(fs.files.get(file)!);
  fs.files.set(file, JSON.stringify({ ...entry, v: 0 }));
  assert.equal(await cache.read("/bills", U1), null);
  fs.files.set(file, JSON.stringify({ ...entry, path: "/other" }));
  assert.equal(await cache.read("/bills", U1), null);
  fs.files.set(file, JSON.stringify({ ...entry, owner: U2 }));
  assert.equal(await cache.read("/bills", U1), null);
  fs.files.set(file, "{broken");
  assert.equal(await cache.read("/bills", U1), null);
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
