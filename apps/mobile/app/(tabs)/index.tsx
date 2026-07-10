import { Pressable, StyleSheet, View } from "react-native";
import AppHeader from "@/components/shell/AppHeader";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import SummaryCard from "@/components/data/SummaryCard";
import HealthScoreCard from "@/components/data/HealthScoreCard";
import formatMoney, { parseMoney } from "@/lib/money";
import { dashboard } from "@/lib/mock";
import { spacing } from "@/theme";
import Icon from "@/components/ui/Icon";
import { AppText } from "@/components/ui/AppText";
import { useRouter } from "expo-router";

const HomeScreen = () => {

  const router = useRouter();
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
        <Pressable
          onPress={() => {
            console.log("Pressed");
            console.log (parseMoney("₹1233"));
            router.push("/add-transaction");
          }}
        >
          <AppText>
            Click Here
          </AppText>
        </Pressable>
      </View>

    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  grid: {
    gap: spacing.md,
  },
  gridRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
});

export default HomeScreen;
