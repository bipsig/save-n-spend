import { partsInZone } from "./timezone";

// Month names for text the server writes (notifications, chart labels, Review). One table, the
// app's own (apps/mobile/lib/format/date.ts): `en-IN` Intl prints "Sept", the app prints "Sep".

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Sep", in `zone`. */
export const shortMonth = (instant: Date, zone: string): string => MONTHS[partsInZone(instant, zone).month - 1];

/** "11 Sep", in `zone`. */
export const shortDay = (instant: Date, zone: string): string => {
    const { day, month } = partsInZone(instant, zone);
    return `${day} ${MONTHS[month - 1]}`;
};

/** "Sep 2026", in `zone`. */
export const shortMonthYear = (instant: Date, zone: string): string => {
    const { year, month } = partsInZone(instant, zone);
    return `${MONTHS[month - 1]} ${year}`;
};
