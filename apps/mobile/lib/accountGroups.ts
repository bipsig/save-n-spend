import type { AccountType, IAccount } from "@save-n-spend/types";

// Pure, so it's tested under node (accountGroups.test.ts); lib/accounts re-exports it.

/**
 * The three kinds of thing an account list holds, in the order they're shown. Money you spend
 * from, holdings, and people you owe or who owe you are different enough to be looked for
 * separately — and `person` accounts grow with every trip, so they sit last rather than
 * through the middle of the list.
 */
export const ACCOUNT_GROUPS: { label: string; types: AccountType[] }[] = [
  { label: "Accounts", types: ["bank", "cash", "wallet", "credit_card"] },
  { label: "Investments", types: ["investment"] },
  { label: "People", types: ["person"] },
];

export type AccountGroup = {
  label: string;
  /** The People group, whose settled rows can fold. */
  people: boolean;
  /** Every account of the group's types, in the list's order. */
  all: IAccount[];
  /** What to draw: `all`, less settled people when folded. */
  rows: IAccount[];
  /** People with a balance (every row, outside People). */
  open: number;
  /** Settled people, shown or not: a fold toggle stays put once unfolded. */
  settled: number;
  /** Where settled people start in `rows` with `openFirst`, else -1. */
  settledFrom: number;
};

/**
 * Accounts under ACCOUNT_GROUPS' headings, for the picker, Manage accounts and Activity's filter
 * alike (gaps row 166). People with nothing outstanding are the rows nobody looks for, so
 * `openFirst` sorts them last and `fold` leaves them out, except any in `keep` (a filter
 * already set on one). A group with nothing to show and nothing folded is dropped.
 */
export const groupAccounts = (
  accounts: IAccount[],
  { fold = false, openFirst = false, keep = [] }: { fold?: boolean; openFirst?: boolean; keep?: string[] } = {},
): AccountGroup[] =>
  ACCOUNT_GROUPS
    .map(({ label, types }) => {
      const all = accounts.filter((a) => types.includes(a.type));
      if (!types.includes("person")) return { label, people: false, all, rows: all, open: all.length, settled: 0, settledFrom: -1 };
      const shown = (a: IAccount) => a.balance !== 0 || !fold || keep.includes(a._id);
      const open = all.filter((a) => a.balance !== 0);
      const settledShown = all.filter((a) => a.balance === 0 && shown(a));
      return {
        label,
        people: true,
        all,
        rows: openFirst ? [...open, ...settledShown] : all.filter(shown),
        open: open.length,
        settled: all.length - open.length,
        settledFrom: openFirst ? open.length : -1,
      };
    })
    .filter((g) => g.rows.length > 0 || g.settled > 0);
