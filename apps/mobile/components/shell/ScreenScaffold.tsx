import { ScrollView, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "../ui/AppText";
import GlowBackground from "./GlowBackground";
import { spacing } from "@/theme";

type Props = {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  header?: React.ReactNode;
  scroll?: boolean;
  children: React.ReactNode;
};

const ScreenScaffold = ({
  title,
  subtitle,
  headerRight,
  header,
  scroll = true,
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
              <AppText weight="black" size="2xl">
                {title}
              </AppText>
              {headerRight}
            </View>
            {subtitle && (
              <AppText size="sm" color="gray500">
                {subtitle}
              </AppText>
            )}
          </View>
        )}
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          children
        )}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  titleBlock: {
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
});

export default ScreenScaffold;
