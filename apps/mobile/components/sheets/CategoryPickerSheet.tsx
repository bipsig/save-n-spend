import { forwardRef, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput, useBottomSheetModal } from "@gorhom/bottom-sheet";
import type { CategoryKind, ICategory } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
import IconPicker from "@/components/ui/IconPicker";
import ColorPicker from "@/components/ui/ColorPicker";
import { useCategories } from "@/lib/categories";
import { useCategoryStore } from "@/store/categories";
import { post } from "@/lib/api";
import type { IconName } from "@/lib/icons";
import { colors, radius, spacing } from "@/theme";
import type { ColorToken } from "@/theme";

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
  const { dismiss } = useBottomSheetModal();
  const categories = useCategories();

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<string | null>(null);
  const [newIcon, setNewIcon] = useState<IconName>("more");
  const [newColor, setNewColor] = useState<ColorToken>("accent");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Top-level categories of this kind — the possible parents for a new sub-category.
  const parentOptions = useMemo(
    () => categories.filter((c) => c.kind === kind && !c.parent),
    [categories, kind]
  );

  // The tree: each top-level category with its children nested beneath it. Search
  // filters within groups but keeps the parent as context; excluded ids (budget
  // overlap guard) drop out of the pickable set, though a parent can still stay on
  // as a header when only some of its children are excluded.
  const groups = useMemo<Group[]>(() => {
    const term = search.trim().toLowerCase();
    const excluded = (id: string) => excludeIds?.has(id) ?? false;

    return categories
      .filter((c) => c.kind === kind && !c.parent)
      .map((parent) => {
        const parentMatch = term === "" || parent.name.toLowerCase().includes(term);
        const kids = categories.filter(
          (c) => c.parent === parent._id && (parentMatch || c.name.toLowerCase().includes(term))
        );
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

  const choose = (categoryId: string) => {
    onPick(categoryId);
    dismiss();
  };

  const renderGroup = ({ parent, parentPickable, children }: Group) => (
    <View key={parent._id} style={styles.group}>
      {parentPickable ? (
        <Pressable style={styles.parentRow} onPress={() => choose(parent._id)}>
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
        </Pressable>
      ) : (
        // Not selectable itself (e.g. already budgeted) — a plain header keeping
        // its still-pickable children grouped and legible.
        <AppText size="xs" weight="bold" color="inkDim" style={styles.headerLabel}>
          {parent.name.toUpperCase()}
        </AppText>
      )}

      {children.length > 0 && (
        <View style={styles.rail}>
          {children.map((child) => (
            <Pressable key={child._id} style={styles.childRow} onPress={() => choose(child._id)}>
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
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const reset = () => {
    setSearch("");
    setCreating(false);
    setNewName("");
    setNewParent(null);
    setNewIcon("more");
    setNewColor("accent");
    setError(null);
  };

  const onCreate = async () => {
    if (newName.trim().length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const created = await post<ICategory>("/categories", {
        name: newName.trim(),
        kind,
        icon: newIcon,
        color: newColor,
        ...(newParent ? { parent: newParent } : {}),
      });
      await useCategoryStore.getState().load();
      onPick(created._id);
      dismiss();
    }
    catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the category");
    }
    finally {
      setSaving(false);
    }
  };

  return (
    <AppSheet ref={ref} onDismiss={reset} scrollable>
      <AppText size="md" weight="black">
        Pick category
      </AppText>

      {creating ? (
        <View style={styles.createBlock}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.headerLabel}>
            NEW CATEGORY NAME
          </AppText>
          <BottomSheetTextInput
            placeholder="e.g. Subscriptions"
            placeholderTextColor={colors.gray400}
            value={newName}
            onChangeText={setNewName}
            style={styles.textInput}
            autoFocus
          />

          {parentOptions.length > 0 && (
            <>
              <AppText size="xs" weight="bold" color="inkDim" style={styles.headerLabel}>
                PARENT (OPTIONAL)
              </AppText>
              <View style={styles.parentRow2}>
                <Chip label="Top-level" selected={newParent === null} onPress={() => setNewParent(null)} />
                {parentOptions.map((parent) => (
                  <Chip
                    key={parent._id}
                    label={parent.name}
                    icon={parent.icon as IconName}
                    selected={newParent === parent._id}
                    onPress={() => setNewParent(parent._id)}
                  />
                ))}
              </View>
            </>
          )}

          <AppText size="xs" weight="bold" color="inkDim" style={styles.headerLabel}>
            ICON
          </AppText>
          <IconPicker value={newIcon} onChange={setNewIcon} />

          <AppText size="xs" weight="bold" color="inkDim" style={styles.headerLabel}>
            COLOUR
          </AppText>
          <ColorPicker value={newColor} onChange={setNewColor} />

          {error && (
            <AppText size="xs" color="danger">
              {error}
            </AppText>
          )}
          <Button label="Create category" onPress={onCreate} loading={saving} disabled={newName.trim().length === 0} />
          <Button label="Back" variant="ghost" onPress={() => setCreating(false)} />
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
            <AppText size="sm" color="inkDim">
              No categories match.
            </AppText>
          )}

          <Button label="+ Create new category" variant="secondary" onPress={() => setCreating(true)} />
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
  createBlock: {
    gap: spacing.md,
  },
  parentRow2: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  textInput: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: colors.ink,
    fontSize: 16,
  },
});

export default CategoryPickerSheet;
