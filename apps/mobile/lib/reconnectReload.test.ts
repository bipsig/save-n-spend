import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "zustand/vanilla";
import { reloadOnReconnect } from "./reconnectReload";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/reconnectReload.test.ts

/** A store shaped like store/categories: `load` fails while there is no connection. */
const loadable = (net: { up: boolean }) => {
  const calls = { n: 0 };
  let finish: (() => void) | null = null;
  const store = createStore<{ loaded: boolean; load: () => Promise<void> }>((set) => ({
    loaded: false,
    load: async () => {
      calls.n++;
      if (!net.up) throw new Error("Network request failed");
      await new Promise<void>((resolve) => { finish = resolve; });
      set({ loaded: true });
    },
  }));
  return { store, calls, settle: async () => { finish?.(); await new Promise((r) => setImmediate(r)); } };
};

const setup = (authed = true) => {
  const net = { up: false };
  const connectivity = createStore<{ offline: boolean }>(() => ({ offline: true }));
  const categories = loadable(net);
  const accounts = loadable(net);
  const session = { authed };
  const stop = reloadOnReconnect(connectivity, () => session.authed, [categories.store, accounts.store]);
  const goOnline = () => { net.up = true; connectivity.setState({ offline: false }); };
  const goOffline = () => { net.up = false; connectivity.setState({ offline: true }); };
  return { connectivity, categories, accounts, session, stop, goOnline, goOffline };
};

test("an offline first launch: both stores load when the connection returns", async () => {
  const s = setup();
  s.goOnline();
  assert.equal(s.categories.calls.n, 1);
  assert.equal(s.accounts.calls.n, 1);
  await s.categories.settle();
  await s.accounts.settle();
  assert.equal(s.categories.store.getState().loaded, true);
  assert.equal(s.accounts.store.getState().loaded, true);
});

test("a store that is already loaded is not fetched again", async () => {
  const s = setup();
  s.categories.store.setState({ loaded: true });
  s.goOnline();
  assert.equal(s.categories.calls.n, 0);
  assert.equal(s.accounts.calls.n, 1);
});

test("every request reporting online again does not repeat the load", async () => {
  const s = setup();
  s.goOnline();
  // lib/api.ts reports online after every answer; the flag is already false.
  s.connectivity.setState({ offline: false });
  s.connectivity.setState({ offline: false, lastOnlineAt: 2 } as { offline: boolean });
  assert.equal(s.categories.calls.n, 1);
});

test("a reconnect while the last load is still running doesn't start a second", async () => {
  const s = setup();
  s.goOnline();
  s.goOffline();
  s.goOnline();
  assert.equal(s.categories.calls.n, 1);
  await s.categories.settle();
  assert.equal(s.categories.store.getState().loaded, true);
});

test("a load that fails is tried again on the next reconnect, not in a loop", async () => {
  const s = setup();
  // Online for the flag, but the request itself still finds no route.
  s.connectivity.setState({ offline: false });
  assert.equal(s.categories.calls.n, 1);
  await new Promise((r) => setImmediate(r));
  assert.equal(s.categories.calls.n, 1);
  assert.equal(s.categories.store.getState().loaded, false);
  // More answers reporting online don't retry it.
  s.connectivity.setState({ offline: false });
  s.connectivity.setState({ offline: false });
  assert.equal(s.categories.calls.n, 1);

  s.goOffline();
  s.goOnline();
  assert.equal(s.categories.calls.n, 2);
});

test("going offline, or a reconnect while signed out, loads nothing", () => {
  const s = setup(false);
  s.goOnline();
  s.goOffline();
  assert.equal(s.categories.calls.n, 0);
  assert.equal(s.accounts.calls.n, 0);
});

test("after the unsubscribe nothing reloads", () => {
  const s = setup();
  s.stop();
  s.goOnline();
  assert.equal(s.categories.calls.n, 0);
});
