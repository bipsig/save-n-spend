import type { IconName } from "./icons";
import type { ColorToken } from "@/theme";

// The spend categories used across transactions, budgets, and insights.
export type Category =
  | "food"
  | "shopping"
  | "transport"
  | "bills"
  | "entertainment"
  | "health"
  | "income"
  | "others";

type CategoryMeta = {
  label: string
  icon: IconName
  color: ColorToken // glyph / accent color
  bg: ColorToken    // soft container background
};

// One place that maps a category to its label, icon, and colors.
// Rows/cards read from here so a category always looks the same everywhere.
export const categories: Record<Category, CategoryMeta> = {
  food:          { label: "Food & Dining",     icon: "food",          color: "success", bg: "successSoft" },
  shopping:      { label: "Shopping",          icon: "shopping",      color: "danger",  bg: "dangerSoft" },
  transport:     { label: "Transportation",    icon: "transport",     color: "info",    bg: "infoSoft" },
  bills:         { label: "Bills & Utilities", icon: "bills",         color: "accent",  bg: "accentSoft" },
  entertainment: { label: "Entertainment",     icon: "entertainment", color: "warning", bg: "warningSoft" },
  health:        { label: "Healthcare",        icon: "health",        color: "success", bg: "successSoft" },
  income:        { label: "Income",            icon: "income",        color: "success", bg: "successSoft" },
  others:        { label: "Others",            icon: "more",          color: "gray500", bg: "surface2" },
};
