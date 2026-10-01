/**
 * Merging one dragged section back into the whole account order. Pure and import-free so it
 * can be tested on its own (see accountOrder.test.ts).
 *
 * `order` on the server is a position across the user's whole list, and a reorder request must
 * carry every live account — a partial list leaves the ones it omits colliding with the ones it
 * sets. Manage accounts drags within one section at a time and can have rows folded away, so
 * the sections it isn't touching, and anything hidden, have to be sent too.
 */
export const mergeSectionOrder = (
  /** Every section as shown, top to bottom; `ids` is each one's visible rows in order. */
  sections: { label: string; ids: string[] }[],
  /** The section that was dragged. */
  label: string,
  /** That section's rows in their new order. */
  dragged: string[],
  /** Every live account id, in the order held before the drag. */
  all: string[],
): string[] => {
  // Filtered against the live list: a row archived while this screen was open is still in the
  // rendered sections, and sending a dead id would have the server rank something gone.
  const live = new Set(all);
  const shown = sections
    .flatMap((s) => (s.label === label ? dragged : s.ids))
    .filter((id) => live.has(id));
  // Hidden rows keep their relative order and follow, rather than being dropped.
  const seen = new Set(shown);
  return [...shown, ...all.filter((id) => !seen.has(id))];
};
