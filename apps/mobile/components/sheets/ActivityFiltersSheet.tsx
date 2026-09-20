import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ICategory } from "@save-n-spend/types";
import AppSheet from "./AppSheet";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import Chip from "@/components/ui/Chip";
import Button from "@/components/ui/Button";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useCategories } from "@/lib/categories";
import { useAccounts } from "@/lib/accounts";
import type { IconName } from "@/lib/icons";
import type { FeedType } from "@/lib/transactions";
import type { ChipTint } from "@/theme/gradients";
import { spacing } from "@/theme";

export type TypeKey = "all" | FeedType;

export const TYPES: { key: TypeKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "expense", label: "Expense" },
  { key: "income", label: "Income" },
  { key: "transfer", label: "Transfers" },
];

type Props = {
  activeType: TypeKey;
  onChangeType: (t: TypeKey) => void;
  /** Single-select, like Type — one parent at a time. Its sub-categories (below) are
   *  scoped to whichever parent is active, so switching parents swaps the whole row
   *  rather than accumulating chips from several parents at once. */
  activeCategory: string | null;
  onChangeCategory: (id: string | null) => void;
  /** Multi-select, but only within the one active parent — "Fuel or Parking" under
   *  Transportation is a real question; "Fuel or Groceries" across two different
   *  parents isn't one this row is built to ask. */
  activeSubCategories: string[];
  onToggleSubCategory: (id: string) => void;
  /** Multi-select — "Cash or HDFC Bank" is a real question a filter should answer
   *  directly, and accounts have no parent/child structure to scope it by. */
  activeAccounts: string[];
  onToggleAccount: (id: string) => void;
  onClearAccounts: () => void;
  /** Live — reflects whatever's currently applied, updating as chips are tapped. */
  resultCount: number;
};

// Icon square + label + a live "what's picked" note, so the group reads at a glance
// without scanning its rows for which chips are lit.
const GroupHeader = ({
  icon, tint, label, current,
}: { icon: IconName; tint: ChipTint; label: string; current?: string }) => (
  <View style={styles.groupHead}>
    <Icon name={icon} size={14} containerSize={26} containerRadius={9} container="square" gradient={tint} />
    <AppText size="sm" weight="black">{label}</AppText>
    {current && (
      <AppText size="xs" color="inkDim" style={styles.current} numberOfLines={1}>
        {current}
      </AppText>
    )}
  </View>
);

// "Groceries, Fuel" for a couple of picks, "4 selected" once naming them all would
// crowd the header — the same shorthand a shopping app's filter summary uses.
const summarize = (ids: string[], nameOf: (id: string) => string | undefined): string | undefined => {
  if (ids.length === 0) return undefined;
  if (ids.length <= 2) return ids.map(nameOf).filter((n): n is string => !!n).join(", ");
  return `${ids.length} selected`;
};

// Type / Category / Account, all in one sheet — the exact three rows Activity used to
// keep permanently on screen, now reached with one tap instead of six stacked rows of
// clutter. Picking is live (every tap here filters immediately, same as the rows did) —
// this only relocates where the choice is made, not how it behaves.
const ActivityFiltersSheet = forwardRef<BottomSheetModal, Props>(({
  activeType, onChangeType,
  activeCategory, onChangeCategory,
  activeSubCategories, onToggleSubCategory,
  activeAccounts, onToggleAccount, onClearAccounts,
  resultCount,
}, ref) => {
  const innerRef = useRef<BottomSheetModal>(null);
  useImperativeHandle(ref, () => innerRef.current as BottomSheetModal);
  const dismiss = () => innerRef.current?.dismiss();

  const categories = useCategories();
  const accounts = useAccounts();

  // Scoped to the active type, since a category only ever belongs to one kind —
  // filtering Income by "Groceries" can only ever return nothing.
  const parents = useMemo(
    () => categories.filter((c) => !c.parent && (activeType === "all" || c.kind === activeType)),
    [categories, activeType]
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, ICategory[]>();
    for (const c of categories) {
      if (c.parent) map.set(c.parent, [...(map.get(c.parent) ?? []), c]);
    }
    return map;
  }, [categories]);
  // Only the active parent's own children — switching parents swaps this row
  // entirely rather than accumulating chips from whichever parent was picked before.
  const visibleChildren = activeCategory ? childrenByParent.get(activeCategory) ?? [] : [];

  const categorySummary = activeSubCategories.length > 0
    ? summarize(activeSubCategories, (id) => categories.find((c) => c._id === id)?.name)
    : (activeCategory ? categories.find((c) => c._id === activeCategory)?.name : undefined);
  const accountSummary = summarize(activeAccounts, (id) => accounts.find((a) => a._id === id)?.name);

  const clearAll = () => {
    onChangeType("all");
    onChangeCategory(null);
    onClearAccounts();
  };

  return (
    <AppSheet
      ref={innerRef}
      scrollable
      footer={<Button label={`Show ${resultCount} result${resultCount === 1 ? "" : "s"}`} onPress={dismiss} />}
    >
      <View style={styles.titleRow}>
        <AppText size="md" weight="black">Filters</AppText>
        {/* Not `disabled` when nothing's active — a no-op tap here costs nothing, and
            hiding it would mean measuring "is anything set" twice, once for this and
            once for the trigger button's own badge. */}
        <Button label="Clear all" variant="ghost" size="sm" icon="close" onPress={clearAll} />
      </View>

      <GroupHeader icon="activity" tint="violet" label="Type" />
      <SegmentedControl segments={TYPES} value={activeType} onChange={onChangeType} />

      <View style={styles.divider} />

      {/* A transfer has no category, so there is nothing here to narrow. */}
      {activeType !== "transfer" && (
        <>
          <GroupHeader icon="category" tint="green" label="Category" current={categorySummary} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Chip label="All" selected={activeCategory === null} onPress={() => onChangeCategory(null)} />
            {parents.map((parent) => (
              <Chip
                key={parent._id}
                label={parent.name}
                icon={parent.icon as IconName | undefined}
                selected={activeCategory === parent._id}
                onPress={() => onChangeCategory(parent._id)}
              />
            ))}
          </ScrollView>

          {visibleChildren.length > 0 && (
            <>
              <AppText size="xs" color="inkDim" style={styles.subLabel}>Sub-categories</AppText>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {visibleChildren.map((child) => (
                  <Chip
                    key={child._id}
                    label={child.name}
                    icon={child.icon as IconName | undefined}
                    selected={activeSubCategories.includes(child._id)}
                    onPress={() => onToggleSubCategory(child._id)}
                  />
                ))}
              </ScrollView>
            </>
          )}

          <View style={styles.divider} />
        </>
      )}

      <GroupHeader icon="wallet" tint="blue" label="Account" current={accountSummary} />
      {accounts.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Chip label="All" selected={activeAccounts.length === 0} onPress={onClearAccounts} />
          {accounts.map((acc) => (
            <Chip
              key={acc._id}
              label={acc.name}
              icon={acc.icon as IconName | undefined}
              selected={activeAccounts.includes(acc._id)}
              onPress={() => onToggleAccount(acc._id)}
            />
          ))}
        </ScrollView>
      )}
    </AppSheet>
  );
});

ActivityFiltersSheet.displayName = "ActivityFiltersSheet";

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: spacing.sm,
  },
  current: {
    marginLeft: "auto",
  },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  subLabel: {
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginVertical: spacing.md,
  },
});

export default ActivityFiltersSheet;
