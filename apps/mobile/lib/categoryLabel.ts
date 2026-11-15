import type { ICategory } from "@save-n-spend/types";

export type CategoryLabel = {
  name: string;
  /** Its parent's name, or undefined when it is itself top-level. */
  parentName?: string;
  /** True when this is a sub-category. */
  isChild: boolean;
  /** Sub-categories under it; 0 for a child. Load-bearing on a budget row: a limit on a
   *  category with children governs their spending too, and the row has to say so. */
  childCount: number;
  /** `"Food & Dining › Groceries"` for one-line contexts (exports, toasts). */
  path: string;
  /** Retired by the user. Named like a live one everywhere; only the detail sheet says so. */
  isArchived: boolean;
};

/** What pickers, budgets, filters and the manage screen offer. An API without
 *  `include=archived` sends no archived rows, so everything it sends is kept. */
export const liveOnly = (all: ICategory[]): ICategory[] => all.filter((c) => !c.isArchived);

/**
 * `all` holds archived categories too, so a row filed under one still prints its name.
 * `live` is the list the user can pick from; only it counts children.
 */
export const labelFrom = (all: ICategory[], live: ICategory[], id: string | null | undefined): CategoryLabel => {
  const category = id ? all.find((c) => c._id === id) : undefined;
  // A real label, not an empty string — a transaction whose category was hard-deleted
  // still has to render as something.
  if (!category) return { name: "Uncategorised", isChild: false, childCount: 0, path: "Uncategorised", isArchived: false };

  const parent = category.parent ? all.find((c) => c._id === category.parent) : undefined;
  return {
    name: category.name,
    parentName: parent?.name,
    isChild: parent !== undefined,
    // The tree is two deep, so this is always 0 for a child and never recurses.
    childCount: parent ? 0 : live.filter((c) => c.parent === category._id).length,
    path: parent ? `${parent.name} › ${category.name}` : category.name,
    isArchived: !!category.isArchived,
  };
};
