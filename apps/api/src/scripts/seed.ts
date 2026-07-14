// Dev seed — wipes the app collections and rebuilds two test users with
// default + custom (2-level) categories and a month of transactions, keeping
// account balances exact. Run:  npm run seed   (from apps/api)
//
// Users:
//   sagnik@email.com  / sagnik123   (Sagnik Das)
//   bipasha@email.com / bipasha123  (Bipasha Sinha)
//
// NOTE: destructive — deletes ALL users/accounts/categories/transactions.
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB from "../config/db";
import User from "../models/User";
import Account from "../models/Account";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import { defaultCategories } from "../data/defaultCategories";

// A date `n` days before now (transactions spread across the last month).
const daysAgo = (n: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

// One transaction to seed. Category/account are referenced by name; the seeder
// resolves them to ids per user. amountPaise is integer paise (₹1 = 100).
type TxnSpec = {
  type: "expense" | "income";
  amountPaise: number;
  categoryName: string;
  account: "Cash" | "Bank";
  title: string;
  daysAgo: number;
};

// Custom categories layered on top of the 8 defaults, some as 2-level children.
// `parentName` (when set) points at an existing category by name.
const customCategories: {
  name: string;
  kind: "expense" | "income";
  icon: string;
  color: string;
  parentName?: string;
}[] = [
  { name: "Groceries", kind: "expense", icon: "food", color: "success", parentName: "Food & Dining" },
  { name: "Restaurants", kind: "expense", icon: "food", color: "warning", parentName: "Food & Dining" },
  { name: "Fuel", kind: "expense", icon: "transport", color: "info", parentName: "Transportation" },
  { name: "Cab", kind: "expense", icon: "transport", color: "accent", parentName: "Transportation" },
  { name: "Subscriptions", kind: "expense", icon: "bills", color: "accent" }, // custom top-level
  { name: "Netflix", kind: "expense", icon: "entertainment", color: "danger", parentName: "Subscriptions" },
  { name: "Spotify", kind: "expense", icon: "entertainment", color: "success", parentName: "Subscriptions" },
];

// A month of transactions — mixes top-level and sub-category refs so the
// parent-includes-children filter has something to prove.
const monthlyTransactions: TxnSpec[] = [
  { type: "income", amountPaise: 8000000, categoryName: "Income", account: "Bank", title: "Monthly salary", daysAgo: 28 },
  { type: "expense", amountPaise: 145000, categoryName: "Groceries", account: "Cash", title: "BigBasket run", daysAgo: 26 },
  { type: "expense", amountPaise: 62000, categoryName: "Restaurants", account: "Cash", title: "Dinner at Barbeque Nation", daysAgo: 24 },
  { type: "expense", amountPaise: 200000, categoryName: "Fuel", account: "Bank", title: "Petrol", daysAgo: 22 },
  { type: "expense", amountPaise: 49900, categoryName: "Netflix", account: "Bank", title: "Netflix subscription", daysAgo: 20 },
  { type: "expense", amountPaise: 11900, categoryName: "Spotify", account: "Bank", title: "Spotify Premium", daysAgo: 20 },
  { type: "expense", amountPaise: 89000, categoryName: "Shopping", account: "Cash", title: "New running shoes", daysAgo: 18 },
  { type: "expense", amountPaise: 35000, categoryName: "Cab", account: "Cash", title: "Uber to airport", daysAgo: 15 },
  { type: "expense", amountPaise: 120000, categoryName: "Bills & Utilities", account: "Bank", title: "Electricity bill", daysAgo: 12 },
  { type: "expense", amountPaise: 76000, categoryName: "Groceries", account: "Cash", title: "Weekly groceries", daysAgo: 10 },
  { type: "expense", amountPaise: 45000, categoryName: "Healthcare", account: "Bank", title: "Pharmacy", daysAgo: 8 },
  { type: "income", amountPaise: 500000, categoryName: "Income", account: "Cash", title: "Freelance payment", daysAgo: 6 },
  { type: "expense", amountPaise: 92000, categoryName: "Restaurants", account: "Cash", title: "Lunch with friends", daysAgo: 4 },
  { type: "expense", amountPaise: 28000, categoryName: "Entertainment", account: "Bank", title: "Movie tickets", daysAgo: 2 },
];

const saltRounds = Number(process.env.SALT_ROUNDS) || 12;

const seedUser = async (name: string, email: string, password: string): Promise<void> => {
  const user = await User.create({
    name,
    email,
    password: await bcrypt.hash(password, saltRounds),
    authProvider: "local",
  });

  // Name → category doc, so transactions and child-parent links resolve by name.
  const catByName = new Map<string, InstanceType<typeof Category>>();

  // 1) Default categories (per-user copies), same as register-seeding.
  const defaults = await Category.create(
    defaultCategories.map((c) => ({ ...c, userId: user._id }))
  );
  defaults.forEach((c) => catByName.set(c.name, c));

  // 2) Custom + sub-categories (parents already exist in catByName).
  for (const c of customCategories) {
    const parent = c.parentName ? catByName.get(c.parentName)?._id ?? null : null;
    const [created] = await Category.create([
      { userId: user._id, name: c.name, kind: c.kind, icon: c.icon, color: c.color, parent },
    ]);
    catByName.set(c.name, created);
  }

  // 3) Accounts — Cash (the register default) + a Bank, so transfers are testable later.
  const cash = await Account.create({
    userId: user._id, name: "Cash", type: "cash",
    startingBalance: 1000000, balance: 1000000, icon: "wallet", color: "success",
  });
  const bank = await Account.create({
    userId: user._id, name: "HDFC Bank", type: "bank",
    startingBalance: 5000000, balance: 5000000, icon: "bank", color: "info",
  });
  user.prefs.defaultAccount = cash._id;
  await user.save();

  const acctByName = { Cash: cash, Bank: bank };

  // 4) Transactions — insert each and $inc its account so balances stay exact.
  for (const t of monthlyTransactions) {
    const category = catByName.get(t.categoryName);
    const account = acctByName[t.account];
    if (!category) throw new Error(`Seed: unknown category "${t.categoryName}"`);

    await Transaction.create({
      userId: user._id,
      type: t.type,
      amount: t.amountPaise,
      account: account._id,
      category: category._id,
      title: t.title,
      occurredAt: daysAgo(t.daysAgo),
    });

    const delta = t.type === "expense" ? -t.amountPaise : t.amountPaise;
    await Account.updateOne({ _id: account._id }, { $inc: { balance: delta } });
  }

  console.log(`  ✓ ${name} <${email}> — ${defaults.length + customCategories.length} categories, 2 accounts, ${monthlyTransactions.length} transactions`);
};

const run = async (): Promise<void> => {
  await connectDB();

  console.log("Wiping app collections…");
  await Promise.all([
    User.deleteMany({}),
    Account.deleteMany({}),
    Category.deleteMany({}),
    Transaction.deleteMany({}),
  ]);

  console.log("Seeding users…");
  await seedUser("Sagnik Das", "sagnik@email.com", "sagnik123");
  await seedUser("Bipasha Sinha", "bipasha@email.com", "bipasha123");

  await mongoose.disconnect();
  console.log("Done. ✅");
};

run().catch(async (err) => {
  console.error("Seed failed:", err);
  await mongoose.disconnect();
  process.exit(1);
});
