import { StyleSheet, View } from "react-native"
import ProgressBar from "./ProgressBar"
import GradientCard from "../shell/GradientCard"
import { AppText } from "../ui/AppText"
import Icon from "../ui/Icon"
import { spacing } from "@/theme"

type Stats = {
  label: string,
  value: string
}

type Props = {
  score: number,
  rating: string,
  stats: Stats[]
}

const HealthScoreCard = ({
  score,
  rating,
  stats
}: Props) => {
  return (
    <GradientCard gradient="health" style={styles.card}>
      <View style={styles.topContainer}>
        <View style={styles.left}>
          <Icon
            name="trophy"
            size={36}
            container="square"
            color="surface"
            containerColor="successInk"
          />
          <View>
            <AppText size="sm" color="surface">Finance Health Score</AppText>
            <AppText size="xl" color="surface" weight="black">{rating}</AppText>
          </View>
        </View>
        <View style={styles.score}>
          <AppText size="2xl" color="surface" weight="black">{score}</AppText>
          <AppText size="sm" color="surface">/100</AppText>
        </View>
      </View>
      <ProgressBar value={score} color="surface" trackColor="successInk"/>
      <View style={styles.stats}>
        {stats.map ((stat) => {
          return (
            <View key={stat.label}>
              <AppText weight="regular" size="sm" color="surface">
                {stat.label}
              </AppText>
              <AppText weight="bold" size="md" color="surface">
                {stat.value}
              </AppText>
            </View>
          )
        })}
      </View>
    </GradientCard>
  )
}

const styles = StyleSheet.create ({
  card: {
    gap: spacing.md
  },
  topContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  score: {
    alignItems: "flex-end"
  },
  stats: {
    flexDirection: "row",
    justifyContent: "space-between",
  }
})

export default HealthScoreCard;