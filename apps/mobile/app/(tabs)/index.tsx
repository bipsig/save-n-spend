import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppHeader from "@/components/shell/AppHeader";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import SummaryCard from "@/components/data/SummaryCard";
import HealthScoreCard from "@/components/data/HealthScoreCard";
import formatMoney from "@/lib/money";
import { dashboard } from "@/lib/mock";
import { gradients, spacing } from "@/theme";
import Icon from "@/components/ui/Icon";
import { useRouter } from "expo-router";

// Spec .fab — the one global action: glowing violet +, → Add Transaction.
const Fab = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} style={styles.fab} accessibilityLabel="Add transaction">
    <LinearGradient
      colors={[...gradients.brand]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={[StyleSheet.absoluteFill, styles.fabRound]}
      pointerEvents="none"
    />
    <Icon name="add" size={26} color="surface" />
  </Pressable>
);

const HomeScreen = () => {

  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const generateIncomeCaption = (_value: number): string => {
    // Logic to generate the caption
    return "+12% vs last month";
  };

  const generateSavingsCaption = (_value: number): string => {
    // Logic to generate the caption
    return "40% saved";
  };

  const generateExpensesCaption = (_value: number): string => {
    // Logic to generate the caption
    return "₹13,720 left";
  };

  const generateInvestmentsCaption = (_value: number): string => {
    // Logic to generate the caption
    return "+8.5% returns";
  };

  return (
    <ScreenScaffold
      header={
        <AppHeader
          name="Sagnik Das"
          onBellPress={() => console.log("Bell pressed")}
        />
      }
      floating={
        <View style={[styles.fabWrap, { bottom: bottom + spacing.lg }]}>
          <Fab onPress={() => router.push("/add-transaction")} />
        </View>
      }
    >
      <HealthScoreCard
        score={dashboard.healthScore}
        rating={dashboard.rating}
        stats={[
          { label: "Savings", value: "Good" },
          { label: "Budget", value: "On Track" },
          { label: "Debt", value: "Low" },
        ]}
      />

      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <SummaryCard
            icon="income"
            iconColor="success"
            iconBg="successSoft"
            label="Income"
            amount={formatMoney(dashboard.income)}
            caption={generateIncomeCaption(dashboard.income)}
            captionColor="success"
          />
          <SummaryCard
            icon="expenses"
            iconColor="danger"
            iconBg="dangerSoft"
            label="Expenses"
            amount={formatMoney(dashboard.expenses)}
            caption={generateExpensesCaption(dashboard.expenses)}
            captionColor="danger"
          />
        </View>

        <View style={styles.gridRow}>
          <SummaryCard
            icon="wallet"
            iconColor="info"
            iconBg="infoSoft"
            label="Savings"
            amount={formatMoney(dashboard.savings)}
            caption={generateSavingsCaption(dashboard.savings)}
            captionColor="info"
          />
          <SummaryCard
            icon="investments"
            iconColor="primary"
            iconBg="accentSoft"
            label="Investments"
            amount={formatMoney(dashboard.investments)}
            caption={generateInvestmentsCaption(dashboard.investments)}
            captionColor="success"
          />
        </View>
      </View>

    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  grid: {
    gap: 12, // spec .grid2 gap × device scale
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
  },
  fabWrap: {
    position: "absolute",
    right: 20,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    // spec: 0 8px 24px rgba(109,92,255,.55)
    shadowColor: "#6D5CFF",
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  fabRound: {
    borderRadius: 29,
  },
});

export default HomeScreen;
