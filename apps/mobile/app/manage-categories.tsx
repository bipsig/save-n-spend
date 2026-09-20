import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { GestureDetector, type PanGesture } from "react-native-gesture-handler";
import Animated, { LinearTransition } from "react-native-reanimated";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { ICategory } from "@save-n-spend/types";
import BackButton from "@/components/shell/BackButton";
import ReorderToggle from "@/components/shell/ReorderToggle";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import ManageRow from "@/components/rows/ManageRow";
import ConfirmSheet from "@/components/sheets/ConfirmSheet";
import EditCategorySheet from "@/components/sheets/EditCategorySheet";
import { AppText } from "@/components/ui/AppText";
import Button from "@/components/ui/Button";
import DragList from "@/components/ui/DragList";
import EmptyState from "@/components/states/EmptyState";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { archiveCategory, reorderCategories, useCategoryTree, type CategoryGroup } from "@/lib/categories";
import { countTransactionsIn } from "@/lib/transactions";
import { useCategoryStore } from "@/store/categories";
import { toast } from "@/store/toast";
import { pendingDeletes } from "@/store/pendingDeletes";
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
  // The parent a *new* category is filed under, set only by the "Sub-category" row inside
  // a group. Separate from `editing`, since both describe the sheet at once.
  const [newParent, setNewParent] = useState<ICategory | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ICategory | null>(null);
  // null while the count is still being fetched, so the confirm can say so rather
  // than claim zero.
  const [usageCount, setUsageCount] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);
  // A held row and a scrolling screen are the same gesture, so the scroll gives way.
  const [dragging, setDragging] = useState(false);

  const editRef = useRef<BottomSheetModal>(null);
  const deleteRef = useRef<BottomSheetModal>(null);

  // Counted per sibling set, since that is the only thing an order is compared within: one
  // expense category and one income category are two rows with nowhere to move.
  const canReorder =
    expenses.length > 1 ||
    income.length > 1 ||
    expenses.concat(income).some((g) => g.children.length > 1);

  // Other screens write to this store too (Add Transaction can create one), so refresh on
  // focus like every other data screen.
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
    // Fetched alongside the sheet's animation, so the tap responds immediately and the
    // number fills in a beat later.
    void countTransactionsIn(category._id)
      .then(setUsageCount)
      .catch(() => setUsageCount(null));
  };

  /**
   * Sends one sibling set in the order it was left in. `order` is only ever compared within
   * a set, so dragging a card moves it among the top-level categories of its own kind, and
   * dragging a row inside a card moves it among that one parent's children — the two never
   * mix, and the request carries exactly one of them.
   */
  const commitOrder = (ids: string[]) => {
    void reorderCategories(ids).catch((err) => toast.fromError(err, "Couldn't save that order"));
  };

  // One card per top-level category, not per kind: the card boundary IS the grouping, which
  // is what the rollup does. `layout` on each card so archiving a row shrinks its own group
  // and neighbours slide up rather than jumping a row-height in a frame.
  //
  // The card is itself a draggable item, so the gesture that moves it goes on its first row
  // only — the children have their own list, and a gesture covering the whole card would
  // swallow theirs.
  const renderGroup = (
    { parent, children }: CategoryGroup,
    { dragging: held, gesture }: { dragging: boolean; gesture: PanGesture }
  ) => (
    <Animated.View layout={reordering ? undefined : LinearTransition.duration(220)}>
      <Card padded={false} style={styles.group}>
        <GestureDetector gesture={gesture}>
          <View>
            <ManageRow
              first
              icon={(parent.icon ?? "wallet") as IconName}
              color={(parent.color ?? "accent") as ColorToken}
              label={parent.name}
              // Named as spending that rolls up, not a bare count — the number alone doesn't
              // say the children's totals land in this category's budget. Short, because two
              // action buttons narrow the row and longer phrasing truncates.
              sub={
                children.length === 0
                  ? undefined
                  : `${children.length} sub-categor${children.length === 1 ? "y" : "ies"} · rolls up here`
              }
              onEdit={() => openEdit(parent)}
              onDelete={() => openDelete(parent)}
              reordering={reordering}
              dragging={held}
            />
          </View>
        </GestureDetector>

        <DragList
          items={children}
          keyOf={(child) => child._id}
          enabled={reordering && children.length > 1}
          onReorder={commitOrder}
          onDragChange={setDragging}
          render={(child, _i, { dragging: childHeld, gesture: childGesture }) => (
            <GestureDetector gesture={childGesture}>
              <View>
                <ManageRow
                  nested
                  icon={(child.icon ?? "wallet") as IconName}
                  color={(child.color ?? "accent") as ColorToken}
                  label={child.name}
                  onEdit={() => openEdit(child)}
                  onDelete={() => openDelete(child)}
                  reordering={reordering}
                  dragging={childHeld}
                />
              </View>
            </GestureDetector>
          )}
        />

        {/* Sits inside the rail with the children, because that is where the thing it
            creates will appear. A "New" button in the header can only ever make a
            top-level category — this is the only affordance that says sub-categories
            exist at all, so it is on every group whether or not it has any yet.

            Hidden while reordering: nothing in that mode creates anything. */}
        {!reordering && (
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
        )}
      </Card>
    </Animated.View>
  );

  // Spelled out because "delete" does not mean "erase": the category is archived, so
  // transactions filed under it still resolve to a real name.
  const deleteBody = (() => {
    // A parent takes its children with it, which has to be said before the tap — the one
    // case where the row you aimed at is not the only one that disappears.
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
      scrollEnabled={!dragging}
      header={
        <View style={styles.head}>
          <BackButton />
          <AppText size="xl" weight="black" style={styles.headTitle}>
            Categories
          </AppText>
          <ReorderToggle active={reordering} onPress={() => setReordering((on) => !on)} disabled={!canReorder} />
          {/* Gone while reordering: the mode has one job, and the header has no room for
              a second action beside the tick that leaves it. */}
          {!reordering && <Button label="New" icon="add" pill onPress={openNew} />}
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
              <DragList
                items={expenses}
                keyOf={(group) => group.parent._id}
                enabled={reordering && expenses.length > 1}
                onReorder={commitOrder}
                onDragChange={setDragging}
                gap={spacing.xl}
                render={(group, _i, state) => renderGroup(group, state)}
              />
            </>
          )}
          {income.length > 0 && (
            <>
              <GroupLabel>INCOME</GroupLabel>
              <DragList
                items={income}
                keyOf={(group) => group.parent._id}
                enabled={reordering && income.length > 1}
                onReorder={commitOrder}
                onDragChange={setDragging}
                gap={spacing.xl}
                render={(group, _i, state) => renderGroup(group, state)}
              />
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
        onConfirm={() => {
          if (!pendingDelete) return;
          const key = `category:${pendingDelete._id}`;
          const name = pendingDelete.name;
          // childCount is already known client-side (deleteBody above computes it from
          // the tree already in memory) — the server's own echo of it only arrives once
          // the real archive commits, which is silent on success (see pendingDeletes.ts).
          const childCount = pendingDelete.parent === null
            ? (expenses.concat(income).find((g) => g.parent._id === pendingDelete._id)?.children.length ?? 0)
            : 0;
          pendingDeletes.schedule(key, name, () => archiveCategory(pendingDelete._id).then(() => {}));
          // "Archived", not "deleted", or the confirm's wording is undone by its own
          // receipt. Children counted in, because they go too.
          toast.action(
            "info",
            childCount === 0
              ? `${name} archived`
              : `${name} and ${childCount} sub-categor${childCount === 1 ? "y" : "ies"} archived`,
            { label: "Undo", onPress: () => pendingDeletes.cancel(key) }
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
  },
  // Aligned with the nested rows' rail, so it reads as the last item in the group.
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
