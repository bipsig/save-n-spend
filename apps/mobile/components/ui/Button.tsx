import { colors, ColorToken, FontSizeToken, gradients, radius, spacing } from "@/theme";
import type { GradientToken } from "@/theme";
import { ActivityIndicator, Pressable, PressableProps, StyleSheet, View } from "react-native"
import { LinearGradient } from "expo-linear-gradient";
import { AppText } from "./AppText";
import Icon from "./Icon";
import type { IconName } from "@/lib/icons";

type Variant = "primary" | "success" | "secondary" | "ghost" | "danger" | "dangerGhost";
type Size = "sm" | "md" | "lg";

type Props = PressableProps & {
  label: string
  variant?: Variant
  size?: Size
  loading?: boolean
  /** Spec `.pillbtn` — small glowing violet gradient pill (header actions). */
  pill?: boolean
  icon?: IconName
  onPress?: () => void
}

type VariantStyle = {
  background: ColorToken,
  text: ColorToken,
  border?: ColorToken,
}

type SizeStyle = {
  paddingVertical: number,
  paddingHorizontal: number,
  fontSize: FontSizeToken
}

const variantStyles: Record<Variant, VariantStyle> = {
  primary: { background: "primary", text: "surface" },
  success: { background: "success", text: "surface" },
  secondary: { background: "surface2", text: "ink", border: "line" },
  ghost: { background: "surface2", text: "primary" },
  danger: { background: "danger", text: "surface" },
  // Spec .cta.ghost red variant — glass fill, red text + hairline (detail-sheet Delete)
  dangerGhost: { background: "surface2", text: "danger", border: "danger" }
};

const sizeStyles: Record<Size, SizeStyle> = {
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: "sm" },
  md: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, fontSize: "md" },
  lg: { paddingVertical: 20, paddingHorizontal: spacing.xl, fontSize: "lg" }
}

// Spec: primary/confirm actions are a gradient with a glow, never a flat fill.
// primary = violet brand, success = green (positive confirms, e.g. Mark as Paid).
const GRADIENT_BY_VARIANT: Partial<Record<Variant, GradientToken>> = {
  primary: "brand",
  success: "health",
};
const GLOW_BY_VARIANT: Partial<Record<Variant, string>> = {
  primary: "#6D5CFF",
  success: "#12B981",
};

const Button = ({
  label = "Button",
  variant = "primary",
  size = "md",
  loading = false,
  pill = false,
  icon,
  disabled,
  onPress,
  ...rest
}: Props) => {

  const v = variantStyles[variant];
  const s = pill
    ? { paddingVertical: 9, paddingHorizontal: spacing.lg, fontSize: "sm" as FontSizeToken }
    : sizeStyles[size];

  const isDisabled = disabled || loading;
  const gradientToken = GRADIENT_BY_VARIANT[variant];
  const gradient = !!gradientToken;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        pill ? styles.pill : null,
        {
          backgroundColor: gradient ? "transparent" : colors[v.background],
          borderColor: v.border ? colors[v.border] : "transparent",
          borderWidth: v.border ? 1 : 0,
          paddingVertical: s.paddingVertical,
          paddingHorizontal: s.paddingHorizontal,
          opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
        },
        gradient && { ...styles.glow, shadowColor: GLOW_BY_VARIANT[variant] ?? "#6D5CFF" },
      ]}
      {...rest}
    >
      {gradientToken && (
        <LinearGradient
          colors={[...gradients[gradientToken]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[StyleSheet.absoluteFill, pill ? styles.pill : styles.base]}
          pointerEvents="none"
        />
      )}
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors[v.text]} />
        ) : (
          <>
            {icon && <Icon name={icon} size={pill ? 17 : 21} color={v.text} />}
            <AppText weight="bold" size={s.fontSize} color={v.text}>
              {label}
            </AppText>
          </>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  pill: {
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  // Violet halo under gradient buttons (spec: 0 8px 22px rgba(109,92,255,.45)).
  glow: {
    shadowColor: "#6D5CFF",
    shadowOpacity: 0.45,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
})

export default Button;
