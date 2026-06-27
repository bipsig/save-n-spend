import { Pressable, StyleSheet } from 'react-native'
import type { PressableProps } from 'react-native'
import { AppText } from './AppText'
import { colors, radius, spacing } from '@/theme'

type Props = PressableProps & {
  label: string
  selected?: boolean
}

const Chip = ({ label, selected = false, disabled, onPress, ...rest }: Props) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: selected ? colors.primary : colors.surface2,
          borderColor: selected ? colors.primary : colors.line,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}
      {...rest}
    >
      <AppText
        weight={selected ? 'bold' : 'regular'}
        size="sm"
        color={selected ? 'surface' : 'gray700'}
      >
        {label}
      </AppText>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
})

export default Chip
