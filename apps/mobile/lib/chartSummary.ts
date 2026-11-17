// The one sentence VoiceOver reads for a chart (D20 A): "Spending this month, chart. ₹42,318.40
// so far, highest ₹4,200.00 on 12 Nov." Built from the same figures the screen shows. Money is
// formatted by a function the caller passes, so this file has no formatting rules of its own.
// Pure, so it's tested under node (lib/chartSummary.test.ts).

export type FormatMoney = (paise: number) => string;

type Part = string | null | undefined | false;

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * `title` names the chart ("Spending this month"). `parts` are the facts, joined with commas;
 * empty ones are skipped. With privacy on, the facts are replaced by "Amounts hidden.", since
 * nearly every fact about a money chart is an amount.
 */
export const chartSummary = ({
  title,
  parts,
  masked,
  empty = "Nothing to show yet",
}: {
  title: string;
  parts: readonly Part[];
  masked: boolean;
  empty?: string;
}): string => {
  const facts = parts.filter((p): p is string => !!p);
  const body = masked ? "Amounts hidden" : facts.length ? facts.join(", ") : empty;
  return `${title}, chart. ${capitalise(body).replace(/\.$/, "")}.`;
};

/** Index of the largest (or smallest) value, skipping gaps; the first one wins a tie. */
export const extremeIndex = (values: readonly (number | null | undefined)[], which: "max" | "min"): number | null => {
  let at: number | null = null;
  values.forEach((v, i) => {
    if (v === null || v === undefined || Number.isNaN(v)) return;
    const best = at === null ? null : (values[at] as number);
    if (best === null || (which === "max" ? v > best : v < best)) at = i;
  });
  return at;
};

/**
 * "highest ₹4,200.00 on 12 Nov". Null when there's nothing to name: no values, or (by default)
 * nothing above zero, since "highest ₹0.00" says nothing.
 */
export const peakPhrase = (
  values: readonly (number | null | undefined)[],
  labels: readonly string[],
  format: FormatMoney,
  { which = "max", word = which === "max" ? "highest" : "lowest", preposition = "on", nonZero = true }: {
    which?: "max" | "min";
    word?: string;
    preposition?: string;
    nonZero?: boolean;
  } = {},
): string | null => {
  const i = extremeIndex(values, which);
  if (i === null) return null;
  const v = values[i] as number;
  if (nonZero && v === 0) return null;
  const label = labels[i];
  return label ? `${word} ${format(v)} ${preposition} ${label}` : `${word} ${format(v)}`;
};

/** Spread onto a chart's outer View: VoiceOver reads it as one element with the summary. */
export const chartA11y = (summary: string) => ({ accessible: true, accessibilityLabel: summary });
