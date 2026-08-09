// Shared types used by both API and Mobile

export type TransactionType = 'expense' | 'income' | 'transfer' | 'positiveAdjustment' | 'negativeAdjustment'
export type AccountType = 'bank' | 'credit_card' | 'cash' | 'wallet'
export type CategoryKind = 'expense' | 'income'
export type BillStatus = 'pending' | 'paid' | 'overdue'
export type BillFrequency = 'monthly' | 'yearly'

export interface IUser {
  _id: string
  name: string
  email: string
  currency: string
  pushToken?: string
  prefs: {
    defaultAccount?: string;
    budgetCycleDay: number;
    notifications: {
      enabled: boolean;
      billReminderLead: number;
      budgetAlerts: boolean;
      goalMilestones: boolean;
      weeklySummary: boolean;
    }
  };
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

export interface DashboardSummary {
  month: string,
  income: number,
  expenses: number,
  savings: number,
  netWorth: number
}

export type InsightsPeriod = "week" | "month" | "year"

export interface InsightsTrendPoint {
  date: string          // ISO — bucket start (day for week/month, month for year)
  amount: number        // paise, expenses
}

export interface InsightsSeriesPoint {
  periodStart: string   // ISO — unit start
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
  periodStart: string              // ISO — start of the shown window
  periodEnd: string                // ISO — end of the shown window (exclusive)
  trend: InsightsTrendPoint[]
  incomeVsExpense: InsightsSeriesPoint[]
  byCategory: InsightsCategorySlice[]
  byAccount: InsightsAccountSlice[]
  avgDailySpendCurrent: number     // paise/day
  avgDailySpendPrevious: number    // paise/day, prior period — for the delta
  topCategory: string | null       // biggest category name this period
  txnCount: number                 // non-transfer count, current window
}