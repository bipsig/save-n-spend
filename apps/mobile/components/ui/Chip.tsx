import { Pressable, StyleSheet, View } from 'react-native'
import type { PressableProps, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { AppText } from './AppText'
import Icon from './Icon'
import type { IconName } from '@/lib/icons'
import { colors, gradients, radius, spacing } from '@/theme'

type Props = PressableProps & {
  label: string
  selected?: boolean
  active?: boolean
  grow?: boolean
  icon?: IconName
}

// Spec .fchip — glass pill, hairline border, dim 600 text; selected = violet
// gradient, white 700 text, glow. `active` = the "trail" state (a violet
// outline, no fill) for a parent whose child is the real selection.
const Chip = ({ label, selected = false, active = false, grow = false, icon, disabled, onPress, ...rest }: Props) => {
  const tint = selected ? 'surface' : active ? 'primary' : 'inkDim'
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        grow ? styles.grow : styles.hug,
        {
          backgroundColor: selected ? 'transparent' : active ? 'rgba(139,123,255,0.14)' : colors.surface2,
          borderColor: selected ? 'transparent' : active ? colors.primary : colors.line,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
        selected && styles.glow,
      ]}
      {...rest}
    >
      {selected && (
        <LinearGradient
          colors={[...gradients.brand]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[StyleSheet.absoluteFill, styles.gradient]}
          pointerEvents="none"
        />
      )}
      <View style={styles.content}>
        {icon && (
          <Icon name={icon} size={14} color={tint} />
        )}
        <AppText
          weight={selected || active ? 'bold' : 'semibold'}
          size="sm"
          color={tint}
          style={styles.label}
        >
          {label}
        </AppText>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  } as ViewStyle,
  gradient: {
    borderRadius: radius.full,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  hug: {
    alignSelf: 'flex-start',
  },
  grow: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    textAlign: 'center',
  },
  glow: {
    shadowColor: '#6D5CFF',
    shadowOpacity: 0.4,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
})

export default Chip
