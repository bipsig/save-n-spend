// Shared types used by both API and Mobile

export type TransactionType = 'expense' | 'income' | 'transfer' | 'positiveAdjustment' | 'negativeAdjustment'
// 'person' is a receivable: its balance is what that person owes the user (negative when
// the user owes them). It is what a split expense transfers the lent portion into.
export type AccountType = 'bank' | 'credit_card' | 'cash' | 'wallet' | 'person'
export type CategoryKind = 'expense' | 'income'
export type BillStatus = 'pending' | 'paid' | 'overdue'
export type BillFrequency = 'monthly' | 'yearly'

// Days before a bill's due date that its reminder fires. A fixed set, so Settings is
// three chips and the reminder job has three cases.
export type BillReminderLead = 1 | 3 | 7

export interface INotificationPrefs {
  enabled: boolean;          // primary switch — off silences every kind below
  billReminderLead: BillReminderLead;
  budgetAlerts: boolean;     // at 80% of a limit, and again when a category goes over
  goalMilestones: boolean;   // at 25 / 50 / 75 / 100% saved
  /**
   * The three digests, each covering the period that just closed. Separate switches
   * because they differ by two orders of magnitude in how often they arrive — 365 a
   * year against 12. Daily and weekly default off, monthly on; see `wantsNotification`.
   */
  dailySummary: boolean;
  weeklySummary: boolean;
  monthlySummary: boolean;
}

// Account-level preferences: they follow the user across devices, so they live on the
// User document and change through PATCH /users/me. Device-local settings (privacy mode,
// app lock) deliberately are NOT here — they never reach the server.
export interface IUserPrefs {
  defaultAccount?: string | null;  // preselected in Add Transaction and Mark paid
  /**
   * IANA zone name ("Asia/Kolkata") — the answer to every "which day is this in"
   * question the app asks. Stored per account rather than read off the device, so a
   * month means one thing on every screen and in the server's scheduled jobs.
   */
  timeZone: string;
  notifications: INotificationPrefs;
}

export interface IUser {
  _id: string
  name: string
  email: string
  currency: string
  pushToken?: string
  prefs: IUserPrefs
  createdAt?: string
  updatedAt?: string
}

export interface IAccount {
  _id: string
  userId: string
  name: string
  type: AccountType
  balance: number        // paise
  startingBalance: number
  icon?: string
  color?: string
  isArchived: boolean
  // ISO. When the user last reconciled against their bank; absent if never.
  lastSyncedAt?: string | null
  // The user's own position for this account. The list arrives sorted by it, so a client
  // reads the order rather than recomputing it.
  order?: number
  // ISO. Mongoose stamps this on every write, including a transaction's `$inc` to
  // `balance` — so for a person account it doubles as "since when" the current amount
  // owed has stood, with no separate tracking needed.
  updatedAt?: string
}

export interface ICategory {
  _id: string
  userId: string | null  // null = system default
  name: string
  parent: string | null
  kind: CategoryKind
  icon?: string
  color?: string
  isArchived: boolean
  // Position among its siblings only — top-level within a kind, or children under one
  // parent. The list arrives sorted by it.
  order?: number
}

export interface ITransaction {
  _id: string
  userId: string
  type: TransactionType
  amount: number         // paise, always positive
  account: string        // Account._id
  toAccount?: string     // only for transfer
  category: string | null
  title?: string
  note?: string
  location?: string      // UI: where it happened ("Connaught Place")
  receiptUrl?: string    // UI: attached receipt; presence drives the "Receipt" tag
  paymentMode?: 'cash' | 'card' | 'upi' | 'transfer'
  occurredAt: string     // ISO date string on the wire
  // Set on every member of a split: the expense (the user's share) and its sibling
  // transfers (what each person owes). Absent on ordinary transactions.
  splitGroupId?: string | null
  // Set only by an offline-queued create, so the mobile feed can dedupe its synthetic
  // pending row against this same transaction once it lands from the server.
  clientId?: string | null
}

// One title a user has actually typed before, ranked by how often — the raw material for
// the add-transaction form's autosuggest. `category` is the one it was most recently filed
// under, so a client with no category picked yet can offer it as a side effect of picking
// the title, not just the other way round.
export interface ITitleSuggestion {
  title: string
  type: 'expense' | 'income'
  category: string | null
  count: number
  // The most recent transaction filed under this exact title+category — lets a "repeat
  // this" chip prefill without a second round trip to find one.
  lastAmount: number
  lastTransactionId: string
}

export interface IBudget {
  _id: string
  userId: string
  category: string       // Category._id
  month: string          // 'YYYY-MM'
  limit: number          // paise cap for the month (spent is computed, not stored)
}

export interface IBill {
  _id: string
  userId: string
  name: string
  amount: number         // paise
  category: string | null
  account?: string
  dueDate: string        // ISO date string
  status: BillStatus
  lastPaidAt?: string | null
  recurring?: boolean
  frequency?: BillFrequency
  reminderDays?: number
}

export interface IGoal {
  _id: string
  userId: string
  name: string
  target: number         // paise
  saved: number          // paise, clamped at target
  icon?: string
  color?: string
  deadline?: string      // ISO date string
  // Already on the wire (Mongoose timestamps) — named here so a pace/ETA projection
  // (saved ÷ months since this) can be computed client-side without a new endpoint.
  createdAt: string
}

// What happened, not what it looks like: copy is composed on the server, and the type is
// what the client picks an icon and tint from, and what the preference switches gate on.
export type NotificationType =
  | 'billReminder'      // due within the user's chosen lead time
  | 'billOverdue'       // the due date has passed unpaid
  | 'budgetWarning'     // a category crossed 80% of its limit
  | 'budgetExceeded'    // …and then went over it
  | 'goalMilestone'     // 25 / 50 / 75 / 100% saved
  | 'goalDeadline'      // deadline within a week and still short
  | 'dailySummary'      // yesterday's income and spending
  | 'weeklySummary'     // the week that just ended
  | 'monthlySummary'    // the month that just ended, sent on the 1st

/** Where tapping lands. A screen name, not a URL — a stored path would be a route that
 *  has to keep working forever. */
export interface NotificationLink {
  // 'accounts' is local-only — the on-device owed-money nudge is the sole source of it, so
  // the server never writes this value; see rescheduleLocalNotifications.
  screen: 'bills' | 'budget' | 'goals' | 'insights' | 'accounts'
  id?: string
}

export interface INotification {
  _id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  link?: NotificationLink
  /** ISO instant the user opened it, or null while unread. */
  readAt: string | null
  createdAt: string
}

// One request answers both questions the bell asks — list and badge count — so the two
// cannot disagree.
export interface NotificationFeed {
  items: INotification[]
  unread: number
  page: number
  hasNextPage: boolean
}

export interface DashboardSummary {
  month: string,
  income: number,
  expenses: number,
  savings: number,
  netWorth: number,
  /** Current total + up to 3 prior complete-month boundaries, oldest first, floored to
   *  actual history — length 1 (current only) for an account younger than one complete
   *  month. Reconstructed server-side; Account.balance has no stored history to read. */
  netWorthTrend: { label: string; total: number }[],
  /** Same window as `netWorthTrend`, but each month's own income/expense rather than a
   *  cumulative net-worth total — feeds the Income/Expenses/Savings tiles' own sparklines,
   *  the same way netWorthTrend feeds the Net Worth tile's. */
  flowTrend: { label: string; income: number; expense: number }[],
  currentStreak: number,
  /** The current zone-local Monday-start week, not the month above — a tighter
   *  feedback loop than a figure that barely moves day to day. */
  weekIncome: number,
  weekExpense: number,
  /** The single expense that moved this month's total the most. Null on a month
   *  with no expenses at all. */
  biggestExpense: { title: string; amount: number; occurredAt: string } | null,
  /** Present only when the request named a `since` — how much happened between that
   *  moment and now. Absent (not zero) when there's nothing to compare against yet. */
  sinceLastOpened?: { transactions: number; spent: number }
}

// GET /dashboard/insights — the "For You" carousel's genuinely-new slides. Kept off
// DashboardSummary: these are ranked/omit-shaped and chart-series-shaped, not scalars.
export interface GoalWatchSlice {
  goalName: string
  monthsNeeded: number
  projectedDate: string
  saved: number
  target: number
}

export interface WeekdayHeatmapCell {
  /** "Mon".."Sun", Monday-first to match the rest of the app. */
  day: string
  total: number
  /** 0 when nothing was spent that weekday, else its share of the heaviest weekday, 0-1. */
  intensity: number
}

export interface DashboardPacePoint {
  /** "YYYY-MM-DD" where `current`/`average` overlap a real calendar day this month;
   *  "day-N" for an `average` point past the end of a shorter current month. */
  date: string
  amount: number
}

export interface DashboardPace {
  /** This month's expense total, one point per elapsed day. */
  current: DashboardPacePoint[]
  /** The average of the last `monthsAveraged` complete months, per day-of-month —
   *  may run longer than `current` (a finished month's own length), on purpose. */
  average: DashboardPacePoint[]
  monthsAveraged: number
}

export interface DashboardInsights {
  forYou: {
    /** Null when there's no active goal with a real saving rate to project from. */
    goalWatch: GoalWatchSlice | null
    /** Null before day 5 of the month — too little of it has happened yet to mean anything. */
    noSpendDays: number | null
    /** Null before two full weeks of this month's history — one loud Tuesday isn't a pattern. */
    weekdayHeatmap: WeekdayHeatmapCell[] | null
  }
  /** Null for an account younger than one complete month — nothing to average against. */
  pace: DashboardPace | null
}

// The five things the health score is made of. Sent individually, not just as the total:
// a single number says nothing about what to fix. The total is their weighted sum.
export type HealthPillarKey = "savings" | "buffer" | "bills" | "budgets" | "goals"

export type HealthBand = "excellent" | "good" | "fair" | "attention" | "risk"

export interface HealthPillar {
  key: HealthPillarKey
  label: string
  /** 0–100, or null when this pillar does not apply to this user yet. */
  score: number | null
  /** Its share of the total, before renormalising over the applicable ones. */
  weight: number
  /** The measured quantity, already formatted: "18%", "2.4 months", "1 of 4 late". */
  value: string
  /** One or two words for the pillar's state — what the dashboard card shows. */
  verdict: string
  /** What to do about it. Present only when the pillar is scoring below par. */
  hint?: string
}

export interface HealthScore {
  /** 0–100, or null when there is not enough history to say anything honest. */
  score: number | null
  band: HealthBand | "unknown"
  /** Human label for the band: "Excellent", "Needs attention", "Not enough data". */
  rating: string
  /** Trailing days of activity the money figures are measured over. */
  windowDays: number
  pillars: HealthPillar[]
  /** The weakest applicable pillar — the one thing worth fixing first. */
  focus?: { key: HealthPillarKey; label: string; hint: string }
  /** Why there is no score. Present only when `score` is null. */
  reason?: string
  /** Same measurement as the buffer pillar's `value` string, as a raw number — null
   *  exactly when that pillar is null (no spending to measure runway against). */
  runwayMonths: number | null
}

export type InsightsPeriod = "day" | "week" | "month" | "year"

// Bucket keys are zone-local CALENDAR keys, not instants: "2026-08-12" for a day bucket,
// "2026-08" for a month one. An instant would need re-interpreting in the user's zone by
// every reader to know which day it named.
export interface InsightsTrendPoint {
  date: string          // 'YYYY-MM-DD' (week/month) or 'YYYY-MM' (year)
  amount: number        // paise, expenses
}

export interface InsightsSeriesPoint {
  periodStart: string   // 'YYYY-MM-DD' — the unit's first day
  income: number        // paise
  expense: number       // paise
}

export interface InsightsCategorySlice {
  categoryId: string    // parent id (children rolled in)
  name: string
  total: number         // paise, expenses
  /**
   * The sub-categories behind `total`, biggest first, each with its OWN spend — they are
   * already counted in `total`, so summing both levels double-counts. Absent on a slice
   * that is itself a sub-category, and on one whose children had no spend this period.
   *
   * Present so the breakdown can be drilled into without a second request. `total` stays
   * the rolled-up figure it always was, because that is what a budget on this category
   * governs and what the donut has to add up to.
   */
  children?: InsightsCategorySlice[]
}

/** One category's spend this period against the one before — the period-over-period card. */
export interface InsightsCategoryCompare {
  categoryId: string
  name: string
  current: number       // paise, rolled up
  previous: number      // paise, rolled up, same-length window immediately before
}

export interface InsightsAccountSlice {
  accountId: string
  name: string
  total: number         // paise, expenses
}

// One /insights call; all figures exclude transfers. incomeVsExpense is 6 units
// oldest -> newest (last two = current & previous, for the savings-rate delta).
export interface InsightsSummary {
  period: InsightsPeriod
  timeZone: string                 // the zone every bucket below was cut in
  periodStart: string              // ISO — start of the shown window
  periodEnd: string                // ISO — end of the shown window (exclusive)
  /** Dense and ordered: one entry per bucket, zeros included, and a running window
   *  stops at today rather than trailing into the future. */
  trend: InsightsTrendPoint[]
  /**
   * The same buckets over the period immediately before, and NOT stopped early — that one
   * is finished. Bucket i of each is day i (or month i) of its own period, so the two are
   * compared by index rather than by date: a 28-day February lines up against a 31-day
   * January and simply runs out first.
   */
  previousTrend: InsightsTrendPoint[]
  incomeVsExpense: InsightsSeriesPoint[]
  byCategory: InsightsCategorySlice[]
  /** Every category with spend in EITHER window, ordered by the size of the change. */
  categoryCompare: InsightsCategoryCompare[]
  byAccount: InsightsAccountSlice[]
  avgDailySpendCurrent: number     // paise/day
  avgDailySpendPrevious: number    // paise/day, prior period — for the delta
  topCategory: string | null       // biggest category name this period
  txnCount: number                 // non-transfer count, current window
}

/**
 * One category, one window — what the category detail screen is built from.
 *
 * Every figure is rolled up (the category plus its children), matching what its row in the
 * breakdown said and what a budget on it governs. `children` is the split behind that.
 */
export interface InsightsCategoryDetail {
  categoryId: string
  name: string
  /** Set when this category is itself a sub-category. */
  parentName?: string
  period: InsightsPeriod
  timeZone: string
  periodStart: string             // ISO
  periodEnd: string               // ISO, exclusive
  total: number                   // paise
  previousTotal: number           // paise, the window immediately before
  /** Share of all expenses this window, 0–100. */
  shareOfSpend: number
  txnCount: number
  /** Dense and ordered, same bucketing and same early stop as `InsightsSummary.trend`. */
  trend: InsightsTrendPoint[]
  /** Sub-categories with spend this window, biggest first. Empty for a sub-category. */
  children: InsightsCategorySlice[]
}

// Highlights: ranked, plain-language observations computed by rules on the server, arriving
// fully composed. See docs/insights-engine.md.

export type HighlightSeverity = 'urgent' | 'warning' | 'notice' | 'win'

/** Where tapping a card lands — semantic, so the server never knows route paths. */
export type HighlightScreen = 'budgets' | 'bills' | 'goals' | 'health' | 'activity'

export interface IHighlight {
  ruleId: string
  /** Stable per subject-and-month. What the client dismisses by, so hiding one
   *  budget's warning doesn't hide the same rule's verdict about another. */
  key: string
  severity: HighlightSeverity
  /** One line, number included — already formatted server-side, paise nowhere. */
  title: string
  body: string
  /** Paise at stake; the server's ranking signal. Already applied to the order. */
  materiality: number
  screen?: HighlightScreen
}

export interface HighlightsPayload {
  /** Already ranked and capped by the server; render in order. */
  highlights: IHighlight[]
  generatedAt: string   // ISO
  timeZone: string      // the zone every day-count in the copy was cut in
  /** Present instead of highlights while the account is too new to compare against. */
  warmingUp?: string
}

// GET /highlights/history — the permanent record `HighlightsPayload` above never keeps.
// One row per distinct highlight key, written once at first occurrence, never edited or
// removed — not paired with a dismiss action anywhere, by design.
export interface IHighlightLog extends IHighlight {
  createdAt: string // ISO — when this key was first seen, ever
}

export interface HighlightHistoryPage {
  docs: IHighlightLog[]
  page: number
  hasNextPage: boolean
  totalDocs: number
}

// GET /reviews?period=week|month&offset=N — a recap of one CLOSED period, computed on
// demand rather than stored: correct even if a past transaction is later edited.

export type ReviewPeriod = 'week' | 'month'

export interface ReviewMoment {
  date: string        // ISO
  kind: 'win' | 'warn' | 'neutral'
  text: string         // plain language, money already formatted server-side
}

export interface ReviewCategorySlice {
  categoryId: string
  name: string
  total: number        // paise
  pct: number          // 0-100, share of this period's expense
}

/** Only goals with a real logged contribution this period — see GoalContributionLog. */
export interface ReviewGoalContribution {
  goalId: string
  name: string
  contributed: number  // paise
}

export interface ReviewBillSummary {
  paidCount: number
  /** Non-recurring only — a recurring bill's dueDate rolls forward on payment, so a past
   *  occurrence isn't reconstructable from what's stored today. */
  dueCount: number
  /** Non-recurring only, same reason. */
  late: { name: string; daysLate: number }[]
}

export interface ReviewPayload {
  period: ReviewPeriod
  offset: number
  periodLabel: string   // "August 2026" | "Aug 18 – 24"
  periodStart: string    // ISO
  periodEnd: string       // ISO, exclusive
  verdict: { headline: string; detail: string }
  income: number
  expenses: number
  saved: number
  previousIncome: number
  previousExpenses: number
  previousSaved: number
  categories: ReviewCategorySlice[]
  biggestExpense: { title: string; amount: number; occurredAt: string } | null
  /** Dated and sorted; short is expected — only what's real, never padded out. */
  timeline: ReviewMoment[]
  habits: { streakAtEnd: number; activeDays: number; totalDays: number; noSpendDays: number }
  /** Null for a week — no weekly net-worth reconstruction exists, and a week barely
   *  moves it anyway. */
  netWorth: { total: number; previousTotal: number } | null
  goals: ReviewGoalContribution[]
  bills: ReviewBillSummary
}