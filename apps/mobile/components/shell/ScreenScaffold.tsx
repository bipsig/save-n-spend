import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "../ui/AppText";
import { colors, spacing } from "@/theme";

type Props = {
  title?: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
};

const ScreenScaffold = ({
  title,
  subtitle,
  headerRight,
  header,
  children,
}: Props) => {
  const { top, bottom, left, right } = useSafeAreaInsets();
  const stylesPadding = {
    paddingTop: top,
    paddingBottom: bottom,
    paddingLeft: left,
    paddingRight: right,
  };

  return (
    <View style={[styles.container, stylesPadding]}>
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
