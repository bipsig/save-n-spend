import { View } from "react-native"
import { AppText } from "../../components/ui/AppText"

const TransactionsScreen = () => {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <AppText weight="bold" size="xl">
        Transactions
      </AppText>
    </View>
  )
}

export default TransactionsScreen;