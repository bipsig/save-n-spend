import type { Bill } from "./types";

// Upcoming bills (Figma Home "Upcoming Bills" + Bills screen).
export const bills: Bill[] = [
  { id: "b1", name: "Electricity", category: "bills",          amount: 1250, dueLabel: "Due in 3 days", status: "pending" },
  { id: "b2", name: "Internet",    category: "bills",          amount: 800,  dueLabel: "Due in 5 days", status: "pending" },
  { id: "b3", name: "Netflix",     category: "entertainment",  amount: 649,  dueLabel: "Paid Jan 23",   status: "paid" },
  { id: "b4", name: "Credit Card", category: "bills",          amount: 4500, dueLabel: "Overdue",       status: "overdue" },
];
