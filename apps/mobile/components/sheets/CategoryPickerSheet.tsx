import { forwardRef, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheetModal, BottomSheetTextInput, useBottomSheetModal } from "@gorhom/bottom-sheet";
import type { CategoryKind, ICategory } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import Chip from "@/components/ui/Chip";
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

const CategoryPickerSheet = forwardRef<BottomSheetModal, Props>(({ kind, excludeIds, onPick }, ref) => {
  const { dismiss } = useBottomSheetModal();
  const categories = useCategories();

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newParent, setNewParent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentNames = useMemo(
    () => new Map(categories.map((c) => [c._id, c.name])),
    [categories]
  );

  // Top-level categories of this kind — the possible parents for a new sub-category.
  const parentOptions = useMemo(
    () => categories.filter((c) => c.kind === kind && !c.parent),
    [categories, kind]
  );

  const available = useMemo(() => {
    const term = search.trim().toLowerCase();
    return categories.filter(
      (c) =>
        c.kind === kind &&
        !excludeIds?.has(c._id) &&
        (term === "" || c.name.toLowerCase().includes(term))
    );
  }, [categories, kind, excludeIds, search]);

  const parents = available.filter((c) => !c.parent);
  const children = available.filter((c) => c.parent);

  const renderCard = (category: ICategory, isChild: boolean) => (
    <Pressable
      key={category._id}
      style={[styles.card, isChild && styles.childCard]}
      onPress={() => {
        onPick(category._id);
        dismiss();
      }}
    >
      <Icon
        name={(category.icon ?? "more") as IconName}
        size={isChild ? 15 : 18}
        containerSize={isChild ? 30 : 34}
        containerRadius={isChild ? 10 : 11}
        container="square"
        gradient={(category.color ?? "accent") as ColorToken}
      />
      <View style={styles.cardLabel}>
        {isChild && parentNames.has(category.parent ?? "") && (
          <AppText size="xs" color="inkDim" numberOfLines={1}>
            {parentNames.get(category.parent ?? "")}
          </AppText>
        )}
        <AppText size="sm" weight="bold" numberOfLines={1}>
          {category.name}
        </AppText>
      </View>
    </Pressable>
  );

  const reset = () => {
    setSearch("");
    setCreating(false);
    setNewName("");
    setNewParent(null);
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
          <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
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
              <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
                PARENT (OPTIONAL)
              </AppText>
              <View style={styles.parentRow}>
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

          {parents.length > 0 && (
            <>
              <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
                {kind === "expense" ? "EXPENSE CATEGORIES" : "INCOME CATEGORIES"}
              </AppText>
              <View style={styles.grid}>{parents.map((c) => renderCard(c, false))}</View>
            </>
          )}

          {children.length > 0 && (
            <>
              <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
                NARROW IT DOWN
              </AppText>
              <View style={styles.grid}>{children.map((c) => renderCard(c, true))}</View>
            </>
          )}

          {parents.length === 0 && children.length === 0 && (
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
  label: {
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
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  card: {
    flexBasis: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  childCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(255,255,255,0.07)",
  },
  cardLabel: {
    flex: 1,
    gap: 1,
  },
  createBlock: {
    gap: spacing.md,
  },
  parentRow: {
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
