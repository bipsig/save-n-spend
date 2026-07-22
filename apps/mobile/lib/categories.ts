import type { ICategory } from "@save-n-spend/types";
import type { ColorToken } from "@/theme";
import { useCategoryStore } from "@/store/categories";

// Categories are DB entities (defaults + the user's own), fetched into the
// categories store after login. These helpers read that store — reactive hooks
// for render, a sync lookup for imperative code.

// The full list, reactive — re-renders the caller when categories load/change.
// Use in screens and pickers (filter chips, the category picker).
export const useCategories = (): ICategory[] => useCategoryStore((s) => s.list);

// One category by id, reactive — for rows that render a category's icon/name.
export const useCategoryById = (id: string | null | undefined): ICategory | undefined =>
  useCategoryStore((s) => (id ? s.list.find((c) => c._id === id) : undefined));

// One category by id, NON-reactive — for imperative code outside render
// (form logic, submit handlers) that just needs the current value once.
export const categoryById = (id: string | null): ICategory | undefined =>
  id ? useCategoryStore.getState().list.find((c) => c._id === id) : undefined;

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
