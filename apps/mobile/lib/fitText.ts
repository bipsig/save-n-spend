// Will a figure fit a slot? Estimated from per-character widths of SF Pro at weight 700-800,
// in ems, each rounded up, so the estimate errs wide: a tile reflows a little early rather than
// cutting off a digit. Pure, so it's tested under node (lib/fitText.test.ts).

const EM: Record<string, number> = {
  "₹": 0.62, "+": 0.62, "−": 0.62, "-": 0.4,
  ",": 0.3, ".": 0.3, " ": 0.28, "%": 0.9, "•": 0.42,
};
const DIGIT_EM = 0.62;
const UPPER_EM = 0.72;
const OTHER_EM = 0.6;

const charEm = (c: string): number =>
  EM[c] ?? (c >= "0" && c <= "9" ? DIGIT_EM : c >= "A" && c <= "Z" ? UPPER_EM : OTHER_EM);

/** Estimated width in points of one line of `text`. */
export const textWidth = (text: string, fontSize: number, letterSpacing = 0): number => {
  const chars = Array.from(text);
  return chars.reduce((w, c) => w + charEm(c) * fontSize, 0) + letterSpacing * chars.length;
};

/**
 * Font size for one line whose width at `base` is `naturalWidth`, in a box `boxWidth` wide:
 * `base` when it fits, else just small enough to fit, never below `base * minScale` (the caller
 * then truncates). Rounded down to half a point so a fitting line isn't cut. Widths come from
 * a real text measurement (onTextLayout); 0 means "not measured yet" and keeps `base`.
 */
export const fitFontSize = (naturalWidth: number, boxWidth: number, base: number, minScale: number): number => {
  if (naturalWidth <= 0 || boxWidth <= 0 || naturalWidth <= boxWidth) return base;
  const fit = Math.floor(((base * boxWidth) / naturalWidth) * 2) / 2;
  return Math.max(base * minScale, fit);
};

type ColumnsOptions = {
  /** Space between tiles. */
  gap: number;
  /** Padding inside each tile, one side. */
  padding: number;
  /** The smallest size the figure may shrink to. */
  fontSize: number;
  letterSpacing?: number;
};

/**
 * How many tiles across a row of `rowWidth` can take so every figure fits on one line at its
 * smallest size. Starts at one per figure and drops a column at a time; a row not measured yet
 * (width 0) keeps them all across.
 */
export const statColumns = (figures: readonly string[], rowWidth: number, o: ColumnsOptions): number => {
  const n = Math.max(1, figures.length);
  if (rowWidth <= 0) return n;
  const widest = Math.max(0, ...figures.map((f) => textWidth(f, o.fontSize, o.letterSpacing)));
  for (let cols = n; cols > 1; cols--) {
    const inner = (rowWidth - o.gap * (cols - 1)) / cols - 2 * o.padding;
    if (widest <= inner) return cols;
  }
  return 1;
};

/** Splits items into rows of `cols`; the last row may be shorter (its tiles then grow to fill). */
export const toRows = <T>(items: readonly T[], cols: number): T[][] => {
  const per = Math.max(1, cols);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += per) rows.push(items.slice(i, i + per));
  return rows;
};

/**
 * Left edge of a tooltip centred on `anchorX`, kept inside the chart. `rightInset` keeps it off
 * a y-axis drawn on the right.
 */
export const tooltipLeft = (anchorX: number, chartWidth: number, tipWidth: number, rightInset = 0): number => {
  const max = Math.max(0, chartWidth - rightInset - tipWidth);
  return Math.min(Math.max(anchorX - tipWidth / 2, 0), max);
};
