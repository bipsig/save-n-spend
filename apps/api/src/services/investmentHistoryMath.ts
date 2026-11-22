import type { LedgerEntry, MonthPoint, GrowthPoint, UpdateEntry, HoldingTrend, PortfolioPoint, PortfolioGrowth, PortfolioTrend } from "@save-n-spend/types";
import { addMonthsInZone, partsInZone, startOfMonthInZone } from "../utils/timezone";
import { shortMonth } from "../utils/dateLabel";

// A holding's value at the end of each month, worked out from records the app already keeps —
// nothing is stored for it. Pure, so it can be tested without a database.
//
//   invested(t) = opening cost + money put in − money taken out, up to t
//   gain(t)     = the opening gain + every value update, up to t
//   value(t)    = invested(t) + gain(t)
//
// The opening gain is the difference between the value typed when the holding was added and its
// cost; that value is not saved as an entry of its own, so it is recovered as whatever today's
// balance has that the dated records don't explain (`balance − cost − flows − updates`).
//
// A month with no value update carries the last known gain forward: money added since counts at
// cost and nothing is assumed to have grown or fallen. Such a month is flagged `upd: false`.
//
// The history starts the day the holding was added (or its earliest record, if that is earlier).
// Nothing before that is known, so nothing before that is drawn.

export type HoldingRecords = {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    /** Cost basis when it was added, paise. */
    startingBalance: number;
    /** Today's balance, paise — the one number the records must add up to. */
    balance: number;
    createdAt: Date;
    /** Money in (+) and out (−) of the holding, dated. */
    flows: { at: Date; amount: number }[];
    /** Value updates, dated and signed: positive = it was worth more than the carried value. */
    updates: { at: Date; amount: number }[];
};

export type { LedgerEntry, MonthPoint, GrowthPoint, UpdateEntry, HoldingTrend, PortfolioPoint, PortfolioGrowth, PortfolioTrend };

const monthKey = (instant: Date, zone: string): string => {
    const { year, month } = partsInZone(instant, zone);
    return `${year}-${String(month).padStart(2, "0")}`;
};

/** "Sep", with the year when it is the first point or a January. */
const labelOf = (instant: Date, zone: string, withYear: boolean): string => {
    const text = shortMonth(instant, zone);
    if (!withYear) return text;
    const { year } = partsInZone(instant, zone);
    return `${text} ’${String(year).slice(2)}`;
};

const sum = (xs: { amount: number }[]): number => xs.reduce((s, x) => s + x.amount, 0);

export const holdingTrend = (h: HoldingRecords, zone: string, now: Date): HoldingTrend => {
    const flows = [...h.flows].sort((a, b) => a.at.getTime() - b.at.getTime());
    const updates = [...h.updates].sort((a, b) => a.at.getTime() - b.at.getTime());

    // What today's balance has that the dated records don't explain: the opening gain.
    const opening = h.balance - (h.startingBalance + sum(flows) + sum(updates));

    const earliest = [h.createdAt, flows[0]?.at, updates[0]?.at]
        .filter((d): d is Date => !!d)
        .reduce((a, b) => (b.getTime() < a.getTime() ? b : a));
    const firstMonth = startOfMonthInZone(earliest, zone);
    const currentMonth = startOfMonthInZone(now, zone);
    const monthCount = Math.max(1,
        (partsInZone(currentMonth, zone).year - partsInZone(firstMonth, zone).year) * 12
        + partsInZone(currentMonth, zone).month - partsInZone(firstMonth, zone).month + 1);

    const points: MonthPoint[] = [];
    for (let k = 0; k < monthCount; k++) {
        const start = addMonthsInZone(firstMonth, zone, k);
        const last = k === monthCount - 1;
        // Up to the end of the month; the current month takes everything on record, so its
        // point is exactly today's balance.
        const end = last ? null : addMonthsInZone(firstMonth, zone, k + 1);
        const before = <T extends { at: Date }>(xs: T[]) => (end ? xs.filter((x) => x.at.getTime() < end.getTime()) : xs);
        const within = <T extends { at: Date }>(xs: T[]) => before(xs).filter((x) => x.at.getTime() >= start.getTime());

        const invested = h.startingBalance + sum(before(flows));
        points.push({
            month: monthKey(start, zone),
            label: labelOf(start, zone, k === 0 || partsInZone(start, zone).month === 1),
            value: invested + opening + sum(before(updates)),
            invested,
            upd: k === 0 || within(updates).length > 0,
            contrib: sum(within(flows)),
            ...(last ? { partial: true } : {}),
        });
    }

    const growth: GrowthPoint[] = [];
    let lastUpd = 0;
    points.forEach((p, i) => {
        if (i === 0) {
            growth.push({ month: p.month, label: p.label, growth: null, pct: null, upd: true, cover: 1, opening: true });
            return;
        }
        const prev = points[i - 1];
        const g = (p.value - p.invested) - (prev.value - prev.invested);
        const base = prev.value + p.contrib;
        growth.push({
            month: p.month,
            label: p.label,
            growth: g,
            pct: base > 0 ? (g / base) * 100 : 0,
            upd: p.upd,
            cover: p.upd ? i - lastUpd : 0,
        });
        if (p.upd) lastUpd = i;
    });

    // Each update with the value it left the holding at, newest first.
    let gain = opening;
    const log: UpdateEntry[] = updates.map((u) => {
        gain += u.amount;
        const invested = h.startingBalance + sum(flows.filter((f) => f.at.getTime() <= u.at.getTime()));
        return { at: u.at.toISOString(), value: invested + gain, change: u.amount };
    }).reverse();

    const lastUpdIndex = points.reduce((idx, p, i) => (p.upd ? i : idx), 0);

    return {
        id: h.id,
        name: h.name,
        icon: h.icon,
        color: h.color,
        startedAt: earliest.toISOString(),
        lastUpdatedAt: updates.length ? updates[updates.length - 1].at.toISOString() : null,
        monthsSinceUpdate: points.length - 1 - lastUpdIndex,
        points,
        growth,
        updates: log,
    };
};

export const portfolioTrend = (records: HoldingRecords[], zone: string, now: Date): PortfolioTrend => {
    const holdings = records.map((r) => holdingTrend(r, zone, now));
    if (holdings.length === 0) return { points: [], growth: [], holdings };

    // Every holding ends at the current month; the portfolio starts at the earliest one.
    const months = holdings.reduce((a, h) => (h.points.length > a.length ? h.points : a), holdings[0].points).map((p) => ({ month: p.month, label: p.label }));
    const offsetOf = (h: HoldingTrend) => months.length - h.points.length;

    const points: PortfolioPoint[] = months.map((m, i) => {
        const present = holdings.filter((h) => i >= offsetOf(h));
        const at = (h: HoldingTrend) => h.points[i - offsetOf(h)];
        return {
            month: m.month,
            label: m.label,
            value: present.reduce((s, h) => s + at(h).value, 0),
            invested: present.reduce((s, h) => s + at(h).invested, 0),
            contrib: present.reduce((s, h) => s + at(h).contrib, 0),
            upd: present.some((h) => at(h).upd),
            updated: present.filter((h) => at(h).upd).length,
            existing: present.length,
            parts: present.map((h) => ({ id: h.id, value: at(h).value })),
            ...(i === months.length - 1 ? { partial: true } : {}),
        };
    });

    const growth: PortfolioGrowth[] = months.map((m, i) => {
        // Only holdings that were already there last month: one added this month has an opening
        // value, not growth.
        const eligible = holdings.filter((h) => i - offsetOf(h) >= 1);
        if (eligible.length === 0) {
            return { month: m.month, label: m.label, growth: null, pct: null, upd: true, cover: 1, opening: true, parts: [] };
        }
        const rows = eligible.map((h) => ({ h, g: h.growth[i - offsetOf(h)] }));
        const total = rows.reduce((s, r) => s + (r.g.growth ?? 0), 0);
        const base = rows.reduce((s, r) => s + workingMoney(r.h, i - offsetOf(r.h)), 0);
        const upd = rows.some((r) => r.g.upd);
        return {
            month: m.month,
            label: m.label,
            growth: total,
            pct: base > 0 ? (total / base) * 100 : 0,
            upd,
            cover: Math.max(0, ...rows.map((r) => r.g.cover)),
            parts: rows.map((r) => ({ id: r.h.id, growth: r.g.growth ?? 0, upd: r.g.upd, cover: r.g.cover })),
        };
    });

    return { points, growth, holdings };
};

/** The money that was working in a holding in month `idx`: last month's value plus what was added. */
const workingMoney = (h: HoldingTrend, idx: number): number => h.points[idx - 1].value + h.points[idx].contrib;

const KIND_ORDER = { added: 0, in: 1, out: 1, update: 2 } as const;

/** Every entry on a holding, oldest first, with the value it left the holding at. */
export const holdingLedger = (h: HoldingRecords): LedgerEntry[] => {
    const opening = h.balance - (h.startingBalance + sum(h.flows) + sum(h.updates));
    type Event = { at: Date; kind: LedgerEntry["kind"]; amount: number };
    const events = ([
        { at: h.createdAt, kind: "added", amount: 0 } as Event,
        ...h.flows.map((f): Event => ({ at: f.at, kind: f.amount >= 0 ? "in" : "out", amount: f.amount })),
        ...h.updates.map((u): Event => ({ at: u.at, kind: "update", amount: u.amount })),
    ] as Event[]).sort((a, b) => a.at.getTime() - b.at.getTime() || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

    let invested = h.startingBalance;
    let gain = opening;
    return events.map((e) => {
        if (e.kind === "in" || e.kind === "out") invested += e.amount;
        else if (e.kind === "update") gain += e.amount;
        const value = invested + gain;
        return {
            at: e.at.toISOString(),
            holdingId: h.id,
            holdingName: h.name,
            kind: e.kind,
            amount: e.kind === "added" ? value : e.amount,
            valueAfter: value,
        };
    });
};
