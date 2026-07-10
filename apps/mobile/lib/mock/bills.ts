import type { IBill } from "@save-n-spend/types";

// amount is integer paise. dueDate is ISO; the "Due in 3 days" label is derived.
const daysFromNow = (d: number): string => new Date(Date.now() + d * 86_400_000).toISOString();

export const bills: IBill[] = [
  { _id: "b1", userId: "u1", name: "Electricity", amount: 125000, category: "cat-bills",         dueDate: daysFromNow(3),             status: "pending", recurring: true, frequency: "monthly" },
  { _id: "b2", userId: "u1", name: "Internet",    amount: 80000,  category: "cat-bills",         dueDate: daysFromNow(5),             status: "pending", recurring: true, frequency: "monthly" },
  { _id: "b3", userId: "u1", name: "Netflix",     amount: 64900,  category: "cat-entertainment", dueDate: "2026-01-23T00:00:00.000Z", status: "paid",    recurring: true, frequency: "monthly" },
  { _id: "b4", userId: "u1", name: "Credit Card", amount: 450000, category: "cat-bills",         dueDate: daysFromNow(-2),            status: "overdue" },
];
