import type { Bill } from "./types";

// Upcoming bills (Figma Home "Upcoming Bills" + Bills screen).
// amount is integer paise (e.g. 125000 = ₹1,250).
export const bills: Bill[] = [
  { id: "b1", name: "Electricity", category: "bills",          amount: 125000, dueLabel: "Due in 3 days", status: "pending" },
  { id: "b2", name: "Internet",    category: "bills",          amount: 80000,  dueLabel: "Due in 5 days", status: "pending" },
  { id: "b3", name: "Netflix",     category: "entertainment",  amount: 64900,  dueLabel: "Paid Jan 23",   status: "paid" },
  { id: "b4", name: "Credit Card", category: "bills",          amount: 450000, dueLabel: "Overdue",       status: "overdue" },
];
