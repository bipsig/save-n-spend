import { StyleSheet, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { AppText } from "./AppText";
import { colors } from "@/theme";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  placeholder?: string;
};

// The ₹-prefixed, centered hero amount field shared by amount-first form sheets
// (Add Bill, Edit Limit). Controlled — pair it with an RHF Controller.
const AmountHeroInput = ({ value, onChangeText, onBlur, placeholder = "0" }: Props) => (
  <View style={styles.row}>
    <AppText size="lg" weight="bold" color="inkDim" style={styles.cur}>
      ₹
    </AppText>
    <BottomSheetTextInput
      placeholder={placeholder}
      placeholderTextColor={colors.gray400}
      value={value}
      onChangeText={onChangeText}
      onBlur={onBlur}
      keyboardType="decimal-pad"
      style={styles.input}
    />
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cur: {
    marginRight: 4,
    marginBottom: 8,
  },
  input: {
    color: colors.ink,
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: -1,
    minWidth: 120,
    textAlign: "center",
  },
});

export default AmountHeroInput;
