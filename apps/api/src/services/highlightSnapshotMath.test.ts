import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    AVERAGE_MONTHS,
    categoryRoller,
    rollUpFlows,
    snapshotWindow,
} from "./highlightSnapshotMath";
import type { CategoryShape, FlowRow, SpendRow } from "./highlightSnapshotMath";

// The other half of the highlight coverage. highlightRules.test.ts pins the sentences; this
// pins the numbers they are handed — which months count, what divides the averages, and where
// an amount lands once children roll into parents.
//
// Every fixture states an absolute instant in UTC and a zone to read it in, so the suite gives
// the same answer wherever it runs. Where the two disagree — a Delhi user just past midnight,
// a New York user in the week the clocks move — that disagreement IS the test.

const DELHI = "Asia/Kolkata";
const NEW_YORK = "America/New_York";

/** Old enough that nothing clamps the averaging window. */
const LONG_HISTORY = new Date("2020-01-01T00:00:00Z");

describe("snapshotWindow: which month the user is standing in", () => {
    it("reads the month from the user's zone, not from UTC", () => {
        // 00:30 on 1 October in Delhi, still 19:00 on 30 September in UTC. The dashboard says
        // October, so a highlight saying September contradicts the screen it sits on.
        const window = snapshotWindow(DELHI, new Date("2026-09-30T19:00:00Z"), LONG_HISTORY);

        assert.equal(window.label, "2026-10");
        assert.equal(window.prevLabel, "2026-09");
        assert.equal(window.daysElapsed, 1);
    });

    it("counts the first of the month as one day elapsed, not zero", () => {
        // A pace rule divides by this; zero is a crash or an infinity.
        const window = snapshotWindow(DELHI, new Date("2026-09-30T19:00:00Z"), LONG_HISTORY);
        assert.equal(window.daysElapsed, 1);
    });

    it("counts elapsed days by the calendar date, not by elapsed hours", () => {
        // 11:30am on the 8th: seven and a bit 24-hour periods, but a person expects 8.
        const window = snapshotWindow(DELHI, new Date("2026-09-08T06:00:00Z"), LONG_HISTORY);
        assert.equal(window.daysElapsed, 8);
        assert.equal(window.daysInMonth, 30);
    });

    it("gets February right in a leap year", () => {
        const window = snapshotWindow(DELHI, new Date("2028-02-10T06:00:00Z"), LONG_HISTORY);
        assert.equal(window.label, "2028-02");
        assert.equal(window.daysInMonth, 29);
    });

    it("counts 31 days in a month containing a 23-hour day", () => {
        // New York, March 2026: the clocks go forward, so the month is 743 hours, not 744.
        // Dividing hours by 24 gives 30.96 days and skews every pace projection in it.
        const window = snapshotWindow(NEW_YORK, new Date("2026-03-15T16:00:00Z"), LONG_HISTORY);
        assert.equal(window.label, "2026-03");
        assert.equal(window.daysInMonth, 31);
    });
});

describe("snapshotWindow: the comparison months", () => {
    it("looks back over complete months only, never the one being lived in", () => {
        const window = snapshotWindow(DELHI, new Date("2026-09-08T06:00:00Z"), LONG_HISTORY);

        assert.deepEqual(window.completeLabels, ["2026-06", "2026-07", "2026-08"]);
        assert.equal(window.completeLabels.includes(window.label), false);
        assert.equal(window.completeLabels.length, AVERAGE_MONTHS);
    });

    it("reaches back across the year boundary in January", () => {
        // Guards against string arithmetic on "YYYY-MM": a month back from "2026-01" gives
        // "2026-00", three back "2026--2". Stepping the zone-local month needs no special case.
        const window = snapshotWindow(DELHI, new Date("2026-01-15T06:00:00Z"), LONG_HISTORY);

        assert.equal(window.label, "2026-01");
        assert.equal(window.prevLabel, "2025-12");
        assert.deepEqual(window.completeLabels, ["2025-10", "2025-11", "2025-12"]);
    });

    it("starts the query window at the first instant of the oldest month it compares", () => {
        // `windowStart` bounds the aggregation, `completeLabels` the rollup. Disagreeing, they
        // would drop fetched spend — or average a month over rows the query never returned.
        const window = snapshotWindow(DELHI, new Date("2026-09-08T06:00:00Z"), LONG_HISTORY);

        // Midnight on 1 June in Delhi is 18:30 on 31 May in UTC.
        assert.equal(window.windowStart.toISOString(), "2026-05-31T18:30:00.000Z");
        assert.equal(window.completeLabels[0], "2026-06");
    });
});

describe("snapshotWindow: how many months the averages may claim", () => {
    it("averages over one month for an account opened this month", () => {
        // Dividing this person's June–August spend, of which there is none, by three would
        // tell them every category had collapsed.
        const window = snapshotWindow(DELHI, new Date("2026-09-08T06:00:00Z"), new Date("2026-09-02T06:00:00Z"));
        assert.equal(window.monthsAveraged, 1);
    });

    it("grows the divisor with the history, up to the cap", () => {
        const twoMonths = snapshotWindow(DELHI, new Date("2026-09-08T06:00:00Z"), new Date("2026-07-20T06:00:00Z"));
        assert.equal(twoMonths.monthsAveraged, 2);

        const years = snapshotWindow(DELHI, new Date("2026-09-08T06:00:00Z"), LONG_HISTORY);
        assert.equal(years.monthsAveraged, AVERAGE_MONTHS);
    });

    it("never divides by zero, even when the first transaction is today", () => {
        const window = snapshotWindow(DELHI, new Date("2026-09-08T06:00:00Z"), new Date("2026-09-08T05:00:00Z"));
        assert.equal(window.monthsAveraged, 1);
    });
});

describe("categoryRoller", () => {
    const CATEGORIES: CategoryShape[] = [
        { _id: "food", name: "Food & Dining", parent: null },
        { _id: "groceries", name: "Groceries", parent: "food" },
        { _id: "restaurants", name: "Restaurants", parent: "food" },
        { _id: "rent", name: "Rent", parent: null },
    ];

    it("counts a child under its parent", () => {
        const roll = categoryRoller(CATEGORIES);
        assert.equal(roll.rollKey("groceries"), "food");
        assert.equal(roll.rollName(roll.rollKey("groceries")), "Food & Dining");
    });

    it("leaves a top-level category as itself", () => {
        const roll = categoryRoller(CATEGORIES);
        assert.equal(roll.rollKey("rent"), "rent");
        assert.equal(roll.rollName("rent"), "Rent");
    });

    it("files spend with no category under Uncategorised", () => {
        const roll = categoryRoller(CATEGORIES);
        assert.equal(roll.rollKey(null), "uncategorised");
        assert.equal(roll.rollName("uncategorised"), "Uncategorised");
    });

    it("names a since-deleted category rather than printing its id", () => {
        // Transactions keep pointing at a category since removed, and a hex string in a
        // sentence written for a person is worse than admitting the label is gone.
        const roll = categoryRoller(CATEGORIES);
        assert.equal(roll.rollName("68bd0c1f9a7e4c0012ab34cd"), "Uncategorised");
    });
});

describe("rollUpFlows", () => {
    const CATEGORIES: CategoryShape[] = [
        { _id: "food", name: "Food & Dining", parent: null },
        { _id: "groceries", name: "Groceries", parent: "food" },
        { _id: "restaurants", name: "Restaurants", parent: "food" },
    ];

    // 8 September 2026 in Delhi: current month 2026-09, comparing 2026-06 to 2026-08.
    const NOW = new Date("2026-09-08T06:00:00Z");
    const roll = categoryRoller(CATEGORIES);

    const run = (
        totals: FlowRow[],
        spend: SpendRow[],
        firstTxnAt: Date = LONG_HISTORY,
    ) => rollUpFlows(snapshotWindow(DELHI, NOW, firstTxnAt), roll, { totals, spend });

    const find = (rows: { categoryId: string; total: number }[], id: string) =>
        rows.find((r) => r.categoryId === id);

    it("separates the month being lived in from the months behind it", () => {
        const flows = run(
            [
                { month: "2026-09", type: "income", total: 500_00 },
                { month: "2026-09", type: "expense", total: 200_00 },
                { month: "2026-08", type: "income", total: 400_00 },
            ],
            [],
        );

        assert.deepEqual(flows.current, { income: 500_00, expense: 200_00 });
        assert.equal(flows.months.length, 3);
        assert.deepEqual(flows.months.at(-1), { label: "2026-08", income: 400_00, expense: 0 });
    });

    it("puts a backdated transaction in the closed month it belongs to", () => {
        // Recorded today, dated July: it must move the July average and leave this month's
        // spend alone, or the pace rules announce a spike on a day nothing was spent.
        const flows = run(
            [{ month: "2026-07", type: "expense", total: 900_00 }],
            [{ month: "2026-07", categoryId: "groceries", total: 900_00 }],
        );

        assert.deepEqual(flows.thisMonthByCategory, []);
        assert.equal(flows.current.expense, 0);
        // 900 in one of three averaged months.
        assert.equal(find(flows.categoryAverages, "food")?.total, 300_00);
        assert.deepEqual(flows.months.find((m) => m.label === "2026-07"), {
            label: "2026-07",
            income: 0,
            expense: 900_00,
        });
    });

    it("ignores a month outside the window instead of averaging it in somewhere", () => {
        // The aggregation bounds `occurredAt`, so this should not arrive — but a row belongs
        // to the current month or a complete one behind it, never a third bucket.
        const flows = run(
            [{ month: "2026-02", type: "expense", total: 999_00 }],
            [{ month: "2026-02", categoryId: "groceries", total: 999_00 }],
        );

        assert.deepEqual(flows.thisMonthByCategory, []);
        assert.deepEqual(flows.categoryAverages, []);
        assert.deepEqual(flows.months.map((m) => m.expense), [0, 0, 0]);
    });

    it("divides the averages by the months there is history for", () => {
        // The same 600 over the one month this account has existed for. Over three it reads
        // as 200, and the current month looks like a 3× blowout.
        const spend: SpendRow[] = [{ month: "2026-08", categoryId: "groceries", total: 600_00 }];

        const young = run([], spend, new Date("2026-07-20T06:00:00Z"));
        assert.equal(find(young.categoryAverages, "food")?.total, 300_00);

        const established = run([], spend, LONG_HISTORY);
        assert.equal(find(established.categoryAverages, "food")?.total, 200_00);
    });

    it("omits months before the account existed rather than reporting them as zero", () => {
        // A zero-income month is a real answer the savings-rate rule acts on, so "no idea"
        // has to look different from "you earned nothing".
        const flows = run(
            [{ month: "2026-08", type: "income", total: 400_00 }],
            [],
            new Date("2026-08-05T06:00:00Z"),
        );

        assert.deepEqual(flows.months, [{ label: "2026-08", income: 400_00, expense: 0 }]);
    });

    it("reports a genuinely empty month inside the history as zero", () => {
        // The account existed and nothing was recorded. That IS zero, unlike the case above.
        const flows = run([{ month: "2026-08", type: "income", total: 400_00 }], []);

        assert.deepEqual(flows.months, [
            { label: "2026-06", income: 0, expense: 0 },
            { label: "2026-07", income: 0, expense: 0 },
            { label: "2026-08", income: 400_00, expense: 0 },
        ]);
    });

    it("sums siblings into one slice on both sides of the comparison", () => {
        // Two children of Food & Dining, this month and last. Either side failing to combine
        // them compares half a category against a whole one and finds a change that isn't there.
        const flows = run(
            [],
            [
                { month: "2026-09", categoryId: "groceries", total: 100_00 },
                { month: "2026-09", categoryId: "restaurants", total: 50_00 },
                { month: "2026-08", categoryId: "groceries", total: 200_00 },
                { month: "2026-07", categoryId: "restaurants", total: 100_00 },
            ],
        );

        assert.deepEqual(flows.thisMonthByCategory, [
            { categoryId: "food", name: "Food & Dining", total: 150_00 },
        ]);
        // (200 + 100) over three months.
        assert.deepEqual(flows.categoryAverages, [
            { categoryId: "food", name: "Food & Dining", total: 100_00 },
        ]);
    });

    it("keeps uncategorised spend as its own slice", () => {
        const flows = run(
            [],
            [
                { month: "2026-09", categoryId: null, total: 75_00 },
                { month: "2026-09", categoryId: "groceries", total: 25_00 },
            ],
        );

        assert.equal(find(flows.thisMonthByCategory, "uncategorised")?.total, 75_00);
        assert.equal(find(flows.thisMonthByCategory, "food")?.total, 25_00);
    });

    it("returns whole paise, so no highlight ever prints a fraction of one", () => {
        // 100 over three months. Money is an integer count of paise everywhere else.
        const flows = run([], [{ month: "2026-08", categoryId: "groceries", total: 100 }]);

        const average = find(flows.categoryAverages, "food")?.total;
        assert.equal(average, 33);
        assert.equal(Number.isInteger(average), true);
    });

    it("says nothing at all about a month with no rows", () => {
        const flows = run([], []);

        assert.deepEqual(flows.current, { income: 0, expense: 0 });
        assert.deepEqual(flows.thisMonthByCategory, []);
        assert.deepEqual(flows.categoryAverages, []);
    });
});
