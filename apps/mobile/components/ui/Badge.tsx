import { StyleSheet, View } from 'react-native'
import { AppText } from './AppText'
import { colors, radius, spacing } from '@/theme'
import type { ColorToken } from '@/theme'

type Status = 'paid' | 'pending' | 'overdue' | 'onTrack'
export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'onGradient'
type Size = 'sm' | 'md'

type Props = {
  label: string
  /** The 2.8.2 way: one of five tones (mockup 02), bright text on a soft fill, or
   *  `onGradient` for a tag on a gradient band (white on a dark plate). */
  tone?: BadgeTone
  /** Bill statuses, kept until round 2 moves callers to `tone`. Ignored when `tone` is set. */
  status?: Status
  size?: Size
  invert?: boolean // solid fill + white text, instead of soft tint
}

type Look = { soft: ColorToken; solid: ColorToken; ink: ColorToken }

// soft = tinted background, ink = text on soft, solid = full-strength fill.
const statusColors: Record<Status, Look> = {
  paid: { soft: 'successSoft', solid: 'success', ink: 'successInk' },
  pending: { soft: 'warningSoft', solid: 'warning', ink: 'warning' },
  overdue: { soft: 'dangerSoft', solid: 'danger', ink: 'dangerInk' },
  onTrack: { soft: 'infoSoft', solid: 'info', ink: 'info' },
}

const toneColors: Record<Exclude<BadgeTone, 'onGradient'>, Look> = {
  success: { soft: 'successSoft', solid: 'success', ink: 'success' },
  warning: { soft: 'warningSoft', solid: 'warning', ink: 'warning' },
  danger: { soft: 'dangerSoft', solid: 'danger', ink: 'danger' },
  info: { soft: 'infoSoft', solid: 'info', ink: 'info' },
  neutral: { soft: 'surface2', solid: 'gray500', ink: 'inkDim' },
}

const ON_GRADIENT_FILL = 'rgba(0,0,0,0.25)'

// Capitals come from the style, so pass sentence case and VoiceOver reads words.
const Badge = ({ label, tone, status = 'onTrack', size = 'md', invert = false }: Props) => {
  const c = tone === 'onGradient' ? null : tone ? toneColors[tone] : statusColors[status]
  const fill = c ? colors[invert ? c.solid : c.soft] : ON_GRADIENT_FILL
  const fg: ColorToken = !c || invert ? 'surface' : c.ink

  return (
    <View
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        !c && styles.centred,
        { backgroundColor: fill },
      ]}
    >
      {/* The label in its own case: VoiceOver would get the upper-cased text otherwise. */}
      <AppText weight="black" size="xs" color={fg} style={styles.label} accessibilityLabel={label}>
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
  // A band tag sits beside its title in a row, centred on it as 2.8.1's tag was.
  centred: { alignSelf: 'center' },
  sm: { paddingVertical: 2, paddingHorizontal: spacing.sm },
  md: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  label: { letterSpacing: 0.5, textTransform: 'uppercase' },
})

export default Badge
