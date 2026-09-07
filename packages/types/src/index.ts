// Shared types used by both API and Mobile

export type TransactionType = 'expense' | 'income' | 'transfer' | 'positiveAdjustment' | 'negativeAdjustment'
export type AccountType = 'bank' | 'credit_card' | 'cash' | 'wallet'
export type CategoryKind = 'expense' | 'income'
export type BillStatus = 'pending' | 'paid' | 'overdue'
export type BillFrequency = 'monthly' | 'yearly'

// How many days before a bill's due date its reminder fires. A fixed set rather
// than a free number, so the Settings sheet is three chips and the reminder job
// has three cases to schedule.
export type BillReminderLead = 1 | 3 | 7

export interface INotificationPrefs {
  enabled: boolean;          // master switch — off silences every kind below
  billReminderLead: BillReminderLead;
  budgetAlerts: boolean;     // at 80% of a limit, and again when a category goes over
  goalMilestones: boolean;   // at 25 / 50 / 75 / 100% saved
  weeklySummary: boolean;
}

// Account-level preferences: they follow the user across devices, so they live
// on the User document and change through PATCH /users/me.
// Device-local settings (privacy mode, app lock) deliberately are NOT here —
// they describe one phone, not one account, and never reach the server.
export interface IUserPrefs {
  defaultAccount?: string | null;  // preselected in Add Transaction and Mark paid
  /**
   * IANA zone name ("Asia/Kolkata"), and the answer to every "which day is this
   * in" question the app asks — day groups, budget months, overdue bills, daily
   * averages, and the hour a reminder fires. Stored per account rather than read
   * off the device so a month means one thing on every screen, on every device,
   * and in the server's own scheduled jobs.
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
  // ISO string. When the user last reconciled this account against their bank.
  // Absent on accounts that have never been synced.
  lastSyncedAt?: string | null
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
}

// ---- Notifications ---------------------------------------------------------

// What happened, not what it looks like. The copy is composed on the server (it has
// the amounts and the zone), and the type is what the client uses to pick an icon and
// a tint, and what the preference switches gate on.
export type NotificationType =
  | 'billReminder'      // due within the user's chosen lead time
  | 'billOverdue'       // the due date has passed unpaid
  | 'budgetWarning'     // a category crossed 80% of its limit
  | 'budgetExceeded'    // …and then went over it
  | 'goalMilestone'     // 25 / 50 / 75 / 100% saved
  | 'goalDeadline'      // deadline within a week and still short
  | 'weeklySummary'

/**
 * Where tapping the notification lands. A screen name plus the id of the thing it is
 * about, rather than a URL — the client owns its own routes, and a stored path would
 * be a route that has to keep working forever.
 */
export interface NotificationLink {
  screen: 'bills' | 'budget' | 'goals' | 'insights'
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

// One request answers both questions the bell asks: what is in the list, and how many
// dots to show. Splitting them would mean the badge and the list could disagree.
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
  netWorth: number
}

// The five things the health score is made of. Returned individually rather than
// rolled into the total on the server's side of the wire, because a single number
// tells a user they are a 62 and nothing about what to do next — the pillars are
// the actionable part, and the total is just their weighted sum.
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
}

export type InsightsPeriod = "week" | "month" | "year"

// Bucket keys are zone-local CALENDAR keys, not instants: "2026-08-12" for a day
// bucket, "2026-08" for a month one. An instant would have to be re-interpreted in
// the user's zone by every reader to know which day it named — and the client and
// the server disagreeing about that is the whole bug this format exists to close.
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
}

export interface InsightsAccountSlice {
  accountId: string
  name: string
  total: number         // paise, expenses
}

// One /insights call; all figures exclude transfers. Rollups + KPIs are
// server-computed so the client renders with minimal processing. incomeVsExpense
// is 6 units oldest -> newest (last two = current & previous, for savings-rate delta).
export interface InsightsSummary {
  period: InsightsPeriod
  timeZone: string                 // the zone every bucket below was cut in
  periodStart: string              // ISO — start of the shown window
  periodEnd: string                // ISO — end of the shown window (exclusive)
  /**
   * Dense and ordered: one entry per bucket in the window, zeros included, and a
   * running window stops at today rather than trailing into the future. Filled in
   * by the server because only the server knows the zone the buckets were cut in.
   */
  trend: InsightsTrendPoint[]
  incomeVsExpense: InsightsSeriesPoint[]
  byCategory: InsightsCategorySlice[]
  byAccount: InsightsAccountSlice[]
  avgDailySpendCurrent: number     // paise/day
  avgDailySpendPrevious: number    // paise/day, prior period — for the delta
  topCategory: string | null       // biggest category name this period
  txnCount: number                 // non-transfer count, current window
}

// --- Highlights (the deterministic assistant — docs/insights-engine.md) -----------
// Ranked, plain-language observations computed by rules on the server. Read-only by
// construction: nothing on this path can write, so the copy arrives fully composed
// and the client's whole job is to render and route it.

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