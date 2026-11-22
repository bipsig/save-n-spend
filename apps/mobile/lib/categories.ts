import { useMemo } from "react";
import type { CategoryKind, ICategory } from "@save-n-spend/types";
import type { ColorToken } from "@/theme";
import { useCategoryStore } from "@/store/categories";
import { usePendingDeletes } from "@/store/pendingDeletes";
import { patch, post, type RequestOptions } from "@/lib/api";
import { applyOrder, persistOrder } from "@/lib/reorder";
import { labelFrom, type CategoryLabel } from "@/lib/categoryLabel";

// Categories are DB entities (defaults + the user's own), fetched into the categories
// store after login. These helpers read that store — reactive hooks for render, a sync
// lookup for imperative code.

// The live list, reactive. Filtered against pending deletes here — not just at
// manage-categories — so `useCategoryTree()` (which composes this) and every picker
// built on it agree the instant a delete is confirmed, not just its own list.
export const useCategories = (): ICategory[] => {
  const list = useCategoryStore((s) => s.list);
  const pending = usePendingDeletes((s) => s.keys);
  return useMemo(() => list.filter((c) => !pending.has(`category:${c._id}`)), [list, pending]);
};

// One category by id, reactive. Archived ones resolve too: this is how a row names what it
// was filed under, and pickers read `useCategories()` instead.
export const useCategoryById = (id: string | null | undefined): ICategory | undefined =>
  useCategoryStore((s) => (id ? s.all.find((c) => c._id === id) : undefined));

// NON-reactive form, for imperative code outside render.
export const categoryById = (id: string | null): ICategory | undefined =>
  id ? useCategoryStore.getState().all.find((c) => c._id === id) : undefined;

// Categories are two levels deep. Spend on a child rolls into its parent everywhere a
// total is shown, so "Groceries" and "Food & Dining" are not siblings and must never be
// drawn as if they were. Every surface that names a category goes through these helpers.

export type CategoryGroup = {
  parent: ICategory;
  children: ICategory[];
};

/**
 * The list as a tree, both levels keeping the store's order. Children whose parent is
 * missing — archived out from under them, or still loading — are promoted to top level
 * rather than dropped, since hiding one is how a picker silently loses rows.
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

export type { CategoryLabel } from "@/lib/categoryLabel";

/**
 * How to name one category, reactive. Rows show `parentName` alongside `name`: without
 * it, "Groceries" and "Food & Dining" look like the same kind of thing, and a budget set
 * on one means something quite different from a budget set on the other.
 */
export const useCategoryLabel = (id: string | null | undefined): CategoryLabel => {
  const all = useCategoryStore((s) => s.all);
  const live = useCategories();
  return useMemo(() => labelFrom(all, live, id), [all, live, id]);
};

/** Non-reactive form, for exports and toast copy. */
export const categoryLabel = (id: string | null | undefined): CategoryLabel => {
  const { all, list } = useCategoryStore.getState();
  return labelFrom(all, list, id);
};

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

// Each mutation refetches, so every screen reading the store sees the change on its next
// focus without knowing a category was edited.

export type CategoryDraft = {
  name: string;
  kind: CategoryKind;
  /** Omit for a top-level category; set to make this a sub-category of that id. */
  parent?: string | null;
  icon?: string;
  color?: string;
};

/** The body `createCategory` posts, so a form can key the exact request. `parent: null` is
 *  how the form says "top level", but the API's create schema is `.strict()` and takes only a
 *  string, so the key is dropped rather than sent as null. */
export const categoryCreateBody = (draft: CategoryDraft) => {
  const { parent, ...rest } = draft;
  return parent ? { ...rest, parent } : rest;
};

export const createCategory = async (draft: CategoryDraft, opts?: RequestOptions): Promise<void> => {
  await post<ICategory>("/categories", categoryCreateBody(draft), opts);
  await useCategoryStore.getState().load();
};

// Neither `kind` nor `parent` is editable: flipping the kind would turn past spend into
// earnings, and re-parenting would move that history between two totals, quietly changing
// a month someone already read. Both are decided once, at creation.
export const updateCategory = async (
  id: string,
  patchBody: { name?: string; icon?: string; color?: string }
): Promise<ICategory> => {
  const saved = await patch<ICategory>(`/categories/${id}`, patchBody);
  await useCategoryStore.getState().load();
  return saved;
};

/**
 * Writes one sibling set's order — the top-level categories of a kind, or one parent's
 * children — as `ids` reads front to back. Must be the whole set: the server ranks by
 * position in the array, so a partial list leaves the rows it omits colliding with the ones
 * it sets.
 *
 * The store moves first and does NOT refetch on success. A tap that has to wait out a round
 * trip before the row moves does not read as dragging something, and the order is the client's
 * own answer anyway — there is nothing to learn from asking for it back.
 */
export const reorderCategories = async (ids: string[]): Promise<void> => {
  useCategoryStore.setState((s) => ({ list: applyOrder(s.list, ids) }));

  try {
    await persistOrder("/categories/reorder", ids);
  } catch (error) {
    // The list on screen is now a claim the server never accepted. Refetch rather than undo:
    // more taps may have landed since, so the state to go back to is the server's, not the
    // one this call started from.
    await useCategoryStore.getState().load().catch(() => {});
    throw error;
  }
};

