// Dev seed — wipes the app collections and rebuilds two test users with a
// full year of realistic activity: multi-account transactions (income, expense
// and cross-account transfers), current-month budgets, goals and a diversified
// set of bills. Account balances are kept exact against the transactions, and
// bills are dated so their derived status (paid / overdue / pending) renders.
// Run:  npm run seed   (from apps/api)
//
// Users:
//   sagnik@email.com  / sagnik123   (Sagnik Das)     — rich, ~1 year
//   bipasha@email.com / bipasha123  (Bipasha Sinha)   — lighter, ~4 months
//
// NOTE: destructive — deletes ALL users/accounts/categories/transactions/
// budgets/bills/goals. Guarded to refuse a production database.
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import connectDB, { resolveDbName } from "../config/db";
import User from "../models/User";
import Account from "../models/Account";
import Category from "../models/Category";
import Transaction from "../models/Transaction";
import Budget from "../models/Budget";
import Bill from "../models/Bill";
import Goal from "../models/Goal";
import { defaultCategories } from "../data/defaultCategories";

// --- deterministic RNG (mulberry32) so re-seeding gives the same data ---------
let rngState = 20260808;
const rng = (): number => {
    rngState |= 0;
    rngState = (rngState + 0x6d2b79f5) | 0;
    let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const randInt = (min: number, max: number): number => Math.floor(rng() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const chance = (p: number): boolean => rng() < p;

// Rupees → integer paise. Money is paise everywhere.
const R = (rupees: number): number => Math.round(rupees) * 100;
const money = (minR: number, maxR: number): number => randInt(minR, maxR) * 100;

const saltRounds = Number(process.env.SALT_ROUNDS) || 12;
const now = new Date();

// --- date helpers (UTC, to match the range math the controllers use) ----------
const daysAgo = (n: number): Date => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - n);
    return d;
};
const daysAhead = (n: number): Date => daysAgo(-n);
const monthsFrom = (offset: number, day: number): Date =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day));
const monthLabel = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

// --- category set (defaults + custom 2-level) ---------------------------------
// Parents must precede their children; income children hang off "Income".
const customCategories: {
    name: string;
    kind: "expense" | "income";
    icon: string;
    color: string;
    parentName?: string;
}[] = [
    { name: "Salary", kind: "income", icon: "income", color: "success", parentName: "Income" },
    { name: "Freelance", kind: "income", icon: "income", color: "info", parentName: "Income" },
    { name: "Groceries", kind: "expense", icon: "food", color: "success", parentName: "Food & Dining" },
    { name: "Restaurants", kind: "expense", icon: "food", color: "warning", parentName: "Food & Dining" },
    { name: "Fuel", kind: "expense", icon: "transport", color: "info", parentName: "Transportation" },
    { name: "Cab", kind: "expense", icon: "transport", color: "accent", parentName: "Transportation" },
    { name: "Rent", kind: "expense", icon: "bills", color: "danger", parentName: "Bills & Utilities" },
    { name: "Electricity", kind: "expense", icon: "bills", color: "warning", parentName: "Bills & Utilities" },
    { name: "Internet", kind: "expense", icon: "bills", color: "info", parentName: "Bills & Utilities" },
    { name: "Subscriptions", kind: "expense", icon: "bills", color: "accent" },
    { name: "Netflix", kind: "expense", icon: "entertainment", color: "danger", parentName: "Subscriptions" },
    { name: "Spotify", kind: "expense", icon: "entertainment", color: "success", parentName: "Subscriptions" },
];

// --- title pools --------------------------------------------------------------
const groceryTitles = ["BigBasket order", "Weekly groceries", "Reliance Fresh", "Vegetables & fruits", "Milk & eggs run"];
const restaurantTitles = ["Dinner at Barbeque Nation", "Lunch with friends", "Swiggy order", "Zomato dinner", "Cafe brunch", "Street food"];
const cabTitles = ["Uber ride", "Ola to office", "Auto fare", "Rapido bike", "Uber to airport"];
const shoppingTitles = ["Amazon order", "New running shoes", "Myntra haul", "Winter jacket", "Home essentials", "Headphones"];
const entertainmentTitles = ["Movie tickets", "Concert pass", "PVR + snacks", "Bowling night", "Gaming credits"];
const healthcareTitles = ["Pharmacy", "Doctor visit", "Health checkup", "Dental cleaning"];

type Gen = {
    type: "expense" | "income" | "transfer";
    amount: number;
    accountKey: string;
    toAccountKey?: string;
    categoryName?: string;
    title: string;
    occurredAt: Date;
};

type Roles = { primary: string; cash: string; savings?: string; wallet?: string };

// A month-by-month activity generator. Routes each series to a role account so
// it adapts to users with fewer accounts (no wallet → subs move to primary).
const generateTransactions = (roles: Roles, fromMonthsAgo: number, density: number): Gen[] => {
    const out: Gen[] = [];
    const { primary, cash, savings, wallet } = roles;
    const subsAcct = wallet ?? primary;

    let cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - fromMonthsAgo, 1));

    while (
        cursor.getUTCFullYear() < now.getUTCFullYear() ||
        (cursor.getUTCFullYear() === now.getUTCFullYear() && cursor.getUTCMonth() <= now.getUTCMonth())
    ) {
        const y = cursor.getUTCFullYear();
        const m = cursor.getUTCMonth();
        const isCurrent = y === now.getUTCFullYear() && m === now.getUTCMonth();
        const fullDays = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const maxDay = isCurrent ? now.getUTCDate() : fullDays;

        const add = (
            day: number,
            type: Gen["type"],
            amount: number,
            accountKey: string,
            title: string,
            categoryName?: string,
            toAccountKey?: string
        ): void => {
            if (day > maxDay) return; // don't post into the future within this month
            out.push({
                type,
                amount,
                accountKey,
                toAccountKey,
                categoryName,
                title,
                occurredAt: new Date(Date.UTC(y, m, day, randInt(8, 21), randInt(0, 59))),
            });
        };
        const many = (base: number): number => Math.max(0, Math.round(base * density));

        // Fixed monthly rhythm.
        add(1, "income", R(85000), primary, "Monthly salary", "Salary");
        add(randInt(3, 6), "expense", R(18000), primary, "House rent", "Rent");
        add(randInt(7, 12), "expense", money(900, 2600), primary, "Electricity bill", "Electricity");
        add(randInt(6, 10), "expense", R(1000), primary, "Broadband", "Internet");
        add(15, "expense", R(499), subsAcct, "Netflix", "Netflix");
        add(15, "expense", R(119), subsAcct, "Spotify Premium", "Spotify");
        if (chance(0.8)) add(randInt(2, 6), "expense", R(799), subsAcct, "Mobile recharge", "Bills & Utilities");
        if (chance(0.6)) add(randInt(1, 5), "expense", R(1200), primary, "Gym membership", "Healthcare");

        // Everyday variable spend. Days are picked within the elapsed part of the
        // month (maxDay), so the current month is realistically populated rather
        // than sparse at the start.
        for (let i = 0; i < many(randInt(3, 5)); i++)
            add(randInt(1, maxDay), "expense", money(500, 2800), pick([cash, primary]), pick(groceryTitles), "Groceries");
        for (let i = 0; i < many(randInt(2, 5)); i++)
            add(randInt(1, maxDay), "expense", money(250, 1800), pick([cash, primary]), pick(restaurantTitles), "Restaurants");
        for (let i = 0; i < many(randInt(1, 3)); i++)
            add(randInt(1, maxDay), "expense", money(1500, 3800), primary, "Petrol", "Fuel");
        for (let i = 0; i < many(randInt(1, 4)); i++)
            add(randInt(1, maxDay), "expense", money(120, 650), pick([subsAcct, cash]), pick(cabTitles), "Cab");
        for (let i = 0; i < many(randInt(0, 2)); i++)
            add(randInt(1, maxDay), "expense", money(800, 6500), pick([primary, cash]), pick(shoppingTitles), "Shopping");
        for (let i = 0; i < many(randInt(0, 2)); i++)
            add(randInt(1, maxDay), "expense", money(200, 1400), pick([primary, cash]), pick(entertainmentTitles), "Entertainment");
        if (chance(0.3))
            add(randInt(1, maxDay), "expense", money(300, 3200), primary, pick(healthcareTitles), "Healthcare");
        if (chance(0.3))
            add(randInt(10, 25), "income", money(15000, 45000), savings ?? primary, "Freelance project", "Freelance");

        // Cross-account transfers — keep money conserved across accounts.
        add(randInt(1, 20), "transfer", money(5000, 10000), primary, "ATM withdrawal", undefined, cash);
        if (savings && chance(0.85))
            add(randInt(1, 8), "transfer", money(10000, 15000), primary, "To savings", undefined, savings);
        if (wallet && chance(0.9))
            add(randInt(1, 5), "transfer", money(2500, 4000), primary, "Wallet top-up", undefined, wallet);

        cursor = new Date(Date.UTC(y, m + 1, 1));
    }

    return out;
};

// --- per-user builders --------------------------------------------------------
const seedCategories = async (
    userId: mongoose.Types.ObjectId
): Promise<Map<string, InstanceType<typeof Category>>> => {
    const catByName = new Map<string, InstanceType<typeof Category>>();

    const defaults = await Category.create(defaultCategories.map((c) => ({ ...c, userId })));
    defaults.forEach((c) => catByName.set(c.name, c));

    for (const c of customCategories) {
        const parent = c.parentName ? catByName.get(c.parentName)?._id ?? null : null;
        const [created] = await Category.create([
            { userId, name: c.name, kind: c.kind, icon: c.icon, color: c.color, parent },
        ]);
        catByName.set(c.name, created);
    }

    return catByName;
};

type AccountSpec = { key: string; name: string; type: string; start: number; icon: string; color: string };

const insertActivity = async (
    userId: mongoose.Types.ObjectId,
    acctByKey: Map<string, InstanceType<typeof Account>>,
    catByName: Map<string, InstanceType<typeof Category>>,
    gens: Gen[]
): Promise<void> => {
    const net = new Map<string, number>();
    const bump = (key: string, delta: number): void => {
        net.set(key, (net.get(key) ?? 0) + delta);
    };

    const docs = gens.map((g) => {
        const account = acctByKey.get(g.accountKey);
        if (!account) throw new Error(`Seed: unknown account "${g.accountKey}"`);

        if (g.type === "transfer") {
            const to = acctByKey.get(g.toAccountKey!);
            if (!to) throw new Error(`Seed: unknown transfer target "${g.toAccountKey}"`);
            bump(g.accountKey, -g.amount);
            bump(g.toAccountKey!, g.amount);
            return {
                userId,
                type: g.type,
                amount: g.amount,
                account: account._id,
                toAccount: to._id,
                title: g.title,
                occurredAt: g.occurredAt,
            };
        }

        const category = catByName.get(g.categoryName!);
        if (!category) throw new Error(`Seed: unknown category "${g.categoryName}"`);
        bump(g.accountKey, g.type === "expense" ? -g.amount : g.amount);
        return {
            userId,
            type: g.type,
            amount: g.amount,
            account: account._id,
            category: category._id,
            title: g.title,
            occurredAt: g.occurredAt,
        };
    });

    await Transaction.insertMany(docs);

    for (const [key, account] of acctByKey) {
        account.balance = account.startingBalance + (net.get(key) ?? 0);
        await account.save();
    }
};

const seedUser = async (spec: {
    name: string;
    email: string;
    password: string;
    accounts: AccountSpec[];
    defaultKey: string;
    roles: Roles;
    fromMonthsAgo: number;
    density: number;
    budgets: { category: string; limit: number }[];
    goals: {
        name: string;
        target: number;
        saved: number;
        icon: string;
        color: string;
        deadlineDays?: number;
    }[];
    bills: {
        name: string;
        amount: number;
        category: string;
        accountKey: string;
        dueDate: Date;
        lastPaidAt?: Date;
        recurring: boolean;
        frequency?: "monthly" | "yearly";
        reminderDays?: number;
    }[];
}): Promise<void> => {
    const user = await User.create({
        name: spec.name,
        email: spec.email,
        password: await bcrypt.hash(spec.password, saltRounds),
        authProvider: "local",
    });

    const catByName = await seedCategories(user._id as mongoose.Types.ObjectId);

    const acctByKey = new Map<string, InstanceType<typeof Account>>();
    for (const a of spec.accounts) {
        const account = await Account.create({
            userId: user._id,
            name: a.name,
            type: a.type,
            startingBalance: a.start,
            balance: a.start,
            icon: a.icon,
            color: a.color,
        });
        acctByKey.set(a.key, account);
    }
    user.prefs.defaultAccount = acctByKey.get(spec.defaultKey)!._id as mongoose.Types.ObjectId;
    await user.save();

    const gens = generateTransactions(spec.roles, spec.fromMonthsAgo, spec.density);
    await insertActivity(user._id as mongoose.Types.ObjectId, acctByKey, catByName, gens);

    await Budget.create(
        spec.budgets.map((b) => ({
            userId: user._id,
            category: catByName.get(b.category)!._id,
            month: monthLabel,
            limit: b.limit,
        }))
    );

    await Goal.create(
        spec.goals.map((g) => ({
            userId: user._id,
            name: g.name,
            target: g.target,
            saved: g.saved,
            icon: g.icon,
            color: g.color,
            ...(g.deadlineDays ? { deadline: daysAhead(g.deadlineDays) } : {}),
        }))
    );

    await Bill.create(
        spec.bills.map((b) => ({
            userId: user._id,
            name: b.name,
            amount: b.amount,
            category: catByName.get(b.category)!._id,
            account: acctByKey.get(b.accountKey)!._id,
            dueDate: b.dueDate,
            lastPaidAt: b.lastPaidAt ?? null,
            status: "pending",
            recurring: b.recurring,
            ...(b.recurring ? { frequency: b.frequency } : {}),
            ...(b.reminderDays ? { reminderDays: b.reminderDays } : {}),
        }))
    );

    console.log(
        `  ✓ ${spec.name} <${spec.email}> — ${spec.accounts.length} accounts, ${gens.length} transactions, ` +
            `${spec.budgets.length} budgets, ${spec.goals.length} goals, ${spec.bills.length} bills`
    );
};

// --- the two users ------------------------------------------------------------
const seedSagnik = (): Promise<void> =>
    seedUser({
        name: "Sagnik Das",
        email: "sagnik@email.com",
        password: "sagnik123",
        accounts: [
            { key: "hdfc", name: "HDFC Bank", type: "bank", start: R(150000), icon: "bank", color: "info" },
            { key: "cash", name: "Cash", type: "cash", start: R(6000), icon: "wallet", color: "success" },
            { key: "icici", name: "ICICI Savings", type: "bank", start: R(90000), icon: "bank", color: "accent" },
            { key: "amazonpay", name: "Amazon Pay", type: "wallet", start: R(8000), icon: "wallet", color: "warning" },
        ],
        defaultKey: "hdfc",
        roles: { primary: "hdfc", cash: "cash", savings: "icici", wallet: "amazonpay" },
        fromMonthsAgo: 11,
        density: 1,
        budgets: [
            { category: "Food & Dining", limit: R(12000) },
            { category: "Transportation", limit: R(6000) },
            { category: "Shopping", limit: R(8000) },
            { category: "Bills & Utilities", limit: R(26000) },
            { category: "Entertainment", limit: R(3000) },
            { category: "Subscriptions", limit: R(700) },
        ],
        goals: [
            { name: "Emergency Fund", target: R(300000), saved: R(185000), icon: "savings", color: "success" },
            { name: "Goa Trip", target: R(60000), saved: R(42000), icon: "trophy", color: "info", deadlineDays: 75 },
            { name: "New Laptop", target: R(120000), saved: R(35000), icon: "wallet", color: "accent", deadlineDays: 150 },
            { name: "Wedding Fund", target: R(500000), saved: R(120000), icon: "health", color: "warning", deadlineDays: 320 },
            { name: "New Headphones", target: R(25000), saved: R(25000), icon: "trophy", color: "danger" },
        ],
        bills: [
            { name: "House Rent", amount: R(18000), category: "Rent", accountKey: "hdfc", dueDate: daysAhead(26), lastPaidAt: daysAgo(4), recurring: true, frequency: "monthly", reminderDays: 3 },
            { name: "Electricity", amount: R(1499), category: "Electricity", accountKey: "hdfc", dueDate: daysAgo(3), lastPaidAt: daysAgo(33), recurring: true, frequency: "monthly", reminderDays: 3 },
            { name: "Netflix", amount: R(499), category: "Netflix", accountKey: "amazonpay", dueDate: daysAhead(7), lastPaidAt: daysAgo(23), recurring: true, frequency: "monthly", reminderDays: 3 },
            { name: "Broadband", amount: R(1000), category: "Internet", accountKey: "hdfc", dueDate: daysAhead(4), lastPaidAt: daysAgo(26), recurring: true, frequency: "monthly", reminderDays: 3 },
            { name: "Mobile Recharge", amount: R(799), category: "Bills & Utilities", accountKey: "amazonpay", dueDate: daysAhead(12), recurring: true, frequency: "monthly", reminderDays: 1 },
            { name: "Gym Membership", amount: R(1200), category: "Healthcare", accountKey: "hdfc", dueDate: daysAhead(17), recurring: true, frequency: "monthly", reminderDays: 3 },
            { name: "Car Insurance", amount: R(14000), category: "Bills & Utilities", accountKey: "hdfc", dueDate: monthsFrom(4, 10), lastPaidAt: monthsFrom(-8, 10), recurring: true, frequency: "yearly", reminderDays: 7 },
            { name: "Amazon Prime", amount: R(1499), category: "Subscriptions", accountKey: "amazonpay", dueDate: monthsFrom(6, 1), recurring: true, frequency: "yearly", reminderDays: 7 },
            { name: "Property Tax", amount: R(8500), category: "Bills & Utilities", accountKey: "hdfc", dueDate: daysAhead(20), recurring: false, reminderDays: 7 },
        ],
    });

const seedBipasha = (): Promise<void> =>
    seedUser({
        name: "Bipasha Sinha",
        email: "bipasha@email.com",
        password: "bipasha123",
        accounts: [
            { key: "axis", name: "Axis Bank", type: "bank", start: R(60000), icon: "bank", color: "info" },
            { key: "cash", name: "Cash", type: "cash", start: R(4000), icon: "wallet", color: "success" },
        ],
        defaultKey: "axis",
        roles: { primary: "axis", cash: "cash" },
        fromMonthsAgo: 4,
        density: 0.6,
        budgets: [
            { category: "Food & Dining", limit: R(9000) },
            { category: "Shopping", limit: R(6000) },
        ],
        goals: [
            { name: "Manali Trip", target: R(40000), saved: R(15000), icon: "trophy", color: "info", deadlineDays: 90 },
            { name: "New Phone", target: R(80000), saved: R(60000), icon: "wallet", color: "accent", deadlineDays: 200 },
        ],
        bills: [
            { name: "House Rent", amount: R(12000), category: "Rent", accountKey: "axis", dueDate: daysAhead(21), lastPaidAt: daysAgo(9), recurring: true, frequency: "monthly", reminderDays: 3 },
            { name: "Electricity", amount: R(950), category: "Electricity", accountKey: "axis", dueDate: daysAgo(2), lastPaidAt: daysAgo(32), recurring: true, frequency: "monthly", reminderDays: 3 },
            { name: "Netflix", amount: R(199), category: "Netflix", accountKey: "axis", dueDate: daysAhead(11), lastPaidAt: daysAgo(19), recurring: true, frequency: "monthly", reminderDays: 1 },
        ],
    });

const run = async (): Promise<void> => {
    // Hard stop: this script wipes every collection. It must never touch prod.
    if (process.env.NODE_ENV === "production" || resolveDbName().includes("prod")) {
        console.error("Refusing to seed: resolves to a production database.");
        process.exit(1);
    }

    await connectDB();

    console.log("Wiping app collections…");
    await Promise.all([
        User.deleteMany({}),
        Account.deleteMany({}),
        Category.deleteMany({}),
        Transaction.deleteMany({}),
        Budget.deleteMany({}),
        Bill.deleteMany({}),
        Goal.deleteMany({}),
    ]);

    console.log("Seeding users…");
    await seedSagnik();
    await seedBipasha();

    await mongoose.disconnect();
    console.log("Done. ✅");
};

run().catch(async (err) => {
    console.error("Seed failed:", err);
    await mongoose.disconnect();
    process.exit(1);
});
