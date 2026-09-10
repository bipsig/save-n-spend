// The Get started checklist — what a new account still has to do before the app has
// anything to show it.
//
// Every step's `done` is DERIVED from data the app already loads, never stored: a
// persisted flag can disagree with reality (delete your only budget and it would still
// congratulate you), and derivation is self-correcting. The one exception is dismissal,
// a preference in `store/settings` (`getStartedDismissed`).
import type { IAccount } from '@save-n-spend/types';
import type { IconName } from '@/lib/icons';
import type { ChipTint } from '@/theme';

export interface OnboardingStep {
  key: 'transaction' | 'account' | 'budget' | 'bill' | 'goal';
  /** Imperative and specific — "Add your first transaction", not "Transactions". */
  label: string
  /** Why it is worth doing, in the user's terms. Shown only for the next open step. */
  hint: string
  icon: IconName
  tint: ChipTint
  route: '/add-transaction' | '/manage-accounts' | '/budget' | '/bills' | '/goals'
  done: boolean
}

/**
 * Four of the five steps only ask "has the user made one of these yet?", so they are typed
 * by the count alone — the hooks hand back differing DTO shapes (`BudgetSummary`, not
 * `IBudget`), and pinning this signature to them would break on every added field.
 */
interface Inputs {
  transactions: readonly unknown[]
  budgets: readonly unknown[]
  bills: readonly unknown[]
  goals: readonly unknown[]
  /** The one list read in detail — see `balanceIsSet`. */
  accounts: IAccount[]
}

/**
 * The "add a real account" step. Registration already creates "Cash" at zero, so
 * `accounts.length > 0` would tick itself on day one; what counts is money the app did not
 * invent. It asks for a NEW account because `startingBalance` is settable only at creation.
 *
 * Two clauses: a second live account is the normal path, and the `startingBalance` check covers
 * the user who added their bank and then archived Cash.
 */
const hasRealAccount = (accounts: IAccount[]): boolean => {
  const live = accounts.filter((a) => !a.isArchived);
  return live.length > 1 || live.some((a) => a.startingBalance !== 0);
};

/**
 * Build the checklist, ordered by what unlocks the most: a transaction makes every other
 * screen non-empty, so it goes first; goals are the least urgent, so they go last.
 */
export const buildSteps = ({ transactions, accounts, budgets, bills, goals }: Inputs): OnboardingStep[] => [
  {
    key: 'transaction',
    label: 'Add your first transaction',
    hint: 'One entry is all it takes — the dashboard, trends and health score all read from these.',
    icon: 'add',
    tint: 'violet',
    route: '/add-transaction',
    done: transactions.length > 0,
  },
  {
    key: 'account',
    label: 'Add your bank account',
    hint: 'Set its balance as you add it. Net worth is guesswork until you do — and you can square it against your bank any time after.',
    icon: 'bank',
    tint: 'blue',
    route: '/manage-accounts',
    done: hasRealAccount(accounts),
  },
  {
    key: 'budget',
    label: 'Create a budget',
    hint: 'Cap one category you tend to overspend. You get a nudge before you blow past it, not after.',
    icon: 'insights',
    tint: 'teal',
    route: '/budget',
    done: budgets.length > 0,
  },
  {
    key: 'bill',
    label: 'Add a recurring bill',
    hint: 'Rent, phone, subscriptions — added once, and the app reminds you before each due date.',
    icon: 'bills',
    tint: 'amber',
    route: '/bills',
    done: bills.length > 0,
  },
  {
    key: 'goal',
    label: 'Set a savings goal',
    hint: 'Name what you are saving for and watch it fill up. This is the fun one.',
    icon: 'savings',
    tint: 'green',
    route: '/goals',
    done: goals.length > 0,
  },
];

export interface OnboardingProgress {
  steps: OnboardingStep[]
  completed: number
  total: number
  percent: number
  /** The first step still open — the one the checklist expands and explains. */
  next: OnboardingStep | undefined
  /** Every step done. The card retires itself rather than waiting to be dismissed. */
  allDone: boolean
}

export const progressOf = (steps: OnboardingStep[]): OnboardingProgress => {
  const completed = steps.filter((s) => s.done).length;
  return {
    steps,
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
    next: steps.find((s) => !s.done),
    allDone: completed === steps.length,
  };
};
