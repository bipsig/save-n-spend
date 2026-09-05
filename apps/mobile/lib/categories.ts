import type { CategoryKind, ICategory } from "@save-n-spend/types";
import type { ColorToken } from "@/theme";
import { useCategoryStore } from "@/store/categories";
import { del, patch, post } from "@/lib/api";

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

// ---- Mutations (Manage categories) ------------------------------------------
// Refetch after each write so every screen reading the store sees the change on
// its next focus, without each of them knowing a category was edited.

export type CategoryDraft = {
  name: string;
  kind: CategoryKind;
  icon?: string;
  color?: string;
};

export const createCategory = async (draft: CategoryDraft): Promise<void> => {
  await post<ICategory>("/categories", draft);
  await useCategoryStore.getState().load();
};

// No `kind`: flipping expense↔income would reclassify every transaction already
// filed under it, turning spend into earnings retroactively.
export const updateCategory = async (
  id: string,
  patchBody: { name?: string; icon?: string; color?: string }
): Promise<void> => {
  await patch<ICategory>(`/categories/${id}`, patchBody);
  await useCategoryStore.getState().load();
};

// Archived, not deleted — past transactions keep resolving to a real category.
export const archiveCategory = async (id: string): Promise<void> => {
  await del<null>(`/categories/${id}`);
  await useCategoryStore.getState().load();
};
