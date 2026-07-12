// Shared types used by both API and Mobile

export type TransactionType = 'expense' | 'income' | 'transfer'
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
