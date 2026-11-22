import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenOwner } from "./cacheOwner";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (payload: unknown) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;

test("the cache owner is the token's userId, lower-cased", () => {
  assert.equal(tokenOwner(token({ userId: "65A1B2C3D4E5F60718293A41", name: "Ünïcode ₹", loginTime: "x" })), "65a1b2c3d4e5f60718293a41");
});

test("no owner without a readable userId: nothing is cached", () => {
  for (const t of [null, undefined, "", "abc", "a.b.c", token({}), token({ userId: 7 }), token({ userId: "not-an-id" })]) {
    assert.equal(tokenOwner(t as string | null), null, String(t));
  }
});
