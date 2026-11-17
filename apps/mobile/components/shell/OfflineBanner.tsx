import { StyleSheet } from "react-native";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import Card from "@/components/data/Card";
import { useConnectivity } from "@/store/connectivity";
import { useAppZone } from "@/lib/zone";
import { offlineBannerText } from "@/lib/offlineBanner";
import { spacing } from "@/theme";

type Props = {
  /** When this screen's data was fetched (D18 A). Without it the banner says when the app was last online. */
  fetchedAt?: number | null;
};

// Drawn by ScreenStrip under every ScreenScaffold header, so no screen can forget it.
const OfflineBanner = ({ fetchedAt }: Props) => {
  const offline = useConnectivity((s) => s.offline);
  const lastOnlineAt = useConnectivity((s) => s.lastOnlineAt);
  const zone = useAppZone();

  if (!offline) return null;

  return (
    <Card padded={false} style={styles.card}>
      <Icon name="cloudOff" size={14} color="inkDim" />
      <AppText size="xs" color="inkDim" weight="semibold" style={styles.text}>
        {offlineBannerText(fetchedAt, lastOnlineAt, zone)}
      </AppText>
    </Card>
  );
};

export const stripStyles = StyleSheet.create({
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
const styles = stripStyles;

export default OfflineBanner;
