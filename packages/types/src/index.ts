// Shared types used by both API and Mobile

export type TransactionType = 'expense' | 'income' | 'transfer'
export type AccountType = 'bank' | 'credit_card' | 'cash' | 'wallet'
export type CategoryKind = 'expense' | 'income'

export interface IUser {
  _id: string
  name: string
  email: string
  currency: string
  pushToken?: string
  prefs: {
    darkMode: boolean
    notifications: boolean
    defaultAccount?: string
  }
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
  paymentMode?: 'cash' | 'card' | 'upi' | 'transfer'
  occurredAt: string     // ISO date string on the wire
}