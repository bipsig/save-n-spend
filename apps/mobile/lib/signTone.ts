// The colour of a net, change or difference, decided by its sign. Pure, so it's tested under
// node (lib/signTone.test.ts).

/**
 * Above zero is the income colour, below zero the expense colour, zero is `neutral`.
 * `goodWhen: "down"` is for spending, where a rise is bad news and takes the expense colour.
 * Pass the figure as it is shown (rounded, for a percentage), so "0%" is never coloured.
 */
export type SignToneColor = "success" | "danger" | "inkDim" | "ink";

export const signTone = (
  value: number,
  { goodWhen = "up", neutral = "inkDim" }: { goodWhen?: "up" | "down"; neutral?: "inkDim" | "ink" } = {},
): SignToneColor => {
  if (value === 0 || Number.isNaN(value)) return neutral;
  return (value > 0) === (goodWhen === "up") ? "success" : "danger";
};

/** The soft background that goes with a tone, for a pill. */
export const toneSoft = (tone: string): "successSoft" | "dangerSoft" | "surface2" =>
  tone === "success" ? "successSoft" : tone === "danger" ? "dangerSoft" : "surface2";

/**
 * A colour chosen for what a figure IS (spent is red, earned is green) still goes neutral at
 * zero: "₹0.00" in red reads as a warning. Gets the figure in paise; `undefined` means "use the
 * default colour".
 */
export const zeroNeutral = <T extends string>(paise: number, tone: T | undefined): T | undefined =>
  Math.round(paise) === 0 && (tone === "success" || tone === "danger" || tone === "warning") ? undefined : tone;
