import { useRef, useState } from "react";
import { SectionList, StyleSheet, View } from "react-native";
import type { IBill } from "@save-n-spend/types";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import BillRow from "@/components/rows/BillRow";
import Card from "@/components/data/Card";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import EmptyState from "@/components/states/EmptyState";
import MarkPaidSheet from "@/components/sheets/MarkPaidSheet";
import AddBillSheet from "@/components/sheets/AddBillSheet";
import { AppText } from "@/components/ui/AppText";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { bills } from "@/lib/mock";
import formatMoney from "@/lib/money";
import { spacing } from "@/theme";

type BillSection = { title: string; data: IBill[] };

type StripProps = {
  amount: number;
  pending: number;
  overdue: number;
};

const OutstandingStrip = ({ amount, pending, overdue }: StripProps) => (
  <Card style={styles.strip}>
    <AppText size="xs" weight="bold" color="inkDim" style={styles.stripLabel}>
      OUTSTANDING THIS MONTH
    </AppText>
    <View style={styles.stripRow}>
      <AppText size="xl" weight="black">
        {formatMoney(amount)}
      </AppText>
      <View style={styles.counts}>
        {pending > 0 && <Badge label={`${pending} pending`} status="pending" size="sm" />}
        {overdue > 0 && <Badge label={`${overdue} overdue`} status="overdue" size="sm" />}
      </View>
    </View>
  </Card>
);

const Separator = () => <View style={styles.separator} />;

const BillsScreen = () => {
  // Local copy so Mark-paid can flip a row's status (server behavior in the mock).
  const [billList, setBillList] = useState<IBill[]>(bills);
  const [activeBill, setActiveBill] = useState<IBill | null>(null);
  const markPaidRef = useRef<BottomSheetModal>(null);
  const addBillRef = useRef<BottomSheetModal>(null);

  const openMarkPaid = (bill: IBill) => {
    setActiveBill(bill);
    markPaidRef.current?.present();
  };
  const handlePaid = (billId: string) =>
    setBillList((list) => list.map((b) => (b._id === billId ? { ...b, status: "paid" } : b)));

  const overdueBills = billList.filter((b) => b.status === "overdue");
  const upcomingBills = billList
    .filter((b) => b.status === "pending")
    .sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate)); // soonest first
  const paidBills = billList.filter((b) => b.status === "paid");

  const outstandingAmount = [...overdueBills, ...upcomingBills].reduce(
    (sum, b) => sum + b.amount,
    0
  );

  const sections: BillSection[] = [
    { title: "Overdue", data: overdueBills },
    { title: "Upcoming", data: upcomingBills },
    { title: "Paid", data: paidBills },
  ].filter((s) => s.data.length > 0);

  return (
    <ScreenScaffold
      title="Bills"
      scroll={false}
      headerRight={
        <Button label="Add Bill" icon="add" pill onPress={() => addBillRef.current?.present()} />
      }
    >
      <SectionList
        sections={sections}
        keyExtractor={(item) => item._id}
        renderItem={({ item, section }) => (
          <View style={section.title === "Paid" && styles.dim}>
            <BillRow bill={item} onMarkPaid={() => openMarkPaid(item)} />
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <AppText
            size="xs"
            weight="bold"
            color={section.title === "Overdue" ? "danger" : "inkDim"}
            style={styles.sectionHeader}
          >
            {section.title.toUpperCase()}
          </AppText>
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={<OutstandingStrip amount={outstandingAmount} pending={upcomingBills.length} overdue={overdueBills.length} />}
        ListEmptyComponent={
          <EmptyState
            icon="bills"
            title="No bills yet"
            subtitle="Add a bill to track what's due and never miss a payment."
          />
        }
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        style={styles.list}
      />

      <MarkPaidSheet ref={markPaidRef} bill={activeBill} onPaid={handlePaid} />
      <AddBillSheet ref={addBillRef} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  strip: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stripLabel: {
    letterSpacing: 1.3,
  },
  stripRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  counts: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  sectionHeader: {
    letterSpacing: 1.3,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  separator: {
    height: spacing.md,
  },
  dim: {
    opacity: 0.55,
  },
});

export default BillsScreen;
