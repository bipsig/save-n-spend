import { FlatList, ScrollView, StyleSheet, View } from "react-native";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import TransactionRow from "@/components/rows/TransactionRow";
import { transactions } from "@/lib/mock";
import { spacing } from "@/theme";
import { useState } from "react";
import { useCategories } from "@/lib/categories";
import Search from "@/components/ui/Search";
import Chip from "@/components/ui/Chip";
import GradientCard from "@/components/shell/GradientCard";
import { AppText } from "@/components/ui/AppText";
import formatMoney from "@/lib/money";
import EmptyState from "@/components/states/EmptyState";

type Props = {
  income: number,
  expense: number,
  savings: number
}

const Separator = () => <View style={styles.separator} />;

const TransactionsSummaryCard = ({
  income,
  expense,
  savings
}: Props) => {
  const currentMonth = new Date().toLocaleString('default', { month: "long"});
  const currentYear = new Date().getFullYear();
  // Spec month summary: violet-tinted glass · caps month label · 18/800 totals ·
  // hairline · net savings in pale green.
  return (
    <GradientCard gradient="brand" style={styles.summary}>
      <AppText color="inkDim" size="xs" weight="semibold" style={styles.summaryLabel}>
        {`${currentMonth} ${currentYear}`.toUpperCase()}
      </AppText>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCol}>
          <AppText color="inkDim" size="xs">
            Total Income
          </AppText>
          <AppText size="lg" weight="black">
            {formatMoney(income)}
          </AppText>
        </View>

        <View style={[styles.summaryCol, styles.summaryColRight]}>
          <AppText color="inkDim" size="xs">
            Total Expenses
          </AppText>
          <AppText size="lg" weight="black">
            {formatMoney(expense)}
          </AppText>
        </View>
      </View>

      <View style={styles.summaryDivider} />

      <View style={styles.netRow}>
        <AppText color="inkDim" size="xs">
          Net Savings
        </AppText>
        <AppText size="lg" weight="black" style={styles.netAmount}>
          {formatMoney(savings)}
        </AppText>
      </View>
    </GradientCard>
  )
}

const ActivityScreen = () => {
  const categories = useCategories();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  let filteredTransactions = activeCategory === "all" ? transactions : transactions.filter((transaction) => {
    return transaction.category === activeCategory
  })

  filteredTransactions = query === "" ? filteredTransactions : filteredTransactions.filter((transaction) => {
    return (transaction.title ?? "").toLowerCase().includes(query.trim().toLowerCase());
  })

  // amounts are positive; `type` gives direction. Income vs expense totals for the month.
  const income = transactions.filter(t => t.type === "income").reduce((total, t) => total + t.amount, 0);
  const expense = transactions.filter(t => t.type === "expense").reduce((total, t) => total + t.amount, 0);
  const savings = income - expense;

  return (
    <ScreenScaffold title="All Activity" scroll={false}>
      <Search
        value={query}
        onChangeText={setQuery}
        placeholder="Search transactions"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipRow}
      >
        <Chip
          key={"all"}
          label="All"
          selected={activeCategory === "all"}
          onPress={() => setActiveCategory("all")}
        />
        {categories.map((category) => (
          <Chip
            key={category._id}
            label={category.name}
            selected={activeCategory === category._id}
            onPress={() => setActiveCategory(category._id)}
          />
        ))}
      </ScrollView>

      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => <TransactionRow transaction={item} />}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <TransactionsSummaryCard 
            expense={expense}
            income={income}
            savings={savings}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="No Transactions"
            subtitle="Try a different search or filter"
          />
        }
        style={styles.list}
      />
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
  separator: {
    height: spacing.lg,
  },
  chipScroll: {
    flexGrow: 0, // keep the row at chip height; don't let it eat vertical space
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summary: {
    gap: 12, // spec .hero gap × device scale
    marginBottom: spacing.lg, // separate the header card from the first row
  },
  summaryLabel: {
    letterSpacing: 1.2, // spec .lbl caps tracking
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryCol: {
    gap: 3,
  },
  summaryColRight: {
    alignItems: "flex-end",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  netRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  netAmount: {
    color: "#8EFFC9", // spec — pale green net savings
  },
});

export default ActivityScreen;
