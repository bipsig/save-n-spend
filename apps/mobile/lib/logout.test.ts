import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "zustand/vanilla";
import { fake, relaunch } from "../test/node";
import { LOGOUT_BASE, logoutBody } from "./logoutCopy";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/logout.test.ts

test("the logout sheet names what hasn't synced and what is still in its undo window", () => {
  assert.equal(logoutBody(0, 0), LOGOUT_BASE);
  assert.equal(logoutBody(2, 0), `2 transactions haven't synced yet. They'll sync once you're signed back in. ${LOGOUT_BASE}`);
  assert.equal(logoutBody(1, 1), `1 transaction hasn't synced yet. They'll sync once you're signed back in. The delete you just made is sent first. ${LOGOUT_BASE}`);
  assert.equal(logoutBody(0, 3), `The deletes you just made are sent first. ${LOGOUT_BASE}`);
});

const launch = (opts: { deleteFails?: boolean; flushFails?: boolean } = {}) => {
  const order: string[] = [];
  const session = createStore(() => ({ user: { _id: "u1" }, signOut: async () => { order.push("signOut"); } }));
  fake("@/store/session", { useSession: session });
  fake("@/store/pendingDeletes", { usePendingDeletes: { getState: () => ({ flushAll: async () => { order.push("flush"); if (opts.flushFails) throw new Error("x"); } }) } });
  fake("@/lib/push", { detachPush: async () => { order.push("detachPush"); } });
  fake("@/lib/perUser", { clearPerUser: async (id: string) => { order.push(`clearSeen ${id}`); } });
  fake("@/lib/zone", { deviceZone: () => "Asia/Kolkata" });
  fake("@/lib/api", {
    del: async (path: string) => { order.push(`DELETE ${path}`); if (opts.deleteFails) throw new Error("offline"); return null; },
    patch: async () => null, post: async () => null,
  });
  relaunch();
  return { profile: require("./profile") as typeof import("./profile"), order };
};

test("logOut sends held deletes and detaches push while the token works, then signs out", async () => {
  const app = launch();
  await app.profile.logOut();
  assert.deepEqual(app.order, ["flush", "detachPush", "clearSeen u1", "signOut"]);
});

test("a failed flush never blocks signing out", async () => {
  const app = launch({ flushFails: true });
  await app.profile.logOut();
  assert.deepEqual(app.order, ["flush", "detachPush", "clearSeen u1", "signOut"]);
});

test("deleting the account goes the same way, and stays signed in when the delete fails", async () => {
  const ok = launch();
  await ok.profile.deleteAccount();
  assert.deepEqual(ok.order, ["flush", "detachPush", "DELETE /users/me", "clearSeen u1", "signOut"]);
  const bad = launch({ deleteFails: true });
  await assert.rejects(bad.profile.deleteAccount());
  assert.deepEqual(bad.order, ["flush", "detachPush", "DELETE /users/me"]);
});
