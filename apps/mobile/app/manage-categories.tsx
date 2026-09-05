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
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { archiveCategory, useCategoryTree, type CategoryGroup } from "@/lib/categories";
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
  const expenses = useCategoryTree("expense");
  const income = useCategoryTree("income");

  // The category the sheets are currently about. One state, two sheets: `editing`
  // is what the editor shows, `pendingDelete` is what the confirm names.
  const [editing, setEditing] = useState<ICategory | null>(null);
  // The parent a *new* category should be filed under, set only by the "Sub-category"
  // row inside a group. Separate from `editing` because both describe the sheet at
  // once: creating a child means no category to edit and a parent to inherit.
  const [newParent, setNewParent] = useState<ICategory | null>(null);
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
    setNewParent(null);
    editRef.current?.present();
  };

  const openNewChild = (parent: ICategory) => {
    setEditing(null);
    setNewParent(parent);
    editRef.current?.present();
  };

  const openEdit = (category: ICategory) => {
    setEditing(category);
    setNewParent(null);
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

  // One card per top-level category, rather than one card per kind. The card boundary
  // IS the grouping: it says "these belong together and their spend adds up here",
  // which is exactly what the rollup does. A single long card with indented rows left
  // the reader counting hairlines to find where one group stopped.
  //
  // `layout` on each card: archiving a row shrinks its own group, and neighbours slide
  // up rather than jumping a row-height in a frame.
  const renderGroup = ({ parent, children }: CategoryGroup) => (
    <Animated.View key={parent._id} layout={LinearTransition.duration(220)}>
      <Card padded={false} style={styles.group}>
        <ManageRow
          first
          icon={(parent.icon ?? "wallet") as IconName}
          color={(parent.color ?? "accent") as ColorToken}
          label={parent.name}
          // Named as spending that rolls up, not as a bare count: the number alone
          // doesn't tell you the children's totals land in this category's budget.
          // Kept short because the row is narrowed by two action buttons — the longer
          // phrasing truncated to "spending adds…", losing the half that mattered.
          sub={
            children.length === 0
              ? undefined
              : `${children.length} sub-categor${children.length === 1 ? "y" : "ies"} · rolls up here`
          }
          onEdit={() => openEdit(parent)}
          onDelete={() => openDelete(parent)}
        />

        {children.map((child) => (
          <ManageRow
            key={child._id}
            nested
            icon={(child.icon ?? "wallet") as IconName}
            color={(child.color ?? "accent") as ColorToken}
            label={child.name}
            onEdit={() => openEdit(child)}
            onDelete={() => openDelete(child)}
          />
        ))}

        {/* Sits inside the rail with the children, because that is where the thing it
            creates will appear. A "New" button in the header can only ever make a
            top-level category — this is the only affordance that says sub-categories
            exist at all, so it is on every group whether or not it has any yet. */}
        <PressableScale style={styles.addChild} onPress={() => openNewChild(parent)} scaleTo={0.98}>
          <Icon name="add" size={15} color="primary" />
          {/* Same words as the picker's equivalent row, and it names the heading in both.
              Redundant here, where the parent is the first row of this very card — but a
              user who learns the phrase in one place should not have to learn a second
              one for the identical action somewhere else. */}
          <AppText size="xs" weight="bold" color="primary" numberOfLines={1}>
            {`New under ${parent.name}`}
          </AppText>
        </PressableScale>
      </Card>
    </Animated.View>
  );

  // Spelled out because "delete" here does not mean "erase": the category is
  // archived so the transactions filed under it still resolve to a real name.
  const deleteBody = (() => {
    // A parent takes its children with it (the server cascades), and that has to be
    // said before the tap, not reported after — it is the one case where the row you
    // aimed at is not the only row that disappears.
    const childCount = pendingDelete && pendingDelete.parent === null
      ? (expenses.concat(income).find((g) => g.parent._id === pendingDelete._id)?.children.length ?? 0)
      : 0;
    const kids = childCount === 0
      ? ""
      : ` Its ${childCount} sub-categor${childCount === 1 ? "y goes" : "ies go"} with it.`;

    if (usageCount === null) return `Checking how many transactions use it…${kids}`;
    if (usageCount === 0) return `Nothing is filed under it, so it just disappears from your pickers.${kids}`;
    return `It disappears from your pickers, and the ${usageCount} transaction${usageCount === 1 ? "" : "s"} already filed under it keep their history.${kids}`;
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
      {expenses.length === 0 && income.length === 0 ? (
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
              {expenses.map(renderGroup)}
            </>
          )}
          {income.length > 0 && (
            <>
              <GroupLabel>INCOME</GroupLabel>
              {income.map(renderGroup)}
            </>
          )}
        </>
      )}

      <EditCategorySheet ref={editRef} category={editing} parent={newParent} />

      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title={`Delete ${pendingDelete?.name ?? "category"}?`}
        body={deleteBody}
        confirmLabel="Delete category"
        onConfirm={async () => {
          if (!pendingDelete) return;
          const archivedChildren = await archiveCategory(pendingDelete._id);
          // "Archived", not "deleted" — the word has to match what actually
          // happened, or the confirm's careful wording is undone by its own receipt.
          // The children are counted in, because they went too.
          toast.success(
            archivedChildren === 0
              ? `${pendingDelete.name} archived`
              : `${pendingDelete.name} and ${archivedChildren} sub-categor${archivedChildren === 1 ? "y" : "ies"} archived`
          );
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
    marginBottom: spacing.sm,
  },
  // Aligned with the nested rows' rail so it reads as the last item in the group
  // rather than as a footer for the whole card.
  addChild: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 24,
    paddingLeft: 30,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.14)",
  },
});

export default ManageCategoriesScreen;
