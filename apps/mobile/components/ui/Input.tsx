import { useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import type { TextInputProps } from 'react-native'
import { AppText } from './AppText'
import { colors, fontFamily, fontSize, radius, spacing } from '@/theme'

type Size = "sm" | "md" | "lg"

type Props = TextInputProps & {
  label?: string
  error?: string
  size?: Size
  // Swap the underlying field — e.g. gorhom's BottomSheetTextInput when the input
  // lives inside a bottom sheet (so the keyboard and the sheet cooperate).
  InputComponent?: React.ComponentType<TextInputProps>
}

const sizeStyles: Record<Size, { paddingVertical: number; fontSize: number }> = {
  sm: { paddingVertical: spacing.sm, fontSize: fontSize.sm },
  md: { paddingVertical: spacing.md, fontSize: fontSize.md },
  lg: { paddingVertical: spacing.lg, fontSize: fontSize.lg },
}

const Input = ({ label, error, size = 'md', style, InputComponent = TextInput, ...rest }: Props) => {
  const [focused, setFocused] = useState(false)
  const s = sizeStyles[size]

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.line

  return (
    <View style={styles.wrapper}>
      {label && <AppText weight="bold" size="sm" color="gray600">{label}</AppText>}

      <InputComponent
        placeholderTextColor={colors.gray400}
        {...rest}
        style={[
          styles.input,
          { borderColor, paddingVertical: s.paddingVertical, fontSize: s.fontSize },
          style,
        ]}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e) }}
      />

      {error && <AppText size="xs" color="danger">{error}</AppText>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs, width: '100%' },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.regular,
    color: colors.ink,
    backgroundColor: colors.surface2,
  },
})

export default Input;