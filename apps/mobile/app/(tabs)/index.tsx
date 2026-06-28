import { StyleSheet, View } from "react-native";
import { AppText } from "../../components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import AppHeader from "@/components/shell/AppHeader";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import SummaryCard from "@/components/data/SummaryCard";
import HealthScoreCard from "@/components/data/HealthScoreCard";

const HomeScreen = () => {
  const [amount, setAmount] = useState("");

  return (
    <ScreenScaffold
      header={
        <AppHeader
          name="Sagnik"
          onBellPress={() => console.log("Bell pressed")}
        />
      }
    >
      <View style={styles.summaryStyles}>
        <SummaryCard
          icon="income"
          iconColor="success"
          iconBg="successSoft"
          label="Income"
          amount="Rs 52,500"
          caption="+12% vs last month"
          captionColor="success"
        />
        <SummaryCard
          icon="savings"
          iconColor="info"
          iconBg="infoSoft"
          label="Savings"
          amount="₹21,120"
          caption="40% saved"
          captionColor="info"
        />
      </View>

      <View>
        <HealthScoreCard
          score={85}
          rating="Excellent"
          stats={[
            { label: "Savings", value: "Good" },
            { label: "Budget", value: "On Track" },
            { label: "Debt", value: "Low" },
          ]}
        />
      </View>

      <Button
        label="Add Transaction"
        variant="primary"
        size="md"
        loading={false}
        disabled={false}
        onPress={() => console.log("Add Transaction")}
      />
      <Icon
        name="food"
        container="square"
        containerColor="accentSoft"
        color="primary"
      />

      <Input
        label="Amount"
        placeholder="0.00"
        keyboardType="email-address"
        value={amount}
        onChangeText={setAmount}
      />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  summaryStyles: {
    flexDirection: "row",
    gap: 12,
  },
});

export default HomeScreen;
