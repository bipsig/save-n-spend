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
// primary = violet brand, success = green (positive confirms), danger = red
// (destructive confirm, e.g. Delete Transaction).
const GRADIENT_BY_VARIANT: Partial<Record<Variant, GradientToken>> = {
  primary: "brand",
  success: "health",
  danger: "danger",
};
const GLOW_BY_VARIANT: Partial<Record<Variant, string>> = {
  primary: "#6D5CFF",
  success: "#12B981",
  danger: "#F5525C",
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
  const shape = pill ? styles.pill : styles.base;

  return (
    // The glow lives on this outer layer, not the Pressable: a view can't both
    // clip its content (overflow:hidden, needed to round the gradient) AND cast
    // an outer shadow — so the halo needs its own unclipped, opaque surface.
    <View
      style={[
        pill ? styles.pillWrap : styles.wrap,
        gradient && !isDisabled && {
          ...styles.glow,
          shadowColor: GLOW_BY_VARIANT[variant] ?? "#6D5CFF",
          backgroundColor: colors[v.background],
        },
        isDisabled ? styles.disabled : null,
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={({ pressed }) => [
          shape,
          {
            backgroundColor: gradient ? "transparent" : colors[v.background],
            borderColor: v.border ? colors[v.border] : "transparent",
            borderWidth: v.border ? 1 : 0,
            paddingVertical: s.paddingVertical,
            paddingHorizontal: s.paddingHorizontal,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        {...rest}
      >
        {gradientToken && (
          <LinearGradient
            colors={[...gradients[gradientToken]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[StyleSheet.absoluteFill, shape]}
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
    </View>
  )
}

const styles = StyleSheet.create({
  // Outer shadow layer — matches the button's corners; opaque bg (set inline)
  // so the halo actually renders. Full-width by default; pill hugs its content.
  wrap: {
    borderRadius: radius.md,
  },
  pillWrap: {
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  // Inner clipped surfaces the gradient + content fill.
  base: {
    borderRadius: radius.md,
    overflow: "hidden",
  },
  pill: {
    borderRadius: radius.full,
  },
  disabled: {
    opacity: 0.45,
  },
  // Colored halo under gradient buttons — large + soft so it reads across a
  // full-width CTA, not just a tight FAB (spec: a generous glowing bloom).
  glow: {
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
})

export default Button;
