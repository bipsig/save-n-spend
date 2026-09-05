import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { CategoryKind, ICategory } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import CategoryForm, { categoryCtaLabel, type CategoryFormValue } from "@/components/ui/CategoryForm";
import PressableScale from "@/components/ui/PressableScale";
import { buildCategoryTree, useCategories } from "@/lib/categories";
import { useCategoryStore } from "@/store/categories";
import { post } from "@/lib/api";
import { haptics } from "@/lib/haptics";
import type { IconName } from "@/lib/icons";
import { colors, radius, spacing } from "@/theme";
import type { ColorToken } from "@/theme";

// Fixed height so the sheet reads as nested over Add Transaction / Budgets and
// opens from the top instead of dynamically growing to near-full-height.
const SNAP_POINTS = ["78%"];

type Props = {
  kind: CategoryKind;
  excludeIds?: Set<string>;
  onPick: (categoryId: string) => void;
};

type Group = {
  parent: ICategory;
  parentPickable: boolean; // false = shown only as a grouping header (e.g. already budgeted)
  children: ICategory[]; // pickable children only
};

const CategoryPickerSheet = forwardRef<BottomSheetModal, Props>(({ kind, excludeIds, onPick }, ref) => {
  // Own handle, so `dismiss` closes *this* picker. `useBottomSheetModal().dismiss()`
  // targets the top of the provider-wide queue instead, which — while this picker
  // sits over the form that opened it — is not reliably the caller.
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const categories = useCategories();

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The heading the new category will sit under, or `null` for a top-level one. Set by
  // which affordance was tapped, never asked as a question — see `startCreate`.
  const [newParent, setNewParent] = useState<ICategory | null>(null);

  // The draft, in the same shape the Manage Categories sheet uses — both render
  // `CategoryForm`, so a category created mid-transaction is created the same way and
  // with the same wording as one created from settings.
  const emptyDraft: CategoryFormValue = { name: "", kind, parent: null, icon: "more", color: "accent" };
  const [draft, setDraft] = useState<CategoryFormValue>(emptyDraft);
  const patch = (next: Partial<CategoryFormValue>) => setDraft((prev) => ({ ...prev, ...next }));

  // Opening the form is what decides the parent — the tree above already shows every
  // heading with its children, so tapping "add here" inside one answers the question by
  // pointing at it. The alternative, a chip per heading inside the form, made the user
  // re-read a list they had just scrolled past and grew a row every time they added a
  // category. A new child starts out styled like its parent, as it does in settings.
  const startCreate = (parent: ICategory | null) => {
    haptics.tap();
    setNewParent(parent);
    setDraft({
      // Whatever they searched for and didn't find is almost certainly the name they
      // want, and retyping it is the kind of small insult that makes a flow feel long.
      name: search.trim(),
      kind,
      parent: parent?._id ?? null,
      icon: (parent?.icon as IconName) ?? "more",
      color: (parent?.color as ColorToken) ?? "accent",
    });
    setError(null);
    setCreating(true);
  };

  // The tree: each top-level category with its children nested beneath it. Search
  // filters within groups but keeps the parent as context; excluded ids (budget
  // overlap guard) drop out of the pickable set, though a parent can still stay on
  // as a header when only some of its children are excluded.
  const groups = useMemo<Group[]>(() => {
    const term = search.trim().toLowerCase();
    const excluded = (id: string) => excludeIds?.has(id) ?? false;

    // Built from the shared tree rather than a local `!c.parent` filter, so the picker
    // and the manage screen can never disagree about what sits where — and so a child
    // whose parent is missing from the list is still offered, instead of being dropped
    // along with the group it can no longer be drawn inside.
    return buildCategoryTree(categories, kind)
      .map(({ parent, children }) => {
        const parentMatch = term === "" || parent.name.toLowerCase().includes(term);
        const kids = children.filter((c) => parentMatch || c.name.toLowerCase().includes(term));
        return {
          parent,
          // Selectable unless the overlap guard excludes it; a search miss on the
          // parent still keeps it tappable as long as the group is visible.
          parentPickable: !excluded(parent._id),
          children: kids.filter((c) => !excluded(c._id)),
          visible: parentMatch || kids.length > 0,
        };
      })
      .filter((g) => g.visible && (g.parentPickable || g.children.length > 0))
      .map(({ parent, parentPickable, children }) => ({ parent, parentPickable, children }));
  }, [categories, kind, excludeIds, search]);

  // Both row levels go through here, so the tick lives here too and neither can be
  // missed. `select` rather than a tap: this is landing on one item out of a tree.
  const choose = (categoryId: string) => {
    haptics.select();
    onPick(categoryId);
    dismiss();
  };

  const renderGroup = ({ parent, parentPickable, children }: Group) => (
    <View key={parent._id} style={styles.group}>
      {parentPickable ? (
        <PressableScale style={styles.parentRow} onPress={() => choose(parent._id)} scaleTo={0.98} haptic={false}>
          <Icon
            name={(parent.icon ?? "more") as IconName}
            size={18}
            containerSize={36}
            containerRadius={11}
            container="square"
            gradient={(parent.color ?? "accent") as ColorToken}
          />
          <AppText size="sm" weight="bold" style={styles.rowLabel} numberOfLines={1}>
            {parent.name}
          </AppText>
        </PressableScale>
      ) : (
        // Not selectable itself (e.g. already budgeted) — a plain header keeping
        // its still-pickable children grouped and legible.
        <AppText size="xs" weight="bold" color="inkDim" style={styles.headerLabel}>
          {parent.name.toUpperCase()}
        </AppText>
      )}

      {/* The rail renders even for a childless heading, because it carries the "add
          here" affordance — which is the only thing that tells a user this heading can
          take sub-categories at all. */}
      <View style={styles.rail}>
        {children.map((child) => (
          <PressableScale key={child._id} style={styles.childRow} onPress={() => choose(child._id)} scaleTo={0.98} haptic={false}>
            <Icon
              name={(child.icon ?? "more") as IconName}
              size={15}
              containerSize={30}
              containerRadius={10}
              container="square"
              gradient={(child.color ?? "accent") as ColorToken}
            />
            <AppText size="sm" weight="semibold" style={styles.rowLabel} numberOfLines={1}>
              {child.name}
            </AppText>
          </PressableScale>
        ))}

        {/* Deliberately unboxed, unlike the rows above it: this is an action inside the
            group, and giving it the same glass panel would make it read as a fourth
            thing you can pick. Names the heading, so the consequence of tapping is on
            the control rather than discovered afterwards. */}
        <PressableScale style={styles.addRow} onPress={() => startCreate(parent)} scaleTo={0.97} haptic={false}>
          <Icon name="add" size={15} color="primary" />
          <AppText size="xs" weight="bold" color="primary" numberOfLines={1}>
            {`New under ${parent.name}`}
          </AppText>
        </PressableScale>
      </View>
    </View>
  );

  const reset = () => {
    setSearch("");
    setCreating(false);
    setNewParent(null);
    setDraft(emptyDraft);
    setError(null);
  };

  const onCreate = async () => {
    const trimmed = draft.name.trim();
    if (trimmed.length < 2) {
      haptics.error();
      setError("Give the category a name of at least two characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await post<ICategory>("/categories", {
        name: trimmed,
        // Always the picker's kind, never the draft's: the form locks type here because
        // the transaction being added is what decides it.
        kind,
        icon: draft.icon,
        color: draft.color,
        ...(draft.parent ? { parent: draft.parent } : {}),
      });
      await useCategoryStore.getState().load();
      onPick(created._id);
      dismiss();
    }
    catch (err) {
      // Kept in the footer beside the button that failed — the name, icon, and colour
      // the user just chose are all still on screen, and the reason belongs with them.
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't create the category");
    }
    finally {
      setSaving(false);
    }
  };

  // Actions live in the sheet's pinned footer so they stay reachable while the
  // form/tree scrolls; the error sits with them.
  const footer = creating ? (
    <>
      {/* Kept in the pinned footer rather than passed to the form, where it would render
          below a long icon grid the user has scrolled past — beside the button that
          failed is where the reason belongs. */}
      {error && (
        <AppText size="xs" color="danger">
          {error}
        </AppText>
      )}
      {/* Tracks the draft's parent, so the button never says "category" while the form
          above it is showing a sub-category being filed under a heading. */}
      <Button
        label={categoryCtaLabel(false, draft.parent)}
        onPress={onCreate}
        loading={saving}
        disabled={draft.name.trim().length === 0}
      />
      <Button label="Back" variant="ghost" onPress={() => setCreating(false)} />
    </>
  ) : (
    // The top-level route. Each group in the tree carries its own "new under …" row, so
    // this one is explicitly for a heading that doesn't exist yet — named so it isn't
    // mistaken for the generic "add a category" button it used to be.
    <Button label="+ New top-level category" variant="secondary" onPress={() => startCreate(null)} />
  );

  return (
    // The tree and the create form are different content in the same scroll view, so
    // without this the form opens at whatever offset the tree was left at — typically
    // below its own name field.
    <AppSheet
      ref={innerRef}
      onDismiss={reset}
      scrollable
      snapPoints={SNAP_POINTS}
      footer={footer}
      scrollResetKey={creating ? "form" : "tree"}
    >
      {/* Only while picking. The create form leads with its own live preview, which
          names what is being made — a title above it just says it twice. */}
      {!creating && (
        <AppText size="md" weight="black">
          Pick category
        </AppText>
      )}

      {creating ? (
        <View style={styles.createBlock}>
          <CategoryForm
            // `kind` comes from the prop, never the draft: the draft is only reset on
            // dismiss, so a user who closes the picker and switches the transaction to
            // Income would otherwise see a form still describing money going out.
            value={{ ...draft, kind }}
            onChange={patch}
            // No `parentOptions`, so no selector: the parent came from the row that was
            // tapped and is shown as the breadcrumb over the preview instead.
            parent={newParent}
            // Type is settled before the sheet ever opens: an expense transaction can
            // only be filed under an expense category, so offering the toggle here would
            // offer a category the form behind this one can't use.
            kindNote={`Matches the ${kind} you're adding.`}
          />
        </View>
      ) : (
        <>
          <View style={styles.searchBox}>
            <Icon name="search" size={18} color="gray500" />
            <BottomSheetTextInput
              placeholder="Search categories"
              placeholderTextColor={colors.gray400}
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
            />
          </View>

          {groups.length > 0 ? (
            <View style={styles.tree}>{groups.map(renderGroup)}</View>
          ) : (
            // A search with no hits is the most likely moment someone wants a new
            // category, and with the tree filtered away every "new under …" row has gone
            // with it — so the empty state has to offer the route itself.
            <AppText size="sm" color="inkDim">
              {`No categories match “${search.trim()}”. Create it below, or clear the search to file it under a heading.`}
            </AppText>
          )}
        </>
      )}
    </AppSheet>
  );
});

CategoryPickerSheet.displayName = "CategoryPickerSheet";

const styles = StyleSheet.create({
  headerLabel: {
    letterSpacing: 1.3,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
  },
  tree: {
    gap: spacing.md,
  },
  group: {
    gap: spacing.sm,
  },
  parentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  // The children sit under a left rail — a vertical connector that visually ties
  // them to their parent above.
  rail: {
    marginLeft: 18,
    paddingLeft: 14,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.14)",
    gap: spacing.sm,
  },
  // No panel and no icon, so it sits in the rail as an action rather than a fourth
  // pickable row. Padded to a comfortable target anyway.
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  rowLabel: {
    flex: 1,
  },
  // The form supplies its own field spacing; this only sets the rhythm between its
  // blocks, matching the gap AppSheet gives the picker's own children.
  createBlock: {
    gap: spacing.md,
  },
});

export default CategoryPickerSheet;
