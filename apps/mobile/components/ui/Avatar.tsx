import { Image, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { AppText } from './AppText'
import Icon from './Icon'
import { colors, radius } from '@/theme'
import type { ColorToken } from '@/theme'
import type { IconName } from '@/lib/icons'

// Spec .av / .av2 — violet gradient disc with a violet halo.
const AVATAR_GRADIENT = ['#A394FF', '#6D5CFF'] as const

type Size = 'sm' | 'md' | 'lg'

type Props = {
  size?: Size
  uri?: string // photo
  initials?: string // e.g. "JD"
  iconName?: IconName // fallback glyph
  background?: ColorToken
  textColor?: ColorToken // color of the initials / fallback glyph
  gradient?: boolean // spec violet-gradient avatar (overrides background)
}

// Spec: header .av 36 · profile .av2 46 — × device scale.
const diameters: Record<Size, number> = {
  sm: 36,
  md: 44,
  lg: 58,
}

// type is inferred from which prop you pass: uri -> photo, initials -> initials, else icon.
const Avatar = ({ size = 'md', uri, initials, iconName, background = 'accentSoft', textColor = 'primary', gradient = false }: Props) => {
  const d = diameters[size]
  const base = { width: d, height: d, borderRadius: radius.full }

  if (uri) {
    return <Image source={{ uri }} style={base} />
  }

  const glowColor = gradient ? 'rgba(109,92,255,0.9)' : colors[background]

  return (
    <View
      style={[
        base,
        styles.center,
        {
          backgroundColor: gradient ? 'transparent' : colors[background],
          // soft glow in the avatar's own color (artifact treatment)
          shadowColor: glowColor,
          shadowOpacity: 0.5,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 6,
        },
      ]}
    >
      {gradient && (
        <LinearGradient
          colors={[...AVATAR_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.full }]}
          pointerEvents="none"
        />
      )}
      {initials ? (
        <AppText weight="bold" size={size === 'lg' ? 'lg' : 'sm'} color={gradient ? 'surface' : textColor}>
          {initials.slice(0, 2).toUpperCase()}
        </AppText>
      ) : (
        <Icon name={iconName ?? 'home'} size={d * 0.5} color={gradient ? 'surface' : textColor} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
})

export default Avatar
