import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Run from apps/api: TS_NODE_TRANSPILE_ONLY=true node --require ts-node/register --test ../mobile/lib/onlineGate.test.ts

fake("@/store/connectivity", { useConnectivity: () => false });

const { onlineGate, hintedLabel, NEEDS_CONNECTION } = require("./onlineGate") as typeof import("./onlineGate");

test("offline: the button keeps its action and says it needs a connection before the tap", () => {
  assert.deepEqual(onlineGate(true, "Add ₹5,000.00"), { allowed: false, label: "Add ₹5,000.00", icon: "cloudOff", hint: NEEDS_CONNECTION });
  assert.equal(NEEDS_CONNECTION, "Needs a connection");
});

test("online: the button keeps its own label and icon, with no hint", () => {
  assert.deepEqual(onlineGate(false, "Add ₹5,000.00"), { allowed: true, label: "Add ₹5,000.00", icon: undefined, hint: undefined });
});

test("VoiceOver reads the action first, then the hint", () => {
  assert.equal(hintedLabel("Edit", NEEDS_CONNECTION), "Edit, needs a connection");
  assert.equal(hintedLabel("Edit", undefined), "Edit");
});
