import { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
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
import AddBillSheet from "@/components/sheets/AddBillSheet";
import formatMoney from "@/lib/money";
import { useBills, groupBills, outstandingTotal, isActionable } from "@/lib/bills";
import { radius, spacing } from "@/theme";

const Section = ({ label, bills, onPick }: { label: string; bills: IBill[]; onPick: (bill: IBill) => void }) => {
  if (bills.length === 0) return null;
  return (
    <View style={styles.section}>
      <AppText size="xs" weight="bold" color="inkDim" style={styles.sectionLabel}>
        {label}
      </AppText>
      {bills.map((bill) => (
        <BillRow key={bill._id} bill={bill} onPress={isActionable(bill) ? () => onPick(bill) : undefined} />
      ))}
    </View>
  );
};

const BillsScreen = () => {
  const { items, loading, error, refetch } = useBills();

  const markRef = useRef<BottomSheetModal>(null);
  const addRef = useRef<BottomSheetModal>(null);
  const [active, setActive] = useState<IBill | null>(null);

  useFocusEffect(useCallback(() => {
    refetch();
  }, [refetch]));

  const onPick = (bill: IBill) => {
    setActive(bill);
    markRef.current?.present();
  };

  const headerRight = (
    <Button label="+ Add Bill" pill size="sm" onPress={() => addRef.current?.present()} />
  );

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
          onAction={() => addRef.current?.present()}
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

          <Section label="OVERDUE" bills={groups.overdue} onPick={onPick} />
          <Section label="UPCOMING" bills={groups.upcoming} onPick={onPick} />
          <Section label="PAID THIS MONTH" bills={groups.paid} onPick={onPick} />
        </>
      )}

      <MarkPaidSheet ref={markRef} bill={active} onChanged={refetch} />
      <AddBillSheet ref={addRef} onChanged={refetch} />
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
