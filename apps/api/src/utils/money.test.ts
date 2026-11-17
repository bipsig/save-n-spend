import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MINUS, formatAmount, formatPercent } from "./money";

// Server sentences follow the app's 2.8.2 rules: exact paise, one decimal, the true minus.

describe("formatAmount", () => {
    it("prints exact paise with Indian grouping", () => {
        assert.equal(formatAmount(3_390_980), "₹33,909.80");
        assert.equal(formatAmount(839_950), "₹8,399.50");
        assert.equal(formatAmount(1_234_567_801), "₹1,23,45,678.01");
        assert.equal(formatAmount(5), "₹0.05");
    });

    it("zero is unsigned, and a negative gets the true minus", () => {
        assert.equal(formatAmount(0), "₹0.00");
        assert.equal(formatAmount(-0), "₹0.00");
        assert.equal(formatAmount(-45_000), `${MINUS}₹450.00`);
        assert.equal(formatAmount(-1), "−₹0.01");
        assert.ok(!formatAmount(-45_000).includes("-"), "never the hyphen");
    });

    it("rounds a fractional paise figure to the nearest paisa; under half a paisa is zero", () => {
        assert.equal(formatAmount(196_721.31), "₹1,967.21");
        assert.equal(formatAmount(196_721.5), "₹1,967.22");
        assert.equal(formatAmount(-0.4), "₹0.00");
    });

    it("falls back to INR for a currency code Intl doesn't know", () => {
        assert.equal(formatAmount(100_000, "NOT-A-CODE"), "₹1,000.00");
        assert.match(formatAmount(100_000, "USD"), /^\$1,000\.00$|^US\$1,000\.00$/);
    });
});

describe("formatPercent", () => {
    it("one decimal, never dropped", () => {
        assert.equal(formatPercent(0.0596), "6.0%");
        assert.equal(formatPercent(0.2), "20.0%");
        assert.equal(formatPercent(1), "100.0%");
        assert.equal(formatPercent(0.4425), "44.3%");
        assert.equal(formatPercent(2.25), "225.0%");
    });

    it("zero and a figure that rounds to zero are 0.0%, unsigned", () => {
        assert.equal(formatPercent(0), "0.0%");
        assert.equal(formatPercent(-0.0004), "0.0%");
        assert.equal(formatPercent(0.0004), "0.0%");
    });

    it("a negative gets the true minus", () => {
        assert.equal(formatPercent(-0.051), "−5.1%");
        assert.equal(formatPercent(-0.35), "−35.0%");
    });

    it("rounds half a tenth up, as the app does", () => {
        assert.equal(formatPercent(0.0005), "0.1%");
        assert.equal(formatPercent(0.1235), "12.4%");
        assert.equal(formatPercent(-0.1235), "−12.4%");
    });
});
