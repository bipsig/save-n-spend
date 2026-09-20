import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import Card from "@/components/data/Card";
import { useConnectivity } from "@/store/connectivity";
import { useAppZone } from "@/lib/zone";
import { spacing } from "@/theme";

const timeLabel = (instant: number, zone: string): string =>
  new Intl.DateTimeFormat("en-IN", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(instant);

// The one place every screen says the same honest thing: what's on screen right now is
// last-known, not live. Mounted once in ScreenScaffold rather than per-screen, the same
// way Toast is mounted once at the root — so no screen can forget to show it.
const OfflineBanner = () => {
  const offline = useConnectivity((s) => s.offline);
  const lastOnlineAt = useConnectivity((s) => s.lastOnlineAt);
  const zone = useAppZone();

  if (!offline) return null;

  return (
    <Card padded={false} style={styles.card}>
      <Icon name="cloudOff" size={14} color="inkDim" />
      <AppText size="xs" color="inkDim" weight="semibold" style={styles.text}>
        {lastOnlineAt ? `Offline — showing data from ${timeLabel(lastOnlineAt, zone)}` : "Offline — showing saved data"}
      </AppText>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  text: {
    flex: 1,
  },
});

export default OfflineBanner;
