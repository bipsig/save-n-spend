import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useFocusEffect } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { IBill } from "@save-n-spend/types";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import BillRow from "@/components/rows/BillRow";
import { AppText } from "@/components/ui/AppText";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import MarkPaidSheet from "@/components/sheets/MarkPaidSheet";
import EditBillSheet from "@/components/sheets/EditBillSheet";
import ConfirmSheet from "@/components/sheets/ConfirmSheet";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import { useBills, groupBills, outstandingTotal, isActionable, deleteBill } from "@/lib/bills";
import { toast } from "@/store/toast";
import { radius, spacing } from "@/theme";

type SectionProps = {
  label: string;
  bills: IBill[];
  onPick: (bill: IBill) => void;
  onEdit: (bill: IBill) => void;
  onDelete: (bill: IBill) => void;
};

const Section = ({ label, bills, onPick, onEdit, onDelete }: SectionProps) => {
  if (bills.length === 0) return null;
  return (
    <View style={styles.section}>
      <AppText size="xs" weight="bold" color="inkDim" style={styles.sectionLabel}>
        {label}
      </AppText>
      {bills.map((bill) => (
        // Every row is editable and deletable, including a paid one: a wrong amount is
        // worth correcting for next cycle, and the row body's own action is what a paid
        // bill has nothing left of.
        <Animated.View key={bill._id} layout={LinearTransition.duration(220)}>
          <BillRow
            bill={bill}
            onPress={isActionable(bill) ? () => onPick(bill) : undefined}
            onEdit={() => onEdit(bill)}
            onDelete={() => onDelete(bill)}
          />
        </Animated.View>
      ))}
    </View>
  );
};

const BillsScreen = () => {
  usePrivacyMask(); // subscribe: a peek has to re-render the amounts computed below
  const { items, loading, error, refetch } = useBills();

  const markRef = useRef<BottomSheetModal>(null);
  const editRef = useRef<BottomSheetModal>(null);
  const deleteRef = useRef<BottomSheetModal>(null);
  // Three separate targets, not one "selected bill": the delete confirm has to keep
  // naming its bill while the editor for another is being opened behind it.
  const [active, setActive] = useState<IBill | null>(null);
  const [editing, setEditing] = useState<IBill | null>(null);
  const [removing, setRemoving] = useState<IBill | null>(null);

  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  const onPick = (bill: IBill) => {
    setActive(bill);
    markRef.current?.present();
  };

  const onEdit = (bill: IBill) => {
    setEditing(bill);
    editRef.current?.present();
  };

  const onDelete = (bill: IBill) => {
    setRemoving(bill);
    deleteRef.current?.present();
  };

  // `null` first: the same sheet edits, so a stale target would open it on the last
  // bill that was edited.
  const openAdd = () => {
    setEditing(null);
    editRef.current?.present();
  };

  const headerRight = <Button label="+ Add Bill" pill size="sm" onPress={openAdd} />;

  if (error) {
    return (
      <ScreenScaffold title="Bills" headerRight={headerRight}>
        <ErrorState message={error} onRetry={refetch} />
      </ScreenScaffold>
    );
  }

  if (loading && items.length === 0) {
    return (
      <ScreenScaffold title="Bills" headerRight={headerRight}>
        <View style={styles.skeletonCol}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonState key={i} height={72} borderRadius={radius.lg} />
          ))}
        </View>
      </ScreenScaffold>
    );
  }

  const groups = groupBills(items);
  const { total, pending, overdue } = outstandingTotal(items);

  return (
    <ScreenScaffold title="Bills" headerRight={headerRight}>
      {items.length === 0 ? (
        <EmptyState
          icon="bills"
          title="No bills yet"
          subtitle="Add a recurring bill and never miss a due date."
          actionLabel="Add a bill"
          onAction={openAdd}
        />
      ) : (
        <>
          <Card style={styles.strip}>
            <AppText size="xs" weight="bold" color="inkDim" style={styles.sectionLabel}>
              OUTSTANDING THIS MONTH
            </AppText>
            <AppText size="2xl" weight="black">
              {formatMoney(total)}
            </AppText>
            <View style={styles.counts}>
              <Badge label={`${pending} pending`} status="pending" size="sm" />
              {overdue > 0 && <Badge label={`${overdue} overdue`} status="overdue" size="sm" />}
            </View>
          </Card>

          <Section label="OVERDUE" bills={groups.overdue} onPick={onPick} onEdit={onEdit} onDelete={onDelete} />
          <Section label="UPCOMING" bills={groups.upcoming} onPick={onPick} onEdit={onEdit} onDelete={onDelete} />
          <Section label="PAID THIS MONTH" bills={groups.paid} onPick={onPick} onEdit={onEdit} onDelete={onDelete} />
        </>
      )}

      <MarkPaidSheet ref={markRef} bill={active} onChanged={refetch} />
      <EditBillSheet ref={editRef} bill={editing} onChanged={refetch} />

      <ConfirmSheet
        ref={deleteRef}
        icon="delete"
        title={`Delete ${removing?.name ?? "bill"}?`}
        // Says what survives, because a bill that has been paid before looks like it is
        // holding that history: it isn't. The payments are transactions in their own right.
        body="The reminder stops and the bill leaves this list. Any payment you already recorded stays in your transactions, so your balances and totals don't move."
        confirmLabel="Delete bill"
        onConfirm={async () => {
          if (!removing) return;
          await deleteBill(removing._id);
          refetch();
          toast.success(`${removing.name} deleted`);
        }}
      />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  strip: {
    gap: spacing.sm,
  },
  counts: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    letterSpacing: 1.3,
  },
  skeletonCol: {
    gap: spacing.lg,
  },
});

export default BillsScreen;
