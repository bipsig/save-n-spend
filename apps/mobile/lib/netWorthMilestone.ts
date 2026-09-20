// Paise. Round-number step, scaled by magnitude so a milestone means roughly the same
// thing whether net worth is ₹8L or ₹80L — a flat ₹1L step would either never fire for
// someone well past it, or fire every few weeks for someone just starting out.
const LAKH = 100_000 * 100;
const TEN_LAKH = 10 * LAKH;
const FIFTY_LAKH = 50 * LAKH;

const stepFor = (netWorth: number): number =>
  netWorth < TEN_LAKH ? LAKH : netWorth < FIFTY_LAKH ? 5 * LAKH : 10 * LAKH;

/** The smallest round multiple of `step` strictly greater than `value`. */
const nextMultiple = (value: number, step: number): number => Math.floor(value / step) * step + step;

/**
 * The milestone just crossed between `prev` (the most recent prior complete month) and
 * `current` (now), or null if none was — either because nothing rounds cleanly in
 * between, or because `seen` (the highest one already celebrated, device-local) already
 * covers it. Upward crossings only: net worth dropping past a round number isn't a
 * celebration.
 */
export const milestoneCrossed = (prev: number, current: number, seen: number): number | null => {
  if (current <= prev) return null;
  const candidate = nextMultiple(prev, stepFor(current));
  if (candidate > current) return null;
  if (candidate <= seen) return null;
  return candidate;
};
