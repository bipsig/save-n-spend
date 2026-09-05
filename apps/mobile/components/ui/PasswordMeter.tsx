import { StyleSheet, View } from "react-native";
import { AppText } from "./AppText";
import { STRENGTH, strengthOf } from "@/lib/password";
import { colors, spacing } from "@/theme";

// The 0–4 strength bar shown under any field where a *new* password is chosen —
// Register and Change password. Renders nothing for an empty field, so it appears
// as feedback on what was typed rather than as a demand made up front.
const PasswordMeter = ({ password }: { password: string }) => {
  if (password.length === 0) return null;

  const score = strengthOf(password);
  const meter = STRENGTH[score];

  return (
    <View style={styles.meter}>
      <View style={styles.meterTrack}>
        <View
          style={[
            styles.meterFill,
            { width: `${(score / 4) * 100}%`, backgroundColor: colors[meter.color] },
          ]}
        />
      </View>
      <AppText size="xs" weight="semibold" color={meter.color}>
        {meter.tip}
      </AppText>
    </View>
  );
};

const styles = StyleSheet.create({
  meter: {
    gap: spacing.xs,
  },
  meterTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    borderRadius: 2,
  },
});

export default PasswordMeter;
