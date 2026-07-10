import type { IAccount } from "@save-n-spend/types";

// Mock accounts (Figma "Cards" / More). Balances are paise; credit_card balance
// = outstanding owed. Transactions reference one of these via `account`.
export const accounts: IAccount[] = [
  { _id: "acc-bank", userId: "u1", name: "HDFC Bank",   type: "bank",        balance: 12500000, startingBalance: 10000000, color: "info",    isArchived: false },
  { _id: "acc-cash", userId: "u1", name: "Cash",        type: "cash",        balance: 500000,   startingBalance: 500000,   color: "success", isArchived: false },
  { _id: "acc-card", userId: "u1", name: "Credit Card", type: "credit_card", balance: 450000,   startingBalance: 0,        color: "warning", isArchived: false },
];

export const defaultAccountId = accounts[0]._id;
