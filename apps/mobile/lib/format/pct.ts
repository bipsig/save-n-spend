import { MINUS } from "@/lib/format/money";

// Every percentage has one decimal, never dropped (D9 C): "24.7%", "+12.3%", "100.0%", "0.0%".

/**
 * - `share`: part of a whole, unsigned ("24.7%").
 * - `return` / `change`: signed ("+8.4%", "−4.5%").
 */
export type PctKind = "share" | "return" | "change";

const oneDecimal = (n: number): number => Math.sign(n) * (Math.round(Math.abs(n) * 10 + 1e-9) / 10);

const signed = (n: number, plus: boolean): string => {
  const r = oneDecimal(n);
  if (r === 0) return "0.0";
  return `${r < 0 ? MINUS : plus ? "+" : ""}${Math.abs(r).toFixed(1)}`;
};

/** `n` is already a percentage (24.66, not 0.2466). Not finite (a change from zero) is "—". */
export const formatPct = (n: number, { kind = "share" }: { kind?: PctKind } = {}): string =>
  Number.isFinite(n) ? `${signed(n, kind !== "share")}%` : "—";

/** A change between two rates, in percentage points: "+5.0 pts", "−4.5 pts". */
export const formatPoints = (n: number): string =>
  Number.isFinite(n) ? `${signed(n, true)} pts` : "—";

/** `part` as a percentage of `whole`; 0 when there is no whole to divide by. */
export const percentOf = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0);
