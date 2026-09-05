import { StyleSheet, View } from "react-native"
import type { HealthScore } from "@save-n-spend/types"
import ProgressBar from "./ProgressBar"
import Card from "./Card"
import { AppText } from "../ui/AppText"
import Icon from "../ui/Icon"
import PressableScale from "../ui/PressableScale"
import { BAND_COLOR, pillarColor } from "@/lib/health"
import { spacing } from "@/theme"

type Props = {
  health: HealthScore
  onPress?: () => void
}

// Spec dashboard hero: plain GLASS card (not a green wash) — the color lives in
// the icon chip, the score bar, and the three pillar readings.
//
// Three things are on this card and each earns its place: the number (where you stand),
// the three heaviest pillars (what it is made of), and the focus line (what to do about
// it). The focus line is the reason this is not just a gauge — a number with no next
// action gets looked at twice and then ignored.
const HealthScoreCard = ({ health, onPress }: Props) => {
  const tone = BAND_COLOR[health.band];

  // Not enough history to score. Shown rather than hidden: the empty state explains
  // what the card will become and what it is waiting for, which is more useful than a
  // gap on the dashboard — and far more honest than a made-up number.
  if (health.score === null) {
    return (
      <Card style={styles.card}>
        <View style={styles.topContainer}>
          <Icon name="healthPulse" size={24} containerSize={47} container="square" gradient="violet" />
          <View style={styles.titleCol}>
            <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
              FINANCE HEALTH SCORE
            </AppText>
            <AppText size="md" weight="black" color="inkSecondary">Not enough data</AppText>
          </View>
        </View>
        <AppText size="xs" color="inkDim">{health.reason}</AppText>
      </Card>
    );
  }

  // Only the heaviest three, and always the same three when they apply, so a pillar
  // never swaps position between two loads of the same screen.
  const shown = health.pillars.filter((pillar) => pillar.score !== null).slice(0, 3);

  return (
    <PressableScale onPress={onPress} disabled={!onPress} scaleTo={0.98}>
      <Card style={styles.card}>
        <View style={styles.topContainer}>
          <Icon
            name="healthPulse"
            size={24}
            containerSize={47}
            container="square"
            gradient={tone === "success" ? "green" : tone === "warning" ? "amber" : "red"}
          />
          <View style={styles.titleCol}>
            <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
              FINANCE HEALTH SCORE
            </AppText>
            <AppText size="lg" weight="black">{health.rating}</AppText>
          </View>
          <View style={styles.score}>
            <AppText size="xl" weight="black">
              {health.score}
              <AppText size="xs" weight="semibold" color="inkDim">/100</AppText>
            </AppText>
          </View>
        </View>

        <ProgressBar value={health.score} color={tone} />

        <View style={styles.stats}>
          {shown.map((pillar) => (
            <View key={pillar.key} style={styles.stat}>
              <AppText size="xs" color="inkDim" numberOfLines={1}>
                {pillar.label}
              </AppText>
              {/* Coloured by the pillar's OWN score, not the total — one weak pillar
                  under a healthy total should be findable at a glance. */}
              <AppText weight="bold" size="sm" color={pillarColor(pillar.score)} numberOfLines={1}>
                {pillar.value}
              </AppText>
            </View>
          ))}
        </View>

        {health.focus && (
          <View style={styles.focus}>
            <Icon name="info" size={14} color="inkDim" />
            <AppText size="xs" color="inkSecondary" style={styles.focusText}>
              {health.focus.hint}
            </AppText>
          </View>
        )}
      </Card>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: 12, // spec .hero gap × device scale
  },
  topContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  titleCol: {
    flex: 1,
    gap: 3,
  },
  label: {
    letterSpacing: 1,
  },
  score: {
    alignItems: "flex-end",
  },
  stats: {
    flexDirection: "row",
    gap: 28, // spec .hstats gap × device scale
  },
  // Each pillar takes an equal share rather than sizing to its text, so three
  // readings of different lengths still line up as columns.
  stat: {
    flex: 1,
    gap: 2,
  },
  focus: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  focusText: {
    flex: 1,
    lineHeight: 16,
  },
})

export default HealthScoreCard;
