import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { ITitleSuggestion } from "@save-n-spend/types";
import { AppText } from "../ui/AppText";
import Icon from "../ui/Icon";
import PressableScale from "../ui/PressableScale";
import SectionHeader from "../ui/SectionHeader";
import { useCategoryById } from "@/lib/categories";
import { useTitleSuggestionStore } from "@/store/titleSuggestions";
import formatMoney, { usePrivacyMask } from "@/lib/money";
import type { IconName } from "@/lib/icons";
import type { ColorToken } from "@/theme";
import { spacing } from "@/theme";

/** How many habitual transactions to shortcut — enough to be useful, not so many the
 *  row reads as a wall rather than a shortcut (mirrors CHIP_LIMIT in lib/titleSuggestions). */
const CHIP_LIMIT = 6;

const QuickLogChip = ({ suggestion }: { suggestion: ITitleSuggestion }) => {
  const category = useCategoryById(suggestion.category);
  const amountLabel = formatMoney(suggestion.lastAmount);

  return (
    <PressableScale
      style={styles.chip}
      scaleTo={0.95}
      onPress={() => router.push({ pathname: "/add-transaction", params: { repeatId: suggestion.lastTransactionId } })}
      accessibilityRole="button"
      accessibilityLabel={`Log ${suggestion.title}, ${amountLabel}`}
      accessibilityHint="Prefills a new transaction for this amount and category."
    >
      <Icon
        name={(category?.icon ?? "more") as IconName}
        size={15}
        containerSize={30}
        containerRadius={9}
        container="square"
        gradient={(category?.color ?? "accent") as ColorToken}
      />
      <AppText size="xs" weight="bold" numberOfLines={1} style={styles.title}>
        {suggestion.title}
      </AppText>
      <AppText size="xs" weight="semibold" color="inkDim">
        {amountLabel}
      </AppText>
    </PressableScale>
  );
};

// The most frequent recent expense titles as tap-to-log shortcuts — reuses the exact
// existing "Log again" mechanism (add-transaction's `repeatId` param), so this is a new
// consumer, not a new save path. Deliberately expense-only: an income repeated on a whim
// is a real backfill need Add Transaction already serves, not a daily habit to shortcut.
const QuickLogRow = () => {
  usePrivacyMask(); // subscribe: each chip's label below reads formatMoney() directly
  const list = useTitleSuggestionStore((s) => s.list);

  const top = [...list]
    .filter((s) => s.type === "expense")
    .sort((a, b) => b.count - a.count)
    .slice(0, CHIP_LIMIT);

  // No suggestions yet (brand-new account) — nothing to shortcut, so nothing to show.
  if (top.length === 0) return null;

  return (
    <View style={styles.section}>
      <SectionHeader label="QUICK LOG" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {top.map((s) => (
          <QuickLogChip key={`${s.title}:${s.category ?? ""}`} suggestion={s} />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingRight: spacing.md, // hints at more when the row scrolls
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  title: {
    maxWidth: 110,
  },
});

export default QuickLogRow;
