import { StyleSheet, View } from "react-native"
import { AppText } from "../ui/AppText"
import Button from "../ui/Button"
import StateDisc from "./StateDisc"
import { UNREADABLE_MESSAGE } from "@/lib/apiError"
import { spacing } from "@/theme"

type Props = {
  /** The friendly line from `lib/apiError.ts` for this failure. */
  message?: string
  onRetry?: () => void
}

// EmptyState's twin in the danger tone (mockup 05): an alert mark, not a ✕, which reads as "close".
const ErrorState = ({ message = UNREADABLE_MESSAGE, onRetry }: Props) => {
  return (
    <View style={styles.container}>
      <StateDisc icon="alert" tone="danger" />
      <AppText weight="black" size="md">
        Couldn't load this
      </AppText>
      <AppText size="sm" color="inkDim" style={styles.text}>
        {message}
      </AppText>
      {onRetry && (
        <View style={styles.action}>
          <Button label="Try again" icon="refresh" variant="secondary" pill onPress={onRetry} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing["3xl"]
  },
  text: {
    textAlign: "center",
    maxWidth: 240,
  },
  action: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xs,
  }
})

export default ErrorState;
