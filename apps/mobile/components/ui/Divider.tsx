import { StyleSheet, View } from 'react-native'
import { colors } from '@/theme'
import type { ColorToken } from '@/theme'

type Props = {
  orientation?: 'horizontal' | 'vertical'
  color?: ColorToken
}

const Divider = ({ orientation = 'horizontal', color = 'line' }: Props) => {
  return (
    <View
      style={[
        orientation === 'horizontal' ? styles.horizontal : styles.vertical,
        { backgroundColor: colors[color] },
      ]}
    />
  )
}

const styles = StyleSheet.create({
  // hairlineWidth = the thinnest line the device can render (≈0.5px on retina).
  horizontal: { height: StyleSheet.hairlineWidth, width: '100%' },
  vertical: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
})

export default Divider
