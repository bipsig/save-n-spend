import { useCallback, useState } from "react";
import { haptics } from "@/lib/haptics";

/**
 * A sheet's form-level error (gaps row 118): `fail` shows it in `FormError` and buzzes once,
 * the only haptic for a failed submit. A failure a toast reports needs neither (the toast has
 * its own buzz).
 */
export const useFormError = () => {
  const [error, setError] = useState<string | null>(null);
  const fail = useCallback((message: string | null) => {
    haptics.error();
    setError(message);
  }, []);
  const clear = useCallback(() => setError(null), []);
  return { error, fail, clear };
};
