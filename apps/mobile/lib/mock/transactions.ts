import type { Transaction } from "./types";

// Sample transactions matching the Figma Activity screen.
// amount is integer paise (e.g. -45000 = -₹450). Negative = money out, positive = money in.
export const transactions: Transaction[] = [
  { id: "t1", title: "Starbucks",        category: "food",          amount: -45000,   date: "Today, 2:30 PM",  location: "CP",          hasReceipt: true },
  { id: "t2", title: "Metro Recharge",   category: "transport",     amount: -50000,   date: "Today, 9:15 AM",  location: "Rajiv Chowk" },
  { id: "t3", title: "Electricity Bill", category: "bills",         amount: -125000,  date: "Jan 25",          location: "Online",      hasReceipt: true },
  { id: "t4", title: "Amazon Purchase",  category: "shopping",      amount: -289900,  date: "Jan 24",          location: "Online",      hasReceipt: true },
  { id: "t5", title: "Netflix",          category: "entertainment", amount: -64900,   date: "Jan 23",          location: "Subscription" },
  { id: "t6", title: "Uber",             category: "transport",     amount: -18500,   date: "Jan 23",          location: "MG Road" },
  { id: "t7", title: "Freelance Project", category: "income",       amount: 1500000,  date: "Jan 22",          location: "PayPal" },
];
