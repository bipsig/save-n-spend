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
