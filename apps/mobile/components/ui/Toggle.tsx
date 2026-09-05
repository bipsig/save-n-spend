import { Switch } from "react-native";
import { haptics } from "@/lib/haptics";
import { colors } from "@/theme";

type Props = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
};

// The platform switch in Midnight Glass colours. Deliberately the native control
// rather than a hand-rolled one: a settings toggle is where a user most expects
// the OS gesture (drag as well as tap) and the OS accessibility behaviour.
const Toggle = ({ value, onValueChange, disabled = false }: Props) => (
  <Switch
    value={value}
    // Every toggle in the app buzzes from here, so no screen has to remember to
    // add it — and a switch whose handler then fails still acknowledged the flip.
    onValueChange={(next) => {
      haptics.toggle();
      onValueChange(next);
    }}
    disabled={disabled}
    // On iOS `trackColor.true` is the on-tint and `ios_backgroundColor` shows
    // through in the off state — the default grey reads as a light-mode leftover
    // against the dark ground, so both are set.
    trackColor={{ false: "rgba(255,255,255,0.14)", true: colors.accent }}
    thumbColor={colors.surface}
    ios_backgroundColor="rgba(255,255,255,0.14)"
  />
);

export default Toggle;
