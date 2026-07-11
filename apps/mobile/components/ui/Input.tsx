import { useState } from 'react'
import { StyleSheet, TextInput, View } from 'react-native'
import type { TextInputProps } from 'react-native'
import { AppText } from './AppText'
import { colors, fontSize, radius, spacing } from '@/theme'

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
      {label && (
        <AppText weight="bold" size="xs" color="inkDim" style={styles.label}>
          {label.toUpperCase()}
        </AppText>
      )}

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
  wrapper: { gap: spacing.sm, width: '100%' },
  // Spec .flabel — tiny caps, wide tracking, dim ink.
  label: { letterSpacing: 1.3 },
  // Spec .finput × device scale — radius 16, faint white fill, hairline border.
  input: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontWeight: '600',
    color: colors.ink,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
})

export default Input;