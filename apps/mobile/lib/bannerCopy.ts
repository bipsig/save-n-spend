import { formatMoneyExact } from "@/lib/money";

// The words of every local banner, kept apart from the scheduling in lib/localNotifications.ts
// so each one can be checked under node with privacy mode on and off (bannerCopy.test.ts).
// The unmasked copy is word for word the API's jobs/reminderJob.ts.

/**
 * A banner before privacy mode is applied. The title never carries an amount, so it is the
 * same either way; only the body changes.
 */
export type Notice = {
  title: string;
  body: string;
  /** The body with every amount left out, or null when nothing worth saying is left. A null
   *  makes the banner title-only rather than padding it with a fixed second line. */
  privateBody: string | null;
};

export type BannerContent = { title: string; body?: string };

/** The one way a banner's text is built, so a new kind can't forget privacy mode: iOS holds
 *  the text from scheduling until it fires, and nothing can re-mask it once handed over. */
export const compose = (notice: Notice, { masked }: { masked: boolean }): BannerContent => {
  const body = masked ? notice.privateBody : notice.body;
  return body ? { title: notice.title, body } : { title: notice.title };
};

export const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The server's `flowLine`, minus the transaction count: /transactions/summary returns totals
 *  only, and a figure invented here could disagree with the feed entry. `expenses` holds each
 *  closed trip as one expense (trips=entries). */
export const flowLine = (income: number, expenses: number): string => {
  const net = income - expenses;
  return `Spent ${formatMoneyExact(expenses)}, earned ${formatMoneyExact(income)}`
    + (net >= 0
      ? ` — ${formatMoneyExact(net)} put aside.`
      : ` — ${formatMoneyExact(-net)} more than you earned.`);
};

/** The stale person-balance line the daily digest carries. `balance` is paise, positive when
 *  they owe you. */
export const owedLine = (name: string, balance: number, since: string): string =>
  balance > 0
    ? `${name} has owed you ${formatMoneyExact(balance)} since ${since}`
    : `You've owed ${name} ${formatMoneyExact(-balance)} since ${since}`;

/** /transactions/summary over the period. */
type Flow = { income: number; expenses: number };

/** Null when the day had neither flow nor a nudge, the commonest day there is. */
export const dailyNotice = (day: string, flow: Flow | null, nudge: string | null): Notice | null => {
  if (!flow && !nudge) return null;
  return {
    title: `${day} in review`,
    body: [flow ? flowLine(flow.income, flow.expenses) : null, nudge].filter(Boolean).join(" · "),
    privateBody: "Your daily summary is ready.",
  };
};

export const weeklyNotice = (from: string, to: string, flow: Flow): Notice => ({
  title: `${from}–${to} in review`,
  body: flowLine(flow.income, flow.expenses),
  privateBody: "Your weekly summary is ready.",
});

export const monthlyNotice = (month: string, flow: Flow): Notice => ({
  title: `${month} in review`,
  body: flowLine(flow.income, flow.expenses),
  privateBody: "Your monthly summary is ready.",
});

export type BillWhen = "overdue" | "today" | "due";

/**
 * The reminder job's three-way bill branch. A SIP bill funds an investment, so it reads as
 * investing rather than paying. With privacy on, every bill keeps its date or its days late;
 * a SIP due today keeps "To invest today." though the title says so, so all three SIP
 * banners read alike.
 */
export const billNotice = (
  { name, amount, sip, days, lead, on }: {
    name: string;
    /** Paise. */
    amount: number;
    sip: boolean;
    /** Zone-local days until due; negative is overdue. */
    days: number;
    lead: number;
    /** "18 Nov", the due date's label. */
    on: string;
  },
): (Notice & { when: BillWhen }) | null => {
  const money = formatMoneyExact(amount);
  if (days < 0) {
    const ago = plural(-days, "day");
    return sip
      ? { when: "overdue", title: `${name} — SIP overdue`, body: `${money} was due to invest ${ago} ago.`, privateBody: `Was due to invest ${ago} ago.` }
      : { when: "overdue", title: `${name} is overdue`, body: `${money} was due ${ago} ago.`, privateBody: `Was due ${ago} ago.` };
  }
  if (days === 0) {
    return sip
      ? { when: "today", title: `Time to invest — ${name}`, body: `${money} to invest today.`, privateBody: "To invest today." }
      : { when: "today", title: `${name} is due today`, body: `${money} due today.`, privateBody: null };
  }
  if (days > lead) return null;
  const inDays = plural(days, "day");
  return sip
    ? { when: "due", title: `${name} · invest in ${inDays}`, body: `${money} to invest on ${on}.`, privateBody: `To invest on ${on}.` }
    : { when: "due", title: `${name} due in ${inDays}`, body: `${money} due on ${on}.`, privateBody: `Due on ${on}.` };
};

/** `remaining` is paise. */
export const goalDeadlineNotice = (name: string, days: number, remaining: number): Notice => ({
  title: days === 0 ? `${name} is due today` : `${name} is due in ${plural(days, "day")}`,
  body: `${formatMoneyExact(remaining)} still to go.`,
  privateBody: null,
});

/** `saved` and `target` are paise. The percentage stays in the title: it says how far along,
 *  not how much. */
export const goalMilestoneNotice = (name: string, milestone: number, saved: number, target: number): Notice => ({
  title: milestone === 100 ? `${name} is fully funded` : `${name} hit ${milestone}%`,
  body: `${formatMoneyExact(saved)} of ${formatMoneyExact(target)} saved.`,
  privateBody: null,
});

/** No amounts, so privacy mode leaves it as it is. */
export const investmentNotice = (holdings: number): Notice => {
  const body = `Update what your ${plural(holdings, "investment")} ${holdings === 1 ? "is" : "are"} worth today to keep your net worth accurate.`;
  return { title: "Time to update your investments", body, privateBody: body };
};

/** No amounts, so privacy mode leaves it as it is. */
export const recurringNotice = (titles: string[]): Notice => {
  const one = titles.length === 1;
  const body = `Turn ${one ? "it" : "them"} into ${one ? "a bill" : "bills"} to get reminded before ${one ? "it's" : "they're"} due.`;
  return {
    title: one ? `${titles[0]} looks like a monthly payment` : `${plural(titles.length, "payment")} look like they repeat`,
    body,
    privateBody: body,
  };
};
