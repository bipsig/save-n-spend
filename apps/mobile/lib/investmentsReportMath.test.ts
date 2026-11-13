import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GrowthPoint, MonthPoint } from "@save-n-spend/types";
import {
  availableFys, bestWorst, estimatePages, fyLabel, fyOf, fyRange, ledgerCsv, ledgerInPeriod,
  matchPreset, periodBounds, presetSections, sectionKeys, slicePeriod,
} from "./investmentsReportMath";

const months = ["2026-09", "2026-10", "2026-11"];
const pt = (month: string): MonthPoint => ({ month, label: month, value: 1, invested: 1, upd: true, contrib: 0 });
const gr = (month: string, growth: number | null, extra: Partial<GrowthPoint> = {}): GrowthPoint =>
  ({ month, label: month, growth, pct: null, upd: true, cover: 1, ...extra });

describe("financial years", () => {
  it("runs April to March", () => {
    assert.deepEqual(fyRange(2026), { from: "2026-04", to: "2027-03" });
    assert.equal(fyLabel(2026), "FY 2026–27");
    assert.equal(fyLabel(2099), "FY 2099–00");
  });
  it("places a month in its year", () => {
    assert.equal(fyOf("2026-04"), 2026);
    assert.equal(fyOf("2027-03"), 2026);
    assert.equal(fyOf("2026-03"), 2025);
  });
  it("lists every year the history touches, newest first", () => {
    assert.deepEqual(availableFys("2026-09", "2026-11"), [2026]);
    assert.deepEqual(availableFys("2025-02", "2026-11"), [2026, 2025, 2024]);
  });
});

describe("periods", () => {
  it("clips to the history", () => {
    assert.deepEqual(periodBounds({ kind: "all" }, months), { from: "2026-09", to: "2026-11" });
    assert.deepEqual(periodBounds({ kind: "6m" }, months), { from: "2026-09", to: "2026-11" });
    assert.deepEqual(periodBounds({ kind: "fy", start: 2026 }, months), { from: "2026-09", to: "2026-11" });
  });
  it("is empty for a year with no history", () => {
    assert.equal(periodBounds({ kind: "fy", start: 2025 }, months), null);
    assert.equal(periodBounds({ kind: "all" }, []), null);
  });
  it("takes the last N months of a longer history", () => {
    const long = Array.from({ length: 14 }, (_, i) => `${2025 + Math.floor((i + 8) / 12)}-${String(((i + 8) % 12) + 1).padStart(2, "0")}`);
    assert.equal(periodBounds({ kind: "6m" }, long)?.from, long[8]);
    assert.equal(periodBounds({ kind: "1y" }, long)?.from, long[2]);
  });
  it("slices points and growth together", () => {
    const s = slicePeriod(months.map(pt), months.map((m) => gr(m, 1)), { kind: "fy", start: 2026 });
    assert.equal(s?.points.length, 3);
    const none = slicePeriod(months.map(pt), months.map((m) => gr(m, 1)), { kind: "fy", start: 2024 });
    assert.equal(none, null);
  });
  it("keeps only ledger rows inside the period", () => {
    const l = [{ at: "2026-09-26T00:00:00Z" }, { at: "2026-11-02T00:00:00Z" }] as never[];
    assert.equal(ledgerInPeriod(l, { from: "2026-10", to: "2026-11" }, (iso) => iso.slice(0, 7)).length, 1);
  });
});

describe("sections and presets", () => {
  it("offers portfolio-only sections only for the whole portfolio", () => {
    assert.ok(sectionKeys("all").includes("allocation"));
    assert.ok(!sectionKeys("holding").includes("allocation"));
    assert.ok(sectionKeys("holding").includes("monthTable"));
  });
  it("recognises a preset, and calls anything else custom", () => {
    assert.equal(matchPreset(presetSections("full", "all"), "all"), "full");
    assert.equal(matchPreset(presetSections("summary", "holding"), "holding"), "summary");
    assert.equal(matchPreset(["ledger"], "all"), "ledger");
    assert.equal(matchPreset(["ledger", "summary"], "all"), null);
    assert.equal(matchPreset([], "all"), null);
  });
  it("estimates pages from what is switched on", () => {
    assert.equal(estimatePages(sectionKeys("all"), 4, 6), 1 + 1 + 4 + 1);
    assert.equal(estimatePages(["ledger"], 4, 60), 3);
    assert.equal(estimatePages(["summary"], 4, 0), 1);
  });
});

describe("ledger CSV and best/worst", () => {
  it("writes a header, a BOM and escaped cells", () => {
    const csv = ledgerCsv([{ at: "2026-10-12T00:00:00Z", holdingId: "a", holdingName: 'ICICI, "Pru"', kind: "in", amount: 500000, valueAfter: 6854381 }], (iso) => iso.slice(0, 10));
    const lines = csv.slice(1).split("\r\n");
    assert.equal(csv[0], "﻿");
    assert.equal(lines[0], "Date,Holding,Entry,Amount (INR),Value after (INR)");
    assert.equal(lines[1], '2026-10-12,"ICICI, ""Pru""",Money in,5000.00,68543.81');
  });
  it("ignores the opening month and months with no update", () => {
    const g = [gr("a", null, { opening: true }), gr("b", -1267309), gr("c", 0, { upd: false }), gr("d", 3378648)];
    const r = bestWorst(g);
    assert.equal(r.best?.month, "d");
    assert.equal(r.worst?.month, "b");
    assert.deepEqual(bestWorst([gr("a", null, { opening: true })]), { best: null, worst: null });
  });
});
