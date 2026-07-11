import { StyleSheet, View } from "react-native"
import ProgressBar from "./ProgressBar"
import Card from "./Card"
import { AppText } from "../ui/AppText"
import Icon from "../ui/Icon"

type Stats = {
  label: string,
  value: string
}

type Props = {
  score: number,
  rating: string,
  stats: Stats[]
}

// Spec dashboard hero: plain GLASS card (not a green wash) — the color lives in
// the glowing green icon chip, the score bar, and nothing else.
const HealthScoreCard = ({
  score,
  rating,
  stats
}: Props) => {
  return (
    <Card style={styles.card}>
      <View style={styles.topContainer}>
        <Icon
          name="healthPulse"
          size={24}
          containerSize={47}
          container="square"
          gradient="green"
        />
        <View style={styles.titleCol}>
          <AppText size="xs" weight="semibold" color="inkDim" style={styles.label}>
            FINANCE HEALTH SCORE
          </AppText>
          <AppText size="lg" weight="black">{rating}</AppText>
        </View>
        <View style={styles.score}>
          <AppText size="xl" weight="black">
            {score}
            <AppText size="xs" weight="semibold" color="inkDim">/100</AppText>
          </AppText>
        </View>
      </View>

      <ProgressBar value={score} color="success" />

      <View style={styles.stats}>
        {stats.map ((stat) => {
          return (
            <View key={stat.label}>
              <AppText size="xs" color="inkDim">
                {stat.label}
              </AppText>
              <AppText weight="bold" size="sm">
                {stat.value}
              </AppText>
            </View>
          )
        })}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create ({
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
  }
})

export default HealthScoreCard;
