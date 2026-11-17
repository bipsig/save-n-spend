import { capitalise, formatInstant } from "@/lib/format/date";

// Activity's group headers in sentence case: `Caps` draws the capitals, so VoiceOver reads
// "Tue, 1 Sep" as words rather than spelling "SEP".

/** "Today", "Yesterday", else "Tue, 1 Sep" (the year added when it isn't this year). */
export const dayHeaderLabel = (iso: string, zone?: string): string => {
  const near = formatInstant(iso, "relativeDay", zone);
  return near === "today" || near === "yesterday" ? capitalise(near) : formatInstant(iso, "weekday", zone);
};

/** "August 2026", for the break between months in a list that spans several. */
export const monthHeaderLabel = (iso: string, zone?: string): string => formatInstant(iso, "monthLong", zone);
