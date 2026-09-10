import { monthBoundsInZone, monthLabelInZone } from "./timezone";

/**
 * The bounds and `YYYY-MM` key of a budget month, cut in the user's zone.
 *
 * `start`/`next` are absolute instants for a `$gte`/`$lt` on `occurredAt`; `label` is what a
 * Budget document stores its month as. All three come from one place, so a budget's limit and
 * its spend can never be looking at different months.
 *
 * With no `month`, the month containing right now WHERE THE USER IS — on the 1st in Delhi, a
 * different answer than UTC gives for another five and a half hours.
 */
export const monthRange = (
  zone: string,
  month?: string,
): { start: Date; next: Date; label: string } => {
  const label = month ?? monthLabelInZone(new Date(), zone);
  const { start, next } = monthBoundsInZone(label, zone);

  return { start, next, label };
}
