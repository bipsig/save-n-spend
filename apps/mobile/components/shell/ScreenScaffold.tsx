import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "../ui/AppText";
import GlowBackground from "./GlowBackground";
import PeekButton from "./PeekButton";
import OfflineBanner from "./OfflineBanner";
import { colors, spacing } from "@/theme";

type Props = {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  header?: React.ReactNode;
  scroll?: boolean;
  /** Off while a row is being dragged, so the drag doesn't scroll the screen under it. */
  scrollEnabled?: boolean;
  /** Pull-to-refresh. Only meaningful with `scroll` (the default) — a screen that
   *  renders its own scroller (e.g. Activity's FlatList) wires RefreshControl itself. */
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  /** Rendered above the scroll content, pinned to the screen (e.g. the FAB). */
  floating?: React.ReactNode;
  children: React.ReactNode;
};

const ScreenScaffold = ({
  title,
  subtitle,
  headerRight,
  header,
  scroll = true,
  scrollEnabled = true,
  onRefresh,
  refreshing = false,
  floating,
  children,
}: Props) => {
  const { top, bottom } = useSafeAreaInsets();

  return (
    // Full-bleed dark ground + glow — no padding here, so the glow reaches the
    // screen edges. Padding lives on the inner content wrapper.
    <LinearGradient
      colors={["#151129", "#0C0A16"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
    >
      <GlowBackground />
      <View style={[styles.inner, { paddingTop: top, paddingBottom: bottom }]}>
        {header ? (
          header
        ) : (
          <View style={styles.titleBlock}>
            <View style={styles.titleRow}>
              {/* Spec .titlerow .t — 24 / 800 / −.02em */}
              <AppText weight="black" size="xl">
                {title}
              </AppText>
              {/* Every screen gets the eye, not just the dashboard: privacy mode masks
                  amounts app-wide, so a screen that hides figures without offering the
                  way to reveal them is a dead end. It renders nothing at all while
                  privacy mode is off, so this costs the other screens no space.
                  Screens passing a custom `header` have to include it themselves. */}
              <View style={styles.titleActions}>
                <PeekButton />
                {headerRight}
              </View>
            </View>
            {subtitle && (
              <AppText size="sm" color="inkDim">
                {subtitle}
              </AppText>
            )}
          </View>
        )}
        {/* Renders nothing while online — every screen built on this scaffold gets the
            offline notice for free, the same way every screen already gets PeekButton. */}
        <OfflineBanner />
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            scrollEnabled={scrollEnabled}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            refreshControl={
              onRefresh ? (
                // Tinted to the brand rather than left as the system default — a plain
                // black/white spinner over this ground reads as broken, not loading.
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                  progressBackgroundColor="#1B1730"
                />
              ) : undefined
            }
          >
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </View>
      {floating}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 20, // spec 15px screen padding × device scale
    gap: spacing.lg,
  },
  titleBlock: {
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.lg, // spec .ui-stack 12px rhythm × device scale
    paddingBottom: spacing.xl,
  },
});

export default ScreenScaffold;
