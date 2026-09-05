import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Animated, { LinearTransition } from "react-native-reanimated";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ICategory } from "@save-n-spend/types";
import BackButton from "@/components/shell/BackButton";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import ManageRow from "@/components/rows/ManageRow";
import ConfirmSheet from "@/components/sheets/ConfirmSheet";
import EditCategorySheet from "@/components/sheets/EditCategorySheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/states/EmptyState";
import { archiveCategory, useCategories } from "@/lib/categories";
import { countTransactionsIn } from "@/lib/transactions";
import { useCategoryStore } from "@/store/categories";
import { toast } from "@/store/toast";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

const GroupLabel = ({ children }: { children: string }) => (
  <AppText size="xs" weight="bold" color="inkDim" style={styles.groupLabel}>
    {children}
  </AppText>
);

const ManageCategoriesScreen = () => {
  const categories = useCategories();

  // The category the sheets are currently about. One state, two sheets: `editing`
  // is what the editor shows, `pendingDelete` is what the confirm names.
  const [editing, setEditing] = useState<ICategory | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ICategory | null>(null);
  // null while the count is still being fetched, so the confirm can say so rather
  // than claim zero.
  const [usageCount, setUsageCount] = useState<number | null>(null);

  const editRef = useRef<BottomSheetModal>(null);
  const deleteRef = useRef<BottomSheetModal>(null);

  // The list is a store other screens also write to (a new category from the Add
  // Transaction flow, say), so refresh on focus like every other data screen.
  useFocusEffect(
    useCallback(() => {
      void useCategoryStore.getState().load();
    }, [])
  );

  const openNew = () => {
    setEditing(null);
    editRef.current?.present();
  };

  const openEdit = (category: ICategory) => {
    setEditing(category);
    editRef.current?.present();
  };

  const openDelete = (category: ICategory) => {
    setPendingDelete(category);
    setUsageCount(null);
    deleteRef.current?.present();
    // Fetched alongside the sheet's own animation rather than before it, so the
    // tap gets an immediate response and the number fills in a beat later.
    void countTransactionsIn(category._id)
      .then(setUsageCount)
      .catch(() => setUsageCount(null));
  };

  const expenses = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");

  // `layout` on the card, not the rows: archiving one removes a row, and the card
  // has to shrink to match. Without it the list would jump a row-height in a frame.
  const renderGroup = (items: ICategory[]) => (
    <Animated.View layout={LinearTransition.duration(220)}>
      <Card padded={false} style={styles.group}>
        {items.map((category, i) => (
          <ManageRow
            key={category._id}
            first={i === 0}
            icon={(category.icon ?? "wallet") as IconName}
            color={(category.color ?? "accent") as ColorToken}
            label={category.name}
            onEdit={() => openEdit(category)}
            onDelete={() => openDelete(category)}
          />
        ))}
      </Card>
    </Animated.View>
  );

  // Spelled out because "delete" here does not mean "erase": the category is
  // archived so the transactions filed under it still resolve to a real name.
  const deleteBody = (() => {
    if (usageCount === null) return "Checking how many transactions use it…";
    if (usageCount === 0) return "Nothing is filed under it, so it just disappears from your pickers.";
    return `It disappears from your pickers, and the ${usageCount} transaction${usageCount === 1 ? "" : "s"} already filed under it keep their history.`;
  })();

  return (
    <ScreenScaffold
      header={
        <View style={styles.head}>
          <BackButton />
          <AppText size="xl" weight="black" style={styles.headTitle}>
            Categories
          </AppText>
          <Button label="New" icon="add" pill onPress={openNew} />
        </View>
      }
    >
      {categories.length === 0 ? (
        <EmptyState
          icon="category"
          title="No categories yet"
          subtitle="Categories are how spending gets grouped — add the first one to start sorting your transactions."
          actionLabel="New category"
          onAction={openNew}
        />
      ) : (
        <>
          {expenses.length > 0 && (
            <>
              <GroupLabel>EXPENSE</GroupLabel>
              {renderGroup(expenses)}
            </>
          )}
          {income.length > 0 && (
            <>
              <GroupLabel>INCOME</GroupLabel>
              {renderGroup(income)}
            </>
          )}
        </>
      )}

      <EditCategorySheet ref={editRef} category={editing} />

      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title={`Delete ${pendingDelete?.name ?? "category"}?`}
        body={deleteBody}
        confirmLabel="Delete category"
        onConfirm={async () => {
          if (!pendingDelete) return;
          await archiveCategory(pendingDelete._id);
          // "Archived", not "deleted" — the word has to match what actually
          // happened, or the confirm's careful wording is undone by its own receipt.
          toast.success(`${pendingDelete.name} archived`);
        }}
      />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headTitle: {
    flex: 1,
  },
  groupLabel: {
    letterSpacing: 1.5, // spec .flabel tracking
    paddingHorizontal: 2,
    marginTop: spacing.xs,
  },
  group: {
    paddingVertical: 2,
  },
});

export default ManageCategoriesScreen;
