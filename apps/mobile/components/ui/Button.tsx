import { colors, ColorToken, FontSizeToken, radius, spacing } from "@/theme";
import { ActivityIndicator, Pressable, PressableProps, StyleSheet, View } from "react-native"
import { AppText } from "./AppText";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = PressableProps & {
  label: string
  variant?: Variant
  size?: Size
  loading?: boolean
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
  secondary: { background: "surface", text: "ink", border: "line" },
  ghost: { background: "surface", text: "primary" },
  danger: { background: "danger", text: "surface" }
};

const sizeStyles: Record<Size, SizeStyle> = {
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: "sm" },
  md: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: "md" },
  lg: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, fontSize: "lg" }
}

const Button = ({
  label = "Button",
  variant = "primary",
  size="md",
  loading = false,
  disabled,
  onPress,
  ...rest
}: Props) => {

  const v = variantStyles[variant];
  const s = sizeStyles[size];

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: colors[v.background],
          borderColor: v.border ? colors[v.border] : "transparent",
          borderWidth: v.border ? 1 : 0,
          paddingVertical: s.paddingVertical,
          paddingHorizontal: s.paddingHorizontal,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
      {...rest} 
    >
      <View style = {styles.content}>
        {loading ? (
          <ActivityIndicator color={colors[v.text]} />
        ) : (
          <AppText weight="bold" size={s.fontSize} color={v.text}>
            {label}
          </AppText>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
})

export default Button;