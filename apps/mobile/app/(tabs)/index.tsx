import { View } from "react-native"
import { AppText } from "../../components/ui/AppText"

const HomeScreen = () => {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <AppText weight="bold" size="xl">
        Home
      </AppText>
    </View>
  )
}

export default HomeScreen;