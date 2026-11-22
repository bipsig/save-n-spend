import { test } from "node:test";
import assert from "node:assert/strict";
import { coversScreen } from "./appCover";

const base = { authed: true, appLock: false, privacyMode: false, prompting: false };

test("the cover goes up on inactive and background when App Lock or privacy mode is on", () => {
  for (const s of [{ ...base, appLock: true }, { ...base, privacyMode: true }]) {
    assert.deepEqual((["inactive", "background", "active"] as const).map((n) => coversScreen(n, s)), [true, true, false]);
  }
});

test("no cover with both off, signed out, or while the biometric prompt is up", () => {
  assert.equal(coversScreen("inactive", base), false);
  assert.equal(coversScreen("inactive", { ...base, appLock: true, authed: false }), false);
  assert.equal(coversScreen("inactive", { ...base, appLock: true, prompting: true }), false);
});
