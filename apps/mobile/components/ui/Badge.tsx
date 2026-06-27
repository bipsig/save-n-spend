import { StyleSheet, View } from 'react-native'
import { AppText } from './AppText'
import { colors, radius, spacing } from '@/theme'
import type { ColorToken } from '@/theme'

type Status = 'paid' | 'pending' | 'overdue' | 'onTrack'
type Size = 'sm' | 'md'

type Props = {
  label: string
  status?: Status
  size?: Size
  invert?: boolean // solid fill + white text, instead of soft tint
}

// soft = tinted background, ink = dark text on soft, solid = full-strength fill.
const statusColors: Record<Status, { soft: ColorToken; solid: ColorToken; ink: ColorToken }> = {
  paid: { soft: 'successSoft', solid: 'success', ink: 'successInk' },
  pending: { soft: 'warningSoft', solid: 'warning', ink: 'warning' },
  overdue: { soft: 'dangerSoft', solid: 'danger', ink: 'dangerInk' },
  onTrack: { soft: 'infoSoft', solid: 'info', ink: 'info' },
}

const Badge = ({ label, status = 'onTrack', size = 'md', invert = false }: Props) => {
  const c = statusColors[status]
  const bg: ColorToken = invert ? c.solid : c.soft
  const fg: ColorToken = invert ? 'surface' : c.ink

  return (
    <View
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: colors[bg] },
      ]}
    >
      <AppText weight="black" size="xs" color={fg} style={styles.label}>
        {label}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
  },
  sm: { paddingVertical: 2, paddingHorizontal: spacing.sm },
  md: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  label: { letterSpacing: 0.5, textTransform: 'uppercase' },
})

export default Badge
