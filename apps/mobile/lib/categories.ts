import type { ICategory } from "@save-n-spend/types";
import type { ColorToken } from "@/theme";

// Mock SYSTEM-DEFAULT categories (userId: null). In the real app these come from
// the API — defaults + the user's own — per the categories model. Shape = ICategory.
export const categories: ICategory[] = [
  { _id: "cat-food",          userId: null, name: "Food & Dining",     parent: null, kind: "expense", icon: "food",          color: "success", isArchived: false },
  { _id: "cat-shopping",      userId: null, name: "Shopping",          parent: null, kind: "expense", icon: "shopping",      color: "danger",  isArchived: false },
  { _id: "cat-transport",     userId: null, name: "Transportation",    parent: null, kind: "expense", icon: "transport",     color: "info",    isArchived: false },
  { _id: "cat-bills",         userId: null, name: "Bills & Utilities", parent: null, kind: "expense", icon: "bills",         color: "accent",  isArchived: false },
  { _id: "cat-entertainment", userId: null, name: "Entertainment",     parent: null, kind: "expense", icon: "entertainment", color: "warning", isArchived: false },
  { _id: "cat-health",        userId: null, name: "Healthcare",        parent: null, kind: "expense", icon: "health",        color: "success", isArchived: false },
  { _id: "cat-income",        userId: null, name: "Income",            parent: null, kind: "income",  icon: "income",        color: "success", isArchived: false },
  { _id: "cat-others",        userId: null, name: "Others",            parent: null, kind: "expense", icon: "more",          color: "gray500", isArchived: false },
];

// Look up a category by id (transaction.category is a categoryId or null).
export const categoryById = (id: string | null): ICategory | undefined =>
  categories.find((c) => c._id === id);

// The soft background token that pairs with a category's color (behind its icon).
const SOFT_BG: Record<string, ColorToken> = {
  success: "successSoft",
  danger: "dangerSoft",
  info: "infoSoft",
  warning: "warningSoft",
  accent: "accentSoft",
  primary: "accentSoft",
  gray500: "surface2",
};
export const categoryBg = (color?: string): ColorToken => SOFT_BG[color ?? ""] ?? "surface2";
