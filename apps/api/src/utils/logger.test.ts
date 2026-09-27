import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scrub, shortStack } from "./logger";
import { isRequestId, makeRequestId, REQUEST_ID_LENGTH } from "./requestId";
import { routePattern } from "../middleware/requestLogger";

describe("scrub", () => {
    it("takes money out of a message", () => {
        assert.equal(scrub("You can only redeem up to ₹12,345.50 — update it"), "You can only redeem up to ₹… — update it");
        assert.equal(scrub("Invested can't be less than the ₹ 5,000 already added"), "Invested can't be less than the ₹… already added");
    });

    it("leaves ordinary text and caps the length", () => {
        assert.equal(scrub("Bill not found"), "Bill not found");
        assert.equal(scrub("x".repeat(500))?.length, 300);
        assert.equal(scrub(null), null);
    });
});

describe("shortStack", () => {
    it("keeps the first few frames", () => {
        const stack = ["Error: boom", ...Array.from({ length: 20 }, (_, i) => `    at f${i}`)].join("\n");
        assert.equal(shortStack(stack)?.split("\n").length, 6);
    });
});

describe("request ids", () => {
    it("makes ids of the readable shape", () => {
        for (let i = 0; i < 200; i++) {
            const id = makeRequestId();
            assert.equal(id.length, REQUEST_ID_LENGTH);
            assert.ok(isRequestId(id), id);
            assert.ok(!/[01ILO]/.test(id), id);
        }
    });

    it("refuses anything else from a header", () => {
        for (const bad of ["abc123", "7K2QX", "7K2QXB9", "7K2Q\nX", "<script>", undefined, 42]) {
            assert.equal(isRequestId(bad), false, String(bad));
        }
    });
});

describe("routePattern", () => {
    it("turns ids into :id and drops the query and trailing slash", () => {
        assert.equal(routePattern("/api/v1/investments/6a764ebea1e3aa857dbec688/basis?mode=keep"), "/api/v1/investments/:id/basis");
        assert.equal(routePattern("/api/v1/bills/"), "/api/v1/bills");
        assert.equal(routePattern("/api/v1/transactions?startDate=2026-09-01"), "/api/v1/transactions");
        assert.equal(routePattern("/"), "/");
    });
});
