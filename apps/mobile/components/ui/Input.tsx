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
  // Optional element pinned to the right inside the field (e.g. a password eye).
  rightSlot?: React.ReactNode
}

const sizeStyles: Record<Size, { paddingVertical: number; fontSize: number }> = {
  sm: { paddingVertical: spacing.sm, fontSize: fontSize.sm },
  md: { paddingVertical: spacing.md, fontSize: fontSize.md },
  lg: { paddingVertical: spacing.lg, fontSize: fontSize.lg },
}

const Input = ({ label, error, size = 'md', style, InputComponent = TextInput, rightSlot, ...rest }: Props) => {
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

      <View style={styles.field}>
        <InputComponent
          placeholderTextColor={colors.gray400}
          {...rest}
          style={[
            styles.input,
            { borderColor, paddingVertical: s.paddingVertical, fontSize: s.fontSize },
            rightSlot ? styles.inputWithSlot : null,
            style,
          ]}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e) }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e) }}
        />
        {rightSlot ? <View style={styles.rightSlot}>{rightSlot}</View> : null}
      </View>

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
  // Relative wrapper around just the field row, so rightSlot centers on the input
  // (not the label/error stack).
  field: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputWithSlot: {
    paddingRight: 46,
  },
  rightSlot: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
})

export default Input;