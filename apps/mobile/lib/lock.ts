// The biometric half of app lock. Kept apart from the gate component so the
// Settings toggle can ask "can this phone do it?" before switching it on — a
// toggle that turns green on a device with no enrolled Face ID would lock the
// user out of nothing and confuse them about whether it worked.
import * as LocalAuthentication from "expo-local-authentication";

export type LockCapability = {
  available: boolean;
  /** What the phone actually offers, for the row's sub-line. */
  label: string;
};

export const lockCapability = async (): Promise<LockCapability> => {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return { available: false, label: "Not supported on this device" };

  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) return { available: false, label: "Set up Face ID or a passcode first" };

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const faceId = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const touchId = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);

  const label =
    faceId && touchId ? "Face ID / fingerprint on open"
    : faceId ? "Face ID on open"
    : touchId ? "Fingerprint on open"
    : "Device passcode on open";

  return { available: true, label };
};

// Prompt, and report only whether it succeeded. `disableDeviceFallback: false`
// keeps the passcode escape hatch: a failed face scan must not be able to strand
// the user outside their own data.
export const authenticate = async (reason: string): Promise<boolean> => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });
    return result.success;
  }
  catch {
    return false;
  }
};
