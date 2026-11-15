import { test } from "node:test";
import assert from "node:assert/strict";
import { EPOCH_FILE, RESPONSE_EPOCH, filesToClear, isKeptFile, needsClear, parseEpoch } from "./cacheEpoch";

test("a cache with no marker (2.6.0, 2.7.x, or a fresh install) is cleared once", () => {
  assert.equal(needsClear(parseEpoch(null)), true);
});

test("an unreadable or older marker is cleared; the current one is left alone", () => {
  assert.equal(needsClear(parseEpoch("not json")), true);
  assert.equal(needsClear(parseEpoch(JSON.stringify({ epoch: RESPONSE_EPOCH - 1 }))), true);
  assert.equal(needsClear(parseEpoch(JSON.stringify({ epoch: RESPONSE_EPOCH }))), false);
  assert.equal(needsClear(parseEpoch(JSON.stringify({ epoch: "2" }))), true);
});

test("the clear deletes cached responses only", () => {
  const names = ["1a2b.json", "outbox.65a1.json", EPOCH_FILE, "me.json", "zz9.json"];
  assert.deepEqual(filesToClear(names, ["me.json"]), ["1a2b.json", "zz9.json"]);
});

test("sign-out's clear keeps the queue and the marker, so the upgrade never runs twice", () => {
  assert.equal(isKeptFile("outbox.65a1.json"), true);
  assert.equal(isKeptFile(EPOCH_FILE), true);
  assert.equal(isKeptFile("1a2b.json"), false);
});
