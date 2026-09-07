// The Get started checklist — what a new account still has to do before the app
// has anything to show it.
//
// Every step's `done` is DERIVED from data the app already loads, never stored.
// That is the whole design: a persisted "step 3 complete" flag can disagree with
// reality (delete your only budget and the checklist would still congratulate you),
// it does not survive a reinstall, and it needs a migration the first time the list
// changes. Derivation cannot drift, costs no storage, and makes the checklist
// self-correcting — undo the thing and the tick comes back off.
//
// The one exception is dismissal, which is a preference and lives in
// `store/settings` (`getStartedDismissed`), because nothing on the server records
// "I looked at this and I don't want it".
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
  /** Where the tap goes. A step the user cannot act on from here would be a dead tick. */
  route: '/add-transaction' | '/manage-accounts' | '/budget' | '/bills' | '/goals'
  done: boolean
}

/**
 * Four of the five steps ask nothing more than "has the user made one of these yet?",
 * so they are typed by the only thing read off them — the count. That is not laziness:
 * `useBudgets` hands back a `BudgetSummary`, not an `IBudget`, and pinning this
 * signature to four DTO shapes would make the checklist break every time one of them
 * gained a field it does not care about.
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
 * The "add a real account" step.
 *
 * Registration already creates one — "Cash", at zero — so a bare `accounts.length > 0`
 * would be true for everybody and would tick itself on day one. What matters is whether
 * the user has told the app about money it did not invent.
 *
 * The step deliberately asks for a NEW account rather than for an opening balance on the
 * seeded one, because `startingBalance` is settable only at creation: `updateAccountSchema`
 * on the API is `.strict()` and has no such field, since it is a term the running balance
 * is built from and restating it would restate every total after it. The balance itself
 * CAN be corrected later — `PATCH /accounts/:id/balance` records the difference as an
 * adjustment — but that is a different write, and it is not what this step is asking for.
 *
 * Two clauses, not one: a second live account is the normal path, and the
 * `startingBalance` check covers the user who added their bank and then archived Cash,
 * leaving one account that is nonetheless theirs.
 *
 * Archived accounts are excluded for the same reason they are hidden everywhere else —
 * an account the user has retired should not answer a question about how the app is set
 * up today.
 */
const hasRealAccount = (accounts: IAccount[]): boolean => {
  const live = accounts.filter((a) => !a.isArchived);
  return live.length > 1 || live.some((a) => a.startingBalance !== 0);
};

/**
 * Build the checklist. Ordered by what unlocks the most: a transaction is what makes
 * every other screen non-empty, so it goes first; goals are the least urgent and the
 * most personal, so they go last.
 *
 * Pure, so the ordering and the copy are testable without a database.
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
