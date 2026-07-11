import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import Avatar from "@/components/ui/Avatar";
import Icon from "@/components/ui/Icon";
import { AppText } from "@/components/ui/AppText";
import { moneyItems, appItems } from "@/data/menu";
import type { MoreItem } from "@/data/menu";
import { bills, goalsSummary, monthlyBudget } from "@/lib/mock";
import { spacing } from "@/theme";
import type { ColorToken } from "@/theme";

// Tiny caps group label (spec .flabel).
const GroupLabel = ({ children }: { children: string }) => (
  <AppText size="xs" weight="bold" color="inkDim" style={styles.groupLabel}>
    {children}
  </AppText>
);

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
  <Pressable onPress={() => router.push(item.path)}>
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
  </Pressable>
);

const MoreScreen = () => {
  // Live status values — same fixtures the destination screens render.
  const budgetUsedPct = Math.round((monthlyBudget.spent / monthlyBudget.total) * 100);
  const billsDueSoon = bills.filter((b) => b.status !== "paid").length;
  const { totalSaved, totalTarget } = goalsSummary();
  const goalsPct = totalTarget === 0 ? 0 : Math.round((totalSaved / totalTarget) * 100);

  const liveValues: Record<string, { value: string; color?: ColorToken }> = {
    budget: { value: `${budgetUsedPct}% used` },
    bills: billsDueSoon > 0
      ? { value: `${billsDueSoon} due soon`, color: "warning" }
      : { value: "All paid" },
    goals: { value: `${goalsPct}% saved` },
  };

  return (
    <ScreenScaffold title="More">
      {/* Profile card — one tap into Settings (spec .profcard) */}
      <Pressable onPress={() => router.push("/settings")}>
        <Card style={styles.profileCard}>
          <Avatar initials="SD" size="lg" gradient />
          <View style={styles.profileInfo}>
            <AppText size="md" weight="black">
              Sagnik Das
            </AppText>
            <AppText size="xs" color="inkDim">
              sagnik.rik.das@gmail.com
            </AppText>
          </View>
          <Icon name="chevronRight" size={18} color="inkDim" />
        </Card>
      </Pressable>

      {/* AI Assistant hero — the ONE gradient row on the page (spec .aihero) */}
      <Pressable onPress={() => router.push("/assistant")}>
        <View style={styles.aiHero}>
          <LinearGradient
            colors={["rgba(139,123,255,0.32)", "rgba(109,92,246,0.14)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Icon
            name="chat"
            size={22}
            containerSize={44}
            container="square"
            gradient="violet"
          />
          <View style={styles.profileInfo}>
            <AppText size="sm" weight="bold">
              AI Assistant
            </AppText>
            <AppText size="xs" color="inkDim">
              Ask anything about your money
            </AppText>
          </View>
          <Icon name="chevronRight" size={18} color="inkDim" />
        </View>
      </Pressable>

      <GroupLabel>YOUR MONEY</GroupLabel>
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

      <GroupLabel>APP</GroupLabel>
      <Card padded={false} style={styles.group}>
        {appItems.map((item, i) => (
          <MenuRow key={item.key} item={item} first={i === 0} />
        ))}
      </Card>

      {/* Log out — isolated danger card (spec .srow.danger). Session wiring
          lands with the auth milestone; mock phase logs the intent. */}
      <Card padded={false} style={styles.group}>
        <Pressable onPress={() => console.log("Log out")}>
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
        </Pressable>
      </Card>
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
    borderColor: "rgba(163,148,255,0.4)",
    overflow: "hidden",
    shadowColor: "#6D5CFF",
    shadowOpacity: 0.25,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  groupLabel: {
    letterSpacing: 1.5, // spec .flabel tracking
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
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  rowLabel: {
    flex: 1,
  },
});

export default MoreScreen;
