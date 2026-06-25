import { View } from "react-native"
import { AppText } from "../../components/ui/AppText"

const SettingsScreen = () => {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <AppText weight="bold" size="xl">
        Settings
      </AppText>
    </View>
  )
}

export default SettingsScreen;