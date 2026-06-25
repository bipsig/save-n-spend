import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AppText } from "./components/ui/AppText";

export default function App() {
  return (
    // <View style={styles.container}>
    //   <Text>Hello World!</Text>
    //   <StatusBar style="auto" />
    // </View>
    <View style={{ flex: 1, backgroundColor: "#f7f8fa" }}>
      <View style={{ backgroundColor: "#615FFF", height: 60 }} />
      <View style={{ backgroundColor: "#00C950", height: 60 }} />
      <View style={{ backgroundColor: "#FB2C36", height: 60 }} />
      <Pressable
        onPress={() => console.log ('pressed')}
        style={({ pressed }) => ({
          backgroundColor: pressed ? '#4a4aff' : '#615fff',
          padding: 16,
          borderRadius: 12,
        })}
      >
        <Text style={{ color: "#fff", fontWeight: "bold"}}>
          Add Transaction
        </Text>
      </Pressable>
      <AppText weight="black" size="2xl">Save n Spend</AppText>
      <AppText weight="bold" size="md" color="#6A7282">Good morning, James</AppText>
      <AppText size="sm" color="#99A1AF">Your balance is up this week</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
