import { ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import GlowBackground from "./GlowBackground";
import ScreenStrip, { type ScreenStripInput } from "./ScreenStrip";
import { useScreenRefresh } from "./ScreenRefresh";
import ScreenHeader, { type HeaderAction } from "./ScreenHeader";
import { spacing, colors } from "@/theme";

type Props = {
  title?: string;
  subtitle?: string;
  /** `true` or "back" for the chevron, "close" on a modal. */
  back?: boolean | "back" | "close";
  onBack?: () => void;
  actions?: readonly HeaderAction[];
  /** Hide the privacy eye on a screen that shows no amounts. */
  peek?: boolean;
  /** For screens not yet moved onto `actions`. */
  headerRight?: React.ReactNode;
  /** Replaces the standard header entirely (Home's greeting row). Must include `PeekButton` itself. */
  header?: React.ReactNode;
  scroll?: boolean;
  /** Off while a row is being dragged, so the drag doesn't scroll the screen under it. */
  scrollEnabled?: boolean;
  /** The screen's fetch state: picks the strip under the header (offline with this data's
   *  age, the server starting up, or "Couldn't refresh"), and `refetch` becomes pull-to-refresh. */
  states?: ScreenStripInput;
  /** Pull-to-refresh, defaulting to `states.refetch`; the spinner runs until its promise settles.
   *  Only on the scaffold's own scroll view: a screen with its own list uses `useScreenRefresh`. */
  onRefresh?: () => unknown;
  /** Only for screens that still hold their own pull state. */
  refreshing?: boolean;
  /** Rendered above the scroll content, pinned to the screen (e.g. the FAB). */
  floating?: React.ReactNode;
  children: React.ReactNode;
};

const ScreenScaffold = ({
  title,
  subtitle,
  back,
  onBack,
  actions,
  peek,
  headerRight,
  header,
  scroll = true,
  scrollEnabled = true,
  states,
  onRefresh = states?.refetch,
  refreshing = false,
  floating,
  children,
}: Props) => {
  const { top, bottom } = useSafeAreaInsets();
  const refreshControl = useScreenRefresh(scroll ? onRefresh : undefined, refreshing);

  return (
    // Full-bleed dark ground + glow — no padding here, so the glow reaches the
    // screen edges. Padding lives on the inner content wrapper.
    <LinearGradient
      colors={[colors.bgDeep, colors.bg]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}
    >
      <GlowBackground />
      <View style={[styles.inner, { paddingTop: top, paddingBottom: bottom }]}>
        {header ?? (
          <ScreenHeader title={title} subtitle={subtitle} back={back} onBack={onBack} actions={actions} peek={peek}>
            {headerRight}
          </ScreenHeader>
        )}
        {/* One strip at most, nothing while all is well. Every scaffold screen gets it. */}
        <ScreenStrip states={states} />
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            scrollEnabled={scrollEnabled}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
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
  scroll: {
    flex: 1,
  },
  content: {
    // Fills the view on short content, so a pull that starts below it still refreshes.
    flexGrow: 1,
    gap: spacing.lg, // spec .ui-stack 12px rhythm × device scale
    paddingBottom: spacing.xl,
  },
});

export default ScreenScaffold;
