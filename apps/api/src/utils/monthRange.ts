import { monthBoundsInZone, monthLabelInZone } from "./timezone";

/**
 * The bounds and `YYYY-MM` key of a budget month, cut in the user's zone.
 *
 * `start`/`next` are absolute instants for a `$gte`/`$lt` on `occurredAt`; `label`
 * is what a Budget document stores its month as. All three come from one place so
 * a budget's limit and its spend can never be looking at different months — which
 * is what happened while the label came from the zone and the bounds from UTC.
 *
 * With no `month`, the month that contains right now WHERE THE USER IS. On the 1st
 * of the month in Delhi that is a different answer than UTC gives for another five
 * and a half hours.
 */
export const monthRange = (
  zone: string,
  month?: string,
): { start: Date; next: Date; label: string } => {
  const label = month ?? monthLabelInZone(new Date(), zone);
  const { start, next } = monthBoundsInZone(label, zone);

  return { start, next, label };
}
