import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/onlineGate.test.ts

fake("@/store/connectivity", { useConnectivity: () => false });

const { onlineGate, NEEDS_CONNECTION } = require("./onlineGate") as typeof import("./onlineGate");

test("offline: the button says it needs a connection before the tap", () => {
  assert.deepEqual(onlineGate(true, "Add ₹5,000.00"), { allowed: false, label: NEEDS_CONNECTION, icon: "cloudOff" });
  assert.equal(NEEDS_CONNECTION, "Needs a connection");
});

test("online: the button keeps its own label and icon", () => {
  assert.deepEqual(onlineGate(false, "Add ₹5,000.00"), { allowed: true, label: "Add ₹5,000.00", icon: undefined });
});
