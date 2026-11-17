import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import Card from "@/components/data/Card";
import { ServerWakingNotice } from "@/components/ui/ServerWakingStrip";
import OfflineBanner, { stripStyles } from "./OfflineBanner";
import { useConnectivity } from "@/store/connectivity";
import { useServerWaking } from "@/lib/api";
import { stacksAction, stripFor, type ScreenState } from "@/lib/screenStates";
import { spacing, touchTarget } from "@/theme";

export type ScreenStripInput = Pick<ScreenState, "error" | "hasData" | "refetch" | "refreshing" | "fetchedAt">;

// About 32 pt drawn; the slop takes the tap target to 44 pt without making the strip taller.
const SLOP = (touchTarget - 32) / 2;

/** D15 A: the data stays, this says the last refresh didn't land. Goes with the next success.
 *  At the accessibility text sizes "Try again" goes under the message (W-4). */
export const RefreshFailedStrip = ({ onRetry, busy = false }: { onRetry: () => void; busy?: boolean }) => {
  const stacked = stacksAction(useWindowDimensions().fontScale);
  const message = (
    <>
      <Icon name="alert" size={14} color="inkDim" />
      <AppText size="xs" color="inkDim" weight="semibold" style={stripStyles.text}>
        Couldn't refresh
      </AppText>
    </>
  );
  const action = (
    <AppText size="xs" color="accentLight" weight="bold" style={busy && styles.busy}>
      Try again
    </AppText>
  );

  return (
    <Pressable
      onPress={onRetry}
      disabled={busy}
      hitSlop={{ top: SLOP, bottom: SLOP }}
      accessibilityRole="button"
      accessibilityLabel="Couldn't refresh. Try again"
      accessibilityState={{ busy }}
    >
      {stacked ? (
        <Card padded={false} style={[stripStyles.card, styles.stacked]}>
          <View style={styles.row}>{message}</View>
          {action}
        </Card>
      ) : (
        <Card padded={false} style={stripStyles.card}>
          {message}
          {action}
        </Card>
      )}
    </Pressable>
  );
};

/** The one strip slot under the header: offline, else the server starting up, else a failed
 *  refresh. Without `states` it can only be the first two, as before 2.8.3. */
const ScreenStrip = ({ states }: { states?: ScreenStripInput }) => {
  const offline = useConnectivity((s) => s.offline);
  const waking = useServerWaking((s) => s.waking);

  switch (stripFor({ offline, waking, hasData: states?.hasData, error: states?.error })) {
    case "offline":
      return <OfflineBanner fetchedAt={states?.fetchedAt} />;
    case "waking":
      return <ServerWakingNotice />;
    case "refreshFailed":
      return <RefreshFailedStrip onRetry={() => void states!.refetch()} busy={states!.refreshing} />;
    default:
      return null;
  }
};

const styles = StyleSheet.create({
  busy: { opacity: 0.45 },
  stacked: { flexDirection: "column", alignItems: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "stretch" },
});

export default ScreenStrip;
