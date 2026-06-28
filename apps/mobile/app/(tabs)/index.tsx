import { View } from "react-native";
import { AppText } from "../../components/ui/AppText";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import Input from "@/components/ui/Input";
import { useState } from "react";
import Badge from "@/components/ui/Badge";
import AppHeader from "@/components/shell/AppHeader";
import ScreenScaffold from "@/components/shell/ScreenScaffold";

const HomeScreen = () => {
  const [amount, setAmount] = useState("");

  return (
    <ScreenScaffold
      header={
        <AppHeader name="Sagnik" onBellPress={() => console.log("Bell pressed")} />
      }
    >
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

export default HomeScreen;