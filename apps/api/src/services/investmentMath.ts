import type { AnnualReturnStatus, InvestedHow } from "@save-n-spend/types";

// The yearly return on a holding: XIRR, the rate r at which
//
//   Σ flowᵢ / (1 + r)^(yearsᵢ)  =  0
//
// over every dated cash flow — money in negative (from the investor's side), money out and
// today's value positive. Unlike a simple "gain ÷ invested", it credits each rupee only for
// the time it was actually invested, so a SIP's recent instalments don't dilute the figure.
// Pure, so it can be tested.

export type Flow = { amount: number; at: Date };

const YEAR_MS = 365 * 86_400_000;
/** Below this much time invested (on average, per rupee) a yearly figure is mostly
 *  noise — −2% over three weeks annualises to something absurd. */
export const MIN_ANNUALISE_DAYS = 90;

const npv = (rate: number, flows: Flow[], t0: number): number =>
    flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, (f.at.getTime() - t0) / YEAR_MS), 0);

const dnpv = (rate: number, flows: Flow[], t0: number): number =>
    flows.reduce((sum, f) => {
        const t = (f.at.getTime() - t0) / YEAR_MS;
        return sum - (t * f.amount) / Math.pow(1 + rate, t + 1);
    }, 0);

/** The rate, or null when there isn't one (flows all one sign) or it can't be pinned down. */
export const xirr = (flows: Flow[]): number | null => {
    if (flows.length < 2) return null;
    if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
    const t0 = Math.min(...flows.map((f) => f.at.getTime()));

    // Newton from a sensible guess — fast when it converges, which is nearly always.
    let rate = 0.1;
    for (let i = 0; i < 50; i++) {
        const value = npv(rate, flows, t0);
        const slope = dnpv(rate, flows, t0);
        if (!Number.isFinite(value) || !Number.isFinite(slope) || slope === 0) break;
        const next = rate - value / slope;
        if (next <= -0.9999 || !Number.isFinite(next)) break;
        if (Math.abs(next - rate) < 1e-9) return next;
        rate = next;
    }

    // Bisection fallback over a wide bracket: slower, but can't wander off.
    let lo = -0.9999;
    let hi = 10;
    let fLo = npv(lo, flows, t0);
    const fHi = npv(hi, flows, t0);
    if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const fMid = npv(mid, flows, t0);
        if (Math.abs(fMid) < 1e-6 || hi - lo < 1e-10) return mid;
        if (fLo * fMid < 0) hi = mid;
        else {
            lo = mid;
            fLo = fMid;
        }
    }
    return (lo + hi) / 2;
};

/** Whole calendar months from `from` to `to`, at least 1. */
const monthsBetween = (from: Date, to: Date): number =>
    Math.max(1, (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth()));

const addMonths = (d: Date, n: number): Date => {
    const r = new Date(d);
    r.setUTCMonth(r.getUTCMonth() + n);
    return r;
};

export type HoldingFlowsInput = {
    /** The opening cost basis — what was already invested when tracking began. */
    startingBalance: number;
    investedSince: Date | null;
    investedHow: InvestedHow | null;
    /** When tracking began: the account's creation. A SIP's opening amount is spread over
     *  the months from `investedSince` up to here. */
    createdAt: Date;
    contributions: Flow[];
    redemptions: Flow[];
    current: number;
    now: Date;
};

/** Every dated cash flow for one holding, from the investor's side. Null when the opening
 *  amount has no date to put it on. */
export const holdingFlows = (h: HoldingFlowsInput): Flow[] | null => {
    const flows: Flow[] = [];
    if (h.startingBalance > 0) {
        if (!h.investedSince) return null;
        if (h.investedHow === "sip") {
            // The opening amount went in monthly, not all on day one. Evenly is the honest
            // assumption without the real instalments; the remainder lands on the last one.
            const n = monthsBetween(h.investedSince, h.createdAt);
            const each = Math.floor(h.startingBalance / n);
            for (let k = 0; k < n; k++) {
                const amount = k === n - 1 ? h.startingBalance - each * (n - 1) : each;
                flows.push({ amount: -amount, at: addMonths(h.investedSince, k) });
            }
        }
        else {
            flows.push({ amount: -h.startingBalance, at: h.investedSince });
        }
    }
    for (const c of h.contributions) flows.push({ amount: -c.amount, at: c.at });
    for (const r of h.redemptions) flows.push({ amount: r.amount, at: r.at });
    if (h.current > 0) flows.push({ amount: h.current, at: h.now });
    return flows;
};

/** The yearly return for a set of flows, with the reason when there isn't one to show. */
export const annualReturnOf = (
    flows: Flow[] | null,
    now: Date,
): { annualReturn: number | null; annualReturnStatus: AnnualReturnStatus } => {
    if (flows === null) return { annualReturn: null, annualReturnStatus: "noStartDate" };
    const invested = flows.filter((f) => f.amount < 0);
    if (invested.length === 0) return { annualReturn: null, annualReturnStatus: "unavailable" };
    // How long the average rupee has been in, not how old the first payment is: one small
    // instalment months ago followed by most of the money last month would otherwise pass,
    // and annualise a small gain over a short real period into something wild.
    const weight = invested.reduce((s, f) => s + Math.abs(f.amount), 0);
    const avgDays = invested.reduce((s, f) => s + Math.abs(f.amount) * (now.getTime() - f.at.getTime()), 0) / weight / 86_400_000;
    if (avgDays < MIN_ANNUALISE_DAYS) {
        return { annualReturn: null, annualReturnStatus: "tooEarly" };
    }
    const rate = xirr(flows);
    return rate === null
        ? { annualReturn: null, annualReturnStatus: "unavailable" }
        : { annualReturn: rate, annualReturnStatus: "ok" };
};
