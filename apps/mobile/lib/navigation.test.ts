import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

// Gaps row 197: Back on a screen opened with nothing behind it goes Home instead of doing nothing.
const calls: string[] = [];
let behind = true;
fake("expo-router", {
  router: {
    canGoBack: () => behind,
    back: () => calls.push("back"),
    replace: (to: string) => calls.push(`replace ${to}`),
  },
});
const { goBackOrHome } = require("./navigation") as typeof import("./navigation");

test("back goes back when there is a screen behind, and Home when there isn't", () => {
  goBackOrHome();
  behind = false;
  goBackOrHome();
  assert.deepEqual(calls, ["back", "replace /(tabs)"]);
});
