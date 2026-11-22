import { test } from "node:test";
import assert from "node:assert/strict";
import { fake, memoryFileSystem, relaunch } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/offlineFirstLaunch.test.ts
//
// Bug B1 end to end, with the real session, connectivity, category and account stores, API
// client and offline cache: only fetch, the disk and SecureStore are faked. The steps are the
// ones app/_layout.tsx takes on a launch with a cached session and no connection.

const ME = { _id: "65a1b2c3d4e5f60718293a41", name: "W", email: "w@example.test", prefs: { timeZone: "Asia/Kolkata" } };
// The cache is keyed by the user the token names (gaps row 179).
const TOKEN = `e30.${Buffer.from(JSON.stringify({ userId: ME._id })).toString("base64url")}.sig`;
const CATEGORIES = [{ _id: "c1", userId: "u1", name: "Groceries", kind: "expense", parent: null, isArchived: false }];
const ACCOUNTS = [{ _id: "a1", name: "Cash", type: "cash", balance: 0 }];

const server = (path: string) => {
  if (path.endsWith("/health")) return { status: "ok" };
  if (path.includes("/auth/me")) return { success: true, data: ME };
  if (path.includes("/categories")) return { success: true, data: CATEGORIES };
  if (path.includes("/accounts")) return { success: true, data: ACCOUNTS };
  return { success: true, data: null };
};

const launch = (fs: ReturnType<typeof memoryFileSystem>) => {
  const net = { up: false, requests: [] as string[] };
  globalThis.fetch = (async (url: string) => {
    net.requests.push(url);
    if (!net.up) throw new TypeError("Network request failed");
    return new Response(JSON.stringify(server(url)), { status: 200 });
  }) as typeof fetch;
  const keychain = new Map<string, string>([["sns.accessToken", TOKEN]]);
  fake("expo-file-system/legacy", fs.api);
  fake("expo-constants", { __esModule: true, default: { expoConfig: { version: "2.8.1" } } });
  fake("expo-secure-store", {
    getItemAsync: async (k: string) => keychain.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => { keychain.set(k, v); },
    deleteItemAsync: async (k: string) => { keychain.delete(k); },
  });
  fake("react-native", { AppState: { addEventListener: () => ({ remove: () => {} }) } });
  fake("@/store/requestLog", { useRequestLog: { getState: () => ({ add: () => {} }) } });
  relaunch();
  return {
    net,
    cache: require("./offlineCache") as typeof import("./offlineCache"),
    session: (require("../store/session") as typeof import("../store/session")).useSession,
    connectivity: (require("../store/connectivity") as typeof import("../store/connectivity")).useConnectivity,
    categories: (require("../store/categories") as typeof import("../store/categories")).useCategoryStore,
    accounts: (require("../store/accounts") as typeof import("../store/accounts")).useAccountStore,
    label: (require("./categoryLabel") as typeof import("./categoryLabel")).labelFrom,
    reloadOnReconnect: (require("./reconnectReload") as typeof import("./reconnectReload")).reloadOnReconnect,
  };
};

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

/** 2.6.0 used online, then 2.8.x installed over it and opened with no connection. */
const offlineFirstLaunch = async (withFix: boolean) => {
  const fs = memoryFileSystem();
  const old = launch(fs);
  old.net.up = true;
  await old.cache.write("/auth/me", ME, ME._id);
  await old.cache.write("/categories", CATEGORIES, ME._id);
  await old.cache.write("/accounts", ACCOUNTS, ME._id);
  fs.files.delete("file:///doc/offline-cache/epoch.json");

  const app = launch(fs);
  await app.session.getState().hydrate();
  const cachedMe = await app.cache.read<typeof ME>("/auth/me", ME._id);
  assert.ok(cachedMe, "the upgrade keeps the signed-in user");
  // _layout's boot: unreachable, so the cached user and the offline flag.
  app.session.getState().setUser(cachedMe.data as never);
  app.connectivity.getState().reportOffline();
  const stop = withFix
    ? app.reloadOnReconnect(app.connectivity, () => app.session.getState().status === "authed", [app.categories, app.accounts])
    : () => {};
  // _layout's effect on reaching `authed`.
  app.categories.getState().load().catch(() => {});
  app.accounts.getState().load().catch(() => {});
  await settle();
  return { app, stop };
};

const rowLabel = (app: ReturnType<typeof launch>) =>
  app.label(app.categories.getState().all, app.categories.getState().list, "c1").name;

test("B1 as 2.8.0 shipped: after going online the rows still read Uncategorised", async () => {
  const { app } = await offlineFirstLaunch(false);
  assert.equal(rowLabel(app), "Uncategorised");
  app.net.up = true;
  await app.connectivity.getState().recheckNow();
  await settle();
  assert.equal(app.connectivity.getState().offline, false);
  assert.equal(app.categories.getState().loaded, false);
  assert.equal(rowLabel(app), "Uncategorised");
});

test("B1 fixed: the first answer after reconnecting loads categories and accounts, once", async () => {
  const { app, stop } = await offlineFirstLaunch(true);
  assert.equal(rowLabel(app), "Uncategorised");
  assert.equal(app.categories.getState().list.length, 0, "the picker has nothing to offer offline");

  app.net.up = true;
  await app.connectivity.getState().recheckNow();
  await settle();
  assert.equal(rowLabel(app), "Groceries");
  assert.deepEqual(app.categories.getState().list.map((c) => c.name), ["Groceries"]);
  assert.deepEqual(app.accounts.getState().list.map((a) => a.name), ["Cash"]);

  // More answers while online fetch nothing more.
  const before = app.net.requests.filter((u) => /categories|accounts/.test(u)).length;
  await app.connectivity.getState().recheckNow();
  app.connectivity.getState().reportOnline();
  await settle();
  assert.equal(app.net.requests.filter((u) => /categories|accounts/.test(u)).length, before);
  stop();
});
