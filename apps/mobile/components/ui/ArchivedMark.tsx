import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Icon from "./Icon";
import { AppText } from "./AppText";
import { colors } from "@/theme";

// How an archived category is marked, everywhere one is shown: a badge on its icon chip, and
// an "Archived" pill after its name (or, in the detail sheet, a segment of its badge). One
// file so every place looks the same.

/** Follows an archived category's name. It never shrinks: the name beside it truncates first. */
export const ArchivedPill = () => (
  <View style={styles.pill}>
    <Icon name="archive" size={12} color="gray700" />
    <AppText weight="black" color="gray700" style={styles.caps}>ARCHIVED</AppText>
  </View>
);

/** The second half of the detail sheet's category badge: `GYM | ARCHIVED`. */
export const ArchivedBadgeSegment = () => (
  <View style={styles.segment}>
    <Icon name="archive" size={12} color="gray700" />
    <AppText weight="black" color="gray700" style={styles.caps}>ARCHIVED</AppText>
  </View>
);

/** A category's icon chip, with the archive badge on its corner when the category is archived.
 *  `chipSize` is the chip's box, so the badge scales with it. */
export const ArchivedChip = ({ archived, chipSize, children }: { archived: boolean; chipSize: number; children: ReactNode }) => {
  if (!archived) return <>{children}</>;
  const d = Math.max(14, Math.round(chipSize * 0.42));
  const ring = d >= 24 ? 3 : 2;
  return (
    <View>
      {children}
      <View
        style={[styles.corner, { width: d, height: d, borderRadius: d / 2, borderWidth: ring, right: -Math.round(d * 0.25), bottom: -Math.round(d * 0.25) }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Icon name="archive" size={Math.round(d * 0.58)} color="gray700" />
      </View>
    </View>
  );
};

/** A name and, when archived, the pill: the name gets the leftover width and truncates. */
export const NameWithArchived = ({ archived, children }: { archived: boolean; children: ReactNode }) =>
  archived ? <View style={styles.nameRow}>{children}<ArchivedPill /></View> : <>{children}</>;

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingLeft: 6,
    paddingRight: 8,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    flexShrink: 0,
  },
  segment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingLeft: 9,
    paddingRight: 12,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    flexShrink: 0,
  },
  caps: {
    fontSize: 11,
    letterSpacing: 0.8,
  },
  corner: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray300,
    borderColor: colors.bg,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
});
