import { groupIndian } from "@/lib/format/money";

/** A count with its noun: "1 day", "3 days", "1,200 transactions", "2 categories". */
export const count = (n: number, singular: string, plural = `${singular}s`): string =>
  `${groupIndian(n)} ${n === 1 ? singular : plural}`;
