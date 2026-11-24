// Home's "Since you last opened" card, as words. Pure, so it's tested under node
// (sinceLastOpened.test.ts); the card draws it.

export type SinceCopy = {
  title: string;
  /** "Today", "Yesterday", … on the right of the title; null when the title says it all. */
  when: string | null;
  /** The second line; null when there is none. */
  body: string | null;
  label: string;
};

/** `when` is relativeTime's day style; `summary` is "3 transactions · ₹1,860.00 spent". */
export const sinceCopy = (when: string, transactions: number, summary: string): SinceCopy => {
  if (transactions === 0 && when === "Today") {
    // "Since today · Nothing logged since then" says the same thing twice.
    const title = "Nothing new since you last opened";
    return { title, when: null, body: null, label: `${title}. Opens Activity.` };
  }
  const body = transactions === 0 ? "Nothing logged since then" : summary;
  return { title: "Since you last opened", when, body, label: `Since you last opened, ${when}: ${body}. Opens Activity.` };
};
