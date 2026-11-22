import { test } from "node:test";
import assert from "node:assert/strict";
import { isRevoked } from "./authMiddleware";

const cutoff = new Date("2026-11-22T10:00:00.500Z");

test("isRevoked: no cutoff, nothing is revoked (every user before 2.8.6)", () => {
    assert.equal(isRevoked({ iat: 1, loginTime: "2020-01-01T00:00:00.000Z" }, {}), false);
    assert.equal(isRevoked({}, { tokensValidAfter: null }), false);
});

test("isRevoked: issued before the cutoff is revoked, at or after it is not, to the millisecond", () => {
    const user = { tokensValidAfter: cutoff };
    assert.equal(isRevoked({ iat: 1_795_428_000, loginTime: "2026-11-22T10:00:00.499Z" }, user), true);
    assert.equal(isRevoked({ iat: 1_795_428_000, loginTime: "2026-11-22T10:00:00.500Z" }, user), false);
    assert.equal(isRevoked({ iat: 1_795_428_001, loginTime: "2026-11-22T10:00:01.000Z" }, user), false);
});

test("isRevoked: without a readable loginTime it falls back to iat, and with neither it fails closed", () => {
    const user = { tokensValidAfter: cutoff };
    assert.equal(isRevoked({ iat: Date.parse("2026-11-22T09:59:59Z") / 1000 }, user), true);
    assert.equal(isRevoked({ iat: Date.parse("2026-11-22T10:00:01Z") / 1000, loginTime: "not a date" }, user), false);
    assert.equal(isRevoked({}, user), true);
});

test("isRevoked: the session that changed the password is kept", () => {
    const user = { tokensValidAfter: cutoff, tokenKept: "2026-11-01T08:00:00.000Z" };
    assert.equal(isRevoked({ iat: 1, loginTime: "2026-11-01T08:00:00.000Z" }, user), false);
    assert.equal(isRevoked({ iat: 1, loginTime: "2026-11-01T08:00:00.001Z" }, user), true);
});
