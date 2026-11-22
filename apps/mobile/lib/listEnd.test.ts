import { test } from "node:test";
import assert from "node:assert/strict";
import { listEndState, nearEnd } from "./listEnd";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/listEnd.test.ts

test("the footer: a spinner while a page loads, a retry when one failed, the end line only after a second page", () => {
  assert.equal(listEndState({ hasMore: true, loadingMore: true, pagesLoaded: 1 }), "loading");
  assert.equal(listEndState({ hasMore: true, loadingMore: false, pagesLoaded: 1 }), null);
  assert.equal(listEndState({ hasMore: false, loadingMore: false, pagesLoaded: 1 }), null, "one page: no line");
  assert.equal(listEndState({ hasMore: false, loadingMore: false, pagesLoaded: 2 }), "end");
  assert.equal(listEndState({ hasMore: true, loadingMore: false, pagesLoaded: 2, failed: true }), "failed");
  assert.equal(listEndState({ hasMore: true, loadingMore: false, pagesLoaded: 0, failed: true }), null, "nothing loaded: the screen's own error");
  assert.equal(listEndState({ hasMore: false, loadingMore: false, pagesLoaded: 0 }), null, "empty: the screen's empty state");
});

test("near the end means within one screen of the bottom", () => {
  const at = (y: number) => nearEnd({ layoutMeasurement: { height: 800 }, contentOffset: { y }, contentSize: { height: 3000 } });
  assert.equal(at(0), false);
  assert.equal(at(1399), false);
  assert.equal(at(1400), true);
  assert.equal(nearEnd({ layoutMeasurement: { height: 800 }, contentOffset: { y: 0 }, contentSize: { height: 500 } }), true, "content shorter than the screen");
});
