/**
 * Each part's share of `whole`, 0–100 to one decimal, rounded so the shown shares add up to the
 * rounded share of their sum: parts that make up all of `whole` add up to exactly 100.0. Each
 * share is within 0.1 of its true value (largest remainder: floor every share to a tenth, then
 * give the tenths left over to the biggest fractions, the earlier part on a tie).
 */
export const oneDecimalShares = (parts: number[], whole: number): number[] => {
    if (!(whole > 0)) return parts.map(() => 0);
    const exact = parts.map((p) => (Math.max(0, p) / whole) * 1000);
    const tenths = exact.map(Math.floor);
    let left = Math.round(exact.reduce((a, b) => a + b, 0)) - tenths.reduce((a, b) => a + b, 0);
    const order = exact.map((e, i) => ({ i, frac: e - tenths[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const { i } of order) {
        if (left <= 0) break;
        tenths[i] += 1;
        left -= 1;
    }
    return tenths.map((t) => t / 10);
};
