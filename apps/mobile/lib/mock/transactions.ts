import type { ITransaction } from "@save-n-spend/types";
import { defaultAccountId } from "./accounts";

// amount is integer paise and ALWAYS POSITIVE — `type` decides direction.
// occurredAt is an ISO string; the display label is derived via formatTxnDate.
const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();

export const transactions: ITransaction[] = [
  { _id: "t1", userId: "u1", type: "expense", amount: 45000,   account: defaultAccountId, category: "cat-food",          title: "Starbucks",         location: "CP",           receiptUrl: "receipt://t1", occurredAt: hoursAgo(3) },
  { _id: "t2", userId: "u1", type: "expense", amount: 50000,   account: defaultAccountId, category: "cat-transport",     title: "Metro Recharge",    location: "Rajiv Chowk",                              occurredAt: hoursAgo(6) },
  { _id: "t3", userId: "u1", type: "expense", amount: 125000,  account: defaultAccountId, category: "cat-bills",         title: "Electricity Bill",  location: "Online",       receiptUrl: "receipt://t3", occurredAt: "2026-01-25T10:00:00.000Z" },
  { _id: "t4", userId: "u1", type: "expense", amount: 289900,  account: defaultAccountId, category: "cat-shopping",      title: "Amazon Purchase",   location: "Online",       receiptUrl: "receipt://t4", occurredAt: "2026-01-24T14:00:00.000Z" },
  { _id: "t5", userId: "u1", type: "expense", amount: 64900,   account: defaultAccountId, category: "cat-entertainment", title: "Netflix",           location: "Subscription",                             occurredAt: "2026-01-23T09:00:00.000Z" },
  { _id: "t6", userId: "u1", type: "expense", amount: 18500,   account: defaultAccountId, category: "cat-transport",     title: "Uber",              location: "MG Road",                                  occurredAt: "2026-01-23T20:00:00.000Z" },
  { _id: "t7", userId: "u1", type: "income",  amount: 1500000, account: defaultAccountId, category: "cat-income",        title: "Freelance Project", location: "PayPal",                                   occurredAt: "2026-01-22T12:00:00.000Z" },
];
