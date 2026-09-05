import { useMemo } from "react";
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

// ---- Hierarchy ---------------------------------------------------------------
// Categories are two levels deep: a top-level category, and sub-categories filed
// under it. Spend on a child rolls into its parent everywhere a total is shown, so
// "Groceries" and "Food & Dining" are not siblings and must never be drawn as if
// they were. These helpers are the single answer to "what is this, and what is it
// under" — every surface that names a category goes through one of them, so the
// picker, the rows, and the manage screen cannot drift apart on it.

export type CategoryGroup = {
  parent: ICategory;
  children: ICategory[];
};

/**
 * The list as a tree: each top-level category with its children beneath it, both
 * levels keeping the store's order.
 *
 * Children whose parent is missing from the list — archived out from under them, or
 * still loading — are promoted to top level rather than dropped. A category with
 * nowhere to sit is still a category the user filed things under, and silently
 * hiding it is how a picker loses rows.
 */
export const buildCategoryTree = (
  categories: ICategory[],
  kind?: CategoryKind,
): CategoryGroup[] => {
  const scoped = kind ? categories.filter((c) => c.kind === kind) : categories;
  const ids = new Set(scoped.map((c) => c._id));

  const childrenByParent = new Map<string, ICategory[]>();
  for (const category of scoped) {
    if (category.parent && ids.has(category.parent)) {
      childrenByParent.set(category.parent, [...(childrenByParent.get(category.parent) ?? []), category]);
    }
  }

  return scoped
    .filter((c) => !c.parent || !ids.has(c.parent))
    .map((parent) => ({ parent, children: childrenByParent.get(parent._id) ?? [] }));
};

/** Reactive tree, optionally narrowed to one kind. */
export const useCategoryTree = (kind?: CategoryKind): CategoryGroup[] => {
  const list = useCategories();
  return useMemo(() => buildCategoryTree(list, kind), [list, kind]);
};

export type CategoryLabel = {
  /** The category's own name — what the eye lands on. */
  name: string;
  /** Its parent's name, or undefined when it is itself top-level. */
  parentName?: string;
  /** True when this is a sub-category. */
  isChild: boolean;
  /**
   * How many sub-categories sit under it — 0 for a child, and for a parent that has
   * none yet. Load-bearing on a budget row: a limit on a category with children
   * governs their spending too, and the row has to say so.
   */
  childCount: number;
  /** `"Food & Dining › Groceries"` for one-line contexts (exports, toasts). */
  path: string;
};

const labelFrom = (list: ICategory[], id: string | null | undefined): CategoryLabel => {
  const category = id ? list.find((c) => c._id === id) : undefined;
  // Kept as a real label rather than an empty string: a transaction whose category
  // was hard-deleted still has to render as *something* in a row.
  if (!category) return { name: "Uncategorised", isChild: false, childCount: 0, path: "Uncategorised" };

  const parent = category.parent ? list.find((c) => c._id === category.parent) : undefined;
  return {
    name: category.name,
    parentName: parent?.name,
    isChild: parent !== undefined,
    // Only a top-level category can have any — the tree is two deep, so this is
    // always 0 for a child and the count never has to recurse.
    childCount: parent ? 0 : list.filter((c) => c.parent === category._id).length,
    path: parent ? `${parent.name} › ${category.name}` : category.name,
  };
};

/**
 * How to name one category, reactive. Any row showing a single category uses this
 * and shows `parentName` alongside `name` — without it, "Groceries" and
 * "Food & Dining" look like the same kind of thing, and a budget set on one means
 * something quite different from a budget set on the other.
 */
export const useCategoryLabel = (id: string | null | undefined): CategoryLabel => {
  const list = useCategories();
  return useMemo(() => labelFrom(list, id), [list, id]);
};

/** Non-reactive form, for exports and toast copy. */
export const categoryLabel = (id: string | null | undefined): CategoryLabel =>
  labelFrom(useCategoryStore.getState().list, id);

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
  /** Omit for a top-level category; set to make this a sub-category of that id. */
  parent?: string | null;
  icon?: string;
  color?: string;
};

export const createCategory = async (draft: CategoryDraft): Promise<void> => {
  // `parent: null` is how the form says "top level", but the API's create schema is
  // `.strict()` and only accepts a string — so the key is dropped rather than sent.
  const { parent, ...rest } = draft;
  await post<ICategory>("/categories", parent ? { ...rest, parent } : rest);
  await useCategoryStore.getState().load();
};

// Neither `kind` nor `parent`: flipping the kind would reclassify every transaction
// already filed under it, turning spend into earnings retroactively — and re-parenting
// would move that history between two totals, so a month someone already read would
// quietly change. Both are decided once, at creation.
export const updateCategory = async (
  id: string,
  patchBody: { name?: string; icon?: string; color?: string }
): Promise<void> => {
  await patch<ICategory>(`/categories/${id}`, patchBody);
  await useCategoryStore.getState().load();
};

// Archived, not deleted — past transactions keep resolving to a real category.
// Archiving a parent archives its children too (the server cascades); the count comes
// back so the caller can say so rather than let sub-categories vanish unannounced.
export const archiveCategory = async (id: string): Promise<number> => {
  const result = await del<{ archivedChildren: number } | null>(`/categories/${id}`);
  await useCategoryStore.getState().load();
  return result?.archivedChildren ?? 0;
};
