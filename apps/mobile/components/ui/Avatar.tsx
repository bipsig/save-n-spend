import { Image, StyleSheet, View } from 'react-native'
import { AppText } from './AppText'
import Icon from './Icon'
import { colors, radius } from '@/theme'
import type { ColorToken } from '@/theme'
import type { IconName } from '@/lib/icons'

type Size = 'sm' | 'md' | 'lg'

type Props = {
  size?: Size
  uri?: string // photo
  initials?: string // e.g. "JD"
  iconName?: IconName // fallback glyph
  background?: ColorToken
}

const diameters: Record<Size, number> = {
  sm: 32,
  md: 44,
  lg: 64,
}

// type is inferred from which prop you pass: uri -> photo, initials -> initials, else icon.
const Avatar = ({ size = 'md', uri, initials, iconName, background = 'accentSoft' }: Props) => {
  const d = diameters[size]
  const base = { width: d, height: d, borderRadius: radius.full }

  if (uri) {
    return <Image source={{ uri }} style={base} />
  }

  return (
    <View style={[base, styles.center, { backgroundColor: colors[background] }]}>
      {initials ? (
        <AppText weight="bold" size={size === 'lg' ? 'lg' : 'sm'} color="primary">
          {initials.slice(0, 2).toUpperCase()}
        </AppText>
      ) : (
        <Icon name={iconName ?? 'home'} size={d * 0.5} color="primary" />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
})

export default Avatar
