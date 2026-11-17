import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/storeFetchedAt.test.ts
//
// W-1: Manage accounts / categories date their offline strip by the store's own load, which
// is the cache entry's time when the read was served offline.

const SAVED = Date.parse("2026-11-16T05:22:00Z");
const answers: Record<string, unknown> = {
  "/accounts": [{ _id: "a1", name: "Cash" }],
  "/categories?include=archived": [{ _id: "c1", name: "Food" }, { _id: "c2", name: "Old", isArchived: true }],
};
fake("@/store/session", { useSession: { getState: () => ({ user: { prefs: { timeZone: "Asia/Kolkata" } } }) } });
fake("@/lib/api", { getFetched: async (path: string) => ({ data: answers[path], fetchedAt: SAVED }) });

const { useAccountStore } = require("../store/accounts") as typeof import("../store/accounts");
const { useCategoryStore } = require("../store/categories") as typeof import("../store/categories");
const { offlineBannerText } = require("./offlineBanner") as typeof import("./offlineBanner");

test("the account store keeps when its list was fetched, and drops it on sign-out", async () => {
  assert.equal(useAccountStore.getState().fetchedAt, null);
  await useAccountStore.getState().load();
  assert.equal(useAccountStore.getState().fetchedAt, SAVED);
  assert.equal(useAccountStore.getState().list.length, 1);
  useAccountStore.getState().reset();
  assert.equal(useAccountStore.getState().fetchedAt, null);
});

test("the category store keeps when its list was fetched, and drops it on sign-out", async () => {
  await useCategoryStore.getState().load();
  assert.equal(useCategoryStore.getState().fetchedAt, SAVED);
  assert.equal(useCategoryStore.getState().list.length, 1);
  useCategoryStore.getState().reset();
  assert.equal(useCategoryStore.getState().fetchedAt, null);
});

test("with the store's time the strip reads D18's line, not the last-online time", async () => {
  await useAccountStore.getState().load();
  const now = SAVED + 60 * 60 * 1000;
  mock.timers.enable({ apis: ["Date"], now });
  try {
    assert.equal(
      offlineBannerText(useAccountStore.getState().fetchedAt, now, "Asia/Kolkata"),
      "Offline · showing what was saved today at 10:52 am",
    );
  }
  finally {
    mock.timers.reset();
  }
});
