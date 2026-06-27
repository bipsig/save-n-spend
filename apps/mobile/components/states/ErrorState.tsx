import { StyleSheet, View } from "react-native"
import { AppText } from "../ui/AppText"
import Icon from "../ui/Icon"
import Button from "../ui/Button"
import { spacing } from "@/theme"

type Props = {
  message?: string
  onRetry?: () => void
}

const ErrorState = ({ message = "Something went wrong.", onRetry }: Props) => {
  return (
    <View style={styles.container}>
      <Icon name="close" size={32} color="danger" container="circle" containerColor="dangerSoft" />
      <AppText weight="bold" size="lg">
        Oops
      </AppText>
      <AppText size="sm" color="gray500" style={styles.text}>
        {message}
      </AppText>
      {onRetry && (
        <Button label="Try Again" variant="secondary" size="sm" onPress={onRetry} />
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
    textAlign: "center"
  }
})

export default ErrorState;
