import { test } from "node:test";
import assert from "node:assert/strict";
import { fake } from "../test/node";

fake("@/store/session", { useSession: { getState: () => ({ user: null }) } });
const { goalPace } = require("./goalPace") as typeof import("./goalPace");

const NOW = new Date("2026-11-22T06:30:00Z");
const IST = "Asia/Kolkata";

test("goal pace on the card counts average months, as the API's goalPace does", () => {
  // ₹30,000 of ₹1,00,000 in 365 days (11.99 months) → ₹2,501.71 a month → 28 more months.
  const p = goalPace({ target: 10_000_000, saved: 3_000_000, createdAt: "2025-11-22T06:30:00Z" }, NOW, IST);
  assert.equal(p.monthsNeeded, 28);
  assert.equal(p.projectedDate, "2029-03-22T06:30:00.000Z");
});

test("goal pace: achieved is 0 months, nothing saved has no projection, a young goal counts a whole month", () => {
  assert.deepEqual(goalPace({ target: 100, saved: 100, createdAt: "2026-01-01T00:00:00Z" }, NOW, IST), { monthsNeeded: 0, projectedDate: null });
  assert.deepEqual(goalPace({ target: 100, saved: 0, createdAt: "2026-01-01T00:00:00Z" }, NOW, IST), { monthsNeeded: null, projectedDate: null });
  assert.equal(goalPace({ target: 1_000, saved: 100, createdAt: "2026-11-20T00:00:00Z" }, NOW, IST).monthsNeeded, 9);
});
