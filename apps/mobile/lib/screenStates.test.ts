import { test } from "node:test";
import assert from "node:assert/strict";
import { errorMessage, homeCardView, mergeScreenStates, screenView, stacksAction, stripFor, type ScreenState } from "./screenStates";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/screenStates.test.ts

test("screen view: skeleton before the first answer, error only with nothing to show (D15 A)", () => {
  const cases: [Partial<ScreenState>, string][] = [
    [{ loading: true, hasData: false, error: null }, "skeleton"],
    [{ loading: false, hasData: false, error: null }, "skeleton"], // not started yet: still no answer
    [{ loading: false, hasData: false, error: "Couldn't reach the server" }, "error"],
    [{ loading: true, hasData: false, error: "Couldn't reach the server" }, "error"],
    [{ loading: false, hasData: true, error: null }, "content"],
    [{ loading: false, hasData: true, error: "Couldn't reach the server" }, "content"], // failed refresh keeps the data
    [{ loading: false, hasData: true, error: null, refreshing: true }, "content"], // a refetch never brings the skeleton back
    [{ loading: false, hasData: false, error: "Not found", notFound: true }, "notFound"],
    [{ loading: false, hasData: true, error: null, notFound: true }, "notFound"],
  ];
  for (const [state, view] of cases) {
    assert.equal(screenView(state as ScreenState), view, JSON.stringify(state));
  }
});

test("one strip: offline, then the server starting up, then couldn't refresh", () => {
  const failed = { hasData: true, error: "x" };
  assert.equal(stripFor({ offline: true, waking: true, ...failed }), "offline");
  assert.equal(stripFor({ offline: true, waking: false }), "offline");
  assert.equal(stripFor({ offline: false, waking: true, ...failed }), "waking");
  assert.equal(stripFor({ offline: false, waking: false, ...failed }), "refreshFailed");
  // With no data the full error screen says it; no strip on top.
  assert.equal(stripFor({ offline: false, waking: false, hasData: false, error: "x" }), null);
  assert.equal(stripFor({ offline: false, waking: false, hasData: true, error: null }), null);
  // A screen that passes no state (2.8.2 callers) never gets the refresh strip.
  assert.equal(stripFor({ offline: false, waking: false }), null);
});

test("Home card: content, hidden while loading or empty, error box when it never answered (D16 A)", () => {
  assert.equal(homeCardView({ hasData: true, error: null }), "content");
  assert.equal(homeCardView({ hasData: true, error: "x" }), "content");
  assert.equal(homeCardView({ hasData: true, error: null, empty: true }), "hidden");
  assert.equal(homeCardView({ hasData: false, error: null }), "hidden");
  assert.equal(homeCardView({ hasData: false, error: "x" }), "error");
  assert.equal(homeCardView({ hasData: false, error: "x", empty: true }), "error");
});

test("errorMessage takes a string or an Error", () => {
  assert.equal(errorMessage("Couldn't reach the server"), "Couldn't reach the server");
  assert.equal(errorMessage(new Error("The server is starting up")), "The server is starting up");
  assert.equal(errorMessage(new Error("")), undefined);
  assert.equal(errorMessage(null), undefined);
});

test("merged states: data when every part has it, first error, oldest age, one refetch", async () => {
  const calls: string[] = [];
  const part = (name: string, s: Partial<ScreenState>): ScreenState => ({
    loading: false, error: null, hasData: true, refetch: () => calls.push(name), ...s,
  });
  const merged = mergeScreenStates(
    part("a", { fetchedAt: 2_000 }),
    part("b", { hasData: false, loading: true, error: "b failed", fetchedAt: 1_000 }),
    part("c", { error: "c failed", refreshing: true }),
  );
  assert.equal(merged.hasData, false);
  assert.equal(merged.loading, true);
  assert.equal(merged.refreshing, true);
  assert.equal(merged.error, "b failed");
  assert.equal(merged.fetchedAt, 1_000);
  assert.equal(merged.notFound, false);
  await merged.refetch();
  assert.deepEqual(calls, ["a", "b", "c"]);

  assert.equal(mergeScreenStates(part("a", {}), part("b", {})).fetchedAt, null);
});

test("Try again goes under its message only at the accessibility text sizes (W-4)", () => {
  // React Native's iOS fontScale per text size: default 1, xxxLarge 1.353, AX1 1.786, AX5 3.571.
  assert.equal(stacksAction(1), false);
  assert.equal(stacksAction(1.353), false);
  assert.equal(stacksAction(1.786), true);
  assert.equal(stacksAction(3.571), true);
});
