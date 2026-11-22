import type { duePhrase as SharedDuePhrase } from "@save-n-spend/types";

/** The app's `duePhrase` (packages/types), for the bell, Highlights and Health: "overdue by 3
 *  days", "due today", "due tomorrow", "due in 3 days". duePhrase.test.ts checks they match. */
export const duePhrase: typeof SharedDuePhrase = (days) => {
    const n = Math.abs(days);
    const unit = n === 1 ? "day" : "days";
    if (days < 0) return `overdue by ${n} ${unit}`;
    if (days === 0) return "due today";
    if (days === 1) return "due tomorrow";
    return `due in ${n} ${unit}`;
};
