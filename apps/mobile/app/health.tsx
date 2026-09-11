import { StyleSheet, View } from "react-native";
import BackButton from "@/components/shell/BackButton";
import PeekButton from "@/components/shell/PeekButton";
import ScreenScaffold from "@/components/shell/ScreenScaffold";
import Card from "@/components/data/Card";
import ProgressBar from "@/components/data/ProgressBar";
import { AppText } from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import EmptyState from "@/components/states/EmptyState";
import ErrorState from "@/components/states/ErrorState";
import SkeletonState from "@/components/states/SkeletonState";
import { BAND_COLOR, PILLAR_ICON, pillarColor, useHealthScore } from "@/lib/health";
import { radius, spacing } from "@/theme";
import type { HealthPillar } from "@save-n-spend/types";

// Where the score is accounted for.
//
// The dashboard card can only show three pillars and one hint, which is enough to notice
// a problem and not enough to act on it. This screen exists so the number is never a
// black box: every pillar, what it measured, what it scored, and what to do — including
// the ones that did not apply, because "you have no budgets, so budgets are not being
// counted" is itself the answer to "why is my score what it is".

const PillarCard = ({ pillar }: { pillar: HealthPillar }) => {
  const applies = pillar.score !== null;

  return (
    <Card style={styles.pillar}>
      <View style={styles.pillarHead}>
        <Icon
          name={PILLAR_ICON[pillar.key]}
          size={17}
          containerSize={34}
          containerRadius={11}
          container="square"
          gradient={applies ? "violet" : undefined}
          containerColor={applies ? undefined : "surface2"}
          color={applies ? undefined : "inkDim"}
        />
        <View style={styles.pillarTitle}>
          <AppText size="sm" weight="bold">{pillar.label}</AppText>
          <AppText size="xs" color="inkDim">
            {/* The weight is shown because it is the honest answer to "why did my score
                barely move when I fixed this" — some pillars are worth more. */}
            {applies ? `${pillar.verdict} · worth ${pillar.weight} points` : "Not counted yet"}
          </AppText>
        </View>
        {/* Rounded on arrival as well as at the source: a deployed API from before that fix
            still sends the raw curve output, and 84.17309968984512 in the corner of a card
            pushes the title into three lines. */}
        <AppText size="md" weight="black" color={pillarColor(pillar.score)} numberOfLines={1}>
          {applies ? Math.round(pillar.score as number) : "—"}
        </AppText>
      </View>

      {applies && <ProgressBar value={pillar.score as number} color={pillarColor(pillar.score)} height={7} />}

      <View style={styles.pillarFoot}>
        <AppText size="xs" weight="semibold" color="inkSecondary">{pillar.value}</AppText>
        {pillar.hint && (
          <AppText size="xs" color="inkDim" style={styles.hint}>{pillar.hint}</AppText>
        )}
      </View>
    </Card>
  );
};

const HealthScreen = () => {
  const { data, loading, error, refetch } = useHealthScore();

  const header = (
    <View style={styles.head}>
      <BackButton />
      <AppText size="xl" weight="black" style={styles.headTitle}>
        Health score
      </AppText>
      <PeekButton />
    </View>
  );

  if (error && !data) {
    return (
      <ScreenScaffold header={header}>
        <ErrorState message={error} onRetry={refetch} />
      </ScreenScaffold>
    );
  }

  if (loading && !data) {
    return (
      <ScreenScaffold header={header}>
        <View style={styles.skeletonCol}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonState key={i} height={96} borderRadius={radius.lg} />
          ))}
        </View>
      </ScreenScaffold>
    );
  }

  if (!data) return null;

  if (data.score === null) {
    return (
      <ScreenScaffold header={header}>
        <EmptyState icon="healthPulse" title="Not enough data yet" subtitle={data.reason ?? ""} />
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold header={header}>
      <Card style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroTitle}>
            <AppText size="lg" weight="black">{data.rating}</AppText>
            <AppText size="xs" color="inkDim">
              Measured over the last {data.windowDays} days
            </AppText>
          </View>
          <AppText size="xl" weight="black">
            {data.score}
            <AppText size="xs" weight="semibold" color="inkDim">/100</AppText>
          </AppText>
        </View>
        <ProgressBar value={data.score} color={BAND_COLOR[data.band]} />
        {/* Said plainly, once, so nobody has to guess whether an untouched feature is
            costing them points. It is the question this screen exists to answer. */}
        <AppText size="xs" color="inkDim">
          Your score is the weighted average of the pillars below that apply to you.
          Anything not counted yet is left out rather than scored as zero.
        </AppText>
      </Card>

      {data.pillars.map((pillar) => (
        <PillarCard key={pillar.key} pillar={pillar} />
      ))}
    </ScreenScaffold>
  );
};

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headTitle: {
    flex: 1,
  },
  skeletonCol: {
    gap: spacing.lg,
  },
  hero: {
    gap: spacing.md,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  heroTitle: {
    flex: 1,
    gap: 3,
  },
  pillar: {
    gap: 10,
  },
  pillarHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  pillarTitle: {
    flex: 1,
    gap: 2,
  },
  pillarFoot: {
    gap: 4,
  },
  hint: {
    lineHeight: 16,
  },
});

export default HealthScreen;
