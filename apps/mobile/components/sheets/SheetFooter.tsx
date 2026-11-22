import { StyleSheet, View } from "react-native";
import FormError from "@/components/ui/FormError";
import { spacing } from "@/theme";

/** What `AppSheet footer` holds in a form sheet (gaps row 119): the form error, then the
 *  primary CTA, then any secondary action. A sheet with an input, or a scrollable one, puts
 *  them here so they never scroll out of view. */
const SheetFooter = ({ error, children }: { error?: string | null; children: React.ReactNode }) => (
  <View style={styles.footer}>
    <FormError message={error} />
    {children}
  </View>
);

const styles = StyleSheet.create({
  footer: { gap: spacing.sm },
});

export default SheetFooter;
