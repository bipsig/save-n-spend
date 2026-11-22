// The one month table (gaps row 59: "Sep", never `Intl`'s "Sept"). No imports, so pure files
// that run under node:test (lib/whatsNew.ts) can share it. The API has the same table in
// apps/api/src/utils/dateLabel.ts.

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "11 Sep" from a calendar date's UTC fields, never with a year: the label the server's
 *  reminders use. */
export const shortDay = (calendar: Date): string => `${calendar.getUTCDate()} ${MONTHS[calendar.getUTCMonth()]}`;
