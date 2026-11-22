import { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import Avatar from "@/components/ui/Avatar";
import Caps from "@/components/ui/Caps";
import Icon from "@/components/ui/Icon";
import PressableScale from "@/components/ui/PressableScale";
import { AppText } from "@/components/ui/AppText";
import { moneyItems, appItems, screenTitles } from "@/data/menu";
import type { MoreItem } from "@/data/menu";
import { budgetTotals, useBudgets } from "@/lib/budgets";
import { outstandingTotal, useBills } from "@/lib/bills";
import { goalsSummary, useGoals } from "@/lib/goals";
import { initialsOf } from "@/lib/profile";
import { mergeScreenStates } from "@/lib/screenStates";
import { formatPct } from "@/lib/format/pct";
import { useSession } from "@/store/session";
import { spacing, colors, withAlpha } from "@/theme";
import type { ColorToken } from "@/theme";
import LogoutSheet from "@/components/sheets/LogoutSheet";

// One destination row (spec .srow): 28px gradient chip · 12.5/700 label ·
// live status value + chevron on the right. Rows stack inside ONE glass card,
// separated by hairlines — never by margins.
const MenuRow = ({
  item,
  value,
  valueColor = "inkDim",
  first = false,
}: {
  item: MoreItem;
  value?: string;
  valueColor?: ColorToken;
  first?: boolean;
}) => (
  // Shallow, like every other full-width row: a deeper squeeze opens a visible gap
  // beside the card's edge and reads as a rendering glitch rather than a press.
  <PressableScale
    onPress={() => router.push(item.path)}
    scaleTo={0.985}
    accessibilityLabel={value ? `${item.label}, ${value}` : item.label}
  >
    <View style={[styles.row, !first && styles.rowDivider]}>
      <Icon
        name={item.icon}
        size={17}
        containerSize={34}
        containerRadius={11}
        container="square"
        gradient={item.tint}
      />
      <AppText weight="bold" size="sm" style={styles.rowLabel}>
        {item.label}
      </AppText>
      {value && (
        <AppText size="xs" weight="semibold" color={valueColor}>
          {value}
        </AppText>
      )}
      <Icon name="chevronRight" size={18} color="inkDim" />
    </View>
  </PressableScale>
);

const MoreScreen = () => {
  const user = useSession((s) => s.user);

  const budgetsQuery = useBudgets();
  const billsQuery = useBills();
  const goalsQuery = useGoals();
  const { items: budgets } = budgetsQuery;
  const { items: bills } = billsQuery;
  const { items: goals } = goalsQuery;
  // The menu always draws; only the status values wait on these, and a row with no answer
  // shows no value. So the state feeds the strip and the pull, never the body, and counts as
  // having data: a failed first load then shows the "Couldn't refresh" strip, not nothing.
  const states = mergeScreenStates(
    ...[budgetsQuery, billsQuery, goalsQuery].map((q) => ({ ...q, hasData: true })),
  );

  const logoutRef = useRef<BottomSheetModal>(null);

  const budget = budgetTotals(budgets);
  const outstanding = outstandingTotal(bills);
  const savings = goalsSummary(goals);
  const dueSoon = outstanding.pending + outstanding.overdue;

  // Derived from the same helpers each destination screen uses, so a row can never
  // disagree with the page it leads to. A row with nothing to report shows nothing
  // rather than a fabricated zero.
  const liveValues: Record<string, { value: string; color?: ColorToken }> = {
    ...(budgets.length > 0 && {
      budget: {
        value: `${formatPct(budget.percentUsed)} used`,
        color: budget.percentUsed >= 100 ? "danger" : budget.percentUsed >= 80 ? "warning" : "inkDim",
      },
    }),
    ...(dueSoon > 0 && {
      bills: {
        value: `${dueSoon} due`,
        color: outstanding.overdue > 0 ? "danger" : "warning",
      },
    }),
    ...(goals.length > 0 && {
      goals: { value: `${formatPct(savings.percent)} saved` },
    }),
  };

  return (
    <ScreenScaffold title={screenTitles.more} states={states}>
      {/* Profile card — one tap into Settings (spec .profcard) */}
      <PressableScale
        onPress={() => router.push("/settings")}
        scaleTo={0.98}
        accessibilityLabel={`${user?.name ?? "Profile"}. Opens Settings.`}
      >
        <Card style={styles.profileCard}>
          <Avatar initials={initialsOf(user?.name)} size="lg" gradient />
          <View style={styles.profileInfo}>
            <AppText size="md" weight="black" numberOfLines={1}>
              {user?.name ?? ""}
            </AppText>
            <AppText size="xs" color="inkDim" numberOfLines={1}>
              {user?.email ?? ""}
            </AppText>
          </View>
          <Icon name="chevronRight" size={18} color="inkDim" />
        </Card>
      </PressableScale>

      {/* AI Assistant hero — the ONE gradient row on the page (spec .aihero) */}
      <PressableScale onPress={() => router.push("/assistant")} scaleTo={0.98}>
        <View style={styles.aiHero}>
          <LinearGradient
            colors={[withAlpha(colors.brandLight, 0.32), withAlpha(colors.brandDeep, 0.14)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Icon
            name="summary"
            size={22}
            containerSize={44}
            container="square"
            gradient="violet"
          />
          <View style={styles.profileInfo}>
            <AppText size="sm" weight="bold">
              Highlights
            </AppText>
            <AppText size="xs" color="inkDim">
              What your money is doing this month
            </AppText>
          </View>
          <Icon name="chevronRight" size={18} color="inkDim" />
        </View>
      </PressableScale>

      <Caps header style={styles.groupLabel}>Your money</Caps>
      <Card padded={false} style={styles.group}>
        {moneyItems.map((item, i) => (
          <MenuRow
            key={item.key}
            item={item}
            first={i === 0}
            value={liveValues[item.key]?.value}
            valueColor={liveValues[item.key]?.color ?? "inkDim"}
          />
        ))}
      </Card>

      <Caps header style={styles.groupLabel}>App</Caps>
      <Card padded={false} style={styles.group}>
        {appItems.map((item, i) => (
          <MenuRow key={item.key} item={item} first={i === 0} />
        ))}
      </Card>

      {/* Log out — isolated danger card (spec .srow.danger), behind a confirm so a
          mis-tap next to Settings can't end the session. */}
      <Card padded={false} style={styles.group}>
        <PressableScale onPress={() => logoutRef.current?.present()} scaleTo={0.985}>
          <View style={styles.row}>
            <Icon
              name="logout"
              size={17}
              containerSize={34}
              containerRadius={11}
              container="square"
              containerColor="dangerSoft"
              color="danger"
            />
            <AppText weight="bold" size="sm" color="danger" style={styles.rowLabel}>
              Log out
            </AppText>
          </View>
        </PressableScale>
      </Card>

      <LogoutSheet ref={logoutRef} />
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  aiHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: 26, // spec .aihero radius × device scale
    borderWidth: 1,
    borderColor: withAlpha(colors.seriesViolet, 0.4),
    overflow: "hidden",
    shadowColor: colors.glow,
    shadowOpacity: 0.25,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  groupLabel: {
    paddingHorizontal: 2,
    marginTop: spacing.xs,
  },
  group: {
    paddingVertical: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.surface2,
  },
  rowLabel: {
    flex: 1,
  },
});

export default MoreScreen;
