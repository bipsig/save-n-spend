import { StyleSheet } from "react-native";
import { AppText } from "@/components/ui/AppText";

/** A form's own problem or the server's, in the sheet footer above the CTA (gaps rows 118,
 *  119). Field problems go under their field instead (`Input error=`, `FieldRow error=`);
 *  both read xs bold danger. Renders nothing when there is no message. */
const FormError = ({ message }: { message: string | null | undefined }) =>
  message ? (
    <AppText size="xs" weight="bold" color="danger" style={styles.text} accessibilityLiveRegion="polite" accessibilityRole="alert">
      {message}
    </AppText>
  ) : null;

const styles = StyleSheet.create({
  text: { textAlign: "center" },
});

export default FormError;
