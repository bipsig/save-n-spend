// The line above the name in the header. Derived from the calendar only, never from balances
// or spending, so it can't be a stale judgement about someone's money. The variant is picked
// by a date-derived seed, not `Math.random()`: the dashboard re-renders on peek, and a random
// pick would visibly flicker.
export type GreetingSlot = "morning" | "afternoon" | "evening" | "night";

/** Which part of the day it is, on the DEVICE clock — not `prefs.timeZone`, which exists so
 *  the server can time a push to a phone it cannot see. */
export const slotFor = (hour: number): GreetingSlot => {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
};

/**
 * Days that land on the same date every year, keyed `MM-DD`. Which days appear is editorial —
 * add or remove a line freely.
 *
 * The four solar entries (Lohri, Makar Sankranti, Baisakhi, Poila Boishakh) track the sun, and
 * the leap day absorbs the drift: Makar Sankranti is 14 January in a common year and the 15th
 * in a leap year, Lohri the night before either way, Poila Boishakh inverted — 15 April
 * normally, the 14th in a leap year. These are the common-year dates, so 2028 needs an
 * override in `MOVING_DAYS`, which `greetingFor` reads first.
 */
const FIXED_DAYS: Record<string, string> = {
  "01-01": "Happy New Year",
  "01-13": "Happy Lohri",
  "01-14": "Makar Sankranti",
  "01-26": "Republic Day",
  "02-14": "Happy Valentine's",
  "02-29": "Leap day",
  "04-14": "Happy Baisakhi",
  "04-15": "Shubho Noboborsho",
  "08-15": "Independence Day",
  "10-02": "Gandhi Jayanti",
  "10-31": "Happy Halloween",
  "11-14": "Children's Day",
  "12-25": "Merry Christmas",
  "12-31": "Last day of the year",
};

/**
 * Lunar festivals, keyed by exact `YYYY-MM-DD`. No formula to derive these from, so the table
 * has an expiry date — extend it a year at a time. Running out is not a failure mode: an
 * unknown date falls through to the ordinary greetings.
 *
 * Where a festival splits regionally these follow the Bengali reckoning, so Nabami and Dashami
 * sit a day later than in Bihar. Shashthi and Dhanteras are derived by fixed offset, no source
 * listing them; sources disagree by a day on Dussehra 2027, and the 9th is what leaves the
 * sequence consecutive.
 */
const MOVING_DAYS: Record<string, string> = {
  // A line per Durga Puja day, since the days have names people use; Dashami doubles as
  // Dussehra. All five hang off Shashthi, so if that is wrong they all are.

  // --- 2026 ---
  "2026-03-03": "Happy Holi",

  "2026-10-17": "Shubho Shashthi",
  "2026-10-18": "Shubho Saptami",
  "2026-10-19": "Shubho Ashtami",
  "2026-10-20": "Shubho Nabami",
  "2026-10-21": "Happy Dussehra",

  "2026-11-06": "Happy Dhanteras",
  "2026-11-08": "Happy Diwali",

  // --- 2027 ---
  "2027-03-22": "Happy Holi",

  // Durga Puja falls early this year, putting Dussehra and Diwali in the same month twenty
  // days apart. It reads like a mistyped month and is not one.
  "2027-10-05": "Shubho Shashthi",
  "2027-10-06": "Shubho Saptami",
  "2027-10-07": "Shubho Ashtami",
  "2027-10-08": "Shubho Nabami",
  "2027-10-09": "Happy Dussehra",

  "2027-10-27": "Happy Dhanteras",
  "2027-10-29": "Happy Diwali",
};

const two = (n: number): string => String(n).padStart(2, "0");

/** Changes once a day and never repeats within a year. */
const daySeed = (date: Date): number =>
  date.getFullYear() * 372 + date.getMonth() * 31 + date.getDate();

/** Rotates through the options as the days pass, instead of picking at random. */
const pick = (options: string[], seed: number): string =>
  options[seed % options.length] ?? options[0]!;

// Kept short: this renders at `size="xs"`, and much past twenty characters starts to wrap.
const TIME_LINES: Record<GreetingSlot, string[]> = {
  morning: ["Good morning", "Morning", "A fresh day"],
  afternoon: ["Good afternoon", "Afternoon", "Midday"],
  evening: ["Good evening", "Evening", "Winding down"],
  // No "Good night" — the app is open, so they are not going to bed.
  night: ["Still up?", "Late one", "Quiet hours"],
};

// Only the days with a character worth naming; there is nothing true and interesting to say
// about a Wednesday.
const WEEKDAY_LINES: Record<number, string[]> = {
  0: ["Sunday slow", "Weekend still"],
  1: ["New week", "Monday reset"],
  5: ["Friday at last", "Nearly the weekend"],
  6: ["Weekend", "Saturday"],
};

// The 1st, treated as payday. The app has no idea whether this user is salaried, so the lines
// stay on the certainly-true part — a new month — not money that may not have arrived.
const PAYDAY_LINES = ["New month", "Fresh budgets", "Month one"];

/** The last three days, when the month's numbers are nearly final. */
const MONTH_END_LINES = ["Month's nearly up", "Closing the month"];

/** Pure and takes `now`, so it can be checked at any date without waiting for one. */
export const greetingFor = (now: Date = new Date()): string => {
  const monthDay = `${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const fullDate = `${now.getFullYear()}-${monthDay}`;

  // Festivals win outright rather than joining the pool below.
  const festival = MOVING_DAYS[fullDate] ?? FIXED_DAYS[monthDay];
  if (festival) return festival;

  const seed = daySeed(now);
  const slot = slotFor(now.getHours());

  // One pool rather than a priority ladder, which would mean Monday never says good morning.
  // Each layer's line count is its weight, so a plain day leans towards the clock.
  const candidates = [...TIME_LINES[slot]];

  const weekday = WEEKDAY_LINES[now.getDay()];
  if (weekday) candidates.push(...weekday);

  if (now.getDate() === 1) candidates.push(...PAYDAY_LINES);

  // Day `0` rolls back to the last day of the previous month.
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (now.getDate() > daysInMonth - 3) candidates.push(...MONTH_END_LINES);

  return pick(candidates, seed);
};

export default greetingFor;
