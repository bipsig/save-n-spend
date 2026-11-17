import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "../ui/AppText";
import IconButton from "../ui/IconButton";
import BackButton from "./BackButton";
import PeekButton from "./PeekButton";
import { headerActionIcon, orderHeaderActions, titleFontSize, type HeaderAction } from "@/lib/screenHeader";
import { fontSize, spacing } from "@/theme";

export type { HeaderAction } from "@/lib/screenHeader";

export type ScreenHeaderProps = {
  title?: string;
  subtitle?: string;
  /** `true` or "back" for the chevron, "close" for a modal's ✕. None by default (tabs). */
  back?: boolean | "back" | "close";
  /** Defaults to `goBackOrHome`. Override where leaving needs a confirm first. */
  onBack?: () => void;
  /** Drawn as icon circles in one fixed order, New last. */
  actions?: readonly HeaderAction[];
  /** The eye shows by default (it hides itself with privacy mode off). */
  peek?: boolean;
  /** Controls not yet moved onto `actions`, drawn after the eye. */
  children?: React.ReactNode;
};

const ScreenHeader = ({ title, subtitle, back = false, onBack, actions = [], peek = true, children }: ScreenHeaderProps) => (
  <View style={styles.block}>
    <View style={styles.row}>
      {back && <BackButton variant={back === "close" ? "close" : "back"} onPress={onBack} />}
      <View style={styles.title}>{!!title && <HeaderTitle key={title} title={title} />}</View>
      {peek && <PeekButton />}
      {children}
      {orderHeaderActions(actions).map((action) => (
        <IconButton
          key={`${action.kind}:${action.label}`}
          icon={headerActionIcon(action)}
          tone={action.kind === "new" ? "brand" : "glass"}
          selected={action.selected}
          disabled={action.disabled}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        />
      ))}
    </View>
    {!!subtitle && (
      <AppText size="sm" color="inkDim">
        {subtitle}
      </AppText>
    )}
  </View>
);

// iOS ignores minimumFontScale here and shrinks far below 24 pt, so the title is measured at
// 30 pt off screen, sized to fit (24 pt at the least), then truncated with "…". Keyed by the
// title, so a new string is measured afresh.
const HeaderTitle = ({ title }: { title: string }) => {
  const [box, setBox] = useState(0);
  const [natural, setNatural] = useState(0);
  const size = titleFontSize(natural, box, fontSize.xl);
  return (
    <View onLayout={(e) => setBox(e.nativeEvent.layout.width)}>
      <AppText
        weight="black"
        size="xl"
        numberOfLines={1}
        ellipsizeMode="tail"
        // Hidden for the frame before it's measured, so it never shows at the wrong size.
        style={{ fontSize: size, letterSpacing: -0.02 * size, opacity: natural > 0 && box > 0 ? 1 : 0 }}
        accessibilityRole="header"
      >
        {title}
      </AppText>
      <View style={styles.measure} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <AppText weight="black" size="xl" numberOfLines={1} onTextLayout={(e) => setNatural(e.nativeEvent.lines[0]?.width ?? 0)}>
          {title}
        </AppText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  block: { gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  // minWidth 0 lets the title give way to the actions instead of pushing them off screen.
  title: { flex: 1, minWidth: 0 },
  measure: { position: "absolute", left: 0, top: 0, width: 4000, height: 0, overflow: "hidden", opacity: 0 },
});

export default ScreenHeader;
