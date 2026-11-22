import type { IAccount, IBill } from "@save-n-spend/types";

/**
 * The body of the "Delete <account>?" confirm (gaps row 6). Archiving is allowed with money
 * left in the account (decision 3a), so the amount is named, through `money` so privacy mode
 * masks it. Then what the server does to its bills: a bill paid from it falls back to the
 * default account, and a SIP into a holding is paused until it points at another one.
 */
export const archiveNotice = (account: Pick<IAccount, "_id" | "balance" | "type">, bills: Pick<IBill, "account" | "toInvestment">[], money: (paise: number) => string, isDefault = false): string => {
  const paidFrom = bills.filter((b) => b.account === account._id && !b.toInvestment).length;
  const sips = bills.filter((b) => b.toInvestment === account._id).length;
  const left = money(Math.abs(account.balance));
  const owing = account.type === "person"
    ? (account.balance > 0 ? `They still owe you ${left}.` : `You still owe them ${left}.`)
    : `${left} is still ${account.balance > 0 ? "in it" : "owed on it"}.`;
  return [
    account.balance === 0
      ? "It disappears from your pickers."
      : `${owing} It disappears from your pickers and stops counting toward your totals.`,
    isDefault
      ? `It's your default account, so you'll pick an account for new entries${paidFrom === 0 ? "" : paidFrom === 1 ? " and for the bill paid from it" : ` and for the ${paidFrom} bills paid from it`}.`
      : paidFrom > 0 ? `${paidFrom === 1 ? "A bill paid" : `${paidFrom} bills paid`} from it will use your default account.` : "",
    sips > 0 ? `${sips === 1 ? "Its SIP is" : `Its ${sips} SIPs are`} paused until you pick another holding.` : "",
    "Transactions already recorded against it keep their history.",
  ].filter(Boolean).join(" ");
};
