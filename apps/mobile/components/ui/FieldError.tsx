import { AppText } from "@/components/ui/AppText";

/** One field's own problem, right under it (gaps row 118): xs bold danger, the same as
 *  `Input error=` and `FieldRow error=`. Renders nothing without a message. */
const FieldError = ({ message }: { message: string | null | undefined }) =>
  message ? (
    <AppText size="xs" weight="bold" color="danger" accessibilityLiveRegion="polite">
      {message}
    </AppText>
  ) : null;

export default FieldError;
