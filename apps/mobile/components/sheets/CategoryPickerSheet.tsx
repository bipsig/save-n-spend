import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import type { CategoryKind, ICategory } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { KEYBOARD_DONE_ID } from "@/components/ui/KeyboardDoneBar";
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

// Fixed height, so the sheet reads as nested over Add Transaction / Budgets instead of
// growing to near-full-height.
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
  // targets the top of the provider-wide queue, which is not reliably the caller.
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const categories = useCategories();

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The heading the new category sits under, or `null` for top-level. Set by which
  // affordance was tapped, never asked as a question.
  const [newParent, setNewParent] = useState<ICategory | null>(null);

  // Same shape the Manage Categories sheet uses — both render `CategoryForm`, so a
  // category created mid-transaction matches one created from settings.
  const emptyDraft: CategoryFormValue = { name: "", kind, parent: null, icon: "more", color: "accent" };
  const [draft, setDraft] = useState<CategoryFormValue>(emptyDraft);
  const patch = (next: Partial<CategoryFormValue>) => setDraft((prev) => ({ ...prev, ...next }));

  // Opening the form is what decides the parent: tapping "add here" inside a heading
  // answers the question by pointing at it, so the form needs no parent selector. A new
  // child starts out styled like its parent, as it does in settings.
  const startCreate = (parent: ICategory | null) => {
    haptics.tap();
    setNewParent(parent);
    setDraft({
      // What they searched for and didn't find is almost certainly the name they want.
      name: search.trim(),
      kind,
      parent: parent?._id ?? null,
      icon: (parent?.icon as IconName) ?? "more",
      color: (parent?.color as ColorToken) ?? "accent",
    });
    setError(null);
    setCreating(true);
  };

  // Search filters within groups but keeps the parent as context; excluded ids (the
  // budget overlap guard) drop out of the pickable set, though a parent can stay on as a
  // header when only some of its children are excluded.
  const groups = useMemo<Group[]>(() => {
    const term = search.trim().toLowerCase();
    const excluded = (id: string) => excludeIds?.has(id) ?? false;

    // The shared tree rather than a local `!c.parent` filter, so the picker and the
    // manage screen can't disagree, and an orphaned child is still offered.
    return buildCategoryTree(categories, kind)
      .map(({ parent, children }) => {
        const parentMatch = term === "" || parent.name.toLowerCase().includes(term);
        const kids = children.filter((c) => parentMatch || c.name.toLowerCase().includes(term));
        return {
          parent,
          // A search miss on the parent still keeps it tappable while the group shows.
          parentPickable: !excluded(parent._id),
          children: kids.filter((c) => !excluded(c._id)),
          visible: parentMatch || kids.length > 0,
        };
      })
      .filter((g) => g.visible && (g.parentPickable || g.children.length > 0))
      .map(({ parent, parentPickable, children }) => ({ parent, parentPickable, children }));
  }, [categories, kind, excludeIds, search]);

  // Both row levels go through here, so the haptic can't be missed on one of them.
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
        // Not selectable itself (e.g. already budgeted) — a plain grouping header.
        <AppText size="xs" weight="bold" color="inkDim" style={styles.headerLabel}>
          {parent.name.toUpperCase()}
        </AppText>
      )}

      {/* Renders even for a childless heading: the rail carries the "add here" row, the
          only thing telling a user this heading can take sub-categories. */}
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

        {/* Unboxed, unlike the rows above it: the same glass panel would make an action
            read as a fourth thing you can pick. */}
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
        // The picker's kind, never the draft's — the transaction decides it.
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
      haptics.error();
      setError(err instanceof Error ? err.message : "Couldn't create the category");
    }
    finally {
      setSaving(false);
    }
  };

  // Pinned footer, so the actions stay reachable while the form/tree scrolls.
  const footer = creating ? (
    <>
      {/* Here rather than inside the form, where it would render below a long icon grid
          the user has already scrolled past. */}
      {error && (
        <AppText size="xs" color="danger">
          {error}
        </AppText>
      )}
      {/* Tracks the draft's parent, so the button never says "category" over a form
          showing a sub-category. */}
      <Button
        label={categoryCtaLabel(false, draft.parent)}
        onPress={onCreate}
        loading={saving}
        disabled={draft.name.trim().length === 0}
      />
      <Button label="Back" variant="ghost" onPress={() => setCreating(false)} />
    </>
  ) : (
    // Each group carries its own "new under …" row, so this one is explicitly for a
    // heading that doesn't exist yet.
    <Button label="+ New top-level category" variant="secondary" onPress={() => startCreate(null)} />
  );

  return (
    // The tree and the form share one scroll view, so without `scrollResetKey` the form
    // opens at whatever offset the tree was left at.
    <AppSheet
      ref={innerRef}
      onDismiss={reset}
      scrollable
      snapPoints={SNAP_POINTS}
      footer={footer}
      scrollResetKey={creating ? "form" : "tree"}
    >
      {/* Only while picking — the create form leads with its own live preview. */}
      {!creating && (
        <AppText size="md" weight="black">
          Pick category
        </AppText>
      )}

      {creating ? (
        <View style={styles.createBlock}>
          <CategoryForm
            // From the prop, never the draft: the draft resets only on dismiss, so
            // switching the transaction to Income must not leave a stale form.
            value={{ ...draft, kind }}
            onChange={patch}
            // No `parentOptions`, so no selector: the tapped row already decided it, and
            // it shows as the breadcrumb over the preview.
            parent={newParent}
            // No kind toggle either — an expense can only be filed under an expense
            // category, so it would offer one the form behind this can't use.
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
              returnKeyType="done"
              inputAccessoryViewID={KEYBOARD_DONE_ID}
              style={styles.searchInput}
            />
          </View>

          {groups.length > 0 ? (
            <View style={styles.tree}>{groups.map(renderGroup)}</View>
          ) : (
            // With the tree filtered away every "new under …" row went with it, so the
            // empty state has to offer the route itself.
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
  // A left rail, tying the children to their parent above.
  rail: {
    marginLeft: 18,
    paddingLeft: 14,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.14)",
    gap: spacing.sm,
  },
  // No panel, so it reads as an action rather than a fourth pickable row. Padded to a
  // comfortable target anyway.
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
  // The form supplies its own field spacing; this matches the gap AppSheet gives the
  // picker's children.
  createBlock: {
    gap: spacing.md,
  },
});

export default CategoryPickerSheet;
