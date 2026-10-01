import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SplitwiseFormatError, categoryHint, classifyRow, netBalance, parseSplitwiseCsv, rowKey } from "./splitwiseCsv";

// A real group export (a Kerala trip), names swapped for placeholders.
const CSV = readFileSync(join(__dirname, "__fixtures__", "splitwise-trip.csv"), "utf8");
const ME = "You Me";

describe("parseSplitwiseCsv", () => {
    const table = parseSplitwiseCsv(CSV);

    it("reads the people from the header", () => {
        assert.deepEqual(table.people, ["Friend A", "You Me", "Friend B", "Friend C", "Friend D"]);
    });

    it("reads every row, and the Total balance line separately", () => {
        assert.equal(table.rows.length, 36);
        assert.equal(table.totals?.[ME], 364_240);
    });

    it("keeps amounts to the paisa", () => {
        const stay = table.rows.find((r) => r.description === "Munnar Stay")!;
        assert.equal(stay.cost, 1_187_700);
        assert.equal(stay.effects[ME], -237_540);
    });

    it("refuses a file that isn't a Splitwise export", () => {
        assert.throws(() => parseSplitwiseCsv("Name,Amount\nx,1"), SplitwiseFormatError);
        assert.throws(() => parseSplitwiseCsv(""), SplitwiseFormatError);
    });

    it("keeps a quoted description with a comma in it as one field", () => {
        const t = parseSplitwiseCsv('Date,Description,Category,Cost,Currency,A,B\n2026-01-01,"Dinner, drinks",General,100.00,INR,50.00,-50.00\n');
        assert.equal(t.rows[0].description, "Dinner, drinks");
    });
});

describe("classifyRow on the real file", () => {
    const rows = parseSplitwiseCsv(CSV).rows.map((r) => classifyRow(r, ME));
    const count = (k: string) => rows.filter((r) => r.kind === k).length;

    it("sorts every row into what it means for you", () => {
        assert.equal(count("friendPaid"), 29);
        assert.equal(count("youPaid"), 2);
        assert.equal(count("settlement"), 1);
        assert.equal(count("othersPayment"), 1);
        assert.equal(count("notYours"), 1);
        assert.equal(count("noEffect"), 2);
        assert.equal(count("unclear"), 0);
    });

    it("adds up to your real share", () => {
        assert.equal(rows.reduce((s, r) => s + r.myShare, 0), 2_295_500);
    });

    it("matches Splitwise's own balance for you exactly", () => {
        assert.equal(netBalance(rows, ME), 364_240);
    });

    it("reads a row you paid: your share is cost minus your effect", () => {
        const zostel = rows.find((r) => r.description === "Zostel alleppey")!;
        assert.equal(zostel.kind, "youPaid");
        assert.equal(zostel.myShare, 111_425);
        assert.equal(zostel.shares["Friend A"], 111_425);
    });

    it("reads a settle-up and its direction", () => {
        const s = rows.find((r) => r.kind === "settlement")!;
        assert.equal(s.counterparty, "Friend C");
        assert.equal(s.direction, "received");
    });
});

describe("rowKey and categoryHint", () => {
    it("fingerprints a row stably", () => {
        const [r] = parseSplitwiseCsv(CSV).rows;
        assert.equal(rowKey(r), rowKey({ ...r }));
    });

    it("guesses from the description over Splitwise's 'General'", () => {
        assert.equal(categoryHint("Varkala Stay", "General"), "stay");
        assert.equal(categoryHint("Alleppy cafe", "Dining out"), "food");
        assert.equal(categoryHint("scooty Kochi", "General"), "transport");
        assert.equal(categoryHint("Munnar Trek", "General"), "activities");
        assert.equal(categoryHint("Munnar expense", "General"), null);
    });
});
