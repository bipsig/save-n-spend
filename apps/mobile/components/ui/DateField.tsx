import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { AppText } from "./AppText";
import Icon from "./Icon";
import Button from "./Button";
import PressableScale from "./PressableScale";
import { colors } from "@/theme";

type Mode = "date" | "datetime";

type Props = {
  label: string;
  value: Date;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  /** "datetime" adds a time step, so the row shows and sets both date and time. */
  mode?: Mode;
};

// Deliberately zone-less, unlike every other date label in the app: `value` is the
// native picker's own Date, whose fields ARE what the user spun the wheels to. Reading
// it in the account's zone would show a different day than the one just picked.
// Crossing into the account's zone happens on the way out, in `toZonedDayISO`.
const formatDate = (d: Date): string =>
  d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });

const formatTime = (d: Date): string =>
  d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

// Merge a picked time (hours/minutes) onto a picked date, so the datetime flow
// keeps both halves instead of one clobbering the other.
const withTime = (date: Date, time: Date): Date => {
  const merged = new Date(date);
  merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return merged;
};

const DateField = ({ label, value, onChange, minimumDate, maximumDate, mode = "date" }: Props) => {
  const [show, setShow] = useState(false);
  // Android has no combined datetime dialog — we chain date → time ourselves.
  const [androidStep, setAndroidStep] = useState<"date" | "time">("date");
  const [androidDate, setAndroidDate] = useState<Date | null>(null);

  const open = () => {
    setAndroidStep("date");
    setAndroidDate(null);
    setShow(true);
  };

  const onAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (event.type !== "set" || !selected) {
      setShow(false);
      setAndroidStep("date");
      return;
    }
    // Datetime: after the date, roll straight into the time dialog.
    if (mode === "datetime" && androidStep === "date") {
      setAndroidDate(selected);
      setAndroidStep("time");
      return;
    }
    const result =
      mode === "datetime" && androidDate ? withTime(androidDate, selected) : selected;
    onChange(result);
    setShow(false);
    setAndroidStep("date");
  };

  const onIosChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (selected) onChange(selected);
  };

  const display = mode === "datetime" ? `${formatDate(value)} · ${formatTime(value)}` : formatDate(value);

  return (
    <>
      {/* Same squeeze as every other selrow it sits among in the add forms. */}
      <PressableScale style={styles.row} onPress={open} scaleTo={0.98}>
        <Icon name="date" size={18} color="inkDim" />
        <View style={styles.text}>
          <AppText size="xs" weight="bold" color="inkDim" style={styles.label}>
            {label}
          </AppText>
          <AppText size="sm" weight="bold">
            {display}
          </AppText>
        </View>
        <Icon name="chevronRight" size={20} color="inkDim" />
      </PressableScale>

      {Platform.OS === "android" && show && (
        <DateTimePicker
          key={androidStep} // remount so the second (time) dialog opens
          value={androidStep === "time" && androidDate ? androidDate : value}
          mode={mode === "datetime" ? androidStep : "date"}
          onChange={onAndroidChange}
          minimumDate={androidStep === "date" ? minimumDate : undefined}
          maximumDate={androidStep === "date" ? maximumDate : undefined}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          {/* Tap-outside-to-close. Stays a plain Pressable: it's an invisible
              dismiss area, so there's nothing to squeeze and nothing to confirm. */}
          <Pressable style={styles.backdrop} onPress={() => setShow(false)} />
          <View style={styles.picker}>
            <DateTimePicker
              value={value}
              mode={mode}
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
