import { test } from "node:test";
import assert from "node:assert/strict";
import { fake, relaunch } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/perUser.test.ts

// SecureStore as a map, so what the phone keeps can be read back.
const keychain = new Map<string, string>();
fake("expo-secure-store", {
  getItemAsync: async (k: string) => keychain.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => { keychain.set(k, v); },
  deleteItemAsync: async (k: string) => { keychain.delete(k); },
});

const load = () => {
  relaunch();
  return {
    perUser: require("./perUser") as typeof import("./perUser"),
    seen: require("../store/seen") as typeof import("../store/seen"),
  };
};

test("seen values are per account, and signing out clears only that account's (gaps row 185)", async () => {
  keychain.clear();
  const { perUser: p } = load();
  const highlights = p.perUser<Record<string, number>>(p.SEEN_KEYS.highlights);
  await highlights.write("a1", { k: 1 });
  await highlights.write("b2", { k: 2 });
  assert.deepEqual(await highlights.read("a1"), { k: 1 });
  assert.deepEqual(await highlights.read("b2"), { k: 2 });
  await p.clearPerUser("a1");
  assert.equal(await highlights.read("a1"), null);
  assert.deepEqual(await highlights.read("b2"), { k: 2 });
});

test("the phone-wide values of 2.8.7 go to the first account that reads them, then nobody else", async () => {
  keychain.clear();
  keychain.set("sns.dismissedHighlights", JSON.stringify({ k: 5 }));
  keychain.set("sns.deviceSettings", JSON.stringify({ privacyMode: true, getStartedDismissed: ["b2"], netWorthMilestoneSeen: 500_000_00, lastReviewedPeriod: { week: "2026-W46", month: "2026-10" } }));
  const { perUser: p, seen } = load();

  assert.deepEqual(await p.adoptLegacy(p.SEEN_KEYS.highlights, "a1", "sns.dismissedHighlights"), { k: 5 });
  assert.equal(await p.adoptLegacy(p.SEEN_KEYS.highlights, "b2", "sns.dismissedHighlights"), null);

  const first = await seen.loadHomeSeen("a1");
  assert.deepEqual(first, { getStartedDismissed: false, netWorthMilestoneSeen: 500_000_00, lastReviewedPeriod: { week: "2026-W46", month: "2026-10" } });
  const second = await seen.loadHomeSeen("b2");
  assert.deepEqual(second, { getStartedDismissed: true, netWorthMilestoneSeen: 0, lastReviewedPeriod: { week: null, month: null } }, "b2 keeps only its own Get started");
  assert.equal(JSON.parse(keychain.get("sns.deviceSettings")!).privacyMode, true, "the phone's own settings stay");
});
