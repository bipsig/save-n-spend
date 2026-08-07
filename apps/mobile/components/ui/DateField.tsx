import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { AppText } from "./AppText";
import Icon from "./Icon";
import Button from "./Button";
import { colors } from "@/theme";

type Props = {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
};

const formatDate = (d: Date): string =>
  d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

const DateField = ({ label, value, onChange, minimumDate, maximumDate }: Props) => {
  const [show, setShow] = useState(false);

  // Android's native dialog reports "set"/"dismissed" and closes itself; iOS
  // drives a spinner inside our own modal that a Done button dismisses.
  const onAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    setShow(false);
    if (event.type === "set" && selected) onChange(selected);
  };

  const onIosChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (selected) onChange(selected);
  };

  return (
    <>
      <Pressable style={styles.row} onPress={() => setShow(true)}>
        <Icon name="date" size={18} color="inkDim" />
        <View style={styles.text}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
            {label}
          </AppText>
          <AppText size="sm" weight="bold">
            {formatDate(value)}
          </AppText>
        </View>
        <Icon name="chevronRight" size={20} color="inkDim" />
      </Pressable>

      {Platform.OS === "android" && show && (
        <DateTimePicker
          value={value}
          mode="date"
          onChange={onAndroidChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <Pressable style={styles.backdrop} onPress={() => setShow(false)} />
          <View style={styles.picker}>
            <DateTimePicker
              value={value}
              mode="date"
              display="spinner"
              onChange={onIosChange}
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              themeVariant="dark"
              textColor={colors.ink}
            />
            <Button label="Done" onPress={() => setShow(false)} />
          </View>
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  text: {
    flex: 1,
    gap: 2,
  },
  label: {
    letterSpacing: 1.3,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(8,6,15,0.55)",
  },
  picker: {
    backgroundColor: "#1B1530",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    gap: 12,
  },
});

export default DateField;
